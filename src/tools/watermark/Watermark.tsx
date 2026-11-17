import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Droplet, FolderArchive, ImagePlus, X } from 'lucide-react';
import { Button, ColorWell, Segmented, Slider, ToggleRow } from '../../components/ui/controls';
import { createCanvas, ctx2d } from '../../engine/images';
import { encodeCanvas, FORMATS, withExtension, type OutFormat } from '../shared/encode';
import { formatFromType, loadImage, releaseImage, type LoadedImage } from '../shared/files';
import { errorMessage, runBatch } from '../shared/batch';
import { createZip } from '../shared/zip';
import { BatchList } from '../shared/BatchList';
import { Dropzone, FileRow, Notice, PanelSection, pickFiles, ProgressBar, saveBlob, Spinner, Stage, ToolLayout, useFileSink, useImageList } from '../shared/ui';
import { applyWatermark, type WatermarkOptions, type WatermarkPosition } from './render';

const POSITIONS: WatermarkPosition[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];

export default function Watermark() {
  const list = useImageList({ multiple: true });
  useFileSink(list.add);
  const [kind, setKind] = useState<'text' | 'logo'>('text');
  const [text, setText] = useState('© Your name');
  const [color, setColor] = useState('#ffffff');
  const [logo, setLogo] = useState<LoadedImage | null>(null);
  const [size, setSize] = useState(6);
  const [opacity, setOpacity] = useState(70);
  const [position, setPosition] = useState<WatermarkPosition>('br');
  const [tile, setTile] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [shadow, setShadow] = useState(true);
  const [format, setFormat] = useState<OutFormat | 'keep'>('keep');
  const [running, setRunning] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const preview = useRef<HTMLCanvasElement>(null);

  useEffect(() => () => releaseImage(logo), [logo]);

  const opts: WatermarkOptions = useMemo(
    () => ({ kind, text, color, logo: logo?.source ?? null, size, opacity: opacity / 100, position, tile, rotation, shadow }),
    [kind, text, color, logo, size, opacity, position, tile, rotation, shadow],
  );
  const current = list.items.find((i) => i.id === selectedId) ?? list.items[0] ?? null;

  useEffect(() => {
    const c = preview.current;
    if (!c || !current) return;
    const scale = Math.min(1, 1400 / Math.max(current.width, current.height));
    const w = Math.round(current.width * scale);
    const h = Math.round(current.height * scale);
    c.width = w;
    c.height = h;
    const ctx = ctx2d(c);
    ctx.drawImage(current.source, 0, 0, w, h);
    applyWatermark(ctx, w, h, opts);
  }, [current, opts]);

  const outFormat = (img: LoadedImage): OutFormat => (format === 'keep' ? formatFromType(img.type) ?? 'png' : format);

  const run = async (single?: LoadedImage) => {
    setRunning(true);
    setError(null);
    setDoneCount(0);
    const items = single ? [single] : list.items;
    const outputs: { name: string; blob: Blob }[] = [];
    await runBatch(
      items,
      async (img) => {
        const c = createCanvas(img.width, img.height);
        const ctx = ctx2d(c);
        ctx.drawImage(img.source, 0, 0);
        applyWatermark(ctx, img.width, img.height, opts);
        try {
          const f = outFormat(img);
          return { name: withExtension(img.name, f), blob: (await encodeCanvas(c, f, 92)).blob };
        } finally {
          c.width = c.height = 0;
        }
      },
      {
        concurrency: 2,
        onDone: (_, res) => {
          outputs.push(res);
          setDoneCount((n) => n + 1);
        },
        onError: (_, err) => setError(errorMessage(err)),
      },
    );
    if (outputs.length === 1) await saveBlob(outputs[0].blob, outputs[0].name);
    else if (outputs.length) await saveBlob(await createZip(outputs), 'watermarked.zip');
    setRunning(false);
  };

  const pickLogo = () =>
    pickFiles(false, async (files) => {
      if (!files[0]) return;
      try {
        setLogo(await loadImage(files[0]));
      } catch (err) {
        setError(errorMessage(err));
      }
    });

  const main = list.items.length ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <Stage>
        <canvas ref={preview} className="max-h-full max-w-full rounded-[6px] shadow-[0_8px_30px_rgba(0,0,0,0.18)]" />
      </Stage>
      <div className="max-h-[38%] shrink-0 border-t border-line">
        <BatchList items={list.items} loading={list.loading} onAdd={list.add} onClear={list.clear} className="pt-2">
          {list.items.map((img) => (
            <div key={img.id} onClick={() => setSelectedId(img.id)} className={img.id === current?.id ? 'rounded-[10px] ring-1 ring-accent' : ''}>
              <FileRow
                img={img}
                onRemove={() => list.remove(img.id)}
                status={<span className="text-subtle">{img.width}×{img.height}</span>}
                right={
                  <button type="button" aria-label={`Download ${img.name} with watermark`} onClick={(e) => (e.stopPropagation(), void run(img))} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-muted hover:bg-hover hover:text-fg">
                    <Download size={14} />
                  </button>
                }
              />
            </div>
          ))}
        </BatchList>
      </div>
    </div>
  ) : (
    <Dropzone multiple onFiles={list.add} title="Drop images to watermark" icon={<Droplet size={20} />} />
  );

  return (
    <ToolLayout
      main={main}
      panel={
        <>
          <PanelSection title="Watermark">
            <Segmented ariaLabel="Watermark type" value={kind} onChange={setKind} options={[{ value: 'text', label: 'Text' }, { value: 'logo', label: 'Logo' }]} />
            {kind === 'text' ? (
              <>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  aria-label="Watermark text"
                  className="h-8 rounded-[7px] bg-control px-2.5 text-sm text-fg outline-none ring-accent focus:ring-1"
                />
                <ColorWell label="Text color" value={color} onChange={setColor} />
              </>
            ) : logo ? (
              <div className="flex items-center gap-2 text-xs text-muted">
                <img src={logo.url} alt="" className="h-10 w-10 rounded-[6px] border border-line object-contain" />
                <span className="min-w-0 flex-1 truncate">{logo.name}</span>
                <button type="button" aria-label="Remove logo" onClick={() => setLogo(null)} className="flex h-7 w-7 items-center justify-center rounded-[6px] hover:bg-hover">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <Button onClick={pickLogo}>
                <ImagePlus size={14} /> Choose logo
              </Button>
            )}
          </PanelSection>
          <PanelSection title="Placement">
            {!tile && (
              <div role="radiogroup" aria-label="Position" className="grid w-[96px] grid-cols-3 gap-1">
                {POSITIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={position === p}
                    aria-label={`Position ${p}`}
                    onClick={() => setPosition(p)}
                    className={`h-7 rounded-[5px] border ${position === p ? 'border-accent bg-accent-fill' : 'border-line bg-control hover:bg-hover'}`}
                  />
                ))}
              </div>
            )}
            <ToggleRow label="Tile across the image" checked={tile} onChange={setTile} />
            <Slider label="Size" value={size} min={1} max={30} unit="%" onChange={(v) => setSize(Math.round(v))} />
            <Slider label="Opacity" value={opacity} min={5} max={100} unit="%" onChange={(v) => setOpacity(Math.round(v))} />
            <Slider label="Rotation" value={rotation} min={-90} max={90} unit="°" onChange={(v) => setRotation(Math.round(v))} />
            <ToggleRow label="Soft shadow" checked={shadow} onChange={setShadow} />
          </PanelSection>
          <PanelSection title="Output">
            <Segmented<OutFormat | 'keep'>
              ariaLabel="Output format"
              value={format}
              onChange={setFormat}
              options={[{ value: 'keep', label: 'Same' }, ...(['png', 'jpeg', 'webp'] as OutFormat[]).map((f) => ({ value: f, label: FORMATS[f].label }))]}
            />
          </PanelSection>
          {error && (
            <div className="px-4 py-3">
              <Notice tone="error" onClose={() => setError(null)}>
                {error}
              </Notice>
            </div>
          )}
        </>
      }
      footer={
        <>
          {running && <ProgressBar value={list.items.length ? doneCount / list.items.length : null} label={<span>Watermarking… {doneCount}/{list.items.length}</span>} />}
          <Button variant="primary" className="h-8" disabled={!list.items.length || running || (kind === 'logo' && !logo) || (kind === 'text' && !text.trim())} onClick={() => void run()}>
            {running ? <Spinner size={13} /> : list.items.length > 1 ? <FolderArchive size={14} /> : <Download size={14} />}
            {list.items.length > 1 ? `Watermark ${list.items.length} images (ZIP)` : 'Watermark and download'}
          </Button>
        </>
      }
    />
  );
}

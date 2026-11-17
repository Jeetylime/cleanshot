import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, LayoutGrid } from 'lucide-react';
import { Button, ColorWell, NumberInput, Segmented, Slider } from '../../components/ui/controls';
import { createCanvas, ctx2d } from '../../engine/images';
import { showToast } from '../../store/actions';
import { encodeCanvas, FORMATS, type OutFormat } from '../shared/encode';
import { errorMessage } from '../shared/batch';
import { BatchList } from '../shared/BatchList';
import { Dropzone, FileRow, PanelSection, saveBlob, Spinner, Stage, ToolLayout, useFileSink, useImageList, type LoadedImage } from '../shared/ui';

type Fit = 'cover' | 'contain';

interface Layout {
  cols: number;
  width: number;
  /** Cell aspect ratio (w/h). */
  cell: number;
  gap: number;
  radius: number;
  background: string;
  fit: Fit;
}

const RATIOS = [
  { value: '1', label: '1:1' },
  { value: '1.333', label: '4:3' },
  { value: '0.75', label: '3:4' },
  { value: '1.778', label: '16:9' },
];

/** Paint a uniform grid collage. Width is the output width in pixels; gap and radius are in % of a cell's width. */
export function drawCollage(items: LoadedImage[], l: Layout, scale = 1): HTMLCanvasElement {
  const cols = Math.max(1, Math.min(l.cols, items.length));
  const rows = Math.ceil(items.length / cols);
  const W = Math.round(l.width * scale);
  const gap = Math.round((W / cols) * (l.gap / 100));
  const cw = (W - gap * (cols + 1)) / cols;
  const ch = cw / l.cell;
  const H = Math.round(rows * ch + gap * (rows + 1));
  const c = createCanvas(W, H);
  const ctx = ctx2d(c);
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = l.background;
  ctx.fillRect(0, 0, W, H);
  const r = (cw * l.radius) / 100;
  items.forEach((img, i) => {
    const x = gap + (i % cols) * (cw + gap);
    const y = gap + Math.floor(i / cols) * (ch + gap);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, cw, ch, r);
    ctx.clip();
    const s = l.fit === 'cover' ? Math.max(cw / img.width, ch / img.height) : Math.min(cw / img.width, ch / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    ctx.drawImage(img.source, x + (cw - dw) / 2, y + (ch - dh) / 2, dw, dh);
    ctx.restore();
  });
  return c;
}

export default function Collage() {
  const list = useImageList({ multiple: true });
  useFileSink(list.add);
  const [cols, setCols] = useState(3);
  const [width, setWidth] = useState(2400);
  const [ratio, setRatio] = useState('1');
  const [gap, setGap] = useState(3);
  const [radius, setRadius] = useState(4);
  const [background, setBackground] = useState('#ffffff');
  const [fit, setFit] = useState<Fit>('cover');
  const [format, setFormat] = useState<OutFormat>('jpeg');
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);

  const layout: Layout = useMemo(() => ({ cols, width, cell: Number(ratio), gap, radius, background, fit }), [cols, width, ratio, gap, radius, background, fit]);

  useEffect(() => {
    const target = preview.current;
    if (!target || !list.items.length) return;
    const c = drawCollage(list.items, layout, Math.min(1, 1200 / layout.width));
    target.width = c.width;
    target.height = c.height;
    ctx2d(target).drawImage(c, 0, 0);
    c.width = c.height = 0;
  }, [list.items, layout]);

  const download = async () => {
    setBusy(true);
    try {
      const c = drawCollage(list.items, layout);
      const { blob, format: f } = await encodeCanvas(c, format, 92, background);
      c.width = c.height = 0;
      await saveBlob(blob, `collage.${FORMATS[f].ext}`);
    } catch (err) {
      showToast(`Couldn’t export collage: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const move = list.move;

  const main = list.items.length ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <Stage>
        <canvas ref={preview} className="max-h-full max-w-full rounded-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.18)]" />
      </Stage>
      <div className="max-h-[34%] shrink-0 border-t border-line">
        <BatchList items={list.items} loading={list.loading} onAdd={list.add} onClear={list.clear} className="pt-2">
          {list.items.map((img, i) => (
            <FileRow
              key={img.id}
              img={img}
              onRemove={() => list.remove(img.id)}
              status={<span className="text-subtle">Cell {i + 1}</span>}
              right={
                (
                  <span className="flex gap-0.5 text-xs">
                    <button type="button" aria-label={`Move ${img.name} earlier`} disabled={i === 0} onClick={() => move(img.id, -1)} className="h-7 w-7 rounded-[6px] text-muted hover:bg-hover disabled:opacity-30">↑</button>
                    <button type="button" aria-label={`Move ${img.name} later`} disabled={i === list.items.length - 1} onClick={() => move(img.id, 1)} className="h-7 w-7 rounded-[6px] text-muted hover:bg-hover disabled:opacity-30">↓</button>
                  </span>
                )
              }
            />
          ))}
        </BatchList>
      </div>
    </div>
  ) : (
    <Dropzone multiple onFiles={list.add} title="Drop photos for a collage" icon={<LayoutGrid size={20} />} />
  );

  return (
    <ToolLayout
      main={main}
      panel={
        <>
          <PanelSection title="Grid">
            <Slider label="Columns" value={cols} min={1} max={8} onChange={(v) => setCols(Math.round(v))} />
            <span className="text-xs text-muted">Cell shape</span>
            <Segmented ariaLabel="Cell aspect ratio" value={ratio} onChange={setRatio} options={RATIOS} />
            <Segmented<Fit> ariaLabel="Image fit" value={fit} onChange={setFit} options={[{ value: 'cover', label: 'Fill cell' }, { value: 'contain', label: 'Fit whole image' }]} />
          </PanelSection>
          <PanelSection title="Style">
            <Slider label="Spacing" value={gap} min={0} max={15} unit="%" onChange={(v) => setGap(Math.round(v * 2) / 2)} />
            <Slider label="Corner radius" value={radius} min={0} max={50} unit="%" onChange={(v) => setRadius(Math.round(v))} />
            <ColorWell label="Background" value={background} onChange={setBackground} />
          </PanelSection>
          <PanelSection title="Output">
            <NumberInput ariaLabel="Output width" prefix="W" suffix="px" value={width} min={200} max={8000} onChange={setWidth} />
            <Segmented<OutFormat> ariaLabel="Output format" value={format} onChange={setFormat} options={(['jpeg', 'png', 'webp'] as OutFormat[]).map((f) => ({ value: f, label: FORMATS[f].label }))} />
          </PanelSection>
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={list.items.length < 1 || busy} onClick={() => void download()}>
          {busy ? <Spinner size={13} /> : <Download size={14} />} Download collage
        </Button>
      }
    />
  );
}

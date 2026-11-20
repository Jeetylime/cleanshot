import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, SlidersHorizontal } from 'lucide-react';
import { Button, Segmented, Slider } from '../../components/ui/controls';
import { createCanvas, ctx2d } from '../../engine/images';
import { showToast } from '../../store/actions';
import { encodeCanvas, FORMATS, type OutFormat } from '../shared/encode';
import { baseName, formatFromType } from '../shared/files';
import { errorMessage, runBatch } from '../shared/batch';
import { createZip } from '../shared/zip';
import { BatchList } from '../shared/BatchList';
import { Advanced, Dropzone, FileRow, PanelSection, saveBlob, Spinner, Stage, ToolLayout, useFileSink, useImageList, type LoadedImage } from '../shared/ui';
import { applyAdjustments, FILTER_PRESETS, NEUTRAL, type Adjustments } from './adjust';

function process(img: LoadedImage, adj: Adjustments, maxSide = Infinity): HTMLCanvasElement {
  const k = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = createCanvas(Math.max(1, Math.round(img.width * k)), Math.max(1, Math.round(img.height * k)));
  const ctx = ctx2d(c, { willReadFrequently: true });
  ctx.drawImage(img.source, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  applyAdjustments(d.data, c.width, c.height, adj, 7);
  ctx.putImageData(d, 0, 0);
  return c;
}

const SLIDERS: { key: keyof Adjustments; label: string; min: number; max: number }[] = [
  { key: 'exposure', label: 'Exposure', min: -100, max: 100 },
  { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100 },
  { key: 'shadows', label: 'Shadows', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
  { key: 'vibrance', label: 'Vibrance', min: -100, max: 100 },
  { key: 'warmth', label: 'Warmth', min: -100, max: 100 },
  { key: 'tint', label: 'Tint', min: -100, max: 100 },
];
const EFFECTS: { key: keyof Adjustments; label: string; min: number; max: number }[] = [
  { key: 'hue', label: 'Hue shift', min: -180, max: 180 },
  { key: 'fade', label: 'Fade', min: 0, max: 100 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 100 },
  { key: 'grain', label: 'Grain', min: 0, max: 100 },
  { key: 'grayscale', label: 'Black & white', min: 0, max: 100 },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100 },
];

export default function Filters() {
  const list = useImageList({ multiple: true });
  useFileSink(list.add);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = list.items.find((i) => i.id === activeId) ?? list.items[0] ?? null;
  const [adj, setAdj] = useState<Adjustments>(NEUTRAL);
  const [preset, setPreset] = useState('none');
  const [format, setFormat] = useState<OutFormat | 'same'>('same');
  const [busy, setBusy] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const shown = useMemo(() => (showOriginal ? NEUTRAL : adj), [showOriginal, adj]);

  useEffect(() => {
    const t = preview.current;
    if (!t || !active) return;
    const id = requestAnimationFrame(() => {
      const c = process(active, shown, 1100);
      t.width = c.width;
      t.height = c.height;
      ctx2d(t).drawImage(c, 0, 0);
      c.width = c.height = 0;
    });
    return () => cancelAnimationFrame(id);
  }, [active, shown]);

  const set = (key: keyof Adjustments, v: number) => {
    setAdj((a) => ({ ...a, [key]: Math.round(v) }));
    setPreset('custom');
  };

  const download = async () => {
    setBusy(true);
    try {
      const files: { name: string; blob: Blob }[] = [];
      await runBatch(
        list.items,
        async (img) => {
          const c = process(img, adj);
          const f: OutFormat = format === 'same' ? formatFromType(img.type) ?? 'png' : format;
          const r = await encodeCanvas(c, f, 92);
          c.width = c.height = 0;
          files.push({ name: `${baseName(img.name)}.${FORMATS[r.format].ext}`, blob: r.blob });
        },
        { concurrency: 1, onError: (_i, err) => showToast(errorMessage(err), 'error') },
      );
      if (files.length === 1) await saveBlob(files[0].blob, files[0].name);
      else if (files.length) await saveBlob(await createZip(files), 'filtered.zip');
    } finally {
      setBusy(false);
    }
  };

  const main = active ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <Stage>
        <canvas
          ref={preview}
          className="max-h-full max-w-full cursor-pointer rounded-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.18)]"
          title="Hold to see the original"
          onPointerDown={() => setShowOriginal(true)}
          onPointerUp={() => setShowOriginal(false)}
          onPointerLeave={() => setShowOriginal(false)}
        />
      </Stage>
      {list.items.length > 1 && (
        <div className="max-h-[30%] shrink-0 border-t border-line">
          <BatchList items={list.items} loading={list.loading} onAdd={list.add} onClear={list.clear} className="pt-2">
            {list.items.map((img) => (
              <FileRow key={img.id} img={img} selected={img.id === active.id} onSelect={() => setActiveId(img.id)} onRemove={() => list.remove(img.id)} status={<span className="text-subtle">{img.width}×{img.height}</span>} />
            ))}
          </BatchList>
        </div>
      )}
    </div>
  ) : (
    <Dropzone multiple onFiles={list.add} title="Drop photos to adjust" hint="Light, color and film looks. The same settings apply to every photo." icon={<SlidersHorizontal size={20} />} />
  );

  return (
    <ToolLayout
      main={main}
      panel={
        <>
          <PanelSection title="Looks">
            <div className="grid grid-cols-3 gap-1.5">
              {FILTER_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={preset === p.id}
                  onClick={() => {
                    setAdj({ ...NEUTRAL, ...p.adj });
                    setPreset(p.id);
                  }}
                  className={`h-[28px] rounded-[7px] text-xs font-medium transition-colors ${preset === p.id ? 'bg-accent-soft text-fg ring-1 ring-accent' : 'bg-control text-muted hover:bg-hover hover:text-fg'}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </PanelSection>
          <PanelSection title="Adjust" aside={<button type="button" className="h-[24px] text-xs font-medium text-accent hover:underline" onClick={() => (setAdj(NEUTRAL), setPreset('none'))}>Reset</button>}>
            {SLIDERS.map((s) => (
              <Slider key={s.key} label={s.label} value={adj[s.key]} min={s.min} max={s.max} onChange={(v) => set(s.key, v)} />
            ))}
            <Advanced title="Effects">
              {EFFECTS.map((s) => (
                <Slider key={s.key} label={s.label} value={adj[s.key]} min={s.min} max={s.max} unit={s.key === 'hue' ? '°' : ''} onChange={(v) => set(s.key, v)} />
              ))}
            </Advanced>
            <p className="text-2xs text-subtle">Press and hold the image to compare with the original.</p>
          </PanelSection>
          <PanelSection title="Output">
            <Segmented<OutFormat | 'same'>
              ariaLabel="Output format"
              value={format}
              onChange={setFormat}
              options={[{ value: 'same', label: 'Same' }, ...(['jpeg', 'png', 'webp'] as OutFormat[]).map((f) => ({ value: f, label: FORMATS[f].label }))]}
            />
          </PanelSection>
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={!list.items.length || busy} onClick={() => void download()}>
          {busy ? <Spinner size={13} /> : <Download size={14} />} Download {list.items.length > 1 ? `${list.items.length} photos` : 'photo'}
        </Button>
      }
    />
  );
}

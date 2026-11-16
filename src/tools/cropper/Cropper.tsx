import { useEffect, useRef, useState } from 'react';
import { Copy, Crop, Download, FlipHorizontal2, FlipVertical2, PenTool, RotateCcw, RotateCw, LayoutTemplate } from 'lucide-react';
import { sendToCanvas } from '../../studio/handoff';
import { Button, NumberInput, Toggle } from '../../components/ui/controls';
import { Tooltip } from '../../components/ui/Tooltip';
import type { Rect } from '../../types';
import type { HandleId } from '../../engine/annotations';
import { cropMove, cropResize, rectFromAnchor } from '../../canvas/crop';
import { openImageBlob } from '../../store/actions';
import { goEditor } from '../../app/route';
import { encodeCanvas, withExtension } from '../shared/encode';
import { toCanvas, baseName } from '../shared/files';
import { cropCanvas, fitRatio, flipCanvas, renderResized, rotateCanvas } from '../shared/geometry';
import { OutputOptions, resolveFormat, type OutChoice } from '../shared/OutputOptions';
import { copyImage, Dropzone, PanelSection, saveBlob, ToolLayout, useFileSink, useImageList } from '../shared/ui';
import { errorMessage } from '../shared/batch';
import { showToast } from '../../store/actions';

interface AspectPreset {
  id: string;
  label: string;
  ratio: number | null | 'original';
  out?: { w: number; h: number };
}

const SHAPES: AspectPreset[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: 'original', label: 'Original', ratio: 'original' },
  { id: '1:1', label: 'Square', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '3:4', label: '3:4', ratio: 3 / 4 },
  { id: '2:3', label: '2:3', ratio: 2 / 3 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '21:9', label: '21:9', ratio: 21 / 9 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
];

const SOCIAL: AspectPreset[] = [
  { id: 'ig-post', label: 'Instagram post', ratio: 1, out: { w: 1080, h: 1080 } },
  { id: 'ig-portrait', label: 'Instagram portrait', ratio: 4 / 5, out: { w: 1080, h: 1350 } },
  { id: 'story', label: 'Story / Reel', ratio: 9 / 16, out: { w: 1080, h: 1920 } },
  { id: 'x-post', label: 'X post', ratio: 16 / 9, out: { w: 1600, h: 900 } },
  { id: 'li-post', label: 'LinkedIn post', ratio: 1200 / 627, out: { w: 1200, h: 627 } },
  { id: 'yt', label: 'YouTube thumbnail', ratio: 16 / 9, out: { w: 1280, h: 720 } },
  { id: 'fb-cover', label: 'Facebook cover', ratio: 851 / 315, out: { w: 851, h: 315 } },
  { id: 'pin', label: 'Pinterest pin', ratio: 2 / 3, out: { w: 1000, h: 1500 } },
];

const ALL = [...SHAPES, ...SOCIAL];

export default function Cropper() {
  const list = useImageList({ multiple: false });
  useFileSink(list.add);
  const img = list.items[0] ?? null;
  const [work, setWork] = useState<HTMLCanvasElement | null>(null);
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, w: 1, h: 1 });
  const [presetId, setPresetId] = useState('free');
  const [useOut, setUseOut] = useState(true);
  const [format, setFormat] = useState<OutChoice>('original');
  const [quality, setQuality] = useState(92);
  const [busy, setBusy] = useState(false);

  const preset = ALL.find((p) => p.id === presetId)!;
  const ratio = (src: HTMLCanvasElement | null = work) =>
    preset.ratio === 'original' ? (img ? img.width / img.height : null) : preset.ratio ?? (src ? null : null);

  useEffect(() => {
    if (!img) {
      setWork(null);
      return;
    }
    const c = toCanvas(img.source);
    setWork(c);
    setRect({ x: 0, y: 0, w: c.width, h: c.height });
    setPresetId('free');
  }, [img]);

  const applyPreset = (id: string) => {
    setPresetId(id);
    const p = ALL.find((x) => x.id === id)!;
    if (!work) return;
    const r = p.ratio === 'original' ? (img ? img.width / img.height : null) : p.ratio;
    if (r) setRect(fitRatio({ x: 0, y: 0, w: work.width, h: work.height }, r));
  };

  const transform = (fn: (c: HTMLCanvasElement) => HTMLCanvasElement, mapRect: (r: Rect, W: number, H: number) => Rect) => {
    if (!work) return;
    const next = fn(work);
    let r = mapRect(rect, work.width, work.height);
    const rr = ratio(next);
    if (rr) r = fitRatio(r, rr);
    setWork(next);
    setRect(r);
  };
  const rotate = (dir: 1 | -1) =>
    transform(
      (c) => rotateCanvas(c, dir),
      (r, W, H) => (dir === 1 ? { x: H - (r.y + r.h), y: r.x, w: r.h, h: r.w } : { x: r.y, y: W - (r.x + r.w), w: r.h, h: r.w }),
    );
  const flip = (axis: 'h' | 'v') =>
    transform(
      (c) => flipCanvas(c, axis),
      (r, W, H) => (axis === 'h' ? { ...r, x: W - (r.x + r.w) } : { ...r, y: H - (r.y + r.h) }),
    );

  // --- Interaction -------------------------------------------------------
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: 'move' | 'new' | HandleId; origin: { x: number; y: number }; orig: Rect } | null>(null);
  const toImage = (e: { clientX: number; clientY: number }) => {
    const b = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(work!.width, Math.max(0, ((e.clientX - b.left) / b.width) * work!.width)),
      y: Math.min(work!.height, Math.max(0, ((e.clientY - b.top) / b.height) * work!.height)),
    };
  };
  const onDown = (e: React.PointerEvent, mode?: HandleId) => {
    if (!work) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = toImage(e);
    const inside = p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
    drag.current = { mode: mode ?? (inside ? 'move' : 'new'), origin: p, orig: rect };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !work) return;
    const p = toImage(e);
    const r = ratio() ?? (e.shiftKey ? d.orig.w / d.orig.h : null);
    let next: Rect;
    if (d.mode === 'move') next = cropMove(d.orig, p.x - d.origin.x, p.y - d.origin.y, work.width, work.height);
    else if (d.mode === 'new') next = rectFromAnchor(d.origin, p, r, work.width, work.height);
    else next = cropResize(d.orig, d.mode, p, r, work.width, work.height);
    if (next.w >= 2 && next.h >= 2) setRect(next);
  };
  const onUp = () => (drag.current = null);

  // --- Live preview of the result ---------------------------------------
  const previewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = previewRef.current;
    if (!host || !work) return;
    const raf = requestAnimationFrame(() => {
      const k = Math.min(1, 236 / rect.w, 160 / rect.h);
      const c = renderResized(cropCanvas(work, rect), rect.w * k, rect.h * k, 'stretch');
      c.className = 'max-w-full rounded-[4px] cs-checker shadow-soft';
      host.replaceChildren(c);
    });
    return () => cancelAnimationFrame(raf);
  }, [work, rect]);

  const outSize = useOut && preset.out ? preset.out : { w: Math.round(rect.w), h: Math.round(rect.h) };

  const render = async () => {
    const cropped = cropCanvas(work!, rect);
    const canvas = useOut && preset.out ? renderResized(cropped, preset.out.w, preset.out.h, 'cover') : cropped;
    const f = resolveFormat(format, img!.type);
    return encodeCanvas(canvas, f, quality);
  };
  const doExport = async (kind: 'save' | 'copy' | 'editor' | 'canvas') => {
    if (!work || !img) return;
    setBusy(true);
    try {
      const { blob, format: f } = await render();
      const name = `${baseName(img.name)}-cropped`;
      if (kind === 'save') await saveBlob(blob, withExtension(name, f));
      else if (kind === 'copy') await copyImage(blob);
      else if (kind === 'canvas') sendToCanvas(blob, withExtension(name, f));
      else {
        goEditor();
        await openImageBlob(blob, withExtension(name, f));
      }
    } catch (err) {
      showToast(`Export failed: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!img || !work) {
    return <ToolLayout main={<Dropzone onFiles={list.add} title="Drop an image to crop" icon={<Crop size={20} />} />} panel={<Intro />} />;
  }

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const handles: [HandleId, string][] = [
    ['nw', 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize'],
    ['ne', 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize'],
    ['se', 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize'],
    ['sw', 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize'],
    ['n', 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize'],
    ['s', 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize'],
    ['e', 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize'],
    ['w', 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize'],
  ];

  return (
    <ToolLayout
      main={
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center p-8" style={{ containerType: 'size' }}>
            <div
              ref={boxRef}
              data-testid="crop-stage"
              className="relative touch-none overflow-hidden select-none"
              style={{ aspectRatio: `${work.width} / ${work.height}`, width: `min(100cqw, calc(100cqh * ${work.width / work.height}))` }}
              onPointerDown={(e) => onDown(e)}
              onPointerMove={onMove}
              onPointerUp={onUp}
            >
              <CanvasView canvas={work} />
              <div
                className="absolute cursor-move outline outline-1 outline-white/90"
                style={{
                  left: pct(rect.x, work.width),
                  top: pct(rect.y, work.height),
                  width: pct(rect.w, work.width),
                  height: pct(rect.h, work.height),
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
                }}
              >
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <span key={i} className="border-white/25 [&:not(:nth-child(3n))]:border-r [&:nth-child(-n+6)]:border-b" />
                  ))}
                </div>
                {handles.map(([id, cls]) => (
                  <span
                    key={id}
                    onPointerDown={(e) => onDown(e, id)}
                    className={`absolute h-3 w-3 rounded-[3px] border border-black/20 bg-white shadow ${cls}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-center gap-1 border-t border-line bg-panel px-4 py-2">
            {[
              { label: 'Rotate left', icon: RotateCcw, run: () => rotate(-1) },
              { label: 'Rotate right', icon: RotateCw, run: () => rotate(1) },
              { label: 'Flip horizontal', icon: FlipHorizontal2, run: () => flip('h') },
              { label: 'Flip vertical', icon: FlipVertical2, run: () => flip('v') },
            ].map((b) => (
              <Tooltip key={b.label} label={b.label} side="top">
                <button
                  type="button"
                  aria-label={b.label}
                  onClick={b.run}
                  className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted hover:bg-hover hover:text-fg"
                >
                  <b.icon size={16} />
                </button>
              </Tooltip>
            ))}
            <span className="mx-2 h-4 w-px bg-line-strong" />
            <button
              type="button"
              onClick={() => setRect({ x: 0, y: 0, w: work.width, h: work.height })}
              className="h-8 rounded-[8px] px-2.5 text-xs font-medium text-muted hover:bg-hover hover:text-fg"
            >
              Reset crop
            </button>
            <button
              type="button"
              onClick={() => list.clear()}
              className="h-8 rounded-[8px] px-2.5 text-xs font-medium text-muted hover:bg-hover hover:text-fg"
            >
              New image
            </button>
          </div>
        </div>
      }
      panel={
        <>
          <PanelSection title="Shape">
            <div className="grid grid-cols-4 gap-1">
              {SHAPES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={presetId === p.id}
                  onClick={() => applyPreset(p.id)}
                  className={`h-7 rounded-[6px] text-xs font-medium transition-colors ${
                    presetId === p.id ? 'bg-accent-soft text-accent ring-1 ring-accent' : 'bg-control text-muted hover:bg-hover hover:text-fg'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </PanelSection>
          <PanelSection title="Social media">
            <div className="flex flex-col gap-0.5">
              {SOCIAL.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={presetId === p.id}
                  onClick={() => applyPreset(p.id)}
                  className={`flex h-7 items-center justify-between rounded-[6px] px-2 text-xs transition-colors ${
                    presetId === p.id ? 'bg-accent-soft text-fg ring-1 ring-accent' : 'text-muted hover:bg-hover hover:text-fg'
                  }`}
                >
                  <span>{p.label}</span>
                  <span className="text-subtle tabular-nums">
                    {p.out!.w}×{p.out!.h}
                  </span>
                </button>
              ))}
            </div>
            {preset.out && (
              <label className="flex items-center justify-between text-xs text-muted">
                <span>
                  Export at {preset.out.w}×{preset.out.h}
                </span>
                <Toggle checked={useOut} onChange={setUseOut} label="Export at preset size" />
              </label>
            )}
          </PanelSection>
          <PanelSection title="Selection">
            <div className="grid grid-cols-2 gap-1.5">
              <NumberInput ariaLabel="Crop X" prefix="X" value={rect.x} min={0} max={work.width - 1} onChange={(x) => setRect(cropMove({ ...rect, x }, 0, 0, work.width, work.height))} />
              <NumberInput ariaLabel="Crop Y" prefix="Y" value={rect.y} min={0} max={work.height - 1} onChange={(y) => setRect(cropMove({ ...rect, y }, 0, 0, work.width, work.height))} />
              <NumberInput
                ariaLabel="Crop width"
                prefix="W"
                value={rect.w}
                min={2}
                max={work.width}
                onChange={(w) => {
                  const r = ratio();
                  setRect(cropMove({ ...rect, w: Math.min(w, work.width), h: r ? Math.min(work.height, w / r) : rect.h }, 0, 0, work.width, work.height));
                }}
              />
              <NumberInput
                ariaLabel="Crop height"
                prefix="H"
                value={rect.h}
                min={2}
                max={work.height}
                onChange={(h) => {
                  const r = ratio();
                  setRect(cropMove({ ...rect, h: Math.min(h, work.height), w: r ? Math.min(work.width, h * r) : rect.w }, 0, 0, work.width, work.height));
                }}
              />
            </div>
          </PanelSection>
          <PanelSection title="Preview" aside={<span className="text-xs text-muted tabular-nums">{outSize.w} × {outSize.h}</span>}>
            <div ref={previewRef} className="flex min-h-[80px] items-center justify-center" data-testid="crop-preview" />
          </PanelSection>
          <PanelSection title="Export">
            <OutputOptions format={format} quality={quality} onFormat={setFormat} onQuality={setQuality} allowOriginal />
          </PanelSection>
        </>
      }
      footer={
        <>
          <Button variant="primary" className="h-8" disabled={busy} onClick={() => void doExport('save')}>
            <Download size={14} /> Download
          </Button>
          <div className="flex gap-2">
            <Button className="h-8 flex-1" disabled={busy} onClick={() => void doExport('copy')}>
              <Copy size={13} /> Copy
            </Button>
            <Button className="h-8 flex-1" disabled={busy} onClick={() => void doExport('editor')} title="Annotate the result in Edit">
              <PenTool size={13} /> Annotate
            </Button>
            <Button className="h-8 flex-1" disabled={busy} onClick={() => void doExport('canvas')} title="Use the result in a Studio Canvas design">
              <LayoutTemplate size={13} /> Design
            </Button>
          </div>
        </>
      }
    />
  );
}

function Intro() {
  return (
    <PanelSection title="How it works">
      <p className="text-xs leading-[17px] text-muted">
        Drop an image, drag the frame or pick a shape, rotate or flip if needed, then download, copy, or send the result to Studio.
      </p>
    </PanelSection>
  );
}

/** Mount a canvas element filling its box. */
function CanvasView({ canvas }: { canvas: HTMLCanvasElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    ref.current?.replaceChildren(canvas);
  }, [canvas]);
  return <div ref={ref} className="cs-checker absolute inset-0" />;
}

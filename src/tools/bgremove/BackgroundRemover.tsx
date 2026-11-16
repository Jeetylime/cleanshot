import { useCallback, useEffect, useRef, useState } from 'react';
import { Brush, Copy, Download, Eraser, Hand, ImagePlus, Maximize, Minus, PenTool, Plus, Redo2, Undo2 } from 'lucide-react';
import { Button, ColorPicker, Segmented, Slider } from '../../components/ui/controls';
import { Tooltip } from '../../components/ui/Tooltip';
import { Kbd } from '../../components/ui/Kbd';
import { createCanvas, ctx2d } from '../../engine/images';
import { isEditableTarget, modKey } from '../../lib/utils';
import { openImageBlob, showToast } from '../../store/actions';
import { goPrivacy, goEditor } from '../../app/route';
import type { Point } from '../../types';
import { encodeCanvas } from '../shared/encode';
import { baseName } from '../shared/files';
import { errorMessage } from '../shared/batch';
import { Advanced, copyImage, Dropzone, PanelSection, pickFiles, saveBlob, ToolLayout, useFileSink, useImageList } from '../shared/ui';
import { describeAiError, isModelCached, type DownloadProgress } from '../ai/runtime';
import { ModelStatus, type AiPhase } from '../ai/ModelStatus';
import { loadSegmenter, predictMask, RMBG } from './segment';
import { buildFullMask, composeCutout, drawCover, paintStroke, type Stroke } from './mask';

type BrushTool = 'pan' | 'erase' | 'restore';
type BgMode = 'transparent' | 'color' | 'image';

const BG_COLORS = [
  { value: '#ffffff', name: 'White' },
  { value: '#f2f2f4', name: 'Light gray' },
  { value: '#1c1c1e', name: 'Black' },
  { value: '#0a84ff', name: 'Blue' },
  { value: '#34c759', name: 'Green' },
  { value: '#ff3b30', name: 'Red' },
  { value: '#ffd60a', name: 'Yellow' },
  { value: '#e9dcff', name: 'Lavender' },
];

let modelReady = false;

export default function BackgroundRemover() {
  const list = useImageList({ multiple: false });
  const bgImages = useImageList({ multiple: false });
  useFileSink(list.add);
  const img = list.items[0] ?? null;
  const bgImg = bgImages.items[0] ?? null;

  const [phase, setPhase] = useState<AiPhase>('need-model');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hardness, setHardness] = useState(1);
  const [tool, setTool] = useState<BrushTool>('pan');
  const [brush, setBrush] = useState(40);
  const [view, setView] = useState<'result' | 'original'>('result');
  const [bgMode, setBgMode] = useState<BgMode>('transparent');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [fmt, setFmt] = useState<'png' | 'jpeg'>('png');
  const [busy, setBusy] = useState(false);

  const baseMask = useRef<HTMLCanvasElement | null>(null);
  const fullMask = useRef<HTMLCanvasElement | null>(null);
  const mask = useRef<HTMLCanvasElement | null>(null);
  const cutout = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewT = useRef({ zoom: 1, x: 0, y: 0, manual: false });
  const pointer = useRef<Point | null>(null);
  const spaceDown = useRef(false);

  // --- Mask pipeline -----------------------------------------------------

  const recompose = useCallback(() => {
    if (!img || !mask.current) return;
    if (!cutout.current || cutout.current.width !== img.width || cutout.current.height !== img.height) {
      cutout.current = createCanvas(img.width, img.height);
    }
    composeCutout(cutout.current, img.source, mask.current);
  }, [img]);

  /** Rebuild the editable mask from the model output and replay strokes. */
  const rebuild = useCallback(
    (list: Stroke[], hard = hardness) => {
      if (!img || !baseMask.current) return;
      fullMask.current = buildFullMask(baseMask.current, img.width, img.height, hard);
      const m = mask.current && mask.current.width === img.width ? mask.current : createCanvas(img.width, img.height);
      const ctx = ctx2d(m);
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(fullMask.current, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      list.forEach((s) => paintStroke(ctx, s));
      mask.current = m;
      recompose();
    },
    [img, hardness, recompose],
  );

  const run = useCallback(async () => {
    if (!img) return;
    setError(null);
    try {
      if (!modelReady) {
        setPhase('downloading');
        setProgress(null);
        await loadSegmenter(setProgress);
        modelReady = true;
      }
      setPhase('processing');
      // Let the UI paint the processing state before inference blocks.
      await new Promise((r) => setTimeout(r, 30));
      baseMask.current = await predictMask(img.source);
      setStrokes([]);
      setRedoStack([]);
      rebuild([]);
      setPhase('ready');
    } catch (err) {
      console.error(err);
      setError(describeAiError(err, 'background removal'));
      setPhase('error');
    }
  }, [img, rebuild]);

  // New image: reset and start automatically once the model is available.
  useEffect(() => {
    baseMask.current = fullMask.current = mask.current = cutout.current = null;
    setStrokes([]);
    setRedoStack([]);
    viewT.current.manual = false;
    if (!img) return;
    let cancelled = false;
    void (async () => {
      const cached = modelReady || (await isModelCached(RMBG));
      if (cancelled) return;
      if (cached) void run();
      else setPhase('need-model');
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img]);

  useEffect(() => {
    if (phase === 'ready') {
      rebuild(strokesRef.current, hardness);
      draw();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardness]);

  // --- Display -----------------------------------------------------------

  const checker = useRef<CanvasPattern | null>(null);
  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c || !img) return;
    const ctx = ctx2d(c);
    const dpr = c.width / Math.max(1, c.clientWidth);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const { zoom, x, y } = viewT.current;
    ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, x * dpr, y * dpr);
    ctx.imageSmoothingEnabled = zoom * dpr < 2;
    ctx.imageSmoothingQuality = 'high';
    const showResult = phase === 'ready' && view === 'result' && cutout.current;

    // Background
    if (showResult && bgMode === 'color') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, img.width, img.height);
    } else if (showResult && bgMode === 'image' && bgImg) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, img.width, img.height);
      ctx.clip();
      drawCover(ctx, bgImg.source, img.width, img.height);
      ctx.restore();
    } else {
      if (!checker.current) {
        const t = createCanvas(16, 16);
        const tc = ctx2d(t);
        tc.fillStyle = '#ffffff';
        tc.fillRect(0, 0, 16, 16);
        tc.fillStyle = '#e2e2e6';
        tc.fillRect(0, 0, 8, 8);
        tc.fillRect(8, 8, 8, 8);
        checker.current = ctx.createPattern(t, 'repeat');
      }
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = checker.current!;
      ctx.fillRect(x, y, img.width * zoom, img.height * zoom);
      ctx.restore();
    }

    if (showResult) {
      if (tool !== 'pan') {
        // Ghost of the original so removed areas can be restored precisely.
        ctx.globalAlpha = 0.22;
        ctx.drawImage(img.source, 0, 0);
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(cutout.current!, 0, 0);
    } else {
      ctx.globalAlpha = phase === 'ready' ? 1 : 0.85;
      ctx.drawImage(img.source, 0, 0);
      ctx.globalAlpha = 1;
    }

    // Brush cursor
    const p = pointer.current;
    if (p && tool !== 'pan' && phase === 'ready' && !spaceDown.current) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sx = p.x * zoom + x;
      const sy = p.y * zoom + y;
      const r = (brush * zoom) / 2;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.arc(sx, sy, r + 0.75, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = tool === 'erase' ? '#ff6b6b' : '#5ef38c';
      ctx.beginPath();
      ctx.arc(sx, sy, r - 0.75 > 0 ? r - 0.75 : r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [img, phase, view, bgMode, bgColor, bgImg, tool, brush]);

  const fit = useCallback(() => {
    const host = hostRef.current;
    if (!host || !img) return;
    const w = host.clientWidth;
    const h = host.clientHeight;
    const m = 32;
    const zoom = Math.min((w - m * 2) / img.width, (h - m * 2) / img.height, 1);
    viewT.current = { zoom, x: (w - img.width * zoom) / 2, y: (h - img.height * zoom) / 2, manual: false };
    draw();
  }, [img, draw]);

  // Size the canvas to its container.
  useEffect(() => {
    const host = hostRef.current;
    const c = canvasRef.current;
    if (!host || !c) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      c.width = Math.round(host.clientWidth * dpr);
      c.height = Math.round(host.clientHeight * dpr);
      c.style.width = `${host.clientWidth}px`;
      c.style.height = `${host.clientHeight}px`;
      if (!viewT.current.manual) fit();
      else draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    return () => ro.disconnect();
  }, [img, fit, draw]);

  useEffect(() => {
    draw();
  }, [draw, strokes]);

  const zoomAt = (factor: number, sx?: number, sy?: number) => {
    const host = hostRef.current!;
    const v = viewT.current;
    const cx = sx ?? host.clientWidth / 2;
    const cy = sy ?? host.clientHeight / 2;
    const z = Math.min(16, Math.max(0.05, v.zoom * factor));
    const wx = (cx - v.x) / v.zoom;
    const wy = (cy - v.y) / v.zoom;
    viewT.current = { zoom: z, x: cx - wx * z, y: cy - wy * z, manual: true };
    draw();
  };

  // --- Pointer interaction -------------------------------------------------

  const drag = useRef<{ kind: 'pan'; sx: number; sy: number; vx: number; vy: number } | { kind: 'paint'; stroke: Stroke } | null>(null);
  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toImage = (s: Point) => ({ x: (s.x - viewT.current.x) / viewT.current.zoom, y: (s.y - viewT.current.y) / viewT.current.zoom });

  const onPointerDown = (e: React.PointerEvent) => {
    if (!img) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const s = local(e);
    if (tool === 'pan' || spaceDown.current || e.button === 1 || phase !== 'ready' || view === 'original') {
      drag.current = { kind: 'pan', sx: s.x, sy: s.y, vx: viewT.current.x, vy: viewT.current.y };
      return;
    }
    const stroke: Stroke = { mode: tool, size: brush, points: [toImage(s)] };
    drag.current = { kind: 'paint', stroke };
    paintStroke(ctx2d(mask.current!), stroke);
    recompose();
    draw();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = local(e);
    pointer.current = toImage(s);
    const d = drag.current;
    if (d?.kind === 'pan') {
      viewT.current = { ...viewT.current, x: d.vx + s.x - d.sx, y: d.vy + s.y - d.sy, manual: true };
    } else if (d?.kind === 'paint') {
      const pts = d.stroke.points;
      const p = toImage(s);
      const last = pts[pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > Math.max(0.5, brush * 0.08)) {
        pts.push(p);
        paintStroke(ctx2d(mask.current!), d.stroke, pts.length - 2);
        recompose();
      }
    }
    draw();
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'paint') {
      setStrokes((prev) => [...prev, d.stroke]);
      setRedoStack([]);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!img) return;
    const s = local(e);
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * (Math.abs(e.deltaY) < 50 ? 0.012 : 0.002)), s.x, s.y);
    else {
      viewT.current = { ...viewT.current, x: viewT.current.x - e.deltaX, y: viewT.current.y - e.deltaY, manual: true };
      draw();
    }
  };

  // Non-passive wheel listener so ctrl+wheel doesn't zoom the page.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const prevent = (e: WheelEvent) => e.preventDefault();
    c.addEventListener('wheel', prevent, { passive: false });
    return () => c.removeEventListener('wheel', prevent);
  }, [img]);

  const undo = useCallback(() => {
    const s = strokesRef.current;
    if (!s.length) return;
    const next = s.slice(0, -1);
    setRedoStack((r) => [s[s.length - 1], ...r]);
    setStrokes(next);
    rebuild(next);
  }, [rebuild]);

  const redo = useCallback(() => {
    setRedoStack((r) => {
      if (!r.length) return r;
      const next = [...strokesRef.current, r[0]];
      setStrokes(next);
      rebuild(next);
      return r.slice(1);
    });
  }, [rebuild]);

  // Tool shortcuts (scoped to this tool).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target) || phase !== 'ready') return;
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.code === 'Space') {
        e.preventDefault();
        spaceDown.current = true;
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (k === 'e') setTool('erase');
        else if (k === 'r') setTool('restore');
        else if (k === 'h') setTool('pan');
        else if (k === '[') setBrush((b) => Math.max(2, Math.round(b / 1.2)));
        else if (k === ']') setBrush((b) => Math.min(800, Math.round(b * 1.2)));
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [phase, undo, redo]);

  // Sensible default brush size for this image.
  useEffect(() => {
    if (img) setBrush(Math.max(8, Math.round(Math.max(img.width, img.height) / 40)));
  }, [img]);

  // --- Export ---------------------------------------------------------------

  const composite = (withBg: boolean): HTMLCanvasElement => {
    const out = createCanvas(img!.width, img!.height);
    const ctx = ctx2d(out);
    if (withBg && bgMode === 'color') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, out.width, out.height);
    } else if (withBg && bgMode === 'image' && bgImg) {
      drawCover(ctx, bgImg.source, out.width, out.height);
    }
    ctx.drawImage(cutout.current!, 0, 0);
    return out;
  };

  const exportAs = async (kind: 'cutout' | 'background' | 'copy' | 'editor') => {
    if (!img || !cutout.current) return;
    setBusy(true);
    try {
      const name = baseName(img.name);
      if (kind === 'cutout') {
        const { blob } = await encodeCanvas(cutout.current, 'png');
        await saveBlob(blob, `${name}-no-bg.png`);
      } else if (kind === 'background') {
        const c = composite(true);
        const { blob } = await encodeCanvas(c, fmt, 92);
        await saveBlob(blob, `${name}-new-bg.${fmt === 'jpeg' ? 'jpg' : 'png'}`);
      } else {
        const c = composite(bgMode !== 'transparent');
        if (kind === 'copy') await copyImage(c);
        else {
          const { blob } = await encodeCanvas(c, 'png');
          goEditor();
          await openImageBlob(blob, `${name}-no-bg.png`);
        }
      }
    } catch (err) {
      showToast(`Export failed: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  // --- UI ---------------------------------------------------------------

  if (!img) {
    return (
      <ToolLayout
        main={<Dropzone onFiles={list.add} title="Drop a photo to remove its background" icon={<Eraser size={20} />} hint="Works best with a clear subject: people, products, animals" />}
        panel={
          <PanelSection title="How it works">
            <p className="text-xs leading-[17px] text-muted">
              Drop a photo and the subject is cut out automatically. Clean up edges with the Erase and Restore brushes, then download it transparent or on a new background.
            </p>
            <p className="text-xs leading-[17px] text-muted">
              Your photo is processed on this device. The model is licensed for non-commercial use, and you’re responsible for having the rights to the images you
              edit.
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <button type="button" onClick={goPrivacy} className="text-xs text-accent hover:underline">
                Model and privacy
              </button>
              <a href="#acceptable-use" className="text-xs text-accent hover:underline">
                Acceptable Use
              </a>
            </div>
          </PanelSection>
        }
      />
    );
  }

  const ready = phase === 'ready';
  const tools: { id: BrushTool; label: string; icon: typeof Hand; key: string }[] = [
    { id: 'pan', label: 'Move', icon: Hand, key: 'H' },
    { id: 'erase', label: 'Erase', icon: Eraser, key: 'E' },
    { id: 'restore', label: 'Restore', icon: Brush, key: 'R' },
  ];

  return (
    <ToolLayout
      main={
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-panel px-3 py-1.5">
            <div className="flex items-center gap-0.5" role="toolbar" aria-label="Brush tools">
              {tools.map((t) => (
                <Tooltip key={t.id} label={t.label} shortcut={t.key}>
                  <button
                    type="button"
                    aria-label={t.label}
                    aria-pressed={tool === t.id}
                    disabled={!ready}
                    onClick={() => setTool(t.id)}
                    className={`flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                      tool === t.id ? 'bg-accent text-white' : 'text-muted hover:bg-hover hover:text-fg'
                    }`}
                  >
                    <t.icon size={15} /> <span className="hidden sm:inline">{t.label}</span>
                  </button>
                </Tooltip>
              ))}
              <span className="mx-1.5 h-4 w-px bg-line-strong" />
              <Tooltip label="Undo" shortcut={[modKey, 'Z']}>
                <button type="button" aria-label="Undo" disabled={!strokes.length} onClick={undo} className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted hover:bg-hover hover:text-fg disabled:opacity-35">
                  <Undo2 size={15} />
                </button>
              </Tooltip>
              <Tooltip label="Redo" shortcut={[modKey, '⇧', 'Z']}>
                <button type="button" aria-label="Redo" disabled={!redoStack.length} onClick={redo} className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted hover:bg-hover hover:text-fg disabled:opacity-35">
                  <Redo2 size={15} />
                </button>
              </Tooltip>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-[150px]">
                <Segmented<'result' | 'original'>
                  ariaLabel="View"
                  size="sm"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'result', label: 'Result' },
                    { value: 'original', label: 'Original' },
                  ]}
                />
              </div>
              <span className="mx-1 h-4 w-px bg-line-strong" />
              <button type="button" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.25)} className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted hover:bg-hover hover:text-fg">
                <Minus size={15} />
              </button>
              <button type="button" aria-label="Fit to screen" onClick={fit} className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted hover:bg-hover hover:text-fg">
                <Maximize size={14} />
              </button>
              <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1.25)} className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted hover:bg-hover hover:text-fg">
                <Plus size={15} />
              </button>
            </div>
          </div>
          <div ref={hostRef} className="relative min-h-0 flex-1 overflow-hidden bg-window">
            <canvas
              ref={canvasRef}
              data-testid="bg-canvas"
              aria-label="Background removal preview"
              className="absolute inset-0 touch-none"
              style={{ cursor: tool === 'pan' || !ready ? (drag.current?.kind === 'pan' ? 'grabbing' : 'grab') : 'none' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={() => {
                pointer.current = null;
                draw();
              }}
              onWheel={onWheel}
            />
            <ModelStatus
              model={RMBG}
              phase={phase}
              progress={progress}
              processingLabel="Removing background…"
              error={error}
              onStart={() => void run()}
              onRetry={() => void run()}
            />
          </div>
        </div>
      }
      panel={
        <>
          <PanelSection title="Refine">
            <Slider label="Brush size" value={brush} min={2} max={Math.max(60, Math.round(Math.max(img.width, img.height) / 6))} unit="px" onChange={(b) => setBrush(Math.round(b))} disabled={!ready} />
            <p className="text-xs leading-[16px] text-subtle">
              <span className="text-muted">Erase</span> removes leftovers, <span className="text-muted">Restore</span> brings back parts of the subject. Resize with <Kbd>[</Kbd> <Kbd>]</Kbd>.
            </p>
          </PanelSection>
          <PanelSection title="Background">
            <Segmented<BgMode>
              ariaLabel="Background"
              value={bgMode}
              onChange={(m) => {
                if (m === 'image' && !bgImg) pickFiles(false, (f) => void bgImages.add(f).then(() => setBgMode('image')));
                else setBgMode(m);
              }}
              options={[
                { value: 'transparent', label: 'None' },
                { value: 'color', label: 'Color' },
                { value: 'image', label: 'Image' },
              ]}
            />
            {bgMode === 'color' && <ColorPicker value={bgColor} onChange={setBgColor} colors={BG_COLORS} />}
            {bgMode === 'image' && bgImg && (
              <div className="flex items-center gap-2">
                <img src={bgImg.url} alt="" className="h-10 w-14 rounded-[6px] object-cover" />
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{bgImg.name}</span>
                <button
                  type="button"
                  onClick={() => pickFiles(false, (f) => void bgImages.add(f))}
                  className="inline-flex h-7 items-center gap-1 rounded-[7px] px-2 text-xs font-medium text-muted hover:bg-hover hover:text-fg"
                >
                  <ImagePlus size={13} /> Change
                </button>
              </div>
            )}
          </PanelSection>
          <Advanced>
            <Slider
              label="Edge hardness"
              value={hardness}
              min={1}
              max={6}
              step={0.5}
              format={(v) => (v === 1 ? 'Natural' : `${v}×`)}
              onChange={setHardness}
              disabled={!ready}
            />
            <p className="text-xs leading-[16px] text-subtle">Higher values give crisper edges with less halo; keep Natural for hair and fur.</p>
            {bgMode !== 'transparent' && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">Format with background</span>
                <Segmented<'png' | 'jpeg'>
                  ariaLabel="Format with background"
                  size="sm"
                  value={fmt}
                  onChange={setFmt}
                  options={[
                    { value: 'png', label: 'PNG' },
                    { value: 'jpeg', label: 'JPEG' },
                  ]}
                />
              </div>
            )}
            <button type="button" onClick={() => void run()} disabled={phase === 'processing' || phase === 'downloading'} className="self-start text-xs text-accent hover:underline disabled:opacity-40">
              Run detection again
            </button>
          </Advanced>
          <PanelSection title="Image">
            <div className="flex items-center justify-between text-xs">
              <span className="truncate text-muted">{img.name}</span>
              <span className="shrink-0 text-subtle tabular-nums">
                {img.width} × {img.height}
              </span>
            </div>
            <button type="button" onClick={() => list.clear()} className="self-start text-xs text-accent hover:underline">
              Use a different image
            </button>
          </PanelSection>
        </>
      }
      footer={
        <>
          <Button variant="primary" className="h-8" disabled={!ready || busy} onClick={() => void exportAs('cutout')}>
            <Download size={14} /> Download transparent PNG
          </Button>
          {bgMode !== 'transparent' && (
            <Button className="h-8" disabled={!ready || busy || (bgMode === 'image' && !bgImg)} onClick={() => void exportAs('background')}>
              <Download size={14} /> Download with background
            </Button>
          )}
          <div className="flex gap-2">
            <Button className="h-8 flex-1" disabled={!ready || busy} onClick={() => void exportAs('copy')}>
              <Copy size={13} /> Copy
            </Button>
            <Button className="h-8 flex-1" disabled={!ready || busy} onClick={() => void exportAs('editor')} title="Open the result in the Screenshot Editor">
              <PenTool size={13} /> Annotate
            </Button>
          </div>
        </>
      }
    />
  );
}

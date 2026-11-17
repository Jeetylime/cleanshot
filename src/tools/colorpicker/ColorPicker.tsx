import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, Pipette, X } from 'lucide-react';
import { Button, Slider } from '../../components/ui/controls';
import { Tooltip } from '../../components/ui/Tooltip';
import { canvasToBlob, createCanvas, ctx2d } from '../../engine/images';
import { showToast } from '../../store/actions';
import { dominantColors } from '../shared/quantize';
import { baseName } from '../shared/files';
import { Advanced, Dropzone, PanelSection, saveBlob, ToolLayout, useFileSink, useImageList } from '../shared/ui';

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const hex = ({ r, g, b }: Rgb) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

function hsl({ r, g, b }: Rgb) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

const rgbStr = (c: Rgb) => `rgb(${c.r}, ${c.g}, ${c.b})`;
const hslStr = (c: Rgb) => {
  const { h, s, l } = hsl(c);
  return `hsl(${h}, ${s}%, ${l}%)`;
};
const lum = ({ r, g, b }: Rgb) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

async function copyText(text: string, what = text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`Copied ${what}`);
  } catch {
    showToast('Clipboard access was blocked.', 'error');
  }
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex h-7 items-center gap-2 rounded-[6px] bg-control pr-1 pl-2 text-xs">
      <span className="w-8 shrink-0 text-subtle">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[length:calc(11.5px*var(--text-scale))] text-fg">{value}</span>
      <Tooltip label={`Copy ${label}`}>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          onClick={() => {
            void copyText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1200);
          }}
          className="flex h-6 w-6 items-center justify-center rounded-[5px] text-muted hover:bg-hover hover:text-fg"
        >
          {done ? <Check size={12} className="text-success" /> : <Copy size={12} />}
        </button>
      </Tooltip>
    </div>
  );
}

function Swatch({ c, active, onClick, label, onRemove }: { c: Rgb; active?: boolean; onClick: () => void; label?: string; onRemove?: () => void }) {
  return (
    <div className="group relative">
      <Tooltip label={label ?? hex(c)} className="block w-full">
        <button
          type="button"
          aria-label={`Select ${hex(c)}`}
          onClick={onClick}
          className={`h-9 w-full rounded-[7px] shadow-[inset_0_0_0_1px_rgba(127,127,127,0.25)] transition-transform hover:scale-[1.05] ${active ? 'ring-2 ring-accent ring-offset-2 ring-offset-panel' : ''}`}
          style={{ background: hex(c) }}
        />
      </Tooltip>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${hex(c)}`}
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-elevated text-muted shadow-pop group-hover:flex hover:text-fg"
        >
          <X size={9} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

export default function ColorPicker() {
  const list = useImageList({ multiple: false });
  useFileSink(list.add);
  const img = list.items[0] ?? null;
  const [current, setCurrent] = useState<Rgb | null>(null);
  const [picked, setPicked] = useState<Rgb[]>([]);
  const [count, setCount] = useState(6);
  const [hover, setHover] = useState<{ x: number; y: number; sx: number; sy: number; c: Rgb } | null>(null);
  const pixels = useRef<CanvasRenderingContext2D | null>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);

  // CPU copy of the pixels for exact sampling.
  useEffect(() => {
    pixels.current = null;
    setPicked([]);
    setCurrent(null);
    if (!img) return;
    const c = createCanvas(img.width, img.height);
    const ctx = ctx2d(c, { willReadFrequently: true });
    ctx.drawImage(img.source, 0, 0);
    pixels.current = ctx;
  }, [img]);

  const palette = useMemo(() => {
    if (!img) return [];
    const k = Math.min(1, 320 / Math.max(img.width, img.height));
    const c = createCanvas(Math.max(1, Math.round(img.width * k)), Math.max(1, Math.round(img.height * k)));
    const ctx = ctx2d(c, { willReadFrequently: true });
    ctx.drawImage(img.source, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    return dominantColors(data, count).map((d) => ({ c: { r: d.rgb[0], g: d.rgb[1], b: d.rgb[2] }, share: d.share }));
  }, [img, count]);

  useEffect(() => {
    if (!current && palette[0]) setCurrent(palette[0].c);
  }, [palette, current]);

  // Draw the image to fit its box.
  useEffect(() => {
    const cv = viewRef.current;
    if (!cv || !img) return;
    const host = cv.parentElement!;
    const draw = () => {
      const k = Math.min(host.clientWidth / img.width, host.clientHeight / img.height, 1);
      const dpr = window.devicePixelRatio || 1;
      cv.style.width = `${Math.round(img.width * k)}px`;
      cv.style.height = `${Math.round(img.height * k)}px`;
      cv.width = Math.round(img.width * k * dpr);
      cv.height = Math.round(img.height * k * dpr);
      const ctx = ctx2d(cv);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img.source, 0, 0, cv.width, cv.height);
    };
    const ro = new ResizeObserver(draw);
    ro.observe(host);
    draw();
    return () => ro.disconnect();
  }, [img]);

  const sample = (e: React.PointerEvent) => {
    const cv = viewRef.current!;
    const r = cv.getBoundingClientRect();
    const x = Math.min(img!.width - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * img!.width)));
    const y = Math.min(img!.height - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * img!.height)));
    const d = pixels.current!.getImageData(x, y, 1, 1).data;
    return { x, y, sx: e.clientX - r.left, sy: e.clientY - r.top, c: { r: d[0], g: d[1], b: d[2] } };
  };

  // Magnifier loupe.
  useEffect(() => {
    const lc = loupeRef.current;
    if (!lc || !hover || !pixels.current) return;
    const N = 11;
    const S = 10;
    lc.width = N * S;
    lc.height = N * S;
    const ctx = ctx2d(lc);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, lc.width, lc.height);
    ctx.drawImage(pixels.current.canvas, hover.x - 5, hover.y - 5, N, N, 0, 0, N * S, N * S);
    ctx.strokeStyle = lum(hover.c) > 0.5 ? '#000' : '#fff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(5 * S + 0.75, 5 * S + 0.75, S - 1.5, S - 1.5);
  }, [hover]);

  const pick = (c: Rgb) => {
    setCurrent(c);
    setPicked((p) => (p.some((q) => hex(q) === hex(c)) ? p : [c, ...p].slice(0, 16)));
  };

  const exportColors = () => {
    const pal = palette.map((p) => p.c);
    const all = [...picked, ...pal.filter((c) => !picked.some((q) => hex(q) === hex(c)))];
    return all;
  };

  const css = () => exportColors().map((c, i) => `  --color-${i + 1}: ${hex(c)};`).join('\n');
  const json = () =>
    JSON.stringify(
      exportColors().map((c) => ({ hex: hex(c), rgb: [c.r, c.g, c.b], hsl: hsl(c) })),
      null,
      2,
    );

  const downloadPng = async () => {
    const colors = exportColors();
    const W = 160;
    const c = createCanvas(W * colors.length, 220);
    const ctx = ctx2d(c);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    colors.forEach((col, i) => {
      ctx.fillStyle = hex(col);
      ctx.fillRect(i * W, 0, W, 160);
      ctx.fillStyle = '#1d1d1f';
      ctx.font = '600 18px -apple-system, Inter, sans-serif';
      ctx.fillText(hex(col), i * W + 14, 192);
      ctx.fillStyle = '#6e6e73';
      ctx.font = '13px -apple-system, Inter, sans-serif';
      ctx.fillText(`${col.r}, ${col.g}, ${col.b}`, i * W + 14, 210);
    });
    await saveBlob(await canvasToBlob(c, 'image/png'), `${baseName(img!.name)}-palette.png`);
  };

  if (!img) {
    return (
      <ToolLayout
        main={<Dropzone onFiles={list.add} title="Drop an image to sample colors" icon={<Pipette size={20} />} />}
        panel={
          <PanelSection title="How it works">
            <p className="text-xs leading-[17px] text-muted">
              Click anywhere on the image to sample a pixel, and get its HEX, RGB and HSL values. The dominant colors are extracted automatically and can be exported as CSS, JSON or a swatch image.
            </p>
          </PanelSection>
        }
      />
    );
  }

  return (
    <ToolLayout
      main={
        <div className="relative flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="relative flex h-full w-full items-center justify-center">
            <canvas
              ref={viewRef}
              data-testid="picker-canvas"
              aria-label="Click to sample a color"
              className="cs-checker cursor-crosshair rounded-[4px] shadow-pop"
              onPointerMove={(e) => setHover(sample(e))}
              onPointerLeave={() => setHover(null)}
              onClick={(e) => pick(sample(e as unknown as React.PointerEvent).c)}
            />
            {hover && (
              <div
                className="pointer-events-none absolute z-10 flex flex-col items-center gap-1.5"
                style={{
                  left: (viewRef.current?.offsetLeft ?? 0) + hover.sx + 18,
                  top: (viewRef.current?.offsetTop ?? 0) + hover.sy + 18,
                }}
              >
                <canvas ref={loupeRef} className="h-[110px] w-[110px] rounded-full border-2 border-white shadow-pop" style={{ imageRendering: 'pixelated' }} />
                <span className="rounded-full bg-black/75 px-2 py-0.5 font-mono text-[length:calc(11px*var(--text-scale))] text-white">{hex(hover.c)}</span>
              </div>
            )}
          </div>
        </div>
      }
      panel={
        <>
          <PanelSection title="Selected color">
            {current ? (
              <>
                <div
                  className="flex h-16 items-end rounded-[10px] p-2.5 shadow-[inset_0_0_0_1px_rgba(127,127,127,0.25)]"
                  style={{ background: hex(current), color: lum(current) > 0.55 ? '#111' : '#fff' }}
                  data-testid="current-color"
                >
                  <span className="font-mono text-sm font-semibold">{hex(current)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <CopyRow label="HEX" value={hex(current)} />
                  <CopyRow label="RGB" value={rgbStr(current)} />
                  <CopyRow label="HSL" value={hslStr(current)} />
                </div>
              </>
            ) : (
              <p className="text-xs text-muted">Click the image to sample a color.</p>
            )}
          </PanelSection>
          <PanelSection title="Dominant colors">
            <div className="grid grid-cols-6 gap-1.5" data-testid="palette">
              {palette.map((p) => (
                <Swatch key={hex(p.c)} c={p.c} active={!!current && hex(current) === hex(p.c)} onClick={() => setCurrent(p.c)} label={`${hex(p.c)} · ${Math.round(p.share * 100)}%`} />
              ))}
            </div>
            <div className="flex h-2 overflow-hidden rounded-full">
              {palette.map((p) => (
                <span key={hex(p.c)} style={{ width: `${p.share * 100}%`, background: hex(p.c) }} />
              ))}
            </div>
          </PanelSection>
          {picked.length > 0 && (
            <PanelSection title="Picked" aside={<button type="button" className="text-xs text-accent hover:underline" onClick={() => setPicked([])}>Clear</button>}>
              <div className="grid grid-cols-6 gap-1.5">
                {picked.map((c) => (
                  <Swatch key={hex(c)} c={c} active={!!current && hex(current) === hex(c)} onClick={() => setCurrent(c)} onRemove={() => setPicked((p) => p.filter((q) => hex(q) !== hex(c)))} />
                ))}
              </div>
            </PanelSection>
          )}
          <Advanced title="Palette options">
            <Slider label="Number of colors" value={count} min={3} max={12} onChange={(v) => setCount(Math.round(v))} />
          </Advanced>
          <PanelSection title="Image">
            <button type="button" onClick={() => list.clear()} className="self-start text-xs text-accent hover:underline">
              Use a different image
            </button>
          </PanelSection>
        </>
      }
      footer={
        <>
          <div className="flex gap-2">
            <Button className="h-8 flex-1" onClick={() => void copyText(`:root {\n${css()}\n}`, 'palette as CSS')}>
              <Copy size={13} /> CSS
            </Button>
            <Button className="h-8 flex-1" onClick={() => void copyText(json(), 'palette as JSON')}>
              <Copy size={13} /> JSON
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" className="h-8 flex-1" onClick={() => void downloadPng()}>
              <Download size={14} /> Swatch PNG
            </Button>
            <Button className="h-8 flex-1" onClick={() => void saveBlob(new Blob([json()], { type: 'application/json' }), `${baseName(img.name)}-palette.json`)}>
              <Download size={14} /> JSON
            </Button>
          </div>
        </>
      }
    />
  );
}

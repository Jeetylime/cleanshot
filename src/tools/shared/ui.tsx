import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ChevronRight, Info, Loader2, Trash2, Upload, X } from 'lucide-react';
import { setToolFileSink } from '../../app/route';
import { showToast } from '../../store/actions';
import { formatBytes } from '../../lib/utils';
import { canvasToBlob, createCanvas, ctx2d } from '../../engine/images';
import { downloadBlob, writeImageToClipboard } from '../../engine/export';
import { ACCEPT, loadImage, releaseImage, type LoadedImage } from './files';
import { errorMessage } from './batch';
import { Tooltip } from '../../components/ui/Tooltip';

// ---------------------------------------------------------------------------
// Layout

/** Standard tool workspace: preview area on the left, settings on the right. */
export function ToolLayout({ main, panel, footer }: { main: ReactNode; panel: ReactNode; footer?: ReactNode }) {
  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <section className="relative flex min-h-[58vh] min-w-0 flex-1 flex-col lg:min-h-0" aria-label="Preview">
        {main}
      </section>
      <aside
        aria-label="Settings"
        className="flex w-full shrink-0 flex-col border-t border-line bg-panel lg:w-[300px] lg:border-t-0 lg:border-l"
      >
        <div className="scroll-thin min-h-0 flex-1 lg:overflow-y-auto">{panel}</div>
        {footer && (
          <div className="sticky bottom-0 flex flex-col gap-2 border-t border-line bg-panel px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:static">
            {footer}
          </div>
        )}
      </aside>
    </div>
  );
}

export function PanelSection({ title, children, aside }: { title?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-line px-4 py-3.5 last:border-b-0">
      {(title || aside) && (
        <div className="flex h-5 items-center justify-between">
          {title && <h3 className="text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">{title}</h3>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** Collapsible section for advanced options. */
export function Advanced({ children, title = 'Advanced' }: { children: ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className="border-b border-line last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex h-10 w-full items-center gap-1.5 px-4 text-2xs font-semibold tracking-[0.04em] text-subtle uppercase hover:text-fg"
      >
        <ChevronRight size={12} className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
        {title}
      </button>
      {open && (
        <div id={id} className="flex flex-col gap-3 px-4 pb-4 animate-fade-in">
          {children}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Upload

/** Route window-level paste and drop to this tool while it is mounted. */
export function useFileSink(handler: (files: File[]) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    setToolFileSink((files) => ref.current(files));
    return () => setToolFileSink(null);
  }, []);
}

export function pickFiles(multiple: boolean, onFiles: (files: File[]) => void, accept: string = ACCEPT) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = multiple;
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    if (files.length) onFiles(files);
    input.remove();
  });
  document.body.appendChild(input);
  input.click();
}

export function Dropzone({
  onFiles,
  multiple = false,
  title,
  hint,
  icon,
  accept,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  title?: string;
  hint?: string;
  icon?: ReactNode;
  accept?: string;
}) {
  const [over, setOver] = useState(false);
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div
        role="button"
        tabIndex={0}
        data-testid="tool-dropzone"
        onClick={() => pickFiles(multiple, onFiles, accept)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pickFiles(multiple, onFiles, accept);
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={() => setOver(false)}
        className={`flex w-full max-w-[520px] flex-col items-center gap-4 rounded-[18px] border border-dashed px-8 py-12 text-center transition-colors duration-200 ${
          over ? 'border-accent bg-accent-soft' : 'border-line-strong bg-panel/60 hover:border-accent/60 hover:bg-panel'
        }`}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-control text-muted">{icon ?? <Upload size={20} />}</div>
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-semibold text-fg">{title ?? (multiple ? 'Drop images here' : 'Drop an image here')}</p>
          <p className="text-sm text-muted">
            or <span className="text-accent">browse</span> · paste with ⌘V / Ctrl+V
          </p>
        </div>
        <p className="text-xs text-subtle">{hint ?? 'PNG, JPEG, WebP, AVIF, GIF or BMP'}</p>
      </div>
    </div>
  );
}

/** Manage a list of loaded images, releasing memory on removal/unmount. */
export function useImageList(opts: { multiple: boolean; onAdded?: (imgs: LoadedImage[]) => void }) {
  const [items, setItems] = useState<LoadedImage[]>([]);
  const [loading, setLoading] = useState(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onAddedRef = useRef(opts.onAdded);
  onAddedRef.current = opts.onAdded;

  useEffect(() => () => itemsRef.current.forEach(releaseImage), []);

  const add = useCallback(
    async (files: File[]) => {
      const list = opts.multiple ? files : files.slice(0, 1);
      setLoading((n) => n + list.length);
      const loaded: LoadedImage[] = [];
      const errors: string[] = [];
      for (const f of list) {
        try {
          loaded.push(await loadImage(f));
        } catch (err) {
          errors.push(errorMessage(err));
        } finally {
          setLoading((n) => n - 1);
        }
      }
      if (errors.length) showToast(errors.length === 1 ? errors[0] : `${errors.length} files couldn’t be opened.`, 'error');
      if (loaded.some((l) => l.scaled)) showToast('A very large image was scaled down to fit browser limits.', 'info');
      if (!loaded.length) return;
      setItems((prev) => {
        if (opts.multiple) return [...prev, ...loaded];
        prev.forEach(releaseImage);
        return loaded.slice(0, 1);
      });
      onAddedRef.current?.(loaded);
    },
    [opts.multiple],
  );

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const it = prev.find((p) => p.id === id);
      releaseImage(it);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    setItems((prev) => {
      prev.forEach(releaseImage);
      return [];
    });
  }, []);

  const move = useCallback((id: string, dir: -1 | 1) => {
    setItems((prev) => {
      const i = prev.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  return { items, loading, add, remove, clear, move };
}

// ---------------------------------------------------------------------------
// Feedback

export function ProgressBar({ value, label }: { value: number | null; label?: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value === null ? undefined : Math.round(value * 100)}>
      {label && <div className="flex items-center justify-between text-xs text-muted">{label}</div>}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-active">
        {value === null ? (
          <div className="h-full w-1/3 animate-[cs-indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-accent-fill" />
        ) : (
          <div className="h-full rounded-full bg-accent-fill transition-[width] duration-200" style={{ width: `${Math.round(value * 100)}%` }} />
        )}
      </div>
    </div>
  );
}

export function Notice({ tone = 'info', children, onClose }: { tone?: 'info' | 'error' | 'success'; children: ReactNode; onClose?: () => void }) {
  const Icon = tone === 'error' ? AlertCircle : Info;
  const color = tone === 'error' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-accent';
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-[8px] px-3 py-2.5 text-xs leading-[17px] ${
        tone === 'error' ? 'bg-danger/10 text-fg' : 'bg-accent-soft text-muted'
      }`}
    >
      <Icon size={14} className={`mt-px shrink-0 ${color}`} />
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <button type="button" aria-label="Dismiss" onClick={onClose} className="shrink-0 text-subtle hover:text-fg">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin-slow text-accent" />;
}

// ---------------------------------------------------------------------------
// Previews

/** Before/after comparison with a draggable divider. */
export function CompareSlider({
  before,
  after,
  width,
  height,
  beforeLabel = 'Before',
  afterLabel = 'After',
  checker = false,
  pixelated = false,
  natural = false,
}: {
  before: string;
  after: string;
  width: number;
  height: number;
  beforeLabel?: string;
  afterLabel?: string;
  checker?: boolean;
  pixelated?: boolean;
  /** Show at 1 image pixel = 1 CSS pixel (inside a scroll container). */
  natural?: boolean;
}) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const update = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };
  const imgStyle = pixelated ? { imageRendering: 'pixelated' as const } : undefined;
  return (
    <div
      ref={ref}
      data-testid="compare-slider"
      className={`relative touch-none overflow-hidden rounded-[6px] shadow-pop select-none ${natural ? 'shrink-0' : 'max-h-full max-w-full'} ${checker ? 'cs-checker' : ''}`}
      style={
        natural
          ? { width, height }
          : { aspectRatio: `${width} / ${height}`, width: `min(100%, calc((100cqh) * ${width / height}))` }
      }
      onPointerDown={(e) => {
        dragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        update(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && update(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
    >
      <img src={after} alt={afterLabel} className="absolute inset-0 h-full w-full object-contain" style={imgStyle} draggable={false} />
      <img
        src={before}
        alt={beforeLabel}
        className="absolute inset-0 h-full w-full object-contain"
        style={{ ...imgStyle, clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" style={{ left: `${pos}%` }}>
        <div className="absolute top-1/2 left-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[10px] font-bold text-black shadow-pop">
          ⇆
        </div>
      </div>
      <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-2xs font-medium text-white backdrop-blur">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-2xs font-medium text-white backdrop-blur">
        {afterLabel}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        aria-label="Comparison position"
        onChange={(e) => setPos(Number(e.target.value))}
        className="absolute inset-x-0 bottom-0 h-6 w-full cursor-default opacity-0"
      />
    </div>
  );
}

/** Centered stage for previews; children can size against it with cq units. */
export function Stage({ children, checker = false }: { children: ReactNode; checker?: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6" style={{ containerType: 'size' }}>
      <div className={`flex h-full w-full items-center justify-center ${checker ? '' : ''}`}>{children}</div>
    </div>
  );
}

/** A thumbnail row in batch lists. */
export function FileRow({
  img,
  selected,
  onSelect,
  onRemove,
  status,
  right,
}: {
  img: LoadedImage;
  selected?: boolean;
  onSelect?: () => void;
  onRemove?: () => void;
  status?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      className={`group flex items-center gap-3 rounded-[10px] border px-2 py-1.5 transition-colors ${
        selected ? 'border-accent/60 bg-accent-soft' : 'border-line bg-panel hover:border-line-strong'
      }`}
    >
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Preview ${img.name}`}>
        <span className="cs-checker flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[6px]">
          <img src={img.url} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-medium text-fg">{img.name}</span>
          <span className="text-2xs text-subtle tabular-nums">
            {img.width}×{img.height} · {formatBytes(img.size)}
          </span>
        </span>
      </button>
      {status && <div className="shrink-0 text-right text-2xs tabular-nums">{status}</div>}
      {right}
      {onRemove && (
        <Tooltip label="Remove">
          <button
            type="button"
            aria-label={`Remove ${img.name}`}
            onClick={onRemove}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-subtle opacity-60 hover:bg-hover hover:text-danger group-hover:opacity-100"
          >
            <Trash2 size={13} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Output

export async function saveBlob(blob: Blob, filename: string) {
  try {
    const r = await downloadBlob(blob, filename);
    if (r === 'declined') showToast('Save cancelled', 'info');
    else showToast(`Saved ${filename}`);
  } catch (err) {
    showToast(`Couldn’t save the file: ${errorMessage(err)}`, 'error');
  }
}

/** Copy an image to the clipboard (converted to PNG, the only universally accepted type). */
export async function copyImage(source: Blob | HTMLCanvasElement) {
  const png: Promise<Blob> =
    source instanceof HTMLCanvasElement
      ? canvasToBlob(source, 'image/png')
      : source.type === 'image/png'
        ? Promise.resolve(source)
        : createImageBitmap(source).then((bmp) => {
            const c = createCanvas(bmp.width, bmp.height);
            ctx2d(c).drawImage(bmp, 0, 0);
            bmp.close();
            return canvasToBlob(c, 'image/png');
          });
  try {
    await writeImageToClipboard(png);
    showToast('Copied to clipboard');
  } catch {
    showToast('Clipboard access was blocked. Use Download instead.', 'error');
  }
}

/** Object URL for a blob that is revoked when the blob changes or on unmount. */
export function useBlobUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function SizeDelta({ before, after }: { before: number; after: number }) {
  const pct = before > 0 ? ((after - before) / before) * 100 : 0;
  const smaller = after < before;
  return (
    <span className={`font-semibold ${smaller ? 'text-success' : 'text-danger'}`}>
      {smaller ? '−' : '+'}
      {Math.abs(pct).toFixed(pct > -10 && pct < 10 ? 1 : 0)}%
    </span>
  );
}

export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export type { LoadedImage };

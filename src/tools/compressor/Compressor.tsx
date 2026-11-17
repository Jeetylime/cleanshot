import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FolderArchive, Shrink } from 'lucide-react';
import { Button, NumberInput, Segmented, Slider, Toggle } from '../../components/ui/controls';
import { fitQuality } from '../shared/targetSize';
import { formatBytes } from '../../lib/utils';
import { createCanvas, ctx2d } from '../../engine/images';
import { encodeCanvas, FORMATS, withExtension, type OutFormat } from '../shared/encode';
import { errorMessage, runBatch } from '../shared/batch';
import { createZip } from '../shared/zip';
import { BatchList } from '../shared/BatchList';
import { renderResized } from '../shared/geometry';
import { optimizePng, pngOptimizationSupported } from '../shared/png';
import { resolveFormat, type OutChoice } from '../shared/OutputOptions';
import {
  Advanced,
  CompareSlider,
  Dropzone,
  FileRow,
  Notice,
  PanelSection,
  saveBlob,
  SizeDelta,
  Spinner,
  ToolLayout,
  useBlobUrl,
  useFileSink,
  useImageList,
  type LoadedImage,
} from '../shared/ui';

type PngMode = 'lossless' | 'colors';

interface Settings {
  format: OutChoice;
  quality: number;
  pngMode: PngMode;
  colors: number;
  dither: boolean;
  maxSide: number | null;
  keepIfLarger: boolean;
  /** Target file size in KB for lossy formats; null uses the quality slider. */
  targetKB: number | null;
}

interface Result {
  key: string;
  status: 'working' | 'done' | 'error';
  blob?: Blob;
  format?: OutFormat;
  /** Compression didn't help; the original file is used instead. */
  usedOriginal?: boolean;
  w?: number;
  h?: number;
  error?: string;
  /** Quality chosen by target-size mode, and whether the target was met. */
  quality?: number;
  missed?: boolean;
}

async function compress(img: LoadedImage, s: Settings): Promise<Omit<Result, 'key' | 'status'>> {
  const format = resolveFormat(s.format, img.type);
  let canvas: HTMLCanvasElement;
  if (s.maxSide && Math.max(img.width, img.height) > s.maxSide) {
    const k = s.maxSide / Math.max(img.width, img.height);
    canvas = renderResized(img.source, img.width * k, img.height * k, 'stretch');
  } else {
    canvas = createCanvas(img.width, img.height);
    ctx2d(canvas).drawImage(img.source, 0, 0);
  }
  try {
    let blob: Blob | null = null;
    if (format === 'png') {
      const data = ctx2d(canvas, { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
      if (pngOptimizationSupported()) blob = await optimizePng(data, s.pngMode === 'colors' ? s.colors : null, s.dither);
      // Lossless fallback: the browser's own PNG encoder.
      const plain = await encodeCanvas(canvas, 'png');
      if (!blob || plain.blob.size < blob.size) blob = plain.blob;
    } else if (s.targetKB) {
      const fit = await fitQuality(async (q) => (await encodeCanvas(canvas, format, q)).blob, s.targetKB * 1024);
      return { blob: fit.result, format, w: canvas.width, h: canvas.height, quality: fit.quality, missed: !fit.fits };
    } else {
      blob = (await encodeCanvas(canvas, format, s.quality)).blob;
    }
    const resized = canvas.width !== img.width || canvas.height !== img.height;
    const sameFormat = img.type === FORMATS[format].mime;
    if (s.keepIfLarger && !resized && sameFormat && blob.size >= img.size) {
      return { blob: img.file, format, usedOriginal: true, w: img.width, h: img.height };
    }
    return { blob, format, w: canvas.width, h: canvas.height };
  } finally {
    canvas.width = canvas.height = 0;
  }
}

export default function Compressor() {
  const [selected, setSelected] = useState<string | null>(null);
  const [s, setS] = useState<Settings>({
    format: 'original',
    quality: 75,
    pngMode: 'colors',
    colors: 256,
    dither: true,
    maxSide: null,
    keepIfLarger: true,
    targetKB: null,
  });
  const [results, setResults] = useState<Record<string, Result>>({});
  const [view, setView] = useState<'slider' | 'side'>('slider');
  const list = useImageList({ multiple: true, onAdded: (imgs) => setSelected((c) => c ?? imgs[0].id) });
  useFileSink(list.add);
  const set = (p: Partial<Settings>) => setS((prev) => ({ ...prev, ...p }));

  const key = JSON.stringify(s);
  const current = (id: string) => (results[id]?.key === key ? results[id] : undefined);

  // Compress automatically whenever images or settings change (debounced).
  const job = useRef({ cancelled: false });
  useEffect(() => {
    const todo = list.items.filter((i) => current(i.id)?.status !== 'done');
    if (!todo.length) return;
    job.current.cancelled = true;
    const token = { cancelled: false };
    job.current = token;
    const t = setTimeout(() => {
      void runBatch(todo, (img) => compress(img, s), {
        concurrency: 2,
        signal: token,
        onStart: (i) => !token.cancelled && setResults((r) => ({ ...r, [todo[i].id]: { key, status: 'working' } })),
        onDone: (i, res) => !token.cancelled && setResults((r) => ({ ...r, [todo[i].id]: { key, status: 'done', ...res } })),
        onError: (i, err) => !token.cancelled && setResults((r) => ({ ...r, [todo[i].id]: { key, status: 'error', error: errorMessage(err) } })),
      });
    }, 350);
    return () => {
      clearTimeout(t);
      token.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, list.items]);

  const done = list.items.filter((i) => current(i.id)?.status === 'done');
  const working = list.items.some((i) => current(i.id)?.status !== 'done' && current(i.id)?.status !== 'error');
  const totals = useMemo(() => {
    const before = done.reduce((a, i) => a + i.size, 0);
    const after = done.reduce((a, i) => a + (current(i.id)?.blob?.size ?? 0), 0);
    return { before, after, saved: before - after };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, key, list.items]);

  const sel = list.items.find((i) => i.id === selected) ?? list.items[0] ?? null;
  const selResult = sel ? current(sel.id) : undefined;
  const afterUrl = useBlobUrl(selResult?.status === 'done' ? selResult.blob! : null);
  const outFormat = sel ? resolveFormat(s.format, sel.type) : 'jpeg';
  const showPng = s.format === 'png' || (s.format === 'original' && list.items.some((i) => resolveFormat('original', i.type) === 'png'));
  const showQuality = s.format !== 'png' && (s.format !== 'original' || list.items.some((i) => resolveFormat('original', i.type) !== 'png'));

  const name = (img: LoadedImage) => {
    const r = current(img.id)!;
    return r.usedOriginal ? img.name : withExtension(img.name, r.format!);
  };
  const downloadAll = async () => {
    const files = done.map((i) => ({ name: name(i), blob: current(i.id)!.blob! }));
    if (files.length === 1) return saveBlob(files[0].blob, files[0].name);
    await saveBlob(await createZip(files), 'compressed-images.zip');
  };

  if (!list.items.length) {
    return (
      <ToolLayout
        main={<Dropzone multiple onFiles={list.add} title="Drop images to compress" icon={<Shrink size={20} />} />}
        panel={
          <PanelSection title="How it works">
            <p className="text-xs leading-[17px] text-muted">
              Add images and they’re compressed right away. Adjust quality or format and see the savings update live, compare before and after, then download.
            </p>
          </PanelSection>
        }
      />
    );
  }

  const pct = totals.before ? Math.round((1 - totals.after / totals.before) * 100) : 0;

  return (
    <ToolLayout
      main={
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3">
            <div className="w-[210px]">
            <Segmented<'slider' | 'side'>
              ariaLabel="Preview mode"
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'slider', label: 'Compare' },
                { value: 'side', label: 'Side by side' },
              ]}
            />
            </div>
            {sel && selResult?.status === 'done' && (
              <span className="text-xs text-muted tabular-nums">
                {formatBytes(sel.size)} → <span className="text-fg">{formatBytes(selResult.blob!.size)}</span>{' '}
                <SizeDelta before={sel.size} after={selResult.blob!.size} />
              </span>
            )}
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-5" style={{ containerType: 'size' }}>
            {sel && afterUrl && selResult?.status === 'done' ? (
              view === 'slider' ? (
                <CompareSlider
                  before={sel.url}
                  after={afterUrl}
                  width={selResult!.w!}
                  height={selResult!.h!}
                  beforeLabel={`Original · ${formatBytes(sel.size)}`}
                  afterLabel={`${FORMATS[outFormat].label} · ${formatBytes(selResult!.blob!.size)}`}
                  checker
                />
              ) : (
                <div className="grid h-full w-full grid-cols-2 gap-3">
                  {[
                    { url: sel.url, label: `Original · ${formatBytes(sel.size)}` },
                    { url: afterUrl, label: `Compressed · ${formatBytes(selResult!.blob!.size)}` },
                  ].map((p) => (
                    <figure key={p.label} className="flex min-h-0 flex-col items-center gap-2">
                      <div className="cs-checker flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-[6px]">
                        <img src={p.url} alt={p.label} className="max-h-full max-w-full object-contain" />
                      </div>
                      <figcaption className="text-xs text-muted">{p.label}</figcaption>
                    </figure>
                  ))}
                </div>
              )
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Spinner /> Compressing…
              </div>
            )}
          </div>
          <BatchList items={list.items} loading={list.loading} onAdd={list.add} onClear={list.clear} className="max-h-[36%] border-t border-line pt-1">
            {list.items.map((img) => {
              const r = current(img.id);
              return (
                <FileRow
                  key={img.id}
                  img={img}
                  selected={sel?.id === img.id}
                  onSelect={() => setSelected(img.id)}
                  onRemove={() => list.remove(img.id)}
                  status={
                    r?.status === 'done' ? (
                      <span className="flex flex-col items-end">
                        <span className="text-fg">{formatBytes(r.blob!.size)}</span>
                        {r.usedOriginal ? <span className="text-subtle">kept original</span> : <SizeDelta before={img.size} after={r.blob!.size} />}
                        {r.quality !== undefined && <span className={r.missed ? 'ml-1 text-danger' : 'ml-1 text-subtle'} title={r.missed ? 'Couldn’t reach the target size even at the lowest quality' : undefined}>· q{r.quality}{r.missed ? ' (over target)' : ''}</span>}
                      </span>
                    ) : r?.status === 'error' ? (
                      <span className="text-danger" title={r.error}>Failed</span>
                    ) : (
                      <Spinner size={13} />
                    )
                  }
                  right={
                    r?.status === 'done' ? (
                      <button
                        type="button"
                        aria-label={`Download ${img.name}`}
                        onClick={() => saveBlob(r.blob!, name(img))}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-muted hover:bg-hover hover:text-fg"
                      >
                        <Download size={14} />
                      </button>
                    ) : null
                  }
                />
              );
            })}
          </BatchList>
        </div>
      }
      panel={
        <>
          <section className="border-b border-line px-4 py-4" aria-live="polite" data-testid="savings">
            <div className="text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">You save</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[length:calc(26px*var(--text-scale))] font-semibold tracking-[-0.02em] text-fg tabular-nums">{formatBytes(Math.max(0, totals.saved))}</span>
              {totals.before > 0 && <span className={`text-sm font-semibold ${pct > 0 ? 'text-success' : 'text-danger'}`}>{pct}% smaller</span>}
            </div>
            <div className="mt-3 flex flex-col gap-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-12 text-subtle">Before</span>
                <div className="h-1.5 flex-1 rounded-full bg-muted/50" />
                <span className="w-16 text-right text-muted tabular-nums">{formatBytes(totals.before)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-12 text-subtle">After</span>
                <div className="h-1.5 flex-1">
                  <div
                    className="h-full rounded-full bg-success transition-[width] duration-300"
                    style={{ width: `${totals.before ? Math.min(100, (totals.after / totals.before) * 100) : 0}%` }}
                  />
                </div>
                <span className="w-16 text-right text-fg tabular-nums">{formatBytes(totals.after)}</span>
              </div>
            </div>
            {working && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-subtle">
                <Spinner size={11} /> Updating…
              </p>
            )}
          </section>
          <PanelSection title="Format">
            <Segmented<OutChoice>
              ariaLabel="Output format"
              value={s.format}
              onChange={(format) => set({ format })}
              options={[
                { value: 'original', label: 'Same', title: 'Keep each file’s format' },
                { value: 'jpeg', label: 'JPEG' },
                { value: 'webp', label: 'WebP' },
                { value: 'png', label: 'PNG' },
              ]}
            />
            {showQuality && (
              <Segmented<'quality' | 'size'>
                ariaLabel="Compression target"
                size="sm"
                value={s.targetKB ? 'size' : 'quality'}
                onChange={(m) => set({ targetKB: m === 'size' ? 200 : null })}
                options={[
                  { value: 'quality', label: 'By quality' },
                  { value: 'size', label: 'Target size', title: 'Find the best quality under a file size' },
                ]}
              />
            )}
            {showQuality && !s.targetKB && (
              <Slider label="Quality" value={s.quality} min={10} max={100} unit="%" onChange={(q) => set({ quality: Math.round(q) })} />
            )}
            {showQuality && s.targetKB && (
              <div className="flex items-center gap-2 text-xs text-muted">
                Max size
                <div className="w-28">
                  <NumberInput ariaLabel="Target size in KB" value={s.targetKB} min={5} max={50000} suffix="KB" onChange={(targetKB) => set({ targetKB })} />
                </div>
              </div>
            )}
            {showPng && (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted">PNG optimization</span>
                <Segmented<PngMode>
                  ariaLabel="PNG optimization"
                  size="sm"
                  value={s.pngMode}
                  onChange={(pngMode) => set({ pngMode })}
                  options={[
                    { value: 'colors', label: 'Reduce colors', title: 'Smart palette, much smaller files' },
                    { value: 'lossless', label: 'Lossless', title: 'Identical pixels' },
                  ]}
                />
                {s.pngMode === 'colors' && (
                  <Slider label="Colors" value={s.colors} min={8} max={256} step={8} onChange={(c) => set({ colors: Math.round(c) })} />
                )}
              </div>
            )}
            <p className="text-xs leading-[16px] text-subtle">
              {s.format === 'jpeg' && 'Best for photos. Transparency is filled with white.'}
              {s.format === 'webp' && 'Usually 25–35% smaller than JPEG at the same quality.'}
              {s.format === 'png' && 'Lossless format. Reducing colors gives the biggest savings for graphics and screenshots.'}
              {s.format === 'original' && 'Each image keeps its format, re-encoded more efficiently.'}
            </p>
          </PanelSection>
          <Advanced>
            {showPng && s.pngMode === 'colors' && (
              <label className="flex items-center justify-between text-xs text-muted">
                <span>Dithering (smoother gradients)</span>
                <Toggle checked={s.dither} onChange={(dither) => set({ dither })} label="Dithering" />
              </label>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Limit dimensions</span>
              <Segmented<string>
                ariaLabel="Maximum size"
                size="sm"
                value={String(s.maxSide ?? 'off')}
                onChange={(v) => set({ maxSide: v === 'off' ? null : Number(v) })}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: '3840', label: '3840' },
                  { value: '2560', label: '2560' },
                  { value: '1920', label: '1920' },
                  { value: '1280', label: '1280' },
                ]}
              />
            </div>
            <label className="flex items-center justify-between gap-3 text-xs text-muted">
              <span>Keep the original when compression doesn’t make it smaller</span>
              <Toggle checked={s.keepIfLarger} onChange={(keepIfLarger) => set({ keepIfLarger })} label="Keep original if larger" />
            </label>
            <p className="text-xs text-subtle">Re-encoded images don’t carry EXIF or other metadata.</p>
          </Advanced>
          {list.items.some((i) => current(i.id)?.status === 'error') && (
            <div className="px-4 py-3">
              <Notice tone="error">Some images couldn’t be compressed. Hover “Failed” for details.</Notice>
            </div>
          )}
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={!done.length || working} onClick={() => void downloadAll()}>
          <FolderArchive size={14} />
          {done.length > 1 ? `Download all as ZIP (${done.length})` : 'Download'}
        </Button>
      }
    />
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FolderArchive, Link2, Scaling, Unlink } from 'lucide-react';
import { Button, ColorWell, NumberInput, Segmented, Slider } from '../../components/ui/controls';
import { Tooltip } from '../../components/ui/Tooltip';
import { formatBytes } from '../../lib/utils';
import { encodeCanvas, FORMATS, withExtension } from '../shared/encode';
import { errorMessage, runBatch } from '../shared/batch';
import { createZip } from '../shared/zip';
import { BatchList } from '../shared/BatchList';
import { renderResized, type FitMode } from '../shared/geometry';
import { OutputOptions, resolveFormat, type OutChoice } from '../shared/OutputOptions';
import {
  Advanced,
  Dropzone,
  FileRow,
  Notice,
  PanelSection,
  ProgressBar,
  saveBlob,
  Spinner,
  ToolLayout,
  useFileSink,
  useImageList,
  type LoadedImage,
} from '../shared/ui';

type Mode = 'size' | 'percent' | 'preset';

interface Preset {
  id: string;
  label: string;
  w: number;
  h: number;
}

const PRESET_GROUPS: { label: string; presets: Preset[] }[] = [
  {
    label: 'Social media',
    presets: [
      { id: 'ig-post', label: 'Instagram post', w: 1080, h: 1080 },
      { id: 'ig-portrait', label: 'Instagram portrait', w: 1080, h: 1350 },
      { id: 'ig-story', label: 'Story / Reel', w: 1080, h: 1920 },
      { id: 'x-post', label: 'X post', w: 1600, h: 900 },
      { id: 'x-header', label: 'X header', w: 1500, h: 500 },
      { id: 'fb-post', label: 'Facebook post', w: 1200, h: 630 },
      { id: 'fb-cover', label: 'Facebook cover', w: 851, h: 315 },
      { id: 'li-post', label: 'LinkedIn post', w: 1200, h: 627 },
      { id: 'li-banner', label: 'LinkedIn banner', w: 1584, h: 396 },
      { id: 'yt-thumb', label: 'YouTube thumbnail', w: 1280, h: 720 },
      { id: 'pin', label: 'Pinterest pin', w: 1000, h: 1500 },
      { id: 'og', label: 'Link preview (OG)', w: 1200, h: 630 },
    ],
  },
  {
    label: 'Profile & thumbnails',
    presets: [
      { id: 'avatar-lg', label: 'Profile picture', w: 400, h: 400 },
      { id: 'avatar-sm', label: 'Small avatar', w: 128, h: 128 },
      { id: 'thumb-sq', label: 'Square thumbnail', w: 150, h: 150 },
      { id: 'thumb-wide', label: 'Video thumbnail', w: 320, h: 180 },
      { id: 'icon', label: 'App icon', w: 512, h: 512 },
    ],
  },
  {
    label: 'Screens',
    presets: [
      { id: 'hd', label: 'HD 1080p', w: 1920, h: 1080 },
      { id: 'qhd', label: 'QHD 1440p', w: 2560, h: 1440 },
      { id: '4k', label: '4K UHD', w: 3840, h: 2160 },
    ],
  },
];
const ALL_PRESETS = PRESET_GROUPS.flatMap((g) => g.presets);

interface Settings {
  mode: Mode;
  w: number;
  h: number;
  lock: boolean;
  percent: number;
  presetId: string;
  fit: FitMode;
  fill: string | null;
}

/** Output size for an image under the current settings. */
function targetSize(img: LoadedImage, s: Settings): { w: number; h: number; fixedBox: boolean } {
  if (s.mode === 'percent') {
    return { w: Math.max(1, Math.round((img.width * s.percent) / 100)), h: Math.max(1, Math.round((img.height * s.percent) / 100)), fixedBox: false };
  }
  if (s.mode === 'preset') {
    const p = ALL_PRESETS.find((x) => x.id === s.presetId)!;
    return { w: p.w, h: p.h, fixedBox: true };
  }
  if (s.lock) return { w: s.w, h: Math.max(1, Math.round((s.w * img.height) / img.width)), fixedBox: false };
  return { w: s.w, h: s.h, fixedBox: true };
}

function renderFor(img: LoadedImage, s: Settings, maxSide?: number) {
  const t = targetSize(img, s);
  let { w, h } = t;
  if (maxSide && Math.max(w, h) > maxSide) {
    const k = maxSide / Math.max(w, h);
    w = Math.max(1, Math.round(w * k));
    h = Math.max(1, Math.round(h * k));
  }
  return renderResized(img.source, w, h, t.fixedBox ? s.fit : 'stretch', t.fixedBox && s.fit === 'contain' ? s.fill : null);
}

interface Result {
  key: string;
  status: 'working' | 'done' | 'error';
  blob?: Blob;
  name?: string;
  w?: number;
  h?: number;
  error?: string;
}

export default function Resizer() {
  const [selected, setSelected] = useState<string | null>(null);
  const [s, setS] = useState<Settings>({ mode: 'size', w: 1200, h: 800, lock: true, percent: 50, presetId: 'ig-post', fit: 'cover', fill: null });
  const [format, setFormat] = useState<OutChoice>('original');
  const [quality, setQuality] = useState(90);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [running, setRunning] = useState(false);
  const list = useImageList({
    multiple: true,
    onAdded: (imgs) => {
      setSelected((cur) => cur ?? imgs[0].id);
      // Start from the first image's own size.
      if (!list.items.length) setS((p) => ({ ...p, w: imgs[0].width, h: imgs[0].height }));
    },
  });
  useFileSink(list.add);

  const sel = list.items.find((i) => i.id === selected) ?? list.items[0] ?? null;
  const set = (patch: Partial<Settings>) => setS((p) => ({ ...p, ...patch }));
  const settingsKey = JSON.stringify([s, format, quality]);
  const current = (id: string) => (results[id]?.key === settingsKey ? results[id] : undefined);

  // Live preview of the selected image.
  const previewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = previewRef.current;
    if (!host || !sel) return;
    const t = setTimeout(() => {
      const c = renderFor(sel, s, 1400);
      c.className = 'max-h-full max-w-full rounded-[4px] shadow-pop cs-checker object-contain';
      c.style.width = 'auto';
      c.style.height = 'auto';
      host.replaceChildren(c);
    }, 60);
    return () => clearTimeout(t);
  }, [sel, s]);

  const target = sel ? targetSize(sel, s) : null;
  const done = list.items.filter((i) => current(i.id)?.status === 'done');
  const pending = list.items.filter((i) => current(i.id)?.status !== 'done');

  const run = async () => {
    setRunning(true);
    const key = settingsKey;
    await runBatch(
      pending,
      async (img) => {
        const canvas = renderFor(img, s);
        try {
          const f = resolveFormat(format, img.type);
          const { blob, format: actual } = await encodeCanvas(canvas, f, quality, s.fill ?? '#ffffff');
          return { blob, name: withExtension(img.name, actual), w: canvas.width, h: canvas.height };
        } finally {
          canvas.width = canvas.height = 0;
        }
      },
      {
        concurrency: 2,
        onStart: (i) => setResults((r) => ({ ...r, [pending[i].id]: { key, status: 'working' } })),
        onDone: (i, res) => setResults((r) => ({ ...r, [pending[i].id]: { key, status: 'done', ...res } })),
        onError: (i, err) => setResults((r) => ({ ...r, [pending[i].id]: { key, status: 'error', error: errorMessage(err) } })),
      },
    );
    setRunning(false);
  };

  const downloadAll = async () => {
    const files = done.map((i) => ({ name: current(i.id)!.name!, blob: current(i.id)!.blob! }));
    if (files.length === 1) return saveBlob(files[0].blob, files[0].name);
    await saveBlob(await createZip(files), 'resized-images.zip');
  };

  const presetLabel = useMemo(() => ALL_PRESETS.find((p) => p.id === s.presetId), [s.presetId]);

  if (!list.items.length) {
    return (
      <ToolLayout
        main={<Dropzone multiple onFiles={list.add} title="Drop images to resize" icon={<Scaling size={20} />} />}
        panel={
          <PanelSection title="How it works">
            <p className="text-xs leading-[17px] text-muted">
              Add one or more images, choose exact pixels, a percentage or a preset, preview the result, then download each image or all of them as a ZIP.
            </p>
          </PanelSection>
        }
      />
    );
  }

  return (
    <ToolLayout
      main={
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6">
            <div ref={previewRef} className="flex min-h-0 w-full flex-1 items-center justify-center" data-testid="resize-preview" />
            {sel && target && (
              <div className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs text-muted tabular-nums">
                <span>
                  Original <span className="text-fg">{sel.width} × {sel.height}</span>
                </span>
                <span className="text-subtle">→</span>
                <span>
                  Output <span className="font-semibold text-accent">{target.w} × {target.h}</span>
                </span>
              </div>
            )}
          </div>
          <BatchList items={list.items} loading={list.loading} onAdd={list.add} onClear={list.clear} className="max-h-[38%] border-t border-line pt-1">
            {list.items.map((img) => {
              const r = current(img.id);
              const t = targetSize(img, s);
              return (
                <FileRow
                  key={img.id}
                  img={img}
                  selected={sel?.id === img.id}
                  onSelect={() => setSelected(img.id)}
                  onRemove={() => list.remove(img.id)}
                  status={
                    r?.status === 'working' ? (
                      <Spinner size={13} />
                    ) : r?.status === 'done' ? (
                      <span className="text-muted">
                        {r.w}×{r.h} · <span className="text-fg">{formatBytes(r.blob!.size)}</span>
                      </span>
                    ) : r?.status === 'error' ? (
                      <span className="text-danger" title={r.error}>Failed</span>
                    ) : (
                      <span className="text-subtle">→ {t.w}×{t.h}</span>
                    )
                  }
                  right={
                    r?.status === 'done' ? (
                      <button
                        type="button"
                        aria-label={`Download ${img.name}`}
                        onClick={() => saveBlob(r.blob!, r.name!)}
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
          <PanelSection title="Resize by">
            <Segmented<Mode>
              ariaLabel="Resize mode"
              value={s.mode}
              onChange={(mode) => set({ mode })}
              options={[
                { value: 'size', label: 'Pixels' },
                { value: 'percent', label: 'Percent' },
                { value: 'preset', label: 'Preset' },
              ]}
            />
            {s.mode === 'size' && (
              <>
                <div className="flex items-center gap-1.5">
                  <NumberInput
                    ariaLabel="Width"
                    prefix="W"
                    value={s.w}
                    max={16000}
                    onChange={(w) => set({ w, h: s.lock && sel ? Math.max(1, Math.round((w * sel.height) / sel.width)) : s.h })}
                  />
                  <Tooltip label={s.lock ? 'Unlock aspect ratio' : 'Lock aspect ratio'}>
                    <button
                      type="button"
                      aria-label="Lock aspect ratio"
                      aria-pressed={s.lock}
                      onClick={() => set({ lock: !s.lock, h: sel ? Math.round((s.w * sel.height) / sel.width) : s.h })}
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] ${s.lock ? 'text-accent hover:bg-hover' : 'text-subtle hover:bg-hover hover:text-fg'}`}
                    >
                      {s.lock ? <Link2 size={14} /> : <Unlink size={14} />}
                    </button>
                  </Tooltip>
                  <NumberInput
                    ariaLabel="Height"
                    prefix="H"
                    value={s.lock && sel ? Math.round((s.w * sel.height) / sel.width) : s.h}
                    max={16000}
                    onChange={(h) => (s.lock && sel ? set({ w: Math.max(1, Math.round((h * sel.width) / sel.height)), h }) : set({ h }))}
                  />
                </div>
                <p className="text-xs leading-[16px] text-subtle">
                  {s.lock ? 'With the lock on, every image is scaled to this width and keeps its proportions.' : 'Every image is made exactly this size.'}
                </p>
              </>
            )}
            {s.mode === 'percent' && (
              <>
                <Slider label="Scale" value={s.percent} min={1} max={400} unit="%" onChange={(percent) => set({ percent: Math.round(percent) })} />
                <div className="grid grid-cols-5 gap-1">
                  {[25, 50, 75, 150, 200].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => set({ percent: p })}
                      className={`h-7 rounded-[6px] text-xs font-medium tabular-nums transition-colors ${
                        s.percent === p ? 'bg-accent-soft text-accent ring-1 ring-accent' : 'bg-control text-muted hover:bg-hover hover:text-fg'
                      }`}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </>
            )}
            {s.mode === 'preset' && (
              <div className="scroll-thin flex max-h-[300px] flex-col gap-3 overflow-y-auto pr-1">
                {PRESET_GROUPS.map((g) => (
                  <div key={g.label} className="flex flex-col gap-1">
                    <span className="text-2xs font-medium text-subtle">{g.label}</span>
                    {g.presets.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={s.presetId === p.id}
                        onClick={() => set({ presetId: p.id })}
                        className={`flex h-7 items-center justify-between rounded-[6px] px-2 text-xs transition-colors ${
                          s.presetId === p.id ? 'bg-accent-soft text-fg ring-1 ring-accent' : 'text-muted hover:bg-hover hover:text-fg'
                        }`}
                      >
                        <span>{p.label}</span>
                        <span className="text-subtle tabular-nums">
                          {p.w}×{p.h}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </PanelSection>

          {(s.mode === 'preset' || (s.mode === 'size' && !s.lock)) && (
            <PanelSection title="When proportions differ">
              <Segmented<FitMode>
                ariaLabel="Fit mode"
                value={s.fit}
                onChange={(fit) => set({ fit })}
                options={[
                  { value: 'cover', label: 'Fill', title: 'Fill the frame and crop the overflow' },
                  { value: 'contain', label: 'Fit', title: 'Fit inside the frame and pad' },
                  { value: 'stretch', label: 'Stretch', title: 'Distort to the exact size' },
                ]}
              />
              {s.fit === 'contain' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => set({ fill: null })}
                    className={`h-7 rounded-[6px] px-2 text-xs ${s.fill === null ? 'bg-accent-soft text-accent ring-1 ring-accent' : 'bg-control text-muted hover:bg-hover'}`}
                  >
                    Transparent
                  </button>
                  <ColorWell label="Padding color" value={s.fill ?? '#ffffff'} onChange={(fill) => set({ fill })} />
                </div>
              )}
              {presetLabel && s.mode === 'preset' && (
                <p className="text-xs text-subtle">
                  {presetLabel.label}: {presetLabel.w} × {presetLabel.h}px
                </p>
              )}
            </PanelSection>
          )}

          <PanelSection title="Export">
            <OutputOptions format={format} quality={quality} onFormat={setFormat} onQuality={setQuality} allowOriginal />
          </PanelSection>
          <Advanced>
            <p className="text-xs leading-[16px] text-subtle">
              Downscaling uses multi-step filtering for sharp results. Enlarging beyond 100% can’t add detail; use the Image Upscaler for AI enlargement.
            </p>
          </Advanced>
          {list.items.some((i) => current(i.id)?.status === 'error') && (
            <div className="px-4 py-3">
              <Notice tone="error">Some images failed to resize. Hover “Failed” for details.</Notice>
            </div>
          )}
        </>
      }
      footer={
        <>
          {running && <ProgressBar value={done.length / list.items.length} label={<span>Resizing… {done.length}/{list.items.length}</span>} />}
          <Button variant="primary" className="h-8" disabled={!pending.length || running} onClick={run}>
            <Scaling size={14} />
            {pending.length ? `Resize ${pending.length} ${pending.length === 1 ? 'image' : 'images'}` : 'All resized'}
          </Button>
          <Button className="h-8" disabled={!done.length || running} onClick={() => void downloadAll()}>
            <FolderArchive size={14} />
            {done.length > 1 ? `Download all as ZIP (${done.length})` : 'Download'}
          </Button>
          <p className="text-center text-2xs text-subtle">
            {format === 'original' ? 'Keeps each file’s format' : `Saves as ${FORMATS[format].label}`}
          </p>
        </>
      }
    />
  );
}

import { useEffect, useRef, useState } from 'react';
import { Copy, Download, Expand, Sparkles } from 'lucide-react';
import { Button, Segmented } from '../../components/ui/controls';
import { formatBytes } from '../../lib/utils';
import { canvasToBlob, createCanvas, ctx2d } from '../../engine/images';
import { showToast } from '../../store/actions';
import { encodeCanvas, withExtension, type OutFormat } from '../shared/encode';
import { baseName } from '../shared/files';
import { renderResized } from '../shared/geometry';
import { OutputOptions, type OutChoice } from '../shared/OutputOptions';
import { errorMessage } from '../shared/batch';
import { goAbout } from '../../app/route';
import { AiBadge, CompareSlider, copyImage, Dropzone, Notice, PanelSection, saveBlob, ToolLayout, useBlobUrl, useFileSink, useImageList } from '../shared/ui';
import { describeAiError, isModelCached, type DownloadProgress } from '../ai/runtime';
import { ModelStatus, type AiPhase } from '../ai/ModelStatus';
import { loadUpscaler, readyModels, SR_MODELS, upscale, type Scale } from './sr';

interface Output {
  scale: Scale;
  canvas: HTMLCanvasElement;
  aiBlob: Blob;
  baseline: Blob;
  inputW: number;
  inputH: number;
}

export default function Upscaler() {
  const list = useImageList({ multiple: false });
  useFileSink(list.add);
  const img = list.items[0] ?? null;
  const [scale, setScale] = useState<Scale>(2);
  const [phase, setPhase] = useState<AiPhase | 'idle'>('idle');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [tiles, setTiles] = useState<{ done: number; total: number; started: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<Output | null>(null);
  const [cached, setCached] = useState<Record<number, boolean>>({});
  const [zoom, setZoom] = useState<'fit' | 'actual'>('fit');
  const [format, setFormat] = useState<OutChoice>('png');
  const [quality, setQuality] = useState(92);
  const signal = useRef({ cancelled: false });

  const model = SR_MODELS[scale];
  const aiUrl = useBlobUrl(out?.aiBlob ?? null);
  const baseUrl = useBlobUrl(out?.baseline ?? null);

  useEffect(() => {
    void Promise.all(([2, 4] as Scale[]).map(async (s) => [s, readyModels.has(s) || (await isModelCached(SR_MODELS[s]))] as const)).then((r) =>
      setCached(Object.fromEntries(r)),
    );
  }, [phase]);

  useEffect(() => {
    setOut(null);
    setPhase('idle');
    setError(null);
  }, [img]);

  const tooBig = img ? Math.max(img.width, img.height) > model.maxSide : false;
  const inputSize = img
    ? tooBig
      ? { w: Math.round((img.width * model.maxSide) / Math.max(img.width, img.height)), h: Math.round((img.height * model.maxSide) / Math.max(img.width, img.height)) }
      : { w: img.width, h: img.height }
    : null;

  const run = async () => {
    if (!img || !inputSize) return;
    setError(null);
    setOut(null);
    const token = { cancelled: false };
    signal.current = token;
    try {
      if (!readyModels.has(scale)) {
        setPhase('downloading');
        setProgress(null);
        await loadUpscaler(scale, setProgress);
      }
      setPhase('processing');
      setTiles({ done: 0, total: 1, started: performance.now() });
      const src = tooBig ? renderResized(img.source, inputSize.w, inputSize.h, 'stretch') : img.source;
      const started = performance.now();
      const canvas = await upscale(src, scale, {
        signal: token,
        onTile: (done, total) => setTiles({ done, total, started }),
      });
      // Baseline: the same enlargement with standard (bicubic-like) resampling.
      const base = createCanvas(canvas.width, canvas.height);
      const bctx = ctx2d(base);
      bctx.imageSmoothingEnabled = true;
      bctx.imageSmoothingQuality = 'high';
      bctx.drawImage(src, 0, 0, base.width, base.height);
      const [aiBlob, baseline] = await Promise.all([canvasToBlob(canvas, 'image/png'), canvasToBlob(base, 'image/png')]);
      base.width = base.height = 0;
      setOut({ scale, canvas, aiBlob, baseline, inputW: inputSize.w, inputH: inputSize.h });
      setPhase('ready');
    } catch (err) {
      if (token.cancelled) {
        setPhase('idle');
        showToast('Upscaling cancelled', 'info');
        return;
      }
      console.error(err);
      setError(describeAiError(err, 'upscaling'));
      setPhase('error');
    } finally {
      setTiles(null);
    }
  };

  const eta = (() => {
    if (!tiles || tiles.done === 0) return 'Starting…';
    const per = (performance.now() - tiles.started) / tiles.done;
    const left = Math.max(0, Math.round((per * (tiles.total - tiles.done)) / 1000));
    return `Tile ${tiles.done} of ${tiles.total} · about ${left < 60 ? `${left}s` : `${Math.round(left / 60)} min`} left`;
  })();

  const exportOut = async (kind: 'save' | 'copy') => {
    if (!out || !img) return;
    try {
      if (kind === 'copy') return void (await copyImage(out.aiBlob));
      const f: OutFormat = format === 'original' ? 'png' : format;
      const blob = f === 'png' ? out.aiBlob : (await encodeCanvas(out.canvas, f, quality)).blob;
      await saveBlob(blob, withExtension(`${baseName(img.name)}-${out.scale}x`, f));
    } catch (err) {
      showToast(`Export failed: ${errorMessage(err)}`, 'error');
    }
  };

  if (!img) {
    return (
      <ToolLayout
        main={<Dropzone onFiles={list.add} title="Drop an image to upscale" icon={<Expand size={20} />} hint="Best for small images, icons, screenshots and photos" />}
        panel={
          <PanelSection title="How it works">
            <p className="text-xs leading-[17px] text-muted">
              Enlarge small images 2× or 4×. A super-resolution model rebuilds edges and texture instead of stretching pixels, and the comparison slider shows the difference against a standard resize.
            </p>
          </PanelSection>
        }
      />
    );
  }

  const busy = phase === 'downloading' || phase === 'processing';
  const showStatus = phase === 'downloading' || phase === 'processing' || phase === 'error';

  return (
    <ToolLayout
      main={
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-panel px-3 py-1.5">
            <span className="flex items-center gap-2 text-xs text-muted tabular-nums">
              {out ? (
                <>
                  <AiBadge /> Enhanced with {SR_MODELS[out.scale].label}
                </>
              ) : (
                <>Original preview</>
              )}
            </span>
            <div className="w-[140px]">
              <Segmented<'fit' | 'actual'>
                ariaLabel="Zoom"
                size="sm"
                value={zoom}
                onChange={setZoom}
                options={[
                  { value: 'fit', label: 'Fit' },
                  { value: 'actual', label: '100%' },
                ]}
              />
            </div>
          </div>
          <div
            className={`flex min-h-0 flex-1 p-6 ${zoom === 'actual' && out ? 'scroll-thin items-start justify-start overflow-auto' : 'items-center justify-center'}`}
            style={zoom === 'fit' || !out ? { containerType: 'size' } : undefined}
          >
            {out && aiUrl && baseUrl ? (
              <CompareSlider
                before={baseUrl}
                after={aiUrl}
                width={out.canvas.width}
                height={out.canvas.height}
                beforeLabel="Standard resize"
                afterLabel="AI upscaled"
                natural={zoom === 'actual'}
                checker
              />
            ) : (
              <img
                src={img.url}
                alt={img.name}
                className={`cs-checker rounded-[6px] shadow-pop ${zoom === 'actual' ? '' : 'max-h-full max-w-full object-contain'}`}
                style={{ imageRendering: zoom === 'actual' ? 'pixelated' : undefined }}
              />
            )}
          </div>
          {showStatus && (
            <ModelStatus
              model={model}
              phase={phase as AiPhase}
              progress={progress}
              processingLabel={`AI upscaling ${scale}×…`}
              processingProgress={tiles ? tiles.done / tiles.total : null}
              detail={eta}
              error={error}
              onStart={() => void run()}
              onRetry={() => void run()}
              onCancel={() => (signal.current.cancelled = true)}
            />
          )}
        </div>
      }
      panel={
        <>
          <PanelSection title="Enlargement">
            <Segmented<string>
              ariaLabel="Scale"
              value={String(scale)}
              onChange={(v) => setScale(Number(v) as Scale)}
              options={[
                { value: '2', label: '2×' },
                { value: '4', label: '4×' },
              ]}
            />
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-subtle">Original</dt>
              <dd className="text-right text-fg tabular-nums">
                {img.width} × {img.height}
              </dd>
              <dt className="text-subtle">Output</dt>
              <dd className="text-right font-semibold text-accent tabular-nums">
                {inputSize!.w * scale} × {inputSize!.h * scale}
              </dd>
              <dt className="text-subtle">Model</dt>
              <dd className="text-right text-muted">{model.label}</dd>
            </dl>
            {tooBig && (
              <Notice>
                To keep processing time reasonable, images larger than {model.maxSide}px are first reduced to {inputSize!.w} × {inputSize!.h}. For bigger results, crop to the area you need first.
              </Notice>
            )}
            {!cached[scale] && !readyModels.has(scale) && (
              <p className="text-xs leading-[16px] text-subtle">
                Needs a {formatBytes(model.bytes)} model the first time.{' '}
                <button type="button" onClick={goAbout} className="text-accent hover:underline">
                  Details
                </button>
              </p>
            )}
          </PanelSection>
          {out && (
            <PanelSection title="Export">
              <OutputOptions format={format} quality={quality} onFormat={setFormat} onQuality={setQuality} />
            </PanelSection>
          )}
          <PanelSection title="Image">
            <div className="flex items-center justify-between text-xs">
              <span className="truncate text-muted">{img.name}</span>
              <span className="shrink-0 text-subtle">{formatBytes(img.size)}</span>
            </div>
            <button type="button" onClick={() => list.clear()} className="self-start text-xs text-accent hover:underline">
              Use a different image
            </button>
          </PanelSection>
        </>
      }
      footer={
        <>
          <Button variant={out ? 'secondary' : 'primary'} className="h-8" disabled={busy} onClick={() => void run()}>
            <Sparkles size={14} />
            {out ? `Upscale again ${scale}×` : `Upscale ${scale}× with AI`}
          </Button>
          {out && (
            <div className="flex gap-2">
              <Button variant="primary" className="h-8 flex-1" onClick={() => void exportOut('save')}>
                <Download size={14} /> Download
              </Button>
              <Button className="h-8" onClick={() => void exportOut('copy')}>
                <Copy size={13} /> Copy
              </Button>
            </div>
          )}
        </>
      }
    />
  );
}

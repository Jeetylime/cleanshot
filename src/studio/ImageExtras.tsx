import { useState } from 'react';
import { Eraser, ImagePlus, Sparkles, X } from 'lucide-react';
import { Section, Slider, Button } from '../components/ui/controls';
import { Tooltip } from '../components/ui/Tooltip';
import { pickFiles } from '../tools/shared/ui';
import { formatBytes } from '../lib/utils';
import { showToast } from '../store/actions';
import * as A from './actions';
import { FILTER_PRESETS, NO_ADJUST, type Adjust } from './imageFx';
import { SHAPE_LABELS } from './factory';
import type { ImageElement, ShapeKind } from './types';

const MASKS: (ShapeKind | null)[] = [null, 'ellipse', 'rect', 'triangle', 'star', 'hexagon', 'diamond', 'heart', 'bubble'];

export function FrameShapeGlyph({ shape }: { shape: ShapeKind | null }) {
  const d: Record<string, string> = {
    none: 'M5 7h22v18H5z',
    rect: 'M8 6h16a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z',
    ellipse: 'M16 4a12 12 0 1 1 0 24a12 12 0 1 1 0-24z',
    triangle: 'M16 4 29 27H3z',
    star: 'M16 3l3.9 8.3 9.1 1.1-6.7 6.2 1.8 9L16 23.2 7.9 27.6l1.8-9L3 12.4l9.1-1.1z',
    hexagon: 'M29 16 22.5 27.3H9.5L3 16 9.5 4.7h13z',
    diamond: 'M16 3 29 16 16 29 3 16z',
    heart: 'M16 27C8 21 3 16.5 3 11a6.5 6.5 0 0 1 13-1 6.5 6.5 0 0 1 13 1c0 5.5-5 10-13 16z',
    bubble: 'M6 5h20a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H14l-6 5v-5H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z',
  };
  return (
    <svg viewBox="0 0 32 32" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d={d[shape ?? 'none']} />
    </svg>
  );
}

/** Frame shape, adjustments, filters and AI actions for an image element. */
export function ImageExtras({ e }: { e: ImageElement }) {
  const up = (p: Partial<ImageElement>, key?: string) => A.updateElements<ImageElement>([e.id], p, key);
  const adj: Adjust = { ...NO_ADJUST, ...e.adjust };
  const setAdj = (p: Partial<Adjust>, key: string) => up({ adjust: { ...adj, ...p } }, key);
  const empty = !e.assetId;

  return (
    <>
      {empty && (
        <Section title="Frame">
          <p className="text-xs leading-[17px] text-muted">Drop a photo onto this frame, or choose one. It’s cropped to fill the shape.</p>
          <Button variant="primary" onClick={() => pickFiles(false, (f) => f[0] && void A.fillFrame(e.id, f[0]))} className="w-full">
            <ImagePlus size={13} /> Choose a photo
          </Button>
        </Section>
      )}
      <Section title="Shape">
        <div className="grid grid-cols-9 gap-0.5 rounded-[8px] bg-control p-0.5" role="radiogroup" aria-label="Frame shape">
          {MASKS.map((m) => {
            const active = (e.mask ?? null) === m || (m === null && e.mask === 'rect' && false);
            return (
              <Tooltip key={m ?? 'none'} label={m ? SHAPE_LABELS[m] : 'No frame'}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={m ? SHAPE_LABELS[m] : 'No frame'}
                  onClick={() => up({ mask: m })}
                  className={`flex h-7 w-full items-center justify-center rounded-[6px] ${active ? 'bg-elevated text-fg shadow-soft' : 'text-muted hover:text-fg'}`}
                >
                  <FrameShapeGlyph shape={m} />
                </button>
              </Tooltip>
            );
          })}
        </div>
      </Section>
      {!empty && (
        <>
          <Section title="Filters">
            <div className="grid grid-cols-5 gap-1">
              {FILTER_PRESETS.map((f) => {
                const active = JSON.stringify(f.adjust) === JSON.stringify(adj);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => up({ adjust: { ...f.adjust } })}
                    aria-pressed={active}
                    className={`flex h-8 items-center justify-center rounded-[7px] px-1 text-[10.5px] font-medium ${active ? 'bg-accent-soft text-fg ring-1 ring-accent' : 'bg-control text-muted hover:bg-hover hover:text-fg'}`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </Section>
          <Section
            title="Adjust"
            action={
              <button type="button" onClick={() => up({ adjust: { ...NO_ADJUST } })} className="text-2xs text-accent hover:underline">
                Reset
              </button>
            }
          >
            <Slider label="Brightness" value={adj.brightness} min={-100} max={100} onChange={(v) => setAdj({ brightness: v }, 'adj-b')} />
            <Slider label="Contrast" value={adj.contrast} min={-100} max={100} onChange={(v) => setAdj({ contrast: v }, 'adj-c')} />
            <Slider label="Saturation" value={adj.saturation} min={-100} max={100} onChange={(v) => setAdj({ saturation: v }, 'adj-s')} />
            <Slider label="Warmth" value={adj.warmth} min={-100} max={100} onChange={(v) => setAdj({ warmth: v }, 'adj-w')} />
            <Slider label="Blur" value={adj.blur} min={0} max={40} unit="px" onChange={(v) => setAdj({ blur: v }, 'adj-bl')} />
            <Slider label="Grayscale" value={adj.grayscale} min={0} max={100} unit="%" onChange={(v) => setAdj({ grayscale: v }, 'adj-g')} />
            <Slider label="Sepia" value={adj.sepia} min={0} max={100} unit="%" onChange={(v) => setAdj({ sepia: v }, 'adj-sp')} />
          </Section>
          <AiActions e={e} />
        </>
      )}
    </>
  );
}

type Job = { kind: 'bg' | 'up'; label: string; fraction: number | null };

function AiActions({ e }: { e: ImageElement }) {
  const [job, setJob] = useState<Job | null>(null);
  const [ask, setAsk] = useState<'bg' | 'up' | null>(null);

  const start = async (kind: 'bg' | 'up') => {
    const rt = await import('../tools/ai/runtime');
    const info = kind === 'bg' ? (await import('../tools/bgremove/segment')).RMBG : (await import('../tools/upscaler/sr')).SR_MODELS[2];
    if (!(await rt.isModelCached(info)) && ask !== kind) {
      setAsk(kind);
      return;
    }
    setAsk(null);
    setJob({ kind, label: 'Starting', fraction: null });
    try {
      const progress = (label: string, fraction: number | null) => setJob({ kind, label, fraction });
      if (kind === 'bg') await A.removeBackground(e.id, progress);
      else await A.upscaleElement(e.id, progress);
      showToast(kind === 'bg' ? 'Background removed. Undo brings it back.' : 'Image upscaled 2×.', 'success');
    } catch (err) {
      showToast(rt.describeAiError(err, kind === 'bg' ? 'background removal' : 'upscaling'), 'error');
    } finally {
      setJob(null);
    }
  };

  return (
    <Section title="AI tools">
      <div className="grid grid-cols-2 gap-1">
        <Button onClick={() => void start('bg')} disabled={!!job} title="Cut out the subject (runs on this device)">
          <Eraser size={12} /> Remove background
        </Button>
        <Button onClick={() => void start('up')} disabled={!!job} title="Sharpen and enlarge 2× (runs on this device)">
          <Sparkles size={12} /> Upscale 2×
        </Button>
      </div>
      {job && (
        <div className="flex flex-col gap-1.5" role="status">
          <span className="text-xs text-muted">{job.label}…</span>
          <div className="h-1 overflow-hidden rounded-full bg-control">
            <div className={`h-full rounded-full bg-accent-fill ${job.fraction === null ? 'w-1/3 animate-pulse' : ''}`} style={job.fraction === null ? undefined : { width: `${Math.round(job.fraction * 100)}%` }} />
          </div>
        </div>
      )}
      {ask && <ModelPrompt kind={ask} onCancel={() => setAsk(null)} onConfirm={() => void start(ask)} />}
      <p className="text-2xs leading-[14px] text-subtle">Runs on this device. Your image isn’t uploaded.</p>
    </Section>
  );
}

function ModelPrompt({ kind, onCancel, onConfirm }: { kind: 'bg' | 'up'; onCancel: () => void; onConfirm: () => void }) {
  const bytes = kind === 'bg' ? 44_000_000 : 7_000_000;
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-line-strong bg-window p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-fg">Download the {kind === 'bg' ? 'background removal' : 'upscaling'} model?</p>
        <button type="button" aria-label="Cancel" onClick={onCancel} className="text-muted hover:text-fg">
          <X size={13} />
        </button>
      </div>
      <p className="text-2xs leading-[14px] text-muted">
        About {formatBytes(bytes)}, once, from Hugging Face. After that it works offline.
        {kind === 'bg' && ' This model is licensed for non-commercial use only.'}{' '}
        <a href="#privacy-policy" className="text-accent hover:underline">
          Details
        </a>
      </p>
      <Button variant="primary" onClick={onConfirm}>
        Download and continue
      </Button>
    </div>
  );
}

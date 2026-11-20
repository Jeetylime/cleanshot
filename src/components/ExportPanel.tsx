import { useEffect, useMemo, useRef, useState } from 'react';
import { Columns2, Copy, Download, Frame, Link2, Loader2, Share, Unlink } from 'lucide-react';
import { chooseFiles } from '../lib/filePicker';
import * as batch from '../store/batch';
import { shareSupported } from '../lib/fileSave';
import { store, useEditor, shallowEqual } from '../store/store';
import * as actions from '../store/actions';
import { clampExportSize, exportDocument, outputSize, EXTENSION } from '../engine/export';
import { Button, NumberInput, Segmented, Slider } from './ui/controls';
import { Tooltip } from './ui/Tooltip';
import { formatBytes } from '../lib/utils';
import type { ExportFormat } from '../types';

const SCALES = [0.5, 1, 2, 3];

export function ExportPanel() {
  const { doc, prefs } = useEditor((s) => ({ doc: s.doc, prefs: s.exportPrefs }), shallowEqual);
  const base = useMemo(() => (doc ? outputSize(doc) : { width: 1, height: 1 }), [doc]);
  const [locked, setLocked] = useState(true);
  const [size, setSize] = useState(() => ({
    w: Math.round(base.width * prefs.scale),
    h: Math.round(base.height * prefs.scale),
  }));
  const [name, setName] = useState(doc?.name ?? '');
  const [estimate, setEstimate] = useState<{ bytes: number; key: string } | null>(null);
  const [estimating, setEstimating] = useState(false);
  const reqId = useRef(0);

  // Keep the custom size in sync when the document's output size changes.
  useEffect(() => {
    if (locked) setSize({ w: Math.round(base.width * prefs.scale), h: Math.round(base.height * prefs.scale) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.width, base.height]);

  const clamped = clampExportSize(size.w, size.h);
  const key = `${prefs.format}|${prefs.quality}|${clamped.width}x${clamped.height}`;

  // Debounced file-size estimate.
  useEffect(() => {
    if (!doc) return;
    if (clamped.width * clamped.height > 50_000_000) {
      setEstimate(null);
      return;
    }
    const id = ++reqId.current;
    setEstimating(true);
    const t = setTimeout(async () => {
      try {
        const r = await exportDocument(store.get().doc!, {
          format: prefs.format,
          quality: prefs.quality,
          width: clamped.width,
          height: clamped.height,
        });
        if (id === reqId.current) setEstimate({ bytes: r.blob.size, key });
      } catch {
        if (id === reqId.current) setEstimate(null);
      } finally {
        if (id === reqId.current) setEstimating(false);
      }
    }, 380);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, doc]);

  if (!doc) return null;

  const setScale = (scale: number) => {
    actions.setExportPrefs({ scale });
    setLocked(true);
    setSize({ w: Math.round(base.width * scale), h: Math.round(base.height * scale) });
  };
  const setW = (w: number) => {
    if (locked) {
      const scale = w / base.width;
      setSize({ w, h: Math.max(1, Math.round(base.height * scale)) });
      actions.setExportPrefs({ scale });
    } else setSize((s) => ({ ...s, w }));
  };
  const setH = (h: number) => {
    if (locked) {
      const scale = h / base.height;
      setSize({ w: Math.max(1, Math.round(base.width * scale)), h });
      actions.setExportPrefs({ scale });
    } else setSize((s) => ({ ...s, h }));
  };

  const activeScale = locked ? SCALES.find((s) => Math.abs(base.width * s - size.w) < 1) : undefined;
  const lossy = prefs.format !== 'png';

  const commitName = () => {
    if (name.trim() && name.trim() !== doc.name) actions.renameDoc(name.trim());
  };

  const canShare = shareSupported({ name: `image.${prefs.format === 'jpeg' ? 'jpg' : prefs.format}`, type: `image/${prefs.format}` });

  const save = () => {
    commitName();
    void actions.exportAndDownload({ format: prefs.format, quality: prefs.quality, width: clamped.width, height: clamped.height });
    actions.openOverlay(null);
  };

  return (
    <div className="flex flex-col" data-testid="export-panel">
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
        <h2 className="text-[length:calc(13px*var(--text-scale))] font-semibold">Export</h2>
        <span className="text-xs text-subtle">Rendered locally</span>
      </div>

      <div className="flex flex-col gap-3 px-3.5 pb-3">
        <label className="flex h-8 items-center gap-1 rounded-[7px] bg-control pr-2 pl-2.5 text-sm ring-accent focus-within:ring-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') save();
            }}
            aria-label="File name"
            className="min-w-0 flex-1 bg-transparent text-fg outline-none"
          />
          <span className="text-subtle">.{EXTENSION[prefs.format]}</span>
        </label>

        <Segmented<ExportFormat>
          ariaLabel="Format"
          value={prefs.format}
          onChange={(format) => actions.setExportPrefs({ format })}
          options={[
            { value: 'png', label: 'PNG' },
            { value: 'jpeg', label: 'JPEG' },
            { value: 'webp', label: 'WebP' },
          ]}
        />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Size</span>
            <div className="flex gap-0.5">
              {SCALES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScale(s)}
                  className={`h-5 rounded-[5px] px-1.5 text-xs font-medium tabular-nums transition-colors ${
                    activeScale === s ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-fg'
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <NumberInput ariaLabel="Export width" prefix="W" value={size.w} onChange={setW} max={16384} />
            <Tooltip label={locked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}>
              <button
                type="button"
                aria-label="Lock aspect ratio"
                aria-pressed={locked}
                onClick={() => {
                  if (!locked) setSize({ w: size.w, h: Math.round((size.w / base.width) * base.height) });
                  setLocked(!locked);
                }}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] transition-colors ${
                  locked ? 'text-accent hover:bg-hover' : 'text-subtle hover:bg-hover hover:text-fg'
                }`}
              >
                {locked ? <Link2 size={14} /> : <Unlink size={14} />}
              </button>
            </Tooltip>
            <NumberInput ariaLabel="Export height" prefix="H" value={size.h} onChange={setH} max={16384} />
          </div>
          {clamped.width !== size.w || clamped.height !== size.h ? (
            <p className="text-xs text-danger">
              Limited to {clamped.width} × {clamped.height} by browser canvas limits.
            </p>
          ) : null}
        </div>

        {lossy && (
          <Slider
            label="Quality"
            value={prefs.quality}
            min={10}
            max={100}
            unit="%"
            onChange={(quality) => actions.setExportPrefs({ quality: Math.round(quality) })}
          />
        )}

        <div className="flex h-4 items-center justify-between text-xs text-subtle">
          <span className="tabular-nums">
            {clamped.width} × {clamped.height} px
          </span>
          <span className="flex items-center gap-1 tabular-nums">
            {estimating && <Loader2 size={11} className="animate-spin-slow" />}
            {estimate ? `≈ ${formatBytes(estimate.bytes)}` : estimating ? 'Estimating…' : ''}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-line px-3.5 py-2.5">
        <span className="text-2xs font-semibold tracking-wide text-subtle uppercase">More</span>
        <button type="button" className="flex h-[24px] items-center gap-2 text-left text-xs text-fg hover:text-accent" onClick={() => chooseFiles((f) => void batch.batchFrame(f), { multiple: true })}>
          <Frame size={13} className="text-muted" /> Frame more images with this style…
        </button>
        <div className="flex items-center gap-2 text-xs">
          <Columns2 size={13} className="text-muted" />
          <span className="text-fg">Before/after:</span>
          {(['side', 'stacked', 'gif'] as const).map((l) => (
            <button key={l} type="button" className="h-[24px] font-medium text-accent hover:underline" onClick={() => chooseFiles((f) => void batch.beforeAfter(f[0], l))}>
              {l === 'side' ? 'Side by side' : l === 'stacked' ? 'Stacked' : 'GIF'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 border-t border-line px-3.5 py-3">
        <Button
          className="flex-1"
          onClick={() => {
            void actions.copyImageToClipboard();
          }}
        >
          <Copy size={13} />
          Copy
        </Button>
        {canShare && (
          <Button
            className="flex-1"
            onClick={() => {
              commitName();
              void actions.exportAndShare({ format: prefs.format, quality: prefs.quality, width: clamped.width, height: clamped.height });
            }}
          >
            <Share size={13} />
            Share
          </Button>
        )}
        <Button variant="primary" className="flex-1" onClick={save}>
          <Download size={13} strokeWidth={2.25} />
          Save {prefs.format === 'jpeg' ? 'JPEG' : prefs.format.toUpperCase()}
        </Button>
      </div>
    </div>
  );
}

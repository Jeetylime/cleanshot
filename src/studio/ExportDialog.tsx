import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, Lock, Unlock, X } from 'lucide-react';
import { Button, Segmented, Slider, Toggle, NumberInput } from '../components/ui/controls';
import { canvasToBlob } from '../engine/images';
import { clampExportSize, downloadBlob, EXTENSION, MIME, clipboardSupported, writeImageToClipboard } from '../engine/export';
import { formatBytes } from '../lib/utils';
import { showToast } from '../store/actions';
import type { ExportFormat } from '../types';
import { studio, useStudio } from './store';
import { loadFontsFor } from './fonts';
import { renderToCanvas } from './render';
import { loadAsset } from './actions';
import type { TextElement } from './types';

const PREFS_KEY = 'cleanshot:studio-export';

interface Prefs {
  format: ExportFormat;
  quality: number;
}

function loadPrefs(): Prefs {
  try {
    return { format: 'png', quality: 90, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return { format: 'png', quality: 90 };
  }
}

export function ExportDialog() {
  const doc = useStudio((s) => s.doc);
  const open = useStudio((s) => s.exportOpen);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [scale, setScale] = useState(1);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [lockAspect, setLockAspect] = useState(true);
  const [name, setName] = useState('');
  const [preview, setPreview] = useState<{ url: string; bytes: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && doc) {
      setName(doc.name);
      setSize(null);
      setScale(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  const out = useMemo(() => {
    if (!doc) return { width: 1, height: 1, clamped: false };
    const w = size?.w ?? Math.round(doc.width * scale);
    const h = size?.h ?? Math.round(doc.height * scale);
    return clampExportSize(w, h);
  }, [doc, scale, size]);

  const canTransparent = prefs.format !== 'jpeg';
  const bgIsTransparent = doc?.background.kind === 'transparent';
  // Drops a non-transparent page background for PNG/WebP
  const [removeBg, setRemoveBg] = useState(false);

  const render = async (): Promise<Blob | null> => {
    if (!doc) return null;
    await loadFontsFor(doc.elements.filter((e): e is TextElement => e.type === 'text'));
    await Promise.all(doc.elements.filter((e) => e.type === 'image').map((e) => loadAsset((e as { assetId: string }).assetId)));
    const sx = out.width / doc.width;
    const noBg = removeBg && canTransparent;
    const matte = prefs.format === 'jpeg' && (bgIsTransparent || removeBg) ? '#ffffff' : null;
    const c = renderToCanvas(doc, sx, { background: !noBg, matte });
    // renderToCanvas scales uniformly from width; stretch if a custom height breaks the aspect
    let canvas = c;
    if (Math.abs(c.height - out.height) > 1) {
      const { resample } = await import('../engine/images');
      canvas = resample(c, out.width, out.height);
    }
    return canvasToBlob(canvas, MIME[prefs.format], prefs.format === 'png' ? undefined : prefs.quality / 100);
  };

  // Live preview + size estimate (debounced)
  useEffect(() => {
    if (!open || !doc) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const blob = await render();
        if (!blob || cancelled) return;
        setPreview((p) => {
          if (p) URL.revokeObjectURL(p.url);
          return { url: URL.createObjectURL(blob), bytes: blob.size };
        });
      } catch {
        /* preview is best-effort */
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc, out.width, out.height, prefs.format, prefs.quality, removeBg]);

  useEffect(() => {
    if (!open) return;
    dialog.current?.focus();
  }, [open]);

  if (!open || !doc) return null;
  const close = () => studio.set({ exportOpen: false });
  const fileName = `${(name.trim() || doc.name).replace(/[\\/:*?"<>|]+/g, '-')}.${EXTENSION[prefs.format]}`;

  const download = async () => {
    setBusy(true);
    try {
      const blob = await render();
      if (!blob) return;
      const r = await downloadBlob(blob, fileName);
      if (r === 'saved') {
        showToast(`Saved ${fileName}`, 'success');
        close();
      }
    } catch {
      showToast('Export failed. Try a smaller size.', 'error');
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    setBusy(true);
    try {
      const png = async () => {
        const c = renderToCanvas(doc, out.width / doc.width, { background: !(removeBg && canTransparent) });
        return canvasToBlob(c, 'image/png');
      };
      await loadFontsFor(doc.elements.filter((e): e is TextElement => e.type === 'text'));
      await writeImageToClipboard(png());
      showToast('Copied to the clipboard', 'success');
    } catch {
      showToast('Couldn’t copy in this browser. Download instead.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const setW = (w: number) => setSize({ w, h: lockAspect ? Math.round((w * doc.height) / doc.width) : size?.h ?? out.height });
  const setH = (h: number) => setSize({ h, w: lockAspect ? Math.round((h * doc.width) / doc.height) : size?.w ?? out.width });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 animate-fade-in" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Download design"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            close();
          }
        }}
        className="flex max-h-[92dvh] w-full max-w-[820px] flex-col overflow-hidden rounded-[16px] border border-line-strong bg-elevated shadow-pop outline-none animate-pop-in md:flex-row"
      >
        <div className="cs-checker flex min-h-[200px] flex-1 items-center justify-center p-5 max-md:max-h-[34vh]">
          {preview ? (
            <img src={preview.url} alt="Export preview" className="max-h-full max-w-full object-contain shadow-pop md:max-h-[60vh]" />
          ) : (
            <span className="text-xs text-muted">Rendering preview…</span>
          )}
        </div>
        <div className="scroll-thin flex w-full shrink-0 flex-col gap-3.5 overflow-y-auto border-line p-4 md:w-[300px] md:border-l">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-fg">Download</h2>
            <button type="button" aria-label="Close" onClick={close} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-muted hover:bg-hover hover:text-fg">
              <X size={15} />
            </button>
          </div>
          <label className="flex flex-col gap-1.5 text-xs text-muted">
            File name
            <span className="flex h-8 items-center rounded-[7px] bg-control px-2.5 ring-accent focus-within:ring-1">
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none" aria-label="File name" />
              <span className="text-subtle">.{EXTENSION[prefs.format]}</span>
            </span>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Format</span>
            <Segmented
              ariaLabel="Format"
              value={prefs.format}
              onChange={(f) => setPrefs({ ...prefs, format: f })}
              options={[
                { value: 'png', label: 'PNG' },
                { value: 'jpeg', label: 'JPEG' },
                { value: 'webp', label: 'WebP' },
              ]}
            />
          </div>
          {prefs.format !== 'png' && <Slider label="Quality" value={prefs.quality} min={30} max={100} unit="%" onChange={(v) => setPrefs({ ...prefs, quality: v })} />}
          {canTransparent ? (
            <label className="flex items-center justify-between gap-2 text-xs text-muted">
              <span>{bgIsTransparent ? 'Transparent background' : 'Remove page background'}</span>
              <Toggle checked={bgIsTransparent || removeBg} onChange={setRemoveBg} label="Transparent background" disabled={bgIsTransparent} />
            </label>
          ) : (
            bgIsTransparent && <p className="text-2xs text-subtle">JPEG doesn’t support transparency; the background will be white.</p>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Size</span>
            <Segmented
              ariaLabel="Scale"
              value={size ? 0 : scale}
              onChange={(v) => {
                setSize(null);
                setScale(v || 1);
              }}
              options={[
                { value: 0.5, label: '0.5×' },
                { value: 1, label: '1×' },
                { value: 2, label: '2×' },
                { value: 3, label: '3×' },
              ]}
            />
            <div className="flex items-center gap-1.5">
              <NumberInput ariaLabel="Output width" prefix="W" value={out.width} min={1} max={16384} onChange={setW} />
              <button type="button" aria-label={lockAspect ? 'Unlock proportions' : 'Lock proportions'} aria-pressed={lockAspect} onClick={() => setLockAspect((l) => !l)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-muted hover:bg-hover hover:text-fg">
                {lockAspect ? <Lock size={13} /> : <Unlock size={13} />}
              </button>
              <NumberInput ariaLabel="Output height" prefix="H" value={out.height} min={1} max={16384} onChange={setH} />
            </div>
            {out.clamped && <p className="text-2xs text-subtle">Reduced to fit browser limits.</p>}
          </div>
          <p className="text-xs text-muted tabular-nums">
            {out.width} × {out.height} px{preview ? ` · about ${formatBytes(preview.bytes)}` : ''}
          </p>
          <div className="mt-auto flex flex-col gap-1.5 pt-1">
            <Button variant="primary" className="h-9 text-[13px]" onClick={() => void download()} disabled={busy}>
              <Download size={15} /> Download {prefs.format.toUpperCase()}
            </Button>
            {clipboardSupported() && (
              <Button onClick={() => void copy()} disabled={busy}>
                <Copy size={13} /> Copy as PNG
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, Lock, Share, Unlock, X } from 'lucide-react';
import { shareExport, shareSupported } from '../lib/fileSave';
import { Button, Segmented, Slider, Toggle, NumberInput } from '../components/ui/controls';
import { clampExportSize, downloadBlob, clipboardSupported, writeImageToClipboard } from '../engine/export';
import { canvasToBlob } from '../engine/images';
import { formatBytes } from '../lib/utils';
import { showToast } from '../store/actions';
import { studio, useStudio, shallowEqual } from './store';
import { allPages, pageDoc } from './pages';
import { produce, outputSize, prepare, selectionBounds, type Format, type Scope } from './exportCore';
import { renderExport } from './render';

const PREFS_KEY = 'cleanshot:studio-export';

interface Prefs {
  format: Format;
  quality: number;
  selectableText: boolean;
}

function loadPrefs(): Prefs {
  const d: Prefs = { format: 'png', quality: 90, selectableText: true };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return d;
  }
}

const EXT: Record<Format, string> = { png: 'png', jpeg: 'jpg', webp: 'webp', pdf: 'pdf', svg: 'svg' };

export function ExportDialog() {
  const { doc, open, selection } = useStudio((s) => ({ doc: s.doc, open: s.exportOpen, selection: s.selection }), shallowEqual);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [scope, setScope] = useState<Scope>('page');
  /** Whether the user picked "What to download" themselves this time (then format changes leave it alone). */
  const scopeTouched = useRef(false);
  const [scale, setScale] = useState(1);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [lockAspect, setLockAspect] = useState(true);
  const [name, setName] = useState('');
  const [removeBg, setRemoveBg] = useState(false);
  const [preview, setPreview] = useState<{ url: string; bytes: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const pages = doc ? allPages(doc).length : 1;
  const hasSel = selection.length > 0;

  useEffect(() => {
    if (open && doc) {
      setName(doc.name);
      setSize(null);
      setScale(1);
      scopeTouched.current = false;
      setScope(hasSel ? 'selection' : pages > 1 && prefs.format === 'pdf' ? 'all' : 'page');
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

  const fmt = prefs.format;
  const isPdf = fmt === 'pdf';
  const isSvg = fmt === 'svg';
  const canTransparent = fmt === 'png' || fmt === 'webp' || fmt === 'svg';
  const bgIsTransparent = doc?.background.kind === 'transparent';
  const sel = scope === 'selection';

  const base = useMemo(() => {
    if (!doc) return { w: 1, h: 1 };
    const b = sel ? selectionBounds(doc, selection) : null;
    return { w: b?.w ?? doc.width, h: b?.h ?? doc.height };
  }, [doc, sel, selection]);

  const out = useMemo(() => {
    const w = size?.w ?? Math.round(base.w * scale);
    const h = size?.h ?? Math.round(base.h * scale);
    return clampExportSize(w, h);
  }, [base, scale, size]);

  const options = () => ({
    format: fmt,
    scope,
    scale: out.width / base.w,
    width: out.width,
    height: out.height,
    quality: prefs.quality,
    transparent: canTransparent && (removeBg || bgIsTransparent),
    selectableText: prefs.selectableText,
    selection,
    name,
  });

  // Live preview of the first page (debounced); file size for single files.
  useEffect(() => {
    if (!open || !doc) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        let res: { preview: Blob; bytes: number | null };
        const multi = scope === 'all' && pages > 1;
        if (isPdf || multi) {
          // Building a whole PDF/ZIP for a preview is slow; show the first page only.
          await prepare(doc);
          const o = options();
          const pd = pageDoc(doc, scope === 'all' ? 0 : doc.pageIndex);
          const c = renderExport(pd, { scale: Math.min(1, 900 / Math.max(pd.width, pd.height)), background: !(o.transparent || sel), only: sel ? new Set(selection) : undefined, bounds: sel ? selectionBounds(pd, selection) ?? undefined : undefined, matte: isPdf || fmt === 'jpeg' ? '#ffffff' : null });
          res = { preview: await canvasToBlob(c, 'image/png'), bytes: null };
        } else {
          const r = await produce(doc, options());
          res = { preview: isSvg ? r.blob : r.preview, bytes: r.blob.size };
        }
        if (cancelled) return;
        setPreview((p) => {
          if (p) URL.revokeObjectURL(p.url);
          return { url: URL.createObjectURL(res.preview), bytes: res.bytes };
        });
      } catch {
        /* preview is best-effort */
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc, out.width, out.height, fmt, prefs.quality, removeBg, scope, selection]);

  useEffect(() => {
    if (open) dialog.current?.focus();
  }, [open]);

  if (!open || !doc) return null;
  const close = () => studio.set({ exportOpen: false });
  const multi = scope === 'all' && pages > 1;
  const zipped = multi && !isPdf;

  const download = async () => {
    setBusy(true);
    try {
      const r = await produce(doc, options());
      const result = await downloadBlob(r.blob, r.filename);
      if (result === 'saved') {
        showToast(`Saved ${r.filename}`, 'success');
        close();
      }
    } catch (err) {
      console.error(err);
      showToast('Export failed. Try a smaller size.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const shareMime = isPdf ? 'application/pdf' : isSvg ? 'image/svg+xml' : `image/${fmt}`;
  const canShare = !zipped && shareSupported({ name: `design.${fmt === 'jpeg' ? 'jpg' : fmt}`, type: shareMime });
  const share = async () => {
    setBusy(true);
    try {
      const o = options();
      const outcome = await shareExport([doc, JSON.stringify(o)], async () => {
        const r = await produce(doc, o);
        return { blob: r.blob, filename: r.filename };
      });
      if (outcome === 'shared') close();
      else if (outcome === 'retry') showToast('Your file is ready. Tap Share again to send it.', 'info');
    } catch (err) {
      console.error(err);
      showToast('Couldn’t share from this browser. Download instead.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    setBusy(true);
    try {
      const r = produce(doc, { ...options(), format: 'png', scope: scope === 'all' ? 'page' : scope });
      await writeImageToClipboard(r.then((x) => x.blob));
      showToast('Copied to the clipboard', 'success');
    } catch {
      showToast('Couldn’t copy in this browser. Download instead.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const setW = (w: number) => setSize({ w, h: lockAspect ? Math.round((w * base.h) / base.w) : size?.h ?? out.height });
  const setH = (h: number) => setSize({ h, w: lockAspect ? Math.round((h * base.w) / base.h) : size?.w ?? out.width });
  const scopeOptions = [
    { value: 'page' as Scope, label: pages > 1 ? `Page ${doc.pageIndex + 1}` : 'Page' },
    ...(pages > 1 ? [{ value: 'all' as Scope, label: `All ${pages} pages` }] : []),
    ...(hasSel ? [{ value: 'selection' as Scope, label: 'Selection' }] : []),
  ];

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
        className="flex max-h-[92dvh] w-full max-w-[860px] flex-col overflow-hidden rounded-[16px] border border-line-strong bg-elevated shadow-pop outline-none animate-pop-in md:flex-row"
      >
        <div className="cs-checker relative flex min-h-[200px] flex-1 items-center justify-center p-5 max-md:max-h-[32vh]">
          {preview ? <img src={preview.url} alt="Export preview" className="max-h-full max-w-full object-contain shadow-pop md:max-h-[62vh]" /> : <span className="text-xs text-muted">Rendering preview…</span>}
          {multi && <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-2xs font-medium text-white">Page 1 of {pages}</span>}
        </div>
        <div className="scroll-thin flex w-full shrink-0 flex-col gap-3.5 overflow-y-auto border-line p-4 md:w-[320px] md:border-l">
          <div className="flex items-center justify-between">
            <h2 className="text-[length:calc(15px*var(--text-scale))] font-semibold text-fg">Download</h2>
            <button type="button" aria-label="Close" onClick={close} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-muted hover:bg-hover hover:text-fg">
              <X size={15} />
            </button>
          </div>
          <label className="flex flex-col gap-1.5 text-xs text-muted">
            File name
            <span className="flex h-8 items-center rounded-[7px] bg-control px-2.5 ring-accent focus-within:ring-1">
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none" aria-label="File name" />
              <span className="text-subtle">.{zipped ? 'zip' : EXT[fmt]}</span>
            </span>
          </label>
          {scopeOptions.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">What to download</span>
              <Segmented ariaLabel="What to download" value={scope} onChange={(v) => { scopeTouched.current = true; setScope(v); setSize(null); }} options={scopeOptions} />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Format</span>
            <Segmented
              ariaLabel="Format"
              value={fmt}
              onChange={(f) => {
                setPrefs({ ...prefs, format: f });
                // A multi-page PDF should include every page unless the user chose otherwise.
                if (!scopeTouched.current && !hasSel && pages > 1) setScope(f === 'pdf' ? 'all' : 'page');
              }}
              options={[
                { value: 'png', label: 'PNG' },
                { value: 'jpeg', label: 'JPG' },
                { value: 'webp', label: 'WebP' },
                { value: 'pdf', label: 'PDF' },
                { value: 'svg', label: 'SVG' },
              ]}
            />
            {zipped && <p className="text-2xs leading-[14px] text-subtle">Each page is saved as its own file, together in a ZIP.</p>}
            {isPdf && <p className="text-2xs leading-[14px] text-subtle">{multi ? `One PDF with ${pages} pages.` : 'A one-page PDF.'} Use 2× or more for sharp printing.</p>}
            {isSvg && <p className="text-2xs leading-[14px] text-subtle">Shapes, icons, charts and text stay sharp at any size; photos are embedded.</p>}
          </div>
          {(fmt === 'jpeg' || fmt === 'webp' || isPdf) && (
            <Slider label={isPdf ? 'Image quality' : 'Quality'} value={prefs.quality} min={30} max={100} unit="%" onChange={(v) => setPrefs({ ...prefs, quality: v })} />
          )}
          {isPdf && (
            <label className="flex items-center justify-between gap-2 text-xs text-muted">
              <span className="flex flex-col">
                Selectable text
                <span className="text-2xs text-subtle">Copy and search text in the PDF</span>
              </span>
              <Toggle checked={prefs.selectableText} onChange={(v) => setPrefs({ ...prefs, selectableText: v })} label="Selectable text" />
            </label>
          )}
          {canTransparent && !sel ? (
            <label className="flex items-center justify-between gap-2 text-xs text-muted">
              <span>{bgIsTransparent ? 'Transparent background' : 'Remove page background'}</span>
              <Toggle checked={bgIsTransparent || removeBg} onChange={setRemoveBg} label="Transparent background" disabled={bgIsTransparent} />
            </label>
          ) : (
            !canTransparent && (bgIsTransparent || sel) && <p className="text-2xs text-subtle">{isPdf ? 'PDF' : 'JPG'} can’t be transparent; empty areas will be white.</p>
          )}
          {!isSvg && (
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
          )}
          <p className="text-xs text-muted tabular-nums">
            {isSvg ? `${Math.round(base.w)} × ${Math.round(base.h)}` : `${out.width} × ${out.height} px`}
            {multi ? ` · ${pages} pages` : ''}
            {preview?.bytes ? ` · about ${formatBytes(preview.bytes)}` : ''}
          </p>
          <div className="mt-auto flex flex-col gap-1.5 pt-1">
            <Button variant="primary" className="h-9 text-[length:calc(13px*var(--text-scale))]" onClick={() => void download()} disabled={busy}>
              <Download size={15} /> {busy ? 'Preparing…' : `Download ${zipped ? 'ZIP' : fmt === 'jpeg' ? 'JPG' : fmt.toUpperCase()}`}
            </Button>
            {canShare && (
              <Button onClick={() => void share()} disabled={busy}>
                <Share size={13} /> Share
              </Button>
            )}
            {clipboardSupported() && !isPdf && !isSvg && (
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

// Keep outputSize available to callers that size previews.
export { outputSize };

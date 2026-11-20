import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, SquareDashed, Trash2 } from 'lucide-react';
import { Button, Segmented, ToggleRow } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { uid } from '../../lib/utils';
import { canvasToBlob } from '../../engine/images';
import { errorMessage } from '../../tools/shared/batch';
import { Dropzone, PanelSection, ProgressBar, saveBlob, Spinner, ToolLayout, useFileSink } from '../../tools/shared/ui';
import { baseName, loadPdfLib, openForRender, pdfBlob, renderPage, type RenderDoc } from '../engine';
import { PDF_ACCEPT, PdfRow, usePdfList } from '../ui';
import { findBoxes, PATTERNS, type RedactBox } from '../redact';

const DPI_SCALE: Record<string, number> = { '150': 150 / 72, '200': 200 / 72, '300': 300 / 72 };

export default function Redact() {
  const list = usePdfList(false);
  useFileSink(list.add);
  const file = list.items[0] ?? null;
  const [rd, setRd] = useState<RenderDoc | null>(null);
  const [page, setPage] = useState(1);
  const [boxes, setBoxes] = useState<RedactBox[]>([]);
  const [query, setQuery] = useState('');
  const [dpi, setDpi] = useState('200');
  const [stripMeta, setStripMeta] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [img, setImg] = useState<{ url: string; w: number; h: number } | null>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const overlay = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setBoxes([]);
    setPage(1);
    if (!file) return setRd(null);
    let alive = true;
    let opened: RenderDoc | null = null;
    void openForRender(file.bytes).then((r) => {
      opened = r;
      if (alive) setRd(r);
      else r.close();
    });
    return () => {
      alive = false;
      opened?.close();
    };
  }, [file]);

  useEffect(() => {
    if (!rd) return setImg(null);
    let alive = true;
    void renderPage(rd.doc, page, { width: 900 }).then(async (c) => {
      const url = URL.createObjectURL(await canvasToBlob(c, 'image/png'));
      if (alive) setImg((old) => (old && URL.revokeObjectURL(old.url), { url, w: c.width, h: c.height }));
      else URL.revokeObjectURL(url);
    });
    return () => {
      alive = false;
    };
  }, [rd, page]);

  const pageBoxes = boxes.filter((b) => b.page === page);
  const pagesWithBoxes = useMemo(() => new Set(boxes.map((b) => b.page)), [boxes]);

  const rel = (e: React.PointerEvent) => {
    const r = overlay.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  /** `label` names what was searched for, e.g. “email addresses” or “matches for “x””. */
  const search = async (q: string | RegExp, label: string) => {
    if (!rd) return;
    const found = await findBoxes(rd.doc, q, () => uid('rb'));
    setBoxes((b) => [...b, ...found]);
    showToast(found.length ? `Marked ${found.length} ${found.length === 1 ? 'area' : 'areas'} for redaction (${label}).` : `No ${label} found.`, 'info');
    if (found[0]) setPage(found[0].page);
  };

  const run = async () => {
    if (!file || !rd) return;
    setProgress(0);
    try {
      const lib = await loadPdfLib();
      const src = await lib.PDFDocument.load(file.bytes, { updateMetadata: false });
      const out = await lib.PDFDocument.create();
      const n = src.getPageCount();
      for (let i = 1; i <= n; i++) {
        if (!pagesWithBoxes.has(i)) {
          const [copied] = await out.copyPages(src, [i - 1]);
          out.addPage(copied);
        } else {
          // Rebuild the page as an image with the boxes burned in: the text,
          // vectors and images underneath are gone, not just covered.
          const c = await renderPage(rd.doc, i, { scale: DPI_SCALE[dpi] });
          const ctx = c.getContext('2d')!;
          ctx.fillStyle = '#000';
          for (const b of boxes.filter((x) => x.page === i)) ctx.fillRect(Math.floor(b.x * c.width), Math.floor(b.y * c.height), Math.ceil(b.w * c.width) + 1, Math.ceil(b.h * c.height) + 1);
          const bytes = new Uint8Array(await (await canvasToBlob(c, 'image/jpeg', 0.9)).arrayBuffer());
          const imgRef = await out.embedJpg(bytes);
          const vp = (await rd.doc.getPage(i)).getViewport({ scale: 1 });
          const p = out.addPage([vp.width, vp.height]);
          p.drawImage(imgRef, { x: 0, y: 0, width: vp.width, height: vp.height });
          c.width = c.height = 0;
        }
        setProgress(i / n);
      }
      if (!stripMeta) {
        out.setTitle(src.getTitle() ?? '');
        out.setAuthor(src.getAuthor() ?? '');
      }
      out.setProducer('Studiolo');
      out.setCreator('Studiolo');
      await saveBlob(pdfBlob(await out.save()), `${baseName(file.name)}-redacted.pdf`);
      showToast(`Redacted ${boxes.length} area${boxes.length === 1 ? '' : 's'} on ${pagesWithBoxes.size} page${pagesWithBoxes.size === 1 ? '' : 's'}.`, 'success');
    } catch (err) {
      showToast(`Couldn’t redact: ${errorMessage(err)}`, 'error');
    } finally {
      setProgress(null);
    }
  };

  const main = !file ? (
    <Dropzone accept={PDF_ACCEPT} onFiles={list.add} title="Drop a PDF to redact" hint="Black out text and areas for good, not just visually" icon={<SquareDashed size={20} />} />
  ) : (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-auto p-5">
      <div className="flex items-center gap-2 text-xs text-muted">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex h-[26px] w-[26px] items-center justify-center rounded-[6px] hover:bg-hover disabled:opacity-30">
          <ChevronLeft size={15} />
        </button>
        <span className="tabular-nums">
          Page {page} of {file.pageCount}
        </span>
        <button type="button" aria-label="Next page" disabled={page >= file.pageCount} onClick={() => setPage((p) => p + 1)} className="flex h-[26px] w-[26px] items-center justify-center rounded-[6px] hover:bg-hover disabled:opacity-30">
          <ChevronRight size={15} />
        </button>
        <span className="text-subtle">Drag on the page to mark an area.</span>
      </div>
      {img && (
        <div className="relative shadow-[0_8px_30px_rgba(0,0,0,0.2)]" style={{ width: Math.min(img.w, 760), aspectRatio: `${img.w} / ${img.h}` }}>
          <img src={img.url} alt={`Page ${page}`} className="absolute inset-0 h-full w-full select-none" draggable={false} />
          <div
            ref={overlay}
            className="absolute inset-0 cursor-crosshair touch-none"
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture(e.pointerId);
              const p = rel(e);
              setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
            }}
            onPointerMove={(e) => drag && setDrag({ ...drag, ...((p) => ({ x1: p.x, y1: p.y }))(rel(e)) })}
            onPointerUp={() => {
              if (drag) {
                const x = Math.min(drag.x0, drag.x1);
                const y = Math.min(drag.y0, drag.y1);
                const w = Math.abs(drag.x1 - drag.x0);
                const h = Math.abs(drag.y1 - drag.y0);
                if (w > 0.004 && h > 0.004) setBoxes((b) => [...b, { id: uid('rb'), page, x, y, w, h }]);
              }
              setDrag(null);
            }}
          >
            {pageBoxes.map((b) => (
              <button
                key={b.id}
                type="button"
                aria-label="Remove this redaction"
                title="Click to remove"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setBoxes((all) => all.filter((x) => x.id !== b.id))}
                className="absolute bg-black/85 outline-1 outline-[#ff453a] hover:bg-black/60"
                style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
              />
            ))}
            {drag && (
              <span className="pointer-events-none absolute border border-[#ff453a] bg-black/40" style={{ left: `${Math.min(drag.x0, drag.x1) * 100}%`, top: `${Math.min(drag.y0, drag.y1) * 100}%`, width: `${Math.abs(drag.x1 - drag.x0) * 100}%`, height: `${Math.abs(drag.y1 - drag.y0) * 100}%` }} />
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <ToolLayout
      main={main}
      panel={
        <>
          {file && (
            <PanelSection title="File">
              <PdfRow file={file} onRemove={list.clear} />
            </PanelSection>
          )}
          <PanelSection title="Find and mark">
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (query.trim()) void search(query, `matches for “${query.trim()}”`);
              }}
            >
              <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Text to redact" placeholder="Name, number, word…" className="h-8 min-w-0 flex-1 rounded-[7px] bg-control px-2.5 text-sm text-fg outline-none ring-accent focus:ring-1" />
              <Button type="submit" className="h-8" disabled={!rd || !query.trim()} aria-label="Find and mark">
                <Search size={13} />
              </Button>
            </form>
            <div className="grid grid-cols-2 gap-1.5">
              {PATTERNS.map((p) => (
                <Button key={p.id} className="h-[28px] text-xs" disabled={!rd} onClick={() => void search(p.re, p.label.toLowerCase())}>
                  {p.label}
                </Button>
              ))}
            </div>
            <p className="text-2xs leading-[15px] text-subtle">Finds text in the PDF’s text layer; check each page, and mark scanned text by hand.</p>
          </PanelSection>
          <PanelSection title={`Marked areas (${boxes.length})`} aside={boxes.length ? <button type="button" className="h-[24px] text-xs font-medium text-accent hover:underline" onClick={() => setBoxes([])}>Clear</button> : undefined}>
            {boxes.length ? (
              <div className="flex flex-wrap gap-1">
                {[...pagesWithBoxes].sort((x, y) => x - y).map((p) => (
                  <button key={p} type="button" onClick={() => setPage(p)} className={`h-[24px] rounded-[6px] px-2 text-xs ${p === page ? 'bg-accent-soft text-accent' : 'bg-control text-fg hover:bg-hover'}`}>
                    p.{p} · {boxes.filter((b) => b.page === p).length}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-subtle">Nothing marked yet.</p>
            )}
            {pageBoxes.length > 0 && (
              <Button className="h-[28px] text-xs" onClick={() => setBoxes((b) => b.filter((x) => x.page !== page))}>
                <Trash2 size={12} /> Clear this page
              </Button>
            )}
          </PanelSection>
          <PanelSection title="Output">
            <span className="text-xs text-muted">Redacted pages become images at</span>
            <Segmented ariaLabel="Resolution" value={dpi} onChange={setDpi} options={[{ value: '150', label: '150 dpi' }, { value: '200', label: '200 dpi' }, { value: '300', label: '300 dpi' }]} />
            <ToggleRow label="Remove document info (title, author)" checked={stripMeta} onChange={setStripMeta} />
            <p className="text-2xs leading-[15px] text-subtle">Pages without marks are kept as they are. On redacted pages, text can no longer be selected or searched.</p>
            {progress !== null && <ProgressBar value={progress} label="Redacting…" />}
          </PanelSection>
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={!boxes.length || progress !== null} onClick={() => void run()}>
          {progress !== null ? <Spinner size={13} /> : <SquareDashed size={14} />} Redact and download
        </Button>
      }
    />
  );
}

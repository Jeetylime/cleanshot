import { useEffect, useRef, useState } from 'react';
import { deleteSignature, listSignatures, loadSignatureCanvas, saveSignature, type SavedSignature } from '../savedSignatures';
import { CalendarDays, ChevronLeft, ChevronRight, Download, Eraser, PenLine, Trash2, Save, Upload, X } from 'lucide-react';
import { Tooltip } from '../../components/ui/Tooltip';
import { Button, ColorPicker, Segmented } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { errorMessage } from '../../tools/shared/batch';
import { canvasToBlob } from '../../engine/images';
import { Dropzone, Notice, PanelSection, pickFiles, saveBlob, Spinner, ToolLayout, useFileSink } from '../../tools/shared/ui';
import { baseName, canvasBytes, createCanvas, ctx2d, loadPdfLib, openForRender, pdfBlob, renderPage } from '../engine';
import { PDF_ACCEPT, PdfRow, usePdfList } from '../ui';

type Source = 'draw' | 'type' | 'upload';

interface Placement {
  id: number;
  page: number;
  kind: 'sig' | 'text';
  text?: string;
  /** Box in fractions of the page (top-left origin). */
  x: number;
  y: number;
  w: number;
  h: number;
}

const INK = [
  { value: '#111114', name: 'Black' },
  { value: '#1c3faa', name: 'Blue' },
];

const FONTS = [
  { value: '"Snell Roundhand", "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive', label: 'Script' },
  { value: '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive', label: 'Hand' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Serif' },
];

/** Crop a canvas to its non-transparent content. */
function trim(c: HTMLCanvasElement): HTMLCanvasElement | null {
  const ctx = ctx2d(c, { willReadFrequently: true });
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let x1 = width, y1 = height, x2 = -1, y2 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
  if (x2 < 0) return null;
  const pad = 4;
  const out = createCanvas(x2 - x1 + 1 + pad * 2, y2 - y1 + 1 + pad * 2);
  ctx2d(out).drawImage(c, x1 - pad, y1 - pad, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

function SignaturePad({ ink, onChange }: { ink: string; onChange: (c: HTMLCanvasElement | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * ref.current!.width, y: ((e.clientY - r.top) / r.height) * ref.current!.height };
  };
  const clear = () => {
    const c = ref.current!;
    ctx2d(c).clearRect(0, 0, c.width, c.height);
    onChange(null);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <canvas
        ref={ref}
        width={720}
        height={260}
        data-testid="signature-pad"
        aria-label="Draw your signature"
        className="h-[96px] w-full touch-none rounded-[8px] border border-dashed border-line-strong bg-white"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          last.current = pos(e);
        }}
        onPointerMove={(e) => {
          if (!last.current) return;
          const p = pos(e);
          const ctx = ctx2d(ref.current!);
          ctx.strokeStyle = ink;
          ctx.lineWidth = 5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(last.current.x, last.current.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          last.current = p;
        }}
        onPointerUp={() => {
          last.current = null;
          onChange(trim(ref.current!));
        }}
      />
      <button type="button" onClick={clear} className="inline-flex items-center gap-1 self-end text-xs text-muted hover:text-fg">
        <Eraser size={12} /> Clear
      </button>
    </div>
  );
}

export default function Sign() {
  const list = usePdfList(false);
  useFileSink(list.add);
  const file = list.items[0] ?? null;
  const [page, setPage] = useState(1);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [rotated, setRotated] = useState<Record<number, boolean>>({});
  const [source, setSource] = useState<Source>('draw');
  const [ink, setInk] = useState(INK[0].value);
  const [typed, setTyped] = useState('');
  const [font, setFont] = useState(FONTS[0].value);
  const [sig, setSig] = useState<{ canvas: HTMLCanvasElement; url: string } | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<SavedSignature[]>(() => listSignatures());
  const stage = useRef<HTMLDivElement>(null);
  const seq = useRef(1);

  useEffect(() => {
    setPage(1);
    setPlacements([]);
    setActive(null);
  }, [file]);

  // Render the current page.
  useEffect(() => {
    if (!file) return;
    let url: string | null = null;
    let cancelled = false;
    void (async () => {
      const { doc, close } = await openForRender(file.bytes);
      try {
        const p = await doc.getPage(page);
        if (!cancelled) setRotated((r) => ({ ...r, [page]: p.rotate % 360 !== 0 }));
        const c = await renderPage(doc, page, { width: 1100 });
        const blob = await canvasToBlob(c, 'image/jpeg', 0.9);
        url = URL.createObjectURL(blob);
        if (!cancelled) setPageUrl(url);
      } finally {
        close();
      }
    })().catch((err) => showToast(`Couldn’t render the page: ${errorMessage(err)}`, 'error'));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, page]);

  const setSignature = (c: HTMLCanvasElement | null) => {
    if (sig) URL.revokeObjectURL(sig.url);
    if (!c) return setSig(null);
    void canvasToBlob(c, 'image/png').then((b) => setSig({ canvas: c, url: URL.createObjectURL(b) }));
  };

  // Typed signatures render with the chosen font.
  useEffect(() => {
    if (source !== 'type') return;
    if (!typed.trim()) return setSignature(null);
    const c = createCanvas(900, 260);
    const ctx = ctx2d(c);
    ctx.fillStyle = ink;
    ctx.font = `64px ${font}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(typed, 20, 130);
    setSignature(trim(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, font, ink, source]);

  const place = (kind: 'sig' | 'text', fx = 0.5, fy = 0.75) => {
    if (kind === 'sig' && !sig) return showToast('Create a signature first.', 'info');
    const ratio = kind === 'sig' ? sig!.canvas.width / sig!.canvas.height : 6;
    const pageRatio = stage.current ? stage.current.clientWidth / stage.current.clientHeight : 0.77;
    const w = kind === 'sig' ? 0.28 : 0.2;
    const h = (w * pageRatio) / ratio;
    const p: Placement = {
      id: seq.current++,
      page,
      kind,
      text: kind === 'text' ? new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : undefined,
      x: Math.min(1 - w, Math.max(0, fx - w / 2)),
      y: Math.min(1 - h, Math.max(0, fy - h / 2)),
      w,
      h,
    };
    setPlacements((ps) => [...ps, p]);
    setActive(p.id);
  };

  // Drag / resize placements.
  const drag = useRef<{ id: number; mode: 'move' | 'resize'; sx: number; sy: number; orig: Placement } | null>(null);
  const onBoxDown = (e: React.PointerEvent, p: Placement, mode: 'move' | 'resize') => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setActive(p.id);
    drag.current = { id: p.id, mode, sx: e.clientX, sy: e.clientY, orig: p };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !stage.current) return;
    const r = stage.current.getBoundingClientRect();
    const dx = (e.clientX - d.sx) / r.width;
    const dy = (e.clientY - d.sy) / r.height;
    setPlacements((ps) =>
      ps.map((p) => {
        if (p.id !== d.id) return p;
        if (d.mode === 'move') return { ...p, x: Math.min(1 - p.w, Math.max(0, d.orig.x + dx)), y: Math.min(1 - p.h, Math.max(0, d.orig.y + dy)) };
        const w = Math.min(1 - d.orig.x, Math.max(0.04, d.orig.w + dx));
        const h = (d.orig.h / d.orig.w) * w;
        return { ...p, w, h: Math.min(1 - d.orig.y, h) };
      }),
    );
  };

  const save = async () => {
    if (!file || !placements.length) return;
    setBusy(true);
    try {
      const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
      const doc = await PDFDocument.load(file.bytes, { ignoreEncryption: true });
      const sigImage = sig ? await doc.embedPng(await canvasBytes(sig.canvas, 'image/png')) : null;
      const helv = await doc.embedFont(StandardFonts.Helvetica);
      const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
      for (const p of placements) {
        const pg = doc.getPage(p.page - 1);
        const cb = pg.getCropBox();
        const x = cb.x + p.x * cb.width;
        const w = p.w * cb.width;
        const h = p.h * cb.height;
        const y = cb.y + cb.height - p.y * cb.height - h;
        if (p.kind === 'sig' && sigImage) pg.drawImage(sigImage, { x, y, width: w, height: h });
        if (p.kind === 'text' && p.text) {
          const size = Math.min(h * 0.72, (w / Math.max(1, helv.widthOfTextAtSize(p.text, 1))) * 0.98);
          pg.drawText(p.text, { x, y: y + (h - size) / 2 + size * 0.2, size, font: helv, color: hex(ink) });
        }
      }
      await saveBlob(pdfBlob(await doc.save({ useObjectStreams: true })), `${baseName(file.name)}-signed.pdf`);
    } catch (err) {
      showToast(`Couldn’t sign the PDF: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!file) {
    return (
      <ToolLayout
        main={<Dropzone accept={PDF_ACCEPT} onFiles={list.add} title="Drop a PDF to sign" icon={<PenLine size={20} />} />}
        panel={<PanelSection title="How it works"><p className="text-xs leading-[17px] text-muted">Draw, type or upload your signature, click where it should go, adjust its size, and download the signed PDF. Your signature isn’t saved anywhere unless you choose Save, which keeps it only in this browser.</p><p className="text-xs leading-[17px] text-muted">Only sign documents you’re authorized to sign. Forged or altered documents are prohibited by the <a href="#acceptable-use" className="text-accent hover:underline">Acceptable Use Policy</a>.</p></PanelSection>}
      />
    );
  }

  const here = placements.filter((p) => p.page === page);
  const sel = placements.find((p) => p.id === active) ?? null;

  return (
    <ToolLayout
      main={
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-center gap-2 border-b border-line bg-panel px-3 py-1.5 text-xs text-muted">
            <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)} className="flex h-7 w-7 items-center justify-center rounded-[7px] hover:bg-hover disabled:opacity-30">
              <ChevronLeft size={15} />
            </button>
            <span className="tabular-nums">
              Page {page} of {file.pageCount}
            </span>
            <button type="button" aria-label="Next page" disabled={page >= file.pageCount} onClick={() => setPage(page + 1)} className="flex h-7 w-7 items-center justify-center rounded-[7px] hover:bg-hover disabled:opacity-30">
              <ChevronRight size={15} />
            </button>
            <span className="ml-3 text-subtle">{sig ? 'Click the page to place your signature' : 'Create a signature on the right'}</span>
          </div>
          <div className="scroll-thin flex min-h-0 flex-1 justify-center overflow-auto p-6">
            {pageUrl ? (
              <div
                ref={stage}
                data-testid="sign-stage"
                className="relative h-fit w-full max-w-[760px] touch-none shadow-pop select-none"
                onPointerDown={(e) => {
                  if (!stage.current || rotated[page]) return;
                  const r = stage.current.getBoundingClientRect();
                  if (sig) place('sig', (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
                  else setActive(null);
                }}
                onPointerMove={onMove}
                onPointerUp={() => (drag.current = null)}
              >
                <img src={pageUrl} alt={`Page ${page}`} className="block w-full bg-white" draggable={false} />
                {here.map((p) => (
                  <div
                    key={p.id}
                    onPointerDown={(e) => onBoxDown(e, p, 'move')}
                    className={`absolute cursor-move ${active === p.id ? 'outline outline-2 outline-accent' : 'outline-1 outline-dashed outline-accent/50 hover:outline'}`}
                    style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.w * 100}%`, height: `${p.h * 100}%` }}
                  >
                    {p.kind === 'sig' && sig ? (
                      <img src={sig.url} alt="Signature" className="h-full w-full" draggable={false} />
                    ) : (
                      <svg viewBox="0 0 100 20" preserveAspectRatio="xMinYMid meet" className="h-full w-full">
                        <text x="0" y="15" fontSize="15" fill={ink} fontFamily="Helvetica, Arial, sans-serif">
                          {p.text}
                        </text>
                      </svg>
                    )}
                    {active === p.id && (
                      <span onPointerDown={(e) => onBoxDown(e, p, 'resize')} className="absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize rounded-[3px] border border-accent bg-white" />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Spinner />
            )}
          </div>
        </div>
      }
      panel={
        <>
          <PanelSection title="Document">
            <PdfRow file={file} onRemove={list.clear} />
          </PanelSection>
          <PanelSection title="Your signature">
            <Segmented<Source>
              ariaLabel="Signature source"
              value={source}
              onChange={(s) => {
                setSource(s);
                setSignature(null);
              }}
              options={[
                { value: 'draw', label: 'Draw' },
                { value: 'type', label: 'Type' },
                { value: 'upload', label: 'Image' },
              ]}
            />
            {source === 'draw' && <SignaturePad ink={ink} onChange={setSignature} />}
            {source === 'type' && (
              <>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="Your name"
                  aria-label="Your name"
                  className="h-8 rounded-[7px] bg-control px-2.5 text-sm text-fg outline-none ring-accent focus:ring-1"
                />
                <Segmented<string> ariaLabel="Style" size="sm" value={font} onChange={setFont} options={FONTS.map((f) => ({ value: f.value, label: f.label }))} />
              </>
            )}
            {source === 'upload' && (
              <Button
                onClick={() =>
                  pickFiles(false, (files) => {
                    void createImageBitmap(files[0]).then((bmp) => {
                      const c = createCanvas(bmp.width, bmp.height);
                      ctx2d(c).drawImage(bmp, 0, 0);
                      setSignature(trim(c) ?? c);
                    });
                  })
                }
              >
                <Upload size={13} /> Choose image
              </Button>
            )}
            {source !== 'upload' && (
              <div className="flex items-center justify-between text-xs text-muted">
                Ink
                <ColorPicker value={ink} onChange={setInk} colors={INK} allowCustom={false} />
              </div>
            )}
            {sig && (
              <div className="flex items-center gap-2 rounded-[8px] border border-line bg-white p-2">
                <img src={sig.url} alt="Your signature" className="max-h-12 min-w-0 flex-1 object-contain object-left" />
                <Tooltip label="Keep this signature in this browser for next time">
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        setSaved(saveSignature(sig.canvas.toDataURL('image/png')));
                        showToast('Signature saved on this device');
                      } catch {
                        showToast('Couldn’t save: browser storage is full or blocked.', 'error');
                      }
                    }}
                    className="flex h-7 shrink-0 items-center gap-1 rounded-[6px] px-2 text-xs text-[#3a3a3c] hover:bg-black/5"
                  >
                    <Save size={12} /> Save
                  </button>
                </Tooltip>
              </div>
            )}
            {saved.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">Saved on this device</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {saved.map((s) => (
                    <div key={s.id} className="group relative">
                      <button
                        type="button"
                        aria-label="Use saved signature"
                        onClick={() => void loadSignatureCanvas(s.url).then(setSignature).catch((e) => showToast(String(e.message), 'error'))}
                        className="flex h-12 w-full items-center justify-center rounded-[7px] border border-line bg-white p-1.5 hover:border-accent"
                      >
                        <img src={s.url} alt="" className="max-h-full max-w-full object-contain" />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete saved signature"
                        onClick={() => setSaved(deleteSignature(s.id))}
                        className="absolute -top-1.5 -right-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-panel text-subtle shadow ring-1 ring-line group-hover:flex hover:text-danger focus:flex"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </PanelSection>
          <PanelSection title="Place">
            <div className="flex gap-2">
              <Button className="flex-1" disabled={!sig || rotated[page]} onClick={() => place('sig')}>
                <PenLine size={13} /> Signature
              </Button>
              <Button className="flex-1" disabled={rotated[page]} onClick={() => place('text', 0.5, 0.85)}>
                <CalendarDays size={13} /> Date
              </Button>
            </div>
            {sel?.kind === 'text' && (
              <input
                value={sel.text}
                onChange={(e) => setPlacements((ps) => ps.map((p) => (p.id === sel.id ? { ...p, text: e.target.value } : p)))}
                onKeyDown={(e) => e.stopPropagation()}
                aria-label="Text"
                className="h-8 rounded-[7px] bg-control px-2.5 text-sm text-fg outline-none ring-accent focus:ring-1"
              />
            )}
            {sel && (
              <Button variant="danger" onClick={() => setPlacements((ps) => ps.filter((p) => p.id !== sel.id))}>
                <Trash2 size={13} /> Remove selected
              </Button>
            )}
            {rotated[page] && <Notice>This page is rotated in the file. Signing rotated pages isn’t supported yet; rotate it first with Organize PDF.</Notice>}
            <p className="text-xs text-muted tabular-nums">
              {placements.length} {placements.length === 1 ? 'item' : 'items'} placed
              {placements.length > 0 && ` on ${new Set(placements.map((p) => p.page)).size} ${new Set(placements.map((p) => p.page)).size === 1 ? 'page' : 'pages'}`}
            </p>
          </PanelSection>
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={!placements.length || busy} onClick={() => void save()}>
          {busy ? <Spinner size={13} /> : <Download size={14} />} Download signed PDF
        </Button>
      }
    />
  );
}

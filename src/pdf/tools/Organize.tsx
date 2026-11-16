import { useEffect, useState } from 'react';
import { LayoutGrid, RotateCcw, RotateCw, Trash2, Undo2 } from 'lucide-react';
import { Button } from '../../components/ui/controls';
import { Tooltip } from '../../components/ui/Tooltip';
import { showToast } from '../../store/actions';
import { errorMessage } from '../../tools/shared/batch';
import { Dropzone, PanelSection, saveBlob, Spinner, ToolLayout, useFileSink } from '../../tools/shared/ui';
import { baseName, loadPdfLib, pdfBlob } from '../engine';
import { PDF_ACCEPT, PdfRow, usePageThumbs, usePdfList } from '../ui';

interface Slot {
  id: number;
  page: number;
  rotation: number;
}

const initial = (n: number): Slot[] => Array.from({ length: n }, (_, i) => ({ id: i + 1, page: i + 1, rotation: 0 }));

export default function Organize() {
  const list = usePdfList(false);
  useFileSink(list.add);
  const file = list.items[0] ?? null;
  const thumbs = usePageThumbs(file, 180);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setSlots(file ? initial(file.pageCount) : []), [file]);

  const changed =
    !!file && (slots.length !== file.pageCount || slots.some((s, i) => s.page !== i + 1 || s.rotation % 360 !== 0));

  const rotate = (id: number, d: number) => setSlots((s) => s.map((x) => (x.id === id ? { ...x, rotation: x.rotation + d } : x)));
  const remove = (id: number) => setSlots((s) => s.filter((x) => x.id !== id));
  const rotateAll = (d: number) => setSlots((s) => s.map((x) => ({ ...x, rotation: x.rotation + d })));
  const drop = (targetId: number) => {
    if (drag === null || drag === targetId) return;
    setSlots((s) => {
      const from = s.findIndex((x) => x.id === drag);
      const to = s.findIndex((x) => x.id === targetId);
      const next = s.slice();
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  };

  const save = async () => {
    if (!file || !slots.length) return;
    setBusy(true);
    try {
      const { PDFDocument, degrees } = await loadPdfLib();
      const src = await PDFDocument.load(file.bytes, { ignoreEncryption: true });
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, slots.map((s) => s.page - 1));
      pages.forEach((p, i) => {
        const r = (((p.getRotation().angle + slots[i].rotation) % 360) + 360) % 360;
        p.setRotation(degrees(r));
        out.addPage(p);
      });
      await saveBlob(pdfBlob(await out.save({ useObjectStreams: true })), `${baseName(file.name)}-organized.pdf`);
    } catch (err) {
      showToast(`Couldn’t save: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!file) {
    return (
      <ToolLayout
        main={<Dropzone accept={PDF_ACCEPT} onFiles={list.add} title="Drop a PDF to organize" hint="Reorder, rotate and remove pages" icon={<LayoutGrid size={20} />} />}
        panel={<PanelSection title="How it works"><p className="text-xs leading-[17px] text-muted">See every page as a thumbnail. Drag pages into a new order, rotate the ones that are sideways, delete the ones you don’t need, then download the result.</p></PanelSection>}
      />
    );
  }

  return (
    <ToolLayout
      main={
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mx-auto grid max-w-[980px] grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3" data-testid="organize-grid">
            {slots.map((s, i) => (
              <div
                key={s.id}
                draggable
                onDragStart={(e) => {
                  setDrag(s.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(s.id));
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOver(s.id);
                }}
                onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  drop(s.id);
                  setDrag(null);
                  setOver(null);
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setOver(null);
                }}
                className={`group relative flex cursor-grab flex-col items-center gap-1.5 active:cursor-grabbing ${drag === s.id ? 'opacity-40' : ''}`}
              >
                <div
                  className={`relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-[8px] border bg-elevated p-2 transition-colors ${
                    over === s.id && drag !== s.id ? 'border-accent ring-2 ring-accent/50' : 'border-line group-hover:border-line-strong'
                  }`}
                >
                  {thumbs[s.page] ? (
                    <img src={thumbs[s.page]} alt={`Page ${s.page}`} draggable={false} className="max-h-full max-w-full bg-white shadow-soft transition-transform duration-200" style={{ transform: `rotate(${s.rotation}deg)` }} />
                  ) : (
                    <span className="h-full w-full animate-pulse rounded-[4px] bg-control" />
                  )}
                  <div className="absolute inset-x-0 bottom-1.5 flex justify-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {[
                      { label: 'Rotate left', icon: RotateCcw, run: () => rotate(s.id, -90) },
                      { label: 'Rotate right', icon: RotateCw, run: () => rotate(s.id, 90) },
                      { label: 'Delete page', icon: Trash2, run: () => remove(s.id) },
                    ].map((b) => (
                      <Tooltip key={b.label} label={b.label} side="top">
                        <button
                          type="button"
                          aria-label={`${b.label} ${s.page}`}
                          onClick={b.run}
                          className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-black/70 text-white backdrop-blur hover:bg-black/85"
                        >
                          <b.icon size={13} />
                        </button>
                      </Tooltip>
                    ))}
                  </div>
                </div>
                <span className="text-2xs text-subtle tabular-nums">
                  {i + 1}
                  {s.page !== i + 1 && <span className="text-subtle/70"> (was {s.page})</span>}
                </span>
              </div>
            ))}
          </div>
          {!slots.length && <p className="text-center text-sm text-muted">All pages were removed. Use Reset to start over.</p>}
        </div>
      }
      panel={
        <>
          <PanelSection title="Document">
            <PdfRow file={file} thumb={thumbs[1]} onRemove={list.clear} />
          </PanelSection>
          <PanelSection title="Pages">
            <p className="text-xs leading-[16px] text-subtle">Drag pages to reorder. Hover a page to rotate or delete it.</p>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => rotateAll(-90)}>
                <RotateCcw size={13} /> Rotate all
              </Button>
              <Button className="flex-1" onClick={() => rotateAll(90)}>
                <RotateCw size={13} /> Rotate all
              </Button>
            </div>
            <Button variant="ghost" disabled={!changed} onClick={() => setSlots(initial(file.pageCount))}>
              <Undo2 size={13} /> Reset changes
            </Button>
            <p className="text-xs text-muted tabular-nums">
              {slots.length} of {file.pageCount} pages kept
            </p>
          </PanelSection>
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={busy || !slots.length || !changed} onClick={() => void save()}>
          {busy ? <Spinner size={13} /> : null}
          {changed ? 'Download organized PDF' : 'Make a change to download'}
        </Button>
      }
    />
  );
}

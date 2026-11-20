import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BookMarked, Download, Plus, Trash2 } from 'lucide-react';
import { Button, ToggleRow } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { errorMessage } from '../../tools/shared/batch';
import { Dropzone, PanelSection, saveBlob, Spinner, ToolLayout, useFileSink } from '../../tools/shared/ui';
import { baseName, loadPdfLib, openForRender, pdfBlob } from '../engine';
import { PDF_ACCEPT, PdfRow, usePdfList } from '../ui';
import { readOutline, writeOutline, type Bookmark } from '../outline';

interface Info {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  created: string;
  modified: string;
}

const EMPTY: Info = { title: '', author: '', subject: '', keywords: '', creator: '', producer: '', created: '', modified: '' };
const FIELDS: { key: keyof Info; label: string; readOnly?: boolean }[] = [
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' },
  { key: 'subject', label: 'Subject' },
  { key: 'keywords', label: 'Keywords (comma separated)' },
  { key: 'creator', label: 'Created with' },
  { key: 'producer', label: 'PDF producer' },
];
const input = 'h-8 min-w-0 rounded-[7px] bg-control px-2.5 text-sm text-fg outline-none ring-accent focus:ring-1';

export default function Metadata() {
  const list = usePdfList(false);
  useFileSink(list.add);
  const file = list.items[0] ?? null;
  const [info, setInfo] = useState<Info>(EMPTY);
  const [marks, setMarks] = useState<Bookmark[]>([]);
  const [strip, setStrip] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setInfo(EMPTY);
    setMarks([]);
    if (!file) return;
    void (async () => {
      try {
        const lib = await loadPdfLib();
        const doc = await lib.PDFDocument.load(file.bytes, { updateMetadata: false });
        const d = (x: Date | undefined) => (x ? x.toLocaleString() : '');
        setInfo({
          title: doc.getTitle() ?? '',
          author: doc.getAuthor() ?? '',
          subject: doc.getSubject() ?? '',
          keywords: doc.getKeywords() ?? '',
          creator: doc.getCreator() ?? '',
          producer: doc.getProducer() ?? '',
          created: d(doc.getCreationDate()),
          modified: d(doc.getModificationDate()),
        });
        const { doc: pd, close } = await openForRender(file.bytes);
        try {
          setMarks(await readOutline(pd));
        } finally {
          close();
        }
      } catch (err) {
        showToast(`Couldn’t read the PDF: ${errorMessage(err)}`, 'error');
      }
    })();
  }, [file]);

  const setMark = (i: number, p: Partial<Bookmark>) => setMarks((m) => m.map((b, k) => (k === i ? { ...b, ...p } : b)));

  const save = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const lib = await loadPdfLib();
      const doc = await lib.PDFDocument.load(file.bytes, { updateMetadata: false });
      if (strip) {
        // Remove the Info dictionary values and the XMP metadata stream.
        delete doc.context.trailerInfo.Info;
        doc.catalog.delete(lib.PDFName.of('Metadata'));
      } else {
        doc.setTitle(info.title, { showInWindowTitleBar: !!info.title });
        doc.setAuthor(info.author);
        doc.setSubject(info.subject);
        doc.setKeywords(info.keywords.split(',').map((k) => k.trim()).filter(Boolean));
        doc.setCreator(info.creator);
        doc.setProducer(info.producer);
        doc.setModificationDate(new Date());
      }
      writeOutline(lib, doc, marks.filter((m) => m.title.trim()));
      await saveBlob(pdfBlob(await doc.save()), `${baseName(file.name)}.pdf`);
      showToast('Saved', 'success');
    } catch (err) {
      showToast(`Couldn’t save: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const pages = file?.pageCount ?? 1;
  return (
    <ToolLayout
      main={
        !file ? (
          <Dropzone accept={PDF_ACCEPT} onFiles={list.add} title="Drop a PDF" hint="Edit its title, author and keywords, and its bookmarks" icon={<BookMarked size={20} />} />
        ) : (
          <div className="scroll-thin flex min-h-0 flex-1 justify-center overflow-y-auto p-6">
            <div className="flex w-full max-w-[640px] flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-fg">Bookmarks</h2>
                <div className="flex gap-1.5">
                  <Button className="h-[28px] text-xs" onClick={() => setMarks(Array.from({ length: pages }, (_, i) => ({ title: `Page ${i + 1}`, page: i + 1, level: 0 })))}>
                    One per page
                  </Button>
                  <Button className="h-[28px] text-xs" onClick={() => setMarks((m) => [...m, { title: 'New bookmark', page: 1, level: 0 }])}>
                    <Plus size={12} /> Add
                  </Button>
                </div>
              </div>
              {marks.length === 0 && <p className="rounded-[9px] bg-control px-3 py-6 text-center text-xs text-subtle">No bookmarks. Add some so readers can jump to sections.</p>}
              {marks.map((b, i) => (
                <div key={i} className="flex items-center gap-1.5" style={{ paddingLeft: b.level * 20 }}>
                  <input value={b.title} onChange={(e) => setMark(i, { title: e.target.value })} onKeyDown={(e) => e.stopPropagation()} aria-label={`Bookmark ${i + 1} title`} className={`${input} flex-1`} />
                  <label className="flex items-center gap-1 text-xs text-muted">
                    p.
                    <input type="number" min={1} max={pages} value={b.page} onChange={(e) => setMark(i, { page: Math.min(pages, Math.max(1, Number(e.target.value) || 1)) })} onKeyDown={(e) => e.stopPropagation()} aria-label={`Bookmark ${i + 1} page`} className={`${input} w-[64px] tabular-nums`} />
                  </label>
                  <button type="button" aria-label="Outdent" disabled={b.level === 0} onClick={() => setMark(i, { level: b.level - 1 })} className="flex h-[26px] w-[26px] items-center justify-center rounded-[6px] text-muted hover:bg-hover disabled:opacity-30">
                    <ArrowLeft size={13} />
                  </button>
                  <button type="button" aria-label="Indent" disabled={i === 0 || b.level > (marks[i - 1]?.level ?? 0)} onClick={() => setMark(i, { level: b.level + 1 })} className="flex h-[26px] w-[26px] items-center justify-center rounded-[6px] text-muted hover:bg-hover disabled:opacity-30">
                    <ArrowRight size={13} />
                  </button>
                  <button type="button" aria-label={`Delete bookmark ${i + 1}`} onClick={() => setMarks((m) => m.filter((_, k) => k !== i))} className="flex h-[26px] w-[26px] items-center justify-center rounded-[6px] text-muted hover:bg-hover hover:text-danger">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      }
      panel={
        <>
          {file && (
            <PanelSection title="File">
              <PdfRow file={file} onRemove={list.clear} />
              {(info.created || info.modified) && (
                <p className="text-2xs leading-[15px] text-subtle">
                  {info.created && <>Created {info.created}<br /></>}
                  {info.modified && <>Modified {info.modified}</>}
                </p>
              )}
            </PanelSection>
          )}
          <PanelSection title="Document info">
            <ToggleRow label="Remove all document info" checked={strip} onChange={setStrip} />
            {!strip &&
              FIELDS.map((f) => (
                <label key={f.key} className="flex flex-col gap-1 text-xs text-muted">
                  {f.label}
                  <input value={info[f.key]} onChange={(e) => setInfo({ ...info, [f.key]: e.target.value })} onKeyDown={(e) => e.stopPropagation()} className={input} />
                </label>
              ))}
          </PanelSection>
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={!file || busy} onClick={() => void save()}>
          {busy ? <Spinner size={13} /> : <Download size={14} />} Save PDF
        </Button>
      }
    />
  );
}

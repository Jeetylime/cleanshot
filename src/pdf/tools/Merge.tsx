import { useState } from 'react';
import { Combine, Plus } from 'lucide-react';
import { Button, Toggle } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { formatBytes } from '../../lib/utils';
import { errorMessage } from '../../tools/shared/batch';
import { Dropzone, Notice, PanelSection, pickFiles, saveBlob, Spinner, ToolLayout, useFileSink } from '../../tools/shared/ui';
import { loadPdfLib, pdfBlob } from '../engine';
import { PDF_ACCEPT, PdfRow, usePdfList } from '../ui';

export default function Merge() {
  const list = usePdfList(true);
  useFileSink(list.add);
  const [busy, setBusy] = useState(false);
  const [stripMeta, setStripMeta] = useState(true);
  const [result, setResult] = useState<{ blob: Blob; pages: number } | null>(null);

  const totalPages = list.items.reduce((s, f) => s + f.pageCount, 0);

  const merge = async () => {
    setBusy(true);
    setResult(null);
    try {
      const { PDFDocument } = await loadPdfLib();
      const out = await PDFDocument.create();
      for (const f of list.items) {
        const src = await PDFDocument.load(f.bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      }
      if (stripMeta) {
        out.setProducer('');
        out.setCreator('');
      } else {
        out.setProducer('Studiolo');
      }
      const blob = pdfBlob(await out.save({ useObjectStreams: true }));
      setResult({ blob, pages: out.getPageCount() });
      await saveBlob(blob, 'merged.pdf');
    } catch (err) {
      showToast(`Merge failed: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolLayout
      main={
        list.items.length ? (
          <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="mx-auto flex w-full max-w-[720px] flex-col gap-1.5 p-5">
              <div className="flex items-center justify-between pb-1 text-xs text-muted">
                <span>
                  <span className="font-semibold text-fg">{list.items.length}</span> files, combined in this order
                </span>
                <button type="button" onClick={() => pickFiles(true, list.add, PDF_ACCEPT)} className="inline-flex h-7 items-center gap-1 rounded-[7px] px-2 font-medium hover:bg-hover hover:text-fg">
                  <Plus size={13} /> Add PDFs
                </button>
              </div>
              {list.items.map((f, i) => (
                <PdfRow key={f.id} file={f} index={i} count={list.items.length} onMove={(d) => list.move(f.id, d)} onRemove={() => list.remove(f.id)} />
              ))}
              {list.loading > 0 && (
                <p className="flex items-center gap-2 py-2 text-xs text-muted">
                  <Spinner size={12} /> Reading {list.loading} {list.loading === 1 ? 'file' : 'files'}…
                </p>
              )}
            </div>
          </div>
        ) : (
          <Dropzone multiple accept={PDF_ACCEPT} onFiles={list.add} title="Drop PDFs to merge" hint="Add two or more PDF files" icon={<Combine size={20} />} />
        )
      }
      panel={
        <>
          <PanelSection title="Merge">
            <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
              <dt className="text-subtle">Files</dt>
              <dd className="text-right text-fg tabular-nums">{list.items.length}</dd>
              <dt className="text-subtle">Total pages</dt>
              <dd className="text-right text-fg tabular-nums">{totalPages}</dd>
            </dl>
            <p className="text-xs leading-[16px] text-subtle">Use the arrows to change the order. Pages keep their original size and orientation.</p>
          </PanelSection>
          <PanelSection title="Options">
            <label className="flex items-center justify-between gap-3 text-xs text-muted">
              <span>Remove document info (author, app)</span>
              <Toggle checked={stripMeta} onChange={setStripMeta} label="Remove document info" />
            </label>
          </PanelSection>
          {result && (
            <div className="px-4 py-3">
              <Notice tone="success">
                Merged {result.pages} pages · {formatBytes(result.blob.size)}
              </Notice>
            </div>
          )}
        </>
      }
      footer={
        <>
          <Button variant="primary" className="h-8" disabled={list.items.length < 2 || busy} onClick={() => void merge()}>
            {busy ? <Spinner size={13} /> : <Combine size={14} />}
            {list.items.length < 2 ? 'Add at least two PDFs' : `Merge ${list.items.length} PDFs`}
          </Button>
          {result && (
            <Button className="h-8" onClick={() => void saveBlob(result.blob, 'merged.pdf')}>
              Download again
            </Button>
          )}
        </>
      }
    />
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Scissors } from 'lucide-react';
import { Button, NumberInput, Segmented } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { errorMessage } from '../../tools/shared/batch';
import { createZip } from '../../tools/shared/zip';
import { Dropzone, PanelSection, saveBlob, Spinner, ToolLayout, useFileSink } from '../../tools/shared/ui';
import { baseName, formatRanges, loadPdfLib, parseRanges, pdfBlob } from '../engine';
import { PDF_ACCEPT, PageTile, PdfRow, usePageThumbs, usePdfList } from '../ui';

type Mode = 'extract' | 'each' | 'chunks';

export default function Split() {
  const list = usePdfList(false);
  useFileSink(list.add);
  const file = list.items[0] ?? null;
  const thumbs = usePageThumbs(file, 160);
  const [mode, setMode] = useState<Mode>('extract');
  const [selected, setSelected] = useState<number[]>([]);
  const [rangeText, setRangeText] = useState('');
  const [chunk, setChunk] = useState(2);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSelected([]);
    setRangeText('');
  }, [file]);

  const parsed = useMemo(() => (file && rangeText.trim() ? parseRanges(rangeText, file.pageCount) : null), [rangeText, file]);
  const rangeError = !!rangeText.trim() && !parsed;

  const toggle = (p: number) => {
    const next = selected.includes(p) ? selected.filter((x) => x !== p) : [...selected, p].sort((a, b) => a - b);
    setSelected(next);
    setRangeText(formatRanges(next));
  };

  const groups = useMemo<number[][]>(() => {
    if (!file) return [];
    const all = Array.from({ length: file.pageCount }, (_, i) => i + 1);
    if (mode === 'each') return all.map((p) => [p]);
    if (mode === 'chunks') {
      const out: number[][] = [];
      for (let i = 0; i < all.length; i += chunk) out.push(all.slice(i, i + chunk));
      return out;
    }
    return parsed ? [parsed] : [];
  }, [file, mode, chunk, parsed]);

  const run = async () => {
    if (!file || !groups.length) return;
    setBusy(true);
    try {
      const { PDFDocument } = await loadPdfLib();
      const src = await PDFDocument.load(file.bytes, { ignoreEncryption: true });
      const name = baseName(file.name);
      const outputs: { name: string; blob: Blob }[] = [];
      for (const g of groups) {
        const out = await PDFDocument.create();
        const pages = await out.copyPages(src, g.map((p) => p - 1));
        pages.forEach((p) => out.addPage(p));
        const label = g.length === 1 ? `page-${g[0]}` : `pages-${formatRanges(g).replace(/, /g, '_')}`;
        outputs.push({ name: `${name}-${label}.pdf`, blob: pdfBlob(await out.save({ useObjectStreams: true })) });
      }
      if (outputs.length === 1) await saveBlob(outputs[0].blob, outputs[0].name);
      else await saveBlob(await createZip(outputs), `${name}-split.zip`);
    } catch (err) {
      showToast(`Split failed: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!file) {
    return (
      <ToolLayout
        main={<Dropzone accept={PDF_ACCEPT} onFiles={list.add} title="Drop a PDF to split" hint="Pick pages, or split every page into its own file" icon={<Scissors size={20} />} />}
        panel={<PanelSection title="How it works"><p className="text-xs leading-[17px] text-muted">Extract a range of pages into a new PDF, or split the whole document into single pages or equal parts, downloaded together as a ZIP.</p></PanelSection>}
      />
    );
  }

  const picked = mode === 'extract' ? new Set(parsed ?? []) : null;

  return (
    <ToolLayout
      main={
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mx-auto max-w-[980px]">
            <p className="mb-3 text-xs text-muted">{mode === 'extract' ? 'Click pages to select them, or type a range on the right.' : `${groups.length} files will be created.`}</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
              {Array.from({ length: file.pageCount }, (_, i) => i + 1).map((p) => {
                const gi = mode === 'extract' ? -1 : groups.findIndex((g) => g.includes(p));
                return (
                  <PageTile key={p} page={p} url={thumbs[p]} selected={picked?.has(p)} dimmed={!!picked && picked.size > 0 && !picked.has(p)} onClick={mode === 'extract' ? () => toggle(p) : undefined}>
                    {gi >= 0 && <span className="absolute top-1.5 left-1.5 rounded-full bg-accent-fill px-1.5 text-[length:calc(10px*var(--text-scale))] font-semibold text-white">File {gi + 1}</span>}
                  </PageTile>
                );
              })}
            </div>
          </div>
        </div>
      }
      panel={
        <>
          <PanelSection title="Document">
            <PdfRow file={file} thumb={thumbs[1]} onRemove={list.clear} />
          </PanelSection>
          <PanelSection title="Split">
            <Segmented<Mode>
              ariaLabel="Split mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'extract', label: 'Pick pages' },
                { value: 'each', label: 'Every page' },
                { value: 'chunks', label: 'Every N' },
              ]}
            />
            {mode === 'extract' && (
              <label className="flex flex-col gap-1.5 text-xs text-muted">
                Pages
                <input
                  value={rangeText}
                  onChange={(e) => {
                    setRangeText(e.target.value);
                    const p = parseRanges(e.target.value, file.pageCount);
                    if (p) setSelected(p);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder={`e.g. 1-3, 5 (of ${file.pageCount})`}
                  aria-invalid={rangeError}
                  className={`h-8 rounded-[7px] bg-control px-2.5 text-sm text-fg outline-none ring-accent focus:ring-1 ${rangeError ? 'ring-1 ring-danger' : ''}`}
                />
                {rangeError && <span className="text-danger">Use page numbers from 1 to {file.pageCount}, like “1-3, 5”.</span>}
              </label>
            )}
            {mode === 'chunks' && (
              <div className="flex items-center gap-2 text-xs text-muted">
                Pages per file
                <div className="w-24">
                  <NumberInput ariaLabel="Pages per file" value={chunk} min={1} max={file.pageCount} onChange={setChunk} />
                </div>
              </div>
            )}
          </PanelSection>
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={busy || !groups.length || (mode === 'extract' && !parsed)} onClick={() => void run()}>
          {busy ? <Spinner size={13} /> : <Scissors size={14} />}
          {mode === 'extract'
            ? parsed
              ? `Extract ${parsed.length} ${parsed.length === 1 ? 'page' : 'pages'}`
              : 'Select pages to extract'
            : `Split into ${groups.length} files (ZIP)`}
        </Button>
      }
    />
  );
}

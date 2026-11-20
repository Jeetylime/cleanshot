import { useState } from 'react';
import { ScanSearch } from 'lucide-react';
import { Button, ToggleRow } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { errorMessage } from '../../tools/shared/batch';
import { Dropzone, PanelSection, ProgressBar, saveBlob, Spinner, ToolLayout, useFileSink } from '../../tools/shared/ui';
import { baseName, loadPdfLib, openForRender, pdfBlob, renderPage } from '../engine';
import { PDF_ACCEPT, PdfRow, usePageThumbs, usePdfList } from '../ui';
import { useOcr } from '../../tools/ai/useOcr';

/** Longest rendered side: enough detail for small print without huge memory use. */
const MAX_SIDE = 2400;

export default function Ocr() {
  const list = usePdfList(false);
  useFileSink(list.add);
  const file = list.items[0] ?? null;
  const thumbs = usePageThumbs(file, 120);
  const ocr = useOcr();
  const [skipText, setSkipText] = useState(true);
  const [progress, setProgress] = useState<{ page: number; total: number } | null>(null);

  const run = async () => {
    if (!file) return;
    const lib = await loadPdfLib();
    const { doc: pd, close } = await openForRender(file.bytes);
    try {
      const out = await lib.PDFDocument.load(file.bytes, { updateMetadata: false });
      const font = await out.embedFont(lib.StandardFonts.Helvetica);
      const encodable = (s: string) =>
        Array.from(s)
          .map((ch) => {
            try {
              font.encodeText(ch);
              return ch;
            } catch {
              return '?';
            }
          })
          .join('');
      let added = 0;
      let skipped = 0;
      for (let n = 1; n <= pd.numPages; n++) {
        setProgress({ page: n, total: pd.numPages });
        const page = await pd.getPage(n);
        if (skipText && (await page.getTextContent()).items.some((i) => 'str' in i && i.str.trim())) {
          skipped++;
          continue;
        }
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(3, MAX_SIDE / Math.max(base.width, base.height));
        const vp = page.getViewport({ scale });
        const canvas = await renderPage(pd, n, { scale });
        const lines = await ocr.run(canvas, `Reading page ${n} of ${pd.numPages}…`);
        canvas.width = canvas.height = 0;
        if (!lines) return; // cancelled
        const target = out.getPage(n - 1);
        const key = target.node.newFontDictionary(font.name, font.ref);
        for (const l of lines) {
          const str = encodable(l.text);
          if (!str.trim()) continue;
          // Baseline start and end in PDF space (handles rotated pages).
          const [x0, y0] = vp.convertToPdfPoint(l.x, l.y + l.h * 0.8);
          const [x1, y1] = vp.convertToPdfPoint(l.x + l.w, l.y + l.h * 0.8);
          const len = Math.hypot(x1 - x0, y1 - y0);
          if (len < 1) continue;
          const cos = (x1 - x0) / len;
          const sin = (y1 - y0) / len;
          const size = Math.max(2, (l.h / scale) * 0.9);
          const natural = font.widthOfTextAtSize(str, size);
          const tz = natural > 0 ? Math.max(10, Math.min(1000, (100 * len) / natural)) : 100;
          target.pushOperators(
            lib.beginText(),
            lib.setFontAndSize(key, size),
            lib.setTextRenderingMode(lib.TextRenderingMode.Invisible),
            lib.setCharacterSqueeze(tz),
            lib.setTextMatrix(cos, sin, -sin, cos, x0, y0),
            lib.showText(font.encodeText(str)),
            lib.endText(),
          );
        }
        added++;
        page.cleanup();
      }
      if (!added) {
        showToast(skipped ? 'Every page already has text; nothing to do.' : 'No text found.', 'info');
        return;
      }
      await saveBlob(pdfBlob(await out.save()), `${baseName(file.name)}-searchable.pdf`);
      showToast(`Added a text layer to ${added} page${added === 1 ? '' : 's'}${skipped ? `; ${skipped} already had text` : ''}.`, 'success');
    } catch (err) {
      showToast(`Couldn’t make the PDF searchable: ${errorMessage(err)}`, 'error');
    } finally {
      close();
      setProgress(null);
    }
  };

  return (
    <ToolLayout
      main={
        <div className="relative flex min-h-0 flex-1">
          {file ? (
            <div className="flex flex-1 items-start justify-center p-8">
              <div className="flex w-full max-w-[420px] flex-col gap-3">
                <PdfRow file={file} thumb={thumbs[1]} onRemove={list.clear} />
                {progress && <ProgressBar value={(progress.page - 1) / progress.total} label={`Page ${progress.page} of ${progress.total}`} />}
              </div>
            </div>
          ) : (
            <Dropzone accept={PDF_ACCEPT} onFiles={list.add} title="Drop a scanned PDF" hint="Add a hidden text layer so you can search, select and copy" icon={<ScanSearch size={20} />} />
          )}
          {ocr.status}
        </div>
      }
      panel={
        <PanelSection title="Options">
          <ToggleRow label="Skip pages that already have text" checked={skipText} onChange={setSkipText} />
          <p className="text-2xs leading-[15px] text-subtle">Pages look exactly the same; the recognized text is added invisibly on top, like scanner software does. Recognition runs on your device and takes a few seconds per page.</p>
        </PanelSection>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={!file || !!progress || ocr.busy} onClick={() => void run()}>
          {progress ? <Spinner size={13} /> : <ScanSearch size={14} />} Make searchable
        </Button>
      }
    />
  );
}

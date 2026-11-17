import { useEffect, useState } from 'react';
import { Download, Shrink } from 'lucide-react';
import { Button, Segmented, Slider } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { formatBytes } from '../../lib/utils';
import { errorMessage } from '../../tools/shared/batch';
import { Notice, PanelSection, ProgressBar, saveBlob, SizeDelta, Spinner, ToolLayout, useFileSink, Dropzone } from '../../tools/shared/ui';
import { baseName, canvasBytes, loadPdfLib, openForRender, pdfBlob, renderPage } from '../engine';
import { PDF_ACCEPT, PdfRow, usePageThumbs, usePdfList } from '../ui';

type Mode = 'lossless' | 'images';

const DPI = [
  { value: 72, label: 'Screen', hint: '72 DPI' },
  { value: 110, label: 'eBook', hint: '110 DPI' },
  { value: 150, label: 'Print', hint: '150 DPI' },
];

export default function Compress() {
  const list = usePdfList(false);
  useFileSink(list.add);
  const file = list.items[0] ?? null;
  const thumbs = usePageThumbs(file, 120);
  const [mode, setMode] = useState<Mode>('images');
  const [dpi, setDpi] = useState(110);
  const [quality, setQuality] = useState(70);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ blob: Blob; key: string } | null>(null);

  const key = `${file?.id}|${mode}|${dpi}|${quality}`;
  useEffect(() => setResult(null), [file]);

  const run = async () => {
    if (!file) return;
    setProgress(0);
    try {
      const { PDFDocument } = await loadPdfLib();
      let bytes: Uint8Array;
      if (mode === 'lossless') {
        const doc = await PDFDocument.load(file.bytes, { ignoreEncryption: true, updateMetadata: false });
        doc.setTitle('');
        doc.setAuthor('');
        doc.setSubject('');
        doc.setKeywords([]);
        doc.setProducer('');
        doc.setCreator('');
        bytes = await doc.save({ useObjectStreams: true });
        setProgress(1);
      } else {
        const { doc: src, close } = await openForRender(file.bytes);
        const out = await PDFDocument.create();
        try {
          for (let n = 1; n <= src.numPages; n++) {
            const page = await src.getPage(n);
            const vp = page.getViewport({ scale: 1 });
            const canvas = await renderPage(src, n, { scale: dpi / 72 });
            const jpg = await out.embedJpg(await canvasBytes(canvas, 'image/jpeg', quality / 100));
            canvas.width = canvas.height = 0;
            const p = out.addPage([vp.width, vp.height]);
            p.drawImage(jpg, { x: 0, y: 0, width: vp.width, height: vp.height });
            setProgress(n / src.numPages);
          }
        } finally {
          close();
        }
        bytes = await out.save({ useObjectStreams: true });
      }
      setResult({ blob: pdfBlob(bytes), key });
    } catch (err) {
      showToast(`Compression failed: ${errorMessage(err)}`, 'error');
    } finally {
      setProgress(null);
    }
  };

  if (!file) {
    return (
      <ToolLayout
        main={<Dropzone accept={PDF_ACCEPT} onFiles={list.add} title="Drop a PDF to compress" hint="Scanned documents and image-heavy PDFs shrink the most" icon={<Shrink size={20} />} />}
        panel={<PanelSection title="How it works"><p className="text-xs leading-[17px] text-muted">Choose between a lossless clean-up that keeps everything exactly as is, or a much smaller version that turns each page into a compressed image.</p></PanelSection>}
      />
    );
  }

  const fresh = result?.key === key ? result : null;
  const bigger = fresh && fresh.blob.size >= file.size;

  return (
    <ToolLayout
      main={
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-6">
          <div className="flex items-end gap-2">
            {[1, 2, 3].filter((p) => p <= file.pageCount).map((p, i) => (
              <span key={p} className="flex h-[150px] w-[112px] items-center justify-center overflow-hidden rounded-[6px] border border-line bg-white shadow-pop" style={{ transform: `rotate(${(i - 1) * 4}deg) translateY(${i === 1 ? -6 : 0}px)` }}>
                {thumbs[p] && <img src={thumbs[p]} alt="" className="max-h-full max-w-full" />}
              </span>
            ))}
          </div>
          <div className="flex w-full max-w-[420px] flex-col gap-3 rounded-[14px] border border-line bg-panel p-4" data-testid="pdf-compress-result">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-subtle">Original</span>
              <span className="text-sm text-fg tabular-nums">{formatBytes(file.size)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-subtle">Compressed</span>
              <span className="text-sm tabular-nums">
                {progress !== null ? (
                  <span className="flex items-center gap-1.5 text-muted">
                    <Spinner size={12} /> Working…
                  </span>
                ) : fresh ? (
                  <span className="flex items-baseline gap-2">
                    <span className="font-semibold text-fg">{formatBytes(fresh.blob.size)}</span>
                    <SizeDelta before={file.size} after={fresh.blob.size} />
                  </span>
                ) : (
                  <span className="text-subtle">Not yet compressed</span>
                )}
              </span>
            </div>
            {progress !== null && mode === 'images' && <ProgressBar value={progress} />}
            {bigger && (
              <Notice>
                {mode === 'images'
                  ? 'This PDF is mostly text or vector graphics, so turning its pages into images made it larger. Try Lossless, or keep the original.'
                  : 'This PDF is already efficient, so the result isn’t smaller. Try Smaller (turns pages into images), or keep the original.'}
              </Notice>
            )}
          </div>
        </div>
      }
      panel={
        <>
          <PanelSection title="Document">
            <PdfRow file={file} thumb={thumbs[1]} onRemove={list.clear} />
          </PanelSection>
          <PanelSection title="Compression">
            <Segmented<Mode>
              ariaLabel="Compression mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'images', label: 'Smaller' },
                { value: 'lossless', label: 'Lossless' },
              ]}
            />
            {mode === 'images' ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted">Resolution</span>
                  <Segmented<number> ariaLabel="Resolution" size="sm" value={dpi} onChange={setDpi} options={DPI.map((d) => ({ value: d.value, label: d.label, title: d.hint }))} />
                </div>
                <Slider label="Image quality" value={quality} min={30} max={95} unit="%" onChange={(q) => setQuality(Math.round(q))} />
                <p className="text-xs leading-[16px] text-subtle">
                  Each page becomes a compressed image. Text will no longer be selectable or searchable, and links stop working.
                </p>
              </>
            ) : (
              <p className="text-xs leading-[16px] text-subtle">
                Rewrites the file more compactly and removes document info. Pages stay exactly the same, with selectable text. Savings are usually modest.
              </p>
            )}
          </PanelSection>
        </>
      }
      footer={
        <>
          <Button variant={fresh ? 'secondary' : 'primary'} className="h-8" disabled={progress !== null} onClick={() => void run()}>
            <Shrink size={14} /> {fresh ? 'Compress again' : 'Compress PDF'}
          </Button>
          {fresh && (
            <Button variant="primary" className="h-8" onClick={() => void saveBlob(fresh.blob, `${baseName(file.name)}-compressed.pdf`)}>
              <Download size={14} /> Download {formatBytes(fresh.blob.size)}
            </Button>
          )}
        </>
      }
    />
  );
}

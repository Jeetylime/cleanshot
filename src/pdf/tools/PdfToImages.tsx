import { useEffect, useState } from 'react';
import { Images, LayoutTemplate } from 'lucide-react';
import { sendToCanvas } from '../../studio/handoff';
import { Button, Segmented, Slider } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { errorMessage } from '../../tools/shared/batch';
import { createZip } from '../../tools/shared/zip';
import { canvasToBlob } from '../../engine/images';
import { Dropzone, PanelSection, ProgressBar, saveBlob, ToolLayout, useFileSink } from '../../tools/shared/ui';
import { baseName, openForRender, renderPage } from '../engine';
import { PDF_ACCEPT, PageTile, PdfRow, usePageThumbs, usePdfList } from '../ui';

type Fmt = 'png' | 'jpeg';

export default function PdfToImages() {
  const list = usePdfList(false, { readOnly: true });
  useFileSink(list.add);
  const file = list.items[0] ?? null;
  const thumbs = usePageThumbs(file, 160);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [fmt, setFmt] = useState<Fmt>('png');
  const [dpi, setDpi] = useState(150);
  const [quality, setQuality] = useState(90);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => setSelected(new Set(file ? Array.from({ length: file.pageCount }, (_, i) => i + 1) : [])), [file]);

  const toggle = (p: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  const run = async () => {
    if (!file) return;
    const pages = [...selected].sort((a, b) => a - b);
    setProgress(0);
    try {
      const { doc, close } = await openForRender(file.bytes);
      const outputs: { name: string; blob: Blob }[] = [];
      try {
        for (let k = 0; k < pages.length; k++) {
          const c = await renderPage(doc, pages[k], { scale: dpi / 72 });
          const blob = await canvasToBlob(c, fmt === 'png' ? 'image/png' : 'image/jpeg', fmt === 'jpeg' ? quality / 100 : undefined);
          c.width = c.height = 0;
          outputs.push({ name: `${baseName(file.name)}-page-${pages[k]}.${fmt === 'png' ? 'png' : 'jpg'}`, blob });
          setProgress((k + 1) / pages.length);
        }
      } finally {
        close();
      }
      if (outputs.length === 1) await saveBlob(outputs[0].blob, outputs[0].name);
      else await saveBlob(await createZip(outputs), `${baseName(file.name)}-images.zip`);
    } catch (err) {
      showToast(`Conversion failed: ${errorMessage(err)}`, 'error');
    } finally {
      setProgress(null);
    }
  };

  /** Render the first selected page and open it on Canvas as a new design. */
  const toCanvas = async () => {
    if (!file) return;
    const p = Math.min(...selected);
    setProgress(0);
    try {
      const { doc, close } = await openForRender(file.bytes);
      try {
        const c = await renderPage(doc, p, { scale: 150 / 72 });
        const blob = await canvasToBlob(c, 'image/png');
        c.width = c.height = 0;
        sendToCanvas(blob, `${baseName(file.name)}-page-${p}.png`, { newDesign: true });
      } finally {
        close();
      }
    } catch (err) {
      showToast(`Couldn’t open the page: ${errorMessage(err)}`, 'error');
    } finally {
      setProgress(null);
    }
  };

  if (!file) {
    return (
      <ToolLayout
        main={<Dropzone accept={PDF_ACCEPT} onFiles={list.add} title="Drop a PDF to convert to images" hint="Save pages as PNG or JPEG" icon={<Images size={20} />} />}
        panel={<PanelSection title="How it works"><p className="text-xs leading-[17px] text-muted">Every page you select becomes a PNG or JPEG at the resolution you choose. Several pages download together as a ZIP.</p></PanelSection>}
      />
    );
  }

  const all = selected.size === file.pageCount;

  return (
    <ToolLayout
      main={
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mx-auto max-w-[980px]">
            <div className="mb-3 flex items-center justify-between text-xs text-muted">
              <span>
                <span className="font-semibold text-fg tabular-nums">{selected.size}</span> of {file.pageCount} pages selected
              </span>
              <button type="button" className="text-accent hover:underline" onClick={() => setSelected(new Set(all ? [] : Array.from({ length: file.pageCount }, (_, i) => i + 1)))}>
                {all ? 'Select none' : 'Select all'}
              </button>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
              {Array.from({ length: file.pageCount }, (_, i) => i + 1).map((p) => (
                <PageTile key={p} page={p} url={thumbs[p]} selected={selected.has(p)} dimmed={!selected.has(p)} onClick={() => toggle(p)} />
              ))}
            </div>
          </div>
        </div>
      }
      panel={
        <>
          <PanelSection title="Document">
            <PdfRow file={file} thumb={thumbs[1]} onRemove={list.clear} />
          </PanelSection>
          <PanelSection title="Images">
            <Segmented<Fmt> ariaLabel="Image format" value={fmt} onChange={setFmt} options={[{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPEG' }]} />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Resolution</span>
              <Segmented<number>
                ariaLabel="Resolution"
                size="sm"
                value={dpi}
                onChange={setDpi}
                options={[
                  { value: 72, label: '72 DPI' },
                  { value: 150, label: '150 DPI' },
                  { value: 300, label: '300 DPI' },
                ]}
              />
            </div>
            {fmt === 'jpeg' && <Slider label="Quality" value={quality} min={40} max={100} unit="%" onChange={(q) => setQuality(Math.round(q))} />}
            <p className="text-xs leading-[16px] text-subtle">150 DPI suits screens; 300 DPI is print quality but makes large files.</p>
          </PanelSection>
        </>
      }
      footer={
        <>
          {progress !== null && <ProgressBar value={progress} />}
          <Button className="h-8" disabled={selected.size !== 1 || progress !== null} title={selected.size === 1 ? 'Open this page as a new Canvas design' : 'Select exactly one page'} onClick={() => void toCanvas()}>
            <LayoutTemplate size={14} /> Design on Canvas
          </Button>
          <Button variant="primary" className="h-8" disabled={!selected.size || progress !== null} onClick={() => void run()}>
            <Images size={14} />
            {selected.size ? `Convert ${selected.size} ${selected.size === 1 ? 'page' : 'pages'}` : 'Select pages'}
          </Button>
        </>
      }
    />
  );
}

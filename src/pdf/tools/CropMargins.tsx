import { useMemo, useState } from 'react';
import { Crop } from 'lucide-react';
import { Button, NumberInput, Segmented, Slider } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { errorMessage } from '../../tools/shared/batch';
import { Dropzone, PanelSection, ProgressBar, saveBlob, ToolLayout, useFileSink } from '../../tools/shared/ui';
import { baseName, createCanvas, ctx2d, loadPdfLib, openForRender, parseRanges, pdfBlob } from '../engine';
import { PDF_ACCEPT, PageTile, PdfRow, usePageThumbs, usePdfList } from '../ui';

type Mode = 'auto' | 'manual';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Bounding box of non-background pixels in RGBA data (top-left origin).
 * A pixel counts as content when any channel differs from white by more than
 * `threshold`. Returns null for a blank page.
 */
export function contentBounds(data: Uint8ClampedArray, w: number, h: number, threshold = 24): Box | null {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const i = row + x * 4;
      if (255 - data[i] > threshold || 255 - data[i + 1] > threshold || 255 - data[i + 2] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

const MM = 72 / 25.4;

export default function CropMargins() {
  const list = usePdfList(false);
  useFileSink(list.add);
  const file = list.items[0] ?? null;
  const thumbs = usePageThumbs(file, 160);
  const [mode, setMode] = useState<Mode>('auto');
  const [padding, setPadding] = useState(6);
  const [margins, setMargins] = useState({ top: 15, right: 15, bottom: 15, left: 15 });
  const [rangeText, setRangeText] = useState('');
  const [progress, setProgress] = useState<number | null>(null);

  const pages = useMemo(() => (file ? (rangeText.trim() ? parseRanges(rangeText, file.pageCount) : Array.from({ length: file.pageCount }, (_, i) => i + 1)) : null), [file, rangeText]);

  const run = async () => {
    if (!file || !pages) return;
    setProgress(0);
    try {
      const { PDFDocument } = await loadPdfLib();
      const out = await PDFDocument.load(file.bytes, { ignoreEncryption: true });
      const render = mode === 'auto' ? await openForRender(file.bytes) : null;
      let blank = 0;
      try {
        for (let k = 0; k < pages.length; k++) {
          const page = out.getPage(pages[k] - 1);
          const cb = page.getCropBox();
          let box: Box;
          if (render) {
            // Render unrotated so pixel bounds map straight onto PDF user space.
            const p = await render.doc.getPage(pages[k]);
            const scale = 1.5;
            const vp = p.getViewport({ scale, rotation: 0 });
            const c = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
            const ctx = ctx2d(c, { willReadFrequently: true });
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, c.width, c.height);
            await p.render({ canvas: c, viewport: vp }).promise;
            p.cleanup();
            const b = contentBounds(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
            c.width = c.height = 0;
            if (!b) {
              blank++;
              continue;
            }
            const pad = padding * MM;
            const x0 = Math.max(cb.x, cb.x + b.x / scale - pad);
            const x1 = Math.min(cb.x + cb.width, cb.x + (b.x + b.w) / scale + pad);
            const yTop = Math.min(cb.y + cb.height, cb.y + cb.height - b.y / scale + pad);
            const yBot = Math.max(cb.y, cb.y + cb.height - (b.y + b.h) / scale - pad);
            box = { x: x0, y: yBot, w: x1 - x0, h: yTop - yBot };
          } else {
            // Margins follow the page as it is displayed, so map them through its rotation.
            const r = ((page.getRotation().angle % 360) + 360) % 360;
            const m = { t: margins.top * MM, r: margins.right * MM, b: margins.bottom * MM, l: margins.left * MM };
            const [t, rt, bt, lt] = r === 90 ? [m.l, m.t, m.r, m.b] : r === 180 ? [m.b, m.l, m.t, m.r] : r === 270 ? [m.r, m.b, m.l, m.t] : [m.t, m.r, m.b, m.l];
            box = { x: cb.x + lt, y: cb.y + bt, w: cb.width - lt - rt, h: cb.height - t - bt };
          }
          if (box.w < 10 || box.h < 10) throw new Error(`The margins leave nothing of page ${pages[k]}.`);
          page.setCropBox(box.x, box.y, box.w, box.h);
          setProgress((k + 1) / pages.length);
        }
      } finally {
        render?.close();
      }
      await saveBlob(pdfBlob(await out.save({ useObjectStreams: true })), `${baseName(file.name)}-cropped.pdf`);
      if (blank) showToast(`${blank} blank ${blank === 1 ? 'page was' : 'pages were'} left as they were.`, 'info');
    } catch (err) {
      showToast(`Crop failed: ${errorMessage(err)}`, 'error');
    } finally {
      setProgress(null);
    }
  };

  if (!file) {
    return (
      <ToolLayout
        main={<Dropzone accept={PDF_ACCEPT} onFiles={list.add} title="Drop a PDF to crop" hint="Trim white margins from scans and slides" icon={<Crop size={20} />} />}
        panel={<PanelSection title="How it works"><p className="text-xs leading-[17px] text-muted">Sets each page’s crop box. Content outside it is hidden, not deleted, so viewers can still reveal it. Use the Compress tool’s image mode to remove it for good.</p></PanelSection>}
      />
    );
  }

  const selected = new Set(pages ?? []);
  const field = (k: keyof typeof margins, label: string) => (
    <label className="flex flex-col gap-1 text-2xs text-subtle">
      {label}
      <NumberInput ariaLabel={`${label} margin in millimetres`} value={margins[k]} min={0} max={500} suffix="mm" onChange={(v) => setMargins((m) => ({ ...m, [k]: v }))} />
    </label>
  );

  return (
    <ToolLayout
      main={
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mx-auto grid max-w-[980px] grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
            {Array.from({ length: file.pageCount }, (_, i) => i + 1).map((p) => (
              <PageTile key={p} page={p} url={thumbs[p]} selected={selected.has(p)} dimmed={!selected.has(p)} />
            ))}
          </div>
        </div>
      }
      panel={
        <>
          <PanelSection title="Document">
            <PdfRow file={file} thumb={thumbs[1]} onRemove={list.clear} />
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              Pages (blank = all)
              <input value={rangeText} onChange={(e) => setRangeText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder={`e.g. 1-${file.pageCount}`} className="h-8 rounded-[7px] bg-control px-2.5 text-sm text-fg outline-none ring-accent focus:ring-1" />
            </label>
          </PanelSection>
          <PanelSection title="Crop">
            <Segmented<Mode> ariaLabel="Crop mode" value={mode} onChange={setMode} options={[{ value: 'auto', label: 'Trim whitespace' }, { value: 'manual', label: 'Set margins' }]} />
            {mode === 'auto' ? (
              <Slider label="Keep around content" value={padding} min={0} max={30} unit=" mm" onChange={(v) => setPadding(Math.round(v))} />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {field('top', 'Top')}
                {field('bottom', 'Bottom')}
                {field('left', 'Left')}
                {field('right', 'Right')}
              </div>
            )}
          </PanelSection>
        </>
      }
      footer={
        <>
          {progress !== null && <ProgressBar value={progress} label={<span>Cropping…</span>} />}
          <Button variant="primary" className="h-8" disabled={!pages || progress !== null} onClick={() => void run()}>
            <Crop size={14} /> Crop and download
          </Button>
        </>
      }
    />
  );
}

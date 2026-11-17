import { useMemo, useState } from 'react';
import { Hash } from 'lucide-react';
import { Button, ColorWell, NumberInput, Segmented, Slider } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { errorMessage } from '../../tools/shared/batch';
import { Dropzone, PanelSection, saveBlob, Spinner, ToolLayout, useFileSink } from '../../tools/shared/ui';
import { baseName, loadPdfLib, parseRanges, pdfBlob } from '../engine';
import { PDF_ACCEPT, PageTile, PdfRow, usePageThumbs, usePdfList } from '../ui';

type Slot = 'left' | 'center' | 'right';
type NumberStyle = 'n' | 'page-n' | 'n-of-total' | 'none';

/** Fill `{n}`, `{total}`, `{file}` and `{date}` in a header/footer template. */
export function fillTemplate(t: string, n: number, total: number, file: string, date = new Date()): string {
  return t
    .replace(/\{n\}/g, String(n))
    .replace(/\{total\}/g, String(total))
    .replace(/\{file\}/g, file)
    .replace(/\{date\}/g, date.toLocaleDateString());
}

function numberText(style: NumberStyle, n: number, total: number): string {
  if (style === 'n') return String(n);
  if (style === 'page-n') return `Page ${n}`;
  if (style === 'n-of-total') return `${n} of ${total}`;
  return '';
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

export default function Stamp() {
  const list = usePdfList(false);
  useFileSink(list.add);
  const file = list.items[0] ?? null;
  const thumbs = usePageThumbs(file, 160);
  const [numbers, setNumbers] = useState<NumberStyle>('n-of-total');
  const [numberSlot, setNumberSlot] = useState<Slot>('center');
  const [start, setStart] = useState(1);
  const [header, setHeader] = useState('');
  const [footer, setFooter] = useState('');
  const [watermark, setWatermark] = useState('');
  const [wmOpacity, setWmOpacity] = useState(15);
  const [fontSize, setFontSize] = useState(10);
  const [color, setColor] = useState('#444444');
  const [margin, setMargin] = useState(28);
  const [rangeText, setRangeText] = useState('');
  const [busy, setBusy] = useState(false);

  const pages = useMemo(() => (file ? (rangeText.trim() ? parseRanges(rangeText, file.pageCount) : Array.from({ length: file.pageCount }, (_, i) => i + 1)) : null), [file, rangeText]);
  const nothing = numbers === 'none' && !header.trim() && !footer.trim() && !watermark.trim();

  const run = async () => {
    if (!file || !pages) return;
    setBusy(true);
    try {
      const { PDFDocument, StandardFonts, rgb, degrees } = await loadPdfLib();
      const doc = await PDFDocument.load(file.bytes, { ignoreEncryption: true });
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const bold = await doc.embedFont(StandardFonts.HelveticaBold);
      const [r, g, b] = hexRgb(color);
      const total = pages.length;
      const name = baseName(file.name);
      // Standard fonts only cover WinAnsi; drop characters they can't encode.
      const safe = (s: string) => [...s].filter((ch) => { try { font.encodeText(ch); return true; } catch { return false; } }).join('');
      pages.forEach((p, idx) => {
        const page = doc.getPage(p - 1);
        const { width, height } = page.getSize();
        const n = idx + start;
        const put = (text: string, slot: Slot, y: number) => {
          const t = safe(text);
          if (!t) return;
          const w = font.widthOfTextAtSize(t, fontSize);
          const x = slot === 'left' ? margin : slot === 'right' ? width - margin - w : (width - w) / 2;
          page.drawText(t, { x, y, size: fontSize, font, color: rgb(r, g, b) });
        };
        if (header.trim()) put(fillTemplate(header, n, total + start - 1, name), 'center', height - margin);
        if (footer.trim()) put(fillTemplate(footer, n, total + start - 1, name), numbers !== 'none' && numberSlot === 'center' ? 'left' : 'center', margin - fontSize / 2);
        if (numbers !== 'none') put(numberText(numbers, n, total + start - 1), numberSlot, margin - fontSize / 2);
        const wm = safe(watermark.trim());
        if (wm) {
          const size = Math.min(width, height) / Math.max(4, wm.length * 0.55);
          const w = bold.widthOfTextAtSize(wm, size);
          const angle = Math.atan2(height, width);
          const cx = width / 2 - (Math.cos(angle) * w) / 2 + (Math.sin(angle) * size) / 3;
          const cy = height / 2 - (Math.sin(angle) * w) / 2 - (Math.cos(angle) * size) / 3;
          page.drawText(wm, { x: cx, y: cy, size, font: bold, color: rgb(r, g, b), opacity: wmOpacity / 100, rotate: degrees((angle * 180) / Math.PI) });
        }
      });
      await saveBlob(pdfBlob(await doc.save({ useObjectStreams: true })), `${name}-stamped.pdf`);
    } catch (err) {
      showToast(`Couldn’t stamp PDF: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!file) {
    return (
      <ToolLayout
        main={<Dropzone accept={PDF_ACCEPT} onFiles={list.add} title="Drop a PDF" hint="Add page numbers, headers, footers or a watermark" icon={<Hash size={20} />} />}
        panel={<PanelSection title="How it works"><p className="text-xs leading-[17px] text-muted">Text is added as real PDF text on top of each page. Headers and footers can use {'{n}'}, {'{total}'}, {'{file}'} and {'{date}'}.</p></PanelSection>}
      />
    );
  }

  const input = (value: string, set: (v: string) => void, label: string, placeholder: string) => (
    <label className="flex flex-col gap-1.5 text-xs text-muted">
      {label}
      <input value={value} onChange={(e) => set(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder={placeholder} className="h-8 rounded-[7px] bg-control px-2.5 text-sm text-fg outline-none ring-accent focus:ring-1" />
    </label>
  );
  const selected = new Set(pages ?? []);

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
            {input(rangeText, setRangeText, 'Pages (blank = all)', `e.g. 2-${file.pageCount}`)}
            {rangeText.trim() && !pages && <span className="text-xs text-danger">Use page numbers from 1 to {file.pageCount}.</span>}
          </PanelSection>
          <PanelSection title="Page numbers">
            <Segmented<NumberStyle> ariaLabel="Number style" value={numbers} onChange={setNumbers} options={[{ value: 'none', label: 'None' }, { value: 'n', label: '1' }, { value: 'page-n', label: 'Page 1' }, { value: 'n-of-total', label: '1 of N' }]} />
            {numbers !== 'none' && (
              <>
                <Segmented<Slot> ariaLabel="Number position" value={numberSlot} onChange={setNumberSlot} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} />
                <div className="flex items-center gap-2 text-xs text-muted">
                  Start at
                  <div className="w-24"><NumberInput ariaLabel="First page number" value={start} min={0} max={99999} onChange={setStart} /></div>
                </div>
              </>
            )}
          </PanelSection>
          <PanelSection title="Header and footer">
            {input(header, setHeader, 'Header', 'e.g. {file}')}
            {input(footer, setFooter, 'Footer', 'e.g. Confidential · {date}')}
          </PanelSection>
          <PanelSection title="Watermark">
            {input(watermark, setWatermark, 'Diagonal text', 'e.g. DRAFT')}
            {watermark.trim() && <Slider label="Opacity" value={wmOpacity} min={5} max={60} unit="%" onChange={(v) => setWmOpacity(Math.round(v))} />}
          </PanelSection>
          <PanelSection title="Style">
            <Slider label="Text size" value={fontSize} min={6} max={24} unit="pt" onChange={(v) => setFontSize(Math.round(v))} />
            <Slider label="Margin" value={margin} min={10} max={72} unit="pt" onChange={(v) => setMargin(Math.round(v))} />
            <ColorWell label="Text color" value={color} onChange={setColor} />
          </PanelSection>
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={busy || !pages || nothing} onClick={() => void run()}>
          {busy ? <Spinner size={13} /> : <Hash size={14} />} Apply and download
        </Button>
      }
    />
  );
}

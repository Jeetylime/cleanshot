import { useState } from 'react';
import { ArrowDown, ArrowUp, FileImage } from 'lucide-react';
import { Button, Segmented } from '../../components/ui/controls';
import { Tooltip } from '../../components/ui/Tooltip';
import { showToast } from '../../store/actions';
import { errorMessage } from '../../tools/shared/batch';
import { hasTransparency } from '../../tools/shared/encode';
import { BatchList } from '../../tools/shared/BatchList';
import { Dropzone, FileRow, PanelSection, ProgressBar, saveBlob, ToolLayout, useFileSink, useImageList } from '../../tools/shared/ui';
import { canvasBytes, createCanvas, ctx2d, loadPdfLib, pdfBlob } from '../engine';

type PageSize = 'fit' | 'a4' | 'letter';
type Orientation = 'auto' | 'portrait' | 'landscape';
type Margin = 0 | 18 | 36;

const SIZES: Record<Exclude<PageSize, 'fit'>, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };

export default function ImagesToPdf() {
  const list = useImageList({ multiple: true });
  useFileSink(list.add);
  const [order, setOrder] = useState<string[]>([]);
  const [size, setSize] = useState<PageSize>('a4');
  const [orientation, setOrientation] = useState<Orientation>('auto');
  const [margin, setMargin] = useState<Margin>(18);
  const [progress, setProgress] = useState<number | null>(null);

  // Keep a user-controlled order in sync with the list.
  const ids = list.items.map((i) => i.id);
  const ordered = [...order.filter((id) => ids.includes(id)), ...ids.filter((id) => !order.includes(id))];
  const items = ordered.map((id) => list.items.find((i) => i.id === id)!);
  const move = (id: string, d: -1 | 1) => {
    const i = ordered.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= ordered.length) return;
    const next = ordered.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  const run = async () => {
    setProgress(0);
    try {
      const { PDFDocument } = await loadPdfLib();
      const out = await PDFDocument.create();
      for (let k = 0; k < items.length; k++) {
        const img = items[k];
        // Re-encode through a canvas so EXIF orientation is applied and any format works.
        const c = createCanvas(img.width, img.height);
        ctx2d(c).drawImage(img.source, 0, 0);
        const alpha = hasTransparency(c);
        const embedded = alpha ? await out.embedPng(await canvasBytes(c, 'image/png')) : await out.embedJpg(await canvasBytes(c, 'image/jpeg', 0.92));
        c.width = c.height = 0;
        // Page geometry in points (1 px = 0.75 pt at 96 DPI for "fit").
        let pw: number;
        let ph: number;
        if (size === 'fit') {
          pw = img.width * 0.75 + margin * 2;
          ph = img.height * 0.75 + margin * 2;
        } else {
          [pw, ph] = SIZES[size];
          const landscape = orientation === 'landscape' || (orientation === 'auto' && img.width > img.height);
          if (landscape) [pw, ph] = [ph, pw];
        }
        const page = out.addPage([pw, ph]);
        const k2 = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height);
        const w = img.width * k2;
        const h = img.height * k2;
        page.drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
        setProgress((k + 1) / items.length);
      }
      await saveBlob(pdfBlob(await out.save({ useObjectStreams: true })), items.length === 1 ? `${items[0].name.replace(/\.[^.]+$/, '')}.pdf` : 'images.pdf');
    } catch (err) {
      showToast(`Couldn’t create the PDF: ${errorMessage(err)}`, 'error');
    } finally {
      setProgress(null);
    }
  };

  return (
    <ToolLayout
      main={
        items.length ? (
          <BatchList items={items} loading={list.loading} onAdd={list.add} onClear={list.clear} className="mx-auto w-full max-w-[760px] flex-1 pt-2">
            {items.map((img, i) => (
              <FileRow
                key={img.id}
                img={img}
                onRemove={() => list.remove(img.id)}
                status={<span className="text-subtle">Page {i + 1}</span>}
                right={
                  <span className="flex gap-0.5">
                    <Tooltip label="Move up">
                      <button type="button" aria-label={`Move ${img.name} up`} disabled={i === 0} onClick={() => move(img.id, -1)} className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted hover:bg-hover hover:text-fg disabled:opacity-30">
                        <ArrowUp size={13} />
                      </button>
                    </Tooltip>
                    <Tooltip label="Move down">
                      <button type="button" aria-label={`Move ${img.name} down`} disabled={i === items.length - 1} onClick={() => move(img.id, 1)} className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted hover:bg-hover hover:text-fg disabled:opacity-30">
                        <ArrowDown size={13} />
                      </button>
                    </Tooltip>
                  </span>
                }
              />
            ))}
          </BatchList>
        ) : (
          <Dropzone multiple onFiles={list.add} title="Drop images to turn into a PDF" hint="One image per page · PNG, JPEG, WebP, AVIF, GIF or BMP" icon={<FileImage size={20} />} />
        )
      }
      panel={
        <>
          <PanelSection title="Page size">
            <Segmented<PageSize>
              ariaLabel="Page size"
              value={size}
              onChange={setSize}
              options={[
                { value: 'a4', label: 'A4' },
                { value: 'letter', label: 'Letter' },
                { value: 'fit', label: 'Fit image', title: 'Each page matches its image' },
              ]}
            />
            {size !== 'fit' && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">Orientation</span>
                <Segmented<Orientation>
                  ariaLabel="Orientation"
                  size="sm"
                  value={orientation}
                  onChange={setOrientation}
                  options={[
                    { value: 'auto', label: 'Auto', title: 'Match each image' },
                    { value: 'portrait', label: 'Portrait' },
                    { value: 'landscape', label: 'Landscape' },
                  ]}
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Margin</span>
              <Segmented<Margin>
                ariaLabel="Margin"
                size="sm"
                value={margin}
                onChange={setMargin}
                options={[
                  { value: 0, label: 'None' },
                  { value: 18, label: 'Small' },
                  { value: 36, label: 'Large' },
                ]}
              />
            </div>
          </PanelSection>
        </>
      }
      footer={
        <>
          {progress !== null && <ProgressBar value={progress} />}
          <Button variant="primary" className="h-8" disabled={!items.length || progress !== null} onClick={() => void run()}>
            <FileImage size={14} /> {items.length ? `Create PDF (${items.length} ${items.length === 1 ? 'page' : 'pages'})` : 'Add images'}
          </Button>
        </>
      }
    />
  );
}

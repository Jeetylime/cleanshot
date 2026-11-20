import { useEffect, useState } from 'react';
import { Copy, Download, ScanText } from 'lucide-react';
import { Button } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { baseName } from '../shared/files';
import { Dropzone, FileRow, PanelSection, saveBlob, ToolLayout, useFileSink, useImageList } from '../shared/ui';
import { useOcr } from '../ai/useOcr';
import { linesToText, type OcrLine } from '../ai/ocr';

export default function ImageToText() {
  const list = useImageList({ multiple: false });
  useFileSink(list.add);
  const img = list.items[0] ?? null;
  const ocr = useOcr();
  const [lines, setLines] = useState<OcrLine[] | null>(null);
  const [text, setText] = useState('');
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    setLines(null);
    setText('');
    if (!img) return;
    let alive = true;
    void ocr.run(img.source, 'Reading text…').then((l) => {
      if (!alive || !l) return;
      setLines(l);
      setText(linesToText(l));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img]);

  const copy = async (t: string, what = 'Text') => {
    try {
      await navigator.clipboard.writeText(t);
      showToast(`${what} copied`, 'success');
    } catch {
      showToast('Couldn’t copy in this browser.', 'error');
    }
  };

  return (
    <ToolLayout
      main={
        img ? (
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
            <div className="relative max-h-full max-w-full" style={{ aspectRatio: `${img.width} / ${img.height}`, width: `min(100%, ${img.width}px)` }}>
              <img src={img.url} alt={img.name} className="h-full w-full rounded-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.18)]" />
              {lines?.map((l, i) => (
                <button
                  key={i}
                  type="button"
                  title={`Copy “${l.text}”`}
                  aria-label={`Copy line: ${l.text}`}
                  onClick={() => void copy(l.text, 'Line')}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  className={`absolute rounded-[2px] border ${hover === i ? 'border-accent bg-accent/20' : 'border-accent/40 bg-accent/5'}`}
                  style={{ left: `${(l.x / img.width) * 100}%`, top: `${(l.y / img.height) * 100}%`, width: `${(l.w / img.width) * 100}%`, height: `${(l.h / img.height) * 100}%` }}
                />
              ))}
            </div>
            {ocr.status}
          </div>
        ) : (
          <Dropzone onFiles={list.add} title="Drop an image with text" hint="Screenshots, photos of documents, slides. Read on your device." icon={<ScanText size={20} />} />
        )
      }
      panel={
        <>
          {img && (
            <PanelSection title="Image">
              <FileRow img={img} onRemove={list.clear} status={<span className="text-subtle">{img.width}×{img.height}</span>} />
            </PanelSection>
          )}
          <PanelSection title={lines ? `Text (${lines.length} lines)` : 'Text'}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label="Recognized text"
              placeholder={img ? 'Reading…' : 'Text found in the image appears here.'}
              className="min-h-[260px] resize-y rounded-[8px] bg-control p-2.5 text-sm leading-[1.5] text-fg outline-none ring-accent focus:ring-1"
            />
            <p className="text-2xs leading-[15px] text-subtle">Click a box on the image to copy that line. Check names and numbers: recognition can misread.</p>
          </PanelSection>
        </>
      }
      footer={
        <>
          <Button className="h-8" disabled={!text} onClick={() => img && void saveBlob(new Blob([text], { type: 'text/plain' }), `${baseName(img.name)}.txt`)}>
            <Download size={14} /> .txt
          </Button>
          <Button variant="primary" className="h-8" disabled={!text} onClick={() => void copy(text)}>
            <Copy size={14} /> Copy text
          </Button>
        </>
      }
    />
  );
}

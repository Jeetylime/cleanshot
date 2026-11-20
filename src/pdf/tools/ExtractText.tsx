import { useEffect, useState } from 'react';
import { Copy, Download, FileText } from 'lucide-react';
import { Button, Segmented } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { errorMessage } from '../../tools/shared/batch';
import { Dropzone, Notice, PanelSection, ProgressBar, saveBlob, ToolLayout, useFileSink } from '../../tools/shared/ui';
import { baseName, openForRender } from '../engine';
import { PDF_ACCEPT, PdfRow, usePdfList } from '../ui';

interface TextItemLike {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
}

/** Join pdf.js text items into lines, inserting breaks where the baseline moves. */
export function itemsToText(items: TextItemLike[]): string {
  let out = '';
  let lastY: number | null = null;
  for (const it of items) {
    const y = it.transform?.[5] ?? null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 1 && !out.endsWith('\n')) out += '\n';
    out += it.str;
    if (it.hasEOL) out += '\n';
    if (y !== null) lastY = y;
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export default function ExtractText() {
  const list = usePdfList(false, { readOnly: true });
  useFileSink(list.add);
  const file = list.items[0] ?? null;
  const [pages, setPages] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [format, setFormat] = useState<'txt' | 'md'>('txt');

  useEffect(() => {
    setPages([]);
    if (!file) return;
    let cancelled = false;
    void (async () => {
      const { doc, close } = await openForRender(file.bytes);
      try {
        const out: string[] = [];
        for (let n = 1; n <= doc.numPages && !cancelled; n++) {
          const page = await doc.getPage(n);
          const content = await page.getTextContent();
          out.push(itemsToText(content.items as TextItemLike[]));
          page.cleanup();
          setProgress(n / doc.numPages);
        }
        if (!cancelled) setPages(out);
      } catch (err) {
        showToast(`Couldn’t read text: ${errorMessage(err)}`, 'error');
      } finally {
        close();
        setProgress(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const joined = pages.map((t, i) => (format === 'md' ? `## Page ${i + 1}\n\n${t}` : t)).join(format === 'md' ? '\n\n' : '\n\n\f\n\n');
  const empty = pages.length > 0 && pages.every((p) => !p.trim());

  if (!file) {
    return (
      <ToolLayout
        main={<Dropzone accept={PDF_ACCEPT} onFiles={list.add} title="Drop a PDF to extract its text" hint="Works with PDFs that contain real text" icon={<FileText size={20} />} />}
        panel={<PanelSection title="How it works"><p className="text-xs leading-[17px] text-muted">Reads the text layer of each page on your device. Scanned PDFs without a text layer have no text to extract.</p></PanelSection>}
      />
    );
  }

  return (
    <ToolLayout
      main={
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mx-auto flex max-w-[820px] flex-col gap-4">
            {empty && <Notice>No text layer found. This PDF is probably scanned images.</Notice>}
            {pages.map((t, i) => (
              <section key={i} className="rounded-[10px] border border-line bg-panel p-4">
                <h3 className="mb-2 text-2xs font-semibold tracking-wide text-subtle uppercase">Page {i + 1}</h3>
                <pre className="font-sans text-sm leading-[20px] whitespace-pre-wrap text-fg select-text">{t || <span className="text-subtle">No text</span>}</pre>
              </section>
            ))}
          </div>
        </div>
      }
      panel={
        <>
          <PanelSection title="Document">
            <PdfRow file={file} onRemove={list.clear} />
          </PanelSection>
          <PanelSection title="Format">
            <Segmented ariaLabel="Text format" value={format} onChange={setFormat} options={[{ value: 'txt', label: 'Plain text' }, { value: 'md', label: 'Markdown' }]} />
            {pages.length > 0 && <p className="text-xs text-subtle tabular-nums">{joined.length.toLocaleString()} characters · {joined.split(/\s+/).filter(Boolean).length.toLocaleString()} words</p>}
          </PanelSection>
        </>
      }
      footer={
        <>
          {progress !== null && <ProgressBar value={progress} label={<span>Reading pages…</span>} />}
          <Button className="h-8" disabled={!pages.length} onClick={() => void navigator.clipboard.writeText(joined).then(() => showToast('Text copied'))}>
            <Copy size={14} /> Copy
          </Button>
          <Button variant="primary" className="h-8" disabled={!pages.length} onClick={() => void saveBlob(new Blob([joined], { type: 'text/plain' }), `${baseName(file.name)}.${format}`)}>
            <Download size={14} /> Download .{format}
          </Button>
        </>
      }
    />
  );
}

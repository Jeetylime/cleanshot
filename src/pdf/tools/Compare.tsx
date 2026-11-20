import { useEffect, useState } from 'react';
import { Download, GitCompareArrows } from 'lucide-react';
import { Button, ToggleRow } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { errorMessage } from '../../tools/shared/batch';
import { Dropzone, PanelSection, ProgressBar, saveBlob, ToolLayout, useFileSink } from '../../tools/shared/ui';
import { baseName, openForRender } from '../engine';
import { PDF_ACCEPT, PdfRow, usePdfList } from '../ui';
import { diffText, type DiffOp } from '../diff';
import { itemsToText } from './ExtractText';

async function textOf(bytes: ArrayBuffer, onPage: () => void): Promise<string> {
  const { doc, close } = await openForRender(bytes);
  try {
    const out: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      out.push(`— Page ${i} —\n` + itemsToText((await page.getTextContent()).items as Parameters<typeof itemsToText>[0]).trim() + '\n');
      page.cleanup();
      onPage();
    }
    return out.join('\n');
  } finally {
    close();
  }
}

const norm = (s: string, ignoreSpace: boolean) => (ignoreSpace ? s.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n') : s);

export default function Compare() {
  const list = usePdfList(true, { readOnly: true });
  useFileSink(list.add);
  const [a, b] = list.items;
  const [ops, setOps] = useState<DiffOp[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [ignoreSpace, setIgnoreSpace] = useState(true);
  const [onlyChanges, setOnlyChanges] = useState(false);

  useEffect(() => {
    setOps(null);
    if (!a || !b) return;
    let cancelled = false;
    const total = a.pageCount + b.pageCount;
    let done = 0;
    setProgress(0);
    void (async () => {
      try {
        const tick = () => setProgress(++done / total);
        const [ta, tb] = [await textOf(a.bytes, tick), await textOf(b.bytes, tick)];
        await new Promise((r) => setTimeout(r, 0));
        if (!cancelled) setOps(diffText(norm(ta, ignoreSpace), norm(tb, ignoreSpace)));
      } catch (err) {
        if (!cancelled) showToast(`Couldn’t compare: ${errorMessage(err)}`, 'error');
      } finally {
        if (!cancelled) setProgress(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [a, b, ignoreSpace]);

  const count = (op: 'ins' | 'del') => (ops ?? []).filter((o) => o.op === op).reduce((n, o) => n + (o.text.match(/\S+/g)?.length ?? 0), 0);
  const added = count('ins');
  const removed = count('del');

  const report = () => {
    if (!ops || !a || !b) return;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const body = ops.map((o) => (o.op === 'eq' ? esc(o.text) : o.op === 'ins' ? `<ins>${esc(o.text)}</ins>` : `<del>${esc(o.text)}</del>`)).join('');
    const html = `<!doctype html><meta charset="utf-8"><title>Comparison</title><style>body{font:14px/1.6 system-ui,sans-serif;max-width:860px;margin:40px auto;padding:0 16px;white-space:pre-wrap}ins{background:#d6f5dc;color:#0b5d1e;text-decoration:none}del{background:#ffd9d9;color:#8a1010}</style><h1 style="white-space:normal">${esc(a.name)} → ${esc(b.name)}</h1><p style="white-space:normal">${added} words added, ${removed} words removed.</p>${body}`;
    void saveBlob(new Blob([html], { type: 'text/html' }), `${baseName(a.name)} vs ${baseName(b.name)}.html`);
  };

  // With "only changes", keep a little context around each change.
  const shown = (ops ?? []).map((o, i) => {
    if (!onlyChanges || o.op !== 'eq') return o;
    const prevChange = i > 0;
    const nextChange = i < (ops?.length ?? 0) - 1;
    const lines = o.text.split('\n');
    if (lines.length <= 4) return o;
    const head = nextChange ? lines.slice(-2).join('\n') : '';
    const tail = prevChange ? lines.slice(0, 2).join('\n') : '';
    return { op: 'eq' as const, text: `${tail}${tail || head ? '\n  ⋯\n' : ''}${head}` };
  });

  return (
    <ToolLayout
      main={
        !a || !b ? (
          <Dropzone accept={PDF_ACCEPT} multiple onFiles={list.add} title={a ? 'Drop the second PDF' : 'Drop two PDFs to compare'} hint="See which words were added or removed between two versions" icon={<GitCompareArrows size={20} />} />
        ) : (
          <div className="scroll-thin flex min-h-0 flex-1 justify-center overflow-y-auto p-6">
            {progress !== null && !ops ? (
              <div className="w-full max-w-[360px] self-center">
                <ProgressBar value={progress} label="Reading both PDFs…" />
              </div>
            ) : (
              <div className="w-full max-w-[820px] rounded-[10px] border border-line bg-panel p-5 text-sm leading-[1.65] whitespace-pre-wrap text-fg" aria-label="Comparison">
                {shown.map((o, i) =>
                  o.op === 'eq' ? (
                    <span key={i}>{o.text}</span>
                  ) : o.op === 'ins' ? (
                    <ins key={i} className="rounded-[2px] bg-[#30d158]/20 text-fg no-underline">
                      {o.text}
                    </ins>
                  ) : (
                    <del key={i} className="rounded-[2px] bg-[#ff453a]/20 text-fg">
                      {o.text}
                    </del>
                  ),
                )}
              </div>
            )}
          </div>
        )
      }
      panel={
        <>
          <PanelSection title="Documents">
            {list.items.slice(0, 2).map((f, i) => (
              <div key={f.id} className="flex flex-col gap-1">
                <span className="text-2xs text-subtle">{i ? 'New version' : 'Original'}</span>
                <PdfRow file={f} onRemove={() => list.remove(f.id)} />
              </div>
            ))}
            {list.items.length > 2 && <p className="text-xs text-subtle">Only the first two PDFs are compared.</p>}
          </PanelSection>
          <PanelSection title="Options">
            <ToggleRow label="Ignore spacing differences" checked={ignoreSpace} onChange={setIgnoreSpace} />
            <ToggleRow label="Show only changes" checked={onlyChanges} onChange={setOnlyChanges} />
          </PanelSection>
          {ops && (
            <PanelSection title="Summary">
              <p className="text-sm text-fg tabular-nums">
                <span className="font-semibold">+{added}</span> words added, <span className="text-danger">−{removed}</span> removed
              </p>
              <p className="text-2xs leading-[15px] text-subtle">Compares the text layer. Scanned pages have no text; changes in images or layout aren’t shown.</p>
            </PanelSection>
          )}
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={!ops} onClick={report}>
          <Download size={14} /> Download report
        </Button>
      }
    />
  );
}

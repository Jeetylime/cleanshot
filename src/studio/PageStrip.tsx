import { useEffect, useRef, useState } from 'react';
import { CopyPlus, Plus, Trash2 } from 'lucide-react';
import { Tooltip } from '../components/ui/Tooltip';
import { useStudio, shallowEqual } from './store';
import * as A from './actions';
import { allPages, pageDoc } from './pages';
import { renderToCanvas } from './render';
import type { PageData, StudioDoc } from './types';

// Thumbnails are cached per page content (pages are immutable, so identity is enough).
const thumbs = new WeakMap<object, string>();

function Thumb({ doc, page, index }: { doc: StudioDoc; page: PageData; index: number }) {
  const key = page.elements;
  const [url, setUrl] = useState<string | null>(thumbs.get(key) ?? null);
  useEffect(() => {
    const cached = thumbs.get(key);
    if (cached) {
      setUrl(cached);
      return;
    }
    const t = window.setTimeout(() => {
      try {
        const k = Math.min(1, 120 / doc.width, 72 / doc.height) * 2;
        const u = renderToCanvas(pageDoc(doc, index), k).toDataURL('image/png');
        thumbs.set(key, u);
        setUrl(u);
      } catch {
        /* thumbnail is cosmetic */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [key, page.background, doc, index]);
  return url ? <img src={url} alt="" draggable={false} className="max-h-full max-w-full rounded-[2px] shadow-soft" /> : <span className="h-full w-full rounded bg-control" />;
}

export function PageStrip() {
  const { doc, active } = useStudio((s) => ({ doc: s.doc, active: s.doc?.pageIndex ?? 0 }), shallowEqual);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pages = doc ? allPages(doc) : [];

  useEffect(() => {
    scroller.current?.querySelector<HTMLElement>(`[data-page="${active}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active, pages.length]);

  if (!doc) return null;
  const ratio = doc.width / doc.height;
  const h = 56;
  const w = Math.max(32, Math.min(110, h * ratio));

  return (
    <div className="flex h-[84px] shrink-0 items-center gap-2 border-t border-line bg-panel px-3" aria-label="Pages" data-testid="page-strip">
      <div ref={scroller} className="scroll-thin flex min-w-0 items-center gap-2 overflow-x-auto py-1.5" role="listbox" aria-label="Pages" aria-orientation="horizontal">
        {pages.map((p, i) => (
          <div
            key={p.id}
            data-page={i}
            role="option"
            aria-selected={i === active}
            draggable
            onDragStart={(e) => {
              setDrag(i);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(i));
            }}
            onDragOver={(e) => {
              if (drag === null) return;
              e.preventDefault();
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setOver(e.clientX < r.left + r.width / 2 ? i : i + 1);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (drag !== null && over !== null) A.movePage(drag, over > drag ? over - 1 : over);
              setDrag(null);
              setOver(null);
            }}
            onDragEnd={() => {
              setDrag(null);
              setOver(null);
            }}
            className={`group relative flex shrink-0 flex-col items-center gap-1 ${drag === i ? 'opacity-40' : ''}`}
          >
            {over === i && drag !== null && <span className="absolute -left-[5px] top-1 h-[56px] w-0.5 rounded bg-accent" />}
            {over === i + 1 && i === pages.length - 1 && drag !== null && <span className="absolute -right-[5px] top-1 h-[56px] w-0.5 rounded bg-accent" />}
            <button
              type="button"
              onClick={() => A.goToPage(i)}
              aria-label={`Page ${i + 1}`}
              className={`cs-checker flex items-center justify-center overflow-hidden rounded-[6px] p-0.5 transition-shadow ${
                i === active ? 'ring-2 ring-accent' : 'ring-1 ring-line hover:ring-line-strong'
              }`}
              style={{ width: w, height: h }}
            >
              <Thumb doc={doc} page={p} index={i} />
            </button>
            <span className={`text-2xs tabular-nums ${i === active ? 'font-semibold text-fg' : 'text-subtle'}`}>{i + 1}</span>
            {i === active && (
              <div className="absolute -top-1 -right-1 hidden gap-0.5 group-hover:flex">
                <Tooltip label="Duplicate page">
                  <button type="button" aria-label="Duplicate page" onClick={() => A.addPage({ duplicate: true })} className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-elevated text-muted shadow-pop hover:text-fg">
                    <CopyPlus size={11} />
                  </button>
                </Tooltip>
                {pages.length > 1 && (
                  <Tooltip label="Delete page">
                    <button type="button" aria-label="Delete page" onClick={() => A.deletePage(i)} className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-elevated text-muted shadow-pop hover:text-danger">
                      <Trash2 size={11} />
                    </button>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <Tooltip label="Add a page">
        <button
          type="button"
          onClick={() => A.addPage()}
          aria-label="Add a page"
          data-testid="add-page"
          className="flex shrink-0 items-center justify-center gap-1 self-start rounded-[6px] border border-dashed border-line-strong text-xs text-muted transition-colors hover:border-accent hover:text-fg"
          style={{ height: h, width: Math.max(w, 44), marginTop: 6 }}
        >
          <Plus size={16} />
        </button>
      </Tooltip>
      <span className="ml-auto shrink-0 text-2xs text-subtle tabular-nums max-sm:hidden">
        Page {active + 1} of {pages.length}
      </span>
    </div>
  );
}

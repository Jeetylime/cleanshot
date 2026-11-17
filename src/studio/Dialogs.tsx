import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Button, Toggle } from '../components/ui/controls';
import { showToast } from '../store/actions';
import { studio, useStudio } from './store';
import * as A from './actions';
import { SIZE_PRESETS } from './templates';

function Modal({ title, onClose, children, width = 440 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.querySelector<HTMLElement>('input, button')?.focus(), []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 animate-fade-in" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') onClose();
        }}
        className="scroll-thin flex max-h-[88dvh] w-full flex-col gap-3 overflow-y-auto rounded-[16px] border border-line-strong bg-elevated p-4 shadow-pop animate-pop-in"
        style={{ maxWidth: width }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-muted hover:bg-hover hover:text-fg">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StudioDialogs() {
  const dialog = useStudio((s) => s.dialog);
  const close = () => studio.set({ dialog: null });
  if (dialog === 'resize') return <ResizeDialog onClose={close} />;
  if (dialog === 'find') return <FindDialog onClose={close} />;
  return null;
}

function ResizeDialog({ onClose }: { onClose: () => void }) {
  const doc = useStudio((s) => s.doc);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  if (!doc) return null;
  const options = SIZE_PRESETS.filter((p) => !(p.width === doc.width && p.height === doc.height));
  const toggle = (id: string) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const chosen = options.filter((o) => picked.has(o.id));
  return (
    <Modal title="Smart resize" onClose={onClose}>
      <p className="text-xs leading-[17px] text-muted">
        Make this design in other sizes. Backgrounds stretch to fill, and everything else keeps its place and scales to fit. Check each result; long text may need a nudge.
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((o) => (
          <label key={o.id} className={`flex cursor-pointer items-center gap-2 rounded-[9px] border px-2.5 py-2 text-xs ${picked.has(o.id) ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong'}`}>
            <input type="checkbox" checked={picked.has(o.id)} onChange={() => toggle(o.id)} className="accent-[var(--accent)]" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-fg">{o.label}</span>
              <span className="text-2xs text-subtle tabular-nums">
                {o.width} × {o.height}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-col gap-1.5 pt-1">
        <Button
          variant="primary"
          className="h-8"
          disabled={!chosen.length || busy}
          onClick={async () => {
            setBusy(true);
            const n = await A.smartResizeCopies(chosen);
            setBusy(false);
            if (n) {
              showToast(`Made ${n} ${n === 1 ? 'copy' : 'copies'}. Find them in Your designs.`, 'success');
              onClose();
            }
          }}
        >
          Create {chosen.length || ''} {chosen.length === 1 ? 'copy' : 'copies'}
        </Button>
        <Button
          disabled={chosen.length !== 1 || busy}
          onClick={() => {
            A.smartResizeInPlace(chosen[0].width, chosen[0].height);
            onClose();
          }}
          title="Pick exactly one size to resize this design instead"
        >
          Resize this design instead
        </Button>
      </div>
    </Modal>
  );
}

function FindDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [rep, setRep] = useState('');
  const [cs, setCs] = useState(false);
  const tick = useStudio((s) => s.doc);
  // findText reads the live store; `tick` re-runs the search whenever the document changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hits = useMemo(() => A.findText(q, cs), [q, cs, tick]);
  const total = hits.reduce((s, h) => s + h.count, 0);
  return (
    <Modal title="Find and replace" onClose={onClose} width={460}>
      <label className="flex h-8 items-center gap-2 rounded-[8px] bg-control px-2.5 ring-accent focus-within:ring-1">
        <Search size={13} className="text-subtle" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find text" aria-label="Find" className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none" />
        {q && <span className="text-2xs text-subtle tabular-nums">{total} found</span>}
      </label>
      <input value={rep} onChange={(e) => setRep(e.target.value)} placeholder="Replace with" aria-label="Replace with" className="h-8 rounded-[8px] bg-control px-2.5 text-xs text-fg outline-none focus:ring-1 focus:ring-accent" />
      <label className="flex items-center justify-between text-xs text-muted">
        Match case <Toggle checked={cs} onChange={setCs} label="Match case" />
      </label>
      {hits.length > 0 && (
        <ul className="flex max-h-[200px] flex-col gap-0.5 overflow-y-auto">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => A.revealElement(h.page, h.id)} className="flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left text-xs hover:bg-hover">
                <span className="shrink-0 text-2xs text-subtle">Page {h.page + 1}</span>
                <span className="min-w-0 flex-1 truncate text-fg">{h.preview}</span>
                <span className="text-2xs text-subtle">×{h.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="primary"
        className="h-8"
        disabled={!total}
        onClick={() => {
          const n = A.replaceText(q, rep, cs);
          showToast(`Replaced ${n} ${n === 1 ? 'match' : 'matches'}.`, 'success');
        }}
      >
        Replace all
      </Button>
    </Modal>
  );
}

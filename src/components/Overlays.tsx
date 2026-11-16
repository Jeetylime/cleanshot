import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, Info, ImageDown, Loader2, X } from 'lucide-react';
import { useEditor } from '../store/store';
import * as actions from '../store/actions';
import { Kbd } from './ui/Kbd';
import { modKey } from '../lib/utils';

export function Toasts() {
  const toast = useEditor((s) => s.toast);
  if (!toast) return null;
  const Icon = toast.tone === 'error' ? AlertCircle : toast.tone === 'info' ? Info : CheckCircle2;
  const color = toast.tone === 'error' ? 'text-danger' : toast.tone === 'info' ? 'text-accent' : 'text-success';
  return (
    <div
      key={toast.id}
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-[90] flex max-w-[calc(100vw-32px)] items-center gap-2 rounded-full border border-line-strong bg-elevated py-2 pr-4 pl-3 text-sm text-fg shadow-pop"
      style={{ animation: 'cs-toast-in 200ms cubic-bezier(.2,.8,.2,1) both', transform: 'translateX(-50%)' }}
    >
      <Icon size={15} className={`shrink-0 ${color}`} strokeWidth={2.25} />
      <span className="truncate">{toast.message}</span>
    </div>
  );
}

export function BusyIndicator() {
  const busy = useEditor((s) => s.busy);
  if (!busy) return null;
  return (
    <div className="fixed top-[58px] left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-line-strong bg-elevated px-3 py-1.5 text-xs text-muted shadow-pop animate-fade-in">
      <Loader2 size={13} className="animate-spin-slow text-accent" />
      {busy}
    </div>
  );
}

export function DropOverlay({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[95] flex items-center justify-center bg-window/70 backdrop-blur-[2px] animate-fade-in">
      <div className="absolute inset-3 rounded-[18px] border-2 border-dashed border-accent/80" />
      <div className="flex flex-col items-center gap-3 rounded-[16px] border border-line-strong bg-elevated px-8 py-6 shadow-pop animate-pop-in">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
          <ImageDown size={22} />
        </div>
        <div className="text-center">
          <p className="text-[13px] font-semibold text-fg">Drop to open</p>
          <p className="mt-0.5 text-xs text-muted">PNG, JPG or WebP</p>
        </div>
      </div>
    </div>
  );
}

const SHORTCUTS: { title: string; items: [string, string[]][] }[] = [
  {
    title: 'Tools',
    items: [
      ['Select', ['V']],
      ['Arrow', ['A']],
      ['Rectangle', ['R']],
      ['Ellipse', ['O']],
      ['Draw', ['D']],
      ['Text', ['T']],
      ['Numbered step', ['N']],
      ['Highlighter', ['H']],
      ['Blur', ['B']],
      ['Pixelate', ['X']],
      ['Redact', ['M']],
      ['Crop', ['C']],
      ['Background', ['G']],
      ['Padding & shadow', ['P']],
    ],
  },
  {
    title: 'Editing',
    items: [
      ['Undo', [modKey, 'Z']],
      ['Redo', [modKey, '⇧', 'Z']],
      ['Delete selection', ['⌫']],
      ['Duplicate', [modKey, 'D']],
      ['Copy / paste objects', [modKey, 'C / V']],
      ['Select all', [modKey, 'A']],
      ['Nudge', ['←↑→↓']],
      ['Nudge ×10', ['⇧', '←↑→↓']],
      ['Constrain / snap', ['⇧ drag']],
      ['Draw from center', ['⌥ drag']],
      ['Edit text', ['↵']],
      ['Deselect / cancel', ['esc']],
    ],
  },
  {
    title: 'View & file',
    items: [
      ['Pan', ['Space drag']],
      ['Zoom', [modKey, 'scroll']],
      ['Zoom in / out', [modKey, '+ / −']],
      ['Zoom to fit', [modKey, '0']],
      ['Actual size', [modKey, '1']],
      ['Paste screenshot', [modKey, 'V']],
      ['Open image', [modKey, 'O']],
      ['Copy image', [modKey, 'C']],
      ['Export…', [modKey, 'E']],
      ['Quick save', [modKey, 'S']],
      ['Apply crop', ['↵']],
      ['Shortcuts', ['?']],
    ],
  },
];

export function ShortcutsDialog() {
  const open = useEditor((s) => s.overlay === 'shortcuts');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        e.stopPropagation();
        actions.openOverlay(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 animate-fade-in"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) actions.openOverlay(null);
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="scroll-thin max-h-[86vh] w-full max-w-[760px] overflow-y-auto rounded-[14px] border border-line-strong bg-elevated shadow-pop animate-pop-in"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-elevated px-5 py-3.5">
          <h2 className="text-[14px] font-semibold">Keyboard shortcuts</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => actions.openOverlay(null)}
            className="flex h-6 w-6 items-center justify-center rounded-[6px] text-muted hover:bg-hover hover:text-fg"
          >
            <X size={14} />
          </button>
        </div>
        <div className="grid gap-x-8 gap-y-5 px-5 py-4 sm:grid-cols-3">
          {SHORTCUTS.map((g) => (
            <div key={g.title}>
              <h3 className="mb-2 text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">{g.title}</h3>
              <ul className="flex flex-col gap-1.5">
                {g.items.map(([label, keys]) => (
                  <li key={label} className="flex items-center justify-between gap-3 text-xs text-muted">
                    <span className="truncate">{label}</span>
                    <span className="flex shrink-0 gap-0.5">
                      {keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

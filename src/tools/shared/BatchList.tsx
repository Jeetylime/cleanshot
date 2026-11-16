import type { ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { pickFiles, Spinner, type LoadedImage } from './ui';

/** Scrollable list of batch items with add/clear controls. */
export function BatchList({
  items,
  loading,
  onAdd,
  onClear,
  children,
  className = '',
}: {
  items: LoadedImage[];
  loading: number;
  onAdd: (files: File[]) => void;
  onClear: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 px-4">
        <span className="flex items-center gap-2 text-xs text-muted">
          <span className="font-semibold text-fg tabular-nums">{items.length}</span> {items.length === 1 ? 'image' : 'images'}
          {loading > 0 && (
            <span className="flex items-center gap-1.5 text-subtle">
              <Spinner size={12} /> loading {loading}…
            </span>
          )}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => pickFiles(true, onAdd)}
            className="inline-flex h-7 items-center gap-1 rounded-[7px] px-2 text-xs font-medium text-muted hover:bg-hover hover:text-fg"
          >
            <Plus size={13} /> Add images
          </button>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-7 items-center gap-1 rounded-[7px] px-2 text-xs font-medium text-muted hover:bg-hover hover:text-danger"
          >
            <X size={13} /> Clear
          </button>
        </span>
      </div>
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-4 pb-4">{children}</div>
    </div>
  );
}

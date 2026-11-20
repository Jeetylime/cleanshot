import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, FileText, Trash2 } from 'lucide-react';
import { showToast } from '../store/actions';
import { formatBytes } from '../lib/utils';
import { Tooltip } from '../components/ui/Tooltip';
import { errorMessage } from '../tools/shared/batch';
import { loadPdfFile, renderThumbnails, type LoadPdfOptions, type PdfFile } from './engine';

export const PDF_ACCEPT = 'application/pdf,.pdf';

/** A list of loaded PDFs (validated, with page counts). */
export function usePdfList(multiple: boolean, opts: LoadPdfOptions = {}) {
  const readOnly = !!opts.readOnly;
  const [items, setItems] = useState<PdfFile[]>([]);
  const [loading, setLoading] = useState(0);
  const add = useCallback(
    async (files: File[]) => {
      const list = (multiple ? files : files.slice(0, 1)).filter(Boolean);
      setLoading((n) => n + list.length);
      const loaded: PdfFile[] = [];
      for (const f of list) {
        try {
          loaded.push(await loadPdfFile(f, { readOnly }));
        } catch (err) {
          showToast(errorMessage(err), 'error');
        } finally {
          setLoading((n) => n - 1);
        }
      }
      if (loaded.length) setItems((prev) => (multiple ? [...prev, ...loaded] : loaded.slice(0, 1)));
    },
    [multiple, readOnly],
  );
  const remove = (id: string) => setItems((p) => p.filter((x) => x.id !== id));
  const move = (id: string, dir: -1 | 1) =>
    setItems((p) => {
      const i = p.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const next = p.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  return { items, setItems, loading, add, remove, move, clear: () => setItems([]) };
}

/** Page thumbnails for a PDF, rendered progressively. URLs are revoked on change. */
export function usePageThumbs(file: PdfFile | null, width = 180): Record<number, string> {
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const urls = useRef<string[]>([]);
  useEffect(() => {
    setThumbs({});
    if (!file) return;
    const signal = { cancelled: false };
    void renderThumbnails(file.bytes, width, (page, url) => {
      urls.current.push(url);
      setThumbs((t) => ({ ...t, [page]: url }));
    }, signal).catch((err) => showToast(`Couldn’t render pages: ${errorMessage(err)}`, 'error'));
    return () => {
      signal.cancelled = true;
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current = [];
    };
  }, [file, width]);
  return thumbs;
}

/** A PDF file row with optional reorder controls. */
export function PdfRow({
  file,
  index,
  count,
  onMove,
  onRemove,
  thumb,
}: {
  file: PdfFile;
  index?: number;
  count?: number;
  onMove?: (dir: -1 | 1) => void;
  onRemove?: () => void;
  thumb?: string;
}) {
  return (
    <div className="group flex items-center gap-3 rounded-[10px] border border-line bg-panel px-2 py-1.5 hover:border-line-strong">
      {index !== undefined && <span className="w-5 shrink-0 text-center text-xs text-subtle tabular-nums">{index + 1}</span>}
      <span className="flex h-11 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-line bg-white">
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover object-top" /> : <FileText size={16} className="text-[#8e8e93]" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium text-fg">{file.name}</span>
        <span className="text-2xs text-subtle tabular-nums">
          {file.pageCount} {file.pageCount === 1 ? 'page' : 'pages'} · {formatBytes(file.size)}
        </span>
      </span>
      {onMove && (
        <span className="flex shrink-0 gap-0.5">
          <Tooltip label="Move up">
            <button type="button" aria-label={`Move ${file.name} up`} disabled={index === 0} onClick={() => onMove(-1)} className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted hover:bg-hover hover:text-fg disabled:opacity-30">
              <ArrowUp size={13} />
            </button>
          </Tooltip>
          <Tooltip label="Move down">
            <button type="button" aria-label={`Move ${file.name} down`} disabled={index === (count ?? 1) - 1} onClick={() => onMove(1)} className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted hover:bg-hover hover:text-fg disabled:opacity-30">
              <ArrowDown size={13} />
            </button>
          </Tooltip>
        </span>
      )}
      {onRemove && (
        <Tooltip label="Remove">
          <button type="button" aria-label={`Remove ${file.name}`} onClick={onRemove} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-subtle hover:bg-hover hover:text-danger">
            <Trash2 size={13} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

/** One-page thumbnail tile used in page grids. */
export function PageTile({
  url,
  page,
  selected,
  dimmed,
  rotation = 0,
  onClick,
  children,
}: {
  url?: string;
  page: number;
  selected?: boolean;
  dimmed?: boolean;
  rotation?: number;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="group relative flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        aria-label={`Page ${page}`}
        className={`relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-[8px] border bg-elevated p-1.5 transition-[border-color,box-shadow,opacity] ${
          selected ? 'border-accent ring-2 ring-accent/50' : 'border-line hover:border-line-strong'
        } ${dimmed ? 'opacity-40' : ''}`}
      >
        {url ? (
          <img
            src={url}
            alt=""
            draggable={false}
            className="max-h-full max-w-full bg-white shadow-soft transition-transform duration-200"
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        ) : (
          <span className="h-full w-full animate-pulse rounded-[4px] bg-control" />
        )}
        {children}
      </button>
      <span className="text-2xs text-subtle tabular-nums">{page}</span>
    </div>
  );
}

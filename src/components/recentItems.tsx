import { useEffect, useState, type ReactNode } from 'react';
import { useEditor } from '../store/store';
import * as actions from '../store/actions';
import { goCanvas, goEditor, goPdf, goTools, type PdfToolKey } from '../app/route';
import { getRecentTools } from '../app/recentTools';
import { TOOLS } from '../tools/registry';
import { PDF_TOOLS } from '../pdf/registry';
import { timeAgo } from '../lib/utils';
import type { ProjectSummary } from '../studio/persistence';

export type RecentKind = 'edit' | 'design' | 'tool' | 'pdf';

export interface RecentItem {
  kind: RecentKind;
  /** e.g. "Latest edit" */
  label: string;
  title: string;
  meta: string;
  thumb: ReactNode;
  open: () => void;
}

export const RECENT_LABELS: Record<RecentKind, string> = { edit: 'Latest edit', design: 'Latest design', tool: 'Last image tool', pdf: 'Last PDF tool' };

function useLatestDesign(): ProjectSummary | null | undefined {
  const [design, setDesign] = useState<ProjectSummary | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    import('../studio/persistence')
      .then((db) => db.listProjects())
      .then((list) => !cancelled && setDesign(list[0] ?? null))
      .catch(() => !cancelled && setDesign(null));
    return () => {
      cancelled = true;
    };
  }, []);
  return design;
}

function useBlobUrl(blob: Blob | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

const img = (src: string | null) => (src ? <img src={src} alt="" className="max-h-full max-w-full object-contain" draggable={false} /> : null);

/**
 * The latest item from each section (edit, design, image tool, PDF tool), shared
 * by the home page, the Studiolo menu and the command palette. `ready` is false
 * until the saved designs have been read, so callers don't reflow.
 */
export function useRecentItems(): { ready: boolean; items: Partial<Record<RecentKind, RecentItem>>; editCount: number } {
  const recents = useEditor((s) => s.recents);
  const design = useLatestDesign();
  const designThumb = useBlobUrl(design?.thumb);
  const [recentTools] = useState(getRecentTools);
  const tool = recentTools.tools && TOOLS.find((t) => t.key === recentTools.tools!.key);
  const pdfTool = recentTools.pdf && PDF_TOOLS.find((t) => t.key === recentTools.pdf!.key);
  const edit = recents[0];
  const items: Partial<Record<RecentKind, RecentItem>> = {};
  if (edit)
    items.edit = {
      kind: 'edit',
      label: RECENT_LABELS.edit,
      title: edit.name,
      meta: timeAgo(edit.updatedAt),
      thumb: img(edit.thumbUrl),
      open: () => {
        goEditor();
        void actions.openSession(edit.id);
      },
    };
  if (design)
    items.design = {
      kind: 'design',
      label: RECENT_LABELS.design,
      title: design.name || 'Untitled design',
      meta: `${design.width} × ${design.height} · ${timeAgo(design.updatedAt)}`,
      thumb: img(designThumb),
      open: () => {
        goCanvas();
        void import('../studio/actions').then((A) => A.openProject(design.id));
      },
    };
  if (tool) items.tool = { kind: 'tool', label: RECENT_LABELS.tool, title: tool.name, meta: timeAgo(recentTools.tools!.at), thumb: <tool.icon size={18} />, open: () => goTools(tool.key) };
  if (pdfTool) items.pdf = { kind: 'pdf', label: RECENT_LABELS.pdf, title: pdfTool.name, meta: timeAgo(recentTools.pdf!.at), thumb: <pdfTool.icon size={18} />, open: () => goPdf(pdfTool.key as PdfToolKey) };
  return { ready: design !== undefined, items, editCount: recents.length };
}

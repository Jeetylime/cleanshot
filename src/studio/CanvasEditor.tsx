import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CloudOff,
  Download,
  FileDown,
  FileUp,
  FolderOpen,
  Keyboard,
  Loader2,
  Maximize,
  Minimize,
  Minus,
  PencilLine,
  Grid3x3,
  Ratio,
  Search,
  BookmarkPlus,
  LayoutTemplate,
  Type,
  Shapes,
  ImagePlus,
  Plus,
  Redo2,
  Scan,
  Undo2,
  X,
} from 'lucide-react';
import { HomeLogo, SettingsMenu } from '../components/TopBar';
import { IconButton } from '../components/ui/IconButton';
import { Popover, MenuItem, MenuSeparator } from '../components/ui/Popover';
import { Tooltip } from '../components/ui/Tooltip';
import { modKey } from '../lib/utils';
import { pickFiles, useFileSink } from '../tools/shared/ui';
import { setPasteFallback } from '../app/route';
import { studio, useStudio, shallowEqual, undo, redo } from './store';
import * as A from './actions';
import { Stage } from './Stage';
import { PageStrip } from './PageStrip';
import { StudioDialogs } from './Dialogs';
import { isStoryShape, setViewOptions, useViewOptions } from './viewOptions';
import { NumberInput, Toggle } from '../components/ui/controls';
import { Rail, LeftDrawer } from './LeftPanel';
import { Properties } from './Properties';
import { ExportDialog } from './ExportDialog';
import { STUDIO_SHORTCUTS, useStudioShortcuts } from './shortcuts';

export function CanvasEditor() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [shortcuts, setShortcuts] = useState(false);
  const openShortcuts = useCallback(() => setShortcuts(true), []);
  useStudioShortcuts(openShortcuts);
  const { fullscreen, warning, hasSelection } = useStudio((s) => ({ fullscreen: s.fullscreen, warning: s.storageWarning, hasSelection: s.selection.length > 0 }), shallowEqual);

  // Files pasted or dropped anywhere go onto the canvas; plain paste pastes copied elements.
  useFileSink((files) => void A.addImageFiles(files));
  useEffect(() => {
    setPasteFallback(() => A.pasteClipboard());
    return () => setPasteFallback(null);
  }, []);

  // Save when leaving the page or hiding the tab
  useEffect(() => {
    const flush = () => void A.saveNow();
    const vis = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', vis);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  // Fullscreen: hide the chrome and ask the browser for real fullscreen when available.
  useEffect(() => {
    const el = rootRef.current;
    if (fullscreen && el && !document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
    if (!fullscreen && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }, [fullscreen]);
  useEffect(() => {
    const on = () => {
      if (!document.fullscreenElement && studio.get().fullscreen) studio.set({ fullscreen: false });
    };
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col bg-window">
      {!fullscreen && <EditorTopBar onShortcuts={openShortcuts} />}
      {warning && !fullscreen && (
        <div role="alert" className="flex items-center gap-2 border-b border-line bg-panel px-3 py-1.5 text-xs text-fg">
          <AlertTriangle size={14} className="shrink-0 text-[#ff9f0a]" />
          <span className="min-w-0 flex-1">{warning}</span>
          <button type="button" onClick={() => void A.downloadProjectFile()} className="shrink-0 font-medium text-accent hover:underline">
            Download project file
          </button>
          <button type="button" aria-label="Dismiss" onClick={() => studio.set({ storageWarning: null })} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-muted hover:bg-hover">
            <X size={13} />
          </button>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 max-md:flex-col">
        {!fullscreen && <Rail />}
        {!fullscreen && <LeftDrawer />}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="relative flex min-h-0 min-w-0 flex-1">
              <Stage />
              <EmptyCanvasHint />
              <ZoomBar />
            </div>
            {!fullscreen && <PageStrip />}
          </div>
          {!fullscreen && <div className={`contents ${hasSelection ? '' : 'max-lg:hidden'}`}><Properties /></div>}
        </div>
      </div>
      <ExportDialog />
      <StudioDialogs />
      {shortcuts && <ShortcutsDialog onClose={() => setShortcuts(false)} />}
    </div>
  );
}

function EditorTopBar({ onShortcuts }: { onShortcuts: () => void }) {
  const { canUndo, canRedo } = useStudio((s) => ({ canUndo: s.past.length > 0, canRedo: s.future.length > 0 }), shallowEqual);
  return (
    <header className="relative z-20 flex h-[46px] shrink-0 items-center justify-between gap-2 border-b border-line bg-panel px-2.5">
      <div className="flex min-w-0 items-center gap-1">
        <HomeLogo hideWordmarkOnMobile />
        <ChevronRight size={14} className="shrink-0 text-subtle max-sm:hidden" />
        <button type="button" onClick={A.closeProject} className="shrink-0 rounded-[6px] px-1.5 py-1 text-sm text-muted transition-colors hover:bg-hover hover:text-fg max-sm:hidden" title="Your designs">
          Canvas
        </button>
        <ChevronRight size={14} className="shrink-0 text-subtle max-sm:hidden" />
        <DesignNameMenu onShortcuts={onShortcuts} />
        <SaveState />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <IconButton label="Undo" shortcut={[modKey, 'Z']} onClick={undo} disabled={!canUndo}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label="Redo" shortcut={[modKey, '⇧', 'Z']} onClick={redo} disabled={!canRedo}>
          <Redo2 size={16} />
        </IconButton>
        <span className="mx-1 h-4 w-px bg-line" />
        <button
          type="button"
          onClick={() => studio.set({ exportOpen: true })}
          className="inline-flex h-7 items-center gap-1.5 rounded-[7px] bg-accent-fill pr-2.5 pl-2 text-xs font-semibold text-white shadow-soft transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.97]"
          data-testid="studio-download"
        >
          <Download size={14} strokeWidth={2.25} />
          <span className="max-sm:hidden">Download</span>
        </button>
        <SettingsMenu editorItems={false} />
      </div>
    </header>
  );
}

function SaveState() {
  const state = useStudio((s) => s.saveState);
  if (state === 'saving')
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
        <Loader2 size={12} className="animate-spin" /> <span className="max-lg:hidden">Saving…</span>
      </span>
    );
  if (state === 'error')
    return (
      <Tooltip label="Not saved in this browser. Download a project file to keep a copy.">
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-danger">
          <CloudOff size={12} /> <span className="max-lg:hidden">Not saved</span>
        </span>
      </Tooltip>
    );
  if (state === 'saved')
    return (
      <Tooltip label="Saved in this browser">
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted" data-testid="save-state">
          <Check size={12} strokeWidth={2.5} className="text-success" /> <span className="max-lg:hidden">Saved</span>
        </span>
      </Tooltip>
    );
  return null;
}

/** The design's name doubles as its file menu, like a document title in a desktop app. */
function DesignNameMenu({ onShortcuts }: { onShortcuts: () => void }) {
  const name = useStudio((s) => s.doc?.name ?? '');
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  if (renaming)
    return (
      <input
        autoFocus
        defaultValue={name}
        aria-label="Design name"
        onFocus={(e) => e.target.select()}
        onBlur={(e) => {
          A.renameProject(e.target.value);
          setRenaming(false);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setRenaming(false);
        }}
        className="h-7 w-[min(240px,50vw)] rounded-[7px] bg-control px-2 text-sm font-semibold text-fg outline-none ring-1 ring-accent"
      />
    );
  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onDoubleClick={() => {
          setOpen(false);
          setRenaming(true);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current="page"
        className={`flex min-w-0 items-center gap-1 rounded-[6px] px-1.5 py-1 text-sm font-semibold text-fg transition-colors hover:bg-hover ${open ? 'bg-hover' : ''}`}
        data-testid="design-menu"
      >
        <span className="max-w-[min(260px,40vw)] truncate" data-testid="project-name">
          {name}
        </span>
        <ChevronDown size={13} className={`shrink-0 text-subtle transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} align="start" width={240} label="Design">
        <div className="p-1" role="menu">
          <MenuItem icon={<PencilLine size={14} />} onClick={run(() => setRenaming(true))}>
            Rename
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Plus size={14} />} onClick={run(A.closeProject)}>
            New design…
          </MenuItem>
          <MenuItem icon={<FolderOpen size={14} />} onClick={run(A.closeProject)}>
            Your designs
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Ratio size={14} />} onClick={run(() => studio.set({ dialog: 'resize' }))}>
            Smart resize…
          </MenuItem>
          <MenuItem icon={<Search size={14} />} onClick={run(() => studio.set({ dialog: 'find' }))} shortcut={`${modKey}F`}>
            Find and replace…
          </MenuItem>
          <MenuItem icon={<BookmarkPlus size={14} />} onClick={run(() => void A.saveAsTemplate())}>
            Save as template
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<FileDown size={14} />} onClick={run(() => void A.downloadProjectFile())}>
            Download project file
          </MenuItem>
          <MenuItem icon={<FileUp size={14} />} onClick={run(() => pickFiles(false, (f) => f[0] && void A.importProjectFile(f[0]), '.studiolo,.cleanshot,application/json'))}>
            Open project file…
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Keyboard size={14} />} onClick={run(onShortcuts)} shortcut="?">
            Keyboard shortcuts
          </MenuItem>
        </div>
      </Popover>
    </>
  );
}

/** Shown on a blank design so the first step is obvious. */
function EmptyCanvasHint() {
  const show = useStudio((s) => s.doc?.elements.length === 0 && !s.panel);
  if (!show) return null;
  const items = [
    { id: 'templates', label: 'Templates', icon: LayoutTemplate },
    { id: 'text', label: 'Text', icon: Type },
    { id: 'elements', label: 'Shapes & icons', icon: Shapes },
    { id: 'uploads', label: 'Images', icon: ImagePlus },
  ] as const;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex justify-center px-4 animate-fade-in">
      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 rounded-[12px] border border-line bg-elevated/95 p-1 shadow-pop backdrop-blur" data-testid="empty-hint">
        <span className="px-2 text-xs text-muted">Start with</span>
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => studio.set({ panel: it.id })}
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-xs font-medium text-fg hover:bg-hover"
          >
            <it.icon size={14} className="text-accent" />
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ZoomBar() {
  const { zoom, fullscreen } = useStudio((s) => ({ zoom: s.view.zoom, fullscreen: s.fullscreen }), shallowEqual);
  return (
    <div className="absolute right-3 bottom-3 z-10 flex items-center gap-0.5 rounded-[10px] border border-line bg-elevated/95 p-0.5 shadow-pop backdrop-blur" data-testid="zoom-bar">
      <IconButton label="Zoom out" shortcut={[modKey, '−']} onClick={() => A.zoomStep(-1)} tooltipSide="top">
        <Minus size={14} />
      </IconButton>
      <Tooltip label="Zoom to 100%" shortcut={[modKey, '1']} side="top">
        <button
          type="button"
          onClick={() => {
            const s = studio.get();
            A.zoomAt(1, s.viewport.w / 2, s.viewport.h / 2);
          }}
          className="h-7 w-12 rounded-[7px] text-xs font-medium text-fg tabular-nums hover:bg-hover"
        >
          {Math.round(zoom * 100)}%
        </button>
      </Tooltip>
      <IconButton label="Zoom in" shortcut={[modKey, '+']} onClick={() => A.zoomStep(1)} tooltipSide="top">
        <Plus size={14} />
      </IconButton>
      <span className="mx-0.5 h-4 w-px bg-line" />
      <ViewMenu />
      <IconButton label="Fit to screen" shortcut={[modKey, '0']} onClick={A.fitView} tooltipSide="top">
        <Scan size={14} />
      </IconButton>
      <IconButton label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={() => studio.set({ fullscreen: !fullscreen })} tooltipSide="top">
        {fullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
      </IconButton>
    </div>
  );
}

function ViewMenu() {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const o = useViewOptions();
  const story = useStudio((s) => !!s.doc && isStoryShape(s.doc.width, s.doc.height));
  const row = (label: string, key: 'rulers' | 'grid' | 'snapToGrid' | 'margins' | 'safeZone', hint?: string) => (
    <label className="flex h-8 items-center justify-between gap-3 rounded-[6px] px-2 text-sm text-fg hover:bg-hover">
      <span className="flex flex-col">
        {label}
        {hint && <span className="text-2xs text-subtle">{hint}</span>}
      </span>
      <Toggle checked={o[key]} onChange={(v) => setViewOptions({ [key]: v })} label={label} />
    </label>
  );
  return (
    <>
      <IconButton ref={anchor} label="View options: rulers, grid, margins" onClick={() => setOpen((x) => !x)} tooltipSide="top" active={o.rulers || o.grid || o.margins}>
        <Grid3x3 size={14} />
      </IconButton>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} width={250} label="View options">
        <div className="flex flex-col gap-0.5 p-1.5">
          {row('Rulers', 'rulers')}
          {row('Grid', 'grid')}
          {o.grid && (
            <label className="flex items-center gap-2 px-2 pb-1 text-xs text-muted">
              Size
              <NumberInput ariaLabel="Grid size" value={o.gridSize} min={4} max={1000} suffix="px" onChange={(v) => setViewOptions({ gridSize: v })} />
            </label>
          )}
          {row('Snap to grid', 'snapToGrid')}
          {row('Margins', 'margins')}
          {o.margins && (
            <label className="flex items-center gap-2 px-2 pb-1 text-xs text-muted">
              Inset
              <NumberInput ariaLabel="Margin size" value={o.marginSize} min={0} max={2000} suffix="px" onChange={(v) => setViewOptions({ marginSize: v })} />
            </label>
          )}
          {row('Story safe zone', 'safeZone', story ? 'Shown on 9:16 designs' : 'Only on 9:16 story designs')}
        </div>
      </Popover>
    </>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 animate-fade-in" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}
        className="scroll-thin max-h-[86dvh] w-full max-w-[640px] overflow-y-auto rounded-[16px] border border-line-strong bg-elevated p-5 shadow-pop outline-none animate-pop-in"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-fg">Keyboard shortcuts</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-muted hover:bg-hover hover:text-fg">
            <X size={15} />
          </button>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {STUDIO_SHORTCUTS.map((g) => (
            <section key={g.group} className="flex flex-col gap-1.5">
              <h3 className="text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">{g.group}</h3>
              {g.items.map(([label, keys]) => (
                <div key={label} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted">{label}</span>
                  <span className="shrink-0 font-mono text-[11px] text-fg">{modKey === 'Ctrl' ? keys.replace(/⌘/g, 'Ctrl ') : keys}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

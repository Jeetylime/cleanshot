import { useRef, useState } from 'react';
import {
  ScanText,
  FileText,
  House,
  LayoutGrid,
  SquarePen,
  Check,
  ChevronDown,
  Copy,
  Download,
  ImagePlus,
  Keyboard,
  Minus,
  Monitor,
  Moon,
  PanelRight,
  Plus,
  Redo2,
  RotateCcw,
  Settings,
  Sun,
  Trash2,
  Undo2,
  X,
  Scale,
  Contrast,
  Wind,
  Underline,
  MessageSquare,
  Lock,
  LayoutTemplate,
  ChevronRight,
  Info,
  HardDrive,
  Accessibility,
  BookOpen,
  Search,
} from 'lucide-react';
import { useEditor, shallowEqual } from '../store/store';
import * as actions from '../store/actions';
import { undo, redo } from '../store/history';
import { fitView, zoomStep, zoomToCenter } from '../store/view';
import { computeLayout } from '../engine/render';
import { sendToCanvas } from '../studio/handoff';
import { exportDocument, outputSize } from '../engine/export';
import { store } from '../store/store';
import { IconButton } from './ui/IconButton';
import { Popover, MenuItem, MenuLabel, MenuSeparator } from './ui/Popover';
import { Tooltip } from './ui/Tooltip';
import { ExportPanel } from './ExportPanel';
import { openFilePicker } from '../lib/filePicker';
import { isMac, modKey } from '../lib/utils';
import type { Backdrop, TextSize, Theme } from '../types';
import { Toggle } from './ui/controls';
import { LEGAL } from '../legal/config';
import { openCommandPalette } from '../app/commands';
import { useRecentItems, type RecentItem, type RecentKind } from './recentItems';
import { goAboutPage, goStorage, goCanvas, goEditor, goHome, goLegal, goPdf, goTools, useRoute } from '../app/route';

export function Logo({ compact = false, hideWordmarkOnMobile = false }: { compact?: boolean; hideWordmarkOnMobile?: boolean }) {
  return (
    <div className="flex items-center gap-2 pr-1 pl-0.5">
      <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
        <rect width="32" height="32" rx="8.5" fill="var(--accent)" />
        <path
          d="M9 13V10.5A1.5 1.5 0 0 1 10.5 9H13M19 9h2.5A1.5 1.5 0 0 1 23 10.5V13M23 19v2.5a1.5 1.5 0 0 1-1.5 1.5H19M13 23h-2.5A1.5 1.5 0 0 1 9 21.5V19"
          fill="none"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="16" cy="16" r="2.4" fill="#fff" />
      </svg>
      {!compact && (
        <span className={`text-[length:calc(13px*var(--text-scale))] font-semibold tracking-[-0.01em] text-fg ${hideWordmarkOnMobile ? 'hidden sm:inline' : ''}`}>
          Studiolo
        </span>
      )}
    </div>
  );
}

const SECTIONS = [
  { id: 'home', label: 'Home', hint: 'Start screen', icon: House, go: goHome },
  { id: 'editor', label: 'Edit', hint: 'Annotate, blur and frame an image', icon: SquarePen, go: goEditor },
  { id: 'canvas', label: 'Canvas', hint: 'Design from scratch or a template', icon: LayoutTemplate, go: goCanvas },
  { id: 'tools', label: 'Image Tools', hint: 'Resize, compress, convert and more', icon: LayoutGrid, go: () => goTools() },
  { id: 'pdf', label: 'PDF Tools', hint: 'Merge, split, sign and convert', icon: FileText, go: () => goPdf() },
] as const;

/** Logo that opens a menu of Studiolo's sections. */
export function HomeLogo({ hideWordmarkOnMobile = false }: { hideWordmarkOnMobile?: boolean }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const route = useRoute();
  const docName = useEditor((s) => s.doc?.name ?? null);
  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Studiolo menu"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="home-button"
        className={`-ml-1 flex items-center gap-0.5 rounded-[8px] py-1 pr-1 pl-1 transition-colors hover:bg-hover ${open ? 'bg-hover' : ''}`}
      >
        <Logo hideWordmarkOnMobile={hideWordmarkOnMobile} />
        <ChevronDown size={13} className={`shrink-0 text-subtle transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} align="start" width={270} label="Studiolo sections">
        <div className="p-1.5" role="menu">
          {SECTIONS.map((sec) => {
            const active = route.section === sec.id;
            const hint = sec.id === 'editor' && docName ? `Continue “${docName}”` : sec.hint;
            return (
              <button
                key={sec.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  sec.go();
                }}
                className={`group flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left transition-colors ${active ? 'bg-accent-soft' : 'hover:bg-hover'}`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-line bg-panel text-muted group-hover:text-fg">
                  <sec.icon size={15} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium text-fg">{sec.label}</span>
                  <span className="truncate text-2xs text-subtle">{hint}</span>
                </span>
                {active && <Check size={14} className="shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
        <MenuRecents onPick={() => setOpen(false)} />
      </Popover>
    </>
  );
}

/** The latest edit, design and tools, so you can jump back from anywhere. */
function MenuRecents({ onPick }: { onPick: () => void }) {
  const { items } = useRecentItems();
  const list = (['edit', 'design', 'tool', 'pdf'] as RecentKind[]).map((k) => items[k]).filter((x): x is RecentItem => !!x);
  if (!list.length) return null;
  return (
    <div className="border-t border-line p-1.5" role="group" aria-labelledby="menu-recent-label">
      <div id="menu-recent-label" className="px-2 pt-1 pb-1.5 text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">
        Recent
      </div>
      {list.map((it) => (
        <button
          key={it.kind}
          type="button"
          role="menuitem"
          onClick={() => {
            onPick();
            it.open();
          }}
          className="flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left hover:bg-hover"
        >
          <span className="flex h-7 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[5px] border border-line bg-window text-muted">{it.thumb}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs font-medium text-fg">{it.title}</span>
            <span className="truncate text-2xs text-subtle">
              {it.label} · {it.meta}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Opens the command palette. An icon on small screens, a "Search ⌘K" field on wider ones. */
function SearchButton() {
  return (
    <>
      <span className="lg:hidden">
        <IconButton label="Search" shortcut={[modKey, 'K']} onClick={openCommandPalette} data-testid="search-button">
          <Search size={16} />
        </IconButton>
      </span>
      <button
        type="button"
        onClick={openCommandPalette}
        aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
        data-testid="search-field"
        className="mr-1 hidden h-[28px] w-[200px] items-center gap-2 rounded-[8px] bg-control px-2.5 text-left text-xs text-subtle transition-colors hover:bg-hover hover:text-muted lg:flex"
      >
        <Search size={13} className="shrink-0" aria-hidden="true" />
        <span className="flex-1">Search…</span>
        <kbd className="rounded-[4px] border border-line px-1 text-2xs" aria-hidden="true">
          {modKey === '⌘' ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>
    </>
  );
}

function Divider() {
  return <div className="mx-1.5 h-4 w-px shrink-0 bg-line-strong" />;
}

function DocTitle() {
  const info = useEditor(
    (s) => {
      if (!s.doc) return null;
      const L = computeLayout(s.doc);
      return { name: s.doc.name, w: L.outW, h: L.outH };
    },
    shallowEqual,
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  if (!info) return null;

  return (
    <div className="flex min-w-0 items-center justify-center gap-2 text-sm">
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => {
            actions.renameDoc(draft);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setEditing(false);
          }}
          aria-label="File name"
          className="h-6 w-56 rounded-[5px] bg-control px-1.5 text-center text-sm text-fg ring-1 ring-accent"
        />
      ) : (
        <Tooltip label="Rename">
          <button
            type="button"
            onClick={() => {
              setDraft(info.name);
              setEditing(true);
            }}
            className="max-w-[260px] min-w-0 truncate rounded-[5px] px-1.5 py-0.5 font-medium text-fg hover:bg-hover"
          >
            {info.name}
          </button>
        </Tooltip>
      )}
      <span className="shrink-0 text-xs text-subtle tabular-nums">
        {info.w} × {info.h}
      </span>
    </div>
  );
}

function ZoomControl() {
  const zoom = useEditor((s) => s.view.zoom);
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const presets = [0.25, 0.5, 1, 2, 4];

  return (
    <div className="flex items-center rounded-[8px] bg-control p-0.5">
      <IconButton label="Zoom out" shortcut={[modKey, '−']} size="sm" onClick={() => zoomStep(-1)}>
        <Minus size={14} />
      </IconButton>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-6 w-[58px] items-center justify-center gap-0.5 rounded-[6px] text-xs font-medium text-fg tabular-nums hover:bg-hover"
        aria-label={`${Math.round(zoom * 100)}%, zoom level`}
        aria-haspopup="menu"
      >
        {Math.round(zoom * 100)}%
        <ChevronDown size={11} className="text-subtle" />
      </button>
      <IconButton label="Zoom in" shortcut={[modKey, '+']} size="sm" onClick={() => zoomStep(1)}>
        <Plus size={14} />
      </IconButton>
      <Popover open={open} onClose={close} anchor={anchor} align="center" width={196} label="Zoom">
        <div className="scroll-thin max-h-[calc(100dvh-72px)] overflow-y-auto p-1" role="menu">
          <MenuItem
            onClick={() => {
              fitView(true);
              close();
            }}
            shortcut={`${modKey}0`}
          >
            Zoom to fit
          </MenuItem>
          <MenuSeparator />
          {presets.map((p) => (
            <MenuItem
              key={p}
              onClick={() => {
                zoomToCenter(p);
                close();
              }}
              shortcut={p === 1 ? `${modKey}1` : undefined}
              checked={Math.abs(zoom - p) < 0.001}
            >
              {p * 100}%
            </MenuItem>
          ))}
        </div>
      </Popover>
    </div>
  );
}

export function SettingsMenu({ editorItems = true }: { editorItems?: boolean }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { theme, backdrop, a11y, hasDoc, hasRecents } = useEditor(
    (s) => ({ theme: s.theme, backdrop: s.backdrop, a11y: s.a11y, hasDoc: !!s.doc, hasRecents: s.recents.length > 0 }),
    shallowEqual,
  );
  const close = () => setOpen(false);
  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  const themes: { id: Theme; label: string; icon: React.ReactNode }[] = [
    { id: 'dark', label: 'Dark', icon: <Moon size={13} /> },
    { id: 'light', label: 'Light', icon: <Sun size={13} /> },
    { id: 'system', label: 'System', icon: <Monitor size={13} /> },
  ];
  const textSizes: { id: TextSize; label: string; cls: string }[] = [
    { id: 'default', label: 'Default', cls: 'text-[11px]' },
    { id: 'large', label: 'Large', cls: 'text-[13px]' },
    { id: 'larger', label: 'Larger', cls: 'text-[15px]' },
  ];
  const a11yToggles: { key: 'reduceMotion' | 'highContrast' | 'underlineLinks'; label: string; icon: React.ReactNode }[] = [
    { key: 'highContrast', label: 'Increase contrast', icon: <Contrast size={14} /> },
    { key: 'reduceMotion', label: 'Reduce motion', icon: <Wind size={14} /> },
    { key: 'underlineLinks', label: 'Underline links', icon: <Underline size={14} /> },
  ];
  const backdrops: { id: Backdrop; label: string; swatch: string }[] = [
    { id: 'auto', label: 'Auto', swatch: 'linear-gradient(135deg, #111113 50%, #dcdce0 50%)' },
    { id: 'dark', label: 'Dark', swatch: '#111113' },
    { id: 'light', label: 'Light', swatch: '#dcdce0' },
    { id: 'checker', label: 'Checker', swatch: 'repeating-conic-gradient(#3a3a3f 0% 25%, #222226 0% 50%) 50% / 8px 8px' },
  ];

  return (
    <div className="flex shrink-0 items-center">
      <SearchButton />
      <IconButton ref={anchor} label="Settings" onClick={() => setOpen((o) => !o)} active={false} aria-haspopup="menu">
        <Settings size={16} />
      </IconButton>
      <Popover open={open} onClose={close} anchor={anchor} width={268} label="Settings">
        {/* Settings controls first (radio groups and switches), then a menu of actions and links.
            Only the second part is an ARIA menu, which may contain only menu items. */}
        <div className="p-1 pb-0">
          <MenuLabel id="settings-theme">Appearance</MenuLabel>
          <div className="flex gap-1 px-1 pb-1.5" role="radiogroup" aria-labelledby="settings-theme">
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={theme === t.id}
                onClick={() => actions.setTheme(t.id)}
                className={`flex h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-[7px] text-xs transition-colors ${
                  theme === t.id ? 'bg-accent-soft text-fg ring-1 ring-accent' : 'bg-control text-muted hover:bg-hover hover:text-fg'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
          {editorItems && (
            <>
          <MenuLabel id="settings-backdrop">Workspace background</MenuLabel>
          <div className="flex gap-1 px-1 pb-1.5" role="radiogroup" aria-labelledby="settings-backdrop">
            {backdrops.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={backdrop === b.id}
                title={b.id === 'auto' ? 'Contrasts with the image you are editing' : undefined}
                onClick={() => actions.setBackdrop(b.id)}
                className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-[7px] text-xs transition-colors ${
                  backdrop === b.id ? 'bg-accent-soft text-fg ring-1 ring-accent' : 'bg-control text-muted hover:bg-hover hover:text-fg'
                }`}
              >
                <span className="h-3 w-3 rounded-[3px] ring-1 ring-line-strong" style={{ background: b.swatch }} />
                {b.label}
              </button>
            ))}
          </div>
            </>
          )}
          <MenuLabel>Accessibility</MenuLabel>
          <div className="flex flex-col gap-1 px-1 pb-1.5">
            <div className="flex gap-1" role="radiogroup" aria-label="Text size">
              {textSizes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={a11y.textSize === t.id}
                  onClick={() => actions.setA11y({ textSize: t.id })}
                  className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-[7px] transition-colors ${
                    a11y.textSize === t.id ? 'bg-accent-soft text-fg ring-1 ring-accent' : 'bg-control text-muted hover:bg-hover hover:text-fg'
                  }`}
                >
                  <span className={`font-semibold ${t.cls}`}>A</span>
                  <span className="text-xs">{t.label}</span>
                </button>
              ))}
            </div>
            {a11yToggles.map((t) => (
              <label key={t.key} className="flex min-h-[24px] items-center justify-between gap-2 rounded-[6px] px-1.5 text-sm text-fg hover:bg-hover">
                <span className="flex items-center gap-2.5">
                  <span className="flex w-4 justify-center text-muted">{t.icon}</span>
                  {t.label}
                </span>
                <Toggle checked={a11y[t.key]} onChange={(v) => actions.setA11y({ [t.key]: v })} label={t.label} />
              </label>
            ))}
          </div>
        </div>
        <div className="p-1 pt-0" role="menu" aria-label="Studiolo">
          <MenuSeparator />
          {editorItems && (
            <>
              <MenuItem icon={<ImagePlus size={14} />} onClick={run(openFilePicker)} shortcut={`${modKey}O`}>
                Open image…
              </MenuItem>
              <MenuItem icon={<ScanText size={14} />} onClick={run(() => actions.openOverlay('text'))}>
                Text in image (copy or redact)…
              </MenuItem>
              <MenuItem icon={<Keyboard size={14} />} onClick={run(() => actions.openOverlay('shortcuts'))} shortcut="?">
                Keyboard shortcuts
              </MenuItem>
            </>
          )}
          <MenuItem icon={<MessageSquare size={14} />} onClick={run(() => (location.href = `mailto:${LEGAL.contactEmail ?? ''}?subject=Studiolo%20feedback`))}>
            Send feedback
          </MenuItem>
          {hasRecents && (
            <MenuItem icon={<Trash2 size={14} />} danger onClick={run(() => {
              if (confirm('Clear your recent Edit sessions? They can’t be recovered.')) void actions.clearRecents();
            })}>
              Clear recent sessions
            </MenuItem>
          )}
          {hasDoc && editorItems && (
            <>
              <MenuSeparator />
              <MenuItem icon={<RotateCcw size={14} />} onClick={run(actions.resetEdits)}>
                Revert to original
              </MenuItem>
              <MenuItem icon={<X size={14} />} onClick={run(() => void actions.closeDocument())}>
                Close image
              </MenuItem>
            </>
          )}
          <MenuItem icon={<HardDrive size={14} />} onClick={run(goStorage)}>
            Storage on this device
          </MenuItem>
          <MenuItem icon={<Info size={14} />} onClick={run(goAboutPage)}>
            About Studiolo
          </MenuItem>
          <MenuItem icon={<Accessibility size={14} />} onClick={run(() => goLegal('accessibility'))}>
            Accessibility
          </MenuItem>
          <MenuItem icon={<BookOpen size={14} />} onClick={run(() => goLegal('licenses'))}>
            Open Source Licenses
          </MenuItem>
          <MenuSeparator />
          <MenuLabel>Legal</MenuLabel>
          <MenuItem icon={<Scale size={14} />} onClick={run(() => goLegal('terms'))}>
            Terms of Service
          </MenuItem>
          <MenuItem icon={<Lock size={14} />} onClick={run(() => goLegal('privacy-policy'))}>
            Privacy Policy
          </MenuItem>
        </div>
      </Popover>
    </div>
  );
}

/** Render the current screenshot (with edits and frame) and place it on Canvas. */
function SendToCanvasButton() {
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const doc = store.get().doc;
    if (!doc) return;
    setBusy(true);
    try {
      const { width, height } = outputSize(doc);
      const { blob } = await exportDocument(doc, { format: 'png', quality: 100, width, height });
      sendToCanvas(blob, `${doc.name}.png`);
      actions.showToast('Added to Canvas. Your image is still open in Edit.', 'success');
    } catch {
      actions.showToast('Couldn’t send this image to Canvas.', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Tooltip label="Send to Canvas: use this image in a design">
      <button
        type="button"
        onClick={() => void send()}
        disabled={busy}
        aria-label="Send to Canvas"
        data-testid="send-to-canvas"
        className="inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-xs font-medium text-fg transition-colors hover:bg-hover disabled:opacity-50"
      >
        <LayoutTemplate size={14} />
        <span className="hidden xl:inline">Send to Canvas</span>
      </button>
    </Tooltip>
  );
}

function ExportButton() {
  const anchor = useRef<HTMLButtonElement>(null);
  const open = useEditor((s) => s.overlay === 'export');
  return (
    <>
      <Tooltip label="Export" shortcut={[modKey, 'E']}>
        <button
          ref={anchor}
          type="button"
          onClick={() => actions.openOverlay(open ? null : 'export')}
          className="inline-flex h-7 items-center gap-1.5 rounded-[7px] bg-accent-fill pr-2.5 pl-2 text-xs font-semibold text-white shadow-soft transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.97]"
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <Download size={14} strokeWidth={2.25} />
          Export
        </button>
      </Tooltip>
      <Popover open={open} onClose={() => actions.openOverlay(null)} anchor={anchor} width={296} label="Export">
        <ExportPanel />
      </Popover>
    </>
  );
}

export function TopBar() {
  const { hasDoc, canUndo, canRedo, propertiesOpen } = useEditor(
    (s) => ({ hasDoc: !!s.doc, canUndo: s.past.length > 0, canRedo: s.future.length > 0, propertiesOpen: s.propertiesOpen }),
    shallowEqual,
  );
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await actions.copyImageToClipboard();
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <header className="relative z-20 flex h-[46px] shrink-0 items-center justify-between gap-2 border-b border-line bg-panel px-2.5">
      <div className="flex min-w-0 items-center gap-1">
        <HomeLogo hideWordmarkOnMobile />
        <ChevronRight size={14} className="shrink-0 text-subtle" />
        <span className={`px-1.5 text-sm ${hasDoc ? 'text-muted max-sm:hidden' : 'font-semibold text-fg'}`} aria-current={hasDoc ? undefined : 'page'}>
          Edit
        </span>
        {hasDoc && (
          <>
            <ChevronRight size={14} className="shrink-0 text-subtle max-sm:hidden" />
            <div className="min-w-0 max-sm:hidden" aria-current="page">
              <DocTitle />
            </div>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-1.5">
        {hasDoc && (
          <>
            <IconButton label="Undo" shortcut={[modKey, 'Z']} onClick={undo} disabled={!canUndo}>
              <Undo2 size={16} />
            </IconButton>
            <IconButton label="Redo" shortcut={[modKey, '⇧', 'Z']} onClick={redo} disabled={!canRedo}>
              <Redo2 size={16} />
            </IconButton>
            <Divider />
            <div className="hidden sm:block">
              <ZoomControl />
            </div>
            <div className="hidden sm:block">
              <Divider />
            </div>
            <Tooltip label="Copy to clipboard" shortcut={[modKey, 'C']}>
              <button
                type="button"
                onClick={copy}
                aria-label="Copy to clipboard"
                className="inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-xs font-medium text-fg transition-colors hover:bg-hover"
              >
                {copied ? <Check size={14} className="text-success" strokeWidth={2.5} /> : <Copy size={14} />}
                <span className="hidden lg:inline">{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </Tooltip>
            <SendToCanvasButton />
            <ExportButton />
            <div className="lg:hidden">
              <IconButton label="Properties" active={propertiesOpen} onClick={actions.toggleProperties}>
                <PanelRight size={16} />
              </IconButton>
            </div>
          </>
        )}
        <SettingsMenu />
      </div>
    </header>
  );
}

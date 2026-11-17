import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Accessibility,
  BookOpen,
  Brush,
  Clock,
  Contrast,
  FileText,
  HardDrive,
  Home,
  ImagePlus,
  Info,
  LayoutTemplate,
  Lock,
  MessageSquare,
  Monitor,
  Moon,
  Plus,
  Scale,
  Search,
  Sun,
  Trash2,
  Type,
  Underline,
  Wind,
  Wrench,
} from 'lucide-react';
import { goAboutPage, goCanvas, goEditor, goHome, goLegal, goPdf, goStorage, goTools, type PdfToolKey } from '../app/route';
import { providedCommands, setPaletteOpener, type Command } from '../app/commands';
import { TOOLS } from '../tools/registry';
import { PDF_TOOLS } from '../pdf/registry';
import { store } from '../store/store';
import { clearRecents, setA11y, setTheme } from '../store/actions';
import { openFilePicker } from '../lib/filePicker';
import { shortcutLabel } from '../lib/utils';
import { LEGAL } from '../legal/config';
import { useRecentItems, type RecentKind } from './recentItems';

export type { Command };

/** Rank commands by a simple fuzzy match: every query character must appear in order. Lower is better; null means no match. */
export function scoreCommand(query: string, text: string): number | null {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct >= 0) return direct === 0 || t[direct - 1] === ' ' ? direct : 100 + direct;
  let ti = 0;
  let gaps = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const found = t.indexOf(ch, ti);
    if (found < 0) return null;
    gaps += found - ti;
    ti = found + 1;
  }
  // Letters scattered far apart aren't a real match (e.g. "align" in "Add icon: dollar sign").
  if (gaps > Math.max(4, q.replace(/ /g, '').length * 2)) return null;
  return 1000 + gaps;
}

/** Commands available everywhere. Evaluated when the palette opens, so toggles show their current state. */
function globalCommands(): Command[] {
  const a11y = store.get().a11y;
  const hasRecents = store.get().recents.length > 0;
  const onOff = (v: boolean) => (v ? 'Turn off' : 'Turn on');
  const cmds: Command[] = [
    { id: 'go-home', label: 'Home', section: 'Go to', icon: <Home size={15} />, run: goHome },
    { id: 'go-editor', label: 'Edit: annotate a screenshot', section: 'Go to', keywords: 'annotate redact blur screenshot editor', icon: <Brush size={15} />, run: goEditor },
    { id: 'go-canvas', label: 'Canvas: design editor', section: 'Go to', keywords: 'design template poster social', icon: <LayoutTemplate size={15} />, run: goCanvas },
    { id: 'go-tools', label: 'All Image Tools', section: 'Go to', icon: <Wrench size={15} />, run: () => goTools(null) },
    { id: 'go-pdf', label: 'All PDF Tools', section: 'Go to', icon: <FileText size={15} />, run: () => goPdf(null) },
    { id: 'open-image', label: 'Open an image to edit…', section: 'Create', keywords: 'open file upload screenshot photo annotate', icon: <ImagePlus size={15} />, shortcut: shortcutLabel('O'), run: () => (goEditor(), openFilePicker()) },
    { id: 'new-design', label: 'New design', section: 'Create', keywords: 'canvas create blank start template poster', icon: <Plus size={15} />, run: goCanvas },
  ];
  for (const t of TOOLS) cmds.push({ id: `tool-${t.key}`, label: t.name, section: 'Image Tools', keywords: t.description, icon: <t.icon size={15} />, run: () => goTools(t.key) });
  for (const t of PDF_TOOLS) cmds.push({ id: `pdf-${t.key}`, label: t.name, section: 'PDF Tools', keywords: `pdf ${t.description}`, icon: <t.icon size={15} />, run: () => goPdf(t.key as PdfToolKey) });
  cmds.push(
    { id: 'theme-dark', label: 'Theme: Dark', section: 'Settings', keywords: 'appearance mode night', icon: <Moon size={15} />, run: () => setTheme('dark') },
    { id: 'theme-light', label: 'Theme: Light', section: 'Settings', keywords: 'appearance mode day', icon: <Sun size={15} />, run: () => setTheme('light') },
    { id: 'theme-system', label: 'Theme: System', section: 'Settings', keywords: 'appearance mode auto', icon: <Monitor size={15} />, run: () => setTheme('system') },
    { id: 'text-default', label: 'Text size: Default', section: 'Settings', keywords: 'font accessibility', icon: <Type size={15} />, run: () => setA11y({ textSize: 'default' }) },
    { id: 'text-large', label: 'Text size: Large', section: 'Settings', keywords: 'font bigger accessibility zoom', icon: <Type size={15} />, run: () => setA11y({ textSize: 'large' }) },
    { id: 'text-larger', label: 'Text size: Larger', section: 'Settings', keywords: 'font biggest accessibility zoom', icon: <Type size={15} />, run: () => setA11y({ textSize: 'larger' }) },
    { id: 'a11y-contrast', label: `${onOff(a11y.highContrast)} increased contrast`, section: 'Settings', keywords: 'accessibility high contrast', icon: <Contrast size={15} />, run: () => setA11y({ highContrast: !a11y.highContrast }) },
    { id: 'a11y-motion', label: `${onOff(a11y.reduceMotion)} reduced motion`, section: 'Settings', keywords: 'accessibility animation', icon: <Wind size={15} />, run: () => setA11y({ reduceMotion: !a11y.reduceMotion }) },
    { id: 'a11y-links', label: `${onOff(a11y.underlineLinks)} link underlines`, section: 'Settings', keywords: 'accessibility underline links', icon: <Underline size={15} />, run: () => setA11y({ underlineLinks: !a11y.underlineLinks }) },
    { id: 'storage', label: 'Storage on this device', section: 'Help', keywords: 'storage delete clear export designs models cache offline space', icon: <HardDrive size={15} />, run: goStorage },
    { id: 'feedback', label: 'Send feedback', section: 'Help', keywords: 'contact email bug idea support', icon: <MessageSquare size={15} />, run: () => (location.href = `mailto:${LEGAL.contactEmail ?? ''}?subject=Studiolo%20feedback`) },
    { id: 'about', label: 'About Studiolo', section: 'Help', icon: <Info size={15} />, run: goAboutPage },
    { id: 'accessibility', label: 'Accessibility statement', section: 'Help', keywords: 'wcag screen reader keyboard', icon: <Accessibility size={15} />, run: () => goLegal('accessibility') },
    { id: 'licenses', label: 'Open source licenses', section: 'Help', keywords: 'credits libraries attribution', icon: <BookOpen size={15} />, run: () => goLegal('licenses') },
    { id: 'terms', label: 'Terms of Service', section: 'Help', keywords: 'legal acceptable use rules', icon: <Scale size={15} />, run: () => goLegal('terms') },
    { id: 'privacy', label: 'Privacy Policy', section: 'Help', keywords: 'legal data cookies', icon: <Lock size={15} />, run: () => goLegal('privacy-policy') },
  );
  if (hasRecents)
    cmds.push({
      id: 'clear-recents',
      label: 'Clear recent Edit sessions',
      section: 'Help',
      keywords: 'delete history recents',
      icon: <Trash2 size={15} />,
      run: () => {
        if (confirm('Clear your recent Edit sessions? They can’t be recovered.')) void clearRecents();
      },
    });
  return cmds;
}

const MAX_RESULTS = 60;

/**
 * ⌘K / Ctrl+K anywhere (or the search button in the top bar) opens a searchable
 * list of places, tools, settings, recent work and actions for the section
 * you're in. With no query it shows recent work and the current section's
 * actions first.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  const show = () => {
    restoreFocus.current = document.activeElement as HTMLElement | null;
    setOpen(true);
    setQuery('');
    setActive(0);
  };
  const close = () => {
    setOpen(false);
    restoreFocus.current?.focus?.();
  };

  useEffect(() => {
    setPaletteOpener(show);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        setOpen((o) => {
          if (!o) {
            restoreFocus.current = document.activeElement as HTMLElement | null;
            setQuery('');
            setActive(0);
          }
          return !o;
        });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      setPaletteOpener(null);
    };
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  // Recents are read each time the palette opens (see RecentLoader), so they're never stale.
  const [recent, setRecent] = useState<ReturnType<typeof useRecentItems>['items']>({});
  // Rebuilt when the palette opens (and when recents arrive), so section commands and toggles reflect the current state.
  const commands = useMemo(() => {
    if (!open) return [];
    const recentCmds: Command[] = (['edit', 'design', 'tool', 'pdf'] as RecentKind[])
      .map((k) => recent[k])
      .filter((r) => !!r)
      .map((r) => ({ id: `recent-${r!.kind}`, label: `${r!.label}: ${r!.title}`, section: 'Recent', keywords: 'recent continue last open resume', icon: <Clock size={15} />, run: r!.open }));
    // Commands for the section you're in rank above global ones on similar matches.
    const local = providedCommands().map((c) => ({ ...c, local: true }));
    return [...recentCmds, ...local, ...globalCommands()];
  }, [open, recent]);

  const results = useMemo(() => {
    if (!query.trim()) return commands.slice(0, MAX_RESULTS);
    return commands
      .map((c, i) => {
        const a = scoreCommand(query, c.label);
        const b = scoreCommand(query, `${c.section} ${c.keywords ?? ''}`);
        const raw = a ?? (b !== null ? b + 500 : null);
        const score = raw === null ? null : raw + ((c as Command & { local?: boolean }).local ? 0 : 60);
        return { c, score, i };
      })
      .filter((r): r is { c: Command; score: number; i: number } => r.score !== null)
      .sort((x, y) => x.score - y.score || x.i - y.i)
      .slice(0, MAX_RESULTS)
      .map((r) => r.c);
  }, [commands, query]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const run = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    c.run();
  };
  // Shared by the search box and the list: arrows move, Enter runs, Escape closes.
  const onKeys = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[active]);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/30 px-4 pt-[14vh] backdrop-blur-[2px]" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[64vh] w-full max-w-[600px] flex-col overflow-hidden rounded-[14px] border border-line bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.35)] animate-fade-in"
      >
        <div className="flex items-center gap-2 border-b border-line px-3.5">
          <Search size={15} className="text-subtle" />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeys}
            placeholder="Search actions, tools, settings and recent work…"
            aria-label="Search commands"
            aria-controls="command-results"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
            className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
          />
          <kbd className="rounded-[5px] border border-line px-1.5 text-2xs text-subtle">esc</kbd>
        </div>
        <ul ref={list} id="command-results" role="listbox" aria-label="Commands" tabIndex={0} onKeyDown={onKeys} aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined} className="scroll-thin overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-subtle">No matches</li>}
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`cmd-${c.id}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              onMouseMove={() => setActive(i)}
              onClick={() => run(c)}
              className={`flex cursor-pointer items-center gap-3 rounded-[8px] px-2.5 py-2 text-sm ${i === active ? 'bg-accent-soft text-fg' : 'text-muted'}`}
            >
              <span className="flex w-4 shrink-0 justify-center text-muted">{c.icon}</span>
              <span className="min-w-0 flex-1 truncate text-fg">{c.label}</span>
              {c.shortcut && <kbd className="shrink-0 rounded-[5px] border border-line px-1.5 text-2xs text-subtle">{c.shortcut}</kbd>}
              <span className="shrink-0 text-2xs text-subtle">{c.section}</span>
            </li>
          ))}
        </ul>
        <RecentLoader onLoad={setRecent} />
        <div className="flex items-center gap-3 border-t border-line px-3.5 py-2 text-2xs text-subtle">
          <span>↑↓ to move</span>
          <span>↵ to run</span>
          <span className="ml-auto">{commands.length} commands available here</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Reads recent work while the palette is open and reports it once it's ready. */
function RecentLoader({ onLoad }: { onLoad: (items: ReturnType<typeof useRecentItems>['items']) => void }) {
  const { ready, items } = useRecentItems();
  const key = ready ? Object.values(items).map((i) => `${i!.kind}:${i!.title}:${i!.meta}`).join('|') : '';
  useEffect(() => {
    if (ready) onLoad(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key]);
  return null;
}

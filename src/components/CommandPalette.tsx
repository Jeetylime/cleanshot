import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Brush, FileText, HardDrive, Home, Info, LayoutTemplate, Monitor, Moon, Search, Sun, Wrench } from 'lucide-react';
import { goAboutPage, goStorage, goCanvas, goEditor, goHome, goPdf, goTools, type PdfToolKey } from '../app/route';
import { TOOLS } from '../tools/registry';
import { PDF_TOOLS } from '../pdf/registry';
import { setTheme } from '../store/actions';

export interface Command {
  id: string;
  label: string;
  section: string;
  keywords?: string;
  icon: ReactNode;
  run: () => void;
}

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
  return 1000 + gaps;
}

function buildCommands(): Command[] {
  const cmds: Command[] = [
    { id: 'home', label: 'Home', section: 'Go to', icon: <Home size={15} />, run: goHome },
    { id: 'editor', label: 'Edit: annotate a screenshot', section: 'Go to', keywords: 'annotate redact blur screenshot', icon: <Brush size={15} />, run: goEditor },
    { id: 'canvas', label: 'Canvas: design editor', section: 'Go to', keywords: 'design template poster social', icon: <LayoutTemplate size={15} />, run: goCanvas },
    { id: 'tools', label: 'All Image Tools', section: 'Go to', icon: <Wrench size={15} />, run: () => goTools(null) },
    { id: 'pdf', label: 'All PDF Tools', section: 'Go to', icon: <FileText size={15} />, run: () => goPdf(null) },
    { id: 'storage', label: 'Storage on this device', section: 'Go to', keywords: 'storage delete clear export designs models cache offline', icon: <HardDrive size={15} />, run: goStorage },
    { id: 'about', label: 'About Studiolo', section: 'Go to', icon: <Info size={15} />, run: goAboutPage },
  ];
  for (const t of TOOLS) cmds.push({ id: t.key, label: t.name, section: 'Image Tools', keywords: t.description, icon: <t.icon size={15} />, run: () => goTools(t.key) });
  for (const t of PDF_TOOLS) cmds.push({ id: t.key, label: t.name, section: 'PDF Tools', keywords: `pdf ${t.description}`, icon: <t.icon size={15} />, run: () => goPdf(t.key as PdfToolKey) });
  cmds.push(
    { id: 'theme-dark', label: 'Theme: Dark', section: 'Settings', icon: <Moon size={15} />, run: () => setTheme('dark') },
    { id: 'theme-light', label: 'Theme: Light', section: 'Settings', icon: <Sun size={15} />, run: () => setTheme('light') },
    { id: 'theme-system', label: 'Theme: System', section: 'Settings', icon: <Monitor size={15} />, run: () => setTheme('system') },
  );
  return cmds;
}

/** ⌘K / Ctrl+K anywhere opens a searchable list of every section, tool and setting. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const commands = useMemo(buildCommands, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        setOpen((o) => !o);
        setQuery('');
        setActive(0);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  const results = useMemo(() => {
    return commands
      .map((c) => {
        const a = scoreCommand(query, c.label);
        const b = c.keywords ? scoreCommand(query, c.keywords) : null;
        const score = a ?? (b !== null ? b + 500 : null);
        return { c, score };
      })
      .filter((r): r is { c: Command; score: number } => r.score !== null)
      .sort((x, y) => x.score - y.score)
      .slice(0, 30)
      .map((r) => r.c);
  }, [commands, query]);

  if (!open) return null;

  const run = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    c.run();
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/30 px-4 pt-[14vh] backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[60vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[14px] border border-line bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.35)] animate-fade-in"
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
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') setOpen(false);
              else if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(results.length - 1, a + 1)));
              else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
              else if (e.key === 'Enter') run(results[active]);
            }}
            placeholder="Search tools, sections and settings…"
            aria-label="Search commands"
            aria-controls="command-results"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
            className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
          />
          <kbd className="rounded-[5px] border border-line px-1.5 text-2xs text-subtle">esc</kbd>
        </div>
        <ul id="command-results" role="listbox" className="scroll-thin overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-subtle">No matches</li>}
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`cmd-${c.id}`}
              role="option"
              aria-selected={i === active}
              onMouseMove={() => setActive(i)}
              onClick={() => run(c)}
              className={`flex cursor-pointer items-center gap-3 rounded-[8px] px-2.5 py-2 text-sm ${i === active ? 'bg-accent-soft text-fg' : 'text-muted'}`}
            >
              <span className="text-muted">{c.icon}</span>
              <span className="min-w-0 flex-1 truncate text-fg">{c.label}</span>
              <span className="text-2xs text-subtle">{c.section}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

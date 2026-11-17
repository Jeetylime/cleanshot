import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Copy, Download, FileUp, ImagePlus, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { HomeLogo, SettingsMenu } from '../components/TopBar';
import { ColorWell, NumberInput, Button } from '../components/ui/controls';
import { Popover, MenuItem } from '../components/ui/Popover';
import { formatBytes, timeAgo } from '../lib/utils';
import { pickFiles, useFileSink } from '../tools/shared/ui';
import * as A from './actions';
import * as db from './persistence';
import { MAX_CANVAS_SIDE, RATIO_PRESETS, SIZE_PRESETS, TEMPLATES } from './templates';
import { TemplateThumb, UserTemplates } from './LeftPanel';
import type { StudioFill } from './types';

type Bg = 'white' | 'transparent' | 'color';

function PresetGlyph({ w, h }: { w: number; h: number }) {
  const k = 30 / Math.max(w, h);
  return (
    <span className="flex h-9 w-9 items-center justify-center">
      <span className="rounded-[3px] border-[1.5px] border-current" style={{ width: Math.max(6, w * k), height: Math.max(6, h * k) }} />
    </span>
  );
}

/** Designs shown before "Show all": one row on wide screens. */
const RECENT_COUNT = 5;

export function CanvasStart() {
  const [projects, setProjects] = useState<db.ProjectSummary[] | null>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [w, setW] = useState(1080);
  const [h, setH] = useState(1080);
  const [bg, setBg] = useState<Bg>('white');
  const [color, setColor] = useState('#f5f5f7');
  const [showAll, setShowAll] = useState(false);

  const refresh = async () => {
    try {
      setProjects(await db.listProjects());
    } catch {
      setProjects([]);
    }
    setUsage(await db.storageEstimate());
  };
  useEffect(() => {
    void refresh();
  }, []);

  // Drop or paste an image here to start a design from it.
  useFileSink((files) => {
    const f = files[0];
    if (f) void A.openImageInCanvas(f, f.name, { newDesign: true });
  });

  const fill = (): StudioFill => (bg === 'transparent' ? { kind: 'transparent' } : { kind: 'solid', color: bg === 'white' ? '#ffffff' : color });
  const create = (width: number, height: number, name?: string) => A.createProject({ width, height, background: fill(), name });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-[46px] shrink-0 items-center justify-between gap-2 border-b border-line bg-panel px-2.5">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
          <HomeLogo />
          <ChevronRight size={14} className="shrink-0 text-subtle" />
          <span className="px-1.5 text-sm font-semibold text-fg" aria-current="page">
            Canvas
          </span>
        </nav>
        <SettingsMenu editorItems={false} />
      </header>
      <main className="scroll-thin flex-1 overflow-y-auto px-5 py-8">
        <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-8 animate-rise">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[length:calc(20px*var(--text-scale))] font-semibold tracking-[-0.02em] text-fg">New design</h1>
              <p className="mt-1 text-sm text-muted">Pick a size or a template. You can change the size later.</p>
            </div>
            <div className="flex gap-1.5">
              <Button onClick={() => pickFiles(false, (f) => f[0] && void A.openImageInCanvas(f[0], f[0].name, { newDesign: true }))}>
                <ImagePlus size={13} /> Start from an image
              </Button>
              <Button onClick={() => pickFiles(false, (f) => f[0] && void A.importProjectFile(f[0]), '.studiolo,.cleanshot,application/json')}>
                <FileUp size={13} /> Open project file
              </Button>
            </div>
          </div>

          {projects && projects.length > 0 && (
            <section aria-labelledby="recent" className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between px-0.5">
                <h2 id="recent" className="text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">
                  Your designs
                </h2>
                <span className="flex items-center gap-3">
                  {usage && <span className="hidden text-2xs text-subtle tabular-nums sm:inline">{formatBytes(usage.usage)} of browser storage used</span>}
                  {projects.length > RECENT_COUNT && (
                    <button type="button" aria-expanded={showAll} aria-controls="your-designs" onClick={() => setShowAll((v) => !v)} className="text-xs font-medium text-accent hover:underline">
                      {showAll ? 'Show fewer' : `Show all ${projects.length}`}
                    </button>
                  )}
                </span>
              </div>
              <div id="your-designs" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {(showAll ? projects : projects.slice(0, RECENT_COUNT)).map((p) => (
                  <ProjectCard key={p.id} p={p} onChanged={refresh} />
                ))}
              </div>
              <p className="px-0.5 text-2xs leading-[14px] text-subtle">
                Designs are stored only in this browser. Clearing site data removes them. To keep a copy or move a design to another device, use “Download project file” from the design’s menu.
              </p>
            </section>
          )}

          <section aria-labelledby="sizes" className="flex flex-col gap-2.5">
            <h2 id="sizes" className="px-0.5 text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">
              Sizes
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {SIZE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`preset-${p.id}`}
                  onClick={() => create(p.width, p.height, p.label)}
                  className="group flex items-center gap-3 rounded-[12px] border border-line bg-panel p-3 text-left transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-px hover:border-line-strong hover:shadow-pop"
                >
                  <span className="text-muted group-hover:text-accent">
                    <PresetGlyph w={p.width} h={p.height} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[length:calc(13px*var(--text-scale))] font-semibold text-fg">{p.label}</span>
                    <span className="truncate text-2xs text-subtle tabular-nums">
                      {p.width} × {p.height} · {p.hint}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="custom" className="flex flex-col gap-2.5">
            <h2 id="custom" className="px-0.5 text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">
              Custom size
            </h2>
            <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-panel p-3.5 lg:flex-row lg:items-center">
              <div className="flex items-center gap-1.5 lg:w-[260px]">
                <NumberInput ariaLabel="Width" prefix="W" suffix="px" value={w} min={16} max={MAX_CANVAS_SIDE} onChange={setW} />
                <span className="text-subtle">×</span>
                <NumberInput ariaLabel="Height" prefix="H" suffix="px" value={h} min={16} max={MAX_CANVAS_SIDE} onChange={setH} />
              </div>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Aspect ratio">
                {RATIO_PRESETS.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() => {
                      const base = 1080;
                      if (r.w >= r.h) {
                        setW(Math.round((base * r.w) / r.h));
                        setH(base);
                      } else {
                        setW(base);
                        setH(Math.round((base * r.h) / r.w));
                      }
                    }}
                    className={`h-7 rounded-[7px] px-2 text-xs font-medium ${Math.abs(w / h - r.w / r.h) < 0.01 ? 'bg-accent-soft text-fg ring-1 ring-accent' : 'bg-control text-muted hover:bg-hover hover:text-fg'}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 lg:ml-auto">
                <div className="flex gap-0.5 rounded-[8px] bg-control p-0.5" role="radiogroup" aria-label="Background">
                  {(['white', 'transparent', 'color'] as Bg[]).map((b) => (
                    <button
                      key={b}
                      type="button"
                      role="radio"
                      aria-checked={bg === b}
                      onClick={() => setBg(b)}
                      className={`h-6 rounded-[6px] px-2 text-xs font-medium capitalize ${bg === b ? 'bg-elevated text-fg shadow-soft' : 'text-muted hover:text-fg'}`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
                {bg === 'color' && (
                  <div className="w-[120px]">
                    <ColorWell label="Background color" value={color} onChange={setColor} />
                  </div>
                )}
                <Button variant="primary" onClick={() => create(w, h)} className="h-8" >
                  <Plus size={14} /> Create
                </Button>
              </div>
            </div>
          </section>

          <UserTemplates />

          <section aria-labelledby="templates" className="flex flex-col gap-2.5">
            <h2 id="templates" className="px-0.5 text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">
              Templates
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TEMPLATES.map((t) => (
                <button key={t.id} type="button" onClick={() => A.createProject({ width: t.width, height: t.height, templateId: t.id })} className="group flex flex-col gap-1.5 text-left" data-testid={`start-template-${t.id}`}>
                  <TemplateThumb id={t.id} />
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-medium text-fg">{t.name}</span>
                    <span className="shrink-0 text-2xs text-subtle">{t.category}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}

function ProjectCard({ p, onChanged }: { p: db.ProjectSummary; onChanged: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!p.thumb) return;
    const u = URL.createObjectURL(p.thumb);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [p.thumb]);
  return (
    <div className="group relative flex flex-col gap-1.5">
      <button type="button" onClick={() => void A.openProject(p.id)} className="flex flex-col gap-1.5 text-left" data-testid="project-card">
        <span className="cs-checker flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[10px] border border-line p-2 transition-[border-color] group-hover:border-line-strong">
          {url ? <img src={url} alt="" className="max-h-full max-w-full rounded-[2px] shadow-soft" draggable={false} /> : null}
        </span>
        <span className="truncate pr-6 text-xs font-medium text-fg">{p.name}</span>
        <span className="-mt-1 text-2xs text-subtle tabular-nums">
          {p.width} × {p.height} · {timeAgo(p.updatedAt)}
        </span>
      </button>
      <button
        ref={anchor}
        type="button"
        aria-label={`More actions for ${p.name}`}
        onClick={() => setOpen((o) => !o)}
        className="absolute right-0 bottom-[22px] flex h-[24px] w-[24px] items-center justify-center rounded-[6px] text-muted hover:bg-hover hover:text-fg"
      >
        <MoreHorizontal size={14} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} width={190} label="Design actions">
        <div className="p-1" role="menu">
          <MenuItem
            icon={<Copy size={14} />}
            onClick={async () => {
              setOpen(false);
              await A.duplicateProject(p.id);
              onChanged();
            }}
          >
            Duplicate
          </MenuItem>
          <MenuItem
            icon={<Download size={14} />}
            onClick={() => {
              setOpen(false);
              void A.downloadSavedProject(p.id);
            }}
          >
            Download project file
          </MenuItem>
          <MenuItem
            icon={<Trash2 size={14} />}
            danger
            onClick={async () => {
              setOpen(false);
              if (!confirm(`Delete “${p.name}”? This can’t be undone.`)) return;
              await A.deleteProject(p.id);
              onChanged();
            }}
          >
            Delete
          </MenuItem>
        </div>
      </Popover>
    </div>
  );
}

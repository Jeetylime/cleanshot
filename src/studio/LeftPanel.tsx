import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  Lock,
  Palette,
  Shapes,
  Trash2,
  Type,
  Unlock,
  Upload,
  X,
  Minus,
  MoveRight,
  Group,
  ChartColumn,
  ChartBar,
  ChartLine,
  ChartPie,
  Donut,
  QrCode,
  Briefcase,
  BookmarkPlus,
  ChevronRight,
} from 'lucide-react';
import { Tooltip } from '../components/ui/Tooltip';
import { Button, ColorWell, Slider, Toggle } from '../components/ui/controls';
import { pickFiles } from '../tools/shared/ui';
import { getImage } from '../engine/images';
import { studio, useStudio, shallowEqual, type LeftPanel as PanelId } from './store';
import * as A from './actions';
import { DND_TYPE, type DndPayload } from './Stage';
import { FrameShapeGlyph } from './ImageExtras';
import { STICKERS } from './stickers';
import { deleteTemplate, listTemplates, type ProjectRecord } from './persistence';
import { BrandPanel } from './BrandPanel';
import { ICONS } from './iconData';
import { SHAPE_LABELS, fitText, newDoc } from './factory';
import { TEMPLATES } from './templates';
import { renderToCanvas, studioFillCss } from './render';
import { FONTS, fontOf, loadFontsFor } from './fonts';
import type { ChartKind, PatternKind, ShapeKind, StudioElement, StudioFill, TextElement } from './types';

const RAIL: { id: PanelId; label: string; icon: typeof Shapes }[] = [
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'elements', label: 'Elements', icon: Shapes },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'uploads', label: 'Uploads', icon: Upload },
  { id: 'backgrounds', label: 'Background', icon: Palette },
  { id: 'brand', label: 'Brand', icon: Briefcase },
  { id: 'layers', label: 'Layers', icon: Layers },
];

export function Rail() {
  const panel = useStudio((s) => s.panel);
  return (
    <nav
      aria-label="Add and organize"
      className="flex shrink-0 gap-0.5 border-line bg-panel p-1 max-md:order-last max-md:h-[58px] max-md:justify-around max-md:border-t md:w-[68px] md:flex-col md:border-r md:py-2"
    >
      {RAIL.map((r) => {
        const active = panel === r.id;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => A.setPanel(r.id)}
            aria-pressed={active}
            data-testid={`rail-${r.id}`}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[9px] px-1 py-1.5 text-[length:calc(10.5px*var(--text-scale))] font-medium transition-colors md:flex-none md:py-2 ${
              active ? 'bg-accent-soft text-fg' : 'text-muted hover:bg-hover hover:text-fg'
            }`}
          >
            <r.icon size={18} strokeWidth={active ? 2.1 : 1.8} className={active ? 'text-accent' : ''} />
            <span className="truncate">{r.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function LeftDrawer() {
  const panel = useStudio((s) => s.panel);
  if (!panel) return null;
  const title = RAIL.find((r) => r.id === panel)!.label;
  return (
    <aside
      aria-label={title}
      className="flex shrink-0 flex-col border-line bg-panel animate-fade-in max-md:absolute max-md:inset-x-0 max-md:bottom-[58px] max-md:z-30 max-md:h-[min(52vh,calc(100%-120px))] max-md:rounded-t-[16px] max-md:border-t max-md:shadow-pop md:w-[252px] md:border-r"
    >
      <header className="flex h-11 shrink-0 items-center justify-between px-3.5">
        <h2 className="text-[length:calc(13px*var(--text-scale))] font-semibold text-fg">{title}</h2>
        <button type="button" aria-label="Close panel" onClick={() => studio.set({ panel: null })} className="flex h-6 w-6 items-center justify-center rounded-[6px] text-muted hover:bg-hover hover:text-fg">
          <X size={14} />
        </button>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3.5 pb-4">
        {panel === 'templates' && <TemplatesPanel />}
        {panel === 'elements' && <ElementsPanel />}
        {panel === 'text' && <TextPanel />}
        {panel === 'uploads' && <UploadsPanel />}
        {panel === 'backgrounds' && <BackgroundPanel />}
        {panel === 'brand' && <BrandPanel />}
        {panel === 'layers' && <LayersPanel />}
      </div>
    </aside>
  );
}

function Group_({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 pt-3 first:pt-0">
      <div className="flex items-center justify-between">
        <h3 className="text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function dragProps(payload: DndPayload) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DND_TYPE, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'copy';
    },
  };
}

const tile =
  'group flex items-center justify-center rounded-[10px] border border-line bg-window text-muted transition-[border-color,background-color,color,transform] duration-150 hover:border-line-strong hover:text-fg active:scale-[0.97]';

// ---------------------------------------------------------------------------
// Templates

function TemplatesPanel() {
  const hasContent = useStudio((s) => (s.doc?.elements.length ?? 0) > 0);
  const [resize, setResize] = useState(true);
  const [cat, setCat] = useState<string>('All');
  const cats = ['All', ...new Set(TEMPLATES.map((t) => t.category))];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-[17px] text-muted">Start from a layout, then change anything. Templates replace what’s on this page; undo brings it back.</p>
      <Button onClick={() => void A.saveAsTemplate()}>
        <BookmarkPlus size={13} /> Save this design as a template
      </Button>
      <UserTemplates compact />
      <div className="flex flex-wrap gap-1">
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            aria-pressed={cat === c}
            className={`h-6 rounded-full px-2.5 text-2xs font-medium ${cat === c ? 'bg-accent-fill text-white' : 'bg-control text-muted hover:text-fg'}`}
          >
            {c}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>Use the template’s size</span>
        <Toggle checked={resize} onChange={setResize} label="Use the template’s size" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        {TEMPLATES.filter((t) => cat === 'All' || t.category === cat).map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid={`template-${t.id}`}
            onClick={() => {
              if (hasContent && !confirm('Replace the current design with this template? You can undo this.')) return;
              A.applyTemplate(t.id, resize);
            }}
            className="group flex flex-col gap-1.5 text-left"
          >
            <TemplateThumb id={t.id} />
            <span className="truncate text-xs font-medium text-fg">{t.name}</span>
            <span className="-mt-1 text-2xs text-subtle">
              {t.width} × {t.height}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Designs you saved as templates; using one starts a new design. */
export function UserTemplates({ compact = false }: { compact?: boolean }) {
  const tick = useStudio((s) => s.paintTick);
  const [list, setList] = useState<ProjectRecord[] | null>(null);
  const refresh = () => void listTemplates().then(setList).catch(() => setList([]));
  useEffect(refresh, [tick]);
  if (!list?.length) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="Your templates">
      <h3 className="text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">Your templates</h3>
      <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {list.map((t) => (
          <UserTemplateCard key={t.id} t={t} onDeleted={refresh} />
        ))}
      </div>
    </section>
  );
}

function UserTemplateCard({ t, onDeleted }: { t: ProjectRecord; onDeleted: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!t.thumb) return;
    const u = URL.createObjectURL(t.thumb);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [t.thumb]);
  return (
    <div className="group relative flex flex-col gap-1.5">
      <button type="button" onClick={() => void A.createFromUserTemplate(t)} className="flex flex-col gap-1.5 text-left" title="Start a new design from this template">
        <span className="flex aspect-square items-center justify-center overflow-hidden rounded-[10px] border border-line bg-window p-2 group-hover:border-line-strong">
          {url && <img src={url} alt="" className="max-h-full max-w-full rounded-[3px] shadow-soft" draggable={false} />}
        </span>
        <span className="truncate text-xs font-medium text-fg">{t.name}</span>
      </button>
      <button
        type="button"
        aria-label={`Delete template ${t.name}`}
        onClick={async () => {
          if (!confirm(`Delete the template “${t.name}”?`)) return;
          await deleteTemplate(t.id);
          onDeleted();
        }}
        className="absolute top-1 right-1 hidden h-6 w-6 items-center justify-center rounded-[6px] bg-elevated text-muted shadow-pop group-hover:flex hover:text-danger"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

const thumbCache = new Map<string, string>();
export function TemplateThumb({ id }: { id: string }) {
  const [url, setUrl] = useState(thumbCache.get(id) ?? null);
  const t = TEMPLATES.find((x) => x.id === id)!;
  useEffect(() => {
    if (url) return;
    let cancelled = false;
    void (async () => {
      const els = t.build({ width: t.width, height: t.height });
      await loadFontsFor(els.filter((e): e is TextElement => e.type === 'text'));
      const doc = newDoc({ width: t.width, height: t.height, background: t.background, elements: els.map((e) => (e.type === 'text' ? fitText(e) : e)) });
      const k = 240 / Math.max(t.width, t.height);
      const c = renderToCanvas(doc, k);
      const u = c.toDataURL('image/png');
      thumbCache.set(id, u);
      if (!cancelled) setUrl(u);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, url, t]);
  return (
    <span
      className="flex aspect-square items-center justify-center overflow-hidden rounded-[10px] border border-line bg-window p-2 transition-[border-color,transform] duration-150 group-hover:border-line-strong group-active:scale-[0.98]"
      aria-hidden="true"
    >
      {url ? (
        <img src={url} alt="" className="max-h-full max-w-full rounded-[3px] shadow-soft" draggable={false} />
      ) : (
        <span className="h-1/2 w-1/2 animate-pulse rounded bg-control" />
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Elements

const CHARTS: { kind: ChartKind; label: string; icon: typeof Shapes }[] = [
  { kind: 'column', label: 'Column', icon: ChartColumn },
  { kind: 'bar', label: 'Bar', icon: ChartBar },
  { kind: 'line', label: 'Line', icon: ChartLine },
  { kind: 'pie', label: 'Pie', icon: ChartPie },
  { kind: 'donut', label: 'Donut', icon: Donut },
];

const stickerThumbs = new Map<string, string>();
function StickerThumb({ id }: { id: string }) {
  const [url, setUrl] = useState(stickerThumbs.get(id) ?? null);
  useEffect(() => {
    if (url) return;
    let cancelled = false;
    void (async () => {
      const st = STICKERS.find((x) => x.id === id)!;
      const els = st.build();
      await loadFontsFor(els.filter((e): e is TextElement => e.type === 'text'));
      const doc = newDoc({ width: st.w + 8, height: st.h + 8, background: { kind: 'transparent' }, elements: els.map((e) => ({ ...(e.type === 'text' ? fitText(e) : e), x: e.x + 4, y: e.y + 4 })) });
      const u = renderToCanvas(doc, Math.min(1, 160 / Math.max(doc.width, doc.height))).toDataURL('image/png');
      stickerThumbs.set(id, u);
      if (!cancelled) setUrl(u);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, url]);
  return url ? <img src={url} alt="" draggable={false} className="max-h-full max-w-full" /> : <span className="h-1/2 w-1/2 animate-pulse rounded bg-control" />;
}

const FRAME_SHAPES: ShapeKind[] = ['ellipse', 'rect', 'heart', 'star', 'hexagon', 'diamond', 'triangle', 'bubble'];
const SHAPES: ShapeKind[] = ['rect', 'ellipse', 'triangle', 'star', 'hexagon', 'diamond', 'heart', 'bubble'];

function ShapeGlyph({ shape }: { shape: ShapeKind }) {
  const common = { fill: 'currentColor' };
  switch (shape) {
    case 'rect':
      return <rect x="3" y="6" width="26" height="20" rx="3" {...common} />;
    case 'ellipse':
      return <circle cx="16" cy="16" r="12" {...common} />;
    case 'triangle':
      return <path d="M16 4 L29 27 H3 Z" {...common} />;
    case 'star':
      return <path d="M16 3l3.9 8.3 9.1 1.1-6.7 6.2 1.8 9L16 23.2 7.9 27.6l1.8-9L3 12.4l9.1-1.1z" {...common} />;
    case 'hexagon':
      return <path d="M29 16 22.5 27.3H9.5L3 16 9.5 4.7h13z" {...common} />;
    case 'diamond':
      return <path d="M16 3 29 16 16 29 3 16z" {...common} />;
    case 'heart':
      return <path d="M16 27C8 21 3 16.5 3 11a6.5 6.5 0 0 1 13-1 6.5 6.5 0 0 1 13 1c0 5.5-5 10-13 16z" {...common} />;
    case 'bubble':
      return <path d="M6 5h20a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H14l-6 5v-5H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" {...common} />;
  }
}

function ElementsPanel() {
  const [q, setQ] = useState('');
  const icons = Object.keys(ICONS).filter((n) => n.includes(q.trim().toLowerCase()));
  return (
    <div className="flex flex-col gap-4">
      <Group_ title="Shapes">
        <div className="grid grid-cols-4 gap-1.5">
          {SHAPES.map((s) => (
            <Tooltip key={s} label={SHAPE_LABELS[s]}>
              <button type="button" aria-label={`Add ${SHAPE_LABELS[s]}`} onClick={() => A.addShape(s)} className={`${tile} aspect-square w-full`} {...dragProps({ kind: 'shape', shape: s })}>
                <svg viewBox="0 0 32 32" className="h-7 w-7">
                  <ShapeGlyph shape={s} />
                </svg>
              </button>
            </Tooltip>
          ))}
        </div>
      </Group_>
      <Group_ title="Lines">
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => A.addLine(false)} className={`${tile} h-11 gap-2 text-xs`} {...dragProps({ kind: 'line', arrow: false })}>
            <Minus size={18} /> Line
          </button>
          <button type="button" onClick={() => A.addLine(true)} className={`${tile} h-11 gap-2 text-xs`} {...dragProps({ kind: 'line', arrow: true })}>
            <MoveRight size={18} /> Arrow
          </button>
        </div>
      </Group_>
      <Group_ title="Icons">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search icons"
          aria-label="Search icons"
          className="h-8 rounded-[8px] bg-control px-2.5 text-xs text-fg outline-none placeholder:text-subtle focus:ring-1 focus:ring-accent"
        />
        <div className="grid grid-cols-5 gap-1.5">
          {icons.map((name) => (
            <Tooltip key={name} label={name.replace(/-/g, ' ')}>
              <button type="button" aria-label={`Add ${name} icon`} onClick={() => A.addIcon(name)} className={`${tile} aspect-square w-full`} {...dragProps({ kind: 'icon', icon: name })}>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d={ICONS[name]} />
                </svg>
              </button>
            </Tooltip>
          ))}
          {!icons.length && <p className="col-span-5 text-xs text-subtle">No icons match.</p>}
        </div>
      </Group_>
      {(['Stickers', 'Badges', 'Dividers'] as const).map((cat) => (
        <Group_ key={cat} title={cat}>
          <div className={`grid gap-1.5 ${cat === 'Dividers' ? 'grid-cols-1' : 'grid-cols-3'}`}>
            {STICKERS.filter((st) => st.category === cat).map((st) => (
              <Tooltip key={st.id} label={st.label}>
                <button
                  type="button"
                  aria-label={`Add ${st.label}`}
                  onClick={() => A.addSticker(st.id)}
                  className={`${tile} w-full p-1.5 ${cat === 'Dividers' ? 'h-10' : 'aspect-square'}`}
                  {...dragProps({ kind: 'sticker', id: st.id })}
                >
                  <StickerThumb id={st.id} />
                </button>
              </Tooltip>
            ))}
          </div>
        </Group_>
      ))}
      <Group_ title="Charts">
        <div className="grid grid-cols-5 gap-1.5">
          {CHARTS.map((c) => (
            <Tooltip key={c.kind} label={`${c.label} chart`}>
              <button type="button" aria-label={`Add ${c.label} chart`} onClick={() => A.addChart(c.kind)} className={`${tile} aspect-square w-full`}>
                <c.icon size={18} />
              </button>
            </Tooltip>
          ))}
        </div>
      </Group_>
      <Group_ title="QR code">
        <button type="button" onClick={A.addQr} className={`${tile} h-11 gap-2 text-xs`}>
          <QrCode size={16} /> Add a QR code
        </button>
      </Group_>
      <Group_ title="Frames">
        <p className="-mt-1 text-2xs leading-[14px] text-subtle">Add a frame, then drop a photo onto it.</p>
        <div className="grid grid-cols-4 gap-1.5">
          {FRAME_SHAPES.map((m) => (
            <Tooltip key={m} label={`${SHAPE_LABELS[m]} frame`}>
              <button type="button" aria-label={`Add ${SHAPE_LABELS[m]} frame`} onClick={() => A.addFrame(m)} className={`${tile} aspect-square w-full border-dashed`}>
                <FrameShapeGlyph shape={m} />
              </button>
            </Tooltip>
          ))}
        </div>
      </Group_>
      <Group_ title="Images">
        <button type="button" onClick={() => pickFiles(true, (f) => void A.addImageFiles(f))} className={`${tile} h-11 gap-2 text-xs`}>
          <ImageIcon size={16} /> Add an image
        </button>
      </Group_>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Text

const COMBOS: { label: string; heading: string; body: string }[] = [
  { label: 'Modern', heading: 'montserrat', body: 'inter' },
  { label: 'Editorial', heading: 'playfair', body: 'lora' },
  { label: 'Loud', heading: 'bebas', body: 'oswald' },
  { label: 'Friendly', heading: 'pacifico', body: 'inter' },
  { label: 'Handwritten', heading: 'caveat', body: 'caveat' },
  { label: 'Technical', heading: 'mono', body: 'mono' },
];

function TextPanel() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <button type="button" onClick={() => A.addText('heading')} className={`${tile} h-14 justify-start px-3 text-[length:calc(22px*var(--text-scale))] font-bold text-fg`} style={{ fontFamily: fontOf('montserrat').css }} {...dragProps({ kind: 'text', text: 'heading' })}>
          Add a heading
        </button>
        <button type="button" onClick={() => A.addText('subheading')} className={`${tile} h-11 justify-start px-3 text-[length:calc(15px*var(--text-scale))] font-semibold text-fg`} style={{ fontFamily: fontOf('inter').css }} {...dragProps({ kind: 'text', text: 'subheading' })}>
          Add a subheading
        </button>
        <button type="button" onClick={() => A.addText('body')} className={`${tile} h-10 justify-start px-3 text-xs text-fg`} style={{ fontFamily: fontOf('inter').css }} {...dragProps({ kind: 'text', text: 'body' })}>
          Add body text
        </button>
      </div>
      <Group_ title="Font pairings">
        <div className="grid grid-cols-2 gap-1.5">
          {COMBOS.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => {
                A.addText('heading', { fontFamily: c.heading, text: c.label, bold: fontOf(c.heading).bold && c.heading !== 'caveat' });
              }}
              className={`${tile} h-[64px] flex-col gap-0.5 px-2`}
            >
              <span className="truncate text-[length:calc(17px*var(--text-scale))] leading-tight text-fg" style={{ fontFamily: fontOf(c.heading).css, fontWeight: fontOf(c.heading).bold ? 700 : 400 }}>
                {c.label}
              </span>
              <span className="truncate text-2xs text-subtle" style={{ fontFamily: fontOf(c.body).css }}>
                {fontOf(c.heading).label}
              </span>
            </button>
          ))}
        </div>
      </Group_>
      <Group_ title="Fonts">
        <div className="flex flex-col gap-0.5">
          {FONTS.map((f) => (
            <button key={f.id} type="button" onClick={() => A.addText('body', { fontFamily: f.id, text: f.label })} className="flex h-9 items-center justify-between rounded-[8px] px-2 text-left hover:bg-hover">
              <span className="text-[length:calc(15px*var(--text-scale))] text-fg" style={{ fontFamily: f.css }}>
                {f.label}
              </span>
              <span className="text-2xs text-subtle">{f.category}</span>
            </button>
          ))}
        </div>
      </Group_>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Uploads

function UploadsPanel() {
  const assets = useStudio((s) => s.assets);
  const [over, setOver] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => pickFiles(true, (f) => void A.addImageFiles(f))}
        onDragOver={(e) => {
          if ([...e.dataTransfer.types].includes('Files')) {
            e.preventDefault();
            e.stopPropagation();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
          if (files.length) void A.addImageFiles(files);
        }}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-[12px] border border-dashed px-3 py-6 text-center transition-colors ${
          over ? 'border-accent bg-accent-soft' : 'border-line-strong hover:bg-hover'
        }`}
        data-testid="upload-button"
      >
        <Upload size={18} className="text-accent" />
        <span className="text-xs font-semibold text-fg">Upload images</span>
        <span className="text-2xs text-subtle">Or drop them here, or paste with Ctrl/⌘ V</span>
      </button>
      <p className="text-2xs leading-[14px] text-subtle">Images stay on this device. They’re saved with your design in this browser only.</p>
      <Group_ title="Used in this session">
        {assets.length ? (
          <div className="grid grid-cols-2 gap-1.5">
            {assets.map((a) => (
              <AssetThumb key={a.id} id={a.id} name={a.name} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-subtle">Images you add will appear here so you can reuse them.</p>
        )}
      </Group_>
    </div>
  );
}

function AssetThumb({ id, name }: { id: string; name: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = getImage(id);
    const c = ref.current;
    if (!img || !c) return;
    const k = Math.min(1, 240 / Math.max(img.width, img.height));
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d')!.drawImage(img.source, 0, 0, c.width, c.height);
  }, [id]);
  const asset = useStudio((s) => s.assets.find((a) => a.id === id));
  return (
    <button
      type="button"
      title={name}
      onClick={() => asset && A.addAssetToCanvas(asset)}
      className="cs-checker flex aspect-square items-center justify-center overflow-hidden rounded-[10px] border border-line transition-transform hover:border-line-strong active:scale-[0.97]"
      {...dragProps({ kind: 'asset', id })}
    >
      <canvas ref={ref} className="max-h-full max-w-full" aria-label={name} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Background

export const SOLIDS = ['#ffffff', '#f5f5f7', '#1d1d1f', '#000000', '#ff3b30', '#ff9f0a', '#ffd60a', '#34c759', '#00c7be', '#0a84ff', '#5e5ce6', '#bf5af2', '#ff375f', '#fbe3c8', '#d8f3dc', '#dbeafe'];

export const GRADIENTS: Extract<StudioFill, { kind: 'gradient' }>[] = [
  { kind: 'gradient', from: '#ff9a8b', to: '#ff6a88', angle: 135 },
  { kind: 'gradient', from: '#fbe3c8', to: '#f2a7a0', angle: 135 },
  { kind: 'gradient', from: '#a1c4fd', to: '#c2e9fb', angle: 160 },
  { kind: 'gradient', from: '#1e1b4b', to: '#7c3aed', angle: 160 },
  { kind: 'gradient', from: '#0f2027', to: '#2c5364', angle: 135 },
  { kind: 'gradient', from: '#43e97b', to: '#38f9d7', angle: 135 },
  { kind: 'gradient', from: '#fa709a', to: '#fee140', angle: 120 },
  { kind: 'gradient', from: '#ff3b30', to: '#ff9f0a', angle: 120 },
];

const PATTERNS: PatternKind[] = ['dots', 'grid', 'stripes', 'checks'];

function Swatch({ fill, active, onClick, label }: { fill: StudioFill; active: boolean; onClick: () => void; label: string }) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={`aspect-square w-full rounded-[8px] transition-transform hover:scale-[1.05] ${active ? 'ring-2 ring-accent ring-offset-2 ring-offset-panel' : ''}`}
        style={{ background: studioFillCss(fill), boxShadow: 'inset 0 0 0 1px var(--border-strong)' }}
      />
    </Tooltip>
  );
}

export function BackgroundPanel() {
  const bg = useStudio((s) => s.doc?.background);
  if (!bg) return null;
  const same = (f: StudioFill) => JSON.stringify(f) === JSON.stringify(bg);
  return (
    <div className="flex flex-col gap-4">
      <Group_ title="Color">
        <div className="grid grid-cols-8 gap-1.5">
          <Swatch fill={{ kind: 'transparent' }} active={bg.kind === 'transparent'} onClick={() => A.setBackground({ kind: 'transparent' })} label="Transparent" />
          {SOLIDS.slice(0, 15).map((c) => (
            <Swatch key={c} fill={{ kind: 'solid', color: c }} active={same({ kind: 'solid', color: c })} onClick={() => A.setBackground({ kind: 'solid', color: c })} label={c} />
          ))}
        </div>
        <ColorWell label="Custom background color" value={bg.kind === 'solid' ? bg.color : '#ffffff'} onChange={(c) => A.setBackground({ kind: 'solid', color: c }, 'bg-color')} />
      </Group_>
      <Group_ title="Gradient">
        <div className="grid grid-cols-4 gap-1.5">
          {GRADIENTS.map((g, i) => (
            <Swatch key={i} fill={g} active={same(g)} onClick={() => A.setBackground(g)} label={`Gradient ${i + 1}`} />
          ))}
        </div>
        {bg.kind === 'gradient' && (
          <div className="flex flex-col gap-2 rounded-[10px] bg-window p-2">
            <div className="flex gap-1.5">
              <ColorWell label="Gradient start" value={bg.from} onChange={(c) => A.setBackground({ ...bg, from: c }, 'bg-grad')} />
              <ColorWell label="Gradient end" value={bg.to} onChange={(c) => A.setBackground({ ...bg, to: c }, 'bg-grad')} />
            </div>
            <Slider label="Angle" value={bg.angle} min={0} max={360} unit="°" onChange={(v) => A.setBackground({ ...bg, angle: v }, 'bg-grad')} />
          </div>
        )}
      </Group_>
      <Group_ title="Pattern">
        <div className="grid grid-cols-4 gap-1.5">
          {PATTERNS.map((p) => {
            const f: StudioFill = { kind: 'pattern', pattern: p, bg: '#f5f5f7', fg: '#d1d1d6', size: 40 };
            return <Swatch key={p} fill={f} active={bg.kind === 'pattern' && bg.pattern === p} onClick={() => A.setBackground(bg.kind === 'pattern' ? { ...bg, pattern: p } : f)} label={`${p} pattern`} />;
          })}
        </div>
        {bg.kind === 'pattern' && (
          <div className="flex flex-col gap-2 rounded-[10px] bg-window p-2">
            <div className="flex gap-1.5">
              <ColorWell label="Pattern background" value={bg.bg} onChange={(c) => A.setBackground({ ...bg, bg: c }, 'bg-pat')} />
              <ColorWell label="Pattern color" value={bg.fg} onChange={(c) => A.setBackground({ ...bg, fg: c }, 'bg-pat')} />
            </div>
            <Slider label="Scale" value={bg.size} min={8} max={200} unit="px" onChange={(v) => A.setBackground({ ...bg, size: v }, 'bg-pat')} />
          </div>
        )}
      </Group_>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layers

function layerIcon(e: StudioElement) {
  switch (e.type) {
    case 'text':
      return <Type size={13} />;
    case 'image':
      return <ImageIcon size={13} />;
    case 'line':
      return e.endHead || e.startHead ? <MoveRight size={13} /> : <Minus size={13} />;
    case 'icon':
      return (
        <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d={ICONS[e.icon] ?? ''} />
        </svg>
      );
    case 'chart':
      return <ChartColumn size={13} />;
    case 'qr':
      return <QrCode size={13} />;
    default:
      return <Shapes size={13} />;
  }
}

type LayerRow = { kind: 'el'; e: StudioElement; z: number; inGroup: boolean } | { kind: 'group'; gid: string; members: StudioElement[]; z: number };

function LayersPanel() {
  const { elements, selection, names } = useStudio((s) => ({ elements: s.doc?.elements ?? [], selection: s.selection, names: s.doc?.groupNames }), shallowEqual);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<{ id: string; group: boolean } | null>(null);
  const [dropZ, setDropZ] = useState<number | null>(null);
  if (!elements.length)
    return <p className="text-xs leading-[17px] text-subtle">Nothing on the canvas yet. Add text, shapes or images, and they’ll be listed here from top to bottom.</p>;

  // Top of the list = front. Group members are shown under a group row.
  const rows: LayerRow[] = [];
  const seen = new Set<string>();
  for (let z = elements.length - 1; z >= 0; z--) {
    const e = elements[z];
    if (e.groupId) {
      if (seen.has(e.groupId)) continue;
      seen.add(e.groupId);
      const members = elements.filter((x) => x.groupId === e.groupId).reverse();
      rows.push({ kind: 'group', gid: e.groupId, members, z });
      if (!collapsed.has(e.groupId)) for (const m of members) rows.push({ kind: 'el', e: m, z: elements.indexOf(m), inGroup: true });
    } else rows.push({ kind: 'el', e, z, inGroup: false });
  }

  const toggleCollapse = (gid: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(gid)) n.delete(gid);
      else n.add(gid);
      return n;
    });

  const finishDrop = () => {
    if (drag && dropZ !== null) {
      // dropZ = the element that should end up directly behind the dragged item (-1 = very back)
      const ids = new Set(drag.group ? elements.filter((x) => x.groupId === drag.id).map((x) => x.id) : [drag.id]);
      let refZ = dropZ;
      while (refZ >= 0 && ids.has(elements[refZ].id)) refZ--;
      A.moveAbove(ids, refZ >= 0 ? elements[refZ].id : null);
    }
    setDrag(null);
    setDropZ(null);
  };

  const rowDrag = (id: string, group: boolean, z: number) => ({
    draggable: renaming !== id,
    onDragStart: (ev: React.DragEvent) => {
      setDrag({ id, group });
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', id);
    },
    onDragOver: (ev: React.DragEvent) => {
      if (!drag) return;
      ev.preventDefault();
      const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
      // Dropping on the upper half puts it in front of this row.
      setDropZ(ev.clientY < r.top + r.height / 2 ? z : z - 1);
    },
    onDrop: (ev: React.DragEvent) => {
      ev.preventDefault();
      finishDrop();
    },
    onDragEnd: () => {
      setDrag(null);
      setDropZ(null);
    },
  });

  const nameInput = (initial: string, commit: (v: string) => void) => (
    <input
      autoFocus
      defaultValue={initial}
      aria-label="Layer name"
      onClick={(ev) => ev.stopPropagation()}
      onBlur={(ev) => {
        commit(ev.target.value);
        setRenaming(null);
      }}
      onKeyDown={(ev) => {
        ev.stopPropagation();
        if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
        if (ev.key === 'Escape') setRenaming(null);
      }}
      className="h-6 min-w-0 flex-1 rounded-[5px] bg-window px-1.5 text-xs text-fg outline-none ring-1 ring-accent"
    />
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-2xs leading-[14px] text-subtle">Top of the list is in front. Drag to reorder, double-click to rename. Click an item inside a group to select just that item.</p>
      <ul className="flex flex-col gap-px" role="tree" aria-label="Layers" aria-multiselectable="true">
        {rows.map((row) => {
          if (row.kind === 'group') {
            const allSel = row.members.every((m) => selection.includes(m.id));
            const hidden = row.members.every((m) => m.hidden);
            const locked = row.members.every((m) => m.locked);
            const open = !collapsed.has(row.gid);
            const name = names?.[row.gid] ?? 'Group';
            return (
              <li
                key={row.gid}
                role="treeitem"
                aria-expanded={open}
                aria-selected={allSel}
                {...rowDrag(row.gid, true, row.z)}
                onClick={(ev) => A.select([row.members[0].id], ev.shiftKey || ev.metaKey || ev.ctrlKey)}
                onDoubleClick={() => setRenaming(row.gid)}
                className={`group relative flex h-8 items-center gap-1 rounded-[7px] pr-1 pl-0.5 text-xs font-medium transition-colors ${allSel ? 'bg-accent-soft text-fg' : 'text-fg hover:bg-hover'} ${hidden ? 'opacity-50' : ''}`}
              >
                {dropZ === row.z && drag && <span className="absolute inset-x-1 -top-px h-0.5 rounded bg-accent-fill" />}
                <button
                  type="button"
                  aria-label={open ? 'Collapse group' : 'Expand group'}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    toggleCollapse(row.gid);
                  }}
                  className="flex h-6 w-5 shrink-0 items-center justify-center text-subtle hover:text-fg"
                >
                  <ChevronRight size={12} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
                </button>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-control">
                  <Group size={12} />
                </span>
                {renaming === row.gid ? nameInput(name, (v) => A.renameGroup(row.gid, v)) : <span className="min-w-0 flex-1 truncate">{name}</span>}
                <span className="text-2xs text-subtle tabular-nums">{row.members.length}</span>
                <LayerBtn label={hidden ? 'Show group' : 'Hide group'} onClick={() => A.setGroupFlag(row.gid, { hidden: !hidden })} visible={hidden}>
                  {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                </LayerBtn>
                <LayerBtn label={locked ? 'Unlock group' : 'Lock group'} onClick={() => A.setGroupFlag(row.gid, { locked: !locked })} visible={locked}>
                  {locked ? <Lock size={13} /> : <Unlock size={13} />}
                </LayerBtn>
              </li>
            );
          }
          const e = row.e;
          const active = selection.includes(e.id);
          return (
            <li
              key={e.id}
              role="treeitem"
              aria-selected={active}
              {...rowDrag(e.id, false, row.z)}
              onClick={(ev) => A.select([e.id], ev.shiftKey || ev.metaKey || ev.ctrlKey, { single: row.inGroup })}
              onDoubleClick={() => setRenaming(e.id)}
              className={`group relative flex h-8 items-center gap-1.5 rounded-[7px] pr-1 text-xs transition-colors ${row.inGroup ? 'pl-6' : 'pl-1'} ${
                active ? 'bg-accent-soft text-fg' : 'text-muted hover:bg-hover hover:text-fg'
              } ${e.hidden ? 'opacity-50' : ''} ${drag?.id === e.id ? 'opacity-40' : ''}`}
              data-z={row.z}
            >
              {dropZ === row.z && drag && <span className="absolute inset-x-1 -top-px h-0.5 rounded bg-accent-fill" />}
              <GripVertical size={12} className="shrink-0 text-subtle opacity-0 group-hover:opacity-100" />
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-control">{layerIcon(e)}</span>
              {renaming === e.id ? (
                nameInput(e.name, (v) => A.renameElement(e.id, v))
              ) : (
                <span className="min-w-0 flex-1 truncate" title={e.type === 'text' ? e.text : e.name}>
                  {e.type === 'text' && e.name === 'Text' ? e.text.split('\n')[0] || 'Text' : e.name}
                </span>
              )}
              <LayerBtn label={e.hidden ? 'Show' : 'Hide'} onClick={() => A.toggleHidden(e.id)} visible={e.hidden}>
                {e.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
              </LayerBtn>
              <LayerBtn label={e.locked ? 'Unlock' : 'Lock'} onClick={() => A.toggleLock([e.id])} visible={e.locked}>
                {e.locked ? <Lock size={13} /> : <Unlock size={13} />}
              </LayerBtn>
              <LayerBtn label="Delete" onClick={() => A.deleteElement(e.id)}>
                <Trash2 size={13} />
              </LayerBtn>
            </li>
          );
        })}
        <li
          aria-hidden="true"
          className="h-6"
          onDragOver={(ev) => {
            if (!drag) return;
            ev.preventDefault();
            setDropZ(-1);
          }}
          onDrop={(ev) => {
            ev.preventDefault();
            finishDrop();
          }}
        >
          {dropZ === -1 && drag && <span className="mx-1 block h-0.5 rounded bg-accent-fill" />}
        </li>
      </ul>
    </div>
  );
}

function LayerBtn({ label, onClick, children, visible }: { label: string; onClick: () => void; children: ReactNode; visible?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] text-subtle hover:bg-active hover:text-fg focus-visible:opacity-100 ${visible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 max-md:opacity-100'}`}
    >
      {children}
    </button>
  );
}

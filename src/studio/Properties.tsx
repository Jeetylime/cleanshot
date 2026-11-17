import { useRef, useState, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Bold,
  Check,
  ChevronDown,
  CopyPlus,
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  Group,
  Italic,
  Lock,
  Maximize,
  Minimize2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  SquarePen,
  Trash2,
  Underline,
  Ungroup,
  Unlock,
  Image as ImageIcon,
  CaseUpper,
  Ratio,
  List,
  ListOrdered,
} from 'lucide-react';
import { Section, Slider, Segmented, Toggle, NumberInput, ColorPicker, ColorWell, Button } from '../components/ui/controls';
import { styleAt } from './textEngine';
import { IconButton } from '../components/ui/IconButton';
import { Popover } from '../components/ui/Popover';
import { pickFiles } from '../tools/shared/ui';
import { getImageBlob } from '../engine/images';
import { goEditor } from '../app/route';
import * as editorActions from '../store/actions';
import { useStudio, shallowEqual, selectedElements, studio } from './store';
import * as A from './actions';
import { FONTS, fontOf } from './fonts';
import { SOLIDS } from './LeftPanel';
import { ImageExtras } from './ImageExtras';
import { getBrand, useBrand } from './brand';
import { ChartProps, QrProps } from './ExtraProps';
import { studioFillCss } from './render';

const BG_LABEL = { transparent: 'Transparent', solid: 'Solid color', gradient: 'Gradient', pattern: 'Pattern' } as const;
import { SIZE_PRESETS, MAX_CANVAS_SIDE } from './templates';
import { aabb, unionBounds } from './geometry';
import type { IconElement, ImageElement, LineElement, Shadow, ShapeElement, StudioElement, TextElement, DrawElement, Brush } from './types';
import { BRUSHES, brushOf } from './draw';

/** Swatches for color pickers: brand colors first, then the defaults. */
function palette() {
  const brand = getBrand().colors.map((c) => ({ value: c, name: `Brand ${c}` }));
  return [...brand, ...SOLIDS.filter((c) => !getBrand().colors.includes(c)).map((c) => ({ value: c, name: c }))].slice(0, 22);
}

const TYPE_LABEL: Record<StudioElement['type'], string> = { text: 'Text', shape: 'Shape', line: 'Line', image: 'Image', icon: 'Icon', chart: 'Chart', qr: 'QR code', draw: 'Drawing' };

export function Properties() {
  useBrand(); // re-render pickers when brand colors change
  const sel = useStudio((s) => selectedElements(s), shallowEqual);
  const editing = useStudio((s) => s.editingTextId);
  return (
    <aside
      aria-label="Properties"
      className="scroll-thin flex w-full shrink-0 flex-col overflow-y-auto border-line bg-panel max-lg:max-h-[42vh] max-lg:border-t lg:w-[268px] lg:border-l"
      data-testid="properties"
    >
      {sel.length === 0 ? <CanvasProps /> : <ElementProps sel={sel} editing={!!editing} />}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Nothing selected: the page

function CanvasProps() {
  const doc = useStudio((s) => s.doc);
  const [scale, setScale] = useState(true);
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  if (!doc) return null;
  return (
    <>
      <Section title="Canvas">
        <div className="flex items-center gap-1.5">
          <NumberInput ariaLabel="Canvas width" prefix="W" value={doc.width} min={16} max={MAX_CANVAS_SIDE} onChange={(w) => A.resizeCanvas(w, doc.height, scale)} />
          <NumberInput ariaLabel="Canvas height" prefix="H" value={doc.height} min={16} max={MAX_CANVAS_SIDE} onChange={(h) => A.resizeCanvas(doc.width, h, scale)} />
        </div>
        <button
          ref={anchor}
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-7 items-center justify-between rounded-[6px] bg-control px-2 text-xs text-fg hover:bg-hover"
          aria-haspopup="menu"
        >
          Resize to a preset
          <ChevronDown size={13} className="text-subtle" />
        </button>
        <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} align="start" width={236} label="Canvas presets">
          <div className="p-1" role="menu">
            {SIZE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  A.resizeCanvas(p.width, p.height, scale);
                }}
                className="flex w-full items-center justify-between rounded-[6px] px-2 py-1.5 text-left text-xs hover:bg-accent-fill hover:text-white"
              >
                <span>{p.label}</span>
                <span className="opacity-60 tabular-nums">
                  {p.width}×{p.height}
                </span>
              </button>
            ))}
          </div>
        </Popover>
        <Button onClick={() => studio.set({ dialog: 'resize' })} className="w-full">
          <Ratio size={13} /> Smart resize…
        </Button>
        <label className="flex items-center justify-between gap-2 text-xs text-muted">
          <span>Scale content with canvas</span>
          <Toggle checked={scale} onChange={setScale} label="Scale content with canvas" />
        </label>
      </Section>
      <Section title="Background">
        <button
          type="button"
          onClick={() => studio.set({ panel: 'backgrounds' })}
          className="flex h-8 items-center gap-2 rounded-[7px] bg-control px-1.5 text-xs text-fg hover:bg-hover"
          data-testid="change-background"
        >
          <span className="h-5 w-5 shrink-0 rounded-[5px]" style={{ background: studioFillCss(doc.background), boxShadow: 'inset 0 0 0 1px var(--border-strong)' }} />
          <span className="flex-1 text-left">{BG_LABEL[doc.background.kind]}</span>
          <span className="text-subtle">Change</span>
        </button>
      </Section>
      <Section>
        <p className="text-xs leading-[17px] text-subtle">Select something on the canvas to edit it. Double-click text to type, or an image to crop it.</p>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Selected elements

function ElementProps({ sel, editing }: { sel: StudioElement[]; editing: boolean }) {
  const single = sel.length === 1 ? sel[0] : null;
  const locked = sel.every((e) => e.locked);
  const canGroup = useStudio((s) => A.canGroup(s));
  const canUngroup = useStudio((s) => A.canUngroup(s));
  const title = single ? TYPE_LABEL[single.type] : `${sel.length} selected`;
  const ids = sel.map((e) => e.id);
  const same = <T,>(f: (e: StudioElement) => T) => f(sel[0]);

  return (
    <>
      <div className="flex h-11 shrink-0 items-center justify-between gap-1 border-b border-line px-3">
        <span className="truncate text-[length:calc(13px*var(--text-scale))] font-semibold text-fg">{title}</span>
        <div className="flex items-center">
          <IconButton label={locked ? 'Unlock' : 'Lock'} shortcut={['⌘', 'L']} onClick={() => A.toggleLock()} size="sm">
            {locked ? <Lock size={13} /> : <Unlock size={13} />}
          </IconButton>
          <IconButton label="Duplicate" shortcut={['⌘', 'D']} onClick={A.duplicateSelection} size="sm" disabled={locked}>
            <CopyPlus size={13} />
          </IconButton>
          <IconButton label="Delete" shortcut="⌫" onClick={A.deleteSelection} size="sm" disabled={locked}>
            <Trash2 size={13} />
          </IconButton>
        </div>
      </div>
      {locked ? (
        <Section>
          <p className="text-xs leading-[17px] text-muted">This element is locked, so it can’t be moved or edited. Unlock it to make changes.</p>
          <Button onClick={() => A.toggleLock()}>
            <Unlock size={13} /> Unlock
          </Button>
        </Section>
      ) : (
        <>
          {single?.type === 'text' && <TextProps e={single} editing={editing} />}
          {single?.type === 'shape' && <ShapeProps e={single} />}
          {single?.type === 'line' && <LineProps e={single} />}
          {single?.type === 'icon' && <IconProps e={single} />}
          {single?.type === 'image' && <ImageProps e={single} />}
          {single?.type === 'chart' && <ChartProps e={single} palette={palette()} />}
          {single?.type === 'qr' && <QrProps e={single} palette={palette()} />}
          {single?.type === 'draw' && <DrawProps e={single} />}
          {!single && sel.every((e) => e.type === sel[0].type && ['text', 'shape', 'line', 'icon', 'draw'].includes(e.type)) && <ColorForMany sel={sel} />}
          <ArrangeProps sel={sel} canGroup={canGroup} canUngroup={canUngroup} />
          <Section title="Appearance">
            <Slider label="Opacity" value={Math.round(same((e) => e.opacity) * 100)} min={0} max={100} unit="%" onChange={(v) => A.updateElements(ids, { opacity: v / 100 }, 'opacity')} />
            <ShadowProps ids={ids} shadow={sel[0].shadow} />
          </Section>
        </>
      )}
    </>
  );
}

function ColorForMany({ sel }: { sel: StudioElement[] }) {
  const ids = sel.map((e) => e.id);
  const e = sel[0];
  const value = e.type === 'shape' ? e.fill ?? '#000000' : e.type === 'text' || e.type === 'line' || e.type === 'icon' || e.type === 'draw' ? e.color : '#000000';
  return (
    <Section title="Color">
      <ColorPicker
        value={value}
        colors={palette()}
        onChange={(c) => A.updateElements(ids, (x) => (x.type === 'shape' ? { fill: c } : { color: c }) as Partial<StudioElement>, 'color')}
      />
    </Section>
  );
}

// ---- Text -------------------------------------------------------------------

export function FontSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const f = fontOf(value);
  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-label="Font"
        className="flex h-8 w-full items-center justify-between rounded-[7px] bg-control px-2.5 text-[length:calc(13px*var(--text-scale))] text-fg hover:bg-hover"
        data-testid="font-select"
      >
        <span style={{ fontFamily: f.css }}>{f.label}</span>
        <ChevronDown size={13} className="text-subtle" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} align="start" width={240} label="Fonts">
        <div className="scroll-thin max-h-[340px] overflow-y-auto p-1" role="listbox">
          {FONTS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={o.id === value}
              onClick={() => {
                setOpen(false);
                onChange(o.id);
              }}
              className={`flex h-9 w-full items-center justify-between rounded-[6px] px-2 text-left hover:bg-hover ${o.id === value ? 'bg-accent-soft' : ''}`}
            >
              <span className="text-[length:calc(16px*var(--text-scale))] text-fg" style={{ fontFamily: o.css }}>
                {o.label}
              </span>
              {o.id === value ? <Check size={13} className="text-accent" /> : <span className="text-2xs text-subtle">{o.category}</span>}
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

function ToggleIcon({ label, active, onClick, children, shortcut }: { label: string; active: boolean; onClick: () => void; children: ReactNode; shortcut?: string[] }) {
  return (
    <IconButton label={label} shortcut={shortcut} onClick={onClick} active={active} className="h-8 w-8 flex-1">
      {children}
    </IconButton>
  );
}

function TextProps({ e, editing }: { e: TextElement; editing: boolean }) {
  const up = (p: Partial<TextElement>, key?: string) => A.updateElements<TextElement>([e.id], p, key);
  const font = fontOf(e.fontFamily);
  const sel = useStudio((s) => (s.editingTextId === e.id ? s.textSel : null), shallowEqual);
  const partial = !!sel && sel.end > sel.start && !(sel.start === 0 && sel.end >= e.text.length);
  const at = partial ? styleAt(e, sel!.start) : { bold: e.bold, italic: e.italic, underline: e.underline, color: null };
  const style = (patch: Parameters<typeof A.styleText>[2], key?: string) => A.styleText(e.id, partial ? sel : null, patch, key);
  // Keep the text field focused (and its selection) while clicking style controls.
  const keepFocus = (ev: React.MouseEvent) => editing && ev.preventDefault();
  const grad = e.gradient;
  return (
    <>
      <Section title="Text">
        {!editing && (
          <Button onClick={() => A.startTextEdit(e.id)} className="w-full">
            <SquarePen size={13} /> Edit text
          </Button>
        )}
        <FontSelect value={e.fontFamily} onChange={(id) => up({ fontFamily: id })} />
        <div className="flex items-center gap-1.5">
          <NumberInput ariaLabel="Font size" value={e.fontSize} min={4} max={2000} suffix="px" onChange={(v) => up({ fontSize: v }, 'fs')} />
          <div className="flex rounded-[7px] bg-control p-0.5">
            <button type="button" aria-label="Smaller" onClick={() => up({ fontSize: Math.max(4, Math.round(e.fontSize / 1.1)) }, 'fs')} className="h-6 w-6 rounded-[5px] text-sm text-muted hover:bg-hover hover:text-fg">
              −
            </button>
            <button type="button" aria-label="Larger" onClick={() => up({ fontSize: Math.round(e.fontSize * 1.1) + 1 }, 'fs')} className="h-6 w-6 rounded-[5px] text-sm text-muted hover:bg-hover hover:text-fg">
              +
            </button>
          </div>
        </div>
        <div className="flex gap-0.5 rounded-[8px] bg-control p-0.5" onMouseDown={keepFocus}>
          <ToggleIcon label={font.bold ? 'Bold' : 'Bold (not available for this font)'} active={at.bold && font.bold} onClick={() => style({ bold: !at.bold })}>
            <Bold size={14} />
          </ToggleIcon>
          <ToggleIcon label="Italic" active={at.italic} onClick={() => style({ italic: !at.italic })}>
            <Italic size={14} />
          </ToggleIcon>
          <ToggleIcon label="Underline" active={at.underline} onClick={() => style({ underline: !at.underline })}>
            <Underline size={14} />
          </ToggleIcon>
          <ToggleIcon label="Uppercase" active={e.uppercase} onClick={() => up({ uppercase: !e.uppercase })}>
            <CaseUpper size={15} />
          </ToggleIcon>
        </div>
        <p className="-mt-1 text-2xs leading-[14px] text-subtle" aria-live="polite">
          {partial ? 'Styling the selected text.' : editing ? 'Select words to style just them.' : 'Tip: while typing, select words to style just them.'}
        </p>
        <Segmented
          ariaLabel="Alignment"
          value={e.align}
          onChange={(v) => up({ align: v })}
          options={[
            { value: 'left', label: <AlignLeft size={14} />, title: 'Align left' },
            { value: 'center', label: <AlignCenter size={14} />, title: 'Center' },
            { value: 'right', label: <AlignRight size={14} />, title: 'Align right' },
          ]}
        />
        <div onMouseDown={keepFocus}>
          <ColorPicker value={at.color ?? e.color} colors={palette()} onChange={(c) => style({ color: c }, 'color')} />
        </div>
      </Section>
      <Section title="Gradient" action={<Toggle checked={!!grad} onChange={(on) => up({ gradient: on ? { from: e.color, to: '#bf5af2', angle: 90 } : null })} label="Gradient text" />}>
        {grad && (
          <>
            <div className="flex gap-1.5">
              <ColorWell label="Gradient start" value={grad.from} onChange={(c) => up({ gradient: { ...grad, from: c } }, 'tg')} />
              <ColorWell label="Gradient end" value={grad.to} onChange={(c) => up({ gradient: { ...grad, to: c } }, 'tg')} />
            </div>
            <Slider label="Angle" value={grad.angle} min={0} max={360} unit="°" onChange={(v) => up({ gradient: { ...grad, angle: v } }, 'tg')} />
          </>
        )}
      </Section>
      <Section title="Layout">
        <Segmented
          ariaLabel="List"
          value={e.list ?? 'none'}
          onChange={(v) => up({ list: v, curve: 0 })}
          options={[
            { value: 'none', label: 'No list' },
            { value: 'bullet', label: <><List size={14} /> Bullets</> },
            { value: 'number', label: <><ListOrdered size={14} /> Numbers</> },
          ]}
        />
        <Slider label="Curve" value={e.curve ?? 0} min={-100} max={100} format={(v) => (v === 0 ? 'Off' : `${Math.round(v)}`)} onChange={(v) => up({ curve: Math.abs(v) < 2 ? 0 : v, ...(Math.abs(v) >= 2 ? { list: 'none' as const } : {}) }, 'curve')} />
      </Section>
      <Section title="Spacing">
        <Slider label="Letter spacing" value={Math.round((e.letterSpacing / e.fontSize) * 1000) / 10} min={-10} max={60} step={0.5} unit="%" onChange={(v) => up({ letterSpacing: (v / 100) * e.fontSize }, 'ls')} />
        <Slider label="Line height" value={e.lineHeight} min={0.7} max={3} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => up({ lineHeight: v }, 'lh')} />
      </Section>
      <Section title="Outline" action={<Toggle checked={e.strokeWidth > 0} onChange={(on) => up({ strokeWidth: on ? Math.max(1, Math.round(e.fontSize * 0.04)) : 0 })} label="Text outline" />}>
        {e.strokeWidth > 0 && (
          <>
            <Slider label="Width" value={e.strokeWidth} min={0.5} max={Math.max(20, e.fontSize * 0.2)} step={0.5} unit="px" onChange={(v) => up({ strokeWidth: v }, 'sw')} />
            <ColorPicker value={e.strokeColor} colors={palette()} onChange={(c) => up({ strokeColor: c }, 'sc')} />
          </>
        )}
      </Section>
    </>
  );
}

// ---- Shape / line / icon -----------------------------------------------------------

function ShapeProps({ e }: { e: ShapeElement }) {
  const up = (p: Partial<ShapeElement>, key?: string) => A.updateElements<ShapeElement>([e.id], p, key);
  const sg = e.gradient;
  return (
    <>
      <Section title="Fill" action={<Toggle checked={!!e.fill || !!sg} onChange={(on) => up({ fill: on ? '#0a84ff' : null, gradient: on ? e.gradient : null, stroke: !on && !e.stroke ? '#1d1d1f' : e.stroke, strokeWidth: !on && !e.strokeWidth ? 4 : e.strokeWidth })} label="Fill" />}>
        {(e.fill || sg) && (
          <>
            <Segmented
              ariaLabel="Fill type"
              size="sm"
              value={sg ? 'gradient' : 'solid'}
              onChange={(v) => up(v === 'gradient' ? { gradient: { from: e.fill ?? '#0a84ff', to: '#bf5af2', angle: 135 } } : { gradient: null, fill: e.fill ?? sg?.from ?? '#0a84ff' })}
              options={[
                { value: 'solid', label: 'Solid' },
                { value: 'gradient', label: 'Gradient' },
              ]}
            />
            {sg ? (
              <>
                <div className="flex gap-1.5">
                  <ColorWell label="Gradient start" value={sg.from} onChange={(c) => up({ gradient: { ...sg, from: c } }, 'sg')} />
                  <ColorWell label="Gradient end" value={sg.to} onChange={(c) => up({ gradient: { ...sg, to: c } }, 'sg')} />
                </div>
                <Slider label="Angle" value={sg.angle} min={0} max={360} unit="°" onChange={(v) => up({ gradient: { ...sg, angle: v } }, 'sg')} />
              </>
            ) : (
              e.fill && <ColorPicker value={e.fill} colors={palette()} onChange={(c) => up({ fill: c }, 'fill')} />
            )}
          </>
        )}
      </Section>
      <Section title="Border" action={<Toggle checked={!!e.stroke && e.strokeWidth > 0} onChange={(on) => up({ stroke: on ? '#1d1d1f' : null, strokeWidth: on ? Math.max(2, e.strokeWidth || 4) : 0, fill: !on && !e.fill ? '#0a84ff' : e.fill })} label="Border" />}>
        {e.stroke && e.strokeWidth > 0 && (
          <>
            <Slider label="Width" value={e.strokeWidth} min={1} max={80} unit="px" onChange={(v) => up({ strokeWidth: v }, 'sw')} />
            <ColorPicker value={e.stroke} colors={palette()} onChange={(c) => up({ stroke: c }, 'stroke')} />
          </>
        )}
      </Section>
      {e.shape === 'rect' && (
        <Section title="Corners">
          <Slider label="Radius" value={e.radius} min={0} max={Math.round(Math.min(e.w, e.h) / 2)} unit="px" onChange={(v) => up({ radius: v }, 'radius')} />
        </Section>
      )}
    </>
  );
}

function LineProps({ e }: { e: LineElement }) {
  const up = (p: Partial<LineElement>, key?: string) => A.updateElements<LineElement>([e.id], p, key);
  return (
    <Section title="Line">
      <ColorPicker value={e.color} colors={palette()} onChange={(c) => up({ color: c }, 'color')} />
      <Slider label="Thickness" value={e.strokeWidth} min={1} max={60} unit="px" onChange={(v) => up({ strokeWidth: v, h: Math.max(e.h, v * 4 + 12) }, 'sw')} />
      <Segmented
        ariaLabel="Line style"
        value={e.dash}
        onChange={(v) => up({ dash: v })}
        options={[
          { value: 'solid', label: 'Solid' },
          { value: 'dashed', label: 'Dashed' },
          { value: 'dotted', label: 'Dotted' },
        ]}
      />
      <div className="flex gap-1.5">
        <label className="flex flex-1 items-center justify-between gap-2 rounded-[7px] bg-control px-2 py-1.5 text-xs text-muted">
          Start arrow <Toggle checked={e.startHead} onChange={(v) => up({ startHead: v })} label="Start arrow" />
        </label>
        <label className="flex flex-1 items-center justify-between gap-2 rounded-[7px] bg-control px-2 py-1.5 text-xs text-muted">
          End arrow <Toggle checked={e.endHead} onChange={(v) => up({ endHead: v })} label="End arrow" />
        </label>
      </div>
    </Section>
  );
}

function DrawProps({ e }: { e: DrawElement }) {
  const up = (p: Partial<DrawElement>, key?: string) => A.updateElements<DrawElement>([e.id], p, key);
  return (
    <Section title="Drawing">
      <Segmented<Brush>
        ariaLabel="Brush"
        value={e.brush}
        onChange={(b) => up({ brush: b, name: brushOf(b).label, opacity: brushOf(b).opacity })}
        options={BRUSHES.map((b) => ({ value: b.id, label: b.label }))}
      />
      <ColorPicker value={e.color} colors={palette()} onChange={(c) => up({ color: c }, 'color')} />
      <Slider label="Thickness" value={e.strokeWidth} min={1} max={120} unit="px" onChange={(v) => up({ strokeWidth: v }, 'sw')} />
    </Section>
  );
}

function IconProps({ e }: { e: IconElement }) {
  const up = (p: Partial<IconElement>, key?: string) => A.updateElements<IconElement>([e.id], p, key);
  return (
    <Section title="Icon">
      <ColorPicker value={e.color} colors={palette()} onChange={(c) => up({ color: c }, 'color')} />
      <Slider label="Stroke" value={e.weight} min={0.5} max={4} step={0.25} format={(v) => v.toFixed(2)} onChange={(v) => up({ weight: v }, 'weight')} />
      <label className="flex items-center justify-between text-xs text-muted">
        Filled <Toggle checked={e.filled} onChange={(v) => up({ filled: v })} label="Filled" />
      </label>
    </Section>
  );
}

// ---- Image -------------------------------------------------------------------

function ImageProps({ e }: { e: ImageElement }) {
  const cropping = useStudio((s) => s.cropId === e.id);
  const up = (p: Partial<ImageElement>, key?: string) => A.updateElements<ImageElement>([e.id], p, key);
  const annotate = async () => {
    try {
      const blob = await getImageBlob(e.assetId);
      goEditor();
      await editorActions.openImageBlob(blob, `${e.name}.png`);
      editorActions.showToast('Opened in Edit. Use “Send to Canvas” to bring it back.', 'info');
    } catch {
      editorActions.showToast('Couldn’t open this image.', 'error');
    }
  };
  return (
    <>
      {e.assetId && (
      <Section title="Image">
        <Button variant={cropping ? 'primary' : 'secondary'} onClick={() => A.setCropMode(cropping ? null : e.id)} className="w-full">
          <Crop size={13} /> {cropping ? 'Done cropping' : 'Crop'}
        </Button>
        {cropping && <p className="-mt-1 text-2xs leading-[14px] text-subtle">Drag the edges to trim, drag inside to reposition. Press Enter when done.</p>}
        <div className="grid grid-cols-3 gap-1">
          <Button onClick={() => A.imageFit(e.id, 'fill')} title="Crop the image to fill its frame">
            <Maximize size={12} /> Fill
          </Button>
          <Button onClick={() => A.imageFit(e.id, 'fit')} title="Show the whole image">
            <Minimize2 size={12} /> Fit
          </Button>
          <Button onClick={() => A.imageFit(e.id, 'canvas')} title="Cover the whole canvas">
            <ImageIcon size={12} /> Page
          </Button>
        </div>
        <div className="flex gap-1">
          <IconButton label="Flip horizontally" active={e.flipX} onClick={() => up({ flipX: !e.flipX })} className="h-8 flex-1 bg-control">
            <FlipHorizontal2 size={14} />
          </IconButton>
          <IconButton label="Flip vertically" active={e.flipY} onClick={() => up({ flipY: !e.flipY })} className="h-8 flex-1 bg-control">
            <FlipVertical2 size={14} />
          </IconButton>
          <IconButton label="Rotate left" onClick={() => A.rotateBy(-90)} className="h-8 flex-1 bg-control">
            <RotateCcw size={14} />
          </IconButton>
          <IconButton label="Rotate right" onClick={() => A.rotateBy(90)} className="h-8 flex-1 bg-control">
            <RotateCw size={14} />
          </IconButton>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <Button onClick={() => pickFiles(false, (f) => f[0] && void A.replaceImage(e.id, f[0]))}>
            <RefreshCw size={12} /> Replace
          </Button>
          <Button onClick={() => void annotate()} title="Annotate, blur or redact this image in Edit, then send it back">
            <SquarePen size={12} /> Annotate
          </Button>
        </div>
      </Section>
      )}
      <ImageExtras e={e} />
      <Section title="Corners & border">
        <Slider label="Corner radius" value={e.radius} min={0} max={Math.round(Math.min(e.w, e.h) / 2)} unit="px" onChange={(v) => up({ radius: v }, 'radius')} />
        <Slider label="Border" value={e.borderWidth} min={0} max={Math.max(40, Math.round(Math.min(e.w, e.h) / 8))} unit="px" onChange={(v) => up({ borderWidth: v }, 'bw')} />
        {e.borderWidth > 0 && <ColorPicker value={e.borderColor} colors={palette()} onChange={(c) => up({ borderColor: c }, 'bc')} />}
      </Section>
    </>
  );
}

// ---- Common ----------------------------------------------------------------

function ArrangeProps({ sel, canGroup, canUngroup }: { sel: StudioElement[]; canGroup: boolean; canUngroup: boolean }) {
  const single = sel.length === 1 ? sel[0] : null;
  const box = single ? { x: single.x, y: single.y, w: single.w, h: single.h } : unionBounds(sel)!;
  const ids = sel.map((e) => e.id);
  const setBox = (p: Partial<{ x: number; y: number; w: number; h: number }>) => {
    if (single) {
      A.updateElements<StudioElement>([single.id], p as never);
      return;
    }
    const dx = (p.x ?? box.x) - box.x;
    const dy = (p.y ?? box.y) - box.y;
    A.updateElements(ids, (e) => ({ x: e.x + dx, y: e.y + dy }));
  };
  return (
    <Section title="Position">
      <div className="grid grid-cols-2 gap-1.5">
        <NumberInput ariaLabel="X" prefix="X" value={box.x} min={-100000} onChange={(v) => setBox({ x: v })} />
        <NumberInput ariaLabel="Y" prefix="Y" value={box.y} min={-100000} onChange={(v) => setBox({ y: v })} />
        {single && (
          <>
            <NumberInput ariaLabel="Width" prefix="W" value={box.w} min={1} onChange={(v) => setBox({ w: v })} />
            {single.type === 'text' ? (
              <NumberInput ariaLabel="Rotation" prefix="↻" suffix="°" value={single.rotation} min={-360} max={360} onChange={(v) => A.updateElements(ids, { rotation: ((v % 360) + 360) % 360 })} />
            ) : (
              <NumberInput ariaLabel="Height" prefix="H" value={box.h} min={1} onChange={(v) => setBox({ h: v })} />
            )}
            {single.type !== 'text' && (
              <NumberInput ariaLabel="Rotation" prefix="↻" suffix="°" value={single.rotation} min={-360} max={360} onChange={(v) => A.updateElements(ids, { rotation: ((v % 360) + 360) % 360 })} />
            )}
          </>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">{single || sel.every((e) => e.groupId && e.groupId === sel[0].groupId) ? 'Align to page' : 'Align'}</span>
        <div className="flex gap-0.5 rounded-[8px] bg-control p-0.5">
          <IconButton label="Align left" onClick={() => A.align('left')} className="flex-1">
            <AlignStartVertical size={14} />
          </IconButton>
          <IconButton label="Align centers horizontally" onClick={() => A.align('hcenter')} className="flex-1">
            <AlignCenterVertical size={14} />
          </IconButton>
          <IconButton label="Align right" onClick={() => A.align('right')} className="flex-1">
            <AlignEndVertical size={14} />
          </IconButton>
          <IconButton label="Align top" onClick={() => A.align('top')} className="flex-1">
            <AlignStartHorizontal size={14} />
          </IconButton>
          <IconButton label="Align middles" onClick={() => A.align('vcenter')} className="flex-1">
            <AlignCenterHorizontal size={14} />
          </IconButton>
          <IconButton label="Align bottom" onClick={() => A.align('bottom')} className="flex-1">
            <AlignEndHorizontal size={14} />
          </IconButton>
        </div>
        {sel.length >= 3 && (
          <div className="flex gap-1">
            <Button onClick={() => A.distribute('x')} className="flex-1">
              <AlignHorizontalDistributeCenter size={13} /> Space horizontally
            </Button>
            <Button onClick={() => A.distribute('y')} className="flex-1">
              <AlignVerticalDistributeCenter size={13} /> Vertically
            </Button>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">Layer</span>
        <div className="flex gap-0.5 rounded-[8px] bg-control p-0.5">
          <IconButton label="Bring to front" shortcut={['⌘', '⇧', ']']} onClick={() => A.reorder('front')} className="flex-1">
            <ArrowUpToLine size={14} />
          </IconButton>
          <IconButton label="Bring forward" shortcut={['⌘', ']']} onClick={() => A.reorder('forward')} className="flex-1">
            <ArrowUp size={14} />
          </IconButton>
          <IconButton label="Send backward" shortcut={['⌘', '[']} onClick={() => A.reorder('backward')} className="flex-1">
            <ArrowDown size={14} />
          </IconButton>
          <IconButton label="Send to back" shortcut={['⌘', '⇧', '[']} onClick={() => A.reorder('back')} className="flex-1">
            <ArrowDownToLine size={14} />
          </IconButton>
        </div>
      </div>
      {(canGroup || canUngroup) && (
        <div className="flex gap-1">
          {canGroup && (
            <Button onClick={A.groupSelection} className="flex-1">
              <Group size={13} /> Group
            </Button>
          )}
          {canUngroup && (
            <Button onClick={A.ungroupSelection} className="flex-1">
              <Ungroup size={13} /> Ungroup
            </Button>
          )}
        </div>
      )}
      {!single && <span className="text-2xs text-subtle tabular-nums">Selection {Math.round(box.w)} × {Math.round(box.h)} px</span>}
    </Section>
  );
}

function ShadowProps({ ids, shadow }: { ids: string[]; shadow: Shadow }) {
  const up = (p: Partial<Shadow>, key?: string) => A.updateElements(ids, (e) => ({ shadow: { ...e.shadow, ...p } }), key);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center justify-between text-xs text-muted">
        Shadow <Toggle checked={shadow.enabled} onChange={(v) => up({ enabled: v })} label="Shadow" />
      </label>
      {shadow.enabled && (
        <div className="flex flex-col gap-3 rounded-[10px] bg-window p-2.5">
          <Slider label="Blur" value={shadow.blur} min={0} max={120} unit="px" onChange={(v) => up({ blur: v }, 'sh-blur')} />
          <Slider label="Offset X" value={shadow.x} min={-100} max={100} unit="px" onChange={(v) => up({ x: v }, 'sh-x')} />
          <Slider label="Offset Y" value={shadow.y} min={-100} max={100} unit="px" onChange={(v) => up({ y: v }, 'sh-y')} />
          <Slider label="Strength" value={Math.round(shadow.opacity * 100)} min={0} max={100} unit="%" onChange={(v) => up({ opacity: v / 100 }, 'sh-o')} />
          <ColorPicker value={shadow.color} colors={palette().slice(0, 8)} onChange={(c) => up({ color: c }, 'sh-c')} />
        </div>
      )}
    </div>
  );
}

export function useSelectionBox() {
  return useStudio((s) => {
    const sel = selectedElements(s);
    return sel.length ? unionBounds(sel) : null;
  }, shallowEqual);
}

export { aabb, studio };

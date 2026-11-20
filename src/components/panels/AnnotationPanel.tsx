import { useState, useSyncExternalStore } from 'react';
import { ArrowDownToLine, ArrowUpToLine, BookmarkPlus, CopyPlus, Trash2, MoveRight, MoveHorizontal, Minus, Pipette, Spline, X } from 'lucide-react';
import { useEditor, shallowEqual } from '../../store/store';
import * as actions from '../../store/actions';
import { styleGroupOf, type StyleGroup } from '../../store/factory';
import { TYPE_LABELS } from '../../engine/annotations';
import type { Annotation, AnnotationType, ToolId } from '../../types';
import { ColorPicker, Section, Segmented, Slider, ToggleRow } from '../ui/controls';
import { IconButton } from '../ui/IconButton';
import { modKey } from '../../lib/utils';

const HIGHLIGHT_COLORS = [
  { value: '#ffd60a', name: 'Yellow' },
  { value: '#5ef38c', name: 'Green' },
  { value: '#64d2ff', name: 'Cyan' },
  { value: '#ff8ad8', name: 'Pink' },
  { value: '#ff9f0a', name: 'Orange' },
  { value: '#bf9bff', name: 'Violet' },
];

const REDACT_COLORS = [
  { value: '#111114', name: 'Black' },
  { value: '#3a3a3c', name: 'Graphite' },
  { value: '#8e8e93', name: 'Gray' },
  { value: '#ffffff', name: 'White' },
  { value: '#ff3b30', name: 'Red' },
  { value: '#0a84ff', name: 'Blue' },
];

type Values = Record<string, unknown>;

interface PanelModel {
  title: string;
  groups: Set<StyleGroup>;
  types: Set<AnnotationType>;
  keys: Set<string>;
  values: Values;
  selectionCount: number;
  isToolDefaults: boolean;
}

function toolGroup(tool: ToolId): StyleGroup | null {
  switch (tool) {
    case 'arrow':
    case 'rect':
    case 'ellipse':
    case 'pen':
    case 'text':
    case 'step':
    case 'highlighter':
    case 'magnify':
    case 'measure':
    case 'blur':
    case 'pixelate':
    case 'redact':
      return tool;
    default:
      return null;
  }
}

function excludedKeys(type: AnnotationType | StyleGroup): string[] {
  switch (type) {
    case 'blur':
    case 'pixelate':
      return ['color', 'opacity'];
    case 'redact':
      return ['intensity', 'opacity'];
    default:
      return [];
  }
}

function useModel(): PanelModel | null {
  return useEditor(
    (s) => {
      const sel = s.doc && s.selection.length ? s.doc.annotations.filter((a) => s.selection.includes(a.id)) : [];
      if (sel.length) {
        const types = new Set(sel.map((a) => a.type));
        const groups = new Set(sel.map(styleGroupOf));
        // Keys common to every selected annotation.
        let keys = new Set(Object.keys(sel[0]));
        for (const a of sel.slice(1)) keys = new Set([...keys].filter((k) => k in a));
        for (const t of types) excludedKeys(t).forEach((k) => keys.delete(k));
        const title = types.size === 1 ? TYPE_LABELS[sel[0].type] : `${sel.length} objects`;
        return {
          title: sel.length > 1 && types.size === 1 ? `${sel.length} × ${title}` : title,
          groups,
          types,
          keys,
          values: sel[0] as unknown as Values,
          selectionCount: sel.length,
          isToolDefaults: false,
        };
      }
      const g = toolGroup(s.tool);
      if (!g) return null;
      const st = s.styles[g] as unknown as Values;
      const keys = new Set(Object.keys(st));
      if (g !== 'blur' && g !== 'pixelate') keys.add('color');
      excludedKeys(g).forEach((k) => keys.delete(k));
      const values: Values = { ...st };
      if (!('color' in st)) values.color = s.styles.color;
      return {
        title: g === 'highlighter' ? 'Highlighter' : TYPE_LABELS[g as AnnotationType] ?? g,
        groups: new Set([g]),
        types: new Set(),
        keys,
        values,
        selectionCount: 0,
        isToolDefaults: true,
      };
    },
    (a, b) =>
      a === b ||
      (!!a &&
        !!b &&
        a.title === b.title &&
        a.selectionCount === b.selectionCount &&
        a.isToolDefaults === b.isToolDefaults &&
        shallowEqual(a.values, b.values) &&
        shallowEqual([...a.keys], [...b.keys])),
  );
}

function strokeRange(groups: Set<StyleGroup>): [number, number] {
  if (groups.has('highlighter')) return [4, 60];
  if (groups.has('pen')) return [1, 30];
  return [1, 24];
}

export function AnnotationPanel() {
  const m = useModel();
  if (!m) return null;
  const v = m.values;
  const has = (k: string) => m.keys.has(k);
  const only = (g: StyleGroup) => m.groups.size === 1 && m.groups.has(g);
  const colors = only('highlighter') ? HIGHLIGHT_COLORS : only('redact') ? REDACT_COLORS : undefined;
  const [smin, smax] = strokeRange(m.groups);
  const isText = m.types.has('text') || (m.isToolDefaults && m.groups.has('text'));
  const privacyOnly = [...m.groups].every((g) => g === 'blur' || g === 'pixelate' || g === 'redact');

  return (
    <>
      <Section>
        {has('color') && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Color</span>
              <IconButton label="Pick a color from the image" onClick={actions.startEyedropper} className="!h-[24px] !w-[24px]">
                <Pipette size={13} />
              </IconButton>
            </div>
            <ColorPicker value={String(v.color)} onChange={(color) => actions.applyStyle({ color })} colors={colors} />
          </div>
        )}

        {has('strokeWidth') && (
          <Slider
            label={only('highlighter') ? 'Size' : 'Thickness'}
            value={Number(v.strokeWidth)}
            min={smin}
            max={smax}
            unit="px"
            onChange={(strokeWidth) => actions.applyStyle({ strokeWidth: Math.round(strokeWidth) })}
          />
        )}

        {has('heads') && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Style</span>
            <Segmented
              ariaLabel="Arrow heads"
              value={v.heads as 'end' | 'both' | 'none'}
              onChange={(heads) => actions.applyStyle({ heads })}
              options={[
                { value: 'end', label: <MoveRight size={15} />, title: 'Arrow' },
                { value: 'both', label: <MoveHorizontal size={15} />, title: 'Double arrow' },
                { value: 'none', label: <Minus size={15} />, title: 'Line' },
              ]}
            />
          </div>
        )}

        {m.types.has('arrow') && m.selectionCount === 1 && v.heads !== 'none' && (
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-xs text-muted">{Number(v.curve) ? 'Curved' : 'Drag the middle handle to curve it'}</span>
            {!!Number(v.curve) && (
              <button type="button" className="h-[24px] shrink-0 text-xs font-medium text-accent hover:underline" onClick={actions.straightenArrows}>
                <Spline size={12} className="mr-1 inline" />
                Straighten
              </button>
            )}
          </div>
        )}

        {has('zoom') && (
          <Slider label="Zoom" value={Number(v.zoom)} min={1.5} max={6} step={0.5} unit="×" onChange={(zoom) => actions.applyStyle({ zoom: Math.round(zoom * 2) / 2 })} />
        )}

        {has('shape') && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Lens</span>
            <Segmented
              ariaLabel="Lens shape"
              value={v.shape as 'circle' | 'rounded'}
              onChange={(shape) => actions.applyStyle({ shape })}
              options={[
                { value: 'circle', label: 'Circle' },
                { value: 'rounded', label: 'Rounded' },
              ]}
            />
          </div>
        )}

        {has('fill') && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Fill</span>
            <Segmented
              ariaLabel="Fill"
              value={v.fill as 'none' | 'tint' | 'solid'}
              onChange={(fill) => actions.applyStyle({ fill })}
              options={[
                { value: 'none', label: 'Outline' },
                { value: 'tint', label: 'Tint' },
                { value: 'solid', label: 'Solid' },
              ]}
            />
          </div>
        )}

        {has('radius') && (
          <Slider
            label="Corner radius"
            value={Number(v.radius)}
            min={0}
            max={48}
            unit="px"
            onChange={(radius) => actions.applyStyle({ radius: Math.round(radius) })}
          />
        )}

        {has('fontSize') && (
          <Slider
            label="Font size"
            value={Number(v.fontSize)}
            min={8}
            max={160}
            unit="px"
            onChange={(fontSize) => actions.applyStyle({ fontSize: Math.round(fontSize) })}
          />
        )}

        {has('weight') && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Weight</span>
            <Segmented
              ariaLabel="Font weight"
              value={v.weight as 400 | 600 | 800}
              onChange={(weight) => actions.applyStyle({ weight })}
              options={[
                { value: 400, label: <span className="font-normal">Regular</span> },
                { value: 600, label: <span className="font-semibold">Semibold</span> },
                { value: 800, label: <span className="font-extrabold">Bold</span> },
              ]}
            />
          </div>
        )}

        {has('style') && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Appearance</span>
            <Segmented
              ariaLabel="Text style"
              value={v.style as 'plain' | 'outline' | 'filled'}
              onChange={(style) => actions.applyStyle({ style })}
              options={[
                { value: 'plain', label: 'Plain' },
                { value: 'outline', label: 'Outline' },
                { value: 'filled', label: 'Label' },
              ]}
            />
          </div>
        )}

        {has('size') && (
          <Slider
            label="Size"
            value={Number(v.size)}
            min={16}
            max={96}
            unit="px"
            onChange={(size) => actions.applyStyle({ size: Math.round(size) })}
          />
        )}

        {has('intensity') && (
          <Slider
            label={only('pixelate') ? 'Block size' : 'Blur strength'}
            value={Number(v.intensity)}
            min={1}
            max={100}
            onChange={(intensity) => actions.applyStyle({ intensity: Math.round(intensity) })}
          />
        )}

        {has('mode') && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Shape</span>
            <Segmented
              ariaLabel="Highlighter shape"
              value={v.mode as 'stroke' | 'box' | 'spotlight'}
              onChange={(mode) => actions.applyStyle({ mode })}
              options={[
                { value: 'stroke', label: 'Marker' },
                { value: 'box', label: 'Area' },
                { value: 'spotlight', label: 'Spotlight' },
              ]}
            />
          </div>
        )}

        {has('opacity') && (
          <Slider
            label="Opacity"
            value={Math.round(Number(v.opacity) * 100)}
            min={10}
            max={100}
            unit="%"
            onChange={(o) => actions.applyStyle({ opacity: Math.round(o) / 100 })}
          />
        )}

        {has('shadow') && (
          <ToggleRow label="Drop shadow" checked={Boolean(v.shadow)} onChange={(shadow) => actions.applyStyle({ shadow })} />
        )}

        {privacyOnly && (
          <p className="rounded-[7px] bg-accent-soft px-2.5 py-2 text-xs leading-[16px] text-muted">
            Pixels under this region are replaced in the export — the original content can’t be recovered.
          </p>
        )}
        {isText && m.selectionCount === 1 && <p className="text-xs text-subtle">Double-click the text to edit it.</p>}
      </Section>

      {m.groups.size === 1 && !privacyOnly && <PresetSection group={[...m.groups][0]} values={v} />}
            {m.selectionCount > 0 && <ArrangeSection />}
    </>
  );
}

function ArrangeSection() {
  return (
    <Section title="Arrange">
      <div className="flex items-center gap-1">
        <IconButton label="Duplicate" shortcut={[modKey, 'D']} onClick={actions.duplicateSelection}>
          <CopyPlus size={15} />
        </IconButton>
        <IconButton label="Bring to front" onClick={() => actions.arrange('front')}>
          <ArrowUpToLine size={15} />
        </IconButton>
        <IconButton label="Send to back" onClick={() => actions.arrange('back')}>
          <ArrowDownToLine size={15} />
        </IconButton>
        <div className="flex-1" />
        <IconButton label="Delete" shortcut="⌫" onClick={actions.deleteSelection} className="hover:!text-danger">
          <Trash2 size={15} />
        </IconButton>
      </div>
    </Section>
  );
}

export function selectionTitle(a: Annotation[]): string {
  if (!a.length) return '';
  return a.length === 1 ? TYPE_LABELS[a[0].type] : `${a.length} objects`;
}

function PresetSection({ group, values }: { group: StyleGroup; values: Values }) {
  const all = useSyncExternalStore(actions.subscribePresets, actions.getPresets);
  const presets = all.filter((p) => p.group === group);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const save = () => {
    actions.savePreset(name || `Style ${presets.length + 1}`, group, values);
    setNaming(false);
    setName('');
  };
  return (
    <Section title="Saved styles">
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <span key={p.id} className="flex items-center rounded-full border border-line bg-control text-xs">
              <button type="button" onClick={() => actions.applyPreset(p.id)} className="flex h-[24px] items-center gap-1.5 rounded-l-full pr-1 pl-2 hover:bg-hover">
                {p.values.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.values.color, boxShadow: 'inset 0 0 0 1px var(--border-strong)' }} />}
                {p.name}
              </button>
              <button type="button" aria-label={`Delete style ${p.name}`} onClick={() => actions.deletePreset(p.id)} className="flex h-[24px] w-[24px] items-center justify-center rounded-r-full text-muted hover:bg-hover hover:text-fg">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {naming ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            autoFocus
            aria-label="Style name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setNaming(false)}
            placeholder="Style name"
            className="h-[26px] min-w-0 flex-1 rounded-[6px] border border-line bg-control px-2 text-xs text-fg outline-none focus:border-accent"
          />
          <button type="submit" className="h-[26px] shrink-0 rounded-[6px] bg-accent-fill px-2.5 text-xs font-medium text-white">
            Save
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setNaming(true)} className="flex h-[24px] items-center gap-1.5 self-start text-xs font-medium text-accent hover:underline">
          <BookmarkPlus size={13} /> Save this style
        </button>
      )}
    </Section>
  );
}

import { uid } from '../lib/utils';
import { layoutText, naturalTextWidth } from './render';
import { syncPages } from './pages';
import { NO_ADJUST } from './imageFx';
import { CHART_COLORS } from './extraRender';
import type { ChartElement, ChartKind, QrElement, TableElement, IconElement, ImageElement, LineElement, Shadow, ShapeElement, ShapeKind, StudioDoc, StudioElement, StudioFill, TextElement } from './types';

export const DEFAULT_SHADOW: Shadow = { enabled: false, color: '#000000', blur: 24, x: 0, y: 10, opacity: 0.3 };

function base(name: string, x: number, y: number, w: number, h: number) {
  return {
    id: uid('el'),
    name,
    x,
    y,
    w,
    h,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    groupId: null,
    shadow: { ...DEFAULT_SHADOW },
  };
}

/** Keep a text box's height equal to its laid-out text. */
export function fitText(e: TextElement): TextElement {
  const L = layoutText(e);
  if (L.width !== undefined) {
    // Curved text: the box follows the arc, keeping its center in place.
    if (Math.abs(L.width - e.w) < 0.01 && Math.abs(L.height - e.h) < 0.01) return e;
    return { ...e, x: e.x + (e.w - L.width) / 2, y: e.y + (e.h - L.height) / 2, w: L.width, h: L.height };
  }
  const h = L.height;
  return Math.abs(h - e.h) < 0.01 ? e : { ...e, h };
}

export function normalize<T extends StudioElement>(e: T): T {
  return (e.type === 'text' ? fitText(e) : e) as T;
}

export type TextKind = 'heading' | 'subheading' | 'body';

export function makeText(
  doc: Pick<StudioDoc, 'width' | 'height'>,
  over: Partial<TextElement> & { kind?: TextKind } = {},
): TextElement {
  const { kind = 'body', ...rest } = over;
  const m = Math.min(doc.width, doc.height);
  const presets: Record<TextKind, Partial<TextElement>> = {
    heading: { name: 'Heading', text: 'Add a heading', fontFamily: 'montserrat', fontSize: Math.round(m * 0.085), bold: true, lineHeight: 1.1 },
    subheading: { name: 'Subheading', text: 'Add a subheading', fontFamily: 'inter', fontSize: Math.round(m * 0.05), bold: true, lineHeight: 1.2 },
    body: { name: 'Text', text: 'Add a little bit of body text', fontFamily: 'inter', fontSize: Math.round(m * 0.032), bold: false, lineHeight: 1.4 },
  };
  const e: TextElement = {
    ...base('Text', 0, 0, 100, 10),
    type: 'text',
    text: '',
    fontFamily: 'inter',
    fontSize: 48,
    bold: false,
    italic: false,
    underline: false,
    color: '#1d1d1f',
    align: 'center',
    letterSpacing: 0,
    lineHeight: 1.25,
    strokeWidth: 0,
    strokeColor: '#ffffff',
    uppercase: false,
    ...presets[kind],
    ...rest,
  };
  if (over.w === undefined) e.w = Math.min(doc.width * 0.86, naturalTextWidth(e));
  if (over.x === undefined) e.x = (doc.width - e.w) / 2;
  const fitted = fitText(e);
  if (over.y === undefined) fitted.y = (doc.height - fitted.h) / 2;
  return fitted;
}

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rect: 'Rectangle',
  ellipse: 'Circle',
  triangle: 'Triangle',
  star: 'Star',
  hexagon: 'Hexagon',
  diamond: 'Diamond',
  heart: 'Heart',
  bubble: 'Speech bubble',
};

export function makeShape(doc: Pick<StudioDoc, 'width' | 'height'>, shape: ShapeKind, over: Partial<ShapeElement> = {}): ShapeElement {
  const s = Math.round(Math.min(doc.width, doc.height) * 0.3);
  const w = shape === 'rect' ? Math.round(s * 1.3) : s;
  const h = shape === 'bubble' ? Math.round(s * 0.85) : s;
  return {
    ...base(SHAPE_LABELS[shape], (doc.width - w) / 2, (doc.height - h) / 2, w, h),
    type: 'shape',
    shape,
    fill: '#0a84ff',
    stroke: null,
    strokeWidth: 0,
    radius: shape === 'rect' ? Math.round(s * 0.08) : 0,
    ...over,
  };
}

export function makeLine(doc: Pick<StudioDoc, 'width' | 'height'>, arrow: boolean, over: Partial<LineElement> = {}): LineElement {
  const w = Math.round(doc.width * 0.4);
  const sw = Math.max(2, Math.round(Math.min(doc.width, doc.height) * 0.008));
  const h = Math.max(sw * 4 + 12, 24);
  return {
    ...base(arrow ? 'Arrow' : 'Line', (doc.width - w) / 2, (doc.height - h) / 2, w, h),
    type: 'line',
    color: '#1d1d1f',
    strokeWidth: sw,
    dash: 'solid',
    startHead: false,
    endHead: arrow,
    ...over,
  };
}

export function makeIcon(doc: Pick<StudioDoc, 'width' | 'height'>, icon: string, over: Partial<IconElement> = {}): IconElement {
  const s = Math.round(Math.min(doc.width, doc.height) * 0.18);
  return {
    ...base(icon.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), (doc.width - s) / 2, (doc.height - s) / 2, s, s),
    type: 'icon',
    icon,
    color: '#1d1d1f',
    weight: 2,
    filled: false,
    ...over,
  };
}

export function makeImage(
  doc: Pick<StudioDoc, 'width' | 'height'>,
  asset: { id: string; width: number; height: number; name?: string },
  over: Partial<ImageElement> = {},
): ImageElement {
  const k = Math.min(1, (doc.width * 0.7) / asset.width, (doc.height * 0.7) / asset.height);
  const w = Math.max(1, asset.width * k);
  const h = Math.max(1, asset.height * k);
  return {
    ...base(asset.name?.replace(/\.[^.]+$/, '') || 'Image', (doc.width - w) / 2, (doc.height - h) / 2, w, h),
    type: 'image',
    assetId: asset.id,
    crop: { x: 0, y: 0, w: asset.width, h: asset.height },
    flipX: false,
    flipY: false,
    radius: 0,
    borderWidth: 0,
    borderColor: '#ffffff',
    adjust: { ...NO_ADJUST },
    mask: null,
    ...over,
  };
}

/** An empty frame: a shaped placeholder you drop a photo into. */
export function makeFrame(doc: Pick<StudioDoc, 'width' | 'height'>, mask: ShapeKind): ImageElement {
  const s = Math.round(Math.min(doc.width, doc.height) * 0.42);
  const w = mask === 'rect' ? Math.round(s * 1.25) : s;
  return makeImage(doc, { id: '', width: w, height: s, name: `${SHAPE_LABELS[mask]} frame` }, { mask, w, h: s, x: (doc.width - w) / 2, y: (doc.height - s) / 2, radius: mask === 'rect' ? Math.round(s * 0.06) : 0 });
}

export function makeChart(doc: Pick<StudioDoc, 'width' | 'height'>, chart: ChartKind): ChartElement {
  const w = Math.round(Math.min(doc.width, doc.height) * 0.6);
  const h = chart === 'pie' || chart === 'donut' ? Math.round(w * 0.62) : Math.round(w * 0.7);
  return {
    ...base(`${chart[0].toUpperCase()}${chart.slice(1)} chart`, (doc.width - w) / 2, (doc.height - h) / 2, w, h),
    type: 'chart',
    chart,
    data: [
      { label: 'Q1', value: 12 },
      { label: 'Q2', value: 19 },
      { label: 'Q3', value: 15 },
      { label: 'Q4', value: 26 },
    ],
    colors: [...CHART_COLORS],
    textColor: '#1d1d1f',
    fontFamily: 'inter',
    showLabels: true,
    showValues: true,
  };
}

export function makeTable(doc: Pick<StudioDoc, 'width' | 'height'>, rows = 4, cols = 3): TableElement {
  const w = Math.round(Math.min(doc.width * 0.7, doc.height * 1.1));
  const fontSize = Math.max(12, Math.round(w / 26));
  const h = Math.round(rows * fontSize * 2.4);
  const cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (r === 0 ? ['Plan', 'Price', 'Users'][c] ?? `Column ${c + 1}` : ([['Starter', '$9', '1'], ['Team', '$29', '10'], ['Business', '$79', 'Unlimited']][r - 1]?.[c] ?? ''))));
  return {
    ...base('Table', (doc.width - w) / 2, (doc.height - h) / 2, w, h),
    type: 'table',
    cells,
    header: true,
    fontFamily: 'inter',
    fontSize,
    textColor: '#1d1d1f',
    headerBg: '#1d1d1f',
    headerColor: '#ffffff',
    stripe: '#f2f2f5',
    cellBg: '#ffffff',
    borderColor: '#d2d2d7',
    borderWidth: 1,
    align: 'left',
    radius: 8,
  };
}

export function makeQr(doc: Pick<StudioDoc, 'width' | 'height'>, data = 'https://studiolo.page'): QrElement {
  const s = Math.round(Math.min(doc.width, doc.height) * 0.3);
  return { ...base('QR code', (doc.width - s) / 2, (doc.height - s) / 2, s, s), type: 'qr', data, fg: '#1d1d1f', bg: '#ffffff', ecc: 'M', rounded: false };
}

/** Crop rectangle that makes the image cover a w×h box (centered). */
export function coverCrop(asset: { width: number; height: number }, w: number, h: number) {
  const target = w / h;
  const src = asset.width / asset.height;
  if (src > target) {
    const cw = asset.height * target;
    return { x: (asset.width - cw) / 2, y: 0, w: cw, h: asset.height };
  }
  const ch = asset.width / target;
  return { x: 0, y: (asset.height - ch) / 2, w: asset.width, h: ch };
}

export function newDoc(opts: { name?: string; width: number; height: number; background?: StudioFill; elements?: StudioElement[] }): StudioDoc {
  const now = Date.now();
  const d: StudioDoc = {
    id: uid('proj'),
    name: opts.name ?? 'Untitled design',
    width: Math.round(opts.width),
    height: Math.round(opts.height),
    background: opts.background ?? { kind: 'solid', color: '#ffffff' },
    elements: opts.elements ?? [],
    pages: [],
    pageIndex: 0,
    createdAt: now,
    updatedAt: now,
  };
  return syncPages(d);
}

/** Deep-clone elements with fresh ids (groups get fresh ids too). */
export function cloneElements(els: StudioElement[], dx = 0, dy = 0): StudioElement[] {
  const groups = new Map<string, string>();
  return els.map((e) => {
    let groupId = e.groupId;
    if (groupId) {
      if (!groups.has(groupId)) groups.set(groupId, uid('grp'));
      groupId = groups.get(groupId)!;
    }
    return { ...structuredClone(e), id: uid('el'), groupId, x: e.x + dx, y: e.y + dy };
  });
}

/** Scale an element by `k` around the origin, then offset it (used for canvas resizes and templates). */
export function scaleElement(e: StudioElement, k: number, ox = 0, oy = 0): StudioElement {
  const base = { ...e, x: ox + e.x * k, y: oy + e.y * k, w: e.w * k, h: e.h * k, shadow: { ...e.shadow, blur: e.shadow.blur * k, x: e.shadow.x * k, y: e.shadow.y * k } };
  switch (e.type) {
    case 'text':
      return fitText({ ...(base as typeof e), fontSize: e.fontSize * k, letterSpacing: e.letterSpacing * k, strokeWidth: e.strokeWidth * k });
    case 'shape':
      return { ...(base as typeof e), strokeWidth: e.strokeWidth * k, radius: e.radius * k };
    case 'line':
    case 'draw':
      return { ...(base as typeof e), strokeWidth: e.strokeWidth * k };
    case 'image':
      return { ...(base as typeof e), radius: e.radius * k, borderWidth: e.borderWidth * k };
    default:
      return base as StudioElement;
  }
}

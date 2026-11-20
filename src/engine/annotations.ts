import type {
  Annotation,
  ArrowAnnotation,
  PrivacyAnnotation,
  Point,
  Rect,
  StepAnnotation,
  AnnotationType,
} from '../types';
import { boundsOfPoints, distToSegment, normalizeRect, rectContains, rectFromPoints, snapAngle, clamp } from '../lib/utils';
import { measureText } from './text';

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end' | 'mid';

export interface Handle {
  id: HandleId;
  x: number;
  y: number;
}

type BoxAnnotation = Extract<Annotation, { x: number; y: number; w: number; h: number }>;

const BOX_TYPES = new Set<AnnotationType>(['rect', 'ellipse', 'highlight', 'magnify', 'blur', 'pixelate', 'redact']);
const PRIVACY_TYPES = new Set<AnnotationType>(['blur', 'pixelate', 'redact']);

export const isPrivacy = (a: Annotation): a is PrivacyAnnotation => PRIVACY_TYPES.has(a.type);
export const isBox = (a: Annotation): a is BoxAnnotation => BOX_TYPES.has(a.type);

export const TYPE_LABELS: Record<AnnotationType, string> = {
  arrow: 'Arrow',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  pen: 'Drawing',
  marker: 'Highlighter',
  highlight: 'Highlight',
  text: 'Text',
  step: 'Step',
  magnify: 'Magnifier',
  measure: 'Measurement',
  blur: 'Blur',
  pixelate: 'Pixelate',
  redact: 'Redaction',
};

// ---------------------------------------------------------------------------
// Curved arrows: a quadratic Bézier whose midpoint sits `curve` px off the chord.

/** Control point of a curved arrow (null when straight). */
export function arrowControl(a: Pick<ArrowAnnotation, 'start' | 'end' | 'curve'>): Point | null {
  const c = a.curve ?? 0;
  if (Math.abs(c) < 0.5) return null;
  const dx = a.end.x - a.start.x;
  const dy = a.end.y - a.start.y;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  const mx = (a.start.x + a.end.x) / 2;
  const my = (a.start.y + a.end.y) / 2;
  return { x: mx + nx * c * 2, y: my + ny * c * 2 };
}

/** The point the curve passes through halfway (also where its handle sits). */
export function arrowMidpoint(a: Pick<ArrowAnnotation, 'start' | 'end' | 'curve'>): Point {
  const c = arrowControl(a);
  const mx = (a.start.x + a.end.x) / 2;
  const my = (a.start.y + a.end.y) / 2;
  if (!c) return { x: mx, y: my };
  return { x: (mx + c.x) / 2, y: (my + c.y) / 2 };
}

/** Points along the arrow's path (for hit testing and bounds). */
export function arrowPath(a: Pick<ArrowAnnotation, 'start' | 'end' | 'curve'>, steps = 24): Point[] {
  const c = arrowControl(a);
  if (!c) return [a.start, a.end];
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({ x: u * u * a.start.x + 2 * u * t * c.x + t * t * a.end.x, y: u * u * a.start.y + 2 * u * t * c.y + t * t * a.end.y });
  }
  return out;
}

/** Signed curve value that makes the arrow pass through `p` at its middle. */
export function curveThrough(a: Pick<ArrowAnnotation, 'start' | 'end'>, p: Point): number {
  const dx = a.end.x - a.start.x;
  const dy = a.end.y - a.start.y;
  const L = Math.hypot(dx, dy) || 1;
  const mx = (a.start.x + a.end.x) / 2;
  const my = (a.start.y + a.end.y) / 2;
  const c = ((p.x - mx) * -dy + (p.y - my) * dx) / L;
  return Math.abs(c) < 2 ? 0 : c;
}

/** Radius of the magnifier's source circle (the area being enlarged). */
export function magnifySourceRadius(a: { w: number; h: number; zoom: number }): number {
  return Math.min(Math.abs(a.w), Math.abs(a.h)) / 2 / Math.max(1, a.zoom);
}

/** Length of a measurement in logical pixels. */
export function measureLength(a: { start: Point; end: Point }, unit: number): number {
  return Math.hypot(a.end.x - a.start.x, a.end.y - a.start.y) / (unit || 1);
}

/** Geometric bounds in image space (used for selection frames and marquee). */
export function getBounds(a: Annotation, unit: number): Rect {
  switch (a.type) {
    case 'arrow':
      return a.curve ? boundsOfPoints(arrowPath(a)) : rectFromPoints(a.start, a.end);
    case 'measure':
      return rectFromPoints(a.start, a.end);
    case 'pen':
    case 'marker':
      return boundsOfPoints(a.points);
    case 'text': {
      const m = measureText(a, unit);
      return { x: a.x, y: a.y, w: m.width, h: m.height };
    }
    case 'step': {
      const r = (a.size * unit) / 2;
      return { x: a.x - r, y: a.y - r, w: r * 2, h: r * 2 };
    }
    default:
      return normalizeRect({ x: a.x, y: a.y, w: a.w, h: a.h });
  }
}

/** Bounds including stroke width, for dirty checks and marquee hits. */
export function getVisualBounds(a: Annotation, unit: number): Rect {
  const b = getBounds(a, unit);
  let pad = 0;
  if ('strokeWidth' in a) pad = (a.strokeWidth * unit) / 2;
  if (a.type === 'arrow') pad = a.strokeWidth * unit * 2.5;
  if (a.type === 'measure') pad = Math.max(a.strokeWidth * unit * 4, 30 * unit);
  if (a.type === 'magnify') {
    // Include the source circle and connector.
    const r = magnifySourceRadius(a) + a.strokeWidth * unit;
    const u = unionBox(b, { x: a.sx - r, y: a.sy - r, w: r * 2, h: r * 2 });
    const p2 = a.strokeWidth * unit * 3 + 12 * unit;
    return { x: u.x - p2, y: u.y - p2, w: u.w + p2 * 2, h: u.h + p2 * 2 };
  }
  return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
}

/** `tol` is the hit tolerance in image-space pixels. */
export function hitTest(a: Annotation, p: Point, tol: number, unit: number): boolean {
  switch (a.type) {
    case 'arrow': {
      const sw = a.strokeWidth * unit;
      const pts = arrowPath(a);
      for (let i = 1; i < pts.length; i++) if (distToSegment(p, pts[i - 1], pts[i]) <= sw * 1.2 + tol) return true;
      return false;
    }
    case 'measure':
      return distToSegment(p, a.start, a.end) <= a.strokeWidth * unit * 2 + tol + 4 * unit;
    case 'magnify': {
      const r = normalizeRect(a);
      if (a.shape === 'circle') {
        const rr = Math.min(r.w, r.h) / 2;
        if (Math.hypot(p.x - (r.x + r.w / 2), p.y - (r.y + r.h / 2)) <= rr + tol) return true;
      } else if (rectContains(r, p, tol)) return true;
      return Math.hypot(p.x - a.sx, p.y - a.sy) <= magnifySourceRadius(a) + tol;
    }
    case 'pen':
    case 'marker': {
      const sw = (a.strokeWidth * unit) / 2 + tol;
      const pts = a.points;
      if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= sw;
      for (let i = 1; i < pts.length; i++) {
        if (distToSegment(p, pts[i - 1], pts[i]) <= sw) return true;
      }
      return false;
    }
    case 'rect': {
      const r = normalizeRect(a);
      const sw = (a.strokeWidth * unit) / 2 + tol;
      if (a.fill !== 'none') return rectContains(r, p, sw);
      const outer = rectContains(r, p, sw);
      const inner =
        r.w > sw * 2 && r.h > sw * 2 && rectContains({ x: r.x + sw, y: r.y + sw, w: r.w - sw * 2, h: r.h - sw * 2 }, p);
      return outer && !inner;
    }
    case 'ellipse': {
      const r = normalizeRect(a);
      const rx = r.w / 2;
      const ry = r.h / 2;
      if (rx < 1 || ry < 1) return rectContains(r, p, tol);
      const cx = r.x + rx;
      const cy = r.y + ry;
      const d = Math.hypot((p.x - cx) / rx, (p.y - cy) / ry);
      if (a.fill !== 'none') return d <= 1 + tol / Math.min(rx, ry);
      const sw = (a.strokeWidth * unit) / 2 + tol;
      return Math.abs(d - 1) * Math.min(rx, ry) <= sw;
    }
    case 'step': {
      const r = (a.size * unit) / 2;
      return Math.hypot(p.x - a.x, p.y - a.y) <= r + tol;
    }
    case 'text':
      return rectContains(getBounds(a, unit), p, tol);
    default:
      return rectContains(normalizeRect(a), p, tol);
  }
}

export function getHandles(a: Annotation, unit: number): Handle[] {
  if (a.type === 'arrow') {
    const m = arrowMidpoint(a);
    const hs: Handle[] = [
      { id: 'start', x: a.start.x, y: a.start.y },
      { id: 'end', x: a.end.x, y: a.end.y },
    ];
    // A bend handle when the arrow is long enough to curve (lines stay straight).
    if (a.heads !== 'none' && Math.hypot(a.end.x - a.start.x, a.end.y - a.start.y) > 24 * unit) hs.push({ id: 'mid', x: m.x, y: m.y });
    return hs;
  }
  if (a.type === 'measure') {
    return [
      { id: 'start', x: a.start.x, y: a.start.y },
      { id: 'end', x: a.end.x, y: a.end.y },
    ];
  }
  if (a.type === 'step') return [];
  const b = getBounds(a, unit);
  const { x, y, w, h } = b;
  if (a.type === 'text') {
    return [
      { id: 'nw', x, y },
      { id: 'ne', x: x + w, y },
      { id: 'se', x: x + w, y: y + h },
      { id: 'sw', x, y: y + h },
    ];
  }
  const handles: Handle[] = [
    ...(a.type === 'magnify' ? [{ id: 'start' as const, x: a.sx, y: a.sy }] : []),
    { id: 'nw', x, y },
    { id: 'ne', x: x + w, y },
    { id: 'se', x: x + w, y: y + h },
    { id: 'sw', x, y: y + h },
  ];
  // Edge handles only when there is room for them.
  if (w > 0) {
    handles.push({ id: 'n', x: x + w / 2, y }, { id: 's', x: x + w / 2, y: y + h });
  }
  if (h > 0) {
    handles.push({ id: 'e', x: x + w, y: y + h / 2 }, { id: 'w', x, y: y + h / 2 });
  }
  return handles;
}

export const HANDLE_CURSORS: Record<HandleId, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  start: 'move',
  end: 'move',
  mid: 'move',
};

export function moveAnnotation<T extends Annotation>(a: T, dx: number, dy: number): T {
  switch (a.type) {
    case 'arrow':
    case 'measure':
      return { ...a, start: { x: a.start.x + dx, y: a.start.y + dy }, end: { x: a.end.x + dx, y: a.end.y + dy } };
    case 'pen':
    case 'marker':
      return { ...a, points: a.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    default:
      return { ...a, x: (a as { x: number }).x + dx, y: (a as { y: number }).y + dy };
  }
}

/**
 * Compute a resized box. Returns an un-normalized rect so callers can detect
 * flips (negative width/height).
 */
export function resizeBox(b: Rect, handle: HandleId, p: Point, keepAspect: boolean, fromCenter: boolean): Rect {
  let x1 = b.x;
  let y1 = b.y;
  let x2 = b.x + b.w;
  let y2 = b.y + b.h;
  const hasW = handle === 'nw' || handle === 'w' || handle === 'sw';
  const hasE = handle === 'ne' || handle === 'e' || handle === 'se';
  const hasN = handle === 'nw' || handle === 'n' || handle === 'ne';
  const hasS = handle === 'sw' || handle === 's' || handle === 'se';
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  if (hasW) x1 = p.x;
  if (hasE) x2 = p.x;
  if (hasN) y1 = p.y;
  if (hasS) y2 = p.y;
  if (fromCenter) {
    if (hasW) x2 = 2 * cx - x1;
    if (hasE) x1 = 2 * cx - x2;
    if (hasN) y2 = 2 * cy - y1;
    if (hasS) y1 = 2 * cy - y2;
  }
  if (keepAspect && b.w > 0 && b.h > 0) {
    const ar = b.w / b.h;
    const corner = (hasW || hasE) && (hasN || hasS);
    if (corner) {
      let w = x2 - x1;
      let h = y2 - y1;
      if (Math.abs(w) / ar > Math.abs(h)) h = (Math.sign(h) || 1) * (Math.abs(w) / ar);
      else w = (Math.sign(w) || 1) * Math.abs(h) * ar;
      if (fromCenter) {
        x1 = cx - w / 2;
        x2 = cx + w / 2;
        y1 = cy - h / 2;
        y2 = cy + h / 2;
      } else {
        if (hasW) x1 = x2 - w;
        else x2 = x1 + w;
        if (hasN) y1 = y2 - h;
        else y2 = y1 + h;
      }
    } else if (hasW || hasE) {
      const h = Math.abs(x2 - x1) / ar;
      y1 = cy - h / 2;
      y2 = cy + h / 2;
    } else {
      const w = Math.abs(y2 - y1) * ar;
      x1 = cx - w / 2;
      x2 = cx + w / 2;
    }
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function scalePoints(points: Point[], from: Rect, to: Rect): Point[] {
  const fcx = from.x + from.w / 2;
  const fcy = from.y + from.h / 2;
  const tcx = to.x + to.w / 2;
  const tcy = to.y + to.h / 2;
  const sx = from.w > 0.5 ? to.w / from.w : 1;
  const sy = from.h > 0.5 ? to.h / from.h : 1;
  return points.map((p) => ({ x: tcx + (p.x - fcx) * sx, y: tcy + (p.y - fcy) * sy }));
}

export interface ResizeOptions {
  keepAspect: boolean;
  fromCenter: boolean;
}

/** Resize `orig` by dragging `handle` to `p`. */
export function resizeAnnotation(orig: Annotation, handle: HandleId, p: Point, opts: ResizeOptions, unit: number): Annotation {
  switch (orig.type) {
    case 'arrow':
    case 'measure': {
      if (orig.type === 'arrow' && handle === 'mid') return { ...orig, curve: curveThrough(orig, p) };
      if (handle === 'start') {
        return { ...orig, start: opts.keepAspect ? snapAngle(orig.end, p) : p };
      }
      return { ...orig, end: opts.keepAspect ? snapAngle(orig.start, p) : p };
    }
    case 'magnify': {
      if (handle === 'start') return { ...orig, sx: p.x, sy: p.y };
      const r = normalizeRect(resizeBox(normalizeRect(orig), handle, p, opts.keepAspect || orig.shape === 'circle', opts.fromCenter));
      return { ...orig, ...r };
    }
    case 'pen':
    case 'marker': {
      const b = boundsOfPoints(orig.points);
      const r = resizeBox(b, handle, p, opts.keepAspect, opts.fromCenter);
      return { ...orig, points: scalePoints(orig.points, b, r) };
    }
    case 'text': {
      const m = measureText(orig, unit);
      const b = { x: orig.x, y: orig.y, w: m.width, h: m.height };
      const anchor = {
        x: handle === 'nw' || handle === 'sw' ? b.x + b.w : b.x,
        y: handle === 'nw' || handle === 'ne' ? b.y + b.h : b.y,
      };
      const scale = Math.max(Math.abs(p.x - anchor.x) / b.w, Math.abs(p.y - anchor.y) / b.h);
      const fontSize = clamp(Math.round(orig.fontSize * scale * 2) / 2, 6, 400);
      const m2 = measureText({ ...orig, fontSize }, unit);
      const x = handle === 'nw' || handle === 'sw' ? anchor.x - m2.width : anchor.x;
      const y = handle === 'nw' || handle === 'ne' ? anchor.y - m2.height : anchor.y;
      return { ...orig, fontSize, x, y };
    }
    case 'step':
      return orig;
    default: {
      const r = normalizeRect(resizeBox(normalizeRect(orig), handle, p, opts.keepAspect, opts.fromCenter));
      return { ...orig, ...r };
    }
  }
}

/** Apply a point mapping (crop/rotate/flip/resize) to an annotation. */
export function transformAnnotation(a: Annotation, map: (p: Point) => Point, oldUnit: number, newUnit: number): Annotation {
  switch (a.type) {
    case 'arrow': {
      const start = map(a.start);
      const end = map(a.end);
      // Keep the bend through the same (mapped) midpoint, so flips mirror it.
      return a.curve ? { ...a, start, end, curve: curveThrough({ start, end }, map(arrowMidpoint(a))) } : { ...a, start, end };
    }
    case 'measure':
      return { ...a, start: map(a.start), end: map(a.end) };
    case 'pen':
    case 'marker':
      return { ...a, points: a.points.map(map) };
    case 'magnify': {
      const r = rectFromPoints(map({ x: a.x, y: a.y }), map({ x: a.x + a.w, y: a.y + a.h }));
      const src = map({ x: a.sx, y: a.sy });
      return { ...a, ...r, sx: src.x, sy: src.y };
    }
    case 'text': {
      const m = measureText(a, oldUnit);
      const c = map({ x: a.x + m.width / 2, y: a.y + m.height / 2 });
      const m2 = measureText(a, newUnit);
      return { ...a, x: c.x - m2.width / 2, y: c.y - m2.height / 2 };
    }
    case 'step': {
      const c = map(a);
      return { ...a, x: c.x, y: c.y };
    }
    default: {
      const r = rectFromPoints(map({ x: a.x, y: a.y }), map({ x: a.x + a.w, y: a.y + a.h }));
      return { ...a, ...r };
    }
  }
}

/** Step markers are numbered by creation order. */
export function stepNumbers(annotations: Annotation[]): Map<string, number> {
  const steps = annotations.filter((a): a is StepAnnotation => a.type === 'step').sort((a, b) => a.seq - b.seq);
  const map = new Map<string, number>();
  steps.forEach((s, i) => map.set(s.id, i + 1));
  return map;
}

/** Whether a freshly created annotation is too small to keep. */
export function isDegenerate(a: Annotation, unit: number): boolean {
  switch (a.type) {
    case 'arrow':
    case 'measure':
      return Math.hypot(a.end.x - a.start.x, a.end.y - a.start.y) < 4 * unit;
    case 'pen':
    case 'marker':
      return a.points.length < 2;
    case 'text':
      return a.text.trim().length === 0;
    case 'step':
      return false;
    default: {
      const r = normalizeRect(a);
      return r.w < 3 * unit || r.h < 3 * unit;
    }
  }
}

function unionBox(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/**
 * Turn the box dragged with the Magnifier tool (the area to enlarge) into a
 * lens: the source is the box's center and the lens, `zoom` times larger, sits
 * beside it, kept inside the image where possible.
 */
export function magnifyFromDrag<T extends { x: number; y: number; w: number; h: number; zoom: number }>(a: T, imgW: number, imgH: number): T & { sx: number; sy: number } {
  const r = normalizeRect(a);
  const side = Math.max(r.w, r.h);
  const sx = r.x + r.w / 2;
  const sy = r.y + r.h / 2;
  const size = Math.min(side * a.zoom, Math.max(imgW, imgH) * 0.6);
  const gap = side / 2 + size * 0.15;
  // Prefer up-right, then the side with the most room.
  const cands = [
    { x: sx + gap, y: sy - gap - size },
    { x: sx - gap - size, y: sy - gap - size },
    { x: sx + gap, y: sy + gap },
    { x: sx - gap - size, y: sy + gap },
  ];
  const fits = (c: { x: number; y: number }) => c.x >= 0 && c.y >= 0 && c.x + size <= imgW && c.y + size <= imgH;
  const pick = cands.find(fits) ?? { x: clamp(sx + gap, 0, Math.max(0, imgW - size)), y: clamp(sy - gap - size, 0, Math.max(0, imgH - size)) };
  return { ...a, x: pick.x, y: pick.y, w: size, h: size, sx, sy };
}

/**
 * Smart arrows: snap an arrow end to the nearest edge of a rectangle, ellipse
 * or step marker when it comes within `tol` of it. Returns null if nothing is close.
 */
export function snapToShapes(annotations: Annotation[], p: Point, tol: number, unit: number, skipId?: string): Point | null {
  let best: Point | null = null;
  let bestD = tol;
  const consider = (q: Point) => {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  };
  for (const a of annotations) {
    if (a.id === skipId) continue;
    if (a.type === 'rect' || a.type === 'highlight') {
      const r = normalizeRect(a);
      const cx = clamp(p.x, r.x, r.x + r.w);
      const cy = clamp(p.y, r.y, r.y + r.h);
      const inside = p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
      if (inside) {
        const dl = p.x - r.x;
        const dr = r.x + r.w - p.x;
        const dt = p.y - r.y;
        const db = r.y + r.h - p.y;
        const m = Math.min(dl, dr, dt, db);
        consider(m === dl ? { x: r.x, y: p.y } : m === dr ? { x: r.x + r.w, y: p.y } : m === dt ? { x: p.x, y: r.y } : { x: p.x, y: r.y + r.h });
      } else consider({ x: cx, y: cy });
    } else if (a.type === 'ellipse') {
      const r = normalizeRect(a);
      const rx = r.w / 2;
      const ry = r.h / 2;
      if (rx < 1 || ry < 1) continue;
      const cx = r.x + rx;
      const cy = r.y + ry;
      const ang = Math.atan2((p.y - cy) / ry, (p.x - cx) / rx);
      consider({ x: cx + Math.cos(ang) * rx, y: cy + Math.sin(ang) * ry });
    } else if (a.type === 'step') {
      const rr = (a.size * unit) / 2;
      const d = Math.hypot(p.x - a.x, p.y - a.y) || 1;
      consider({ x: a.x + ((p.x - a.x) / d) * rr, y: a.y + ((p.y - a.y) / d) * rr });
    }
  }
  return best;
}

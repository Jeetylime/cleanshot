import type {
  Annotation,
  PrivacyAnnotation,
  Point,
  Rect,
  StepAnnotation,
  AnnotationType,
} from '../types';
import { boundsOfPoints, distToSegment, normalizeRect, rectContains, rectFromPoints, snapAngle, clamp } from '../lib/utils';
import { measureText } from './text';

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end';

export interface Handle {
  id: HandleId;
  x: number;
  y: number;
}

type BoxAnnotation = Extract<Annotation, { x: number; y: number; w: number; h: number }>;

const BOX_TYPES = new Set<AnnotationType>(['rect', 'ellipse', 'highlight', 'blur', 'pixelate', 'redact']);
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
  blur: 'Blur',
  pixelate: 'Pixelate',
  redact: 'Redaction',
};

/** Geometric bounds in image space (used for selection frames and marquee). */
export function getBounds(a: Annotation, unit: number): Rect {
  switch (a.type) {
    case 'arrow':
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
  return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
}

/** `tol` is the hit tolerance in image-space pixels. */
export function hitTest(a: Annotation, p: Point, tol: number, unit: number): boolean {
  switch (a.type) {
    case 'arrow': {
      const sw = a.strokeWidth * unit;
      return distToSegment(p, a.start, a.end) <= sw * 1.2 + tol;
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
};

export function moveAnnotation<T extends Annotation>(a: T, dx: number, dy: number): T {
  switch (a.type) {
    case 'arrow':
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
    case 'arrow': {
      if (handle === 'start') {
        return { ...orig, start: opts.keepAspect ? snapAngle(orig.end, p) : p };
      }
      return { ...orig, end: opts.keepAspect ? snapAngle(orig.start, p) : p };
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
    case 'arrow':
      return { ...a, start: map(a.start), end: map(a.end) };
    case 'pen':
    case 'marker':
      return { ...a, points: a.points.map(map) };
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

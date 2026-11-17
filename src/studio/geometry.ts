import { hitStroke } from './draw';
import type { Point, Rect } from '../types';
import type { StudioElement } from './types';

export const DEG = Math.PI / 180;

export function center(e: { x: number; y: number; w: number; h: number }): Point {
  return { x: e.x + e.w / 2, y: e.y + e.h / 2 };
}

export function rotatePoint(p: Point, c: Point, deg: number): Point {
  if (!deg) return p;
  const a = deg * DEG;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/** Four corners of an element in canvas space (tl, tr, br, bl). */
export function corners(e: StudioElement): Point[] {
  const c = center(e);
  return [
    { x: e.x, y: e.y },
    { x: e.x + e.w, y: e.y },
    { x: e.x + e.w, y: e.y + e.h },
    { x: e.x, y: e.y + e.h },
  ].map((p) => rotatePoint(p, c, e.rotation));
}

/** Axis-aligned bounds of an element, including rotation. */
export function aabb(e: StudioElement): Rect {
  if (!e.rotation) return { x: e.x, y: e.y, w: e.w, h: e.h };
  const pts = corners(e);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function unionBounds(els: StudioElement[]): Rect | null {
  if (!els.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const e of els) {
    const b = aabb(e);
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Convert a canvas point into the element's unrotated local space (origin top-left). */
export function toLocal(e: StudioElement, p: Point): Point {
  const q = rotatePoint(p, center(e), -e.rotation);
  return { x: q.x - e.x, y: q.y - e.y };
}

/** Whether canvas point `p` hits element `e`. `tol` is in canvas px. */
export function hitTest(e: StudioElement, p: Point, tol: number): boolean {
  const l = toLocal(e, p);
  if (e.type === 'line') {
    const half = Math.max(e.strokeWidth / 2, tol);
    return l.x >= -tol && l.x <= e.w + tol && Math.abs(l.y - e.h / 2) <= half + tol;
  }
  if (l.x < -tol || l.y < -tol || l.x > e.w + tol || l.y > e.h + tol) return false;
  // Strokes are mostly empty space: only the ink itself is clickable.
  if (e.type === 'draw') return hitStroke(e, l, tol);
  if (e.type === 'shape' && e.shape === 'ellipse') {
    const rx = e.w / 2 + tol;
    const ry = e.h / 2 + tol;
    const dx = l.x - e.w / 2;
    const dy = l.y - e.h / 2;
    return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
  }
  return true;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ---------------------------------------------------------------------------
// Snapping

export interface Guide {
  axis: 'x' | 'y';
  /** Canvas coordinate of the guide line. */
  pos: number;
}

interface SnapTargets {
  xs: number[];
  ys: number[];
}

export function snapTargets(canvasW: number, canvasH: number, others: StudioElement[]): SnapTargets {
  const xs = [0, canvasW / 2, canvasW];
  const ys = [0, canvasH / 2, canvasH];
  for (const o of others) {
    if (o.hidden) continue;
    const b = aabb(o);
    xs.push(b.x, b.x + b.w / 2, b.x + b.w);
    ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return { xs, ys };
}

function best(values: number[], targets: number[], threshold: number): { delta: number; pos: number } | null {
  let out: { delta: number; pos: number } | null = null;
  for (const v of values) {
    for (const t of targets) {
      const d = t - v;
      if (Math.abs(d) <= threshold && (!out || Math.abs(d) < Math.abs(out.delta))) out = { delta: d, pos: t };
    }
  }
  return out;
}

/** Snap a moving box. Returns the offset to apply and the guides to draw. */
export function snapBox(box: Rect, targets: SnapTargets, threshold: number): { dx: number; dy: number; guides: Guide[] } {
  const bx = best([box.x, box.x + box.w / 2, box.x + box.w], targets.xs, threshold);
  const by = best([box.y, box.y + box.h / 2, box.y + box.h], targets.ys, threshold);
  const guides: Guide[] = [];
  if (bx) guides.push({ axis: 'x', pos: bx.pos });
  if (by) guides.push({ axis: 'y', pos: by.pos });
  return { dx: bx?.delta ?? 0, dy: by?.delta ?? 0, guides };
}

/** Snap single values (resize edges). */
export function snapValue(v: number, targets: number[], threshold: number): { value: number; pos: number | null } {
  const b = best([v], targets, threshold);
  return b ? { value: v + b.delta, pos: b.pos } : { value: v, pos: null };
}

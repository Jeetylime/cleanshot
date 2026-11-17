/**
 * Freehand drawing for Canvas: brush presets, turning pointer samples into a
 * DrawElement, and the stroke path shared by the screen/export renderer, SVG
 * export and hit-testing, so all of them agree exactly.
 */
import type { Point } from '../types';
import type { Brush, DrawElement, StudioDoc } from './types';
import { uid } from '../lib/utils';
import { DEFAULT_SHADOW } from './factory';

export interface BrushPreset {
  id: Brush;
  label: string;
  /** Default width as a fraction of the page's shorter side. */
  width: number;
  opacity: number;
  /** Highlighter ink multiplies with what's underneath, like a real highlighter. */
  blend: GlobalCompositeOperation;
  cap: CanvasLineCap;
}

export const BRUSHES: BrushPreset[] = [
  { id: 'pen', label: 'Pen', width: 0.004, opacity: 1, blend: 'source-over', cap: 'round' },
  { id: 'marker', label: 'Marker', width: 0.012, opacity: 1, blend: 'source-over', cap: 'round' },
  { id: 'highlighter', label: 'Highlighter', width: 0.028, opacity: 0.45, blend: 'multiply', cap: 'butt' },
];

export const brushOf = (b: Brush) => BRUSHES.find((x) => x.id === b) ?? BRUSHES[0];

/** Default stroke width in design px for a brush on this page. */
export function defaultWidth(doc: Pick<StudioDoc, 'width' | 'height'>, b: Brush): number {
  return Math.max(1, Math.round(Math.min(doc.width, doc.height) * brushOf(b).width));
}

/** Drop samples closer than `minDist` to the previous kept one (keeps files small). */
export function simplify(points: Point[], minDist: number): Point[] {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const last = out[out.length - 1];
    if (Math.hypot(points[i].x - last.x, points[i].y - last.y) >= minDist) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Build a stroke element from absolute canvas points. The box is padded by half the width so the ink fits inside it. */
export function makeDraw(points: Point[], opts: { brush: Brush; color: string; strokeWidth: number; id?: string }): DrawElement {
  const pad = opts.strokeWidth / 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const x = minX - pad;
  const y = minY - pad;
  const w = Math.max(1, maxX - minX + pad * 2);
  const h = Math.max(1, maxY - minY + pad * 2);
  const flat: number[] = [];
  for (const p of points) flat.push(round4((p.x - x) / w), round4((p.y - y) / h));
  const preset = brushOf(opts.brush);
  return {
    id: opts.id ?? uid('el'),
    name: preset.label,
    x,
    y,
    w,
    h,
    rotation: 0,
    opacity: preset.opacity,
    locked: false,
    hidden: false,
    groupId: null,
    shadow: { ...DEFAULT_SHADOW },
    type: 'draw',
    brush: opts.brush,
    points: flat,
    color: opts.color,
    strokeWidth: opts.strokeWidth,
  };
}

const round4 = (v: number) => Math.round(v * 10000) / 10000;
const f = (v: number) => (Math.round(v * 100) / 100).toString();

/** Local-space points (element box coordinates). */
export function localPoints(e: Pick<DrawElement, 'points' | 'w' | 'h'>): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 1 < e.points.length; i += 2) out.push({ x: e.points[i] * e.w, y: e.points[i + 1] * e.h });
  return out;
}

/** Smoothed SVG path data (quadratic curves through segment midpoints), in local coordinates. */
export function strokePathD(e: Pick<DrawElement, 'points' | 'w' | 'h'>): string {
  const pts = localPoints(e);
  if (!pts.length) return '';
  if (pts.length === 1) return `M${f(pts[0].x)} ${f(pts[0].y)}L${f(pts[0].x + 0.01)} ${f(pts[0].y)}`;
  if (pts.length === 2) return `M${f(pts[0].x)} ${f(pts[0].y)}L${f(pts[1].x)} ${f(pts[1].y)}`;
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    d += `Q${f(pts[i].x)} ${f(pts[i].y)} ${f(mx)} ${f(my)}`;
  }
  const last = pts[pts.length - 1];
  return d + `L${f(last.x)} ${f(last.y)}`;
}

/** Whether a local-space point is within the stroke (plus `tol`). */
export function hitStroke(e: Pick<DrawElement, 'points' | 'w' | 'h' | 'strokeWidth'>, l: Point, tol: number): boolean {
  const pts = localPoints(e);
  const r = e.strokeWidth / 2 + tol;
  if (pts.length === 1) return Math.hypot(l.x - pts[0].x, l.y - pts[0].y) <= r;
  for (let i = 0; i < pts.length - 1; i++) if (distToSegment(l, pts[i], pts[i + 1]) <= r) return true;
  return false;
}

export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

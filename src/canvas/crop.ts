import type { Point, Rect } from '../types';
import type { HandleId } from '../engine/annotations';
import { clamp, normalizeRect } from '../lib/utils';
import { resizeBox } from '../engine/annotations';

const MIN = 4;

/** Resize a crop rect by a handle, honoring an optional aspect ratio and image bounds. */
export function cropResize(orig: Rect, handle: HandleId, p: Point, aspect: number | null, W: number, H: number): Rect {
  const hasW = handle === 'nw' || handle === 'w' || handle === 'sw';
  const hasE = handle === 'ne' || handle === 'e' || handle === 'se';
  const hasN = handle === 'nw' || handle === 'n' || handle === 'ne';
  const hasS = handle === 'sw' || handle === 's' || handle === 'se';

  if (!aspect) {
    const q = { x: clamp(p.x, 0, W), y: clamp(p.y, 0, H) };
    const r = normalizeRect(resizeBox(orig, handle, q, false, false));
    return { x: r.x, y: r.y, w: Math.max(MIN, r.w), h: Math.max(MIN, r.h) };
  }

  const cx = orig.x + orig.w / 2;
  const cy = orig.y + orig.h / 2;
  const corner = (hasW || hasE) && (hasN || hasS);

  if (corner) {
    const ax = hasW ? orig.x + orig.w : orig.x;
    const ay = hasN ? orig.y + orig.h : orig.y;
    return rectFromAnchor({ x: ax, y: ay }, p, aspect, W, H);
  }
  if (hasE || hasW) {
    const ax = hasW ? orig.x + orig.w : orig.x;
    const dir = p.x >= ax ? 1 : -1;
    let w = Math.abs(p.x - ax);
    const wMax = dir > 0 ? W - ax : ax;
    w = clamp(w, MIN, Math.min(wMax, Math.min(cy, H - cy) * 2 * aspect));
    const h = w / aspect;
    return { x: dir > 0 ? ax : ax - w, y: cy - h / 2, w, h };
  }
  const ay = hasN ? orig.y + orig.h : orig.y;
  const dir = p.y >= ay ? 1 : -1;
  let h = Math.abs(p.y - ay);
  const hMax = dir > 0 ? H - ay : ay;
  h = clamp(h, MIN, Math.min(hMax, (Math.min(cx, W - cx) * 2) / aspect));
  const w = h * aspect;
  return { x: cx - w / 2, y: dir > 0 ? ay : ay - h, w, h };
}

/** Rect spanning from a fixed anchor toward `p`, clamped to the image. */
export function rectFromAnchor(anchor: Point, p: Point, aspect: number | null, W: number, H: number): Rect {
  const dirX = p.x >= anchor.x ? 1 : -1;
  const dirY = p.y >= anchor.y ? 1 : -1;
  const wMax = dirX > 0 ? W - anchor.x : anchor.x;
  const hMax = dirY > 0 ? H - anchor.y : anchor.y;
  let w = Math.abs(p.x - anchor.x);
  let h = Math.abs(p.y - anchor.y);
  if (aspect) {
    w = Math.max(w, h * aspect);
    w = Math.min(w, wMax, hMax * aspect);
    h = w / aspect;
  } else {
    w = Math.min(w, wMax);
    h = Math.min(h, hMax);
  }
  return { x: dirX > 0 ? anchor.x : anchor.x - w, y: dirY > 0 ? anchor.y : anchor.y - h, w, h };
}

export function cropMove(orig: Rect, dx: number, dy: number, W: number, H: number): Rect {
  return {
    ...orig,
    x: clamp(orig.x + dx, 0, Math.max(0, W - orig.w)),
    y: clamp(orig.y + dy, 0, Math.max(0, H - orig.h)),
  };
}

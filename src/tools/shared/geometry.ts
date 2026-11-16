import { createCanvas, ctx2d, resample, type ImageSource } from '../../engine/images';
import type { Rect } from '../../types';

export type FitMode = 'contain' | 'cover' | 'stretch';

/**
 * Render `src` into a `w`×`h` canvas.
 * - stretch: distort to fill
 * - cover: fill and crop the overflow (centered)
 * - contain: fit inside, padding with `fill` (null = transparent)
 * Downscaling uses progressive halving for quality.
 */
export function renderResized(src: ImageSource, w: number, h: number, fit: FitMode, fill: string | null = null): HTMLCanvasElement {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  const sw = src.width;
  const sh = src.height;
  let crop: Rect = { x: 0, y: 0, w: sw, h: sh };
  let dest: Rect = { x: 0, y: 0, w, h };
  if (fit === 'cover') {
    const k = Math.max(w / sw, h / sh);
    const cw = w / k;
    const ch = h / k;
    crop = { x: (sw - cw) / 2, y: (sh - ch) / 2, w: cw, h: ch };
  } else if (fit === 'contain') {
    const k = Math.min(w / sw, h / sh);
    const dw = Math.round(sw * k);
    const dh = Math.round(sh * k);
    dest = { x: Math.round((w - dw) / 2), y: Math.round((h - dh) / 2), w: dw, h: dh };
  }
  // Isolate the source region first so resampling works on exactly it.
  let region: ImageSource = src;
  if (crop.w !== sw || crop.h !== sh) {
    const c = createCanvas(Math.round(crop.w), Math.round(crop.h));
    ctx2d(c).drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
    region = c;
  }
  const scaled = resample(region, dest.w, dest.h);
  if (dest.x === 0 && dest.y === 0 && dest.w === w && dest.h === h && !fill) return scaled;
  const out = createCanvas(w, h);
  const ctx = ctx2d(out);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(scaled, dest.x, dest.y);
  scaled.width = scaled.height = 0;
  return out;
}

export function rotateCanvas(src: ImageSource, dir: 1 | -1): HTMLCanvasElement {
  const c = createCanvas(src.height, src.width);
  const ctx = ctx2d(c);
  if (dir === 1) {
    ctx.translate(src.height, 0);
    ctx.rotate(Math.PI / 2);
  } else {
    ctx.translate(0, src.width);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(src, 0, 0);
  return c;
}

export function flipCanvas(src: ImageSource, axis: 'h' | 'v'): HTMLCanvasElement {
  const c = createCanvas(src.width, src.height);
  const ctx = ctx2d(c);
  if (axis === 'h') {
    ctx.translate(src.width, 0);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(0, src.height);
    ctx.scale(1, -1);
  }
  ctx.drawImage(src, 0, 0);
  return c;
}

export function cropCanvas(src: ImageSource, r: Rect): HTMLCanvasElement {
  const x = Math.round(r.x);
  const y = Math.round(r.y);
  const w = Math.max(1, Math.round(r.w));
  const h = Math.max(1, Math.round(r.h));
  const c = createCanvas(w, h);
  ctx2d(c).drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
}

/** Largest rect with `ratio` centered inside `r`. */
export function fitRatio(r: Rect, ratio: number): Rect {
  let w = r.w;
  let h = w / ratio;
  if (h > r.h) {
    h = r.h;
    w = h * ratio;
  }
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

import { createCanvas, ctx2d, type ImageSource } from '../../engine/images';
import type { Point } from '../../types';

export interface Stroke {
  mode: 'erase' | 'restore';
  size: number;
  points: Point[];
}

/**
 * Scale the model's matte to full resolution, applying an edge-hardness
 * curve (1 = model output, higher = crisper edges).
 */
export function buildFullMask(base: HTMLCanvasElement, w: number, h: number, hardness: number): HTMLCanvasElement {
  let src: HTMLCanvasElement = base;
  if (hardness !== 1) {
    src = createCanvas(base.width, base.height);
    const ctx = ctx2d(src, { willReadFrequently: true });
    ctx.drawImage(base, 0, 0);
    const img = ctx.getImageData(0, 0, src.width, src.height);
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = Math.round(((v / 255 - 0.5) * hardness + 0.5) * 255);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = lut[img.data[i]];
    ctx.putImageData(img, 0, 0);
  }
  const full = createCanvas(w, h);
  const fctx = ctx2d(full);
  fctx.imageSmoothingEnabled = true;
  fctx.imageSmoothingQuality = 'high';
  fctx.drawImage(src, 0, 0, w, h);
  if (src !== base) src.width = src.height = 0;
  return full;
}

/** Paint a stroke segment (or a dot) onto the mask. */
export function paintStroke(mask: CanvasRenderingContext2D, s: Stroke, from = 0) {
  mask.save();
  mask.globalCompositeOperation = s.mode === 'erase' ? 'destination-out' : 'source-over';
  mask.strokeStyle = '#fff';
  mask.fillStyle = '#fff';
  mask.lineCap = 'round';
  mask.lineJoin = 'round';
  mask.lineWidth = s.size;
  const pts = s.points;
  if (pts.length === 1 || from >= pts.length - 1) {
    const p = pts[pts.length - 1];
    mask.beginPath();
    mask.arc(p.x, p.y, s.size / 2, 0, Math.PI * 2);
    mask.fill();
  } else {
    mask.beginPath();
    mask.moveTo(pts[Math.max(0, from)].x, pts[Math.max(0, from)].y);
    for (let i = Math.max(1, from + 1); i < pts.length; i++) mask.lineTo(pts[i].x, pts[i].y);
    mask.stroke();
  }
  mask.restore();
}

/** Source pixels with the mask applied as alpha. */
export function composeCutout(target: HTMLCanvasElement, src: ImageSource, mask: HTMLCanvasElement) {
  const ctx = ctx2d(target);
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

/** Draw `img` covering a w×h area (centered crop). */
export function drawCover(ctx: CanvasRenderingContext2D, img: ImageSource, w: number, h: number) {
  const k = Math.max(w / img.width, h / img.height);
  const dw = img.width * k;
  const dh = img.height * k;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

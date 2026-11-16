import type { EditorDoc, PrivacyAnnotation, Rect } from '../types';
import { createCanvas, ctx2d, getImage, getMipLevel, type ImageSource } from './images';
import { intersectRects, normalizeRect } from '../lib/utils';
import { isPrivacy } from './annotations';

/**
 * Privacy processing.
 *
 * Each blur/pixelate region is turned into a small "patch" computed only
 * from a downsampled copy of the pixels inside that region, then scaled back
 * up over the region. On export the original pixels under every region are
 * cleared before the patch (or solid redaction) is drawn, so nothing from the
 * original region survives in the output — there is no translucent overlay
 * hiding recoverable content.
 */

export function blurRadiusPx(intensity: number, unit: number): number {
  return Math.max(2, Math.round((2 + intensity * 0.32) * unit));
}

export function pixelBlockPx(intensity: number, unit: number): number {
  return Math.max(3, Math.round((3 + intensity * 0.36) * unit));
}

/** Integer region clipped to the image. */
export function privacyRegion(a: PrivacyAnnotation, w: number, h: number): Rect | null {
  const r = normalizeRect(a);
  const x1 = Math.floor(r.x);
  const y1 = Math.floor(r.y);
  const x2 = Math.ceil(r.x + r.w);
  const y2 = Math.ceil(r.y + r.h);
  return intersectRects({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, { x: 0, y: 0, w, h });
}

// ---------------------------------------------------------------------------
// Pixel kernels

/** One separable box-blur pass (clamped edges) along one axis. */
function boxBlurPass(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, horizontal: boolean) {
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const stride = horizontal ? 4 : w * 4;
  const lineStride = horizontal ? w * 4 : 4;
  const div = r * 2 + 1;
  for (let l = 0; l < lines; l++) {
    const base = l * lineStride;
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        const idx = Math.min(len - 1, Math.max(0, k));
        sum += src[base + idx * stride + c];
      }
      for (let i = 0; i < len; i++) {
        dst[base + i * stride + c] = sum / div;
        const addIdx = Math.min(len - 1, i + r + 1);
        const subIdx = Math.max(0, i - r);
        sum += src[base + addIdx * stride + c] - src[base + subIdx * stride + c];
      }
    }
  }
}

/** Gaussian-like blur (3 box passes) on premultiplied RGBA, in place. */
function blurImageData(img: ImageData, r: number) {
  const { data, width: w, height: h } = img;
  const n = w * h * 4;
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i += 4) {
    const al = data[i + 3] / 255;
    a[i] = data[i] * al;
    a[i + 1] = data[i + 1] * al;
    a[i + 2] = data[i + 2] * al;
    a[i + 3] = data[i + 3];
  }
  for (let pass = 0; pass < 3; pass++) {
    boxBlurPass(a, b, w, h, r, true);
    boxBlurPass(b, a, w, h, r, false);
  }
  for (let i = 0; i < n; i += 4) {
    const al = a[i + 3];
    const k = al > 0 ? 255 / al : 0;
    data[i] = a[i] * k;
    data[i + 1] = a[i + 1] * k;
    data[i + 2] = a[i + 2] * k;
    data[i + 3] = al;
  }
}

/**
 * Downscale `region` of an image to dw×dh. Sampling starts from the cached
 * mip level closest to the target size, so every source pixel contributes
 * (levels are box-filtered) and per-frame work is proportional to the output.
 */
function sampleRegion(imageId: string, region: Rect, dw: number, dh: number): HTMLCanvasElement | null {
  const reduction = Math.min(region.w / dw, region.h / dh);
  const k = Math.max(0, Math.floor(Math.log2(Math.max(1, reduction))));
  const mip = getMipLevel(imageId, k);
  if (!mip) return null;
  const f = mip.factor;
  const out = createCanvas(dw, dh);
  const ctx = ctx2d(out, { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(mip.source, region.x / f, region.y / f, region.w / f, region.h / f, 0, 0, dw, dh);
  return out;
}

export interface Patch {
  canvas: HTMLCanvasElement;
  /** Region-space pixels per patch pixel. */
  scaleX: number;
  scaleY: number;
  smooth: boolean;
}

function blurPatch(imageId: string, region: Rect, radius: number): Patch | null {
  // Work at reduced resolution: the result is visually identical once blurred
  // and keeps interaction fast on very large screenshots.
  const f = Math.max(1, Math.floor(radius / 5));
  const dw = Math.max(1, Math.ceil(region.w / f));
  const dh = Math.max(1, Math.ceil(region.h / f));
  const canvas = sampleRegion(imageId, region, dw, dh);
  if (!canvas) return null;
  const ctx = ctx2d(canvas, { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, dw, dh);
  blurImageData(img, Math.max(1, Math.round(radius / f)));
  ctx.putImageData(img, 0, 0);
  return { canvas, scaleX: region.w / dw, scaleY: region.h / dh, smooth: true };
}

function pixelatePatch(imageId: string, region: Rect, block: number): Patch | null {
  const cols = Math.max(1, Math.ceil(region.w / block));
  const rows = Math.max(1, Math.ceil(region.h / block));
  const canvas = sampleRegion(imageId, region, cols, rows);
  if (!canvas) return null;
  return { canvas, scaleX: region.w / cols, scaleY: region.h / rows, smooth: false };
}

// ---------------------------------------------------------------------------
// Caches

const patchCache = new Map<string, Patch>();
const PATCH_CACHE_LIMIT = 64;

export function getPatch(doc: EditorDoc, a: PrivacyAnnotation, region: Rect): Patch | null {
  if (a.type === 'redact') return null;
  const key = `${doc.imageId}|${a.type}|${region.x},${region.y},${region.w},${region.h}|${a.intensity}|${doc.unit}`;
  const hit = patchCache.get(key);
  if (hit) {
    patchCache.delete(key);
    patchCache.set(key, hit);
    return hit;
  }
  const patch =
    a.type === 'blur'
      ? blurPatch(doc.imageId, region, blurRadiusPx(a.intensity, doc.unit))
      : pixelatePatch(doc.imageId, region, pixelBlockPx(a.intensity, doc.unit));
  if (!patch) return null;
  patchCache.set(key, patch);
  if (patchCache.size > PATCH_CACHE_LIMIT) {
    const first = patchCache.keys().next().value;
    if (first !== undefined) patchCache.delete(first);
  }
  return patch;
}

/**
 * Paint all privacy regions in image space onto `ctx`.
 * With `clearFirst`, the underlying pixels are erased before painting
 * (used when compositing the export layer).
 */
export function paintPrivacy(ctx: CanvasRenderingContext2D, doc: EditorDoc, clearFirst: boolean) {
  for (const a of doc.annotations) {
    if (!isPrivacy(a)) continue;
    const region = privacyRegion(a, doc.width, doc.height);
    if (!region) continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(region.x, region.y, region.w, region.h);
    ctx.clip();
    if (clearFirst) ctx.clearRect(region.x, region.y, region.w, region.h);
    if (a.type === 'redact') {
      ctx.globalAlpha = 1;
      ctx.fillStyle = a.color;
      ctx.fillRect(region.x, region.y, region.w, region.h);
    } else {
      const patch = getPatch(doc, a, region);
      if (patch) {
        ctx.imageSmoothingEnabled = patch.smooth;
        if (patch.smooth) ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
          patch.canvas,
          region.x,
          region.y,
          patch.canvas.width * patch.scaleX,
          patch.canvas.height * patch.scaleY,
        );
      }
    }
    ctx.restore();
  }
}

let layerCache: { key: string; canvas: HTMLCanvasElement } | null = null;

function layerKey(doc: EditorDoc, privacy: PrivacyAnnotation[]): string {
  let k = `${doc.imageId}|${doc.unit}`;
  for (const p of privacy) {
    k += `|${p.type}:${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.w)},${Math.round(p.h)},${p.intensity},${p.color}`;
  }
  return k;
}

/**
 * Full-resolution base image with all privacy regions baked in (original
 * pixels removed). Used for export, clipboard and thumbnails.
 */
export function getImageLayer(doc: EditorDoc): ImageSource | null {
  const entry = getImage(doc.imageId);
  if (!entry) return null;
  const privacy = doc.annotations.filter(isPrivacy);
  if (!privacy.length) return entry.source;
  const key = layerKey(doc, privacy);
  if (layerCache?.key === key) return layerCache.canvas;
  const canvas = createCanvas(entry.width, entry.height);
  const ctx = ctx2d(canvas);
  ctx.drawImage(entry.source, 0, 0);
  paintPrivacy(ctx, doc, true);
  layerCache = { key, canvas };
  return canvas;
}

export function clearPrivacyCaches() {
  patchCache.clear();
  layerCache = null;
}

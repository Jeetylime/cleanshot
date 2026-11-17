import { createCanvas, ctx2d, getImage, getMipLevel } from '../engine/images';
import type { CropRect } from './types';

/**
 * Non-destructive image adjustments. The original pixels never change; an
 * adjusted copy is rendered at the size it's needed and cached. Everything is
 * done with plain pixel math (no ctx.filter) so results match in every browser.
 */

export interface Adjust {
  /** -100 to 100 */
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  /** 0 to 100 */
  grayscale: number;
  sepia: number;
  /** Blur radius in design px, 0 to 40 */
  blur: number;
}

export const NO_ADJUST: Adjust = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, grayscale: 0, sepia: 0, blur: 0 };

export function isIdentity(a: Adjust | undefined | null): boolean {
  if (!a) return true;
  return !a.brightness && !a.contrast && !a.saturation && !a.warmth && !a.grayscale && !a.sepia && !a.blur;
}

export const FILTER_PRESETS: { id: string; label: string; adjust: Adjust }[] = [
  { id: 'none', label: 'Original', adjust: NO_ADJUST },
  { id: 'vivid', label: 'Vivid', adjust: { ...NO_ADJUST, contrast: 15, saturation: 35 } },
  { id: 'warm', label: 'Warm', adjust: { ...NO_ADJUST, warmth: 35, saturation: 10 } },
  { id: 'cool', label: 'Cool', adjust: { ...NO_ADJUST, warmth: -35, contrast: 5 } },
  { id: 'fade', label: 'Fade', adjust: { ...NO_ADJUST, contrast: -30, brightness: 12, saturation: -20 } },
  { id: 'mono', label: 'Mono', adjust: { ...NO_ADJUST, grayscale: 100 } },
  { id: 'noir', label: 'Noir', adjust: { ...NO_ADJUST, grayscale: 100, contrast: 45, brightness: -8 } },
  { id: 'vintage', label: 'Vintage', adjust: { ...NO_ADJUST, sepia: 60, contrast: -10, brightness: 6 } },
  { id: 'dramatic', label: 'Dramatic', adjust: { ...NO_ADJUST, contrast: 50, saturation: -15, brightness: -5 } },
  { id: 'dreamy', label: 'Dreamy', adjust: { ...NO_ADJUST, blur: 2, brightness: 10, saturation: 10, contrast: -10 } },
];

function applyPixels(data: Uint8ClampedArray, a: Adjust) {
  const b = a.brightness * 2.55;
  const cv = a.contrast * 2.55;
  const cf = (259 * (cv + 255)) / (255 * (259 - cv));
  const sat = 1 + a.saturation / 100;
  const warm = a.warmth * 0.6;
  const gray = a.grayscale / 100;
  const sep = a.sepia / 100;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let bl = data[i + 2];
    if (b) {
      r += b;
      g += b;
      bl += b;
    }
    if (cv) {
      r = cf * (r - 128) + 128;
      g = cf * (g - 128) + 128;
      bl = cf * (bl - 128) + 128;
    }
    if (sat !== 1) {
      const l = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = l + (r - l) * sat;
      g = l + (g - l) * sat;
      bl = l + (bl - l) * sat;
    }
    if (warm) {
      r += warm;
      bl -= warm;
    }
    if (gray) {
      const l = 0.299 * r + 0.587 * g + 0.114 * bl;
      r += (l - r) * gray;
      g += (l - g) * gray;
      bl += (l - bl) * gray;
    }
    if (sep) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * bl;
      const sg = 0.349 * r + 0.686 * g + 0.168 * bl;
      const sb = 0.272 * r + 0.534 * g + 0.131 * bl;
      r += (sr - r) * sep;
      g += (sg - g) * sep;
      bl += (sb - bl) * sep;
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = bl;
  }
}

/** Separable box blur, three passes ≈ gaussian. Works on premultiplied-ish RGBA. */
function boxBlur(img: ImageData, radius: number) {
  const r = Math.max(1, Math.round(radius / 2));
  const { width: w, height: h, data } = img;
  const tmp = new Float32Array(data.length);
  const pass = (src: Uint8ClampedArray | Float32Array, dst: Uint8ClampedArray | Float32Array, horizontal: boolean) => {
    const len = horizontal ? w : h;
    const lines = horizontal ? h : w;
    for (let line = 0; line < lines; line++) {
      for (let c = 0; c < 4; c++) {
        let acc = 0;
        const at = (k: number) => {
          const kk = Math.min(len - 1, Math.max(0, k));
          return ((horizontal ? line * w + kk : kk * w + line) << 2) + c;
        };
        for (let k = -r; k <= r; k++) acc += src[at(k)];
        for (let k = 0; k < len; k++) {
          dst[at(k)] = acc / (2 * r + 1);
          acc += src[at(k + r + 1)] - src[at(k - r)];
        }
      }
    }
  };
  for (let n = 0; n < 3; n++) {
    pass(data, tmp, true);
    pass(tmp, data, false);
  }
}

const cache = new Map<string, HTMLCanvasElement>();
const MAX_CACHE = 16;

/**
 * The cropped, adjusted image at about `outW`×`outH` pixels, or null if the
 * asset isn't loaded. `pxPerDesign` scales the blur radius.
 */
export function adjustedImage(assetId: string, crop: CropRect, a: Adjust, outW: number, outH: number, pxPerDesign: number): HTMLCanvasElement | null {
  const entry = getImage(assetId);
  if (!entry) return null;
  const w = Math.max(1, Math.min(4096, Math.round(outW)));
  const h = Math.max(1, Math.min(4096, Math.round(outH)));
  const key = `${assetId}|${crop.x},${crop.y},${crop.w},${crop.h}|${JSON.stringify(a)}|${w}x${h}|${pxPerDesign.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const k = Math.max(0, Math.floor(Math.log2(Math.max(1, crop.w / w))));
  const lvl = getMipLevel(assetId, k) ?? { source: entry.source, factor: 1 };
  const c = createCanvas(w, h);
  const ctx = ctx2d(c, { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(lvl.source, crop.x / lvl.factor, crop.y / lvl.factor, crop.w / lvl.factor, crop.h / lvl.factor, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  applyPixels(img.data, a);
  if (a.blur > 0) boxBlur(img, a.blur * pxPerDesign);
  ctx.putImageData(img, 0, 0);
  cache.set(key, c);
  while (cache.size > MAX_CACHE) {
    const first = cache.keys().next().value as string;
    cache.delete(first);
  }
  return c;
}

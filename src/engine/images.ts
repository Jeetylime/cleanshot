import type { Rect } from '../types';
import { uid } from '../lib/utils';

/**
 * Registry of decoded bitmaps. Documents reference images by id so that
 * history snapshots stay tiny and destructive operations (crop, rotate,
 * resize) can be undone by simply pointing back at the previous id.
 */

export type ImageSource = HTMLCanvasElement | ImageBitmap;

export interface ImageEntry {
  id: string;
  source: ImageSource;
  width: number;
  height: number;
  blob: Blob | null;
  blobPromise: Promise<Blob> | null;
  /** Lazily generated half-resolution levels for fast zoomed-out display. */
  mips: HTMLCanvasElement[];
}

const registry = new Map<string, ImageEntry>();

/** Largest image area we accept (keeps canvases within browser limits). */
export const MAX_AREA = 120_000_000;
export const MAX_SIDE = 16_000;

export function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement, opts?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', opts);
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  return ctx;
}

export function registerImage(source: ImageSource, opts: { id?: string; blob?: Blob | null } = {}): ImageEntry {
  const id = opts.id ?? uid('img');
  const entry: ImageEntry = {
    id,
    source,
    width: source.width,
    height: source.height,
    blob: opts.blob ?? null,
    blobPromise: null,
    mips: [],
  };
  registry.set(id, entry);
  return entry;
}

export function getImage(id: string): ImageEntry | undefined {
  return registry.get(id);
}

export function hasImage(id: string): boolean {
  return registry.has(id);
}

/** Drop every image not in `keep` (called when a session is closed). */
export function releaseImagesExcept(keep: Set<string>): void {
  for (const [id, e] of registry) {
    if (keep.has(id)) continue;
    if ('close' in e.source && typeof (e.source as ImageBitmap).close === 'function') {
      (e.source as ImageBitmap).close();
    }
    registry.delete(id);
  }
}

/** Release specific images (and their mip levels). */
export function releaseImages(ids: Iterable<string>): void {
  for (const id of ids) {
    const e = registry.get(id);
    if (!e) continue;
    if ('close' in e.source && typeof (e.source as ImageBitmap).close === 'function') (e.source as ImageBitmap).close();
    e.mips.forEach((m) => (m.width = m.height = 0));
    registry.delete(id);
  }
}

function halve(src: ImageSource): HTMLCanvasElement {
  const c = createCanvas(Math.max(1, Math.ceil(src.width / 2)), Math.max(1, Math.ceil(src.height / 2)));
  const ctx = ctx2d(c);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/**
 * Best source for drawing the image at `scale` device pixels per image
 * pixel. Zoomed-out views use pre-filtered half-size levels, which is both
 * faster and sharper than resampling the full image every frame.
 */
export function getDisplaySource(id: string, scale: number): ImageSource | null {
  const e = registry.get(id);
  if (!e) return null;
  let cur: ImageSource = e.source;
  if (scale >= 0.5 || Math.max(e.width, e.height) < 1200) return cur;
  for (let k = 0; ; k++) {
    if (1 / 2 ** (k + 1) < scale) break;
    if (!e.mips[k]) e.mips[k] = halve(cur);
    cur = e.mips[k];
    if (Math.max(cur.width, cur.height) < 600) break;
  }
  return cur;
}

/**
 * Mip level `k` (1/2^k scale) of an image, generated on demand. Returns the
 * deepest available level not exceeding `k` and its actual scale factor.
 */
export function getMipLevel(id: string, k: number): { source: ImageSource; factor: number } | null {
  const e = registry.get(id);
  if (!e) return null;
  let cur: ImageSource = e.source;
  let factor = 1;
  for (let i = 0; i < k; i++) {
    if (cur.width < 4 || cur.height < 4) break;
    if (!e.mips[i]) e.mips[i] = halve(cur);
    cur = e.mips[i];
    factor *= 2;
  }
  return { source: cur, factor };
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encoding failed'))), type, quality);
  });
}

function sourceToCanvas(src: ImageSource): HTMLCanvasElement {
  if (src instanceof HTMLCanvasElement) return src;
  const c = createCanvas(src.width, src.height);
  ctx2d(c).drawImage(src, 0, 0);
  return c;
}

/** Lossless PNG blob for an image (reuses the original file when available). */
export function getImageBlob(id: string): Promise<Blob> {
  const e = registry.get(id);
  if (!e) return Promise.reject(new Error(`Unknown image ${id}`));
  if (e.blob) return Promise.resolve(e.blob);
  if (!e.blobPromise) {
    e.blobPromise = canvasToBlob(sourceToCanvas(e.source), 'image/png').then((b) => {
      e.blob = b;
      return b;
    });
  }
  return e.blobPromise;
}

async function decodeWithElement(blob: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const c = createCanvas(img.naturalWidth, img.naturalHeight);
    ctx2d(c).drawImage(img, 0, 0);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function decodeImage(blob: Blob): Promise<ImageSource> {
  let src: ImageSource;
  try {
    src = await createImageBitmap(blob);
  } catch {
    // HEIC (iPhone photos): native in Safari, WebAssembly decoder elsewhere.
    const heic = await import('../lib/heic');
    if (heic.isHeic(blob as Blob & { name?: string })) {
      try {
        src = await decodeWithElement(blob);
      } catch {
        src = await heic.decodeHeic(blob);
      }
    } else src = await decodeWithElement(blob);
  }
  if (!src.width || !src.height) throw new Error('Image has no pixels');
  return src;
}

/** Downscale sources that exceed safe canvas limits. Returns [source, wasScaled]. */
export function constrainSource(src: ImageSource): [ImageSource, boolean] {
  const area = src.width * src.height;
  const k = Math.min(1, MAX_SIDE / src.width, MAX_SIDE / src.height, Math.sqrt(MAX_AREA / area));
  if (k >= 1) return [src, false];
  return [resample(src, Math.floor(src.width * k), Math.floor(src.height * k)), true];
}

// ---------------------------------------------------------------------------
// Destructive transforms. Each returns a new registered image.

export function cropImage(id: string, rect: Rect): ImageEntry {
  const e = registry.get(id)!;
  const r = {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.max(1, Math.round(rect.w)),
    h: Math.max(1, Math.round(rect.h)),
  };
  const c = createCanvas(r.w, r.h);
  ctx2d(c).drawImage(e.source, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return registerImage(c);
}

/** Rotate by 90° steps. dir = 1 clockwise, -1 counter-clockwise. */
export function rotateImage(id: string, dir: 1 | -1): ImageEntry {
  const e = registry.get(id)!;
  const c = createCanvas(e.height, e.width);
  const ctx = ctx2d(c);
  if (dir === 1) {
    ctx.translate(e.height, 0);
    ctx.rotate(Math.PI / 2);
  } else {
    ctx.translate(0, e.width);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(e.source, 0, 0);
  return registerImage(c);
}

export function flipImage(id: string, axis: 'h' | 'v'): ImageEntry {
  const e = registry.get(id)!;
  const c = createCanvas(e.width, e.height);
  const ctx = ctx2d(c);
  if (axis === 'h') {
    ctx.translate(e.width, 0);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(0, e.height);
    ctx.scale(1, -1);
  }
  ctx.drawImage(e.source, 0, 0);
  return registerImage(c);
}

/** High-quality resample using progressive halving for large reductions. */
export function resample(src: ImageSource, w: number, h: number): HTMLCanvasElement {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  let cur: ImageSource = src;
  let cw = src.width;
  let ch = src.height;
  while (cw / 2 >= w && ch / 2 >= h) {
    const nw = Math.max(w, Math.floor(cw / 2));
    const nh = Math.max(h, Math.floor(ch / 2));
    const c = createCanvas(nw, nh);
    const ctx = ctx2d(c);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, nw, nh);
    cur = c;
    cw = nw;
    ch = nh;
  }
  const out = createCanvas(w, h);
  const octx = ctx2d(out);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(cur, 0, 0, w, h);
  return out;
}

export function resizeImage(id: string, w: number, h: number): ImageEntry {
  const e = registry.get(id)!;
  return registerImage(resample(e.source, w, h));
}

import { canvasToBlob, createCanvas, ctx2d } from '../../engine/images';

export type OutFormat = 'png' | 'jpeg' | 'webp' | 'avif';

export const FORMATS: Record<OutFormat, { label: string; mime: string; ext: string; lossy: boolean; alpha: boolean }> = {
  png: { label: 'PNG', mime: 'image/png', ext: 'png', lossy: false, alpha: true },
  jpeg: { label: 'JPEG', mime: 'image/jpeg', ext: 'jpg', lossy: true, alpha: false },
  webp: { label: 'WebP', mime: 'image/webp', ext: 'webp', lossy: true, alpha: true },
  avif: { label: 'AVIF', mime: 'image/avif', ext: 'avif', lossy: true, alpha: true },
};

const support = new Map<OutFormat, Promise<boolean>>();

/** Whether this browser can encode `format` from a canvas. */
export function canEncode(format: OutFormat): Promise<boolean> {
  if (format === 'png' || format === 'jpeg') return Promise.resolve(true);
  let p = support.get(format);
  if (!p) {
    const c = createCanvas(2, 2);
    p = new Promise<boolean>((resolve) => {
      try {
        c.toBlob((b) => resolve(!!b && b.type === FORMATS[format].mime), FORMATS[format].mime, 0.8);
      } catch {
        resolve(false);
      }
    });
    support.set(format, p);
  }
  return p;
}

export interface EncodeResult {
  blob: Blob;
  format: OutFormat;
}

/**
 * Encode a canvas. Formats without alpha are flattened onto `matte`.
 * `quality` is 1–100 and only used by lossy formats.
 */
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  format: OutFormat,
  quality = 90,
  matte = '#ffffff',
): Promise<EncodeResult> {
  if (!(await canEncode(format))) throw new Error(`${FORMATS[format].label} encoding isn’t supported by this browser.`);
  let src = canvas;
  if (!FORMATS[format].alpha) {
    src = createCanvas(canvas.width, canvas.height);
    const ctx = ctx2d(src);
    ctx.fillStyle = matte;
    ctx.fillRect(0, 0, src.width, src.height);
    ctx.drawImage(canvas, 0, 0);
  }
  const blob = await canvasToBlob(src, FORMATS[format].mime, FORMATS[format].lossy ? quality / 100 : undefined);
  if (src !== canvas) src.width = src.height = 0;
  return { blob, format };
}

export function withExtension(name: string, format: OutFormat): string {
  return `${name.replace(/\.[a-z0-9]{2,5}$/i, '')}.${FORMATS[format].ext}`;
}

/** True if any pixel is not fully opaque (sampled on a reduced copy). */
export function hasTransparency(src: CanvasImageSource & { width: number; height: number }): boolean {
  const k = Math.min(1, 512 / Math.max(src.width, src.height));
  const c = createCanvas(Math.max(1, Math.round(src.width * k)), Math.max(1, Math.round(src.height * k)));
  const ctx = ctx2d(c, { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
}

import { constrainSource, createCanvas, ctx2d, decodeImage, type ImageSource } from '../../engine/images';
import { uid } from '../../lib/utils';

/**
 * Centralized image loading for Image Tools: validation, decoding, object
 * URL bookkeeping and memory release.
 */

export const ACCEPT = 'image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp';
const EXT_RE = /\.(png|jpe?g|webp|avif|gif|bmp)$/i;
export const MAX_FILE_BYTES = 150 * 1024 * 1024;

export interface LoadedImage {
  id: string;
  file: Blob;
  name: string;
  size: number;
  /** MIME type as reported (or inferred from the extension). */
  type: string;
  lastModified: number | null;
  width: number;
  height: number;
  /** Decoded pixels (EXIF orientation applied). */
  source: ImageSource;
  /** Object URL of the original file, for <img> previews. */
  url: string;
  /** True when the image was downscaled to fit browser canvas limits. */
  scaled: boolean;
}

export class ImageLoadError extends Error {}

function inferType(file: Blob & { name?: string }): string {
  if (file.type) return file.type;
  const m = file.name?.match(EXT_RE)?.[1]?.toLowerCase();
  if (!m) return '';
  return m === 'jpg' ? 'image/jpeg' : `image/${m}`;
}

export function isSupportedFile(file: Blob & { name?: string }): boolean {
  const t = inferType(file);
  return /^image\/(png|jpeg|webp|avif|gif|bmp)$/.test(t) || (!!file.name && EXT_RE.test(file.name));
}

/** Validate and decode an image file. Throws ImageLoadError with a readable message. */
export async function loadImage(file: Blob & { name?: string; lastModified?: number }): Promise<LoadedImage> {
  const name = file.name || 'image.png';
  if (!isSupportedFile(file)) {
    throw new ImageLoadError(`“${name}” isn’t a supported image. Use PNG, JPEG, WebP, AVIF, GIF or BMP.`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ImageLoadError(`“${name}” is larger than 150 MB.`);
  }
  let decoded: ImageSource;
  try {
    decoded = await decodeImage(file);
  } catch {
    throw new ImageLoadError(`“${name}” couldn’t be decoded. The file may be damaged or in a format this browser can’t read.`);
  }
  const [source, scaled] = constrainSource(decoded);
  return {
    id: uid('img'),
    file,
    name,
    size: file.size,
    type: inferType(file),
    lastModified: file.lastModified ?? null,
    width: source.width,
    height: source.height,
    source,
    url: URL.createObjectURL(file),
    scaled,
  };
}

/** Free the object URL and bitmap memory held by an image. */
export function releaseImage(img: LoadedImage | null | undefined) {
  if (!img) return;
  URL.revokeObjectURL(img.url);
  if ('close' in img.source && typeof (img.source as ImageBitmap).close === 'function') {
    (img.source as ImageBitmap).close();
  } else if (img.source instanceof HTMLCanvasElement) {
    img.source.width = img.source.height = 0;
  }
}

export function toCanvas(src: ImageSource): HTMLCanvasElement {
  const c = createCanvas(src.width, src.height);
  ctx2d(c).drawImage(src, 0, 0);
  return c;
}

export function baseName(name: string): string {
  return name.replace(/\.[a-z0-9]{2,5}$/i, '') || 'image';
}

export function formatFromType(type: string): 'png' | 'jpeg' | 'webp' | 'avif' | null {
  const m = type.match(/^image\/(png|jpeg|webp|avif)$/);
  return (m?.[1] as 'png' | 'jpeg' | 'webp' | 'avif') ?? null;
}

/** Greatest-common-divisor aspect label, e.g. "16:9" or "1.91:1". */
export function aspectLabel(w: number, h: number): string {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const g = gcd(w, h);
  const a = w / g;
  const b = h / g;
  if (a <= 32 && b <= 32) return `${a}:${b}`;
  return w >= h ? `${(w / h).toFixed(2)}:1` : `1:${(h / w).toFixed(2)}`;
}

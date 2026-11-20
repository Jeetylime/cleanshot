import { crc32 } from '../tools/shared/zip';

/**
 * Read the pixel density from a PNG's pHYs chunk. macOS writes 144 DPI for
 * Retina screenshots, which lets us pick annotation sizes that look right.
 * Returns null when unavailable.
 */
export async function readPngDpi(blob: Blob): Promise<number | null> {
  if (blob.type && blob.type !== 'image/png') return null;
  try {
    const buf = new DataView(await blob.slice(0, 65536).arrayBuffer());
    if (buf.byteLength < 33 || buf.getUint32(0) !== 0x89504e47) return null;
    let off = 8;
    while (off + 12 <= buf.byteLength) {
      const len = buf.getUint32(off);
      const type = buf.getUint32(off + 4);
      if (type === 0x70485973 /* pHYs */ && off + 8 + 9 <= buf.byteLength) {
        const ppx = buf.getUint32(off + 8);
        const unit = buf.getUint8(off + 16);
        if (unit === 1 && ppx > 0) return ppx * 0.0254;
        return null;
      }
      if (type === 0x49444154 /* IDAT */) return null;
      off += 12 + len;
    }
  } catch {
    /* ignore */
  }
  return null;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Return PNG bytes with a pHYs chunk for `dpi` (replacing any existing one),
 * so apps that honor pixel density (Preview, Keynote, Pages, Slack...) show a
 * Retina image at its intended size. The chunk goes right after IHDR, as the
 * spec requires it before IDAT. Returns the input unchanged if it isn't a PNG.
 */
export function withPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  if (png.length < 33 || PNG_SIGNATURE.some((b, i) => png[i] !== b) || !(dpi > 0)) return png;
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const ihdrEnd = 8 + 12 + dv.getUint32(8);
  const parts: Uint8Array[] = [png.subarray(0, ihdrEnd)];
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const cv = new DataView(chunk.buffer);
  cv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // pHYs
  cv.setUint32(8, ppm);
  cv.setUint32(12, ppm);
  chunk[16] = 1; // unit: meter
  cv.setUint32(17, crc32(chunk.subarray(4, 17)));
  parts.push(chunk);
  // Copy the remaining chunks, dropping any existing pHYs.
  let off = ihdrEnd;
  while (off + 12 <= png.length) {
    const len = dv.getUint32(off);
    const end = off + 12 + len;
    if (end > png.length) return png; // truncated: leave untouched
    if (dv.getUint32(off + 4) !== 0x70485973) parts.push(png.subarray(off, end));
    off = end;
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Blob wrapper for withPngDpi. */
export async function setPngDpi(blob: Blob, dpi: number): Promise<Blob> {
  if (blob.type !== 'image/png') return blob;
  const bytes = withPngDpi(new Uint8Array(await blob.arrayBuffer()), dpi);
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' });
}

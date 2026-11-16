import { crc32 } from './zip';
import { buildPalette, exactPalette, remap } from './quantize';

/**
 * Indexed (palette) PNG encoder. Uses the browser's native zlib via
 * CompressionStream, and packs pixels at 1/2/4/8 bits depending on the
 * palette size.
 */

export function pngOptimizationSupported(): boolean {
  return typeof CompressionStream !== 'undefined';
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeIndexedPng(indices: Uint8Array, w: number, h: number, palette: Uint8Array, count: number): Promise<Blob> {
  const depth = count <= 2 ? 1 : count <= 4 ? 2 : count <= 16 ? 4 : 8;
  const perByte = 8 / depth;
  const rowBytes = Math.ceil(w / perByte);
  const raw = new Uint8Array((rowBytes + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (rowBytes + 1);
    raw[row] = 0; // filter: none (best for palette images)
    if (depth === 8) {
      raw.set(indices.subarray(y * w, y * w + w), row + 1);
    } else {
      for (let x = 0; x < w; x++) {
        const v = indices[y * w + x];
        const byte = row + 1 + Math.floor(x / perByte);
        const shift = 8 - depth * ((x % perByte) + 1);
        raw[byte] |= v << shift;
      }
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = depth;
  ihdr[9] = 3; // indexed color
  const plte = new Uint8Array(count * 3);
  let lastAlpha = -1;
  for (let i = 0; i < count; i++) {
    plte[i * 3] = palette[i * 4];
    plte[i * 3 + 1] = palette[i * 4 + 1];
    plte[i * 3 + 2] = palette[i * 4 + 2];
    if (palette[i * 4 + 3] < 255) lastAlpha = i;
  }
  const parts: Uint8Array[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', plte)];
  if (lastAlpha >= 0) {
    const trns = new Uint8Array(lastAlpha + 1);
    for (let i = 0; i <= lastAlpha; i++) trns[i] = palette[i * 4 + 3];
    parts.push(chunk('tRNS', trns));
  }
  parts.push(chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0)));
  return new Blob(parts as Uint8Array<ArrayBuffer>[], { type: 'image/png' });
}

/**
 * Optimize RGBA pixels as a palette PNG.
 * - colors = null: lossless; succeeds only when the image has ≤256 colors.
 * - colors = n: quantize to n colors (lossy), optionally dithered.
 */
export async function optimizePng(img: ImageData, colors: number | null, dither: boolean): Promise<Blob | null> {
  const exact = exactPalette(img.data, colors ?? 256);
  if (exact) return encodeIndexedPng(exact.indices, img.width, img.height, exact.palette, exact.count);
  if (colors === null) return null;
  const { palette, count } = buildPalette(img.data, colors);
  const indices = remap(img.data, img.width, img.height, palette, count, dither);
  return encodeIndexedPng(indices, img.width, img.height, palette, count);
}

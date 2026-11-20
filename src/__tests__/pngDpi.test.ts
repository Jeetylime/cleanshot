import { describe, expect, it } from 'vitest';
import { readPngDpi, withPngDpi } from '../lib/png';
import { crc32 } from '../tools/shared/zip';

function chunk(type: string, data: number[]): number[] {
  const body = [...type].map((c) => c.charCodeAt(0)).concat(data);
  const len = data.length;
  const crc = crc32(new Uint8Array(body));
  return [len >>> 24, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...body, crc >>> 24, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255];
}

// A structurally valid 1×1 PNG (the IDAT payload isn't decoded by these tests).
const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
const IDAT = chunk('IDAT', [1, 2, 3]);
const IEND = chunk('IEND', []);
const png = (...chunks: number[][]) => new Uint8Array([...SIG, ...chunks.flat()]);
const blob = (b: Uint8Array) => new Blob([b as Uint8Array<ArrayBuffer>], { type: 'image/png' });

function chunkTypes(b: Uint8Array): string[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: string[] = [];
  for (let off = 8; off + 12 <= b.length; off += 12 + dv.getUint32(off)) out.push(String.fromCharCode(...b.subarray(off + 4, off + 8)));
  return out;
}

describe('withPngDpi', () => {
  it('inserts pHYs right after IHDR and round-trips through readPngDpi', async () => {
    const out = withPngDpi(png(IHDR, IDAT, IEND), 144);
    expect(chunkTypes(out)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']);
    expect(await readPngDpi(blob(out))).toBeCloseTo(144, 1);
  });

  it('replaces an existing pHYs chunk instead of adding a second one', async () => {
    const once = withPngDpi(png(IHDR, IDAT, IEND), 72);
    const twice = withPngDpi(once, 216);
    expect(chunkTypes(twice)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']);
    expect(await readPngDpi(blob(twice))).toBeCloseTo(216, 1);
  });

  it('writes a valid CRC for the new chunk', () => {
    const out = withPngDpi(png(IHDR, IDAT, IEND), 144);
    const start = SIG.length + IHDR.length;
    const dv = new DataView(out.buffer);
    expect(dv.getUint32(start + 17)).toBe(crc32(out.subarray(start + 4, start + 17)));
  });

  it('leaves non-PNG or truncated input untouched', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(40).fill(0)]);
    expect(withPngDpi(jpeg, 144)).toBe(jpeg);
    // IDAT claims 100 bytes but the file ends early.
    const truncated = png(IHDR, [0, 0, 0, 100, 0x49, 0x44, 0x41, 0x54, 1, 2, 3, 0, 0, 0, 0]);
    expect(withPngDpi(truncated, 144)).toBe(truncated);
  });
});

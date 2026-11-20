import { describe, expect, it } from 'vitest';
import { encodeGif, lzwEncode } from '../lib/gif';

/** Reference GIF LZW decoder (as browsers implement it). */
function lzwDecode(data: Uint8Array, pixelCount: number): Uint8Array {
  const minCodeSize = data[0];
  // Join sub-blocks.
  const bytes: number[] = [];
  let p = 1;
  while (data[p] !== 0) {
    const n = data[p++];
    for (let i = 0; i < n; i++) bytes.push(data[p++]);
  }
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let dict: number[][] = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < clear; i++) dict[i] = [i];
    dict[clear] = [];
    dict[eoi] = [];
    codeSize = minCodeSize + 1;
  };
  reset();
  const out: number[] = [];
  let bit = 0;
  let prev: number[] | null = null;
  const read = () => {
    let v = 0;
    for (let i = 0; i < codeSize; i++, bit++) v |= ((bytes[bit >> 3] >> (bit & 7)) & 1) << i;
    return v;
  };
  while (bit + codeSize <= bytes.length * 8) {
    const code = read();
    if (code === clear) {
      reset();
      prev = null;
      continue;
    }
    if (code === eoi) break;
    let entry: number[];
    if (code < dict.length) entry = dict[code];
    else if (prev) entry = [...prev, prev[0]];
    else throw new Error('bad code');
    out.push(...entry);
    if (prev) {
      dict.push([...prev, entry[0]]);
      if (dict.length === 1 << codeSize && codeSize < 12) codeSize++;
    }
    prev = entry;
  }
  expect(out.length).toBe(pixelCount);
  return new Uint8Array(out);
}

describe('GIF encoder', () => {
  it('LZW round-trips small, repetitive and long random data', () => {
    const cases: [Uint8Array, number][] = [
      [new Uint8Array([0, 1, 0, 1]), 2],
      [new Uint8Array(5000).fill(3), 2],
      [Uint8Array.from({ length: 70_000 }, (_, i) => (i * 7919 + (i >> 3)) % 256), 8],
      [Uint8Array.from({ length: 20_000 }, () => Math.floor(Math.random() * 16)), 4],
    ];
    for (const [data, min] of cases) expect(lzwDecode(lzwEncode(data, min), data.length)).toEqual(data);
  });

  it('writes a well-formed animated GIF', async () => {
    const w = 8;
    const h = 4;
    const frame = (r: number) => ({ data: Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) => (i % 4 === 3 ? 255 : i % 4 === 0 ? r : 40)), delay: 500 });
    const blob = await encodeGif([frame(255), frame(0)], { width: w, height: h });
    const b = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(...b.subarray(0, 6))).toBe('GIF89a');
    expect(b[6] | (b[7] << 8)).toBe(w);
    expect(b[b.length - 1]).toBe(0x3b);
    expect(new TextDecoder().decode(b).includes('NETSCAPE2.0')).toBe(true);
  });
});

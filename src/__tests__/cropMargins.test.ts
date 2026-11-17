import { describe, expect, it } from 'vitest';
import { contentBounds } from '../pdf/tools/CropMargins';

function page(w: number, h: number, ink: [number, number, number, number][]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const [x, y, bw, bh] of ink) for (let yy = y; yy < y + bh; yy++) for (let xx = x; xx < x + bw; xx++) d.set([0, 0, 0, 255], (yy * w + xx) * 4);
  return d;
}

describe('contentBounds', () => {
  it('finds the box around all content', () => {
    expect(contentBounds(page(100, 80, [[10, 20, 5, 5], [60, 50, 10, 4]]), 100, 80)).toEqual({ x: 10, y: 20, w: 60, h: 34 });
  });
  it('returns null for a blank page', () => {
    expect(contentBounds(page(20, 20, []), 20, 20)).toBeNull();
  });
  it('ignores near-white noise below the threshold', () => {
    const d = page(10, 10, []);
    d.set([245, 245, 245, 255], 0);
    expect(contentBounds(d, 10, 10)).toBeNull();
  });
});

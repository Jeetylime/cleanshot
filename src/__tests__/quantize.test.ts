import { describe, expect, it } from 'vitest';
import { buildPalette, dominantColors, exactPalette, remap } from '../tools/shared/quantize';

function image(colors: [number, number, number, number][], repeat = 50): Uint8ClampedArray {
  const out = new Uint8ClampedArray(colors.length * repeat * 4);
  for (let i = 0; i < colors.length * repeat; i++) out.set(colors[i % colors.length], i * 4);
  return out;
}

describe('quantize', () => {
  it('finds an exact palette for few-color images', () => {
    const data = image([[255, 0, 0, 255], [0, 0, 255, 255], [0, 0, 0, 0]]);
    const p = exactPalette(data);
    expect(p).not.toBeNull();
    expect(p!.count).toBe(3);
    expect(p!.indices.length).toBe(data.length / 4);
  });

  it('gives up on an exact palette past the limit', () => {
    const colors: [number, number, number, number][] = Array.from({ length: 300 }, (_, i) => [i % 256, (i * 7) % 256, i >> 8, 255]);
    expect(exactPalette(image(colors, 1), 256)).toBeNull();
  });

  it('builds a bounded palette and remaps every pixel into it', () => {
    const colors: [number, number, number, number][] = Array.from({ length: 64 }, (_, i) => [i * 4, 255 - i * 4, (i * 13) % 256, 255]);
    const data = image(colors, 4);
    const pal = buildPalette(data, 16);
    expect(pal.count).toBeLessThanOrEqual(16);
    const idx = remap(data, data.length / 4, 1, pal.palette, pal.count, false);
    expect(Math.max(...idx)).toBeLessThan(pal.count);
  });

  it('reports dominant colors with shares summing to ~1', () => {
    const d = dominantColors(image([[250, 10, 10, 255], [250, 10, 10, 255], [250, 10, 10, 255], [10, 10, 250, 255]]), 2);
    expect(d[0].rgb[0]).toBeGreaterThan(200);
    expect(d.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 1);
  });
});

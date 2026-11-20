import { describe, expect, it } from 'vitest';
import { loopArea, simplifyLoop, traceLoops, traceToSvg } from '../tools/trace/trace';

function maskFrom(rows: string[]): [Uint8Array, number, number] {
  const h = rows.length;
  const w = rows[0].length;
  const m = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => (m[y * w + x] = c === '#' ? 1 : 0)));
  return [m, w, h];
}

describe('tracer', () => {
  it('outlines a square as one loop with 4 corners', () => {
    const [m, w, h] = maskFrom(['....', '.##.', '.##.', '....']);
    const loops = traceLoops(m, w, h);
    expect(loops).toHaveLength(1);
    const s = simplifyLoop(loops[0], 0);
    expect(s).toHaveLength(4);
    expect(Math.abs(loopArea(s))).toBe(4);
  });

  it('finds the hole of a ring (opposite winding)', () => {
    const [m, w, h] = maskFrom(['#####', '#...#', '#...#', '#####']);
    const loops = traceLoops(m, w, h).map((l) => simplifyLoop(l, 0));
    expect(loops).toHaveLength(2);
    const areas = loops.map(loopArea).sort((a, b) => Math.abs(b) - Math.abs(a));
    expect(Math.abs(areas[0])).toBe(20);
    expect(Math.abs(areas[1])).toBe(6);
    expect(Math.sign(areas[0])).not.toBe(Math.sign(areas[1]));
  });

  it('keeps diagonal neighbors as separate loops', () => {
    const [m, w, h] = maskFrom(['#.', '.#']);
    const loops = traceLoops(m, w, h);
    expect(loops).toHaveLength(2);
    expect(loops.every((l) => Math.abs(loopArea(simplifyLoop(l, 0))) === 1)).toBe(true);
  });

  it('covers every edge: total enclosed area equals the pixel count', () => {
    const rows = Array.from({ length: 30 }, (_, y) => Array.from({ length: 30 }, (_, x) => ((x * 7 + y * 13) % 5 < 2 ? '#' : '.')).join(''));
    const [m, w, h] = maskFrom(rows);
    const total = traceLoops(m, w, h).reduce((s, l) => s + loopArea(l), 0);
    expect(Math.abs(total)).toBe(m.reduce((s, v) => s + v, 0));
  });

  it('produces an SVG with one path per color', () => {
    const w = 20;
    const h = 10;
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(x < 10 ? [255, 0, 0, 255] : [0, 0, 255, 255], (y * w + x) * 4);
    const r = traceToSvg(d, w, h, { colors: 2, tolerance: 0.5, minArea: 0, smooth: false });
    expect(r.paths).toBe(2);
    expect(r.svg).toContain('fill="#ff0000"');
    expect(r.svg).toContain('fill="#0000ff"');
  });
});

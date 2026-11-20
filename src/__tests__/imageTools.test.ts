import { describe, expect, it } from 'vitest';
import { renameAll, renameOne } from '../tools/rename/pattern';
import { gridTiles } from '../tools/splitter/split';
import { packGrid, spriteCss } from '../tools/sprites/pack';
import { applyAdjustments, NEUTRAL, toneCurve } from '../tools/filters/adjust';
import { diffPixels } from '../tools/diff/compare';

const opts = { pattern: '{name}-{n:3}', start: 1, step: 1, case: 'keep' as const, safe: true };

describe('batch rename', () => {
  it('expands tokens and keeps the extension', () => {
    const d = new Date(2026, 0, 5, 9, 8, 7).getTime();
    expect(renameOne({ name: 'IMG 1.JPG', lastModified: d, width: 10, height: 20 }, 4, { ...opts, pattern: 'trip_{date}_{n:2}_{w}x{h}' })).toBe('trip_2026-01-05_05_10x20.jpg');
    expect(renameOne({ name: 'a.png', lastModified: null }, 0, opts)).toBe('a-001.png');
    expect(renameOne({ name: 'My Photo.png', lastModified: null }, 0, { ...opts, pattern: '{name} {n}', case: 'kebab' })).toBe('my-photo-1.png');
    expect(renameOne({ name: 'x.png', lastModified: null }, 0, { ...opts, pattern: 'a/b:c' })).toBe('a-b-c.png');
  });
  it('makes duplicate names unique', () => {
    expect(renameAll([{ name: 'a.png', lastModified: null }, { name: 'a.png', lastModified: null }], { ...opts, pattern: 'same' })).toEqual(['same.png', 'same (2).png']);
  });
});

describe('splitter', () => {
  it('covers every pixel exactly once', () => {
    const t = gridTiles(1001, 500, 3, 4);
    expect(t).toHaveLength(12);
    expect(t.reduce((s, x) => s + x.w * x.h, 0)).toBe(1001 * 500);
  });
  it('square tiles are square and centered', () => {
    const t = gridTiles(3000, 1000, 1, 3, true);
    expect(t.every((x) => x.w === 1000 && x.h === 1000)).toBe(true);
  });
});

describe('sprite sheet', () => {
  it('packs into a grid with padding and writes CSS', () => {
    const l = packGrid([{ name: 'a.png', width: 10, height: 10 }, { name: 'b.png', width: 6, height: 8 }, { name: 'c.png', width: 10, height: 4 }], 2, 2);
    expect([l.width, l.height]).toEqual([2 + 2 * 12, 2 + 2 * 12]);
    expect(l.frames[1]).toEqual({ name: 'b.png', x: 16, y: 3, w: 6, h: 8 });
    expect(spriteCss(l, 'sheet.png')).toContain('.sprite-b { width: 6px; height: 8px; background-position: -16px -3px; }');
  });
});

describe('filters', () => {
  it('neutral settings leave pixels untouched', () => {
    const d = Uint8ClampedArray.from([10, 100, 200, 255]);
    applyAdjustments(d, 1, 1, NEUTRAL);
    expect([...d]).toEqual([10, 100, 200, 255]);
    expect(toneCurve(NEUTRAL)[128]).toBe(128);
  });
  it('grayscale equalizes channels and keeps alpha', () => {
    const d = Uint8ClampedArray.from([200, 50, 20, 77]);
    applyAdjustments(d, 1, 1, { ...NEUTRAL, grayscale: 100 });
    expect(d[0]).toBe(d[1]);
    expect(d[1]).toBe(d[2]);
    expect(d[3]).toBe(77);
  });
});

describe('image diff', () => {
  it('counts changed pixels and their bounds', () => {
    const a = new Uint8ClampedArray(4 * 4 * 4).fill(255);
    const b = a.slice();
    b[(1 * 4 + 2) * 4] = 0;
    const r = diffPixels(a, b, 4, 4, 10);
    expect(r.changed).toBe(1);
    expect(r.bounds).toEqual({ x: 2, y: 1, w: 1, h: 1 });
  });
});

import { cropRect, fitSize } from '../tools/workflow/steps';
describe('workflow geometry', () => {
  it('center-crops to a ratio', () => {
    expect(cropRect(1000, 500, '1:1')).toEqual({ x: 250, y: 0, w: 500, h: 500 });
    expect(cropRect(1000, 2000, '4:5')).toEqual({ x: 0, y: 375, w: 1000, h: 1250 });
  });
  it('fits without enlarging unless asked', () => {
    expect(fitSize(4000, 3000, 1600, 1600, false)).toEqual({ w: 1600, h: 1200 });
    expect(fitSize(800, 600, 1600, 1600, false)).toEqual({ w: 800, h: 600 });
    expect(fitSize(800, 600, 1600, 1600, true)).toEqual({ w: 1600, h: 1200 });
  });
});

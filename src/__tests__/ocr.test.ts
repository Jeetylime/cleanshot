import { describe, expect, it } from 'vitest';
import { findSensitive, linesToText, mergeLines, ocrTiles } from '../tools/ai/ocr';

describe('OCR tiling', () => {
  it('keeps small images whole and covers large ones with overlap', () => {
    expect(ocrTiles(800, 600)).toEqual([{ x: 0, y: 0, w: 800, h: 600 }]);
    const t = ocrTiles(2360, 1480);
    expect(t.length).toBeGreaterThan(1);
    expect(Math.max(...t.map((x) => x.x + x.w))).toBe(2360);
    expect(Math.max(...t.map((x) => x.y + x.h))).toBe(1480);
    expect(t.every((x) => x.w <= 1200 + 1 && x.h <= 1200 + 1)).toBe(true);
  });
});

describe('merging and text', () => {
  it('drops overlap duplicates and orders lines', () => {
    const l = mergeLines([
      { text: 'Hello world', x: 0, y: 0, w: 110, h: 10 },
      { text: 'Hello wo', x: 0, y: 0, w: 80, h: 10 },
      { text: 'second', x: 0, y: 20, w: 60, h: 10 },
      { text: 'right', x: 200, y: 1, w: 50, h: 10 },
    ]);
    expect(l.map((x) => x.text)).toEqual(['Hello world', 'right', 'second']);
    expect(linesToText(l)).toBe('Hello world   right\nsecond');
  });
});

describe('sensitive data', () => {
  it('finds emails, keys and cards with boxes inside the line', () => {
    const f = findSensitive([
      { text: 'Contact: finance@northwind.io', x: 100, y: 10, w: 290, h: 20 },
      { text: 'nw_live_8Hc2Qx7eZvKYmo4C9f3Tq8PxWnR7', x: 0, y: 50, w: 360, h: 20 },
      { text: 'Card 4242 4242 4242 4242 exp 08/28', x: 0, y: 90, w: 340, h: 20 },
      { text: 'Billing Overview', x: 0, y: 130, w: 160, h: 20 },
    ]);
    expect(f.map((x) => x.kind)).toEqual(['email', 'key', 'card']);
    // A split token after a label is still covered (value only, not the label).
    const g = findSensitive([{ text: 'API key: sk live 51Hxq2e2vky mo4c9tQ8pxWnR7', x: 0, y: 0, w: 430, h: 20 }]);
    expect(g.map((x) => [x.kind, x.text])).toEqual([['secret', 'sk live 51Hxq2e2vky mo4c9tQ8pxWnR7']]);
    expect(g[0].x).toBeGreaterThan(80);
    expect(f[0].x).toBeGreaterThan(150);
    expect(f[0].x + f[0].w).toBeLessThanOrEqual(395);
  });
});

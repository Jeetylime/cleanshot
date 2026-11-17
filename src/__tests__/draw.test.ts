import { describe, expect, it } from 'vitest';
import { hitStroke, localPoints, makeDraw, simplify, strokePathD } from '../studio/draw';
import { matchesQuery } from '../studio/search';

describe('makeDraw', () => {
  const pts = [{ x: 100, y: 100 }, { x: 200, y: 150 }, { x: 300, y: 100 }];
  const e = makeDraw(pts, { brush: 'marker', color: '#f00', strokeWidth: 10 });
  it('pads the box by half the stroke width', () => {
    expect(e).toMatchObject({ x: 95, y: 95, w: 210, h: 60, type: 'draw', name: 'Marker' });
  });
  it('stores points relative to the box and restores them', () => {
    expect(e.points.every((v) => v >= 0 && v <= 1)).toBe(true);
    const back = localPoints(e).map((p) => ({ x: Math.round(p.x + e.x), y: Math.round(p.y + e.y) }));
    expect(back).toEqual(pts);
  });
  it('highlighter defaults to translucent ink', () => {
    expect(makeDraw(pts, { brush: 'highlighter', color: '#ff0', strokeWidth: 20 }).opacity).toBeLessThan(1);
  });
});

describe('stroke path & hit-testing', () => {
  const e = makeDraw([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }], { brush: 'pen', color: '#000', strokeWidth: 4 });
  it('builds a smoothed path starting at the first point', () => {
    const d = strokePathD(e);
    expect(d.startsWith('M2 2')).toBe(true);
    expect(d).toContain('Q');
  });
  it('a single tap still draws a dot', () => {
    expect(strokePathD(makeDraw([{ x: 5, y: 5 }], { brush: 'pen', color: '#000', strokeWidth: 4 }))).toMatch(/^M.*L/);
  });
  it('hits only near the ink', () => {
    expect(hitStroke(e, { x: 52, y: 2 }, 0)).toBe(true);
    expect(hitStroke(e, { x: 52, y: 30 }, 0)).toBe(false);
    expect(hitStroke(e, { x: 52, y: 7 }, 4)).toBe(true);
  });
});

describe('simplify', () => {
  it('drops points closer than the minimum distance but keeps the ends', () => {
    const pts = [{ x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 0.4, y: 0 }, { x: 5, y: 0 }, { x: 5.1, y: 0 }];
    expect(simplify(pts, 1)).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5.1, y: 0 }]);
  });
});

describe('matchesQuery', () => {
  it('matches every word, ignoring case and dashes', () => {
    expect(matchesQuery('Arrow up', 'arrow-up-right', 'icon')).toBe(true);
    expect(matchesQuery('circle', 'Ellipse', 'circle oval')).toBe(true);
    expect(matchesQuery('red circle', 'Ellipse', 'circle oval')).toBe(false);
    expect(matchesQuery('  ', 'anything')).toBe(true);
  });
});

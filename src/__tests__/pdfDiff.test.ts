import { describe, expect, it } from 'vitest';
import { diffText, myers, sides } from '../pdf/diff';

describe('myers', () => {
  it('finds a minimal edit script', () => {
    const ops = myers([...'ABCABBA'], [...'CBABAC'])!;
    expect(ops.filter((o) => o.op !== 'eq')).toHaveLength(5);
    const a = ops.filter((o) => o.op !== 'ins').map((o) => o.text).join('');
    const b = ops.filter((o) => o.op !== 'del').map((o) => o.text).join('');
    expect([a, b]).toEqual(['ABCABBA', 'CBABAC']);
  });
  it('handles empty sides and identical input', () => {
    expect(myers([], ['x'])).toEqual([{ op: 'ins', text: 'x' }]);
    expect(myers(['x'], [])).toEqual([{ op: 'del', text: 'x' }]);
    expect(myers(['a', 'b'], ['a', 'b'])!.every((o) => o.op === 'eq')).toBe(true);
  });
  it('random inputs always reconstruct both sides', () => {
    for (let t = 0; t < 200; t++) {
      const r = (n: number) => Array.from({ length: n }, () => 'abc'[Math.floor(Math.random() * 3)]);
      const a = r(Math.floor(Math.random() * 30));
      const b = r(Math.floor(Math.random() * 30));
      const ops = myers(a, b)!;
      expect(ops.filter((o) => o.op !== 'ins').map((o) => o.text)).toEqual(a);
      expect(ops.filter((o) => o.op !== 'del').map((o) => o.text)).toEqual(b);
    }
  });
});

describe('diffText', () => {
  it('marks changed words inside changed lines', () => {
    const a = 'Title\nThe fee is 10 dollars.\nEnd\n';
    const b = 'Title\nThe fee is 12 dollars.\nEnd\n';
    const ops = diffText(a, b);
    expect(sides(ops)).toEqual([a, b]);
    expect(ops.find((o) => o.op === 'del')?.text).toBe('10');
    expect(ops.find((o) => o.op === 'ins')?.text).toBe('12');
  });
});

describe('diffText round trip', () => {
  it('reconstructs random multi-line texts exactly', () => {
    const w = () => ['alpha', 'beta', 'gamma', 'delta'][Math.floor(Math.random() * 4)];
    const text = () => Array.from({ length: 1 + Math.floor(Math.random() * 6) }, () => Array.from({ length: 1 + Math.floor(Math.random() * 5) }, w).join(' ')).join('\n');
    for (let t = 0; t < 100; t++) {
      const a = text();
      const b = text();
      expect(sides(diffText(a, b))).toEqual([a, b]);
    }
  });
});

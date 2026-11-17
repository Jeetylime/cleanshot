import { describe, expect, it } from 'vitest';
import { formatRanges, parseRanges } from '../pdf/engine';

describe('parseRanges', () => {
  it('parses lists, ranges and open ranges', () => {
    expect(parseRanges('1-3, 5', 10)).toEqual([1, 2, 3, 5]);
    expect(parseRanges('8-', 10)).toEqual([8, 9, 10]);
    expect(parseRanges('-2', 10)).toEqual([1, 2]);
    expect(parseRanges('3-1', 10)).toEqual([1, 2, 3]);
  });
  it('rejects out-of-range and malformed input', () => {
    expect(parseRanges('0', 5)).toBeNull();
    expect(parseRanges('6', 5)).toBeNull();
    expect(parseRanges('a', 5)).toBeNull();
    expect(parseRanges('', 5)).toBeNull();
  });
  it('round-trips through formatRanges', () => {
    const pages = [1, 2, 3, 5, 7, 8];
    expect(parseRanges(formatRanges(pages).replace(/–/g, '-'), 10)).toEqual(pages);
  });
});

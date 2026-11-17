import { describe, expect, it } from 'vitest';
import { trimHistoryToBudget } from '../store/history';

// Each "doc" is just the image id it shows; every image costs 10 bytes.
const imgs = (d: string) => [d, 'orig'];
const bytes = () => 10;

describe('trimHistoryToBudget', () => {
  it('leaves history alone when under budget', () => {
    const past = ['a', 'b'];
    const r = trimHistoryToBudget('c', past, [], imgs, bytes, 1000);
    expect(r.past).toBe(past);
    expect(r.dropped).toEqual([]);
  });

  it('drops the oldest undo steps first and reports released images', () => {
    const r = trimHistoryToBudget('d', ['a', 'b', 'c'], [], imgs, bytes, 30);
    // orig + d + c = 30 bytes
    expect(r.past).toEqual(['c']);
    expect(r.dropped.sort()).toEqual(['a', 'b']);
  });

  it('then trims the farthest redo steps, never the current document', () => {
    const r = trimHistoryToBudget('a', [], ['b', 'c', 'd'], imgs, bytes, 20);
    expect(r.future).toEqual([]);
    expect(r.dropped).not.toContain('a');
    expect(r.dropped).not.toContain('orig');
  });

  it('keeps images still referenced by a remaining step', () => {
    const r = trimHistoryToBudget('b', ['a', 'b2', 'a'], [], (d) => [d.replace('2', '')], bytes, 20);
    expect(r.dropped).toEqual([]);
  });
});

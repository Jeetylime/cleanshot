import { describe, expect, it } from 'vitest';
import { fitQuality } from '../tools/shared/targetSize';

const fake = (perQ: number) => async (q: number) => ({ size: q * perQ });

describe('fitQuality', () => {
  it('finds the highest quality under the target', async () => {
    const r = await fitQuality(fake(1000), 50_500);
    expect(r).toMatchObject({ quality: 50, fits: true });
  });
  it('uses the maximum quality when everything fits', async () => {
    expect((await fitQuality(fake(10), 1e9)).quality).toBe(95);
  });
  it('falls back to the lowest quality when nothing fits', async () => {
    const r = await fitQuality(fake(1000), 100);
    expect(r).toMatchObject({ quality: 10, fits: false });
    expect(r.result.size).toBe(10_000);
  });
  it('needs only a handful of encodes', async () => {
    let calls = 0;
    await fitQuality(async (q) => (calls++, { size: q }), 40);
    expect(calls).toBeLessThanOrEqual(8);
  });
});

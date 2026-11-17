/**
 * Binary-search the highest quality (lo..hi, integers) whose encoded size fits
 * `target` bytes. Encoded size grows with quality, so this needs about
 * log2(hi - lo) encodes. Returns the best fit, or the lowest quality's result
 * when even that is too big.
 */
export async function fitQuality<T extends { size: number }>(
  encode: (quality: number) => Promise<T>,
  target: number,
  lo = 10,
  hi = 95,
): Promise<{ quality: number; result: T; fits: boolean }> {
  let best: { quality: number; result: T } | null = null;
  let low = lo;
  let high = hi;
  let smallest: { quality: number; result: T } | null = null;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const result = await encode(mid);
    if (!smallest || mid < smallest.quality) smallest = { quality: mid, result };
    if (result.size <= target) {
      best = { quality: mid, result };
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (best) return { ...best, fits: true };
  if (smallest!.quality !== lo) smallest = { quality: lo, result: await encode(lo) };
  return { ...smallest!, fits: smallest!.result.size <= target };
}

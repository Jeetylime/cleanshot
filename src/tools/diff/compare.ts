/**
 * Pixel difference between two same-size RGBA buffers. A pixel counts as
 * changed when any channel differs by more than `threshold` (0–255).
 * Returns a visualization (changed pixels in `color`, the rest dimmed) and stats.
 */
export function diffPixels(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  w: number,
  h: number,
  threshold: number,
  color: [number, number, number] = [255, 45, 85],
): { image: Uint8ClampedArray; changed: number; total: number; bounds: { x: number; y: number; w: number; h: number } | null } {
  const out = new Uint8ClampedArray(w * h * 4);
  let changed = 0;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]), Math.abs(a[i + 3] - b[i + 3]));
      if (d > threshold) {
        changed++;
        out[i] = color[0];
        out[i + 1] = color[1];
        out[i + 2] = color[2];
        out[i + 3] = 255;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      } else {
        // Faded grayscale context.
        const l = (0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2]) * 0.25 + 190;
        out[i] = out[i + 1] = out[i + 2] = l;
        out[i + 3] = 255;
      }
    }
  }
  return { image: out, changed, total: w * h, bounds: x1 >= 0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null };
}

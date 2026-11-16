/**
 * Median-cut color quantization (RGBA) with optional Floyd–Steinberg
 * dithering. Used for PNG optimization and palette extraction.
 */

export interface QuantizeResult {
  /** RGBA palette, `count` entries. */
  palette: Uint8Array;
  count: number;
  /** Pixels per palette entry (over the sampled pixels). */
  population: Uint32Array;
}

interface Box {
  start: number;
  end: number;
}

/** Build a palette of at most `maxColors` from RGBA pixel data. */
export function buildPalette(data: Uint8ClampedArray | Uint8Array, maxColors: number, maxSamples = 250_000): QuantizeResult {
  const total = data.length / 4;
  const step = Math.max(1, Math.floor(total / maxSamples));
  // Gather samples; fully transparent pixels collapse into one entry.
  const idx: number[] = [];
  let transparent = 0;
  for (let p = 0; p < total; p += step) {
    if (data[p * 4 + 3] < 8) transparent++;
    else idx.push(p);
  }
  const want = Math.max(1, maxColors - (transparent ? 1 : 0));
  const order = Uint32Array.from(idx);
  const boxes: Box[] = order.length ? [{ start: 0, end: order.length }] : [];

  const channelRange = (b: Box) => {
    const min = [255, 255, 255, 255];
    const max = [0, 0, 0, 0];
    for (let i = b.start; i < b.end; i++) {
      const o = order[i] * 4;
      for (let c = 0; c < 4; c++) {
        const v = data[o + c];
        if (v < min[c]) min[c] = v;
        if (v > max[c]) max[c] = v;
      }
    }
    // Perceptual weights: green matters most, alpha strongly.
    const w = [1.0, 1.25, 0.85, 1.2];
    let best = 0;
    let bestRange = -1;
    for (let c = 0; c < 4; c++) {
      const r = (max[c] - min[c]) * w[c];
      if (r > bestRange) {
        bestRange = r;
        best = c;
      }
    }
    return { channel: best, range: bestRange };
  };

  while (boxes.length < want) {
    // Split the box with the largest weighted range × population.
    let pick = -1;
    let score = 0;
    let pickChannel = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.end - b.start < 2) continue;
      const { channel, range } = channelRange(b);
      const s = range * Math.sqrt(b.end - b.start);
      if (s > score) {
        score = s;
        pick = i;
        pickChannel = channel;
      }
    }
    if (pick < 0 || score === 0) break;
    const b = boxes[pick];
    // Partition by the channel's median using a histogram.
    const hist = new Uint32Array(256);
    for (let i = b.start; i < b.end; i++) hist[data[order[i] * 4 + pickChannel]]++;
    const half = (b.end - b.start) / 2;
    let acc = 0;
    let median = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= half) {
        median = v;
        break;
      }
    }
    // Stable partition: values <= median first.
    const lo: number[] = [];
    const hi: number[] = [];
    for (let i = b.start; i < b.end; i++) (data[order[i] * 4 + pickChannel] <= median ? lo : hi).push(order[i]);
    if (!hi.length || !lo.length) {
      // All on one side (median at the max): split at the exact middle instead.
      const all = lo.length ? lo : hi;
      all.sort((a, c) => data[a * 4 + pickChannel] - data[c * 4 + pickChannel]);
      order.set(all, b.start);
      const mid = b.start + Math.floor(all.length / 2);
      boxes.splice(pick, 1, { start: b.start, end: mid }, { start: mid, end: b.end });
      continue;
    }
    order.set(lo, b.start);
    order.set(hi, b.start + lo.length);
    boxes.splice(pick, 1, { start: b.start, end: b.start + lo.length }, { start: b.start + lo.length, end: b.end });
  }

  const count = boxes.length + (transparent ? 1 : 0);
  const palette = new Uint8Array(count * 4);
  const population = new Uint32Array(count);
  boxes.forEach((b, i) => {
    const sum = [0, 0, 0, 0];
    for (let j = b.start; j < b.end; j++) {
      const o = order[j] * 4;
      for (let c = 0; c < 4; c++) sum[c] += data[o + c];
    }
    const n = b.end - b.start;
    for (let c = 0; c < 4; c++) palette[i * 4 + c] = Math.round(sum[c] / n);
    population[i] = n * step;
  });
  if (transparent) {
    const t = boxes.length;
    palette.set([0, 0, 0, 0], t * 4);
    population[t] = transparent * step;
  }
  return { palette, count, population };
}

function nearest(palette: Uint8Array, count: number, r: number, g: number, b: number, a: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const dr = r - palette[o];
    const dg = g - palette[o + 1];
    const db = b - palette[o + 2];
    const da = a - palette[o + 3];
    const d = dr * dr * 2 + dg * dg * 4 + db * db * 3 + da * da * 4;
    if (d < bestD) {
      bestD = d;
      best = i;
      if (d === 0) break;
    }
  }
  return best;
}

/** Map every pixel to a palette index. */
export function remap(data: Uint8ClampedArray, w: number, h: number, palette: Uint8Array, count: number, dither: boolean): Uint8Array {
  const out = new Uint8Array(w * h);
  // Cache on 5 bits per channel (20-bit key).
  const cache = new Int16Array(1 << 20).fill(-1);
  const lookup = (r: number, g: number, b: number, a: number) => {
    const key = ((r >> 3) << 15) | ((g >> 3) << 10) | ((b >> 3) << 5) | (a >> 3);
    let v = cache[key];
    if (v < 0) {
      v = nearest(palette, count, r, g, b, a);
      cache[key] = v;
    }
    return v;
  };
  if (!dither) {
    for (let p = 0, o = 0; p < w * h; p++, o += 4) {
      out[p] = data[o + 3] < 8 ? lookup(0, 0, 0, 0) : lookup(data[o], data[o + 1], data[o + 2], data[o + 3]);
    }
    return out;
  }
  // Floyd–Steinberg with two rows of error buffers.
  let cur = new Float32Array((w + 2) * 4);
  let next = new Float32Array((w + 2) * 4);
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
  for (let y = 0; y < h; y++) {
    next.fill(0);
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const e = (x + 1) * 4;
      const r = clamp(data[o] + cur[e]);
      const g = clamp(data[o + 1] + cur[e + 1]);
      const b = clamp(data[o + 2] + cur[e + 2]);
      const a = clamp(data[o + 3] + cur[e + 3]);
      const i = a < 8 ? lookup(0, 0, 0, 0) : lookup(r | 0, g | 0, b | 0, a | 0);
      out[y * w + x] = i;
      const pr = palette[i * 4];
      const pg = palette[i * 4 + 1];
      const pb = palette[i * 4 + 2];
      const pa = palette[i * 4 + 3];
      const err = [r - pr, g - pg, b - pb, a - pa];
      for (let c = 0; c < 4; c++) {
        const ec = err[c];
        cur[e + 4 + c] += (ec * 7) / 16;
        next[e - 4 + c] += (ec * 3) / 16;
        next[e + c] += (ec * 5) / 16;
        next[e + 4 + c] += ec / 16;
      }
    }
    const t = cur;
    cur = next;
    next = t;
  }
  return out;
}

/**
 * Exact palette when the image has at most `limit` distinct colors
 * (common for UI screenshots), otherwise null.
 */
export function exactPalette(data: Uint8ClampedArray, limit = 256): { palette: Uint8Array; indices: Uint8Array; count: number } | null {
  const map = new Map<number, number>();
  const n = data.length / 4;
  const indices = new Uint8Array(n);
  const view = new Uint32Array(data.buffer, data.byteOffset, n);
  for (let p = 0; p < n; p++) {
    let v = view[p];
    if ((v >>> 24) === 0) v = 0; // normalize fully transparent pixels
    let i = map.get(v);
    if (i === undefined) {
      if (map.size >= limit) return null;
      i = map.size;
      map.set(v, i);
    }
    indices[p] = i;
  }
  const palette = new Uint8Array(map.size * 4);
  const pv = new Uint32Array(palette.buffer);
  for (const [color, i] of map) pv[i] = color;
  return { palette, indices, count: map.size };
}

/**
 * Dominant colors: median-cut seeds refined with k-means, near-duplicates
 * merged, sorted by how much of the image each covers. Transparent pixels
 * are ignored.
 */
export function dominantColors(data: Uint8ClampedArray, k: number): { rgb: [number, number, number]; share: number }[] {
  const seeds = buildPalette(data, Math.min(256, k * 2 + 2), 60_000);
  let centers: number[][] = [];
  for (let i = 0; i < seeds.count; i++) {
    if (seeds.palette[i * 4 + 3] >= 128) centers.push([seeds.palette[i * 4], seeds.palette[i * 4 + 1], seeds.palette[i * 4 + 2]]);
  }
  const n = data.length / 4;
  const step = Math.max(1, Math.floor(n / 60_000));
  const px: number[] = [];
  for (let p = 0; p < n; p += step) if (data[p * 4 + 3] >= 128) px.push(p * 4);
  let counts = new Array(centers.length).fill(0);
  for (let iter = 0; iter < 8 && centers.length; iter++) {
    const sums = centers.map(() => [0, 0, 0]);
    counts = new Array(centers.length).fill(0);
    for (const o of px) {
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const dr = data[o] - centers[c][0];
        const dg = data[o + 1] - centers[c][1];
        const db = data[o + 2] - centers[c][2];
        const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      sums[best][0] += data[o];
      sums[best][1] += data[o + 1];
      sums[best][2] += data[o + 2];
      counts[best]++;
    }
    centers = centers.map((c, i) => (counts[i] ? sums[i].map((s) => s / counts[i]) : c));
  }
  // Merge clusters that are visually the same color.
  const items = centers.map((c, i) => ({ c, n: counts[i] })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const merged: { c: number[]; n: number }[] = [];
  for (const it of items) {
    const near = merged.find((m) => Math.hypot(m.c[0] - it.c[0], m.c[1] - it.c[1], m.c[2] - it.c[2]) < 28);
    if (near) near.n += it.n;
    else merged.push({ ...it });
  }
  const total = px.length || 1;
  return merged.filter((m, i) => i === 0 || m.n / total >= 0.005).slice(0, k).map((m) => ({ rgb: m.c.map((v) => Math.round(v)) as [number, number, number], share: m.n / total }));
}

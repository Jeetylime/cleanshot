import { buildPalette, remap } from '../shared/quantize';

/**
 * Raster → SVG tracing, hand-written.
 *
 * 1. Quantize to N colors (median cut, no dithering).
 * 2. For each color, collect the pixel edges between that color and anything
 *    else, directed clockwise around the color's pixels, and chain them into
 *    closed loops (outlines and holes).
 * 3. Drop collinear points, simplify with Ramer–Douglas–Peucker, drop specks.
 * 4. Emit one even-odd path per color, largest areas first, optionally with
 *    smooth curves through the simplified points.
 */

export interface TraceOptions {
  colors: number;
  /** Simplification tolerance in pixels (higher = fewer points). */
  tolerance: number;
  /** Ignore shapes smaller than this many square pixels. */
  minArea: number;
  smooth: boolean;
}

export interface TraceResult {
  svg: string;
  paths: number;
  points: number;
}

type Pt = [number, number];

/** Closed boundary loops of the pixels where mask[i] is set. Corner coordinates, clockwise for outlines. */
export function traceLoops(mask: Uint8Array, w: number, h: number): Pt[][] {
  const W = w + 1;
  const out1 = new Int32Array(W * (h + 1)).fill(-1);
  const out2 = new Int32Array(W * (h + 1)).fill(-1);
  let edges = 0;
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const a = y0 * W + x0;
    const b = y1 * W + x1;
    if (out1[a] < 0) out1[a] = b;
    else out2[a] = b;
    edges++;
  };
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 1) continue;
      if (!inside(x, y - 1)) add(x, y, x + 1, y);
      if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  const loops: Pt[][] = [];
  if (!edges) return loops;
  for (let start = 0; start < out1.length; start++) {
    while (out1[start] >= 0 || out2[start] >= 0) {
      const loop: Pt[] = [];
      let v = start;
      let prevDir = -1;
      for (let guard = 0; guard <= edges; guard++) {
        loop.push([v % W, Math.floor(v / W)]);
        let next: number;
        // At a pinch point (two exits) turn right, which keeps diagonal regions apart.
        if (out1[v] >= 0 && out2[v] >= 0 && prevDir >= 0) {
          const d1 = dirOf(v, out1[v], W);
          next = (d1 - prevDir + 4) % 4 === 1 ? out1[v] : out2[v];
        } else next = out1[v] >= 0 ? out1[v] : out2[v];
        if (next < 0) break;
        // Consume the edge taken; a remaining second exit moves into the first slot.
        if (out1[v] === next) {
          out1[v] = out2[v];
          out2[v] = -1;
        } else out2[v] = -1;
        prevDir = dirOf(v, next, W);
        v = next;
        if (v === start) break;
      }
      if (loop.length >= 4) loops.push(loop);
    }
  }
  return loops;
}

/** 0 right, 1 down, 2 left, 3 up. */
function dirOf(a: number, b: number, W: number): number {
  const d = b - a;
  return d === 1 ? 0 : d === W ? 1 : d === -1 ? 2 : 3;
}

function dropCollinear(p: Pt[]): Pt[] {
  const n = p.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = p[(i - 1 + n) % n];
    const b = p[i];
    const c = p[(i + 1) % n];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) out.push(b);
  }
  return out;
}

function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3 || eps <= 0) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [ax, ay] = pts[s];
    const [bx, by] = pts[e];
    const dx = bx - ax;
    const dy = by - ay;
    const L = Math.hypot(dx, dy) || 1;
    let best = -1;
    let bestD = eps;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([s, best], [best, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Simplify a closed loop: split at its farthest pair so both halves have fixed ends. */
export function simplifyLoop(loop: Pt[], eps: number): Pt[] {
  const p = dropCollinear(loop);
  if (p.length <= 4 || eps <= 0) return p;
  let far = 0;
  let fd = -1;
  for (let i = 1; i < p.length; i++) {
    const d = (p[i][0] - p[0][0]) ** 2 + (p[i][1] - p[0][1]) ** 2;
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const a = rdp(p.slice(0, far + 1), eps);
  const b = rdp([...p.slice(far), p[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

export function loopArea(p: Pt[]): number {
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
  return s / 2;
}

const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

function pathData(loops: Pt[][], k: number, smooth: boolean): string {
  let d = '';
  for (const l of loops) {
    const n = l.length;
    if (!smooth || n < 4) {
      d += `M${fmt(l[0][0] * k)} ${fmt(l[0][1] * k)}`;
      for (let i = 1; i < n; i++) d += `L${fmt(l[i][0] * k)} ${fmt(l[i][1] * k)}`;
      d += 'Z';
      continue;
    }
    // Quadratic curves through midpoints with the points as controls; sharp
    // turns (over ~65°) stay corners so rectangles keep square corners.
    const mid = (i: number) => [((l[i % n][0] + l[(i + 1) % n][0]) / 2) * k, ((l[i % n][1] + l[(i + 1) % n][1]) / 2) * k];
    const sharp = (i: number) => {
      const a = l[(i - 1 + n) % n];
      const b = l[i % n];
      const c = l[(i + 1) % n];
      const ux = b[0] - a[0];
      const uy = b[1] - a[1];
      const vx = c[0] - b[0];
      const vy = c[1] - b[1];
      const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
      return cos < 0.42;
    };
    const m0 = mid(0);
    d += `M${fmt(m0[0])} ${fmt(m0[1])}`;
    for (let i = 1; i <= n; i++) {
      const c = l[i % n];
      const m = mid(i);
      if (sharp(i)) d += `L${fmt(c[0] * k)} ${fmt(c[1] * k)}L${fmt(m[0])} ${fmt(m[1])}`;
      else d += `Q${fmt(c[0] * k)} ${fmt(c[1] * k)} ${fmt(m[0])} ${fmt(m[1])}`;
    }
    d += 'Z';
  }
  return d;
}

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/**
 * Trace RGBA pixels (w×h) to SVG. `outW`/`outH` set the SVG's size when the
 * pixels were downscaled for speed.
 */
export function traceToSvg(data: Uint8ClampedArray, w: number, h: number, o: TraceOptions, outW = w, outH = h): TraceResult {
  const { palette, count } = buildPalette(data, Math.max(2, Math.min(64, o.colors)));
  const idx = remap(data, w, h, palette, count, false);
  const k = outW / w;
  const pop = new Uint32Array(count);
  for (let i = 0; i < idx.length; i++) pop[idx[i]]++;
  const order = [...Array(count).keys()].filter((c) => palette[c * 4 + 3] >= 128 && pop[c] > 0).sort((a, b) => pop[b] - pop[a]);
  const mask = new Uint8Array(w * h);
  const parts: string[] = [];
  let points = 0;
  for (const c of order) {
    for (let i = 0; i < idx.length; i++) mask[i] = idx[i] === c ? 1 : 0;
    const loops = traceLoops(mask, w, h)
      .map((l) => simplifyLoop(l, o.tolerance))
      .filter((l) => l.length >= 3 && Math.abs(loopArea(l)) >= o.minArea);
    if (!loops.length) continue;
    points += loops.reduce((s, l) => s + l.length, 0);
    const col = hex(palette[c * 4], palette[c * 4 + 1], palette[c * 4 + 2]);
    // A hairline stroke of the same color hides seams between neighboring shapes.
    parts.push(`<path fill="${col}" stroke="${col}" stroke-width="${fmt(0.6 * k)}" stroke-linejoin="round" fill-rule="evenodd" d="${pathData(loops, k, o.smooth)}"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(outW)}" height="${Math.round(outH)}" viewBox="0 0 ${Math.round(outW)} ${Math.round(outH)}">\n${parts.join('\n')}\n</svg>\n`;
  return { svg, paths: parts.length, points };
}

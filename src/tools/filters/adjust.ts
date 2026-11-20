/**
 * Photo adjustments on RGBA pixels. All values are -100…100 (0 = unchanged)
 * except where noted. Runs as one pass with a lookup table for tone curves.
 */
export interface Adjustments {
  exposure: number;
  brightness: number;
  contrast: number;
  /** Tone curve: lift shadows / pull down highlights. */
  shadows: number;
  highlights: number;
  saturation: number;
  vibrance: number;
  /** Blue ↔ yellow. */
  warmth: number;
  /** Green ↔ magenta. */
  tint: number;
  /** -180…180 degrees. */
  hue: number;
  /** 0…100 */
  fade: number;
  /** 0…100 */
  vignette: number;
  /** 0…100 */
  grain: number;
  /** 0…100, 100 = full black & white. */
  grayscale: number;
  /** 0…100 */
  sepia: number;
}

export const NEUTRAL: Adjustments = { exposure: 0, brightness: 0, contrast: 0, shadows: 0, highlights: 0, saturation: 0, vibrance: 0, warmth: 0, tint: 0, hue: 0, fade: 0, vignette: 0, grain: 0, grayscale: 0, sepia: 0 };

export const FILTER_PRESETS: { id: string; name: string; adj: Partial<Adjustments> }[] = [
  { id: 'none', name: 'Original', adj: {} },
  { id: 'vivid', name: 'Vivid', adj: { contrast: 18, saturation: 28, vibrance: 20 } },
  { id: 'warm', name: 'Warm', adj: { warmth: 35, saturation: 8, highlights: -10 } },
  { id: 'cool', name: 'Cool', adj: { warmth: -32, tint: -6, contrast: 8 } },
  { id: 'fade', name: 'Faded', adj: { fade: 35, contrast: -12, saturation: -15 } },
  { id: 'matte', name: 'Matte', adj: { fade: 22, shadows: 20, contrast: -6, vignette: 25 } },
  { id: 'bw', name: 'Mono', adj: { grayscale: 100, contrast: 15 } },
  { id: 'noir', name: 'Noir', adj: { grayscale: 100, contrast: 45, vignette: 45, grain: 18 } },
  { id: 'sepia', name: 'Sepia', adj: { sepia: 80, contrast: 6, fade: 10 } },
  { id: 'film', name: 'Film', adj: { contrast: 10, warmth: 12, fade: 14, grain: 22, vignette: 20, saturation: -6 } },
  { id: 'bright', name: 'Airy', adj: { exposure: 18, shadows: 25, contrast: -10, saturation: -8 } },
  { id: 'drama', name: 'Dramatic', adj: { contrast: 40, highlights: -25, shadows: -12, vibrance: 15, vignette: 35 } },
];

const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Tone lookup table for exposure, brightness, contrast, shadows, highlights and fade. */
export function toneCurve(a: Adjustments): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const exp = Math.pow(2, a.exposure / 50);
  const c = a.contrast / 100;
  const k = c >= 0 ? 1 + c * 2 : 1 + c;
  for (let i = 0; i < 256; i++) {
    let v = i / 255;
    v *= exp;
    v += a.brightness / 250;
    v = (v - 0.5) * k + 0.5;
    // Shadows/highlights: smooth weights centered on the dark and light ends.
    const sw = (1 - v) * (1 - v);
    const hw = v * v;
    v += (a.shadows / 100) * 0.35 * sw * (1 - sw * 0.5);
    v += (a.highlights / 100) * 0.35 * hw * (1 - hw * 0.5);
    // Fade lifts the black point.
    v = (a.fade / 100) * 0.22 + v * (1 - (a.fade / 100) * 0.22);
    lut[i] = clamp8(Math.round(v * 255));
  }
  return lut;
}

function hueMatrix(deg: number): number[] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}

export function isNeutral(a: Adjustments): boolean {
  return (Object.keys(NEUTRAL) as (keyof Adjustments)[]).every((k) => a[k] === 0);
}

/** Apply adjustments in place. `seed` makes grain repeatable between preview and export. */
export function applyAdjustments(data: Uint8ClampedArray, w: number, h: number, a: Adjustments, seed = 1): void {
  if (isNeutral(a)) return;
  const lut = toneCurve(a);
  const hm = a.hue ? hueMatrix(a.hue) : null;
  const sat = 1 + a.saturation / 100;
  const vib = a.vibrance / 100;
  const warm = a.warmth * 0.35;
  const tint = a.tint * 0.3;
  const gray = a.grayscale / 100;
  const sep = a.sepia / 100;
  const vig = a.vignette / 100;
  const grain = a.grain * 0.45;
  const cx = w / 2;
  const cy = h / 2;
  const maxD = Math.hypot(cx, cy) || 1;
  let rnd = seed >>> 0 || 1;
  const rand = () => {
    rnd ^= rnd << 13;
    rnd ^= rnd >>> 17;
    rnd ^= rnd << 5;
    return (rnd >>> 0) / 4294967296;
  };
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      let r = lut[data[i]];
      let g = lut[data[i + 1]];
      let b = lut[data[i + 2]];
      if (warm || tint) {
        r += warm + tint * 0.5;
        g -= tint;
        b -= warm - tint * 0.5;
      }
      if (hm) {
        const nr = r * hm[0] + g * hm[1] + b * hm[2];
        const ng = r * hm[3] + g * hm[4] + b * hm[5];
        const nb = r * hm[6] + g * hm[7] + b * hm[8];
        r = nr;
        g = ng;
        b = nb;
      }
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      let s = sat;
      if (vib) {
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        const cur = mx ? (mx - mn) / mx : 0;
        s *= 1 + vib * (1 - cur);
      }
      if (s !== 1) {
        r = l + (r - l) * s;
        g = l + (g - l) * s;
        b = l + (b - l) * s;
      }
      if (gray) {
        const ll = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r += (ll - r) * gray;
        g += (ll - g) * gray;
        b += (ll - b) * gray;
      }
      if (sep) {
        const sr = r * 0.393 + g * 0.769 + b * 0.189;
        const sg = r * 0.349 + g * 0.686 + b * 0.168;
        const sb = r * 0.272 + g * 0.534 + b * 0.131;
        r += (sr - r) * sep;
        g += (sg - g) * sep;
        b += (sb - b) * sep;
      }
      if (vig) {
        const d = Math.hypot(x - cx, y - cy) / maxD;
        const f = 1 - vig * 0.75 * Math.max(0, d - 0.35) * 1.5;
        r *= f;
        g *= f;
        b *= f;
      }
      if (grain) {
        const n = (rand() - 0.5) * grain;
        r += n;
        g += n;
        b += n;
      }
      data[i] = clamp8(r);
      data[i + 1] = clamp8(g);
      data[i + 2] = clamp8(b);
    }
  }
}

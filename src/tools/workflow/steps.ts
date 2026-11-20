import { createCanvas, ctx2d, type ImageSource } from '../../engine/images';
import { applyAdjustments, FILTER_PRESETS, NEUTRAL } from '../filters/adjust';

/**
 * Workflow steps: small image operations chained into a recipe and run on
 * many files. Each step maps a canvas to a canvas.
 */

export type Step =
  | { kind: 'removeBg' }
  | { kind: 'resize'; maxW: number; maxH: number; upscale: boolean }
  | { kind: 'crop'; ratio: string }
  | { kind: 'filter'; preset: string }
  | { kind: 'watermark'; text: string; position: 'br' | 'bl' | 'tr' | 'tl' | 'center'; size: number; opacity: number; color: string }
  | { kind: 'background'; color: string }
  | { kind: 'border'; width: number; color: string };

export type StepKind = Step['kind'];

export const STEP_INFO: Record<StepKind, { label: string; make: () => Step }> = {
  removeBg: { label: 'Remove background (AI)', make: () => ({ kind: 'removeBg' }) },
  resize: { label: 'Resize to fit', make: () => ({ kind: 'resize', maxW: 1600, maxH: 1600, upscale: false }) },
  crop: { label: 'Crop to ratio', make: () => ({ kind: 'crop', ratio: '1:1' }) },
  filter: { label: 'Photo filter', make: () => ({ kind: 'filter', preset: 'vivid' }) },
  watermark: { label: 'Text watermark', make: () => ({ kind: 'watermark', text: '© Your name', position: 'br', size: 4, opacity: 70, color: '#ffffff' }) },
  background: { label: 'Fill transparency', make: () => ({ kind: 'background', color: '#ffffff' }) },
  border: { label: 'Add border', make: () => ({ kind: 'border', width: 2, color: '#ffffff' }) },
};

export interface Output {
  format: 'same' | 'png' | 'jpeg' | 'webp' | 'avif';
  quality: number;
  /** Name pattern (see rename/pattern.ts), e.g. "{name}-web". */
  name: string;
}

export interface Recipe {
  id: string;
  name: string;
  steps: Step[];
  output: Output;
}

export const DEFAULT_RECIPES: Recipe[] = [
  { id: 'web', name: 'Web-ready photos', steps: [{ kind: 'resize', maxW: 1600, maxH: 1600, upscale: false }], output: { format: 'webp', quality: 82, name: '{name}' } },
  {
    id: 'product',
    name: 'Product shots (cutout on white, square)',
    steps: [{ kind: 'removeBg' }, { kind: 'background', color: '#ffffff' }, { kind: 'crop', ratio: '1:1' }, { kind: 'resize', maxW: 1200, maxH: 1200, upscale: true }],
    output: { format: 'jpeg', quality: 90, name: '{name}-product' },
  },
  {
    id: 'insta',
    name: 'Instagram posts (4:5, watermarked)',
    steps: [{ kind: 'crop', ratio: '4:5' }, { kind: 'resize', maxW: 1080, maxH: 1350, upscale: true }, { kind: 'filter', preset: 'vivid' }, { kind: 'watermark', text: '@yourname', position: 'br', size: 3.5, opacity: 75, color: '#ffffff' }],
    output: { format: 'jpeg', quality: 90, name: '{name}-ig' },
  },
];

export function toCanvas(src: ImageSource): HTMLCanvasElement {
  const c = createCanvas(src.width, src.height);
  ctx2d(c).drawImage(src, 0, 0);
  return c;
}

/** Center crop to "w:h". */
export function cropRect(w: number, h: number, ratio: string): { x: number; y: number; w: number; h: number } {
  const [a, b] = ratio.split(':').map(Number);
  const r = a > 0 && b > 0 ? a / b : 1;
  if (w / h > r) {
    const cw = Math.round(h * r);
    return { x: Math.round((w - cw) / 2), y: 0, w: cw, h };
  }
  const ch = Math.round(w / r);
  return { x: 0, y: Math.round((h - ch) / 2), w, h: ch };
}

/** Size that fits within maxW×maxH, keeping aspect; no enlarging unless `upscale`. */
export function fitSize(w: number, h: number, maxW: number, maxH: number, upscale: boolean): { w: number; h: number } {
  let k = Math.min(maxW / w, maxH / h);
  if (!upscale) k = Math.min(1, k);
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

export async function runStep(c: HTMLCanvasElement, s: Step): Promise<HTMLCanvasElement> {
  switch (s.kind) {
    case 'removeBg': {
      const { loadSegmenter, predictMask } = await import('../bgremove/segment');
      const { buildFullMask, composeCutout } = await import('../bgremove/mask');
      await loadSegmenter(() => {});
      const mask = buildFullMask(await predictMask(c), c.width, c.height, 1);
      const out = createCanvas(c.width, c.height);
      composeCutout(out, c, mask);
      return out;
    }
    case 'resize': {
      const { w, h } = fitSize(c.width, c.height, s.maxW, s.maxH, s.upscale);
      if (w === c.width && h === c.height) return c;
      // Halve repeatedly for quality when shrinking a lot.
      let cur = c;
      while (cur.width / 2 >= w && cur.height / 2 >= h) {
        const half = createCanvas(Math.round(cur.width / 2), Math.round(cur.height / 2));
        const hc = ctx2d(half);
        hc.imageSmoothingQuality = 'high';
        hc.drawImage(cur, 0, 0, half.width, half.height);
        cur = half;
      }
      const out = createCanvas(w, h);
      const ctx = ctx2d(out);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(cur, 0, 0, w, h);
      return out;
    }
    case 'crop': {
      const r = cropRect(c.width, c.height, s.ratio);
      const out = createCanvas(r.w, r.h);
      ctx2d(out).drawImage(c, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      return out;
    }
    case 'filter': {
      const p = FILTER_PRESETS.find((x) => x.id === s.preset);
      if (!p) return c;
      const ctx = ctx2d(c, { willReadFrequently: true });
      const d = ctx.getImageData(0, 0, c.width, c.height);
      applyAdjustments(d.data, c.width, c.height, { ...NEUTRAL, ...p.adj }, 7);
      ctx.putImageData(d, 0, 0);
      return c;
    }
    case 'watermark': {
      if (!s.text.trim()) return c;
      const ctx = ctx2d(c);
      const size = Math.max(10, (Math.min(c.width, c.height) * s.size) / 100);
      ctx.font = `600 ${size}px "Inter Variable", system-ui, sans-serif`;
      ctx.globalAlpha = s.opacity / 100;
      ctx.fillStyle = s.color;
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = size * 0.25;
      const m = size * 0.9;
      const right = s.position === 'br' || s.position === 'tr';
      const bottom = s.position === 'br' || s.position === 'bl';
      ctx.textAlign = s.position === 'center' ? 'center' : right ? 'right' : 'left';
      ctx.textBaseline = s.position === 'center' ? 'middle' : bottom ? 'bottom' : 'top';
      const x = s.position === 'center' ? c.width / 2 : right ? c.width - m : m;
      const y = s.position === 'center' ? c.height / 2 : bottom ? c.height - m : m;
      ctx.fillText(s.text, x, y);
      ctx.globalAlpha = 1;
      ctx.shadowColor = 'transparent';
      return c;
    }
    case 'background': {
      const out = createCanvas(c.width, c.height);
      const ctx = ctx2d(out);
      ctx.fillStyle = s.color;
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(c, 0, 0);
      return out;
    }
    case 'border': {
      const bw = Math.round((Math.min(c.width, c.height) * s.width) / 100);
      if (bw <= 0) return c;
      const out = createCanvas(c.width + bw * 2, c.height + bw * 2);
      const ctx = ctx2d(out);
      ctx.fillStyle = s.color;
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(c, bw, bw);
      return out;
    }
  }
}

// ---------------------------------------------------------------------------
// Saved recipes (this browser)

const KEY = 'studiolo:workflows';

export function loadRecipes(): Recipe[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return Array.isArray(v) && v.length ? v : DEFAULT_RECIPES;
  } catch {
    return DEFAULT_RECIPES;
  }
}

export function saveRecipes(list: Recipe[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

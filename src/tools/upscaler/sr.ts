import { createCanvas, ctx2d, type ImageSource } from '../../engine/images';
import { loadTransformers, progressTracker, type DownloadProgress, type ModelInfo } from '../ai/runtime';

/**
 * AI super-resolution with Swin2SR (SwinV2 transformer) via ONNX Runtime
 * Web. Images are processed in overlapping tiles so memory stays bounded
 * and progress can be reported.
 */

export type Scale = 2 | 4;

export const SR_MODELS: Record<Scale, ModelInfo & { maxSide: number }> = {
  2: {
    id: 'Xenova/swin2SR-lightweight-x2-64',
    file: 'onnx/model_quantized.onnx',
    bytes: 7_082_844,
    label: 'Swin2SR ×2 (lightweight)',
    license: 'Apache-2.0 license',
    maxSide: 1280,
  },
  4: {
    id: 'Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr',
    file: 'onnx/model_quantized.onnx',
    bytes: 21_438_622,
    label: 'Swin2SR ×4 (real-world)',
    license: 'Apache-2.0 license',
    maxSide: 640,
  },
};

type Runner = (inputs: unknown) => Promise<{ reconstruction: { data: Float32Array; dims: number[] } }>;
type Proc = (img: unknown) => Promise<{ pixel_values: unknown }>;
const loaded = new Map<Scale, Promise<{ model: Runner; processor: Proc }>>();
export const readyModels = new Set<Scale>();

export function loadUpscaler(scale: Scale, onProgress: (p: DownloadProgress) => void) {
  let p = loaded.get(scale);
  if (!p) {
    p = (async () => {
      const progress_callback = progressTracker(onProgress);
      const T = await loadTransformers(progress_callback);
      const m = SR_MODELS[scale];
      const [model, processor] = await Promise.all([
        T.AutoModel.from_pretrained(m.id, { dtype: 'q8', device: 'wasm', progress_callback }),
        T.AutoProcessor.from_pretrained(m.id, { progress_callback }),
      ]);
      readyModels.add(scale);
      return { model: model as unknown as Runner, processor: processor as unknown as Proc };
    })();
    p.catch(() => loaded.delete(scale));
    loaded.set(scale, p);
  }
  return p;
}

const TILE = 160;
const OVERLAP = 12;

export interface UpscaleOptions {
  onTile?: (done: number, total: number) => void;
  signal?: { cancelled: boolean };
}

/** Upscale `src` by `scale`. Returns a canvas of size (w·scale, h·scale). */
export async function upscale(src: ImageSource, scale: Scale, opts: UpscaleOptions = {}): Promise<HTMLCanvasElement> {
  const T = await loadTransformers();
  const { model, processor } = await loadUpscaler(scale, () => {});
  const w = src.width;
  const h = src.height;

  const srcCanvas = createCanvas(w, h);
  const sctx = ctx2d(srcCanvas, { willReadFrequently: true });
  sctx.drawImage(src, 0, 0);
  const all = sctx.getImageData(0, 0, w, h);

  const out = createCanvas(w * scale, h * scale);
  const octx = ctx2d(out);

  const cols = Math.ceil(w / TILE);
  const rows = Math.ceil(h / TILE);
  const total = cols * rows;
  let done = 0;
  let hasAlpha = false;
  for (let i = 3; i < all.data.length; i += 4) {
    if (all.data[i] < 255) {
      hasAlpha = true;
      break;
    }
  }

  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      if (opts.signal?.cancelled) throw new Error('cancelled');
      // Core tile and its padded context region.
      const cx = tx * TILE;
      const cy = ty * TILE;
      const cw = Math.min(TILE, w - cx);
      const ch = Math.min(TILE, h - cy);
      const rx = Math.max(0, cx - OVERLAP);
      const ry = Math.max(0, cy - OVERLAP);
      const rw = Math.min(w, cx + cw + OVERLAP) - rx;
      const rh = Math.min(h, cy + ch + OVERLAP) - ry;

      const region = sctx.getImageData(rx, ry, rw, rh);
      const raw = new T.RawImage(region.data, rw, rh, 4).rgb();
      const inputs = await processor(raw);
      const { reconstruction } = await model(inputs);
      const [, , oh, ow] = reconstruction.dims;
      const plane = oh * ow;
      const data = reconstruction.data;

      // Copy the core area (excluding overlap) into the output.
      const ox = (cx - rx) * scale;
      const oy = (cy - ry) * scale;
      const pw = cw * scale;
      const ph = ch * scale;
      const tile = octx.createImageData(pw, ph);
      for (let y = 0; y < ph; y++) {
        const srcRow = (oy + y) * ow + ox;
        for (let x = 0; x < pw; x++) {
          const si = srcRow + x;
          const di = (y * pw + x) * 4;
          tile.data[di] = data[si] * 255;
          tile.data[di + 1] = data[plane + si] * 255;
          tile.data[di + 2] = data[plane * 2 + si] * 255;
          tile.data[di + 3] = 255;
        }
      }
      octx.putImageData(tile, cx * scale, cy * scale);
      done++;
      opts.onTile?.(done, total);
      // Yield so progress paints between tiles.
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // The model works on RGB; carry transparency over with a smooth upscale.
  if (hasAlpha) {
    const alpha = createCanvas(w * scale, h * scale);
    const actx = ctx2d(alpha);
    actx.imageSmoothingQuality = 'high';
    actx.drawImage(srcCanvas, 0, 0, w * scale, h * scale);
    octx.globalCompositeOperation = 'destination-in';
    octx.drawImage(alpha, 0, 0);
    octx.globalCompositeOperation = 'source-over';
    alpha.width = alpha.height = 0;
  }
  srcCanvas.width = srcCanvas.height = 0;
  return out;
}

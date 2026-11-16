import { createCanvas, ctx2d, type ImageSource } from '../../engine/images';
import { loadTransformers, progressTracker, type DownloadProgress, type ModelInfo } from '../ai/runtime';

/**
 * Foreground segmentation with BRIA RMBG-1.4 (IS-Net architecture) running
 * locally through ONNX Runtime Web. Produces a soft alpha matte at the
 * source resolution.
 */

export const RMBG: ModelInfo = {
  id: 'briaai/RMBG-1.4',
  file: 'onnx/model_quantized.onnx',
  bytes: 44_403_226,
  label: 'RMBG-1.4 (BRIA AI)',
  license: 'BRIA RMBG-1.4 license: free for non-commercial use',
};

const INPUT = 1024;

type Loaded = { model: (inputs: Record<string, unknown>) => Promise<{ output: unknown }>; processor: (img: unknown) => Promise<{ pixel_values: unknown }> };
let loaded: Promise<Loaded> | null = null;

export function loadSegmenter(onProgress: (p: DownloadProgress) => void): Promise<Loaded> {
  if (!loaded) {
    loaded = (async () => {
      const progress_callback = progressTracker(onProgress);
      const T = await loadTransformers(progress_callback);
      const [model, processor] = await Promise.all([
        T.AutoModel.from_pretrained(RMBG.id, {
          // RMBG ships a custom architecture; this tells Transformers.js to load it generically.
          config: { model_type: 'custom' } as never,
          dtype: 'q8',
          device: 'wasm',
          progress_callback,
        }),
        T.AutoProcessor.from_pretrained(RMBG.id, {
          config: {
            do_normalize: true,
            do_pad: false,
            do_rescale: true,
            do_resize: true,
            image_mean: [0.5, 0.5, 0.5],
            feature_extractor_type: 'ImageFeatureExtractor',
            image_std: [1, 1, 1],
            resample: 2,
            rescale_factor: 1 / 255,
            size: { width: INPUT, height: INPUT },
          } as never,
          progress_callback,
        }),
      ]);
      return {
        model: (inputs: Record<string, unknown>) => (model as unknown as (i: Record<string, unknown>) => Promise<{ output: unknown }>)(inputs),
        processor: (img: unknown) => (processor as unknown as (i: unknown) => Promise<{ pixel_values: unknown }>)(img),
      };
    })().catch((err) => {
      loaded = null;
      throw err;
    });
  }
  return loaded;
}

/**
 * Predict a matte for `src`. Returns a canvas at the model's working size
 * (aspect preserved, ≤1024px) whose alpha channel is the foreground mask.
 */
export async function predictMask(src: ImageSource): Promise<HTMLCanvasElement> {
  const T = await loadTransformers();
  const { model, processor } = await loadSegmenter(() => {});
  // The model sees 1024×1024 regardless; downscale first to save work.
  const k = Math.min(1, INPUT / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * k));
  const h = Math.max(1, Math.round(src.height * k));
  const c = createCanvas(w, h);
  const ctx = ctx2d(c, { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h);
  const image = new T.RawImage(rgba.data, w, h, 4).rgb();

  const { pixel_values } = await processor(image);
  const { output } = await model({ input: pixel_values });
  const tensor = (output as { [i: number]: { mul: (n: number) => { to: (t: string) => unknown } } })[0];
  const raw = await T.RawImage.fromTensor(tensor.mul(255).to('uint8') as never).resize(w, h);

  // Build an alpha-only canvas: white pixels, alpha = matte × original alpha.
  const mask = createCanvas(w, h);
  const mctx = ctx2d(mask, { willReadFrequently: true });
  const out = mctx.createImageData(w, h);
  const m = raw.data as Uint8Array;
  for (let i = 0, p = 0; p < w * h; p++, i += 4) {
    out.data[i] = 255;
    out.data[i + 1] = 255;
    out.data[i + 2] = 255;
    out.data[i + 3] = Math.round((m[p] * rgba.data[i + 3]) / 255);
  }
  mctx.putImageData(out, 0, 0);
  c.width = c.height = 0;
  return mask;
}

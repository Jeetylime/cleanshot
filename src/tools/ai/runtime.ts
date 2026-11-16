/**
 * On-demand loading of the AI runtime (Transformers.js + ONNX Runtime Web).
 *
 * Nothing here is imported until an AI tool is used. The ONNX runtime WASM
 * ships with the app (public/ort); model weights are downloaded from the
 * Hugging Face Hub on first use and cached by the browser (Cache Storage),
 * so later runs work offline. Images are processed locally and never sent
 * anywhere.
 */

import { bundledCache, getBundledManifest, readBundled } from './bundled';

type Transformers = typeof import('@huggingface/transformers');
type ProgressEvent = { status: string; file?: string; loaded?: number; total?: number };

let loading: Promise<Transformers> | null = null;

/**
 * Load Transformers.js and configure ONNX Runtime. `onProgress` receives
 * download progress for the runtime itself when it's bundled with the page.
 */
export function loadTransformers(onProgress?: (e: ProgressEvent) => void): Promise<Transformers> {
  if (!loading) {
    loading = import('@huggingface/transformers')
      .then(async (T) => {
        T.env.allowLocalModels = false;
        T.env.useBrowserCache = true;
        const wasm = T.env.backends.onnx.wasm!;
        wasm.wasmPaths = new URL('ort/', document.baseURI).href;
        // Threads need cross-origin isolation; otherwise run single-threaded.
        wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
        wasm.proxy = false;
        const bundled = await getBundledManifest();
        if (bundled) {
          // Serve models from files published with the page instead of the network.
          T.env.useBrowserCache = false;
          T.env.useCustomCache = true;
          T.env.customCache = bundledCache(bundled);
          if (bundled.wasm) {
            const file = 'onnxruntime.wasm';
            wasm.wasmBinary = await readBundled(bundled.wasm, (loaded, total) =>
              onProgress?.({ status: 'progress', file, loaded, total }),
            );
            onProgress?.({ status: 'done', file });
          }
        }
        return T;
      })
      .catch((err) => {
        loading = null;
        throw err;
      });
  }
  return loading;
}

export const HF_BASE = 'https://huggingface.co';
export const CACHE_NAME = 'transformers-cache';

export interface ModelInfo {
  id: string;
  /** ONNX weights file relative to the repo root. */
  file: string;
  /** Approximate download size in bytes (for the first-use prompt). */
  bytes: number;
  label: string;
  license: string;
}

/** Whether a model's weights are already in the browser cache. */
export async function isModelCached(m: ModelInfo): Promise<boolean> {
  try {
    if (typeof caches === 'undefined') return false;
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(`${HF_BASE}/${m.id}/resolve/main/${m.file}`);
    return !!hit;
  } catch {
    return false;
  }
}

export interface DownloadProgress {
  loaded: number;
  total: number;
}

/**
 * Collapse Transformers.js per-file progress events into one total.
 * Small config files are included, so the total settles once all have started.
 */
export function progressTracker(onProgress: (p: DownloadProgress) => void) {
  const files = new Map<string, { loaded: number; total: number }>();
  return (e: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (!e.file) return;
    if (e.status === 'progress' || e.status === 'initiate' || e.status === 'download') {
      const prev = files.get(e.file) ?? { loaded: 0, total: 0 };
      files.set(e.file, { loaded: e.loaded ?? prev.loaded, total: e.total ?? prev.total });
    } else if (e.status === 'done') {
      const prev = files.get(e.file);
      if (prev) files.set(e.file, { loaded: prev.total || prev.loaded, total: prev.total || prev.loaded });
    }
    let loaded = 0;
    let total = 0;
    files.forEach((f) => {
      loaded += f.loaded;
      total += f.total;
    });
    onProgress({ loaded, total });
  };
}

/** Turn runtime/download failures into something a person can act on. */
export function describeAiError(err: unknown, what: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/fetch|network|Failed to load|NetworkError|load failed|CORS|ERR_/i.test(msg)) {
    return `Couldn’t load the ${what} model (${msg}). Check your connection and try again.`;
  }
  if (/memory|allocation|OOM|RangeError/i.test(msg)) {
    return `The ${what} model ran out of memory. Try a smaller image or close other tabs.`;
  }
  if (/wasm|WebAssembly|backend/i.test(msg)) {
    return `The AI runtime couldn’t start in this browser (${msg}). Try a recent version of Chrome, Edge, Firefox or Safari.`;
  }
  return `${what[0].toUpperCase()}${what.slice(1)} failed: ${msg}`;
}

/**
 * Bundled model support.
 *
 * Some hosts (for example a sandboxed artifact page) can't reach
 * huggingface.co. For those builds the model weights and the ONNX Runtime
 * WASM are published next to the page as chunked files described by
 * `models/manifest.json`. When that manifest exists, Transformers.js is given
 * a custom cache that serves files from those chunks instead of the network.
 * Regular builds have no manifest and use the Hugging Face Hub as usual.
 */

export interface BundledFile {
  size: number;
  chunks: string[];
}

export interface BundledManifest {
  /** Keyed by "<repo id>/<file path>", e.g. "briaai/RMBG-1.4/onnx/model_quantized.onnx". */
  files: Record<string, BundledFile>;
  /** ONNX Runtime WASM binary. */
  wasm?: BundledFile;
}

let manifest: Promise<BundledManifest | null> | null = null;

export function getBundledManifest(): Promise<BundledManifest | null> {
  if (!manifest) {
    manifest = fetch(new URL('models/manifest.json', document.baseURI).href)
      .then(async (r) => {
        if (!r.ok || !/json/.test(r.headers.get('content-type') ?? 'json')) return null;
        const m = (await r.json()) as BundledManifest;
        return m && typeof m.files === 'object' ? m : null;
      })
      .catch(() => null);
  }
  return manifest;
}

function chunkUrl(path: string) {
  return new URL(path, document.baseURI).href;
}

/** Stream a chunked file as one Response (with Content-Length for progress). */
function streamFile(f: BundledFile): Response {
  let i = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        if (!reader) {
          if (i >= f.chunks.length) {
            controller.close();
            return;
          }
          const res = await fetch(chunkUrl(f.chunks[i++]));
          if (!res.ok || !res.body) {
            controller.error(new Error(`Failed to load bundled model chunk (${res.status})`));
            return;
          }
          reader = res.body.getReader();
        }
        const { done, value } = await reader.read();
        if (done) {
          reader = null;
          continue;
        }
        controller.enqueue(value);
        return;
      }
    },
  });
  return new Response(body, { headers: { 'content-length': String(f.size), 'content-type': 'application/octet-stream' } });
}

/** Read a chunked file fully, reporting progress. */
export async function readBundled(f: BundledFile, onProgress?: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  const out = new Uint8Array(f.size);
  let offset = 0;
  const reader = streamFile(f).body!.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.set(value, offset);
    offset += value.length;
    onProgress?.(offset, f.size);
  }
  return out.buffer;
}

/** A Web Cache–compatible object serving bundled files to Transformers.js. */
export function bundledCache(m: BundledManifest) {
  const keyOf = (url: string) => {
    const match = url.match(/^https?:\/\/[^/]+\/(.+?)\/resolve\/[^/]+\/(.+)$/);
    return match ? `${match[1]}/${match[2]}` : null;
  };
  return {
    async match(request: string | Request) {
      const key = keyOf(typeof request === 'string' ? request : request.url);
      const f = key ? m.files[key] : undefined;
      return f ? streamFile(f) : undefined;
    },
    async put() {
      // Bundled files are already local; nothing to store.
    },
  };
}

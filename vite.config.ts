import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin, ResolvedConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// The AI runtime loads ONNX Runtime's WASM from /ort (see src/tools/ai/runtime.ts).
// onnxruntime-web also references the file via `new URL(...)`, which makes Vite
// emit an unused 21 MB duplicate; drop it from the build output.
function dropDuplicateOrtWasm(): Plugin {
  return {
    name: 'drop-duplicate-ort-wasm',
    apply: 'build',
    generateBundle(_, bundle) {
      for (const name of Object.keys(bundle)) {
        if (/^assets\/ort-wasm.*\.(wasm|mjs)$/.test(name)) delete bundle[name];
      }
    },
  };
}

// Stamp a per-build ID into dist/sw.js so each deploy gets fresh caches and
// old chunks (and unhashed runtime files like /ort and /pdfjs) are dropped.
function stampServiceWorker(): Plugin {
  let config: ResolvedConfig;
  let names: string[] = [];
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    configResolved(c) {
      config = c;
    },
    generateBundle(_, bundle) {
      names = Object.keys(bundle).sort();
    },
    closeBundle() {
      const file = join(config.root, config.build.outDir, 'sw.js');
      if (!existsSync(file)) return;
      const pkg = readFileSync(join(config.root, 'package-lock.json'), 'utf8');
      const id = createHash('sha256').update(names.join('\n')).update(pkg).digest('hex').slice(0, 12);
      const src = readFileSync(file, 'utf8');
      const out = src.replace(/const VERSION = '[^']*';/, `const VERSION = '${id}';`);
      if (out === src) throw new Error('sw.js: VERSION line not found');
      writeFileSync(file, out);
    },
  };
}

// Cross-origin isolation lets the AI runtime use multiple WASM threads.
// `credentialless` keeps cross-origin model downloads (CORS-enabled) working.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

// Mirrors public/_headers so `npm run preview` exercises the production CSP.
const csp = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; connect-src 'self' blob: data: https://huggingface.co https://*.huggingface.co https://*.hf.co; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};

export default defineConfig({
  plugins: [react(), tailwindcss(), dropDuplicateOrtWasm(), stampServiceWorker()],
  base: './',
  server: { headers: isolation },
  preview: { headers: { ...isolation, ...csp } },
  optimizeDeps: {
    // Transformers.js is loaded lazily by the AI tools; pre-bundle it so the
    // first visit doesn't trigger a dev-server reload.
    include: ['@huggingface/transformers'],
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // The lazily loaded HEIC decoder (libheif WebAssembly) is ~2 MB.
    chunkSizeWarningLimit: 2100,
  },
});

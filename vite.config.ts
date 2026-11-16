import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';

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

// Cross-origin isolation lets the AI runtime use multiple WASM threads.
// `credentialless` keeps cross-origin model downloads (CORS-enabled) working.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  plugins: [react(), tailwindcss(), dropDuplicateOrtWasm()],
  base: './',
  server: { headers: isolation },
  preview: { headers: isolation },
  optimizeDeps: {
    // Transformers.js is loaded lazily by the AI tools; pre-bundle it so the
    // first visit doesn't trigger a dev-server reload.
    include: ['@huggingface/transformers'],
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});

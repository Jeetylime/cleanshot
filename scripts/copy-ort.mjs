// Copy ONNX Runtime Web's WASM files (matching the version Transformers.js
// bundles) into public/ort so the AI tools don't depend on a CDN.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/@huggingface/transformers/dist');
const dest = join(root, 'public/ort');
const files = ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'];

if (!existsSync(src)) {
  console.warn('[copy-ort] @huggingface/transformers not installed; skipping');
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const f of files) copyFileSync(join(src, f), join(dest, f));
console.log(`[copy-ort] copied ${files.length} files to public/ort`);

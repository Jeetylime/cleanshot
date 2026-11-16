// Copy runtime assets that must be served as files (not bundled):
//  - ONNX Runtime Web WASM (matching the version Transformers.js bundles) → public/ort
//  - pdf.js fonts, character maps, color profiles and WASM decoders → public/pdfjs
// Both folders are gitignored and regenerated on every `npm install`.
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (p) => join(root, 'node_modules', p);

const ortSrc = nm('@huggingface/transformers/dist');
if (existsSync(ortSrc)) {
  const dest = join(root, 'public/ort');
  mkdirSync(dest, { recursive: true });
  for (const f of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) copyFileSync(join(ortSrc, f), join(dest, f));
  console.log('[copy-assets] ONNX Runtime → public/ort');
}

const pdfSrc = nm('pdfjs-dist');
if (existsSync(pdfSrc)) {
  for (const dir of ['standard_fonts', 'cmaps', 'iccs', 'wasm']) {
    cpSync(join(pdfSrc, dir), join(root, 'public/pdfjs', dir), { recursive: true });
  }
  console.log('[copy-assets] pdf.js assets → public/pdfjs');
}

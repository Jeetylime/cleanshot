# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # also runs scripts/copy-assets.mjs (postinstall)
npm run dev          # Vite dev server, http://localhost:5173
npm run typecheck    # tsc -b
npm run build        # tsc -b && vite build → dist/
npm run preview      # serve the production build (sends the production CSP)
npm test             # Vitest, once
npx vitest run src/__tests__/zip.test.ts   # a single file (-t "name" for one test)
node scripts/check-sizes.mjs               # after a build: no file in dist/ over 25 MiB
```

Unit tests live in `src/__tests__/` and run in Node, so they cover pure logic only (no canvas or DOM). Verify UI changes by running the app. CI (`.github/workflows/ci.yml`) runs typecheck, tests, build and the size check.

`postinstall` copies ONNX Runtime WASM into `public/ort` and pdf.js fonts/cmaps/WASM into `public/pdfjs`. Both are gitignored; if they are missing (AI tools or PDF rendering fail), rerun `node scripts/copy-assets.mjs`.

## What this is

Studiolo is a local-first, backend-free React 19 + TypeScript + Tailwind v4 + Vite static app. No image or file is ever uploaded; the only network traffic is model weights from huggingface.co on first use of an AI tool. Keep it that way: no third-party requests (fonts are self-hosted via `@fontsource`), and keep dependencies minimal. State management, history, IndexedDB access and image processing are hand-written.

## Architecture

Sections are selected by hash routing in `src/app/route.ts` (`#home`, `#editor`, `#canvas`, `#tools`, `#<tool-key>`, PDF tool keys, legal docs). It also routes window-level paste/drop. Adding a tool means adding its key to `route.ts` and its entry to the relevant registry. Each section and tool is lazy-loaded.

- **Edit** (screenshot editor): `src/engine/` (pure, React-free render/annotation/privacy/image/export logic), `src/store/` (tiny external store with a `useEditor` selector hook, snapshot history, all actions in `actions.ts`), `src/canvas/controller.ts` (imperative pointer/render loop), UI in `src/components/`.
- **Canvas** (design editor): `src/studio/`, with its own `types.ts`, store/actions/history, `render.ts` (one scene renderer shared by screen, thumbnails and export), `geometry.ts`, `Stage.tsx` (interaction), `persistence.ts` (IndexedDB projects and `.studiolo` files; legacy `.cleanshot` still loads), plus `svgExport.ts` and `exportCore.ts`.
- **Image Tools**: `src/tools/registry.ts` lists them. Each tool lives in `src/tools/<tool>/`, with shared helpers in `src/tools/shared/` and the on-demand Transformers.js runtime in `src/tools/ai/`.
- **PDF tools**: `src/pdf/registry.ts` and `src/pdf/tools/*`, built on pdf-lib (write) and pdfjs-dist (render), with shared logic in `src/pdf/engine.ts`.
- **Cross-section handoff**: `src/studio/handoff.ts` sends images to Canvas. Edit's "Send to Canvas", Canvas's "Annotate" and the tools' "Design" buttons go through it.

Key invariants:
- **Edit document is in image space.** Geometry is in base-image pixels. Visual sizes (stroke, font, padding) are logical values multiplied by the per-document `unit` (for example 2 for Retina, read from the PNG pHYs chunk via `src/lib/png.ts`).
- **Immutable documents and snapshot undo.** Every edit returns a new document object. Gestures (drags, slider scrubs, typing) are coalesced into one history step. Destructive ops (crop/rotate/resize) register a new bitmap and keep the old one so they can be undone.
- **Two render paths in Edit.** The screen draws from a mip pyramid with privacy patches on top. Export composites at full resolution and *erases* the original pixels under privacy regions, so redaction must never become just an overlay.
- **WYSIWYG text.** A transparent `<textarea>` handles caret and IME while the canvas paints the glyphs. Text measurement is shared (`engine/text.ts`, `studio/textEngine.ts`).
- Editor keyboard shortcuts and paste/drop apply only inside the editor. Each tool takes window-level paste/drop while it is open. To send files to a tool that hasn't mounted yet, use `openFilesIn(route, files)` in `route.ts`; the tool receives them when it registers its sink.
- The CSP (`public/_headers`, `vercel.json`, mirrored in `vite.config.ts` for `preview`) allows only `'self'` plus Hugging Face hosts for `connect-src`, with no inline scripts. That is why the pre-paint theme script lives in `public/theme-init.js`. Any new external request or inline script needs a CSP change, and usually shouldn't be added.
- `public/sw.js` caches the app shell and same-origin files for offline use (production only). Bump `VERSION` there when its caching rules change.

## Deployment

Static `dist/`, configured for Netlify/Cloudflare (`public/_headers`, `netlify.toml`, `wrangler.jsonc`) and Vercel (`vercel.json`). The COOP `same-origin` and COEP `credentialless` headers enable multithreaded ONNX inference; the dev server sends them too (`vite.config.ts`). The ONNX WASM (~21.6 MB) must stay under Cloudflare's 25 MB per-file limit. RMBG-1.4 is non-commercial-licensed, and the app shows that license before the model downloads.

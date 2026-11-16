# CleanShot

A local-first image workspace for the browser with two sections:

- **Studio**, with two workspaces you can switch between without losing work:
  - **Create**: drop, paste or open an image or screenshot, then annotate it, redact sensitive details, frame it on a background, and export a clean PNG, JPEG or WebP.
  - **Canvas**: a lightweight design editor. Start blank, from a preset size or from a template, then add text, shapes, lines, icons and images, arrange them on layers and export.
- **Image Tools**: eight focused utilities, including AI background removal and AI upscaling that run on your device.

Everything runs locally and no image is ever uploaded. The only network traffic is the one-time download of AI model weights from Hugging Face, made when an AI tool is first used.

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check + production build into dist/
npm run preview   # serve the production build
```

## Features

**Annotate**: arrows (single, double, line), rectangles, ellipses, freehand drawing, text (plain, outline or label), auto-numbered step markers, and a highlighter (marker or area). Every annotation can be selected, moved, resized, restyled, duplicated, copied, pasted, reordered and deleted.

**Privacy**: blur, pixelate and solid redaction. On export, the original pixels under each region are erased and replaced with a patch computed only from downsampled pixels, so nothing recoverable is hidden under a translucent overlay.

**Canvas**: freeform crop or crop to a preset ratio (with numeric X/Y/W/H), resize with an aspect lock, rotate 90°, and flip. Annotations follow every transform.

**Frame**: background presets (gradients and soft mesh wallpapers), custom solid colors and gradients, transparency, padding, rounded corners, drop shadow, and fixed canvas aspect ratios (1:1, 4:3, 16:9, 9:16 and more).

**Export**: PNG, JPEG or WebP; 0.5–3× or custom dimensions; a quality setting for lossy formats; a live file-size estimate; download or copy to the clipboard.

**Workflow**: full undo/redo history, keyboard shortcuts (press `?`), drag-and-drop anywhere, `⌘V` paste, zoom and pan (pinch, `⌘`+scroll, space-drag), recent-session recovery via IndexedDB, dark and light UI themes, and Auto/dark/light/checker canvas backdrops.

## Studio Canvas

**Start**: preset sizes (square, portrait and story posts, YouTube thumbnail, presentation, web banner, US Letter, A4), custom width and height with ratio shortcuts, white/transparent/solid backgrounds, eight editable templates, starting from an image, and reopening saved designs.

**Elements**: text (heading, subheading, body, font pairings), eight shapes, lines and arrows, 34 icons, and images (upload, drag and drop, paste, or reuse from the session). Panels can also be dragged onto the canvas.

**Editing**: select, multi-select (shift-click or marquee), move, resize, rotate (snaps to 45°, Shift for 15°), snapping guides to the page and other elements, align and distribute, layer order, group/ungroup, lock, hide, duplicate, copy/paste, undo/redo, right-click menu and keyboard shortcuts (press `?`).

**Text**: ten self-hosted fonts (no third-party font requests), size, bold, italic, underline, uppercase, alignment, color, letter spacing, line height, outline and shadow. Text stays editable; double-click or press Enter to type.

**Images**: crop in place (drag edges to trim, drag inside to reposition), fill/fit/cover page, flip, rotate, corner radius, border, shadow (follows transparency), opacity, replace, and “Edit in Create” for annotation or redaction.

**Backgrounds**: transparent, solid colors, custom color, gradients with angle, and dot/grid/stripe/check patterns.

**Layers**: list with rename, drag to reorder, hide/show, lock/unlock and delete.

**Projects**: autosaved to IndexedDB (no account, no cloud), reopen and duplicate from “Your designs”, rename, download and import editable `.cleanshot` project files, warnings when browser storage is full or nearly full.

**Export**: PNG, JPEG, WebP or PDF (single page; paper presets export at real US Letter/A4 size), transparent background for PNG/WebP, 0.5–3× or custom dimensions, quality for lossy formats, file name, live preview with size estimate, download or copy. Export uses the same renderer as the screen and waits for fonts and images.

**Integration**: Create's “Send to Canvas” places the edited screenshot on the current design; Canvas's “Edit in Create” opens an image in Create; the Cropper, Background Remover and Upscaler have a “Design” button that opens the result on Canvas.

## Image Tools

| Tool | What it does | How |
| --- | --- | --- |
| Background Remover (AI) | Detects the subject and removes the background; Erase/Restore brushes with undo/redo; solid-color or image backgrounds; transparent PNG or flattened export | **BRIA RMBG-1.4** (IS-Net) via Transformers.js + ONNX Runtime Web, 44 MB quantized, cached after first use. Matte predicted at 1024 px and applied at full resolution |
| Image Upscaler (AI) | 2× and 4× super-resolution with a before/after slider against standard resizing | **Swin2SR**: lightweight ×2 (7 MB) and real-world ×4 (21 MB), run in overlapping tiles with progress, ETA and cancel |
| Image Resizer | Pixels, percent or presets (social, profile, thumbnails, screens); fill/fit/stretch; batch; ZIP | Multi-step downsampling for sharp results |
| Image Cropper | Freeform and ratio crops, social presets with exact output sizes, rotate and flip, live preview | Reuses the editor's crop geometry |
| Image Compressor | JPEG, WebP or PNG with live before/after sizes, a savings summary, compare slider or side-by-side view, batch, ZIP | PNG optimization uses a built-in median-cut quantizer (optional Floyd–Steinberg dithering), an indexed-PNG encoder on the native `CompressionStream`, and a lossless palette path for ≤256-color images |
| Image Converter | PNG, JPEG, WebP or AVIF (where the browser can encode it), batch, quality setting, ZIP | Keeps transparency when the target format supports it |
| Metadata Viewer | File, dimensions, aspect ratio, bit depth, color profile, DPI, full EXIF including GPS; flags sensitive fields; downloads a clean copy | Dependency-free JPEG/PNG/WebP parser. Stripping removes EXIF/XMP/IPTC/text without re-encoding pixels |
| Color Picker | Click to sample with a magnifier; HEX/RGB/HSL copy; dominant palette with coverage; CSS/JSON/PNG export | Median-cut seeds refined with k-means |

The AI runtime is code-split and loads only when an AI tool is opened. ONNX Runtime's WASM is served by the app (`public/ort`), so the only external requests are model weights from `huggingface.co`. The dev and preview servers send cross-origin isolation headers, so inference can use multiple threads.

**Licenses:** RMBG-1.4 is free for non-commercial use under BRIA's license, and the app shows this before the model downloads. The Swin2SR weights are Apache-2.0.

## Architecture

```
src/
  types.ts              Document model (image-space geometry + logical style units)
  engine/               Pure rendering & image logic, no React
    render.ts           Layout, screenshot frame/shadow, annotation drawing, full renders
    annotations.ts      Bounds, hit-testing, handles, resize & transforms
    privacy.ts          Blur/pixelate patches, privacy compositing (pixel removal)
    images.ts           Bitmap registry, mip levels, crop/rotate/flip/resample
    export.ts           Encoding, size limits, download, clipboard
    backgrounds.ts      Presets, gradient/mesh painting
    text.ts             Text measurement shared by canvas and the editor overlay
  store/                Application state
    store.ts            Tiny external store + `useEditor` selector hook, preferences
    history.ts          Snapshot undo/redo with gestures and coalescing
    actions.ts          All user-level operations
    view.ts             Zoom/pan/fit with animation
    factory.ts          Annotation construction from tool styles
  canvas/controller.ts  Imperative canvas: pointer gestures, render loop, overlays
  studio/               Studio Canvas (lazy-loaded)
    types.ts            Design document: elements with box + rotation, fills, assets
    render.ts           Scene renderer shared by screen, thumbnails and export; text layout
    geometry.ts         Transforms, hit-testing, bounds, snapping
    store.ts actions.ts State, snapshot history, every editing and project operation
    persistence.ts      IndexedDB projects + shared asset store, .cleanshot project files
    Stage.tsx           Canvas interaction: select, drag, resize, rotate, crop, pan/zoom, text editing
    factory.ts templates.ts fonts.ts iconData.ts  Element defaults, presets, templates, fonts, icons
    handoff.ts          Tiny bridge so other tools can send images to Canvas
  persistence/          IndexedDB session recovery
  components/           React UI (toolbar, tool rail, properties panels, dialogs, start screen)
  hooks/                Global keyboard, paste/drop and theme handling
  app/route.ts          Hash routing (#home, #studio, #editor, #canvas, #tools, #<tool>) + paste/drop routing
  tools/                Image Tools (each tool is lazy-loaded)
    registry.ts         Tool metadata, groups and lazy components
    ToolsApp.tsx        Tools header, landing grid, error boundary
    shared/             Loading/validation, encoding, ZIP, batch runner, quantizer,
                        indexed PNG encoder, metadata reader/stripper, shared UI
    ai/                 On-demand Transformers.js runtime and model status UI
    bgremove/ upscaler/ resizer/ cropper/ compressor/ converter/ metadata/ colorpicker/
```

The editor and the tools share the design system, UI primitives, image registry helpers and export and download paths, but they have separate interfaces and state. Editor shortcuts and paste/drop only apply inside the editor, and each tool takes window-level paste/drop while it's open.

Key design choices:

- **Image-space document.** Annotation geometry is stored in pixels of the current base image. Visual sizes (stroke widths, font sizes, padding) are *logical* values multiplied by a per-document `unit` (2 for Retina screenshots, read from the PNG's pHYs chunk), so annotations look right on 1× and 2× captures and survive resampling.
- **Immutable documents, snapshot history.** Each edit produces a new document object, so undo is a pointer swap. Drags, slider scrubs and typing are folded into single steps. Destructive operations (crop/rotate/resize) register a new bitmap and keep the old one, so they're undoable too.
- **Two render paths.** The screen draws from a mip pyramid with privacy patches painted on top, which keeps it fast on very large images. Export composites at full resolution, clearing the original pixels under every privacy region before painting.
- **WYSIWYG text editing.** A transparent `<textarea>` handles the caret, selection and IME input while the canvas paints the glyphs, so what you type is exactly what exports.
- **No backend, few dependencies.** React, Tailwind and Lucide icons. State management, history, IndexedDB access and image processing are all built in-house.

## Deploying

CleanShot builds to static files in `dist/` and needs no server. It uses hash routing, so no rewrite rules are needed.

- **Cloudflare Pages / Netlify:** build command `npm run build`, output directory `dist`. Headers come from `public/_headers`.
- **Vercel:** `vercel.json` sets the build, output and headers.
- **Any other static host:** upload `dist/`. To let AI inference use multiple threads, send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless`. Without these headers everything still works, just single-threaded.

The largest file is the ONNX runtime at about 21.6 MB, which is under Cloudflare Pages' 25 MB per-file limit. AI model weights aren't part of the site: browsers download them from huggingface.co on first use.

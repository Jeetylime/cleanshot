/**
 * PDF engine for PDF Tools.
 *
 * - pdf-lib edits documents (merge, split, reorder, rotate, sign, re-save).
 * - pdf.js (Mozilla) renders pages to canvases (thumbnails, previews,
 *   PDF → images, image-based compression).
 *
 * Both are loaded on demand. Fonts, character maps and WASM decoders for
 * pdf.js are served from /pdfjs so nothing is fetched from a CDN.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { createCanvas, ctx2d } from '../engine/images';
import { uid } from '../lib/utils';

export type PdfLib = typeof import('pdf-lib');

let pdfLibP: Promise<PdfLib> | null = null;
export function loadPdfLib(): Promise<PdfLib> {
  pdfLibP ??= import('pdf-lib');
  return pdfLibP;
}

type PdfJs = typeof import('pdfjs-dist');
let pdfjsP: Promise<PdfJs> | null = null;
export function loadPdfJs(): Promise<PdfJs> {
  pdfjsP ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return pdfjsP;
}

const asset = (p: string) => new URL(`pdfjs/${p}/`, document.baseURI).href;

export interface RenderDoc {
  doc: PDFDocumentProxy;
  /** Release the document and its worker resources. */
  close: () => void;
}

/** Open a document for rendering. The bytes are copied (pdf.js transfers its input). */
export async function openForRender(bytes: ArrayBuffer): Promise<RenderDoc> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes.slice(0)),
    standardFontDataUrl: asset('standard_fonts'),
    cMapUrl: asset('cmaps'),
    cMapPacked: true,
    iccUrl: asset('iccs'),
    wasmUrl: asset('wasm'),
  });
  const doc = await task.promise;
  return { doc, close: () => void task.destroy() };
}

/**
 * Render page `n` (1-based). Pass `width` for a target pixel width, or
 * `scale` (1 = 72 DPI).
 */
export async function renderPage(doc: PDFDocumentProxy, n: number, opts: { width?: number; scale?: number; background?: string }): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = opts.scale ?? (opts.width ? opts.width / base.width : 1);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = ctx2d(canvas);
  ctx.fillStyle = opts.background ?? '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, viewport }).promise;
  page.cleanup();
  return canvas;
}

export interface PdfFile {
  id: string;
  name: string;
  size: number;
  bytes: ArrayBuffer;
  pageCount: number;
}

export class PdfError extends Error {}

export function isPdfFile(f: File): boolean {
  return f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
}

/** Read and validate a PDF. Throws PdfError with a readable message. */
export async function loadPdfFile(file: File): Promise<PdfFile> {
  if (!isPdfFile(file)) throw new PdfError(`“${file.name}” isn’t a PDF.`);
  const bytes = await file.arrayBuffer();
  const { PDFDocument } = await loadPdfLib();
  let doc;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    throw new PdfError(`“${file.name}” couldn’t be read. The file may be damaged.`);
  }
  if (doc.isEncrypted) {
    throw new PdfError(`“${file.name}” is password-protected. Remove the password in your PDF reader, then try again.`);
  }
  return { id: uid('pdf'), name: file.name, size: file.size, bytes, pageCount: doc.getPageCount() };
}

export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}

export function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '') || 'document';
}

/**
 * Parse a page selection like "1-3, 5, 8-" into sorted unique 1-based page
 * numbers. Returns null when the text is invalid.
 */
export function parseRanges(text: string, pageCount: number): number[] | null {
  const out = new Set<number>();
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  for (const part of parts) {
    const m = part.match(/^(\d+)?\s*(-)?\s*(\d+)?$/);
    if (!m || (!m[1] && !m[3])) return null;
    const a = m[1] ? parseInt(m[1], 10) : 1;
    const b = m[2] ? (m[3] ? parseInt(m[3], 10) : pageCount) : a;
    if (a < 1 || b < 1 || a > pageCount || b > pageCount) return null;
    for (let p = Math.min(a, b); p <= Math.max(a, b); p++) out.add(p);
  }
  return [...out].sort((x, y) => x - y);
}

/** Compact text for a list of pages, e.g. [1,2,3,5] → "1–3, 5". */
export function formatRanges(pages: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    out.push(j > i ? `${pages[i]}-${pages[j]}` : String(pages[i]));
    i = j;
  }
  return out.join(', ');
}

/** Thumbnails rendered once per document and reused. */
export async function renderThumbnails(
  bytes: ArrayBuffer,
  width: number,
  onThumb: (page: number, url: string) => void,
  signal?: { cancelled: boolean },
): Promise<void> {
  const { doc, close } = await openForRender(bytes);
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      if (signal?.cancelled) return;
      const c = await renderPage(doc, n, { width });
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.85));
      if (blob && !signal?.cancelled) onThumb(n, URL.createObjectURL(blob));
    }
  } finally {
    close();
  }
}

/** Copy a canvas into JPEG/PNG bytes for embedding in a PDF. */
export async function canvasBytes(c: HTMLCanvasElement, type: 'image/jpeg' | 'image/png', quality = 0.9): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, type, quality));
  if (!blob) throw new Error('Image encoding failed');
  return new Uint8Array(await blob.arrayBuffer());
}

export { createCanvas, ctx2d };

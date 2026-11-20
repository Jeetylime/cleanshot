import { canvasToBlob } from '../engine/images';
import { MIME } from '../engine/export';
import type { ExportFormat } from '../types';
import { loadFontsFor } from './fonts';
import { renderExport } from './render';
import { loadAsset } from './actions';
import { allPages, pageDoc } from './pages';
import { rotatePoint, unionBounds } from './geometry';
import { layoutText } from './textEngine';
import { buildSvg } from './svgExport';
import type { Transition } from '../lib/animate';
import type { StudioDoc, TextElement } from './types';

export type Format = ExportFormat | 'pdf' | 'svg' | 'gif' | 'video';
export type Scope = 'page' | 'all' | 'selection';

export interface ExportOptions {
  format: Format;
  scope: Scope;
  /** Output px per design px. */
  scale: number;
  /** Explicit output size (single page/selection); overrides scale. */
  width?: number;
  height?: number;
  quality: number;
  /** Drop the page background (PNG, WebP, SVG). */
  transparent: boolean;
  /** PDF: add an invisible text layer so text can be selected and searched. */
  selectableText: boolean;
  selection: string[];
  name: string;
  /** GIF / video: slideshow through every page. */
  animation?: { hold: number; transition: Transition; transitionMs: number; fps: number };
}

export const isAnimated = (f: Format) => f === 'gif' || f === 'video';

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'design';

/** Make sure every font and image the exported pages use is ready. */
export async function prepare(doc: StudioDoc) {
  const pages = allPages(doc);
  await loadFontsFor(pages.flatMap((p) => p.elements.filter((e): e is TextElement => e.type === 'text')));
  const ids = new Set(pages.flatMap((p) => p.elements.flatMap((e) => (e.type === 'image' && e.assetId ? [e.assetId] : []))));
  await Promise.all([...ids].map(loadAsset));
}

function pagesFor(doc: StudioDoc, scope: Scope): number[] {
  if (scope === 'all') return allPages(doc).map((_, i) => i);
  return [doc.pageIndex];
}

export function selectionBounds(doc: StudioDoc, ids: string[]) {
  const sel = doc.elements.filter((e) => ids.includes(e.id) && !e.hidden);
  return unionBounds(sel);
}

/** Pixel size of the export (first page, or the selection). */
export function outputSize(doc: StudioDoc, o: Pick<ExportOptions, 'scope' | 'scale' | 'selection' | 'width' | 'height'>) {
  const b = o.scope === 'selection' ? selectionBounds(doc, o.selection) : null;
  const w = b ? b.w : doc.width;
  const h = b ? b.h : doc.height;
  return { width: Math.max(1, Math.round(o.width ?? w * o.scale)), height: Math.max(1, Math.round(o.height ?? h * o.scale)) };
}

function rasterPage(doc: StudioDoc, i: number, o: ExportOptions) {
  const pd = pageDoc(doc, i);
  const sel = o.scope === 'selection';
  const bounds = sel ? selectionBounds(pd, o.selection) ?? undefined : undefined;
  const size = outputSize(pd, o);
  const lossyNoAlpha = o.format === 'jpeg' || o.format === 'pdf' || isAnimated(o.format);
  const dropBg = sel || (o.transparent && !lossyNoAlpha);
  const matte = lossyNoAlpha && (dropBg || pd.background.kind === 'transparent') ? '#ffffff' : null;
  return renderExport(pd, {
    scale: o.scale,
    background: !dropBg,
    matte,
    only: sel ? new Set(o.selection) : undefined,
    bounds,
    outW: size.width,
    outH: size.height,
  });
}

/** PDF page size in points: paper presets get real paper sizes, others 96 px per inch. */
export function pdfPageSize(w: number, h: number): [number, number] {
  const near = (a: number, b: number) => Math.abs(a / b - 1) < 0.01;
  const ratio = w / h;
  if (near(ratio, 8.5 / 11) && w >= 600) return [612, 792];
  if (near(ratio, 11 / 8.5) && w >= 600) return [792, 612];
  if (near(ratio, 210 / 297) && w >= 600) return [595.28, 841.89];
  if (near(ratio, 297 / 210) && w >= 600) return [841.89, 595.28];
  return [w * 0.75, h * 0.75];
}

async function buildPdf(doc: StudioDoc, o: ExportOptions): Promise<Blob> {
  const lib = await import('pdf-lib');
  const pdf = await lib.PDFDocument.create();
  pdf.setTitle(doc.name);
  pdf.setCreator('Studiolo');
  pdf.setProducer('Studiolo');
  const font = o.selectableText ? await pdf.embedFont(lib.StandardFonts.Helvetica) : null;
  for (const i of pagesFor(doc, o.scope)) {
    const pd = pageDoc(doc, i);
    const canvas = rasterPage(doc, i, o);
    const lossless = o.quality >= 100;
    const bytes = new Uint8Array(await (await canvasToBlob(canvas, lossless ? 'image/png' : 'image/jpeg', lossless ? undefined : o.quality / 100)).arrayBuffer());
    const img = lossless ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const [pw, ph] = pdfPageSize(pd.width, pd.height);
    const page = pdf.addPage([pw, ph]);
    page.drawImage(img, { x: 0, y: 0, width: pw, height: ph });
    if (font) addTextLayer(lib, page, font, pd, pw / pd.width, ph / pd.height, ph);
    canvas.width = canvas.height = 0;
  }
  return new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' });
}

type PdfLib = typeof import('pdf-lib');

/**
 * Invisible text over the image (like a scanned document's OCR layer), placed
 * and stretched to match each line, so viewers can select, search and copy it.
 */
function addTextLayer(lib: PdfLib, page: import('pdf-lib').PDFPage, font: import('pdf-lib').PDFFont, pd: StudioDoc, kx: number, ky: number, ph: number) {
  const key = page.node.newFontDictionary(font.name, font.ref);
  const encodable = (s: string) =>
    Array.from(s)
      .map((ch) => {
        try {
          font.encodeText(ch);
          return ch;
        } catch {
          return '?';
        }
      })
      .join('');
  for (const e of pd.elements) {
    if (e.type !== 'text' || e.hidden || e.opacity <= 0) continue;
    const L = layoutText(e);
    if (L.curved) continue;
    const c = { x: e.x + e.w / 2, y: e.y + e.h / 2 };
    const phi = (-e.rotation * Math.PI) / 180;
    L.lines.forEach((line, i) => {
      let str = line.segs.map((s) => s.text).join('');
      let width = line.width;
      const avail = e.w - line.indent;
      let lx = line.indent + (e.align === 'center' ? (avail - line.width) / 2 : e.align === 'right' ? avail - line.width : 0);
      if (line.marker) {
        str = `${line.marker} ${str}`;
        const shift = line.markerWidth + e.fontSize * 0.4;
        lx -= shift;
        width += shift;
      }
      str = encodable(str.replace(/\s+$/, ''));
      if (!str.trim()) return;
      const ly = i * L.lineHeightPx + L.lineHeightPx / 2 + e.fontSize * 0.35;
      const p = rotatePoint({ x: e.x + lx, y: e.y + ly }, c, e.rotation);
      const size = e.fontSize * ky;
      const natural = font.widthOfTextAtSize(str, size);
      const tz = natural > 0 ? Math.max(10, Math.min(1000, (100 * width * kx) / natural)) : 100;
      page.pushOperators(
        lib.beginText(),
        lib.setFontAndSize(key, size),
        lib.setTextRenderingMode(lib.TextRenderingMode.Invisible),
        lib.setCharacterSqueeze(tz),
        lib.setTextMatrix(Math.cos(phi), Math.sin(phi), -Math.sin(phi), Math.cos(phi), p.x * kx, ph - p.y * ky),
        lib.showText(font.encodeText(str)),
        lib.endText(),
      );
    });
  }
}

async function svgFor(doc: StudioDoc, i: number, o: ExportOptions): Promise<Blob> {
  const pd = pageDoc(doc, i);
  const sel = o.scope === 'selection';
  const bounds = sel ? selectionBounds(pd, o.selection) ?? undefined : undefined;
  const size = outputSize(pd, o);
  const svg = await buildSvg(pd, { width: size.width, height: size.height, background: !o.transparent && !sel, only: sel ? new Set(o.selection) : undefined, bounds });
  return new Blob([svg], { type: 'image/svg+xml' });
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  /** An image of the first page for the on-screen preview. */
  preview: Blob;
}

export async function produce(doc: StudioDoc, o: ExportOptions): Promise<ExportResult> {
  await prepare(doc);
  const base = safeName(o.name || doc.name);
  const pages = pagesFor(doc, o.scope);
  const previewCanvas = rasterPage(doc, pages[0], { ...o, format: o.format === 'jpeg' || o.format === 'pdf' ? o.format : 'png' });
  const preview = await canvasToBlob(previewCanvas, 'image/png');
  if (o.format === 'pdf') return { blob: await buildPdf(doc, o), filename: `${base}.pdf`, preview };
  if (isAnimated(o.format)) {
    const all = allPages(doc).map((_, i) => i);
    const canvases = all.map((i) => (i === pages[0] ? previewCanvas : rasterPage(doc, i, o)));
    const slides = canvases.map((c) => ({ source: c, width: c.width, height: c.height }));
    const a = o.animation ?? { hold: 1500, transition: 'fade' as Transition, transitionMs: 500, fps: 20 };
    const w = canvases[0].width - (canvases[0].width % 2);
    const h = canvases[0].height - (canvases[0].height % 2);
    const anim = await import('../lib/animate');
    const opts = { width: w, height: h, hold: a.hold, transition: a.transition, transitionMs: a.transitionMs, fps: a.fps, background: '#ffffff', fit: 'contain' as const, loopBack: true };
    if (o.format === 'gif') return { blob: await anim.renderGif(slides, opts), filename: `${base}.gif`, preview };
    const vt = anim.videoType();
    return { blob: await anim.renderVideo(slides, opts), filename: `${base}.${vt?.ext ?? 'webm'}`, preview };
  }

  const ext = o.format === 'jpeg' ? 'jpg' : o.format;
  const one = async (i: number): Promise<Blob> => {
    if (o.format === 'svg') return svgFor(doc, i, o);
    const c = i === pages[0] ? previewCanvas : rasterPage(doc, i, o);
    return canvasToBlob(c, MIME[o.format as ExportFormat], o.format === 'png' ? undefined : o.quality / 100);
  };
  if (pages.length === 1) return { blob: await one(pages[0]), filename: `${base}.${ext}`, preview };
  const { createZip } = await import('../tools/shared/zip');
  const files: { name: string; blob: Blob }[] = [];
  for (const i of pages) files.push({ name: `${base}-${String(i + 1).padStart(2, '0')}.${ext}`, blob: await one(i) });
  return { blob: await createZip(files), filename: `${base}.zip`, preview };
}

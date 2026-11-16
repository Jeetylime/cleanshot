import type { EditorDoc, ExportFormat } from '../types';
import { canvasToBlob } from './images';
import { computeLayout, renderDocument } from './render';
import { stripExtension } from '../lib/utils';

export const MIME: Record<ExportFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export const EXTENSION: Record<ExportFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
};

export const MAX_EXPORT_SIDE = 16384;
export const MAX_EXPORT_AREA = 140_000_000;

export function outputSize(doc: EditorDoc): { width: number; height: number } {
  const L = computeLayout(doc);
  return { width: L.outW, height: L.outH };
}

/** Clamp a requested size to what browsers can safely allocate. */
export function clampExportSize(w: number, h: number): { width: number; height: number; clamped: boolean } {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  const k = Math.min(1, MAX_EXPORT_SIDE / w, MAX_EXPORT_SIDE / h, Math.sqrt(MAX_EXPORT_AREA / (w * h)));
  if (k >= 1) return { width: w, height: h, clamped: false };
  return { width: Math.max(1, Math.floor(w * k)), height: Math.max(1, Math.floor(h * k)), clamped: true };
}

export interface ExportRequest {
  format: ExportFormat;
  /** 1–100, used by lossy formats. */
  quality: number;
  width: number;
  height: number;
}

export interface ExportResult {
  blob: Blob;
  /** The format actually produced (browsers may fall back to PNG). */
  format: ExportFormat;
  width: number;
  height: number;
}

export async function exportDocument(doc: EditorDoc, req: ExportRequest): Promise<ExportResult> {
  const { width, height } = clampExportSize(req.width, req.height);
  const canvas = renderDocument(doc, {
    width,
    height,
    matte: req.format === 'jpeg' ? '#ffffff' : null,
  });
  const blob = await canvasToBlob(canvas, MIME[req.format], req.format === 'png' ? undefined : req.quality / 100);
  const actual = (Object.keys(MIME) as ExportFormat[]).find((f) => MIME[f] === blob.type) ?? 'png';
  // Release the backing store promptly; large exports can be hundreds of MB.
  canvas.width = canvas.height = 0;
  return { blob, format: actual, width, height };
}

export function exportFileName(doc: EditorDoc, format: ExportFormat): string {
  const base = stripExtension(doc.name || 'CleanShot').trim() || 'CleanShot';
  return `${base}.${EXTENSION[format]}`;
}

type DownloadsApi = { save(req: { filename: string; data: Blob }): Promise<unknown> };
type ClaudeHost = { use(name: string): Promise<unknown> };

/**
 * Save a file. Inside a claude.ai artifact, direct downloads are blocked, so
 * the host's `downloads` capability is used (the viewer confirms the save).
 * Everywhere else a regular browser download is started.
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<'saved' | 'declined'> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (host && typeof host.use === 'function') {
    const downloads = (await host.use('downloads').catch(() => null)) as DownloadsApi | null;
    if (downloads) {
      try {
        await downloads.save({ filename, data: blob });
        return 'saved';
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === 'declined' || code === 'rate_limited') return 'declined';
        throw err;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}

export function clipboardSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.clipboard && typeof ClipboardItem !== 'undefined';
}

/**
 * Write a PNG to the clipboard. The blob is passed as a promise so Safari
 * keeps the user-activation that started the copy.
 */
export async function writeImageToClipboard(blob: Promise<Blob>): Promise<void> {
  if (!clipboardSupported()) throw new Error('Clipboard images are not supported in this browser');
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } catch (err) {
    // Some engines only accept resolved blobs.
    const resolved = await blob;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': resolved })]).catch(() => {
      throw err;
    });
  }
}

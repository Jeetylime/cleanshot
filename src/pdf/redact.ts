import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdfJs } from './engine';

/** A redaction box on a page, as fractions (0–1) of the page as displayed (rotation applied). */
export interface RedactBox {
  id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const PATTERNS: { id: string; label: string; re: RegExp }[] = [
  { id: 'email', label: 'Email addresses', re: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  { id: 'phone', label: 'Phone numbers', re: /(?:\+?\d[\d\s().-]{7,}\d)/g },
  { id: 'card', label: 'Card numbers', re: /\b(?:\d[ -]?){13,19}\b/g },
  { id: 'iban', label: 'IBANs', re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g },
];

interface TextItem {
  str: string;
  transform: number[];
  width: number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Find text on every page and return boxes covering each match. Positions
 * within a text run are estimated from character offsets (runs use one font),
 * with a little padding so nothing peeks out.
 */
export async function findBoxes(doc: PDFDocumentProxy, query: string | RegExp, uid: () => string): Promise<RedactBox[]> {
  const { Util } = await loadPdfJs();
  const re = typeof query === 'string' ? new RegExp(escapeRe(query.trim()), 'gi') : new RegExp(query.source, query.flags.includes('g') ? query.flags : query.flags + 'g');
  const out: RedactBox[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const items = (await page.getTextContent()).items as TextItem[];
    for (const it of items) {
      if (!it.str) continue;
      re.lastIndex = 0;
      for (const m of it.str.matchAll(re)) {
        if (!m[0]) continue;
        const t = Util.transform(vp.transform, it.transform);
        const fontH = Math.hypot(t[2], t[3]);
        const len = it.str.length;
        const fullW = it.width * vp.scale;
        const angle = Math.atan2(t[1], t[0]);
        const x0 = (fullW * (m.index ?? 0)) / len;
        const x1 = (fullW * ((m.index ?? 0) + m[0].length)) / len;
        // Axis-aligned box around the (possibly rotated) match.
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const pts = [
          [x0, 0.25 * fontH],
          [x1, 0.25 * fontH],
          [x0, -fontH],
          [x1, -fontH],
        ].map(([dx, dy]) => [t[4] + dx * cos - dy * sin, t[5] + dx * sin + dy * cos]);
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const pad = fontH * 0.12;
        const bx = Math.min(...xs) - pad;
        const by = Math.min(...ys) - pad;
        out.push({ id: uid(), page: n, x: bx / vp.width, y: by / vp.height, w: (Math.max(...xs) - bx + pad) / vp.width, h: (Math.max(...ys) - by + pad) / vp.height });
      }
    }
    page.cleanup();
  }
  return out;
}

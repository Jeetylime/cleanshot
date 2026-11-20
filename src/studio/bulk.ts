import type { StudioDoc, StudioElement, TextRun } from './types';

/**
 * Bulk create: text (and QR codes) in a design can contain {{field}}
 * placeholders; each CSV row produces one filled-in copy.
 */

/** Parse CSV/TSV text. Detects the delimiter (comma, semicolon or tab) from the first line; handles quotes and newlines in quoted fields. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const src = text.replace(/^\uFEFF/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((v) => v.trim())) records.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim())) records.push(row);
  const headers = (records.shift() ?? []).map((h) => h.trim());
  return { headers, rows: records.map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))) };
}

const FIELD_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** Field names used in a page's text and QR codes. */
export function fieldsIn(elements: StudioElement[]): string[] {
  const out = new Set<string>();
  for (const e of elements) {
    const s = e.type === 'text' ? e.text : e.type === 'qr' ? e.data : '';
    for (const m of s.matchAll(FIELD_RE)) out.add(m[1]);
  }
  return [...out];
}

/** Replace placeholders, keeping styled runs aligned with the new text. */
export function fillText(text: string, runs: TextRun[] | undefined, record: Record<string, string>): { text: string; runs: TextRun[] | undefined } {
  let out = '';
  let last = 0;
  // Offset map: [old offset, delta] after each replacement.
  const shifts: [number, number][] = [];
  let delta = 0;
  for (const m of text.matchAll(FIELD_RE)) {
    const value = record[m[1]] ?? '';
    out += text.slice(last, m.index) + value;
    last = m.index! + m[0].length;
    delta += value.length - m[0].length;
    shifts.push([last, delta]);
  }
  if (!shifts.length) return { text, runs };
  out += text.slice(last);
  const map = (o: number) => {
    let d = 0;
    for (const [at, dd] of shifts) if (o >= at) d = dd;
    return o + d;
  };
  const next = runs?.map((r) => ({ ...r, start: map(r.start), end: map(r.end) })).filter((r) => r.end > r.start);
  return { text: out, runs: next };
}

export function fillElements(elements: StudioElement[], record: Record<string, string>, fresh: (e: StudioElement) => StudioElement): StudioElement[] {
  return elements.map((e) => {
    if (e.type === 'text' && FIELD_RE.test(e.text)) {
      FIELD_RE.lastIndex = 0;
      const r = fillText(e.text, e.runs, record);
      return fresh({ ...e, text: r.text, runs: r.runs });
    }
    FIELD_RE.lastIndex = 0;
    if (e.type === 'qr' && FIELD_RE.test(e.data)) {
      FIELD_RE.lastIndex = 0;
      return fresh({ ...e, data: e.data.replace(FIELD_RE, (_m, k: string) => record[k] ?? '') });
    }
    FIELD_RE.lastIndex = 0;
    return fresh(e);
  });
}

/** A multi-page document with one filled copy of `page` per record. */
export function bulkDoc(doc: StudioDoc, pageIndex: number, records: Record<string, string>[], fresh: (e: StudioElement) => StudioElement, pageId: () => string): StudioDoc {
  const src = doc.pages[pageIndex] && pageIndex !== doc.pageIndex ? doc.pages[pageIndex] : { id: '', background: doc.background, elements: doc.elements };
  const pages = records.map((r) => ({ id: pageId(), background: src.background, elements: fillElements(src.elements, r, fresh) }));
  return { ...doc, pages, pageIndex: 0, elements: pages[0].elements, background: pages[0].background };
}

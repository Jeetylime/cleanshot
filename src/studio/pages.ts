import { uid } from '../lib/utils';
import type { PageData, StudioDoc } from './types';

/**
 * Multi-page support. The active page lives in `doc.elements` / `doc.background`
 * so editing code only ever deals with one page; the other pages wait in
 * `doc.pages`. These helpers keep the two in step.
 */

/** Write the active page back into `pages`. */
export function syncPages(doc: StudioDoc): StudioDoc {
  const pages = doc.pages?.length ? [...doc.pages] : [{ id: uid('pg'), background: doc.background, elements: doc.elements }];
  const i = Math.min(Math.max(0, doc.pageIndex ?? 0), pages.length - 1);
  const cur = pages[i];
  if (cur.elements !== doc.elements || cur.background !== doc.background) pages[i] = { ...cur, elements: doc.elements, background: doc.background };
  if (pages === doc.pages && i === doc.pageIndex) return doc;
  return { ...doc, pages, pageIndex: i };
}

export function allPages(doc: StudioDoc): PageData[] {
  return syncPages(doc).pages;
}

/** Make page `i` the active one. */
export function showPage(doc: StudioDoc, i: number): StudioDoc {
  const synced = syncPages(doc);
  const idx = Math.min(Math.max(0, i), synced.pages.length - 1);
  const p = synced.pages[idx];
  return { ...synced, pageIndex: idx, elements: p.elements, background: p.background };
}

/** A single-page document for rendering/exporting page `i`. */
export function pageDoc(doc: StudioDoc, i: number): StudioDoc {
  return showPage(doc, i);
}

/** Upgrade documents saved before pages existed. */
export function migrateDoc(doc: StudioDoc): StudioDoc {
  if (doc.pages?.length) {
    const i = Math.min(Math.max(0, doc.pageIndex ?? 0), doc.pages.length - 1);
    return { ...doc, pageIndex: i, elements: doc.pages[i].elements, background: doc.pages[i].background };
  }
  return { ...doc, pages: [{ id: uid('pg'), background: doc.background, elements: doc.elements ?? [] }], pageIndex: 0 };
}

export function pageCount(doc: StudioDoc | null): number {
  return doc?.pages?.length ?? 1;
}

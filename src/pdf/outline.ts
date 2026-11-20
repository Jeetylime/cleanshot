import type { PDFDocument, PDFRef } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';

type Lib = typeof import('pdf-lib');

/** A bookmark: title, 1-based target page and nesting level (0 = top). */
export interface Bookmark {
  title: string;
  page: number;
  level: number;
}

/** Read the outline with pdf.js, flattened with levels. Unresolvable targets point at page 1. */
export async function readOutline(doc: PDFDocumentProxy): Promise<Bookmark[]> {
  const out: Bookmark[] = [];
  type Node = { title: string; dest: string | unknown[] | null; items: Node[] };
  const walk = async (items: Node[], level: number) => {
    for (const it of items) {
      let page = 1;
      try {
        const dest = typeof it.dest === 'string' ? await doc.getDestination(it.dest) : it.dest;
        const ref = Array.isArray(dest) ? dest[0] : null;
        if (ref && typeof ref === 'object') page = (await doc.getPageIndex(ref as Parameters<PDFDocumentProxy['getPageIndex']>[0])) + 1;
        else if (typeof ref === 'number') page = ref + 1;
      } catch {
        /* keep page 1 */
      }
      out.push({ title: it.title, page, level });
      if (it.items?.length) await walk(it.items, level + 1);
    }
  };
  await walk(((await doc.getOutline()) ?? []) as Node[], 0);
  return out;
}

/** Replace the document's outline. Levels are clamped so each item is at most one deeper than the previous. */
export function writeOutline(lib: Lib, doc: PDFDocument, items: Bookmark[]) {
  const ctx = doc.context;
  const catalog = doc.catalog;
  const N = lib.PDFName.of;
  if (!items.length) {
    catalog.delete(N('Outlines'));
    return;
  }
  const pages = doc.getPages();
  const rootRef = ctx.nextRef();
  type Item = { ref: PDFRef; dict: import('pdf-lib').PDFDict; children: Item[]; parent: Item | null };
  const root: Item = { ref: rootRef, dict: ctx.obj({ Type: 'Outlines' }), children: [], parent: null };
  const stack: Item[] = [root];
  let prevLevel = -1;
  for (const b of items) {
    const level = Math.max(0, Math.min(b.level, prevLevel + 1));
    prevLevel = level;
    while (stack.length > level + 1) stack.pop();
    const parent = stack[stack.length - 1];
    const page = pages[Math.min(Math.max(1, b.page), pages.length) - 1];
    const dict = ctx.obj({});
    dict.set(N('Title'), lib.PDFHexString.fromText(b.title || 'Untitled'));
    dict.set(N('Parent'), parent.ref);
    dict.set(N('Dest'), ctx.obj([page.ref, N('XYZ'), lib.PDFNull, lib.PDFNull, lib.PDFNull]));
    const item: Item = { ref: ctx.nextRef(), dict, children: [], parent };
    parent.children.push(item);
    stack.push(item);
  }
  const link = (node: Item): number => {
    const kids = node.children;
    let count = 0;
    kids.forEach((k, i) => {
      if (i > 0) k.dict.set(N('Prev'), kids[i - 1].ref);
      if (i < kids.length - 1) k.dict.set(N('Next'), kids[i + 1].ref);
      count += 1 + link(k);
    });
    if (kids.length) {
      node.dict.set(N('First'), kids[0].ref);
      node.dict.set(N('Last'), kids[kids.length - 1].ref);
      // Top-level count is positive (open); nested items start collapsed if large.
      if (node !== root) node.dict.set(N('Count'), lib.PDFNumber.of(count > 20 ? -count : count));
    }
    ctx.assign(node.ref, node.dict);
    return count;
  };
  const total = link(root);
  root.dict.set(N('Count'), lib.PDFNumber.of(total));
  catalog.set(N('Outlines'), rootRef);
  catalog.set(N('PageMode'), N('UseOutlines'));
}

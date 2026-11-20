import type { StudioDoc, StudioElement } from './types';

/**
 * Linked copies: elements sharing a `linkId` stay identical in content and
 * style (text, colors, fonts, effects, image, table cells...) while each keeps
 * its own position, size, rotation, layer state and name. After any edit, the
 * changed copy is the source and every other copy, on every page, follows.
 */

/** Properties each copy keeps for itself. */
const OWN = new Set(['id', 'name', 'x', 'y', 'w', 'h', 'rotation', 'locked', 'hidden', 'groupId', 'linkId']);

export function syncLinks(prev: StudioDoc, next: StudioDoc, normalize: (e: StudioElement) => StudioElement): StudioDoc {
  if (next.elements === prev.elements) return next;
  const before = new Map(prev.elements.map((e) => [e.id, e]));
  const sources = new Map<string, StudioElement>();
  for (const e of next.elements) {
    if (!e.linkId) continue;
    const old = before.get(e.id);
    if (old && old !== e && contentChanged(old, e)) sources.set(e.linkId, e);
  }
  if (!sources.size) return next;
  const follow = (e: StudioElement): StudioElement => {
    const src = e.linkId ? sources.get(e.linkId) : undefined;
    if (!src || src.id === e.id || src.type !== e.type) return e;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(e)) if (OWN.has(k)) out[k] = v;
    for (const [k, v] of Object.entries(src)) if (!OWN.has(k)) out[k] = v;
    return normalize(out as unknown as StudioElement);
  };
  const elements = next.elements.map(follow);
  const pages = next.pages?.map((p, i) => (i === next.pageIndex ? p : { ...p, elements: p.elements.map(follow) }));
  return { ...next, elements, pages };
}

function contentChanged(a: StudioElement, b: StudioElement): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (OWN.has(k)) continue;
    const va = (a as unknown as Record<string, unknown>)[k];
    const vb = (b as unknown as Record<string, unknown>)[k];
    if (va !== vb && JSON.stringify(va) !== JSON.stringify(vb)) return true;
  }
  return false;
}

/** How many elements (on all pages) share this link. */
export function linkCount(doc: StudioDoc, linkId: string | undefined): number {
  if (!linkId) return 0;
  const pages = doc.pages?.length ? doc.pages.map((p, i) => (i === doc.pageIndex ? doc.elements : p.elements)) : [doc.elements];
  return pages.reduce((n, els) => n + els.filter((e) => e.linkId === linkId).length, 0);
}

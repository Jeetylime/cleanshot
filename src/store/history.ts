import type { EditorDoc } from '../types';
import { getImage, releaseImages } from '../engine/images';
import { store } from './store';

/**
 * Snapshot-based undo/redo. Documents are immutable, so each history entry
 * is just a reference to a previous document (structural sharing keeps
 * this cheap). Continuous interactions (drags, slider scrubs, typing) are
 * collapsed into a single entry using gestures or coalescing keys.
 */

const HISTORY_LIMIT = 200;
/**
 * Pixel memory that undo history may keep alive for crops, rotations and
 * resizes (each keeps its previous bitmap). Past this, the oldest steps are
 * forgotten so a long session on a huge image can't exhaust memory.
 */
export const HISTORY_IMAGE_BUDGET = 1024 * 1024 * 1024;
const COALESCE_MS = 900;

let lastKey: string | null = null;
let lastTime = 0;
let gestureBase: EditorDoc | null = null;

function pruneSelection(doc: EditorDoc | null, selection: string[]): string[] {
  if (!doc) return [];
  const ids = new Set(doc.annotations.map((a) => a.id));
  const next = selection.filter((id) => ids.has(id));
  return next.length === selection.length ? selection : next;
}

/** Apply a change as an undoable step. */
export function commit(mutate: (doc: EditorDoc) => EditorDoc, opts: { key?: string } = {}) {
  const s = store.get();
  if (!s.doc) return;
  if (gestureBase) {
    // Inside a gesture, changes are folded into the gesture's entry.
    updateLive(mutate);
    return;
  }
  const next = mutate(s.doc);
  if (next === s.doc) return;
  const now = performance.now();
  const coalesce = !!opts.key && opts.key === lastKey && now - lastTime < COALESCE_MS;
  lastKey = opts.key ?? null;
  lastTime = now;
  store.set({
    doc: next,
    past: coalesce ? s.past : [...s.past, s.doc].slice(-HISTORY_LIMIT),
    future: [],
    selection: pruneSelection(next, s.selection),
  });
  if (next.imageId !== s.doc.imageId) enforceBudget();
}

/** Start a gesture: subsequent live updates become one undo step. */
export function beginGesture() {
  const doc = store.get().doc;
  if (!doc) return;
  gestureBase = doc;
  lastKey = null;
  store.set({ gesturing: true });
}

/** Mutate the document without recording history. */
export function updateLive(mutate: (doc: EditorDoc) => EditorDoc) {
  const s = store.get();
  if (!s.doc) return;
  const next = mutate(s.doc);
  if (next !== s.doc) store.set({ doc: next });
}

export function endGesture() {
  const s = store.get();
  const base = gestureBase;
  gestureBase = null;
  if (base && s.doc && base !== s.doc) {
    store.set({
      past: [...s.past, base].slice(-HISTORY_LIMIT),
      future: [],
      gesturing: false,
      selection: pruneSelection(s.doc, s.selection),
    });
    if (base.imageId !== s.doc.imageId) enforceBudget();
  } else {
    store.set({ gesturing: false });
  }
}

/** Abort a gesture, restoring the document to its state before it began. */
export function cancelGesture() {
  const base = gestureBase;
  gestureBase = null;
  if (base) {
    const s = store.get();
    store.set({ doc: base, gesturing: false, selection: pruneSelection(base, s.selection) });
  } else {
    store.set({ gesturing: false });
  }
}

export function inGesture(): boolean {
  return gestureBase !== null;
}

export function undo() {
  const s = store.get();
  if (!s.doc || !s.past.length || gestureBase) return;
  const prev = s.past[s.past.length - 1];
  lastKey = null;
  store.set({
    doc: prev,
    past: s.past.slice(0, -1),
    future: [s.doc, ...s.future].slice(0, HISTORY_LIMIT),
    selection: pruneSelection(prev, s.selection),
    editingTextId: null,
  });
}

export function redo() {
  const s = store.get();
  if (!s.doc || !s.future.length || gestureBase) return;
  const next = s.future[0];
  lastKey = null;
  store.set({
    doc: next,
    past: [...s.past, s.doc].slice(-HISTORY_LIMIT),
    future: s.future.slice(1),
    selection: pruneSelection(next, s.selection),
    editingTextId: null,
  });
}

const docImages = (d: EditorDoc) => [d.imageId, d.originalImageId];

/**
 * Drop the oldest undo steps (then the farthest redo steps) until the distinct
 * images referenced by history fit in `budget` bytes. The current document's
 * images are always kept. Pure, for testing.
 */
export function trimHistoryToBudget<D>(
  doc: D,
  past: D[],
  future: D[],
  imagesOf: (d: D) => string[],
  bytesOf: (id: string) => number,
  budget: number,
): { past: D[]; future: D[]; dropped: string[] } {
  const total = (list: D[]) => {
    const ids = new Set([doc, ...list].flatMap(imagesOf));
    let n = 0;
    for (const id of ids) n += bytesOf(id);
    return n;
  };
  let p = past;
  let f = future;
  while (p.length + f.length > 0 && total([...p, ...f]) > budget) {
    if (p.length) p = p.slice(1);
    else f = f.slice(0, -1);
  }
  if (p === past && f === future) return { past, future, dropped: [] };
  const kept = new Set([doc, ...p, ...f].flatMap(imagesOf));
  const before = new Set([doc, ...past, ...future].flatMap(imagesOf));
  return { past: p, future: f, dropped: [...before].filter((id) => !kept.has(id)) };
}

/** ~4 bytes per pixel, plus a third more for mip levels. */
function imageBytes(id: string): number {
  const e = getImage(id);
  return e ? Math.round(e.width * e.height * 4 * 1.34) : 0;
}

function enforceBudget() {
  const s = store.get();
  if (!s.doc) return;
  const t = trimHistoryToBudget(s.doc, s.past, s.future, docImages, imageBytes, HISTORY_IMAGE_BUDGET);
  if (!t.dropped.length && t.past === s.past && t.future === s.future) return;
  store.set({ past: t.past, future: t.future });
  releaseImages(t.dropped);
}

/** Replace the document and clear history (new session). */
export function resetHistory(doc: EditorDoc | null) {
  gestureBase = null;
  lastKey = null;
  store.set({ doc, past: [], future: [], selection: [], editingTextId: null, gesturing: false });
}

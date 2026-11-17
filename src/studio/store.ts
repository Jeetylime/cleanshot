import { useRef, useSyncExternalStore } from 'react';
import type { Rect } from '../types';
import type { Asset, StudioDoc, StudioElement, StudioFill, StudioView } from './types';
import type { Guide } from './geometry';
import { shallowEqual } from '../store/store';

export type LeftPanel = 'templates' | 'elements' | 'text' | 'uploads' | 'backgrounds' | 'brand' | 'layers';

export interface StudioState {
  doc: StudioDoc | null;
  past: StudioDoc[];
  future: StudioDoc[];
  selection: string[];
  editingTextId: string | null;
  /** Image element currently in crop mode. */
  cropId: string | null;
  view: StudioView;
  viewport: { w: number; h: number };
  guides: Guide[];
  marquee: Rect | null;
  panel: LeftPanel | null;
  /** Images added during this session (recently used). */
  assets: Asset[];
  exportOpen: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  storageWarning: string | null;
  /** True while a pointer gesture is in progress on the stage. */
  gesturing: boolean;
  fullscreen: boolean;
  /** Bumped when fonts or images finish loading, to trigger a redraw. */
  paintTick: number;
  /** Selected character range in the text being edited. */
  textSel: { start: number; end: number } | null;
  dialog: 'resize' | 'find' | null;
}

type Listener = () => void;

function createStore(initial: StudioState) {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch: Partial<StudioState> | ((s: StudioState) => Partial<StudioState>)) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      listeners.forEach((l) => l());
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export const studio = createStore({
  doc: null,
  past: [],
  future: [],
  selection: [],
  editingTextId: null,
  cropId: null,
  view: { zoom: 1, x: 0, y: 0, mode: 'fit' },
  viewport: { w: 800, h: 600 },
  guides: [],
  marquee: null,
  panel: null,
  assets: [],
  exportOpen: false,
  saveState: 'idle',
  storageWarning: null,
  gesturing: false,
  fullscreen: false,
  paintTick: 0,
  textSel: null,
  dialog: null,
});

export function useStudio<T>(selector: (s: StudioState) => T, equal: (a: T, b: T) => boolean = Object.is): T {
  const memo = useRef<{ has: boolean; value: T }>({ has: false, value: undefined as T });
  const getSnapshot = () => {
    const next = selector(studio.get());
    if (memo.current.has && equal(memo.current.value, next)) return memo.current.value;
    memo.current = { has: true, value: next };
    return next;
  };
  return useSyncExternalStore(studio.subscribe, getSnapshot, getSnapshot);
}

export { shallowEqual };

// ---------------------------------------------------------------------------
// History

const LIMIT = 150;
const COALESCE_MS = 800;
let lastKey: string | null = null;
let lastTime = 0;
let gestureBase: StudioDoc | null = null;

function prune(doc: StudioDoc | null, sel: string[]) {
  if (!doc) return [];
  const ids = new Set(doc.elements.map((e) => e.id));
  const next = sel.filter((id) => ids.has(id));
  return next.length === sel.length ? sel : next;
}

/** Apply an undoable change. Changes with the same `key` within a short time merge. */
export function commit(mutate: (doc: StudioDoc) => StudioDoc, key?: string) {
  const s = studio.get();
  if (!s.doc) return;
  const next = mutate(s.doc);
  if (next === s.doc) return;
  const stamped = { ...next, updatedAt: Date.now() };
  if (gestureBase) {
    studio.set({ doc: stamped, selection: prune(stamped, s.selection) });
    return;
  }
  const now = performance.now();
  const merge = key !== undefined && key === lastKey && now - lastTime < COALESCE_MS;
  lastKey = key ?? null;
  lastTime = now;
  studio.set({
    doc: stamped,
    past: merge ? s.past : [...s.past.slice(-LIMIT + 1), s.doc],
    future: [],
    selection: prune(stamped, s.selection),
  });
}

/** Replace the document without recording history (live gesture previews, font reflow). */
export function replaceLive(mutate: (doc: StudioDoc) => StudioDoc) {
  const s = studio.get();
  if (!s.doc) return;
  const next = mutate(s.doc);
  if (next !== s.doc) studio.set({ doc: next });
}

export function beginGesture() {
  const d = studio.get().doc;
  if (d && !gestureBase) gestureBase = d;
  studio.set({ gesturing: true });
}

export function endGesture() {
  const s = studio.get();
  const base = gestureBase;
  gestureBase = null;
  lastKey = null;
  if (base && s.doc && base !== s.doc) {
    studio.set({ past: [...s.past.slice(-LIMIT + 1), base], future: [], doc: { ...s.doc, updatedAt: Date.now() }, gesturing: false, guides: [] });
  } else studio.set({ gesturing: false, guides: [] });
}

export function cancelGesture() {
  const base = gestureBase;
  gestureBase = null;
  if (base) studio.set({ doc: base });
  studio.set({ gesturing: false, guides: [], marquee: null });
}

export function undo() {
  const s = studio.get();
  if (!s.doc || !s.past.length || gestureBase) return;
  const prev = s.past[s.past.length - 1];
  lastKey = null;
  studio.set({ doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future], selection: prune(prev, s.selection), editingTextId: null, cropId: null });
}

export function redo() {
  const s = studio.get();
  if (!s.doc || !s.future.length || gestureBase) return;
  const next = s.future[0];
  lastKey = null;
  studio.set({ doc: next, past: [...s.past, s.doc], future: s.future.slice(1), selection: prune(next, s.selection), editingTextId: null, cropId: null });
}

export function resetHistory(doc: StudioDoc | null) {
  lastKey = null;
  gestureBase = null;
  studio.set({ doc, past: [], future: [], selection: [], editingTextId: null, cropId: null, guides: [], marquee: null });
}

// ---------------------------------------------------------------------------
// Small helpers used across actions and components

export function selectedElements(s: StudioState = studio.get()): StudioElement[] {
  if (!s.doc) return [];
  const set = new Set(s.selection);
  return s.doc.elements.filter((e) => set.has(e.id));
}

export function elementById(id: string, s: StudioState = studio.get()): StudioElement | undefined {
  return s.doc?.elements.find((e) => e.id === id);
}

export function isTransparent(f: StudioFill) {
  return f.kind === 'transparent';
}

// Test hook (development builds only).
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __studio: typeof studio }).__studio = studio;

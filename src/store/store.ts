import { useRef, useSyncExternalStore } from 'react';
import type {
  A11yPrefs,
  Backdrop,
  CropState,
  EditorDoc,
  ExportFormat,
  FillMode,
  TextStyle,
  Theme,
  ToolId,
  ViewState,
} from '../types';

export interface ToolStyles {
  /** Shared color for arrows, shapes, pen, text and steps. */
  color: string;
  arrow: { strokeWidth: number; heads: 'end' | 'both' | 'none'; shadow: boolean; opacity: number };
  rect: { strokeWidth: number; radius: number; fill: FillMode; shadow: boolean; opacity: number };
  ellipse: { strokeWidth: number; fill: FillMode; shadow: boolean; opacity: number };
  pen: { strokeWidth: number; shadow: boolean; opacity: number };
  text: { fontSize: number; weight: 400 | 600 | 800; style: TextStyle; shadow: boolean; opacity: number };
  step: { size: number; shadow: boolean; opacity: number };
  highlighter: { color: string; strokeWidth: number; mode: 'stroke' | 'box' | 'spotlight'; opacity: number };
  magnify: { zoom: number; shape: 'circle' | 'rounded'; strokeWidth: number; shadow: boolean; opacity: number };
  measure: { strokeWidth: number; opacity: number };
  blur: { intensity: number };
  pixelate: { intensity: number };
  redact: { color: string };
}

export interface ExportPrefs {
  format: ExportFormat;
  quality: number;
  scale: number;
}

export interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'info';
}

export interface SessionSummary {
  id: string;
  name: string;
  updatedAt: number;
  width: number;
  height: number;
  thumbUrl: string | null;
}

export type Overlay = null | 'export' | 'shortcuts' | 'text';

export interface EditorState {
  doc: EditorDoc | null;
  past: EditorDoc[];
  future: EditorDoc[];
  tool: ToolId;
  selection: string[];
  editingTextId: string | null;
  styles: ToolStyles;
  view: ViewState;
  viewport: { w: number; h: number };
  crop: CropState | null;
  theme: Theme;
  backdrop: Backdrop;
  a11y: A11yPrefs;
  exportPrefs: ExportPrefs;
  overlay: Overlay;
  propertiesOpen: boolean;
  toast: Toast | null;
  busy: string | null;
  recents: SessionSummary[];
  /** True while a pointer gesture is mutating the document. */
  gesturing: boolean;
  /** Eyedropper armed: the next click on the image samples a color for this style key. */
  picking: 'color' | null;
}

export const DEFAULT_STYLES: ToolStyles = {
  color: '#ff3b30',
  arrow: { strokeWidth: 5, heads: 'end', shadow: true, opacity: 1 },
  rect: { strokeWidth: 4, radius: 6, fill: 'none', shadow: true, opacity: 1 },
  ellipse: { strokeWidth: 4, fill: 'none', shadow: true, opacity: 1 },
  pen: { strokeWidth: 4, shadow: true, opacity: 1 },
  text: { fontSize: 24, weight: 600, style: 'outline', shadow: false, opacity: 1 },
  step: { size: 30, shadow: true, opacity: 1 },
  highlighter: { color: '#ffd60a', strokeWidth: 18, mode: 'stroke', opacity: 0.45 },
  magnify: { zoom: 2, shape: 'circle', strokeWidth: 3, shadow: true, opacity: 1 },
  measure: { strokeWidth: 2, opacity: 1 },
  blur: { intensity: 50 },
  pixelate: { intensity: 40 },
  redact: { color: '#111114' },
};

const PREFS_KEY = 'cleanshot:prefs';

interface Prefs {
  theme: Theme;
  backdrop: Backdrop;
  a11y: A11yPrefs;
  /** Revision of the a11y defaults the prefs were saved under (see loadA11y). */
  a11yRev?: number;
  styles: ToolStyles;
  exportPrefs: ExportPrefs;
}

function loadPrefs(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Partial<Prefs>;
  } catch {
    return {};
  }
}

function mergeStyles(saved: Partial<ToolStyles> | undefined): ToolStyles {
  const out = structuredClone(DEFAULT_STYLES) as ToolStyles;
  if (!saved) return out;
  for (const key of Object.keys(out) as (keyof ToolStyles)[]) {
    const v = saved[key];
    if (v === undefined) continue;
    if (typeof out[key] === 'object' && typeof v === 'object') {
      Object.assign(out[key] as object, v);
    } else if (typeof v === typeof out[key]) {
      (out as unknown as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}

const prefs = loadPrefs();

/**
 * Accessibility prefs. Link underlines default to ON (WCAG 1.4.1); people can
 * turn them off. Prefs saved before revision 2 stored the old default (off),
 * which wasn't a choice anyone made, so it's upgraded to on. public/theme-init.js
 * mirrors this so the first paint matches.
 */
export const A11Y_REV = 2;
function loadA11y(p: Partial<Prefs>): A11yPrefs {
  const a = { textSize: 'default' as const, reduceMotion: false, highContrast: false, underlineLinks: true, ...p.a11y };
  if ((p.a11yRev ?? 1) < A11Y_REV) a.underlineLinks = true;
  return a;
}

function initialState(): EditorState {
  return {
    doc: null,
    past: [],
    future: [],
    tool: 'select',
    selection: [],
    editingTextId: null,
    styles: mergeStyles(prefs.styles),
    view: { zoom: 1, x: 0, y: 0, mode: 'fit' },
    viewport: { w: 800, h: 600 },
    crop: null,
    theme: prefs.theme ?? 'dark',
    backdrop: prefs.backdrop ?? 'auto',
    a11y: loadA11y(prefs),
    exportPrefs: { format: 'png', quality: 92, scale: 1, ...prefs.exportPrefs },
    overlay: null,
    propertiesOpen: false,
    toast: null,
    busy: null,
    recents: [],
    gesturing: false,
    picking: null,
  };
}

type Listener = () => void;

let state: EditorState = initialState();
const listeners = new Set<Listener>();

export const store = {
  get: (): EditorState => state,
  set(patch: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)) {
    const p = typeof patch === 'function' ? patch(state) : patch;
    let changed = false;
    for (const k in p) {
      if ((p as Record<string, unknown>)[k] !== (state as unknown as Record<string, unknown>)[k]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    state = { ...state, ...p };
    listeners.forEach((l) => l());
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

// Persist preferences (debounced).
let prefsTimer: number | undefined;
let lastPrefs: Prefs | null = null;
store.subscribe(() => {
  const s = store.get();
  if (
    lastPrefs &&
    lastPrefs.theme === s.theme &&
    lastPrefs.backdrop === s.backdrop &&
    lastPrefs.a11y === s.a11y &&
    lastPrefs.styles === s.styles &&
    lastPrefs.exportPrefs === s.exportPrefs
  )
    return;
  lastPrefs = { theme: s.theme, backdrop: s.backdrop, a11y: s.a11y, a11yRev: A11Y_REV, styles: s.styles, exportPrefs: s.exportPrefs };
  clearTimeout(prefsTimer);
  const snapshot = lastPrefs;
  pendingPrefs = snapshot;
  prefsTimer = window.setTimeout(flushPrefs, 300);
});

let pendingPrefs: Prefs | null = null;
function flushPrefs() {
  if (!pendingPrefs) return;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(pendingPrefs));
  } catch {
    /* storage unavailable */
  }
  pendingPrefs = null;
}
// Don't lose a change made just before the page is closed or reloaded.
if (typeof window !== 'undefined') window.addEventListener('pagehide', flushPrefs);

/**
 * Subscribe to a slice of the store. The selector's result is memoized with
 * `equal`, so selectors may return derived arrays/objects as long as an
 * appropriate equality function is supplied.
 */
export function useEditor<T>(selector: (s: EditorState) => T, equal: (a: T, b: T) => boolean = Object.is): T {
  const memo = useRef<{ has: boolean; value: T }>({ has: false, value: undefined as T });
  const getSnapshot = () => {
    const next = selector(store.get());
    if (memo.current.has && equal(memo.current.value, next)) return memo.current.value;
    memo.current = { has: true, value: next };
    return next;
  };
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => Object.is(v, b[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

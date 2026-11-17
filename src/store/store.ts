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

export type Overlay = null | 'export' | 'shortcuts';

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
  blur: { intensity: 50 },
  pixelate: { intensity: 40 },
  redact: { color: '#111114' },
};

const PREFS_KEY = 'cleanshot:prefs';

interface Prefs {
  theme: Theme;
  backdrop: Backdrop;
  a11y: A11yPrefs;
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
    a11y: { textSize: 'default', reduceMotion: false, highContrast: false, underlineLinks: false, ...prefs.a11y },
    exportPrefs: { format: 'png', quality: 92, scale: 1, ...prefs.exportPrefs },
    overlay: null,
    propertiesOpen: false,
    toast: null,
    busy: null,
    recents: [],
    gesturing: false,
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
  lastPrefs = { theme: s.theme, backdrop: s.backdrop, a11y: s.a11y, styles: s.styles, exportPrefs: s.exportPrefs };
  clearTimeout(prefsTimer);
  const snapshot = lastPrefs;
  prefsTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(snapshot));
    } catch {
      /* storage unavailable */
    }
  }, 300);
});

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

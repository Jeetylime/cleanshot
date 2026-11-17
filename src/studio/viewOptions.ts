import { useSyncExternalStore } from 'react';

/** Canvas helpers (rulers, grid, margins, safe zone). Per browser, not per design. */
export interface ViewOptions {
  rulers: boolean;
  grid: boolean;
  gridSize: number;
  snapToGrid: boolean;
  margins: boolean;
  marginSize: number;
  safeZone: boolean;
}

const KEY = 'cleanshot:studio-view';
const DEFAULTS: ViewOptions = { rulers: false, grid: false, gridSize: 40, snapToGrid: false, margins: false, marginSize: 60, safeZone: true };

let opts: ViewOptions = DEFAULTS;
try {
  opts = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
} catch {
  /* defaults */
}
const listeners = new Set<() => void>();

export function getViewOptions() {
  return opts;
}

export function setViewOptions(p: Partial<ViewOptions>) {
  opts = { ...opts, ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(opts));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function subscribeViewOptions(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useViewOptions(): ViewOptions {
  return useSyncExternalStore(subscribeViewOptions, () => opts);
}

/** Story-shaped canvases (9:16) get a safe zone where apps overlay their own buttons. */
export function isStoryShape(w: number, h: number) {
  return Math.abs(w / h - 9 / 16) < 0.02;
}

/** Instagram/TikTok story UI covers roughly the top 14% and bottom 20%. */
export function safeZoneInsets(h: number) {
  return { top: h * 0.14, bottom: h * 0.2 };
}

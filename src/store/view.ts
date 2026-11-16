import type { Rect, ViewState } from '../types';
import { clamp } from '../lib/utils';
import { computeLayout } from '../engine/render';
import { store, type EditorState } from './store';

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 32;
export const ZOOM_STEPS = [0.05, 0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];

/** The region the view should frame, in image space. */
export function viewBounds(s: EditorState): Rect | null {
  if (!s.doc) return null;
  if (s.crop) return { x: 0, y: 0, w: s.doc.width, h: s.doc.height };
  const L = computeLayout(s.doc);
  return { x: -L.imgX, y: -L.imgY, w: L.outW, h: L.outH };
}

let anim: number | null = null;

function cancelAnim() {
  if (anim !== null) cancelAnimationFrame(anim);
  anim = null;
}

export function setView(target: ViewState, animate = false) {
  cancelAnim();
  const from = store.get().view;
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate || reduced) {
    store.set({ view: target });
    return;
  }
  const start = performance.now();
  const dur = 180;
  // Interpolate zoom logarithmically and keep the screen-space motion smooth.
  const step = (t: number) => {
    const k = clamp((t - start) / dur, 0, 1);
    const e = 1 - Math.pow(1 - k, 3);
    const zoom = Math.exp(Math.log(from.zoom) + (Math.log(target.zoom) - Math.log(from.zoom)) * e);
    store.set({
      view: {
        zoom,
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        mode: target.mode,
      },
    });
    anim = k < 1 ? requestAnimationFrame(step) : null;
  };
  anim = requestAnimationFrame(step);
}

export function fitView(animate = false) {
  const s = store.get();
  const b = viewBounds(s);
  if (!b) return;
  const vp = s.viewport;
  const margin = vp.w < 640 ? 20 : 56;
  const zoom = clamp(
    Math.min((vp.w - margin * 2) / Math.max(1, b.w), (vp.h - margin * 2) / Math.max(1, b.h), 1),
    MIN_ZOOM,
    MAX_ZOOM,
  );
  setView(
    {
      zoom,
      x: Math.round((vp.w - b.w * zoom) / 2 - b.x * zoom),
      y: Math.round((vp.h - b.h * zoom) / 2 - b.y * zoom),
      mode: 'fit',
    },
    animate,
  );
}

/** Zoom keeping the screen point (sx, sy) fixed. */
export function zoomAt(zoom: number, sx: number, sy: number, animate = false) {
  const v = store.get().view;
  const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  const wx = (sx - v.x) / v.zoom;
  const wy = (sy - v.y) / v.zoom;
  setView({ zoom: z, x: sx - wx * z, y: sy - wy * z, mode: 'manual' }, animate);
}

export function zoomToCenter(zoom: number, animate = true) {
  const s = store.get();
  const b = viewBounds(s);
  if (!b) return;
  const vp = s.viewport;
  const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  // When the document fits, keep it centered; otherwise zoom around the viewport center.
  if (b.w * z <= vp.w && b.h * z <= vp.h) {
    setView(
      {
        zoom: z,
        x: Math.round((vp.w - b.w * z) / 2 - b.x * z),
        y: Math.round((vp.h - b.h * z) / 2 - b.y * z),
        mode: 'manual',
      },
      animate,
    );
  } else {
    zoomAt(z, vp.w / 2, vp.h / 2, animate);
  }
}

export function zoomStep(dir: 1 | -1) {
  const z = store.get().view.zoom;
  const next =
    dir > 0 ? ZOOM_STEPS.find((s) => s > z * 1.001) ?? MAX_ZOOM : [...ZOOM_STEPS].reverse().find((s) => s < z * 0.999) ?? MIN_ZOOM;
  zoomToCenter(next, true);
}

export function panBy(dx: number, dy: number) {
  cancelAnim();
  const v = store.get().view;
  store.set({ view: { ...v, x: v.x + dx, y: v.y + dy, mode: 'manual' } });
}

export function setViewport(w: number, h: number) {
  const vp = store.get().viewport;
  if (vp.w === w && vp.h === h) return;
  store.set({ viewport: { w, h } });
}

// Keep the composition framed while in "fit" mode.
let lastBoundsKey = '';
store.subscribe(() => {
  const s = store.get();
  const b = viewBounds(s);
  const key = b ? `${b.x},${b.y},${b.w},${b.h}|${s.viewport.w}x${s.viewport.h}|${s.doc?.id}` : '';
  if (key === lastBoundsKey) return;
  const docChanged = !lastBoundsKey.endsWith(`|${s.doc?.id}`);
  lastBoundsKey = key;
  if (b && (s.view.mode === 'fit' || docChanged)) fitView(false);
});

export function screenToImage(v: ViewState, sx: number, sy: number) {
  return { x: (sx - v.x) / v.zoom, y: (sy - v.y) / v.zoom };
}

export function imageToScreen(v: ViewState, x: number, y: number) {
  return { x: x * v.zoom + v.x, y: y * v.zoom + v.y };
}

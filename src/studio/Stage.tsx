import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Point, Rect } from '../types';
import { getImage } from '../engine/images';
import { clamp } from '../lib/utils';
import { studio, useStudio, shallowEqual, beginGesture, endGesture, cancelGesture, selectedElements, elementById } from './store';
import * as A from './actions';
import { aabb, center, corners, hitTest, rotatePoint, snapBox, snapTargets, snapValue, toLocal, unionBounds, type Guide } from './geometry';
import { paintStudioFill, renderScene } from './render';
import { fontOf } from './fonts';
import { makeIcon, makeLine, makeShape, makeText } from './factory';
import type { ImageElement, ShapeKind, StudioElement, TextElement } from './types';
import { ContextMenu, type ContextMenuState } from './ContextMenu';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot';

const HANDLE = 9;
const ROT_OFFSET = 30;

/** Which resize handles an element offers. */
function handlesFor(els: StudioElement[]): Handle[] {
  if (els.length !== 1) return ['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w', 'rot'];
  const e = els[0];
  if (e.type === 'line') return ['w', 'e', 'rot'];
  if (e.type === 'text') return ['nw', 'ne', 'se', 'sw', 'e', 'w', 'rot'];
  return ['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w', 'rot'];
}

/** Drop edge handles when the frame is small on screen, so corners stay grabbable. */
function fitHandles(hs: Handle[], f: Frame, zoom: number): Handle[] {
  if (Math.min(f.w, f.h) * zoom >= 44) return hs;
  return hs.filter((h) => h.length === 2 || h === 'rot' || ((h === 'e' || h === 'w') && hs.length <= 3));
}

const LOCAL: Record<Exclude<Handle, 'rot'>, [number, number]> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
};

const CURSOR: Record<Exclude<Handle, 'rot'>, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
function resizeCursor(h: Exclude<Handle, 'rot'>, rotation: number) {
  const a = (((CURSOR[h] + rotation) % 180) + 180) % 180;
  if (a < 22.5 || a >= 157.5) return 'ew-resize';
  if (a < 67.5) return 'nwse-resize';
  if (a < 112.5) return 'ns-resize';
  return 'nesw-resize';
}

/** Frame used for handles: the single element (rotated) or the selection's bounds. */
interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

function frameOf(els: StudioElement[]): Frame | null {
  if (!els.length) return null;
  const g = els.length > 1 && els.every((e) => e.groupId && e.groupId === els[0].groupId);
  if (els.length === 1 && !g) return { x: els[0].x, y: els[0].y, w: els[0].w, h: els[0].h, rotation: els[0].rotation };
  const b = unionBounds(els)!;
  return { ...b, rotation: 0 };
}

function frameCorner(f: Frame, lx: number, ly: number): Point {
  return rotatePoint({ x: f.x + f.w * lx, y: f.y + f.h * ly }, { x: f.x + f.w / 2, y: f.y + f.h / 2 }, f.rotation);
}

type Drag =
  | { kind: 'move'; start: Point; base: StudioElement[]; box: Rect; targets: ReturnType<typeof snapTargets>; moved: boolean }
  | { kind: 'resize'; handle: Exclude<Handle, 'rot'>; start: Point; frame: Frame; base: StudioElement[]; targets: ReturnType<typeof snapTargets> }
  | { kind: 'rotate'; start: Point; c: Point; base: StudioElement[] }
  | { kind: 'marquee'; start: Point; additive: boolean; initial: string[] }
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'crop-pan'; start: Point; base: ImageElement }
  | { kind: 'crop-resize'; handle: Exclude<Handle, 'rot'>; start: Point; base: ImageElement };

function accent() {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0a84ff';
}

export function Stage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const spaceDown = useRef(false);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ dist: number; zoom: number; mid: Point } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [cursor, setCursor] = useState('default');
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const hasDoc = useStudio((s) => !!s.doc);

  // ---- Size tracking -----------------------------------------------------
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      A.setViewport(Math.round(r.width), Math.round(r.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- Painting ------------------------------------------------------------
  useEffect(() => {
    let raf = 0;
    let dirty = true;
    const paint = () => {
      raf = 0;
      if (!dirty) return;
      dirty = false;
      const c = canvasRef.current;
      const s = studio.get();
      if (!c || !s.doc) return;
      if (A.consumeFitRequest() || s.view.mode === 'fit') {
        const v = A.computeFit(s);
        if (v.zoom !== s.view.zoom || v.x !== s.view.x || v.y !== s.view.y) {
          studio.set({ view: v });
          return;
        }
      }
      const dpr = window.devicePixelRatio || 1;
      const W = s.viewport.w;
      const H = s.viewport.h;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
        c.style.width = `${W}px`;
        c.style.height = `${H}px`;
      }
      const ctx = c.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      const { zoom, x, y } = s.view;
      const doc = s.doc;
      // Page shadow + transparency checker
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.28)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, doc.width * zoom, doc.height * zoom);
      ctx.restore();
      if (doc.background.kind === 'transparent') {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, doc.width * zoom, doc.height * zoom);
        ctx.clip();
        ctx.translate(x, y);
        paintStudioFill(ctx, { kind: 'pattern', pattern: 'checks', bg: '#ffffff', fg: '#e6e6ea', size: 16 }, doc.width * zoom, doc.height * zoom, dpr);
        ctx.restore();
      }
      ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * x, dpr * y);
      renderScene(ctx, doc, { scale: zoom * dpr, skip: s.editingTextId });

      // Overlays in screen space
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const toS = (p: Point) => ({ x: x + p.x * zoom, y: y + p.y * zoom });
      const col = accent();
      const poly = (pts: Point[], stroke: string, width = 1, dash: number[] = []) => {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.setLineDash(dash);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.stroke();
        ctx.setLineDash([]);
      };

      // Crop mode: ghost of the full image + frame
      const cropEl = s.cropId ? (elementById(s.cropId, s) as ImageElement | undefined) : undefined;
      if (cropEl && cropEl.type === 'image') {
        const img = getImage(cropEl.assetId);
        if (img) {
          const kx = cropEl.w / cropEl.crop.w;
          const ky = cropEl.h / cropEl.crop.h;
          ctx.save();
          ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * x, dpr * y);
          const c0 = center(cropEl);
          ctx.translate(c0.x, c0.y);
          ctx.rotate((cropEl.rotation * Math.PI) / 180);
          ctx.translate(-cropEl.w / 2, -cropEl.h / 2);
          if (cropEl.flipX || cropEl.flipY) {
            ctx.translate(cropEl.flipX ? cropEl.w : 0, cropEl.flipY ? cropEl.h : 0);
            ctx.scale(cropEl.flipX ? -1 : 1, cropEl.flipY ? -1 : 1);
          }
          ctx.globalAlpha = 0.35;
          ctx.drawImage(img.source, -cropEl.crop.x * kx, -cropEl.crop.y * ky, img.width * kx, img.height * ky);
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.rect(0, 0, cropEl.w, cropEl.h);
          ctx.clip();
          ctx.drawImage(img.source, -cropEl.crop.x * kx, -cropEl.crop.y * ky, img.width * kx, img.height * ky);
          ctx.restore();
        }
      }

      // Hover outline
      if (hoverRef.current && !s.selection.includes(hoverRef.current) && !s.gesturing) {
        const h = elementById(hoverRef.current, s);
        if (h && !h.hidden) poly(corners(h).map(toS), col, 1);
      }

      const sel = selectedElements(s).filter((e) => !e.hidden);
      if (sel.length && s.editingTextId === null) {
        // Per-element outlines when several are selected
        if (sel.length > 1) for (const e of sel) poly(corners(e).map(toS), col, 1, [3, 3]);
        const f = s.cropId && cropEl ? { x: cropEl.x, y: cropEl.y, w: cropEl.w, h: cropEl.h, rotation: cropEl.rotation } : frameOf(sel);
        if (f) {
          const pts = [frameCorner(f, 0, 0), frameCorner(f, 1, 0), frameCorner(f, 1, 1), frameCorner(f, 0, 1)].map(toS);
          const locked = sel.every((e) => e.locked);
          poly(pts, locked ? '#ff9f0a' : col, 1.5);
          if (!locked && !s.gesturing) {
            const hs = fitHandles(s.cropId ? (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as Handle[]) : handlesFor(sel), f, zoom);
            for (const h of hs) {
              if (h === 'rot') {
                const bc = toS(frameCorner(f, 0.5, 1));
                const a = (f.rotation * Math.PI) / 180;
                const rp = { x: bc.x - Math.sin(a) * ROT_OFFSET, y: bc.y + Math.cos(a) * ROT_OFFSET };
                // Stem from the frame to the handle, so it reads as part of the selection
                ctx.beginPath();
                ctx.moveTo(bc.x - Math.sin(a) * 2, bc.y + Math.cos(a) * 2);
                ctx.lineTo(rp.x + Math.sin(a) * 8, rp.y - Math.cos(a) * 8);
                ctx.strokeStyle = col;
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(rp.x, rp.y, 7, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                ctx.strokeStyle = col;
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(rp.x, rp.y, 3, 0.4, Math.PI * 1.7);
                ctx.stroke();
                continue;
              }
              const [lx, ly] = LOCAL[h];
              const p = toS(frameCorner(f, lx, ly));
              const isEdge = h.length === 1;
              ctx.save();
              ctx.translate(p.x, p.y);
              ctx.rotate((f.rotation * Math.PI) / 180);
              ctx.beginPath();
              if (s.cropId) {
                ctx.rect(isEdge ? -6 : -HANDLE / 2, isEdge ? -2.5 : -HANDLE / 2, isEdge ? 12 : HANDLE, isEdge ? 5 : HANDLE);
                if (h === 'n' || h === 's') {
                  ctx.beginPath();
                  ctx.rect(-6, -2.5, 12, 5);
                } else if (h === 'e' || h === 'w') {
                  ctx.beginPath();
                  ctx.rect(-2.5, -6, 5, 12);
                }
              } else if (isEdge) {
                const horiz = h === 'n' || h === 's';
                ctx.roundRect(horiz ? -8 : -3, horiz ? -3 : -8, horiz ? 16 : 6, horiz ? 6 : 16, 3);
              } else ctx.roundRect(-HANDLE / 2, -HANDLE / 2, HANDLE, HANDLE, 2.5);
              ctx.fillStyle = '#ffffff';
              ctx.fill();
              ctx.strokeStyle = col;
              ctx.lineWidth = 1.25;
              ctx.stroke();
              ctx.restore();
            }
          }
        }
      }

      // Guides
      if (s.guides.length) {
        ctx.strokeStyle = '#ff375f';
        ctx.lineWidth = 1;
        for (const g of s.guides) {
          ctx.beginPath();
          if (g.axis === 'x') {
            const sx = Math.round(x + g.pos * zoom) + 0.5;
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, H);
          } else {
            const sy = Math.round(y + g.pos * zoom) + 0.5;
            ctx.moveTo(0, sy);
            ctx.lineTo(W, sy);
          }
          ctx.stroke();
        }
      }
      // Marquee
      if (s.marquee) {
        const a = toS(s.marquee);
        ctx.fillStyle = 'rgba(10,132,255,0.1)';
        ctx.fillRect(a.x, a.y, s.marquee.w * zoom, s.marquee.h * zoom);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.strokeRect(a.x + 0.5, a.y + 0.5, s.marquee.w * zoom, s.marquee.h * zoom);
      }
    };
    const schedule = () => {
      dirty = true;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    schedule();
    const unsub = studio.subscribe(schedule);
    hoverListeners.add(schedule);
    const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener?.('change', schedule);
    return () => {
      unsub();
      hoverListeners.delete(schedule);
      mq.removeEventListener?.('change', schedule);
      cancelAnimationFrame(raf);
    };
  }, [hasDoc]);

  const hoverRef = useRef<string | null>(null);
  const hoverListeners = useRef(new Set<() => void>()).current;
  useEffect(() => {
    hoverRef.current = hover;
    hoverListeners.forEach((l) => l());
  }, [hover, hoverListeners]);

  // ---- Coordinates & hit testing -----------------------------------------
  const toCanvas = (clientX: number, clientY: number): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    const v = studio.get().view;
    return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom };
  };
  const screenOf = (clientX: number, clientY: number): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const hitElement = (p: Point): StudioElement | null => {
    const s = studio.get();
    if (!s.doc) return null;
    const tol = 4 / s.view.zoom;
    for (let i = s.doc.elements.length - 1; i >= 0; i--) {
      const e = s.doc.elements[i];
      if (e.hidden) continue;
      if (hitTest(e, p, tol)) return e;
    }
    return null;
  };

  const hitHandle = (sp: Point): { handle: Handle; frame: Frame } | null => {
    const s = studio.get();
    const sel = selectedElements(s).filter((e) => !e.hidden);
    if (!sel.length || sel.every((e) => e.locked)) return null;
    const cropEl = s.cropId ? (elementById(s.cropId, s) as ImageElement | undefined) : undefined;
    const f = cropEl ? { x: cropEl.x, y: cropEl.y, w: cropEl.w, h: cropEl.h, rotation: cropEl.rotation } : frameOf(sel);
    if (!f) return null;
    const { zoom, x, y } = s.view;
    const toS = (p: Point) => ({ x: x + p.x * zoom, y: y + p.y * zoom });
    const hs = fitHandles(cropEl ? (['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w'] as Handle[]) : handlesFor(sel), f, zoom);
    const touch = matchMedia('(pointer: coarse)').matches ? 14 : 8;
    for (const h of hs) {
      let p: Point;
      if (h === 'rot') {
        const bc = toS(frameCorner(f, 0.5, 1));
        const a = (f.rotation * Math.PI) / 180;
        p = { x: bc.x - Math.sin(a) * ROT_OFFSET, y: bc.y + Math.cos(a) * ROT_OFFSET };
      } else p = toS(frameCorner(f, ...LOCAL[h]));
      if (Math.hypot(sp.x - p.x, sp.y - p.y) <= touch) return { handle: h, frame: f };
    }
    return null;
  };

  // ---- Pointer handlers ----------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    const s = studio.get();
    if (!s.doc) return;
    setMenu(null);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // Pinch to zoom: cancel whatever the first finger started.
      if (drag.current && drag.current.kind !== 'pan') cancelGesture();
      drag.current = null;
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: s.view.zoom, mid: screenOf((a.x + b.x) / 2, (a.y + b.y) / 2) };
      return;
    }
    if (s.editingTextId) A.finishTextEdit();
    const p = toCanvas(e.clientX, e.clientY);
    const sp = screenOf(e.clientX, e.clientY);

    if (e.button === 1 || spaceDown.current || (e.button === 0 && e.altKey && e.pointerType === 'mouse' && false)) {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: s.view.x, vy: s.view.y };
      setCursor('grabbing');
      return;
    }
    if (e.button === 2) return;

    // Crop mode
    if (s.cropId) {
      const el = elementById(s.cropId, s);
      if (el?.type === 'image') {
        const hh = hitHandle(sp);
        if (hh && hh.handle !== 'rot') {
          beginGesture();
          drag.current = { kind: 'crop-resize', handle: hh.handle, start: p, base: el };
          return;
        }
        if (hitTest(el, p, 0)) {
          beginGesture();
          drag.current = { kind: 'crop-pan', start: p, base: el };
          setCursor('grabbing');
          return;
        }
      }
      A.setCropMode(null);
    }

    const hh = hitHandle(sp);
    if (hh) {
      const base = selectedElements(s).filter((x) => !x.locked);
      beginGesture();
      if (hh.handle === 'rot') {
        drag.current = { kind: 'rotate', start: p, c: center(hh.frame), base };
      } else {
        const others = s.doc.elements.filter((x) => !s.selection.includes(x.id));
        drag.current = { kind: 'resize', handle: hh.handle, start: p, frame: hh.frame, base, targets: snapTargets(s.doc.width, s.doc.height, others) };
      }
      return;
    }

    const hit = hitElement(p);
    if (hit) {
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      if (additive) {
        A.select([hit.id], true);
        return;
      }
      if (!s.selection.includes(hit.id)) A.select([hit.id]);
      const sel = selectedElements().filter((x) => !x.locked);
      if (!sel.length) return;
      const doc = studio.get().doc!;
      const ids = new Set(sel.map((x) => x.id));
      const others = doc.elements.filter((x) => !ids.has(x.id));
      drag.current = { kind: 'move', start: p, base: sel, box: unionBounds(sel)!, targets: snapTargets(doc.width, doc.height, others), moved: false };
      return;
    }

    // Empty space: marquee
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (!additive) A.clearSelection();
    drag.current = { kind: 'marquee', start: p, additive, initial: additive ? s.selection : [] };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = studio.get();
    if (!s.doc) return;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = screenOf((a.x + b.x) / 2, (a.y + b.y) / 2);
      A.zoomAt((pinch.current.zoom * d) / pinch.current.dist, mid.x, mid.y);
      A.panBy(mid.x - pinch.current.mid.x, mid.y - pinch.current.mid.y);
      pinch.current.mid = mid;
      return;
    }
    const p = toCanvas(e.clientX, e.clientY);
    const d = drag.current;
    const zoom = s.view.zoom;
    const snapT = 6 / zoom;
    if (!d) {
      // Hover feedback & cursors
      const sp = screenOf(e.clientX, e.clientY);
      const hh = hitHandle(sp);
      if (spaceDown.current) setCursor('grab');
      else if (hh) {
        const rot = hh.frame.rotation;
        setCursor(hh.handle === 'rot' ? 'grab' : resizeCursor(hh.handle, rot));
      } else {
        const h = hitElement(p);
        setHover(h?.id ?? null);
        setCursor(s.cropId && h?.id === s.cropId ? 'move' : h && !h.locked ? 'move' : 'default');
      }
      return;
    }

    switch (d.kind) {
      case 'pan':
        studio.set({ view: { ...s.view, x: d.vx + (e.clientX - d.sx), y: d.vy + (e.clientY - d.sy), mode: 'manual' } });
        return;
      case 'move': {
        let dx = p.x - d.start.x;
        let dy = p.y - d.start.y;
        if (!d.moved) {
          if (Math.hypot(dx * zoom, dy * zoom) < 3) return;
          d.moved = true;
          beginGesture();
        }
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        let guides: Guide[] = [];
        if (!e.altKey) {
          const snapped = snapBox({ ...d.box, x: d.box.x + dx, y: d.box.y + dy }, d.targets, snapT);
          dx += snapped.dx;
          dy += snapped.dy;
          guides = snapped.guides;
        }
        const byId = new Map(d.base.map((b) => [b.id, b]));
        A.updateLive((el) => {
          const b = byId.get(el.id)!;
          return { ...el, x: b.x + dx, y: b.y + dy };
        }, d.base.map((b) => b.id));
        studio.set({ guides });
        return;
      }
      case 'resize':
        doResize(d, p, e.shiftKey, e.altKey, snapT);
        return;
      case 'rotate': {
        const a0 = Math.atan2(d.start.y - d.c.y, d.start.x - d.c.x);
        const a1 = Math.atan2(p.y - d.c.y, p.x - d.c.x);
        let delta = ((a1 - a0) * 180) / Math.PI;
        const byId = new Map(d.base.map((b) => [b.id, b]));
        const single = d.base.length === 1;
        if (single) {
          let r = d.base[0].rotation + delta;
          if (e.shiftKey) r = Math.round(r / 15) * 15;
          else {
            const near = Math.round(r / 45) * 45;
            if (Math.abs(near - r) < 2.5) r = near;
          }
          delta = r - d.base[0].rotation;
        } else if (e.shiftKey) delta = Math.round(delta / 15) * 15;
        A.updateLive((el) => {
          const b = byId.get(el.id)!;
          const rotation = (((b.rotation + delta) % 360) + 360) % 360;
          if (single) return { ...el, rotation };
          const c = rotatePoint(center(b), d.c, delta);
          return { ...el, rotation, x: c.x - b.w / 2, y: c.y - b.h / 2 };
        }, d.base.map((b) => b.id));
        return;
      }
      case 'marquee': {
        const r = { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) };
        const hits = s.doc.elements.filter((el) => !el.hidden && !el.locked && intersects(aabb(el), r)).map((el) => el.id);
        const ids = A.withGroups([...new Set([...d.initial, ...hits])]);
        studio.set({ marquee: r, selection: shallowEqual(ids, s.selection) ? s.selection : ids });
        return;
      }
      case 'crop-pan': {
        const b = d.base;
        const img = getImage(b.assetId);
        if (!img) return;
        const ld = rotatePoint({ x: p.x - d.start.x, y: p.y - d.start.y }, { x: 0, y: 0 }, -b.rotation);
        const kx = b.crop.w / b.w;
        const ky = b.crop.h / b.h;
        const cx = clamp(b.crop.x - ld.x * kx * (b.flipX ? -1 : 1), 0, img.width - b.crop.w);
        const cy = clamp(b.crop.y - ld.y * ky * (b.flipY ? -1 : 1), 0, img.height - b.crop.h);
        A.updateLive((el) => ({ ...(el as ImageElement), crop: { ...b.crop, x: cx, y: cy } }), [b.id]);
        return;
      }
      case 'crop-resize':
        doCropResize(d, p);
        return;
    }
  };

  const doResize = (d: Extract<Drag, { kind: 'resize' }>, p: Point, shift: boolean, alt: boolean, snapT: number) => {
    const f = d.frame;
    const c0 = center(f);
    const local = rotatePoint(p, c0, -f.rotation);
    const start = rotatePoint(d.start, c0, -f.rotation);
    const dx = local.x - start.x;
    const dy = local.y - start.y;
    let l = 0;
    let t = 0;
    let r = f.w;
    let b = f.h;
    const h = d.handle;
    if (h.includes('w')) l += dx;
    if (h.includes('e')) r += dx;
    if (h.includes('n')) t += dy;
    if (h.includes('s')) b += dy;
    if (alt) {
      // Resize from center
      if (h.includes('w')) r -= dx;
      if (h.includes('e')) l -= dx;
      if (h.includes('n')) b -= dy;
      if (h.includes('s')) t -= dy;
    }
    // Snap moving edges (unrotated frames only)
    const guides: Guide[] = [];
    if (!f.rotation && !alt) {
      if (h.includes('w')) {
        const sv = snapValue(f.x + l, d.targets.xs, snapT);
        l = sv.value - f.x;
        if (sv.pos !== null) guides.push({ axis: 'x', pos: sv.pos });
      }
      if (h.includes('e')) {
        const sv = snapValue(f.x + r, d.targets.xs, snapT);
        r = sv.value - f.x;
        if (sv.pos !== null) guides.push({ axis: 'x', pos: sv.pos });
      }
      if (h.includes('n')) {
        const sv = snapValue(f.y + t, d.targets.ys, snapT);
        t = sv.value - f.y;
        if (sv.pos !== null) guides.push({ axis: 'y', pos: sv.pos });
      }
      if (h.includes('s')) {
        const sv = snapValue(f.y + b, d.targets.ys, snapT);
        b = sv.value - f.y;
        if (sv.pos !== null) guides.push({ axis: 'y', pos: sv.pos });
      }
    }
    const min = 4;
    let nw = Math.max(min, r - l);
    let nh = Math.max(min, b - t);
    const corner = h.length === 2;
    const single = d.base.length === 1 ? d.base[0] : null;
    const keepAspect = corner && (shift !== (!single || single.type === 'image' || single.type === 'icon' || single.type === 'text'));
    if (keepAspect) {
      const k = Math.max(nw / f.w, nh / f.h);
      nw = f.w * k;
      nh = f.h * k;
      guides.length = 0;
    }
    // Anchor the opposite side
    let nl: number;
    let nt: number;
    if (alt) {
      nl = (f.w - nw) / 2;
      nt = (f.h - nh) / 2;
    } else {
      nl = h.includes('w') ? f.w - nw : h.includes('e') ? 0 : (f.w - nw) / 2;
      nt = h.includes('n') ? f.h - nh : h.includes('s') ? 0 : (f.h - nh) / 2;
      if (!h.includes('w') && !h.includes('e')) nl = keepAspect ? (f.w - nw) / 2 : 0;
      if (!h.includes('n') && !h.includes('s')) nt = keepAspect ? (f.h - nh) / 2 : 0;
      if (!h.includes('w') && !h.includes('e') && !keepAspect) nw = f.w;
      if (!h.includes('n') && !h.includes('s') && !keepAspect) nh = f.h;
    }
    const lc = { x: f.x + nl + nw / 2, y: f.y + nt + nh / 2 };
    const nc = rotatePoint(lc, c0, f.rotation);
    const nf = { x: nc.x - nw / 2, y: nc.y - nh / 2, w: nw, h: nh };
    const sx = nw / f.w;
    const sy = nh / f.h;
    const byId = new Map(d.base.map((x) => [x.id, x]));
    A.updateLive((el) => {
      const b0 = byId.get(el.id)!;
      if (single) {
        if (b0.type === 'text') {
          if (corner) {
            const k = sx;
            return { ...(b0 as TextElement), x: nf.x, y: nf.y, w: nw, fontSize: Math.max(1, b0.fontSize * k), letterSpacing: b0.letterSpacing * k, strokeWidth: b0.strokeWidth * k };
          }
          return { ...b0, x: nf.x, y: nf.y + (nh - b0.h) / 2, w: nw } as StudioElement;
        }
        return { ...b0, x: nf.x, y: nf.y, w: nw, h: nh } as StudioElement;
      }
      // Multi: scale relative to the frame
      const bc = center(b0);
      const ncx = nf.x + (bc.x - f.x) * sx;
      const ncy = nf.y + (bc.y - f.y) * sy;
      const k = Math.min(sx, sy);
      let w = b0.w * sx;
      let hh = b0.h * sy;
      if (b0.rotation % 180 !== 0) {
        w = b0.w * k;
        hh = b0.h * k;
      }
      if (b0.type === 'text') {
        const fk = keepAspect ? sx : 1;
        return { ...b0, x: ncx - w / 2, y: ncy - b0.h / 2, w, fontSize: b0.fontSize * fk, letterSpacing: b0.letterSpacing * fk, strokeWidth: b0.strokeWidth * fk };
      }
      return { ...b0, x: ncx - w / 2, y: ncy - hh / 2, w, h: b0.type === 'line' ? b0.h : hh } as StudioElement;
    }, d.base.map((x) => x.id));
    studio.set({ guides });
  };

  const doCropResize = (d: Extract<Drag, { kind: 'crop-resize' }>, p: Point) => {
    const b = d.base;
    const img = getImage(b.assetId);
    if (!img) return;
    const c0 = center(b);
    const local = rotatePoint(p, c0, -b.rotation);
    const start = rotatePoint(d.start, c0, -b.rotation);
    const kx = b.crop.w / b.w; // source px per design px
    const ky = b.crop.h / b.h;
    // Edges in source space (respecting flips)
    let left = b.crop.x;
    let right = b.crop.x + b.crop.w;
    let top = b.crop.y;
    let bottom = b.crop.y + b.crop.h;
    const dx = (local.x - start.x) * kx;
    const dy = (local.y - start.y) * ky;
    const h = d.handle;
    const minS = 8 * kx;
    const L = (v: number) => clamp(v, 0, right - minS);
    const R = (v: number) => clamp(v, left + minS, img.width);
    const Tp = (v: number) => clamp(v, 0, bottom - minS);
    const B = (v: number) => clamp(v, top + minS, img.height);
    if (h.includes('w')) b.flipX ? (right = R(right - dx)) : (left = L(left + dx));
    if (h.includes('e')) b.flipX ? (left = L(left - dx)) : (right = R(right + dx));
    if (h.includes('n')) b.flipY ? (bottom = B(bottom - dy)) : (top = Tp(top + dy));
    if (h.includes('s')) b.flipY ? (top = Tp(top - dy)) : (bottom = B(bottom + dy));
    const crop = { x: left, y: top, w: right - left, h: bottom - top };
    const nw = crop.w / kx;
    const nh = crop.h / ky;
    // Keep the opposite edge fixed in local space
    const dl = h.includes('w') ? b.w - nw : h.includes('e') ? 0 : (b.w - nw) / 2;
    const dt = h.includes('n') ? b.h - nh : h.includes('s') ? 0 : (b.h - nh) / 2;
    const lc = { x: b.x + dl + nw / 2, y: b.y + dt + nh / 2 };
    const nc = rotatePoint(lc, c0, b.rotation);
    A.updateLive((el) => ({ ...(el as ImageElement), crop, x: nc.x - nw / 2, y: nc.y - nh / 2, w: nw, h: nh }), [b.id]);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'pan') {
      setCursor(spaceDown.current ? 'grab' : 'default');
      return;
    }
    if (d.kind === 'marquee') {
      studio.set({ marquee: null });
      return;
    }
    if (d.kind === 'move' && !d.moved) {
      // Plain click on an already-selected group member selects just the group again
      return;
    }
    endGesture();
    setCursor('default');
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const p = toCanvas(e.clientX, e.clientY);
    const hit = hitElement(p);
    if (!hit || hit.locked) return;
    if (hit.type === 'text') A.startTextEdit(hit.id);
    else if (hit.type === 'image') {
      studio.set({ selection: [hit.id] });
      A.setCropMode(hit.id);
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const s = studio.get();
    const sp = screenOf(e.clientX, e.clientY);
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025));
      A.zoomAt(s.view.zoom * factor, sp.x, sp.y);
    } else A.panBy(-e.deltaX, -e.deltaY);
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  });

  // Space to pan
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isTyping(e.target)) {
        spaceDown.current = true;
        setCursor('grab');
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false;
        setCursor('default');
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ---- Drag & drop onto the canvas ----------------------------------------
  const onDragOver = (e: React.DragEvent) => {
    if ([...e.dataTransfer.types].some((t) => t === 'Files' || t === DND_TYPE)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    }
  };
  const onDrop = (e: React.DragEvent) => {
    const p = toCanvas(e.clientX, e.clientY);
    const payload = e.dataTransfer.getData(DND_TYPE);
    if (payload) {
      e.preventDefault();
      e.stopPropagation();
      dropPayload(JSON.parse(payload) as DndPayload, p);
      return;
    }
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      // Dropping onto an image while it's selected replaces it
      const hit = hitElement(p);
      if (hit?.type === 'image' && studio.get().selection.includes(hit.id) && files.length === 1) void A.replaceImage(hit.id, files[0]);
      else void A.addImageFiles(files, p);
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const p = toCanvas(e.clientX, e.clientY);
    const hit = hitElement(p);
    if (hit && !studio.get().selection.includes(hit.id)) A.select([hit.id]);
    if (!hit) A.clearSelection();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      ref={wrapRef}
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-window"
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-testid="studio-stage"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        aria-label="Design canvas"
        role="img"
      />
      <TextEditor />
      {menu && <ContextMenu state={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function intersects(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

// ---------------------------------------------------------------------------
// Drag & drop payloads from the side panels

export const DND_TYPE = 'application/x-cleanshot-studio';

export type DndPayload =
  | { kind: 'shape'; shape: ShapeKind }
  | { kind: 'line'; arrow: boolean }
  | { kind: 'icon'; icon: string }
  | { kind: 'text'; text: 'heading' | 'subheading' | 'body' }
  | { kind: 'asset'; id: string };

function dropPayload(p: DndPayload, at: Point) {
  const doc = studio.get().doc;
  if (!doc) return;
  let el: StudioElement | null = null;
  if (p.kind === 'shape') el = makeShape(doc, p.shape);
  if (p.kind === 'line') el = makeLine(doc, p.arrow);
  if (p.kind === 'icon') el = makeIcon(doc, p.icon);
  if (p.kind === 'text') el = makeText(doc, { kind: p.text });
  if (p.kind === 'asset') {
    const a = studio.get().assets.find((x) => x.id === p.id);
    if (a) {
      A.addAssetToCanvas(a);
      const added = selectedElements()[0];
      if (added) A.updateElements([added.id], (e) => ({ x: at.x - e.w / 2, y: at.y - e.h / 2 }), undefined);
    }
    return;
  }
  if (el) A.addElements([{ ...el, x: at.x - el.w / 2, y: at.y - el.h / 2 }]);
}

// ---------------------------------------------------------------------------
// In-place text editor

function TextEditor() {
  const { el, view } = useStudio((s) => ({ el: s.editingTextId ? (elementById(s.editingTextId, s) as TextElement | undefined) : undefined, view: s.view }), shallowEqual);
  const ref = useRef<HTMLTextAreaElement>(null);
  const editingId = el?.id;
  useEffect(() => {
    const t = ref.current;
    if (!t || !editingId) return;
    t.focus();
    t.select();
  }, [editingId]);
  if (!el || el.type !== 'text') return null;
  const z = view.zoom;
  const f = fontOf(el.fontFamily);
  return (
    <textarea
      ref={ref}
      value={el.text}
      spellCheck
      aria-label="Edit text"
      onChange={(e) => A.setEditingText(el.id, e.target.value)}
      onBlur={() => A.finishTextEdit()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          A.finishTextEdit();
        }
      }}
      className="absolute resize-none overflow-hidden border-0 bg-transparent p-0 outline-1 outline-offset-2 outline-accent outline-dashed"
      style={{
        left: view.x + el.x * z,
        top: view.y + el.y * z,
        width: el.w * z + 2,
        height: el.h * z + 2,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        transformOrigin: 'center',
        fontFamily: f.css,
        fontSize: el.fontSize * z,
        fontWeight: el.bold && f.bold ? 700 : 400,
        fontStyle: el.italic ? 'italic' : 'normal',
        letterSpacing: el.letterSpacing * z,
        lineHeight: el.lineHeight,
        color: el.color,
        opacity: el.opacity,
        textAlign: el.align,
        textTransform: el.uppercase ? 'uppercase' : 'none',
        textDecoration: el.underline ? 'underline' : 'none',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
        caretColor: el.color,
        WebkitTextStroke: el.strokeWidth ? `${el.strokeWidth * z * 2}px ${el.strokeColor}` : undefined,
        paintOrder: 'stroke fill',
        userSelect: 'text',
      }}
    />
  );
}

/** Snap `toLocal` exports for tests. */
export { toLocal };

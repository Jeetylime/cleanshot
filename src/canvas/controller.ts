import type { Annotation, AnnotationToolId, EditorDoc, Point, Rect } from '../types';
import { store, type EditorState } from '../store/store';
import { beginGesture, cancelGesture, endGesture, inGesture, updateLive } from '../store/history';
import { panBy, screenToImage, setView, setViewport, zoomAt } from '../store/view';
import * as actions from '../store/actions';
import { createAnnotation, isAnnotationTool } from '../store/factory';
import {
  HANDLE_CURSORS,
  getBounds,
  getHandles,
  hitTest,
  isDegenerate,
  moveAnnotation,
  resizeAnnotation,
  type HandleId,
} from '../engine/annotations';
import { computeLayout, drawAnnotations, drawImageShadow, drawScreenshot, isImageOpaque, type Layout } from '../engine/render';
import { paintFill } from '../engine/backgrounds';
import { createCanvas, ctx2d } from '../engine/images';
import { normalizeRect, rectFromPoints, rectsIntersect, simplifyPoints, snapAngle, unionRects } from '../lib/utils';
import { cropMove, cropResize, rectFromAnchor } from './crop';

const ACCENT = '#0a84ff';
const HANDLE_HIT = 9; // screen px
const HIT_TOL = 6; // screen px
const DRAG_THRESHOLD = 3; // screen px

type Gesture =
  | { kind: 'pan'; pointerId: number; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'create'; pointerId: number; id: string; tool: AnnotationToolId; origin: Point; straight: boolean }
  | {
      kind: 'move';
      pointerId: number;
      origin: Point;
      originScreen: Point;
      originals: Map<string, Annotation>;
      moved: boolean;
      clickedId: string;
      editOnClick: boolean;
      collapseOnClick: boolean;
    }
  | { kind: 'resize'; pointerId: number; id: string; handle: HandleId; original: Annotation }
  | { kind: 'marquee'; pointerId: number; origin: Point; current: Point; base: string[] }
  | { kind: 'crop'; pointerId: number; mode: 'move' | 'new' | HandleId; origin: Point; original: Rect }
  | { kind: 'pinch'; d0: number; mid0: Point; zoom0: number; world0: Point };

interface BackdropCache {
  key: string;
  canvas: HTMLCanvasElement;
}

function annotationAt(doc: EditorDoc, p: Point, tol: number): Annotation | null {
  for (let i = doc.annotations.length - 1; i >= 0; i--) {
    const a = doc.annotations[i];
    if (hitTest(a, p, tol, doc.unit)) return a;
  }
  return null;
}

export class CanvasController {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private frame: number | null = null;
  private gesture: Gesture | null = null;
  private pointers = new Map<number, Point>();
  private hoverId: string | null = null;
  private hoverHandle: HandleId | null = null;
  private spaceDown = false;
  private backdrop: BackdropCache | null = null;
  private checker: { key: string; pattern: CanvasPattern } | null = null;
  private lastPointer: Point | null = null;
  private disposers: (() => void)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private container: HTMLElement,
  ) {
    this.ctx = ctx2d(canvas);
    this.bind();
    this.resize();
    this.requestRender();
  }

  destroy() {
    this.disposers.forEach((d) => d());
    if (this.frame !== null) cancelAnimationFrame(this.frame);
  }

  // -------------------------------------------------------------------------
  // Setup

  private bind() {
    const c = this.canvas;
    const on = <K extends keyof HTMLElementEventMap>(
      el: HTMLElement | Window,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    on(c, 'pointerdown', (e) => this.onPointerDown(e));
    on(c, 'pointermove', (e) => this.onPointerMove(e));
    on(c, 'pointerup', (e) => this.onPointerUp(e, false));
    on(c, 'pointercancel', (e) => this.onPointerUp(e, true));
    on(c, 'pointerleave', () => {
      if (!this.gesture) this.setHover(null, null);
    });
    on(c, 'dblclick', (e) => this.onDoubleClick(e));
    on(c, 'wheel', (e) => this.onWheel(e), { passive: false });
    on(c, 'contextmenu', (e) => e.preventDefault());
    on(window, 'keydown', (e) => this.onKey(e, true));
    on(window, 'keyup', (e) => this.onKey(e, false));
    on(window, 'blur', () => {
      this.spaceDown = false;
      this.updateCursor();
    });

    // Safari trackpad pinch.
    let gestureZoom = 1;
    const gs = (e: Event) => {
      e.preventDefault();
      gestureZoom = store.get().view.zoom;
    };
    const gc = (e: Event) => {
      e.preventDefault();
      const ge = e as Event & { scale: number; clientX: number; clientY: number };
      const r = this.canvas.getBoundingClientRect();
      zoomAt(gestureZoom * ge.scale, ge.clientX - r.left, ge.clientY - r.top);
    };
    c.addEventListener('gesturestart', gs);
    c.addEventListener('gesturechange', gc);
    this.disposers.push(() => {
      c.removeEventListener('gesturestart', gs);
      c.removeEventListener('gesturechange', gc);
    });

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.container);
    this.disposers.push(() => ro.disconnect());

    const mq = () => this.resize();
    window.addEventListener('resize', mq);
    this.disposers.push(() => window.removeEventListener('resize', mq));

    let prev = store.get();
    const unsub = store.subscribe(() => {
      const s = store.get();
      if (
        s.doc !== prev.doc ||
        s.view !== prev.view ||
        s.selection !== prev.selection ||
        s.crop !== prev.crop ||
        s.editingTextId !== prev.editingTextId ||
        s.backdrop !== prev.backdrop ||
        s.theme !== prev.theme
      ) {
        this.requestRender();
      }
      if (s.tool !== prev.tool || s.crop !== prev.crop) this.updateCursor();
      prev = s;
    });
    this.disposers.push(unsub);
  }

  private resize() {
    const r = this.container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === this.width && h === this.height && dpr === this.dpr) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    setViewport(w, h);
    this.requestRender();
  }

  requestRender() {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.render();
    });
  }

  // -------------------------------------------------------------------------
  // Coordinates

  private screenPoint(e: { clientX: number; clientY: number }): Point {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private toImage(sp: Point): Point {
    return screenToImage(store.get().view, sp.x, sp.y);
  }

  private toScreen(p: Point): Point {
    const v = store.get().view;
    return { x: p.x * v.zoom + v.x, y: p.y * v.zoom + v.y };
  }

  private screenRect(r: Rect): Rect {
    const v = store.get().view;
    return { x: r.x * v.zoom + v.x, y: r.y * v.zoom + v.y, w: r.w * v.zoom, h: r.h * v.zoom };
  }

  // -------------------------------------------------------------------------
  // Hit testing

  private selectedSingle(s: EditorState): Annotation | null {
    if (s.selection.length !== 1 || !s.doc) return null;
    return s.doc.annotations.find((a) => a.id === s.selection[0]) ?? null;
  }

  private handleAt(s: EditorState, sp: Point): { a: Annotation; handle: HandleId } | null {
    const a = this.selectedSingle(s);
    if (!a || !s.doc || s.editingTextId) return null;
    for (const h of getHandles(a, s.doc.unit)) {
      const hp = this.toScreen(h);
      if (Math.abs(hp.x - sp.x) <= HANDLE_HIT && Math.abs(hp.y - sp.y) <= HANDLE_HIT) return { a, handle: h.id };
    }
    return null;
  }

  private cropHandleAt(rect: Rect, sp: Point): HandleId | null {
    const r = this.screenRect(rect);
    const pts: [HandleId, number, number][] = [
      ['nw', r.x, r.y],
      ['ne', r.x + r.w, r.y],
      ['se', r.x + r.w, r.y + r.h],
      ['sw', r.x, r.y + r.h],
    ];
    for (const [id, x, y] of pts) if (Math.abs(sp.x - x) <= 12 && Math.abs(sp.y - y) <= 12) return id;
    const t = 8;
    if (sp.x > r.x && sp.x < r.x + r.w) {
      if (Math.abs(sp.y - r.y) <= t) return 'n';
      if (Math.abs(sp.y - (r.y + r.h)) <= t) return 's';
    }
    if (sp.y > r.y && sp.y < r.y + r.h) {
      if (Math.abs(sp.x - r.x) <= t) return 'w';
      if (Math.abs(sp.x - (r.x + r.w)) <= t) return 'e';
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Pointer events

  private onPointerDown(e: PointerEvent) {
    const s = store.get();
    if (!s.doc) return;
    if (e.button === 2) return;
    // Keep focus management in our hands: blur any focused field (committing
    // it), and stop the browser from moving focus on mousedown so a freshly
    // created text field keeps focus.
    e.preventDefault();
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && !active.classList.contains('cs-text-editor')) {
      active.blur();
    }
    const sp = this.screenPoint(e);
    this.pointers.set(e.pointerId, sp);
    this.lastPointer = sp;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    // Two-finger touch: pinch/zoom.
    if (this.pointers.size === 2 && e.pointerType === 'touch') {
      this.abortGesture();
      const [a, b] = [...this.pointers.values()];
      const mid0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.gesture = {
        kind: 'pinch',
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mid0,
        zoom0: s.view.zoom,
        world0: this.toImage(mid0),
      };
      return;
    }
    if (this.gesture) return;

    if (e.button === 1 || this.spaceDown) {
      e.preventDefault();
      this.gesture = { kind: 'pan', pointerId: e.pointerId, sx: sp.x, sy: sp.y, vx: s.view.x, vy: s.view.y };
      this.updateCursor();
      return;
    }

    if (s.editingTextId) {
      // Clicking outside the text field commits the edit.
      actions.commitTextEdit();
      return;
    }

    const p = this.toImage(sp);
    const doc = s.doc;

    if (s.crop) {
      const handle = this.cropHandleAt(s.crop.rect, sp);
      const r = s.crop.rect;
      const inside = p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      this.gesture = {
        kind: 'crop',
        pointerId: e.pointerId,
        mode: handle ?? (inside ? 'move' : 'new'),
        origin: { x: Math.min(doc.width, Math.max(0, p.x)), y: Math.min(doc.height, Math.max(0, p.y)) },
        original: r,
      };
      return;
    }

    const tool = s.tool;
    const tol = HIT_TOL / s.view.zoom;

    // 1. Resize handles of the selected annotation.
    const h = this.handleAt(s, sp);
    if (h) {
      beginGesture();
      this.gesture = { kind: 'resize', pointerId: e.pointerId, id: h.a.id, handle: h.handle, original: h.a };
      return;
    }

    // 2. Existing annotations can be grabbed with any tool.
    const hit = annotationAt(doc, p, tol);
    if (hit) {
      // Canvas tools have their own panels; grabbing an object switches to Select.
      if (!isAnnotationTool(tool) && tool !== 'select') actions.setTool('select');
      let selection = store.get().selection;
      let collapseOnClick = false;
      if (e.shiftKey) {
        selection = selection.includes(hit.id) ? selection.filter((id) => id !== hit.id) : [...selection, hit.id];
      } else if (!selection.includes(hit.id)) {
        selection = [hit.id];
      } else if (selection.length > 1) {
        collapseOnClick = true;
      }
      store.set({ selection });
      if (!selection.includes(hit.id)) return;
      const originals = new Map<string, Annotation>();
      for (const a of doc.annotations) if (selection.includes(a.id)) originals.set(a.id, a);
      this.gesture = {
        kind: 'move',
        pointerId: e.pointerId,
        origin: p,
        originScreen: sp,
        originals,
        moved: false,
        clickedId: hit.id,
        editOnClick: hit.type === 'text' && tool === 'text',
        collapseOnClick,
      };
      return;
    }

    // 3. Empty canvas.
    if (isAnnotationTool(tool)) {
      const a = createAnnotation(tool, p, s.styles, doc.unit, doc.annotations);
      if (a.type === 'text') {
        actions.createTextAt(a);
        return;
      }
      if (a.type === 'step') {
        actions.addAnnotation(a);
        // Allow dragging the freshly placed marker into position.
        this.gesture = {
          kind: 'move',
          pointerId: e.pointerId,
          origin: p,
          originScreen: sp,
          originals: new Map([[a.id, a]]),
          moved: false,
          clickedId: a.id,
          editOnClick: false,
          collapseOnClick: false,
        };
        return;
      }
      beginGesture();
      updateLive((d) => ({ ...d, annotations: [...d.annotations, a] }));
      store.set({ selection: [] });
      this.gesture = { kind: 'create', pointerId: e.pointerId, id: a.id, tool, origin: p, straight: false };
      return;
    }

    // Select tool (and canvas tools): marquee selection.
    const base = e.shiftKey ? s.selection : [];
    if (!e.shiftKey) actions.clearSelection();
    this.gesture = { kind: 'marquee', pointerId: e.pointerId, origin: p, current: p, base };
  }

  private onPointerMove(e: PointerEvent) {
    const sp = this.screenPoint(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, sp);
    this.lastPointer = sp;
    const s = store.get();
    const g = this.gesture;
    if (!g) {
      this.updateHover(sp);
      return;
    }
    if (!s.doc) return;
    const doc = s.doc;

    if (g.kind === 'pinch') {
      if (this.pointers.size < 2) return;
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoom = Math.min(32, Math.max(0.02, g.zoom0 * (d / g.d0)));
      setView({ zoom, x: mid.x - g.world0.x * zoom, y: mid.y - g.world0.y * zoom, mode: 'manual' });
      return;
    }
    if ('pointerId' in g && g.pointerId !== e.pointerId) return;

    const p = this.toImage(sp);

    switch (g.kind) {
      case 'pan': {
        setView({ zoom: s.view.zoom, x: g.vx + (sp.x - g.sx), y: g.vy + (sp.y - g.sy), mode: 'manual' });
        return;
      }
      case 'create': {
        this.updateCreate(g, e, p);
        return;
      }
      case 'move': {
        if (!g.moved) {
          if (Math.hypot(sp.x - g.originScreen.x, sp.y - g.originScreen.y) < DRAG_THRESHOLD) return;
          g.moved = true;
          beginGesture();
        }
        let dx = p.x - g.origin.x;
        let dy = p.y - g.origin.y;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        updateLive((d) => ({
          ...d,
          annotations: d.annotations.map((a) => {
            const o = g.originals.get(a.id);
            return o ? moveAnnotation(o, dx, dy) : a;
          }),
        }));
        this.canvas.style.cursor = 'move';
        return;
      }
      case 'resize': {
        const next = resizeAnnotation(g.original, g.handle, p, { keepAspect: e.shiftKey, fromCenter: e.altKey }, doc.unit);
        updateLive((d) => ({ ...d, annotations: d.annotations.map((a) => (a.id === g.id ? next : a)) }));
        return;
      }
      case 'marquee': {
        g.current = p;
        const r = rectFromPoints(g.origin, p);
        const hits = doc.annotations.filter((a) => rectsIntersect(getBounds(a, doc.unit), r)).map((a) => a.id);
        const selection = [...new Set([...g.base, ...hits])];
        const cur = s.selection;
        if (selection.length !== cur.length || selection.some((id, i) => id !== cur[i])) store.set({ selection });
        this.requestRender();
        return;
      }
      case 'crop': {
        if (!s.crop) return;
        const W = doc.width;
        const H = doc.height;
        const aspect = s.crop.aspect ?? (e.shiftKey ? g.original.w / Math.max(1, g.original.h) : null);
        let rect: Rect;
        if (g.mode === 'move') rect = cropMove(g.original, p.x - g.origin.x, p.y - g.origin.y, W, H);
        else if (g.mode === 'new') rect = rectFromAnchor(g.origin, p, s.crop.aspect ?? (e.shiftKey ? 1 : null), W, H);
        else rect = cropResize(g.original, g.mode, p, aspect, W, H);
        actions.setCropRect(rect);
        return;
      }
    }
  }

  private updateCreate(g: Extract<Gesture, { kind: 'create' }>, e: PointerEvent, p: Point) {
    const o = g.origin;
    const wasStraight = g.straight;
    g.straight = e.shiftKey;
    updateLive((d) => ({
      ...d,
      annotations: d.annotations.map((a) => {
        if (a.id !== g.id) return a;
        switch (a.type) {
          case 'arrow':
            return { ...a, end: e.shiftKey ? snapAngle(o, p) : p };
          case 'pen':
          case 'marker': {
            if (e.shiftKey) return { ...a, points: [o, snapAngle(o, p)] };
            const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
            const pts = events.length ? events.map((ce) => this.toImage(this.screenPoint(ce))) : [p];
            const minDist = 1.2 / store.get().view.zoom;
            const out = wasStraight ? [o] : a.points.slice();
            for (const q of pts) {
              const last = out[out.length - 1];
              if (Math.hypot(q.x - last.x, q.y - last.y) >= minDist) out.push(q);
            }
            return { ...a, points: out };
          }
          default: {
            if (!('w' in a)) return a;
            let dx = p.x - o.x;
            let dy = p.y - o.y;
            if (e.shiftKey) {
              const m = Math.max(Math.abs(dx), Math.abs(dy));
              dx = Math.sign(dx || 1) * m;
              dy = Math.sign(dy || 1) * m;
            }
            const r = e.altKey
              ? { x: o.x - dx, y: o.y - dy, w: dx * 2, h: dy * 2 }
              : { x: o.x, y: o.y, w: dx, h: dy };
            return { ...a, ...normalizeRect(r) };
          }
        }
      }),
    }));
  }

  private onPointerUp(e: PointerEvent, cancelled: boolean) {
    this.pointers.delete(e.pointerId);
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const g = this.gesture;
    if (!g) return;
    if (g.kind === 'pinch') {
      if (this.pointers.size < 2) this.gesture = null;
      return;
    }
    if (g.pointerId !== e.pointerId) return;
    this.gesture = null;
    const s = store.get();
    const doc = s.doc;

    switch (g.kind) {
      case 'create': {
        const a = doc?.annotations.find((x) => x.id === g.id);
        if (cancelled || !a || !doc || isDegenerate(a, doc.unit)) {
          cancelGesture();
        } else {
          if (a.type === 'pen' || a.type === 'marker') {
            const pts = simplifyPoints(a.points, 0.6 / s.view.zoom);
            updateLive((d) => ({
              ...d,
              annotations: d.annotations.map((x) => (x.id === a.id ? { ...a, points: pts } : x)),
            }));
          }
          endGesture();
          store.set({ selection: [a.id] });
        }
        break;
      }
      case 'move': {
        if (g.moved) endGesture();
        else if (g.editOnClick) actions.startTextEdit(g.clickedId, false);
        else if (g.collapseOnClick && !e.shiftKey) store.set({ selection: [g.clickedId] });
        break;
      }
      case 'resize':
        endGesture();
        break;
      case 'marquee':
        this.requestRender();
        break;
      default:
        break;
    }
    this.updateHover(this.screenPoint(e));
  }

  private abortGesture() {
    const g = this.gesture;
    this.gesture = null;
    if (!g) return;
    if (g.kind === 'create') cancelGesture();
    else if (inGesture()) endGesture();
  }

  private onDoubleClick(e: MouseEvent) {
    const s = store.get();
    if (!s.doc || s.crop) return;
    const p = this.toImage(this.screenPoint(e));
    const hit = annotationAt(s.doc, p, HIT_TOL / s.view.zoom);
    if (hit?.type === 'text') {
      actions.startTextEdit(hit.id, false);
    } else if (!hit && s.tool === 'select') {
      // Double-click empty space while selecting: quick text.
      const a = createAnnotation('text', p, s.styles, s.doc.unit, s.doc.annotations);
      actions.createTextAt(a);
    }
  }

  private onWheel(e: WheelEvent) {
    const s = store.get();
    if (!s.doc) return;
    e.preventDefault();
    const sp = this.screenPoint(e);
    let dx = e.deltaX;
    let dy = e.deltaY;
    if (e.deltaMode === 1) {
      dx *= 16;
      dy *= 16;
    }
    if (e.ctrlKey || e.metaKey) {
      const k = Math.abs(dy) < 50 ? 0.012 : 0.0022;
      zoomAt(s.view.zoom * Math.exp(-dy * k), sp.x, sp.y);
    } else {
      if (e.shiftKey && dx === 0) {
        dx = dy;
        dy = 0;
      }
      panBy(-dx, -dy);
    }
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    if (down && e.key === 'Escape' && this.gesture && this.gesture.kind !== 'pan') {
      // Abort the current drag: drawings are discarded, edits are reverted.
      const g = this.gesture;
      this.gesture = null;
      if (g.kind === 'create' || g.kind === 'move' || g.kind === 'resize') cancelGesture();
      e.stopImmediatePropagation();
      e.preventDefault();
      this.requestRender();
      return;
    }
    if (e.code !== 'Space') return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (!store.get().doc) return;
    if (down) e.preventDefault();
    if (this.spaceDown === down) return;
    this.spaceDown = down;
    this.updateCursor();
  }

  // -------------------------------------------------------------------------
  // Hover & cursor

  private setHover(id: string | null, handle: HandleId | null) {
    if (id === this.hoverId && handle === this.hoverHandle) return;
    this.hoverId = id;
    this.hoverHandle = handle;
    this.requestRender();
  }

  private updateHover(sp: Point) {
    const s = store.get();
    if (!s.doc || s.crop) {
      this.setHover(null, null);
      this.updateCursor(sp);
      return;
    }
    const h = this.handleAt(s, sp);
    if (h) {
      this.setHover(null, h.handle);
    } else {
      const hit = annotationAt(s.doc, this.toImage(sp), HIT_TOL / s.view.zoom);
      this.setHover(hit?.id ?? null, null);
    }
    this.updateCursor(sp);
  }

  private updateCursor(sp: Point | null = this.lastPointer) {
    const s = store.get();
    const c = this.canvas.style;
    if (!s.doc) {
      c.cursor = 'default';
      return;
    }
    if (this.gesture?.kind === 'pan') {
      c.cursor = 'grabbing';
      return;
    }
    if (this.spaceDown) {
      c.cursor = 'grab';
      return;
    }
    if (s.crop) {
      if (!sp) {
        c.cursor = 'crosshair';
        return;
      }
      const h = this.cropHandleAt(s.crop.rect, sp);
      if (h) c.cursor = HANDLE_CURSORS[h];
      else {
        const p = this.toImage(sp);
        const r = s.crop.rect;
        c.cursor = p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h ? 'move' : 'crosshair';
      }
      return;
    }
    if (this.hoverHandle) {
      c.cursor = HANDLE_CURSORS[this.hoverHandle];
      return;
    }
    if (this.hoverId) {
      const a = s.doc.annotations.find((x) => x.id === this.hoverId);
      c.cursor = a?.type === 'text' && s.tool === 'text' ? 'text' : 'move';
      return;
    }
    if (s.tool === 'text') c.cursor = 'text';
    else if (isAnnotationTool(s.tool)) c.cursor = 'crosshair';
    else c.cursor = 'default';
  }

  // -------------------------------------------------------------------------
  // Rendering

  private getBackdrop(doc: EditorDoc, L: Layout): BackdropCache {
    const bg = doc.background;
    const key = `${JSON.stringify(bg)}|${doc.imageId}|${doc.unit}|${L.outW}x${L.outH}`;
    if (this.backdrop?.key === key) return this.backdrop;
    // Gradients and shadows are smooth, so a reduced-resolution cache is
    // visually lossless and keeps slider scrubbing fast on huge images.
    const k = Math.min(1, 1800 / Math.max(L.outW, L.outH));
    const canvas = this.backdrop?.canvas ?? createCanvas(1, 1);
    canvas.width = Math.max(1, Math.round(L.outW * k));
    canvas.height = Math.max(1, Math.round(L.outH * k));
    const ctx = ctx2d(canvas);
    const sx = canvas.width / L.outW;
    const sy = canvas.height / L.outH;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.clearRect(0, 0, L.outW, L.outH);
    paintFill(ctx, bg.fill, L.outW, L.outH);
    ctx.translate(L.imgX, L.imgY);
    drawImageShadow(ctx, doc, sx, sy);
    this.backdrop = { key, canvas };
    return this.backdrop;
  }

  private checkerPattern(): CanvasPattern {
    const light = document.documentElement.dataset.theme === 'light';
    const key = `${light}|${this.dpr}`;
    if (this.checker?.key === key) return this.checker.pattern;
    const size = Math.round(8 * this.dpr);
    const c = createCanvas(size * 2, size * 2);
    const ctx = ctx2d(c);
    ctx.fillStyle = light ? '#ffffff' : '#2a2a2e';
    ctx.fillRect(0, 0, size * 2, size * 2);
    ctx.fillStyle = light ? '#e6e6ea' : '#202023';
    ctx.fillRect(0, 0, size, size);
    ctx.fillRect(size, size, size, size);
    const pattern = this.ctx.createPattern(c, 'repeat')!;
    this.checker = { key, pattern };
    return pattern;
  }

  private workspaceColor(s: EditorState): string | CanvasPattern {
    const light = document.documentElement.dataset.theme === 'light';
    if (s.backdrop === 'checker') return this.checkerPattern();
    if (s.backdrop === 'light' || (s.backdrop === 'auto' && light)) return light ? '#e3e3e7' : '#d9d9de';
    return light ? '#2b2b2f' : '#111113';
  }

  private render() {
    const s = store.get();
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = this.workspaceColor(s);
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const doc = s.doc;
    if (!doc) return;

    const v = s.view;
    const z = v.zoom * dpr;
    const L = computeLayout(doc);
    const cropping = !!s.crop;
    const bgOn = doc.background.enabled && !cropping;
    const outRect = cropping ? { x: 0, y: 0, w: doc.width, h: doc.height } : { x: -L.imgX, y: -L.imgY, w: L.outW, h: L.outH };

    // Frame / backdrop
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const so = this.screenRect(outRect);
    const opaque = isImageOpaque(doc.imageId);
    const transparentBg = bgOn ? doc.background.fill.kind === 'transparent' : !opaque;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 24 * dpr;
    ctx.shadowOffsetY = 6 * dpr;
    if (!bgOn && opaque) {
      ctx.fillStyle = '#000';
      ctx.fillRect(so.x, so.y, so.w, so.h);
    }
    ctx.restore();
    if (transparentBg) {
      ctx.save();
      ctx.fillStyle = this.checkerPattern();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillRect(so.x * dpr, so.y * dpr, so.w * dpr, so.h * dpr);
      ctx.restore();
    }

    ctx.setTransform(z, 0, 0, z, v.x * dpr, v.y * dpr);
    ctx.imageSmoothingEnabled = z < 2;
    ctx.imageSmoothingQuality = 'high';
    if (bgOn) {
      const cache = this.getBackdrop(doc, L);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(cache.canvas, -L.imgX, -L.imgY, L.outW, L.outH);
      ctx.imageSmoothingEnabled = z < 2;
    }
    drawScreenshot(ctx, doc, bgOn, 'screen', z);

    ctx.save();
    ctx.beginPath();
    ctx.rect(outRect.x, outRect.y, outRect.w, outRect.h);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    drawAnnotations(ctx, doc, z);
    ctx.restore();

    // Screen-space overlays
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (s.crop) this.drawCropOverlay(s);
    else this.drawSelection(s, doc);
  }

  private drawFrame(r: Rect, alpha = 1, dashed = false) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    if (dashed) ctx.setLineDash([4, 3]);
    ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h));
    ctx.restore();
  }

  private drawHandle(p: Point, round: boolean, active: boolean) {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 3 * this.dpr;
    ctx.shadowOffsetY = 0.5 * this.dpr;
    ctx.fillStyle = active ? ACCENT : '#ffffff';
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    if (round) ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    else ctx.roundRect(Math.round(p.x) - 4 + 0.5, Math.round(p.y) - 4 + 0.5, 8, 8, 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.stroke();
    ctx.restore();
  }

  private pad(r: Rect, n: number): Rect {
    return { x: r.x - n, y: r.y - n, w: r.w + n * 2, h: r.h + n * 2 };
  }

  private drawSelection(s: EditorState, doc: EditorDoc) {
    const ctx = this.ctx;
    const unit = doc.unit;
    const selected = doc.annotations.filter((a) => s.selection.includes(a.id));

    // Hover outline
    if (this.hoverId && !s.selection.includes(this.hoverId) && !this.gesture) {
      const a = doc.annotations.find((x) => x.id === this.hoverId);
      if (a) {
        if (a.type === 'arrow') {
          const p1 = this.toScreen(a.start);
          const p2 = this.toScreen(a.end);
          ctx.save();
          ctx.strokeStyle = ACCENT;
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
          ctx.restore();
        } else {
          this.drawFrame(this.pad(this.screenRect(getBounds(a, unit)), 2), 0.6);
        }
      }
    }

    const moving = this.gesture?.kind === 'move' && this.gesture.moved;

    for (const a of selected) {
      if (a.type === 'arrow') {
        if (selected.length > 1 || moving) {
          const p1 = this.toScreen(a.start);
          const p2 = this.toScreen(a.end);
          ctx.save();
          ctx.strokeStyle = ACCENT;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
          ctx.restore();
        }
        continue;
      }
      const editing = s.editingTextId === a.id;
      this.drawFrame(this.pad(this.screenRect(getBounds(a, unit)), a.type === 'step' ? 3 : 1), editing ? 0.9 : 1, editing);
    }

    if (selected.length > 1) {
      const u = unionRects(selected.map((a) => getBounds(a, unit)));
      if (u) this.drawFrame(this.pad(this.screenRect(u), 6), 0.45, true);
    }

    if (selected.length === 1 && !moving && !s.editingTextId) {
      const a = selected[0];
      for (const h of getHandles(a, unit)) {
        this.drawHandle(this.toScreen(h), a.type === 'arrow', this.hoverHandle === h.id);
      }
    }

    // Marquee
    const g = this.gesture;
    if (g?.kind === 'marquee') {
      const r = this.screenRect(rectFromPoints(g.origin, g.current));
      if (r.w > 1 || r.h > 1) {
        ctx.save();
        ctx.fillStyle = 'rgba(10, 132, 255, 0.08)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.restore();
        this.drawFrame(r, 0.9);
      }
    }
  }

  private drawCropOverlay(s: EditorState) {
    const ctx = this.ctx;
    const crop = s.crop!;
    const r = this.screenRect(crop.rect);
    const w = this.width;
    const h = this.height;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.fill('evenodd');

    // Rule of thirds
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      const x = Math.round(r.x + (r.w * i) / 3) + 0.5;
      const y = Math.round(r.y + (r.h * i) / 3) + 0.5;
      ctx.moveTo(x, r.y);
      ctx.lineTo(x, r.y + r.h);
      ctx.moveTo(r.x, y);
      ctx.lineTo(r.x + r.w, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h));

    // Corner brackets
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 4 * this.dpr;
    const L = Math.min(18, r.w / 3, r.h / 3);
    const corners: [number, number, number, number][] = [
      [r.x, r.y, 1, 1],
      [r.x + r.w, r.y, -1, 1],
      [r.x + r.w, r.y + r.h, -1, -1],
      [r.x, r.y + r.h, 1, -1],
    ];
    ctx.beginPath();
    for (const [x, y, dx, dy] of corners) {
      ctx.moveTo(x + dx * L, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * L);
    }
    // Edge grips
    const g = Math.min(14, r.w / 6, r.h / 6);
    ctx.moveTo(r.x + r.w / 2 - g, r.y);
    ctx.lineTo(r.x + r.w / 2 + g, r.y);
    ctx.moveTo(r.x + r.w / 2 - g, r.y + r.h);
    ctx.lineTo(r.x + r.w / 2 + g, r.y + r.h);
    ctx.moveTo(r.x, r.y + r.h / 2 - g);
    ctx.lineTo(r.x, r.y + r.h / 2 + g);
    ctx.moveTo(r.x + r.w, r.y + r.h / 2 - g);
    ctx.lineTo(r.x + r.w, r.y + r.h / 2 + g);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();

    // Dimensions label
    const label = `${Math.round(crop.rect.w)} × ${Math.round(crop.rect.h)}`;
    ctx.save();
    ctx.font = '500 11px -apple-system, BlinkMacSystemFont, Inter, "Segoe UI", sans-serif';
    const tw = ctx.measureText(label).width;
    const bw = tw + 16;
    const bh = 22;
    let lx = r.x + r.w / 2 - bw / 2;
    let ly = r.y + r.h + 10;
    if (ly + bh > h - 6) ly = r.y + r.h - bh - 10;
    lx = Math.max(6, Math.min(w - bw - 6, lx));
    ctx.fillStyle = 'rgba(20, 20, 22, 0.88)';
    ctx.beginPath();
    ctx.roundRect(lx, ly, bw, bh, 6);
    ctx.fill();
    ctx.fillStyle = '#f2f2f4';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(label, lx + bw / 2, ly + bh / 2 + 0.5);
    ctx.restore();
  }
}

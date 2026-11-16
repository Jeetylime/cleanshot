import { uid, clamp } from '../lib/utils';
import { canvasToBlob, constrainSource, decodeImage, getImage, registerImage, resample } from '../engine/images';
import { showToast } from '../store/actions';
import { aabb, center, rotatePoint, unionBounds } from './geometry';
import { cloneElements, coverCrop, fitText, makeIcon, makeImage, makeLine, makeShape, makeText, newDoc, normalize, type TextKind } from './factory';
import { ensureFonts } from './fonts';
import { renderToCanvas } from './render';
import * as db from './persistence';
import { beginGesture, commit, elementById, endGesture, replaceLive, resetHistory, selectedElements, studio, type LeftPanel } from './store';
import { MAX_CANVAS_SIDE, TEMPLATES } from './templates';
import type { Asset, ImageElement, ShapeKind, StudioDoc, StudioElement, StudioFill, TextElement } from './types';

// ---------------------------------------------------------------------------
// Element updates

type Patch<T extends StudioElement = StudioElement> = Partial<T> | ((e: T) => Partial<T>);

/** Update elements by id as one undoable step (merged with others of the same `key`). */
export function updateElements<T extends StudioElement = StudioElement>(ids: string[], patch: Patch<T>, key?: string) {
  const set = new Set(ids);
  commit((doc) => ({
    ...doc,
    elements: doc.elements.map((e) => {
      if (!set.has(e.id)) return e;
      const p = typeof patch === 'function' ? patch(e as T) : patch;
      return normalize({ ...e, ...p } as StudioElement);
    }),
  }), key);
}

export function updateSelection<T extends StudioElement = StudioElement>(patch: Patch<T>, key?: string) {
  updateElements<T>(studio.get().selection, patch, key);
}

/** Live (non-history) update used during drags. */
export function updateLive(fn: (e: StudioElement) => StudioElement, ids: string[]) {
  const set = new Set(ids);
  replaceLive((doc) => ({ ...doc, elements: doc.elements.map((e) => (set.has(e.id) ? normalize(fn(e)) : e)) }));
}

function docOrNull(): StudioDoc | null {
  return studio.get().doc;
}

// ---------------------------------------------------------------------------
// Selection

/** Expand ids to whole groups. */
export function withGroups(ids: string[], doc = docOrNull()): string[] {
  if (!doc) return ids;
  const groups = new Set(doc.elements.filter((e) => ids.includes(e.id) && e.groupId).map((e) => e.groupId));
  if (!groups.size) return ids;
  const out = new Set(ids);
  for (const e of doc.elements) if (e.groupId && groups.has(e.groupId)) out.add(e.id);
  return doc.elements.filter((e) => out.has(e.id)).map((e) => e.id);
}

export function select(ids: string[], additive = false) {
  if (studio.get().editingTextId) finishTextEdit();
  const s = studio.get();
  const expanded = withGroups(ids);
  let next: string[];
  if (additive) {
    const cur = new Set(s.selection);
    const allIn = expanded.every((id) => cur.has(id));
    if (allIn) expanded.forEach((id) => cur.delete(id));
    else expanded.forEach((id) => cur.add(id));
    next = (s.doc?.elements ?? []).filter((e) => cur.has(e.id)).map((e) => e.id);
  } else next = expanded;
  studio.set({ selection: next, cropId: s.cropId && next.includes(s.cropId) ? s.cropId : null, editingTextId: null });
  // On phones the drawer and the properties sheet compete for the same space.
  if (next.length && window.innerWidth < 768) studio.set({ panel: null });
}

export function selectAll() {
  if (studio.get().editingTextId) finishTextEdit();
  const d = docOrNull();
  if (d) studio.set({ selection: d.elements.filter((e) => !e.hidden && !e.locked).map((e) => e.id), editingTextId: null, cropId: null });
}

export function clearSelection() {
  if (studio.get().editingTextId) finishTextEdit();
  studio.set({ selection: [], editingTextId: null, cropId: null });
}

// ---------------------------------------------------------------------------
// Adding elements

export function addElements(els: StudioElement[], opts: { select?: boolean } = {}) {
  if (!els.length) return;
  commit((doc) => ({ ...doc, elements: [...doc.elements, ...els.map(normalize)] }));
  if (opts.select !== false) studio.set({ selection: els.map((e) => e.id), editingTextId: null, cropId: null });
  if (window.innerWidth < 900) studio.set({ panel: null });
}

/** Place a new element at the viewport center if the canvas is zoomed in, else canvas center. */
function placeAtViewCenter<T extends StudioElement>(e: T): T {
  const s = studio.get();
  if (!s.doc) return e;
  const cx = (s.viewport.w / 2 - s.view.x) / s.view.zoom;
  const cy = (s.viewport.h / 2 - s.view.y) / s.view.zoom;
  const inside = cx > 0 && cy > 0 && cx < s.doc.width && cy < s.doc.height;
  const px = inside ? cx : s.doc.width / 2;
  const py = inside ? cy : s.doc.height / 2;
  // Cascade so repeated adds don't stack exactly.
  const n = s.doc.elements.filter((o) => Math.abs(o.x + o.w / 2 - px) < 2 && Math.abs(o.y + o.h / 2 - py) < 2 && o.type === e.type).length;
  const off = n * Math.round(Math.min(s.doc.width, s.doc.height) * 0.03);
  return { ...e, x: px - e.w / 2 + off, y: py - e.h / 2 + off };
}

export function addText(kind: TextKind, over: Partial<TextElement> = {}) {
  const d = docOrNull();
  if (!d) return;
  const e = placeAtViewCenter(makeText(d, { kind, ...over }));
  addElements([e]);
  ensureFonts([e], refreshFonts);
}

export function addShape(shape: ShapeKind) {
  const d = docOrNull();
  if (d) addElements([placeAtViewCenter(makeShape(d, shape))]);
}

export function addLine(arrow: boolean) {
  const d = docOrNull();
  if (d) addElements([placeAtViewCenter(makeLine(d, arrow))]);
}

export function addIcon(icon: string) {
  const d = docOrNull();
  if (d) addElements([placeAtViewCenter(makeIcon(d, icon))]);
}

// ---------------------------------------------------------------------------
// Images & assets

const STUDIO_MAX_SIDE = 4096;
const WARN_FILE_BYTES = 40 * 1024 * 1024;

/** Decode, downscale and store an image file. Returns the asset. */
export async function importAsset(blob: Blob, name = 'Image'): Promise<Asset> {
  if (!blob.type.startsWith('image/') && blob.type) throw new Error(`${name} isn’t an image.`);
  if (blob.size > WARN_FILE_BYTES) showToast(`${name} is large (${Math.round(blob.size / 1048576)} MB) and may slow the editor.`, 'info');
  let src = await decodeImage(blob);
  let stored = blob;
  [src] = constrainSource(src);
  if (Math.max(src.width, src.height) > STUDIO_MAX_SIDE) {
    const k = STUDIO_MAX_SIDE / Math.max(src.width, src.height);
    const c = resample(src, Math.round(src.width * k), Math.round(src.height * k));
    src = c;
    stored = await canvasToBlob(c, blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.92);
  }
  const id = uid('asset');
  registerImage(src, { id, blob: stored });
  const asset: Asset = { id, width: src.width, height: src.height, name };
  try {
    await db.putAsset({ id, blob: stored, width: asset.width, height: asset.height, name });
  } catch (err) {
    reportStorageError(err);
  }
  studio.set((s) => ({ assets: [asset, ...s.assets.filter((a) => a.id !== id)].slice(0, 40) }));
  return asset;
}

/** Make sure an asset's pixels are in memory (after reopening a project). */
export async function loadAsset(id: string): Promise<boolean> {
  if (getImage(id)) return true;
  try {
    const rec = await db.getAsset(id);
    if (!rec) return false;
    const src = await decodeImage(rec.blob);
    registerImage(src, { id, blob: rec.blob });
    return true;
  } catch {
    return false;
  }
}

export async function addImageFiles(files: Blob[], at?: { x: number; y: number }) {
  const d = docOrNull();
  if (!d) return;
  const added: StudioElement[] = [];
  for (const f of files) {
    try {
      const asset = await importAsset(f, (f as File).name || 'Image');
      const doc = docOrNull();
      if (!doc) return;
      let el = makeImage(doc, asset);
      if (at) el = { ...el, x: at.x - el.w / 2 + added.length * 24, y: at.y - el.h / 2 + added.length * 24 };
      else el = placeAtViewCenter(el);
      added.push(el);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Couldn’t open that image.', 'error');
    }
  }
  if (added.length) addElements(added);
}

export function addAssetToCanvas(asset: Asset) {
  const d = docOrNull();
  if (d && getImage(asset.id)) addElements([placeAtViewCenter(makeImage(d, asset))]);
}

export async function replaceImage(id: string, file: Blob) {
  const el = elementById(id);
  if (!el || el.type !== 'image') return;
  try {
    const asset = await importAsset(file, (file as File).name || 'Image');
    updateElements<ImageElement>([id], (e) => ({ assetId: asset.id, crop: coverCrop(asset, e.w, e.h) }));
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Couldn’t open that image.', 'error');
  }
}

/** Fill the frame (crop to cover), fit the frame to the whole image, or cover the canvas. */
export function imageFit(id: string, mode: 'fill' | 'fit' | 'canvas') {
  const el = elementById(id);
  const doc = docOrNull();
  const img = el?.type === 'image' ? getImage(el.assetId) : null;
  if (!el || el.type !== 'image' || !img || !doc) return;
  if (mode === 'fill') updateElements<ImageElement>([id], (e) => ({ crop: coverCrop(img, e.w, e.h) }));
  else if (mode === 'fit') {
    updateElements<ImageElement>([id], (e) => {
      const h = (e.w * img.height) / img.width;
      return { crop: { x: 0, y: 0, w: img.width, h: img.height }, h, y: e.y + (e.h - h) / 2 };
    });
  } else updateElements<ImageElement>([id], () => ({ x: 0, y: 0, w: doc.width, h: doc.height, rotation: 0, crop: coverCrop(img, doc.width, doc.height) }));
}

export function setCropMode(id: string | null) {
  studio.set({ cropId: id, editingTextId: null });
}

// ---------------------------------------------------------------------------
// Editing commands

export function deleteSelection() {
  const s = studio.get();
  const ids = new Set(selectedElements(s).filter((e) => !e.locked).map((e) => e.id));
  if (!ids.size) {
    if (s.selection.length) showToast('Unlock the element to delete it.', 'info');
    return;
  }
  commit((doc) => ({ ...doc, elements: doc.elements.filter((e) => !ids.has(e.id)) }));
  studio.set({ selection: [], cropId: null, editingTextId: null });
}

export function deleteElement(id: string) {
  commit((doc) => ({ ...doc, elements: doc.elements.filter((e) => e.id !== id) }));
}

export function duplicateSelection() {
  const sel = selectedElements();
  if (!sel.length) return;
  const d = docOrNull()!;
  const off = Math.round(Math.min(d.width, d.height) * 0.025);
  const copies = cloneElements(sel, off, off);
  commit((doc) => ({ ...doc, elements: [...doc.elements, ...copies] }));
  studio.set({ selection: copies.map((c) => c.id) });
}

let clipboard: StudioElement[] = [];
let pasteCount = 0;

export function copySelection(): boolean {
  const sel = selectedElements();
  if (!sel.length) return false;
  clipboard = structuredClone(sel);
  pasteCount = 0;
  return true;
}

export function cutSelection() {
  if (copySelection()) deleteSelection();
}

export function hasClipboard() {
  return clipboard.length > 0;
}

export function pasteClipboard() {
  if (!clipboard.length || !docOrNull()) return false;
  pasteCount++;
  const d = docOrNull()!;
  const off = Math.round(Math.min(d.width, d.height) * 0.025) * pasteCount;
  const copies = cloneElements(clipboard, off, off);
  commit((doc) => ({ ...doc, elements: [...doc.elements, ...copies] }));
  studio.set({ selection: copies.map((c) => c.id) });
  return true;
}

export function nudge(dx: number, dy: number) {
  const ids = selectedElements().filter((e) => !e.locked).map((e) => e.id);
  if (ids.length) updateElements(ids, (e) => ({ x: e.x + dx, y: e.y + dy }), 'nudge');
}

export type Order = 'front' | 'forward' | 'backward' | 'back';

export function reorder(order: Order) {
  const s = studio.get();
  if (!s.doc || !s.selection.length) return;
  const sel = new Set(s.selection);
  commit((doc) => {
    const els = [...doc.elements];
    const picked = els.filter((e) => sel.has(e.id));
    const rest = els.filter((e) => !sel.has(e.id));
    if (order === 'front') return { ...doc, elements: [...rest, ...picked] };
    if (order === 'back') return { ...doc, elements: [...picked, ...rest] };
    if (order === 'forward') {
      for (let i = els.length - 2; i >= 0; i--) {
        if (sel.has(els[i].id) && !sel.has(els[i + 1].id)) [els[i], els[i + 1]] = [els[i + 1], els[i]];
      }
    } else {
      for (let i = 1; i < els.length; i++) {
        if (sel.has(els[i].id) && !sel.has(els[i - 1].id)) [els[i], els[i - 1]] = [els[i - 1], els[i]];
      }
    }
    return { ...doc, elements: els };
  });
}

/** Move an element to an index in z-order (0 = bottom). Used by the layer list. */
export function moveLayer(id: string, toIndex: number) {
  commit((doc) => {
    const els = doc.elements.filter((e) => e.id !== id);
    const el = doc.elements.find((e) => e.id === id);
    if (!el) return doc;
    els.splice(clamp(toIndex, 0, els.length), 0, el);
    return { ...doc, elements: els };
  });
}

export function toggleLock(ids = studio.get().selection) {
  const els = (docOrNull()?.elements ?? []).filter((e) => ids.includes(e.id));
  const lock = !els.every((e) => e.locked);
  updateElements(ids, { locked: lock });
}

export function toggleHidden(id: string) {
  updateElements([id], (e) => ({ hidden: !e.hidden }));
}

export function renameElement(id: string, name: string) {
  updateElements([id], { name: name.trim() || 'Layer' });
}

export function groupSelection() {
  const s = studio.get();
  if (s.selection.length < 2) return;
  const gid = uid('grp');
  updateElements(s.selection, { groupId: gid });
}

export function ungroupSelection() {
  updateElements(studio.get().selection, { groupId: null });
}

export function canGroup(s = studio.get()) {
  const sel = selectedElements(s);
  if (sel.length < 2) return false;
  const g = sel[0].groupId;
  return !g || sel.some((e) => e.groupId !== g);
}

export function canUngroup(s = studio.get()) {
  return selectedElements(s).some((e) => e.groupId);
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/** Align to the canvas (one element or one group) or to the selection bounds. */
export function align(mode: AlignMode) {
  const s = studio.get();
  const sel = selectedElements(s).filter((e) => !e.locked);
  if (!s.doc || !sel.length) return;
  const single = sel.length === 1 || sel.every((e) => e.groupId && e.groupId === sel[0].groupId);
  const ref = single ? { x: 0, y: 0, w: s.doc.width, h: s.doc.height } : unionBounds(sel)!;
  const groupBox = single ? unionBounds(sel)! : null;
  updateElements(
    sel.map((e) => e.id),
    (e) => {
      const b = groupBox ?? aabb(e);
      let dx = 0;
      let dy = 0;
      if (mode === 'left') dx = ref.x - b.x;
      if (mode === 'hcenter') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
      if (mode === 'right') dx = ref.x + ref.w - (b.x + b.w);
      if (mode === 'top') dy = ref.y - b.y;
      if (mode === 'vcenter') dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
      if (mode === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
      return { x: e.x + dx, y: e.y + dy };
    },
  );
}

export function distribute(axis: 'x' | 'y') {
  const sel = selectedElements().filter((e) => !e.locked);
  if (sel.length < 3) return;
  const boxes = sel.map((e) => ({ e, b: aabb(e) })).sort((a, b) => (axis === 'x' ? a.b.x - b.b.x : a.b.y - b.b.y));
  const first = boxes[0].b;
  const last = boxes[boxes.length - 1].b;
  const total = boxes.reduce((n, x) => n + (axis === 'x' ? x.b.w : x.b.h), 0);
  const span = axis === 'x' ? last.x + last.w - first.x : last.y + last.h - first.y;
  const gap = (span - total) / (boxes.length - 1);
  let cursor = axis === 'x' ? first.x : first.y;
  const moves = new Map<string, number>();
  for (const { e, b } of boxes) {
    moves.set(e.id, cursor - (axis === 'x' ? b.x : b.y));
    cursor += (axis === 'x' ? b.w : b.h) + gap;
  }
  updateElements(
    sel.map((e) => e.id),
    (e) => (axis === 'x' ? { x: e.x + (moves.get(e.id) ?? 0) } : { y: e.y + (moves.get(e.id) ?? 0) }),
  );
}

/** Rotate selection by `deg` around its own center(s). */
export function rotateBy(deg: number) {
  const sel = selectedElements().filter((e) => !e.locked);
  if (!sel.length) return;
  const c = sel.length > 1 ? center(unionBounds(sel)!) : null;
  updateElements(
    sel.map((e) => e.id),
    (e) => {
      const rotation = (((e.rotation + deg) % 360) + 360) % 360;
      if (!c) return { rotation };
      const ec = rotatePoint(center(e), c, deg);
      return { rotation, x: ec.x - e.w / 2, y: ec.y - e.h / 2 };
    },
  );
}

export function startTextEdit(id: string) {
  const el = elementById(id);
  if (!el || el.type !== 'text' || el.locked) return;
  if (studio.get().editingTextId) finishTextEdit();
  // The whole typing session is one undo step.
  beginGesture();
  studio.set({ editingTextId: id, selection: [id], cropId: null, gesturing: false });
}

/** Called by the text editor overlay on every keystroke (one undo step per edit session). */
export function setEditingText(id: string, text: string) {
  updateElements<TextElement>([id], { text }, `text-${id}`);
}

export function finishTextEdit() {
  const s = studio.get();
  const id = s.editingTextId;
  if (!id) return;
  studio.set({ editingTextId: null });
  endGesture();
  const el = elementById(id);
  if (el?.type === 'text' && !el.text.trim()) deleteElement(id);
}

// ---------------------------------------------------------------------------
// Document-level

export function setBackground(fill: StudioFill, key?: string) {
  commit((doc) => ({ ...doc, background: fill }), key);
}

export function renameProject(name: string) {
  commit((doc) => ({ ...doc, name: name.trim() || 'Untitled design' }));
}

/** Change canvas size. With `scaleContent`, elements are scaled and re-centered to match. */
export function resizeCanvas(width: number, height: number, scaleContent: boolean) {
  const w = clamp(Math.round(width), 16, MAX_CANVAS_SIDE);
  const h = clamp(Math.round(height), 16, MAX_CANVAS_SIDE);
  commit((doc) => {
    if (!scaleContent) {
      const dx = (w - doc.width) / 2;
      const dy = (h - doc.height) / 2;
      return { ...doc, width: w, height: h, elements: doc.elements.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy })) };
    }
    const k = Math.min(w / doc.width, h / doc.height);
    const ox = (w - doc.width * k) / 2;
    const oy = (h - doc.height * k) / 2;
    return {
      ...doc,
      width: w,
      height: h,
      elements: doc.elements.map((e) => {
        const base = { ...e, x: ox + e.x * k, y: oy + e.y * k, w: e.w * k, h: e.h * k, shadow: { ...e.shadow, blur: e.shadow.blur * k, x: e.shadow.x * k, y: e.shadow.y * k } };
        switch (e.type) {
          case 'text':
            return fitText({ ...(base as typeof e), fontSize: e.fontSize * k, letterSpacing: e.letterSpacing * k, strokeWidth: e.strokeWidth * k });
          case 'shape':
            return { ...(base as typeof e), strokeWidth: e.strokeWidth * k, radius: e.radius * k };
          case 'line':
            return { ...(base as typeof e), strokeWidth: e.strokeWidth * k };
          case 'image':
            return { ...(base as typeof e), radius: e.radius * k, borderWidth: e.borderWidth * k };
          default:
            return base;
        }
      }),
    };
  });
  requestFit();
}

// ---------------------------------------------------------------------------
// Fonts

/** Re-measure text once web fonts arrive (no undo entry). */
export function refreshFonts() {
  replaceLive((doc) => ({ ...doc, elements: doc.elements.map((e) => (e.type === 'text' ? fitText(e) : e)) }));
  studio.set((s) => ({ paintTick: s.paintTick + 1 }));
}

export function ensureDocFonts(doc: StudioDoc) {
  ensureFonts(doc.elements.filter((e): e is TextElement => e.type === 'text'), refreshFonts);
}

// ---------------------------------------------------------------------------
// View

let fitRequested = false;
export function requestFit() {
  fitRequested = true;
  studio.set((s) => ({ view: { ...s.view, mode: 'fit' } }));
}

export function computeFit(s = studio.get()) {
  if (!s.doc) return s.view;
  const pad = s.viewport.w < 640 ? 20 : 56;
  const zoom = Math.max(0.02, Math.min((s.viewport.w - pad * 2) / s.doc.width, (s.viewport.h - pad * 2) / s.doc.height, 4));
  return { zoom, x: (s.viewport.w - s.doc.width * zoom) / 2, y: (s.viewport.h - s.doc.height * zoom) / 2, mode: 'fit' as const };
}

export function fitView() {
  fitRequested = false;
  studio.set({ view: computeFit() });
}

export function consumeFitRequest() {
  const r = fitRequested;
  fitRequested = false;
  return r;
}

export function setViewport(w: number, h: number) {
  const s = studio.get();
  if (s.viewport.w === w && s.viewport.h === h) return;
  studio.set({ viewport: { w, h } });
  if (studio.get().view.mode === 'fit') fitView();
}

export function zoomAt(zoom: number, sx: number, sy: number) {
  const s = studio.get();
  const z = clamp(zoom, 0.02, 16);
  const px = (sx - s.view.x) / s.view.zoom;
  const py = (sy - s.view.y) / s.view.zoom;
  studio.set({ view: { zoom: z, x: sx - px * z, y: sy - py * z, mode: 'manual' } });
}

const STEPS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16];
export function zoomStep(dir: 1 | -1) {
  const s = studio.get();
  const z = s.view.zoom;
  const next = dir > 0 ? STEPS.find((v) => v > z * 1.01) ?? 16 : [...STEPS].reverse().find((v) => v < z * 0.99) ?? 0.05;
  zoomAt(next, s.viewport.w / 2, s.viewport.h / 2);
}

export function panBy(dx: number, dy: number) {
  studio.set((s) => ({ view: { ...s.view, x: s.view.x + dx, y: s.view.y + dy, mode: 'manual' } }));
}

export function centerView() {
  const s = studio.get();
  if (!s.doc) return;
  studio.set({ view: { ...s.view, x: (s.viewport.w - s.doc.width * s.view.zoom) / 2, y: (s.viewport.h - s.doc.height * s.view.zoom) / 2, mode: 'manual' } });
}

export function setPanel(panel: LeftPanel | null) {
  studio.set((s) => ({ panel: s.panel === panel ? null : panel }));
}

// ---------------------------------------------------------------------------
// Projects

export async function openDoc(doc: StudioDoc, opts: { save?: boolean } = {}) {
  resetHistory(doc);
  // Open with the canvas front and center; panels open on demand.
  studio.set({ saveState: 'idle', view: { ...studio.get().view, mode: 'fit' }, panel: null });
  requestFit();
  ensureDocFonts(doc);
  const ids = [...new Set(doc.elements.filter((e): e is ImageElement => e.type === 'image').map((e) => e.assetId))];
  if (ids.length) {
    const results = await Promise.all(ids.map(loadAsset));
    if (results.some((r) => !r)) showToast('Some images in this design couldn’t be loaded.', 'error');
    studio.set((s) => ({ paintTick: s.paintTick + 1 }));
  }
  if (opts.save) void saveNow();
}

export function createProject(opts: { width: number; height: number; background?: StudioFill; name?: string; templateId?: string }) {
  const t = opts.templateId ? TEMPLATES.find((x) => x.id === opts.templateId) : null;
  const doc = t
    ? newDoc({ name: t.name, width: t.width, height: t.height, background: structuredClone(t.background), elements: t.build({ width: t.width, height: t.height }) })
    : newDoc({ name: opts.name, width: opts.width, height: opts.height, background: opts.background });
  void openDoc(doc, { save: true });
  return doc;
}

/** Replace the current design's content with a template (one undo step). */
export function applyTemplate(templateId: string, resize: boolean) {
  const t = TEMPLATES.find((x) => x.id === templateId);
  const s = studio.get();
  if (!t || !s.doc) return;
  const d = s.doc;
  let elements = t.build({ width: t.width, height: t.height });
  let width = t.width;
  let height = t.height;
  if (!resize) {
    // Fit the template into the current canvas size.
    const k = Math.min(d.width / t.width, d.height / t.height);
    const ox = (d.width - t.width * k) / 2;
    const oy = (d.height - t.height * k) / 2;
    width = d.width;
    height = d.height;
    elements = elements.map((e) => {
      const b = { ...e, x: ox + e.x * k, y: oy + e.y * k, w: e.w * k, h: e.h * k, shadow: { ...e.shadow, blur: e.shadow.blur * k, x: e.shadow.x * k, y: e.shadow.y * k } };
      if (e.type === 'text') return fitText({ ...(b as typeof e), fontSize: e.fontSize * k, letterSpacing: e.letterSpacing * k, strokeWidth: e.strokeWidth * k });
      if (e.type === 'shape') return { ...(b as typeof e), strokeWidth: e.strokeWidth * k, radius: e.radius * k };
      if (e.type === 'line') return { ...(b as typeof e), strokeWidth: e.strokeWidth * k };
      return b;
    });
  }
  commit((doc) => ({ ...doc, width, height, background: structuredClone(t.background), elements }));
  studio.set({ selection: [] });
  if (window.innerWidth < 768) studio.set({ panel: null });
  ensureDocFonts(studio.get().doc!);
  requestFit();
}

export async function openProject(id: string) {
  try {
    const rec = await db.loadProject(id);
    if (!rec) throw new Error('missing');
    await openDoc(rec.doc);
  } catch {
    showToast('Couldn’t open that design.', 'error');
  }
}

export function closeProject() {
  void saveNow();
  resetHistory(null);
  studio.set({ exportOpen: false, saveState: 'idle' });
}

export async function deleteProject(id: string) {
  try {
    await db.deleteProject(id);
    if (studio.get().doc?.id === id) resetHistory(null);
    showToast('Design deleted');
  } catch {
    showToast('Couldn’t delete that design.', 'error');
  }
}

export async function duplicateProject(id: string) {
  const rec = await db.loadProject(id);
  if (!rec) return;
  const now = Date.now();
  const copy = { ...structuredClone(rec.doc), id: uid('proj'), name: `${rec.doc.name} copy`, createdAt: now, updatedAt: now };
  await db.saveProject(copy, rec.thumb);
}

function reportStorageError(err: unknown) {
  const msg = db.isQuotaError(err)
    ? 'Your browser is out of storage space for CleanShot. Download your design as a project file, or delete old designs to free space.'
    : 'Your design couldn’t be saved in this browser. Download it as a project file to keep a copy.';
  studio.set({ storageWarning: msg, saveState: 'error' });
}

async function makeThumb(doc: StudioDoc): Promise<Blob | null> {
  try {
    const k = Math.min(1, 360 / doc.width, 360 / doc.height);
    const c = renderToCanvas(doc, k);
    return await canvasToBlob(c, 'image/webp', 0.8).catch(() => canvasToBlob(c, 'image/png'));
  } catch {
    return null;
  }
}

let saving: Promise<void> | null = null;
let lastSaved: StudioDoc | null = null;

export async function saveNow() {
  const doc = studio.get().doc;
  if (!doc || doc === lastSaved) return;
  if (saving) await saving;
  lastSaved = doc;
  studio.set({ saveState: 'saving' });
  saving = (async () => {
    try {
      await db.saveProject(doc, await makeThumb(doc));
      if (studio.get().doc?.id === doc.id) studio.set({ saveState: 'saved', storageWarning: null });
      void db.requestPersistence();
      const est = await db.storageEstimate();
      if (est && est.usage / est.quota > 0.9) studio.set({ storageWarning: 'Browser storage is almost full. Delete old designs or download project files to keep your work safe.' });
    } catch (err) {
      lastSaved = null;
      reportStorageError(err);
    } finally {
      saving = null;
    }
  })();
  return saving;
}

let saveTimer = 0;
let lastDoc: StudioDoc | null = null;
studio.subscribe(() => {
  const s = studio.get();
  if (s.doc === lastDoc) return;
  const prev = lastDoc;
  lastDoc = s.doc;
  if (!s.doc || s.gesturing || !prev || prev.id !== s.doc.id) return;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveNow(), 900);
});

export async function downloadProjectFile() {
  const doc = studio.get().doc;
  if (!doc) return;
  const ids = [...new Set(doc.elements.filter((e): e is ImageElement => e.type === 'image').map((e) => e.assetId))];
  const assets: db.AssetRecord[] = [];
  for (const id of ids) {
    const rec = await db.getAsset(id).catch(() => null);
    const img = getImage(id);
    if (rec) assets.push(rec);
    else if (img) {
      const blob = img.blob ?? (await canvasToBlob(img.source instanceof HTMLCanvasElement ? img.source : renderBitmap(img.source)));
      assets.push({ id, blob, width: img.width, height: img.height, name: 'image' });
    }
  }
  const blob = await db.buildProjectFile(doc, assets);
  const { downloadBlob } = await import('../engine/export');
  await downloadBlob(blob, `${doc.name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'design'}.cleanshot`);
}

function renderBitmap(b: ImageBitmap): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = b.width;
  c.height = b.height;
  c.getContext('2d')!.drawImage(b, 0, 0);
  return c;
}

export async function importProjectFile(file: Blob) {
  try {
    const { doc, assets } = await db.parseProjectFile(file);
    // Fresh ids so importing twice doesn't overwrite.
    const idMap = new Map<string, string>();
    for (const a of assets) {
      const id = uid('asset');
      idMap.set(a.id, id);
      const src = await decodeImage(a.blob);
      registerImage(src, { id, blob: a.blob });
      await db.putAsset({ ...a, id }).catch(reportStorageError);
    }
    const now = Date.now();
    const imported: StudioDoc = {
      ...doc,
      id: uid('proj'),
      createdAt: now,
      updatedAt: now,
      elements: doc.elements.map((e) => (e.type === 'image' ? { ...e, assetId: idMap.get(e.assetId) ?? e.assetId } : e)),
    };
    await openDoc(imported, { save: true });
    showToast(`Opened “${imported.name}”`, 'success');
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Couldn’t open that project file.', 'error');
  }
}

/** Open an image (from another tool or from Edit) on a canvas: the current design, or a new one sized to it. */
export async function openImageInCanvas(blob: Blob, name = 'Image', opts: { newDesign?: boolean } = {}) {
  try {
    if (opts.newDesign || !studio.get().doc) {
      const src = await decodeImage(blob);
      const k = Math.min(1, MAX_CANVAS_SIDE / src.width, MAX_CANVAS_SIDE / src.height);
      const doc = newDoc({ name: name.replace(/\.[^.]+$/, '') || 'Untitled design', width: src.width * k, height: src.height * k, background: { kind: 'transparent' } });
      await openDoc(doc);
      const asset = await importAsset(blob, name);
      const el = makeImage(doc, asset, { x: 0, y: 0, w: doc.width, h: doc.height });
      addElements([el]);
      void saveNow();
    } else await addImageFiles([new File([blob], name, { type: blob.type })]);
  } catch {
    showToast('Couldn’t open that image.', 'error');
  }
}

import { uid, clamp } from '../lib/utils';
import { canvasToBlob, constrainSource, decodeImage, getImage, registerImage, resample } from '../engine/images';
import { showToast } from '../store/actions';
import { aabb, center, rotatePoint, unionBounds } from './geometry';
import { cloneElements, coverCrop, fitText, scaleElement, makeChart, makeFrame, makeQr, makeIcon, makeImage, makeLine, makeShape, makeText, newDoc, normalize, type TextKind } from './factory';
import { ensureFonts } from './fonts';
import { renderToCanvas } from './render';
import * as db from './persistence';
import { beginGesture, commit, elementById, endGesture, replaceLive, resetHistory, selectedElements, studio, type LeftPanel } from './store';
import { MAX_CANVAS_SIDE, TEMPLATES } from './templates';
import { STICKERS, buildSticker } from './stickers';
import { adjustRuns, addRun, resetTextMetrics } from './textEngine';
import { allPages, migrateDoc, pageDoc, showPage, syncPages } from './pages';
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

export function select(ids: string[], additive = false, opts: { single?: boolean } = {}) {
  if (studio.get().editingTextId) finishTextEdit();
  const s = studio.get();
  // `single` picks one element inside a group instead of the whole group.
  const expanded = opts.single ? ids : withGroups(ids);
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
  if (s.selection.length < 2 || !s.doc) return;
  const gid = uid('grp');
  const sel = new Set(s.selection);
  const n = Object.keys(s.doc.groupNames ?? {}).length + 1;
  commit((doc) => {
    // Members become contiguous in z-order, at the topmost member's place.
    const top = Math.max(...doc.elements.map((e, i) => (sel.has(e.id) ? i : -1)));
    const members = doc.elements.filter((e) => sel.has(e.id)).map((e) => ({ ...e, groupId: gid }));
    const before = doc.elements.slice(0, top + 1).filter((e) => !sel.has(e.id));
    const after = doc.elements.slice(top + 1);
    return { ...doc, elements: [...before, ...members, ...after], groupNames: { ...doc.groupNames, [gid]: `Group ${n}` } };
  });
}

export function renameGroup(gid: string, name: string) {
  commit((doc) => ({ ...doc, groupNames: { ...doc.groupNames, [gid]: name.trim() || 'Group' } }));
}

/** Move elements (a group, or one element) to sit just in front of `refId`, or to the very back. */
export function moveAbove(ids: Set<string>, refId: string | null) {
  if (refId && ids.has(refId)) return;
  commit((doc) => {
    const moving = doc.elements.filter((e) => ids.has(e.id));
    const rest = doc.elements.filter((e) => !ids.has(e.id));
    const at = refId ? rest.findIndex((e) => e.id === refId) + 1 : 0;
    return { ...doc, elements: [...rest.slice(0, at), ...moving, ...rest.slice(at)] };
  });
}

export function setGroupFlag(gid: string, patch: { hidden?: boolean; locked?: boolean }) {
  commit((doc) => ({ ...doc, elements: doc.elements.map((e) => (e.groupId === gid ? { ...e, ...patch } : e)) }));
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
  updateElements<TextElement>([id], (e) => ({ text, runs: adjustRuns(e.runs, e.text, text) }), `text-${id}`);
}

/** Style part of a text box (while editing, with a selection) or all of it. */
export function styleText(id: string, range: { start: number; end: number } | null, patch: { bold?: boolean; italic?: boolean; underline?: boolean; color?: string }, key?: string) {
  const el = elementById(id);
  if (!el || el.type !== 'text') return;
  if (range && range.end > range.start && !(range.start === 0 && range.end >= el.text.length)) {
    updateElements<TextElement>([id], (e) => ({ runs: addRun(e, range.start, range.end, patch) }), key);
    return;
  }
  // Whole box: set the base style and drop overrides of the same property
  const strip = (runs: TextElement['runs']) =>
    runs
      ?.map((r) => {
        const n = { ...r };
        for (const k of Object.keys(patch) as (keyof typeof patch)[]) delete n[k];
        return n;
      })
      .filter((r) => r.bold !== undefined || r.italic !== undefined || r.underline !== undefined || r.color !== undefined);
  updateElements<TextElement>([id], (e) => ({ ...patch, runs: strip(e.runs)?.length ? strip(e.runs) : undefined, ...(patch.color ? { gradient: null } : {}) }), key);
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
  commit((d) => {
    const doc = syncPages(d);
    const k = Math.min(w / doc.width, h / doc.height);
    const ox = (w - doc.width * k) / 2;
    const oy = (h - doc.height * k) / 2;
    const dx = (w - doc.width) / 2;
    const dy = (h - doc.height) / 2;
    const move = (els: StudioElement[]) =>
      scaleContent ? els.map((e) => scaleElement(e, k, ox, oy)) : els.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy }));
    const pages = doc.pages.map((p) => ({ ...p, elements: move(p.elements) }));
    return showPage({ ...doc, width: w, height: h, pages }, doc.pageIndex);
  });
  requestFit();
}

// ---------------------------------------------------------------------------
// Fonts

/** Re-measure text once web fonts arrive (no undo entry). */
export function refreshFonts() {
  resetTextMetrics();
  replaceLive((doc) => ({ ...doc, elements: doc.elements.map((e) => (e.type === 'text' ? fitText(e) : e)) }));
  studio.set((s) => ({ paintTick: s.paintTick + 1 }));
}

export function ensureDocFonts(doc: StudioDoc) {
  ensureFonts(allPages(doc).flatMap((p) => p.elements.filter((e): e is TextElement => e.type === 'text')), refreshFonts);
}

/** Every image asset a document uses, across all pages. */
export function docAssetIds(doc: StudioDoc): string[] {
  return [...new Set(allPages(doc).flatMap((p) => p.elements.filter((e): e is ImageElement => e.type === 'image' && !!e.assetId).map((e) => e.assetId)))];
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

export async function openDoc(raw: StudioDoc, opts: { save?: boolean } = {}) {
  const doc = migrateDoc(raw);
  resetHistory(doc);
  // Open with the canvas front and center; panels open on demand.
  studio.set({ saveState: 'idle', view: { ...studio.get().view, mode: 'fit' }, panel: null });
  requestFit();
  ensureDocFonts(doc);
  const ids = docAssetIds(doc);
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
    elements = elements.map((e) => scaleElement(e, k, ox, oy));
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
    ? 'Your browser is out of storage space for Studiolo. Download your design as a project file, or delete old designs to free space.'
    : 'Your design couldn’t be saved in this browser. Download it as a project file to keep a copy.';
  studio.set({ storageWarning: msg, saveState: 'error' });
}

async function makeThumb(doc: StudioDoc): Promise<Blob | null> {
  try {
    const k = Math.min(1, 360 / doc.width, 360 / doc.height);
    const c = renderToCanvas(pageDoc(doc, 0), k);
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
      await db.saveProject(syncPages(doc), await makeThumb(doc));
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
  const ids = docAssetIds(doc);
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
  const blob = await db.buildProjectFile(syncPages(doc), assets);
  const { downloadBlob } = await import('../engine/export');
  await downloadBlob(blob, `${doc.name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'design'}.studiolo`);
}

/** Download a saved design (from "Your designs") as a .studiolo file without opening it. */
export async function downloadSavedProject(id: string) {
  const rec = await db.loadProject(id);
  if (!rec) return;
  const assets = (await Promise.all(docAssetIds(rec.doc).map((a) => db.getAsset(a).catch(() => null)))).filter((a): a is db.AssetRecord => !!a);
  const blob = await db.buildProjectFile(rec.doc, assets);
  const { downloadBlob } = await import('../engine/export');
  await downloadBlob(blob, `${rec.name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'design'}.studiolo`);
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
    const parsed = await db.parseProjectFile(file);
    const doc = syncPages(migrateDoc(parsed.doc));
    const assets = parsed.assets;
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
      pages: doc.pages.map((p) => ({ ...p, elements: p.elements.map((e) => (e.type === 'image' ? { ...e, assetId: idMap.get(e.assetId) ?? e.assetId } : e)) })),
    };
    Object.assign(imported, showPage(imported, imported.pageIndex));
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

// ---------------------------------------------------------------------------
// Pages

export function goToPage(i: number) {
  const s = studio.get();
  if (!s.doc) return;
  if (s.editingTextId) finishTextEdit();
  replaceLive((doc) => showPage(doc, i));
  studio.set({ selection: [], cropId: null, editingTextId: null });
  ensureDocFonts(studio.get().doc!);
}

export function addPage(opts: { duplicate?: boolean } = {}) {
  const s = studio.get();
  if (!s.doc) return;
  commit((d) => {
    const doc = syncPages(d);
    const cur = doc.pages[doc.pageIndex];
    const page = opts.duplicate
      ? { id: uid('pg'), background: structuredClone(cur.background), elements: cloneElements(cur.elements) }
      : { id: uid('pg'), background: cur.background.kind === 'transparent' ? cur.background : structuredClone(cur.background), elements: [] };
    const pages = [...doc.pages];
    pages.splice(doc.pageIndex + 1, 0, page);
    return showPage({ ...doc, pages }, doc.pageIndex + 1);
  });
  studio.set({ selection: [], cropId: null });
}

export function deletePage(i = studio.get().doc?.pageIndex ?? 0) {
  const doc = studio.get().doc;
  if (!doc) return;
  const n = allPages(doc).length;
  if (n <= 1) {
    showToast('A design needs at least one page.', 'info');
    return;
  }
  commit((d) => {
    const synced = syncPages(d);
    const pages = synced.pages.filter((_, k) => k !== i);
    const a = synced.pageIndex;
    const next = i === a ? Math.min(i, pages.length - 1) : i < a ? a - 1 : a;
    // Build directly: showPage would sync the deleted page back into the list.
    return { ...synced, pages, pageIndex: next, elements: pages[next].elements, background: pages[next].background };
  });
  studio.set({ selection: [], cropId: null });
}

export function movePage(from: number, to: number) {
  commit((d) => {
    const doc = syncPages(d);
    const pages = [...doc.pages];
    const activeId = pages[doc.pageIndex].id;
    const [p] = pages.splice(from, 1);
    pages.splice(clamp(to, 0, pages.length), 0, p);
    const idx = pages.findIndex((x) => x.id === activeId);
    return { ...doc, pages, pageIndex: idx };
  });
}

// ---------------------------------------------------------------------------
// Image tools: frames, adjustments, AI

export function addFrame(mask: ShapeKind) {
  const d = docOrNull();
  if (d) addElements([placeAtViewCenter(makeFrame(d, mask))]);
}

/** Put an image into an empty frame (or replace a framed image), cropping it to fill. */
export async function fillFrame(id: string, file: Blob) {
  await replaceImage(id, file);
}

async function sourceCanvasOf(assetId: string): Promise<HTMLCanvasElement | null> {
  if (!(await loadAsset(assetId))) return null;
  const entry = getImage(assetId)!;
  if (entry.source instanceof HTMLCanvasElement) return entry.source;
  const c = document.createElement('canvas');
  c.width = entry.width;
  c.height = entry.height;
  c.getContext('2d')!.drawImage(entry.source, 0, 0);
  return c;
}

async function registerResult(canvas: HTMLCanvasElement, name: string): Promise<Asset> {
  const blob = await canvasToBlob(canvas, 'image/png');
  return importAsset(blob, name);
}

export type AiProgress = (label: string, fraction: number | null) => void;

/** Cut out the subject of an image element (the new image replaces the old one; undo restores it). */
export async function removeBackground(id: string, onProgress: AiProgress) {
  const el = elementById(id);
  if (!el || el.type !== 'image' || !el.assetId) return;
  const src = await sourceCanvasOf(el.assetId);
  if (!src) throw new Error('This image isn’t loaded.');
  const { loadSegmenter, predictMask } = await import('../tools/bgremove/segment');
  const { buildFullMask, composeCutout } = await import('../tools/bgremove/mask');
  onProgress('Loading model', null);
  await loadSegmenter((p) => onProgress('Downloading model', p.total ? p.loaded / p.total : null));
  onProgress('Finding the subject', null);
  const small = await predictMask(src);
  const mask = buildFullMask(small, src.width, src.height, 1);
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  composeCutout(out, src, mask);
  const asset = await registerResult(out, `${el.name}-cutout`);
  updateElements<ImageElement>([id], { assetId: asset.id });
}

/** Upscale an image element 2× with the super-resolution model. */
export async function upscaleElement(id: string, onProgress: AiProgress) {
  const el = elementById(id);
  if (!el || el.type !== 'image' || !el.assetId) return;
  let src = await sourceCanvasOf(el.assetId);
  if (!src) throw new Error('This image isn’t loaded.');
  const { loadUpscaler, upscale, SR_MODELS } = await import('../tools/upscaler/sr');
  const max = SR_MODELS[2].maxSide;
  if (Math.max(src.width, src.height) > max) {
    const k = max / Math.max(src.width, src.height);
    src = resample(src, Math.round(src.width * k), Math.round(src.height * k));
  }
  onProgress('Loading model', null);
  await loadUpscaler(2, (p) => onProgress('Downloading model', p.total ? p.loaded / p.total : null));
  const out = await upscale(src, 2, { onTile: (d, t) => onProgress('Upscaling', t ? d / t : null) });
  const asset = await registerResult(out, `${el.name}-2x`);
  const old = getImage(el.assetId)!;
  const kx = asset.width / old.width;
  const ky = asset.height / old.height;
  updateElements<ImageElement>([id], (e) => ({ assetId: asset.id, crop: { x: e.crop.x * kx, y: e.crop.y * ky, w: e.crop.w * kx, h: e.crop.h * ky } }));
}

// ---------------------------------------------------------------------------
// Charts, QR codes and stickers

export function addChart(kind: import('./types').ChartKind) {
  const d = docOrNull();
  if (d) addElements([placeAtViewCenter(makeChart(d, kind))]);
}

export function addQr() {
  const d = docOrNull();
  if (d) addElements([placeAtViewCenter(makeQr(d))]);
}

export function addSticker(id: string, at?: { x: number; y: number }) {
  const d = docOrNull();
  const st = STICKERS.find((s) => s.id === id);
  if (!d || !st) return;
  const s = studio.get();
  const cx = at?.x ?? (s.viewport.w / 2 - s.view.x) / s.view.zoom;
  const cy = at?.y ?? (s.viewport.h / 2 - s.view.y) / s.view.zoom;
  const inside = cx > 0 && cy > 0 && cx < d.width && cy < d.height;
  const els = buildSticker(st, d, inside ? { x: cx, y: cy } : { x: d.width / 2, y: d.height / 2 });
  addElements(els);
  const gid = els[0]?.groupId;
  if (gid) replaceLive((doc) => ({ ...doc, groupNames: { ...doc.groupNames, [gid]: st.label } }));
  ensureFonts(els.filter((e): e is TextElement => e.type === 'text'), refreshFonts);
}

// ---------------------------------------------------------------------------
// Your templates

export async function saveAsTemplate(name?: string) {
  const doc = studio.get().doc;
  if (!doc) return;
  const synced = syncPages(doc);
  const now = Date.now();
  try {
    await db.saveTemplate({
      id: uid('tpl'),
      name: name?.trim() || doc.name,
      updatedAt: now,
      width: doc.width,
      height: doc.height,
      doc: structuredClone({ ...synced, id: 'template' }),
      thumb: await makeThumb(synced),
    });
    showToast('Saved to Your templates.', 'success');
    studio.set((s) => ({ paintTick: s.paintTick + 1 }));
  } catch (err) {
    reportStorageError(err);
  }
}

/** Start a new design from one of your saved templates. */
export async function createFromUserTemplate(rec: db.ProjectRecord) {
  const now = Date.now();
  const copy = migrateDoc({ ...structuredClone(rec.doc), id: uid('proj'), name: rec.name, createdAt: now, updatedAt: now });
  const fresh = { ...copy, pages: copy.pages.map((p) => ({ ...p, id: uid('pg'), elements: cloneElements(p.elements) })) };
  // Build the first page directly (showPage would sync the old, un-cloned page back in).
  await openDoc({ ...fresh, pageIndex: 0, elements: fresh.pages[0].elements, background: fresh.pages[0].background }, { save: true });
}

// ---------------------------------------------------------------------------
// Smart resize

/** Re-layout one page for a new size: backgrounds stretch, everything else keeps its relative place. */
function smartPage(els: StudioElement[], W: number, H: number, W2: number, H2: number): StudioElement[] {
  const kx = W2 / W;
  const ky = H2 / H;
  const s = Math.min(kx, ky) * Math.min(1.25, Math.max(1, Math.sqrt(Math.max(kx, ky) / Math.min(kx, ky)) * 0.9));
  return els.map((e) => {
    const full = e.rotation % 180 === 0 && e.x <= W * 0.03 && e.y <= H * 0.03 && e.x + e.w >= W * 0.97 && e.y + e.h >= H * 0.97;
    if (full) {
      const out = { ...e, x: (e.x / W) * W2, y: (e.y / H) * H2, w: (e.w / W) * W2, h: (e.h / H) * H2 };
      if (out.type === 'image') {
        const img = getImage(out.assetId);
        if (img) out.crop = coverCrop(img, out.w, out.h);
      }
      return out as StudioElement;
    }
    const cx = ((e.x + e.w / 2) / W) * W2;
    const cy = ((e.y + e.h / 2) / H) * H2;
    let scaled = scaleElement(e, s, 0, 0);
    // Keep things inside the new page
    const fit = Math.min(1, (W2 * 0.94) / scaled.w, scaled.type === 'text' ? 1 : (H2 * 0.94) / scaled.h);
    if (fit < 1) scaled = scaleElement(scaled, fit, 0, 0);
    let x = cx - scaled.w / 2;
    let y = cy - scaled.h / 2;
    if (scaled.w <= W2) x = Math.min(Math.max(x, 0), W2 - scaled.w);
    if (scaled.h <= H2) y = Math.min(Math.max(y, 0), H2 - scaled.h);
    return { ...scaled, x, y } as StudioElement;
  });
}

export function smartResized(doc: StudioDoc, W2: number, H2: number): StudioDoc {
  const synced = syncPages(doc);
  const pages = synced.pages.map((p) => ({ ...p, elements: smartPage(p.elements, doc.width, doc.height, W2, H2) }));
  return { ...synced, width: Math.round(W2), height: Math.round(H2), pages, elements: pages[synced.pageIndex].elements, background: pages[synced.pageIndex].background };
}

/** Apply smart resize to the open design (one undo step). */
export function smartResizeInPlace(W2: number, H2: number) {
  commit((doc) => smartResized(doc, W2, H2));
  ensureDocFonts(studio.get().doc!);
  requestFit();
}

/** Save resized copies as new designs. Returns how many were made. */
export async function smartResizeCopies(targets: { label: string; width: number; height: number }[]): Promise<number> {
  const doc = studio.get().doc;
  if (!doc) return 0;
  await saveNow();
  let n = 0;
  for (const t of targets) {
    const now = Date.now();
    const r = smartResized(doc, t.width, t.height);
    const copy: StudioDoc = {
      ...r,
      id: uid('proj'),
      name: `${doc.name} – ${t.label}`,
      createdAt: now,
      updatedAt: now,
      pages: r.pages.map((p) => ({ ...p, id: uid('pg') })),
    };
    try {
      await db.saveProject(copy, await makeThumb(copy));
      n++;
    } catch (err) {
      reportStorageError(err);
      break;
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Find and replace

export interface FindHit {
  page: number;
  id: string;
  count: number;
  preview: string;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findText(query: string, caseSensitive: boolean): FindHit[] {
  const doc = studio.get().doc;
  if (!doc || !query) return [];
  const re = new RegExp(escapeRe(query), caseSensitive ? 'g' : 'gi');
  const hits: FindHit[] = [];
  allPages(doc).forEach((p, i) =>
    p.elements.forEach((e) => {
      if (e.type !== 'text') return;
      const count = e.text.match(re)?.length ?? 0;
      if (count) hits.push({ page: i, id: e.id, count, preview: e.text.replace(/\s+/g, ' ').slice(0, 60) });
    }),
  );
  return hits;
}

/** Replace everywhere (all pages) in one undo step. Returns the number of replacements. */
export function replaceText(query: string, replacement: string, caseSensitive: boolean): number {
  const doc = studio.get().doc;
  if (!doc || !query) return 0;
  const re = new RegExp(escapeRe(query), caseSensitive ? 'g' : 'gi');
  let n = 0;
  commit((d) => {
    const synced = syncPages(d);
    const pages = synced.pages.map((p) => ({
      ...p,
      elements: p.elements.map((e) => {
        if (e.type !== 'text' || !re.test(e.text)) return e;
        re.lastIndex = 0;
        const text = e.text.replace(re, () => {
          n++;
          return replacement;
        });
        return fitText({ ...e, text, runs: adjustRuns(e.runs, e.text, text) });
      }),
    }));
    return { ...synced, pages, elements: pages[synced.pageIndex].elements };
  });
  return n;
}

export function revealElement(page: number, id: string) {
  if (studio.get().doc?.pageIndex !== page) goToPage(page);
  select([id]);
}

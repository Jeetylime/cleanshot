import type {
  Annotation,
  BackgroundSettings,
  EditorDoc,
  ExportFormat,
  Point,
  Rect,
  Theme,
  A11yPrefs,
  Backdrop,
  ToolId,
} from '../types';
import { store, type ExportPrefs, type ToolStyles } from './store';
import { beginGesture, cancelGesture, commit, endGesture, inGesture, resetHistory, updateLive } from './history';
import { fitView } from './view';
import { styleGroupOf, toolStyleGroup, type StyleGroup, CANVAS_TOOLS } from './factory';
import {
  constrainSource,
  cropImage,
  decodeImage,
  flipImage,
  getImage,
  registerImage,
  releaseImagesExcept,
  resizeImage,
  rotateImage,
  type ImageEntry,
} from '../engine/images';
import { getBounds, moveAnnotation, transformAnnotation } from '../engine/annotations';
import { DEFAULT_BACKGROUND } from '../engine/backgrounds';
import { clampExportSize, downloadBlob, exportDocument, exportFileName, outputSize, writeImageToClipboard } from '../engine/export';
import { clearPrivacyCaches } from '../engine/privacy';
import { createSampleScreenshot } from '../engine/sample';
import { clamp, defaultScreenshotName, intersectRects, rectsIntersect, uid } from '../lib/utils';
import { readPngDpi } from '../lib/png';
import * as sessions from '../persistence/sessions';

// ---------------------------------------------------------------------------
// Toasts

let toastSeq = 0;
let toastTimer: number | undefined;

export function showToast(message: string, tone: 'success' | 'error' | 'info' = 'success') {
  const id = ++toastSeq;
  store.set({ toast: { id, message, tone } });
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (store.get().toast?.id === id) store.set({ toast: null });
  }, tone === 'error' ? 3600 : 2000);
}

// ---------------------------------------------------------------------------
// Documents

const SUPPORTED = /^image\/(png|jpe?g|webp|gif|bmp|avif|x-icon|svg\+xml)$/;

function pickUnit(entry: ImageEntry, dpi: number | null): number {
  if (dpi && dpi >= 110) return clamp(Math.round((dpi / 72) * 4) / 4, 1, 4);
  if (dpi && dpi > 0) return 1;
  const maxDim = Math.max(entry.width, entry.height);
  return clamp(Math.round((maxDim / 1600) * 4) / 4, 1, 4);
}

function createDoc(entry: ImageEntry, name: string, unit: number): EditorDoc {
  return {
    id: uid('session'),
    name,
    imageId: entry.id,
    originalImageId: entry.id,
    width: entry.width,
    height: entry.height,
    unit,
    originalUnit: unit,
    annotations: [],
    background: { ...DEFAULT_BACKGROUND, padding: defaultPadding(entry.width, entry.height, unit) },
    createdAt: Date.now(),
  };
}

function defaultPadding(w: number, h: number, unit: number) {
  return Math.round(clamp((Math.max(w, h) * 0.065) / unit, 24, 160) / 4) * 4;
}

function startSession(doc: EditorDoc) {
  const prev = store.get().doc;
  if (prev && prev.id !== doc.id) void flushAutosave();
  // Release memory held by the previous session's images.
  releaseImagesExcept(new Set([doc.imageId, doc.originalImageId]));
  clearPrivacyCaches();
  resetHistory(doc);
  store.set({
    tool: 'select',
    crop: null,
    overlay: null,
    view: { ...store.get().view, mode: 'fit' },
  });
  fitView(false);
}

export async function openImageBlob(blob: Blob, name?: string) {
  const looksLikeImage = SUPPORTED.test(blob.type) || (name && /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(name));
  if (!looksLikeImage) {
    showToast('That file isn’t a supported image. Try PNG, JPG or WebP.', 'error');
    return;
  }
  store.set({ busy: 'Opening image…' });
  try {
    const decoded = await decodeImage(blob);
    const [source, scaled] = constrainSource(decoded);
    const keepBlob = !scaled && /^image\/(png|jpeg|webp)$/.test(blob.type);
    const entry = registerImage(source, { blob: keepBlob ? blob : null });
    const dpi = await readPngDpi(blob);
    const docName = name ? name.replace(/\.[a-z0-9]{2,5}$/i, '') : defaultScreenshotName();
    const hadEdits = (store.get().doc?.annotations.length ?? 0) > 0 || store.get().past.length > 0;
    startSession(createDoc(entry, docName, pickUnit(entry, dpi)));
    if (scaled) showToast('Large image was scaled down to fit browser limits.', 'info');
    else if (hadEdits) showToast('Opened new image — your previous edit is saved in Recents.', 'info');
  } catch (err) {
    console.error(err);
    showToast('Couldn’t open this image.', 'error');
  } finally {
    store.set({ busy: null });
  }
}

export function openSample() {
  const canvas = createSampleScreenshot();
  const entry = registerImage(canvas);
  startSession(createDoc(entry, 'Northwind Billing', 2));
}

export async function openSession(id: string) {
  store.set({ busy: 'Restoring session…' });
  try {
    const doc = await sessions.loadSession(id);
    if (!doc) throw new Error('missing');
    startSession(doc);
  } catch (err) {
    console.error(err);
    showToast('This session could not be restored.', 'error');
    await sessions.deleteSession(id).catch(() => {});
    void refreshRecents();
  } finally {
    store.set({ busy: null });
  }
}

export async function closeDocument() {
  commitTextEdit();
  await flushAutosave();
  resetHistory(null);
  releaseImagesExcept(new Set());
  clearPrivacyCaches();
  store.set({ tool: 'select', crop: null, overlay: null });
  void refreshRecents();
}

/** Revert to the original image with no edits (undoable). */
export function resetEdits() {
  const s = store.get();
  if (!s.doc) return;
  commitTextEdit();
  const entry = getImage(s.doc.originalImageId);
  if (!entry) return;
  store.set({ crop: null, tool: 'select', selection: [] });
  commit((doc) => ({
    ...doc,
    imageId: entry.id,
    width: entry.width,
    height: entry.height,
    unit: doc.originalUnit ?? doc.unit,
    annotations: [],
    background: {
      ...DEFAULT_BACKGROUND,
      padding: defaultPadding(entry.width, entry.height, doc.originalUnit ?? doc.unit),
    },
  }));
  fitView(true);
  showToast('Reverted to original', 'info');
}

export function renameDoc(name: string) {
  const n = name.trim();
  if (!n) return;
  commit((doc) => (doc.name === n ? doc : { ...doc, name: n }));
}

// ---------------------------------------------------------------------------
// Recent sessions + autosave

let thumbUrls: string[] = [];

export async function refreshRecents() {
  try {
    const list = await sessions.listSessions();
    thumbUrls.forEach((u) => URL.revokeObjectURL(u));
    thumbUrls = [];
    const recents = list.map((s) => {
      const url = s.thumb ? URL.createObjectURL(s.thumb) : null;
      if (url) thumbUrls.push(url);
      return { id: s.id, name: s.name, updatedAt: s.updatedAt, width: s.width, height: s.height, thumbUrl: url };
    });
    store.set({ recents });
  } catch {
    store.set({ recents: [] });
  }
}

export async function removeRecent(id: string) {
  await sessions.deleteSession(id).catch(() => {});
  await refreshRecents();
}

export async function clearRecents() {
  await sessions.clearSessions().catch(() => {});
  await refreshRecents();
  showToast('Recent sessions cleared', 'info');
}

let saveTimer: number | undefined;
let pendingDoc: EditorDoc | null = null;
let savedDoc: EditorDoc | null = null;
let saving: Promise<void> = Promise.resolve();

function scheduleSave(doc: EditorDoc) {
  pendingDoc = doc;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void flushAutosave(), 700);
}

export function flushAutosave(): Promise<void> {
  clearTimeout(saveTimer);
  const doc = pendingDoc;
  pendingDoc = null;
  if (!doc || doc === savedDoc) return saving;
  saving = saving
    .then(() => sessions.saveSession(doc))
    .then(() => {
      savedDoc = doc;
    })
    .catch((err) => console.warn('Autosave failed', err));
  return saving;
}

export function initAutosave() {
  let last: EditorDoc | null = null;
  store.subscribe(() => {
    const s = store.get();
    if (s.doc === last || s.gesturing) return;
    last = s.doc;
    if (s.doc) scheduleSave(s.doc);
  });
  const flush = () => void flushAutosave();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

// ---------------------------------------------------------------------------
// Tools & selection

export function setTool(tool: ToolId) {
  const s = store.get();
  if (s.editingTextId) commitTextEdit();
  if (tool === 'crop') {
    startCrop();
    return;
  }
  const leavingCrop = !!s.crop;
  store.set({
    tool,
    crop: null,
    selection: tool === 'select' ? s.selection : [],
    propertiesOpen: CANVAS_TOOLS.has(tool) ? true : s.propertiesOpen,
  });
  if (leavingCrop) fitView(true);
}

export function select(ids: string[]) {
  store.set({ selection: ids });
}

export function selectAll() {
  const doc = store.get().doc;
  if (!doc) return;
  store.set({ tool: 'select', selection: doc.annotations.map((a) => a.id) });
}

export function clearSelection() {
  if (store.get().selection.length) store.set({ selection: [] });
}

export function selectedAnnotations(): Annotation[] {
  const s = store.get();
  if (!s.doc || !s.selection.length) return [];
  const set = new Set(s.selection);
  return s.doc.annotations.filter((a) => set.has(a.id));
}

// ---------------------------------------------------------------------------
// Annotation editing

export function addAnnotation(a: Annotation) {
  commit((doc) => ({ ...doc, annotations: [...doc.annotations, a] }));
  store.set({ selection: [a.id] });
}

export function updateAnnotation(id: string, patch: Partial<Annotation>, key?: string) {
  commit(
    (doc) => ({
      ...doc,
      annotations: doc.annotations.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)),
    }),
    { key },
  );
}

export function deleteSelection() {
  const s = store.get();
  if (!s.doc || !s.selection.length) return;
  const set = new Set(s.selection);
  commit((doc) => ({ ...doc, annotations: doc.annotations.filter((a) => !set.has(a.id)) }));
  store.set({ selection: [] });
}

function cloneAnnotations(list: Annotation[], offset: number, existing: Annotation[]): Annotation[] {
  let seq = existing.reduce((m, a) => (a.type === 'step' ? Math.max(m, a.seq) : m), 0);
  return list.map((a) => {
    const moved = moveAnnotation(structuredClone(a), offset, offset);
    moved.id = uid();
    if (moved.type === 'step') moved.seq = ++seq;
    return moved;
  });
}

export function duplicateSelection() {
  const s = store.get();
  const sel = selectedAnnotations();
  if (!s.doc || !sel.length) return;
  const copies = cloneAnnotations(sel, 16 * s.doc.unit, s.doc.annotations);
  commit((doc) => ({ ...doc, annotations: [...doc.annotations, ...copies] }));
  store.set({ selection: copies.map((c) => c.id) });
}

export function nudgeSelection(dx: number, dy: number) {
  const s = store.get();
  if (!s.doc || !s.selection.length) return;
  const set = new Set(s.selection);
  commit(
    (doc) => ({
      ...doc,
      annotations: doc.annotations.map((a) => (set.has(a.id) ? moveAnnotation(a, dx, dy) : a)),
    }),
    { key: 'nudge' },
  );
}

export function arrange(where: 'front' | 'back') {
  const s = store.get();
  if (!s.doc || !s.selection.length) return;
  const set = new Set(s.selection);
  commit((doc) => {
    const sel = doc.annotations.filter((a) => set.has(a.id));
    const rest = doc.annotations.filter((a) => !set.has(a.id));
    return { ...doc, annotations: where === 'front' ? [...rest, ...sel] : [...sel, ...rest] };
  });
}

// Internal clipboard for annotations. A marker string is written to the
// system clipboard so a later paste knows to use it.
const CLIP_MARKER = 'cleanshot/annotations';
let annotationClipboard: Annotation[] = [];

export function copySelectionToClipboard(): boolean {
  const sel = selectedAnnotations();
  if (!sel.length) return false;
  annotationClipboard = structuredClone(sel);
  navigator.clipboard?.writeText?.(CLIP_MARKER).catch(() => {});
  return true;
}

export function pasteAnnotations(): boolean {
  const s = store.get();
  if (!s.doc || !annotationClipboard.length) return false;
  const copies = cloneAnnotations(annotationClipboard, 16 * s.doc.unit, s.doc.annotations);
  annotationClipboard = copies;
  commit((doc) => ({ ...doc, annotations: [...doc.annotations, ...copies] }));
  store.set({ selection: copies.map((c) => c.id), tool: 'select' });
  return true;
}

export function isAnnotationClipboardText(text: string): boolean {
  return text === CLIP_MARKER && annotationClipboard.length > 0;
}

// ---------------------------------------------------------------------------
// Styles

export type StylePatch = Partial<{
  color: string;
  strokeWidth: number;
  heads: 'end' | 'both' | 'none';
  shadow: boolean;
  opacity: number;
  radius: number;
  fill: 'none' | 'tint' | 'solid';
  fontSize: number;
  weight: 400 | 600 | 800;
  style: 'plain' | 'outline' | 'filled';
  size: number;
  intensity: number;
  mode: 'stroke' | 'box' | 'spotlight';
}>;

function patchStyles(styles: ToolStyles, group: StyleGroup, patch: StylePatch): ToolStyles {
  const next = { ...styles };
  const obj = { ...(styles[group] as object) } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'color') {
      if (group === 'highlighter' || group === 'redact') obj.color = v;
      else if (group !== 'blur' && group !== 'pixelate') next.color = v as string;
    } else if (k in obj) {
      obj[k] = v;
    }
  }
  (next as Record<string, unknown>)[group] = obj;
  return next;
}

function patchAnnotation(a: Annotation, patch: StylePatch): Annotation {
  let changed = false;
  const out = { ...a } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'mode' || k === 'id' || k === 'type') continue;
    if (k in out && out[k] !== v) {
      out[k] = v;
      changed = true;
    }
  }
  return changed ? (out as unknown as Annotation) : a;
}

/** Apply style changes to the selection and remember them as tool defaults. */
export function applyStyle(patch: StylePatch) {
  const s = store.get();
  const sel = selectedAnnotations();
  const groups = new Set<StyleGroup>(sel.map(styleGroupOf));
  if (!sel.length) {
    const g = toolStyleGroup(s.tool);
    if (g) groups.add(g);
  }
  let styles = s.styles;
  groups.forEach((g) => (styles = patchStyles(styles, g, patch)));
  if (styles !== s.styles) store.set({ styles });
  if (sel.length) {
    const ids = new Set(s.selection);
    commit(
      (doc) => {
        let changed = false;
        const annotations = doc.annotations.map((a) => {
          if (!ids.has(a.id)) return a;
          const n = patchAnnotation(a, patch);
          if (n !== a) changed = true;
          return n;
        });
        return changed ? { ...doc, annotations } : doc;
      },
      { key: `style:${Object.keys(patch).join(',')}:${s.selection.join(',')}` },
    );
  }
}

// ---------------------------------------------------------------------------
// Text editing

let textEditIsNew = false;

export function startTextEdit(id: string, isNew: boolean) {
  const s = store.get();
  if (s.editingTextId === id) return;
  if (s.editingTextId) commitTextEdit();
  if (inGesture()) endGesture();
  beginGesture();
  textEditIsNew = isNew;
  store.set({ editingTextId: id, selection: [id] });
}

/** Place a new, empty text annotation and start editing it. */
export function createTextAt(a: Annotation) {
  if (store.get().editingTextId) commitTextEdit();
  if (inGesture()) endGesture();
  beginGesture();
  textEditIsNew = true;
  updateLive((doc) => ({ ...doc, annotations: [...doc.annotations, a] }));
  store.set({ editingTextId: a.id, selection: [a.id] });
}

export function updateEditingText(text: string) {
  const id = store.get().editingTextId;
  if (!id) return;
  updateLive((doc) => ({
    ...doc,
    annotations: doc.annotations.map((a) => (a.id === id && a.type === 'text' ? { ...a, text } : a)),
  }));
}

export function commitTextEdit() {
  const s = store.get();
  const id = s.editingTextId;
  if (!id) return;
  const a = s.doc?.annotations.find((x) => x.id === id);
  const empty = !a || a.type !== 'text' || a.text.trim() === '';
  store.set({ editingTextId: null });
  if (empty) {
    if (textEditIsNew) {
      cancelGesture();
    } else {
      updateLive((doc) => ({ ...doc, annotations: doc.annotations.filter((x) => x.id !== id) }));
      endGesture();
    }
    store.set({ selection: [] });
  } else {
    // Trim trailing whitespace lines.
    updateLive((doc) => ({
      ...doc,
      annotations: doc.annotations.map((x) => (x.id === id && x.type === 'text' ? { ...x, text: x.text.replace(/\s+$/, '') } : x)),
    }));
    endGesture();
  }
  textEditIsNew = false;
}

// ---------------------------------------------------------------------------
// Background

export function updateBackground(patch: Partial<BackgroundSettings>, key?: string) {
  commit(
    (doc) => {
      const background = { ...doc.background, ...patch };
      return { ...doc, background };
    },
    { key: key ?? `bg:${Object.keys(patch).join(',')}` },
  );
}

// ---------------------------------------------------------------------------
// Crop / rotate / resize

const CROP_RATIOS: Record<string, number | null> = {
  free: null,
  '1:1': 1,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '16:9': 16 / 9,
  '16:10': 16 / 10,
  '9:16': 9 / 16,
  '4:5': 4 / 5,
};

export const CROP_PRESETS = ['free', 'original', '1:1', '4:3', '3:2', '16:9', '9:16'];

export function startCrop() {
  const s = store.get();
  if (!s.doc) return;
  if (s.editingTextId) commitTextEdit();
  store.set({
    tool: 'crop',
    selection: [],
    crop: { rect: { x: 0, y: 0, w: s.doc.width, h: s.doc.height }, aspect: null, aspectId: 'free' },
    propertiesOpen: true,
  });
  fitView(true);
}

export function setCropRect(rect: Rect) {
  const s = store.get();
  if (!s.crop) return;
  store.set({ crop: { ...s.crop, rect } });
}

/** Largest rect with the given ratio centered inside `r`. */
function fitRatio(r: Rect, ratio: number): Rect {
  let w = r.w;
  let h = w / ratio;
  if (h > r.h) {
    h = r.h;
    w = h * ratio;
  }
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

export function setCropAspect(id: string) {
  const s = store.get();
  if (!s.crop || !s.doc) return;
  const ratio = id === 'original' ? s.doc.width / s.doc.height : CROP_RATIOS[id] ?? null;
  const bounds = { x: 0, y: 0, w: s.doc.width, h: s.doc.height };
  let rect = s.crop.rect;
  if (ratio) {
    // Fit inside the current crop first; if that gets tiny, use the whole image.
    rect = fitRatio(s.crop.rect, ratio);
    if (rect.w < s.doc.width * 0.2 && rect.h < s.doc.height * 0.2) rect = fitRatio(bounds, ratio);
  }
  store.set({ crop: { rect, aspect: ratio, aspectId: id } });
}

export function resetCrop() {
  const s = store.get();
  if (!s.crop || !s.doc) return;
  store.set({ crop: { rect: { x: 0, y: 0, w: s.doc.width, h: s.doc.height }, aspect: null, aspectId: 'free' } });
}

export function cancelCrop() {
  store.set({ crop: null, tool: 'select' });
  fitView(true);
}

export function applyCrop() {
  const s = store.get();
  if (!s.doc || !s.crop) return;
  const doc = s.doc;
  const raw = intersectRects(
    {
      x: Math.round(s.crop.rect.x),
      y: Math.round(s.crop.rect.y),
      w: Math.round(s.crop.rect.w),
      h: Math.round(s.crop.rect.h),
    },
    { x: 0, y: 0, w: doc.width, h: doc.height },
  );
  if (!raw || raw.w < 2 || raw.h < 2) {
    showToast('Crop area is too small.', 'error');
    return;
  }
  const r = raw;
  if (r.x === 0 && r.y === 0 && r.w === doc.width && r.h === doc.height) {
    cancelCrop();
    return;
  }
  const entry = cropImage(doc.imageId, r);
  const bounds = { x: 0, y: 0, w: r.w, h: r.h };
  commit((d) => ({
    ...d,
    imageId: entry.id,
    width: r.w,
    height: r.h,
    annotations: d.annotations
      .map((a) => transformAnnotation(a, (p) => ({ x: p.x - r.x, y: p.y - r.y }), d.unit, d.unit))
      .filter((a) => rectsIntersect(getBounds(a, d.unit), bounds) || getBounds(a, d.unit).w === 0),
  }));
  store.set({ crop: null, tool: 'select' });
  fitView(true);
}

export function rotate(dir: 1 | -1) {
  const s = store.get();
  if (!s.doc) return;
  commitTextEdit();
  const W = s.doc.width;
  const H = s.doc.height;
  const entry = rotateImage(s.doc.imageId, dir);
  const map = dir === 1 ? (p: Point) => ({ x: H - p.y, y: p.x }) : (p: Point) => ({ x: p.y, y: W - p.x });
  commit((d) => ({
    ...d,
    imageId: entry.id,
    width: H,
    height: W,
    annotations: d.annotations.map((a) => transformAnnotation(a, map, d.unit, d.unit)),
  }));
}

export function flip(axis: 'h' | 'v') {
  const s = store.get();
  if (!s.doc) return;
  commitTextEdit();
  const W = s.doc.width;
  const H = s.doc.height;
  const entry = flipImage(s.doc.imageId, axis);
  const map = axis === 'h' ? (p: Point) => ({ x: W - p.x, y: p.y }) : (p: Point) => ({ x: p.x, y: H - p.y });
  commit((d) => ({
    ...d,
    imageId: entry.id,
    annotations: d.annotations.map((a) => transformAnnotation(a, map, d.unit, d.unit)),
  }));
}

export function resizeDoc(width: number, height: number) {
  const s = store.get();
  if (!s.doc) return;
  const w = Math.round(width);
  const h = Math.round(height);
  if (w < 1 || h < 1) return;
  if (w === s.doc.width && h === s.doc.height) return;
  const { width: cw, height: ch, clamped } = clampExportSize(w, h);
  const sx = cw / s.doc.width;
  const sy = ch / s.doc.height;
  const entry = resizeImage(s.doc.imageId, cw, ch);
  commit((d) => {
    const unit = d.unit * Math.sqrt(sx * sy);
    return {
      ...d,
      imageId: entry.id,
      width: cw,
      height: ch,
      unit,
      annotations: d.annotations.map((a) => transformAnnotation(a, (p) => ({ x: p.x * sx, y: p.y * sy }), d.unit, unit)),
    };
  });
  showToast(clamped ? `Resized to ${cw} × ${ch} (browser limit)` : `Resized to ${cw} × ${ch}`, 'info');
}

// ---------------------------------------------------------------------------
// Export & clipboard

export function setExportPrefs(patch: Partial<ExportPrefs>) {
  store.set({ exportPrefs: { ...store.get().exportPrefs, ...patch } });
}

function scaledSize(doc: EditorDoc, scale: number) {
  const base = outputSize(doc);
  return clampExportSize(base.width * scale, base.height * scale);
}

export async function copyImageToClipboard() {
  const s = store.get();
  if (!s.doc) return;
  commitTextEdit();
  const doc = store.get().doc!;
  const { width, height } = scaledSize(doc, s.exportPrefs.scale);
  const blob = exportDocument(doc, { format: 'png', quality: 100, width, height }).then((r) => r.blob);
  try {
    await writeImageToClipboard(blob);
    showToast('Copied to clipboard');
  } catch (err) {
    console.warn(err);
    showToast('Clipboard access was blocked. Use Export instead.', 'error');
  }
}

export async function exportAndDownload(opts: { format: ExportFormat; quality: number; width: number; height: number }) {
  const doc = store.get().doc;
  if (!doc) return;
  commitTextEdit();
  store.set({ busy: 'Exporting…' });
  try {
    const result = await exportDocument(store.get().doc!, opts);
    const outcome = await downloadBlob(result.blob, exportFileName(doc, result.format));
    if (outcome === 'declined') {
      showToast('Save cancelled', 'info');
    } else if (result.format !== opts.format) {
      showToast(`${opts.format.toUpperCase()} isn’t supported here — saved as ${result.format.toUpperCase()}`, 'info');
    } else {
      showToast(`Saved ${result.width} × ${result.height} ${result.format.toUpperCase()}`);
    }
  } catch (err) {
    console.error(err);
    showToast('Export failed.', 'error');
  } finally {
    store.set({ busy: null });
  }
}

/** ⌘S: export with the last-used settings. */
export function quickSave() {
  const s = store.get();
  if (!s.doc) return;
  const { width, height } = scaledSize(s.doc, s.exportPrefs.scale);
  void exportAndDownload({ format: s.exportPrefs.format, quality: s.exportPrefs.quality, width, height });
}

// ---------------------------------------------------------------------------
// Preferences

export function setTheme(theme: Theme) {
  store.set({ theme });
}

export function setBackdrop(backdrop: Backdrop) {
  store.set({ backdrop });
}

export function setA11y(patch: Partial<A11yPrefs>) {
  store.set({ a11y: { ...store.get().a11y, ...patch } });
}

export function toggleProperties() {
  store.set({ propertiesOpen: !store.get().propertiesOpen });
}

export function openOverlay(overlay: 'export' | 'shortcuts' | null) {
  if (overlay) commitTextEdit();
  store.set({ overlay });
}

export { cancelGesture, beginGesture, endGesture, updateLive };

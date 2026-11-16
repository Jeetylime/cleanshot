import type {
  Annotation,
  ArrowAnnotation,
  EditorDoc,
  EllipseAnnotation,
  Point,
  RectAnnotation,
  StepAnnotation,
  TextAnnotation,
} from '../types';
import { luminance, normalizeRect, withAlpha } from '../lib/utils';
import { aspectValue, paintFill } from './backgrounds';
import { isPrivacy, stepNumbers } from './annotations';
import { FONT_FAMILY, measureText } from './text';
import { createCanvas, ctx2d, getDisplaySource, getImage } from './images';
import { getImageLayer, paintPrivacy } from './privacy';

export interface Layout {
  /** Output size in image-space pixels. */
  outW: number;
  outH: number;
  /** Offset of the image inside the output. */
  imgX: number;
  imgY: number;
}

export function computeLayout(doc: Pick<EditorDoc, 'width' | 'height' | 'background' | 'unit'>): Layout {
  const { width: w, height: h, background: bg, unit } = doc;
  if (!bg.enabled) return { outW: w, outH: h, imgX: 0, imgY: 0 };
  const p = Math.round(bg.padding * unit);
  let outW = w + p * 2;
  let outH = h + p * 2;
  const ar = aspectValue(bg.aspect);
  if (ar) {
    if (outW / outH > ar) outH = outW / ar;
    else outW = outH * ar;
  }
  outW = Math.round(outW);
  outH = Math.round(outH);
  return { outW, outH, imgX: Math.round((outW - w) / 2), imgY: Math.round((outH - h) / 2) };
}

// ---------------------------------------------------------------------------
// Image opacity detection (decides how the drop shadow is cast)

const opaqueCache = new Map<string, boolean>();

export function isImageOpaque(imageId: string): boolean {
  const cached = opaqueCache.get(imageId);
  if (cached !== undefined) return cached;
  const e = getImage(imageId);
  if (!e) return true;
  // Inspect a reduced copy; transparent margins (e.g. window captures with
  // shadows) survive downscaling, which is all we need to know.
  const k = Math.min(1, 1024 / Math.max(e.width, e.height));
  const c = createCanvas(Math.max(1, Math.round(e.width * k)), Math.max(1, Math.round(e.height * k)));
  const ctx = ctx2d(c, { willReadFrequently: true });
  ctx.drawImage(e.source, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let opaque = true;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < 250) {
      opaque = false;
      break;
    }
  }
  opaqueCache.set(imageId, opaque);
  return opaque;
}

// ---------------------------------------------------------------------------
// Screenshot frame (shadow + rounded image)

export function shadowParams(doc: EditorDoc) {
  const s = doc.background.shadow / 100;
  return {
    blur: (6 + 74 * s) * doc.unit,
    offsetY: (1 + 22 * s) * doc.unit,
    alpha: 0.1 + 0.42 * s,
  };
}

/**
 * Cast the screenshot's drop shadow without drawing the screenshot itself
 * (the shape is drawn far off-canvas and only its shadow is offset back).
 * `sx`/`sy` are the current device-pixel scale factors.
 */
export function drawImageShadow(ctx: CanvasRenderingContext2D, doc: EditorDoc, sx: number, sy: number) {
  if (doc.background.shadow <= 0) return;
  const { blur, offsetY, alpha } = shadowParams(doc);
  const w = doc.width;
  const h = doc.height;
  const r = Math.min(doc.background.radius * doc.unit, w / 2, h / 2);
  const shift = (w + h) * 3 + 2000;
  ctx.save();
  ctx.shadowColor = `rgba(0, 0, 0, ${alpha})`;
  ctx.shadowBlur = blur * ((sx + sy) / 2);
  ctx.shadowOffsetX = shift * sx;
  ctx.shadowOffsetY = offsetY * sy;
  ctx.translate(-shift, 0);
  if (isImageOpaque(doc.imageId)) {
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, r);
    ctx.fillStyle = '#000';
    ctx.fill();
  } else {
    const src = getDisplaySource(doc.imageId, (sx + sy) / 2);
    if (src) ctx.drawImage(src, 0, 0, w, h);
  }
  ctx.restore();
}

/**
 * Draw the screenshot (with privacy regions applied) at the image-space
 * origin, optionally clipped to rounded corners.
 *
 * - `export`: uses the full-resolution composite in which original pixels
 *   under privacy regions have been erased.
 * - `screen`: draws a display-resolution source and paints the privacy
 *   patches on top, which is much cheaper while interacting.
 */
export function drawScreenshot(
  ctx: CanvasRenderingContext2D,
  doc: EditorDoc,
  rounded: boolean,
  mode: 'export' | 'screen',
  pxScale: number,
) {
  const r = rounded ? Math.min(doc.background.radius * doc.unit, doc.width / 2, doc.height / 2) : 0;
  ctx.save();
  if (r > 0) {
    ctx.beginPath();
    ctx.roundRect(0, 0, doc.width, doc.height, r);
    ctx.clip();
  }
  if (mode === 'export') {
    const layer = getImageLayer(doc);
    if (layer) ctx.drawImage(layer, 0, 0);
  } else {
    const src = getDisplaySource(doc.imageId, pxScale);
    if (src) ctx.drawImage(src, 0, 0, doc.width, doc.height);
    paintPrivacy(ctx, doc, false);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Annotations

export interface RenderContext {
  unit: number;
  /** Device pixels per image-space pixel (for shadow sizes). */
  pxScale: number;
  steps: Map<string, number>;
}

function applyShadow(ctx: CanvasRenderingContext2D, rc: RenderContext, on: boolean, strength = 1) {
  if (!on) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    return;
  }
  ctx.shadowColor = `rgba(0, 0, 0, ${0.32 * strength})`;
  ctx.shadowBlur = 5 * rc.unit * rc.pxScale;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1.5 * rc.unit * rc.pxScale;
}

/** Build a closed path through `pts`, rounding each corner by its radius. */
function roundedPolygon(ctx: CanvasRenderingContext2D, pts: [Point, number][]) {
  const n = pts.length;
  const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(pts[n - 1][0], pts[0][0]);
  ctx.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const [p, r] = pts[i];
    const prev = pts[(i - 1 + n) % n][0];
    const next = pts[(i + 1) % n][0];
    const maxR = Math.min(Math.hypot(p.x - prev.x, p.y - prev.y), Math.hypot(next.x - p.x, next.y - p.y)) / 2;
    const rr = Math.max(0, Math.min(r, maxR));
    if (rr < 0.01) ctx.lineTo(p.x, p.y);
    else ctx.arcTo(p.x, p.y, next.x, next.y, rr);
  }
  ctx.closePath();
}

function drawArrow(ctx: CanvasRenderingContext2D, a: ArrowAnnotation, rc: RenderContext) {
  const sw = a.strokeWidth * rc.unit;
  const dx = a.end.x - a.start.x;
  const dy = a.end.y - a.start.y;
  const L = Math.hypot(dx, dy);
  if (L < 0.5) return;
  const ux = dx / L;
  const uy = dy / L;
  const px = -uy;
  const py = ux;
  const P = (o: Point, along: number, side: number): Point => ({
    x: o.x + ux * along + px * side,
    y: o.y + uy * along + py * side,
  });

  ctx.fillStyle = a.color;
  ctx.strokeStyle = a.color;
  applyShadow(ctx, rc, a.shadow);

  if (a.heads === 'none') {
    ctx.lineWidth = sw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.start.x, a.start.y);
    ctx.lineTo(a.end.x, a.end.y);
    ctx.stroke();
    return;
  }

  let head = Math.max(sw * 3.1, 8 * rc.unit);
  const maxHead = L * (a.heads === 'both' ? 0.42 : 0.75);
  if (head > maxHead) head = maxHead;
  const half = head * 0.56;
  const neck = head * 0.74;
  const t1 = Math.min(sw * 0.5, half * 0.55);
  const rr = sw * 0.32;

  ctx.beginPath();
  if (a.heads === 'end') {
    const t0 = Math.max(sw * 0.2, 0.75 * rc.unit);
    roundedPolygon(ctx, [
      [P(a.start, -t0, t0), t0],
      [P(a.end, -neck, t1), 0],
      [P(a.end, -head, half), rr],
      [a.end, rr],
      [P(a.end, -head, -half), rr],
      [P(a.end, -neck, -t1), 0],
      [P(a.start, -t0, -t0), t0],
    ]);
  } else {
    roundedPolygon(ctx, [
      [P(a.end, -neck, t1), 0],
      [P(a.end, -head, half), rr],
      [a.end, rr],
      [P(a.end, -head, -half), rr],
      [P(a.end, -neck, -t1), 0],
      [P(a.start, neck, -t1), 0],
      [P(a.start, head, -half), rr],
      [a.start, rr],
      [P(a.start, head, half), rr],
      [P(a.start, neck, t1), 0],
    ]);
  }
  ctx.fill();
}

const FILL_TINT_ALPHA = 0.18;

function drawRect(ctx: CanvasRenderingContext2D, a: RectAnnotation, rc: RenderContext) {
  const r = normalizeRect(a);
  const sw = a.strokeWidth * rc.unit;
  const radius = Math.min(a.radius * rc.unit, r.w / 2, r.h / 2);
  if (a.fill === 'solid') {
    applyShadow(ctx, rc, a.shadow);
    ctx.fillStyle = a.color;
    ctx.beginPath();
    ctx.roundRect(r.x - sw / 2, r.y - sw / 2, r.w + sw, r.h + sw, radius + sw / 2);
    ctx.fill();
    return;
  }
  if (a.fill === 'tint') {
    applyShadow(ctx, rc, false);
    ctx.fillStyle = withAlpha(a.color, FILL_TINT_ALPHA);
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, radius);
    ctx.fill();
  }
  applyShadow(ctx, rc, a.shadow);
  ctx.strokeStyle = a.color;
  ctx.lineWidth = sw;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  ctx.stroke();
}

function drawEllipse(ctx: CanvasRenderingContext2D, a: EllipseAnnotation, rc: RenderContext) {
  const r = normalizeRect(a);
  const sw = a.strokeWidth * rc.unit;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  if (a.fill === 'solid') {
    applyShadow(ctx, rc, a.shadow);
    ctx.fillStyle = a.color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r.w / 2 + sw / 2, r.h / 2 + sw / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (a.fill === 'tint') {
    applyShadow(ctx, rc, false);
    ctx.fillStyle = withAlpha(a.color, FILL_TINT_ALPHA);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  applyShadow(ctx, rc, a.shadow);
  ctx.strokeStyle = a.color;
  ctx.lineWidth = sw;
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.1, r.w / 2), Math.max(0.1, r.h / 2), 0, 0, Math.PI * 2);
  ctx.stroke();
}

/** Smooth polyline using quadratic curves through segment midpoints. */
export function tracePolyline(ctx: CanvasRenderingContext2D, pts: Point[]) {
  if (!pts.length) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) {
    ctx.lineTo(pts[0].x + 0.01, pts[0].y);
    return;
  }
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

function contrastColor(hex: string): string {
  return luminance(hex) > 0.45 ? '#111114' : '#ffffff';
}

function drawText(ctx: CanvasRenderingContext2D, a: TextAnnotation, rc: RenderContext) {
  const m = measureText(a, rc.unit);
  ctx.font = m.font;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const gx = a.x + m.padX;
  const gy = a.y + m.padY;
  let fill = a.color;

  if (a.style === 'filled') {
    applyShadow(ctx, rc, a.shadow);
    ctx.fillStyle = a.color;
    ctx.beginPath();
    ctx.roundRect(a.x, a.y, m.width, m.height, Math.min(m.fontSize * 0.32, m.height / 2));
    ctx.fill();
    applyShadow(ctx, rc, false);
    fill = contrastColor(a.color);
  } else if (a.style === 'outline') {
    applyShadow(ctx, rc, a.shadow, 0.8);
    ctx.strokeStyle = contrastColor(a.color);
    ctx.lineWidth = Math.max(1, m.fontSize * 0.17);
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    m.lines.forEach((line, i) => ctx.strokeText(line, gx, gy + i * m.lineHeight + m.baseline));
    applyShadow(ctx, rc, false);
  } else {
    applyShadow(ctx, rc, a.shadow, 0.7);
  }

  ctx.fillStyle = fill;
  m.lines.forEach((line, i) => ctx.fillText(line, gx, gy + i * m.lineHeight + m.baseline));
}

function drawStep(ctx: CanvasRenderingContext2D, a: StepAnnotation, rc: RenderContext) {
  const r = (a.size * rc.unit) / 2;
  const n = rc.steps.get(a.id) ?? 1;
  applyShadow(ctx, rc, a.shadow);
  ctx.fillStyle = a.color;
  ctx.beginPath();
  ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
  ctx.fill();
  applyShadow(ctx, rc, false);
  // Subtle inner ring for definition on busy backgrounds.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.beginPath();
  ctx.arc(a.x, a.y, r - ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.stroke();

  const label = String(n);
  const fs = r * (label.length > 1 ? 0.95 : 1.1);
  ctx.font = `700 ${fs}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = contrastColor(a.color);
  const mm = ctx.measureText(label);
  const asc = mm.actualBoundingBoxAscent;
  const desc = mm.actualBoundingBoxDescent;
  ctx.fillText(label, a.x, a.y + (asc - desc) / 2);
}

export function drawAnnotation(ctx: CanvasRenderingContext2D, a: Annotation, rc: RenderContext) {
  if (isPrivacy(a)) return; // baked into the image layer
  ctx.save();
  ctx.globalAlpha = a.opacity;
  switch (a.type) {
    case 'arrow':
      drawArrow(ctx, a, rc);
      break;
    case 'rect':
      drawRect(ctx, a, rc);
      break;
    case 'ellipse':
      drawEllipse(ctx, a, rc);
      break;
    case 'pen': {
      applyShadow(ctx, rc, a.shadow);
      ctx.strokeStyle = a.color;
      ctx.lineWidth = a.strokeWidth * rc.unit;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      tracePolyline(ctx, a.points);
      ctx.stroke();
      break;
    }
    case 'marker': {
      ctx.strokeStyle = a.color;
      ctx.lineWidth = a.strokeWidth * rc.unit;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      tracePolyline(ctx, a.points);
      ctx.stroke();
      break;
    }
    case 'highlight': {
      const r = normalizeRect(a);
      ctx.fillStyle = a.color;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(3 * rc.unit, r.w / 2, r.h / 2));
      ctx.fill();
      break;
    }
    case 'text':
      drawText(ctx, a, rc);
      break;
    case 'step':
      drawStep(ctx, a, rc);
      break;
  }
  ctx.restore();
}

export function drawAnnotations(ctx: CanvasRenderingContext2D, doc: EditorDoc, pxScale: number) {
  const rc: RenderContext = { unit: doc.unit, pxScale, steps: stepNumbers(doc.annotations) };
  for (const a of doc.annotations) drawAnnotation(ctx, a, rc);
}

// ---------------------------------------------------------------------------
// Full-resolution document rendering (export, thumbnails, clipboard)

export interface RenderOptions {
  width: number;
  height: number;
  /** Fill with white first (formats without alpha). */
  matte?: string | null;
}

export function renderDocument(doc: EditorDoc, opts: RenderOptions): HTMLCanvasElement {
  const L = computeLayout(doc);
  const sx = opts.width / L.outW;
  const sy = opts.height / L.outH;
  const canvas = createCanvas(opts.width, opts.height);
  const ctx = ctx2d(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (opts.matte) {
    ctx.fillStyle = opts.matte;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.setTransform(sx, 0, 0, sy, 0, 0);
  const bg = doc.background;
  if (bg.enabled) paintFill(ctx, bg.fill, L.outW, L.outH);
  ctx.translate(L.imgX, L.imgY);

  if (bg.enabled) drawImageShadow(ctx, doc, sx, sy);
  drawScreenshot(ctx, doc, bg.enabled, 'export', (sx + sy) / 2);

  ctx.save();
  ctx.beginPath();
  ctx.rect(-L.imgX, -L.imgY, L.outW, L.outH);
  ctx.clip();
  drawAnnotations(ctx, doc, (sx + sy) / 2);
  ctx.restore();
  return canvas;
}

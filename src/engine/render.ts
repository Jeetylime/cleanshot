import type {
  Annotation,
  ArrowAnnotation,
  EditorDoc,
  EllipseAnnotation,
  HighlightAnnotation,
  MagnifyAnnotation,
  MeasureAnnotation,
  Point,
  RectAnnotation,
  StepAnnotation,
  TextAnnotation,
} from '../types';
import { luminance, normalizeRect, withAlpha } from '../lib/utils';
import { aspectValue, paintFill } from './backgrounds';
import { arrowControl, isPrivacy, magnifySourceRadius, measureLength, stepNumbers } from './annotations';
import { FONT_FAMILY, measureText } from './text';
import { createCanvas, ctx2d, getDisplaySource, getImage } from './images';
import { getImageLayer, paintPrivacy } from './privacy';
import { deviceBody, deviceInsets, drawDevice, screenRadii } from './devices';

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
  const i = deviceInsets(doc);
  const boxW = w + i.l + i.r;
  const boxH = h + i.t + i.b;
  let outW = boxW + p * 2;
  let outH = boxH + p * 2;
  const ar = aspectValue(bg.aspect);
  if (ar) {
    if (outW / outH > ar) outH = outW / ar;
    else outW = outH * ar;
  }
  outW = Math.round(outW);
  outH = Math.round(outH);
  return { outW, outH, imgX: Math.round((outW - boxW) / 2) + i.l, imgY: Math.round((outH - boxH) / 2) + i.t };
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
  const body = deviceBody(doc);
  if (body) {
    ctx.beginPath();
    ctx.roundRect(body.x, body.y, body.w, body.h, body.r);
    ctx.fillStyle = '#000';
    ctx.fill();
  } else if (isImageOpaque(doc.imageId)) {
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
  const radii = rounded ? screenRadii(doc) : null;
  const r = rounded ? Math.min(doc.background.radius * doc.unit, doc.width / 2, doc.height / 2) : 0;
  ctx.save();
  if (radii ? radii.some((v) => v > 0) : r > 0) {
    ctx.beginPath();
    ctx.roundRect(0, 0, doc.width, doc.height, radii ?? r);
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
  /**
   * The image with privacy regions already erased, for annotations that show
   * image pixels (the magnifier). Never the raw image: a lens over a blurred
   * area must not reveal what is under it.
   */
  source?: () => CanvasImageSource | null;
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

function drawCurvedArrow(ctx: CanvasRenderingContext2D, a: ArrowAnnotation, rc: RenderContext, c: Point) {
  const sw = a.strokeWidth * rc.unit;
  const unitVec = (from: Point, to: Point) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const L = Math.hypot(dx, dy) || 1;
    return { x: dx / L, y: dy / L };
  };
  const chord = Math.hypot(a.end.x - a.start.x, a.end.y - a.start.y);
  const head = Math.min(Math.max(sw * 3.1, 8 * rc.unit), chord * 0.4);
  const half = head * 0.56;
  const tEnd = unitVec(c, a.end);
  const tStart = unitVec(c, a.start);
  const both = a.heads === 'both';
  const s0 = both ? { x: a.start.x - tStart.x * head * 0.7, y: a.start.y - tStart.y * head * 0.7 } : a.start;
  const e0 = { x: a.end.x - tEnd.x * head * 0.7, y: a.end.y - tEnd.y * head * 0.7 };

  ctx.strokeStyle = a.color;
  ctx.fillStyle = a.color;
  applyShadow(ctx, rc, a.shadow);
  ctx.lineWidth = sw;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(s0.x, s0.y);
  ctx.quadraticCurveTo(c.x, c.y, e0.x, e0.y);
  ctx.stroke();
  const tip = (p: Point, t: Point) => {
    const bx = p.x - t.x * head;
    const by = p.y - t.y * head;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(bx - t.y * half, by + t.x * half);
    ctx.quadraticCurveTo(p.x - t.x * head * 0.72, p.y - t.y * head * 0.72, bx + t.y * half, by - t.x * half);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = sw * 0.35;
    ctx.fill();
    ctx.stroke();
  };
  tip(a.end, tEnd);
  if (both) tip(a.start, tStart);
}

function drawMeasure(ctx: CanvasRenderingContext2D, a: MeasureAnnotation, rc: RenderContext) {
  const sw = a.strokeWidth * rc.unit;
  const dx = a.end.x - a.start.x;
  const dy = a.end.y - a.start.y;
  const L = Math.hypot(dx, dy);
  if (L < 0.5) return;
  const nx = -dy / L;
  const ny = dx / L;
  const tick = Math.max(6 * rc.unit, sw * 3);
  ctx.strokeStyle = a.color;
  ctx.lineWidth = sw;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.start.x, a.start.y);
  ctx.lineTo(a.end.x, a.end.y);
  for (const p of [a.start, a.end]) {
    ctx.moveTo(p.x + nx * tick, p.y + ny * tick);
    ctx.lineTo(p.x - nx * tick, p.y - ny * tick);
  }
  ctx.stroke();

  const label = `${Math.round(measureLength(a, rc.unit))} px`;
  const fs = 12 * rc.unit;
  ctx.font = `600 ${fs}px ${FONT_FAMILY}`;
  const tw = ctx.measureText(label).width;
  const padX = 6 * rc.unit;
  const h = fs + 8 * rc.unit;
  const mx = (a.start.x + a.end.x) / 2;
  const my = (a.start.y + a.end.y) / 2;
  applyShadow(ctx, rc, true, 0.6);
  ctx.fillStyle = a.color;
  ctx.beginPath();
  ctx.roundRect(mx - tw / 2 - padX, my - h / 2, tw + padX * 2, h, h / 2);
  ctx.fill();
  applyShadow(ctx, rc, false);
  ctx.fillStyle = contrastColor(a.color);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, mx, my + 0.5 * rc.unit);
}

function drawMagnify(ctx: CanvasRenderingContext2D, a: MagnifyAnnotation, rc: RenderContext) {
  const r = normalizeRect(a);
  if (r.w < 1 || r.h < 1) return;
  const zoom = Math.max(1, a.zoom);
  const sw = a.strokeWidth * rc.unit;
  const circle = a.shape === 'circle';
  const side = Math.min(r.w, r.h);
  const lens = circle ? { x: r.x + (r.w - side) / 2, y: r.y + (r.h - side) / 2, w: side, h: side } : r;
  const lcx = lens.x + lens.w / 2;
  const lcy = lens.y + lens.h / 2;
  const srcW = lens.w / zoom;
  const srcH = lens.h / zoom;
  const radius = circle ? side / 2 : Math.min(12 * rc.unit, lens.w / 2, lens.h / 2);
  const shapePath = (x: number, y: number, w: number, h: number, rr: number) => {
    ctx.beginPath();
    if (circle) ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    else ctx.roundRect(x, y, w, h, rr);
  };

  // Source outline and connector.
  ctx.strokeStyle = a.color;
  ctx.lineWidth = Math.max(1, sw * 0.6);
  applyShadow(ctx, rc, a.shadow, 0.6);
  shapePath(a.sx - srcW / 2, a.sy - srcH / 2, srcW, srcH, radius / zoom);
  ctx.stroke();
  const dx = lcx - a.sx;
  const dy = lcy - a.sy;
  const d = Math.hypot(dx, dy);
  const srcR = magnifySourceRadius({ w: lens.w, h: lens.h, zoom });
  const lensR = Math.min(lens.w, lens.h) / 2;
  if (d > srcR + lensR + 2) {
    const ux = dx / d;
    const uy = dy / d;
    ctx.beginPath();
    ctx.moveTo(a.sx + ux * srcR, a.sy + uy * srcR);
    ctx.lineTo(lcx - ux * lensR, lcy - uy * lensR);
    ctx.stroke();
  }

  // Lens.
  applyShadow(ctx, rc, a.shadow);
  ctx.fillStyle = '#ffffff';
  shapePath(lens.x, lens.y, lens.w, lens.h, radius);
  ctx.fill();
  applyShadow(ctx, rc, false);
  const src = rc.source?.();
  if (src) {
    ctx.save();
    shapePath(lens.x, lens.y, lens.w, lens.h, radius);
    ctx.clip();
    ctx.imageSmoothingEnabled = zoom < 3;
    ctx.drawImage(src, a.sx - srcW / 2, a.sy - srcH / 2, srcW, srcH, lens.x, lens.y, lens.w, lens.h);
    ctx.restore();
  }
  ctx.strokeStyle = a.color;
  ctx.lineWidth = sw;
  shapePath(lens.x, lens.y, lens.w, lens.h, radius);
  ctx.stroke();
}

function drawArrow(ctx: CanvasRenderingContext2D, a: ArrowAnnotation, rc: RenderContext) {
  const control = a.heads !== 'none' ? arrowControl(a) : null;
  if (control) {
    drawCurvedArrow(ctx, a, rc, control);
    return;
  }
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
      // Spotlights are painted together, beneath everything, by drawSpotlights.
      if (a.spotlight) break;
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
    case 'measure':
      drawMeasure(ctx, a, rc);
      break;
    case 'magnify':
      drawMagnify(ctx, a, rc);
      break;
  }
  ctx.restore();
}

export function drawAnnotations(ctx: CanvasRenderingContext2D, doc: EditorDoc, pxScale: number) {
  let layer: CanvasImageSource | null | undefined;
  const rc: RenderContext = {
    unit: doc.unit,
    pxScale,
    steps: stepNumbers(doc.annotations),
    source: () => (layer === undefined ? (layer = getImageLayer(doc)) : layer),
  };
  drawSpotlights(ctx, doc, rc);
  for (const a of doc.annotations) drawAnnotation(ctx, a, rc);
}

let spotlightLayer: HTMLCanvasElement | null = null;

/**
 * Dim the image outside every spotlight box. The holes are cut from one dim
 * layer, so overlapping spotlights merge instead of re-darkening their overlap.
 * The first spotlight's color and opacity set the dim.
 */
function drawSpotlights(ctx: CanvasRenderingContext2D, doc: EditorDoc, rc: RenderContext) {
  const spots = doc.annotations.filter((a): a is HighlightAnnotation => a.type === 'highlight' && !!a.spotlight);
  if (!spots.length) return;
  const { width: cw, height: ch } = ctx.canvas;
  spotlightLayer ??= createCanvas(1, 1);
  const layer = spotlightLayer;
  if (layer.width !== cw || layer.height !== ch) {
    layer.width = cw;
    layer.height = ch;
  }
  const lc = ctx2d(layer);
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.clearRect(0, 0, cw, ch);
  lc.setTransform(ctx.getTransform());
  lc.globalCompositeOperation = 'source-over';
  lc.fillStyle = spots[0].color;
  lc.fillRect(0, 0, doc.width, doc.height);
  lc.globalCompositeOperation = 'destination-out';
  lc.fillStyle = '#000';
  for (const a of spots) {
    const r = normalizeRect(a);
    lc.beginPath();
    lc.roundRect(r.x, r.y, r.w, r.h, Math.min(6 * rc.unit, r.w / 2, r.h / 2));
    lc.fill();
  }
  lc.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = spots[0].opacity;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
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
  if (bg.enabled) drawDevice(ctx, doc);
  drawScreenshot(ctx, doc, bg.enabled, 'export', (sx + sy) / 2);

  ctx.save();
  ctx.beginPath();
  ctx.rect(-L.imgX, -L.imgY, L.outW, L.outH);
  ctx.clip();
  drawAnnotations(ctx, doc, (sx + sy) / 2);
  ctx.restore();
  return canvas;
}

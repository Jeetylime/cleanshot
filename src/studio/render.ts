import { brushOf, strokePathD } from './draw';
import { createCanvas, ctx2d, getImage, getMipLevel } from '../engine/images';
import { paintFill } from '../engine/backgrounds';
import { ICONS } from './iconData';
import { adjustedImage, isIdentity } from './imageFx';
import { drawChart, drawQr } from './extraRender';
import { layoutText, linearGradientFor, type CharStyle } from './textEngine';
import { fontCss } from './fonts';
import type { DrawElement, IconElement, ImageElement, LineElement, ShapeElement, ShapeKind, StudioDoc, StudioElement, StudioFill, TextElement } from './types';

/**
 * Scene renderer shared by the editor stage, thumbnails and export, so what
 * you see is exactly what you download. All drawing happens in canvas
 * (design) pixels; `scale` is the number of device pixels per design pixel
 * and is only needed for effects the canvas transform doesn't scale
 * (shadows) and for choosing image resolutions.
 */

// ---------------------------------------------------------------------------
// Text layout

export { layoutText, naturalTextWidth } from './textEngine';
export type { TextLayout } from './textEngine';

// ---------------------------------------------------------------------------
// Fills

const patternCache = new Map<string, HTMLCanvasElement>();

function patternTile(f: Extract<StudioFill, { kind: 'pattern' }>, px: number): HTMLCanvasElement {
  const size = Math.max(4, Math.round(f.size * px));
  const key = `${f.pattern}|${f.bg}|${f.fg}|${size}`;
  let tile = patternCache.get(key);
  if (tile) return tile;
  tile = createCanvas(size, size);
  const c = ctx2d(tile);
  c.fillStyle = f.bg;
  c.fillRect(0, 0, size, size);
  c.fillStyle = f.fg;
  c.strokeStyle = f.fg;
  switch (f.pattern) {
    case 'dots':
      c.beginPath();
      c.arc(size / 2, size / 2, size * 0.14, 0, Math.PI * 2);
      c.fill();
      break;
    case 'grid':
      c.lineWidth = Math.max(1, size * 0.05);
      c.strokeRect(0, 0, size, size);
      break;
    case 'stripes':
      c.lineWidth = size * 0.25;
      c.beginPath();
      for (const o of [-size, 0, size]) {
        c.moveTo(o, size);
        c.lineTo(o + size, 0);
      }
      c.stroke();
      break;
    case 'checks':
      c.fillRect(0, 0, size / 2, size / 2);
      c.fillRect(size / 2, size / 2, size / 2, size / 2);
      break;
  }
  if (patternCache.size > 40) patternCache.clear();
  patternCache.set(key, tile);
  return tile;
}

export function paintStudioFill(ctx: CanvasRenderingContext2D, f: StudioFill, w: number, h: number, scale: number) {
  if (f.kind === 'pattern') {
    const tile = patternTile(f, scale);
    const p = ctx.createPattern(tile, 'repeat');
    if (!p) return;
    const k = 1 / (tile.width / f.size);
    p.setTransform(new DOMMatrix().scale(k));
    ctx.fillStyle = p;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  paintFill(ctx, f, w, h);
}

/** CSS preview of a fill for swatches. */
export function studioFillCss(f: StudioFill): string {
  switch (f.kind) {
    case 'transparent':
      return 'repeating-conic-gradient(#8a8a90 0% 25%, #c8c8cc 0% 50%) 50% / 10px 10px';
    case 'solid':
      return f.color;
    case 'gradient':
      return `linear-gradient(${f.angle}deg, ${f.from}, ${f.to})`;
    case 'pattern': {
      const s = 12;
      switch (f.pattern) {
        case 'dots':
          return `radial-gradient(${f.fg} 18%, transparent 20%) 0 0 / ${s}px ${s}px, ${f.bg}`;
        case 'grid':
          return `linear-gradient(${f.fg} 1px, transparent 1px) 0 0 / ${s}px ${s}px, linear-gradient(90deg, ${f.fg} 1px, transparent 1px) 0 0 / ${s}px ${s}px, ${f.bg}`;
        case 'stripes':
          return `repeating-linear-gradient(45deg, ${f.fg} 0 3px, ${f.bg} 3px 8px)`;
        case 'checks':
          return `repeating-conic-gradient(${f.fg} 0% 25%, ${f.bg} 0% 50%) 50% / ${s}px ${s}px`;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Element painters

function applyShadow(ctx: CanvasRenderingContext2D, e: StudioElement, scale: number) {
  const s = e.shadow;
  if (!s.enabled) return;
  const a = Math.round(Math.max(0, Math.min(1, s.opacity)) * 255)
    .toString(16)
    .padStart(2, '0');
  ctx.shadowColor = /^#[0-9a-f]{6}$/i.test(s.color) ? s.color + a : s.color;
  ctx.shadowBlur = s.blur * scale;
  ctx.shadowOffsetX = s.x * scale;
  ctx.shadowOffsetY = s.y * scale;
}

function clearShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (rr <= 0) ctx.rect(x, y, w, h);
  else ctx.roundRect(x, y, w, h, rr);
}

/** The drawing calls a shape outline needs; a canvas context or the SVG path builder. */
export interface PathSink {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number): void;
  quadraticCurveTo(a: number, b: number, x: number, y: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number): void;
  roundRect(x: number, y: number, w: number, h: number, r: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  closePath(): void;
}

export function shapePath(ctx: PathSink, e: Pick<ShapeElement, 'shape' | 'w' | 'h' | 'radius'>) {
  pathFor(ctx, e.shape, e.w, e.h, e.radius);
}

export function pathFor(ctx: PathSink, shape: ShapeKind, w: number, h: number, radius: number) {
  ctx.beginPath();
  switch (shape) {
    case 'rect': {
      const rr = Math.max(0, Math.min(radius, w / 2, h / 2));
      if (rr <= 0) ctx.rect(0, 0, w, h);
      else ctx.roundRect(0, 0, w, h, rr);
      return;
    }
    case 'ellipse':
      ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      return;
    case 'triangle':
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      return;
    case 'diamond':
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w, h / 2);
      ctx.lineTo(w / 2, h);
      ctx.lineTo(0, h / 2);
      ctx.closePath();
      return;
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const x = w / 2 + (w / 2) * Math.cos(a);
        const y = h / 2 + (h / 2) * Math.sin(a);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      return;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (Math.PI / 5) * i;
        const r = i % 2 ? 0.42 : 1;
        const x = w / 2 + (w / 2) * r * Math.cos(a);
        const y = h / 2 + (h / 2) * r * Math.sin(a) * 1.05 + h * 0.025;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      return;
    case 'heart':
      ctx.moveTo(w / 2, h * 0.28);
      ctx.bezierCurveTo(w * 0.5, h * 0.05, w * 0.05, h * -0.02, w * 0.02, h * 0.32);
      ctx.bezierCurveTo(0, h * 0.58, w * 0.3, h * 0.78, w / 2, h);
      ctx.bezierCurveTo(w * 0.7, h * 0.78, w, h * 0.58, w * 0.98, h * 0.32);
      ctx.bezierCurveTo(w * 0.95, h * -0.02, w * 0.5, h * 0.05, w / 2, h * 0.28);
      ctx.closePath();
      return;
    case 'bubble': {
      const bh = h * 0.8;
      const r = Math.min(w, bh) * 0.2;
      ctx.moveTo(r, 0);
      ctx.lineTo(w - r, 0);
      ctx.quadraticCurveTo(w, 0, w, r);
      ctx.lineTo(w, bh - r);
      ctx.quadraticCurveTo(w, bh, w - r, bh);
      ctx.lineTo(w * 0.42, bh);
      ctx.lineTo(w * 0.22, h);
      ctx.lineTo(w * 0.26, bh);
      ctx.lineTo(r, bh);
      ctx.quadraticCurveTo(0, bh, 0, bh - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      return;
    }
  }
}

function drawShape(ctx: CanvasRenderingContext2D, e: ShapeElement, scale: number) {
  shapePath(ctx, e);
  applyShadow(ctx, e, scale);
  if (e.gradient || e.fill) {
    ctx.fillStyle = e.gradient ? linearGradientFor(ctx, e.gradient, e.w, e.h) : e.fill!;
    ctx.fill();
    clearShadow(ctx);
  }
  if (e.stroke && e.strokeWidth > 0) {
    ctx.strokeStyle = e.stroke;
    ctx.lineWidth = e.strokeWidth;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function drawLine(ctx: CanvasRenderingContext2D, e: LineElement, scale: number) {
  const y = e.h / 2;
  const head = e.strokeWidth * 2.6 + 6;
  const x0 = e.startHead ? head * 0.8 : 0;
  const x1 = e.endHead ? e.w - head * 0.8 : e.w;
  applyShadow(ctx, e, scale);
  ctx.strokeStyle = e.color;
  ctx.fillStyle = e.color;
  ctx.lineWidth = e.strokeWidth;
  ctx.lineCap = e.dash === 'dotted' ? 'round' : 'butt';
  ctx.setLineDash(e.dash === 'dashed' ? [e.strokeWidth * 3, e.strokeWidth * 2] : e.dash === 'dotted' ? [0.01, e.strokeWidth * 2] : []);
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(Math.max(x0, x1), y);
  ctx.stroke();
  ctx.setLineDash([]);
  const arrow = (tipX: number, dir: 1 | -1) => {
    ctx.beginPath();
    ctx.moveTo(tipX, y);
    ctx.lineTo(tipX - dir * head, y - head * 0.55);
    ctx.lineTo(tipX - dir * head, y + head * 0.55);
    ctx.closePath();
    ctx.fill();
  };
  if (e.endHead) arrow(e.w, 1);
  if (e.startHead) arrow(0, -1);
}

const pathCache = new Map<string, Path2D>();
function iconPath(name: string): Path2D | null {
  const d = ICONS[name];
  if (!d) return null;
  let p = pathCache.get(name);
  if (!p) {
    p = new Path2D(d);
    pathCache.set(name, p);
  }
  return p;
}

function drawIcon(ctx: CanvasRenderingContext2D, e: IconElement, scale: number) {
  const p = iconPath(e.icon);
  if (!p) return;
  const k = Math.min(e.w, e.h) / 24;
  ctx.save();
  ctx.translate((e.w - 24 * k) / 2, (e.h - 24 * k) / 2);
  ctx.scale(k, k);
  applyShadow(ctx, e, scale);
  if (e.filled) {
    ctx.fillStyle = e.color;
    ctx.fill(p);
  }
  ctx.strokeStyle = e.color;
  ctx.lineWidth = e.weight;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(p);
  ctx.restore();
}

function imageOutline(ctx: CanvasRenderingContext2D, e: ImageElement) {
  if (e.mask && e.mask !== 'rect') pathFor(ctx, e.mask, e.w, e.h, e.radius);
  else roundRectPath(ctx, 0, 0, e.w, e.h, e.radius);
}

/** An empty frame: a soft placeholder in the frame's shape. */
function paintFramePlaceholder(ctx: CanvasRenderingContext2D, e: ImageElement) {
  imageOutline(ctx, e);
  ctx.fillStyle = 'rgba(142,142,150,0.28)';
  ctx.fill();
  ctx.setLineDash([Math.max(4, e.w / 40), Math.max(3, e.w / 60)]);
  ctx.strokeStyle = 'rgba(142,142,150,0.9)';
  ctx.lineWidth = Math.max(1.5, Math.min(e.w, e.h) / 120);
  ctx.stroke();
  ctx.setLineDash([]);
  const icon = iconPath('camera');
  if (icon) {
    const k = Math.min(e.w, e.h) / 24 / 4;
    ctx.save();
    ctx.translate(e.w / 2 - 12 * k, e.h / 2 - 12 * k);
    ctx.scale(k, k);
    ctx.strokeStyle = 'rgba(142,142,150,0.95)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(icon);
    ctx.restore();
  }
}

let showPlaceholders = true;

function paintImageContent(ctx: CanvasRenderingContext2D, e: ImageElement, scale: number) {
  if (!e.assetId) {
    if (showPlaceholders) paintFramePlaceholder(ctx, e);
    return;
  }
  const entry = getImage(e.assetId);
  ctx.save();
  if (e.flipX || e.flipY) {
    ctx.translate(e.flipX ? e.w : 0, e.flipY ? e.h : 0);
    ctx.scale(e.flipX ? -1 : 1, e.flipY ? -1 : 1);
  }
  imageOutline(ctx, e);
  ctx.save();
  ctx.clip();
  const adjusted = entry && !isIdentity(e.adjust) ? adjustedImage(e.assetId, e.crop, e.adjust!, e.w * scale, e.h * scale, scale) : null;
  if (adjusted) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(adjusted, 0, 0, e.w, e.h);
  } else if (entry) {
    const devicePerSource = (e.w / e.crop.w) * scale;
    const k = devicePerSource >= 0.5 ? 0 : Math.min(6, Math.floor(Math.log2(1 / devicePerSource)));
    const lvl = getMipLevel(e.assetId, k) ?? { source: entry.source, factor: 1 };
    const f = lvl.factor;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(lvl.source, e.crop.x / f, e.crop.y / f, e.crop.w / f, e.crop.h / f, 0, 0, e.w, e.h);
  } else {
    ctx.fillStyle = '#8888';
    ctx.fillRect(0, 0, e.w, e.h);
  }
  ctx.restore();
  if (e.borderWidth > 0) {
    if (e.mask && e.mask !== 'rect') {
      // Stroke inside the shape: clip, then draw a double-width stroke.
      imageOutline(ctx, e);
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = e.borderColor;
      ctx.lineWidth = e.borderWidth * 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    } else {
      roundRectPath(ctx, e.borderWidth / 2, e.borderWidth / 2, e.w - e.borderWidth, e.h - e.borderWidth, Math.max(0, e.radius - e.borderWidth / 2));
      ctx.strokeStyle = e.borderColor;
      ctx.lineWidth = e.borderWidth;
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Offscreen renders of shadowed images, reused while the element is unchanged
// (elements are immutable, so identity is a safe cache key).
const shadowCache = new WeakMap<ImageElement, { k: number; canvas: HTMLCanvasElement }>();

function drawImage(ctx: CanvasRenderingContext2D, e: ImageElement, scale: number) {
  if (!e.shadow.enabled) {
    paintImageContent(ctx, e, scale);
    return;
  }
  // Render the clipped image offscreen, then draw it with the shadow so the
  // shadow follows the image's own transparency (cut-outs, rounded corners).
  const k = Math.min(scale, 4096 / Math.max(e.w, e.h));
  let cached = shadowCache.get(e);
  if (!cached || Math.abs(cached.k - k) / k > 0.05 || !getImage(e.assetId)) {
    const off = createCanvas(Math.max(1, Math.ceil(e.w * k)), Math.max(1, Math.ceil(e.h * k)));
    const oc = ctx2d(off);
    oc.scale(off.width / e.w, off.height / e.h);
    paintImageContent(oc, e, k);
    cached = { k, canvas: off };
    if (getImage(e.assetId)) shadowCache.set(e, cached);
  }
  const off = cached.canvas;
  applyShadow(ctx, e, scale);
  ctx.drawImage(off, 0, 0, e.w, e.h);
  clearShadow(ctx);
}

function drawText(ctx: CanvasRenderingContext2D, e: TextElement, scale: number) {
  const L = layoutText(e);
  ctx.textBaseline = 'middle';
  const baseFill: string | CanvasGradient = e.gradient ? linearGradientFor(ctx, e.gradient, e.w, e.h) : e.color;
  const fillFor = (st: CharStyle) => st.color ?? baseFill;

  if (L.curved) {
    ctx.textAlign = 'center';
    const paintCurved = (mode: 'fill' | 'stroke') => {
      for (const g of L.curved!) {
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.angle);
        ctx.font = g.font;
        if (mode === 'fill') {
          ctx.fillStyle = fillFor(g.style);
          ctx.fillText(g.ch, 0, 0);
        } else ctx.strokeText(g.ch, 0, 0);
        ctx.restore();
      }
    };
    applyShadow(ctx, e, scale);
    if (e.strokeWidth > 0) {
      ctx.strokeStyle = e.strokeColor;
      ctx.lineWidth = e.strokeWidth * 2;
      ctx.lineJoin = 'round';
      paintCurved('stroke');
      clearShadow(ctx);
    }
    paintCurved('fill');
    clearShadow(ctx);
    return;
  }

  ctx.textAlign = 'left';
  const lineX = (l: { width: number; indent: number }) => {
    const avail = e.w - l.indent;
    return l.indent + (e.align === 'center' ? (avail - l.width) / 2 : e.align === 'right' ? avail - l.width : 0);
  };
  const baseFont = fontCss(e.fontFamily, e.fontSize, e.bold, e.italic);
  const paint = (mode: 'fill' | 'stroke') => {
    L.lines.forEach((line, i) => {
      const y = i * L.lineHeightPx + L.lineHeightPx / 2;
      let x = lineX(line);
      if (line.marker) {
        ctx.font = baseFont;
        const mx = x - line.markerWidth - e.fontSize * 0.4;
        if (mode === 'fill') {
          ctx.fillStyle = baseFill;
          ctx.fillText(line.marker, mx, y);
        } else ctx.strokeText(line.marker, mx, y);
      }
      for (const seg of line.segs) {
        ctx.font = seg.font;
        if (mode === 'fill') ctx.fillStyle = fillFor(seg.style);
        if (!e.letterSpacing) {
          if (mode === 'fill') ctx.fillText(seg.text, x, y);
          else ctx.strokeText(seg.text, x, y);
          x += seg.width;
        } else {
          for (const ch of seg.text) {
            if (mode === 'fill') ctx.fillText(ch, x, y);
            else ctx.strokeText(ch, x, y);
            x += ctx.measureText(ch).width + e.letterSpacing;
          }
        }
      }
    });
  };
  applyShadow(ctx, e, scale);
  if (e.strokeWidth > 0) {
    ctx.strokeStyle = e.strokeColor;
    ctx.lineWidth = e.strokeWidth * 2;
    ctx.lineJoin = 'round';
    paint('stroke');
    clearShadow(ctx);
  }
  paint('fill');
  clearShadow(ctx);
  // Underlines, per styled segment
  const t = Math.max(1, e.fontSize / 14);
  L.lines.forEach((line, i) => {
    const y = i * L.lineHeightPx + L.lineHeightPx / 2 + e.fontSize * 0.42;
    let x = lineX(line);
    for (const seg of line.segs) {
      if (seg.style.underline && seg.text.trim()) {
        ctx.fillStyle = fillFor(seg.style);
        ctx.fillRect(x, y, seg.width - (e.letterSpacing ? e.letterSpacing : 0), t);
      }
      x += seg.width;
    }
  });
}

function drawStroke(ctx: CanvasRenderingContext2D, e: DrawElement, scale: number) {
  const d = strokePathD(e);
  if (!d) return;
  const preset = brushOf(e.brush);
  applyShadow(ctx, e, scale);
  ctx.globalCompositeOperation = preset.blend;
  ctx.strokeStyle = e.color;
  ctx.lineWidth = e.strokeWidth;
  ctx.lineCap = e.points.length <= 2 ? 'round' : preset.cap;
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(d));
  clearShadow(ctx);
}

/** Draw one element with its transform applied. */
export function drawElement(ctx: CanvasRenderingContext2D, e: StudioElement, scale: number) {
  if (e.hidden || e.opacity <= 0) return;
  ctx.save();
  ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
  if (e.rotation) ctx.rotate((e.rotation * Math.PI) / 180);
  ctx.translate(-e.w / 2, -e.h / 2);
  ctx.globalAlpha *= e.opacity;
  switch (e.type) {
    case 'shape':
      drawShape(ctx, e, scale);
      break;
    case 'line':
      drawLine(ctx, e, scale);
      break;
    case 'icon':
      drawIcon(ctx, e, scale);
      break;
    case 'image':
      drawImage(ctx, e, scale);
      break;
    case 'text':
      drawText(ctx, e, scale);
      break;
    case 'chart':
      applyShadow(ctx, e, scale);
      drawChart(ctx, e);
      clearShadow(ctx);
      break;
    case 'qr':
      drawQr(ctx, e);
      break;
    case 'draw':
      drawStroke(ctx, e, scale);
      break;
  }
  ctx.restore();
}

/**
 * Paint the document into `ctx`, whose current transform maps design pixels
 * to output. `skip` hides an element (the one being text-edited).
 */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  doc: StudioDoc,
  opts: { scale: number; skip?: string | null; background?: boolean; placeholders?: boolean; only?: Set<string> },
) {
  showPlaceholders = opts.placeholders !== false;
  ctx.save();
  if (opts.background !== false) {
    ctx.save();
    paintStudioFill(ctx, doc.background, doc.width, doc.height, opts.scale);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.rect(0, 0, doc.width, doc.height);
  ctx.clip();
  for (const e of doc.elements) {
    if (e.id === opts.skip || (opts.only && !opts.only.has(e.id))) continue;
    drawElement(ctx, e, opts.scale);
  }
  ctx.restore();
  showPlaceholders = true;
}

/**
 * Render for export: no frame placeholders, optionally only some elements,
 * optionally cropped to `bounds` (design px). `scale` = output px per design px.
 */
export function renderExport(doc: StudioDoc, opts: { scale: number; background: boolean; matte?: string | null; only?: Set<string>; bounds?: { x: number; y: number; w: number; h: number }; outW?: number; outH?: number }): HTMLCanvasElement {
  const box = opts.bounds ?? { x: 0, y: 0, w: doc.width, h: doc.height };
  const c = createCanvas(Math.max(1, Math.round(opts.outW ?? box.w * opts.scale)), Math.max(1, Math.round(opts.outH ?? box.h * opts.scale)));
  const ctx = ctx2d(c);
  if (opts.matte) {
    ctx.fillStyle = opts.matte;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.scale(c.width / box.w, c.height / box.h);
  ctx.translate(-box.x, -box.y);
  renderScene(ctx, doc, { scale: c.width / box.w, background: opts.background, placeholders: false, only: opts.only });
  return c;
}

/** Render a document to a new canvas at `scale` output pixels per design pixel. */
export function renderToCanvas(doc: StudioDoc, scale: number, opts: { background?: boolean; matte?: string | null } = {}): HTMLCanvasElement {
  const c = createCanvas(Math.max(1, Math.round(doc.width * scale)), Math.max(1, Math.round(doc.height * scale)));
  const ctx = ctx2d(c);
  if (opts.matte) {
    ctx.fillStyle = opts.matte;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.scale(c.width / doc.width, c.height / doc.height);
  renderScene(ctx, doc, { scale, background: opts.background });
  return c;
}

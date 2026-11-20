import { brushOf, strokePathD } from './draw';
import { getImage, createCanvas, ctx2d } from '../engine/images';
import { ICONS } from './iconData';
import { fontCss, fontOf } from './fonts';
import { adjustedImage, isIdentity } from './imageFx';
import { chartGeometry, fitCellText, qrModules, tableGeometry } from './extraRender';
import { layoutText, type CharStyle } from './textEngine';
import { pathFor, paintStudioFill, type PathSink } from './render';
import type { Gradient, ImageElement, StudioDoc, StudioElement, StudioFill, TextElement } from './types';

/**
 * SVG export. Shapes, lines, icons, charts, QR codes and text are written as
 * vectors (text stays selectable, with the fonts it uses embedded). Images are
 * embedded as PNG/JPEG data. Everything renders from the same geometry as the
 * canvas, so the result matches the editor.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => (Math.round(v * 100) / 100).toString();

class SvgPath implements PathSink {
  d = '';
  beginPath() {
    this.d = '';
  }
  moveTo(x: number, y: number) {
    this.d += `M${n(x)} ${n(y)}`;
  }
  lineTo(x: number, y: number) {
    this.d += `L${n(x)} ${n(y)}`;
  }
  bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number) {
    this.d += `C${n(a)} ${n(b)} ${n(c)} ${n(d)} ${n(x)} ${n(y)}`;
  }
  quadraticCurveTo(a: number, b: number, x: number, y: number) {
    this.d += `Q${n(a)} ${n(b)} ${n(x)} ${n(y)}`;
  }
  ellipse(cx: number, cy: number, rx: number, ry: number) {
    this.d += `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(2 * rx)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-2 * rx)} 0Z`;
  }
  roundRect(x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2);
    this.d += `M${n(x + rr)} ${n(y)}H${n(x + w - rr)}A${n(rr)} ${n(rr)} 0 0 1 ${n(x + w)} ${n(y + rr)}V${n(y + h - rr)}A${n(rr)} ${n(rr)} 0 0 1 ${n(x + w - rr)} ${n(y + h)}H${n(x + rr)}A${n(rr)} ${n(rr)} 0 0 1 ${n(x)} ${n(y + h - rr)}V${n(y + rr)}A${n(rr)} ${n(rr)} 0 0 1 ${n(x + rr)} ${n(y)}Z`;
  }
  rect(x: number, y: number, w: number, h: number) {
    this.d += `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;
  }
  closePath() {
    this.d += 'Z';
  }
}

let idSeq = 0;
const uid = (p: string) => `${p}${++idSeq}`;

function gradientDef(defs: string[], g: Gradient, w: number, h: number): string {
  const id = uid('g');
  const a = (g.angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  defs.push(
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(w / 2 - (dx * len) / 2)}" y1="${n(h / 2 - (dy * len) / 2)}" x2="${n(w / 2 + (dx * len) / 2)}" y2="${n(h / 2 + (dy * len) / 2)}"><stop offset="0" stop-color="${esc(g.from)}"/><stop offset="1" stop-color="${esc(g.to)}"/></linearGradient>`,
  );
  return `url(#${id})`;
}

function shadowDef(defs: string[], e: StudioElement): string {
  const s = e.shadow;
  if (!s.enabled) return '';
  const id = uid('s');
  defs.push(
    `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${n(s.x)}" dy="${n(s.y)}" stdDeviation="${n(s.blur / 2)}" flood-color="${esc(s.color)}" flood-opacity="${n(s.opacity)}"/></filter>`,
  );
  return ` filter="url(#${id})"`;
}

function canvasDataUrl(c: HTMLCanvasElement, preferJpeg: boolean): string {
  return preferJpeg ? c.toDataURL('image/jpeg', 0.92) : c.toDataURL('image/png');
}

function imageSvg(defs: string[], e: ImageElement): string {
  if (!e.assetId) return '';
  const entry = getImage(e.assetId);
  if (!entry) return '';
  // Embed the cropped region at up to 2× its size in the design.
  const k = Math.min(1, (2 * Math.max(e.w, e.h)) / Math.max(e.crop.w, e.crop.h));
  const w = Math.max(1, Math.round(e.crop.w * k));
  const h = Math.max(1, Math.round(e.crop.h * k));
  let c: HTMLCanvasElement;
  if (!isIdentity(e.adjust)) c = adjustedImage(e.assetId, e.crop, e.adjust!, w, h, w / e.w)!;
  else {
    c = createCanvas(w, h);
    const ctx = ctx2d(c);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(entry.source, e.crop.x, e.crop.y, e.crop.w, e.crop.h, 0, 0, w, h);
  }
  const opaque = (entry.blob?.type ?? '') === 'image/jpeg';
  const clip = uid('c');
  const p = new SvgPath();
  if (e.mask && e.mask !== 'rect') pathFor(p, e.mask, e.w, e.h, e.radius);
  else pathFor(p, 'rect', e.w, e.h, e.radius);
  defs.push(`<clipPath id="${clip}"><path d="${p.d}"/></clipPath>`);
  const flip = e.flipX || e.flipY ? ` transform="translate(${e.flipX ? n(e.w) : 0} ${e.flipY ? n(e.h) : 0}) scale(${e.flipX ? -1 : 1} ${e.flipY ? -1 : 1})"` : '';
  let out = `<g${flip}><g clip-path="url(#${clip})"><image href="${canvasDataUrl(c, opaque)}" x="0" y="0" width="${n(e.w)}" height="${n(e.h)}" preserveAspectRatio="none"/></g>`;
  if (e.borderWidth > 0) {
    out += `<path d="${p.d}" fill="none" stroke="${esc(e.borderColor)}" stroke-width="${n(e.borderWidth * 2)}" clip-path="url(#${clip})"/>`;
  }
  return out + '</g>';
}

function textAttrs(e: TextElement, st: CharStyle, fill: string): string {
  const f = fontOf(e.fontFamily);
  return `font-family="${esc(f.css)}" font-size="${n(e.fontSize)}" font-weight="${st.bold && f.bold ? 700 : 400}" font-style="${st.italic ? 'italic' : 'normal'}" fill="${esc(st.color ?? fill)}"${st.underline ? ' text-decoration="underline"' : ''}`;
}

function textSvg(defs: string[], e: TextElement): string {
  const L = layoutText(e);
  const fill = e.gradient ? gradientDef(defs, e.gradient, e.w, e.h) : e.color;
  const stroke = e.strokeWidth > 0 ? ` stroke="${esc(e.strokeColor)}" stroke-width="${n(e.strokeWidth * 2)}" stroke-linejoin="round" paint-order="stroke fill"` : '';
  const ls = e.letterSpacing ? ` letter-spacing="${n(e.letterSpacing)}"` : '';
  const parts: string[] = [];
  if (L.curved) {
    for (const g of L.curved) {
      parts.push(
        `<text transform="translate(${n(g.x)} ${n(g.y)}) rotate(${n((g.angle * 180) / Math.PI)})" text-anchor="middle" dominant-baseline="central" ${textAttrs(e, g.style, fill)}${stroke}>${esc(g.ch)}</text>`,
      );
    }
    return parts.join('');
  }
  L.lines.forEach((line, i) => {
    const y = i * L.lineHeightPx + L.lineHeightPx / 2;
    const avail = e.w - line.indent;
    let x = line.indent + (e.align === 'center' ? (avail - line.width) / 2 : e.align === 'right' ? avail - line.width : 0);
    if (line.marker) {
      const base: CharStyle = { bold: e.bold, italic: e.italic, underline: false, color: null };
      parts.push(`<text x="${n(x - line.markerWidth - e.fontSize * 0.4)}" y="${n(y)}" dominant-baseline="central" ${textAttrs(e, base, fill)}${stroke}>${esc(line.marker)}</text>`);
    }
    for (const seg of line.segs) {
      if (seg.text) parts.push(`<text x="${n(x)}" y="${n(y)}" dominant-baseline="central" xml:space="preserve" ${textAttrs(e, seg.style, fill)}${stroke}${ls}>${esc(seg.text)}</text>`);
      x += seg.width;
    }
  });
  return parts.join('');
}

function elementBody(defs: string[], e: StudioElement): string {
  switch (e.type) {
    case 'shape': {
      const p = new SvgPath();
      pathFor(p, e.shape, e.w, e.h, e.radius);
      const fill = e.gradient ? gradientDef(defs, e.gradient, e.w, e.h) : e.fill ?? 'none';
      const stroke = e.stroke && e.strokeWidth > 0 ? ` stroke="${esc(e.stroke)}" stroke-width="${n(e.strokeWidth)}" stroke-linejoin="round"` : '';
      return `<path d="${p.d}" fill="${esc(fill)}"${stroke}/>`;
    }
    case 'line': {
      const y = e.h / 2;
      const head = e.strokeWidth * 2.6 + 6;
      const x0 = e.startHead ? head * 0.8 : 0;
      const x1 = e.endHead ? e.w - head * 0.8 : e.w;
      const dash = e.dash === 'dashed' ? ` stroke-dasharray="${n(e.strokeWidth * 3)} ${n(e.strokeWidth * 2)}"` : e.dash === 'dotted' ? ` stroke-dasharray="0.01 ${n(e.strokeWidth * 2)}" stroke-linecap="round"` : '';
      let s = `<path d="M${n(x0)} ${n(y)}L${n(Math.max(x0, x1))} ${n(y)}" stroke="${esc(e.color)}" stroke-width="${n(e.strokeWidth)}" fill="none"${dash}/>`;
      const arrow = (tip: number, dir: number) => `<path d="M${n(tip)} ${n(y)}L${n(tip - dir * head)} ${n(y - head * 0.55)}L${n(tip - dir * head)} ${n(y + head * 0.55)}Z" fill="${esc(e.color)}"/>`;
      if (e.endHead) s += arrow(e.w, 1);
      if (e.startHead) s += arrow(0, -1);
      return s;
    }
    case 'icon': {
      const d = ICONS[e.icon];
      if (!d) return '';
      const k = Math.min(e.w, e.h) / 24;
      return `<path transform="translate(${n((e.w - 24 * k) / 2)} ${n((e.h - 24 * k) / 2)}) scale(${n(k)})" d="${d}" fill="${e.filled ? esc(e.color) : 'none'}" stroke="${esc(e.color)}" stroke-width="${n(e.weight)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    case 'draw': {
      const preset = brushOf(e.brush);
      const blend = preset.blend === 'multiply' ? ' style="mix-blend-mode:multiply"' : '';
      return `<path d="${strokePathD(e)}" fill="none" stroke="${esc(e.color)}" stroke-width="${n(e.strokeWidth)}" stroke-linecap="${e.points.length <= 2 ? 'round' : preset.cap}" stroke-linejoin="round"${blend}/>`;
    }
    case 'image':
      return imageSvg(defs, e);
    case 'text':
      return textSvg(defs, e);
    case 'qr': {
      const size = Math.min(e.w, e.h);
      let s = e.bg ? `<rect x="${n((e.w - size) / 2)}" y="${n((e.h - size) / 2)}" width="${n(size)}" height="${n(size)}" fill="${esc(e.bg)}"/>` : '';
      const mods = qrModules(e);
      if (mods) {
        if (e.rounded) s += `<g fill="${esc(e.fg)}">${mods.map((m) => `<circle cx="${n(m.x + m.s / 2)}" cy="${n(m.y + m.s / 2)}" r="${n(m.s * 0.46)}"/>`).join('')}</g>`;
        else s += `<path fill="${esc(e.fg)}" shape-rendering="crispEdges" d="${mods.map((m) => `M${n(m.x)} ${n(m.y)}h${n(m.s)}v${n(m.s)}h${n(-m.s)}Z`).join('')}"/>`;
      }
      return s;
    }
    case 'table': {
      const g = tableGeometry(e);
      const r = Math.min(e.radius, e.w / 2, e.h / 2);
      const clip = `tbl-${e.id.replace(/[^a-z0-9_-]/gi, '')}`;
      let s = `<clipPath id="${clip}"><rect width="${n(e.w)}" height="${n(e.h)}" rx="${n(r)}"/></clipPath><g clip-path="url(#${clip})">`;
      for (const c of g.cells) if (c.fill) s += `<rect x="${n(c.x)}" y="${n(c.y)}" width="${n(c.w + 0.5)}" height="${n(c.h + 0.5)}" fill="${esc(c.fill)}"/>`;
      if (g.lines.length) s += `<path d="${g.lines.map(([x1, y1, x2, y2]) => `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`).join('')}" stroke="${esc(e.borderColor)}" stroke-width="${n(e.borderWidth)}"/>`;
      const mctx = measureCtx();
      for (const c of g.cells) {
        if (!c.text) continue;
        mctx.font = fontCss(e.fontFamily, e.fontSize, c.bold, false);
        const anchor = c.anchor === 'center' ? 'middle' : c.anchor === 'right' ? 'end' : 'start';
        s += `<text x="${n(c.tx)}" y="${n(c.ty)}" text-anchor="${anchor}" dominant-baseline="central" font-family="${esc(fontOf(e.fontFamily).css)}" font-size="${n(e.fontSize)}" font-weight="${c.bold ? 700 : 400}" fill="${esc(c.color)}">${esc(fitCellText(mctx, c.text, c.maxW))}</text>`;
      }
      s += '</g>';
      if (e.borderWidth > 0) s += `<rect x="${n(e.borderWidth / 2)}" y="${n(e.borderWidth / 2)}" width="${n(e.w - e.borderWidth)}" height="${n(e.h - e.borderWidth)}" rx="${n(Math.max(0, r - e.borderWidth / 2))}" fill="none" stroke="${esc(e.borderColor)}" stroke-width="${n(e.borderWidth)}"/>`;
      return s;
    }
    case 'chart': {
      const g = chartGeometry(e);
      let s = g.axis ? `<path d="M${n(g.axis[0])} ${n(g.axis[1])}L${n(g.axis[2])} ${n(g.axis[3])}" stroke="${esc(e.textColor)}" stroke-opacity="0.35"/>` : '';
      for (const m of g.marks) {
        if (m.kind === 'rect') s += `<rect x="${n(m.x!)}" y="${n(m.y!)}" width="${n(m.w!)}" height="${n(m.h!)}" rx="${n(Math.min(4, m.w! / 4, m.h! / 2))}" fill="${esc(m.color)}"/>`;
        else if (m.kind === 'dot') s += `<circle cx="${n(m.cx!)}" cy="${n(m.cy!)}" r="${n(m.r!)}" fill="${esc(m.color)}"/>`;
        else if (m.kind === 'polyline') s += `<polyline points="${m.points!.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" fill="none" stroke="${esc(m.color)}" stroke-width="${n(m.w!)}" stroke-linejoin="round" stroke-linecap="round"/>`;
        else if (m.kind === 'arc') {
          const pt = (r: number, a: number) => `${n(m.cx! + Math.sin(a) * r)} ${n(m.cy! - Math.cos(a) * r)}`;
          const large = m.a1! - m.a0! > Math.PI ? 1 : 0;
          if (m.a1! - m.a0! >= Math.PI * 2 - 1e-6) {
            s += m.r0 ? `<circle cx="${n(m.cx!)}" cy="${n(m.cy!)}" r="${n((m.r! + m.r0) / 2)}" fill="none" stroke="${esc(m.color)}" stroke-width="${n(m.r! - m.r0)}"/>` : `<circle cx="${n(m.cx!)}" cy="${n(m.cy!)}" r="${n(m.r!)}" fill="${esc(m.color)}"/>`;
          } else if (m.r0) s += `<path d="M${pt(m.r!, m.a0!)}A${n(m.r!)} ${n(m.r!)} 0 ${large} 1 ${pt(m.r!, m.a1!)}L${pt(m.r0, m.a1!)}A${n(m.r0)} ${n(m.r0)} 0 ${large} 0 ${pt(m.r0, m.a0!)}Z" fill="${esc(m.color)}"/>`;
          else s += `<path d="M${n(m.cx!)} ${n(m.cy!)}L${pt(m.r!, m.a0!)}A${n(m.r!)} ${n(m.r!)} 0 ${large} 1 ${pt(m.r!, m.a1!)}Z" fill="${esc(m.color)}"/>`;
        }
      }
      for (const t of g.texts) {
        const onSlice = (e.chart === 'pie' || e.chart === 'donut') && t.bold;
        const anchor = t.align === 'center' ? 'middle' : t.align === 'right' ? 'end' : 'start';
        s += `<text x="${n(t.x)}" y="${n(t.y)}" text-anchor="${anchor}" dominant-baseline="central" font-family="${esc(fontOf(e.fontFamily).css)}" font-size="${n(t.size)}" font-weight="${t.bold ? 700 : 400}" fill="${onSlice ? '#ffffff' : esc(e.textColor)}">${esc(t.text)}</text>`;
      }
      return s;
    }
  }
}

function backgroundSvg(defs: string[], f: StudioFill, w: number, h: number): string {
  if (f.kind === 'transparent') return '';
  if (f.kind === 'solid') return `<rect width="${n(w)}" height="${n(h)}" fill="${esc(f.color)}"/>`;
  if (f.kind === 'gradient') return `<rect width="${n(w)}" height="${n(h)}" fill="${gradientDef(defs, f, w, h)}"/>`;
  // Patterns: render one tile and repeat it.
  const tile = createCanvas(Math.max(4, Math.round(f.size * 2)), Math.max(4, Math.round(f.size * 2)));
  paintStudioFill(ctx2d(tile), f, tile.width, tile.height, 2);
  const id = uid('p');
  defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="${n(f.size)}" height="${n(f.size)}"><image href="${tile.toDataURL('image/png')}" width="${n(f.size * (tile.width / (f.size * 2)) * 2)}" height="${n(f.size * (tile.height / (f.size * 2)) * 2)}"/></pattern>`);
  return `<rect width="${n(w)}" height="${n(h)}" fill="url(#${id})"/>`;
}

function coversLatin(range: string): boolean {
  return range.split(',').some((part) => {
    const m = part.trim().match(/^U\+([0-9a-f?]+)(?:-([0-9a-f]+))?$/i);
    if (!m) return false;
    const lo = parseInt(m[1].replace(/\?/g, '0'), 16);
    const hi = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, 'f'), 16);
    return lo <= 0x41 && hi >= 0x41;
  });
}

/** Embed the web fonts a design uses, so the SVG looks right anywhere. */
async function fontFaceCss(families: Set<string>): Promise<string> {
  const rules: string[] = [];
  const wanted = [...families].map((id) => fontOf(id).css.split(',')[0].replace(/['"]/g, '').trim());
  const toData = async (url: string) => {
    const blob = await (await fetch(url)).blob();
    return new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  };
  for (const sheet of Array.from(document.styleSheets)) {
    let list: CSSRuleList;
    try {
      list = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(list)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const fam = rule.style.getPropertyValue('font-family').replace(/['"]/g, '').trim();
      if (!wanted.includes(fam)) continue;
      const range = rule.style.getPropertyValue('unicode-range');
      // Latin subsets only (the ones covering "A"), which keeps files small.
      if (range && !coversLatin(range)) continue;
      const m = rule.style.getPropertyValue('src').match(/url\(["']?([^"')]+)["']?\)/);
      if (!m) continue;
      try {
        const data = await toData(new URL(m[1], sheet.href ?? location.href).href);
        rules.push(
          `@font-face{font-family:'${fam}';font-style:${rule.style.getPropertyValue('font-style') || 'normal'};font-weight:${rule.style.getPropertyValue('font-weight') || '400'};src:url(${data}) format('woff2');}`,
        );
      } catch {
        /* the font just falls back */
      }
    }
  }
  return rules.join('');
}

/**
 * SVG for a page (or just `only` elements, cropped to their bounds when
 * `bounds` is given). Width/height set the output size; the drawing scales to fit.
 */
export async function buildSvg(doc: StudioDoc, opts: { width: number; height: number; background: boolean; only?: Set<string>; bounds?: { x: number; y: number; w: number; h: number } }): Promise<string> {
  idSeq = 0;
  const defs: string[] = [];
  const box = opts.bounds ?? { x: 0, y: 0, w: doc.width, h: doc.height };
  const els = doc.elements.filter((e) => !e.hidden && e.opacity > 0 && (!opts.only || opts.only.has(e.id)) && !(e.type === 'image' && !e.assetId));
  const body: string[] = [];
  if (opts.background && !opts.bounds) body.push(backgroundSvg(defs, doc.background, doc.width, doc.height));
  for (const e of els) {
    const inner = elementBody(defs, e);
    if (!inner) continue;
    const t = `translate(${n(e.x + e.w / 2)} ${n(e.y + e.h / 2)})${e.rotation ? ` rotate(${n(e.rotation)})` : ''} translate(${n(-e.w / 2)} ${n(-e.h / 2)})`;
    body.push(`<g transform="${t}"${e.opacity < 1 ? ` opacity="${n(e.opacity)}"` : ''}${shadowDef(defs, e)}>${inner}</g>`);
  }
  const families = new Set(els.flatMap((e) => (e.type === 'text' || e.type === 'chart' || e.type === 'table' ? [e.fontFamily] : [])));
  const css = families.size ? await fontFaceCss(families) : '';
  const clip = opts.bounds ? '' : `<clipPath id="page"><rect width="${n(doc.width)}" height="${n(doc.height)}"/></clipPath>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="${n(box.x)} ${n(box.y)} ${n(box.w)} ${n(box.h)}">`,
    `<defs>${css ? `<style>${css}</style>` : ''}${clip}${defs.join('')}</defs>`,
    opts.bounds ? body.join('') : `<g clip-path="url(#page)">${body.join('')}</g>`,
    '</svg>',
  ].join('');
}

// fontCss is re-exported for callers that need matching font strings.
export { fontCss };

let mc: CanvasRenderingContext2D | null = null;
/** A small canvas context for measuring text (table cells are ellipsized like on screen). */
function measureCtx(): CanvasRenderingContext2D {
  mc ??= ctx2d(createCanvas(1, 1));
  return mc;
}

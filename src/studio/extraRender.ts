import qrcode from 'qrcode-generator';
import { fontCss } from './fonts';
import type { ChartElement, QrElement, TableElement } from './types';

// ---------------------------------------------------------------------------
// QR codes

// Encode as UTF-8 so non-ASCII links and text scan correctly.
qrcode.stringToBytes = (s: string) => Array.from(new TextEncoder().encode(s));

const qrCache = new Map<string, boolean[][]>();

/** Module matrix for a QR code (true = dark), cached. Empty data gives null. */
export function qrMatrix(data: string, ecc: QrElement['ecc']): boolean[][] | null {
  if (!data) return null;
  const key = `${ecc}|${data}`;
  const hit = qrCache.get(key);
  if (hit) return hit;
  try {
    const q = qrcode(0, ecc);
    q.addData(data);
    q.make();
    const n = q.getModuleCount();
    const m: boolean[][] = [];
    for (let r = 0; r < n; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < n; c++) row.push(q.isDark(r, c));
      m.push(row);
    }
    if (qrCache.size > 50) qrCache.clear();
    qrCache.set(key, m);
    return m;
  } catch {
    return null; // too much data for a QR code
  }
}

/** Squares (or rounded dots) for each dark module, with a 2-module quiet zone. */
export function qrModules(e: QrElement): { x: number; y: number; s: number }[] | null {
  const m = qrMatrix(e.data, e.ecc);
  if (!m) return null;
  const n = m.length + 4;
  const size = Math.min(e.w, e.h);
  const s = size / n;
  const ox = (e.w - size) / 2 + 2 * s;
  const oy = (e.h - size) / 2 + 2 * s;
  const out: { x: number; y: number; s: number }[] = [];
  m.forEach((row, r) => row.forEach((dark, c) => dark && out.push({ x: ox + c * s, y: oy + r * s, s })));
  return out;
}

export function drawQr(ctx: CanvasRenderingContext2D, e: QrElement) {
  const size = Math.min(e.w, e.h);
  if (e.bg) {
    ctx.fillStyle = e.bg;
    ctx.fillRect((e.w - size) / 2, (e.h - size) / 2, size, size);
  }
  const mods = qrModules(e);
  ctx.fillStyle = e.fg;
  if (!mods) {
    ctx.font = fontCss('inter', Math.max(10, size / 12), true, false);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.data ? 'Too long for a QR code' : 'Add a link', e.w / 2, e.h / 2);
    return;
  }
  ctx.beginPath();
  for (const m of mods) {
    if (e.rounded) {
      ctx.moveTo(m.x + m.s, m.y + m.s / 2);
      ctx.arc(m.x + m.s / 2, m.y + m.s / 2, m.s * 0.46, 0, Math.PI * 2);
    } else ctx.rect(m.x - 0.02, m.y - 0.02, m.s + 0.04, m.s + 0.04);
  }
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Charts

export const CHART_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#ff375f', '#bf5af2', '#64d2ff', '#ffd60a', '#ac8e68'];

function fmt(v: number) {
  return Math.abs(v) >= 1000 ? v.toLocaleString('en-US') : String(Math.round(v * 100) / 100);
}

export interface ChartMark {
  kind: 'rect' | 'arc' | 'polyline' | 'dot';
  color: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** Arc: center, radii and angles (radians, 0 = up, clockwise). */
  cx?: number;
  cy?: number;
  r?: number;
  r0?: number;
  a0?: number;
  a1?: number;
  points?: [number, number][];
}

export interface ChartText {
  text: string;
  x: number;
  y: number;
  align: CanvasTextAlign;
  size: number;
  bold: boolean;
}

/** Geometry for a chart, shared by the canvas renderer and the SVG writer. */
export function chartGeometry(e: ChartElement): { marks: ChartMark[]; texts: ChartText[]; axis: [number, number, number, number] | null } {
  const data = e.data.filter((d) => Number.isFinite(d.value));
  const marks: ChartMark[] = [];
  const texts: ChartText[] = [];
  const color = (i: number) => e.colors[i % e.colors.length] ?? CHART_COLORS[i % CHART_COLORS.length];
  const fs = Math.max(9, Math.min(e.w, e.h) * 0.055);
  if (!data.length) return { marks, texts, axis: null };

  if (e.chart === 'pie' || e.chart === 'donut') {
    const total = data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
    const legend = e.showLabels ? Math.min(e.w * 0.38, fs * 9) : 0;
    const r = Math.max(4, Math.min((e.w - legend) / 2, e.h / 2) - 2);
    const cx = (e.w - legend) / 2;
    const cy = e.h / 2;
    let a = 0;
    data.forEach((d, i) => {
      const sweep = (Math.max(0, d.value) / total) * Math.PI * 2;
      marks.push({ kind: 'arc', color: color(i), cx, cy, r, r0: e.chart === 'donut' ? r * 0.58 : 0, a0: a, a1: a + sweep });
      if (e.showValues && sweep > 0.25) {
        const mid = a + sweep / 2;
        const rr = e.chart === 'donut' ? r * 0.79 : r * 0.62;
        texts.push({ text: `${Math.round((d.value / total) * 100)}%`, x: cx + Math.sin(mid) * rr, y: cy - Math.cos(mid) * rr, align: 'center', size: fs * 0.9, bold: true });
      }
      a += sweep;
    });
    if (e.showLabels) {
      const lx = e.w - legend + fs * 0.6;
      const startY = cy - ((data.length - 1) * fs * 1.6) / 2;
      data.forEach((d, i) => {
        const y = startY + i * fs * 1.6;
        marks.push({ kind: 'dot', color: color(i), cx: lx, cy: y, r: fs * 0.35 });
        texts.push({ text: d.label, x: lx + fs * 0.8, y, align: 'left', size: fs, bold: false });
      });
    }
    return { marks, texts, axis: null };
  }

  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = max - min || 1;
  const padL = e.chart === 'bar' && e.showLabels ? Math.min(e.w * 0.3, fs * 6) : fs * 0.4;
  const padB = e.chart !== 'bar' && e.showLabels ? fs * 1.8 : fs * 0.4;
  const padT = e.showValues ? fs * 1.6 : fs * 0.4;
  const padR = e.chart === 'bar' && e.showValues ? fs * 3 : fs * 0.4;
  const pw = Math.max(1, e.w - padL - padR);
  const ph = Math.max(1, e.h - padT - padB);
  const n = data.length;

  if (e.chart === 'bar') {
    const band = ph / n;
    const zeroX = padL + ((0 - min) / range) * pw;
    data.forEach((d, i) => {
      const y = padT + i * band + band * 0.15;
      const x1 = padL + ((d.value - min) / range) * pw;
      marks.push({ kind: 'rect', color: color(i), x: Math.min(zeroX, x1), y, w: Math.abs(x1 - zeroX), h: band * 0.7 });
      if (e.showLabels) texts.push({ text: d.label, x: padL - fs * 0.5, y: y + band * 0.35, align: 'right', size: fs, bold: false });
      if (e.showValues) texts.push({ text: fmt(d.value), x: Math.max(zeroX, x1) + fs * 0.4, y: y + band * 0.35, align: 'left', size: fs * 0.9, bold: true });
    });
    return { marks, texts, axis: [zeroX, padT, zeroX, padT + ph] };
  }

  const band = pw / n;
  const yOf = (v: number) => padT + ph - ((v - min) / range) * ph;
  const zeroY = yOf(0);
  if (e.chart === 'column') {
    data.forEach((d, i) => {
      const x = padL + i * band + band * 0.15;
      const y1 = yOf(d.value);
      marks.push({ kind: 'rect', color: color(i), x, y: Math.min(zeroY, y1), w: band * 0.7, h: Math.abs(zeroY - y1) });
      if (e.showValues) texts.push({ text: fmt(d.value), x: x + band * 0.35, y: Math.min(zeroY, y1) - fs * 0.7, align: 'center', size: fs * 0.9, bold: true });
      if (e.showLabels) texts.push({ text: d.label, x: x + band * 0.35, y: padT + ph + fs * 0.95, align: 'center', size: fs, bold: false });
    });
  } else {
    const pts: [number, number][] = data.map((d, i) => [padL + i * band + band / 2, yOf(d.value)]);
    marks.push({ kind: 'polyline', color: color(0), points: pts, w: Math.max(2, fs * 0.25) });
    pts.forEach(([x, y], i) => {
      marks.push({ kind: 'dot', color: color(0), cx: x, cy: y, r: Math.max(2.5, fs * 0.3) });
      if (e.showValues) texts.push({ text: fmt(data[i].value), x, y: y - fs * 0.9, align: 'center', size: fs * 0.9, bold: true });
      if (e.showLabels) texts.push({ text: data[i].label, x, y: padT + ph + fs * 0.95, align: 'center', size: fs, bold: false });
    });
  }
  return { marks, texts, axis: [padL, zeroY, padL + pw, zeroY] };
}

export function drawChart(ctx: CanvasRenderingContext2D, e: ChartElement) {
  const g = chartGeometry(e);
  if (g.axis) {
    ctx.strokeStyle = e.textColor;
    ctx.globalAlpha *= 0.35;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(g.axis[0], g.axis[1]);
    ctx.lineTo(g.axis[2], g.axis[3]);
    ctx.stroke();
    ctx.globalAlpha /= 0.35;
  }
  for (const m of g.marks) {
    ctx.fillStyle = m.color;
    ctx.strokeStyle = m.color;
    if (m.kind === 'rect') {
      ctx.beginPath();
      ctx.roundRect(m.x!, m.y!, m.w!, m.h!, Math.min(4, m.w! / 4, m.h! / 2));
      ctx.fill();
    } else if (m.kind === 'arc') {
      const toCanvas = (a: number) => a - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(m.cx!, m.cy!, m.r!, toCanvas(m.a0!), toCanvas(m.a1!));
      if (m.r0) ctx.arc(m.cx!, m.cy!, m.r0, toCanvas(m.a1!), toCanvas(m.a0!), true);
      else ctx.lineTo(m.cx!, m.cy!);
      ctx.closePath();
      ctx.fill();
    } else if (m.kind === 'dot') {
      ctx.beginPath();
      ctx.arc(m.cx!, m.cy!, m.r!, 0, Math.PI * 2);
      ctx.fill();
    } else if (m.kind === 'polyline') {
      ctx.beginPath();
      m.points!.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.lineWidth = m.w!;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }
  ctx.textBaseline = 'middle';
  for (const t of g.texts) {
    ctx.font = fontCss(e.fontFamily, t.size, t.bold, false);
    ctx.textAlign = t.align;
    const onSlice = (e.chart === 'pie' || e.chart === 'donut') && t.bold;
    ctx.fillStyle = onSlice ? '#ffffff' : e.textColor;
    ctx.fillText(t.text, t.x, t.y);
  }
}

// ---------------------------------------------------------------------------
// Tables

export interface TableGeometry {
  /** Cell rectangles with their fill (null = none) and text. */
  cells: { x: number; y: number; w: number; h: number; fill: string | null; text: string; color: string; bold: boolean; tx: number; ty: number; maxW: number; anchor: 'left' | 'center' | 'right' }[];
  /** Grid lines [x1, y1, x2, y2]. */
  lines: [number, number, number, number][];
}

/** Equal columns and rows across the element box. Shared by canvas, SVG and hit testing. */
export function tableGeometry(e: TableElement): TableGeometry {
  const rows = Math.max(1, e.cells.length);
  const cols = Math.max(1, ...e.cells.map((r) => r.length));
  const cw = e.w / cols;
  const rh = e.h / rows;
  const pad = Math.min(e.fontSize * 0.6, cw * 0.2);
  const cells: TableGeometry['cells'] = [];
  for (let r = 0; r < rows; r++) {
    const head = e.header && r === 0;
    const fill = head ? e.headerBg : e.stripe && r % 2 === (e.header ? 0 : 1) ? e.stripe : e.cellBg;
    for (let c = 0; c < cols; c++) {
      const x = c * cw;
      const y = r * rh;
      const tx = e.align === 'center' ? x + cw / 2 : e.align === 'right' ? x + cw - pad : x + pad;
      cells.push({ x, y, w: cw, h: rh, fill, text: e.cells[r]?.[c] ?? '', color: head ? e.headerColor : e.textColor, bold: head, tx, ty: y + rh / 2, maxW: cw - pad * 2, anchor: e.align });
    }
  }
  const lines: TableGeometry['lines'] = [];
  if (e.borderWidth > 0) {
    for (let c = 1; c < cols; c++) lines.push([c * cw, 0, c * cw, e.h]);
    for (let r = 1; r < rows; r++) lines.push([0, r * rh, e.w, r * rh]);
  }
  return { cells, lines };
}

/** Shorten text with an ellipsis to fit `max` px. */
export function fitCellText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + '…').width <= max) lo = mid;
    else hi = mid - 1;
  }
  return lo ? text.slice(0, lo) + '…' : '';
}

export function drawTable(ctx: CanvasRenderingContext2D, e: TableElement) {
  const g = tableGeometry(e);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, e.w, e.h, Math.min(e.radius, e.w / 2, e.h / 2));
  ctx.clip();
  for (const c of g.cells) {
    if (!c.fill) continue;
    ctx.fillStyle = c.fill;
    ctx.fillRect(c.x, c.y, c.w + 0.5, c.h + 0.5);
  }
  if (g.lines.length) {
    ctx.strokeStyle = e.borderColor;
    ctx.lineWidth = e.borderWidth;
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of g.lines) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }
  ctx.textBaseline = 'middle';
  for (const c of g.cells) {
    if (!c.text) continue;
    ctx.font = fontCss(e.fontFamily, e.fontSize, c.bold, false);
    ctx.fillStyle = c.color;
    ctx.textAlign = c.anchor;
    ctx.fillText(fitCellText(ctx, c.text, c.maxW), c.tx, c.ty);
  }
  ctx.restore();
  if (e.borderWidth > 0) {
    ctx.strokeStyle = e.borderColor;
    ctx.lineWidth = e.borderWidth;
    ctx.beginPath();
    ctx.roundRect(e.borderWidth / 2, e.borderWidth / 2, e.w - e.borderWidth, e.h - e.borderWidth, Math.max(0, Math.min(e.radius, e.w / 2, e.h / 2) - e.borderWidth / 2));
    ctx.stroke();
  }
}

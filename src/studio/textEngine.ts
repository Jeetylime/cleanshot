import { createCanvas, ctx2d } from '../engine/images';
import { fontCss } from './fonts';
import type { Gradient, TextElement, TextRun } from './types';

/**
 * Text layout with per-character styles, list markers and curved baselines.
 * Used by the screen renderer, export and the SVG writer so they always agree.
 */

export interface CharStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string | null;
}

export interface Seg {
  text: string;
  style: CharStyle;
  font: string;
  width: number;
}

export interface Line {
  segs: Seg[];
  width: number;
  indent: number;
  marker: string | null;
  markerWidth: number;
}

export interface CurvedGlyph {
  ch: string;
  font: string;
  style: CharStyle;
  x: number;
  y: number;
  angle: number;
}

export interface TextLayout {
  lines: Line[];
  lineHeightPx: number;
  height: number;
  /** Set for curved text, whose box size follows the text. */
  width?: number;
  curved?: CurvedGlyph[];
}

let mc: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();
function measure(font: string, s: string): number {
  const key = `${font}|${s}`;
  let w = widthCache.get(key);
  if (w === undefined) {
    if (!mc) mc = ctx2d(createCanvas(4, 4));
    mc.font = font;
    w = mc.measureText(s).width;
    if (widthCache.size > 5000) widthCache.clear();
    widthCache.set(key, w);
  }
  return w;
}

/** Clear cached measurements (after web fonts load, metrics change). */
export function resetTextMetrics() {
  widthCache.clear();
}

function segWidth(font: string, text: string, spacing: number): number {
  if (!spacing) return measure(font, text);
  let w = 0;
  for (const ch of text) w += measure(font, ch) + spacing;
  return w;
}

export function styleAt(e: TextElement, i: number): CharStyle {
  const st: CharStyle = { bold: e.bold, italic: e.italic, underline: e.underline, color: null };
  if (e.runs) {
    for (const r of e.runs) {
      if (i >= r.start && i < r.end) {
        if (r.bold !== undefined) st.bold = r.bold;
        if (r.italic !== undefined) st.italic = r.italic;
        if (r.underline !== undefined) st.underline = r.underline;
        if (r.color !== undefined) st.color = r.color;
      }
    }
  }
  return st;
}

const sameStyle = (a: CharStyle, b: CharStyle) => a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.color === b.color;

function disp(e: TextElement, ch: string) {
  return e.uppercase ? ch.toUpperCase() : ch;
}

/** Split text[a, b) into segments of equal style. */
function segments(e: TextElement, a: number, b: number): Seg[] {
  const out: Seg[] = [];
  let cur: Seg | null = null;
  for (let i = a; i < b; i++) {
    const st = styleAt(e, i);
    const ch = disp(e, e.text[i]);
    if (cur && sameStyle(cur.style, st)) cur.text += ch;
    else {
      cur = { text: ch, style: st, font: fontCss(e.fontFamily, e.fontSize, st.bold, st.italic), width: 0 };
      out.push(cur);
    }
  }
  for (const s of out) s.width = segWidth(s.font, s.text, e.letterSpacing);
  return out;
}

function markerFor(e: TextElement, n: number): string | null {
  if (!e.list || e.list === 'none') return null;
  return e.list === 'bullet' ? '•' : `${n}.`;
}

export function layoutText(e: TextElement, width = e.w): TextLayout {
  const lh = e.fontSize * e.lineHeight;
  if (e.curve && Math.abs(e.curve) >= 1) return layoutCurved(e);
  const baseFont = fontCss(e.fontFamily, e.fontSize, e.bold, e.italic);
  const lines: Line[] = [];
  const text = e.text;
  let paraStart = 0;
  let n = 0;
  const hasList = !!e.list && e.list !== 'none';
  const indent = hasList ? e.fontSize * 1.25 : 0;
  const max = Math.max(1, width - indent);
  for (let p = 0; p <= text.length; p++) {
    if (p < text.length && text[p] !== '\n') continue;
    n++;
    const marker = markerFor(e, n);
    const markerWidth = marker ? measure(baseFont, marker) : 0;
    // Tokens: runs of whitespace / non-whitespace
    const tokens: [number, number][] = [];
    for (let i = paraStart; i < p; ) {
      const ws = /\s/.test(text[i]);
      let j = i + 1;
      while (j < p && /\s/.test(text[j]) === ws) j++;
      tokens.push([i, j]);
      i = j;
    }
    let line: Seg[] = [];
    let lw = 0;
    const flush = () => {
      // Trim trailing whitespace from the line
      while (line.length && !line[line.length - 1].text.trim()) {
        lw -= line[line.length - 1].width;
        line.pop();
      }
      lines.push({ segs: line, width: Math.max(0, lw - (lw ? e.letterSpacing : 0)), indent, marker: null, markerWidth: 0 });
      line = [];
      lw = 0;
    };
    const firstLineIndex = lines.length;
    for (const [a, b] of tokens) {
      const segs = segments(e, a, b);
      const tw = segs.reduce((s, x) => s + x.width, 0);
      const isSpace = !text.slice(a, b).trim();
      if (isSpace) {
        if (line.length) {
          line.push(...segs);
          lw += tw;
        }
        continue;
      }
      if (line.length && lw + tw - e.letterSpacing > max) flush();
      if (tw - e.letterSpacing > max) {
        // Break a word longer than the line, character by character.
        for (let i = a; i < b; i++) {
          const cs = segments(e, i, i + 1);
          const cw = cs[0].width;
          if (line.length && lw + cw - e.letterSpacing > max) flush();
          line.push(...cs);
          lw += cw;
        }
      } else {
        line.push(...segs);
        lw += tw;
      }
    }
    flush();
    lines[firstLineIndex].marker = marker;
    lines[firstLineIndex].markerWidth = markerWidth;
    paraStart = p + 1;
  }
  // Merge adjacent same-style segments for fewer draw calls
  for (const l of lines) {
    const merged: Seg[] = [];
    for (const s of l.segs) {
      const last = merged[merged.length - 1];
      if (last && sameStyle(last.style, s.style)) merged[merged.length - 1] = { ...last, text: last.text + s.text, width: last.width + s.width };
      else merged.push({ ...s });
    }
    l.segs = merged;
  }
  return { lines, lineHeightPx: lh, height: Math.max(lh, lines.length * lh) };
}

function layoutCurved(e: TextElement): TextLayout {
  const lh = e.fontSize * e.lineHeight;
  const c = Math.max(-100, Math.min(100, e.curve ?? 0));
  const chars: { ch: string; font: string; style: CharStyle; w: number }[] = [];
  for (let i = 0; i < e.text.length; i++) {
    const raw = e.text[i] === '\n' ? ' ' : e.text[i];
    const st = styleAt(e, i);
    const font = fontCss(e.fontFamily, e.fontSize, st.bold, st.italic);
    const ch = disp(e, raw);
    chars.push({ ch, font, style: st, w: measure(font, ch) + e.letterSpacing });
  }
  const total = Math.max(1, chars.reduce((s, x) => s + x.w, 0) - e.letterSpacing);
  const theta = Math.min(Math.PI * 1.96, (Math.abs(c) / 100) * Math.PI * 2);
  const R = total / theta;
  const half = theta / 2;
  const width = (half >= Math.PI / 2 ? 2 * R : 2 * R * Math.sin(half)) + e.fontSize;
  const arc = R * (1 - Math.cos(half));
  const height = arc + lh;
  const cx = width / 2;
  const glyphs: CurvedGlyph[] = [];
  let acc = 0;
  for (const g of chars) {
    const a = -half + (acc + (g.w - e.letterSpacing) / 2) / R;
    acc += g.w;
    if (c > 0) {
      const cy = lh / 2 + R;
      glyphs.push({ ch: g.ch, font: g.font, style: g.style, x: cx + R * Math.sin(a), y: cy - R * Math.cos(a), angle: a });
    } else {
      const cy = height - lh / 2 - R;
      glyphs.push({ ch: g.ch, font: g.font, style: g.style, x: cx + R * Math.sin(a), y: cy + R * Math.cos(a), angle: -a });
    }
  }
  return { lines: [], lineHeightPx: lh, height, width, curved: glyphs };
}

/** Longest line, for sizing new text boxes. */
export function naturalTextWidth(e: TextElement): number {
  const L = layoutText({ ...e, curve: 0 }, 1e7);
  return Math.max(...L.lines.map((l) => l.width + l.indent), e.fontSize) + 2;
}

export function linearGradientFor(ctx: CanvasRenderingContext2D, g: Gradient, w: number, h: number): CanvasGradient {
  const a = (g.angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  const grad = ctx.createLinearGradient(w / 2 - (dx * len) / 2, h / 2 - (dy * len) / 2, w / 2 + (dx * len) / 2, h / 2 + (dy * len) / 2);
  grad.addColorStop(0, g.from);
  grad.addColorStop(1, g.to);
  return grad;
}

/** Keep run offsets attached to the right characters after an edit. */
export function adjustRuns(runs: TextRun[] | undefined, before: string, after: string): TextRun[] | undefined {
  if (!runs?.length || before === after) return runs;
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let s = 0;
  while (s < before.length - p && s < after.length - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  const oldEnd = before.length - s;
  const delta = after.length - before.length;
  const map = (i: number, isEnd: boolean) => {
    if (i < p || (i === p && !isEnd)) return i;
    if (i >= oldEnd) return i + delta;
    return isEnd ? oldEnd + delta : p;
  };
  const out = runs.map((r) => ({ ...r, start: map(r.start, false), end: map(r.end, true) })).filter((r) => r.end > r.start);
  return out.length ? out : undefined;
}

/** Apply a style to text[start, end), merging with existing runs. */
export function addRun(e: TextElement, start: number, end: number, patch: Omit<TextRun, 'start' | 'end'>): TextRun[] {
  return [...(e.runs ?? []), { start, end, ...patch }];
}

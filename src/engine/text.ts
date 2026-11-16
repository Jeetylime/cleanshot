import type { TextAnnotation } from '../types';

export const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, sans-serif';

export const LINE_HEIGHT = 1.25;

export interface TextMetricsInfo {
  lines: string[];
  lineWidths: number[];
  /** Width of the widest line (glyph area). */
  textWidth: number;
  textHeight: number;
  /** Internal padding around the glyph area. */
  padX: number;
  padY: number;
  /** Full box size including padding. */
  width: number;
  height: number;
  /** Distance from line-box top to the baseline. */
  baseline: number;
  lineHeight: number;
  fontSize: number;
  font: string;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

export function fontString(weight: number, px: number): string {
  return `${weight} ${px}px ${FONT_FAMILY}`;
}

const cache = new Map<string, TextMetricsInfo>();

/**
 * Measure a text annotation in image space. `unit` converts the logical
 * font size into image pixels.
 */
export function measureText(a: Pick<TextAnnotation, 'text' | 'fontSize' | 'weight'>, unit: number): TextMetricsInfo {
  const px = a.fontSize * unit;
  const key = `${a.weight}|${px}|${a.text}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const ctx = getMeasureCtx();
  const font = fontString(a.weight, px);
  ctx.font = font;
  const lines = (a.text.length ? a.text : ' ').split('\n');
  const lineWidths = lines.map((l) => ctx.measureText(l || ' ').width);
  const m = ctx.measureText('Hg');
  const ascent = m.fontBoundingBoxAscent ?? px * 0.9;
  const descent = m.fontBoundingBoxDescent ?? px * 0.25;
  const lineHeight = px * LINE_HEIGHT;
  // Match CSS: the content area is centered within the line box.
  const baseline = (lineHeight - (ascent + descent)) / 2 + ascent;
  const textWidth = Math.max(px * 0.3, ...lineWidths);
  const textHeight = lineHeight * lines.length;
  const padX = px * 0.42;
  const padY = px * 0.22;

  const info: TextMetricsInfo = {
    lines,
    lineWidths,
    textWidth,
    textHeight,
    padX,
    padY,
    width: textWidth + padX * 2,
    height: textHeight + padY * 2,
    baseline,
    lineHeight,
    fontSize: px,
    font,
  };
  if (cache.size > 500) cache.clear();
  cache.set(key, info);
  return info;
}

import type { Annotation, AnnotationToolId, Point, ToolId } from '../types';
import { uid } from '../lib/utils';
import { measureText } from '../engine/text';
import type { ToolStyles } from './store';

export type StyleGroup = Exclude<keyof ToolStyles, 'color'>;

export const ANNOTATION_TOOLS = new Set<ToolId>([
  'arrow',
  'rect',
  'ellipse',
  'pen',
  'text',
  'step',
  'highlighter',
  'blur',
  'pixelate',
  'redact',
]);

export const CANVAS_TOOLS = new Set<ToolId>(['crop', 'resize', 'rotate', 'background', 'padding']);

export function isAnnotationTool(t: ToolId): t is AnnotationToolId {
  return ANNOTATION_TOOLS.has(t);
}

export function styleGroupOf(a: Annotation): StyleGroup {
  switch (a.type) {
    case 'marker':
    case 'highlight':
      return 'highlighter';
    default:
      return a.type;
  }
}

export function toolStyleGroup(t: ToolId): StyleGroup | null {
  return isAnnotationTool(t) ? t : null;
}

/** Instantiate a new annotation for `tool` at point `p` (image space). */
export function createAnnotation(
  tool: AnnotationToolId,
  p: Point,
  styles: ToolStyles,
  unit: number,
  existing: Annotation[],
): Annotation {
  const id = uid();
  const color = styles.color;
  switch (tool) {
    case 'arrow': {
      const s = styles.arrow;
      return { id, type: 'arrow', start: p, end: p, color, strokeWidth: s.strokeWidth, heads: s.heads, shadow: s.shadow, opacity: s.opacity };
    }
    case 'rect': {
      const s = styles.rect;
      return { id, type: 'rect', x: p.x, y: p.y, w: 0, h: 0, color, strokeWidth: s.strokeWidth, radius: s.radius, fill: s.fill, shadow: s.shadow, opacity: s.opacity };
    }
    case 'ellipse': {
      const s = styles.ellipse;
      return { id, type: 'ellipse', x: p.x, y: p.y, w: 0, h: 0, color, strokeWidth: s.strokeWidth, fill: s.fill, shadow: s.shadow, opacity: s.opacity };
    }
    case 'pen': {
      const s = styles.pen;
      return { id, type: 'pen', points: [p], color, strokeWidth: s.strokeWidth, shadow: s.shadow, opacity: s.opacity };
    }
    case 'highlighter': {
      const s = styles.highlighter;
      if (s.mode === 'box') {
        return { id, type: 'highlight', x: p.x, y: p.y, w: 0, h: 0, color: s.color, opacity: s.opacity };
      }
      return { id, type: 'marker', points: [p], color: s.color, strokeWidth: s.strokeWidth, opacity: s.opacity };
    }
    case 'text': {
      const s = styles.text;
      const m = measureText({ text: '', fontSize: s.fontSize, weight: s.weight }, unit);
      return {
        id,
        type: 'text',
        x: p.x - m.padX,
        y: p.y - m.padY - m.lineHeight / 2,
        text: '',
        color,
        fontSize: s.fontSize,
        weight: s.weight,
        style: s.style,
        shadow: s.shadow,
        opacity: s.opacity,
      };
    }
    case 'step': {
      const s = styles.step;
      const seq = existing.reduce((m, a) => (a.type === 'step' ? Math.max(m, a.seq) : m), 0) + 1;
      return { id, type: 'step', x: p.x, y: p.y, seq, size: s.size, color, shadow: s.shadow, opacity: s.opacity };
    }
    case 'blur':
    case 'pixelate':
      return { id, type: tool, x: p.x, y: p.y, w: 0, h: 0, intensity: styles[tool].intensity, color: '#000000', opacity: 1 };
    case 'redact':
      return { id, type: 'redact', x: p.x, y: p.y, w: 0, h: 0, intensity: 0, color: styles.redact.color, opacity: 1 };
  }
}

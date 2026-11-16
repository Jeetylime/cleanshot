/**
 * Studio Canvas document model.
 *
 * Every element has a box (x, y, w, h) in canvas pixels, plus a rotation in
 * degrees around the box center. Element order in `elements` is the z-order
 * (last = top). Images reference assets by id; the pixels live in the image
 * registry (engine/images) and in IndexedDB, never in the document itself, so
 * history snapshots stay small.
 */

export type PatternKind = 'dots' | 'grid' | 'stripes' | 'checks';

export type StudioFill =
  | { kind: 'transparent' }
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; from: string; to: string; angle: number }
  | { kind: 'pattern'; pattern: PatternKind; bg: string; fg: string; size: number };

export interface Shadow {
  enabled: boolean;
  color: string;
  blur: number;
  x: number;
  y: number;
  /** 0–1 */
  opacity: number;
}

interface ElementBase {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise, around the box center. */
  rotation: number;
  /** 0–1 */
  opacity: number;
  locked: boolean;
  hidden: boolean;
  /** Elements sharing a group id are selected and moved together. */
  groupId: string | null;
  shadow: Shadow;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TextElement extends ElementBase {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  align: TextAlign;
  /** Extra space between letters, in px at font size. */
  letterSpacing: number;
  /** Multiple of font size. */
  lineHeight: number;
  strokeWidth: number;
  strokeColor: string;
  /** Uppercase rendering without changing the stored text. */
  uppercase: boolean;
}

export type ShapeKind = 'rect' | 'ellipse' | 'triangle' | 'star' | 'hexagon' | 'diamond' | 'heart' | 'bubble';

export interface ShapeElement extends ElementBase {
  type: 'shape';
  shape: ShapeKind;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  /** Corner radius for rectangles. */
  radius: number;
}

export interface LineElement extends ElementBase {
  type: 'line';
  /** Drawn horizontally through the box center; rotate the element to angle it. */
  color: string;
  strokeWidth: number;
  dash: 'solid' | 'dashed' | 'dotted';
  startHead: boolean;
  endHead: boolean;
}

export interface CropRect {
  /** In source image pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageElement extends ElementBase {
  type: 'image';
  assetId: string;
  crop: CropRect;
  flipX: boolean;
  flipY: boolean;
  radius: number;
  borderWidth: number;
  borderColor: string;
}

export interface IconElement extends ElementBase {
  type: 'icon';
  icon: string;
  color: string;
  /** Stroke width in the icon's 24-unit box. */
  weight: number;
  filled: boolean;
}

export type StudioElement = TextElement | ShapeElement | LineElement | ImageElement | IconElement;
export type ElementType = StudioElement['type'];

export interface StudioDoc {
  id: string;
  name: string;
  width: number;
  height: number;
  background: StudioFill;
  elements: StudioElement[];
  createdAt: number;
  updatedAt: number;
}

export interface Asset {
  id: string;
  width: number;
  height: number;
  name: string;
}

export interface StudioView {
  zoom: number;
  /** Screen offset (CSS px) of the canvas origin inside the stage. */
  x: number;
  y: number;
  mode: 'fit' | 'manual';
}

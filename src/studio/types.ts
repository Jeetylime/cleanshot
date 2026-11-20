/**
 * Studio Canvas document model.
 *
 * Every element has a box (x, y, w, h) in canvas pixels, plus a rotation in
 * degrees around the box center. Element order in `elements` is the z-order
 * (last = top). Images reference assets by id; the pixels live in the image
 * registry (engine/images) and in IndexedDB, never in the document itself, so
 * history snapshots stay small.
 */

import type { Adjust } from './imageFx';

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

/** Linear gradient across an element's box (CSS angle: 0 = up, 90 = right). */
export interface Gradient {
  from: string;
  to: string;
  angle: number;
}

/** Style override for part of a text, by character offsets into `text`. */
export interface TextRun {
  start: number;
  end: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
}

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
  /** Styled ranges (later runs win). */
  runs?: TextRun[];
  list?: 'none' | 'bullet' | 'number';
  /** -100 to 100; 0 = straight. Positive arches up, negative curves down. */
  curve?: number;
  /** Gradient fill instead of `color` (runs with a color still use it). */
  gradient?: Gradient | null;
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
  /** Gradient fill instead of `fill`. */
  gradient?: Gradient | null;
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
  /** Non-destructive adjustments (see imageFx). Optional for older designs. */
  adjust?: Adjust;
  /** Clip the image to a shape (a "frame"). Null = rectangle with `radius`. */
  mask?: ShapeKind | null;
}

export interface IconElement extends ElementBase {
  type: 'icon';
  icon: string;
  color: string;
  /** Stroke width in the icon's 24-unit box. */
  weight: number;
  filled: boolean;
}

export type ChartKind = 'bar' | 'column' | 'line' | 'pie' | 'donut';

export interface ChartElement extends ElementBase {
  type: 'chart';
  chart: ChartKind;
  data: { label: string; value: number }[];
  colors: string[];
  textColor: string;
  fontFamily: string;
  showLabels: boolean;
  showValues: boolean;
}

export interface QrElement extends ElementBase {
  type: 'qr';
  data: string;
  fg: string;
  /** Null = transparent. */
  bg: string | null;
  ecc: 'L' | 'M' | 'Q' | 'H';
  rounded: boolean;
}

export type Brush = 'pen' | 'marker' | 'highlighter';

/** A freehand stroke. Points are stored relative to the element box, so it moves, scales and rotates like any element. */
export interface DrawElement extends ElementBase {
  type: 'draw';
  brush: Brush;
  /** Flat [x0, y0, x1, y1, …] list, each coordinate 0–1 within the box. */
  points: number[];
  color: string;
  /** Stroke width in design px. */
  strokeWidth: number;
}

export type StudioElement = TextElement | ShapeElement | LineElement | ImageElement | IconElement | ChartElement | QrElement | DrawElement;
export type ElementType = StudioElement['type'];

export interface PageData {
  id: string;
  background: StudioFill;
  elements: StudioElement[];
}

export interface UserGuide {
  id: string;
  /** 'x' = vertical line at x = pos; 'y' = horizontal line at y = pos. */
  axis: 'x' | 'y';
  pos: number;
}

export interface StudioDoc {
  id: string;
  name: string;
  width: number;
  height: number;
  /** The page being edited (mirrored into `pages[pageIndex]` by syncPages). */
  background: StudioFill;
  elements: StudioElement[];
  /** Every page. The entry at `pageIndex` may be stale while it is active; use allPages(). */
  pages: PageData[];
  pageIndex: number;
  /** Display names for groups, by group id. */
  groupNames?: Record<string, string>;
  /** Guides dragged out of the rulers (design px), shared by every page. */
  userGuides?: UserGuide[];
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

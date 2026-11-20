/**
 * Core document model.
 *
 * Geometry is stored in *image space* (pixels of the current base image,
 * origin at its top-left corner). Visual sizes such as stroke widths, font
 * sizes, padding and radii are stored in *logical units* and multiplied by
 * `doc.unit` when rendering. This keeps annotations looking the same on 1x
 * and 2x screenshots and makes resampling the image a matter of scaling
 * geometry plus `unit`.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type AnnotationToolId =
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'pen'
  | 'text'
  | 'step'
  | 'highlighter'
  | 'magnify'
  | 'measure'
  | 'blur'
  | 'pixelate'
  | 'redact';

export type CanvasToolId = 'crop' | 'resize' | 'rotate' | 'background' | 'padding';

export type ToolId = 'select' | AnnotationToolId | CanvasToolId;

export type FillMode = 'none' | 'tint' | 'solid';

interface AnnotationBase {
  id: string;
  /** 0–1. Ignored for privacy annotations, which are always opaque. */
  opacity: number;
}

export interface ArrowAnnotation extends AnnotationBase {
  type: 'arrow';
  start: Point;
  end: Point;
  color: string;
  strokeWidth: number;
  heads: 'end' | 'both' | 'none';
  shadow: boolean;
  /**
   * Bend: signed distance (image px) of the curve's midpoint from the straight
   * line, measured to the left of start→end. 0 or missing = straight.
   */
  curve?: number;
}

/**
 * Magnifier: a lens (the box) showing an enlarged copy of the image around
 * the source point, linked to it by a connector.
 */
export interface MagnifyAnnotation extends AnnotationBase {
  type: 'magnify';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Center of the magnified area, in image space. */
  sx: number;
  sy: number;
  zoom: number;
  shape: 'circle' | 'rounded';
  color: string;
  strokeWidth: number;
  shadow: boolean;
}

/** Dimension line labelled with its length in logical pixels. */
export interface MeasureAnnotation extends AnnotationBase {
  type: 'measure';
  start: Point;
  end: Point;
  color: string;
  strokeWidth: number;
}

export interface RectAnnotation extends AnnotationBase {
  type: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  strokeWidth: number;
  radius: number;
  fill: FillMode;
  shadow: boolean;
}

export interface EllipseAnnotation extends AnnotationBase {
  type: 'ellipse';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  strokeWidth: number;
  fill: FillMode;
  shadow: boolean;
}

export interface PenAnnotation extends AnnotationBase {
  type: 'pen';
  points: Point[];
  color: string;
  strokeWidth: number;
  shadow: boolean;
}

/** Freehand highlighter stroke. */
export interface MarkerAnnotation extends AnnotationBase {
  type: 'marker';
  points: Point[];
  color: string;
  strokeWidth: number;
}

/** Rectangular highlighter area. */
export interface HighlightAnnotation extends AnnotationBase {
  type: 'highlight';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  /** Spotlight: dim everything outside the box (with `color` at `opacity`) instead of tinting inside it. */
  spotlight?: boolean;
}

export type TextStyle = 'plain' | 'outline' | 'filled';

export interface TextAnnotation extends AnnotationBase {
  type: 'text';
  /** Top-left of the text box (including internal padding). */
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  weight: 400 | 600 | 800;
  style: TextStyle;
  shadow: boolean;
}

export interface StepAnnotation extends AnnotationBase {
  type: 'step';
  /** Center of the marker. */
  x: number;
  y: number;
  /** Creation sequence; markers are numbered by ascending seq. */
  seq: number;
  size: number;
  color: string;
  shadow: boolean;
}

export interface PrivacyAnnotation extends AnnotationBase {
  type: 'blur' | 'pixelate' | 'redact';
  x: number;
  y: number;
  w: number;
  h: number;
  /** 1–100. Blur radius / pixel block size. */
  intensity: number;
  /** Redaction fill color. */
  color: string;
}

export type Annotation =
  | ArrowAnnotation
  | RectAnnotation
  | EllipseAnnotation
  | PenAnnotation
  | MarkerAnnotation
  | HighlightAnnotation
  | TextAnnotation
  | StepAnnotation
  | MagnifyAnnotation
  | MeasureAnnotation
  | PrivacyAnnotation;

export type AnnotationType = Annotation['type'];

export interface MeshBlob {
  x: number; // 0–1
  y: number; // 0–1
  r: number; // relative to max(w, h)
  color: string;
}

export type BackgroundFill =
  | { kind: 'transparent' }
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; from: string; to: string; angle: number }
  | { kind: 'mesh'; base: string; blobs: MeshBlob[] };

export type AspectRatioId = 'auto' | '1:1' | '4:3' | '3:2' | '16:9' | '16:10' | '4:5' | '9:16';

export type DeviceFrame = 'none' | 'browser' | 'browser-dark' | 'window' | 'phone' | 'laptop';

export interface BackgroundSettings {
  enabled: boolean;
  fill: BackgroundFill;
  /** Preset id when the fill came from a preset, for highlighting in the UI. */
  presetId: string | null;
  padding: number;
  radius: number;
  /** 0–100 */
  shadow: number;
  aspect: AspectRatioId;
  /** Mockup drawn around the screenshot (see engine/devices.ts). */
  device?: DeviceFrame;
  /** Text in a browser mockup's address bar. */
  deviceLabel?: string;
}

export interface EditorDoc {
  /** Session id, used for recovery. */
  id: string;
  name: string;
  imageId: string;
  originalImageId: string;
  width: number;
  height: number;
  /** Visual scale factor applied to logical sizes. */
  unit: number;
  /** Unit of the original image, restored by "Revert to original". */
  originalUnit: number;
  annotations: Annotation[];
  background: BackgroundSettings;
  createdAt: number;
}

export interface ViewState {
  zoom: number;
  /** Screen-space offset (CSS px) of the image-space origin. */
  x: number;
  y: number;
  /** In "fit" mode the view refits automatically when the document or viewport changes. */
  mode: 'fit' | 'manual';
}

export interface CropState {
  rect: Rect;
  /** width / height, or null for freeform. */
  aspect: number | null;
  aspectId: string;
}

export type ExportFormat = 'png' | 'jpeg' | 'webp';

export type Theme = 'dark' | 'light' | 'system';
export type Backdrop = 'auto' | 'dark' | 'light' | 'checker';
export type TextSize = 'default' | 'large' | 'larger';
export interface A11yPrefs {
  textSize: TextSize;
  reduceMotion: boolean;
  highContrast: boolean;
  underlineLinks: boolean;
}

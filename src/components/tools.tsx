import type { ComponentType, SVGProps } from 'react';
import {
  Circle,
  Crop,
  Droplets,
  Grid3x3,
  Highlighter,
  MousePointer2,
  MoveUpRight,
  Pencil,
  RotateCw,
  Ruler,
  ZoomIn,
  Scaling,
  Square,
  Type,
  Wallpaper,
} from 'lucide-react';
import type { ToolId } from '../types';

type IconProps = SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number };
export type IconComponent = ComponentType<IconProps>;

function svgProps({ size = 24, strokeWidth = 2, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...rest,
  };
}

export function StepIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10.5 9.5 12.5 8v8" />
    </svg>
  );
}

export function RedactIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <rect x="6.5" y="10" width="11" height="4" rx="1" fill="currentColor" />
    </svg>
  );
}

export function PaddingIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <rect x="3" y="3" width="18" height="18" rx="3.5" strokeDasharray="2.5 3" />
      <rect x="7.5" y="7.5" width="9" height="9" rx="1.5" />
    </svg>
  );
}

export interface ToolDef {
  id: ToolId;
  label: string;
  shortcut?: string;
  icon: IconComponent;
  hint: string;
}

export interface ToolGroup {
  id: string;
  label: string;
  tools: ToolDef[];
}

export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'annotate',
    label: 'Annotate',
    tools: [
      { id: 'select', label: 'Select', shortcut: 'V', icon: MousePointer2, hint: 'Select, move and resize annotations' },
      { id: 'arrow', label: 'Arrow', shortcut: 'A', icon: MoveUpRight, hint: 'Drag to draw. Shift snaps to 45°' },
      { id: 'rect', label: 'Rectangle', shortcut: 'R', icon: Square, hint: 'Drag to draw. Shift for square, ⌥ from center' },
      { id: 'ellipse', label: 'Ellipse', shortcut: 'O', icon: Circle, hint: 'Drag to draw. Shift for circle' },
      { id: 'pen', label: 'Draw', shortcut: 'D', icon: Pencil, hint: 'Freehand. Hold Shift for a straight line' },
      { id: 'text', label: 'Text', shortcut: 'T', icon: Type, hint: 'Click to add text' },
      { id: 'step', label: 'Numbered step', shortcut: 'N', icon: StepIcon, hint: 'Click to place numbered markers' },
      { id: 'highlighter', label: 'Highlighter', shortcut: 'H', icon: Highlighter, hint: 'Highlight text or areas' },
      { id: 'magnify', label: 'Magnifier', shortcut: 'L', icon: ZoomIn, hint: 'Drag over a detail to show it enlarged beside it' },
      { id: 'measure', label: 'Measure', shortcut: 'U', icon: Ruler, hint: 'Drag to measure a distance. Shift snaps to 45°' },
    ],
  },
  {
    id: 'privacy',
    label: 'Privacy',
    tools: [
      { id: 'blur', label: 'Blur', shortcut: 'B', icon: Droplets, hint: 'Drag over sensitive content to blur it' },
      { id: 'pixelate', label: 'Pixelate', shortcut: 'X', icon: Grid3x3, hint: 'Drag to pixelate a region' },
      { id: 'redact', label: 'Redact', shortcut: 'M', icon: RedactIcon, hint: 'Drag to cover with a solid block' },
    ],
  },
  {
    id: 'canvas',
    label: 'Canvas',
    tools: [
      { id: 'crop', label: 'Crop', shortcut: 'C', icon: Crop, hint: 'Crop the screenshot' },
      { id: 'resize', label: 'Resize', icon: Scaling, hint: 'Change image dimensions' },
      { id: 'rotate', label: 'Rotate & flip', icon: RotateCw, hint: 'Rotate or mirror the image' },
      { id: 'background', label: 'Background', shortcut: 'G', icon: Wallpaper, hint: 'Place the screenshot on a background' },
      { id: 'padding', label: 'Padding & shadow', shortcut: 'P', icon: PaddingIcon, hint: 'Padding, corners and shadow' },
    ],
  },
];

export const ALL_TOOLS: ToolDef[] = TOOL_GROUPS.flatMap((g) => g.tools);

export const TOOL_BY_SHORTCUT: Record<string, ToolId> = Object.fromEntries(
  ALL_TOOLS.filter((t) => t.shortcut).map((t) => [t.shortcut!.toLowerCase(), t.id]),
);

export function toolDef(id: ToolId): ToolDef | undefined {
  return ALL_TOOLS.find((t) => t.id === id);
}

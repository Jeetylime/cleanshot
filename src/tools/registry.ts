import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { ArrowLeftRight, Crop, Eraser, Expand, FileSearch, Pipette, Scaling, Shrink, type LucideIcon } from 'lucide-react';
import type { ToolKey } from '../app/route';

export type ToolGroupId = 'ai' | 'editing' | 'optimization' | 'utilities';

export interface ToolMeta {
  key: ToolKey;
  name: string;
  description: string;
  group: ToolGroupId;
  icon: LucideIcon;
  ai: boolean;
  batch: boolean;
  component: LazyExoticComponent<ComponentType>;
}

export const TOOL_GROUPS: { id: ToolGroupId; label: string }[] = [
  { id: 'ai', label: 'Smart Tools' },
  { id: 'editing', label: 'Image Editing' },
  { id: 'optimization', label: 'Image Optimization' },
  { id: 'utilities', label: 'Image Utilities' },
];

// Each tool is code-split: its code (and any AI runtime) loads only when opened.
export const TOOLS: ToolMeta[] = [
  {
    key: 'background-remover',
    name: 'Background Remover',
    description: 'Cut out the subject automatically, then refine edges with a brush.',
    group: 'ai',
    icon: Eraser,
    ai: true,
    batch: false,
    component: lazy(() => import('./bgremove/BackgroundRemover')),
  },
  {
    key: 'upscaler',
    name: 'Image Upscaler',
    description: 'Enlarge images 2× or 4× with a super-resolution model.',
    group: 'ai',
    icon: Expand,
    ai: true,
    batch: false,
    component: lazy(() => import('./upscaler/Upscaler')),
  },
  {
    key: 'resizer',
    name: 'Image Resizer',
    description: 'Resize to exact pixels, a percentage or social media sizes.',
    group: 'editing',
    icon: Scaling,
    ai: false,
    batch: true,
    component: lazy(() => import('./resizer/Resizer')),
  },
  {
    key: 'cropper',
    name: 'Image Cropper',
    description: 'Crop freely or to a ratio, rotate and flip.',
    group: 'editing',
    icon: Crop,
    ai: false,
    batch: false,
    component: lazy(() => import('./cropper/Cropper')),
  },
  {
    key: 'compressor',
    name: 'Image Compressor',
    description: 'Shrink file sizes with JPEG, WebP or optimized PNG.',
    group: 'optimization',
    icon: Shrink,
    ai: false,
    batch: true,
    component: lazy(() => import('./compressor/Compressor')),
  },
  {
    key: 'converter',
    name: 'Image Converter',
    description: 'Convert between PNG, JPEG, WebP and AVIF in bulk.',
    group: 'optimization',
    icon: ArrowLeftRight,
    ai: false,
    batch: true,
    component: lazy(() => import('./converter/Converter')),
  },
  {
    key: 'metadata',
    name: 'Metadata Viewer',
    description: 'Inspect dimensions, color info and EXIF, then strip it.',
    group: 'utilities',
    icon: FileSearch,
    ai: false,
    batch: false,
    component: lazy(() => import('./metadata/MetadataViewer')),
  },
  {
    key: 'color-picker',
    name: 'Color Picker',
    description: 'Sample any pixel and extract the dominant palette.',
    group: 'utilities',
    icon: Pipette,
    ai: false,
    batch: false,
    component: lazy(() => import('./colorpicker/ColorPicker')),
  },
];

export function toolMeta(key: ToolKey): ToolMeta {
  return TOOLS.find((t) => t.key === key)!;
}

import { lazyTool } from './lazyTool';
import { type ComponentType, type LazyExoticComponent } from 'react';
import { AppWindow, Clapperboard, Film, ArrowLeftRight, Crop, Droplet, Eraser, Expand, FileSearch, FileText, GitCompareArrows, Grid2x2, LayoutDashboard, LayoutGrid, Pipette, Scaling, Share2, Shrink, SlidersHorizontal, type LucideIcon } from 'lucide-react';
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
  /** Start downloading the tool's code (e.g. on hover) without rendering it. */
  load: () => Promise<unknown>;
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
    ...lazyTool(() => import('./bgremove/BackgroundRemover')),
  },
  {
    key: 'upscaler',
    name: 'Image Upscaler',
    description: 'Enlarge images 2× or 4× with a super-resolution model.',
    group: 'ai',
    icon: Expand,
    ai: true,
    batch: false,
    ...lazyTool(() => import('./upscaler/Upscaler')),
  },
  {
    key: 'resizer',
    name: 'Image Resizer',
    description: 'Resize to exact pixels, a percentage or social media sizes.',
    group: 'editing',
    icon: Scaling,
    ai: false,
    batch: true,
    ...lazyTool(() => import('./resizer/Resizer')),
  },
  {
    key: 'cropper',
    name: 'Image Cropper',
    description: 'Crop freely or to a ratio, rotate and flip.',
    group: 'editing',
    icon: Crop,
    ai: false,
    batch: false,
    ...lazyTool(() => import('./cropper/Cropper')),
  },
  {
    key: 'compressor',
    name: 'Image Compressor',
    description: 'Shrink file sizes with JPEG, WebP or optimized PNG.',
    group: 'optimization',
    icon: Shrink,
    ai: false,
    batch: true,
    ...lazyTool(() => import('./compressor/Compressor')),
  },
  {
    key: 'converter',
    name: 'Image Converter',
    description: 'Convert between PNG, JPEG, WebP and AVIF in bulk.',
    group: 'optimization',
    icon: ArrowLeftRight,
    ai: false,
    batch: true,
    ...lazyTool(() => import('./converter/Converter')),
  },
  {
    key: 'metadata',
    name: 'Metadata Viewer',
    description: 'Inspect dimensions, color info and EXIF, then strip it.',
    group: 'utilities',
    icon: FileSearch,
    ai: false,
    batch: false,
    ...lazyTool(() => import('./metadata/MetadataViewer')),
  },
  {
    key: 'color-picker',
    name: 'Color Picker',
    description: 'Sample any pixel and extract the dominant palette.',
    group: 'utilities',
    icon: Pipette,
    ai: false,
    batch: false,
    ...lazyTool(() => import('./colorpicker/ColorPicker')),
  },
  {
    key: 'watermark',
    name: 'Watermark',
    description: 'Stamp text or a logo onto many images at once.',
    group: 'editing',
    icon: Droplet,
    ai: false,
    batch: true,
    ...lazyTool(() => import('./watermark/Watermark')),
  },
  {
    key: 'collage',
    name: 'Collage Maker',
    description: 'Arrange several photos into a tidy grid.',
    group: 'editing',
    icon: LayoutGrid,
    ai: false,
    batch: true,
    ...lazyTool(() => import('./collage/Collage')),
  },
  {
    key: 'favicon',
    name: 'Favicon Generator',
    description: 'Make favicons, app icons and a .ico from one image.',
    group: 'utilities',
    icon: AppWindow,
    ai: false,
    batch: false,
    ...lazyTool(() => import('./favicon/Favicon')),
  },
  {
    key: 'frames',
    name: 'GIF Frame Extractor',
    description: 'Split animated GIF, WebP or PNG into individual frames.',
    group: 'utilities',
    icon: Film,
    ai: false,
    batch: false,
    ...lazyTool(() => import('./frames/Frames')),
  },
  {
    key: 'photo-filters',
    name: 'Photo Filters',
    description: 'Adjust light and color, or apply film looks, to many photos at once.',
    group: 'editing',
    icon: SlidersHorizontal,
    ai: false,
    batch: true,
    ...lazyTool(() => import('./filters/Filters')),
  },
  {
    key: 'animation',
    name: 'GIF & Video Maker',
    description: 'Turn images into an animated GIF or video slideshow with transitions.',
    group: 'editing',
    icon: Clapperboard,
    ai: false,
    batch: true,
    ...lazyTool(() => import('./animation/AnimationMaker')),
  },
  {
    key: 'splitter',
    name: 'Image Splitter',
    description: 'Cut an image into a grid of tiles, such as carousel slides.',
    group: 'editing',
    icon: Grid2x2,
    ai: false,
    batch: false,
    ...lazyTool(() => import('./splitter/Splitter')),
  },
  {
    key: 'social-sizes',
    name: 'Social Media Sizes',
    description: 'Make every social size at once from one image or a branded placeholder.',
    group: 'editing',
    icon: Share2,
    ai: false,
    batch: false,
    ...lazyTool(() => import('./social/SocialSizes')),
  },
  {
    key: 'sprite-sheet',
    name: 'Sprite Sheet Builder',
    description: 'Pack icons or frames into one image with CSS and a JSON atlas.',
    group: 'utilities',
    icon: LayoutDashboard,
    ai: false,
    batch: true,
    ...lazyTool(() => import('./sprites/SpriteSheet')),
  },
  {
    key: 'batch-rename',
    name: 'Batch Rename',
    description: 'Rename many images with a pattern, numbers and dates.',
    group: 'utilities',
    icon: FileText,
    ai: false,
    batch: true,
    ...lazyTool(() => import('./rename/BatchRename')),
  },
  {
    key: 'image-diff',
    name: 'Image Diff',
    description: 'Compare two images: highlight changed pixels, overlay or slide.',
    group: 'utilities',
    icon: GitCompareArrows,
    ai: false,
    batch: false,
    ...lazyTool(() => import('./diff/ImageDiff')),
  },
];

export function toolMeta(key: ToolKey): ToolMeta {
  return TOOLS.find((t) => t.key === key)!;
}

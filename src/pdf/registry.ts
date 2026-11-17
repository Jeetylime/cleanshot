import { lazyTool } from '../tools/lazyTool';
import { ClipboardList, Combine, Crop, FileImage, FileText, Hash, Images, LayoutGrid, PenLine, Scissors, Shrink } from 'lucide-react';
import type { SectionTool } from '../tools/ToolSection';

export const PDF_GROUPS = [
  { id: 'combine', label: 'Combine & Split' },
  { id: 'edit', label: 'Edit & Sign' },
  { id: 'convert', label: 'Optimize & Convert' },
];

export const PDF_TOOLS: SectionTool[] = [
  { key: 'pdf-merge', name: 'Merge PDFs', description: 'Combine several PDFs into one, in the order you choose.', group: 'combine', icon: Combine, batch: true, ...lazyTool(() => import('./tools/Merge')) },
  { key: 'pdf-split', name: 'Split PDF', description: 'Extract pages, or split into single pages or equal parts.', group: 'combine', icon: Scissors, ...lazyTool(() => import('./tools/Split')) },
  { key: 'pdf-organize', name: 'Organize Pages', description: 'Reorder, rotate and delete pages with drag and drop.', group: 'edit', icon: LayoutGrid, ...lazyTool(() => import('./tools/Organize')) },
  { key: 'pdf-sign', name: 'Sign PDF', description: 'Draw, type or upload a signature and place it on any page.', group: 'edit', icon: PenLine, ...lazyTool(() => import('./tools/Sign')) },
  { key: 'pdf-compress', name: 'Compress PDF', description: 'Shrink file size losslessly, or much smaller as images.', group: 'convert', icon: Shrink, ...lazyTool(() => import('./tools/Compress')) },
  { key: 'images-to-pdf', name: 'Images to PDF', description: 'Turn photos, scans and screenshots into one PDF.', group: 'convert', icon: FileImage, batch: true, ...lazyTool(() => import('./tools/ImagesToPdf')) },
  { key: 'pdf-to-images', name: 'PDF to Images', description: 'Save pages as PNG or JPEG at the resolution you need.', group: 'convert', icon: Images, ...lazyTool(() => import('./tools/PdfToImages')) },
  { key: 'pdf-stamp', name: 'Page Numbers & Watermark', description: 'Add page numbers, headers, footers or a diagonal watermark.', group: 'edit', icon: Hash, ...lazyTool(() => import('./tools/Stamp')) },
  { key: 'pdf-form', name: 'Fill Form', description: 'Type into a PDF’s form fields, then save or flatten it.', group: 'edit', icon: ClipboardList, ...lazyTool(() => import('./tools/FillForm')) },
  { key: 'pdf-crop', name: 'Crop Margins', description: 'Trim white margins automatically, or crop every page by a set amount.', group: 'edit', icon: Crop, ...lazyTool(() => import('./tools/CropMargins')) },
  { key: 'pdf-text', name: 'Extract Text', description: 'Pull the text out of a PDF as plain text or Markdown.', group: 'convert', icon: FileText, ...lazyTool(() => import('./tools/ExtractText')) },
];

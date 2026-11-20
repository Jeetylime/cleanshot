import { saveFileSupported } from '../lib/fileSave';
import { useEffect } from 'react';
import {
  Link2,
  Unlink,
  Table2,
  History,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  BookmarkPlus,
  Brush,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Download,
  Eraser,
  Expand,
  FilePlus2,
  FileDown,
  Grid3x3,
  Group,
  Highlighter,
  Image as ImageIcon,
  Keyboard,
  Layers,
  LayoutTemplate,
  Lock,
  Maximize,
  Minus,
  MoveRight,
  Palette,
  PenLine,
  QrCode,
  Ratio,
  Redo2,
  RotateCcw,
  RotateCw,
  Ruler,
  Search,
  Shapes,
  SquareDashedMousePointer,
  Sticker,
  Trash2,
  Type,
  Undo2,
  Ungroup,
  Unlock,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { registerCommands, type Command } from '../app/commands';
import { pickFiles } from '../tools/shared/ui';
import { shortcutLabel } from '../lib/utils';
import { studio, redo, undo, selectedElements } from './store';
import * as A from './actions';
import { SHAPE_LABELS } from './factory';
import { ICONS } from './iconData';
import { STICKERS } from './stickers';
import { TEMPLATES } from './templates';
import { getViewOptions, setViewOptions } from './viewOptions';
import type { Brush as BrushId, ChartKind, ShapeKind } from './types';

const SHAPES: ShapeKind[] = ['rect', 'ellipse', 'triangle', 'star', 'hexagon', 'diamond', 'heart', 'bubble'];
const SHAPE_WORDS: Partial<Record<ShapeKind, string>> = { rect: 'rectangle square box', ellipse: 'circle oval', bubble: 'speech chat callout', heart: 'love' };
const CHARTS: [ChartKind, string][] = [
  ['bar', 'Bar'],
  ['column', 'Column'],
  ['line', 'Line'],
  ['pie', 'Pie'],
  ['donut', 'Donut'],
];

function draw(brush: BrushId | 'eraser') {
  const d = studio.get().draw;
  studio.set({ draw: brush === 'eraser' ? { ...d, eraser: true } : { ...d, brush, eraser: false }, panel: 'draw' });
}

function canvasCommands(openShortcuts: () => void): Command[] {
  const s = studio.get();
  const doc = s.doc;
  if (!doc) return [];
  const sel = selectedElements(s);
  const locked = sel.length > 0 && sel.every((e) => e.locked);
  const view = getViewOptions();
  const pages = doc.pages?.length ?? 1;
  const C = 'Canvas';
  const ADD = 'Add';
  const SEL = 'Selection';
  const cmds: Command[] = [];

  if (sel.length) {
    cmds.push(
      { id: 'cv-dup-linked', label: 'Duplicate as linked copy', section: SEL, keywords: 'component instance symbol sync link reuse', icon: <Link2 size={15} />, run: A.duplicateLinked },
      ...(sel.some((e) => e.linkId) ? [{ id: 'cv-unlink', label: 'Unlink copy', section: SEL, keywords: 'detach component instance', icon: <Unlink size={15} />, run: A.unlinkSelection }] : []),
      { id: 'cv-dup', label: 'Duplicate selection', section: SEL, keywords: 'copy clone', icon: <CopyPlus size={15} />, shortcut: shortcutLabel('D'), run: A.duplicateSelection },
      { id: 'cv-del', label: 'Delete selection', section: SEL, keywords: 'remove', icon: <Trash2 size={15} />, shortcut: '⌫', run: A.deleteSelection },
      { id: 'cv-copy', label: 'Copy selection', section: SEL, icon: <Copy size={15} />, shortcut: shortcutLabel('C'), run: () => void A.copySelection() },
      { id: 'cv-lock', label: locked ? 'Unlock selection' : 'Lock selection', section: SEL, icon: locked ? <Unlock size={15} /> : <Lock size={15} />, shortcut: shortcutLabel('L'), run: () => A.toggleLock() },
      { id: 'cv-front', label: 'Bring to front', section: SEL, keywords: 'arrange order layer top', icon: <ArrowUpToLine size={15} />, run: () => A.reorder('front') },
      { id: 'cv-forward', label: 'Bring forward', section: SEL, keywords: 'arrange order layer up', icon: <ArrowUp size={15} />, run: () => A.reorder('forward') },
      { id: 'cv-backward', label: 'Send backward', section: SEL, keywords: 'arrange order layer down', icon: <ArrowDown size={15} />, run: () => A.reorder('backward') },
      { id: 'cv-back', label: 'Send to back', section: SEL, keywords: 'arrange order layer bottom', icon: <ArrowDownToLine size={15} />, run: () => A.reorder('back') },
      { id: 'cv-align-left', label: 'Align left', section: SEL, keywords: 'align page', icon: <AlignStartVertical size={15} />, run: () => A.align('left') },
      { id: 'cv-align-hc', label: 'Align center (horizontally)', section: SEL, keywords: 'align middle page centre', icon: <AlignCenterVertical size={15} />, run: () => A.align('hcenter') },
      { id: 'cv-align-right', label: 'Align right', section: SEL, keywords: 'align page', icon: <AlignEndVertical size={15} />, run: () => A.align('right') },
      { id: 'cv-align-top', label: 'Align top', section: SEL, keywords: 'align page', icon: <AlignStartHorizontal size={15} />, run: () => A.align('top') },
      { id: 'cv-align-vc', label: 'Align middle (vertically)', section: SEL, keywords: 'align center page centre', icon: <AlignCenterHorizontal size={15} />, run: () => A.align('vcenter') },
      { id: 'cv-align-bottom', label: 'Align bottom', section: SEL, keywords: 'align page', icon: <AlignEndHorizontal size={15} />, run: () => A.align('bottom') },
      { id: 'cv-rot-l', label: 'Rotate 90° left', section: SEL, keywords: 'turn counterclockwise', icon: <RotateCcw size={15} />, run: () => A.rotateBy(-90) },
      { id: 'cv-rot-r', label: 'Rotate 90° right', section: SEL, keywords: 'turn clockwise', icon: <RotateCw size={15} />, run: () => A.rotateBy(90) },
    );
    if (A.canGroup(s)) cmds.push({ id: 'cv-group', label: 'Group selection', section: SEL, icon: <Group size={15} />, shortcut: shortcutLabel('G'), run: A.groupSelection });
    if (A.canUngroup(s)) cmds.push({ id: 'cv-ungroup', label: 'Ungroup', section: SEL, icon: <Ungroup size={15} />, shortcut: shortcutLabel('⇧G'), run: A.ungroupSelection });
  }

  cmds.push(
    { id: 'cv-export', label: 'Download / export…', section: C, keywords: 'export save png jpg pdf svg webp image', icon: <Download size={15} />, run: () => studio.set({ exportOpen: true }) },
    { id: 'cv-undo', label: 'Undo', section: C, icon: <Undo2 size={15} />, shortcut: shortcutLabel('Z'), run: undo },
    { id: 'cv-redo', label: 'Redo', section: C, icon: <Redo2 size={15} />, shortcut: shortcutLabel('⇧Z'), run: redo },
    { id: 'cv-paste', label: 'Paste', section: C, keywords: 'clipboard', icon: <ClipboardPaste size={15} />, shortcut: shortcutLabel('V'), run: () => void A.pasteClipboard() },
    { id: 'cv-select-all', label: 'Select all', section: C, icon: <SquareDashedMousePointer size={15} />, shortcut: shortcutLabel('A'), run: A.selectAll },
    { id: 'cv-heading', label: 'Add heading', section: ADD, keywords: 'text title', icon: <Type size={15} />, run: () => A.addText('heading') },
    { id: 'cv-subheading', label: 'Add subheading', section: ADD, keywords: 'text subtitle', icon: <Type size={15} />, run: () => A.addText('subheading') },
    { id: 'cv-body', label: 'Add body text', section: ADD, keywords: 'text paragraph', icon: <Type size={15} />, run: () => A.addText('body') },
    ...SHAPES.map((k) => ({ id: `cv-shape-${k}`, label: `Add ${SHAPE_LABELS[k].toLowerCase()}`, section: ADD, keywords: `shape ${SHAPE_WORDS[k] ?? ''}`, icon: <Shapes size={15} />, run: () => A.addShape(k) })),
    { id: 'cv-line', label: 'Add line', section: ADD, keywords: 'divider rule', icon: <Minus size={15} />, run: () => A.addLine(false) },
    { id: 'cv-arrow', label: 'Add arrow', section: ADD, keywords: 'line pointer', icon: <MoveRight size={15} />, run: () => A.addLine(true) },
    { id: 'cv-image', label: 'Add image…', section: ADD, keywords: 'photo picture upload', icon: <ImageIcon size={15} />, run: () => pickFiles(true, (f) => void A.addImageFiles(f)) },
    { id: 'cv-qr', label: 'Add QR code', section: ADD, keywords: 'link url barcode', icon: <QrCode size={15} />, run: A.addQr },
    ...CHARTS.map(([k, label]) => ({ id: `cv-chart-${k}`, label: `Add ${label.toLowerCase()} chart`, section: ADD, keywords: 'chart graph data', icon: <ChartColumn size={15} />, run: () => A.addChart(k) })),
    ...SHAPES.map((k) => ({ id: `cv-frame-${k}`, label: `Add ${SHAPE_LABELS[k].toLowerCase()} photo frame`, section: ADD, keywords: `frame mask photo placeholder ${SHAPE_WORDS[k] ?? ''}`, icon: <ImageIcon size={15} />, run: () => A.addFrame(k) })),
    { id: 'cv-draw-pen', label: 'Draw with pen', section: 'Draw', keywords: 'freehand sketch', icon: <PenLine size={15} />, run: () => draw('pen') },
    { id: 'cv-draw-marker', label: 'Draw with marker', section: 'Draw', keywords: 'freehand sketch brush', icon: <Brush size={15} />, run: () => draw('marker') },
    { id: 'cv-draw-hl', label: 'Draw with highlighter', section: 'Draw', keywords: 'freehand highlight', icon: <Highlighter size={15} />, run: () => draw('highlighter') },
    { id: 'cv-draw-eraser', label: 'Erase drawings', section: 'Draw', keywords: 'eraser remove strokes', icon: <Eraser size={15} />, run: () => draw('eraser') },
    { id: 'cv-page-add', label: 'Add page', section: 'Pages', keywords: 'new slide', icon: <FilePlus2 size={15} />, run: () => A.addPage() },
    { id: 'cv-page-dup', label: 'Duplicate page', section: 'Pages', keywords: 'copy slide', icon: <CopyPlus size={15} />, run: () => A.addPage({ duplicate: true }) },
  );
  if (pages > 1) {
    cmds.push(
      { id: 'cv-page-next', label: 'Next page', section: 'Pages', icon: <ChevronRight size={15} />, shortcut: 'PgDn', run: () => A.goToPage(Math.min(pages - 1, doc.pageIndex + 1)) },
      { id: 'cv-page-prev', label: 'Previous page', section: 'Pages', icon: <ChevronLeft size={15} />, shortcut: 'PgUp', run: () => A.goToPage(Math.max(0, doc.pageIndex - 1)) },
      { id: 'cv-page-del', label: 'Delete this page', section: 'Pages', icon: <Trash2 size={15} />, run: () => confirm('Delete this page? You can undo this.') && A.deletePage() },
    );
  }
  const toggle = (k: 'grid' | 'rulers' | 'snapToGrid' | 'margins' | 'safeZone', label: string, icon: React.ReactNode, keywords = '') => ({
    id: `cv-view-${k}`,
    label: `${view[k] ? 'Hide' : 'Show'} ${label}`.replace('Show snap', 'Turn on snap').replace('Hide snap', 'Turn off snap'),
    section: 'View',
    keywords: `view ${keywords}`,
    icon,
    run: () => setViewOptions({ [k]: !view[k] }),
  });
  cmds.push(
    { id: 'cv-fit', label: 'Zoom to fit', section: 'View', keywords: 'view fit screen', icon: <Maximize size={15} />, shortcut: shortcutLabel('0'), run: A.fitView },
    { id: 'cv-zoom-in', label: 'Zoom in', section: 'View', icon: <ZoomIn size={15} />, shortcut: shortcutLabel('+'), run: () => A.zoomStep(1) },
    { id: 'cv-zoom-out', label: 'Zoom out', section: 'View', icon: <ZoomOut size={15} />, shortcut: shortcutLabel('−'), run: () => A.zoomStep(-1) },
    toggle('grid', 'grid', <Grid3x3 size={15} />),
    toggle('snapToGrid', 'snap to grid', <Grid3x3 size={15} />, 'snapping'),
    toggle('rulers', 'rulers', <Ruler size={15} />),
    toggle('margins', 'margins', <Ruler size={15} />, 'safe area print bleed'),
    toggle('safeZone', 'story safe zone', <Ruler size={15} />, 'instagram tiktok'),
    { id: 'cv-fullscreen', label: s.fullscreen ? 'Exit full screen' : 'Full screen', section: 'View', keywords: 'focus distraction free', icon: <Expand size={15} />, run: () => studio.set({ fullscreen: !s.fullscreen }) },
    ...(
      [
        ['templates', 'Templates', <LayoutTemplate size={15} key="i" />],
        ['elements', 'Elements', <Shapes size={15} key="i" />],
        ['text', 'Text', <Type size={15} key="i" />],
        ['uploads', 'Uploads', <Upload size={15} key="i" />],
        ['backgrounds', 'Background', <Palette size={15} key="i" />],
        ['brand', 'Brand kit', <Palette size={15} key="i" />],
        ['layers', 'Layers', <Layers size={15} key="i" />],
      ] as const
    ).map(([panel, label, icon]) => ({ id: `cv-panel-${panel}`, label: `Open ${label} panel`, section: 'View', keywords: 'sidebar panel', icon, run: () => A.setPanel(panel) })),
    { id: 'cv-resize', label: 'Smart resize…', section: 'Design', keywords: 'resize size dimensions social formats', icon: <Ratio size={15} />, run: () => studio.set({ dialog: 'resize' }) },
    { id: 'cv-find', label: 'Find and replace…', section: 'Design', keywords: 'search text replace', icon: <Search size={15} />, shortcut: shortcutLabel('F'), run: () => studio.set({ dialog: 'find' }) },
    { id: 'cv-bulk', label: 'Bulk create from CSV…', section: 'Design', keywords: 'mail merge spreadsheet data certificates badges csv variables', icon: <Table2 size={15} />, run: () => studio.set({ dialog: 'bulk' }) },
    { id: 'cv-add-table', label: 'Add table', section: 'Insert', keywords: 'grid rows columns pricing comparison', icon: <Table2 size={15} />, run: () => A.addTable() },
    { id: 'cv-history', label: 'Version history…', section: 'Design', keywords: 'versions restore earlier undo snapshot backup', icon: <History size={15} />, run: () => studio.set({ dialog: 'history' }) },
    ...(doc.userGuides?.length ? [{ id: 'cv-guides-clear', label: 'Clear guides', section: 'View', keywords: 'ruler guides remove', icon: <Ruler size={15} />, run: () => A.clearGuides() }] : []),
    { id: 'cv-save-template', label: 'Save as template', section: 'Design', keywords: 'reuse my templates', icon: <BookmarkPlus size={15} />, run: () => void A.saveAsTemplate() },
    { id: 'cv-project-file', label: 'Download project file', section: 'Design', keywords: 'backup .studiolo save editable', icon: <FileDown size={15} />, run: () => void A.downloadProjectFile() },
    ...(saveFileSupported()
      ? [
          { id: 'cv-project-save', label: 'Save project file…', section: 'Design', keywords: 'disk .studiolo save editable file system', icon: <FileDown size={15} />, run: () => void A.saveProjectFile() },
          { id: 'cv-project-save-as', label: 'Save project file as…', section: 'Design', keywords: 'disk .studiolo save copy file system', icon: <FileDown size={15} />, run: () => void A.saveProjectFile({ as: true }) },
        ]
      : []),
    { id: 'cv-shortcuts', label: 'Keyboard shortcuts', section: 'Design', keywords: 'help keys hotkeys', icon: <Keyboard size={15} />, shortcut: '?', run: openShortcuts },
    { id: 'cv-close', label: 'Close design', section: 'Design', keywords: 'new design start screen back', icon: <X size={15} />, run: A.closeProject },
  );
  // Long lists last, so an empty search shows the everyday actions first.
  const hasContent = doc.elements.length > 0;
  cmds.push(
    ...TEMPLATES.map((t) => ({
      id: `cv-template-${t.id}`,
      label: `Apply template: ${t.name}`,
      section: 'Templates',
      keywords: `template ${t.category} ${t.keywords.join(' ')}`,
      icon: <LayoutTemplate size={15} />,
      run: () => {
        if (hasContent && !confirm('Replace this page with the template? You can undo this.')) return;
        A.applyTemplate(t.id, true);
      },
    })),
    ...STICKERS.map((st) => ({ id: `cv-sticker-${st.id}`, label: `Add ${st.category.replace(/s$/, '').toLowerCase()}: ${st.label}`, section: ADD, keywords: `sticker ${st.category}`, icon: <Sticker size={15} />, run: () => A.addSticker(st.id) })),
    ...Object.keys(ICONS).map((name) => ({ id: `cv-icon-${name}`, label: `Add icon: ${name.replace(/-/g, ' ')}`, section: ADD, keywords: 'icon symbol', icon: <Shapes size={15} />, run: () => A.addIcon(name) })),
  );
  return cmds;
}

/** While a design is open in Canvas, its actions (and every element, icon and template) are in the command palette. */
export function useCanvasCommands(openShortcuts: () => void) {
  useEffect(() => registerCommands('canvas', () => canvasCommands(openShortcuts)), [openShortcuts]);
}

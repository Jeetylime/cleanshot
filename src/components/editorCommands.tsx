import { useEffect } from 'react';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  CopyPlus,
  Download,
  FlipHorizontal2,
  FlipVertical2,
  Frame,
  Keyboard,
  LayoutTemplate,
  Maximize,
  PanelRight,
  Redo2,
  RotateCcw,
  RotateCw,
  SquareDashedMousePointer,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { registerCommands, type Command } from '../app/commands';
import { store, useEditor } from '../store/store';
import * as actions from '../store/actions';
import { redo, undo } from '../store/history';
import { fitView, zoomStep, zoomToCenter } from '../store/view';
import { exportDocument, outputSize } from '../engine/export';
import { sendToCanvas } from '../studio/handoff';
import { shortcutLabel } from '../lib/utils';
import { ALL_TOOLS } from './tools';
import type { ExportFormat } from '../types';

const FORMAT_LABEL: Record<ExportFormat, string> = { png: 'PNG', jpeg: 'JPEG', webp: 'WebP' };

async function sendCurrentToCanvas() {
  const doc = store.get().doc;
  if (!doc) return;
  try {
    const { width, height } = outputSize(doc);
    const { blob } = await exportDocument(doc, { format: 'png', quality: 100, width, height });
    sendToCanvas(blob, `${doc.name}.png`);
    actions.showToast('Added to Canvas. Your image is still open in Edit.', 'success');
  } catch {
    actions.showToast('Couldn’t send this image to Canvas.', 'error');
  }
}

function editorCommands(): Command[] {
  const s = store.get();
  const doc = s.doc;
  if (!doc) return [];
  const sec = 'Edit';
  const hasSel = s.selection.length > 0;
  const quick = (format: ExportFormat): Command => ({
    id: `edit-download-${format}`,
    label: `Download as ${FORMAT_LABEL[format]}`,
    section: sec,
    keywords: 'export save image file',
    icon: <Download size={15} />,
    run: () => {
      const { width, height } = outputSize(doc);
      void actions.exportAndDownload({ format, quality: s.exportPrefs.quality, width, height });
    },
  });
  const cmds: Command[] = [
    { id: 'edit-export', label: 'Export…', section: sec, keywords: 'download save image png jpeg webp', icon: <Download size={15} />, shortcut: shortcutLabel('E'), run: () => actions.openOverlay('export') },
    quick('png'),
    quick('jpeg'),
    quick('webp'),
    { id: 'edit-copy', label: 'Copy image to clipboard', section: sec, keywords: 'clipboard paste share', icon: <Copy size={15} />, run: () => void actions.copyImageToClipboard() },
    { id: 'edit-to-canvas', label: 'Send to Canvas', section: sec, keywords: 'design use in canvas', icon: <LayoutTemplate size={15} />, run: () => void sendCurrentToCanvas() },
    { id: 'edit-undo', label: 'Undo', section: sec, icon: <Undo2 size={15} />, shortcut: shortcutLabel('Z'), run: undo },
    { id: 'edit-redo', label: 'Redo', section: sec, icon: <Redo2 size={15} />, shortcut: shortcutLabel('⇧Z'), run: redo },
    ...ALL_TOOLS.map((t) => ({
      id: `edit-tool-${t.id}`,
      label: `Tool: ${t.label}`,
      section: sec,
      keywords: `${t.hint} use pick`,
      icon: <t.icon size={15} />,
      shortcut: t.shortcut,
      run: () => actions.setTool(t.id),
    })),
    { id: 'edit-add-shape', label: 'Add the current tool’s shape in the middle', section: sec, keywords: 'insert keyboard rectangle arrow', icon: <SquareDashedMousePointer size={15} />, shortcut: '↵', run: () => void actions.insertAnnotationAtCenter() },
    { id: 'edit-rotate-left', label: 'Rotate left', section: sec, keywords: 'turn counterclockwise 90', icon: <RotateCcw size={15} />, run: () => actions.rotate(-1) },
    { id: 'edit-rotate-right', label: 'Rotate right', section: sec, keywords: 'turn clockwise 90', icon: <RotateCw size={15} />, run: () => actions.rotate(1) },
    { id: 'edit-flip-h', label: 'Flip horizontally', section: sec, keywords: 'mirror', icon: <FlipHorizontal2 size={15} />, run: () => actions.flip('h') },
    { id: 'edit-flip-v', label: 'Flip vertically', section: sec, keywords: 'mirror upside down', icon: <FlipVertical2 size={15} />, run: () => actions.flip('v') },
    {
      id: 'edit-frame',
      label: doc.background.enabled ? 'Remove background frame' : 'Add background frame',
      section: sec,
      keywords: 'frame wallpaper gradient padding shadow beautify',
      icon: <Frame size={15} />,
      run: () => actions.updateBackground({ enabled: !doc.background.enabled }),
    },
    { id: 'edit-fit', label: 'Zoom to fit', section: sec, keywords: 'view fit screen', icon: <Maximize size={15} />, shortcut: shortcutLabel('0'), run: () => fitView(true) },
    { id: 'edit-100', label: 'Zoom to 100%', section: sec, keywords: 'actual size pixels', icon: <ZoomIn size={15} />, shortcut: shortcutLabel('1'), run: () => zoomToCenter(1) },
    { id: 'edit-zoom-in', label: 'Zoom in', section: sec, icon: <ZoomIn size={15} />, shortcut: shortcutLabel('+'), run: () => zoomStep(1) },
    { id: 'edit-zoom-out', label: 'Zoom out', section: sec, icon: <ZoomOut size={15} />, shortcut: shortcutLabel('−'), run: () => zoomStep(-1) },
    { id: 'edit-select-all', label: 'Select all annotations', section: sec, icon: <SquareDashedMousePointer size={15} />, shortcut: shortcutLabel('A'), run: actions.selectAll },
    { id: 'edit-panel', label: 'Show or hide the properties panel', section: sec, keywords: 'sidebar inspector', icon: <PanelRight size={15} />, run: actions.toggleProperties },
    { id: 'edit-shortcuts', label: 'Keyboard shortcuts', section: sec, keywords: 'help keys hotkeys', icon: <Keyboard size={15} />, shortcut: '?', run: () => actions.openOverlay('shortcuts') },
    { id: 'edit-revert', label: 'Revert to original', section: sec, keywords: 'reset undo all start over', icon: <RotateCcw size={15} />, run: () => confirm('Revert to the original image? Your edits will be removed (you can undo this).') && actions.resetEdits() },
    { id: 'edit-close', label: 'Close image', section: sec, icon: <X size={15} />, run: () => void actions.closeDocument() },
  ];
  if (hasSel)
    cmds.unshift(
      { id: 'edit-sel-dup', label: 'Duplicate selection', section: sec, keywords: 'copy clone', icon: <CopyPlus size={15} />, shortcut: shortcutLabel('D'), run: actions.duplicateSelection },
      { id: 'edit-sel-del', label: 'Delete selection', section: sec, keywords: 'remove', icon: <Trash2 size={15} />, shortcut: '⌫', run: actions.deleteSelection },
      { id: 'edit-sel-front', label: 'Bring selection to front', section: sec, keywords: 'arrange order layer', icon: <ArrowUpToLine size={15} />, run: () => actions.arrange('front') },
      { id: 'edit-sel-back', label: 'Send selection to back', section: sec, keywords: 'arrange order layer', icon: <ArrowDownToLine size={15} />, run: () => actions.arrange('back') },
    );
  return cmds;
}

/** While an image is open in Edit, its actions are available in the command palette. */
export function useEditorCommands() {
  const hasDoc = useEditor((s) => !!s.doc);
  useEffect(() => (hasDoc ? registerCommands('edit', editorCommands) : undefined), [hasDoc]);
}

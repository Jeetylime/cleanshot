import { useEffect } from 'react';
import { getRoute } from '../app/route';
import { isEditableTarget } from '../lib/utils';
import { redo, studio, undo } from './store';
import * as A from './actions';

/** Keyboard shortcuts for the Canvas editor. Never fire while typing in a field. */
export function useStudioShortcuts(openShortcuts: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isEditableTarget(e.target)) return;
      if (getRoute().section !== 'canvas') return;
      const s = studio.get();
      if (!s.doc) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      let handled = true;

      if (mod) {
        switch (key) {
          case 'z':
            if (e.shiftKey) redo();
            else undo();
            break;
          case 'y':
            redo();
            break;
          case 'c':
            handled = A.copySelection();
            break;
          case 'x':
            if (s.selection.length) A.cutSelection();
            else handled = false;
            break;
          case 'v':
            // Handled by the paste event (images from the clipboard, or copied elements).
            handled = false;
            break;
          case 'd':
            A.duplicateSelection();
            break;
          case 'a':
            A.selectAll();
            break;
          case 'g':
            if (e.shiftKey) A.ungroupSelection();
            else A.groupSelection();
            break;
          case 'l':
            if (s.selection.length) A.toggleLock();
            break;
          case ']':
            A.reorder(e.shiftKey ? 'front' : 'forward');
            break;
          case '[':
            A.reorder(e.shiftKey ? 'back' : 'backward');
            break;
          case 's':
            void A.saveNow();
            break;
          case 'e':
            studio.set({ exportOpen: true });
            break;
          case '0':
            A.fitView();
            break;
          case '1':
            A.zoomAt(1, s.viewport.w / 2, s.viewport.h / 2);
            break;
          case '=':
          case '+':
            A.zoomStep(1);
            break;
          case '-':
          case '_':
            A.zoomStep(-1);
            break;
          default:
            handled = false;
        }
        if (handled) e.preventDefault();
        return;
      }
      if (e.altKey) return;

      const step = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case 'Escape':
          if (s.gesturing) return;
          if (s.exportOpen) studio.set({ exportOpen: false });
          else if (s.cropId) A.setCropMode(null);
          else if (s.selection.length) A.clearSelection();
          else if (s.fullscreen) studio.set({ fullscreen: false });
          else handled = false;
          break;
        case 'Delete':
        case 'Backspace':
          if (s.selection.length) A.deleteSelection();
          else handled = false;
          break;
        case 'Enter': {
          const el = s.selection.length === 1 ? s.doc.elements.find((x) => x.id === s.selection[0]) : null;
          if (s.cropId) A.setCropMode(null);
          else if (el?.type === 'text') A.startTextEdit(el.id);
          else if (el?.type === 'image') A.setCropMode(el.id);
          else handled = false;
          break;
        }
        case 'ArrowLeft':
          A.nudge(-step, 0);
          break;
        case 'ArrowRight':
          A.nudge(step, 0);
          break;
        case 'ArrowUp':
          A.nudge(0, -step);
          break;
        case 'ArrowDown':
          A.nudge(0, step);
          break;
        case '?':
          openShortcuts();
          break;
        case 't':
        case 'T':
          A.addText('body');
          break;
        case 'r':
        case 'R':
          A.addShape('rect');
          break;
        case 'o':
        case 'O':
          A.addShape('ellipse');
          break;
        case 'l':
        case 'L':
          A.addLine(false);
          break;
        case 'f':
        case 'F':
          studio.set({ fullscreen: !s.fullscreen });
          break;
        default:
          handled = false;
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openShortcuts]);
}

export const STUDIO_SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: 'Edit',
    items: [
      ['Undo', '⌘Z'],
      ['Redo', '⌘⇧Z'],
      ['Copy / Cut / Paste', '⌘C / ⌘X / ⌘V'],
      ['Duplicate', '⌘D'],
      ['Select all', '⌘A'],
      ['Delete', '⌫'],
      ['Deselect', 'Esc'],
      ['Move 1 px / 10 px', 'Arrows / ⇧ Arrows'],
    ],
  },
  {
    group: 'Arrange',
    items: [
      ['Group / Ungroup', '⌘G / ⌘⇧G'],
      ['Lock / Unlock', '⌘L'],
      ['Bring forward / to front', '⌘] / ⌘⇧]'],
      ['Send backward / to back', '⌘[ / ⌘⇧['],
    ],
  },
  {
    group: 'Add',
    items: [
      ['Text', 'T'],
      ['Rectangle', 'R'],
      ['Circle', 'O'],
      ['Line', 'L'],
    ],
  },
  {
    group: 'Canvas',
    items: [
      ['Edit text / crop image', 'Enter or double-click'],
      ['Zoom in / out', '⌘+ / ⌘−'],
      ['Fit / 100%', '⌘0 / ⌘1'],
      ['Pan', 'Space + drag'],
      ['Fullscreen', 'F'],
      ['Export', '⌘E'],
      ['Keep proportions / free resize', '⇧ while resizing'],
      ['Turn off snapping', 'Alt while dragging'],
    ],
  },
];

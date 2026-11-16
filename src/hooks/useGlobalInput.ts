import { useEffect, useRef, useState } from 'react';
import { store } from '../store/store';
import * as actions from '../store/actions';
import { undo, redo } from '../store/history';
import { fitView, zoomStep, zoomToCenter } from '../store/view';
import { TOOL_BY_SHORTCUT } from '../components/tools';
import { isEditableTarget } from '../lib/utils';
import { openFilePicker } from '../lib/filePicker';
import { getRoute, getToolFileSink, goEditor } from '../app/route';

/** Application-wide keyboard shortcuts. */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isEditableTarget(e.target)) return;
      // Editor shortcuts only apply inside the screenshot editor.
      if (getRoute().section !== 'editor') return;
      const s = store.get();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod) {
        let handled = true;
        switch (key) {
          case 'z':
            if (e.shiftKey) redo();
            else undo();
            break;
          case 'y':
            redo();
            break;
          case 'o':
            openFilePicker();
            break;
          case 'c':
            if (!s.doc) handled = false;
            else if (!actions.copySelectionToClipboard()) void actions.copyImageToClipboard();
            break;
          case 'x':
            if (actions.copySelectionToClipboard()) actions.deleteSelection();
            else handled = false;
            break;
          case 'd':
            actions.duplicateSelection();
            break;
          case 'a':
            if (s.doc) actions.selectAll();
            else handled = false;
            break;
          case 's':
            actions.quickSave();
            break;
          case 'e':
            if (s.doc) actions.openOverlay(s.overlay === 'export' ? null : 'export');
            break;
          case '0':
            fitView(true);
            break;
          case '1':
            zoomToCenter(1);
            break;
          case '2':
            zoomToCenter(2);
            break;
          case '=':
          case '+':
            zoomStep(1);
            break;
          case '-':
          case '_':
            zoomStep(-1);
            break;
          case 'v':
            // Let the native paste event fire.
            handled = false;
            break;
          default:
            handled = false;
        }
        if (handled) e.preventDefault();
        return;
      }

      if (e.altKey) return;

      if (key === '?' || (e.shiftKey && key === '/')) {
        e.preventDefault();
        actions.openOverlay(s.overlay === 'shortcuts' ? null : 'shortcuts');
        return;
      }
      if (!s.doc || s.overlay) return;

      switch (e.key) {
        case 'Escape':
          if (s.gesturing) return; // the canvas cancels the active drag
          if (s.crop) actions.cancelCrop();
          else if (s.selection.length) actions.clearSelection();
          else if (s.tool !== 'select') actions.setTool('select');
          return;
        case 'Enter':
          if (s.crop) {
            e.preventDefault();
            actions.applyCrop();
          } else if (s.selection.length === 1) {
            const a = s.doc.annotations.find((x) => x.id === s.selection[0]);
            if (a?.type === 'text') {
              e.preventDefault();
              actions.startTextEdit(a.id, false);
            }
          }
          return;
        case 'Delete':
        case 'Backspace':
          if (s.selection.length) {
            e.preventDefault();
            actions.deleteSelection();
          }
          return;
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (!s.selection.length) return;
          e.preventDefault();
          const d = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
          const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
          actions.nudgeSelection(dx, dy);
          return;
        }
      }

      if (e.shiftKey || e.repeat) return;
      const tool = TOOL_BY_SHORTCUT[key];
      if (tool) {
        e.preventDefault();
        actions.setTool(tool);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function firstImageFile(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  for (const f of Array.from(dt.files ?? [])) {
    if (f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name)) return f;
  }
  return null;
}

export function allImageFiles(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  const out: File[] = [];
  for (const f of Array.from(dt.files ?? [])) {
    if (f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name)) out.push(f);
  }
  if (!out.length) {
    for (const item of Array.from(dt.items ?? [])) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) out.push(f);
      }
    }
  }
  return out;
}

/** Clipboard paste + drag-and-drop anywhere in the window. Returns drag state. */
export function usePasteAndDrop(): boolean {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const sink = getToolFileSink();
      if (sink) {
        const files = allImageFiles(e.clipboardData);
        if (files.length) {
          e.preventDefault();
          sink(files);
        }
        return;
      }
      if (getRoute().section === 'tools') return;
      const file = firstImageFile(e.clipboardData);
      if (file) {
        e.preventDefault();
        // Pasted screenshots are usually named "image.png"; use a timestamped name instead.
        const generic = /^image\.(png|jpe?g|gif|webp)$/i.test(file.name) || !file.name;
        goEditor();
        void actions.openImageBlob(file, generic ? undefined : file.name);
        return;
      }
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (actions.isAnnotationClipboardText(text)) {
        e.preventDefault();
        actions.pasteAnnotations();
        return;
      }
      if (!store.get().doc && getRoute().section === 'editor') actions.showToast('The clipboard doesn’t contain an image.', 'info');
    };

    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      if (getRoute().section === 'tools' && !getToolFileSink()) return;
      e.preventDefault();
      depth.current++;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      const sink = getToolFileSink();
      if (sink) {
        const files = allImageFiles(e.dataTransfer);
        if (files.length) sink(files);
        else actions.showToast('Those files aren’t supported images.', 'error');
        return;
      }
      if (getRoute().section === 'tools') return;
      const file = firstImageFile(e.dataTransfer);
      if (file) {
        goEditor();
        void actions.openImageBlob(file, file.name);
      } else actions.showToast('That file isn’t a supported image.', 'error');
    };

    window.addEventListener('paste', onPaste);
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return dragging;
}

/** Apply the UI theme to the document root. */
export function useThemeSync() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const t = store.get().theme;
      const resolved = t === 'system' ? (mq.matches ? 'light' : 'dark') : t;
      if (document.documentElement.dataset.theme !== resolved) {
        document.documentElement.dataset.theme = resolved;
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#f7f7f8' : '#1c1c1f');
      }
    };
    apply();
    const unsub = store.subscribe(apply);
    mq.addEventListener('change', apply);
    return () => {
      unsub();
      mq.removeEventListener('change', apply);
    };
  }, []);
}

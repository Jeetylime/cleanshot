import { useEffect, useRef } from 'react';
import { CanvasController } from '../canvas/controller';
import { useEditor, shallowEqual } from '../store/store';
import { commitTextEdit, updateEditingText } from '../store/actions';
import { measureText, FONT_FAMILY } from '../engine/text';
import { luminance } from '../lib/utils';
import type { TextAnnotation } from '../types';

export function EditorCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const controller = new CanvasController(canvasRef.current, containerRef.current);
    return () => controller.destroy();
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden" data-testid="canvas-container">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none select-none"
        aria-label="Screenshot canvas"
        data-testid="editor-canvas"
      />
      <TextEditorOverlay />
      <CanvasHint />
    </div>
  );
}

function TextEditorOverlay() {
  const data = useEditor(
    (s) => {
      const a = s.editingTextId ? s.doc?.annotations.find((x) => x.id === s.editingTextId) : null;
      return { a: a?.type === 'text' ? (a as TextAnnotation) : null, view: s.view, unit: s.doc?.unit ?? 1 };
    },
    (x, y) => x.a === y.a && x.view === y.view && x.unit === y.unit,
  );
  const ref = useRef<HTMLTextAreaElement>(null);
  const editingId = data.a?.id;

  useEffect(() => {
    const el = ref.current;
    if (!el || !editingId) return;
    el.focus({ preventScroll: true });
    if (el.value.length) el.select();
  }, [editingId]);

  const a = data.a;
  if (!a) return null;
  const m = measureText(a, data.unit);
  const { zoom, x, y } = data.view;
  const caret = a.style === 'filled' ? (luminance(a.color) > 0.45 ? '#111114' : '#ffffff') : a.color;

  return (
    <textarea
      ref={ref}
      className="cs-text-editor"
      aria-label="Edit text"
      data-testid="text-editor"
      spellCheck={false}
      autoCapitalize="off"
      autoComplete="off"
      value={a.text}
      onChange={(e) => updateEditingText(e.target.value)}
      onBlur={() => commitTextEdit()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          commitTextEdit();
        }
      }}
      onPaste={(e) => e.stopPropagation()}
      style={{
        left: 0,
        top: 0,
        transform: `translate(${(a.x + m.padX) * zoom + x}px, ${(a.y + m.padY) * zoom + y}px) scale(${zoom})`,
        width: m.textWidth + m.fontSize,
        height: m.textHeight,
        font: `${a.weight} ${m.fontSize}px ${FONT_FAMILY}`,
        lineHeight: `${m.lineHeight}px`,
        caretColor: caret,
      }}
    />
  );
}

/** Small contextual hint at the bottom of the canvas for the active tool. */
function CanvasHint() {
  const hint = useEditor(
    (s) => {
      if (s.crop) return 'Drag to adjust · Enter to apply · Esc to cancel';
      if (s.editingTextId) return 'Esc or click outside to finish';
      return null;
    },
    shallowEqual,
  );
  if (!hint) return null;
  return (
    <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full border border-line-strong bg-elevated/90 px-3 py-1.5 text-xs text-muted shadow-pop backdrop-blur animate-fade-in">
      {hint}
    </div>
  );
}


import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, CopyPlus, Crop, Italic, RefreshCw, Trash2, Underline } from 'lucide-react';
import { IconButton } from '../components/ui/IconButton';
import { Popover } from '../components/ui/Popover';
import { ColorPicker, NumberInput } from '../components/ui/controls';
import { pickFiles } from '../tools/shared/ui';
import { useStudio, shallowEqual, selectedElements } from './store';
import { aabb, unionBounds } from './geometry';
import * as A from './actions';
import { FontSelect, palette, useTextStyle } from './Properties';
import type { StudioElement, TextAlign, TextElement } from './types';

const ALIGN_NEXT: Record<TextAlign, TextAlign> = { left: 'center', center: 'right', right: 'left' };
const ALIGN_ICON = { left: AlignLeft, center: AlignCenter, right: AlignRight };

/**
 * Quick actions floating above the selection (font, size, bold, color…), so the
 * most common edits don't need the side panel. Placed in stage coordinates,
 * flipped below the selection when there's no room above, and hidden while
 * dragging, cropping, drawing or on small screens.
 */
export function FloatingToolbar() {
  // Separate subscriptions: the selection list is compared element by element.
  const sel = useStudio((s) => selectedElements(s), shallowEqual);
  const { view, hidden, editing, stageW, stageH } = useStudio(
    (s) => ({
      view: s.view,
      stageW: s.viewport.w,
      stageH: s.viewport.h,
      editing: s.editingTextId,
      hidden: s.gesturing || !!s.cropId || s.panel === 'draw' || s.exportOpen || !!s.dialog,
    }),
    shallowEqual,
  );
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const show = !hidden && sel.length > 0 && !sel.some((e) => e.locked);

  // Re-measure after every render (contents change with the selection); the size check stops the loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (Math.abs(r.width - size.w) > 0.5 || Math.abs(r.height - size.h) > 0.5) setSize({ w: r.width, h: r.height });
  });

  if (!show) return null;
  const box = sel.length === 1 ? aabb(sel[0]) : unionBounds(sel)!;
  const left = view.x + box.x * view.zoom;
  const top = view.y + box.y * view.zoom;
  const right = view.x + (box.x + box.w) * view.zoom;
  const bottom = view.y + (box.y + box.h) * view.zoom;
  const gap = 12;
  // Below the selection, leave room for the rotate handle.
  let y = top - size.h - gap;
  if (y < 8) y = bottom + 40;
  if (y + size.h > stageH - 8) y = Math.max(8, Math.min(top + 8, stageH - size.h - 8));
  const x = Math.min(Math.max(8, (left + right) / 2 - size.w / 2), Math.max(8, stageW - size.w - 8));

  const single = sel.length === 1 ? sel[0] : null;
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Quick actions"
      data-testid="floating-toolbar"
      // Keep the text field focused while using buttons; inputs still take focus.
      onMouseDown={(e) => {
        if (editing && !(e.target as HTMLElement).closest('input')) e.preventDefault();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute z-20 flex items-center gap-0.5 rounded-[10px] border border-line-strong bg-elevated p-1 shadow-pop max-md:hidden"
      style={{ left: x, top: y, visibility: size.w ? 'visible' : 'hidden' }}
    >
      {single?.type === 'text' && <TextTools e={single} editing={!!editing} />}
      {single && single.type !== 'text' && <ColorTools e={single} />}
      {single?.type === 'image' && single.assetId && (
        <>
          <IconButton label="Crop" onClick={() => A.setCropMode(single.id)} size="md">
            <Crop size={14} />
          </IconButton>
          <IconButton label="Replace image" onClick={() => pickFiles(false, (f) => f[0] && void A.replaceImage(single.id, f[0]))} size="md">
            <RefreshCw size={14} />
          </IconButton>
          <Divider />
        </>
      )}
      <IconButton label="Duplicate" shortcut={['⌘', 'D']} onClick={A.duplicateSelection} size="md">
        <CopyPlus size={14} />
      </IconButton>
      <IconButton label="Delete" shortcut="⌫" onClick={A.deleteSelection} size="md">
        <Trash2 size={14} />
      </IconButton>
    </div>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />;
}

function TextTools({ e, editing }: { e: TextElement; editing: boolean }) {
  const { font, at, up, style } = useTextStyle(e, editing);
  const AlignIcon = ALIGN_ICON[e.align];
  return (
    <>
      <div className="w-[150px]">
        <FontSelect value={e.fontFamily} onChange={(id) => up({ fontFamily: id })} />
      </div>
      <div className="w-[72px]">
        <NumberInput ariaLabel="Font size" value={e.fontSize} min={4} max={2000} onChange={(v) => up({ fontSize: v }, 'fs')} />
      </div>
      <Divider />
      <IconButton label="Bold" shortcut={['⌘', 'B']} active={at.bold && font.bold} onClick={() => style({ bold: !at.bold })} size="md">
        <Bold size={14} />
      </IconButton>
      <IconButton label="Italic" shortcut={['⌘', 'I']} active={at.italic} onClick={() => style({ italic: !at.italic })} size="md">
        <Italic size={14} />
      </IconButton>
      <IconButton label="Underline" shortcut={['⌘', 'U']} active={at.underline} onClick={() => style({ underline: !at.underline })} size="md">
        <Underline size={14} />
      </IconButton>
      <ColorButton label="Text color" value={at.color ?? e.color} onChange={(c) => style({ color: c }, 'color')} />
      <IconButton label={`Alignment: ${e.align}`} onClick={() => up({ align: ALIGN_NEXT[e.align] })} size="md">
        <AlignIcon size={14} />
      </IconButton>
      <Divider />
    </>
  );
}

/** The one main color of a non-text element, if it has one. */
function colorOf(e: StudioElement): { value: string; patch: (c: string) => Partial<StudioElement>; label: string } | null {
  switch (e.type) {
    case 'shape':
      return e.fill && !e.gradient ? { value: e.fill, patch: (c) => ({ fill: c }), label: 'Fill color' } : e.stroke ? { value: e.stroke, patch: (c) => ({ stroke: c }), label: 'Border color' } : null;
    case 'line':
    case 'icon':
    case 'draw':
      return { value: e.color, patch: (c) => ({ color: c }) as Partial<StudioElement>, label: 'Color' };
    default:
      return null;
  }
}

function ColorTools({ e }: { e: StudioElement }) {
  const c = colorOf(e);
  if (!c) return null;
  return (
    <>
      <ColorButton label={c.label} value={c.value} onChange={(v) => A.updateElements([e.id], c.patch(v) as never, 'color')} />
      <Divider />
    </>
  );
}

function ColorButton({ label, value, onChange }: { label: string; value: string; onChange: (c: string) => void }): ReactNode {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton ref={anchor} label={label} onClick={() => setOpen((o) => !o)} size="md" aria-haspopup="dialog">
        <span className="h-4 w-4 rounded-full ring-1 ring-line-strong" style={{ background: value }} />
      </IconButton>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} align="start" width={244} label={label}>
        <div className="p-2.5">
          <ColorPicker value={value} colors={palette()} onChange={onChange} />
        </div>
      </Popover>
    </>
  );
}

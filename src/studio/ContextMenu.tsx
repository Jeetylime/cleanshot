import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpToLine, ClipboardPaste, Copy, CopyPlus, Group, Lock, Trash2, Ungroup, Unlock, BoxSelect } from 'lucide-react';
import { MenuItem, MenuSeparator } from '../components/ui/Popover';
import { modKey } from '../lib/utils';
import { selectedElements, studio, useStudio } from './store';
import * as A from './actions';

export interface ContextMenuState {
  x: number;
  y: number;
}

export function ContextMenu({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: state.x, y: state.y });
  const count = useStudio((s) => s.selection.length);
  const locked = useStudio((s) => selectedElements(s).length > 0 && selectedElements(s).every((e) => e.locked));
  const canGroup = useStudio((s) => A.canGroup(s));
  const canUngroup = useStudio((s) => A.canUngroup(s));

  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: Math.min(state.x, window.innerWidth - r.width - 8), y: Math.min(state.y, window.innerHeight - r.height - 8) });
  }, [state.x, state.y]);

  useEffect(() => {
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Element actions"
      className="fixed z-50 w-[224px] rounded-[11px] border border-line-strong bg-elevated p-1 text-fg shadow-pop animate-pop-in"
      style={{ left: pos.x, top: pos.y }}
    >
      {count > 0 ? (
        <>
          <MenuItem icon={<Copy size={14} />} onClick={run(() => A.copySelection())} shortcut={`${modKey}C`}>
            Copy
          </MenuItem>
          <MenuItem icon={<CopyPlus size={14} />} onClick={run(A.duplicateSelection)} shortcut={`${modKey}D`}>
            Duplicate
          </MenuItem>
          <MenuItem icon={<ClipboardPaste size={14} />} onClick={run(() => A.pasteClipboard())} disabled={!A.hasClipboard()} shortcut={`${modKey}V`}>
            Paste
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<ArrowUpToLine size={14} />} onClick={run(() => A.reorder('front'))} shortcut={`${modKey}⇧]`}>
            Bring to front
          </MenuItem>
          <MenuItem icon={<ArrowDownToLine size={14} />} onClick={run(() => A.reorder('back'))} shortcut={`${modKey}⇧[`}>
            Send to back
          </MenuItem>
          {(canGroup || canUngroup) && <MenuSeparator />}
          {canGroup && (
            <MenuItem icon={<Group size={14} />} onClick={run(A.groupSelection)} shortcut={`${modKey}G`}>
              Group
            </MenuItem>
          )}
          {canUngroup && (
            <MenuItem icon={<Ungroup size={14} />} onClick={run(A.ungroupSelection)} shortcut={`${modKey}⇧G`}>
              Ungroup
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem icon={locked ? <Unlock size={14} /> : <Lock size={14} />} onClick={run(() => A.toggleLock())} shortcut={`${modKey}L`}>
            {locked ? 'Unlock' : 'Lock'}
          </MenuItem>
          <MenuItem icon={<Trash2 size={14} />} danger onClick={run(A.deleteSelection)}>
            Delete
          </MenuItem>
        </>
      ) : (
        <>
          <MenuItem icon={<ClipboardPaste size={14} />} onClick={run(() => A.pasteClipboard())} disabled={!A.hasClipboard()} shortcut={`${modKey}V`}>
            Paste
          </MenuItem>
          <MenuItem icon={<BoxSelect size={14} />} onClick={run(A.selectAll)} disabled={!studio.get().doc?.elements.length} shortcut={`${modKey}A`}>
            Select all
          </MenuItem>
        </>
      )}
    </div>
  );
}

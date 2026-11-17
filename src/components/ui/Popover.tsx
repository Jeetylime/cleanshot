import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchor: RefObject<HTMLElement | null>;
  align?: 'start' | 'end' | 'center';
  width?: number;
  children: ReactNode;
  className?: string;
  label?: string;
}

/** Anchored floating panel. Closes on outside click and Escape. */
export function Popover({ open, onClose, anchor, align = 'end', width, children, className = '', label }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const el = ref.current;
      if (!a || !el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let x = align === 'start' ? a.left : align === 'end' ? a.right - w : a.left + a.width / 2 - w / 2;
      x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
      let y = a.bottom + 6;
      if (y + h > window.innerHeight - 8) y = Math.max(8, window.innerHeight - h - 8);
      setPos({ x, y });
    };
    place();
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [open, anchor, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={`fixed z-50 rounded-[11px] border border-line-strong bg-elevated text-fg shadow-pop animate-pop-in ${className}`}
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999, width }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  shortcut,
  danger,
  checked,
  disabled,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  shortcut?: ReactNode;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-[24px] w-full items-center gap-2.5 rounded-[6px] px-2 py-0.5 text-left text-sm transition-colors duration-100 disabled:opacity-40 ${
        danger ? 'text-danger hover:bg-danger/12' : 'text-fg hover:bg-accent-fill hover:text-white'
      } group`}
    >
      <span className={`flex w-4 shrink-0 justify-center ${danger ? '' : 'text-muted group-hover:text-white'}`}>{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {checked !== undefined && (
        <span className={`h-1.5 w-1.5 rounded-full ${checked ? 'bg-accent-fill group-hover:bg-white' : ''}`} />
      )}
      {shortcut && <span className="text-xs text-subtle group-hover:text-white/80">{shortcut}</span>}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="mx-2 my-1 h-px bg-line" />;
}

export function MenuLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <div id={id} className="px-2 pt-1.5 pb-1 text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">
      {children}
    </div>
  );
}

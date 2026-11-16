import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Kbd } from './Kbd';

type Side = 'top' | 'bottom' | 'right' | 'left';

// Once a tooltip has been shown, neighbors appear instantly (like macOS).
let warmUntil = 0;

interface TooltipProps {
  label: ReactNode;
  shortcut?: string | string[];
  side?: Side;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

export function Tooltip({ label, shortcut, side = 'bottom', disabled, children, className }: TooltipProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = () => {
    if (disabled) return;
    clearTimeout(timer.current);
    const delay = performance.now() < warmUntil ? 0 : 480;
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    if (open) warmUntil = performance.now() + 400;
    setOpen(false);
    setPos(null);
  };

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (disabled) hide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  useLayoutEffect(() => {
    if (!open || !anchor.current || !tip.current) return;
    const a = anchor.current.getBoundingClientRect();
    const t = tip.current.getBoundingClientRect();
    const gap = 8;
    let x = 0;
    let y = 0;
    if (side === 'bottom') {
      x = a.left + a.width / 2 - t.width / 2;
      y = a.bottom + gap;
    } else if (side === 'top') {
      x = a.left + a.width / 2 - t.width / 2;
      y = a.top - t.height - gap;
    } else if (side === 'right') {
      x = a.right + gap;
      y = a.top + a.height / 2 - t.height / 2;
    } else {
      x = a.left - t.width - gap;
      y = a.top + a.height / 2 - t.height / 2;
    }
    x = Math.max(6, Math.min(window.innerWidth - t.width - 6, x));
    y = Math.max(6, Math.min(window.innerHeight - t.height - 6, y));
    setPos({ x, y });
  }, [open, side]);

  const keys = shortcut ? (Array.isArray(shortcut) ? shortcut : [shortcut]) : [];

  return (
    <span
      ref={anchor}
      className={className ?? 'inline-flex'}
      onPointerEnter={(e) => e.pointerType === 'mouse' && show()}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={(e) => {
        if (e.target.matches(':focus-visible')) show();
      }}
      onBlur={hide}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={tip}
            role="tooltip"
            className="pointer-events-none fixed z-[100] flex items-center gap-2 rounded-md border border-line-strong bg-elevated px-2 py-1 text-xs font-medium whitespace-nowrap text-fg shadow-pop animate-fade-in"
            style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999 }}
          >
            <span>{label}</span>
            {keys.length > 0 && (
              <span className="flex items-center gap-0.5">
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Tooltip } from './Tooltip';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  shortcut?: string | string[];
  active?: boolean;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const SIZES = {
  // 24 CSS px minimum target size (WCAG 2.5.8); the root font size is 12px, so rem-based h-6 would be only 18px.
  sm: 'h-[24px] w-[24px] rounded-[6px]',
  md: 'h-[24px] w-[24px] rounded-[7px]',
  lg: 'h-9 w-9 rounded-[8px]',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, active, tooltipSide = 'bottom', size = 'md', className = '', children, disabled, ...rest },
  ref,
) {
  return (
    <Tooltip label={label} shortcut={shortcut} side={tooltipSide} disabled={disabled}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        className={`relative inline-flex shrink-0 items-center justify-center transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.94] disabled:pointer-events-none disabled:opacity-35 ${
          SIZES[size]
        } ${active ? 'bg-accent-fill text-white shadow-soft' : 'text-muted hover:bg-hover hover:text-fg'} ${className}`}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  );
});

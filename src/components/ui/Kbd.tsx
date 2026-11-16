import type { ReactNode } from 'react';

export function Kbd({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-[4px] border border-line-strong bg-control px-1 font-sans text-[10px] leading-none font-medium text-muted ${className}`}
    >
      {children}
    </kbd>
  );
}

import type { ReactNode } from 'react';

/** Small illustrative thumbnails for PDF tool cards. */
const page = (x: number, y: number, key?: string, accent = false) => (
  <g key={key ?? `${x}-${y}`}>
    <rect x={x} y={y} width="20" height="26" rx="2" fill="#fff" stroke={accent ? '#0a84ff' : 'rgba(0,0,0,0.12)'} strokeWidth={accent ? 1.4 : 1} />
    {[0, 1, 2, 3].map((i) => (
      <rect key={i} x={x + 4} y={y + 5 + i * 4.5} width={i === 3 ? 7 : 12} height="1.8" rx="0.9" fill="#c7c7cc" />
    ))}
  </g>
);

const PREVIEWS: Record<string, ReactNode> = {
  'pdf-merge': (
    <g>
      {page(8, 9)}
      {page(8, 27)}
      <path d="M32 30 h8 m-3 -3 l3 3 l-3 3" stroke="#8e8e93" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {page(46, 11, 'm1', true)}
      {page(50, 17, 'm2', true)}
    </g>
  ),
  'pdf-split': (
    <g>
      {page(10, 17, 's0', true)}
      <path d="M34 30 h8 m-3 -3 l3 3 l-3 3" stroke="#8e8e93" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {page(46, 6)}
      {page(46, 30)}
    </g>
  ),
  'pdf-organize': (
    <g>
      {page(6, 17)}
      {page(28, 13, 'o1', true)}
      {page(50, 17)}
      <path d="M34 47 q4 6 10 0" stroke="#0a84ff" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </g>
  ),
  'pdf-sign': (
    <g>
      {page(26, 6)}
      <rect x="26" y="6" width="20" height="26" rx="2" fill="#fff" stroke="rgba(0,0,0,0.12)" />
      <path d="M14 46 c6 -10 8 4 13 -4 s5 6 10 -1 s6 3 10 0" stroke="#1c3faa" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <line x1="12" y1="51" x2="62" y2="51" stroke="#c7c7cc" strokeWidth="1" />
    </g>
  ),
  'pdf-compress': (
    <g fontFamily="-apple-system, Inter, sans-serif" fontSize="7" fontWeight="700">
      {page(10, 17)}
      <path d="M34 30 h7 m-3 -3 l3 3 l-3 3" stroke="#8e8e93" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <rect x="47" y="22" width="15" height="19" rx="2" fill="#34c759" />
      <text x="54.5" y="34" textAnchor="middle" fill="#fff">−</text>
    </g>
  ),
  'images-to-pdf': (
    <g>
      <rect x="6" y="14" width="22" height="17" rx="2" fill="#8fc7e8" />
      <path d="M6 31 l7 -8 l5 5 l4 -3 l6 6 z" fill="#3f8f6b" />
      <path d="M33 30 h7 m-3 -3 l3 3 l-3 3" stroke="#8e8e93" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {page(46, 17, 'i1', true)}
    </g>
  ),
  'pdf-to-images': (
    <g>
      {page(8, 17, 't1', true)}
      <path d="M32 30 h7 m-3 -3 l3 3 l-3 3" stroke="#8e8e93" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <rect x="45" y="14" width="22" height="17" rx="2" fill="#8fc7e8" />
      <path d="M45 31 l7 -8 l5 5 l4 -3 l6 6 z" fill="#3f8f6b" />
      <rect x="45" y="34" width="22" height="10" rx="2" fill="#c7d2fe" />
    </g>
  ),
};

export function PdfPreview({ tool }: { tool: string }) {
  return (
    <span className="relative flex h-[60px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-line bg-window" aria-hidden="true">
      <svg viewBox="0 0 76 60" width="76" height="60" className="transition-transform duration-300 group-hover:scale-[1.06]">
        {PREVIEWS[tool]}
      </svg>
    </span>
  );
}

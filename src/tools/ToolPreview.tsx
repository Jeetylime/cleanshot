import type { ToolKey } from '../app/route';

/** Small illustrative thumbnails for tool cards. */
export function ToolPreview({ tool }: { tool: ToolKey }) {
  return (
    <span className="relative flex h-[60px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-line bg-window" aria-hidden="true">
      <svg viewBox="0 0 76 60" width="76" height="60" className="transition-transform duration-300 group-hover:scale-[1.06]">
        {PREVIEWS[tool]}
      </svg>
    </span>
  );
}

const checker = (
  <pattern id="tp-checker" width="8" height="8" patternUnits="userSpaceOnUse">
    <rect width="8" height="8" fill="#d9d9de" />
    <rect width="4" height="4" fill="#f4f4f6" />
    <rect x="4" y="4" width="4" height="4" fill="#f4f4f6" />
  </pattern>
);

const mountains = (x: number, y: number, w: number, h: number, sun = '#ffd60a') => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx="3" fill="#8fc7e8" />
    <circle cx={x + w * 0.72} cy={y + h * 0.3} r={h * 0.14} fill={sun} />
    <path d={`M${x} ${y + h} L${x + w * 0.35} ${y + h * 0.45} L${x + w * 0.6} ${y + h * 0.78} L${x + w * 0.78} ${y + h * 0.58} L${x + w} ${y + h} Z`} fill="#3f8f6b" />
  </g>
);

const PREVIEWS: Record<ToolKey, React.ReactNode> = {
  watermark: (
    <g>
      {mountains(8, 8, 60, 44)}
      <text x="62" y="47" textAnchor="end" fontSize="7" fontWeight="600" fill="#fff" opacity="0.85">© studio</text>
    </g>
  ),
  collage: (
    <g>
      <rect x="6" y="6" width="64" height="48" rx="3" fill="#fff" stroke="rgba(0,0,0,0.12)" />
      {mountains(10, 10, 27, 19)}
      {mountains(39, 10, 27, 19, '#ff9f0a')}
      {mountains(10, 31, 27, 19, '#ff375f')}
      {mountains(39, 31, 27, 19)}
    </g>
  ),
  frames: (
    <g>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={6 + i * 22} y="16" width="20" height="28" rx="2" fill="#2c2c2e" />
          <rect x={8 + i * 22} y="22" width="16" height="16" rx="1.5" fill="#8fc7e8" />
          <circle cx={12 + i * 22 + i * 3} cy="32" r="3" fill="#ff9f0a" />
          {[0, 1, 2].map((j) => <rect key={j} x={8 + i * 22 + j * 6} y="18" width="3" height="2" rx="0.5" fill="#636366" />)}
        </g>
      ))}
    </g>
  ),
  favicon: (
    <g>
      <rect x="6" y="12" width="64" height="36" rx="4" fill="#fff" stroke="rgba(0,0,0,0.12)" />
      <rect x="6" y="12" width="64" height="10" rx="4" fill="#e5e5ea" />
      <rect x="11" y="14.5" width="5" height="5" rx="1.2" fill="#0a84ff" />
      <rect x="19" y="16" width="20" height="2" rx="1" fill="#aeaeb2" />
      <rect x="44" y="26" width="18" height="18" rx="4.5" fill="#0a84ff" />
      <rect x="33" y="34" width="8" height="8" rx="2" fill="#0a84ff" />
      <rect x="25" y="38" width="4" height="4" rx="1" fill="#0a84ff" />
    </g>
  ),
  'background-remover': (
    <g>
      <defs>{checker}</defs>
      <rect x="0" y="0" width="38" height="60" fill="#7fb7a4" />
      <rect x="38" y="0" width="38" height="60" fill="url(#tp-checker)" />
      <circle cx="38" cy="22" r="9" fill="#f2c7a5" />
      <path d="M22 60 C 22 40, 54 40, 54 60 Z" fill="#0a84ff" />
      <line x1="38" y1="0" x2="38" y2="60" stroke="#fff" strokeWidth="1.5" />
    </g>
  ),
  upscaler: (
    <g>
      <g opacity="0.9">
        {[0, 1, 2, 3].map((i) =>
          [0, 1, 2, 3].map((j) => (
            <rect key={`${i}${j}`} x={8 + i * 6} y={18 + j * 6} width="6" height="6" fill={(i + j) % 2 ? '#8fc7e8' : '#5aa6d6'} />
          )),
        )}
      </g>
      <path d="M36 30 h8 m-3 -3 l3 3 l-3 3" stroke="currentColor" className="text-subtle" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {mountains(48, 14, 22, 32)}
    </g>
  ),
  resizer: (
    <g>
      {mountains(10, 12, 40, 30)}
      <rect x="10" y="12" width="56" height="40" rx="3" fill="none" stroke="#0a84ff" strokeWidth="1.4" strokeDasharray="3 2" />
      <path d="M58 44 l6 6 m0 -5 v5 h-5" stroke="#0a84ff" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  ),
  cropper: (
    <g>
      {mountains(8, 10, 60, 40)}
      <path d="M8 10 h60 v40 h-60 Z M20 18 v24 h36 v-24 Z" fill="rgba(0,0,0,0.45)" fillRule="evenodd" />
      <rect x="20" y="18" width="36" height="24" fill="none" stroke="#fff" strokeWidth="1.2" />
      <path d="M20 23 v-5 h5 M51 18 h5 v5 M56 37 v5 h-5 M25 42 h-5 v-5" stroke="#fff" strokeWidth="2.2" fill="none" />
    </g>
  ),
  compressor: (
    <g>
      <rect x="10" y="20" width="22" height="30" rx="3" fill="#8e8e93" opacity="0.5" />
      <rect x="44" y="32" width="22" height="18" rx="3" fill="#34c759" />
      <text x="21" y="15" textAnchor="middle" fontSize="8" fontWeight="700" fill="#8e8e93" fontFamily="-apple-system, Inter, sans-serif">
        4.2
      </text>
      <text x="55" y="27" textAnchor="middle" fontSize="8" fontWeight="700" fill="#34c759" fontFamily="-apple-system, Inter, sans-serif">
        0.9
      </text>
      <path d="M34 38 h7 m-3 -3 l3 3 l-3 3" stroke="#8e8e93" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </g>
  ),
  converter: (
    <g fontFamily="-apple-system, Inter, sans-serif" fontSize="7.5" fontWeight="700">
      <rect x="6" y="18" width="26" height="24" rx="4" fill="#0a84ff" />
      <text x="19" y="33" textAnchor="middle" fill="#fff">PNG</text>
      <rect x="44" y="18" width="26" height="24" rx="4" fill="#34c759" />
      <text x="57" y="33" textAnchor="middle" fill="#fff">WEBP</text>
      <path d="M34 26 h7 m-2.5 -2.5 l2.5 2.5 l-2.5 2.5 M42 35 h-7 m2.5 -2.5 l-2.5 2.5 l2.5 2.5" stroke="#8e8e93" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </g>
  ),
  metadata: (
    <g>
      {mountains(6, 12, 30, 36)}
      {[16, 24, 32, 40].map((y, i) => (
        <g key={y}>
          <rect x="42" y={y} width="8" height="3" rx="1.5" fill="#8e8e93" opacity="0.6" />
          <rect x="52" y={y} width={[16, 12, 18, 10][i]} height="3" rx="1.5" fill="#8e8e93" opacity="0.35" />
        </g>
      ))}
    </g>
  ),
  'photo-filters': (
    <g>
      <clipPath id="tp-half">
        <rect x="38" y="8" width="30" height="44" />
      </clipPath>
      {mountains(8, 8, 60, 44)}
      <g clipPath="url(#tp-half)" style={{ filter: 'grayscale(1) contrast(1.2)' }}>
        {mountains(8, 8, 60, 44)}
      </g>
      <line x1="38" y1="8" x2="38" y2="52" stroke="#fff" strokeWidth="1.5" />
    </g>
  ),
  animation: (
    <g>
      <rect x="6" y="12" width="64" height="36" rx="3" fill="#1d1d1f" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={10 + i * 20} y="18" width="16" height="22" rx="2" fill={['#ff9f0a', '#30d158', '#0a84ff'][i]} opacity={1 - i * 0.25} />
      ))}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <rect key={i} x={9 + i * 8} y="43" width="4" height="3" rx="0.5" fill="#fff" opacity="0.6" />
      ))}
    </g>
  ),
  splitter: (
    <g>
      {mountains(8, 14, 60, 32)}
      <line x1="28" y1="12" x2="28" y2="48" stroke="#fff" strokeWidth="1.5" strokeDasharray="3 2" />
      <line x1="48" y1="12" x2="48" y2="48" stroke="#fff" strokeWidth="1.5" strokeDasharray="3 2" />
    </g>
  ),
  'social-sizes': (
    <g>
      <rect x="6" y="12" width="26" height="26" rx="3" fill="#ff375f" />
      <rect x="35" y="6" width="16" height="28" rx="3" fill="#bf5af2" />
      <rect x="35" y="38" width="35" height="16" rx="3" fill="#0a84ff" />
      <rect x="54" y="10" width="16" height="20" rx="3" fill="#ff9f0a" />
    </g>
  ),
  'sprite-sheet': (
    <g>
      <rect x="8" y="8" width="60" height="44" rx="3" fill="url(#tp-checker)" />
      {checker}
      {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} x={12 + c * 14} y={12 + r * 13} width="10" height="9" rx="2" fill={['#0a84ff', '#30d158', '#ff9f0a', '#ff375f'][(r + c) % 4]} />))}
    </g>
  ),
  'batch-rename': (
    <g>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="8" y={10 + i * 14} width="60" height="10" rx="2.5" fill="#fff" stroke="rgba(0,0,0,0.12)" />
          <text x="12" y={17.5 + i * 14} fontSize="6" fontFamily="monospace" fill="#0a84ff">{`photo-00${i + 1}.jpg`}</text>
        </g>
      ))}
    </g>
  ),
  'image-diff': (
    <g>
      <rect x="6" y="10" width="30" height="40" rx="3" fill="#fff" stroke="rgba(0,0,0,0.12)" />
      <rect x="40" y="10" width="30" height="40" rx="3" fill="#fff" stroke="rgba(0,0,0,0.12)" />
      {[16, 24, 32].map((y) => (
        <g key={y}>
          <rect x="10" y={y} width="22" height="4" rx="1" fill="#c7c7cc" />
          <rect x="44" y={y} width="22" height="4" rx="1" fill={y === 24 ? '#ff2d55' : '#c7c7cc'} />
        </g>
      ))}
    </g>
  ),
  'color-picker': (
    <g>
      {['#2f6f8f', '#4f9d8c', '#7fb7a4', '#f3d9a4', '#f0a39a'].map((c, i) => (
        <rect key={c} x={8 + i * 12} y="34" width="12" height="16" fill={c} rx={i === 0 ? 0 : 0} />
      ))}
      <rect x="8" y="34" width="60" height="16" rx="3" fill="none" stroke="rgba(0,0,0,0.1)" />
      <circle cx="38" cy="18" r="9" fill="#7fb7a4" stroke="#fff" strokeWidth="2" />
    </g>
  ),
};

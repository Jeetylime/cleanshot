import { Clipboard, ImagePlus, Lock, MonitorUp, Sparkles, X } from 'lucide-react';
import { captureScreen, screenCaptureSupported } from '../lib/screenCapture';
import { useEditor } from '../store/store';
import * as actions from '../store/actions';
import { openFilePicker } from '../lib/filePicker';
import { modKey, timeAgo } from '../lib/utils';
import { Kbd } from './ui/Kbd';
import { Button } from './ui/controls';
import { Tooltip } from './ui/Tooltip';

async function pasteFromClipboard() {
  try {
    if (!navigator.clipboard?.read) throw new Error('unsupported');
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (type) {
        const blob = await item.getType(type);
        await actions.openImageBlob(blob);
        return;
      }
    }
    actions.showToast('No image on the clipboard. Take a screenshot, then paste.', 'info');
  } catch {
    actions.showToast(`Press ${modKey}V to paste a screenshot.`, 'info');
  }
}

async function captureFromScreen() {
  try {
    const blob = await captureScreen();
    await actions.openImageBlob(blob, `Screen capture ${new Date().toLocaleString().replace(/[/:]/g, '-')}.png`);
  } catch (err) {
    // Cancelling the browser's picker throws NotAllowedError; that's not worth a toast.
    if ((err as Error)?.name !== 'NotAllowedError') actions.showToast(`Screen capture failed: ${(err as Error)?.message ?? err}`, 'error');
  }
}

export function Illustration() {
  return (
    <svg viewBox="0 0 360 206" className="h-auto w-full max-w-[340px]" aria-hidden="true">
      <defs>
        <linearGradient id="es-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3d9a4" />
          <stop offset="0.5" stopColor="#7fb7a4" />
          <stop offset="1" stopColor="#2f6f8f" />
        </linearGradient>
        <filter id="es-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="7" stdDeviation="8" floodColor="#0b1d26" floodOpacity="0.28" />
        </filter>
        <filter id="es-blur">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <filter id="es-ann" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.4" floodOpacity="0.3" />
        </filter>
        <clipPath id="es-win">
          <rect x="52" y="28" width="256" height="150" rx="8" />
        </clipPath>
      </defs>
      <rect width="360" height="206" rx="14" fill="url(#es-bg)" />
      <g filter="url(#es-shadow)">
        <rect x="52" y="28" width="256" height="150" rx="8" fill="#fff" />
      </g>
      <g clipPath="url(#es-win)">
        <rect x="52" y="28" width="256" height="17" fill="#f3f3f5" />
        <circle cx="62" cy="36.5" r="2.8" fill="#ff5f57" />
        <circle cx="71" cy="36.5" r="2.8" fill="#febc2e" />
        <circle cx="80" cy="36.5" r="2.8" fill="#28c840" />
        <rect x="52" y="45" width="58" height="133" fill="#f8f8fa" />
        {[58, 70, 82, 94, 106].map((y, i) => (
          <rect key={y} x="60" y={y} width={i === 1 ? 38 : 32} height="5" rx="2.5" fill={i === 1 ? '#c7d2fe' : '#e3e3e8'} />
        ))}
        <rect x="122" y="56" width="74" height="8" rx="4" fill="#1d1d1f" />
        <rect x="122" y="70" width="128" height="5" rx="2.5" fill="#d8d8de" />
        <rect x="122" y="88" width="80" height="44" rx="5" fill="#fff" stroke="#e6e6ea" />
        <rect x="210" y="88" width="86" height="44" rx="5" fill="#fff" stroke="#e6e6ea" />
        <rect x="130" y="97" width="36" height="5" rx="2.5" fill="#c9c9cf" />
        <rect x="130" y="110" width="22" height="10" rx="3" fill="#1d1d1f" />
        {/* highlighted line */}
        <rect x="218" y="96" width="50" height="5" rx="2.5" fill="#c9c9cf" />
        <rect x="216" y="94" width="56" height="9" rx="2" fill="#ffd60a" opacity="0.5" />
        {/* blurred secret */}
        <g filter="url(#es-blur)">
          <rect x="218" y="112" width="70" height="7" rx="3" fill="#4b4b55" />
          <rect x="218" y="122" width="44" height="5" rx="2.5" fill="#8b8b95" />
        </g>
        <rect x="122" y="142" width="174" height="26" rx="5" fill="#f7f7f9" stroke="#ececf0" />
        <rect x="130" y="152" width="60" height="5" rx="2.5" fill="#cfcfd5" />
      </g>
      {/* step marker */}
      <g filter="url(#es-ann)">
        <circle cx="122" cy="88" r="9" fill="#ff3b30" />
        <circle cx="122" cy="88" r="8.2" fill="none" stroke="#fff" strokeWidth="1.2" />
        <text x="122" y="91.6" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff" fontFamily="-apple-system, Inter, sans-serif">
          1
        </text>
      </g>
      {/* arrow */}
      <g filter="url(#es-ann)">
        <path
          d="M318 160 C 300 152, 286 146, 268 134"
          fill="none"
          stroke="#ff3b30"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeDasharray="70"
          style={{ animation: 'cs-draw 0.9s 0.35s cubic-bezier(.2,.8,.2,1) both', ['--len' as string]: 70 }}
        />
        <path
          d="M262.5 130.5 L276 132.5 L270.5 141 Z"
          fill="#ff3b30"
          stroke="#ff3b30"
          strokeWidth="1.6"
          strokeLinejoin="round"
          style={{ animation: 'cs-fade-in 0.2s 1.1s both' }}
        />
      </g>
    </svg>
  );
}

export function EmptyState() {
  const recents = useEditor((s) => s.recents);
  const busy = useEditor((s) => s.busy);

  return (
    <main className="scroll-thin flex flex-1 items-start justify-center overflow-y-auto px-5 py-8 sm:items-center">
      <div className="flex w-full max-w-[600px] flex-col items-center animate-rise">
        {/* Clicking anywhere opens the picker for mouse users. Keyboard and screen-reader users get the
            real buttons inside, so this container isn't itself a button (no nested controls). */}
        <div
          data-testid="dropzone"
          onClick={openFilePicker}
          className="group relative flex w-full flex-col items-center gap-5 rounded-[18px] border border-dashed border-line-strong bg-panel/60 px-6 pt-7 pb-6 text-center transition-[border-color,background-color] duration-200 hover:border-accent/60 hover:bg-panel"
        >
          <Illustration />
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-fg">Drop a screenshot to start editing</h1>
            <p className="text-sm text-muted">
              Annotate, redact and frame screenshots — right in your browser.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button variant="primary" onClick={openFilePicker} className="h-8 px-3.5" disabled={!!busy}>
              <ImagePlus size={14} strokeWidth={2.2} />
              Choose image
            </Button>
            <Button variant="ghost" onClick={actions.openSample} className="h-8 px-3" disabled={!!busy}>
              <Sparkles size={14} />
              Try a sample
            </Button>
            <Button onClick={() => void pasteFromClipboard()} className="h-8 px-3" disabled={!!busy}>
              <Clipboard size={14} />
              Paste
              <span className="ml-0.5 flex gap-0.5">
                <Kbd>{modKey}</Kbd>
                <Kbd>V</Kbd>
              </span>
            </Button>
            {screenCaptureSupported() && (
              <Button onClick={() => void captureFromScreen()} className="h-8 px-3" disabled={!!busy}>
                <MonitorUp size={14} />
                Capture screen
              </Button>
            )}
          </div>
          <p className="text-xs text-subtle">PNG, JPG or WebP · any size</p>
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-xs text-subtle">
          <Lock size={11} />
          Images never leave your device — editing happens entirely in the browser.
        </p>

        {recents.length > 0 && (
          <section className="mt-9 w-full" aria-label="Recent sessions">
            <div className="mb-2.5 flex items-center justify-between px-0.5">
              <h2 className="text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">Recent</h2>
              <span className="text-xs text-subtle">Restores annotations and settings</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {recents.slice(0, 6).map((r) => (
                <div key={r.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => void actions.openSession(r.id)}
                    className="flex w-full flex-col overflow-hidden rounded-[11px] border border-line bg-panel text-left transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop"
                  >
                    <div className="flex aspect-[16/10] w-full items-center justify-center overflow-hidden bg-window p-2">
                      {r.thumbUrl ? (
                        <img src={r.thumbUrl} alt="" className="max-h-full max-w-full rounded-[3px] object-contain shadow-soft" draggable={false} />
                      ) : (
                        <ImagePlus size={18} className="text-subtle" />
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5 border-t border-line px-2.5 py-2">
                      <span className="truncate text-xs font-medium text-fg">{r.name}</span>
                      <span className="text-2xs text-subtle tabular-nums">
                        {timeAgo(r.updatedAt)} · {r.width}×{r.height}
                      </span>
                    </div>
                  </button>
                  <Tooltip label="Remove from recents" className="absolute top-1.5 right-1.5">
                    <button
                      type="button"
                      aria-label={`Remove ${r.name}`}
                      onClick={() => void actions.removeRecent(r.id)}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <X size={11} strokeWidth={2.5} />
                    </button>
                  </Tooltip>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

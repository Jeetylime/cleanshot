import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Download, Film, Square, X } from 'lucide-react';
import { recordingState, recordScreen, stopRecording, subscribeRecording, videoFrames } from '../lib/screenCapture';
import { downloadBlob } from '../engine/export';
import { showToast } from '../store/actions';
import { Button } from './ui/controls';
import { formatBytes } from '../lib/utils';

const resultListeners = new Set<(b: Blob) => void>();

/** Start a screen recording; the result opens in the recording dialog. */
export async function startRecording(audio = false) {
  try {
    const blob = await recordScreen({ audio });
    if (blob.size) resultListeners.forEach((l) => l(blob));
  } catch (err) {
    if ((err as Error)?.name !== 'NotAllowedError') showToast(`Recording failed: ${(err as Error)?.message ?? err}`, 'error');
  }
}

/** Floating "Recording 0:12 · Stop" bar while recording, and the result dialog after. */
export function RecordingBar() {
  const state = useSyncExternalStore(subscribeRecording, recordingState);
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<Blob | null>(null);
  useEffect(() => {
    const l = (b: Blob) => setResult(b);
    resultListeners.add(l);
    return () => {
      resultListeners.delete(l);
    };
  }, []);
  useEffect(() => {
    if (!state) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [state]);
  const secs = state ? Math.floor((now - state.started) / 1000) : 0;
  return (
    <>
      {state &&
        createPortal(
          <div role="status" className="fixed top-3 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-full border border-line-strong bg-elevated py-1.5 pr-1.5 pl-3.5 text-sm text-fg shadow-pop">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#ff3b30]" aria-hidden="true" />
            <span className="tabular-nums">
              Recording {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
            </span>
            <Button variant="primary" className="h-[26px] rounded-full" onClick={stopRecording}>
              <Square size={11} fill="currentColor" /> Stop
            </Button>
          </div>,
          document.body,
        )}
      {result && <ResultDialog blob={result} onClose={() => setResult(null)} />}
    </>
  );
}

function ResultDialog({ blob, onClose }: { blob: Blob; onClose: () => void }) {
  const [url] = useState(() => URL.createObjectURL(blob));
  const [gif, setGif] = useState<number | null>(null);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const name = `Screen recording ${new Date().toLocaleString().replace(/[/:]/g, '-')}`;
  const toGif = async () => {
    setGif(0);
    try {
      const fps = 10;
      const { frames, width, height } = await videoFrames(blob, { fps, maxWidth: 800, maxSeconds: 30, onProgress: (p) => setGif(p * 0.5) });
      const { encodeGif } = await import('../lib/gif');
      const data = frames.map((c) => ({ data: c.getContext('2d')!.getImageData(0, 0, width, height).data, delay: 1000 / fps }));
      frames.forEach((c) => (c.width = c.height = 0));
      const out = await encodeGif(data, { width, height, onProgress: (p) => setGif(0.5 + p * 0.5) });
      await downloadBlob(out, `${name}.gif`);
    } catch (err) {
      showToast(`Couldn’t make a GIF: ${(err as Error).message}`, 'error');
    } finally {
      setGif(null);
    }
  };
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4 animate-fade-in" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Screen recording" onKeyDown={(e) => e.key === 'Escape' && onClose()} className="flex w-full max-w-[640px] flex-col gap-3 rounded-[16px] border border-line-strong bg-elevated p-4 shadow-pop animate-pop-in">
        <div className="flex items-center justify-between">
          <h2 className="text-[length:calc(15px*var(--text-scale))] font-semibold text-fg">Screen recording</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-muted hover:bg-hover hover:text-fg">
            <X size={15} />
          </button>
        </div>
        <video src={url} controls className="max-h-[56vh] w-full rounded-[8px] bg-black" />
        <p className="text-xs text-subtle">
          {ext.toUpperCase()} · {formatBytes(blob.size)} · Recorded on this device; nothing was uploaded.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button className="h-8" disabled={gif !== null} onClick={() => void toGif()}>
            <Film size={14} /> {gif !== null ? `Making GIF… ${Math.round(gif * 100)}%` : 'Save as GIF (first 30 s)'}
          </Button>
          <Button variant="primary" className="h-8" onClick={() => void downloadBlob(blob, `${name}.${ext}`)}>
            <Download size={14} /> Download video
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

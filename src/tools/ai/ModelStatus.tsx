import { useEffect, useState } from 'react';
import { Cpu, HardDriveDownload, RotateCcw } from 'lucide-react';
import { goPrivacy } from '../../app/route';
import { getBundledManifest } from './bundled';
import { formatBytes } from '../../lib/utils';
import { Button } from '../../components/ui/controls';
import { ProgressBar, Spinner } from '../shared/ui';
import type { DownloadProgress, ModelInfo } from './runtime';

export type AiPhase = 'need-model' | 'downloading' | 'processing' | 'ready' | 'error';

/**
 * First-use download prompt, download progress and processing state for an
 * AI model, shown as a floating card over the tool's preview.
 */
export function ModelStatus({
  model,
  phase,
  progress,
  processingLabel,
  processingProgress,
  error,
  onStart,
  onRetry,
  onCancel,
  detail,
}: {
  model: ModelInfo;
  phase: AiPhase;
  progress: DownloadProgress | null;
  processingLabel: string;
  processingProgress?: number | null;
  error: string | null;
  onStart: () => void;
  onRetry: () => void;
  onCancel?: () => void;
  detail?: string | null;
}) {
  const bundled = useBundled();
  if (phase === 'ready') return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-window/55 p-6 backdrop-blur-[3px] animate-fade-in">
      <div className="flex w-full max-w-[380px] flex-col gap-4 rounded-[14px] border border-line-strong bg-elevated p-5 shadow-pop" role="status" data-testid="model-status">
        {phase === 'need-model' && (
          <>
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
                <HardDriveDownload size={18} />
              </span>
              <div className="flex flex-col gap-1">
                <p className="text-[length:calc(13px*var(--text-scale))] font-semibold text-fg">{bundled ? 'Load' : 'Download'} {model.label}</p>
                <p className="text-xs leading-[17px] text-muted">
                  {formatBytes(model.bytes)}
                  {bundled ? ', included with this page.' : ', one time. After that it works offline.'}
                </p>
              </div>
            </div>
            <Button variant="primary" className="h-8" onClick={onStart}>
              {bundled ? 'Load model and continue' : 'Download model and continue'}
            </Button>
            <p className="text-2xs leading-[15px] text-subtle">
              The model downloads from Hugging Face, which sees your IP address. Your images aren’t sent anywhere.{' '}
              <button type="button" onClick={goPrivacy} className="hover:text-fg hover:underline">
                Model details, license and privacy
              </button>
            </p>
          </>
        )}
        {phase === 'downloading' && (
          <>
            <p className="flex items-center gap-2 text-[length:calc(13px*var(--text-scale))] font-semibold text-fg">
              <Spinner /> Downloading model…
            </p>
            <ProgressBar
              value={progress && progress.total ? Math.min(1, progress.loaded / Math.max(progress.total, model.bytes)) : null}
              label={
                <>
                  <span>{model.label}</span>
                  <span className="tabular-nums">
                    {progress && progress.total ? `${formatBytes(progress.loaded)} of ${formatBytes(Math.max(progress.total, model.bytes))}` : 'Starting…'}
                  </span>
                </>
              }
            />
            <p className="text-xs text-subtle">
              {bundled ? 'Loading the model included with this page.' : 'This happens once. Next time the model loads from your browser’s cache.'}
            </p>
          </>
        )}
        {phase === 'processing' && (
          <>
            <p className="flex items-center gap-2 text-[length:calc(13px*var(--text-scale))] font-semibold text-fg">
              <Cpu size={15} className="text-accent" /> {processingLabel}
            </p>
            <ProgressBar value={processingProgress ?? null} label={detail ? <span className="tabular-nums">{detail}</span> : undefined} />
            {onCancel && (
              <Button className="h-8" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </>
        )}
        {phase === 'error' && (
          <>
            <p className="text-[length:calc(13px*var(--text-scale))] font-semibold text-fg">Something went wrong</p>
            <p className="text-xs leading-[17px] text-muted">{error}</p>
            <Button variant="primary" className="h-8" onClick={onRetry}>
              <RotateCcw size={13} /> Try again
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Whether models are bundled with the page (no Hugging Face download). */
export function useBundled(): boolean {
  const [b, setB] = useState(false);
  useEffect(() => {
    void getBundledManifest().then((m) => setB(!!m));
  }, []);
  return b;
}

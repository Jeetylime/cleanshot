import { useEffect, useRef, useState } from 'react';
import type { ImageSource } from '../../engine/images';
import { describeAiError, isModelCached, type DownloadProgress } from './runtime';
import { ModelStatus, type AiPhase } from './ModelStatus';
import { loadOcr, OCR_MODEL, ocrReady, recognize, type OcrLine } from './ocr';

/**
 * Shared OCR flow: first-use model prompt, download progress, recognition
 * progress and errors, rendered with ModelStatus. `run` resolves with the
 * lines, or null if the person cancelled or it failed.
 */
export function useOcr() {
  const [phase, setPhase] = useState<AiPhase | 'idle'>('idle');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState<boolean>(ocrReady());
  const signal = useRef({ cancelled: false });
  const pending = useRef<{ src: ImageSource; label: string; resolve: (l: OcrLine[] | null) => void } | null>(null);
  const [label, setLabel] = useState('Reading text…');

  useEffect(() => {
    if (!cached) void isModelCached(OCR_MODEL).then(setCached);
  }, [cached]);

  const go = async () => {
    const job = pending.current;
    if (!job) return;
    const token = { cancelled: false };
    signal.current = token;
    setError(null);
    try {
      if (!ocrReady()) {
        setPhase('downloading');
        setProgress(null);
        await loadOcr(setProgress);
        setCached(true);
      }
      setPhase('processing');
      setDone(0);
      const lines = await recognize(job.src, { onProgress: setDone, signal: token });
      setPhase('ready');
      pending.current = null;
      job.resolve(token.cancelled ? null : lines);
    } catch (err) {
      console.error(err);
      if (token.cancelled) {
        setPhase('idle');
        pending.current = null;
        job.resolve(null);
        return;
      }
      setError(describeAiError(err, 'text recognition'));
      setPhase('error');
    } finally {
      setDone(null);
    }
  };

  /** Recognize text; asks before the first model download. */
  const run = (src: ImageSource, what = 'Reading text…'): Promise<OcrLine[] | null> =>
    new Promise((resolve) => {
      pending.current?.resolve(null);
      pending.current = { src, label: what, resolve };
      setLabel(what);
      if (ocrReady() || cached) void go();
      else setPhase('need-model');
    });

  const cancel = () => {
    signal.current.cancelled = true;
    if (phase === 'need-model' || phase === 'error') {
      pending.current?.resolve(null);
      pending.current = null;
      setPhase('idle');
    }
  };

  const status =
    phase === 'idle' || phase === 'ready' ? null : (
      <ModelStatus
        model={OCR_MODEL}
        phase={phase}
        progress={progress}
        processingLabel={label}
        processingProgress={done}
        error={error}
        onStart={() => void go()}
        onRetry={() => void go()}
        onCancel={cancel}
      />
    );
  return { run, status, busy: phase === 'downloading' || phase === 'processing', cancel };
}

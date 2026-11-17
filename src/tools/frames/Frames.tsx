import { useEffect, useState } from 'react';
import { Check, Download, Film, FolderArchive } from 'lucide-react';
import { Button, Segmented } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { encodeCanvas, FORMATS, type OutFormat } from '../shared/encode';
import { baseName } from '../shared/files';
import { errorMessage } from '../shared/batch';
import { createZip } from '../shared/zip';
import { Dropzone, Notice, PanelSection, ProgressBar, saveBlob, Spinner, ToolLayout, useFileSink } from '../shared/ui';

interface Frame {
  canvas: HTMLCanvasElement;
  url: string;
  /** Frame duration in milliseconds. */
  duration: number;
}

const ACCEPT = 'image/gif,image/webp,image/png,image/apng';

/** Whether this browser can decode animation frames (WebCodecs ImageDecoder). */
export function framesSupported(): boolean {
  return typeof (globalThis as { ImageDecoder?: unknown }).ImageDecoder === 'function';
}

interface DecodedFrame {
  image: VideoFrame;
}

async function decodeFrames(file: File, onProgress: (n: number, total: number) => void): Promise<Frame[]> {
  const Decoder = (globalThis as unknown as { ImageDecoder: new (init: { data: ReadableStream | ArrayBuffer; type: string }) => {
    tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
    completed: Promise<void>;
    decode: (o: { frameIndex: number }) => Promise<DecodedFrame>;
    close: () => void;
  } }).ImageDecoder;
  const type = file.type || (/\.gif$/i.test(file.name) ? 'image/gif' : /\.webp$/i.test(file.name) ? 'image/webp' : 'image/png');
  const decoder = new Decoder({ data: await file.arrayBuffer(), type });
  try {
    await decoder.completed;
    await decoder.tracks.ready;
    const total = decoder.tracks.selectedTrack?.frameCount ?? 1;
    if (total > 2000) throw new Error(`This animation has ${total} frames; the limit is 2000.`);
    const frames: Frame[] = [];
    for (let i = 0; i < total; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      const c = document.createElement('canvas');
      c.width = image.displayWidth;
      c.height = image.displayHeight;
      c.getContext('2d')!.drawImage(image, 0, 0);
      const duration = image.duration ? image.duration / 1000 : 100;
      image.close();
      frames.push({ canvas: c, url: '', duration });
      onProgress(i + 1, total);
    }
    return frames;
  } finally {
    decoder.close();
  }
}

export default function Frames() {
  const [file, setFile] = useState<File | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState<number | null>(null);
  const [format, setFormat] = useState<OutFormat>('png');
  const [busy, setBusy] = useState(false);
  const supported = framesSupported();

  const add = (files: File[]) => {
    const f = files.find((x) => /^image\/(gif|webp|png|apng)$/.test(x.type) || /\.(gif|webp|png|apng)$/i.test(x.name));
    if (!f) return showToast('Choose an animated GIF, WebP or PNG.', 'error');
    setFile(f);
  };
  useFileSink(add);

  useEffect(() => {
    setFrames([]);
    setSelected(new Set());
    if (!file || !supported) return;
    let cancelled = false;
    setProgress(0);
    decodeFrames(file, (n, t) => !cancelled && setProgress(n / t))
      .then((fr) => {
        if (cancelled) return;
        fr.forEach((f) => (f.url = f.canvas.toDataURL('image/png')));
        setFrames(fr);
        if (fr.length === 1) showToast('This image has only one frame.', 'info');
      })
      .catch((err) => !cancelled && showToast(`Couldn’t read frames: ${errorMessage(err)}`, 'error'))
      .finally(() => !cancelled && setProgress(null));
    return () => {
      cancelled = true;
    };
  }, [file, supported]);

  const toggle = (i: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const download = async (indices: number[]) => {
    if (!file) return;
    setBusy(true);
    try {
      const pad = String(frames.length).length;
      const files = [];
      for (const i of indices) {
        const { blob, format: f } = await encodeCanvas(frames[i].canvas, format, 92);
        files.push({ name: `${baseName(file.name)}-frame-${String(i + 1).padStart(pad, '0')}.${FORMATS[f].ext}`, blob });
      }
      if (files.length === 1) await saveBlob(files[0].blob, files[0].name);
      else await saveBlob(await createZip(files), `${baseName(file.name)}-frames.zip`);
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const total = frames.reduce((s, f) => s + f.duration, 0);

  const main = file ? (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-5">
      {progress !== null && <div className="mx-auto max-w-[480px]"><ProgressBar value={progress} label={<span>Decoding frames…</span>} /></div>}
      <div className="mx-auto grid max-w-[1100px] grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
        {frames.map((f, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={selected.has(i)}
            onClick={() => toggle(i)}
            className={`relative flex flex-col gap-1 rounded-[10px] border p-1.5 text-left ${selected.has(i) ? 'border-accent bg-accent-soft' : 'border-line bg-panel hover:border-line-strong'}`}
          >
            <span className="flex aspect-square items-center justify-center overflow-hidden rounded-[6px] bg-[repeating-conic-gradient(#d9d9de_0%_25%,#f4f4f6_0%_50%)] bg-[length:12px_12px]">
              <img src={f.url} alt={`Frame ${i + 1}`} className="max-h-full max-w-full object-contain" />
            </span>
            <span className="flex justify-between px-0.5 text-2xs text-subtle tabular-nums">
              <span>#{i + 1}</span>
              <span>{Math.round(f.duration)} ms</span>
            </span>
            {selected.has(i) && <Check size={14} className="absolute top-2.5 right-2.5 rounded-full bg-accent-fill p-0.5 text-white" />}
          </button>
        ))}
      </div>
    </div>
  ) : (
    <Dropzone onFiles={add} accept={ACCEPT} title="Drop an animated GIF, WebP or PNG" hint="Every frame becomes its own image" icon={<Film size={20} />} />
  );

  return (
    <ToolLayout
      main={main}
      panel={
        <>
          {!supported && (
            <div className="px-4 py-3">
              <Notice tone="error">This browser can’t decode animation frames. Try a recent Chrome, Edge or Firefox.</Notice>
            </div>
          )}
          {file && (
            <PanelSection title="Animation">
              <dl className="grid grid-cols-2 gap-y-1 text-xs">
                <dt className="text-subtle">File</dt>
                <dd className="truncate text-right text-fg">{file.name}</dd>
                <dt className="text-subtle">Frames</dt>
                <dd className="text-right text-fg tabular-nums">{frames.length || '…'}</dd>
                {frames[0] && (
                  <>
                    <dt className="text-subtle">Size</dt>
                    <dd className="text-right text-fg tabular-nums">{frames[0].canvas.width}×{frames[0].canvas.height}</dd>
                    <dt className="text-subtle">Duration</dt>
                    <dd className="text-right text-fg tabular-nums">{(total / 1000).toFixed(2)} s</dd>
                  </>
                )}
              </dl>
              <Button className="h-7" onClick={() => setFile(null)}>Choose another file</Button>
            </PanelSection>
          )}
          <PanelSection title="Output">
            <Segmented<OutFormat> ariaLabel="Frame format" value={format} onChange={setFormat} options={(['png', 'jpeg', 'webp'] as OutFormat[]).map((f) => ({ value: f, label: FORMATS[f].label }))} />
            {frames.length > 0 && (
              <div className="flex gap-2">
                <Button variant="ghost" className="h-7" onClick={() => setSelected(new Set(frames.map((_, i) => i)))}>Select all</Button>
                <Button variant="ghost" className="h-7" onClick={() => setSelected(new Set())}>Clear</Button>
              </div>
            )}
          </PanelSection>
        </>
      }
      footer={
        <>
          <Button className="h-8" disabled={!selected.size || busy} onClick={() => void download([...selected].sort((a, b) => a - b))}>
            <Download size={14} /> Download {selected.size || ''} selected
          </Button>
          <Button variant="primary" className="h-8" disabled={!frames.length || busy} onClick={() => void download(frames.map((_, i) => i))}>
            {busy ? <Spinner size={13} /> : <FolderArchive size={14} />} Download all frames
          </Button>
        </>
      }
    />
  );
}

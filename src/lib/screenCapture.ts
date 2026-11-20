/**
 * Capture one frame of a screen, window or tab with getDisplayMedia.
 * Everything stays local: the stream is read into a canvas and stopped.
 */
export function screenCaptureSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
}

/** A small "3… 2… 1…" pill, removed before the frame is taken so it never shows up in a capture of this tab. */
async function countdown(seconds: number) {
  const pill = document.createElement('div');
  pill.setAttribute('role', 'status');
  pill.setAttribute('aria-live', 'assertive');
  pill.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:9999;padding:8px 16px;border-radius:999px;background:rgba(0,0,0,.82);color:#fff;font:600 15px/1.2 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.3)';
  document.body.appendChild(pill);
  try {
    for (let s = seconds; s > 0; s--) {
      pill.textContent = `Capturing in ${s}…`;
      document.title = `${s}… · Studiolo`;
      await new Promise((r) => setTimeout(r, 1000));
    }
  } finally {
    pill.remove();
    document.title = 'Studiolo';
    // Two frames so the removed pill is no longer painted.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
}

export async function captureScreen(opts: { delay?: number } = {}): Promise<Blob> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false, preferCurrentTab: false } as DisplayMediaStreamOptions);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    // Let the first frames settle so the browser's picker overlay is gone.
    await new Promise((r) => setTimeout(r, 350));
    if (opts.delay) await countdown(opts.delay);
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) throw new Error('The capture didn’t produce an image.');
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(video, 0, 0, w, h);
    video.srcObject = null;
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t encode the capture.'))), 'image/png'));
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

// ---------------------------------------------------------------------------
// Screen recording

type RecListener = () => void;
const recListeners = new Set<RecListener>();
let active: { started: number; stop: () => void } | null = null;
/** Stable snapshot for useSyncExternalStore (a new object only when the state changes). */
let snapshot: { started: number } | null = null;

export function recordingState(): { started: number } | null {
  return snapshot;
}

export function subscribeRecording(l: RecListener): () => void {
  recListeners.add(l);
  return () => recListeners.delete(l);
}

const emit = () => {
  snapshot = active ? { started: active.started } : null;
  recListeners.forEach((l) => l());
};

export function recordingSupported(): boolean {
  return screenCaptureSupported() && typeof MediaRecorder !== 'undefined';
}

/**
 * Record a screen, window or tab (optionally with tab/system audio) until
 * stopRecording() is called or the person stops sharing in the browser UI.
 * Resolves with the video. Everything stays in memory on this device.
 */
export async function recordScreen(opts: { audio?: boolean } = {}): Promise<Blob> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: !!opts.audio } as DisplayMediaStreamOptions);
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: (mimeType || 'video/webm').split(';')[0] }));
  });
  const stop = () => {
    if (rec.state !== 'inactive') rec.stop();
    stream.getTracks().forEach((t) => t.stop());
  };
  // The browser's own "Stop sharing" button ends the video track.
  stream.getVideoTracks()[0]?.addEventListener('ended', stop);
  rec.start(500);
  active = { started: Date.now(), stop };
  emit();
  try {
    return await done;
  } finally {
    active = null;
    emit();
  }
}

export function stopRecording() {
  active?.stop();
}

/** Sample a video into frames (for GIF conversion). */
export async function videoFrames(blob: Blob, opts: { fps: number; maxWidth: number; maxSeconds: number; onProgress?: (p: number) => void }): Promise<{ frames: HTMLCanvasElement[]; width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      v.onloadedmetadata = () => resolve();
      v.onerror = () => reject(new Error('Couldn’t read the recording.'));
    });
    // MediaRecorder files often report Infinity until seeked to the end.
    if (!Number.isFinite(v.duration)) {
      v.currentTime = 1e9;
      await new Promise((r) => (v.onseeked = r));
    }
    const duration = Math.min(Number.isFinite(v.duration) ? v.duration : opts.maxSeconds, opts.maxSeconds);
    const k = Math.min(1, opts.maxWidth / v.videoWidth);
    const width = Math.max(2, Math.round(v.videoWidth * k));
    const height = Math.max(2, Math.round(v.videoHeight * k));
    const frames: HTMLCanvasElement[] = [];
    const n = Math.max(1, Math.floor(duration * opts.fps));
    for (let i = 0; i < n; i++) {
      v.currentTime = i / opts.fps;
      await new Promise((r) => (v.onseeked = r));
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      c.getContext('2d')!.drawImage(v, 0, 0, width, height);
      frames.push(c);
      opts.onProgress?.((i + 1) / n);
    }
    return { frames, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

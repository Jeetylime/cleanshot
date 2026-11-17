/**
 * Capture one frame of a screen, window or tab with getDisplayMedia.
 * Everything stays local: the stream is read into a canvas and stopped.
 */
export function screenCaptureSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
}

export async function captureScreen(): Promise<Blob> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false, preferCurrentTab: false } as DisplayMediaStreamOptions);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    // Let the first frames settle so the browser's picker overlay is gone.
    await new Promise((r) => setTimeout(r, 350));
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

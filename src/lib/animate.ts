import { createCanvas, ctx2d } from '../engine/images';
import { encodeGif } from './gif';

/**
 * Slideshow animation shared by the Animation Maker tool and Canvas's
 * animated export: each slide holds for a while, then transitions into the
 * next. Output as an animated GIF or a video (WebM, or MP4 where that is
 * what the browser records).
 */

export type Transition = 'cut' | 'fade' | 'slide' | 'push' | 'zoom';

export interface AnimationOptions {
  width: number;
  height: number;
  /** ms each slide is shown, without the transition. */
  hold: number;
  transition: Transition;
  /** ms per transition. */
  transitionMs: number;
  /** Frames per second for transitions (GIF) or the whole video. */
  fps: number;
  background: string;
  /** Slides are fitted (contain) or fill the frame (cover). */
  fit: 'contain' | 'cover';
  /** Transition from the last slide back to the first (for looping). */
  loopBack: boolean;
}

export interface Slide {
  source: CanvasImageSource;
  width: number;
  height: number;
}

function drawSlide(ctx: CanvasRenderingContext2D, s: Slide, o: AnimationOptions, alpha = 1, dx = 0, scale = 1) {
  const { width: W, height: H } = o;
  const k = (o.fit === 'cover' ? Math.max(W / s.width, H / s.height) : Math.min(W / s.width, H / s.height)) * scale;
  const w = s.width * k;
  const h = s.height * k;
  ctx.globalAlpha = alpha;
  ctx.drawImage(s.source, (W - w) / 2 + dx, (H - h) / 2, w, h);
  ctx.globalAlpha = 1;
}

/** Paint the scene at time t (ms). Returns false after the end. */
export function paintAt(ctx: CanvasRenderingContext2D, slides: Slide[], o: AnimationOptions, t: number): boolean {
  const n = slides.length;
  if (!n) return false;
  const tr = o.transition === 'cut' ? 0 : o.transitionMs;
  const seg = o.hold + tr;
  const total = totalDuration(n, o);
  if (t >= total) return false;
  const i = Math.min(n - 1, Math.floor(t / seg));
  const local = t - i * seg;
  const next = (i + 1) % n;
  const hasNext = i < n - 1 || o.loopBack;
  ctx.fillStyle = o.background;
  ctx.fillRect(0, 0, o.width, o.height);
  ctx.imageSmoothingQuality = 'high';
  if (local < o.hold || !hasNext || !tr) {
    drawSlide(ctx, slides[i], o);
    return true;
  }
  const p = easeInOut((local - o.hold) / tr);
  const W = o.width;
  switch (o.transition) {
    case 'fade':
      drawSlide(ctx, slides[i], o);
      drawSlide(ctx, slides[next], o, p);
      break;
    case 'slide':
      drawSlide(ctx, slides[i], o);
      ctx.fillStyle = o.background;
      ctx.fillRect(W * (1 - p), 0, W * p + 1, o.height);
      drawSlide(ctx, slides[next], o, 1, W * (1 - p));
      break;
    case 'push':
      drawSlide(ctx, slides[i], o, 1, -W * p);
      drawSlide(ctx, slides[next], o, 1, W * (1 - p));
      break;
    case 'zoom':
      drawSlide(ctx, slides[i], o, 1 - p, 0, 1 + p * 0.15);
      drawSlide(ctx, slides[next], o, p, 0, 0.92 + p * 0.08);
      break;
    default:
      drawSlide(ctx, slides[next], o);
  }
  return true;
}

export function totalDuration(n: number, o: AnimationOptions): number {
  const tr = o.transition === 'cut' ? 0 : o.transitionMs;
  return n * o.hold + (n - 1 + (o.loopBack ? 1 : 0)) * tr;
}

const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/**
 * Frames for a GIF: one long frame per hold, then short frames through each
 * transition (GIF delays are in 10 ms steps, so fps is capped at 50).
 */
export async function renderGif(slides: Slide[], o: AnimationOptions, onProgress?: (p: number) => void): Promise<Blob> {
  const c = createCanvas(o.width, o.height);
  const ctx = ctx2d(c, { willReadFrequently: true });
  const frames: { data: Uint8ClampedArray; delay: number }[] = [];
  const tr = o.transition === 'cut' ? 0 : o.transitionMs;
  const step = 1000 / Math.min(50, Math.max(5, o.fps));
  const seg = o.hold + tr;
  const grab = (t: number, delay: number) => {
    paintAt(ctx, slides, o, t);
    frames.push({ data: ctx.getImageData(0, 0, o.width, o.height).data, delay });
  };
  for (let i = 0; i < slides.length; i++) {
    grab(i * seg, o.hold);
    const hasNext = i < slides.length - 1 || o.loopBack;
    if (tr && hasNext) for (let t = step; t < tr; t += step) grab(i * seg + o.hold + t, step);
  }
  return encodeGif(frames, { width: o.width, height: o.height, loop: 0, onProgress });
}

/** The video type this browser can record, or null. */
export function videoType(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
  const cands: [string, string][] = [
    ['video/webm;codecs=vp9', 'webm'],
    ['video/webm;codecs=vp8', 'webm'],
    ['video/webm', 'webm'],
    ['video/mp4;codecs=avc1', 'mp4'],
    ['video/mp4', 'mp4'],
  ];
  for (const [mime, ext] of cands) if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  return null;
}

/** Record the slideshow in real time with MediaRecorder. */
export async function renderVideo(slides: Slide[], o: AnimationOptions, onProgress?: (p: number) => void): Promise<Blob> {
  const type = videoType();
  if (!type) throw new Error('Video recording isn’t supported in this browser. Choose GIF instead.');
  const c = createCanvas(o.width, o.height);
  const ctx = ctx2d(c);
  paintAt(ctx, slides, o, 0);
  const stream = c.captureStream(o.fps);
  const rec = new MediaRecorder(stream, { mimeType: type.mime, videoBitsPerSecond: Math.min(12_000_000, o.width * o.height * o.fps * 0.15) });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
  const total = totalDuration(slides.length, o);
  rec.start(250);
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = performance.now() - t0;
      if (t >= total) {
        paintAt(ctx, slides, o, total - 1);
        resolve();
        return;
      }
      paintAt(ctx, slides, o, t);
      onProgress?.(t / total);
      // setTimeout, not rAF: keeps recording when the tab is in the background.
      setTimeout(tick, 1000 / o.fps);
    };
    tick();
  });
  rec.stop();
  stream.getTracks().forEach((tr) => tr.stop());
  await done;
  c.width = c.height = 0;
  return new Blob(chunks, { type: type.mime.split(';')[0] });
}

import { createCanvas, ctx2d, type ImageSource } from '../../engine/images';
import { loadTransformers, progressTracker, type DownloadProgress, type ModelInfo } from './runtime';

/**
 * On-device text recognition (OCR) with Florence-2 (MIT license) through
 * Transformers.js. Used by Image to Text, Edit's "Copy text" and auto-redact,
 * and the PDF "Make Searchable" tool. Images never leave the browser.
 *
 * Florence-2 sees a 768×768 view of its input, so large images are read in
 * overlapping tiles and the results merged.
 */

export const OCR_MODEL: ModelInfo = {
  id: 'onnx-community/Florence-2-base-ft',
  // The largest file; used to check whether the model is cached.
  file: 'onnx/vision_encoder_q4.onnx',
  bytes: 39_390_433 + 81_236_858 + 30_058_778 + 64_393_474,
  label: 'Florence-2 text recognition',
  license: 'MIT license',
};

export interface OcrLine {
  text: string;
  /** Axis-aligned box in source image pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
}

type Model = { generate: (inputs: Record<string, unknown>) => Promise<unknown> };
type Processor = ((img: unknown) => Promise<Record<string, unknown>>) & {
  construct_prompts: (task: string) => string[];
  post_process_generation: (text: string, task: string, size: [number, number]) => Record<string, { quad_boxes: number[][]; labels: string[] }>;
};
type Tokenizer = ((t: string[]) => Record<string, unknown>) & { batch_decode: (ids: unknown, o: { skip_special_tokens: boolean }) => string[] };

let loading: Promise<{ model: Model; processor: Processor; tokenizer: Tokenizer }> | null = null;
let ready = false;
export const ocrReady = () => ready;

export function loadOcr(onProgress: (p: DownloadProgress) => void = () => {}) {
  if (!loading) {
    loading = (async () => {
      const progress_callback = progressTracker(onProgress);
      const T = await loadTransformers(progress_callback);
      const [model, processor, tokenizer] = await Promise.all([
        T.Florence2ForConditionalGeneration.from_pretrained(OCR_MODEL.id, {
          dtype: { embed_tokens: 'q8', vision_encoder: 'q4', encoder_model: 'q4', decoder_model_merged: 'q4' },
          device: 'wasm',
          progress_callback,
        }),
        T.AutoProcessor.from_pretrained(OCR_MODEL.id, { progress_callback }),
        T.AutoTokenizer.from_pretrained(OCR_MODEL.id, { progress_callback }),
      ]);
      ready = true;
      return { model: model as unknown as Model, processor: processor as unknown as Processor, tokenizer: tokenizer as unknown as Tokenizer };
    })();
    loading.catch(() => (loading = null));
  }
  return loading;
}

export interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Overlapping tiles that keep text legible at Florence-2's 768 px input:
 * at most ~1200 px per side, with 15% overlap so lines cut at one tile's
 * edge appear whole in its neighbor.
 */
export function ocrTiles(w: number, h: number, max = 1200): Tile[] {
  const split = (len: number) => {
    if (len <= max) return [[0, len]];
    const n = Math.ceil((len - max * 0.15) / (max * 0.85));
    const size = Math.min(len, Math.ceil(len / n + max * 0.15));
    const step = (len - size) / (n - 1 || 1);
    return Array.from({ length: n }, (_, i) => [Math.round(i * step), size]);
  };
  const out: Tile[] = [];
  for (const [y, th] of split(h)) for (const [x, tw] of split(w)) out.push({ x, y, w: tw, h: th });
  return out;
}

/** Drop lines that duplicate a longer line from an overlapping tile. */
export function mergeLines(lines: OcrLine[]): OcrLine[] {
  const sorted = [...lines].sort((a, b) => b.text.length - a.text.length || b.w * b.h - a.w * a.h);
  const kept: OcrLine[] = [];
  for (const l of sorted) {
    const dup = kept.some((k) => {
      const ix = Math.max(0, Math.min(k.x + k.w, l.x + l.w) - Math.max(k.x, l.x));
      const iy = Math.max(0, Math.min(k.y + k.h, l.y + l.h) - Math.max(k.y, l.y));
      return ix * iy > 0.5 * l.w * l.h;
    });
    if (!dup) kept.push(l);
  }
  // Reading order: top to bottom, then left to right within a row.
  return kept.sort((a, b) => (Math.abs(a.y - b.y) < Math.min(a.h, b.h) * 0.6 ? a.x - b.x : a.y - b.y));
}

export interface OcrOptions {
  /** Called after each tile with the fraction done. */
  onProgress?: (done: number) => void;
  signal?: { cancelled: boolean };
}

/** Recognize text in an image. */
export async function recognize(src: ImageSource, opts: OcrOptions = {}): Promise<OcrLine[]> {
  const { model, processor, tokenizer } = await loadOcr();
  const T = await loadTransformers();
  const task = '<OCR_WITH_REGION>';
  const textInputs = tokenizer(processor.construct_prompts(task));
  const tiles = ocrTiles(src.width, src.height);
  const lines: OcrLine[] = [];
  for (let i = 0; i < tiles.length; i++) {
    if (opts.signal?.cancelled) break;
    const t = tiles[i];
    const c = createCanvas(t.w, t.h);
    const ctx = ctx2d(c, { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, t.w, t.h);
    ctx.drawImage(src, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h);
    const img = new T.RawImage(ctx.getImageData(0, 0, t.w, t.h).data, t.w, t.h, 4).rgb();
    const vision = await processor(img);
    const ids = await model.generate({ ...textInputs, ...vision, max_new_tokens: 1024 });
    const text = tokenizer.batch_decode(ids, { skip_special_tokens: false })[0];
    const r = processor.post_process_generation(text, task, [t.w, t.h])[task];
    r.labels.forEach((label, k) => {
      const q = r.quad_boxes[k];
      const xs = [q[0], q[2], q[4], q[6]];
      const ys = [q[1], q[3], q[5], q[7]];
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const clean = label.replace(/<\/?s>|<pad>/g, '').trim();
      if (clean) lines.push({ text: clean, x: t.x + x, y: t.y + y, w: Math.max(...xs) - x, h: Math.max(...ys) - y });
    });
    c.width = c.height = 0;
    opts.onProgress?.((i + 1) / tiles.length);
  }
  return mergeLines(lines);
}

/** Plain text in reading order, one recognized line per line, rows joined. */
export function linesToText(lines: OcrLine[]): string {
  const rows: OcrLine[][] = [];
  for (const l of lines) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - l.y) < Math.min(row[0].h, l.h) * 0.6) row.push(l);
    else rows.push([l]);
  }
  return rows.map((r) => r.map((l) => l.text).join('   ')).join('\n');
}

// ---------------------------------------------------------------------------
// Sensitive data detection (for auto-redact)

/**
 * Patterns for auto-redact. When a pattern has a capture group, only the
 * group is covered (e.g. the value after "API key:").
 */
export const SENSITIVE: { id: string; label: string; plural: string; re: RegExp }[] = [
  // Labelled secrets first: recognition often splits tokens ("sk live 51Hx…"), but the label survives.
  { id: 'secret', label: 'Labelled secret', plural: 'Passwords, keys and tokens after a label', re: /\b(?:api[\s_-]?key|secret(?:[\s_-]?key)?|access[\s_-]?token|token|password|passcode|passwd|pin|otp)\s*[:=]\s*(\S.*)$/gi },
  { id: 'email', label: 'Email address', plural: 'Email addresses', re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  { id: 'card', label: 'Card number', plural: 'Card numbers', re: /\b(?:\d[ -]?){12,18}\d\b/g },
  { id: 'phone', label: 'Phone number', plural: 'Phone numbers', re: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]\d{3,4}[\s.-]?\d{2,4}\b/g },
  { id: 'iban', label: 'IBAN', plural: 'IBANs', re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g },
  { id: 'ip', label: 'IP address', plural: 'IP addresses', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  // Unlabelled keys: a known prefix, or a long mixed letter/digit run.
  { id: 'key', label: 'API key or token', plural: 'API keys and tokens', re: /\b(?:sk|pk|rk|nw|ghp|gho|xox[abp]|AKIA|AIza)[_-]?[A-Za-z0-9_-]{12,}\b|\b(?=[A-Za-z0-9_-]{24,}\b)(?=\S*\d)(?=\S*[A-Za-z])[A-Za-z0-9_-]{24,}\b/g },
];

export interface Finding {
  kind: string;
  label: string;
  text: string;
  /** Box around the match, estimated from its position in the line. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Find sensitive strings in recognized lines. */
export function findSensitive(lines: OcrLine[], kinds: Set<string> = new Set(SENSITIVE.map((s) => s.id))): Finding[] {
  const out: Finding[] = [];
  for (const l of lines) {
    const taken: [number, number][] = [];
    for (const s of SENSITIVE) {
      if (!kinds.has(s.id)) continue;
      s.re.lastIndex = 0;
      for (const m of l.text.matchAll(s.re)) {
        const value = m[1] ?? m[0];
        const a = (m.index ?? 0) + (m[1] !== undefined ? m[0].lastIndexOf(m[1]) : 0);
        const b = a + value.length;
        if (taken.some(([x, y]) => a < y && b > x)) continue;
        taken.push([a, b]);
        const pad = l.h * 0.15;
        const x0 = l.x + (l.w * a) / l.text.length;
        const x1 = l.x + (l.w * b) / l.text.length;
        out.push({ kind: s.id, label: s.label, text: value, x: x0 - pad, y: l.y - pad, w: x1 - x0 + pad * 2, h: l.h + pad * 2 });
      }
    }
  }
  return out;
}

import type { DeviceFrame, EditorDoc } from '../types';
import { FONT_FAMILY } from './text';

/**
 * Device mockups for the screenshot frame. Everything is drawn in code (no
 * product artwork): generic browser, window, phone and laptop shapes.
 *
 * Geometry is in image space with the screenshot at (0, 0, w, h); insets say
 * how far the device extends beyond the screenshot on each side.
 */

export interface DeviceInsets {
  t: number;
  r: number;
  b: number;
  l: number;
}

export const DEVICE_FRAMES: { id: DeviceFrame; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'browser', label: 'Browser' },
  { id: 'browser-dark', label: 'Dark browser' },
  { id: 'window', label: 'Window' },
  { id: 'phone', label: 'Phone' },
  { id: 'laptop', label: 'Laptop' },
];

type Doc = Pick<EditorDoc, 'width' | 'height' | 'unit' | 'background'>;

export function deviceOf(doc: Doc): DeviceFrame {
  return doc.background.enabled ? doc.background.device ?? 'none' : 'none';
}

const NONE: DeviceInsets = { t: 0, r: 0, b: 0, l: 0 };

export function deviceInsets(doc: Doc): DeviceInsets {
  const d = deviceOf(doc);
  const u = doc.unit;
  const w = doc.width;
  switch (d) {
    case 'browser':
    case 'browser-dark':
      return { t: Math.round(40 * u), r: 0, b: 0, l: 0 };
    case 'window':
      return { t: Math.round(28 * u), r: 0, b: 0, l: 0 };
    case 'phone': {
      const bezel = Math.round(Math.max(10 * u, w * 0.045));
      return { t: bezel, r: bezel, b: bezel, l: bezel };
    }
    case 'laptop': {
      const bezel = Math.round(Math.max(8 * u, w * 0.022));
      const top = Math.round(bezel * 1.5);
      const base = Math.round(Math.max(10 * u, w * 0.035));
      const overhang = Math.round(w * 0.085);
      return { t: top, r: bezel + overhang, b: bezel + base, l: bezel + overhang };
    }
    default:
      return NONE;
  }
}

/** Outer corner radius of the device body. */
function bodyRadius(doc: Doc): number {
  const u = doc.unit;
  switch (deviceOf(doc)) {
    case 'browser':
    case 'browser-dark':
    case 'window':
      return Math.min(doc.background.radius * u || 10 * u, 18 * u);
    case 'phone':
      return Math.round(doc.width * 0.14);
    case 'laptop':
      return Math.round(Math.max(8 * u, doc.width * 0.02));
    default:
      return 0;
  }
}

/** Corner radii [tl, tr, br, bl] of the screenshot itself inside the device. */
export function screenRadii(doc: Doc): [number, number, number, number] | null {
  const d = deviceOf(doc);
  if (d === 'none') return null;
  const R = bodyRadius(doc);
  if (d === 'phone') {
    const bezel = deviceInsets(doc).l;
    const r = Math.max(0, R - bezel);
    return [r, r, r, r];
  }
  if (d === 'laptop') return [0, 0, 0, 0];
  return [0, 0, R, R];
}

/** The outline that casts the drop shadow (the device body, or the laptop lid + base). */
export function deviceBody(doc: Doc): { x: number; y: number; w: number; h: number; r: number } | null {
  const d = deviceOf(doc);
  if (d === 'none') return null;
  const i = deviceInsets(doc);
  return { x: -i.l, y: -i.t, w: doc.width + i.l + i.r, h: doc.height + i.t + i.b, r: bodyRadius(doc) };
}

/** Paint the device around the screenshot area (call before drawing the screenshot). */
export function drawDevice(ctx: CanvasRenderingContext2D, doc: Doc) {
  const d = deviceOf(doc);
  if (d === 'none') return;
  const u = doc.unit;
  const w = doc.width;
  const h = doc.height;
  const i = deviceInsets(doc);
  const R = bodyRadius(doc);
  ctx.save();
  if (d === 'browser' || d === 'browser-dark' || d === 'window') {
    const dark = d === 'browser-dark';
    const bar = i.t;
    ctx.fillStyle = dark ? '#2b2b2f' : '#ececef';
    ctx.beginPath();
    ctx.roundRect(0, -bar, w, h + bar, [R, R, R, R]);
    ctx.fill();
    // Divider under the toolbar.
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)';
    ctx.fillRect(0, -Math.max(1, u * 0.5), w, Math.max(1, u * 0.5));
    // Window controls.
    const dot = 6 * u;
    const cy = -bar / 2;
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, k) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(14 * u + dot + k * 20 * u, cy, dot, 0, Math.PI * 2);
      ctx.fill();
    });
    if (d !== 'window') {
      // Address bar.
      const pw = Math.min(w * 0.5, 520 * u);
      const ph = 24 * u;
      const px = (w - pw) / 2;
      ctx.fillStyle = dark ? '#1c1c1f' : '#ffffff';
      ctx.beginPath();
      ctx.roundRect(px, cy - ph / 2, pw, ph, ph / 2);
      ctx.fill();
      if (!dark) {
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = Math.max(1, u * 0.5);
        ctx.stroke();
      }
      // A small lock glyph, no URL text.
      ctx.strokeStyle = dark ? '#8e8e93' : '#8e8e93';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 1.4 * u;
      const lx = px + 14 * u;
      ctx.beginPath();
      ctx.arc(lx, cy - 1.5 * u, 2.8 * u, Math.PI, 0);
      ctx.stroke();
      ctx.fillRect(lx - 4 * u, cy - 1.5 * u, 8 * u, 6 * u);
      if (doc.background.deviceLabel) {
        ctx.font = `500 ${11 * u}px ${FONT_FAMILY}`;
        ctx.fillStyle = dark ? '#c7c7cc' : '#48484a';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(doc.background.deviceLabel.slice(0, 80), lx + 10 * u, cy + 0.5 * u, pw - 34 * u);
      }
    }
  } else if (d === 'phone') {
    ctx.fillStyle = '#121214';
    ctx.beginPath();
    ctx.roundRect(-i.l, -i.t, w + i.l + i.r, h + i.t + i.b, R);
    ctx.fill();
    // Thin edge highlight.
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = Math.max(1, i.l * 0.08);
    ctx.stroke();
    // Side buttons.
    ctx.fillStyle = '#0b0b0c';
    const bw = Math.max(2, i.l * 0.18);
    ctx.fillRect(-i.l - bw, h * 0.18, bw, h * 0.07);
    ctx.fillRect(-i.l - bw, h * 0.28, bw, h * 0.07);
    ctx.fillRect(w + i.r, h * 0.22, bw, h * 0.1);
  } else if (d === 'laptop') {
    const base = Math.round(Math.max(10 * u, w * 0.035));
    const bezel = i.t / 1.5;
    // Lid.
    ctx.fillStyle = '#1b1b1d';
    ctx.beginPath();
    ctx.roundRect(-bezel, -i.t, w + bezel * 2, h + i.t + bezel, [R, R, 0, 0]);
    ctx.fill();
    // Camera dot.
    ctx.fillStyle = '#3a3a3c';
    ctx.beginPath();
    ctx.arc(w / 2, -i.t / 2, Math.max(1.5, i.t * 0.12), 0, Math.PI * 2);
    ctx.fill();
    // Base.
    const by = h + bezel;
    const grad = ctx.createLinearGradient(0, by, 0, by + base);
    grad.addColorStop(0, '#d9d9de');
    grad.addColorStop(1, '#a1a1a8');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(-i.l, by, w + i.l + i.r, base, [0, 0, base * 0.9, base * 0.9]);
    ctx.fill();
    // Opening notch.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.roundRect(w / 2 - w * 0.08, by, w * 0.16, base * 0.35, [0, 0, base * 0.3, base * 0.3]);
    ctx.fill();
  }
  ctx.restore();
}

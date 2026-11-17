import { createCanvas, ctx2d, canvasToBlob, type ImageSource } from '../../engine/images';

export interface IconStyle {
  /** Inner padding as a fraction of the icon size (0–0.4). */
  padding: number;
  /** Corner radius as a fraction of the icon size (0–0.5). */
  radius: number;
  /** Background color, or null for transparent. */
  background: string | null;
}

export const ICON_SIZES = [
  { size: 16, name: 'favicon-16x16.png' },
  { size: 32, name: 'favicon-32x32.png' },
  { size: 48, name: 'favicon-48x48.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'android-chrome-192x192.png' },
  { size: 512, name: 'android-chrome-512x512.png' },
];

/** Render the source image centered (contain) into a square icon. */
export function renderIcon(src: ImageSource, size: number, style: IconStyle): HTMLCanvasElement {
  const c = createCanvas(size, size);
  const ctx = ctx2d(c);
  ctx.imageSmoothingQuality = 'high';
  const r = style.radius * size;
  ctx.save();
  if (r > 0) {
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, r);
    ctx.clip();
  }
  if (style.background) {
    ctx.fillStyle = style.background;
    ctx.fillRect(0, 0, size, size);
  }
  const pad = style.padding * size;
  const box = size - pad * 2;
  const sw = src.width;
  const sh = src.height;
  const s = Math.min(box / sw, box / sh);
  // Step down large sources for cleaner small icons.
  let img: CanvasImageSource = src;
  let iw = sw;
  let ih = sh;
  while (iw * s < iw / 2 && iw > 64) {
    const half = createCanvas(Math.max(1, Math.round(iw / 2)), Math.max(1, Math.round(ih / 2)));
    const hc = ctx2d(half);
    hc.imageSmoothingQuality = 'high';
    hc.drawImage(img, 0, 0, half.width, half.height);
    img = half;
    iw = half.width;
    ih = half.height;
  }
  const dw = sw * s;
  const dh = sh * s;
  ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  ctx.restore();
  return c;
}

/** Build a .ico containing PNG-compressed images (supported by every modern browser and Windows Vista+). */
export async function buildIco(pngs: { size: number; bytes: Uint8Array }[]): Promise<Blob> {
  const header = new DataView(new ArrayBuffer(6 + 16 * pngs.length));
  header.setUint16(0, 0, true);
  header.setUint16(2, 1, true);
  header.setUint16(4, pngs.length, true);
  let offset = header.byteLength;
  pngs.forEach((p, i) => {
    const o = 6 + i * 16;
    header.setUint8(o, p.size >= 256 ? 0 : p.size);
    header.setUint8(o + 1, p.size >= 256 ? 0 : p.size);
    header.setUint8(o + 2, 0);
    header.setUint8(o + 3, 0);
    header.setUint16(o + 4, 1, true);
    header.setUint16(o + 6, 32, true);
    header.setUint32(o + 8, p.bytes.length, true);
    header.setUint32(o + 12, offset, true);
    offset += p.bytes.length;
  });
  return new Blob([header.buffer as ArrayBuffer, ...pngs.map((p) => p.bytes as Uint8Array<ArrayBuffer>)], { type: 'image/x-icon' });
}

export async function pngBytes(c: HTMLCanvasElement): Promise<Uint8Array> {
  return new Uint8Array(await (await canvasToBlob(c, 'image/png')).arrayBuffer());
}

export function manifestJson(name: string, color: string): string {
  return JSON.stringify(
    {
      name,
      short_name: name,
      icons: [
        { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
      ],
      theme_color: color,
      background_color: color,
      display: 'standalone',
    },
    null,
    2,
  );
}

export const HTML_SNIPPET = `<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">`;

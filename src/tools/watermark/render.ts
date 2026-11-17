import type { ImageSource } from '../../engine/images';

export type WatermarkPosition = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';

export interface WatermarkOptions {
  kind: 'text' | 'logo';
  text: string;
  color: string;
  logo: ImageSource | null;
  /** Mark size as a percentage of the image's shorter side (text height or logo width). */
  size: number;
  opacity: number;
  position: WatermarkPosition;
  tile: boolean;
  rotation: number;
  shadow: boolean;
}

/** Draw a text or logo watermark onto an image already painted in `ctx` (w×h). */
export function applyWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, o: WatermarkOptions) {
  const short = Math.min(w, h);
  const unit = (short * o.size) / 100;
  let mw: number;
  let mh: number;
  let draw: () => void;
  if (o.kind === 'text') {
    if (!o.text.trim()) return;
    const font = `600 ${unit}px "Inter Variable", system-ui, sans-serif`;
    ctx.font = font;
    mw = ctx.measureText(o.text).width;
    mh = unit;
    draw = () => {
      ctx.font = font;
      ctx.fillStyle = o.color;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(o.text, 0, 0);
    };
  } else {
    const logo = o.logo as (ImageSource & { width: number; height: number }) | null;
    if (!logo) return;
    mw = unit * 3;
    mh = (mw * logo.height) / logo.width;
    draw = () => ctx.drawImage(logo, -mw / 2, -mh / 2, mw, mh);
  }

  ctx.save();
  ctx.globalAlpha = o.opacity;
  if (o.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = unit * 0.25;
    ctx.shadowOffsetY = unit * 0.06;
  }
  const rad = (o.rotation * Math.PI) / 180;
  const stamp = (cx: number, cy: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rad);
    draw();
    ctx.restore();
  };

  if (o.tile) {
    const stepX = mw + unit * 3;
    const stepY = mh + unit * 3;
    for (let y = stepY / 2, row = 0; y < h + stepY; y += stepY, row++) {
      for (let x = (row % 2 ? stepX / 2 : 0) + stepX / 4; x < w + stepX; x += stepX) stamp(x, y);
    }
  } else {
    const m = unit * 0.9;
    const col = o.position[1];
    const row = o.position[0];
    const cx = col === 'l' ? m + mw / 2 : col === 'r' ? w - m - mw / 2 : w / 2;
    const cy = row === 't' ? m + mh / 2 : row === 'b' ? h - m - mh / 2 : h / 2;
    stamp(cx, cy);
  }
  ctx.restore();
}

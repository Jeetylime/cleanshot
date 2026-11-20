export interface SpriteInput {
  name: string;
  width: number;
  height: number;
}

export interface SpriteFrame {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpriteLayout {
  width: number;
  height: number;
  frames: SpriteFrame[];
}

/**
 * Lay sprites out on a grid of equal cells (the largest sprite's size), in
 * order, `cols` per row (0 = as square as possible). Sprites are centered in
 * their cells. `padding` separates cells to avoid bleeding when scaled.
 */
export function packGrid(items: SpriteInput[], cols: number, padding: number): SpriteLayout {
  if (!items.length) return { width: 0, height: 0, frames: [] };
  const cw = Math.max(...items.map((i) => i.width));
  const ch = Math.max(...items.map((i) => i.height));
  const c = cols > 0 ? Math.min(cols, items.length) : Math.ceil(Math.sqrt(items.length));
  const rows = Math.ceil(items.length / c);
  const frames = items.map((it, i) => {
    const col = i % c;
    const row = Math.floor(i / c);
    return {
      name: it.name,
      x: padding + col * (cw + padding) + Math.floor((cw - it.width) / 2),
      y: padding + row * (ch + padding) + Math.floor((ch - it.height) / 2),
      w: it.width,
      h: it.height,
    };
  });
  return { width: padding + c * (cw + padding), height: padding + rows * (ch + padding), frames };
}

/** Name usable as a CSS class: lowercase, letters, digits and dashes. */
export function cssName(name: string): string {
  const s = name.replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return /^[a-z]/.test(s) ? s : `s-${s || 'sprite'}`;
}

export function spriteCss(layout: SpriteLayout, imageName: string, prefix = 'sprite'): string {
  const lines = [`.${prefix} { background-image: url("${imageName}"); background-repeat: no-repeat; display: inline-block; }`];
  const used = new Set<string>();
  for (const f of layout.frames) {
    let n = cssName(f.name);
    for (let k = 2; used.has(n); k++) n = `${cssName(f.name)}-${k}`;
    used.add(n);
    lines.push(`.${prefix}-${n} { width: ${f.w}px; height: ${f.h}px; background-position: -${f.x}px -${f.y}px; }`);
  }
  return lines.join('\n') + '\n';
}

/** JSON in the widely used "hash" atlas shape (frames keyed by file name). */
export function spriteJson(layout: SpriteLayout, imageName: string): string {
  const frames: Record<string, unknown> = {};
  for (const f of layout.frames) frames[f.name] = { frame: { x: f.x, y: f.y, w: f.w, h: f.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h }, sourceSize: { w: f.w, h: f.h } };
  return JSON.stringify({ frames, meta: { app: 'Studiolo', image: imageName, size: { w: layout.width, h: layout.height }, scale: '1' } }, null, 2) + '\n';
}

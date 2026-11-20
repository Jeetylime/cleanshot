import { createCanvas, ctx2d } from '../engine/images';

/**
 * HEIC/HEIF (iPhone photos) decoding. Safari decodes these natively; other
 * browsers get libheif compiled to WebAssembly, loaded only when the first
 * HEIC file arrives (~2 MB, bundled with the app, nothing fetched elsewhere).
 */

export function isHeic(file: Blob & { name?: string }): boolean {
  return /^image\/hei[cf](-sequence)?$/i.test(file.type) || /\.(heic|heif)$/i.test(file.name ?? '');
}

interface HeifImage {
  get_width(): number;
  get_height(): number;
  display(target: { data: Uint8ClampedArray; width: number; height: number }, cb: (out: { data: Uint8ClampedArray } | null) => void): void;
  free?: () => void;
}
interface LibHeif {
  HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] };
}

let lib: Promise<LibHeif> | null = null;

function load(): Promise<LibHeif> {
  lib ??= import('libheif-js/libheif-wasm/libheif-bundle.mjs').then((m) => (m as unknown as { default: () => LibHeif | Promise<LibHeif> }).default());
  lib.catch(() => (lib = null));
  return lib;
}

/** Decode the primary image of a HEIC/HEIF file to a canvas. */
export async function decodeHeic(file: Blob): Promise<HTMLCanvasElement> {
  const libheif = await load();
  const images = new libheif.HeifDecoder().decode(new Uint8Array(await file.arrayBuffer()));
  if (!images.length) throw new Error('This HEIC file has no image in it.');
  const img = images[0];
  const w = img.get_width();
  const h = img.get_height();
  const c = createCanvas(w, h);
  const ctx = ctx2d(c);
  const target = ctx.createImageData(w, h);
  await new Promise<void>((resolve, reject) =>
    img.display({ data: target.data, width: w, height: h }, (out) => (out ? resolve() : reject(new Error('This HEIC file couldn’t be decoded.')))),
  );
  ctx.putImageData(target, 0, 0);
  images.forEach((i) => i.free?.());
  return c;
}

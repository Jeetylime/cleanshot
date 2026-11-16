/**
 * Read the pixel density from a PNG's pHYs chunk. macOS writes 144 DPI for
 * Retina screenshots, which lets us pick annotation sizes that look right.
 * Returns null when unavailable.
 */
export async function readPngDpi(blob: Blob): Promise<number | null> {
  if (blob.type && blob.type !== 'image/png') return null;
  try {
    const buf = new DataView(await blob.slice(0, 65536).arrayBuffer());
    if (buf.byteLength < 33 || buf.getUint32(0) !== 0x89504e47) return null;
    let off = 8;
    while (off + 12 <= buf.byteLength) {
      const len = buf.getUint32(off);
      const type = buf.getUint32(off + 4);
      if (type === 0x70485973 /* pHYs */ && off + 8 + 9 <= buf.byteLength) {
        const ppx = buf.getUint32(off + 8);
        const unit = buf.getUint8(off + 16);
        if (unit === 1 && ppx > 0) return ppx * 0.0254;
        return null;
      }
      if (type === 0x49444154 /* IDAT */) return null;
      off += 12 + len;
    }
  } catch {
    /* ignore */
  }
  return null;
}

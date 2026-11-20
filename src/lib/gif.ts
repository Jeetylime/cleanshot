import { buildPalette, remap } from '../tools/shared/quantize';

/**
 * Animated GIF encoder (GIF89a). Each frame gets its own palette of up to 256
 * colors from the shared median-cut quantizer, optionally dithered. Frames
 * are opaque: callers composite onto a background first.
 */

export interface GifFrame {
  /** RGBA pixels, width × height. */
  data: Uint8ClampedArray;
  /** Display time in milliseconds (GIF stores hundredths of a second). */
  delay: number;
}

export interface GifOptions {
  width: number;
  height: number;
  /** 0 = loop forever, n = play n + 1 times, null = play once. */
  loop?: number | null;
  dither?: boolean;
  /** Called after each frame with the fraction done (0–1). */
  onProgress?: (done: number) => void;
}

class ByteWriter {
  private buf = new Uint8Array(1 << 16);
  length = 0;
  private grow(n: number) {
    if (this.length + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
  }
  byte(b: number) {
    this.grow(1);
    this.buf[this.length++] = b & 0xff;
  }
  u16(v: number) {
    this.byte(v);
    this.byte(v >> 8);
  }
  bytes(a: ArrayLike<number>) {
    this.grow(a.length);
    this.buf.set(a as Uint8Array, this.length);
    this.length += a.length;
  }
  ascii(s: string) {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }
  result(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

/** LZW-compress color indices as GIF image data (min code size, then sub-blocks). */
export function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const out = new ByteWriter();
  out.byte(minCodeSize);
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  // Dictionary keyed by (prefix code << 8 | byte).
  const dict = new Map<number, number>();

  let block = new Uint8Array(255);
  let blockLen = 0;
  let acc = 0;
  let bits = 0;
  const flushByte = (b: number) => {
    block[blockLen++] = b;
    if (blockLen === 255) {
      out.byte(255);
      out.bytes(block);
      block = new Uint8Array(255);
      blockLen = 0;
    }
  };
  const emit = (code: number) => {
    acc |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      flushByte(acc & 0xff);
      acc >>>= 8;
      bits -= 8;
    }
  };

  emit(clear);
  if (indices.length) {
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = (prefix << 8) | k;
      const hit = dict.get(key);
      if (hit !== undefined) {
        prefix = hit;
        continue;
      }
      emit(prefix);
      if (next < 4096) {
        dict.set(key, next++);
        if (next > 1 << codeSize && codeSize < 12) codeSize++;
      } else {
        emit(clear);
        dict.clear();
        codeSize = minCodeSize + 1;
        next = eoi + 1;
      }
      prefix = k;
    }
    emit(prefix);
  }
  emit(eoi);
  if (bits > 0) flushByte(acc & 0xff);
  if (blockLen) {
    out.byte(blockLen);
    out.bytes(block.subarray(0, blockLen));
  }
  out.byte(0);
  return out.result();
}

/** Encode frames as an animated GIF. Yields to the event loop between frames. */
export async function encodeGif(frames: GifFrame[], opts: GifOptions): Promise<Blob> {
  const { width: w, height: h } = opts;
  const out = new ByteWriter();
  out.ascii('GIF89a');
  out.u16(w);
  out.u16(h);
  out.byte(0x00); // no global color table
  out.byte(0);
  out.byte(0);
  const loop = opts.loop === undefined ? 0 : opts.loop;
  if (loop !== null && frames.length > 1) {
    out.byte(0x21);
    out.byte(0xff);
    out.byte(11);
    out.ascii('NETSCAPE2.0');
    out.byte(3);
    out.byte(1);
    out.u16(loop);
    out.byte(0);
  }
  for (let f = 0; f < frames.length; f++) {
    const frame = frames[f];
    const { palette, count } = buildPalette(frame.data, 256);
    const indices = remap(frame.data, w, h, palette, count, !!opts.dither);
    let bitsNeeded = 1;
    while (1 << bitsNeeded < count) bitsNeeded++;
    const tableSize = 1 << bitsNeeded;
    // Graphic control extension: delay, no transparency, dispose = none.
    out.byte(0x21);
    out.byte(0xf9);
    out.byte(4);
    out.byte(0x04);
    out.u16(Math.max(2, Math.round(frame.delay / 10)));
    out.byte(0);
    out.byte(0);
    // Image descriptor with a local color table.
    out.byte(0x2c);
    out.u16(0);
    out.u16(0);
    out.u16(w);
    out.u16(h);
    out.byte(0x80 | (bitsNeeded - 1));
    for (let i = 0; i < tableSize; i++) {
      if (i < count) {
        out.byte(palette[i * 4]);
        out.byte(palette[i * 4 + 1]);
        out.byte(palette[i * 4 + 2]);
      } else {
        out.byte(0);
        out.byte(0);
        out.byte(0);
      }
    }
    out.bytes(lzwEncode(indices, Math.max(2, bitsNeeded)));
    opts.onProgress?.((f + 1) / frames.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  out.byte(0x3b);
  return new Blob([out.result() as Uint8Array<ArrayBuffer>], { type: 'image/gif' });
}

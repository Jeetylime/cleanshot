/**
 * Lightweight image metadata reader and stripper (no dependencies).
 *
 * Reads: JPEG (SOF, JFIF, EXIF, XMP, ICC, IPTC), PNG (IHDR, pHYs, text,
 * eXIf, iCCP/sRGB/gAMA), WebP (VP8X flags, EXIF, XMP, ICC).
 * Strips: EXIF / XMP / IPTC / comments / text chunks, keeping color
 * profiles so colors don't shift.
 */

export interface MetaEntry {
  group: string;
  label: string;
  value: string;
  /** Marks privacy-sensitive fields (location, serials, names). */
  sensitive?: boolean;
}

export interface ImageMeta {
  format: string;
  bitDepth: number | null;
  channels: string | null;
  colorProfile: string | null;
  dpi: number | null;
  orientation: number | null;
  hasExif: boolean;
  hasXmp: boolean;
  hasIptc: boolean;
  textChunks: number;
  entries: MetaEntry[];
  gps: { lat: number; lon: number } | null;
}

// ---------------------------------------------------------------------------
// TIFF / EXIF

const TAGS: Record<number, [string, string, boolean?]> = {
  0x010f: ['Camera', 'Make'],
  0x0110: ['Camera', 'Model'],
  0x0112: ['Image', 'Orientation'],
  0x011a: ['Image', 'X resolution'],
  0x011b: ['Image', 'Y resolution'],
  0x0131: ['Software', 'Software'],
  0x0132: ['Capture', 'Modified'],
  0x013b: ['Author', 'Artist', true],
  0x8298: ['Author', 'Copyright'],
  0x829a: ['Capture', 'Exposure time'],
  0x829d: ['Capture', 'F-number'],
  0x8822: ['Capture', 'Exposure program'],
  0x8827: ['Capture', 'ISO'],
  0x9003: ['Capture', 'Taken'],
  0x9004: ['Capture', 'Digitized'],
  0x9010: ['Capture', 'Time zone'],
  0x9201: ['Capture', 'Shutter speed (APEX)'],
  0x9202: ['Capture', 'Aperture (APEX)'],
  0x9204: ['Capture', 'Exposure bias'],
  0x9207: ['Capture', 'Metering mode'],
  0x9209: ['Capture', 'Flash'],
  0x920a: ['Capture', 'Focal length'],
  0xa001: ['Image', 'Color space'],
  0xa002: ['Image', 'Pixel width'],
  0xa003: ['Image', 'Pixel height'],
  0xa402: ['Capture', 'Exposure mode'],
  0xa403: ['Capture', 'White balance'],
  0xa405: ['Capture', 'Focal length (35mm)'],
  0xa406: ['Capture', 'Scene type'],
  0xa430: ['Author', 'Camera owner', true],
  0xa431: ['Camera', 'Body serial number', true],
  0xa432: ['Camera', 'Lens specification'],
  0xa433: ['Camera', 'Lens make'],
  0xa434: ['Camera', 'Lens model'],
  0xa435: ['Camera', 'Lens serial number', true],
  0x9c9b: ['Author', 'Title'],
  0x9c9c: ['Author', 'Comment'],
  0x9c9d: ['Author', 'Author', true],
  0x010e: ['Image', 'Description'],
};

const ORIENTATION = ['', 'Normal', 'Mirrored', 'Rotated 180°', 'Flipped vertically', 'Mirrored, rotated 90° CCW', 'Rotated 90° CW', 'Mirrored, rotated 90° CW', 'Rotated 90° CCW'];
const FLASH = (v: number) => (v & 1 ? 'Fired' : 'Did not fire');
const COLOR_SPACE: Record<number, string> = { 1: 'sRGB', 2: 'Adobe RGB', 65535: 'Uncalibrated' };
const METERING: Record<number, string> = { 1: 'Average', 2: 'Center-weighted', 3: 'Spot', 4: 'Multi-spot', 5: 'Pattern', 6: 'Partial' };
const PROGRAM: Record<number, string> = { 1: 'Manual', 2: 'Program', 3: 'Aperture priority', 4: 'Shutter priority' };

interface TiffResult {
  entries: MetaEntry[];
  orientation: number | null;
  gps: { lat: number; lon: number } | null;
}

function parseTiff(view: DataView, base: number, length: number): TiffResult {
  const entries: MetaEntry[] = [];
  let orientation: number | null = null;
  let gps: { lat: number; lon: number } | null = null;
  if (length < 8) return { entries, orientation, gps };
  const le = view.getUint16(base) === 0x4949;
  const u16 = (o: number) => view.getUint16(base + o, le);
  const u32 = (o: number) => view.getUint32(base + o, le);
  const i32 = (o: number) => view.getInt32(base + o, le);
  const inRange = (o: number, n = 1) => o >= 0 && o + n <= length;
  const SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

  const readValue = (entry: number): (number | string)[] | string | null => {
    const type = u16(entry + 2);
    const count = u32(entry + 4);
    const size = (SIZES[type] ?? 0) * count;
    if (!size || count > 10000) return null;
    const off = size <= 4 ? entry + 8 : u32(entry + 8);
    if (!inRange(off, size)) return null;
    if (type === 2) {
      let s = '';
      for (let i = 0; i < count; i++) {
        const c = view.getUint8(base + off + i);
        if (!c) break;
        s += String.fromCharCode(c);
      }
      return s.trim();
    }
    if (type === 7 || type === 1) {
      // UNDEFINED / BYTE: decode UTF-16LE Windows XP tags, else bytes.
      const bytes: number[] = [];
      for (let i = 0; i < Math.min(count, 256); i++) bytes.push(view.getUint8(base + off + i));
      return bytes;
    }
    const out: number[] = [];
    for (let i = 0; i < Math.min(count, 16); i++) {
      const o = off + i * SIZES[type];
      if (type === 3) out.push(u16(o));
      else if (type === 4) out.push(u32(o));
      else if (type === 9) out.push(i32(o));
      else if (type === 5) out.push(u32(o) / (u32(o + 4) || 1));
      else if (type === 10) out.push(i32(o) / (i32(o + 4) || 1));
      else if (type === 6) out.push(view.getInt8(base + o));
      else if (type === 8) out.push(view.getInt16(base + o, le));
      else if (type === 11) out.push(view.getFloat32(base + o, le));
      else if (type === 12) out.push(view.getFloat64(base + o, le));
    }
    return out;
  };

  const fmt = (tag: number, v: (number | string)[] | string): string => {
    if (typeof v === 'string') return v;
    const n = v[0] as number;
    switch (tag) {
      case 0x0112:
        return ORIENTATION[n] ?? String(n);
      case 0x829a:
        return n < 1 ? `1/${Math.round(1 / n)} s` : `${n} s`;
      case 0x829d:
        return `ƒ/${n.toFixed(1)}`;
      case 0x920a:
      case 0xa405:
        return `${Math.round(n * 10) / 10} mm`;
      case 0x9209:
        return FLASH(n);
      case 0xa001:
        return COLOR_SPACE[n] ?? String(n);
      case 0x9207:
        return METERING[n] ?? String(n);
      case 0x8822:
        return PROGRAM[n] ?? String(n);
      case 0x9204:
        return `${n > 0 ? '+' : ''}${n.toFixed(1)} EV`;
      case 0xa403:
        return n === 0 ? 'Auto' : 'Manual';
      case 0x9c9b:
      case 0x9c9c:
      case 0x9c9d: {
        const bytes = v as number[];
        let s = '';
        for (let i = 0; i + 1 < bytes.length; i += 2) {
          const c = bytes[i] | (bytes[i + 1] << 8);
          if (!c) break;
          s += String.fromCharCode(c);
        }
        return s;
      }
      case 0xa432:
        return (v as number[]).map((x) => Math.round(x * 10) / 10).join(', ');
      default:
        return (v as number[]).map((x) => (Number.isInteger(x) ? String(x) : x.toFixed(2))).join(', ');
    }
  };

  const readIfd = (off: number, depth: number) => {
    if (depth > 3 || !inRange(off, 2)) return;
    const n = u16(off);
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      if (!inRange(e, 12)) return;
      const tag = u16(e);
      if (tag === 0x8769) readIfd(u32(e + 8), depth + 1);
      else if (tag === 0x8825) readGps(u32(e + 8));
      else if (TAGS[tag]) {
        const v = readValue(e);
        if (v === null || (Array.isArray(v) && !v.length)) continue;
        if (tag === 0x0112) orientation = (v as number[])[0];
        const text = fmt(tag, v);
        if (!text) continue;
        const [group, label, sensitive] = TAGS[tag];
        entries.push({ group, label, value: text, sensitive });
      }
    }
  };

  const readGps = (off: number) => {
    if (!inRange(off, 2)) return;
    const n = u16(off);
    const g: Record<number, (number | string)[] | string | null> = {};
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      if (!inRange(e, 12)) return;
      g[u16(e)] = readValue(e);
    }
    const dms = (x: unknown) => (Array.isArray(x) ? (x[0] as number) + (x[1] as number) / 60 + (x[2] as number) / 3600 : NaN);
    const lat = dms(g[2]) * (g[1] === 'S' ? -1 : 1);
    const lon = dms(g[4]) * (g[3] === 'W' ? -1 : 1);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      gps = { lat, lon };
      entries.push({ group: 'Location', label: 'Coordinates', value: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, sensitive: true });
    }
    if (Array.isArray(g[6])) entries.push({ group: 'Location', label: 'Altitude', value: `${Math.round(g[6][0] as number)} m`, sensitive: true });
  };

  readIfd(u32(4), 0);
  return { entries, orientation, gps };
}

// ---------------------------------------------------------------------------
// Container parsers

export async function readMetadata(file: Blob, type: string): Promise<ImageMeta> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer);
  const meta: ImageMeta = {
    format: type.replace('image/', '').toUpperCase() || 'Unknown',
    bitDepth: null,
    channels: null,
    colorProfile: null,
    dpi: null,
    orientation: null,
    hasExif: false,
    hasXmp: false,
    hasIptc: false,
    textChunks: 0,
    entries: [],
    gps: null,
  };
  const ascii = (o: number, n: number) => String.fromCharCode(...buf.subarray(o, o + n));
  const addTiff = (o: number, n: number) => {
    meta.hasExif = true;
    const r = parseTiff(view, o, n);
    meta.entries.push(...r.entries);
    meta.orientation = r.orientation ?? meta.orientation;
    meta.gps = r.gps ?? meta.gps;
  };

  try {
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      meta.format = 'JPEG';
      let o = 2;
      while (o + 4 <= buf.length && buf[o] === 0xff) {
        const marker = buf[o + 1];
        if (marker === 0xd9 || marker === 0xda) break;
        const len = view.getUint16(o + 2);
        const seg = o + 4;
        if (marker === 0xe1 && ascii(seg, 4) === 'Exif') addTiff(seg + 6, len - 8);
        else if (marker === 0xe1 && ascii(seg, 28).startsWith('http://ns.adobe.com/xap')) meta.hasXmp = true;
        else if (marker === 0xe2 && ascii(seg, 11) === 'ICC_PROFILE') meta.colorProfile = iccName(buf, seg + 14) ?? 'Embedded ICC profile';
        else if (marker === 0xed) meta.hasIptc = true;
        else if (marker === 0xe0 && ascii(seg, 4) === 'JFIF') {
          const unit = buf[seg + 7];
          const xd = view.getUint16(seg + 8);
          if (unit === 1 && xd) meta.dpi = xd;
          else if (unit === 2 && xd) meta.dpi = Math.round(xd * 2.54);
        } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          meta.bitDepth = buf[seg];
          const comps = buf[seg + 5];
          meta.channels = comps === 1 ? 'Grayscale' : comps === 3 ? 'YCbCr (RGB)' : comps === 4 ? 'CMYK' : `${comps} components`;
          meta.entries.push({ group: 'Encoding', label: 'Compression', value: marker === 0xc2 ? 'Progressive' : 'Baseline' });
        } else if (marker === 0xfe) {
          meta.textChunks++;
          meta.entries.push({ group: 'Text', label: 'Comment', value: ascii(seg, Math.min(len - 2, 200)) });
        }
        o += 2 + len;
      }
    } else if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') {
      meta.format = 'PNG';
      let o = 8;
      const types = ['Grayscale', '', 'RGB', 'Indexed', 'Grayscale + alpha', '', 'RGBA'];
      while (o + 12 <= buf.length) {
        const len = view.getUint32(o);
        const t = ascii(o + 4, 4);
        const d = o + 8;
        if (t === 'IHDR') {
          meta.bitDepth = buf[d + 8];
          meta.channels = types[buf[d + 9]] || null;
          meta.entries.push({ group: 'Encoding', label: 'Interlaced', value: buf[d + 12] ? 'Yes (Adam7)' : 'No' });
        } else if (t === 'pHYs' && buf[d + 8] === 1) meta.dpi = Math.round(view.getUint32(d) * 0.0254);
        else if (t === 'iCCP') meta.colorProfile = ascii(d, Math.min(79, len)).split('\0')[0] || 'Embedded ICC profile';
        else if (t === 'sRGB') meta.colorProfile = meta.colorProfile ?? 'sRGB';
        else if (t === 'eXIf') addTiff(d, len);
        else if (t === 'tEXt' || t === 'iTXt' || t === 'zTXt') {
          meta.textChunks++;
          const raw = ascii(d, Math.min(len, 400));
          const [key, ...rest] = raw.split('\0');
          if (key === 'XML:com.adobe.xmp') meta.hasXmp = true;
          else meta.entries.push({ group: 'Text', label: key, value: t === 'zTXt' ? '(compressed)' : rest.filter(Boolean).pop()?.slice(0, 200) ?? '' });
        } else if (t === 'acTL') meta.entries.push({ group: 'Encoding', label: 'Animated', value: 'Yes (APNG)' });
        else if (t === 'IEND') break;
        o += 12 + len;
      }
    } else if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
      meta.format = 'WebP';
      let o = 12;
      while (o + 8 <= buf.length) {
        const t = ascii(o, 4);
        const len = view.getUint32(o + 4, true);
        const d = o + 8;
        if (t === 'VP8 ') meta.entries.push({ group: 'Encoding', label: 'Compression', value: 'Lossy' });
        else if (t === 'VP8L') meta.entries.push({ group: 'Encoding', label: 'Compression', value: 'Lossless' });
        else if (t === 'VP8X') {
          const f = buf[d];
          if (f & 0x02) meta.entries.push({ group: 'Encoding', label: 'Animated', value: 'Yes' });
        } else if (t === 'EXIF') addTiff(ascii(d, 6) === 'Exif\0\0' ? d + 6 : d, len);
        else if (t === 'XMP ') meta.hasXmp = true;
        else if (t === 'ICCP') meta.colorProfile = iccName(buf, d) ?? 'Embedded ICC profile';
        o += 8 + len + (len & 1);
      }
      meta.bitDepth = 8;
    }
  } catch {
    // Damaged metadata: report what we got.
  }
  return meta;
}

/** Profile description from an ICC header's 'desc' tag, when easy to find. */
function iccName(buf: Uint8Array, start: number): string | null {
  try {
    const view = new DataView(buf.buffer, buf.byteOffset + start);
    const count = view.getUint32(128);
    for (let i = 0; i < Math.min(count, 64); i++) {
      const sig = String.fromCharCode(...buf.subarray(start + 132 + i * 12, start + 136 + i * 12));
      if (sig !== 'desc') continue;
      const off = view.getUint32(136 + i * 12);
      const type = String.fromCharCode(...buf.subarray(start + off, start + off + 4));
      if (type === 'desc') {
        const n = view.getUint32(off + 8);
        return String.fromCharCode(...buf.subarray(start + off + 12, start + off + 12 + n - 1)).trim() || null;
      }
      if (type === 'mluc') {
        const len = view.getUint32(off + 20);
        const o = view.getUint32(off + 24);
        let s = '';
        for (let k = 0; k < len; k += 2) s += String.fromCharCode(view.getUint16(off + o + k));
        return s.trim() || null;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

// ---------------------------------------------------------------------------
// Stripping

/**
 * Remove EXIF, XMP, IPTC, comments and text metadata without re-encoding
 * pixels. Color profiles are kept. Returns null for formats it can't
 * handle losslessly.
 */
export async function stripMetadata(file: Blob): Promise<Blob | null> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer);
  const ascii = (o: number, n: number) => String.fromCharCode(...buf.subarray(o, o + n));
  const parts: Uint8Array[] = [];

  if (buf[0] === 0xff && buf[1] === 0xd8) {
    parts.push(buf.subarray(0, 2));
    let o = 2;
    while (o + 4 <= buf.length && buf[o] === 0xff) {
      const marker = buf[o + 1];
      if (marker === 0xda) {
        parts.push(buf.subarray(o));
        break;
      }
      const len = view.getUint16(o + 2);
      // Drop APP1 (EXIF/XMP), APP3–APP15 (vendor data incl. IPTC in APP13) and comments.
      const drop = marker === 0xe1 || (marker >= 0xe3 && marker <= 0xef) || marker === 0xfe;
      if (!drop) parts.push(buf.subarray(o, o + 2 + len));
      o += 2 + len;
    }
    return new Blob(parts as Uint8Array<ArrayBuffer>[], { type: 'image/jpeg' });
  }

  if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') {
    parts.push(buf.subarray(0, 8));
    let o = 8;
    const drop = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME']);
    while (o + 12 <= buf.length) {
      const len = view.getUint32(o);
      const t = ascii(o + 4, 4);
      if (!drop.has(t)) parts.push(buf.subarray(o, o + 12 + len));
      o += 12 + len;
      if (t === 'IEND') break;
    }
    return new Blob(parts as Uint8Array<ArrayBuffer>[], { type: 'image/png' });
  }

  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    let o = 12;
    const keep: Uint8Array[] = [];
    while (o + 8 <= buf.length) {
      const t = ascii(o, 4);
      const len = view.getUint32(o + 4, true);
      const total = 8 + len + (len & 1);
      if (t !== 'EXIF' && t !== 'XMP ') {
        const chunk = buf.slice(o, o + total);
        if (t === 'VP8X') chunk[8] &= ~(0x08 | 0x04); // clear EXIF + XMP flags
        keep.push(chunk);
      }
      o += total;
    }
    const size = keep.reduce((s, c) => s + c.length, 0) + 4;
    const header = new Uint8Array(12);
    header.set([0x52, 0x49, 0x46, 0x46], 0);
    new DataView(header.buffer).setUint32(4, size, true);
    header.set([0x57, 0x45, 0x42, 0x50], 8);
    return new Blob([header, ...keep] as Uint8Array<ArrayBuffer>[], { type: 'image/webp' });
  }
  return null;
}

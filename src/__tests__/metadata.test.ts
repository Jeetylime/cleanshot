import { describe, expect, it } from 'vitest';
import { stripMetadata } from '../tools/shared/metadata';

function segment(marker: number, payload: string): number[] {
  const bytes = [...new TextEncoder().encode(payload)];
  const len = bytes.length + 2;
  return [0xff, marker, len >> 8, len & 0xff, ...bytes];
}

function pngChunk(type: string, data: string): number[] {
  const d = [...new TextEncoder().encode(data)];
  const n = d.length;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...new TextEncoder().encode(type), ...d, 0, 0, 0, 0];
}

const text = async (b: Blob) => new TextDecoder('latin1').decode(await b.arrayBuffer());

describe('stripMetadata', () => {
  it('removes EXIF/XMP, IPTC and comments from JPEG but keeps image data', async () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      ...segment(0xe0, 'JFIF\0keep'),
      ...segment(0xe1, 'Exif\0\0GPS-SECRET'),
      ...segment(0xed, 'Photoshop IPTC-SECRET'),
      ...segment(0xfe, 'COMMENT-SECRET'),
      ...segment(0xdb, 'QUANT'),
      0xff, 0xda, 0, 4, 1, 2, 0x11, 0x22, 0xff, 0xd9,
    ]);
    const out = await stripMetadata(new Blob([jpeg]));
    const s = await text(out!);
    expect(s).not.toContain('SECRET');
    expect(s).toContain('JFIF');
    expect(s).toContain('QUANT');
    expect(out!.size).toBeLessThan(jpeg.length);
  });

  it('removes text and EXIF chunks from PNG', async () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...pngChunk('IHDR', 'HEADERDATA123'),
      ...pngChunk('tEXt', 'Author\0SECRET'),
      ...pngChunk('eXIf', 'SECRET-GPS'),
      ...pngChunk('IDAT', 'PIXELS'),
      ...pngChunk('IEND', ''),
    ]);
    const s = await text((await stripMetadata(new Blob([png])))!);
    expect(s).not.toContain('SECRET');
    expect(s).toContain('PIXELS');
    expect(s).toContain('IEND');
  });

  it('returns null for unknown formats', async () => {
    expect(await stripMetadata(new Blob(['GIF89a']))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { crc32, createZip } from '../tools/shared/zip';

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789')) >>> 0).toBe(0xcbf43926);
  });
  it('is 0 for empty input', () => {
    expect(crc32(new Uint8Array()) >>> 0).toBe(0);
  });
});

describe('createZip', () => {
  it('writes STORE entries with a valid end-of-central-directory record', async () => {
    const zip = new Uint8Array(await (await createZip([{ name: 'a.txt', blob: new Blob(['hello']) }, { name: 'a.txt', blob: new Blob(['world!']) }])).arrayBuffer());
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const eocd = zip.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(2);
    const text = new TextDecoder().decode(zip);
    expect(text).toContain('hello');
    expect(text).toContain('world!');
    // Duplicate names are made unique.
    expect(text).toContain('a (2).txt');
  });
});

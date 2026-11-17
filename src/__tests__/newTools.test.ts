import { describe, expect, it } from 'vitest';
import { buildIco } from '../tools/favicon/ico';
import { sizeOf } from '../persistence/inventory';
import { scoreCommand } from '../components/CommandPalette';
import { fillTemplate } from '../pdf/tools/Stamp';
import { itemsToText } from '../pdf/tools/ExtractText';

describe('buildIco', () => {
  it('writes a directory entry per image with correct offsets', async () => {
    const a = new Uint8Array(10).fill(1);
    const b = new Uint8Array(20).fill(2);
    const ico = new Uint8Array(await (await buildIco([{ size: 16, bytes: a }, { size: 256, bytes: b }])).arrayBuffer());
    const v = new DataView(ico.buffer);
    expect(v.getUint16(2, true)).toBe(1);
    expect(v.getUint16(4, true)).toBe(2);
    expect(ico[6]).toBe(16);
    expect(ico[6 + 16]).toBe(0); // 256 is stored as 0
    const off1 = v.getUint32(6 + 12, true);
    const off2 = v.getUint32(6 + 16 + 12, true);
    expect(off1).toBe(6 + 32);
    expect(off2).toBe(off1 + 10);
    expect(ico.length).toBe(off2 + 20);
    expect(ico[off2]).toBe(2);
  });
});

describe('sizeOf', () => {
  it('counts blobs by size and handles cycles', () => {
    const o: Record<string, unknown> = { blob: new Blob(['12345']), n: 1 };
    o.self = o;
    expect(sizeOf(o)).toBeGreaterThanOrEqual(5 + 8);
    expect(sizeOf(null)).toBe(0);
  });
});

describe('scoreCommand', () => {
  it('prefers prefix and word matches over fuzzy ones', () => {
    const prefix = scoreCommand('comp', 'Compress PDF')!;
    const word = scoreCommand('pdf', 'Compress PDF')!;
    const fuzzy = scoreCommand('cmpdf', 'Compress PDF')!;
    expect(prefix).toBeLessThan(fuzzy);
    expect(word).toBeLessThan(fuzzy);
    expect(scoreCommand('zzz', 'Compress PDF')).toBeNull();
    expect(scoreCommand('', 'Anything')).toBe(0);
  });
});

describe('fillTemplate', () => {
  it('substitutes placeholders', () => {
    const d = new Date(2026, 0, 2);
    expect(fillTemplate('{file}: {n}/{total} {date}', 3, 9, 'report', d)).toBe(`report: 3/9 ${d.toLocaleDateString()}`);
  });
});

describe('itemsToText', () => {
  it('breaks lines when the baseline moves', () => {
    const t = itemsToText([
      { str: 'Hello', transform: [1, 0, 0, 1, 0, 700] },
      { str: ' world', transform: [1, 0, 0, 1, 30, 700] },
      { str: 'Next line', transform: [1, 0, 0, 1, 0, 680] },
    ]);
    expect(t).toBe('Hello world\nNext line');
  });
});

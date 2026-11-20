import { describe, expect, it } from 'vitest';
import { fieldsIn, fillText, parseCsv } from '../studio/bulk';
import { syncLinks } from '../studio/links';
import type { StudioDoc, StudioElement } from '../studio/types';

describe('CSV', () => {
  it('parses quotes, escaped quotes, newlines and detects the delimiter', () => {
    const r = parseCsv('name;title\r\n"Lee, Ann";"Says ""hi""\nthere"\nBo;CEO\n');
    expect(r.headers).toEqual(['name', 'title']);
    expect(r.rows).toEqual([{ name: 'Lee, Ann', title: 'Says "hi"\nthere' }, { name: 'Bo', title: 'CEO' }]);
  });
  it('handles tabs and a BOM', () => {
    expect(parseCsv('﻿a\tb\n1\t2').rows).toEqual([{ a: '1', b: '2' }]);
  });
});

describe('placeholders', () => {
  it('finds fields and keeps runs aligned', () => {
    expect(fieldsIn([{ type: 'text', text: 'Hi {{ name }}, {{role}}' } as StudioElement, { type: 'qr', data: 'x/{{id}}' } as StudioElement])).toEqual(['name', 'role', 'id']);
    const r = fillText('Dear {{name}}! Bold', [{ start: 15, end: 19, bold: true }], { name: 'Alexandra' });
    expect(r.text).toBe('Dear Alexandra! Bold');
    expect(r.text.slice(r.runs![0].start, r.runs![0].end)).toBe('Bold');
  });
});

describe('linked copies', () => {
  const el = (id: string, x: number, color: string, linkId = 'L'): StudioElement => ({ id, name: id, x, y: 0, w: 10, h: 10, rotation: 0, opacity: 1, locked: false, hidden: false, groupId: null, linkId, shadow: { enabled: false, color: '#000', blur: 0, x: 0, y: 0, opacity: 0 }, type: 'shape', shape: 'rect', fill: color, stroke: null, strokeWidth: 0, radius: 0 });
  const doc = (els: StudioElement[], other: StudioElement[] = []): StudioDoc => ({ id: 'd', name: 'd', width: 100, height: 100, background: { kind: 'transparent' }, elements: els, pages: [{ id: 'p0', background: { kind: 'transparent' }, elements: els }, { id: 'p1', background: { kind: 'transparent' }, elements: other }], pageIndex: 0, createdAt: 0, updatedAt: 0 });
  it('copies content changes to every linked copy but not position', () => {
    const a = el('a', 0, '#f00');
    const b = el('b', 50, '#f00');
    const c = el('c', 70, '#f00');
    const prev = doc([a, b], [c]);
    const next = doc([{ ...a, fill: '#00f', x: 5 } as StudioElement, b], [c]);
    const out = syncLinks(prev, next, (e) => e);
    expect(out.elements.map((e) => [e.x, (e as { fill: string }).fill])).toEqual([[5, '#00f'], [50, '#00f']]);
    expect((out.pages[1].elements[0] as { fill: string }).fill).toBe('#00f');
  });
  it('ignores moves', () => {
    const a = el('a', 0, '#f00');
    const b = el('b', 50, '#f00');
    const prev = doc([a, b]);
    const next = doc([{ ...a, x: 20 } as StudioElement, b]);
    expect(syncLinks(prev, next, (e) => e)).toBe(next);
  });
});

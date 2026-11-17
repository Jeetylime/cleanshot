import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../studio/templates';
import { matchesQuery } from '../studio/search';

const search = (q: string) => TEMPLATES.filter((t) => matchesQuery(q, t.name, t.category, t.keywords.join(' '))).map((t) => t.id);

describe('templates', () => {
  it('has unique ids and names', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    expect(new Set(TEMPLATES.map((t) => t.name)).size).toBe(TEMPLATES.length);
  });

  it('gives every template search keywords and a sensible size', () => {
    for (const t of TEMPLATES) {
      expect(t.keywords.length, t.id).toBeGreaterThanOrEqual(5);
      expect(t.width, t.id).toBeGreaterThan(200);
      expect(t.height, t.id).toBeGreaterThan(200);
    }
  });

  it('finds templates by name, category and keywords', () => {
    expect(search('wedding')).toContain('save-the-date');
    expect(search('youtube')).toEqual(expect.arrayContaining(['youtube', 'travel-thumbnail', 'how-to-thumbnail']));
    expect(search('Food')).toEqual(expect.arrayContaining(['recipe', 'pizza-special']));
    expect(search('christmas')).toEqual(['holiday']);
    expect(search('qwertyuiop')).toEqual([]);
  });
});

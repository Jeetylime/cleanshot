import { describe, expect, it } from 'vitest';
import es from '../i18n/es';
import fr from '../i18n/fr';
import de from '../i18n/de';
import pt from '../i18n/pt';
import { detect } from '../i18n';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Every tool name and description in both registries must be translated. */
function registryStrings(): string[] {
  const out: string[] = [];
  const img = readFileSync(join(__dirname, '../tools/registry.ts'), 'utf8');
  for (const m of img.matchAll(/name: '([^']+)',\n\s+description: '([^']+)'/g)) out.push(m[1], m[2]);
  const pdf = readFileSync(join(__dirname, '../pdf/registry.ts'), 'utf8');
  for (const m of pdf.matchAll(/name: '([^']+)', description: '([^']+)'/g)) out.push(m[1], m[2]);
  for (const m of img.matchAll(/\{ id: '\w+', label: '([^']+)' \}/g)) out.push(m[1]);
  for (const m of pdf.matchAll(/\{ id: '\w+', label: '([^']+)' \}/g)) out.push(m[1]);
  return out;
}

describe('translations', () => {
  const keys = Object.keys(es);
  const reg = registryStrings();
  it('cover every tool and group', () => {
    expect(reg.length).toBeGreaterThan(80);
    for (const [name, d] of Object.entries({ es, fr, de, pt })) expect(reg.filter((k) => !(k in d)), name).toEqual([]);
  });
  it('all locales cover the same strings', () => {
    for (const d of [fr, de, pt]) expect(Object.keys(d).sort()).toEqual([...keys].sort());
  });
  it('keep placeholders', () => {
    for (const d of [es, fr, de, pt]) for (const [k, v] of Object.entries(d)) expect((v.match(/\{\w+\}/g) ?? []).sort(), k).toEqual((k.match(/\{\w+\}/g) ?? []).sort());
  });
  it('detects a supported browser language', () => {
    expect(detect(['de-AT', 'en'])).toBe('de');
    expect(detect(['ja', 'pt-BR'])).toBe('pt');
    expect(detect(['ja'])).toBe('en');
  });
});

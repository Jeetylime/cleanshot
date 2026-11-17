import { resetTextMetrics } from './textEngine';
/**
 * Built-in fonts. All are self-hosted (bundled from @fontsource packages), so
 * using them never contacts a third-party font server. The CSS is imported
 * only by the Studio chunk; the font files download on first use.
 */
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/inter/wght-italic.css';
import '@fontsource-variable/montserrat/wght.css';
import '@fontsource-variable/montserrat/wght-italic.css';
import '@fontsource-variable/playfair-display/wght.css';
import '@fontsource-variable/playfair-display/wght-italic.css';
import '@fontsource-variable/lora/wght.css';
import '@fontsource-variable/lora/wght-italic.css';
import '@fontsource-variable/oswald/wght.css';
import '@fontsource-variable/caveat/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '@fontsource-variable/jetbrains-mono/wght-italic.css';
import '@fontsource/bebas-neue/400.css';
import '@fontsource/pacifico/400.css';

export interface FontOption {
  id: string;
  label: string;
  /** CSS font-family list. */
  css: string;
  category: 'Sans' | 'Serif' | 'Display' | 'Script' | 'Mono';
  /** Whether a bold weight exists (otherwise bold is ignored). */
  bold: boolean;
}

export const FONTS: FontOption[] = [
  { id: 'inter', label: 'Inter', css: "'Inter Variable', system-ui, sans-serif", category: 'Sans', bold: true },
  { id: 'montserrat', label: 'Montserrat', css: "'Montserrat Variable', system-ui, sans-serif", category: 'Sans', bold: true },
  { id: 'oswald', label: 'Oswald', css: "'Oswald Variable', 'Arial Narrow', sans-serif", category: 'Display', bold: true },
  { id: 'bebas', label: 'Bebas Neue', css: "'Bebas Neue', Impact, sans-serif", category: 'Display', bold: false },
  { id: 'playfair', label: 'Playfair Display', css: "'Playfair Display Variable', Georgia, serif", category: 'Serif', bold: true },
  { id: 'lora', label: 'Lora', css: "'Lora Variable', Georgia, serif", category: 'Serif', bold: true },
  { id: 'caveat', label: 'Caveat', css: "'Caveat Variable', 'Segoe Print', cursive", category: 'Script', bold: true },
  { id: 'pacifico', label: 'Pacifico', css: "Pacifico, 'Brush Script MT', cursive", category: 'Script', bold: false },
  { id: 'mono', label: 'JetBrains Mono', css: "'JetBrains Mono Variable', ui-monospace, monospace", category: 'Mono', bold: true },
  { id: 'system', label: 'System', css: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif", category: 'Sans', bold: true },
];

const BY_ID = new Map(FONTS.map((f) => [f.id, f]));

export function fontOf(id: string): FontOption {
  return BY_ID.get(id) ?? FONTS[0];
}

export function fontCss(id: string, px: number, bold: boolean, italic: boolean): string {
  const f = fontOf(id);
  return `${italic ? 'italic ' : ''}${bold && f.bold ? 700 : 400} ${px}px ${f.css}`;
}

const requested = new Set<string>();

/**
 * Make sure the faces a document uses are loaded before drawing. Canvas text
 * doesn't trigger font downloads by itself, so we ask explicitly and call
 * `onLoaded` once something new arrives.
 */
export function ensureFonts(specs: { fontFamily: string; bold: boolean; italic: boolean }[], onLoaded: () => void) {
  if (typeof document === 'undefined' || !document.fonts) return;
  const pending: Promise<unknown>[] = [];
  for (const s of specs) {
    const key = `${s.fontFamily}|${s.bold}|${s.italic}`;
    if (requested.has(key)) continue;
    requested.add(key);
    pending.push(document.fonts.load(fontCss(s.fontFamily, 32, s.bold, s.italic), 'AaBb').catch(() => null));
  }
  if (pending.length) void Promise.all(pending).then(onLoaded);
}

/** Wait for every font in use (export must not render fallback fonts). */
export async function loadFontsFor(specs: { fontFamily: string; bold: boolean; italic: boolean }[]) {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all(specs.map((s) => document.fonts.load(fontCss(s.fontFamily, 32, s.bold, s.italic), 'AaBb').catch(() => null)));
  // Text measured before the fonts arrived used fallback metrics; drop those cached widths.
  resetTextMetrics();
}

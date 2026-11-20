import { useSyncExternalStore } from 'react';
import es from './es';
import fr from './fr';
import de from './de';
import pt from './pt';

/**
 * Translations. The English text is the key (gettext style), so untranslated
 * strings simply show in English. The app shell (home, menus, settings,
 * section and tool names) is translated; tool panels are English for now.
 *
 * The language follows the browser unless picked in Settings.
 */

export type Lang = 'en' | 'es' | 'fr' | 'de' | 'pt';
export type LangPref = Lang | 'auto';

export const LANGUAGES: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
  { id: 'fr', name: 'Français' },
  { id: 'de', name: 'Deutsch' },
  { id: 'pt', name: 'Português' },
];

const DICTS: Record<Exclude<Lang, 'en'>, Record<string, string>> = { es, fr, de, pt };
const KEY = 'studiolo:lang';

function readPref(): LangPref {
  try {
    const v = localStorage.getItem(KEY);
    return v && (v === 'auto' || LANGUAGES.some((l) => l.id === v)) ? (v as LangPref) : 'auto';
  } catch {
    return 'auto';
  }
}

/** Pick a supported language from the browser's preferences. */
export function detect(langs: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []): Lang {
  for (const l of langs) {
    const base = l.toLowerCase().split('-')[0];
    if (LANGUAGES.some((x) => x.id === base)) return base as Lang;
  }
  return 'en';
}

let pref: LangPref = typeof window === 'undefined' ? 'en' : readPref();
let lang: Lang = pref === 'auto' ? detect() : pref;
const listeners = new Set<() => void>();

function apply() {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}
apply();

export function getLang(): Lang {
  return lang;
}

export function getLangPref(): LangPref {
  return pref;
}

export function setLangPref(p: LangPref) {
  pref = p;
  lang = p === 'auto' ? detect() : p;
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* not saved */
  }
  apply();
  listeners.forEach((l) => l());
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => lang,
    () => 'en' as Lang,
  );
}

/** Translate `s`; `{name}` placeholders are filled from `vars`. */
export function t(s: string, vars?: Record<string, string | number>): string {
  const out = lang === 'en' ? s : DICTS[lang][s] ?? s;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : out;
}

/** Strings every locale is expected to cover (checked by a unit test). */
export function missing(dict: Record<string, string>, keys: string[]): string[] {
  return keys.filter((k) => !(k in dict));
}

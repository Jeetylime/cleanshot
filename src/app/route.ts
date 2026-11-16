import { useSyncExternalStore } from 'react';

/**
 * Top-level navigation, kept in the URL hash (`#editor`, `#tools`,
 * `#background-remover`, ...) so sections can be bookmarked and the browser's
 * back button works. Plain `#name` hashes only.
 */

export type ToolKey =
  | 'background-remover'
  | 'upscaler'
  | 'resizer'
  | 'cropper'
  | 'compressor'
  | 'converter'
  | 'metadata'
  | 'color-picker';

export const TOOL_KEYS: ToolKey[] = [
  'background-remover',
  'upscaler',
  'resizer',
  'cropper',
  'compressor',
  'converter',
  'metadata',
  'color-picker',
];

export type PdfToolKey = 'pdf-merge' | 'pdf-split' | 'pdf-organize' | 'pdf-compress' | 'images-to-pdf' | 'pdf-to-images' | 'pdf-sign';

export const PDF_TOOL_KEYS: PdfToolKey[] = ['pdf-merge', 'pdf-split', 'pdf-organize', 'pdf-compress', 'images-to-pdf', 'pdf-to-images', 'pdf-sign'];

export type LegalDoc = 'terms' | 'privacy-policy' | 'acceptable-use';

export const LEGAL_DOCS: LegalDoc[] = ['terms', 'privacy-policy', 'acceptable-use'];

export type Route =
  | { section: 'home' }
  | { section: 'editor' }
  | { section: 'canvas' }
  | { section: 'about' }
  | { section: 'legal'; doc: LegalDoc }
  | { section: 'tools'; tool: ToolKey | null }
  | { section: 'pdf'; tool: PdfToolKey | null };

function parse(hash: string): Route {
  const h = hash.replace(/^#/, '');
  if (h === 'editor' || h === 'edit' || h === 'create') return { section: 'editor' };
  if (h === 'canvas') return { section: 'canvas' };
  if (h === 'about') return { section: 'about' };
  if (h === 'privacy') return { section: 'legal', doc: 'privacy-policy' }; // old Privacy & Models link
  if ((LEGAL_DOCS as string[]).includes(h)) return { section: 'legal', doc: h as LegalDoc };
  if (h === 'tools') return { section: 'tools', tool: null };
  if (h === 'pdf') return { section: 'pdf', tool: null };
  if ((PDF_TOOL_KEYS as string[]).includes(h)) return { section: 'pdf', tool: h as PdfToolKey };
  if ((TOOL_KEYS as string[]).includes(h)) return { section: 'tools', tool: h as ToolKey };
  return { section: 'home' };
}

let current: Route = parse(typeof location !== 'undefined' ? location.hash : '');
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    current = parse(location.hash);
    emit();
  });
}

export function getRoute(): Route {
  return current;
}

function toHash(r: Route): string {
  if (r.section === 'home') return 'home';
  if (r.section === 'editor') return 'editor';
  if (r.section === 'canvas') return 'canvas';
  if (r.section === 'about') return 'about';
  if (r.section === 'legal') return r.doc;
  if (r.section === 'pdf') return r.tool ?? 'pdf';
  return r.tool ?? 'tools';
}

export function navigate(r: Route) {
  const hash = toHash(r);
  current = r;
  if (location.hash.replace(/^#/, '') !== hash) location.hash = hash;
  emit();
}

export const goHome = () => navigate({ section: 'home' });
export const goEditor = () => navigate({ section: 'editor' });
export const goCanvas = () => navigate({ section: 'canvas' });
export const goAboutPage = () => navigate({ section: 'about' });
export const goLegal = (doc: LegalDoc) => navigate({ section: 'legal', doc });
export const goPrivacy = () => goLegal('privacy-policy');
export const goPdf = (tool: PdfToolKey | null = null) => navigate({ section: 'pdf', tool });
export const goTools = (tool: ToolKey | null = null) => navigate({ section: 'tools', tool });

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

// ---------------------------------------------------------------------------
// Window-level file input (paste / drop) is routed to whichever section is
// active. Image tools register a sink while mounted.

type FileSink = (files: File[]) => void;
let toolSink: FileSink | null = null;

export function setToolFileSink(sink: FileSink | null) {
  toolSink = sink;
}

export function getToolFileSink(): FileSink | null {
  return current.section === 'tools' || current.section === 'pdf' || current.section === 'canvas' ? toolSink : null;
}

// Paste without files on a section with a file sink (Studio pastes copied elements).
let pasteFallback: (() => boolean) | null = null;
export function setPasteFallback(fn: (() => boolean) | null) {
  pasteFallback = fn;
}
export function getPasteFallback() {
  return pasteFallback;
}

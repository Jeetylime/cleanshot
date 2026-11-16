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

export type Route = { section: 'home' } | { section: 'editor' } | { section: 'about' } | { section: 'tools'; tool: ToolKey | null };

function parse(hash: string): Route {
  const h = hash.replace(/^#/, '');
  if (h === 'editor') return { section: 'editor' };
  if (h === 'privacy') return { section: 'about' };
  if (h === 'tools') return { section: 'tools', tool: null };
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
  if (r.section === 'about') return 'privacy';
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
export const goAbout = () => navigate({ section: 'about' });
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
  return current.section === 'tools' ? toolSink : null;
}

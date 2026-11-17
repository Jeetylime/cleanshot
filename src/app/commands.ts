import type { ReactNode } from 'react';

/**
 * Command palette registry. The palette (main bundle) lists global commands;
 * sections that are lazy-loaded (Canvas) or stateful (Edit) register their own
 * commands while they're open, so the palette never imports editor code.
 */
export interface Command {
  id: string;
  label: string;
  section: string;
  keywords?: string;
  icon: ReactNode;
  /** Shortcut shown on the right, e.g. "⌘E". */
  shortcut?: string;
  run: () => void;
}

type Provider = () => Command[];
const providers = new Map<string, Provider>();

/** Add commands while a section is mounted; returns an unregister function. */
export function registerCommands(id: string, provider: Provider): () => void {
  providers.set(id, provider);
  return () => {
    if (providers.get(id) === provider) providers.delete(id);
  };
}

/** Commands from every registered provider, evaluated now (so they reflect current state). */
export function providedCommands(): Command[] {
  return [...providers.values()].flatMap((p) => {
    try {
      return p();
    } catch {
      return [];
    }
  });
}

let opener: (() => void) | null = null;
export function setPaletteOpener(fn: (() => void) | null) {
  opener = fn;
}
/** Open the command palette (search button, menus). */
export function openCommandPalette() {
  opener?.();
}

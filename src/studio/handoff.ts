import { goCanvas } from '../app/route';

/**
 * Hand an image from elsewhere in Studiolo (Edit, Image Tools) to Canvas.
 * Kept tiny and free of Studio imports so tools don't pull the editor code
 * into their own bundles; Studio picks the image up when it mounts.
 */

export interface Handoff {
  blob: Blob;
  name: string;
  newDesign: boolean;
}

let pending: Handoff | null = null;
const listeners = new Set<() => void>();

export function sendToCanvas(blob: Blob, name = 'Image', opts: { newDesign?: boolean } = {}) {
  pending = { blob, name, newDesign: opts.newDesign ?? false };
  goCanvas();
  listeners.forEach((l) => l());
}

export function takeHandoff(): Handoff | null {
  const p = pending;
  pending = null;
  return p;
}

export function onHandoff(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

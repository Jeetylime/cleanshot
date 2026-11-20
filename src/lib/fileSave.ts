/**
 * Native file saving and sharing, with graceful fallbacks:
 * - File System Access API (`showSaveFilePicker`) lets a project be saved to a
 *   file the person picks, then saved back to the same file.
 * - Web Share API (`navigator.share` with files) sends an export straight to
 *   Photos, Messages, Mail... on phones and some desktops.
 * Nothing here touches the network.
 */

interface WritableLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
export interface SaveHandle {
  name: string;
  createWritable(): Promise<WritableLike>;
}
type SavePicker = (opts: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<SaveHandle>;

function picker(): SavePicker | null {
  const p = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  // Not allowed in cross-origin iframes (e.g. embedded previews).
  if (typeof p !== 'function' || window.self !== window.top) return null;
  return p.bind(window);
}

export function saveFileSupported(): boolean {
  return typeof window !== 'undefined' && picker() !== null;
}

/**
 * Ask where to save, then write. Returns the handle, or null if the person
 * cancelled. Throws if the picker isn't available or writing fails.
 */
export async function saveWithPicker(blob: Blob, suggestedName: string, type: { description: string; mime: string; ext: string }): Promise<SaveHandle | null> {
  const p = picker();
  if (!p) throw new Error('File saving isn’t supported in this browser');
  let handle: SaveHandle;
  try {
    handle = await p({ suggestedName, types: [{ description: type.description, accept: { [type.mime]: [type.ext] } }] });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
  await writeToHandle(handle, blob);
  return handle;
}

export async function writeToHandle(handle: SaveHandle, blob: Blob): Promise<void> {
  const w = await handle.createWritable();
  await w.write(blob);
  await w.close();
}

/** Can this browser share this kind of file through the system share sheet? */
export function shareSupported(sample: { name: string; type: string } = { name: 'image.png', type: 'image/png' }): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([], sample.name, { type: sample.type })] });
  } catch {
    return false;
  }
}

/**
 * Open the system share sheet for a file.
 * - 'shared': done. 'cancelled': the person closed the sheet.
 * - 'expired': the browser no longer treats this as a direct response to the
 *   click (the export took too long); the caller should ask for another tap.
 */
export async function shareFile(blob: Blob, filename: string): Promise<'shared' | 'cancelled' | 'expired'> {
  const file = new File([blob], filename, { type: blob.type });
  if (!navigator.canShare?.({ files: [file] })) throw new Error('This file can’t be shared from this browser');
  try {
    await navigator.share({ files: [file] });
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    if (err instanceof DOMException && err.name === 'NotAllowedError') return 'expired';
    throw err;
  }
}

let ready: { key: unknown[]; blob: Blob; filename: string } | null = null;

const sameKey = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/**
 * Produce a file and share it. Browsers only allow sharing shortly after a
 * click, so a slow export can miss that window: the file is then kept and
 * 'retry' is returned, and the next call with the same key (compared item by
 * item, so documents compare by identity) shares it at once.
 */
export async function shareExport(key: unknown[], make: () => Promise<{ blob: Blob; filename: string }>): Promise<'shared' | 'cancelled' | 'retry'> {
  const file = ready && sameKey(ready.key, key) ? ready : { key, ...(await make()) };
  ready = null;
  const r = await shareFile(file.blob, file.filename);
  if (r === 'expired') {
    ready = file;
    return 'retry';
  }
  return r;
}

/**
 * Signatures the user chose to keep on this device (opt-in), as PNG data URLs
 * in localStorage. Nothing is saved unless the user presses "Save".
 */
const KEY = 'studiolo:signatures';
export const MAX_SAVED = 6;

export interface SavedSignature {
  id: string;
  url: string;
  savedAt: number;
}

export function listSignatures(): SavedSignature[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((s) => typeof s?.url === 'string' && s.url.startsWith('data:image/png')) : [];
  } catch {
    return [];
  }
}

function write(list: SavedSignature[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_SAVED)));
}

export function saveSignature(url: string): SavedSignature[] {
  const list = listSignatures().filter((s) => s.url !== url);
  list.unshift({ id: crypto.randomUUID(), url, savedAt: Date.now() });
  write(list);
  return listSignatures();
}

export function deleteSignature(id: string): SavedSignature[] {
  write(listSignatures().filter((s) => s.id !== id));
  return listSignatures();
}

export function loadSignatureCanvas(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = () => reject(new Error('Saved signature is damaged.'));
    img.src = url;
  });
}

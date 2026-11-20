import { openImageBlob } from '../store/actions';

export const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif';

/** Open the system file picker and load the chosen image. */
export function openFilePicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPTED_TYPES;
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void openImageBlob(file, file.name);
    input.remove();
  });
  document.body.appendChild(input);
  input.click();
}

/** Ask for files without opening them (callers decide what to do with them). */
export function chooseFiles(onFiles: (files: File[]) => void, opts: { multiple?: boolean; accept?: string } = {}) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = opts.accept ?? ACCEPTED_TYPES;
  input.multiple = !!opts.multiple;
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    if (files.length) onFiles(files);
    input.remove();
  });
  document.body.appendChild(input);
  input.click();
}

/**
 * Batch rename patterns. Tokens:
 *   {name}   original name without extension
 *   {n}      running number; {n:3} pads to 3 digits
 *   {date}   file date as YYYY-MM-DD ({time} → HH-MM-SS)
 *   {w} {h}  image size in pixels
 *   {ext}    original extension (added automatically when the pattern has none)
 */

export interface RenameInput {
  name: string;
  lastModified: number | null;
  width?: number;
  height?: number;
}

export interface RenameOptions {
  pattern: string;
  start: number;
  step: number;
  case: 'keep' | 'lower' | 'upper' | 'kebab';
  /** Replace characters that aren't safe in file names on Windows or macOS. */
  safe: boolean;
}

const pad = (v: number, n: number) => String(v).padStart(n, '0');

export function splitExt(name: string): [string, string] {
  const m = name.match(/^(.*?)(\.[a-z0-9]{1,6})?$/i);
  return [m?.[1] || name, (m?.[2] || '').slice(1)];
}

export function renameOne(input: RenameInput, index: number, o: RenameOptions): string {
  const [base, ext] = splitExt(input.name);
  const d = input.lastModified ? new Date(input.lastModified) : null;
  const n = o.start + index * o.step;
  let hasExt = false;
  let out = o.pattern.replace(/\{(name|n|date|time|w|h|ext)(?::(\d{1,2}))?\}/g, (_m, key: string, width?: string) => {
    switch (key) {
      case 'name':
        return base;
      case 'n':
        return width ? pad(n, Number(width)) : String(n);
      case 'date':
        return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}` : '';
      case 'time':
        return d ? `${pad(d.getHours(), 2)}-${pad(d.getMinutes(), 2)}-${pad(d.getSeconds(), 2)}` : '';
      case 'w':
        return input.width ? String(input.width) : '';
      case 'h':
        return input.height ? String(input.height) : '';
      default:
        hasExt = true;
        return ext;
    }
  });
  if (o.case === 'lower') out = out.toLowerCase();
  else if (o.case === 'upper') out = out.toUpperCase();
  else if (o.case === 'kebab') out = out.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
  // eslint-disable-next-line no-control-regex -- control characters are exactly what must be replaced
  if (o.safe) out = out.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/^\.+/, '').trim();
  out = out || `file-${n}`;
  if (!hasExt && ext) out += `.${o.case === 'upper' ? ext.toUpperCase() : ext.toLowerCase()}`;
  return out;
}

/** Rename every file; duplicates get " (2)", " (3)"… so no file overwrites another in the ZIP. */
export function renameAll(inputs: RenameInput[], o: RenameOptions): string[] {
  const seen = new Map<string, number>();
  return inputs.map((inp, i) => {
    const name = renameOne(inp, i, o);
    const key = name.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count === 1) return name;
    const [b, e] = splitExt(name);
    return `${b} (${count})${e ? '.' + e : ''}`;
  });
}

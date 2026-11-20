/**
 * Settings backup: one file with everything that makes Studiolo "yours" in
 * this browser, to move to another browser or keep safe:
 * - preferences, tool styles and saved annotation styles, brand kit,
 *   saved signatures, view options and export settings (localStorage)
 * - brand kit logos and saved Canvas templates (IndexedDB), with their images
 * Designs themselves are not included; download those as project files.
 */
import * as db from '../studio/persistence';
import { brandAssetIds } from '../studio/brand';
import { allPages } from '../studio/pages';

const FORMAT = 'studiolo-settings';
const VERSION = 1;
const isOurs = (k: string) => k.startsWith('studiolo') || k.startsWith('cleanshot');

interface BackupAsset {
  id: string;
  name: string;
  width: number;
  height: number;
  type: string;
  data: string;
}

interface BackupFile {
  format: string;
  version: number;
  createdAt: string;
  localStorage: Record<string, string>;
  assets: BackupAsset[];
  templates: (Omit<db.ProjectRecord, 'thumb'> & { thumb: { type: string; data: string } | null })[];
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

function base64ToBlob(data: string, type: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function exportSettings(): Promise<{ blob: Blob; summary: string }> {
  const ls: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (isOurs(k)) ls[k] = localStorage.getItem(k) ?? '';
  }
  const templates = await db.listTemplates().catch(() => [] as db.ProjectRecord[]);
  const ids = new Set(brandAssetIds());
  for (const t of templates) for (const pg of allPages(t.doc)) for (const e of pg.elements) if (e.type === 'image') ids.add(e.assetId);
  const assets: BackupAsset[] = [];
  for (const id of ids) {
    const a = await db.getAsset(id).catch(() => null);
    if (a) assets.push({ id, name: a.name, width: a.width, height: a.height, type: a.blob.type || 'image/png', data: await blobToBase64(a.blob) });
  }
  const file: BackupFile = {
    format: FORMAT,
    version: VERSION,
    createdAt: new Date().toISOString(),
    localStorage: ls,
    assets,
    templates: await Promise.all(templates.map(async (t) => ({ ...t, thumb: t.thumb ? { type: t.thumb.type, data: await blobToBase64(t.thumb) } : null }))),
  };
  const summary = `${Object.keys(ls).length} settings, ${templates.length} templates, ${assets.length} images`;
  return { blob: new Blob([JSON.stringify(file)], { type: 'application/json' }), summary };
}

/** Restore a backup. Existing settings with the same names are replaced; templates and images are added. */
export async function importSettings(file: Blob): Promise<string> {
  let parsed: BackupFile;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('This isn’t a Studiolo settings file.');
  }
  if (parsed?.format !== FORMAT) throw new Error('This isn’t a Studiolo settings file.');
  if (parsed.version > VERSION) throw new Error('This backup was made by a newer version of Studiolo.');
  let n = 0;
  for (const [k, v] of Object.entries(parsed.localStorage ?? {})) {
    if (!isOurs(k) || typeof v !== 'string') continue;
    localStorage.setItem(k, v);
    n++;
  }
  for (const a of parsed.assets ?? []) await db.putAsset({ id: a.id, name: a.name, width: a.width, height: a.height, blob: base64ToBlob(a.data, a.type) });
  for (const t of parsed.templates ?? []) await db.saveTemplate({ ...t, thumb: t.thumb ? base64ToBlob(t.thumb.data, t.thumb.type) : null });
  return `${n} settings, ${parsed.templates?.length ?? 0} templates, ${parsed.assets?.length ?? 0} images`;
}

import type { StudioDoc } from './types';
import { allPages } from './pages';
import { brandAssetIds } from './brand';

/**
 * Local project storage (IndexedDB). Projects store the editable document and
 * a small thumbnail; image pixels are stored once per asset in a separate
 * store, shared by every project that uses them. Nothing leaves the browser.
 */

const DB_NAME = 'cleanshot-studio';
const DB_VERSION = 3;

export interface ProjectRecord {
  id: string;
  name: string;
  updatedAt: number;
  width: number;
  height: number;
  doc: StudioDoc;
  thumb: Blob | null;
}

export interface AssetRecord {
  id: string;
  blob: Blob;
  width: number;
  height: number;
  name: string;
}

export type ProjectSummary = Omit<ProjectRecord, 'doc'>;

let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('templates')) d.createObjectStore('templates', { keyPath: 'id' });
      // Version history: snapshots keyed "<projectId>|<timestamp>".
      if (!d.objectStoreNames.contains('versions')) d.createObjectStore('versions', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  dbp.catch(() => (dbp = null));
  return dbp;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

export function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22);
}

export async function saveProject(doc: StudioDoc, thumb: Blob | null): Promise<void> {
  const d = await db();
  const tx = d.transaction('projects', 'readwrite');
  const rec: ProjectRecord = { id: doc.id, name: doc.name, updatedAt: doc.updatedAt, width: doc.width, height: doc.height, doc, thumb };
  tx.objectStore('projects').put(rec);
  await done(tx);
}

export async function loadProject(id: string): Promise<ProjectRecord | null> {
  const d = await db();
  return (await wrap(d.transaction('projects').objectStore('projects').get(id))) ?? null;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const d = await db();
  const all = (await wrap(d.transaction('projects').objectStore('projects').getAll())) as ProjectRecord[];
  return all
    .map(({ doc: _doc, ...rest }) => rest)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function putAsset(rec: AssetRecord): Promise<void> {
  const d = await db();
  const tx = d.transaction('assets', 'readwrite');
  tx.objectStore('assets').put(rec);
  await done(tx);
}

export async function getAsset(id: string): Promise<AssetRecord | null> {
  const d = await db();
  return (await wrap(d.transaction('assets').objectStore('assets').get(id))) ?? null;
}

export async function hasAsset(id: string): Promise<boolean> {
  const d = await db();
  return (await wrap(d.transaction('assets').objectStore('assets').count(id))) > 0;
}

/** Delete a project and any assets no other project still uses. */
export async function deleteProject(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['projects', 'assets', 'templates', 'versions'], 'readwrite');
  const projects = tx.objectStore('projects');
  const assets = tx.objectStore('assets');
  projects.delete(id);
  tx.objectStore('versions').delete(versionRange(id));
  const all = (await wrap(projects.getAll())) as ProjectRecord[];
  const tpls = (await wrap(tx.objectStore('templates').getAll())) as ProjectRecord[];
  const vers = ((await wrap(tx.objectStore('versions').getAll())) as VersionRecord[]).filter((v) => v.projectId !== id);
  const used = new Set<string>(brandAssetIds());
  for (const t of [...tpls, ...vers]) for (const pg of allPages(t.doc)) for (const e of pg.elements) if (e.type === 'image') used.add(e.assetId);
  for (const p of all) {
    if (p.id === id) continue;
    for (const pg of allPages(p.doc)) for (const e of pg.elements) if (e.type === 'image') used.add(e.assetId);
  }
  const keys = (await wrap(assets.getAllKeys())) as string[];
  for (const k of keys) if (!used.has(k)) assets.delete(k);
  await done(tx);
}

/** Remove assets that no saved project references (e.g. images deleted before a save). */
export async function collectGarbage(keep: Set<string>): Promise<void> {
  const d = await db();
  const tx = d.transaction(['projects', 'assets', 'templates', 'versions'], 'readwrite');
  const all: { doc: StudioDoc }[] = [
    ...((await wrap(tx.objectStore('projects').getAll())) as ProjectRecord[]),
    ...((await wrap(tx.objectStore('templates').getAll())) as ProjectRecord[]),
    ...((await wrap(tx.objectStore('versions').getAll())) as VersionRecord[]),
  ];
  const used = new Set([...keep, ...brandAssetIds()]);
  for (const p of all) for (const pg of allPages(p.doc)) for (const e of pg.elements) if (e.type === 'image') used.add(e.assetId);
  const store = tx.objectStore('assets');
  const keys = (await wrap(store.getAllKeys())) as string[];
  for (const k of keys) if (!used.has(k)) store.delete(k);
  await done(tx);
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e && e.quota ? { usage: e.usage ?? 0, quota: e.quota } : null;
  } catch {
    return null;
  }
}

/** Ask the browser not to evict our data under storage pressure (best effort). */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist?.();
  } catch {
    /* not supported */
  }
}

// ---------------------------------------------------------------------------
// Project files (.studiolo; older .cleanshot files still open): the document plus its images, as JSON.

export const PROJECT_FILE_FORMAT = 'studiolo';
/** Format id written by earlier versions (when the site was called CleanShot). */
const LEGACY_FORMATS = ['cleanshot-studio'];
export const PROJECT_FILE_VERSION = 1;

interface ProjectFile {
  format: string;
  version: number;
  doc: StudioDoc;
  assets: { id: string; name: string; width: number; height: number; type: string; data: string }[];
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(data: string, type: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function buildProjectFile(doc: StudioDoc, assets: AssetRecord[]): Promise<Blob> {
  const file: ProjectFile = {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION,
    doc,
    assets: await Promise.all(
      assets.map(async (a) => ({ id: a.id, name: a.name, width: a.width, height: a.height, type: a.blob.type || 'image/png', data: await blobToBase64(a.blob) })),
    ),
  };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

export async function parseProjectFile(file: Blob): Promise<{ doc: StudioDoc; assets: AssetRecord[] }> {
  let parsed: ProjectFile;
  try {
    parsed = JSON.parse(await file.text()) as ProjectFile;
  } catch {
    throw new Error('This file isn’t a Studiolo project.');
  }
  if ((parsed?.format !== PROJECT_FILE_FORMAT && !LEGACY_FORMATS.includes(parsed?.format)) || !parsed.doc || !(Array.isArray(parsed.doc.elements) || Array.isArray(parsed.doc.pages))) throw new Error('This file isn’t a Studiolo project.');
  if (parsed.version > PROJECT_FILE_VERSION) throw new Error('This project was made with a newer version of Studiolo.');
  const doc = parsed.doc;
  if (!(doc.width > 0 && doc.height > 0)) throw new Error('The project file is damaged.');
  const assets = (parsed.assets ?? []).map((a) => ({ id: a.id, name: a.name, width: a.width, height: a.height, blob: base64ToBlob(a.data, a.type) }));
  return { doc, assets };
}

// ---------------------------------------------------------------------------
// Your templates: saved copies of designs to start new ones from.

export async function saveTemplate(rec: ProjectRecord): Promise<void> {
  const d = await db();
  const tx = d.transaction('templates', 'readwrite');
  tx.objectStore('templates').put(rec);
  await done(tx);
}

export async function listTemplates(): Promise<ProjectRecord[]> {
  const d = await db();
  const all = (await wrap(d.transaction('templates').objectStore('templates').getAll())) as ProjectRecord[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteTemplate(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction('templates', 'readwrite');
  tx.objectStore('templates').delete(id);
  await done(tx);
}

// ---------------------------------------------------------------------------
// Version history: automatic and named snapshots of a design.

export interface VersionRecord {
  id: string;
  projectId: string;
  createdAt: number;
  /** Set for versions saved by hand ("Save version…"). */
  label?: string;
  doc: StudioDoc;
  thumb: Blob | null;
}

export type VersionSummary = Omit<VersionRecord, 'doc'>;

/** Automatic snapshots kept per design (named versions are kept until deleted). */
export const MAX_AUTO_VERSIONS = 30;

const versionRange = (projectId: string) => IDBKeyRange.bound(`${projectId}|`, `${projectId}|\uffff`);

export async function addVersion(rec: Omit<VersionRecord, 'id'>): Promise<void> {
  const d = await db();
  const tx = d.transaction('versions', 'readwrite');
  const store = tx.objectStore('versions');
  store.put({ ...rec, id: `${rec.projectId}|${String(rec.createdAt).padStart(15, '0')}` });
  // Prune the oldest automatic snapshots beyond the limit.
  const existing = ((await wrap(store.getAll(versionRange(rec.projectId)))) as VersionRecord[]).filter((v) => !v.label);
  const extra = existing.length - MAX_AUTO_VERSIONS;
  if (extra > 0) existing.sort((a, b) => a.createdAt - b.createdAt).slice(0, extra).forEach((v) => store.delete(v.id));
  await done(tx);
}

export async function listVersions(projectId: string): Promise<VersionSummary[]> {
  const d = await db();
  const all = (await wrap(d.transaction('versions').objectStore('versions').getAll(versionRange(projectId)))) as VersionRecord[];
  return all.map(({ doc: _doc, ...rest }) => rest).sort((a, b) => b.createdAt - a.createdAt);
}

export async function loadVersion(id: string): Promise<VersionRecord | null> {
  const d = await db();
  return ((await wrap(d.transaction('versions').objectStore('versions').get(id))) as VersionRecord | undefined) ?? null;
}

export async function deleteVersion(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction('versions', 'readwrite');
  tx.objectStore('versions').delete(id);
  await done(tx);
}

export async function latestVersionTime(projectId: string): Promise<number> {
  const list = await listVersions(projectId);
  return list[0]?.createdAt ?? 0;
}

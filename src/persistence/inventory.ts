/**
 * Read-only inventory of everything Studiolo keeps on this device, for the
 * Storage page. Databases are opened without a version, and only when
 * indexedDB.databases() says they exist. That way this page never creates or
 * upgrades a database the editors own.
 */

export interface StoreUsage {
  count: number;
  bytes: number;
}

export interface Inventory {
  projects: StoreUsage;
  templates: StoreUsage;
  /** Canvas version history snapshots. */
  versions: StoreUsage;
  assets: StoreUsage;
  sessions: StoreUsage;
  sessionImages: StoreUsage;
  models: StoreUsage;
  offline: StoreUsage;
  localStorage: StoreUsage;
  estimate: { usage: number; quota: number } | null;
  persisted: boolean | null;
}

export const STUDIO_DB = 'cleanshot-studio';
export const EDITOR_DB = 'cleanshot';

const empty = (): StoreUsage => ({ count: 0, bytes: 0 });

/** Approximate the stored size of a structured-clone value: blobs by size, strings by length. */
export function sizeOf(value: unknown, seen = new Set<unknown>()): number {
  if (value == null) return 0;
  if (typeof value === 'string') return value.length * 2;
  if (typeof value === 'number') return 8;
  if (typeof value === 'boolean') return 4;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (typeof value !== 'object' || seen.has(value)) return 0;
  seen.add(value);
  let n = 0;
  if (Array.isArray(value)) for (const v of value) n += sizeOf(v, seen);
  else for (const [k, v] of Object.entries(value)) n += k.length * 2 + sizeOf(v, seen);
  return n;
}

async function dbExists(name: string): Promise<boolean> {
  try {
    const dbs = await indexedDB.databases?.();
    return !!dbs?.some((d) => d.name === name);
  } catch {
    return false;
  }
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function openExisting(name: string): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined' || !(await dbExists(name))) return null;
  return new Promise((resolve) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(null);
    r.onblocked = () => resolve(null);
  });
}

async function measure(db: IDBDatabase | null, store: string): Promise<StoreUsage> {
  if (!db || !db.objectStoreNames.contains(store)) return empty();
  try {
    const all = await req(db.transaction(store).objectStore(store).getAll());
    return { count: all.length, bytes: all.reduce((s, v) => s + sizeOf(v), 0) };
  } catch {
    return empty();
  }
}

async function measureCaches(match: (name: string) => boolean, onlyOnnx = false): Promise<StoreUsage> {
  const out = empty();
  try {
    if (typeof caches === 'undefined') return out;
    for (const name of (await caches.keys()).filter(match)) {
      const cache = await caches.open(name);
      for (const r of await cache.keys()) {
        if (onlyOnnx && !r.url.endsWith('.onnx')) continue;
        const res = await cache.match(r);
        const len = Number(res?.headers.get('content-length'));
        out.count++;
        out.bytes += Number.isFinite(len) && len > 0 ? len : (await res?.blob())?.size ?? 0;
      }
    }
  } catch {
    // Cache Storage can be unavailable (private windows, file://).
  }
  return out;
}

export async function takeInventory(modelCache: string): Promise<Inventory> {
  const [studio, editor] = await Promise.all([openExisting(STUDIO_DB), openExisting(EDITOR_DB)]);
  try {
    const [projects, templates, versions, assets, sessions, sessionImages, models, offline] = await Promise.all([
      measure(studio, 'projects'),
      measure(studio, 'templates'),
      measure(studio, 'versions'),
      measure(studio, 'assets'),
      measure(editor, 'sessions'),
      measure(editor, 'images'),
      measureCaches((n) => n === modelCache, true),
      measureCaches((n) => n.startsWith('studiolo-')),
    ]);
    const ls = empty();
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (!k.startsWith('cleanshot') && !k.startsWith('studiolo')) continue;
        ls.count++;
        ls.bytes += (k.length + (localStorage.getItem(k)?.length ?? 0)) * 2;
      }
    } catch {
      // localStorage blocked
    }
    let estimate: Inventory['estimate'] = null;
    let persisted: boolean | null = null;
    try {
      const e = await navigator.storage?.estimate?.();
      if (e?.quota) estimate = { usage: e.usage ?? 0, quota: e.quota };
      persisted = (await navigator.storage?.persisted?.()) ?? null;
    } catch {
      // unsupported
    }
    return { projects, templates, versions, assets, sessions, sessionImages, models, offline, localStorage: ls, estimate, persisted };
  } finally {
    studio?.close();
    editor?.close();
  }
}

/** Delete the offline app cache (the service worker re-fills it on the next visit). */
export async function clearOfflineCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  for (const name of await caches.keys()) if (name.startsWith('studiolo-')) await caches.delete(name);
}

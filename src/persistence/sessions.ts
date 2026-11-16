import type { EditorDoc } from '../types';
import { canvasToBlob, decodeImage, getImageBlob, hasImage, registerImage } from '../engine/images';
import { computeLayout, renderDocument } from '../engine/render';

/**
 * Session recovery backed by IndexedDB. Each session stores the current
 * document (JSON), a thumbnail and the image blobs it references. Images
 * are stored once per id and garbage-collected when no session uses them.
 */

const DB_NAME = 'cleanshot';
const DB_VERSION = 1;
const MAX_SESSIONS = 10;

export interface SessionRecord {
  id: string;
  name: string;
  updatedAt: number;
  width: number;
  height: number;
  doc: EditorDoc;
  thumb: Blob | null;
  imageIds: string[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

async function makeThumbnail(doc: EditorDoc): Promise<Blob | null> {
  try {
    const L = computeLayout(doc);
    const k = Math.min(1, 480 / L.outW, 320 / L.outH);
    const canvas = renderDocument(doc, {
      width: Math.max(1, Math.round(L.outW * k)),
      height: Math.max(1, Math.round(L.outH * k)),
      matte: null,
    });
    const blob = await canvasToBlob(canvas, 'image/webp', 0.82).catch(() => canvasToBlob(canvas, 'image/png'));
    return blob;
  } catch {
    return null;
  }
}

export async function saveSession(doc: EditorDoc): Promise<void> {
  const db = await openDB();
  const imageIds = [...new Set([doc.imageId, doc.originalImageId])];

  // Find which images still need to be written.
  const existing = await Promise.all(
    imageIds.map((id) => reqToPromise(db.transaction('images').objectStore('images').getKey(id))),
  );
  const missing = imageIds.filter((_, i) => existing[i] === undefined);
  const blobs = await Promise.all(missing.map((id) => getImageBlob(id)));
  const thumb = await makeThumbnail(doc);

  const tx = db.transaction(['sessions', 'images'], 'readwrite');
  const images = tx.objectStore('images');
  missing.forEach((id, i) => images.put(blobs[i], id));
  const record: SessionRecord = {
    id: doc.id,
    name: doc.name,
    updatedAt: Date.now(),
    width: doc.width,
    height: doc.height,
    doc,
    thumb,
    imageIds,
  };
  tx.objectStore('sessions').put(record);
  await txDone(tx);
  await prune();
}

async function allSessions(): Promise<SessionRecord[]> {
  const db = await openDB();
  const list = await reqToPromise(db.transaction('sessions').objectStore('sessions').getAll() as IDBRequest<SessionRecord[]>);
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function prune(): Promise<void> {
  const db = await openDB();
  const sessions = await allSessions();
  const keep = sessions.slice(0, MAX_SESSIONS);
  const drop = sessions.slice(MAX_SESSIONS);
  const used = new Set(keep.flatMap((s) => s.imageIds));
  const imageKeys = (await reqToPromise(db.transaction('images').objectStore('images').getAllKeys())) as string[];
  const orphaned = imageKeys.filter((k) => !used.has(k));
  if (!drop.length && !orphaned.length) return;
  const tx = db.transaction(['sessions', 'images'], 'readwrite');
  drop.forEach((s) => tx.objectStore('sessions').delete(s.id));
  orphaned.forEach((k) => tx.objectStore('images').delete(k));
  await txDone(tx);
}

export interface SessionListItem {
  id: string;
  name: string;
  updatedAt: number;
  width: number;
  height: number;
  thumb: Blob | null;
}

export async function listSessions(): Promise<SessionListItem[]> {
  const sessions = await allSessions();
  return sessions.map(({ id, name, updatedAt, width, height, thumb }) => ({ id, name, updatedAt, width, height, thumb }));
}

/** Load a session, decoding and registering its images. */
export async function loadSession(id: string): Promise<EditorDoc | null> {
  const db = await openDB();
  const record = (await reqToPromise(db.transaction('sessions').objectStore('sessions').get(id))) as
    | SessionRecord
    | undefined;
  if (!record) return null;
  for (const imageId of record.imageIds) {
    if (hasImage(imageId)) continue;
    const blob = (await reqToPromise(db.transaction('images').objectStore('images').get(imageId))) as Blob | undefined;
    if (!blob) throw new Error('Session image missing');
    const src = await decodeImage(blob);
    registerImage(src, { id: imageId, blob });
  }
  return record.doc;
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('sessions', 'readwrite');
  tx.objectStore('sessions').delete(id);
  await txDone(tx);
  await prune();
}

export async function clearSessions(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(['sessions', 'images'], 'readwrite');
  tx.objectStore('sessions').clear();
  tx.objectStore('images').clear();
  await txDone(tx);
}

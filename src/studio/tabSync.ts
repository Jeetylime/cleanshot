import { studio } from './store';

/**
 * Cross-tab awareness for Canvas designs. Designs autosave to IndexedDB, so if
 * the same design is open in two tabs the last save would silently win. Tabs
 * announce which design they have open and when they save it over a
 * BroadcastChannel (same origin, never leaves the browser):
 *
 * - 'open': another tab has this design open too (a heads-up).
 * - 'changed': another tab saved this design. Autosave pauses here until the
 *   person reloads the latest version or chooses to keep this tab's version.
 */
export type TabConflict = 'open' | 'changed';

type Msg =
  | { type: 'claim'; docId: string; tab: string }
  | { type: 'present'; docId: string; tab: string }
  | { type: 'release'; docId: string; tab: string }
  | { type: 'saved'; docId: string; tab: string };

const TAB = Math.random().toString(36).slice(2) + Date.now().toString(36);
let channel: BroadcastChannel | null = null;
let currentId: string | null = null;
/** Other tabs that have the current design open. */
const others = new Set<string>();

function post(msg: Msg) {
  try {
    channel?.postMessage(msg);
  } catch {
    /* channel closed */
  }
}

function setConflict(c: TabConflict | null) {
  if (studio.get().tabConflict !== c) studio.set({ tabConflict: c });
}

function onMessage(e: MessageEvent<Msg>) {
  const m = e.data;
  if (!m || m.tab === TAB || m.docId !== currentId) return;
  switch (m.type) {
    case 'claim':
      others.add(m.tab);
      post({ type: 'present', docId: m.docId, tab: TAB });
      if (!studio.get().tabConflict) setConflict('open');
      break;
    case 'present':
      others.add(m.tab);
      if (!studio.get().tabConflict) setConflict('open');
      break;
    case 'release':
      others.delete(m.tab);
      if (!others.size && studio.get().tabConflict === 'open') setConflict(null);
      break;
    case 'saved':
      others.add(m.tab);
      setConflict('changed');
      break;
  }
}

function track(id: string | null) {
  if (id === currentId) return;
  if (currentId) post({ type: 'release', docId: currentId, tab: TAB });
  currentId = id;
  others.clear();
  setConflict(null);
  if (id) post({ type: 'claim', docId: id, tab: TAB });
}

/** Start listening while the Canvas editor is mounted. Returns a cleanup. */
export function startTabSync(): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  channel = new BroadcastChannel('studiolo-canvas');
  channel.onmessage = onMessage;
  const unsub = studio.subscribe(() => track(studio.get().doc?.id ?? null));
  track(studio.get().doc?.id ?? null);
  const release = () => track(null);
  window.addEventListener('pagehide', release);
  return () => {
    window.removeEventListener('pagehide', release);
    unsub();
    track(null);
    channel?.close();
    channel = null;
  };
}

/** Tell other tabs this design was just saved. */
export function announceSaved(docId: string) {
  post({ type: 'saved', docId, tab: TAB });
}

/** True while another tab's newer save must not be overwritten. */
export function savePaused(): boolean {
  return studio.get().tabConflict === 'changed';
}

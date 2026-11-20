/*
 * Studiolo service worker: makes the app work offline after the first visit.
 *
 * - Navigations: network first, falling back to the cached page.
 * - Hashed build files (/assets): cache first. They never change, and lazy
 *   chunks are cached the first time they load.
 * - Other same-origin files (/ort, /pdfjs, theme-init.js, ...): their names
 *   don't change between releases, so serve the cache but refresh it in the
 *   background (stale-while-revalidate).
 * - VERSION is replaced with a per-build ID at build time (vite.config.ts), so
 *   each deploy starts fresh caches and deletes the previous ones.
 * - Cross-origin requests (Hugging Face model weights) are left alone;
 *   Transformers.js already caches those in its own Cache Storage bucket.
 */
const VERSION = 'v1';
const SHELL = `studiolo-shell-${VERSION}`;
const FILES = `studiolo-files-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(['./', './theme-init.js', './favicon.svg', './manifest.webmanifest']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('studiolo-') && k !== SHELL && k !== FILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Bundled model chunks are large and already streamed on demand; don't duplicate them.
  if (url.pathname.includes('/models/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(SHELL).then((c) => c.put('./', copy));
          }
          return res;
        })
        .catch(() => caches.match('./').then((r) => r || Response.error())),
    );
    return;
  }

  const fetchAndStore = () =>
    fetch(req).then((res) => {
      if (res.ok && res.type === 'basic' && res.status === 200) {
        const copy = res.clone();
        void caches.open(FILES).then((c) => c.put(req, copy));
      }
      return res;
    });

  // Hashed build output never changes: cache first.
  if (/\/assets\/[^/]+-[\w-]{8,}\.\w+$/.test(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetchAndStore()));
    return;
  }

  // Everything else keeps its name across releases: serve the cache, refresh in the background.
  event.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetchAndStore();
      if (!hit) return fresh;
      event.waitUntil(fresh.catch(() => undefined));
      return hit;
    }),
  );
});

/* ================================================================
   Run01 - Service Worker  (sw.js)
   Cache-first strategy for all CDN assets + Stale-While-Revalidate for local assets.

   First visit  -> fetch from network, store in cache
   Repeat visit -> serve from cache instantly (no network round-trip)

   Assets cached: Pyodide WASM + JS (~12 MB), Python wheels, Monaco editor (~2 MB),
                  Plotly.js (~3 MB), Google Fonts, PyPI wheels, CSS, App JS.
   ================================================================ */

const CACHE_VERSION = 'run01-v6';

const CACHE_ORIGINS = [
  'https://cdn.jsdelivr.net',
  'https://cdn.plot.ly',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://cdnjs.cloudflare.com',
  'https://unpkg.com',
  'https://files.pythonhosted.org',
  'https://pypi.org',
];

// Precache list for local static runtime assets
const PRECACHE_ASSETS = [
  './style.css',
  './app.js',
  './favicon.png',
];

// -- Install: take control immediately & precache core assets --
self.addEventListener('install', (evt) => {
  self.skipWaiting();
  evt.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache non-blocking notice:', err);
      });
    })
  );
});

// -- Activate: claim clients, purge old caches -------------
self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
        )
      ),
    ])
  );
});

// -- Fetch: cache-first for CDN/PyPI, stale-while-revalidate for local assets --
self.addEventListener('fetch', (evt) => {
  const { request } = evt;

  // Only cache GET requests
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isCDN = CACHE_ORIGINS.some((o) => request.url.startsWith(o));
  const isLocalStatic = url.origin === self.location.origin && (
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2')
  ) && !url.pathname.includes('/api/') && !url.pathname.endsWith('sw.js');

  if (!isCDN && !isLocalStatic) return;

  evt.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      // 1. Serve from cache if available
      const hit = await cache.match(request);
      if (hit) {
        if (isLocalStatic) {
          fetch(request).then((fresh) => {
            if (fresh && fresh.status === 200) cache.put(request, fresh);
          }).catch(() => {});
        }
        return hit;
      }

      // 2. Fetch from network, cache valid response
      try {
        const resp = await fetch(request);
        if (resp && (resp.status === 200 || resp.type === 'opaque')) {
          cache.put(request, resp.clone()); // non-blocking write
        }
        return resp;
      } catch (err) {
        // Network failure - try stale cache as last resort
        const stale = await cache.match(request);
        if (stale) return stale;
        throw err;
      }
    })
  );
});

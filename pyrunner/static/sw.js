/* ================================================================
   Run01 — Service Worker  (sw.js)
   Cache-first strategy for all CDN assets.

   First visit  → fetch from network, store in cache
   Repeat visit → serve from cache instantly (no network round-trip)

   Assets cached: Pyodide WASM + JS (~12 MB), Monaco editor (~2 MB),
                  Plotly.js (~3 MB), Google Fonts.
   ================================================================ */

const CACHE_VERSION = 'run01-v3';

const CACHE_ORIGINS = [
  'https://cdn.jsdelivr.net',
  'https://cdn.plot.ly',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

// Precache list for critical local assets including MuJoCo WASM and physics engine
const PRECACHE_ASSETS = [
  '/static/mujoco_wasm.js',
  '/static/mujoco.wasm',
  '/static/mujoco_wasm.wasm',
  '/static/physics-engine.js'
];

// ── Install: take control immediately & precache WASM assets ──
self.addEventListener('install', (evt) => {
  self.skipWaiting();
  evt.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache non-blocking failure:', err);
      });
    })
  );
});

// ── Activate: claim clients, purge old caches ─────────────
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

// ── Fetch: cache-first for CDN and MuJoCo/Physics WASM, passthrough for everything else ──
self.addEventListener('fetch', (evt) => {
  const { request } = evt;

  // Only cache GET requests
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isCDN = CACHE_ORIGINS.some((o) => request.url.startsWith(o));
  const isPrecacheLocal = PRECACHE_ASSETS.some((p) => url.pathname === p);
  if (!isCDN && !isPrecacheLocal) return;

  evt.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      // 1. Serve from cache if available
      const hit = await cache.match(request);
      if (hit) return hit;

      // 2. Fetch from network, cache the response
      try {
        const resp = await fetch(request);
        // Only cache valid, non-opaque responses
        if (resp && resp.status === 200 && resp.type !== 'opaque') {
          cache.put(request, resp.clone()); // non-blocking write
        }
        return resp;
      } catch (err) {
        // Network failure – try stale cache as last resort
        const stale = await cache.match(request);
        if (stale) return stale;
        throw err;
      }
    })
  );
});

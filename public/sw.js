// OZ Amp Offline Service Worker
// Provides offline access to saved gigs, set times, and venue sightlines
// inside low-signal stadiums/basements while keeping live catalog & builds fresh online.

const CACHE_NAME = 'oz-amp-offline-v2';
const APP_SHELL_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './images/melbourne-stage.jpg',
  './images/sydney-stage.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('oz-amp-offline-') && key !== CACHE_NAME)
            .map((oldKey) => caches.delete(oldKey)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache CSRF session tokens, push webhooks, or mutable API endpoints
  if (
    url.pathname.startsWith('/api/') &&
    url.pathname !== '/api/catalog' &&
    url.pathname !== '/api/trending-music' &&
    url.pathname !== '/api/healthz'
  ) {
    return;
  }

  // Network-first with offline cache fallback for HTML navigation, live /api/catalog & /api/trending-music
  if (
    request.mode === 'navigate' ||
    url.pathname === '/api/catalog' ||
    url.pathname === '/api/trending-music'
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          if (request.mode === 'navigate') {
            const fallbackHtml = await caches.match('./index.html');
            if (fallbackHtml) return fallbackHtml;
          }
          return new Response(JSON.stringify({ offline: true }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }),
    );
    return;
  }

  // Cache-first with background refresh for hashed JS/CSS chunks, icons & stage photography
  if (
    url.pathname.includes('/assets/') ||
    url.pathname.includes('/images/') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.webmanifest')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkPromise = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkPromise;
      }),
    );
  }
});

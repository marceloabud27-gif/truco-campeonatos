const CACHE_NAME = 'truco-campeonatos-v20260730-mobile-history-readable';
const APP_SHELL = [
  '/',
  '/?public=fixture&source=pwa',
  '/index.html',
  '/styles.css?v=20260730-mobile-history-readable',
  '/app.js?v=20260730-mobile-history-readable',
  '/assets/fixture-oficial-card.png?v=20260724-admin-luxury',
  '/assets/pwa/icon-192.png',
  '/manifest.webmanifest',
  '/assets/copa-referencia.png?v=20260519',
  '/assets/pwa/icon-192.png',
  '/assets/pwa/icon-512.png',
  '/assets/pwa/apple-touch-icon.png',
  '/assets/pwa/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

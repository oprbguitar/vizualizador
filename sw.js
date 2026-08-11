/* Service Worker — Vizualizador Offline
   Estrategia: cache-first para los recursos propios, con red como respaldo.
   Al activar una versión nueva se borran todas las cachés anteriores. */

const CACHE = 'vizualizador-offline-v6';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/styles.css',
  './assets/js/nucleo.js',
  './assets/js/app.js',
  './assets/js/vistas/v1-tarjetas.js',
  './assets/js/vistas/v2-editor.js',
  './assets/js/vistas/v3-estudio.js',
  './assets/icons/icon.svg',
  './assets/vendor/marked.min.js',
  './assets/vendor/mermaid.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && new URL(request.url).origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});

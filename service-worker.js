const CACHE_VERSION = 'medisaathi-single-v3';
const APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-192.png', './icon-maskable-512.png'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch((err) => console.warn('precache failed:', err)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) { event.respondWith(fetch(request).catch(() => caches.match(request))); return; }
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((response) => {
        if (response && response.status === 200) { const clone = response.clone(); caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone)); }
        return response;
      }).catch(() => cached);
      return cached || networkFetch;
    }).catch(() => request.mode === 'navigate' ? caches.match('./index.html') : undefined)
  );
});

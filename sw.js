// Service Worker — self-destruct: clears all caches, passes all fetches to network
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Pass everything straight to the network — no caching
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

// Service Worker — no-op: clears all caches, does NOT intercept any requests.
// All fetches go directly through the browser (no SW caching at all).
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// No 'fetch' handler — browser handles all requests normally.

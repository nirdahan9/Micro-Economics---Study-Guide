// Service Worker בוטל — מנקה את כל ה-cache ומבטל רישום עצמו
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});


const STATIC_ASSETS = [
  './',
  './index.html',
  './quiz.html',
  './weak-first.html',
  './confidence.html',
  './lives.html',
  './timer.html',
  './game-modes.html',
  './materials.html',
  './login.html',
  './styles.css',
  './app.js',
  './quiz.js',
  './questions-data.js',
  './documents-data.js',
  './auth.js',
  './version.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Don't intercept Firebase / external requests
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
        }
        return response;
      }).catch(() => cached);
    })
  );
});

const CACHE_NAME = 'bal-enzo-v38';

const FILES_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './translations.js',
  './manifest.json',
  './icon.png',
  './logo.png',
  './hero.jpg'
];

// Installatie: bestanden vooraf cachen
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(FILES_TO_CACHE))
  );

  self.skipWaiting();
});

// Activatie: oude caches verwijderen
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Altijd eerst netwerk proberen
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();

        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, clone);
        });

        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Laat een nieuwe service worker onmiddellijk actief worden
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

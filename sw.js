const CACHE_NAME = 'bal-enzo-v53';

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

// Pushmelding ontvangen
self.addEventListener('push', event => {
  let notificationData = {};

  if (event.data) {
    const messageText = event.data.text();

    try {
      notificationData = JSON.parse(messageText);
    } catch (error) {
      notificationData = {
        body: messageText
      };
    }
  }

  const title =
    notificationData.title ||
    'Bal Enzo Club App';

  const options = {
    body:
      notificationData.body ||
      'Je hebt een nieuwe melding.',
    icon: './icon.png',
    badge: './icon.png',
    data: {
      url: notificationData.url || './'
    }
  };

  if (notificationData.tag) {
    options.tag = notificationData.tag;
    options.renotify = true;
  }

  event.waitUntil(
    self.registration.showNotification(
      title,
      options
    )
  );
});

// Sparring Matches openen wanneer op een pushmelding wordt gedrukt
self.addEventListener('notificationclick', event => {
  event.notification.close();

  let targetUrl;

  try {
    const requestedUrl = new URL(
      event.notification.data?.url || './',
      self.registration.scope
    );

    /*
     * Pushmeldingen worden uitsluitend binnen de eigen PWA geopend.
     * De parameter vertelt app.js dat Sparring Matches moet openen.
     */
    if (
      requestedUrl.origin === self.location.origin &&
      requestedUrl.href.startsWith(
        self.registration.scope
      )
    ) {
      requestedUrl.searchParams.set(
        'open',
        'moneygames'
      );

      targetUrl = requestedUrl.href;
    } else {
      targetUrl =
        self.registration.scope +
        '?open=moneygames';
    }
  } catch (error) {
    targetUrl =
      self.registration.scope +
      '?open=moneygames';
  }

  event.waitUntil(
    self.clients
      .matchAll({
        type: 'window',
        includeUncontrolled: true
      })
      .then(windowClients => {
        const existingClient =
          windowClients.find(client =>
            client.url.startsWith(
              self.registration.scope
            )
          );

        if (existingClient) {
          return existingClient
            .navigate(targetUrl)
            .then(client => client.focus());
        }

        return self.clients.openWindow(targetUrl);
      })
  );
});
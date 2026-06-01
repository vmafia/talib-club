const CACHE_NAME = 'talib-club-cache-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(err => {
        console.warn('Pre-caching failed during installation, continuing...', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event (for offline support & PWA install requirements)
self.addEventListener('fetch', (e) => {
  // Let browser handle non-GET and cross-origin requests normally
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  // Skip dev files if running in dev mode
  if (e.request.url.includes('/@vite') || e.request.url.includes('/node_modules/')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in background to update cache (Stale-While-Revalidate pattern)
        fetch(e.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, networkResponse);
            });
          }
        }).catch(() => {/* Ignore network errors during background update */});
        return cachedResponse;
      }
      
      return fetch(e.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback for HTML navigation when offline
        if (e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html')) {
          return caches.match('/');
        }
      });
    })
  );
});

// Push Event
self.addEventListener('push', (e) => {
  let data = { title: 'Talib Club', body: 'มีการแจ้งเตือนใหม่' };
  if (e.data) {
    try {
      data = e.data.json();
    } catch (err) {
      data = { title: 'Talib Club', body: e.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };

  e.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification Click Event
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  
  let targetUrl = '/';
  if (e.notification.data && e.notification.data.url) {
    targetUrl = e.notification.data.url;
  }

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open, navigate/focus it
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        const clientPath = new URL(client.url).pathname + new URL(client.url).search;
        if (clientPath === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Otherwise, open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

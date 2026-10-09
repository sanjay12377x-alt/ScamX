/* ==============================================================
   SCAM SHIELD v2.4 - HIGH AVAILABILITY RURAL PWA SERVICE WORKER
   Enables offline functionality for Threat Scanner, Quiz, and Guides
   ============================================================== */

const CACHE_NAME = 'scam-shield-v2.4-offline-v1';

const STATIC_PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png'
];

const CDN_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        await cache.addAll(STATIC_PRECACHE_URLS);
      } catch (err) {
        console.warn('[SW] Precache static partial error:', err);
      }

      for (const url of CDN_URLS) {
        try {
          const res = await fetch(url, { mode: 'cors' });
          if (res && res.status === 200) {
            await cache.put(url, res);
          }
        } catch (cdnErr) {
          console.warn('[SW] Could not precache CDN item during install:', url);
        }
      }

      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET' || url.protocol.startsWith('chrome-extension')) {
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(async () => {
          const cachedRes = await caches.match(req);
          if (cachedRes) return cachedRes;
          return caches.match('/');
        })
    );
    return;
  }

  const isCdn = url.hostname.includes('cdnjs.cloudflare.com') ||
                url.hostname.includes('cdn.tailwindcss.com') ||
                url.hostname.includes('fonts.googleapis.com') ||
                url.hostname.includes('fonts.gstatic.com');

  if (isCdn) {
    event.respondWith(
      caches.match(req).then((cachedRes) => {
        if (cachedRes) {
          fetch(req).then((netRes) => {
            if (netRes && (netRes.status === 200 || netRes.type === 'opaque')) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, netRes));
            }
          }).catch(() => {});
          return cachedRes;
        }

        return fetch(req).then((netRes) => {
          if (netRes && (netRes.status === 200 || netRes.type === 'opaque')) {
            const clone = netRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return netRes;
        }).catch(() => {
          return new Response('', { status: 408, statusText: 'Offline Resource' });
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req).then((netRes) => {
        if (netRes && netRes.status === 200) {
          const clone = netRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return netRes;
      }).catch(async () => {
        if (req.destination === 'image') {
          return caches.match('/icon.svg');
        }
        return new Response('Network unavailable', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

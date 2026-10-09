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

// Critical CDN URLs to precache/cache on demand for offline rural use
const CDN_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// Installation: Cache App Shell and CDN dependencies
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Precache static assets
      try {
        await cache.addAll(STATIC_PRECACHE_URLS);
      } catch (err) {
        console.warn('[SW] Precache static partial error:', err);
      }

      // Precache CDN scripts (catch individually to prevent install abort if offline during initial load)
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

// Activation: Clean up old caches & take immediate control of clients
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

// Fetch Handler with Network-First for HTML and Cache-First for CDNs & Assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore non-GET requests or chrome-extension URLs
  if (req.method !== 'GET' || url.protocol.startsWith('chrome-extension')) {
    return;
  }

  // 1. Navigation requests (HTML pages): Network-First, fall back to cached index.html
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

  // 2. CDN & External Assets (Fonts, Three.js, Tailwind, FontAwesome): Stale-While-Revalidate / Cache-First
  const isCdn = url.hostname.includes('cdnjs.cloudflare.com') ||
                url.hostname.includes('cdn.tailwindcss.com') ||
                url.hostname.includes('fonts.googleapis.com') ||
                url.hostname.includes('fonts.gstatic.com');

  if (isCdn) {
    event.respondWith(
      caches.match(req).then((cachedRes) => {
        if (cachedRes) {
          // Revalidate in background
          fetch(req).then((netRes) => {
            if (netRes && (netRes.status === 200 || netRes.type === 'opaque')) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, netRes));
            }
          }).catch(() => {/* offline, keep cached */});
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

  // 3. Static local assets (icons, images, manifests, scripts): Cache-First
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
        // Fallback for image requests
        if (req.destination === 'image') {
          return caches.match('/icon.svg');
        }
        return new Response('Network unavailable', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

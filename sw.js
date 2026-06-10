// sw.js — offline-first service worker.
//
// Strategy:
//   install : precache the app shell.
//   activate: drop old caches by version.
//   fetch   : stale-while-revalidate for same-origin GETs.
//             That means: serve from cache immediately if present, refresh in
//             the background. Network failures fall back silently to cache.

const CACHE_VERSION = 'czech-flash-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/scheduler.js',
  './js/session.js',
  './js/stats.js',
  './js/views/learn.js',
  './js/views/stats.js',
  './js/views/settings.js',
  './data/seed.json',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return cached || network || new Response('Offline', { status: 503 });
    })
  );
});

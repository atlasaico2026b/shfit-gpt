/* ATLAS SHIFT service worker — one canonical app shell and offline fallback */
const CACHE_NAME = 'atlas-shift-v53-phonebook-number-size';
const APP_FILES = [
  './', './index.html', './styles.css', './module-table-fix.css', './theme-two.css',
  './theme-two-colorful.css', './theme-two.js', './app.js', './modules.js',
  './manifest.json', './icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_FILES.map(async path => {
      try {
        const response = await fetch(path, { cache: 'no-store' });
        if (response.ok) await cache.put(path, response);
      } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('atlas-shift-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const isNavigation = request.mode === 'navigate' || url.pathname.endsWith('/index.html');

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (response.ok) {
        if (isNavigation) await cache.put('./index.html', response.clone());
        else await cache.put(request, response.clone());
      }
      return response;
    } catch (_) {
      const key = isNavigation ? './index.html' : request;
      const cached = await cache.match(key, { ignoreSearch: true }) || await caches.match(key, { ignoreSearch: true });
      if (cached) return cached;
      return new Response(isNavigation ? 'برنامه در حالت آفلاین در دسترس نیست. پس از اتصال دوباره بارگذاری کنید.' : '', {
        status: 503,
        headers: { 'Content-Type': isNavigation ? 'text/plain; charset=utf-8' : 'text/plain', 'Cache-Control': 'no-store' }
      });
    }
  })());
});

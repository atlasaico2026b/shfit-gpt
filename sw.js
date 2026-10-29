/* ATLAS SHIFT service worker — canonical app shell and offline fallback */
const CACHE_NAME = 'atlas-shift-v79-forms-export';
const APP_FILES = [
  './', './index.html',
  './design/tokens.css', './design/styles.css', './design/skins/flat.css', './design/tones.css',
  './design/table-fix.css', './design/settings-tabs.css', './design/phonebook.css', './design/option-manager.css',
  './design/modals-export.css', './design/print.css',
  './design/theme-switch.js',
  './app.js', './modules.js', './theme-two.js', './settings-tabs.js', './menu-manager.js',
  './visual-engine.js', './manifest.json', './icon.svg'
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
    await Promise.all(keys
      .filter(key => key.startsWith('atlas-shift-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
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
        await cache.put(isNavigation ? './index.html' : request, response.clone());
      }
      return response;
    } catch (_) {
      const key = isNavigation ? './index.html' : request;
      const cached = await cache.match(key, { ignoreSearch: true }) ||
        await caches.match(key, { ignoreSearch: true });
      if (cached) return cached;
      return new Response(
        isNavigation ? 'برنامه در حالت آفلاین در دسترس نیست. پس از اتصال دوباره بارگذاری کنید.' : '',
        {
          status: 503,
          headers: {
            'Content-Type': isNavigation ? 'text/plain; charset=utf-8' : 'text/plain',
            'Cache-Control': 'no-store'
          }
        }
      );
    }
  })());
});

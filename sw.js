const CACHE_NAME = 'atlas-shift-v44-ui-enhancements';
const APP_FILES = [
  './',
  './index.html',
  './styles.css',
  './module-table-fix.css',
  './theme-two.css',
  './theme-two-colorful.css',
  './theme-two.js',
  './app.js',
  './modules.js',
  './atlas-shift-enhancements.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && (event.request.mode === 'navigate' || url.pathname.endsWith('/index.html'))) {
    event.respondWith(
      fetch(event.request).then(response => response.clone().text().then(text => {
        const injected = text.includes('atlas-shift-enhancements.js') ? text : text.replace('</body>', '<script src="./atlas-shift-enhancements.js" defer></script></body>');
        return new Response(injected, {status: response.status, statusText: response.statusText, headers: response.headers});
      })).catch(() => caches.match('./index.html'))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});

/* ATLAS SHIFT service worker — one canonical app shell and offline fallback */
const CACHE_NAME = 'atlas-shift-v58-settings-tabs-retry-fix';
const APP_FILES = [
  './', './index.html', './styles.css', './module-table-fix.css', './theme-two.css',
  './theme-two-colorful.css', './theme-two.js', './app.js', './modules.js', './settings-tabs.js',
  './manifest.json', './icon.svg'
];

async function injectSettingsTabs(response) {
  try {
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return response;
    const html = await response.text();
    if (html.includes('settings-tabs.js')) return new Response(html, {status: response.status, statusText: response.statusText, headers: response.headers});
    const injected = html.replace('</body>', '<script src="./settings-tabs.js" defer></script>\\n</body>');
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(injected, {status: response.status, statusText: response.statusText, headers});
  } catch (_) { return response; }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_FILES.map(async path => {
      try {
        const response = await fetch(path, { cache: 'no-store' });
        if (response.ok) await cache.put(path, path === './index.html' ? await injectSettingsTabs(response.clone()) : response);
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
      let response = await fetch(request, { cache: 'no-store' });
      if (response.ok) {
        if (isNavigation) response = await injectSettingsTabs(response);
        await cache.put(isNavigation ? './index.html' : request, response.clone());
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
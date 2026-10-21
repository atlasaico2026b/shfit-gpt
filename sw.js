/* ATLAS SHIFT service worker — resilient offline cache and route handling */
const CACHE_NAME = 'atlas-shift-v46-resilient-routing';
const APP_FILES = [
  './', './index.html', './styles.css', './module-table-fix.css', './theme-two.css',
  './theme-two-colorful.css', './theme-two.js', './app.js', './modules.js',
  './atlas-shift-enhancements.js', './atlas-shift-ui-fix-v2.js',
  './settings.html', './phonebook.html', './manifest.json', './icon.svg'
];

function withRuntimeScripts(response) {
  return response.text().then(function (html) {
    let updated = html;
    if (!updated.includes('atlas-shift-enhancements.js')) {
      updated = updated.replace('</body>', '<script src="./atlas-shift-enhancements.js" defer></script></body>');
    }
    if (!updated.includes('atlas-shift-ui-fix-v2.js')) {
      updated = updated.replace('</body>', '<script src="./atlas-shift-ui-fix-v2.js" defer></script></body>');
    }
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('Cache-Control', 'no-cache');
    return new Response(updated, { status: response.status, statusText: response.statusText, headers });
  });
}

async function getStandalonePage(path) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (response.ok) {
      await cache.put(path, response.clone());
      return response;
    }
  } catch (_) {}
  const cached = await cache.match(path) || await caches.match(path);
  if (cached) return cached;
  return new Response('این بخش فعلاً در دسترس نیست. اتصال را بررسی و دوباره تلاش کنید.', {
    status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache each asset independently: one unavailable optional file must not abort the whole install.
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
    await Promise.all(keys.filter(key => key.startsWith('atlas-shift-') && key !== CACHE_NAME)
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
  if (isNavigation) {
    const view = url.searchParams.get('view');
    if (view === 'settings' || view === 'phonebook') {
      const page = view === 'settings' ? './settings.html' : './phonebook.html';
      event.respondWith(getStandalonePage(page));
      return;
    }

    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) return await withRuntimeScripts(response);
        throw new Error('Navigation request failed');
      } catch (_) {
        const cached = await caches.match('./index.html');
        if (cached) return await withRuntimeScripts(cached);
        return new Response('برنامه در حالت آفلاین در دسترس نیست. پس از اتصال دوباره بارگذاری کنید.', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
        });
      }
    })());
    return;
  }

  // Prefer the current version's cache, then network. Never let a failed cache lookup block the network.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch (_) {
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});

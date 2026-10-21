const CACHE_NAME = 'atlas-shift-v45-route-fix';
const APP_FILES = [
  './', './index.html', './styles.css', './module-table-fix.css', './theme-two.css',
  './theme-two-colorful.css', './theme-two.js', './app.js', './modules.js',
  './atlas-shift-enhancements.js', './atlas-shift-ui-fix-v2.js',
  './settings.html', './phonebook.html', './manifest.json', './icon.svg'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && (event.request.mode === 'navigate' || url.pathname.endsWith('/index.html'))) {
    const view = url.searchParams.get('view');
    if (view === 'settings') { event.respondWith(caches.match('./settings.html')); return; }
    if (view === 'phonebook') { event.respondWith(caches.match('./phonebook.html')); return; }
    event.respondWith(fetch(event.request).then(response => response.clone().text().then(text => {
      let injected = text;
      if (!injected.includes('atlas-shift-enhancements.js')) injected = injected.replace('</body>', '<script src="./atlas-shift-enhancements.js" defer></script></body>');
      if (!injected.includes('atlas-shift-ui-fix-v2.js')) injected = injected.replace('</body>', '<script src="./atlas-shift-ui-fix-v2.js" defer></script></body>');
      return new Response(injected, {status:response.status,statusText:response.statusText,headers:response.headers});
    })).catch(() => caches.match('./index.html'))); return;
  }
  event.respondWith(caches.match(event.request, {ignoreSearch:true}).then(cached => cached || fetch(event.request).then(response => {
    if (response && response.status === 200 && url.origin === self.location.origin) caches.open(CACHE_NAME).then(cache => cache.put(event.request,response.clone()));
    return response;
  })));
});

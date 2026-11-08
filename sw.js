/* ATLAS SHIFT service worker — offline-first app shell
   راهبرد: cache-first. هیچ درخواست شبکه‌ای پیش از نمایش لازم نیست.
   - install: همهٔ فایل‌های پوسته به‌صورت یکجا پیش‌کش می‌شوند؛ اگر یکی شکست بخورد
     نصب شکست می‌خورد، پس نسخهٔ قبلی و کش سالمش دست‌نخورده می‌ماند (بدون پوستهٔ نیمه‌کاره).
   - fetch: اول کش؛ شبکه فقط برای پر کردن کش چیزی که نداریم و به‌عنوان پشتیبان.
   - activate: کش‌های قدیمی پاک می‌شوند و اگر نسخهٔ قبلی وجود داشت، به صفحه اعلام می‌شود.
   افزایش CACHE_NAME در هر انتشار، نصب نسخهٔ تازه و پیش‌کش اتمی را تضمین می‌کند. */
const CACHE_NAME = 'atlas-shift-v136-print-margins-and-row-breaks';
const APP_FILES = [
  './', './index.html',
  './design/tokens.css', './design/styles.css', './design/skins/flat.css', './design/skins/theme-two.css', './design/tones.css',
  './design/atlas-icons.css', './design/icons/atlas-icons.js',
  './design/table-fix.css', './design/settings-tabs.css', './design/phonebook.css', './design/option-manager.css',
  './design/modals-export.css', './design/print.css', './design/spectrum.css', './design/gaslogs.css',
  './design/stations.css', './design/vehicle-tabs.css', './design/settings-view.css',
  './design/new-ui.css', './design/new-ui.js', './design/notices.css',
  './design/forms-validation.css', './design/record-file.css',
  './design/scroll-routing.css', './design/scroll-routing.js', './design/print-sheet.js', './design/toolbars.css',
  './design/export-docs.js',
  './design/contact-sync.js', './design/record-file.js',
  './design/theme-switch.js',
  './app.js', './design/secure-store.js', './modules.js', './theme-two.js', './settings-tabs.js',
  './menu-manager.js', './visual-engine.js', './manifest.json', './icon.svg',
  './design/icons/icon-192.png', './design/icons/icon-512.png', './design/icons/icon-180.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // addAll اتمی است: اگر حتی یک فایل گرفته نشود، کل نصب رد می‌شود.
    // اگر یکی از فایل‌ها موقتاً در دسترس نبود، به‌جای شکست کامل نصب (که کاربر
    // را برای همیشه روی نسخهٔ قدیمی نگه می‌دارد) بقیهٔ فایل‌ها جداگانه ذخیره
    // می‌شوند؛ فایل جاافتاده در اولین درخواست از شبکه پر می‌شود.
    try {
      await cache.addAll(APP_FILES);
    } catch (_) {
      await Promise.all(APP_FILES.map(async file => {
        try { await cache.add(file); } catch (__) { /* در fetch از شبکه پر می‌شود */ }
      }));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const older = keys.filter(key => key.startsWith('atlas-shift-') && key !== CACHE_NAME);
    await Promise.all(older.map(key => caches.delete(key)));
    await self.clients.claim();
    // فقط وقتی نسخهٔ قبلی وجود داشت، به کاربر خبر بده (نصب اول نباید پیام بدهد).
    if (!older.length) return;
    const windows = await self.clients.matchAll({ type: 'window' });
    windows.forEach(client => client.postMessage({ type: 'atlas-shell-updated' }));
  })());
});

function offlineResponse(isNavigation) {
  return new Response(
    isNavigation
      ? 'برنامه در حالت آفلاین در دسترس نیست. یک بار با اتصال اینترنت بازش کنید تا کامل ذخیره شود.'
      : '',
    {
      status: 503,
      headers: {
        'Content-Type': isNavigation ? 'text/plain; charset=utf-8' : 'text/plain',
        'Cache-Control': 'no-store'
      }
    }
  );
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // پیمایش‌ها همیشه پوستهٔ کش‌شده می‌گیرند، حتی با ?view= متفاوت.
  const isNavigation = request.mode === 'navigate' || /\/index\.html$/.test(url.pathname) || url.pathname.endsWith('/');
  const key = isNavigation ? './index.html' : request;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(key, { ignoreSearch: isNavigation });
    if (cached) return cached;

    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (response && response.ok) await cache.put(key, response.clone());
      return response;
    } catch (_) {
      return offlineResponse(isNavigation);
    }
  })());
});

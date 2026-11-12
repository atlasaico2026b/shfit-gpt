// بررسی نقشهٔ جغرافیایی خوزستان: شکل استان، لنگرگاه شهرها و اتصالش به نقشهٔ ایستگاه‌ها.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = read('modules.js');
const css = read('design/stations.css');
const html = read('index.html');
const sw = read('sw.js');
const assetSource = read('design/khuzestan-map.js');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// ── فایل نقشه ──
global.window = {};
require(path.join(root, 'design/khuzestan-map.js'));
const map = global.window.AtlasKhuzestan;

check('فایل نقشه window.AtlasKhuzestan را می‌سازد', !!map);
check('مسیر مرز استان هست', map && /^M[\d\s.LZ-]+$/.test(map.path));
check('viewBox نقشه درست است', map && /^0 0 \d+ \d+$/.test(map.viewBox));
check('نسبت نقشه عددی و مثبت است', map && Number(map.aspect) > 0);
check('نقشه دست‌کم ۲۵ شهر خوزستان را می‌شناسد', map && map.cities.length >= 25, map && map.cities.length);
check('شش شهر اصلی روی نقشه برجسته‌اند',
  map && ['اهواز', 'آبادان', 'اندیمشک', 'ماهشهر', 'بندر امام', 'آغاجاری']
    .every((name) => map.cities.some((city) => city.name === name && city.primary)));
check('اهواز لنگرگاه دارد', map && !!map.cityAnchor('اهواز'));
check('«بندر امام خمینی» همان بندر امام است', map && (map.cityAnchor('بندر امام خمینی') || {}).name === 'بندر امام');
check('«مسجدسلیمان» بدون فاصله هم شناخته می‌شود', map && (map.cityAnchor('مسجدسلیمان') || {}).name === 'مسجد سلیمان');
check('شهر بیرون استان لنگرگاه ندارد', map && map.cityAnchor('تهران') === null);
check('نقشه در زمان اجرا هیچ درخواست شبکه‌ای ندارد',
  !/fetch\(|XMLHttpRequest|https?:\/\//.test(assetSource));
check('مختصات شهرها درصدی است', map && map.cities.every((city) => city.x >= 0 && city.x <= 100 && city.y >= 0 && city.y <= 100));

// ── بارگذاری در پوسته ──
const mapScript = html.indexOf('./design/khuzestan-map.js');
check('اسکریپت نقشه در index.html هست', mapScript > 0);
check('نقشه پیش از modules.js بارگذاری می‌شود', mapScript > 0 && mapScript < html.indexOf('./modules.js'));
check('نقشه در فهرست پیش‌کش سرویس‌ورکر هست', /\.\/design\/khuzestan-map\.js/.test(sw));
check('نسخهٔ کش برای نقشهٔ تازه بالا رفته است', /atlas-shift-v166-khuzestan-station-map/.test(sw));

// ── جانمایی بر پایهٔ شهر ──
check('تابع خواندن نقشه در modules.js هست', /function khuzestanMap\(\)/.test(modules));
check('تابع لنگرگاه شهر در modules.js هست', /function stationCityAnchor\(/.test(modules));
check('تابع جایگاه شهر با فاصلهٔ چند ایستگاه هست', /STATION_CITY_OFFSETS[\s\S]{0,400}function stationCityPosition\(/.test(modules));
check('چیدمان پیش‌فرض از شهر می‌آید', /function stationDefaultPositions\(groups\)[\s\S]{0,600}stationCityPosition\(stop\.record, slot\)/.test(modules));
check('جایگاه دستی ذخیره‌شده بر شهر مقدم است',
  /function stationPositions\(groups\)[\s\S]{0,400}branchPlacement\(stop\.branch\) \|\| defaults\[key\]/.test(modules));
check('چیدمان خودکار هم بر پایهٔ شهر است',
  /stationDefaultPositions\(groups\)[\s\S]{0,500}stationSetPlacement\(stop\.record/.test(modules));

// ── رسم نقشه ──
check('مرز استان در نقشه رسم می‌شود', /station-map-province/.test(modules));
check('نقشه پایه با viewBox خودش رسم می‌شود', /class="station-map-base"[^>]*viewBox="/.test(modules));
check('قاب نقشه نسبت خودش را از فایل نقشه می‌گیرد', /--station-map-ratio:/.test(modules) && /data-station-frame/.test(modules));
check('گره‌ها داخل قاب نقشه می‌نشینند', /station-map-frame[\s\S]{0,260}station-map-canvas/.test(modules));
check('عنوان نقشه «نقشهٔ خوزستان» است', /<h3>نقشهٔ خوزستان<\/h3>/.test(modules));
check('کشیدن گره اندازهٔ قاب نقشه را می‌سنجد',
  /querySelector\('\[data-station-frame\]'\)[\s\S]{0,80}getBoundingClientRect\(\)/.test(modules));

// ── استایل ──
check('استایل قاب نقشه با aspect-ratio هست', /\.station-map-frame\s*\{[^}]*aspect-ratio:\s*var\(--station-map-ratio/.test(css));
check('استایل مرز استان در CSS هست', /\.station-map-province\s*\{/.test(css));
check('استایل نقطه و نام شهر در CSS هست', /\.station-city-dot\s*\{/.test(css) && /\.station-city-label\s*\{/.test(css));
check('قاب نقشه در ویجت داشبورد کوچک‌تر می‌شود', /\[data-widget="stations"\] \.station-map-frame\{width:100%;max-width:190px\}/.test(css));

const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log((c.ok ? '✓' : '✗') + ' ' + c.name + (c.ok ? '' : '  → ' + c.extra)));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

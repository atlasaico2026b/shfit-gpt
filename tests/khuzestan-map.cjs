// بررسی نقشهٔ جغرافیایی خوزستان: شکل استان، لنگرگاه واقعی شهرها، بزرگ‌نمایی،
// تنظیم نمایش شهرها و دانلود فایل نقشه.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = read('modules.js');
const css = read('design/stations.css');
const baseCss = read('design/styles.css');
const html = read('index.html');
const sw = read('sw.js');
const assetSource = read('design/khuzestan-map.js');
const exportSource = read('design/map-export.js');

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
check('نقشه همهٔ شهرهای خوزستان را می‌شناسد (≥ ۴۵)', map && map.cities.length >= 45, map && map.cities.length);
check('هر شهر مختصات جغرافیایی واقعی دارد',
  map && map.cities.every((city) => Number.isFinite(city.lat) && Number.isFinite(city.lon)));
check('مختصات شهرها درصدی و درون قاب است',
  map && map.cities.every((city) => city.x >= 0 && city.x <= 100 && city.y >= 0 && city.y <= 100));
check('هر شهر ردهٔ نمایش دارد', map && map.cities.every((city) => [1, 2, 3, 4].includes(city.tier)));
check('شهرهای اصلی روی نقشه برجسته‌اند',
  map && ['اهواز', 'آبادان', 'اندیمشک', 'ماهشهر', 'بندر امام']
    .every((name) => map.cities.some((city) => city.name === name && city.primary)));
check('آغاجاری هم روی نقشه هست', map && map.cities.some((city) => city.name === 'آغاجاری'));
check('اهواز لنگرگاه دارد', map && !!map.cityAnchor('اهواز'));
check('«بندر امام خمینی» همان بندر امام است', map && (map.cityAnchor('بندر امام خمینی') || {}).name === 'بندر امام');
check('«مسجدسلیمان» بدون فاصله هم شناخته می‌شود', map && (map.cityAnchor('مسجدسلیمان') || {}).name === 'مسجد سلیمان');
check('شهر بیرون استان لنگرگاه ندارد', map && map.cityAnchor('تهران') === null);
check('نقشه در زمان اجرا هیچ درخواست شبکه‌ای ندارد',
  !/fetch\(|XMLHttpRequest|https?:\/\//.test(assetSource));
check('فهرست استان‌های قابل دانلود هست', map && Array.isArray(map.provinces) && map.provinces.length >= 1);
check('استان خوزستان از راه شناسه پیدا می‌شود', map && (map.province('khuzestan') || {}).name === 'خوزستان');

// ── موقعیت واقعی: هر نقطه باید داخل مرز استان بیفتد ──
const outline = map.path.replace(/Z$/, '').split('L').map((chunk) => chunk.replace(/^M/, '').split(' ').map(Number));
function inOutline(x, y) {
  let hit = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i], [xj, yj] = outline[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const box = (map.viewBox || '0 0 1000 1262').split(' ').map(Number);
const outside = map.cities.filter((city) => !inOutline(city.x * box[2] / 100, city.y * box[3] / 100));
check('همهٔ نقطه‌های شهر داخل مرز استان می‌افتند', outside.length === 0,
  outside.map((city) => city.name + '@' + city.x + ',' + city.y).join(' | '));

// ── بارگذاری در پوسته ──
const mapScript = html.indexOf('./design/khuzestan-map.js');
const exportScript = html.indexOf('./design/map-export.js');
check('اسکریپت نقشه در index.html هست', mapScript > 0);
check('اسکریپت خروجی نقشه در index.html هست', exportScript > 0);
check('نقشه پیش از modules.js بارگذاری می‌شود', mapScript > 0 && mapScript < html.indexOf('./modules.js'));
check('نقشه در فهرست پیش‌کش سرویس‌ورکر هست', /\.\/design\/khuzestan-map\.js/.test(sw));
check('خروجی نقشه در فهرست پیش‌کش سرویس‌ورکر هست', /\.\/design\/map-export\.js/.test(sw));
check('نسخهٔ کش برای نقشهٔ تازه بالا رفته است', /atlas-shift-v172-city-tiers-drag/.test(sw));

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
check('عنوان نقشه از استان فعال ساخته می‌شود', /<h3>نقشهٔ ' \+ esc\(provinceName\) \+ '<\/h3>/.test(modules));
check('کشیدن گره اندازهٔ قاب نقشه را می‌سنجد',
  /pointFromEvent\(event\)[\s\S]{0,80}getBoundingClientRect\(\)/.test(modules));
// رگرسیون: پیش‌تر عرض بدون‌زوم (rect.width / state.scale) مبنای محاسبه بود و
// حرکت گره در حالت زوم به‌اندازهٔ ضریب زوم درشت می‌شد. حالا باید بر عرض بصری
// (rect.width که خودش شامل زوم است) تقسیم شود تا با زوم دقیق‌تر شود.
check('کشیدن گره با بزرگ‌نمایی دقیق‌تر می‌شود (تقسیم بر عرض بصری)',
  /pointFromEvent\(event\)[\s\S]{0,1400}\/ rect\.width\) \* 100 \+ 50/.test(modules) &&
  !/const left = rect\.left \+ rect\.width \/ 2 - width \/ 2/.test(modules));

// ── همهٔ شهرها و رده‌بندی ──
check('همهٔ شهرهای فعال رسم می‌شوند', /mapVisibleCities\(\)[\s\S]{0,120}cities\.map\(function \(city\)/.test(modules));
check('هر شهر ردهٔ نمایش را در مارک‌آپ دارد', /data-tier="' \+ tier \+ '"/.test(modules));
check('شهرهای پنهان‌شده در تنظیمات ذخیره می‌شوند', /settings\.hiddenCities/.test(modules));
check('تنظیم نمایش نام شهرها ذخیره می‌شود', /settings\.showLabels/.test(modules));
check('گزینهٔ نمایش همهٔ نام‌ها در هر بزرگ‌نمایی هست', /settings\.alwaysLabels/.test(modules));
check('تب تنظیمات نقشه وجود دارد', /id: 'map', title: 'نقشه و شهرها'/.test(modules));
check('پنل تنظیمات نقشه ساخته می‌شود', /function mapSettingsMarkup\(\)/.test(modules));
check('کادر انتخاب هر شهر در تنظیمات هست', /data-map-city="/.test(modules));
check('دکمهٔ انتخاب همه/هیچ‌کدام هست', /data-map-cities="all"/.test(modules) && /data-map-cities="none"/.test(modules));

// ── بزرگ‌نمایی ──
check('کنترلر بزرگ‌نمایی نقشه هست', /function createMapZoom\(map, options\)/.test(modules));
check('چرخ ماوس بزرگ‌نمایی می‌کند', /addEventListener\('wheel', onWheel, \{ passive: false[^}]*\}\)/.test(modules));
check('شنونده‌های نقشه در بازسازی ویجت آزاد می‌شوند', /map\._atlasWired\.abort\(\)/.test(modules));
check('کشیدن پس‌زمینه نقشه را جابه‌جا می‌کند', /function onDown\(event\)[\s\S]{0,900}pan = \{ id: event\.pointerId/.test(modules));
check('دو انگشت (پینچ) بزرگ‌نمایی می‌کند', /function onMove\(event\)[\s\S]{0,700}pinch\.scale \* \(distance \/ pinch\.distance\)/.test(modules));
check('دکمه‌های + و − و بازنشانی هست', /data-map-zoom="in"/.test(modules) && /data-map-zoom="out"/.test(modules) && /data-map-zoom="reset"/.test(modules));
check('بزرگ‌نمایی، ردهٔ نمایش شهرها را عوض می‌کند', /function mapZoomTier\(scale\)/.test(modules) && /map\.dataset\.zoom = String\(mapZoomTier/.test(modules));
check('کشیدن گره در حالت بزرگ‌نمایی هم درست حساب می‌شود', /const point = zoom \? zoom\.pointFromEvent\(event\)/.test(modules));
check('ویجت داشبورد هم بزرگ‌نمایی دارد', /data-widget="stations"[\s\S]{0,1400}data-map-zoom="in"/.test(html));

// ── دانلود فایل نقشه ──
check('ماژول خروجی نقشه window.AtlasMapExport را می‌سازد', /window\.AtlasMapExport = \{/.test(exportSource));
check('خروجی SVG مستقل ساخته می‌شود', /function svg\(province, options\)/.test(exportSource));
check('خروجی JSON ساخته می‌شود', /function json\(provinces\)/.test(exportSource));
check('خروجی هیچ وابستگی بیرونی ندارد', !/https?:\/\/(?!www\.w3\.org)/.test(exportSource));
check('دکمهٔ دانلود در پنل نقشه هست', /data-map-download="svg"/.test(modules));
check('دانلود از تنظیمات نقشه هم انجام می‌شود', /data-map-download="json"/.test(modules));

// ── استایل ──
check('استایل قاب نقشه با aspect-ratio هست', /\.station-map-frame\s*\{[^}]*aspect-ratio:\s*var\(--station-map-ratio/.test(css));
check('قاب نقشه بزرگ‌تر از قبل است (سقف ارتفاع)', /width:min\(100%, calc\(min\(84vh, 1040px\)/.test(css));
check('قاب نقشه با متغیرهای بزرگ‌نمایی جابه‌جا می‌شود', /transform:translate\(var\(--map-x/.test(css));
check('استایل مرز استان در CSS هست', /\.station-map-province\s*\{/.test(css));
check('استایل نقطه و نام شهر در CSS هست', /\.station-city-dot\s*\{/.test(css) && /\.station-city-label\s*\{/.test(css));
check('نام شهرها پله‌پله با بزرگ‌نمایی آشکار می‌شوند', /\.station-map\[data-zoom="1"\] \.station-city\[data-tier="2"\]/.test(css));
check('اندازهٔ نام هر رده از متغیرهای --label-t* می‌آید', /--label-t1/.test(css) && /--label-t4/.test(css));
check('نامی که روی نام مهم‌تری افتاده پنهان می‌شود', /\.station-city\.is-culled \.station-city-label\{display:none\}/.test(css));

// اندازهٔ نام‌ها را از خود modules.js می‌گیریم تا رفتار واقعی سنجیده شود.
const sizingSource = modules.slice(
  modules.indexOf('const MAP_LABEL_BASE'),
  modules.indexOf('// چند ایستگاه در یک شهر')
);
const sizing = new Function(sizingSource + '\nreturn { mapLabelSizes: mapLabelSizes };')();
const sizeAt1 = sizing.mapLabelSizes(1);
const sizeAt4 = sizing.mapLabelSizes(4);
const screen = (sizes, tier, scale) => sizes[tier] * scale;
check('نام شهرهای اصلی در نمای دور بزرگ است', screen(sizeAt1, 1, 1) >= 24, screen(sizeAt1, 1, 1));
check('نام شهرهای اصلی با بزرگ‌نمایی کوچک‌تر می‌شود',
  screen(sizeAt4, 1, 4) < screen(sizeAt1, 1, 1) * 0.75, screen(sizeAt4, 1, 4));
check('نام رده‌های پایین‌تر با بزرگ‌نمایی بزرگ‌تر می‌شود',
  screen(sizeAt4, 2, 4) > screen(sizing.mapLabelSizes(1.5), 2, 1.5),
  screen(sizeAt4, 2, 4));
check('اندازهٔ نوشته با بزرگ‌نمایی ثابت نمی‌ماند', /--map-inv/.test(css) && !/font-size:calc\(22px \* var\(--map-inv/.test(css));
check('ابزار بزرگ‌نمایی استایل دارد', /\.station-map-zoom-btn\s*\{/.test(css));
check('قاب نقشه در ویجت داشبورد اندازهٔ خودش را دارد', /\[data-widget="stations"\] \.station-map-frame\{width:100%;max-width:min\(100%,420px\)\}/.test(css));
check('قاب نقشه در ویجت داشبورد تا پهنای کارت بزرگ می‌شود', /\[data-widget="stations"\]\[data-size="medium"\] \.station-map-frame\{max-width:min\(100%,560px\)\}/.test(css));
check('هیچ قاعدهٔ قدیمی ارتفاع ثابت روی .station-map نمانده', !/\.station-map\s*\{[^}]*height:\s*\d+px/.test(baseCss));
check('پس‌زمینهٔ راه‌راه قدیمی نقشه حذف شده', !/\.station-map:before\s*\{/.test(baseCss));
check('ویجت داشبورد نقشه را فقط نمایش می‌دهد (بدون جابه‌جایی گره)', /const readOnly = !!map\.closest\('\[data-widget="stations"\]'\)/.test(modules) && /if \(!drag \|\| readOnly\) return;/.test(modules));
check('گره‌های ویجت داشبورد نشانگر دست‌کشیدن ندارند', /\[data-widget="stations"\] \.station-node\{cursor:pointer\}/.test(css));
check('استایل تنظیمات شهرها هست', /\.map-city-row\s*\{/.test(css) && /\.map-province-row\s*\{/.test(css));

// ── خروجی فایل نقشه ──
global.window = { AtlasKhuzestan: map };
global.document = { createElement: () => ({ style: {}, appendChild() {}, remove() {}, click() {}, setAttribute() {} }), body: { appendChild() {} } };
global.Blob = class {};
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
require(path.join(root, 'design/map-export.js'));
const svgOut = global.window.AtlasMapExport.svg(map);
check('خروجی SVG ساخته می‌شود', svgOut.length > 2000, svgOut.length);
check('خروجی SVG سند کامل است', /^<\?xml[\s\S]*<\/svg>\n$/.test(svgOut));
check('خروجی SVG همهٔ شهرها را برچسب می‌زند',
  (svgOut.match(/<text/g) || []).length >= map.cities.length, (svgOut.match(/<text/g) || []).length);
const bundle = JSON.parse(global.window.AtlasMapExport.json([map]));
check('خروجی JSON استان و شهرها را دارد',
  bundle.provinces.length === 1 && bundle.provinces[0].cities.length === map.cities.length);

const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log((c.ok ? '✓' : '✗') + ' ' + c.name + (c.ok ? '' : '  → ' + c.extra)));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

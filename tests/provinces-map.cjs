// بررسی نقشهٔ همهٔ استان‌ها: انتخاب استان، شکل مرز هر استان، لنگرگاه واقعی شهرها
// و مسیر رسیدن داده به پنل نقشه و تنظیمات.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = read('modules.js');
const css = read('design/stations.css');
const html = read('index.html');
const sw = read('sw.js');
const assetSource = read('design/provinces-map.js');
const exportSource = read('design/map-export.js');
const builder = read('tools/build-province-maps.py');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// ── دادهٔ نقشه ──
global.window = {};
require(path.join(root, 'design/provinces-map.js'));
const api = global.window.AtlasProvinces;

check('فایل نقشه window.AtlasProvinces را می‌سازد', !!api);
const provinces = (api && api.provinces) || [];
check('همهٔ ۳۱ استان ایران در برنامه هست', provinces.length === 31, provinces.length);
check('شناسهٔ استان‌ها یکتاست', new Set(provinces.map((p) => p.id)).size === provinces.length);
check('نام فارسی همهٔ استان‌ها هست', provinces.every((p) => /[\u0600-\u06FF]/.test(p.name || '')));
check('مرز هر استان مسیر SVG معتبر است',
  provinces.every((p) => /^M[\d\s.MLZ-]+$/.test(p.path || '')),
  provinces.filter((p) => !/^M[\d\s.MLZ-]+$/.test(p.path || '')).map((p) => p.id).join(','));
check('viewBox و نسبت تصویر هر استان درست است',
  provinces.every((p) => /^0 0 \d+ \d+$/.test(p.viewBox || '') && Number(p.aspect) > 0));
check('مرکز جغرافیایی هر استان ثبت شده است',
  provinces.every((p) => p.center && Number.isFinite(p.center.lat) && Number.isFinite(p.center.lon)));
check('شهرهای هر استان مختصات واقعی دارند',
  provinces.every((p) => (p.cities || []).length > 0 &&
    p.cities.every((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon))));
check('مختصات شهرها درصدی و درون قاب است',
  provinces.every((p) => p.cities.every((c) => c.x >= 0 && c.x <= 100 && c.y >= 0 && c.y <= 100)));
check('هر استان پایتخت/شهر اصلی برجسته دارد', provinces.every((p) => p.cities.some((c) => c.tier === 1)),
  provinces.filter((p) => !p.cities.some((c) => c.tier === 1)).map((p) => p.id).join(','));
check('همهٔ شهرهای ایران روی نقشه آمده‌اند (≥ ۱۰۰۰)', provinces.reduce((n, p) => n + p.cities.length, 0) >= 1000,
  provinces.reduce((n, p) => n + p.cities.length, 0));

// ── هر نقطه باید داخل مرز استان خودش بیفتد ──
function ringsOf(province) {
  return String(province.path || '').split('Z').filter(Boolean).map((chunk) =>
    chunk.replace(/^M/, '').split('L').map((pair) => pair.trim().split(' ').map(Number)));
}
function insideProvince(province, x, y) {
  let hit = false;
  ringsOf(province).forEach((ring) => {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  });
  return hit;
}
const outside = [];
provinces.forEach((province) => {
  const box = String(province.viewBox).split(' ').map(Number);
  province.cities.forEach((city) => {
    if (!insideProvince(province, city.x * box[2] / 100, city.y * box[3] / 100)) outside.push(province.id + ':' + city.name);
  });
});
check('همهٔ نقطه‌های شهر داخل مرز استان خودشان می‌افتند', outside.length === 0, outside.slice(0, 6).join(' | '));

// ── جست‌وجو ──
check('استان با شناسه پیدا می‌شود', (api.province('fars') || {}).name === 'فارس');
check('استان خوزستان از راه شناسه پیدا می‌شود', (api.province('khuzestan') || {}).name === 'خوزستان');
check('شناسهٔ ناشناخته استان null می‌دهد', api.province('atlantis') === null);
check('شهر با نام پیدا می‌شود', (api.city('مشهد') || {}).name === 'مشهد');
check('استانِ شهر از روی نام پیدا می‌شود', (api.provinceOfCity('مشهد') || {}).id === 'razavi-khorasan');
check('شهر ناشناخته استان ندارد', api.provinceOfCity('جای نامعلوم') === null);
check('شهر داخل یک استان مشخص پیدا می‌شود', (api.cityIn('fars', 'شیراز') || {}).name === 'شیراز');
check('شهر استان دیگر در جست‌وجوی محدود نمی‌آید', api.cityIn('fars', 'مشهد') === null);
check('نرمال‌سازی «ي» و «ك» عربی را می‌پوشاند',
  api.normalize('مسجدسليمان') === api.normalize('مسجد سلیمان'));
check('نقشه در زمان اجرا هیچ درخواست شبکه‌ای ندارد',
  !/fetch\(|XMLHttpRequest|https?:\/\//.test(assetSource));
check('سازندهٔ نقشه در مخزن هست', /geoBoundaries/.test(builder) && /overpass/.test(builder));

// ── بارگذاری در پوسته ──
const mapScript = html.indexOf('./design/provinces-map.js');
check('اسکریپت نقشه در index.html هست', mapScript > 0);
check('نقشه پیش از modules.js بارگذاری می‌شود', mapScript > 0 && mapScript < html.indexOf('./modules.js'));
check('نقشه در فهرست پیش‌کش سرویس‌ورکر هست', /\.\/design\/provinces-map\.js/.test(sw));
check('نسخهٔ کش برای نقشهٔ تازه بالا رفته است', /atlas-shift-v169-map-roads/.test(sw));

// ── پیوند با برنامه ──
check('فهرست استان‌ها در modules.js خوانده می‌شود', /function provinceList\(\)/.test(modules));
check('استان فعال از تنظیمات می‌آید', /settings\.province/.test(modules));
check('انتخاب استان در رابط هست', /data-map-province-select/.test(modules));
check('فهرست کشویی استان‌ها ساخته می‌شود', /function provinceSelectMarkup\(/.test(modules));
check('نقشهٔ استان فعال رسم می‌شود', /function provinceMap\(\)/.test(modules) && /function khuzestanMap\(\) \{ return provinceMap\(\); \}/.test(modules));
check('ایستگاه‌ها بر اساس استان صافی می‌شوند', /function stationMapRecords\(\)/.test(modules));
check('استان ایستگاه از فرم یا شهر پیدا می‌شود', /function stationProvince\(record\)/.test(modules));
check('پنل نقشه فقط ایستگاه‌های استان را می‌کشد', /stationMapMarkup\(stationMapRecords\(\)\)/.test(modules));
check('فیلد «استان» در فرم ایستگاه هست', /key:'province',label:'استان',type:'select',source:'provinces'/.test(modules));
check('گزینه‌های فیلد استان از فهرست استان‌ها می‌آید', /field\.source === 'provinces'/.test(modules));
check('دانلود نقشهٔ استان فعال کار می‌کند', /data-map-download-province/.test(modules) && /dataset\.mapDownloadProvince/.test(modules));
check('خروجی نقشه از فهرست استان‌های تازه می‌خواند',
  /window\.AtlasProvinces/.test(exportSource) && /AtlasKhuzestan/.test(exportSource));
check('استایل فهرست انتخاب استان هست', /\.map-province-select\s*\{/.test(css));

// ── خروجی SVG یک استان چندتکه ──
global.window = { AtlasProvinces: api };
global.document = { createElement: () => ({ style: {}, appendChild() {}, remove() {}, click() {}, setAttribute() {} }), body: { appendChild() {} } };
global.Blob = class {};
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
require(path.join(root, 'design/map-export.js'));
const hormozgan = api.province('hormozgan');
const svgOut = global.window.AtlasMapExport.svg(hormozgan);
check('چند استان در فهرست خروجی هست', global.window.AtlasMapExport.provinces().length === 31);
check('خروجی SVG استان جزیره‌ای همهٔ شهرها را دارد',
  (svgOut.match(/<text/g) || []).length >= hormozgan.cities.length,
  (svgOut.match(/<text/g) || []).length + '/' + hormozgan.cities.length);
check('خروجی SVG نام استان را دارد', svgOut.indexOf('نقشهٔ استان هرمزگان') > 0);

const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log((c.ok ? '✓' : '✗') + ' ' + c.name + (c.ok ? '' : '  → ' + c.extra)));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

// بررسی نقشهٔ چنداستانی: با تیک‌زدن چند استان، مرزها و شهرهای همه روی یک بوم
// مشترک جغرافیایی می‌نشینند و هیچ مختصاتی بیرون از قاب نمی‌افتد.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = read('modules.js');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// ── دادهٔ واقعی استان‌ها ──
global.window = {};
require(path.join(root, 'design/provinces-map.js'));
const api = global.window.AtlasProvinces;
check('فهرست استان‌ها بارگذاری شد', api && api.provinces.length === 31, api && api.provinces.length);

// ── همان کد برنامه، با وابستگی‌های تزریقی ──
const source = modules.slice(
  modules.indexOf('function activeProvinceIds()'),
  modules.indexOf('// نام قدیمی این تابع')
);
check('کد نقشهٔ چنداستانی پیدا شد', source.length > 500, source.length);

function build(selected) {
  const settings = { province: selected[0], provinces: selected.slice() };
  const factory = new Function(
    'mapSettings', 'provinceFind', 'provinceList', 'provinceApi',
    source + '\nreturn { provinceMap: provinceMap, activeProvinceIds: activeProvinceIds, provinceGeoFit: provinceGeoFit };'
  );
  return factory(
    () => settings,
    (id) => api.province(id),
    () => api.provinces,
    () => api
  );
}

// ── یک استان: همان نقشهٔ خودش ──
const single = build(['khuzestan']).provinceMap();
check('با یک استان، نقشهٔ همان استان برمی‌گردد', single && single.id === 'khuzestan', single && single.id);
check('نقشهٔ تک‌استانی viewBox خودش را دارد', single && single.viewBox === api.province('khuzestan').viewBox);

// ── سه استان با هم ──
const ids = ['khuzestan', 'chaharmahal-bakhtiari', 'isfahan'];
const multi = build(ids).provinceMap();
check('با چند استان، نقشهٔ ترکیبی ساخته می‌شود', multi && multi.id === 'composite', multi && multi.id);
check('نام همهٔ استان‌ها در عنوان نقشه هست',
  multi && ids.every((id) => multi.name.indexOf(api.province(id).name) >= 0), multi && multi.name);

const box = String(multi.viewBox).split(/\s+/).map(Number);
const width = box[2];
const height = box[3];
check('viewBox ترکیبی معتبر است', box.length === 4 && box[0] === 0 && box[1] === 0 && width > 0 && height > 0, multi.viewBox);
check('نسبت تصویر با viewBox می‌خواند', Math.abs(multi.aspect - width / height) < 1e-6, multi.aspect);

// ── مسیر مرزها ──
check('مسیر مرز هر سه استان رسم شده است', (multi.path.match(/M/g) || []).length >= 3, (multi.path.match(/M/g) || []).length);
check('مسیر ترکیبی هیچ NaN ندارد', !/NaN|Infinity|undefined/.test(multi.path));
const coords = (multi.path.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
let outOfBox = 0;
for (let i = 0; i < coords.length; i += 2) {
  if (coords[i] < -1 || coords[i] > width + 1 || coords[i + 1] < -1 || coords[i + 1] > height + 1) outOfBox += 1;
}
check('همهٔ نقاط مرز داخل قاب مشترک‌اند', outOfBox === 0, outOfBox + ' نقطه بیرون');

// ── شهرها ──
const expected = ids.reduce((sum, id) => sum + api.province(id).cities.length, 0);
check('شهرهای هر سه استان روی نقشه آمده‌اند', multi.cities.length === expected, multi.cities.length + '/' + expected);
check('هر شهر استان خودش را می‌شناسد',
  multi.cities.every((city) => ids.indexOf(city.provinceId) >= 0));
check('مختصات همهٔ شهرها داخل قاب است',
  multi.cities.every((city) => city.x >= 0 && city.x <= 100 && city.y >= 0 && city.y <= 100));

// ── لنگرگاه شهر برای ایستگاه‌ها ──
const ahvaz = multi.cityIn('اهواز');
check('شهر خوزستان روی نقشهٔ ترکیبی پیدا می‌شود', ahvaz && ahvaz.provinceId === 'khuzestan', ahvaz && ahvaz.provinceId);
const shahrekord = multi.cityIn('شهرکرد');
check('شهر چهارمحال روی نقشهٔ ترکیبی پیدا می‌شود', shahrekord && shahrekord.provinceId === 'chaharmahal-bakhtiari', shahrekord && shahrekord.provinceId);
const isfahan = multi.cityIn('اصفهان');
check('شهر اصفهان روی نقشهٔ ترکیبی پیدا می‌شود', isfahan && isfahan.provinceId === 'isfahan', isfahan && isfahan.provinceId);
check('شهر ناشناس لنگرگاه ندارد', multi.cityIn('جایی که نیست') === null);

// ── ترتیب جغرافیایی: اصفهان شمال‌شرقی‌تر از اهواز است ──
check('جای شهرها با جغرافیا می‌خواند',
  isfahan && ahvaz && isfahan.y < ahvaz.y && isfahan.x > ahvaz.x,
  isfahan && ahvaz ? 'isfahan(' + isfahan.x + ',' + isfahan.y + ') ahvaz(' + ahvaz.x + ',' + ahvaz.y + ')' : '');

// ── نگاشت جغرافیایی هر استان دقیق است ──
const fit = build(ids).provinceGeoFit(api.province('khuzestan'));
const sample = api.province('khuzestan').cities[0];
const lon = fit.lon.offset + fit.lon.slope * sample.x;
const lat = fit.lat.offset + fit.lat.slope * sample.y;
check('نگاشت درصد شهر به مختصات واقعی درست است',
  Math.abs(lon - sample.lon) < 0.01 && Math.abs(lat - sample.lat) < 0.01,
  lon.toFixed(3) + '/' + sample.lon + ' · ' + lat.toFixed(3) + '/' + sample.lat);

const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log((c.ok ? '✓' : '✗') + ' ' + c.name + (c.ok ? '' : '  → ' + c.extra)));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

// بررسی «به‌روزرسانی آنی داشبورد»: هر تغییری در داده‌ها یا تنظیمات (از جمله
// تیک‌زدن چند استان برای نقشه) باید همان لحظه در داشبورد دیده شود، نه با رفرش صفحه.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = read('modules.js');
const app = read('app.js');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// ── قلاب مرکزی ذخیره ──
check('تابع تشخیص داشبوردِ دیده‌شده وجود دارد', /function dashboardVisible\(\)/.test(modules));
check('داشبورد پنهان (route-hidden) به‌عنوان دیده‌شده حساب نمی‌شود',
  /classList\.contains\('route-hidden'\)/.test(modules));
check('تابع تازه‌سازی مشروط داشبورد وجود دارد', /function refreshDashboardIfVisible\(\)/.test(modules));

const saveStateBody = modules.slice(
  modules.indexOf('function saveState()'),
  modules.indexOf('// ── شبکهٔ ایمنی ذخیره')
);
check('saveState پس از ذخیرهٔ موفق داشبورد را تازه می‌کند',
  /\.then\(function \(saved\) \{\s*if \(saved\) refreshDashboardIfVisible\(\);/.test(saveStateBody),
  saveStateBody.slice(-260));
check('خطای داشبورد ذخیره‌سازی را نمی‌شکند',
  /try \{ refreshDashboard\(\); \} catch \(error\)/.test(modules));

// ── مسیر‌دهی: رسیدن به داشبورد همیشه تازه‌سازی می‌کند ──
const routeBody = app.slice(app.indexOf('function renderRoute('), app.indexOf('window.ATLAS_ROUTE=renderRoute'));
check('renderRoute هنگام ورود به داشبورد آن را تازه می‌کند',
  /if\(isDashboard&&window\.ATLAS_MODULES&&typeof window\.ATLAS_MODULES\.refreshDashboard==='function'\)window\.ATLAS_MODULES\.refreshDashboard\(\);/.test(routeBody));

// ── انتخاب استان‌ها باید داشبورد را هم به‌روز کند ──
const pickerBody = modules.slice(
  modules.indexOf("const picker = event.target.closest && event.target.closest('[data-map-province-pick]')"),
  modules.indexOf('// پنهان یا آشکار کردن دسته‌جمعی همهٔ شهرهای یک رده')
);
check('تیک‌زدن استان، تنظیمات را ذخیره می‌کند', /await saveState\(\)/.test(pickerBody));
check('تیک‌زدن استان، نمای جاری را بازسازی می‌کند', /render\(currentView === 'settings' \? 'settings' : 'stations'/.test(pickerBody));

// ── نقشهٔ داشبورد از همان نقشهٔ چنداستانی می‌آید ──
const innerBody = modules.slice(
  modules.indexOf('function stationMapInner(records)'),
  modules.indexOf('function stationMapZoomTools()')
);
check('نقشهٔ داشبورد از نقشهٔ فعال (چنداستانی) استفاده می‌کند', /const map = khuzestanMap\(\);/.test(innerBody));
check('نقشهٔ داشبورد نسبت تصویر نقشهٔ ترکیبی را می‌گیرد', /Number\(map\.aspect\)/.test(innerBody));

// ── رفتار واقعی: با سه استان، نقشهٔ ترکیبی هر سه را دارد ──
global.window = {};
require(path.join(root, 'design/provinces-map.js'));
const api = global.window.AtlasProvinces;
const ids = ['khuzestan', 'chaharmahal-bakhtiari', 'isfahan'];
const settings = { province: ids[0], provinces: ids.slice() };
const source = modules.slice(
  modules.indexOf('function activeProvinceIds()'),
  modules.indexOf('// نام قدیمی این تابع')
);
const factory = new Function(
  'mapSettings', 'provinceFind', 'provinceList', 'provinceApi',
  source + '\nreturn { provinceMap: provinceMap, activeProvinceIds: activeProvinceIds };'
);
const built = factory(() => settings, (id) => api.province(id), () => api.provinces, () => api);
const map = built.provinceMap();
check('نقشهٔ داشبورد با سه استان، ترکیبی است', map && map.id === 'composite', map && map.id);
check('هر سه استان در نقشهٔ داشبورد حاضرند',
  map && ids.every((id) => map.provinceIds.indexOf(id) >= 0), map && map.provinceIds.join(','));
check('مرز هر سه استان رسم شده است', map && (map.path.match(/M/g) || []).length >= 3);
check('شهرهای هر سه استان روی نقشهٔ داشبورد هستند',
  map && map.cities.length === ids.reduce((sum, id) => sum + api.province(id).cities.length, 0));

const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log((c.ok ? '✓' : '✗') + ' ' + c.name + (c.ok ? '' : '  → ' + c.extra)));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

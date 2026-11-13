// بررسی رده‌بندی شهرها روی نقشه: اندازهٔ دوبرابر نام شهرها، حذف پیام «ایستگاهی
// ثبت نشده» از نمایش نقشه، و جابه‌جایی شهر بین رده‌ها با کشیدن و رها کردن.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = read('modules.js');
const css = read('design/stations.css');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// ── اندازهٔ نام شهرها دو برابر شده است ──
const sizingSource = modules.slice(
  modules.indexOf('const MAP_LABEL_BASE'),
  modules.indexOf('// چند ایستگاه در یک شهر')
);
const sizing = new Function(sizingSource + '\nreturn { mapLabelSizes: mapLabelSizes };')();
const sizeAt1 = sizing.mapLabelSizes(1);
check('نام شهرهای اصلی در نمای دور ۵۲ پیکسل است', Math.round(sizeAt1[1]) === 52, sizeAt1[1]);
check('نام مراکز شهرستان دو برابر شده است', Math.round(sizeAt1[2]) === 38, sizeAt1[2]);
check('نام شهرهای کوچک دو برابر شده است', Math.round(sizeAt1[3]) === 32, sizeAt1[3]);
check('نام روستاها دو برابر شده است', Math.round(sizeAt1[4]) === 28, sizeAt1[4]);
check('سقف اندازهٔ نام ردهٔ ۱ هم دو برابر شده است', /MAP_LABEL_MAX = \{ 1: 52,/.test(modules));
check('پیش‌فرض CSS نام ردهٔ ۱ دو برابر شده است', /--label-t1,52px/.test(css));
check('پیش‌فرض CSS نام پایه دو برابر شده است', /\.station-city-label\{[^}]*font-size:42px/.test(css));

// ── پیام «هنوز ایستگاهی ثبت نشده» از نمایش نقشه حذف شده است ──
check('پیام خالی‌بودن نقشه در markup نقشه نیست', !/station-map-empty">در این استان هنوز ایستگاهی ثبت نشده است/.test(modules));
check('زیرنویس ویجت دیگر پیام «هنوز ایستگاه یا مرکزی ثبت نشده» را نشان نمی‌دهد',
  !/هنوز ایستگاه یا مرکزی ثبت نشده است/.test(modules));

// ── ردهٔ دستی شهر ──
check('تنظیمات نقشه جای نگه‌داشتن ردهٔ دستی شهرها را دارد', /settings\.cityTiers = \{\}/.test(modules));
const tierSource = modules.slice(
  modules.indexOf('function mapCityTier(city)'),
  modules.indexOf('function mapCityRow(city)')
);
const mapCityTier = new Function('mapSettings', tierSource + '\nreturn mapCityTier;')(() => ({ cityTiers: { 'شوش': 1 } }));
check('ردهٔ دستی بر ردهٔ پیش‌فرض نقشه مقدم است', mapCityTier({ name: 'شوش', tier: 3 }) === 1);
check('شهر بدون انتخاب دستی ردهٔ خودش را نگه می‌دارد', mapCityTier({ name: 'اهواز', tier: 1 }) === 1);
check('ردهٔ نامعتبر نادیده گرفته می‌شود', mapCityTier({ name: 'ناشناس', tier: 2 }) === 2);
check('ردهٔ دستی روی خود نقشه هم اعمال می‌شود', /const tier = mapCityTier\(city\);/.test(modules));
check('گروه‌بندی تنظیمات از ردهٔ دستی استفاده می‌کند', /mapCityTier\(city\) === tier/.test(modules));

// ── کشیدن و رها کردن ──
check('هر ردیف شهر کشیدنی است', /class="map-city-row" draggable="true" data-map-city-row=/.test(modules));
check('هر گروه رده هدف رها کردن است', /data-map-tier-group="/.test(modules));
check('رویداد dragstart نام شهر را نگه می‌دارد', /addEventListener\('dragstart'/.test(modules) && /mapCityDragName = row\.dataset\.mapCityRow/.test(modules));
check('رویداد dragover رها کردن را مجاز می‌کند', /addEventListener\('dragover'/.test(modules) && /event\.preventDefault\(\)/.test(modules));
check('رویداد drop ردهٔ تازه را ذخیره می‌کند', /addEventListener\('drop'/.test(modules) && /mapSettings\(\)\.cityTiers\[name\] = tier/.test(modules));
check('پس از رها کردن، تنظیمات نقشه دوباره ساخته می‌شود', /pane\.innerHTML = mapSettingsMarkup\(\)/.test(modules));
check('گروه هدف رها کردن استایل دارد', /\.map-city-group\.is-drop-target\{/.test(css));
check('ردیف در حال کشیدن استایل دارد', /\.map-city-row\.is-dragging\{/.test(css));
check('راهنمای کشیدن در تنظیمات نقشه هست', /روی کادر «شهرهای اصلی» رها کن/.test(modules));
check('دکمهٔ افزودن به شهرهای اصلی برای صفحه‌های لمسی هست', /data-map-city-main="/.test(modules));
check('دکمهٔ بازگشت به ردهٔ پیش‌فرض هست', /data-map-city-reset="/.test(modules));
check('دکمهٔ ★ ردهٔ شهر را ۱ می‌کند', /applyMapCityTier\(toMain\.dataset\.mapCityMain, 1\)/.test(modules));
check('دکمهٔ ↺ انتخاب دستی را پاک می‌کند', /delete mapSettings\(\)\.cityTiers\[name\]/.test(modules));
check('دکمهٔ جابه‌جایی استایل دارد', /\.map-city-move\{/.test(css));

// ── اجرای واقعی سازندهٔ markup رده‌ها ──
const markupSource = modules.slice(
  modules.indexOf('function mapCityTier(city)'),
  modules.indexOf('// فهرست استان‌ها برای انتخاب نقشهٔ فعال')
);
const buildMarkup = new Function(
  'mapSettings', 'khuzestanMap', 'mapCityVisible', 'esc', 'faDigits', 'MAP_TIER_TITLES',
  markupSource + '\nreturn { mapCityRow: mapCityRow, mapCityGroupMarkup: mapCityGroupMarkup };'
);
const markupApi = buildMarkup(
  () => ({ cityTiers: { 'شوش': 1 } }),
  () => ({ cities: [{ name: 'شوش', tier: 3 }, { name: 'اهواز', tier: 1 }] }),
  () => true,
  (value) => String(value),
  (value) => String(value),
  { 1: 'شهرهای اصلی', 2: 'مراکز شهرستان', 3: 'شهرهای کوچک', 4: 'روستاها و محله‌ها' }
);
const mainGroup = markupApi.mapCityGroupMarkup(1);
check('شهر کشیده‌شده در گروه «شهرهای اصلی» ساخته می‌شود', mainGroup.includes('شوش') && mainGroup.includes('اهواز'), mainGroup.slice(0, 120));
check('گروه «شهرهای اصلی» هدف رها کردن است', /data-map-tier-group="1"/.test(mainGroup));
const smallGroup = markupApi.mapCityGroupMarkup(3);
check('گروه خالی هم ساخته می‌شود تا هدف رها کردن بماند', /data-map-tier-group="3"/.test(smallGroup));
check('گروه خالی راهنمای کشیدن نشان می‌دهد', /map-city-empty/.test(smallGroup));
const row = markupApi.mapCityRow({ name: 'شوش', tier: 3 });
check('ردیف شهر کشیدنی است', /draggable="true"/.test(row) && /data-map-city-row="شوش"/.test(row));
check('ردیف شهر در ردهٔ اصلی دکمهٔ بازگشت دارد', /data-map-city-reset="شوش"/.test(row));
const otherRow = markupApi.mapCityRow({ name: 'آبادان', tier: 2 });
check('ردیف شهر غیراصلی دکمهٔ ★ دارد', /data-map-city-main="آبادان"/.test(otherRow));

const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log((c.ok ? '✓' : '✗') + ' ' + c.name + (c.ok ? '' : '  → ' + c.extra)));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

// بررسی پنجرهٔ پاپ‌آپ سوابق سرویس در «دفتر سرویس»: انتخاب خودرو باید سوابقش را
// در یک پنجره باز کند، نه اینکه کاربر را به صفحهٔ جدا ببرد.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = read('modules.js');
const css = read('design/vehicle-tabs.css');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// ── توابع پنجره ──
check('تابع بازکردن پنجره وجود دارد', /function openServiceRecordsDialog\(/.test(modules));
check('تابع بستن پنجره وجود دارد', /function closeServiceRecordsDialog\(/.test(modules));
check('تابع تازه‌سازی پنجره وجود دارد', /function refreshServiceRecordsDialog\(/.test(modules));

// ── کلیک روی خودرو در دفتر سرویس پنجره را باز می‌کند ──
check('کلیک روی خودرو در تب سرویس پنجره را باز می‌کند',
  /if \(vehicleTab === 'service'\) \{ openServiceRecordsDialog\(entityOpen\.dataset\.vtabOpen \|\| ''\); return; \}/.test(modules));
check('کلیک روی خودرو دیگر به صفحهٔ جدا نمی‌رود',
  !/serviceVehicleId/.test(modules) && !/renderServiceVehicle/.test(modules));

// ── ساختار پنجره ──
check('پنجره از پوستهٔ مشترک مودال استفاده می‌کند', /atlas-modal-backdrop service-records-backdrop/.test(modules));
check('پنجره نقش دیالوگ و aria-modal دارد', /role="dialog" aria-modal="true"/.test(modules));
check('پنجره عنوان قابل‌خواندن برای صفحه‌خوان دارد', /aria-labelledby="serviceRecordsTitle"/.test(modules));
check('پنجره دکمهٔ بستن دارد', /data-service-records-close/.test(modules));
check('پنجره دکمهٔ ثبت سرویس برای همان خودرو دارد',
  /data-service-action="add" data-vehicle="' \+ esc\(vehicle\.id\)/.test(modules));
check('پنجره خروجی و چاپ همان خودرو را دارد', /customExportMenu\('service-vehicle', vehicle\.id, 'vehicle'\)/.test(modules));

// ── بستن ──
check('دکمهٔ بستن پنجره را می‌بندد', /closest\('\[data-service-records-close\]'\)/.test(modules));
check('کلیک روی پس‌زمینه پنجره را می‌بندد', /matches\('\[data-service-records-dialog\]'\)/.test(modules));
check('کلید Escape پنجره را می‌بندد',
  /event\.key !== 'Escape'[\s\S]{0,160}closeServiceRecordsDialog\(\)/.test(modules));
check('تغییر زیرتب پنجره را می‌بندد', /if \(vehicleTab !== 'service'\) closeServiceRecordsDialog\(\);/.test(modules));

// ── هم‌گام‌ماندن با داده ──
check('رندر دوبارهٔ دفتر سرویس، پنجره را تازه می‌کند',
  /refreshServiceRecordsDialog\(\);\s*\}\s*\n\s*\/\/ ── پنجرهٔ سوابق سرویس/.test(modules));
check('مرتب‌سازی سوابق داخل پنجره کار می‌کند', /customSortHeader\(serviceLogSort, 'date'/.test(modules));

// ── استایل ──
check('عرض پنجره محدود شده است', /\.service-records-modal\s*\{[^}]*width:\s*min\(820px, 100%\)/.test(css));
check('نوار دکمه‌های پایین ثابت است', /\.service-records-foot\s*\{[^}]*flex:\s*0 0 auto/.test(css));
check('کارت‌های آماری در گوشی دوستونی می‌شوند',
  /@media \(max-width: 640px\)[\s\S]*?\.service-records-modal \.stat-row\s*\{\s*grid-template-columns:\s*repeat\(2/.test(css));
check('اطلاعات خودرو در دسکتاپ سه‌ستونه است',
  /\.service-records-modal \.vtab-facts-wide\s*\{\s*grid-template-columns:\s*repeat\(3/.test(css));

let failed = 0;
checks.forEach(function (item) {
  if (!item.ok) failed++;
  console.log((item.ok ? '✓' : '✗') + ' ' + item.name + (item.ok ? '' : '  → ' + item.extra));
});
console.log('\n' + (checks.length - failed) + '/' + checks.length + ' بررسی موفق');
if (failed) process.exit(1);

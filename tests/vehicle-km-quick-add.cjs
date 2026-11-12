// بررسی «ثبت کیلومتر فعلی» در نوار ثبت سریع داشبورد: یک دکمه، یک پنجرهٔ کوچک
// با دو کادر (خودرو سمت راست، کیلومتر سمت چپ) و ذخیرهٔ عدد به‌عنوان آخرین
// کیلومتر ثبت‌شدهٔ خودرو همراه با تاریخ و ساعت.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = read('modules.js');
const css = read('design/modals-export.css');
const icons = read('design/icons/atlas-icons.js');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// ── دکمه در فهرست ثبت سریع ──
check('دکمهٔ «ثبت کیلومتر فعلی» در فهرست ثبت سریع هست',
  /\{ id:'vehiclekm', label:'ثبت کیلومتر فعلی'/.test(modules));
check('دکمهٔ تازه در فهرست پیش‌فرض روشن است',
  /const QUICK_ADD_DEFAULT = \[[^\]]*'vehiclekm'\]/.test(modules));
check('دکمهٔ تازه برای کاربرانی که تنظیمات ذخیره‌شده دارند هم می‌آید',
  /out\.push\(\{ id: item\.id, enabled: QUICK_ADD_DEFAULT\.indexOf\(item\.id\) >= 0 \}\)/.test(modules));
check('آیکون کیلومترشمار تعریف شده است', /odometer:/.test(icons));

// ── پنجرهٔ کوچک ──
check('تابع پنجرهٔ ثبت کیلومتر وجود دارد', /function openVehicleKmDialog\(\)/.test(modules));
check('کلیک روی دکمهٔ ثبت سریع، پنجره را باز می‌کند',
  /closest\('\[data-quick-add="vehiclekm"\]'\)[\s\S]{0,120}openVehicleKmDialog\(\)/.test(modules));
check('پنجره دو کادر دارد: انتخاب خودرو و کیلومتر',
  /data-vehicle-km-vehicle/.test(modules) && /data-vehicle-km-value/.test(modules));
check('کادر خودرو از فهرست خودروها ساخته می‌شود',
  /\(appData\.vehicles \|\| \[\]\)\.slice\(\)\.sort/.test(modules));
check('چیدمان دو ستونه: خودرو اول (سمت راست) و کیلومتر دوم (سمت چپ)',
  /vehicle-km-grid[\s\S]{0,400}data-vehicle-km-vehicle[\s\S]{0,400}data-vehicle-km-value/.test(modules));
check('پنجره آخرین کیلومتر ثبت‌شده را نشان می‌دهد',
  /آخرین کیلومتر ثبت‌شده: /.test(modules));

// ── ذخیره ──
check('کیلومتر فعلی خودرو به‌روزرسانی می‌شود', /vehicle\.currentKm = km;/.test(modules));
check('زمان ثبت با تاریخ و ساعت ذخیره می‌شود', /vehicle\.currentKmRecordedAt = now;/.test(modules));
check('ثبت در سوابق خودرو (maintenanceLog) هم می‌نشیند',
  /vehicle\.maintenanceLog = \[String\(vehicle\.maintenanceLog \|\| ''\)\.trim\(\), stamp \+ ' \| کیلومتر ' \+ km\]/.test(modules));
check('ثبت کیلومتر در تاریخچهٔ تغییرات می‌آید',
  /addHistory\('vehicles', vehicle, 'ثبت کیلومتر'/.test(modules));
check('کیلومتر کمتر از آخرین ثبت، تأیید دوباره می‌خواهد',
  /km < previous && !lowerConfirmed/.test(modules));
check('ورودی نامعتبر رد می‌شود', /کیلومتر را به‌صورت یک عدد مثبت وارد کن/.test(modules));
check('پس از ذخیره، فهرست و داشبورد تازه می‌شوند',
  /backdrop\.remove\(\);\s*refreshCurrentView\(\);\s*refreshDashboard\(\);/.test(modules));

// ── نمایش زمان ثبت در فرم خودرو ──
check('فیلد «زمان آخرین ثبت کیلومتر» تاریخ و ساعت شمسی نشان می‌دهد',
  /\{key:'currentKmRecordedAt',label:'زمان آخرین ثبت کیلومتر',type:'jalali-datetime'/.test(modules));
check('ویرایش خودرو بدون تغییر کیلومتر، زمان ثبت قبلی را حفظ می‌کند',
  /!record\.currentKmRecordedAt&&old&&old\.currentKmRecordedAt/.test(modules));

// ── استایل ──
check('شبکهٔ دو کادره استایل دارد', /\.vehicle-km-grid\s*\{[\s\S]{0,120}grid-template-columns: 1fr 1fr;/.test(css));
check('در گوشی دو کادر زیر هم می‌آیند', /@media \(max-width: 480px\)[\s\S]{0,80}\.vehicle-km-grid \{ grid-template-columns: 1fr; \}/.test(css));

let failed = 0;
checks.forEach(function (item) {
  if (!item.ok) failed++;
  console.log((item.ok ? '✓' : '✗') + ' ' + item.name + (item.ok ? '' : '  → ' + item.extra));
});
console.log('\n' + (checks.length - failed) + '/' + checks.length + ' بررسی موفق');
if (failed) process.exit(1);

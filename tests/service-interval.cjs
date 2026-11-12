// بررسی «بازهٔ کیلومتری سرویس‌های دوره‌ای»: در تنظیمات برای هر نوع سرویس یک
// بازه تعیین می‌شود و در فرم ثبت سرویس، «کیلومتر سرویس بعدی» یک پیشنهاد
// (بازه + کیلومتر سرویس یا کارکرد فعلی خودرو) می‌گیرد که با یک کلیک درج یا
// دستی بازنویسی می‌شود.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = read('modules.js');
const styles = read('design/styles.css');
const settingsCss = read('design/settings-view.css');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// بخشِ شنونده‌های پیشنهاد، برای بررسی اینکه ذخیره فقط روی change است.
const kmListeners = (modules.match(/\/\/ ── پیشنهاد کیلومتر سرویس بعدی[\s\S]*?\/\/ بخش‌های رقمی پلاک/) || [''])[0];
const beforeChange = kmListeners.split("document.addEventListener('change'")[0] || '';

// ── فیلدهای فرم سرویس ──
check('فرم سرویس «کیلومتر در زمان سرویس» دارد',
  /\{key:'km',label:'کیلومتر در زمان سرویس',type:'number',min:0\}/.test(modules));
check('فرم سرویس «کیلومتر سرویس بعدی» دارد',
  /\{key:'nextServiceKm',label:'کیلومتر سرویس بعدی',type:'number',min:0\}/.test(modules));
check('نوع سرویس از فهرست مشترک maintenanceTypes می‌آید',
  /\{key:'type',label:'نوع اقدام',type:'select',required:true,listKey:'maintenanceTypes'/.test(modules));

// ── تنظیمات سرویس‌ها ──
check('تب «تنظیمات سرویس‌ها» به تنظیمات اضافه شده است',
  /id: 'services', title: 'تنظیمات سرویس‌ها'/.test(modules));
check('پنل تنظیمات سرویس‌ها رندر می‌شود',
  /if \(id === 'services'\) return serviceIntervalsMarkup\(\);/.test(modules));
check('نقشهٔ بازه‌ها از فهرست‌های کشویی جدا شده است',
  /REFERENCE_NON_LISTS = \['placesByType', 'lineColors', 'maintenanceIntervals'\]/.test(modules));
check('نقشهٔ بازه‌ها در references نگه‌داری می‌شود',
  /function serviceIntervals\(\) \{[\s\S]{0,160}appData\.references\.maintenanceIntervals/.test(modules));
check('پنل تنظیمات برای هر نوع سرویس کادر بازه دارد',
  /data-interval-input="' \+ esc\(type\) \+ '"/.test(modules));
check('پنل تنظیمات افزودن نوع سرویس + بازه را دارد',
  /data-interval-new-name/.test(modules) && /data-interval-new-km/.test(modules) &&
  /data-module-action="service-interval-add"/.test(modules));

// ── توابع هسته ──
check('تابع خواندن بازهٔ هر نوع وجود دارد',
  /function serviceIntervalFor\(type\)[\s\S]{0,320}persianDigitsToLatin/.test(modules));
check('تابع ذخیرهٔ بازه وجود دارد و خالی‌کردن را هم پشتیبانی می‌کند',
  /async function setServiceInterval\(type, km\)[\s\S]{0,420}if \(km > 0\) map\[key\] = km; else delete map\[key\]/.test(modules));
check('نوع‌های شناخته‌شده از فهرست مرجع و سوابق قدیمی جمع می‌شوند',
  /function knownMaintenanceTypes\(\)[\s\S]{0,700}appData\.references\.maintenanceTypes[\s\S]{0,420}appData\.maintenance/.test(modules));
check('مقدار کیلومتر با رقم فارسی هم خوانده می‌شود',
  /function parseKmValue\(value\)[\s\S]{0,220}persianDigitsToLatin/.test(modules));

// ── محاسبهٔ پیشنهاد ──
check('پیشنهاد = بازه + کیلومتر سرویس',
  /function kmSuggestInfo\(type, kmValue, vehicleId\)/.test(modules) &&
  /return \{ total: base \+ interval/.test(modules));
check('اگر کیلومتر سرویس خالی بود، کارکرد فعلی خودرو مبنا می‌شود',
  /base = parseKmValue\(vehicle\.currentKm\)[\s\S]{0,100}baseLabel = 'کارکرد فعلی خودرو'/.test(modules));
check('برچسب پیشنهاد «درج پیشنهاد» و جمع دو عدد را نشان می‌دهد',
  /'درج پیشنهاد: ' \+ faDigits\(info\.total\)[\s\S]{0,220}faDigits\(info\.interval\)/.test(modules));

// ── دکمهٔ پیشنهاد در فرم ──
check('دکمهٔ پیشنهاد فقط زیر «کیلومتر سرویس بعدی» فرم سرویس تزریق می‌شود',
  /moduleKey === 'maintenance' && field.key === 'nextServiceKm'[\s\S]{0,420}data-km-suggest/.test(modules));
check('دکمهٔ پیشنهاد در حالت بدون عدد پنهان است',
  /data-km-suggest' \+[\s\S]{0,120}' hidden'/.test(modules));
check('کلیک روی پیشنهاد، عدد را در «کیلومتر سرویس بعدی» می‌گذارد',
  /\[data-km-suggest\][\s\S]{0,420}box\.value = String\(btn\.dataset\.kmValue/.test(modules));
check('کلیک روی پیشنهاد رفتار پیش‌فرض برچسب را متوقف می‌کند',
  /\[data-km-suggest\][\s\S]{0,220}event\.preventDefault\(\)/.test(modules));
check('تغییر نوع سرویس/کیلومتر/خودرو پیشنهاد را زنده به‌روز می‌کند',
  /document\.addEventListener\('input'[\s\S]{0,360}form\.dataset\.view === 'maintenance'[\s\S]{0,80}refreshKmSuggest\(form\)/.test(modules));
check('تغییر بازه در تنظیمات، پیشنهاد را ذخیره می‌کند',
  /document\.addEventListener\('change'[\s\S]{0,520}setServiceInterval\(intervalBox\.dataset\.intervalInput \|\| '', parseKmValue\(intervalBox\.value\)\)/.test(modules));
check('ذخیرهٔ بازه در هر کلید تکرار نمی‌شود (فقط change)',
  kmListeners.length > 0 && !/setServiceInterval/.test(beforeChange));

// ── هم‌گامی با تغییر نام/حذف نوع سرویس ──
check('تغییر نام نوع سرویس، بازهٔ کیلومتری را هم منتقل می‌کند',
  /listKey==='maintenanceTypes'[\s\S]{0,300}intervals\[next\]=intervals\[previous\]/.test(modules));
check('حذف نوع سرویس، بازهٔ کیلومتری‌اش را هم برمی‌دارد',
  /action==='reference-delete'[\s\S]{0,620}delete intervals\[removed\]/.test(modules));
check('افزودن از تنظیمات، نوع را به فهرست مرجع و بازه را به نقشه اضافه می‌کند',
  /action==='service-interval-add'[\s\S]{0,900}appData\.references\.maintenanceTypes\.push\(name\)[\s\S]{0,420}appData\.references\.maintenanceIntervals=intervals/.test(modules));
check('افزودن از تنظیمات، تنظیمات را دوباره رندر می‌کند',
  /action==='service-interval-add'[\s\S]{0,1200}refreshCurrentView\(\)/.test(modules));

// ── ماندگاری و استایل ──
check('references (و در نتیجه نقشهٔ بازه‌ها) در نرمال‌سازی/پشتیبان می‌ماند',
  /out\.references = Object\.assign\(out\.references, value\.references\)/.test(modules));
check('استایل دکمهٔ پیشنهاد در styles.css هست',
  /\.module-km-suggest\s*\{[^}]*border:1px dashed var\(--line-hi\)/.test(styles));
check('دکمهٔ پیشنهاد در حالت hidden واقعاً پنهان می‌شود',
  /\.module-km-suggest\[hidden\]\s*\{\s*display:none/.test(styles));
check('استایل ردیف‌های تنظیمات سرویس‌ها در settings-view.css هست',
  /\.service-interval-row\s*\{[^}]*justify-content: space-between/.test(settingsCss));
check('استایل فهرست و ردیف افزودن تنظیمات سرویس‌ها هست',
  /\.service-interval-list\s*\{\s*display: grid/.test(settingsCss) &&
  /\.service-interval-add\s*\{\s*display: flex/.test(settingsCss));

const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log((c.ok ? '✓' : '✗') + ' ' + c.name + (c.ok ? '' : '  → ' + c.extra)));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

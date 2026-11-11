// بررسی «فاصلهٔ پیشنهادی سرویس»: برای هر نوع سرویس یک فاصلهٔ استاندارد به
// کیلومتر در تنظیمات تعیین می‌شود و هنگام ثبت سرویس، کیلومتر سرویس بعدی
// به‌صورت خودکار = کیلومتر سرویس + همان فاصله پیشنهاد می‌شود (قابل ویرایش).
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = read('modules.js');
const css = read('design/settings-view.css');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// ── ذخیره‌سازی ──
check('فاصله‌ها در تنظیمات ذخیره می‌شوند', /settings: \{ employeeCustomFields: '', serviceIntervals: \{\} \}/.test(modules));
check('بازیابی داده، فاصله‌ها را نگه می‌دارد',
  /out\.settings\.serviceIntervals = \{\}/.test(modules));
check('تابع دسترسی به نقشهٔ فاصله‌ها وجود دارد', /function serviceIntervalMap\(\)/.test(modules));
check('تابع خواندن فاصلهٔ یک نوع سرویس وجود دارد', /function serviceIntervalFor\(type\)/.test(modules));

// ── تنظیمات › سرویس‌های خودرو ──
check('تب «سرویس‌های خودرو» در تنظیمات هست', /\{ id: 'services', title: 'سرویس‌های خودرو'/.test(modules));
check('پنل تنظیمات تب سرویس‌ها را می‌سازد', /if \(id === 'services'\) return serviceIntervalsMarkup\(\);/.test(modules));
check('برای هر نوع سرویس یک کادر عدد دارد',
  /data-service-interval="' \+ esc\(type\) \+ '"/.test(modules));
check('واحد کیلومتر کنار کادر نوشته شده است', /service-interval-unit">کیلومتر/.test(modules));
check('دکمهٔ ذخیرهٔ فاصله‌ها وجود دارد', /data-module-action="service-intervals-save"/.test(modules));
check('ذخیرهٔ فاصله‌ها در نقشه نوشته می‌شود',
  /action==='service-intervals-save'[\s\S]{0,600}map\[type\]=Math\.round\(value\)/.test(modules));

// ── فرم ثبت سرویس ──
check('فیلد «نوع اقدام» سرویس را به فاصله‌ها وصل می‌کند',
  /\{key:'type',label:'نوع اقدام',type:'select',required:true,listKey:'maintenanceTypes',serviceInterval:true/.test(modules));
check('فیلد «کیلومتر سرویس بعدی» پیشنهاد می‌گیرد',
  /\{key:'nextServiceKm',label:'کیلومتر سرویس بعدی',type:'number',min:0,serviceNextKm:true\}/.test(modules));
check('انتخاب نوع سرویس نشانهٔ data-service-type دارد',
  /\(field\.serviceInterval \? ' data-service-type="1"' : ''\)/.test(modules));
check('کادر کیلومتر بعدی نشانهٔ data-service-next-km دارد',
  /\(field\.serviceNextKm \? ' data-service-next-km="1"' : ''\)/.test(modules));
check('زیر کادر کیلومتر بعدی جای پیام پیشنهاد هست',
  /if \(field\.serviceNextKm\) control \+= '<small class="module-field-hint" data-service-suggest-hint><\/small>';/.test(modules));
check('فاصلهٔ استاندارد کنار نام نوع سرویس در فهرست کشویی دیده می‌شود',
  /if \(field\.serviceInterval\) \{[\s\S]{0,220}option\.label = option\.label \+ ' · ' \+ label;/.test(modules));

// ── محاسبهٔ پیشنهاد ──
check('تابع پیشنهاد کیلومتر سرویس بعدی وجود دارد', /function applyServiceSuggestion\(form, force\)/.test(modules));
check('پیشنهاد = کیلومتر سرویس + فاصلهٔ استاندارد',
  /const suggested = Math\.round\(km \+ interval\);/.test(modules));
check('عدد پیشنهادی در همان کادر نوشته می‌شود',
  /nextControl\.value = String\(suggested\);/.test(modules));
check('عدد دستی کاربر با تغییر کیلومتر پاک نمی‌شود',
  /const untouched = !current \|\| current === autoValue;/.test(modules));
check('تغییر نوع سرویس پیشنهاد را دوباره می‌سازد',
  /control\.matches\('\[data-service-type\]'\)\) applyServiceSuggestion\(form, true\)/.test(modules));
check('تغییر کیلومتر سرویس پیشنهاد را تازه می‌کند',
  /control\.name === 'km'\) applyServiceSuggestion\(form, false\)/.test(modules));
check('تایپ دستی در کادر کیلومتر بعدی، پیشنهاد را متوقف می‌کند',
  /control\.matches\('\[data-service-next-km\]'\)\) delete control\.dataset\.autoValue/.test(modules));

// ── هم‌گامی با تغییر نام و حذف نوع سرویس ──
check('تغییر نام نوع سرویس، فاصله‌اش را هم جابه‌جا می‌کند',
  /if\(listKey==='maintenanceTypes'\)\{[\s\S]{0,220}intervals\[next\]=intervals\[previous\];/.test(modules));
check('حذف نوع سرویس، فاصله‌اش را هم پاک می‌کند',
  /if\(listKey==='maintenanceTypes'\)delete serviceIntervalMap\(\)\[removed\];/.test(modules));

// ── استایل ──
check('ردیف فاصله‌ها استایل دارد', /\.service-interval-row\s*\{/.test(css));
check('کادر عدد استایل دارد', /\.service-interval-input input\s*\{/.test(css));
check('در گوشی ردیف فاصله‌ها می‌شکند', /@media \(max-width: 480px\)[\s\S]{0,120}\.service-interval-row \{ flex-wrap: wrap; \}/.test(css));

let failed = 0;
checks.forEach(function (item) {
  if (!item.ok) failed++;
  console.log((item.ok ? '✓' : '✗') + ' ' + item.name + (item.ok ? '' : '  → ' + item.extra));
});
console.log('\n' + (checks.length - failed) + '/' + checks.length + ' بررسی موفق');
if (failed) process.exit(1);

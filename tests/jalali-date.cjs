// بررسی «بدون تاریخ» در سالنامهٔ شمسی: همهٔ فیلدهای تاریخ (اختیاری و اجباری)
// باید همان‌جا قابل خالی‌کردن باشند، بی‌آنکه کاربر فرم را ببندد و از نو باز کند.
// فیلد اجباریِ خالی‌شده هنگام ذخیره با اعتبارسنجی اجباری رد می‌شود (هایلایت
// قرمز و پیام «فیلد مورد نظر اجباری است»).
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = read('modules.js');
const styles = read('design/styles.css');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// ── دکمهٔ «بدون تاریخ» در سالنامه ──
check('تابع پاک‌کردن تاریخ وجود دارد', /function clearJalaliField\(\)/.test(modules));
check('دکمهٔ «بدون تاریخ» در نوار پایین سالنامه هست',
  /data-jalali-action="clear"[^<]*>بدون تاریخ</.test(modules));
check('هندلر کلیک عمل «clear» را اجرا می‌کند',
  /jalaliAction === 'clear'[\s\S]{0,80}clearJalaliField\(\)/.test(modules));
check('پاک‌کردن تاریخ همهٔ بخش‌های سال/ماه/روز/ساعت را خالی می‌کند',
  /function clearJalaliField\(\) \{[\s\S]{0,220}box\.value = ''/.test(modules));
check('پاک‌کردن تاریخ مقدار کادر پنهان را همگام و تغییرش را اعلام می‌کند',
  /function clearJalaliField\(\) \{[\s\S]{0,420}syncJalaliField\(wrap\)[\s\S]{0,240}new Event\('change', \{ bubbles: true \}\)/.test(modules));
check('پاک‌کردن تاریخ سالنامه را می‌بندد و فوکوس را به دکمهٔ بازکننده برمی‌گرداند',
  /function clearJalaliField\(\) \{[\s\S]{0,380}closeJalaliPopover\(\)[\s\S]{0,120}jalaliOpener\.focus\(\)/.test(modules));

// ── همهٔ فیلدهای تاریخ (اختیاری و اجباری) ──
check('دکمهٔ «بدون تاریخ» برای همهٔ فیلدهای تاریخ ساخته می‌شود',
  /const allowClear = !!jalaliTarget/.test(modules));
check('علامت «data-jalali-required» کاملاً حذف شده است (هیچ فیلدی از دکمه محروم نیست)',
  !/data-jalali-required/.test(modules));
check('ویژگی required از ورودی مخفی تاریخ برداشته می‌شود تا اعتبارسنجی مرورگرِ خودش فعال نشود',
  /input\.removeAttribute\('required'\)/.test(modules));
check('دکمهٔ «بدون تاریخ» پشت دروازهٔ allowClear رندر می‌شود',
  /\(allowClear \? '<button type="button" class="secondary-btn" data-jalali-action="clear"/.test(modules));
check('تاریخ سرویس (کارتکس) اجباری است؛ خالی‌شدنش در ذخیره رد می‌شود',
  /\{key:'date',label:'تاریخ سرویس شمسی',type:'jalali',required:true\}/.test(modules));
check('تاریخ رفع اشکال اختیاری است (هدف اصلی «بدون تاریخ»)',
  /\{key:'resolvedAt',label:'تاریخ رفع شمسی',type:'jalali'\}/.test(modules));
check('تاریخ سرویس بعدی اختیاری است و قابل پاک‌کردن می‌ماند',
  /\{key:'nextServiceDate',label:'تاریخ سرویس بعدی شمسی',type:'jalali'\}/.test(modules));
check('فیلد اجباری خالیِ تاریخ هنگام ذخیره پیام «فیلد مورد نظر اجباری است» می‌گیرد',
  /note\.textContent = 'فیلد مورد نظر اجباری است\.'/.test(modules));
check('فرم شیفت هم شروع/پایان خالی را در ذخیره با پیام فارسی رد می‌کند',
  /زمان شروع را به شکل شمسی/.test(modules) && /زمان پایان را به شکل شمسی/.test(modules));

// ── ذخیرهٔ مقدار خالی ──
check('مقدار خالی تاریخ در ذخیره به رشتهٔ خالی تبدیل می‌شود (نه تاریخ نامعتبر)',
  /function dateInputToIso\(value, type\) \{\s*if \(!value\) return ''/.test(modules));

// ── استایل ──
check('دکمه‌های نوار پایین سالنامه روی دو خط نمی‌افتند',
  /\.jalali-pop-foot button\{[^}]*white-space:nowrap/.test(styles));
check('سالی که تاریخ خالی است در نمایش «—» می‌شود نه تاریخ غلط',
  /function formatJalali\(value, includeTime\) \{[\s\S]{0,120}return value \? esc\(value\) : '—'/.test(modules));

let failed = 0;
checks.forEach(function (item) {
  if (!item.ok) failed++;
  console.log((item.ok ? '✓' : '✗') + ' ' + item.name + (item.ok ? '' : '  → ' + item.extra));
});
console.log('\n' + (checks.length - failed) + '/' + checks.length + ' بررسی موفق');
if (failed) process.exit(1);

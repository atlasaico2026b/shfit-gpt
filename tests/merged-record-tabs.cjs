// بررسی ادغام «پرونده / سوابق / کامنت» در یک پنجره و نمایش ردیفی دفتر اشکالات.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = read('modules.js');
const recordFile = read('design/record-file.js');
const recordCss = read('design/record-file.css');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// ── یک دکمه به‌جای سه دکمه در ردیف فهرست ──
check('ردیف فهرست فقط یک دکمهٔ «پرونده» دارد', /data-module-action="file"[^>]*>پرونده<\/button>/.test(modules));
check('دکمهٔ کامنت جدا از ردیف فهرست حذف شده است',
  !/renderCommentButton\(moduleKey, record\) \+ renderHistoryButton\(moduleKey, record\)/.test(modules));

// ── زیرتب‌های داخل پنجرهٔ پرونده ──
check('پنجرهٔ پرونده زیرتب دارد', /class="rf-tabs"/.test(recordFile));
check('زیرتب سوابق و کامنت‌ها ساخته می‌شود', /data-rf-tab="' \+ tab\.key/.test(recordFile));
check('سوابق و کامنت‌ها به پنجره پاس داده می‌شوند',
  /history: hasHistory \? historySheet\(moduleKey, record, data\) : null/.test(recordFile) &&
  /comments: commentField \? \{ lines: commentLines \} : null/.test(recordFile));
check('استایل زیرتب‌ها وجود دارد', /\.rf-tab\.is-active/.test(recordCss));

// ── دفتر اشکالات ردیفی است، نه کارتی ──
check('ردیف اشکال ساخته می‌شود', /function renderFaultRow\(record\)/.test(modules));
check('کارت اشکال حذف شده است', !/function renderFaultCard\(record\)/.test(modules));
check('جدول دفتر اشکالات از ردیف‌ها ساخته می‌شود', /sorted\.map\(renderFaultRow\)/.test(modules));

// ── «رفع شد» واقعاً می‌بندد ──
check('وضعیت باز با یک تابع مشترک سنجیده می‌شود', /function isFaultOpen\(record\)/.test(modules));
check('رفع کامل، مرحلهٔ تاریخچه هم ثبت می‌کند',
  /record\.status = 'رفع شد';[\s\S]{0,400}record\.timeline = \(Array\.isArray\(record\.timeline\)/.test(modules));

// ── مدیریت مرتب‌سازی داخل عنوان‌ها ──
check('سرستون‌های دفتر اشکالات قابل مرتب‌سازی‌اند', /customSortHeader\(faultBoardSort, 'title'/.test(modules));
check('سرستون‌های دفتر سرویس قابل مرتب‌سازی‌اند', /customSortHeader\(serviceVehicleSort, 'name'/.test(modules));

let failed = 0;
checks.forEach(function (item) {
  if (!item.ok) failed++;
  console.log((item.ok ? '✓' : '✗') + ' ' + item.name + (item.ok ? '' : '  → ' + item.extra));
});
console.log('\n' + (checks.length - failed) + '/' + checks.length + ' بررسی موفق');
if (failed) process.exit(1);

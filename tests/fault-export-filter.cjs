// خروجی و چاپ «دفتر اشکالات» باید همان ردیف‌های فهرست دیده‌شده را بدهد.
// فیلتر «باز» یک وضعیت ذخیره‌شده نیست؛ اگر با مقایسهٔ متنی سنجیده شود، هیچ
// رکوردی مطابقت نمی‌کند و فایل/برگهٔ چاپ فقط سرستون می‌شود.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const modules = fs.readFileSync(path.join(root, 'modules.js'), 'utf8');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

const body = (modules.match(/function visibleRecordsFor\(moduleKey\) \{[\s\S]*?\n  \}/) || [''])[0];

check('تابع فهرست دیده‌شدهٔ خروجی پیدا می‌شود', body.length > 0);
check('فیلتر «باز» با همان قاعدهٔ جدول سنجیده می‌شود',
  /if \(faultFilter === 'open'\) return records\.filter\(isFaultOpen\);/.test(body));
check('فیلتر «همه» کل فهرست را برمی‌گرداند',
  /if \(faultFilter === 'all'\) return records;/.test(body));
check('فیلتر وضعیت‌های دیگر روی همان وضعیت می‌ماند',
  /return records\.filter\(function \(record\) \{ return \(record\.status \|\| 'ثبت‌شده'\) === faultFilter; \}\);/.test(body));
check('مقایسهٔ متنی «open» با وضعیت رکورد حذف شده است',
  !/faultFilter === 'all' \? records : records\.filter/.test(body));

let failed = 0;
checks.forEach(function (item) {
  if (!item.ok) failed++;
  console.log((item.ok ? '✓' : '✗') + ' ' + item.name + (item.ok ? '' : '  → ' + item.extra));
});
console.log('\n' + (checks.length - failed) + '/' + checks.length + ' بررسی موفق');
if (failed) process.exit(1);

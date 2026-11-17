/* آزمون «درگ زنده» — آیتم نباید از ردیف بلند شود و نباید نسخهٔ شناور بسازد.
   انتظار کاربر: آیتم داخل همان ردیف/ستون دنبال دست می‌رود، بقیه همان لحظه
   جا باز می‌کنند، ترتیب همان لحظه عوض می‌شود و هیچ پیامی («جابه‌جا شد») نمی‌آید.
   ضمناً همین رفتار باید برای منوی کنار صفحه، تب‌های تنظیمات و فهرست‌های
   داخلی (ستون‌ها، ثبت سریع، گزینه‌ها) وصل باشد.
   اجرا: node tests/live-drag-reorder.cjs */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const checks = [];
function check(name, ok) { checks.push({ name, ok: Boolean(ok) }); }

const engine = read('design/drag-reorder.js');
const engineCss = read('design/drag-reorder.css');
const menuManager = read('menu-manager.js');
const settingsTabs = read('settings-tabs.js');
const modules = read('modules.js');
const indexHtml = read('index.html');
const sw = read('sw.js');

// ۱ · نسخهٔ شناور و بلندشدن از ردیف حذف شده
check('نسخهٔ شناور (drag-ghost) ساخته نمی‌شود', !/drag-ghost/.test(engine) && !/drag-ghost/.test(engineCss));
check('آیتم حین درگ با ترنسفورم داخل ردیف حرکت می‌کند', /translate3d\(' \+ delta/.test(engine));
check('کلاس is-dragging اضافه می‌شود', /classList\.add\('is-dragging'\)/.test(engine));

// ۲ · محور حرکت خودکار تشخیص داده می‌شود (ردیف افقی / فهرست عمودی)
check('محور به‌صورت خودکار تشخیص داده می‌شود', /axis = \(maxX - minX\) >= \(maxY - minY\) \? 'x' : 'y'/.test(engine));
check('جهت RTL هم در نظر گرفته می‌شود', /dir = axis === 'x' \? \(last\.x < first\.x \? -1 : 1\)/.test(engine));

// ۳ · آیتم‌های همسایه با انیمیشن FLIP جا باز می‌کنند
check('موقعیت قبلی برای FLIP گرفته می‌شود', /prototype\.snapshot/.test(engine));
check('همسایه‌ها با is-shifting جابه‌جا می‌شوند', /classList\.add\('is-shifting'\)/.test(engine));
check('انتقال همسایه‌ها با ترنزیشن انجام می‌شود', /transition = 'transform ' \+ FLIP_MS/.test(engine));

// ۴ · هنگام کشیدن هیچ پیامی اعلام نمی‌شود
check('درگ فهرست منوها پیام پایان نمی‌دهد', /config\.order = ordered\.map\(item => item\.id\);\s*save\(\);/.test(menuManager));
check('فهرست منوی کنار صفحه با درگ مرتب می‌شود', /itemSelector: '\.app-menu-item'/.test(menuManager));
check('ترتیب منوی کنار صفحه ذخیره می‌شود', /function applyNavOrder/.test(menuManager));
check('منوهای ثابت (داشبورد/تنظیمات) جابه‌جا نمی‌شوند', /data-drag-locked/.test(menuManager) && /lockedSelector/.test(engine));
check('ثبت سریع پیام «ذخیره شد» نمی‌دهد', !/ترتیب دکمه‌های ثبت سریع ذخیره شد/.test(modules));
check('ترتیب گزینه‌های مرجع پیام نمی‌دهد', !/ترتیب گزینه‌های «/.test(modules));

// ۵ · تب‌های تنظیمات هم درگ‌شدنی و ماندگار هستند
check('تب‌های تنظیمات با درگ مرتب می‌شوند', /itemSelector: '\[role="tab"\]'/.test(settingsTabs));
check('ترتیب تب‌ها ذخیره و بازگردانده می‌شود', /atlasShiftSettingsTabOrderV1/.test(settingsTabs));
check('کلیک تب بعد از جابه‌جایی درست کار می‌کند (مبتنی بر شناسه)', /activate\(tab\)/.test(settingsTabs) && !/activate\(index\)/.test(settingsTabs));

// ۶ · پوستهٔ تازه به دستگاه کاربر می‌رسد
check('index.html اسکریپت درگ را بار می‌کند', /design\/drag-reorder\.js/.test(indexHtml));
check('index.html استایل درگ را بار می‌کند', /design\/drag-reorder\.css/.test(indexHtml));
check('نسخهٔ کش سرویس‌ورکر بالا رفته', Number((sw.match(/atlas-shift-v(\d+)/) || [])[1] || 0) >= 189);

const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

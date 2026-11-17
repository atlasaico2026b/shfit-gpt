/* آزمون موتور «جابه‌جایی شناور» (نسخهٔ ۲).
   مشکلات نسخهٔ ۱ که این آزمون از بازگشتشان جلوگیری می‌کند:
     ۱) آیتم با کلونِ position:fixed از ردیف بلند می‌شد (شبح شناور) و با
        محاسبهٔ تنها-عمودی جا می‌افتاد؛ نتیجه: باید ده‌ها بار کشید.
     ۲) درگ فقط روی چند فهرست وصل شده بود و منو/تب/زیرمنو نداشتند.
     ۳) بعد از هر جابه‌جایی پیام «ترتیب ... ذخیره شد» نمایش داده می‌شد.
     ۴) کشیدن لینک‌های منو، درگ بومی کروم را فعال می‌کرد و رویدادهای
        اشاره‌گر وسط کار قطع می‌شدند.
   اجرا: node tests/drag-reorder-fluid.cjs */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const checks = [];
function check(name, ok) { checks.push({ name, ok: Boolean(ok) }); }

const engine = read('design/drag-reorder.js');
const css = read('design/drag-reorder.css');
const menuManager = read('menu-manager.js');
const modules = read('modules.js');
const settingsTabs = read('settings-tabs.js');
const sw = read('sw.js');

// ۱ · بدون شبح شناور: آیتم در جریان چیدمان می‌ماند
check('موتور دیگر نسخهٔ شناور (drag-ghost) نمی‌سازد', !/drag-ghost/.test(engine) && !/drag-ghost/.test(css));
check('آیتم فقط با transform جابه‌جا می‌شود', /translate3d\(/.test(engine));
check('هیچ‌جا position:fixed برای آیتم در حال کشیدن نیست', !/style\.position\s*=\s*'fixed'/.test(engine));

// ۲ · جابه‌جایی بر اساس «جایگاه» است، نه فقط محور عمودی
check('جایگاه‌های چیدمان در شروع درگ ثبت می‌شوند', /state\.slots\s*=/.test(engine));
check('محور افقی/عمودی خودکار تشخیص داده می‌شود', /function axisOf/.test(engine) && /dx > dy \? 'x' : 'y'/.test(engine));

// ۳ · اتصال خودکار به منو، تب و هر فهرست اعلام‌شده
check('نوار منو به‌صورت خودکار وصل می‌شود', /\.app-menu-nav/.test(engine));
check('تب‌های تنظیمات به‌صورت خودکار وصل می‌شوند', /\.settings-tabs/.test(engine));
check('فهرست‌های [data-drag-list] پشتیبانی می‌شوند', /\[data-drag-list\]/.test(engine));
check('تغییرات DOM بعدی هم دیده می‌شوند (MutationObserver)', /MutationObserver/.test(engine));

// ۴ · درگ بومی لینک قطع نمی‌شود
check('draggable=false روی آیتم‌ها گذاشته می‌شود', /setAttribute\('draggable',\s*'false'\)/.test(engine));

// ۵ · بدون اعلام پیام بعد از جابه‌جایی
const dragCallback = (menuManager.match(/function applyDragOrder[\s\S]{0,500}?\n  function attachDrag/) || [''])[0];
check('menu-manager بعد از درگ پیام وضعیت نمی‌دهد', dragCallback.length > 0 && !/status\(/.test(dragCallback));
check('پیام «ترتیب دکمه‌های ثبت سریع ذخیره شد» حذف شده', !/ترتیب دکمه‌های ثبت سریع ذخیره شد/.test(modules));
check('پیام «ترتیب گزینه‌های ... ذخیره شد» حذف شده', !/ترتیب گزینه‌های «/.test(modules));

// ۶ · ترتیب نوار منو در همان config.order ذخیره می‌شود
check('درگ نوار منو ترتیب config.order را به‌روز می‌کند', /function attachNavDrag/.test(menuManager) && /config\.order = ids/.test(menuManager));

// ۷ · تب‌ها بعد از جابه‌جایی هم به پنل درست وصل می‌مانند (بدون ایندکس ثابت)
check('settings-tabs.js ایندکس را در زمان کلیک می‌خواند', /currentTabs\(\)\.indexOf\(tab\)/.test(settingsTabs));
check('settings-tabs.js ترتیب تب‌ها را از DOM می‌خواند', /querySelectorAll\('\.settings-tabs \[role="tab"\]'\)/.test(settingsTabs));

// ۸ · نسخهٔ کش بالا رفته تا پوستهٔ تازه به مرورگر برسد
const cacheVersion = Number((sw.match(/atlas-shift-v(\d+)/) || [])[1] || 0);
check('نسخهٔ کش سرویس‌ورکر برای این تغییر بالا رفته (v' + cacheVersion + ')', cacheVersion >= 189);

const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

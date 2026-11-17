/* آزمون رسیدن «جابه‌جایی با درگ» به دستگاه کاربر.
   ریشهٔ باگ: قابلیت درگ در کامیت 306907d اضافه شد ولی CACHE_NAME سرویس‌ورکر
   بالا نرفت و فایل‌های design/drag-reorder.* در APP_FILES نبودند؛ پس مرورگر
   همیشه پوستهٔ قدیمی را از کش می‌داد و درگ هیچ‌وقت بارگذاری نمی‌شد.
   باگ دوم: تب‌های پنل تنظیمات با ترتیب DOM به پنل‌ها وصل می‌شدند، در حالی که
   ترتیب تب‌ها و پنل‌ها در index.html یکی نیست؛ نتیجه اینکه «منوها و فهرست‌ها»
   پنل «دفترچه تلفن» را باز می‌کرد و فهرست منوها دیده نمی‌شد.
   اجرا: node tests/drag-reorder-shell.cjs */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const checks = [];
function check(name, ok) { checks.push({ name, ok: Boolean(ok) }); }

const sw = read('sw.js');
const indexHtml = read('index.html');
const settingsTabs = read('settings-tabs.js');
const themeTwo = read('theme-two.js');

// ۱ · فایل‌های درگ در پوستهٔ آفلاین پیش‌کش می‌شوند
check('design/drag-reorder.js در APP_FILES است', /'\.\/design\/drag-reorder\.js'/.test(sw));
check('design/drag-reorder.css در APP_FILES است', /'\.\/design\/drag-reorder\.css'/.test(sw));

// ۲ · نسخهٔ کش بعد از افزودن درگ بالا رفته (v187 آخرین نسخهٔ پیش از درگ بود)
const cacheVersion = Number((sw.match(/atlas-shift-v(\d+)/) || [])[1] || 0);
check('نسخهٔ کش سرویس‌ورکر بعد از افزودن درگ بالا رفته (v' + cacheVersion + ')', cacheVersion >= 188);

// ۳ · صفحه هر دو فایل درگ را بار می‌کند
check('index.html اسکریپت درگ را بار می‌کند', /<script src="\.\/design\/drag-reorder\.js"/.test(indexHtml));
check('index.html استایل درگ را بار می‌کند', /<link rel="stylesheet" href="\.\/design\/drag-reorder\.css"/.test(indexHtml));

// ۴ · هر پنل تنظیمات به تب خودش وصل است و ترتیب DOM ملاک نیست
const tabIds = [...indexHtml.matchAll(/id="(settings-tab-[a-z]+)"/g)].map((m) => m[1]);
const paneOwners = [...indexHtml.matchAll(/id="(settings-pane-[a-z]+)"[^>]*aria-labelledby="([^"]+)"/g)]
  .map((m) => ({ pane: m[1], owner: m[2] }));
check('همهٔ پنل‌های تنظیمات aria-labelledby دارند', paneOwners.length === tabIds.length);
check('هر پنل به یک تب موجود وصل است', paneOwners.every((p) => tabIds.includes(p.owner)));
check('هر تب دقیقاً یک پنل دارد', new Set(paneOwners.map((p) => p.owner)).size === tabIds.length);

// ۵ · کد فعال‌سازی تب‌ها بر اساس aria-labelledby کار می‌کند، نه ایندکس
check('settings-tabs.js پنل را با aria-labelledby تطبیق می‌دهد', /getAttribute\('aria-labelledby'\)/.test(settingsTabs));
check('settings-tabs.js دیگر پنل را با ایندکس پنهان نمی‌کند', !/pane\.hidden\s*=\s*i\s*!==\s*index/.test(settingsTabs));
check('theme-two.js پنل را با aria-labelledby تطبیق می‌دهد', /getAttribute\('aria-labelledby'\)/.test(themeTwo));
check('theme-two.js دیگر پنل را با ایندکس پنهان نمی‌کند', !/panes\[i\]\.hidden=!active/.test(themeTwo));

const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

// بررسی آرم شرکت ملی نفت: تصویر بدون پس‌زمینه، وسط نوار بالا، کوچک.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const indexHtml = read('index.html');
const css = read('design/brand-logo.css');
const sw = read('sw.js');
const logoPath = path.join(root, 'design/icons/nioc-logo.png');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// ── فایل تصویر ──
check('فایل آرم وجود دارد', fs.existsSync(logoPath));
const png = fs.readFileSync(logoPath);
check('فایل آرم PNG معتبر است', png.slice(1, 4).toString() === 'PNG');
// بایت رنگ در IHDR: 8 بیت، رنگ‌نوع ۶ = RGBA (دارای کانال شفافیت)
check('آرم کانال شفافیت دارد (پس‌زمینه حذف شده)', png[25] === 6, 'colorType=' + png[25]);

// ── جای‌گیری در صفحه ──
check('برگهٔ استایل آرم در صفحه بارگذاری می‌شود', /design\/brand-logo\.css/.test(indexHtml));
check('آرم داخل نوار بالا نشسته است',
  /<header class="topbar">[\s\S]*?class="topbar-logo"[\s\S]*?<\/header>/.test(indexHtml));
check('آرم تصویر PNG را نشان می‌دهد', /class="topbar-logo"[\s\S]*?<img[^>]+nioc-logo\.png/.test(indexHtml));
check('آرم متن جانشین دارد', /class="topbar-logo"[\s\S]*?<img[^>]+alt="[^"]+"/.test(indexHtml));

// ── قاعدهٔ چیدمان ──
check('آرم دقیقاً وسط افقی است', /\.topbar-logo\s*\{[^}]*left:\s*50%/.test(css) && /\.topbar-logo\s*\{[^}]*translate\(-50%/.test(css));
check('آرم اندازهٔ کوچک دارد', /\.topbar-logo img\s*\{[^}]*height:\s*3[0-9]px/.test(css));
check('آرم پس‌زمینه یا کادر ندارد', !/\.topbar-logo[^{]*\{[^}]*background/.test(css) && !/\.topbar-logo[^{]*\{[^}]*border:/.test(css));
check('آرم کلیک‌ها را نمی‌گیرد', /\.topbar-logo\s*\{[^}]*pointer-events:\s*none/.test(css));
check('آرم در چاپ حذف می‌شود', /@media print[\s\S]*?\.topbar-logo\s*\{\s*display:\s*none/.test(css));

// ── کش سرویس‌ورکر ──
check('برگهٔ استایل آرم پیش‌کش می‌شود', /'\.\/design\/brand-logo\.css'/.test(sw));
check('تصویر آرم پیش‌کش می‌شود', /'\.\/design\/icons\/nioc-logo\.png'/.test(sw));

let failed = 0;
checks.forEach(function (item) {
  if (!item.ok) failed++;
  console.log((item.ok ? '✓' : '✗') + ' ' + item.name + (item.ok ? '' : '  → ' + item.extra));
});
console.log('\n' + (checks.length - failed) + '/' + checks.length + ' بررسی موفق');
if (failed) process.exit(1);

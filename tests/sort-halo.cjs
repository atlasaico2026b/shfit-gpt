// بررسی هالهٔ نورانی سرستونِ مرتب‌شده: وقتی جدول بر اساس یک ستون مرتب می‌شود،
// دور کادر عنوان همان ستون یک حلقهٔ نورانی با رنگی متفاوت از رنگ ستون‌ها می‌آید.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const tokensCss = read('design/tokens.css');
const toolbarsCss = read('design/toolbars.css');
const spectrumCss = read('design/spectrum.css');
const modules = read('modules.js');
const planner = read('design/shift-planner.js');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// ── توکن رنگ هاله ──
check('توکن رنگ هاله تعریف شده است', /--sort-halo-rgb\s*:/.test(tokensCss));
check('رنگ هاله از پالت گرفته می‌شود، نه مقدار ثابت',
  /--sort-halo-rgb\s*:\s*var\(--c-[a-z]+-rgb\)/.test(tokensCss));

// ── قاعدهٔ هاله روی سرستون مرتب‌شده ──
const haloRule = (toolbarsCss.match(/\.module-sort-th\.is-sorted\s*\{[^}]*\}/) || [''])[0];
check('سرستون مرتب‌شده قاعدهٔ هاله دارد', haloRule.length > 0);
check('هاله از رنگ اختصاصی خودش استفاده می‌کند', /rgba\(var\(--sort-halo-rgb\)/.test(haloRule));
check('هاله حلقهٔ داخلی دارد (inset)', /inset\s+0\s+0\s+0\s+1px/.test(haloRule));
check('هاله درخشش بیرونی دارد', /(^|[^-\w])0\s+0\s+12px/.test(haloRule));
check('هاله انیمیشن تنفس دارد', /animation\s*:\s*atlas-sort-halo/.test(haloRule));
check('کی‌فریم هاله تعریف شده است', /@keyframes\s+atlas-sort-halo\s*\{/.test(toolbarsCss));
check('کاهش حرکت، انیمیشن هاله را خاموش می‌کند',
  /prefers-reduced-motion[\s\S]*?\.module-sort-th\.is-sorted\s*\{\s*animation:\s*none/.test(toolbarsCss));

// ── رنگ هاله با رنگ ستون‌ها یکی نباشد ──
const columnHues = (spectrumCss.match(/--th-hue:\s*var\(--c-([a-z]+)-rgb\)/g) || [])
  .map((m) => m.replace(/.*--c-([a-z]+)-rgb.*/, '$1'));
const haloColor = (tokensCss.match(/--sort-halo-rgb\s*:\s*var\(--c-([a-z]+)-rgb\)/) || [])[1];
check('رنگ هاله با هیچ‌یک از رنگ‌های ستون‌ها یکی نیست',
  haloColor && columnHues.length > 0 && columnHues.indexOf(haloColor) < 0,
  'هاله=' + haloColor + ' ستون‌ها=' + columnHues.join(','));

// ── هر دو مسیر مرتب‌سازی کلاس is-sorted را می‌گذارند ──
check('جدول‌های ماژول کلاس is-sorted را می‌گذارند',
  /module-sort-th'\s*\+\s*\(active\s*\?\s*'\s+is-sorted'/.test(modules));
check('برنامهٔ شیفت هم کلاس is-sorted را می‌گذارد',
  /module-sort-th'\s*\+\s*\(active\s*\?\s*'\s+is-sorted'/.test(planner));

let failed = 0;
checks.forEach(function (item) {
  if (!item.ok) failed++;
  console.log((item.ok ? '✓' : '✗') + ' ' + item.name + (item.ok ? '' : '  → ' + item.extra));
});
console.log('\n' + (checks.length - failed) + '/' + checks.length + ' بررسی موفق');
if (failed) process.exit(1);

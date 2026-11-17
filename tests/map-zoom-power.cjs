// بررسی قدرت بزرگ‌نمایی و رزولوشن نقشه: بازهٔ زوم و حساسیت چرخ ماوس سه برابر
// شده‌اند و هندسهٔ راه‌ها با دقت بیشتری رسم می‌شود تا در بزرگ‌نمایی عمیق پله‌پله
// نشود.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = read('modules.js');
const roads = read('design/roads.js');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// ── ضریب قدرت زوم ──
const powerMatch = modules.match(/const MAP_ZOOM_POWER = (\d+);/);
check('ضریب قدرت زوم تعریف شده است', !!powerMatch);
const power = powerMatch ? Number(powerMatch[1]) : 0;
check('ضریب قدرت زوم ۳ است', power === 3, power);

// ── بازهٔ بزرگ‌نمایی ──
check('بازهٔ پیش‌فرض بزرگ‌نمایی با ضریب قدرت زیاد می‌شود',
  /const maxScale = Number\(opts\.maxScale\) \|\| 8 \* MAP_ZOOM_POWER;/.test(modules));
check('نقشهٔ صفحهٔ ایستگاه‌ها و ویجت داشبورد هر دو ضریب قدرت را می‌گیرند',
  /maxScale: \(map\.closest\('\[data-widget="stations"\]'\) \? 3 : 8\) \* MAP_ZOOM_POWER/.test(modules));

// بازهٔ واقعی: ۸ و ۳ برابر ۳
check('بازهٔ نقشهٔ کامل ۲۴ برابر است', 8 * power === 24, 8 * power);
check('بازهٔ ویجت داشبورد ۹ برابر است', 3 * power === 9, 3 * power);

// ── حساسیت چرخ ماوس ──
check('چرخ ماوس با ضریب قدرت بزرگ‌نمایی می‌کند',
  /Math\.exp\(-event\.deltaY \* 0\.0016 \* MAP_ZOOM_POWER\)/.test(modules));

// ── رزولوشن هندسه ──
check('مسیر راه‌ها با دو رقم اعشار رسم می‌شود', /toFixed\(2\)/.test(roads) && !/percent\.[xy] \* (width|height) \/ 100\)\.toFixed\(1\)/.test(roads));
check('مسیر استان‌های ترکیبی با دو رقم اعشار ساخته می‌شود',
  /out \+= \(command === 'M' \? 'M' : 'L'\) \+ point\[0\]\.toFixed\(2\) \+ ' ' \+ point\[1\]\.toFixed\(2\);/.test(modules));
check('جای شهرهای نقشهٔ ترکیبی درصدی با دو رقم اعشار ذخیره می‌شود',
  /point\[0\] \/ width \* 100\)\.toFixed\(2\)/.test(modules) && /point\[1\] \/ height \* 100\)\.toFixed\(2\)/.test(modules));

// ── دقت کشیدن گره در بزرگ‌نمایی عمیق ──
check('کشیدن گره در بزرگ‌نمایی عمیق دقت بیشتری دارد',
  /const factor = state\.scale > 8 \? 1000 : state\.scale > 1 \? 100 : 10;/.test(modules));

const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log((c.ok ? '✓' : '✗') + ' ' + c.name + (c.ok ? '' : '  → ' + c.extra)));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

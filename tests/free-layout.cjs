// بررسی چیدمان شناور داشبورد: ردیف‌ها بدون فضای خالی پر می‌شوند، عرض/ارتفاع
// آزاد است و موتور چیدمان به داشبورد و ویرایشگر تنظیمات وصل است.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

global.window = global;
require('../design/free-layout.js');

const { planRows } = global.AtlasFreeLayout;
const GAP = 17;
const LIMIT = 1284;

const checks = [];
const check = (name, ok) => checks.push({ name, ok: !!ok });

const widths = [634, 417, 850, 417, 417, 417, 634, 850, 417];
const heights = [278, 223, 180, 227, 180, 264, 180, 310, 617];
const plan = planRows(widths, heights, LIMIT, GAP);

check('همهٔ کادرها در چیدمان جای گرفتند', plan.length === widths.length && plan.every(Boolean));

const rows = {};
plan.forEach(slot => { (rows[slot.y] = rows[slot.y] || []).push(slot); });

check('چند ردیف ساخته شد', Object.keys(rows).length > 1);
check('هر ردیف دقیقاً تا لبهٔ شبکه پر است', Object.keys(rows).every(y => {
  const items = rows[y].sort((a, b) => a.x - b.x);
  const end = items[items.length - 1].x + items[items.length - 1].w;
  return Math.abs(end - LIMIT) <= 1;
}));
check('کادرهای یک ردیف هم‌ارتفاع‌اند', Object.keys(rows).every(y => {
  const items = rows[y];
  return items.every(item => item.h === items[0].h);
}));
check('ردیف‌ها روی هم نمی‌افتند و فقط با فاصلهٔ gap از هم جدا می‌شوند', (() => {
  const bands = Object.keys(rows).map(Number).sort((a, b) => a - b);
  return bands.every((y, index) => index === 0
    ? y === 0
    : Math.abs(y - (bands[index - 1] + rows[bands[index - 1]][0].h + GAP)) <= 1);
})());
check('کادر هم‌عرض با ردیف در همان ردیف می‌ماند', (() => {
  const single = planRows([800, 400], [200, 200], LIMIT, GAP);
  return single[0].y === single[1].y && single[0].x === 0;
})());
check('کادری که جا نمی‌شود به ردیف بعد می‌رود', (() => {
  const split = planRows([900, 900], [200, 200], LIMIT, GAP);
  return split[1].y === 200 + GAP && split[1].x === 0;
})());
check('کادر تنها در ردیف، تمام عرض را می‌گیرد', (() => {
  const alone = planRows([300], [200], LIMIT, GAP);
  return alone[0].w === LIMIT;
})());
check('عرض‌ها هرگز از شبکه بیشتر نمی‌شوند', plan.every(s => s.w > 0 && s.x + s.w <= LIMIT + 1));

// اتصال به برنامه
const index = read('index.html');
const modules = read('modules.js');
const css = read('design/settings-view.css');
check('free-layout.js در index.html پیش از modules.js بارگذاری می‌شود',
  index.indexOf('./design/free-layout.js') > 0 && index.indexOf('./design/free-layout.js') < index.indexOf('./modules.js'));
check('داشبورد از موتور چیدمان شناور استفاده می‌کند', /itemSelector: '\.widget'/.test(modules));
check('ویرایشگر تنظیمات هم از همان موتور استفاده می‌کند', /itemSelector: '\.dash-card'/.test(modules));
check('عرض و ارتفاع هر کادر جداگانه ذخیره می‌شود',
  /rects\[id\] = \{[\s\S]{0,220}w: Math\.round\(size\.w\)[\s\S]{0,60}h: Math\.round\(size\.h \|\| 0\)/.test(modules));
check('کادرها در CSS موقعیت مطلق و آزاد دارند', /\.free-layout > \.widget,[\s\S]{0,80}position: absolute/.test(css));
check('دستگیرهٔ درگ و ریسایز استایل دارد', /\.free-drag \{/.test(css) && /\.free-resize\{|\.free-resize \{/.test(css));
check('هر هشت جهت تغییر اندازه استایل دارد', ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].every(axis =>
  css.indexOf('.free-resize[data-free-resize="' + axis + '"]') >= 0 &&
  css.indexOf('.dash-resize[data-dash-resize="' + axis + '"]') >= 0));
check('هر هشت دستگیره در کادر ویرایشگر ساخته می‌شود', ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].every(axis =>
  modules.indexOf("'" + axis + "'") >= 0 && /data-dash-resize="' \+ axis \+ '"/.test(modules)));
check('حالت چیدمان (دستی/ردیفی) ذخیره می‌شود', /layout\.mode = toggle\.checked \? 'free' : 'pack'/.test(modules));
check('موقعیت دستی (x/y) ذخیره می‌شود', /x: Math\.max\(0, Math\.round\(Number\(size\.x[\s\S]{0,160}y: Math\.max\(0, Math\.round\(Number\(size\.y/.test(modules));
check('چیدمان قدیمی شبکه‌ای از داشبورد حذف شده است', !/node\.style\.gridColumn = span \? 'span ' \+ span : '';/.test(modules));
// رگرسیون: display:block چیدمان آزاد نباید مسیردهی را بشکند و داشبورد را روی همهٔ صفحه‌ها نگه دارد.
check('قاعدهٔ پنهان‌شدن داشبورد بر display:block چیدمان آزاد اولویت دارد',
  /\.free-layout\.route-hidden[\s\S]{0,80}display:\s*none\s*!important/.test(css));
check('قاعدهٔ پنهان‌شدن بعد از قاعدهٔ display:block می‌آید',
  css.indexOf('.free-layout.route-hidden') > css.indexOf('.free-layout {'));

// ── چیدمان دستی و گرانش ─────────────────────────────────────────────────────
const { compact, axisFlags } = global.AtlasFreeLayout;

check('هشت جهت تغییر اندازه درست تفسیر می‌شوند', (() => {
  const w = axisFlags('w'), e = axisFlags('e'), n = axisFlags('n'), s = axisFlags('s');
  const ne = axisFlags('ne'), sw = axisFlags('sw');
  return w.w && !w.e && !w.n && !w.s &&
    e.e && !e.w && n.n && !n.s && s.s && !s.n &&
    ne.n && ne.e && !ne.s && !ne.w &&
    sw.s && sw.w && !sw.n && !sw.e;
})());
check('نام‌های قدیمی ریسایز هنوز کار می‌کنند', (() => {
  const h = axisFlags('h'), both = axisFlags('both');
  return h.s && !h.n && both.s && both.e;
})());

check('کادرهای روی‌هم‌افتاده از هم جدا می‌شوند', (() => {
  const out = compact([
    { x: 0, y: 0, w: 400, h: 200 },
    { x: 100, y: 50, w: 400, h: 200 }
  ], GAP, LIMIT);
  const [first, second] = out.sort((a, b) => a.y - b.y);
  return second.y >= first.y + first.h + GAP - 1;
})());
check('گرانش: کادری که زیرش خالی است بالا می‌آید', (() => {
  const out = compact([{ x: 0, y: 900, w: 300, h: 150 }], GAP, LIMIT);
  return out[0].y === 0;
})());
check('گرانش: کادر دوم می‌نشیند روی کادر اول با فاصلهٔ gap', (() => {
  const out = compact([
    { x: 0, y: 0, w: 300, h: 150 },
    { x: 0, y: 800, w: 300, h: 150 }
  ], GAP, LIMIT).sort((a, b) => a.y - b.y);
  return out[1].y === 150 + GAP;
})());
check('جای دستی افقی حفظ می‌شود (ستون‌ها قاطی نمی‌شوند)', (() => {
  const out = compact([
    { x: 0, y: 0, w: 300, h: 150 },
    { x: 600, y: 400, w: 300, h: 150 }
  ], GAP, LIMIT);
  const left = out.filter(c => c.x === 0)[0];
  const right = out.filter(c => c.x === 600)[0];
  return left.y === 0 && right.y === 0;
})());
check('چیدمان دستی هرگز از عرض صفحه بیرون نمی‌زند', (() => {
  const out = compact([{ x: 5000, y: 0, w: 400, h: 100 }], GAP, LIMIT);
  return out[0].x + out[0].w <= LIMIT + 1;
})());
check('کادر بلند که بالای کادر دیگر می‌نشیند روی آن نمی‌افتد', (() => {
  const out = compact([
    { x: 0, y: 0, w: 300, h: 100 },
    { x: 0, y: 300, w: 300, h: 500 }
  ], GAP, LIMIT).sort((a, b) => a.y - b.y);
  return out[1].y >= out[0].y + out[0].h + GAP - 1;
})());

const failed = checks.filter(item => !item.ok);
checks.forEach(item => console.log((item.ok ? '✓ ' : '✗ ') + item.name));
if (failed.length) {
  console.error('\n' + failed.length + ' بررسی ناموفق');
  process.exit(1);
}
console.log('\n' + checks.length + ' بررسی موفق');

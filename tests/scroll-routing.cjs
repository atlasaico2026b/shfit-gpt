/* آزمون مسیردهی اسکرول: ناحیه‌ای که فقط افقی اسکرول می‌شود نباید چرخ عمودی
   موس را ببلعد (باگ «در بخش شیفت‌ها اسکرول کار نمی‌کند»)، و در عین حال ناحیهٔ
   اسکرول‌شوندهٔ عمودی زیر نشانگر همیشه برنده باشد.
   اجرا: node tests/scroll-routing.cjs */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function el(props) {
  const classes = new Set();
  return Object.assign({
    nodeType: 1,
    parentElement: null,
    style: {},
    scrollTop: 0,
    scrollLeft: 0,
    clientHeight: 100,
    clientWidth: 100,
    scrollHeight: 100,
    scrollWidth: 100,
    hidden: false,
    classList: {
      contains: (name) => classes.has(name),
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
    },
    closest: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 100, height: 100 }),
    contains: () => false,
  }, props);
}

function style(over) {
  return Object.assign({ overflowX: 'visible', overflowY: 'visible', display: 'block', visibility: 'visible', opacity: '1', zIndex: 'auto' }, over);
}

const body = el({ scrollHeight: 5000, clientHeight: 800, querySelectorAll: () => [] });
const sandbox = {
  console, setTimeout, clearTimeout, Date, Math,
  getComputedStyle: node => node.style,
  addEventListener() {},
  removeEventListener() {},
  document: {
    addEventListener() {},
    readyState: 'complete',
    body,
    documentElement: el({}),
    querySelector: () => null,
    querySelectorAll: () => [],
  },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'design/scroll-routing.js'), 'utf8'), sandbox, { filename: 'scroll-routing.js' });

const scroll = sandbox.window.AtlasScroll;
const checks = [];
const check = (name, ok) => checks.push({ name, ok: !!ok });

// زنجیره: body > panel > tableWrap (فقط افقی) > td
const panel = el({ style: style({ overflowY: 'auto' }), scrollHeight: 900, clientHeight: 400, parentElement: body });
body.parentElement = null;
const tableWrap = el({ style: style({ overflowX: 'auto', overflowY: 'auto' }), scrollWidth: 1600, clientWidth: 500, parentElement: panel });
const cell = el({ parentElement: tableWrap });
const text = el({ nodeType: 3, parentElement: cell });

check('جدول پهنِ افقی برای چرخ عمودی انتخاب نمی‌شود', scroll.scrollerAt(cell, 'y') === panel);
check('همان جدول برای چرخ افقی انتخاب می‌شود', scroll.scrollerAt(cell, 'x') === tableWrap);

// ناحیه‌ای که هم افقی و هم عمودی اسکرول می‌شود، چرخ عمودی را می‌گیرد
const both = el({ style: style({ overflow: 'auto', overflowX: 'auto', overflowY: 'auto' }), scrollWidth: 1600, clientWidth: 500, scrollHeight: 900, clientHeight: 400, parentElement: body });
const inner = el({ parentElement: both });
check('ناحیهٔ اسکرول عمودی خودش برنده است', scroll.scrollerAt(inner, 'y') === both);

// وقتی هیچ جد عمودی نیست، null برمی‌گردد تا صفحه اسکرول شود (قفل نمی‌شود)
const only = el({ style: style({ overflowX: 'auto', overflowY: 'visible' }), scrollWidth: 1600, clientWidth: 500, parentElement: body });
check('بدون جد عمودی، اسکرول به صفحه می‌رسد', scroll.scrollerAt(el({ parentElement: only }), 'y') === null);

// عنصر با سرریز عمودی ولی بدون محتوای اضافه «اسکرول‌شونده» شمرده نمی‌شود
const fits = el({ style: style({ overflowY: 'auto' }), scrollHeight: 400, clientHeight: 400, parentElement: body });
check('سرریز بدون محتوای اضافه نادیده گرفته می‌شود', scroll.scrollerAt(el({ parentElement: fits }), 'y') === null);

check('isScrollable برای افقی درست است', scroll.isScrollable(only) === true);
check('isScrollable برای غیراسکرول‌شونده درست است', scroll.isScrollable(fits) === false);

// مهار سرریز فقط روی ناحیه‌ای که واقعاً عمودی اسکرول می‌شود؛ وگرنه چرخ موس
// روی کادر فهرست‌ها بلعیده می‌شد و صفحه حرکت نمی‌کرد.
const containNodes = [tableWrap, both, fits];
sandbox.document.querySelectorAll = () => containNodes;
scroll.refreshContainment();
check('کادر فهرست افقیِ بدون سرریز عمودی مهار نمی‌شود', tableWrap.classList.contains('atlas-scroll-contain') === false);
check('ناحیهٔ اسکرول عمودی مهار می‌شود', both.classList.contains('atlas-scroll-contain') === true);
check('ناحیهٔ بدون محتوای اضافه مهار نمی‌شود', fits.classList.contains('atlas-scroll-contain') === false);

const failed = checks.filter(c => !c.ok);
checks.forEach(c => console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

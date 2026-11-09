// بررسی قاعدهٔ نوشتار عمودی: اصل افقی است و فقط جایی که کلمه در ستون باریک
// جا نمی‌شود، متن از بالا به پایین نوشته می‌شود.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'design/vertical-text.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'design/vertical-text.css'), 'utf8');
const plannerCss = fs.readFileSync(path.join(root, 'design/shift-planner.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// فایل مرورگری است؛ document و canvas را جعل می‌کنیم. هر نویسه ۷px عرض دارد.
global.window = global;
global.document = {
  readyState: 'complete',
  body: {},
  addEventListener: function () {},
  querySelectorAll: function () { return []; },
  createElement: function () {
    return {
      getContext: function () {
        return {
          font: '',
          measureText: function (text) { return { width: String(text).length * 7 }; }
        };
      }
    };
  }
};
global.getComputedStyle = function () {
  return {
    paddingLeft: '0px', paddingRight: '0px',
    fontStyle: 'normal', fontWeight: '400', fontSize: '11px', fontFamily: 'Tahoma',
    display: 'block', visibility: 'visible'
  };
};
new Function('window', 'document', src)(globalThis, global.document);

const vertical = globalThis.AtlasVertical;
if (!vertical) throw new Error('AtlasVertical صادر نشد');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

function fakeCell(text, width) {
  return {
    textContent: text,
    clientWidth: width,
    classList: { contains: function () { return false; }, add: function () {}, remove: function () {} },
    querySelector: function () { return null; }
  };
}

// ── اندازه‌گیری ──
check('عرض بلندترین کلمه اندازه‌گیری می‌شود', vertical.widestWord('مانده کالیبراسیون', '11px Tahoma') === 77,
  vertical.widestWord('مانده کالیبراسیون', '11px Tahoma'));

// ── تصمیم: افقی تا وقتی جا هست، عمودی وقتی کلمه می‌شکند ──
check('کلمهٔ جا‌شده افقی می‌ماند', vertical.decide(fakeCell('وضعیت', 120)) === false);
check('کلمهٔ جا‌نشده عمودی می‌شود', vertical.decide(fakeCell('کالیبراسیون', 40)) === true);
check('متن خالی تصمیم نمی‌گیرد', vertical.decide(fakeCell('', 40)) === null);
check('متن بلندتر از حد تصمیم نمی‌گیرد', vertical.decide(fakeCell('یک متن بسیار بسیار طولانی برای سرستون', 40)) === null);

// ── CSS: قاعدهٔ عمودی از بالا به پایین ──
check('کلاس عمودی writing-mode دارد', /\.atlas-vert\s*\{[^}]*writing-mode:\s*vertical-rl/.test(css));
check('جهت نویسه‌ها mixed است تا کلمه سالم بماند', /\.atlas-vert\s*\{[^}]*text-orientation:\s*mixed/.test(css));
check('سرستون مرتب‌سازی در حالت عمودی ستونی می‌شود', /th\.atlas-vert \.module-sort-btn\s*\{[^}]*flex-direction:\s*column/.test(css));

// ── تقویم شیفت: سرستون روزها در حالت زیاد عمودی می‌شود ──
check('سرستون روز تقویم در حالت عمودی از بالا به پایین است',
  /\.sp-grid \.sp-day-head\.is-vert[\s\S]*?writing-mode:\s*vertical-rl/.test(plannerCss));
check('ستون عمودی تقویم باریک‌تر است', /\.sp-grid \.sp-day-head\.is-vert\s*\{[^}]*min-width:\s*22px/.test(plannerCss));

// ── بارگذاری در صفحه ──
check('فایل CSS عمودی در صفحه بارگذاری می‌شود', /design\/vertical-text\.css/.test(indexHtml));
check('فایل JS عمودی در صفحه بارگذاری می‌شود', /design\/vertical-text\.js/.test(indexHtml));

let failed = 0;
checks.forEach(function (item) {
  if (!item.ok) failed++;
  console.log((item.ok ? '✓' : '✗') + ' ' + item.name + (item.ok ? '' : '  → ' + item.extra));
});
console.log('\n' + (checks.length - failed) + '/' + checks.length + ' بررسی موفق');
if (failed) process.exit(1);

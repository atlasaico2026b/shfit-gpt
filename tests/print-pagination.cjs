// بررسی صفحه‌بندی واقعی برگهٔ چاپ: سطرها بین صفحه‌ها تقسیم می‌شوند، هر صفحه
// جدول مستقل با سرستون کامل خودش است و هیچ سطری نصف نمی‌شود.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'design/print-sheet.js'), 'utf8');

// ── DOM جعلی حداقلی: فقط چیزهایی که paginate استفاده می‌کند ──
function makeNode(tag, height) {
  const node = {
    tagName: tag,
    children: [],
    attrs: {},
    classes: [],
    _height: height || 0,
    parentNode: null,
    offsetHeight: 0,
    getBoundingClientRect: function () { return { height: this._height }; },
    getAttribute: function (key) { return key in this.attrs ? this.attrs[key] : null; },
    setAttribute: function (key, value) { this.attrs[key] = String(value); },
    removeAttribute: function (key) { delete this.attrs[key]; },
    appendChild: function (child) {
      if (child.tagName === '#fragment') {
        child.children.forEach(function (c) { node.children.push(c); c.parentNode = node; });
        child.children = [];
        return child;
      }
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    cloneNode: function (deep) {
      const copy = makeNode(this.tagName, this._height);
      copy.attrs = Object.assign({}, this.attrs);
      copy.classes = this.classes.slice();
      if (deep) this.children.forEach(function (child) { copy.appendChild(child.cloneNode(true)); });
      return copy;
    },
    querySelector: function (selector) {
      if (selector === 'colgroup') return this.children.find(c => c.tagName === 'colgroup') || null;
      return null;
    },
    classList: {
      add: function (name) { if (node.classes.indexOf(name) < 0) node.classes.push(name); }
    }
  };
  Object.defineProperty(node, 'innerHTML', {
    get: function () { return ''; },
    set: function () { this.children = []; }
  });
  Object.defineProperty(node, 'tBodies', {
    get: function () { return this.children.filter(c => c.tagName === 'tbody'); }
  });
  Object.defineProperty(node, 'tHead', {
    get: function () { return this.children.find(c => c.tagName === 'thead') || null; }
  });
  Object.defineProperty(node, 'tFoot', {
    get: function () { return this.children.find(c => c.tagName === 'tfoot') || null; }
  });
  Object.defineProperty(node, 'rows', {
    get: function () { return this.children.filter(c => c.tagName === 'tr'); }
  });
  return node;
}

function makeRow(height) { return makeNode('tr', height); }

function makeTable(rowHeights, theadHeight, tfootHeight) {
  const table = makeNode('table');
  table.attrs.class = 'atlas-print-table';
  table.appendChild(makeNode('colgroup'));
  table.appendChild(makeNode('thead', theadHeight));
  const tbody = makeNode('tbody');
  rowHeights.forEach(function (h) { tbody.appendChild(makeRow(h)); });
  table.appendChild(tbody);
  table.appendChild(makeNode('tfoot', tfootHeight));
  return table;
}

function makeHost(table) {
  const host = makeNode('div');
  host.parentNode = makeNode('body');
  host.querySelector = function (selector) {
    return selector === 'table.atlas-print-table' ? table : null;
  };
  return host;
}

global.window = global;
global.document = {
  createDocumentFragment: function () { return makeNode('#fragment'); },
  createElement: function (tag) { return makeNode(tag); }
};
new Function('window', 'document', src)(globalThis, global.document);
const sheet = globalThis.AtlasPrintSheet;

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// ارتفاع قابل استفاده: ۲۱۰mm منهای سرستون ۱۰۰px، پاصفحه ۴۰px و ۳mm اطمینان.
const avail = sheet.mmToPx(210) - 100 - 40 - sheet.mmToPx(3);
const rowH = Math.floor(avail / 3) + 10; // سه سطر در صفحه جا نمی‌شوند، دو سطر جا می‌شوند

// ── جدول بلند: باید به چند صفحه تقسیم شود ──
const longTable = makeTable([rowH, rowH, rowH, rowH, rowH], 100, 40);
const longHost = makeHost(longTable);
const pageCount = sheet.paginate(longHost);

check('جدول بلند به بیش از یک صفحه تقسیم می‌شود', pageCount >= 2, pageCount);
check('هر صفحه یک جدول مستقل است', longHost.children.length === pageCount, longHost.children.length);
check('همهٔ سطرها حفظ می‌شوند',
  longHost.children.reduce((sum, table) => sum + table.tBodies[0].rows.length, 0) === 5,
  longHost.children.map(t => t.tBodies[0].rows.length).join('+'));
check('هر صفحه سرستون کامل خودش را دارد',
  longHost.children.every(table => table.tHead && table.tHead._height === 100));
check('هر صفحه پاصفحهٔ خودش را دارد', longHost.children.every(table => table.tFoot && table.tFoot._height === 40));
check('هر صفحه colgroup خودش را دارد', longHost.children.every(table => table.children[0].tagName === 'colgroup'));
check('همهٔ صفحه‌ها جز آخری شکست صفحه دارند',
  longHost.children.slice(0, -1).every(table => table.classes.indexOf('atlas-print-page') >= 0));
check('صفحهٔ آخر شکست اضافه ندارد',
  longHost.children[longHost.children.length - 1].classes.indexOf('atlas-print-page') < 0);
check('هیچ صفحه‌ای بیش از ظرفیت سطر ندارد',
  longHost.children.every(table => table.tBodies[0].rows.length * rowH <= avail + 1),
  longHost.children.map(t => t.tBodies[0].rows.length).join('+'));
check('سبک اندازه‌گیری بعد از صفحه‌بندی پاک می‌شود', !('style' in longHost.attrs), JSON.stringify(longHost.attrs));

// ── جدول کوتاه: دست‌نخورده می‌ماند ──
const shortTable = makeTable([20, 20], 100, 40);
const shortHost = makeHost(shortTable);
check('جدول کوتاه صفحه‌بندی نمی‌شود', sheet.paginate(shortHost) === 0);
check('جدول کوتاه دست‌نخورده می‌ماند', shortHost.children.length === 0);

// ── میزبان بدون DOM: خطا نمی‌دهد ──
check('میزبان بدون DOM خطا نمی‌دهد', sheet.paginate({}) === 0);

const failed = checks.filter(c => !c.ok);
checks.forEach(c => console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name + (c.ok || !c.extra ? '' : ' → ' + c.extra)));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
if (failed.length) process.exit(1);

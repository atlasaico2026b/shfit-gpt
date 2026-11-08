/* آزمون اجرای پنجرهٔ «پرونده‌های انتخاب‌شده» با یک DOM ساختگی کوچک.
   اجرا: node tests/record-file-bulk-ui.cjs
   هدف: مسیر واقعی openBulk بدون خطا اجرا شود، فهرست سمت راست به تعداد
   پرونده‌ها ساخته شود، برگهٔ A4 در کادر چپ پر شود و دکمه‌های خروجی گروهی
   به همان تعداد پرونده وصل شوند. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const checks = [];
const check = (name, ok, extra) => checks.push({ name, ok: !!ok, extra: extra || '' });

function makeNode() {
  const node = {
    className: '',
    _html: '',
    dataset: {},
    children: [],
    listeners: {},
    scrollTop: 0,
    attributes: {},
    classList: { toggle() {}, add() {}, remove() {} },
    appendChild(child) { this.children.push(child); },
    remove() { this.removed = true; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelector(selector) { return this._pick(selector); },
    querySelectorAll(selector) { return this._pickAll(selector); },
    _pick(selector) {
      if (selector === '[data-rf-bulk-sheet]') return this._sheet || (this._sheet = makeNode());
      if (selector === '[data-rf-bulk-close]') return this._close || (this._close = makeNode());
      return makeNode();
    },
    _pickAll(selector) {
      if (selector === '[data-rf-bulk-index]') {
        const count = (this._html.match(/data-rf-bulk-index="/g) || []).length;
        return Array.from({ length: count }, (_, index) => {
          const item = makeNode();
          item.dataset.rfBulkIndex = String(index);
          return item;
        });
      }
      if (selector === '[data-rf-bulk-export]') {
        return ['print', 'doc', 'xls', 'csv'].map(format => {
          const button = makeNode();
          button.dataset.rfBulkExport = format;
          return button;
        });
      }
      return [];
    },
  };
  Object.defineProperty(node, 'innerHTML', {
    get() { return this._html; },
    set(value) { this._html = String(value); },
  });
  return node;
}

const data = {
  employees: [
    { id: 'e1', firstName: 'مریم', lastName: 'احمدی', personnelId: '10423', status: 'فعال' },
    { id: 'e2', firstName: 'علی', lastName: 'رضایی', personnelId: '10424', status: 'فعال' },
  ],
  missions: [],
  leaves: [],
  shifts: [],
  notes: [],
};

const sandbox = {
  console, TextEncoder, Blob, Buffer, Date, Math, JSON, setTimeout, clearTimeout,
  atob: value => Buffer.from(value, 'base64').toString('binary'),
  document: {
    addEventListener() {},
    querySelector() { return null; },
    getElementById() { return null; },
    createElement: makeNode,
    body: {
      children: [],
      appendChild(child) { this.children.push(child); },
      get lastChild() { return this.children[this.children.length - 1] || null; },
      classList: { add() {}, remove() {} },
    },
  },
};
sandbox.window = sandbox;
sandbox.ATLAS_MODULES = {
  getData: () => data,
  spec: () => ({ title: 'کارکنان', subtitle: 'پروندهٔ پرسنلی' }),
  fieldsFor: () => [
    { key: 'firstName', label: 'نام', type: 'text' },
    { key: 'lastName', label: 'نام خانوادگی', type: 'text' },
    { key: 'personnelId', label: 'شمارهٔ پرسنلی', type: 'text' },
    { key: 'status', label: 'وضعیت', type: 'text' },
  ],
  formatJalali: value => String(value),
};
vm.createContext(sandbox);
for (const file of ['design/export-docs.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
}
vm.runInContext(fs.readFileSync(path.join(root, 'design/record-file.js'), 'utf8'), sandbox, { filename: 'record-file.js' });

const api = sandbox.window.AtlasRecordFile;
let error = null;
try {
  api.openBulk('employees', ['e1', 'e2']);
} catch (thrown) {
  error = thrown;
}
check('openBulk بدون خطا اجرا می‌شود', !error, error ? String(error && error.message) : '');

const backdrop = sandbox.document.body.lastChild;
check('پنجره به body اضافه شده است', !!backdrop && backdrop.className === 'rf-bulk-backdrop');
const html = backdrop ? backdrop.innerHTML : '';
check('کادر باریک فهرست سمت راست هست', /class="rf-bulk-list"/.test(html));
check('کادر برگهٔ A4 سمت چپ هست', /class="rf-bulk-sheet"/.test(html));
check('نوار افقی خروجی گروهی زیر دو کادر هست', /class="rf-bulk-foot"/.test(html));
check('فهرست به تعداد پرونده‌ها آیتم دارد', (html.match(/data-rf-bulk-index="/g) || []).length === 2);
check('عنوان‌ها بر اساس نام مرتب شده‌اند',
  html.indexOf('علی رضایی') >= 0 && html.indexOf('علی رضایی') < html.indexOf('مریم احمدی'));
check('هر چهار قالب خروجی گروهی هست',
  ['print', 'doc', 'xls', 'csv'].every(format => html.indexOf('data-rf-bulk-export="' + format + '"') >= 0));
check('برگهٔ A4 پروندهٔ اول در کادر چپ رندر شده است',
  !!backdrop && /class="rf-sheet/.test(backdrop._sheet ? backdrop._sheet.innerHTML : ''));
check('دکمهٔ بستن وصل شده است', !!backdrop && (backdrop._close.listeners.click || []).length === 1);
check('حالت پیش‌فرض «پرونده‌ها» است', /rf-bulk-modal is-files/.test(html));

// برگهٔ گروهی فقط اطلاعات اختصاصی همان منو را دارد: جدول‌های مرخصی، مأموریت و
// یادداشت که مال منوهای دیگرند در نمایش گروهی نمی‌آیند (ولی در پروندهٔ تک‌نفرهٔ
// همان منو، مثل قبل، دیده می‌شوند).
data.leaves = [{ id: 'l1', employeeId: 'e2', leaveType: 'استحقاقی', startDate: '2026-01-01', endDate: '2026-01-03', status: 'تأییدشده' }];
data.missions = [{ id: 'm1', title: 'ماموریت تهران', crewIds: ['e2'], startAt: '2026-01-05T08:00:00.000Z', destination: 'تهران', status: 'انجام‌شده' }];
data.notes = [{ id: 'n1', title: 'پیگیری مدارک', responsibleId: 'e2', date: '2026-01-06', status: 'باز' }];
let scopedError = null;
try {
  api.openBulk('employees', ['e2']);
} catch (thrown) {
  scopedError = thrown;
}
check('openBulk با دادهٔ منوهای دیگر بدون خطا اجرا می‌شود', !scopedError, scopedError ? String(scopedError && scopedError.message) : '');
const scopedBackdrop = sandbox.document.body.lastChild;
const scopedHtml = scopedBackdrop && scopedBackdrop._sheet ? scopedBackdrop._sheet.innerHTML : '';
check('برگهٔ گروهی جدول مرخصی منوی دیگر را نمی‌آورد', scopedHtml.indexOf('مرخصی‌ها') < 0);
check('برگهٔ گروهی جدول مأموریت منوی دیگر را نمی‌آورد', scopedHtml.indexOf('مأموریت‌های مرتبط') < 0);
check('برگهٔ گروهی جدول یادداشت منوی دیگر را نمی‌آورد', scopedHtml.indexOf('پیگیری‌های محوله') < 0);
check('برگهٔ گروهی اطلاعات اختصاصی کارمند را دارد', scopedHtml.indexOf('شمارهٔ پرسنلی') >= 0);

api.openModule('employees', 'e2');
const singleBackdrop = sandbox.document.body.lastChild;
const singleHtml = singleBackdrop ? singleBackdrop.innerHTML : '';
check('پروندهٔ تک‌نفرهٔ همان منو مثل قبل جدول‌های مرتبط را دارد',
  singleHtml.indexOf('مرخصی‌ها') >= 0 && singleHtml.indexOf('مأموریت‌های مرتبط') >= 0);

// همان پنجره در حالت «سوابق»: چیدمان یکی است، برگهٔ سوابق جای پرونده می‌آید.
// e2 = «علی رضایی» و در فهرست مرتب، اولین مورد است.
data.history = [
  { module: 'employees', recordId: 'e2', action: 'ویرایش', at: '2026-01-03T09:30:00.000Z', changes: [{ field: 'وضعیت', before: 'مرخصی', after: 'فعال' }] },
  { module: 'employees', recordId: 'e1', action: 'ثبت', at: '2026-01-04T10:00:00.000Z', changes: [] }
];
let historyError = null;
try {
  api.openBulk('employees', ['e1', 'e2'], 'history');
} catch (thrown) {
  historyError = thrown;
}
check('openBulk در حالت سوابق بدون خطا اجرا می‌شود', !historyError, historyError ? String(historyError && historyError.message) : '');
const historyBackdrop = sandbox.document.body.lastChild;
const historyHtml = historyBackdrop ? historyBackdrop.innerHTML : '';
check('عنوان پنجرهٔ سوابق درست است', historyHtml.indexOf('سوابق انتخاب‌شده') >= 0);
check('حالت سوابق کلاس رنگی خودش را دارد', /rf-bulk-modal is-history/.test(historyHtml));
check('همان دو کادر و نوار پایین در حالت سوابق هم هست',
  /class="rf-bulk-list"/.test(historyHtml) && /class="rf-bulk-sheet"/.test(historyHtml) && /class="rf-bulk-foot"/.test(historyHtml));
check('برگهٔ سوابق در کادر چپ رندر شده است',
  !!historyBackdrop && /class="rf-sheet/.test(historyBackdrop._sheet ? historyBackdrop._sheet.innerHTML : ''));
check('برگهٔ سوابق تغییرات همان رکورد را نشان می‌دهد',
  !!historyBackdrop && (historyBackdrop._sheet ? historyBackdrop._sheet.innerHTML : '').indexOf('وضعیت: «مرخصی» ← «فعال»') >= 0);
check('پنجرهٔ قبلی بسته شده است', !!backdrop && backdrop.removed === true);

const failed = checks.filter(c => !c.ok);
checks.forEach(c => console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name + (c.extra ? ' — ' + c.extra : '')));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

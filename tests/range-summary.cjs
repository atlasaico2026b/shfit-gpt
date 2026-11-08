/* آزمون اجرای «روزهای مأموریت/مرخصی هر فرد در بازه».
   اجرا: node tests/range-summary.cjs
   هدف: تابع واقعی rangeReportSummary با یک DOM ساختگی کوچک اجرا شود و
   تعداد روزهای هر کارمند، بریدن روزهای بیرون بازه، کنار گذاشتن مأموریت
   لغوشده و مرخصی ردشده، و مجموع بدون غیبت را بسنجد. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const checks = [];
const check = (name, ok, extra) => checks.push({ name, ok: !!ok, extra: extra || '' });

const sandbox = {
  console, TextEncoder, TextDecoder, Blob, Buffer, Date, Math, JSON, Promise,
  setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams,
  atob: value => Buffer.from(value, 'base64').toString('binary'),
  btoa: value => Buffer.from(value, 'binary').toString('base64'),
  navigator: { language: 'fa' },
  location: { search: '', href: 'http://localhost/' },
  document: {
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    getElementById() { return null; },
    createElement() {
      return {
        style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
        setAttribute() {}, appendChild() {}, addEventListener() {},
        querySelector() { return null; }, querySelectorAll() { return []; },
      };
    },
    body: { children: [], appendChild(child) { this.children.push(child); }, classList: { add() {}, remove() {} } },
    documentElement: { setAttribute() {}, getAttribute() { return null; } },
  },
};
sandbox.window = sandbox;
sandbox.addEventListener = function () {};
sandbox.removeEventListener = function () {};
sandbox.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'modules.js'), 'utf8'), sandbox, { filename: 'modules.js' });

const api = sandbox.ATLAS_MODULES;
check('تابع خلاصهٔ بازه در دسترس است', typeof api.rangeReportSummary === 'function');

const data = api.getData();
data.employees = [
  { id: 'e1', firstName: 'مریم', lastName: 'احمدی', personnelId: '10423' },
  { id: 'e2', firstName: 'علی', lastName: 'رضایی', personnelId: '10424' },
  { id: 'e3', firstName: 'سارا', lastName: 'کریمی', personnelId: '10425' },
];
data.missions = [
  { id: 'm1', employeeId: 'e1', startAt: '2026-01-05T08:00:00.000Z', endAt: '2026-01-07T18:00:00.000Z', status: 'انجام‌شده' },
  { id: 'm2', crewIds: ['e2'], startAt: '2026-01-06T08:00:00.000Z', endAt: '2026-01-06T18:00:00.000Z', status: 'در جریان' },
  { id: 'm3', employeeId: 'e1', startAt: '2026-01-01T08:00:00.000Z', endAt: '2026-01-02T18:00:00.000Z', status: 'لغو‌شده' },
];
data.leaves = [
  { id: 'l1', employeeId: 'e1', leaveType: 'استحقاقی', startDate: '2026-01-01', endDate: '2026-01-03', status: 'تأییدشده' },
  { id: 'l2', employeeId: 'e1', leaveType: 'استعلاجی', startDate: '2026-01-05', endDate: '2026-01-05', status: 'تأییدشده' },
  { id: 'l3', employeeId: 'e2', leaveType: 'غیبت', startDate: '2026-01-02', endDate: '2026-01-04', status: 'تأییدشده' },
  { id: 'l4', employeeId: 'e2', leaveType: 'تشویقی', startDate: '2026-01-06', endDate: '2026-01-06', status: 'تأییدشده' },
  { id: 'l5', employeeId: 'e3', leaveType: 'استحقاقی', startDate: '2026-01-01', endDate: '2026-01-10', status: 'ردشده' },
  { id: 'l6', employeeId: 'e3', leaveType: 'بدون حقوق', startDate: '2026-01-01', endDate: '2026-01-02', status: 'تأییدشده' },
];

const byName = summary => {
  const map = {};
  summary.rows.forEach(row => { map[row.name] = row; });
  return map;
};

// ── مأموریت‌ها ──
const missions = api.rangeReportSummary('2026-01-01', '2026-01-31', 'mission-days');
const mRows = byName(missions);
check('همهٔ کارکنان در فهرست مأموریت می‌آیند', missions.rows.length === 3);
check('روزهای مأموریت هر کارمند درست شمرده می‌شود',
  mRows['مریم احمدی'].total === 3 && mRows['علی رضایی'].total === 1 && mRows['سارا کریمی'].total === 0,
  JSON.stringify(missions.rows.map(r => [r.name, r.total])));
check('مأموریت لغوشده شمرده نمی‌شود', mRows['مریم احمدی'].count === 1);
check('همراهان مأموریت هم شمرده می‌شوند', mRows['علی رضایی'].count === 1);
check('فهرست مأموریت بر اساس روز نزولی مرتب است', missions.rows[0].name === 'مریم احمدی');

const clipped = api.rangeReportSummary('2026-01-06', '2026-01-07', 'mission-days');
check('روزهای بیرون بازه بریده می‌شوند', byName(clipped)['مریم احمدی'].total === 2,
  String(byName(clipped)['مریم احمدی'].total));

// ── مرخصی‌ها ──
const leaves = api.rangeReportSummary('2026-01-01', '2026-01-31', 'leave-days');
const lRows = byName(leaves);
check('ستون‌های ثابت مرخصی ساخته می‌شوند',
  ['استحقاقی', 'استعلاجی', 'غیبت', 'تشویقی'].every(type => leaves.types.indexOf(type) >= 0),
  leaves.types.join(','));
check('نوع مرخصی تازه (بدون حقوق) هم ستون می‌گیرد', leaves.types.indexOf('بدون حقوق') >= 0);
check('روزهای استحقاقی و استعلاجی هر کارمند درست است',
  lRows['مریم احمدی'].days['استحقاقی'] === 3 && lRows['مریم احمدی'].days['استعلاجی'] === 1);
check('مجموع مرخصی، غیبت را حساب نمی‌کند',
  lRows['علی رضایی'].days['غیبت'] === 3 && lRows['علی رضایی'].days['تشویقی'] === 1 && lRows['علی رضایی'].total === 1,
  JSON.stringify(lRows['علی رضایی']));
check('مرخصی ردشده شمرده نمی‌شود', !lRows['سارا کریمی'].days['استحقاقی'] && lRows['سارا کریمی'].total === 2);
check('مجموع مرخصی مریم ۴ روز است', lRows['مریم احمدی'].total === 4);

// ── جدول ──
const table = api.rangeReportSummaryTable(leaves);
check('جدول خلاصه سرستون کارمند و مجموع دارد',
  table.indexOf('کارمند') >= 0 && table.indexOf('مجموع مرخصی (بدون غیبت)') >= 0);
check('جدول خلاصه ردیف جمع دارد', /<tfoot>/.test(table) && table.indexOf('مجموع') >= 0);
check('جدول خلاصه هر سه کارمند را دارد',
  table.indexOf('مریم احمدی') >= 0 && table.indexOf('علی رضایی') >= 0 && table.indexOf('سارا کریمی') >= 0);

const failed = checks.filter(c => !c.ok);
checks.forEach(c => console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name + (c.extra ? ' — ' + c.extra : '')));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

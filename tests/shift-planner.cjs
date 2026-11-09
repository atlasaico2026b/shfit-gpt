// بررسی موتور برنامه‌ریز شیفت: روز هفته، قانون هفتگی، چرخش، تخصیص، تغییر وضعیت و مرخصی.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'design/shift-planner.js'), 'utf8');

// فایل مرورگری است؛ فقط برای بارگذاری، document و window را جعل می‌کنیم.
const listeners = [];
const handlers = {};
global.window = global;
global.document = {
  addEventListener: function (name, fn) {
    listeners.push(name);
    (handlers[name] = handlers[name] || []).push(fn);
  },
  querySelectorAll: function () { return []; }
};
new Function('window', 'document', src)(globalThis, global.document);

const planner = globalThis.AtlasShiftPlanner;
if (!planner) throw new Error('AtlasShiftPlanner صادر نشد');
const e = planner.engine;

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// ── روز هفته: هفتهٔ ایرانی از شنبه ──
// ۲۰۲۶-۱۱-۰۷ = شنبه
check('شنبه = ۰', e.weekdayIndex('2026-11-07') === 0, e.weekdayIndex('2026-11-07'));
check('یکشنبه = ۱', e.weekdayIndex('2026-11-08') === 1, e.weekdayIndex('2026-11-08'));
check('چهارشنبه = ۴', e.weekdayIndex('2026-11-11') === 4, e.weekdayIndex('2026-11-11'));
check('جمعه = ۶', e.weekdayIndex('2026-11-13') === 6, e.weekdayIndex('2026-11-13'));

// ── حساب روز ──
check('addDays مثبت', e.addDays('2026-11-07', 3) === '2026-11-10', e.addDays('2026-11-07', 3));
check('addDays منفی', e.addDays('2026-11-07', -1) === '2026-11-06', e.addDays('2026-11-07', -1));
check('addDays روی ماه', e.addDays('2026-10-31', 1) === '2026-11-01', e.addDays('2026-10-31', 1));
check('rangeDates ۳ روز', e.rangeDates('2026-11-07', '2026-11-09').length === 3);
check('rangeDates معکوس خالی', e.rangeDates('2026-11-09', '2026-11-07').length === 0);

// ── مدت شیفت ──
check('۱۲ ساعت', e.durationMinutes('07:00', '19:00') === 720, e.durationMinutes('07:00', '19:00'));
check('شیفت شب از نیمه‌شب', e.durationMinutes('19:00', '07:00') === 720, e.durationMinutes('19:00', '07:00'));
check('متن مدت', e.durationText('08:00', '14:00') === '6 ساعت', e.durationText('08:00', '14:00'));
check('مدت با دقیقه', e.durationText('08:00', '14:30') === '6:30 ساعت', e.durationText('08:00', '14:30'));

// ── قالب چرخش ──
const template = {
  id: 't1',
  name: '۲/۲/۴',
  shifts: [
    { code: 'ص', label: 'صبح‌کار', from: '07:00', to: '19:00' },
    { code: 'ش', label: 'شب‌کار', from: '19:00', to: '07:00' }
  ],
  rotation: [{ code: 'ص', days: 2 }, { code: 'ش', days: 2 }, { code: e.OFF, days: 4 }],
  cycleStart: '2026-11-07'
};
check('طول چرخه ۸', e.cycleLength(template) === 8, e.cycleLength(template));
check('روز ۰ صبح', e.rotationCodeAt(template, '2026-11-07') === 'ص', e.rotationCodeAt(template, '2026-11-07'));
check('روز ۱ صبح', e.rotationCodeAt(template, '2026-11-08') === 'ص', e.rotationCodeAt(template, '2026-11-08'));
check('روز ۲ شب', e.rotationCodeAt(template, '2026-11-09') === 'ش', e.rotationCodeAt(template, '2026-11-09'));
check('روز ۳ شب', e.rotationCodeAt(template, '2026-11-10') === 'ش', e.rotationCodeAt(template, '2026-11-10'));
check('روز ۴ استراحت', e.rotationCodeAt(template, '2026-11-11') === e.OFF, e.rotationCodeAt(template, '2026-11-11'));
check('روز ۷ استراحت', e.rotationCodeAt(template, '2026-11-14') === e.OFF, e.rotationCodeAt(template, '2026-11-14'));
check('روز ۸ دوباره صبح', e.rotationCodeAt(template, '2026-11-15') === 'ص', e.rotationCodeAt(template, '2026-11-15'));
check('قبل از شروع چرخه هم می‌چرخد', e.rotationCodeAt(template, '2026-11-06') === e.OFF, e.rotationCodeAt(template, '2026-11-06'));

// ── قانون هفتگی ──
const office = {
  id: 'm1', name: 'اداری', kind: 'office',
  weekly: e.defaultWeekly('08:00', '14:00')
};
check('شنبه کاری است', !!e.weeklyRuleAt(office, '2026-11-07'));
check('جمعه تعطیل است', e.weeklyRuleAt(office, '2026-11-13') === null);
check('ساعت شنبه ۸ تا ۱۴', e.weeklyRuleAt(office, '2026-11-07').from === '08:00');

// ── وضعیت کامل ──
const state = {
  employees: [{ id: 'e1', firstName: 'علی', lastName: 'رضایی' }],
  shiftMethods: [office, { id: 'm2', name: 'چرخشی', kind: 'rotating', templateId: 't1' }],
  shiftTemplates: [template],
  shiftAssignments: [{ id: 'a1', employeeId: 'e1', methodId: 'm1', from: '2026-11-01', to: '', active: true }],
  shiftOverrides: [],
  leaves: []
};

let status = e.resolve(state, 'e1', '2026-11-07');
check('شنبه روزکار', status.label === 'روزکار' && status.from === '08:00', status.label);
status = e.resolve(state, 'e1', '2026-11-13');
check('جمعه استراحت', status.kind === 'off', status.label);
status = e.resolve(state, 'e1', '2026-10-20');
check('قبل از تخصیص: بدون تخصیص', status.kind === 'none', status.label);

// تخصیص چرخشی از تاریخ بعد، مقدم بر تخصیص قبلی
state.shiftAssignments.push({ id: 'a2', employeeId: 'e1', methodId: 'm2', from: '2026-11-07', to: '', active: true });
status = e.resolve(state, 'e1', '2026-11-07');
check('تخصیص تازه‌تر مقدم است', status.label === 'صبح‌کار', status.label);
status = e.resolve(state, 'e1', '2026-11-11');
check('روز چهارم چرخه استراحت', status.kind === 'off', status.label);

// تغییر وضعیت مقدم بر همه
state.shiftOverrides.push({
  id: 'o1', employeeId: 'e1', kind: 'overtime', templateId: 't1', code: 'ش',
  from: '2026-11-11', to: '2026-11-11', permanent: false, note: 'اضافه‌کار', createdAt: '2026-11-01T10:00:00Z'
});
status = e.resolve(state, 'e1', '2026-11-11');
check('اضافه‌کار بر چرخه مقدم است', status.kind === 'overtime' && status.label === 'شب‌کار', status.label);
check('کامنت تغییر وضعیت می‌آید', status.note === 'اضافه‌کار', status.note);
check('روز بعد دوباره چرخه', e.resolve(state, 'e1', '2026-11-12').kind === 'off');

// مرخصی تأییدشده منعکس می‌شود، تأییدنشده نه
state.leaves.push({ id: 'l1', employeeId: 'e1', status: 'تأییدشده', startDate: '2026-11-15', endDate: '2026-11-16', leaveType: 'استحقاقی' });
check('مرخصی تأییدشده', e.resolve(state, 'e1', '2026-11-15').kind === 'leave');
check('مرخصی چندروزه', e.resolve(state, 'e1', '2026-11-16').kind === 'leave');
check('بعد از مرخصی برمی‌گردد', e.resolve(state, 'e1', '2026-11-17').kind !== 'leave');
state.leaves.push({ id: 'l2', employeeId: 'e1', status: 'در انتظار بررسی', startDate: '2026-11-20', endDate: '2026-11-20' });
check('مرخصی تأییدنشده در شیفت نمی‌آید', e.resolve(state, 'e1', '2026-11-20').kind !== 'leave');

// تخصیص غیرفعال نادیده گرفته می‌شود
state.shiftAssignments.forEach(function (a) { a.active = false; });
check('تخصیص غیرفعال', e.resolve(state, 'e1', '2026-11-07').kind === 'none');

// ── خلاصه‌ها ──
check('خلاصهٔ روش اداری', e.methodSummary(office).indexOf('08:00–14:00') >= 0, e.methodSummary(office));
check('خلاصهٔ چرخش', e.templateSummary(template).indexOf('استراحت') >= 0, e.templateSummary(template));

// ── قالب شیفت به‌عنوان روش کاری مستقیم ──────────────────────────────────
// کشویی «روش کاری» هر دو نوع قالب را دارد؛ اگر کارمند مستقیم به قالب شیفت
// وصل شود، روزهای کارش از الگوی همان قالب می‌آید.
check('شناسهٔ قالب شیفت هم روش شیفتی است', e.methodIsShift(state, 't1') === true);
check('قالب روزکاری شیفتی نیست', e.methodIsShift(state, 'm1') === false);
check('methodRef قالب را برمی‌گرداند', (e.methodRef(state, 't1').template || {}).id === 't1');
check('methodRef روش را برمی‌گرداند', (e.methodRef(state, 'm1').method || {}).id === 'm1');
check('methodLabel نام قالب شیفت', e.methodLabel(state, 't1') === '۲/۲/۴', e.methodLabel(state, 't1'));
check('methodLabel نام قالب روزکاری', e.methodLabel(state, 'm1') === 'اداری', e.methodLabel(state, 'm1'));

const directState = {
  employees: [{ id: 'e1', firstName: 'علی', lastName: 'رضایی' }],
  shiftMethods: [office],
  shiftTemplates: [template],
  shiftAssignments: [{ id: 'a9', employeeId: 'e1', methodId: 't1', from: '2026-11-07', to: '', active: true }],
  shiftOverrides: [],
  leaves: []
};
check('تخصیص مستقیم قالب شیفت: روز اول صبح‌کار',
  e.resolve(directState, 'e1', '2026-11-07').label === 'صبح‌کار', e.resolve(directState, 'e1', '2026-11-07').label);
check('تخصیص مستقیم قالب شیفت: روز سوم شب‌کار',
  e.resolve(directState, 'e1', '2026-11-09').label === 'شب‌کار', e.resolve(directState, 'e1', '2026-11-09').label);
check('تخصیص مستقیم قالب شیفت: روز پنجم استراحت',
  e.resolve(directState, 'e1', '2026-11-11').kind === 'off');
check('تخصیص مستقیم قالب شیفت: چرخه از تاریخ تخصیص شمرده می‌شود',
  e.resolve(directState, 'e1', '2026-11-15').label === 'صبح‌کار', e.resolve(directState, 'e1', '2026-11-15').label);

// ── گزینه‌های کشویی «روش کاری»: هر دو نوع، با رنگ جدا ──
const optionsHtml = e.methodOptions(state, '');
check('کشویی روش کاری گروه قالب شیفت دارد', optionsHtml.indexOf('sp-opt-shift') >= 0);
check('کشویی روش کاری گروه قالب روزکاری دارد', optionsHtml.indexOf('sp-opt-method') >= 0);
check('گزینهٔ قالب شیفت با کلاس آبی', optionsHtml.indexOf('class="sp-opt-shift"') >= 0);
check('گزینهٔ قالب روزکاری با کلاس قرمز', optionsHtml.indexOf('class="sp-opt-method"') >= 0);
check('قالب شیفت پیش از قالب روزکاری می‌آید',
  optionsHtml.indexOf('sp-opt-shift') < optionsHtml.indexOf('sp-opt-method'));
check('هر دو قالب در کشویی هستند',
  optionsHtml.indexOf('value="t1"') >= 0 && optionsHtml.indexOf('value="m1"') >= 0);
check('گزینهٔ انتخاب‌شده selected می‌شود',
  e.methodOptions(state, 't1').indexOf('value="t1" class="sp-opt-shift" selected') >= 0,
  e.methodOptions(state, 't1').slice(0, 200));

// ── تغییر روش کاری: باید همان تخصیص به‌روزرسانی شود، نه تخصیص تازه ────────
// باگ: quickAssign تخصیص تازه با همان تاریخ شروع اضافه می‌کرد و چون
// assignmentFor بین دو تاریخ شروع یکسان اولی را برمی‌گرداند، تخصیص قبلی
// برنده می‌ماند و تغییر روش کاری هیچ اثری نداشت.
const changeState = {
  employees: [{ id: 'e1', firstName: 'علی', lastName: 'رضایی' }],
  shiftMethods: [office, { id: 'm2', name: 'چرخشی', kind: 'rotating', templateId: 't1' }],
  shiftTemplates: [template],
  shiftAssignments: [{ id: 'a1', employeeId: 'e1', methodId: 'm1', from: '2026-11-01', to: '', active: true }],
  shiftOverrides: [],
  leaves: []
};
check('قبل از تغییر: روزکار', e.resolve(changeState, 'e1', '2026-11-01').label === 'روزکار',
  e.resolve(changeState, 'e1', '2026-11-01').label);
e.setAssignmentMethod(changeState, 'e1', 'm2', '2026-11-07', 'a2');
check('بعد از تغییر: صبح‌کار', e.resolve(changeState, 'e1', '2026-11-01').label === 'صبح‌کار',
  e.resolve(changeState, 'e1', '2026-11-01').label);
check('تغییر روش کاری تخصیص تازه اضافه نمی‌کند', changeState.shiftAssignments.length === 1,
  changeState.shiftAssignments.length);
check('تغییر روش کاری شناسهٔ تخصیص را حفظ می‌کند', changeState.shiftAssignments[0].id === 'a1',
  changeState.shiftAssignments[0].id);
check('تغییر روش کاری تاریخ شروع را دست نمی‌زند', changeState.shiftAssignments[0].from === '2026-11-01',
  changeState.shiftAssignments[0].from);
e.setAssignmentMethod(changeState, 'e1', 'm1', '2026-11-07', 'a3');
check('برگشت به روش قبلی هم اعمال می‌شود', e.resolve(changeState, 'e1', '2026-11-01').label === 'روزکار',
  e.resolve(changeState, 'e1', '2026-11-01').label);
check('برگشت هم تخصیص تازه نمی‌سازد', changeState.shiftAssignments.length === 1);

// کارمندی که تخصیص ندارد، تخصیص تازه می‌گیرد.
const freshState = { employees: [], shiftMethods: [office], shiftTemplates: [], shiftAssignments: [], shiftOverrides: [], leaves: [] };
e.setAssignmentMethod(freshState, 'e9', 'm1', '2026-11-07', 'a9');
check('کارمند بدون تخصیص، تخصیص تازه می‌گیرد', freshState.shiftAssignments.length === 1);
check('تخصیص تازه از تاریخ داده‌شده شروع می‌شود', freshState.shiftAssignments[0].from === '2026-11-07');

// ── رویدادها ثبت شده‌اند ──
check('گوش‌دهنده‌های سراسری ثبت شدند', listeners.length >= 4, listeners.join(','));

// ── فیلتر «روش کاری»: مقدار گزینه باید شناسهٔ روش باشد، نه نامش ──────────
// ریشهٔ باگ: گزینه‌ها با نام روش ساخته می‌شدند ولی filteredEmployees مقدار
// فیلتر را با assignment.methodId مقایسه می‌کند؛ پس هیچ‌وقت تطبیق نمی‌خورد.
const filterState = {
  employees: [
    { id: 'e1', firstName: 'علی', lastName: 'رضایی', workplace: 'تهران', assignedWorkplace: 'ایستگاه ۹' },
    { id: 'e2', firstName: 'سارا', lastName: 'احمدی', workplace: 'تهران', assignedWorkplace: 'ایستگاه ۲' },
    { id: 'e3', firstName: 'مریم', lastName: 'کریمی', workplace: 'کرج', assignedWorkplace: 'ایستگاه ۳' },
    // هم‌ایستگاهی با سارا: برای آزمودن مرتب‌سازی کارکنان داخل یک محل خدمت.
    { id: 'e4', firstName: 'حسن', lastName: 'موسوی', workplace: 'تهران', assignedWorkplace: 'ایستگاه ۲' }
  ],
  shiftMethods: [
    { id: 'm1', name: 'اداری', kind: 'office', weekly: e.defaultWeekly('08:00', '14:00') },
    { id: 'm2', name: 'چرخشی', kind: 'rotating', templateId: 't1' }
  ],
  shiftTemplates: [template],
  shiftAssignments: [
    { id: 'a1', employeeId: 'e1', methodId: 'm1', from: '2026-11-01', to: '', active: true },
    { id: 'a2', employeeId: 'e2', methodId: 'm2', from: '2026-11-01', to: '', active: true }
  ],
  shiftOverrides: [],
  leaves: []
};

let bodyHtml = '';
const fakeBody = {
  get innerHTML() { return bodyHtml; },
  set innerHTML(value) { bodyHtml = value; }
};
const fakeHost = {
  innerHTML: '',
  contains: function () { return true; },
  querySelector: function (selector) { return selector === '[data-sp-body]' ? fakeBody : null; },
  querySelectorAll: function () { return []; }
};
const exportCalls = [];
const toasts = [];
const fakeBridge = {
  esc: function (value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
  faDigits: function (value) {
    return String(value).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[Number(d)]; });
  },
  getData: function () { return filterState; },
  todayIso: function () { return '2026-11-07'; },
  rootWrap: function (html) { return html; },
  pageHead: function () { return ''; },
  formatJalali: function (iso) { return iso; },
  jalaliInputValue: function (iso) { return iso; },
  employeeName: function (employee) { return [employee.firstName, employee.lastName].filter(Boolean).join(' '); },
  enhanceJalaliInputs: function () {},
  legacySchedule: function () {},
  toast: function (message) { toasts.push(message); },
  runExport: function (rows, title, base, format) {
    exportCalls.push({ rows: rows, title: title, base: base, format: format });
  },
  save: function () { return Promise.resolve(true); },
  confirm: function () { return Promise.resolve(true); }
};

function fire(name, target) {
  (handlers[name] || []).forEach(function (fn) { fn({ target: target }); });
}
function clickOn(attribute, value) {
  fire('click', {
    closest: function (selector) {
      return selector === '[' + attribute + ']' ? { getAttribute: function () { return value; } } : null;
    }
  });
}
function changeFilter(key, value) {
  fire('change', {
    closest: function (selector) {
      return selector === '[data-sp-filter]' ? { getAttribute: function () { return key; }, value: value } : null;
    }
  });
}
function clickExport(format, scope) {
  fire('click', {
    closest: function (selector) {
      return selector === '[data-sp-export]'
        ? { getAttribute: function (key) { return key === 'data-sp-export' ? format : scope; } }
        : null;
    }
  });
}
function changeCity(city, checked) {
  fire('change', {
    closest: function (selector) {
      return selector === '[data-sp-select-city]'
        ? { getAttribute: function () { return city; }, checked: checked }
        : null;
    }
  });
}
// مقداری که رابط کاربری واقعاً برای یک گزینه می‌فرستد را از HTML بیرون می‌کشد؛
// آزمون باید همان مسیری را برود که کاربر می‌رود، نه مقدار دلخواه ما.
function optionValueFor(html, key, label) {
  const rest = html.split('data-sp-filter="' + key + '"')[1] || '';
  const pattern = /<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g;
  let match;
  while ((match = pattern.exec(rest))) {
    if (match[2] === label) return match[1];
  }
  return null;
}

planner.render(fakeHost, fakeBridge);
clickOn('data-sp-tab', 'assign');

check('تب تخصیص رندر شد', fakeHost.innerHTML.indexOf('تخصیص روش کاری به کارکنان') >= 0);
check('مقدار گزینهٔ فیلتر شناسهٔ روش است', fakeHost.innerHTML.indexOf('<option value="m1"') >= 0);
check('برچسب گزینه نام روش است', fakeHost.innerHTML.indexOf('>اداری</option>') >= 0);
check('مقدار گزینه هرگز نام روش نیست', fakeHost.innerHTML.indexOf('<option value="اداری"') < 0);

const m1Value = optionValueFor(fakeHost.innerHTML, 'method', 'اداری');
const m2Value = optionValueFor(fakeHost.innerHTML, 'method', 'چرخشی');
check('گزینهٔ «اداری» مقدار شناسه دارد', m1Value === 'm1', m1Value);
check('گزینهٔ «چرخشی» مقدار شناسه دارد', m2Value === 'm2', m2Value);

changeFilter('method', m1Value);
check('فیلتر «اداری» فقط کارمند m1 را می‌آورد', bodyHtml.indexOf('علی رضایی') >= 0 && bodyHtml.indexOf('سارا احمدی') < 0);
check('فیلتر «اداری» در فهرست ۱ نفر', bodyHtml.indexOf('۱ نفر') >= 0);

changeFilter('method', m2Value);
check('فیلتر «چرخشی» فقط کارمند m2 را می‌آورد', bodyHtml.indexOf('سارا احمدی') >= 0 && bodyHtml.indexOf('علی رضایی') < 0);

clickOn('data-sp-reset', '');
check('پاک‌کردن فیلترها هر دو کارمند را برمی‌گرداند', bodyHtml.indexOf('علی رضایی') >= 0 && bodyHtml.indexOf('سارا احمدی') >= 0);

// همان فیلتر در تب تقویم هم باید با شناسه کار کند
clickOn('data-sp-tab', 'calendar');
check('فیلتر روش در تقویم هم شناسه‌محور است', fakeHost.innerHTML.indexOf('<option value="m1"') >= 0);
changeFilter('method', optionValueFor(fakeHost.innerHTML, 'method', 'چرخشی'));
check('فیلتر روش در تقویم اعمال می‌شود', bodyHtml.indexOf('سارا احمدی') >= 0 && bodyHtml.indexOf('علی رضایی') < 0);
clickOn('data-sp-reset', '');

// ── سطر شهر: عنوان «مکان»، انتخاب گروهی و مرتب‌سازی ─────────────────────
clickOn('data-sp-tab', 'assign');
check('عنوان «مکان» در سرستون جدول است',
  fakeHost.innerHTML.indexOf('data-sp-sort-city') >= 0 && fakeHost.innerHTML.indexOf('مکان') >= 0);
check('سرستون «مکان» پیش از سطرهای شهر می‌آید',
  fakeHost.innerHTML.indexOf('data-sp-sort-city') < fakeHost.innerHTML.indexOf('sp-group-city'));
check('سرستون «مکان» در thead است',
  fakeHost.innerHTML.indexOf('data-sp-sort-city') < fakeHost.innerHTML.indexOf('</thead>'));
check('دکمهٔ «مکان» دیگر داخل سطر شهر نیست',
  fakeHost.innerHTML.indexOf('sp-group-title') < 0);

// ستون‌ها باید با سرستون‌ها هم‌شمار باشند، وگرنه جدول به‌هم می‌ریزد.
const assignThead = (fakeHost.innerHTML.match(/<thead>[\s\S]*?<\/thead>/) || [''])[0];
const thCount = (assignThead.match(/<th\b/g) || []).length;
check('سرستون‌های تخصیص ۷ ستون دارند', thCount === 7, thCount);
const e1At = fakeHost.innerHTML.indexOf('data-sp-select="e1"');
const e1Row = fakeHost.innerHTML.slice(fakeHost.innerHTML.lastIndexOf('<tr>', e1At), fakeHost.innerHTML.indexOf('</tr>', e1At));
const e1Cells = (e1Row.match(/<td\b/g) || []).length;
check('ردیف کارمند هم ۷ ستون دارد', e1Cells === 7, e1Cells);
check('ردیف کارمند ستون مکان را پر می‌کند', e1Row.indexOf('sp-city-cell') >= 0);
check('سطر شهر چک‌باکس انتخاب گروهی دارد', fakeHost.innerHTML.indexOf('data-sp-select-city="تهران"') >= 0);
check('سطر شهر کرج هم چک‌باکس دارد', fakeHost.innerHTML.indexOf('data-sp-select-city="کرج"') >= 0);

let tehranAt = fakeHost.innerHTML.indexOf('sp-group-city">تهران');
let karajAt = fakeHost.innerHTML.indexOf('sp-group-city">کرج');
check('ترتیب پیش‌فرض صعودی است', tehranAt >= 0 && karajAt >= 0 && tehranAt < karajAt, tehranAt + '/' + karajAt);
check('فلش صعودی نشان داده می‌شود', fakeHost.innerHTML.indexOf('↑') >= 0);

// refresh() فقط بدنهٔ تب را دوباره می‌سازد، پس از این به بعد bodyHtml را می‌خوانیم.
clickOn('data-sp-sort-city', '');
tehranAt = bodyHtml.indexOf('sp-group-city">تهران');
karajAt = bodyHtml.indexOf('sp-group-city">کرج');
check('کلیک روی عنوان، ترتیب را نزولی می‌کند', karajAt >= 0 && karajAt < tehranAt, karajAt + '/' + tehranAt);
check('فلش نزولی نشان داده می‌شود', bodyHtml.indexOf('↓') >= 0);

clickOn('data-sp-sort-city', '');
tehranAt = bodyHtml.indexOf('sp-group-city">تهران');
karajAt = bodyHtml.indexOf('sp-group-city">کرج');
check('کلیک دوم دوباره صعودی می‌کند', tehranAt >= 0 && tehranAt < karajAt, tehranAt + '/' + karajAt);

changeCity('تهران', true);
check('انتخاب شهر تهران هر دو کارمندش را تیک می‌زند',
  bodyHtml.indexOf('data-sp-select="e1" checked') >= 0 && bodyHtml.indexOf('data-sp-select="e2" checked') >= 0);
check('کارمند شهر دیگر تیک نمی‌خورد', bodyHtml.indexOf('data-sp-select="e3" checked') < 0);
check('چک‌باکس شهر پس از انتخاب کامل، تیک‌خورده است', bodyHtml.indexOf('data-sp-select-city="تهران" checked') >= 0);

changeCity('تهران', false);
check('برداشتن تیک شهر، هر دو کارمندش را آزاد می‌کند',
  bodyHtml.indexOf('data-sp-select="e1" checked') < 0 && bodyHtml.indexOf('data-sp-select="e2" checked') < 0);

// ── سرستون‌های قابل‌مرتب‌سازی ────────────────────────────────────────────
clickOn('data-sp-tab', 'assign');
['name', 'station', 'job', 'method', 'range'].forEach(function (key) {
  check('سرستون «' + key + '» قابل مرتب‌سازی است', fakeHost.innerHTML.indexOf('data-sp-sort-key="' + key + '"') >= 0);
});
check('سرستون‌ها از کلاس‌های استاندارد منوها استفاده می‌کنند',
  fakeHost.innerHTML.indexOf('module-sort-th') >= 0 && fakeHost.innerHTML.indexOf('module-sort-btn') >= 0 &&
  fakeHost.innerHTML.indexOf('module-sort-caret') >= 0);

// پیش‌فرض: نام، صعودی — داخل هر محل خدمت. «ح» پیش از «س» می‌آید.
check('ترتیب پیش‌فرض بر اساس نام است',
  bodyHtml.indexOf('حسن موسوی') < bodyHtml.indexOf('سارا احمدی'),
  bodyHtml.indexOf('حسن موسوی') + '/' + bodyHtml.indexOf('سارا احمدی'));

// کلیک روی «نام» جهت را برمی‌گرداند
clickOn('data-sp-sort-key', 'name');
check('کلیک دوباره روی «نام» نزولی می‌کند',
  bodyHtml.indexOf('سارا احمدی') < bodyHtml.indexOf('حسن موسوی'),
  bodyHtml.indexOf('سارا احمدی') + '/' + bodyHtml.indexOf('حسن موسوی'));

// «محل خدمت» گروه‌های ایستگاه را داخل هر شهر مرتب می‌کند. پیش‌فرض صعودی است،
// پس کلیک اول نزولی می‌کند: ایستگاه ۹ پیش از ایستگاه ۲.
clickOn('data-sp-sort-key', 'station');
check('کلیک روی محل خدمت نزولی می‌کند',
  bodyHtml.indexOf('sp-station-cell" colspan="2">ایستگاه ۹') <
    bodyHtml.indexOf('sp-station-cell" colspan="2">ایستگاه ۲'),
  bodyHtml.indexOf('sp-station-cell" colspan="2">ایستگاه ۹') + '/' +
    bodyHtml.indexOf('sp-station-cell" colspan="2">ایستگاه ۲'));
check('فلش نزولی روی سرستون', bodyHtml.indexOf('↓') >= 0);

clickOn('data-sp-sort-key', 'station');
check('کلیک دوم روی محل خدمت دوباره صعودی می‌کند',
  bodyHtml.indexOf('sp-station-cell" colspan="2">ایستگاه ۲') <
    bodyHtml.indexOf('sp-station-cell" colspan="2">ایستگاه ۹'),
  bodyHtml.indexOf('sp-station-cell" colspan="2">ایستگاه ۲') + '/' +
    bodyHtml.indexOf('sp-station-cell" colspan="2">ایستگاه ۹'));
check('سرستون فعال نشانه‌گذاری می‌شود', bodyHtml.indexOf('is-sorted') >= 0 && bodyHtml.indexOf('↑') >= 0);

// «روش کاری»: کارمند بدون روش پیش از چرخشی می‌آید (هر دو در ایستگاه ۲).
clickOn('data-sp-sort-key', 'method');
check('مرتب‌سازی بر اساس روش کاری کار می‌کند',
  bodyHtml.indexOf('حسن موسوی') < bodyHtml.indexOf('سارا احمدی'),
  bodyHtml.indexOf('حسن موسوی') + '/' + bodyHtml.indexOf('سارا احمدی'));

// مرتب‌سازی داخل هر گروه شهر اعمال می‌شود، نه روی کل جدول
check('گروه‌بندی شهر با مرتب‌سازی حفظ می‌شود',
  bodyHtml.indexOf('sp-group-city\">تهران') >= 0 && bodyHtml.indexOf('sp-group-city\">کرج') >= 0);

// ── گروه‌بندی دوسطحی: شهر ← محل خدمت ← کارکنان ──────────────────────────
// شیفت‌ها در محل خدمت برقرار می‌شوند و یک شهر می‌تواند چند ایستگاه با نفرات و
// نوع شیفت جدا داشته باشد، پس محل خدمت سطح گروه‌بندی داخل هر شهر است.
// کلید ایستگاه در صفت HTML کد می‌شود؛ NUL در تجزیهٔ HTML به U+FFFD تبدیل می‌شد.
const station2Key = encodeURIComponent('تهران') + '|' + encodeURIComponent('ایستگاه ۲');
clickOn('data-sp-tab', 'assign');
check('سطر محل خدمت رندر می‌شود', bodyHtml.indexOf('sp-station-row') >= 0);
check('سطر محل خدمت چک‌باکس انتخاب گروهی دارد',
  bodyHtml.indexOf('data-sp-select-station="' + station2Key + '"') >= 0,
  bodyHtml.indexOf('data-sp-select-station'));
check('سطر محل خدمت نام ایستگاه را نشان می‌دهد',
  bodyHtml.indexOf('sp-station-cell" colspan="2">ایستگاه ۲') >= 0);
check('سطر محل خدمت تعداد نفرات را نشان می‌دهد',
  /sp-station-cell" colspan="2">ایستگاه ۲<span class="sp-group-count">· ۲ نفر/.test(bodyHtml));
check('سطر محل خدمت روش کاری همان ایستگاه را نشان می‌دهد',
  bodyHtml.indexOf('sp-station-method') >= 0 && bodyHtml.indexOf('چرخشی') >= 0);

// سطر شهر پیش از سطرهای ایستگاه‌هایش می‌آید و ایستگاه‌ها پیش از کارکنانشان.
const tehranRowAt = bodyHtml.indexOf('sp-group-city\">تهران');
const station2At = bodyHtml.indexOf('sp-station-cell" colspan="2">ایستگاه ۲');
const station9At = bodyHtml.indexOf('sp-station-cell" colspan="2">ایستگاه ۹');
const saraAt = bodyHtml.indexOf('سارا احمدی');
const aliAt = bodyHtml.indexOf('علی رضایی');
check('سطر شهر پیش از سطر ایستگاه‌ها می‌آید', tehranRowAt >= 0 && tehranRowAt < station2At,
  tehranRowAt + '/' + station2At);
check('هر ایستگاه پیش از کارکنان خودش می‌آید',
  station2At < saraAt && station9At < aliAt, station2At + '/' + saraAt + '/' + station9At + '/' + aliAt);
check('کارکنان یک ایستگاه زیر همان ایستگاه می‌مانند',
  station2At < saraAt && saraAt < station9At, station2At + '/' + saraAt + '/' + station9At);

// انتخاب یک ایستگاه فقط نفرات همان ایستگاه را تیک می‌زند.
fire('change', {
  closest: function (selector) {
    return selector === '[data-sp-select-station]'
      ? { getAttribute: function () { return station2Key; }, checked: true }
      : null;
  }
});
check('انتخاب ایستگاه، هر دو کارمندش را تیک می‌زند',
  bodyHtml.indexOf('data-sp-select="e2" checked') >= 0 && bodyHtml.indexOf('data-sp-select="e4" checked') >= 0);
check('انتخاب ایستگاه، کارمند ایستگاه دیگر را تیک نمی‌زند',
  bodyHtml.indexOf('data-sp-select="e1" checked') < 0);
check('چک‌باکس ایستگاه پس از انتخاب کامل، تیک‌خورده است',
  bodyHtml.indexOf('data-sp-select-station="' + station2Key + '" checked') >= 0);
check('چک‌باکس شهر با انتخاب یک ایستگاه کامل تیک نمی‌خورد',
  bodyHtml.indexOf('data-sp-select-city="تهران" checked') < 0);

fire('change', {
  closest: function (selector) {
    return selector === '[data-sp-select-station]'
      ? { getAttribute: function () { return station2Key; }, checked: false }
      : null;
  }
});
check('برداشتن تیک ایستگاه، نفراتش را آزاد می‌کند',
  bodyHtml.indexOf('data-sp-select="e2" checked') < 0 && bodyHtml.indexOf('data-sp-select="e4" checked') < 0);

// ── سطر محل خدمت: مارک‌شدنی و خروجی مارک‌شده‌ها ──────────────────────────
check('سطر محل خدمت نشانهٔ مارک دارد',
  bodyHtml.indexOf('data-sp-mark-station="' + station2Key + '"') >= 0);

// ریشهٔ باگ: کلید ایستگاه با NUL ساخته می‌شد و تجزیه‌گر HTML هر U+0000 را با
// U+FFFD عوض می‌کند؛ در نتیجه مارک کردن ایستگاه هیچ کارمندی را انتخاب نمی‌کرد.
const stationAttr = (bodyHtml.match(/data-sp-select-station="([^"]*)"/) || [])[1] || '';
check('کلید ایستگاه کاراکتر کنترلی ندارد',
  stationAttr.length > 0 && !/[\u0000-\u001f]/.test(stationAttr), JSON.stringify(stationAttr));
check('کلید ایستگاه به شهر و محل خدمت برمی‌گردد',
  stationAttr.split('|').map(decodeURIComponent).join(' / ') === 'تهران / ایستگاه ۲', stationAttr);
check('سطر محل خدمت بدون انتخاب، مارک‌نشده است',
  bodyHtml.indexOf('sp-station-row is-marked') < 0);
check('دکمه‌های خروجی مارک‌شده‌ها در نوار انتخاب هست',
  bodyHtml.indexOf('data-sp-scope="selected"') >= 0 && bodyHtml.indexOf('خروجی مارک‌شده‌ها') >= 0);
check('بدون انتخاب، خروجی مارک‌شده‌ها غیرفعال است',
  /data-sp-marked-export disabled/.test(bodyHtml));

// کلیک روی خود سطر (نه چک‌باکس) ایستگاه را مارک می‌کند.
clickOn('data-sp-mark-station', station2Key);
check('کلیک روی سطر محل خدمت نفراتش را مارک می‌کند',
  bodyHtml.indexOf('data-sp-select="e2" checked') >= 0 && bodyHtml.indexOf('data-sp-select="e4" checked') >= 0);
check('سطر مارک‌شده نشانهٔ is-marked می‌گیرد',
  bodyHtml.indexOf('sp-station-row is-marked') >= 0);
check('با انتخاب، خروجی مارک‌شده‌ها فعال می‌شود',
  /data-sp-marked-export disabled/.test(bodyHtml) === false);

const markedRows = planner.buildSelectedRows();
check('خروجی مارک‌شده‌ها فقط نفرات مارک‌شده را دارد', markedRows.length === 3, markedRows.length);
check('خروجی مارک‌شده‌ها نام و محل خدمت را دارد',
  markedRows.some(function (row) {
    return row.indexOf('سارا احمدی') >= 0 && row.indexOf('ایستگاه ۲') >= 0;
  }),
  JSON.stringify(markedRows));
check('خروجی مارک‌شده‌ها کارمند مارک‌نشده را ندارد',
  JSON.stringify(markedRows).indexOf('علی رضایی') < 0);

clickExport('xlsx', 'selected');
check('خروجی مارک‌شده‌ها با قالب انتخابی گرفته می‌شود',
  exportCalls.length === 1 && exportCalls[0].format === 'xlsx', exportCalls.length);
check('خروجی مارک‌شده‌ها فقط ردیف‌های مارک‌شده را می‌فرستد',
  exportCalls[0] && exportCalls[0].rows.length === 3, exportCalls[0] && exportCalls[0].rows.length);
check('نام فایل خروجی مارک‌شده‌ها مشخص است',
  exportCalls[0] && exportCalls[0].base.indexOf('marked-assignments') >= 0, exportCalls[0] && exportCalls[0].base);

// کلیک دوم روی سطر، مارک را برمی‌دارد.
clickOn('data-sp-mark-station', station2Key);
check('کلیک دوم روی سطر مارک را برمی‌دارد',
  bodyHtml.indexOf('data-sp-select="e2" checked') < 0 && bodyHtml.indexOf('sp-station-row is-marked') < 0);

// بدون انتخاب، خروجی گرفتن پیام راهنما می‌دهد و فایلی نمی‌سازد.
const beforeEmpty = exportCalls.length;
clickExport('csv', 'selected');
check('خروجی بدون مارک، فایل نمی‌سازد', exportCalls.length === beforeEmpty);
check('خروجی بدون مارک، پیام راهنما می‌دهد',
  toasts.length > 0 && toasts[toasts.length - 1].indexOf('مارک') >= 0, toasts[toasts.length - 1]);

// ── ظاهر سطر شهر: سفید، متن مشکی، ۳۰٪ بزرگ‌تر ───────────────────────────
const plannerCss = fs.readFileSync(path.join(root, 'design/shift-planner.css'), 'utf8');
const groupRule = (plannerCss.match(/\.sp-table tbody tr\.sp-group-row td\s*\{[^}]*\}/) || [''])[0];
check('سطر شهر پس‌زمینهٔ سفید دارد', /background:\s*#fff/.test(groupRule), groupRule);
check('سطر شهر متن مشکی دارد', /color:\s*#000/.test(groupRule), groupRule);
check('سطر شهر ۳۰٪ بزرگ‌تر از متن جدول است', /font-size:\s*1\.3em/.test(groupRule), groupRule);
check('انتخابگر از قاعدهٔ راه‌راه جدول قوی‌تر است',
  /\.sp-table tbody tr\.sp-group-row td/.test(groupRule), groupRule);

// ── ظاهر سطر محل خدمت: سبز کم‌رنگ و پررنگ ────────────────────────────────
const stationRule = (plannerCss.match(/\.sp-table tbody tr\.sp-station-row td\s*\{[^}]*\}/) || [''])[0];
check('سطر محل خدمت سبز کم‌رنگ است', /background:\s*#d5efdf/.test(stationRule), stationRule);
check('سطر محل خدمت پررنگ است', /font-weight:\s*700/.test(stationRule), stationRule);
check('سطر محل خدمت از ردیف کارکنان بزرگ‌تر است', /font-size:\s*1\.08em/.test(stationRule), stationRule);
check('سطر مارک‌شده سبز پررنگ‌تر دارد',
  /tr\.sp-station-row\.is-marked td\s*\{[^}]*background:\s*#b6e6c8/.test(plannerCss));

// ── الگوی روزبه‌روز قالب: «روز اول، روز دوم … تا آخر قالب» ──────────────
check('الگو از rotation فشرده باز می‌شود', e.templatePattern(template).length === 8, e.templatePattern(template).length);
check('الگو ترتیب روزها را می‌دهد',
  e.templatePattern(template).join('') === 'صصشش' + e.OFF + e.OFF + e.OFF + e.OFF,
  e.templatePattern(template).join(''));

const patternTemplate = {
  id: 't2', name: 'الگویی', shifts: template.shifts,
  pattern: ['ص', 'ش', e.OFF], cycleStart: '2026-11-07'
};
check('قالب pattern-محور طول ۳ دارد', e.cycleLength(patternTemplate) === 3, e.cycleLength(patternTemplate));
check('روز اول الگو صبح', e.rotationCodeAt(patternTemplate, '2026-11-07') === 'ص');
check('روز دوم الگو شب', e.rotationCodeAt(patternTemplate, '2026-11-08') === 'ش');
check('روز سوم الگو استراحت', e.rotationCodeAt(patternTemplate, '2026-11-09') === e.OFF);
check('روز چهارم دوباره صبح', e.rotationCodeAt(patternTemplate, '2026-11-10') === 'ص');
check('فشرده‌سازی الگو',
  JSON.stringify(e.compressPattern(['ص', 'ص', 'ش', e.OFF])) ===
  JSON.stringify([{ code: 'ص', days: 2 }, { code: 'ش', days: 1 }, { code: e.OFF, days: 1 }]),
  JSON.stringify(e.compressPattern(['ص', 'ص', 'ش', e.OFF])));

// ── یک تب برای قالب شیفت و روش کاری ─────────────────────────────────────
clickOn('data-sp-tab', 'methods');
check('تب جداگانهٔ قالب‌ها حذف شده است', fakeHost.innerHTML.indexOf('data-sp-tab="templates"') < 0);
check('عنوان تب هر دو را دارد', fakeHost.innerHTML.indexOf('قالب شیفت و روش کاری') >= 0);
check('سطر یک دو دکمهٔ ساخت دارد',
  fakeHost.innerHTML.indexOf('data-sp-new="template"') >= 0 &&
  fakeHost.innerHTML.indexOf('data-sp-new="method"') >= 0);
check('دکمهٔ ساخت قالب شیفت برچسب درست دارد',
  fakeHost.innerHTML.indexOf('+ ساخت قالب شیفت') >= 0);
check('دکمهٔ ساخت قالب روزکاری برچسب درست دارد',
  fakeHost.innerHTML.indexOf('+ ساخت قالب روزکاری') >= 0);
check('انتخابگر قرصی قدیمی حذف شده است', fakeHost.innerHTML.indexOf('sp-template-picker') < 0);
check('پنل الگوی قالب قدیمی حذف شده است', fakeHost.innerHTML.indexOf('sp-pattern-head') < 0);
check('دو کادر چپ و راست وجود دارد', fakeHost.innerHTML.indexOf('sp-split') >= 0);
check('کادر قالب‌های شیفت هست', fakeHost.innerHTML.indexOf('قالب‌های شیفت') >= 0);
check('کادر قالب‌های روزکاری هست', fakeHost.innerHTML.indexOf('قالب‌های روزکاری') >= 0);
check('کادر شیفت پیش از کادر روزکاری می‌آید',
  fakeHost.innerHTML.indexOf('قالب‌های شیفت') < fakeHost.innerHTML.indexOf('قالب‌های روزکاری'));
check('قالب موجود در کادر شیفت هست', fakeHost.innerHTML.indexOf('data-sp-pick-template="t1"') >= 0);
check('هر دو قالب روزکاری هم‌زمان دیده می‌شوند',
  bodyHtml.indexOf('چرخشی') >= 0 && bodyHtml.indexOf('اداری') >= 0);

clickOn('data-sp-pick-template', 't1');
check('کلیک روی کارت قالب آن را فعال می‌کند', bodyHtml.indexOf('sp-pick-card is-active') >= 0);
check('انتخاب قالب فهرست روزکاری را فیلتر نمی‌کند',
  bodyHtml.indexOf('چرخشی') >= 0 && bodyHtml.indexOf('اداری') >= 0);

// ── پنجره‌ها: نوع روش کاری پرسیده نمی‌شود و خروجی فرد کار می‌کند ─────────
function makeElement() {
  const el = {
    className: '', innerHTML: '', parentNode: null, children: [], attrs: {},
    setAttribute: function (key, value) { el.attrs[key] = value; },
    getAttribute: function (key) { return el.attrs[key] == null ? null : el.attrs[key]; },
    appendChild: function (child) { child.parentNode = el; el.children.push(child); return child; },
    removeChild: function (child) {
      el.children = el.children.filter(function (item) { return item !== child; });
      child.parentNode = null;
    },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    insertAdjacentHTML: function () {},
    remove: function () {}
  };
  return el;
}
document.createElement = function () { return makeElement(); };
document.body = makeElement();

function clickAttr(selector, value) {
  fire('click', {
    closest: function (sel) {
      return sel === selector ? { getAttribute: function () { return value; } } : null;
    }
  });
}
function currentModal() { return document.body.children[document.body.children.length - 1]; }

clickOn('data-sp-tab', 'methods');
clickOn('data-sp-pick-template', 't1'); // کلیک دوباره انتخاب را برمی‌دارد
clickAttr('[data-sp-new="method"]', '');
let methodModal = currentModal();
check('پنجرهٔ قالب روزکاری نوع را نمی‌پرسد', methodModal.innerHTML.indexOf('name="kind"') < 0);
check('پنجرهٔ قالب روزکاری انتخاب قالب شیفت دارد',
  methodModal.innerHTML.indexOf('data-sp-method-template') >= 0);
check('گزینهٔ «بدون قالب» در انتخابگر هست',
  methodModal.innerHTML.indexOf('>بدون قالب — روزکار هفتگی</option>') >= 0);
check('روزکار قوانین هفتگی را نشان می‌دهد',
  methodModal.innerHTML.indexOf('data-sp-week-block') >= 0 &&
  methodModal.innerHTML.indexOf('data-sp-week-block hidden') < 0);
check('روزکار بلوک الگوی شیفت را پنهان می‌کند',
  methodModal.innerHTML.indexOf('data-sp-pattern-block hidden') >= 0);
clickAttr('[data-sp-close]', '');

clickOn('data-sp-pick-template', 't1');
clickAttr('[data-sp-new="method"]', '');
methodModal = currentModal();
check('قالب شیفتِ فعال پیش‌انتخاب شده است',
  methodModal.innerHTML.indexOf('value="t1" selected') >= 0);
check('قالب روزکاری شیفتی بلوک الگو را نشان می‌دهد',
  methodModal.innerHTML.indexOf('data-sp-pattern-block') >= 0 &&
  methodModal.innerHTML.indexOf('data-sp-pattern-block hidden') < 0);
check('قالب روزکاری شیفتی روزهای هفته را پنهان می‌کند',
  methodModal.innerHTML.indexOf('data-sp-week-block hidden') >= 0);
clickAttr('[data-sp-close]', '');

// دکمه‌های خروجی پنجرهٔ «شیفت یک نفر» باید فعال باشند.
// ریشهٔ باگ: onSectionClick فقط کلیک داخل بخش را می‌گرفت و پنجره بیرون آن است،
// پس هیچ‌کدام از دکمه‌های خروجی پنجره کار نمی‌کردند.
fakeBridge.runExport = function (rows, title, base, format) {
  exportCalls.push({ rows: rows, title: title, base: base, format: format });
};
fakeBridge.exportSlug = function () { return 'person'; };
// آزمون‌های خروجی مارک‌شده‌ها قبلاً یک فراخوانی ثبت کرده‌اند؛ این بخش از صفر می‌شمارد.
exportCalls.length = 0;

clickOn('data-sp-person', 'e1');
const personModal = currentModal();
check('پنجرهٔ شیفت یک نفر دکمهٔ خروجی دارد', personModal.innerHTML.indexOf('data-sp-export="csv"') >= 0);

const savedContains = fakeHost.contains;
fakeHost.contains = function () { return false; };
fire('click', {
  closest: function (sel) {
    if (sel === '[data-sp-export]') {
      return { getAttribute: function (key) { return key === 'data-sp-export' ? 'csv' : 'person'; } };
    }
    return null;
  }
});
fakeHost.contains = savedContains;
check('دکمهٔ خروجی پنجرهٔ فرد کار می‌کند', exportCalls.length === 1, exportCalls.length);
check('خروجی فرد با قالب CSV گرفته می‌شود', exportCalls[0] && exportCalls[0].format === 'csv');
check('خروجی فرد از ردیف‌های همان فرد ساخته می‌شود', exportCalls[0] && exportCalls[0].rows.length > 1);
clickAttr('[data-sp-close]', '');

// ── شروع چرخه از تخصیص، نه از قالب ──────────────────────────────────────
check('rotationCodeAt تاریخ شروع را از تخصیص می‌گیرد',
  e.rotationCodeAt(template, '2026-11-09', '2026-11-09') === 'ص',
  e.rotationCodeAt(template, '2026-11-09', '2026-11-09'));
check('rotationCodeAt با شروع دیرتر جابه‌جا می‌شود',
  e.rotationCodeAt(template, '2026-11-07', '2026-11-09') === e.OFF,
  e.rotationCodeAt(template, '2026-11-07', '2026-11-09'));

// قالب cycleStart دیگری دارد؛ اگر موتور از آن استفاده کند این آزمون‌ها می‌شکنند.
const cycleState = {
  employees: [{ id: 'e9', firstName: 'تست', lastName: 'چرخه' }],
  shiftMethods: [{ id: 'm9', name: 'چرخشی', kind: 'rotating', templateId: 't9' }],
  shiftTemplates: [{
    id: 't9', name: 'ق', shifts: template.shifts,
    pattern: ['ص', 'ش', e.OFF], cycleStart: '2026-01-01'
  }],
  shiftAssignments: [{ id: 'a9', employeeId: 'e9', methodId: 'm9', from: '2026-11-07', to: '', active: true }],
  shiftOverrides: [], leaves: []
};
check('چرخه از تاریخ تخصیص شروع می‌شود',
  e.resolve(cycleState, 'e9', '2026-11-07').label === 'صبح‌کار',
  e.resolve(cycleState, 'e9', '2026-11-07').label);
check('روز دوم چرخه از تاریخ تخصیص',
  e.resolve(cycleState, 'e9', '2026-11-08').label === 'شب‌کار',
  e.resolve(cycleState, 'e9', '2026-11-08').label);
check('روز سوم چرخه از تاریخ تخصیص استراحت', e.resolve(cycleState, 'e9', '2026-11-09').kind === 'off');

// پنجرهٔ قالب دیگر تاریخ شروع چرخه نمی‌پرسد
clickAttr('[data-sp-new="template"]', '');
const templateModal = currentModal();
check('پنجرهٔ قالب فیلد شروع چرخه ندارد', templateModal.innerHTML.indexOf('name="cycleStart"') < 0);
check('پنجرهٔ قالب الگوی روزها دارد', templateModal.innerHTML.indexOf('data-sp-pattern') >= 0);
clickAttr('[data-sp-close]', '');

// ریشهٔ باگ: گزینه‌های «الگوی روزها» فقط هنگام باز شدن پنجره ساخته می‌شدند،
// پس شیفتی که در «شیفت‌های روز» اضافه می‌شد تا بستن و باز کردن دوباره در
// انتخابگر روزها دیده نمی‌شد. حالا هر افزودن/حذف/تایپ شیفت آن را هم‌گام می‌کند.
const plannerSource = fs.readFileSync(path.join(root, 'design/shift-planner.js'), 'utf8');
const addShiftBranch = (plannerSource.match(/target\.closest\('\[data-sp-add-shift\]'\)[\s\S]{0,400}?\n    \}/) || [''])[0];
const delShiftBranch = (plannerSource.match(/target\.closest\('\[data-sp-del-shift\]'\)[\s\S]{0,300}?\n    \}/) || [''])[0];
check('افزودن شیفت، انتخابگر روزها را هم‌گام می‌کند',
  addShiftBranch.indexOf('syncPatternOptions()') >= 0, addShiftBranch.slice(0, 120));
check('حذف شیفت، انتخابگر روزها را هم‌گام می‌کند',
  delShiftBranch.indexOf('syncPatternOptions()') >= 0, delShiftBranch.slice(0, 120));
check('تایپ کد شیفت، انتخابگر روزها را هم‌گام می‌کند',
  /onModalInput[\s\S]{0,300}?syncPatternOptions\(\)/.test(plannerSource));
check('هم‌گام‌سازی گزینه‌ها را از شیفت‌های روز می‌سازد',
  /function syncPatternOptions\(\)[\s\S]{0,400}?readShifts\(\)/.test(plannerSource));

// ستون بعد از «روش کاری» برای روش شیفتی تاریخ شروع چرخه می‌گیرد
clickOn('data-sp-tab', 'assign');
check('روش شیفتی ورودی شروع چرخه دارد', fakeHost.innerHTML.indexOf('data-sp-cycle-start="a2"') >= 0);
check('روش روزکار ورودی شروع چرخه ندارد', fakeHost.innerHTML.indexOf('data-sp-cycle-start="a1"') < 0);

fakeBridge.parseJalali = function (value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : '';
};
const a2 = filterState.shiftAssignments.find(function (a) { return a.id === 'a2'; });
fire('change', {
  closest: function (sel) {
    return sel === '[data-sp-cycle-start]'
      ? { getAttribute: function () { return 'a2'; }, value: '2026-11-10' }
      : null;
  }
});
check('تغییر تاریخ شروع چرخه روی تخصیص می‌نشیند', a2.from === '2026-11-10', a2.from);

// ── گزارش ──
let failed = 0;
checks.forEach(function (item) {
  if (!item.ok) failed++;
  console.log((item.ok ? '✓' : '✗') + ' ' + item.name + (item.ok ? '' : '  → ' + item.extra));
});
console.log('\n' + (checks.length - failed) + '/' + checks.length + ' بررسی موفق');
if (failed) process.exit(1);

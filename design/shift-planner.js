/* ─────────────────────────────────────────────────────────────────────────
   برنامه‌ریز شیفت — منوی مستقل «شیفت‌ها»
   صاحب همهٔ رفتارهای برنامه‌ریزی شیفت: روش‌های کاری، قوانین ساعت کاری،
   قالب‌های چرخش، تخصیص کارمند، تغییر وضعیت روزانه و خروجی‌های بازه‌ای.

   لایه‌ها (به همان ترتیبی که کاربر می‌سازد):
     ۱) روش کاری  → قوانین ساعت کاری هفتگی، یا اتصال به یک قالب چرخشی
     ۲) قالب شیفت → چند شیفت در روز + ساعت هر شیفت + ترتیب چرخش
     ۳) تخصیص     → کارمند + روش کاری + بازهٔ اعتبار (تا تغییر نکند پابرجاست)
     ۴) تغییر وضعیت → یک روز یا چند روز، موقت یا دائم، با کامنت

   موتور محاسبه (`engine`) خالص و بدون DOM است تا در آزمون Node هم اجرا شود.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // ═══ ۱. دامنه ═══════════════════════════════════════════════════════════
  // هفتهٔ ایرانی از شنبه شروع می‌شود؛ شمارهٔ روز هفته همین‌جا پایه است.
  const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  const WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
  const OFF = 'OFF';

  const METHOD_KINDS = [
    ['office', 'روزکار ثابت — تایم اداری'],
    ['fixedShift', 'روزکار ثابت — تایم شیفتی'],
    ['rotating', 'شیفت کاری چرخشی (اقماری)'],
    ['camp', 'اقماری / کمپ']
  ];

  const OVERRIDE_KINDS = [
    ['leave', 'مرخصی'],
    ['sick', 'استعلاجی'],
    ['rest', 'استراحت'],
    ['overtime', 'اضافه‌کار'],
    ['replacement', 'جایگزینی'],
    ['mission', 'مأموریت'],
    ['other', 'سایر']
  ];

  const OVERRIDE_LABEL = OVERRIDE_KINDS.reduce(function (out, pair) { out[pair[0]] = pair[1]; return out; }, {});

  // رنگ هر وضعیت در جدول؛ از توکن‌های برنامه استفاده می‌شود، نه رنگ ثابت.
  const KIND_TONE = {
    shift: 'ok', off: 'muted', leave: 'warn', sick: 'warn', rest: 'muted',
    overtime: 'special', replacement: 'info', mission: 'info', other: 'muted', none: 'muted'
  };

  // ═══ ۲. موتور محاسبه (خالص) ═════════════════════════════════════════════
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function dayNumber(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso == null ? '' : iso));
    if (!m) return NaN;
    return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
  }

  function isoFromDayNumber(n) {
    return new Date(n * 86400000).toISOString().slice(0, 10);
  }

  function addDays(iso, count) {
    const n = dayNumber(iso);
    return isFinite(n) ? isoFromDayNumber(n + count) : '';
  }

  // ۰ = شنبه … ۶ = جمعه
  function weekdayIndex(iso) {
    const n = dayNumber(iso);
    if (!isFinite(n)) return -1;
    return (new Date(n * 86400000).getUTCDay() + 1) % 7;
  }

  function rangeDates(from, to) {
    const a = dayNumber(from);
    const b = dayNumber(to);
    if (!isFinite(a) || !isFinite(b) || b < a) return [];
    const out = [];
    for (let n = a; n <= b; n++) out.push(isoFromDayNumber(n));
    return out;
  }

  function minutesOf(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm == null ? '' : hhmm).trim());
    if (!m) return null;
    const h = Number(m[1]);
    const mm = Number(m[2]);
    if (h > 23 || mm > 59) return null;
    return h * 60 + mm;
  }

  function durationMinutes(from, to) {
    const a = minutesOf(from);
    const b = minutesOf(to);
    if (a == null || b == null) return 0;
    let d = b - a;
    if (d < 0) d += 1440;
    return d;
  }

  function durationText(from, to) {
    const d = durationMinutes(from, to);
    if (!d) return '';
    const h = Math.floor(d / 60);
    const mm = d % 60;
    return h + (mm ? ':' + pad2(mm) : '') + ' ساعت';
  }

  function templateShifts(template) {
    return Array.isArray(template && template.shifts) ? template.shifts.filter(function (s) { return s && s.code; }) : [];
  }

  function templateRotation(template) {
    return Array.isArray(template && template.rotation)
      ? template.rotation.filter(function (r) { return r && r.code && Number(r.days) > 0; })
      : [];
  }

  function cycleLength(template) {
    return templateRotation(template).reduce(function (sum, r) { return sum + Number(r.days || 0); }, 0);
  }

  // کد شیفتِ یک تاریخ در یک قالب چرخشی؛ OFF یعنی استراحت.
  function rotationCodeAt(template, iso) {
    const rotation = templateRotation(template);
    const length = cycleLength(template);
    if (!length) return '';
    const start = dayNumber(template.cycleStart || iso);
    const n = dayNumber(iso);
    if (!isFinite(start) || !isFinite(n)) return '';
    let index = ((n - start) % length + length) % length;
    for (let i = 0; i < rotation.length; i++) {
      const days = Number(rotation[i].days || 0);
      if (index < days) return rotation[i].code;
      index -= days;
    }
    return '';
  }

  function methodWeekly(method) {
    return Array.isArray(method && method.weekly) ? method.weekly : [];
  }

  function weeklyRuleAt(method, iso) {
    const weekday = weekdayIndex(iso);
    if (weekday < 0) return null;
    const rule = methodWeekly(method).find(function (r) { return Number(r.day) === weekday; });
    if (!rule || rule.on === false) return null;
    if (!rule.from || !rule.to) return null;
    return rule;
  }

  // آیا این تاریخ داخل بازهٔ رکورد است؟ `openEnded` یعنی «تا تاریخ» خالی به معنی
  // «تا اطلاع ثانوی» است (تخصیص)؛ برای تغییر وضعیت، خالی یعنی همان یک روز.
  function coversDate(record, iso, openEnded) {
    const n = dayNumber(iso);
    const from = dayNumber(record && record.from);
    if (!isFinite(n) || !isFinite(from) || n < from) return false;
    if (!record.to) return !!openEnded;
    const to = dayNumber(record.to);
    return isFinite(to) ? n <= to : true;
  }

  // آخرین تخصیصی که بازه‌اش این تاریخ را می‌پوشاند مقدم است.
  function assignmentFor(state, employeeId, iso) {
    const list = (state.shiftAssignments || []).filter(function (a) {
      return a && String(a.employeeId) === String(employeeId) && a.active !== false && coversDate(a, iso, true);
    });
    if (!list.length) return null;
    list.sort(function (a, b) { return dayNumber(b.from) - dayNumber(a.from); });
    return list[0];
  }

  // تازه‌ترین تغییر وضعیت ثبت‌شده مقدم است.
  function overrideFor(state, employeeId, iso) {
    const list = (state.shiftOverrides || []).filter(function (o) {
      return o && String(o.employeeId) === String(employeeId) && coversDate(o, iso, false);
    });
    if (!list.length) return null;
    list.sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    return list[0];
  }

  // مرخصی تأییدشده در نمای شیفت منعکس می‌شود (نیازمندی بخش ۲).
  function leaveFor(state, employeeId, iso) {
    const n = dayNumber(iso);
    return (state.leaves || []).find(function (leave) {
      if (!leave || String(leave.employeeId || '') !== String(employeeId)) return false;
      if (String(leave.status || '') !== 'تأییدشده') return false;
      const from = dayNumber(leave.startDate);
      const to = dayNumber(leave.endDate || leave.startDate);
      return isFinite(from) && isFinite(to) && n >= from && n <= to;
    }) || null;
  }

  function findShiftByCode(template, code) {
    return templateShifts(template).find(function (s) { return String(s.code) === String(code); }) || null;
  }

  function findMethod(state, id) {
    return (state.shiftMethods || []).find(function (m) { return String(m.id) === String(id); }) || null;
  }

  function findTemplate(state, id) {
    return (state.shiftTemplates || []).find(function (t) { return String(t.id) === String(id); }) || null;
  }

  // وضعیت یک کارمند در یک روز. ترتیب اولویت: تغییر وضعیت ← مرخصی تأییدشده ←
  // تخصیص (چرخش یا قانون هفتگی) ← بدون تخصیص.
  function resolve(state, employeeId, iso) {
    const override = overrideFor(state, employeeId, iso);
    if (override) {
      const kind = override.kind || 'other';
      const template = findTemplate(state, override.templateId);
      const shift = override.code ? findShiftByCode(template, override.code) : null;
      return {
        code: shift ? shift.code : (override.code || 'ت'),
        label: shift ? shift.label : (OVERRIDE_LABEL[kind] || 'تغییر وضعیت'),
        from: shift ? shift.from : '',
        to: shift ? shift.to : '',
        kind: kind,
        note: override.note || '',
        source: 'override',
        permanent: !!override.permanent
      };
    }

    const leave = leaveFor(state, employeeId, iso);
    if (leave) {
      return { code: 'م', label: 'مرخصی', from: '', to: '', kind: 'leave', note: leave.leaveType || '', source: 'leave' };
    }

    const assignment = assignmentFor(state, employeeId, iso);
    if (!assignment) {
      return { code: '—', label: 'بدون تخصیص', from: '', to: '', kind: 'none', note: '', source: 'none' };
    }

    const method = findMethod(state, assignment.methodId);
    if (!method) {
      return { code: '—', label: 'روش کاری حذف‌شده', from: '', to: '', kind: 'none', note: '', source: 'none' };
    }

    if (method.kind === 'rotating' || method.kind === 'camp') {
      const template = findTemplate(state, assignment.templateId || method.templateId);
      if (!template) {
        return { code: '—', label: 'قالب شیفت تعیین نشده', from: '', to: '', kind: 'none', note: '', source: 'none' };
      }
      const code = rotationCodeAt(template, iso);
      if (!code || code === OFF) {
        return { code: 'ا', label: 'استراحت', from: '', to: '', kind: 'off', note: '', source: 'rotation' };
      }
      const shift = findShiftByCode(template, code);
      return {
        code: shift ? shift.code : code,
        label: shift ? shift.label : code,
        from: shift ? shift.from : '',
        to: shift ? shift.to : '',
        kind: 'shift',
        note: '',
        source: 'rotation'
      };
    }

    const rule = weeklyRuleAt(method, iso);
    if (!rule) {
      return { code: 'ا', label: 'استراحت', from: '', to: '', kind: 'off', note: '', source: 'weekly' };
    }
    return { code: 'ر', label: 'روزکار', from: rule.from, to: rule.to, kind: 'shift', note: '', source: 'weekly' };
  }

  // خلاصهٔ یک روش کاری برای نمایش در کارت.
  function methodSummary(method) {
    if (!method) return '';
    if (method.kind === 'rotating' || method.kind === 'camp') return 'چرخشی — قالب شیفت تعیین می‌کند';
    const rules = methodWeekly(method).filter(function (r) { return r.on !== false && r.from && r.to; });
    if (!rules.length) return 'ساعت کاری تعیین نشده';
    const days = rules.map(function (r) { return WEEKDAYS_SHORT[Number(r.day)] || ''; }).join('، ');
    const first = rules[0];
    const same = rules.every(function (r) { return r.from === first.from && r.to === first.to; });
    return days + ' · ' + (same ? first.from + '–' + first.to : 'ساعت‌های متفاوت');
  }

  function templateSummary(template) {
    if (!template) return '';
    const rotation = templateRotation(template);
    if (!rotation.length) return 'ترتیب چرخش تعیین نشده';
    return rotation.map(function (r) {
      const shift = findShiftByCode(template, r.code);
      const name = r.code === OFF ? 'استراحت' : (shift ? shift.label : r.code);
      return r.days + ' ' + name;
    }).join(' · ');
  }

  // ═══ ۳. وضعیت رابط ══════════════════════════════════════════════════════
  let bridge = null;
  let host = null;
  let tab = 'methods';
  let range = { from: '', to: '' };
  let gridMode = 'employee';
  let filters = { city: '', station: '', method: '', code: '', status: '' };
  let search = '';
  let selected = Object.create(null);
  let personId = '';
  let modal = null;

  function esc(value) { return bridge ? bridge.esc(value) : String(value == null ? '' : value); }
  function fa(value) { return bridge ? bridge.faDigits(value) : String(value); }
  function data() { return bridge.getData(); }

  function todayIso() { return bridge.todayIso(); }

  function monthRange() {
    const today = todayIso();
    const day = Number(today.slice(8, 10));
    return { from: addDays(today, -(day - 1)), to: addDays(today, -(day - 1) + 29) };
  }

  function ensureRange() {
    if (!range.from || !range.to) range = monthRange();
  }

  // ═══ ۴. رندر ════════════════════════════════════════════════════════════
  function render(section, api) {
    bridge = api;
    host = section;
    ensureRange();
    const state = data();
    const tabs = [
      ['methods', 'روش‌های کاری'],
      ['templates', 'قالب‌های شیفت'],
      ['assign', 'تخصیص کارکنان'],
      ['calendar', 'تقویم شیفت'],
      ['legacy', 'برنامه‌های ثبت‌شده']
    ];
    const actions =
      '<button type="button" class="secondary-btn" data-sp-export="print" data-sp-scope="grid">چاپ / PDF</button> ' +
      '<button type="button" class="secondary-btn" data-sp-export="xlsx" data-sp-scope="grid">Excel</button> ' +
      '<button type="button" class="secondary-btn" data-sp-export="docx" data-sp-scope="grid">Word</button> ' +
      '<button type="button" class="secondary-btn" data-sp-export="csv" data-sp-scope="grid">CSV</button>';

    section.innerHTML = bridge.rootWrap(
      bridge.pageHead('برنامه‌ریزی شیفت', 'روش کاری، ساعت کاری، قالب چرخش، تخصیص کارکنان و تقویم بازه‌ای', actions) +
      '<div class="sp-tabs" role="tablist">' + tabs.map(function (pair) {
        return '<button type="button" role="tab" class="sp-tab' + (tab === pair[0] ? ' is-active' : '') +
          '" aria-selected="' + (tab === pair[0] ? 'true' : 'false') + '" data-sp-tab="' + pair[0] + '">' + esc(pair[1]) + '</button>';
      }).join('') + '</div>' +
      '<div data-sp-body>' + renderTab(state) + '</div>'
    );

    if (tab === 'legacy') {
      const legacyHost = section.querySelector('[data-sp-legacy]');
      if (legacyHost) bridge.legacySchedule(legacyHost);
    }
    if (bridge.enhanceJalaliInputs) bridge.enhanceJalaliInputs(section);
  }

  function renderTab(state) {
    if (tab === 'methods') return renderMethods(state);
    if (tab === 'templates') return renderTemplates(state);
    if (tab === 'assign') return renderAssign(state);
    if (tab === 'calendar') return renderCalendar(state);
    if (tab === 'legacy') return '<div data-sp-legacy></div>';
    return '';
  }

  function refresh() {
    if (!host) return;
    const state = data();
    const body = host.querySelector('[data-sp-body]');
    if (body) body.innerHTML = renderTab(state);
    if (tab === 'legacy') {
      const legacyHost = host.querySelector('[data-sp-legacy]');
      if (legacyHost) bridge.legacySchedule(legacyHost);
    }
    if (bridge.enhanceJalaliInputs) bridge.enhanceJalaliInputs(host);
  }

  // ── تب ۱: روش‌های کاری ──────────────────────────────────────────────────
  function renderMethods(state) {
    const methods = state.shiftMethods || [];
    const cards = methods.length ? methods.map(function (method) {
      const kindLabel = (METHOD_KINDS.find(function (p) { return p[0] === method.kind; }) || [])[1] || method.kind;
      const template = findTemplate(state, method.templateId);
      const assigned = (state.shiftAssignments || []).filter(function (a) {
        return String(a.methodId) === String(method.id) && a.active !== false;
      }).length;
      return '<article class="sp-card' + (method.active === false ? ' is-off' : '') + '">' +
        '<header class="sp-card-head"><div><h4>' + esc(method.name || 'روش کاری') + '</h4>' +
        '<span class="sp-card-kind">' + esc(kindLabel) + '</span></div>' +
        '<div class="sp-card-actions">' +
        '<button type="button" class="secondary-btn" data-sp-edit="method" data-sp-id="' + esc(method.id) + '">ویرایش</button>' +
        '<button type="button" class="module-delete-btn" data-sp-del="method" data-sp-id="' + esc(method.id) + '">حذف</button>' +
        '</div></header>' +
        '<dl class="sp-facts">' +
        '<div><dt>ساعت کاری</dt><dd>' + esc(methodSummary(method)) + '</dd></div>' +
        (template ? '<div><dt>قالب شیفت</dt><dd>' + esc(template.name || '') + '</dd></div>' : '') +
        '<div><dt>کارکنان تخصیص‌یافته</dt><dd>' + fa(assigned) + ' نفر</dd></div>' +
        (method.notes ? '<div><dt>توضیح</dt><dd>' + esc(method.notes) + '</dd></div>' : '') +
        '</dl></article>';
    }).join('') : '<div class="module-empty">هنوز روش کاری تعریف نشده است. با یکی از قالب‌های آماده شروع کن.</div>';

    const presets = [
      ['office-8-14', 'روزکار اداری ۸ تا ۱۴'],
      ['office-7-15', 'روزکار اداری ۷ تا ۱۵'],
      ['fixed-8-16', 'روزکار شیفتی ۸ تا ۱۶'],
      ['fixed-7-19', 'روزکار شیفتی ۷ تا ۱۹'],
      ['rotating-12', 'شیفت ۱۲ ساعته روز/شب'],
      ['rotating-8', 'شیفت ۸ ساعته سه‌شیفت']
    ];

    return '<section class="module-list-panel"><div class="module-list-head"><div>' +
      '<h3>روش‌های کاری</h3><p>هر روش کاری یا قوانین ساعت کاری هفتگی دارد یا به یک قالب چرخش وصل می‌شود.</p></div>' +
      '<div class="module-page-actions"><button type="button" class="primary-btn" data-sp-new="method">+ روش کاری جدید</button></div></div>' +
      '<div class="sp-presets"><span>قالب آماده:</span>' + presets.map(function (pair) {
        return '<button type="button" class="list-chip" data-sp-preset="' + pair[0] + '">' + esc(pair[1]) + '</button>';
      }).join('') + '</div>' +
      '<div class="sp-card-grid">' + cards + '</div></section>';
  }

  // ── تب ۲: قالب‌های شیفت ─────────────────────────────────────────────────
  function renderTemplates(state) {
    const templates = state.shiftTemplates || [];
    const cards = templates.length ? templates.map(function (template) {
      const shifts = templateShifts(template);
      const length = cycleLength(template);
      return '<article class="sp-card">' +
        '<header class="sp-card-head"><div><h4>' + esc(template.name || 'قالب شیفت') + '</h4>' +
        '<span class="sp-card-kind">' + fa(shifts.length) + ' شیفت در روز · چرخهٔ ' + fa(length) + ' روزه</span></div>' +
        '<div class="sp-card-actions">' +
        '<button type="button" class="secondary-btn" data-sp-edit="template" data-sp-id="' + esc(template.id) + '">ویرایش</button>' +
        '<button type="button" class="module-delete-btn" data-sp-del="template" data-sp-id="' + esc(template.id) + '">حذف</button>' +
        '</div></header>' +
        '<div class="sp-shift-chips">' + shifts.map(function (shift) {
          return '<span class="sp-shift-chip"><b>' + esc(shift.code) + '</b>' + esc(shift.label || '') +
            '<i>' + esc(shift.from || '—') + '–' + esc(shift.to || '—') + '</i></span>';
        }).join('') + '</div>' +
        '<dl class="sp-facts">' +
        '<div><dt>ترتیب چرخش</dt><dd>' + esc(templateSummary(template)) + '</dd></div>' +
        '<div><dt>شروع چرخه</dt><dd>' + (template.cycleStart ? esc(bridge.formatJalali(template.cycleStart, false)) : '—') + '</dd></div>' +
        '</dl></article>';
    }).join('') : '<div class="module-empty">هنوز قالب شیفتی ساخته نشده است.</div>';

    const presets = [
      ['2-2-4', '۲ صبح · ۲ شب · ۴ استراحت'],
      ['2-2-2', '۲ صبح · ۲ شب · ۲ استراحت'],
      ['3-3-3', '۳ صبح · ۳ شب · ۳ استراحت'],
      ['three-8', '۸ ساعته سه‌شیفت (صبح/عصر/شب)']
    ];

    return '<section class="module-list-panel"><div class="module-list-head"><div>' +
      '<h3>قالب‌های شیفت</h3><p>هر قالب می‌گوید در یک روز چند شیفت هست، ساعت هر شیفت چیست و به چه ترتیبی می‌چرخند.</p></div>' +
      '<div class="module-page-actions"><button type="button" class="primary-btn" data-sp-new="template">+ قالب شیفت جدید</button></div></div>' +
      '<div class="sp-presets"><span>قالب آماده:</span>' + presets.map(function (pair) {
        return '<button type="button" class="list-chip" data-sp-preset="' + pair[0] + '">' + esc(pair[1]) + '</button>';
      }).join('') + '</div>' +
      '<div class="sp-card-grid">' + cards + '</div></section>';
  }

  // ── تب ۳: تخصیص کارکنان ─────────────────────────────────────────────────
  // شهر از «محل سمت سازمانی» می‌آید و محل خدمت از «محل خدمت فعلی»؛ اگر یکی خالی
  // بود، دیگری جای آن می‌نشیند تا هیچ کارمندی از فهرست بیرون نیفتد.
  function employeeCity(employee) {
    return String(employee.workplace || employee.assignedWorkplace || '');
  }

  function employeeStation(employee) {
    return String(employee.assignedWorkplace || employee.workplace || '');
  }

  function filteredEmployees(state) {
    const term = String(search || '').trim().toLowerCase();
    return (state.employees || []).filter(function (employee) {
      if (filters.city && employeeCity(employee) !== filters.city) return false;
      if (filters.station && employeeStation(employee) !== filters.station) return false;
      if (filters.method) {
        const assignment = assignmentFor(state, employee.id, todayIso());
        if (!assignment || String(assignment.methodId) !== String(filters.method)) return false;
      }
      if (term) {
        const hay = [bridge.employeeName(employee), employee.personnelId, employee.jobTitle, employeeCity(employee)]
          .join(' ').toLowerCase();
        if (hay.indexOf(term) < 0) return false;
      }
      return true;
    });
  }

  function renderAssign(state) {
    const methods = state.shiftMethods || [];
    const employees = filteredEmployees(state);
    const cities = uniqueOf((state.employees || []).map(employeeCity));
    const stations = uniqueOf((state.employees || []).map(employeeStation));

    const groups = Object.create(null);
    employees.forEach(function (employee) {
      const city = employeeCity(employee) || 'بدون شهر';
      if (!groups[city]) groups[city] = [];
      groups[city].push(employee);
    });

    const rows = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, 'fa'); }).map(function (city) {
      const people = groups[city].slice().sort(function (a, b) {
        return bridge.employeeName(a).localeCompare(bridge.employeeName(b), 'fa');
      });
      return '<tr class="sp-group-row"><td colspan="6"><b>' + esc(city) + '</b> · ' + fa(people.length) + ' نفر</td></tr>' +
        people.map(function (employee) {
          const assignment = assignmentFor(state, employee.id, todayIso());
          const methodId = assignment ? String(assignment.methodId) : '';
          return '<tr>' +
            '<td class="sp-check"><input type="checkbox" data-sp-select="' + esc(employee.id) + '"' +
              (selected[employee.id] ? ' checked' : '') + ' aria-label="انتخاب ' + esc(bridge.employeeName(employee)) + '"></td>' +
            '<td><button type="button" class="sp-link" data-sp-person="' + esc(employee.id) + '">' +
              esc(bridge.employeeName(employee) || 'بدون نام') + '</button>' +
              (employee.personnelId ? '<small class="sp-sub">' + esc(employee.personnelId) + '</small>' : '') + '</td>' +
            '<td>' + esc(employeeStation(employee) || '—') + '</td>' +
            '<td>' + esc(employee.jobTitle || '—') + '</td>' +
            '<td><select data-sp-assign-method="' + esc(employee.id) + '" aria-label="روش کاری">' +
              '<option value="">— بدون تخصیص —</option>' +
              methods.map(function (method) {
                return '<option value="' + esc(method.id) + '"' + (methodId === String(method.id) ? ' selected' : '') + '>' +
                  esc(method.name || 'روش کاری') + '</option>';
              }).join('') + '</select></td>' +
            '<td>' + (assignment ? esc(bridge.formatJalali(assignment.from, false)) +
              (assignment.to ? ' تا ' + esc(bridge.formatJalali(assignment.to, false)) : ' · تا اطلاع ثانوی') : '—') + '</td>' +
            '</tr>';
        }).join('');
    }).join('');

    const selectedCount = Object.keys(selected).filter(function (id) { return selected[id]; }).length;

    return '<section class="module-list-panel"><div class="module-list-head"><div>' +
      '<h3>تخصیص روش کاری به کارکنان</h3><p>کارکنان بر اساس شهر و محل خدمت گروه‌بندی شده‌اند. تخصیص تا وقتی وضعیت کارمند عوض نشود پابرجاست.</p></div>' +
      '<div class="module-page-actions">' +
      '<button type="button" class="primary-btn" data-sp-bulk-assign' + (selectedCount ? '' : ' disabled') + '>تخصیص گروهی (' + fa(selectedCount) + ')</button>' +
      '</div></div>' +
      '<div class="module-list-tools"><div class="list-search-row">' +
      '<span class="list-search-icon" aria-hidden="true">⌕</span>' +
      '<input type="search" data-sp-search value="' + esc(search) + '" placeholder="جست‌وجوی نام، شمارهٔ پرسنلی یا شهر" aria-label="جست‌وجو">' +
      '</div><div class="list-filter-row">' +
      selectChip('city', 'شهر', cities, filters.city) +
      selectChip('station', 'محل خدمت', stations, filters.station) +
      selectChip('method', 'روش کاری', methods.map(function (m) { return m.name; }), '') +
      '<button type="button" class="list-chip list-chip-reset" data-sp-reset>پاک‌کردن فیلترها</button>' +
      '<span class="list-filter-count">' + fa(employees.length) + ' نفر</span>' +
      '</div></div>' +
      '<div class="module-bulk-tools"><label><input type="checkbox" data-sp-select-all> انتخاب همه</label>' +
      '<button type="button" class="secondary-btn" data-sp-select-invert>انتخاب معکوس</button>' +
      '<button type="button" class="secondary-btn" data-sp-select-clear>پاک‌کردن انتخاب</button>' +
      '<span data-sp-selected-count>' + fa(selectedCount) + ' نفر انتخاب شده</span></div>' +
      '<div class="module-table-wrap"><table class="module-table sp-table"><thead><tr>' +
      '<th class="sp-check"></th><th>نام و نام خانوادگی</th><th>محل خدمت</th><th>عنوان شغلی</th>' +
      '<th>روش کاری</th><th>بازهٔ اعتبار</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="6"><div class="module-empty">کارمندی با این فیلترها پیدا نشد.</div></td></tr>') +
      '</tbody></table></div></section>';
  }

  function uniqueOf(values) {
    const out = [];
    values.forEach(function (value) {
      const text = String(value == null ? '' : value).trim();
      if (text && out.indexOf(text) < 0) out.push(text);
    });
    return out.sort(function (a, b) { return a.localeCompare(b, 'fa'); });
  }

  function selectChip(key, label, values, current) {
    return '<label class="sp-filter"><span>' + esc(label) + '</span><select data-sp-filter="' + key + '">' +
      '<option value="">همه</option>' + values.map(function (value) {
        return '<option value="' + esc(value) + '"' + (String(current) === String(value) ? ' selected' : '') + '>' + esc(value) + '</option>';
      }).join('') + '</select></label>';
  }

  // ── تب ۴: تقویم شیفت ────────────────────────────────────────────────────
  function renderCalendar(state) {
    const dates = rangeDates(range.from, range.to);
    const employees = filteredEmployees(state);
    const cities = uniqueOf((state.employees || []).map(employeeCity));
    const stations = uniqueOf((state.employees || []).map(employeeStation));
    const methods = state.shiftMethods || [];
    const codes = uniqueOf((state.shiftTemplates || []).reduce(function (out, template) {
      return out.concat(templateShifts(template).map(function (s) { return s.label || s.code; }));
    }, []).concat(['روزکار', 'استراحت', 'مرخصی']));

    const toolbar = '<div class="module-list-tools"><div class="list-search-row">' +
      '<span class="list-search-icon" aria-hidden="true">⌕</span>' +
      '<input type="search" data-sp-search value="' + esc(search) + '" placeholder="جست‌وجوی نام یا شمارهٔ پرسنلی" aria-label="جست‌وجو">' +
      '</div><div class="list-filter-row">' +
      selectChip('city', 'شهر', cities, filters.city) +
      selectChip('station', 'محل خدمت', stations, filters.station) +
      selectChip('method', 'روش کاری', methods.map(function (m) { return m.name; }), filters.method) +
      selectChip('code', 'نوع شیفت', codes, filters.code) +
      '<button type="button" class="list-chip list-chip-reset" data-sp-reset>پاک‌کردن فیلترها</button>' +
      '</div></div>';

    const rangeBar = '<div class="sp-range">' +
      '<label class="sp-range-field"><span>از تاریخ</span><input type="text" data-jalali-input="jalali" data-sp-range-from value="' +
        esc(bridge.jalaliInputValue(range.from, false)) + '" placeholder="۱۴۰۵/۰۸/۰۱"></label>' +
      '<label class="sp-range-field"><span>تا تاریخ</span><input type="text" data-jalali-input="jalali" data-sp-range-to value="' +
        esc(bridge.jalaliInputValue(range.to, false)) + '" placeholder="۱۴۰۵/۰۸/۳۰"></label>' +
      '<div class="sp-range-quick">' +
      '<button type="button" class="list-chip" data-sp-range="today">امروز</button>' +
      '<button type="button" class="list-chip" data-sp-range="week">۷ روز</button>' +
      '<button type="button" class="list-chip" data-sp-range="month">ماه جاری</button>' +
      '<button type="button" class="list-chip" data-sp-range="quarter">۹۰ روز</button>' +
      '</div>' +
      '<div class="sp-mode" role="group" aria-label="نمای تقویم">' +
      '<button type="button" class="list-chip' + (gridMode === 'employee' ? ' is-active' : '') + '" data-sp-mode="employee">بر اساس کارمند</button>' +
      '<button type="button" class="list-chip' + (gridMode === 'station' ? ' is-active' : '') + '" data-sp-mode="station">بر اساس ایستگاه</button>' +
      '</div></div>';

    const body = gridMode === 'station'
      ? stationGrid(state, dates, employees)
      : employeeGrid(state, dates, employees);

    return '<section class="module-list-panel"><div class="module-list-head"><div>' +
      '<h3>تقویم شیفت</h3><p>وضعیت هر روز در بازهٔ انتخابی. روی هر خانه بزن تا تغییر وضعیت، اضافه‌کار یا جایگزینی ثبت شود.</p></div>' +
      '<div class="module-page-actions">' +
      '<button type="button" class="secondary-btn" data-sp-export="print" data-sp-scope="grid">چاپ / PDF</button>' +
      '<button type="button" class="secondary-btn" data-sp-export="xlsx" data-sp-scope="grid">Excel</button>' +
      '<button type="button" class="secondary-btn" data-sp-export="docx" data-sp-scope="grid">Word</button>' +
      '<button type="button" class="secondary-btn" data-sp-export="csv" data-sp-scope="grid">CSV</button>' +
      '<button type="button" class="secondary-btn" data-sp-export="png" data-sp-scope="grid">PNG</button>' +
      '</div></div>' + rangeBar + toolbar + body +
      '<div class="sp-legend">' + legendItems(state) + '</div>' +
      '<div class="module-list-foot">' + fa(employees.length) + ' نفر · ' + fa(dates.length) + ' روز · ' +
      esc(bridge.formatJalali(range.from, false)) + ' تا ' + esc(bridge.formatJalali(range.to, false)) + '</div></section>';
  }

  function legendItems(state) {
    const items = [['shift', 'شیفت کاری'], ['off', 'استراحت'], ['leave', 'مرخصی'], ['overtime', 'اضافه‌کار'],
      ['replacement', 'جایگزینی'], ['mission', 'مأموریت'], ['none', 'بدون تخصیص']];
    return items.map(function (pair) {
      return '<span class="sp-legend-item" data-tone="' + (KIND_TONE[pair[0]] || 'muted') + '"><i></i>' + esc(pair[1]) + '</span>';
    }).join('');
  }

  function cellMatchesCode(status, code) {
    if (!code) return true;
    return String(status.label || '') === String(code) || String(status.code || '') === String(code);
  }

  function employeeGrid(state, dates, employees) {
    if (!dates.length) return '<div class="module-empty">بازهٔ تاریخ معتبر نیست.</div>';
    if (!employees.length) return '<div class="module-empty">کارمندی با این فیلترها پیدا نشد.</div>';

    const head = '<tr><th class="sp-sticky-col">کارمند</th>' + dates.map(function (iso) {
      const weekday = weekdayIndex(iso);
      return '<th class="sp-day-head"><span>' + esc(WEEKDAYS_SHORT[weekday] || '') + '</span>' +
        '<b>' + esc(bridge.formatJalali(iso, false).split('/').slice(1).join('/')) + '</b></th>';
    }).join('') + '</tr>';

    const rows = employees.map(function (employee) {
      const cells = dates.map(function (iso) {
        const status = resolve(state, employee.id, iso);
        if (!cellMatchesCode(status, filters.code)) {
          return '<td class="sp-cell is-filtered"></td>';
        }
        const title = status.label + (status.from ? ' · ' + status.from + '–' + status.to : '') +
          (status.note ? ' · ' + status.note : '');
        return '<td class="sp-cell" data-tone="' + (KIND_TONE[status.kind] || 'muted') + '">' +
          '<button type="button" class="sp-cell-btn" data-sp-cell="' + esc(employee.id) + '" data-sp-date="' + esc(iso) + '" title="' +
          esc(title) + '">' + esc(status.code) + '</button></td>';
      }).join('');
      return '<tr><th class="sp-sticky-col"><button type="button" class="sp-link" data-sp-person="' + esc(employee.id) + '">' +
        esc(bridge.employeeName(employee) || 'بدون نام') + '</button>' +
        '<small class="sp-sub">' + esc(employeeStation(employee) || '—') + '</small></th>' + cells + '</tr>';
    }).join('');

    return '<div class="module-table-wrap sp-grid-wrap"><table class="module-table sp-grid">' +
      '<thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>';
  }

  // نمای ایستگاه: هر ردیف یک روز، هر ستون یک نوع شیفت و داخلش نام افراد.
  function stationGrid(state, dates, employees) {
    if (!dates.length) return '<div class="module-empty">بازهٔ تاریخ معتبر نیست.</div>';
    const columns = uniqueOf(employees.reduce(function (out, employee) {
      dates.forEach(function (iso) { out.push(resolve(state, employee.id, iso).label); });
      return out;
    }, []));

    const head = '<tr><th class="sp-sticky-col">تاریخ</th><th>روز</th>' + columns.map(function (label) {
      return '<th>' + esc(label) + '</th>';
    }).join('') + '</tr>';

    const rows = dates.map(function (iso) {
      const buckets = Object.create(null);
      employees.forEach(function (employee) {
        const status = resolve(state, employee.id, iso);
        if (!cellMatchesCode(status, filters.code)) return;
        const key = status.label;
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(bridge.employeeName(employee) || 'بدون نام');
      });
      return '<tr><th class="sp-sticky-col">' + esc(bridge.formatJalali(iso, false)) + '</th>' +
        '<td>' + esc(WEEKDAYS[weekdayIndex(iso)] || '') + '</td>' +
        columns.map(function (label) {
          const names = buckets[label] || [];
          return '<td class="sp-names">' + (names.length ? names.map(function (name) {
            return '<span class="sp-name">' + esc(name) + '</span>';
          }).join('') : '<span class="sp-dash">—</span>') + '</td>';
        }).join('') + '</tr>';
    }).join('');

    return '<div class="module-table-wrap sp-grid-wrap"><table class="module-table sp-grid sp-grid-station">' +
      '<thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>';
  }

  // ═══ ۵. خروجی ═══════════════════════════════════════════════════════════
  function gridRows(state) {
    const dates = rangeDates(range.from, range.to);
    const employees = filteredEmployees(state);
    if (gridMode === 'station') {
      const columns = uniqueOf(employees.reduce(function (out, employee) {
        dates.forEach(function (iso) { out.push(resolve(state, employee.id, iso).label); });
        return out;
      }, []));
      const rows = [['تاریخ', 'روز'].concat(columns)];
      dates.forEach(function (iso) {
        const buckets = Object.create(null);
        employees.forEach(function (employee) {
          const status = resolve(state, employee.id, iso);
          if (!cellMatchesCode(status, filters.code)) return;
          if (!buckets[status.label]) buckets[status.label] = [];
          buckets[status.label].push(bridge.employeeName(employee) || 'بدون نام');
        });
        rows.push([bridge.formatJalali(iso, false), WEEKDAYS[weekdayIndex(iso)] || ''].concat(
          columns.map(function (label) { return (buckets[label] || []).join('، '); })
        ));
      });
      return rows;
    }
    const rows = [['کارمند', 'شمارهٔ پرسنلی', 'شهر', 'محل خدمت'].concat(dates.map(function (iso) {
      return bridge.formatJalali(iso, false);
    }))];
    employees.forEach(function (employee) {
      rows.push([
        bridge.employeeName(employee) || 'بدون نام',
        employee.personnelId || '',
        employeeCity(employee),
        employeeStation(employee)
      ].concat(dates.map(function (iso) {
        const status = resolve(state, employee.id, iso);
        if (!cellMatchesCode(status, filters.code)) return '';
        return status.label + (status.from ? ' ' + status.from + '–' + status.to : '');
      })));
    });
    return rows;
  }

  function personRows(state, employeeId) {
    const employee = (state.employees || []).find(function (e) { return String(e.id) === String(employeeId); });
    const dates = rangeDates(range.from, range.to);
    const rows = [['تاریخ', 'روز هفته', 'وضعیت', 'از ساعت', 'تا ساعت', 'توضیح']];
    dates.forEach(function (iso) {
      const status = resolve(state, employeeId, iso);
      rows.push([
        bridge.formatJalali(iso, false),
        WEEKDAYS[weekdayIndex(iso)] || '',
        status.label,
        status.from || '',
        status.to || '',
        status.note || ''
      ]);
    });
    return { rows: rows, title: 'شیفت ' + (employee ? bridge.employeeName(employee) : '') };
  }

  function runExport(format, scope) {
    const state = data();
    if (scope === 'person' && personId) {
      const sheet = personRows(state, personId);
      bridge.runExport(sheet.rows, sheet.title, 'ATLAS-SHIFT-' + bridge.exportSlug(sheet.title, 'person') + '-' + todayIso(), format);
      return;
    }
    const rows = gridRows(state);
    if (rows.length < 2) { bridge.toast('برای خروجی، بازه و فیلترها را طوری تنظیم کن که حداقل یک ردیف داشته باشد.'); return; }
    const title = 'تقویم شیفت · ' + bridge.formatJalali(range.from, false) + ' تا ' + bridge.formatJalali(range.to, false);
    bridge.runExport(rows, title, 'ATLAS-SHIFT-shift-calendar-' + todayIso(), format);
  }

  // ═══ ۶. پنجره‌ها ═════════════════════════════════════════════════════════
  function closeModal() {
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    modal = null;
  }

  function openModal(title, subtitle, bodyHtml, footerHtml) {
    closeModal();
    const wrap = document.createElement('div');
    wrap.className = 'atlas-modal-backdrop sp-backdrop';
    wrap.setAttribute('data-sp-modal', '1');
    wrap.innerHTML = '<div class="atlas-modal atlas-modal-form" role="dialog" aria-modal="true">' +
      '<div class="atlas-modal-head"><div><h3>' + esc(title) + '</h3><p>' + esc(subtitle || '') + '</p></div>' +
      '<button type="button" class="atlas-modal-close" data-sp-close aria-label="بستن پنجره">×</button></div>' +
      '<div class="atlas-modal-body">' + bodyHtml + '</div>' +
      '<div class="module-form-actions">' + (footerHtml || '') + '</div></div>';
    document.body.appendChild(wrap);
    modal = wrap;
    if (bridge.enhanceJalaliInputs) bridge.enhanceJalaliInputs(wrap);
    return wrap;
  }

  function field(label, control, hint) {
    return '<label class="module-field"><span>' + esc(label) + '</span>' + control +
      (hint ? '<small class="module-field-hint">' + esc(hint) + '</small>' : '') + '</label>';
  }

  function input(name, value, attrs) {
    return '<input name="' + esc(name) + '" value="' + esc(value == null ? '' : value) + '" ' + (attrs || '') + '>';
  }

  function select(name, options, current) {
    return '<select name="' + esc(name) + '">' + options.map(function (pair) {
      const value = Array.isArray(pair) ? pair[0] : pair;
      const label = Array.isArray(pair) ? pair[1] : pair;
      return '<option value="' + esc(value) + '"' + (String(current) === String(value) ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('') + '</select>';
  }

  // ── پنجرهٔ روش کاری ──
  function openMethodModal(id) {
    const state = data();
    const method = id ? findMethod(state, id) : null;
    const current = method || { name: '', kind: 'office', weekly: defaultWeekly('08:00', '14:00'), templateId: '', notes: '' };
    const weekly = WEEKDAYS.map(function (label, index) {
      const rule = methodWeekly(current).find(function (r) { return Number(r.day) === index; }) ||
        { day: index, on: index < 5, from: '08:00', to: '14:00' };
      return '<div class="sp-week-row" data-sp-week="' + index + '">' +
        '<label class="sp-week-day"><input type="checkbox" data-sp-week-on' + (rule.on !== false ? ' checked' : '') + '>' +
        '<span>' + esc(label) + '</span></label>' +
        '<input type="time" data-sp-week-from value="' + esc(rule.from || '08:00') + '" aria-label="از ساعت">' +
        '<span class="sp-week-sep">تا</span>' +
        '<input type="time" data-sp-week-to value="' + esc(rule.to || '14:00') + '" aria-label="تا ساعت">' +
        '</div>';
    }).join('');

    const templates = (state.shiftTemplates || []).map(function (t) { return [t.id, t.name || 'قالب شیفت']; });

    openModal(method ? 'ویرایش روش کاری' : 'روش کاری جدید',
      'نوع روش کاری را انتخاب کن؛ برای روزکار، ساعت هر روز هفته و برای چرخشی، قالب شیفت را مشخص کن.',
      '<form class="module-form" data-sp-form="method" data-sp-id="' + esc(method ? method.id : '') + '">' +
      '<div class="module-fields">' +
      field('نام روش کاری', input('name', current.name, 'required placeholder="مثلاً روزکار اداری ستاد"')) +
      field('نوع روش کاری', select('kind', METHOD_KINDS, current.kind)) +
      field('قالب شیفت (برای چرخشی)', '<select name="templateId"><option value="">— انتخاب نشده —</option>' +
        templates.map(function (pair) {
          return '<option value="' + esc(pair[0]) + '"' + (String(current.templateId) === String(pair[0]) ? ' selected' : '') + '>' +
            esc(pair[1]) + '</option>';
        }).join('') + '</select>', 'فقط برای روش‌های چرخشی و اقماری لازم است.') +
      field('توضیح', '<textarea name="notes" rows="2">' + esc(current.notes || '') + '</textarea>') +
      '</div>' +
      '<div class="sp-week" data-sp-week-block><h4>قوانین ساعت کاری هفتگی</h4>' +
      '<p class="sp-hint">هر روز را تیک بزن و ساعت شروع و پایان همان روز را بنویس. روزِ بدون تیک، استراحت است.</p>' +
      weekly + '</div></form>',
      '<button type="button" class="secondary-btn" data-sp-close>انصراف</button> ' +
      '<button type="button" class="primary-btn" data-sp-save="method">' + (method ? 'ذخیرهٔ تغییرات' : 'ثبت روش کاری') + '</button>'
    );
    syncMethodKind();
  }

  function defaultWeekly(from, to) {
    return WEEKDAYS.map(function (label, index) {
      return { day: index, on: index < 5, from: from, to: to };
    });
  }

  function syncMethodKind() {
    if (!modal) return;
    const kind = modal.querySelector('[name="kind"]');
    const block = modal.querySelector('[data-sp-week-block]');
    if (!kind || !block) return;
    const rotating = kind.value === 'rotating' || kind.value === 'camp';
    block.hidden = rotating;
  }

  function readWeekly() {
    const out = [];
    if (!modal) return out;
    modal.querySelectorAll('[data-sp-week]').forEach(function (row) {
      out.push({
        day: Number(row.getAttribute('data-sp-week')),
        on: !!row.querySelector('[data-sp-week-on]').checked,
        from: row.querySelector('[data-sp-week-from]').value || '',
        to: row.querySelector('[data-sp-week-to]').value || ''
      });
    });
    return out;
  }

  async function saveMethod() {
    const state = data();
    const form = modal.querySelector('[data-sp-form="method"]');
    const id = form.getAttribute('data-sp-id');
    const name = String(form.querySelector('[name="name"]').value || '').trim();
    if (!name) { bridge.toast('نام روش کاری را بنویس.'); return; }
    const kind = form.querySelector('[name="kind"]').value;
    const templateId = form.querySelector('[name="templateId"]').value;
    if ((kind === 'rotating' || kind === 'camp') && !templateId) {
      bridge.toast('برای روش چرخشی، یک قالب شیفت انتخاب کن.');
      return;
    }
    const record = {
      id: id || bridge.createId(),
      name: name,
      kind: kind,
      templateId: templateId,
      weekly: readWeekly(),
      notes: String(form.querySelector('[name="notes"]').value || '').trim(),
      active: true
    };
    if (id) {
      state.shiftMethods = (state.shiftMethods || []).map(function (m) { return String(m.id) === String(id) ? record : m; });
    } else {
      state.shiftMethods = (state.shiftMethods || []).concat([record]);
    }
    if (await bridge.save()) {
      closeModal();
      refresh();
      bridge.toast(id ? 'روش کاری به‌روزرسانی شد.' : 'روش کاری ثبت شد.');
    }
  }

  // ── پنجرهٔ قالب شیفت ──
  function openTemplateModal(id) {
    const state = data();
    const template = id ? findTemplate(state, id) : null;
    const current = template || {
      name: '', shifts: [{ code: 'ص', label: 'صبح‌کار', from: '07:00', to: '19:00' }, { code: 'ش', label: 'شب‌کار', from: '19:00', to: '07:00' }],
      rotation: [{ code: 'ص', days: 2 }, { code: 'ش', days: 2 }, { code: OFF, days: 4 }],
      cycleStart: todayIso()
    };

    openModal(template ? 'ویرایش قالب شیفت' : 'قالب شیفت جدید',
      'شیفت‌های روز را تعریف کن، بعد ترتیب چرخش را بنویس (مثلاً ۲ صبح، ۲ شب، ۴ استراحت).',
      '<form class="module-form" data-sp-form="template" data-sp-id="' + esc(template ? template.id : '') + '">' +
      '<div class="module-fields">' +
      field('نام قالب', input('name', current.name, 'required placeholder="مثلاً ۱۲ ساعته ۲/۲/۴"')) +
      field('شروع چرخه', '<input type="text" name="cycleStart" data-jalali-input="jalali" value="' +
        esc(bridge.jalaliInputValue(current.cycleStart || todayIso(), false)) + '" placeholder="۱۴۰۵/۰۸/۰۱">',
        'از این تاریخ به بعد ترتیب چرخش شمرده می‌شود.') +
      '</div>' +
      '<div class="sp-rows" data-sp-shifts><h4>شیفت‌های روز</h4>' +
      '<p class="sp-hint">هر شیفت یک کد کوتاه، یک نام و ساعت شروع و پایان دارد.</p>' +
      '<div class="sp-rows-body">' + shiftRows(current.shifts) + '</div>' +
      '<button type="button" class="secondary-btn" data-sp-add-shift>+ افزودن شیفت</button></div>' +
      '<div class="sp-rows" data-sp-rotation><h4>ترتیب چرخش</h4>' +
      '<p class="sp-hint">مثلاً ۲ صبح‌کار، ۲ شب‌کار، ۴ استراحت. جمع روزها طول چرخه است.</p>' +
      '<div class="sp-rows-body">' + rotationRows(current.rotation, current.shifts) + '</div>' +
      '<button type="button" class="secondary-btn" data-sp-add-rotation>+ افزودن مرحله</button>' +
      '<div class="sp-cycle" data-sp-cycle></div></div></form>',
      '<button type="button" class="secondary-btn" data-sp-close>انصراف</button> ' +
      '<button type="button" class="primary-btn" data-sp-save="template">' + (template ? 'ذخیرهٔ تغییرات' : 'ثبت قالب') + '</button>'
    );
    updateCycle();
  }

  function shiftRows(shifts) {
    return (shifts || []).map(function (shift) {
      return '<div class="sp-row" data-sp-shift-row>' +
        '<input class="sp-code" data-sp-shift-code value="' + esc(shift.code || '') + '" maxlength="3" placeholder="کد" aria-label="کد شیفت">' +
        '<input data-sp-shift-label value="' + esc(shift.label || '') + '" placeholder="نام شیفت" aria-label="نام شیفت">' +
        '<input type="time" data-sp-shift-from value="' + esc(shift.from || '') + '" aria-label="از ساعت">' +
        '<input type="time" data-sp-shift-to value="' + esc(shift.to || '') + '" aria-label="تا ساعت">' +
        '<button type="button" class="module-delete-btn" data-sp-del-shift aria-label="حذف شیفت">×</button>' +
        '</div>';
    }).join('');
  }

  function rotationRows(rotation, shifts) {
    const options = [{ value: OFF, label: 'استراحت' }].concat((shifts || []).map(function (shift) {
      return { value: shift.code, label: (shift.code || '') + ' — ' + (shift.label || '') };
    }));
    return (rotation || []).map(function (step) {
      return '<div class="sp-row" data-sp-rotation-row>' +
        '<select data-sp-rotation-code aria-label="شیفت">' + options.map(function (option) {
          return '<option value="' + esc(option.value) + '"' + (String(step.code) === String(option.value) ? ' selected' : '') + '>' +
            esc(option.label) + '</option>';
        }).join('') + '</select>' +
        '<input type="number" min="1" max="60" data-sp-rotation-days value="' + esc(step.days || 1) + '" aria-label="تعداد روز">' +
        '<span class="sp-row-unit">روز</span>' +
        '<button type="button" class="module-delete-btn" data-sp-del-rotation aria-label="حذف مرحله">×</button>' +
        '</div>';
    }).join('');
  }

  function readShifts() {
    const out = [];
    if (!modal) return out;
    modal.querySelectorAll('[data-sp-shift-row]').forEach(function (row) {
      const code = String(row.querySelector('[data-sp-shift-code]').value || '').trim();
      if (!code) return;
      out.push({
        code: code,
        label: String(row.querySelector('[data-sp-shift-label]').value || '').trim(),
        from: row.querySelector('[data-sp-shift-from]').value || '',
        to: row.querySelector('[data-sp-shift-to]').value || ''
      });
    });
    return out;
  }

  function readRotation() {
    const out = [];
    if (!modal) return out;
    modal.querySelectorAll('[data-sp-rotation-row]').forEach(function (row) {
      const code = row.querySelector('[data-sp-rotation-code]').value;
      const days = Number(row.querySelector('[data-sp-rotation-days]').value || 0);
      if (!code || !(days > 0)) return;
      out.push({ code: code, days: days });
    });
    return out;
  }

  function updateCycle() {
    if (!modal) return;
    const box = modal.querySelector('[data-sp-cycle]');
    if (!box) return;
    const rotation = readRotation();
    const total = rotation.reduce(function (sum, r) { return sum + r.days; }, 0);
    box.textContent = total ? 'طول چرخه: ' + fa(total) + ' روز' : 'ترتیب چرخش خالی است.';
  }

  async function saveTemplate() {
    const state = data();
    const form = modal.querySelector('[data-sp-form="template"]');
    const id = form.getAttribute('data-sp-id');
    const name = String(form.querySelector('[name="name"]').value || '').trim();
    if (!name) { bridge.toast('نام قالب را بنویس.'); return; }
    const shifts = readShifts();
    if (!shifts.length) { bridge.toast('حداقل یک شیفت با کد تعریف کن.'); return; }
    const rotation = readRotation();
    if (!rotation.length) { bridge.toast('ترتیب چرخش را مشخص کن.'); return; }
    const cycleStart = readJalali(form, 'cycleStart');
    const record = {
      id: id || bridge.createId(),
      name: name,
      shifts: shifts,
      rotation: rotation,
      cycleStart: cycleStart || todayIso(),
      active: true
    };
    if (id) {
      state.shiftTemplates = (state.shiftTemplates || []).map(function (t) { return String(t.id) === String(id) ? record : t; });
    } else {
      state.shiftTemplates = (state.shiftTemplates || []).concat([record]);
    }
    if (await bridge.save()) {
      closeModal();
      refresh();
      bridge.toast(id ? 'قالب شیفت به‌روزرسانی شد.' : 'قالب شیفت ثبت شد.');
    }
  }

  // ── پنجرهٔ تخصیص گروهی ──
  function openAssignModal(employeeIds) {
    const state = data();
    const methods = state.shiftMethods || [];
    if (!methods.length) { bridge.toast('اول یک روش کاری تعریف کن.'); return; }
    openModal('تخصیص روش کاری',
      'برای ' + fa(employeeIds.length) + ' نفر انتخاب‌شده، روش کاری و بازهٔ اعتبار را مشخص کن.',
      '<form class="module-form" data-sp-form="assign">' +
      '<div class="module-fields">' +
      field('روش کاری', select('methodId', methods.map(function (m) { return [m.id, m.name || 'روش کاری']; }), '')) +
      field('از تاریخ', '<input type="text" name="from" data-jalali-input="jalali" value="' +
        esc(bridge.jalaliInputValue(todayIso(), false)) + '">') +
      field('تا تاریخ (اختیاری)', '<input type="text" name="to" data-jalali-input="jalali" value="" placeholder="خالی = تا اطلاع ثانوی">') +
      field('توضیح', '<textarea name="note" rows="2"></textarea>') +
      '</div></form>',
      '<button type="button" class="secondary-btn" data-sp-close>انصراف</button> ' +
      '<button type="button" class="primary-btn" data-sp-save="assign">تخصیص بده</button>'
    );
    modal.setAttribute('data-sp-ids', employeeIds.join(','));
  }

  async function saveAssign() {
    const state = data();
    const form = modal.querySelector('[data-sp-form="assign"]');
    const methodId = form.querySelector('[name="methodId"]').value;
    if (!methodId) { bridge.toast('روش کاری را انتخاب کن.'); return; }
    const from = readJalali(form, 'from') || todayIso();
    const to = readJalali(form, 'to');
    const note = String(form.querySelector('[name="note"]').value || '').trim();
    const ids = String(modal.getAttribute('data-sp-ids') || '').split(',').filter(Boolean);
    if (!ids.length) { closeModal(); return; }
    ids.forEach(function (employeeId) {
      state.shiftAssignments = (state.shiftAssignments || []).concat([{
        id: bridge.createId(),
        employeeId: employeeId,
        methodId: methodId,
        from: from,
        to: to,
        note: note,
        active: true,
        createdAt: new Date().toISOString()
      }]);
    });
    if (await bridge.save()) {
      closeModal();
      selected = Object.create(null);
      refresh();
      bridge.toast('روش کاری برای ' + fa(ids.length) + ' نفر تخصیص داده شد.');
    }
  }

  // ── پنجرهٔ تغییر وضعیت یک روز ──
  function openOverrideModal(employeeId, iso) {
    const state = data();
    const employee = (state.employees || []).find(function (e) { return String(e.id) === String(employeeId); });
    const status = resolve(state, employeeId, iso);
    const templates = state.shiftTemplates || [];
    const shiftOptions = templates.reduce(function (out, template) {
      templateShifts(template).forEach(function (shift) {
        out.push({ value: template.id + '|' + shift.code, label: (shift.label || shift.code) + ' · ' + (shift.from || '') + '–' + (shift.to || '') });
      });
      return out;
    }, []);

    openModal('تغییر وضعیت شیفت',
      (employee ? bridge.employeeName(employee) : '') + ' · ' + bridge.formatJalali(iso, false) +
      ' · وضعیت فعلی: ' + status.label,
      '<form class="module-form" data-sp-form="override">' +
      '<div class="module-fields">' +
      field('نوع تغییر', select('kind', OVERRIDE_KINDS, 'overtime')) +
      field('شیفت جایگزین (اختیاری)', '<select name="shift"><option value="">— بدون شیفت —</option>' +
        shiftOptions.map(function (option) {
          return '<option value="' + esc(option.value) + '">' + esc(option.label) + '</option>';
        }).join('') + '</select>', 'برای اضافه‌کار یا جایگزینی، شیفت و ساعتش را انتخاب کن.') +
      field('از تاریخ', '<input type="text" name="from" data-jalali-input="jalali" value="' +
        esc(bridge.jalaliInputValue(iso, false)) + '">') +
      field('تا تاریخ', '<input type="text" name="to" data-jalali-input="jalali" value="' +
        esc(bridge.jalaliInputValue(iso, false)) + '">', 'برای یک روز، هر دو تاریخ یکی است.') +
      field('دائمی است؟', select('permanent', [['0', 'موقت (فقط همین بازه)'], ['1', 'دائمی (تا تغییر بعدی)']], '0')) +
      field('کامنت', '<textarea name="note" rows="2" placeholder="مثلاً جایگزین آقای احمدی در شیفت شب"></textarea>') +
      '</div></form>',
      '<button type="button" class="secondary-btn" data-sp-close>انصراف</button> ' +
      '<button type="button" class="primary-btn" data-sp-save="override">ثبت تغییر</button>'
    );
    modal.setAttribute('data-sp-emp', employeeId);
    modal.setAttribute('data-sp-date', iso);
  }

  async function saveOverride() {
    const state = data();
    const form = modal.querySelector('[data-sp-form="override"]');
    const employeeId = modal.getAttribute('data-sp-emp');
    const kind = form.querySelector('[name="kind"]').value;
    const shiftValue = form.querySelector('[name="shift"]').value;
    const from = readJalali(form, 'from');
    const to = readJalali(form, 'to') || from;
    const permanent = form.querySelector('[name="permanent"]').value === '1';
    const note = String(form.querySelector('[name="note"]').value || '').trim();
    if (!from) { bridge.toast('تاریخ شروع را مشخص کن.'); return; }
    const parts = shiftValue ? shiftValue.split('|') : [];
    state.shiftOverrides = (state.shiftOverrides || []).concat([{
      id: bridge.createId(),
      employeeId: employeeId,
      kind: kind,
      templateId: parts[0] || '',
      code: parts[1] || '',
      from: from,
      to: to,
      permanent: permanent,
      note: note,
      createdAt: new Date().toISOString()
    }]);
    if (await bridge.save()) {
      closeModal();
      refresh();
      bridge.toast('تغییر وضعیت ثبت شد.');
    }
  }

  // ── پنجرهٔ شیفت یک نفر ──
  function openPersonModal(employeeId) {
    const state = data();
    const employee = (state.employees || []).find(function (e) { return String(e.id) === String(employeeId); });
    if (!employee) return;
    personId = employeeId;
    const sheet = personRows(state, employeeId);
    const body = '<div class="sp-person-head"><strong>' + esc(bridge.employeeName(employee)) + '</strong>' +
      '<span>' + esc(employee.personnelId || '') + ' · ' + esc(employeeStation(employee) || '—') + '</span></div>' +
      '<div class="module-table-wrap sp-person-wrap"><table class="module-table sp-table"><thead><tr>' +
      sheet.rows[0].map(function (cell) { return '<th>' + esc(cell) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + sheet.rows.slice(1).map(function (row) {
        return '<tr>' + row.map(function (cell) { return '<td>' + esc(cell) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
    openModal('شیفت ' + (bridge.employeeName(employee) || ''),
      'بازهٔ ' + bridge.formatJalali(range.from, false) + ' تا ' + bridge.formatJalali(range.to, false),
      body,
      '<button type="button" class="secondary-btn" data-sp-export="print" data-sp-scope="person">چاپ / PDF</button> ' +
      '<button type="button" class="secondary-btn" data-sp-export="xlsx" data-sp-scope="person">Excel</button> ' +
      '<button type="button" class="secondary-btn" data-sp-export="docx" data-sp-scope="person">Word</button> ' +
      '<button type="button" class="secondary-btn" data-sp-export="csv" data-sp-scope="person">CSV</button> ' +
      '<button type="button" class="primary-btn" data-sp-close>بستن</button>'
    );
  }

  // ═══ ۷. قالب‌های آماده ═══════════════════════════════════════════════════
  async function applyPreset(key) {
    const state = data();
    const presets = {
      'office-8-14': function () {
        return { method: { name: 'روزکار اداری ۸ تا ۱۴', kind: 'office', weekly: defaultWeekly('08:00', '14:00') } };
      },
      'office-7-15': function () {
        return { method: { name: 'روزکار اداری ۷ تا ۱۵', kind: 'office', weekly: defaultWeekly('07:00', '15:00') } };
      },
      'fixed-8-16': function () {
        return { method: { name: 'روزکار شیفتی ۸ تا ۱۶', kind: 'fixedShift', weekly: defaultWeekly('08:00', '16:00') } };
      },
      'fixed-7-19': function () {
        return { method: { name: 'روزکار شیفتی ۷ تا ۱۹', kind: 'fixedShift', weekly: defaultWeekly('07:00', '19:00') } };
      },
      'rotating-12': function () {
        return {
          template: {
            name: '۱۲ ساعته ۲/۲/۴',
            shifts: [{ code: 'ص', label: 'صبح‌کار', from: '07:00', to: '19:00' }, { code: 'ش', label: 'شب‌کار', from: '19:00', to: '07:00' }],
            rotation: [{ code: 'ص', days: 2 }, { code: 'ش', days: 2 }, { code: OFF, days: 4 }],
            cycleStart: todayIso()
          },
          method: { name: 'شیفت ۱۲ ساعته روز/شب', kind: 'rotating' }
        };
      },
      'rotating-8': function () {
        return {
          template: {
            name: '۸ ساعته سه‌شیفت',
            shifts: [
              { code: 'ص', label: 'صبح', from: '06:00', to: '14:00' },
              { code: 'ع', label: 'عصر', from: '14:00', to: '22:00' },
              { code: 'ش', label: 'شب', from: '22:00', to: '06:00' }
            ],
            rotation: [{ code: 'ص', days: 2 }, { code: 'ع', days: 2 }, { code: 'ش', days: 2 }, { code: OFF, days: 2 }],
            cycleStart: todayIso()
          },
          method: { name: 'شیفت ۸ ساعته سه‌شیفت', kind: 'rotating' }
        };
      },
      '2-2-4': function () {
        return {
          template: {
            name: '۲ صبح · ۲ شب · ۴ استراحت',
            shifts: [{ code: 'ص', label: 'صبح‌کار', from: '07:00', to: '19:00' }, { code: 'ش', label: 'شب‌کار', from: '19:00', to: '07:00' }],
            rotation: [{ code: 'ص', days: 2 }, { code: 'ش', days: 2 }, { code: OFF, days: 4 }],
            cycleStart: todayIso()
          }
        };
      },
      '2-2-2': function () {
        return {
          template: {
            name: '۲ صبح · ۲ شب · ۲ استراحت',
            shifts: [{ code: 'ص', label: 'صبح‌کار', from: '07:00', to: '19:00' }, { code: 'ش', label: 'شب‌کار', from: '19:00', to: '07:00' }],
            rotation: [{ code: 'ص', days: 2 }, { code: 'ش', days: 2 }, { code: OFF, days: 2 }],
            cycleStart: todayIso()
          }
        };
      },
      '3-3-3': function () {
        return {
          template: {
            name: '۳ صبح · ۳ شب · ۳ استراحت',
            shifts: [{ code: 'ص', label: 'صبح‌کار', from: '07:00', to: '19:00' }, { code: 'ش', label: 'شب‌کار', from: '19:00', to: '07:00' }],
            rotation: [{ code: 'ص', days: 3 }, { code: 'ش', days: 3 }, { code: OFF, days: 3 }],
            cycleStart: todayIso()
          }
        };
      },
      'three-8': function () {
        return {
          template: {
            name: '۸ ساعته سه‌شیفت',
            shifts: [
              { code: 'ص', label: 'صبح', from: '06:00', to: '14:00' },
              { code: 'ع', label: 'عصر', from: '14:00', to: '22:00' },
              { code: 'ش', label: 'شب', from: '22:00', to: '06:00' }
            ],
            rotation: [{ code: 'ص', days: 2 }, { code: 'ع', days: 2 }, { code: 'ش', days: 2 }, { code: OFF, days: 2 }],
            cycleStart: todayIso()
          }
        };
      }
    };
    const build = presets[key];
    if (!build) return;
    const spec = build();
    let templateId = '';
    if (spec.template) {
      const record = Object.assign({ id: bridge.createId(), active: true }, spec.template);
      state.shiftTemplates = (state.shiftTemplates || []).concat([record]);
      templateId = record.id;
    }
    if (spec.method) {
      const record = Object.assign({
        id: bridge.createId(), active: true, templateId: templateId,
        weekly: defaultWeekly('08:00', '14:00'), notes: ''
      }, spec.method);
      state.shiftMethods = (state.shiftMethods || []).concat([record]);
    }
    if (await bridge.save()) {
      refresh();
      bridge.toast('قالب آماده اضافه شد.');
    }
  }

  // ═══ ۸. رویدادها ═════════════════════════════════════════════════════════
  function onSectionClick(event) {
    const target = event.target;
    if (!host || !host.contains(target)) return;

    const tabButton = target.closest('[data-sp-tab]');
    if (tabButton) {
      tab = tabButton.getAttribute('data-sp-tab');
      render(host, bridge);
      return;
    }

    if (target.closest('[data-sp-new="method"]')) { openMethodModal(''); return; }
    if (target.closest('[data-sp-new="template"]')) { openTemplateModal(''); return; }

    const edit = target.closest('[data-sp-edit]');
    if (edit) {
      if (edit.getAttribute('data-sp-edit') === 'method') openMethodModal(edit.getAttribute('data-sp-id'));
      else openTemplateModal(edit.getAttribute('data-sp-id'));
      return;
    }

    const del = target.closest('[data-sp-del]');
    if (del) { removeRecord(del.getAttribute('data-sp-del'), del.getAttribute('data-sp-id')); return; }

    const preset = target.closest('[data-sp-preset]');
    if (preset) { applyPreset(preset.getAttribute('data-sp-preset')); return; }

    const rangeButton = target.closest('[data-sp-range]');
    if (rangeButton) {
      const mode = rangeButton.getAttribute('data-sp-range');
      const today = todayIso();
      if (mode === 'today') range = { from: today, to: today };
      else if (mode === 'week') range = { from: today, to: addDays(today, 6) };
      else if (mode === 'month') range = monthRange();
      else if (mode === 'quarter') range = { from: today, to: addDays(today, 89) };
      refresh();
      return;
    }

    const modeButton = target.closest('[data-sp-mode]');
    if (modeButton) { gridMode = modeButton.getAttribute('data-sp-mode'); refresh(); return; }

    if (target.closest('[data-sp-reset]')) {
      filters = { city: '', station: '', method: '', code: '', status: '' };
      search = '';
      refresh();
      return;
    }

    if (target.closest('[data-sp-select-all]')) {
      filteredEmployees(data()).forEach(function (employee) { selected[employee.id] = true; });
      refresh();
      return;
    }
    if (target.closest('[data-sp-select-invert]')) {
      filteredEmployees(data()).forEach(function (employee) {
        if (selected[employee.id]) delete selected[employee.id];
        else selected[employee.id] = true;
      });
      refresh();
      return;
    }
    if (target.closest('[data-sp-select-clear]')) { selected = Object.create(null); refresh(); return; }

    if (target.closest('[data-sp-bulk-assign]')) {
      const ids = Object.keys(selected).filter(function (id) { return selected[id]; });
      if (!ids.length) { bridge.toast('اول چند نفر را تیک بزن.'); return; }
      openAssignModal(ids);
      return;
    }

    const cell = target.closest('[data-sp-cell]');
    if (cell) { openOverrideModal(cell.getAttribute('data-sp-cell'), cell.getAttribute('data-sp-date')); return; }

    const person = target.closest('[data-sp-person]');
    if (person) { openPersonModal(person.getAttribute('data-sp-person')); return; }

    const exportButton = target.closest('[data-sp-export]');
    if (exportButton) {
      runExport(exportButton.getAttribute('data-sp-export'), exportButton.getAttribute('data-sp-scope'));
      return;
    }
  }

  function onSectionChange(event) {
    const target = event.target;
    if (!host || !host.contains(target)) return;

    const filter = target.closest('[data-sp-filter]');
    if (filter) {
      filters[filter.getAttribute('data-sp-filter')] = filter.value;
      refresh();
      return;
    }

    const selectAll = target.closest('[data-sp-select-all]');
    if (selectAll) {
      filteredEmployees(data()).forEach(function (employee) {
        if (selectAll.checked) selected[employee.id] = true;
        else delete selected[employee.id];
      });
      host.querySelectorAll('[data-sp-select]').forEach(function (box) {
        box.checked = !!selected[box.getAttribute('data-sp-select')];
      });
      syncSelectionUi();
      return;
    }

    const pick = target.closest('[data-sp-select]');
    if (pick) {
      const id = pick.getAttribute('data-sp-select');
      if (pick.checked) selected[id] = true;
      else delete selected[id];
      // تیک زدن یک ردیف نباید کل جدول را دوباره بسازد؛ فقط شمارنده‌ها به‌روز می‌شوند.
      syncSelectionUi();
      return;
    }

    const assignSelect = target.closest('[data-sp-assign-method]');
    if (assignSelect) {
      quickAssign(assignSelect.getAttribute('data-sp-assign-method'), assignSelect.value);
      return;
    }

    const rangeFrom = target.closest('[data-sp-range-from]');
    const rangeTo = target.closest('[data-sp-range-to]');
    if (rangeFrom || rangeTo) {
      const value = String((rangeFrom || rangeTo).value || '').trim();
      const iso = jalaliToIso(value);
      if (!iso) return;
      if (rangeFrom) range.from = iso; else range.to = iso;
      if (dayNumber(range.to) < dayNumber(range.from)) range.to = range.from;
      refresh();
    }
  }

  function onSectionInput(event) {
    const target = event.target;
    if (!host || !host.contains(target)) return;
    if (target.closest('[data-sp-search]')) {
      search = target.value;
      // جست‌وجو با تأخیر کوتاه تا هر کلید یک رندر کامل نسازد.
      window.clearTimeout(onSectionInput.timer);
      onSectionInput.timer = window.setTimeout(function () {
        const box = host.querySelector('[data-sp-search]');
        const caret = box ? box.selectionStart : 0;
        refresh();
        const again = host.querySelector('[data-sp-search]');
        if (again) { again.focus(); try { again.setSelectionRange(caret, caret); } catch (error) {} }
      }, 220);
    }
  }

  // ورودی تاریخ شمسی مقدار «۱۴۰۵/۰۸/۱۰» می‌دهد؛ ذخیره همیشه ISO است.
  // شمارنده‌ها و دکمهٔ تخصیص گروهی را بدون بازسازی جدول هم‌گام می‌کند.
  function syncSelectionUi() {
    if (!host) return;
    const count = Object.keys(selected).filter(function (id) { return selected[id]; }).length;
    const label = host.querySelector('[data-sp-selected-count]');
    if (label) label.textContent = fa(count) + ' نفر انتخاب شده';
    const button = host.querySelector('[data-sp-bulk-assign]');
    if (button) {
      button.disabled = !count;
      button.textContent = 'تخصیص گروهی (' + fa(count) + ')';
    }
    const all = host.querySelector('[data-sp-select-all]');
    if (all) {
      const boxes = host.querySelectorAll('[data-sp-select]');
      all.checked = boxes.length > 0 && Array.prototype.every.call(boxes, function (box) { return box.checked; });
    }
  }

  function jalaliToIso(value) {
    const iso = bridge.parseJalali(value, false);
    return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
  }

  function readJalali(form, name) {
    const field = form.querySelector('[name="' + name + '"]');
    return field ? jalaliToIso(field.value) : '';
  }

  async function quickAssign(employeeId, methodId) {
    const state = data();
    if (!methodId) {
      state.shiftAssignments = (state.shiftAssignments || []).filter(function (a) {
        return String(a.employeeId) !== String(employeeId);
      });
      if (await bridge.save()) { refresh(); bridge.toast('تخصیص برداشته شد.'); }
      return;
    }
    state.shiftAssignments = (state.shiftAssignments || []).concat([{
      id: bridge.createId(),
      employeeId: employeeId,
      methodId: methodId,
      from: todayIso(),
      to: '',
      note: '',
      active: true,
      createdAt: new Date().toISOString()
    }]);
    if (await bridge.save()) { refresh(); bridge.toast('روش کاری تخصیص داده شد.'); }
  }

  async function removeRecord(kind, id) {
    const state = data();
    const labels = { method: 'روش کاری', template: 'قالب شیفت' };
    const ok = await bridge.confirm({
      title: 'حذف ' + (labels[kind] || 'مورد'),
      message: 'این مورد حذف شود؟ تخصیص‌های مرتبط با آن بدون روش کاری می‌مانند.',
      confirmLabel: 'حذف',
      danger: true
    });
    if (!ok) return;
    if (kind === 'method') {
      state.shiftMethods = (state.shiftMethods || []).filter(function (m) { return String(m.id) !== String(id); });
    } else if (kind === 'template') {
      state.shiftTemplates = (state.shiftTemplates || []).filter(function (t) { return String(t.id) !== String(id); });
    }
    if (await bridge.save()) { refresh(); bridge.toast('حذف شد.'); }
  }

  // ── رویدادهای پنجره ──
  function onModalClick(event) {
    if (!modal) return;
    const target = event.target;
    if (target === modal) { closeModal(); return; }
    if (target.closest('[data-sp-close]')) { closeModal(); return; }

    if (target.closest('[data-sp-add-shift]')) {
      const body = modal.querySelector('[data-sp-shifts] .sp-rows-body');
      if (body) body.insertAdjacentHTML('beforeend', shiftRows([{ code: '', label: '', from: '', to: '' }]));
      return;
    }
    if (target.closest('[data-sp-del-shift]')) {
      const row = target.closest('[data-sp-shift-row]');
      if (row) row.remove();
      return;
    }
    if (target.closest('[data-sp-add-rotation]')) {
      const body = modal.querySelector('[data-sp-rotation] .sp-rows-body');
      if (body) body.insertAdjacentHTML('beforeend', rotationRows([{ code: OFF, days: 1 }], readShifts()));
      updateCycle();
      return;
    }
    if (target.closest('[data-sp-del-rotation]')) {
      const row = target.closest('[data-sp-rotation-row]');
      if (row) row.remove();
      updateCycle();
      return;
    }

    const save = target.closest('[data-sp-save]');
    if (save) {
      const kind = save.getAttribute('data-sp-save');
      if (kind === 'method') saveMethod();
      else if (kind === 'template') saveTemplate();
      else if (kind === 'assign') saveAssign();
      else if (kind === 'override') saveOverride();
    }
  }

  function onModalChange(event) {
    if (!modal) return;
    if (event.target.closest('[name="kind"]')) syncMethodKind();
    if (event.target.closest('[data-sp-rotation-days]') || event.target.closest('[data-sp-rotation-code]')) updateCycle();
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && modal) { closeModal(); }
  }

  document.addEventListener('click', onSectionClick);
  document.addEventListener('change', onSectionChange);
  document.addEventListener('input', onSectionInput);
  document.addEventListener('click', onModalClick);
  document.addEventListener('change', onModalChange);
  document.addEventListener('keydown', onKeydown);

  // ═══ ۹. صادرات ═══════════════════════════════════════════════════════════
  window.AtlasShiftPlanner = {
    render: render,
    // سازندهٔ ردیف‌های خروجی؛ برای آزمون و برای هر مصرف‌کنندهٔ دیگر.
    buildGridRows: function () { return gridRows(data()); },
    buildPersonRows: function (employeeId) { return personRows(data(), employeeId); },
    engine: {
      WEEKDAYS: WEEKDAYS,
      OFF: OFF,
      dayNumber: dayNumber,
      isoFromDayNumber: isoFromDayNumber,
      addDays: addDays,
      weekdayIndex: weekdayIndex,
      rangeDates: rangeDates,
      minutesOf: minutesOf,
      durationMinutes: durationMinutes,
      durationText: durationText,
      cycleLength: cycleLength,
      rotationCodeAt: rotationCodeAt,
      weeklyRuleAt: weeklyRuleAt,
      assignmentFor: assignmentFor,
      overrideFor: overrideFor,
      leaveFor: leaveFor,
      resolve: resolve,
      methodSummary: methodSummary,
      templateSummary: templateSummary,
      defaultWeekly: defaultWeekly
    }
  };
})();

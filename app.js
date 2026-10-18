(function () {
  'use strict';

  var STORE_KEY = 'atlasShiftData_v1';
  var view = 'dashboard';
  var employeeSearch = '';
  var selectedDate = localISO(new Date());
  var calendarAnchor = dateFromISO(selectedDate);
  var state = loadState();

  var systemTypes = [
    { id: 'shift12', label: 'شیفت ۱۲ ساعته', color: 'blue' },
    { id: 'daywork', label: 'کار روزکار', color: 'violet' },
    { id: 'mission-city', label: 'مأموریت شهری', color: 'orange' },
    { id: 'mission-route', label: 'مأموریت بین‌شهری', color: 'cyan' },
    { id: 'transfer', label: 'تغییر وضعیت / انتقال', color: 'pink' },
    { id: 'leave', label: 'مرخصی / عدم حضور', color: 'muted' }
  ];
  var weekdayNames = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  var monthPartFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    year: 'numeric', month: 'numeric', day: 'numeric'
  });
  var monthLabelFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    year: 'numeric', month: 'long'
  });
  var fullDateFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  });
  var shortDateFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    month: 'short', day: 'numeric'
  });
  var todayLabelFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  function localISO(date) {
    var d = new Date(date);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function dateFromISO(value) {
    if (!value) return new Date();
    var p = String(value).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
  }
  function shiftDate(date, days) {
    var d = new Date(date);
    d.setDate(d.getDate() + days);
    d.setHours(12, 0, 0, 0);
    return d;
  }
  function jalaliParts(date) {
    var parts = monthPartFormatter.formatToParts(date);
    var out = {};
    parts.forEach(function (p) {
      if (p.type !== 'literal') out[p.type] = Number(p.value);
    });
    return { year: out.year, month: out.month, day: out.day };
  }
  function sameJalaliMonth(a, b) {
    var x = jalaliParts(a), y = jalaliParts(b);
    return x.year === y.year && x.month === y.month;
  }
  function getMonthSpan(anchor) {
    var start = new Date(anchor), end = new Date(anchor);
    var guard = 0;
    while (guard < 32 && sameJalaliMonth(shiftDate(start, -1), anchor)) {
      start = shiftDate(start, -1);
      guard++;
    }
    guard = 0;
    while (guard < 32 && sameJalaliMonth(shiftDate(end, 1), anchor)) {
      end = shiftDate(end, 1);
      guard++;
    }
    return { start: start, end: end };
  }
  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }
  function defaultState() {
    return {
      version: 1,
      employees: [],
      entries: [],
      departments: ['ایمنی و آتش‌نشانی', 'بهره‌برداری', 'تعمیرات', 'اداری'],
      types: systemTypes.map(function (t) { return { id: t.id, label: t.label, color: t.color }; }),
      customSections: []
    };
  }
  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      var def = defaultState();
      if (!parsed || typeof parsed !== 'object') return def;
      return {
        version: 1,
        employees: Array.isArray(parsed.employees) ? parsed.employees : [],
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        departments: Array.isArray(parsed.departments) ? parsed.departments : def.departments,
        types: Array.isArray(parsed.types) && parsed.types.length ? parsed.types : def.types,
        customSections: Array.isArray(parsed.customSections) ? parsed.customSections : []
      };
    } catch (err) {
      return defaultState();
    }
  }
  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      toast('ذخیره‌سازی ناموفق بود؛ فضای ذخیره‌سازی مرورگر را بررسی کنید.', true);
      return false;
    }
  }
  function toast(message, isError) {
    var region = document.getElementById('toast-region');
    var el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = message;
    region.appendChild(el);
    window.setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 3600);
  }
  function employeeById(id) {
    return state.employees.find(function (e) { return e.id === id; });
  }
  function typeById(id) {
    return state.types.find(function (t) { return t.id === id; }) || {
      id: id || 'muted', label: 'نوع نامشخص', color: 'muted'
    };
  }
  function entriesForDate(isoDate) {
    return state.entries.filter(function (e) {
      var start = e.date || '';
      var end = e.endDate || start;
      return start <= isoDate && isoDate <= end;
    }).sort(function (a, b) {
      return String(a.startTime || '').localeCompare(String(b.startTime || ''));
    });
  }
  function sortedEntries() {
    return state.entries.slice().sort(function (a, b) {
      return String(a.date || '').localeCompare(String(b.date || '')) ||
        String(a.startTime || '').localeCompare(String(b.startTime || ''));
    });
  }
  function typePill(type) {
    return '<span class="type-pill type-' + escapeHTML(type.color || 'muted') + '"><i class="type-dot"></i>' +
      escapeHTML(type.label) + '</span>';
  }
  function emptyState(title, desc, action, label) {
    return '<div class="empty-state"><div class="empty-icon">✧</div><strong>' + escapeHTML(title) +
      '</strong><p>' + escapeHTML(desc) + '</p>' +
      (action ? '<button class="button button-primary button-small" data-action="' + action + '">' + escapeHTML(label) + '</button>' : '') +
      '</div>';
  }
  function setView(next) {
    view = next;
    document.querySelectorAll('.nav-item[data-view]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === view);
    });
    renderView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function renderView() {
    var titles = {
      dashboard: ['نمای کلی', 'وضعیت امروز و برنامه پیشِ رو'],
      calendar: ['تقویم شمسی', 'نمای روزانه و ماهانه برنامه‌های ثبت‌شده'],
      schedule: ['برنامه کاری', 'شیفت‌ها، مأموریت‌ها و تغییر وضعیت پرسنل'],
      employees: ['پرسنل', 'پرونده کارکنان و الگوی کاری آنان'],
      settings: ['تنظیمات', 'مدیریت واحدها، انواع فعالیت و داده‌های محلی']
    };
    document.getElementById('page-title').textContent = titles[view][0];
    document.getElementById('page-subtitle').textContent = titles[view][1];
    document.getElementById('today-label').textContent = todayLabelFormatter.format(new Date());
    var root = document.getElementById('view-root');
    if (view === 'dashboard') root.innerHTML = renderDashboard();
    else if (view === 'calendar') root.innerHTML = renderCalendar();
    else if (view === 'schedule') root.innerHTML = renderSchedule();
    else if (view === 'employees') root.innerHTML = renderEmployees();
    else root.innerHTML = renderSettings();
  }
  function renderDashboard() {
    var today = localISO(new Date());
    var todayEntries = entriesForDate(today);
    var missionCount = todayEntries.filter(function (e) {
      return e.typeId === 'mission-city' || e.typeId === 'mission-route';
    }).length;
    var nextWeek = sortedEntries().filter(function (e) {
      var end = e.endDate || e.date;
      return end >= today && e.date <= localISO(shiftDate(dateFromISO(today), 7));
    }).slice(0, 5);
    var dayWorkers = state.employees.filter(function (e) { return e.workPattern === 'day'; }).length;
    return '<div class="stats-grid">' +
      statCard('نیروی ثبت‌شده', state.employees.length, 'پرونده پرسنلی', '♙', 'accent-cyan') +
      statCard('برنامه امروز', todayEntries.length, 'فعالیت ثبت‌شده برای امروز', '◷', 'accent-violet') +
      statCard('مأموریت‌های امروز', missionCount, 'شهری یا بین‌شهری', '↗', 'accent-orange') +
      statCard('پرسنل روزکار', dayWorkers, 'بر اساس الگوی ثبت‌شده', '☼', 'accent-green') +
      '</div>' +
      '<div class="content-grid">' +
        '<section class="panel"><div class="panel-header"><div><h3>برنامه‌های پیشِ رو</h3><p>نزدیک‌ترین فعالیت‌های ثبت‌شده</p></div><button class="text-link" data-view="schedule">همه برنامه‌ها ←</button></div>' +
          (nextWeek.length ? '<div class="activity-list">' + nextWeek.map(renderActivityItem).join('') + '</div>' :
            emptyState('هنوز برنامه‌ای ثبت نشده', state.employees.length ? 'برای شروع، نخستین شیفت یا مأموریت را ثبت کنید.' : 'ابتدا کارکنان را اضافه کنید و سپس برنامه کاری بسازید.', state.employees.length ? 'add-entry' : 'add-employee', state.employees.length ? 'ثبت برنامه' : 'افزودن پرسنل')) +
        '</section>' +
        '<section class="panel"><div class="panel-header"><div><h3>دسترسی سریع</h3><p>اقدام‌های پرکاربرد</p></div></div>' +
          '<div class="quick-actions">' +
            quickAction('＋', 'افزودن پرسنل', 'ثبت پرونده جدید', 'add-employee') +
            quickAction('◷', 'ثبت برنامه', 'شیفت یا مأموریت', 'add-entry') +
            quickAction('▦', 'مشاهده تقویم', 'نمای ماه شمسی', 'calendar') +
            quickAction('⇩', 'خروجی پشتیبان', 'ذخیره فایل JSON', 'backup') +
          '</div>' +
          '<div class="mini-note"><strong>حریم داده‌ها:</strong> اطلاعات این نسخه داخل حافظه مرورگر همین دستگاه ذخیره می‌شود؛ برای انتقال یا محافظت از داده‌ها مرتب پشتیبان بگیرید.</div>' +
        '</section>' +
      '</div>' +
      '<section class="panel"><div class="panel-header"><div><h3>وضعیت سامانه</h3><p>جمع‌بندی اطلاعات محلی</p></div><span class="type-pill type-green"><i class="type-dot"></i> آماده استفاده</span></div>' +
        '<div class="quick-actions">' +
          '<div class="quick-action"><span>♙</span><div><strong>' + state.employees.length + ' پرونده پرسنلی</strong><small>قابل ویرایش و حذف</small></div></div>' +
          '<div class="quick-action"><span>◷</span><div><strong>' + state.entries.length + ' برنامه ذخیره‌شده</strong><small>قابل مشاهده در تقویم</small></div></div>' +
        '</div>' +
      '</section>';
  }
  function statCard(label, value, caption, icon, accent) {
    return '<div class="stat-card panel ' + accent + '"><div class="stat-top"><span>' + label + '</span><span class="stat-icon">' + icon +
      '</span></div><div class="stat-number">' + Number(value) + '</div><div class="stat-caption">' + caption + '</div></div>';
  }
  function quickAction(icon, label, desc, action) {
    var isView = ['calendar', 'employees', 'schedule', 'settings', 'dashboard'].indexOf(action) >= 0;
    return '<button class="quick-action" ' + (isView ? 'data-view="' + action + '"' : 'data-action="' + action + '"') +
      '><span>' + icon + '</span><div><strong>' + label + '</strong><small>' + desc + '</small></div></button>';
  }
  function renderActivityItem(entry) {
    var employee = employeeById(entry.employeeId);
    var type = typeById(entry.typeId);
    var date = dateFromISO(entry.date);
    var p = jalaliParts(date);
    var endText = entry.endDate && entry.endDate !== entry.date ? ' تا ' + shortDateFormatter.format(dateFromISO(entry.endDate)) : '';
    return '<div class="activity-item"><div class="activity-date"><strong>' + p.day + '</strong><small>' +
      escapeHTML(shortDateFormatter.format(date).split(' ')[0] || '') + '</small></div>' +
      '<div class="activity-info"><strong>' + escapeHTML(employee ? employee.name : 'پرسنل حذف‌شده') + '</strong><small>' +
      escapeHTML(entry.location || (entry.origin && entry.destination ? entry.origin + ' ← ' + entry.destination : type.label)) +
      ' · ' + escapeHTML(entry.startTime || 'ساعت ثبت نشده') + endText + '</small></div>' +
      typePill(type) + '</div>';
  }
  function renderEmployees() {
    var list = state.employees.filter(function (e) {
      var q = employeeSearch.trim().toLowerCase();
      return !q || [e.name, e.code, e.department, e.role].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    var body = list.map(function (e) {
      var count = state.entries.filter(function (en) { return en.employeeId === e.id; }).length;
      var patternLabel = e.workPattern === 'day' ? 'روزکار ثابت' : e.workPattern === 'mission' ? 'مأموریتی' : 'شیفتی';
      return '<tr><td><div class="person-cell"><span class="avatar">' + escapeHTML((e.name || '?').trim().slice(0, 1)) +
        '</span><div><strong>' + escapeHTML(e.name) + '</strong><small>' + escapeHTML(e.code || 'کد ثبت نشده') + '</small></div></div></td>' +
        '<td>' + escapeHTML(e.department || '—') + '</td><td>' + escapeHTML(e.role || '—') + '</td>' +
        '<td><span class="type-pill type-' + (e.workPattern === 'day' ? 'violet' : e.workPattern === 'mission' ? 'orange' : 'cyan') + '">' + patternLabel + '</span></td>' +
        '<td>' + count + '</td><td><div class="row-actions"><button class="icon-button" title="ویرایش" aria-label="ویرایش" data-action="edit-employee" data-id="' + e.id + '">✎</button>' +
        '<button class="icon-button danger" title="حذف" aria-label="حذف" data-action="delete-employee" data-id="' + e.id + '">×</button></div></td></tr>';
    }).join('');
    return '<div class="section-heading"><div><h2>فهرست پرسنل</h2><p>اطلاعات پایه کارکنان و الگوی کاری</p></div><button class="button button-primary" data-action="add-employee">＋ افزودن پرسنل</button></div>' +
      '<div class="panel"><div class="toolbar"><div class="toolbar-left"><input class="search-box" type="search" id="employee-search" placeholder="جست‌وجو بر اساس نام، کد یا واحد…" value="' +
      escapeHTML(employeeSearch) + '"></div><div class="toolbar-right"><span class="type-pill">' + state.employees.length + ' نفر در سامانه</span></div></div>' +
      (list.length ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>نام و کد پرسنلی</th><th>واحد</th><th>سمت</th><th>الگوی کاری</th><th>برنامه‌ها</th><th>عملیات</th></tr></thead><tbody>' + body + '</tbody></table></div>' :
        emptyState(state.employees.length ? 'نتیجه‌ای پیدا نشد' : 'فهرست پرسنل خالی است', state.employees.length ? 'عبارت جست‌وجو را تغییر دهید.' : 'برای شروع مدیریت شیفت، اولین پرونده پرسنلی را ثبت کنید.', state.employees.length ? '' : 'add-employee', 'افزودن پرسنل')) +
      '</div>';
  }
  function renderSchedule() {
    var entries = sortedEntries();
    var today = localISO(new Date());
    var nextCount = entries.filter(function (e) { return (e.endDate || e.date) >= today; }).length;
    var rows = entries.map(function (e) {
      var emp = employeeById(e.employeeId), type = typeById(e.typeId);
      var place = e.origin && e.destination ? e.origin + ' ← ' + e.destination : (e.location || '—');
      var range = shortDateFormatter.format(dateFromISO(e.date)) +
        (e.endDate && e.endDate !== e.date ? ' تا ' + shortDateFormatter.format(dateFromISO(e.endDate)) : '');
      return '<tr><td><span class="nowrap">' + escapeHTML(range) + '</span></td><td>' + escapeHTML(emp ? emp.name : 'پرسنل حذف‌شده') +
        '</td><td>' + typePill(type) + '</td><td>' + escapeHTML(place) +
        (e.km ? '<small class="muted"> · ' + escapeHTML(e.km) + ' کیلومتر</small>' : '') +
        '</td><td>' + escapeHTML(e.startTime || '—') + (e.endTime ? ' تا ' + escapeHTML(e.endTime) : '') +
        '</td><td><div class="row-actions"><button class="icon-button" aria-label="ویرایش" data-action="edit-entry" data-id="' + e.id + '">✎</button>' +
        '<button class="icon-button danger" aria-label="حذف" data-action="delete-entry" data-id="' + e.id + '">×</button></div></td></tr>';
    }).join('');
    return '<div class="section-heading"><div><h2>برنامه‌های ثبت‌شده</h2><p>از این بخش برنامه کاری پرسنل را مدیریت کنید.</p></div><button class="button button-primary" data-action="add-entry">＋ ثبت برنامه جدید</button></div>' +
      '<div class="stats-grid">' + statCard('کل برنامه‌ها', entries.length, 'تمام موارد ذخیره‌شده', '◷', 'accent-cyan') +
      statCard('برنامه‌های جاری/آتی', nextCount, 'با توجه به تاریخ امروز', '↗', 'accent-violet') +
      statCard('مأموریت‌ها', entries.filter(function (e) { return e.typeId === 'mission-city' || e.typeId === 'mission-route'; }).length, 'تمام مأموریت‌های ثبت‌شده', '⌁', 'accent-orange') +
      statCard('انواع فعالیت', state.types.length, 'قابل مدیریت از تنظیمات', '⚙', 'accent-green') + '</div>' +
      '<div class="panel"><div class="toolbar"><div><strong>همه برنامه‌ها</strong><div class="muted" style="font-size:10px;margin-top:3px">بر اساس تاریخ و ساعت شروع مرتب شده‌اند.</div></div><span class="type-pill">' + entries.length + ' مورد</span></div>' +
      (entries.length ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>تاریخ</th><th>پرسنل</th><th>نوع فعالیت</th><th>مکان / مسیر</th><th>ساعت</th><th>عملیات</th></tr></thead><tbody>' + rows + '</tbody></table></div>' :
        emptyState('برنامه‌ای ثبت نشده', 'با انتخاب پرسنل، نوع فعالیت و تاریخ، برنامه را ثبت کنید.', state.employees.length ? 'add-entry' : 'add-employee', state.employees.length ? 'ثبت برنامه' : 'ابتدا افزودن پرسنل')) +
      '</div>';
  }
  function renderCalendar() {
    var span = getMonthSpan(calendarAnchor);
    var days = [];
    var offset = (span.start.getDay() + 1) % 7;
    for (var i = 0; i < offset; i++) days.push(shiftDate(span.start, i - offset));
    var cursor = new Date(span.start);
    while (cursor <= span.end) {
      days.push(new Date(cursor));
      cursor = shiftDate(cursor, 1);
    }
    while (days.length % 7 !== 0) days.push(shiftDate(days[days.length - 1], 1));
    var today = localISO(new Date());
    var dateCards = days.map(function (date) {
      var iso = localISO(date), p = jalaliParts(date);
      var inMonth = sameJalaliMonth(date, calendarAnchor);
      var events = entriesForDate(iso);
      var markers = events.slice(0, 5).map(function (e) {
        return '<i class="day-marker ' + escapeHTML(typeById(e.typeId).color || 'muted') + '"></i>';
      }).join('');
      return '<button class="calendar-day' + (inMonth ? '' : ' outside') + (iso === today ? ' today' : '') +
        (iso === selectedDate ? ' selected' : '') + '" data-action="select-day" data-date="' + iso + '" aria-label="' +
        escapeHTML(fullDateFormatter.format(date)) + '"><span class="day-number">' + p.day + '</span><span class="day-markers">' + markers +
        '</span>' + (events.length ? '<span class="day-count">' + events.length + ' برنامه</span>' : '') + '</button>';
    }).join('');
    var selected = dateFromISO(selectedDate);
    var selectedEntries = entriesForDate(selectedDate);
    return '<div class="section-heading"><div><h2>تقویم کاری</h2><p>روزهای دارای برنامه با نشانگر رنگی مشخص می‌شوند.</p></div><button class="button button-secondary" data-action="calendar-today">رفتن به امروز</button></div>' +
      '<div class="calendar-layout"><section class="panel calendar-panel"><div class="calendar-head"><div><div class="calendar-month">' + escapeHTML(monthLabelFormatter.format(calendarAnchor)) +
      '</div><div class="calendar-subtitle">تقویم هجری شمسی · هفته از شنبه آغاز می‌شود</div></div><div class="calendar-controls"><button data-action="calendar-prev" aria-label="ماه قبل">›</button><button data-action="calendar-next" aria-label="ماه بعد">‹</button></div></div>' +
      '<div class="calendar-weekdays">' + weekdayNames.map(function (n) { return '<div>' + n + '</div>'; }).join('') + '</div>' +
      '<div class="calendar-days">' + dateCards + '</div><div class="mini-note">روی هر روز بزنید تا برنامه‌های همان روز نمایش داده شوند.</div></section>' +
      '<section class="panel"><div class="panel-header"><div><h3 class="selected-day-title">' + escapeHTML(fullDateFormatter.format(selected)) +
      '</h3><p class="selected-day-description">برنامه‌های مرتبط با تاریخ انتخاب‌شده</p></div><span class="type-pill">' + selectedEntries.length + ' مورد</span></div>' +
      (selectedEntries.length ? '<div class="day-events">' + selectedEntries.map(function (e) {
        var emp = employeeById(e.employeeId), t = typeById(e.typeId);
        var place = e.origin && e.destination ? e.origin + ' ← ' + e.destination : (e.location || 'مکان ثبت نشده');
        return '<div class="day-event"><div class="day-event-head"><strong>' + escapeHTML(emp ? emp.name : 'پرسنل حذف‌شده') + '</strong>' +
          typePill(t) + '</div><p>' + escapeHTML(place) + '</p><p>' + escapeHTML((e.startTime || 'ساعت نامشخص') + (e.endTime ? ' تا ' + e.endTime : '') +
          (e.km ? ' · ' + e.km + ' کیلومتر' : '')) + '</p><div class="row-actions" style="margin-top:8px"><button class="button button-secondary button-small" data-action="edit-entry" data-id="' + e.id + '">ویرایش</button>' +
          '<button class="button button-secondary button-small" data-action="edit-entry" data-id="' + e.id + '" data-date="' + selectedDate + '">جزئیات</button></div></div>';
      }).join('') + '</div>' :
        emptyState('برای این روز برنامه‌ای نیست', 'می‌توانید همین حالا شیفت یا مأموریت اضافه کنید.', state.employees.length ? 'add-entry' : 'add-employee', state.employees.length ? 'ثبت برنامه برای این روز' : 'افزودن پرسنل')) +
      '</section></div>';
  }
  function renderSettings() {
    var depts = state.departments.map(function (d) {
      return '<span class="config-chip">' + escapeHTML(d) + '<button title="ویرایش واحد" aria-label="ویرایش واحد" data-action="edit-department" data-name="' + escapeHTML(d) + '">✎</button>' +
        '<button title="حذف واحد" aria-label="حذف واحد" data-action="delete-department" data-name="' + escapeHTML(d) + '">×</button></span>';
    }).join('');
    var types = state.types.map(function (t) {
      return '<span class="config-chip">' + typePill(t) +
        '<button title="ویرایش نوع فعالیت" aria-label="ویرایش نوع فعالیت" data-action="edit-type" data-id="' + t.id + '">✎</button>' +
        '<button title="حذف نوع فعالیت" aria-label="حذف نوع فعالیت" data-action="delete-type" data-id="' + t.id + '">×</button></span>';
    }).join('');
    return '<div class="section-heading"><div><h2>پیکربندی برنامه</h2><p>واحدها و انواع فعالیت متناسب با ساختار سازمان را تعریف کنید.</p></div></div>' +
      '<div class="settings-grid"><section class="settings-panel"><h3>واحدها / بخش‌ها</h3><p>واحدها را اضافه، ویرایش یا حذف کنید.</p>' +
      '<form id="department-form" class="inline-form"><input class="field-input" name="name" placeholder="نام واحد جدید…" required maxlength="60"><button class="button button-primary button-small" type="submit">افزودن</button></form>' +
      '<div class="chip-list">' + (depts || '<span class="muted">هنوز واحدی تعریف نشده است.</span>') + '</div></section>' +
      '<section class="settings-panel"><h3>انواع فعالیت</h3><p>شیفت، روزکار، انواع مأموریت و موارد اختصاصی را مدیریت کنید.</p>' +
      '<button class="button button-primary button-small" data-action="add-type" style="margin-bottom:12px">＋ نوع فعالیت جدید</button>' +
      '<div class="chip-list">' + (types || '<span class="muted">نوع فعالیتی تعریف نشده است.</span>') + '</div></section>' +
      '<section class="settings-panel settings-wide"><h3>داده‌ها و پشتیبان</h3><p>اطلاعات در همین مرورگر ذخیره می‌شود؛ برای انتقال به دستگاه دیگر باید خروجی بگیرید.</p>' +
      '<div class="backup-actions"><button class="button button-primary" data-action="backup">⇩ دریافت فایل پشتیبان</button><button class="button button-secondary" data-action="restore">⇧ بازیابی از فایل JSON</button>' +
      '<button class="button button-danger" data-action="reset-data">پاک‌کردن همه داده‌ها</button></div>' +
      '<div class="backup-info">خروجی شامل فهرست پرسنل، برنامه‌ها، واحدها و انواع فعالیت است. فایل پشتیبان را در محل امن نگه دارید. حذف داده‌ها برگشت‌پذیر نیست مگر اینکه نسخه پشتیبان داشته باشید.</div></section>' +
      '<section class="settings-panel settings-wide"><h3>وضعیت ذخیره‌سازی</h3><p>نمایش خلاصه اطلاعات این دستگاه</p><div class="quick-actions">' +
      '<div class="quick-action"><span>♙</span><div><strong>' + state.employees.length + ' پرسنل</strong><small>پرونده ذخیره‌شده</small></div></div>' +
      '<div class="quick-action"><span>◷</span><div><strong>' + state.entries.length + ' برنامه</strong><small>رکورد ذخیره‌شده</small></div></div>' +
      '<div class="quick-action"><span>▦</span><div><strong>' + state.departments.length + ' واحد</strong><small>قابل انتخاب برای کارکنان</small></div></div>' +
      '<div class="quick-action"><span>⚙</span><div><strong>' + state.types.length + ' نوع فعالیت</strong><small>قابل انتخاب در برنامه‌ریزی</small></div></div>' +
      '</div></section></div>';
  }

  function openModal(title, subtitle, body, widthClass) {
    var root = document.getElementById('modal-root');
    root.innerHTML = '<div class="modal-backdrop" data-action="close-backdrop"><div class="modal-card ' + (widthClass || '') +
      '" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><div><h2 id="modal-title">' + escapeHTML(title) +
      '</h2><p>' + escapeHTML(subtitle || '') + '</p></div><button class="close-modal" data-action="close-modal" aria-label="بستن">×</button></div>' +
      body + '</div></div>';
    var first = root.querySelector('input,select,textarea,button');
    if (first) first.focus();
  }
  function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
  }
  function openEmployeeForm(id) {
    var item = id ? employeeById(id) : null;
    var depts = state.departments.map(function (d) {
      return '<option value="' + escapeHTML(d) + '"' + (item && item.department === d ? ' selected' : '') + '>' + escapeHTML(d) + '</option>';
    }).join('');
    if (item && item.department && state.departments.indexOf(item.department) < 0) {
      depts += '<option selected value="' + escapeHTML(item.department) + '">' + escapeHTML(item.department) + '</option>';
    }
    var pattern = item ? item.workPattern : 'shift';
    var body = '<form id="employee-form" data-id="' + (item ? item.id : '') + '"><div class="form-grid">' +
      field('نام و نام خانوادگی', '<input class="field-input" name="name" required maxlength="100" placeholder="نام کامل" value="' + escapeHTML(item ? item.name : '') + '">') +
      field('کد پرسنلی', '<input class="field-input" name="code" maxlength="40" placeholder="شماره پرسنلی (اختیاری)" value="' + escapeHTML(item ? item.code : '') + '">') +
      field('واحد سازمانی', '<select class="field-select" name="department"><option value="">انتخاب واحد…</option>' + depts + '</select>') +
      field('سمت / تخصص', '<input class="field-input" name="role" maxlength="100" placeholder="مثلاً کارشناس ایمنی" value="' + escapeHTML(item ? item.role : '') + '">') +
      field('الگوی کاری پایه', '<select class="field-select" name="workPattern"><option value="shift"' + (pattern === 'shift' ? ' selected' : '') + '>شیفتی (مثلاً ۱۲ ساعته)</option><option value="day"' + (pattern === 'day' ? ' selected' : '') + '>روزکار ثابت</option><option value="mission"' + (pattern === 'mission' ? ' selected' : '') + '>مأموریتی / سیار</option></select>') +
      field('توضیحات', '<input class="field-input" name="notes" maxlength="180" placeholder="اطلاعات تکمیلی (اختیاری)" value="' + escapeHTML(item ? item.notes : '') + '">') +
      '</div><div class="form-actions"><button class="button button-primary" type="submit">' + (item ? 'ذخیره تغییرات' : 'ثبت پرسنل') + '</button><button class="button button-secondary" type="button" data-action="close-modal">انصراف</button></div></form>';
    openModal(item ? 'ویرایش پرونده پرسنلی' : 'افزودن پرسنل', 'اطلاعات این فرم فقط در حافظه محلی برنامه ذخیره می‌شود.', body);
  }
  function field(label, control, extraClass) {
    return '<div class="form-field ' + (extraClass || '') + '"><label>' + label + '</label>' + control + '</div>';
  }
  function openEntryForm(id) {
    var item = id ? state.entries.find(function (e) { return e.id === id; }) : null;
    if (!item && !state.employees.length) {
      toast('برای ثبت برنامه، ابتدا یک پرونده پرسنلی بسازید.');
      openEmployeeForm();
      return;
    }
    var employeeOptions = state.employees.map(function (e) {
      return '<option value="' + e.id + '"' + (item && item.employeeId === e.id ? ' selected' : '') + '>' +
        escapeHTML(e.name + (e.code ? ' · ' + e.code : '')) + '</option>';
    }).join('');
    var typeOptions = state.types.map(function (t) {
      return '<option value="' + t.id + '"' + (item && item.typeId === t.id ? ' selected' : (!item && t.id === 'shift12' ? ' selected' : '')) + '>' + escapeHTML(t.label) + '</option>';
    }).join('');
    var dateValue = item ? item.date : selectedDate || localISO(new Date());
    var endValue = item ? (item.endDate || '') : '';
    var body = '<form id="entry-form" data-id="' + (item ? item.id : '') + '"><div class="form-grid">' +
      field('پرسنل', '<select class="field-select" name="employeeId" required><option value="">انتخاب کارکنان…</option>' + employeeOptions + '</select>') +
      field('نوع فعالیت', '<select class="field-select" name="typeId" required>' + typeOptions + '</select>') +
      field('تاریخ شروع', '<input class="field-input" name="date" type="date" required value="' + escapeHTML(dateValue) + '"><span class="hint">تاریخ ورودی بر اساس قالب دستگاه است؛ نمایش تقویم در برنامه شمسی است.</span>') +
      field('تاریخ پایان (اختیاری)', '<input class="field-input" name="endDate" type="date" min="' + escapeHTML(dateValue) + '" value="' + escapeHTML(endValue) + '"><span class="hint">برای فعالیت چندروزه مثل مأموریت استفاده کنید.</span>') +
      field('ساعت شروع', '<input class="field-input" name="startTime" type="time" value="' + escapeHTML(item ? item.startTime : '') + '">') +
      field('ساعت پایان', '<input class="field-input" name="endTime" type="time" value="' + escapeHTML(item ? item.endTime : '') + '">') +
      field('مکان / شهر', '<input class="field-input" name="location" maxlength="120" placeholder="مثلاً اهواز، منطقه عملیاتی…" value="' + escapeHTML(item ? item.location : '') + '">') +
      field('مبدأ مسیر (مأموریت بین‌شهری)', '<input class="field-input" name="origin" maxlength="100" placeholder="شهر یا محل شروع" value="' + escapeHTML(item ? item.origin : '') + '">') +
      field('مقصد مسیر', '<input class="field-input" name="destination" maxlength="100" placeholder="شهر یا محل مقصد" value="' + escapeHTML(item ? item.destination : '') + '">') +
      field('مسافت مسیر (کیلومتر)', '<input class="field-input" name="km" type="number" min="0" step="0.1" placeholder="مثلاً ۲۴۰" value="' + escapeHTML(item ? item.km : '') + '">') +
      field('یادداشت', '<textarea class="field-textarea" name="notes" maxlength="700" placeholder="توضیح، شماره نامه، جزئیات مأموریت و…">' + escapeHTML(item ? item.notes : '') + '</textarea>', 'full') +
      '</div><div class="form-actions"><button class="button button-primary" type="submit">' + (item ? 'ذخیره تغییرات' : 'ثبت برنامه') +
      '</button><button class="button button-secondary" type="button" data-action="close-modal">انصراف</button></div></form>';
    openModal(item ? 'ویرایش برنامه کاری' : 'ثبت برنامه کاری', 'نوع فعالیت و بازه تاریخ را انتخاب کنید؛ برای هر نفر می‌توان چند برنامه ثبت کرد.', body);
  }
  function openTypeForm(id) {
    var item = id ? typeById(id) : null;
    var colors = [
      ['blue', 'آبی'], ['cyan', 'فیروزه‌ای'], ['violet', 'بنفش'], ['green', 'سبز'],
      ['orange', 'نارنجی'], ['pink', 'صورتی'], ['muted', 'خنثی']
    ];
    var options = colors.map(function (c) {
      return '<option value="' + c[0] + '"' + (item && item.color === c[0] ? ' selected' : (!item && c[0] === 'cyan' ? ' selected' : '')) + '>' + c[1] + '</option>';
    }).join('');
    var body = '<form id="type-form" data-id="' + (item ? item.id : '') + '"><div class="form-grid">' +
      field('عنوان فعالیت', '<input class="field-input" name="label" required maxlength="60" placeholder="مثلاً آماده‌باش" value="' + escapeHTML(item && item.label !== 'نوع نامشخص' ? item.label : '') + '">') +
      field('رنگ نشانگر', '<select class="field-select" name="color">' + options + '</select>') +
      '</div><div class="form-actions"><button class="button button-primary" type="submit">' + (id ? 'ذخیره تغییرات' : 'افزودن نوع') +
      '</button><button class="button button-secondary" type="button" data-action="close-modal">انصراف</button></div></form>';
    openModal(id ? 'ویرایش نوع فعالیت' : 'افزودن نوع فعالیت', 'نوع‌های فعالیت در تقویم و جدول برنامه‌ها با برچسب رنگی نمایش داده می‌شوند.', body);
  }
  function openDepartmentForm(oldName) {
    var body = '<form id="department-edit-form" data-old="' + escapeHTML(oldName || '') + '"><div class="form-grid">' +
      field('نام واحد', '<input class="field-input" name="name" required maxlength="60" value="' + escapeHTML(oldName || '') + '" placeholder="نام واحد سازمانی">') +
      '</div><div class="form-actions"><button class="button button-primary" type="submit">ذخیره</button><button class="button button-secondary" type="button" data-action="close-modal">انصراف</button></div></form>';
    openModal(oldName ? 'ویرایش واحد سازمانی' : 'افزودن واحد سازمانی', 'نام واحد در پرونده پرسنل قابل انتخاب خواهد بود.', body);
  }
  function backup() {
    var payload = {
      app: 'ATLAS SHIFT',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: state
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'atlas-shift-backup-' + localISO(new Date()) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('فایل پشتیبان آماده شد.');
  }
  function restoreFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(String(reader.result || ''));
        var data = parsed && parsed.data ? parsed.data : parsed;
        if (!data || !Array.isArray(data.employees) || !Array.isArray(data.entries) ||
            !Array.isArray(data.departments) || !Array.isArray(data.types)) {
          throw new Error('فرمت فایل معتبر نیست.');
        }
        if (!window.confirm('بازیابی، اطلاعات فعلی این برنامه را با داده‌های فایل جایگزین می‌کند. ادامه می‌دهید؟')) return;
        state = {
          version: 1,
          employees: data.employees,
          entries: data.entries,
          departments: data.departments,
          types: data.types,
          customSections: Array.isArray(data.customSections) ? data.customSections : []
        };
        saveState();
        employeeSearch = '';
        closeModal();
        renderView();
        toast('بازیابی اطلاعات با موفقیت انجام شد.');
      } catch (err) {
        toast('فایل انتخاب‌شده معتبر نیست یا ساختار پشتیبان را ندارد.', true);
      }
    };
    reader.onerror = function () { toast('خواندن فایل ناموفق بود.', true); };
    reader.readAsText(file);
  }

  document.addEventListener('click', function (event) {
    var viewButton = event.target.closest('[data-view]');
    if (viewButton) {
      event.preventDefault();
      setView(viewButton.dataset.view);
      return;
    }
    var button = event.target.closest('[data-action]');
    if (!button) return;
    var action = button.dataset.action;
    if (action === 'add-employee') openEmployeeForm();
    else if (action === 'edit-employee') openEmployeeForm(button.dataset.id);
    else if (action === 'delete-employee') {
      var employee = employeeById(button.dataset.id);
      if (!employee) return;
      if (window.confirm('پرونده «' + employee.name + '» حذف شود؟ برنامه‌های ثبت‌شده برای این فرد نیز حذف می‌شوند.')) {
        state.employees = state.employees.filter(function (e) { return e.id !== employee.id; });
        state.entries = state.entries.filter(function (e) { return e.employeeId !== employee.id; });
        saveState(); renderView(); toast('پرونده پرسنلی حذف شد.');
      }
    } else if (action === 'add-entry') openEntryForm();
    else if (action === 'edit-entry') openEntryForm(button.dataset.id);
    else if (action === 'delete-entry') {
      if (window.confirm('این برنامه کاری حذف شود؟')) {
        state.entries = state.entries.filter(function (e) { return e.id !== button.dataset.id; });
        saveState(); renderView(); toast('برنامه حذف شد.');
      }
    } else if (action === 'backup') backup();
    else if (action === 'restore') document.getElementById('restore-input').click();
    else if (action === 'reset-data') {
      if (window.confirm('همه پرسنل، برنامه‌ها و تنظیمات محلی پاک شوند؟ این اقدام برگشت‌پذیر نیست.')) {
        state = defaultState(); saveState(); employeeSearch = ''; selectedDate = localISO(new Date());
        calendarAnchor = dateFromISO(selectedDate); renderView(); toast('همه داده‌های محلی پاک شدند.');
      }
    } else if (action === 'close-modal') closeModal();
    else if (action === 'close-backdrop' && event.target.classList.contains('modal-backdrop')) closeModal();
    else if (action === 'calendar-prev') { calendarAnchor = shiftDate(calendarAnchor, -32); selectedDate = localISO(calendarAnchor); renderView(); }
    else if (action === 'calendar-next') { calendarAnchor = shiftDate(calendarAnchor, 32); selectedDate = localISO(calendarAnchor); renderView(); }
    else if (action === 'calendar-today') { calendarAnchor = dateFromISO(localISO(new Date())); selectedDate = localISO(new Date()); setView('calendar'); }
    else if (action === 'select-day') { selectedDate = button.dataset.date; calendarAnchor = dateFromISO(selectedDate); renderView(); }
    else if (action === 'add-type') openTypeForm();
    else if (action === 'edit-type') openTypeForm(button.dataset.id);
    else if (action === 'delete-type') {
      var typ = typeById(button.dataset.id);
      if (state.entries.some(function (e) { return e.typeId === typ.id; })) {
        toast('این نوع در برنامه‌های ثبت‌شده استفاده شده است؛ ابتدا آن برنامه‌ها را ویرایش کنید.', true);
      } else if (window.confirm('نوع فعالیت «' + typ.label + '» حذف شود؟')) {
        state.types = state.types.filter(function (t) { return t.id !== typ.id; });
        saveState(); renderView(); toast('نوع فعالیت حذف شد.');
      }
    } else if (action === 'edit-department') openDepartmentForm(button.dataset.name);
    else if (action === 'delete-department') {
      var dept = button.dataset.name;
      if (state.employees.some(function (e) { return e.department === dept; })) {
        toast('این واحد به یک یا چند پرونده پرسنلی متصل است؛ ابتدا واحد آن پرونده‌ها را تغییر دهید.', true);
      } else if (window.confirm('واحد «' + dept + '» حذف شود؟')) {
        state.departments = state.departments.filter(function (d) { return d !== dept; });
        saveState(); renderView(); toast('واحد حذف شد.');
      }
    }
  });

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.id) return;
    if (form.id === 'employee-form') {
      event.preventDefault();
      var f = new FormData(form), id = form.dataset.id;
      var existing = id ? employeeById(id) : null;
      var name = String(f.get('name') || '').trim();
      if (!name) { toast('نام و نام خانوادگی الزامی است.', true); return; }
      var code = String(f.get('code') || '').trim();
      if (code && state.employees.some(function (e) { return e.code === code && e.id !== id; })) {
        toast('این کد پرسنلی قبلاً ثبت شده است.', true); return;
      }
      var employee = {
        id: id || uid('emp'), name: name, code: code,
        department: String(f.get('department') || ''),
        role: String(f.get('role') || '').trim(),
        workPattern: String(f.get('workPattern') || 'shift'),
        notes: String(f.get('notes') || '').trim(),
        createdAt: existing ? existing.createdAt : new Date().toISOString()
      };
      if (existing) state.employees = state.employees.map(function (e) { return e.id === id ? employee : e; });
      else state.employees.push(employee);
      saveState(); closeModal(); renderView(); toast(existing ? 'اطلاعات پرسنل به‌روز شد.' : 'پرسنل ثبت شد.');
    } else if (form.id === 'entry-form') {
      event.preventDefault();
      var ef = new FormData(form), eid = form.dataset.id;
      var eDate = String(ef.get('date') || '');
      var eEnd = String(ef.get('endDate') || '');
      if (eEnd && eEnd < eDate) { toast('تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد.', true); return; }
      if (!employeeById(String(ef.get('employeeId') || ''))) { toast('یک پرسنل معتبر انتخاب کنید.', true); return; }
      var activity = {
        id: eid || uid('entry'),
        employeeId: String(ef.get('employeeId') || ''),
        typeId: String(ef.get('typeId') || ''),
        date: eDate,
        endDate: eEnd,
        startTime: String(ef.get('startTime') || ''),
        endTime: String(ef.get('endTime') || ''),
        location: String(ef.get('location') || '').trim(),
        origin: String(ef.get('origin') || '').trim(),
        destination: String(ef.get('destination') || '').trim(),
        km: String(ef.get('km') || ''),
        notes: String(ef.get('notes') || '').trim(),
        updatedAt: new Date().toISOString()
      };
      var existingEntry = state.entries.some(function (e) { return e.id === eid; });
      if (existingEntry) state.entries = state.entries.map(function (e) { return e.id === eid ? activity : e; });
      else state.entries.push(activity);
      selectedDate = activity.date;
      calendarAnchor = dateFromISO(activity.date);
      saveState(); closeModal(); renderView(); toast(existingEntry ? 'برنامه به‌روز شد.' : 'برنامه کاری ثبت شد.');
    } else if (form.id === 'department-form') {
      event.preventDefault();
      var name = String(new FormData(form).get('name') || '').trim();
      if (!name) return;
      if (state.departments.some(function (d) { return d.toLowerCase() === name.toLowerCase(); })) {
        toast('این واحد قبلاً تعریف شده است.', true); return;
      }
      state.departments.push(name); saveState(); renderView(); toast('واحد جدید افزوده شد.');
    } else if (form.id === 'department-edit-form') {
      event.preventDefault();
      var oldName = form.dataset.old;
      var newName = String(new FormData(form).get('name') || '').trim();
      if (!newName) return;
      if (state.departments.some(function (d) { return d.toLowerCase() === newName.toLowerCase() && d !== oldName; })) {
        toast('واحدی با این نام وجود دارد.', true); return;
      }
      state.departments = state.departments.map(function (d) { return d === oldName ? newName : d; });
      state.employees = state.employees.map(function (e) { if (e.department === oldName) e.department = newName; return e; });
      saveState(); closeModal(); renderView(); toast('واحد به‌روزرسانی شد.');
    } else if (form.id === 'type-form') {
      event.preventDefault();
      var tf = new FormData(form), tid = form.dataset.id;
      var label = String(tf.get('label') || '').trim();
      if (!label) return;
      if (state.types.some(function (t) { return t.label.toLowerCase() === label.toLowerCase() && t.id !== tid; })) {
        toast('نوع فعالیتی با این عنوان وجود دارد.', true); return;
      }
      var newType = { id: tid || uid('type'), label: label, color: String(tf.get('color') || 'cyan') };
      if (tid) state.types = state.types.map(function (t) { return t.id === tid ? newType : t; });
      else state.types.push(newType);
      saveState(); closeModal(); renderView(); toast(tid ? 'نوع فعالیت ویرایش شد.' : 'نوع فعالیت جدید افزوده شد.');
    }
  });

  document.addEventListener('input', function (event) {
    if (event.target && event.target.id === 'employee-search') {
      employeeSearch = event.target.value;
      var cursor = event.target.selectionStart;
      renderView();
      var input = document.getElementById('employee-search');
      if (input) { input.focus(); try { input.setSelectionRange(cursor, cursor); } catch (err) {} }
    }
  });
  document.getElementById('restore-input').addEventListener('change', function (event) {
    var file = event.target.files && event.target.files[0];
    restoreFile(file);
    event.target.value = '';
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeModal();
  });

  if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
  }
  renderView();
})();
/* ATLAS SHIFT — Persian annual calendar */
(function () {
  'use strict';

  var MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
  var WEEKDAYS = ['ش','ی','د','س','چ','پ','ج'];
  var calendarFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric' });
  var initialized = false;

  function parts(date) {
    var out = {};
    calendarFormatter.formatToParts(date).forEach(function (part) {
      if (part.type === 'year' || part.type === 'month' || part.type === 'day') out[part.type] = parseInt(part.value.replace(/\D/g, ''), 10);
    });
    return out;
  }

  function persianYear(date) { return parts(date).year; }

  function padPersian(value) { return String(value).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[Number(d)]; }); }

  function buildDays(year) {
    var groups = Array.from({ length: 12 }, function () { return []; });
    var start = new Date(new Date().getFullYear() - 1, 0, 1);
    var end = new Date(new Date().getFullYear() + 1, 11, 31);
    for (var date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      var p = parts(date);
      if (p.year === year && p.month >= 1 && p.month <= 12) groups[p.month - 1].push({ day: p.day, date: new Date(date), weekday: (date.getDay() + 1) % 7 });
    }
    return groups;
  }

  function monthHtml(monthIndex, days, todayParts) {
    var first = days[0];
    var blanks = first ? first.weekday : 0;
    var html = '<article class="annual-month"><div class="annual-month-title"><strong>' + MONTHS[monthIndex] + '</strong><span>' + padPersian(days.length) + ' روز</span></div>';
    html += '<div class="annual-weekdays">' + WEEKDAYS.map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div><div class="annual-days">';
    for (var i = 0; i < blanks; i++) html += '<span class="annual-day is-empty">0</span>';
    days.forEach(function (item) {
      var isToday = todayParts.year === todayParts.year && todayParts.month === monthIndex + 1 && todayParts.day === item.day && item.date.toDateString() === new Date().toDateString();
      html += '<span class="annual-day' + (isToday ? ' is-today' : '') + '">' + padPersian(item.day) + '</span>';
    });
    html += '</div></article>';
    return html;
  }

  function render() {
    var dashboard = document.querySelector('.dashboard-view');
    if (!dashboard || dashboard.querySelector('.annual-calendar')) return;
    var now = new Date();
    var year = persianYear(now);
    var today = parts(now);
    var groups = buildDays(year);
    var section = document.createElement('section');
    section.className = 'annual-calendar';
    section.setAttribute('aria-label', 'سالنامه شمسی');
    section.innerHTML = '<div class="annual-calendar-head"><div class="annual-calendar-title"><span class="annual-calendar-icon">▦</span><div><strong>سالنامه</strong><small>تقویم سال جاری شمسی</small></div></div><span class="annual-calendar-year">سال ' + padPersian(year) + '</span></div><div class="annual-calendar-grid">' + groups.map(function (days, index) { return monthHtml(index, days, today); }).join('') + '</div>';
    var intro = dashboard.querySelector('.dashboard-intro');
    var period = dashboard.querySelector('.period-bar');
    if (period) dashboard.insertBefore(section, period);
    else if (intro) intro.insertAdjacentElement('afterend', section);
  }

  function start() {
    if (initialized) return;
    initialized = true;
    render();
    var root = document.getElementById('view-root') || document.body;
    if (window.MutationObserver) new MutationObserver(render).observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

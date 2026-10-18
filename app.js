(function () {
  'use strict';

  var viewNames = {
    dashboard: 'داشبورد',
    employees: 'کارکنان',
    missions: 'مأموریت‌ها',
    leaves: 'مرخصی‌ها',
    vehicles: 'خودروها',
    gasmeters: 'گازسنج‌ها',
    notes: 'یادداشت‌ها',
    reports: 'گزارشات',
    settings: 'تنظیمات'
  };
  var storageKey = 'atlas-shift-dashboard-layout-v1';
  var periodNames = { daily: 'روزانه', weekly: 'هفتگی', monthly: 'ماهانه', halfyear: '۶ ماهه', yearly: 'سالانه' };
  var types = {
    employees: { name: 'کارکنان', icon: '♙', note: 'خلاصه اطلاعات کارکنان', value: '—' },
    missions: { name: 'مأموریت‌ها', icon: '↗', note: 'آمار مأموریت در بازه انتخابی', value: '—' },
    leaves: { name: 'مرخصی‌ها', icon: '◷', note: 'خلاصه مرخصی‌ها', value: '—' },
    vehicles: { name: 'خودروها', icon: '▰', note: 'خلاصه وضعیت ناوگان', value: '—' },
    notifications: { name: 'اعلان‌ها', icon: '♢', note: 'فضای نمایش اعلان‌ها', value: '' },
    chart: { name: 'نمودار آماری', icon: '⌁', note: 'نمای آماری در بازه انتخابی', value: '' },
    info: { name: 'پنجره اطلاعاتی', icon: '▤', note: 'خلاصه اطلاعات قابل نمایش', value: '' },
    gasmeters: { name: 'گازسنج‌ها', icon: '◉', note: 'خلاصه اطلاعات گازسنج‌ها', value: '—' }
  };
  var defaultWidgets = [
    { id: 'w-employees', type: 'employees', title: 'کارکنان', size: 'small', color: 'cyan' },
    { id: 'w-missions', type: 'missions', title: 'مأموریت‌ها', size: 'small', color: 'violet' },
    { id: 'w-leaves', type: 'leaves', title: 'مرخصی‌ها', size: 'small', color: 'orange' },
    { id: 'w-vehicles', type: 'vehicles', title: 'خودروها', size: 'small', color: 'green' },
    { id: 'w-notifications', type: 'notifications', title: 'اعلان‌ها', size: 'wide', color: 'pink' },
    { id: 'w-chart', type: 'chart', title: 'نمای آماری', size: 'wide', color: 'cyan' },
    { id: 'w-info', type: 'info', title: 'خلاصه اطلاعات', size: 'medium', color: 'violet' }
  ];
  var palette = { cyan: 'فیروزه‌ای', violet: 'بنفش', orange: 'نارنجی', green: 'سبز', pink: 'صورتی', blue: 'آبی' };
  var state = { period: 'daily', widgets: loadWidgets(), dragId: null, dragPointer: null };

  function loadWidgets() {
    try {
      var saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && Array.isArray(saved.widgets) && saved.widgets.length) {
        return saved.widgets.filter(function (w) { return w && types[w.type] && w.id; }).map(normalizeWidget);
      }
    } catch (e) {}
    return defaultWidgets.map(function (w) { return Object.assign({}, w); });
  }
  function normalizeWidget(w) {
    return { id: String(w.id), type: types[w.type] ? w.type : 'info', title: String(w.title || types[w.type].name), size: ['small', 'medium', 'wide'].indexOf(w.size) >= 0 ? w.size : 'medium', color: palette[w.color] ? w.color : 'cyan' };
  }
  function saveWidgets() {
    try { localStorage.setItem(storageKey, JSON.stringify({ widgets: state.widgets })); } catch (e) {}
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function setPage(name, subtitle) {
    document.querySelectorAll('.main-nav [data-view]').forEach(function (button) {
      var active = button.dataset.view === name;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    document.getElementById('page-title').textContent = viewNames[name];
    document.getElementById('page-subtitle').textContent = subtitle || '';
  }
  function selectOptions(options, selected) {
    return options.map(function (option) {
      return '<option value="' + escapeHtml(option.value) + '"' + (option.value === selected ? ' selected' : '') + '>' + escapeHtml(option.label) + '</option>';
    }).join('');
  }
  function renderWidget(w) {
    var type = types[w.type] || types.info;
    var sizeClass = 'widget-' + w.size;
    var html = '<article class="dash-window ' + sizeClass + ' tone-' + w.color + '" data-widget-id="' + escapeHtml(w.id) + '">';
    html += '<div class="dash-window-head"><span class="dash-icon">' + type.icon + '</span><span class="dash-window-label">' + escapeHtml(w.title) + '</span><span class="dash-window-tag">نمایشی</span><button class="drag-handle" type="button" data-drag-handle="' + escapeHtml(w.id) + '" aria-label="جابجایی پنجره ' + escapeHtml(w.title) + '" title="برای جابجایی بکشید">⠿</button></div>';
    if (w.type === 'notifications') {
      html += '<div class="notification-empty"><div class="notification-orbit"><span>♢</span></div><strong>فضای نمایش اعلان‌ها</strong><p>اعلان‌های برنامه در این پنجره نمایش داده می‌شوند.</p></div>';
    } else if (w.type === 'chart') {
      html += '<div class="chart-placeholder" aria-label="جایگاه نمودار آماری"><div class="chart-y-labels"><span>—</span><span>—</span><span>—</span><span>—</span></div><div class="chart-area"><div class="chart-grid-lines"><i></i><i></i><i></i><i></i></div><svg viewBox="0 0 620 150" preserveAspectRatio="none" role="img" aria-label="نمودار نمونه بدون داده واقعی"><defs><linearGradient id="fill-' + escapeHtml(w.id) + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--widget-accent)" stop-opacity=".24"/><stop offset="100%" stop-color="var(--widget-accent)" stop-opacity="0"/></linearGradient></defs><path d="M0,118 C55,108 65,76 120,88 S205,120 255,72 S335,86 385,54 S475,82 520,36 S585,52 620,20 L620,150 L0,150 Z" fill="url(#fill-' + escapeHtml(w.id) + ')"/><path d="M0,118 C55,108 65,76 120,88 S205,120 255,72 S335,86 385,54 S475,82 520,36 S585,52 620,20" fill="none" stroke="var(--widget-accent)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg><div class="chart-x-labels"><span>ابتدای بازه</span><span>میانه بازه</span><span>انتهای بازه</span></div></div></div><div class="chart-note">نمودار نمونه است؛ هنوز به داده واقعی متصل نشده.</div>';
    } else if (w.type === 'info') {
      html += '<div class="info-placeholder"><span class="info-placeholder-mark">✧</span><div><strong>پنجره اطلاعاتی</strong><p>محتوا در مرحله بعد به اطلاعات برنامه متصل می‌شود.</p></div></div><div class="info-lines"><i></i><i></i><i></i></div>';
    } else {
      html += '<div class="dash-stat-value">—</div><div class="dash-stat-foot">' + escapeHtml(type.note) + '</div><div class="dash-stat-decoration"></div>';
    }
    html += '</article>';
    return html;
  }
  function renderDashboard() {
    var root = document.getElementById('view-root');
    root.innerHTML = '<div class="dashboard-view">' +
      '<div class="dashboard-intro"><div><div class="section-kicker">نمای کلی · ATLAS SHIFT</div><h2>تصویر کلی عملیات</h2><p>پنجره‌های آماری و اطلاعاتی؛ بدون امکان تغییر داده‌ها از داشبورد</p></div><button type="button" class="dashboard-settings-link" data-open-dashboard-settings>⚙ تنظیم پنجره‌ها</button></div>' +
      '<section class="period-bar panel" aria-label="بازه زمانی داشبورد"><div class="period-label"><span class="period-calendar">▦</span><div><strong>بازه زمانی</strong><small id="period-caption">نمایش اطلاعات ' + periodNames[state.period] + '</small></div></div><div class="period-options" role="group" aria-label="انتخاب بازه زمانی">' +
      Object.keys(periodNames).map(function (key) { return '<button type="button" class="period-option' + (key === state.period ? ' active' : '') + '" data-period="' + key + '" aria-pressed="' + (key === state.period ? 'true' : 'false') + '">' + periodNames[key] + '</button>'; }).join('') +
      '</div></section><div class="dashboard-grid" id="dashboard-grid">' + state.widgets.map(renderWidget).join('') + '</div>' +
      '<div class="dashboard-footnote"><span class="footnote-dot"></span> این نسخه برای بررسی ظاهر است؛ اعداد نمونه و اتصال به داده‌های واقعی هنوز پیاده‌سازی نشده‌اند.</div></div>';
  }
  function renderSettings() {
    var root = document.getElementById('view-root');
    root.innerHTML = '<div class="settings-view"><div class="dashboard-intro"><div><div class="section-kicker">شخصی‌سازی</div><h2>تنظیمات داشبورد</h2><p>تعداد، محتوا، اندازه، رنگ و ترتیب پنجره‌ها را تغییر بده.</p></div><button type="button" class="button button-secondary" data-back-dashboard>← بازگشت به داشبورد</button></div>' +
      '<div class="settings-tab-strip"><span class="settings-tab active">تب داشبورد</span><span class="settings-hint">تنظیمات در همین دستگاه ذخیره می‌شوند.</span></div>' +
      '<div class="settings-toolbar"><div><strong>پنجره‌های داشبورد</strong><p>با دستگیره ⠿ یا دکمه‌های جابه‌جایی، ترتیب را تنظیم کن.</p></div><button type="button" class="button button-primary" data-add-widget>＋ افزودن پنجره</button></div>' +
      '<div class="widget-settings-list">' + state.widgets.map(renderWidgetSetting).join('') + '</div>' +
      '<div class="settings-bottom-actions"><button type="button" class="button button-secondary" data-reset-widgets>بازگرداندن چیدمان اولیه</button><span>تعداد پنجره‌ها: <strong>' + state.widgets.length + '</strong></span></div></div>';
  }
  function renderWidgetSetting(w, index) {
    var typeOptions = Object.keys(types).map(function (key) { return { value: key, label: types[key].name }; });
    var sizeOptions = [{ value: 'small', label: 'کوچک' }, { value: 'medium', label: 'متوسط' }, { value: 'wide', label: 'عریض' }];
    var colorOptions = Object.keys(palette).map(function (key) { return { value: key, label: palette[key] }; });
    return '<article class="widget-setting-card" data-setting-id="' + escapeHtml(w.id) + '">' +
      '<div class="widget-setting-top"><span class="widget-order">' + (index + 1) + '</span><span class="setting-color-dot tone-dot-' + w.color + '"></span><strong>' + escapeHtml(w.title) + '</strong><div class="setting-reorder"><button type="button" class="icon-button" data-move-widget="' + escapeHtml(w.id) + '" data-direction="-1" aria-label="انتقال به بالا" ' + (index === 0 ? 'disabled' : '') + '>↑</button><button type="button" class="icon-button" data-move-widget="' + escapeHtml(w.id) + '" data-direction="1" aria-label="انتقال به پایین" ' + (index === state.widgets.length - 1 ? 'disabled' : '') + '>↓</button><button type="button" class="icon-button danger" data-remove-widget="' + escapeHtml(w.id) + '" aria-label="حذف پنجره">×</button></div></div>' +
      '<div class="widget-setting-fields"><label>عنوان پنجره<input class="field-input" data-widget-field="title" data-widget-id="' + escapeHtml(w.id) + '" value="' + escapeHtml(w.title) + '" maxlength="48"></label>' +
      '<label>نوع و محتوا<select class="field-select" data-widget-field="type" data-widget-id="' + escapeHtml(w.id) + '">' + selectOptions(typeOptions, w.type) + '</select></label>' +
      '<label>اندازه پنجره<select class="field-select" data-widget-field="size" data-widget-id="' + escapeHtml(w.id) + '">' + selectOptions(sizeOptions, w.size) + '</select></label>' +
      '<label>رنگ پنجره<select class="field-select" data-widget-field="color" data-widget-id="' + escapeHtml(w.id) + '">' + selectOptions(colorOptions, w.color) + '</select></label></div>' +
      '<div class="setting-card-foot"><span>⠿ ترتیب پنجره</span><button type="button" class="text-link" data-preview-widget="' + escapeHtml(w.id) + '">مشاهده در داشبورد ←</button></div></article>';
  }
  function openView(name) {
    if (!Object.prototype.hasOwnProperty.call(viewNames, name)) return;
    if (name === 'dashboard') {
      setPage(name, 'نمایش آماری و اطلاعاتی');
      renderDashboard();
    } else if (name === 'settings') {
      setPage(name, 'تنظیم ظاهر و چیدمان پنجره‌های داشبورد');
      renderSettings();
    } else {
      setPage(name, '');
      document.getElementById('view-root').replaceChildren();
    }
  }
  function reorder(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    var from = state.widgets.findIndex(function (w) { return w.id === fromId; });
    var to = state.widgets.findIndex(function (w) { return w.id === toId; });
    if (from < 0 || to < 0) return;
    var moved = state.widgets.splice(from, 1)[0];
    state.widgets.splice(to, 0, moved);
    saveWidgets();
    if (document.getElementById('page-title').textContent === viewNames.settings) renderSettings();
    else renderDashboard();
  }
  function addWidget() {
    var id = 'w-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    state.widgets.push({ id: id, type: 'info', title: 'پنجره جدید', size: 'medium', color: 'blue' });
    saveWidgets();
    renderSettings();
  }
  function removeWidget(id) {
    if (state.widgets.length <= 1) {
      alert('حداقل یک پنجره باید در داشبورد باقی بماند.');
      return;
    }
    state.widgets = state.widgets.filter(function (w) { return w.id !== id; });
    saveWidgets();
    renderSettings();
  }
  function updateWidget(id, field, value) {
    var widget = state.widgets.find(function (w) { return w.id === id; });
    if (!widget || ['title', 'type', 'size', 'color'].indexOf(field) < 0) return;
    widget[field] = value;
    if (field === 'type' && (!widget.title || widget.title === types.info.name || Object.keys(types).some(function (key) { return types[key].name === widget.title; }))) widget.title = types[value].name;
    widget = normalizeWidget(widget);
    saveWidgets();
    var focusedId = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.widgetId : null;
    var selection = document.activeElement && typeof document.activeElement.selectionStart === 'number' ? document.activeElement.selectionStart : null;
    renderSettings();
    if (field === 'title' && focusedId === id) {
      var input = document.querySelector('[data-widget-id="' + id + '"][data-widget-field="title"]');
      if (input) { input.focus(); if (selection !== null) input.setSelectionRange(selection, selection); }
    }
  }

  document.addEventListener('click', function (event) {
    var nav = event.target.closest('.main-nav [data-view]');
    if (nav) { event.preventDefault(); openView(nav.dataset.view); return; }
    var period = event.target.closest('[data-period]');
    if (period) {
      state.period = period.dataset.period;
      document.querySelectorAll('[data-period]').forEach(function (button) {
        var active = button.dataset.period === state.period;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      var caption = document.getElementById('period-caption');
      if (caption) caption.textContent = 'نمایش اطلاعات ' + periodNames[state.period];
      return;
    }
    if (event.target.closest('[data-open-dashboard-settings]')) { openView('settings'); return; }
    if (event.target.closest('[data-back-dashboard]')) { openView('dashboard'); return; }
    if (event.target.closest('[data-add-widget]')) { addWidget(); return; }
    if (event.target.closest('[data-reset-widgets]')) {
      state.widgets = defaultWidgets.map(function (w) { return Object.assign({}, w); });
      saveWidgets();
      renderSettings();
      return;
    }
    var remove = event.target.closest('[data-remove-widget]');
    if (remove) { removeWidget(remove.dataset.removeWidget); return; }
    var move = event.target.closest('[data-move-widget]');
    if (move) {
      var id = move.dataset.moveWidget;
      var index = state.widgets.findIndex(function (w) { return w.id === id; });
      var target = index + Number(move.dataset.direction);
      if (target >= 0 && target < state.widgets.length) reorder(id, state.widgets[target].id);
      return;
    }
    var preview = event.target.closest('[data-preview-widget]');
    if (preview) { openView('dashboard'); return; }
  });

  document.addEventListener('change', function (event) {
    var field = event.target.closest('[data-widget-field]');
    if (field && field.tagName !== 'INPUT') updateWidget(field.dataset.widgetId, field.dataset.widgetField, field.value);
  });
  document.addEventListener('input', function (event) {
    var field = event.target.closest('[data-widget-field="title"]');
    if (field) {
      var widget = state.widgets.find(function (w) { return w.id === field.dataset.widgetId; });
      if (widget) { widget.title = field.value; saveWidgets(); }
      var heading = document.querySelector('[data-setting-id="' + field.dataset.widgetId + '"] .widget-setting-top strong');
      if (heading) heading.textContent = field.value || 'بدون عنوان';
    }
  });
  document.addEventListener('focusout', function (event) {
    var field = event.target.closest('[data-widget-field="title"]');
    if (field) updateWidget(field.dataset.widgetId, 'title', field.value.trim() || 'پنجره بدون عنوان');
  });

  var drag = null;
  document.addEventListener('pointerdown', function (event) {
    var handle = event.target.closest('[data-drag-handle]');
    if (!handle || event.button !== 0) return;
    var card = handle.closest('[data-widget-id]');
    if (!card) return;
    drag = { id: handle.dataset.dragHandle, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false };
    state.dragPointer = event.pointerId;
  });
  document.addEventListener('pointermove', function (event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 7) {
      drag.active = true;
      document.body.classList.add('is-dragging-widget');
      var card = document.querySelector('[data-widget-id="' + drag.id + '"]');
      if (card) card.classList.add('dragging');
    }
    if (!drag.active) return;
    var cards = Array.from(document.querySelectorAll('#dashboard-grid [data-widget-id]')).filter(function (card) { return card.dataset.widgetId !== drag.id; });
    var target = cards.find(function (card) {
      var rect = card.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    cards.forEach(function (card) { card.classList.toggle('drop-target', !!target && card === target); });
    if (target) drag.targetId = target.dataset.widgetId;
  });
  document.addEventListener('pointerup', function (event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    var fromId = drag.id;
    var toId = drag.targetId;
    var wasActive = drag.active;
    drag = null;
    state.dragPointer = null;
    document.body.classList.remove('is-dragging-widget');
    document.querySelectorAll('.dragging,.drop-target').forEach(function (el) { el.classList.remove('dragging', 'drop-target'); });
    if (wasActive && toId) reorder(fromId, toId);
  });
  document.addEventListener('pointercancel', function () {
    drag = null;
    state.dragPointer = null;
    document.body.classList.remove('is-dragging-widget');
    document.querySelectorAll('.dragging,.drop-target').forEach(function (el) { el.classList.remove('dragging', 'drop-target'); });
  });

  openView('dashboard');
})();
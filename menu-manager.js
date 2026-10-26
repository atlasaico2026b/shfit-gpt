(() => {
  'use strict';

  const STORAGE_KEY = 'atlasShiftMainMenuConfigV1';
  const DEFAULTS = [
    { id: 'dashboard', title: 'داشبورد', icon: '⌂', href: './index.html', fixed: true },
    { id: 'employees', title: 'کارکنان', icon: '♙', href: './index.html?view=employees' },
    { id: 'missions', title: 'مأموریت‌ها', icon: '↗', href: './index.html?view=missions' },
    { id: 'leaves', title: 'مرخصی‌ها', icon: '◷', href: './index.html?view=leaves' },
    { id: 'vehicles', title: 'خودروها', icon: '▰', href: './index.html?view=vehicles' },
    { id: 'gasmeters', title: 'گازسنج‌ها', icon: '◉', href: './index.html?view=gasmeters' },
    { id: 'notes', title: 'یادداشت‌ها', icon: '▤', href: './index.html?view=notes' },
    { id: 'programs', title: 'برنامه‌ها و پرونده‌ها', icon: '✓', href: './index.html?view=programs' },
    { id: 'phonebook', title: 'دفترچه تلفن', icon: '☎', href: './index.html?view=phonebook' },
    { id: 'reports', title: 'گزارشات', icon: '▥', href: './index.html?view=reports' },
    { id: 'settings', title: 'تنظیمات', icon: '⚙', href: './index.html?view=settings', fixed: true }
  ];
  const TARGETS = {
    dashboard: './index.html', employees: './index.html?view=employees',
    missions: './index.html?view=missions', leaves: './index.html?view=leaves',
    vehicles: './index.html?view=vehicles', gasmeters: './index.html?view=gasmeters',
    notes: './index.html?view=notes', programs: './index.html?view=programs',
    phonebook: './index.html?view=phonebook', reports: './index.html?view=reports'
  };
  const ICONS = Object.fromEntries(DEFAULTS.map(item => [item.id, item.icon]));
  const ICON_SVG = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
    employees: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><path d="M17 3.5a4 4 0 0 1 0 7.5"/><path d="M19 15h1a3 3 0 0 1 3 3v3"/>',
    missions: '<path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z"/><path d="M8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2"/><path d="M9 12h6M9 16h4"/>',
    leaves: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M12 14v3h2"/>',
    vehicles: '<path d="M4 13l1.8-5.2A2 2 0 0 1 7.7 6.5h8.6a2 2 0 0 1 1.9 1.3L20 13"/><path d="M3 13h18v5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5Z"/><circle cx="7.5" cy="15.5" r="1"/><circle cx="16.5" cy="15.5" r="1"/>',
    gasmeters: '<circle cx="12" cy="12" r="9"/><path d="M12 12l4-3"/><path d="M12 3v2M21 12h-2M12 21v-2M3 12h2"/>',
    notes: '<path d="M5 4h11l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><path d="M15 4v5h5"/><path d="M8 13h8M8 17h5"/>',
    programs: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m8 12 2.5 2.5L16 9"/>',
    phonebook: '<path d="M6 3h3l2 5-2.5 1.5a12 12 0 0 0 6 6L16 13l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z"/>',
    reports: '<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7" y="12" width="3" height="5" rx="1"/><rect x="12" y="8" width="3" height="9" rx="1"/><rect x="17" y="5" width="3" height="12" rx="1"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z"/>'
  };
  const ACCENTS = {
    dashboard: 'cyan', employees: 'violet', missions: 'amber', leaves: 'emerald',
    vehicles: 'sky', gasmeters: 'rose', notes: 'teal', programs: 'indigo',
    phonebook: 'orange', reports: 'gold', settings: 'slate'
  };
  const FALLBACK_SVG = '<circle cx="12" cy="12" r="7"/><path d="M12 8v8M8 12h8"/>';
  let config = load();

  function load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (_) {}
    const hidden = Array.isArray(saved.hidden) ? saved.hidden.filter(id => typeof id === 'string') : [];
    const labels = saved.labels && typeof saved.labels === 'object' ? saved.labels : {};
    const custom = Array.isArray(saved.custom) ? saved.custom.filter(item =>
      item && typeof item.id === 'string' && typeof item.title === 'string' && TARGETS[item.target]
    ) : [];
    const savedOrder = Array.isArray(saved.order) ? saved.order.filter(id => typeof id === 'string') : [];
    const defaultOrder = DEFAULTS.map(item => item.id);
    const order = [...defaultOrder.filter(id => savedOrder.includes(id)), ...defaultOrder.filter(id => !savedOrder.includes(id)), ...savedOrder.filter(id => !defaultOrder.includes(id))];
    return { hidden: hidden.filter(id => !['dashboard', 'settings'].includes(id)), labels, custom, order };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      return true;
    } catch (_) {
      status('ذخیره‌سازی انجام نشد؛ فضای ذخیره‌سازی مرورگر را بررسی کنید.');
      return false;
    }
  }

  function status(message) {
    const el = document.getElementById('mainMenuStatus');
    if (el) el.textContent = message || '';
  }

  function allItems() {
    const items = DEFAULTS.map(item => ({
      ...item,
      title: String(config.labels[item.id] || item.title),
      hidden: config.hidden.includes(item.id),
      custom: false
    }));
    config.custom.forEach(item => items.push({
      id: item.id, title: item.title, icon: '＋', href: TARGETS[item.target],
      hidden: false, custom: true, target: item.target
    }));
    const rank = new Map(config.order.map((id, index) => [id, index]));
    return items.sort((a, b) => {
      const ar = rank.has(a.id) ? rank.get(a.id) : 1000 + DEFAULTS.findIndex(x => x.id === a.id);
      const br = rank.has(b.id) ? rank.get(b.id) : 1000 + DEFAULTS.findIndex(x => x.id === b.id);
      return ar - br;
    });
  }

  function renderNav(items) {
    const nav = document.querySelector('.app-menu-nav');
    if (!nav) return;
    const fragment = document.createDocumentFragment();
    const currentView = (new URLSearchParams(location.search).get('view') || 'dashboard').trim() || 'dashboard';
    items.filter(item => !item.hidden).forEach(item => {
      const a = document.createElement('a');
      const active = (item.target || item.id) === currentView || (currentView === 'dashboard' && item.id === 'dashboard');
      a.className = 'app-menu-item' + (active ? ' active' : '');
      a.href = item.href;
      a.dataset.menuId = item.id;
      a.dataset.accent = ACCENTS[item.id] || ACCENTS[item.target] || 'slate';
      if (active) a.setAttribute('aria-current', 'page');
      const icon = document.createElement('span');
      icon.className = 'app-menu-icon';
      icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICON_SVG[item.id] || ICON_SVG[item.target] || FALLBACK_SVG) + '</svg>';
      a.append(icon, document.createTextNode(item.title));
      fragment.appendChild(a);
    });
    nav.replaceChildren(fragment);
  }

  function button(text, action, disabled = false) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.dataset.menuAction = action;
    b.disabled = disabled;
    b.style.cssText = 'padding:6px 9px;border-radius:8px;border:1px solid rgba(140,210,255,.25);background:rgba(80,150,210,.1);color:inherit;font:inherit;font-size:12px;cursor:pointer';
    return b;
  }

  function renderManager() {
    const list = document.getElementById('mainMenuList');
    if (!list) return;
    const items = allItems();
    list.replaceChildren();
    items.forEach((item, index) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:9px;border:1px solid rgba(140,210,255,.18);border-radius:10px;background:rgba(80,140,200,.05)';
      const main = document.createElement('div');
      main.style.cssText = 'display:grid;gap:6px;min-width:0';
      const label = document.createElement('label');
      label.textContent = item.custom ? 'عنوان منوی سفارشی' : 'عنوان منو';
      label.style.cssText = 'font-size:11px;color:var(--muted)';
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 40;
      input.value = item.title;
      input.dataset.menuLabel = item.id;
      input.setAttribute('aria-label', 'عنوان منو: ' + item.title);
      input.style.cssText = 'width:100%;box-sizing:border-box;padding:8px;border-radius:8px;background:rgba(0,0,0,.16);color:inherit;border:1px solid rgba(140,210,255,.2);font:inherit';
      label.appendChild(input);
      main.appendChild(label);
      const controls = document.createElement('div');
      controls.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;align-items:center';
      controls.appendChild(button('↑', 'up:' + item.id, index === 0 || item.id === 'dashboard'));
      controls.appendChild(button('↓', 'down:' + item.id, index === items.length - 1 || item.id === 'settings'));
      if (item.custom) controls.appendChild(button('حذف', 'delete:' + item.id));
      else {
        const visible = document.createElement('label');
        visible.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:11px;white-space:nowrap';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = !item.hidden;
        check.disabled = !!item.fixed;
        check.dataset.menuVisible = item.id;
        visible.append(check, document.createTextNode('نمایش'));
        controls.appendChild(visible);
      }
      row.append(main, controls);
      list.appendChild(row);
    });
  }

  function render() {
    const items = allItems();
    renderNav(items);
    renderManager();
  }

  function bind() {
    const add = document.getElementById('addMainMenu');
    if (add && add.dataset.bound !== '1') {
      add.dataset.bound = '1';
      add.addEventListener('click', () => {
        const titleField = document.getElementById('newMenuTitle');
        const targetField = document.getElementById('newMenuTarget');
        const title = titleField.value.trim();
        const target = targetField.value;
        if (!title) { status('ابتدا عنوان منو را وارد کنید.'); titleField.focus(); return; }
        const id = 'custom-' + Date.now().toString(36);
        config.custom.push({ id, title, target });
        config.order.push(id);
        if (!save()) { config.custom = config.custom.filter(item => item.id !== id); return; }
        titleField.value = '';
        render();
        status('منو اضافه شد. برای استفاده، آن را از نوار منو باز کنید.');
      });
    }

    const list = document.getElementById('mainMenuList');
    if (list && list.dataset.bound !== '1') {
      list.dataset.bound = '1';
      list.addEventListener('change', event => {
        const check = event.target.closest('[data-menu-visible]');
        const label = event.target.closest('[data-menu-label]');
        if (check) {
          const id = check.dataset.menuVisible;
          config.hidden = check.checked ? config.hidden.filter(value => value !== id) : [...new Set([...config.hidden, id])];
          if (save()) { render(); status('وضعیت نمایش منو ذخیره شد.'); }
        } else if (label) {
          const id = label.dataset.menuLabel;
          const value = label.value.trim();
          if (!value) { status('عنوان منو نمی‌تواند خالی باشد.'); renderManager(); return; }
          if (config.custom.some(item => item.id === id)) {
            config.custom = config.custom.map(item => item.id === id ? { ...item, title: value } : item);
          } else config.labels[id] = value;
          if (save()) { renderNav(allItems()); status('عنوان منو ذخیره شد.'); }
        }
      });
      list.addEventListener('click', event => {
        const b = event.target.closest('[data-menu-action]');
        if (!b || b.disabled) return;
        const [action, id] = b.dataset.menuAction.split(':');
        const items = allItems();
        const index = items.findIndex(item => item.id === id);
        if (index < 0) return;
        if (action === 'delete') {
          const item = config.custom.find(entry => entry.id === id);
          if (!item || !confirm('این میان‌بر منو حذف شود؟ اطلاعات صفحهٔ مقصد حذف نمی‌شود.')) return;
          config.custom = config.custom.filter(entry => entry.id !== id);
          config.order = config.order.filter(value => value !== id);
          if (save()) { render(); status('میان‌بر حذف شد؛ اطلاعات بخش مقصد دست‌نخورده باقی ماند.'); }
          return;
        }
        const next = action === 'up' ? index - 1 : index + 1;
        if (next < 0 || next >= items.length) return;
        if (items[index].id === 'dashboard' || items[next].id === 'dashboard' || items[index].id === 'settings' || items[next].id === 'settings') return;
        [items[index], items[next]] = [items[next], items[index]];
        config.order = items.map(item => item.id);
        if (save()) { render(); status('ترتیب منوها ذخیره شد.'); }
      });
    }
  }

  function init() {
    if (!document.querySelector('.app-menu-nav') || !document.getElementById('mainMenuList')) return;
    bind();
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
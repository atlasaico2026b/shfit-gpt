(() => {
  'use strict';

  const ORDER_KEY = 'atlasShiftSettingsTabOrderV1';

  function readOrder() {
    try {
      const saved = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
      return Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : [];
    } catch (_) { return []; }
  }

  function saveOrder(tabs) {
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(tabs.map(tab => tab.id)));
      return true;
    } catch (_) { return false; }
  }

  // ترتیب ذخیره‌شده روی تب‌ها اعمال می‌شود؛ تب تازه‌ای که در فهرست نیست ته می‌نشیند.
  function applySavedOrder(tablist, tabs) {
    const order = readOrder();
    if (!order.length) return;
    const byId = new Map(tabs.map(tab => [tab.id, tab]));
    const seen = new Set();
    order.forEach(id => {
      const tab = byId.get(id);
      if (!tab || seen.has(id)) return;
      seen.add(id);
      tablist.appendChild(tab);
    });
    tabs.forEach(tab => { if (!seen.has(tab.id)) tablist.appendChild(tab); });
  }

  function initSettingsTabs() {
    const panel = document.getElementById('settingsPanel');
    if (!panel) return false;

    const tablist = panel.querySelector('.settings-tabs');
    const tabs = [...panel.querySelectorAll('.settings-tabs [role="tab"]')];
    const panes = [...panel.querySelectorAll('.settings-tab-pane[role="tabpanel"]')];
    if (tabs.length !== 4 || panes.length !== 4 || !tablist) return false;

    applySavedOrder(tablist, tabs);

    // تب فعال بر اساس شناسهٔ خودش پیدا می‌شود تا جابه‌جایی ترتیب چیزی را نشکند.
    function activate(tab, moveFocus = false) {
      if (!tab) return;
      tabs.forEach(item => {
        const active = item === tab;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', String(active));
        item.tabIndex = active ? 0 : -1;
      });
      // هر پنل با aria-labelledby به تب خودش وصل است؛ تطبیق بر اساس ترتیب DOM
      // اشتباه بود، چون ترتیب تب‌ها و پنل‌ها در index.html یکی نیست.
      panes.forEach(pane => { pane.hidden = pane.getAttribute('aria-labelledby') !== tab.id; });
      if (moveFocus) tab.focus();
    }

    function currentTabs() {
      return [...tablist.querySelectorAll('[role="tab"]')];
    }

    tabs.forEach(tab => {
      if (tab.dataset.settingsTabBound === '1') return;
      tab.dataset.settingsTabBound = '1';
      tab.addEventListener('click', () => activate(tab));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const list = currentTabs();
        const index = list.indexOf(tab);
        if (index < 0) return;
        let next = index;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = list.length - 1;
        else next = (index + (event.key === 'ArrowLeft' ? 1 : -1) + list.length) % list.length;
        activate(list[next], true);
      });
    });

    if (window.AtlasDragReorder) {
      window.AtlasDragReorder.attach(tablist, {
        itemSelector: '[role="tab"]',
        injectHandle: true,
        touchMode: 'handle',
        onReorder: list => saveOrder([...list.querySelectorAll('[role="tab"]')])
      });
    }

    const activeIndex = Math.max(0, tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true'));
    activate(tabs[activeIndex]);
    return true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettingsTabs, { once: true });
  } else {
    initSettingsTabs();
  }
})();

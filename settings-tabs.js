(() => {
  'use strict';

  function initSettingsTabs() {
    const panel = document.getElementById('settingsPanel');
    if (!panel) return false;

    // تب‌ها با درگ جابه‌جا می‌شوند، پس هیچ‌جا ایندکسِ زمانِ اتصال را ذخیره
    // نمی‌کنیم؛ همیشه ترتیب فعلی DOM خوانده می‌شود.
    const currentTabs = () => [...panel.querySelectorAll('.settings-tabs [role="tab"]')];
    const panes = [...panel.querySelectorAll('.settings-tab-pane[role="tabpanel"]')];
    if (currentTabs().length !== 4 || panes.length !== 4) return false;

    function activate(index, moveFocus = false) {
      const tabs = currentTabs();
      tabs.forEach((tab, i) => {
        const active = i === index;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      // هر پنل با aria-labelledby به تب خودش وصل است؛ تطبیق بر اساس ترتیب DOM
      // اشتباه بود، چون ترتیب تب‌ها و پنل‌ها در index.html یکی نیست.
      const activeId = tabs[index] ? tabs[index].id : '';
      panes.forEach(pane => { pane.hidden = pane.getAttribute('aria-labelledby') !== activeId; });
      if (moveFocus && tabs[index]) tabs[index].focus();
    }

    currentTabs().forEach(tab => {
      if (tab.dataset.settingsTabBound === '1') return;
      tab.dataset.settingsTabBound = '1';
      tab.addEventListener('click', () => activate(currentTabs().indexOf(tab)));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const tabs = currentTabs();
        const index = tabs.indexOf(tab);
        let next = index;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else next = (index + (event.key === 'ArrowLeft' ? 1 : -1) + tabs.length) % tabs.length;
        activate(next, true);
      });
    });

    const activeIndex = Math.max(0, currentTabs().findIndex(tab => tab.getAttribute('aria-selected') === 'true'));
    activate(activeIndex);
    return true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettingsTabs, { once: true });
  } else {
    initSettingsTabs();
  }
})();
(() => {
  'use strict';

  function initSettingsTabs() {
    const panel = document.getElementById('settingsPanel');
    if (!panel) return false;

    const tabs = [...panel.querySelectorAll('.settings-tabs [role="tab"]')];
    const panes = [...panel.querySelectorAll('.settings-tab-pane[role="tabpanel"]')];
    if (tabs.length !== 4 || panes.length !== 4) return false;

    function activate(index, moveFocus = false) {
      tabs.forEach((tab, i) => {
        const active = i === index;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      panes.forEach((pane, i) => { pane.hidden = i !== index; });
      if (moveFocus) tabs[index].focus();
    }

    tabs.forEach((tab, index) => {
      if (tab.dataset.settingsTabBound === '1') return;
      tab.dataset.settingsTabBound = '1';
      tab.addEventListener('click', () => activate(index));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        let next = index;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else next = (index + (event.key === 'ArrowLeft' ? 1 : -1) + tabs.length) % tabs.length;
        activate(next, true);
      });
    });

    const activeIndex = Math.max(0, tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true'));
    activate(activeIndex);
    return true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettingsTabs, { once: true });
  } else {
    initSettingsTabs();
  }
})();
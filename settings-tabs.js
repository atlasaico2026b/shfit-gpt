(() => {
  'use strict';

  function initSettingsTabs() {
    const panel = document.getElementById('settingsPanel');
    if (!panel) return false;
    if (panel.dataset.tabsReady === '1' && panel.querySelector('.settings-tabs')) return true;

    // Recover cleanly if an earlier initialization left partial markup behind.
    panel.querySelectorAll(':scope > .settings-tabs, :scope > .settings-tab-pane').forEach(node => node.remove());
    const sections = [...panel.querySelectorAll(':scope > .settings-section')];
    if (!sections.length) return false;

    const normalize = value => (value || '').normalize('NFKC').replace(/[\u064b-\u065f\u0670]/g, '').replace(/\s+/g, ' ').trim();
    const heading = section => normalize(section.querySelector('h4')?.textContent || '');
    const phonebook = sections.find(section => section.id === 'phonebookSettingsGroup');
    const dashboard = sections.filter(section => heading(section).includes('چیدمان پنجره ها'));
    const appearance = sections.filter(section =>
      section !== phonebook && !dashboard.includes(section) &&
      (heading(section).includes('پوسته برنامه') || heading(section).includes('پس زمینه ابروبادی'))
    );
    // Keep every remaining settings section accessible instead of accidentally orphaning it.
    const assigned = new Set([...dashboard, ...appearance, ...(phonebook ? [phonebook] : [])]);
    const otherSections = sections.filter(section => !assigned.has(section));
    appearance.push(...otherSections);

    const groups = [
      { id: 'settings-dashboard-tab', label: 'داشبورد', items: dashboard },
      { id: 'settings-appearance-tab', label: 'ظاهر برنامه', items: appearance },
      { id: 'settings-phonebook-tab', label: 'دفترچه تلفن', items: phonebook ? [phonebook] : [] }
    ];

    if (!document.getElementById('atlasSettingsTabsStyle')) {
      const style = document.createElement('style');
      style.id = 'atlasSettingsTabsStyle';
      style.textContent = [
        '#settingsPanel .settings-tabs{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:0 0 10px;padding:4px;border:1px solid rgba(140,210,255,.2);border-radius:13px;background:rgba(80,150,210,.08);position:relative;z-index:2}',
        '#settingsPanel .settings-tab{display:block!important;min-width:0;border:0;border-radius:9px;padding:10px 4px;background:transparent;color:var(--muted);font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}',
        '#settingsPanel .settings-tab[aria-selected="true"]{color:var(--text);background:rgba(80,180,255,.18);box-shadow:inset 0 0 0 1px rgba(120,210,255,.28)}',
        '#settingsPanel .settings-tab-pane[hidden]{display:none!important}',
        '#settingsPanel .settings-tab-pane{display:block;min-width:0}',
        '#settingsPanel .settings-tab-pane > .settings-section:first-child{border-top:0;padding-top:4px}'
      ].join('');
      document.head.appendChild(style);
    }

    const tabbar = document.createElement('div');
    tabbar.className = 'settings-tabs';
    tabbar.setAttribute('role', 'tablist');
    tabbar.setAttribute('aria-label', 'بخش های تنظیمات');
    const panes = [];

    groups.forEach((group, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'settings-tab';
      button.id = group.id;
      button.textContent = group.label;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(index === 0));
      button.setAttribute('aria-controls', group.id + '-panel');

      const pane = document.createElement('div');
      pane.className = 'settings-tab-pane';
      pane.id = group.id + '-panel';
      pane.setAttribute('role', 'tabpanel');
      pane.setAttribute('aria-labelledby', group.id);
      pane.hidden = index !== 0;

      group.items.forEach(section => pane.appendChild(section));
      button.addEventListener('click', () => {
        groups.forEach((item, itemIndex) => {
          const active = itemIndex === index;
          const tab = tabbar.querySelectorAll('[role="tab"]')[itemIndex];
          tab.setAttribute('aria-selected', String(itemIndex === groups.indexOf(group)));
        });
        panes.forEach(otherPane => { otherPane.hidden = otherPane !== pane; });
      });
      tabbar.appendChild(button);
      panes.push(pane);
    });

    const header = panel.querySelector('.settings-head');
    if (header) header.insertAdjacentElement('afterend', tabbar);
    else panel.insertBefore(tabbar, panel.firstChild);
    panes.forEach(pane => panel.appendChild(pane));
    panel.dataset.tabsReady = '1';
    return true;
  }

  function start() {
    if (initSettingsTabs()) return;
    // The app can finish building the settings panel after this file executes.
    let attempts = 0;
    const retry = () => {
      if (initSettingsTabs() || ++attempts >= 20) return;
      setTimeout(retry, 150);
    };
    retry();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
  window.addEventListener('atlas-shift-settings-ready', start);
})();

(()=> {
  function initSettingsTabs() {
    const panel = document.querySelector('#settingsPanel');
    if (!panel) return;

    const existing = panel.querySelector(':scope > .settings-tabs');
    const sections = [...panel.querySelectorAll(':scope > .settings-section')];
    if (!sections.length) return;

    // If the script runs again after route changes, do not move the sections twice.
    if (existing && panel.dataset.tabsReady === '1') return;

    const byId = id => sections.find(section => section.id === id);
    const appearance = sections.filter(section =>
      section.querySelector('h4') && /پوستهٔ برنامه|پوسته برنامه|پس‌زمینهٔ ابروبادی|پس‌زمینه ابروبادی/.test(section.textContent)
    );
    const dashboard = sections.filter(section =>
      section.querySelector('h4') && /چیدمان پنجره‌ها/.test(section.textContent)
    );
    const phonebook = byId('phonebookSettingsGroup');
    const groups = [
      { id: 'settings-dashboard-tab', label: 'داشبورد', items: dashboard },
      { id: 'settings-appearance-tab', label: 'ظاهر برنامه', items: appearance },
      { id: 'settings-phonebook-tab', label: 'دفترچه تلفن', items: phonebook ? [phonebook] : [] }
    ];

    if (!document.getElementById('atlasSettingsTabsStyle')) {
      const style = document.createElement('style');
      style.id = 'atlasSettingsTabsStyle';
      style.textContent = '.settings-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:0 0 12px;padding:5px;border:1px solid rgba(140,210,255,.16);border-radius:14px;background:rgba(0,0,0,.12);position:sticky;top:0;z-index:5;backdrop-filter:blur(12px)}.settings-tab{border:0;border-radius:10px;padding:9px 8px;background:transparent;color:var(--muted);font:inherit;font-weight:700;cursor:pointer}.settings-tab[aria-selected="true"]{color:var(--text);background:rgba(80,180,255,.14);box-shadow:inset 0 0 0 1px rgba(120,210,255,.2)}.settings-tab-pane[hidden]{display:none!important}.settings-tab-pane{min-width:0}';
      document.head.appendChild(style);
    }

    const tabbar = document.createElement('div');
    tabbar.className = 'settings-tabs';
    tabbar.setAttribute('role', 'tablist');
    tabbar.setAttribute('aria-label', 'بخش‌های تنظیمات');
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
      pane.dataset.settingsPane = group.id;
      pane.setAttribute('role', 'tabpanel');
      pane.setAttribute('aria-labelledby', group.id);
      pane.hidden = index !== 0;

      group.items.forEach(section => pane.appendChild(section));
      button.addEventListener('click', () => {
        tabbar.querySelectorAll('.settings-tab').forEach(tab =>
          tab.setAttribute('aria-selected', String(tab === button))
        );
        panes.forEach(otherPane => { otherPane.hidden = otherPane !== pane; });
      });
      tabbar.appendChild(button);
      panes.push(pane);
    });

    // Put the tab bar immediately below the settings header, not at the panel's end.
    const header = panel.querySelector('.settings-head');
    if (header && header.nextSibling) panel.insertBefore(tabbar, header.nextSibling);
    else panel.appendChild(tabbar);
    panes.forEach(pane => panel.appendChild(pane));
    panel.dataset.tabsReady = '1';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettingsTabs, { once: true });
  } else {
    initSettingsTabs();
  }
  window.addEventListener('atlas-shift-settings-ready', initSettingsTabs);
})();
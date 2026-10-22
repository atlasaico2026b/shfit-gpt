(() => {
  'use strict';

  const NORMALIZE = value => String(value || '')
    .normalize('NFKC')
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[\u200c\u200d]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function initSettingsTabs() {
    const panel = document.getElementById('settingsPanel');
    if (!panel) return false;
    if (panel.dataset.tabsReady === '1' && panel.querySelector(':scope > .settings-tabs')) return true;

    // Recover sections from old/partial panes BEFORE removing those panes.
    const sections = [...panel.querySelectorAll('.settings-section')];
    if (!sections.length) return false;
    sections.forEach(section => panel.appendChild(section));
    panel.querySelectorAll(':scope > .settings-tabs, :scope > .settings-tab-pane').forEach(node => node.remove());
    delete panel.dataset.tabsReady;

    const heading = section => NORMALIZE(section.querySelector('h4')?.textContent || '');
    const dashboardSections = sections.filter(section => heading(section).includes('چیدمان پنجره ها'));
    const phonebookSection = sections.find(section => section.id === 'phonebookSettingsGroup');
    const appearanceSections = sections.filter(section =>
      !dashboardSections.includes(section) && section !== phonebookSection
    );

    const groups = [
      { id: 'settings-dashboard-tab', label: 'داشبورد', items: dashboardSections },
      { id: 'settings-appearance-tab', label: 'ظاهر برنامه', items: appearanceSections },
      { id: 'settings-phonebook-tab', label: 'دفترچه تلفن', items: phonebookSection ? [phonebookSection] : [] }
    ];

    let style = document.getElementById('atlasSettingsTabsStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = 'atlasSettingsTabsStyle';
      document.head.appendChild(style);
    }
    style.textContent = [
      '#settingsPanel .settings-tabs{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:0 0 12px;padding:4px;border:1px solid rgba(100,160,220,.25);border-radius:14px;background:rgba(80,150,210,.09);position:relative;z-index:3;direction:rtl}',
      '#settingsPanel .settings-tab{display:block!important;width:100%;min-width:0;border:1px solid transparent;border-radius:10px;padding:11px 3px;background:transparent;color:var(--muted);font:inherit;font-size:12px;font-weight:700;line-height:1.5;cursor:pointer;white-space:normal}',
      '#settingsPanel .settings-tab[aria-selected="true"]{color:var(--text);background:rgba(80,180,255,.2);border-color:rgba(100,190,255,.35);box-shadow:0 3px 12px rgba(40,130,210,.12)}',
      '#settingsPanel .settings-tab:focus-visible{outline:2px solid var(--accent2);outline-offset:2px}',
      '#settingsPanel .settings-tab-pane[hidden]{display:none!important}',
      '#settingsPanel .settings-tab-pane{display:block;min-width:0}',
      '#settingsPanel .settings-tab-pane>.settings-section:first-child{border-top:0;padding-top:4px}',
      '#settingsPanel .settings-tab-pane:empty:after{content:"هنوز تنظیمی در این بخش تعریف نشده است.";display:block;padding:18px 8px;color:var(--muted);font-size:12px;text-align:center}'
    ].join('');

    const tabbar = document.createElement('div');
    tabbar.className = 'settings-tabs';
    tabbar.setAttribute('role', 'tablist');
    tabbar.setAttribute('aria-label', 'بخش‌های تنظیمات');

    const panes = [];
    const buttons = [];

    groups.forEach((group, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'settings-tab';
      button.id = group.id;
      button.textContent = group.label;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(index === 0));
      button.setAttribute('aria-controls', group.id + '-panel');
      button.tabIndex = index === 0 ? 0 : -1;

      const pane = document.createElement('div');
      pane.className = 'settings-tab-pane';
      pane.id = group.id + '-panel';
      pane.setAttribute('role', 'tabpanel');
      pane.setAttribute('aria-labelledby', group.id);
      pane.hidden = index !== 0;
      group.items.forEach(section => pane.appendChild(section));

      button.addEventListener('click', () => activate(index));
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const current = buttons.indexOf(button);
        let next = current;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = buttons.length - 1;
        else next = (current + (event.key === 'ArrowLeft' ? 1 : -1) + buttons.length) % buttons.length;
        activate(next);
        buttons[next].focus();
      });

      buttons.push(button);
      panes.push(pane);
      tabbar.appendChild(button);
    });

    function activate(index) {
      buttons.forEach((button, i) => {
        button.setAttribute('aria-selected', String(i === index));
        button.tabIndex = i === index ? 0 : -1;
      });
      panes.forEach((pane, i) => { pane.hidden = i !== index; });
    }

    const header = panel.querySelector('.settings-head');
    if (header) header.insertAdjacentElement('afterend', tabbar);
    else panel.insertBefore(tabbar, panel.firstChild);
    panes.forEach(pane => panel.appendChild(pane));
    panel.dataset.tabsReady = '1';
    return true;
  }

  function start() {
    if (initSettingsTabs()) return;
    let attempts = 0;
    const retry = () => {
      if (initSettingsTabs() || ++attempts >= 30) return;
      window.setTimeout(retry, 200);
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
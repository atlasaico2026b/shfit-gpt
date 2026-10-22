(()=>{
  function initSettingsTabs(){
    const panel=document.querySelector('#settingsPanel');
    if(!panel||panel.dataset.tabsReady==='1')return;
    const sections=[...panel.querySelectorAll(':scope > .settings-section')];
    if(!sections.length)return;
    panel.dataset.tabsReady='1';
    if(!document.getElementById('atlasSettingsTabsStyle')){
      const style=document.createElement('style');style.id='atlasSettingsTabsStyle';
      style.textContent='.settings-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:0 0 12px;padding:5px;border:1px solid rgba(140,210,255,.16);border-radius:14px;background:rgba(0,0,0,.12);position:sticky;top:0;z-index:5;backdrop-filter:blur(12px)}.settings-tab{border:0;border-radius:10px;padding:9px 8px;background:transparent;color:var(--muted);font:inherit;font-weight:700;cursor:pointer}.settings-tab[aria-selected="true"]{color:var(--text);background:rgba(80,180,255,.14);box-shadow:inset 0 0 0 1px rgba(120,210,255,.2)}.settings-tab-pane[hidden]{display:none!important}.settings-tab-pane{min-width:0}';
      document.head.appendChild(style);
    }
    const tabbar=document.createElement('div');
    tabbar.className='settings-tabs';tabbar.setAttribute('role','tablist');tabbar.setAttribute('aria-label','بخش‌های تنظیمات');
    const groups=[
      {id:'settings-dashboard-tab',label:'داشبورد',match:s=>/چیدمان پنجره‌ها/.test(s.textContent)},
      {id:'settings-appearance-tab',label:'ظاهر برنامه',match:s=>/پوستهٔ برنامه|پس‌زمینهٔ ابروبادی/.test(s.textContent)},
      {id:'settings-phonebook-tab',label:'دفترچه تلفن',match:s=>s.id==='phonebookSettingsGroup'}
    ];
    const panes={};
    groups.forEach((g,i)=>{
      const b=document.createElement('button');b.type='button';b.className='settings-tab';b.id=g.id;b.textContent=g.label;b.setAttribute('role','tab');b.setAttribute('aria-selected',i===0?'true':'false');tabbar.appendChild(b);
      const pane=document.createElement('div');pane.className='settings-tab-pane';pane.dataset.settingsPane=g.id;pane.setAttribute('role','tabpanel');panes[g.id]=pane;
      sections.filter(g.match).forEach(s=>pane.appendChild(s));
      b.addEventListener('click',()=>{[...tabbar.children].forEach(x=>x.setAttribute('aria-selected',String(x===b)));Object.values(panes).forEach(p=>p.hidden=true);pane.hidden=false;});
    });
    panel.insertBefore(tabbar,panel.querySelector('.settings-section'));
    Object.values(panes).forEach(p=>{p.hidden=true;panel.appendChild(p)});
    const first=panes[groups[0].id];if(first)first.hidden=false;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initSettingsTabs,{once:true});else initSettingsTabs();
  window.addEventListener('atlas-shift-settings-ready',initSettingsTabs);
})();
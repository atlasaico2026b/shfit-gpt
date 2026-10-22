(()=>{
  function initSettingsTabs(){
    const panel=document.querySelector('#settingsPanel');
    if(!panel||panel.dataset.tabsReady==='1')return;
    const sections=[...panel.querySelectorAll(':scope > .settings-section')];
    if(!sections.length)return;
    panel.dataset.tabsReady='1';

    const tabbar=document.createElement('div');
    tabbar.className='settings-tabs';
    tabbar.setAttribute('role','tablist');
    tabbar.setAttribute('aria-label','بخش‌های تنظیمات');
    const groups=[
      {id:'settings-dashboard-tab',label:'داشبورد',match:s=>/چیدمان پنجره‌ها/.test(s.textContent)},
      {id:'settings-appearance-tab',label:'ظاهر برنامه',match:s=>/پوستهٔ برنامه|پس‌زمینهٔ ابروبادی/.test(s.textContent)},
      {id:'settings-phonebook-tab',label:'دفترچه تلفن',match:s=>s.id==='phonebookSettingsGroup'}
    ];
    const panes={};
    groups.forEach((g,i)=>{
      const b=document.createElement('button');
      b.type='button'; b.className='settings-tab'; b.id=g.id; b.textContent=g.label;
      b.setAttribute('role','tab'); b.setAttribute('aria-selected',i===0?'true':'false');
      tabbar.appendChild(b);
      const pane=document.createElement('div');
      pane.className='settings-tab-pane'; pane.dataset.settingsPane=g.id; pane.setAttribute('role','tabpanel');
      panes[g.id]=pane;
      sections.filter(g.match).forEach(s=>pane.appendChild(s));
      if(!pane.children.length) pane.textContent='این بخش هنوز محتوایی ندارد.';
      b.addEventListener('click',()=>{
        [...tabbar.children].forEach(x=>x.setAttribute('aria-selected',String(x===b)));
        Object.values(panes).forEach(p=>p.hidden=true); pane.hidden=false;
      });
    });
    panel.insertBefore(tabbar,panel.querySelector('.settings-section'));
    Object.values(panes).forEach(p=>{p.hidden=true;panel.appendChild(p)});
    const first=panes[groups[0].id]; if(first)first.hidden=false;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initSettingsTabs,{once:true});else initSettingsTabs();
  window.addEventListener('atlas-shift-settings-ready',initSettingsTabs);
})();
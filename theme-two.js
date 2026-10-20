(function(){
  'use strict';
  var KEY='atlasShiftAppTheme', MIGRATION='atlasShiftThemeTwoApplied';
  function loadColorfulFinish(){
    if(document.getElementById('atlas-theme-two-colorful'))return;
    var link=document.createElement('link');
    link.id='atlas-theme-two-colorful';link.rel='stylesheet';link.href='./theme-two-colorful.css';
    document.head.appendChild(link);
  }
  function setTheme(){
    loadColorfulFinish();
    document.documentElement.dataset.atlasTheme='theme-two';
    try{localStorage.setItem(KEY,'theme-two')}catch(e){}
    document.querySelectorAll('[data-app-theme]').forEach(function(el){
      var active=el.dataset.appTheme==='theme-two';
      el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));
      var state=el.querySelector('.theme-option-state');
      if(state)state.textContent=active?'فعال':'انتخاب';
    });
  }

  /* ATLAS SHIFT configurable option lists.
     Static select choices are stored locally, can be added from the same form,
     and are centrally editable from Settings. Entity selectors such as employees
     and vehicles remain linked to their records and are intentionally excluded. */
  var OPTION_KEY='atlasShiftOptionRegistryV1';
  var seed={
    location:{label:'مکان‌ها',values:['اهواز','آبادان','اندیمشک','ماهشهر','بندر امام','آغاجاری','سایر']},
    activityType:{label:'نوع فعالیت‌ها',values:['نظارت بر جوشکاری','بررسی انشعاب یا نشتی','بررسی آلودگی خاک یا آب','بازدید ایستگاه','سرویس تجهیزات','بازدید ایمنی','سایر']},
    workType:{label:'نوع کار',values:['شیفتی','روزکار']},
    employmentType:{label:'نوع استخدام',values:['رسمی','پیمانی','قراردادی','شرکتی','سایر']},
    shiftPattern:{label:'الگوی شیفت',values:['۱۲ ساعته روز/شب','۲۴/۴۸','ثابت روزکار','سایر']},
    employeeStatus:{label:'وضعیت کارکنان',values:['آماده‌کار','در حال کار','شیفت','مأموریت','مرخصی','استراحت','اضافه‌کار','غیرفعال']},
    missionStatus:{label:'وضعیت مأموریت',values:['برنامه‌ریزی‌شده','در جریان','انجام‌شده','لغو‌شده']},
    leaveType:{label:'نوع مرخصی',values:['استحقاقی','استعلاجی','بدون حقوق','ساعتی','سایر']},
    leaveStatus:{label:'وضعیت مرخصی',values:['در انتظار بررسی','تأییدشده','ردشده','استفاده‌شده']},
    vehicleType:{label:'نوع خودرو',values:['خودروی آتش‌نشانی','خودروی پشتیبانی','وانت','سواری','مینی‌بوس','سایر']},
    vehicleStatus:{label:'وضعیت عملیاتی خودرو',values:['آماده','در سرویس','خارج از سرویس','در تعمیر']},
    healthStatus:{label:'وضعیت سلامت',values:['سالم','نیازمند بررسی','دارای نقص','در حال تعمیر']},
    gasStatus:{label:'وضعیت گازسنج',values:['آماده استفاده','در کالیبراسیون','خارج از سرویس','در تعمیر']},
    noteType:{label:'نوع مورد و پیگیری',values:['نامه اداری','درخواست خرید','استعلام','برآورد هزینه','پیگیری قطعه','ارسال تجهیزات','بازدید','بازرسی','ممیزی','اقدام اصلاحی','یادداشت عمومی','سایر']}
  };
  var aliases={
    'محل سازمانی':'location','محل خدمت فعلی':'location','شهر یا محدوده':'location','شهر فعلی':'location','محل استقرار':'location',
    'نوع فعالیت':'activityType','نوع کار':'workType','نوع استخدام':'employmentType','الگوی شیفت':'shiftPattern',
    'وضعیت جاری':'employeeStatus','وضعیت مأموریت':'missionStatus','نوع مرخصی':'leaveType','وضعیت درخواست':'leaveStatus',
    'نوع خودرو':'vehicleType','وضعیت عملیاتی':'vehicleStatus','وضعیت دستگاه':'gasStatus','وضعیت سلامت':'healthStatus','نوع مورد':'noteType'
  };
  var excluded=['کارمند','راننده','خودرو','افراد اعزامی','مسئول دستگاه'];
  var managerOpen=false;
  var observer=null;

  function readRegistry(){
    var data=null;
    try{data=JSON.parse(localStorage.getItem(OPTION_KEY)||'null')}catch(e){}
    if(!data||typeof data!=='object'||!data.categories)data={version:1,categories:{}};
    Object.keys(seed).forEach(function(key){
      if(!data.categories[key])data.categories[key]={label:seed[key].label,values:seed[key].values.slice()};
      else{
        data.categories[key].label=seed[key].label;
        data.categories[key].values=Array.from(new Set((Array.isArray(data.categories[key].values)?data.categories[key].values:[]).concat(seed[key].values)));
      }
    });
    return data;
  }
  function writeRegistry(data){try{localStorage.setItem(OPTION_KEY,JSON.stringify(data))}catch(e){}document.dispatchEvent(new CustomEvent('atlas-shift-options-changed'))}
  function cleanText(v){return String(v||'').replace(/\s+/g,' ').trim()}
  function fieldLabel(select){
    var holder=select.closest('.field,.form-field,.input-group,.form-item,.control,.field-wrap,.module-form-field')||select.parentElement;
    if(!holder)return '';
    var label=holder.querySelector('label');
    return cleanText(label?label.textContent:holder.textContent).replace(/[*✱]/g,'').trim();
  }
  function keyForSelect(select){
    var explicit=select.dataset.optionKey||select.name||select.id||'';
    if(explicit){
      var k=String(explicit).replace(/^field[-_]?/,'').replace(/[-_]/g,'');
      var map={workplace:'location',assignedWorkplace:'location',city:'location',currentCity:'location',location:'location',missionType:'activityType',workType:'workType',employmentType:'employmentType',shiftPattern:'shiftPattern',status:'status',leaveType:'leaveType',vehicleType:'vehicleType',healthStatus:'healthStatus',actionType:'noteType'};
      var normalized=Object.keys(map).find(function(x){return k.toLowerCase()===x.toLowerCase()});
      if(normalized){
        if(k==='status'){
          var label=fieldLabel(select);return aliases[label]||'status';
        }
        return map[normalized];
      }
    }
    var label=fieldLabel(select);
    return aliases[label]||('custom:'+label);
  }
  function shouldEnhance(select){
    if(!select||select.multiple)return false;
    var label=fieldLabel(select);
    if(excluded.indexOf(label)>=0)return false;
    var key=keyForSelect(select);
    if(key==='custom:')return false;
    return !!(seed[key]||key.indexOf('custom:')===0||select.options.length>0);
  }
  function syncSelect(select){
    if(!shouldEnhance(select))return;
    var key=keyForSelect(select), registry=readRegistry(), cat=registry.categories[key];
    if(!cat){
      cat={label:fieldLabel(select)||'گزینه‌های سفارشی',values:[]};
      Array.from(select.options).forEach(function(o){var v=cleanText(o.value||o.textContent);if(v&&v!=='انتخاب کنید'&&v!=='انتخاب...')cat.values.push(v)});
      cat.values=Array.from(new Set(cat.values));registry.categories[key]=cat;writeRegistry(registry);
    }
    var current=select.value;
    var first=select.options.length?select.options[0]:null;
    var placeholder=first&&(!first.value||/انتخاب/.test(first.textContent))?{value:first.value,text:first.textContent}:null;
    select.innerHTML='';
    if(placeholder){var ph=document.createElement('option');ph.value=placeholder.value;ph.textContent=placeholder.text;select.appendChild(ph)}
    cat.values.forEach(function(value){var o=document.createElement('option');o.value=value;o.textContent=value;select.appendChild(o)});
    if(current)select.value=current;
  }
  function addInlineControl(select){
    if(!shouldEnhance(select)||select.dataset.optionEnhanced==='1')return;
    select.dataset.optionEnhanced='1';
    var wrap=document.createElement('div');wrap.className='atlas-option-inline';
    select.parentNode.insertBefore(wrap,select);wrap.appendChild(select);
    var input=document.createElement('input');input.type='text';input.className='atlas-option-add-input';input.placeholder='گزینه جدید…';input.setAttribute('aria-label','گزینه جدید');
    var btn=document.createElement('button');btn.type='button';btn.className='atlas-option-add-btn';btn.textContent='＋ افزودن';btn.title='افزودن گزینه جدید به همین فهرست';
    wrap.appendChild(input);wrap.appendChild(btn);
    function add(){
      var value=cleanText(input.value);if(!value)return;
      var key=keyForSelect(select),data=readRegistry(),cat=data.categories[key]||(data.categories[key]={label:fieldLabel(select)||'گزینه‌ها',values:[]});
      if(cat.values.some(function(v){return v===value})){input.value='';syncSelect(select);select.value=value;return}
      cat.values.push(value);writeRegistry(data);input.value='';syncAll();select.value=value;input.focus();
    }
    btn.addEventListener('click',add);input.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();add()}});
  }
  function syncAll(){
    document.querySelectorAll('select').forEach(function(select){
      if(!shouldEnhance(select))return;
      var value=select.value;syncSelect(select);if(value)select.value=value;
      addInlineControl(select);
    });
    renderManager();
  }
  function createManager(){
    if(document.getElementById('atlasOptionManager'))return;
    var host=document.createElement('div');host.id='atlasOptionManager';host.className='atlas-option-manager';host.setAttribute('aria-hidden','true');
    host.innerHTML='<div class="atlas-option-manager-card"><div class="atlas-option-manager-head"><div><strong>مدیریت گزینه‌ها</strong><small>مکان‌ها، وضعیت‌ها، نوع فعالیت‌ها و همهٔ فهرست‌های انتخابی</small></div><button type="button" class="atlas-option-manager-close" aria-label="بستن">×</button></div><div class="atlas-option-manager-body" id="atlasOptionManagerBody"></div></div>';
    document.body.appendChild(host);
    host.querySelector('.atlas-option-manager-close').addEventListener('click',function(){setManager(false)});
    host.addEventListener('click',function(e){if(e.target===host)setManager(false)});
  }
  function setManager(open){createManager();managerOpen=open;var host=document.getElementById('atlasOptionManager');host.classList.toggle('open',open);host.setAttribute('aria-hidden',String(!open));if(open)renderManager()}
  function renderManager(){
    var body=document.getElementById('atlasOptionManagerBody');if(!body||!managerOpen)return;
    var data=readRegistry();body.innerHTML='';
    Object.keys(data.categories).forEach(function(key){
      var cat=data.categories[key],box=document.createElement('section');box.className='atlas-option-category';
      var head=document.createElement('div');head.className='atlas-option-category-head';head.innerHTML='<strong></strong><span></span>';head.querySelector('strong').textContent=cat.label;head.querySelector('span').textContent=String(cat.values.length)+' گزینه';box.appendChild(head);
      var add=document.createElement('div');add.className='atlas-option-manager-add';add.innerHTML='<input type="text" placeholder="گزینه جدید…"><button type="button">افزودن</button>';box.appendChild(add);
      var list=document.createElement('div');list.className='atlas-option-list';
      cat.values.forEach(function(value,index){
        var row=document.createElement('div');row.className='atlas-option-row';row.dataset.index=String(index);
        row.innerHTML='<input type="text"><button type="button" class="save">اصلاح</button><button type="button" class="delete">حذف</button>';
        row.querySelector('input').value=value;list.appendChild(row);
      });
      add.querySelector('button').addEventListener('click',function(){var input=add.querySelector('input'),v=cleanText(input.value);if(!v)return;var d=readRegistry(),c=d.categories[key];if(!c.values.includes(v)){c.values.push(v);writeRegistry(d);input.value='';syncAll()}});
      add.querySelector('input').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();add.querySelector('button').click()}});
      list.addEventListener('click',function(e){var row=e.target.closest('.atlas-option-row');if(!row)return;var idx=Number(row.dataset.index),d=readRegistry(),c=d.categories[key];if(e.target.classList.contains('delete')){c.values.splice(idx,1);writeRegistry(d);syncAll()}else if(e.target.classList.contains('save')){var v=cleanText(row.querySelector('input').value);if(!v)return;if(c.values.some(function(x,i){return i!==idx&&x===v})){alert('این گزینه قبلاً وجود دارد.');return}c.values[idx]=v;writeRegistry(d);syncAll()}});
      box.appendChild(list);body.appendChild(box);
    });
  }
  function addSettingsButton(){
    var panel=document.getElementById('settingsPanel');if(!panel||document.getElementById('atlasOptionManagerButton'))return;
    var button=document.createElement('button');button.id='atlasOptionManagerButton';button.type='button';button.className='atlas-option-manager-button';button.innerHTML='<span>☷</span><span><strong>مدیریت گزینه‌ها</strong><small>افزودن، اصلاح یا حذف فهرست‌های انتخابی</small></span>';
    button.addEventListener('click',function(){setManager(true)});
    panel.appendChild(button);
  }
  function installOptionManager(){
    createManager();addSettingsButton();syncAll();
    if(observer)observer.disconnect();
    observer=new MutationObserver(function(){addSettingsButton();syncAll()});
    observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('atlas-shift-options-changed',function(){syncAll()});
  }

  function boot(){
    loadColorfulFinish();
    var button=document.querySelector('[data-app-theme="theme-two"]');
    if(button){button.disabled=false;button.removeAttribute('aria-disabled');button.classList.remove('pending');}
    document.addEventListener('click',function(e){
      var target=e.target.closest&&e.target.closest('[data-app-theme="theme-two"]');
      if(!target)return;
      e.preventDefault();e.stopImmediatePropagation();setTheme();
    },true);
    try{if(localStorage.getItem(MIGRATION)!=='1'){setTheme();localStorage.setItem(MIGRATION,'1');}else if(localStorage.getItem(KEY)==='theme-two')setTheme();}catch(e){}
    installOptionManager();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();

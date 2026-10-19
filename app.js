(()=>{
  const $=(s,root=document)=>root.querySelector(s), $$=(s,root=document)=>Array.from(root.querySelectorAll(s));
  const dashboard=$('#dashboard'), widgets=()=>$$('.widget',dashboard);
  const initialOrder=['roster','shift-coverage','missions','alerts','fleet','calendar','equipment','operations','stations'];
  const initialSizes={roster:'medium','shift-coverage':'compact',missions:'wide',alerts:'compact',fleet:'compact',calendar:'compact',equipment:'medium',operations:'wide',stations:'compact'};
  let layoutMode=false, showUnreadOnly=false, toastTimer;
  const toast=(msg)=>{const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400)};
  const safeRead=(key)=>{try{return localStorage.getItem(key)}catch(e){return null}};
  const safeWrite=(key,value)=>{try{localStorage.setItem(key,value)}catch(e){}}
  function applySavedLayout(){
    let saved;try{saved=JSON.parse(safeRead('atlasShiftLayout')||'null')}catch(e){saved=null}
    if(saved&&Array.isArray(saved.order)){
      saved.order.forEach(id=>{const node=$(`[data-widget="${id}"]`);if(node)dashboard.appendChild(node)});
      // Keep newly-added widgets visible when loading a layout saved by an older version.
      widgets().forEach(w=>{if(!saved.order.includes(w.dataset.widget))dashboard.appendChild(w);if(saved.sizes&&saved.sizes[w.dataset.widget])w.dataset.size=saved.sizes[w.dataset.widget]});
    }
    paintSizeButtons();
  }
  function saveLayout(){safeWrite('atlasShiftLayout',JSON.stringify({order:widgets().map(w=>w.dataset.widget),sizes:Object.fromEntries(widgets().map(w=>[w.dataset.widget,w.dataset.size]))}));}
  function paintSizeButtons(){widgets().forEach(w=>$$('[data-size-action]',w).forEach(b=>b.classList.toggle('selected',b.dataset.sizeAction===w.dataset.size)))}
  function setLayoutMode(on){layoutMode=on;document.body.classList.toggle('layout-mode',on);$('#layoutButtonText').textContent=on?'پایان تنظیم':'تنظیم چیدمان';$('#layoutButton').setAttribute('aria-pressed',String(on));widgets().forEach(w=>{const handle=$('.drag-handle',w);if(handle)handle.setAttribute('draggable',String(on));});if(on)toast('حالت چیدمان فعال شد؛ دستگیرهٔ پنجره‌ها را بکش و جابه‌جا کن.');else{saveLayout();toast('چیدمان در این مرورگر ذخیره شد.')}}
  $('#layoutButton').addEventListener('click',()=>setLayoutMode(!layoutMode));
  $('#resetLayout').addEventListener('click',()=>{initialOrder.forEach(id=>{const node=$(`[data-widget="${id}"]`);if(node)dashboard.appendChild(node);if(node)node.dataset.size=initialSizes[id]});safeWrite('atlasShiftLayout','');paintSizeButtons();setLayoutMode(false);toast('چیدمان اولیه بازگردانده شد.')});
  // A drag handle is used for both a mouse and a finger. Cards snap to the grid when dropped.
  let dragCard=null, startX=0,startY=0,lastTarget=null,activePointer=null;
  widgets().forEach(w=>{
    const handle=$('.drag-handle',w);if(!handle)return;
    handle.addEventListener('pointerdown',e=>{if(!layoutMode)return;if(e.button!==0&&e.pointerType==='mouse')return;dragCard=w;activePointer=e.pointerId;startX=e.clientX;startY=e.clientY;w.classList.add('is-dragging');handle.setPointerCapture?.(e.pointerId);e.preventDefault()});
    handle.addEventListener('pointermove',e=>{
      if(!layoutMode||dragCard!==w||activePointer!==e.pointerId)return;
      const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('.widget');
      if(!hit||hit===dragCard||hit===lastTarget)return;
      if(lastTarget)lastTarget.classList.remove('drag-over');lastTarget=hit;hit.classList.add('drag-over');
      const r=hit.getBoundingClientRect();const dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);let after;
      if(Math.abs(dx)>Math.abs(dy))after=(document.documentElement.dir==='rtl')?dx<0:dx>0;else after=dy>0;
      dashboard.insertBefore(dragCard,after?hit.nextSibling:hit); 
    });
    const endDrag=e=>{if(dragCard!==w)return;w.classList.remove('is-dragging');if(lastTarget)lastTarget.classList.remove('drag-over');lastTarget=null;dragCard=null;activePointer=null;saveLayout();if(layoutMode)paintSizeButtons()};
    handle.addEventListener('pointerup',endDrag);handle.addEventListener('pointercancel',endDrag);
  });
  // Keep the widgets' glass reflection responsive to the pointer.
  widgets().forEach(w=>{w.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const r=w.getBoundingClientRect();w.style.setProperty('--mx',(e.clientX-r.left)+'px');w.style.setProperty('--my',(e.clientY-r.top)+'px')});w.addEventListener('pointerleave',()=>{w.style.setProperty('--mx','50%');w.style.setProperty('--my','0')})});
  dashboard.addEventListener('click',e=>{const btn=e.target.closest('[data-size-action]');if(!btn||!layoutMode)return;const w=btn.closest('.widget');w.dataset.size=btn.dataset.sizeAction;paintSizeButtons();saveLayout()});
  applySavedLayout();
  // Notifications: open, read/unread filter, and local read state.
  function updateNotificationBadge(){const count=$$('.notice-card.unread').length;const badge=$('#notificationCount');badge.textContent=String(count).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);badge.style.display=count?'flex':'none';}
  function openDrawer(){document.body.classList.add('notifications-open');$('#notificationDrawer').setAttribute('aria-hidden','false');$('#settingsPanel').classList.remove('open');$('#settingsPanel').setAttribute('aria-hidden','true');$('#settingsButton').setAttribute('aria-expanded','false')}
  function closeDrawer(){document.body.classList.remove('notifications-open');$('#notificationDrawer').setAttribute('aria-hidden','true')}
  $('#notificationButton').addEventListener('click',openDrawer);$('#seeAllAlerts').addEventListener('click',openDrawer);$('#closeDrawer').addEventListener('click',closeDrawer);$('#drawerBackdrop').addEventListener('click',closeDrawer);
  $('#markAllRead').addEventListener('click',()=>{$$('.notice-card').forEach(n=>{n.classList.remove('unread');$('.notice-unread',n)?.remove()});updateNotificationBadge();toast('همه اعلان‌ها خوانده‌شده علامت خوردند.')});
  $('#onlyUnread').addEventListener('click',()=>{showUnreadOnly=!showUnreadOnly;$('#onlyUnread').textContent=showUnreadOnly?'نمایش همه اعلان‌ها':'فقط خوانده‌نشده‌ها';$$('.notice-card').forEach(n=>n.style.display=(!showUnreadOnly||n.classList.contains('unread'))?'flex':'none');const any=$$('.notice-card').some(n=>n.style.display!=='none');let empty=$('.empty-notices');if(!any&&!empty){empty=document.createElement('div');empty.className='empty-notices';empty.textContent='اعلان خوانده‌نشده‌ای باقی نمانده است.';$('#noticeList').appendChild(empty)}else if(any&&empty)empty.remove()});
  $$('.notice-card').forEach(n=>n.addEventListener('click',()=>{n.classList.remove('unread');$('.notice-unread',n)?.remove();updateNotificationBadge()}));
  updateNotificationBadge();
  // Theme 1 is the glass-cloud reference; theme 2 remains reserved until the user supplies its design.
  const appThemes={'cloud-glass':{accent:'#168bff',rgb:'22,139,255',accent2:'#24cbe0'}};
  function applyTheme(name,persist=true){
    const selected=Object.prototype.hasOwnProperty.call(appThemes,name)?name:'cloud-glass';
    const theme=appThemes[selected];
    document.documentElement.dataset.atlasTheme=selected;
    document.documentElement.style.setProperty('--accent',theme.accent);
    document.documentElement.style.setProperty('--accent-rgb',theme.rgb);
    document.documentElement.style.setProperty('--accent2',theme.accent2);
    $$('[data-app-theme]').forEach(option=>{
      const active=option.dataset.appTheme===selected;
      option.classList.toggle('active',active);
      option.setAttribute('aria-pressed',String(active));
    });
    if(persist)safeWrite('atlasShiftAppTheme',selected);
  }
  $$('[data-app-theme]:not([disabled])').forEach(option=>option.addEventListener('click',()=>{
    applyTheme(option.dataset.appTheme);
    toast('تم برنامه اعمال شد.');
  }));
  applyTheme(safeRead('atlasShiftAppTheme')||'cloud-glass',false);

  // Custom, locally saved cloud-gradient colors; no remote images or services.
  const defaultCloudBackground={colors:['#8bdcff','#ffb8df','#b7b9ff'],strength:32};
  function cloudHexToRgb(hex){
    const match=/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex||''));
    return match?match.slice(1).map(part=>parseInt(part,16)).join(','):'124,140,255';
  }
  function applyCloudBackground(settings,persist=true){
    const source=settings&&typeof settings==='object'?settings:{};
    const sourceColors=Array.isArray(source.colors)?source.colors:[];
    const colors=defaultCloudBackground.colors.map((fallback,index)=>{
      const candidate=String(sourceColors[index]||fallback);
      return /^#[\da-f]{6}$/i.test(candidate)?candidate:fallback;
    });
    const requestedStrength=Number(source.strength);
    const strength=Number.isFinite(requestedStrength)?Math.max(8,Math.min(38,requestedStrength)):defaultCloudBackground.strength;
    colors.forEach((color,index)=>{
      document.documentElement.style.setProperty('--cloud-'+(index+1)+'-rgb',cloudHexToRgb(color));
      const input=$('#cloudColor'+(index+1));
      if(input)input.value=color;
    });
    document.documentElement.style.setProperty('--cloud-opacity',(strength/100).toFixed(2));
    document.documentElement.style.setProperty('--cloud-opacity-soft',(strength*.68/100).toFixed(3));
    document.documentElement.style.setProperty('--cloud-opacity-subtle',(strength*.82/100).toFixed(3));
    const strengthInput=$('#cloudStrength');
    const strengthLabel=$('#cloudStrengthValue');
    if(strengthInput)strengthInput.value=String(strength);
    if(strengthLabel)strengthLabel.textContent=String(strength).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d])+'٪';
    if(persist)safeWrite('atlasShiftCloudBackground',JSON.stringify({colors,strength}));
  }
  let savedCloudBackground=null;
  try{savedCloudBackground=JSON.parse(safeRead('atlasShiftCloudBackground')||'null')}catch(e){}
  applyCloudBackground(savedCloudBackground||defaultCloudBackground,false);
  const syncCloudBackground=()=>applyCloudBackground({
    colors:[$('#cloudColor1').value,$('#cloudColor2').value,$('#cloudColor3').value],
    strength:$('#cloudStrength').value
  });
  $$('.cloud-color-input').forEach(input=>input.addEventListener('input',syncCloudBackground));
  $('#cloudStrength').addEventListener('input',syncCloudBackground);
  $('#resetCloudBackground').addEventListener('click',()=>{applyCloudBackground(defaultCloudBackground);toast('پس‌زمینه به رنگ‌های پیش‌فرض برگشت.')});
  const settingsPanel=$('#settingsPanel'),settingsButton=$('#settingsButton');
  settingsButton.addEventListener('click',e=>{e.stopPropagation();const opening=!settingsPanel.classList.contains('open');settingsPanel.classList.toggle('open',opening);settingsPanel.setAttribute('aria-hidden',String(!opening));settingsButton.setAttribute('aria-expanded',String(opening));closeDrawer()});
  document.addEventListener('click',e=>{if(!e.target.closest('#settingsPanel')&&!e.target.closest('#settingsButton')){settingsPanel.classList.remove('open');settingsPanel.setAttribute('aria-hidden','true');settingsButton.setAttribute('aria-expanded','false')}});
  // Persian calendar and range presets for the dashboard's top-level filter bar.
  const faDigits = s => String(s).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
  const rangeNames = {today:'امروز',yesterday:'دیروز',threeDays:'۳ روز اخیر',week:'هفته اخیر',tenDays:'۱۰ روز اخیر',month:'ماه جاری',threeMonths:'۳ ماه اخیر',sixMonths:'۶ ماه اخیر',year:'سال جاری',custom:'بازه دلخواه'};
  let activeRange='today', rangeStart=null, rangeEnd=null, calendarAnchor=new Date();
  const jalaliPartsFormat = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{year:'numeric',month:'numeric',day:'numeric'});
  const jalaliMonthFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian',{month:'long',year:'numeric'});
  const jalaliDateFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian',{day:'numeric',month:'long',year:'numeric'});
  const dayOnly = date => new Date(date.getFullYear(),date.getMonth(),date.getDate());
  const addDays = (date,n) => { const d=dayOnly(date); d.setDate(d.getDate()+n); return d; };
  const jParts = date => { const p=jalaliPartsFormat.formatToParts(date); const value=t=>Number(p.find(x=>x.type===t)?.value||0); return {year:value('year'),month:value('month'),day:value('day')}; };
  const formatJDate = date => date ? jalaliDateFormat.format(date) : '—';
  const isoDay = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  function jalaliMonthDates(anchor){
    const target=jParts(anchor), found=[];
    for(let offset=-40;offset<=40;offset++){
      const d=addDays(anchor,offset), p=jParts(d);
      if(p.year===target.year&&p.month===target.month)found.push(d);
    }
    return found.sort((a,b)=>a-b);
  }
  function persianYearStart(anchor){
    for(let offset=-220;offset<=220;offset++){
      const d=addDays(anchor,offset), p=jParts(d);
      if(p.month===1&&p.day===1)return d;
    }
    return jalaliMonthDates(anchor)[0]||dayOnly(anchor);
  }
  function updateRangeSummary(){
    const label=$('#selectedRangeLabel');
    $$('.range-chip').forEach(b=>b.classList.toggle('active',b.dataset.rangePreset===activeRange));
    if(rangeStart&&rangeEnd) label.textContent=`${rangeNames[activeRange]||rangeNames.custom} · ${formatJDate(rangeStart)} تا ${formatJDate(rangeEnd)}`;
    else if(rangeStart) label.textContent=`${rangeNames[activeRange]||rangeNames.custom} · از ${formatJDate(rangeStart)} تا …`;
    else label.textContent=rangeNames[activeRange]||rangeNames.custom;
    $('#calendarSelectionDates').textContent=rangeStart?(rangeEnd?`${formatJDate(rangeStart)}
تا
${formatJDate(rangeEnd)}`:`شروع: ${formatJDate(rangeStart)}`):'انتخاب روز شروع';
    $('#calendarSelectionHelp').textContent=!rangeStart?'برای شروع، یک روز را از تقویم انتخاب کن.':!rangeEnd?'حالا روز پایان را انتخاب کن. اگر روزی زودتر از شروع انتخاب شود، ترتیب تاریخ‌ها به‌صورت خودکار اصلاح می‌شود.':'بازه آماده است. با «اعمال بازه» آن را برای نمای داشبورد انتخاب کن.';
    $('#applyCustomRange').disabled=!(rangeStart&&rangeEnd);
  }
  function renderCalendar(){
    $('#calendarMonthLabel').textContent=jalaliMonthFormat.format(calendarAnchor);
    const grid=$('#calendarGrid');grid.innerHTML='';
    const dates=jalaliMonthDates(calendarAnchor);if(!dates.length)return;
    const leading=(dates[0].getDay()+1)%7;
    for(let i=0;i<leading;i++){const blank=document.createElement('span');blank.className='day-empty';grid.appendChild(blank)}
    const todayIso=isoDay(new Date()), startIso=rangeStart?isoDay(rangeStart):'', endIso=rangeEnd?isoDay(rangeEnd):'';
    dates.forEach(date=>{
      const btn=document.createElement('button');btn.type='button';btn.className='calendar-day';btn.textContent=faDigits(jParts(date).day);btn.dataset.date=isoDay(date);btn.setAttribute('aria-label',formatJDate(date));
      const id=isoDay(date);if(id===todayIso)btn.classList.add('today');
      if(startIso&&id===startIso)btn.classList.add('range-start','selected');
      if(endIso&&id===endIso)btn.classList.add('range-end','selected');
      if(rangeStart&&rangeEnd&&date>=rangeStart&&date<=rangeEnd)btn.classList.add('in-range');
      if(id===startIso||id===endIso)btn.setAttribute('aria-pressed','true');else btn.setAttribute('aria-pressed','false');
      btn.addEventListener('click',()=>chooseCalendarDate(date));grid.appendChild(btn);
    });
  }
  function chooseCalendarDate(date){
    const picked=dayOnly(date);
    if(!rangeStart||rangeEnd){rangeStart=picked;rangeEnd=null;activeRange='custom'}
    else if(picked<rangeStart){rangeEnd=rangeStart;rangeStart=picked;activeRange='custom'}
    else {rangeEnd=picked;activeRange='custom'}
    calendarAnchor=picked;updateRangeSummary();renderCalendar();
  }
  function applyRangePreset(name){
    activeRange=name;const today=dayOnly(new Date());let start=today,end=today;
    if(name==='yesterday'){start=addDays(today,-1);end=start}
    else if(name==='threeDays')start=addDays(today,-2);
    else if(name==='week')start=addDays(today,-6);
    else if(name==='tenDays')start=addDays(today,-9);
    else if(name==='month')start=jalaliMonthDates(today)[0]||today;
    else if(name==='threeMonths')start=jalaliMonthDates(addDays(today,-62))[0]||addDays(today,-62);
    else if(name==='sixMonths')start=jalaliMonthDates(addDays(today,-155))[0]||addDays(today,-155);
    else if(name==='year')start=persianYearStart(today);
    else if(name==='custom'){
      $('#calendarPanel').classList.add('open');$('#calendarPanel').setAttribute('aria-hidden','false');$('#calendarToggle').setAttribute('aria-expanded','true');
      calendarAnchor=rangeStart||today;updateRangeSummary();renderCalendar();return;
    }
    rangeStart=dayOnly(start);rangeEnd=dayOnly(end);calendarAnchor=rangeEnd;updateRangeSummary();renderCalendar();
    $('#calendarPanel').classList.remove('open');$('#calendarPanel').setAttribute('aria-hidden','true');$('#calendarToggle').setAttribute('aria-expanded','false');
  }
  const calendarPanel=$('#calendarPanel'), calendarToggle=$('#calendarToggle');
  calendarToggle.addEventListener('click',()=>{const opening=!calendarPanel.classList.contains('open');calendarPanel.classList.toggle('open',opening);calendarPanel.setAttribute('aria-hidden',String(!opening));calendarToggle.setAttribute('aria-expanded',String(opening));if(opening){calendarAnchor=rangeStart||new Date();renderCalendar()}});
  $('#closeCalendar').addEventListener('click',()=>{calendarPanel.classList.remove('open');calendarPanel.setAttribute('aria-hidden','true');calendarToggle.setAttribute('aria-expanded','false')});
  $('#calendarPrev').addEventListener('click',()=>{calendarAnchor=addDays(calendarAnchor,-32);renderCalendar()});
  $('#calendarNext').addEventListener('click',()=>{calendarAnchor=addDays(calendarAnchor,32);renderCalendar()});
  $('#clearCalendarSelection').addEventListener('click',()=>{rangeStart=null;rangeEnd=null;activeRange='custom';updateRangeSummary();renderCalendar()});
  $('#applyCustomRange').addEventListener('click',()=>{if(!rangeStart||!rangeEnd)return;activeRange='custom';updateRangeSummary();calendarPanel.classList.remove('open');calendarPanel.setAttribute('aria-hidden','true');calendarToggle.setAttribute('aria-expanded','false');toast('بازهٔ زمانی دلخواه انتخاب شد.')});
  $$('.range-chip').forEach(button=>button.addEventListener('click',()=>applyRangePreset(button.dataset.rangePreset)));
  rangeStart=dayOnly(new Date());rangeEnd=dayOnly(new Date());updateRangeSummary();renderCalendar();

  // Nine visible shortcut tabs scroll to their corresponding information-only panes.
  let dockFocusTimer;
  $$('[data-target-widget]').forEach(button=>button.addEventListener('click',()=>{
    const target=$(`[data-widget="${button.dataset.targetWidget}"]`);if(!target)return;
    $$('[data-target-widget]').forEach(item=>item.classList.toggle('active',item===button));
    target.scrollIntoView({behavior:'smooth',block:'center'});target.classList.add('dock-focus');
    clearTimeout(dockFocusTimer);dockFocusTimer=setTimeout(()=>target.classList.remove('dock-focus'),1500);
  }));

  function updateClock(){
    const now=new Date();
    const setText=(id,value)=>{const element=$('#'+id);if(element)element.textContent=value};
    try{
      setText('clockText',faDigits(new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit',hour12:false}).format(now)));
    }catch(e){
      setText('clockText',faDigits(now.toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'})));
    }
    try{
      const parts=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).formatToParts(now);
      const get=type=>parts.find(part=>part.type===type)?.value||'';
      setText('dateText',`${get('weekday')}، ${get('day')} ${get('month')} ${get('year')}`);
      setText('persianDay',get('day'));
      setText('persianMonth',`${get('month')} ${get('year')}`);
      setText('weekDay',get('weekday'));
    }catch(e){
      setText('dateText',faDigits(now.toLocaleDateString('fa-IR')));
    }
  }
  updateClock();setInterval(updateClock,15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateClock()});
  window.addEventListener('pageshow',updateClock);

  // Single-shell navigation: all menu sections use this same UI. Unbuilt modules show an honest in-theme placeholder.
  const viewInfo = {
    dashboard:{title:'اتاق فرمان <span style="color:var(--accent2)">عملیات</span>',subtitle:'نمایی یکپارچه از نیروی انسانی، مأموریت‌ها، ناوگان و وضعیت تجهیزات ایمنی',kicker:'مرکز پایش عملیات / LIVE OVERVIEW'},
    employees:{title:'مدیریت <span style="color:var(--accent2)">کارکنان</span>',subtitle:'پرونده پرسنلی، وضعیت کاری و محل خدمت',kicker:'مدیریت عملیات / کارکنان',icon:'♙',note:'در این بخش، کارت پرسنلی، نوع استخدام، محل سازمانی و محل خدمت فعلی ساخته خواهد شد.'},
    missions:{title:'مدیریت <span style="color:var(--accent2)">مأموریت‌ها</span>',subtitle:'مأموریت‌های شهری و بین‌شهری، مسیر، کیلومتر و فعالیت میدانی',kicker:'مدیریت عملیات / مأموریت‌ها',icon:'↗',note:'فرم‌های ثبت مأموریت، مبدأ و مقصد، تاریخ، خودرو، نفرات و گزارش‌های دوره‌ای در همین بخش پیاده‌سازی خواهند شد.'},
    leaves:{title:'مدیریت <span style="color:var(--accent2)">مرخصی‌ها</span>',subtitle:'برنامه‌ریزی مرخصی و مشاهده وضعیت نیروها',kicker:'مدیریت عملیات / مرخصی‌ها',icon:'◷',note:'ثبت بازه مرخصی، پیوند آن با برنامه شیفت و گزارش مرخصی‌ها در این بخش پیاده‌سازی خواهد شد.'},
    vehicles:{title:'مدیریت <span style="color:var(--accent2)">خودروها</span>',subtitle:'وضعیت ناوگان، محل استقرار، سرنشینان و سرویس دوره‌ای',kicker:'مدیریت عملیات / خودروها',icon:'▰',note:'کارت خودرو، پلاک‌ها، خرابی‌ها، تجهیزات همراه، کیلومتر و سوابق تعمیرات در همین بخش ساخته خواهد شد.'},
    gasmeters:{title:'مدیریت <span style="color:var(--accent2)">گازسنج‌ها</span>',subtitle:'وضعیت تجهیزات، گازهای قابل‌اندازه‌گیری و سررسید کالیبراسیون',kicker:'مدیریت عملیات / تجهیزات',icon:'◉',note:'ثبت کد و سریال، نوع گاز، محل استقرار، وضعیت دستگاه و محاسبه سررسید کالیبراسیون در این بخش پیاده‌سازی خواهد شد.'},
    notes:{title:'یادداشت‌ها و <span style="color:var(--accent2)">پیگیری‌ها</span>',subtitle:'یادداشت‌های کاری و نکات پیگیری عملیات',kicker:'مدیریت عملیات / یادداشت‌ها',icon:'▤',note:'یادداشت‌های قابل ویرایش و حذف، تاریخ و ارجاع مرتبط در این بخش ساخته خواهد شد.'},
    reports:{title:'گزارش‌ها و <span style="color:var(--accent2)">آمار</span>',subtitle:'گزارش‌های روزانه و دوره‌ای بر اساس تاریخ، شهر و نوع فعالیت',kicker:'مدیریت عملیات / گزارشات',icon:'▥',note:'فیلتر تاریخ شمسی، شمارش مأموریت‌ها و گزارش‌های قابل چاپ و خروجی در این بخش پیاده‌سازی خواهد شد.'},
    settings:{title:'تنظیمات <span style="color:var(--accent2)">برنامه</span>',subtitle:'ظاهر، چیدمان پنجره‌ها و آماده‌سازی اجرای محلی',kicker:'فضای کاری / تنظیمات',icon:'⚙',note:'تنظیمات ظاهری موجود است. تنظیمات داده، پشتیبان‌گیری و گزینه‌های نصب محلی در ادامه به همین بخش اضافه خواهند شد.'}
  };
  function renderRoute(requestedView){
    let view='dashboard';
    try{view=requestedView||new URLSearchParams(window.location.search).get('view')||'dashboard'}catch(e){}
    if(!Object.prototype.hasOwnProperty.call(viewInfo,view))view='dashboard';
    const info=viewInfo[view], isDashboard=view==='dashboard';
    const hideSelectors=['.dashboard-controls','.widget-dock','.layout-hint','#dashboard','.footnote'];
    hideSelectors.forEach(sel=>{const el=$(sel);if(el)el.classList.toggle('route-hidden',!isDashboard)});
    const section=$('#sectionView');
    section.hidden=isDashboard;
    document.querySelectorAll('.app-menu-item').forEach(link=>{
      let target='dashboard';
      try{target=new URL(link.getAttribute('href'),window.location.href).searchParams.get('view')||'dashboard'}catch(e){}
      link.classList.toggle('active',target===view);
      if(target===view)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    });
    const h=$('.hero h1'),p=$('.hero p'),k=$('.hero .kicker');
    if(h)h.innerHTML=info.title;
    if(p)p.textContent=info.subtitle;
    if(k)k.textContent=info.kicker;
    if(window.ATLAS_MODULES&&typeof window.ATLAS_MODULES.render==='function'){
      window.ATLAS_MODULES.render(view,section);
    }else if(!isDashboard){
      section.innerHTML='<article class="section-placeholder"><span class="section-badge">'+(info.icon||'✧')+' &nbsp; فضای کاری یکپارچه</span><h2>'+info.title.replace(/<[^>]*>/g,'')+'</h2><p>'+info.subtitle+'</p><div class="section-note">'+info.note+'</div><p>این صفحه هنوز در حال آماده‌سازی است.</p><div class="section-actions"><a class="primary" href="./index.html">بازگشت به داشبورد</a></div></article>';
    }else{section.innerHTML='';}
    if(view==='settings'){
      settingsPanel.classList.add('open');settingsPanel.setAttribute('aria-hidden','false');settingsButton.setAttribute('aria-expanded','true');
    }else{
      settingsPanel.classList.remove('open');settingsPanel.setAttribute('aria-hidden','true');settingsButton.setAttribute('aria-expanded','false');
    }
  }
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-open-settings-panel]')){
      settingsPanel.classList.add('open');settingsPanel.setAttribute('aria-hidden','false');settingsButton.setAttribute('aria-expanded','true');
    }
  });
  // Navigate the main menu inside the existing app shell so query routes update reliably.
  document.addEventListener('click',event=>{
    const link=event.target.closest('a.app-menu-item');
    if(!link||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    if(link.target&&link.target!=='_self')return;
    let destination;
    try{destination=new URL(link.href,window.location.href)}catch(e){return}
    if(destination.origin!==window.location.origin)return;
    const nextView=destination.searchParams.get('view')||'dashboard';
    event.preventDefault();
    try{
      window.history.pushState({atlasShiftView:nextView},'',destination.pathname+destination.search+destination.hash);
      renderRoute(nextView);
      window.scrollTo({top:0,behavior:'smooth'});
    }catch(e){
      window.location.assign(destination.href);
    }
  },true);
  window.addEventListener('popstate',renderRoute);
  renderRoute();

  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDrawer();calendarPanel.classList.remove('open');calendarPanel.setAttribute('aria-hidden','true');calendarToggle.setAttribute('aria-expanded','false');settingsPanel.classList.remove('open');settingsPanel.setAttribute('aria-hidden','true');settingsButton.setAttribute('aria-expanded','false');if(layoutMode)setLayoutMode(false)}});
})();

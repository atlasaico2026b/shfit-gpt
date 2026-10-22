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
  window.addEventListener('atlas-shift-ui-settings-restored',()=>{
    applyTheme(safeRead('atlasShiftAppTheme')||'cloud-glass',false);
    let restoredBackground=null;
    try{restoredBackground=JSON.parse(safeRead('atlasShiftCloudBackground')||'null')}catch(e){}
    applyCloudBackground(restoredBackground||defaultCloudBackground,false);
    applySavedLayout();
  });
  const syncCloudBackground=()=>applyCloudBackground({
    colors:[$('#cloudColor1').value,$('#cloudColor2').value,$('#cloudColor3').value],
    strength:$('#cloudStrength').value
  });
  $$('.cloud-color-input').forEach(input=>input.addEventListener('input',syncCloudBackground));
  $('#cloudStrength').addEventListener('input',syncCloudBackground);
  $('#resetCloudBackground').addEventListener('click',()=>{applyCloudBackground(defaultCloudBackground);toast('پس‌زمینه به رنگ‌های پیش‌فرض برگشت.')});
  const settingsPanel=$('#settingsPanel'),settingsButton=$('#settingsButton');
  const voiceDefaults={enabled:false,input:true,reply:false,confirm:true};
  let voiceSettings=voiceDefaults;
  try{voiceSettings=Object.assign({},voiceDefaults,JSON.parse(localStorage.getItem('atlasShiftVoiceV2')||'{}'));}catch(_){}
  $('#voiceEnabled').checked=!!voiceSettings.enabled;
  $('#voiceInput').checked=voiceSettings.input!==false;
  $('#voiceReply').checked=!!voiceSettings.reply;
  $('#voiceConfirm').checked=voiceSettings.confirm!==false;
  $('#saveVoiceSettings').addEventListener('click',()=>{
    const value={enabled:$('#voiceEnabled').checked,input:$('#voiceInput').checked,reply:$('#voiceReply').checked,confirm:$('#voiceConfirm').checked};
    try{localStorage.setItem('atlasShiftVoiceV2',JSON.stringify(value));}catch(_){}
    const toast=$('#toast');if(toast){toast.textContent='تنظیمات دستیار ذخیره شد.';toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1800);}
  });
  const phonebookCategory=$('#phonebookOptionCategory'),phonebookValue=$('#phonebookOptionValue'),phonebookList=$('#phonebookOptionList');
  const phonebookOptionLabels={phoneLabel:'عنوان شماره تماس'};
  let phonebookOptionData={};try{phonebookOptionData=JSON.parse(localStorage.getItem('atlasShiftPhonebookOptionsV1')||'{}');}catch(_){}
  const pbTreeType=$('#pbTreeType'),pbTreeParent=$('#pbTreeParent'),pbTreeName=$('#pbTreeName'),pbLocationTreeView=$('#pbLocationTreeView'),pbOrgTreeView=$('#pbOrgTreeView');
  const pbTreeLabels={area:'حوزه',city:'شهر',complex:'مجتمع',transferCenter:'مرکز انتقال نفت',station:'ایستگاه مخابراتی',building:'ساختمان',supervision:'سرپرستی',unit:'واحد',unitHead:'رئیس واحد',position:'سمت سازمانی'};
  const pbTreeParents={area:[],city:['area'],complex:['city'],transferCenter:['city'],station:['city'],building:['complex','transferCenter','station'],supervision:[],unit:['supervision'],unitHead:['unit'],position:['unit']};
  let pbTreeNodes=[];try{const saved=JSON.parse(localStorage.getItem('atlasShiftPhonebookTreeV1')||'[]');if(Array.isArray(saved))pbTreeNodes=saved;}catch(_){}
  // Migrate older records: organization nodes and stricter city -> site hierarchy remain user-editable.
  pbTreeNodes=pbTreeNodes.filter(n=>n&&n.id&&pbTreeLabels[n.type]).map(n=>({...n,parentId:n.parentId||''}));
  function pbTreeSave(){try{localStorage.setItem('atlasShiftPhonebookTreeV1',JSON.stringify(pbTreeNodes));}catch(_){toast('ذخیره ساختار درختی انجام نشد.');}}
  function savePhonebookOptionData(){try{localStorage.setItem('atlasShiftPhonebookOptionsV1',JSON.stringify(phonebookOptionData));document.dispatchEvent(new CustomEvent('atlas-phonebook-options-updated'));renderPhonebookOptionList();}catch(_){toast('ذخیره فهرست انجام نشد.');}}
  function pbTreeSyncOptions(){
    const types=['area','city','complex','transferCenter','station','building','supervision','unit','unitHead','position'];
    types.forEach(type=>{phonebookOptionData[type]=[...new Set(pbTreeNodes.filter(n=>n.type===type).map(n=>n.name))].sort((a,b)=>a.localeCompare(b,'fa'));});
    savePhonebookOptionData();
  }
  function pbTreeRefresh(){
    const type=pbTreeType.value,allowed=pbTreeParents[type]||[],previous=pbTreeParent.value;
    pbTreeParent.innerHTML='<option value="">'+(allowed.length?'انتخاب والد الزامی است':'بدون والد (ریشه)')+'</option>';
    pbTreeNodes.filter(n=>allowed.includes(n.type)).sort((a,b)=>a.name.localeCompare(b.name,'fa')).forEach(n=>{
      const o=document.createElement('option');o.value=n.id;o.textContent=pbTreeLabels[n.type]+' · '+n.name;pbTreeParent.appendChild(o);
    });
    if([...pbTreeParent.options].some(o=>o.value===previous))pbTreeParent.value=previous;
    const childrenOf=id=>pbTreeNodes.filter(n=>n.parentId===id).sort((a,b)=>a.name.localeCompare(b.name,'fa'));
    const locationTypes=['area','city','complex','transferCenter','station','building'];
    const orgTypes=['supervision','unit','unitHead','position'];
    const renderNode=(node,depth)=>'<div class="atlas-pb-option-row" style="margin-right:'+(depth*14)+'px"><span>↳ '+pbTreeLabels[node.type]+': '+escTree(node.name)+'</span><div style="display:flex;gap:6px"><button class="secondary-btn" type="button" data-pbt-edit="'+escTree(node.id)+'">اصلاح</button><button class="secondary-btn" type="button" data-pbt-delete="'+escTree(node.id)+'">حذف</button></div></div>'+childrenOf(node.id).map(n=>renderNode(n,depth+1)).join('');
    const renderGroup=(view,types)=>{
      if(!view)return;
      view.innerHTML=pbTreeNodes.filter(n=>types.includes(n.type)&&!pbTreeNodes.some(p=>p.id===n.parentId)).sort((a,b)=>a.name.localeCompare(b.name,'fa')).map(n=>renderNode(n,0)).join('')||'<div class="atlas-pb-empty">هنوز موردی تعریف نشده است.</div>';
    };
    renderGroup(pbLocationTreeView,locationTypes);
    renderGroup(pbOrgTreeView,orgTypes);
  }
  function escTree(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  let pbTreeEditingId='';
  const pbTreeAddButton=$('#pbTreeAdd'),pbTreeCancelEdit=$('#pbTreeCancelEdit');
  function pbTreeResetEditor(){
    pbTreeEditingId='';
    pbTreeAddButton.textContent='＋ افزودن';
    pbTreeCancelEdit.style.display='none';
    pbTreeName.value='';
    pbTreeRefresh();
  }
  function pbTreeStartEdit(id){
    const node=pbTreeNodes.find(n=>n.id===id);if(!node)return;
    pbTreeEditingId=id;
    pbTreeType.value=node.type;
    pbTreeRefresh();
    pbTreeParent.value=node.parentId||'';
    pbTreeName.value=node.name;
    pbTreeAddButton.textContent='ذخیره اصلاحات';
    pbTreeCancelEdit.style.display='inline-flex';
    pbTreeName.focus();
  }
  pbTreeType.addEventListener('change',pbTreeRefresh);
  pbTreeCancelEdit.addEventListener('click',pbTreeResetEditor);
  pbTreeAddButton.addEventListener('click',()=>{
    const type=pbTreeType.value,name=pbTreeName.value.trim(),parentId=pbTreeParent.value||'',allowed=pbTreeParents[type]||[];
    if(!name){pbTreeName.focus();return;}
    if(allowed.length&&!parentId){toast('برای این مورد، والد مربوط را انتخاب کن.');return;}
    if(!allowed.length&&parentId){toast('این مورد باید در ریشه ساختار باشد.');return;}
    if(parentId&&!pbTreeNodes.some(n=>n.id===parentId&&allowed.includes(n.type))){toast('والد انتخاب‌شده معتبر نیست.');return;}
    if(type==='unitHead'&&pbTreeNodes.some(n=>n.id!==pbTreeEditingId&&n.type==='unitHead'&&n.parentId===parentId)){toast('برای این واحد، رئیس واحد از قبل تعریف شده است.');return;}
    if(pbTreeNodes.some(n=>n.id!==pbTreeEditingId&&n.type===type&&n.name===name&&n.parentId===parentId)){toast('این مورد در همین شاخه از قبل وجود دارد.');return;}
    if(pbTreeEditingId){
      const node=pbTreeNodes.find(n=>n.id===pbTreeEditingId);if(!node){pbTreeResetEditor();return;}
      node.type=type;node.name=name;node.parentId=parentId;
      pbTreeSave();pbTreeSyncOptions();pbTreeResetEditor();toast('مورد و ارتباط بالادست آن اصلاح شد.');
      return;
    }
    pbTreeNodes.push({id:'pbt-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),type,name,parentId});
    pbTreeSave();pbTreeSyncOptions();pbTreeName.value='';pbTreeRefresh();toast('مورد به ساختار مرتبط افزوده شد.');
  });
  [pbLocationTreeView,pbOrgTreeView].forEach(treeView=>treeView.addEventListener('click',event=>{
    const edit=event.target.closest('[data-pbt-edit]'),del=event.target.closest('[data-pbt-delete]');
    if(edit){pbTreeStartEdit(edit.dataset.pbtEdit);return;}
    if(!del)return;const id=del.dataset.pbtDelete;if(pbTreeNodes.some(n=>n.parentId===id)){toast('ابتدا زیرمجموعه‌های این مورد را حذف یا جابه‌جا کن.');return;}
    if(!confirm('این مورد از ساختار مرتبط حذف شود؟'))return;pbTreeNodes=pbTreeNodes.filter(n=>n.id!==id);pbTreeSave();pbTreeSyncOptions();pbTreeRefresh();
  }));
  function renderPhonebookOptionList(){const key=phonebookCategory.value,values=Array.isArray(phonebookOptionData[key])?phonebookOptionData[key]:[];phonebookList.innerHTML=values.length?values.map((value,i)=>'<div class="atlas-pb-option-row"><span>'+escTree(value)+'</span><div style="display:flex;gap:6px"><button class="secondary-btn" type="button" data-pbo-edit="'+i+'">اصلاح</button><button class="secondary-btn" type="button" data-pbo-delete="'+i+'">حذف</button></div></div>').join(''):'<div class="atlas-pb-empty">هنوز مقداری ثبت نشده است.</div>';}
  phonebookCategory.addEventListener('change',()=>{phonebookValue.value='';renderPhonebookOptionList();});
  $('#phonebookOptionAdd').addEventListener('click',()=>{const key=phonebookCategory.value,value=phonebookValue.value.trim();if(!value){phonebookValue.focus();return;}if(!Array.isArray(phonebookOptionData[key]))phonebookOptionData[key]=[];if(!phonebookOptionData[key].includes(value))phonebookOptionData[key].push(value);phonebookOptionData[key]=[...new Set(phonebookOptionData[key])].sort((a,b)=>a.localeCompare(b,'fa'));phonebookValue.value='';savePhonebookOptionData();});
  phonebookList.addEventListener('click',event=>{const edit=event.target.closest('[data-pbo-edit]'),del=event.target.closest('[data-pbo-delete]'),key=phonebookCategory.value,values=phonebookOptionData[key]||[];if(edit){const i=Number(edit.dataset.pboEdit);if(values[i]===undefined)return;const next=prompt('مقدار جدید:',values[i]);if(next===null)return;const value=next.trim();if(!value)return;values[i]=value;phonebookOptionData[key]=[...new Set(values)].sort((a,b)=>a.localeCompare(b,'fa'));savePhonebookOptionData();}else if(del){const i=Number(del.dataset.pboDelete);if(values[i]===undefined)return;if(!confirm('این مقدار حذف شود؟'))return;values.splice(i,1);savePhonebookOptionData();}});
  pbTreeRefresh();renderPhonebookOptionList();
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
  function publishDashboardRange(){
    window.dispatchEvent(new CustomEvent('atlas-shift-range-changed',{detail:{
      name:activeRange,
      start:rangeStart?isoDay(rangeStart):null,
      end:rangeEnd?isoDay(rangeEnd):null
    }}));
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
    rangeStart=dayOnly(start);rangeEnd=dayOnly(end);calendarAnchor=rangeEnd;updateRangeSummary();renderCalendar();publishDashboardRange();
    $('#calendarPanel').classList.remove('open');$('#calendarPanel').setAttribute('aria-hidden','true');$('#calendarToggle').setAttribute('aria-expanded','false');
  }
  const calendarPanel=$('#calendarPanel'), calendarToggle=$('#calendarToggle');
  calendarToggle.addEventListener('click',()=>{const opening=!calendarPanel.classList.contains('open');calendarPanel.classList.toggle('open',opening);calendarPanel.setAttribute('aria-hidden',String(!opening));calendarToggle.setAttribute('aria-expanded',String(opening));if(opening){calendarAnchor=rangeStart||new Date();renderCalendar()}});
  $('#closeCalendar').addEventListener('click',()=>{calendarPanel.classList.remove('open');calendarPanel.setAttribute('aria-hidden','true');calendarToggle.setAttribute('aria-expanded','false')});
  $('#calendarPrev').addEventListener('click',()=>{calendarAnchor=addDays(calendarAnchor,-32);renderCalendar()});
  $('#calendarNext').addEventListener('click',()=>{calendarAnchor=addDays(calendarAnchor,32);renderCalendar()});
  $('#clearCalendarSelection').addEventListener('click',()=>{rangeStart=null;rangeEnd=null;activeRange='custom';updateRangeSummary();renderCalendar();publishDashboardRange()});
  $('#applyCustomRange').addEventListener('click',()=>{if(!rangeStart||!rangeEnd)return;activeRange='custom';updateRangeSummary();publishDashboardRange();calendarPanel.classList.remove('open');calendarPanel.setAttribute('aria-hidden','true');calendarToggle.setAttribute('aria-expanded','false');toast('بازهٔ زمانی دلخواه انتخاب شد.')});
  $$('.range-chip').forEach(button=>button.addEventListener('click',()=>applyRangePreset(button.dataset.rangePreset)));
  rangeStart=dayOnly(new Date());rangeEnd=dayOnly(new Date());updateRangeSummary();renderCalendar();publishDashboardRange();

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
    settings:{title:'تنظیمات <span style="color:var(--accent2)">برنامه</span>',subtitle:'ظاهر، چیدمان پنجره‌ها و آماده‌سازی اجرای محلی',kicker:'فضای کاری / تنظیمات',icon:'⚙',note:'تنظیمات ظاهری موجود است. تنظیمات داده، پشتیبان‌گیری و گزینه‌های نصب محلی در ادامه به همین بخش اضافه خواهند شد.'},
    phonebook:{title:'دفترچه <span style="color:var(--accent2)">تلفن سازمانی</span>',subtitle:'حوزه، شهر، مجتمع، واحد، سمت، اشخاص و شماره‌های تماس',kicker:'مدیریت عملیات / دفترچه تلفن',icon:'☎',note:'دفترچه تلفن محلی با جست‌وجو، فیلتر، ثبت و ویرایش اطلاعات.'}
  };

  const PHONEBOOK_KEY='atlasShiftPhonebookV2';
  const PHONEBOOK_OPTIONS_KEY='atlasShiftPhonebookOptionsV1';
  const PHONEBOOK_OPTION_FIELDS={
    area:'حوزه',city:'شهر',complex:'مجتمع',transferCenter:'مرکز انتقال نفت',
    station:'نام ایستگاه',building:'ساختمان',unit:'واحد',position:'سمت سازمانی',supervision:'سرپرستی',phoneLabel:'عنوان شماره تماس'
  };
  const PHONEBOOK_DEFAULT_OPTIONS={
    area:[],city:[],complex:[],transferCenter:[],station:[],building:[],unit:[],position:[],supervision:['مدیریت','معاونت فنی','معاونت عملیات','معاونت مخابرات'],
    phoneLabel:['تلفن اصلی','تلفن منشی','فکس','سایر']
  };
  function phonebookOptionsLoad(){
    try{
      const saved=JSON.parse(localStorage.getItem(PHONEBOOK_OPTIONS_KEY)||'{}');
      const result={};
      Object.keys(PHONEBOOK_OPTION_FIELDS).forEach(key=>{
        const incoming=Array.isArray(saved[key])?saved[key]:PHONEBOOK_DEFAULT_OPTIONS[key];
        result[key]=[...new Set(incoming.map(v=>String(v).trim()).filter(Boolean))];
      });
      return result;
    }catch(_){return JSON.parse(JSON.stringify(PHONEBOOK_DEFAULT_OPTIONS));}
  }
  function phonebookOptionsSave(options){
    localStorage.setItem(PHONEBOOK_OPTIONS_KEY,JSON.stringify(options));
    document.dispatchEvent(new CustomEvent('atlas-phonebook-options-updated'));
  }
  function phonebookNormalize(value){
    const x=value&&typeof value==='object'?value:{};
    const phoneNumbers=Array.isArray(x.phoneNumbers)?x.phoneNumbers.map(p=>({kind:p&&p.kind==='office'?'office':'mobile',label:String(p&&p.label||'تلفن اصلی'),value:String(p&&(p.value||p.number)||'')})).filter(p=>p.value):[];
    if(!phoneNumbers.length){
      const oldMobile=String(x.mobile||x.mobileNumber||'').trim();
      if(oldMobile)phoneNumbers.push({kind:'mobile',label:'تلفن اصلی',value:oldMobile});
      const oldOffice=String(x.officePhone||x.office||'').trim();
      if(oldOffice)phoneNumbers.push({kind:'office',label:'تلفن اصلی',value:oldOffice});
      const oldNumbers=Array.isArray(x.numbers)?x.numbers.map(n=>Array.isArray(n)?{label:String(n[0]||'سایر'),value:String(n[1]||'')}:{label:String(n&&n.type||'سایر'),value:String(n&&(n.value||n.number)||'')}):[];
      oldNumbers.filter(p=>p.value).forEach(p=>phoneNumbers.push({kind:'office',label:p.label,value:p.value}));
      if(!oldNumbers.length&&x.phones)phoneNumbers.push({kind:'office',label:'سایر',value:String(x.phones)});
    }
    return {name:String(x.name||x.person||x.fullName||''),phoneNumbers,extension:String(x.extension||x.shortNumber||x.fourDigitNumber||''),area:String(x.area||x.region||''),city:String(x.city||''),complex:String(x.complex||x.site||''),transferCenter:String(x.transferCenter||x.oilTransferCenter||''),station:String(x.station||''),building:String(x.building||''),unit:String(x.unit||''),position:String(x.position||x.jobTitle||''),supervision:String(x.supervision||x.management||''),numbers:[]};
  }
  function phonebookLoad(){
    try{
      const current=localStorage.getItem(PHONEBOOK_KEY);
      if(current!==null){const data=JSON.parse(current);return Array.isArray(data)?data.map(phonebookNormalize):[];}
      for(const key of ['atlas-shift-phonebook','atlasShiftPhonebookV1']){
        const raw=localStorage.getItem(key);if(raw===null)continue;
        const data=JSON.parse(raw);if(Array.isArray(data)){const migrated=data.map(phonebookNormalize);localStorage.setItem(PHONEBOOK_KEY,JSON.stringify(migrated));return migrated;}
      }
    }catch(_){}
    return [];
  }
  function renderPhonebook(section){
    if(!document.getElementById('atlas-phonebook-style')){
      const style=document.createElement('style');style.id='atlas-phonebook-style';
      style.textContent='.atlas-pb-group{margin:16px 0 22px;padding:14px;border:1px solid rgba(122,190,255,.24);border-radius:24px;background:linear-gradient(135deg,rgba(71,155,255,.10),rgba(190,100,255,.08) 42%,rgba(65,235,202,.08));box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 12px 32px rgba(0,0,0,.12);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}.atlas-pb-group-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px;padding:11px 14px;border-radius:17px;background:linear-gradient(110deg,rgba(65,180,255,.22),rgba(190,110,255,.20),rgba(255,130,190,.16),rgba(90,235,205,.16));border:1px solid rgba(255,255,255,.17)}.atlas-pb-group-head span{font-size:12px;opacity:.8}.atlas-pb-group-head strong{font-size:15px}.atlas-pb-group-head small{margin-inline-start:auto;padding:4px 9px;border-radius:99px;background:rgba(255,255,255,.12)}.atlas-pb-group-items{display:grid;gap:10px}.atlas-pb-card{border-radius:22px!important;background:linear-gradient(125deg,rgba(80,160,255,.13),rgba(180,100,255,.10) 40%,rgba(70,220,200,.08))!important;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:inset 0 1px 0 rgba(255,255,255,.15),0 10px 25px rgba(0,0,0,.10)}.atlas-pb-phone-editor{grid-column:1/-1;display:grid;gap:8px;padding:12px;border:1px solid rgba(140,210,255,.16);border-radius:12px}.atlas-pb-phone-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.atlas-pb-phone-row{display:grid;grid-template-columns:minmax(100px,.8fr) minmax(110px,1fr) minmax(130px,1.4fr) auto;gap:7px;margin-top:7px}.atlas-pb-phone-row input,.atlas-pb-phone-row select{box-sizing:border-box;min-width:0;width:100%;padding:10px;border:1px solid rgba(140,210,255,.2);border-radius:10px;background:rgba(0,0,0,.16);color:inherit;font:inherit}.atlas-pb-phone-row .atlas-pb-delete-confirm{background:#16834a!important;color:#fff!important;border:1px solid #35c477!important}.atlas-pb-phone-row .atlas-pb-delete-cancel{background:#b42332!important;color:#fff!important;border:1px solid #e5484d!important}.atlas-pb-phone-row .atlas-pb-delete-question{grid-column:1/-1;font-size:12px;color:var(--muted);padding:4px 2px}.atlas-pb-toolbar{display:grid;grid-template-columns:minmax(180px,2fr) repeat(3,minmax(120px,1fr)) repeat(2,minmax(180px,1.2fr));gap:9px;margin:12px 0}.atlas-pb-toolbar input,.atlas-pb-toolbar select,.atlas-pb-form input,.atlas-pb-form select,.atlas-pb-form textarea,.atlas-pb-combo input{box-sizing:border-box;width:100%;min-width:0;padding:11px 12px;border:1px solid rgba(140,210,255,.2);border-radius:12px;background:rgba(0,0,0,.16);color:inherit;font:inherit}.atlas-pb-form{display:none;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0;padding:14px;border:1px solid rgba(99,217,255,.22);border-radius:16px;background:rgba(99,217,255,.045)}.atlas-pb-form.open{display:grid}.atlas-pb-field{min-width:0;display:grid;gap:6px}.atlas-pb-field>label{font-size:12px;color:var(--muted)}.atlas-pb-combo{display:grid;grid-template-columns:minmax(0,1fr) 42px;gap:6px;min-width:0}.atlas-pb-add-option{border:1px solid rgba(99,217,255,.3);border-radius:12px;background:rgba(99,217,255,.12);color:inherit;font-size:22px;cursor:pointer}.atlas-pb-form .atlas-pb-actions{grid-column:1/-1}.atlas-pb-actions,.atlas-pb-card-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.atlas-pb-results{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.atlas-pb-card{padding:14px;border:1px solid rgba(140,210,255,.16);border-radius:16px;background:rgba(255,255,255,.035);min-width:0}.atlas-pb-card h3{margin:0 0 5px;font-family:"B Roya","B Roya Bold",Tahoma,sans-serif;font-weight:700;font-size:2.4em;line-height:1.2}.atlas-pb-path{color:var(--muted);font-size:12px;line-height:1.9;overflow-wrap:anywhere}.atlas-pb-numbers{color:var(--muted);font-size:19.2px;line-height:2;overflow-wrap:anywhere}.atlas-pb-number-value{color:#006b2d!important;font-weight:700}.atlas-pb-path strong,.atlas-pb-numbers strong{font-weight:800}.atlas-pb-card-actions{margin-top:10px}.atlas-pb-empty{padding:20px;border:1px dashed rgba(140,210,255,.2);border-radius:14px;color:var(--muted);text-align:center}.atlas-pb-settings-list{display:grid;gap:7px;margin-top:10px}.atlas-pb-option-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border:1px solid rgba(140,210,255,.16);border-radius:10px}.atlas-pb-option-row span{overflow-wrap:anywhere}.atlas-pb-option-row button{padding:5px 9px}.atlas-pb-settings-editor{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:10px}.atlas-pb-settings-editor input,.atlas-pb-settings-editor select{min-width:0;padding:9px;border-radius:10px;border:1px solid rgba(140,210,255,.2);background:rgba(0,0,0,.16);color:inherit;font:inherit}@media(max-width:760px){.atlas-pb-toolbar,.atlas-pb-form,.atlas-pb-results{grid-template-columns:1fr}.atlas-pb-toolbar input,.atlas-pb-form .atlas-pb-actions,.atlas-pb-phone-editor{grid-column:auto}.atlas-pb-phone-row{grid-template-columns:1fr 1fr}.atlas-pb-phone-row input{grid-column:1/-1}}';
      document.head.appendChild(style);
    }
    let contacts=phonebookLoad(),editIndex=-1,options=phonebookOptionsLoad();
    const escPb=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const fields=[
      ['name','نام و نام خانوادگی','text',true,false],
      ['extension','شماره داخلی چهاررقمی','tel',false,false],
      ['area','حوزه','text',false,true],['city','شهر','text',false,true],
      ['complex','مجتمع','text',false,true],['transferCenter','نام مرکز انتقال نفت','text',false,true],
      ['station','نام ایستگاه','text',false,true],['building','ساختمان','text',false,true],
      ['unit','واحد','text',false,true],['position','سمت سازمانی','text',false,true],['supervision','سرپرستی','text',false,true]
    ];
    function fieldMarkup(field){
      const [key,label,type,required,dropdown]=field;
      const input='<input id="atlasPb_'+key+'" name="'+key+'" type="'+type+'" '+(required?'required ':'')+'autocomplete="off" placeholder="'+label+'">';
      return '<div class="atlas-pb-field"><label for="atlasPb_'+key+'">'+label+'</label>'+(dropdown?
        '<div class="atlas-pb-combo">'+input+'<button type="button" class="atlas-pb-add-option" data-pb-add-option="'+key+'" title="افزودن مقدار تایپ‌شده به فهرست" aria-label="افزودن '+label+' به فهرست">+</button></div><datalist id="atlasPbList_'+key+'"></datalist>':
        input)+'</div>';
    }
    section.innerHTML='<div class="module-root"><header class="module-page-head"><div><h2>دفترچه تلفن سازمانی</h2><p>حوزه ← شهر ← مجتمع ← مرکز انتقال نفت ← ایستگاه ← ساختمان ← واحد ← سمت ← شخص</p></div></header><section class="module-list-panel"><div class="module-list-head"><div><h3>جست‌وجو و فیلتر</h3><p>فهرست‌ها از تنظیمات دفترچه تلفن مدیریت می‌شوند؛ اطلاعات در همین مرورگر ذخیره می‌شود.</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="primary-btn" id="atlasPbNew">＋ ثبت شخص</button></div></div><div class="atlas-pb-toolbar"><input id="atlasPbSearch" type="search" placeholder="جست‌وجوی نام، شماره یا مشخصات"><select id="atlasPbCityFilter"><option value="">همه شهرها</option></select><select id="atlasPbSiteFilter"><option value="">همه مجتمع‌ها</option></select><select id="atlasPbStationFilter"><option value="">همه ایستگاه‌ها</option></select><select id="atlasPbSortBy" aria-label="مرتب‌سازی بر اساس"><option value="normal">حالت عادی — بدون گروه‌بندی</option><option value="name">نام و نام خانوادگی</option><option value="officePhone">شماره تلفن‌های ثابت</option><option value="extension">شماره داخلی چهاررقمی</option><option value="mobilePhone">موبایل</option><option value="position">سمت سازمانی</option><option value="supervision">سرپرستی</option><option value="unit">واحد</option><option value="area">حوزه</option><option value="city">شهر</option><option value="complex">مجتمع</option><option value="transferCenter">مرکز انتقال نفت</option><option value="station">ایستگاه</option><option value="building">ساختمان</option></select><select id="atlasPbSortDirection" aria-label="جهت مرتب‌سازی"><option value="asc">صعودی: الف تا ی / کم به زیاد</option><option value="desc">نزولی: ی تا الف / زیاد به کم</option></select></div><form class="atlas-pb-form" id="atlasPbForm">'+fields.map(fieldMarkup).join('')+'<div class="atlas-pb-phone-editor"><div class="atlas-pb-phone-head"><strong>شماره‌های تماس</strong><button type="button" class="secondary-btn" id="atlasPbAddPhone">＋ افزودن شماره</button></div><div id="atlasPbPhoneRows"></div></div><div class="atlas-pb-actions"><button class="primary-btn" type="submit">ذخیره اطلاعات</button><button class="secondary-btn" type="button" id="atlasPbCancel">انصراف</button></div></form><div class="atlas-pb-results" id="atlasPbResults"></div></section></div>';
    const form=section.querySelector('#atlasPbForm'),search=section.querySelector('#atlasPbSearch');
    const cityFilter=section.querySelector('#atlasPbCityFilter'),siteFilter=section.querySelector('#atlasPbSiteFilter'),stationFilter=section.querySelector('#atlasPbStationFilter'),sortBy=section.querySelector('#atlasPbSortBy'),sortDirection=section.querySelector('#atlasPbSortDirection');
    fields.filter(f=>f[4]).forEach(([key])=>{const input=section.querySelector('#atlasPb_'+key);input.setAttribute('list','atlasPbList_'+key);});
    const phoneRows=section.querySelector('#atlasPbPhoneRows');
    function renderPhoneRows(items=[]){
      phoneRows.innerHTML='';
      const rows=items.length?items:[{kind:'mobile',label:(options.phoneLabel||PHONEBOOK_DEFAULT_OPTIONS.phoneLabel)[0]||'تلفن اصلی',value:''}];
      rows.forEach((item,index)=>{
        const row=document.createElement('div');row.className='atlas-pb-phone-row';
        const kind=document.createElement('select');kind.setAttribute('aria-label','نوع شماره تماس');
        [['mobile','موبایل'],['office','تلفن دفتر']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;kind.appendChild(o)});kind.value=item.kind==='office'?'office':'mobile';
        const label=document.createElement('select');label.setAttribute('aria-label','عنوان شماره تماس');
        const labels=[...new Set([...(options.phoneLabel||PHONEBOOK_DEFAULT_OPTIONS.phoneLabel),String(item.label||'')].filter(Boolean))];
        labels.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;label.appendChild(o)});label.value=item.label&&labels.includes(item.label)?item.label:labels[0];
        const value=document.createElement('input');value.type='tel';value.autocomplete='tel';value.placeholder='شماره تماس';value.value=item.value||'';value.setAttribute('aria-label','شماره تماس');
        const remove=document.createElement('button');remove.type='button';remove.className='secondary-btn';remove.textContent='حذف';remove.setAttribute('aria-label','حذف شماره تماس '+(index+1));
        remove.addEventListener('click',()=>{
          if(row.querySelector('.atlas-pb-delete-question'))return;
          const question=document.createElement('span');question.className='atlas-pb-delete-question';question.textContent='از حذف این شماره مطمئن هستید؟';
          const confirmDelete=document.createElement('button');confirmDelete.type='button';confirmDelete.className='secondary-btn atlas-pb-delete-confirm';confirmDelete.textContent='بله، حذف شود';
          const cancelDelete=document.createElement('button');cancelDelete.type='button';cancelDelete.className='secondary-btn atlas-pb-delete-cancel';cancelDelete.textContent='خیر، انصراف';
          confirmDelete.addEventListener('click',()=>{row.remove();if(!phoneRows.children.length)renderPhoneRows([])});
          cancelDelete.addEventListener('click',()=>{question.remove();confirmDelete.remove();cancelDelete.remove();remove.hidden=false;});
          remove.hidden=true;row.append(question,confirmDelete,cancelDelete);
        });
        row.append(kind,label,value,remove);phoneRows.appendChild(row);
      });
    }
    function readPhoneRows(){return [...phoneRows.querySelectorAll('.atlas-pb-phone-row')].map(row=>({kind:row.children[0].value==='office'?'office':'mobile',label:row.children[1].value||'سایر',value:row.children[2].value.trim()})).filter(p=>p.value);}
    section.querySelector('#atlasPbAddPhone').addEventListener('click',()=>{const current=readPhoneRows();current.push({kind:'mobile',label:(options.phoneLabel||PHONEBOOK_DEFAULT_OPTIONS.phoneLabel)[0]||'تلفن اصلی',value:''});renderPhoneRows(current);phoneRows.lastElementChild?.querySelector('input')?.focus();});
    function normalizePhoneForCheck(value){
      let v=String(value||'').trim().replace(/[\s().\-\/]+/g,'');
      v=v.replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
      if(v.startsWith('+'))v='+'+v.slice(1).replace(/\D/g,'');else v=v.replace(/\D/g,'');
      if(v.startsWith('0098'))v='0'+v.slice(4);
      else if(v.startsWith('+98'))v='0'+v.slice(3);
      else if(v.startsWith('98')&&v.length>=12)v='0'+v.slice(2);
      return v;
    }
    function duplicatePhoneInContacts(value,skipIndex=-1){
      const candidate=normalizePhoneForCheck(value);if(!candidate)return null;
      for(let ci=0;ci<contacts.length;ci++){
        if(ci===skipIndex)continue;
        const c=contacts[ci];
        for(const p of (c.phoneNumbers||[])){
          if(normalizePhoneForCheck(p.value)===candidate)return {contact:c,phone:p,index:ci};
        }
        if(normalizePhoneForCheck(c.extension)===candidate)return {contact:c,phone:{value:c.extension,label:'شماره داخلی چهاررقمی'},index:ci};
      }
      return null;
    }
    function duplicatePhoneInForm(){
      const rows=readPhoneRows(),seen=new Set();
      for(const p of rows){
        const key=normalizePhoneForCheck(p.value);if(!key)continue;
        if(seen.has(key))return {value:p.value,insideForm:true};
        seen.add(key);
        const existing=duplicatePhoneInContacts(p.value,editIndex);
        if(existing)return {value:p.value,contact:existing.contact,insideForm:false};
      }
      const ext=normalizePhoneForCheck(form.elements.extension.value);
      if(ext){
        if(seen.has(ext))return {value:form.elements.extension.value,insideForm:true};
        const existing=duplicatePhoneInContacts(form.elements.extension.value,editIndex);
        if(existing)return {value:form.elements.extension.value,contact:existing.contact,insideForm:false};
      }
      return null;
    }
    function persist(){try{localStorage.setItem(PHONEBOOK_KEY,JSON.stringify(contacts));return true;}catch(_){alert('ذخیره‌سازی انجام نشد؛ فضای ذخیره‌سازی مرورگر را بررسی کن. اطلاعات فرم پاک نمی‌شود.');return false;}}
    function fillDatalists(){
      fields.filter(f=>f[4]).forEach(([key])=>{
        const list=section.querySelector('#atlasPbList_'+key);if(!list)return;
        list.innerHTML=(options[key]||[]).map(value=>'<option value="'+escPb(value)+'"></option>').join('');
      });
    }
    function refillFilters(){
      [[cityFilter,'city','همه شهرها'],[siteFilter,'complex','همه مجتمع‌ها'],[stationFilter,'station','همه ایستگاه‌ها']].forEach(([el,key,label])=>{
        const previous=el.value;el.innerHTML='';const first=document.createElement('option');first.value='';first.textContent=label;el.appendChild(first);
        [...new Set(contacts.map(c=>c[key].trim()).filter(Boolean))].sort().forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;el.appendChild(o);});
        if([...el.options].some(o=>o.value===previous))el.value=previous;
      });
    }
    function draw(){
      const q=search.value.trim().toLocaleLowerCase();
      const found=contacts.map((c,i)=>({c,i})).filter(({c})=>{
        const hay=[c.name,c.extension,c.position,c.supervision,c.area,c.city,c.complex,c.transferCenter,c.station,c.building,c.unit,...c.phoneNumbers.map(p=>[p.kind==='office'?'تلفن دفتر':'موبایل',p.label,p.value].join(' '))].join(' ').toLocaleLowerCase();
        return(!q||hay.includes(q))&&(!cityFilter.value||c.city===cityFilter.value)&&(!siteFilter.value||c.complex===siteFilter.value)&&(!stationFilter.value||c.station===stationFilter.value);
      });
      const sortKey=sortBy.value||'normal',direction=sortDirection.value==='desc'?-1:1;
      const sortValue=c=>sortKey==='officePhone'?c.phoneNumbers.filter(p=>p.kind==='office').map(p=>p.value).join(' '):sortKey==='mobilePhone'?c.phoneNumbers.filter(p=>p.kind!=='office').map(p=>p.value).join(' '):String(c[sortKey]||'');
      if(sortKey!=='normal')found.sort((a,b)=>direction*sortValue(a.c).localeCompare(sortValue(b.c),'fa',{numeric:true,sensitivity:'base'})||a.c.name.localeCompare(b.c.name,'fa',{sensitivity:'base'}));
      const renderCard=({c,i})=>{
        const path=[['سرپرستی',c.supervision],['سمت سازمانی',c.position],['واحد',c.unit],['حوزه',c.area],['شهر',c.city],['مجتمع',c.complex],['مرکز انتقال نفت',c.transferCenter],['ایستگاه',c.station],['ساختمان',c.building]].filter(p=>p[1]).map(p=>'&nbsp;'.repeat(5)+'<strong>'+escPb(p[0])+':</strong> '+escPb(p[1])).join('&nbsp;&nbsp;&nbsp;');
        const office=c.phoneNumbers.filter(p=>p.kind==='office').map(p=>'&nbsp;'.repeat(5)+'<strong>'+escPb(p.label)+':</strong> <span class="atlas-pb-number-value">'+escPb(p.value)+'</span>');
        const mobile=c.phoneNumbers.filter(p=>p.kind!=='office').map(p=>'&nbsp;'.repeat(5)+'<strong>'+escPb(p.label)+':</strong> <span class="atlas-pb-number-value">'+escPb(p.value)+'</span>');
        const nums=[...office,c.extension?'&nbsp;'.repeat(5)+'<strong>شماره داخلی چهاررقمی:</strong> <span class="atlas-pb-number-value">'+escPb(c.extension)+'</span>':'',...mobile].filter(Boolean).join('&nbsp;&nbsp;&nbsp;')||'شماره‌ای ثبت نشده';
        return '<article class="atlas-pb-card"><h3>'+escPb(c.name||'بدون نام')+'</h3><div class="atlas-pb-numbers">'+nums+'</div><div class="atlas-pb-path">'+path+'</div><div class="atlas-pb-card-actions"><button type="button" class="secondary-btn" data-pb-edit="'+i+'">ویرایش</button><button type="button" class="secondary-btn" data-pb-delete="'+i+'">حذف</button></div></article>';
      };
      if(!found.length){section.querySelector('#atlasPbResults').innerHTML='<div class="atlas-pb-empty">موردی با این مشخصات پیدا نشد.</div>';return;}
      if(sortKey==='normal'||sortKey==='name'){section.querySelector('#atlasPbResults').innerHTML=found.map(renderCard).join('');return;}
      const groups=[];found.forEach(item=>{const label=sortValue(item.c).trim()||'بدون مقدار';let group=groups[groups.length-1];if(!group||group.label!==label){group={label,items:[]};groups.push(group);}group.items.push(item);});
      section.querySelector('#atlasPbResults').innerHTML=groups.map(group=>'<section class="atlas-pb-group"><header class="atlas-pb-group-head"><span>'+escPb(sortBy.options[sortBy.selectedIndex]?.textContent||'گروه‌بندی')+'</span><strong>'+escPb(group.label)+'</strong><small>'+group.items.length+' مخاطب</small></header><div class="atlas-pb-group-items">'+group.items.map(renderCard).join('')+'</div></section>').join('');
    }
    function reset(){form.reset();editIndex=-1;form.classList.remove('open');form.querySelector('[type=submit]').textContent='ذخیره اطلاعات';}
    section.querySelector('#atlasPbNew').onclick=()=>{reset();renderPhoneRows([]);form.classList.add('open');form.elements.name.focus();};
    section.querySelector('#atlasPbCancel').onclick=reset;
    section.querySelectorAll('[data-pb-add-option]').forEach(button=>button.addEventListener('click',()=>{
      const key=button.dataset.pbAddOption,input=form.elements[key],value=String(input.value||'').trim();
      if(!value){input.focus();return;}
      if(!(options[key]||[]).includes(value)){options[key].push(value);options[key].sort((a,b)=>a.localeCompare(b,'fa'));phonebookOptionsSave(options);fillDatalists();}
      input.value=value;input.focus();
    }));
    form.onsubmit=event=>{
      event.preventDefault();const fd=new FormData(form);
      const record={};
      fields.forEach(([key])=>record[key]=String(fd.get(key)||'').trim());
      record.phoneNumbers=readPhoneRows();
      record.numbers=[];
      if(record.extension&&!/^[0-9۰-۹٠-٩]{4}$/.test(record.extension)){alert('شماره داخلی باید دقیقاً چهار رقم باشد.');form.elements.extension.focus();return;}
      const duplicate=duplicatePhoneInForm();
      if(duplicate){
        const message=duplicate.insideForm
          ? 'این شماره در همین فرم بیش از یک بار وارد شده است: '+duplicate.value
          : 'این شماره قبلاً برای مخاطب «'+duplicate.contact.name+'» ثبت شده است: '+duplicate.value+'\nشماره تکراری قابل ذخیره نیست.';
        alert(message);
        const target=[...phoneRows.querySelectorAll('input[type="tel"]')].find(input=>normalizePhoneForCheck(input.value)===normalizePhoneForCheck(duplicate.value));
        (target||form.elements.extension).focus();
        return;
      }
      const previousRecord=editIndex>=0?contacts[editIndex]:null;
      if(editIndex>=0)contacts[editIndex]=record;else contacts.push(record);
      if(!persist()){
        if(editIndex>=0)contacts[editIndex]=previousRecord;else contacts.pop();
        return;
      }
      refillFilters();draw();reset();
    };
    section.querySelector('#atlasPbResults').onclick=event=>{
      const edit=event.target.closest('[data-pb-edit]'),del=event.target.closest('[data-pb-delete]');
      if(edit){
        editIndex=Number(edit.dataset.pbEdit);const c=contacts[editIndex];if(!c)return;
        fields.forEach(([key])=>form.elements[key].value=c[key]||'');
        renderPhoneRows(c.phoneNumbers||[]);
        form.classList.add('open');form.querySelector('[type=submit]').textContent='ذخیره تغییرات';form.elements.name.focus();
      }else if(del){
        const i=Number(del.dataset.pbDelete);if(!Number.isInteger(i)||!contacts[i]||!confirm('این مخاطب حذف شود؟'))return;
        const removed=contacts.splice(i,1)[0];
        if(!persist()){contacts.splice(i,0,removed);return;}
        refillFilters();draw();reset();
      }
    };
    [search,cityFilter,siteFilter,stationFilter,sortBy,sortDirection].forEach(el=>{el.addEventListener('input',draw);el.addEventListener('change',draw);});
    document.addEventListener('atlas-phonebook-options-updated',()=>{options=phonebookOptionsLoad();fillDatalists();renderPhoneRows(readPhoneRows());});
    renderPhoneRows([]);fillDatalists();refillFilters();draw();
  }
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
    if(view==='phonebook'){
      renderPhonebook(section);
    }else if(window.ATLAS_MODULES&&typeof window.ATLAS_MODULES.render==='function'){
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

(function(){
'use strict';
const STORAGE_KEY='atlasShiftOperationalDataV1';
const moduleSpecs={
  employees:{
    title:'کارکنان',
    subtitle:'پروندهٔ نیروها و وضعیت کاری روزانه',
    singular:'کارمند',
    columns:['fullName','mobile','jobTitle','employmentType','workplace','assignedWorkplace','status'],
    fields:[
      {key:'fullName',label:'نام و نام خانوادگی',required:true},
      {key:'mobile',label:'شماره همراه',type:'tel'},
      {key:'jobTitle',label:'عنوان شغلی',required:true},
      {key:'employmentType',label:'نوع کار',type:'select',options:['شیفتی','روزکار'],required:true},
      {key:'workplace',label:'محل سازمانی',type:'select',options:['اهواز','آبادان','اندیمشک','ماهشهر','سایر'],required:true},
      {key:'assignedWorkplace',label:'محل خدمت فعلی',placeholder:'ایستگاه، محدوده یا محل مأموریت'},
      {key:'status',label:'وضعیت کاری',type:'select',options:['آماده‌کار','در حال کار','شیفت','مأموریت','مرخصی','استراحت','اضافه‌کار','غیرفعال'],required:true},
      {key:'notes',label:'توضیحات',type:'textarea',wide:true}
    ]
  },
  missions:{
    title:'مأموریت‌ها',
    subtitle:'ثبت مأموریت، مسیر، همکاران و وضعیت پیگیری',
    singular:'مأموریت',
    columns:['title','date','missionType','city','origin','destination','crew','vehicleId','status'],
    fields:[
      {key:'title',label:'عنوان مأموریت',required:true},
      {key:'date',label:'تاریخ',type:'date',required:true},
      {key:'missionType',label:'نوع فعالیت',type:'select',options:['نظارت بر جوشکاری','بررسی انشعاب یا نشتی','بررسی آلودگی خاک یا آب','بازدید ایستگاه','سرویس تجهیزات','سایر'],required:true},
      {key:'city',label:'شهر یا محدوده',type:'select',options:['اهواز','آبادان','اندیمشک','ماهشهر','بندر امام','آغاجاری','سایر'],required:true},
      {key:'origin',label:'مبدأ'},
      {key:'destination',label:'مقصد یا محل عملیات'},
      {key:'crew',label:'همکاران اعزامی',placeholder:'نام افراد را با ویرگول جدا کن',required:true},
      {key:'vehicleId',label:'خودرو',type:'select',source:'vehicles'},
      {key:'status',label:'وضعیت مأموریت',type:'select',options:['برنامه‌ریزی‌شده','در جریان','انجام‌شده','لغو‌شده'],required:true},
      {key:'notes',label:'شرح کار و نتیجه',type:'textarea',wide:true}
    ]
  },
  leaves:{
    title:'مرخصی‌ها',
    subtitle:'ثبت بازهٔ مرخصی و اتصال آن به پروندهٔ کارمند',
    singular:'مرخصی',
    columns:['employeeId','startDate','endDate','leaveType','status','notes'],
    fields:[
      {key:'employeeId',label:'کارمند',type:'select',source:'employees',required:true},
      {key:'startDate',label:'از تاریخ',type:'date',required:true},
      {key:'endDate',label:'تا تاریخ',type:'date',required:true},
      {key:'leaveType',label:'نوع مرخصی',type:'select',options:['استحقاقی','استعلاجی','بدون حقوق','ساعتی','سایر'],required:true},
      {key:'status',label:'وضعیت درخواست',type:'select',options:['در انتظار بررسی','تأییدشده','ردشده','استفاده‌شده'],required:true},
      {key:'notes',label:'توضیحات',type:'textarea',wide:true}
    ]
  },
  vehicles:{
    title:'خودروها',
    subtitle:'وضعیت ناوگان، محل استقرار، سرنشینان و کیلومترهای سرویس',
    singular:'خودرو',
    columns:['name','companyPlate','policePlate','status','currentCity','currentPlace','nextOilKm','nextFuelKm'],
    fields:[
      {key:'name',label:'نام یا عنوان خودرو',required:true},
      {key:'model',label:'مدل خودرو'},
      {key:'companyPlate',label:'شماره پلاک سازمانی'},
      {key:'policePlate',label:'پلاک انتظامی'},
      {key:'status',label:'وضعیت',type:'select',options:['آماده','در سرویس','خارج از سرویس','در تعمیر'],required:true},
      {key:'currentCity',label:'شهر فعلی',type:'select',options:['اهواز','آبادان','اندیمشک','ماهشهر','بندر امام','سایر']},
      {key:'currentPlace',label:'محل یا نقطهٔ استقرار'},
      {key:'occupants',label:'سرنشینان فعلی',placeholder:'نام افراد با ویرگول جدا شود'},
      {key:'faults',label:'خرابی‌ها و نقص‌ها',type:'textarea',wide:true},
      {key:'equipment',label:'تجهیزات همراه',type:'textarea',wide:true},
      {key:'lastOilKm',label:'کیلومتر آخرین تعویض روغن',type:'number',min:0},
      {key:'nextOilKm',label:'کیلومتر سرویس روغن بعدی',type:'number',min:0},
      {key:'lastFuelKm',label:'کیلومتر ثبت سوخت قبلی',type:'number',min:0},
      {key:'nextFuelKm',label:'کیلومتر ثبت سوخت بعدی',type:'number',min:0}
    ]
  },
  gasmeters:{
    title:'گازسنج‌ها',
    subtitle:'کد و سریال دستگاه، گازهای قابل‌اندازه‌گیری و سررسید کالیبراسیون',
    singular:'گازسنج',
    columns:['code','serial','gases','status','location','calibrationStart','calibrationEnd'],
    fields:[
      {key:'code',label:'کد دستگاه',required:true},
      {key:'serial',label:'شماره سریال',required:true},
      {key:'gases',label:'گازهای قابل‌اندازه‌گیری',placeholder:'CO، O₂، LEL، H₂S'},
      {key:'status',label:'وضعیت دستگاه',type:'select',options:['آماده استفاده','در کالیبراسیون','خارج از سرویس','در تعمیر'],required:true},
      {key:'location',label:'محل استقرار فعلی'},
      {key:'calibrationStart',label:'شروع اعتبار کالیبراسیون',type:'date'},
      {key:'calibrationEnd',label:'پایان اعتبار کالیبراسیون',type:'date',required:true},
      {key:'notes',label:'توضیحات',type:'textarea',wide:true}
    ]
  },
  notes:{
    title:'یادداشت‌ها و پیگیری‌ها',
    subtitle:'یادداشت کاری، مسئول پیگیری، موعد و وضعیت انجام',
    singular:'یادداشت',
    columns:['title','date','dueDate','related','status','body'],
    fields:[
      {key:'title',label:'عنوان پیگیری',required:true},
      {key:'date',label:'تاریخ ثبت',type:'date',required:true},
      {key:'dueDate',label:'موعد پیگیری',type:'date'},
      {key:'related',label:'مرتبط با',placeholder:'نامه، قطعه، خودرو، ایستگاه یا مأموریت'},
      {key:'status',label:'وضعیت',type:'select',options:['برای پیگیری','در حال انجام','انجام‌شده'],required:true},
      {key:'body',label:'شرح یادداشت',type:'textarea',wide:true,required:true}
    ]
  }
};
const knownDataKeys=Object.keys(moduleSpecs);
const formStates={},searchStates={},filterStates={};
function emptyData(){const x={};knownDataKeys.forEach(k=>x[k]=[]);return x}
function readData(){
  const base=emptyData();
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw)return base;
    const parsed=JSON.parse(raw);
    knownDataKeys.forEach(k=>base[k]=Array.isArray(parsed[k])?parsed[k]:[]);
  }catch(e){}
  return base;
}
function saveData(data){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data));return true}
  catch(e){notify('ذخیره‌سازی در این مرورگر در دسترس نیست؛ فضای ذخیره‌سازی را بررسی کن.');return false}
}
function esc(value){
  return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function faDigits(value){return String(value==null?'':value).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)])}
function todayISO(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function displayDate(value){
  if(!value)return '—';
  const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return esc(value);
  const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
  try{return esc(new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'short',day:'numeric'}).format(d))}
  catch(e){return esc(value)}
}
function notify(message){
  const el=document.getElementById('toast');
  if(!el)return;
  el.textContent=message;el.classList.add('show');
  clearTimeout(notify.timer);notify.timer=setTimeout(()=>el.classList.remove('show'),2600);
}
function makeId(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9)}
function getFieldOptions(field,data){
  if(field.source==='employees')return data.employees.map(x=>({value:x.id,label:x.fullName||'کارمند بدون نام'}));
  if(field.source==='vehicles')return data.vehicles.map(x=>({value:x.id,label:(x.name||'خودرو')+(x.companyPlate?' · '+x.companyPlate:'')}));
  return (field.options||[]).map(x=>typeof x==='string'?{value:x,label:x}:x);
}
function fieldValue(view,key,value,data){
  if(value==null||value==='')return '—';
  const spec=moduleSpecs[view];
  const field=(spec.fields||[]).find(f=>f.key===key);
  if(field&&field.type==='date')return displayDate(value);
  if(field&&field.source==='employees'){
    const person=data.employees.find(x=>String(x.id)===String(value));
    return esc(person?person.fullName:value);
  }
  if(field&&field.source==='vehicles'){
    const vehicle=data.vehicles.find(x=>String(x.id)===String(value));
    return esc(vehicle?(vehicle.name||'خودرو')+(vehicle.companyPlate?' · '+vehicle.companyPlate:''):value);
  }
  return esc(value);
}
function renderField(view,field,record,data){
  let val=record&&record[field.key]!=null?record[field.key]:'';
  if(!record&&field.type==='date'&&['date','startDate','calibrationStart'].includes(field.key))val=todayISO();
  const id='field-'+view+'-'+field.key;
  const required=field.required?' required':'';
  const star=field.required?' <i>*</i>':'';
  let control='';
  if(field.type==='select'){
    const opts=getFieldOptions(field,data);
    control='<select id="'+esc(id)+'" name="'+esc(field.key)+'"'+required+'><option value="">'+(field.source==='employees'?'انتخاب کارمند':field.source==='vehicles'?'انتخاب خودرو':'انتخاب کنید')+'</option>'+
      opts.map(o=>'<option value="'+esc(o.value)+'"'+(String(o.value)===String(val)?' selected':'')+'>'+esc(o.label)+'</option>').join('')+'</select>';
  }else if(field.type==='textarea'){
    control='<textarea id="'+esc(id)+'" name="'+esc(field.key)+'" rows="3"'+required+' placeholder="'+esc(field.placeholder||'')+'">'+esc(val)+'</textarea>';
  }else{
    control='<input id="'+esc(id)+'" name="'+esc(field.key)+'" type="'+esc(field.type||'text')+'"'+(field.min!=null?' min="'+esc(field.min)+'"':'')+required+' value="'+esc(val)+'" placeholder="'+esc(field.placeholder||'')+'" autocomplete="off">';
  }
  return '<label class="module-field'+(field.wide?' module-field-wide':'')+'" for="'+esc(id)+'"><span>'+esc(field.label)+star+'</span>'+control+'</label>';
}
function statusOptions(view){
  const field=moduleSpecs[view]&&moduleSpecs[view].fields.find(f=>f.key==='status');
  return field&&field.options?field.options:[];
}
function getFilteredRecords(view,data){
  const spec=moduleSpecs[view],term=(searchStates[view]||'').trim().toLocaleLowerCase();
  const filter=filterStates[view]||'all';
  return (data[view]||[]).filter(record=>{
    if(filter!=='all'&&record.status!==filter)return false;
    if(!term)return true;
    const values=spec.fields.map(f=>fieldValue(view,f.key,record[f.key],data)).join(' ').toLocaleLowerCase();
    return values.includes(term);
  }).slice().sort((a,b)=>String(b.updatedAt||b.createdAt||b.date||b.startDate||'').localeCompare(String(a.updatedAt||a.createdAt||a.date||a.startDate||'')));
}
function renderForm(view,data){
  const spec=moduleSpecs[view],state=formStates[view];
  if(!state)return '';
  const record=state.id?(data[view]||[]).find(x=>String(x.id)===String(state.id)):null;
  if(state.id&&!record){delete formStates[view];return ''}
  return '<section class="module-form-panel"><div class="module-form-head"><div><h3>'+(record?'ویرایش ':'ثبت ')+esc(spec.singular)+'</h3><p>اطلاعات پس از ذخیره روی همین دستگاه نگهداری می‌شود.</p></div><button type="button" class="secondary-btn" data-module-action="cancel" data-view="'+esc(view)+'">بستن فرم</button></div>'+
    '<form class="module-form" data-module-form data-view="'+esc(view)+'" data-id="'+esc(record?record.id:'')+'"><div class="module-fields">'+spec.fields.map(f=>renderField(view,f,record,data)).join('')+'</div>'+
    '<div class="module-form-actions"><span class="module-required-help">موارد دارای * ضروری هستند.</span><div><button type="button" class="secondary-btn" data-module-action="cancel" data-view="'+esc(view)+'">انصراف</button> <button type="submit" class="primary-btn">'+(record?'ذخیرهٔ تغییرات':'ثبت '+esc(spec.singular))+'</button></div></div></form></section>';
}
function renderRecordTable(view,data){
  const spec=moduleSpecs[view],records=getFilteredRecords(view,data);
  const columns=spec.columns;
  if(!records.length)return '<div class="module-empty">'+((data[view]||[]).length?'موردی مطابق جست‌وجو یا فیلتر پیدا نشد.':'هنوز اطلاعاتی ثبت نشده است. از «ثبت مورد جدید» شروع کن.')+'</div>';
  return '<div class="module-table-wrap"><table class="module-table"><thead><tr><th class="module-check-cell"><input type="checkbox" data-module-select-all aria-label="انتخاب همهٔ موارد"></th>'+
    columns.map(k=>'<th>'+esc((spec.fields.find(f=>f.key===k)||{label:k}).label)+'</th>').join('')+'<th>عملیات</th></tr></thead><tbody>'+
    records.map(record=>'<tr><td class="module-check-cell"><input type="checkbox" data-record-select value="'+esc(record.id)+'" aria-label="انتخاب ردیف"></td>'+
      columns.map(k=>'<td>'+fieldValue(view,k,record[k],data)+'</td>').join('')+
      '<td class="module-row-actions"><button type="button" class="secondary-btn" data-module-action="edit" data-view="'+esc(view)+'" data-id="'+esc(record.id)+'">ویرایش</button> <button type="button" class="module-delete-btn" data-module-action="delete" data-view="'+esc(view)+'" data-id="'+esc(record.id)+'">حذف</button></td></tr>').join('')+
    '</tbody></table></div><div class="module-list-foot">نمایش '+faDigits(records.length)+' مورد از '+faDigits((data[view]||[]).length)+' مورد</div>';
}
function renderCrudView(view,section){
  const spec=moduleSpecs[view],data=readData(),records=data[view]||[];
  const statusField=spec.fields.find(f=>f.key==='status');
  const selectedFilter=filterStates[view]||'all';
  section.innerHTML='<div class="module-wrap">'+
    '<div class="module-page-head"><div><span class="module-overline">ATLAS SHIFT / مدیریت عملیات</span><h2>'+esc(spec.title)+'</h2><p>'+esc(spec.subtitle)+'</p></div><div class="module-page-actions"><button class="secondary-btn" type="button" data-module-action="export" data-view="'+esc(view)+'">خروجی CSV</button><button class="primary-btn" type="button" data-module-action="new" data-view="'+esc(view)+'">＋ ثبت مورد جدید</button></div></div>'+
    '<div class="module-summary"><div><span>تعداد کل</span><strong>'+faDigits(records.length)+'</strong></div><div><span>این دستگاه</span><strong>ذخیرهٔ محلی</strong></div><div><span>آخرین بازبینی</span><strong>'+displayDate(todayISO())+'</strong></div></div>'+
    renderForm(view,data)+
    '<section class="module-list-panel"><div class="module-list-head"><div><h3>فهرست '+esc(spec.title)+'</h3><p>برای اصلاح هر ردیف از «ویرایش» استفاده کن.</p></div><div class="module-list-tools"><input type="search" data-module-search data-view="'+esc(view)+'" value="'+esc(searchStates[view]||'')+'" placeholder="جست‌وجو در فهرست" aria-label="جست‌وجو">'+
    (statusField?'<select data-module-filter data-view="'+esc(view)+'" aria-label="فیلتر وضعیت"><option value="all"'+(selectedFilter==='all'?' selected':'')+'>همه وضعیت‌ها</option>'+statusOptions(view).map(s=>'<option value="'+esc(s)+'"'+(selectedFilter===s?' selected':'')+'>'+esc(s)+'</option>').join('')+'</select>':'')+
    '</div></div><div class="module-bulk-tools"><label><input type="checkbox" data-module-select-all> انتخاب همه</label><button type="button" class="module-delete-btn" data-module-action="bulk-delete" data-view="'+esc(view)+'">حذف انتخاب‌شده‌ها</button><span>فیلتر «همه» برای نمایش تمام موارد در دسترس است.</span></div><div class="module-list-region">'+renderRecordTable(view,data)+'</div></section>'+
    '<div class="module-local-note"><strong>ذخیره‌سازی محلی:</strong> داده‌های واردشده در حافظهٔ همین مرورگر ذخیره می‌شوند. برای انتقال یا نگهداری نسخهٔ پشتیبان، از بخش تنظیمات نسخهٔ پشتیبان بگیر.</div></div>';
}
function statusPill(status){
  const s=String(status||'');
  let cls='module-tag';
  if(/آماده|انجام‌شده|تأییدشده|در حال کار/.test(s))cls+=' module-tag-ok';
  else if(/مرخصی|در انتظار|در جریان|سرویس|برای پیگیری/.test(s))cls+=' module-tag-warn';
  else if(/تعمیر|خارج از سرویس|لغو|ردشده|غیرفعال/.test(s))cls+=' module-tag-danger';
  return '<span class="'+cls+'">'+esc(s||'ثبت نشده')+'</span>';
}
function renderReports(section){
  const data=readData();
  const cards=knownDataKeys.map(k=>'<a class="module-report-card" href="./index.html?view='+esc(k)+'"><span>'+esc(moduleSpecs[k].title)+'</span><strong>'+faDigits(data[k].length)+'</strong><small>مشاهدهٔ اطلاعات ←</small></a>').join('');
  const activeEmployees=data.employees.filter(e=>e.status!=='غیرفعال').length;
  const openMissions=data.missions.filter(m=>m.status==='در جریان'||m.status==='برنامه‌ریزی‌شده').length;
  const dueMeters=data.gasmeters.filter(m=>m.calibrationEnd&&daysUntil(m.calibrationEnd)<=30).length;
  section.innerHTML='<div class="module-wrap"><div class="module-page-head"><div><span class="module-overline">ATLAS SHIFT / پایش اطلاعات</span><h2>گزارش‌ها و آمار</h2><p>گزارش پایه از داده‌هایی که در همین دستگاه ثبت شده‌اند؛ دادهٔ نمونه به آمار اضافه نمی‌شود.</p></div><div class="module-page-actions"><button class="secondary-btn" data-module-action="export-all" type="button">خروجی همهٔ اطلاعات</button><button class="primary-btn" data-module-action="print" type="button">چاپ گزارش</button></div></div>'+
    '<div class="module-metric-grid"><div><span>نیروی فعال</span><strong>'+faDigits(activeEmployees)+'</strong></div><div><span>مأموریت‌های باز</span><strong>'+faDigits(openMissions)+'</strong></div><div><span>گازسنج با موعد کالیبراسیون تا ۳۰ روز</span><strong>'+faDigits(dueMeters)+'</strong></div></div>'+
    '<section class="module-list-panel"><div class="module-list-head"><div><h3>خلاصهٔ پرونده‌ها</h3><p>برای مشاهده و ویرایش به بخش مربوطه برو.</p></div></div><div class="module-report-grid">'+cards+'</div></section>'+
    '<div class="module-local-note">گزارش‌های این صفحه فقط بر اساس اطلاعات ذخیره‌شده در این مرورگر محاسبه می‌شوند.</div></div>';
}
function daysUntil(iso){
  if(!iso)return Infinity;
  const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return Infinity;
  const target=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
  const now=new Date();now.setHours(0,0,0,0);target.setHours(0,0,0,0);
  return Math.round((target-now)/86400000);
}
function renderSettings(section){
  section.innerHTML='<div class="module-wrap"><div class="module-page-head"><div><span class="module-overline">ATLAS SHIFT / نگهداری اطلاعات</span><h2>تنظیمات برنامه</h2><p>ظاهر فعلی بدون تغییر باقی می‌ماند؛ این قسمت برای نگهداری و انتقال اطلاعات است.</p></div></div>'+
   '<section class="module-list-panel"><div class="module-list-head"><div><h3>پشتیبان‌گیری و بازیابی</h3><p>فایل پشتیبان شامل اطلاعات ثبت‌شده در تمام بخش‌های عملیاتی است.</p></div></div><div class="module-backup-grid"><div class="module-backup-card"><strong>ساخت نسخهٔ پشتیبان</strong><p>اطلاعات این دستگاه در یک فایل JSON قابل نگهداری و انتقال ذخیره می‌شود.</p><button type="button" class="primary-btn" data-module-action="backup">دریافت فایل پشتیبان</button></div><div class="module-backup-card"><strong>بازیابی از فایل</strong><p>با بازیابی، اطلاعات فعلی جایگزین اطلاعات داخل فایل پشتیبان خواهد شد.</p><button type="button" class="secondary-btn" data-module-action="restore-select">انتخاب فایل پشتیبان</button><input type="file" id="moduleRestoreFile" accept=".json,application/json" hidden></div></div></section>'+
   '<section class="module-list-panel"><div class="module-list-head"><div><h3>وضعیت نگهداری</h3><p>ذخیره‌سازی محلی و بدون نیاز به اینترنت در زمان استفاده.</p></div></div><div class="module-local-note">اطلاعات هر مرورگر مستقل است. پاک‌کردن داده‌های مرورگر ممکن است اطلاعات را حذف کند؛ نسخهٔ پشتیبان را در محل امن نگه‌دار. همگام‌سازی ابری در این نسخه فعال نیست.</div></section></div>';
}
function downloadFile(name,content,mime){
  const blob=new Blob([content],{type:mime||'application/octet-stream'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportCsv(view){
  const data=readData(),spec=moduleSpecs[view];
  const rows=[['شناسه',...spec.fields.map(f=>f.label)]];
  (data[view]||[]).forEach(r=>rows.push([r.id,...spec.fields.map(f=>String(r[f.key]||''))]));
  const csv='\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  downloadFile('ATLAS-SHIFT-'+view+'-'+todayISO()+'.csv',csv,'text/csv;charset=utf-8;');
}
function exportAllCsv(){
  const data=readData(),rows=[['بخش','شناسه','عنوان یا نام','وضعیت','تاریخ','شرح']];
  knownDataKeys.forEach(k=>data[k].forEach(r=>rows.push([moduleSpecs[k].title,r.id,r.fullName||r.title||r.name||r.code||'',r.status||'',r.date||r.startDate||'',r.notes||r.body||r.destination||''])));
  const csv='\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v||'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
  downloadFile('ATLAS-SHIFT-report-'+todayISO()+'.csv',csv,'text/csv;charset=utf-8;');
}
function exportBackup(){
  const payload={app:'ATLAS SHIFT',schemaVersion:1,exportedAt:new Date().toISOString(),data:readData()};
  downloadFile('ATLAS-SHIFT-backup-'+todayISO()+'.json',JSON.stringify(payload,null,2),'application/json;charset=utf-8');
  notify('فایل پشتیبان آماده شد.');
}
function doRestore(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=function(){
    try{
      const parsed=JSON.parse(String(reader.result||''));
      const candidate=parsed&&parsed.data?parsed.data:parsed;
      if(!candidate||!knownDataKeys.every(k=>Array.isArray(candidate[k])))throw new Error('invalid');
      if(!window.confirm('با بازیابی، اطلاعات فعلی با اطلاعات فایل جایگزین می‌شود. ادامه می‌دهی؟'))return;
      const clean=emptyData();
      knownDataKeys.forEach(k=>clean[k]=candidate[k].filter(x=>x&&typeof x==='object').map(x=>Object.assign({},x,{id:String(x.id||makeId())})));
      if(!saveData(clean))return;
      formStates.employees=null;
      renderDashboard();
      const section=document.getElementById('sectionView');
      const view=new URLSearchParams(window.location.search).get('view')||'dashboard';
      if(view!=='dashboard')render(view,section);
      notify('اطلاعات از نسخهٔ پشتیبان بازیابی شد.');
    }catch(e){notify('فایل انتخاب‌شده نسخهٔ پشتیبان معتبر ATLAS SHIFT نیست.')}
  };
  reader.readAsText(file);
}
function render(view,section){
  if(!section)return;
  if(view==='dashboard'){section.innerHTML='';renderDashboard();return}
  if(moduleSpecs[view]){renderCrudView(view,section);return}
  if(view==='reports'){renderReports(section);return}
  if(view==='settings'){renderSettings(section);return}
  section.innerHTML='<div class="module-wrap"><div class="module-empty">این بخش در نسخهٔ فعلی تعریف نشده است.</div></div>';
}
function renderDashboard(){
  const data=readData(),employees=data.employees,missions=data.missions,vehicles=data.vehicles,meters=data.gasmeters;
  const roster=document.querySelector('[data-widget="roster"]');
  if(roster){
    const count=(fn)=>employees.filter(fn).length;
    const total=employees.length,ready=count(e=>['آماده‌کار','در حال کار'].includes(e.status)),shift=count(e=>e.status==='شیفت'),mission=count(e=>e.status==='مأموریت'),leave=count(e=>e.status==='مرخصی');
    const num=roster.querySelector('.big-number');if(num)num.innerHTML=faDigits(total)+'<small>نفر ثبت‌شده</small>';
    const hint=roster.querySelector('.roster-top > div:first-child > div:last-child');if(hint)hint.textContent='تعداد پرونده‌های ثبت‌شده در برنامهٔ کاری';
    const stats=roster.querySelectorAll('.mini-stat .value');[ready,shift,mission,leave].forEach((n,i)=>{if(stats[i])stats[i].textContent=faDigits(n)});
    const pct=total?Math.round((ready+shift+mission)/total*100):0;
    const ring=roster.querySelector('.ring-label b');if(ring)ring.textContent=faDigits(pct)+'٪';
    const ringLabel=roster.querySelector('.ring-label span');if(ringLabel)ringLabel.textContent='فعال';
  }
  const coverage=document.querySelector('[data-widget="shift-coverage"]');
  if(coverage){
    const rows=coverage.querySelectorAll('.shift-line');
    const defs=[
      {label:'نیروی شیفتی',count:employees.filter(e=>e.employmentType==='شیفتی').length},
      {label:'نیروی روزکار',count:employees.filter(e=>e.employmentType==='روزکار').length},
      {label:'در مأموریت',count:employees.filter(e=>e.status==='مأموریت').length}
    ];
    const max=Math.max(1,...defs.map(x=>x.count));
    defs.forEach((x,i)=>{const row=rows[i];if(!row)return;const label=row.querySelector('.shift-line-top b'),value=row.querySelector('.shift-line-top span'),bar=row.querySelector('.progress-bar');if(label)label.textContent=x.label;if(value)value.textContent=faDigits(x.count)+' نفر';if(bar)bar.style.width=(x.count?Math.max(5,Math.round(x.count/max*100)):0)+'%'});
    const pill=coverage.querySelector('.widget-meta .status-pill');if(pill)pill.textContent='دادهٔ ثبت‌شده';
  }
  const missionWidget=document.querySelector('[data-widget="missions"]');
  if(missionWidget){
    const list=missionWidget.querySelector('.list'),pill=missionWidget.querySelector('.widget-meta .status-pill');
    if(pill)pill.textContent=faDigits(missions.length)+' مورد';
    if(list){
      const recent=missions.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,6);
      list.innerHTML=recent.length?recent.map((m,i)=>'<div class="list-item"><div class="route-mark"><b>'+esc((m.city||'—').slice(0,3))+'</b><span>مسیر '+faDigits(i+1)+'</span></div><div class="list-main"><b>'+esc(m.title||'مأموریت بدون عنوان')+'</b><span>'+esc([m.origin,m.destination,m.city].filter(Boolean).join(' ← '))+' · '+esc(m.crew||'بدون ثبت همکاران')+'</span></div><div class="list-side"><strong>'+esc(m.status||'ثبت نشده')+'</strong><span class="status-pill">'+displayDate(m.date)+'</span></div></div>').join(''):'<div class="module-empty">هنوز مأموریتی ثبت نشده است.</div>';
    }
  }
  const fleet=document.querySelector('[data-widget="fleet"]'),stack=fleet&&fleet.querySelector('.vehicle-stack');
  if(stack){
    stack.innerHTML=vehicles.length?vehicles.slice(0,6).map(v=>'<div class="vehicle"><div class="vehicle-icon"><span>▰</span></div><div class="vehicle-info"><b>'+esc(v.name||'خودرو بدون عنوان')+'</b><span>'+esc([v.currentCity,v.currentPlace,v.companyPlate].filter(Boolean).join(' · ')||'موقعیت ثبت نشده')+'</span></div><div class="vehicle-side"><b>'+esc(v.status||'ثبت نشده')+'</b><span>'+esc(v.policePlate||'')+'</span></div></div>').join(''):'<div class="module-empty">هنوز خودرویی ثبت نشده است.</div>';
  }
  const equipment=document.querySelector('[data-widget="equipment"]');
  if(equipment){
    const heading=equipment.querySelector('.widget-header');
    const header=equipment.querySelector('.widget-meta .status-pill');if(header)header.textContent=faDigits(meters.length)+' دستگاه';
    equipment.querySelectorAll('.equip-row,.module-equip-empty').forEach(node=>node.remove());
    const markup=meters.length?meters.slice(0,8).map(m=>{
      const remaining=daysUntil(m.calibrationEnd);
      const label=remaining<0?'منقضی':remaining<=30?'نزدیک موعد':(m.status||'معتبر');
      const classes=remaining<=30?'equip-status warn':'equip-status';
      const gas=(m.gases||'گازها ثبت نشده').split(',')[0].trim();
      const percent=remaining===Infinity?0:Math.max(5,Math.min(100,Math.round(remaining/90*100)));
      return '<div class="equip-row"><div class="equip-label"><div class="gas-chip">'+esc(gas.slice(0,6)||'GAS')+'</div><div><b>'+esc(m.code||m.serial||'گازسنج')+'</b><span>'+esc(m.serial||'')+' · '+esc(m.location||'محل ثبت نشده')+'<div class="progress-track"><div class="progress-bar" style="width:'+percent+'%"></div></div></span></div></div><span class="'+classes+'">'+esc(label)+'</span></div>';
    }).join(''):'<div class="module-empty module-equip-empty">هنوز گازسنجی ثبت نشده است.</div>';
    if(heading)heading.insertAdjacentHTML('afterend',markup);
  }
  const calendar=document.querySelector('[data-widget="calendar"]'),agenda=calendar&&calendar.querySelector('.agenda');
  if(agenda){
    const today=todayISO(),items=[];
    missions.filter(m=>m.date===today&&m.status!=='لغو‌شده').forEach(m=>items.push({kind:'مأموریت',title:m.title||'مأموریت',detail:[m.city,m.destination].filter(Boolean).join(' · '),date:m.date}));
    data.notes.filter(n=>(n.dueDate===today||n.date===today)&&n.status!=='انجام‌شده').forEach(n=>items.push({kind:'پیگیری',title:n.title||'یادداشت',detail:n.related||n.body||'',date:n.dueDate||n.date}));
    data.leaves.filter(l=>l.startDate===today&&l.status!=='ردشده').forEach(l=>items.push({kind:'مرخصی',title:fieldValue('leaves','employeeId',l.employeeId,data),detail:l.leaveType||'',date:l.startDate}));
    agenda.innerHTML=items.length?items.slice(0,6).map(x=>'<div class="agenda-row"><div class="agenda-time">'+esc(x.kind)+'</div><div class="agenda-dot"></div><div class="agenda-text"><b>'+esc(x.title)+'</b><span>'+esc(x.detail||'')+'</span></div></div>').join(''):'<div class="module-empty">برای امروز مأموریت یا پیگیری زمان‌بندی‌شده‌ای ثبت نشده است.</div>';
    const subtitle=calendar.querySelector('.widget-title p');if(subtitle)subtitle.textContent='برنامهٔ امروز بر اساس اطلاعات ثبت‌شده';
  }
  const alertsWidget=document.querySelector('[data-widget="alerts"]'),alertList=alertsWidget&&alertsWidget.querySelector('.alert-list');
  if(alertList){
    const existingButton=document.getElementById('seeAllAlerts'),alerts=[];
    meters.forEach(m=>{const n=daysUntil(m.calibrationEnd);if(n<=30)alerts.push({critical:n<=7,title:'موعد کالیبراسیون گازسنج',detail:(m.code||m.serial||'دستگاه')+' · '+(n<0?'مهلت گذشته':('تا '+faDigits(n)+' روز دیگر'))})});
    vehicles.filter(v=>['در تعمیر','خارج از سرویس'].includes(v.status)).forEach(v=>alerts.push({critical:true,title:'خودرو نیازمند رسیدگی',detail:(v.name||'خودرو')+' · '+v.status}));
    data.notes.filter(n=>n.dueDate&&daysUntil(n.dueDate)<0&&n.status!=='انجام‌شده').forEach(n=>alerts.push({critical:false,title:'پیگیری با موعد گذشته',detail:n.title||'یادداشت'}));
    alertList.innerHTML=alerts.length?alerts.slice(0,5).map(a=>'<div class="alert-item'+(a.critical?' critical':'')+'"><div class="alert-symbol">'+(a.critical?'!':'↗')+'</div><div class="alert-copy"><b>'+esc(a.title)+'</b><p>'+esc(a.detail)+'</p></div><span class="alert-age">'+(a.critical?'توجه':'پیگیری')+'</span></div>').join(''):'<div class="module-empty">هشدار عملیاتی ثبت‌شده‌ای وجود ندارد.</div>';
    if(existingButton)alertList.appendChild(existingButton);
  }
  const operations=document.querySelector('[data-widget="operations"]');
  if(operations){
    const chart=operations.querySelector('.chart'),legend=operations.querySelector('.chart-legend'),labels=operations.querySelector('.chart-labels');
    if(chart)chart.hidden=true;if(legend)legend.hidden=true;if(labels)labels.hidden=true;
    let summary=document.getElementById('operationsRealDataSummary');
    if(!summary){summary=document.createElement('div');summary.id='operationsRealDataSummary';summary.className='module-empty';if(chart)chart.insertAdjacentElement('afterend',summary);}
    const lastSeven=missions.filter(m=>m.date&&daysUntil(m.date)>=0&&daysUntil(m.date)<=6).length;
    summary.textContent='مأموریت‌های ثبت‌شده در ۷ روز اخیر: '+faDigits(lastSeven)+' مورد. با ثبت مأموریت‌ها، این آمار به‌روز می‌شود.';
  }
  const stationLabel=document.querySelector('[data-widget="stations"] .widget-meta');
  if(stationLabel&&stationLabel.querySelector('.status-pill'))stationLabel.querySelector('.status-pill').textContent='نمای ایستگاه‌ها';
  const foot=document.querySelector('.footnote');
  if(foot){
    const parts=foot.querySelectorAll('span');
    if(parts.length>1)parts[1].textContent='اطلاعات ثبت‌شده در همین دستگاه';
    if(parts.length>3)parts[3].textContent='ذخیره‌سازی محلی · بدون اتصال ابری';
  }
}
document.addEventListener('click',function(event){
  const button=event.target.closest('[data-module-action]');
  if(!button)return;
  const action=button.dataset.moduleAction,view=button.dataset.view||new URLSearchParams(window.location.search).get('view')||'dashboard';
  if(action==='new'||action==='edit'){
    event.preventDefault();
    formStates[view]={id:action==='edit'?button.dataset.id:null};
    const section=document.getElementById('sectionView');render(view,section);
    const form=section.querySelector('[data-module-form]');
    if(form)form.scrollIntoView({behavior:'smooth',block:'start'});
  }else if(action==='cancel'){
    delete formStates[view];render(view,document.getElementById('sectionView'));
  }else if(action==='delete'){
    const data=readData(),name=moduleSpecs[view].singular;
    if(!window.confirm('این '+name+' حذف شود؟'))return;
    data[view]=data[view].filter(x=>String(x.id)!==String(button.dataset.id));
    if(saveData(data)){render(view,document.getElementById('sectionView'));renderDashboard();notify('مورد حذف شد.')}
  }else if(action==='bulk-delete'){
    const section=document.getElementById('sectionView');
    const selected=[...section.querySelectorAll('[data-record-select]:checked')].map(x=>x.value);
    if(!selected.length){notify('ابتدا یک یا چند ردیف را انتخاب کن.');return}
    if(!window.confirm('تعداد '+faDigits(selected.length)+' مورد انتخاب‌شده حذف شود؟'))return;
    const data=readData();data[view]=data[view].filter(x=>!selected.includes(String(x.id)));
    if(saveData(data)){render(view,section);renderDashboard();notify('موارد انتخاب‌شده حذف شدند.')}
  }else if(action==='export'){exportCsv(view)}
  else if(action==='export-all'){exportAllCsv()}
  else if(action==='print'){window.print()}
  else if(action==='backup'){exportBackup()}
  else if(action==='restore-select'){const input=document.getElementById('moduleRestoreFile');if(input)input.click()}
});
document.addEventListener('submit',function(event){
  const form=event.target.closest('[data-module-form]');if(!form)return;
  event.preventDefault();
  const view=form.dataset.view,spec=moduleSpecs[view];if(!spec)return;
  const fd=new FormData(form),data=readData(),id=form.dataset.id;
  const record={id:id||makeId(),createdAt:'',updatedAt:new Date().toISOString()};
  if(id){const old=data[view].find(x=>String(x.id)===String(id));if(old)record.createdAt=old.createdAt||''}
  if(!record.createdAt)record.createdAt=record.updatedAt;
  spec.fields.forEach(f=>{record[f.key]=String(fd.get(f.key)||'').trim()});
  if(view==='leaves'&&record.startDate&&record.endDate&&record.endDate<record.startDate){notify('تاریخ پایان مرخصی نباید قبل از تاریخ شروع باشد.');return}
  if(view==='gasmeters'&&record.calibrationStart&&record.calibrationEnd&&record.calibrationEnd<record.calibrationStart){notify('پایان اعتبار کالیبراسیون نباید قبل از شروع آن باشد.');return}
  if(id)data[view]=data[view].map(x=>String(x.id)===String(id)?record:x);
  else data[view].push(record);
  if(!saveData(data))return;
  delete formStates[view];searchStates[view]=searchStates[view]||'';
  render(view,document.getElementById('sectionView'));renderDashboard();
  notify(id?'تغییرات ذخیره شد.':'اطلاعات جدید ثبت شد.');
});
document.addEventListener('input',function(event){
  const input=event.target;
  if(!input.matches('[data-module-search]'))return;
  const view=input.dataset.view,position=input.selectionStart;
  searchStates[view]=input.value;
  const section=document.getElementById('sectionView');render(view,section);
  const replacement=section.querySelector('[data-module-search]');
  if(replacement){replacement.focus();try{replacement.setSelectionRange(position,position)}catch(e){}}
});
document.addEventListener('change',function(event){
  const target=event.target;
  if(target.matches('[data-module-filter]')){
    filterStates[target.dataset.view]=target.value;render(target.dataset.view,document.getElementById('sectionView'));
  }else if(target.matches('[data-module-select-all]')){
    const section=document.getElementById('sectionView');
    section.querySelectorAll('[data-record-select]').forEach(box=>box.checked=target.checked);
    section.querySelectorAll('[data-module-select-all]').forEach(box=>box.checked=target.checked);
  }else if(target.id==='moduleRestoreFile'){
    const file=target.files&&target.files[0];if(file)doRestore(file);target.value='';
  }
});
window.ATLAS_MODULES={render:render,refreshDashboard:renderDashboard,getData:readData};
document.addEventListener('DOMContentLoaded',renderDashboard);
renderDashboard();
})();
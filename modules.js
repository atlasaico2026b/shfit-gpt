(function () {
  'use strict';

  const DB_NAME = 'ATLAS_SHIFT_LOCAL';
  const DB_VERSION = 1;
  const STORE_NAME = 'records';
  const STORE_KEY = 'main';
  const LEGACY_KEY = 'atlasShiftOperationalDataV1';
  const MODULES = ['employees', 'missions', 'leaves', 'vehicles', 'gasmeters', 'notes'];
  const formState = Object.create(null);
  const searchState = Object.create(null);
  const filterState = Object.create(null);
  let appData = createEmptyState();
  let db = null;
  let ready = false;
  let loadError = '';
  let reportPeriod = 'month';
  let reportFrom = '';
  let reportTo = '';
  let saveQueue = Promise.resolve();

  const specs = {
    employees: {
      title: 'کارکنان', singular: 'کارمند',
      subtitle: 'پروندهٔ پرسنلی، نوع کار، محل خدمت، شیفت و وضعیت روزانه',
      fields: [
        {key:'personnelId',label:'شمارهٔ پرسنلی'},
        {key:'fullName',label:'نام و نام خانوادگی',required:true},
        {key:'mobile',label:'شمارهٔ همراه',type:'tel'},
        {key:'jobTitle',label:'عنوان شغلی',required:true},
        {key:'workType',label:'نوع کار',type:'select',required:true,options:['شیفتی','روزکار']},
        {key:'employmentType',label:'نوع استخدام',type:'select',required:true,options:['رسمی','پیمانی','قراردادی','شرکتی','سایر']},
        {key:'workplace',label:'محل سازمانی',type:'select',required:true,options:['اهواز','آبادان','اندیمشک','ماهشهر','بندر امام','آغاجاری','سایر']},
        {key:'assignedWorkplace',label:'محل خدمت فعلی',placeholder:'ایستگاه، محدوده یا محل مأموریت'},
        {key:'shiftPattern',label:'الگوی شیفت',type:'select',options:['۱۲ ساعته روز/شب','۲۴/۴۸','ثابت روزکار','سایر']},
        {key:'status',label:'وضعیت جاری',type:'select',required:true,options:['آماده‌کار','در حال کار','شیفت','مأموریت','مرخصی','استراحت','اضافه‌کار','غیرفعال']},
        {key:'photo',label:'عکس پرسنلی',type:'file',accept:'image/*'},
        {key:'notes',label:'توضیحات',type:'textarea',wide:true}
      ],
      columns: ['personnelId','fullName','jobTitle','workType','employmentType','workplace','assignedWorkplace','status']
    },
    missions: {
      title: 'مأموریت‌ها', singular: 'مأموریت',
      subtitle: 'ثبت مسیر، افراد اعزامی، خودرو، زمان‌بندی و نتیجهٔ مأموریت',
      fields: [
        {key:'title',label:'عنوان مأموریت',required:true},
        {key:'missionType',label:'نوع فعالیت',type:'select',required:true,options:['نظارت بر جوشکاری','بررسی انشعاب یا نشتی','بررسی آلودگی خاک یا آب','بازدید ایستگاه','سرویس تجهیزات','بازدید ایمنی','سایر']},
        {key:'startAt',label:'زمان شروع',type:'jalali-datetime',required:true},
        {key:'endAt',label:'زمان پایان',type:'jalali-datetime'},
        {key:'city',label:'شهر یا محدوده',type:'select',required:true,options:['اهواز','آبادان','اندیمشک','ماهشهر','بندر امام','آغاجاری','سایر']},
        {key:'origin',label:'مبدأ'},
        {key:'destination',label:'مقصد یا محل عملیات'},
        {key:'stops',label:'توقف‌ها و نقاط مسیر',type:'textarea',wide:true,placeholder:'هر نقطه را در یک خط وارد کن'},
        {key:'crewIds',label:'افراد اعزامی',type:'select',source:'employees',multiple:true,wide:true},
        {key:'crewText',label:'شرح گروه یا افراد خارج از فهرست',type:'textarea',wide:true},
        {key:'driverId',label:'راننده',type:'select',source:'employees'},
        {key:'vehicleId',label:'خودرو',type:'select',source:'vehicles'},
        {key:'status',label:'وضعیت مأموریت',type:'select',required:true,options:['برنامه‌ریزی‌شده','در جریان','انجام‌شده','لغو‌شده']},
        {key:'result',label:'شرح کار و نتیجه',type:'textarea',wide:true},
        {key:'attachments',label:'پیوست گزارش',type:'file-multiple',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx'}
      ],
      columns: ['title','missionType','startAt','city','crewIds','vehicleId','status']
    },
    leaves: {
      title: 'مرخصی‌ها', singular: 'درخواست مرخصی',
      subtitle: 'ثبت مرخصی فردی یا گروهی، وضعیت درخواست و زمان بازگشت',
      fields: [
        {key:'employeeId',label:'کارمند',type:'select',source:'employees'},
        {key:'groupName',label:'گروه یا واحد',placeholder:'برای درخواست گروهی، نام گروه را وارد کن'},
        {key:'leaveType',label:'نوع مرخصی',type:'select',required:true,options:['استحقاقی','استعلاجی','بدون حقوق','ساعتی','سایر']},
        {key:'startDate',label:'از تاریخ شمسی',type:'jalali',required:true},
        {key:'endDate',label:'تا تاریخ شمسی',type:'jalali',required:true},
        {key:'expectedReturn',label:'بازگشت مورد انتظار',type:'jalali'},
        {key:'actualReturn',label:'تاریخ حضور واقعی',type:'jalali'},
        {key:'status',label:'وضعیت درخواست',type:'select',required:true,options:['در انتظار بررسی','تأییدشده','ردشده','استفاده‌شده']},
        {key:'reason',label:'دلیل و توضیحات',type:'textarea',wide:true}
      ],
      columns: ['employeeId','groupName','leaveType','startDate','endDate','expectedReturn','status']
    },
    vehicles: {
      title: 'خودروها', singular: 'خودرو',
      subtitle: 'مشخصات ناوگان، موقعیت فعلی، خرابی‌ها، کیلومتر و سرویس',
      fields: [
        {key:'name',label:'نام یا عنوان خودرو',required:true},
        {key:'vehicleType',label:'نوع خودرو',type:'select',options:['خودروی آتش‌نشانی','خودروی پشتیبانی','وانت','سواری','مینی‌بوس','سایر']},
        {key:'model',label:'مدل خودرو'},
        {key:'companyPlate',label:'پلاک سازمانی'},
        {key:'policePlate',label:'پلاک انتظامی'},
        {key:'status',label:'وضعیت عملیاتی',type:'select',required:true,options:['آماده','در سرویس','خارج از سرویس','در تعمیر']},
        {key:'healthStatus',label:'وضعیت سلامت',type:'select',options:['سالم','نیازمند بررسی','دارای نقص','در حال تعمیر']},
        {key:'currentCity',label:'شهر فعلی',type:'select',options:['اهواز','آبادان','اندیمشک','ماهشهر','بندر امام','آغاجاری','سایر']},
        {key:'currentPlace',label:'محل یا نقطهٔ استقرار'},
        {key:'occupants',label:'سرنشینان فعلی',type:'textarea',wide:true},
        {key:'currentKm',label:'کیلومتر فعلی',type:'number',min:0},
        {key:'fuelKm',label:'کیلومتر ثبت سوخت',type:'number',min:0},
        {key:'lastOilKm',label:'کیلومتر آخرین تعویض روغن',type:'number',min:0},
        {key:'nextOilKm',label:'کیلومتر سرویس روغن بعدی',type:'number',min:0},
        {key:'faults',label:'خرابی‌ها و نقص‌های باز',type:'textarea',wide:true},
        {key:'faultsResolved',label:'ایرادهای رفع‌شده',type:'textarea',wide:true},
        {key:'equipment',label:'تجهیزات همراه خودرو',type:'textarea',wide:true},
        {key:'notes',label:'سوابق و توضیحات',type:'textarea',wide:true},
        {key:'attachments',label:'پیوست‌ها',type:'file-multiple',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx'}
      ],
      columns: ['name','vehicleType','companyPlate','policePlate','status','currentCity','currentPlace','currentKm','nextOilKm']
    },
    gasmeters: {
      title: 'گازسنج‌ها', singular: 'گازسنج',
      subtitle: 'مشخصات دستگاه، محل و مسئول، کالیبراسیون، تعمیرات و گواهی',
      fields: [
        {key:'code',label:'کد دستگاه',required:true},
        {key:'model',label:'مدل دستگاه'},
        {key:'serial',label:'شمارهٔ سریال',required:true},
        {key:'gases',label:'گازهای قابل‌اندازه‌گیری',type:'checks',options:['CO','O₂','LEL','H₂S']},
        {key:'status',label:'وضعیت دستگاه',type:'select',required:true,options:['آماده استفاده','در کالیبراسیون','خارج از سرویس','در تعمیر']},
        {key:'healthStatus',label:'وضعیت سلامت',type:'select',options:['سالم','نیازمند بررسی','دارای نقص','در حال تعمیر']},
        {key:'location',label:'محل استقرار'},
        {key:'responsibleId',label:'مسئول دستگاه',type:'select',source:'employees'},
        {key:'calibrationStart',label:'شروع اعتبار کالیبراسیون',type:'jalali'},
        {key:'calibrationEnd',label:'پایان اعتبار کالیبراسیون',type:'jalali',required:true},
        {key:'calibrationDispatch',label:'تاریخ ارسال برای کالیبراسیون',type:'jalali'},
        {key:'calibrationReturn',label:'تاریخ برگشت از کالیبراسیون',type:'jalali'},
        {key:'certificateCode',label:'شمارهٔ گواهی کالیبراسیون'},
        {key:'certificateFiles',label:'گواهی و پیوست کالیبراسیون',type:'file-multiple',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx'},
        {key:'repairHistory',label:'تعمیرات و سوابق دستگاه',type:'textarea',wide:true},
        {key:'notes',label:'توضیحات',type:'textarea',wide:true}
      ],
      columns: ['code','model','serial','gases','status','location','calibrationEnd','responsibleId']
    },
    notes: {
      title: 'یادداشت‌ها و پیگیری‌ها', singular: 'اقدام / پیگیری',
      subtitle: 'نامه‌ها، خرید، استعلام، ارسال تجهیزات، بازرسی و اقدام‌های محوله',
      fields: [
        {key:'title',label:'عنوان',required:true},
        {key:'actionType',label:'نوع مورد',type:'select',required:true,options:['نامه اداری','درخواست خرید','استعلام','برآورد هزینه','پیگیری قطعه','ارسال تجهیزات','بازدید','بازرسی','ممیزی','اقدام اصلاحی','یادداشت عمومی','سایر']},
        {key:'date',label:'تاریخ ثبت شمسی',type:'jalali',required:true},
        {key:'dueDate',label:'موعد پیگیری شمسی',type:'jalali'},
        {key:'related',label:'موضوع یا محل مرتبط'},
        {key:'responsibleId',label:'مسئول پیگیری',type:'select',source:'employees'},
        {key:'status',label:'وضعیت',type:'select',required:true,options:['شروع‌نشده','در حال انجام','در انتظار پاسخ','ارجاع‌شده','تکمیل‌شده','لغوشده','عقب‌افتاده']},
        {key:'body',label:'شرح و نتیجهٔ پیگیری',type:'textarea',wide:true,required:true},
        {key:'attachments',label:'پیوست‌ها',type:'file-multiple',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx'}
      ],
      columns: ['title','actionType','date','dueDate','related','responsibleId','status']
    }
  };

  function createEmptyState() {
    const state = {
      schemaVersion: 2,
      settings: { employeeCustomFields: '' },
      references: { workplaces: ['اهواز','آبادان','اندیمشک','ماهشهر','بندر امام'] },
      history: [],
      updatedAt: ''
    };
    MODULES.forEach(function (key) { state[key] = []; });
    return state;
  }

  function normalizeState(value) {
    const out = createEmptyState();
    if (!value || typeof value !== 'object') return out;
    MODULES.forEach(function (key) {
      if (Array.isArray(value[key])) out[key] = value[key].filter(function (item) { return item && typeof item === 'object'; });
    });
    if (value.settings && typeof value.settings === 'object') out.settings = Object.assign(out.settings, value.settings);
    if (value.references && typeof value.references === 'object') out.references = Object.assign(out.references, value.references);
    if (Array.isArray(value.history)) out.history = value.history.slice(-3000);
    out.schemaVersion = 2;
    out.updatedAt = value.updatedAt || '';
    return out;
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function persianDigitsToLatin(value) {
    return String(value == null ? '' : value).replace(/[۰-۹٠-٩]/g, function (d) {
      const fa = '۰۱۲۳۴۵۶۷۸۹';
      const ar = '٠١٢٣٤٥٦٧٨٩';
      return String(fa.indexOf(d) >= 0 ? fa.indexOf(d) : ar.indexOf(d));
    });
  }

  function faDigits(value) {
    return String(value == null ? '' : value).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[Number(d)]; });
  }

  function toast(message) {
    const el = document.getElementById('toast');
    if (!el) { window.alert(message); return; }
    el.textContent = message;
    el.classList.add('show');
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(function () { el.classList.remove('show'); }, 2800);
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB unavailable')); return; }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
      request.onsuccess = function () {
        db = request.result;
        db.onversionchange = function () { db.close(); };
        resolve(db);
      };
      request.onerror = function () { reject(request.error || new Error('IndexedDB open failed')); };
      request.onblocked = function () { reject(new Error('IndexedDB upgrade blocked')); };
    });
  }

  function readLegacyLocalStorage() {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      return normalizeState(saved);
    } catch (error) {
      return null;
    }
  }

  function loadFromDb(database) {
    return new Promise(function (resolve, reject) {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(STORE_KEY);
      request.onsuccess = function () { resolve(request.result ? request.result.value : null); };
      request.onerror = function () { reject(request.error || new Error('Read failed')); };
    });
  }

  function writeToDb(database, value) {
    return new Promise(function (resolve, reject) {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ id: STORE_KEY, value: value });
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error || new Error('Write failed')); };
      tx.onabort = function () { reject(tx.error || new Error('Write aborted')); };
    });
  }

  async function initializeStorage() {
    const localCopy = readLegacyLocalStorage();
    try {
      await openDb();
      const saved = await loadFromDb(db);
      if (saved) {
        const databaseCopy = normalizeState(saved);
        const localIsNewer = !!(localCopy && localCopy.updatedAt &&
          (!databaseCopy.updatedAt || localCopy.updatedAt > databaseCopy.updatedAt));
        appData = localIsNewer ? localCopy : databaseCopy;
        if (localIsNewer) {
          try { await writeToDb(db, appData); }
          catch (writeError) { db = null; loadError = 'ذخیره‌سازی جایگزین مرورگر فعال شد.'; }
        }
      } else {
        appData = localCopy || createEmptyState();
        if (appData.updatedAt || MODULES.some(function (key) { return appData[key].length; })) {
          try { await writeToDb(db, appData); }
          catch (writeError) { db = null; loadError = 'ذخیره‌سازی جایگزین مرورگر فعال شد.'; }
        }
      }
    } catch (error) {
      loadError = 'فضای ذخیره‌سازی پیشرفته در دسترس نیست؛ ذخیره‌سازی جایگزین مرورگر استفاده می‌شود.';
      appData = localCopy || createEmptyState();
      db = null;
    }
    ready = true;
    refreshCurrentView();
    refreshDashboard();
  }

  function saveState() {
    appData.updatedAt = new Date().toISOString();
    saveQueue = saveQueue.then(async function () {
      if (db) {
        try {
          await writeToDb(db, appData);
          return true;
        } catch (error) {
          db = null;
          loadError = 'ذخیره‌سازی جایگزین مرورگر فعال شد.';
        }
      }
      try {
        localStorage.setItem(LEGACY_KEY, JSON.stringify(appData));
        return true;
      } catch (error) {
        toast('ذخیره انجام نشد؛ فضای ذخیره‌سازی این مرورگر کافی نیست.');
        return false;
      }
    });
    return saveQueue;
  }

  function addHistory(moduleKey, record, action, changes) {
    appData.history.push({
      id: createId(),
      module: moduleKey,
      recordId: record ? String(record.id) : '',
      recordLabel: recordLabel(moduleKey, record),
      action: action,
      at: new Date().toISOString(),
      changes: changes || []
    });
    if (appData.history.length > 3000) appData.history.splice(0, appData.history.length - 3000);
  }

  function createId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function todayIso() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function nowLocalDateTime() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function intlJalaliParts(date) {
    const formatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {year:'numeric',month:'numeric',day:'numeric'});
    const parts = formatter.formatToParts(date);
    const get = function (type) { return Number((parts.find(function (p) { return p.type === type; }) || {}).value || 0); };
    return { year:get('year'), month:get('month'), day:get('day') };
  }

  function jalaliYearStart(jy) {
    // Find the exact Gregorian day which Intl identifies as Farvardin 1 of jy.
    const gy = jy + 621;
    for (let offset = -3; offset <= 5; offset += 1) {
      const date = new Date(gy, 2, 20 + offset, 12, 0, 0, 0);
      const p = intlJalaliParts(date);
      if (p.year === jy && p.month === 1 && p.day === 1) return date;
    }
    throw new Error('تبدیل تقویم شمسی برای این سال در دسترس نیست.');
  }

  function parseJalali(value, withTime) {
    const raw = persianDigitsToLatin(value).trim();
    const re = withTime
      ? /^(\d{4})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{1,2})(?:\s+|T)(\d{1,2}):(\d{2})$/
      : /^(\d{4})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{1,2})$/;
    const m = raw.match(re);
    if (!m) return null;
    const jy = Number(m[1]), jm = Number(m[2]), jd = Number(m[3]);
    if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
    let hh = withTime ? Number(m[4]) : 12;
    let mm = withTime ? Number(m[5]) : 0;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    const first = jalaliYearStart(jy);
    const next = jalaliYearStart(jy + 1);
    let offset = jm <= 6 ? (jm - 1) * 31 + jd - 1 : 186 + (jm - 7) * 30 + jd - 1;
    const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + offset, hh, mm, 0, 0);
    const p = intlJalaliParts(date);
    if (p.year !== jy || p.month !== jm || p.day !== jd || date >= next && p.year !== jy) return null;
    if (withTime) {
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0') + 'T' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    }
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function toValidDate(value) {
    if (!value) return null;
    const raw = String(value);
    const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T12:00:00' : raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  function formatJalali(value, includeTime) {
    const date = toValidDate(value);
    if (!date) return value ? esc(value) : '—';
    const p = intlJalaliParts(date);
    let out = faDigits(p.year + '/' + String(p.month).padStart(2, '0') + '/' + String(p.day).padStart(2, '0'));
    if (includeTime) out += ' · ' + faDigits(String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0'));
    return out;
  }

  function displayDateTime(value) { return formatJalali(value, true); }

  function jalaliInputValue(value, withTime) {
    if (!value) {
      if (withTime) return formatJalali(nowLocalDateTime(), true);
      return formatJalali(todayIso(), false);
    }
    return formatJalali(value, withTime);
  }

  function dateInputToIso(value, type) {
    if (!value) return '';
    if (type === 'jalali') return parseJalali(value, false) || null;
    if (type === 'jalali-datetime') return parseJalali(value, true) || null;
    return value;
  }

  function dateInputHint(type) {
    return type === 'jalali-datetime' ? '۱۴۰۵/۰۷/۲۸ ۰۸:۳۰' : '۱۴۰۵/۰۷/۲۸';
  }

  function recordLabel(moduleKey, record) {
    if (!record) return specs[moduleKey] ? specs[moduleKey].singular : '';
    return record.fullName || record.title || record.name || record.code || record.personnelId || record.serial || specs[moduleKey].singular;
  }

  function fieldsFor(moduleKey) {
    const fields = specs[moduleKey].fields.slice();
    if (moduleKey === 'employees') {
      const custom = String(appData.settings.employeeCustomFields || '').split(/\r?\n/)
        .map(function (line) { return line.trim(); }).filter(Boolean).slice(0, 20);
      custom.forEach(function (label, index) {
        fields.push({ key:'customField' + (index + 1), label:label, custom:true, wide:false });
      });
    }
    return fields;
  }

  function getSelectOptions(field, data) {
    if (field.source === 'employees') {
      return data.employees.slice().sort(function (a, b) {
        return String(a.fullName || '').localeCompare(String(b.fullName || ''), 'fa');
      }).map(function (item) {
        return {value:item.id,label:(item.fullName || 'بدون نام') + (item.personnelId ? ' · ' + item.personnelId : '')};
      });
    }
    if (field.source === 'vehicles') {
      return data.vehicles.slice().sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''), 'fa');
      }).map(function (item) {
        return {value:item.id,label:(item.name || 'خودرو') + (item.companyPlate ? ' · ' + item.companyPlate : '')};
      });
    }
    return (field.options || []).map(function (option) { return {value:option,label:option}; });
  }

  function renderField(moduleKey, field, record, data) {
    const value = record && record[field.key] != null ? record[field.key] : (field.custom && record && record.customFields ? record.customFields[field.key] : '');
    const id = 'atlas-field-' + moduleKey + '-' + field.key;
    const required = field.required ? ' required' : '';
    const label = '<span>' + esc(field.label) + (field.required ? ' <i>*</i>' : '') + '</span>';
    let control = '';
    if (field.type === 'select') {
      const options = getSelectOptions(field, data);
      control = '<select id="' + esc(id) + '" name="' + esc(field.key) + '"' + (field.multiple ? ' multiple size="4"' : '') + required + '>' +
        (field.multiple ? '' : '<option value="">انتخاب کنید</option>') +
        options.map(function (option) {
          const selected = Array.isArray(value) ? value.map(String).includes(String(option.value)) : String(value) === String(option.value);
          return '<option value="' + esc(option.value) + '"' + (selected ? ' selected' : '') + '>' + esc(option.label) + '</option>';
        }).join('') + '</select>' +
        (field.multiple ? '<small class="module-field-hint">برای انتخاب چند نفر، کلید Ctrl را نگه‌دار؛ در موبایل انتخاب چندتایی را از فهرست انجام بده.</small>' : '');
    } else if (field.type === 'textarea') {
      control = '<textarea id="' + esc(id) + '" name="' + esc(field.key) + '" rows="3"' + required + ' placeholder="' + esc(field.placeholder || '') + '">' + esc(value) + '</textarea>';
    } else if (field.type === 'checks') {
      const selected = Array.isArray(value) ? value : String(value || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      control = '<div class="module-check-options">' + field.options.map(function (option) {
        return '<label><input type="checkbox" name="' + esc(field.key) + '" value="' + esc(option) + '"' + (selected.includes(option) ? ' checked' : '') + '><span>' + esc(option) + '</span></label>';
      }).join('') + '</div>';
    } else if (field.type === 'file' || field.type === 'file-multiple') {
      const multiple = field.type === 'file-multiple';
      control = '<input id="' + esc(id) + '" name="' + esc(field.key) + '" type="file" accept="' + esc(field.accept || '*/*') + '"' + (multiple ? ' multiple' : '') + '>' +
        (value && (!Array.isArray(value) || value.length) ? '<small class="module-field-hint">پیوست قبلی حفظ می‌شود مگر اینکه پیوست جدید انتخاب کنی.</small>' : '');
      if (field.key === 'photo' && value) {
        control += '<img src="' + esc(value) + '" alt="تصویر پرسنلی فعلی" style="width:76px;height:76px;object-fit:cover;border-radius:12px;margin-top:8px">';
      }
      if (multiple && Array.isArray(value) && value.length) {
        control += '<small class="module-field-hint">پیوست‌های فعلی: ' + faDigits(value.length) + ' مورد</small>';
      }
    } else if (field.type === 'jalali' || field.type === 'jalali-datetime') {
      const withTime = field.type === 'jalali-datetime';
      const shownDate = value ? jalaliInputValue(value, withTime) : (field.required ? jalaliInputValue('', withTime) : '');
      control = '<input id="' + esc(id) + '" name="' + esc(field.key) + '" type="text" inputmode="text" autocomplete="off"' + required +
        ' value="' + esc(shownDate) +
        '" placeholder="' + dateInputHint(field.type) + '" data-jalali-input="' + esc(field.type) + '">' +
        '<small class="module-field-hint">تاریخ شمسی؛ نمونه: ' + dateInputHint(field.type) + '</small>';
    } else {
      const type = field.type || 'text';
      control = '<input id="' + esc(id) + '" name="' + esc(field.key) + '" type="' + esc(type) + '"' +
        (field.min != null ? ' min="' + esc(field.min) + '"' : '') + required +
        ' value="' + esc(value) + '" placeholder="' + esc(field.placeholder || '') + '" autocomplete="off">';
    }
    return '<label class="module-field' + (field.wide ? ' module-field-wide' : '') + '" for="' + esc(id) + '">' + label + control + '</label>';
  }

  function rootWrap(content) {
    return '<div class="module-wrap" style="display:flex;flex-direction:column;gap:16px;width:100%;max-width:none;min-width:0">' + content + '</div>';
  }

  function prepareSection(section) {
    if (!section) return;
    section.hidden = false;
    section.style.display = 'block';
    section.style.width = '100%';
    section.style.maxWidth = 'none';
    section.style.minWidth = '0';
    section.style.gridTemplateColumns = 'none';
    section.style.gridColumn = 'auto';
    section.style.overflow = 'visible';
  }

  function pageHead(title, subtitle, actions) {
    return '<div class="module-page-head" style="width:100%;min-width:0"><div><span class="module-overline">ATLAS SHIFT / مدیریت عملیات</span>' +
      '<h2>' + esc(title) + '</h2><p>' + esc(subtitle) + '</p></div><div class="module-page-actions">' + actions + '</div></div>';
  }

  function renderForm(moduleKey, data) {
    const state = formState[moduleKey];
    if (!state || !state.open) return '';
    const existing = state.id ? (data[moduleKey] || []).find(function (item) { return String(item.id) === String(state.id); }) : null;
    const fields = fieldsFor(moduleKey);
    const fileNotice = '<p class="module-field-hint">فایل‌ها در حافظهٔ محلی برنامه ذخیره می‌شوند؛ اندازهٔ هر فایل بهتر است کمتر از ۱۰ مگابایت باشد.</p>';
    return '<section class="module-form-panel" style="width:100%;min-width:0"><div class="module-form-head"><div><h3>' +
      (existing ? 'ویرایش ' : 'ثبت ') + esc(specs[moduleKey].singular) + '</h3><p>پس از ذخیره، اطلاعات به فهرست، داشبورد و گزارش‌های مرتبط منتقل می‌شود.</p></div>' +
      '<button type="button" class="secondary-btn" data-module-action="cancel" data-view="' + esc(moduleKey) + '">بستن فرم</button></div>' +
      '<form class="module-form" data-module-form data-view="' + esc(moduleKey) + '" data-id="' + esc(existing ? existing.id : '') + '">' +
      '<div class="module-fields">' + fields.map(function (field) { return renderField(moduleKey, field, existing, data); }).join('') + '</div>' +
      fileNotice +
      '<div class="module-form-actions"><span class="module-required-help">موارد دارای * ضروری هستند.</span><div>' +
      '<button type="button" class="secondary-btn" data-module-action="cancel" data-view="' + esc(moduleKey) + '">انصراف</button> ' +
      '<button type="submit" class="primary-btn">' + (existing ? 'ذخیرهٔ تغییرات' : 'ثبت ' + esc(specs[moduleKey].singular)) + '</button></div></div></form></section>';
  }

  function displayValue(moduleKey, fieldKey, value, data) {
    if (value == null || value === '') return '—';
    const field = fieldsFor(moduleKey).find(function (item) { return item.key === fieldKey; });
    if (field && (field.type === 'jalali' || field.type === 'date')) return formatJalali(value, false);
    if (field && field.type === 'jalali-datetime') return formatJalali(value, true);
    if (field && field.source === 'employees') {
      const findName = function (id) {
        const item = data.employees.find(function (person) { return String(person.id) === String(id); });
        return item ? item.fullName || item.personnelId || 'کارمند' : id;
      };
      return esc(Array.isArray(value) ? value.map(findName).join('، ') : findName(value));
    }
    if (field && field.source === 'vehicles') {
      const item = data.vehicles.find(function (vehicle) { return String(vehicle.id) === String(value); });
      return esc(item ? (item.name || 'خودرو') + (item.companyPlate ? ' · ' + item.companyPlate : '') : value);
    }
    if (field && (field.type === 'file' || field.type === 'file-multiple')) {
      const count = Array.isArray(value) ? value.length : (value ? 1 : 0);
      return count ? 'پیوست (' + faDigits(count) + ')' : '—';
    }
    if (field && field.type === 'checks' && Array.isArray(value)) return esc(value.join('، '));
    if (field && field.type === 'number') return faDigits(value);
    return esc(Array.isArray(value) ? value.join('، ') : value);
  }

  function searchMatch(moduleKey, record, data) {
    const term = String(searchState[moduleKey] || '').trim().toLocaleLowerCase();
    const wantedStatus = filterState[moduleKey] || 'all';
    if (wantedStatus !== 'all' && String(record.status || '') !== wantedStatus) return false;
    if (!term) return true;
    const values = fieldsFor(moduleKey).filter(function(field){return field.type!=='file'&&field.type!=='file-multiple';}).map(function (field) {
      let value = field.custom && record.customFields ? record.customFields[field.key] : record[field.key];
      return field.label + ' ' + (Array.isArray(value) ? value.join(' ') : String(value == null ? '' : value));
    }).join(' ').toLocaleLowerCase();
    const related = (data.employees || []).filter(function (item) { return String(record.crewIds || '').includes(String(item.id)); }).map(function (item) { return item.fullName; }).join(' ');
    return (values + ' ' + related).toLocaleLowerCase().includes(term);
  }

  function recordsForView(moduleKey, data) {
    return (data[moduleKey] || []).filter(function (record) { return searchMatch(moduleKey, record, data); }).slice().sort(function (a, b) {
      return String(b.updatedAt || b.createdAt || b.startAt || b.startDate || b.date || '').localeCompare(
        String(a.updatedAt || a.createdAt || a.startAt || a.startDate || a.date || '')
      );
    });
  }

  function statusOptions(moduleKey) {
    const field = specs[moduleKey].fields.find(function (item) { return item.key === 'status' && item.type === 'select'; });
    return field ? field.options : [];
  }

  function renderStatusFilter(moduleKey) {
    if (!statusOptions(moduleKey).length) return '';
    const selected = filterState[moduleKey] || 'all';
    return '<select data-module-filter data-view="' + esc(moduleKey) + '" aria-label="فیلتر وضعیت"><option value="all"' +
      (selected === 'all' ? ' selected' : '') + '>همه وضعیت‌ها</option>' +
      statusOptions(moduleKey).map(function (item) {
        return '<option value="' + esc(item) + '"' + (selected === item ? ' selected' : '') + '>' + esc(item) + '</option>';
      }).join('') + '</select>';
  }

  function renderHistoryButton(moduleKey, record) {
    const hasHistory = appData.history.some(function (item) { return item.module === moduleKey && item.recordId === String(record.id); });
    return hasHistory ? '<button type="button" class="secondary-btn" data-module-action="history" data-view="' + esc(moduleKey) + '" data-id="' + esc(record.id) + '">سوابق</button> ' : '';
  }

  function renderTable(moduleKey, data) {
    const columns = specs[moduleKey].columns;
    const records = recordsForView(moduleKey, data);
    if (!records.length) {
      return '<div class="module-empty">' + ((data[moduleKey] || []).length ?
        'موردی مطابق جست‌وجو یا فیلتر پیدا نشد.' :
        'هنوز اطلاعاتی ثبت نشده است. برای شروع روی «ثبت مورد جدید» بزن.') + '</div>';
    }
    return '<div class="module-table-wrap" style="width:100%;max-width:100%;min-width:0"><table class="module-table"><thead><tr>' +
      '<th class="module-check-cell"><input type="checkbox" data-module-select-all aria-label="انتخاب همهٔ ردیف‌ها"></th>' +
      columns.map(function (key) {
        const field = fieldsFor(moduleKey).find(function (item) { return item.key === key; });
        return '<th>' + esc(field ? field.label : key) + '</th>';
      }).join('') + '<th>عملیات</th></tr></thead><tbody>' +
      records.map(function (record) {
        return '<tr><td class="module-check-cell"><input type="checkbox" data-record-select value="' + esc(record.id) + '" aria-label="انتخاب ردیف"></td>' +
          columns.map(function (key) {
            const value = fieldsFor(moduleKey).find(function (field) { return field.key === key && field.custom; }) && record.customFields
              ? record.customFields[key] : record[key];
            return '<td>' + (moduleKey==='employees'&&key==='status' ? esc(effectiveEmployeeStatus(record)) : displayValue(moduleKey, key, value, data)) + '</td>';
          }).join('') +
          '<td class="module-row-actions">' + renderHistoryButton(moduleKey, record) +
          '<button type="button" class="secondary-btn" data-module-action="edit" data-view="' + esc(moduleKey) + '" data-id="' + esc(record.id) + '">ویرایش</button> ' +
          '<button type="button" class="module-delete-btn" data-module-action="delete" data-view="' + esc(moduleKey) + '" data-id="' + esc(record.id) + '">حذف</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderCrud(moduleKey, section) {
    const data = appData;
    const records = data[moduleKey] || [];
    const existing = records.length;
    const actions = '<button class="secondary-btn" type="button" data-module-action="export" data-view="' + esc(moduleKey) + '">خروجی CSV</button>' +
      '<button class="primary-btn" type="button" data-module-action="new" data-view="' + esc(moduleKey) + '">＋ ثبت مورد جدید</button>';
    section.innerHTML = rootWrap(
      pageHead(specs[moduleKey].title, specs[moduleKey].subtitle, actions) +
      '<div class="module-summary" style="width:100%"><div><span>تعداد کل</span><strong>' + faDigits(existing) + '</strong></div>' +
      '<div><span>ذخیره‌سازی</span><strong>محلی و آفلاین</strong></div><div><span>آخرین به‌روزرسانی</span><strong>' + (data.updatedAt ? displayDateTime(data.updatedAt) : '—') + '</strong></div></div>' +
      renderForm(moduleKey, data) +
      '<section class="module-list-panel" style="width:100%;min-width:0"><div class="module-list-head"><div><h3>فهرست ' + esc(specs[moduleKey].title) + '</h3><p>جست‌وجو، فیلتر، انتخاب چند ردیف و ویرایش از همین بخش انجام می‌شود.</p></div>' +
      '<div class="module-list-tools"><input type="search" data-module-search data-view="' + esc(moduleKey) + '" value="' + esc(searchState[moduleKey] || '') + '" placeholder="جست‌وجو در فهرست" aria-label="جست‌وجو">' + renderStatusFilter(moduleKey) + '</div></div>' +
      '<div class="module-bulk-tools"><label><input type="checkbox" data-module-select-all> انتخاب همه</label><button type="button" class="module-delete-btn" data-module-action="bulk-delete" data-view="' + esc(moduleKey) + '">حذف انتخاب‌شده‌ها</button>' +
      '<span data-module-result-count>' + faDigits(recordsForView(moduleKey, data).length) + ' مورد از ' + faDigits(existing) + '</span></div>' +
      '<div data-module-list-region>' + renderTable(moduleKey, data) + '</div></section>' +
      '<div class="module-local-note"><strong>ذخیره‌سازی محلی:</strong> اطلاعات در همین دستگاه ذخیره می‌شوند. برای انتقال دستگاه، از بخش تنظیمات نسخهٔ پشتیبان تهیه کن.</div>'
    );
  }

  function parseDateValue(value) {
    if (!value) return null;
    const raw = String(value);
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T12:00:00' : raw);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function dueInDays(value) {
    const target = parseDateValue(value);
    if (!target) return Infinity;
    const now = parseDateValue(todayIso());
    return Math.round((target.getTime() - now.getTime()) / 86400000);
  }

  function alertsForData() {
    const alerts = [];
    appData.gasmeters.forEach(function (meter) {
      const left = dueInDays(meter.calibrationEnd);
      if (left <= 30) alerts.push({
        key:'meter-' + meter.id, critical:left <= 7,
        title:'موعد کالیبراسیون گازسنج',
        detail:(meter.code || meter.serial || 'دستگاه') + ' · ' + (left < 0 ? 'مهلت گذشته' : 'تا ' + faDigits(left) + ' روز دیگر'),
        at:meter.calibrationEnd
      });
    });
    appData.vehicles.forEach(function (vehicle) {
      if (['در تعمیر','خارج از سرویس'].includes(vehicle.status) || vehicle.healthStatus === 'دارای نقص') {
        alerts.push({key:'vehicle-' + vehicle.id,critical:true,title:'خودرو نیازمند رسیدگی',detail:(vehicle.name || 'خودرو') + ' · ' + (vehicle.status || vehicle.healthStatus || ''),at:vehicle.updatedAt});
      }
      const km = Number(vehicle.currentKm), next = Number(vehicle.nextOilKm);
      if (Number.isFinite(km) && Number.isFinite(next) && next > 0 && next - km <= 500) {
        alerts.push({key:'oil-' + vehicle.id,critical:next <= km,title:'سررسید سرویس روغن',detail:(vehicle.name || 'خودرو') + ' · ' + (next <= km ? 'موعد گذشته' : faDigits(next - km) + ' کیلومتر مانده'),at:vehicle.updatedAt});
      }
    });
    appData.notes.forEach(function (note) {
      const left = dueInDays(note.dueDate);
      if (note.dueDate && left < 0 && !['تکمیل‌شده','لغوشده'].includes(note.status)) {
        alerts.push({key:'note-' + note.id,critical:false,title:'پیگیری با موعد گذشته',detail:note.title || 'پیگیری',at:note.dueDate});
      }
    });
    return alerts.sort(function (a,b) { return Number(b.critical)-Number(a.critical); });
  }

  function effectiveEmployeeStatus(employee) {
    const today = todayIso();
    const approvedLeave = appData.leaves.some(function(leave) {
      return String(leave.employeeId||'')===String(employee.id) &&
        ['تأییدشده','استفاده‌شده'].includes(leave.status) &&
        String(leave.startDate||'')<=today && String(leave.endDate||'')>=today;
    });
    if (approvedLeave) return 'مرخصی';
    const activeMission = appData.missions.some(function(mission) {
      const crew = Array.isArray(mission.crewIds) ? mission.crewIds.map(String) : [];
      return crew.includes(String(employee.id)) && mission.status==='در جریان' &&
        String(mission.startAt||'').slice(0,10)<=today &&
        (!mission.endAt || String(mission.endAt).slice(0,10)>=today);
    });
    if (activeMission) return 'مأموریت';
    return employee.status || 'ثبت نشده';
  }

  function refreshDashboard() {
    if (!ready) return;
    const staff = appData.employees;
    const missions = appData.missions;
    const vehicles = appData.vehicles;
    const meters = appData.gasmeters;
    const count = function (fn) { return staff.filter(fn).length; };
    const roster = document.querySelector('[data-widget="roster"]');
    if (roster) {
      const total = staff.length;
      const statusOf = function(e){return effectiveEmployeeStatus(e);};
      const active = count(function (e) { return ['آماده‌کار','در حال کار','شیفت','مأموریت'].includes(statusOf(e)); });
      const values = [active,count(function(e){return statusOf(e) === 'شیفت';}),count(function(e){return statusOf(e) === 'مأموریت';}),count(function(e){return statusOf(e) === 'مرخصی';})];
      const number = roster.querySelector('.big-number');
      if (number) number.innerHTML = faDigits(total) + '<small>نفر ثبت‌شده</small>';
      const stats = roster.querySelectorAll('.mini-stat .value');
      values.forEach(function (value,index) { if(stats[index]) stats[index].textContent = faDigits(value); });
      const ring = roster.querySelector('.ring-label b');
      if (ring) ring.textContent = faDigits(total ? Math.round(active / total * 100) : 0) + '٪';
      const ringLabel = roster.querySelector('.ring-label span');
      if (ringLabel) ringLabel.textContent = 'فعال';
    }

    const shift = document.querySelector('[data-widget="shift-coverage"]');
    if (shift) {
      const rows = shift.querySelectorAll('.shift-line');
      const stats = [
        {label:'نیروی شیفتی',value:count(function(e){return e.workType === 'شیفتی';})},
        {label:'نیروی روزکار',value:count(function(e){return e.workType === 'روزکار';})},
        {label:'در مأموریت',value:count(function(e){return effectiveEmployeeStatus(e) === 'مأموریت';})}
      ];
      const max = Math.max(1,stats[0].value,stats[1].value,stats[2].value);
      stats.forEach(function (item,index) {
        const row=rows[index];if(!row)return;
        const title=row.querySelector('.shift-line-top b'),value=row.querySelector('.shift-line-top span'),bar=row.querySelector('.progress-bar');
        if(title)title.textContent=item.label;
        if(value)value.textContent=faDigits(item.value)+' نفر';
        if(bar)bar.style.width=(item.value?Math.max(5,Math.round(item.value/max*100)):0)+'%';
      });
      const badge=shift.querySelector('.widget-meta .status-pill');if(badge)badge.textContent='دادهٔ ثبت‌شده';
    }

    const missionWidget=document.querySelector('[data-widget="missions"]');
    if(missionWidget){
      const list=missionWidget.querySelector('.list'),badge=missionWidget.querySelector('.widget-meta .status-pill');
      if(badge)badge.textContent=faDigits(missions.length)+' مورد';
      if(list){
        const recent=missions.slice().sort(function(a,b){return String(b.startAt||'').localeCompare(String(a.startAt||''));}).slice(0,6);
        list.innerHTML=recent.length?recent.map(function(m,index){
          const names=(m.crewIds||[]).map(function(id){const person=staff.find(function(e){return String(e.id)===String(id)});return person?person.fullName:''}).filter(Boolean);
          const crew=[names.join('، '),m.crewText].filter(Boolean).join('؛ ');
          return '<div class="list-item"><div class="route-mark"><b>'+esc((m.city||'—').slice(0,3))+'</b><span>مسیر '+faDigits(index+1)+'</span></div><div class="list-main"><b>'+esc(m.title||'مأموریت')+'</b><span>'+esc([m.origin,m.destination,m.city].filter(Boolean).join(' ← '))+' · '+esc(crew||'گروه ثبت نشده')+'</span></div><div class="list-side"><strong>'+esc(m.status||'ثبت نشده')+'</strong><span class="status-pill">'+formatJalali(m.startAt,true)+'</span></div></div>';
        }).join(''):'<div class="module-empty">هنوز مأموریتی ثبت نشده است.</div>';
      }
    }

    const fleet=document.querySelector('[data-widget="fleet"]'),stack=fleet&&fleet.querySelector('.vehicle-stack');
    if(stack){
      stack.innerHTML=vehicles.length?vehicles.slice(0,6).map(function(v){
        return '<div class="vehicle"><div class="vehicle-icon"><span>▰</span></div><div class="vehicle-info"><b>'+esc(v.name||'خودرو')+'</b><span>'+esc([v.currentCity,v.currentPlace,v.companyPlate].filter(Boolean).join(' · ')||'موقعیت ثبت نشده')+'</span></div><div class="vehicle-side"><b>'+esc(v.status||'ثبت نشده')+'</b><span>'+esc(v.policePlate||'')+'</span></div></div>';
      }).join(''):'<div class="module-empty">هنوز خودرویی ثبت نشده است.</div>';
    }

    const equipment=document.querySelector('[data-widget="equipment"]');
    if(equipment){
      const badge=equipment.querySelector('.widget-meta .status-pill');if(badge)badge.textContent=faDigits(meters.length)+' دستگاه';
      equipment.querySelectorAll('.equip-row,.module-equip-empty').forEach(function(node){node.remove();});
      const heading=equipment.querySelector('.widget-header');
      const markup=meters.length?meters.slice(0,8).map(function(m){
        const left=dueInDays(m.calibrationEnd);
        const label=left<0?'منقضی':left<=30?'نزدیک موعد':(m.status||'معتبر');
        const percent=left===Infinity?0:Math.max(5,Math.min(100,Math.round(left/90*100)));
        const gases=Array.isArray(m.gases)?m.gases.join(', '):String(m.gases||'گاز ثبت نشده');
        return '<div class="equip-row"><div class="equip-label"><div class="gas-chip">'+esc(gases.slice(0,6)||'GAS')+'</div><div><b>'+esc(m.code||m.serial||'گازسنج')+'</b><span>'+esc(m.serial||'')+' · '+esc(m.location||'محل ثبت نشده')+'<div class="progress-track"><div class="progress-bar" style="width:'+percent+'%"></div></div></span></div></div><span class="equip-status'+(left<=30?' warn':'')+'">'+esc(label)+'</span></div>';
      }).join(''):'<div class="module-empty module-equip-empty">هنوز گازسنجی ثبت نشده است.</div>';
      if(heading)heading.insertAdjacentHTML('afterend',markup);
    }

    const calendar=document.querySelector('[data-widget="calendar"]'),agenda=calendar&&calendar.querySelector('.agenda');
    if(calendar){
      const now=new Date(), dayParts=intlJalaliParts(now);
      const day=calendar.querySelector('#persianDay');if(day)day.textContent=faDigits(dayParts.day);
      const month=calendar.querySelector('#persianMonth');
      if(month){try{month.textContent=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{month:'long',year:'numeric'}).format(now)}catch(error){}}
      const weekday=calendar.querySelector('#weekDay');
      if(weekday)weekday.textContent=new Intl.DateTimeFormat('fa-IR',{weekday:'long'}).format(now);
    }
    if(agenda){
      const today=todayIso(),items=[];
      missions.filter(function(m){return String(m.startAt||'').slice(0,10)===today&&m.status!=='لغو‌شده';}).forEach(function(m){items.push({time:String(m.startAt||'').slice(11,16),type:'مأموریت',title:m.title||'مأموریت',detail:[m.city,m.destination].filter(Boolean).join(' · ')});});
      appData.notes.filter(function(n){return (n.dueDate===today||n.date===today)&&!['تکمیل‌شده','لغوشده'].includes(n.status);}).forEach(function(n){items.push({time:'',type:'پیگیری',title:n.title||'پیگیری',detail:n.related||n.body||''});});
      appData.leaves.filter(function(l){return l.startDate===today&&l.status!=='ردشده';}).forEach(function(l){const person=staff.find(function(e){return String(e.id)===String(l.employeeId)});items.push({time:'',type:'مرخصی',title:person?person.fullName:(l.groupName||'مرخصی'),detail:l.leaveType||''});});
      agenda.innerHTML=items.length?items.slice(0,6).map(function(item){return '<div class="agenda-row"><div class="agenda-time">'+esc(item.time||item.type)+'</div><div class="agenda-dot"></div><div class="agenda-text"><b>'+esc(item.title)+'</b><span>'+esc(item.detail||item.type)+'</span></div></div>';}).join(''):'<div class="module-empty">برای امروز مأموریت یا پیگیری زمان‌بندی‌شده‌ای ثبت نشده است.</div>';
      const p=calendar.querySelector('.widget-title p');if(p)p.textContent='برنامهٔ امروز بر اساس اطلاعات ثبت‌شده';
    }

    const alerts=alertsForData();
    const alertsWidget=document.querySelector('[data-widget="alerts"]'),alertList=alertsWidget&&alertsWidget.querySelector('.alert-list');
    if(alertList){
      const existingButton=document.getElementById('seeAllAlerts');
      alertList.innerHTML=alerts.length?alerts.slice(0,5).map(function(a){return '<div class="alert-item'+(a.critical?' critical':'')+'"><div class="alert-symbol">'+(a.critical?'!':'↗')+'</div><div class="alert-copy"><b>'+esc(a.title)+'</b><p>'+esc(a.detail)+'</p></div><span class="alert-age">'+(a.critical?'توجه':'پیگیری')+'</span></div>';}).join(''):'<div class="module-empty">هشدار عملیاتی ثبت‌شده‌ای وجود ندارد.</div>';
      if(existingButton)alertList.appendChild(existingButton);
      const count=document.getElementById('notificationCount');if(count)count.textContent=faDigits(alerts.length);
    }
    const notificationList=document.getElementById('noticeList');
    if(notificationList){
      const drawerButton=document.getElementById('seeAllAlerts');
      notificationList.innerHTML=alerts.length?alerts.map(function(a){return '<div class="notice-card'+(a.critical?' unread':'')+'"><div class="notice-icon">'+(a.critical?'!':'↗')+'</div><div><b>'+esc(a.title)+'</b><p>'+esc(a.detail)+'</p></div></div>';}).join(''):'<div class="module-empty">اعلان تازه‌ای وجود ندارد.</div>';
    }
    const operations=document.querySelector('[data-widget="operations"]');
    if(operations){
      const chart=operations.querySelector('.chart'),legend=operations.querySelector('.chart-legend'),labels=operations.querySelector('.chart-labels');
      if(chart)chart.hidden=true;if(legend)legend.hidden=true;if(labels)labels.hidden=true;
      let summary=document.getElementById('operationsRealDataSummary');
      if(!summary){summary=document.createElement('div');summary.id='operationsRealDataSummary';summary.className='module-empty';if(chart)chart.insertAdjacentElement('afterend',summary);}
      const lastSeven=missions.filter(function(m){const d=String(m.startAt||'').slice(0,10);const left=dueInDays(d);return left>=0&&left<=6;}).length;
      summary.textContent='مأموریت‌های ثبت‌شده در ۷ روز اخیر: '+faDigits(lastSeven)+' مورد.';
    }
    const foot=document.querySelector('.footnote');
    if(foot){const parts=foot.querySelectorAll('span');if(parts[1])parts[1].textContent='اطلاعات ثبت‌شده در همین دستگاه';if(parts[3])parts[3].textContent='ذخیره‌سازی محلی · بدون اتصال ابری';}
  }

  function reportDateFor(moduleKey, record) {
    if (moduleKey === 'missions') return String(record.startAt || '').slice(0,10);
    if (moduleKey === 'leaves') return record.startDate || '';
    if (moduleKey === 'gasmeters') return record.calibrationEnd || record.updatedAt || '';
    if (moduleKey === 'vehicles') return record.updatedAt || record.createdAt || '';
    if (moduleKey === 'notes') return record.date || record.dueDate || '';
    return record.createdAt || '';
  }

  function isInRange(moduleKey, record, period) {
    if (period === 'all') return true;
    const raw = reportDateFor(moduleKey, record);
    const date = parseDateValue(raw);
    const today = parseDateValue(todayIso());
    if (!date || !today) return false;
    if (period === 'custom') {
      const from = reportFrom ? parseJalali(reportFrom, false) : '';
      const to = reportTo ? parseJalali(reportTo, false) : '';
      if (reportFrom && !from) return false;
      if (reportTo && !to) return false;
      const fromDate = from ? parseDateValue(from) : null;
      const toDate = to ? parseDateValue(to) : null;
      if (fromDate && date < fromDate) return false;
      if (toDate && date > toDate) return false;
      return true;
    }
    if (period === 'today') return date.getTime() === today.getTime();
    if (period === 'yesterday') {
      const d = new Date(today);d.setDate(d.getDate()-1);return date.getTime()===d.getTime();
    }
    let start = new Date(today);
    if (period === 'threeDays') start.setDate(start.getDate()-2);
    else if (period === 'week') start.setDate(start.getDate()-6);
    else if (period === 'tenDays') start.setDate(start.getDate()-9);
    else if (period === 'month') start = new Date(today.getFullYear(),today.getMonth(),1);
    else if (period === 'threeMonths') start.setMonth(start.getMonth()-2,1);
    else if (period === 'sixMonths') start.setMonth(start.getMonth()-5,1);
    else if (period === 'year') start = new Date(today.getFullYear(),0,1);
    return date >= start && date <= today;
  }

  function renderReports(section) {
    const periods = [
      ['today','امروز'],['yesterday','دیروز'],['threeDays','۳ روز اخیر'],['week','هفته'],['tenDays','۱۰ روز اخیر'],
      ['month','ماه جاری'],['threeMonths','۳ ماه اخیر'],['sixMonths','۶ ماه اخیر'],['year','سال جاری'],['all','همهٔ اطلاعات'],['custom','بازهٔ دلخواه']
    ];
    const actions = '<button class="secondary-btn" type="button" data-module-action="export-all">خروجی CSV همهٔ اطلاعات</button><button class="primary-btn" type="button" data-module-action="print">چاپ گزارش</button>';
    const cards = MODULES.map(function (key) {
      const total=appData[key].filter(function(record){return isInRange(key,record,reportPeriod);}).length;
      return '<a class="module-report-card" href="./index.html?view='+esc(key)+'"><span>'+esc(specs[key].title)+'</span><strong>'+faDigits(total)+'</strong><small>مشاهدهٔ فهرست ←</small></a>';
    }).join('');
    const activeStaff=appData.employees.filter(function(item){return effectiveEmployeeStatus(item)!=='غیرفعال';}).length;
    const openMissions=appData.missions.filter(function(item){return ['در جریان','برنامه‌ریزی‌شده'].includes(item.status);}).length;
    const dueMeters=appData.gasmeters.filter(function(item){return dueInDays(item.calibrationEnd)<=30;}).length;
    section.innerHTML=rootWrap(
      pageHead('گزارش‌ها و آمار','خلاصهٔ اطلاعات ثبت‌شده در دستگاه و فیلتر براساس بازهٔ زمانی.',actions)+
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>بازهٔ گزارش</h3><p>برای بازهٔ سفارشی تاریخ شمسی را وارد کن.</p></div><div class="module-list-tools"><select data-report-period aria-label="بازهٔ گزارش">'+periods.map(function(item){return '<option value="'+item[0]+'"'+(reportPeriod===item[0]?' selected':'')+'>'+item[1]+'</option>';}).join('')+'</select></div></div>'+
      '<div class="module-report-range" data-report-custom'+(reportPeriod==='custom'?'':' hidden')+'><label class="module-field"><span>از تاریخ شمسی</span><input type="text" data-report-from value="'+esc(reportFrom)+'" placeholder="۱۴۰۵/۰۷/۰۱"></label><label class="module-field"><span>تا تاریخ شمسی</span><input type="text" data-report-to value="'+esc(reportTo)+'" placeholder="۱۴۰۵/۰۷/۳۰"></label><button type="button" class="primary-btn" data-module-action="apply-report-range">اعمال بازه</button></div></section>'+
      '<div class="module-metric-grid"><div><span>نیروی ثبت‌شدهٔ فعال</span><strong>'+faDigits(activeStaff)+'</strong></div><div><span>مأموریت‌های باز</span><strong>'+faDigits(openMissions)+'</strong></div><div><span>گازسنج با موعد تا ۳۰ روز</span><strong>'+faDigits(dueMeters)+'</strong></div></div>'+
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>خلاصهٔ پرونده‌ها</h3><p>تعداد هر بخش مطابق بازهٔ انتخاب‌شده.</p></div></div><div class="module-report-grid">'+cards+'</div></section>'+
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>تاریخچهٔ عملیات</h3><p>آخرین تغییرات ثبت‌شده در این دستگاه.</p></div></div>'+renderGlobalHistory()+'</section>'+
      '<div class="module-local-note">برای فایل PDF از پنجرهٔ چاپ مرورگر گزینهٔ «ذخیره به‌صورت PDF» را انتخاب کن. خروجی جدولی CSV است و در نرم‌افزارهای صفحه‌گسترده باز می‌شود.</div>'
    );
  }

  function renderGlobalHistory() {
    const rows=appData.history.slice().sort(function(a,b){return String(b.at).localeCompare(String(a.at));}).slice(0,50);
    if(!rows.length)return '<div class="module-empty">هنوز سابقه‌ای ثبت نشده است.</div>';
    return '<div class="module-table-wrap"><table class="module-table"><thead><tr><th>زمان</th><th>بخش</th><th>مورد</th><th>عملیات</th><th>تغییرات</th></tr></thead><tbody>'+
      rows.map(function(item){return '<tr><td>'+formatJalali(item.at,true)+'</td><td>'+esc(specs[item.module]?specs[item.module].title:item.module)+'</td><td>'+esc(item.recordLabel||'—')+'</td><td>'+esc(item.action)+'</td><td>'+esc((item.changes||[]).map(function(c){return c.field+': '+c.before+' ← '+c.after;}).join('؛ ')||'—')+'</td></tr>';}).join('')+'</tbody></table></div>';
  }

  function renderSettings(section) {
    section.innerHTML=rootWrap(
      pageHead('تنظیمات','مدیریت محلی اطلاعات، فیلدهای پرسنلی قابل تنظیم و نسخهٔ پشتیبان. تم فعلی تغییر داده نمی‌شود.','')+
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>پشتیبان‌گیری و بازیابی</h3><p>نسخهٔ پشتیبان تمام پرونده‌ها، تاریخچه، تنظیمات و پیوست‌های محلی را دربر می‌گیرد.</p></div></div>'+
      '<div class="module-backup-grid"><div class="module-backup-card"><strong>ساخت نسخهٔ پشتیبان</strong><p>یک فایل JSON از تمام داده‌های موجود در این دستگاه دریافت می‌کنی.</p><button type="button" class="primary-btn" data-module-action="backup">دریافت فایل پشتیبان</button></div>'+
      '<div class="module-backup-card"><strong>بازیابی نسخهٔ پشتیبان</strong><p>بازیابی، داده‌های فعلی را جایگزین اطلاعات درون فایل انتخاب‌شده می‌کند.</p><button type="button" class="secondary-btn" data-module-action="restore-select">انتخاب فایل پشتیبان</button><input type="file" id="atlasRestoreFile" accept=".json,application/json" hidden></div></div></section>'+
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>فیلدهای سفارشی کارکنان</h3><p>هر خط یک عنوان فیلد است. حذف عنوان از این فهرست به معنی حذف مقدار قبلی از پرونده‌ها نیست.</p></div></div>'+
      '<form data-custom-fields-form class="module-form"><label class="module-field module-field-wide"><span>عنوان فیلدها، هر کدام در یک خط</span><textarea name="employeeCustomFields" rows="5" placeholder="مثلاً: گواهینامه تخصصی&#10;شماره بیمه">'+esc(appData.settings.employeeCustomFields||'')+'</textarea></label><div class="module-form-actions"><span class="module-required-help">حداکثر ۲۰ فیلد سفارشی.</span><button type="submit" class="primary-btn">ذخیرهٔ فیلدها</button></div></form></section>'+
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>وضعیت نگهداری داده</h3><p>داده‌ها در پایگاه محلی مرورگر ذخیره می‌شوند و برای استفادهٔ روزمره به اتصال اینترنت نیاز ندارند.</p></div></div><div class="module-local-note">اطلاعات هر مرورگر مستقل است. پاک‌کردن داده‌های مرورگر می‌تواند اطلاعات را حذف کند؛ فایل پشتیبان را در محل امن نگهداری کن. همگام‌سازی خودکار فعال نیست.</div><div class="module-settings-counts">'+MODULES.map(function(key){return '<span>'+esc(specs[key].title)+': <b>'+faDigits(appData[key].length)+'</b></span>';}).join('')+'</div></section>'
    );
  }

  function refreshCurrentView() {
    const section=document.getElementById('sectionView');
    const view=new URLSearchParams(window.location.search).get('view')||'dashboard';
    if (section) render(view,section);
  }

  function render(view, section) {
    if(!section)return;
    prepareSection(section);
    if(!ready){
      section.innerHTML=rootWrap('<div class="module-empty">در حال آماده‌سازی اطلاعات محلی…</div>');
      return;
    }
    if(specs[view])renderCrud(view,section);
    else if(view==='reports')renderReports(section);
    else if(view==='settings')renderSettings(section);
    else{section.hidden=true;section.innerHTML='';}
  }

  async function readFileAsDataUrl(file) {
    if(file.size > 10 * 1024 * 1024) throw new Error('هر فایل باید کمتر از ۱۰ مگابایت باشد.');
    return new Promise(function(resolve,reject){
      const reader=new FileReader();
      reader.onload=function(){resolve({name:file.name,type:file.type||'application/octet-stream',size:file.size,dataUrl:String(reader.result||'')});};
      reader.onerror=function(){reject(reader.error||new Error('File read failed'));};
      reader.readAsDataURL(file);
    });
  }

  async function formValues(form, moduleKey, oldRecord) {
    const fields=fieldsFor(moduleKey), data={};
    const fd=new FormData(form);
    for(let i=0;i<fields.length;i+=1){
      const field=fields[i];
      if(field.type==='file'||field.type==='file-multiple'){
        const input=form.querySelector('[name="'+field.key+'"]');
        const selected=input&&input.files?Array.from(input.files):[];
        if(!selected.length){
          data[field.key]=oldRecord&&oldRecord[field.key] != null?oldRecord[field.key]:(field.type==='file-multiple'?[]:'');
        } else {
          const list=[];
          for(let j=0;j<selected.length;j+=1)list.push(await readFileAsDataUrl(selected[j]));
          data[field.key]=field.type==='file-multiple'?list:(list[0].dataUrl);
        }
      }else if(field.type==='checks'||(field.type==='select'&&field.multiple)){
        data[field.key]=fd.getAll(field.key);
      }else if(field.type==='jalali'||field.type==='jalali-datetime'){
        const raw=String(fd.get(field.key)||'').trim();
        const normalized=dateInputToIso(raw,field.type);
        if(raw&&!normalized)throw new Error('تاریخ «'+field.label+'» را با قالب شمسی ۱۴۰۵/۰۷/۲۸ وارد کن.');
        data[field.key]=normalized||'';
      }else{
        data[field.key]=String(fd.get(field.key)||'').trim();
      }
      if(field.required && (data[field.key] == null || data[field.key] === '' || (Array.isArray(data[field.key])&&!data[field.key].length))){
        throw new Error('فیلد «'+field.label+'» ضروری است.');
      }
    }
    return data;
  }

  function summarizeChanges(oldRecord, newRecord, moduleKey) {
    if(!oldRecord)return [];
    const fields=fieldsFor(moduleKey),changes=[];
    fields.forEach(function(field){
      const before=field.custom&&oldRecord.customFields?oldRecord.customFields[field.key]:oldRecord[field.key];
      const after=field.custom&&newRecord.customFields?newRecord.customFields[field.key]:newRecord[field.key];
      const a=JSON.stringify(before==null?'':before),b=JSON.stringify(after==null?'':after);
      if(a!==b)changes.push({field:field.label||field.key,before:String(before==null?'':Array.isArray(before)?before.join('، '):before),after:String(after==null?'':Array.isArray(after)?after.join('، '):after)});
    });
    return changes.slice(0,100);
  }

  function csvEscape(value) {
    let text=String(value == null ? '' : value);
    if (/^[=+\-@\t\r]/.test(text)) text="'"+text;
    return '"' + text.replace(/"/g,'""') + '"';
  }

  function downloadFile(filename, content, mime) {
    const blob=new Blob([content],{type:mime||'application/octet-stream'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=filename;
    document.body.appendChild(a);a.click();a.remove();
    window.setTimeout(function(){URL.revokeObjectURL(url);},1500);
  }

  function exportCsv(moduleKey) {
    const rows=[];
    const fields=fieldsFor(moduleKey);
    rows.push(['شناسه'].concat(fields.map(function(field){return field.label;})));
    appData[moduleKey].forEach(function(record){
      rows.push([record.id].concat(fields.map(function(field){
        const value=field.custom&&record.customFields?record.customFields[field.key]:record[field.key];
        if(field.type==='file'||field.type==='file-multiple')return Array.isArray(value)?value.map(function(x){return x.name;}).join('; '):(value?'تصویر پیوست':'');
        return Array.isArray(value)?value.join('، '):String(value==null?'':value);
      })));
    });
    downloadFile('ATLAS-SHIFT-'+moduleKey+'-'+todayIso()+'.csv','\uFEFF'+rows.map(function(row){return row.map(csvEscape).join(',');}).join('\r\n'),'text/csv;charset=utf-8;');
  }

  function exportAllCsv() {
    const rows=[['بخش','شناسه','عنوان','وضعیت','تاریخ','شرح']];
    MODULES.forEach(function(key){
      appData[key].forEach(function(record){
        rows.push([specs[key].title,record.id,recordLabel(key,record),record.status||'',recordDateForCsv(key,record),record.notes||record.body||record.result||record.reason||'']);
      });
    });
    downloadFile('ATLAS-SHIFT-report-'+todayIso()+'.csv','\uFEFF'+rows.map(function(row){return row.map(csvEscape).join(',');}).join('\r\n'),'text/csv;charset=utf-8;');
  }

  function recordDateForCsv(key, record) {
    if(key==='missions')return record.startAt||'';
    if(key==='leaves')return record.startDate||'';
    if(key==='gasmeters')return record.calibrationEnd||'';
    if(key==='notes')return record.date||'';
    return record.createdAt||'';
  }

  function exportBackup() {
    const payload={app:'ATLAS SHIFT',schemaVersion:2,exportedAt:new Date().toISOString(),data:appData};
    downloadFile('ATLAS-SHIFT-backup-'+todayIso()+'.json',JSON.stringify(payload,null,2),'application/json;charset=utf-8');
    toast('نسخهٔ پشتیبان شامل اطلاعات و تاریخچه آماده شد.');
  }

  async function restoreBackup(file) {
    if(!file)return;
    try {
      const raw=await file.text();
      const parsed=JSON.parse(raw);
      const candidate=parsed&&parsed.data?parsed.data:parsed;
      if(!candidate||!MODULES.every(function(key){return Array.isArray(candidate[key]);}))throw new Error('فایل پشتیبان معتبر نیست.');
      if(!window.confirm('با بازیابی، اطلاعات فعلی این دستگاه با اطلاعات فایل جایگزین می‌شود. ادامه می‌دهی؟'))return;
      appData=normalizeState(candidate);
      const ok=await saveState();
      if(!ok)return;
      refreshDashboard();refreshCurrentView();
      toast('بازیابی با موفقیت انجام شد.');
    } catch(error) {
      toast(error.message||'فایل انتخاب‌شده نسخهٔ پشتیبان معتبر ATLAS SHIFT نیست.');
    }
  }

  function openHistory(moduleKey, id) {
    const record=appData[moduleKey].find(function(item){return String(item.id)===String(id);});
    const rows=appData.history.filter(function(item){return item.module===moduleKey&&item.recordId===String(id);})
      .sort(function(a,b){return String(b.at).localeCompare(String(a.at));});
    const textRows=rows.map(function(item){
      const changes=(item.changes||[]).map(function(change){return change.field+': «'+change.before+'» ← «'+change.after+'»';}).join('\n');
      return displayDateTime(item.at)+' | '+item.action+(changes?'\n'+changes:'');
    });
    window.alert((record?recordLabel(moduleKey,record):'سوابق')+'\n\n'+(textRows.join('\n\n')||'سابقه‌ای ثبت نشده است.'));
  }

  document.addEventListener('click', async function(event) {
    const button=event.target.closest('[data-module-action]');
    if(!button)return;
    const action=button.dataset.moduleAction;
    const moduleKey=button.dataset.view||new URLSearchParams(window.location.search).get('view')||'dashboard';
    const section=document.getElementById('sectionView');
    if(action==='new'||action==='edit'){
      if(!specs[moduleKey])return;
      formState[moduleKey]={open:true,id:action==='edit'?button.dataset.id:null};
      render(moduleKey,section);
    }else if(action==='cancel'){
      delete formState[moduleKey];render(moduleKey,section);
    }else if(action==='delete'){
      if(!specs[moduleKey])return;
      const record=appData[moduleKey].find(function(item){return String(item.id)===String(button.dataset.id);});
      if(!record||!window.confirm('«'+recordLabel(moduleKey,record)+'» حذف شود؟'))return;
      appData[moduleKey]=appData[moduleKey].filter(function(item){return String(item.id)!==String(button.dataset.id);});
      addHistory(moduleKey,record,'حذف',[]);
      if(await saveState()){render(moduleKey,section);refreshDashboard();toast('مورد حذف شد.')}
    }else if(action==='bulk-delete'){
      if(!specs[moduleKey])return;
      const selected=Array.from(section.querySelectorAll('[data-record-select]:checked')).map(function(box){return box.value;});
      if(!selected.length){toast('ابتدا یک یا چند ردیف را انتخاب کن.');return;}
      if(!window.confirm('تعداد '+faDigits(selected.length)+' مورد انتخاب‌شده حذف شود؟'))return;
      const removed=appData[moduleKey].filter(function(item){return selected.includes(String(item.id));});
      appData[moduleKey]=appData[moduleKey].filter(function(item){return !selected.includes(String(item.id));});
      removed.forEach(function(record){addHistory(moduleKey,record,'حذف گروهی',[]);});
      if(await saveState()){render(moduleKey,section);refreshDashboard();toast('موارد انتخاب‌شده حذف شدند.')}
    }else if(action==='export'&&specs[moduleKey]){
      exportCsv(moduleKey);
    }else if(action==='export-all'){
      exportAllCsv();
    }else if(action==='print'){
      window.print();
    }else if(action==='backup'){
      exportBackup();
    }else if(action==='restore-select'){
      const input=document.getElementById('atlasRestoreFile');if(input)input.click();
    }else if(action==='history'&&specs[moduleKey]){
      openHistory(moduleKey,button.dataset.id);
    }else if(action==='apply-report-range'){
      const from=section.querySelector('[data-report-from]'),to=section.querySelector('[data-report-to]');
      if((from&&from.value&&!parseJalali(from.value,false))||(to&&to.value&&!parseJalali(to.value,false))){
        toast('تاریخ بازه را به شکل شمسی ۱۴۰۵/۰۷/۲۸ وارد کن.');return;
      }
      if(from&&to&&from.value&&to.value){
        const a=parseJalali(from.value,false),b=parseJalali(to.value,false);
        if(a>b){toast('تاریخ پایان نباید قبل از تاریخ شروع باشد.');return;}
      }
      reportFrom=from?from.value.trim():'';reportTo=to?to.value.trim():'';
      renderReports(section);
    }
  });

  // Delegate clicks for dynamically generated notification cards as well as the initial markup.
  document.addEventListener('click', function(event) {
    const card = event.target.closest('.notice-card');
    if (!card) return;
    card.classList.remove('unread');
    const count = document.getElementById('notificationCount');
    if (count) count.textContent = faDigits(document.querySelectorAll('.notice-card.unread').length);
  });

  document.addEventListener('submit', async function(event) {
    const form=event.target.closest('[data-module-form]');
    if(form){
      event.preventDefault();
      const moduleKey=form.dataset.view;
      if(!specs[moduleKey])return;
      const id=form.dataset.id||'';
      const old= id ? appData[moduleKey].find(function(item){return String(item.id)===String(id);}) : null;
      try{
        const values=await formValues(form,moduleKey,old);
        if(moduleKey==='leaves'&&values.startDate&&values.endDate&&values.endDate<values.startDate)throw new Error('تاریخ پایان مرخصی نباید قبل از تاریخ شروع باشد.');
        if(moduleKey==='missions'&&values.startAt&&values.endAt&&values.endAt<values.startAt)throw new Error('زمان پایان مأموریت نباید قبل از زمان شروع باشد.');
        if(moduleKey==='gasmeters'&&values.calibrationStart&&values.calibrationEnd&&values.calibrationEnd<values.calibrationStart)throw new Error('پایان اعتبار کالیبراسیون نباید قبل از شروع باشد.');
        const record=Object.assign({},old||{},values,{id:old?old.id:createId(),createdAt:old?old.createdAt||new Date().toISOString():new Date().toISOString(),updatedAt:new Date().toISOString()});
        const customFields={};
        fieldsFor(moduleKey).filter(function(field){return field.custom;}).forEach(function(field){customFields[field.key]=values[field.key]||'';delete record[field.key];});
        if(Object.keys(customFields).length)record.customFields=customFields;
        const changes=summarizeChanges(old,record,moduleKey);
        if(old){
          appData[moduleKey]=appData[moduleKey].map(function(item){return String(item.id)===String(old.id)?record:item;});
          addHistory(moduleKey,record,'ویرایش',changes);
        }else{
          appData[moduleKey].push(record);
          addHistory(moduleKey,record,'ثبت',[]);
        }
        if(moduleKey==='employees'&&record.status==='غیرفعال') {
          appData.missions.forEach(function(mission){if((mission.crewIds||[]).map(String).includes(String(record.id))&&mission.status==='برنامه‌ریزی‌شده')mission.updatedAt=new Date().toISOString();});
        }
        const ok=await saveState();
        if(!ok)return;
        delete formState[moduleKey];
        render(moduleKey,document.getElementById('sectionView'));
        refreshDashboard();
        toast(old?'تغییرات ذخیره شد.':'اطلاعات جدید ثبت شد.');
      }catch(error){
        toast(error.message||'ثبت اطلاعات انجام نشد.');
      }
      return;
    }
    const customForm=event.target.closest('[data-custom-fields-form]');
    if(customForm){
      event.preventDefault();
      const input=customForm.querySelector('[name="employeeCustomFields"]');
      const lines=String(input?input.value:'').split(/\r?\n/).map(function(x){return x.trim();}).filter(Boolean);
      if(lines.length>20){toast('حداکثر ۲۰ فیلد سفارشی تعریف کن.');return;}
      appData.settings.employeeCustomFields=lines.join('\n');
      if(await saveState()){renderSettings(document.getElementById('sectionView'));toast('فیلدهای سفارشی ذخیره شدند.');}
    }
  });

  document.addEventListener('input', function(event) {
    const input=event.target;
    if(!input.matches('[data-module-search]'))return;
    const moduleKey=input.dataset.view;
    const cursor=input.selectionStart;
    searchState[moduleKey]=input.value;
    const section=document.getElementById('sectionView');
    renderCrud(moduleKey,section);
    const replacement=section.querySelector('[data-module-search]');
    if(replacement){replacement.focus();try{replacement.setSelectionRange(cursor,cursor);}catch(error){}}
  });

  document.addEventListener('change', function(event) {
    const target=event.target;
    if(target.matches('[data-module-filter]')){
      filterState[target.dataset.view]=target.value;
      render(target.dataset.view,document.getElementById('sectionView'));
    }else if(target.matches('[data-module-select-all]')){
      const section=document.getElementById('sectionView');
      section.querySelectorAll('[data-record-select]').forEach(function(box){box.checked=target.checked;});
      section.querySelectorAll('[data-module-select-all]').forEach(function(box){box.checked=target.checked;});
    }else if(target.id==='atlasRestoreFile'){
      const file=target.files&&target.files[0];if(file)restoreBackup(file);target.value='';
    }else if(target.matches('[data-report-period]')){
      reportPeriod=target.value;
      const region=document.getElementById('sectionView');
      renderReports(region);
    }
  });

  window.ATLAS_MODULES = {
    render: render,
    refreshDashboard: refreshDashboard,
    getData: function () { return appData; },
    isReady: function () { return ready; },
    parseJalali: parseJalali,
    formatJalali: formatJalali
  };

  document.addEventListener('DOMContentLoaded', function(){refreshDashboard();});
  initializeStorage();
})();
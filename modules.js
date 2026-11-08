(function () {
  'use strict';

  const DB_NAME = 'ATLAS_SHIFT_LOCAL';
  const DB_VERSION = 1;
  const STORE_NAME = 'records';
  // دو فضای ذخیره‌سازی کاملاً جدا: دادهٔ اصلی و دادهٔ آزمایشی.
  // هر چیزی که در حالت آزمایشی ثبت شود فقط در فضای آزمایشی می‌ماند و هیچ‌وقت
  // روی دادهٔ اصلی نوشته نمی‌شود؛ پس دادهٔ اصلی خام و دست‌نخورده باقی می‌ماند.
  const STORAGE_MODE_KEY = 'atlasShiftStorageMode';
  const TEST_MODE = (function () {
    try { return localStorage.getItem(STORAGE_MODE_KEY) === 'test'; } catch (error) { return false; }
  })();
  const STORE_KEY = TEST_MODE ? 'sandbox' : 'main';
  const LEGACY_KEY = TEST_MODE ? 'atlasShiftOperationalDataSandboxV1' : 'atlasShiftOperationalDataV1';
  // آستانهٔ هشدار کالیبراسیون گازسنج‌ها: ۲۰ روز مانده به پایان اعتبار
  const GAS_CALIBRATION_WARN_DAYS = 20;
  const MODULES = ['employees', 'missions', 'leaves', 'vehicles', 'stations', 'gasmeters', 'notes', 'programs', 'faults', 'maintenance', 'gaslogs'];
  const formState = Object.create(null);
  const searchState = Object.create(null);
  const filterState = Object.create(null);
  let shiftFormState = { open:false, id:null };
  let appData = createEmptyState();
  let db = null;
  let ready = false;
  let loadError = '';
  let storageLocked = false;
  let lastSealed = '';
  let autosaveTimer = 0;
  let reportPeriod = 'month';
  let dashboardRange = { name:'today', start:todayIso(), end:todayIso() };
  let reportFrom = '';
  let reportTo = '';
  let saveQueue = Promise.resolve();

  // ── مرتب‌سازی فهرست هر بخش ────────────────────────────────────────────────
  // هر بخش مجموعهٔ کامل و تخصصی گزینه‌های مرتب‌سازی خودش را دارد. انتخاب کاربر
  // (کلید و جهت) در همین دستگاه ذخیره می‌شود تا بعد از بازکردن دوبارهٔ برنامه،
  // فهرست همان‌طور که مرتب شده بود دیده شود.
  const LIST_SORT_KEY = 'atlasShiftListSortV1';
  const LIST_SORTS = {
    employees: [['name', 'نام و نام خانوادگی'], ['personnelId', 'شمارهٔ پرسنلی'], ['jobTitle', 'عنوان شغلی'],
      ['employmentType', 'نوع استخدام'], ['workplace', 'محل سازمانی'], ['assignedWorkplace', 'محل خدمت فعلی'],
      ['workType', 'نوع شیفت کاری'], ['hireDate', 'تاریخ استخدام'], ['status', 'وضعیت'], ['updatedAt', 'آخرین به‌روزرسانی']],
    missions: [['startAt', 'تاریخ آغاز'], ['endAt', 'تاریخ پایان'], ['name', 'نام فرد مأمور'], ['title', 'عنوان مأموریت'],
      ['missionType', 'نوع مأموریت'], ['origin', 'مبدأ'], ['destination', 'مقصد'], ['operationalRange', 'محدودهٔ عملیاتی'],
      ['status', 'وضعیت'], ['updatedAt', 'آخرین به‌روزرسانی']],
    leaves: [['startDate', 'تاریخ شروع'], ['endDate', 'تاریخ پایان'], ['name', 'نام و نام خانوادگی'],
      ['firstName', 'نام'], ['lastName', 'نام خانوادگی'], ['leaveType', 'نوع مرخصی'], ['status', 'وضعیت'],
      ['updatedAt', 'آخرین به‌روزرسانی']],
    vehicles: [['name', 'نام خودرو'], ['companyPlate', 'پلاک شرکت'], ['policePlate', 'پلاک پلیس'], ['status', 'وضعیت'],
      ['currentKm', 'کارکرد (کیلومتر)'], ['updatedAt', 'آخرین به‌روزرسانی']],
    stations: [['name', 'نام ایستگاه'], ['placeType', 'نوع محل'], ['city', 'شهر'], ['status', 'وضعیت'],
      ['personInCharge', 'مسئول ایستگاه'], ['updatedAt', 'آخرین به‌روزرسانی']],
    gasmeters: [['code', 'کد دستگاه'], ['serial', 'شمارهٔ سری'], ['model', 'مدل'], ['location', 'محل استقرار'],
      ['healthStatus', 'وضعیت سلامت'], ['calibrationEnd', 'پایان اعتبار کالیبراسیون'], ['updatedAt', 'آخرین به‌روزرسانی']],
    notes: [['dueDate', 'موعد پیگیری'], ['title', 'عنوان'], ['actionType', 'نوع اقدام'], ['status', 'وضعیت'],
      ['updatedAt', 'آخرین به‌روزرسانی']],
    programs: [['dueDate', 'مهلت'], ['title', 'عنوان برنامه'], ['programType', 'نوع برنامه'], ['status', 'وضعیت'],
      ['category', 'دسته'], ['updatedAt', 'آخرین به‌روزرسانی']],
    faults: [['reportedAt', 'تاریخ گزارش'], ['priority', 'اولویت'], ['status', 'وضعیت رفع'], ['title', 'عنوان'],
      ['updatedAt', 'آخرین به‌روزرسانی']],
    maintenance: [['date', 'تاریخ سرویس'], ['serviceType', 'نوع سرویس'], ['status', 'وضعیت'], ['cost', 'هزینه'],
      ['updatedAt', 'آخرین به‌روزرسانی']],
    gaslogs: [['date', 'تاریخ سابقه'], ['logType', 'نوع سابقه'], ['updatedAt', 'آخرین به‌روزرسانی']],
    shifts: [['startAt', 'شروع شیفت'], ['endAt', 'پایان شیفت'], ['shiftType', 'نوع شیفت'],
      ['employees', 'کارکنان'], ['workplace', 'محل خدمت'], ['status', 'وضعیت']]
  };
  const listSorts = (function () {
    try {
      const saved = JSON.parse(localStorage.getItem(LIST_SORT_KEY) || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch (error) { return {}; }
  })();
  // برچسب هر ستون جدول؛ هم برای سرستون و هم برای گزینهٔ مرتب‌سازی.
  function columnLabel(moduleKey, key) {
    const field = specs[moduleKey] ? fieldsFor(moduleKey).find(function (item) { return item.key === key; }) : null;
    if (field) return field.label;
    if (key === 'relatedMissions') return 'مأموریت‌های مرتبط';
    return key;
  }

  // ── عناوین (ستون‌های) جدول هر بخش ─────────────────────────────────────────
  // کاربر از پنجرهٔ «عناوین» می‌تواند ستون‌های جدول را تیک بزند (نمایش/پنهان) و
  // ترتیبشان را با بالا/پایین جابه‌جا کند. انتخاب در تنظیمات همان بخش ذخیره
  // می‌شود تا بعد از بازکردن دوبارهٔ برنامه هم بماند.
  function allTableColumns(moduleKey) {
    return specs[moduleKey].columns.concat(moduleKey === 'employees'
      ? customFieldDefs().map(function (def, index) { return 'customField' + (index + 1); })
      : []);
  }
  function columnPrefsFor(moduleKey) {
    const stored = appData.settings && appData.settings.columnPrefs ? appData.settings.columnPrefs[moduleKey] : null;
    return stored && typeof stored === 'object' ? stored : null;
  }
  function orderedTableColumns(moduleKey) {
    const all = allTableColumns(moduleKey);
    const prefs = columnPrefsFor(moduleKey);
    const order = prefs && Array.isArray(prefs.order) ? prefs.order : [];
    const ordered = order.filter(function (key) { return all.indexOf(key) >= 0; });
    all.forEach(function (key) { if (ordered.indexOf(key) < 0) ordered.push(key); });
    return ordered;
  }
  function tableColumns(moduleKey) {
    const all = allTableColumns(moduleKey);
    const prefs = columnPrefsFor(moduleKey);
    if (!prefs) return all;
    const hidden = Array.isArray(prefs.hidden) ? prefs.hidden : [];
    const visible = orderedTableColumns(moduleKey).filter(function (key) { return hidden.indexOf(key) < 0; });
    return visible.length ? visible : orderedTableColumns(moduleKey);
  }

  // گزینه‌های مرتب‌سازی هر بخش: فهرست تخصصی بالا، به‌اضافهٔ هر ستونی از جدول که
  // در آن فهرست نیست. این‌طور هر «عنوان» جدول هم قابل مرتب‌سازی می‌شود.
  function sortOptionsFor(moduleKey) {
    const options = (LIST_SORTS[moduleKey] || []).slice();
    const seen = Object.create(null);
    options.forEach(function (option) { seen[option[0]] = 1; });
    const spec = specs[moduleKey];
    if (spec && spec.columns) {
      spec.columns.forEach(function (key) {
        if (seen[key]) return;
        seen[key] = 1;
        options.push([key, columnLabel(moduleKey, key)]);
      });
    }
    return options;
  }

  function listSortFor(moduleKey) {
    const options = sortOptionsFor(moduleKey);
    const saved = listSorts[moduleKey] || {};
    const key = options.some(function (option) { return option[0] === saved.key; }) ? saved.key : (options[0] ? options[0][0] : 'updatedAt');
    return { key: key, direction: saved.direction === 'asc' ? 'asc' : 'desc' };
  }
  function setListSort(moduleKey, patch) {
    const next = listSortFor(moduleKey);
    if (patch && patch.key) next.key = patch.key;
    if (patch && patch.direction) next.direction = patch.direction;
    listSorts[moduleKey] = next;
    try { localStorage.setItem(LIST_SORT_KEY, JSON.stringify(listSorts)); } catch (error) {}
    return next;
  }
  // متن قابل‌مقایسهٔ یک فیلد ارجاعی (کارمند، خودرو، گازسنج، ایستگاه) برای مرتب‌سازی.
  function referenceLabel(field, value, data) {
    const list = data[field.source] || [];
    const labelOf = function (id) {
      const item = list.find(function (row) { return String(row.id) === String(id); });
      if (!item) return String(id == null ? '' : id);
      if (field.source === 'employees') return employeeName(item) || item.personnelId || '';
      if (field.source === 'vehicles') return (item.name || '') + (item.companyPlate ? ' · ' + item.companyPlate : '');
      if (field.source === 'gasmeters') return (item.code || '') + (item.serial ? ' · ' + item.serial : '');
      if (field.source === 'stations') return stationLabel(item);
      return String(item.name || item.title || item.code || '');
    };
    return Array.isArray(value) ? value.map(labelOf).join('، ') : labelOf(value);
  }

  function listSortValue(moduleKey, record, key) {
    if (moduleKey === 'shifts' && key === 'employees') return shiftLabel(record, appData);
    if (key === 'relatedMissions') {
      return (appData.missions || []).filter(function (mission) {
        return [].concat(mission.vehicleIds || [], mission.vehicleId || []).map(String).indexOf(String(record.id)) >= 0;
      }).length;
    }
    const columnField = specs[moduleKey] ? fieldsFor(moduleKey).find(function (item) { return item.key === key; }) : null;
    if (columnField && columnField.custom) {
      const custom = record.customFields || {};
      return String(custom[key] == null ? '' : custom[key]);
    }
    if (columnField && columnField.source) return referenceLabel(columnField, record[key], appData);
    if (key === 'name') {
      if (moduleKey === 'employees') return employeeName(record);
      if (moduleKey === 'missions' || moduleKey === 'leaves') {
        const person = (appData.employees || []).find(function (item) { return String(item.id) === String(record.employeeId); });
        if (person) return employeeName(person);
      }
      return String(record.name || record.title || '');
    }
    if (key === 'firstName' || key === 'lastName') {
      const person = moduleKey === 'employees' ? record
        : (appData.employees || []).find(function (item) { return String(item.id) === String(record.employeeId); });
      return person ? String(person[key] == null ? '' : person[key]).trim() : '';
    }
    if (key === 'employeeId') {
      const person = (appData.employees || []).find(function (item) { return String(item.id) === String(record.employeeId); });
      return person ? employeeName(person) : '';
    }
    if (key === 'currentKm' || key === 'cost' || key === 'personnelId') {
      const numeric = Number(String(record[key] == null ? '' : record[key]).replace(/[^\d.-]/g, ''));
      return Number.isFinite(numeric) && String(record[key] || '').trim() !== '' ? numeric : -Infinity;
    }
    return String(record[key] == null ? '' : record[key]);
  }
  function sortRecords(moduleKey, records) {
    const sort = listSortFor(moduleKey);
    const factor = sort.direction === 'asc' ? 1 : -1;
    return records.slice().sort(function (a, b) {
      const left = listSortValue(moduleKey, a, sort.key);
      const right = listSortValue(moduleKey, b, sort.key);
      if (typeof left === 'number' || typeof right === 'number') {
        return factor * ((left === right ? 0 : (left < right ? -1 : 1)));
      }
      const compared = String(left).localeCompare(String(right), 'fa', { numeric: true, sensitivity: 'base' });
      if (compared) return factor * compared;
      return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
    });
  }

  // ── فیلترهای فهرست هر بخش ────────────────────────────────────────────────
  // هر بخش فیلترهای واقعی خودش را دارد (نه فقط وضعیت): مکان/شهر، فرد، نوع و …
  // هر فیلتر سه چیز دارد: کلید، برچسب و دو تابع:
  //   options()  → گزینه‌های فهرست، که از داده‌های همین دستگاه ساخته می‌شوند
  //   match()    → آیا این رکورد با مقدار انتخاب‌شده می‌خواند؟
  // فیلتر «مکان» و «شهر یا محل» به هم وابسته‌اند: با انتخاب مبدأ/مقصد، فهرست
  // شهرها هم فقط از همان ستون ساخته می‌شود.
  const PLACE_PARTS = { origin: 'مبدأ', destination: 'مقصد', operationalRange: 'محدودهٔ عملیاتی' };

  function uniqueOptionsFrom(moduleKey, keys) {
    const seen = Object.create(null);
    const values = [];
    (appData[moduleKey] || []).forEach(function (record) {
      keys.forEach(function (key) {
        const value = String(record[key] == null ? '' : record[key]).trim();
        if (value && !seen[value]) { seen[value] = 1; values.push(value); }
      });
    });
    values.sort(function (a, b) { return a.localeCompare(b, 'fa'); });
    return values.map(function (value) { return [value, value]; });
  }

  function statusFilterOptions(moduleKey) {
    return (statusOptions(moduleKey) || []).map(function (item) { return [item, item]; });
  }

  function employeeFilterOptions() {
    return (appData.employees || []).map(function (person) {
      return [String(person.id), employeeName(person) || person.personnelId || 'کارمند'];
    }).sort(function (a, b) { return String(a[1]).localeCompare(String(b[1]), 'fa'); });
  }

  const LIST_FILTERS = {
    missions: [
      { key: 'placeField', label: 'مکان', control: true, options: function () {
          return [['all', 'همهٔ مکان‌ها'], ['origin', 'مبدأ'], ['destination', 'مقصد'], ['operationalRange', 'محدودهٔ عملیاتی']];
        } },
      { key: 'place', label: 'شهر یا محل',
        options: function (moduleKey, state) {
          const parts = state.placeField && state.placeField !== 'all' ? [state.placeField] : Object.keys(PLACE_PARTS);
          return uniqueOptionsFrom('missions', parts);
        },
        match: function (record, value, state) {
          const parts = state.placeField && state.placeField !== 'all' ? [state.placeField] : Object.keys(PLACE_PARTS);
          return parts.some(function (part) { return String(record[part] || '') === String(value); });
        } },
      { key: 'employeeId', label: 'فرد', options: employeeFilterOptions,
        match: function (record, value) {
          if (String(record.employeeId || '') === String(value)) return true;
          const crew = Array.isArray(record.crewIds) ? record.crewIds.map(String) : [];
          return crew.indexOf(String(value)) >= 0;
        } },
      { key: 'missionType', label: 'نوع مأموریت', options: function () { return uniqueOptionsFrom('missions', ['missionType']); } },
      { key: 'status', label: 'وضعیت', options: function () { return statusFilterOptions('missions'); } }
    ],
    leaves: [
      { key: 'employeeId', label: 'فرد', options: employeeFilterOptions },
      { key: 'leaveType', label: 'نوع مرخصی', options: function () { return uniqueOptionsFrom('leaves', ['leaveType']); } },
      { key: 'status', label: 'وضعیت', options: function () { return statusFilterOptions('leaves'); } }
    ],
    employees: [
      { key: 'workplace', label: 'محل سازمانی', options: function () { return uniqueOptionsFrom('employees', ['workplace']); } },
      { key: 'assignedWorkplace', label: 'محل خدمت', options: function () { return uniqueOptionsFrom('employees', ['assignedWorkplace']); } },
      { key: 'workType', label: 'نوع شیفت', options: function () { return uniqueOptionsFrom('employees', ['workType']); } },
      { key: 'status', label: 'وضعیت', options: function () { return statusFilterOptions('employees'); } }
    ],
    vehicles: [
      { key: 'currentCity', label: 'شهر', options: function () { return uniqueOptionsFrom('vehicles', ['currentCity']); } },
      { key: 'status', label: 'وضعیت', options: function () { return statusFilterOptions('vehicles'); } }
    ],
    stations: [
      { key: 'city', label: 'شهر', options: function () { return uniqueOptionsFrom('stations', ['city']); } },
      { key: 'placeType', label: 'نوع محل', options: function () { return uniqueOptionsFrom('stations', ['placeType']); } },
      { key: 'status', label: 'وضعیت', options: function () { return statusFilterOptions('stations'); } }
    ],
    gasmeters: [
      { key: 'location', label: 'محل استقرار', options: function () { return uniqueOptionsFrom('gasmeters', ['location']); } },
      { key: 'healthStatus', label: 'وضعیت سلامت', options: function () { return uniqueOptionsFrom('gasmeters', ['healthStatus']); } }
    ],
    notes: [
      { key: 'actionType', label: 'نوع اقدام', options: function () { return uniqueOptionsFrom('notes', ['actionType']); } },
      { key: 'status', label: 'وضعیت', options: function () { return statusFilterOptions('notes'); } }
    ],
    programs: [
      { key: 'category', label: 'دسته', options: function () { return uniqueOptionsFrom('programs', ['category']); } },
      { key: 'programType', label: 'نوع برنامه', options: function () { return uniqueOptionsFrom('programs', ['programType']); } },
      { key: 'status', label: 'وضعیت', options: function () { return statusFilterOptions('programs'); } }
    ],
    faults: [
      { key: 'priority', label: 'اولویت', options: function () { return uniqueOptionsFrom('faults', ['priority']); } },
      { key: 'status', label: 'وضعیت', options: function () { return statusFilterOptions('faults'); } }
    ],
    maintenance: [
      { key: 'serviceType', label: 'نوع سرویس', options: function () { return uniqueOptionsFrom('maintenance', ['serviceType']); } },
      { key: 'status', label: 'وضعیت', options: function () { return statusFilterOptions('maintenance'); } }
    ]
  };

  function moduleFilterState(moduleKey) {
    const state = filterState[moduleKey];
    if (state && typeof state === 'object') return state;
    // سازگاری با مقدار قدیمی (فقط وضعیت به‌صورت رشته) که در حافظه مانده باشد.
    if (typeof state === 'string' && state && state !== 'all') return { status: state };
    return Object.create(null);
  }

  function setModuleFilter(moduleKey, key, value) {
    const state = Object.assign(Object.create(null), moduleFilterState(moduleKey));
    if (!value || value === 'all') delete state[key];
    else state[key] = value;
    // فهرست شهرها به «مکان» وابسته است؛ با تغییر آن، شهر انتخاب‌شده پاک می‌شود.
    if (key === 'placeField') delete state.place;
    filterState[moduleKey] = state;
    return state;
  }

  function clearModuleFilters(moduleKey) {
    filterState[moduleKey] = Object.create(null);
  }

  function hasActiveFilters(moduleKey) {
    return Object.keys(moduleFilterState(moduleKey)).length > 0;
  }

  function recordMatchesFilters(moduleKey, record, data) {
    const state = moduleFilterState(moduleKey);
    const filters = LIST_FILTERS[moduleKey] || [];
    return filters.every(function (filter) {
      if (filter.control) return true; // کنترل کمکی (مثل «مکان») خودش داده را فیلتر نمی‌کند
      const value = state[filter.key];
      if (value == null || value === '' || value === 'all') return true;
      if (filter.match) return filter.match(record, value, state, data);
      return String(record[filter.key] == null ? '' : record[filter.key]) === String(value);
    });
  }

  const specs = {
    employees: {
      title: 'کارکنان', singular: 'کارمند',
      subtitle: 'پروندهٔ پرسنلی، نوع کار، محل خدمت، شیفت و وضعیت روزانه',
      fields: [
        {key:'firstName',label:'نام',required:true},
        {key:'lastName',label:'نام خانوادگی',required:true},
        // شمارهٔ پرسنلی فقط رقم می‌پذیرد؛ حروف و علائم هنگام تایپ حذف می‌شوند و در ذخیره هم دوباره پاک‌سازی می‌شود.
        {key:'personnelId',label:'شمارهٔ پرسنلی',digits:true,placeholder:'مثلاً ۱۰۲۳'},
        {key:'nationalId',label:'کد ملی',placeholder:'۱۰ رقم'},
        {key:'mobile',label:'شمارهٔ تلفن همراه اصلی',type:'tel'},
        {key:'jobTitle',label:'عنوان شغلی',type:'select',required:true,listKey:'jobTitles',options:['اپراتور','تکنسین','سرپرست شیفت','کارشناس ایمنی','کارشناس HSE','راننده','نگهبان','انباردار','سایر']},
        {key:'employmentType',label:'نوع استخدام',type:'select',required:true,listKey:'employmentTypes',options:['رسمی','پیمانی','قراردادی','شرکتی','سایر']},
        {key:'hireDate',label:'تاریخ استخدام',type:'jalali'},
        {key:'workplace',label:'محل سمت سازمانی',type:'select',required:true,listKey:'workplaces',options:['اهواز','آبادان','اندیمشک','ماهشهر','بندر امام','آغاجاری','سایر']},
        // «واحد» یعنی واحد شغلی/سازمانی (برق، مکانیک، ابزار دقیق و …)؛ هیچ ارتباطی با شهر و مکان ندارد.
        {key:'unit',label:'واحد',type:'select',listKey:'jobUnits',options:['برق','مکانیک','ابزار دقیق','بهره‌برداری','تعمیرات','ایمنی و آتش‌نشانی','مخابرات','انبار','اداری و مالی','سایر']},
        // «محل خدمت فعلی» از فهرست مشترک مکان‌ها و محل‌ها انتخاب می‌شود، نه نوشتن آزاد.
        {key:'assignedWorkplace',label:'محل خدمت فعلی',type:'select',listKey:'workplaces'},
        {key:'workType',label:'نوع شیفت کاری',type:'select',required:true,listKey:'workTypes',options:['روزکار ثابت','شیفت کاری']},
        {key:'shiftPattern',label:'الگوی شیفت',type:'select',listKey:'shiftPatterns',dependsOn:{key:'workType',values:['شیفت کاری','شیفتی']},options:['۱۲ ساعته روز/شب','۲۴/۴۸','۸ ساعته سه‌شیفت','۱۲ ساعته شب','سایر']},
        {key:'maritalStatus',label:'وضعیت تأهل',type:'select',listKey:'maritalStatuses',options:['مجرد','متأهل']},
        {key:'childrenCount',label:'تعداد فرزند',type:'number',min:1,max:20,placeholder:'۱ تا ۲۰',dependsOn:{key:'maritalStatus',values:['متأهل']}},
        {key:'notes',label:'توضیحات',type:'textarea',wide:true},
        {key:'status',label:'وضعیت جاری',type:'select',required:true,listKey:'employeeStatuses',formHidden:true,options:['آماده‌کار','در حال کار','شیفت','مأموریت','مرخصی','استراحت','اضافه‌کار','غیرفعال']},
        {key:'deploymentPoint',label:'محل استقرار',type:'select',listKey:'operationalPoints',formHidden:true,options:['پارکینگ مرکزی','تعمیرگاه مرکزی','انبار مرکزی','محور جاده']},
        {key:'photo',label:'عکس پرسنلی',type:'file',accept:'image/*'}
      ],
      // چیدمان پنجرهٔ ثبت کارمند: هر ردیف آرایه‌ای از کلید فیلدهاست و همان‌جا و به همان ترتیب دیده می‌شود.
      layout: [
        ['firstName','lastName'],
        ['personnelId','nationalId','mobile'],
        ['jobTitle','employmentType','hireDate'],
        ['workplace','unit','assignedWorkplace'],
        ['workType','shiftPattern'],
        ['maritalStatus','childrenCount'],
        ['notes'],
        ['status','deploymentPoint','photo']
      ],
      columns: ['personnelId','firstName','lastName','jobTitle','workType','employmentType','workplace','assignedWorkplace','status']
    },
    missions: {
      title: 'مأموریت‌ها', singular: 'مأموریت',
      subtitle: 'ثبت افراد، خودرو و راننده، محدودهٔ عملیاتی، آلودگی و نتیجهٔ مأموریت',
      fields: [
        {key:'employeeId',label:'نام و نام خانوادگی',type:'select',source:'employees',required:true},
        // همراهان: فهرست کامل کارکنان با جستجو؛ می‌توان چند نفر را تیک زد و یک‌جا افزود.
        // نام‌های انتخاب‌شده زیر همان ردیف با رنگ متفاوت خوانا نمایش داده می‌شوند.
        {key:'crewIds',label:'کارکنان همراه',type:'multi-check',source:'employees',showChosen:true,
          hint:'جستجو کن، هر تعداد نفر را تیک بزن و «افزودن همراهان» را بزن.'},
        // خودروها: هر خودروی تیک‌خورده یک کادر راننده می‌گیرد که فقط از افراد همین مأموریت پر می‌شود.
        {key:'vehicleIds',label:'خودرو یا خودروها',type:'multi-check',source:'vehicles',driversFrom:'crewIds',
          hint:'برای هر خودروی انتخاب‌شده، راننده‌اش را از میان کارکنان همین مأموریت مشخص کن.'},
        {key:'title',label:'عنوان مأموریت',type:'select',required:true,listKey:'missionTitles',options:['بازدید دوره‌ای خط','رفع نشتی','نظارت بر جوشکاری','بررسی انشعاب','پایش ایمنی','سرویس تجهیزات','مأموریت اضطراری','سایر']},
        {key:'missionType',label:'نوع مأموریت',type:'select',required:true,listKey:'missionTypes',options:['نظارت بر جوشکاری','بررسی انشعاب یا نشتی','بررسی آلودگی خاک یا آب','بازدید ایستگاه','سرویس تجهیزات','بازدید ایمنی','سایر']},
        {key:'status',label:'وضعیت مأموریت',type:'select',required:true,listKey:'missionStatuses',options:['برنامه‌ریزی‌شده','در جریان','انجام‌شده','لغو‌شده']},
        // مبدأ و مقصد فقط از فهرست مشترک مکان‌ها انتخاب می‌شوند («لیست»، نه نوشتن آزاد)؛
        // همان فهرستی که شهر، محل خدمت و محدودهٔ عملیاتی از آن می‌آیند و با «+» بزرگ می‌شود.
        {key:'origin',label:'مبدأ',type:'select',listKey:'places'},
        {key:'destination',label:'مقصد',type:'select',listKey:'places'},
        // محدودهٔ عملیاتی یک فهرست مدیریت‌شدنی است: شهر، روستا، ایستگاه مخابراتی، ایستگاه برق،
        // رکتیفایر، مرکز انتقال نفت و هر چیز دیگر؛ با «+» اضافه و در تنظیمات فهرست‌ها کم می‌شود.
        {key:'operationalRange',label:'محدودهٔ عملیاتی',type:'select',listKey:'operationalRanges',
          options:['شهر','روستا','ایستگاه مخابراتی','ایستگاه برق','ایستگاه رکتیفایر','مرکز انتقال نفت']},
        {key:'startAt',label:'تاریخ آغاز مأموریت',type:'jalali-datetime',required:true},
        {key:'endAt',label:'تاریخ پایان مأموریت',type:'jalali-datetime'},
        {key:'pipelineSize',label:'سایز خط لوله',type:'select',listKey:'pipelineSizes',options:['۴','۶','۸','۱۰','۱۲','۱۴','۱۶','۲۰','۲۴','۳۰','۳۶']},
        {key:'productType',label:'نوع فرآورده',type:'select',listKey:'products',options:['نفت خام','نفت گاز','بنزین','نفت سفید','گاز مایع','آب آلوده','سایر']},
        {key:'hasPollution',label:'آلودگی',type:'select',options:['ندارد','دارد']},
        // ردیف‌های آلودگی فقط وقتی «آلودگی: دارد» انتخاب شود باز می‌شوند.
        // آلودگی خاکی و آبی، هر کدام «میزان» خودش را روبروی همان کادر می‌گیرد:
        // خاکی بر حسب متر مکعب و آبی بر حسب لیتر. هر میزان فقط وقتی باز می‌شود که
        // همان نوع آلودگی «دارد» باشد (و در کل هم «آلودگی: دارد»).
        {key:'soilPollution',label:'آلودگی خاکی',type:'select',options:['دارد','ندارد'],dependsOn:{key:'hasPollution',values:['دارد']}},
        {key:'soilPollutionAmount',label:'میزان آلودگی خاکی (متر مکعب)',type:'number',min:0,step:'0.01',
          dependsOn:[{key:'hasPollution',values:['دارد']},{key:'soilPollution',values:['دارد']}]},
        {key:'waterPollution',label:'آلودگی آبی',type:'select',options:['دارد','ندارد'],dependsOn:{key:'hasPollution',values:['دارد']}},
        {key:'waterPollutionAmount',label:'میزان آلودگی آبی (لیتر)',type:'number',min:0,step:'0.01',
          dependsOn:[{key:'hasPollution',values:['دارد']},{key:'waterPollution',values:['دارد']}]},
        {key:'pollutionCleared',label:'در پایان عملیات رفع آلودگی انجام شد؟',type:'select',options:['انجام شد','انجام نشد'],dependsOn:{key:'hasPollution',values:['دارد']}},
        {key:'attachments',label:'پیوست‌های گزارش',type:'file-multiple',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx'},
        {key:'result',label:'شرح کار و نتیجه',type:'textarea',wide:true,placeholder:'کار انجام‌شده و نتیجهٔ نهایی مأموریت'}
      ],
      // چیدمان پنجرهٔ ثبت مأموریت: هر ردیف یک شبکهٔ مستقل و به همان ترتیب کار.
      // ردیف ۸ تا ۱۰ (رفع آلودگی، پیوست، نتیجه) با «کامنت» روی مأموریت هم اصلاح می‌شوند.
      layout: [
        ['employeeId','crewIds'],
        ['vehicleIds'],
        ['title','missionType','status'],
        ['origin','destination','operationalRange'],
        ['startAt','endAt'],
        ['pipelineSize','productType','hasPollution'],
        ['soilPollution','soilPollutionAmount','waterPollution','waterPollutionAmount'],
        ['pollutionCleared'],
        ['attachments'],
        ['result']
      ],
      columns: ['title','missionType','startAt','employeeId','crewIds','vehicleIds','status']
    },
    leaves: {
      title: 'مرخصی‌ها', singular: 'درخواست مرخصی',
      subtitle: 'ثبت مرخصی فردی، وضعیت درخواست و زمان بازگشت',
      fields: [
        {key:'employeeId',label:'کارمند',type:'select',source:'employees'},
        {key:'leaveType',label:'نوع مرخصی',type:'select',required:true,listKey:'leaveTypes',options:['استحقاقی','استعلاجی','بدون حقوق','ساعتی','سایر']},
        {key:'startDate',label:'از تاریخ شمسی',type:'jalali',required:true},
        {key:'endDate',label:'تا تاریخ شمسی',type:'jalali',required:true},
        {key:'expectedReturn',label:'بازگشت مورد انتظار',type:'jalali'},
        {key:'actualReturn',label:'تاریخ حضور واقعی',type:'jalali'},
        {key:'status',label:'وضعیت درخواست',type:'select',required:true,listKey:'leaveStatuses',options:['در انتظار بررسی','تأییدشده','ردشده','استفاده‌شده']},
        {key:'reason',label:'دلیل و توضیحات',type:'textarea',wide:true}
      ],
      columns: ['employeeId','leaveType','startDate','endDate','expectedReturn','status']
    },
    vehicles: {
      title: 'خودروها', singular: 'خودرو',
      subtitle: 'مشخصات ناوگان، موقعیت فعلی، خرابی‌ها، کیلومتر و سرویس',
      fields: [
        {key:'name',label:'نام یا عنوان خودرو',type:'select',required:true,listKey:'vehicleNames',options:['خودروی آتشنشانی ۱','خودروی پشتیبانی ۱','وانت عملیاتی ۱','سواری اداری ۱','مینیبوس ایاب و ذهاب']},
        {key:'vehicleType',label:'نوع خودرو',type:'select',listKey:'vehicleTypes',options:['خودروی آتش‌نشانی','خودروی پشتیبانی','وانت','سواری','مینی‌بوس','سایر']},
        {key:'model',label:'مدل خودرو'},
        {key:'companyPlate',label:'پلاک سازمانی'},
        {key:'policePlate',label:'پلاک انتظامی'},
        {key:'status',label:'وضعیت عملیاتی',type:'select',required:true,listKey:'vehicleStatuses',options:['آماده','در سرویس','خارج از سرویس','در تعمیر']},
        {key:'healthStatus',label:'وضعیت سلامت',type:'select',listKey:'healthStatuses',options:['سالم','نیازمند بررسی','دارای نقص','در حال تعمیر']},
        {key:'currentCity',label:'شهر فعلی',type:'select',listKey:'workplaces',options:['اهواز','آبادان','اندیمشک','ماهشهر','بندر امام','آغاجاری','سایر']},
        {key:'currentPlace',label:'محل یا نقطهٔ استقرار'},
        {key:'occupants',label:'سرنشینان فعلی',type:'textarea',wide:true},
        {key:'currentKm',label:'کیلومتر فعلی',type:'number',min:0},
        {key:'currentKmRecordedAt',label:'زمان آخرین ثبت کیلومتر',type:'text',placeholder:'با ثبت کیلومتر به‌صورت خودکار ثبت می‌شود'},
        {key:'nextServiceKm',label:'کیلومتر سرویس بعدی',type:'number',min:0},
        {key:'fuelAllowanceKm',label:'کیلومتر مبنای دریافت هزینه سوخت',type:'number',min:0},
        {key:'fuelKm',label:'کیلومتر ثبت سوخت',type:'number',min:0},
        {key:'lastOilKm',label:'کیلومتر آخرین تعویض روغن',type:'number',min:0},
        {key:'nextOilKm',label:'کیلومتر سرویس روغن بعدی',type:'number',min:0},
        {key:'lastServiceType',label:'آخرین نوع سرویس',type:'select',listKey:'vehicleServiceTypes',options:['تعویض روغن','سرویس دوره‌ای','سوخت‌گیری','تعویض فیلتر','معاینه فنی','تعمیر اضطراری']},
        {key:'faults',label:'خرابی‌ها و نقص‌های باز',type:'textarea',wide:true},
        {key:'faultsResolved',label:'ایرادهای رفع‌شده',type:'textarea',wide:true},
        {key:'equipment',label:'تجهیزات همراه خودرو',type:'textarea',wide:true},
        {key:'notes',label:'سوابق و توضیحات',type:'textarea',wide:true},
        {key:'maintenanceLog',label:'سوابق ثبت سرویس، سوخت و کیلومتر (هر مورد در یک خط)',type:'textarea',wide:true,placeholder:'تاریخ | کیلومتر | نوع اقدام | توضیح'},
        {key:'attachments',label:'پیوست‌ها',type:'file-multiple',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx'}
      ],
      columns: ['name','vehicleType','companyPlate','policePlate','status','currentCity','currentPlace','currentKm','nextOilKm','relatedMissions']
    },
    stations: {
      title: 'ایستگاه‌ها و مراکز', singular: 'ایستگاه / مرکز',
      subtitle: 'نوع محل، محل مکان، جایگاه روی خطوط انتقال، مخازن، تجهیزات دوار و وضعیت عملیاتی',
      fields: [
        {key:'name',label:'نام ایستگاه و مرکز',required:true},
        {key:'placeType',label:'نوع محل',type:'select',required:true,listKey:'placeTypes',stationTypeTrigger:true,options:['مرکز انتقال نفت','ایستگاه مخابراتی','ایستگاه برق','ایستگاه تقویت فشار','ایستگاه پمپاژ','ایستگاه اندازه‌گیری','ایستگاه آتش‌نشانی','ایستگاه گازسنجی','ایستگاه توزیع','سایر']},
        {key:'place',label:'محل مکان',type:'place',required:true,dependsOn:'placeType'},
        {key:'status',label:'وضعیت عملیاتی',type:'select',listKey:'stationStatuses',options:['در سرویس','نیمه‌فعال','خارج از سرویس','در تعمیر','غیرفعال']},
        {key:'personInCharge',label:'نام رئیس / مسئول',type:'people',placeholder:'جستجو در مخاطبان دفترچه تلفن یا نام جدید'},
        {key:'city',label:'شهر محل استقرار',type:'select',listKey:'workplaces',options:['اهواز','آبادان','اندیمشک','ماهشهر','بندر امام','آغاجاری','سایر']},
        {key:'address',label:'آدرس محل',type:'textarea',wide:true},
        {key:'coordinates',label:'موقعیت جغرافیایی',placeholder:'عرض و طول؛ مثلاً ۳۱٫۳۲۰۵، ۴۸٫۶۶۹۰'},
        {key:'description',label:'توضیحات',type:'textarea',wide:true},
        {key:'distances',label:'فاصله تا شهرها',type:'rows',wide:true,addLabel:'+ افزودن شهر',
          columns:[{key:'city',label:'شهر',listKey:'workplaces'},{key:'km',label:'فاصله (کیلومتر)',type:'number',min:0}]},
        {key:'branches',label:'خطوط و شاخه‌های عبوری',type:'rows',wide:true,addLabel:'+ افزودن شاخه',
          hint:'برای هر خط یا شاخه، ترتیب قرارگیری روی همان شاخه و موقعیت مکانی جداگانه تعیین می‌شود.',
          columns:[{key:'line',label:'خط / شاخه',listKey:'pipelineLines',options:['خط اصلی','شاخهٔ شمالی','شاخهٔ جنوبی','خط فرعی','خط صادراتی']},{key:'order',label:'ترتیب (عدد طبیعی)',type:'number',min:1,step:1},{key:'x',label:'موقعیت افقی (۰ تا ۱۰۰)',type:'number',min:0,max:100},{key:'y',label:'موقعیت عمودی (۰ تا ۱۰۰)',type:'number',min:0,max:100}]},
        {key:'products',label:'فرآورده‌ها و خطوط انتقال',type:'rows',wide:true,addLabel:'+ افزودن فرآورده',hideFor:['ایستگاه مخابراتی'],
          hint:'هر ایستگاه یا مرکز می‌تواند چند فرآورده با خطوط و سایزهای مختلف داشته باشد.',
          columns:[{key:'product',label:'فرآورده',listKey:'products'},{key:'size',label:'سایز خط (اینچ)',listKey:'pipelineSizes'},{key:'line',label:'خط / شاخه',listKey:'pipelineLines'}]},
        {key:'tanks',label:'مخازن ذخیره',type:'rows',wide:true,addLabel:'+ افزودن مخزن',onlyFor:['مرکز انتقال نفت'],
          columns:[{key:'product',label:'نوع فرآورده ذخیره‌ای',listKey:'products'},{key:'count',label:'تعداد',type:'number',min:1,step:1},{key:'volume',label:'حجم هر مخزن',type:'number',min:0},{key:'diameter',label:'قطر (متر)',type:'number',min:0},{key:'height',label:'ارتفاع (متر)',type:'number',min:0}]},
        {key:'rotating',label:'تجهیزات دوار (توربین و الکتروموتور)',type:'rows',wide:true,addLabel:'+ افزودن تجهیز',onlyFor:['مرکز انتقال نفت'],
          columns:[{key:'kind',label:'نوع تجهیز',options:['توربین','الکتروموتور','کمپرسور']},{key:'model',label:'مدل / سازنده'},{key:'count',label:'تعداد',type:'number',min:1,step:1},{key:'power',label:'توان (کیلووات)',type:'number',min:0}]},
        {key:'generators',label:'دیزل ژنراتورها',type:'rows',wide:true,addLabel:'+ افزودن دیزل ژنراتور',onlyFor:['مرکز انتقال نفت'],
          columns:[{key:'model',label:'مدل / سازنده'},{key:'count',label:'تعداد',type:'number',min:1,step:1},{key:'power',label:'توان (کیلووات)',type:'number',min:0}]}
      ],
      columns: ['name', 'placeType', 'place', 'city', 'status', 'personInCharge']
    },
    gasmeters: {
      title: 'گازسنج‌ها', singular: 'گازسنج',
      subtitle: 'مشخصات دستگاه، محل و مسئول، کالیبراسیون، تعمیرات و گواهی',
      fields: [
        {key:'code',label:'کد دستگاه',required:true},
        {key:'model',label:'مدل دستگاه',type:'select',listKey:'gasModels',options:['MX4','MX6','Tetra','Altair 4X','Altair 5X','Ventis Pro','GasAlert MicroClip','سایر']},
        {key:'sensorType',label:'نوع سنسور گازسنج',type:'select',listKey:'gasSensorTypes',options:['گازسنج چهارکاره','گازسنج تک‌کاره','آشکارساز H₂S','آشکارساز LEL','آشکارساز O₂','سایر']},
        {key:'serial',label:'شمارهٔ سریال',required:true},
        {key:'gases',label:'گازهای قابل‌اندازه‌گیری',type:'checks',options:['CO','O₂','LEL','H₂S']},
        {key:'sensorCount',label:'تعداد سنسورها (محاسبه خودکار)',type:'number',min:0},
        {key:'status',label:'وضعیت دستگاه',type:'select',required:true,listKey:'gasStatuses',options:['آماده استفاده','در کالیبراسیون','استندبای منطقه','خارج از سرویس','در تعمیر']},
        {key:'healthStatus',label:'وضعیت سلامت',type:'select',listKey:'healthStatuses',options:['سالم','نیازمند بررسی','دارای نقص','در حال تعمیر']},
        {key:'location',label:'محل استقرار',type:'select',listKey:'deploymentLocations',options:['پارکینگ مرکزی','تعمیرگاه مرکزی','انبار مرکزی','محور جاده','دفتر مرکزی','سایر']},
        {key:'stationId',label:'مرکز / ایستگاه استقرار',type:'select',source:'stations',hint:'اگر خالی بماند، آخرین موقعیت ثبت‌شده در سوابق همین دستگاه مبنای استقرار است.'},
        {key:'positionKind',label:'نوع موقعیت استقرار',type:'select',options:['ساختمان','خودرو','محوطه','سایر']},
        {key:'positionDetail',label:'ساختمان / خودرو (جزئیات)',placeholder:'مثلاً اتاق فرمان عملیات یا خودرو پلاک ۱۲'},
        {key:'locationSince',label:'تاریخ استقرار فعلی',type:'jalali'},
        {key:'locationHistory',label:'سوابق تغییر محل استقرار (هر مورد در یک خط)',type:'textarea',wide:true,placeholder:'تاریخ | محل قبلی | محل جدید | توضیح'},
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
      columns: ['code','model','sensorType','serial','stationId','status','location','calibrationEnd','responsibleId']
    },
    notes: {
      title: 'یادداشت‌ها و پیگیری‌ها', singular: 'اقدام / پیگیری',
      subtitle: 'نامه‌ها، خرید، استعلام، ارسال تجهیزات، بازرسی و اقدام‌های محوله',
      fields: [
        {key:'title',label:'عنوان',required:true},
        {key:'actionType',label:'نوع مورد',type:'select',required:true,listKey:'actionTypes',options:['نامه اداری','درخواست خرید','استعلام','برآورد هزینه','برآورد قیمت','برنامه‌ریزی مانور','تعمیر خودرو','ارسال کالیبراسیون','پاسخ نامه','پیگیری قطعه','ارسال تجهیزات','بازدید','بازرسی','ممیزی','اقدام اصلاحی','یادداشت عمومی','سایر']},
        {key:'letterNumber',label:'شماره نامه'},
        {key:'letterDate',label:'تاریخ نامه شمسی',type:'jalali'},
        {key:'purchaseRequestNumber',label:'شماره درخواست خرید'},
        {key:'pmrNumber',label:'شماره PMR'},
        {key:'dueDays',label:'مهلت اقدام (روز)',type:'number',min:0},
        {key:'comments',label:'گزارش پیگیری و کامنت‌ها (هر ثبت در یک خط)',type:'textarea',wide:true,placeholder:'تاریخ و ساعت | پیگیر | شرح اقدام | وضعیت'},
        {key:'date',label:'تاریخ ثبت شمسی',type:'jalali',required:true},
        {key:'dueDate',label:'موعد پیگیری شمسی',type:'jalali'},
        {key:'related',label:'موضوع یا محل مرتبط'},
        {key:'responsibleId',label:'مسئول پیگیری',type:'select',source:'employees'},
        {key:'status',label:'وضعیت',type:'select',required:true,listKey:'noteStatuses',options:['شروع‌نشده','در حال انجام','در انتظار پاسخ','ارجاع‌شده','تکمیل‌شده','لغوشده','عقب‌افتاده']},
        {key:'body',label:'شرح و نتیجهٔ پیگیری',type:'textarea',wide:true,required:true},
        {key:'attachments',label:'پیوست‌ها',type:'file-multiple',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx'}
      ],
      columns: ['title','actionType','date','dueDate','related','responsibleId','status']
    },
    programs: {
      title: 'برنامه‌ها و پرونده‌های اقدام', singular: 'برنامه',
      subtitle: 'برنامه‌ریزی کارها، نامه‌نگاری، خرید، اقدامات مرحله‌ای و بستن پرونده',
      fields: [
        {key:'title',label:'عنوان برنامه / پرونده',required:true},
        {key:'programCategory',label:'دستهٔ برنامه',type:'select',required:true,listKey:'programCategories',options:['هدف','برنامه فعالیت','مانور','روتین','دوره آموزشی','سایر']},
        {key:'programType',label:'نوع برنامه',type:'select',required:true,listKey:'programTypes',options:['مانور','تعمیر تجهیز','تعمیر خودرو','کالیبراسیون','بازرسی','اقدام اصلاحی','درخواست خرید','پروژه عملیاتی','سایر']},
        {key:'location',label:'محل اجرا یا عملیات',type:'select',listKey:'maneuverLocations',options:['پارکینگ مرکزی','تعمیرگاه مرکزی','انبار مرکزی','دفتر مرکزی','ایستگاه شماره ۱','محور جاده','سایر']},
        {key:'plannedDate',label:'تاریخ برنامه‌ریزی شمسی',type:'jalali'},
        {key:'dueDate',label:'مهلت نهایی شمسی',type:'jalali'},
        {key:'responsibleId',label:'مسئول اصلی',type:'select',source:'employees'},
        {key:'reportWriterId',label:'مسئول تهیه گزارش',type:'select',source:'employees'},
        {key:'purchaseRequestNumber',label:'شماره درخواست خرید'},
        {key:'pmrNumber',label:'شماره PMR'},
        {key:'letterReferences',label:'شماره و تاریخ مکاتبات'},
        {key:'initialReportStatus',label:'وضعیت گزارش اولیه',type:'select',listKey:'reportStatuses',options:['تهیه نشده','در حال تهیه','ارسال شده','نیازمند اصلاح']},
        {key:'finalReportDue',label:'مهلت گزارش نهایی شمسی',type:'jalali'},
        {key:'finalReportSent',label:'تاریخ ارسال گزارش نهایی شمسی',type:'jalali'},
        {key:'status',label:'وضعیت پرونده',type:'select',required:true,listKey:'programStatuses',options:['برنامه‌ریزی‌شده','در حال اقدام','در انتظار پاسخ','متوقف','تکمیل‌شده','لغوشده']},
        {key:'actionsLog',label:'فهرست اقدامات مرحله‌ای (هر خط یک اقدام)',type:'textarea',wide:true,placeholder:'تاریخ | نفر/واحد | اقدام انجام‌شده | شماره نامه/درخواست | وضعیت'},
        {key:'body',label:'شرح، نتیجه و مستندات',type:'textarea',wide:true},
        {key:'attachments',label:'پیوست‌های پرونده',type:'file-multiple',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx'}
      ],
      columns: ['title','programType','location','plannedDate','responsibleId','status','finalReportDue']
    },
    faults: {
      title: 'اشکالات و رفع اشکال', singular: 'اشکال',
      subtitle: 'ثبت اشکال خودرو و تجهیزات با روند رفع، مسئول و تاریخ رفع',
      fields: [
        {key:'title',label:'عنوان اشکال',required:true,placeholder:'مثلاً نشتی روغن گیربکس'},
        {key:'vehicleId',label:'خودرو',type:'select',source:'vehicles'},
        {key:'category',label:'دستهٔ اشکال',type:'select',listKey:'faultCategories',options:['مکانیکی','برقی','الکترونیکی','سنسور','بدنه','نرم‌افزاری','سایر']},
        {key:'priority',label:'اولویت',type:'select',required:true,listKey:'faultPriorities',options:['کم','متوسط','زیاد','بحرانی']},
        {key:'reportedAt',label:'تاریخ ثبت شمسی',type:'jalali',required:true},
        {key:'reportedById',label:'ثبت‌کننده',type:'select',source:'employees'},
        {key:'description',label:'شرح اشکال',type:'textarea',wide:true,required:true},
        {key:'status',label:'وضعیت رفع',type:'select',required:true,listKey:'faultStatuses',options:['ثبت‌شده','در حال بررسی','در حال تعمیر','رفع شد','بسته‌شده']},
        {key:'progress',label:'درصد پیشرفت رفع',type:'number',min:0,max:100},
        {key:'steps',label:'روند رفع اشکال (هر مورد در یک خط)',type:'textarea',wide:true,placeholder:'تاریخ | اقدام انجام‌شده | انجام‌دهنده | وضعیت'},
        {key:'resolvedAt',label:'تاریخ رفع شمسی',type:'jalali'},
        {key:'responsibleId',label:'مسئول رفع',type:'select',source:'employees'},
        {key:'attachments',label:'پیوست‌ها',type:'file-multiple',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx'}
      ],
      columns: ['title','vehicleId','category','priority','reportedAt','status','progress']
    },
    maintenance: {
      title: 'سوابق سرویس و تعمیر', singular: 'سابقهٔ سرویس',
      subtitle: 'دفتر سرویس هر خودرو: تاریخ، کیلومتر، نوع اقدام و سرویس بعدی',
      fields: [
        {key:'vehicleId',label:'خودرو',type:'select',source:'vehicles',required:true},
        {key:'date',label:'تاریخ سرویس شمسی',type:'jalali',required:true},
        {key:'km',label:'کیلومتر در زمان سرویس',type:'number',min:0},
        {key:'type',label:'نوع اقدام',type:'select',required:true,listKey:'maintenanceTypes',options:['سرویس دوره‌ای','تعویض روغن','تعویض فیلتر','تعمیر مکانیکی','تعمیر برقی','معاینه فنی','تعویض لاستیک','سایر']},
        {key:'description',label:'شرح اقدام و قطعات',type:'textarea',wide:true,required:true},
        {key:'nextServiceKm',label:'کیلومتر سرویس بعدی',type:'number',min:0},
        {key:'nextServiceDate',label:'تاریخ سرویس بعدی شمسی',type:'jalali'},
        {key:'status',label:'وضعیت',type:'select',required:true,listKey:'maintenanceStatuses',options:['انجام‌شده','در انتظار قطعه','در حال انجام','لغوشده']},
        {key:'attachments',label:'پیوست‌ها (فاکتور، رسید)',type:'file-multiple',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx'}
      ],
      columns: ['vehicleId','date','type','km','nextServiceDate','status']
    },
    gaslogs: {
      title: 'سوابق گازسنج', singular: 'سابقهٔ گازسنج',
      subtitle: 'قرائت، کالیبراسیون، تعمیر و جابه‌جایی هر گازسنج با تاریخ و مسئول',
      fields: [
        {key:'gasmeterId',label:'گازسنج',type:'select',source:'gasmeters',required:true},
        {key:'date',label:'تاریخ شمسی',type:'jalali',required:true},
        {key:'logType',label:'نوع سابقه',type:'select',required:true,listKey:'gasLogTypes',options:['ثبت قرائت','کالیبراسیون','تعمیر','جابه‌جایی','تست عملکرد','ارسال برای کالیبراسیون','دریافت از کالیبراسیون','ارسال گروهی برای کالیبراسیون','دریافت گروهی از کالیبراسیون','سایر']},
        {key:'value',label:'مقدار قرائت یا نتیجه'},
        {key:'location',label:'محل استقرار در این تاریخ',type:'select',listKey:'deploymentLocations',options:['پارکینگ مرکزی','تعمیرگاه مرکزی','انبار مرکزی','محور جاده','دفتر مرکزی','سایر']},
        {key:'stationId',label:'مرکز / ایستگاه در این تاریخ',type:'select',source:'stations'},
        {key:'positionKind',label:'نوع موقعیت',type:'select',options:['ساختمان','خودرو','محوطه','سایر']},
        {key:'positionDetail',label:'ساختمان / خودرو (جزئیات)'},
        {key:'locationSince',label:'تاریخ استقرار',type:'jalali'},
        {key:'healthStatus',label:'وضعیت سلامت در این تاریخ',type:'select',listKey:'healthStatuses',options:['سالم','نیازمند بررسی','دارای نقص','در حال تعمیر']},
        {key:'calibrationStart',label:'شروع کالیبراسیون',type:'jalali'},
        {key:'calibrationEnd',label:'پایان کالیبراسیون',type:'jalali'},
        {key:'carrierId',label:'راننده / ارسال‌کننده به کالیبراسیون',type:'select',source:'employees'},
        {key:'receiverId',label:'برگرداننده / تحویل‌گیرنده از کالیبراسیون',type:'select',source:'employees'},
        {key:'description',label:'شرح و توضیحات',type:'textarea',wide:true},
        {key:'operatorId',label:'ثبت‌کننده',type:'select',source:'employees'},
        {key:'attachments',label:'پیوست‌ها',type:'file-multiple',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx'}
      ],
      columns: ['gasmeterId','date','logType','stationId','carrierId','receiverId','operatorId']
    }
  };

  function createEmptyState() {
    const state = {
      schemaVersion: 2,
      settings: { employeeCustomFields: '' },
      references: { placesByType: {}, lineColors: {} },
      history: [],
      shifts: [],
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
    out.employees.forEach(function (record) {
      if ((record.firstName || record.lastName) && !record.fullName) return;
      const whole = String(record.fullName || '').trim();
      if (!record.firstName && !record.lastName && whole) {
        const parts = whole.split(/\s+/);
        record.firstName = parts.shift() || '';
        record.lastName = parts.join(' ');
      }
      delete record.fullName;
    });
    out.programs.forEach(function (record) {
      if (!Array.isArray(record.stages)) record.stages = [];
      if (!record.programCategory) record.programCategory = record.programType === 'مانور' ? 'مانور' : 'برنامه فعالیت';
    });
    if (value.settings && typeof value.settings === 'object') out.settings = Object.assign(out.settings, value.settings);
    if (value.references && typeof value.references === 'object') out.references = Object.assign(out.references, value.references);
    migrateReferenceAliases(out);
    if (!out.references.placesByType || typeof out.references.placesByType !== 'object') out.references.placesByType = {};
    if (!out.references.lineColors || typeof out.references.lineColors !== 'object') out.references.lineColors = {};
    out.stations.forEach(function (record) {
      if (!record.placeType && record.stationType) record.placeType = record.stationType;
      if (!record.place && record.code) record.place = String(record.code);
      if (record.place && record.placeType) placeRegister(record.placeType, record.place);
    });
    if (Array.isArray(value.history)) out.history = value.history.slice(-3000);
    if (Array.isArray(value.shifts)) out.shifts = value.shifts.filter(function(item){return item&&typeof item==='object';});
    out.schemaVersion = 2;
    out.updatedAt = value.updatedAt || '';
    ensureReferenceLists(out);
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
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
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

  async function readLegacyLocalStorage() {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return null;
      return normalizeState(await window.ATLAS_SECURE.openText(raw));
    } catch (error) {
      return null;
    }
  }

  // دادهٔ ذخیره‌شده یا رمزنگاری‌شده است یا نسخهٔ قدیمی و متنی؛ هر دو خوانده می‌شوند.
  async function openStoredValue(stored) {
    if (!stored) return null;
    if (window.ATLAS_SECURE.isSealed(stored)) return await window.ATLAS_SECURE.open(stored);
    return stored;
  }

  function storageCryptoNote() {
    if (window.ATLAS_SECURE && window.ATLAS_SECURE.available()) return '';
    return 'رمزنگاری داده در این محیط (اتصال ناامن) پشتیبانی نمی‌شود؛ داده بدون رمز ذخیره می‌شود.';
  }

  function loadFromDb(database) {
    return new Promise(function (resolve, reject) {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(STORE_KEY);
      request.onsuccess = function () { resolve(request.result ? request.result.value : null); };
      request.onerror = function () { reject(request.error || new Error('Read failed')); };
    });
  }

  async function writeToDb(database, value) {
    const sealed = window.ATLAS_SECURE.available() ? await window.ATLAS_SECURE.seal(value) : value;
    return new Promise(function (resolve, reject) {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ id: STORE_KEY, value: sealed });
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error || new Error('Write failed')); };
      tx.onabort = function () { reject(tx.error || new Error('Write aborted')); };
    });
  }

  async function deleteFromDb(database, key) {
    return new Promise(function (resolve, reject) {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error || new Error('Delete failed')); };
      tx.onabort = function () { reject(tx.error || new Error('Delete aborted')); };
    });
  }

  async function initializeStorage() {
    const localCopy = await readLegacyLocalStorage();
    try {
      await openDb();
      const storedValue = await loadFromDb(db);
      let saved = null;
      let needsReseal = false;
      if (storedValue) {
        if (!window.ATLAS_SECURE.isSealed(storedValue)) {
          // نسخهٔ قدیمی و رمزنگاری‌نشده: خوانده و در اولین ذخیره رمزنگاری می‌شود.
          needsReseal = true;
        }
        try { saved = await openStoredValue(storedValue); }
        catch (error) {
          storageLocked = true;
          loadError = 'داده‌های ذخیره‌شده با کلید این دستگاه باز نشد؛ برای جلوگیری از پاک‌شدن، ذخیره‌سازی متوقف است. اطلاعات را از «بازیابی پشتیبان» برگردانید.';
        }
      }
      if (saved) {
        const databaseCopy = normalizeState(saved);
        const localIsNewer = !!(localCopy && localCopy.updatedAt &&
          (!databaseCopy.updatedAt || localCopy.updatedAt > databaseCopy.updatedAt));
        appData = localIsNewer ? localCopy : databaseCopy;
        if (localIsNewer || needsReseal) {
          try { await writeToDb(db, appData); }
          catch (writeError) { db = null; loadError = 'ذخیره‌سازی جایگزین مرورگر فعال شد.'; }
        }
      } else if (!storedValue) {
        appData = localCopy || createEmptyState();
        if (appData.updatedAt || MODULES.some(function (key) { return appData[key].length; })) {
          try { await writeToDb(db, appData); }
          catch (writeError) { db = null; loadError = 'ذخیره‌سازی جایگزین مرورگر فعال شد.'; }
        }
      } else {
        // داده هست ولی باز نشد: هیچ چیزی روی آن نوشته نمی‌شود تا اطلاعات از دست نرود.
        appData = createEmptyState();
      }
    } catch (error) {
      loadError = 'فضای ذخیره‌سازی پیشرفته در دسترس نیست؛ ذخیره‌سازی جایگزین مرورگر استفاده می‌شود.';
      appData = localCopy || createEmptyState();
      db = null;
    }
    const cryptoNote = storageCryptoNote();
    if (cryptoNote && !loadError) loadError = cryptoNote;
    ensureReferenceLists();
    ready = true;
    refreshCurrentView();
    applyDashboardLayout();
    refreshDashboard();
  }

  function saveState() {
    if (storageLocked) return Promise.resolve(false);
    appData.updatedAt = new Date().toISOString();
    saveQueue = saveQueue.then(async function () {
      const snapshot = snapshotJson();
      if (db) {
        try {
          await writeToDb(db, appData);
          lastSealed = snapshot;
          return true;
        } catch (error) {
          db = null;
          loadError = 'ذخیره‌سازی جایگزین مرورگر فعال شد.';
        }
      }
      try {
        localStorage.setItem(LEGACY_KEY, window.ATLAS_SECURE.available() ? await window.ATLAS_SECURE.sealText(appData) : JSON.stringify(appData));
        lastSealed = snapshot;
        return true;
      } catch (error) {
        toast('ذخیره انجام نشد؛ فضای ذخیره‌سازی این مرورگر کافی نیست.');
        return false;
      }
    });
    return saveQueue;
  }

  // ── شبکهٔ ایمنی ذخیره: اگر تغییری در داده‌ها مانده باشد، خودکار ذخیره می‌شود ──
  function snapshotJson() {
    try { return JSON.stringify(appData); } catch (error) { return ''; }
  }

  function scheduleAutoFlush(delay) {
    if (!ready || storageLocked) return;
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(function () {
      const current = snapshotJson();
      if (current && current !== lastSealed) saveState();
    }, delay || 400);
  }

  function flushNow() {
    if (!ready || storageLocked) return;
    window.clearTimeout(autosaveTimer);
    if (snapshotJson() !== lastSealed) saveState();
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
    let first, next;
    try {
      first = jalaliYearStart(jy);
      next = jalaliYearStart(jy + 1);
    } catch (error) {
      // سالی که تقویم مرورگر نمی‌تواند تبدیل کند، تاریخ معتبر نیست.
      return null;
    }
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

  // نام کامل کارمند از دو فیلد جدا ساخته می‌شود؛ رکوردهای قدیمی که فقط
  // fullName دارند هم پشتیبانی می‌شوند.
  function employeeName(person) {
    if (!person) return '';
    const joined = [person.firstName, person.lastName].map(function (part) {
      return String(part == null ? '' : part).trim();
    }).filter(Boolean).join(' ');
    return joined || String(person.fullName || '').trim();
  }

  function recordLabel(moduleKey, record) {
    if (!record) return specs[moduleKey] ? specs[moduleKey].singular : '';
    if (moduleKey === 'maintenance') {
      const vehicle = (appData.vehicles || []).find(function (item) { return String(item.id) === String(record.vehicleId); });
      return [vehicle ? vehicle.name : '', record.date ? formatJalali(record.date, false) : '', record.type].filter(Boolean).join(' · ') || 'سابقهٔ سرویس';
    }
    if (moduleKey === 'gaslogs') {
      const meter = (appData.gasmeters || []).find(function (item) { return String(item.id) === String(record.gasmeterId); });
      return [meter ? meter.code : '', record.date ? formatJalali(record.date, false) : '', record.logType].filter(Boolean).join(' · ') || 'سابقهٔ گازسنج';
    }
    if (moduleKey === 'faults') return record.title || 'اشکال';
    return (moduleKey === 'employees' ? employeeName(record) : '') || record.title || record.name || record.code || record.personnelId || record.serial || specs[moduleKey].singular;
  }

  function fieldsFor(moduleKey) {
    const fields = specs[moduleKey].fields.slice();
    if (moduleKey === 'employees') {
      customFieldDefs().forEach(function (def, index) {
        fields.push({
          key: 'customField' + (index + 1),
          label: def.label,
          custom: true,
          type: def.type,
          wide: def.type === 'textarea' || def.type === 'jalali-datetime'
        });
      });
    }
    return fields;
  }

  // در ثبت اشکال از مسیر خودرو، «نوع دارایی» و «گازسنج» در فرم نمی‌آیند.
  const FAULT_VEHICLE_HIDDEN_FIELDS = ['gasmeterId'];

  function formFields(moduleKey, vehicleScope) {
    // فیلدهایی که فقط در فهرست/فیلتر/گزارش لازم‌اند و در پنجرهٔ ثبت دیده نمی‌شوند.
    const fields = fieldsFor(moduleKey).filter(function (field) { return !field.formHidden; });
    if (moduleKey !== 'faults' || !vehicleScope) return fields;
    return fields.filter(function (field) { return FAULT_VEHICLE_HIDDEN_FIELDS.indexOf(field.key) < 0; });
  }

  // نوع هر فیلد سفارشی، شکل کادر ورودی را تعیین می‌کند.
  const CUSTOM_FIELD_TYPES = {
    text: 'متن',
    number: 'عدد',
    tel: 'شمارهٔ تماس',
    jalali: 'تاریخ شمسی',
    'jalali-datetime': 'تاریخ و ساعت',
    textarea: 'متن بلند'
  };

  function customFieldDefs() {
    return String(appData.settings.employeeCustomFields || '').split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(Boolean)
      .slice(0, 20)
      .map(function (line) {
        const parts = line.split('|');
        const type = String(parts[1] || 'text').trim();
        return {
          label: String(parts[0] || '').trim(),
          type: CUSTOM_FIELD_TYPES[type] ? type : 'text'
        };
      })
      .filter(function (def) { return def.label; });
  }

  function getSelectOptions(field, data) {
    if (field.source === 'employees') {
      return data.employees.slice().sort(function (a, b) {
        return employeeName(a).localeCompare(employeeName(b), 'fa');
      }).map(function (item) {
        return {value:item.id,label:(employeeName(item) || 'بدون نام') + (item.personnelId ? ' · ' + item.personnelId : '')};
      });
    }
    if (field.source === 'vehicles') {
      return data.vehicles.slice().sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''), 'fa');
      }).map(function (item) {
        return {value:item.id,label:(item.name || 'خودرو') + (item.companyPlate ? ' · ' + item.companyPlate : '')};
      });
    }
    if (field.source === 'stations') {
      return (data.stations || []).slice().sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''), 'fa');
      }).map(function (item) {
        return {value:item.id,label:[item.name, item.placeType].filter(Boolean).join(' · ')};
      });
    }
    if (field.source === 'gasmeters') {
      return (data.gasmeters || []).slice().sort(function (a, b) {
        return String(a.code || '').localeCompare(String(b.code || ''), 'fa');
      }).map(function (item) {
        return {value:item.id,label:(item.code || 'گازسنج') + (item.serial ? ' · ' + item.serial : '')};
      });
    }
    if (field.listKey && data.references) {
      const shared = data.references[referenceBaseKey(field.listKey)];
      if (Array.isArray(shared)) return shared.map(function (option) { return {value:option,label:option}; });
    }
    return (field.options || []).map(function (option) { return {value:option,label:option}; });
  }

  // فیلدهای وابسته به نوع محل: فقط وقتی نوع انتخاب‌شده با شرط فیلد بخواند دیده می‌شوند.
  // فیلدهای وابستهٔ عمومی (مثل «تعداد فرزند» پس از «متأهل») هم همین‌جا بررسی می‌شوند.
  // شرط دیده‌شدن یک فیلد می‌تواند یک شرط یا چند شرط هم‌زمان باشد
  // (مثلاً «میزان آلودگی آبی» هم به «آلودگی: دارد» و هم به «آلودگی آبی: دارد» بند است).
  function dependsOnList(field) {
    if (!field || !field.dependsOn) return [];
    return Array.isArray(field.dependsOn) ? field.dependsOn : [field.dependsOn];
  }

  // آیا این فیلد فقط به‌خاطر برقرارنبودن شرط‌هایش پنهان شده است؟ (نه به‌خاطر نوع محل)
  function hiddenByDepends(field, record) {
    const conditions = dependsOnList(field);
    for (let i = 0; i < conditions.length; i += 1) {
      const condition = conditions[i];
      const wanted = (condition && condition.values) || [];
      if (!wanted.length) continue;
      const current = record ? record[condition.key] : '';
      if (wanted.indexOf(String(current == null ? '' : current)) < 0) return true;
    }
    return false;
  }

  function fieldVisible(field, record) {
    const conditions = dependsOnList(field);
    for (let i = 0; i < conditions.length; i += 1) {
      const condition = conditions[i];
      const wanted = (condition && condition.values) || [];
      if (!wanted.length) continue; // شرط بدون مقدار (مثل dependsOn:'placeType') فقط برای تازه‌سازی است
      const current = record ? record[condition.key] : '';
      if (wanted.indexOf(String(current == null ? '' : current)) < 0) return false;
    }
    const type = String((record && (record.placeType || record.stationType)) || '');
    if (Array.isArray(field.onlyFor) && field.onlyFor.length) return field.onlyFor.indexOf(type) >= 0;
    if (Array.isArray(field.hideFor) && field.hideFor.length) return field.hideFor.indexOf(type) < 0;
    return true;
  }

  // مقدار زندهٔ همهٔ کادرهای فرم؛ برای دیدن فیلدهای وابسته پیش از ذخیره لازم است.
  function liveFormValues(form) {
    const values = {};
    Array.prototype.forEach.call(form.querySelectorAll('[name]'), function (control) {
      if (!control.name) return;
      if (control.type === 'file') return;
      if (control.type === 'checkbox') {
        if (!control.checked) return;
        if (!Array.isArray(values[control.name])) values[control.name] = [];
        values[control.name].push(control.value);
        return;
      }
      if (!(control.name in values)) values[control.name] = control.value;
    });
    return values;
  }

  // تغییر «نوع شیفت کاری» یا «وضعیت تأهل» فوراً فیلد وابسته را نشان می‌دهد یا پنهان می‌کند.
  // چند گذر لازم است، چون پنهان‌شدن یک فیلد می‌تواند فیلد وابستهٔ بعدی را هم پنهان کند
  // (آلودگی: ندارد → آلودگی آبی پنهان و خالی → میزان آلودگی آبی هم پنهان).
  function refreshDependentFields(form) {
    const moduleKey = form.dataset.view;
    if (!moduleKey || !specs[moduleKey]) return;
    const fields = formFields(moduleKey, form.dataset.faultScope === 'vehicle');
    if (!fields.some(function (field) { return field.dependsOn; })) return;
    for (let pass = 0; pass < 4; pass += 1) {
      const values = liveFormValues(form);
      let changed = false;
      fields.forEach(function (field) {
        if (!field.dependsOn) return;
        const wrapper = form.querySelector('[data-field-key="' + field.key + '"]');
        if (!wrapper) return;
        const shown = fieldVisible(field, values);
        if (wrapper.hidden !== !shown) changed = true;
        wrapper.hidden = !shown;
        if (!shown) {
          const control = wrapper.querySelector('[name]');
          if (control && control.value) { control.value = ''; changed = true; }
        }
      });
      if (!changed) break;
    }
  }

  function placeLists() {
    const refs = appData.references || {};
    if (!refs.placesByType || typeof refs.placesByType !== 'object') refs.placesByType = {};
    return refs.placesByType;
  }

  function placesForType(type) {
    const lists = placeLists();
    const list = lists[String(type || '')];
    return Array.isArray(list) ? list.slice() : [];
  }

  // همهٔ مکان‌ها و محل‌ها یک فهرست مشترک دارند: هر مکانی که برای هر نوع محلی ثبت شود
  // در همهٔ فیلدهای مکانی دیده می‌شود («یکی کردن لیست مکان‌ها»).
  function allPlaceNames() {
    const lists = placeLists();
    const out = [];
    Object.keys(lists).forEach(function (key) {
      (Array.isArray(lists[key]) ? lists[key] : []).forEach(function (name) {
        const text = String(name == null ? '' : name).trim();
        if (text && out.indexOf(text) < 0) out.push(text);
      });
    });
    return out.sort(function (a, b) { return a.localeCompare(b, 'fa'); });
  }

  function placeRegister(type, name) {
    const key = String(type || '').trim();
    const value = String(name || '').trim();
    if (!key || !value) return;
    const lists = placeLists();
    if (!Array.isArray(lists[key])) lists[key] = [];
    if (lists[key].indexOf(value) < 0) lists[key].push(value);
    lists[key].sort(function (a, b) { return a.localeCompare(b, 'fa'); });
  }

  function placeRemove(type, name) {
    const lists = placeLists();
    const list = lists[String(type || '')];
    if (!Array.isArray(list)) return;
    for (let i = 0; i < list.length; i += 1) {
      if (list[i] === name) { list.splice(i, 1); return; }
    }
  }

  function rowControlMarkup(field, column, value, data) {
    const attrs = ' data-col="' + esc(column.key) + '" autocomplete="new-password"';
    if (column.listKey || Array.isArray(column.options)) {
      const options = column.listKey ? getSelectOptions({ listKey: column.listKey }, data) : column.options.map(function (option) { return { value: option, label: option }; });
      const chosen = String(value == null ? '' : value);
      if (chosen && !options.some(function (option) { return String(option.value) === chosen; })) options.unshift({ value: chosen, label: chosen });
      return '<select' + attrs + '><option value="">انتخاب کنید</option>' + options.map(function (option) {
        return '<option value="' + esc(option.value) + '"' + (String(option.value) === chosen ? ' selected' : '') + '>' + esc(option.label) + '</option>';
      }).join('') + '</select>';
    }
    const type = column.type === 'number' ? 'number' : 'text';
    return '<input type="' + type + '"' + (column.min != null ? ' min="' + esc(column.min) + '"' : '') +
      (column.max != null ? ' max="' + esc(column.max) + '"' : '') + (column.step != null ? ' step="' + esc(column.step) + '"' : '') +
      attrs + ' value="' + esc(value) + '" placeholder="' + esc(column.label) + '">';
  }

  function rowEditorMarkup(field, value, data) {
    const rows = Array.isArray(value) ? value : [];
    const body = rows.map(function (row) {
      return '<div class="module-row" data-row>' + field.columns.map(function (column) {
        return '<label class="module-row-cell"><span>' + esc(column.label) + '</span>' + rowControlMarkup(field, column, row ? row[column.key] : '', data) + '</label>';
      }).join('') + '<button type="button" class="module-row-remove" data-row-remove aria-label="حذف ردیف">×</button></div>';
    }).join('');
    return '<div class="module-rows" data-rows-field="' + esc(field.key) + '">' + body + '</div>' +
      '<button type="button" class="secondary-btn module-rows-add" data-rows-add="' + esc(field.key) + '">' + esc(field.addLabel || '+ افزودن ردیف') + '</button>' +
      (field.hint ? '<small class="module-field-hint">' + esc(field.hint) + '</small>' : '');
  }

  // مرورگر روی کادرهای متنی فرم‌ها پیشنهاد «مدیریت آدرس‌ها» باز می‌کند و کاربر را
  // از فرم بیرون می‌برد؛ با این ترکیب، پیشنهادهای خودکار مرورگر خاموش می‌شود.
  const NO_AUTOFILL = ' autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other"';

  // فقط فهرست‌های بلند و متغیر (افراد، خودروها، ایستگاه‌ها، مکان‌ها و …) پنل جستجوپذیر
  // می‌گیرند؛ منوهای کوتاه و اختصاصی مثل وضعیت‌ها همان لیست کشویی ساده می‌مانند.
  const SEARCHABLE_LIST_KEYS = ['places', 'jobTitles', 'jobUnits', 'missionTitles', 'vehicleNames',
    'gasModels', 'pipelineLines', 'products', 'actionTypes', 'gasLogTypes'];

  function isSearchableSelect(field) {
    if (!field || field.multiple) return false;
    if (field.type === 'place' || field.source) return true;
    return !!(field.listKey && SEARCHABLE_LIST_KEYS.indexOf(referenceBaseKey(field.listKey)) >= 0);
  }

  // ── انتخاب چندتایی با جستجو (همراهان مأموریت، خودروها) ──────────────────
  // الگو: لیست کامل باز است، کاربر هر تعداد نفر را تیک می‌زند و یک‌جا اضافه می‌کند؛
  // موارد افزوده‌شده به‌صورت «چیپ» با رنگ متفاوت زیر همان کادر می‌آیند و هر وقت
  // خواست با × حذف می‌شود. فقط چیپ‌ها نام‌دارند (name=field.key) و به فرم ارسال می‌شوند.
  function employeeLabelById(id) {
    const person = (appData.employees || []).find(function (item) { return String(item.id) === String(id); });
    return person ? (employeeName(person) || person.personnelId || 'کارمند') : String(id);
  }

  function crewOptionsMarkup(crewIds, currentDriver) {
    const only = Array.isArray(crewIds) ? crewIds.map(String) : null;
    return (appData.employees || []).slice()
      .filter(function (person) { return !only || only.indexOf(String(person.id)) >= 0; })
      .sort(function (a, b) { return employeeName(a).localeCompare(employeeName(b), 'fa'); })
      .map(function (person) {
        const id = String(person.id);
        return '<option value="' + esc(id) + '"' + (String(currentDriver || '') === id ? ' selected' : '') + '>' +
          esc((employeeName(person) || 'بدون نام') + (person.personnelId ? ' · ' + person.personnelId : '')) + '</option>';
      }).join('');
  }

  function driverBoxMarkup(vehicleId, label, currentDriver, crewIds) {
    return '<div class="mmc-driver-box" data-driver-box="' + esc(vehicleId) + '">' +
      '<span class="mmc-driver-title">رانندهٔ ' + esc(label) + '</span>' +
      '<select class="mmc-driver-select" name="vehicleDriver:' + esc(vehicleId) + '" data-vehicle-id="' + esc(vehicleId) + '">' +
      '<option value="">انتخاب راننده از کارکنان مأموریت…</option>' + crewOptionsMarkup(crewIds, currentDriver) + '</select>' +
      '</div>';
  }

  function chosenChipMarkup(field, id, label) {
    return '<span class="mmc-chip" data-mmc-chip="' + esc(id) + '">' +
      '<span class="mmc-chip-name">' + esc(label) + '</span>' +
      '<input type="hidden" name="' + esc(field.key) + '" value="' + esc(id) + '">' +
      '<button type="button" class="mmc-chip-x" data-mmc-remove="' + esc(id) + '" aria-label="حذف ' + esc(label) + '" title="حذف">×</button>' +
      '</span>';
  }

  function multiCheckMarkup(moduleKey, field, record, data) {
    const raw = record ? record[field.key] : '';
    const chosen = (Array.isArray(raw) ? raw : String(raw || '').split(','))
      .map(function (id) { return String(id).trim(); }).filter(Boolean);
    const options = getSelectOptions(field, data);
    const labels = {};
    options.forEach(function (option) { labels[String(option.value)] = option.label; });
    const driverMap = (record && record.vehicleDrivers) || {};
    const rows = options.map(function (option) {
      const id = String(option.value);
      return '<label class="mmc-row" data-mmc-row data-label="' + esc(option.label) + '">' +
        '<input type="checkbox" class="nu-keep-native" data-mmc-pick value="' + esc(id) + '">' +
        '<span class="mmc-name">' + esc(option.label) + '</span>' +
        '</label>';
    }).join('');
    const chips = chosen.map(function (id) { return chosenChipMarkup(field, id, labels[id] || id); }).join('');
    const crewIds = field.driversFrom && record && Array.isArray(record[field.driversFrom])
      ? record[field.driversFrom].map(String) : null;
    const drivers = field.driversFrom
      ? chosen.map(function (id) { return driverBoxMarkup(id, labels[id] || id, driverMap[id], crewIds); }).join('')
      : '';
    const empty = '<small class="mmc-empty" data-mmc-empty' + (chosen.length ? ' hidden' : '') + '>' +
      (field.driversFrom ? 'هنوز خودرویی انتخاب نشده است.' : 'هنوز کسی اضافه نشده است.') + '</small>';
    return '<div class="module-multi-check" data-multi-check="' + esc(field.key) + '" data-mmc-source="' + esc(field.source || '') + '"' +
      (field.driversFrom ? ' data-mmc-drivers="' + esc(field.driversFrom) + '"' : '') + '>' +
      '<div class="mmc-toolbar">' +
      '<input type="search" class="mmc-search" placeholder="جستجو در فهرست…" data-mmc-search autocomplete="off" spellcheck="false">' +
      '<span class="mmc-count" data-mmc-count>۰ انتخاب‌شده</span>' +
      '</div>' +
      (options.length
        ? '<div class="mmc-list" data-mmc-list>' + rows + '</div>'
        : '<div class="module-empty module-check-empty">فهرستی برای انتخاب ثبت نشده است.</div>') +
      (options.length
        ? '<div class="mmc-foot">' +
          '<button type="button" class="secondary-btn mmc-add" data-mmc-add>افزودن انتخاب‌شده‌ها</button>' +
          '<button type="button" class="mmc-clear" data-mmc-clear>پاک کردن همه</button>' +
          '</div>'
        : '') +
      '<div class="mmc-chosen" data-mmc-chosen>' + chips + '</div>' +
      (field.driversFrom ? '<div class="mmc-drivers" data-mmc-drivers-box>' + drivers + '</div>' : '') +
      empty +
      '</div>';
  }

  function renderField(moduleKey, field, record, data) {
    const value = record && record[field.key] != null ? record[field.key] : (field.custom && record && record.customFields ? record.customFields[field.key] : '');
    const id = 'atlas-field-' + moduleKey + '-' + field.key;
    const required = field.required ? ' required' : '';
    const label = '<span>' + esc(field.label) + (field.required ? ' <i>*</i>' : '') + '</span>';
    let control = '';
    if (field.type === 'select') {
      const options = getSelectOptions(field, data);
      const chosenList = Array.isArray(value) ? value.map(String) : String(value || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      if (field.multiple && field.source === 'employees') {
        control = !options.length
          ? '<div class="module-empty module-check-empty">هنوز کارمندی ثبت نشده است. اول از بخش «کارکنان» کارمند اضافه کن یا نام افراد را در کادر زیر بنویس.</div>'
          : '<div class="module-check-options module-check-people">' + options.map(function (option) {
            return '<label><input type="checkbox" class="nu-keep-native" name="' + esc(field.key) + '" value="' + esc(option.value) + '"' + (chosenList.includes(String(option.value)) ? ' checked' : '') + '><span>' + esc(option.label) + '</span></label>';
          }).join('') + '</div><small class="module-field-hint">هر نفر را با تیک انتخاب کن؛ نیازی به کلید کمکی نیست.</small>';
      } else {
        if (!field.multiple && value != null && value !== '' && !options.some(function (option) { return String(option.value) === String(value); })) {
          options.unshift({value:String(value),label:String(value)});
        }
        control = '<select id="' + esc(id) + '" name="' + esc(field.key) + '"' + (field.multiple ? ' multiple size="4"' : '') + (field.stationTypeTrigger ? ' data-station-type="1"' : '') + (isSearchableSelect(field) ? ' data-search-select="1"' : '') + required + '>' +
          (field.multiple ? '' : '<option value="">انتخاب کنید</option>') +
          options.map(function (option) {
            const selected = field.multiple ? chosenList.includes(String(option.value)) : String(value) === String(option.value);
            return '<option value="' + esc(option.value) + '"' + (selected ? ' selected' : '') + '>' + esc(option.label) + '</option>';
          }).join('') + '</select>' +
          (field.listKey && !field.multiple ? '<button type="button" class="module-select-add" data-add-list-option="' + esc(field.listKey) + '" data-view="' + esc(moduleKey) + '" aria-label="افزودن گزینه به ' + esc(field.label) + '" title="افزودن گزینه جدید">+</button>' : '') +
          (field.multiple ? '<small class="module-field-hint">برای انتخاب چند مورد، کلید Ctrl را نگه‌دار.</small>' : '');
      }
    } else if (field.type === 'combo-text') {
      // نوشتن آزاد + پیشنهاد از فهرست مشترک: برای محدوده‌های عملیاتی که هم ثابت‌اند هم تازه.
      const suggestions = getSelectOptions(field, data);
      control = '<input id="' + esc(id) + '" name="' + esc(field.key) + '" type="text" list="' + esc(id) + '-suggestions"' +
        ' value="' + esc(value) + '" placeholder="' + esc(field.placeholder || '') + '"' + required + NO_AUTOFILL + '>' +
        '<datalist id="' + esc(id) + '-suggestions">' + suggestions.map(function (option) {
          return '<option value="' + esc(option.value || option.label) + '"></option>';
        }).join('') + '</datalist>';
    } else if (field.type === 'place') {
      const type = record && (record.placeType || record.stationType);
      const options = allPlaceNames();
      if (value && options.indexOf(String(value)) < 0) options.unshift(String(value));
      if (!options.length) {
        // تا وقتی هیچ مکانی ثبت نشده، نوشتن نام مکان راه را نمی‌بندد.
        control = '<input id="' + esc(id) + '" name="' + esc(field.key) + '" type="text" placeholder="نام مکان یا محل"' + required + NO_AUTOFILL + ' value="' + esc(value) + '">' +
          '<small class="module-field-hint">هنوز مکانی ثبت نشده است؛ نام مکان را همین‌جا بنویس تا به فهرست مشترک اضافه شود.</small>';
      } else {
        control = '<span class="module-select-with-add"><select id="' + esc(id) + '" name="' + esc(field.key) + '" data-place-select data-search-select="1"' + required + '>' +
          '<option value="">انتخاب مکان از فهرست مشترک</option>' +
          options.map(function (option) {
            return '<option value="' + esc(option) + '"' + (String(value) === String(option) ? ' selected' : '') + '>' + esc(option) + '</option>';
          }).join('') + '</select>' +
          '<button type="button" class="module-select-add" data-place-add="1" aria-label="افزودن مکان جدید" title="افزودن مکان جدید به فهرست مشترک">+</button></span>' +
          '<small class="module-field-hint">' + (type ? '«' + esc(type) + '» · ' : '') + 'یک فهرست مشترک برای همهٔ مکان‌ها و محل‌ها؛ با + می‌توانی مکان تازه اضافه کنی.</small>';
      }
    } else if (field.type === 'rows') {
      control = rowEditorMarkup(field, value, data);
    } else if (field.type === 'people') {
      const names = stationChiefSuggestions(data);
      control = '<input id="' + esc(id) + '" name="' + esc(field.key) + '" list="' + esc(id) + '-people" value="' + esc(value) +
        '" placeholder="' + esc(field.placeholder || 'جستجو در مخاطبان یا نام جدید') + '" autocomplete="new-password"' + required + '>' +
        '<datalist id="' + esc(id) + '-people">' + names.map(function (name) {
          return '<option value="' + esc(name) + '"></option>';
        }).join('') + '</datalist>' +
        '<small class="module-field-hint">نام را از مخاطبان دفترچه تلفن جستجو کن یا نام تازه را همین‌جا بنویس.</small>';
    } else if (field.type === 'textarea') {
      control = '<textarea id="' + esc(id) + '" name="' + esc(field.key) + '" rows="3"' + required + ' placeholder="' + esc(field.placeholder || '') + '">' + esc(value) + '</textarea>';
    } else if (field.type === 'multi-check') {
      control = multiCheckMarkup(moduleKey, field, record, data);
    } else if (field.type === 'checks') {
      const selected = Array.isArray(value) ? value : String(value || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      control = '<div class="module-check-options">' + field.options.map(function (option) {
        return '<label><input type="checkbox" class="nu-keep-native" name="' + esc(field.key) + '" value="' + esc(option) + '"' + (selected.includes(option) ? ' checked' : '') + '><span>' + esc(option) + '</span></label>';
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
      control = '<input id="' + esc(id) + '" name="' + esc(field.key) + '" type="text" inputmode="text" autocomplete="new-password"' + required +
        ' value="' + esc(shownDate) +
        '" placeholder="' + dateInputHint(field.type) + '" data-jalali-input="' + esc(field.type) + '">' +
        '<small class="module-field-hint">تاریخ شمسی؛ نمونه: ' + dateInputHint(field.type) + '</small>';
    } else {
      const type = field.type || 'text';
      const digits = field.digits === true;
      const input = '<input id="' + esc(id) + '" name="' + esc(field.key) + '" type="' + esc(type) + '"' +
        (digits ? ' inputmode="numeric" data-digits-only="1"' : '') +
        (field.min != null ? ' min="' + esc(field.min) + '"' : '') +
        (field.max != null ? ' max="' + esc(field.max) + '"' : '') +
        (field.step != null ? ' step="' + esc(field.step) + '"' : '') + required + NO_AUTOFILL +
        ' value="' + esc(value) + '" placeholder="' + esc(field.placeholder || '') + '">';
      // کادر عددی: کم و زیادکردن با دو دکمهٔ گرد در چپ و راست خود کادر.
      control = type === 'number'
        ? '<span class="module-number">' +
          '<button type="button" class="module-number-step" data-number-step="-1" aria-label="کاهش ' + esc(field.label) + '">−</button>' +
          input +
          '<button type="button" class="module-number-step" data-number-step="1" aria-label="افزایش ' + esc(field.label) + '">+</button>' +
          '</span>'
        : input;
    }
    if (field.type === 'select' && field.listKey && !field.multiple) control = '<span class="module-select-with-add">' + control + '</span>';
    const shown = fieldVisible(field, record || {});
    return '<label class="module-field' + (field.wide ? ' module-field-wide' : '') + '" for="' + esc(id) + '" data-field-key="' + esc(field.key) + '"' + (shown ? '' : ' hidden') + '>' + label + control + '</label>';
  }

  function rootWrap(content) {
    return '<div class="module-wrap" style="display:flex;flex-direction:column;gap:16px;width:100%;max-width:none;min-width:0">' + storageBanner() + content + '</div>';
  }

  // اگر ذخیره‌سازی رمزنگاری‌شده مشکل داشته باشد، کاربر باید بی‌درنگ ببیند.
  function storageBanner() {
    const note = storageLocked ? loadError : storageCryptoNote();
    if (!note) return '';
    return '<div class="storage-alert" role="alert" data-tone="danger"><strong>هشدار ذخیره‌سازی</strong><span>' + esc(note) + '</span></div>';
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

  // چیدمان پنجره: هر ردیف یک شبکهٔ مستقل است تا همان ترتیب خواسته‌شده حفظ شود و
  // فیلدی که با انتخاب کاربر پنهان می‌شود، جای خالی باقی نگذارد.
  function renderFieldsMarkup(moduleKey, fields, draft, data) {
    const layout = specs[moduleKey] && specs[moduleKey].layout;
    const renderOne = function (field) { return renderField(moduleKey, field, draft, data); };
    if (!Array.isArray(layout) || !layout.length) {
      return '<div class="module-fields">' + fields.map(renderOne).join('') + '</div>';
    }
    const byKey = {};
    fields.forEach(function (field) { byKey[field.key] = field; });
    const used = {};
    const rows = [];
    layout.forEach(function (rowKeys) {
      const cells = [];
      const rowFieldCount = (rowKeys || []).filter(function (key) { return byKey[key] && !used[key]; }).length;
      (rowKeys || []).forEach(function (key) {
        const field = byKey[key];
        if (!field || used[key]) return;
        used[key] = true;
        // در ردیفی که چند فیلد دارد، «wide» معنا ندارد؛ عرض همان خانهٔ شبکه است.
        cells.push(renderOne(rowFieldCount > 1 ? Object.assign({}, field, { wide: false }) : field));
      });
      if (cells.length) rows.push('<div class="module-fields module-fields-row">' + cells.join('') + '</div>');
    });
    const rest = fields.filter(function (field) { return !used[field.key]; });
    // فیلدهای بیرون از چیدمان (مثل فیلدهای سفارشی کارمند) در همان شبکهٔ سه‌ستونه
    // می‌نشینند: هر فیلد یک‌سوم ابتدایی ردیف، و فیلد متن بلند مثل «توضیحات» تمام‌عرض.
    if (rest.length) rows.push('<div class="module-fields module-fields-custom">' + rest.map(renderOne).join('') + '</div>');
    return '<div class="module-fields-stack">' + rows.join('') + '</div>';
  }

  function renderForm(moduleKey, data) {
    const state = formState[moduleKey];
    if (!state || !state.open) return '';
    const existing = state.id ? (data[moduleKey] || []).find(function (item) { return String(item.id) === String(state.id); }) : null;
    const draft = Object.assign({}, existing || {}, state.preset || {});
    const vehicleScope = moduleKey === 'faults' && faultFormScope === 'vehicle';
    const fields = formFields(moduleKey, vehicleScope);
    const fileNotice = '<p class="module-field-hint">فایل پیوست همراه همین پرونده نگه‌داری می‌شود؛ اندازهٔ هر فایل بهتر است کمتر از ۱۰ مگابایت باشد.</p>';
    let relatedVehicleHistory = '';
    if (moduleKey === 'vehicles' && existing) {
      const linked = (data.missions || []).filter(function (mission) {
        return [].concat(mission.vehicleIds || [], mission.vehicleId || []).map(String).indexOf(String(existing.id)) >= 0;
      }).slice().sort(function (a,b) { return String(b.startAt || '').localeCompare(String(a.startAt || '')); });
      relatedVehicleHistory = '<section class="module-related-history"><div class="module-list-head"><div><h3>سوابق مأموریت این خودرو</h3><p>این فهرست از مأموریت‌هایی ساخته می‌شود که همین خودرو در آن‌ها انتخاب شده است.</p></div><span class="module-tag">' + faDigits(linked.length) + ' مورد</span></div>' +
        (linked.length ? '<div class="module-table-wrap" style="width:100%;min-width:0"><table class="module-table"><thead><tr><th>مأموریت</th><th>نوع فعالیت</th><th>شروع</th><th>پایان</th><th>وضعیت</th><th>گروه اعزامی</th></tr></thead><tbody>' +
          linked.slice(0,30).map(function(mission) {
            const crew=(mission.crewIds||[]).map(function(id) {
              const person=(data.employees||[]).find(function(item){return String(item.id)===String(id);});
              return person?employeeName(person)||person.personnelId:'';
            }).filter(Boolean).join('، ');
            return '<tr><td>' + esc(mission.title||'مأموریت بدون عنوان') + '</td><td>' + esc(mission.missionType||'—') + '</td><td>' +
              formatJalali(mission.startAt,true) + '</td><td>' + formatJalali(mission.endAt,true) + '</td><td>' +
              '<span class="module-tag">' + esc(mission.status||'—') + '</span></td><td>' + esc([crew,mission.crewText].filter(Boolean).join('؛ ')||'—') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="module-empty">برای این خودرو هنوز مأموریتی ثبت نشده است.</div>') +
        '</section>';
    }
    return '<div class="atlas-modal-backdrop" data-modal-backdrop data-view="' + esc(moduleKey) + '">' +
      '<div class="atlas-modal atlas-modal-form" role="dialog" aria-modal="true" aria-labelledby="atlasModalTitle">' +
      '<div class="atlas-modal-head"><div><h3 id="atlasModalTitle">' +
      (existing ? 'ویرایش ' : 'ثبت ') + esc(specs[moduleKey].singular) + '</h3><p>پس از ذخیره، اطلاعات به فهرست، داشبورد و گزارش‌های مرتبط منتقل می‌شود.</p></div>' +
      '<button type="button" class="atlas-modal-close" data-module-action="cancel" data-view="' + esc(moduleKey) + '" aria-label="بستن پنجره">×</button></div>' +
      '<div class="atlas-modal-body"><form class="module-form" id="atlasModuleForm" data-module-form autocomplete="off" novalidate data-view="' + esc(moduleKey) + '" data-id="' + esc(existing ? existing.id : '') + '"' + (vehicleScope ? ' data-fault-scope="vehicle"' : '') + '>' +
      renderFieldsMarkup(moduleKey, fields, draft, data) +
      (moduleKey === 'employees' ? customFieldsEditorMarkup() : '') +
      fileNotice +
      '</form>' +
      relatedVehicleHistory + '</div>' +
      // نوار دکمه‌ها بیرون از ناحیهٔ اسکرول است؛ پس در هر ارتفاعی از نمایشگر دیده می‌شود.
      '<div class="module-form-actions"><span class="module-required-help">موارد دارای * ضروری هستند.</span><div>' +
      '<button type="button" class="secondary-btn" data-module-action="cancel" data-view="' + esc(moduleKey) + '">انصراف</button> ' +
      '<button type="submit" form="atlasModuleForm" class="primary-btn">' + (existing ? 'ذخیرهٔ تغییرات' : 'ثبت ' + esc(specs[moduleKey].singular)) + '</button></div></div>' +
      '</div></div>';
  }

  // معناى وضعیت‌ها؛ رنگ هر معنا در design/tones.css تعیین می‌شود.
  const STATUS_TONES = {
    'تکمیل‌شده': 'ok', 'تأییدشده': 'ok', 'آماده': 'ok', 'سالم': 'ok',
    'آماده استفاده': 'ok', 'انجام‌شده': 'ok', 'فعال': 'ok', 'آماده‌کار': 'ok',
    'در جریان': 'info', 'در حال کار': 'info', 'شیفت': 'info', 'مأموریت': 'info',
    'در حال انجام': 'info', 'برنامه‌ریزی‌شده': 'info', 'استفاده‌شده': 'info', 'در انتظار پاسخ': 'warn',
    'در انتظار بررسی': 'warn', 'نیازمند بررسی': 'warn', 'در کالیبراسیون': 'warn', 'در سرویس': 'warn',
    'استراحت': 'warn',
    'ردشده': 'danger', 'لغوشده': 'danger', 'خارج از سرویس': 'danger', 'دارای نقص': 'danger',
    'عقب‌افتاده': 'danger', 'غیرفعال': 'danger',
    'متوقف': 'attention', 'در تعمیر': 'attention', 'ارجاع‌شده': 'attention', 'اضافه‌کار': 'attention',
    'شروع‌نشده': 'muted'
  };
  function statusTone(text) {
    return STATUS_TONES[String(text == null ? '' : text).trim()] || 'muted';
  }
  function statusTag(text, extra) {
    return '<span class="module-tag' + (extra ? ' ' + extra : '') + '" data-tone="' + statusTone(text) + '">' + esc(text) + '</span>';
  }

  function displayValue(moduleKey, fieldKey, value, data) {
    if (value == null || value === '') return '—';
    if (fieldKey === 'status') return statusTag(value);
    const field = fieldsFor(moduleKey).find(function (item) { return item.key === fieldKey; });
    if (field && (field.type === 'jalali' || field.type === 'date')) return formatJalali(value, false);
    if (field && field.type === 'jalali-datetime') return formatJalali(value, true);
    if (field && field.source === 'employees') {
      const findName = function (id) {
        const item = data.employees.find(function (person) { return String(person.id) === String(id); });
        return item ? employeeName(item) || item.personnelId || 'کارمند' : id;
      };
      return esc(Array.isArray(value) ? value.map(findName).join('، ') : findName(value));
    }
    if (field && field.source === 'vehicles') {
      const nameOf = function (id) {
        const item = data.vehicles.find(function (vehicle) { return String(vehicle.id) === String(id); });
        return item ? (item.name || 'خودرو') + (item.companyPlate ? ' · ' + item.companyPlate : '') : id;
      };
      return esc(Array.isArray(value) ? value.map(nameOf).join('، ') : nameOf(value));
    }
    if (field && field.source === 'gasmeters') {
      const item = (data.gasmeters || []).find(function (meter) { return String(meter.id) === String(value); });
      return esc(item ? (item.code || 'گازسنج') + (item.serial ? ' · ' + item.serial : '') : value);
    }
    if (field && field.source === 'stations') {
      const item = (data.stations || []).find(function (station) { return String(station.id) === String(value); });
      return esc(item ? stationLabel(item) : value);
    }
    if (field && (field.type === 'file' || field.type === 'file-multiple')) {
      const count = Array.isArray(value) ? value.length : (value ? 1 : 0);
      return count ? 'پیوست (' + faDigits(count) + ')' : '—';
    }
    if (field && field.type === 'checks' && Array.isArray(value)) return esc(value.join('، '));
    if (field && field.type === 'rows') {
      const rows = Array.isArray(value) ? value : [];
      return rows.length ? faDigits(rows.length) + ' ردیف' : '—';
    }
    if (field && field.type === 'number') return faDigits(value);
    return esc(Array.isArray(value) ? value.join('، ') : value);
  }

  function searchMatch(moduleKey, record, data) {
    const term = String(searchState[moduleKey] || '').trim().toLocaleLowerCase();
    if (!recordMatchesFilters(moduleKey, record, data)) return false;
    if (!term) return true;
    const values = fieldsFor(moduleKey).filter(function(field){return field.type!=='file'&&field.type!=='file-multiple';}).map(function (field) {
      let value = field.custom && record.customFields ? record.customFields[field.key] : record[field.key];
      return field.label + ' ' + (Array.isArray(value) ? value.join(' ') : String(value == null ? '' : value));
    }).join(' ').toLocaleLowerCase();
    const related = (data.employees || []).filter(function (item) { return String(record.crewIds || '').includes(String(item.id)); }).map(function (item) { return employeeName(item); }).join(' ');
    return (values + ' ' + related).toLocaleLowerCase().includes(term);
  }

  function recordsForView(moduleKey, data) {
    return sortRecords(moduleKey, (data[moduleKey] || []).filter(function (record) { return searchMatch(moduleKey, record, data); }));
  }

  function statusOptions(moduleKey) {
    const field = specs[moduleKey].fields.find(function (item) { return item.key === 'status' && item.type === 'select'; });
    return field ? field.options : [];
  }

  // ── نوار ابزار فهرست ──────────────────────────────────────────────────────
  // دو ردیف ثابت: ردیف جست‌وجو، و درست زیر آن یک ردیف فشردهٔ فیلتر و مرتب‌سازی.
  // همهٔ کنترل‌ها «قرص»های کوچک‌اند تا در یک خط جا شوند و فضا نگیرند؛ در
  // نمایشگر باریک، همان یک خط به‌آرامی افقی می‌لغزد (شکسته نمی‌شود).
  function renderFilterControls(moduleKey) {
    const filters = LIST_FILTERS[moduleKey] || [];
    if (!filters.length) return '';
    const state = moduleFilterState(moduleKey);
    return filters.map(function (filter) {
      const selected = state[filter.key] || 'all';
      const options = filter.options ? filter.options(moduleKey, state) : [];
      return '<label class="list-chip list-chip-filter is-' + esc(filter.key) + '">' +
        '<span class="list-chip-label">' + esc(filter.label) + '</span>' +
        '<select data-module-filter data-filter-key="' + esc(filter.key) + '" data-view="' + esc(moduleKey) + '" aria-label="فیلتر ' + esc(filter.label) + '">' +
        '<option value="all"' + (selected === 'all' || !selected ? ' selected' : '') + '>همه</option>' +
        options.map(function (option) {
          return '<option value="' + esc(option[0]) + '"' + (String(selected) === String(option[0]) ? ' selected' : '') + '>' + esc(option[1]) + '</option>';
        }).join('') + '</select></label>';
    }).join('');
  }

  // مرتب‌سازی و جهت (صعودی/نزولی) از سرستون‌های جدول انجام می‌شود؛ پس در نوار
  // فیلترها کنترل جداگانه‌ای برای آن نمی‌گذاریم و فقط فیلترها می‌مانند.
  function renderListToolbar(moduleKey) {
    const active = hasActiveFilters(moduleKey) || !!String(searchState[moduleKey] || '').trim();
    return '<div class="module-list-tools">' +
        '<div class="list-search-row"><span class="list-search-icon" aria-hidden="true">⌕</span>' +
          '<input type="search" data-module-search data-view="' + esc(moduleKey) + '" value="' + esc(searchState[moduleKey] || '') + '" placeholder="جست‌وجو در ' + esc(specs[moduleKey].title) + '" aria-label="جست‌وجو">' +
        '</div>' +
        '<div class="list-filter-row" role="group" aria-label="فیلترها">' +
          renderFilterControls(moduleKey) +
          '<button type="button" class="list-chip list-chip-columns" data-module-action="columns-open" data-view="' + esc(moduleKey) + '" title="نمایش و ترتیب ستون‌های جدول" aria-label="عناوین جدول">▤ عناوین</button>' +
          '<button type="button" class="list-chip list-chip-reset' + (active ? ' is-active' : '') + '" data-module-reset data-view="' + esc(moduleKey) + '"' + (active ? '' : ' hidden') + '>پاک‌کردن فیلترها</button>' +
          '<span class="list-filter-count" data-module-result-count>' + faDigits(recordsForView(moduleKey, appData).length) + ' مورد</span>' +
        '</div>' +
      '</div>';
  }

  function renderHistoryButton(moduleKey, record) {
    // در مرخصی‌ها «سوابق» یعنی مرخصی‌های گذشتهٔ همین شخص، نه فقط تاریخچهٔ تغییرات یک رکورد.
    if (moduleKey === 'leaves') {
      return '<button type="button" class="secondary-btn module-history-btn" data-module-action="leave-history" data-view="leaves" data-id="' + esc(record.id) + '">سوابق</button> ';
    }
    const hasHistory = appData.history.some(function (item) { return item.module === moduleKey && item.recordId === String(record.id); });
    return hasHistory ? '<button type="button" class="secondary-btn module-history-btn" data-module-action="history" data-view="' + esc(moduleKey) + '" data-id="' + esc(record.id) + '">سوابق</button> ' : '';
  }

  // سرستون قابل‌کلیک: هر «عنوان» جدول با یک کلیک مرتب می‌شود و با کلیک دوباره
  // جهت عوض می‌شود. `viewKey` بخشی است که باید دوباره رندر شود (جدول شیفت‌ها
  // داخل بخش کارکنان است، پس viewKey آن 'employees' است).
  function sortableHeader(moduleKey, key, label, viewKey) {
    const sort = listSortFor(moduleKey);
    const active = sort.key === key;
    const ascending = sort.direction === 'asc';
    return '<th class="module-sort-th' + (active ? ' is-sorted' : '') + '" aria-sort="' +
      (active ? (ascending ? 'ascending' : 'descending') : 'none') + '">' +
      '<button type="button" class="module-sort-btn" data-sort-key="' + esc(key) + '" data-sort-module="' + esc(moduleKey) +
      '" data-sort-view="' + esc(viewKey || moduleKey) + '" title="مرتب‌سازی بر اساس ' + esc(label) + '">' +
      '<span class="module-sort-label">' + esc(label) + '</span>' +
      '<span class="module-sort-caret" aria-hidden="true">' + (active ? (ascending ? '↑' : '↓') : '↕') + '</span>' +
      '</button></th>';
  }

  function renderTable(moduleKey, data) {
    const columns = tableColumns(moduleKey);
    const records = recordsForView(moduleKey, data);
    if (!records.length) {
      return '<div class="module-empty">' + ((data[moduleKey] || []).length ?
        'موردی مطابق جست‌وجو یا فیلتر پیدا نشد.' :
        'هنوز اطلاعاتی ثبت نشده است. برای شروع روی «ثبت مورد جدید» بزن.') + '</div>';
    }
    return '<div class="module-table-wrap" style="width:100%;max-width:100%;min-width:0"><table class="module-table"><thead><tr>' +
      '<th class="module-check-cell"><input type="checkbox" data-module-select-all aria-label="انتخاب همهٔ ردیف‌ها"></th>' +
      columns.map(function (key) {
        return sortableHeader(moduleKey, key, columnLabel(moduleKey, key), moduleKey);
      }).join('') + '<th>عملیات</th></tr></thead><tbody>' +
      records.map(function (record) {
        return '<tr><td class="module-check-cell"><input type="checkbox" data-record-select value="' + esc(record.id) + '" aria-label="انتخاب ردیف"></td>' +
          columns.map(function (key) {
            if (moduleKey === 'vehicles' && key === 'relatedMissions') {
              const linkedCount = (data.missions || []).filter(function (mission) {
                return [].concat(mission.vehicleIds || [], mission.vehicleId || []).map(String).indexOf(String(record.id)) >= 0;
              }).length;
              return '<td>' + faDigits(linkedCount) + ' مورد</td>';
            }
            const value = fieldsFor(moduleKey).find(function (field) { return field.key === key && field.custom; }) && record.customFields
              ? record.customFields[key] : record[key];
            if (moduleKey === 'employees' && key === 'status') return '<td>' + statusTag(effectiveEmployeeStatus(record)) + '</td>';
            if (moduleKey === 'notes' && key === 'status') {
              const overdue = record.dueDate && dueInDays(record.dueDate) < 0 && !['تکمیل‌شده','لغوشده'].includes(record.status);
              return '<td>' + statusTag(overdue ? 'عقب‌افتاده' : (record.status || 'ثبت نشده')) + '</td>';
            }
            const def = fieldsFor(moduleKey).find(function (field) { return field.key === key; });
            if (def && def.custom) {
              if (def.type === 'jalali' || def.type === 'jalali-datetime') {
                return '<td>' + (value ? formatJalali(value, def.type === 'jalali-datetime') : '—') + '</td>';
              }
              if (def.type === 'tel') return '<td dir="ltr" style="text-align:right">' + esc(value || '—') + '</td>';
              if (def.type === 'textarea') return '<td>' + esc(value || '—') + '</td>';
              return '<td>' + (value === '' || value == null ? '—' : esc(value)) + '</td>';
            }
            return '<td>' + displayValue(moduleKey, key, value, data) + '</td>';
          }).join('') +
          '<td class="module-row-actions">' + (moduleKey === 'employees' ? renderContactActions(record) : '') +
          '<button type="button" class="secondary-btn module-file-btn" data-module-action="file" data-view="' + esc(moduleKey) + '" data-id="' + esc(record.id) + '">مشاهدهٔ پرونده</button> ' +
          renderCommentButton(moduleKey, record) + renderHistoryButton(moduleKey, record) +
          '<button type="button" class="secondary-btn" data-module-action="edit" data-view="' + esc(moduleKey) + '" data-id="' + esc(record.id) + '">ویرایش</button> ' +
          '<button type="button" class="module-delete-btn" data-module-action="delete" data-view="' + esc(moduleKey) + '" data-id="' + esc(record.id) + '">حذف</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  // تماس و پیام سریع از روی فهرست کارکنان.
  function renderContactActions(record) {
    const raw = String(record.mobile || record.phone || '').trim();
    const dial = raw.replace(/[^\d+]/g, '');
    if (!dial) return '';
    const name = employeeName(record) || 'همکار';
    const body = encodeURIComponent('درود ' + name + '، ');
    return '<a class="module-contact-btn" href="tel:' + esc(dial) + '" title="تماس با ' + esc(name) + '" aria-label="تماس با ' + esc(name) + '">' +
      '<span aria-hidden="true">📞</span> تماس</a> ' +
      '<a class="module-contact-btn" href="sms:' + esc(dial) + '?&body=' + body + '" title="ارسال پیام به ' + esc(name) + '" aria-label="ارسال پیام به ' + esc(name) + '">' +
      '<span aria-hidden="true">💬</span> پیام</a> ';
  }

  function shiftLabel(record, data) {
    const employees = (record.employeeIds || []).map(function (id) {
      const person = (data.employees || []).find(function (item) { return String(item.id) === String(id); });
      return person ? (employeeName(person) || person.personnelId || 'کارمند') : '';
    }).filter(Boolean);
    return employees.join('، ') || 'شیفت بدون نیروی ثبت‌شده';
  }

  function addShiftHistory(record, action, changes) {
    appData.history.push({
      id: createId(),
      module: 'shifts',
      recordId: String(record.id),
      recordLabel: shiftLabel(record, appData),
      action: action,
      at: new Date().toISOString(),
      changes: changes || []
    });
    if (appData.history.length > 3000) appData.history.splice(0, appData.history.length - 3000);
  }

  function renderShiftForm(data) {
    if (!shiftFormState.open) return '';
    const existing = shiftFormState.id ? (data.shifts || []).find(function (item) { return String(item.id) === String(shiftFormState.id); }) : null;
    const current = existing || {};
    const chosen = Array.isArray(current.employeeIds) ? current.employeeIds.map(String) : [];
    const employeeOptions = (data.employees || []).slice().sort(function (a, b) {
      return employeeName(a).localeCompare(employeeName(b), 'fa');
    }).map(function (person) {
      return '<option value="' + esc(person.id) + '"' + (chosen.includes(String(person.id)) ? ' selected' : '') + '>' +
        esc((employeeName(person) || 'بدون نام') + (person.personnelId ? ' · ' + person.personnelId : '')) + '</option>';
    }).join('');
    const startValue = current.startAt ? jalaliInputValue(current.startAt, true) : jalaliInputValue('', true);
    const endValue = current.endAt ? jalaliInputValue(current.endAt, true) : '';
    return '<div class="atlas-modal-backdrop" data-modal-backdrop data-modal-kind="shift" data-view="employees">' +
      '<div class="atlas-modal atlas-modal-form" role="dialog" aria-modal="true" aria-labelledby="atlasShiftModalTitle"><div class="atlas-modal-head"><div><h3 id="atlasShiftModalTitle">' +
      (existing ? 'ویرایش برنامهٔ شیفت' : 'ثبت برنامهٔ شیفت') +
      '</h3><p>نوع روز/شب و زمان شروع و پایان را مشخص کن. برای شیفت شب، تاریخ پایان روز بعد را وارد کن.</p></div>' +
      '<button type="button" class="atlas-modal-close" data-shift-action="cancel" aria-label="بستن پنجره">×</button></div>' +
      '<div class="atlas-modal-body"><form class="module-form" id="atlasShiftForm" data-shift-form data-shift-id="' + esc(existing ? existing.id : '') + '"><div class="module-fields">' +
      '<label class="module-field"><span>نوع شیفت <i>*</i></span><select name="shiftType" required><option value="">انتخاب کنید</option>' +
      ['۱۲ ساعته روز','۱۲ ساعته شب','روزکار'].map(function (option) {
        return '<option value="' + esc(option) + '"' + (current.shiftType === option ? ' selected' : '') + '>' + esc(option) + '</option>';
      }).join('') + '</select></label>' +
      '<label class="module-field"><span>وضعیت برنامه <i>*</i></span><select name="status" required><option value="">انتخاب کنید</option>' +
      ['برنامه‌ریزی‌شده','انجام‌شده','لغوشده','جایگزینی روزکار'].map(function (option) {
        return '<option value="' + esc(option) + '"' + (current.status === option ? ' selected' : '') + '>' + esc(option) + '</option>';
      }).join('') + '</select></label>' +
      '<label class="module-field"><span>محل خدمت</span><input name="workplace" value="' + esc(current.workplace || '') + '" placeholder="ایستگاه یا محل خدمت"></label>' +
      '<label class="module-field"><span>شروع شیفت شمسی <i>*</i></span><input type="text" name="startAt" data-jalali-input="jalali-datetime" required value="' +
      esc(startValue) + '" placeholder="۱۴۰۵/۰۷/۲۸ ۰۷:۰۰"><small class="module-field-hint">مثال: ۱۴۰۵/۰۷/۲۸ ۰۷:۰۰</small></label>' +
      '<label class="module-field"><span>پایان شیفت شمسی <i>*</i></span><input type="text" name="endAt" data-jalali-input="jalali-datetime" required value="' +
      esc(endValue) + '" placeholder="۱۴۰۵/۰۷/۲۸ ۱۹:۰۰"><small class="module-field-hint">برای شیفت شب، تاریخ پایان را در روز بعد وارد کن.</small></label>' +
      '<label class="module-field module-field-wide"><span>نیروهای این شیفت <i>*</i></span><select name="employeeIds" multiple size="5" required>' +
      employeeOptions + '</select><small class="module-field-hint">برای انتخاب چند نفر در رایانه، کلید Ctrl را نگه‌دار.</small></label>' +
      '<label class="module-field module-field-wide"><span>توضیحات</span><textarea name="notes" rows="3">' + esc(current.notes || '') + '</textarea></label>' +
      '</div></form></div>' +
      '<div class="module-form-actions"><span class="module-required-help">برنامه‌های ثبت‌شده در تقویم روزانه و وضعیت کارکنان منعکس می‌شوند.</span><div>' +
      '<button type="button" class="secondary-btn" data-shift-action="cancel">انصراف</button> ' +
      '<button type="submit" form="atlasShiftForm" class="primary-btn">' + (existing ? 'ذخیرهٔ تغییرات' : 'ثبت برنامهٔ شیفت') + '</button></div></div></div></div>';
  }

  function renderShiftSchedule(data) {
    const shifts = sortRecords('shifts', data.shifts || []);
    const rows = shifts.length ? shifts.map(function (item) {
      return '<tr><td>' + formatJalali(item.startAt, true) + '</td><td>' + formatJalali(item.endAt, true) + '</td><td>' +
        esc(item.shiftType || '—') + '</td><td>' + esc(shiftLabel(item, data)) + '</td><td>' + esc(item.workplace || '—') +
        '</td><td><span class="module-tag">' + esc(item.status || '—') + '</span></td><td class="module-row-actions">' +
        '<button type="button" class="secondary-btn" data-shift-action="edit" data-id="' + esc(item.id) + '">ویرایش</button> ' +
        '<button type="button" class="module-delete-btn" data-shift-action="delete" data-id="' + esc(item.id) + '">حذف</button></td></tr>';
    }).join('') : '<tr><td colspan="7"><div class="module-empty">هنوز برنامهٔ شیفتی ثبت نشده است.</div></td></tr>';
    return '<section class="module-list-panel" id="shift-schedule" style="width:100%;min-width:0"><div class="module-list-head"><div><h3>برنامهٔ شیفت‌ها</h3>' +
      '<p>ثبت و پیگیری برنامهٔ ۱۲ ساعتهٔ روز/شب و جایگزینی روزکار، در کنار پروندهٔ کارکنان.</p></div><div class="module-page-actions">' +
      customExportMenu('shifts') + ' ' +
      '<button type="button" class="primary-btn" data-shift-action="new">+ ثبت شیفت</button></div></div>' +
      renderShiftForm(data) + '<div class="module-table-wrap" style="width:100%;max-width:100%;min-width:0"><table class="module-table"><thead><tr>' +
      sortableHeader('shifts', 'startAt', 'شروع', 'employees') +
      sortableHeader('shifts', 'endAt', 'پایان', 'employees') +
      sortableHeader('shifts', 'shiftType', 'نوع', 'employees') +
      sortableHeader('shifts', 'employees', 'کارکنان', 'employees') +
      sortableHeader('shifts', 'workplace', 'محل خدمت', 'employees') +
      sortableHeader('shifts', 'status', 'وضعیت', 'employees') +
      '<th>عملیات</th></tr></thead><tbody>' +
      rows + '</tbody></table></div><div class="module-list-foot">تعداد برنامه‌ها: ' + faDigits(shifts.length) +
      ' · برای شیفت شب، تاریخ پایان را صریحاً در روز بعد ثبت کن.</div></section>';
  }

  function renderCrud(moduleKey, section) {
    const data = appData;
    const records = data[moduleKey] || [];
    const existing = records.length;
    const actions = (moduleKey === 'employees'
      ? '<button class="secondary-btn" type="button" data-module-action="range-report" data-view="employees" title="تعداد مأموریت و مرخصی هر فرد در بازهٔ انتخاب‌شده">گزارش افراد در بازه</button>'
      : '') +
      exportMenu(moduleKey) +
      '<button class="primary-btn" type="button" data-module-action="new" data-view="' + esc(moduleKey) + '">+ ثبت مورد جدید</button>';
    section.innerHTML = rootWrap(
      pageHead(specs[moduleKey].title, specs[moduleKey].subtitle, actions) +
      (moduleKey === 'vehicles' ? vehicleTabBar() : '') +
      '<div class="module-summary" style="width:100%"><div data-tone="info"><span>تعداد کل</span><strong>' + faDigits(existing) + '</strong></div>' +
      '<div data-tone="ok"><span>امروز ثبت‌شده</span><strong>' + faDigits(records.filter(function(item){return String(item.createdAt||'').slice(0,10)===todayIso();}).length) + '</strong></div><div data-tone="special"><span>آخرین به‌روزرسانی</span><strong>' + (data.updatedAt ? displayDateTime(data.updatedAt) : '—') + '</strong></div></div>' +
      renderForm(moduleKey, data) +
      '<section class="module-list-panel" style="width:100%;min-width:0"><div class="module-list-head"><div><h3>فهرست ' + esc(specs[moduleKey].title) + '</h3><p>جست‌وجو، فیلتر، انتخاب چند ردیف و ویرایش از همین بخش انجام می‌شود.</p></div>' +
      '<div class="module-list-tools-slot">' + renderListToolbar(moduleKey) + '</div></div>' +
      '<div class="module-bulk-tools"><label><input type="checkbox" data-module-select-all> انتخاب همه</label>' +
      '<button type="button" class="module-file-btn" data-module-action="bulk-files" data-view="' + esc(moduleKey) + '" title="پنجرهٔ پرونده‌های انتخاب‌شده: فهرست مرتب در سمت راست و برگهٔ A4 در سمت چپ، با خروجی گروهی">مشاهدهٔ پرونده‌های انتخاب‌شده</button>' +
      '<button type="button" class="module-history-btn" data-module-action="bulk-history" data-view="' + esc(moduleKey) + '" title="پنجرهٔ سوابق انتخاب‌شده: همان چیدمان، ولی برگهٔ سوابق هر مورد با خروجی گروهی">مشاهدهٔ سوابق انتخاب‌شده</button>' +
      '<button type="button" class="secondary-btn" data-module-action="bulk-invert" data-view="' + esc(moduleKey) + '">انتخاب معکوس</button>' +
      '<button type="button" class="secondary-btn" data-module-action="bulk-clear" data-view="' + esc(moduleKey) + '">پاک‌کردن انتخاب</button>' +
      '<button type="button" class="module-delete-btn" data-module-action="bulk-delete" data-view="' + esc(moduleKey) + '">حذف انتخاب‌شده‌ها</button>' +
      '<span>' + faDigits(recordsForView(moduleKey, data).length) + ' مورد از ' + faDigits(existing) + '</span></div>' +
      '<div data-module-list-region>' + renderTable(moduleKey, data) + '</div></section>' +
      (moduleKey === 'employees' ? renderShiftSchedule(data) : '')
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

  // دستهٔ هر اعلان رنگ خودش را دارد: گازسنج زرد، خودرو قرمز کم‌رنگ، یادداشت سفید،
  // برنامه بنفش، اشکال نارنجی، مأموریت آبی، مرخصی سبزآبی.
  const ALERT_KIND_META = {
    gasmeter: { label: 'گازسنج', icon: 'gasmeters' },
    vehicle: { label: 'خودرو', icon: 'vehicles' },
    fault: { label: 'اشکال', icon: 'faults' },
    note: { label: 'یادداشت', icon: 'notes' },
    program: { label: 'برنامه', icon: 'programs' },
    mission: { label: 'مأموریت', icon: 'missions' },
    leave: { label: 'مرخصی', icon: 'leaves' }
  };

  function alertKindIcon(kind) {
    const name = (ALERT_KIND_META[kind] || {}).icon || 'faults';
    return window.atlasIcon ? window.atlasIcon(name) : '';
  }

  function alertCommentButton(alert) {
    if (!alert || !alert.module || !alert.recordId) return '';
    if (!recordCommentField(alert.module)) return '';
    return '<button type="button" class="notice-quick-comment" data-record-comment="' + esc(alert.module + ':' + alert.recordId) + '">کامنت سریع</button>';
  }

  function alertsForData() {
    const alerts = [];
    (appData.gasmeters || []).forEach(function (meter) {
      const name = meter.code || meter.serial || 'دستگاه';
      if (gasMeterInCalibration(meter)) {
        alerts.push({
          key:'meter-cal-' + meter.id, kind:'gasmeter', critical:true, state:'active', stateLabel:'در حال کالیبراسیون',
          title:'گازسنج در کالیبراسیون',
          detail:name + ' · ارسال ' + (meter.calibrationDispatch ? formatJalali(meter.calibrationDispatch, false) : 'ثبت‌شده') + ' · در انتظار دریافت',
          at:meter.calibrationDispatch || meter.updatedAt,
          module:'gasmeters', recordId:meter.id
        });
        return;
      }
      const left = dueInDays(meter.calibrationEnd);
      if (Number.isFinite(left) && left <= GAS_CALIBRATION_WARN_DAYS) {
        alerts.push({
          key:'meter-' + meter.id, kind:'gasmeter', critical:left <= 7, state:left <= 7 ? 'late' : 'active',
          stateLabel:left < 0 ? 'مهلت گذشته' : (left <= 7 ? 'نیازمند اقدام' : 'در حال انجام'),
          title:'موعد کالیبراسیون گازسنج',
          detail:name + ' · ' + (left < 0 ? 'مهلت گذشته' : 'تا ' + faDigits(left) + ' روز دیگر'),
          at:meter.calibrationEnd,
          module:'gasmeters', recordId:meter.id
        });
      }
    });
    (appData.vehicles || []).forEach(function (vehicle) {
      if (['در تعمیر','خارج از سرویس'].includes(vehicle.status) || vehicle.healthStatus === 'دارای نقص') {
        alerts.push({ key:'vehicle-' + vehicle.id, kind:'vehicle', critical:true, state:'late', stateLabel:'نیازمند رسیدگی', title:'خودرو نیازمند رسیدگی', detail:(vehicle.name || 'خودرو') + ' · ' + (vehicle.status || vehicle.healthStatus || ''), at:vehicle.updatedAt, module:'vehicles', recordId:vehicle.id });
      }
      const km = Number(vehicle.currentKm), next = Number(vehicle.nextOilKm);
      if (Number.isFinite(km) && Number.isFinite(next) && next > 0 && next - km <= 500) {
        alerts.push({ key:'oil-' + vehicle.id, kind:'vehicle', critical:next <= km, state:next <= km ? 'late' : 'active', stateLabel:next <= km ? 'مهلت گذشته' : 'در حال انجام', title:'سررسید سرویس روغن', detail:(vehicle.name || 'خودرو') + ' · ' + (next <= km ? 'موعد گذشته' : faDigits(next - km) + ' کیلومتر مانده'), at:vehicle.updatedAt, module:'vehicles', recordId:vehicle.id });
      }
    });
    (appData.faults || []).forEach(function (fault) {
      const open = fault.status !== 'رفع شد' && fault.status !== 'بسته‌شده';
      if (!open) return;
      alerts.push({
        key:'fault-' + fault.id, kind:'fault',
        critical:fault.priority === 'بحرانی' || fault.priority === 'زیاد',
        state:'active', stateLabel:'در حال انجام',
        title:'اشکال باز: ' + (fault.title || 'بدون عنوان'),
        detail:(faultAssetLabel(fault) || '') + ' · ' + (fault.status || 'ثبت‌شده') + ' · ' + faDigits(faultProgress(fault)) + '٪ رفع',
        at:fault.reportedAt, view:'faults',
        module:'faults', recordId:fault.id
      });
    });
    (appData.notes || []).forEach(function (note) {
      const left = dueInDays(note.dueDate);
      if (note.dueDate && left < 0 && !['تکمیل‌شده','لغوشده'].includes(note.status)) {
        alerts.push({ key:'note-' + note.id, kind:'note', critical:false, state:'late', stateLabel:'موعد گذشته', title:'پیگیری با موعد گذشته', detail:note.title || 'پیگیری', at:note.dueDate, module:'notes', recordId:note.id });
      }
    });
    (appData.programs || []).forEach(function (program) {
      if (['تکمیل‌شده','لغوشده'].includes(program.status)) return;
      const left = dueInDays(program.dueDate);
      if (!program.dueDate || !Number.isFinite(left) || left > 3) return;
      alerts.push({
        key:'program-' + program.id, kind:'program', critical:left < 0, state:left < 0 ? 'late' : 'active',
        stateLabel:left < 0 ? 'عقب‌افتاده' : 'در حال انجام',
        title:left < 0 ? 'برنامه با مهلت گذشته' : 'مهلت برنامه نزدیک است',
        detail:(program.title || 'برنامه') + ' · ' + (left < 0 ? faDigits(Math.abs(left)) + ' روز گذشته' : 'تا ' + faDigits(left) + ' روز دیگر'),
        at:program.dueDate, module:'programs', recordId:program.id
      });
    });
    const today = todayIso();
    (appData.missions || []).forEach(function (mission) {
      if (['انجام‌شده','لغو‌شده'].includes(mission.status)) return;
      if (String(mission.startAt || '').slice(0, 10) !== today) return;
      alerts.push({
        key:'mission-' + mission.id, kind:'mission', critical:false, state:'waiting', stateLabel:'برنامه‌ریزی‌شده',
        title:'مأموریت امروز',
        detail:(mission.title || 'مأموریت') + ' · ' + (mission.status || 'برنامه‌ریزی‌شده'),
        at:mission.startAt, module:'missions', recordId:mission.id
      });
    });
    (appData.leaves || []).forEach(function (leave) {
      if (leave.status !== 'در انتظار تأیید') return;
      const person = (appData.employees || []).find(function (item) { return String(item.id) === String(leave.employeeId); });
      alerts.push({
        key:'leave-' + leave.id, kind:'leave', critical:false, state:'waiting', stateLabel:'در انتظار تأیید',
        title:'مرخصی در انتظار تأیید',
        detail:(person ? employeeName(person) : 'کارمند') + ' · ' + (leave.startDate ? formatJalali(leave.startDate, false) : ''),
        at:leave.startDate, module:'leaves', recordId:leave.id
      });
    });
    // موارد «انجام‌شدهٔ امروز» هم در مرکز اعلان‌ها می‌آیند تا نوار سبز «انجام شد»
    // معنای واقعی داشته باشد؛ این موارد در ویجت «نیازمند توجه» داشبورد نمی‌آیند.
    (appData.missions || []).forEach(function (mission) {
      if (mission.status !== 'انجام‌شده') return;
      const at = String(mission.endAt || mission.updatedAt || '');
      if (at.slice(0, 10) !== today) return;
      alerts.push({
        key:'mission-done-' + mission.id, kind:'mission', critical:false, done:true,
        state:'done', stateLabel:'انجام شد',
        title:'مأموریت انجام شد',
        detail:(mission.title || 'مأموریت') + (mission.result ? ' · ' + String(mission.result).slice(0, 60) : ''),
        at:at, module:'missions', recordId:mission.id
      });
    });
    (appData.faults || []).forEach(function (fault) {
      if (fault.status !== 'رفع شد' && fault.status !== 'بسته‌شده') return;
      const at = String(fault.fixedAt || fault.updatedAt || '');
      if (at.slice(0, 10) !== today) return;
      alerts.push({
        key:'fault-done-' + fault.id, kind:'fault', critical:false, done:true,
        state:'done', stateLabel:'رفع شد',
        title:'اشکال رفع شد',
        detail:(fault.title || 'بدون عنوان') + (faultAssetLabel(fault) ? ' · ' + faultAssetLabel(fault) : ''),
        at:at, module:'faults', recordId:fault.id
      });
    });
    return alerts.sort(function (a,b) { return Number(b.critical)-Number(a.critical); });
  }

  // وضعیت هر اعلان با یک نوار رنگی نشان داده می‌شود: سبز انجام شد، زرد در حال
  // انجام، آبی برنامه‌ریزی‌شده، قرمز عقب‌افتاده.
  const ALERT_STATE_META = {
    done: { tone: 'ok', label: 'انجام شد' },
    active: { tone: 'warn', label: 'در حال انجام' },
    waiting: { tone: 'info', label: 'برنامه‌ریزی‌شده' },
    late: { tone: 'danger', label: 'نیازمند اقدام' }
  };
  function alertStateMeta(alert) {
    const meta = ALERT_STATE_META[(alert && alert.state) || 'active'] || ALERT_STATE_META.active;
    return { tone: meta.tone, label: (alert && alert.stateLabel) || meta.label };
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
    const now = nowLocalDateTime();
    const activeShift = (appData.shifts || []).find(function (shift) {
      const people = Array.isArray(shift.employeeIds) ? shift.employeeIds.map(String) : [];
      return people.includes(String(employee.id)) &&
        ['برنامه‌ریزی‌شده','جایگزینی روزکار'].includes(shift.status) &&
        String(shift.startAt || '') <= now && String(shift.endAt || '') >= now;
    });
    if (activeShift) return activeShift.status === 'جایگزینی روزکار' || activeShift.shiftType === 'روزکار' ? 'در حال کار' : 'شیفت';
    return employee.status || 'ثبت نشده';
  }

  // اعلان‌ها بر اساس دسته گروه می‌شوند؛ هر دسته رنگ خودش را دارد و ترتیب
  // گروه‌ها همان ترتیب اهمیت (اول موارد بحرانی) است.
  function noticeGroupsHtml(alerts) {
    const groups = [];
    const index = {};
    alerts.forEach(function (alert) {
      const kind = alert.kind || 'other';
      if (!index[kind]) {
        index[kind] = { kind: kind, items: [] };
        groups.push(index[kind]);
      }
      index[kind].items.push(alert);
    });
    return groups.map(function (group) {
      const meta = ALERT_KIND_META[group.kind] || { label: 'پیگیری' };
      const open = group.items.filter(function (item) { return !item.done; }).length;
      return '<section class="notice-group" data-kind="' + esc(group.kind) + '">' +
        '<header class="notice-group-head"><span class="notice-group-dot" aria-hidden="true"></span>' +
        '<b>' + esc(meta.label) + '</b><small>' + faDigits(group.items.length) + ' مورد' + (open && open !== group.items.length ? ' · ' + faDigits(open) + ' باز' : '') + '</small></header>' +
        '<div class="notice-group-items">' + group.items.map(noticeCardHtml).join('') + '</div></section>';
    }).join('');
  }

  function noticeCardHtml(a) {
    const state = alertStateMeta(a);
    const when = a.at ? formatJalali(a.at, false) : '';
    return '<div class="notice-card notice-kind-' + esc(a.kind || 'other') + (a.critical ? ' unread' : '') + (a.done ? ' is-done' : '') +
      '" data-kind="' + esc(a.kind || 'other') + '" data-state="' + esc(a.state || 'active') + '"' +
      ' data-alert-key="' + esc(a.key || '') + '" tabindex="0" role="button" aria-label="' + esc((a.title || '') + ' — ' + (a.detail || '')) + '">' +
      '<span class="notice-state-bar" data-tone="' + state.tone + '" aria-hidden="true"></span>' +
      '<div class="notice-mark">' + alertKindIcon(a.kind) + '</div>' +
      '<div class="notice-body"><b>' + esc(a.title) + '</b><p>' + esc(a.detail) + '</p>' +
      '<div class="notice-meta"><span class="notice-state-chip" data-tone="' + state.tone + '">' + esc(state.label) + '</span>' +
      '<small>' + esc((ALERT_KIND_META[a.kind] || { label: 'پیگیری' }).label) + (when ? ' · ' + esc(when) : '') + '</small></div></div>' +
      '<span class="notice-unread"></span></div>';
  }

  // پنجرهٔ جزئیات یک اعلان: تمام اطلاعات همان اعلان + کامنت روی رکورد مرتبط.
  // کلید اعلان از data-alert-key کارت می‌آید و در noticeAlertIndex نگه‌داری می‌شود.
  let noticeAlertIndex = Object.create(null);

  function openNoticeDialog(alert) {
    if (!alert) return;
    const state = alertStateMeta(alert);
    const kindMeta = ALERT_KIND_META[alert.kind] || { label: 'پیگیری' };
    const moduleKey = alert.module || '';
    const record = moduleKey ? (appData[moduleKey] || []).find(function (item) { return String(item.id) === String(alert.recordId); }) : null;
    const rows = [
      ['دستهٔ اعلان', kindMeta.label],
      ['وضعیت', state.label],
      ['تاریخ', alert.at ? formatJalali(alert.at, true) : 'ثبت نشده']
    ];
    if (record) rows.push(['مورد مرتبط', recordLabel(moduleKey, record)]);
    const canComment = !!(moduleKey && alert.recordId && recordCommentField(moduleKey) && record);
    const canOpenFile = !!(moduleKey && alert.recordId && record && window.AtlasRecordFile);
    const backdrop = document.createElement('div');
    backdrop.className = 'atlas-modal-backdrop atlas-dialog-backdrop';
    backdrop.setAttribute('data-modal-backdrop', '');
    backdrop.setAttribute('data-modal-kind', 'notice');
    backdrop.innerHTML =
      '<div class="atlas-modal atlas-dialog" role="dialog" aria-modal="true" aria-labelledby="atlasNoticeTitle">' +
        '<div class="atlas-modal-head"><div><h3 id="atlasNoticeTitle">جزئیات اعلان</h3>' +
          '<p>' + esc((specs[moduleKey] && specs[moduleKey].title) || 'مرکز اعلان‌ها') + '</p></div>' +
          '<button type="button" class="atlas-modal-close" data-notice-close aria-label="بستن پنجره">×</button></div>' +
        '<div class="atlas-modal-body"><div class="notice-detail" data-kind="' + esc(alert.kind || 'other') + '">' +
          '<div class="notice-detail-head"><div class="notice-mark">' + alertKindIcon(alert.kind) + '</div>' +
            '<div><b>' + esc(alert.title || 'اعلان') + '</b><small>' + esc(state.label) + ' · ' + esc(kindMeta.label) + '</small></div></div>' +
          '<p class="notice-detail-text">' + esc(alert.detail || 'توضیحی برای این اعلان ثبت نشده است.') + '</p>' +
          '<div class="notice-detail-rows">' + rows.map(function (row) {
            return '<div class="notice-detail-row"><span>' + esc(row[0]) + '</span><b>' + esc(row[1]) + '</b></div>';
          }).join('') + '</div>' +
          '<div class="notice-detail-actions">' +
            (canComment ? '<button type="button" class="primary-btn" data-notice-comment>ثبت کامنت</button>' : '') +
            (canOpenFile ? '<button type="button" class="secondary-btn" data-notice-file>مشاهدهٔ پرونده</button>' : '') +
            '<button type="button" class="secondary-btn" data-notice-close>بستن</button>' +
          '</div>' +
          (canComment ? '<p class="notice-detail-note">کامنت با تاریخ شمسی در سوابق همین مورد ثبت می‌شود و در «کامنت» همان بخش هم دیده می‌شود.</p>'
            : '<p class="notice-detail-note">برای این اعلان رکورد کامنت‌پذیری وجود ندارد.</p>') +
        '</div></div></div>';
    document.body.appendChild(backdrop);
    let closed = false;
    function closeNotice() {
      if (closed) return;
      closed = true;
      backdrop.remove();
    }
    backdrop.querySelectorAll('[data-notice-close]').forEach(function (btn) { btn.addEventListener('click', closeNotice); });
    backdrop.addEventListener('click', function (event) { if (event.target === backdrop) closeNotice(); });
    backdrop.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeNotice(); });
    const commentButton = backdrop.querySelector('[data-notice-comment]');
    if (commentButton) {
      commentButton.addEventListener('click', function () {
        openCommentDialog(moduleKey, alert.recordId);
      });
    }
    const fileButton = backdrop.querySelector('[data-notice-file]');
    if (fileButton) {
      fileButton.addEventListener('click', function () {
        closeNotice();
        document.dispatchEvent(new CustomEvent('atlas-open-file', { detail: { module: moduleKey, id: alert.recordId } }));
      });
    }
    const closeButton = backdrop.querySelector('[data-notice-close]');
    if (closeButton) closeButton.focus();
  }

  function refreshDashboard() {
    if (!ready) return;
    renderQuickAdd();
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
        {label:'نیروی شیفتی',value:count(function(e){return e.workType === 'شیفتی' || e.workType === 'شیفت کاری';})},
        {label:'نیروی روزکار',value:count(function(e){return e.workType === 'روزکار' || e.workType === 'روزکار ثابت';})},
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

    const rangeStart = dashboardRange.start || '';
    const rangeEnd = dashboardRange.end || '';
    const dashboardMissions = missions.filter(function(mission) {
      const day = String(mission.startAt || '').slice(0,10);
      if (!day) return false;
      if (rangeStart && day < rangeStart) return false;
      if (rangeEnd && day > rangeEnd) return false;
      return true;
    });
    const missionWidget=document.querySelector('[data-widget="missions"]');
    if(missionWidget){
      const list=missionWidget.querySelector('.list'),badge=missionWidget.querySelector('.widget-meta .status-pill');
      if(badge)badge.textContent=faDigits(dashboardMissions.length)+' مورد';
      if(list){
        const recent=dashboardMissions.slice().sort(function(a,b){return String(b.startAt||'').localeCompare(String(a.startAt||''));}).slice(0,6);
        list.innerHTML=recent.length?recent.map(function(m,index){
          const names=(m.crewIds||[]).map(function(id){const person=staff.find(function(e){return String(e.id)===String(id)});return person?employeeName(person):''}).filter(Boolean);
          const crew=[names.join('، '),m.crewText].filter(Boolean).join('؛ ');
          return '<div class="list-item"><div class="route-mark"><b>'+esc((m.operationalRange||m.destination||'—').slice(0,3))+'</b><span>مسیر '+faDigits(index+1)+'</span></div><div class="list-main"><b>'+esc(m.title||'مأموریت')+'</b><span>'+esc([m.origin,m.destination,m.operationalRange].filter(Boolean).join(' ← '))+' · '+esc(crew||'گروه ثبت نشده')+'</span></div><div class="list-side"><strong>'+esc(m.status||'ثبت نشده')+'</strong><span class="status-pill">'+formatJalali(m.startAt,true)+'</span></div></div>';
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
        const label=gasMeterInCalibration(m)?'در کالیبراسیون':left<0?'منقضی':left<=GAS_CALIBRATION_WARN_DAYS?'نزدیک موعد':(m.status||'معتبر');
        const percent=left===Infinity?0:Math.max(5,Math.min(100,Math.round(left/90*100)));
        const gases=Array.isArray(m.gases)?m.gases.join(', '):String(m.gases||'گاز ثبت نشده');
        return '<div class="equip-row"><div class="equip-label"><div class="gas-chip">'+esc(gases.slice(0,6)||'GAS')+'</div><div><b>'+esc(m.code||m.serial||'گازسنج')+'</b><span>'+esc(m.serial||'')+' · '+esc(m.location||'محل ثبت نشده')+'<div class="progress-track"><div class="progress-bar" style="width:'+percent+'%"></div></div></span></div></div><span class="equip-status'+((gasMeterInCalibration(m)||left<=GAS_CALIBRATION_WARN_DAYS)?' warn':'')+'">'+esc(label)+'</span></div>';
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
      const today=todayIso();
      const selectedStart=dashboardRange.start||today;
      const selectedEnd=dashboardRange.end||today;
      const singleDay=selectedStart===selectedEnd;
      const items=[];
      const dayInRange=function(value){const day=String(value||'').slice(0,10);return !!day&&day>=selectedStart&&day<=selectedEnd;};
      missions.filter(function(m){return dayInRange(m.startAt)&&m.status!=='لغو‌شده';}).forEach(function(m){
        items.push({sortKey:String(m.startAt||''),date:String(m.startAt||'').slice(0,10),time:String(m.startAt||'').slice(11,16),type:'مأموریت',title:m.title||'مأموریت',detail:[m.operationalRange,m.destination].filter(Boolean).join(' · ')});
      });
      (appData.shifts||[]).filter(function(s){
        const start=String(s.startAt||'').slice(0,10),end=String(s.endAt||'').slice(0,10);
        return start&&end&&start<=selectedEnd&&end>=selectedStart&&['برنامه‌ریزی‌شده','جایگزینی روزکار'].includes(s.status);
      }).forEach(function(s){
        items.push({sortKey:String(s.startAt||''),date:String(s.startAt||'').slice(0,10),time:String(s.startAt||'').slice(11,16),type:'شیفت',title:(s.shiftType||'شیفت')+' · '+shiftLabel(s,appData),detail:[s.workplace,s.status].filter(Boolean).join(' · ')});
      });
      appData.notes.filter(function(n){return dayInRange(n.dueDate||n.date)&&!['تکمیل‌شده','لغوشده'].includes(n.status);}).forEach(function(n){
        items.push({sortKey:String(n.dueDate||n.date||''),date:String(n.dueDate||n.date||''),time:'',type:'پیگیری',title:n.title||'پیگیری',detail:n.related||n.body||''});
      });
      appData.leaves.filter(function(l){
        return String(l.startDate||'')<=selectedEnd&&String(l.endDate||l.startDate||'')>=selectedStart&&l.status!=='ردشده';
      }).forEach(function(l){
        const person=staff.find(function(e){return String(e.id)===String(l.employeeId)});
        items.push({sortKey:String(l.startDate||''),date:String(l.startDate||''),time:'',type:'مرخصی',title:person?employeeName(person):'مرخصی',detail:l.leaveType||''});
      });
      items.sort(function(a,b){return String(a.sortKey).localeCompare(String(b.sortKey));});
      agenda.innerHTML=items.length?items.slice(0,8).map(function(item){
        const timeLabel=singleDay?faDigits(item.time||item.type):((item.date?formatJalali(item.date,false)+' · ':'')+faDigits(item.time||item.type));
        return '<div class="agenda-row"><div class="agenda-time">'+esc(timeLabel)+'</div><div class="agenda-dot"></div><div class="agenda-text"><b>'+esc(item.title)+'</b><span>'+esc(item.detail||item.type)+'</span></div></div>';
      }).join(''):'<div class="module-empty">برای بازهٔ انتخاب‌شده مأموریت، شیفت یا پیگیری زمان‌بندی‌شده‌ای ثبت نشده است.</div>';
      const p=calendar.querySelector('.widget-title p');
      if(p)p.textContent=singleDay?'برنامهٔ روز انتخاب‌شده بر اساس اطلاعات ثبت‌شده':'برنامهٔ بازهٔ انتخاب‌شده بر اساس اطلاعات ثبت‌شده';
    }

    const alerts=alertsForData();
    // ویجت داشبورد فقط موارد نیازمند توجه را نشان می‌دهد؛ موارد «انجام‌شده» در
    // مرکز اعلان‌ها می‌مانند.
    const openAlerts=alerts.filter(function(a){return !a.done;});
    const alertsWidget=document.querySelector('[data-widget="alerts"]'),alertList=alertsWidget&&alertsWidget.querySelector('.alert-list');
    if(alertList){
      const existingButton=document.getElementById('seeAllAlerts');
      alertList.innerHTML=openAlerts.length?openAlerts.slice(0,5).map(function(a){
        const state=alertStateMeta(a);
        return '<div class="alert-item alert-kind-'+esc(a.kind||'other')+(a.critical?' critical':'')+'" data-kind="'+esc(a.kind||'other')+'" data-state="'+esc(a.state||'active')+'">'+
          '<span class="alert-state-bar" data-tone="'+state.tone+'" aria-hidden="true"></span>'+
          '<div class="alert-symbol">'+alertKindIcon(a.kind)+'</div>'+
          '<div class="alert-copy"><b>'+esc(a.title)+'</b><p>'+esc(a.detail)+'</p>'+
            '<span class="alert-state-chip" data-tone="'+state.tone+'">'+esc(state.label)+'</span></div>'+
          alertCommentButton(a)+
          '<span class="alert-age">'+esc((ALERT_KIND_META[a.kind]||{label:'پیگیری'}).label)+'</span></div>';
      }).join(''):'<div class="module-empty">هشدار عملیاتی ثبت‌شده‌ای وجود ندارد.</div>';
      if(existingButton)alertList.appendChild(existingButton);
    }
    // شمارندهٔ زنگ = مجموع اعلان‌ها (باز و انجام‌شدهٔ امروز).
    const notificationBadge=document.getElementById('notificationCount');
    if(notificationBadge)notificationBadge.textContent=faDigits(alerts.length);
    const notificationList=document.getElementById('noticeList');
    if(notificationList){
      noticeAlertIndex=Object.create(null);
      alerts.forEach(function(a){if(a.key)noticeAlertIndex[a.key]=a;});
      notificationList.innerHTML=alerts.length?noticeGroupsHtml(alerts):'<div class="module-empty">اعلان تازه‌ای وجود ندارد.</div>';
    }
    const operations=document.querySelector('[data-widget="operations"]');
    if(operations){
      const chart=operations.querySelector('.chart'),legend=operations.querySelector('.chart-legend'),labels=operations.querySelector('.chart-labels');
      if(chart)chart.hidden=true;if(legend)legend.hidden=true;if(labels)labels.hidden=true;
      let summary=document.getElementById('operationsRealDataSummary');
      if(!summary){summary=document.createElement('div');summary.id='operationsRealDataSummary';summary.className='module-empty';if(chart)chart.insertAdjacentElement('afterend',summary);}
      summary.textContent='مأموریت‌های ثبت‌شده در بازهٔ '+faDigits(dashboardMissions.length)+' مورد است.';
    }
    const stationsWidget=document.querySelector('[data-widget="stations"]');
    if(stationsWidget){
      const records=stationRecords();
      const map=stationsWidget.querySelector('[data-station-map]');
      if(map){
        map.innerHTML=stationMapInner(records);
        wireStationMap(stationsWidget);
      }
      const caption=stationsWidget.querySelector('.widget-title p');
      if(caption)caption.textContent=records.length?'برای دیدن اطلاعات هر مکان روی آن بزن':'هنوز ایستگاه یا مرکزی ثبت نشده است';
      const footer=stationsWidget.querySelector('[data-station-caption]');
      if(footer)footer.innerHTML='<span>'+faDigits(records.length)+' ایستگاه / مرکز ثبت‌شده</span><a class="station-caption-link" href="./index.html?view=stations">مدیریت و افزودن ایستگاه ←</a>';
    }

    const foot=document.querySelector('.footnote');
    if(foot){const parts=foot.querySelectorAll('span');if(parts[1])parts[1].textContent='مرکز مدیریت عملیات ATLAS SHIFT';if(parts[3])parts[3].textContent='داده‌های نمونه برای بازبینی جریان کار';}
    enhanceSearchSelects(document.body);

  }

  function reportDateFor(moduleKey, record) {
    if (moduleKey === 'missions' || moduleKey === 'shifts') return String(record.startAt || '').slice(0,10);
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
    const actions = '<select id="reportExportFormat" class="module-report-export" aria-label="قالب خروجی گزارش"><option value="csv">CSV</option><option value="xlsx">Excel (.xlsx)</option><option value="docx">Word (.docx)</option><option value="png">تصویر PNG</option></select><button class="primary-btn" type="button" data-module-action="export-report">دریافت گزارش</button><button class="secondary-btn" type="button" data-module-action="print">چاپ / ذخیرهٔ PDF</button><button class="secondary-btn" type="button" data-module-action="export-all">CSV همهٔ اطلاعات</button>';
    const cards = MODULES.map(function (key) {
      const total=appData[key].filter(function(record){return isInRange(key,record,reportPeriod);}).length;
      return '<a class="module-report-card" href="./index.html?view='+esc(key)+'"><span>'+esc(specs[key].title)+'</span><strong>'+faDigits(total)+'</strong><small>مشاهدهٔ فهرست ←</small></a>';
    }).join('') + '<a class="module-report-card" href="./index.html?view=employees#shift-schedule"><span>برنامهٔ شیفت‌ها</span><strong>' +
      faDigits((appData.shifts || []).filter(function(record){return isInRange('shifts',record,reportPeriod);}).length) +
      '</strong><small>مشاهده و ویرایش ←</small></a>';
    const activeStaff=appData.employees.filter(function(item){return effectiveEmployeeStatus(item)!=='غیرفعال';}).length;
    const openMissions=appData.missions.filter(function(item){return ['در جریان','برنامه‌ریزی‌شده'].includes(item.status);}).length;
    const dueMeters=appData.gasmeters.filter(function(item){return dueInDays(item.calibrationEnd)<=30;}).length;
    section.innerHTML=rootWrap(
      pageHead('گزارش‌ها و آمار','خلاصهٔ اطلاعات ثبت‌شده در دستگاه و فیلتر براساس بازهٔ زمانی.',actions)+
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>بازهٔ گزارش</h3><p>برای بازهٔ سفارشی تاریخ شمسی را وارد کن.</p></div><div class="module-list-tools"><select data-report-period aria-label="بازهٔ گزارش">'+periods.map(function(item){return '<option value="'+item[0]+'"'+(reportPeriod===item[0]?' selected':'')+'>'+item[1]+'</option>';}).join('')+'</select></div></div>'+
      '<div class="module-report-range" data-report-custom'+(reportPeriod==='custom'?'':' hidden')+'><label class="module-field"><span>از تاریخ شمسی</span><input type="text" data-jalali-input="jalali" data-report-from value="'+esc(reportFrom)+'" placeholder="۱۴۰۵/۰۷/۰۱"></label><label class="module-field"><span>تا تاریخ شمسی</span><input type="text" data-jalali-input="jalali" data-report-to value="'+esc(reportTo)+'" placeholder="۱۴۰۵/۰۷/۳۰"></label><button type="button" class="primary-btn" data-module-action="apply-report-range">اعمال بازه</button></div></section>'+
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
      rows.map(function(item){return '<tr><td>'+formatJalali(item.at,true)+'</td><td>'+esc(item.module==='shifts'?'برنامهٔ شیفت':(specs[item.module]?specs[item.module].title:item.module))+'</td><td>'+esc(item.recordLabel||'—')+'</td><td>'+esc(item.action)+'</td><td>'+esc((item.changes||[]).map(function(c){return c.field+': '+c.before+' ← '+c.after;}).join('؛ ')||'—')+'</td></tr>';}).join('')+'</tbody></table></div>';
  }

  function customFieldTypeOptions(selected) {
    return Object.keys(CUSTOM_FIELD_TYPES).map(function (key) {
      return '<option value="' + esc(key) + '"' + (key === selected ? ' selected' : '') + '>' + esc(CUSTOM_FIELD_TYPES[key]) + '</option>';
    }).join('');
  }

  function customFieldRowHtml(line) {
    const parts = String(line || '').split('|');
    const label = String(parts[0] || '').trim();
    const type = CUSTOM_FIELD_TYPES[String(parts[1] || 'text').trim()] ? String(parts[1]).trim() : 'text';
    return '<div class="module-custom-field-row" data-custom-field-row>' +
      '<input type="text" data-cf-label value="' + esc(label) + '" placeholder="عنوان فیلد" aria-label="عنوان فیلد سفارشی">' +
      '<select data-cf-type aria-label="نوع فیلد">' + customFieldTypeOptions(type) + '</select>' +
      '<button type="button" class="module-delete-btn" data-module-action="custom-field-remove">حذف</button></div>';
  }

  let settingsTab = 'lists';

  const SETTINGS_TABS = [
    { id: 'lists', title: 'منوها و فهرست‌ها', icon: '☰' },
    { id: 'places', title: 'مکان‌های ایستگاه', icon: '⚑' },
    { id: 'dashboard', title: 'تنظیمات داشبورد', icon: '▦' },
    { id: 'quickadd', title: 'ثبت سریع داشبورد', icon: '⚡' },
    { id: 'backup', title: 'پشتیبان‌گیری و ذخیره‌سازی', icon: '⤓' }
  ];

  function testModeCardMarkup() {
    return '<div class="module-local-note" data-tone="' + (TEST_MODE ? 'warn' : 'info') + '" style="margin-bottom:10px">' +
      (TEST_MODE
        ? 'الان در <strong>حالت آزمایشی</strong> هستی: هر کارمند، مرخصی یا آیتمی که ثبت کنی فقط در فضای آزمایشی ذخیره می‌شود و به دادهٔ اصلی دست نمی‌زند.'
        : 'دادهٔ اصلی خام و دست‌نخورده است. برای آزمودن برنامه، حالت آزمایشی را روشن کن تا اطلاعات تست در فضایی جدا از دادهٔ اصلی ذخیره شود.') +
      '</div><div class="settings-layout-actions">' +
      '<button type="button" class="' + (TEST_MODE ? 'secondary-btn' : 'primary-btn') + '" data-module-action="toggle-test-mode">' +
      (TEST_MODE ? 'خروج از حالت آزمایشی' : 'روشن کردن حالت آزمایشی') + '</button>' +
      (TEST_MODE ? ' <button type="button" class="secondary-btn" data-module-action="clear-test-data">پاک کردن اطلاعات آزمایشی</button>' : '') +
      '</div>';
  }

  function backupSectionMarkup() {
    return '<section class="module-list-panel"><div class="module-list-head"><div><h3>حالت آزمایشی و دادهٔ اصلی</h3><p>اطلاعات تست هرگز با دادهٔ اصلی قاطی نمی‌شود؛ دو فضای ذخیره‌سازی مستقل روی همین دستگاه.</p></div></div>' +
      testModeCardMarkup() + '</section>' +
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>پشتیبان‌گیری و بازیابی</h3><p>نسخهٔ پشتیبان تمام پرونده‌ها، تاریخچه، تنظیمات و پیوست‌های محلی را دربر می‌گیرد.</p></div></div>' +
      '<div class="module-backup-grid"><div class="module-backup-card"><strong>ساخت نسخهٔ پشتیبان</strong><p>یک فایل JSON از تمام داده‌های موجود در این دستگاه دریافت می‌کنی.</p><button type="button" class="primary-btn" data-module-action="backup">دریافت فایل پشتیبان</button></div>' +
      '<div class="module-backup-card"><strong>بازیابی نسخهٔ پشتیبان</strong><p>بازیابی، داده‌های فعلی را جایگزین اطلاعات درون فایل انتخاب‌شده می‌کند.</p><button type="button" class="secondary-btn" data-module-action="restore-select">انتخاب فایل پشتیبان</button><input type="file" id="atlasRestoreFile" accept=".json,application/json" hidden></div></div></section>' +
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>ذخیره‌سازی</h3><p>هر تغییر بی‌درنگ در همین دستگاه ذخیره و رمزنگاری می‌شود.</p></div></div>' +
      '<div class="module-local-note" data-storage-status>' + storageSummary() + '</div>' +
      '<div class="module-local-note" data-storage-size style="margin-top:8px">حجم ذخیره‌شده: در حال محاسبه…</div></section>';
  }

  // ویرایشگر فیلدهای سفارشی، درون خود پنجرهٔ ثبت کارمند.
  function customFieldsEditorMarkup() {
    const lines = String(appData.settings.employeeCustomFields || '').split(/\r?\n/)
      .map(function (line) { return line.trim(); }).filter(Boolean);
    return '<details class="module-custom-block" data-custom-fields-block>' +
      '<summary><span>+ فیلدهای سفارشی</span><small>اگر فیلد پرسنلی بیشتری لازم بود اینجا اضافه یا حذف کن؛ فیلد تازه بلافاصله در همین فرم دیده می‌شود.</small></summary>' +
      '<div class="module-custom-block-body">' +
      '<div class="module-custom-fields" data-custom-field-rows>' + lines.map(customFieldRowHtml).join('') + '</div>' +
      '<div class="module-form-actions"><span class="module-required-help">حداکثر ۲۰ فیلد سفارشی؛ برای هر فیلد یک عنوان و یک نوع انتخاب کن.</span><div>' +
      '<button type="button" class="secondary-btn" data-module-action="custom-field-add">+ افزودن فیلد</button> ' +
      '<button type="button" class="primary-btn" data-module-action="custom-field-save">ذخیرهٔ فیلدها</button></div></div>' +
      '</div></details>';
  }

  function settingsPaneMarkup(id) {
    if (id === 'lists') return referenceManagerMarkup();
    if (id === 'places') {
      return '<p class="reference-hint">هر مکان زیرمجموعهٔ یک «نوع محل» است و همان‌جا افزودن، تغییر نام و حذف می‌شود. فهرست مشترک مکان‌ها (شهر، محل خدمت، محل استقرار، محدودهٔ عملیاتی) در تب «منوها و فهرست‌ها» › «مکان‌ها و محل‌ها» است.</p>' + stationPlacesPanel();
    }
    if (id === 'dashboard') return dashboardEditorMarkup();
    if (id === 'quickadd') return quickAddEditorMarkup();
    return backupSectionMarkup();
  }

  function renderSettings(section) {
    if (!SETTINGS_TABS.some(function (tab) { return tab.id === settingsTab; })) settingsTab = 'lists';
    section.innerHTML = rootWrap(
      pageHead('تنظیمات', 'مدیریت محلی اطلاعات: فهرست‌های کشویی، مکان‌ها، چیدمان و ثبت سریع داشبورد، فیلدهای پرسنلی و نسخهٔ پشتیبان.', '') +
      '<div class="settings-view-tabs" role="tablist">' + SETTINGS_TABS.map(function (tab) {
        return '<button type="button" role="tab" class="settings-view-tab' + (tab.id === settingsTab ? ' is-active' : '') + '" data-settings-tab="' + tab.id + '" aria-selected="' + (tab.id === settingsTab) + '"><span aria-hidden="true">' + tab.icon + '</span>' + esc(tab.title) + '</button>';
      }).join('') + '</div>' +
      '<div class="settings-view-panes">' + SETTINGS_TABS.map(function (tab) {
        return '<div class="settings-view-pane" data-settings-pane="' + tab.id + '"' + (tab.id === settingsTab ? '' : ' hidden') + '>' + settingsPaneMarkup(tab.id) + '</div>';
      }).join('') + '</div>'
    );
    if (settingsTab === 'backup') fillStorageSize();
    if (settingsTab === 'dashboard') wireDashboardEditor();
  }

  // حجم واقعی داده روی دستگاه در برابر حجم متن ساده — تا «کم‌حجم بودن» قابل دیدن باشد.
  function bytesLabel(n) {
    if (!n) return '۰';
    if (n < 1024) return faDigits(n) + ' بایت';
    if (n < 1024 * 1024) return faDigits((n / 1024).toFixed(1)) + ' کیلوبایت';
    return faDigits((n / 1024 / 1024).toFixed(2)) + ' مگابایت';
  }

  async function storageFootprint() {
    const plain = new TextEncoder().encode(snapshotJson()).length;
    let stored = 0;
    try {
      const value = await loadFromDb(db || await openDb());
      stored = window.ATLAS_SECURE.isSealed(value) ? value.ct.byteLength : new TextEncoder().encode(JSON.stringify(value || '')).length;
    } catch (error) { stored = 0; }
    return { plain: plain, stored: stored };
  }

  async function fillStorageSize() {
    const box = document.querySelector('[data-storage-size]');
    if (!box) return;
    const size = await storageFootprint();
    const live = document.querySelector('[data-storage-size]');
    if (!live) return;
    live.innerHTML = 'حجم ذخیره‌شده: <strong>' + bytesLabel(size.stored) + '</strong>' +
      (size.plain ? ' · متن سادهٔ معادل: ' + bytesLabel(size.plain) +
        ' · نسبت: <strong>' + faDigits(Math.max(1, Math.round((size.stored / size.plain) * 100))) + '٪</strong>' : '');
  }

  function storageSummary() {
    const secure = !!(window.ATLAS_SECURE && window.ATLAS_SECURE.available());
    const state = storageLocked ? 'قفل‌شده برای جلوگیری از پاک‌شدن' : (ready ? 'فعال' : 'در حال آماده‌سازی');
    return 'وضعیت ذخیره‌سازی: <strong>' + esc(state) + '</strong> · رمزنگاری: <strong>' +
      (secure ? 'AES-GCM ۲۵۶ + فشرده‌سازی gzip (کلید غیرقابل‌استخراج روی همین دستگاه)' : 'در دسترس نیست (اتصال ناامن)') +
      '</strong> · حالت: <strong>' + (db ? 'IndexedDB رمزنگاری‌شده' : 'حافظهٔ جایگزین مرورگر') + '</strong>' +
      (loadError ? ' · <span data-tone="danger">' + esc(loadError) + '</span>' : '');
  }

    // ── فهرست‌های مرجع ───────────────────────────────────────────────────────────
  // چند منو که به یک ماهیت اشاره دارند (مکان، وضعیت) به یک فهرست مشترک ارجاع داده
  // می‌شوند؛ هر تغییری در همان فهرست، بی‌درنگ در همهٔ فیلدهای وابسته دیده می‌شود.
  // فقط مکان‌ها و محل‌ها یک فهرست مشترک دارند («یکی کردن لیست مکان‌ها»).
  // هر فهرست وضعیت مستقل و کوتاه است تا هر منو فقط وضعیت‌های همان بخش را نشان دهد.
  const REFERENCE_ALIASES = {
    workplaces: 'places',
    deploymentLocations: 'places',
    gasSensorLocations: 'places',
    maneuverLocations: 'places',
    operationalPoints: 'places',
    operationalRanges: 'places'
  };

  const STATUS_LIST_KEYS = [
    'employeeStatuses', 'missionStatuses', 'leaveStatuses', 'healthStatuses',
    'noteStatuses', 'reportStatuses', 'programStatuses', 'vehicleStatuses',
    'gasStatuses', 'faultStatuses', 'maintenanceStatuses', 'stationStatuses'
  ];

  function referenceBaseKey(key) {
    const raw = String(key == null ? '' : key);
    return REFERENCE_ALIASES[raw] || raw;
  }

  // دسته‌بندی فهرست‌ها؛ هر دسته یک تب جدا در «مدیریت منوها» می‌شود.
  const REFERENCE_GROUPS = [
    {
      id: 'places',
      title: 'مکان‌ها و محل‌ها',
      hint: 'شهر، محل خدمت، محل استقرار، مبدأ و مقصد، محدودهٔ عملیاتی و نقاط عملیاتی همه یک مرجع دارند؛ هر موردی که اینجا اضافه شود در تمام این فیلدها قابل انتخاب است.',
      keys: ['places']
    },
    {
      id: 'units',
      title: 'واحدهای شغلی',
      hint: '«واحد» یعنی واحد شغلی و سازمانی (مثل واحد برق، واحد مکانیک، واحد ابزار دقیق)، نه شهر و مکان. هر گزینه‌ای که اینجا اضافه شود در فیلد «واحد» کارمند و دفترچه تلفن قابل انتخاب است.',
      keys: ['jobUnits']
    },
    {
      id: 'statuses',
      title: 'وضعیت‌ها',
      hint: 'هر بخش وضعیت اختصاصی خودش را دارد و هیچ وضعیتی بین بخش‌ها مشترک نیست؛ فهرست هر بخش همین‌جاست و کوتاه می‌ماند.',
      keys: STATUS_LIST_KEYS
    },
    {
      id: 'types',
      title: 'انواع و دسته‌بندی‌ها',
      hint: 'انواع، دسته‌ها، اولویت‌ها، مدل‌ها، اندازه‌ها و فرآورده‌ها؛ هر کدام فهرست مستقل خود را دارد چون ماهیت متفاوتی دارند.',
      keys: ['placeTypes', 'faultCategories', 'faultPriorities', 'missionTypes',
        'leaveTypes', 'maintenanceTypes', 'programCategories', 'programTypes', 'vehicleTypes',
        'vehicleServiceTypes', 'employmentTypes', 'workTypes', 'gasSensorTypes', 'actionTypes',
        'gasLogTypes', 'pipelineLines', 'pipelineSizes', 'products', 'shiftPatterns']
    },
    {
      id: 'titles',
      title: 'عنوان‌ها و نام‌ها',
      hint: 'عنوان‌های شغلی، عنوان مأموریت، نام خودروها و مدل گازسنج‌ها.',
      keys: ['jobTitles', 'missionTitles', 'vehicleNames', 'gasModels']
    }
  ];

  function referenceGroupOf(key) {
    const base = referenceBaseKey(key);
    for (let i = 0; i < REFERENCE_GROUPS.length; i += 1) {
      if (REFERENCE_GROUPS[i].keys.indexOf(base) >= 0) return REFERENCE_GROUPS[i];
    }
    return null;
  }

  // گزینه‌های پیش‌فرض همهٔ فیلدهایی که به یک فهرست مشترک ارجاع می‌دهند، یکی می‌شوند.
  function referenceDefaultsFor(key) {
    const base = referenceBaseKey(key);
    const out = [];
    const push = function (list) {
      (list || []).forEach(function (option) {
        const text = String(option == null ? '' : option).trim();
        if (text && out.indexOf(text) < 0) out.push(text);
      });
    };
    MODULES.forEach(function (moduleKey) {
      ((specs[moduleKey] || {}).fields || []).forEach(function (field) {
        if (field.listKey && referenceBaseKey(field.listKey) === base) push(field.options);
        (field.columns || []).forEach(function (column) {
          if (column.listKey && referenceBaseKey(column.listKey) === base) push(column.options);
        });
      });
    });
    return out;
  }

  // فیلدهایی که یک فهرست را مصرف می‌کنند؛ برای نمایش «مشترک بین …» و برای هم‌زمان
  // به‌روزرسانی سوابق هنگام تغییر نام یک گزینه.
  function referenceConsumers(key) {
    const base = referenceBaseKey(key);
    const found = [];
    MODULES.forEach(function (moduleKey) {
      ((specs[moduleKey] || {}).fields || []).forEach(function (field) {
        if (!field.listKey || referenceBaseKey(field.listKey) !== base) return;
        found.push({ module: moduleKey, field: field.key, label: (specs[moduleKey].title || moduleKey) + ' · ' + field.label });
      });
    });
    return found;
  }

  function migrateReferenceAliases(state) {
    const refs = state && state.references;
    if (!refs || typeof refs !== 'object') return;
    Object.keys(REFERENCE_ALIASES).forEach(function (alias) {
      const base = REFERENCE_ALIASES[alias];
      const values = Array.isArray(refs[alias]) ? refs[alias] : [];
      if (!Array.isArray(refs[base])) refs[base] = [];
      values.forEach(function (value) {
        if (value && refs[base].indexOf(value) < 0) refs[base].push(value);
      });
      delete refs[alias];
    });
  }

  function referenceListTitle(key){
    const titles={places:'مکان‌ها و محل‌ها',jobUnits:'واحدهای شغلی',statuses:'وضعیت‌ها',workplaces:'شهرها و محل‌ها',leaveTypes:'انواع مرخصی',missionTypes:'انواع مأموریت',pipelineSizes:'قطر خطوط',products:'نوع فرآورده',vehicleTypes:'انواع خودرو',vehicleStatuses:'وضعیت خودرو',gasStatuses:'وضعیت گازسنج',actionTypes:'انواع یادداشت و اقدام',programTypes:'انواع برنامه',workTypes:'نوع کار',jobTitles:'عنوان‌های شغلی',employmentTypes:'نوع استخدام',shiftPatterns:'الگوی شیفت',employeeStatuses:'وضعیت کارکنان',missionStatuses:'وضعیت مأموریت',leaveStatuses:'وضعیت مرخصی',healthStatuses:'وضعیت سلامت',noteStatuses:'وضعیت یادداشت و پیگیری',reportStatuses:'وضعیت گزارش اولیه',programStatuses:'وضعیت پرونده',operationalPoints:'نقاط عملیاتی',gasSensorTypes:'نوع سنسور گازسنج',gasSensorLocations:'محل‌های استقرار',operationalRanges:'محدوده‌های عملیاتی',vehicleServiceTypes:'انواع سرویس خودرو',missionTitles:'عنوان‌های مأموریت',vehicleNames:'نام خودروها',gasModels:'مدل گازسنج‌ها',deploymentLocations:'محل‌های استقرار',maneuverLocations:'محل‌های اجرای مانور',faultCategories:'دسته‌های اشکال',faultPriorities:'اولویت اشکال',faultStatuses:'وضعیت رفع اشکال',maintenanceTypes:'نوع سرویس و تعمیر',maintenanceStatuses:'وضعیت سرویس',gasLogTypes:'نوع سابقهٔ گازسنج',programCategories:'دسته‌های برنامه',stationTypes:'نوع ایستگاه',pipelineLines:'خطوط و شاخه‌ها',stationStatuses:'وضعیت ایستگاه'};
    return titles[key]||key;
  }

  // هر فهرستی که در فرم‌ها استفاده شود، حتی اگر هنوز ساخته نشده باشد، در تنظیمات دیده می‌شود.
  // مخازن ساختاری (نقشهٔ مکان‌ها، رنگ خطوط) فهرست کشویی نیستند و در تنظیمات نمی‌آیند.
  const REFERENCE_NON_LISTS = ['placesByType', 'lineColors'];

  function referenceKeys(target){
    const refs=(target||appData).references||{};
    const raw=Object.keys(refs).filter(function(key){
      return REFERENCE_NON_LISTS.indexOf(key)<0 && (Array.isArray(refs[key]) || refs[key]==null);
    });
    MODULES.forEach(function(moduleKey){
      (specs[moduleKey].fields||[]).forEach(function(field){
        if(field.listKey)raw.push(field.listKey);
        (field.columns||[]).forEach(function(column){
          if(column.listKey)raw.push(column.listKey);
        });
      });
    });
    const keys=[];
    raw.forEach(function(key){
      const base=referenceBaseKey(key);
      if(keys.indexOf(base)<0)keys.push(base);
    });
    return keys.sort(function(a,b){return referenceListTitle(a).localeCompare(referenceListTitle(b),'fa');});
  }

  // فهرست وضعیت‌های مشترک قبلی («statuses») به فهرست اختصاصی هر بخش تبدیل می‌شود؛
  // گزینه‌های پیش‌فرض همان فیلد و مقادیری که در سوابق استفاده شده‌اند حفظ می‌شوند.
  function seedStatusLists(state) {
    const refs = state && state.references;
    if (!refs || typeof refs !== 'object') return;
    STATUS_LIST_KEYS.forEach(function (key) {
      if (Array.isArray(refs[key]) && refs[key].length) return;
      const seed = [];
      const push = function (value) {
        const text = String(value == null ? '' : value).trim();
        if (text && seed.indexOf(text) < 0) seed.push(text);
      };
      MODULES.forEach(function (moduleKey) {
        (specs[moduleKey].fields || []).forEach(function (field) {
          if (field.listKey !== key) return;
          (field.options || []).forEach(push);
          (state[moduleKey] || []).forEach(function (record) { push(record && record[field.key]); });
        });
      });
      refs[key] = seed;
    });
    delete refs.statuses;
  }

  function ensureReferenceLists(target){
    const state=target||appData;
    if(!state.references||typeof state.references!=='object')state.references={};
    migrateReferenceAliases(state);
    seedStatusLists(state);
    referenceKeys(state).forEach(function(key){
      if(!Array.isArray(state.references[key])){
        state.references[key]=referenceDefaultsFor(key);
      }else{
        // گزینه‌های تازهٔ همان فهرست (اگر نسخهٔ جدیدی از برنامه آمده باشد) به انتها اضافه می‌شوند.
        referenceDefaultsFor(key).forEach(function(option){
          if(state.references[key].indexOf(option)<0)state.references[key].push(option);
        });
      }
    });
    return state.references;
  }

  let referenceTab = 'places';

  function referenceGroupTabs() {
    const groups = REFERENCE_GROUPS.slice();
    const known = [];
    REFERENCE_GROUPS.forEach(function (group) { group.keys.forEach(function (key) { known.push(key); }); });
    const extra = referenceKeys().filter(function (key) { return known.indexOf(key) < 0; });
    if (extra.length) groups.push({ id: 'other', title: 'سایر فهرست‌ها', hint: 'فهرست‌هایی که در دسته‌های بالا جای نگرفته‌اند.', keys: extra });
    return groups;
  }

  function referenceCardMarkup(key) {
    const values = Array.isArray(appData.references[key]) ? appData.references[key] : [];
    const consumers = referenceConsumers(key);
    const sharedLabel = consumers.length > 1
      ? 'مشترک بین ' + faDigits(consumers.length) + ' فیلد — ' + consumers.slice(0, 3).map(function (item) { return item.label; }).join('، ') + (consumers.length > 3 ? ' و …' : '')
      : (consumers.length === 1 ? 'استفاده در ' + consumers[0].label : 'در هیچ فیلدی استفاده نمی‌شود.');
    const rows = values.map(function (value, index) {
      return '<div class="reference-row">' +
        '<span class="reference-value">' + esc(value) + '</span>' +
        '<span class="reference-actions">' +
          '<button type="button" class="secondary-btn" data-module-action="reference-up" data-list-key="' + esc(key) + '" data-index="' + index + '" aria-label="انتقال به بالا"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button type="button" class="secondary-btn" data-module-action="reference-down" data-list-key="' + esc(key) + '" data-index="' + index + '" aria-label="انتقال به پایین"' + (index === values.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button type="button" class="secondary-btn" data-module-action="reference-edit" data-list-key="' + esc(key) + '" data-index="' + index + '">ویرایش</button>' +
          '<button type="button" class="secondary-btn" data-module-action="reference-delete" data-list-key="' + esc(key) + '" data-index="' + index + '">حذف</button>' +
        '</span></div>';
    }).join('');
    return '<article class="reference-card" data-reference-card="' + esc(key) + '">' +
      '<header class="reference-card-head"><div><h4>' + esc(referenceListTitle(key)) + '</h4>' +
      '<p>' + esc(sharedLabel) + '</p></div>' +
      '<span class="reference-count">' + faDigits(values.length) + ' گزینه</span></header>' +
      '<div class="reference-items">' + (rows || '<span class="reference-empty">هنوز گزینه‌ای ندارد.</span>') + '</div>' +
      '<div class="reference-add"><input type="text" autocomplete="off" data-reference-input="' + esc(key) + '" placeholder="گزینهٔ جدید برای «' + esc(referenceListTitle(key)) + '»" aria-label="گزینهٔ جدید"><button type="button" class="primary-btn" data-module-action="reference-add" data-list-key="' + esc(key) + '">+ افزودن</button></div>' +
      '</article>';
  }

  function referenceManagerMarkup() {
    const groups = referenceGroupTabs();
    if (!groups.some(function (group) { return group.id === referenceTab; })) referenceTab = groups.length ? groups[0].id : 'places';
    const active = groups.filter(function (group) { return group.id === referenceTab; })[0] || { keys: [] };
    return '<section class="module-list-panel">' +
      '<div class="module-list-head"><div><h3>مدیریت منوها و فهرست‌ها</h3>' +
      '<p>هر دسته یک تب جدا دارد. فهرست‌های هم‌ماهیت به یک مرجع واحد ارجاع داده شده‌اند؛ هر گزینه‌ای که اینجا اضافه یا ویرایش شود در همهٔ فیلدهای مرتبط هم دیده می‌شود.</p></div></div>' +
      '<div class="reference-group-tabs" role="tablist">' + groups.map(function (group) {
        const total = group.keys.reduce(function (sum, key) { return sum + (Array.isArray(appData.references[key]) ? appData.references[key].length : 0); }, 0);
        return '<button type="button" role="tab" class="reference-group-tab' + (group.id === referenceTab ? ' is-active' : '') + '" data-reference-tab="' + esc(group.id) + '" aria-selected="' + (group.id === referenceTab) + '">' +
          '<b>' + esc(group.title) + '</b><span>' + faDigits(group.keys.length) + ' فهرست · ' + faDigits(total) + ' گزینه</span></button>';
      }).join('') + '</div>' +
      (active.hint ? '<p class="reference-hint">' + esc(active.hint) + '</p>' : '') +
      '<div class="reference-group-body" id="referenceManager">' +
      (active.keys.length ? active.keys.map(referenceCardMarkup).join('') : '<div class="module-empty">فهرستی برای نمایش نیست.</div>') +
      '</div></section>';
  }

  function refreshReferenceCard(key) {
    const node = document.querySelector('[data-reference-card="' + key + '"]');
    if (!node) return;
    node.outerHTML = referenceCardMarkup(key);
  }

  function refreshCurrentView() {
    const section=document.getElementById('sectionView');
    const view=new URLSearchParams(window.location.search).get('view')||'dashboard';
    if (!section) return;
    if (!specs[view] && view !== 'reports' && view !== 'settings') {
      if (typeof window.ATLAS_ROUTE === 'function') window.ATLAS_ROUTE(view);
      return;
    }
    render(view,section);
  }

  const PROGRAM_CATEGORIES = ['هدف', 'برنامه فعالیت', 'مانور', 'روتین', 'دوره آموزشی', 'سایر'];
  let programFilter = 'all';

  function programStages(record) {
    if (!Array.isArray(record.stages)) record.stages = [];
    return record.stages;
  }

  function programCategoryOf(record) {
    return record.programCategory || (record.programType === 'مانور' ? 'مانور' : 'برنامه فعالیت');
  }

  function programProgress(record) {
    const stages = programStages(record);
    if (stages.length) {
      const done = stages.filter(function (stage) { return stage.done; }).length;
      return Math.round((done / stages.length) * 100);
    }
    if (record.status === 'تکمیل‌شده') return 100;
    if (record.status === 'در حال اقدام') return 50;
    if (record.status === 'در انتظار پاسخ') return 35;
    if (record.status === 'متوقف') return 20;
    return 0;
  }

  // رنگ هر دسته از ترتیب زیر می‌آید؛ مقدار رنگ در design/tones.css است.
  const PROGRAM_TONES = ['info', 'special', 'highlight', 'accent', 'ok', 'warn', 'attention', 'danger'];
  function programTone(name) {
    const text = String(name == null ? '' : name);
    if (!text || text === 'all') return 'accent';
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) % 997;
    return PROGRAM_TONES[hash % PROGRAM_TONES.length];
  }
  function programProgressTone(pct) {
    if (pct >= 100) return 'ok';
    if (pct >= 60) return 'accent';
    if (pct >= 25) return 'warn';
    return 'attention';
  }

  function programOwnerName(record) {
    if (!record.responsibleId) return '';
    const person = (appData.employees || []).find(function (item) { return String(item.id) === String(record.responsibleId); });
    return person ? employeeName(person) : '';
  }

  function renderProgramCard(record) {
    const stages = programStages(record);
    const pct = programProgress(record);
    const doneStages = stages.filter(function (stage) { return stage.done; }).length;
    const meta = [];
    const owner = programOwnerName(record);
    if (owner) meta.push('مسئول: ' + owner);
    if (record.plannedDate) meta.push('شروع: ' + record.plannedDate);
    if (record.dueDate) meta.push('مهلت: ' + record.dueDate);
    if (record.location) meta.push(record.location);
    const stageRows = stages.map(function (stage) {
      return '<div class="program-stage' + (stage.done ? ' done' : '') + '">' +
        '<input type="checkbox" data-program-stage data-program="' + esc(record.id) + '" data-stage="' + esc(stage.id) + '"' + (stage.done ? ' checked' : '') + ' aria-label="' + esc(stage.title) + '">' +
        '<span>' + esc(stage.title) + '</span>' +
        '<button type="button" data-program-action="stage-delete" data-program="' + esc(record.id) + '" data-stage="' + esc(stage.id) + '" aria-label="حذف مرحله">×</button></div>';
    }).join('');
    return '<article class="program-card">' +
      '<div class="program-head"><div class="program-title-wrap"><div class="program-title">' + esc(record.title || 'بدون عنوان') + '</div>' +
      '<div class="program-chips"><span class="program-chip" data-tone="' + programTone(programCategoryOf(record)) + '">' + esc(programCategoryOf(record)) + '</span>' +
      (record.programType ? '<span class="program-chip">' + esc(record.programType) + '</span>' : '') + '</div></div>' +
      '<div class="program-score"><div class="program-pct">' + faDigits(pct) + '٪</div>' +
      '<div class="program-meta">' + (stages.length ? faDigits(doneStages) + ' از ' + faDigits(stages.length) + ' مرحله' : 'بدون مرحله') + '</div></div></div>' +
      '<div class="progress-track"><div class="progress-bar" data-tone="' + programProgressTone(pct) + '" style="width:' + pct + '%"></div></div>' +
      (meta.length ? '<div class="program-meta">' + esc(meta.join(' · ')) + '</div>' : '') +
      (record.status ? '<div class="program-meta">وضعیت: ' + esc(record.status) + '</div>' : '') +
      (stageRows ? '<div class="program-stages">' + stageRows + '</div>' : '') +
      '<div class="program-stage-add"><input type="text" data-program-stage-input="' + esc(record.id) + '" placeholder="نام مرحلهٔ جدید"><button class="secondary-btn" type="button" data-program-action="stage-add" data-program="' + esc(record.id) + '">افزودن مرحله</button></div>' +
      '<div class="program-chips">' + renderCommentButton('programs', record) + '<button type="button" data-program-action="edit" data-program="' + esc(record.id) + '">ویرایش</button><button type="button" data-program-action="delete" data-program="' + esc(record.id) + '">حذف</button></div>' +
    '</article>';
  }

  function renderPrograms(section) {
    const records = (appData.programs || []).slice();
    const total = records.length;
    const complete = records.filter(function (record) { return programProgress(record) === 100; }).length;
    const running = records.filter(function (record) { const pct = programProgress(record); return pct > 0 && pct < 100; }).length;
    const average = total ? Math.round(records.reduce(function (sum, record) { return sum + programProgress(record); }, 0) / total) : 0;
    const categories = PROGRAM_CATEGORIES;
    const visible = programFilter === 'all' ? records : records.filter(function (record) { return programCategoryOf(record) === programFilter; });
    const actions = exportMenu('programs') +
      '<button class="primary-btn" type="button" data-module-action="new" data-view="programs">+ برنامهٔ جدید</button>';
    const kpis = [['کل برنامه‌ها', faDigits(total), 'info'], ['در جریان', faDigits(running), 'warn'], ['تکمیل‌شده', faDigits(complete), 'ok'], ['میانگین پیشرفت', faDigits(average) + '٪', 'special']]
      .map(function (pair) { return '<div class="program-kpi mini-stat" data-tone="' + pair[2] + '"><div class="program-meta">' + pair[0] + '</div><strong class="program-pct">' + pair[1] + '</strong></div>'; })
      .join('');
    const chips = ['all'].concat(categories).map(function (category) {
      return '<button type="button" data-program-action="filter" data-category="' + esc(category) + '" data-tone="' + programTone(category) + '" class="program-chip ' + (programFilter === category ? 'active' : '') + '">' + esc(category === 'all' ? 'همه' : category) + '</button>';
    }).join('');
    const body = visible.length
      ? '<div class="program-grid">' + visible.map(renderProgramCard).join('') + '</div>'
      : '<div class="module-empty">هنوز برنامه‌ای ثبت نشده. با «برنامهٔ جدید» اولین هدف یا برنامه را بساز، بعد مراحلش را اضافه کن تا درصد پیشرفت خودکار محاسبه شود.</div>';
    section.innerHTML = rootWrap(
      pageHead('برنامه‌ها و اهداف', 'اهداف، برنامه‌های فعالیت، مانور، روتین و دوره‌های آموزشی؛ هر برنامه با مراحل و درصد پیشرفت', actions) +
      '<div class="program-kpis">' + kpis + '</div>' +
      renderForm('programs', appData) +
      '<div class="program-chips">' + chips + '</div>' +
      body +
      '<div class="module-local-note"><strong>درصد پیشرفت:</strong> نسبت مراحل انجام‌شده به کل مراحل هر برنامه. برنامهٔ بدون مرحله از روی وضعیتش تخمین زده می‌شود.</div>'
    );
  }

  // ── زیرتب‌های خودرو: دفتر خودرو، سوابق اشکالات هر خودرو و دفتر اشکالات ──
  let vehicleTab = 'registry';
  let faultVehicleId = '';
  let faultVehicleSort = 'open';
  let serviceVehicleId = '';
  let serviceVehicleSort = 'last';
  let serviceLogSort = 'date-desc';
  // در مسیر خودرو، «نوع دارایی» و «گازسنج» پرسیده نمی‌شود؛ دفتر کلی همان فرم کامل را دارد.
  let faultFormScope = 'general';

  function setVehicleTab(tab) {
    vehicleTab = ['service', 'history', 'board'].indexOf(tab) >= 0 ? tab : 'registry';
    if (vehicleTab !== 'history') faultVehicleId = '';
    if (vehicleTab !== 'service') serviceVehicleId = '';
  }

  function vehicleTabBar() {
    const tabs = [['registry', 'خودروها'], ['service', 'دفتر سرویس'], ['history', 'سوابق اشکالات'], ['board', 'دفتر اشکالات']];
    return '<div class="module-subtabs" role="tablist" aria-label="بخش‌های خودرو">' + tabs.map(function (pair) {
      return '<button type="button" role="tab" aria-selected="' + (vehicleTab === pair[0]) + '" class="module-subtab' + (vehicleTab === pair[0] ? ' active' : '') + '" data-vehicle-tab="' + pair[0] + '">' + pair[1] + '</button>';
    }).join('') + '</div>';
  }

  function renderVehicles(section) {
    if (vehicleTab === 'service') { renderServiceBook(section); return; }
    if (vehicleTab === 'history') { renderFaultHistory(section); return; }
    if (vehicleTab === 'board') { renderFaults(section); return; }
    renderCrud('vehicles', section);
  }

  // ── دفتر اشکالات: کارت‌های اشکال با روند رفع، درصد پیشرفت و سابقهٔ اقدام ──
  let faultFilter = 'all';

  function faultProgress(record) {
    const raw = Number(record.progress);
    if (!Number.isNaN(raw) && record.progress !== '' && record.progress != null) return Math.max(0, Math.min(100, Math.round(raw)));
    if (record.status === 'رفع شد' || record.status === 'بسته‌شده') return 100;
    if (record.status === 'در حال تعمیر') return 60;
    if (record.status === 'در حال بررسی') return 25;
    return 5;
  }

  function faultSteps(record) {
    return String(record.steps || '').split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
  }

  function faultAssetLabel(record) {
    if (record.vehicleId) {
      const vehicle = (appData.vehicles || []).find(function (item) { return String(item.id) === String(record.vehicleId); });
      if (vehicle) return (vehicle.name || 'خودرو') + (vehicle.companyPlate ? ' · ' + vehicle.companyPlate : '');
    }
    if (record.gasmeterId) {
      const meter = (appData.gasmeters || []).find(function (item) { return String(item.id) === String(record.gasmeterId); });
      if (meter) return (meter.code || 'گازسنج') + (meter.serial ? ' · ' + meter.serial : '');
    }
    return record.assetType || 'بدون دارایی';
  }

  function renderFaultCard(record) {
    const pct = faultProgress(record);
    const steps = faultSteps(record);
    const open = record.status !== 'رفع شد' && record.status !== 'بسته‌شده';
    const stepsHtml = steps.length
      ? '<ol class="fault-steps">' + steps.map(function (line) { return '<li>' + esc(line) + '</li>'; }).join('') + '</ol>'
      : '<div class="fault-steps-empty">اقدامی ثبت نشده است.</div>';
    return '<article class="fault-card' + (open ? '' : ' is-resolved') + '" data-tone="' + (record.priority === 'بحرانی' ? 'danger' : record.priority === 'زیاد' ? 'attention' : open ? 'warn' : 'ok') + '">' +
      '<header class="fault-card-head"><div><h3>' + esc(record.title || 'اشکال') + '</h3>' +
      '<p>' + esc(faultAssetLabel(record)) + (record.category ? ' · ' + esc(record.category) : '') + (record.reportedAt ? ' · ' + formatJalali(record.reportedAt, false) : '') + '</p></div>' +
      statusTag(record.status || 'ثبت‌شده') + '</header>' +
      '<div class="fault-progress"><div class="progress-track"><div class="progress-bar" style="width:' + pct + '%"></div></div><strong>' + faDigits(pct) + '٪</strong></div>' +
      (record.description ? '<p class="fault-desc">' + esc(record.description) + '</p>' : '') +
      stepsHtml +
      '<div class="fault-card-foot"><span class="fault-priority" data-tone="' + (record.priority === 'بحرانی' ? 'danger' : record.priority === 'زیاد' ? 'attention' : 'info') + '">اولویت: ' + esc(record.priority || '—') + '</span>' +
      (open ? '<div class="fault-step-add"><input type="text" data-fault-step-input="' + esc(record.id) + '" placeholder="اقدام انجام‌شده را بنویس و Enter بزن"><button type="button" class="secondary-btn" data-fault-action="add-step" data-fault="' + esc(record.id) + '">+ اقدام</button></div>' : '') +
      '<div class="fault-card-actions">' + renderCommentButton('faults', record) + '<button type="button" class="secondary-btn" data-module-action="edit" data-view="faults" data-id="' + esc(record.id) + '">ویرایش</button>' +
      (open ? '<button type="button" class="secondary-btn" data-fault-action="resolve" data-fault="' + esc(record.id) + '">علامت‌گذاری رفع شد</button>' : '') +
      '<button type="button" class="module-delete-btn" data-module-action="delete" data-view="faults" data-id="' + esc(record.id) + '">حذف</button></div></div></article>';
  }

  // ترتیب دفتر اشکالات: بازها اول، بعد اولویت، بعد تازه‌ترین گزارش.
  function faultBoardOrder(a, b) {
    const rank = { 'بحرانی': 0, 'زیاد': 1, 'متوسط': 2, 'کم': 3 };
    const openA = a.status === 'رفع شد' || a.status === 'بسته‌شده' ? 1 : 0;
    const openB = b.status === 'رفع شد' || b.status === 'بسته‌شده' ? 1 : 0;
    if (openA !== openB) return openA - openB;
    const pa = rank[a.priority] == null ? 9 : rank[a.priority];
    const pb = rank[b.priority] == null ? 9 : rank[b.priority];
    if (pa !== pb) return pa - pb;
    return String(b.reportedAt || '').localeCompare(String(a.reportedAt || ''));
  }

  function renderFaults(section) {
    const records = (appData.faults || []).slice().sort(faultBoardOrder);
    const open = records.filter(function (r) { return r.status !== 'رفع شد' && r.status !== 'بسته‌شده'; });
    const critical = open.filter(function (r) { return r.priority === 'بحرانی'; }).length;
    const repairing = records.filter(function (r) { return r.status === 'در حال تعمیر'; }).length;
    const resolved = records.filter(function (r) { return r.status === 'رفع شد' || r.status === 'بسته‌شده'; }).length;
    const statuses = ['all'].concat((appData.references.faultStatuses || []));
    const visible = faultFilter === 'all' ? records : records.filter(function (r) { return (r.status || 'ثبت‌شده') === faultFilter; });
    const kpis = [['اشکال باز', faDigits(open.length), 'warn'], ['بحرانی', faDigits(critical), 'danger'], ['در حال تعمیر', faDigits(repairing), 'info'], ['رفع‌شده', faDigits(resolved), 'ok']]
      .map(function (pair) { return '<div class="mini-stat" data-tone="' + pair[2] + '"><div class="value">' + pair[1] + '</div><div class="label"><i class="tiny-dot"></i>' + pair[0] + '</div></div>'; }).join('');
    const chips = statuses.map(function (status) {
      return '<button type="button" class="program-chip ' + (faultFilter === status ? 'active' : '') + '" data-tone="' + (status === 'all' ? 'accent' : programTone(status)) + '" data-fault-action="filter" data-status="' + esc(status) + '">' + esc(status === 'all' ? 'همه' : status) + '</button>';
    }).join('');
    const body = visible.length
      ? '<div class="fault-grid">' + visible.map(renderFaultCard).join('') + '</div>'
      : '<div class="module-empty">هنوز اشکالی ثبت نشده. با «ثبت اشکال» اولین مورد را ثبت کن تا روند رفع و اعلان‌ها فعال شود.</div>';
    const actions = exportMenu('faults') + '<button class="primary-btn" type="button" data-module-action="new" data-view="faults">+ ثبت اشکال</button>';
    faultFormScope = 'general';
    section.innerHTML = rootWrap(
      pageHead('اشکالات و رفع اشکال', 'هر اشکال با تاریخ، وضعیت، درصد پیشرفت و روند رفع؛ تا بسته‌شدن در اعلان‌ها می‌ماند', actions) +
      vehicleTabBar() +
      '<div class="stat-row fault-kpis">' + kpis + '</div>' +
      renderForm('faults', appData) +
      '<div class="program-chips">' + chips + '</div>' +
      body +
      '<div class="module-local-note"><strong>اعلان:</strong> اشکال‌های باز با اولویت زیاد و بحرانی در زنگ اعلان داشبورد و در «اشکالات باز» می‌آیند و تا رفع کامل حذف نمی‌شوند.</div>'
    );
  }

  // ── سوابق اشکالات: فهرست همهٔ خودروها، مرتب‌سازی و سابقهٔ اشکال هر خودرو ──
  function isFaultOpen(fault) {
    return fault.status !== 'رفع شد' && fault.status !== 'بسته‌شده';
  }

  function faultsOfVehicle(vehicleId) {
    return (appData.faults || []).filter(function (fault) { return String(fault.vehicleId || '') === String(vehicleId); })
      .sort(function (a, b) { return String(b.reportedAt || '').localeCompare(String(a.reportedAt || '')); });
  }

  function orphanFaults() {
    return (appData.faults || []).filter(function (fault) { return !fault.vehicleId; })
      .sort(function (a, b) { return String(b.reportedAt || '').localeCompare(String(a.reportedAt || '')); });
  }

  function faultCountsByVehicle() {
    const map = {};
    (appData.faults || []).forEach(function (fault) {
      const key = String(fault.vehicleId || '');
      if (!key) return;
      if (!map[key]) map[key] = { total: 0, open: 0, critical: 0, last: '' };
      map[key].total += 1;
      if (isFaultOpen(fault)) {
        map[key].open += 1;
        if (fault.priority === 'بحرانی') map[key].critical += 1;
      }
      const at = String(fault.reportedAt || '');
      if (at > map[key].last) map[key].last = at;
    });
    return map;
  }

  const FAULT_VEHICLE_SORTS = {
    open: { label: 'بیشترین اشکال باز', numeric: true, desc: true, value: function (v, c) { return (c[v.id] || {}).open || 0; } },
    total: { label: 'بیشترین کل اشکال', numeric: true, desc: true, value: function (v, c) { return (c[v.id] || {}).total || 0; } },
    last: { label: 'آخرین اشکال ثبت‌شده', numeric: false, desc: true, value: function (v, c) { return String((c[v.id] || {}).last || ''); } },
    name: { label: 'نام خودرو', numeric: false, value: function (v) { return String(v.name || ''); } },
    plate: { label: 'پلاک سازمانی', numeric: false, value: function (v) { return String(v.companyPlate || v.policePlate || ''); } },
    status: { label: 'وضعیت عملیاتی', numeric: false, value: function (v) { return String(v.status || ''); } },
    health: { label: 'وضعیت سلامت', numeric: false, value: function (v) { return String(v.healthStatus || ''); } },
    km: { label: 'کیلومتر فعلی', numeric: true, desc: true, value: function (v) { const n = Number(v.currentKm); return Number.isFinite(n) ? n : -1; } }
  };

  function sortedFaultVehicles(counts) {
    const spec = FAULT_VEHICLE_SORTS[faultVehicleSort] || FAULT_VEHICLE_SORTS.open;
    return (appData.vehicles || []).slice().sort(function (a, b) {
      const va = spec.value(a, counts), vb = spec.value(b, counts);
      if (spec.numeric) return spec.desc ? vb - va : va - vb;
      const cmp = String(va).localeCompare(String(vb), 'fa', { numeric: true });
      return spec.desc ? -cmp : cmp;
    });
  }

  function vtabFact(label, value) {
    return '<div class="vtab-fact"><dt>' + esc(label) + '</dt><dd>' + esc(value || '—') + '</dd></div>';
  }

  function faultVehicleExportRows(counts) {
    const rows = [['نام خودرو', 'نوع خودرو', 'پلاک سازمانی', 'پلاک انتظامی', 'وضعیت عملیاتی', 'وضعیت سلامت', 'شهر و محل استقرار', 'کیلومتر فعلی', 'کل اشکال', 'اشکال باز', 'اشکال بحرانی باز', 'آخرین اشکال', 'تاریخ آخرین اشکال']];
    sortedFaultVehicles(counts).forEach(function (vehicle) {
      const count = counts[vehicle.id] || { total: 0, open: 0, critical: 0, last: '' };
      const lastFault = faultsOfVehicle(vehicle.id)[0];
      rows.push([
        vehicle.name || '', vehicle.vehicleType || '', vehicle.companyPlate || '', vehicle.policePlate || '',
        vehicle.status || '', vehicle.healthStatus || '',
        [vehicle.currentCity, vehicle.currentPlace].filter(Boolean).join(' · '),
        vehicle.currentKm ? faDigits(vehicle.currentKm) : '',
        faDigits(count.total), faDigits(count.open), faDigits(count.critical),
        lastFault ? (lastFault.title || '') : '',
        count.last ? formatJalali(count.last, false) : ''
      ]);
    });
    return rows;
  }

  function faultDetailExportRows(list) {
    const rows = [['عنوان اشکال', 'دستهٔ اشکال', 'اولویت', 'تاریخ ثبت', 'وضعیت رفع', 'درصد پیشرفت', 'مسئول رفع', 'تاریخ رفع', 'روند رفع', 'شرح اشکال']];
    list.forEach(function (fault) {
      const person = (appData.employees || []).find(function (item) { return String(item.id) === String(fault.responsibleId); });
      rows.push([
        fault.title || '', fault.category || '', fault.priority || '',
        fault.reportedAt ? formatJalali(fault.reportedAt, false) : '',
        fault.status || 'ثبت‌شده', faDigits(faultProgress(fault)) + '٪',
        person ? employeeName(person) : '',
        fault.resolvedAt ? formatJalali(fault.resolvedAt, false) : '',
        faultSteps(fault).join(' | '),
        fault.description || ''
      ]);
    });
    return rows;
  }

  function renderFaultHistory(section) {
    const counts = faultCountsByVehicle();
    if (faultVehicleId === '__none__') { renderFaultVehicle(section, null, orphanFaults()); return; }
    if (faultVehicleId) {
      const vehicle = (appData.vehicles || []).find(function (item) { return String(item.id) === String(faultVehicleId); });
      if (vehicle) { renderFaultVehicle(section, vehicle, faultsOfVehicle(vehicle.id)); return; }
      faultVehicleId = '';
    }
    const vehicles = sortedFaultVehicles(counts);
    const faults = appData.faults || [];
    const openFaults = faults.filter(isFaultOpen).length;
    const critical = faults.filter(function (fault) { return isFaultOpen(fault) && fault.priority === 'بحرانی'; }).length;
    const withFaults = vehicles.filter(function (vehicle) { return (counts[vehicle.id] || {}).total; }).length;
    const kpis = [['کل خودروها', faDigits(vehicles.length), 'info'], ['دارای سابقهٔ اشکال', faDigits(withFaults), 'ok'], ['اشکال باز', faDigits(openFaults), 'warn'], ['بحرانی باز', faDigits(critical), 'danger']]
      .map(function (pair) { return '<div class="mini-stat" data-tone="' + pair[2] + '"><div class="value">' + pair[1] + '</div><div class="label"><i class="tiny-dot"></i>' + pair[0] + '</div></div>'; }).join('');
    const sortOptions = Object.keys(FAULT_VEHICLE_SORTS).map(function (key) {
      return '<option value="' + key + '"' + (faultVehicleSort === key ? ' selected' : '') + '>مرتب‌سازی: ' + FAULT_VEHICLE_SORTS[key].label + '</option>';
    }).join('');
    const cards = vehicles.length ? vehicles.map(function (vehicle) {
      const count = counts[vehicle.id] || { total: 0, open: 0, critical: 0, last: '' };
      const lastFault = faultsOfVehicle(vehicle.id)[0];
      return '<button type="button" class="vtab-card" data-vtab-open="' + esc(vehicle.id) + '">' +
        '<span class="vtab-top"><strong>' + esc(vehicle.name || 'خودرو بدون نام') + '</strong>' + statusTag(vehicle.status || '—') + '</span>' +
        '<span class="vtab-facts">' +
        '<span><b>پلاک سازمانی</b>' + esc(vehicle.companyPlate || vehicle.policePlate || '—') + '</span>' +
        '<span><b>وضعیت سلامت</b>' + esc(vehicle.healthStatus || '—') + '</span>' +
        '<span><b>کیلومتر فعلی</b>' + (vehicle.currentKm ? faDigits(vehicle.currentKm) : '—') + '</span>' +
        '<span><b>اشکال باز</b>' + faDigits(count.open) + (count.critical ? ' · ' + faDigits(count.critical) + ' بحرانی' : '') + '</span>' +
        '<span><b>کل اشکال</b>' + faDigits(count.total) + '</span>' +
        '<span><b>آخرین اشکال</b>' + (count.last ? formatJalali(count.last, false) : '—') + '</span>' +
        '</span>' +
        (lastFault ? '<span class="vtab-last">' + esc(lastFault.title || '') + '</span>' : '') +
        '<span class="vtab-foot"><span>' + faDigits(count.total) + ' اشکال ثبت‌شده</span><span class="vtab-open-hint">مشاهدهٔ سوابق ›</span></span>' +
        '</button>';
    }).join('') : '<div class="module-empty">اول خودروها را ثبت کن؛ بعد سوابق اشکالات هر خودرو اینجا باز می‌شود.</div>';
    const orphans = orphanFaults();
    const orphanCard = orphans.length
      ? '<button type="button" class="vtab-card" data-vtab-open="__none__">' +
        '<span class="vtab-top"><strong>اشکالات ثبت‌شده بدون خودرو</strong>' + statusTag('بدون خودرو') + '</span>' +
        '<span class="vtab-facts"><span><b>کل اشکال</b>' + faDigits(orphans.length) + '</span>' +
        '<span><b>اشکال باز</b>' + faDigits(orphans.filter(isFaultOpen).length) + '</span></span>' +
        '<span class="vtab-foot"><span>' + faDigits(orphans.length) + ' اشکال ثبت‌شده</span><span class="vtab-open-hint">مشاهدهٔ سوابق ›</span></span>' +
        '</button>'
      : '';
    faultFormScope = 'vehicle';
    section.innerHTML = rootWrap(
      pageHead('سوابق <span style="color:var(--tone-7)">اشکالات خودروها</span>', 'روی هر خودرو بزن تا سوابق اشکالات همان خودرو باز شود؛ فهرست و هر سابقه گزارش‌گیری جدا دارد', customExportMenu('faults-vehicles')) +
      vehicleTabBar() +
      '<div class="stat-row fault-kpis">' + kpis + '</div>' +
      renderForm('faults', appData) +
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>خودروهای ناوگان</h3><p>بر اساس تعداد اشکال، نام، پلاک یا وضعیت مرتب کن و روی هر خودرو بزن.</p></div>' +
      '<div class="module-list-tools"><select data-vtab-sort aria-label="مرتب‌سازی فهرست خودروها">' + sortOptions + '</select></div></div>' +
      '<div class="vtab-list">' + cards + orphanCard + '</div></section>'
    );
  }

  function renderFaultVehicle(section, vehicle, list) {
    const openList = list.filter(isFaultOpen);
    const critical = openList.filter(function (fault) { return fault.priority === 'بحرانی'; }).length;
    const title = vehicle ? [vehicle.name, vehicle.companyPlate].filter(Boolean).join(' · ') : 'اشکالات ثبت‌شده بدون خودرو';
    const kpis = [['کل اشکال', faDigits(list.length), 'info'], ['باز', faDigits(openList.length), 'warn'], ['بحرانی باز', faDigits(critical), 'danger'], ['رفع‌شده', faDigits(list.length - openList.length), 'ok']]
      .map(function (pair) { return '<div class="mini-stat" data-tone="' + pair[2] + '"><div class="value">' + pair[1] + '</div><div class="label"><i class="tiny-dot"></i>' + pair[0] + '</div></div>'; }).join('');
    const snapshot = vehicle
      ? '<section class="module-list-panel vtab-snapshot"><div class="module-list-head"><div><h3>وضعیت فعلی ' + esc(vehicle.name || 'خودرو') + '</h3>' +
        '<p>هر سابقهٔ پایین، وضعیت ثبت‌شده در تاریخ خودش را نگه می‌دارد.</p></div>' + statusTag(vehicle.status || '—') + '</div>' +
        '<dl class="vtab-facts vtab-facts-wide">' +
        vtabFact('پلاک سازمانی', vehicle.companyPlate || '') +
        vtabFact('پلاک انتظامی', vehicle.policePlate || '') +
        vtabFact('نوع خودرو', vehicle.vehicleType || '') +
        vtabFact('وضعیت سلامت', vehicle.healthStatus || '') +
        vtabFact('شهر و محل استقرار', [vehicle.currentCity, vehicle.currentPlace].filter(Boolean).join(' · ')) +
        vtabFact('کیلومتر فعلی', vehicle.currentKm ? faDigits(vehicle.currentKm) : '') +
        '</dl></section>'
      : '';
    const cards = list.length
      ? '<div class="fault-grid">' + list.map(renderFaultCard).join('') + '</div>'
      : '<div class="module-empty">برای این خودرو هنوز اشکالی ثبت نشده است.</div>';
    faultFormScope = 'vehicle';
    section.innerHTML = rootWrap(
      pageHead('سوابق اشکالات <span style="color:var(--tone-7)">' + esc(title) + '</span>', 'هر اشکال با تاریخ، اولویت، وضعیت، درصد پیشرفت و روند رفع خودش', customExportMenu('faults-vehicle', vehicle ? vehicle.id : '__none__', 'vehicle')) +
      vehicleTabBar() +
      '<div class="vtab-bar"><button type="button" class="secondary-btn" data-vtab-back>‹ بازگشت به فهرست خودروها</button>' +
      (vehicle ? '<button type="button" class="primary-btn" data-fault-new data-vehicle="' + esc(vehicle.id) + '">+ ثبت اشکال برای این خودرو</button>' : '') + '</div>' +
      renderForm('faults', appData) +
      '<div class="stat-row fault-kpis">' + kpis + '</div>' +
      snapshot +
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>سوابق ثبت‌شده</h3><p>هر ردیف یک اشکال با تاریخ و روند رفع خودش.</p></div><span class="module-tag">' + faDigits(list.length) + ' مورد</span></div>' +
      cards + '</section>'
    );
  }

  // ── دفتر گازسنج‌ها: وضعیت سلامت، محل، کالیبراسیون و مانده روز ──
  let gasFilter = { location: 'all', status: 'all', calibration: 'all', sort: 'calibration' };

  // «سوابق گازسنج» زیرتب همین بخش است، نه یک صفحهٔ جدا.
  let gasTab = 'registry';
  let gasLogMeterId = '';
  let gasLogSort = 'calibration';

  function setGasTab(tab) {
    gasTab = tab === 'logs' ? 'logs' : 'registry';
    if (gasTab === 'registry') gasLogMeterId = '';
  }

  function gasTabBar() {
    return '<div class="module-subtabs" role="tablist" aria-label="بخش‌های گازسنج">' +
      '<button type="button" role="tab" aria-selected="' + (gasTab === 'registry') + '" class="module-subtab' + (gasTab === 'registry' ? ' active' : '') + '" data-gas-tab="registry">گازسنج‌ها</button>' +
      '<button type="button" role="tab" aria-selected="' + (gasTab === 'logs') + '" class="module-subtab' + (gasTab === 'logs' ? ' active' : '') + '" data-gas-tab="logs">سوابق گازسنج‌ها</button>' +
      '</div>';
  }

  function gasCalibrationState(record) {
    const left = dueInDays(record.calibrationEnd);
    if (!isFinite(left)) return { key: 'unknown', label: 'بدون تاریخ', tone: 'muted', left: null };
    if (left < 0) return { key: 'expired', label: 'منقضی', tone: 'danger', left: left };
    if (left <= GAS_CALIBRATION_WARN_DAYS) return { key: 'soon', label: 'نزدیک انقضا', tone: 'attention', left: left };
    return { key: 'valid', label: 'معتبر', tone: 'ok', left: left };
  }

  // فهرست دیده‌شدهٔ گازسنج‌ها: همان فیلتر و ترتیبی که روی صفحه اعمال می‌شود.
  function visibleGasMeters() {
    const stateOf = function (record) { return gasCalibrationState(record); };
    return (appData.gasmeters || []).slice().filter(function (record) {
      if (gasFilter.location !== 'all' && String(record.location || '') !== gasFilter.location) return false;
      if (gasFilter.status !== 'all' && String(record.status || '') !== gasFilter.status) return false;
      if (gasFilter.calibration !== 'all' && stateOf(record).key !== gasFilter.calibration) return false;
      return true;
    }).sort(function (a, b) {
      if (gasFilter.sort === 'location') return String(a.location || '').localeCompare(String(b.location || ''), 'fa');
      if (gasFilter.sort === 'code') return String(a.code || '').localeCompare(String(b.code || ''), 'fa', { numeric: true });
      if (gasFilter.sort === 'health') return String(a.healthStatus || '').localeCompare(String(b.healthStatus || ''), 'fa');
      const leftA = stateOf(a).left == null ? 99999 : stateOf(a).left;
      const leftB = stateOf(b).left == null ? 99999 : stateOf(b).left;
      return leftA - leftB;
    });
  }

  function renderGasRegistry(section) {
    if (gasTab === 'logs') { renderGasLogs(section); return; }
    const records = (appData.gasmeters || []).slice();
    const stateOf = function (record) { return gasCalibrationState(record); };
    const locations = ['all'].concat(appData.references.deploymentLocations || []);
    const statuses = ['all'].concat(appData.references.gasStatuses || []);
    const visible = visibleGasMeters();
    const expired = records.filter(function (r) { return stateOf(r).key === 'expired'; }).length;
    const soon = records.filter(function (r) { return stateOf(r).key === 'soon'; }).length;
    const valid = records.filter(function (r) { return stateOf(r).key === 'valid'; }).length;
    const kpis = [['کل گازسنج‌ها', faDigits(records.length), 'info'], ['کالیبراسیون معتبر', faDigits(valid), 'ok'], ['نزدیک انقضا', faDigits(soon), 'warn'], ['منقضی‌شده', faDigits(expired), 'danger']]
      .map(function (pair) { return '<div class="mini-stat" data-tone="' + pair[2] + '"><div class="value">' + pair[1] + '</div><div class="label"><i class="tiny-dot"></i>' + pair[0] + '</div></div>'; }).join('');
    const rows = visible.map(function (record) {
      const state = stateOf(record);
      const responsible = (appData.employees || []).find(function (item) { return String(item.id) === String(record.responsibleId); });
      const logs = (appData.gaslogs || []).filter(function (log) { return String(log.gasmeterId) === String(record.id); }).length;
      return '<tr><td><strong>' + esc(record.code || '—') + '</strong>' + (record.serial ? '<div class="cell-sub">' + esc(record.serial) + '</div>' : '') + '</td>' +
        '<td>' + esc(record.model || '—') + '</td>' +
        '<td>' + statusTag(record.status || '—') + '</td>' +
        '<td>' + statusTag(record.healthStatus || '—') + '</td>' +
        '<td>' + gasPositionCell(record) + '</td>' +
        '<td>' + esc(responsible ? employeeName(responsible) : '—') + '</td>' +
        '<td>' + (record.calibrationEnd ? formatJalali(record.calibrationEnd, false) : '—') + '</td>' +
        '<td>' + statusTag(state.label) + '<div class="cell-sub">' + (state.left == null ? '—' : (state.left < 0 ? faDigits(Math.abs(state.left)) + ' روز گذشته' : faDigits(state.left) + ' روز مانده')) + '</div></td>' +
        '<td>' + faDigits(logs) + ' مورد</td>' +
        '<td class="module-row-actions"><button type="button" class="secondary-btn module-file-btn" data-module-action="file" data-view="gasmeters" data-id="' + esc(record.id) + '">مشاهدهٔ پرونده</button>' +
        '<button type="button" class="secondary-btn" data-gas-action="log" data-gas="' + esc(record.id) + '">+ سابقه</button>' +
        '<button type="button" class="secondary-btn" data-module-action="edit" data-view="gasmeters" data-id="' + esc(record.id) + '">ویرایش</button>' +
        '<button type="button" class="module-delete-btn" data-module-action="delete" data-view="gasmeters" data-id="' + esc(record.id) + '">حذف</button></td></tr>';
    }).join('');
    const table = visible.length
      ? '<div class="module-table-wrap"><table class="module-table"><thead><tr><th>کد / سریال</th><th>مدل</th><th>وضعیت</th><th>سلامت</th><th>محل استقرار</th><th>مسئول</th><th>پایان کالیبراسیون</th><th>مانده کالیبراسیون</th><th>سوابق</th><th>عملیات</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<div class="module-empty">موردی با این فیلترها پیدا نشد.</div>';
    const actions = exportMenu('gasmeters') +
      '<button class="primary-btn" type="button" data-module-action="new" data-view="gasmeters">+ ثبت گازسنج</button>';
    section.innerHTML = rootWrap(
      pageHead('مدیریت گازسنج‌ها', 'وضعیت سلامت، محل استقرار، کالیبراسیون و مانده روز تا پایان اعتبار هر دستگاه', actions) +
      gasTabBar() +
      '<div class="stat-row">' + kpis + '</div>' +
      renderForm('gasmeters', appData) +
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>فهرست گازسنج‌ها</h3><p>بر اساس محل، وضعیت یا کالیبراسیون مرتب و فیلتر کن.</p></div>' +
      '<div class="module-list-tools">' +
      '<select data-gas-filter="location"><option value="all">همه محل‌ها</option>' + locations.slice(1).map(function (value) { return '<option value="' + esc(value) + '"' + (gasFilter.location === value ? ' selected' : '') + '>' + esc(value) + '</option>'; }).join('') + '</select>' +
      '<select data-gas-filter="status"><option value="all">همه وضعیت‌ها</option>' + statuses.slice(1).map(function (value) { return '<option value="' + esc(value) + '"' + (gasFilter.status === value ? ' selected' : '') + '>' + esc(value) + '</option>'; }).join('') + '</select>' +
      '<select data-gas-filter="calibration"><option value="all">همه کالیبراسیون‌ها</option>' +
      [['valid', 'معتبر'], ['soon', 'نزدیک انقضا'], ['expired', 'منقضی'], ['unknown', 'بدون تاریخ']].map(function (pair) { return '<option value="' + pair[0] + '"' + (gasFilter.calibration === pair[0] ? ' selected' : '') + '>' + pair[1] + '</option>'; }).join('') + '</select>' +
      '<select data-gas-filter="sort"><option value="calibration"' + (gasFilter.sort === 'calibration' ? ' selected' : '') + '>مرتب‌سازی: مانده کالیبراسیون</option><option value="location"' + (gasFilter.sort === 'location' ? ' selected' : '') + '>محل استقرار</option><option value="code"' + (gasFilter.sort === 'code' ? ' selected' : '') + '>کد دستگاه</option><option value="health"' + (gasFilter.sort === 'health' ? ' selected' : '') + '>وضعیت سلامت</option></select>' +
      '</div></div>' + table + '</section>' +
      '<div class="module-local-note"><strong>هشدار کالیبراسیون:</strong> دستگاه‌هایی که در کالیبراسیون هستند، کمتر از ۳۰ روز تا پایان اعتبارشان مانده یا منقضی شده‌اند، در زنگ اعلان داشبورد هم نمایش داده می‌شوند.</div>'
    );
  }

  // ── سوابق گازسنج: فهرست همهٔ دستگاه‌ها، مرتب‌سازی و سابقهٔ هر دستگاه ──
  const GAS_LOG_SORTS = {
    calibration: { label: 'مانده کالیبراسیون', numeric: true, value: function (r) { const s = gasCalibrationState(r); return s.left == null ? 99999 : s.left; } },
    code: { label: 'شمارهٔ دستگاه', numeric: false, value: function (r) { return String(r.code || ''); } },
    name: { label: 'نام / مدل', numeric: false, value: function (r) { return String(r.model || ''); } },
    location: { label: 'محل استقرار', numeric: false, value: function (r) { return String(r.location || r.locationPoint || ''); } },
    health: { label: 'وضعیت سلامت', numeric: false, value: function (r) { return String(r.healthStatus || ''); } }
  };

  const EXPORT_FORMATS = [['csv', 'CSV (صفحه‌گسترده)'], ['xlsx', 'Excel (.xlsx)'], ['docx', 'Word (.docx)'], ['png', 'تصویر PNG'], ['print', 'چاپ / PDF (A4 افقی)']];

  function sortedGasMeters() {
    const spec = GAS_LOG_SORTS[gasLogSort] || GAS_LOG_SORTS.calibration;
    return (appData.gasmeters || []).slice().sort(function (a, b) {
      if (spec.numeric) return spec.value(a) - spec.value(b);
      return String(spec.value(a)).localeCompare(String(spec.value(b)), 'fa', { numeric: true });
    });
  }

  function gasLogsOf(meterId) {
    return (appData.gaslogs || []).filter(function (log) { return String(log.gasmeterId) === String(meterId); })
      .sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
  }

  function gasRemainingText(value) {
    const left = dueInDays(value);
    if (!isFinite(left)) return '—';
    return left < 0 ? faDigits(Math.abs(left)) + ' روز گذشته' : faDigits(left) + ' روز مانده';
  }

  function gasMeterName(meter) {
    return [meter.code, meter.model].filter(Boolean).join(' · ') || 'گازسنج بدون کد';
  }

  // مبنای محل استقرار هر گازسنج، آخرین موقعیتی است که در سوابق همان دستگاه ثبت شده است.
  function gasLatestPositionLog(meter) {
    const logs = gasLogsOf(meter.id);
    for (let i = 0; i < logs.length; i += 1) {
      const log = logs[i];
      if (log && (log.stationId || log.positionKind || log.positionDetail || log.location)) return log;
    }
    return null;
  }

  function gasMeterPosition(meter, data) {
    const source = data || appData;
    const log = gasLatestPositionLog(meter);
    const stationId = String((log && log.stationId) || meter.stationId || '');
    const station = stationId ? (source.stations || []).find(function (item) { return String(item.id) === stationId; }) : null;
    return {
      stationId: stationId,
      stationName: station ? String(station.name || '') : '',
      positionKind: String((log && log.positionKind) || meter.positionKind || '').trim(),
      positionDetail: String((log && log.positionDetail) || meter.positionDetail || '').trim(),
      legacyLocation: String((log && log.location) || meter.location || meter.locationPoint || '').trim(),
      date: String((log && log.date) || meter.locationSince || ''),
      fromLog: !!log
    };
  }

  function gasPositionText(meter, data) {
    const position = gasMeterPosition(meter, data);
    const parts = [];
    if (position.stationName) parts.push(position.stationName);
    if (position.positionKind || position.positionDetail) parts.push([position.positionKind, position.positionDetail].filter(Boolean).join(': '));
    if (!parts.length && position.legacyLocation) parts.push(position.legacyLocation);
    return parts.join(' · ');
  }

  function gasPositionCell(meter) {
    const position = gasMeterPosition(meter);
    const text = gasPositionText(meter);
    if (!text) return '—';
    return esc(text) + (position.fromLog && position.date
      ? '<div class="cell-sub">آخرین سابقه: ' + formatJalali(position.date, false) + '</div>' : '');
  }

  function gasMetersAtStation(station, data) {
    const source = data || appData;
    if (!station) return [];
    const stationId = String(station.id || '');
    const name = String(station.name || '').trim();
    const place = String(station.place || '').trim();
    return (source.gasmeters || []).filter(function (meter) {
      const position = gasMeterPosition(meter, source);
      if (position.stationId) return String(position.stationId) === stationId;
      const text = gasPositionText(meter, source);
      if (!text) return false;
      return (!!name && text.indexOf(name) >= 0) || (!!place && text.indexOf(place) >= 0);
    });
  }

  // ── ارسال و دریافت گروهی برای کالیبراسیون ──
  function gasMeterInCalibration(meter) {
    return String(meter.status || '') === 'در کالیبراسیون' ||
      (!!meter.calibrationDispatch && !meter.calibrationReturn);
  }

  function gasGroupCandidates(mode) {
    const meters = (appData.gasmeters || []).slice().sort(function (a, b) {
      return String(a.code || '').localeCompare(String(b.code || ''), 'fa', { numeric: true });
    });
    if (mode === 'receive') {
      // فقط دستگاه‌هایی که برای کالیبراسیون ارسال شده‌اند و هنوز دریافت نشده‌اند
      return meters.filter(function (meter) {
        return !!meter.calibrationDispatch && !meter.calibrationReturn;
      });
    }
    return meters.filter(function (meter) { return !gasMeterInCalibration(meter); });
  }

  function gasEmployeeOptions() {
    return (appData.employees || []).slice().sort(function (a, b) {
      return employeeName(a).localeCompare(employeeName(b), 'fa');
    });
  }

  function gasGroupStationOptions() {
    return (appData.stations || []).slice().sort(function (a, b) {
      return stationTitle(a).localeCompare(stationTitle(b), 'fa');
    }).map(function (station) {
      return '<option value="' + esc(station.id) + '">' + esc(stationLabel(station)) + '</option>';
    }).join('');
  }

  function gasGroupRow(meter, mode) {
    const position = gasPositionText(meter);
    const meta = mode === 'receive'
      ? (meter.calibrationDispatch ? 'ارسال: ' + formatJalali(meter.calibrationDispatch, false) : 'ارسال‌شده')
      : (gasCalibrationState(meter).label || meter.status || '—');
    return '<label class="gas-group-row"><input type="checkbox" data-gas-group-pick value="' + esc(meter.id) + '" checked>' +
      '<span class="gas-group-copy"><strong>' + esc(gasMeterName(meter)) + '</strong>' +
      '<small>' + esc([meter.serial, position].filter(Boolean).join(' · ') || 'بدون موقعیت ثبت‌شده') + '</small></span>' +
      '<span class="gas-group-meta">' + esc(meta) + '</span></label>';
  }

  function gasGroupListMarkup(mode, stationId) {
    if (mode === 'receive') {
      const list = gasGroupCandidates('receive');
      if (!list.length) {
        return '<div class="module-empty">دستگاهی که برای کالیبراسیون ارسال شده و منتظر دریافت باشد وجود ندارد.</div>';
      }
      return list.map(function (meter) { return gasGroupRow(meter, 'receive'); }).join('');
    }
    if (!stationId) {
      return '<div class="module-empty">ابتدا مرکز / ایستگاهی که دستگاه‌ها در آن مستقرند را انتخاب کن؛ فهرست دستگاه‌های همان مرکز اینجا می‌آید.</div>';
    }
    const station = (appData.stations || []).find(function (item) { return String(item.id) === String(stationId); });
    const atStation = gasMetersAtStation(station).filter(function (meter) { return !gasMeterInCalibration(meter); });
    if (!atStation.length) {
      return '<div class="module-empty">در این مرکز دستگاهی برای ارسال باقی نمانده است.</div>';
    }
    return atStation.map(function (meter) { return gasGroupRow(meter, 'send'); }).join('');
  }

  // فیلد تاریخ از انتخابگر سالنامهٔ خود برنامه استفاده می‌کند (enhanceJalaliInputs).
  function jalaliFieldMarkup(label, name, value, placeholder) {
    return '<label class="module-field"><span>' + esc(label) + '</span>' +
      '<input type="text" data-gas-group-field="' + esc(name) + '" data-jalali-input="jalali" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '۱۴۰۵/۰۸/۰۹') + '" autocomplete="new-password"></label>';
  }

  function openGasGroupDialog(mode) {
    const isReceive = mode === 'receive';
    const candidates = gasGroupCandidates(mode);
    if (!candidates.length) {
      toast(isReceive
        ? 'دستگاهی که برای کالیبراسیون ارسال شده و منتظر دریافت باشد وجود ندارد.'
        : 'دستگاهی برای ارسال باقی نمانده است.');
      return;
    }
    const title = isReceive ? 'دریافت گروهی از کالیبراسیون' : 'ارسال گروهی برای کالیبراسیون';
    const employeeOptions = gasEmployeeOptions().map(function (person) {
      return '<option value="' + esc(person.id) + '">' + esc(employeeName(person) || 'بدون نام') + '</option>';
    }).join('');
    const fields = isReceive
      ? jalaliFieldMarkup('تاریخ دریافت (شمسی)', 'date', jalaliInputValue('')) +
        '<label><span>تحویل‌گیرنده</span><select data-gas-group-field="person"><option value="">انتخاب از کارمندان</option>' + employeeOptions + '</select></label>' +
        jalaliFieldMarkup('پایان اعتبار جدید کالیبراسیون (شمسی)', 'calibrationEnd', '', '۱۴۰۶/۰۸/۰۹') +
        '<label><span>وضعیت دستگاه پس از دریافت</span><input type="text" class="readonly-field" value="استندبای منطقه" readonly></label>'
      : '<label><span>مرکز / ایستگاه ارسال‌کننده</span><select data-gas-group-field="stationId"><option value="">انتخاب مرکز / ایستگاه</option>' + gasGroupStationOptions() + '</select></label>' +
        jalaliFieldMarkup('تاریخ ارسال (شمسی)', 'date', jalaliInputValue('')) +
        '<label><span>راننده</span><select data-gas-group-field="person"><option value="">انتخاب راننده از کارمندان</option>' + employeeOptions + '</select></label>' +
        '<label><span>وضعیت دستگاه پس از ارسال</span><input type="text" class="readonly-field" value="در کالیبراسیون" readonly></label>';
    const markup = '<div class="atlas-modal-backdrop gas-group-backdrop" data-gas-group-dialog>' +
      '<div class="atlas-modal gas-group-modal" role="dialog" aria-modal="true" aria-labelledby="gasGroupTitle">' +
      '<div class="atlas-modal-head"><div><h3 id="gasGroupTitle">' + esc(title) + '</h3>' +
      '<p>' + (isReceive
        ? 'فقط دستگاه‌هایی که برای کالیبراسیون ارسال شده‌اند در فهرست برگشت می‌آیند.'
        : 'همهٔ دستگاه‌های مستقر در مرکز انتخاب‌شده، مستقیم از همان مرکز برای کالیبراسیون ارسال می‌شوند.') + '</p></div>' +
      '<button type="button" class="atlas-modal-close" data-gas-group-close aria-label="بستن">×</button></div>' +
      '<div class="atlas-modal-body">' +
      '<div class="gas-group-fields">' + fields +
      '<label class="gas-group-note"><span>توضیحات (اختیاری)</span><input type="text" data-gas-group-field="description" placeholder="مثلاً ارسال با پیک به آزمایشگاه"></label>' +
      '</div>' +
      '<div class="gas-group-list-head"><strong>دستگاه‌ها</strong>' +
      '<span><button type="button" class="link-btn" data-gas-group-pickall="1">انتخاب همه</button> · ' +
      '<button type="button" class="link-btn" data-gas-group-picknone="1">هیچ‌کدام</button></span></div>' +
      '<div class="gas-group-list" data-gas-group-list>' + gasGroupListMarkup(mode, '') + '</div>' +
      '<div class="gas-group-actions">' +
      '<button type="button" class="primary-btn" data-gas-group-submit="' + esc(mode) + '">' + esc(title) + '</button>' +
      '<button type="button" class="secondary-btn" data-gas-group-close>بستن</button></div>' +
      '</div></div></div>';
    closeGasGroupDialog();
    const holder = document.createElement('div');
    holder.innerHTML = markup;
    const dialog = holder.firstElementChild;
    if (!dialog) return;
    document.body.appendChild(dialog);
    enhanceJalaliInputs(dialog);
    const stationSelect = dialog.querySelector('[data-gas-group-field="stationId"]');
    const listNode = dialog.querySelector('[data-gas-group-list]');
    if (stationSelect && listNode) {
      stationSelect.addEventListener('change', function () {
        listNode.innerHTML = gasGroupListMarkup('send', stationSelect.value);
      });
    }
  }

  function closeGasGroupDialog() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-gas-group-dialog]'), function (node) { node.remove(); });
  }

  async function submitGasGroupDialog(mode) {
    const dialog = document.querySelector('[data-gas-group-dialog]');
    if (!dialog) return;
    const field = function (name) {
      const node = dialog.querySelector('[data-gas-group-field="' + name + '"]');
      return node ? String(node.value || '').trim() : '';
    };
    const isReceive = mode === 'receive';
    const picks = Array.prototype.map.call(dialog.querySelectorAll('[data-gas-group-pick]:checked'), function (node) { return node.value; });
    if (!picks.length) { toast('حداقل یک دستگاه را انتخاب کن.'); return; }
    const personId = field('person');
    if (!personId) { toast(isReceive ? 'انتخاب تحویل‌گیرنده الزامی است.' : 'انتخاب راننده الزامی است.'); return; }
    const date = parseJalali(field('date'), false);
    if (!date) { toast('تاریخ را از تقویم شمسی انتخاب کن.'); return; }
    const stationId = field('stationId');
    if (!isReceive && !stationId) { toast('انتخاب مرکز / ایستگاه ارسال‌کننده الزامی است.'); return; }
    const calibrationEnd = field('calibrationEnd') ? parseJalali(field('calibrationEnd'), false) : '';
    if (field('calibrationEnd') && !calibrationEnd) { toast('پایان اعتبار کالیبراسیون معتبر نیست؛ از تقویم انتخاب کن.'); return; }
    if (isReceive && !calibrationEnd) { toast('پایان اعتبار جدید کالیبراسیون را از تقویم انتخاب کن.'); return; }
    const description = field('description');
    const label = isReceive ? 'دریافت گروهی از کالیبراسیون' : 'ارسال گروهی برای کالیبراسیون';
    const status = isReceive ? 'استندبای منطقه' : 'در کالیبراسیون';
    const station = stationId
      ? (appData.stations || []).find(function (item) { return String(item.id) === stationId; })
      : null;
    let index = 0;
    picks.forEach(function (meterId) {
      const meter = (appData.gasmeters || []).find(function (item) { return String(item.id) === String(meterId); });
      if (!meter) return;
      const position = gasMeterPosition(meter);
      const log = {
        id: 'gaslog-' + Date.now().toString(36) + '-' + (index += 1),
        gasmeterId: meter.id,
        date: date,
        logType: label,
        stationId: station ? String(station.id) : (position.stationId || ''),
        positionKind: meter.positionKind || position.positionKind || '',
        positionDetail: meter.positionDetail || position.positionDetail || '',
        description: description,
        operatorId: personId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (isReceive) {
        log.receiverId = personId;
        log.calibrationReturn = date;
        log.calibrationEnd = calibrationEnd;
        meter.calibrationReturn = date;
        meter.calibrationEnd = calibrationEnd;
        meter.calibrationStart = date;
      } else {
        log.carrierId = personId;
        log.carrierRole = 'راننده';
        log.calibrationDispatch = date;
        meter.calibrationDispatch = date;
        meter.calibrationStart = date;
      }
      if (station && station.name) log.stationName = station.name;
      meter.status = status;
      meter.updatedAt = new Date().toISOString();
      appData.gaslogs = appData.gaslogs || [];
      appData.gaslogs.push(log);
    });
    if (await saveState()) {
      closeGasGroupDialog();
      toast(label + ' برای ' + faDigits(picks.length) + ' دستگاه ثبت شد.');
      const section = document.getElementById('sectionView');
      if (gasTab === 'logs') renderGasLogs(section); else renderGasRegistry(section);
    }
  }

  function gasFact(label, value) {
    return '<div class="gaslog-fact"><dt>' + esc(label) + '</dt><dd>' + esc(value || '—') + '</dd></div>';
  }

  function gasRegistryExportRows() {
    const rows = [['شمارهٔ دستگاه', 'نام / مدل', 'محل استقرار', 'تاریخ استقرار', 'وضعیت سلامت', 'شروع کالیبراسیون', 'پایان کالیبراسیون', 'مانده کالیبراسیون', 'وضعیت کالیبراسیون', 'تعداد سوابق']];
    sortedGasMeters().forEach(function (meter) {
      const state = gasCalibrationState(meter);
      rows.push([
        meter.code || '', meter.model || '',
        meter.location || meter.locationPoint || '',
        meter.locationSince ? formatJalali(meter.locationSince, false) : '',
        meter.healthStatus || '',
        meter.calibrationStart ? formatJalali(meter.calibrationStart, false) : '',
        meter.calibrationEnd ? formatJalali(meter.calibrationEnd, false) : '',
        gasRemainingText(meter.calibrationEnd), state.label,
        faDigits(gasLogsOf(meter.id).length)
      ]);
    });
    return rows;
  }

  function gasMeterExportRows(meter) {
    const rows = [['تاریخ', 'نوع سابقه', 'محل استقرار', 'تاریخ استقرار', 'وضعیت سلامت', 'شروع کالیبراسیون', 'پایان کالیبراسیون', 'مانده کالیبراسیون', 'مقدار / نتیجه', 'شرح', 'ثبت‌کننده']];
    gasLogsOf(meter.id).forEach(function (entry) {
      const operator = (appData.employees || []).find(function (item) { return String(item.id) === String(entry.operatorId); });
      rows.push([
        entry.date ? formatJalali(entry.date, false) : '',
        entry.logType || '',
        entry.location || meter.location || '',
        entry.locationSince ? formatJalali(entry.locationSince, false) : '',
        entry.healthStatus || '',
        entry.calibrationStart ? formatJalali(entry.calibrationStart, false) : '',
        entry.calibrationEnd ? formatJalali(entry.calibrationEnd, false) : '',
        gasRemainingText(entry.calibrationEnd || meter.calibrationEnd),
        entry.value || '', entry.description || '',
        operator ? employeeName(operator) : ''
      ]);
    });
    return rows;
  }

  function customExportMenu(kind, target, attr) {
    const key = attr || 'gas';
    return '<div class="module-export" data-export-menu>' +
      '<button type="button" class="secondary-btn module-export-toggle" data-module-action="export-toggle" aria-haspopup="true" aria-expanded="false">⬇ خروجی و چاپ</button>' +
      '<div class="module-export-list" hidden>' +
      EXPORT_FORMATS.map(function (pair) {
        return '<button type="button" data-export-custom="' + esc(kind) + '" data-' + key + '="' + esc(target || '') + '" data-format="' + pair[0] + '">' + pair[1] + '</button>';
      }).join('') +
      '</div></div>';
  }

  function renderGasLogs(section) {
    if (gasLogMeterId) {
      const meter = (appData.gasmeters || []).find(function (item) { return String(item.id) === String(gasLogMeterId); });
      if (meter) { renderGasMeterLogs(section, meter); return; }
      gasLogMeterId = '';
    }
    const meters = sortedGasMeters();
    const totalLogs = (appData.gaslogs || []).length;
    const withLogs = meters.filter(function (meter) { return gasLogsOf(meter.id).length > 0; }).length;
    const atRisk = meters.filter(function (meter) { const state = gasCalibrationState(meter); return state.key === 'soon' || state.key === 'expired'; }).length;
    const kpis = [['کل گازسنج‌ها', faDigits(meters.length), 'info'], ['دارای سابقه', faDigits(withLogs), 'ok'], ['کالیبراسیون نزدیک یا منقضی', faDigits(atRisk), 'warn'], ['کل سوابق', faDigits(totalLogs), 'special']]
      .map(function (pair) { return '<div class="mini-stat" data-tone="' + pair[2] + '"><div class="value">' + pair[1] + '</div><div class="label"><i class="tiny-dot"></i>' + pair[0] + '</div></div>'; }).join('');
    const sortOptions = Object.keys(GAS_LOG_SORTS).map(function (key) {
      return '<option value="' + key + '"' + (gasLogSort === key ? ' selected' : '') + '>مرتب‌سازی: ' + GAS_LOG_SORTS[key].label + '</option>';
    }).join('');
    const cards = meters.length ? meters.map(function (meter) {
      const state = gasCalibrationState(meter);
      return '<button type="button" class="gaslog-meter" data-gaslog-open="' + esc(meter.id) + '">' +
        '<span class="gaslog-meter-top"><strong>' + esc(gasMeterName(meter)) + '</strong>' + statusTag(state.label) + '</span>' +
        '<span class="gaslog-meter-facts">' +
        '<span><b>محل استقرار</b>' + esc(meter.location || meter.locationPoint || '—') + '</span>' +
        '<span><b>تاریخ استقرار</b>' + (meter.locationSince ? formatJalali(meter.locationSince, false) : '—') + '</span>' +
        '<span><b>وضعیت سلامت</b>' + esc(meter.healthStatus || '—') + '</span>' +
        '<span><b>مانده کالیبراسیون</b>' + gasRemainingText(meter.calibrationEnd) + '</span>' +
        '<span><b>شروع کالیبراسیون</b>' + (meter.calibrationStart ? formatJalali(meter.calibrationStart, false) : '—') + '</span>' +
        '<span><b>پایان کالیبراسیون</b>' + (meter.calibrationEnd ? formatJalali(meter.calibrationEnd, false) : '—') + '</span>' +
        '</span>' +
        '<span class="gaslog-meter-foot"><span>' + faDigits(gasLogsOf(meter.id).length) + ' سابقه</span><span class="gaslog-open-hint">مشاهدهٔ سوابق ›</span></span>' +
        '</button>';
    }).join('') : '<div class="module-empty">اول یک گازسنج ثبت کن؛ بعد سوابق هر دستگاه اینجا باز می‌شود.</div>';
    section.innerHTML = rootWrap(
      pageHead('مدیریت گازسنج‌ها', 'سوابق هر دستگاه: محل استقرار، تاریخ استقرار، سلامت و کالیبراسیون',
        '<button class="secondary-btn" type="button" data-gas-group="send">ارسال گروهی برای کالیبراسیون</button>' +
        '<button class="secondary-btn" type="button" data-gas-group="receive">دریافت گروهی از کالیبراسیون</button>' +
        customExportMenu('gaslogs-registry')) +
      gasTabBar() +
      '<div class="stat-row">' + kpis + '</div>' +
      renderForm('gaslogs', appData) +
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>سوابق گازسنج‌ها</h3><p>روی هر دستگاه بزن تا سوابق همان گازسنج باز شود.</p></div>' +
      '<div class="module-list-tools"><select data-gaslog-sort aria-label="مرتب‌سازی فهرست گازسنج‌ها">' + sortOptions + '</select></div></div>' +
      '<div class="gaslog-meter-list">' + cards + '</div></section>'
    );
  }

  function renderGasMeterLogs(section, meter) {
    const state = gasCalibrationState(meter);
    const entries = gasLogsOf(meter.id);
    const snapshot =
      '<section class="module-list-panel gaslog-snapshot"><div class="module-list-head"><div><h3>وضعیت فعلی ' + esc(gasMeterName(meter)) + '</h3>' +
      '<p>هر سابقهٔ پایین، وضعیت ثبت‌شده در تاریخ خودش را نگه می‌دارد.</p></div>' + statusTag(state.label) + '</div>' +
      '<dl class="gaslog-facts gaslog-facts-wide">' +
      gasFact('محل استقرار فعلی', meter.location || meter.locationPoint || '') +
      gasFact('تاریخ استقرار', meter.locationSince ? formatJalali(meter.locationSince, false) : '') +
      gasFact('وضعیت سلامت', meter.healthStatus || '') +
      gasFact('مانده کالیبراسیون', gasRemainingText(meter.calibrationEnd)) +
      gasFact('شروع کالیبراسیون', meter.calibrationStart ? formatJalali(meter.calibrationStart, false) : '') +
      gasFact('پایان کالیبراسیون', meter.calibrationEnd ? formatJalali(meter.calibrationEnd, false) : '') +
      '</dl></section>';
    const cards = entries.length ? entries.map(function (entry) {
      return '<article class="gaslog-entry">' +
        '<div class="gaslog-entry-head"><strong>' + (entry.date ? formatJalali(entry.date, false) : 'بدون تاریخ') + '</strong>' + statusTag(entry.logType || '—') + '</div>' +
        '<dl class="gaslog-facts">' +
        gasFact('محل استقرار فعلی', entry.location || meter.location || '') +
        gasFact('تاریخ استقرار', entry.locationSince ? formatJalali(entry.locationSince, false) : '') +
        gasFact('وضعیت سلامت', entry.healthStatus || '') +
        gasFact('مانده کالیبراسیون', gasRemainingText(entry.calibrationEnd || meter.calibrationEnd)) +
        gasFact('شروع کالیبراسیون', entry.calibrationStart ? formatJalali(entry.calibrationStart, false) : '') +
        gasFact('پایان کالیبراسیون', entry.calibrationEnd ? formatJalali(entry.calibrationEnd, false) : '') +
        '</dl>' +
        (entry.value ? '<p class="gaslog-line"><span>مقدار / نتیجه</span>' + esc(entry.value) + '</p>' : '') +
        (entry.description ? '<p class="gaslog-line"><span>شرح</span>' + esc(entry.description) + '</p>' : '') +
        '<div class="gaslog-entry-actions">' +
        '<button type="button" class="secondary-btn" data-module-action="edit" data-view="gaslogs" data-id="' + esc(entry.id) + '">ویرایش</button>' +
        '<button type="button" class="module-delete-btn" data-module-action="delete" data-view="gaslogs" data-id="' + esc(entry.id) + '">حذف</button>' +
        '</div></article>';
    }).join('') : '<div class="module-empty">برای این دستگاه هنوز سابقه‌ای ثبت نشده است.</div>';
    section.innerHTML = rootWrap(
      pageHead('سوابق ' + esc(gasMeterName(meter)), 'تاریخ، محل استقرار، سلامت و کالیبراسیون در هر ثبت', customExportMenu('gaslogs-meter', meter.id)) +
      gasTabBar() +
      '<div class="gaslog-detail-bar"><button type="button" class="secondary-btn" data-gaslog-back>‹ بازگشت به فهرست گازسنج‌ها</button>' +
      '<button type="button" class="primary-btn" data-gas-action="log" data-gas="' + esc(meter.id) + '">+ ثبت سابقه برای این دستگاه</button></div>' +
      renderForm('gaslogs', appData) +
      snapshot +
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>سوابق ثبت‌شده</h3><p>هر ردیف یک سابقه با تاریخ خودش.</p></div><span class="module-tag">' + faDigits(entries.length) + ' مورد</span></div>' +
      '<div class="gaslog-entry-list">' + cards + '</div></section>'
    );
  }

  // ── دفتر سرویس: فهرست خودروها، سوابق هر خودرو، مرتب‌سازی و گزارش ──
  function serviceLogsOfVehicle(vehicleId) {
    return (appData.maintenance || []).filter(function (item) { return String(item.vehicleId || '') === String(vehicleId); });
  }

  const SERVICE_LOG_SORTS = {
    'date-desc': { label: 'تاریخ سرویس (جدیدترین)', numeric: false, desc: true, value: function (item) { return String(item.date || ''); } },
    'date-asc': { label: 'تاریخ سرویس (قدیمی‌ترین)', numeric: false, value: function (item) { return String(item.date || ''); } },
    'km-desc': { label: 'کیلومتر (بیشترین)', numeric: true, desc: true, value: function (item) { const n = Number(item.km); return Number.isFinite(n) && item.km !== '' ? n : -1; } },
    'km-asc': { label: 'کیلومتر (کمترین)', numeric: true, value: function (item) { const n = Number(item.km); return Number.isFinite(n) && item.km !== '' ? n : Number.MAX_SAFE_INTEGER; } },
    type: { label: 'نوع اقدام', numeric: false, value: function (item) { return String(item.type || ''); } },
    status: { label: 'وضعیت', numeric: false, value: function (item) { return String(item.status || ''); } },
    'next-asc': { label: 'سرویس بعدی (نزدیک‌ترین)', numeric: false, value: function (item) { return String(item.nextServiceDate || '9999'); } }
  };

  function sortedServiceLogs(list) {
    const spec = SERVICE_LOG_SORTS[serviceLogSort] || SERVICE_LOG_SORTS['date-desc'];
    return list.slice().sort(function (a, b) {
      const va = spec.value(a), vb = spec.value(b);
      if (spec.numeric) return spec.desc ? vb - va : va - vb;
      const cmp = String(va).localeCompare(String(vb), 'fa', { numeric: true });
      return spec.desc ? -cmp : cmp;
    });
  }

  function serviceStatsByVehicle() {
    const map = {};
    const today = todayIso();
    (appData.maintenance || []).forEach(function (item) {
      const key = String(item.vehicleId || '');
      if (!key) return;
      if (!map[key]) map[key] = { total: 0, last: '', lastType: '', nextDate: '', nextKm: '' };
      map[key].total += 1;
      const date = String(item.date || '');
      if (date > map[key].last) { map[key].last = date; map[key].lastType = item.type || ''; }
      const nextDate = String(item.nextServiceDate || '');
      if (nextDate && nextDate >= today && (!map[key].nextDate || nextDate < map[key].nextDate)) {
        map[key].nextDate = nextDate;
        map[key].nextKm = item.nextServiceKm || '';
      }
    });
    return map;
  }

  const SERVICE_VEHICLE_SORTS = {
    last: { label: 'آخرین سرویس', numeric: false, desc: true, value: function (v, c) { return String((c[v.id] || {}).last || ''); } },
    count: { label: 'بیشترین تعداد سرویس', numeric: true, desc: true, value: function (v, c) { return (c[v.id] || {}).total || 0; } },
    next: { label: 'نزدیک‌ترین سرویس بعدی', numeric: false, value: function (v, c) { return String((c[v.id] || {}).nextDate || '9999'); } },
    name: { label: 'نام خودرو', numeric: false, value: function (v) { return String(v.name || ''); } },
    plate: { label: 'پلاک سازمانی', numeric: false, value: function (v) { return String(v.companyPlate || v.policePlate || ''); } },
    status: { label: 'وضعیت عملیاتی', numeric: false, value: function (v) { return String(v.status || ''); } },
    km: { label: 'کیلومتر فعلی', numeric: true, desc: true, value: function (v) { const n = Number(v.currentKm); return Number.isFinite(n) ? n : -1; } }
  };

  function sortedServiceVehicles(stats) {
    const spec = SERVICE_VEHICLE_SORTS[serviceVehicleSort] || SERVICE_VEHICLE_SORTS.last;
    return (appData.vehicles || []).slice().sort(function (a, b) {
      const va = spec.value(a, stats), vb = spec.value(b, stats);
      if (spec.numeric) return spec.desc ? vb - va : va - vb;
      const cmp = String(va).localeCompare(String(vb), 'fa', { numeric: true });
      return spec.desc ? -cmp : cmp;
    });
  }

  function serviceVehicleExportRows(stats) {
    const rows = [['نام خودرو', 'نوع خودرو', 'پلاک سازمانی', 'پلاک انتظامی', 'وضعیت عملیاتی', 'کیلومتر فعلی', 'تعداد سرویس', 'آخرین سرویس', 'نوع آخرین سرویس', 'تاریخ سرویس بعدی', 'کیلومتر سرویس بعدی']];
    sortedServiceVehicles(stats).forEach(function (vehicle) {
      const stat = stats[vehicle.id] || {};
      rows.push([
        vehicle.name || '', vehicle.vehicleType || '', vehicle.companyPlate || '', vehicle.policePlate || '',
        vehicle.status || '', vehicle.currentKm ? faDigits(vehicle.currentKm) : '',
        faDigits(stat.total || 0),
        stat.last ? formatJalali(stat.last, false) : '', stat.lastType || '',
        stat.nextDate ? formatJalali(stat.nextDate, false) : '', stat.nextKm ? faDigits(stat.nextKm) : ''
      ]);
    });
    return rows;
  }

  function serviceLogExportRows(list) {
    const rows = [['تاریخ سرویس', 'کیلومتر', 'نوع اقدام', 'شرح اقدام و قطعات', 'وضعیت', 'تاریخ سرویس بعدی', 'کیلومتر سرویس بعدی']];
    sortedServiceLogs(list).forEach(function (item) {
      rows.push([
        item.date ? formatJalali(item.date, false) : '',
        item.km ? faDigits(item.km) : '',
        item.type || '', item.description || '', item.status || '',
        item.nextServiceDate ? formatJalali(item.nextServiceDate, false) : '',
        item.nextServiceKm ? faDigits(item.nextServiceKm) : ''
      ]);
    });
    return rows;
  }

  function serviceRow(item) {
    return '<div class="service-row"><div class="service-date">' + (item.date ? formatJalali(item.date, false) : '—') + '</div>' +
      '<div class="service-main"><strong>' + esc(item.type || 'سرویس') + '</strong><span>' + esc(item.description || '') + '</span></div>' +
      '<div class="service-meta">' + (item.km ? faDigits(item.km) + ' کیلومتر' : '') +
      (item.nextServiceDate ? (item.km ? ' · ' : '') + 'بعدی: ' + formatJalali(item.nextServiceDate, false) : '') + '</div>' +
      '<div class="service-actions">' + statusTag(item.status || '—') +
      '<button type="button" class="secondary-btn" data-module-action="edit" data-view="maintenance" data-id="' + esc(item.id) + '">ویرایش</button>' +
      '<button type="button" class="module-delete-btn" data-module-action="delete" data-view="maintenance" data-id="' + esc(item.id) + '">حذف</button></div></div>';
  }

  function renderServiceBook(section) {
    if (serviceVehicleId) {
      const vehicle = (appData.vehicles || []).find(function (item) { return String(item.id) === String(serviceVehicleId); });
      if (vehicle) { renderServiceVehicle(section, vehicle, serviceLogsOfVehicle(vehicle.id)); return; }
      serviceVehicleId = '';
    }
    const stats = serviceStatsByVehicle();
    const logs = appData.maintenance || [];
    const vehicles = sortedServiceVehicles(stats);
    const withLogs = vehicles.filter(function (vehicle) { return (stats[vehicle.id] || {}).total; }).length;
    const waiting = logs.filter(function (item) { return item.status === 'در انتظار قطعه' || item.status === 'در حال انجام'; }).length;
    const done = logs.filter(function (item) { return item.status === 'انجام‌شده'; }).length;
    const kpis = [['کل سوابق', faDigits(logs.length), 'info'], ['خودروهای دارای سابقه', faDigits(withLogs), 'ok'], ['در جریان یا منتظر قطعه', faDigits(waiting), 'warn'], ['انجام‌شده', faDigits(done), 'special']]
      .map(function (pair) { return '<div class="mini-stat" data-tone="' + pair[2] + '"><div class="value">' + pair[1] + '</div><div class="label"><i class="tiny-dot"></i>' + pair[0] + '</div></div>'; }).join('');
    const sortOptions = Object.keys(SERVICE_VEHICLE_SORTS).map(function (key) {
      return '<option value="' + key + '"' + (serviceVehicleSort === key ? ' selected' : '') + '>مرتب‌سازی: ' + SERVICE_VEHICLE_SORTS[key].label + '</option>';
    }).join('');
    const cards = vehicles.length ? vehicles.map(function (vehicle) {
      const stat = stats[vehicle.id] || { total: 0, last: '', lastType: '', nextDate: '', nextKm: '' };
      const lastLog = sortedServiceLogs(serviceLogsOfVehicle(vehicle.id))[0];
      return '<button type="button" class="vtab-card" data-vtab-open="' + esc(vehicle.id) + '">' +
        '<span class="vtab-top"><strong>' + esc(vehicle.name || 'خودرو بدون نام') + '</strong>' + statusTag(vehicle.status || '—') + '</span>' +
        '<span class="vtab-facts">' +
        '<span><b>پلاک سازمانی</b>' + esc(vehicle.companyPlate || vehicle.policePlate || '—') + '</span>' +
        '<span><b>کیلومتر فعلی</b>' + (vehicle.currentKm ? faDigits(vehicle.currentKm) : '—') + '</span>' +
        '<span><b>تعداد سرویس</b>' + faDigits(stat.total || 0) + '</span>' +
        '<span><b>آخرین سرویس</b>' + (stat.last ? formatJalali(stat.last, false) : '—') + '</span>' +
        '<span><b>سرویس بعدی</b>' + (stat.nextDate ? formatJalali(stat.nextDate, false) + (stat.nextKm ? ' · ' + faDigits(stat.nextKm) + ' کیلومتر' : '') : '—') + '</span>' +
        '<span><b>نوع آخرین سرویس</b>' + esc(stat.lastType || '—') + '</span>' +
        '</span>' +
        (lastLog ? '<span class="vtab-last">' + esc(lastLog.description || lastLog.type || '') + '</span>' : '') +
        '<span class="vtab-foot"><span>' + faDigits(stat.total || 0) + ' سرویس ثبت‌شده</span><span class="vtab-open-hint">مشاهدهٔ سوابق ›</span></span>' +
        '</button>';
    }).join('') : '<div class="module-empty">اول خودروها را ثبت کن؛ بعد سوابق سرویس هر خودرو اینجا باز می‌شود.</div>';
    section.innerHTML = rootWrap(
      pageHead('دفتر سرویس <span style="color:var(--tone-7)">خودروها</span>', 'روی هر خودرو بزن تا سوابق سرویس همان خودرو باز شود؛ فهرست و هر سابقه گزارش‌گیری جدا دارد', customExportMenu('service-vehicles') + '<button class="primary-btn" type="button" data-module-action="new" data-view="maintenance">+ ثبت سرویس</button>') +
      vehicleTabBar() +
      '<div class="stat-row fault-kpis">' + kpis + '</div>' +
      renderForm('maintenance', appData) +
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>خودروهای ناوگان</h3><p>بر اساس آخرین سرویس، تعداد، سرویس بعدی، نام، پلاک یا وضعیت مرتب کن.</p></div>' +
      '<div class="module-list-tools"><select data-service-sort aria-label="مرتب‌سازی فهرست خودروها">' + sortOptions + '</select></div></div>' +
      '<div class="vtab-list">' + cards + '</div></section>'
    );
  }

  function renderServiceVehicle(section, vehicle, list) {
    const stats = serviceStatsByVehicle()[vehicle.id] || {};
    const done = list.filter(function (item) { return item.status === 'انجام‌شده'; }).length;
    const waiting = list.filter(function (item) { return item.status === 'در انتظار قطعه' || item.status === 'در حال انجام'; }).length;
    const kpis = [['کل سوابق', faDigits(list.length), 'info'], ['انجام‌شده', faDigits(done), 'ok'], ['در جریان یا منتظر قطعه', faDigits(waiting), 'warn'], ['آخرین سرویس', stats.last ? formatJalali(stats.last, false) : '—', 'special']]
      .map(function (pair) { return '<div class="mini-stat" data-tone="' + pair[2] + '"><div class="value">' + pair[1] + '</div><div class="label"><i class="tiny-dot"></i>' + pair[0] + '</div></div>'; }).join('');
    const sortOptions = Object.keys(SERVICE_LOG_SORTS).map(function (key) {
      return '<option value="' + key + '"' + (serviceLogSort === key ? ' selected' : '') + '>مرتب‌سازی: ' + SERVICE_LOG_SORTS[key].label + '</option>';
    }).join('');
    const rows = list.length ? sortedServiceLogs(list).map(serviceRow).join('') : '<div class="service-empty">برای این خودرو سرویسی ثبت نشده است.</div>';
    section.innerHTML = rootWrap(
      pageHead('سوابق سرویس <span style="color:var(--tone-7)">' + esc([vehicle.name, vehicle.companyPlate].filter(Boolean).join(' · ')) + '</span>', 'هر سابقه با تاریخ، کیلومتر، نوع اقدام و سرویس بعدی خودش', customExportMenu('service-vehicle', vehicle.id, 'vehicle')) +
      vehicleTabBar() +
      '<div class="vtab-bar"><button type="button" class="secondary-btn" data-vtab-back>‹ بازگشت به فهرست خودروها</button>' +
      '<button type="button" class="primary-btn" data-service-action="add" data-vehicle="' + esc(vehicle.id) + '">+ ثبت سرویس برای این خودرو</button></div>' +
      renderForm('maintenance', appData) +
      '<div class="stat-row fault-kpis">' + kpis + '</div>' +
      '<section class="module-list-panel vtab-snapshot"><div class="module-list-head"><div><h3>وضعیت فعلی ' + esc(vehicle.name || 'خودرو') + '</h3>' +
      '<p>سرویس بعدی از تاریخ‌های آیندهٔ همین سوابق خوانده می‌شود.</p></div>' + statusTag(vehicle.status || '—') + '</div>' +
      '<dl class="vtab-facts vtab-facts-wide">' +
      vtabFact('پلاک سازمانی', vehicle.companyPlate || '') +
      vtabFact('پلاک انتظامی', vehicle.policePlate || '') +
      vtabFact('نوع خودرو', vehicle.vehicleType || '') +
      vtabFact('کیلومتر فعلی', vehicle.currentKm ? faDigits(vehicle.currentKm) : '') +
      vtabFact('سرویس بعدی', stats.nextDate ? formatJalali(stats.nextDate, false) + (stats.nextKm ? ' · ' + faDigits(stats.nextKm) + ' کیلومتر' : '') : '') +
      vtabFact('آخرین سرویس', stats.last ? formatJalali(stats.last, false) + (stats.lastType ? ' · ' + stats.lastType : '') : '') +
      '</dl></section>' +
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>سوابق ثبت‌شده</h3><p>هر ردیف یک سرویس با تاریخ و کیلومتر خودش.</p></div>' +
      '<div class="module-list-tools"><select data-service-log-sort aria-label="مرتب‌سازی سوابق سرویس">' + sortOptions + '</select></div></div>' +
      '<div class="service-book">' + rows + '</div></section>'
    );
  }

  // ── اقدام‌های نقشه، اطلاعات مکان و مدیریت مکان‌ها ──
  document.addEventListener('click', async function (event) {
    const button = event.target.closest('[data-station-action]');
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.stationAction;
    const section = document.getElementById('sectionView');

    if (action === 'info-close') { closeStationInfo(); return; }
    if (action === 'add') { closeStationInfo(); formState.stations = { open: true, id: null }; render('stations', section); return; }
    if (action === 'edit') { closeStationInfo(); formState.stations = { open: true, id: button.dataset.id }; render('stations', section); return; }
    if (action === 'auto') { await stationAutoLayout(); return; }
    if (action === 'restore-layout') { await stationRestoreLayout(); return; }

    if (action === 'place-add-type') {
      const name = await askPrompt({ title: 'نوع محل جدید', label: 'نام نوع محل', placeholder: 'مثلاً ایستگاه برق', confirmLabel: 'افزودن' });
      if (!name) return;
      const list = Array.isArray(appData.references.placeTypes) ? appData.references.placeTypes : (appData.references.placeTypes = []);
      if (list.indexOf(name) < 0) list.push(name);
      if (await saveState()) { refreshPlaceManager(); toast('نوع محل «' + name + '» افزوده شد.'); }
      return;
    }
    if (action === 'place-add') {
      const type = button.dataset.type || '';
      const name = await askPrompt({ title: 'افزودن مکان', label: 'نام مکان در «' + type + '»', confirmLabel: 'افزودن' });
      if (!name) return;
      placeRegister(type, name);
      if (await saveState()) { refreshPlaceManager(); toast('مکان «' + name + '» به «' + type + '» افزوده شد.'); }
      return;
    }
    if (action === 'place-edit') {
      const type = button.dataset.type || '';
      const oldName = button.dataset.place || '';
      const name = await askPrompt({ title: 'تغییر نام مکان', label: 'نام جدید', value: oldName, confirmLabel: 'ذخیره' });
      if (!name || name === oldName) return;
      const list = placesForType(type);
      const index = list.indexOf(oldName);
      if (index >= 0) placeLists()[type][index] = name;
      placeRegister(type, name);
      (appData.stations || []).forEach(function (record) {
        if (String(record.placeType || '') === type && String(record.place || '') === oldName) record.place = name;
      });
      if (await saveState()) { refreshPlaceManager(); toast('نام مکان اصلاح شد.'); }
      return;
    }
    if (action === 'place-delete') {
      const type = button.dataset.type || '';
      const name = button.dataset.place || '';
      const approved = await askConfirm({ title: 'حذف مکان', message: 'مکان «' + name + '» از فهرست «' + type + '» حذف شود؟ اطلاعات ایستگاه‌هایی که این مکان را دارند تغییر نمی‌کند.', confirmLabel: 'حذف', danger: true });
      if (!approved) return;
      placeRemove(type, name);
      if (await saveState()) { refreshPlaceManager(); toast('مکان حذف شد.'); }
      return;
    }
  });

  // ── ارسال/دریافت گروهی کالیبراسیون ──
  document.addEventListener('click', async function (event) {
    const openButton = event.target.closest('[data-gas-group]');
    if (openButton) {
      event.preventDefault();
      openGasGroupDialog(openButton.dataset.gasGroup === 'receive' ? 'receive' : 'send');
      return;
    }
    if (event.target.closest('[data-gas-group-close]')) { event.preventDefault(); closeGasGroupDialog(); return; }
    const submit = event.target.closest('[data-gas-group-submit]');
    if (submit) { event.preventDefault(); await submitGasGroupDialog(submit.dataset.gasGroupSubmit === 'receive' ? 'receive' : 'send'); return; }
    if (event.target.closest('[data-gas-group-pickall]')) {
      event.preventDefault();
      Array.prototype.forEach.call(document.querySelectorAll('[data-gas-group-pick]'), function (node) { node.checked = true; });
      return;
    }
    if (event.target.closest('[data-gas-group-picknone]')) {
      event.preventDefault();
      Array.prototype.forEach.call(document.querySelectorAll('[data-gas-group-pick]'), function (node) { node.checked = false; });
      return;
    }
    if (event.target.closest('[data-gas-group-dialog]') && !event.target.closest('.atlas-modal')) closeGasGroupDialog();
  });

  // ── ویرایشگر ردیفی، افزودن مکان از داخل فرم و رنگ خطوط ──
  document.addEventListener('click', async function (event) {
    const addRow = event.target.closest('[data-rows-add]');
    if (addRow) {
      event.preventDefault();
      const form = addRow.closest('[data-module-form]');
      const moduleKey = form && form.dataset.view;
      if (!form || !moduleKey) return;
      const field = fieldsFor(moduleKey).find(function (item) { return item.key === addRow.dataset.rowsAdd; });
      const holder = form.querySelector('[data-rows-field="' + addRow.dataset.rowsAdd + '"]');
      if (!field || !holder) return;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = '<div class="module-row" data-row>' + field.columns.map(function (column) {
        return '<label class="module-row-cell"><span>' + esc(column.label) + '</span>' + rowControlMarkup(field, column, '', appData) + '</label>';
      }).join('') + '<button type="button" class="module-row-remove" data-row-remove aria-label="حذف ردیف">×</button></div>';
      if (wrapper.firstElementChild) holder.appendChild(wrapper.firstElementChild);
      return;
    }
    const removeRow = event.target.closest('[data-row-remove]');
    if (removeRow) {
      event.preventDefault();
      const row = removeRow.closest('[data-row]');
      if (row) row.remove();
      return;
    }
    const addPlace = event.target.closest('[data-place-add]');
    if (addPlace) {
      event.preventDefault();
      const form = addPlace.closest('[data-module-form]');
      const typeSelect = form && form.querySelector('[data-station-type]');
      const type = typeSelect ? String(typeSelect.value || '') : '';
      if (!type) { toast('ابتدا «نوع محل» را انتخاب کن.'); return; }
      const name = await askPrompt({ title: 'افزودن مکان جدید', label: 'نام مکان در «' + type + '»', confirmLabel: 'افزودن' });
      if (!name) return;
      placeRegister(type, name);
      await saveState();
      const select = form.querySelector('[data-place-select]');
      if (select) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
        select.value = name;
      }
      const hint = form.querySelector('[data-field-key="place"] .module-field-hint');
      if (hint) hint.textContent = 'مکان‌های ثبت‌شده برای «' + type + '»؛ با + می‌توانی مکان تازه اضافه کنی.';
      toast('مکان «' + name + '» به فهرست «' + type + '» افزوده شد.');
    }
  });

  document.addEventListener('change', function (event) {
    const trigger = event.target.closest('[data-station-type]');
    if (!trigger) return;
    const form = trigger.closest('[data-module-form]');
    if (!form) return;
    const type = String(trigger.value || '');
    const placeSelect = form.querySelector('[data-place-select]');
    if (placeSelect) {
      const current = placeSelect.value;
      const places = placesForType(type);
      placeSelect.innerHTML = '<option value="">' + (type ? 'انتخاب مکان' : 'ابتدا نوع محل را انتخاب کنید') + '</option>' +
        places.map(function (place) {
          return '<option value="' + esc(place) + '"' + (place === current ? ' selected' : '') + '>' + esc(place) + '</option>';
        }).join('');
      if (current && places.indexOf(current) < 0) placeSelect.value = '';
      const hint = form.querySelector('[data-field-key="place"] .module-field-hint');
      if (hint) hint.textContent = type
        ? 'مکان‌های ثبت‌شده برای «' + type + '»؛ با + می‌توانی مکان تازه اضافه کنی.'
        : 'فهرست مکان‌ها بر اساس نوع محل انتخاب‌شده نمایش داده می‌شود.';
      enhanceSearchSelects(form);
    }
    fieldsFor('stations').forEach(function (field) {
      const wrapper = form.querySelector('[data-field-key="' + field.key + '"]');
      if (wrapper) wrapper.hidden = !fieldVisible(field, { placeType: type });
    });
  });

  // تغییر انتخاب‌هایی که فیلد وابسته دارند، همان لحظه فیلد را نشان می‌دهد یا پنهان می‌کند.
  document.addEventListener('change', function (event) {
    const control = event.target;
    if (!control || !control.closest) return;
    const form = control.closest('[data-module-form]');
    if (form) refreshDependentFields(form);
  });

  // ── رفتار کادر «انتخاب چندتایی با جستجو» ─────────────────────────────────
  // تیک‌ها فقط در فهرست باز هستند (پیش‌نویس)؛ با «افزودن انتخاب‌شده‌ها» به چیپ‌های
  // نام‌دار تبدیل می‌شوند و همان‌ها به فرم ارسال می‌شوند.
  function mmcChips(box) {
    return Array.prototype.slice.call(box.querySelectorAll('[data-mmc-chosen] [data-mmc-chip]'));
  }

  function mmcRefresh(box) {
    if (!box) return;
    const count = mmcChips(box).length;
    const counter = box.querySelector('[data-mmc-count]');
    if (counter) counter.textContent = faDigits(count) + ' انتخاب‌شده';
    const empty = box.querySelector('[data-mmc-empty]');
    if (empty) empty.hidden = count > 0;
    const clear = box.querySelector('[data-mmc-clear]');
    if (clear) clear.hidden = count === 0;
    mmcRefreshAddLabel(box);
  }

  function mmcRefreshAddLabel(box) {
    const button = box.querySelector('[data-mmc-add]');
    if (!button) return;
    const staged = box.querySelectorAll('[data-mmc-pick]:checked').length;
    button.textContent = staged ? 'افزودن ' + faDigits(staged) + ' مورد انتخاب‌شده' : 'افزودن انتخاب‌شده‌ها';
    button.classList.toggle('is-ready', staged > 0);
  }

  // رانندهٔ هر خودرو فقط از کارکنان همراه همین مأموریت پر می‌شود؛ با تغییر همراهان
  // فهرست راننده‌ها هم به‌روز می‌شود و انتخاب قبلی اگر هنوز معتبر باشد حفظ می‌شود.
  function mmcRefreshDrivers(form) {
    if (!form) return;
    const crewBox = form.querySelector('[data-multi-check="crewIds"]');
    if (!crewBox) return;
    const crew = mmcChips(crewBox).map(function (chip) { return String(chip.dataset.mmcChip); });
    Array.prototype.forEach.call(form.querySelectorAll('[data-driver-box] select'), function (select) {
      const previous = String(select.value || '');
      select.innerHTML = '<option value="">انتخاب راننده از کارکنان مأموریت…</option>' + crewOptionsMarkup(crew, previous);
      select.value = crew.indexOf(previous) >= 0 ? previous : '';
      const box = select.closest('[data-driver-box]');
      if (box) box.classList.toggle('is-empty', !crew.length);
    });
  }

  function mmcAddStaged(box) {
    const form = box.closest('[data-module-form]');
    const key = box.dataset.multiCheck;
    const chosenHost = box.querySelector('[data-mmc-chosen]');
    const driversHost = box.querySelector('[data-mmc-drivers-box]');
    const driversFrom = box.dataset.mmcDrivers;
    const picked = box.querySelectorAll('[data-mmc-pick]:checked');
    if (!picked.length) {
      toast('اول از فهرست، موارد مورد نظر را تیک بزن.');
      return;
    }
    const existing = mmcChips(box).map(function (chip) { return String(chip.dataset.mmcChip); });
    Array.prototype.forEach.call(picked, function (input) {
      const id = String(input.value);
      const row = input.closest('[data-mmc-row]');
      const label = row ? String(row.dataset.label || id) : id;
      input.checked = false;
      if (existing.indexOf(id) >= 0) return;
      existing.push(id);
      chosenHost.insertAdjacentHTML('beforeend', chosenChipMarkup({ key: key }, id, label));
      if (driversFrom && driversHost) driversHost.insertAdjacentHTML('beforeend', driverBoxMarkup(id, label, ''));
      if (key === driversFrom) mmcRefreshDrivers(form);
    });
    mmcRefresh(box);
    if (driversFrom) mmcRefreshDrivers(form);
    if (box.dataset.mmcDrivers) mmcRefreshDrivers(form);
  }

  // بعد از هر رندر، شمارنده‌ها و فهرست راننده‌ها با مقادیر فعلی هم‌تراز می‌شوند.
  function initMultiChecks(scope) {
    Array.prototype.forEach.call((scope || document).querySelectorAll('[data-multi-check]'), function (box) {
      mmcRefresh(box);
    });
    Array.prototype.forEach.call((scope || document).querySelectorAll('[data-module-form]'), function (form) {
      if (form.querySelector('[data-driver-box]')) mmcRefreshDrivers(form);
    });
  }

  function mmcRemove(box, id) {
    const form = box.closest('[data-module-form]');
    mmcChips(box).forEach(function (chip) {
      if (String(chip.dataset.mmcChip) !== String(id)) return;
      chip.remove();
    });
    const driverBox = box.querySelector('[data-driver-box="' + String(id).replace(/"/g, '') + '"]');
    if (driverBox) driverBox.remove();
    mmcRefresh(box);
    if (form) mmcRefreshDrivers(form);
  }

  document.addEventListener('input', function (event) {
    const search = event.target.closest && event.target.closest('[data-mmc-search]');
    if (!search) return;
    const box = search.closest('[data-multi-check]');
    // ارقام فارسی/عربی هم مثل لاتین دیده می‌شوند تا جستجو با هر صفحه‌کلیدی جواب بدهد.
    const normalize = function (text) {
      return String(text || '').replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
        .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
        .trim().toLocaleLowerCase();
    };
    const term = normalize(search.value);
    Array.prototype.forEach.call(box.querySelectorAll('[data-mmc-row]'), function (row) {
      row.hidden = !!term && normalize(row.dataset.label).indexOf(term) < 0;
    });
  });

  document.addEventListener('change', function (event) {
    const pick = event.target.closest && event.target.closest('[data-mmc-pick]');
    if (!pick) return;
    const box = pick.closest('[data-multi-check]');
    if (box) mmcRefreshAddLabel(box);
  });

  document.addEventListener('click', function (event) {
    const add = event.target.closest && event.target.closest('[data-mmc-add]');
    if (add) {
      event.preventDefault();
      mmcAddStaged(add.closest('[data-multi-check]'));
      return;
    }
    const remove = event.target.closest && event.target.closest('[data-mmc-remove]');
    if (remove) {
      event.preventDefault();
      const box = remove.closest('[data-multi-check]');
      if (box) mmcRemove(box, remove.dataset.mmcRemove);
      return;
    }
    const clear = event.target.closest && event.target.closest('[data-mmc-clear]');
    if (clear) {
      event.preventDefault();
      const box = clear.closest('[data-multi-check]');
      if (!box) return;
      box.querySelectorAll('[data-mmc-chosen] [data-mmc-chip]').forEach(function (chip) { chip.remove(); });
      box.querySelectorAll('[data-driver-box]').forEach(function (node) { node.remove(); });
      mmcRefresh(box);
      mmcRefreshDrivers(box.closest('[data-module-form]'));
    }
  });

  // دکمه‌های کم/زیاد کنار کادرهای عددی؛ بازهٔ مجاز همان min و max خود کادر است.
  function stepNumberInput(input, direction) {
    const min = input.min === '' ? null : Number(input.min);
    const max = input.max === '' ? null : Number(input.max);
    const size = Number(input.step) || 1;
    const typed = persianDigitsToLatin(String(input.value || '')).trim();
    let current = typed === '' ? null : Number(typed);
    if (current == null || !Number.isFinite(current)) {
      current = min == null ? 0 : (direction > 0 ? min - size : min);
    }
    let next = current + direction * size;
    if (min != null && next < min) next = min;
    if (max != null && next > max) next = max;
    next = Math.round(next * 1000) / 1000;
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  document.addEventListener('click', function (event) {
    const button = event.target.closest && event.target.closest('[data-number-step]');
    if (!button) return;
    event.preventDefault();
    const box = button.closest('.module-number');
    const input = box && box.querySelector('input');
    if (!input) return;
    stepNumberInput(input, Number(button.dataset.numberStep) > 0 ? 1 : -1);
  });

  document.addEventListener('change', async function (event) {
    const colorInput = event.target.closest('[data-line-color]');
    if (!colorInput) return;
    const line = colorInput.dataset.lineColor || '';
    const refs = appData.references;
    if (!refs.lineColors || typeof refs.lineColors !== 'object') refs.lineColors = {};
    refs.lineColors[line] = String(colorInput.value || '');
    if (await saveState()) {
      const section = document.getElementById('sectionView');
      const holder = section && section.querySelector('[data-station-map]');
      if (holder) drawStationLines(holder);
    }
  });

  // بستن کارت اطلاعات با کلیک بیرون از پنجره.
  document.addEventListener('click', function (event) {
    if (!event.target.closest('[data-station-info]')) return;
    if (event.target.closest('.atlas-modal')) return;
    closeStationInfo();
  });

  // ── ثبت سریع داشبورد ──────────────────────────────────────────────────────
  // دکمه‌های «ثبت سریع» از همین فهرست ساخته می‌شوند؛ ترتیب و نمایش هر دکمه در
  // تنظیمات › «ثبت سریع داشبورد» تعیین می‌شود و در settings.quickAdd ذخیره می‌گردد.
  const QUICK_ADD_CATALOG = [
    { id:'employees', label:'کارمند', tone:'info', view:'employees', icon:'employees' },
    { id:'leaves', label:'مرخصی', tone:'ok', view:'leaves', icon:'leaves' },
    { id:'missions', label:'مأموریت', tone:'special', view:'missions', icon:'missions' },
    { id:'notes', label:'یادداشت', tone:'warn', view:'notes', icon:'notes' },
    { id:'programs', label:'برنامه', tone:'accent', view:'programs', icon:'programs' },
    { id:'maintenance', label:'سرویس خودرو', tone:'ok', view:'maintenance', icon:'maintenance' },
    { id:'faults', label:'اشکال خودرو', tone:'danger', view:'faults', preset:{ assetType:'خودرو' }, icon:'faults' },
    { id:'stations', label:'ایستگاه / مرکز', tone:'info', view:'stations', icon:'stations' },
    { id:'gaslogs', label:'سابقهٔ گازسنج', tone:'highlight', view:'gaslogs', preset:{ logType:'ثبت قرائت' }, icon:'gaslogs' },
    { id:'vehicles', label:'خودرو', tone:'info', view:'vehicles', icon:'vehicles' },
    { id:'gasmeters', label:'گازسنج', tone:'highlight', view:'gasmeters', icon:'gasmeters' }
  ];
  const QUICK_ADD_DEFAULT = ['employees','leaves','missions','notes','programs','maintenance','faults','stations','gaslogs'];

  function quickAddCatalogItem(id) {
    return QUICK_ADD_CATALOG.filter(function (item) { return item.id === id; })[0] || null;
  }

  function quickAddState() {
    const settings = appData.settings || {};
    const stored = Array.isArray(settings.quickAdd) ? settings.quickAdd : null;
    const out = [];
    const seen = {};
    (stored || []).forEach(function (entry) {
      const id = typeof entry === 'string' ? entry : (entry && entry.id);
      if (!id || seen[id] || !quickAddCatalogItem(id)) return;
      seen[id] = true;
      out.push({ id: id, enabled: typeof entry === 'string' ? true : entry.enabled !== false });
    });
    QUICK_ADD_CATALOG.forEach(function (item) {
      if (seen[item.id]) return;
      out.push({ id: item.id, enabled: stored ? false : QUICK_ADD_DEFAULT.indexOf(item.id) >= 0 });
    });
    return out;
  }

  async function saveQuickAddState(items) {
    appData.settings.quickAdd = items.map(function (item) { return { id: item.id, enabled: !!item.enabled }; });
    renderQuickAdd();
    return saveState();
  }

  function quickAddButtonMarkup(item) {
    const def = quickAddCatalogItem(item.id);
    if (!def) return '';
    return '<button type="button" class="quick-add-btn" data-quick-add="' + esc(def.view) + '" data-qa-id="' + esc(def.id) + '" data-tone="' + esc(def.tone) + '"' +
      (def.preset ? ' data-preset=\'' + JSON.stringify(def.preset) + '\'' : '') + '>' +
      '<span class="quick-add-icon">' + (window.atlasIcon ? window.atlasIcon(def.icon) : '') + '</span><span>' + esc(def.label) + '</span></button>';
  }

  function renderQuickAdd() {
    const grid = document.querySelector('#dashboardQuickAdd .quick-add-grid');
    if (!grid) return;
    const enabled = quickAddState().filter(function (item) { return item.enabled; });
    grid.innerHTML = enabled.length
      ? enabled.map(quickAddButtonMarkup).join('')
      : '<p class="quick-add-empty">هیچ دکمهٔ ثبت سریعی فعال نیست. از تنظیمات › «ثبت سریع داشبورد» یکی را روشن کن.</p>';
  }

  function quickAddEditorMarkup() {
    const items = quickAddState();
    const enabledCount = items.filter(function (item) { return item.enabled; }).length;
    return '<section class="module-list-panel"><div class="module-list-head"><div><h3>دکمه‌های ثبت سریع داشبورد</h3>' +
      '<p>هر دکمه‌ای را که می‌خواهی روی نوار «ثبت سریع» داشبورد ببینی روشن کن؛ با ↑ و ↓ جای آن را عوض کن. ترتیب همین فهرست، ترتیب دکمه‌ها روی داشبورد است.</p></div>' +
      '<div class="module-list-tools"><span class="module-tag">' + faDigits(enabledCount) + ' از ' + faDigits(items.length) + ' فعال</span>' +
      '<button type="button" class="secondary-btn" data-qa-reset>بازنشانی پیش‌فرض</button></div></div>' +
      '<div class="qa-list" data-qa-list>' + items.map(function (item, index) {
        const def = quickAddCatalogItem(item.id);
        return '<div class="qa-row' + (item.enabled ? '' : ' is-off') + '" data-qa-row="' + esc(item.id) + '">' +
          '<label class="qa-main"><input type="checkbox" data-qa-toggle="' + esc(item.id) + '"' + (item.enabled ? ' checked' : '') + '>' +
          '<span class="qa-label">' + esc(def.label) + '</span></label>' +
          '<div class="qa-actions">' +
            '<button type="button" class="qa-btn" data-qa-up="' + esc(item.id) + '" aria-label="بالا"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button type="button" class="qa-btn" data-qa-down="' + esc(item.id) + '" aria-label="پایین"' + (index === items.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '</div></div>';
      }).join('') + '</div>' +
      '<p class="module-field-hint">دکمه‌های خاموش از داشبورد برداشته می‌شوند ولی همین‌جا می‌مانند تا هر وقت خواستی دوباره روشنشان کنی.</p>' +
      '</section>';
  }

  document.addEventListener('click', function (event) {
    const quick = event.target.closest('[data-quick-add]');
    if (!quick) return;
    const view = quick.dataset.quickAdd;
    if (!view || !specs[view]) return;
    let preset = null;
    try { preset = quick.dataset.preset ? JSON.parse(quick.dataset.preset) : null; } catch (error) { preset = null; }
    if (view === 'faults') { preset = Object.assign({ reportedAt: todayIso() }, preset || {}); faultFormScope = 'vehicle'; }
    if (view === 'gaslogs' || view === 'maintenance') preset = Object.assign({ date: todayIso() }, preset || {});
    formState[view] = { open:true, id:null, preset:preset };
    // فرم روی همان صفحه‌ای باز می‌شود که دکمهٔ ثبت سریع در آن است؛ مسیر و منوی فعال جابه‌جا نمی‌شود.
    clearDetachedModals();
    document.body.insertAdjacentHTML('beforeend', renderForm(view, appData));
    enhanceJalaliInputs(document.body);
    const first = document.querySelector('[data-modal-backdrop] [name]');
    if (first) first.focus();
  });

  // ── اقدام‌های دفتر اشکالات، دفتر گازسنج و دفتر سرویس ──
  document.addEventListener('click', async function (event) {
    const faultBtn = event.target.closest('[data-fault-action]');
    if (faultBtn) {
      const action = faultBtn.dataset.faultAction;
      const section = document.getElementById('sectionView');
      if (action === 'filter') { faultFilter = faultBtn.dataset.status || 'all'; setVehicleTab('board'); renderFaults(section); return; }
      const record = (appData.faults || []).find(function (item) { return String(item.id) === String(faultBtn.dataset.fault); });
      if (!record) return;
      if (action === 'add-step') {
        const input = section.querySelector('[data-fault-step-input="' + record.id + '"]');
        const text = String(input && input.value || '').trim();
        if (!text) { if (input) input.focus(); return; }
        const entry = formatJalali(new Date().toISOString(), false) + ' | ' + text;
        record.steps = [String(record.steps || '').trim(), entry].filter(Boolean).join('\n');
        record.updatedAt = new Date().toISOString();
        if (await saveState()) { renderVehicles(section); refreshDashboard(); toast('اقدام به روند رفع اضافه شد.'); }
        return;
      }
      if (action === 'resolve') {
        if (!(await askConfirm({ title: 'رفع کامل اشکال', message: 'این اشکال «رفع شد» علامت بخورد؟ وضعیت روی «رفع شد» و پیشرفت روی ۱۰۰٪ تنظیم می‌شود.', confirmLabel: 'رفع شد' }))) return;
        const entry = formatJalali(new Date().toISOString(), false) + ' | رفع کامل و بستن مورد';
        record.status = 'رفع شد';
        record.progress = 100;
        record.resolvedAt = todayIso();
        record.steps = [String(record.steps || '').trim(), entry].filter(Boolean).join('\n');
        record.updatedAt = new Date().toISOString();
        addHistory('faults', record, 'رفع شد', [{ field: 'وضعیت', before: 'باز', after: 'رفع شد' }]);
        if (await saveState()) { renderVehicles(section); refreshDashboard(); toast('اشکال رفع شد و از اعلان‌ها خارج شد.'); }
        return;
      }
      return;
    }

    const gasBtn = event.target.closest('[data-gas-action]');
    if (gasBtn && gasBtn.dataset.gasAction === 'log') {
      const meter = (appData.gasmeters || []).find(function (item) { return String(item.id) === String(gasBtn.dataset.gas); });
      if (!meter) return;
      formState.gaslogs = { open:true, id:null, preset:{ gasmeterId:String(meter.id), date:todayIso(), location:meter.location || '' } };
      document.body.insertAdjacentHTML('beforeend', renderForm('gaslogs', appData));
      enhanceJalaliInputs(document.body);
      const first = document.querySelector('[data-modal-backdrop] [name="logType"]');
      if (first) first.focus();
      return;
    }

    const faultNew = event.target.closest('[data-fault-new]');
    if (faultNew) {
      const vehicleId = String(faultNew.dataset.vehicle || '');
      faultFormScope = 'vehicle';
      formState.faults = { open:true, id:null, preset:{ assetType:'خودرو', vehicleId:vehicleId, reportedAt:todayIso() } };
      document.body.insertAdjacentHTML('beforeend', renderForm('faults', appData));
      enhanceJalaliInputs(document.body);
      const first = document.querySelector('[data-modal-backdrop] [name="title"]');
      if (first) first.focus();
      return;
    }

    const serviceBtn = event.target.closest('[data-service-action]');
    if (serviceBtn) {
      const section = document.getElementById('sectionView');
      const vehicleId = serviceBtn.dataset.vehicle || '';
      if (serviceBtn.dataset.serviceAction === 'add') {
        formState.maintenance = { open:true, id:null, preset:{ vehicleId:String(vehicleId), date:todayIso() } };
        document.body.insertAdjacentHTML('beforeend', renderForm('maintenance', appData));
        enhanceJalaliInputs(document.body);
        return;
      }
    }
  });

  // زیرتب‌ها، باز کردن سابقهٔ یک دستگاه و خروجی‌های اختصاصی همین بخش.
  document.addEventListener('click', function (event) {
    const section = document.getElementById('sectionView');
    const vehicleTabBtn = event.target.closest('[data-vehicle-tab]');
    if (vehicleTabBtn) {
      setVehicleTab(vehicleTabBtn.dataset.vehicleTab);
      renderVehicles(section);
      return;
    }
    const entityOpen = event.target.closest('[data-vtab-open]');
    if (entityOpen) {
      if (vehicleTab === 'service') serviceVehicleId = entityOpen.dataset.vtabOpen || '';
      else { vehicleTab = 'history'; faultVehicleId = entityOpen.dataset.vtabOpen || ''; }
      renderVehicles(section);
      if (section) section.scrollIntoView({ block: 'start' });
      return;
    }
    if (event.target.closest('[data-vtab-back]')) {
      faultVehicleId = '';
      serviceVehicleId = '';
      renderVehicles(section);
      return;
    }
    const tab = event.target.closest('[data-gas-tab]');
    if (tab) {
      setGasTab(tab.dataset.gasTab);
      renderGasRegistry(section);
      return;
    }
    const open = event.target.closest('[data-gaslog-open]');
    if (open) {
      gasTab = 'logs';
      gasLogMeterId = open.dataset.gaslogOpen || '';
      renderGasRegistry(section);
      if (section) section.scrollIntoView({ block: 'start' });
      return;
    }
    if (event.target.closest('[data-gaslog-back]')) {
      gasLogMeterId = '';
      renderGasRegistry(section);
      return;
    }
    const custom = event.target.closest('[data-export-custom]');
    if (custom) {
      const menu = custom.closest('[data-export-menu]');
      const list = menu && menu.querySelector('.module-export-list');
      if (list) list.hidden = true;
      const format = custom.dataset.format || 'csv';
      const kind = custom.dataset.exportCustom;
      if (kind === 'gaslogs-registry') {
        runExport(gasRegistryExportRows(), 'سوابق گازسنج‌ها · ATLAS SHIFT', 'ATLAS-SHIFT-gaslogs-registry-' + todayIso(), format);
      } else if (kind === 'gaslogs-meter') {
        const meter = (appData.gasmeters || []).find(function (item) { return String(item.id) === String(custom.dataset.gas); });
        if (!meter) return;
        runExport(gasMeterExportRows(meter), 'سوابق ' + gasMeterName(meter) + ' · ATLAS SHIFT', 'ATLAS-SHIFT-gaslogs-' + exportSlug(meter.code, meter.id) + '-' + todayIso(), format);
      } else if (kind === 'shifts') {
        runExport(shiftPrintRows(), 'برنامهٔ شیفت‌ها · ATLAS SHIFT', 'ATLAS-SHIFT-shifts-' + todayIso(), format);
      } else if (kind === 'service-vehicles') {
        runExport(serviceVehicleExportRows(serviceStatsByVehicle()), 'دفتر سرویس خودروها · ATLAS SHIFT', 'ATLAS-SHIFT-servicebook-vehicles-' + todayIso(), format);
      } else if (kind === 'service-vehicle') {
        const vehicleId = String(custom.dataset.vehicle || '');
        const vehicle = (appData.vehicles || []).find(function (item) { return String(item.id) === vehicleId; });
        if (!vehicle) return;
        runExport(serviceLogExportRows(serviceLogsOfVehicle(vehicle.id)), 'سوابق سرویس ' + [vehicle.name, vehicle.companyPlate].filter(Boolean).join(' · ') + ' · ATLAS SHIFT', 'ATLAS-SHIFT-servicebook-' + exportSlug(vehicle.companyPlate || vehicle.name, vehicle.id) + '-' + todayIso(), format);
      } else if (kind === 'faults-vehicles') {
        runExport(faultVehicleExportRows(faultCountsByVehicle()), 'سوابق اشکالات خودروها · ATLAS SHIFT', 'ATLAS-SHIFT-faults-vehicles-' + todayIso(), format);
      } else if (kind === 'faults-vehicle') {
        const vehicleId = String(custom.dataset.vehicle || '');
        const vehicle = (appData.vehicles || []).find(function (item) { return String(item.id) === vehicleId; });
        const list = vehicleId === '__none__' ? orphanFaults() : faultsOfVehicle(vehicleId);
        const label = vehicle ? [vehicle.name, vehicle.companyPlate].filter(Boolean).join(' · ') : 'بدون خودرو';
        runExport(faultDetailExportRows(list), 'سوابق اشکالات ' + label + ' · ATLAS SHIFT', 'ATLAS-SHIFT-faults-' + exportSlug(vehicle ? (vehicle.companyPlate || vehicle.name) : '', vehicle ? vehicle.id : 'unassigned') + '-' + todayIso(), format);
      }
    }
  });

  document.addEventListener('change', function (event) {
    const faultSort = event.target.closest('[data-vtab-sort]');
    if (!faultSort) return;
    faultVehicleSort = faultSort.value;
    renderVehicles(document.getElementById('sectionView'));
  });

  document.addEventListener('change', function (event) {
    const section = document.getElementById('sectionView');
    const vehicleSort = event.target.closest('[data-service-sort]');
    if (vehicleSort) { serviceVehicleSort = vehicleSort.value; renderVehicles(section); return; }
    const logSort = event.target.closest('[data-service-log-sort]');
    if (logSort) { serviceLogSort = logSort.value; renderVehicles(section); }
  });

  document.addEventListener('change', function (event) {
    const sort = event.target.closest('[data-gaslog-sort]');
    if (!sort) return;
    gasLogSort = sort.value;
    renderGasRegistry(document.getElementById('sectionView'));
  });

  document.addEventListener('change', function (event) {
    const filter = event.target.closest('[data-gas-filter]');
    if (!filter) return;
    gasFilter[filter.dataset.gasFilter] = filter.value;
    renderGasRegistry(document.getElementById('sectionView'));
  });

  // ── ایستگاه‌ها و مراکز: نقشهٔ شماتیک خطوط با جایگاه قابل کشیدن ──
  const STATION_TONES = ['info', 'ok', 'special', 'warn', 'accent', 'highlight'];
  const STATION_LINE_COLORS = ['#5b8def', '#2fbf71', '#b06bff', '#ffb020', '#ff6b6b', '#00c2c7'];

  function stationRecords() { return (appData.stations || []).slice(); }

  function stationTitle(record) { return String((record && (record.name || record.place)) || 'ایستگاه / مرکز'); }

  function stationLabel(record) {
    return [record && record.name, record && record.placeType].filter(Boolean).join(' · ') || 'ایستگاه / مرکز';
  }

  function stationCoord(value) {
    const text = String(value == null ? '' : value).trim();
    if (!text) return NaN;
    return Number(text);
  }

  function stationClamp(value) { return Math.min(100, Math.max(0, value)); }

  function branchPlacement(branch) {
    const x = stationCoord(branch && branch.x);
    const y = stationCoord(branch && branch.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x: stationClamp(x), y: stationClamp(y) } : null;
  }

  // ترتیب روی هر شاخه فقط با اعداد طبیعی تعیین می‌شود؛ مقدار حرفی یا صفر معتبر نیست.
  function stationOrderValue(value) {
    const order = Number(value);
    return Number.isFinite(order) && order >= 1 ? Math.floor(order) : 1e6;
  }

  function branchOrderValue(branch) { return stationOrderValue(branch && branch.order); }

  // یک مکان می‌تواند روی چند خط یا شاخه باشد و برای هر شاخه ترتیب و جایگاه جدا داشته باشد.
  function stationBranches(record) {
    const list = Array.isArray(record.branches)
      ? record.branches.filter(function (branch) { return branch && typeof branch === 'object'; })
      : [];
    if (list.length) {
      return list.map(function (branch, index) {
        return { line: String(branch.line || 'خط اصلی'), order: branch.order, x: branch.x, y: branch.y, index: index };
      });
    }
    return [{ line: String(record.line || 'خط اصلی'), order: record.order, x: record.mapX, y: record.mapY, index: 0 }];
  }

  function stationGroups(records) {
    const groups = {};
    records.forEach(function (record) {
      stationBranches(record).forEach(function (branch) {
        const key = String(branch.line || 'خط اصلی');
        (groups[key] = groups[key] || []).push({ record: record, branch: branch });
      });
    });
    return Object.keys(groups).map(function (key) {
      return {
        key: key,
        stops: groups[key].slice().sort(function (a, b) {
          const diff = branchOrderValue(a.branch) - branchOrderValue(b.branch);
          return diff || stationTitle(a.record).localeCompare(stationTitle(b.record), 'fa');
        })
      };
    });
  }

  function stationStopKey(stop) { return String(stop.record.id) + '::' + String(stop.branch.index); }

  function stationAutoPosition(index, total) {
    if (total <= 1) return { x: 50, y: 50 };
    return { x: Number((8 + (84 * index) / (total - 1)).toFixed(1)), y: index % 2 ? 64 : 36 };
  }

  function stationPositions(groups) {
    const positions = {};
    groups.forEach(function (group) {
      group.stops.forEach(function (stop, index) {
        positions[stationStopKey(stop)] = branchPlacement(stop.branch) || stationAutoPosition(index, group.stops.length);
      });
    });
    return positions;
  }

  function stationTone(record) {
    const status = String(record.status || '');
    if (/خارج|غیرفعال|تعمیر/.test(status)) return 'danger';
    if (/نیمه|انتظار/.test(status)) return 'warn';
    if (/سرویس|فعال/.test(status)) return 'ok';
    return 'info';
  }

  function stationLineColor(line) {
    const colors = (appData.references && appData.references.lineColors) || {};
    const value = String(colors[line] || '');
    return /^#[0-9a-f]{6}$/i.test(value) ? value : '';
  }

  function stationLineFallbackColor(index) { return STATION_LINE_COLORS[index % STATION_LINE_COLORS.length]; }

  function stationLineMarkup(groups, positions) {
    return groups.map(function (group, index) {
      const points = group.stops.map(function (stop) {
        const point = positions[stationStopKey(stop)];
        return point.x + ',' + point.y;
      }).join(' ');
      const color = stationLineColor(group.key) || stationLineFallbackColor(index);
      return '<polyline class="station-line" data-tone="' + STATION_TONES[index % STATION_TONES.length] +
        '" stroke="' + esc(color) + '" points="' + points + '"></polyline>';
    }).join('');
  }

  function stationNodeMarkup(groups, positions) {
    return groups.map(function (group) {
      return group.stops.map(function (stop) {
        const point = positions[stationStopKey(stop)];
        const order = branchOrderValue(stop.branch);
        return '<button type="button" class="station-node" data-station-id="' + esc(stop.record.id) + '" data-branch-index="' + esc(stop.branch.index) +
          '" data-tone="' + stationTone(stop.record) + '" style="left:' + point.x + '%;top:' + point.y + '%" aria-label="' + esc(stationTitle(stop.record)) +
          (order < 1e6 ? ' — ترتیب ' + esc(order) : '') + '">' +
          '<span class="station-node-dot"></span>' +
          '<span class="station-node-text">' + esc(stationTitle(stop.record)) + '</span>' +
          (order < 1e6 ? '<span class="station-node-order">ترتیب ' + faDigits(order) + '</span>' : '') +
          '</button>';
      }).join('');
    }).join('');
  }

  function stationMapInner(records) {
    const groups = stationGroups(records);
    const positions = stationPositions(groups);
    return '<svg class="station-map-canvas" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
      stationLineMarkup(groups, positions) + '</svg>' +
      (groups.length ? stationNodeMarkup(groups, positions)
        : '<div class="station-map-empty">هنوز ایستگاه یا مرکزی ثبت نشده است. با «+ ثبت ایستگاه / مرکز» شروع کنید.</div>');
  }

  function stationLegendMarkup(groups) {
    if (!groups.length) return '';
    const items = groups.map(function (group, index) {
      const color = stationLineColor(group.key) || stationLineFallbackColor(index);
      return '<span class="station-legend-item" data-tone="' + STATION_TONES[index % STATION_TONES.length] + '">' +
        '<input type="color" class="station-line-color" data-line-color="' + esc(group.key) + '" value="' + esc(color) +
        '" aria-label="رنگ ' + esc(group.key) + '" title="رنگ خط را تغییر بده">' +
        esc(group.key) + ' <small>(' + faDigits(group.stops.length) + ')</small></span>';
    }).join('');
    return '<div class="station-legend">' + items + '</div>' +
      '<div class="station-legend-hint">برای تغییر رنگ هر خط، روی نمونه‌رنگ همان خط بزن. ضخامت خطوط نمایشی بیشتر شده است.</div>';
  }

  function stationMapMarkup(records) {
    const groups = stationGroups(records);
    const hasBackup = !!(appData.settings && appData.settings.stationLayoutBackup);
    return '<section class="station-map-panel">' +
      '<div class="station-map-head"><div><h3>نقشهٔ شماتیک خطوط و مراکز</h3>' +
      '<p>هر مکان می‌تواند روی چند خط یا شاخه باشد. برای جابه‌جایی گره را بکش؛ برای دیدن اطلاعات کامل، روی آن بزن.</p></div>' +
      '<div class="station-map-tools">' +
      '<button type="button" class="secondary-btn" data-station-action="auto">چیدمان خودکار</button>' +
      (hasBackup ? '<button type="button" class="secondary-btn" data-station-action="restore-layout">بازگشت به چیدمان دستی</button>' : '') +
      '<button type="button" class="primary-btn" data-station-action="add">+ ثبت ایستگاه / مرکز</button>' +
      '</div></div>' +
      '<div class="station-map" data-station-map>' + stationMapInner(records) + '</div>' +
      stationLegendMarkup(groups) +
      '</section>';
  }

  function stationPlaceTypeBlock(type) {
    const places = placesForType(type);
    return '<div class="station-place-group"><div class="station-place-head"><strong>' + esc(type) + '</strong>' +
      '<span>' + faDigits(places.length) + ' مکان</span>' +
      '<button type="button" class="secondary-btn" data-station-action="place-add" data-type="' + esc(type) + '">+ مکان</button></div>' +
      '<div class="station-place-list">' +
      (places.length ? places.map(function (place) {
        return '<span class="station-place-chip">' + esc(place) +
          '<button type="button" data-station-action="place-edit" data-type="' + esc(type) + '" data-place="' + esc(place) + '" aria-label="تغییر نام مکان">✎</button>' +
          '<button type="button" data-station-action="place-delete" data-type="' + esc(type) + '" data-place="' + esc(place) + '" aria-label="حذف مکان">×</button></span>';
      }).join('') : '<span class="station-place-empty">هنوز مکانی ثبت نشده است.</span>') +
      '</div></div>';
  }

  function stationPlaceTypes() {
    const fromRefs = Array.isArray(appData.references.placeTypes) ? appData.references.placeTypes : [];
    if (fromRefs.length) return fromRefs.slice();
    const field = (specs.stations.fields || []).filter(function (item) { return item.key === 'placeType'; })[0];
    return field && Array.isArray(field.options) ? field.options.slice() : [];
  }

  function stationPlacesPanel() {
    const types = stationPlaceTypes();
    return '<section class="station-places-panel">' +
      '<div class="station-map-head"><div><h3>مدیریت مکان‌ها</h3>' +
      '<p>هر مکان زیرمجموعهٔ یک «نوع محل» است؛ افزودن، تغییر نام و حذف از همین‌جا انجام می‌شود و در فرم ثبت ایستگاه قابل انتخاب است.</p></div>' +
      '<div class="station-map-tools"><button type="button" class="secondary-btn" data-station-action="place-add-type">+ نوع محل</button></div></div>' +
      '<div class="station-place-grid">' +
      (types.length ? types.map(stationPlaceTypeBlock).join('') : '<div class="module-empty">ابتدا در تنظیمات یک «نوع محل» بساز.</div>') +
      '</div></section>';
  }

  // پیشنهاد نام رئیس: مخاطبان دفترچه تلفن، کارمندان و نام‌های ثبت‌شده در ایستگاه‌ها.
  function stationChiefSuggestions(data) {
    const source = data && data.stations ? data : appData;
    const names = [];
    const push = function (value) {
      const name = String(value == null ? '' : value).trim();
      if (name && names.indexOf(name) < 0) names.push(name);
    };
    stationPhonebookContacts().forEach(function (contact) { push(contact && contact.name); });
    (source.employees || []).forEach(function (person) { push(employeeName(person)); });
    (source.stations || []).forEach(function (station) { push(station && station.personInCharge); });
    return names.sort(function (a, b) { return a.localeCompare(b, 'fa'); });
  }

  function stationPhonebookContacts() {
    const keys = ['atlasShiftPhonebookV2', 'atlas-shift-phonebook', 'atlasShiftPhonebookV1'];
    for (let i = 0; i < keys.length; i += 1) {
      try {
        const raw = localStorage.getItem(keys[i]);
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (Array.isArray(data)) return data.filter(function (item) { return item && typeof item === 'object'; });
      } catch (error) { /* فهرست بعدی را امتحان کن */ }
    }
    return [];
  }

  function contactPhones(contact) {
    const out = [];
    const push = function (label, value, prefix) {
      const text = String(value == null ? '' : value).trim();
      if (text) out.push({ label: label, value: text, prefix: String(prefix || '').trim() });
    };
    if (Array.isArray(contact.phoneNumbers)) {
      contact.phoneNumbers.forEach(function (phone) {
        if (!phone || typeof phone !== 'object') return;
        push(phone.label || (phone.kind === 'mobile' ? 'موبایل' : 'تلفن'), phone.value || phone.number, phone.prefix);
      });
    }
    if (Array.isArray(contact.numbers)) {
      contact.numbers.forEach(function (phone) {
        if (Array.isArray(phone)) push(phone[0] || 'تلفن', phone[1], '');
        else if (phone && typeof phone === 'object') push(phone.label || phone.type || 'تلفن', phone.value || phone.number, phone.prefix);
      });
    }
    if (!out.length) {
      push('موبایل', contact.mobile || contact.mobileNumber, '');
      push('تلفن دفتر', contact.officePhone || contact.office, '');
      push('داخلی', contact.extension || contact.shortNumber, '');
    }
    return out;
  }

  function contactMatchesStation(contact, record) {
    const names = [record.name, record.place, record.city].filter(Boolean).map(String);
    const fields = [contact.station, contact.transferCenter, contact.complex, contact.unit].filter(Boolean).map(String);
    return names.some(function (name) { return fields.indexOf(name) >= 0; });
  }

  function stationInfoBlock(title, inner) {
    if (!inner) return '';
    return '<section class="station-info-block"><h4>' + esc(title) + '</h4><div class="station-info-body">' + inner + '</div></section>';
  }

  function stationInfoRow(label, value) {
    const text = String(value == null ? '' : value).trim();
    if (!text) return '';
    return '<div class="station-info-row">' + (label ? '<span>' + esc(label) + '</span>' : '') + '<b>' + esc(text) + '</b></div>';
  }

  function stationInfoMarkup(record, allowEdit) {
    if (!record) return '';
    const contacts = stationPhonebookContacts().filter(function (contact) { return contactMatchesStation(contact, record); });
    const chiefContact = contacts.filter(function (contact) { return /رئیس|مدیر|سرپرست/.test(String(contact.position || '')); })[0];
    const chief = String(record.personInCharge || '').trim() || String((chiefContact && chiefContact.name) || '').trim();

    const groups = stationGroups(stationRecords());
    const neighbourLines = stationBranches(record).map(function (branch) {
      const group = groups.filter(function (entry) { return entry.key === String(branch.line || 'خط اصلی'); })[0];
      if (!group) return '';
      let index = -1;
      group.stops.forEach(function (stop, position) {
        if (index < 0 && String(stop.record.id) === String(record.id) && String(stop.branch.index) === String(branch.index)) index = position;
      });
      if (index < 0) return '';
      const distances = Array.isArray(record.distances) ? record.distances : [];
      const distanceTo = function (stop) {
        if (!stop) return '';
        const city = String(stop.record.city || '').trim();
        if (!city) return '';
        const match = distances.filter(function (row) { return String(row.city || '') === city; })[0];
        return match && match.km ? faDigits(match.km) + ' کیلومتر' : '';
      };
      const parts = [];
      if (index > 0) {
        const previous = group.stops[index - 1];
        parts.push('قبلی: ' + stationTitle(previous.record) + (distanceTo(previous) ? ' · ' + distanceTo(previous) : ''));
      }
      if (index < group.stops.length - 1) {
        const next = group.stops[index + 1];
        parts.push('بعدی: ' + stationTitle(next.record) + (distanceTo(next) ? ' · ' + distanceTo(next) : ''));
      }
      if (!parts.length) return '';
      const order = branchOrderValue(branch);
      return '<div class="station-info-line"><b>' + esc(branch.line || 'خط اصلی') + '</b>' +
        (order < 1e6 ? ' <small>ترتیب ' + faDigits(order) + '</small>' : '') +
        '<span>' + esc(parts.join(' — ')) + '</span></div>';
    }).filter(Boolean).join('');

    const hasRow = function (row) {
      return Object.keys(row || {}).some(function (key) { return String(row[key] == null ? '' : row[key]).trim() !== ''; });
    };

    const products = (Array.isArray(record.products) ? record.products : []).filter(hasRow);
    const sizes = [];
    products.forEach(function (row) {
      const size = String(row.size || '').trim();
      if (size && sizes.indexOf(size) < 0) sizes.push(size);
    });
    const linesSummary = sizes.length
      ? stationInfoRow('خطوط عبوری', faDigits(sizes.length) + ' سایز · ' + sizes.join('، ') + ' اینچ')
      : '';
    const productsText = products.map(function (row) {
      const facts = [row.product, row.size ? row.size + ' اینچ' : '', row.line].filter(Boolean);
      return '<div class="station-info-chip">' + esc(facts.join(' · ')) + '</div>';
    }).join('');

    const tanks = (Array.isArray(record.tanks) ? record.tanks : []).filter(hasRow);
    let tankTotal = 0;
    tanks.forEach(function (row) { tankTotal += Number(row.count) || 0; });
    const tanksText = tanks.length
      ? stationInfoRow('تعداد کل مخازن', faDigits(tankTotal || tanks.length)) + tanks.map(function (row) {
        const facts = [
          row.product,
          row.count ? 'تعداد ' + faDigits(row.count) : '',
          row.volume ? 'حجم ' + faDigits(row.volume) : '',
          row.diameter ? 'قطر ' + faDigits(row.diameter) + ' متر' : '',
          row.height ? 'ارتفاع ' + faDigits(row.height) + ' متر' : ''
        ].filter(Boolean);
        return '<div class="station-info-chip">' + esc(facts.join(' · ')) + '</div>';
      }).join('')
      : '';

    const rotating = (Array.isArray(record.rotating) ? record.rotating : []).filter(hasRow);
    const rotatingText = rotating.map(function (row) {
      const facts = [
        row.kind,
        row.model,
        row.count ? faDigits(row.count) + ' دستگاه' : '',
        row.power ? 'توان ' + faDigits(row.power) + ' کیلووات' : ''
      ].filter(Boolean);
      return '<div class="station-info-chip">' + esc(facts.join(' · ')) + '</div>';
    }).join('');

    const generators = (Array.isArray(record.generators) ? record.generators : []).filter(hasRow);
    const generatorsText = generators.map(function (row) {
      const facts = [
        row.model || 'دیزل ژنراتور',
        row.count ? faDigits(row.count) + ' دستگاه' : '',
        row.power ? 'توان ' + faDigits(row.power) + ' کیلووات' : ''
      ].filter(Boolean);
      return '<div class="station-info-chip">' + esc(facts.join(' · ')) + '</div>';
    }).join('');

    const byPlace = {};

    contacts.forEach(function (contact) {
      const key = [contact.building, contact.unit].filter(Boolean).join(' / ') || 'بدون دسته‌بندی';
      (byPlace[key] = byPlace[key] || []).push(contact);
    });
    const phonesText = Object.keys(byPlace).map(function (key) {
      const people = byPlace[key].map(function (contact) {
        const phones = contactPhones(contact).map(function (phone) {
          const raw = String(phone.value || '');
          const dial = raw.replace(/[^\d+]/g, '');
          const shown = [phone.prefix, raw].filter(Boolean).join(' ');
          return '<a class="station-info-phone" href="tel:' + esc(dial) + '"' + (dial ? '' : ' aria-disabled="true"') + '>' +
            '<span>' + esc(phone.label) + '</span><b dir="ltr">' + esc(shown) + '</b></a>';
        }).join('');
        if (!phones) return '';
        return '<span class="station-info-contact"><span>' + esc(contact.name || 'مخاطب') +
          (contact.position ? ' · ' + esc(contact.position) : '') + '</span>' + phones + '</span>';
      }).filter(Boolean).join('');
      if (!people) return '';
      return '<div class="station-info-line"><b>' + esc(key) + '</b><span class="station-info-phones">' + people + '</span></div>';
    }).filter(Boolean).join('');

    const meters = gasMetersAtStation(record);
    const metersText = meters.length ? meters.map(function (meter) {
      const position = gasMeterPosition(meter);
      const where = [position.positionKind, position.positionDetail].filter(Boolean).join(': ') || position.legacyLocation || 'موقعیت ثبت نشده';
      return '<div class="station-info-gas">' +
        '<span class="station-info-gas-id"><b dir="ltr">' + esc(meter.serial || meter.code || '—') + '</b>' +
        '<small>' + esc([meter.code ? 'کد ' + meter.code : '', meter.model].filter(Boolean).join(' · ') || 'گازسنج') + '</small></span>' +
        '<span class="station-info-gas-where">' + esc(where) + '</span>' +
        (meter.status ? '<span class="station-info-gas-status">' + esc(meter.status) + '</span>' : '') +
        '</div>';
    }).join('') : '';

    const blocks = [
      stationInfoBlock('رئیس / سرپرست', stationInfoRow('نام رئیس', chief)),
      stationInfoBlock('نوع و محل', [
        stationInfoRow('نوع محل', record.placeType),
        stationInfoRow('محل مکان', record.place),
        stationInfoRow('شهر', record.city),
        stationInfoRow('آدرس', record.address),
        stationInfoRow('موقعیت جغرافیایی', record.coordinates)
      ].join('')),
      stationInfoBlock('فاصله تا شهرها', (Array.isArray(record.distances) ? record.distances : []).filter(hasRow).map(function (row) {
        return stationInfoRow(row.city || 'شهر', row.km ? faDigits(row.km) + ' کیلومتر' : '');
      }).join('')),
      stationInfoBlock('خطوط انتقالی و مراکز مجاور', neighbourLines + linesSummary),
      stationInfoBlock('فرآورده‌ها و خطوط', productsText),
      stationInfoBlock('مخازن ذخیره', tanksText),
      stationInfoBlock('تجهیزات دوار', rotatingText),
      stationInfoBlock('دیزل ژنراتورها', generatorsText),
      stationInfoBlock('گازسنج‌های مستقر در این مرکز', metersText),
      stationInfoBlock('شماره‌های تماس این محل (دفترچه تلفن)', phonesText),
      stationInfoBlock('توضیحات', record.description ? '<p class="station-info-text">' + esc(record.description) + '</p>' : '')
    ].filter(Boolean).join('');

    return '<div class="atlas-modal-backdrop station-info-backdrop" data-station-info>' +
      '<div class="atlas-modal station-info-modal" role="dialog" aria-modal="true" aria-labelledby="stationInfoTitle">' +
      '<div class="atlas-modal-head"><div><h3 id="stationInfoTitle">' + esc(stationTitle(record)) + '</h3>' +
      '<p>' + esc([record.placeType, record.place, record.city].filter(Boolean).join(' · ') || 'ایستگاه / مرکز') +
      (record.status ? ' · ' + esc(record.status) : '') + '</p></div>' +
      '<button type="button" class="atlas-modal-close" data-station-action="info-close" aria-label="بستن">×</button></div>' +
      '<div class="atlas-modal-body">' +
      (blocks || '<div class="module-empty">برای این مکان هنوز اطلاعاتی ثبت نشده است.</div>') +
      '<div class="station-info-actions">' +
      (allowEdit ? '<button type="button" class="primary-btn" data-station-action="edit" data-id="' + esc(record.id) + '">ویرایش اطلاعات</button>' : '') +
      '<button type="button" class="secondary-btn" data-station-action="info-close">بستن</button></div>' +
      '</div></div></div>';
  }

  function closeStationInfo() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-station-info]'), function (node) { node.remove(); });
  }

  // این کارت فقط خواندنی است و تنظیمات را باز نمی‌کند.
  function openStationInfo(id, allowEdit) {
    const record = (appData.stations || []).find(function (item) { return String(item.id) === String(id); });
    if (!record) return;
    closeStationInfo();
    const holder = document.createElement('div');
    holder.innerHTML = stationInfoMarkup(record, allowEdit);
    if (holder.firstElementChild) document.body.appendChild(holder.firstElementChild);
  }

  function stationSetPlacement(record, branchIndex, x, y) {
    const list = Array.isArray(record.branches) ? record.branches.slice() : [];
    if (!list.length) {
      stationBranches(record).forEach(function (branch) {
        list.push({ line: branch.line, order: branch.order, x: branch.x, y: branch.y });
      });
    }
    while (list.length <= branchIndex) list.push({ line: 'خط اصلی', order: '', x: '', y: '' });
    list[branchIndex].x = x;
    list[branchIndex].y = y;
    record.branches = list;
    record.mapX = x;
    record.mapY = y;
  }

  // خطوط را از جایگاه فعلی گره‌ها می‌کشد تا هنگام کشیدن هم زنده به‌روز شود.
  function drawStationLines(map) {
    const canvas = map.querySelector('.station-map-canvas');
    if (!canvas) return;
    const positions = {};
    Array.prototype.forEach.call(map.querySelectorAll('[data-station-id]'), function (node) {
      positions[String(node.dataset.stationId) + '::' + String(node.dataset.branchIndex || 0)] = {
        x: parseFloat(node.style.left) || 0,
        y: parseFloat(node.style.top) || 0
      };
    });
    canvas.innerHTML = stationLineMarkup(stationGroups(stationRecords()), positions);
  }

  function wireStationMap(section) {
    const map = section.querySelector('[data-station-map]');
    if (!map || map.dataset.stationBound === '1') return;
    map.dataset.stationBound = '1';
    let drag = null;
    map.addEventListener('pointerdown', function (event) {
      const node = event.target.closest('[data-station-id]');
      if (!node) return;
      drag = { node: node, id: node.dataset.stationId, branchIndex: Number(node.dataset.branchIndex || 0), x: 0, y: 0, moved: false };
      node.classList.add('is-dragging');
      try { node.setPointerCapture(event.pointerId); } catch (error) { /* optional */ }
      event.preventDefault();
    });
    map.addEventListener('pointermove', function (event) {
      if (!drag) return;
      const rect = map.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      drag.x = Math.round(Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)) * 10) / 10;
      drag.y = Math.round(Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100)) * 10) / 10;
      drag.moved = true;
      drag.node.style.left = drag.x + '%';
      drag.node.style.top = drag.y + '%';
      drawStationLines(map);
    });
    map.addEventListener('pointerup', async function () {
      if (!drag) return;
      const current = drag;
      drag = null;
      current.node.classList.remove('is-dragging');
      if (!current.moved) {
        openStationInfo(current.id, !!current.node.closest('#sectionView'));
        return;
      }
      const record = (appData.stations || []).find(function (item) { return String(item.id) === String(current.id); });
      if (!record) return;
      stationSetPlacement(record, current.branchIndex, current.x, current.y);
      record.updatedAt = new Date().toISOString();
      if (await saveState()) toast('جایگاه «' + stationTitle(record) + '» روی نقشه ذخیره شد.');
    });
    map.addEventListener('pointercancel', function () {
      if (!drag) return;
      drag.node.classList.remove('is-dragging');
      drag = null;
    });
  }

  async function stationAutoLayout() {
    const records = appData.stations || [];
    if (!records.length) { toast('ابتدا یک ایستگاه یا مرکز ثبت کنید.'); return; }
    const approved = await askConfirm({
      title: 'چیدمان خودکار نقشه',
      message: 'چیدمان دستی فعلی ذخیره می‌شود و هر زمان بخواهی می‌توانی به آن برگردی. چیدمان خودکار اعمال شود؟',
      confirmLabel: 'بله، چیدمان خودکار'
    });
    if (!approved) return;
    const backup = {};
    records.forEach(function (record) {
      backup[record.id] = {
        mapX: record.mapX,
        mapY: record.mapY,
        branches: Array.isArray(record.branches) ? JSON.parse(JSON.stringify(record.branches)) : null
      };
    });
    appData.settings.stationLayoutBackup = backup;
    stationGroups(records).forEach(function (group) {
      group.stops.forEach(function (stop, index) {
        const point = stationAutoPosition(index, group.stops.length);
        stationSetPlacement(stop.record, stop.branch.index, point.x, point.y);
        stop.record.updatedAt = new Date().toISOString();
      });
    });
    if (await saveState()) {
      render('stations', document.getElementById('sectionView'));
      toast('چیدمان خودکار اعمال شد. اگر مطلوب نبود، «بازگشت به چیدمان دستی» را بزن.');
    }
  }

  async function stationRestoreLayout() {
    const backup = appData.settings && appData.settings.stationLayoutBackup;
    if (!backup) { toast('چیدمان قبلی برای بازگردانی وجود ندارد.'); return; }
    (appData.stations || []).forEach(function (record) {
      const saved = backup[record.id];
      if (!saved) return;
      record.mapX = saved.mapX;
      record.mapY = saved.mapY;
      if (saved.branches) record.branches = JSON.parse(JSON.stringify(saved.branches));
      else delete record.branches;
      record.updatedAt = new Date().toISOString();
    });
    delete appData.settings.stationLayoutBackup;
    if (await saveState()) {
      render('stations', document.getElementById('sectionView'));
      toast('چیدمان دستی قبلی بازگردانده شد.');
    }
  }

  function renderStations(section) {
    renderCrud('stations', section);
    const summary = section.querySelector('.module-summary');
    if (summary) summary.insertAdjacentHTML('afterend', stationMapMarkup(stationRecords()));
    wireStationMap(section);
  }

  let currentView = '';

  function refreshPlaceManager() {
    const section = document.getElementById('sectionView');
    render(currentView === 'settings' ? 'settings' : 'stations', section);
  }

  function render(view, section) {
    if(!section)return;
    // رندر دوبارهٔ بخش، مارک‌آپ قبلی را حذف می‌کند؛ فهرست‌های کشویی باز هم باید بسته شوند.
    closeOpenCombos();
    currentView = view;
    prepareSection(section);
    if(!ready){
      section.innerHTML=rootWrap('<div class="module-empty">در حال آماده‌سازی اطلاعات محلی…</div>');
      return;
    }
    if(view==='programs')renderPrograms(section);
    else if(view==='vehicles')renderVehicles(section);
    else if(view==='faults'){if(vehicleTab==='registry')setVehicleTab('history');renderVehicles(section);}
    else if(view==='stations')renderStations(section);
    else if(view==='gasmeters')renderGasRegistry(section);
    else if(view==='gaslogs'){gasTab='logs';renderGasRegistry(section);}
    else if(view==='maintenance'){if(vehicleTab!=='service')setVehicleTab('service');renderVehicles(section);}
    else if(specs[view])renderCrud(view,section);
    else if(view==='reports')renderReports(section);
    else if(view==='settings')renderSettings(section);
    else{section.hidden=true;section.innerHTML='';}
    enhanceJalaliInputs(section);
    initMultiChecks(section);
    mountSectionBackup(view, section);
    if(view==='dashboard')applyDashboardLayout();
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

  // ── اعتبارسنجی فیلدهای اجباری ────────────────────────────────
  // فیلد اجباری خالی، کادر کمرنگ قرمز می‌گیرد و زیر آن پیام «فیلد مورد نظر اجباری است» می‌آید.
  function clearRequiredErrors(form) {
    Array.prototype.forEach.call(form.querySelectorAll('.module-field.is-required'), function (node) {
      node.classList.remove('is-required');
      const note = node.querySelector('[data-required-error]');
      if (note) note.remove();
    });
  }

  function requiredIsEmpty(form, field) {
    const controls = form.querySelectorAll('[name="' + field.key + '"]');
    if (!controls.length) return false;
    if (field.type === 'checks' || field.type === 'multi-check') {
      return !Array.prototype.some.call(controls, function (control) {
        return control.type === 'hidden' ? !!control.value : (control.checked && control.value);
      });
    }
    if (field.type === 'select' && field.multiple) {
      return !Array.prototype.some.call(controls[0].options || [], function (option) { return option.selected; });
    }
    return !String(controls[0].value || '').trim();
  }

  // فیلدی که فقط در برخی وضعیت‌ها اجباری می‌شود (مثلاً «شرح نتیجه» برای مأموریت انجام‌شده).
  function fieldRequired(field, record) {
    if (field.required) return true;
    const rule = field.requiredWhen;
    if (!rule) return false;
    const wanted = rule.values || [];
    const current = record ? String(record[rule.key] == null ? '' : record[rule.key]) : '';
    return !wanted.length || wanted.indexOf(current) >= 0;
  }

  function validateRequired(form, moduleKey) {
    clearRequiredErrors(form);
    const fields = formFields(moduleKey, form.dataset.faultScope === 'vehicle');
    const typeField = form.querySelector('[data-station-type]');
    const currentType = typeField ? String(typeField.value || '') : '';
    const visibleRecord = Object.assign({}, liveFormValues(form), { placeType: currentType });
    const missing = [];
    fields.forEach(function (field) {
      if (!fieldRequired(field, visibleRecord)) return;
      if (!fieldVisible(field, visibleRecord)) return;
      if (!requiredIsEmpty(form, field)) return;
      missing.push(field);
      const control = form.querySelector('[name="' + field.key + '"]');
      const wrap = control ? control.closest('.module-field') : null;
      if (!wrap) return;
      wrap.classList.add('is-required');
      const note = document.createElement('small');
      note.className = 'module-field-required';
      note.setAttribute('data-required-error', '');
      note.textContent = 'فیلد مورد نظر اجباری است.';
      wrap.appendChild(note);
    });
    // فرم با novalidate باز می‌شود تا هرگز حباب انگلیسی مرورگر جلوی ثبت را بگیرد و
    // هیچ‌چیز بی‌صدا انجام‌نشده نماند؛ پس محدودیت‌های خود کادرها (عدد، بازه، الگو)
    // هم همین‌جا با پیام فارسی بررسی می‌شوند.
    Array.prototype.forEach.call(form.querySelectorAll('[name]'), function (control) {
      if (control.type === 'hidden' || control.disabled) return;
      const field = fields.find(function (item) { return item.key === control.name; });
      if (!field || !fieldVisible(field, visibleRecord)) return;
      if (control.checkValidity()) return;
      if (missing.some(function (item) { return item.key === field.key; })) return;
      missing.push(field);
      const wrap = control.closest('.module-field');
      if (!wrap || wrap.classList.contains('is-required')) return;
      wrap.classList.add('is-required');
      const note = document.createElement('small');
      note.className = 'module-field-required';
      note.setAttribute('data-required-error', '');
      note.textContent = 'مقدار این فیلد معتبر نیست.';
      wrap.appendChild(note);
    });
    if (!missing.length) return true;
    const first = form.querySelector('.module-field.is-required [name]');
    if (first) {
      if (typeof first.focus === 'function') first.focus();
      if (typeof first.scrollIntoView === 'function') first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    toast('این موارد اجباری است: ' + missing.map(function (field) { return field.label; }).join('، '));
    return false;
  }

  document.addEventListener('input', function (event) {
    const wrap = event.target.closest && event.target.closest('.module-field.is-required');
    if (!wrap) return;
    wrap.classList.remove('is-required');
    const note = wrap.querySelector('[data-required-error]');
    if (note) note.remove();
  }, true);

  document.addEventListener('change', function (event) {
    const wrap = event.target.closest && event.target.closest('.module-field.is-required');
    if (!wrap) return;
    const filled = Array.prototype.some.call(wrap.querySelectorAll('[name]'), function (control) {
      return control.type === 'checkbox' ? control.checked : !!String(control.value || '').trim();
    });
    if (!filled) return;
    wrap.classList.remove('is-required');
    const note = wrap.querySelector('[data-required-error]');
    if (note) note.remove();
  }, true);

  async function formValues(form, moduleKey, oldRecord) {
    const fields=formFields(moduleKey, form.dataset.faultScope==='vehicle'), data={};
    const fd=new FormData(form);
    const typeField=form.querySelector('[data-station-type]');
    const currentType=typeField?String(typeField.value||''):'';
    const visibleRecord=Object.assign({},liveFormValues(form),{placeType:currentType});
    for(let i=0;i<fields.length;i+=1){
      const field=fields[i];
      if(!fieldVisible(field,visibleRecord)){
        // فیلد پنهان: اگر به‌خاطر برقرارنبودن شرطش پنهان شده، مقدارش خالی ذخیره می‌شود
        // (وگرنه با انتخاب «آلودگی: ندارد» مقادیر قبلی برمی‌گشتند و پاک نمی‌شدند).
        // پیوست‌ها و فیلدهای پنهان‌شده با «نوع محل» مقدار قبلی را نگه می‌دارند.
        const keepOld=!hiddenByDepends(field,visibleRecord);
        const fallback=field.type==='rows'?[]:((field.type==='file'||field.type==='file-multiple')
          ?(oldRecord&&oldRecord[field.key]!=null?oldRecord[field.key]:[]):'');
        data[field.key]=keepOld&&oldRecord&&oldRecord[field.key]!=null?oldRecord[field.key]:fallback;
        continue;
      }
      if(field.type==='rows'){
        const holder=form.querySelector('[data-rows-field="'+field.key+'"]');
        const rows=[];
        if(holder){
          Array.prototype.forEach.call(holder.querySelectorAll('[data-row]'),function(row){
            const item={};
            let filled=false;
            (field.columns||[]).forEach(function(column){
              const input=row.querySelector('[data-col="'+column.key+'"]');
              const raw=String(input&&input.value||'').trim();
              item[column.key]=raw;
              if(raw)filled=true;
            });
            if(filled)rows.push(item);
          });
        }
        data[field.key]=rows;
      }else if(field.type==='file'||field.type==='file-multiple'){
        const input=form.querySelector('[name="'+field.key+'"]');
        const selected=input&&input.files?Array.from(input.files):[];
        if(!selected.length){
          data[field.key]=oldRecord&&oldRecord[field.key] != null?oldRecord[field.key]:(field.type==='file-multiple'?[]:'');
        } else {
          const list=[];
          for(let j=0;j<selected.length;j+=1)list.push(await readFileAsDataUrl(selected[j]));
          data[field.key]=field.type==='file-multiple'?list:(list[0].dataUrl);
        }
      }else if(field.type==='checks'||field.type==='multi-check'||(field.type==='select'&&field.multiple)){
        data[field.key]=fd.getAll(field.key);
      }else if(field.type==='jalali'||field.type==='jalali-datetime'){
        const raw=String(fd.get(field.key)||'').trim();
        const normalized=dateInputToIso(raw,field.type);
        if(raw&&!normalized)throw new Error('تاریخ «'+field.label+'» را با قالب شمسی ۱۴۰۵/۰۷/۲۸ وارد کن.');
        data[field.key]=normalized||'';
      }else{
        const raw=String(fd.get(field.key)||'').trim();
        // فیلدهای رقمی (مثل شمارهٔ پرسنلی): هر علامت غیررقم در ذخیره هم حذف می‌شود.
        data[field.key]=field.digits===true?persianDigitsToLatin(raw).replace(/\D/g,''):raw;
      }
      if(fieldRequired(field,visibleRecord) && (data[field.key] == null || data[field.key] === '' || (Array.isArray(data[field.key])&&!data[field.key].length))){
        throw new Error('فیلد «'+field.label+'» ضروری است.');
      }
    }
    // خودروهای یک مأموریت: فهرست کامل در vehicleIds می‌ماند و خودروی اول برای
    // نماهای قدیمی (سوابق خودرو) در vehicleId تکرار می‌شود؛ رانندهٔ هر خودرو هم
    // در vehicleDrivers به‌صورت {vehicleId: employeeId} نگه‌داری می‌شود.
    if(moduleKey==='missions'){
      const vehicles=Array.isArray(data.vehicleIds)?data.vehicleIds.filter(Boolean):[];
      data.vehicleIds=vehicles;
      data.vehicleId=vehicles[0]||'';
      const drivers={};
      Array.prototype.forEach.call(form.querySelectorAll('[data-vehicle-id]'),function(select){
        const vid=String(select.dataset.vehicleId||''), driver=String(select.value||'');
        if(vid&&driver)drivers[vid]=driver;
      });
      data.vehicleDrivers=drivers;
    }
    return data;
  }

  function changeText(value) {
    if (value == null) return '';
    if (Array.isArray(value)) {
      return value.map(function (item) {
        if (!item || typeof item !== 'object') return String(item == null ? '' : item);
        return Object.keys(item).map(function (key) { return String(item[key] == null ? '' : item[key]).trim(); }).filter(Boolean).join(' · ');
      }).filter(Boolean).join('، ');
    }
    return String(value);
  }

  function summarizeChanges(oldRecord, newRecord, moduleKey) {
    if(!oldRecord)return [];
    const fields=fieldsFor(moduleKey),changes=[];
    fields.forEach(function(field){
      const before=changeText(field.custom&&oldRecord.customFields?oldRecord.customFields[field.key]:oldRecord[field.key]);
      const after=changeText(field.custom&&newRecord.customFields?newRecord.customFields[field.key]:newRecord[field.key]);
      if(before!==after)changes.push({field:field.label||field.key,before:before,after:after});
    });
    return changes.slice(0,100);
  }

  function downloadFile(filename, content, mime) {
    const blob=new Blob([content],{type:mime||'application/octet-stream'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=filename;
    document.body.appendChild(a);a.click();a.remove();
    window.setTimeout(function(){URL.revokeObjectURL(url);},1500);
  }

  function xmlEscape(value) {
    return String(value == null ? '' : value)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  }

  function concatBytes(parts) {
    const total=parts.reduce(function(sum,part){return sum+part.length;},0);
    const output=new Uint8Array(total);
    let offset=0;
    parts.forEach(function(part){output.set(part,offset);offset+=part.length;});
    return output;
  }

  function le16(value) {
    return new Uint8Array([value&255,(value>>>8)&255]);
  }

  function le32(value) {
    return new Uint8Array([value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255]);
  }

  function crc32(bytes) {
    let crc=0xFFFFFFFF;
    for(let i=0;i<bytes.length;i+=1){
      crc^=bytes[i];
      for(let bit=0;bit<8;bit+=1)crc=(crc>>>1)^((crc&1)?0xEDB88320:0);
    }
    return (crc^0xFFFFFFFF)>>>0;
  }

  // A minimal standards-based ZIP writer using stored entries keeps Office export fully offline.
  function zipStored(entries) {
    const encoder=new TextEncoder();
    const localParts=[],centralParts=[];
    let localOffset=0;
    const now=new Date();
    const dosTime=(now.getHours()<<11)|(now.getMinutes()<<5)|Math.floor(now.getSeconds()/2);
    const dosDate=((Math.max(1980,now.getFullYear())-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();

    entries.forEach(function(entry){
      const name=encoder.encode(entry.name);
      const data=encoder.encode(entry.content);
      const crc=crc32(data);
      const local=concatBytes([
        le32(0x04034B50),le16(20),le16(0x0800),le16(0),le16(dosTime),le16(dosDate),
        le32(crc),le32(data.length),le32(data.length),le16(name.length),le16(0),name,data
      ]);
      localParts.push(local);
      const central=concatBytes([
        le32(0x02014B50),le16(20),le16(20),le16(0x0800),le16(0),le16(dosTime),le16(dosDate),
        le32(crc),le32(data.length),le32(data.length),le16(name.length),le16(0),le16(0),
        le16(0),le16(0),le32(0),le32(localOffset),name
      ]);
      centralParts.push(central);
      localOffset+=local.length;
    });

    const central=concatBytes(centralParts);
    const end=concatBytes([
      le32(0x06054B50),le16(0),le16(0),le16(entries.length),le16(entries.length),
      le32(central.length),le32(localOffset),le16(0)
    ]);
    return new Blob([concatBytes(localParts.concat([central,end]))],{type:'application/zip'});
  }

  function downloadBlob(filename, blob) {
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;
    anchor.download=filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(function(){URL.revokeObjectURL(url);},1500);
  }

  function currentReportRows() {
    const rows=[['بخش','عنوان یا نام','وضعیت','تاریخ','شرح']];
    MODULES.forEach(function(moduleKey){
      appData[moduleKey].filter(function(record){return isInRange(moduleKey,record,reportPeriod);}).forEach(function(record){
        const summary=record.notes||record.body||record.result||record.reason||record.destination||record.related||record.description||'';
        rows.push([specs[moduleKey].title,recordLabel(moduleKey,record),record.status||'',recordDateForCsv(moduleKey,record),summary]);
      });
    });
    (appData.shifts||[]).filter(function(record){return isInRange('shifts',record,reportPeriod);}).forEach(function(record){
      rows.push(['برنامهٔ شیفت',shiftLabel(record,appData),record.status||'',record.startAt||'',[record.workplace,record.notes].filter(Boolean).join(' · ')]);
    });
    return rows;
  }

  function currentReportTitle() {
    const labels={today:'امروز',yesterday:'دیروز',threeDays:'۳ روز اخیر',week:'هفتهٔ اخیر',tenDays:'۱۰ روز اخیر',month:'ماه جاری',threeMonths:'۳ ماه اخیر',sixMonths:'۶ ماه اخیر',year:'سال جاری',all:'همهٔ اطلاعات',custom:'بازهٔ دلخواه'};
    return 'گزارش عملیاتی ATLAS SHIFT · '+(labels[reportPeriod]||'بازهٔ انتخاب‌شده');
  }

  function exportReportCsv() {
    const rows=currentReportRows();
    downloadFile('ATLAS-SHIFT-report-'+todayIso()+'.csv', window.AtlasExportDocs.csv(rows, {
      title: currentReportTitle(),
      stamp: formatJalali(new Date().toISOString(), true)
    }),'text/csv;charset=utf-8;');
  }

  // ── Word: یک ساخت‌کنندهٔ واحد در design/export-docs.js ────────────────────
  // برگهٔ فهرست‌ها همیشه A4 افقی است (همان چیزی که در چاپ/PDF و روی صفحه دیده
  // می‌شود) و برگهٔ پرونده عمودی می‌ماند؛ ساخت XML و پهنای ستون‌ها آن‌جاست.
  function exportReportDocx() {
    const rows=currentReportRows();
    downloadBlob('ATLAS-SHIFT-report-'+todayIso()+'.docx', window.AtlasExportDocs.docx({
      title: currentReportTitle(),
      stamp: formatJalali(new Date().toISOString(),true),
      meta: 'تعداد ردیف‌های گزارش: '+faDigits(Math.max(0,rows.length-1)),
      landscape: true,
      tables: [{rows: rows}]
    }));
  }

  function excelColumn(index) {
    let n=index+1,letters='';
    while(n>0){const remainder=(n-1)%26;letters=String.fromCharCode(65+remainder)+letters;n=Math.floor((n-1)/26);}
    return letters;
  }

  function exportReportXlsx() {
    const rows=currentReportRows();
    const sheet=xlsxSheetXml(rows,currentReportTitle()+'  ·  '+formatJalali(new Date().toISOString(),true));
    downloadBlob('ATLAS-SHIFT-report-'+todayIso()+'.xlsx',zipStored(xlsxPackage('گزارش ATLAS SHIFT',sheet)));
  }


  // ── خروجی یکپارچه: CSV، اکسل، ورد، تصویر و چاپ ────────────────────────────
  // متن سادهٔ هر فیلد برای خروجی؛ نام افراد و خودرو جای شناسه‌ها نوشته می‌شود.
  function exportValue(moduleKey, field, record, data) {
    const value = field.custom && record.customFields ? record.customFields[field.key] : record[field.key];
    if (field.type === 'file' || field.type === 'file-multiple') {
      const list = Array.isArray(value) ? value : (value ? [value] : []);
      return list.map(function (item) { return item && item.name ? item.name : 'پیوست'; }).join('; ');
    }
    if (field.type === 'jalali' || field.type === 'jalali-datetime' || field.type === 'date') {
      return value ? formatJalali(value, field.type === 'jalali-datetime') : '';
    }
    if (field.source === 'employees') {
      const find = function (id) {
        const person = (data.employees || []).find(function (item) { return String(item.id) === String(id); });
        return person ? (employeeName(person) || person.personnelId || '') : '';
      };
      return (Array.isArray(value) ? value.map(find) : [find(value)]).filter(Boolean).join('، ');
    }
    if (field.source === 'vehicles') {
      const vehicle = (data.vehicles || []).find(function (item) { return String(item.id) === String(value); });
      return vehicle ? [vehicle.name, vehicle.companyPlate].filter(Boolean).join(' · ') : String(value || '');
    }
    if (field.source === 'gasmeters') {
      const meter = (data.gasmeters || []).find(function (item) { return String(item.id) === String(value); });
      return meter ? [meter.code, meter.serial].filter(Boolean).join(' · ') : String(value || '');
    }
    if (field.type === 'rows') {
      const rows = Array.isArray(value) ? value : [];
      return rows.map(function (row) {
        return (field.columns || []).map(function (column) {
          const cell = String(row && row[column.key] != null ? row[column.key] : '').trim();
          return cell ? column.label + ': ' + cell : '';
        }).filter(Boolean).join(' | ');
      }).filter(Boolean).join(' ؛ ');
    }
    if (Array.isArray(value)) return value.join('، ');
    return String(value == null ? '' : value);
  }

  function exportColumnsSetting(moduleKey) {
    const stored = appData.settings && appData.settings.exportColumns ? appData.settings.exportColumns[moduleKey] : null;
    return Array.isArray(stored) && stored.length ? stored : null;
  }

  function selectedExportFields(moduleKey) {
    // فیلدهایی که در فرم ثبت دیده نمی‌شوند (مثل «وضعیت جاری») در خروجی پیش‌فرض هم
    // نمی‌آیند؛ وگرنه ستونی خالی و بی‌مصرف در فایل ساخته می‌شود.
    const fields = fieldsFor(moduleKey).filter(function (field) { return !field.formHidden; });
    const chosen = exportColumnsSetting(moduleKey);
    if (!chosen) return fields;
    const picked = fields.filter(function (field) { return chosen.indexOf(field.key) >= 0; });
    return picked.length ? picked : fields;
  }

  function exportColumnsModal(moduleKey) {
    const fields = fieldsFor(moduleKey).filter(function (field) { return !field.formHidden; });
    const chosen = exportColumnsSetting(moduleKey) || fields.map(function (field) { return field.key; });
    return '<div class="atlas-modal-backdrop" data-modal-backdrop data-modal-kind="export-columns" data-view="' + esc(moduleKey) + '">' +
      '<div class="atlas-modal atlas-modal-narrow" role="dialog" aria-modal="true"><div class="atlas-modal-head"><div><h3>ستون‌های گزارش</h3>' +
      '<p>هر ستونی را که در خروجی لازم داری تیک بزن؛ بقیه در فایل نمی‌آید تا گزارش شلوغ نشود.</p></div>' +
      '<button type="button" class="atlas-modal-close" data-module-action="export-columns-cancel" data-view="' + esc(moduleKey) + '" aria-label="بستن">×</button></div>' +
      '<div class="atlas-modal-body"><div class="module-check-options module-check-people" data-export-columns>' +
      fields.map(function (field) {
        return '<label><input type="checkbox" class="nu-keep-native" value="' + esc(field.key) + '"' + (chosen.indexOf(field.key) >= 0 ? ' checked' : '') + '><span>' + esc(field.label) + '</span></label>';
      }).join('') + '</div>' +
      '<div class="module-form-actions"><span class="module-required-help">حداقل یک ستون لازم است.</span><div>' +
      '<button type="button" class="secondary-btn" data-module-action="export-columns-all" data-view="' + esc(moduleKey) + '">انتخاب همه</button> ' +
      '<button type="button" class="primary-btn" data-module-action="export-columns-save" data-view="' + esc(moduleKey) + '">ذخیرهٔ ستون‌ها</button></div></div></div></div></div>';
  }

  // پنجرهٔ «عناوین»: همهٔ ستون‌های جدول را با تیک نمایش/پنهان و دکمه‌های ↑ ↓
  // برای تعیین ترتیب نشان می‌دهد. ترتیب ردیف‌ها در DOM همان ترتیب نهایی است.
  function updateColumnMoveButtons(list) {
    if (!list) return;
    const rows = Array.from(list.querySelectorAll('[data-col-key]'));
    rows.forEach(function (row, index) {
      const up = row.querySelector('[data-dir="up"]');
      const down = row.querySelector('[data-dir="down"]');
      if (up) up.disabled = index === 0;
      if (down) down.disabled = index === rows.length - 1;
    });
  }

  function columnsModal(moduleKey) {
    const ordered = orderedTableColumns(moduleKey);
    const prefs = columnPrefsFor(moduleKey);
    const hidden = prefs && Array.isArray(prefs.hidden) ? prefs.hidden : [];
    return '<div class="atlas-modal-backdrop" data-modal-backdrop data-modal-kind="columns" data-view="' + esc(moduleKey) + '">' +
      '<div class="atlas-modal atlas-modal-narrow" role="dialog" aria-modal="true"><div class="atlas-modal-head"><div><h3>عناوین جدول</h3>' +
      '<p>هر عنوانی را که می‌خواهی در جدول ببینی تیک بزن و با دکمه‌های ↑ ↓ ترتیبش را مشخص کن.</p></div>' +
      '<button type="button" class="atlas-modal-close" data-module-action="columns-cancel" data-view="' + esc(moduleKey) + '" aria-label="بستن">×</button></div>' +
      '<div class="atlas-modal-body"><div class="module-column-list" data-column-list>' +
      ordered.map(function (key, index) {
        return '<div class="module-column-row" data-col-key="' + esc(key) + '">' +
          '<label><input type="checkbox" class="nu-keep-native" value="' + esc(key) + '"' + (hidden.indexOf(key) < 0 ? ' checked' : '') + '><span>' + esc(columnLabel(moduleKey, key)) + '</span></label>' +
          '<div class="module-column-move">' +
            '<button type="button" class="module-column-move-btn" data-module-action="column-move" data-dir="up" data-view="' + esc(moduleKey) + '" aria-label="بالا" title="بالا"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button type="button" class="module-column-move-btn" data-module-action="column-move" data-dir="down" data-view="' + esc(moduleKey) + '" aria-label="پایین" title="پایین"' + (index === ordered.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '</div></div>';
      }).join('') + '</div>' +
      '<div class="module-form-actions"><span class="module-required-help">حداقل یک عنوان لازم است.</span><div>' +
      '<button type="button" class="secondary-btn" data-module-action="columns-all" data-view="' + esc(moduleKey) + '">انتخاب همه</button> ' +
      '<button type="button" class="primary-btn" data-module-action="columns-save" data-view="' + esc(moduleKey) + '">ذخیرهٔ عناوین</button></div></div></div></div></div>';
  }

  // فهرست دیده‌شدهٔ هر بخش: همان چیزی که کاربر روی صفحه می‌بیند (جست‌وجو، فیلتر و
  // ترتیب). خروجی‌ها از همین تابع ساخته می‌شوند تا فایل با صفحه یکی باشد.
  function visibleRecordsFor(moduleKey) {
    if (moduleKey === 'programs') {
      const records = (appData.programs || []).slice();
      return programFilter === 'all' ? records : records.filter(function (record) { return programCategoryOf(record) === programFilter; });
    }
    if (moduleKey === 'faults') {
      const records = (appData.faults || []).slice().sort(faultBoardOrder);
      return faultFilter === 'all' ? records : records.filter(function (record) { return (record.status || 'ثبت‌شده') === faultFilter; });
    }
    if (moduleKey === 'gasmeters') return visibleGasMeters();
    return recordsForView(moduleKey, appData);
  }

  function moduleExportRows(moduleKey) {
    const fields = selectedExportFields(moduleKey);
    const rows = [fields.map(function (field) { return field.label; })];
    // خروجی همان چیزی است که کاربر روی صفحه می‌بیند: جست‌وجو، فیلترها و ترتیب
    // مرتب‌سازی فعلی روی داده اعمال می‌شود، نه کل دادهٔ خام بخش.
    visibleRecordsFor(moduleKey).forEach(function (record) {
      rows.push(fields.map(function (field) { return exportValue(moduleKey, field, record, appData); }));
    });
    return rows;
  }

  // عنوان خروجی وضعیت فیلتر را نشان می‌دهد تا فایل با فهرست کامل اشتباه نشود.
  function moduleExportTitle(moduleKey) {
    const title = specs[moduleKey] ? specs[moduleKey].title : moduleKey;
    const total = (appData[moduleKey] || []).length;
    const shown = visibleRecordsFor(moduleKey).length;
    const narrowed = shown !== total || hasActiveFilters(moduleKey) || !!String(searchState[moduleKey] || '').trim();
    return title + (narrowed ? ' · فیلترشده (' + faDigits(shown) + ' از ' + faDigits(total) + ')' : '') + ' · ATLAS SHIFT';
  }

  // استایل‌های مشترک اکسل: فونت عنوان (B Nazanin)، سرستون (Tahoma پرنگ) و بدنه.
  function xlsxStylesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="4">' +
      '<font><sz val="11"/><color rgb="FF1F2937"/><name val="Tahoma"/><family val="2"/></font>' +
      '<font><b/><sz val="16"/><color rgb="FF16355B"/><name val="B Nazanin"/><family val="2"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF14304F"/><name val="Tahoma"/><family val="2"/></font>' +
      '<font><sz val="10"/><color rgb="FF111827"/><name val="Tahoma"/><family val="2"/></font>' +
      '</fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF7"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FFB9C7D9"/></left><right style="thin"><color rgb="FFB9C7D9"/></right><top style="thin"><color rgb="FFB9C7D9"/></top><bottom style="thin"><color rgb="FFB9C7D9"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="4">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf>' +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  // برگهٔ اکسل با سرستون رنگی، ارتفاع سطر متناسب، عرض ستون و سطر عنوان.
  function xlsxSheetXml(rows, title) {
    const columns = Math.max(1, Math.max.apply(null, rows.map(function (row) { return (row || []).length; })));
    const titleRow = title ? 1 : 0;
    const parts = [];
    if (title) {
      parts.push('<row r="1" ht="34" customHeight="1"><c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(title) + '</t></is></c></row>');
    }
    rows.forEach(function (row, index) {
      const rowNumber = index + 1 + titleRow;
      const header = index === 0;
      const cells = (row || []).map(function (value, columnIndex) {
        return '<c r="' + excelColumn(columnIndex) + rowNumber + '" s="' + (header ? 2 : 3) + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(value) + '</t></is></c>';
      }).join('');
      parts.push('<row r="' + rowNumber + '" ht="' + (header ? 28 : 22) + '" customHeight="1">' + cells + '</row>');
    });
    const cols = '<cols>' + Array.apply(null, Array(columns)).map(function (_, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (i === 0 ? 24 : 20) + '" customWidth="1"/>';
    }).join('') + '</cols>';
    const lastRow = rows.length + titleRow;
    const split = titleRow ? 2 : 1;
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="A1:' + excelColumn(columns - 1) + Math.max(1, lastRow) + '"/>' +
      '<sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="' + split + '" topLeftCell="A' + (split + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="20"/>' + cols +
      '<sheetData>' + parts.join('') + '</sheetData>' +
      (rows.length > 1 ? '<autoFilter ref="A' + (split + 1) + ':' + excelColumn(columns - 1) + lastRow + '"/>' : '') +
      '</worksheet>';
  }

  function xlsxPackage(sheetName, sheetXml) {
    return [
      {name:'[Content_Types].xml',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'},
      {name:'_rels/.rels',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
      {name:'xl/workbook.xml',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + xmlEscape(sheetName || 'ATLAS SHIFT') + '" sheetId="1" r:id="rId1"/></sheets></workbook>'},
      {name:'xl/_rels/workbook.xml.rels',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
      {name:'xl/styles.xml',content:xlsxStylesXml()},
      {name:'xl/worksheets/sheet1.xml',content:sheetXml}
    ];
  }

  function exportRowsXlsx(rows, filename, sheetName) {
    downloadBlob(filename, zipStored(xlsxPackage(sheetName || 'ATLAS SHIFT', xlsxSheetXml(rows, ''))));
  }

  function exportRowsDocx(rows, title, filename) {
    downloadBlob(filename, window.AtlasExportDocs.docx({
      title: title,
      stamp: formatJalali(new Date().toISOString(), true),
      meta: 'تعداد ردیف‌ها: ' + faDigits(Math.max(0, rows.length - 1)),
      landscape: true,
      tables: [{rows: rows}]
    }));
  }


  // تصویر: همان قالب جدول روی کاغذ سفید؛ عنوان، سرستون و بدنه هر سه فونت و
  // اندازهٔ خودشان را دارند و فاصلهٔ سطر/ستون متناسب همان اندازه است.
  function exportRowsPng(rows, title, filename) {
    const scale = 2, pad = 30, rowH = 40, gutter = 40;
    const titleSize = 22, metaSize = 12, headSize = 15, bodySize = 14;
    const bodyFamily = 'Vazirmatn, Tahoma, sans-serif';
    const bodyFont = '400 ' + bodySize + 'px ' + bodyFamily;
    const headFont = '700 ' + headSize + 'px Tahoma, ' + bodyFamily;
    const measure = document.createElement('canvas').getContext('2d');
    const columns = Math.max.apply(null, rows.map(function (row) { return row.length; }));
    const widths = [];
    for (let i = 0; i < columns; i += 1) widths.push(110);
    rows.forEach(function (row, rowIndex) {
      measure.font = rowIndex === 0 ? headFont : bodyFont;
      for (let i = 0; i < columns; i += 1) {
        const width = measure.measureText(String(row[i] == null ? '' : row[i])).width + gutter;
        if (width > widths[i]) widths[i] = width;
      }
    });
    const totalWidth = widths.reduce(function (a, b) { return a + b; }, 0);
    const width = Math.max(760, totalWidth + pad * 2);
    const tableTop = pad + 62;
    const height = tableTop + rows.length * rowH + pad;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';

    // عنوان و زیرعنوان
    ctx.fillStyle = '#14304F';
    ctx.font = '700 ' + titleSize + 'px ' + bodyFamily;
    ctx.fillText(title, width - pad, pad + 14);
    ctx.fillStyle = '#4B5563';
    ctx.font = '400 ' + metaSize + 'px ' + bodyFamily;
    ctx.fillText('ATLAS SHIFT · ' + formatJalali(new Date().toISOString(), true), width - pad, pad + 42);

    rows.forEach(function (row, rowIndex) {
      const header = rowIndex === 0;
      const y = tableTop + rowIndex * rowH;
      if (header) {
        ctx.fillStyle = '#E8EEF7';
        ctx.fillRect(pad, y, width - pad * 2, rowH);
      } else if (rowIndex % 2 === 0) {
        ctx.fillStyle = '#F7F9FC';
        ctx.fillRect(pad, y, width - pad * 2, rowH);
      }
      ctx.font = header ? headFont : bodyFont;
      ctx.fillStyle = header ? '#14304F' : '#111827';
      let x = width - pad;
      for (let i = 0; i < columns; i += 1) {
        const cell = String(row[i] == null ? '' : row[i]);
        const columnWidth = widths[i];
        x -= columnWidth;
        const text = cell.length > 34 ? cell.slice(0, 33) + '…' : cell;
        ctx.fillText(text, x + columnWidth - 14, y + rowH / 2);
        ctx.strokeStyle = 'rgba(17,24,39,.22)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + rowH);
        ctx.stroke();
      }
      ctx.strokeStyle = header ? '#8FA8C4' : 'rgba(17,24,39,.22)';
      ctx.lineWidth = header ? 1.2 : 0.7;
      ctx.beginPath();
      ctx.moveTo(pad, y + rowH);
      ctx.lineTo(width - pad, y + rowH);
      ctx.stroke();
    });

    // کادر بیرونی جدول
    ctx.strokeStyle = '#14304F';
    ctx.lineWidth = 1.3;
    ctx.strokeRect(pad, tableTop, width - pad * 2, rows.length * rowH);
    canvas.toBlob(function (blob) { if (blob) downloadBlob(filename, blob); }, 'image/png');
  }

  // خروجی چاپ فهرست‌ها: برگهٔ A4 افقی با عنوان موضوع، سرستون درشت و جدول شبکه‌دار.
  // ظاهر برگه در design/print.css و ساخت HTML آن در design/print-sheet.js است.
  function printRows(rows, title) {
    let host = document.getElementById('atlasPrintArea');
    if (!host) {
      host = document.createElement('div');
      host.id = 'atlasPrintArea';
      document.body.appendChild(host);
    }
    const stamp = formatJalali(new Date().toISOString(), true);
    if (window.AtlasPrintSheet) {
      window.AtlasPrintSheet.render(host, rows, { title: title, stamp: stamp });
    } else {
      // پشتیبان: اگر فایل برگهٔ چاپ بارگذاری نشده بود، ساده‌ترین جدول ساخته می‌شود.
      host.innerHTML = '<h1>' + esc(title) + '</h1><p class="atlas-print-meta">ATLAS SHIFT · ' + stamp + '</p>' +
        '<table class="atlas-print-table"><thead><tr>' + (rows[0] || []).map(function (cell) { return '<th>' + esc(cell) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.slice(1).map(function (row) {
          return '<tr>' + row.map(function (cell) { return '<td>' + esc(cell) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table>';
    }
    document.body.classList.add('atlas-printing');
    const cleanup = function () { document.body.classList.remove('atlas-printing'); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 1500);
  }

  // نام فایل خروجی باید ASCII بماند؛ ارقام فارسی و فاصله در نام فایل دانلود را بی‌نام می‌کند.
  function exportSlug(value, fallback) {
    const ascii = String(value == null ? '' : value)
      .replace(/[\u06F0-\u06F9]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); })
      .replace(/[^\w-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return ascii || String(fallback || 'export');
  }

  function runExport(rows, title, base, format) {
    if (format === 'xlsx') exportRowsXlsx(rows, base + '.xlsx', title);
    else if (format === 'docx') exportRowsDocx(rows, title, base + '.docx');
    else if (format === 'png') exportRowsPng(rows, title, base + '.png');
    else if (format === 'print') printRows(rows, title);
    else downloadFile(base + '.csv', window.AtlasExportDocs.csv(rows, {
      title: title,
      stamp: formatJalali(new Date().toISOString(), true)
    }), 'text/csv;charset=utf-8;');
  }

  function exportModule(moduleKey, format) {
    if (!specs[moduleKey]) return;
    runExport(moduleExportRows(moduleKey), moduleExportTitle(moduleKey), 'ATLAS-SHIFT-' + moduleKey + '-' + todayIso(), format);
  }

  // خلاصهٔ فهرست دیده‌شده، بالای منوی خروجی: کاربر پیش از گرفتن فایل می‌بیند
  // که خروجی از همین فهرست (همان تعداد و همان ترتیب) ساخته می‌شود.
  function exportMenuSummary(moduleKey) {
    const shown = visibleRecordsFor(moduleKey).length;
    const total = (appData[moduleKey] || []).length;
    const sort = listSortFor(moduleKey);
    const option = sortOptionsFor(moduleKey).find(function (pair) { return pair[0] === sort.key; });
    const sortLabel = option ? option[1] : sort.key;
    return '<div class="module-export-note">خروجی از همین فهرست: ' + faDigits(shown) + ' از ' + faDigits(total) +
      ' مورد · ترتیب: ' + esc(sortLabel) + ' (' + (sort.direction === 'asc' ? 'صعودی' : 'نزولی') + ')</div>';
  }

  function exportMenu(moduleKey) {
    return '<div class="module-export" data-export-menu>' +
      '<button type="button" class="secondary-btn module-export-toggle" data-module-action="export-toggle" aria-haspopup="true" aria-expanded="false">⬇ خروجی و چاپ</button>' +
      '<div class="module-export-list" hidden>' +
      exportMenuSummary(moduleKey) +
      '<button type="button" data-module-action="export" data-format="csv" data-view="' + esc(moduleKey) + '">CSV (صفحه‌گسترده)</button>' +
      '<button type="button" data-module-action="export" data-format="xlsx" data-view="' + esc(moduleKey) + '">Excel (.xlsx)</button>' +
      '<button type="button" data-module-action="export" data-format="docx" data-view="' + esc(moduleKey) + '">Word (.docx)</button>' +
      '<button type="button" data-module-action="export" data-format="png" data-view="' + esc(moduleKey) + '">تصویر PNG</button>' +
      '<button type="button" data-module-action="export" data-format="print" data-view="' + esc(moduleKey) + '">چاپ / PDF (A4 افقی)</button>' +
      '<button type="button" class="module-export-columns" data-module-action="export-columns" data-view="' + esc(moduleKey) + '">⚙ انتخاب ستون‌های گزارش</button>' +
      '</div></div>';
  }

  // بستن منوی «خروجی و چاپ» با کلیک بیرون از آن یا با Escape.
  // منو با کلیک روی دکمه باز/بسته می‌شود؛ این‌جا فقط وقتی کلیک بیرون از
  // خودِ منو باشد آن را می‌بندیم تا کلیک روی دکمه یا گزینه‌ها دوباره بازش نکند.
  function closeExportMenus() {
    document.querySelectorAll('[data-export-menu]').forEach(function (menu) {
      const list = menu.querySelector('.module-export-list');
      if (!list || list.hidden) return;
      list.hidden = true;
      const toggle = menu.querySelector('.module-export-toggle');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    });
  }
  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-export-menu]')) return;
    closeExportMenus();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeExportMenus();
  });

  // پنجرهٔ «عناوین» با کلیک بیرون از آن یا Escape بسته می‌شود.
  document.addEventListener('click', function (event) {
    const backdrop = event.target.closest('[data-modal-kind="columns"]');
    if (backdrop && !event.target.closest('.atlas-modal')) backdrop.remove();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('[data-modal-kind="columns"]').forEach(function (node) { node.remove(); });
  });

  function exportCsv(moduleKey) {
    const rows = moduleExportRows(moduleKey);
    downloadFile('ATLAS-SHIFT-'+moduleKey+'-'+todayIso()+'.csv', window.AtlasExportDocs.csv(rows, {
      title: moduleExportTitle(moduleKey),
      stamp: formatJalali(new Date().toISOString(), true)
    }),'text/csv;charset=utf-8;');
  }

  function shiftPrintRows() {
    const rows=[['شروع','پایان','نوع شیفت','کارکنان','محل خدمت','وضعیت','توضیحات']];
    // همان ترتیبی که در جدول «برنامهٔ شیفت‌ها» روی صفحه دیده می‌شود؛ خروجی و
    // چاپ نباید ترتیب دیگری بدهند.
    sortRecords('shifts', appData.shifts || []).forEach(function(record){
      rows.push([formatJalali(record.startAt,true),formatJalali(record.endAt,true),record.shiftType||'',shiftLabel(record,appData),record.workplace||'',record.status||'',record.notes||'']);
    });
    return rows;
  }

  function exportAllCsv() {
    const rows=[['بخش','عنوان','وضعیت','تاریخ','شرح']];
    MODULES.forEach(function(key){
      appData[key].forEach(function(record){
        rows.push([specs[key].title,recordLabel(key,record),record.status||'',recordDateForCsv(key,record),record.notes||record.body||record.result||record.reason||record.description||'']);
      });
    });
    (appData.shifts||[]).forEach(function(record){rows.push(['برنامهٔ شیفت',shiftLabel(record,appData),record.status||'',record.startAt||'',record.workplace||record.notes||'']);});
    downloadFile('ATLAS-SHIFT-report-'+todayIso()+'.csv', window.AtlasExportDocs.csv(rows, {
      title: 'همهٔ اطلاعات',
      stamp: formatJalali(new Date().toISOString(), true)
    }),'text/csv;charset=utf-8;');
  }

  function recordDateForCsv(key, record) {
    if(key==='missions'||key==='shifts')return record.startAt||'';
    if(key==='leaves')return record.startDate||'';
    if(key==='gasmeters')return record.calibrationEnd||'';
    if(key==='notes')return record.date||'';
    return record.createdAt||'';
  }

  function readStoredPreference(key) {
    try { return localStorage.getItem(key); } catch (error) { return null; }
  }

  // ── حالت آزمایشی: دادهٔ تست در فضایی کاملاً جدا از دادهٔ اصلی ─────────────
  async function toggleTestMode() {
    const goingToTest = !TEST_MODE;
    const ok = await askConfirm({
      title: goingToTest ? 'روشن کردن حالت آزمایشی' : 'خروج از حالت آزمایشی',
      message: goingToTest
        ? 'برنامه به یک فضای ذخیره‌سازی جداگانه می‌رود؛ هر کارمند، مرخصی یا آیتمی که اینجا ثبت کنی داخل دادهٔ اصلی نمی‌رود. برنامه یک‌بار بازخوانی می‌شود. ادامه می‌دهی؟'
        : 'به دادهٔ اصلی برمی‌گردی؛ اطلاعاتی که در حالت آزمایشی ثبت کرده‌ای به دادهٔ اصلی منتقل نمی‌شود. برنامه یک‌بار بازخوانی می‌شود. ادامه می‌دهی؟',
      confirmLabel: goingToTest ? 'روشن کن' : 'بازگشت'
    });
    if (!ok) return;
    try { localStorage.setItem(STORAGE_MODE_KEY, goingToTest ? 'test' : 'main'); }
    catch (error) { toast('تغییر حالت ذخیره‌سازی ممکن نشد؛ فضای مرورگر را بررسی کن.'); return; }
    window.location.reload();
  }

  async function clearTestData() {
    if (!TEST_MODE) return;
    const ok = await askConfirm({
      title: 'پاک کردن اطلاعات آزمایشی',
      message: 'همهٔ اطلاعاتی که در حالت آزمایشی ثبت شده پاک می‌شود. دادهٔ اصلی دست‌نخورده می‌ماند. ادامه می‌دهی؟',
      confirmLabel: 'پاک کن'
    });
    if (!ok) return;
    try { localStorage.removeItem(LEGACY_KEY); } catch (error) {}
    try { await deleteFromDb(db || await openDb(), STORE_KEY); } catch (error) {}
    toast('اطلاعات آزمایشی پاک شد؛ دادهٔ اصلی تغییری نکرد.');
    window.setTimeout(function () { window.location.reload(); }, 400);
  }

  function exportBackup() {
    const payload={
      app:'ATLAS SHIFT',
      schemaVersion:2,
      exportedAt:new Date().toISOString(),
      data:appData,
      uiSettings:{
        layout:readStoredPreference('atlasShiftLayout'),
        appTheme:readStoredPreference('atlasShiftAppTheme'),
        cloudBackground:readStoredPreference('atlasShiftCloudBackground')
      }
    };
    downloadFile('ATLAS-SHIFT-backup-'+todayIso()+'.json',JSON.stringify(payload,null,2),'application/json;charset=utf-8');
    toast('نسخهٔ پشتیبان شامل اطلاعات، تاریخچه و تنظیمات رابط آماده شد.');
  }

  // ── پشتیبان‌گیری بخش‌به‌بخش ─────────────────────────────────────────────────
  // در هر منو یک گزینه هست که فقط اطلاعات همان منو را پشتیبان می‌گیرد تا بشود
  // آن را به شخص دیگری داد؛ بقیهٔ بخش‌ها در فایل نمی‌آیند. پیش از ساخت فایل،
  // همان چیزی که داخل فایل می‌رود در یک پنجرهٔ تأیید نشان داده می‌شود.
  const SECTION_BACKUP = {
    employees: { kind: 'module', key: 'employees', title: 'کارکنان' },
    missions: { kind: 'module', key: 'missions', title: 'مأموریت‌ها' },
    leaves: { kind: 'module', key: 'leaves', title: 'مرخصی‌ها' },
    vehicles: { kind: 'module', key: 'vehicles', title: 'خودروها' },
    stations: { kind: 'module', key: 'stations', title: 'ایستگاه‌ها و مراکز' },
    gasmeters: { kind: 'module', key: 'gasmeters', title: 'گازسنج‌ها' },
    notes: { kind: 'module', key: 'notes', title: 'یادداشت‌ها و پیگیری‌ها' },
    programs: { kind: 'module', key: 'programs', title: 'برنامه‌ها و پرونده‌ها' },
    faults: { kind: 'module', key: 'faults', title: 'اشکالات و رفع اشکال' },
    maintenance: { kind: 'module', key: 'maintenance', title: 'سرویس و نگهداری خودرو' },
    gaslogs: { kind: 'module', key: 'gaslogs', title: 'سوابق گازسنج‌ها' },
    shifts: { kind: 'module', key: 'shifts', title: 'برنامهٔ شیفت‌ها' },
    phonebook: { kind: 'phonebook', title: 'دفترچه تلفن' },
    settings: { kind: 'config', title: 'تنظیمات و فهرست‌های کشویی' }
  };

  function sectionBackupScope(view) {
    return SECTION_BACKUP[view] || null;
  }

  function backupReferenceKeys(moduleKey) {
    const keys = [];
    (specs[moduleKey] ? specs[moduleKey].fields : []).forEach(function (field) {
      if (field.listKey) keys.push(referenceBaseKey(field.listKey));
    });
    return keys.filter(function (key, index) { return keys.indexOf(key) === index; });
  }

  function buildScopedBackupData(scope) {
    const state = createEmptyState();
    if (scope.kind === 'config') {
      state.references = JSON.parse(JSON.stringify(appData.references || state.references));
      state.settings = JSON.parse(JSON.stringify(appData.settings || state.settings));
      state.history = [];
      return state;
    }
    if (scope.kind === 'module') {
      const listKeys = backupReferenceKeys(scope.key);
      listKeys.forEach(function (key) {
        if (Array.isArray(appData.references[key])) state.references[key] = appData.references[key].slice();
      });
      state[scope.key] = JSON.parse(JSON.stringify(appData[scope.key] || []));
      state.history = (appData.history || []).filter(function (item) { return item.module === scope.key; });
      return state;
    }
    return appData;
  }

  async function exportSectionBackup(view) {
    const scope = sectionBackupScope(view);
    if (!scope) { toast('برای این بخش پشتیبان‌گیری تعریف نشده است.'); return; }
    if (scope.kind === 'phonebook') {
      const bridge = window.ATLAS_PHONEBOOK;
      if (!bridge || typeof bridge.snapshot !== 'function') { toast('دفترچه تلفن هنوز آماده نیست.'); return; }
      const phonebook = bridge.snapshot();
      const ok = await askConfirm({
        title: 'پشتیبان‌گیری از دفترچه تلفن',
        message: 'در این فایل فقط ' + faDigits(phonebook.contacts.length) + ' مخاطب دفترچه تلفن و فهرست‌های همان بخش می‌آید؛ کارکنان، مأموریت‌ها، مرخصی‌ها و بقیهٔ بخش‌ها پشتیبان‌گیری نمی‌شوند. ادامه می‌دهی؟',
        confirmLabel: 'ساخت فایل پشتیبان'
      });
      if (!ok) return;
      const payload = {
        app: 'ATLAS SHIFT',
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        scope: { kind: 'phonebook', key: 'phonebook', title: 'دفترچه تلفن' },
        data: { contacts: phonebook.contacts, options: phonebook.options }
      };
      downloadFile('ATLAS-SHIFT-backup-phonebook-' + todayIso() + '.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
      toast('نسخهٔ پشتیبان دفترچه تلفن آماده شد.');
      return;
    }
    const data = buildScopedBackupData(scope);
    const recordCount = scope.kind === 'module' ? (appData[scope.key] || []).length : null;
    const detail = scope.kind === 'module'
      ? 'در این فایل فقط ' + faDigits(recordCount) + ' مورد از «' + scope.title + '» و فهرست‌های کشویی همان بخش می‌آید.'
      : scope.kind === 'config'
        ? 'در این فایل فقط تنظیمات و فهرست‌های کشویی می‌آید؛ هیچ پرونده، مرخصی یا مأموریتی داخل آن نیست.'
        : 'این بخش نمای کلی است؛ فایل پشتیبان همهٔ بخش‌ها را دربر می‌گیرد.';
    const ok = await askConfirm({
      title: 'پشتیبان‌گیری از «' + scope.title + '»',
      message: detail + ' سایر بخش‌ها پشتیبان‌گیری نمی‌شوند. ادامه می‌دهی؟',
      confirmLabel: 'ساخت فایل پشتیبان'
    });
    if (!ok) return;
    const payload = {
      app: 'ATLAS SHIFT',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      scope: { kind: scope.kind, key: scope.key || null, title: scope.title },
      data: data
    };
    const suffix = scope.kind === 'all' ? 'all' : (scope.key || scope.kind);
    downloadFile('ATLAS-SHIFT-backup-' + suffix + '-' + todayIso() + '.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    toast('نسخهٔ پشتیبان «' + scope.title + '» آماده شد.');
  }

  // دکمهٔ پشتیبان‌گیری هر بخش؛ در سربرگ همان منو کنار بقیهٔ دکمه‌ها می‌نشیند.
  function sectionBackupButton(view) {
    if (!sectionBackupScope(view)) return '';
    return '<button type="button" class="secondary-btn module-backup-btn" data-module-action="backup-section" data-view="' + esc(view) + '" title="پشتیبان‌گیری فقط از همین بخش">' +
      '<span class="module-backup-ico" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>' +
      '</span> پشتیبان‌گیری این بخش</button>';
  }

  // اگر بخشی سربرگ استاندارد نداشت، همین دکمه بالای همان بخش تزریق می‌شود تا
  // «پشتیبان‌گیری» در همهٔ منوها در دسترس باشد.
  function effectiveBackupView(view) {
    // خودرو و گازسنج هرکدام زیرتب دارند؛ پشتیبان‌گیری باید همان زیرتبِ باز را بگیرد.
    if (view === 'vehicles') {
      if (vehicleTab === 'service') return 'maintenance';
      if (vehicleTab === 'history' || vehicleTab === 'board') return 'faults';
      return 'vehicles';
    }
    if (view === 'gasmeters') return gasTab === 'logs' ? 'gaslogs' : 'gasmeters';
    return view;
  }

  function mountSectionBackup(view, section) {
    if (!section) return;
    const target = effectiveBackupView(view);
    if (!sectionBackupScope(target)) return;
    const markup = sectionBackupButton(target);
    const slot = section.querySelector('.module-page-actions');
    if (slot) {
      if (!slot.querySelector('[data-module-action="backup-section"]')) slot.insertAdjacentHTML('afterbegin', markup);
      return;
    }
    if (section.querySelector('[data-module-action="backup-section"]')) return;
    const host = section.querySelector('.module-list-head');
    if (host) { host.insertAdjacentHTML('beforeend', '<div class="module-list-actions">' + markup + '</div>'); return; }
    const bar = document.createElement('div');
    bar.className = 'module-section-backup-bar';
    bar.innerHTML = markup;
    section.insertBefore(bar, section.firstChild);
  }

  async function restoreBackup(file) {
    if(!file)return;
    try {
      const raw=await file.text();
      const parsed=JSON.parse(raw);
      const candidate=parsed&&parsed.data?parsed.data:parsed;
      const scope=parsed&&parsed.scope&&typeof parsed.scope==='object'?parsed.scope:null;
      // پشتیبان‌های بخش‌به‌بخش فقط همان بخش را برمی‌گردانند و بقیهٔ اطلاعات
      // دست‌نخورده می‌ماند؛ پشتیبان کامل مثل قبل همه‌چیز را جایگزین می‌کند.
      if(scope&&(scope.kind==='module'||scope.kind==='config'||scope.kind==='phonebook')){
        if(scope.kind==='phonebook'){
          const contacts=Array.isArray(candidate&&candidate.contacts)?candidate.contacts:[];
          if(!contacts.length)throw new Error('فایل پشتیبان دفترچه تلفن معتبر نیست.');
          const okPhonebook=await askConfirm({title:'بازیابی دفترچه تلفن',message:'در این فایل '+faDigits(contacts.length)+' مخاطب است و فقط دفترچه تلفن اضافه یا به‌روز می‌شود؛ بقیهٔ بخش‌ها تغییر نمی‌کند. ادامه می‌دهی؟',confirmLabel:'بازیابی'});
          if(!okPhonebook)return;
          const bridge=window.ATLAS_PHONEBOOK;
          if(!bridge||typeof bridge.merge!=='function')throw new Error('دفترچه تلفن آماده نیست.');
          const result=bridge.merge(contacts,candidate&&candidate.options);
          refreshCurrentView();
          toast('دفترچه تلفن بازیابی شد: '+faDigits(result.added)+' مخاطب تازه و '+faDigits(result.updated)+' به‌روزرسانی.');
          return;
        }
        if(scope.kind==='config'){
          const okConfig=await askConfirm({title:'بازیابی تنظیمات',message:'فقط تنظیمات و فهرست‌های کشویی از فایل جایگزین می‌شود؛ پرونده‌ها، مرخصی‌ها و سایر اطلاعات دست‌نخورده می‌مانند. ادامه می‌دهی؟',confirmLabel:'بازیابی'});
          if(!okConfig)return;
          const incoming=normalizeState(candidate);
          appData.references=incoming.references;
          appData.settings=Object.assign({},appData.settings,incoming.settings);
          const okSaveConfig=await saveState();
          if(!okSaveConfig)return;
          refreshDashboard();refreshCurrentView();
          toast('تنظیمات و فهرست‌های کشویی بازیابی شد.');
          return;
        }
        const moduleKey=String(scope.key||'');
        if(!specs[moduleKey]&&moduleKey!=='shifts')throw new Error('بخش این فایل پشتیبان شناخته نشد.');
        const incomingRecords=Array.isArray(candidate&&candidate[moduleKey])?candidate[moduleKey]:[];
        const title=(SECTION_BACKUP[moduleKey]||{}).title||moduleKey;
        const okModule=await askConfirm({title:'بازیابی «'+title+'»',message:'در این فایل '+faDigits(incomingRecords.length)+' مورد از «'+title+'» است. موارد هم‌شناسه به‌روز و موارد تازه اضافه می‌شوند؛ هیچ بخش دیگری تغییر نمی‌کند و چیزی حذف نمی‌شود. ادامه می‌دهی؟',confirmLabel:'بازیابی'});
        if(!okModule)return;
        const incoming=normalizeState(candidate);
        const byId={};
        (appData[moduleKey]||[]).forEach(function(item){byId[String(item.id)]=item;});
        let added=0,updated=0;
        incoming[moduleKey].forEach(function(item){
          const key=String(item.id);
          if(byId[key]){updated+=1;}else{added+=1;}
          byId[key]=item;
        });
        appData[moduleKey]=Object.keys(byId).map(function(key){return byId[key];});
        const okSaveModule=await saveState();
        if(!okSaveModule)return;
        refreshDashboard();refreshCurrentView();
        toast('بازیابی «'+title+'» انجام شد: '+faDigits(added)+' مورد تازه و '+faDigits(updated)+' به‌روزرسانی.');
        return;
      }
      if(!candidate||!MODULES.every(function(key){return Array.isArray(candidate[key]);}))throw new Error('فایل پشتیبان معتبر نیست.');
      if(!(await askConfirm({title:'بازیابی نسخهٔ پشتیبان',message:'با بازیابی، اطلاعات فعلی و تنظیمات ذخیره‌شدهٔ این دستگاه با اطلاعات فایل جایگزین می‌شود. ادامه می‌دهی؟',confirmLabel:'بازیابی'})))return;
      appData=normalizeState(candidate);
      const ok=await saveState();
      if(!ok)return;
      const ui=parsed&&parsed.uiSettings&&typeof parsed.uiSettings==='object'?parsed.uiSettings:null;
      if(ui){
        [['atlasShiftLayout','layout'],['atlasShiftAppTheme','appTheme'],['atlasShiftCloudBackground','cloudBackground']].forEach(function(pair){
          if(!Object.prototype.hasOwnProperty.call(ui,pair[1]))return;
          try{
            if(typeof ui[pair[1]]==='string')localStorage.setItem(pair[0],ui[pair[1]]);
            else localStorage.removeItem(pair[0]);
          }catch(error){}
        });
        try{window.dispatchEvent(new CustomEvent('atlas-shift-ui-settings-restored'))}catch(error){}
      }
      refreshDashboard();refreshCurrentView();
      toast('بازیابی اطلاعات و تنظیمات با موفقیت انجام شد.');
    } catch(error) {
      toast(error.message||'فایل انتخاب‌شده نسخهٔ پشتیبان معتبر ATLAS SHIFT نیست.');
    }
  }

  // ── کامنت روی هر سابقه (یادداشت، برنامه، اشکال، مأموریت، مرخصی، …) ─────────
  // هر بخشی که فیلد کامنت دارد، دکمهٔ «کامنت» می‌گیرد؛ متن با تاریخ و ساعت شمسی
  // در همان فیلد ثبت و در «سوابق» همان مورد هم ثبت می‌شود.
  const RECORD_COMMENT_FIELDS = {
    employees: 'notes', missions: 'result', leaves: 'reason', stations: 'description',
    notes: 'comments', programs: 'actionsLog', faults: 'steps', maintenance: 'description',
    gaslogs: 'description', gasmeters: 'notes', vehicles: 'notes'
  };

  function recordCommentField(moduleKey) {
    const key = RECORD_COMMENT_FIELDS[moduleKey];
    if (!key) return '';
    return fieldsFor(moduleKey).some(function (field) { return field.key === key; }) ? key : '';
  }

  function recordCommentLines(record, fieldKey) {
    return String(record && record[fieldKey] || '').split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
  }

  function renderCommentButton(moduleKey, record) {
    if (!recordCommentField(moduleKey)) return '';
    return '<button type="button" class="secondary-btn" data-record-comment="' + esc(moduleKey + ':' + record.id) + '">کامنت</button> ';
  }

  function openCommentDialog(moduleKey, recordId) {
    const record = (appData[moduleKey] || []).find(function (item) { return String(item.id) === String(recordId); });
    if (!record) return;
    const fieldKey = recordCommentField(moduleKey);
    if (!fieldKey) { toast('برای این بخش فیلد کامنت تعریف نشده است.'); return; }
    const fieldDef = fieldsFor(moduleKey).find(function (field) { return field.key === fieldKey; }) || { label: 'کامنت' };
    const statusField = fieldsFor(moduleKey).find(function (field) { return field.key === 'status'; });
    const statusValues = statusField ? (statusField.options || []) : [];
    const lines = recordCommentLines(record, fieldKey).reverse();
    const thread = lines.length
      ? lines.map(function (line) {
          return '<div class="record-comment-line">' + esc(line) + '</div>';
        }).join('')
      : '<p class="module-local-note">هنوز کامنتی روی این مورد ثبت نشده است.</p>';
    // مأموریت: سه بخش پایانی فرم (رفع آلودگی، پیوست گزارش، شرح نتیجه) از همین
    // پنجرهٔ کامنت هم اصلاح می‌شوند؛ پس همان کادرها اینجا هم می‌آیند.
    const missionExtras = moduleKey === 'missions'
      ? ((record.hasPollution === 'دارد')
          ? '<div class="atlas-dialog-field"><label for="recordCommentCleared">در پایان عملیات رفع آلودگی انجام شد؟</label>' +
            '<select id="recordCommentCleared" class="atlas-dialog-input"><option value="">بدون تغییر</option>' +
            ['انجام شد','انجام نشد'].map(function (value) {
              return '<option value="' + esc(value) + '"' + (record.pollutionCleared === value ? ' selected' : '') + '>' + esc(value) + '</option>';
            }).join('') + '</select></div>'
          : '') +
        '<div class="atlas-dialog-field"><label for="recordCommentFiles">افزودن به پیوست‌های گزارش</label>' +
        '<input id="recordCommentFiles" class="atlas-dialog-input" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx">' +
        '<small class="module-field-hint">پیوست‌های قبلی (' + faDigits((record.attachments || []).length) + ' مورد) حفظ می‌شوند.</small></div>'
      : '';
    const body =
      '<div class="record-comments">' + thread + '</div>' +
      '<div class="atlas-dialog-field"><label for="recordCommentText">کامنت یا اقدام جدید</label>' +
      '<textarea id="recordCommentText" class="atlas-dialog-input" rows="3" placeholder="' + esc(fieldDef.placeholder || 'تاریخ | شخص | شرح اقدام | وضعیت') + '"></textarea>' +
      '<p class="atlas-dialog-error" data-dialog-error hidden></p></div>' +
      missionExtras +
      (statusValues.length
        ? '<div class="atlas-dialog-field"><label for="recordCommentStatus">وضعیت این مورد (اختیاری)</label>' +
          '<select id="recordCommentStatus" class="atlas-dialog-input"><option value="">بدون تغییر</option>' +
          statusValues.map(function (value) {
            return '<option value="' + esc(value) + '"' + (value === record.status ? ' selected' : '') + '>' + esc(value) + '</option>';
          }).join('') + '</select></div>'
        : '');
    const backdrop = dialogShell({
      title: 'کامنت برای ' + (specs[moduleKey] ? specs[moduleKey].singular : 'مورد'),
      message: recordLabel(moduleKey, record),
      body: body,
      confirmLabel: 'ثبت کامنت',
      hint: 'کامنت با تاریخ و ساعت شمسی در فیلد «' + fieldDef.label + '» و در سوابق همین مورد ثبت می‌شود.'
    });
    const textarea = backdrop.querySelector('#recordCommentText');
    const error = backdrop.querySelector('[data-dialog-error]');
    const statusSelect = backdrop.querySelector('#recordCommentStatus');
    let settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      backdrop.remove();
    }
    backdrop.querySelectorAll('[data-dialog-cancel]').forEach(function (btn) { btn.addEventListener('click', finish); });
    backdrop.addEventListener('click', function (event) { if (event.target === backdrop) finish(); });
    if (textarea) textarea.focus();
    backdrop.querySelector('[data-dialog-ok]').addEventListener('click', async function () {
      const text = String(textarea && textarea.value || '').trim();
      const clearedSelect = backdrop.querySelector('#recordCommentCleared');
      const clearedValue = clearedSelect ? String(clearedSelect.value || '') : '';
      const filesInput = backdrop.querySelector('#recordCommentFiles');
      const files = filesInput && filesInput.files ? Array.from(filesInput.files) : [];
      if (!text && !clearedValue && !files.length) {
        if (error) { error.textContent = 'متن کامنت، وضعیت رفع آلودگی یا پیوست را وارد کن.'; error.hidden = false; }
        if (textarea) textarea.focus();
        return;
      }
      const nextStatus = statusSelect ? String(statusSelect.value || '') : '';
      if (text) {
        const current = String(record[fieldKey] || '').replace(/\s+$/, '');
        const line = [commentStamp(), 'کامنت', text, nextStatus || record.status || ''].filter(Boolean).join(' | ');
        record[fieldKey] = current ? current + '\n' + line : line;
        addHistory(moduleKey, record, 'کامنت', [{ field: fieldDef.label, before: '', after: text.slice(0, 90) }]);
      }
      if (clearedValue && clearedValue !== record.pollutionCleared) {
        addHistory(moduleKey, record, 'اصلاح از کامنت', [{ field: 'رفع آلودگی', before: record.pollutionCleared || '—', after: clearedValue }]);
        record.pollutionCleared = clearedValue;
      }
      if (files.length) {
        const list = Array.isArray(record.attachments) ? record.attachments.slice() : [];
        for (let i = 0; i < files.length; i += 1) list.push(await readFileAsDataUrl(files[i]));
        record.attachments = list;
        addHistory(moduleKey, record, 'پیوست از کامنت', [{ field: 'پیوست‌های گزارش', before: '', after: faDigits(files.length) + ' فایل' }]);
      }
      if (nextStatus && nextStatus !== record.status) {
        addHistory(moduleKey, record, 'تغییر وضعیت', [{ field: 'وضعیت', before: record.status || '—', after: nextStatus }]);
        record.status = nextStatus;
      }
      record.updatedAt = new Date().toISOString();
      finish();
      const saved = await saveState();
      render(currentView, document.getElementById('sectionView'));
      toast(saved ? 'کامنت ثبت شد و در سوابق این مورد آمد.' : 'کامنت ثبت شد ولی ذخیره‌سازی انجام نشد؛ صفحه را نگه دار و دوباره تلاش کن.');
    });
  }

  document.addEventListener('click', function (event) {
    const button = event.target.closest('[data-record-comment]');
    if (!button) return;
    event.preventDefault();
    const parts = String(button.dataset.recordComment || '').split(':');
    if (parts.length < 2) return;
    openCommentDialog(parts[0], parts.slice(1).join(':'));
  });

  // مدت هر مرخصی بر حسب روز (شامل روز شروع و پایان).
  function leaveDayCount(record) {
    const start = toValidDate(record && record.startDate);
    const end = toValidDate(record && record.endDate);
    if (!start || !end || end < start) return 0;
    return Math.round((end - start) / 86400000) + 1;
  }

  // «سوابق» در مرخصی‌ها: همهٔ مرخصی‌های ثبت‌شده برای همان شخص، تازه‌ترین اول،
  // به‌همراه جمع روزها و جمع هر نوع مرخصی.
  function openLeaveHistory(id) {
    const record = (appData.leaves || []).find(function (item) { return String(item.id) === String(id); });
    if (!record) return;
    const employeeId = String(record.employeeId || '');
    const person = (appData.employees || []).find(function (item) { return String(item.id) === employeeId; });
    const personName = person ? (employeeName(person) || person.personnelId) : '';
    const leaves = (appData.leaves || [])
      .filter(function (item) {
        return employeeId ? String(item.employeeId || '') === employeeId : String(item.id) === String(record.id);
      })
      .slice()
      .sort(function (a, b) { return String(b.startDate || '').localeCompare(String(a.startDate || '')); });
    const totalDays = leaves.reduce(function (sum, item) { return sum + leaveDayCount(item); }, 0);
    const usedDays = leaves
      .filter(function (item) { return item.status === 'تأییدشده' || item.status === 'استفاده‌شده'; })
      .reduce(function (sum, item) { return sum + leaveDayCount(item); }, 0);
    const byType = {};
    leaves.forEach(function (item) {
      const key = String(item.leaveType || 'نامشخص');
      byType[key] = (byType[key] || 0) + leaveDayCount(item);
    });
    const typeSummary = Object.keys(byType)
      .map(function (key) { return key + ': ' + faDigits(byType[key]) + ' روز'; })
      .join(' · ');
    const rows = leaves.map(function (item) {
      const days = leaveDayCount(item);
      const isCurrent = String(item.id) === String(record.id);
      return '<tr>' +
        '<td>' + esc(item.leaveType || '—') + (isCurrent ? ' <span class="module-tag">همین درخواست</span>' : '') + '</td>' +
        '<td>' + formatJalali(item.startDate, false) + '</td>' +
        '<td>' + formatJalali(item.endDate, false) + '</td>' +
        '<td>' + (days ? faDigits(days) + ' روز' : '—') + '</td>' +
        '<td>' + statusTag(item.status || 'ثبت‌نشده') + '</td>' +
        '<td>' + esc(item.reason || '—') + '</td>' +
        '</tr>';
    }).join('');
    const changes = (appData.history || []).filter(function (item) {
      return item.module === 'leaves' && item.recordId === String(record.id);
    }).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    const changeRows = changes.map(function (item) {
      const text = (item.changes || []).map(function (change) {
        return change.field + ': «' + change.before + '» ← «' + change.after + '»';
      }).join(' — ');
      return '<li>' + displayDateTime(item.at) + ' · ' + esc(item.action) + (text ? ' · ' + esc(text) : '') + '</li>';
    }).join('');
    // ردیف‌های خروجی همان چیزی است که در پنجره دیده می‌شود، به‌همراه ردیف جمع.
    const exportRows = [['نوع مرخصی', 'از تاریخ', 'تا تاریخ', 'مدت (روز)', 'وضعیت', 'دلیل']];
    leaves.forEach(function (item) {
      exportRows.push([
        String(item.leaveType || ''),
        item.startDate ? formatJalali(item.startDate, false) : '',
        item.endDate ? formatJalali(item.endDate, false) : '',
        String(leaveDayCount(item) || ''),
        String(item.status || ''),
        String(item.reason || '')
      ]);
    });
    exportRows.push(['مجموع', '', '', String(totalDays), '', 'تعداد درخواست: ' + leaves.length]);
    const exportTitle = 'سوابق مرخصی' + (personName ? ' · ' + personName : '') + ' · ATLAS SHIFT';
    const exportBase = 'ATLAS-SHIFT-leaves-' + exportSlug(personName || '', 'person') + '-' + todayIso();
    const exportButtons = leaves.length
      ? '<button type="button" class="secondary-btn" data-leave-export="csv">CSV</button> ' +
        '<button type="button" class="secondary-btn" data-leave-export="xlsx">Excel</button> ' +
        '<button type="button" class="secondary-btn" data-leave-export="docx">Word</button> ' +
        '<button type="button" class="secondary-btn" data-leave-export="png">تصویر PNG</button> ' +
        '<button type="button" class="secondary-btn" data-leave-export="print">چاپ</button> '
      : '';
    const backdrop = document.createElement('div');
    backdrop.className = 'atlas-modal-backdrop';
    backdrop.setAttribute('data-modal-backdrop', '');
    backdrop.innerHTML =
      '<div class="atlas-modal atlas-modal-form" role="dialog" aria-modal="true" aria-labelledby="atlasLeaveHistoryTitle">' +
      '<div class="atlas-modal-head"><div><h3 id="atlasLeaveHistoryTitle">سوابق مرخصی' + (personName ? ' — ' + esc(personName) : '') + '</h3></div>' +
      '<button type="button" class="atlas-modal-close" data-leave-history-close aria-label="بستن پنجره">×</button></div>' +
      '<div class="atlas-modal-body">' +
      '<div class="module-list-head"><div><h3>خلاصهٔ مرخصی‌های این شخص</h3>' +
      '<p>' + faDigits(leaves.length) + ' درخواست ثبت‌شده؛ مجموع ' + faDigits(totalDays) + ' روز' +
      (usedDays ? ' که ' + faDigits(usedDays) + ' روز آن تأییدشده یا استفاده‌شده است' : '') +
      (typeSummary ? ' · ' + esc(typeSummary) : '') + '</p></div>' +
      '<span class="module-tag">' + faDigits(totalDays) + ' روز</span></div>' +
      (leaves.length
        ? '<div class="module-table-wrap" style="width:100%;min-width:0"><table class="module-table"><thead><tr>' +
          '<th>نوع مرخصی</th><th>از تاریخ</th><th>تا تاریخ</th><th>مدت</th><th>وضعیت</th><th>دلیل</th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<div class="module-empty">برای این شخص مرخصی دیگری ثبت نشده است.</div>') +
      (changeRows ? '<section class="module-related-history"><h3>تاریخچهٔ تغییرات همین درخواست</h3><ul class="module-history-list">' + changeRows + '</ul></section>' : '') +
      '</div>' +
      '<div class="module-form-actions"><span class="module-required-help">مرخصی‌های همین شخص، تازه‌ترین اول.</span>' +
      '<div>' + exportButtons + '<button type="button" class="primary-btn" data-leave-history-close>بستن</button></div></div>' +
      '</div>';
    document.body.appendChild(backdrop);
    let closed = false;
    function closeHistory() {
      if (closed) return;
      closed = true;
      backdrop.remove();
    }
    backdrop.querySelectorAll('[data-leave-history-close]').forEach(function (button) {
      button.addEventListener('click', closeHistory);
    });
    backdrop.querySelectorAll('[data-leave-export]').forEach(function (button) {
      button.addEventListener('click', function () {
        runExport(exportRows, exportTitle, exportBase, button.dataset.leaveExport || 'csv');
        toast('خروجی سوابق مرخصی این شخص آماده شد.');
      });
    });
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop) closeHistory();
    });
    backdrop.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeHistory();
    });
    const closeButton = backdrop.querySelector('[data-leave-history-close]');
    if (closeButton) closeButton.focus();
  }

  // ── گزارش افراد در بازه (فقط در بخش پرسنل) ────────────────────────────────
  // برای بازهٔ انتخابی دو تب جدا دارد: «مرخصی‌ها» و «مأموریت‌ها». هر تب فقط
  // موارد خودش را نشان می‌دهد و بازه از بالای همان پنجره قابل تغییر است.
  function rangeReportData(startArg, endArg) {
    const start = startArg || dashboardRange.start || todayIso();
    const end = endArg || dashboardRange.end || start;
    const dayOf = function (value) { return String(value || '').slice(0, 10); };
    const inRange = function (value) {
      const day = dayOf(value);
      return !!day && day >= start && day <= end;
    };
    const overlaps = function (from, to) {
      const a = dayOf(from);
      const b = dayOf(to || from);
      return !!a && !!b && a <= end && b >= start;
    };
    const staff = appData.employees || [];
    const nameOf = function (id) {
      const person = staff.find(function (item) { return String(item.id) === String(id); });
      return person ? employeeName(person) : (id ? 'کارمند حذف‌شده' : 'بدون کارمند');
    };
    const missions = [];
    const leaves = [];
    (appData.missions || []).forEach(function (mission) {
      if (mission.status === 'لغو‌شده') return;
      if (!inRange(mission.startAt)) return;
      const people = [];
      if (mission.employeeId) people.push(String(mission.employeeId));
      if (Array.isArray(mission.crewIds)) mission.crewIds.forEach(function (id) {
        if (id && people.indexOf(String(id)) < 0) people.push(String(id));
      });
      people.forEach(function (id) {
        missions.push({
          person: nameOf(id),
          title: mission.title || 'مأموریت',
          from: dayOf(mission.startAt),
          to: dayOf(mission.endAt),
          status: mission.status || '',
          place: [mission.origin, mission.destination].filter(Boolean).join(' ← ') || String(mission.operationalRange || '')
        });
      });
    });
    (appData.leaves || []).forEach(function (leave) {
      if (leave.status === 'ردشده') return;
      if (!overlaps(leave.startDate, leave.endDate)) return;
      const from = dayOf(leave.startDate);
      const to = dayOf(leave.endDate || leave.startDate);
      const days = from && to ? Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1) : 0;
      leaves.push({
        person: nameOf(leave.employeeId),
        title: leave.leaveType || 'مرخصی',
        from: from,
        to: to,
        days: days,
        status: leave.status || '',
        place: leave.reason ? String(leave.reason).split('\n')[0].slice(0, 60) : ''
      });
    });
    const byDate = function (a, b) {
      return String(a.from).localeCompare(String(b.from)) || String(a.person).localeCompare(String(b.person), 'fa');
    };
    missions.sort(byDate);
    leaves.sort(byDate);
    return { start: start, end: end, missions: missions, leaves: leaves };
  }

  const RANGE_REPORT_TABS = [
    { key: 'leaves', label: 'مرخصی‌ها' },
    { key: 'missions', label: 'مأموریت‌ها' }
  ];

  // بازه‌های آمادهٔ پنجرهٔ گزارش — همان مجموعهٔ نوار بازهٔ داشبورد.
  const RANGE_REPORT_PRESETS = [
    { key: 'today', label: 'امروز' },
    { key: 'yesterday', label: 'دیروز' },
    { key: 'threeDays', label: '۳ روزه' },
    { key: 'week', label: '۷ روزه' },
    { key: 'tenDays', label: '۱۰ روزه' },
    { key: 'month', label: '۱ ماهه' },
    { key: 'threeMonths', label: '۳ ماهه' },
    { key: 'sixMonths', label: '۶ ماهه' },
    { key: 'year', label: 'سال جاری' },
    { key: 'custom', label: 'دلخواه' }
  ];

  function rangeReportPresetLabel(key) {
    const found = RANGE_REPORT_PRESETS.find(function (item) { return item.key === key; });
    return found ? found.label : '';
  }

  function isoDayOf(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function dayOnly(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  }

  function addDays(date, days) {
    const d = dayOnly(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function jalaliMonthStartOf(date) {
    const parts = intlJalaliParts(date);
    return jalaliMonthStartDate(parts.year, parts.month);
  }

  // بازهٔ هر گزینهٔ آماده، دقیقاً با همان قاعدهٔ نوار بازهٔ داشبورد.
  function rangeReportPresetRange(key) {
    const today = dayOnly(new Date());
    let start = today;
    let end = today;
    if (key === 'yesterday') { start = addDays(today, -1); end = start; }
    else if (key === 'threeDays') start = addDays(today, -2);
    else if (key === 'week') start = addDays(today, -6);
    else if (key === 'tenDays') start = addDays(today, -9);
    else if (key === 'month') start = jalaliMonthStartOf(today);
    else if (key === 'threeMonths') start = jalaliMonthStartOf(addDays(today, -62));
    else if (key === 'sixMonths') start = jalaliMonthStartOf(addDays(today, -155));
    else if (key === 'year') start = jalaliYearStart(intlJalaliParts(today).year);
    return { start: isoDayOf(start), end: isoDayOf(end) };
  }

  // مقدار کادر تاریخ شمسی را از بیرون عوض می‌کند (بخش‌های سال/ماه/روز هم به‌روز می‌شوند).
  function setJalaliFieldValue(input, value) {
    if (!input) return;
    const text = formatJalali(value, false);
    const wrap = input.closest('.jalali-field');
    if (!wrap) { input.value = text; return; }
    const parts = splitJalaliText(text);
    ['year', 'month', 'day'].forEach(function (name) {
      const box = wrap.querySelector('[data-jalali-seg="' + name + '"]');
      if (box) box.value = parts[name] || '';
    });
    syncJalaliField(wrap);
  }

  function rangeReportTabLabel(key) {
    const found = RANGE_REPORT_TABS.find(function (item) { return item.key === key; });
    return found ? found.label : '';
  }

  function rangeReportTable(tab, report) {
    const rows = tab === 'leaves' ? report.leaves : report.missions;
    if (!rows.length) {
      return '<div class="module-empty">' + (tab === 'leaves'
        ? 'در این بازه مرخصی‌ای ثبت نشده است.'
        : 'در این بازه مأموریتی ثبت نشده است.') + '</div>';
    }
    const head = tab === 'leaves'
      ? ['کارمند', 'نوع مرخصی', 'از تاریخ', 'تا تاریخ', 'روز', 'وضعیت']
      : ['کارمند', 'عنوان مأموریت', 'از تاریخ', 'تا تاریخ', 'وضعیت', 'محل / مقصد'];
    const body = rows.map(function (row) {
      const cells = tab === 'leaves'
        ? [row.person, row.title, formatJalali(row.from, false), row.to ? formatJalali(row.to, false) : '—', faDigits(row.days), row.status || '—']
        : [row.person, row.title, formatJalali(row.from, false), row.to ? formatJalali(row.to, false) : '—', row.status || '—', row.place || '—'];
      return '<tr>' + cells.map(function (cell) { return '<td>' + esc(cell) + '</td>'; }).join('') + '</tr>';
    }).join('');
    return '<div class="module-table-wrap" style="width:100%;min-width:0"><table class="module-table"><thead><tr>' +
      head.map(function (label) { return '<th>' + esc(label) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function rangeReportExport(tab, report) {
    if (tab === 'leaves') {
      const rows = [['کارمند', 'نوع مرخصی', 'از تاریخ', 'تا تاریخ', 'تعداد روز', 'وضعیت']];
      report.leaves.forEach(function (row) {
        rows.push([row.person, row.title, formatJalali(row.from, false), row.to ? formatJalali(row.to, false) : '', faDigits(row.days), row.status]);
      });
      return { rows: rows, title: 'مرخصی‌های افراد', base: 'ATLAS-SHIFT-leaves-' + report.start + '_' + report.end };
    }
    const rows = [['کارمند', 'عنوان مأموریت', 'از تاریخ', 'تا تاریخ', 'وضعیت', 'محل / مقصد']];
    report.missions.forEach(function (row) {
      rows.push([row.person, row.title, formatJalali(row.from, false), row.to ? formatJalali(row.to, false) : '', row.status, row.place]);
    });
    return { rows: rows, title: 'مأموریت‌های افراد', base: 'ATLAS-SHIFT-missions-' + report.start + '_' + report.end };
  }

  function openRangeReport() {
    let range = {
      start: dashboardRange.start || todayIso(),
      end: dashboardRange.end || dashboardRange.start || todayIso()
    };
    let preset = RANGE_REPORT_PRESETS.some(function (item) { return item.key === dashboardRange.name; })
      ? dashboardRange.name
      : 'custom';
    let tab = 'leaves';
    const backdrop = document.createElement('div');
    backdrop.className = 'atlas-modal-backdrop';
    backdrop.setAttribute('data-modal-backdrop', '');
    backdrop.setAttribute('data-modal-kind', 'range-report');
    backdrop.innerHTML =
      '<div class="atlas-modal atlas-modal-range-report" role="dialog" aria-modal="true" aria-labelledby="atlasRangeReportTitle">' +
        '<div class="atlas-modal-head"><div><h3 id="atlasRangeReportTitle">گزارش افراد در بازه</h3>' +
          '<p data-range-caption></p></div>' +
          '<button type="button" class="atlas-modal-close" data-range-close aria-label="بستن پنجره">×</button></div>' +
        '<div class="range-report-toolbar">' +
          '<div class="range-presets range-report-presets" role="group" aria-label="بازه‌های آماده">' +
            RANGE_REPORT_PRESETS.map(function (item) {
              return '<button type="button" class="range-chip" data-range-preset="' + item.key + '">' + item.label + '</button>';
            }).join('') +
          '</div>' +
          '<label class="module-field"><span>از تاریخ</span><input type="text" data-jalali-input="jalali" data-range-from value="' + esc(formatJalali(range.start, false)) + '" placeholder="۱۴۰۵/۰۷/۰۱"></label>' +
          '<label class="module-field"><span>تا تاریخ</span><input type="text" data-jalali-input="jalali" data-range-to value="' + esc(formatJalali(range.end, false)) + '" placeholder="۱۴۰۵/۰۷/۳۰"></label>' +
          '<button type="button" class="primary-btn" data-range-apply>اعمال بازه</button>' +
          '<div class="module-subtabs" role="tablist" aria-label="نوع گزارش">' +
            RANGE_REPORT_TABS.map(function (item) {
              return '<button type="button" role="tab" class="module-subtab" data-range-tab="' + item.key + '">' + item.label + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="atlas-modal-body" data-range-panel></div>' +
        '<div class="module-form-actions"><span class="module-required-help" data-range-note></span><div>' +
          '<button type="button" class="secondary-btn" data-range-export="csv">CSV</button> ' +
          '<button type="button" class="secondary-btn" data-range-export="xlsx">Excel</button> ' +
          '<button type="button" class="secondary-btn" data-range-export="docx">Word</button> ' +
          '<button type="button" class="secondary-btn" data-range-export="png">تصویر PNG</button> ' +
          '<button type="button" class="secondary-btn" data-range-export="print">چاپ / PDF</button> ' +
          '<button type="button" class="primary-btn" data-range-close>بستن</button>' +
        '</div></div>' +
      '</div>';
    document.body.appendChild(backdrop);
    enhanceJalaliInputs(backdrop);

    const panel = backdrop.querySelector('[data-range-panel]');
    const caption = backdrop.querySelector('[data-range-caption]');
    const note = backdrop.querySelector('[data-range-note]');
    const tabButtons = Array.prototype.slice.call(backdrop.querySelectorAll('[data-range-tab]'));
    const presetButtons = Array.prototype.slice.call(backdrop.querySelectorAll('[data-range-preset]'));

    function paint() {
      const report = rangeReportData(range.start, range.end);
      const rangeLabel = formatJalali(report.start, false) + ' تا ' + formatJalali(report.end, false);
      const counts = { leaves: report.leaves.length, missions: report.missions.length };
      tabButtons.forEach(function (button) {
        const key = button.dataset.rangeTab;
        const active = key === tab;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.textContent = rangeReportTabLabel(key) + ' (' + faDigits(counts[key] || 0) + ')';
      });
      presetButtons.forEach(function (button) {
        const active = button.dataset.rangePreset === preset;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      caption.textContent = (preset === 'custom' ? '' : rangeReportPresetLabel(preset) + ' · ') +
        rangeLabel + ' · ' + faDigits(counts.leaves) + ' مرخصی · ' + faDigits(counts.missions) + ' مأموریت';
      panel.innerHTML = rangeReportTable(tab, report);
      note.textContent = 'خروجی از همین تب (' + rangeReportTabLabel(tab) + ') ساخته می‌شود.';
    }

    let closed = false;
    function closeReport() {
      if (closed) return;
      closed = true;
      backdrop.remove();
    }

    backdrop.addEventListener('click', function (event) {
      const tabButton = event.target.closest('[data-range-tab]');
      if (tabButton) {
        tab = tabButton.dataset.rangeTab;
        paint();
        return;
      }
      const presetButton = event.target.closest('[data-range-preset]');
      if (presetButton) {
        const key = presetButton.dataset.rangePreset;
        if (key === 'custom') {
          preset = 'custom';
          paint();
          const fromInput = backdrop.querySelector('[data-range-from]');
          const wrap = fromInput ? fromInput.closest('.jalali-field') : null;
          const box = wrap ? wrap.querySelector('[data-jalali-seg="year"]') : null;
          if (box) box.focus();
          return;
        }
        const next = rangeReportPresetRange(key);
        range = { start: next.start, end: next.end };
        preset = key;
        setJalaliFieldValue(backdrop.querySelector('[data-range-from]'), range.start);
        setJalaliFieldValue(backdrop.querySelector('[data-range-to]'), range.end);
        paint();
        return;
      }
      if (event.target.closest('[data-range-apply]')) {
        const fromInput = backdrop.querySelector('[data-range-from]');
        const toInput = backdrop.querySelector('[data-range-to]');
        const from = parseJalali(fromInput ? fromInput.value : '', false);
        const to = parseJalali(toInput ? toInput.value : '', false);
        if (!from || !to) { toast('تاریخ بازه را به شکل شمسی ۱۴۰۵/۰۷/۲۸ وارد کن.'); return; }
        if (from > to) { toast('تاریخ پایان نباید قبل از تاریخ شروع باشد.'); return; }
        range = { start: from, end: to };
        preset = 'custom';
        paint();
        return;
      }
      const exportButton = event.target.closest('[data-range-export]');
      if (exportButton) {
        const report = rangeReportData(range.start, range.end);
        const pack = rangeReportExport(tab, report);
        if (pack.rows.length < 2) { toast('برای این بازه داده‌ای برای خروجی وجود ندارد.'); return; }
        runExport(pack.rows, pack.title + ' · ' + formatJalali(report.start, false) + ' تا ' + formatJalali(report.end, false) + ' · ATLAS SHIFT', pack.base, exportButton.dataset.rangeExport || 'csv');
        toast('خروجی گزارش بازه آماده شد.');
        return;
      }
      if (event.target.closest('[data-range-close]')) { closeReport(); return; }
      if (event.target === backdrop) closeReport();
    });
    backdrop.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeReport(); });

    paint();
    const closeButton = backdrop.querySelector('[data-range-close]');
    if (closeButton) closeButton.focus();
  }

  function openHistory(moduleKey, id) {
    const record=appData[moduleKey].find(function(item){return String(item.id)===String(id);});
    const rows=appData.history.filter(function(item){return item.module===moduleKey&&item.recordId===String(id);})
      .sort(function(a,b){return String(b.at).localeCompare(String(a.at));});
    const textRows=rows.map(function(item){
      const changes=(item.changes||[]).map(function(change){return change.field+': «'+change.before+'» ← «'+change.after+'»';}).join('\n');
      return displayDateTime(item.at)+' | '+item.action+(changes?'\n'+changes:'');
    });
    return askText({
      title: 'سابقهٔ تغییرات',
      message: record ? recordLabel(moduleKey, record) : 'سوابق',
      text: textRows.join('\n\n') || 'سابقه‌ای ثبت نشده است.'
    });
  }

  document.addEventListener('click', async function(event) {
    const button=event.target.closest('[data-shift-action]');
    if(!button)return;
    const action=button.dataset.shiftAction;
    const section=document.getElementById('sectionView');
    if(action==='new'||action==='edit'){
      shiftFormState={open:true,id:action==='edit'?button.dataset.id:null};
      render('employees',section);
      const form=section&&section.querySelector('[data-shift-form]');
      if(form)form.scrollIntoView({behavior:'smooth',block:'start'});
    }else if(action==='cancel'){
      shiftFormState={open:false,id:null};render('employees',section);
    }else if(action==='delete'){
      const record=(appData.shifts||[]).find(function(item){return String(item.id)===String(button.dataset.id);});
      if(!record)return;
      if(!(await askConfirm({title:'حذف برنامهٔ شیفت',message:'برنامهٔ شیفت این مورد حذف شود؟',confirmLabel:'حذف',danger:true})))return;
      appData.shifts=appData.shifts.filter(function(item){return String(item.id)!==String(record.id);});
      addShiftHistory(record,'حذف',[]);
      if(await saveState()){render('employees',section);refreshDashboard();toast('برنامهٔ شیفت حذف شد.');}
    }
  });

  document.addEventListener('click', async function(event) {
    const inline=event.target.closest('[data-add-list-option]');
    if(inline){
      const field=inline.closest('.module-field');
      if(!field)return;
      const open=field.querySelector('.module-add-option-form');
      if(open){const current=open.querySelector('input');if(current)current.focus();return;}
      const wrap=document.createElement('span');
      wrap.className='module-add-option-form';
      wrap.innerHTML='<input type="text" autocomplete="off" placeholder="گزینهٔ جدید" aria-label="گزینهٔ جدید">' +
        '<button type="button" class="primary-btn" data-add-list-confirm>ثبت</button>' +
        '<button type="button" class="secondary-btn" data-add-list-cancel aria-label="بستن">×</button>';
      const holder=field.querySelector('.module-select-with-add')||inline;
      holder.insertAdjacentElement('afterend',wrap);
      const box=wrap.querySelector('input');
      if(box){
        box.focus();
        box.addEventListener('keydown',function(ev){
          if(ev.key==='Enter'){ev.preventDefault();const go=wrap.querySelector('[data-add-list-confirm]');if(go)go.click();}
          else if(ev.key==='Escape'){ev.preventDefault();wrap.remove();}
        });
      }
      return;
    }
    if(event.target.closest('[data-add-list-cancel]')){
      const wrap=event.target.closest('.module-add-option-form');
      if(wrap)wrap.remove();
      return;
    }
    const confirmInline=event.target.closest('[data-add-list-confirm]');
    if(confirmInline){
      const wrap=confirmInline.closest('.module-add-option-form');
      const field=confirmInline.closest('.module-field');
      const box=wrap&&wrap.querySelector('input');
      const toggle=field&&field.querySelector('[data-add-list-option]');
      const key=referenceBaseKey(toggle?toggle.dataset.addListOption:'');
      const clean=String(box&&box.value||'').trim();
      if(!key||!wrap)return;
      if(!clean){toast('عنوان گزینه را وارد کن.');if(box)box.focus();return;}
      if(!Array.isArray(appData.references[key]))appData.references[key]=[];
      if(appData.references[key].includes(clean)){toast('این گزینه از قبل وجود دارد.');if(box)box.select();return;}
      appData.references[key].push(clean);
      if(await saveState()){
        const select=field.querySelector('select');
        if(select){const option=document.createElement('option');option.value=clean;option.textContent=clean;option.selected=true;select.appendChild(option);}
        wrap.remove();
        toast('گزینه به فهرست مشترک «'+referenceListTitle(key)+'» افزوده شد.');
      }
      return;
    }
    const button=event.target.closest('[data-module-action]');
    if(!button)return;
    const action=button.dataset.moduleAction;
    const moduleKey=button.dataset.view||new URLSearchParams(window.location.search).get('view')||'dashboard';
    if(action==='reference-add'||action==='reference-edit'||action==='reference-delete'||action==='reference-up'||action==='reference-down'){
      const listKey=referenceBaseKey(button.dataset.listKey||'');
      if(!listKey||!Array.isArray(appData.references[listKey]))return;
      const list=appData.references[listKey];
      const title=referenceListTitle(listKey);
      const sharedCount=referenceConsumers(listKey).length;
      const sharedNote=sharedCount>1?' این تغییر در '+faDigits(sharedCount)+' فیلد مشترک اعمال شد.':'';
      if(action==='reference-add'){
        const input=document.querySelector('[data-reference-input="'+listKey+'"]');
        const value=String(input&&input.value||'').trim();
        if(!value){toast('عنوان گزینه را وارد کن.');if(input)input.focus();return;}
        if(list.includes(value)){toast('این گزینه از قبل وجود دارد.');if(input)input.select();return;}
        list.push(value);
        if(input)input.value='';
        if(await saveState()){refreshReferenceCard(listKey);toast('گزینه به «'+title+'» افزوده شد.'+sharedNote);if(input)input.focus();}
        return;
      }
      const i=Number(button.dataset.index);
      if(!(i>=0)||i>=list.length)return;
      if(action==='reference-edit'){
        const value=await askPrompt({title:'ویرایش گزینهٔ «'+title+'»',label:'عنوان جدید',value:list[i],confirmLabel:'ذخیره'});
        if(value===null)return;
        const next=String(value).trim();
        if(!next||next===list[i])return;
        if(list.includes(next)){toast('این گزینه از قبل وجود دارد.');return;}
        const previous=list[i];
        list[i]=next;
        MODULES.forEach(function(m){
          (specs[m].fields||[]).forEach(function(field){
            if(!field.listKey||referenceBaseKey(field.listKey)!==listKey)return;
            (appData[m]||[]).forEach(function(record){
              const current=record[field.key];
              if(current===previous)record[field.key]=next;
              else if(Array.isArray(current)){
                if(field.type==='rows'){
                  current.forEach(function(row){
                    if(!row||typeof row!=='object')return;
                    (field.columns||[]).forEach(function(column){
                      if(column.listKey&&referenceBaseKey(column.listKey)===listKey&&row[column.key]===previous)row[column.key]=next;
                    });
                  });
                }else{
                  record[field.key]=current.map(function(item){return item===previous?next:item;});
                }
              }
            });
          });
        });
        if(await saveState()){refreshReferenceCard(listKey);toast('نام گزینه اصلاح شد.'+sharedNote);}
        return;
      }
      if(action==='reference-delete'){
        if(!(await askConfirm({title:'حذف گزینه از «'+title+'»',message:'گزینه از این فهرست مشترک حذف شود؟ سوابق قبلی و مقدارهای ثبت‌شده پاک نمی‌شوند.',confirmLabel:'حذف',danger:true})))return;
        list.splice(i,1);
        if(await saveState()){refreshReferenceCard(listKey);toast('گزینه حذف شد.'+sharedNote);}
        return;
      }
      const nextIndex=action==='reference-up'?i-1:i+1;
      if(nextIndex<0||nextIndex>=list.length)return;
      const swap=list[nextIndex];
      list[nextIndex]=list[i];
      list[i]=swap;
      if(await saveState())refreshReferenceCard(listKey);
      return;
    }
    if(action==='custom-field-add'||action==='custom-field-remove'){
      const block=button.closest('[data-custom-fields-block]');
      const rows=block&&block.querySelector('[data-custom-field-rows]');
      if(!rows)return;
      if(action==='custom-field-add'){
        if(rows.querySelectorAll('[data-custom-field-row]').length>=20){toast('حداکثر ۲۰ فیلد سفارشی تعریف کن.');return;}
        rows.insertAdjacentHTML('beforeend',customFieldRowHtml(''));
        const fresh=rows.lastElementChild&&rows.lastElementChild.querySelector('[data-cf-label]');
        if(fresh)fresh.focus();
      }else{
        const row=button.closest('[data-custom-field-row]');
        if(row)row.remove();
      }
      return;
    }
    if(action==='custom-field-save'){
      const block=button.closest('[data-custom-fields-block]');
      if(!block)return;
      const lines=Array.from(block.querySelectorAll('[data-custom-field-row]')).map(function(row){
        const label=String((row.querySelector('[data-cf-label]')||{}).value||'').trim();
        const type=String((row.querySelector('[data-cf-type]')||{}).value||'text').trim();
        return label?label+'|'+(CUSTOM_FIELD_TYPES[type]?type:'text'):'';
      }).filter(Boolean);
      if(lines.length>20){toast('حداکثر ۲۰ فیلد سفارشی تعریف کن.');return;}
      const previous=String(appData.settings.employeeCustomFields||'');
      appData.settings.employeeCustomFields=lines.join('\n');
      if(!(await saveState()))return;
      if(previous!==appData.settings.employeeCustomFields && formState.employees && formState.employees.open){
        // مقدارهای تایپ‌شده در همین فرم حفظ می‌شود و فرم با فیلدهای تازه دوباره ساخته می‌شود.
        const liveForm=block.closest('[data-module-form]');
        if(liveForm){
          formState.employees.preset=Object.assign({}, formState.employees.preset||{}, liveFormValues(liveForm));
          const backdrop=liveForm.closest('[data-modal-backdrop]');
          if(backdrop)backdrop.remove();
          document.body.insertAdjacentHTML('beforeend',renderForm('employees',appData));
          enhanceJalaliInputs(document.body);
        }
      }
      toast('فیلدهای سفارشی ذخیره شدند.');
      return;
    }
    const section=document.getElementById('sectionView');
    if(action==='new'||action==='edit'){
      if(!specs[moduleKey])return;
      formState[moduleKey]={open:true,id:action==='edit'?button.dataset.id:null};
      render(moduleKey,section);
    }else if(action==='cancel'){
      delete formState[moduleKey];closeModal(moduleKey);
    }else if(action==='delete'){
      if(!specs[moduleKey])return;
      const record=appData[moduleKey].find(function(item){return String(item.id)===String(button.dataset.id);});
      if(!record)return;
      if(!(await askConfirm({title:'حذف مورد',message:'«'+recordLabel(moduleKey,record)+'» حذف شود؟',confirmLabel:'حذف',danger:true})))return;
      appData[moduleKey]=appData[moduleKey].filter(function(item){return String(item.id)!==String(button.dataset.id);});
      addHistory(moduleKey,record,'حذف',[]);
      if(await saveState()){render(moduleKey,section);refreshDashboard();toast('مورد حذف شد.')}
    }else if(action==='bulk-files'||action==='bulk-history'){
      if(!specs[moduleKey])return;
      const selected=Array.from(section.querySelectorAll('[data-record-select]:checked')).map(function(box){return box.value;});
      if(!selected.length){toast('ابتدا یک یا چند ردیف را انتخاب کن.');return;}
      document.dispatchEvent(new CustomEvent('atlas-open-files',{detail:{
        module:moduleKey,
        ids:selected,
        mode:action==='bulk-history'?'history':'files'
      }}));
    }else if(action==='bulk-invert'){
      section.querySelectorAll('[data-record-select]').forEach(function(box){box.checked=!box.checked;});
      syncSelectAllBoxes(section);
    }else if(action==='bulk-clear'){
      section.querySelectorAll('[data-record-select]').forEach(function(box){box.checked=false;});
      syncSelectAllBoxes(section);
    }else if(action==='bulk-delete'){
      if(!specs[moduleKey])return;
      const selected=Array.from(section.querySelectorAll('[data-record-select]:checked')).map(function(box){return box.value;});
      if(!selected.length){toast('ابتدا یک یا چند ردیف را انتخاب کن.');return;}
      if(!(await askConfirm({title:'حذف گروهی',message:'تعداد '+faDigits(selected.length)+' مورد انتخاب‌شده حذف شود؟',confirmLabel:'حذف '+faDigits(selected.length)+' مورد',danger:true})))return;
      const removed=appData[moduleKey].filter(function(item){return selected.includes(String(item.id));});
      appData[moduleKey]=appData[moduleKey].filter(function(item){return !selected.includes(String(item.id));});
      removed.forEach(function(record){addHistory(moduleKey,record,'حذف گروهی',[]);});
      if(await saveState()){render(moduleKey,section);refreshDashboard();toast('موارد انتخاب‌شده حذف شدند.')}
    }else if(action==='export-toggle'){
      const menu=button.closest('[data-export-menu]');
      const list=menu&&menu.querySelector('.module-export-list');
      if(list){list.hidden=!list.hidden;button.setAttribute('aria-expanded',String(!list.hidden));}
    }else if(action==='export-columns'&&specs[moduleKey]){
      const menu=button.closest('[data-export-menu]');
      const list=menu&&menu.querySelector('.module-export-list');
      if(list)list.hidden=true;
      document.body.insertAdjacentHTML('beforeend',exportColumnsModal(moduleKey));
    }else if(action==='export-columns-cancel'){
      const modal=button.closest('[data-modal-backdrop]');
      if(modal)modal.remove();
    }else if(action==='export-columns-all'){
      const modal=button.closest('[data-modal-backdrop]');
      if(modal)modal.querySelectorAll('[data-export-columns] input').forEach(function(box){box.checked=true;});
    }else if(action==='export-columns-save'&&specs[moduleKey]){
      const modal=button.closest('[data-modal-backdrop]');
      const picked=modal?Array.from(modal.querySelectorAll('[data-export-columns] input:checked')).map(function(box){return box.value;}):[];
      if(!picked.length){toast('حداقل یک ستون را انتخاب کن.');return;}
      if(!appData.settings.exportColumns)appData.settings.exportColumns={};
      appData.settings.exportColumns[moduleKey]=picked;
      if(await saveState()){
        if(modal)modal.remove();
        toast('ستون‌های گزارش ذخیره شد؛ خروجی‌ها فقط همین ستون‌ها را دارند.');
        render(moduleKey,section);
      }
    }else if(action==='columns-open'&&specs[moduleKey]){
      document.body.insertAdjacentHTML('beforeend',columnsModal(moduleKey));
    }else if(action==='columns-cancel'){
      const modal=button.closest('[data-modal-backdrop]');
      if(modal)modal.remove();
    }else if(action==='columns-all'){
      const modal=button.closest('[data-modal-backdrop]');
      if(modal)modal.querySelectorAll('[data-column-list] input').forEach(function(box){box.checked=true;});
    }else if(action==='column-move'){
      const row=button.closest('[data-col-key]');
      const list=row&&row.parentElement;
      if(!row||!list)return;
      if(button.dataset.dir==='up'&&row.previousElementSibling)list.insertBefore(row,row.previousElementSibling);
      else if(button.dataset.dir==='down'&&row.nextElementSibling)list.insertBefore(row.nextElementSibling,row);
      updateColumnMoveButtons(list);
    }else if(action==='columns-save'&&specs[moduleKey]){
      const modal=button.closest('[data-modal-backdrop]');
      const list=modal?modal.querySelector('[data-column-list]'):null;
      if(!list)return;
      const order=Array.from(list.querySelectorAll('[data-col-key]')).map(function(row){return row.dataset.colKey;});
      const visible=Array.from(list.querySelectorAll('input:checked')).map(function(box){return box.value;});
      if(!visible.length){toast('حداقل یک عنوان را انتخاب کن.');return;}
      const hidden=order.filter(function(key){return visible.indexOf(key)<0;});
      if(!appData.settings.columnPrefs)appData.settings.columnPrefs={};
      appData.settings.columnPrefs[moduleKey]={order:order,hidden:hidden};
      if(await saveState()){
        if(modal)modal.remove();
        toast('عناوین جدول ذخیره شد.');
        render(moduleKey,section);
      }
    }else if(action==='export'&&specs[moduleKey]){
      const menu=button.closest('[data-export-menu]');
      const list=menu&&menu.querySelector('.module-export-list');
      if(list)list.hidden=true;
      exportModule(moduleKey, button.dataset.format||'csv');
    }else if(action==='export-report'){
      const selector=document.getElementById('reportExportFormat');
      const format=selector?selector.value:'csv';
      if(format==='xlsx')exportReportXlsx();
      else if(format==='docx')exportReportDocx();
      else if(format==='png')exportRowsPng(currentReportRows(), currentReportTitle(), 'ATLAS-SHIFT-report-'+todayIso()+'.png');
      else exportReportCsv();
    }else if(action==='export-all'){
      exportAllCsv();
    }else if(action==='print'){
      if(specs[moduleKey])printRows(moduleExportRows(moduleKey), moduleExportTitle(moduleKey));
      else if(document.getElementById('reportExportFormat'))printRows(currentReportRows(), currentReportTitle());
      else window.print();
    }else if(action==='backup'){
      exportBackup();
    }else if(action==='backup-section'){
      await exportSectionBackup(button.dataset.view||currentView);
    }else if(action==='toggle-test-mode'){
      toggleTestMode();
    }else if(action==='clear-test-data'){
      clearTestData();
    }else if(action==='restore-select'){
      const input=document.getElementById('atlasRestoreFile');if(input)input.click();
    }else if(action==='range-report'){
      openRangeReport();
    }else if(action==='history'&&specs[moduleKey]){
      openHistory(moduleKey,button.dataset.id);
    }else if(action==='leave-history'){
      openLeaveHistory(button.dataset.id);
    }else if(action==='file'&&specs[moduleKey]){
      document.dispatchEvent(new CustomEvent('atlas-open-file',{detail:{module:moduleKey,id:button.dataset.id}}));
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
      enhanceJalaliInputs(section);
    }
  });

  // ---- پنجره‌های پرسش داخلی ----
  // در حالت نصب‌شدهٔ PWA روی iOS، prompt() اجرا نمی‌شود و null برمی‌گرداند؛ پس هر پرسش
  // (تأیید، ویرایش مقدار، نمایش سابقه) داخل خود برنامه و با ظاهر یکسان انجام می‌شود.
  let dialogCounter = 0;

  function dialogShell(options) {
    const opts = options || {};
    dialogCounter += 1;
    const titleId = 'atlasDialogTitle' + dialogCounter;
    const backdrop = document.createElement('div');
    backdrop.className = 'atlas-modal-backdrop atlas-dialog-backdrop';
    backdrop.setAttribute('data-modal-backdrop', '');
    backdrop.setAttribute('data-modal-kind', 'dialog');
    backdrop.innerHTML =
      '<div class="atlas-modal atlas-dialog" role="dialog" aria-modal="true" aria-labelledby="' + titleId + '">' +
      '<div class="atlas-modal-head"><div><h3 id="' + titleId + '">' + esc(opts.title || 'تأیید') + '</h3>' +
      (opts.message ? '<p>' + esc(opts.message) + '</p>' : '') + '</div>' +
      '<button type="button" class="atlas-modal-close" data-dialog-cancel aria-label="بستن پنجره">×</button></div>' +
      '<div class="atlas-modal-body">' + (opts.body || '') +
      '<div class="module-form-actions"><span class="module-required-help">' + esc(opts.hint || '') + '</span><div>' +
      (opts.cancelLabel === null ? '' :
        '<button type="button" class="secondary-btn" data-dialog-cancel>' + esc(opts.cancelLabel || 'انصراف') + '</button> ') +
      '<button type="button" class="primary-btn' + (opts.danger ? ' atlas-dialog-danger' : '') + '" data-dialog-ok>' +
      esc(opts.confirmLabel || 'تأیید') + '</button>' +
      '</div></div></div></div>';
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function askConfirm(options) {
    return new Promise(function (resolve) {
      const backdrop = dialogShell(options);
      let settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        backdrop.remove();
        resolve(value);
      }
      backdrop.querySelectorAll('[data-dialog-cancel]').forEach(function (btn) {
        btn.addEventListener('click', function () { finish(false); });
      });
      backdrop.querySelector('[data-dialog-ok]').addEventListener('click', function () { finish(true); });
      backdrop.addEventListener('click', function (event) { if (event.target === backdrop) finish(false); });
      const ok = backdrop.querySelector('[data-dialog-ok]');
      if (ok) ok.focus();
    });
  }

  function askPrompt(options) {
    return new Promise(function (resolve) {
      const opts = options || {};
      dialogCounter += 1;
      const inputId = 'atlasDialogInput' + dialogCounter;
      const value = opts.value == null ? '' : String(opts.value);
      const field =
        '<div class="atlas-dialog-field">' +
        (opts.label ? '<label for="' + inputId + '">' + esc(opts.label) + '</label>' : '') +
        (opts.multiline
          ? '<textarea id="' + inputId + '" class="atlas-dialog-input" rows="3">' + esc(value) + '</textarea>'
          : '<input id="' + inputId + '" class="atlas-dialog-input" type="text" value="' + esc(value) + '"' +
            (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') + '>') +
        '<p class="atlas-dialog-error" data-dialog-error hidden></p></div>';
      const backdrop = dialogShell(Object.assign({}, opts, { body: field }));
      const input = backdrop.querySelector('#' + inputId);
      const error = backdrop.querySelector('[data-dialog-error]');
      let settled = false;
      function finish(result) {
        if (settled) return;
        settled = true;
        backdrop.remove();
        resolve(result);
      }
      function submit() {
        const next = String(input.value || '').trim();
        if (!next && opts.required !== false) {
          error.textContent = 'این مقدار نمی‌تواند خالی باشد.';
          error.hidden = false;
          input.focus();
          return;
        }
        finish(next);
      }
      backdrop.querySelectorAll('[data-dialog-cancel]').forEach(function (btn) {
        btn.addEventListener('click', function () { finish(null); });
      });
      backdrop.querySelector('[data-dialog-ok]').addEventListener('click', submit);
      backdrop.addEventListener('click', function (event) { if (event.target === backdrop) finish(null); });
      backdrop.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !opts.multiline) { event.preventDefault(); submit(); }
      });
      input.focus();
      input.select();
    });
  }

  function askText(options) {
    const opts = options || {};
    return new Promise(function (resolve) {
      const backdrop = dialogShell({
        title: opts.title,
        message: opts.message,
        body: '<pre class="atlas-dialog-text">' + esc(opts.text || '') + '</pre>',
        confirmLabel: opts.confirmLabel || 'بستن',
        cancelLabel: null
      });
      let settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        backdrop.remove();
        resolve();
      }
      backdrop.querySelectorAll('[data-dialog-cancel], [data-dialog-ok]').forEach(function (btn) {
        btn.addEventListener('click', finish);
      });
      backdrop.addEventListener('click', function (event) { if (event.target === backdrop) finish(); });
    });
  }

  // پنجره‌هایی که مستقیم به body اضافه می‌شوند (مثل «+ سابقه» یا انتخاب ستون‌های گزارش)
  // با رندر دوبارهٔ بخش حذف نمی‌شوند و باید صریح بسته شوند.
  function clearDetachedModals() {
    closeOpenCombos();
    document.querySelectorAll('body > [data-modal-backdrop]').forEach(function (node) { node.remove(); });
  }

  function closeModal(view) {
    // هر فهرست باز (کشویی/سالنامه) با بسته شدن پنجره هم بسته می‌شود.
    closeOpenCombos();
    if (jalaliPopover) jalaliPopover.hidden = true;
    const backdrops = document.querySelectorAll('[data-modal-backdrop]');
    const backdrop = backdrops.length ? backdrops[backdrops.length - 1] : null;
    if (backdrop && backdrop.dataset.modalKind === 'dialog') {
      const cancel = backdrop.querySelector('[data-dialog-cancel]');
      if (cancel) cancel.click();
      else backdrop.remove();
      return true;
    }
    if (backdrop && backdrop.dataset.modalKind === 'shift') {
      shiftFormState = { open: false, id: null };
      const host = document.getElementById('sectionView');
      if (host) render('employees', host);
      return true;
    }
    const host = document.getElementById('sectionView');
    if (backdrop && (!host || !host.contains(backdrop))) {
      delete formState[backdrop.dataset.view];
      backdrop.remove();
      return true;
    }
    const target = view || (backdrop ? backdrop.dataset.view : '');
    if (!target) return false;
    delete formState[target];
    const section = document.getElementById('sectionView');
    if (section) render(target, section);
    return true;
  }

  // کلیک روی پس‌زمینهٔ تیره (بیرون از پنجره) یا کلید Escape، پنجرهٔ فرم را می‌بندد.
  document.addEventListener('click', function (event) {
    const backdrop = event.target.closest('[data-modal-backdrop]');
    if (!backdrop || event.target !== backdrop) return;
    closeModal(backdrop.dataset.view);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (!document.querySelector('[data-modal-backdrop]')) { closeOpenCombos(); return; }
    event.preventDefault();
    closeModal();
  });

  // نوار ابزار فهرست: تغییر جهت مرتب‌سازی و پاک‌کردن فیلترها.
  document.addEventListener('click', function (event) {
    const sortHeader = event.target.closest('[data-sort-key]');
    if (sortHeader) {
      const moduleKey = sortHeader.dataset.sortModule;
      const key = sortHeader.dataset.sortKey;
      const view = sortHeader.dataset.sortView || moduleKey;
      const current = listSortFor(moduleKey);
      if (current.key === key) setListSort(moduleKey, { direction: current.direction === 'asc' ? 'desc' : 'asc' });
      else setListSort(moduleKey, { key: key, direction: 'asc' });
      render(view, document.getElementById('sectionView'));
      return;
    }
    const resetButton = event.target.closest('[data-module-reset]');
    if (resetButton) {
      const moduleKey = resetButton.dataset.view;
      searchState[moduleKey] = '';
      clearModuleFilters(moduleKey);
      render(moduleKey, document.getElementById('sectionView'));
    }
  });

  // Delegate clicks for dynamically generated notification cards as well as the initial markup.
  document.addEventListener('click', function(event) {
    const card = event.target.closest('.notice-card');
    if (!card) return;
    card.classList.remove('unread');
    const count = document.getElementById('notificationCount');
    if (count) count.textContent = faDigits(document.querySelectorAll('.notice-card.unread').length);
    const key = card.dataset.alertKey || '';
    if (key && noticeAlertIndex[key]) openNoticeDialog(noticeAlertIndex[key]);
  });
  // کارت اعلان با صفحه‌کلید هم باز می‌شود (Enter / Space).
  document.addEventListener('keydown', function(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest && event.target.closest('.notice-card');
    if (!card || event.target.closest('.notice-quick-comment')) return;
    const key = card.dataset.alertKey || '';
    if (!key || !noticeAlertIndex[key]) return;
    event.preventDefault();
    card.classList.remove('unread');
    openNoticeDialog(noticeAlertIndex[key]);
  });

  document.addEventListener('submit', async function(event) {
    const form=event.target.closest('[data-shift-form]');
    if(!form)return;
    event.preventDefault();
    try{
      const fd=new FormData(form);
      const rawStart=String(fd.get('startAt')||'').trim();
      const rawEnd=String(fd.get('endAt')||'').trim();
      const startAt=parseJalali(rawStart,true),endAt=parseJalali(rawEnd,true);
      if(!startAt)throw new Error('زمان شروع را به شکل شمسی ۱۴۰۵/۰۷/۲۸ ۰۷:۰۰ وارد کن.');
      if(!endAt)throw new Error('زمان پایان را به شکل شمسی ۱۴۰۵/۰۷/۲۸ ۱۹:۰۰ وارد کن.');
      if(endAt<=startAt)throw new Error('پایان شیفت باید بعد از شروع آن باشد؛ برای شیفت شب، تاریخ پایان روز بعد را وارد کن.');
      const employeeIds=fd.getAll('employeeIds').map(String).filter(Boolean);
      if(!employeeIds.length)throw new Error('حداقل یک کارمند را برای این شیفت انتخاب کن.');
      const id=form.dataset.shiftId||'';
      const old=id?(appData.shifts||[]).find(function(item){return String(item.id)===String(id);}):null;
      const record={id:old?old.id:createId(),employeeIds:employeeIds,startAt:startAt,endAt:endAt,
        shiftType:String(fd.get('shiftType')||''),status:String(fd.get('status')||''),
        workplace:String(fd.get('workplace')||'').trim(),notes:String(fd.get('notes')||'').trim(),
        createdAt:old?old.createdAt||new Date().toISOString():new Date().toISOString(),updatedAt:new Date().toISOString()};
      if(!record.shiftType||!record.status)throw new Error('نوع شیفت و وضعیت برنامه را انتخاب کن.');
      if(old){
        appData.shifts=appData.shifts.map(function(item){return String(item.id)===String(old.id)?record:item;});
        addShiftHistory(record,'ویرایش',[]);
      }else{
        appData.shifts.push(record);
        addShiftHistory(record,'ثبت',[]);
      }
      const ok=await saveState();
      if(!ok)return;
      shiftFormState={open:false,id:null};
      render('employees',document.getElementById('sectionView'));
      refreshDashboard();
      toast(old?'برنامهٔ شیفت به‌روزرسانی شد.':'برنامهٔ شیفت ثبت شد.');
    }catch(error){toast(error.message||'ثبت برنامهٔ شیفت انجام نشد.');}
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
        if(!validateRequired(form,moduleKey))return;
        const values=await formValues(form,moduleKey,old);
        if(moduleKey==='faults')values.assetType='خودرو';
        if(moduleKey==='leaves'&&values.startDate&&values.endDate&&values.endDate<values.startDate)throw new Error('تاریخ پایان مرخصی نباید قبل از تاریخ شروع باشد.');
        if(moduleKey==='employees'){
          const childText=persianDigitsToLatin(String(values.childrenCount||'')).trim();
          if(values.maritalStatus==='متأهل'){
            if(!childText)throw new Error('برای کارمند متأهل، تعداد فرزند را بین ۱ تا ۲۰ وارد کن.');
            if(!/^\d+$/.test(childText)||Number(childText)<1||Number(childText)>20)throw new Error('تعداد فرزند باید عددی طبیعی بین ۱ تا ۲۰ باشد.');
            values.childrenCount=String(Number(childText));
          }else{
            values.childrenCount='';
          }
          if(values.workType!=='شیفت کاری'&&values.workType!=='شیفتی')values.shiftPattern='';
        }
        if(moduleKey==='missions'&&values.startAt&&values.endAt&&values.endAt<values.startAt)throw new Error('زمان پایان مأموریت نباید قبل از زمان شروع باشد.');
        if(moduleKey==='programs'&&values.finalReportSent&&values.finalReportDue&&values.finalReportSent<values.finalReportDue&&values.status!=='تکمیل‌شده')throw new Error('تاریخ ارسال گزارش نهایی قبل از مهلت ثبت شده؛ وضعیت پرونده را بررسی کن.');
        if(moduleKey==='gasmeters'&&values.calibrationStart&&values.calibrationEnd&&values.calibrationEnd<values.calibrationStart)throw new Error('پایان اعتبار کالیبراسیون نباید قبل از شروع باشد.');
        if(moduleKey==='stations'){
          const normalizedName=String(values.name||'').replace(/\s+/g,' ').trim();
          const duplicate=(appData.stations||[]).filter(function(item){
            return String(item.id)!==String(old&&old.id||'') && String(item.name||'').replace(/\s+/g,' ').trim()===normalizedName;
          })[0];
          if(duplicate)throw new Error('این نام قبلاً برای «'+duplicate.name+'»'+(duplicate.placeType?' ('+duplicate.placeType+')':'')+' ثبت شده است؛ نام دیگری انتخاب کن.');
          (Array.isArray(values.branches)?values.branches:[]).forEach(function(row){
            const order=String(row&&row.order||'').trim();
            if(order&&(!/^\d+$/.test(order)||Number(order)<1))throw new Error('ترتیب قرارگیری در هر شاخه باید یک عدد طبیعی باشد (۱، ۲، ۳ …)؛ حرف یا صفر مجاز نیست.');
          });
          if(values.placeType&&values.place)placeRegister(values.placeType,values.place);
        }
        const record=Object.assign({},old||{},values,{id:old?old.id:createId(),createdAt:old?old.createdAt||new Date().toISOString():new Date().toISOString(),updatedAt:new Date().toISOString()});
        if(moduleKey==='gasmeters'){
          record.gases=Array.isArray(record.gases)?record.gases:[];
          record.sensorCount=record.gases.length;
          if(old&&old.location!==record.location){
            const stamp=formatJalali(new Date().toISOString(),false);
            const entry=stamp+' | '+String(old.location||'نامشخص')+' | '+String(record.location||'نامشخص');
            record.locationHistory=[String(record.locationHistory||'').trim(),entry].filter(Boolean).join('\n');
            record.locationSince=stamp;
          } else if(!old&&record.location&&!record.locationSince){record.locationSince=formatJalali(record.createdAt,false);}
          if(record.status==='در کالیبراسیون'&&!record.calibrationDispatch)record.calibrationDispatch=formatJalali(new Date().toISOString(),false);
          if(record.status!=='در کالیبراسیون'&&old&&old.status==='در کالیبراسیون'&&!record.calibrationReturn)throw new Error('برای خروج از وضعیت «در کالیبراسیون»، تاریخ برگشت را ثبت کن.');
        }
        if(moduleKey==='vehicles'&&String(old&&old.currentKm||'')!==String(record.currentKm||'')){
          record.currentKmRecordedAt=new Date().toISOString();
          const stamp=formatJalali(new Date().toISOString(),true);
          const entry=stamp+' | کیلومتر '+String(record.currentKm||'ثبت‌نشده');
          record.maintenanceLog=[String(record.maintenanceLog||'').trim(),entry].filter(Boolean).join('\n');
        }
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
        if(!ok){
          toast('ذخیره انجام نشد؛ اطلاعات روی این دستگاه نوشته نشد'+(loadError?' — '+loadError:'')+'.');
          return;
        }
        delete formState[moduleKey];
        clearDetachedModals();
        refreshCurrentView();
        refreshDashboard();
        toast(old?'تغییرات ذخیره شد.':'اطلاعات جدید ثبت شد.');
        // همگام‌سازی مخاطبان با کارکنان و به‌روزرسانی فهرست‌های وابسته در همین لحظه انجام می‌شود.
        document.dispatchEvent(new CustomEvent('atlas-record-saved', {
          detail: { module: moduleKey, record: record, previous: old || null, isNew: !old }
        }));
      }catch(error){
        toast(error.message||'ثبت اطلاعات انجام نشد.');
      }
      return;
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

  // «انتخاب همه» فقط وقتی تیک می‌خورد که همهٔ ردیف‌های دیده‌شده انتخاب شده باشند.
  function syncSelectAllBoxes(section) {
    const boxes=Array.from(section.querySelectorAll('[data-record-select]'));
    const all=boxes.length>0&&boxes.every(function(box){return box.checked;});
    section.querySelectorAll('[data-module-select-all]').forEach(function(box){box.checked=all;});
  }

  document.addEventListener('change', function(event) {
    const target=event.target;
    if(target.matches('[data-module-filter]')){
      setModuleFilter(target.dataset.view, target.dataset.filterKey || 'status', target.value);
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
      enhanceJalaliInputs(region);
    }
  });

  window.addEventListener('atlas-shift-range-changed', function(event) {
    const detail = event && event.detail ? event.detail : {};
    dashboardRange = {
      name: detail.name || 'today',
      start: detail.start || null,
      end: detail.end || null
    };
    refreshDashboard();
  });

  document.addEventListener('change', function (event) {
    const box = event.target.closest('[data-program-stage]');
    if (!box) return;
    const record = (appData.programs || []).find(function (item) { return String(item.id) === String(box.dataset.program); });
    if (!record) return;
    const stage = programStages(record).find(function (item) { return String(item.id) === String(box.dataset.stage); });
    if (!stage) return;
    stage.done = !!box.checked;
    stage.doneAt = box.checked ? new Date().toISOString() : '';
    saveState();
    render('programs', document.getElementById('sectionView'));
    refreshDashboard();
  });

  document.addEventListener('click', async function (event) {
    const button = event.target.closest('[data-program-action]');
    if (!button) return;
    const action = button.dataset.programAction;
    const section = document.getElementById('sectionView');
    if (action === 'filter') {
      programFilter = button.dataset.category || 'all';
      render('programs', section);
      return;
    }
    if (action === 'edit') {
      formState.programs = { open: true, id: button.dataset.program };
      render('programs', section);
      return;
    }
    const record = (appData.programs || []).find(function (item) { return String(item.id) === String(button.dataset.program); });
    if (!record) return;
    if (action === 'stage-add') {
      const input = section.querySelector('[data-program-stage-input="' + record.id + '"]');
      const title = String(input && input.value || '').trim();
      if (!title) { toast('نام مرحله را وارد کن.'); return; }
      programStages(record).push({ id: createId(), title: title, done: false, doneAt: '' });
      saveState();
      render('programs', section);
      refreshDashboard();
      toast('مرحله اضافه شد.');
      return;
    }
    if (action === 'stage-delete') {
      record.stages = programStages(record).filter(function (item) { return String(item.id) !== String(button.dataset.stage); });
      saveState();
      render('programs', section);
      refreshDashboard();
      return;
    }
    if (action === 'delete') {
      if (!(await askConfirm({ title: 'حذف برنامه', message: '«' + (record.title || 'برنامه') + '» حذف شود؟', confirmLabel: 'حذف', danger: true }))) return;
      appData.programs = appData.programs.filter(function (item) { return String(item.id) !== String(record.id); });
      addHistory('programs', record, 'حذف', []);
      saveState();
      render('programs', section);
      refreshDashboard();
      toast('برنامه حذف شد.');
    }
  });

  const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  const JALALI_WEEK = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
  let jalaliPopover = null;
  let jalaliTarget = null;
  let jalaliView = { year: 0, month: 0 };
  let jalaliWheel = false;
  let jalaliOpener = null;
  let jalaliFocusDay = null;

  function splitJalaliText(value) {
    const raw = persianDigitsToLatin(String(value == null ? '' : value)).trim();
    const match = raw.match(/^(\d{4})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{1,2})(?:\s*[^\d]{0,4}\s*(\d{1,2}):(\d{2}))?$/);
    if (!match) return { year: '', month: '', day: '', time: '' };
    return {
      year: match[1],
      month: String(Number(match[2])),
      day: String(Number(match[3])),
      time: match[4] ? String(match[4]).padStart(2, '0') + ':' + match[5] : ''
    };
  }

  function jalaliMonthStartDate(jy, jm) {
    const first = jalaliYearStart(jy);
    const offset = jm <= 6 ? (jm - 1) * 31 : 186 + (jm - 7) * 30;
    return new Date(first.getFullYear(), first.getMonth(), first.getDate() + offset, 12, 0, 0, 0);
  }

  function jalaliMonthLength(jy, jm) {
    try {
      const start = jalaliMonthStartDate(jy, jm);
      const next = jm === 12 ? jalaliMonthStartDate(jy + 1, 1) : jalaliMonthStartDate(jy, jm + 1);
      return Math.round((next.getTime() - start.getTime()) / 86400000);
    } catch (error) {
      // سال/ماه خارج از دامنهٔ تقویم مرورگر: طول پیش‌فرض ماه
      return jm <= 6 ? 31 : 30;
    }
  }

  function syncJalaliField(wrap) {
    const hidden = wrap.querySelector('input.jalali-value');
    if (!hidden) return;
    const read = function (name) {
      const box = wrap.querySelector('[data-jalali-seg="' + name + '"]');
      return box ? persianDigitsToLatin(box.value).replace(/[^\d:]/g, '') : '';
    };
    const year = read('year');
    const month = read('month');
    const day = read('day');
    const time = read('time');
    const complete = year.length === 4 && month && day;
    hidden.value = complete
      ? year + '/' + month.padStart(2, '0') + '/' + day.padStart(2, '0') + (time ? ' ' + time : '')
      : '';
  }

  function enhanceJalaliInputs(root) {
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll('input[data-jalali-input]'), function (input) {
      if (input.dataset.jalaliReady) return;
      input.dataset.jalaliReady = '1';
      const withTime = input.dataset.jalaliInput === 'jalali-datetime';
      const parts = splitJalaliText(input.value);
      const wrap = document.createElement('div');
      wrap.className = 'jalali-field';
      wrap.innerHTML =
        '<div class="jalali-segments">' +
          '<label class="jalali-seg"><span>سال</span><input type="text" inputmode="numeric" autocomplete="new-password" maxlength="4" data-jalali-seg="year" value="' + esc(parts.year) + '" placeholder="۱۴۰۵"></label>' +
          '<label class="jalali-seg"><span>ماه</span><input type="text" inputmode="numeric" autocomplete="new-password" maxlength="2" data-jalali-seg="month" value="' + esc(parts.month) + '" placeholder="۰۷"></label>' +
          '<label class="jalali-seg"><span>روز</span><input type="text" inputmode="numeric" autocomplete="new-password" maxlength="2" data-jalali-seg="day" value="' + esc(parts.day) + '" placeholder="۲۸"></label>' +
          (withTime ? '<label class="jalali-seg jalali-seg-time"><span>ساعت</span><input type="text" inputmode="numeric" autocomplete="new-password" maxlength="5" data-jalali-seg="time" value="' + esc(parts.time) + '" placeholder="۰۸:۳۰"></label>' : '') +
        '</div>' +
        '<button type="button" class="jalali-open" data-jalali-open aria-label="باز کردن سالنامه" title="انتخاب از سالنامه"><span aria-hidden="true">▦</span></button>';
      input.parentNode.insertBefore(wrap, input);
      input.type = 'hidden';
      input.removeAttribute('required');
      input.removeAttribute('data-jalali-input');
      input.classList.add('jalali-value');
      wrap.appendChild(input);
      syncJalaliField(wrap);
    });
    enhanceSearchSelects(root);
  }

  // ── لیست‌های کشویی جستجوپذیر ────────────────────────────────
  // گزینه‌های هر select به ترتیب حروف الفبا مرتب می‌شود و هر لیستی که
  // بیش از COMBO_SEARCH_MIN گزینه دارد با کادر جستجو باز می‌شود.
  const COMBO_SEARCH_MIN = 5;
  const normalizeSearchText = function (value) {
    return String(value == null ? '' : value)
      .replace(/\u200c/g, ' ')
      .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
      .replace(/\s+/g, ' ')
      .trim();
  };

  function sortSelectOptions(select) {
    const pinned = [];
    const rest = [];
    Array.prototype.forEach.call(select.options, function (option) {
      const value = String(option.value);
      if (value === '' || value === 'all') pinned.push(option);
      else rest.push(option);
    });
    rest.sort(function (a, b) {
      return String(a.textContent).localeCompare(String(b.textContent), 'fa', { numeric: true });
    });
    pinned.concat(rest).forEach(function (option) { select.appendChild(option); });
  }

  let combinedPanel = null;
  // پنل باز روی body می‌رود؛ اگر پنجره‌ای که آن را باز کرده بسته و از DOM حذف شود،
  // دیگر با querySelector پیدا نمی‌شود. پس فهرست بازها را نگه می‌داریم.
  const openCombos = new Set();
  function closeOpenCombos() {
    Array.from(openCombos).forEach(function (wrap) {
      if (wrap && typeof wrap.atlasClose === 'function') wrap.atlasClose();
    });
    openCombos.clear();
    document.querySelectorAll('.atlas-combo.is-open').forEach(function (wrap) {
      const btn = wrap.querySelector('.atlas-combo-btn');
      const panel = wrap.atlasPanel;
      if (panel) {
        panel.hidden = true;
        panel.style.left = '';
        panel.style.top = '';
        if (panel.parentNode !== wrap) wrap.appendChild(panel);
      }
      wrap.classList.remove('is-open');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
    // پنل‌های جامانده روی body که صاحبشان از صفحه حذف شده است.
    document.querySelectorAll('body > .atlas-combo-panel').forEach(function (panel) {
      panel.hidden = true;
      panel.style.left = '';
      panel.style.top = '';
    });
    combinedPanel = null;
  }
  // اسکرول صفحه نباید پنل را ببندد؛ فقط جای آن را تازه می‌کند.
  const repositionOpenCombo = function () {
    if (!combinedPanel) return;
    if (typeof combinedPanel.atlasPlace === 'function') combinedPanel.atlasPlace();
  };
  document.addEventListener('scroll', repositionOpenCombo, true);
  window.addEventListener('resize', repositionOpenCombo);

  function comboLabelText(select) {
    const option = select.options[select.selectedIndex];
    if (!option || String(option.value) === '') return '';
    return String(option.textContent);
  }

  function buildCombo(select) {
    const wrap = document.createElement('span');
    wrap.className = 'atlas-combo';
    wrap.innerHTML =
      '<button type="button" class="atlas-combo-btn" aria-haspopup="listbox" aria-expanded="false">' +
        '<span class="atlas-combo-value"></span><span class="atlas-combo-caret" aria-hidden="true">▾</span>' +
      '</button>' +
      '<span class="atlas-combo-panel" hidden>' +
        '<input type="text" class="atlas-combo-search" autocomplete="off" placeholder="جستجو در فهرست…" aria-label="جستجو در فهرست">' +
        '<span class="atlas-combo-list" role="listbox"></span>' +
      '</span>';
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add('atlas-combo-native');
    // select اصلی فقط برای نگه‌داشتن مقدار و ارسال فرم است؛ فوکوس و کلیدهای
    // صفحه‌کلید نباید به آن برسد، وگرنه با Tab/کلیک بر چسب، یک فیلد نامرئی
    // فوکوس می‌گیرد و کلید بالا/پایین بی‌صدا مقدار را عوض می‌کند.
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    const btn = wrap.querySelector('.atlas-combo-btn');
    const valueEl = wrap.querySelector('.atlas-combo-value');
    const panel = wrap.querySelector('.atlas-combo-panel');
    const search = wrap.querySelector('.atlas-combo-search');
    const list = wrap.querySelector('.atlas-combo-list');

    const syncLabel = function () {
      const text = comboLabelText(select);
      valueEl.textContent = text || select.dataset.comboPlaceholder || 'انتخاب کنید';
      valueEl.classList.toggle('is-empty', !text);
    };
    wrap.atlasSync = syncLabel;
    wrap.atlasPanel = panel;
    syncLabel();

    const optionsOf = function () {
      return Array.prototype.slice.call(select.options).filter(function (option) {
        return !option.hidden && !option.disabled;
      });
    };

    const paint = function () {
      const query = normalizeSearchText(search.value);
      const current = String(select.value);
      const items = optionsOf().filter(function (option) {
        if (!query) return true;
        return normalizeSearchText(option.textContent).indexOf(query) > -1;
      });
      list.innerHTML = items.length ? items.map(function (option) {
        const value = String(option.value);
        return '<button type="button" class="atlas-combo-option' + (value === current ? ' is-selected' : '') +
          (value === '' ? ' is-empty-option' : '') + '" role="option" data-combo-value="' + esc(value) + '">' +
          esc(String(option.textContent)) + '</button>';
      }).join('') : '<span class="atlas-combo-none">گزینه‌ای پیدا نشد.</span>';
    };

    const close = function () {
      panel.hidden = true;
      wrap.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      panel.style.left = '';
      panel.style.top = '';
      panel.style.width = '';
      panel.style.right = '';
      panel.style.insetInlineStart = '';
      if (panel.parentNode !== wrap) wrap.appendChild(panel);
      openCombos.delete(wrap);
    };
    wrap.atlasClose = close;
    // پنل روی body قرار می‌گیرد تا داخل مودال/کادر اسکرول‌شونده بریده نشود.
    const placePanel = function () {
      const rect = btn.getBoundingClientRect();
      const margin = 8;
      const width = Math.min(Math.max(rect.width, 220), window.innerWidth - margin * 2);
      panel.style.width = width + 'px';
      panel.style.insetInlineStart = 'auto';
      panel.style.right = 'auto';
      panel.style.left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)) + 'px';
      panel.hidden = false;
      const height = panel.offsetHeight;
      let top = rect.bottom + 4;
      if (top + height > window.innerHeight - margin) {
        const above = rect.top - height - 4;
        top = above >= margin ? above : Math.max(margin, window.innerHeight - height - margin);
      }
      panel.style.top = top + 'px';
    };
    const open = function () {
      closeOpenCombos();
      if (panel.parentNode !== document.body) document.body.appendChild(panel);
      panel.style.position = 'fixed';
      search.value = '';
      paint();
      placePanel();
      wrap.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      const selected = list.querySelector('.atlas-combo-option.is-selected');
      if (selected) {
        selected.classList.add('is-active');
        selected.scrollIntoView({ block: 'nearest' });
      }
      if (!matchMedia('(hover: none)').matches) search.focus();
      panel.atlasPlace = placePanel;
      combinedPanel = panel;
      openCombos.add(wrap);
    };

    const optionButtons = function () {
      return Array.prototype.slice.call(list.querySelectorAll('.atlas-combo-option'));
    };

    // جابه‌جایی بین گزینه‌ها با کلید؛ همیشه با preventDefault تا پنجرهٔ زیرین
    // (فرم یا صفحهٔ اصلی) اسکرول نشود.
    const moveActive = function (direction) {
      const items = optionButtons();
      if (!items.length) return false;
      const active = list.querySelector('.atlas-combo-option.is-active');
      let index = items.indexOf(active);
      if (index < 0) index = direction > 0 ? -1 : items.length;
      index = Math.max(0, Math.min(items.length - 1, index + direction));
      items.forEach(function (item) { item.classList.remove('is-active'); });
      items[index].classList.add('is-active');
      items[index].scrollIntoView({ block: 'nearest' });
      return true;
    };

    const jumpActive = function (toEnd) {
      const items = optionButtons();
      if (!items.length) return false;
      items.forEach(function (item) { item.classList.remove('is-active'); });
      const target = toEnd ? items[items.length - 1] : items[0];
      target.classList.add('is-active');
      target.scrollIntoView({ block: 'nearest' });
      return true;
    };

    // مشترک بین کادر جستجو و خود دکمهٔ فیلد: با Tab روی فیلد می‌رسی و کلید
    // بالا/پایین همان رفتار کلیک با موس را می‌دهد.
    const handleComboKeys = function (event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        if (panel.hidden) { open(); return true; }
        moveActive(event.key === 'ArrowDown' ? 1 : -1);
        return true;
      }
      if (event.key === 'Home' || event.key === 'End') {
        if (panel.hidden) return false;
        event.preventDefault();
        jumpActive(event.key === 'End');
        return true;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const active = list.querySelector('.atlas-combo-option.is-active');
        const items = optionButtons();
        const target = active || items[0];
        if (target) choose(target.dataset.comboValue);
        return true;
      }
      if (event.key === 'Escape') {
        if (panel.hidden) return false;
        event.preventDefault();
        close();
        btn.focus();
        return true;
      }
      return false;
    };

    const choose = function (value) {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncLabel();
      close();
      btn.focus();
    };

    btn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (panel.hidden) open(); else close();
    });
    search.addEventListener('input', paint);
    search.addEventListener('keydown', handleComboKeys);
    btn.addEventListener('keydown', function (event) {
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        if (panel.hidden) open(); else close();
        return;
      }
      if (event.key === 'Tab') { close(); return; }
      if (event.key === 'Enter' && panel.hidden) { event.preventDefault(); open(); return; }
      handleComboKeys(event);
    });
    list.addEventListener('click', function (event) {
      const option = event.target.closest('[data-combo-value]');
      if (!option) return;
      choose(option.dataset.comboValue);
    });
    select.addEventListener('change', syncLabel);
    select.addEventListener('input', syncLabel);
    // اگر جایی (مثلاً کلیک روی برچسب فیلد) فوکوس روی select نامرئی نشست، به دکمه منتقل می‌شود.
    select.addEventListener('focus', function () { btn.focus(); });

    // اگر کد جای دیگری مقدار select را عوض کند، برچسب هم به‌روز بماند.
    const proto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    if (proto && proto.get && proto.set) {
      Object.defineProperty(select, 'value', {
        configurable: true,
        get: function () { return proto.get.call(select); },
        set: function (next) { proto.set.call(select, next); syncLabel(); }
      });
    }
  }

  function enhanceSearchSelects(root) {
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll('select[data-search-select]'), function (select) {
      if (select.dataset.comboReady) return;
      if (select.multiple) return;
      select.dataset.comboReady = '1';
      sortSelectOptions(select);
      const real = Array.prototype.filter.call(select.options, function (option) {
        return String(option.value) !== '' && String(option.value) !== 'all';
      });
      if (real.length < 2) return;
      buildCombo(select);
    });
  }

  document.addEventListener('click', function (event) {
    if (event.target.closest('.atlas-combo') || event.target.closest('.atlas-combo-panel')) return;
    closeOpenCombos();
  });

  function jalaliPopoverEl() {
    if (!jalaliPopover) {
      jalaliPopover = document.createElement('div');
      jalaliPopover.className = 'jalali-popover';
      jalaliPopover.hidden = true;
      jalaliPopover.setAttribute('role', 'dialog');
      jalaliPopover.setAttribute('aria-label', 'سالنامه');
      jalaliPopover.setAttribute('tabindex', '-1');
      // کلیدها فقط داخل خود سالنامه کار می‌کنند و به منوی اصلی/صفحهٔ زیرین نمی‌رسند.
      jalaliPopover.addEventListener('keydown', handleJalaliKeys);
      document.body.appendChild(jalaliPopover);
    }
    return jalaliPopover;
  }

  // روزی که کلیدها روی آن حرکت می‌کنند: آخرین روزِ فوکوس‌شده، وگرنه روز انتخاب‌شده یا امروز.
  function jalaliActiveDay() {
    if (jalaliFocusDay) return jalaliFocusDay;
    const selected = jalaliPopover ? jalaliPopover.querySelector('.jalali-day.is-selected') : null;
    if (selected) return Number(selected.dataset.jalaliDay);
    const today = intlJalaliParts(new Date());
    if (today.year === jalaliView.year && today.month === jalaliView.month) return today.day;
    return 1;
  }

  function focusJalaliDay(day) {
    if (!jalaliPopover) return;
    const safeDay = Math.min(Math.max(1, day || 1), jalaliMonthLength(jalaliView.year, jalaliView.month));
    jalaliFocusDay = safeDay;
    const button = jalaliPopover.querySelector('[data-jalali-day="' + safeDay + '"]');
    if (button) button.focus();
  }

  function focusJalaliYearItem() {
    if (!jalaliPopover) return;
    const item = jalaliPopover.querySelector('.jalali-wheel-item.is-selected');
    if (item) item.focus();
  }

  // جابه‌جایی روز با کلید: delta بر حسب روز (۱ = روز بعد)
  function shiftJalaliDay(delta) {
    try {
      const start = jalaliMonthStartDate(jalaliView.year, jalaliView.month);
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + (jalaliActiveDay() - 1) + delta, 12, 0, 0, 0);
      const parts = intlJalaliParts(date);
      if (parts.year < JALALI_YEAR_MIN || parts.year > JALALI_YEAR_MAX) return;
      jalaliView = { year: parts.year, month: parts.month };
      renderJalaliPopover();
      focusJalaliDay(parts.day);
    } catch (error) { /* سال خارج از دامنهٔ تقویم */ }
  }

  function shiftJalaliMonth(delta) {
    let year = jalaliView.year;
    let month = jalaliView.month + delta;
    while (month > 12) { month -= 12; year += 1; }
    while (month < 1) { month += 12; year -= 1; }
    year = Math.min(JALALI_YEAR_MAX, Math.max(JALALI_YEAR_MIN, year));
    const day = Math.min(jalaliActiveDay(), jalaliMonthLength(year, month));
    jalaliView = { year: year, month: month };
    renderJalaliPopover();
    focusJalaliDay(day);
  }

  function shiftJalaliYear(delta) {
    const year = Math.min(JALALI_YEAR_MAX, Math.max(JALALI_YEAR_MIN, jalaliView.year + delta));
    if (year === jalaliView.year) return;
    const day = Math.min(jalaliActiveDay(), jalaliMonthLength(year, jalaliView.month));
    jalaliView = { year: year, month: jalaliView.month };
    renderJalaliPopover();
    focusJalaliDay(day);
  }

  // در «لیست انتخاب سال» بالا/پایین سال را عوض می‌کند و لیست را همراه خود می‌برد.
  function shiftJalaliWheelYear(delta) {
    const year = Math.min(JALALI_YEAR_MAX, Math.max(JALALI_YEAR_MIN, jalaliView.year + delta));
    if (year === jalaliView.year) return;
    jalaliView = { year: year, month: jalaliView.month };
    renderJalaliPopover();
    focusJalaliYearItem();
  }

  function jumpJalaliWheelTo(year) {
    jalaliView = { year: year, month: jalaliView.month };
    renderJalaliPopover();
    focusJalaliYearItem();
  }

  const JALALI_NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Enter', ' ', 'Spacebar', 'Escape'];

  // کلیدهای سالنامه: هیچ‌کدام به منوی اصلی یا اسکرول صفحه نمی‌رسند.
  function handleJalaliKeys(event) {
    if (!jalaliPopover || jalaliPopover.hidden) return;
    const key = event.key;
    if (JALALI_NAV_KEYS.indexOf(key) < 0) return;
    const swallow = function () { event.preventDefault(); event.stopPropagation(); };

    if (key === 'Escape') {
      swallow();
      closeJalaliPopover();
      if (jalaliOpener && document.contains(jalaliOpener)) jalaliOpener.focus();
      return;
    }

    if (jalaliWheel) {
      if (key === 'ArrowDown' || key === 'ArrowUp') { swallow(); shiftJalaliWheelYear(key === 'ArrowDown' ? 1 : -1); return; }
      if (key === 'PageDown' || key === 'PageUp') { swallow(); shiftJalaliWheelYear(key === 'PageDown' ? 10 : -10); return; }
      if (key === 'Home' || key === 'End') { swallow(); jumpJalaliWheelTo(key === 'Home' ? JALALI_YEAR_MIN : JALALI_YEAR_MAX); return; }
      if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
        swallow();
        jalaliWheel = false;
        renderJalaliPopover();
        focusJalaliDay(jalaliActiveDay());
        return;
      }
      return;
    }

    if (key === 'Enter' || key === ' ' || key === 'Spacebar') { swallow(); pickJalaliDay(jalaliActiveDay()); return; }
    // چیدمان راست‌به‌چپ است: «چپ» یعنی روز بعد و «راست» یعنی روز قبل.
    if (key === 'ArrowLeft') { swallow(); shiftJalaliDay(1); return; }
    if (key === 'ArrowRight') { swallow(); shiftJalaliDay(-1); return; }
    if (key === 'ArrowUp') { swallow(); shiftJalaliDay(-7); return; }
    if (key === 'ArrowDown') { swallow(); shiftJalaliDay(7); return; }
    if (key === 'PageUp' || key === 'PageDown') {
      swallow();
      const direction = key === 'PageDown' ? 1 : -1;
      if (event.shiftKey) shiftJalaliYear(direction); else shiftJalaliMonth(direction);
      return;
    }
    if (key === 'Home') { swallow(); focusJalaliDay(1); return; }
    if (key === 'End') { swallow(); focusJalaliDay(jalaliMonthLength(jalaliView.year, jalaliView.month)); return; }
  }

  // اگر فوکوس بیرون از سالنامهٔ باز بماند، کلیدهای ناوبری باید باز هم فقط به
  // سالنامه برسند، نه به منوی اصلی.
  document.addEventListener('keydown', function (event) {
    if (!jalaliPopover || jalaliPopover.hidden) return;
    if (jalaliPopover.contains(event.target)) return;
    if (JALALI_NAV_KEYS.indexOf(event.key) < 0) return;
    event.preventDefault();
    event.stopPropagation();
    handleJalaliKeys(event);
  }, true);

  // دامنهٔ مجاز تاریخ شمسی: روز تا ۳۱، ماه تا ۱۲، سال ۱۳۰۰ تا ۱۵۰۰
  const JALALI_YEAR_MIN = 1300;
  const JALALI_YEAR_MAX = 1500;

  function clampInt(value, min, max) {
    const num = parseInt(String(value).replace(/\D/g, ''), 10);
    if (isNaN(num)) return null;
    return Math.min(max, Math.max(min, num));
  }

  function renderJalaliPopover() {
    const pop = jalaliPopoverEl();
    const head =
      '<div class="jalali-pop-head">' +
        '<button type="button" class="jalali-nav" data-jalali-nav="prev" aria-label="ماه قبل">‹</button>' +
        '<div class="jalali-pop-title">' +
          '<button type="button" class="jalali-year-btn' + (jalaliWheel ? ' is-active' : '') + '" data-jalali-year aria-label="انتخاب سال" aria-expanded="' + (jalaliWheel ? 'true' : 'false') + '">' + faDigits(jalaliView.year) + '</button>' +
          (jalaliWheel ? '<span class="jalali-pop-hint">سال را بچرخان</span>' : ' <span>' + esc(JALALI_MONTHS[jalaliView.month - 1] || '') + '</span>') +
        '</div>' +
        '<button type="button" class="jalali-nav" data-jalali-nav="next" aria-label="ماه بعد">›</button>' +
      '</div>';
    if (jalaliWheel) {
      let items = '';
      for (let year = JALALI_YEAR_MIN; year <= JALALI_YEAR_MAX; year += 1) {
        items += '<button type="button" class="jalali-wheel-item' + (year === jalaliView.year ? ' is-selected' : '') + '" role="option" aria-selected="' + (year === jalaliView.year) + '" data-jalali-pick="' + year + '">' + faDigits(year) + '</button>';
      }
      pop.innerHTML = head +
        '<div class="jalali-wheel" data-jalali-wheel role="listbox" aria-label="سال شمسی">' + items + '</div>' +
        '<div class="jalali-pop-foot"><button type="button" class="secondary-btn" data-jalali-action="close">بستن</button></div>';
      const wheel = pop.querySelector('[data-jalali-wheel]');
      const active = wheel ? wheel.querySelector('.jalali-wheel-item.is-selected') : null;
      if (wheel && active) wheel.scrollTop = active.offsetTop - wheel.clientHeight / 2 + active.offsetHeight / 2;
      return;
    }
    const length = jalaliMonthLength(jalaliView.year, jalaliView.month);
    const first = jalaliMonthStartDate(jalaliView.year, jalaliView.month);
    const leading = (first.getDay() + 1) % 7;
    const today = intlJalaliParts(new Date());
    const hidden = jalaliTarget ? jalaliTarget.querySelector('input.jalali-value') : null;
    const selected = splitJalaliText(hidden ? hidden.value : '');
    let cells = '';
    for (let i = 0; i < leading; i += 1) cells += '<span class="jalali-day is-empty"></span>';
    for (let day = 1; day <= length; day += 1) {
      const isToday = today.year === jalaliView.year && today.month === jalaliView.month && today.day === day;
      const isSelected = Number(selected.year) === jalaliView.year && Number(selected.month) === jalaliView.month && Number(selected.day) === day;
      cells += '<button type="button" class="jalali-day' + (isToday ? ' is-today' : '') + (isSelected ? ' is-selected' : '') + '" data-jalali-day="' + day + '">' + faDigits(day) + '</button>';
    }
    pop.innerHTML = head +
      '<div class="jalali-week">' + JALALI_WEEK.map(function (label) { return '<span>' + label + '</span>'; }).join('') + '</div>' +
      '<div class="jalali-grid">' + cells + '</div>' +
      '<div class="jalali-pop-foot"><button type="button" class="secondary-btn" data-jalali-action="today">امروز</button><button type="button" class="secondary-btn" data-jalali-action="close">بستن</button></div>';
  }

  function openJalaliPopover(wrap, opener) {
    if (!wrap) return;
    jalaliTarget = wrap;
    jalaliOpener = opener || null;
    jalaliWheel = false;
    jalaliFocusDay = null;
    const hidden = wrap.querySelector('input.jalali-value');
    const parts = splitJalaliText(hidden ? hidden.value : '');
    const today = intlJalaliParts(new Date());
    jalaliView = {
      year: Math.min(JALALI_YEAR_MAX, Math.max(JALALI_YEAR_MIN, Number(parts.year) || today.year)),
      month: Math.min(12, Math.max(1, Number(parts.month) || today.month))
    };
    const pop = jalaliPopoverEl();
    renderJalaliPopover();
    pop.hidden = false;
    const rect = opener.getBoundingClientRect();
    const width = Math.min(272, window.innerWidth - 16);
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = rect.bottom + 8;
    const height = pop.offsetHeight || 320;
    if (top + height > window.innerHeight) top = Math.max(8, rect.top - height - 8);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.style.width = width + 'px';
    // فوکوس به داخل سالنامه می‌رود؛ همین کار باعث می‌شود کلیدهای جهت‌دار روی
    // سالنامه اثر بگذارند و منوی اصلی/صفحه جابه‌جا نشود.
    const startDay = pop.querySelector('.jalali-day.is-selected') || pop.querySelector('.jalali-day.is-today') || pop.querySelector('[data-jalali-day]');
    if (startDay) startDay.focus({ preventScroll: true }); else pop.focus({ preventScroll: true });
  }

  function closeJalaliPopover() {
    if (jalaliPopover) jalaliPopover.hidden = true;
  }

  function pickJalaliDay(day) {
    if (!jalaliTarget) return;
    const wrap = jalaliTarget;
    const set = function (name, value) {
      const box = wrap.querySelector('[data-jalali-seg="' + name + '"]');
      if (box) box.value = value;
    };
    set('year', String(jalaliView.year));
    set('month', String(jalaliView.month).padStart(2, '0'));
    set('day', String(day).padStart(2, '0'));
    const timeBox = wrap.querySelector('[data-jalali-seg="time"]');
    if (timeBox && !timeBox.value) timeBox.value = '08:30';
    syncJalaliField(wrap);
    jalaliFocusDay = null;
    closeJalaliPopover();
    if (jalaliOpener && document.contains(jalaliOpener)) jalaliOpener.focus();
    const hidden = wrap.querySelector('input.jalali-value');
    if (hidden) hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }

  document.addEventListener('focusin', function (event) {
    const segment = event.target.closest && event.target.closest('[data-jalali-seg]');
    if (segment) segment.select();
  });

  // فیلدهای «فقط رقم» (مثل شمارهٔ پرسنلی): هر حرف یا علامتی همان لحظه حذف می‌شود
  // و رقم فارسی به لاتین تبدیل می‌گردد.
  document.addEventListener('input', function (event) {
    const box = event.target && event.target.closest ? event.target.closest('[data-digits-only]') : null;
    if (!box) return;
    const clean = persianDigitsToLatin(box.value).replace(/\D/g, '');
    if (clean !== box.value) box.value = clean;
  });

  document.addEventListener('input', function (event) {
    const segment = event.target.closest('[data-jalali-seg]');
    if (!segment) return;
    const wrap = segment.closest('.jalali-field');
    segment.value = persianDigitsToLatin(segment.value).replace(/[^\d:]/g, '');
    const max = Number(segment.getAttribute('maxlength') || 4);
    if (segment.value.length >= max) {
      const nextLabel = segment.parentNode.nextElementSibling;
      const nextBox = nextLabel ? nextLabel.querySelector('input') : null;
      if (nextBox) nextBox.focus();
    }
    syncJalaliField(wrap);
  });

  document.addEventListener('blur', function (event) {
    const segment = event.target.closest && event.target.closest('[data-jalali-seg]');
    if (!segment) return;
    const wrap = segment.closest('.jalali-field');
    const name = segment.dataset.jalaliSeg;
    const digits = persianDigitsToLatin(segment.value).replace(/\D/g, '');
    if (name === 'year') {
      const year = digits ? clampInt(digits, JALALI_YEAR_MIN, JALALI_YEAR_MAX) : null;
      if (year) segment.value = String(year);
    } else if (name === 'month') {
      const month = digits ? clampInt(digits, 1, 12) : null;
      if (month) segment.value = String(month).padStart(2, '0');
    } else if (name === 'day') {
      // دامنهٔ روز: ۱ تا ۳۱ و در ماه‌های ۳۰ روزه حداکثر ۳۰
      const monthBox = wrap ? wrap.querySelector('[data-jalali-seg="month"]') : null;
      const yearBox = wrap ? wrap.querySelector('[data-jalali-seg="year"]') : null;
      const monthNum = parseInt(persianDigitsToLatin(monthBox && monthBox.value).replace(/\D/g, ''), 10);
      const yearNum = parseInt(persianDigitsToLatin(yearBox && yearBox.value).replace(/\D/g, ''), 10);
      let max = 31;
      if (monthNum >= 1 && monthNum <= 12) max = jalaliMonthLength(yearNum || intlJalaliParts(new Date()).year, monthNum);
      const day = digits ? clampInt(digits, 1, Math.min(31, max)) : null;
      if (day) segment.value = String(day).padStart(2, '0');
    }
    syncJalaliField(wrap);
  }, true);

  document.addEventListener('click', function (event) {
    const opener = event.target.closest('[data-jalali-open]');
    if (opener) {
      openJalaliPopover(opener.closest('.jalali-field'), opener);
      return;
    }
    const nav = event.target.closest('[data-jalali-nav]');
    if (nav) {
      if (jalaliWheel) return;
      let month = jalaliView.month + (nav.dataset.jalaliNav === 'next' ? 1 : -1);
      let year = jalaliView.year;
      if (month > 12) { month = 1; year += 1; }
      if (month < 1) { month = 12; year -= 1; }
      year = Math.min(JALALI_YEAR_MAX, Math.max(JALALI_YEAR_MIN, year));
      jalaliView = { year: year, month: month };
      jalaliFocusDay = null;
      renderJalaliPopover();
      const again = jalaliPopover && jalaliPopover.querySelector('[data-jalali-nav="' + nav.dataset.jalaliNav + '"]');
      if (again) again.focus();
      return;
    }
    const yearButton = event.target.closest('[data-jalali-year]');
    if (yearButton) {
      jalaliWheel = !jalaliWheel;
      renderJalaliPopover();
      if (jalaliWheel) focusJalaliYearItem();
      else if (jalaliPopover && jalaliPopover.querySelector('[data-jalali-year]')) jalaliPopover.querySelector('[data-jalali-year]').focus();
      return;
    }
    // چرخاندن سال: همان فهرست محدود ۱۳۰۰ تا ۱۵۰۰
    const picked = event.target.closest('[data-jalali-pick]');
    if (picked) {
      const year = clampInt(picked.dataset.jalaliPick, JALALI_YEAR_MIN, JALALI_YEAR_MAX);
      if (year) jalaliView = { year: year, month: jalaliView.month };
      jalaliWheel = false;
      renderJalaliPopover();
      const again = jalaliPopover && jalaliPopover.querySelector('[data-jalali-year]');
      if (again) again.focus();
      return;
    }
    const dayButton = event.target.closest('[data-jalali-day]');
    if (dayButton) {
      pickJalaliDay(Number(dayButton.dataset.jalaliDay));
      return;
    }
    const action = event.target.closest('[data-jalali-action]');
    if (action) {
      if (action.dataset.jalaliAction === 'today') {
        const today = intlJalaliParts(new Date());
        jalaliView = { year: today.year, month: today.month };
        pickJalaliDay(today.day);
      } else {
        closeJalaliPopover();
        if (jalaliOpener && document.contains(jalaliOpener)) jalaliOpener.focus();
      }
      return;
    }
    if (jalaliPopover && !jalaliPopover.hidden && !event.target.closest('.jalali-popover')) closeJalaliPopover();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && jalaliPopover && !jalaliPopover.hidden) closeJalaliPopover();
  });

  // ── تنظیمات داشبورد: چیدمان کادرهای سربرگ ─────────────────────────────────
  // ابعاد و جای هر کادر در تنظیمات تعیین می‌شود؛ در خود داشبورد دستگیرهٔ تغییر
  // اندازه وجود ندارد.
  const DASHBOARD_SPAN_BY_SIZE = { compact: 4, medium: 6, wide: 8, full: 12 };

  // کادرهای آماده‌ای که می‌توان به داشبورد افزود یا از آن برداشت.
  const DASHBOARD_CARD_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M8 14h8M8 17h5"/></svg>';

  const DASHBOARD_CARD_TYPES = [
    { id: 'card-notes', module: 'notes', title: 'یادداشت‌ها و پیگیری‌ها', subtitle: 'اقدام‌های باز؛ همین‌جا کامنت بگذار', size: 'medium', tone: 'warn', unit: 'یادداشت', statusField: 'status', commentLabel: 'کامنت', openOnly: true, closedStatuses: ['تکمیل‌شده', 'لغوشده'] },
    { id: 'card-missions', module: 'missions', title: 'مأموریت‌ها', subtitle: 'مأموریت‌های ثبت‌شده', size: 'medium', tone: 'info', unit: 'مأموریت', statusField: 'status' },
    { id: 'card-employees', module: 'employees', title: 'کارکنان', subtitle: 'پرونده‌های پرسنلی', size: 'compact', tone: 'ok', unit: 'نفر', statusField: 'status' },
    { id: 'card-leaves', module: 'leaves', title: 'مرخصی‌ها', subtitle: 'درخواست‌های مرخصی', size: 'compact', tone: 'accent', unit: 'درخواست', statusField: 'status' },
    { id: 'card-vehicles', module: 'vehicles', title: 'خودروها', subtitle: 'وضعیت ناوگان', size: 'compact', tone: 'info', unit: 'خودرو', statusField: 'status' },
    { id: 'card-gasmeters', module: 'gasmeters', title: 'گازسنج‌ها', subtitle: 'وضعیت کالیبراسیون و استقرار', size: 'compact', tone: 'warn', unit: 'گازسنج', statusField: 'status' },
    { id: 'card-programs', module: 'programs', title: 'برنامه‌ها و پرونده‌ها', subtitle: 'پرونده‌های باز؛ اقدام و کامنت همین‌جا', size: 'medium', tone: 'accent', unit: 'پرونده', statusField: 'status', commentLabel: 'کامنت/اقدام', openOnly: true, closedStatuses: ['تکمیل‌شده', 'لغوشده'] },
    { id: 'card-faults', module: 'faults', title: 'اشکال‌های خودرو', subtitle: 'اشکال‌های باز؛ همین‌جا رفع یا اقدام ثبت کن', size: 'medium', tone: 'warn', unit: 'اشکال', statusField: 'status', commentLabel: 'اقدام', resolve: true, openOnly: true, closedStatuses: ['رفع شد', 'بسته‌شده'] },
    { id: 'card-reports', module: 'reports', title: 'گزارشات', subtitle: 'گزارش‌های ثبت‌شده', size: 'compact', tone: 'ok', unit: 'گزارش', statusField: 'status' },
    { id: 'card-phonebook', module: 'phonebook', title: 'دفترچه تلفن', subtitle: 'شماره‌های تماس', size: 'compact', tone: 'info', unit: 'مخاطب' }
  ];

  function activeDashboardCards() {
    if (!appData.settings || typeof appData.settings !== 'object') appData.settings = {};
    if (!Array.isArray(appData.settings.dashboardCards)) appData.settings.dashboardCards = [];
    appData.settings.dashboardCards = appData.settings.dashboardCards.filter(function (id) {
      return DASHBOARD_CARD_TYPES.some(function (type) { return type.id === id; });
    });
    return appData.settings.dashboardCards;
  }

  function dashboardCardMeta(type, record) {
    const parts = [];
    const status = type.statusField ? record[type.statusField] : '';
    if (status) parts.push(String(status));
    const date = record.date || record.letterDate || record.plannedDate;
    if (date) parts.push(formatJalali(date, false));
    return parts.join(' · ') || (specs[type.module] ? specs[type.module].singular : '');
  }

  function dashboardTypeRecords(type) {
    const all = Array.isArray(appData[type.module]) ? appData[type.module].slice() : [];
    const open = type.openOnly ? all.filter(function (record) {
      return (type.closedStatuses || []).indexOf(record[type.statusField || 'status']) < 0;
    }) : all;
    return open.sort(function (a, b) {
      const left = String(b.reportedAt || b.dueDate || b.plannedDate || b.date || b.createdAt || '');
      const right = String(a.reportedAt || a.dueDate || a.plannedDate || a.date || a.createdAt || '');
      return left.localeCompare(right);
    });
  }

  function lastCommentLine(value) {
    const lines = String(value || '').split('\n').filter(function (line) { return line.trim(); });
    return lines.length ? lines[lines.length - 1].trim() : '';
  }

  function dashboardItemActions(type, record) {
    const key = esc(type.module + ':' + record.id);
    const parts = [];
    if (recordCommentField(type.module)) {
      parts.push('<button type="button" class="dash-mini-btn" data-dash-comment="' + key + '" aria-expanded="false">✎ ' + esc(type.commentLabel || 'کامنت') + '</button>');
    }
    if (type.resolve && (type.closedStatuses || []).indexOf(record.status) < 0) {
      parts.push('<button type="button" class="dash-mini-btn is-resolve" data-dash-resolve="' + key + '">✔ رفع شد</button>');
    }
    return parts.length ? '<div class="dash-item-actions">' + parts.join('') + '</div>' : '';
  }

  function dashboardCommentBox(type, record) {
    if (!recordCommentField(type.module)) return '';
    const key = esc(type.module + ':' + record.id);
    return '<div class="dash-comment" data-dash-comment-box="' + key + '" hidden>' +
      '<textarea rows="2" data-dash-comment-text="' + key + '" placeholder="' + esc(type.commentPlaceholder || 'کامنت یا اقدام انجام‌شده را با تاریخ بنویس…') + '"></textarea>' +
      '<div class="dash-comment-foot"><button type="button" class="dash-mini-btn is-save" data-dash-comment-save="' + key + '">ثبت کامنت</button>' +
      '<button type="button" class="dash-mini-btn" data-dash-comment-close="' + key + '">بستن</button></div></div>';
  }

  function dashboardModuleCardMarkup(type) {
    const records = dashboardTypeRecords(type);
    const items = records.slice(0, 4).map(function (record) {
      const commentField = recordCommentField(type.module);
      const last = commentField ? lastCommentLine(record[commentField]) : '';
      const meta = last ? 'آخرین: ' + last : dashboardCardMeta(type, record);
      return '<div class="list-item dash-item">' +
        '<div class="list-main"><b>' + esc(recordLabel(type.module, record)) + '</b><span>' + esc(meta) + '</span></div>' +
        dashboardItemActions(type, record) + '</div>' + dashboardCommentBox(type, record);
    }).join('');
    const count = records.length;
    return '<article class="widget dash-module-card" data-widget="' + esc(type.id) + '" data-dashboard-card="' + esc(type.id) + '" data-size="' + esc(type.size) + '">' +
      '<div class="widget-header"><div class="widget-title"><span class="widget-icon" data-tone="' + esc(type.tone) + '">' + DASHBOARD_CARD_ICON + '</span><div><h2>' + esc(type.title) + '</h2><p>' + esc(type.subtitle) + '</p></div></div>' +
      '<div class="widget-meta"><span class="status-pill" data-tone="' + esc(type.tone) + '">' + faDigits(count) + ' ' + esc(type.openOnly ? 'باز' : type.unit) + '</span>' +
      '<a class="dash-card-link" href="./index.html?view=' + esc(type.module) + '">همه ←</a></div></div>' +
      '<div class="list">' + (items || '<div class="list-item"><div class="list-main"><b>مورد بازی نیست</b><span>همهٔ موارد این بخش بسته شده‌اند</span></div></div>') + '</div>' +
      '</article>';
  }

  // ── کامنت/رفع از روی کادرهای داشبورد ───────────────────────────────────────
  function dashboardRecordById(moduleKey, recordId) {
    return (appData[moduleKey] || []).filter(function (record) {
      return String(record.id) === String(recordId);
    })[0] || null;
  }

  function commentStamp() {
    const now = new Date();
    const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    return formatJalali(todayIso(), false) + ' ' + time;
  }

  function appendDashboardComment(moduleKey, record, text) {
    const field = recordCommentField(moduleKey);
    if (!field || !record) return false;
    const line = [commentStamp(), 'داشبورد', text, record.status || ''].filter(Boolean).join(' | ');
    const current = String(record[field] || '').replace(/\s+$/, '');
    record[field] = current ? current + '\n' + line : line;
    addHistory(moduleKey, record, 'کامنت از داشبورد', [{ field: 'کامنت', before: '', after: text.slice(0, 80) }]);
    return true;
  }

  function resolveFaultFromDashboard(record) {
    if (!record) return false;
    const before = record.status || 'ثبت‌شده';
    record.status = 'رفع شد';
    record.progress = 100;
    record.resolvedAt = todayIso();
    const line = [commentStamp(), 'داشبورد', 'رفع شد از داشبورد', 'رفع شد'].join(' | ');
    const steps = String(record.steps || '').replace(/\s+$/, '');
    record.steps = steps ? steps + '\n' + line : line;
    addHistory('faults', record, 'رفع از داشبورد', [{ field: 'وضعیت', before: before, after: 'رفع شد' }]);
    return true;
  }

  document.addEventListener('click', async function (event) {
    const toggle = event.target.closest('[data-dash-comment]');
    if (toggle) {
      event.preventDefault();
      const key = toggle.dataset.dashComment;
      const box = document.querySelector('[data-dash-comment-box="' + key + '"]');
      if (!box) return;
      const opening = box.hidden;
      document.querySelectorAll('[data-dash-comment-box]').forEach(function (node) { if (node !== box) node.hidden = true; });
      box.hidden = !opening;
      toggle.setAttribute('aria-expanded', String(opening));
      if (opening) {
        const textarea = box.querySelector('textarea');
        if (textarea) textarea.focus();
      }
      return;
    }
    const close = event.target.closest('[data-dash-comment-close]');
    if (close) {
      event.preventDefault();
      const box = document.querySelector('[data-dash-comment-box="' + close.dataset.dashCommentClose + '"]');
      if (box) box.hidden = true;
      return;
    }
    const save = event.target.closest('[data-dash-comment-save]');
    if (save) {
      event.preventDefault();
      const key = save.dataset.dashCommentSave;
      const split = key.split(':');
      const textarea = document.querySelector('[data-dash-comment-text="' + key + '"]');
      const text = textarea ? textarea.value.trim() : '';
      if (!text) { if (textarea) textarea.focus(); return; }
      const record = dashboardRecordById(split[0], split[1]);
      if (!record || !appendDashboardComment(split[0], record, text)) { toast('ثبت کامنت انجام نشد.'); return; }
      if (textarea) textarea.value = '';
      const saved = await saveState();
      applyDashboardLayout();
      toast(saved ? 'کامنت ثبت شد.' : 'کامنت در حافظهٔ موقت ثبت شد؛ ذخیره‌سازی را بررسی کن.');
      return;
    }
    const resolveBtn = event.target.closest('[data-dash-resolve]');
    if (resolveBtn) {
      event.preventDefault();
      const split = resolveBtn.dataset.dashResolve.split(':');
      const record = dashboardRecordById(split[0], split[1]);
      if (!record) return;
      const ok = await askConfirm({ title: 'رفع اشکال', message: 'این اشکال «رفع شد» ثبت شود؟ روند رفع هم به‌صورت یک اقدام در سابقه می‌آید.', confirmLabel: 'بله، رفع شد' });
      if (!ok) return;
      resolveFaultFromDashboard(record);
      const saved = await saveState();
      applyDashboardLayout();
      toast(saved ? 'اشکال به‌عنوان رفع‌شده ثبت شد.' : 'وضعیت تغییر کرد ولی ذخیره‌سازی انجام نشد.');
      return;
    }
  });

  // کادرهای افزوده‌شده پیش از اعمال چیدمان ساخته می‌شوند تا در مرجع چیدمان دیده شوند.
  function renderDashboardCards() {
    const host = document.getElementById('dashboard');
    if (!host) return;
    Array.prototype.slice.call(host.querySelectorAll('[data-dashboard-card]')).forEach(function (node) { node.remove(); });
    activeDashboardCards().forEach(function (id) {
      const type = DASHBOARD_CARD_TYPES.filter(function (item) { return item.id === id; })[0];
      if (type) host.insertAdjacentHTML('beforeend', dashboardModuleCardMarkup(type));
    });
  }

  function dashboardWidgetCatalog() {
    const host = document.getElementById('dashboard');
    if (!host) return [];
    return Array.prototype.slice.call(host.querySelectorAll('[data-widget]')).map(function (node) {
      const title = node.querySelector('.widget-title h2');
      const subtitle = node.querySelector('.widget-title p');
      return {
        id: node.dataset.widget,
        title: title ? title.textContent.trim() : node.dataset.widget,
        subtitle: subtitle ? subtitle.textContent.trim() : '',
        size: node.dataset.size || 'medium'
      };
    });
  }

  function dashboardDefaultLayout() {
    const layout = { order: [], spans: {}, heights: {}, hidden: [] };
    dashboardWidgetCatalog().forEach(function (widget) {
      layout.order.push(widget.id);
      layout.spans[widget.id] = DASHBOARD_SPAN_BY_SIZE[widget.size] || 6;
    });
    return layout;
  }

  function dashboardLayout() {
    if (!appData.settings || typeof appData.settings !== 'object') appData.settings = {};
    let layout = appData.settings.dashboardLayout;
    if (!layout || typeof layout !== 'object') layout = { order: [], spans: {}, heights: {}, hidden: [] };
    const defaults = dashboardDefaultLayout();
    if (!Array.isArray(layout.order)) layout.order = [];
    if (!layout.spans || typeof layout.spans !== 'object') layout.spans = {};
    if (!layout.heights || typeof layout.heights !== 'object') layout.heights = {};
    if (!Array.isArray(layout.hidden)) layout.hidden = [];
    defaults.order.forEach(function (id) {
      if (layout.order.indexOf(id) < 0) layout.order.push(id);
      if (!layout.spans[id]) layout.spans[id] = defaults.spans[id];
    });
    layout.order = layout.order.filter(function (id) { return defaults.order.indexOf(id) >= 0; });
    appData.settings.dashboardLayout = layout;
    return layout;
  }

  // چیدمان ذخیره‌شده روی کادرهای واقعی داشبورد اعمال می‌شود.
  function applyDashboardLayout() {
    const host = document.getElementById('dashboard');
    if (!host) return;
    renderDashboardCards();
    const layout = dashboardLayout();
    const nodes = Array.prototype.slice.call(host.querySelectorAll('[data-widget]'));
    nodes.forEach(function (node) {
      const id = node.dataset.widget;
      const span = layout.spans[id];
      const hidden = layout.hidden.indexOf(id) >= 0;
      node.style.display = hidden ? 'none' : '';
      node.style.gridColumn = span ? 'span ' + span : '';
      const height = layout.heights[id];
      node.style.minHeight = height ? height + 'px' : '';
    });
    layout.order.forEach(function (id) {
      const node = nodes.filter(function (item) { return item.dataset.widget === id; })[0];
      if (node) host.appendChild(node);
    });
  }

  function dashCardFoot(card) {
    const span = Number(card.dataset.dashSpan || 6);
    const height = Number(card.dataset.dashHeight || 0);
    const spanNode = card.querySelector('[data-dash-foot-span]');
    const heightNode = card.querySelector('[data-dash-foot-height]');
    if (spanNode) spanNode.textContent = 'عرض: ' + faDigits(span) + ' از ۱۲';
    if (heightNode) heightNode.textContent = 'ارتفاع: ' + (height ? faDigits(height) + ' پیکسل' : 'خودکار');
  }

  function dashboardCardMarkup(widget, layout) {
    const span = Number(layout.spans[widget.id] || 6);
    const height = Number(layout.heights[widget.id] || 0);
    return '<article class="dash-card" data-dash-card="' + esc(widget.id) + '" data-dash-span="' + span + '" data-dash-height="' + height + '" style="--span:' + span + (height ? ';min-height:' + height + 'px' : '') + '">' +
      '<header class="dash-card-head">' +
        '<button type="button" class="dash-card-drag" data-dash-drag="' + esc(widget.id) + '" aria-label="جابه‌جایی کادر">⠿</button>' +
        '<div class="dash-card-title"><b>' + esc(widget.title) + '</b><span>' + esc(widget.subtitle) + '</span></div>' +
        '<button type="button" class="dash-card-remove" data-dash-remove="' + esc(widget.id) + '" aria-label="حذف کادر از داشبورد" title="حذف از داشبورد">×</button>' +
      '</header>' +
      '<div class="dash-card-body" aria-hidden="true"></div>' +
      '<footer class="dash-card-foot"><span data-dash-foot-span>عرض: ' + faDigits(span) + ' از ۱۲</span><span data-dash-foot-height>ارتفاع: ' + (height ? faDigits(height) + ' پیکسل' : 'خودکار') + '</span></footer>' +
      '<span class="dash-resize" data-dash-resize="w" role="separator" aria-label="تغییر عرض کادر"></span>' +
      '<span class="dash-resize" data-dash-resize="h" role="separator" aria-label="تغییر ارتفاع کادر"></span>' +
      '<span class="dash-resize dash-resize-corner" data-dash-resize="both" role="separator" aria-label="تغییر اندازهٔ کادر"></span>' +
    '</article>';
  }

  function dashboardEditorMarkup() {
    renderDashboardCards();
    const catalog = dashboardWidgetCatalog();
    const layout = dashboardLayout();
    const byId = function (id) { return catalog.filter(function (item) { return item.id === id; })[0]; };
    const visible = layout.order.map(byId).filter(Boolean).filter(function (widget) { return layout.hidden.indexOf(widget.id) < 0; });
    const activeCards = activeDashboardCards();
    const availableCards = DASHBOARD_CARD_TYPES.filter(function (type) { return activeCards.indexOf(type.id) < 0; });
    const hiddenBuiltins = catalog.filter(function (widget) {
      return layout.hidden.indexOf(widget.id) >= 0 && widget.id.indexOf('card-') !== 0;
    });
    const options = [];
    if (availableCards.length) {
      options.push('<optgroup label="کادرهای آمادهٔ داشبورد">' + availableCards.map(function (type) {
        return '<option value="' + esc(type.id) + '">' + esc(type.title) + '</option>';
      }).join('') + '</optgroup>');
    }
    if (hiddenBuiltins.length) {
      options.push('<optgroup label="کادرهای حذف‌شده">' + hiddenBuiltins.map(function (widget) {
        return '<option value="' + esc(widget.id) + '">' + esc(widget.title) + '</option>';
      }).join('') + '</optgroup>');
    }
    return '<section class="module-list-panel">' +
      '<div class="module-list-head"><div><h3>تنظیمات داشبورد</h3>' +
      '<p>چیدمان کادرهای سربرگ داشبورد اینجا تعیین می‌شود: با کشیدن دستگیرهٔ ⠿ جای کادر را عوض کن، از لبه‌ها و گوشه‌ها ابعاد را کم و زیاد کن و کادرهای تازه مثل یادداشت‌ها را اضافه یا حذف کن.</p></div>' +
      '<div class="module-list-tools">' +
        (options.length
          ? '<select data-dash-hidden-select aria-label="کادرهای قابل افزودن">' + options.join('') + '</select><button type="button" class="secondary-btn" data-dash-add>+ افزودن کادر</button>'
          : '<span class="module-local-note">همهٔ کادرها روی داشبورد هستند.</span>') +
        '<button type="button" class="secondary-btn" data-dash-reset>بازنشانی چیدمان</button>' +
      '</div></div>' +
      '<div class="dash-editor" data-dash-editor>' + visible.map(function (widget) { return dashboardCardMarkup(widget, layout); }).join('') + '</div>' +
      '<p class="dash-editor-note">تغییرها بی‌درنگ ذخیره و روی داشبورد اعمال می‌شوند. شبکهٔ داشبورد ۱۲ ستونه است؛ «عرض» تعداد ستون‌ها و «ارتفاع» کمینهٔ ارتفاع کادر است. کادرهای حذف‌شده در همین فهرست «افزودن کادر» باقی می‌مانند.</p>' +
      '</section>';
  }

  let dashEdit = null;
  let dashEditorBound = false;

  function onDashEditMove(event) {
    if (!dashEdit) return;
    const editor = dashEdit.editor;
    const card = dashEdit.card;
    if (dashEdit.mode === 'resize') {
      if (dashEdit.axis === 'w' || dashEdit.axis === 'both') {
        const rect = editor.getBoundingClientRect();
        const style = window.getComputedStyle(editor);
        const gap = parseFloat(style.columnGap || style.gap) || 0;
        const columnWidth = (rect.width - gap * 11) / 12;
        const unit = columnWidth + gap;
        const cardRect = card.getBoundingClientRect();
        const rtl = (document.documentElement.dir || 'rtl') === 'rtl';
        const distance = rtl ? (cardRect.right - event.clientX) : (event.clientX - cardRect.left);
        const span = Math.min(12, Math.max(1, Math.round((distance + gap) / unit)));
        card.dataset.dashSpan = String(span);
        card.style.setProperty('--span', String(span));
      }
      if (dashEdit.axis === 'h' || dashEdit.axis === 'both') {
        const height = Math.min(1200, Math.max(140, Math.round(dashEdit.startHeight + (event.clientY - dashEdit.startY))));
        card.dataset.dashHeight = String(height);
        card.style.minHeight = height + 'px';
      }
      dashCardFoot(card);
      event.preventDefault();
      return;
    }
    const over = document.elementFromPoint(event.clientX, event.clientY);
    const target = over && over.closest ? over.closest('[data-dash-card]') : null;
    if (!target || target === card || !editor.contains(target)) return;
    const rect = target.getBoundingClientRect();
    const rtl = (document.documentElement.dir || 'rtl') === 'rtl';
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    let after;
    if (Math.abs(dx) > Math.abs(dy)) after = rtl ? dx < 0 : dx > 0;
    else after = dy > 0;
    editor.insertBefore(card, after ? target.nextSibling : target);
  }

  function onDashEditEnd() {
    if (!dashEdit) return;
    const card = dashEdit.card;
    const editor = dashEdit.editor;
    const mode = dashEdit.mode;
    card.classList.remove('is-resizing', 'is-dragging');
    const layout = dashboardLayout();
    if (mode === 'resize') {
      layout.spans[card.dataset.dashCard] = Number(card.dataset.dashSpan || 6);
      const height = Number(card.dataset.dashHeight || 0);
      if (height) layout.heights[card.dataset.dashCard] = height;
      else delete layout.heights[card.dataset.dashCard];
    } else {
      const order = Array.prototype.slice.call(editor.querySelectorAll('[data-dash-card]')).map(function (node) { return node.dataset.dashCard; });
      const rest = layout.order.filter(function (id) { return order.indexOf(id) < 0; });
      layout.order = order.concat(rest);
    }
    dashEdit = null;
    applyDashboardLayout();
    saveState();
  }

  function wireDashboardEditor() {
    const editor = document.querySelector('[data-dash-editor]');
    if (!editor) return;
    editor.addEventListener('pointerdown', function (event) {
      const card = event.target.closest('[data-dash-card]');
      if (!card) return;
      const resize = event.target.closest('[data-dash-resize]');
      const drag = event.target.closest('[data-dash-drag]');
      const rect = card.getBoundingClientRect();
      if (resize) {
        dashEdit = { mode: 'resize', axis: resize.dataset.dashResize, card: card, editor: editor, startX: event.clientX, startY: event.clientY, startHeight: rect.height };
        card.classList.add('is-resizing');
        if (resize.setPointerCapture) resize.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
      if (drag) {
        dashEdit = { mode: 'drag', card: card, editor: editor, startX: event.clientX, startY: event.clientY };
        card.classList.add('is-dragging');
        if (drag.setPointerCapture) drag.setPointerCapture(event.pointerId);
        event.preventDefault();
      }
    });
    if (dashEditorBound) return;
    dashEditorBound = true;
    document.addEventListener('pointermove', onDashEditMove);
    document.addEventListener('pointerup', onDashEditEnd);
    document.addEventListener('pointercancel', onDashEditEnd);
  }

  // ── مسیردهی چرخ ماوس ───────────────────────────────────────────────────────
  // این رفتار یک صاحب دارد: `design/scroll-routing.js`. این‌جا هیچ شنوندهٔ چرخ
  // دیگری ثبت نکنید؛ اگر رفتاری کم است، همان فایل واحد را اصلاح کنید.

  // ── تب‌های تنظیمات و اقدام‌های صفحهٔ تنظیمات ──
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    const input = event.target.closest ? event.target.closest('[data-reference-input]') : null;
    if (!input) return;
    event.preventDefault();
    const card = input.closest('[data-reference-card]');
    const button = card && card.querySelector('[data-module-action="reference-add"]');
    if (button) button.click();
  });

  document.addEventListener('click', async function (event) {
    const settingsButton = event.target.closest('[data-settings-tab]');
    const view = document.getElementById('sectionView');
    if (settingsButton) {
      event.preventDefault();
      settingsTab = settingsButton.dataset.settingsTab || 'lists';
      render('settings', view);
      return;
    }
    const referenceTabButton = event.target.closest('[data-reference-tab]');
    if (referenceTabButton) {
      event.preventDefault();
      referenceTab = referenceTabButton.dataset.referenceTab || 'places';
      render('settings', view);
      return;
    }
    const removeCard = event.target.closest('[data-dash-remove]');
    if (removeCard) {
      event.preventDefault();
      const layout = dashboardLayout();
      const id = removeCard.dataset.dashRemove;
      if (id.indexOf('card-') === 0) {
        appData.settings.dashboardCards = activeDashboardCards().filter(function (item) { return item !== id; });
        layout.order = layout.order.filter(function (item) { return item !== id; });
        layout.hidden = layout.hidden.filter(function (item) { return item !== id; });
        delete layout.spans[id];
        delete layout.heights[id];
      } else if (layout.hidden.indexOf(id) < 0) {
        layout.hidden.push(id);
      }
      applyDashboardLayout();
      if (await saveState()) { render('settings', view); toast('کادر از داشبورد حذف شد. هر وقت خواستی از «افزودن کادر» برمی‌گردد.'); }
      return;
    }
    const addCard = event.target.closest('[data-dash-add]');
    if (addCard) {
      event.preventDefault();
      const picker = document.querySelector('[data-dash-hidden-select]');
      const value = picker && picker.value;
      if (!value) return;
      const layout = dashboardLayout();
      const isCardType = DASHBOARD_CARD_TYPES.some(function (type) { return type.id === value; });
      if (isCardType) {
        const cards = activeDashboardCards();
        if (cards.indexOf(value) < 0) cards.push(value);
      }
      layout.hidden = layout.hidden.filter(function (item) { return item !== value; });
      applyDashboardLayout();
      if (await saveState()) { render('settings', view); toast('کادر به داشبورد افزوده شد.'); }
      return;
    }
    const qaUp = event.target.closest('[data-qa-up]');
    const qaDown = event.target.closest('[data-qa-down]');
    if (qaUp || qaDown) {
      event.preventDefault();
      const id = (qaUp || qaDown).dataset[qaUp ? 'qaUp' : 'qaDown'];
      const items = quickAddState();
      const index = items.findIndex(function (item) { return item.id === id; });
      const target = qaUp ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= items.length) return;
      const moved = items.splice(index, 1)[0];
      items.splice(target, 0, moved);
      if (await saveQuickAddState(items)) render('settings', view);
      return;
    }
    const qaReset = event.target.closest('[data-qa-reset]');
    if (qaReset) {
      event.preventDefault();
      if (!(await askConfirm({ title: 'بازنشانی ثبت سریع', message: 'دکمه‌های ثبت سریع داشبورد به ترتیب و حالت پیش‌فرض برمی‌گردند.', confirmLabel: 'بازنشانی' }))) return;
      delete appData.settings.quickAdd;
      renderQuickAdd();
      if (await saveState()) { render('settings', view); toast('ثبت سریع داشبورد بازنشانی شد.'); }
      return;
    }
    const resetCards = event.target.closest('[data-dash-reset]');
    if (resetCards) {
      event.preventDefault();
      if (!(await askConfirm({ title: 'بازنشانی چیدمان داشبورد', message: 'اندازه‌ها، ترتیب و کادرهای حذف‌شده به حالت اولیه برمی‌گردند.', confirmLabel: 'بازنشانی' }))) return;
      delete appData.settings.dashboardLayout;
      appData.settings.dashboardCards = [];
      dashboardLayout();
      applyDashboardLayout();
      if (await saveState()) { render('settings', view); toast('چیدمان داشبورد بازنشانی شد.'); }
    }
  });

  // روشن/خاموش کردن دکمه‌های ثبت سریع از تنظیمات.
  document.addEventListener('change', async function (event) {
    const toggle = event.target.closest('[data-qa-toggle]');
    if (!toggle) return;
    const id = toggle.dataset.qaToggle;
    const items = quickAddState().map(function (item) {
      return item.id === id ? { id: item.id, enabled: toggle.checked } : item;
    });
    const view = document.getElementById('sectionView');
    if (await saveQuickAddState(items)) {
      if (view) render('settings', view);
      toast(toggle.checked ? 'دکمهٔ «' + (quickAddCatalogItem(id) || {}).label + '» به ثبت سریع داشبورد افزوده شد.' : 'دکمهٔ «' + (quickAddCatalogItem(id) || {}).label + '» از ثبت سریع داشبورد برداشته شد.');
    }
  });

  window.ATLAS_MODULES = {
    render: render,
    fieldsFor: fieldsFor,
    spec: function (moduleKey) { return specs[moduleKey] || null; },
    displayValue: displayValue,
    formatJalali: formatJalali,
    refreshDashboard: refreshDashboard,
    applyDashboardLayout: applyDashboardLayout,
    getData: function () { return appData; },
    isReady: function () { return ready; },
    parseJalali: parseJalali,
    formatJalali: formatJalali,
    confirm: askConfirm,
    prompt: askPrompt,
    showText: askText,
    setGasTab: setGasTab,
    setVehicleTab: setVehicleTab,
    saveNow: saveState,
    sectionBackup: exportSectionBackup,
    sectionBackupButton: sectionBackupButton,
    addReferenceValue: async function (key, value) {
      const text = String(value == null ? '' : value).trim();
      if (!key || !text) return false;
      const base = referenceBaseKey(key);
      if (!appData.references || typeof appData.references !== 'object') appData.references = {};
      [base, key].forEach(function (target) {
        if (!target) return;
        if (!Array.isArray(appData.references[target])) appData.references[target] = [];
        if (appData.references[target].indexOf(text) < 0) {
          appData.references[target].push(text);
          appData.references[target].sort(function (a, b) { return String(a).localeCompare(String(b), 'fa'); });
        }
      });
      return saveState();
    },
    updateSettings: async function (patch) {
      if (!patch || typeof patch !== 'object') return false;
      appData.settings = Object.assign(appData.settings || {}, patch);
      return saveState();
    },
    footprint: function () { return storageFootprint(); },
    storageStatus: function () { return { ready: ready, locked: storageLocked, encrypted: !!(window.ATLAS_SECURE && !storageLocked), error: loadError }; }
  };

  // تور ایمنی: هر تعاملی که داده را عوض کند، بی‌درنگ (و بدون نیاز به صدا زدن saveState) ذخیره می‌شود.
  ['click', 'change', 'submit', 'drop', 'input'].forEach(function (name) {
    document.addEventListener(name, function () { scheduleAutoFlush(400); }, true);
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) flushNow(); });
  window.addEventListener('pagehide', function () { flushNow(); });

  document.addEventListener('DOMContentLoaded', function(){refreshDashboard();});
  initializeStorage();
})();
(function () {
  'use strict';

  const DB_NAME = 'ATLAS_SHIFT_LOCAL';
  const DB_VERSION = 1;
  const STORE_NAME = 'records';
  const STORE_KEY = 'main';
  const LEGACY_KEY = 'atlasShiftOperationalDataV1';
  const MODULES = ['employees', 'missions', 'leaves', 'vehicles', 'gasmeters', 'notes', 'programs'];
  const formState = Object.create(null);
  const searchState = Object.create(null);
  const filterState = Object.create(null);
  let shiftFormState = { open:false, id:null };
  let appData = createEmptyState();
  let db = null;
  let ready = false;
  let loadError = '';
  let reportPeriod = 'month';
  let dashboardRange = { name:'today', start:todayIso(), end:todayIso() };
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
        {key:'workType',label:'نوع کار',type:'select',required:true,listKey:'workTypes',options:['شیفتی','روزکار']},
        {key:'employmentType',label:'نوع استخدام',type:'select',required:true,listKey:'employmentTypes',options:['رسمی','پیمانی','قراردادی','شرکتی','سایر']},
        {key:'workplace',label:'محل سازمانی',type:'select',required:true,listKey:'workplaces',options:['اهواز','آبادان','اندیمشک','ماهشهر','بندر امام','آغاجاری','سایر']},
        {key:'assignedWorkplace',label:'محل خدمت فعلی',placeholder:'ایستگاه، محدوده یا محل مأموریت'},
        {key:'deploymentPoint',label:'محل استقرار',type:'select',listKey:'operationalPoints',options:['پارکینگ مرکزی','تعمیرگاه مرکزی','انبار مرکزی','محور جاده']},
        {key:'shiftPattern',label:'الگوی شیفت',type:'select',listKey:'shiftPatterns',options:['۱۲ ساعته روز/شب','۲۴/۴۸','ثابت روزکار','سایر']},
        {key:'status',label:'وضعیت جاری',type:'select',required:true,listKey:'employeeStatuses',options:['آماده‌کار','در حال کار','شیفت','مأموریت','مرخصی','استراحت','اضافه‌کار','غیرفعال']},
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
        {key:'missionType',label:'نوع فعالیت',type:'select',required:true,listKey:'missionTypes',options:['نظارت بر جوشکاری','بررسی انشعاب یا نشتی','بررسی آلودگی خاک یا آب','بازدید ایستگاه','سرویس تجهیزات','بازدید ایمنی','سایر']},
        {key:'startAt',label:'زمان شروع',type:'jalali-datetime',required:true},
        {key:'endAt',label:'زمان پایان',type:'jalali-datetime'},
        {key:'city',label:'شهر یا محدوده',type:'select',required:true,listKey:'workplaces',options:['اهواز','آبادان','اندیمشک','ماهشهر','بندر امام','آغاجاری','سایر']},
        {key:'origin',label:'مبدأ'},
        {key:'destination',label:'مقصد یا محل عملیات'},
        {key:'stops',label:'توقف‌ها و نقاط مسیر',type:'textarea',wide:true,placeholder:'هر نقطه را در یک خط وارد کن'},
        {key:'pipelineSize',label:'قطر خط (اینچ)',type:'select',listKey:'pipelineSizes',options:['۴','۶','۸','۱۰','۱۲','۱۴','۱۶','۲۰','۲۴','۳۰','۳۶']},
        {key:'productType',label:'نوع فرآورده',type:'select',listKey:'products',options:['نفت خام','نفت گاز','بنزین','نفت سفید','گاز مایع','آب آلوده','سایر']},
        {key:'operationalRange',label:'محدوده عملیاتی / کیلومتر خط',placeholder:'مثلاً روستای سویسه، روستای الهایی، کیلومتر ۹۶ تا ۱۰۲'},
        {key:'rangeOption',label:'محدودهٔ عملیاتی (فهرست)',type:'select',listKey:'operationalRanges',options:['روستای سویسه','روستای الهایی','کیلومتر ۹۶ تا ۱۰۲','کیلومتر ۱۲۰ تا ۱۳۵','محور اهواز – آبادان']},
        {key:'lineNotes',label:'شرح خط و نقطه عملیات',type:'textarea',wide:true},
        {key:'crewIds',label:'افراد اعزامی',type:'select',source:'employees',multiple:true,wide:true},
        {key:'crewText',label:'شرح گروه یا افراد خارج از فهرست',type:'textarea',wide:true},
        {key:'driverId',label:'راننده',type:'select',source:'employees'},
        {key:'vehicleId',label:'خودرو',type:'select',source:'vehicles'},
        {key:'status',label:'وضعیت مأموریت',type:'select',required:true,listKey:'missionStatuses',options:['برنامه‌ریزی‌شده','در جریان','انجام‌شده','لغو‌شده']},
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
        {key:'leaveType',label:'نوع مرخصی',type:'select',required:true,listKey:'leaveTypes',options:['استحقاقی','استعلاجی','بدون حقوق','ساعتی','سایر']},
        {key:'startDate',label:'از تاریخ شمسی',type:'jalali',required:true},
        {key:'endDate',label:'تا تاریخ شمسی',type:'jalali',required:true},
        {key:'expectedReturn',label:'بازگشت مورد انتظار',type:'jalali'},
        {key:'actualReturn',label:'تاریخ حضور واقعی',type:'jalali'},
        {key:'status',label:'وضعیت درخواست',type:'select',required:true,listKey:'leaveStatuses',options:['در انتظار بررسی','تأییدشده','ردشده','استفاده‌شده']},
        {key:'reason',label:'دلیل و توضیحات',type:'textarea',wide:true}
      ],
      columns: ['employeeId','groupName','leaveType','startDate','endDate','expectedReturn','status']
    },
    vehicles: {
      title: 'خودروها', singular: 'خودرو',
      subtitle: 'مشخصات ناوگان، موقعیت فعلی، خرابی‌ها، کیلومتر و سرویس',
      fields: [
        {key:'name',label:'نام یا عنوان خودرو',required:true},
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
    gasmeters: {
      title: 'گازسنج‌ها', singular: 'گازسنج',
      subtitle: 'مشخصات دستگاه، محل و مسئول، کالیبراسیون، تعمیرات و گواهی',
      fields: [
        {key:'code',label:'کد دستگاه',required:true},
        {key:'model',label:'مدل دستگاه'},
        {key:'sensorType',label:'نوع سنسور گازسنج',type:'select',listKey:'gasSensorTypes',options:['گازسنج چهارکاره','گازسنج تک‌کاره','آشکارساز H₂S','آشکارساز LEL','آشکارساز O₂','سایر']},
        {key:'serial',label:'شمارهٔ سریال',required:true},
        {key:'gases',label:'گازهای قابل‌اندازه‌گیری',type:'checks',options:['CO','O₂','LEL','H₂S']},
        {key:'sensorCount',label:'تعداد سنسورها (محاسبه خودکار)',type:'number',min:0},
        {key:'status',label:'وضعیت دستگاه',type:'select',required:true,listKey:'gasStatuses',options:['آماده استفاده','در کالیبراسیون','خارج از سرویس','در تعمیر']},
        {key:'healthStatus',label:'وضعیت سلامت',type:'select',listKey:'healthStatuses',options:['سالم','نیازمند بررسی','دارای نقص','در حال تعمیر']},
        {key:'location',label:'محل استقرار',placeholder:'خودرو، واحد، مرکز، ساختمان یا شخص'},
        {key:'locationPoint',label:'محل استقرار (فهرست نقاط)',type:'select',listKey:'gasSensorLocations',options:['پارکینگ مرکزی','تعمیرگاه مرکزی','انبار مرکزی','محور جاده','دفتر مرکزی','سایر']},
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
      columns: ['code','model','sensorType','serial','gases','status','location','calibrationEnd','responsibleId']
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
        {key:'location',label:'محل اجرا یا عملیات'},
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
    }
  };

  function createEmptyState() {
    const state = {
      schemaVersion: 2,
      settings: { employeeCustomFields: '' },
      references: {"workplaces":["اهواز","آبادان","اندیمشک","ماهشهر","بندر امام","آغاجاری","سایر"],"leaveTypes":["استحقاقی","استعلاجی","بدون حقوق","ساعتی","سایر"],"missionTypes":["نظارت بر جوشکاری","بررسی انشعاب یا نشتی","بررسی آلودگی خاک یا آب","بازدید ایستگاه","سرویس تجهیزات","بازدید ایمنی","سایر"],"pipelineSizes":["۴","۶","۸","۱۰","۱۲","۱۴","۱۶","۲۰","۲۴","۳۰","۳۶"],"products":["نفت خام","نفت گاز","بنزین","نفت سفید","گاز مایع","آب آلوده","سایر"],"vehicleTypes":["خودروی آتش‌نشانی","خودروی پشتیبانی","وانت","سواری","مینی‌بوس","سایر"],"vehicleStatuses":["آماده","در سرویس","خارج از سرویس","در تعمیر"],"gasStatuses":["آماده استفاده","در کالیبراسیون","خارج از سرویس","در تعمیر"],"actionTypes":["نامه اداری","درخواست خرید","استعلام","برآورد هزینه","برآورد قیمت","برنامه‌ریزی مانور","تعمیر خودرو","ارسال کالیبراسیون","پاسخ نامه","پیگیری قطعه","ارسال تجهیزات","بازدید","بازرسی","ممیزی","اقدام اصلاحی","یادداشت عمومی","سایر"],"programCategories":["هدف","برنامه فعالیت","مانور","روتین","دوره آموزشی","سایر"],"programTypes":["مانور","تعمیر تجهیز","تعمیر خودرو","کالیبراسیون","بازرسی","اقدام اصلاحی","درخواست خرید","پروژه عملیاتی","سایر"],"workTypes":["شیفتی","روزکار"],"employmentTypes":["رسمی","پیمانی","قراردادی","شرکتی","سایر"],"shiftPatterns":["۱۲ ساعته روز/شب","۲۴/۴۸","ثابت روزکار","سایر"],"employeeStatuses":["آماده‌کار","در حال کار","شیفت","مأموریت","مرخصی","استراحت","اضافه‌کار","غیرفعال"],"missionStatuses":["برنامه‌ریزی‌شده","در جریان","انجام‌شده","لغو‌شده"],"leaveStatuses":["در انتظار بررسی","تأییدشده","ردشده","استفاده‌شده"],"healthStatuses":["سالم","نیازمند بررسی","دارای نقص","در حال تعمیر"],"noteStatuses":["شروع‌نشده","در حال انجام","در انتظار پاسخ","ارجاع‌شده","تکمیل‌شده","لغوشده","عقب‌افتاده"],"reportStatuses":["تهیه نشده","در حال تهیه","ارسال شده","نیازمند اصلاح"],"programStatuses":["برنامه‌ریزی‌شده","در حال اقدام","در انتظار پاسخ","متوقف","تکمیل‌شده","لغوشده"],"operationalPoints":["پارکینگ مرکزی","تعمیرگاه مرکزی","انبار مرکزی","محور جاده"],"gasSensorTypes":["گازسنج چهارکاره","گازسنج تک‌کاره","آشکارساز H₂S","آشکارساز LEL","آشکارساز O₂","سایر"],"gasSensorLocations":["پارکینگ مرکزی","تعمیرگاه مرکزی","انبار مرکزی","محور جاده","دفتر مرکزی","سایر"],"operationalRanges":["روستای سویسه","روستای الهایی","کیلومتر ۹۶ تا ۱۰۲","کیلومتر ۱۲۰ تا ۱۳۵","محور اهواز – آبادان"],"vehicleServiceTypes":["تعویض روغن","سرویس دوره‌ای","سوخت‌گیری","تعویض فیلتر","معاینه فنی","تعمیر اضطراری"]},
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
    out.programs.forEach(function (record) {
      if (!Array.isArray(record.stages)) record.stages = [];
      if (!record.programCategory) record.programCategory = record.programType === 'مانور' ? 'مانور' : 'برنامه فعالیت';
    });
    if (value.settings && typeof value.settings === 'object') out.settings = Object.assign(out.settings, value.settings);
    if (value.references && typeof value.references === 'object') out.references = Object.assign(out.references, value.references);
    if (Array.isArray(value.history)) out.history = value.history.slice(-3000);
    if (Array.isArray(value.shifts)) out.shifts = value.shifts.filter(function(item){return item&&typeof item==='object';});
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
    if (field.listKey && data.references && Array.isArray(data.references[field.listKey])) {
      return data.references[field.listKey].map(function (option) { return {value:option,label:option}; });
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
        (field.listKey && !field.multiple ? '<button type="button" class="module-select-add" data-add-list-option="' + esc(field.listKey) + '" data-view="' + esc(moduleKey) + '" aria-label="افزودن گزینه به ' + esc(field.label) + '" title="افزودن گزینه جدید">＋</button>' : '') +
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
    if (field.type === 'select' && field.listKey && !field.multiple) control = '<span class="module-select-with-add">' + control + '</span>';
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
    let relatedVehicleHistory = '';
    if (moduleKey === 'vehicles' && existing) {
      const linked = (data.missions || []).filter(function (mission) {
        return String(mission.vehicleId || '') === String(existing.id);
      }).slice().sort(function (a,b) { return String(b.startAt || '').localeCompare(String(a.startAt || '')); });
      relatedVehicleHistory = '<section class="module-related-history"><div class="module-list-head"><div><h3>سوابق مأموریت این خودرو</h3><p>این فهرست از مأموریت‌هایی ساخته می‌شود که همین خودرو در آن‌ها انتخاب شده است.</p></div><span class="module-tag">' + faDigits(linked.length) + ' مورد</span></div>' +
        (linked.length ? '<div class="module-table-wrap" style="width:100%;min-width:0"><table class="module-table"><thead><tr><th>مأموریت</th><th>نوع فعالیت</th><th>شروع</th><th>پایان</th><th>وضعیت</th><th>گروه اعزامی</th></tr></thead><tbody>' +
          linked.slice(0,30).map(function(mission) {
            const crew=(mission.crewIds||[]).map(function(id) {
              const person=(data.employees||[]).find(function(item){return String(item.id)===String(id);});
              return person?person.fullName||person.personnelId:'';
            }).filter(Boolean).join('، ');
            return '<tr><td>' + esc(mission.title||'مأموریت بدون عنوان') + '</td><td>' + esc(mission.missionType||'—') + '</td><td>' +
              formatJalali(mission.startAt,true) + '</td><td>' + formatJalali(mission.endAt,true) + '</td><td>' +
              '<span class="module-tag">' + esc(mission.status||'—') + '</span></td><td>' + esc([crew,mission.crewText].filter(Boolean).join('؛ ')||'—') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="module-empty">برای این خودرو هنوز مأموریتی ثبت نشده است.</div>') +
        '</section>';
    }
    return '<section class="module-form-panel" style="width:100%;min-width:0"><div class="module-form-head"><div><h3>' +
      (existing ? 'ویرایش ' : 'ثبت ') + esc(specs[moduleKey].singular) + '</h3><p>پس از ذخیره، اطلاعات به فهرست، داشبورد و گزارش‌های مرتبط منتقل می‌شود.</p></div>' +
      '<button type="button" class="secondary-btn" data-module-action="cancel" data-view="' + esc(moduleKey) + '">بستن فرم</button></div>' +
      '<form class="module-form" data-module-form data-view="' + esc(moduleKey) + '" data-id="' + esc(existing ? existing.id : '') + '">' +
      '<div class="module-fields">' + fields.map(function (field) { return renderField(moduleKey, field, existing, data); }).join('') + '</div>' +
      fileNotice +
      '<div class="module-form-actions"><span class="module-required-help">موارد دارای * ضروری هستند.</span><div>' +
      '<button type="button" class="secondary-btn" data-module-action="cancel" data-view="' + esc(moduleKey) + '">انصراف</button> ' +
      '<button type="submit" class="primary-btn">' + (existing ? 'ذخیرهٔ تغییرات' : 'ثبت ' + esc(specs[moduleKey].singular)) + '</button></div></div></form>' +
      relatedVehicleHistory + '</section>';
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
        const label = field ? field.label : (key === 'relatedMissions' ? 'مأموریت‌های مرتبط' : key);
        return '<th>' + esc(label) + '</th>';
      }).join('') + '<th>عملیات</th></tr></thead><tbody>' +
      records.map(function (record) {
        return '<tr><td class="module-check-cell"><input type="checkbox" data-record-select value="' + esc(record.id) + '" aria-label="انتخاب ردیف"></td>' +
          columns.map(function (key) {
            if (moduleKey === 'vehicles' && key === 'relatedMissions') {
              const linkedCount = (data.missions || []).filter(function (mission) {
                return String(mission.vehicleId || '') === String(record.id);
              }).length;
              return '<td>' + faDigits(linkedCount) + ' مورد</td>';
            }
            const value = fieldsFor(moduleKey).find(function (field) { return field.key === key && field.custom; }) && record.customFields
              ? record.customFields[key] : record[key];
            if (moduleKey === 'employees' && key === 'status') return '<td>' + esc(effectiveEmployeeStatus(record)) + '</td>';
            if (moduleKey === 'notes' && key === 'status') {
              const overdue = record.dueDate && dueInDays(record.dueDate) < 0 && !['تکمیل‌شده','لغوشده'].includes(record.status);
              return '<td><span class="module-tag' + (overdue ? ' module-tag-danger' : '') + '">' + esc(overdue ? 'عقب‌افتاده' : (record.status || 'ثبت نشده')) + '</span></td>';
            }
            return '<td>' + displayValue(moduleKey, key, value, data) + '</td>';
          }).join('') +
          '<td class="module-row-actions">' + renderHistoryButton(moduleKey, record) +
          '<button type="button" class="secondary-btn" data-module-action="edit" data-view="' + esc(moduleKey) + '" data-id="' + esc(record.id) + '">ویرایش</button> ' +
          '<button type="button" class="module-delete-btn" data-module-action="delete" data-view="' + esc(moduleKey) + '" data-id="' + esc(record.id) + '">حذف</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function shiftLabel(record, data) {
    const employees = (record.employeeIds || []).map(function (id) {
      const person = (data.employees || []).find(function (item) { return String(item.id) === String(id); });
      return person ? (person.fullName || person.personnelId || 'کارمند') : '';
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
      return String(a.fullName || '').localeCompare(String(b.fullName || ''), 'fa');
    }).map(function (person) {
      return '<option value="' + esc(person.id) + '"' + (chosen.includes(String(person.id)) ? ' selected' : '') + '>' +
        esc((person.fullName || 'بدون نام') + (person.personnelId ? ' · ' + person.personnelId : '')) + '</option>';
    }).join('');
    const startValue = current.startAt ? jalaliInputValue(current.startAt, true) : jalaliInputValue('', true);
    const endValue = current.endAt ? jalaliInputValue(current.endAt, true) : '';
    return '<section class="module-form-panel" style="width:100%;min-width:0"><div class="module-form-head"><div><h3>' +
      (existing ? 'ویرایش برنامهٔ شیفت' : 'ثبت برنامهٔ شیفت') +
      '</h3><p>نوع روز/شب و زمان شروع و پایان را مشخص کن. برای شیفت شب، تاریخ پایان روز بعد را وارد کن.</p></div>' +
      '<button type="button" class="secondary-btn" data-shift-action="cancel">بستن فرم</button></div>' +
      '<form class="module-form" data-shift-form data-shift-id="' + esc(existing ? existing.id : '') + '"><div class="module-fields">' +
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
      '</div><div class="module-form-actions"><span class="module-required-help">برنامه‌های ثبت‌شده در تقویم روزانه و وضعیت کارکنان منعکس می‌شوند.</span><div>' +
      '<button type="button" class="secondary-btn" data-shift-action="cancel">انصراف</button> ' +
      '<button type="submit" class="primary-btn">' + (existing ? 'ذخیرهٔ تغییرات' : 'ثبت برنامهٔ شیفت') + '</button></div></div></form></section>';
  }

  function renderShiftSchedule(data) {
    const shifts = (data.shifts || []).slice().sort(function (a, b) {
      return String(b.startAt || '').localeCompare(String(a.startAt || ''));
    });
    const rows = shifts.length ? shifts.map(function (item) {
      return '<tr><td>' + formatJalali(item.startAt, true) + '</td><td>' + formatJalali(item.endAt, true) + '</td><td>' +
        esc(item.shiftType || '—') + '</td><td>' + esc(shiftLabel(item, data)) + '</td><td>' + esc(item.workplace || '—') +
        '</td><td><span class="module-tag">' + esc(item.status || '—') + '</span></td><td class="module-row-actions">' +
        '<button type="button" class="secondary-btn" data-shift-action="edit" data-id="' + esc(item.id) + '">ویرایش</button> ' +
        '<button type="button" class="module-delete-btn" data-shift-action="delete" data-id="' + esc(item.id) + '">حذف</button></td></tr>';
    }).join('') : '<tr><td colspan="7"><div class="module-empty">هنوز برنامهٔ شیفتی ثبت نشده است.</div></td></tr>';
    return '<section class="module-list-panel" id="shift-schedule" style="width:100%;min-width:0"><div class="module-list-head"><div><h3>برنامهٔ شیفت‌ها</h3>' +
      '<p>ثبت و پیگیری برنامهٔ ۱۲ ساعتهٔ روز/شب و جایگزینی روزکار، در کنار پروندهٔ کارکنان.</p></div><div class="module-page-actions">' +
      '<button type="button" class="secondary-btn" data-shift-action="export">خروجی CSV شیفت‌ها</button> ' +
      '<button type="button" class="primary-btn" data-shift-action="new">＋ ثبت شیفت</button></div></div>' +
      renderShiftForm(data) + '<div class="module-table-wrap" style="width:100%;max-width:100%;min-width:0"><table class="module-table"><thead><tr>' +
      '<th>شروع</th><th>پایان</th><th>نوع</th><th>کارکنان</th><th>محل خدمت</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>' +
      rows + '</tbody></table></div><div class="module-list-foot">تعداد برنامه‌ها: ' + faDigits(shifts.length) +
      ' · برای شیفت شب، تاریخ پایان را صریحاً در روز بعد ثبت کن.</div></section>';
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
      (moduleKey === 'employees' ? renderShiftSchedule(data) : '') +
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
      const today=todayIso();
      const selectedStart=dashboardRange.start||today;
      const selectedEnd=dashboardRange.end||today;
      const singleDay=selectedStart===selectedEnd;
      const items=[];
      const dayInRange=function(value){const day=String(value||'').slice(0,10);return !!day&&day>=selectedStart&&day<=selectedEnd;};
      missions.filter(function(m){return dayInRange(m.startAt)&&m.status!=='لغو‌شده';}).forEach(function(m){
        items.push({sortKey:String(m.startAt||''),date:String(m.startAt||'').slice(0,10),time:String(m.startAt||'').slice(11,16),type:'مأموریت',title:m.title||'مأموریت',detail:[m.city,m.destination].filter(Boolean).join(' · ')});
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
        items.push({sortKey:String(l.startDate||''),date:String(l.startDate||''),time:'',type:'مرخصی',title:person?person.fullName:(l.groupName||'مرخصی'),detail:l.leaveType||''});
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
      summary.textContent='مأموریت‌های ثبت‌شده در بازهٔ '+faDigits(dashboardMissions.length)+' مورد است.';
    }
    const foot=document.querySelector('.footnote');
    if(foot){const parts=foot.querySelectorAll('span');if(parts[1])parts[1].textContent='اطلاعات ثبت‌شده در همین دستگاه';if(parts[3])parts[3].textContent='ذخیره‌سازی محلی · بدون اتصال ابری';}
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
    const actions = '<select id="reportExportFormat" class="module-report-export" aria-label="قالب خروجی گزارش"><option value="csv">CSV</option><option value="xlsx">Excel (.xlsx)</option><option value="docx">Word (.docx)</option><option value="pptx">PowerPoint (.pptx)</option></select><button class="primary-btn" type="button" data-module-action="export-report">دریافت گزارش</button><button class="secondary-btn" type="button" data-module-action="print">چاپ / ذخیرهٔ PDF</button><button class="secondary-btn" type="button" data-module-action="export-all">CSV همهٔ اطلاعات</button>';
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
      rows.map(function(item){return '<tr><td>'+formatJalali(item.at,true)+'</td><td>'+esc(item.module==='shifts'?'برنامهٔ شیفت':(specs[item.module]?specs[item.module].title:item.module))+'</td><td>'+esc(item.recordLabel||'—')+'</td><td>'+esc(item.action)+'</td><td>'+esc((item.changes||[]).map(function(c){return c.field+': '+c.before+' ← '+c.after;}).join('؛ ')||'—')+'</td></tr>';}).join('')+'</tbody></table></div>';
  }

  function renderSettings(section) {
    section.innerHTML=rootWrap(
      pageHead('تنظیمات','مدیریت محلی اطلاعات، فیلدهای پرسنلی قابل تنظیم و نسخهٔ پشتیبان. تم فعلی تغییر داده نمی‌شود.','')+
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>پشتیبان‌گیری و بازیابی</h3><p>نسخهٔ پشتیبان تمام پرونده‌ها، تاریخچه، تنظیمات و پیوست‌های محلی را دربر می‌گیرد.</p></div></div>'+
      '<div class="module-backup-grid"><div class="module-backup-card"><strong>ساخت نسخهٔ پشتیبان</strong><p>یک فایل JSON از تمام داده‌های موجود در این دستگاه دریافت می‌کنی.</p><button type="button" class="primary-btn" data-module-action="backup">دریافت فایل پشتیبان</button></div>'+
      '<div class="module-backup-card"><strong>بازیابی نسخهٔ پشتیبان</strong><p>بازیابی، داده‌های فعلی را جایگزین اطلاعات درون فایل انتخاب‌شده می‌کند.</p><button type="button" class="secondary-btn" data-module-action="restore-select">انتخاب فایل پشتیبان</button><input type="file" id="atlasRestoreFile" accept=".json,application/json" hidden></div></div></section>'+
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>مدیریت منوها و فهرست‌ها</h3><p>تمام گزینه‌های کشویی قابل تنظیم در یک محل؛ افزودن فوری نیز از کنار فیلدهای مرتبط انجام می‌شود.</p></div></div><div class="module-list-tools"><select id="referenceListKey">'+Object.keys(appData.references).map(function(k){return '<option value="'+esc(k)+'">'+esc(referenceListTitle(k))+'</option>';}).join('')+'</select><input id="referenceListValue" type="text" placeholder="عنوان گزینه جدید"><button type="button" class="primary-btn" data-module-action="reference-add">＋ افزودن</button></div><div id="referenceListItems" class="module-local-note" style="margin-top:12px"></div></section>' +
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>فیلدهای سفارشی کارکنان</h3><p>هر خط یک عنوان فیلد است. حذف عنوان از این فهرست به معنی حذف مقدار قبلی از پرونده‌ها نیست.</p></div></div>'+
      '<form data-custom-fields-form class="module-form"><label class="module-field module-field-wide"><span>عنوان فیلدها، هر کدام در یک خط</span><textarea name="employeeCustomFields" rows="5" placeholder="مثلاً: گواهینامه تخصصی&#10;شماره بیمه">'+esc(appData.settings.employeeCustomFields||'')+'</textarea></label><div class="module-form-actions"><span class="module-required-help">حداکثر ۲۰ فیلد سفارشی.</span><button type="submit" class="primary-btn">ذخیرهٔ فیلدها</button></div></form></section>'+
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>وضعیت نگهداری داده</h3><p>داده‌ها در پایگاه محلی مرورگر ذخیره می‌شوند و برای استفادهٔ روزمره به اتصال اینترنت نیاز ندارند.</p></div></div><div class="module-local-note">اطلاعات هر مرورگر مستقل است. پاک‌کردن داده‌های مرورگر می‌تواند اطلاعات را حذف کند؛ فایل پشتیبان را در محل امن نگهداری کن. همگام‌سازی خودکار فعال نیست.</div><div class="module-settings-counts">'+MODULES.map(function(key){return '<span>'+esc(specs[key].title)+': <b>'+faDigits(appData[key].length)+'</b></span>';}).join('')+'<span>برنامهٔ شیفت: <b>'+faDigits((appData.shifts||[]).length)+'</b></span></div></section>'
    );
    renderReferenceList();  }

  function referenceListTitle(key){
    const titles={workplaces:'شهرها و محل‌ها',leaveTypes:'انواع مرخصی',missionTypes:'انواع مأموریت',pipelineSizes:'قطر خطوط',products:'نوع فرآورده',vehicleTypes:'انواع خودرو',vehicleStatuses:'وضعیت خودرو',gasStatuses:'وضعیت گازسنج',actionTypes:'انواع یادداشت و اقدام',programTypes:'انواع برنامه',workTypes:'نوع کار',employmentTypes:'نوع استخدام',shiftPatterns:'الگوی شیفت',employeeStatuses:'وضعیت کارکنان',missionStatuses:'وضعیت مأموریت',leaveStatuses:'وضعیت مرخصی',healthStatuses:'وضعیت سلامت',noteStatuses:'وضعیت یادداشت و پیگیری',reportStatuses:'وضعیت گزارش اولیه',programStatuses:'وضعیت پرونده',operationalPoints:'نقاط عملیاتی',gasSensorTypes:'نوع سنسور گازسنج',gasSensorLocations:'محل‌های استقرار',operationalRanges:'محدوده‌های عملیاتی',vehicleServiceTypes:'انواع سرویس خودرو'};
    return titles[key]||key;
  }

  function renderReferenceList(){
    const key=document.getElementById('referenceListKey'),host=document.getElementById('referenceListItems');
    if(!key||!host)return;
    host.innerHTML=(appData.references[key.value]||[]).map(function(value,i){return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0;padding:7px;border-bottom:1px solid rgba(140,210,255,.12)"><span>'+esc(value)+'</span><span style="display:flex;gap:5px;flex-wrap:wrap"><button type="button" class="secondary-btn" data-module-action="reference-up" data-index="'+i+'" aria-label="انتقال به بالا" '+(i===0?'disabled':'')+'>↑</button><button type="button" class="secondary-btn" data-module-action="reference-down" data-index="'+i+'" aria-label="انتقال به پایین" '+(i===(appData.references[key.value]||[]).length-1?'disabled':'')+'>↓</button><button type="button" class="secondary-btn" data-module-action="reference-edit" data-index="'+i+'">ویرایش</button><button type="button" class="secondary-btn" data-module-action="reference-delete" data-index="'+i+'">حذف</button></span></div>';}).join('')||'این فهرست هنوز گزینه‌ای ندارد.';
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

  function programOwnerName(record) {
    if (!record.responsibleId) return '';
    const person = (appData.employees || []).find(function (item) { return String(item.id) === String(record.responsibleId); });
    return person ? String(person.fullName || '') : '';
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
      '<div class="program-chips"><span class="program-chip">' + esc(programCategoryOf(record)) + '</span>' +
      (record.programType ? '<span class="program-chip">' + esc(record.programType) + '</span>' : '') + '</div></div>' +
      '<div class="program-score"><div class="program-pct">' + faDigits(pct) + '٪</div>' +
      '<div class="program-meta">' + (stages.length ? faDigits(doneStages) + ' از ' + faDigits(stages.length) + ' مرحله' : 'بدون مرحله') + '</div></div></div>' +
      '<div class="progress-track"><div class="progress-bar" style="width:' + pct + '%"></div></div>' +
      (meta.length ? '<div class="program-meta">' + esc(meta.join(' · ')) + '</div>' : '') +
      (record.status ? '<div class="program-meta">وضعیت: ' + esc(record.status) + '</div>' : '') +
      (stageRows ? '<div class="program-stages">' + stageRows + '</div>' : '') +
      '<div class="program-stage-add"><input type="text" data-program-stage-input="' + esc(record.id) + '" placeholder="نام مرحلهٔ جدید"><button class="secondary-btn" type="button" data-program-action="stage-add" data-program="' + esc(record.id) + '">افزودن مرحله</button></div>' +
      '<div class="program-chips"><button type="button" data-program-action="edit" data-program="' + esc(record.id) + '">ویرایش</button><button type="button" data-program-action="delete" data-program="' + esc(record.id) + '">حذف</button></div>' +
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
    const actions = '<button class="secondary-btn" type="button" data-module-action="export" data-view="programs">خروجی CSV</button>' +
      '<button class="primary-btn" type="button" data-module-action="new" data-view="programs">＋ برنامهٔ جدید</button>';
    const kpis = [['کل برنامه‌ها', faDigits(total)], ['در جریان', faDigits(running)], ['تکمیل‌شده', faDigits(complete)], ['میانگین پیشرفت', faDigits(average) + '٪']]
      .map(function (pair) { return '<div class="mini-stat"><div class="program-meta">' + pair[0] + '</div><strong class="program-pct">' + pair[1] + '</strong></div>'; })
      .join('');
    const chips = ['all'].concat(categories).map(function (category) {
      return '<button type="button" data-program-action="filter" data-category="' + esc(category) + '" class="' + (programFilter === category ? 'active' : '') + '">' + esc(category === 'all' ? 'همه' : category) + '</button>';
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

  function render(view, section) {
    if(!section)return;
    prepareSection(section);
    if(!ready){
      section.innerHTML=rootWrap('<div class="module-empty">در حال آماده‌سازی اطلاعات محلی…</div>');
      return;
    }
    if(view==='programs')renderPrograms(section);
    else if(specs[view])renderCrud(view,section);
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
    const rows=[['بخش','شناسه','عنوان یا نام','وضعیت','تاریخ','شرح']];
    MODULES.forEach(function(moduleKey){
      appData[moduleKey].filter(function(record){return isInRange(moduleKey,record,reportPeriod);}).forEach(function(record){
        const summary=record.notes||record.body||record.result||record.reason||record.destination||record.related||'';
        rows.push([specs[moduleKey].title,record.id,recordLabel(moduleKey,record),record.status||'',recordDateForCsv(moduleKey,record),summary]);
      });
    });
    (appData.shifts||[]).filter(function(record){return isInRange('shifts',record,reportPeriod);}).forEach(function(record){
      rows.push(['برنامهٔ شیفت',record.id,shiftLabel(record,appData),record.status||'',record.startAt||'',[record.workplace,record.notes].filter(Boolean).join(' · ')]);
    });
    return rows;
  }

  function currentReportTitle() {
    const labels={today:'امروز',yesterday:'دیروز',threeDays:'۳ روز اخیر',week:'هفتهٔ اخیر',tenDays:'۱۰ روز اخیر',month:'ماه جاری',threeMonths:'۳ ماه اخیر',sixMonths:'۶ ماه اخیر',year:'سال جاری',all:'همهٔ اطلاعات',custom:'بازهٔ دلخواه'};
    return 'گزارش عملیاتی ATLAS SHIFT · '+(labels[reportPeriod]||'بازهٔ انتخاب‌شده');
  }

  function exportReportCsv() {
    const rows=currentReportRows();
    downloadFile('ATLAS-SHIFT-report-'+todayIso()+'.csv','\uFEFF'+rows.map(function(row){return row.map(csvEscape).join(',');}).join('\r\n'),'text/csv;charset=utf-8;');
  }

  function wordParagraph(text, bold, center) {
    return '<w:p><w:pPr><w:bidi w:val="1"/>'+(center?'<w:jc w:val="center"/>':'<w:jc w:val="right"/>')+'</w:pPr><w:r><w:rPr>'+
      (bold?'<w:b/>':'')+'<w:rtl/><w:lang w:val="fa-IR"/></w:rPr><w:t xml:space="preserve">'+xmlEscape(text)+'</w:t></w:r></w:p>';
  }

  function wordTable(rows) {
    const borders='<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="A8BBD0"/><w:left w:val="single" w:sz="4" w:space="0" w:color="A8BBD0"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="A8BBD0"/><w:right w:val="single" w:sz="4" w:space="0" w:color="A8BBD0"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D7E1EA"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D7E1EA"/></w:tblBorders>';
    const body=rows.map(function(row,rowIndex){
      const header=rowIndex===0;
      return '<w:tr>'+row.map(function(cell){
        return '<w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:bidi w:val="1"/><w:jc w:val="right"/></w:pPr><w:r><w:rPr>'+
          (header?'<w:b/>':'')+'<w:rtl/><w:lang w:val="fa-IR"/></w:rPr><w:t xml:space="preserve">'+xmlEscape(cell)+'</w:t></w:r></w:p></w:tc>';
      }).join('')+'</w:tr>';
    }).join('');
    return '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>'+borders+'<w:tblLayout w:type="autofit"/></w:tblPr>'+body+'</w:tbl>';
  }

  function exportReportDocx() {
    const rows=currentReportRows();
    const paragraphs=wordParagraph(currentReportTitle(),true,false)+
      wordParagraph('تاریخ تهیه: '+formatJalali(new Date().toISOString(),true),false,false)+
      wordParagraph('تعداد ردیف‌های گزارش: '+faDigits(Math.max(0,rows.length-1)),false,false);
    const documentXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+paragraphs+wordTable(rows)+
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>';
    const files=[
      {name:'[Content_Types].xml',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'},
      {name:'_rels/.rels',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'},
      {name:'word/document.xml',content:documentXml}
    ];
    downloadBlob('ATLAS-SHIFT-report-'+todayIso()+'.docx',zipStored(files));
  }

  function excelColumn(index) {
    let n=index+1,letters='';
    while(n>0){const remainder=(n-1)%26;letters=String.fromCharCode(65+remainder)+letters;n=Math.floor((n-1)/26);}
    return letters;
  }

  function exportReportXlsx() {
    const rows=currentReportRows();
    const sheetRows=rows.map(function(row,rowIndex){
      const cells=row.map(function(value,columnIndex){
        const reference=excelColumn(columnIndex)+(rowIndex+1);
        return '<c r="'+reference+'" t="inlineStr"><is><t xml:space="preserve">'+xmlEscape(value)+'</t></is></c>';
      }).join('');
      return '<row r="'+(rowIndex+1)+'">'+cells+'</row>';
    }).join('');
    const workbook='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="گزارش ATLAS SHIFT" sheetId="1" r:id="rId1"/></sheets></workbook>';
    const files=[
      {name:'[Content_Types].xml',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'},
      {name:'_rels/.rels',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
      {name:'xl/workbook.xml',content:workbook},
      {name:'xl/_rels/workbook.xml.rels',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'},
      {name:'xl/worksheets/sheet1.xml',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:'+excelColumn(rows[0].length-1)+Math.max(1,rows.length)+'"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><sheetData>'+sheetRows+'</sheetData></worksheet>'}
    ];
    downloadBlob('ATLAS-SHIFT-report-'+todayIso()+'.xlsx',zipStored(files));
  }

  function pptTextShape(id,name,x,y,cx,cy,lines,size,bold) {
    return '<p:sp><p:nvSpPr><p:cNvPr id="'+id+'" name="'+xmlEscape(name)+'"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>'+
      '<p:spPr><a:xfrm><a:off x="'+x+'" y="'+y+'"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>'+
      '<p:txBody><a:bodyPr wrap="square" rtlCol="1" anchor="t"/><a:lstStyle/>'+
      lines.map(function(line){return '<a:p><a:pPr algn="r" rtl="1"/><a:r><a:rPr lang="fa-IR" sz="'+size+'"'+(bold?' b="1"':'')+'/><a:t xml:space="preserve">'+xmlEscape(line)+'</a:t></a:r><a:endParaRPr lang="fa-IR"/></a:p>';}).join('')+
      '</p:txBody></p:sp>';
  }

  function exportReportPptx() {
    const rows=currentReportRows();
    const summary=MODULES.map(function(key){
      const count=appData[key].filter(function(record){return isInRange(key,record,reportPeriod);}).length;
      return specs[key].title+': '+faDigits(count);
    });
    summary.push('برنامهٔ شیفت‌ها: '+faDigits((appData.shifts||[]).filter(function(record){return isInRange('shifts',record,reportPeriod);}).length));
    summary.push('کل ردیف‌های گزارش: '+faDigits(Math.max(0,rows.length-1)));
    summary.push('تهیه‌شده در '+formatJalali(new Date().toISOString(),true));
    const groupTree='<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
    const slide='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="ATLAS SHIFT"><p:spTree>'+groupTree+
      pptTextShape(2,'عنوان گزارش',500000,350000,11100000,900000,[currentReportTitle()],2800,true)+
      pptTextShape(3,'خلاصه گزارش',500000,1500000,11100000,5200000,summary.slice(0,18),1800,false)+
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
    const master='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="ATLAS SHIFT"><p:spTree>'+groupTree+'</p:spTree></p:cSld>'+
      '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'+
      '<p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1600"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>';
    const layout='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>'+groupTree+'</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
    const theme='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="ATLAS SHIFT"><a:themeElements>'+
      '<a:clrScheme name="ATLAS SHIFT"><a:dk1><a:srgbClr val="183E69"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="243447"/></a:dk2><a:lt2><a:srgbClr val="EAF5FF"/></a:lt2>'+
      '<a:accent1><a:srgbClr val="25BCE8"/></a:accent1><a:accent2><a:srgbClr val="7B82FF"/></a:accent2><a:accent3><a:srgbClr val="39C6A5"/></a:accent3><a:accent4><a:srgbClr val="FFB8DF"/></a:accent4><a:accent5><a:srgbClr val="F3C66B"/></a:accent5><a:accent6><a:srgbClr val="A7B5C6"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>'+
      '<a:fontScheme name="ATLAS SHIFT"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface="Tahoma"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface="Tahoma"/></a:minorFont></a:fontScheme>'+
      '<a:fmtScheme name="ATLAS SHIFT"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:lumMod val="95000"/><a:lumOff val="5000"/></a:schemeClr></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:lumMod val="90000"/><a:lumOff val="10000"/></a:schemeClr></a:solidFill></a:fillStyleLst>'+
      '<a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:round/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:round/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:round/></a:ln></a:lnStyleLst>'+
      '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'+
      '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:lumMod val="95000"/><a:lumOff val="5000"/></a:schemeClr></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:lumMod val="90000"/><a:lumOff val="10000"/></a:schemeClr></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';
    const files=[
      {name:'[Content_Types].xml',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>'},
      {name:'_rels/.rels',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>'},
      {name:'ppt/presentation.xml',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="fa-IR"/></a:defPPr></p:defaultTextStyle></p:presentation>'},
      {name:'ppt/_rels/presentation.xml.rels',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>'},
      {name:'ppt/slides/slide1.xml',content:slide},
      {name:'ppt/slides/_rels/slide1.xml.rels',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>'},
      {name:'ppt/slideLayouts/slideLayout1.xml',content:layout},
      {name:'ppt/slideLayouts/_rels/slideLayout1.xml.rels',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>'},
      {name:'ppt/slideMasters/slideMaster1.xml',content:master},
      {name:'ppt/slideMasters/_rels/slideMaster1.xml.rels',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>'},
      {name:'ppt/theme/theme1.xml',content:theme}
    ];
    downloadBlob('ATLAS-SHIFT-report-'+todayIso()+'.pptx',zipStored(files));
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

  function exportShiftsCsv() {
    const rows=[['شناسه','شروع','پایان','نوع شیفت','کارکنان','محل خدمت','وضعیت','توضیحات']];
    (appData.shifts||[]).forEach(function(record){
      rows.push([record.id,record.startAt||'',record.endAt||'',record.shiftType||'',shiftLabel(record,appData),record.workplace||'',record.status||'',record.notes||'']);
    });
    downloadFile('ATLAS-SHIFT-shifts-'+todayIso()+'.csv','\uFEFF'+rows.map(function(row){return row.map(csvEscape).join(',');}).join('\r\n'),'text/csv;charset=utf-8;');
  }

  function exportAllCsv() {
    const rows=[['بخش','شناسه','عنوان','وضعیت','تاریخ','شرح']];
    MODULES.forEach(function(key){
      appData[key].forEach(function(record){
        rows.push([specs[key].title,record.id,recordLabel(key,record),record.status||'',recordDateForCsv(key,record),record.notes||record.body||record.result||record.reason||'']);
      });
    });
    (appData.shifts||[]).forEach(function(record){rows.push(['برنامهٔ شیفت',record.id,shiftLabel(record,appData),record.status||'',record.startAt||'',record.workplace||record.notes||'']);});
    downloadFile('ATLAS-SHIFT-report-'+todayIso()+'.csv','\uFEFF'+rows.map(function(row){return row.map(csvEscape).join(',');}).join('\r\n'),'text/csv;charset=utf-8;');
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

  async function restoreBackup(file) {
    if(!file)return;
    try {
      const raw=await file.text();
      const parsed=JSON.parse(raw);
      const candidate=parsed&&parsed.data?parsed.data:parsed;
      if(!candidate||!MODULES.every(function(key){return Array.isArray(candidate[key]);}))throw new Error('فایل پشتیبان معتبر نیست.');
      if(!window.confirm('با بازیابی، اطلاعات فعلی و تنظیمات ذخیره‌شدهٔ این دستگاه با اطلاعات فایل جایگزین می‌شود. ادامه می‌دهی؟'))return;
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
      if(!record||!window.confirm('برنامهٔ شیفت این مورد حذف شود؟'))return;
      appData.shifts=appData.shifts.filter(function(item){return String(item.id)!==String(record.id);});
      addShiftHistory(record,'حذف',[]);
      if(await saveState()){render('employees',section);refreshDashboard();toast('برنامهٔ شیفت حذف شد.');}
    }else if(action==='export'){
      exportShiftsCsv();
    }
  });

  document.addEventListener('click', async function(event) {
    const inline=event.target.closest('[data-add-list-option]');if(inline){const key=inline.dataset.addListOption,value=window.prompt('گزینهٔ جدید را وارد کن:');if(value!==null&&value.trim()){const clean=value.trim();if(!Array.isArray(appData.references[key]))appData.references[key]=[];if(appData.references[key].includes(clean)){toast('این گزینه از قبل وجود دارد.');return;}appData.references[key].push(clean);if(await saveState()){const field=inline.closest('.module-field');const select=field&&field.querySelector('select');if(select){const option=document.createElement('option');option.value=clean;option.textContent=clean;option.selected=true;select.appendChild(option);}toast('گزینه افزوده و ذخیره شد.');}}return;}
    const button=event.target.closest('[data-module-action]');
    if(!button)return;
    const action=button.dataset.moduleAction;
    const moduleKey=button.dataset.view||new URLSearchParams(window.location.search).get('view')||'dashboard';
    if(action==='reference-add'||action==='reference-edit'||action==='reference-delete'||action==='reference-up'||action==='reference-down'){
      const key=document.getElementById('referenceListKey'),input=document.getElementById('referenceListValue'),listKey=key&&key.value;
      if(!listKey||!Array.isArray(appData.references[listKey]))return;
      const list=appData.references[listKey];
      if(action==='reference-add'){const value=String(input&&input.value||'').trim();if(!value){toast('عنوان گزینه را وارد کن.');return;}if(list.includes(value)){toast('این گزینه از قبل وجود دارد.');return;}list.push(value);if(input)input.value='';}
      else{const i=Number(button.dataset.index);if(i<0||i>=list.length)return;if(action==='reference-edit'){const value=window.prompt('عنوان جدید گزینه:',list[i]);if(value===null||!value.trim())return;const next=value.trim();if(list.includes(next)&&next!==list[i]){toast('این گزینه از قبل وجود دارد.');return;}const previous=list[i];list[i]=next;MODULES.forEach(function(m){(specs[m].fields||[]).forEach(function(field){if(field.listKey!==listKey)return;(appData[m]||[]).forEach(function(record){if(record[field.key]===previous)record[field.key]=next;else if(Array.isArray(record[field.key]))record[field.key]=record[field.key].map(function(v){return v===previous?next:v;});});});});}else if(action==='reference-delete'){if(!window.confirm('گزینه از فهرست حذف شود؟ سوابق قبلی حفظ می‌شوند و مقدارهای ثبت‌شده پاک نخواهند شد.'))return;list.splice(i,1);}else{const nextIndex=action==='reference-up'?i-1:i+1;if(nextIndex<0||nextIndex>=list.length)return;const swap=list[nextIndex];list[nextIndex]=list[i];list[i]=swap;}}
      if(await saveState()){renderReferenceList();if(action==='reference-edit'){const current=document.getElementById('sectionView');const view=new URLSearchParams(window.location.search).get('view')||'dashboard';if(specs[view])render(view,current);}toast('فهرست ذخیره شد.');}return;
    }
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
    }else if(action==='export-report'){
      const selector=document.getElementById('reportExportFormat');
      const format=selector?selector.value:'csv';
      if(format==='xlsx')exportReportXlsx();
      else if(format==='docx')exportReportDocx();
      else if(format==='pptx')exportReportPptx();
      else exportReportCsv();
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
        const values=await formValues(form,moduleKey,old);
        if(moduleKey==='leaves'&&values.startDate&&values.endDate&&values.endDate<values.startDate)throw new Error('تاریخ پایان مرخصی نباید قبل از تاریخ شروع باشد.');
        if(moduleKey==='missions'&&values.startAt&&values.endAt&&values.endAt<values.startAt)throw new Error('زمان پایان مأموریت نباید قبل از زمان شروع باشد.');
        if(moduleKey==='programs'&&values.finalReportSent&&values.finalReportDue&&values.finalReportSent<values.finalReportDue&&values.status!=='تکمیل‌شده')throw new Error('تاریخ ارسال گزارش نهایی قبل از مهلت ثبت شده؛ وضعیت پرونده را بررسی کن.');
        if(moduleKey==='gasmeters'&&values.calibrationStart&&values.calibrationEnd&&values.calibrationEnd<values.calibrationStart)throw new Error('پایان اعتبار کالیبراسیون نباید قبل از شروع باشد.');
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
    if(target.id==='referenceListKey'){renderReferenceList();return;}
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

  document.addEventListener('click', function (event) {
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
      if (!window.confirm('«' + (record.title || 'برنامه') + '» حذف شود؟')) return;
      appData.programs = appData.programs.filter(function (item) { return String(item.id) !== String(record.id); });
      addHistory('programs', record, 'حذف', []);
      saveState();
      render('programs', section);
      refreshDashboard();
      toast('برنامه حذف شد.');
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
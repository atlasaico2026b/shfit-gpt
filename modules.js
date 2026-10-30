(function () {
  'use strict';

  const DB_NAME = 'ATLAS_SHIFT_LOCAL';
  const DB_VERSION = 1;
  const STORE_NAME = 'records';
  const STORE_KEY = 'main';
  const LEGACY_KEY = 'atlasShiftOperationalDataV1';
  const MODULES = ['employees', 'missions', 'leaves', 'vehicles', 'gasmeters', 'notes', 'programs', 'faults', 'maintenance', 'gaslogs'];
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
        {key:'firstName',label:'نام',required:true},
        {key:'lastName',label:'نام خانوادگی',required:true},
        {key:'mobile',label:'شمارهٔ همراه',type:'tel'},
        {key:'jobTitle',label:'عنوان شغلی',type:'select',required:true,listKey:'jobTitles',options:['اپراتور','تکنسین','سرپرست شیفت','کارشناس ایمنی','کارشناس HSE','راننده','نگهبان','انباردار','سایر']},
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
      columns: ['personnelId','firstName','lastName','jobTitle','workType','employmentType','workplace','assignedWorkplace','status']
    },
    missions: {
      title: 'مأموریت‌ها', singular: 'مأموریت',
      subtitle: 'ثبت مسیر، افراد اعزامی، خودرو، زمان‌بندی و نتیجهٔ مأموریت',
      fields: [
        {key:'title',label:'عنوان مأموریت',type:'select',required:true,listKey:'missionTitles',options:['بازدید دورهای خط','رفع نشتی','نظارت بر جوشکاری','بررسی انشعاب','پایش ایمنی','سرویس تجهیزات','مأموریت اضطراری','سایر']},
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
        {key:'status',label:'وضعیت دستگاه',type:'select',required:true,listKey:'gasStatuses',options:['آماده استفاده','در کالیبراسیون','خارج از سرویس','در تعمیر']},
        {key:'healthStatus',label:'وضعیت سلامت',type:'select',listKey:'healthStatuses',options:['سالم','نیازمند بررسی','دارای نقص','در حال تعمیر']},
        {key:'location',label:'محل استقرار',type:'select',listKey:'deploymentLocations',options:['پارکینگ مرکزی','تعمیرگاه مرکزی','انبار مرکزی','محور جاده','دفتر مرکزی','سایر']},
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
      subtitle: 'ثبت اشکال خودرو، گازسنج و تجهیزات با روند رفع، مسئول و تاریخ رفع',
      fields: [
        {key:'title',label:'عنوان اشکال',required:true,placeholder:'مثلاً نشتی روغن گیربکس'},
        {key:'assetType',label:'نوع دارایی',type:'select',required:true,listKey:'faultAssetTypes',options:['خودرو','گازسنج','تجهیزات ایمنی','تأسیسات','سایر']},
        {key:'vehicleId',label:'خودرو',type:'select',source:'vehicles'},
        {key:'gasmeterId',label:'گازسنج',type:'select',source:'gasmeters'},
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
      columns: ['title','assetType','vehicleId','gasmeterId','priority','reportedAt','status','progress']
    },
    maintenance: {
      title: 'سوابق سرویس و تعمیر', singular: 'سابقهٔ سرویس',
      subtitle: 'دفتر سرویس هر خودرو: تاریخ، کیلومتر، نوع اقدام، هزینه و سرویس بعدی',
      fields: [
        {key:'vehicleId',label:'خودرو',type:'select',source:'vehicles',required:true},
        {key:'date',label:'تاریخ سرویس شمسی',type:'jalali',required:true},
        {key:'km',label:'کیلومتر در زمان سرویس',type:'number',min:0},
        {key:'type',label:'نوع اقدام',type:'select',required:true,listKey:'maintenanceTypes',options:['سرویس دوره‌ای','تعویض روغن','تعویض فیلتر','تعمیر مکانیکی','تعمیر برقی','معاینه فنی','تعویض لاستیک','سایر']},
        {key:'description',label:'شرح اقدام و قطعات',type:'textarea',wide:true,required:true},
        {key:'cost',label:'هزینه (ریال)',type:'number',min:0},
        {key:'workshop',label:'تعمیرگاه یا پیمانکار'},
        {key:'technicianId',label:'مجری / تکنسین',type:'select',source:'employees'},
        {key:'nextServiceKm',label:'کیلومتر سرویس بعدی',type:'number',min:0},
        {key:'nextServiceDate',label:'تاریخ سرویس بعدی شمسی',type:'jalali'},
        {key:'status',label:'وضعیت',type:'select',required:true,listKey:'maintenanceStatuses',options:['انجام‌شده','در انتظار قطعه','در حال انجام','لغوشده']},
        {key:'attachments',label:'پیوست‌ها (فاکتور، رسید)',type:'file-multiple',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx'}
      ],
      columns: ['vehicleId','date','type','km','cost','workshop','nextServiceDate','status']
    },
    gaslogs: {
      title: 'سوابق گازسنج', singular: 'سابقهٔ گازسنج',
      subtitle: 'قرائت، کالیبراسیون، تعمیر و جابه‌جایی هر گازسنج با تاریخ و مسئول',
      fields: [
        {key:'gasmeterId',label:'گازسنج',type:'select',source:'gasmeters',required:true},
        {key:'date',label:'تاریخ شمسی',type:'jalali',required:true},
        {key:'logType',label:'نوع سابقه',type:'select',required:true,listKey:'gasLogTypes',options:['ثبت قرائت','کالیبراسیون','تعمیر','جابه‌جایی','تست عملکرد','سایر']},
        {key:'value',label:'مقدار قرائت یا نتیجه'},
        {key:'location',label:'محل استقرار در این تاریخ',type:'select',listKey:'deploymentLocations',options:['پارکینگ مرکزی','تعمیرگاه مرکزی','انبار مرکزی','محور جاده','دفتر مرکزی','سایر']},
        {key:'locationSince',label:'تاریخ استقرار',type:'jalali'},
        {key:'healthStatus',label:'وضعیت سلامت در این تاریخ',type:'select',listKey:'healthStatuses',options:['سالم','نیازمند بررسی','دارای نقص','در حال تعمیر']},
        {key:'calibrationStart',label:'شروع کالیبراسیون',type:'jalali'},
        {key:'calibrationEnd',label:'پایان کالیبراسیون',type:'jalali'},
        {key:'description',label:'شرح و توضیحات',type:'textarea',wide:true},
        {key:'operatorId',label:'ثبت‌کننده',type:'select',source:'employees'},
        {key:'attachments',label:'پیوست‌ها',type:'file-multiple',accept:'.pdf,.jpg,.jpeg,.png,.doc,.docx'}
      ],
      columns: ['gasmeterId','date','logType','value','location','operatorId']
    }
  };

  function createEmptyState() {
    const state = {
      schemaVersion: 2,
      settings: { employeeCustomFields: '' },
      references: {"workplaces":["اهواز","آبادان","اندیمشک","ماهشهر","بندر امام","آغاجاری","سایر"],"leaveTypes":["استحقاقی","استعلاجی","بدون حقوق","ساعتی","سایر"],"missionTypes":["نظارت بر جوشکاری","بررسی انشعاب یا نشتی","بررسی آلودگی خاک یا آب","بازدید ایستگاه","سرویس تجهیزات","بازدید ایمنی","سایر"],"pipelineSizes":["۴","۶","۸","۱۰","۱۲","۱۴","۱۶","۲۰","۲۴","۳۰","۳۶"],"products":["نفت خام","نفت گاز","بنزین","نفت سفید","گاز مایع","آب آلوده","سایر"],"vehicleTypes":["خودروی آتش‌نشانی","خودروی پشتیبانی","وانت","سواری","مینی‌بوس","سایر"],"vehicleStatuses":["آماده","در سرویس","خارج از سرویس","در تعمیر"],"gasStatuses":["آماده استفاده","در کالیبراسیون","خارج از سرویس","در تعمیر"],"actionTypes":["نامه اداری","درخواست خرید","استعلام","برآورد هزینه","برآورد قیمت","برنامه‌ریزی مانور","تعمیر خودرو","ارسال کالیبراسیون","پاسخ نامه","پیگیری قطعه","ارسال تجهیزات","بازدید","بازرسی","ممیزی","اقدام اصلاحی","یادداشت عمومی","سایر"],"programCategories":["هدف","برنامه فعالیت","مانور","روتین","دوره آموزشی","سایر"],"programTypes":["مانور","تعمیر تجهیز","تعمیر خودرو","کالیبراسیون","بازرسی","اقدام اصلاحی","درخواست خرید","پروژه عملیاتی","سایر"],"workTypes":["شیفتی","روزکار"],"jobTitles":["اپراتور","تکنسین","سرپرست شیفت","کارشناس ایمنی","کارشناس HSE","راننده","نگهبان","انباردار","سایر"],"employmentTypes":["رسمی","پیمانی","قراردادی","شرکتی","سایر"],"shiftPatterns":["۱۲ ساعته روز/شب","۲۴/۴۸","ثابت روزکار","سایر"],"employeeStatuses":["آماده‌کار","در حال کار","شیفت","مأموریت","مرخصی","استراحت","اضافه‌کار","غیرفعال"],"missionStatuses":["برنامه‌ریزی‌شده","در جریان","انجام‌شده","لغو‌شده"],"leaveStatuses":["در انتظار بررسی","تأییدشده","ردشده","استفاده‌شده"],"healthStatuses":["سالم","نیازمند بررسی","دارای نقص","در حال تعمیر"],"noteStatuses":["شروع‌نشده","در حال انجام","در انتظار پاسخ","ارجاع‌شده","تکمیل‌شده","لغوشده","عقب‌افتاده"],"reportStatuses":["تهیه نشده","در حال تهیه","ارسال شده","نیازمند اصلاح"],"programStatuses":["برنامه‌ریزی‌شده","در حال اقدام","در انتظار پاسخ","متوقف","تکمیل‌شده","لغوشده"],"operationalPoints":["پارکینگ مرکزی","تعمیرگاه مرکزی","انبار مرکزی","محور جاده"],"gasSensorTypes":["گازسنج چهارکاره","گازسنج تک‌کاره","آشکارساز H₂S","آشکارساز LEL","آشکارساز O₂","سایر"],"gasSensorLocations":["پارکینگ مرکزی","تعمیرگاه مرکزی","انبار مرکزی","محور جاده","دفتر مرکزی","سایر"],"operationalRanges":["روستای سویسه","روستای الهایی","کیلومتر ۹۶ تا ۱۰۲","کیلومتر ۱۲۰ تا ۱۳۵","محور اهواز – آبادان"],"vehicleServiceTypes":["تعویض روغن","سرویس دوره‌ای","سوخت‌گیری","تعویض فیلتر","معاینه فنی","تعمیر اضطراری"],"missionTitles":["بازدید دوره‌ای خط","رفع نشتی","نظارت بر جوشکاری","بررسی انشعاب","پایش ایمنی","سرویس تجهیزات","مأموریت اضطراری","سایر"],"vehicleNames":["خودروی آتش‌نشانی ۱","خودروی پشتیبانی ۱","وانت عملیاتی ۱","سواری اداری ۱","مینی‌بوس ایاب و ذهاب"],"gasModels":["MX4","MX6","Tetra","Altair 4X","Altair 5X","Ventis Pro","GasAlert MicroClip","سایر"],"deploymentLocations":["پارکینگ مرکزی","تعمیرگاه مرکزی","انبار مرکزی","محور جاده","دفتر مرکزی","سایر"],"maneuverLocations":["پارکینگ مرکزی","تعمیرگاه مرکزی","انبار مرکزی","دفتر مرکزی","ایستگاه شماره ۱","محور جاده","سایر"],"faultAssetTypes":["خودرو","گازسنج","تجهیزات ایمنی","تأسیسات","سایر"],"faultCategories":["مکانیکی","برقی","الکترونیکی","سنسور","بدنه","نرم‌افزاری","سایر"],"faultPriorities":["کم","متوسط","زیاد","بحرانی"],"faultStatuses":["ثبت‌شده","در حال بررسی","در حال تعمیر","رفع شد","بسته‌شده"],"maintenanceTypes":["سرویس دوره‌ای","تعویض روغن","تعویض فیلتر","تعمیر مکانیکی","تعمیر برقی","معاینه فنی","تعویض لاستیک","سایر"],"gasLogTypes":["ثبت قرائت","کالیبراسیون","تعمیر","جابه‌جایی","تست عملکرد","سایر"],"maintenanceStatuses":["انجام‌شده","در انتظار قطعه","در حال انجام","لغوشده"]},
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
    if (field.source === 'gasmeters') {
      return (data.gasmeters || []).slice().sort(function (a, b) {
        return String(a.code || '').localeCompare(String(b.code || ''), 'fa');
      }).map(function (item) {
        return {value:item.id,label:(item.code || 'گازسنج') + (item.serial ? ' · ' + item.serial : '')};
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
      const chosenList = Array.isArray(value) ? value.map(String) : String(value || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      if (field.multiple && field.source === 'employees') {
        control = '<div class="module-check-options module-check-people">' + options.map(function (option) {
          return '<label><input type="checkbox" name="' + esc(field.key) + '" value="' + esc(option.value) + '"' + (chosenList.includes(String(option.value)) ? ' checked' : '') + '><span>' + esc(option.label) + '</span></label>';
        }).join('') + '</div><small class="module-field-hint">هر نفر را با تیک انتخاب کن؛ نیازی به کلید کمکی نیست.</small>';
      } else {
        if (!field.multiple && value != null && value !== '' && !options.some(function (option) { return String(option.value) === String(value); })) {
          options.unshift({value:String(value),label:String(value)});
        }
        control = '<select id="' + esc(id) + '" name="' + esc(field.key) + '"' + (field.multiple ? ' multiple size="4"' : '') + required + '>' +
          (field.multiple ? '' : '<option value="">انتخاب کنید</option>') +
          options.map(function (option) {
            const selected = field.multiple ? chosenList.includes(String(option.value)) : String(value) === String(option.value);
            return '<option value="' + esc(option.value) + '"' + (selected ? ' selected' : '') + '>' + esc(option.label) + '</option>';
          }).join('') + '</select>' +
          (field.listKey && !field.multiple ? '<button type="button" class="module-select-add" data-add-list-option="' + esc(field.listKey) + '" data-view="' + esc(moduleKey) + '" aria-label="افزودن گزینه به ' + esc(field.label) + '" title="افزودن گزینه جدید">+</button>' : '') +
          (field.multiple ? '<small class="module-field-hint">برای انتخاب چند مورد، کلید Ctrl را نگه‌دار.</small>' : '');
      }
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
    const draft = existing || (state.preset || null);
    const fields = fieldsFor(moduleKey);
    const fileNotice = '<p class="module-field-hint">فایل پیوست همراه همین پرونده نگه‌داری می‌شود؛ اندازهٔ هر فایل بهتر است کمتر از ۱۰ مگابایت باشد.</p>';
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
              return person?employeeName(person)||person.personnelId:'';
            }).filter(Boolean).join('، ');
            return '<tr><td>' + esc(mission.title||'مأموریت بدون عنوان') + '</td><td>' + esc(mission.missionType||'—') + '</td><td>' +
              formatJalali(mission.startAt,true) + '</td><td>' + formatJalali(mission.endAt,true) + '</td><td>' +
              '<span class="module-tag">' + esc(mission.status||'—') + '</span></td><td>' + esc([crew,mission.crewText].filter(Boolean).join('؛ ')||'—') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="module-empty">برای این خودرو هنوز مأموریتی ثبت نشده است.</div>') +
        '</section>';
    }
    return '<div class="atlas-modal-backdrop" data-modal-backdrop data-view="' + esc(moduleKey) + '">' +
      '<div class="atlas-modal" role="dialog" aria-modal="true" aria-labelledby="atlasModalTitle">' +
      '<div class="atlas-modal-head"><div><h3 id="atlasModalTitle">' +
      (existing ? 'ویرایش ' : 'ثبت ') + esc(specs[moduleKey].singular) + '</h3><p>پس از ذخیره، اطلاعات به فهرست، داشبورد و گزارش‌های مرتبط منتقل می‌شود.</p></div>' +
      '<button type="button" class="atlas-modal-close" data-module-action="cancel" data-view="' + esc(moduleKey) + '" aria-label="بستن پنجره">×</button></div>' +
      '<div class="atlas-modal-body"><form class="module-form" data-module-form data-view="' + esc(moduleKey) + '" data-id="' + esc(existing ? existing.id : '') + '">' +
      '<div class="module-fields">' + fields.map(function (field) { return renderField(moduleKey, field, draft, data); }).join('') + '</div>' +
      fileNotice +
      '<div class="module-form-actions"><span class="module-required-help">موارد دارای * ضروری هستند.</span><div>' +
      '<button type="button" class="secondary-btn" data-module-action="cancel" data-view="' + esc(moduleKey) + '">انصراف</button> ' +
      '<button type="submit" class="primary-btn">' + (existing ? 'ذخیرهٔ تغییرات' : 'ثبت ' + esc(specs[moduleKey].singular)) + '</button></div></div></form>' +
      relatedVehicleHistory + '</div></div></div>';
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
      const item = data.vehicles.find(function (vehicle) { return String(vehicle.id) === String(value); });
      return esc(item ? (item.name || 'خودرو') + (item.companyPlate ? ' · ' + item.companyPlate : '') : value);
    }
    if (field && field.source === 'gasmeters') {
      const item = (data.gasmeters || []).find(function (meter) { return String(meter.id) === String(value); });
      return esc(item ? (item.code || 'گازسنج') + (item.serial ? ' · ' + item.serial : '') : value);
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
    const related = (data.employees || []).filter(function (item) { return String(record.crewIds || '').includes(String(item.id)); }).map(function (item) { return employeeName(item); }).join(' ');
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
    const columns = specs[moduleKey].columns.concat(moduleKey === 'employees'
      ? customFieldDefs().map(function (def, index) { return 'customField' + (index + 1); })
      : []);
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
          '<td class="module-row-actions">' + (moduleKey === 'employees' ? renderContactActions(record) : '') + renderHistoryButton(moduleKey, record) +
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
      '<div class="atlas-modal" role="dialog" aria-modal="true" aria-labelledby="atlasShiftModalTitle"><div class="atlas-modal-head"><div><h3 id="atlasShiftModalTitle">' +
      (existing ? 'ویرایش برنامهٔ شیفت' : 'ثبت برنامهٔ شیفت') +
      '</h3><p>نوع روز/شب و زمان شروع و پایان را مشخص کن. برای شیفت شب، تاریخ پایان روز بعد را وارد کن.</p></div>' +
      '<button type="button" class="atlas-modal-close" data-shift-action="cancel" aria-label="بستن پنجره">×</button></div>' +
      '<div class="atlas-modal-body"><form class="module-form" data-shift-form data-shift-id="' + esc(existing ? existing.id : '') + '"><div class="module-fields">' +
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
      '<button type="submit" class="primary-btn">' + (existing ? 'ذخیرهٔ تغییرات' : 'ثبت برنامهٔ شیفت') + '</button></div></div></form></div></div></div>';
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
      '<button type="button" class="secondary-btn" data-shift-action="print">چاپ شیفت‌ها</button> ' +
      '<button type="button" class="secondary-btn" data-shift-action="export">خروجی CSV شیفت‌ها</button> ' +
      '<button type="button" class="primary-btn" data-shift-action="new">+ ثبت شیفت</button></div></div>' +
      renderShiftForm(data) + '<div class="module-table-wrap" style="width:100%;max-width:100%;min-width:0"><table class="module-table"><thead><tr>' +
      '<th>شروع</th><th>پایان</th><th>نوع</th><th>کارکنان</th><th>محل خدمت</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>' +
      rows + '</tbody></table></div><div class="module-list-foot">تعداد برنامه‌ها: ' + faDigits(shifts.length) +
      ' · برای شیفت شب، تاریخ پایان را صریحاً در روز بعد ثبت کن.</div></section>';
  }

  function renderCrud(moduleKey, section) {
    const data = appData;
    const records = data[moduleKey] || [];
    const existing = records.length;
    const actions = exportMenu(moduleKey) +
      '<button class="primary-btn" type="button" data-module-action="new" data-view="' + esc(moduleKey) + '">+ ثبت مورد جدید</button>';
    section.innerHTML = rootWrap(
      pageHead(specs[moduleKey].title, specs[moduleKey].subtitle, actions) +
      '<div class="module-summary" style="width:100%"><div data-tone="info"><span>تعداد کل</span><strong>' + faDigits(existing) + '</strong></div>' +
      '<div data-tone="ok"><span>امروز ثبت‌شده</span><strong>' + faDigits(records.filter(function(item){return String(item.createdAt||'').slice(0,10)===todayIso();}).length) + '</strong></div><div data-tone="special"><span>آخرین به‌روزرسانی</span><strong>' + (data.updatedAt ? displayDateTime(data.updatedAt) : '—') + '</strong></div></div>' +
      renderForm(moduleKey, data) +
      '<section class="module-list-panel" style="width:100%;min-width:0"><div class="module-list-head"><div><h3>فهرست ' + esc(specs[moduleKey].title) + '</h3><p>جست‌وجو، فیلتر، انتخاب چند ردیف و ویرایش از همین بخش انجام می‌شود.</p></div>' +
      '<div class="module-list-tools"><input type="search" data-module-search data-view="' + esc(moduleKey) + '" value="' + esc(searchState[moduleKey] || '') + '" placeholder="جست‌وجو در فهرست" aria-label="جست‌وجو">' + renderStatusFilter(moduleKey) + '</div></div>' +
      '<div class="module-bulk-tools"><label><input type="checkbox" data-module-select-all> انتخاب همه</label><button type="button" class="module-delete-btn" data-module-action="bulk-delete" data-view="' + esc(moduleKey) + '">حذف انتخاب‌شده‌ها</button>' +
      '<span data-module-result-count>' + faDigits(recordsForView(moduleKey, data).length) + ' مورد از ' + faDigits(existing) + '</span></div>' +
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
    (appData.faults || []).forEach(function (fault) {
      const open = fault.status !== 'رفع شد' && fault.status !== 'بسته‌شده';
      if (!open) return;
      alerts.push({
        key:'fault-' + fault.id,
        critical:fault.priority === 'بحرانی' || fault.priority === 'زیاد',
        title:'اشکال باز: ' + (fault.title || 'بدون عنوان'),
        detail:(faultAssetLabel(fault) || '') + ' · ' + (fault.status || 'ثبت‌شده') + ' · ' + faDigits(faultProgress(fault)) + '٪ رفع',
        at:fault.reportedAt,
        view:'faults'
      });
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
          const names=(m.crewIds||[]).map(function(id){const person=staff.find(function(e){return String(e.id)===String(id)});return person?employeeName(person):''}).filter(Boolean);
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
    if(foot){const parts=foot.querySelectorAll('span');if(parts[1])parts[1].textContent='مرکز مدیریت عملیات ATLAS SHIFT';if(parts[3])parts[3].textContent='داده‌های نمونه برای بازبینی جریان کار';}
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
    const actions = '<select id="reportExportFormat" class="module-report-export" aria-label="قالب خروجی گزارش"><option value="csv">CSV</option><option value="xlsx">Excel (.xlsx)</option><option value="docx">Word (.docx)</option><option value="pptx">PowerPoint (.pptx)</option><option value="png">تصویر PNG</option></select><button class="primary-btn" type="button" data-module-action="export-report">دریافت گزارش</button><button class="secondary-btn" type="button" data-module-action="print">چاپ / ذخیرهٔ PDF</button><button class="secondary-btn" type="button" data-module-action="export-all">CSV همهٔ اطلاعات</button>';
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

  function renderSettings(section) {
    section.innerHTML=rootWrap(
      pageHead('تنظیمات','مدیریت محلی اطلاعات، فیلدهای پرسنلی قابل تنظیم و نسخهٔ پشتیبان. تم فعلی تغییر داده نمی‌شود.','')+
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>پشتیبان‌گیری و بازیابی</h3><p>نسخهٔ پشتیبان تمام پرونده‌ها، تاریخچه، تنظیمات و پیوست‌های محلی را دربر می‌گیرد.</p></div></div>'+
      '<div class="module-backup-grid"><div class="module-backup-card"><strong>ساخت نسخهٔ پشتیبان</strong><p>یک فایل JSON از تمام داده‌های موجود در این دستگاه دریافت می‌کنی.</p><button type="button" class="primary-btn" data-module-action="backup">دریافت فایل پشتیبان</button></div>'+
      '<div class="module-backup-card"><strong>بازیابی نسخهٔ پشتیبان</strong><p>بازیابی، داده‌های فعلی را جایگزین اطلاعات درون فایل انتخاب‌شده می‌کند.</p><button type="button" class="secondary-btn" data-module-action="restore-select">انتخاب فایل پشتیبان</button><input type="file" id="atlasRestoreFile" accept=".json,application/json" hidden></div></div></section>'+
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>مدیریت منوها و فهرست‌ها</h3><p>تمام گزینه‌های کشویی قابل تنظیم در یک محل؛ افزودن فوری نیز از کنار فیلدهای مرتبط انجام می‌شود.</p></div></div><div class="module-list-tools"><select id="referenceListKey">'+referenceKeys().map(function(k){return '<option value="'+esc(k)+'">'+esc(referenceListTitle(k))+'</option>';}).join('')+'</select><input id="referenceListValue" type="text" placeholder="عنوان گزینه جدید"><button type="button" class="primary-btn" data-module-action="reference-add">+ افزودن</button></div><div id="referenceListItems" class="module-local-note" style="margin-top:12px"></div></section>' +
      '<section class="module-list-panel"><div class="module-list-head"><div><h3>فیلدهای سفارشی کارکنان</h3><p>برای هر فیلد یک عنوان و یک نوع انتخاب کن؛ نوع همان کادری را می‌سازد که هنگام ثبت پرونده می‌بینی: عدد، تاریخ شمسی، تاریخ و ساعت، متن بلند و …</p></div></div>'+
      '<form data-custom-fields-form class="module-form"><div class="module-custom-fields" data-custom-field-rows>'+(appData.settings.employeeCustomFields||'').split(/\r?\n/).map(function(l){return l.trim();}).filter(Boolean).map(customFieldRowHtml).join('')+'</div>'+
      '<div class="module-form-actions"><span class="module-required-help">حداکثر ۲۰ فیلد سفارشی.</span><div><button type="button" class="secondary-btn" data-module-action="custom-field-add">+ افزودن فیلد</button> <button type="submit" class="primary-btn">ذخیرهٔ فیلدها</button></div></div></form></section>'
    );
    renderReferenceList();  }

  function referenceListTitle(key){
    const titles={workplaces:'شهرها و محل‌ها',leaveTypes:'انواع مرخصی',missionTypes:'انواع مأموریت',pipelineSizes:'قطر خطوط',products:'نوع فرآورده',vehicleTypes:'انواع خودرو',vehicleStatuses:'وضعیت خودرو',gasStatuses:'وضعیت گازسنج',actionTypes:'انواع یادداشت و اقدام',programTypes:'انواع برنامه',workTypes:'نوع کار',jobTitles:'عنوان‌های شغلی',employmentTypes:'نوع استخدام',shiftPatterns:'الگوی شیفت',employeeStatuses:'وضعیت کارکنان',missionStatuses:'وضعیت مأموریت',leaveStatuses:'وضعیت مرخصی',healthStatuses:'وضعیت سلامت',noteStatuses:'وضعیت یادداشت و پیگیری',reportStatuses:'وضعیت گزارش اولیه',programStatuses:'وضعیت پرونده',operationalPoints:'نقاط عملیاتی',gasSensorTypes:'نوع سنسور گازسنج',gasSensorLocations:'محل‌های استقرار',operationalRanges:'محدوده‌های عملیاتی',vehicleServiceTypes:'انواع سرویس خودرو',missionTitles:'عنوان‌های مأموریت',vehicleNames:'نام خودروها',gasModels:'مدل گازسنج‌ها',deploymentLocations:'محل‌های استقرار',maneuverLocations:'محل‌های اجرای مانور',faultAssetTypes:'نوع دارایی اشکال',faultCategories:'دسته‌های اشکال',faultPriorities:'اولویت اشکال',faultStatuses:'وضعیت رفع اشکال',maintenanceTypes:'نوع سرویس و تعمیر',maintenanceStatuses:'وضعیت سرویس',gasLogTypes:'نوع سابقهٔ گازسنج',programCategories:'دسته‌های برنامه'};
    return titles[key]||key;
  }

  // هر فهرستی که در فرم‌ها استفاده شود، حتی اگر هنوز ساخته نشده باشد، در تنظیمات دیده می‌شود.
  function referenceKeys(target){
    const keys=Object.keys((target||appData).references||{});
    MODULES.forEach(function(moduleKey){
      (specs[moduleKey].fields||[]).forEach(function(field){
        if(field.listKey&&keys.indexOf(field.listKey)<0)keys.push(field.listKey);
      });
    });
    return keys.sort(function(a,b){return referenceListTitle(a).localeCompare(referenceListTitle(b),'fa');});
  }

  function ensureReferenceLists(target){
    const state=target||appData;
    if(!state.references||typeof state.references!=='object')state.references={};
    referenceKeys().forEach(function(key){
      if(!Array.isArray(state.references[key])){
        const field=MODULES.map(function(m){return (specs[m].fields||[]).filter(function(f){return f.listKey===key;})[0];}).filter(Boolean)[0];
        state.references[key]=(field&&Array.isArray(field.options)?field.options.slice():[]);
      }
    });
    return state.references;
  }

  function renderReferenceList(){
    const key=document.getElementById('referenceListKey'),host=document.getElementById('referenceListItems');
    if(!key||!host)return;
    host.innerHTML=(appData.references[key.value]||[]).map(function(value,i){return '<div class="module-reference-row"><span>'+esc(value)+'</span><span style="display:flex;gap:5px;flex-wrap:wrap"><button type="button" class="secondary-btn" data-module-action="reference-up" data-index="'+i+'" aria-label="انتقال به بالا" '+(i===0?'disabled':'')+'>↑</button><button type="button" class="secondary-btn" data-module-action="reference-down" data-index="'+i+'" aria-label="انتقال به پایین" '+(i===(appData.references[key.value]||[]).length-1?'disabled':'')+'>↓</button><button type="button" class="secondary-btn" data-module-action="reference-edit" data-index="'+i+'">ویرایش</button><button type="button" class="secondary-btn" data-module-action="reference-delete" data-index="'+i+'">حذف</button></span></div>';}).join('')||'این فهرست هنوز گزینه‌ای ندارد.';
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
      '<div class="fault-card-actions"><button type="button" class="secondary-btn" data-module-action="edit" data-view="faults" data-id="' + esc(record.id) + '">ویرایش</button>' +
      (open ? '<button type="button" class="secondary-btn" data-fault-action="resolve" data-fault="' + esc(record.id) + '">علامت‌گذاری رفع شد</button>' : '') +
      '<button type="button" class="module-delete-btn" data-module-action="delete" data-view="faults" data-id="' + esc(record.id) + '">حذف</button></div></div></article>';
  }

  function renderFaults(section) {
    const records = (appData.faults || []).slice().sort(function (a, b) {
      const rank = { 'بحرانی': 0, 'زیاد': 1, 'متوسط': 2, 'کم': 3 };
      const openA = a.status === 'رفع شد' || a.status === 'بسته‌شده' ? 1 : 0;
      const openB = b.status === 'رفع شد' || b.status === 'بسته‌شده' ? 1 : 0;
      if (openA !== openB) return openA - openB;
      const pa = rank[a.priority] == null ? 9 : rank[a.priority];
      const pb = rank[b.priority] == null ? 9 : rank[b.priority];
      if (pa !== pb) return pa - pb;
      return String(b.reportedAt || '').localeCompare(String(a.reportedAt || ''));
    });
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
    section.innerHTML = rootWrap(
      pageHead('اشکالات و رفع اشکال', 'هر اشکال با تاریخ، وضعیت، درصد پیشرفت و روند رفع؛ تا بسته‌شدن در اعلان‌ها می‌ماند', actions) +
      '<div class="stat-row fault-kpis">' + kpis + '</div>' +
      renderForm('faults', appData) +
      '<div class="program-chips">' + chips + '</div>' +
      body +
      '<div class="module-local-note"><strong>اعلان:</strong> اشکال‌های باز با اولویت زیاد و بحرانی در زنگ اعلان داشبورد و در «اشکالات باز» می‌آیند و تا رفع کامل حذف نمی‌شوند.</div>'
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
    if (left <= 30) return { key: 'soon', label: 'نزدیک انقضا', tone: 'attention', left: left };
    return { key: 'valid', label: 'معتبر', tone: 'ok', left: left };
  }

  function renderGasRegistry(section) {
    if (gasTab === 'logs') { renderGasLogs(section); return; }
    const records = (appData.gasmeters || []).slice();
    const stateOf = function (record) { return gasCalibrationState(record); };
    const locations = ['all'].concat(appData.references.deploymentLocations || []);
    const statuses = ['all'].concat(appData.references.gasStatuses || []);
    const visible = records.filter(function (record) {
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
        '<td>' + esc(record.location || record.locationPoint || '—') + '</td>' +
        '<td>' + esc(responsible ? employeeName(responsible) : '—') + '</td>' +
        '<td>' + (record.calibrationEnd ? formatJalali(record.calibrationEnd, false) : '—') + '</td>' +
        '<td>' + statusTag(state.label) + '<div class="cell-sub">' + (state.left == null ? '—' : (state.left < 0 ? faDigits(Math.abs(state.left)) + ' روز گذشته' : faDigits(state.left) + ' روز مانده')) + '</div></td>' +
        '<td>' + faDigits(logs) + ' مورد</td>' +
        '<td class="module-row-actions"><button type="button" class="secondary-btn" data-gas-action="log" data-gas="' + esc(record.id) + '">+ سابقه</button>' +
        '<button type="button" class="secondary-btn" data-module-action="edit" data-view="gasmeters" data-id="' + esc(record.id) + '">ویرایش</button>' +
        '<button type="button" class="module-delete-btn" data-module-action="delete" data-view="gasmeters" data-id="' + esc(record.id) + '">حذف</button></td></tr>';
    }).join('');
    const table = visible.length
      ? '<div class="module-table-wrap"><table class="module-table"><thead><tr><th>کد / سریال</th><th>مدل</th><th>وضعیت</th><th>سلامت</th><th>محل استقرار</th><th>مسئول</th><th>پایان کالیبراسیون</th><th>مانده کالیبراسیون</th><th>سوابق</th><th>عملیات</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<div class="module-empty">موردی با این فیلترها پیدا نشد.</div>';
    const actions = exportMenu('gasmeters') + '<button class="primary-btn" type="button" data-module-action="new" data-view="gasmeters">+ ثبت گازسنج</button>';
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
      '<div class="module-local-note"><strong>هشدار کالیبراسیون:</strong> دستگاه‌هایی که کمتر از ۳۰ روز تا پایان اعتبارشان مانده یا منقضی شده‌اند، در زنگ اعلان داشبورد هم نمایش داده می‌شوند.</div>'
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

  const EXPORT_FORMATS = [['csv', 'CSV (صفحه‌گسترده)'], ['xlsx', 'Excel (.xlsx)'], ['docx', 'Word (.docx)'], ['pptx', 'PowerPoint (.pptx)'], ['png', 'تصویر PNG'], ['print', 'چاپ کم‌مصرف']];

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

  function customExportMenu(kind, gasId) {
    return '<div class="module-export" data-export-menu>' +
      '<button type="button" class="secondary-btn module-export-toggle" data-module-action="export-toggle" aria-haspopup="true" aria-expanded="false">⬇ خروجی و چاپ</button>' +
      '<div class="module-export-list" hidden>' +
      EXPORT_FORMATS.map(function (pair) {
        return '<button type="button" data-export-custom="' + esc(kind) + '" data-gas="' + esc(gasId || '') + '" data-format="' + pair[0] + '">' + pair[1] + '</button>';
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
      pageHead('مدیریت گازسنج‌ها', 'سوابق هر دستگاه: محل استقرار، تاریخ استقرار، سلامت و کالیبراسیون', customExportMenu('gaslogs-registry')) +
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

  // ── دفتر سرویس خودروها: سوابق زونکن‌بندی‌شده برای هر خودرو ──
  function renderServiceBook(section) {
    const vehicles = (appData.vehicles || []).slice();
    const logs = (appData.maintenance || []).slice().sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    const totalCost = logs.reduce(function (sum, item) { return sum + (Number(item.cost) || 0); }, 0);
    const folders = vehicles.map(function (vehicle) {
      const entries = logs.filter(function (item) { return String(item.vehicleId) === String(vehicle.id); });
      const last = entries[0];
      const cost = entries.reduce(function (sum, item) { return sum + (Number(item.cost) || 0); }, 0);
      const rows = entries.length ? entries.map(function (item) {
        return '<div class="service-row"><div class="service-date">' + (item.date ? formatJalali(item.date, false) : '—') + '</div>' +
          '<div class="service-main"><strong>' + esc(item.type || 'سرویس') + '</strong><span>' + esc(item.description || '') + '</span></div>' +
          '<div class="service-meta">' + (item.km ? faDigits(item.km) + ' کیلومتر' : '') + (item.cost ? ' · ' + faDigits(item.cost) + ' ریال' : '') + '</div>' +
          '<div class="service-actions"><button type="button" class="secondary-btn" data-module-action="edit" data-view="maintenance" data-id="' + esc(item.id) + '">ویرایش</button>' +
          '<button type="button" class="module-delete-btn" data-module-action="delete" data-view="maintenance" data-id="' + esc(item.id) + '">حذف</button></div></div>';
      }).join('') : '<div class="service-empty">برای این خودرو سرویسی ثبت نشده است.</div>';
      return '<details class="service-folder"' + (entries.length ? '' : ' data-empty="1"') + '><summary><div><strong>' + esc(vehicle.name || 'خودرو') + '</strong>' +
        '<span>' + esc([vehicle.vehicleType, vehicle.companyPlate, vehicle.status].filter(Boolean).join(' · ') || 'بدون مشخصات') + '</span></div>' +
        '<div class="service-folder-meta"><span>' + faDigits(entries.length) + ' سرویس</span>' + (cost ? '<span>' + faDigits(cost) + ' ریال</span>' : '') +
        (last && last.date ? '<span>آخرین: ' + formatJalali(last.date, false) + '</span>' : '') + '</div></summary>' +
        '<div class="service-body">' + rows +
        '<div class="service-folder-actions"><button type="button" class="primary-btn" data-service-action="add" data-vehicle="' + esc(vehicle.id) + '">+ ثبت سرویس برای این خودرو</button>' +
        '<button type="button" class="secondary-btn" data-service-action="export" data-vehicle="' + esc(vehicle.id) + '">خروجی اکسل این خودرو</button></div></div></details>';
    }).join('');
    const kpis = [['کل سوابق', faDigits(logs.length), 'info'], ['خودروهای دارای سابقه', faDigits(vehicles.filter(function (v) { return logs.some(function (l) { return String(l.vehicleId) === String(v.id); }); }).length), 'ok'], ['مجموع هزینه', faDigits(totalCost), 'special']]
      .map(function (pair) { return '<div class="mini-stat" data-tone="' + pair[2] + '"><div class="value">' + pair[1] + '</div><div class="label"><i class="tiny-dot"></i>' + pair[0] + '</div></div>'; }).join('');
    const actions = exportMenu('maintenance') + '<button class="primary-btn" type="button" data-module-action="new" data-view="maintenance">+ ثبت سرویس</button>';
    section.innerHTML = rootWrap(
      pageHead('دفتر سرویس و تعمیرات خودرو', 'هر خودرو یک زونکن: تاریخ، کیلومتر، نوع اقدام، هزینه و سرویس بعدی؛ قابل خروجی و تاریخچه', actions) +
      '<div class="stat-row">' + kpis + '</div>' +
      renderForm('maintenance', appData) +
      (vehicles.length ? '<div class="service-book">' + folders + '</div>' : '<div class="module-empty">اول خودروها را ثبت کن؛ بعد برای هر خودرو سابقهٔ سرویس اینجا زونکن می‌شود.</div>')
    );
  }

  // ── ثبت سریع از داشبورد: فرم همان بخش را باز می‌کند ──
  document.addEventListener('click', function (event) {
    const quick = event.target.closest('[data-quick-add]');
    if (!quick) return;
    const view = quick.dataset.quickAdd;
    if (!view) return;
    let preset = null;
    try { preset = quick.dataset.preset ? JSON.parse(quick.dataset.preset) : null; } catch (error) { preset = null; }
    if (view === 'faults') preset = Object.assign({ reportedAt: todayIso() }, preset || {});
    if (view === 'gaslogs' || view === 'maintenance') preset = Object.assign({ date: todayIso() }, preset || {});
    formState[view] = { open:true, id:null, preset:preset };
    const url = new URL(window.location.href);
    url.searchParams.set('view', view);
    window.history.pushState({}, '', url.pathname + '?' + url.searchParams.toString());
    if (typeof window.ATLAS_ROUTE === 'function') window.ATLAS_ROUTE(view);
    else render(view, document.getElementById('sectionView'));
    window.scrollTo({ top:0, behavior:'smooth' });
  });

  // ── اقدام‌های دفتر اشکالات، دفتر گازسنج و دفتر سرویس ──
  document.addEventListener('click', async function (event) {
    const faultBtn = event.target.closest('[data-fault-action]');
    if (faultBtn) {
      const action = faultBtn.dataset.faultAction;
      const section = document.getElementById('sectionView');
      if (action === 'filter') { faultFilter = faultBtn.dataset.status || 'all'; renderFaults(section); return; }
      const record = (appData.faults || []).find(function (item) { return String(item.id) === String(faultBtn.dataset.fault); });
      if (!record) return;
      if (action === 'add-step') {
        const input = section.querySelector('[data-fault-step-input="' + record.id + '"]');
        const text = String(input && input.value || '').trim();
        if (!text) { if (input) input.focus(); return; }
        const entry = formatJalali(new Date().toISOString(), false) + ' | ' + text;
        record.steps = [String(record.steps || '').trim(), entry].filter(Boolean).join('\n');
        record.updatedAt = new Date().toISOString();
        if (await saveState()) { renderFaults(section); refreshDashboard(); toast('اقدام به روند رفع اضافه شد.'); }
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
        if (await saveState()) { renderFaults(section); refreshDashboard(); toast('اشکال رفع شد و از اعلان‌ها خارج شد.'); }
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
      if (serviceBtn.dataset.serviceAction === 'export') {
        const fields = fieldsFor('maintenance');
        const rows = [fields.map(function (field) { return field.label; })];
        (appData.maintenance || []).filter(function (item) { return String(item.vehicleId) === String(vehicleId); })
          .sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); })
          .forEach(function (item) { rows.push(fields.map(function (field) { return exportValue('maintenance', field, item, appData); })); });
        const vehicle = (appData.vehicles || []).find(function (item) { return String(item.id) === String(vehicleId); });
        exportRowsXlsx(rows, 'ATLAS-SHIFT-servicebook-' + (vehicle ? vehicle.name : vehicleId) + '-' + todayIso() + '.xlsx', 'سوابق سرویس');
        toast('خروجی سوابق این خودرو آماده شد.');
        return;
      }
    }
  });

  // زیرتب‌ها، باز کردن سابقهٔ یک دستگاه و خروجی‌های اختصاصی همین بخش.
  document.addEventListener('click', function (event) {
    const section = document.getElementById('sectionView');
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
        runExport(gasMeterExportRows(meter), 'سوابق ' + gasMeterName(meter) + ' · ATLAS SHIFT', 'ATLAS-SHIFT-gaslogs-' + (meter.code || meter.id) + '-' + todayIso(), format);
      }
    }
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

  function render(view, section) {
    if(!section)return;
    prepareSection(section);
    if(!ready){
      section.innerHTML=rootWrap('<div class="module-empty">در حال آماده‌سازی اطلاعات محلی…</div>');
      return;
    }
    if(view==='programs')renderPrograms(section);
    else if(view==='faults')renderFaults(section);
    else if(view==='gasmeters')renderGasRegistry(section);
    else if(view==='gaslogs'){gasTab='logs';renderGasRegistry(section);}
    else if(view==='maintenance')renderServiceBook(section);
    else if(specs[view])renderCrud(view,section);
    else if(view==='reports')renderReports(section);
    else if(view==='settings')renderSettings(section);
    else{section.hidden=true;section.innerHTML='';}
    enhanceJalaliInputs(section);
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

  function pptxPackage(slide) {
    const groupTree='<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

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
    return [
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
    const slide='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="ATLAS SHIFT"><p:spTree>'+groupTree+
      pptTextShape(2,'عنوان گزارش',500000,350000,11100000,900000,[currentReportTitle()],2800,true)+
      pptTextShape(3,'خلاصه گزارش',500000,1500000,11100000,5200000,summary.slice(0,18),1800,false)+
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
    downloadBlob('ATLAS-SHIFT-report-'+todayIso()+'.pptx',zipStored(pptxPackage(slide)));
  }

  // ── خروجی یکپارچه: CSV، اکسل، ورد، پاورپوینت، تصویر و چاپ ─────────────────
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
    if (Array.isArray(value)) return value.join('، ');
    return String(value == null ? '' : value);
  }

  function exportColumnsSetting(moduleKey) {
    const stored = appData.settings && appData.settings.exportColumns ? appData.settings.exportColumns[moduleKey] : null;
    return Array.isArray(stored) && stored.length ? stored : null;
  }

  function selectedExportFields(moduleKey) {
    const fields = fieldsFor(moduleKey);
    const chosen = exportColumnsSetting(moduleKey);
    if (!chosen) return fields;
    const picked = fields.filter(function (field) { return chosen.indexOf(field.key) >= 0; });
    return picked.length ? picked : fields;
  }

  function exportColumnsModal(moduleKey) {
    const fields = fieldsFor(moduleKey);
    const chosen = exportColumnsSetting(moduleKey) || fields.map(function (field) { return field.key; });
    return '<div class="atlas-modal-backdrop" data-modal-backdrop data-modal-kind="export-columns" data-view="' + esc(moduleKey) + '">' +
      '<div class="atlas-modal" role="dialog" aria-modal="true"><div class="atlas-modal-head"><div><h3>ستون‌های گزارش</h3>' +
      '<p>هر ستونی را که در خروجی لازم داری تیک بزن؛ بقیه در فایل نمی‌آید تا گزارش شلوغ نشود.</p></div>' +
      '<button type="button" class="atlas-modal-close" data-module-action="export-columns-cancel" data-view="' + esc(moduleKey) + '" aria-label="بستن">×</button></div>' +
      '<div class="atlas-modal-body"><div class="module-check-options module-check-people" data-export-columns>' +
      fields.map(function (field) {
        return '<label><input type="checkbox" value="' + esc(field.key) + '"' + (chosen.indexOf(field.key) >= 0 ? ' checked' : '') + '><span>' + esc(field.label) + '</span></label>';
      }).join('') + '</div>' +
      '<div class="module-form-actions"><span class="module-required-help">حداقل یک ستون لازم است.</span><div>' +
      '<button type="button" class="secondary-btn" data-module-action="export-columns-all" data-view="' + esc(moduleKey) + '">انتخاب همه</button> ' +
      '<button type="button" class="primary-btn" data-module-action="export-columns-save" data-view="' + esc(moduleKey) + '">ذخیرهٔ ستون‌ها</button></div></div></div></div></div>';
  }

  function moduleExportRows(moduleKey) {
    const fields = selectedExportFields(moduleKey);
    const rows = [fields.map(function (field) { return field.label; })];
    (appData[moduleKey] || []).forEach(function (record) {
      rows.push(fields.map(function (field) { return exportValue(moduleKey, field, record, appData); }));
    });
    return rows;
  }

  function exportRowsXlsx(rows, filename, sheetName) {
    const sheetRows = rows.map(function (row, rowIndex) {
      const cells = row.map(function (value, columnIndex) {
        return '<c r="' + excelColumn(columnIndex) + (rowIndex + 1) + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(value) + '</t></is></c>';
      }).join('');
      return '<row r="' + (rowIndex + 1) + '">' + cells + '</row>';
    }).join('');
    const files = [
      {name:'[Content_Types].xml',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'},
      {name:'_rels/.rels',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
      {name:'xl/workbook.xml',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + xmlEscape(sheetName || 'ATLAS SHIFT') + '" sheetId="1" r:id="rId1"/></sheets></workbook>'},
      {name:'xl/_rels/workbook.xml.rels',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'},
      {name:'xl/worksheets/sheet1.xml',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:' + excelColumn(Math.max(0, rows[0].length - 1)) + Math.max(1, rows.length) + '"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><sheetData>' + sheetRows + '</sheetData></worksheet>'}
    ];
    downloadBlob(filename, zipStored(files));
  }

  function exportRowsDocx(rows, title, filename) {
    const paragraphs = wordParagraph(title, true, false) +
      wordParagraph('تاریخ تهیه: ' + formatJalali(new Date().toISOString(), true), false, false) +
      wordParagraph('تعداد ردیف‌ها: ' + faDigits(Math.max(0, rows.length - 1)), false, false);
    const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + paragraphs + wordTable(rows) +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>';
    const files = [
      {name:'[Content_Types].xml',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'},
      {name:'_rels/.rels',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'},
      {name:'word/document.xml',content:documentXml}
    ];
    downloadBlob(filename, zipStored(files));
  }

  function exportRowsPptx(rows, title, filename) {
    const header = rows[0] || [];
    const lines = rows.slice(1, 15).map(function (row) {
      return row.map(function (cell, index) {
        const label = header[index] ? header[index] + ': ' : '';
        return label + String(cell || '');
      }).join(' | ');
    });
    if (rows.length > 15) lines.push('… و ' + faDigits(rows.length - 15) + ' ردیف دیگر');
    if (!lines.length) lines.push('داده‌ای برای نمایش ثبت نشده است.');
    const groupTree = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
    const slide = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="ATLAS SHIFT"><p:spTree>' + groupTree +
      pptTextShape(2, 'عنوان', 500000, 350000, 11100000, 900000, [title], 2600, true) +
      pptTextShape(3, 'داده‌ها', 500000, 1400000, 11100000, 5200000, lines, 1500, false) +
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
    downloadBlob(filename, zipStored(pptxPackage(slide)));
  }

  // تصویر: همان قالب جدول، سفید و سیاه (مناسب چاپ و اشتراک‌گذاری)
  function exportRowsPng(rows, title, filename) {
    const scale = 2, pad = 26, rowH = 36, fontSize = 15;
    const measure = document.createElement('canvas').getContext('2d');
    const font = '600 ' + fontSize + 'px Vazirmatn, Tahoma, sans-serif';
    measure.font = font;
    const columns = Math.max.apply(null, rows.map(function (row) { return row.length; }));
    const widths = [];
    for (let i = 0; i < columns; i += 1) widths.push(96);
    rows.forEach(function (row) {
      for (let i = 0; i < columns; i += 1) {
        const width = measure.measureText(String(row[i] == null ? '' : row[i])).width + 26;
        if (width > widths[i]) widths[i] = width;
      }
    });
    const totalWidth = widths.reduce(function (a, b) { return a + b; }, 0);
    const width = Math.max(720, totalWidth + pad * 2);
    const height = pad * 2 + 52 + rows.length * rowH;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.font = '700 19px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText(title, width - pad, pad + 16);
    ctx.font = '400 12px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText('ATLAS SHIFT · ' + formatJalali(new Date().toISOString(), true), width - pad, pad + 38);
    let y = pad + 52;
    rows.forEach(function (row, rowIndex) {
      ctx.font = rowIndex === 0 ? '700 ' + fontSize + 'px Vazirmatn, Tahoma, sans-serif' : '400 ' + fontSize + 'px Vazirmatn, Tahoma, sans-serif';
      let x = width - pad;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = rowIndex === 0 ? 1.4 : 0.8;
      ctx.beginPath();
      ctx.moveTo(pad, y + rowH);
      ctx.lineTo(width - pad, y + rowH);
      ctx.stroke();
      for (let i = 0; i < columns; i += 1) {
        const cell = String(row[i] == null ? '' : row[i]);
        const columnWidth = widths[i];
        x -= columnWidth;
        ctx.fillStyle = '#000000';
        const text = cell.length > 34 ? cell.slice(0, 33) + '…' : cell;
        ctx.fillText(text, x + columnWidth - 13, y + rowH / 2);
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + rowH);
        ctx.stroke();
      }
      y += rowH;
    });
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(pad, pad + 52, width - pad * 2, rows.length * rowH);
    canvas.toBlob(function (blob) { if (blob) downloadBlob(filename, blob); }, 'image/png');
  }

  // چاپ کم‌مصرف: پس‌زمینه سفید، خطوط و متن سیاه
  function printRows(rows, title) {
    let host = document.getElementById('atlasPrintArea');
    if (!host) {
      host = document.createElement('div');
      host.id = 'atlasPrintArea';
      document.body.appendChild(host);
    }
    host.innerHTML = '<h1>' + esc(title) + '</h1><p class="atlas-print-meta">ATLAS SHIFT · ' + formatJalali(new Date().toISOString(), true) + '</p>' +
      '<table><thead><tr>' + (rows[0] || []).map(function (cell) { return '<th>' + esc(cell) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.slice(1).map(function (row) {
        return '<tr>' + row.map(function (cell) { return '<td>' + esc(cell) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
    document.body.classList.add('atlas-printing');
    const cleanup = function () { document.body.classList.remove('atlas-printing'); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 1500);
  }

  function runExport(rows, title, base, format) {
    if (format === 'xlsx') exportRowsXlsx(rows, base + '.xlsx', title);
    else if (format === 'docx') exportRowsDocx(rows, title, base + '.docx');
    else if (format === 'pptx') exportRowsPptx(rows, title, base + '.pptx');
    else if (format === 'png') exportRowsPng(rows, title, base + '.png');
    else if (format === 'print') printRows(rows, title);
    else downloadFile(base + '.csv', '\uFEFF' + rows.map(function (row) { return row.map(csvEscape).join(','); }).join('\r\n'), 'text/csv;charset=utf-8;');
  }

  function exportModule(moduleKey, format) {
    if (!specs[moduleKey]) return;
    runExport(moduleExportRows(moduleKey), specs[moduleKey].title + ' · ATLAS SHIFT', 'ATLAS-SHIFT-' + moduleKey + '-' + todayIso(), format);
  }

  function exportMenu(moduleKey) {
    return '<div class="module-export" data-export-menu>' +
      '<button type="button" class="secondary-btn module-export-toggle" data-module-action="export-toggle" aria-haspopup="true" aria-expanded="false">⬇ خروجی و چاپ</button>' +
      '<div class="module-export-list" hidden>' +
      '<button type="button" data-module-action="export" data-format="csv" data-view="' + esc(moduleKey) + '">CSV (صفحه‌گسترده)</button>' +
      '<button type="button" data-module-action="export" data-format="xlsx" data-view="' + esc(moduleKey) + '">Excel (.xlsx)</button>' +
      '<button type="button" data-module-action="export" data-format="docx" data-view="' + esc(moduleKey) + '">Word (.docx)</button>' +
      '<button type="button" data-module-action="export" data-format="pptx" data-view="' + esc(moduleKey) + '">PowerPoint (.pptx)</button>' +
      '<button type="button" data-module-action="export" data-format="png" data-view="' + esc(moduleKey) + '">تصویر PNG</button>' +
      '<button type="button" data-module-action="export" data-format="print" data-view="' + esc(moduleKey) + '">چاپ کم‌مصرف</button>' +
      '<button type="button" class="module-export-columns" data-module-action="export-columns" data-view="' + esc(moduleKey) + '">⚙ انتخاب ستون‌های گزارش</button>' +
      '</div></div>';
  }

  function exportCsv(moduleKey) {
    const rows = moduleExportRows(moduleKey);
    downloadFile('ATLAS-SHIFT-'+moduleKey+'-'+todayIso()+'.csv','\uFEFF'+rows.map(function(row){return row.map(csvEscape).join(',');}).join('\r\n'),'text/csv;charset=utf-8;');
  }

  function shiftPrintRows() {
    const rows=[['شروع','پایان','نوع شیفت','کارکنان','محل خدمت','وضعیت','توضیحات']];
    (appData.shifts||[]).forEach(function(record){
      rows.push([formatJalali(record.startAt,true),formatJalali(record.endAt,true),record.shiftType||'',shiftLabel(record,appData),record.workplace||'',record.status||'',record.notes||'']);
    });
    return rows;
  }

  function exportShiftsCsv() {
    const rows=[['شناسه','شروع','پایان','نوع شیفت','کارکنان','محل خدمت','وضعیت','توضیحات']];
    (appData.shifts||[]).forEach(function(record){
      rows.push([record.id,record.startAt||'',record.endAt||'',record.shiftType||'',shiftLabel(record,appData),record.workplace||'',record.status||'',record.notes||'']);
    });
    downloadFile('ATLAS-SHIFT-shifts-'+todayIso()+'.csv','\uFEFF'+rows.map(function(row){return row.map(csvEscape).join(',');}).join('\r\n'),'text/csv;charset=utf-8;');
  }

  function exportAllCsv() {
    const rows=[['بخش','عنوان','وضعیت','تاریخ','شرح']];
    MODULES.forEach(function(key){
      appData[key].forEach(function(record){
        rows.push([specs[key].title,recordLabel(key,record),record.status||'',recordDateForCsv(key,record),record.notes||record.body||record.result||record.reason||record.description||'']);
      });
    });
    (appData.shifts||[]).forEach(function(record){rows.push(['برنامهٔ شیفت',shiftLabel(record,appData),record.status||'',record.startAt||'',record.workplace||record.notes||'']);});
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
    }else if(action==='export'){
      exportShiftsCsv();
    }else if(action==='print'){
      printRows(shiftPrintRows(),'برنامهٔ شیفت‌ها · ATLAS SHIFT');
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
      const key=toggle?toggle.dataset.addListOption:'';
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
        toast('گزینه افزوده و ذخیره شد.');
      }
      return;
    }
    const button=event.target.closest('[data-module-action]');
    if(!button)return;
    const action=button.dataset.moduleAction;
    const moduleKey=button.dataset.view||new URLSearchParams(window.location.search).get('view')||'dashboard';
    if(action==='reference-add'||action==='reference-edit'||action==='reference-delete'||action==='reference-up'||action==='reference-down'){
      const key=document.getElementById('referenceListKey'),input=document.getElementById('referenceListValue'),listKey=key&&key.value;
      if(!listKey||!Array.isArray(appData.references[listKey]))return;
      const list=appData.references[listKey];
      if(action==='reference-add'){const value=String(input&&input.value||'').trim();if(!value){toast('عنوان گزینه را وارد کن.');return;}if(list.includes(value)){toast('این گزینه از قبل وجود دارد.');return;}list.push(value);if(input)input.value='';}
      else{const i=Number(button.dataset.index);if(i<0||i>=list.length)return;if(action==='reference-edit'){const value=await askPrompt({title:'ویرایش گزینهٔ فهرست',label:'عنوان جدید گزینه',value:list[i],confirmLabel:'ذخیره'});if(value===null)return;const next=value;if(list.includes(next)&&next!==list[i]){toast('این گزینه از قبل وجود دارد.');return;}const previous=list[i];list[i]=next;MODULES.forEach(function(m){(specs[m].fields||[]).forEach(function(field){if(field.listKey!==listKey)return;(appData[m]||[]).forEach(function(record){if(record[field.key]===previous)record[field.key]=next;else if(Array.isArray(record[field.key]))record[field.key]=record[field.key].map(function(v){return v===previous?next:v;});});});});}else if(action==='reference-delete'){if(!(await askConfirm({title:'حذف گزینه از فهرست',message:'گزینه از فهرست حذف شود؟ سوابق قبلی حفظ می‌شوند و مقدارهای ثبت‌شده پاک نخواهند شد.',confirmLabel:'حذف',danger:true})))return;list.splice(i,1);}else{const nextIndex=action==='reference-up'?i-1:i+1;if(nextIndex<0||nextIndex>=list.length)return;const swap=list[nextIndex];list[nextIndex]=list[i];list[i]=swap;}}
      if(await saveState()){renderReferenceList();if(action==='reference-edit'){const current=document.getElementById('sectionView');const view=new URLSearchParams(window.location.search).get('view')||'dashboard';if(specs[view])render(view,current);}toast('فهرست ذخیره شد.');}return;
    }
    if(action==='custom-field-add'||action==='custom-field-remove'){
      const form=button.closest('[data-custom-fields-form]');
      const rows=form&&form.querySelector('[data-custom-field-rows]');
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
      else if(format==='pptx')exportReportPptx();
      else if(format==='png')exportRowsPng(currentReportRows(), currentReportTitle(), 'ATLAS-SHIFT-report-'+todayIso()+'.png');
      else exportReportCsv();
    }else if(action==='export-all'){
      exportAllCsv();
    }else if(action==='print'){
      if(specs[moduleKey])printRows(moduleExportRows(moduleKey), specs[moduleKey].title+' · ATLAS SHIFT');
      else if(document.getElementById('reportExportFormat'))printRows(currentReportRows(), currentReportTitle());
      else window.print();
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
    document.querySelectorAll('body > [data-modal-backdrop]').forEach(function (node) { node.remove(); });
  }

  function closeModal(view) {
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
    if (!document.querySelector('[data-modal-backdrop]')) return;
    event.preventDefault();
    closeModal();
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
        clearDetachedModals();
        refreshCurrentView();
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
      const lines=Array.from(customForm.querySelectorAll('[data-custom-field-row]')).map(function(row){
        const label=String((row.querySelector('[data-cf-label]')||{}).value||'').trim();
        const type=String((row.querySelector('[data-cf-type]')||{}).value||'text').trim();
        return label?label+'|'+(CUSTOM_FIELD_TYPES[type]?type:'text'):'';
      }).filter(Boolean);
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
    const start = jalaliMonthStartDate(jy, jm);
    const next = jm === 12 ? jalaliMonthStartDate(jy + 1, 1) : jalaliMonthStartDate(jy, jm + 1);
    return Math.round((next.getTime() - start.getTime()) / 86400000);
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
          '<label class="jalali-seg"><span>سال</span><input type="text" inputmode="numeric" autocomplete="off" maxlength="4" data-jalali-seg="year" value="' + esc(parts.year) + '" placeholder="۱۴۰۵"></label>' +
          '<label class="jalali-seg"><span>ماه</span><input type="text" inputmode="numeric" autocomplete="off" maxlength="2" data-jalali-seg="month" value="' + esc(parts.month) + '" placeholder="۰۷"></label>' +
          '<label class="jalali-seg"><span>روز</span><input type="text" inputmode="numeric" autocomplete="off" maxlength="2" data-jalali-seg="day" value="' + esc(parts.day) + '" placeholder="۲۸"></label>' +
          (withTime ? '<label class="jalali-seg jalali-seg-time"><span>ساعت</span><input type="text" inputmode="numeric" autocomplete="off" maxlength="5" data-jalali-seg="time" value="' + esc(parts.time) + '" placeholder="۰۸:۳۰"></label>' : '') +
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
  }

  function jalaliPopoverEl() {
    if (!jalaliPopover) {
      jalaliPopover = document.createElement('div');
      jalaliPopover.className = 'jalali-popover';
      jalaliPopover.hidden = true;
      jalaliPopover.setAttribute('role', 'dialog');
      jalaliPopover.setAttribute('aria-label', 'سالنامه');
      document.body.appendChild(jalaliPopover);
    }
    return jalaliPopover;
  }

  function renderJalaliPopover() {
    const pop = jalaliPopoverEl();
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
    pop.innerHTML =
      '<div class="jalali-pop-head">' +
        '<button type="button" class="jalali-nav" data-jalali-nav="prev" aria-label="ماه قبل">‹</button>' +
        '<div class="jalali-pop-title">' + esc(JALALI_MONTHS[jalaliView.month - 1] || '') + ' ' + faDigits(jalaliView.year) + '</div>' +
        '<button type="button" class="jalali-nav" data-jalali-nav="next" aria-label="ماه بعد">›</button>' +
      '</div>' +
      '<div class="jalali-week">' + JALALI_WEEK.map(function (label) { return '<span>' + label + '</span>'; }).join('') + '</div>' +
      '<div class="jalali-grid">' + cells + '</div>' +
      '<div class="jalali-pop-foot"><button type="button" class="secondary-btn" data-jalali-action="today">امروز</button><button type="button" class="secondary-btn" data-jalali-action="close">بستن</button></div>';
  }

  function openJalaliPopover(wrap, opener) {
    if (!wrap) return;
    jalaliTarget = wrap;
    const hidden = wrap.querySelector('input.jalali-value');
    const parts = splitJalaliText(hidden ? hidden.value : '');
    const today = intlJalaliParts(new Date());
    jalaliView = { year: Number(parts.year) || today.year, month: Number(parts.month) || today.month };
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
    closeJalaliPopover();
    const hidden = wrap.querySelector('input.jalali-value');
    if (hidden) hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }

  document.addEventListener('focusin', function (event) {
    const segment = event.target.closest && event.target.closest('[data-jalali-seg]');
    if (segment) segment.select();
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
    const name = segment.dataset.jalaliSeg;
    if (name === 'month' || name === 'day') {
      const digits = persianDigitsToLatin(segment.value).replace(/\D/g, '');
      if (digits) segment.value = digits.padStart(2, '0');
    }
    syncJalaliField(segment.closest('.jalali-field'));
  }, true);

  document.addEventListener('click', function (event) {
    const opener = event.target.closest('[data-jalali-open]');
    if (opener) {
      openJalaliPopover(opener.closest('.jalali-field'), opener);
      return;
    }
    const nav = event.target.closest('[data-jalali-nav]');
    if (nav) {
      let month = jalaliView.month + (nav.dataset.jalaliNav === 'next' ? 1 : -1);
      let year = jalaliView.year;
      if (month > 12) { month = 1; year += 1; }
      if (month < 1) { month = 12; year -= 1; }
      jalaliView = { year: year, month: month };
      renderJalaliPopover();
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
      }
      return;
    }
    if (jalaliPopover && !jalaliPopover.hidden && !event.target.closest('.jalali-popover')) closeJalaliPopover();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && jalaliPopover && !jalaliPopover.hidden) closeJalaliPopover();
  });

  window.ATLAS_MODULES = {
    render: render,
    refreshDashboard: refreshDashboard,
    getData: function () { return appData; },
    isReady: function () { return ready; },
    parseJalali: parseJalali,
    formatJalali: formatJalali,
    confirm: askConfirm,
    prompt: askPrompt,
    showText: askText,
    setGasTab: setGasTab
  };

  document.addEventListener('DOMContentLoaded', function(){refreshDashboard();});
  initializeStorage();
})();
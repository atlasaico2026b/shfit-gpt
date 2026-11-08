// بررسی پلاک انتظامی چهاربخشی، فهرستی‌بودن محل استقرار خودرو و ملاک اعلان خودرو.
// بخش اول واقعاً تابع‌های پلاک را از modules.js بیرون می‌کشد و اجرا می‌کند؛
// بخش دوم ساختار فیلدها و اعلان‌ها را در همان فایل بررسی می‌کند.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const modules = read('modules.js');
const styles = read('design/styles.css');

const checks = [];
const check = (name, ok) => checks.push({ name, ok: !!ok });

// ── تابع‌های پلاک: استخراج و اجرای واقعی ──
function extract(name) {
  const start = modules.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('تابع پیدا نشد: ' + name);
  let depth = 0;
  for (let i = modules.indexOf('{', start); i < modules.length; i += 1) {
    if (modules[i] === '{') depth += 1;
    else if (modules[i] === '}') {
      depth -= 1;
      if (!depth) return modules.slice(start, i + 1);
    }
  }
  throw new Error('آکولاد نامتوازن: ' + name);
}

const plateApi = new Function(
  [extract('persianDigitsToLatin'), extract('faDigits'), extract('parsePlate'), extract('plateText'), extract('plateLabel')].join('\n') +
  '\nreturn { parsePlate: parsePlate, plateText: plateText, plateLabel: plateLabel };'
)();

const parts = plateApi.parsePlate('۱۲ الف ۳۴۵ ۶۷');
check('پلاک با رقم فارسی درست بخش‌بندی می‌شود', parts.p1 === '12' && parts.letter === 'الف' && parts.p3 === '345' && parts.p4 === '67');
check('پلاک چسبیده (۱۲ب۳۴۵۶۷) هم بخش‌بندی می‌شود', (function () {
  const p = plateApi.parsePlate('12ب34567');
  return p.p1 === '12' && p.letter === 'ب' && p.p3 === '345' && p.p4 === '67';
})());
check('پلاک خالی بخش خالی می‌دهد', (function () {
  const p = plateApi.parsePlate('');
  return !p.p1 && !p.letter && !p.p3 && !p.p4;
})());
check('پلاک در یک رشتهٔ واحد ذخیره می‌شود', plateApi.plateText(parts) === '12 الف 345 67');
check('پلاک با رقم فارسی نمایشد دهد می‌شود', plateApi.plateLabel('12 الف 345 67') === '۱۲ الف ۳۴۵ ۶۷');

// ── فیلدهای خودرو ──
check('پلاک انتظامی فیلد چهاربخشی است', /\{key:'policePlate',label:'پلاک انتظامی',type:'plate'/.test(modules));
check('محل یا نقطهٔ استقرار فهرست کشویی است', /\{key:'currentPlace',label:'محل یا نقطهٔ استقرار',type:'select',listKey:'deploymentLocations',searchable:false/.test(modules));
check('محل استقرار از فهرست مشترک مکان‌ها می‌آید', /deploymentLocations: 'places'/.test(modules));

// کشویی ساده بودن واقعاً سنجیده می‌شود: تابع انتخاب نوع کادر اجرا می‌شود.
const selectApi = new Function(
  [
    modules.match(/const REFERENCE_ALIASES = \{[\s\S]*?\};/)[0],
    modules.match(/const SEARCHABLE_LIST_KEYS = \[[\s\S]*?\];/)[0],
    extract('referenceBaseKey'),
    extract('isSearchableSelect')
  ].join('\n') + '\nreturn { isSearchableSelect: isSearchableSelect };'
)();
check('محل استقرار کشویی ساده است، نه پنل جستجو',
  selectApi.isSearchableSelect({ type: 'select', listKey: 'deploymentLocations', searchable: false }) === false);
check('بدون searchable:false همان فهرست پنل جستجو می‌گرفت',
  selectApi.isSearchableSelect({ type: 'select', listKey: 'deploymentLocations' }) === true);
// ── راهبر اصلی و راهبران فرعی به‌جای سرنشینان ──
check('فیلد «سرنشینان فعلی» حذف شده است', !/key:'occupants'/.test(modules));
check('راهبر اصلی از بین کارمندان انتخاب می‌شود', /\{key:'mainDriver',label:'راهبر اصلی این خودرو',type:'select',source:'employees'\}/.test(modules));
check('راهبران فرعی از بین کارمندان چک‌مارک می‌شوند', /\{key:'secondaryDrivers',label:'راهبران فرعی',type:'multi-check',source:'employees'/.test(modules));
check('نام راهبر از شناسهٔ کارمند خوانده می‌شود', /function employeeLabelById\(id\)/.test(modules) && /function employeeLabelsByIds\(ids\)/.test(modules));
check('وضعیت فعلی خودرو راهبر اصلی و فرعی را نشان می‌دهد', /vtabFact\('راهبر اصلی', employeeLabelById\(vehicle\.mainDriver\)\)/.test(modules) && /vtabFact\('راهبران فرعی', employeeLabelsByIds\(vehicle\.secondaryDrivers\)\)/.test(modules));

check('کادر پلاک چهار بخش دارد', /data-plate-part="' \+ key/.test(modules) && /data-plate-part="letter"/.test(modules));
check('کادر پلاک از چپ به راست چیده می‌شود', /data-plate-field="' \+ esc\(field\.key\) \+ '" dir="ltr"/.test(modules));
check('فرم مقدار چهار بخش را در یک رشته جمع می‌کند', /field\.type==='plate'/.test(modules) && /data\[field\.key\]=plateText\(parts\)/.test(modules));
check('پلاک ناقص ذخیره نمی‌شود', /پلاک انتظامی باید کامل باشد/.test(modules));
check('جدول پلاک را با رقم فارسی نشان می‌دهد', /field\.type === 'plate'\) return esc\(plateLabel\(value\)\)/.test(modules));
check('پروندهٔ خودرو پلاک را با رقم فارسی نشان می‌دهد', /vtabFact\('پلاک انتظامی', plateLabel\(vehicle\.policePlate/.test(modules));
check('کادر پلاک در styles.css استایل دارد', /\.module-plate\{/.test(styles) && /\.module-plate-letter\{/.test(styles));
check('بخش‌های پلاک عرض ثابت خودشان را دارند (نه ۱۰۰٪)', /\.module-field \.module-plate \.module-plate-part\{[^}]*width:52px/.test(styles));

// ── اعلان خودرو: فقط وضعیت عملیاتی ──
check('وضعیت‌های خارج از سرویس تعریف شده‌اند', /const VEHICLE_OUT_OF_SERVICE_STATUSES = \['خارج از سرویس', 'در تعمیر'\]/.test(modules));
check('اعلان خودرو بر پایهٔ وضعیت عملیاتی است', /VEHICLE_OUT_OF_SERVICE_STATUSES\.indexOf\(operationalStatus\) >= 0/.test(modules));
check('وضعیت سلامت دیگر اعلان خودرو نمی‌سازد', !/vehicle\.healthStatus === 'دارای نقص'/.test(modules));

const failed = checks.filter(c => !c.ok);
checks.forEach(c => console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

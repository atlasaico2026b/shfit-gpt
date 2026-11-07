// بررسی فایل دادهٔ نمونهٔ تست (demo/atlas-shift-demo-10.json)
// - هر بخش دقیقاً ۱۰ آیتم
// - شناسه‌ها یکتا و ارجاع‌ها به رکوردهای همین فایل درست
// - قالب تاریخ‌ها همان چیزی که برنامه ذخیره می‌کند
// - این پوشه هیچ ارجاعی در کد اصلی برنامه ندارد
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'demo/atlas-shift-demo-10.json');
const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
const data = payload.data || {};

const MODULES = ['employees', 'missions', 'leaves', 'vehicles', 'stations', 'gasmeters', 'notes', 'programs', 'faults', 'maintenance', 'gaslogs'];

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra || '' });

check('فایل با شناسهٔ برنامه شروع می‌شود', payload.app === 'ATLAS SHIFT');
check('نسخهٔ ساختار ۲ است', payload.data && payload.data.schemaVersion === 2 && payload.schemaVersion === 2);
check('پرچم نمونه دارد', payload.demo === true);

MODULES.forEach(key => {
  check('«' + key + '» آرایه با ۱۰ آیتم', Array.isArray(data[key]) && data[key].length === 10, data[key] ? data[key].length : 'ندارد');
});
check('برنامهٔ شیفت‌ها ۱۰ آیتم', Array.isArray(data.shifts) && data.shifts.length === 10, (data.shifts || []).length);
check('سوابق (تاریخچه) ۱۰ سطر', Array.isArray(data.history) && data.history.length === 10, (data.history || []).length);

// ── شناسه‌ها ──
const allIds = [];
MODULES.concat(['shifts']).forEach(key => (data[key] || []).forEach(item => allIds.push(String(item.id))));
check('همهٔ رکوردها شناسه دارند', allIds.every(Boolean));
check('شناسه‌ها یکتا هستند', new Set(allIds).size === allIds.length, allIds.length + ' شناسه / ' + new Set(allIds).size + ' یکتا');
check('شناسه‌ها با پیشوند demo- شروع می‌شوند', allIds.every(id => id.startsWith('demo-')));

// ── ارجاع‌ها ──
const idsOf = key => new Set((data[key] || []).map(item => String(item.id)));
const employeeIds = idsOf('employees');
const vehicleIds = idsOf('vehicles');
const gasmeterIds = idsOf('gasmeters');

const refs = [];
(data.leaves || []).forEach(r => refs.push(['مرخصی.کارمند', employeeIds.has(String(r.employeeId))]));
(data.missions || []).forEach(r => {
  refs.push(['مأموریت.کارمند', employeeIds.has(String(r.employeeId))]);
  refs.push(['مأموریت.همراهان', (r.crewIds || []).every(id => employeeIds.has(String(id)))]);
  refs.push(['مأموریت.خودرو', (r.vehicleIds || []).every(id => vehicleIds.has(String(id)))]);
});
(data.maintenance || []).forEach(r => refs.push(['سرویس.خودرو', vehicleIds.has(String(r.vehicleId))]));
(data.faults || []).forEach(r => refs.push(['اشکال.خودرو', vehicleIds.has(String(r.vehicleId))]));
(data.gaslogs || []).forEach(r => refs.push(['سابقهٔ گازسنج.دستگاه', gasmeterIds.has(String(r.gasmeterId))]));
(data.gasmeters || []).forEach(r => refs.push(['گازسنج.مسئول', employeeIds.has(String(r.responsibleId))]));
(data.programs || []).forEach(r => refs.push(['برنامه.مسئول', employeeIds.has(String(r.responsibleId)) && employeeIds.has(String(r.reportWriterId))]));
(data.notes || []).forEach(r => refs.push(['یادداشت.مسئول', employeeIds.has(String(r.responsibleId))]));
(data.shifts || []).forEach(r => refs.push(['شیفت.کارکنان', (r.employeeIds || []).length > 0 && r.employeeIds.every(id => employeeIds.has(String(id)))]));
const badRefs = refs.filter(pair => !pair[1]).map(pair => pair[0]);
check('ارجاع‌ها همه به رکوردهای همین فایل وصل‌اند', badRefs.length === 0, badRefs.slice(0, 5).join(', '));

// ── تاریخ‌ها ──
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const isoDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
// فقط کلیدهایی که واقعاً تاریخ‌اند بررسی می‌شوند؛ فیلدهای متنی مثل maintenanceLog
// هم تاریخ دارند ولی متن آزادند و قالبشان «تاریخ | توضیح» است.
const DATE_KEYS = /(date|at|locationSince|expectedReturn|actualReturn|calibrationStart|calibrationEnd)$/i;
const badDates = [];
function scanDates(value, key, where) {
  if (typeof value === 'string' && DATE_KEYS.test(key) && value && !isoDate.test(value) && !isoDateTime.test(value)) {
    badDates.push(where + '=' + value);
  }
  if (Array.isArray(value)) value.forEach((item, index) => scanDates(item, key, where + '[' + index + ']'));
  else if (value && typeof value === 'object') Object.keys(value).forEach(k => scanDates(value[k], k, where + '.' + k));
}
MODULES.forEach(key => scanDates(data[key], key, key));
check('تاریخ‌ها به قالب ذخیره‌سازی برنامه‌اند', badDates.length === 0, badDates.slice(0, 5).join(', '));

// ── فیلدهای کلیدی هر بخش ──
const required = {
  employees: ['firstName', 'lastName', 'jobTitle', 'employmentType', 'workType'],
  missions: ['employeeId', 'title', 'missionType', 'status', 'startAt'],
  leaves: ['employeeId', 'leaveType', 'startDate', 'endDate', 'status'],
  vehicles: ['name', 'status'],
  stations: ['name', 'placeType', 'place'],
  gasmeters: ['code', 'serial', 'status', 'calibrationEnd'],
  notes: ['title', 'actionType', 'date', 'status', 'body'],
  programs: ['title', 'programCategory', 'programType', 'status'],
  faults: ['title', 'priority', 'reportedAt', 'description', 'status'],
  maintenance: ['vehicleId', 'date', 'type', 'description', 'status'],
  gaslogs: ['gasmeterId', 'date', 'logType']
};
Object.keys(required).forEach(key => {
  const missing = [];
  (data[key] || []).forEach(record => required[key].forEach(field => {
    const value = record[field];
    if (value == null || value === '') missing.push(record.id + '.' + field);
  }));
  check('فیلدهای کلیدی «' + key + '» پر است', missing.length === 0, missing.slice(0, 5).join(', '));
});

// ── بیرون بودن از کد برنامه ──
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const modulesJs = fs.readFileSync(path.join(root, 'modules.js'), 'utf8');
const preview = fs.readFileSync(path.join(root, 'shogo.preview.json'), 'utf8');
check('index.html به demo/ ارجاع ندارد', !/demo\//.test(indexHtml));
check('sw.js دادهٔ نمونه را کش نمی‌کند', !/demo\//.test(swJs));
check('modules.js دادهٔ نمونه را نمی‌شناسد', !/atlas-shift-demo/.test(modulesJs));
check('ساخت پیش‌نمایش پوشهٔ demo را کپی نمی‌کند', !/demo/.test(preview));

const failed = checks.filter(c => !c.ok);
checks.forEach(c => console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name + (c.ok || !c.extra ? '' : ' → ' + c.extra)));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
if (failed.length) process.exit(1);

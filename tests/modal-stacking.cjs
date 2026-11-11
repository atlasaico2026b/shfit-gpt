// بررسی لایه‌بندی پنجرهٔ ویرایش: فرمی که از داخل پنجرهٔ سوابق (اشکال یا سرویس
// خودرو) باز می‌شود باید روی بالاترین لایه بنشیند، نه زیر پنجرهٔ باز. علت باگ:
// فرم داخل sectionView رندر می‌شد (z-index 90 مثل خود پنجره‌ها) و چون پنجره‌های
// سوابق به انتهای body الصاق می‌شوند، ترتیب DOM باعث می‌شد فرم زیرشان بماند.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = read('modules.js');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// ── ویرایش اشکال از پنجرهٔ جزئیات ──
check('«ویرایش اشکال» وقتی پنجرهٔ سوابق اشکالات باز است، فرم را به انتهای body می‌گذارد',
  /closeFaultDetail\(\);[\s\S]{0,300}formState\.faults = \{ open: true, id: record\.id \};[\s\S]{0,320}querySelector\('\[data-fault-records-dialog\]'\)\) \{[\s\S]{0,160}insertAdjacentHTML\('beforeend', renderForm\('faults', appData\)\)/.test(modules));
check('فرمِ الصاق‌شده به body همان‌جا سالنامهٔ شمسی هم می‌گیرد',
  /querySelector\('\[data-fault-records-dialog\]'\)\) \{[\s\S]{0,160}insertAdjacentHTML\('beforeend', renderForm\('faults', appData\)\)[\s\S]{0,120}enhanceJalaliInputs\(document\.body\)/.test(modules));
check('بدون پنجرهٔ باز، همان رندر عادی بخش انجام می‌شود (رفتار قبلی حفظ شده)',
  /querySelector\('\[data-fault-records-dialog\]'\)\) \{[\s\S]{0,400}\} else \{[\s\S]{0,120}render\('faults', document\.getElementById\('sectionView'\)\)/.test(modules));

// ── ثبت/ویرایش عمومی از داخل پنجره‌های سوابق ──
check('هندلر عمومی new/edit هر سه پنجرهٔ سوابق را تشخیص می‌دهد',
  /querySelector\('\[data-service-records-dialog\],\[data-fault-records-dialog\],\[data-fault-detail-dialog\]'\)/.test(modules));
check('در آن حالت فرم به انتهای body می‌رود و سالنامه می‌گیرد',
  /querySelector\('\[data-service-records-dialog\],\[data-fault-records-dialog\],\[data-fault-detail-dialog\]'\)\)\{[\s\S]{0,200}insertAdjacentHTML\('beforeend', renderForm\(moduleKey, appData\)\)[\s\S]{0,120}enhanceJalaliInputs\(document\.body\)/.test(modules));
check('بدون پنجرهٔ باز، رندر داخل بخش می‌ماند',
  /\}else\{[\s\S]{0,80}render\(moduleKey,section\);[\s\S]{0,80}\}else if\(action==='cancel'\)/.test(modules));

// ── بسته‌شدن فرمِ body-صاق‌شده ──
check('ذخیرهٔ فرم همهٔ پنجره‌های body-صاق‌شده را صریح می‌بندد (clearDetachedModals)',
  /function clearDetachedModals\(\) \{[\s\S]{0,180}querySelectorAll\('body > \[data-modal-backdrop\]'\)\.forEach[\s\S]{0,80}node\.remove\(\)/.test(modules));
check('انصراف/Escape پنجرهٔ خارج از sectionView را مستقیم حذف می‌کند',
  /if \(backdrop && \(!host \|\| !host\.contains\(backdrop\)\)\) \{[\s\S]{0,140}backdrop\.remove\(\)/.test(modules));

// ── تازه‌شدن ردیف‌های پنجرهٔ باز پس از ذخیره ──
check('بازسازی بخش سرویس، ردیف‌های پنجرهٔ سوابق سرویس را هم تازه می‌کند',
  /renderForm\('maintenance', appData\)[\s\S]{0,600}refreshServiceRecordsDialog\(\);/.test(modules));
check('بازسازی بخش اشکالات، ردیف‌های پنجرهٔ سوابق اشکالات را هم تازه می‌کند',
  /renderForm\('faults', appData\)[\s\S]{0,600}refreshFaultRecordsDialog\(\);/.test(modules));

// ── نقاط ورود ویرایش داخل پنجره‌ها ──
check('ردیف‌های سرویس داخل پنجره، دکمهٔ ویرایش ماژولی دارند',
  /function serviceLogRow\(item\) \{[\s\S]{0,800}data-module-action="edit" data-view="maintenance"/.test(modules));
check('پنجرهٔ جزئیات اشکال دکمهٔ «ویرایش اشکال» دارد',
  /data-fault-detail-edit data-id="/.test(modules));

// ── پنجره‌های سوابق به انتهای body الصاق می‌شوند (قرارگیری فرم روی آن‌ها) ──
check('پنجرهٔ سوابق اشکالات به انتهای body می‌رود',
  /function openFaultRecordsDialog\(vehicleId\) \{[\s\S]{0,2000}document\.body\.appendChild\(backdrop\);/.test(modules));
check('پنجرهٔ سوابق سرویس به انتهای body می‌رود',
  /function openServiceRecordsDialog\(vehicleId\) \{[\s\S]{0,2000}document\.body\.appendChild\(backdrop\);/.test(modules));
check('پنجرهٔ جزئیات اشکال به انتهای body می‌رود',
  /function openFaultDetail\(faultId\) \{[\s\S]{0,2000}document\.body\.appendChild\(backdrop\);/.test(modules));

// ── الگوی مرجع: ثبت مستقیم از داخل پنجره‌ها از قبل body-صاق بود ──
check('«+ ثبت اشکال برای این خودرو» همان الگوی body-صاق را دارد',
  /\[data-fault-new\][\s\S]{0,400}insertAdjacentHTML\('beforeend', renderForm\('faults', appData\)\)/.test(modules));
check('«+ ثبت سرویس برای این خودرو» همان الگوی body-صاق را دارد',
  /closest\('\[data-service-action\]'\)[\s\S]{0,900}insertAdjacentHTML\('beforeend', renderForm\('maintenance', appData\)\)/.test(modules));

let failed = 0;
checks.forEach(function (item) {
  if (!item.ok) failed++;
  console.log((item.ok ? '✓' : '✗') + ' ' + item.name + (item.ok ? '' : '  → ' + item.extra));
});
console.log('\n' + (checks.length - failed) + '/' + checks.length + ' بررسی موفق');
if (failed) process.exit(1);

// بررسی «تاریخچهٔ اشکال» و «کارتکس سرویس»: هر اشکال باید پروندهٔ مراحل داشته
// باشد، با هر کامنت وضعیتش ثبت شود و سابقه‌اش قابل چاپ باشد.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = read('modules.js');
const css = read('design/vehicle-tabs.css');
const exportCss = read('design/modals-export.css');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// ── چرخهٔ وضعیت: از ثبت تا رفع و برگشت به سرویس ──
check('وضعیت «در سرویس» در چرخهٔ اشکال هست', /FAULT_STATUS_FLOW = \[[^\]]*'در سرویس'/.test(modules));
check('وضعیت «در سرویس» در فرم اشکال هم هست',
  /key:'status'[^\n]*faultStatuses[^\n]*'در سرویس'/.test(modules));
check('فهرست وضعیت‌ها با فهرست مرجع ادغام می‌شود', /function faultStatusOptions\(\)/.test(modules));
check('اشکال «در سرویس» باز حساب نمی‌شود',
  /function isFaultOpen\(record\)[\s\S]{0,200}'در سرویس'/.test(modules));
check('پیشرفت «در سرویس» صد درصد است',
  /record\.status === 'بسته‌شده' \|\| record\.status === 'در سرویس'\) return 100/.test(modules));

// ── پروندهٔ مراحل هر اشکال ──
check('تابع خواندن مراحل اشکال وجود دارد', /function faultTimelineEntries\(record\)/.test(modules));
check('ثبت اولیه به‌عنوان اولین مرحله می‌آید', /status: 'ثبت‌شده',[\s\S]{0,80}ثبت اولیهٔ اشکال/.test(modules));
check('رکوردهای قدیمی از فیلد روند رفع خوانده می‌شوند', /faultSteps\(record\)\.forEach/.test(modules));

// ── پنجرهٔ تاریخچه ──
check('تابع بازکردن تاریخچهٔ اشکال وجود دارد', /function openFaultDetail\(faultId\)/.test(modules));
check('تابع بستن تاریخچه وجود دارد', /function closeFaultDetail\(\)/.test(modules));
check('پنجره نقش دیالوگ و aria-modal دارد', /fault-detail-modal" role="dialog" aria-modal="true"/.test(modules));
check('پنجره عنوان قابل‌خواندن دارد', /aria-labelledby="faultDetailTitle"/.test(modules));
check('خط زمانی مراحل رندر می‌شود', /class="fault-timeline"/.test(modules));
check('فرم ثبت مرحلهٔ تازه هست', /data-fault-stage-save/.test(modules));
check('انتخاب وضعیت در فرم مرحله هست', /data-fault-stage-status/.test(modules));
check('کامنت مرحله ذخیره می‌شود', /record\.timeline = \(Array\.isArray\(record\.timeline\)/.test(modules));
check('تغییر وضعیت در سوابق ثبت می‌شود',
  /addHistory\('faults', record, 'تغییر وضعیت'/.test(modules));
check('رفع/در سرویس پیشرفت را صد می‌کند',
  /status === 'رفع شد' \|\| status === 'در سرویس' \|\| status === 'بسته‌شده'/.test(modules));

// ── چاپ و خروجی در همهٔ قالب‌ها ──
check('تابع خروجی چندقالبی تاریخچهٔ اشکال وجود دارد', /function faultHistoryExport\(record, format\)/.test(modules));
check('چاپ تاریخچه از برگهٔ چاپ مشترک استفاده می‌کند',
  /runExport\(faultHistoryExportRows\(record\)[\s\S]{0,200}format \|\| 'print'/.test(modules));
check('دکمهٔ چاپ فقط میان‌بر مسیر مشترک خروجی است',
  /function printFaultHistory\(record\) \{\s*faultHistoryExport\(record, 'print'\);\s*\}/.test(modules));
check('دکمهٔ چاپ در پنجره هست', /data-fault-detail-print/.test(modules));
check('پنجرهٔ تاریخچه منوی کامل خروجی (CSV/Excel/Word/PNG/چاپ) دارد',
  /customExportMenu\('fault-history', record\.id, 'fault'\)/.test(modules));
check('هندلر خروجی، قالب انتخابی را به تاریخچهٔ اشکال می‌رساند',
  /kind === 'fault-history'[\s\S]{0,400}faultHistoryExport\(fault, format\)/.test(modules));
check('کارت‌های اشکال دکمهٔ تاریخچه دارند', /data-fault-open="' \+ esc\(record\.id\) \+ '">تاریخچه/.test(modules));

// ── منوی خروجیِ نوار پایین پنجره‌ها باید به بالا باز شود ──
check('منوی خروجی نوار پایینِ پنجره‌ها به بالا باز می‌شود (داخل کادر می‌ماند)',
  /\.service-records-foot \.module-export-list[\s\S]{0,200}bottom:\s*calc\(100% \+ 6px\)/.test(exportCss) &&
  /\.fault-records-foot \.module-export-list[\s\S]{0,200}bottom:\s*calc\(100% \+ 6px\)/.test(exportCss) &&
  /\.fault-detail-foot \.module-export-list[\s\S]{0,100}bottom:\s*calc\(100% \+ 6px\)/.test(exportCss));

// ── کارتکس سرویس ──
check('تابع ساخت ردیف‌های کارتکس وجود دارد', /function serviceCardexRows\(vehicle\)/.test(modules));
check('کارتکس کیلومتر سرویس بعدی را دارد', /'کیلومتر سرویس بعدی'/.test(modules));
check('تابع چاپ کارتکس وجود دارد', /function printServiceCardex\(vehicle\)/.test(modules));
check('دکمهٔ چاپ کارتکس در پنجرهٔ سرویس هست', /data-service-cardex=/.test(modules));

// ── پنجرهٔ سوابق اشکالات هر خودرو (پاپ‌آپ، الگوی سوابق سرویس) ──
check('تابع بازکردن پنجرهٔ سوابق اشکالات خودرو وجود دارد', /function openFaultRecordsDialog\(vehicleId\)/.test(modules));
check('تابع تازه‌سازی پنجرهٔ سوابق اشکالات وجود دارد', /function refreshFaultRecordsDialog\(\)/.test(modules));
check('تابع بستن پنجرهٔ سوابق اشکالات وجود دارد', /function closeFaultRecordsDialog\(\)/.test(modules));
check('کلیک روی خودرو در تب اشکالات پنجره را باز می‌کند',
  /openFaultRecordsDialog\(entityOpen\.dataset\.vtabOpen \|\| ''\);\s*\n\s*return;/.test(modules));
check('کلیک روی خودرو دیگر به صفحهٔ جدا نمی‌رود',
  !/faultVehicleId/.test(modules) && !/function renderFaultVehicle\(/.test(modules));
check('دکمهٔ بازگشت تمام‌صفحه حذف شده است', !/data-vtab-back/.test(modules));
check('پنجرهٔ سوابق اشکالات نقش دیالوگ و aria-modal دارد', /fault-records-modal" role="dialog" aria-modal="true"/.test(modules));
check('پنجرهٔ سوابق اشکالات عنوان قابل‌خواندن دارد', /aria-labelledby="faultRecordsTitle"/.test(modules));
check('پنجرهٔ سوابق اشکالات دکمهٔ بستن دارد', /data-fault-records-close/.test(modules));
check('پنجرهٔ سوابق اشکالات دکمهٔ ثبت اشکال برای همان خودرو دارد',
  /data-fault-new data-vehicle="' \+ esc\(vehicle\.id\) \+ '">\+ ثبت اشکال برای این خودرو/.test(modules));
check('پنجرهٔ سوابق اشکالات خروجی همان خودرو را دارد', /customExportMenu\('faults-vehicle', wanted, 'vehicle'\)/.test(modules));
check('دکمهٔ بستن پنجرهٔ سوابق اشکالات را می‌بندد', /closest\('\[data-fault-records-close\]'\)/.test(modules));
check('کلیک روی پس‌زمینه پنجرهٔ سوابق اشکالات را می‌بندد', /matches\('\[data-fault-records-dialog\]'\)/.test(modules));
check('Escape پنجرهٔ سوابق اشکالات را می‌بندد',
  /document\.querySelector\('\[data-fault-records-dialog\]'\)\) closeFaultRecordsDialog\(\)/.test(modules));
check('تغییر زیرتب پنجرهٔ سوابق اشکالات را می‌بندد', /if \(vehicleTab !== 'history'\) closeFaultRecordsDialog\(\);/.test(modules));
check('رندر دوبارهٔ تب اشکالات، پنجره را تازه می‌کند',
  /refreshFaultRecordsDialog\(\);\s*\}\s*\n\s*\/\/ ── پنجرهٔ سوابق اشکالات/.test(modules));
check('عرض پنجرهٔ سوابق اشکالات با سایر پنجره‌ها هم‌اندازه است (۹۸۰px)',
  /\.fault-records-modal\s*\{[^}]*width:\s*min\(980px, 100%\)/.test(css));
check('نوار دکمه‌های پایین پنجرهٔ سوابق اشکالات ثابت است', /\.fault-records-foot\s*\{[^}]*flex:\s*0 0 auto/.test(css));
check('اطلاعات خودرو در پنجرهٔ اشکالات چهارتایی می‌نشیند',
  /\.fault-records-modal \.vtab-facts-wide\s*\{\s*grid-template-columns:\s*repeat\(4/.test(css));
check('کارت‌های آماری پنجرهٔ اشکالات در گوشی دوستونی می‌شوند',
  /@media \(max-width: 640px\)[\s\S]*?\.fault-records-modal \.stat-row\s*\{\s*grid-template-columns:\s*repeat\(2/.test(css));

// ── بستن با Escape و پس‌زمینه ──
check('Escape تاریخچه را می‌بندد',
  /event\.key !== 'Escape'[\s\S]{0,200}closeFaultDetail\(\)/.test(modules));
check('کلیک روی پس‌زمینه تاریخچه را می‌بندد',
  /event\.target === detail\) \{ closeFaultDetail\(\)/.test(modules));

// ── استایل ──
check('استایل خط زمانی در CSS هست', /\.fault-timeline\b/.test(css));
check('استایل فرم مرحله در CSS هست', /\.fault-stage-grid\b/.test(css));
check('خط زمانی در گوشی تک‌ستونه می‌شود', /@media \(max-width: 640px\)[\s\S]{0,200}\.fault-stage-grid \{\s*grid-template-columns: 1fr/.test(css));

// ── عنوان صفحه ──
check('عنوان صفحه «سوابق اشکالات خودرو» است (نه «خودروها»)',
  /pageHead\('سوابق <span style="color:var\(--tone-7\)">اشکالات خودرو<\/span>'/.test(modules));
check('عنوان خروجی هم «سوابق اشکالات خودرو» است',
  /'سوابق اشکالات خودرو · ATLAS SHIFT'/.test(modules));

const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log((c.ok ? '✓' : '✗') + ' ' + c.name + (c.ok ? '' : '  → ' + c.extra)));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

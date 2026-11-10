// بررسی «تاریخچهٔ اشکال» و «کارتکس سرویس»: هر اشکال باید پروندهٔ مراحل داشته
// باشد، با هر کامنت وضعیتش ثبت شود و سابقه‌اش قابل چاپ باشد.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = read('modules.js');
const css = read('design/vehicle-tabs.css');

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

// ── چاپ ──
check('تابع چاپ تاریخچهٔ اشکال وجود دارد', /function printFaultHistory\(record\)/.test(modules));
check('چاپ تاریخچه از برگهٔ چاپ مشترک استفاده می‌کند',
  /runExport\(faultHistoryExportRows\(record\)[\s\S]{0,200}'print'/.test(modules));
check('دکمهٔ چاپ در پنجره هست', /data-fault-detail-print/.test(modules));
check('کارت‌های اشکال دکمهٔ تاریخچه دارند', /data-fault-open="' \+ esc\(record\.id\) \+ '">تاریخچه/.test(modules));

// ── کارتکس سرویس ──
check('تابع ساخت ردیف‌های کارتکس وجود دارد', /function serviceCardexRows\(vehicle\)/.test(modules));
check('کارتکس کیلومتر سرویس بعدی را دارد', /'کیلومتر سرویس بعدی'/.test(modules));
check('تابع چاپ کارتکس وجود دارد', /function printServiceCardex\(vehicle\)/.test(modules));
check('دکمهٔ چاپ کارتکس در پنجرهٔ سرویس هست', /data-service-cardex=/.test(modules));

// ── بستن با Escape و پس‌زمینه ──
check('Escape تاریخچه را می‌بندد',
  /event\.key !== 'Escape'[\s\S]{0,200}closeFaultDetail\(\)/.test(modules));
check('کلیک روی پس‌زمینه تاریخچه را می‌بندد',
  /event\.target === detail\) \{ closeFaultDetail\(\)/.test(modules));

// ── استایل ──
check('استایل خط زمانی در CSS هست', /\.fault-timeline\b/.test(css));
check('استایل فرم مرحله در CSS هست', /\.fault-stage-grid\b/.test(css));
check('خط زمانی در گوشی تک‌ستونه می‌شود', /@media \(max-width: 640px\)[\s\S]{0,200}\.fault-stage-grid \{\s*grid-template-columns: 1fr/.test(css));

const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log((c.ok ? '✓' : '✗') + ' ' + c.name + (c.ok ? '' : '  → ' + c.extra)));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

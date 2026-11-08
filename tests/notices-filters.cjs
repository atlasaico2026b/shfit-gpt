// بررسی ساختاری اعلان‌ها، فیلترهای فهرست و گزارش بازه.
// این آزمون کد اجرا نمی‌کند؛ فقط تضمین می‌کند صاحب‌های هر ویژگی سر جایشان بمانند
// و قواعدی که در README/AGENTS ثبت شده‌اند در فایل‌ها موجود باشند.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const modules = read('modules.js');
const app = read('app.js');
const index = read('index.html');
const sw = read('sw.js');
const noticesCss = read('design/notices.css');
const toolbarsCss = read('design/toolbars.css');
const themeTwo = read('design/skins/theme-two.css');
const settingsView = read('design/settings-view.css');
const newUi = read('design/new-ui.css');
const spectrumCss = read('design/spectrum.css');
const tokens = read('design/tokens.css');

const checks = [];
const check = (name, ok) => checks.push({ name, ok: !!ok });

// ── اعلان‌ها: یک صاحب CSS و رنگ روشن در همهٔ پوسته‌ها ──
check('notices.css ساخته و در index.html بارگذاری شده', index.includes('./design/notices.css'));
check('notices.css آخرین شیت ظاهری است', index.indexOf('./design/notices.css') > index.indexOf('./design/new-ui.css'));
check('notices.css کارت را روشن و پرتضاد نگه می‌دارد', /--notice-paper/.test(noticesCss) && /color:\s*var\(--notice-ink\)/.test(noticesCss));
check('کارت اعلان جهت راست‌به‌چپ صریح دارد', /direction:\s*rtl/.test(noticesCss));
check('پوستهٔ دوم دیگر کارت اعلان را تیره نمی‌کند', !/\.notice-card\{background:linear-gradient\(135deg,rgba\(13,38,86/.test(themeTwo));
check('کارت اعلان در settings-view.css رنگ‌آمیزی نمی‌شود', !/\.notice-card\[data-kind\]\s*\{/.test(settingsView));
check('new-ui.css رنگ کارت اعلان را با !important عوض نمی‌کند', !/\.notice-card\s*\{[\s\S]{0,200}background:[^;]*!important/.test(newUi));
check('توکن‌های سطح اعلان تعریف شده‌اند', ['--notice-paper', '--notice-ink', '--notice-ink-soft', '--notice-line'].every(t => tokens.includes(t)));

// ── اعلان‌ها: کارت فشرده + پنجرهٔ جزئیات + کامنت ──
check('کارت اعلان کلید اعلان را حمل می‌کند', /data-alert-key=/.test(modules));
check('کلیک روی کارت پنجرهٔ جزئیات را باز می‌کند', /function openNoticeDialog/.test(modules) && /openNoticeDialog\(noticeAlertIndex\[key\]\)/.test(modules));
check('پنجرهٔ جزئیات دکمهٔ کامنت دارد', /data-notice-comment/.test(modules) && /openCommentDialog\(moduleKey, alert\.recordId\)/.test(modules));
check('اعلان‌های خوانده‌نشده گروه خالی جا نمی‌گذارند', /notice-group/.test(app) && /notice-card/.test(app));
check('کارت اعلان با صفحه‌کلید هم باز می‌شود', /event\.key !== 'Enter'/.test(modules) && /notice-card/.test(modules));

// ── فیلترها: هر بخش فیلتر خودش را دارد، نه فقط وضعیت ──
check('جدول فیلترهای هر بخش وجود دارد', /const LIST_FILTERS = \{/.test(modules));
check('مأموریت‌ها فیلتر مکان/شهر و فرد دارند', /key: 'placeField'/.test(modules) && /key: 'place'/.test(modules) && /key: 'employeeId'/.test(modules));
check('مرخصی‌ها فیلتر فرد و نوع دارند', /leaves: \[\s*\{ key: 'employeeId'/.test(modules));
check('فیلترها روی رکورد اعمال می‌شوند', /function recordMatchesFilters/.test(modules) && /recordMatchesFilters\(moduleKey, record, data\)/.test(modules));
check('کنترل کمکی (مکان) خودش داده را فیلتر نمی‌کند', /filter\.control/.test(modules));
check('تغییر «مکان» شهر انتخاب‌شده را پاک می‌کند', /if \(key === 'placeField'\) delete state\.place/.test(modules));
check('پاک‌کردن فیلترها همهٔ فیلترها را برمی‌دارد', /clearModuleFilters\(moduleKey\)/.test(modules));
check('ردیف فیلترها با چند فیلتر می‌پیچد', /flex-wrap: wrap/.test(toolbarsCss));

// ── مرتب‌سازی مأموریت‌ها ──
check('مرتب‌سازی با نام فرد مأمور موجود است', /\['name', 'نام فرد مأمور'\]/.test(modules));
check('نام فرد برای مأموریت/مرخصی از پروندهٔ کارمند خوانده می‌شود', /moduleKey === 'missions' \|\| moduleKey === 'leaves'/.test(modules));
check('مرتب‌سازی با مبدأ و محدودهٔ عملیاتی هست', /\['origin', 'مبدأ'\]/.test(modules) && /\['operationalRange', 'محدودهٔ عملیاتی'\]/.test(modules));

// ── مرتب‌سازی مرخصی‌ها با نام ──
check('مرخصی‌ها مرتب‌سازی با نام و نام خانوادگی دارد', /\['name', 'نام و نام خانوادگی'\]/.test(modules));
check('مرخصی‌ها مرتب‌سازی جدا با نام و نام خانوادگی دارد', /\['firstName', 'نام'\]/.test(modules) && /\['lastName', 'نام خانوادگی'\]/.test(modules));
check('نام/نام خانوادگی از پروندهٔ کارمند خوانده می‌شود', /key === 'firstName' \|\| key === 'lastName'/.test(modules));

// ── گزارش افراد در بازه ──
check('محاسبهٔ گزارش بازه وجود دارد', /function rangeReportData/.test(modules) && /function openRangeReport/.test(modules));
check('دکمهٔ گزارش فقط در بخش پرسنل ساخته می‌شود', /moduleKey === 'employees'[\s\S]{0,220}data-module-action="range-report"/.test(modules));
check('دکمهٔ گزارش از داشبورد برداشته شده', !index.includes('data-module-action="range-report"'));
check('پنجرهٔ گزارش دو تب مرخصی و مأموریت دارد', /key: 'leaves', label: 'مرخصی‌ها'/.test(modules) && /key: 'missions', label: 'مأموریت‌ها'/.test(modules) && /data-range-tab=/.test(modules));
check('هر تب فقط موارد خودش را نشان می‌دهد', /tab === 'leaves' \? report\.leaves : report\.missions/.test(modules));
check('بازهٔ زمانی بالای پنجرهٔ گزارش قابل تغییر است', /data-range-from/.test(modules) && /data-range-to/.test(modules) && /data-range-apply/.test(modules));
check('بازه‌های آماده (امروز، ۳ روزه، ۷ روزه، ۱ ماهه…) در پنجرهٔ گزارش هست', /RANGE_REPORT_PRESETS/.test(modules) && /data-range-preset=/.test(modules) && /key: 'week', label: '۷ روزه'/.test(modules) && /key: 'month', label: '۱ ماهه'/.test(modules));
check('بدنهٔ پنجرهٔ گزارش اسکرول می‌خورد', /\.atlas-modal-range-report \.atlas-modal-body\s*\{[\s\S]{0,120}overflow-y:\s*auto/.test(read('design/modals-export.css')));
check('گزارش از بازهٔ انتخاب‌شدهٔ داشبورد استفاده می‌کند', /dashboardRange\.start/.test(modules) && /dashboardRange\.end/.test(modules));
check('همراهان مأموریت هم شمرده می‌شوند', /mission\.crewIds\.forEach/.test(modules));
check('مرخصی ردشده در گزارش نمی‌آید', /leave\.status === 'ردشده'/.test(modules));
check('خروجی گزارش با runExport ساخته می‌شود', /runExport\(pack\.rows,/.test(modules) && /function rangeReportExport/.test(modules));
check('دکمهٔ گزارش به handler وصل است', /openRangeReport\(\)/.test(modules));

// ── خروجی برابر با چیزی که دیده می‌شود ──
check('خروجی بخش از فهرست دیده‌شده ساخته می‌شود', /function visibleRecordsFor/.test(modules) && /visibleRecordsFor\(moduleKey\)\.forEach/.test(modules));
check('خروجی جست‌وجو/فیلتر/مرتب‌سازی را رعایت می‌کند', /return recordsForView\(moduleKey, appData\);/.test(modules));
check('خروجی برنامه‌ها فیلتر دسته را رعایت می‌کند', /moduleKey === 'programs'[\s\S]{0,200}programFilter/.test(modules));
check('خروجی اشکالات فیلتر وضعیت را رعایت می‌کند', /moduleKey === 'faults'[\s\S]{0,200}faultFilter/.test(modules));
check('خروجی گازسنج‌ها فیلتر و ترتیب صفحه را رعایت می‌کند', /moduleKey === 'gasmeters'\) return visibleGasMeters\(\)/.test(modules));
check('عنوان خروجی وضعیت فیلتر را نشان می‌دهد', /function moduleExportTitle/.test(modules) && /فیلترشده \(/.test(modules));
check('چاپ فهرست هم از عنوان فیلترشده استفاده می‌کند', /printRows\(moduleExportRows\(moduleKey\), moduleExportTitle\(moduleKey\)\)/.test(modules));
check('خروجی برنامهٔ شیفت‌ها همان ترتیب جدول روی صفحه را دارد', /sortRecords\('shifts', appData\.shifts \|\| \[\]\)\.forEach/.test(modules));
check('منوی خروجی تعداد و ترتیب فهرست دیده‌شده را نشان می‌دهد', /function exportMenuSummary/.test(modules) && /خروجی از همین فهرست: /.test(modules) && /exportMenuSummary\(moduleKey\)/.test(modules));

// ── مرتب‌سازی فقط از سرستون جدول ──
check('کنترل مرتب‌سازی/جهت از نوار فیلترها برداشته شده', !/renderSortControls/.test(modules) && !/data-module-sort/.test(modules));
check('نوار فیلترها فقط فیلتر و شمارش دارد', /role="group" aria-label="فیلترها"/.test(modules) && /renderFilterControls\(moduleKey\)/.test(modules));
check('مرتب‌سازی از سرستون جدول انجام می‌شود', /data-sort-key/.test(modules) && /setListSort\(moduleKey, \{ key: key, direction: 'asc' \}\)/.test(modules));
check('کلیک دوباره روی سرستون جهت را عوض می‌کند', /current\.key === key\) setListSort\(moduleKey, \{ direction: current\.direction === 'asc' \? 'desc' : 'asc' \}\)/.test(modules));

// ── دفترچه تلفن: نوار فیلتر فقط فیلتر دارد، نه مرتب‌سازی/جهت ──
check('دفترچه تلفن قرص مرتب‌سازی/جهت ندارد', !/atlasPbSortBy/.test(app) && !/atlasPbSortDirection/.test(app) && !/list-chip-sort/.test(app) && !/list-chip-dir/.test(app));
check('نوار فیلتر دفترچه تلفن فقط فیلترها را دارد', /aria-label="فیلترها"/.test(app) && /atlasPbCityFilter/.test(app) && /atlasPbStationFilter/.test(app));
check('فهرست دفترچه تلفن الفبایی بر اساس نام مرتب می‌شود', /found\.sort\(\(a,b\)=>String\(a\.c\.name/.test(app));

// ── منوی خروجی: کلیک بیرون آن را می‌بندد ──
check('منوی خروجی با کلیک بیرون بسته می‌شود', /function closeExportMenus/.test(modules) && /event\.target\.closest\('\[data-export-menu\]'\)\) return;\s*closeExportMenus\(\)/.test(modules));
check('منوی خروجی با Escape هم بسته می‌شود', /event\.key === 'Escape'\) closeExportMenus\(\)/.test(modules));

// ── ستون تیک جدول: کلید کشویی ۴۰px باید در ستون جا شود ──
check('ستون تیک جدول به‌اندازهٔ کلید کشویی جا دارد', /\.module-check-cell\s*\{[^}]*min-width:\s*48px/.test(spectrumCss) && /\.module-check-cell\s*\{[^}]*width:\s*48px/.test(spectrumCss));
check('کلید کشویی ۴۰px است', /input\[type="checkbox"\]:not\(\.nu-keep-native\)\s*\{[^}]*width:\s*40px/.test(newUi));

// ── کش آفلاین ──
check('notices.css در فهرست پیش‌کش سرویس‌ورکر است', sw.includes('./design/notices.css'));

const failed = checks.filter(c => !c.ok);
checks.forEach(c => console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

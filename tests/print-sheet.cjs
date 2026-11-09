// بررسی برگهٔ چاپ فهرست‌ها: عنوان، تناسب ستون‌ها، ساخت HTML و قواعد print.css
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'design/print-sheet.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'design/print.css'), 'utf8');

global.window = global;
new Function('window', src)(globalThis);
const sheet = globalThis.AtlasPrintSheet;
if (!sheet) throw new Error('AtlasPrintSheet صادر نشد');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra || '' });

// ── عنوان: نام موضوع، بدون پسوند سازمان ──
check('عنوان «مرخصی‌ها» بدون تغییر', sheet.subject('مرخصی‌ها · ATLAS SHIFT') === 'مرخصی‌ها', sheet.subject('مرخصی‌ها · ATLAS SHIFT'));
check('عنوان «مأموریت‌ها»', sheet.subject('مأموریت‌ها · ATLAS SHIFT') === 'مأموریت‌ها');
check('عنوان «خودروها»', sheet.subject('خودروها · ATLAS SHIFT') === 'خودروها');
check('عنوان «گازسنج‌ها»', sheet.subject('گازسنج‌ها · ATLAS SHIFT') === 'گازسنج‌ها');
check('نام شخص در عنوان می‌ماند', sheet.subject('سوابق مرخصی · علی رضایی · ATLAS SHIFT') === 'سوابق مرخصی · علی رضایی', sheet.subject('سوابق مرخصی · علی رضایی · ATLAS SHIFT'));
check('پلاک در عنوان می‌ماند', sheet.subject('سوابق سرویس خودرو · ۱۲ب۳۴۵ · ATLAS SHIFT') === 'سوابق سرویس خودرو · ۱۲ب۳۴۵');
check('بدون پسوند هم درست است', sheet.subject('کارکنان') === 'کارکنان');
check('عنوان خالی جایگزین می‌گیرد', sheet.subject('', 'فهرست') === 'فهرست');

// ── تناسب با تعداد ستون ──
check('ستون کم → normal', sheet.densityFor(5) === 'normal');
check('۹ ستون → compact', sheet.densityFor(9) === 'compact');
check('۱۲ ستون → compact', sheet.densityFor(12) === 'compact');
check('۱۳ ستون → tight', sheet.densityFor(13) === 'tight');

// ── ساخت برگه ──
const rows = [
  ['نام', 'واحد', 'وضعیت'],
  ['علی رضایی', 'بهره‌برداری', 'فعال'],
  ['سارا محمدی', 'مالی'] // ستون کم‌تر از سرستون‌ها
];
const html = sheet.build(rows, { title: 'کارکنان · ATLAS SHIFT', stamp: '۱۴۰۵/۰۸/۱۶ — ۱۰:۲۰' });

check('عنوان درشت h1 دارد', /<h1 class="atlas-print-title">کارکنان<\/h1>/.test(html), html.slice(0, 120));
check('پسوند سازمان از عنوان حذف شده', !/ATLAS SHIFT<\/h1>/.test(html));
check('سطر تاریخ و تعداد ردیف', /تاریخ تهیه: ۱۴۰۵\/۰۸\/۱۶ — ۱۰:۲۰/.test(html) && /۲ ردیف/.test(html));
check('جدول شبکه‌دار با کلاس چاپ', /<table class="atlas-print-table"/.test(html));
check('سرستون‌ها th با scope', (html.match(/<th scope="col">/g) || []).length === 3);
check('سطر ناقص با خانهٔ خالی کامل می‌شود', /<tr><td>سارا محمدی<\/td><td>مالی<\/td><td><\/td><\/tr>/.test(html), html.match(/<tr><td>سارا محمدی.*?<\/tr>/)[0]);
check('هیچ سطر یا ستون اضافه تولید نمی‌شود', (html.match(/<th /g) || []).length === 3 && (html.match(/<tr><td>/g) || []).length === 2);

// ── سربرگ و حاشیهٔ صفحه در thead/tfoot تکرار می‌شوند ──
check('سربرگ داخل thead است تا در هر صفحه تکرار شود', /<thead>[\s\S]*<header class="atlas-print-head">[\s\S]*<\/thead>/.test(html));
check('سطر فاصلهٔ بالای صفحه در thead', /<thead><tr class="atlas-print-pad"><td colspan="3"><\/td><\/tr>/.test(html));
check('سطر فاصلهٔ پایین صفحه در tfoot', /<tfoot><tr class="atlas-print-pad atlas-print-pad-bottom"><td colspan="3"><\/td><\/tr><\/tfoot>/.test(html));
check('سرستون‌ها بعد از سربرگ می‌آیند', html.indexOf('atlas-print-head-row') < html.indexOf('atlas-print-cols'));

const empty = sheet.build([['نام', 'واحد']], { title: 'مرخصی‌ها' });
check('فهرست خالی پیام فارسی می‌دهد', /موردی برای نمایش ثبت نشده است/.test(empty) && /colspan="2"/.test(empty));

const injected = sheet.build([['عنوان'], ['<script>alert(1)</script>']], { title: '<b>x</b>' });
check('متن سلول escape می‌شود', !/<script>/.test(injected), '');
check('عنوان هم escape می‌شود', /&lt;b&gt;x&lt;\/b&gt;/.test(injected));

// ── راهنمای شیفت و ستون‌های عمودی ──
const withLegend = sheet.build([['نام', '۱', '۲'], ['علی', 'روزکار', '–']], {
  title: 'تقویم شیفت', legend: 'راهنما: روزکار ۰۸:۰۰–۱۴:۰۰'
});
check('راهنما بالای سرستون‌ها می‌آید',
  /<p class="atlas-print-legend">راهنما: روزکار ۰۸:۰۰–۱۴:۰۰<\/p>/.test(withLegend) &&
  withLegend.indexOf('atlas-print-legend') < withLegend.indexOf('atlas-print-cols'));
check('بدون راهنما، سطر راهنما ساخته نمی‌شود', !/atlas-print-legend/.test(html));

const vertical = sheet.build([['نام', '۱', '۲', '۳'], ['علی', 'الف', 'ب', 'ج']], {
  title: 'تقویم', verticalFrom: 1
});
check('جدول با ستون عمودی نشانه‌گذاری می‌شود', /data-vertical="1"/.test(vertical));
check('ستون‌های اطلاعاتی افقی می‌مانند', /<th scope="col">نام<\/th>/.test(vertical));
check('ستون‌های روز کلاس عمودی می‌گیرند',
  (vertical.match(/class="atlas-print-vert"/g) || []).length >= 3, vertical);
check('بدون verticalFrom ستون عمودی ساخته نمی‌شود', !/atlas-print-vert/.test(html));

// ── صفت عمودی باید روی خودِ برگه بنشیند، نه فقط روی جدول ──
// قواعد print.css با #atlasPrintArea[data-vertical="1"] نوشته شده‌اند؛ اگر
// render این صفت را روی برگه نگذارد، ستون‌ها افقی می‌مانند و فونت به‌هم می‌ریزد.
function fakeHost() {
  return {
    attrs: {},
    innerHTML: '',
    setAttribute: function (key, value) { this.attrs[key] = String(value); },
    removeAttribute: function (key) { delete this.attrs[key]; }
  };
}
const verticalHost = fakeHost();
sheet.render(verticalHost, [['نام', '۱', '۲'], ['علی', 'روز', 'شب']], { title: 'تقویم', verticalFrom: 1 });
check('صفت data-vertical روی برگهٔ چاپ ست می‌شود', verticalHost.attrs['data-vertical'] === '1', JSON.stringify(verticalHost.attrs));
check('برگهٔ چاپ کلاس عمودی را در HTML دارد', /atlas-print-vert/.test(verticalHost.innerHTML));

const plainHost = fakeHost();
sheet.render(plainHost, [['نام', 'وضعیت'], ['علی', 'فعال']], { title: 'کارکنان' });
check('برگهٔ بدون ستون عمودی صفت data-vertical ندارد', !('data-vertical' in plainHost.attrs), JSON.stringify(plainHost.attrs));

// ── تشخیص خودکار: وقتی ستون‌ها در عرض A4 جا نشوند، ستون‌های کوتاه عمودی می‌شوند ──
const calendarSheet = [['کارمند', 'شماره', 'شهر', 'محل خدمت'].concat(Array.from({ length: 31 }, (_, i) => String(i + 1)))];
calendarSheet.push(['محمدحسین عبداللهی', '101001', 'تهران', 'ایستگاه ۲'].concat(Array.from({ length: 31 }, () => 'روز')));
check('تقویم ۳۵ ستونه خودکار از ستون چهارم عمودی می‌شود', sheet.resolveVerticalFrom(calendarSheet) === 4, String(sheet.resolveVerticalFrom(calendarSheet)));
check('verticalFrom دستی بر تشخیص خودکار مقدم است', sheet.resolveVerticalFrom(calendarSheet, 2) === 2);

const shortColumns = [Array.from({ length: 13 }, (_, i) => 'ستون' + (i + 1))];
shortColumns.push(Array.from({ length: 13 }, () => 'فعال'));
check('جدول ۱۳ ستونهٔ کوتاه افقی می‌ماند', sheet.resolveVerticalFrom(shortColumns) === -1, String(sheet.resolveVerticalFrom(shortColumns)));

const longColumns = [['نام', 'واحد', 'وضعیت', 'شهر', 'تلفن', 'کد', 'تاریخ', 'شرح', 'محل', 'نوع', 'گروه', 'شیفت', 'توضیح']];
longColumns.push(['علی رضایی', 'بهره‌برداری', 'فعال', 'تهران', '0912', '1001', '۱۴۰۵/۰۱/۰۱', 'شرح بلند', 'ایستگاه یک', 'نوع', 'گروه', 'شیفت', 'توضیح']);
check('ستون‌های متنی بلند عمودی نمی‌شوند', sheet.resolveVerticalFrom(longColumns) === -1, String(sheet.resolveVerticalFrom(longColumns)));

// ── پهنای ستون‌ها در جدول چندستونه نباید ستون نام را خرد کند ──
const wideCalendarWidths = sheet.columnPercents(calendarSheet);
check('در تقویم ۳۵ ستونه ستون نام خوانا می‌ماند', wideCalendarWidths[0] >= 10, wideCalendarWidths.slice(0, 5).join('+'));
check('در تقویم ۳۵ ستونه مجموع پهنای ستون‌ها ۱۰۰٪ است', wideCalendarWidths.reduce((a, b) => a + b, 0) === 100, wideCalendarWidths.reduce((a, b) => a + b, 0));
check('هیچ ستون تقویم باریک‌تر از کف نیست', wideCalendarWidths.every(w => w >= 2), Math.min.apply(null, wideCalendarWidths));

// ستون‌های عمودی کم‌عرض‌اند تا ستون‌های اطلاعاتی خوانا بمانند.
const vertWidths = sheet.columnPercents([
  ['نام و نام خانوادگی', '۱', '۲', '۳'],
  ['محمدحسین عبداللهی', 'روزکار', 'روزکار', 'استراحت']
], 1);
check('در حالت عمودی، ستون اطلاعاتی پهن و خوانا می‌ماند', vertWidths[0] >= 20, vertWidths.join('+'));
check('در حالت عمودی، مجموع پهنای ستون‌ها ۱۰۰٪ است', vertWidths.reduce((a, b) => a + b, 0) === 100, vertWidths.join('+'));

// ── پهنای ستون‌ها و خانه‌های عددی ──
const widths = sheet.columnPercents([
  ['نام و نام خانوادگی', 'وضعیت', 'تلفن همراه'],
  ['محمدحسین عبداللهی', 'فعال', '09120000001'],
  ['سارا محمدی‌نژاد', 'فعال', '09120000002']
]);
check('مجموع پهنای ستون‌ها ۱۰۰٪ است', widths.reduce((a, b) => a + b, 0) === 100, widths.join('+'));
check('ستون نام از ستون وضعیت پهن‌تر است', widths[0] > widths[1], widths.join('+'));
check('ستون تلفن باریک‌تر از ستون نام است', widths[2] < widths[0], widths.join('+'));
check('هیچ ستونی باریک‌تر از ۵٪ نیست', widths.every(w => w >= 5), widths.join('+'));
check('colgroup در جدول ساخته می‌شود', /<colgroup>(<col style="width:\d+%">)+<\/colgroup>/.test(html));
check('تلفن عددی علامت nowrap می‌گیرد', sheet.isNumericText('09120000001') && sheet.isNumericText('۱۴۰۰/۰۵/۱۲') && !sheet.isNumericText('علی رضایی'));
check('خانهٔ عددی کلاس چاپ دارد', /<td class="atlas-print-num">[۰-۹\d/]+<\/td>/.test(sheet.build([['تاریخ'], ['۱۴۰۰/۰۵/۱۲']], {})));

// ── قواعد چاپ در print.css ──
check('صفحهٔ A4 افقی', /@page\s*\{[^}]*size:\s*A4 landscape/.test(css));
check('جدول تمام‌عرض با ستون هم‌عرض', /table-layout:\s*fixed/.test(css) && /width:\s*100%/.test(css));
check('ستون‌ها تکرار می‌شوند (thead)', /display:\s*table-header-group/.test(css));
check('خط دور همهٔ خانه‌ها', /#atlasPrintArea th,\s*\n\s*#atlasPrintArea td\s*\{[^}]*border:\s*0\.7pt solid/.test(css.replace(/\r/g, '')));
check('سرستون کلفت‌تر از متن', /#atlasPrintArea th\s*\{[^}]*font-weight:\s*800/.test(css));
const thSize = Number((css.match(/#atlasPrintArea th\s*\{[^}]*font-size:\s*([\d.]+)pt/) || [])[1]);
const tdSize = Number((css.match(/body\.atlas-printing #atlasPrintArea\s*\{[^}]*font-size:\s*([\d.]+)pt/) || [])[1]);
check('سرستون یک پله درشت‌تر از متن', thSize > tdSize, 'th=' + thSize + 'pt td=' + tdSize + 'pt');
check('سربرگ با خط جداکننده', /\.atlas-print-head\s*\{[^}]*border-bottom:\s*1\.4pt solid/.test(css));
check('سلول‌ها هنگام شکست صفحه نصف نمی‌شوند', /page-break-inside:\s*avoid/.test(css));
check('سطر و خانه‌ها هر دو break-inside:avoid دارند', /#atlasPrintArea tr,\s*\n\s*#atlasPrintArea td,\s*\n\s*#atlasPrintArea th\s*\{[^}]*break-inside:\s*avoid/.test(css.replace(/\r/g, '')));
check('سرستون تنها در پای صفحه نمی‌ماند', /#atlasPrintArea thead\s*\{[^}]*break-after:\s*avoid/.test(css.replace(/\r/g, '')));
check('جدول و بدنه اجازهٔ شکستن بین سطرها را دارند', /#atlasPrintArea tbody\s*\{[^}]*break-inside:\s*auto/.test(css.replace(/\r/g, '')));
check('سطر داده هرگز بین دو صفحه نصف نمی‌شود', /#atlasPrintArea tbody tr\s*\{[^}]*break-inside:\s*avoid/.test(css.replace(/\r/g, '')));
check('راهنمای شیفت در چاپ استایل دارد', /#atlasPrintArea \.atlas-print-legend\s*\{/.test(css));
check('ستون‌های عمودی از بالا به پایین نوشته می‌شوند',
  /#atlasPrintArea\[data-vertical="1"\] \.atlas-print-vert\s*\{[^}]*writing-mode:\s*vertical-rl/.test(css.replace(/\r/g, '')));

// ── حذف سرصفحه/پاصفحهٔ مرورگر (آدرس سایت، تاریخ، ساعت، «۱ از ۲») ──
check('حاشیهٔ صفحهٔ چاپ صفر است', /@page\s*\{[^}]*size:\s*A4 landscape[^}]*margin:\s*0\s*;/.test(css.replace(/\r/g, '')));
check('برگهٔ چاپ به صفحهٔ نام‌دار وابسته نیست', !/page:\s*atlas-list/.test(css) && !/@page\s+atlas-list/.test(css));
check('چاپ مستقیم کل صفحه (Ctrl+P) حاشیه را از padding بدنه می‌گیرد', /body:not\(\.atlas-printing\):not\(\.rf-printing\)\s*\{[^}]*padding:\s*9mm 9mm 11mm/.test(css.replace(/\r/g, '')));
check('حاشیهٔ افقی برگه از padding خودش می‌آید', /body\.atlas-printing #atlasPrintArea\s*\{[^}]*padding:\s*0 9mm/.test(css.replace(/\r/g, '')));
check('سطر فاصلهٔ بالای صفحه ۹mm است', /\.atlas-print-pad > td\s*\{[^}]*height:\s*9mm/.test(css.replace(/\r/g, '')));
check('سطر فاصلهٔ پایین صفحه ۱۱mm است', /\.atlas-print-pad-bottom > td\s*\{[^}]*height:\s*11mm/.test(css.replace(/\r/g, '')));
check('سطرهای فاصله خط و کادر ندارند', /\.atlas-print-pad > td\s*\{[^}]*border:\s*0/.test(css.replace(/\r/g, '')));
check('خانهٔ سربرگ کادر و padding جدول را نمی‌گیرد', /\.atlas-print-head-row > td\s*\{[^}]*border:\s*0/.test(css.replace(/\r/g, '')));

// ── چاپ مستقیم صفحه (Ctrl+P) و برگهٔ پرونده هم همان قاعده را دارند ──
const stylesCss = fs.readFileSync(path.join(root, 'design/styles.css'), 'utf8');
const recordFileJs = fs.readFileSync(path.join(root, 'design/record-file.js'), 'utf8');
check('چاپ مستقیم صفحه سطرها را نصف نمی‌کند', /\.module-table tr,\.module-table td,\.module-table th\{break-inside:avoid;page-break-inside:avoid\}/.test(stylesCss));
check('چاپ مستقیم صفحه سرستون را تکرار می‌کند', /\.module-table thead\{display:table-header-group/.test(stylesCss));
check('چاپ مستقیم صفحه کادر اسکرول جدول را باز می‌کند', /\.module-table-wrap\{overflow:visible!important/.test(stylesCss));
check('برگهٔ پرونده هم سطرها را نصف نمی‌کند', /\.rf-sheet tr,\.rf-sheet td,\.rf-sheet th\{page-break-inside:avoid;break-inside:avoid\}/.test(recordFileJs));
check('برگهٔ پرونده سرستون را در هر صفحه تکرار می‌کند', /\.rf-sheet thead\{display:table-header-group/.test(recordFileJs));
check('برگهٔ پرونده هم سرصفحه/پاصفحهٔ مرورگر را چاپ نمی‌کند', /@page\{size:A4;margin:0\}/.test(recordFileJs));
check('حاشیهٔ برگهٔ پرونده از padding خودش می‌آید', /\.rf-sheet\{padding:12mm 12mm 14mm\}/.test(recordFileJs));

// ── تقویم شیفت: کادر با فهرست کارکنان رشد می‌کند و چاپ سطرها را نمی‌شکند ──
const plannerCss = fs.readFileSync(path.join(root, 'design/shift-planner.css'), 'utf8');
check('کادر تقویم سقف ارتفاع ندارد و با فهرست رشد می‌کند', /\.sp-grid-wrap\s*\{[^}]*max-height:\s*none/.test(plannerCss));
check('سقف ۶۸vh قبلی کادر تقویم حذف شده', !/\.sp-grid-wrap\s*\{[^}]*max-height:\s*68vh/.test(plannerCss));
check('چاپ تقویم کادر اسکرول را باز می‌کند', /\.sp-grid-wrap\{overflow:visible!important/.test(stylesCss));
check('چاپ تقویم سطرها را نصف نمی‌کند', /\.sp-grid tr,\.sp-grid td,\.sp-grid th\{break-inside:avoid;page-break-inside:avoid\}/.test(stylesCss));
check('چاپ تقویم سرستون را در هر صفحه تکرار می‌کند', /\.sp-grid thead\{display:table-header-group/.test(stylesCss));
check('چاپ تقویم ستون چسبان را آزاد می‌کند', /\.sp-grid thead th,\.sp-grid \.sp-sticky-col\{position:static!important\}/.test(stylesCss));

// جدول چندستونه (تقویم: یک ستون برای هر روز) نباید از عرض A4 بیرون بزند.
const calendarRows = [['کارمند'].concat(Array.from({ length: 30 }, (_, i) => '۱۴۰۵/۰۸/' + (i + 1)))];
calendarRows.push(['علی رضایی'].concat(Array.from({ length: 30 }, () => 'روزکار')));
const calendarWidths = sheet.columnPercents(calendarRows);
check('۳۱ ستون تقویم مجموعاً ۱۰۰٪ عرض می‌گیرد',
  calendarWidths.reduce((a, b) => a + b, 0) === 100, calendarWidths.join('+'));
check('هیچ ستون تقویم باریک‌تر از ۱٪ نیست', calendarWidths.every(w => w >= 1), calendarWidths.join('+'));

const failed = checks.filter(c => !c.ok);
checks.forEach(c => console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name + (c.ok || !c.extra ? '' : ' → ' + c.extra)));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
if (failed.length) process.exit(1);

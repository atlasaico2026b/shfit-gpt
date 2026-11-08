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

// ── حذف سرصفحه/پاصفحهٔ مرورگر (آدرس سایت، تاریخ، ساعت، «۱ از ۲») ──
check('برگهٔ فهرست‌ها روی صفحهٔ نام‌دار چاپ می‌شود', /@page atlas-list\s*\{[^}]*margin:\s*0\s*;/.test(css.replace(/\r/g, '')));
check('برگهٔ فهرست‌ها به همان صفحهٔ نام‌دار وصل است', /body\.atlas-printing #atlasPrintArea\s*\{[^}]*page:\s*atlas-list/.test(css.replace(/\r/g, '')));
check('چاپ مستقیم کل صفحه (Ctrl+P) حاشیهٔ خودش را نگه می‌دارد', /@page\s*\{[^}]*size:\s*A4 landscape[^}]*margin:\s*9mm 9mm 11mm/.test(css.replace(/\r/g, '')));
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

const failed = checks.filter(c => !c.ok);
checks.forEach(c => console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name + (c.ok || !c.extra ? '' : ' → ' + c.extra)));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
if (failed.length) process.exit(1);

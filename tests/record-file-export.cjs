/* آزمون برگهٔ «مشاهدهٔ پرونده»: پیش‌نمایش/چاپ (HTML) و خروجی Word (.docx) و CSV.
   اجرا: node tests/record-file-export.cjs
   ساختگی‌های حداقلی DOM تا فایل بروزر design/record-file.js در Node اجرا شود. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');

const stubNode = () => ({
  style: {}, className: '', innerHTML: '', dataset: {}, remove() {}, appendChild() {},
  addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
});
const sandbox = {
  console, TextEncoder, Blob, Buffer, Date, Math, JSON, setTimeout, clearTimeout,
  atob: value => Buffer.from(value, 'base64').toString('binary'),
  document: {
    addEventListener() {},
    querySelector() { return null; },
    getElementById() { return null; },
    createElement: stubNode,
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
  },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['design/export-docs.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
}
vm.runInContext(fs.readFileSync(path.join(root, 'design/record-file.js'), 'utf8'), sandbox, { filename: 'record-file.js' });
const api = sandbox.window.AtlasRecordFile;
if (!api || typeof api.buildWord !== 'function') throw new Error('AtlasRecordFile.buildWord صادر نشد');

const model = {
  kind: 'پرسنل · پرونده',
  title: 'علی رضایی <b>تست</b>',
  subtitle: 'کارشناس بهره‌برداری · مرکز انتقال نفت',
  stamp: 'تاریخ تهیه: ۱۴۰۵/۰۸/۱۶ — ۱۰:۲۰',
  photo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC0AAAA8CAIAAAB98qTzAAAAQUlEQVR4nO3OMQ0AAAgDMGRzowSpyGBHkwpo9WyCeh94eHh4eHh4eHgk8PDw8PDw8PDw8PDw8PDw8PDw8Pjnkfk4fW3lKTNnoWoAAAAASUVORK5CYII=',
  footNote: 'این برگه فقط شامل اطلاعات ثبت‌شده در همین پرونده است.',
  facts: [
    { label: 'شمارهٔ پرسنلی', value: '۱۰۴۲۳' },
    { label: 'کد ملی', value: '۰۰۱۲۳۴۵۶۷۸' },
    { label: 'سمت سازمانی', value: 'کارشناس' },
    { label: 'وضعیت', value: 'فعال' },
    { label: 'سمت سازمانی و شرح وظایف', value: 'متن طولانی برای بررسی پهنای کامل', wide: true },
    { label: 'شهر', value: 'اهواز' },
    { label: 'واحد', value: 'بهره‌برداری' },
    { label: 'تلفن', value: '۰۶۱۳۳۳۳۳' },
  ],
  tables: [
    { title: 'مرخصی‌ها (۲)', headers: ['نوع', 'از', 'تا', 'وضعیت'], rows: [['استحقاقی', '۱۴۰۵/۰۱/۰۲', '۱۴۰۵/۰۱/۰۴', 'تأییدشده'], ['روزانه', '۱۴۰۵/۰۲/۱۱', '۱۴۰۵/۰۲/۱۱', 'در انتظار']] },
    { title: 'پیگیری‌ها (۰)', headers: ['عنوان', 'تاریخ'], rows: [] },
  ],
};

const html = api.buildSheet(model);
const csv = api.buildCsv(model);

const checks = [];
const check = (name, ok, extra) => checks.push({ name, ok: !!ok, extra: extra || '' });

check('چیدمان سربرگ جدولی', /class="rf-brandrow"/.test(html));
check('چیدمان اصلی جدولی', /class="rf-top"/.test(html));
check('ستون‌بندی اطلاعات در جدول', /class="rf-facts"/.test(html) && /rf-fact-lbl/.test(html) && /rf-fact-val/.test(html));
check('فکت پهن با colspan=3', /class="rf-fact-val" colspan="3"/.test(html));
check('فکت تک‌افتاده با خانهٔ خالی', /class="rf-fact-void" colspan="2"/.test(html));
check('جدول سوابق کلاس rf-table', /<table class="rf-table"/.test(html));
check('پاورقی جدولی', /class="rf-sheet-foot"/.test(html) && /rf-foot-stamp/.test(html));
check('جدول خالی پیام می‌دهد', /colspan="2">موردی ثبت نشده است\./.test(html));
check('خروجی escape شده', html.includes('&lt;b&gt;تست&lt;/b&gt;') && !html.includes('<b>تست</b>'));
check('کادر عکس با width/height صریح', /width="144" height="192"/.test(html));
check('عکس در گوشهٔ بالا-چپ (align/valign برای Word)', /<td class="rf-photo" width="144" valign="top" align="left">/.test(html));

check('CSV با BOM شروع می‌شود', csv.charCodeAt(0) === 0xfeff);
check('CSV عنوان برگه را دارد', csv.indexOf('علی رضایی') >= 0);
check('CSV هر دو جدول را دارد', csv.indexOf('مرخصی‌ها') >= 0 && csv.indexOf('پیگیری‌ها') >= 0);
check('CSV پیام جدول خالی را دارد', csv.indexOf('موردی ثبت نشده است') >= 0);

// نام فایل خروجی باید ASCII باشد؛ نام فارسی باعث ذخیره با نام «download» و
// از دست رفتن خروجی Word می‌شد.
const fileName = api.exportFileName(model);
check('نام فایل خروجی ASCII است', /^[A-Za-z0-9._-]+$/.test(fileName), fileName);
check('نام فایل خروجی پسوندپذیر است', fileName.indexOf('ATLAS-SHIFT-') === 0, fileName);

// پیش‌نمایش هر چهار قالب باید ساخته شود؛ پیش‌تر مسیر Word به تابع تعریف‌نشده
// «wordDocument» اشاره می‌کرد و خروجی Word هرگز گرفته نمی‌شد.
['print', 'doc', 'xls', 'csv'].forEach(format => {
  let overlay = null;
  try { overlay = api.buildPreviewOverlay(model, format); } catch (error) { overlay = null; }
  check('پیش‌نمایش «' + format + '» بدون خطا ساخته می‌شود', !!overlay);
  check('پیش‌نمایش «' + format + '» برگهٔ A4 را نشان می‌دهد', !!overlay && /class="rf-sheet/.test(overlay.innerHTML));
});

// چاپ گروهی: هر برگه باید از صفحهٔ تازه شروع شود. شکست صفحه روی خودِ برگه
// گذاشته می‌شود، نه روی یک div خالیِ جداکننده — فایرفاکس شکست را روی عنصر
// تهیِ بدون ارتفاع نادیده می‌گیرد و برگه‌ها از وسط صفحه بریده می‌شدند.
const rfSource = fs.readFileSync(path.join(root, 'design/record-file.js'), 'utf8');
check('شکست صفحه روی خودِ برگه گذاشته می‌شود',
  /\.rf-sheet \+ \.rf-sheet\{break-before:page;page-break-before:always\}/.test(rfSource));
check('جداکنندهٔ div خالی برای شکست صفحه حذف شده',
  rfSource.indexOf('rf-page-break') < 0);
check('چاپ گروهی برگه‌ها را بدون جداکننده به هم می‌چسباند',
  /function printSheets\(list\) \{\s*printSheet\(\(list \|\| \[\]\)\.join\(''\)\);/.test(rfSource));

(async () => {
  const bytes = Buffer.from(await api.buildWord(model).arrayBuffer());
  fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
  const docxPath = path.join(root, '.tmp', 'sample-record.docx');
  fs.writeFileSync(docxPath, bytes);

  const script = `
import zipfile, sys
import xml.etree.ElementTree as ET
fail = []
z = zipfile.ZipFile('${docxPath.replace(/\\/g, '/')}')
for name in z.namelist():
    if name.endswith(('.xml', '.rels')):
        try: ET.fromstring(z.read(name))
        except Exception as e: fail.append('XML معیوب %s: %s' % (name, e))
doc = z.read('word/document.xml').decode('utf-8')
if 'w:orient="landscape"' in doc: fail.append('برگهٔ پرونده باید A4 عمودی باشد')
if 'w:bidiVisual' not in doc: fail.append('جدول پرونده راست‌به‌چپ نیست')
if '<w:insideV' not in doc or '<w:insideH' not in doc: fail.append('خط داخلی جدول نیست')
if 'شمارهٔ پرسنلی' not in doc: fail.append('فکت‌ها در Word نیامده‌اند')
if 'استحقاقی' not in doc: fail.append('سوابق در Word نیامده‌اند')
if 'word/media/photo.png' not in z.namelist(): fail.append('عکس پرونده در فایل نیست')
if 'rIdPhoto' not in z.read('word/_rels/document.xml.rels').decode('utf-8'): fail.append('رابط عکس تعریف نشده')
for f in fail: print('FAIL:', f)
sys.exit(1 if fail else 0)
`;
  const scriptPath = path.join(root, '.tmp', 'verify-record.py');
  fs.writeFileSync(scriptPath, script, 'utf8');
  try {
    execFileSync('python3', [scriptPath], { encoding: 'utf8' });
  } catch (error) {
    ((error.stdout || '') + (error.stderr || '')).split('\n')
      .filter(line => line.trim()).forEach(line => checks.push({ name: line.trim(), ok: false }));
  }
  check('Word فایل معتبر با عکس', !checks.some(c => c.name.startsWith('FAIL')));

  const failed = checks.filter(c => !c.ok);
  checks.forEach(c => console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name + (c.extra ? ' — ' + c.extra : '')));
  console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
  fs.rmSync(path.join(root, '.tmp', 'sample-record.docx'), { force: true });
  process.exit(failed.length ? 1 : 0);
})();

/* آزمون «پرونده‌های انتخاب‌شده»: خروجی گروهی چند برگه پشت سر هم.
   اجرا: node tests/record-file-bulk.cjs
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

const checks = [];
const check = (name, ok, extra) => checks.push({ name, ok: !!ok, extra: extra || '' });

check('openBulk صادر شده است', typeof api.openBulk === 'function');
check('buildWordMany صادر شده است', typeof api.buildWordMany === 'function');
check('buildCsvMany صادر شده است', typeof api.buildCsvMany === 'function');

const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC0AAAA8CAIAAAB98qTzAAAAQUlEQVR4nO3OMQ0AAAgDMGRzowSpyGBHkwpo9WyCeh94eHh4eHh4eHgk8PDw8PDw8PDw8PDw8PDw8PDw8Pjnkfk4fW3lKTNnoWoAAAAASUVORK5CYII=';

const sheet = (title, extra) => Object.assign({
  kind: 'پرسنل · پرونده',
  title: title,
  subtitle: 'کارشناس بهره‌برداری',
  stamp: 'تاریخ تهیه: ۱۴۰۵/۰۸/۱۶ — ۱۰:۲۰',
  footNote: 'این برگه فقط شامل اطلاعات ثبت‌شده در همین پرونده است.',
  facts: [{ label: 'شمارهٔ پرسنلی', value: '۱۰۴۲۳' }],
  tables: [{ title: 'مرخصی‌ها (۱)', headers: ['نوع', 'وضعیت'], rows: [['استحقاقی', 'تأییدشده']] }],
}, extra || {});

const models = [
  sheet('علی رضایی', { photo: PHOTO }),
  sheet('مریم احمدی', { photo: PHOTO }),
  sheet('حسن کریمی'),
];

const csv = api.buildCsvMany(models);
check('CSV گروهی هر سه عنوان را دارد',
  csv.indexOf('علی رضایی') >= 0 && csv.indexOf('مریم احمدی') >= 0 && csv.indexOf('حسن کریمی') >= 0);
check('CSV گروهی با BOM شروع می‌شود', csv.charCodeAt(0) === 0xfeff);
check('CSV گروهی سه بلوک دارد', (csv.match(/ATLAS SHIFT/g) || []).length === 3);

(async () => {
  const bytes = Buffer.from(await api.buildWordMany(models).arrayBuffer());
  fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
  const docxPath = path.join(root, '.tmp', 'bulk-records.docx');
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
rels = z.read('word/_rels/document.xml.rels').decode('utf-8')
names = z.namelist()
if doc.count('<w:sectPr>') != 3: fail.append('باید سه بخش (یک برگه در هر صفحه) باشد، شد %d' % doc.count('<w:sectPr>'))
if 'w:orient="landscape"' in doc: fail.append('برگهٔ پرونده باید A4 عمودی باشد')
for title in ('علی رضایی', 'مریم احمدی', 'حسن کریمی'):
    if title not in doc: fail.append('عنوان %s در Word نیامده' % title)
if 'word/media/photo1.png' not in names or 'word/media/photo2.png' not in names:
    fail.append('عکس هر دو پرونده در فایل نیست')
if 'rIdPhoto1' not in rels or 'rIdPhoto2' not in rels:
    fail.append('رابط عکس‌ها تعریف نشده')
if 'rIdPhoto1' not in doc or 'rIdPhoto2' not in doc:
    fail.append('عکس‌ها در متن سند ارجاع نشده‌اند')
for f in fail: print('FAIL:', f)
sys.exit(1 if fail else 0)
`;
  const scriptPath = path.join(root, '.tmp', 'verify-bulk.py');
  fs.writeFileSync(scriptPath, script, 'utf8');
  try {
    execFileSync('python3', [scriptPath], { encoding: 'utf8' });
  } catch (error) {
    ((error.stdout || '') + (error.stderr || '')).split('\n')
      .filter(line => line.trim()).forEach(line => checks.push({ name: line.trim(), ok: false }));
  }
  check('Word گروهی: سه برگهٔ معتبر با عکس‌ها', !checks.some(c => c.name.startsWith('FAIL')));

  // سیم‌کشی: دکمه در نوار انتخاب گروهی و رویداد مشترک بین دو فایل.
  const modules = fs.readFileSync(path.join(root, 'modules.js'), 'utf8');
  const recordFile = fs.readFileSync(path.join(root, 'design/record-file.js'), 'utf8');
  check('دکمهٔ «مشاهدهٔ پرونده‌های انتخاب‌شده» در نوار انتخاب گروهی هست',
    /data-module-action="bulk-files"/.test(modules) && modules.indexOf('مشاهدهٔ پرونده‌های انتخاب‌شده') >= 0);
  check('دکمه‌های انتخاب معکوس و پاک‌کردن انتخاب هست',
    /data-module-action="bulk-invert"/.test(modules) && /data-module-action="bulk-clear"/.test(modules));
  check('modules.js رویداد atlas-open-files را می‌فرستد', /atlas-open-files/.test(modules));
  check('record-file.js رویداد atlas-open-files را می‌شنود', /addEventListener\('atlas-open-files'/.test(recordFile));
  check('پنجرهٔ گروهی دو کادر عمودی و نوار افقی پایین دارد',
    /rf-bulk-list/.test(recordFile) && /rf-bulk-sheet/.test(recordFile) && /rf-bulk-foot/.test(recordFile));

  const failed = checks.filter(c => !c.ok);
  checks.forEach(c => console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name + (c.extra ? ' — ' + c.extra : '')));
  console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
  fs.rmSync(docxPath, { force: true });
  process.exit(failed.length ? 1 : 0);
})();

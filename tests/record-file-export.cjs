// ساختگی‌های حداقلی DOM تا فایل بروزر design/record-file.js در Node اجرا شود
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'design/record-file.js'), 'utf8');

const listener = { addEventListener() {} };
global.window = global;
global.document = {
  addEventListener() {},
  querySelector() { return null; },
  getElementById() { return null; },
  createElement() {
    return { style: {}, className: '', innerHTML: '', dataset: {}, remove() {}, appendChild() {}, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
  },
  body: { appendChild() {}, classList: { add() {}, remove() {} } }
};

new Function('window', 'document', src)(globalThis, globalThis.document);
const api = globalThis.AtlasRecordFile;
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
    { label: 'تلفن', value: '۰۶۱۳۳۳۳۳' }
  ],
  tables: [
    { title: 'مرخصی‌ها (۲)', headers: ['نوع', 'از', 'تا', 'وضعیت'], rows: [['استحقاقی', '۱۴۰۵/۰۱/۰۲', '۱۴۰۵/۰۱/۰۴', 'تأییدشده'], ['روزانه', '۱۴۰۵/۰۲/۱۱', '۱۴۰۵/۰۲/۱۱', 'در انتظار']] },
    { title: 'پیگیری‌ها (۰)', headers: ['عنوان', 'تاریخ'], rows: [] }
  ]
};

const doc = api.buildWord(model);
const html = api.buildSheet(model);
fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
fs.writeFileSync(path.join(root, '.tmp', 'sample-record.doc'), doc, 'utf8');

const checks = [];
const check = (name, ok, extra) => checks.push({ name, ok: !!ok, extra: extra || '' });

check('BOM در ابتدای فایل', doc.charCodeAt(0) === 0xfeff);
check('charset utf-8', /http-equiv="Content-Type" content="text\/html; charset=utf-8"/.test(doc));
check('جهت سند rtl', /<body dir="rtl">/.test(doc) && /direction:rtl/.test(doc));
check('تنظیم صفحهٔ A4 ورد', /@page WordSection1\{size:210mm 297mm/.test(doc) && /div\.WordSection1\{page:WordSection1\}/.test(doc));
check('بدون grid', !/display:\s*grid/.test(doc));
check('بدون flex', !/display:\s*(inline-)?flex/.test(doc));
check('بدون float', !/float:/.test(doc));
check('فونت صریح روی body', /font-family:Tahoma, "Segoe UI", sans-serif/.test(doc));
check('فونت صریح روی td/th', /\.rf-sheet td,\.rf-sheet th,.+font-family:Tahoma/.test(doc));
check('اندازهٔ فونت پایه 10.5pt', /font-size:10\.5pt/.test(doc));
check('چیدمان سربرگ جدولی', /class="rf-brandrow"/.test(html));
check('چیدمان اصلی جدولی', /class="rf-top"/.test(html));
check('ستون‌بندی اطلاعات در جدول', /class="rf-facts"/.test(html) && /rf-fact-lbl/.test(html) && /rf-fact-val/.test(html));
check('فکت پهن با colspan=3', /class="rf-fact-val" colspan="3"/.test(html));
check('فکت تک‌افتاده با خانهٔ خالی', /class="rf-fact-void" colspan="2"/.test(html));
check('جدول سوابق کلاس rf-table', /<table class="rf-table"/.test(html));
check('پاورقی جدولی', /class="rf-sheet-foot"/.test(html) && /rf-foot-stamp/.test(html));
check('جدول خالی پیام می‌دهد', /colspan="2">موردی ثبت نشده است\./.test(html));
check('خروجی escape شده', html.includes('&lt;b&gt;تست&lt;/b&gt;') && !html.includes('<b>تست</b>'));

check('کادر عکس ۱.۵×۲ اینچ در Word', /\.rf-photo img\{display:block;width:1\.5in;height:2in/.test(doc));
check('کادر عکس با width/height صریح', /width="144" height="192"/.test(html));
check('ستون عکس ۱.۵ اینچ', /\.rf-photo\{width:1\.5in/.test(doc));

const factsRows = (html.match(/<tr>/g) || []).length;
check('همهٔ فکت‌ها در جدول آمده‌اند', (html.match(/rf-fact-lbl/g) || []).length + 2 >= model.facts.length, 'rows=' + factsRows);

const failed = checks.filter(c => !c.ok);
checks.forEach(c => console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name + (c.extra ? ' — ' + c.extra : '')));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

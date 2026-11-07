/* آزمون خروجی‌های سندی (Word، PowerPoint، CSV) بدون مرورگر.
   اجرا: node tests/export-docs.cjs
   ساخت با همان فایل‌های برنامه، سپس اعتبارسنجی بستهٔ ZIP و XML؛ برای PowerPoint
   اگر python-pptx موجود باشد فایل واقعاً باز و خوانده می‌شود. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const outDir = path.join(root, '.tmp', 'export-test');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const sandbox = { console, TextEncoder, Blob, Date, Math, JSON, setTimeout, clearTimeout };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['design/pptx-base.js', 'design/export-docs.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
}
const docs = sandbox.window.AtlasExportDocs;

const failures = [];
function check(label, condition, detail) {
  if (condition) return;
  failures.push(label + (detail ? ' — ' + detail : ''));
}

async function write(file, blob) {
  const bytes = Buffer.from(await blob.arrayBuffer());
  fs.writeFileSync(path.join(outDir, file), bytes);
  return bytes.length;
}

const employeeRows = [
  ['نام', 'نام خانوادگی', 'کد پرسنلی', 'محل خدمت', 'وضعیت', 'شماره تماس'],
  ['علی', 'رضایی', '۱۰۲۴', 'پالایشگاه آبادان', 'شاغل', '۰۹۱۲۳۴۵۶۷۸۹'],
  ['مریم', 'کریمی', '۱۰۲۵', 'مرکز مخابرات', 'مرخصی', '۰۹۱۲۳۴۵۶۷۹۰'],
];
const longRows = [['ردیف', 'شرح اقدام', 'مسئول', 'تاریخ', 'وضعیت']];
for (let i = 1; i <= 40; i += 1) {
  longRows.push([String(i), 'بازدید دوره‌ای تجهیزات و ثبت گزارش شمارهٔ ' + i, 'کارشناس ' + (i % 5), '۱۴۰۵/۰۸/۱۲', 'باز']);
}

(async () => {
  // ── Word: فهرست (افقی) ──
  const docxBytes = await write('list.docx', docs.docx({
    title: 'کارکنان · ATLAS SHIFT',
    stamp: '۱۴۰۵/۰۸/۱۲',
    meta: '۳ ردیف',
    landscape: true,
    tables: [{ rows: employeeRows }],
  }));
  check('docx اندازهٔ معقول', docxBytes > 1500, docxBytes + ' بایت');

  // ── Word: پرونده (عمودی) ──
  await write('record.docx', docs.docx({
    title: 'پروندهٔ کارمند — علی رضایی',
    subtitle: 'کارشناس بهره‌برداری',
    stamp: 'تاریخ تهیه: ۱۴۰۵/۰۸/۱۲',
    landscape: false,
    facts: [['کد پرسنلی', '۱۰۲۴'], ['محل خدمت', 'پالایشگاه آبادان']],
    tables: [{ heading: 'مرخصی‌ها', rows: [['نوع', 'از', 'تا'], ['استحقاقی', '۱۴۰۵/۰۱/۰۲', '۱۴۰۵/۰۱/۰۴']] }],
  }));

  // ── PowerPoint: فهرست بلند (چند اسلاید) ──
  const pptxBytes = await write('list.pptx', docs.pptx({ title: 'گزارش عملیاتی · ATLAS SHIFT', rows: longRows }));
  check('pptx اندازهٔ معقول', pptxBytes > 5000, pptxBytes + ' بایت');

  // ── CSV ──
  const csvText = docs.csv(employeeRows, { title: 'کارکنان · ATLAS SHIFT', stamp: '۱۴۰۵/۰۸/۱۲' });
  fs.writeFileSync(path.join(outDir, 'list.csv'), csvText, 'utf8');
  check('csv با BOM شروع می‌شود', csvText.charCodeAt(0) === 0xFEFF);
  check('csv عنوان بدون پسوند سازمان', csvText.indexOf('ATLAS SHIFT') === csvText.indexOf('ATLAS SHIFT', 1) - 1 || !/·\s*ATLAS SHIFT/.test(csvText.split('\r\n')[0]));
  check('csv هر ردیف داده یک خط', csvText.split('\r\n').filter(line => line.trim()).length >= employeeRows.length);

  // ── اعتبارسنجی بسته‌ها و XML ──
  const py = `
import sys, zipfile, re
import xml.etree.ElementTree as ET

fail = []
def parts(path):
    try:
        z = zipfile.ZipFile(path)
    except Exception as e:
        fail.append('%s: ZIP نامعتبر — %s' % (path, e)); return None
    bad = z.testzip()
    if bad: fail.append('%s: CRC خراب در %s' % (path, bad))
    return z

def check_xml(z, path):
    for name in z.namelist():
        if not name.endswith(('.xml', '.rels')): continue
        try:
            ET.fromstring(z.read(name))
        except Exception as e:
            fail.append('%s: XML معیوب در %s — %s' % (path, name, e))

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
ORDER = {
    'rPr': ['rStyle','rFonts','b','bCs','i','iCs','caps','smallCaps','strike','dstrike','outline','shadow','emboss','imprint','noProof','snapToGrid','vanish','webHidden','color','spacing','w','kern','position','sz','szCs','highlight','u','effect','bdr','shd','fitText','vertAlign','rtl','cs','em','lang','eastAsianLayout','specVanish','oMath'],
    'pPr': ['pStyle','keepNext','keepLines','pageBreakBefore','framePr','widowControl','numPr','suppressLineNumbers','pBdr','shd','tabs','suppressAutoHyphens','kinsoku','wordWrap','overflowPunct','topLinePunct','autoSpaceDE','autoSpaceDN','bidi','adjustRightInd','snapToGrid','spacing','ind','contextualSpacing','mirrorIndents','suppressOverlap','jc','textDirection','textAlignment','textboxTightWrap','outlineLvl','divId','cnfStyle','rPr','sectPr'],
    'tblPr': ['tblStyle','tblpPr','tblOverlap','bidiVisual','tblStyleRowBandSize','tblStyleColBandSize','tblW','jc','tblCellSpacing','tblInd','tblBorders','shd','tblLayout','tblCellMar','tblLook'],
    'trPr': ['cnfStyle','divId','gridBefore','gridAfter','wBefore','wAfter','cantSplit','trHeight','tblHeader','tblCellSpacing','jc','hidden'],
    'tcPr': ['cnfStyle','tcW','gridSpan','hMerge','vMerge','tcBorders','shd','noWrap','tcMar','textDirection','tcFitText','vAlign','hideMark'],
    'sectPr': ['footnotePr','endnotePr','type','pgSz','pgMar','paperSrc','pgBorders','lnNumType','pgNumType','cols','formProt','vAlign','noEndnote','titlePg','textDirection','bidi','rtlGutter','docGrid','printerSettings'],
}
def check_order(z, path):
    for name in z.namelist():
        if not name.startswith('word/') or not name.endswith('.xml'): continue
        root = ET.fromstring(z.read(name))
        for tag, order in ORDER.items():
            for el in root.iter(W + tag):
                names = [child.tag.split('}')[-1] for child in el]
                idx = [order.index(n) for n in names if n in order]
                if idx != sorted(idx):
                    fail.append('%s: ترتیب فرزندان %s نادرست است (%s)' % (path, tag, ','.join(names)))

# Word — فهرست افقی، راست‌چین، خط کامل، پهنای ستون داخل کاغذ
z = parts('${path.join(outDir, 'list.docx').replace(/\\/g, '/')}')
if z:
    check_xml(z, 'list.docx')
    check_order(z, 'list.docx')
    doc = z.read('word/document.xml').decode('utf-8')
    if 'w:orient="landscape"' not in doc: fail.append('docx فهرست: افقی نیست')
    if 'w:bidiVisual' not in doc: fail.append('docx: جدول راست‌به‌چپ نیست')
    if '<w:insideV' not in doc or '<w:insideH' not in doc: fail.append('docx: خط داخلی جدول نیست')
    if '<w:tblHeader/>' not in doc: fail.append('docx: سرستون تکرار نمی‌شود')
    widths = [int(x) for x in re.findall(r'<w:gridCol w:w="(\\d+)"', doc)]
    total = sum(widths)
    content = 16838 - 567 * 2
    if not widths: fail.append('docx: عرض ستون‌ها تعریف نشده')
    elif total > content: fail.append('docx: جدول از عرض کاغذ بیرون می‌زند (%d > %d)' % (total, content))
    if 'w:jc w:val="right"' not in doc: fail.append('docx: متن راست‌چین نیست')

# Word — پرونده عمودی
z = parts('${path.join(outDir, 'record.docx').replace(/\\/g, '/')}')
if z:
    check_xml(z, 'record.docx')
    check_order(z, 'record.docx')
    doc = z.read('word/document.xml').decode('utf-8')
    if 'w:orient="landscape"' in doc: fail.append('docx پرونده: باید عمودی باشد')

# PowerPoint — باز شدن واقعی با python-pptx
z = parts('${path.join(outDir, 'list.pptx').replace(/\\/g, '/')}')
if z:
    check_xml(z, 'list.pptx')
    if 'ppt/slides/slide2.xml' not in z.namelist(): fail.append('pptx: ردیف‌های زیاد روی اسلاید دوم نرفته‌اند')
    try:
        from pptx import Presentation
        p = Presentation('${path.join(outDir, 'list.pptx').replace(/\\/g, '/')}')
        texts = []
        for s in p.slides:
            for sh in s.shapes:
                if sh.has_text_frame: texts.append(sh.text_frame.text)
        if len(p.slides) < 2: fail.append('pptx: تعداد اسلاید کم است')
        joined = ' '.join(texts)
        if 'بازدید دوره‌ای' not in joined: fail.append('pptx: متن ردیف‌ها در اسلاید نیست')
        if 'ردیف' in joined and 'کارشناس' not in joined: fail.append('pptx: ستون‌ها ناقص‌اند')
    except Exception as e:
        fail.append('pptx: python-pptx باز نکرد — %s' % e)

for f in fail: print('FAIL:', f)
sys.exit(1 if fail else 0)
`;
  const scriptPath = path.join(outDir, 'verify.py');
  fs.writeFileSync(scriptPath, py, 'utf8');
  try {
    const out = execFileSync('python3', [scriptPath], { encoding: 'utf8' });
    if (out.trim()) console.log(out.trim());
  } catch (error) {
    const detail = (error.stdout || '') + (error.stderr || '');
    detail.split('\n').filter(line => line.trim()).forEach(line => failures.push(line.trim()));
  }

  if (failures.length) {
    console.error('\n' + failures.length + ' ایراد:');
    failures.forEach(item => console.error(' • ' + item));
    process.exit(1);
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  console.log('✓ خروجی‌های Word، PowerPoint و CSV سالم‌اند.');
})();

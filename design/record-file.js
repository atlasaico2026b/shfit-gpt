/* ── مشاهدهٔ پرونده و خروجی تک‌صفحه‌ای (A4) ───────────────────────────
   برای هر رکورد (کارمند، خودرو، گازسنج، ایستگاه، …) یک برگهٔ کامل ساخته
   می‌شود: همهٔ اطلاعات ثبت‌شده به‌همراه سوابق مرتبط. هر خروجی اول پیش‌نمایش
   می‌شود و بعد از تأیید کاربر گرفته می‌شود. هیچ اطلاعاتی به برگه اضافه
   نمی‌شود که در پرونده ثبت نشده باشد. */
(function () {
  'use strict';

  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const EXPORT_FORMATS = {
    print: { label: 'چاپ / PDF (A4)', hint: 'برگهٔ A4 با تنظیمات چاپ مرورگر ذخیره می‌شود.' },
    doc: { label: 'Word (.doc)', hint: 'فایل Word با صفحهٔ A4 و چیدمان همین برگه.' },
    xls: { label: 'Excel (.xls)', hint: 'همان اطلاعات در یک کاربرگ؛ بدون سطر یا ستون اضافه.' },
    csv: { label: 'CSV', hint: 'متن ساده برای بازکردن در هر برنامهٔ جدول.' }
  };

  function fa(value) {
    return String(value == null ? '' : value).replace(/\d/g, d => FA_DIGITS[Number(d)]);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function modules() { return window.ATLAS_MODULES || {}; }
  function snapshot() { const api = modules(); return api.getData ? api.getData() : {}; }

  function employeeName(person) {
    if (!person) return '';
    const joined = [person.firstName, person.lastName].map(part => String(part == null ? '' : part).trim()).filter(Boolean).join(' ');
    return joined || String(person.fullName || '').trim();
  }

  function jalali(value, withTime) {
    const api = modules();
    if (!value) return '';
    return api.formatJalali ? api.formatJalali(value, !!withTime) : String(value);
  }

  function recordTitle(moduleKey, record, data) {
    if (!record) return '';
    if (moduleKey === 'employees') return employeeName(record) || String(record.personnelId || 'کارمند');
    if (moduleKey === 'vehicles') return [record.name, record.companyPlate].filter(Boolean).join(' · ') || 'خودرو';
    if (moduleKey === 'gasmeters') return [record.code, record.serial].filter(Boolean).join(' · ') || 'گازسنج';
    if (moduleKey === 'stations') return [record.name, record.placeType].filter(Boolean).join(' · ') || 'ایستگاه';
    return String(record.title || record.name || record.code || record.personnelId || record.serial || 'پرونده');
  }

  function plainValue(moduleKey, field, record, data) {
    const raw = field.custom && record.customFields ? record.customFields[field.key] : record[field.key];
    if (raw == null || raw === '') return '';
    if (Array.isArray(raw) && !raw.length) return '';
    if (field.type === 'jalali' || field.type === 'date') return jalali(raw, false);
    if (field.type === 'jalali-datetime') return jalali(raw, true);
    if (field.type === 'file' || field.type === 'file-multiple') {
      const count = Array.isArray(raw) ? raw.length : 1;
      return count ? fa(count) + ' پیوست' : '';
    }
    if (field.type === 'rows') return '';
    if (field.type === 'checks') return Array.isArray(raw) ? raw.join('، ') : String(raw);
    if (field.source === 'employees') {
      const ids = Array.isArray(raw) ? raw : [raw];
      return ids.map(id => {
        const person = (data.employees || []).find(item => String(item.id) === String(id));
        return person ? (employeeName(person) || String(person.personnelId || 'کارمند')) : String(id);
      }).filter(Boolean).join('، ');
    }
    if (field.source === 'vehicles') {
      const item = (data.vehicles || []).find(entry => String(entry.id) === String(raw));
      return item ? [item.name, item.companyPlate].filter(Boolean).join(' · ') : String(raw);
    }
    if (field.source === 'gasmeters') {
      const item = (data.gasmeters || []).find(entry => String(entry.id) === String(raw));
      return item ? [item.code, item.serial].filter(Boolean).join(' · ') : String(raw);
    }
    if (field.source === 'stations') {
      const item = (data.stations || []).find(entry => String(entry.id) === String(raw));
      return item ? [item.name, item.placeType].filter(Boolean).join(' · ') : String(raw);
    }
    if (field.type === 'number') return fa(raw);
    return Array.isArray(raw) ? raw.join('، ') : String(raw);
  }

  const RELATED_TABLES = {
    employees: [
      { module: 'missions', title: 'مأموریت‌های مرتبط', match: (row, record) => (row.crewIds || []).map(String).includes(String(record.id)) || String(row.driverId || '') === String(record.id), columns: [['title', 'عنوان'], ['startAt', 'شروع', 'jalali-datetime'], ['destination', 'مقصد'], ['status', 'وضعیت']] },
      { module: 'leaves', title: 'مرخصی‌ها', match: (row, record) => String(row.employeeId || '') === String(record.id), columns: [['leaveType', 'نوع'], ['startDate', 'از', 'jalali'], ['endDate', 'تا', 'jalali'], ['status', 'وضعیت']] },
      { module: 'shifts', title: 'برنامه‌های شیفت', match: (row, record) => (row.employeeIds || []).map(String).includes(String(record.id)), columns: [['startAt', 'شروع', 'jalali-datetime'], ['endAt', 'پایان', 'jalali-datetime'], ['shiftType', 'نوع'], ['status', 'وضعیت']] },
      { module: 'notes', title: 'پیگیری‌های محوله', match: (row, record) => String(row.responsibleId || '') === String(record.id), columns: [['title', 'عنوان'], ['date', 'تاریخ', 'jalali'], ['status', 'وضعیت']] }
    ],
    vehicles: [
      { module: 'missions', title: 'مأموریت‌های این خودرو', match: (row, record) => String(row.vehicleId || '') === String(record.id), columns: [['title', 'عنوان'], ['startAt', 'شروع', 'jalali-datetime'], ['destination', 'مقصد'], ['status', 'وضعیت']] },
      { module: 'faults', title: 'اشکالات ثبت‌شده', match: (row, record) => String(row.vehicleId || '') === String(record.id), columns: [['title', 'اشکال'], ['reportedAt', 'تاریخ', 'jalali'], ['priority', 'اولویت'], ['status', 'وضعیت']] },
      { module: 'maintenance', title: 'سوابق سرویس', match: (row, record) => String(row.vehicleId || '') === String(record.id), columns: [['date', 'تاریخ', 'jalali'], ['type', 'اقدام'], ['km', 'کیلومتر'], ['status', 'وضعیت']] }
    ],
    gasmeters: [
      { module: 'gaslogs', title: 'سوابق گازسنج', match: (row, record) => String(row.gasmeterId || '') === String(record.id), columns: [['date', 'تاریخ', 'jalali'], ['logType', 'نوع سابقه'], ['value', 'مقدار'], ['location', 'محل']] }
    ],
    stations: [
      { module: 'gasmeters', title: 'گازسنج‌های این مرکز', match: (row, record) => String(row.stationId || '') === String(record.id), columns: [['code', 'کد'], ['status', 'وضعیت'], ['calibrationEnd', 'پایان کالیبراسیون', 'jalali']] }
    ]
  };

  function cellText(row, key, type) {
    const raw = row ? row[key] : '';
    if (type === 'jalali') return raw ? jalali(raw, false) : '';
    if (type === 'jalali-datetime') return raw ? jalali(raw, true) : '';
    if (typeof raw === 'number') return fa(raw);
    return String(raw == null ? '' : raw);
  }

  function relatedTables(moduleKey, record, data) {
    const defs = RELATED_TABLES[moduleKey] || [];
    const out = [];
    defs.forEach(def => {
      const rows = (data[def.module] || []).filter(row => {
        try { return def.match(row, record); } catch (error) { return false; }
      });
      if (!rows.length) return;
      rows.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
      out.push({
        title: def.title + ' (' + fa(rows.length) + ')',
        headers: def.columns.map(column => column[1]),
        rows: rows.slice(0, 40).map(row => def.columns.map(column => cellText(row, column[0], column[2])))
      });
    });
    return out;
  }

  function rowTables(moduleKey, record) {
    const api = modules();
    const fields = api.fieldsFor ? api.fieldsFor(moduleKey) : [];
    const out = [];
    fields.forEach(field => {
      if (field.type !== 'rows') return;
      const rows = Array.isArray(record[field.key]) ? record[field.key] : [];
      if (!rows.length) return;
      out.push({
        title: field.label + ' (' + fa(rows.length) + ')',
        headers: (field.columns || []).map(column => column.label),
        rows: rows.map(row => (field.columns || []).map(column => String((row && row[column.key]) != null ? row[column.key] : '')))
      });
    });
    return out;
  }

  // برگهٔ پرونده: مدل داده، سپس HTML مشترک پیش‌نمایش/چاپ/فایل‌ها.
  // چیدمان فقط با جدول ساخته می‌شود (بدون flex و grid)؛ موتور HTML ورد نه flex
  // را می‌شناسد نه grid را، پس همین جدول‌بندی تنها راهی است که ستون‌ها،
  // چیدمان و اندازهٔ فونت‌ها در فایل Word هم عیناً مثل پیش‌نمایش بماند.
  function factsTableHtml(facts) {
    const rows = [];
    let pair = [];
    function flushPair() {
      if (!pair.length) return;
      const cells = pair.map(fact =>
        '<td class="rf-fact-lbl" width="21%">' + esc(fact.label) + '</td>' +
        '<td class="rf-fact-val" width="29%">' + (fact.value ? esc(fact.value) : '—') + '</td>').join('');
      rows.push('<tr>' + cells + (pair.length === 1 ? '<td class="rf-fact-void" colspan="2" width="50%"></td>' : '') + '</tr>');
      pair = [];
    }
    (facts || []).forEach(fact => {
      if (fact.wide) {
        flushPair();
        rows.push('<tr><td class="rf-fact-lbl rf-fact-lbl-wide" width="21%">' + esc(fact.label) + '</td>' +
          '<td class="rf-fact-val" colspan="3" width="79%">' + (fact.value ? esc(fact.value) : '—') + '</td></tr>');
        return;
      }
      pair.push(fact);
      if (pair.length === 2) flushPair();
    });
    flushPair();
    if (!rows.length) return '';
    return '<table class="rf-facts" dir="rtl" border="0" cellspacing="0" cellpadding="0"><tbody>' + rows.join('') + '</tbody></table>';
  }

  function buildSheet(model) {
    const tables = (model.tables || []).map(table =>
      '<h3>' + esc(table.title) + '</h3>' +
      '<table class="rf-table" dir="rtl"><thead><tr>' + table.headers.map(headCell => '<th>' + esc(headCell) + '</th>').join('') + '</tr></thead><tbody>' +
      (table.rows.length
        ? table.rows.map(row => '<tr>' + row.map(cell => '<td>' + esc(cell || '—') + '</td>').join('') + '</tr>').join('')
        : '<tr><td colspan="' + table.headers.length + '">موردی ثبت نشده است.</td></tr>') +
      '</tbody></table>').join('');
    // عکس پرسنلی: کادر ۱.۵×۲ اینچ (۳۸.۱×۵۰.۸ میلی‌متر) بالا و سمت چپ برگه؛
    // اندازه با اینچ و هم در style و هم در width/height نوشته می‌شود تا Word
    // دقیقاً همان کادر را بسازد و به میلی‌متر گرد نکند.
    const photoCell = model.photo
      ? '<td class="rf-photo"><img src="' + esc(model.photo) + '" alt="عکس پرسنلی" width="144" height="192"></td>'
      : '';
    const mainCell = '<td class="rf-sheet-main">' +
        '<div class="rf-sheet-head">' +
          '<table class="rf-brandrow" dir="rtl" border="0" cellspacing="0" cellpadding="0"><tbody><tr>' +
            '<td class="rf-sheet-brand"><span>ATLAS SHIFT</span></td>' +
            '<td class="rf-sheet-title">' + esc(model.kind) + '<br>' + esc(model.stamp) + '</td>' +
          '</tr></tbody></table>' +
        '</div>' +
        '<h2>' + esc(model.title) + '</h2>' +
        '<p class="rf-sheet-sub">' + esc(model.subtitle) + '</p>' +
      '</td>';
    return '<section class="rf-sheet" dir="rtl">' +
      '<table class="rf-top" dir="rtl" border="0" cellspacing="0" cellpadding="0"><tbody><tr>' + mainCell + photoCell + '</tr></tbody></table>' +
      factsTableHtml(model.facts) +
      tables +
      '<table class="rf-sheet-foot" dir="rtl" border="0" cellspacing="0" cellpadding="0"><tbody><tr>' +
        '<td class="rf-foot-note">' + esc(model.footNote) + '</td>' +
        '<td class="rf-foot-stamp">' + esc(model.stamp) + '</td>' +
      '</tr></tbody></table>' +
      '</section>';
  }

  function moduleSheet(moduleKey, record, data) {
    const api = modules();
    const spec = api.spec ? api.spec(moduleKey) : null;
    const fields = api.fieldsFor ? api.fieldsFor(moduleKey) : [];
    const facts = [];
    // عکس (پروندهٔ پرسنلی، خودرو، …): تصویر در کادر بالای برگه می‌آید، نه به‌صورت «۱ پیوست».
    let photo = '';
    let photoFieldKey = '';
    const photoField = fields.find(field => (field.type === 'file' || field.type === 'file-multiple') &&
      /image\//i.test(String(field.accept || '')) && record[field.key]);
    if (photoField) {
      const raw = record[photoField.key];
      const first = Array.isArray(raw) ? raw[0] : raw;
      if (typeof first === 'string' && /^data:image\//i.test(first)) {
        photo = first;
        photoFieldKey = photoField.key;
      }
    }
    fields.forEach(field => {
      if (field.type === 'rows') return;
      if (photo && field.key === photoFieldKey) return;
      const value = plainValue(moduleKey, field, record, data);
      // فقط اطلاعات ثبت‌شده در برگه می‌آید تا خروجی کوتاه و تک‌صفحه‌ای بماند.
      if (!String(value).trim()) return;
      facts.push({ label: field.label, value: value, wide: field.type === 'textarea' || field.type === 'checks' });
    });
    if (moduleKey === 'employees') {
      const contacts = (window.AtlasContactSync && window.AtlasContactSync.loadContacts) ? window.AtlasContactSync.loadContacts() : [];
      const linked = contacts.filter(contact => window.AtlasContactSync.isSameEmployee(contact, record));
      facts.push({ label: 'مخاطب دفترچهٔ تلفن', value: linked.length ? (linked[0].name || 'ثبت‌شده') : 'لینک نشده' });
    }
    return {
      kind: (spec ? spec.title + ' · پرونده' : 'پرونده'),
      title: recordTitle(moduleKey, record, data),
      subtitle: (spec ? spec.subtitle : ''),
      photo: photo,
      stamp: 'تاریخ تهیه: ' + jalali(new Date().toISOString(), true),
      footNote: 'این برگه فقط شامل اطلاعات ثبت‌شده در همین پرونده است.',
      facts: facts,
      tables: rowTables(moduleKey, record).concat(relatedTables(moduleKey, record, data))
    };
  }

  function contactSheet(contact) {
    const data = snapshot();
    const employee = (data.employees || []).find(person => window.AtlasContactSync && window.AtlasContactSync.isSameEmployee(contact, person));
    const facts = [
      { label: 'نام و نام خانوادگی', value: contact.name },
      { label: 'شمارهٔ داخلی', value: contact.extension },
      { label: 'شمارهٔ پرسنلی', value: contact.personnelId },
      { label: 'کد ملی', value: contact.nationalId },
      { label: 'حوزه', value: contact.area },
      { label: 'شهر', value: contact.city },
      { label: 'مجتمع', value: contact.complex },
      { label: 'مرکز انتقال نفت', value: contact.transferCenter },
      { label: 'ایستگاه', value: contact.station },
      { label: 'ساختمان', value: contact.building },
      { label: 'واحد', value: contact.unit },
      { label: 'سمت سازمانی', value: contact.position },
      { label: 'سرپرستی', value: contact.supervision }
    ].filter(fact => String(fact.value || '').trim());
    const phones = (contact.phoneNumbers || []).map(phone => [phone.kind === 'office' ? 'تلفن دفتر' : 'تلفن همراه', phone.label || '', (phone.prefix ? phone.prefix + ' ' : '') + (phone.value || ''), phone.secretary || '']);
    if (employee) {
      facts.push({ label: 'کارمند مرتبط', value: employeeName(employee) + (employee.personnelId ? ' · ' + employee.personnelId : '') });
      facts.push({ label: 'وضعیت کارمند', value: employee.status });
      facts.push({ label: 'محل خدمت', value: [employee.workplace, employee.assignedWorkplace].filter(Boolean).join(' · ') });
    }
    return {
      kind: 'دفترچه تلفن سازمانی · پروندهٔ مخاطب',
      title: contact.name || 'مخاطب',
      subtitle: [contact.position, contact.unit, contact.city].filter(Boolean).join(' · ') || 'مشخصات تماس و جایگاه سازمانی',
      stamp: 'تاریخ تهیه: ' + jalali(new Date().toISOString(), true),
      footNote: 'این برگه فقط شامل اطلاعات ثبت‌شده در همین پرونده است.',
      facts: facts,
      tables: [{ title: 'شماره‌های تماس (' + fa(phones.length) + ')', headers: ['نوع', 'عنوان', 'شماره', 'منشی'], rows: phones }]
    };
  }

  // ── خروجی‌ها؛ همیشه پس از پیش‌نمایش ───────────────────────────────
  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function slug(text) {
    return String(text || 'atlas').replace(/[\s/\\:*?"<>|]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'atlas';
  }

  function fileStamp() {
    const now = new Date();
    const pad = value => String(value).padStart(2, '0');
    return now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes());
  }

  function printSheet(html) {
    let area = document.getElementById('rfPrintArea');
    if (!area) {
      area = document.createElement('div');
      area.id = 'rfPrintArea';
      document.body.appendChild(area);
    }
    // همان قواعد برگه، به‌همراه تنظیم صفحهٔ A4، تا چاپ/PDF با خروجی Word یکی باشد
    area.innerHTML = '<style>@page{size:A4;margin:12mm 12mm 14mm}' + sheetRules() + '</style>' + html;
    document.body.classList.add('rf-printing');
    const cleanup = () => {
      document.body.classList.remove('rf-printing');
      area.innerHTML = '';
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 60000);
  }

  // ── استایل برگه: تنها منبع ظاهر برگه ───────────────────────────────
  // همین قواعد هم داخل فایل Word، هم در چاپ/PDF و هم در پیش‌نمایش به کار
  // می‌رود؛ پس ساختار و فونت‌ها هرگز دو جا و دو اندازه نمی‌شوند.
  const SHEET_FONT = 'Tahoma, "Segoe UI", sans-serif';

  function sheetRules() {
    return '.rf-sheet{margin:0;padding:0;width:100%;direction:rtl;text-align:right;background:#fff;color:#16203a;' +
        'font-family:' + SHEET_FONT + ';font-size:10.5pt;line-height:1.9;box-shadow:none;border-radius:0}' +
      '.rf-sheet div,.rf-sheet p,.rf-sheet span,.rf-sheet td,.rf-sheet th,.rf-sheet h2,.rf-sheet h3{font-family:' + SHEET_FONT + '}' +
      '.rf-sheet p{margin:0}' +
      '.rf-sheet h2{margin:0 0 2mm;font-size:15pt;line-height:1.4;font-weight:700}' +
      '.rf-sheet h3{margin:5mm 0 2mm;padding-bottom:1mm;font-size:10.5pt;line-height:1.7;border-bottom:1px solid #c7cede}' +
      '.rf-sheet table{width:100%;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt}' +
      '.rf-sheet td,.rf-sheet th{padding:0;vertical-align:top}' +
      '.rf-sheet .rf-sheet-head{border-bottom:1.4px solid #16203a;padding-bottom:6mm;margin-bottom:5mm}' +
      '.rf-sheet .rf-brandrow{width:100%}' +
      '.rf-sheet .rf-sheet-brand{font-size:10.5pt;line-height:1.8;font-weight:700;letter-spacing:.5pt;text-align:right}' +
      '.rf-sheet .rf-sheet-title{font-size:9pt;line-height:1.7;color:#3c4660;text-align:left}' +
      '.rf-sheet .rf-sheet-main{padding:0 0 0 6mm}' +
      '.rf-sheet .rf-sheet-sub{margin:0 0 4mm;font-size:9pt;line-height:1.7;color:#4a5573}' +
      '.rf-sheet .rf-photo{width:1.5in;text-align:left}' +
      '.rf-sheet .rf-photo img{display:block;width:1.5in;height:2in;border:1.2px solid #16203a}' +
      '.rf-sheet .rf-facts{table-layout:fixed}' +
      '.rf-sheet .rf-facts td{padding:0 0 1mm;border-bottom:1px dotted #cfd6e4;vertical-align:baseline}' +
      '.rf-sheet .rf-facts .rf-fact-lbl{width:21%;font-size:9pt;line-height:1.8;font-weight:600;color:#46506b;padding-left:4pt}' +
      '.rf-sheet .rf-facts .rf-fact-val{width:29%;font-size:10.5pt;line-height:1.8}' +
      '.rf-sheet .rf-facts .rf-fact-void{border:0}' +
      '.rf-sheet .rf-table{margin-top:1mm}' +
      '.rf-sheet .rf-table th,.rf-sheet .rf-table td{border:1px solid #c7cede;padding:1mm 2mm;font-size:9pt;line-height:1.7;text-align:right;vertical-align:top}' +
      '.rf-sheet .rf-table th{background:#eef1f8;font-weight:600}' +
      '.rf-sheet tr{page-break-inside:avoid}' +
      '.rf-sheet .rf-sheet-foot{margin-top:6mm;border-top:1px solid #c7cede;padding-top:3mm}' +
      '.rf-sheet .rf-sheet-foot td{border:0;padding:0;font-size:8pt;line-height:1.7;color:#5b6580;vertical-align:top}' +
      '.rf-sheet .rf-foot-note{text-align:right}' +
      '.rf-sheet .rf-foot-stamp{text-align:left}';
  }

  // تنظیم صفحه: A4 با حاشیهٔ ۱۲ میلی‌متر. Word حاشیه را از @page می‌گیرد و
  // مرورگر (پیش‌نمایش) آن را در نمایش رومیزی اعمال نمی‌کند، پس همان اندازه با
  // @media screen به body داده می‌شود.
  function docPageCss() {
    return '@page WordSection1{size:210mm 297mm;margin:12mm 12mm 14mm}' +
      'div.WordSection1{page:WordSection1}' +
      'body{margin:0;direction:rtl;background:#fff;font-family:' + SHEET_FONT + ';font-size:10.5pt;line-height:1.9;mso-line-height-rule:exactly}' +
      '@media screen{body{padding:12mm 12mm 14mm;box-sizing:border-box}}';
  }

  // پیش‌نمایش روی صفحه: همان برگه، به‌اندازهٔ یک صفحهٔ A4 روی میز
  function screenPageCss(scope) {
    return scope + ' .rf-sheet{width:210mm;max-width:100%;min-height:297mm;margin:0 auto;padding:12mm 12mm 14mm;' +
        'background:#fff;box-shadow:0 14px 40px rgba(0,0,0,.45)}' +
      '@media screen and (max-width:720px){' +
        scope + ' .rf-sheet{width:100%;min-height:0;padding:14px;font-size:11px}' +
        scope + ' .rf-sheet .rf-photo{width:96px}' +
        scope + ' .rf-sheet .rf-photo img{width:96px;height:128px}' +
        scope + ' .rf-sheet .rf-facts .rf-fact-lbl{font-size:8.5px}' +
        scope + ' .rf-sheet .rf-table th,' + scope + ' .rf-sheet .rf-table td{font-size:8.5px;padding:2px 4px}' +
      '}';
  }

  // قواعد برگه را زیر یک ریشه محدود می‌کند تا استایل داخل صفحه به بقیهٔ برنامه نشت نکند
  function scopeRules(css, scope) {
    return css.replace(/([^{}]+)\{/g, (all, selectors) => selectors.split(',').map(sel => scope + ' ' + sel.trim()).join(',') + '{');
  }

  function sheetPreviewHtml(sheetHtml) {
    return '<div class="rf-sheet-host"><style>' + scopeRules(sheetRules(), '.rf-sheet-host') +
      screenPageCss('.rf-sheet-host') + '</style>' + sheetHtml + '</div>';
  }

  // فایل Word از همان مارک‌آپ برگه ساخته می‌شود؛ فقط با تنظیم صفحهٔ A4 و
  // استایل جدولی بالا. BOM جلوی خراب‌شدن حروف فارسی در Word را می‌گیرد.
  function wordDocument(model) {
    return '\ufeff<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" dir="rtl">' +
      '<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>' + esc(model.title) + '</title>' +
      '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->' +
      '<style>' + docPageCss() + sheetRules() + '</style></head>' +
      '<body dir="rtl"><div class="WordSection1">' + buildSheet(model) + '</div></body></html>';
  }

  function xlsDocument(html) {
    return '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">' +
      '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>ATLAS SHIFT</x:Name>' +
      '<x:WorksheetOptions><x:DisplayRightToLeft/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->' +
      '<style>td,th{border:1px solid #c7cede;font-family:Tahoma;font-size:10pt;mso-number-format:"\\@";vertical-align:top}th{background:#eef1f8}</style></head><body dir="rtl">' +
      html + '</body></html>';
  }

  function csvDocument(model) {
    const rows = [];
    const push = cells => rows.push(cells.map(cell => '"' + String(cell == null ? '' : cell).replace(/"/g, '""') + '"').join(','));
    push(['ATLAS SHIFT', model.kind]);
    push([model.title]);
    push([model.stamp]);
    push([]);
    model.facts.forEach(fact => push([fact.label, fact.value || '']));
    (model.tables || []).forEach(table => {
      push([]);
      push([table.title]);
      push(table.headers);
      if (!table.rows.length) push(['موردی ثبت نشده است.']);
      table.rows.forEach(row => push(row));
    });
    return '\ufeff' + rows.join('\r\n');
  }

  function sheetTablesHtml(tables) {
    return (tables || []).map(table =>
      '<h3>' + esc(table.title) + '</h3><table><thead><tr>' + table.headers.map(head => '<th>' + esc(head) + '</th>').join('') + '</tr></thead><tbody>' +
      (table.rows.length ? table.rows.map(row => '<tr>' + row.map(cell => '<td>' + esc(cell || '—') + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + table.headers.length + '">موردی ثبت نشده است.</td></tr>') +
      '</tbody></table>').join('');
  }

  // برای Excel: هر آیتم برگه یک سطر «عنوان | مقدار» است تا در یک کاربرگ جا شود.
  function xlsSheetHtml(model) {
    const rows = model.facts.map(fact => '<tr><th>' + esc(fact.label) + '</th><td>' + esc(fact.value || '—') + '</td></tr>').join('');
    const tables = (model.tables || []).map(table =>
      '<tr><td colspan="2" style="background:#eef1f8"><b>' + esc(table.title) + '</b></td></tr>' +
      '<tr><td colspan="2"><table style="width:100%"><thead><tr>' + table.headers.map(head => '<th>' + esc(head) + '</th>').join('') + '</tr></thead><tbody>' +
      (table.rows.length ? table.rows.map(row => '<tr>' + row.map(cell => '<td>' + esc(cell || '—') + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + table.headers.length + '">موردی ثبت نشده است.</td></tr>') +
      '</tbody></table></td></tr>').join('');
    return '<table><tr><th colspan="2">' + esc(model.kind) + ' — ' + esc(model.title) + '</th></tr>' +
      '<tr><td colspan="2">' + esc(model.stamp) + '</td></tr>' + rows + tables + '</table>';
  }

  function runExport(format, model, sheetHtml) {
    const name = 'ATLAS-SHIFT-' + slug(model.title) + '-' + fileStamp();
    if (format === 'print') { printSheet(sheetHtml); return; }
    if (format === 'doc') { download(name + '.doc', wordDocument(model), 'application/msword'); return; }
    if (format === 'xls') { download(name + '.xls', xlsDocument(xlsSheetHtml(model)), 'application/vnd.ms-excel'); return; }
    download(name + '.csv', csvDocument(model), 'text/csv;charset=utf-8');
  }

  // ── رابط کاربری ────────────────────────────────────────────────
  let current = null;

  function closeFile() {
    if (!current) return;
    current.backdrop.remove();
    current = null;
  }

  function openPreview(format) {
    if (!current) return;
    const model = current.model;
    const sheetHtml = buildSheet(model);
    const label = EXPORT_FORMATS[format].label;
    const overlay = document.createElement('div');
    overlay.className = 'rf-preview-backdrop';
    // Word: خودِ همان فایلی که تحویل داده می‌شود در قاب پیش‌نمایش نشان داده
    // می‌شود، پس آنچه می‌بینی و آنچه ذخیره می‌شود یک سند و یک استایل است.
    const isDoc = format === 'doc';
    let docUrl = '';
    if (isDoc) {
      docUrl = URL.createObjectURL(new Blob([wordDocument(model)], { type: 'text/html;charset=utf-8' }));
    }
    overlay.innerHTML =
      '<div class="rf-preview-head"><strong>پیش‌نمایش خروجی — ' + esc(label) + '</strong>' +
      '<small>' + esc(EXPORT_FORMATS[format].hint) + ' این پیش‌نمایش همان چیزی است که در فایل/چاپ می‌آید.</small>' +
      '<div class="rf-preview-actions">' +
        '<button type="button" class="secondary-btn" data-rf-preview-cancel>انصراف</button>' +
        '<button type="button" class="primary-btn" data-rf-preview-ok>تأیید و دریافت خروجی</button>' +
      '</div></div>' +
      (isDoc
        ? '<div class="rf-preview-body is-frame"><iframe class="rf-preview-frame" title="' + esc(label) + '" src="' + esc(docUrl) + '"></iframe></div>'
        : '<div class="rf-preview-body">' + sheetPreviewHtml(sheetHtml) + '</div>');
    document.body.appendChild(overlay);
    const close = () => {
      overlay.remove();
      if (docUrl) setTimeout(() => URL.revokeObjectURL(docUrl), 1000);
    };
    overlay.querySelector('[data-rf-preview-cancel]').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('[data-rf-preview-ok]').addEventListener('click', () => {
      runExport(format, model, sheetHtml);
      close();
    });
  }

  function open(model) {
    closeFile();
    const sheetHtml = buildSheet(model);
    const backdrop = document.createElement('div');
    backdrop.className = 'rf-backdrop';
    backdrop.innerHTML =
      '<div class="rf-modal" role="dialog" aria-modal="true" aria-label="پرونده">' +
        '<div class="rf-head"><div><h3>' + esc(model.title) + '</h3><p>' + esc(model.kind) + ' — همهٔ اطلاعات ثبت‌شده در یک برگه</p></div>' +
        '<button type="button" class="rf-close" data-rf-close aria-label="بستن پرونده">×</button></div>' +
        '<div class="rf-body">' + sheetPreviewHtml(sheetHtml) + '</div>' +
        '<div class="rf-toolbar">' +
          Object.keys(EXPORT_FORMATS).map(format => '<button type="button" class="secondary-btn" data-rf-export="' + format + '">' + esc(EXPORT_FORMATS[format].label) + '</button>').join('') +
          '<small>هر خروجی اول پیش‌نمایش می‌شود؛ تأیید کن تا فایل ساخته شود.</small>' +
        '</div>' +
      '</div>';
    document.body.appendChild(backdrop);
    current = { backdrop: backdrop, model: model, sheetHtml: sheetHtml };
    backdrop.querySelector('[data-rf-close]').addEventListener('click', closeFile);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) closeFile(); });
    backdrop.querySelectorAll('[data-rf-export]').forEach(button => {
      button.addEventListener('click', () => openPreview(button.dataset.rfExport));
    });
  }

  function openModuleRecord(moduleKey, id) {
    const data = snapshot();
    const record = (data[moduleKey] || []).find(item => String(item.id) === String(id));
    if (!record) {
      if (window.ATLAS_MODULES && window.ATLAS_MODULES.render) { /* بخش فعلی را دست نمی‌زنیم */ }
      return;
    }
    open(moduleSheet(moduleKey, record, data));
  }

  document.addEventListener('atlas-open-file', event => {
    const detail = event.detail || {};
    if (detail.contact) { open(contactSheet(detail.contact)); return; }
    if (detail.module && detail.id) openModuleRecord(detail.module, detail.id);
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const preview = document.querySelector('.rf-preview-backdrop');
    if (preview) { preview.remove(); event.preventDefault(); return; }
    if (current) { closeFile(); event.preventDefault(); }
  });

  window.AtlasRecordFile = {
    openModule: openModuleRecord,
    openContact: contact => open(contactSheet(contact)),
    buildSheet: model => buildSheet(model),
    buildWord: model => wordDocument(model),
    buildPreview: model => sheetPreviewHtml(buildSheet(model))
  };
})();

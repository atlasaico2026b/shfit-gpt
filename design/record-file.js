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

  // برگهٔ پرونده: مدل داده، سپس HTML مشترک پیش‌نمایش/چاپ/فایل‌ها
  function buildSheet(model) {
    const facts = model.facts.map(fact => '<div class="rf-fact' + (fact.wide ? ' is-wide' : '') + '"><b>' + esc(fact.label) + '</b><span>' + (fact.value ? esc(fact.value) : '—') + '</span></div>').join('');
    const tables = (model.tables || []).map(table =>
      '<h3>' + esc(table.title) + '</h3>' +
      '<table><thead><tr>' + table.headers.map(head => '<th>' + esc(head) + '</th>').join('') + '</tr></thead><tbody>' +
      (table.rows.length
        ? table.rows.map(row => '<tr>' + row.map(cell => '<td>' + esc(cell || '—') + '</td>').join('') + '</tr>').join('')
        : '<tr><td colspan="' + table.headers.length + '">موردی ثبت نشده است.</td></tr>') +
      '</tbody></table>').join('');
    // عکس پرسنلی: کادر بالا و سمت چپ برگه؛ همان برگه در چاپ/PDF و Word هم می‌آید.
    const photo = model.photo
      ? '<div class="rf-sheet-photo"><img src="' + esc(model.photo) + '" alt="عکس پرسنلی"></div>'
      : '';
    return '<section class="rf-sheet' + (photo ? ' has-photo' : '') + '" dir="rtl">' +
      '<div class="rf-sheet-top">' +
        '<div class="rf-sheet-main">' +
          '<header class="rf-sheet-head">' +
            '<div class="rf-sheet-brand"><span>ATLAS SHIFT</span></div>' +
            '<div class="rf-sheet-title">' + esc(model.kind) + '<br>' + esc(model.stamp) + '</div>' +
          '</header>' +
          '<h2>' + esc(model.title) + '</h2>' +
          '<p class="rf-sheet-sub">' + esc(model.subtitle) + '</p>' +
        '</div>' +
        photo +
      '</div>' +
      '<div class="rf-facts">' + facts + '</div>' +
      tables +
      '<footer class="rf-sheet-foot"><span>' + esc(model.footNote) + '</span><span>' + esc(model.stamp) + '</span></footer>' +
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
    area.innerHTML = html;
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

  function wordDocument(html, title) {
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' + esc(title) + '</title>' +
      '<style>@page{size:A4;margin:10mm}body{font-family:Tahoma,"Segoe UI",sans-serif;direction:rtl;font-size:10pt;line-height:1.8;color:#16203a}' +
      '.rf-sheet{width:auto;padding:0;box-shadow:none}.rf-sheet-head{display:flex;justify-content:space-between;border-bottom:1.4px solid #16203a;padding-bottom:6px;margin-bottom:10px}' +
      '.rf-facts{display:grid;grid-template-columns:1fr 1fr;gap:2px 12px}.rf-fact{display:flex;gap:4px;border-bottom:1px dotted #cfd6e4}' +
      '.rf-fact b{flex:0 0 42%;color:#46506b}.rf-fact.is-wide{grid-column:1/-1}.rf-fact.is-wide b{flex-basis:22%}' +
      'table{width:100%;border-collapse:collapse;font-size:9pt}th,td{border:1px solid #c7cede;padding:3px 5px;text-align:right}th{background:#eef1f8}' +
      '.rf-sheet-foot{display:flex;justify-content:space-between;border-top:1px solid #c7cede;padding-top:6px;margin-top:12px;font-size:8pt;color:#5b6580}' +
      '.rf-sheet-top{display:flex;gap:8px;align-items:flex-start}.rf-sheet-main{flex:1 1 auto}.rf-sheet-photo{order:2;flex:0 0 auto;width:80px;height:100px;padding:2px;border:1px solid #16203a;text-align:center}' +
      '.rf-sheet-photo img{width:100%;height:100%;object-fit:cover;display:block}</style></head><body>' +
      html + '</body></html>';
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
    if (format === 'doc') { download(name + '.doc', wordDocument(sheetHtml, model.title), 'application/msword'); return; }
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
    overlay.innerHTML =
      '<div class="rf-preview-head"><strong>پیش‌نمایش خروجی — ' + esc(label) + '</strong>' +
      '<small>' + esc(EXPORT_FORMATS[format].hint) + ' این پیش‌نمایش همان چیزی است که در فایل/چاپ می‌آید.</small>' +
      '<div class="rf-preview-actions">' +
        '<button type="button" class="secondary-btn" data-rf-preview-cancel>انصراف</button>' +
        '<button type="button" class="primary-btn" data-rf-preview-ok>تأیید و دریافت خروجی</button>' +
      '</div></div>' +
      '<div class="rf-preview-body">' + sheetHtml + '</div>';
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
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
        '<div class="rf-body">' + sheetHtml + '</div>' +
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
    buildSheet: model => buildSheet(model)
  };
})();

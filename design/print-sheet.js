/* ── برگهٔ چاپ فهرست‌ها (A4 افقی) ──────────────────────────────────────────
   همهٔ بخش‌هایی که فهرست دارند (کارکنان، مرخصی‌ها، مأموریت‌ها، خودروها،
   گازسنج‌ها، ایستگاه‌ها، سوابق، …) خروجی چاپ/PDF خود را از همین‌جا می‌گیرند.
   قواعد ظاهر فقط در design/print.css است؛ این فایل فقط HTML برگه را
   می‌سازد: عنوان = نام موضوع، سرستون‌ها، بدنه و شمار ردیف‌ها. */
(function () {
  'use strict';

  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const ORG = 'ATLAS SHIFT';

  function fa(value) {
    return String(value == null ? '' : value).replace(/\d/g, d => FA_DIGITS[Number(d)]);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  // عنوان برگه = نام موضوع. پسوند سازمان («· ATLAS SHIFT») از عنوان حذف
  // می‌شود ولی بخش‌های معنادار عنوان (مثل نام شخص یا پلاک) می‌مانند.
  function subject(rawTitle, fallback) {
    const parts = String(rawTitle == null ? '' : rawTitle)
      .split('·')
      .map(part => part.replace(/\s+/g, ' ').trim())
      .filter(part => part && !/^atlas\s*shift$/i.test(part));
    return parts.join(' · ') || String(fallback || '').trim() || 'خروجی';
  }

  function columnCount(rows) {
    return (rows || []).reduce((max, row) => Math.max(max, (row || []).length), 0);
  }

  // تناسب اندازه با تعداد ستون: هرچه ستون بیشتر، فونت و فاصله ریزتر تا کل
  // عرض A4 افقی جا شود و ستون‌ها به هم نچسبند.
  function densityFor(columns) {
    if (columns >= 13) return 'tight';
    if (columns >= 9) return 'compact';
    return 'normal';
  }

  // پهنای ستون‌ها به اندازهٔ محتوایشان: ستون نام و محل خدمت پهن‌تر، ستون‌های
  // کوتاه (وضعیت، تعداد) باریک‌تر. مجموع همیشه ۱۰۰٪ عرض برگه است.
  function columnWeights(table, columns) {
    const weights = [];
    const header = table[0] || [];
    const body = table.slice(1);
    for (let i = 0; i < columns; i++) {
      // سرستون کمی سنگین‌تر حساب می‌شود تا عنوان‌ها در دو خط نشکنند.
      let weight = String(header[i] == null ? '' : header[i]).trim().length * 1.4;
      body.forEach(row => {
        const length = Math.min(String(row[i] == null ? '' : row[i]).trim().length, 34);
        weight = Math.max(weight, length);
      });
      weights.push(Math.max(6, Math.min(30, weight)));
    }
    return weights;
  }

  function columnPercents(table, columns) {
    const weights = columnWeights(table, columns);
    const total = weights.reduce((sum, w) => sum + w, 0) || 1;
    const percents = weights.map(w => Math.max(5, Math.round((w / total) * 100)));
    // باقی‌ماندهٔ گِردکردن به پهن‌ترین ستون اضافه می‌شود تا مجموع دقیقاً ۱۰۰ شود.
    const diff = 100 - percents.reduce((sum, p) => sum + p, 0);
    if (diff) {
      let widest = 0;
      percents.forEach((value, index) => { if (value > percents[widest]) widest = index; });
      percents[widest] = Math.max(5, percents[widest] + diff);
    }
    return percents;
  }

  // خانه‌های عددی (شماره، تاریخ، تلفن) در چاپ نباید وسط عدد شکسته شوند.
  function isNumericText(text) {
    const value = String(text == null ? '' : text).trim();
    return value.length > 0 && value.length <= 18 && /^[\d۰-۹][\d۰-۹\s/:\-—.]*$/.test(value);
  }

  function build(rows, options) {
    const o = options || {};
    const table = (rows || []).filter(row => Array.isArray(row) && row.length);
    const columns = Math.max(1, columnCount(table));
    const head = table.length ? table[0] : [];
    const body = table.slice(1);
    const title = subject(o.title, o.fallback);
    const stamp = o.stamp || '';
    const meta = [ORG, stamp ? 'تاریخ تهیه: ' + stamp : '', fa(body.length) + ' ردیف']
      .filter(Boolean)
      .join(' · ');

    const headCells = [];
    for (let i = 0; i < columns; i++) {
      headCells.push('<th scope="col">' + esc(head[i] == null ? '' : head[i]) + '</th>');
    }

    const bodyRows = body.map(row => {
      const cells = [];
      for (let i = 0; i < columns; i++) {
        const value = row[i] == null ? '' : row[i];
        cells.push('<td' + (isNumericText(value) ? ' class="atlas-print-num"' : '') + '>' + esc(value) + '</td>');
      }
      return '<tr>' + cells.join('') + '</tr>';
    }).join('');

    const colgroup = '<colgroup>' + columnPercents(table, columns)
      .map(percent => '<col style="width:' + percent + '%">').join('') + '</colgroup>';

    return '<header class="atlas-print-head">' +
        '<h1 class="atlas-print-title">' + esc(title) + '</h1>' +
        '<p class="atlas-print-meta">' + esc(meta) + '</p>' +
      '</header>' +
      '<table class="atlas-print-table" data-columns="' + columns + '">' +
        colgroup +
        '<thead><tr>' + headCells.join('') + '</tr></thead>' +
        '<tbody>' + (bodyRows || '<tr><td colspan="' + columns + '" class="atlas-print-empty">موردی برای نمایش ثبت نشده است.</td></tr>') + '</tbody>' +
      '</table>';
  }

  function render(host, rows, options) {
    if (!host) return;
    const table = (rows || []).filter(row => Array.isArray(row) && row.length);
    const columns = Math.max(1, columnCount(table));
    host.setAttribute('data-density', densityFor(columns));
    host.innerHTML = build(rows, options);
  }

  window.AtlasPrintSheet = {
    build: build,
    render: render,
    subject: subject,
    densityFor: densityFor,
    columnPercents: function (rows) {
      const table = (rows || []).filter(row => Array.isArray(row) && row.length);
      return columnPercents(table, Math.max(1, columnCount(table)));
    },
    isNumericText: isNumericText,
    fa: fa
  };
})();

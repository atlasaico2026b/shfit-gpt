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

  // ستون‌هایی که از این شماره به بعد عمودی نوشته می‌شوند.
  // اگر خروجی‌گیرنده خودش verticalFrom بدهد، همان ملاک است. وگرنه خودکار
  // تصمیم گرفته می‌شود: اگر ستون‌ها با فونت افقی در عرض A4 جا نشوند (پهنای
  // سهم هر ستون از محتوایش کمتر شود)، ستون‌های کوتاه (روز، وضعیت، تعداد) از
  // بالا به پایین نوشته می‌شوند تا فونت به‌هم نریزد. ستون‌های متنی بلند
  // (نام، محل خدمت) هرگز عمودی نمی‌شوند.
  const AUTO_VERTICAL_MAX_TEXT = 8;
  // عرض قابل استفادهٔ A4 افقی: ۲۹۷mm منهای حاشیهٔ ۹mm دو طرف.
  const PAGE_CONTENT_MM = 279;
  // پهنای تقریبی هر نویسه در فونت ۷pt برگه، به‌علاوهٔ padding دو طرف خانه.
  const CHAR_MM = 1.2;
  const CELL_PAD_MM = 2.4;

  function columnMaxLength(table, index) {
    let longest = 0;
    (table || []).forEach(row => {
      const length = String(row[index] == null ? '' : row[index]).trim().length;
      if (length > longest) longest = length;
    });
    return longest;
  }

  function requiredWidthMm(table, index) {
    return columnMaxLength(table, index) * CHAR_MM + CELL_PAD_MM;
  }

  function autoVerticalFrom(table, columns) {
    if (columns < 2) return -1;
    // پهنای واقعی هر ستون با تقسیم فعلی؛ اگر همه جا می‌شوند، افقی می‌مانند.
    const percents = columnPercents(table, columns, -1);
    const tooNarrow = percents.some((percent, index) =>
      (percent / 100) * PAGE_CONTENT_MM < requiredWidthMm(table, index));
    if (!tooNarrow) return -1;
    // ستون اول (نام کارمند / تاریخ) همیشه افقی می‌ماند.
    for (let i = 1; i < columns; i++) {
      let allShort = true;
      for (let j = i; j < columns; j++) {
        if (columnMaxLength(table, j) > AUTO_VERTICAL_MAX_TEXT) { allShort = false; break; }
      }
      if (allShort) return i;
    }
    return -1;
  }

  function resolveVerticalFrom(table, columns, requested) {
    if (Number.isInteger(requested) && requested >= 0 && requested < columns) return requested;
    return autoVerticalFrom(table, columns);
  }

  // پهنای ستون‌ها به اندازهٔ محتوایشان: ستون نام و محل خدمت پهن‌تر، ستون‌های
  // کوتاه (وضعیت، تعداد) باریک‌تر. مجموع همیشه ۱۰۰٪ عرض برگه است.
  function columnWeights(table, columns, verticalFrom) {
    const weights = [];
    const header = table[0] || [];
    const body = table.slice(1);
    for (let i = 0; i < columns; i++) {
      // ستون‌های عمودی (روزهای تقویم) فقط به اندازهٔ یک خط جا می‌گیرند؛ وزن
      // کوچک می‌گیرند تا ستون‌های اطلاعاتی (نام، محل خدمت) پهن و خوانا بمانند.
      if (verticalFrom >= 0 && i >= verticalFrom) {
        weights.push(2);
        continue;
      }
      // سرستون کمی سنگین‌تر حساب می‌شود تا عنوان‌ها در دو خط نشکنند.
      let weight = String(header[i] == null ? '' : header[i]).trim().length * 1.4;
      body.forEach(row => {
        const length = Math.min(String(row[i] == null ? '' : row[i]).trim().length, 34);
        weight = Math.max(weight, length);
      });
      // ستون اول (نام کارمند / تاریخ) باید خوانا بماند؛ در جدول‌های چندستونه
      // مثل تقویم شیفت، سرستون بلند تاریخ‌ها آن را به چند میلی‌متر می‌رساند.
      if (i === 0) weight *= 1.5;
      weights.push(Math.max(6, Math.min(30, weight)));
    }
    return weights;
  }

  function columnPercents(table, columns, verticalFrom) {
    const weights = columnWeights(table, columns, verticalFrom);
    const total = weights.reduce((sum, w) => sum + w, 0) || 1;
    // کف ۵٪ برای جدول‌های چندستونه (تقویم شیفت: یک ستون برای هر روز) مجموع را
    // از ۱۰۰٪ رد می‌کرد و جدول از عرض A4 بیرون می‌زد؛ کف با تعداد ستون‌ها
    // کوچک می‌شود تا مجموع همیشه دقیقاً ۱۰۰ بماند.
    const floor = Math.max(1, Math.min(5, Math.floor(100 / columns)));
    // سهم دقیق هر ستون، بعد گرد کردن با «بزرگ‌ترین باقیمانده»: مجموع دقیقاً
    // ۱۰۰ می‌شود و نسبت‌ها حفظ می‌مانند. روش قبلی (کم‌کردن از پهن‌ترین ستون)
    // در جدول‌های چندستونه ستون نام را تا کف ۲٪ خرد می‌کرد و فونت به‌هم می‌ریخت.
    const exact = weights.map(w => (w / total) * 100);
    const percents = exact.map(value => Math.max(floor, Math.floor(value)));
    let sum = percents.reduce((acc, p) => acc + p, 0);
    const byRemainder = exact
      .map((value, index) => ({ index: index, remainder: value - Math.floor(value) }))
      .sort((a, b) => b.remainder - a.remainder);
    let cursor = 0;
    while (sum < 100 && byRemainder.length) {
      percents[byRemainder[cursor % byRemainder.length].index] += 1;
      sum += 1;
      cursor += 1;
    }
    // اگر کف، مجموع را از ۱۰۰ رد کرد، از پهن‌ترین ستون‌ها کم می‌شود (نه از
    // ستون نام) تا هیچ ستونی زیر کف نرود.
    while (sum > 100) {
      let widest = 0;
      percents.forEach((value, index) => { if (value > percents[widest]) widest = index; });
      if (percents[widest] <= floor) break;
      percents[widest] -= 1;
      sum -= 1;
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
    const legend = String(o.legend == null ? '' : o.legend).trim();
    // ستون‌هایی که از این شماره به بعد باریک‌اند (روزهای تقویم) به‌صورت عمودی
    // نوشته می‌شوند تا با زیادشدن ستون‌ها فونت به‌هم نریزد.
    const verticalFrom = resolveVerticalFrom(table, columns, o.verticalFrom);
    const vertical = verticalFrom >= 0 && verticalFrom < columns;
    const meta = [ORG, stamp ? 'تاریخ تهیه: ' + stamp : '', fa(body.length) + ' ردیف']
      .filter(Boolean)
      .join(' · ');

    const headCells = [];
    for (let i = 0; i < columns; i++) {
      const cls = vertical && i >= verticalFrom ? ' class="atlas-print-vert"' : '';
      headCells.push('<th scope="col"' + cls + '>' + esc(head[i] == null ? '' : head[i]) + '</th>');
    }

    const bodyRows = body.map(row => {
      const cells = [];
      for (let i = 0; i < columns; i++) {
        const value = row[i] == null ? '' : row[i];
        const classes = [];
        if (isNumericText(value)) classes.push('atlas-print-num');
        if (vertical && i >= verticalFrom) classes.push('atlas-print-vert');
        cells.push('<td' + (classes.length ? ' class="' + classes.join(' ') + '"' : '') + '>' + esc(value) + '</td>');
      }
      return '<tr>' + cells.join('') + '</tr>';
    }).join('');

    const colgroup = '<colgroup>' + columnPercents(table, columns, vertical ? verticalFrom : -1)
      .map(percent => '<col style="width:' + percent + '%">').join('') + '</colgroup>';

    // سربرگ و حاشیهٔ بالا/پایین برگه داخل thead و tfoot می‌نشینند تا در هر صفحه
    // تکرار شوند. دلیل: با @page margin:0 (که سرصفحه/پاصفحهٔ مرورگر — آدرس سایت،
    // تاریخ و شمارهٔ صفحه — را حذف می‌کند) فاصلهٔ بالای صفحهٔ دوم به بعد از بین
    // می‌رفت؛ سطرهای فاصله‌دهندهٔ thead/tfoot همان حاشیه را در هر صفحه می‌سازند.
    return '<table class="atlas-print-table" data-columns="' + columns + '"' + (vertical ? ' data-vertical="1"' : '') + '>' +
        colgroup +
        '<thead>' +
          '<tr class="atlas-print-pad"><td colspan="' + columns + '"></td></tr>' +
          '<tr class="atlas-print-head-row"><td colspan="' + columns + '">' +
            '<header class="atlas-print-head">' +
              '<h1 class="atlas-print-title">' + esc(title) + '</h1>' +
              '<p class="atlas-print-meta">' + esc(meta) + '</p>' +
              (legend ? '<p class="atlas-print-legend">' + esc(legend) + '</p>' : '') +
            '</header>' +
          '</td></tr>' +
          '<tr class="atlas-print-cols">' + headCells.join('') + '</tr>' +
        '</thead>' +
        '<tbody>' + (bodyRows || '<tr><td colspan="' + columns + '" class="atlas-print-empty">موردی برای نمایش ثبت نشده است.</td></tr>') + '</tbody>' +
        '<tfoot><tr class="atlas-print-pad atlas-print-pad-bottom"><td colspan="' + columns + '"></td></tr></tfoot>' +
      '</table>';
  }

  function render(host, rows, options) {
    if (!host) return;
    const o = options || {};
    const table = (rows || []).filter(row => Array.isArray(row) && row.length);
    const columns = Math.max(1, columnCount(table));
    const verticalFrom = resolveVerticalFrom(table, columns, o.verticalFrom);
    host.setAttribute('data-density', densityFor(columns));
    // قواعد عمودی‌نویسی در print.css روی خودِ برگه (#atlasPrintArea) است، نه
    // روی جدول؛ اگر اینجا ست نشود، ستون‌ها افقی می‌مانند و فونت به‌هم می‌ریزد.
    if (verticalFrom >= 0 && verticalFrom < columns) host.setAttribute('data-vertical', '1');
    else host.removeAttribute('data-vertical');
    host.innerHTML = build(rows, o);
  }

  window.AtlasPrintSheet = {
    build: build,
    render: render,
    subject: subject,
    densityFor: densityFor,
    columnPercents: function (rows, verticalFrom) {
      const table = (rows || []).filter(row => Array.isArray(row) && row.length);
      return columnPercents(table, Math.max(1, columnCount(table)), Number.isInteger(verticalFrom) ? verticalFrom : -1);
    },
    isNumericText: isNumericText,
    resolveVerticalFrom: function (rows, requested) {
      const table = (rows || []).filter(row => Array.isArray(row) && row.length);
      return resolveVerticalFrom(table, Math.max(1, columnCount(table)), requested);
    },
    fa: fa
  };
})();

/* ── خروجی‌های سندی: Word (.docx) و CSV ───────────────────────────────────────
   تنها مرجع ساخت این دو خروجی در کل برنامه. هر بخشی که فهرست یا برگه دارد
   (کارکنان، مرخصی‌ها، مأموریت‌ها، خودروها، سوابق، گزارش‌ها، پرونده‌ها) از همین
   توابع استفاده می‌کند؛ پس ظاهر همهٔ خروجی‌ها یکدست است.

   قاعده‌ها:
   • برگهٔ «فهرست» همیشه A4 افقی (landscape) و برگهٔ «پرونده» همیشه A4 عمودی
     (portrait) است؛ همین چیزی که روی صفحه و در چاپ/PDF دیده می‌شود.
   • جدول Word: راست‌چین و راست‌به‌چپ (bidiVisual)، خط کامل بین همهٔ خانه‌ها،
     پهنای ستون‌ها متناسب با محتوا و همیشه داخل عرض کاغذ؛ ردیف سرستون در هر
     صفحه تکرار می‌شود و ردیف‌های بلند به‌جای «قیچی‌شدن» به صفحهٔ بعد می‌روند.
   • CSV: همان ردیف‌های برگه، با UTF-8 BOM و نشانهٔ راست‌به‌چپ در هر خانه تا
     کلمات فارسی در Excel به‌هم نریزند.

   این فایل به DOM وابسته نیست (به‌جز Blob) تا tests/export-docs.cjs بتواند
   خروجی‌ها را بدون مرورگر بسازد و اعتبارسنجی کند. */

(function () {
  'use strict';

  var RLM = '\u200F';
  var A4_PORTRAIT = { w: 11906, h: 16838 };
  var A4_LANDSCAPE = { w: 16838, h: 11906 };
  var MARGIN = 567;              // ۱ سانتی‌متر حاشیهٔ هر طرف
  var BORDER_INK = '7F8FA6';
  var HEAD_FILL = 'E8EEF7';
  var HEAD_INK = '14304F';
  var META_INK = '4B5563';
  var BODY_FONT = 'Tahoma';
  var HEAD_FONT = 'B Nazanin';

  // ── ابزارهای عمومی ────────────────────────────────────────────────────────
  function xmlEscape(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function text(value) {
    return String(value == null ? '' : value)
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function isNumeric(value) {
    var str = text(value);
    return str.length > 0 && str.length <= 18 && /^[\d۰-۹][\d۰-۹\s/:.-]*$/.test(str);
  }

  // عنوان برگه = نام موضوع؛ پسوند سازمان («· ATLAS SHIFT») حذف می‌شود، همان
  // قاعده‌ای که برگهٔ چاپ (design/print-sheet.js) دارد.
  function subject(rawTitle) {
    var parts = String(rawTitle == null ? '' : rawTitle).split('·')
      .map(function (part) { return part.replace(/\s+/g, ' ').trim(); })
      .filter(function (part) { return part && !/^atlas\s*shift$/i.test(part); });
    return parts.join(' · ') || 'خروجی';
  }

  // ردیف‌ها: فقط آرایه‌های غیرخالی؛ تعداد ستون‌ها یکسان می‌شود.
  function normalizeRows(rows) {
    var list = (rows || []).filter(function (row) { return Array.isArray(row) && row.length; })
      .map(function (row) { return row.map(text); });
    var columns = list.reduce(function (max, row) { return Math.max(max, row.length); }, 0);
    return list.map(function (row) {
      var out = row.slice(0, columns);
      while (out.length < columns) out.push('');
      return out;
    });
  }

  // پهنای ستون‌ها متناسب با محتوا (سرستون کمی سنگین‌تر) تا هیچ ستونی نچسبد و
  // هیچ ستونی هم بیش از اندازه پهن نشود.
  function columnWeights(rows) {
    var columns = rows.length ? rows[0].length : 0;
    var weights = [];
    for (var i = 0; i < columns; i += 1) {
      var weight = text((rows[0] || [])[i]).length * 1.4;
      for (var r = 1; r < rows.length; r += 1) {
        weight = Math.max(weight, Math.min(text(rows[r][i]).length, 34));
      }
      weights.push(Math.max(6, Math.min(30, weight)));
    }
    return weights;
  }

  function columnWidths(rows, totalTwips) {
    var weights = columnWeights(rows);
    var sum = weights.reduce(function (a, b) { return a + b; }, 0) || 1;
    var widths = weights.map(function (weight) { return Math.max(520, Math.round((weight / sum) * totalTwips)); });
    // باقی‌ماندهٔ گِردکردن به پهن‌ترین ستون می‌رسد تا مجموع دقیقاً عرض کاغذ شود.
    var diff = totalTwips - widths.reduce(function (a, b) { return a + b; }, 0);
    if (diff) {
      var widest = widths.indexOf(Math.max.apply(null, widths));
      widths[widest] = Math.max(520, widths[widest] + diff);
    }
    return widths;
  }

  // اندازهٔ قلم بر اساس تعداد ستون‌ها: هرچه ستون بیشتر، ریزتر (هم‌اندازهٔ چاپ).
  function density(columns) {
    if (columns >= 13) return { body: 14, head: 15, pad: 40 };
    if (columns >= 9) return { body: 16, head: 17, pad: 60 };
    return { body: 18, head: 19, pad: 80 };
  }

  // ── ZIP (بدون فشرده‌سازی، استاندارد و آفلاین) ────────────────────────────
  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i += 1) {
      crc ^= bytes[i];
      for (var bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function le16(value) { return [value & 255, (value >>> 8) & 255]; }
  function le32(value) { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]; }

  function zip(entries) {
    var encoder = new TextEncoder();
    var chunks = [];
    var central = [];
    var offset = 0;
    var now = new Date();
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    var dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    entries.forEach(function (entry) {
      var name = encoder.encode(entry.name);
      var data = entry.bytes || encoder.encode(entry.content);
      var crc = crc32(data);
      var local = [].concat(le32(0x04034B50), le16(20), le16(0x0800), le16(0), le16(dosTime), le16(dosDate),
        le32(crc), le32(data.length), le32(data.length), le16(name.length), le16(0));
      var localHeader = new Uint8Array(local);
      chunks.push(localHeader, name, data);
      central.push({ name: name, crc: crc, size: data.length, offset: offset, time: dosTime, date: dosDate });
      offset += localHeader.length + name.length + data.length;
    });

    var centralStart = offset;
    var centralSize = 0;
    central.forEach(function (item) {
      var head = [].concat(le32(0x02014B50), le16(20), le16(20), le16(0x0800), le16(0), le16(item.time), le16(item.date),
        le32(item.crc), le32(item.size), le32(item.size), le16(item.name.length), le16(0), le16(0),
        le16(0), le16(0), le32(0), le32(item.offset));
      var header = new Uint8Array(head);
      chunks.push(header, item.name);
      centralSize += header.length + item.name.length;
    });

    var end = new Uint8Array([].concat(le32(0x06054B50), le16(0), le16(0), le16(central.length), le16(central.length),
      le32(centralSize), le32(centralStart), le16(0)));
    chunks.push(end);
    return new Blob(chunks, { type: 'application/zip' });
  }

  // ── Word (.docx) ──────────────────────────────────────────────────────────
  // sheet = { title, subtitle, stamp, footNote, landscape,
  //           facts: [[label, value], …], tables: [{heading, rows}] }
  // ترتیب فرزندان هر عنصر در OOXML «دنباله» است و Word ترتیب نادرست را
  // نمی‌بخشد؛ پس هر عنصر با ترتیب استاندارد ساخته می‌شود.
  function wordRun(options) {
    var o = options || {};
    var font = o.font || BODY_FONT;
    var size = o.size || 18;
    return '<w:rPr>' +
      '<w:rFonts w:ascii="' + xmlEscape(font) + '" w:hAnsi="' + xmlEscape(font) + '" w:cs="' + xmlEscape(font) + '"/>' +
      (o.bold ? '<w:b/><w:bCs/>' : '') +
      (o.color ? '<w:color w:val="' + o.color + '"/>' : '') +
      '<w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/>' +
      '<w:rtl/><w:lang w:bidi="fa-IR"/></w:rPr>';
  }

  function wordParagraph(content, options) {
    var o = options || {};
    return '<w:p><w:pPr><w:bidi/>' +
      '<w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after == null ? 90 : o.after) + '" w:line="' + (o.line || 260) + '" w:lineRule="auto"/>' +
      '<w:jc w:val="' + (o.align || 'right') + '"/></w:pPr>' +
      '<w:r>' + wordRun({ bold: o.bold, size: o.size, font: o.font, color: o.color }) +
      '<w:t xml:space="preserve">' + xmlEscape(content) + '</w:t></w:r></w:p>';
  }

  function wordTable(rows, contentWidth) {
    if (!rows.length) return '';
    var columns = rows[0].length;
    var widths = columnWidths(rows, contentWidth);
    var type = density(columns);
    var borders = '<w:tblBorders>' +
      '<w:top w:val="single" w:sz="8" w:space="0" w:color="' + BORDER_INK + '"/>' +
      '<w:left w:val="single" w:sz="8" w:space="0" w:color="' + BORDER_INK + '"/>' +
      '<w:bottom w:val="single" w:sz="8" w:space="0" w:color="' + BORDER_INK + '"/>' +
      '<w:right w:val="single" w:sz="8" w:space="0" w:color="' + BORDER_INK + '"/>' +
      '<w:insideH w:val="single" w:sz="6" w:space="0" w:color="' + BORDER_INK + '"/>' +
      '<w:insideV w:val="single" w:sz="6" w:space="0" w:color="' + BORDER_INK + '"/>' +
      '</w:tblBorders>';
    var margins = '<w:tblCellMar>' +
      '<w:top w:w="' + type.pad + '" w:type="dxa"/><w:left w:w="' + type.pad + '" w:type="dxa"/>' +
      '<w:bottom w:w="' + type.pad + '" w:type="dxa"/><w:right w:w="' + type.pad + '" w:type="dxa"/>' +
      '</w:tblCellMar>';
    var grid = '<w:tblGrid>' + widths.map(function (width) {
      return '<w:gridCol w:w="' + width + '"/>';
    }).join('') + '</w:tblGrid>';

    var body = rows.map(function (row, rowIndex) {
      var header = rowIndex === 0;
      var cells = row.map(function (value, columnIndex) {
        var shading = header ? '<w:shd w:val="clear" w:color="auto" w:fill="' + HEAD_FILL + '"/>' : '';
        var align = header ? 'center' : (isNumeric(value) ? 'center' : 'right');
        return '<w:tc><w:tcPr><w:tcW w:w="' + widths[columnIndex] + '" w:type="dxa"/>' + shading +
          '<w:vAlign w:val="center"/></w:tcPr>' +
          '<w:p><w:pPr><w:bidi/>' +
          '<w:spacing w:before="0" w:after="0" w:line="' + (header ? 240 : 250) + '" w:lineRule="auto"/>' +
          '<w:jc w:val="' + align + '"/></w:pPr>' +
          '<w:r>' + wordRun({ bold: header, size: header ? type.head : type.body, color: header ? HEAD_INK : '' }) +
          '<w:t xml:space="preserve">' + xmlEscape(value) + '</w:t></w:r></w:p></w:tc>';
      }).join('');
      // سرستون در هر صفحه تکرار می‌شود و نمی‌شکند؛ ردیف‌های داده اگر بلندتر از
      // یک صفحه شوند به صفحهٔ بعد می‌روند تا هیچ متنی «قیچی» نشود.
      var rowProps = '<w:trPr>' + (header ? '<w:cantSplit/>' : '') +
        '<w:trHeight w:val="' + (header ? 380 : 320) + '" w:hRule="atLeast"/>' +
        (header ? '<w:tblHeader/>' : '') + '</w:trPr>';
      return '<w:tr>' + rowProps + cells + '</w:tr>';
    }).join('');

    return '<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="' + contentWidth + '" w:type="dxa"/>' +
      '<w:jc w:val="right"/>' + borders + '<w:tblLayout w:type="fixed"/>' + margins +
      '</w:tblPr>' + grid + body + '</w:tbl>';
  }

  // عکس پرونده: data URL به بایت و نوع تصویر تبدیل می‌شود تا داخل فایل Word
  // (نه لینک بیرونی) جاسازی شود.
  function decodeBase64(base64) {
    if (typeof atob === 'function') {
      var binary = atob(base64);
      var out = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
      return out;
    }
    var buffer = Buffer.from(base64, 'base64');
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  function photoPart(dataUrl) {
    var match = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(String(dataUrl || ''));
    if (!match) return null;
    var ext = match[1].toLowerCase() === 'png' ? 'png' : 'jpeg';
    return { name: 'word/media/photo.' + (ext === 'png' ? 'png' : 'jpg'), bytes: decodeBase64(match[2]), ext: ext };
  }

  function photoParagraph(rid, widthTwips, heightTwips) {
    var cx = widthTwips * 635;
    var cy = heightTwips * 635;
    return '<w:p><w:pPr><w:bidi/><w:jc w:val="left"/><w:spacing w:after="120"/></w:pPr><w:r><w:drawing>' +
      '<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
      '<wp:docPr id="1" name="عکس پرونده"/><wp:cNvGraphicFramePr/>' +
      '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
      '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:nvPicPr><pic:cNvPr id="1" name="photo"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>' +
      '</wp:inline></w:drawing></w:r></w:p>';
  }

  function docxStyles() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="' + BODY_FONT + '" w:hAnsi="' + BODY_FONT + '" w:cs="' + BODY_FONT + '"/>' +
      '<w:sz w:val="20"/><w:szCs w:val="20"/><w:rtl/><w:lang w:bidi="fa-IR" w:val="en-US"/>' +
      '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      '</w:styles>';
  }

  function docx(sheet) {
    var model = sheet || {};
    var landscape = model.landscape !== false;
    var page = landscape ? A4_LANDSCAPE : A4_PORTRAIT;
    var contentWidth = page.w - MARGIN * 2;

    var parts = [];
    var photo = photoPart(model.photo);
    if (photo) parts.push(photoParagraph('rIdPhoto', 2160, 2880));   // ۱٫۵ × ۲ اینچ
    parts.push(wordParagraph(model.title || '', { bold: true, size: 34, font: HEAD_FONT, after: 120, line: 300, color: HEAD_INK }));
    if (model.subtitle) parts.push(wordParagraph(model.subtitle, { size: 20, color: META_INK, after: 60 }));
    if (model.stamp) parts.push(wordParagraph(model.stamp, { size: 18, color: META_INK, after: 40 }));
    if (model.meta) parts.push(wordParagraph(model.meta, { size: 18, color: META_INK, after: 160 }));

    if (model.facts && model.facts.length) {
      parts.push(wordTable([['عنوان', 'مقدار']].concat(model.facts.map(function (fact) {
        return [text(fact[0]), text(fact[1]) || '—'];
      })), contentWidth));
    }

    (model.tables || []).forEach(function (table) {
      if (table.heading) parts.push(wordParagraph(table.heading, { bold: true, size: 22, color: HEAD_INK, before: 200, after: 80 }));
      parts.push(wordTable(normalizeRows(table.rows), contentWidth));
    });

    if (model.footNote) parts.push(wordParagraph(model.footNote, { size: 16, color: META_INK, before: 200 }));

    var sectPr = '<w:sectPr><w:pgSz w:w="' + page.w + '" w:h="' + page.h + '"' + (landscape ? ' w:orient="landscape"' : '') + '/>' +
      '<w:pgMar w:top="' + MARGIN + '" w:right="' + MARGIN + '" w:bottom="' + MARGIN + '" w:left="' + MARGIN + '" w:header="284" w:footer="284" w:gutter="0"/>' +
      '<w:bidi/></w:sectPr>';

    var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>' +
      parts.join('') + sectPr + '</w:body></w:document>';

    var entries = [
      { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        (photo ? '<Default Extension="' + (photo.ext === 'png' ? 'png' : 'jpg') + '" ContentType="' + (photo.ext === 'png' ? 'image/png' : 'image/jpeg') + '"/>' : '') +
        '</Types>' },
      { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>' },
      { name: 'word/_rels/document.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        (photo ? '<Relationship Id="rIdPhoto" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/photo.' + (photo.ext === 'png' ? 'png' : 'jpg') + '"/>' : '') +
        '</Relationships>' },
      { name: 'word/styles.xml', content: docxStyles() },
      { name: 'word/document.xml', content: documentXml }
    ];
    if (photo) entries.push({ name: photo.name, bytes: photo.bytes });
    return zip(entries);
  }

  // ── CSV ───────────────────────────────────────────────────────────────────
  // CSV نقشی جز متن خام ندارد؛ برای اینکه کلمات فارسی در Excel به‌هم نریزند،
  // هر خانه با نشانهٔ راست‌به‌چپ (RLM) شروع می‌شود و خانه‌های عددی دست‌نخورده
  // می‌مانند. ساختار ردیف‌ها همان برگهٔ دیده‌شده است: عنوان، تاریخ، سرستون، داده.
  function csvCell(value) {
    var str = String(value == null ? '' : value).replace(/\r?\n/g, ' ');
    var quoted = '"' + str.replace(/"/g, '""') + '"';
    if (!str) return quoted;
    if (/^[=+\-@\t\r]/.test(str)) return '"\'' + str.replace(/"/g, '""') + '"';
    if (isNumeric(str)) return quoted;
    return '"' + RLM + str.replace(/"/g, '""') + '"';
  }

  function csv(rows, options) {
    var o = options || {};
    // ragged: ردیف‌ها هم‌عرض نمی‌شوند؛ برای برگه‌ای که چند جدول با عرض‌های
    // مختلف دارد (مشاهدهٔ پرونده) ساختار اصلی خودش حفظ می‌شود.
    var table = o.ragged
      ? (rows || []).map(function (row) { return (row || []).map(text); })
      : normalizeRows(rows);
    var lines = [];
    if (o.title) lines.push(csvCell(subject(o.title)));
    if (!o.ragged) {
      var meta = [o.stamp ? 'تاریخ تهیه: ' + o.stamp : '', table.length > 1 ? (table.length - 1) + ' ردیف' : '']
        .filter(Boolean).join(' · ');
      if (meta) lines.push(csvCell(meta));
    }
    table.forEach(function (row) { lines.push(row.map(csvCell).join(',')); });
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  window.AtlasExportDocs = {
    csv: csv,
    docx: docx,
    zip: zip,
    normalizeRows: normalizeRows,
    columnWidths: columnWidths,
    subject: subject
  };
})();

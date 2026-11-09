/* ── نوشتار عمودی خودکار ──────────────────────────────────────────────────
   اصل: نوشتار افقی. این فایل فقط سرستون‌هایی را عمودی می‌کند که بلندترین
   کلمه‌شان در عرض ستون جا نمی‌شود؛ یعنی همان‌جا که نوشتار افقی کلمه را
   می‌شکند. اندازه‌گیری با canvas انجام می‌شود تا به چیدمان صفحه دست نزنیم.
   برای جلوگیری از لرزش، افزودن و برداشتن کلاس آستانهٔ جدا دارد (هیسترزیس).
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const VERT = 'atlas-vert';
  const MAX_LEN = 30;
  const ADD_SLACK = 1;      // اگر بلندترین کلمه حتی ۱px هم جا نشود، عمودی
  const REMOVE_SLACK = 1.35; // فقط وقتی خیلی جا باز شد، دوباره افقی

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const cache = new Map();

  function measure(text, font) {
    const key = font + '\u0000' + text;
    let width = cache.get(key);
    if (width == null) {
      ctx.font = font;
      width = ctx.measureText(text).width;
      cache.set(key, width);
    }
    return width;
  }

  function widestWord(text, font) {
    return String(text).trim().split(/\s+/).reduce(function (max, word) {
      return Math.max(max, measure(word, font));
    }, 0);
  }

  function fontOf(style) {
    return [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(' ');
  }

  function labelOf(cell) {
    return cell.querySelector('.module-sort-label') || cell;
  }

  function availableWidth(cell) {
    const style = getComputedStyle(cell);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    return cell.clientWidth - padX;
  }

  // true = باید عمودی شود، false = باید افقی بماند، null = تصمیم نگیر.
  function decide(cell) {
    if (cell.classList.contains('atlas-print-vert')) return null;
    if (cell.querySelector('input, select, textarea, img, svg')) return null;
    const label = labelOf(cell);
    const text = (label.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > MAX_LEN) return null;
    const style = getComputedStyle(label);
    if (style.display === 'none' || style.visibility === 'hidden') return null;
    const avail = availableWidth(cell);
    if (!(avail > 0)) return null;
    const widest = widestWord(text, fontOf(style));
    if (cell.classList.contains(VERT)) return widest * REMOVE_SLACK < avail ? false : true;
    return widest > avail + ADD_SLACK;
  }

  function apply(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const cells = scope.querySelectorAll('.module-table th, .sp-grid th, .atlas-print-table th');
    let changed = 0;
    Array.prototype.forEach.call(cells, function (cell) {
      const want = decide(cell);
      if (want === null) return;
      if (want && !cell.classList.contains(VERT)) { cell.classList.add(VERT); changed++; }
      else if (!want && cell.classList.contains(VERT)) { cell.classList.remove(VERT); changed++; }
    });
    return changed;
  }

  let timer = 0;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(function () { apply(document); }, 120);
  }

  function watch() {
    if (typeof MutationObserver !== 'function' || !document.body) return;
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    // در چاپ، عرض واقعی ستون‌ها تازه معلوم می‌شود؛ همان لحظه تصمیم گرفته شود.
    window.addEventListener('beforeprint', function () { apply(document); });
  }

  window.AtlasVertical = {
    apply: apply,
    schedule: schedule,
    widestWord: widestWord,
    decide: decide
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { watch(); schedule(); });
  } else {
    watch();
    schedule();
  }
})();

/* ── مسیردهی اسکرول: تنها مرجع رفتار چرخ موس و لمس در کل برنامه ──────────────
   قانون‌ها (به همین ترتیب):
     1) اگر نشانگر روی یک ناحیهٔ اسکرول‌شونده باشد، همان ناحیه اسکرول می‌شود و
        دیگر هیچ‌چیز (پنجرهٔ زیرین، بدنه، صفحه) حرکت نمی‌کند.
     2) اگر نشانگر روی حاشیهٔ یک پنل شناور (لیست بازشو، تقویم، مودال، کشو…)
        باشد، اسکرول به محتوای همان پنل داده می‌شود.
     3) در غیر این صورت، رفتار پیش‌فرض مرورگر (اسکرول صفحه) آزاد است؛ مگر اینکه
        یک لایهٔ باز بالای صفحه باشد که در آن صورت صفحهٔ زیرین تکان نمی‌خورد.
   برای اصلاح رفتار اسکرول در کل برنامه فقط همین فایل را تغییر دهید.
   یک CSS کنارِ همین فایل (design/scroll-routing.css) وظیفهٔ مهار «سرریز» و
   رفتار لمسی را دارد. */
(function () {
  'use strict';

  // پنل‌های شناوری که اسکرول داخلشان نباید به صفحه سرریز کند.
  const OVERLAY_SELECTOR = [
    '.atlas-combo-panel',
    '.jalali-popover',
    '.calendar-panel',
    '.atlas-pb-modal',
    '.rf-backdrop',
    '.option-manager',
    '[data-modal-backdrop]',
    '[role="dialog"]',
    '#settingsPanel',
    '#notificationDrawer',
    '.drawer'
  ].join(',');

  const SCROLL_OVERFLOW = /(auto|scroll|overlay)/;

  function styleOf(el) {
    return window.getComputedStyle(el);
  }

  function scrollAxis(el) {
    if (!el || el.nodeType !== 1) return null;
    const style = styleOf(el);
    if (SCROLL_OVERFLOW.test(style.overflowY) && el.scrollHeight - el.clientHeight > 2) return 'y';
    if (SCROLL_OVERFLOW.test(style.overflowX) && el.scrollWidth - el.clientWidth > 2) return 'x';
    return null;
  }

  // نزدیک‌ترین جد اسکرول‌شونده نسبت به یک عنصر (بدنه و html حساب نمی‌شوند).
  function scrollerAt(node) {
    let current = node && node.nodeType === 1 ? node : (node && node.parentElement);
    while (current && current !== document.body && current !== document.documentElement) {
      if (scrollAxis(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function canScroll(el, delta) {
    if (Math.abs(delta) < 0.5) return true;
    return delta > 0
      ? el.scrollTop + el.clientHeight < el.scrollHeight - 1
      : el.scrollTop > 0;
  }

  function overlayOf(node) {
    const el = node && node.nodeType === 1 ? node : (node && node.parentElement);
    return el && el.closest ? el.closest(OVERLAY_SELECTOR) : null;
  }

  // اولین ناحیهٔ اسکرول‌شوندهٔ عمودی داخل یک پنل (برای وقتی نشانگر روی حاشیه است).
  function scrollerIn(root, delta) {
    if (!root) return null;
    const nodes = root.querySelectorAll('*');
    let fallback = null;
    for (let i = 0; i < nodes.length; i += 1) {
      const el = nodes[i];
      if (scrollAxis(el) !== 'y') continue;
      if (canScroll(el, delta)) return el;
      if (!fallback) fallback = el;
    }
    return fallback;
  }

  function isOpenLayer(el) {
    if (!el || el.hidden) return false;
    const style = styleOf(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 4 && rect.height > 4;
  }

  function openLayers() {
    const layers = [];
    Array.prototype.slice.call(document.querySelectorAll('[data-modal-backdrop]')).forEach(function (node) {
      if (isOpenLayer(node)) layers.push(node);
    });
    ['#settingsPanel', '#notificationDrawer'].forEach(function (selector) {
      const node = document.querySelector(selector);
      if (node && node.classList.contains('open') && isOpenLayer(node)) layers.push(node);
    });
    return layers;
  }

  function topLayer() {
    const layers = openLayers();
    let top = null;
    let topZ = -Infinity;
    layers.forEach(function (node) {
      const z = parseInt(styleOf(node).zIndex, 10);
      const value = isNaN(z) ? 0 : z;
      if (value >= topZ) { top = node; topZ = value; }
    });
    return top;
  }

  function onWheel(event) {
    if (event.defaultPrevented || event.ctrlKey) return;
    // اسکرول افقی (نوارهای افقی، کشوی کارت‌ها) با مرورگر می‌ماند.
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

    // ۱) ناحیهٔ اسکرول‌شوندهٔ زیر نشانگر همیشه برنده است.
    const scroller = scrollerAt(event.target);
    if (scroller) {
      // در لبهٔ انتهایی، چرخ نباید به پنجرهٔ زیرین یا صفحه سرریز کند.
      if (!canScroll(scroller, event.deltaY)) event.preventDefault();
      event.stopPropagation();
      return;
    }

    // ۲) حاشیهٔ پنل شناور: اسکرول به محتوای همان پنل.
    const overlay = overlayOf(event.target);
    if (overlay) {
      const inner = scrollerIn(overlay, event.deltaY);
      if (inner) {
        const max = inner.scrollHeight - inner.clientHeight;
        inner.scrollTop = Math.max(0, Math.min(max, inner.scrollTop + event.deltaY));
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // ۳) لایهٔ باز (مودال/کشو): صفحهٔ زیرین نباید حرکت کند.
    const layer = topLayer();
    if (!layer) return;
    const inLayer = layer.contains(event.target);
    const target = inLayer ? scrollerIn(layer, event.deltaY) : null;
    if (target) {
      const max = target.scrollHeight - target.clientHeight;
      target.scrollTop = Math.max(0, Math.min(max, target.scrollTop + event.deltaY));
    }
    event.preventDefault();
  }

  // capture تا قبل از هر شنوندهٔ دیگری تصمیم بگیرد و از دوباره‌کاری جلوگیری کند.
  document.addEventListener('wheel', onWheel, { passive: false, capture: true });

  window.AtlasScroll = {
    scrollerAt: scrollerAt,
    scrollerIn: scrollerIn,
    isScrollable: function (el) { return !!scrollAxis(el); },
    overlayOf: overlayOf,
    contain: function (el) {
      if (!el || !el.style) return el;
      el.style.overscrollBehavior = 'contain';
      return el;
    }
  };
})();

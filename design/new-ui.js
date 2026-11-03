/* ============================================================================
   ATLAS SHIFT · NEW UI LAYER — رفتارهای کوچک (design/new-ui.js)
   ----------------------------------------------------------------------------
   فقط چیزهایی که با CSS خالص ممکن نیست:
     · ردیف ۱۳ — انیمیشن ارسال کامنت داشبورد
     · ردیف ۹  — جای نور دنبال‌کنندهٔ ماوس روی دکمه‌های ثبت سریع
     · ردیف ۱۲ — علامت‌گذاری کارت پنجره‌ای که با کلیک از داک باز شده
   ========================================================================== */
(function () {
  'use strict';

  /* ── ردیف ۱۳ · ارسال کامنت ─────────────────────────────────────────── */
  document.addEventListener('click', function (event) {
    const save = event.target.closest('[data-dash-comment-save]');
    if (!save) return;
    save.classList.add('is-sending');
    window.setTimeout(function () { save.classList.add('is-sent'); }, 520);
    window.setTimeout(function () {
      save.classList.remove('is-sending', 'is-sent');
    }, 2200);
  }, true);

  /* ── ردیف ۹ · نور دنبال‌کنندهٔ ماوس روی ثبت سریع ────────────────────── */
  document.addEventListener('pointermove', function (event) {
    const btn = event.target.closest('.quick-add-btn');
    if (!btn) return;
    const box = btn.getBoundingClientRect();
    if (!box.width || !box.height) return;
    btn.style.setProperty('--nu-x', Math.round(((event.clientX - box.left) / box.width) * 100) + '%');
    btn.style.setProperty('--nu-y', Math.round(((event.clientY - box.top) / box.height) * 100) + '%');
  }, { passive: true });

  /* ── ردیف ۱۲ · کارت فعال از داک ────────────────────────────────────── */
  document.addEventListener('click', function (event) {
    const dockItem = event.target.closest('.widget-dock-item');
    if (!dockItem) return;
    const target = dockItem.dataset.targetWidget;
    if (!target) return;
    document.querySelectorAll('.widget.nu-focus').forEach(function (node) { node.classList.remove('nu-focus'); });
    const widget = document.querySelector('.widget[data-widget="' + target + '"]') ||
      document.getElementById(target);
    if (widget) widget.classList.add('nu-focus');
  }, true);

  /* استایل کوچک برای همان کارت فعال‌شده از داک */
  const style = document.createElement('style');
  style.textContent = '.widget.nu-focus{transform:translateY(-3px)}' +
    '.widget.nu-focus::before{opacity:.85}';
  document.head.appendChild(style);
})();

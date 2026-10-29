/* ============================================================================
   ATLAS SHIFT · THEME SWITCHER (design layer)
   ----------------------------------------------------------------------------
   تنها جایی که «انتخاب پوسته» انجام می‌شود. این فایل هیچ رنگی نمی‌شناسد؛ فقط
   نام پوسته را روی <html> می‌گذارد و بقیهٔ کار در CSS انجام می‌شود
   (design/tokens.css → بخش THEME PRESETS).

   API
     AtlasDesign.apply(name, persist)      اعمال پوسته
     AtlasDesign.current()                 نام پوستهٔ فعال
     AtlasDesign.cloudDefaults()           رنگ‌های پیش‌فرض ابر پس‌زمینه (از CSS)
   ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'atlasShiftAppTheme';
  var DEFAULT_THEME = 'cloud-glass';
  var THEMES = ['cloud-glass', 'theme-two'];

  function read() {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
    } catch (error) {
      return DEFAULT_THEME;
    }
  }

  function write(name) {
    try {
      localStorage.setItem(STORAGE_KEY, name);
    } catch (error) {
      /* حالت خصوصی مرورگر */
    }
  }

  function cssVar(name, fallback) {
    var value = '';
    try {
      value = getComputedStyle(document.documentElement).getPropertyValue(name);
    } catch (error) {
      value = '';
    }
    value = String(value || '').trim();
    return value || fallback;
  }

  function apply(name, persist) {
    var selected = THEMES.indexOf(name) >= 0 ? name : DEFAULT_THEME;
    var root = document.documentElement;
    root.dataset.appTheme = selected;
    Array.prototype.forEach.call(document.querySelectorAll('[data-app-theme]'), function (option) {
      var active = option.dataset.appTheme === selected;
      option.classList.toggle('active', active);
      option.setAttribute('aria-pressed', String(active));
    });
    if (persist !== false) write(selected);
    return selected;
  }

  window.AtlasDesign = {
    themes: THEMES.slice(),
    defaultTheme: DEFAULT_THEME,
    apply: apply,
    current: function () {
      return document.documentElement.dataset.appTheme || read();
    },
    cloudDefaults: function () {
      return {
        colors: [
          cssVar('--cloud-default-1', ''),
          cssVar('--cloud-default-2', ''),
          cssVar('--cloud-default-3', '')
        ],
        strength: Number(cssVar('--cloud-default-strength', '32')) || 32
      };
    }
  };
})();

/* ─────────────────────────────────────────────────────────────────────────
   ATLAS GLYPHS — مجموعهٔ آیکون اختصاصی برنامه
   زبان طراحی: شبکهٔ ۲۴×۲۴، خط ۱.۷ با سرهای گرد، و یک لایهٔ «توپر» کم‌رنگ
   زیر خط‌ها (duotone) تا آیکون‌ها عمق و شخصیت داشته باشند.
   استفاده: <span data-atlas-icon="dashboard"></span>  یا  ATLAS_ICONS.dashboard
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  const ICONS = {
    dashboard:
      '<g class="f"><rect x="3" y="3" width="7.6" height="7.6" rx="2.3"/></g>' +
      '<g class="s"><rect x="3" y="3" width="7.6" height="7.6" rx="2.3"/><rect x="13.4" y="3" width="7.6" height="7.6" rx="2.3"/><rect x="3" y="13.4" width="7.6" height="7.6" rx="2.3"/><rect x="13.4" y="13.4" width="7.6" height="7.6" rx="2.3"/></g>',

    employees:
      '<g class="f"><circle cx="9.4" cy="8" r="3.7"/><path d="M2.8 20.6c0-3.4 3-5.8 6.6-5.8s6.6 2.4 6.6 5.8z"/></g>' +
      '<g class="s"><circle cx="9.4" cy="8" r="3.7"/><path d="M2.8 20.6c0-3.4 3-5.8 6.6-5.8s6.6 2.4 6.6 5.8"/><path d="M16.4 4.7a3.4 3.4 0 0 1 0 6.7"/><path d="M18.3 15.3c1.8.7 2.9 2.3 2.9 4.3"/></g>',

    shifts:
      '<g class="f"><circle cx="12" cy="12" r="8.4"/></g>' +
      '<g class="s"><circle cx="12" cy="12" r="8.4"/><path d="M12 7.2V12l3.2 2"/><path d="M3.9 8.6 2.6 5.4l3.3-.4"/><path d="M20.1 15.4l1.3 3.2-3.3.4"/></g>',

    missions:
      '<g class="f"><rect x="4.8" y="4.4" width="14.4" height="16.2" rx="3.2"/></g>' +
      '<g class="s"><rect x="4.8" y="4.4" width="14.4" height="16.2" rx="3.2"/><path d="M9 3.1h6a1.3 1.3 0 0 1 1.3 1.3v1.7H7.7V4.4A1.3 1.3 0 0 1 9 3.1Z"/><path d="m8.7 12.5 2 2 4.5-4.5"/></g>',

    leaves:
      '<g class="f"><rect x="3.4" y="5.4" width="17.2" height="15.2" rx="3.2"/></g>' +
      '<g class="s"><rect x="3.4" y="5.4" width="17.2" height="15.2" rx="3.2"/><path d="M8 2.9v4.2M16 2.9v4.2M3.4 10.4h17.2"/><path d="m8.9 15.4 2 2 4.2-4.2"/></g>',

    vehicles:
      '<g class="f"><path d="M4.3 12.5 6.1 7.8A2.5 2.5 0 0 1 8.4 6.2h7.2a2.5 2.5 0 0 1 2.3 1.6l1.8 4.7z"/></g>' +
      '<g class="s"><path d="M4.3 12.5 6.1 7.8A2.5 2.5 0 0 1 8.4 6.2h7.2a2.5 2.5 0 0 1 2.3 1.6l1.8 4.7"/><path d="M3.4 12.5h17.2v5.3a1.4 1.4 0 0 1-1.4 1.4h-1.1a1.4 1.4 0 0 1-1.4-1.4v-.9H7.3v.9a1.4 1.4 0 0 1-1.4 1.4H4.8a1.4 1.4 0 0 1-1.4-1.4z"/><circle cx="7.4" cy="15.2" r=".95"/><circle cx="16.6" cy="15.2" r=".95"/></g>',

    stations:
      '<g class="f"><path d="M13.4 20V4.5h6.3V20z"/></g>' +
      '<g class="s"><path d="M3.1 20V9.3l4.4-3.1 4.4 3.1V20"/><path d="M13.4 20V4.5h6.3V20"/><path d="M1.9 20h20.2"/><path d="M15.5 8.3h2.1M15.5 11.9h2.1M15.5 15.5h2.1"/></g>',

    gasmeters:
      '<g class="f"><circle cx="12" cy="12" r="8.6"/></g>' +
      '<g class="s"><circle cx="12" cy="12" r="8.6"/><path d="M12 12l4-3.3"/><circle cx="12" cy="12" r="1.4"/><path d="M12 3.4v1.7M20.6 12h-1.7M12 20.6v-1.7M3.4 12h1.7"/></g>',

    notes:
      '<g class="f"><path d="M5.9 3.4h7.7L19 8.7v11.9H5.9z"/></g>' +
      '<g class="s"><path d="M5.9 3.4h7.7L19 8.7v11.9H5.9z"/><path d="M13.4 3.6v5.3H19"/><path d="M8.9 13h7M8.9 16.4h4.6"/></g>',

    programs:
      '<g class="f"><path d="M3.4 7.6a2 2 0 0 1 2-2h3.4l2 2.4h7.8a2 2 0 0 1 2 2v8.4a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z"/></g>' +
      '<g class="s"><path d="M3.4 7.6a2 2 0 0 1 2-2h3.4l2 2.4h7.8a2 2 0 0 1 2 2v8.4a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z"/><path d="m9 13.6 2 2 4-4"/></g>',

    phonebook:
      '<g class="f"><path d="M6.2 3.6h2.6l1.9 4.4-2.2 1.4a11.6 11.6 0 0 0 5.7 5.7l1.4-2.2 4.4 1.9v2.6a2 2 0 0 1-2.2 2A16.4 16.4 0 0 1 4.2 5.8a2 2 0 0 1 2-2.2z"/></g>' +
      '<g class="s"><path d="M6.2 3.6h2.6l1.9 4.4-2.2 1.4a11.6 11.6 0 0 0 5.7 5.7l1.4-2.2 4.4 1.9v2.6a2 2 0 0 1-2.2 2A16.4 16.4 0 0 1 4.2 5.8a2 2 0 0 1 2-2.2z"/></g>',

    reports:
      '<g class="f"><rect x="12.4" y="8.4" width="3.4" height="9.2" rx="1.5"/><rect x="17.2" y="5.4" width="3.4" height="12.2" rx="1.5"/></g>' +
      '<g class="s"><path d="M3.6 20.4V3.6"/><path d="M3.6 20.4h17"/><rect x="7.2" y="12.6" width="3.4" height="5" rx="1.5"/><rect x="12.4" y="8.4" width="3.4" height="9.2" rx="1.5"/><rect x="17.2" y="5.4" width="3.4" height="12.2" rx="1.5"/></g>',

    settings:
      '<g class="f"><circle cx="12" cy="12" r="3.3"/></g>' +
      '<g class="s"><path d="M10.6 3.2h2.8l.4 2.1 1.7.7 1.8-1.2 2 2-1.2 1.8.7 1.7 2.1.4v2.8l-2.1.4-.7 1.7 1.2 1.8-2 2-1.8-1.2-1.7.7-.4 2.1h-2.8l-.4-2.1-1.7-.7-1.8 1.2-2-2 1.2-1.8-.7-1.7-2.1-.4v-2.8l2.1-.4.7-1.7-1.2-1.8 2-2 1.8 1.2 1.7-.7z"/><circle cx="12" cy="12" r="3.3"/></g>',

    maintenance:
      '<g class="f"><path d="M14.7 3.3a5.1 5.1 0 0 0-4.3 7.7L4 17.4a2 2 0 0 0 2.8 2.8l6.4-6.4a5.1 5.1 0 0 0 6.5-6.7l-2.6 2.6-2.7-.6-.6-2.7z"/></g>' +
      '<g class="s"><path d="M14.7 3.3a5.1 5.1 0 0 0-4.3 7.7L4 17.4a2 2 0 0 0 2.8 2.8l6.4-6.4a5.1 5.1 0 0 0 6.5-6.7l-2.6 2.6-2.7-.6-.6-2.7z"/></g>',

    faults:
      '<g class="f"><path d="M12 3.5 21.5 20H2.5z"/></g>' +
      '<g class="s"><path d="M12 3.5 21.5 20H2.5z"/><path d="M12 9.3v4.3M12 16.7h.01"/></g>',

    gaslogs:
      '<g class="f"><path d="M9.4 3.4h5.2v4.3l3.6 8.1a2.6 2.6 0 0 1-2.4 3.7H8.2a2.6 2.6 0 0 1-2.4-3.7l3.6-8.1z"/></g>' +
      '<g class="s"><path d="M9.4 3.4h5.2v4.3l3.6 8.1a2.6 2.6 0 0 1-2.4 3.7H8.2a2.6 2.6 0 0 1-2.4-3.7l3.6-8.1z"/><path d="M9.4 3.4h5.2M7.3 14.6h9.4"/></g>',

    /* نشان برنامه — ستارهٔ قطب‌نما */
    compass:
      '<g class="f"><path d="M12 2.2c.5 5.4 2.1 7 7.5 7.5-5.4.5-7 2.1-7.5 7.5-.5-5.4-2.1-7-7.5-7.5 5.4-.5 7-2.1 7.5-7.5z"/></g>' +
      '<g class="s"><path d="M12 2.2c.5 5.4 2.1 7 7.5 7.5-5.4.5-7 2.1-7.5 7.5-.5-5.4-2.1-7-7.5-7.5 5.4-.5 7-2.1 7.5-7.5z"/><circle cx="12" cy="9.7" r="1.1"/></g>'
  };

  function svg(name, extraClass) {
    const body = ICONS[name];
    if (!body) return '';
    return '<svg class="atlas-ico' + (extraClass ? ' ' + extraClass : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  function hydrate(root) {
    (root || document).querySelectorAll('[data-atlas-icon]').forEach(function (host) {
      const name = host.getAttribute('data-atlas-icon');
      if (!ICONS[name] || host.querySelector('svg')) return;
      host.insertAdjacentHTML('afterbegin', svg(name));
    });
  }

  window.ATLAS_ICONS = ICONS;
  window.atlasIcon = svg;
  window.atlasHydrateIcons = hydrate;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { hydrate(); });
  } else {
    hydrate();
  }
})();

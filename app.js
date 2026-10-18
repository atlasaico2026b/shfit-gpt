(function () {
  'use strict';

  var viewNames = {
    dashboard: 'داشبورد',
    employees: 'کارکنان',
    missions: 'مأموریت‌ها',
    leaves: 'مرخصی‌ها',
    vehicles: 'خودروها',
    gasmeters: 'گازسنج‌ها',
    notes: 'یادداشت‌ها',
    reports: 'گزارشات',
    settings: 'تنظیمات'
  };

  function openView(name) {
    if (!Object.prototype.hasOwnProperty.call(viewNames, name)) return;
    document.querySelectorAll('.main-nav [data-view]').forEach(function (button) {
      button.classList.toggle('active', button.dataset.view === name);
      button.setAttribute('aria-current', button.dataset.view === name ? 'page' : 'false');
    });
    document.getElementById('page-title').textContent = viewNames[name];
    document.getElementById('page-subtitle').textContent = '';
    document.getElementById('view-root').replaceChildren();
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest('.main-nav [data-view]');
    if (!button) return;
    event.preventDefault();
    openView(button.dataset.view);
  });

  openView('dashboard');
})();

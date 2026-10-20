(function(){
  'use strict';
  var KEY='atlasShiftAppTheme';
  function setTheme(){
    document.documentElement.dataset.atlasTheme='theme-two';
    try{localStorage.setItem(KEY,'theme-two')}catch(e){}
    document.querySelectorAll('[data-app-theme]').forEach(function(el){
      var active=el.dataset.appTheme==='theme-two';
      el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));
      var state=el.querySelector('.theme-option-state');
      if(state)state.textContent=active?'فعال':'انتخاب';
    });
  }
  function boot(){
    var button=document.querySelector('[data-app-theme="theme-two"]');
    if(button){button.disabled=false;button.removeAttribute('aria-disabled');button.classList.remove('pending');}
    document.addEventListener('click',function(e){
      var target=e.target.closest&&e.target.closest('[data-app-theme="theme-two"]');
      if(!target)return;
      e.preventDefault();e.stopImmediatePropagation();setTheme();
    },true);
    try{if(localStorage.getItem(KEY)==='theme-two')setTheme();}catch(e){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();

(function(){
  'use strict';
  function bind(){
    document.addEventListener('pointermove',function(e){
      var card=e.target.closest('.dash-window');
      if(!card)return;
      var r=card.getBoundingClientRect();
      card.style.setProperty('--mx',((e.clientX-r.left)/r.width*100)+'%');
      card.style.setProperty('--my',((e.clientY-r.top)/r.height*100)+'%');
    },{passive:true});
    document.addEventListener('pointerdown',function(e){
      var button=e.target.closest('.button,.nav-item,.period-option,.dashboard-settings-link');
      if(button){button.classList.remove('atlas-press');void button.offsetWidth;button.classList.add('atlas-press');setTimeout(function(){button.classList.remove('atlas-press')},280)}
    },{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();

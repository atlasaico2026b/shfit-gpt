(function(){
  'use strict';
  function bind(){
    var root=document.documentElement;
    document.addEventListener('pointermove',function(e){
      root.style.setProperty('--pointer-x',((e.clientX/window.innerWidth)*100)+'%');
      root.style.setProperty('--pointer-y',((e.clientY/window.innerHeight)*100)+'%');
      var card=e.target.closest('.dash-window');
      if(!card)return;
      var r=card.getBoundingClientRect();
      card.style.setProperty('--mx',((e.clientX-r.left)/r.width*100)+'%');
      card.style.setProperty('--my',((e.clientY-r.top)/r.height*100)+'%');
      if(window.matchMedia('(pointer:fine)').matches){
        var dx=(e.clientX-(r.left+r.width/2))/r.width;
        var dy=(e.clientY-(r.top+r.height/2))/r.height;
        card.style.setProperty('--tilt-x',(dy*-3)+'deg');
        card.style.setProperty('--tilt-y',(dx*3)+'deg');
      }
    },{passive:true});
    document.addEventListener('pointerleave',function(){root.style.setProperty('--pointer-x','50%');root.style.setProperty('--pointer-y','35%')},{passive:true});
    document.addEventListener('pointerdown',function(e){
      var button=e.target.closest('.button,.nav-item,.period-option,.dashboard-settings-link');
      if(button){
        button.classList.remove('atlas-press');void button.offsetWidth;button.classList.add('atlas-press');
        var r=button.getBoundingClientRect(),size=Math.max(r.width,r.height)*1.4;
        var ripple=document.createElement('span');ripple.className='atlas-ripple';ripple.style.width=size+'px';ripple.style.height=size+'px';
        ripple.style.left=(e.clientX-r.left-size/2)+'px';ripple.style.top=(e.clientY-r.top-size/2)+'px';
        button.appendChild(ripple);setTimeout(function(){ripple.remove()},600);setTimeout(function(){button.classList.remove('atlas-press')},280);
      }
    },{passive:true});
    document.addEventListener('pointerout',function(e){
      var card=e.target.closest('.dash-window');
      if(card && !card.contains(e.relatedTarget)){card.style.removeProperty('--tilt-x');card.style.removeProperty('--tilt-y');}
    },{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();

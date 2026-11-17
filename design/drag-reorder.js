/* ─────────────────────────────────────────────────────────────
   جابه‌جایی با درگ — AtlasShift
   ─────────────────────────────────────────────────────────────
   هر فهرستی از «عنوان‌ها» را می‌شود با کشیدن مرتب کرد.

   با ماوس: از هر جای ردیف (به‌جز خودِ کنترل‌ها) می‌توان کشید.
   با لمس: فقط از دستگیرهٔ ⠿ تا اسکرول فهرست از کار نیفتد.

   API:
     AtlasDragReorder.attach(list, {
       itemSelector: '[data-col-key]',
       onReorder(list) {}          // پس از هر جابه‌جایی
     });

   ترتیب نهایی همان ترتیب فرزندانِ DOM است؛ هر کدی که بعداً از DOM
   می‌خواند (مثل ذخیرهٔ ستون‌ها) بدون تغییر درست کار می‌کند.
*/
(function () {
  'use strict';

  var THRESHOLD = 5;
  var instances = new WeakMap();

  function Sortable(container, options) {
    this.container = container;
    this.opts = options || {};
    this.itemSelector = this.opts.itemSelector || '[data-drag-item]';
    this.handleSelector = this.opts.handleSelector || '[data-drag-handle]';
    this.ignoreSelector = this.opts.ignoreSelector || 'input,button,a,select,textarea,[contenteditable="true"]';
    this.state = null;
    this.bound = false;
    this.bind();
    this.prepare();
  }

  Sortable.prototype.items = function () {
    var self = this;
    return Array.prototype.slice.call(this.container.children).filter(function (el) {
      return el.matches && el.matches(self.itemSelector);
    });
  };

  /* دستگیرهٔ ⠿ را به هر ردیف اضافه می‌کند تا با لمس هم بتوان کشید. */
  Sortable.prototype.prepare = function () {
    if (this.opts.injectHandle === false) return;
    this.items().forEach(function (el) {
      el.classList.add('is-drag-item');
      if (el.querySelector('[data-drag-handle]')) return;
      var handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'drag-handle';
      handle.setAttribute('data-drag-handle', '');
      handle.setAttribute('aria-label', 'جابه‌جایی با درگ');
      handle.setAttribute('title', 'برای جابه‌جایی بکش');
      handle.textContent = '⠿';
      var slot = el.querySelector('[data-drag-handle-slot]');
      if (slot) slot.insertBefore(handle, slot.firstChild);
      else el.insertBefore(handle, el.firstChild);
    });
  };

  Sortable.prototype.bind = function () {
    if (this.bound) return;
    this.bound = true;
    var self = this;
    this.onMoveBound = function (event) { self.onMove(event); };
    this.onUpBound = function (event) { self.onUp(event); };
    this.container.addEventListener('pointerdown', function (event) { self.onDown(event); }, { passive: false });
  };

  Sortable.prototype.onDown = function (event) {
    if (this.state) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    var target = event.target;
    if (!target || !target.closest) return;
    var item = target.closest(this.itemSelector);
    if (!item || item.parentNode !== this.container) return;

    var fromHandle = !!target.closest(this.handleSelector);
    if (!fromHandle) {
      // با لمس فقط از دستگیره؛ وگرنه اسکرول فهرست قفل می‌شود.
      if (event.pointerType !== 'mouse') return;
      if (target.closest(this.ignoreSelector)) return;
    }

    this.state = {
      item: item,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      ghost: null,
      offsetX: 0,
      offsetY: 0
    };
    document.addEventListener('pointermove', this.onMoveBound, { passive: false });
    document.addEventListener('pointerup', this.onUpBound);
    document.addEventListener('pointercancel', this.onUpBound);
  };

  Sortable.prototype.startDrag = function () {
    var state = this.state;
    var item = state.item;
    var rect = item.getBoundingClientRect();
    var ghost = item.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.classList.remove('is-drag-origin');
    ghost.style.position = 'fixed';
    ghost.style.left = '0';
    ghost.style.top = '0';
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    ghost.style.margin = '0';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '9999';
    ghost.style.transform = 'translate3d(' + rect.left + 'px,' + rect.top + 'px,0)';
    document.body.appendChild(ghost);

    state.ghost = ghost;
    state.offsetX = state.startX - rect.left;
    state.offsetY = state.startY - rect.top;
    state.dragging = true;

    item.classList.add('is-drag-origin');
    this.container.classList.add('is-drag-active');
    document.body.classList.add('is-drag-reordering');
  };

  Sortable.prototype.onMove = function (event) {
    var state = this.state;
    if (!state) return;
    if (state.pointerId != null && event.pointerId != null && event.pointerId !== state.pointerId) return;

    var dx = event.clientX - state.startX;
    var dy = event.clientY - state.startY;
    if (!state.dragging) {
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
      this.startDrag();
    }
    event.preventDefault();

    if (state.ghost) {
      state.ghost.style.transform = 'translate3d(' +
        (event.clientX - state.offsetX) + 'px,' +
        (event.clientY - state.offsetY) + 'px,0)';
    }
    this.place(event.clientY);
  };

  /* ردیف را همان‌جا که نشانگر از نیمهٔ ردیف‌ها گذشته جابه‌جا می‌کند. */
  Sortable.prototype.place = function (clientY) {
    var state = this.state;
    var item = state.item;
    var siblings = this.items().filter(function (el) { return el !== item; });
    var before = null;
    for (var i = 0; i < siblings.length; i++) {
      var rect = siblings[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) { before = siblings[i]; break; }
    }
    if (before) {
      if (item.nextElementSibling !== before) this.container.insertBefore(item, before);
    } else if (this.container.lastElementChild !== item) {
      this.container.appendChild(item);
    }
  };

  Sortable.prototype.onUp = function (event) {
    var state = this.state;
    if (!state) return;
    if (state.pointerId != null && event.pointerId != null && event.pointerId !== state.pointerId) return;

    this.state = null;
    document.removeEventListener('pointermove', this.onMoveBound);
    document.removeEventListener('pointerup', this.onUpBound);
    document.removeEventListener('pointercancel', this.onUpBound);

    if (!state.dragging) return;

    if (state.ghost && state.ghost.parentNode) state.ghost.parentNode.removeChild(state.ghost);
    state.item.classList.remove('is-drag-origin');
    this.container.classList.remove('is-drag-active');
    document.body.classList.remove('is-drag-reordering');

    this.suppressClick();
    if (this.opts.onReorder) this.opts.onReorder(this.container);
  };

  /* کلیکی که بعد از رها کردن ردیف روی همان ردیف می‌افتد نباید تیک/دکمه را بزند. */
  Sortable.prototype.suppressClick = function () {
    var handler = function (event) {
      event.preventDefault();
      event.stopPropagation();
      document.removeEventListener('click', handler, true);
    };
    document.addEventListener('click', handler, true);
    window.setTimeout(function () { document.removeEventListener('click', handler, true); }, 400);
  };

  window.AtlasDragReorder = {
    attach: function (container, options) {
      if (!container) return null;
      var existing = instances.get(container);
      if (existing) {
        existing.opts = Object.assign({}, existing.opts, options || {});
        existing.prepare();
        return existing;
      }
      var instance = new Sortable(container, options);
      instances.set(container, instance);
      return instance;
    }
  };
})();

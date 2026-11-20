/* ─────────────────────────────────────────────────────────────
   جابه‌جایی زنده با درگ — AtlasShift
   ─────────────────────────────────────────────────────────────
   ردیف از جایش بلند نمی‌شود و نسخهٔ شناور ساخته نمی‌شود؛ همان
   آیتم داخل ردیف/ستون به دنبال دست می‌رود و بقیهٔ آیتم‌ها در همان
   لحظه کنار می‌روند تا جای تازه باز شود. رها که شد، فقط ترتیب
   نهایی ذخیره می‌شود (بدون پیام «جابه‌جا شد»).

   API:
     AtlasDragReorder.attach(list, {
       itemSelector: '[data-col-key]',
       axis: 'auto',                 // 'auto' | 'x' | 'y'
       handleSelector: '[data-drag-handle]',
       touchMode: 'handle',          // 'handle' | 'longpress' | 'any'
       injectHandle: false,
       lockedSelector: '[data-drag-locked]',
       onReorder(list) {}
     });

   ترتیب نهایی همان ترتیب فرزندان DOM است؛ هر کدی که بعداً از DOM
   می‌خواند بدون تغییر درست کار می‌کند.
*/
(function () {
  'use strict';

  var THRESHOLD = 4;
  var FLIP_MS = 150;
  var EASE = 'cubic-bezier(.22,.61,.36,1)';
  var instances = new WeakMap();

  function toArray(list) {
    return Array.prototype.slice.call(list);
  }

  function Sortable(container, options) {
    this.container = container;
    this.opts = options || {};
    this.itemSelector = this.opts.itemSelector || '[data-drag-item]';
    this.handleSelector = this.opts.handleSelector || '[data-drag-handle]';
    this.lockedSelector = this.opts.lockedSelector || '[data-drag-locked]';
    this.ignoreSelector = this.opts.ignoreSelector ||
      'input,select,textarea,[contenteditable="true"]';
    this.touchMode = this.opts.touchMode || 'handle';
    this.axisMode = this.opts.axis || 'auto';
    this.state = null;
    this.bound = false;
    this.bind();
    this.prepare();
  }

  Sortable.prototype.items = function () {
    var self = this;
    return toArray(this.container.children).filter(function (el) {
      return el.matches && el.matches(self.itemSelector);
    });
  };

  /* دستگیرهٔ ⠿ را به هر آیتم اضافه می‌کند تا با لمس هم بتوان کشید. */
  Sortable.prototype.prepare = function () {
    var self = this;
    this.items().forEach(function (el) {
      el.classList.add('is-drag-item');
      el.setAttribute('draggable', 'false');
      if (self.opts.injectHandle === false) return;
      if (el.querySelector('[data-drag-handle]')) return;
      var handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.setAttribute('data-drag-handle', '');
      handle.setAttribute('aria-hidden', 'true');
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
    this.onCancelBound = function (event) { self.onCancel(event); };
    this.container.addEventListener('pointerdown', function (event) { self.onDown(event); });
    this.container.addEventListener('dragstart', function (event) {
      if (self.state) event.preventDefault();
    });
  };

  Sortable.prototype.isLocked = function (item) {
    return !!(item && this.lockedSelector && item.matches(this.lockedSelector));
  };

  Sortable.prototype.draggable = function (item) {
    return !!item && !this.isLocked(item);
  };

  Sortable.prototype.onDown = function (event) {
    if (this.state) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    var target = event.target;
    if (!target || !target.closest) return;
    var item = target.closest(this.itemSelector);
    if (!item || item.parentNode !== this.container) return;
    if (!this.draggable(item)) return;

    var fromHandle = !!(this.handleSelector && target.closest(this.handleSelector));
    if (event.pointerType !== 'mouse') {
      if (this.touchMode === 'handle' && !fromHandle) return;
      if (target.closest('input,select,textarea,button,a:not(.is-drag-item)')) {
        if (!fromHandle) return;
      }
    } else if (!fromHandle && target.closest(this.ignoreSelector)) {
      return;
    }

    var rect = item.getBoundingClientRect();
    this.state = {
      item: item,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rect: rect,
      dragging: false,
      axis: null,
      dir: 1,
      grab: 0,
      timer: 0,
      initialOrder: this.items().slice()
    };

    var self = this;
    document.addEventListener('pointermove', this.onMoveBound, { passive: false });
    document.addEventListener('pointerup', this.onUpBound);
    document.addEventListener('pointercancel', this.onCancelBound);
    if (item.setPointerCapture && event.pointerId != null) {
      try { item.setPointerCapture(event.pointerId); } catch (_) {}
    }

    /* با لمس، نگه‌داشتن کوتاه روی آیتم هم درگ را شروع می‌کند. */
    if (event.pointerType !== 'mouse' && this.touchMode === 'longpress' && !fromHandle) {
      this.state.timer = window.setTimeout(function () {
        if (!self.state || self.state.dragging) return;
        self.state.longpress = true;
        self.startDrag();
      }, 260);
    }
  };

  /* محور حرکت: ردیف افقی یا فهرست عمودی — خودکار از چیدمان فهمیده می‌شود. */
  Sortable.prototype.measure = function () {
    var items = this.items().filter(this.draggable.bind(this));
    if (!items.length) return { axis: 'y', dir: 1 };
    var centers = items.map(function (el) {
      var r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    var axis = this.axisMode;
    if (axis !== 'x' && axis !== 'y') {
      if (centers.length < 2) axis = 'y';
      else {
        var first = centers[0];
        var last = centers[centers.length - 1];
        // Compare item centers, not the outer bounding box: full-width vertical
        // rows must remain vertical even when each row is wider than the list is tall.
        axis = Math.abs(last.x - first.x) > Math.abs(last.y - first.y) ? 'x' : 'y';
      }
    }
    var dir = 1;
    if (centers.length > 1) {
      var firstCenter = centers[0];
      var lastCenter = centers[centers.length - 1];
      dir = axis === 'x'
        ? (lastCenter.x < firstCenter.x ? -1 : 1)
        : (lastCenter.y < firstCenter.y ? -1 : 1);
    }
    return { axis: axis, dir: dir };
  };

  Sortable.prototype.along = function (event) {
    return this.state.axis === 'x' ? event.clientX : event.clientY;
  };

  Sortable.prototype.startDrag = function () {
    var state = this.state;
    if (!state || state.dragging) return;
    var geo = this.measure();
    state.axis = geo.axis;
    state.dir = geo.dir;
    state.dragging = true;
    /* فاصلهٔ نقطهٔ گرفتن از لبهٔ آیتم، از همان لحظهٔ فشار محاسبه می‌شود. */
    state.grab = geo.axis === 'x'
      ? (state.startX - state.rect.left)
      : (state.startY - state.rect.top);
    state.item.classList.add('is-dragging');
    this.container.classList.add('is-sorting');
    document.body.classList.add('is-drag-reordering');
    if (state.timer) { window.clearTimeout(state.timer); state.timer = 0; }
  };

  Sortable.prototype.onMove = function (event) {
    var state = this.state;
    if (!state) return;
    if (state.pointerId != null && event.pointerId != null && event.pointerId !== state.pointerId) return;

    var dx = event.clientX - state.startX;
    var dy = event.clientY - state.startY;
    if (!state.dragging) {
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
      // A long-press surface must not turn an ordinary touch-scroll into a drag.
      // Only a completed long press may start dragging from a non-handle area.
      if (event.pointerType !== 'mouse' && this.touchMode === 'longpress' && !state.longpress) {
        this.finish(event, true);
        return;
      }
      if (state.timer) { window.clearTimeout(state.timer); state.timer = 0; }
      this.startDrag();
    }
    event.preventDefault();

    state.pointerX = event.clientX;
    state.pointerY = event.clientY;
    var p = this.along(event);
    this.move(event, p);
  };

  Sortable.prototype.move = function (event, p) {
    var state = this.state;
    var item = state.item;
    var container = this.container;

    if (this.opts.onDrag) this.opts.onDrag(event);

    /* جای تازه را از موقعیت اشاره‌گر نسبت به وسط بقیهٔ آیتم‌ها می‌فهمیم. */
    var movable = this.items().filter(this.draggable.bind(this));
    var kids = movable.filter(function (el) { return el !== item; });
    var index = kids.length;
    for (var i = 0; i < kids.length; i++) {
      var r = kids[i].getBoundingClientRect();
      var mid = state.axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2;
      var passed = state.dir > 0 ? p < mid : p > mid;
      if (passed) { index = i; break; }
    }

    var current = movable.indexOf(item);
    if (current !== index) {
      var before = this.snapshot();
      if (index >= kids.length) {
        // Keep any trailing locked items (for example Dashboard/Settings) pinned.
        var all = this.items();
        var trailingLocked = null;
        for (var j = all.length - 1; j >= 0 && this.isLocked(all[j]); j--) trailingLocked = all[j];
        if (trailingLocked) container.insertBefore(item, trailingLocked);
        else container.appendChild(item);
      } else {
        container.insertBefore(item, kids[index]);
      }
      this.flip(before, item);
    }

    this.follow(p);
  };

  /* آیتم کشیده‌شده دقیقاً زیر اشاره‌گر می‌ماند (فقط در راستای ردیف). */
  Sortable.prototype.follow = function (p) {
    var state = this.state;
    var item = state.item;
    item.style.transform = 'none';
    var rect = item.getBoundingClientRect();
    var base = state.axis === 'x' ? rect.left : rect.top;
    var delta = (p - state.grab) - base;
    item.style.transform = state.axis === 'x'
      ? 'translate3d(' + delta + 'px,0,0)'
      : 'translate3d(0,' + delta + 'px,0)';
  };

  /* موقعیت چیدمانی (بدون در نظر گرفتن ترنسفورم‌ها) برای انیمیشن FLIP. */
  Sortable.prototype.snapshot = function () {
    var out = new Map();
    this.items().forEach(function (el) {
      out.set(el, { x: el.offsetLeft, y: el.offsetTop });
    });
    return out;
  };

  Sortable.prototype.flip = function (before, dragged) {
    var self = this;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.items().forEach(function (el) {
      if (el === dragged) return;
      var prev = before.get(el);
      if (!prev) return;
      var dx = prev.x - el.offsetLeft;
      var dy = prev.y - el.offsetTop;
      if (!dx && !dy) return;
      if (reduced) return;
      el.classList.add('is-shifting');
      el.style.transition = 'none';
      el.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';
      void el.offsetWidth;
      window.requestAnimationFrame(function () {
        el.style.transition = 'transform ' + FLIP_MS + 'ms ' + EASE;
        el.style.transform = '';
        window.setTimeout(function () {
          el.style.transition = '';
          el.classList.remove('is-shifting');
        }, FLIP_MS + 40);
      });
    });
  };

  Sortable.prototype.onUp = function (event) {
    this.finish(event, false);
  };

  Sortable.prototype.onCancel = function (event) {
    this.finish(event, true);
  };

  Sortable.prototype.finish = function (event, cancelled) {
    var state = this.state;
    if (!state) return;
    if (state.pointerId != null && event && event.pointerId != null && event.pointerId !== state.pointerId) return;

    if (state.timer) { window.clearTimeout(state.timer); state.timer = 0; }
    this.state = null;
    document.removeEventListener('pointermove', this.onMoveBound);
    document.removeEventListener('pointerup', this.onUpBound);
    document.removeEventListener('pointercancel', this.onCancelBound);

    if (cancelled && state.dragging) {
      // A cancelled gesture is not a drop: restore the exact starting order.
      state.initialOrder.forEach(function (el) {
        if (el.parentNode === this.container) this.container.appendChild(el);
      }, this);
    }

    if (state.dragging) {
      state.item.classList.remove('is-dragging');
      this.container.classList.remove('is-sorting');
      document.body.classList.remove('is-drag-reordering');
      this.items().forEach(function (el) {
        el.style.transform = '';
        el.style.transition = '';
        el.classList.remove('is-shifting');
      });
      void this.container.offsetWidth;
      if (!cancelled) this.suppressClick(state.item);

      var finalOrder = this.items();
      var changed = state.initialOrder.length !== finalOrder.length ||
        state.initialOrder.some(function (el, index) { return finalOrder[index] !== el; });
      if (!cancelled && changed && this.opts.onReorder) this.opts.onReorder(this.container);
    }

    if (state.item.releasePointerCapture && state.pointerId != null) {
      try { state.item.releasePointerCapture(state.pointerId); } catch (_) {}
    }
  };

  /* Only suppress the synthetic click on the dragged item, not the next click anywhere. */
  Sortable.prototype.suppressClick = function (item) {
    var container = this.container;
    var handler = function (event) {
      var target = event.target;
      var belongsToDraggedItem = target === item ||
        (item.contains && item.contains(target)) ||
        (target.closest && target.closest(this.itemSelector) === item);
      if (!belongsToDraggedItem) return;
      event.preventDefault();
      event.stopPropagation();
      container.removeEventListener('click', handler, true);
    }.bind(this);
    container.addEventListener('click', handler, true);
    window.setTimeout(function () { container.removeEventListener('click', handler, true); }, 350);
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

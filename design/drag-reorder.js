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
    var direct = toArray(this.container.children).filter(function (el) {
      return el.matches && el.matches(self.itemSelector);
    });
    if (direct.length) return direct;
    // Some containers (e.g. <thead>) hold the draggable items one level deeper,
    // behind a wrapping row. Fall back to a full subtree search so the same
    // engine can drive column headers, table rows and nav items alike.
    return toArray(this.container.querySelectorAll(self.itemSelector));
  };

  /* دستگیرهٔ ⠿ را به هر آیتم اضافه می‌کند تا با لمس هم بتوان کشید. */
  Sortable.prototype.prepare = function () {
    var self = this;
    this.items().forEach(function (el) {
      el.classList.add('is-drag-item');
      el.setAttribute('draggable', 'false');
      // اگر injectHandle false است و slot هم وجود ندارد، دستگیره نساز
      if (self.opts.injectHandle === false && !el.querySelector('[data-drag-handle-slot]')) return;
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
    this.container.addEventListener('pointerdown', function (event) { self.onDown(event); });
    this.container.addEventListener('dragstart', function (event) {
      if (self.state) event.preventDefault();
    });
  };

  Sortable.prototype.draggable = function (item) {
    if (!item) return false;
    if (this.lockedSelector && item.matches(this.lockedSelector)) return false;
    return true;
  };

  Sortable.prototype.onDown = function (event) {
    if (this.state) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    var target = event.target;
    if (!target || !target.closest) return;
    var item = target.closest(this.itemSelector);
    if (!item) return;
    // The draggable item may live one level deeper than the container (e.g. a
    // <th> inside a <thead> that owns the <tr>). Accept either as the owner.
    if (item.parentNode !== this.container && item.closest(this.itemSelector) !== item) return;
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
      timer: 0
    };

    var self = this;
    document.addEventListener('pointermove', this.onMoveBound, { passive: false });
    document.addEventListener('pointerup', this.onUpBound);
    document.addEventListener('pointercancel', this.onUpBound);

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
    var items = this.items();
    if (!items.length) return { axis: 'y', dir: 1 };
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    var centers = [];
    items.forEach(function (el) {
      var r = el.getBoundingClientRect();
      minX = Math.min(minX, r.left); maxX = Math.max(maxX, r.right);
      minY = Math.min(minY, r.top); maxY = Math.max(maxY, r.bottom);
      centers.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    });
    var axis = this.axisMode;
    if (axis !== 'x' && axis !== 'y') {
      axis = (maxX - minX) >= (maxY - minY) ? 'x' : 'y';
    }
    var dir = 1;
    if (centers.length > 1) {
      var first = centers[0];
      var last = centers[centers.length - 1];
      dir = axis === 'x' ? (last.x < first.x ? -1 : 1) : (last.y < first.y ? -1 : 1);
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
      if (!state.longpress && Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
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
    var kids = this.items().filter(function (el) { return el !== item; });
    var index = kids.length;
    for (var i = 0; i < kids.length; i++) {
      var r = kids[i].getBoundingClientRect();
      var mid = state.axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2;
      var passed = state.dir > 0 ? p < mid : p > mid;
      if (passed) { index = i; break; }
    }

    var current = this.items().indexOf(item);
    if (current !== index) {
      var before = this.snapshot();
      if (index >= kids.length) container.appendChild(item);
      else container.insertBefore(item, kids[index]);
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
    var state = this.state;
    if (!state) return;
    if (state.pointerId != null && event.pointerId != null && event.pointerId !== state.pointerId) return;

    if (state.timer) { window.clearTimeout(state.timer); state.timer = 0; }
    this.state = null;
    document.removeEventListener('pointermove', this.onMoveBound);
    document.removeEventListener('pointerup', this.onUpBound);
    document.removeEventListener('pointercancel', this.onUpBound);

    if (!state.dragging) return;

    state.item.classList.remove('is-dragging');
    this.container.classList.remove('is-sorting');
    document.body.classList.remove('is-drag-reordering');

    var self = this;
    this.items().forEach(function (el) {
      el.style.transform = '';
      el.style.transition = '';
      el.classList.remove('is-shifting');
    });
    void self.container.offsetWidth;

    this.suppressClick();
    if (this.opts.onReorder) this.opts.onReorder(this.container);
  };

  /* کلیکی که بعد از رها کردن روی همان آیتم می‌افتد نباید منو/تب را باز کند. */
  Sortable.prototype.suppressClick = function () {
    var handler = function (event) {
      event.preventDefault();
      event.stopPropagation();
      document.removeEventListener('click', handler, true);
    };
    document.addEventListener('click', handler, true);
    window.setTimeout(function () { document.removeEventListener('click', handler, true); }, 350);
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

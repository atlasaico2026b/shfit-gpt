/* ─────────────────────────────────────────────────────────────
   جابه‌جایی شناور با درگ — AtlasShift  (نسخهٔ ۲)

   رفتار این نسخه:
     • آیتم از جای خود «بلند نمی‌شود»؛ همان‌جا در جریان چیدمان می‌ماند
       و با حرکت دست به چپ/راست (یا بالا/پایین) جابه‌جا می‌شود.
     • هم‌زمان با عبور از مرکز هر گزینه، بقیهٔ گزینه‌ها فوراً و با
       انیمیشن کوتاه جا باز می‌کنند و آیتم در حال کشیدن بین آن‌ها
       قرار می‌گیرد (بدون شبح شناور، بدون تأخیر).
     • محور به‌صورت خودکار تشخیص داده می‌شود: ردیف افقی، ستون عمودی
       یا شبکهٔ چندستونه (مثل نوار آیکون‌ها در موبایل).
     • هیچ پیام «جابه‌جا شد»ی نمایش داده نمی‌شود؛ فقط ذخیرهٔ آرام.

   API:
     AtlasDragReorder.attach(list, {
       itemSelector: '[data-col-key]',
       axis: 'auto' | 'x' | 'y',
       handleSelector: '[data-drag-handle]',   // اختیاری
       persistKey: 'atlas:nav-order',          // اختیاری
       onReorder(list) {}
     });
     AtlasDragReorder.auto(root);   // اتصال خودکار به همهٔ فهرست‌ها
*/
(function () {
  'use strict';

  var THRESHOLD = 4;          // پیکسل تا شروع درگ (حرکت ناخواسته را نادیده می‌گیرد)
  var LONG_PRESS = 170;       // میلی‌ثانیه برای شروع درگ با لمس
  var SHIFT_MS = 160;         // مدت انیمیشن جا باز کردن بقیه
  var EDGE = 44;              // ناحیهٔ اسکرول خودکار
  var instances = new WeakMap();
  var activeInstance = null;

  function rects(list, skip) {
    var map = new Map();
    list.forEach(function (el) { if (el !== skip) map.set(el, el.getBoundingClientRect()); });
    return map;
  }

  function axisOf(items) {
    if (items.length < 2) return 'y';
    var a = items[0].getBoundingClientRect();
    var b = items[1].getBoundingClientRect();
    var dx = Math.abs(b.left - a.left);
    var dy = Math.abs(b.top - a.top);
    return dx > dy ? 'x' : 'y';
  }

  function Sortable(container, opts) {
    this.container = container;
    this.opts = opts || {};
    this.itemSelector = this.opts.itemSelector || '[data-drag-item]';
    this.handleSelector = this.opts.handleSelector || '[data-drag-handle]';
    this.ignoreSelector = this.opts.ignoreSelector ||
      'input,select,textarea,[contenteditable="true"]';
    this.state = null;
    this.bound = false;
    this.restore();
    this.bind();
    this.prepare();
  }

  Sortable.prototype.items = function () {
    var self = this;
    return Array.prototype.slice.call(this.container.children).filter(function (el) {
      return el.nodeType === 1 && el.matches && el.matches(self.itemSelector);
    });
  };

  Sortable.prototype.prepare = function () {
    var self = this;
    this.items().forEach(function (el) {
      el.classList.add('is-drag-item');
      // کشیدن بومی لینک/تصویر در کروم رویدادهای اشاره‌گر را قطع می‌کند؛
      // با غیرفعال‌کردنش درگ با ماوس روان و پیوسته می‌ماند.
      el.setAttribute('draggable', 'false');
      el.style.webkitUserDrag = 'none';
      if (self.opts.injectHandle === false) return;
      if (el.querySelector('[data-drag-handle]')) return;
      var handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'drag-handle';
      handle.setAttribute('data-drag-handle', '');
      handle.setAttribute('aria-label', 'جابه‌جایی');
      handle.setAttribute('title', 'برای جابه‌جایی بکش');
      handle.textContent = '⠿';
      var slot = el.querySelector('[data-drag-handle-slot]');
      if (slot) slot.insertBefore(handle, slot.firstChild);
      else el.insertBefore(handle, el.firstChild);
    });
  };

  /* ── ذخیره و بازگردانی ترتیب ────────────────────────────── */
  Sortable.prototype.idOf = function (el) {
    if (!el) return '';
    if (el.dataset) {
      var keys = Object.keys(el.dataset);
      for (var i = 0; i < keys.length; i++) {
        var v = el.dataset[keys[i]];
        if (v) return v;
      }
    }
    return el.id || (el.textContent || '').trim().slice(0, 60);
  };

  Sortable.prototype.restore = function () {
    var key = this.opts.persistKey;
    if (!key) return;
    var order = [];
    try { order = JSON.parse(localStorage.getItem(key) || '[]') || []; } catch (_) { order = []; }
    if (!Array.isArray(order) || !order.length) return;
    var self = this;
    var byId = {};
    this.items().forEach(function (el) { byId[self.idOf(el)] = el; });
    var frag = document.createDocumentFragment();
    order.forEach(function (id) { if (byId[id]) { frag.appendChild(byId[id]); delete byId[id]; } });
    this.items().forEach(function (el) { if (byId[self.idOf(el)]) frag.appendChild(byId[self.idOf(el)]); });
    this.container.appendChild(frag);
  };

  Sortable.prototype.persist = function () {
    var key = this.opts.persistKey;
    if (!key) return;
    var self = this;
    try {
      localStorage.setItem(key, JSON.stringify(this.items().map(function (el) { return self.idOf(el); })));
    } catch (_) {}
  };

  /* ── رویدادها ───────────────────────────────────────────── */
  Sortable.prototype.bind = function () {
    if (this.bound) return;
    this.bound = true;
    var self = this;
    this.onMoveBound = function (e) { self.onMove(e); };
    this.onUpBound = function (e) { self.onUp(e); };
    this.onTouchMoveBound = function (e) {
      if (self.state && (self.state.dragging || self.state.armed)) {
        if (e.cancelable) e.preventDefault();
      }
    };
    this.onDownBound = function (e) { self.onDown(e); };
    this.container.addEventListener('pointerdown', this.onDownBound, { passive: true });
  };

  Sortable.prototype.onDown = function (event) {
    if (this.state) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    var target = event.target;
    if (!target || !target.closest) return;
    var item = target.closest(this.itemSelector);
    if (!item || item.parentNode !== this.container) return;
    if (target.closest(this.ignoreSelector)) return;

    var fromHandle = !!(this.handleSelector && target.closest(this.handleSelector));
    var touch = event.pointerType !== 'mouse';

    this.state = {
      item: item,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      grabX: 0,
      grabY: 0,
      baseLeft: 0,
      baseTop: 0,
      tx: 0,
      ty: 0,
      dragging: false,
      armed: !touch || fromHandle,
      axis: this.opts.axis || 'auto',
      timer: null
    };

    if (touch && !fromHandle) {
      var self = this;
      this.state.timer = window.setTimeout(function () {
        if (!self.state) return;
        self.state.armed = true;
        var el = self.state.item;
        el.classList.add('is-drag-armed');
      }, LONG_PRESS);
    }

    document.addEventListener('pointermove', this.onMoveBound, { passive: false });
    document.addEventListener('pointerup', this.onUpBound);
    document.addEventListener('pointercancel', this.onUpBound);
    document.addEventListener('touchmove', this.onTouchMoveBound, { passive: false });
  };

  Sortable.prototype.startDrag = function () {
    var state = this.state;
    var item = state.item;
    var rect = item.getBoundingClientRect();

    activeInstance = this;
    state.dragging = true;
    state.grabX = state.startX - rect.left;
    state.grabY = state.startY - rect.top;
    state.baseLeft = rect.left;
    state.baseTop = rect.top;
    state.tx = 0;
    state.ty = 0;
    if (state.axis === 'auto') state.axis = axisOf(this.items());

    item.classList.add('is-drag-active');
    this.container.classList.add('is-drag-active');
    document.body.classList.add('is-drag-reordering');
    this.siblings = this.items().filter(function (el) { return el !== item; });
    this.lastRects = rects(this.siblings);
    state.slots = this.items().map(function (el) {
      var r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }
    item.classList.remove('is-drag-armed');
  };

  /* آیتم و همسایه‌ها را با FLIP جابه‌جا می‌کند تا حرکت هم‌زمان و شناور باشد. */
  Sortable.prototype.relayout = function () {
    var item = this.state.item;
    var before = this.lastRects;
    var siblings = this.items().filter(function (el) { return el !== item; });

    this.siblings = siblings;
    this.lastRects = rects(siblings);

    siblings.forEach(function (el) {
      var old = before.get(el);
      var now = this.lastRects.get(el);
      if (!old || !now) return;
      var dx = old.left - now.left;
      var dy = old.top - now.top;
      if (!dx && !dy) return;
      el.style.transition = 'none';
      el.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';
      el.getBoundingClientRect();
      el.style.transition = 'transform ' + SHIFT_MS + 'ms cubic-bezier(.2,.8,.3,1)';
      requestAnimationFrame(function () { el.style.transform = ''; });
      window.setTimeout(function () { el.style.transition = ''; }, SHIFT_MS + 40);
    }, this);

    var rect = item.getBoundingClientRect();
    this.state.baseLeft = rect.left - this.state.tx;
    this.state.baseTop = rect.top - this.state.ty;
  };

  Sortable.prototype.onMove = function (event) {
    var state = this.state;
    if (!state) return;
    if (state.pointerId != null && event.pointerId != null && event.pointerId !== state.pointerId) return;

    state.x = event.clientX;
    state.y = event.clientY;

    var dx = state.x - state.startX;
    var dy = state.y - state.startY;
    if (!state.dragging) {
      if (!state.armed) {
        if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
          if (state.timer) { clearTimeout(state.timer); state.timer = null; }
          this.state = null;
          this.cleanup();
        }
        return;
      }
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
      this.startDrag();
    }
    if (event.cancelable) event.preventDefault();

    this.applyTransform();
    this.place();
    this.autoScroll();
  };

  Sortable.prototype.applyTransform = function () {
    var state = this.state;
    var item = state.item;
    // محور عمود بر مسیر کشیدن را قفل نکن؛ حرکت آزاد است اما چیدمان فقط
    // در محور فهرست تغییر می‌کند.
    state.tx = state.x - state.grabX - state.baseLeft;
    state.ty = state.y - state.grabY - state.baseTop;
    item.style.transform = 'translate3d(' + state.tx + 'px,' + state.ty + 'px,0)';
  };

  /* آیکون در حال کشیدن روی «جایگاه» زیر دست می‌نشیند؛ جایگاه‌ها همان
     جای اصلی گزینه‌ها هستند و جابه‌جا نمی‌شوند، پس نتیجه همیشه همان جایی
     است که دست روی آن است — نه یک خانه عقب/جلو. */
  Sortable.prototype.place = function () {
    var state = this.state;
    var item = state.item;
    var slots = state.slots;
    if (!slots || !slots.length) return;

    var best = -1;
    var bestDist = Infinity;
    for (var i = 0; i < slots.length; i++) {
      var r = slots[i];
      var d = Math.pow(state.x - (r.left + r.width / 2), 2) + Math.pow(state.y - (r.top + r.height / 2), 2);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    if (best < 0) return;

    var order = this.items();
    var cur = order.indexOf(item);
    if (cur < 0) return;
    var target = Math.max(0, Math.min(slots.length - 1, best));
    if (target === cur) return;

    var next = order.slice();
    next.splice(cur, 1);
    next.splice(target, 0, item);

    var moved = false;
    for (var k = 0; k < next.length; k++) {
      if (this.container.children[k] !== next[k]) {
        this.container.insertBefore(next[k], this.container.children[k] || null);
        moved = true;
      }
    }
    if (moved) this.relayout();
  };

  Sortable.prototype.autoScroll = function () {
    var el = this.container;
    var state = this.state;
    var scrollable = el.scrollHeight > el.clientHeight + 2 ? 'y' : '';
    if (!scrollable) {
      var parent = el.parentElement;
      while (parent && parent !== document.body) {
        if (parent.scrollHeight > parent.clientHeight + 2) { el = parent; scrollable = 'y'; break; }
        parent = parent.parentElement;
      }
    }
    if (!scrollable) return;
    var r = el.getBoundingClientRect();
    var delta = 0;
    if (state.y < r.top + EDGE) delta = -12;
    else if (state.y > r.bottom - EDGE) delta = 12;
    if (!delta) return;
    var top = el.scrollTop;
    el.scrollTop = top + delta;
    var applied = el.scrollTop - top;
    if (!applied) return;
    state.slots.forEach(function (slot) { slot.top -= applied; });
    if (this.lastRects) this.lastRects.forEach(function (rc) { rc.top -= applied; });
  };

  Sortable.prototype.cleanup = function () {
    document.removeEventListener('pointermove', this.onMoveBound);
    document.removeEventListener('pointerup', this.onUpBound);
    document.removeEventListener('pointercancel', this.onUpBound);
    document.removeEventListener('touchmove', this.onTouchMoveBound);
  };

  Sortable.prototype.onUp = function (event) {
    var state = this.state;
    if (!state) return;
    if (state.pointerId != null && event.pointerId != null && event.pointerId !== state.pointerId) return;
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }

    this.state = null;
    this.cleanup();

    if (!state.dragging) {
      state.item.classList.remove('is-drag-armed');
      return;
    }

    var item = state.item;
    var self = this;
    item.classList.remove('is-drag-active', 'is-drag-armed');
    this.container.classList.remove('is-drag-active');
    document.body.classList.remove('is-drag-reordering');

    // آیتم را نرم سر جایش می‌نشانیم (بدون پرش).
    item.style.transition = 'transform ' + SHIFT_MS + 'ms cubic-bezier(.2,.8,.3,1)';
    item.style.transform = '';
    window.setTimeout(function () {
      item.style.transition = '';
      item.style.transform = '';
    }, SHIFT_MS + 30);

    this.suppressClick();
    this.persist();
    activeInstance = null;
    if (this.opts.onReorder) {
      try { this.opts.onReorder(this.container); } catch (err) { console.error(err); }
    }
  };

  Sortable.prototype.suppressClick = function () {
    var handler = function (event) {
      event.preventDefault();
      event.stopPropagation();
      document.removeEventListener('click', handler, true);
    };
    document.addEventListener('click', handler, true);
    window.setTimeout(function () { document.removeEventListener('click', handler, true); }, 420);
  };

  /* ── اتصال خودکار به همهٔ فهرست‌ها ──────────────────────── */
  var AUTO = [
    { sel: '.app-menu-nav', item: '.app-menu-item', axis: 'auto' },
    { sel: '.settings-tabs', item: '[role="tab"]', axis: 'x', persistKey: 'atlas:settings-tabs' },
    { sel: '.module-tabs', item: '[data-tab]', axis: 'x' },
    { sel: '[data-drag-list]', item: '[data-drag-item]', axis: 'auto' }
  ];

  var observers = new WeakMap();

  function autoAttach(root) {
    var scope = root || document;
    AUTO.forEach(function (rule) {
      var lists = [];
      if (scope.matches && scope.matches(rule.sel)) lists.push(scope);
      scope.querySelectorAll(rule.sel).forEach(function (el) { lists.push(el); });
      lists.forEach(function (list) {
        if (list.dataset.dragAuto === '1') return;
        list.dataset.dragAuto = '1';
        var options = { itemSelector: rule.item, axis: rule.axis, injectHandle: false };
        // فقط کلیدهای موجود را می‌فرستیم؛ مقدار undefined روی تنظیماتِ
        // قبلیِ همان فهرست بازنویسی می‌شود و ذخیره‌سازی را از کار می‌اندازد.
        if (rule.persistKey) options.persistKey = rule.persistKey;
        attach(list, options);
      });
    });
  }

  function attach(container, options) {
    if (!container) return null;
    var existing = instances.get(container);
    if (existing) {
      existing.opts = Object.assign({}, existing.opts, options || {});
      existing.itemSelector = existing.opts.itemSelector || existing.itemSelector;
      existing.prepare();
      return existing;
    }
    var instance = new Sortable(container, options);
    instances.set(container, instance);
    return instance;
  }

  function boot() {
    autoAttach(document);
    var pending = null;
    var observer = new MutationObserver(function () {
      if (pending) return;
      pending = requestAnimationFrame(function () {
        pending = null;
        autoAttach(document);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    observers.set(document, observer);
  }

  window.AtlasDragReorder = {
    attach: attach,
    auto: autoAttach,
    get active() { return activeInstance; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

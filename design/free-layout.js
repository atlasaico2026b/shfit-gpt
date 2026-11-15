/* ─────────────────────────────────────────────────────────────
   چیدمان شناور و آزاد کادرها — AtlasShift
   ─────────────────────────────────────────────────────────────
   هر کادر با موقعیت مطلق و اندازهٔ پیکسلیِ خودش می‌نشیند.

   دو حالت:
     mode: 'free'  → جای دستی: x/y هر کادر آزاد است و کاربر هر جا
                     رهایش کند همان‌جا می‌ماند، ولی «گرانش» عمودی همیشه
                     روشن است تا حفرهٔ خالی زیر کادرها نماند.
     mode: 'pack'  → ردیف‌های توجیه‌شده: هر ردیف تا لبه پر می‌شود.

   تغییر اندازه از هر هشت جهت (n/s/e/w + چهار گوشه) ممکن است و در
   دستگاه مختصات منطقی کار می‌کند تا در RTL هم درست باشد.

   API:
     const layout = AtlasFreeLayout.attach(host, {
       itemSelector: '.widget',
       gap: 17,
       minWidth: 220, minHeight: 120,
       mode: 'free',
      spanOf(el) -> 1..12,
      getSize(id, width) -> {x, y, w, h} | null,   // width = عرض محتوای همین میزبان
      setSize(id, {x, y, w, h}, width),
      onChange()   // پس از هر تغییر کاربر
    });
    layout.render();

   چیدمان را با `AtlasFreeLayout.rectFromPx` ذخیره و با `rectToPx` بخوانید
   تا یک چیدمان در داشبورد و ویرایشگر تنظیمات (دو عرض متفاوت) یکسان بماند.
*/(function () {
  'use strict';

  var SPAN_BY_SIZE = { compact: 4, medium: 6, wide: 8, full: 12 };
  var COLS = 12;
  var EPS = 0.5;
  /* چیدمان یک کادر در «کسری از عرض میزبان» ذخیره می‌شود، نه پیکسل خام:
     ویرایشگر تنظیمات و داشبورد دو میزبان با عرض‌های متفاوت‌اند و پیکسل
     خام باعث می‌شد همان چیدمان در داشبورد به‌هم‌ریخته دیده شود. */
  var REF_WIDTH = 1200;
  var instances = [];

  /* {fx, fy, fw, h} → {x, y, w, h} بر حسب پیکسلِ همین عرض.
     rect قدیمی (فقط پیکسل) با عرض مرجع به کسر تبدیل می‌شود. */
  function rectToPx(rect, width) {
    if (!rect || typeof rect !== 'object') return null;
    var span = number(width, 0) > 0 ? number(width, 0) : REF_WIDTH;
    var height = Math.max(0, Math.round(number(rect.h, 0)));
    var fw = number(rect.fw, 0);
    if (fw > 0) {
      return {
        x: Math.max(0, Math.round(number(rect.fx, 0) * span)),
        y: Math.max(0, Math.round(number(rect.fy, 0) * span)),
        w: Math.max(0, Math.round(fw * span)),
        h: height
      };
    }
    var ratio = span / REF_WIDTH;
    return {
      x: Math.max(0, Math.round(number(rect.x, 0) * ratio)),
      y: Math.max(0, Math.round(number(rect.y, 0) * ratio)),
      w: Math.max(0, Math.round(number(rect.w, 0) * ratio)),
      h: height
    };
  }

  function rectFromPx(size, width) {
    var span = number(width, 0) > 0 ? number(width, 0) : REF_WIDTH;
    var source = size && typeof size === 'object' ? size : {};
    return {
      fx: Math.max(0, number(source.x, 0)) / span,
      fy: Math.max(0, number(source.y, 0)) / span,
      fw: clamp(Math.max(0, number(source.w, 0)) / span, 0, 1),
      h: Math.max(0, Math.round(number(source.h, 0)))
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function number(value, fallback) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : fallback;
  }

  function isRtl() {
    return (document.documentElement.dir || document.body.dir || 'rtl') === 'rtl';
  }

  function overlaps(a, b, gap) {
    return a.x < b.x + b.w + gap - 0.01 && b.x < a.x + a.w + gap - 0.01 &&
      a.y < b.y + b.h + gap - 0.01 && b.y < a.y + a.h + gap - 0.01;
  }

  function hOverlap(a, b, gap) {
    return a.x < b.x + b.w + gap - 0.01 && b.x < a.x + a.w + gap - 0.01;
  }

  /* «h» و «both» نام‌های قدیمی‌اند و هنوز پذیرفته می‌شوند. */
  function axisFlags(axis) {
    var a = String(axis || 'se').toLowerCase();
    if (a === 'h' || a === 'v') a = 's';
    if (a === 'both') a = 'se';
    if (a.length <= 1) return { n: a === 'n', s: a === 's', e: a === 'e', w: a === 'w' };
    return {
      n: a.indexOf('n') >= 0,
      s: a.indexOf('s') >= 0,
      e: a.indexOf('e') >= 0,
      w: a.indexOf('w') >= 0
    };
  }

  function FreeLayout(host, options) {
    this.host = host;
    this.opts = options || {};
    this.opts.gap = number(this.opts.gap, 16);
    this.opts.minWidth = number(this.opts.minWidth, 220);
    this.opts.minHeight = number(this.opts.minHeight, 120);
    this.opts.stackBelow = number(this.opts.stackBelow, 660);
    this.opts.mode = this.opts.mode === 'pack' ? 'pack' : 'free';
    this.opts.itemSelector = this.opts.itemSelector || '.widget';
    this.opts.dragSelector = this.opts.dragSelector || '.free-drag';
    this.opts.resizeSelector = this.opts.resizeSelector || '.free-resize';
    // وقتی false باشد هیچ دستگیرهٔ تغییر اندازه ساخته نمی‌شود و کشیدنِ لبه‌ها هم
    // نادیده گرفته می‌شود؛ اندازه فقط از تنظیمات (پنل ویرایش) تعیین می‌شود.
    this.opts.resize = this.opts.resize !== false;
    // وقتی false باشد کشیدنِ کادر هم نادیده گرفته می‌شود؛ داشبورد با این حالت
    // فقط نمایشی است و جابه‌جایی هم ندارد.
    this.opts.drag = this.opts.drag !== false;
    this.state = null;
    this.busy = false;
    this.positions = {};
    this.lastHeights = {};
    this.host.classList.add('free-layout');
    this.bind();
    this.observe();
  }

  FreeLayout.prototype.idOf = function (el) {
    if (this.opts.idOf) return this.opts.idOf(el);
    return el.dataset.widget || el.dataset.dashCard || el.dataset.freeId || '';
  };

  FreeLayout.prototype.items = function () {
    var selector = this.opts.itemSelector || '.widget';
    return Array.prototype.slice.call(this.host.children).filter(function (el) {
      return el.matches && el.matches(selector) && el.style.display !== 'none' && !el.hidden;
    });
  };

  FreeLayout.prototype.defaultWidth = function (el, width) {
    var span = this.opts.spanOf ? number(this.opts.spanOf(el), 0) : 0;
    if (!span) span = SPAN_BY_SIZE[el.dataset.size] || COLS;
    span = clamp(span, 1, COLS);
    var unit = (width - this.opts.gap * (COLS - 1)) / COLS;
    return unit * span + this.opts.gap * (span - 1);
  };

  FreeLayout.prototype.box = function () {
    var host = this.host;
    var style = window.getComputedStyle(host);
    var rtl = isRtl();
    var padStart = number(parseFloat(rtl ? style.paddingRight : style.paddingLeft), 0);
    var padEnd = number(parseFloat(rtl ? style.paddingLeft : style.paddingRight), 0);
    var padTop = number(parseFloat(style.paddingTop), 0);
    var padBottom = number(parseFloat(style.paddingBottom), 0);
    return {
      rtl: rtl,
      padStart: padStart,
      padTop: padTop,
      padBottom: padBottom,
      width: Math.max(0, host.clientWidth - padStart - padEnd)
    };
  };

  /* چیدمان ردیفی توجیه‌شده: کادرها پشت سر هم در ردیف می‌نشینند و هر ردیف
     دقیقاً تا لبه پر می‌شود. خروجی: [{ index, x, y, w, h }] */
  function planRows(widths, heights, limit, gap) {
    var rows = [];
    var current = null;
    widths.forEach(function (width, index) {
      var needed = current ? current.used + gap + width : width;
      if (!current || needed > limit + EPS) {
        current = { items: [], used: 0 };
        rows.push(current);
        needed = width;
      }
      current.items.push(index);
      current.used = needed;
    });

    var plan = new Array(widths.length);
    var y = 0;
    rows.forEach(function (row) {
      var total = row.items.reduce(function (acc, index) { return acc + widths[index]; }, 0);
      var free = Math.max(0, limit - row.used);
      var rowHeight = row.items.reduce(function (acc, index) { return Math.max(acc, heights[index]); }, 0);
      var x = 0;
      row.items.forEach(function (index, position) {
        var width = total > 0 ? Math.round(widths[index] + free * (widths[index] / total)) : widths[index];
        if (position === row.items.length - 1) width = limit - x;
        plan[index] = { index: index, x: x, y: y, w: Math.max(1, width), h: rowHeight };
        x += width + gap;
      });
      y += rowHeight + gap;
    });
    return plan;
  }

  /* بالاترین جای خالی که کادر می‌تواند بدون برخورد بنشیند. */
  function lowestFreeY(card, all, gap) {
    var candidates = [0];
    for (var i = 0; i < all.length; i++) {
      var other = all[i];
      if (other === card || !hOverlap(card, other, gap)) continue;
      candidates.push(other.y + other.h + gap);
    }
    candidates.sort(function (a, b) { return a - b; });
    for (var c = 0; c < candidates.length; c++) {
      var y = Math.max(0, candidates[c]);
      if (y >= card.y - EPS) continue;
      var probe = { x: card.x, y: y, w: card.w, h: card.h };
      var hit = false;
      for (var m = 0; m < all.length; m++) {
        if (all[m] === card) continue;
        if (overlaps(probe, all[m], gap)) { hit = true; break; }
      }
      if (!hit) return y;
    }
    return card.y;
  }

  /* جای دستی را نگه می‌دارد، برخوردها را با راندن به پایین حل می‌کند و بعد
     گرانش عمودی: هر کادر تا جای ممکن بالا می‌آید تا حفرهٔ خالی نماند. */
  function compact(cards, gap, limit) {
    cards.forEach(function (card) {
      card.w = Math.min(Math.max(1, card.w), limit);
      card.x = clamp(number(card.x, 0), 0, Math.max(0, limit - card.w));
      card.y = Math.max(0, number(card.y, 0));
    });

    var order = cards.slice().sort(function (a, b) { return (a.y - b.y) || (a.x - b.x); });

    for (var i = 0; i < order.length; i++) {
      var guard = 0;
      var moved = true;
      while (moved && guard++ < 500) {
        moved = false;
        for (var j = 0; j < i; j++) {
          if (overlaps(order[j], order[i], gap)) {
            order[i].y = order[j].y + order[j].h + gap;
            moved = true;
          }
        }
      }
    }

    for (var pass = 0; pass < 40; pass++) {
      var changed = false;
      for (var k = 0; k < order.length; k++) {
        var target = lowestFreeY(order[k], order, gap);
        if (target < order[k].y - EPS) { order[k].y = target; changed = true; }
      }
      if (!changed) break;
    }
    return order;
  }

  FreeLayout.prototype.layout = function () {
    var self = this;
    var box = this.box();
    if (!box.width) return;
    var host = this.host;
    var list = this.items();
    if (!list.length) { host.style.height = ''; this.lastWidth = box.width; return; }
    var stacked = box.width < this.opts.stackBelow;
    var gap = this.opts.gap;
    var mode = stacked ? 'pack' : this.opts.mode;

    this.busy = true;

    var cards = list.map(function (el) {
      var id = self.idOf(el);
      var saved = (self.opts.getSize && self.opts.getSize(id, box.width)) || {};
      var width = saved.w
        ? clamp(Math.round(number(saved.w, 0)), self.opts.minWidth, box.width)
        : clamp(self.defaultWidth(el, box.width), self.opts.minWidth, box.width);
      if (stacked) width = box.width;
      return {
        el: el,
        id: id,
        saved: saved,
        width: width,
        savedHeight: Math.max(0, number(saved.h, 0))
      };
    });

    cards.forEach(function (card) {
      card.el.style.width = card.width + 'px';
      // اندازهٔ ذخیره‌شده (تنظیمات) قفل است: ارتفاع نه از محتوا بزرگ می‌شود و
      // نه کوچک؛ محتوای بیشتر داخل ناحیهٔ اسکرولِ خودِ کادر می‌ماند.
      card.el.style.height = card.savedHeight ? card.savedHeight + 'px' : '';
      card.el.style.minHeight = card.savedHeight ? card.savedHeight + 'px' : '';
      card.el.style.insetInlineStart = box.padStart + 'px';
      card.el.style.top = box.padTop + 'px';
    });

    // ارتفاع هر کادر: اگر در تنظیمات تعیین شده باشد دقیقاً همان؛ وگرنه ارتفاع
    // طبیعی محتوا (فقط برای کادرهایی که هنوز اندازه‌ای برایشان ثبت نشده).
    var heights = cards.map(function (card) {
      if (card.savedHeight) return card.savedHeight;
      var measured = Math.round(card.el.getBoundingClientRect().height);
      return Math.max(measured, stacked ? 0 : self.opts.minHeight);
    });

    var plan = planRows(cards.map(function (card) { return card.width; }), heights, box.width, gap);

    var byEl = {};
    cards.forEach(function (card, index) { byEl[card.id] = { card: card, height: heights[index] }; });

    var slots;
    if (mode === 'pack') {
      slots = plan.map(function (slot) {
        // ارتفاع هر کادر همان است که برایش تعیین شده؛ ردیف فقط جای‌گذاری را
        // تعیین می‌کند و کادرِ کوتاه‌تر را کش نمی‌دهد.
        return { el: cards[slot.index].el, x: slot.x, y: slot.y, w: slot.w, h: heights[slot.index] };
      });
    } else {
      var free = cards.map(function (card, index) {
        var fallback = plan[index];
        return {
          el: card.el,
          x: card.saved.x != null ? number(card.saved.x, fallback.x) : fallback.x,
          y: card.saved.y != null ? number(card.saved.y, fallback.y) : fallback.y,
          w: card.width,
          h: heights[index]
        };
      });
      slots = compact(free, gap, box.width);
    }

    var positions = {};
    var measuredHeights = {};
    slots.forEach(function (slot) {
      var x = Math.round(slot.x);
      var y = Math.round(slot.y);
      var w = Math.round(slot.w);
      var h = Math.round(slot.h);
      slot.el.style.width = w + 'px';
      slot.el.style.minHeight = h + 'px';
      var known = byEl[self.idOf(slot.el)];
      slot.el.style.height = known && known.card.savedHeight ? h + 'px' : '';
      slot.el.style.insetInlineStart = Math.round(box.padStart + slot.x) + 'px';
      slot.el.style.top = Math.round(box.padTop + slot.y) + 'px';
      slot.el.dataset.freeWidth = String(w);
      slot.el.dataset.freeHeight = String(h);
      slot.el.dataset.freeX = String(x);
      slot.el.dataset.freeY = String(y);
      var id = self.idOf(slot.el);
      positions[id] = { x: x, y: y, w: w, h: h };
      measuredHeights[id] = h;
    });

    var total = slots.reduce(function (acc, slot) { return Math.max(acc, slot.y + slot.h); }, 0);
    host.style.height = Math.round(total + box.padTop + box.padBottom) + 'px';
    this.lastWidth = box.width;
    this.positions = positions;
    this.lastHeights = measuredHeights;

    this.busy = false;
    host.dispatchEvent(new CustomEvent('free-layout'));
  };

  var GRIPS = [
    { axis: 'n', label: 'کشیدن لبهٔ بالا' },
    { axis: 's', label: 'کشیدن لبهٔ پایین' },
    { axis: 'e', label: 'کشیدن لبهٔ کنار' },
    { axis: 'w', label: 'کشیدن لبهٔ کنار' },
    { axis: 'ne', label: 'تغییر اندازه از گوشه' },
    { axis: 'nw', label: 'تغییر اندازه از گوشه' },
    { axis: 'se', label: 'تغییر اندازه از گوشه' },
    { axis: 'sw', label: 'تغییر اندازه از گوشه' }
  ];

  FreeLayout.prototype.ensureHandles = function (el) {
    if (!this.opts.inject || el.dataset.freeHandles) return;
    el.dataset.freeHandles = '1';
    var header = el.querySelector('.widget-header, .dash-card-head');
    var handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'free-drag';
    handle.setAttribute('aria-label', 'جابه‌جایی کادر');
    handle.setAttribute('title', 'برای جابه‌جایی بکش');
    handle.textContent = '⠿';
    if (header) header.insertBefore(handle, header.firstChild);
    else el.insertBefore(handle, el.firstChild);
    if (!this.opts.resize) return;
    GRIPS.forEach(function (grip) {
      var node = document.createElement('span');
      node.className = 'free-resize';
      node.dataset.freeResize = grip.axis;
      node.setAttribute('role', 'separator');
      node.setAttribute('aria-label', grip.label);
      el.appendChild(node);
    });
  };

  /* محتوای کادر داخل یک ناحیهٔ اسکرول‌شونده می‌نشیند تا اندازهٔ کادر ثابت
     بماند و اطلاعات بیشتر داخل خودِ کادر اسکرول شود (سربرگ بیرون می‌ماند). */
  FreeLayout.prototype.ensureBody = function (el) {
    if (!this.opts.scrollBody || el.dataset.freeScrollBody) return;
    el.dataset.freeScrollBody = '1';
    var body = document.createElement('div');
    body.className = 'free-body';
    var header = null;
    var keep = ['widget-header', 'dash-card-head', 'free-drag', 'free-resize'];
    Array.prototype.slice.call(el.childNodes).forEach(function (node) {
      if (node.nodeType === 1 && keep.some(function (name) { return node.classList.contains(name); })) {
        if (node.classList.contains('widget-header') || node.classList.contains('dash-card-head')) header = node;
        return;
      }
      if (node.nodeType === 3 && !node.nodeValue.trim()) return;
      body.appendChild(node);
    });
    if (header && header.nextSibling) el.insertBefore(body, header.nextSibling);
    else el.appendChild(body);
  };

  FreeLayout.prototype.prepare = function () {
    var self = this;
    this.items().forEach(function (el) {
      self.ensureBody(el);
      self.ensureHandles(el);
      if (self.observer) { try { self.observer.observe(el); } catch (error) {} }
    });
  };

  FreeLayout.prototype.render = function () {
    this.prepare();
    this.layout();
  };

  FreeLayout.prototype.bind = function () {
    var self = this;
    if (this.bound) return;
    this.bound = true;

    this.host.addEventListener('pointerdown', function (event) {
      if (self.state) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      var card = event.target.closest && event.target.closest(self.opts.itemSelector);
      if (!card || card.parentNode !== self.host) return;
      var grab = self.opts.drag ? event.target.closest(self.opts.dragSelector) : null;
      var grip = self.opts.resize ? event.target.closest(self.opts.resizeSelector) : null;
      if (!grab && !grip) return;

      var box = self.box();
      var id = self.idOf(card);
      var pos = self.positions[id] || {};
      var rect = card.getBoundingClientRect();
      self.state = {
        mode: grip ? 'resize' : 'drag',
        flags: grip ? axisFlags(grip.dataset.freeResize || grip.dataset.dashResize) : null,
        card: card,
        id: id,
        rtl: box.rtl,
        startX: event.clientX,
        startY: event.clientY,
        x: number(pos.x, number(parseFloat(card.style.insetInlineStart), box.padStart) - box.padStart),
        y: number(pos.y, number(parseFloat(card.style.top), box.padTop) - box.padTop),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        limit: box.width,
        padStart: box.padStart,
        padTop: box.padTop,
        pointerId: event.pointerId
      };

      card.classList.add(grip ? 'is-resizing' : 'is-dragging');
      try { (grip || grab).setPointerCapture(event.pointerId); } catch (error) {}
      event.preventDefault();
    }, { passive: false });

    document.addEventListener('pointermove', function (event) { self.onMove(event); }, { passive: false });
    document.addEventListener('pointerup', function (event) { self.onEnd(event); });
    document.addEventListener('pointercancel', function (event) { self.onEnd(event); });
  };

  FreeLayout.prototype.onMove = function (event) {
    var state = this.state;
    if (!state) return;
    if (state.pointerId != null && event.pointerId != null && event.pointerId !== state.pointerId) return;
    var dx = event.clientX - state.startX;
    var dy = event.clientY - state.startY;
    var along = state.rtl ? -dx : dx; // جهت منطقیِ inline
    var card = state.card;

    if (state.mode === 'drag') {
      var x = clamp(state.x + along, 0, Math.max(0, state.limit - state.width));
      var y = Math.max(0, state.y + dy);
      card.style.insetInlineStart = Math.round(state.padStart + x) + 'px';
      card.style.top = Math.round(state.padTop + y) + 'px';
    } else {
      var flags = state.flags;
      var x0 = state.x;
      var y0 = state.y;
      var w = state.width;
      var h = state.height;
      if (flags.w) {
        var nextX = clamp(x0 + along, 0, x0 + w - this.opts.minWidth);
        w += x0 - nextX;
        x0 = nextX;
      }
      if (flags.e) w = clamp(w + along, this.opts.minWidth, state.limit - x0);
      if (flags.n) {
        var nextY = Math.max(0, Math.min(y0 + dy, y0 + h - this.opts.minHeight));
        h += y0 - nextY;
        y0 = nextY;
      }
      if (flags.s) h = Math.max(this.opts.minHeight, h + dy);
      card.style.width = Math.round(w) + 'px';
      // هنگام تغییر اندازه ارتفاع دقیق است، نه کفِ ارتفاع.
      card.style.height = Math.round(h) + 'px';
      card.style.minHeight = Math.round(h) + 'px';
      card.style.insetInlineStart = Math.round(state.padStart + x0) + 'px';
      card.style.top = Math.round(state.padTop + y0) + 'px';
    }
    event.preventDefault();
  };

  FreeLayout.prototype.onEnd = function () {
    var state = this.state;
    if (!state) return;
    this.state = null;
    var card = state.card;
    card.classList.remove('is-dragging', 'is-resizing');

    var rect = card.getBoundingClientRect();
    var size = (this.opts.getSize && this.opts.getSize(state.id, state.limit)) || {};
    size.x = Math.max(0, Math.round(number(parseFloat(card.style.insetInlineStart), state.padStart) - state.padStart));
    size.y = Math.max(0, Math.round(number(parseFloat(card.style.top), state.padTop) - state.padTop));
    size.w = Math.round(clamp(rect.width, this.opts.minWidth, state.limit));
    // ارتفاع ثبت‌شده همان ارتفاع واقعی کادر است؛ اگر کادر آزاد (خودکار) باشد
    // ارتفاع اندازه‌گیری‌شده ذخیره می‌شود تا از این پس اندازه ثابت بماند.
    size.h = Math.round(Math.max(0, number(parseFloat(card.style.height), rect.height)));
    if (this.opts.setSize) this.opts.setSize(state.id, size, state.limit);

    this.render();
    if (this.opts.onChange) this.opts.onChange();
  };

  FreeLayout.prototype.observe = function () {
    var self = this;
    if (typeof ResizeObserver !== 'function') {
      this.onResize = function () { if (!self.state) self.layout(); };
      window.addEventListener('resize', this.onResize);
      return;
    }

    var pending = false;
    function schedule() {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(function () {
        pending = false;
        if (self.state) return;
        self.render();
      });
    }

    this.observer = new ResizeObserver(function (entries) {
      if (self.busy || self.state) return;
      var changed = Math.abs(self.host.clientWidth - (self.lastWidth || 0)) >= 1;
      if (!changed) {
        for (var i = 0; i < entries.length; i++) {
          var el = entries[i].target;
          if (el === self.host) continue;
          var known = self.lastHeights[self.idOf(el)];
          if (known == null) continue;
          if (Math.abs(Math.round(el.getBoundingClientRect().height) - known) > 2) { changed = true; break; }
        }
      }
      if (changed) schedule();
    });
    this.observer.observe(this.host);
  };

  window.AtlasFreeLayout = {
    attach: function (host, options) {
      if (!host) return null;
      instances = instances.filter(function (item) { return item.host.isConnected; });
      var existing = instances.filter(function (item) { return item.host === host; })[0];
      if (existing) {
        existing.opts = Object.assign({}, existing.opts, options || {});
        return existing;
      }
      var instance = new FreeLayout(host, options);
      instances.push(instance);
      return instance;
    },
    refresh: function () {
      instances.forEach(function (item) { if (!item.state) item.render(); });
    },
    planRows: planRows,
    compact: compact,
    rectToPx: rectToPx,
    rectFromPx: rectFromPx,
    REF_WIDTH: REF_WIDTH,
    axisFlags: axisFlags,
    isRtl: isRtl,
    GRIPS: GRIPS,
    instances: instances
  };

  window.ATLAS_LAYOUT_REFRESH = function () {
    if (window.AtlasFreeLayout) window.AtlasFreeLayout.refresh();
  };
})();

// آزمون موتور چیدمان شناور با یک DOM سبک: چیدمان آزاد، درگ، ریسایز هشت‌جهته
// و مرتب‌شدن خودکار وقتی محتوای یک کادر بزرگ می‌شود.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

/* ── DOM سبک ─────────────────────────────────────────────────────────── */
class El {
  constructor(tag, cls) {
    this.tagName = (tag || 'div').toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this._contentHeight = null;
    this._classes = new Set((cls || '').split(/\s+/).filter(Boolean));
    this._listeners = {};
    this._rect = { width: 0, height: 0, left: 0, top: 0 };
    this.classList = {
      add: (...names) => names.forEach(n => this._classes.add(n)),
      remove: (...names) => names.forEach(n => this._classes.delete(n)),
      contains: n => this._classes.has(n),
    };
  }
  get className() { return Array.from(this._classes).join(' '); }
  set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  matches(sel) {
    return String(sel).split(',').some(part => {
      const s = part.trim();
      if (s.startsWith('.')) return this._classes.has(s.slice(1));
      if (s.startsWith('[')) {
        const m = s.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
        if (!m) return false;
        const key = m[1].replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        return m[2] === undefined ? this.dataset[key] !== undefined : this.dataset[key] === m[2];
      }
      return this.tagName === s.toUpperCase();
    });
  }
  closest(sel) {
    let node = this;
    while (node) { if (node.matches && node.matches(sel)) return node; node = node.parentNode; }
    return null;
  }
  querySelector(sel) {
    for (const child of this.children) {
      if (child.matches(sel)) return child;
      const found = child.querySelector(sel);
      if (found) return found;
    }
    return null;
  }
  querySelectorAll(sel) {
    const out = [];
    const walk = node => node.children.forEach(c => { if (c.matches(sel)) out.push(c); walk(c); });
    walk(this);
    return out;
  }
  appendChild(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.children.push(node);
    return node;
  }
  insertBefore(node, ref) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    const index = ref ? this.children.indexOf(ref) : -1;
    if (index < 0) this.children.push(node);
    else this.children.splice(index, 0, node);
    return node;
  }
  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    node.parentNode = null;
    return node;
  }
  // ارتفاع واقعی = بیشینهٔ محتوای طبیعی و minHeight — مثل مرورگر واقعی؛ ولی
  // اگر ارتفاع ثابت (height) تنظیم شده باشد، همان است و محتوا داخلش اسکرول می‌شود.
  getBoundingClientRect() {
    const natural = this._contentHeight != null ? this._contentHeight : this._rect.height;
    const width = parseFloat(this.style.width) || this._rect.width;
    const fixed = parseFloat(this.style.height);
    const height = isFinite(fixed) ? fixed : Math.max(natural, parseFloat(this.style.minHeight) || 0);
    const start = parseFloat(this.style.insetInlineStart);
    const top = parseFloat(this.style.top);
    const hostWidth = this.parentNode ? this.parentNode.clientWidth : 0;
    return {
      width,
      height,
      left: isFinite(start) ? hostWidth - start - width : this._rect.left,
      top: isFinite(top) ? top : this._rect.top,
    };
  }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  dispatchEvent(event) { (this._listeners[event.type] || []).forEach(fn => fn(event)); return true; }
  setPointerCapture() {}
  setAttribute(name, value) { (this._attrs = this._attrs || {})[name] = value; }
  getAttribute(name) { return (this._attrs || {})[name]; }
  // گره‌های فرزند فقط عنصر هستند؛ همان چیزی که ensureBody برای جابه‌جایی لازم دارد.
  get childNodes() { return this.children; }
  get nextSibling() {
    const parent = this.parentNode;
    if (!parent) return null;
    return parent.children[parent.children.indexOf(this) + 1] || null;
  }
  get clientWidth() { return this._clientWidth || 0; }
  set clientWidth(v) { this._clientWidth = v; }
}

const documentListeners = {};
const observers = [];
global.document = {
  documentElement: { dir: 'rtl' },
  body: { dir: 'rtl' },
  createElement: tag => new El(tag),
  addEventListener: (type, fn) => { (documentListeners[type] = documentListeners[type] || []).push(fn); },
};
global.window = global;
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.CustomEvent = class { constructor(type) { this.type = type; } };
global.getComputedStyle = () => ({ paddingRight: '0px', paddingLeft: '0px', paddingTop: '0px', paddingBottom: '0px' });
global.requestAnimationFrame = fn => fn();
global.ResizeObserver = class {
  constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
  observe(el) { if (this.targets.indexOf(el) < 0) this.targets.push(el); }
  disconnect() { this.targets = []; }
};

require('../design/free-layout.js');

const checks = [];
const check = (name, ok) => checks.push({ name, ok: !!ok });
const HOST_WIDTH = 1200;
const GAP = 17;

function pointer(host, type, target, x, y) {
  const event = { type, target, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0, preventDefault() {} };
  if (type === 'pointerdown') (host._listeners.pointerdown || []).forEach(fn => fn(event));
  else (documentListeners[type] || []).forEach(fn => fn(event));
}

function box(el) {
  return {
    x: parseFloat(el.style.insetInlineStart),
    y: parseFloat(el.style.top),
    w: parseFloat(el.style.width),
    h: parseFloat(el.style.minHeight),
  };
}

function overlaps(a, b) {
  return a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
}

/* ── ۱) چیدمان آزاد: بدون هم‌پوشانی و داخل صفحه ──────────────────────── */
const host = new El('section', 'dashboard');
host.clientWidth = HOST_WIDTH;
const saved = {};
[{ id: 'a', w: 500, h: 200 }, { id: 'b', w: 300, h: 260 }, { id: 'c', w: 350, h: 180 },
 { id: 'd', w: 600, h: 220 }, { id: 'e', w: 400, h: 300 }].forEach(spec => {
  const el = new El('article', 'widget');
  el.dataset.widget = spec.id;
  el._rect = { width: spec.w, height: spec.h, left: 0, top: 0 };
  host.appendChild(el);
});

const layout = window.AtlasFreeLayout.attach(host, {
  itemSelector: '.widget',
  gap: GAP,
  minWidth: 200,
  minHeight: 120,
  inject: true,
  mode: 'free',
  spanOf: () => 6,
  getSize: id => saved[id] || null,
  setSize: (id, size) => { saved[id] = { x: Math.round(size.x), y: Math.round(size.y), w: Math.round(size.w), h: Math.round(size.h || 0) }; },
});
layout.render();

const widgets = host.children.filter(el => el.matches('.widget'));
const placed = widgets.map(box);

check('همهٔ کادرها موقعیت گرفتند', placed.every(p => isFinite(p.x) && isFinite(p.y) && p.w > 0 && p.h > 0));
check('هیچ کادری از عرض شبکه بیرون نمی‌زند', placed.every(p => p.x + p.w <= HOST_WIDTH + 1));
check('کادرها روی هم نمی‌افتند', placed.every((a, i) => placed.every((b, j) => i >= j || !overlaps(a, b))));
check('ارتفاع میزبان با پایین‌ترین کادر هم‌خوان است', (() => {
  const bottom = Math.max(...placed.map(p => p.y + p.h));
  return Math.abs(parseFloat(host.style.height) - bottom) <= 1;
})());
check('دستگیرهٔ درگ و هر هشت دستگیرهٔ ریسایز تزریق شد', widgets.every(el =>
  el.querySelector('.free-drag') &&
  ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].every(axis => el.querySelector('[data-free-resize="' + axis + '"]'))));

/* ── ۲) درگ: کادر را هر جا رها کنی همان‌جا می‌ماند و x/y ذخیره می‌شود ─── */
const cardA = widgets.find(el => el.dataset.widget === 'a');
const beforeA = box(cardA);
pointer(host, 'pointerdown', cardA.querySelector('.free-drag'), 0, 0);
pointer(host, 'pointermove', cardA.querySelector('.free-drag'), -150, 40);
pointer(host, 'pointerup', cardA.querySelector('.free-drag'), -150, 40);
check('درگ موقعیت افقی را جابه‌جا و ذخیره می‌کند', saved.a && saved.a.x !== beforeA.x);
check('درگ مختصات y را هم ذخیره می‌کند', saved.a && typeof saved.a.y === 'number');
check('بعد از درگ هم هیچ کادری روی هم نمی‌افتد', (() => {
  const all = host.children.filter(el => el.matches('.widget')).map(box);
  return all.every((a, i) => all.every((b, j) => i >= j || !overlaps(a, b)));
})());
check('کادر درگ‌شده داخل صفحه می‌ماند', saved.a.x >= 0 && saved.a.x + saved.a.w <= HOST_WIDTH + 1);

/* ── ۳) تغییر اندازه از هر هشت جهت ───────────────────────────────────── */
const host2 = new El('section', 'dashboard');
host2.clientWidth = HOST_WIDTH;
const saved2 = {};
const card2 = new El('article', 'widget');
card2.dataset.widget = 'p';
card2._rect = { width: 400, height: 150, left: 0, top: 0 };
card2._contentHeight = 150;
host2.appendChild(card2);
const layout2 = window.AtlasFreeLayout.attach(host2, {
  itemSelector: '.widget',
  gap: GAP,
  minWidth: 200,
  minHeight: 120,
  inject: true,
  mode: 'free',
  getSize: id => saved2[id] || null,
  setSize: (id, size) => { saved2[id] = { x: Math.round(size.x), y: Math.round(size.y), w: Math.round(size.w), h: Math.round(size.h || 0) }; },
});
const savedRect = { p: { x: 100, y: 100, w: 400, h: 300 } };
layout2.opts.getSize = id => savedRect[id] || null;

// گرانش همیشه کادرها را رو به بالا جمع می‌کند، پس لبهٔ بالا هرگز حفره نمی‌سازد:
// کشیدن «n» قد را عوض می‌کند ولی y سر جایش (چسبیده به کادر بالایی) می‌ماند.
const axisExpectation = {
  n: { w: false, h: true, x: false, y: false },
  s: { w: false, h: true, x: false, y: false },
  e: { w: true, h: false, x: false, y: false },
  w: { w: true, h: false, x: true, y: false },
  ne: { w: true, h: true, x: false, y: false },
  nw: { w: true, h: true, x: true, y: false },
  se: { w: true, h: true, x: false, y: false },
  sw: { w: true, h: true, x: true, y: false },
};

Object.keys(axisExpectation).forEach(axis => {
  savedRect.p = { x: 100, y: 100, w: 400, h: 300 };
  layout2.render();
  const before = box(card2);
  const grip = card2.querySelector('[data-free-resize="' + axis + '"]');
  pointer(host2, 'pointerdown', grip, 0, 0);
  // dx منفی لبهٔ افقی را به بیرون می‌برد؛ dy مثبت لبهٔ بالایی را به پایین
  // می‌آورد (کادر از y=0 بالاتر نمی‌رود)، پس هر دو جهت قابل آزمون‌اند.
  pointer(host2, 'pointermove', grip, -80, 60);
  pointer(host2, 'pointerup', grip, -80, 60);
  const after = box(card2);
  const expect = axisExpectation[axis];
  const widthChanged = Math.abs(after.w - before.w) > 0.5;
  const heightChanged = Math.abs(after.h - before.h) > 0.5;
  const xChanged = Math.abs(after.x - before.x) > 0.5;
  const yChanged = Math.abs(after.y - before.y) > 0.5;
  check('ریسایز جهت «' + axis + '» فقط ابعاد درست را تغییر می‌دهد',
    widthChanged === expect.w && heightChanged === expect.h &&
    xChanged === expect.x && yChanged === expect.y);
});

check('ریسایز اندازهٔ تازه را ذخیره می‌کند', saved2.p && saved2.p.w > 0 && saved2.p.h > 0);
check('ریسایز از گوشه هم عرض و هم ارتفاع را می‌برد', (() => {
  savedRect.p = { x: 100, y: 100, w: 400, h: 300 };
  layout2.render();
  const before = box(card2);
  const grip = card2.querySelector('[data-free-resize="se"]');
  pointer(host2, 'pointerdown', grip, 0, 0);
  pointer(host2, 'pointermove', grip, -120, 90);
  pointer(host2, 'pointerup', grip, -120, 90);
  const after = box(card2);
  return after.w > before.w && after.h > before.h;
})());
check('کادر هرگز باریک‌تر از کمینه نمی‌شود', (() => {
  savedRect.p = { x: 0, y: 0, w: 220, h: 200 };
  layout2.render();
  const grip = card2.querySelector('[data-free-resize="e"]');
  pointer(host2, 'pointerdown', grip, 0, 0);
  pointer(host2, 'pointermove', grip, 900, 0);
  pointer(host2, 'pointerup', grip, 900, 0);
  return parseFloat(card2.style.width) >= 200;
})());

/* ── ۴) رشد محتوا: چیدمان خودکار مرتب می‌شود و فضای خالی نمی‌ماند ────── */
const host4 = new El('section', 'dashboard');
host4.clientWidth = HOST_WIDTH;
const order = ['g1', 'g2', 'g3'];
order.forEach((id, index) => {
  const el = new El('article', 'widget');
  el.dataset.widget = id;
  el._rect = { width: 500, height: 200, left: 0, top: 0 };
  el._contentHeight = 200;
  host4.appendChild(el);
});
const layout4 = window.AtlasFreeLayout.attach(host4, {
  itemSelector: '.widget',
  gap: GAP,
  minWidth: 200,
  minHeight: 120,
  inject: true,
  mode: 'free',
  spanOf: () => 6,
  getSize: () => null,
  setSize: () => {},
});
layout4.render();

const g1 = host4.children.find(el => el.dataset.widget === 'g1');
const g3 = host4.children.find(el => el.dataset.widget === 'g3');
const beforeGrowth = box(g3);

// محتوای کادر اول بلند می‌شود — انتظار: خودش بزرگ شود و بقیه پایین بروند، بدون حفره.
g1._contentHeight = 520;
const observer = observers.filter(o => o.targets.indexOf(g1) >= 0)[0];
check('مشاهده‌گر تغییر اندازه روی کادرها ثبت شده است', !!observer);
if (observer) observer.callback([{ target: g1 }]);

const afterGrowth = box(g3);
check('کادر بلندشده بزرگ می‌شود', parseFloat(g1.style.minHeight) >= 520);
check('کادرهای زیرین جابه‌جا می‌شوند تا روی هم نیفتند', afterGrowth.y > beforeGrowth.y);
check('بعد از رشد محتوا هیچ کادری روی هم نمی‌افتد', (() => {
  const all = host4.children.filter(el => el.matches('.widget')).map(box);
  return all.every((a, i) => all.every((b, j) => i >= j || !overlaps(a, b)));
})());
check('بعد از رشد محتوا حفرهٔ خالی عمودی نمی‌ماند', (() => {
  const all = host4.children.filter(el => el.matches('.widget')).map(box).sort((a, b) => a.y - b.y);
  return all.every((card, index) => index === 0 || card.y <= all[index - 1].y + all[index - 1].h + GAP + 1 ||
    all.some(other => other !== card && other.x !== card.x));
})());

/* ── ۵) کادر پنهان در چیدمان نمی‌آید ─────────────────────────────────── */
const cardC = host.children.find(el => el.dataset.widget === 'c');
cardC.style.display = 'none';
layout.render();
check('کادر پنهان از چیدمان حذف می‌شود', layout.items().indexOf(cardC) < 0 && layout.items().length === 4);
cardC.style.display = '';

/* ── ۶) چیدمان واقعی داشبورد: حالت ردیفی ─────────────────────────────── */
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const SPAN = { compact: 4, medium: 6, wide: 8, full: 12 };
const specs = [];
const widgetRe = /<article class="widget" data-widget="([^"]+)"(?: data-size="([^"]+)")?/g;
let match;
while ((match = widgetRe.exec(html))) specs.push({ id: match[1], size: match[2] || 'medium' });
check('کادرهای واقعی داشبورد از index.html خوانده شدند', specs.length >= 8);

const natural = { roster: 278, shifts: 223, missions: 180, alerts: 227, fleet: 180, today: 264, safety: 180, activity: 310, stations: 617 };

function realHost(mode) {
  const host3 = new El('section', 'dashboard');
  host3.clientWidth = 1284;
  specs.forEach(spec => {
    const el = new El('article', 'widget');
    el.dataset.widget = spec.id;
    el.dataset.size = spec.size;
    el._rect = { width: 400, height: natural[spec.id] || 240, left: 0, top: 0 };
    host3.appendChild(el);
  });
  const engine = window.AtlasFreeLayout.attach(host3, {
    itemSelector: '.widget', gap: 17, minWidth: 250, minHeight: 170, inject: true, mode,
    spanOf: node => SPAN[node.dataset.size] || 6,
    getSize: () => null,
    setSize: () => {},
  });
  engine.render();
  return { host3, engine, boxes: host3.children.map(box) };
}

const packed = realHost('pack');
check('حالت ردیفی: ردیف‌ها تا لبه پر می‌شوند (بدون فضای خالی)', (() => {
  const rows = {};
  packed.boxes.forEach(r => { (rows[r.y] = rows[r.y] || []).push(r); });
  return Object.values(rows).every(items => {
    const end = Math.max(...items.map(i => i.x + i.w));
    return Math.abs(end - 1284) <= 1;
  });
})());

const free = realHost('free');
check('حالت آزاد واقعی: هیچ کادری روی هم نمی‌افتد', free.boxes.every((a, i) => free.boxes.every((b, j) => i >= j || !overlaps(a, b))));
check('حالت آزاد واقعی: کادرها کنار هم می‌نشینند (حداقل یک ردیف چندکادری)', (() => {
  const rows = {};
  free.boxes.forEach(r => { (rows[r.y] = rows[r.y] || []).push(r); });
  return Object.values(rows).some(items => items.length > 1);
})());
check('حالت آزاد واقعی: هیچ کادری از عرض داشبورد بیرون نمی‌زند', free.boxes.every(r => r.x + r.w <= 1284 + 1));
check('حالت آزاد واقعی: هیچ کادری باریک‌تر از کمینه نیست', free.boxes.every(r => r.w >= 250 - 1));

/* ── ۵) یک چیدمان، دو میزبان: ویرایشگر تنظیمات (باریک) و داشبورد (پهن) ──
   هندسه به کسری از عرض میزبان ذخیره می‌شود، پس چیدمانی که در تنظیمات درست
   چیده شده باید در داشبورد هم همان نسبت‌ها را داشته باشد، نه پیکسل خام. */
const shared = {};
function sharedOptions() {
  return {
    itemSelector: '.widget', gap: GAP, minWidth: 250, minHeight: 170, inject: true, mode: 'free',
    spanOf: () => 6,
    getSize: (id, width) => window.AtlasFreeLayout.rectToPx(shared[id], width),
    setSize: (id, size, width) => { shared[id] = window.AtlasFreeLayout.rectFromPx(size, width); },
  };
}
function sharedHost(width, ids) {
  const node = new El('section', 'dashboard');
  node.clientWidth = width;
  ids.forEach(id => {
    const el = new El('article', 'widget');
    el.dataset.widget = id;
    el._rect = { width: 300, height: 200, left: 0, top: 0 };
    el._contentHeight = 200;
    node.appendChild(el);
  });
  const engine = window.AtlasFreeLayout.attach(node, sharedOptions());
  engine.render();
  return { node, engine };
}

const EDITOR_WIDTH = 760;
const DASHBOARD_WIDTH = 1380;
const editorHost = sharedHost(EDITOR_WIDTH, ['a', 'b', 'c']);
const editorCard = editorHost.node.children.filter(el => el.dataset.widget === 'a')[0];
pointer(editorHost.node, 'pointerdown', editorCard.querySelector('[data-free-resize="e"]'), 0, 0);
pointer(editorHost.node, 'pointermove', editorCard.querySelector('[data-free-resize="e"]'), -300, 0);
pointer(editorHost.node, 'pointerup', editorCard.querySelector('[data-free-resize="e"]'), -300, 0);
const editorRatio = box(editorCard).w / EDITOR_WIDTH;

check('چیدمان به کسری از عرض ذخیره می‌شود، نه پیکسل خام',
  shared.a && shared.a.fw > 0 && Math.abs(shared.a.fw - editorRatio) < 0.02);

const dashboardHost = sharedHost(DASHBOARD_WIDTH, ['a', 'b', 'c']);
const dashboardCard = dashboardHost.node.children.filter(el => el.dataset.widget === 'a')[0];
const dashboardBoxes = dashboardHost.node.children.map(box);
check('همان چیدمان در داشبورد به همان نسبت عرض دیده می‌شود',
  Math.abs(box(dashboardCard).w / DASHBOARD_WIDTH - editorRatio) < 0.02);
check('چیدمان داشبورد داخل عرض میزبان می‌ماند',
  dashboardBoxes.every(r => r.x + r.w <= DASHBOARD_WIDTH + 1));
check('چیدمان داشبورد روی هم نمی‌افتد',
  dashboardBoxes.every((a, i) => dashboardBoxes.every((b, j) => i >= j || !overlaps(a, b))));

/* rectهای قدیمی فقط پیکسل داشتند؛ باید با عرض مرجع به کسر تبدیل شوند. */
const LEGACY_REF = window.AtlasFreeLayout.REF_WIDTH;
check('rect قدیمیِ پیکسلی با عرض مرجع خوانده می‌شود',
  Math.round(600 * DASHBOARD_WIDTH / LEGACY_REF) === window.AtlasFreeLayout.rectToPx({ x: 0, y: 0, w: 600, h: 200 }, DASHBOARD_WIDTH).w);
check('rect بدون عرض (فقط ارتفاع ذخیره‌شده) ارتفاع را نگه می‌دارد',
  window.AtlasFreeLayout.rectToPx({ h: 240 }, DASHBOARD_WIDTH).h === 240);

/* ── ۶) اندازهٔ تعیین‌شده در تنظیمات قفل است و محتوا داخل کادر اسکرول می‌شود ──
   ارتفاع ذخیره‌شده دقیقاً همان است که اعمال می‌شود؛ محتوای بیشتر نه کادر را
   بزرگ می‌کند و نه کوچک. محتوای کادر در ناحیهٔ .free-body می‌نشیند تا همان‌جا
   اسکرول شود و سربرگ بیرون آن می‌ماند. */
const fixedSize = {};
function fixedWidget(id) {
  const el = new El('article', 'widget');
  el.dataset.widget = id;
  el._rect = { width: 300, height: 200, left: 0, top: 0 };
  const header = new El('div', 'widget-header');
  const list = new El('div', 'list');
  el.appendChild(header);
  el.appendChild(list);
  return { el, list };
}
const fixedHostNode = new El('section', 'dashboard');
fixedHostNode.clientWidth = HOST_WIDTH;
const tallContent = fixedWidget('locked');
tallContent.el._contentHeight = 900;   // محتوای طبیعی بسیار بلندتر از اندازهٔ تعیین‌شده
const shortContent = fixedWidget('other');
shortContent.el._contentHeight = 120;  // و کادری با محتوای کم
fixedHostNode.appendChild(tallContent.el);
fixedHostNode.appendChild(shortContent.el);
const fixedEngine = window.AtlasFreeLayout.attach(fixedHostNode, {
  itemSelector: '.widget', gap: GAP, minWidth: 250, minHeight: 170, inject: true,
  scrollBody: true, spanOf: () => 6, mode: 'free',
  getSize: id => fixedSize[id] || null,
  setSize: () => {},
});
fixedSize.locked = { fw: 0.5, h: 320 };
fixedSize.other = { fw: 0.5, h: 320 };
fixedEngine.render();

check('ارتفاع تعیین‌شده با محتوای بلندتر بزرگ نمی‌شود',
  Math.round(box(tallContent.el).h) === 320);
check('ارتفاع تعیین‌شده روی کادر واقعی هم همان است',
  Math.round(tallContent.el.getBoundingClientRect().height) === 320);
check('ارتفاع تعیین‌شده با محتوای کمتر هم کوچک نمی‌شود',
  Math.round(box(shortContent.el).h) === 320);
check('محتوای کادر در ناحیهٔ اسکرول (free-body) می‌نشیند',
  !!(shortContent.el.children || []).filter(c => c.classList.contains('free-body'))[0]);
check('سربرگ بیرونِ ناحیهٔ اسکرول می‌ماند',
  shortContent.el.children[0].classList.contains('widget-header'));
check('ناحیهٔ اسکرول محتوای اصلی کادر را در خود دارد',
  !!(shortContent.el.children[1] && shortContent.el.children[1].children.some(c => c.classList.contains('list'))));

/* اگر ارتفاعی ذخیره نشده باشد کادر آزاد می‌ماند (خودکار). */
delete fixedSize.other;
fixedEngine.render();
check('کادر بدون ارتفاع ذخیره‌شده خودکار می‌ماند',
  Math.round(shortContent.el.getBoundingClientRect().height) === 170 && !shortContent.el.style.height);

/* حالت ردیفی هم کادرِ کوتاه‌تر را تا ارتفاع کادر بلندتر کش نمی‌دهد. */
fixedSize.other = { fw: 0.5, h: 200 };
fixedEngine.opts.mode = 'pack';
fixedEngine.render();
check('حالت ردیفی ارتفاع تعیین‌شده را تغییر نمی‌دهد',
  Math.round(box(tallContent.el).h) === 320 && Math.round(box(shortContent.el).h) === 200);

const failed = checks.filter(item => !item.ok);
checks.forEach(item => console.log((item.ok ? '✓ ' : '✗ ') + item.name));
if (failed.length) {
  console.error('\n' + failed.length + ' بررسی ناموفق');
  process.exit(1);
}
console.log('\n' + checks.length + ' بررسی موفق');

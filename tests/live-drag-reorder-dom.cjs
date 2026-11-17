/* آزمون رفتاری موتور «درگ زنده» با یک DOM کوچک و چیدمان ساختگی.
   چون مرورگر در دسترس نیست، موقعیت هر آیتم از ترتیب فرزندان DOM محاسبه
   می‌شود؛ همان چیزی که چیدمان واقعی هم انجام می‌دهد (با ترنسفورم کاری نداریم،
   دقیقاً مثل اندازه‌گیری چیدمانی مرورگر).
   اجرا: node tests/live-drag-reorder-dom.cjs */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'design/drag-reorder.js'), 'utf8');

const W = 100;   // عرض آیتم
const H = 40;    // ارتفاع آیتم
const GAP = 10;  // فاصله
const ORIGIN = 0;

function matches(el, selector) {
  const s = selector.trim();
  if (s.startsWith('.')) return el.className.split(/\s+/).includes(s.slice(1));
  const attr = s.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
  if (attr) {
    const value = el.attrs[attr[1]];
    return attr[2] === undefined ? value !== undefined : value === attr[2];
  }
  return false;
}

function createElement(tag, className) {
  const el = {
    tagName: tag.toUpperCase(),
    className: className || '',
    attrs: {},
    style: {},
    children: [],
    parentNode: null,
    textContent: '',
    offsetWidth: W,
    offsetHeight: H,
    get classList() {
      const self = this;
      return {
        add(name) { const set = new Set(self.className.split(/\s+/).filter(Boolean)); set.add(name); self.className = [...set].join(' '); },
        remove(name) { self.className = self.className.split(/\s+/).filter((c) => c && c !== name).join(' '); },
        contains(name) { return self.className.split(/\s+/).includes(name); }
      };
    },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name]; },
    matches(selector) { return matches(this, selector); },
    closest(selector) {
      let node = this;
      while (node && node.matches) { if (node.matches(selector)) return node; node = node.parentNode; }
      return null;
    },
    querySelector() { return null; },
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    insertBefore(child, ref) {
      if (child.parentNode) child.parentNode.removeChild(child);
      const index = ref ? this.children.indexOf(ref) : this.children.length;
      child.parentNode = this;
      this.children.splice(index < 0 ? this.children.length : index, 0, child);
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      child.parentNode = null;
      return child;
    },
    get index() { return this.parentNode ? this.parentNode.children.indexOf(this) : -1; },
    get offsetLeft() {
      if (!this.parentNode) return 0;
      const i = this.index;
      if (this.parentNode.layout === 'column') return 0;
      return this.parentNode.layout === 'rtl'
        ? this.parentNode.width - (i + 1) * (W + GAP)
        : i * (W + GAP);
    },
    get offsetTop() {
      if (!this.parentNode) return 0;
      const i = this.index;
      return this.parentNode.layout === 'column' ? i * (H + GAP) : 0;
    },
    getBoundingClientRect() {
      const left = (this.parentNode ? this.parentNode.left || 0 : 0) + this.offsetLeft;
      const top = (this.parentNode ? this.parentNode.top || 0 : 0) + this.offsetTop;
      return { left, top, right: left + W, bottom: top + H, width: W, height: H };
    }
  };
  return el;
}

function createList(layout, count) {
  const list = createElement('div', 'list');
  list.layout = layout;      // 'row' | 'rtl' | 'column'
  list.left = ORIGIN;
  list.top = ORIGIN;
  list._listeners = new Map();
  list.addEventListener = (type, handler) => {
    if (!list._listeners.has(type)) list._listeners.set(type, []);
    list._listeners.get(type).push(handler);
  };
  list.removeEventListener = () => {};
  list.width = count * (W + GAP);
  list.offsetWidth = list.width;
  for (let i = 0; i < count; i += 1) {
    const item = createElement('a', 'item');
    item.textContent = 'item-' + i;
    list.appendChild(item);
  }
  return list;
}

function makeEnv() {
  const listeners = new Map();
  const document = {
    body: createElement('body', ''),
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) || [];
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    },
    createElement(tag) { return createElement(tag, ''); }
  };
  const window = {
    requestAnimationFrame(cb) { cb(); return 0; },
    setTimeout(cb) { return 0; },
    clearTimeout() {},
    matchMedia() { return { matches: true }; },
    Map, Math, Object
  };
  return { document, window, listeners };
}

function setup(layout, count) {
  const { document, window, listeners } = makeEnv();
  const context = { window, document, Map, Object, Math, Array, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);

  const list = createList(layout, count);
  const events = [];
  window.AtlasDragReorder.attach(list, {
    itemSelector: '.item',
    injectHandle: false,
    touchMode: 'longpress',
    onReorder() { events.push(list.children.map((el) => el.textContent).join(',')); }
  });

  function fire(type, coords) {
    const handlers = type === 'pointerdown'
      ? (list._listeners.get(type) || []).slice()
      : (listeners.get(type) || []).slice();
    handlers.forEach((handler) => handler(Object.assign({
      pointerId: 1, pointerType: 'mouse', button: 0,
      preventDefault() {}, stopPropagation() {}
    }, coords)));
  }

  return { list, fire, events };
}

function center(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const results = [];
function check(name, ok) { results.push({ name, ok: Boolean(ok) }); }

// ۱ · ردیف افقی چپ‌به‌راست: آیتم اول به جای سوم می‌رود
{
  const { list, fire, events } = setup('row', 4);
  const first = list.children[0];
  const start = center(first);
  fire('pointerdown', { target: first, clientX: start.x, clientY: start.y });
  const target = list.children[2];
  const mid = center(target);
  fire('pointermove', { clientX: mid.x + 5, clientY: start.y });
  check('ردیف افقی: آیتم جابه‌جا می‌شود', list.children.map((el) => el.textContent).join(',') === 'item-1,item-2,item-0,item-3');
  fire('pointerup', { clientX: mid.x + 5, clientY: start.y });
  check('ردیف افقی: onReorder فقط یک بار', events.length === 1);
  check('ردیف افقی: نسخهٔ شناور ساخته نمی‌شود', !list.children.some((el) => /\bdrag-ghost\b/.test(el.className)));
  check('ردیف افقی: ترنزیشن‌ها پاک می‌شوند', list.children.every((el) => !el.style.transform && !el.style.transition));
}

// ۲ · ردیف افقی راست‌به‌چپ (RTL): آیتم اول از راست به چپ می‌رود
{
  const { list, fire } = setup('rtl', 4);
  const first = list.children[0];
  const start = center(first);
  fire('pointerdown', { target: first, clientX: start.x, clientY: start.y });
  const target = list.children[2];
  const mid = center(target);
  fire('pointermove', { clientX: mid.x - 5, clientY: start.y });
  check('RTL: جهت معکوس درست فهمیده می‌شود', list.children.map((el) => el.textContent).join(',') === 'item-1,item-2,item-0,item-3');
  fire('pointerup', { clientX: mid.x - 5, clientY: start.y });
}

// ۳ · فهرست عمودی: آیتم آخر به بالا می‌رود
{
  const { list, fire } = setup('column', 4);
  const last = list.children[3];
  const start = center(last);
  fire('pointerdown', { target: last, clientX: start.x, clientY: start.y });
  const target = list.children[1];
  const mid = center(target);
  fire('pointermove', { clientX: start.x, clientY: mid.y - 5 });
  check('فهرست عمودی: محور y تشخیص داده می‌شود', list.children.map((el) => el.textContent).join(',') === 'item-0,item-3,item-1,item-2');
  fire('pointerup', { clientX: start.x, clientY: mid.y - 5 });
}

// ۴ · جابه‌جایی کمتر از آستانه هیچ ترتیبی را عوض نمی‌کند
{
  const { list, fire, events } = setup('row', 4);
  const first = list.children[0];
  const start = center(first);
  fire('pointerdown', { target: first, clientX: start.x, clientY: start.y });
  fire('pointermove', { clientX: start.x + 2, clientY: start.y });
  check('حرکت کمتر از آستانه: ترتیب نمی‌شود', list.children[0] === first);
  fire('pointerup', { clientX: start.x + 2, clientY: start.y });
  check('حرکت کمتر از آستانه: onReorder صدا زده نمی‌شود', events.length === 0);
}

const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name));
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

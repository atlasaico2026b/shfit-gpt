/* آزمون ماندگاری ترتیب منوهای اصلی: هر چه کاربر در تنظیمات › «منوها و فهرست‌ها»
   می‌چیند باید بعد از بارگذاری دوباره همان‌طور در نوار منو (همان منویی که در
   داشبورد دیده می‌شود) برگردد.
   ریشهٔ باگ: load() فهرست ذخیره‌شده را دور می‌ریخت و ترتیب را از DEFAULTS
   می‌ساخت، پس جابه‌جایی منوها تا اولین رفرش دوام می‌آورد.
   اجرا: node tests/menu-order-persist.cjs */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'menu-manager.js'), 'utf8');

const checks = [];
function check(name, ok) { checks.push({ name, ok: Boolean(ok) }); }

/* ── DOM سبک ─────────────────────────────────────────────────────────── */
class El {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this._listeners = {};
    this._text = '';
    this.checked = false;
    this.disabled = false;
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  }
  get className() { return this._cls || ''; }
  set className(value) { this._cls = String(value); }
  get textContent() { return this._text + this.children.map(child => child.textContent || '').join(''); }
  set textContent(value) { this._text = String(value); }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  appendChild(node) {
    if (node && node.isFragment) { node.children.slice().forEach(child => this.appendChild(child)); node.children = []; return node; }
    this.children.push(node);
    if (node) node.parentNode = this;
    return node;
  }
  replaceChildren(...nodes) { this.children = []; nodes.forEach(node => this.appendChild(node)); }
  addEventListener(type, handler) { (this._listeners[type] = this._listeners[type] || []).push(handler); }
  removeEventListener() {}
  setAttribute(key, value) { this['attr_' + key] = value; }
  getAttribute(key) { return this['attr_' + key]; }
  removeAttribute(key) { delete this['attr_' + key]; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  focus() {}
}

function runModule(savedConfig) {
  const nav = new El('nav');
  nav.className = 'app-menu-nav';
  const managerList = new El('div');
  const store = new Map();
  if (savedConfig) store.set('atlasShiftMainMenuConfigV1', JSON.stringify(savedConfig));

  const document = {
    readyState: 'complete',
    createElement: tag => new El(tag),
    createTextNode: text => ({ textContent: String(text) }),
    createDocumentFragment: () => { const f = new El('fragment'); f.isFragment = true; return f; },
    querySelector: sel => (sel === '.app-menu-nav' ? nav : null),
    getElementById: id => (id === 'mainMenuList' ? managerList : null),
    addEventListener() {},
  };
  const window = { ATLAS_MODULES: { confirm: async () => true } };
  const localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  };

  vm.runInNewContext(source, { window, document, localStorage, console, Set, Array, Object, String, JSON, Date, Number });
  return { nav, store, document };
}

const navIds = nav => nav.children.map(item => item.dataset.menuId);
const DEFAULT_ORDER = ['dashboard', 'employees', 'shifts', 'missions', 'leaves', 'vehicles', 'stations', 'gasmeters', 'notes', 'programs', 'phonebook', 'reports', 'settings'];

/* ۱ · ترتیب ذخیره‌شده باید عیناً برگردد. */
const customOrder = ['dashboard', 'shifts', 'missions', 'employees', 'leaves', 'vehicles', 'stations', 'gasmeters', 'notes', 'programs', 'reports', 'phonebook', 'settings'];
const first = runModule({ hidden: [], labels: {}, custom: [], order: customOrder });
check('ترتیب ذخیره‌شده بعد از بارگذاری حفظ می‌شود', navIds(first.nav).join(',') === customOrder.join(','));

/* ۲ · میان‌بر سفارشی همان‌جایی که کاربر گذاشته می‌ماند. */
const withCustom = ['dashboard', 'employees', 'custom-abc', 'shifts', 'missions', 'leaves', 'vehicles', 'stations', 'gasmeters', 'notes', 'programs', 'phonebook', 'reports', 'settings'];
const second = runModule({
  hidden: [], labels: {}, order: withCustom,
  custom: [{ id: 'custom-abc', title: 'پیگیری تجهیزات', target: 'reports' }],
});
check('میان‌بر سفارشی جای خودش را نگه می‌دارد', navIds(second.nav).join(',') === withCustom.join(','));

/* ۳ · منویی که در فهرست ذخیره‌شده نیست (نسخهٔ تازه‌تر) از دست نمی‌رود. */
const missingOne = ['dashboard', 'employees', 'shifts'];
const third = runModule({ hidden: [], labels: {}, custom: [], order: missingOne });
const thirdIds = navIds(third.nav);
check('منوهای تازه به انتهای فهرست اضافه می‌شوند', thirdIds[0] === 'dashboard' && thirdIds[2] === 'shifts' && thirdIds.length === DEFAULT_ORDER.length);
check('همهٔ منوهای پیش‌فرض یک‌بار و کامل می‌آیند', DEFAULT_ORDER.every(id => thirdIds.filter(item => item === id).length === 1));

/* ۴ · فهرست خراب/تکراری نباید منو را دوباره بسازد. */
const duplicated = ['dashboard', 'employees', 'employees', 'shifts', 'unknown-menu'];
const fourth = runModule({ hidden: [], labels: {}, custom: [], order: duplicated });
check('شناسهٔ تکراری یا ناشناس در نوار منو تکرار نمی‌شود', navIds(fourth.nav).join(',') === ['dashboard', 'employees', 'shifts'].concat(DEFAULT_ORDER.filter(id => !['dashboard', 'employees', 'shifts'].includes(id))).join(','));

let failed = 0;
checks.forEach(item => {
  if (!item.ok) failed += 1;
  console.log((item.ok ? '  ok   ' : '  FAIL ') + item.name);
});
console.log(failed ? '\n' + failed + ' مورد ناموفق' : '\nهمهٔ بررسی‌ها موفق');
process.exit(failed ? 1 : 0);

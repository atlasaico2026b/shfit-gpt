/* آزمون پایداری ذخیره‌سازی رمزنگاری‌شده: شکستِ گذرا در ساخت کلید نباید برای
   کل عمر صفحه کش شود؛ اگر IndexedDB و localStorage یک بار در دسترس نباشند و بعد
   محیط بهتر شود، فراخوانی بعدی باید از نو تلاش کند و ذخیره‌سازی ادامه یابد.
   (قبلاً خطای اول برای همیشه کش می‌شد و تا بازخوانی بعدی صفحه هیچ ذخیره‌ای
   انجام نمی‌شد.)
   اجرا: node tests/secure-store-retry.cjs */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('node:crypto');

const root = path.resolve(__dirname, '..');
let passed = 0;
const failures = [];

function check(label, ok) {
  if (ok) { passed += 1; return; }
  failures.push(label);
}

function makeSandbox(isStorageBroken) {
  const store = new Map();
  const localStorageMock = {
    getItem: (key) => { if (isStorageBroken()) throw new Error('storage unavailable'); return store.has(key) ? store.get(key) : null; },
    setItem: (key, value) => { if (isStorageBroken()) throw new Error('storage unavailable'); store.set(key, String(value)); }
  };
  const sandbox = {
    console,
    TextEncoder,
    TextDecoder,
    btoa: (text) => Buffer.from(text, 'binary').toString('base64'),
    atob: (text) => Buffer.from(text, 'base64').toString('binary'),
    crypto: webcrypto,
    localStorage: localStorageMock,
    indexedDB: { open: () => { throw new Error('IndexedDB unavailable'); } }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'design/secure-store.js'), 'utf8'), sandbox);
  return sandbox;
}

(async () => {
  // ۱) مسیر جایگزین عادی: IndexedDB در دسترس نیست ولی localStorage کار می‌کند؛
  //    مهر و موم و بازکردن باید درست کار کند.
  const normal = makeSandbox(() => false);
  check('available در محیط رمزنگاری‌دار درست است', normal.window.ATLAS_SECURE.available() === true);
  const sealed = await normal.window.ATLAS_SECURE.seal({ name: 'آزمون', n: 12 });
  check('seal شیء را مهر می‌کند', !!(sealed && sealed.ct && sealed.iv));
  const opened = await normal.window.ATLAS_SECURE.open(sealed);
  check('open مقدار اصلی را برمی‌گرداند', !!(opened && opened.name === 'آزمون' && opened.n === 12));

  // ۲) مسیر خطای گذرا: همهٔ راه‌های کلید یک بار می‌شکنند؛ بعد محیط بهتر می‌شود.
  let broken = true;
  const flaky = makeSandbox(() => broken);
  let rejectedOnce = false;
  try { await flaky.window.ATLAS_SECURE.seal({ a: 1 }); } catch (_) { rejectedOnce = true; }
  check('seal در نبودِ کلید درست رد می‌شود', rejectedOnce);
  broken = false;
  const sealedAgain = await flaky.window.ATLAS_SECURE.seal({ b: 2 });
  check('seal بعد از برطرف‌شدن خطای گذرا از نو تلاش می‌کند', !!(sealedAgain && sealedAgain.ct));
  const openedAgain = await flaky.window.ATLAS_SECURE.open(sealedAgain);
  check('open بعد از تلاش تازه درست است', !!(openedAgain && openedAgain.b === 2));

  failures.forEach(label => console.error('✗ ' + label));
  console.log(passed + '/' + (passed + failures.length) + ' بررسی موفق');
  process.exitCode = failures.length ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });

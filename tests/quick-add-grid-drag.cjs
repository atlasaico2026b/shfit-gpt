/* آزمون «درگ ثبت سریع داشورد» — گرید داشورد باید قابل درگ باشد و ترتیب ذخیره شود.
   اجرا: node tests/quick-add-grid-drag.cjs */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const checks = [];
function check(name, ok) { checks.push({ name, ok: Boolean(ok) }); }

const modules = read('modules.js');
const styles = read('design/styles.css');

// ۱ · renderQuickAdd گرید را به یک زیرگرید قابل درگ تبدیل می‌کند
check('renderQuickAdd گرید داخلی [data-quick-add-grid] می‌سازد',
  /<div class="quick-add-grid-inner" data-quick-add-grid>/.test(modules));

// ۲ · AtlasDragReorder روی گرید داشورد اتصال می‌یابد
check('renderQuickAdd درگ را به گرید داخلی وصل می‌کند',
  /window\.AtlasDragReorder\.attach\(inner,\s*\{\s*itemSelector:\s*'\.quick-add-btn'/.test(modules));
check('saveQuickAddOrderFromGrid صادر شده است',
  typeof modules.includes('saveQuickAddOrderFromGrid') === 'function' || /async function saveQuickAddOrderFromGrid\(list\)/.test(modules));

// ۳ · saveQuickAddOrderFromGrid از data-qa-id می‌خواند
check('saveQuickAddOrderFromGrid از data-qa-id ترتیب می‌خواند',
  /async function saveQuickAddOrderFromGrid\(list\)[\s\S]{0,250}\.quick-add-btn'/.test(modules) &&
  /btn\.dataset\.qaId/.test(modules));

// ۴ · استایل حالت درگ برای دکمه‌های ثبت سریع وجود دارد
check('استایل is-dragging برای quick-add-btn وجود دارد', /\.quick-add-btn\.is-dragging\{/.test(styles));
check('استایل is-shifting برای quick-add-btn وجود دارد', /\.quick-add-btn\.is-shifting\{/.test(styles));
check('استایل quick-add-grid-inner وجود دارد', /\.quick-add-grid-inner\{/.test(styles));

// ۵ · ترتیب گرید پس از تغییر به settings.quickAdd برگردد
check('saveQuickAddOrderFromGrid از saveQuickAddState استفاده می‌کند',
  /saveQuickAddOrderFromGrid\(list\)[\s\S]{0,400}await saveQuickAddState\(items\)/.test(modules));

// ۶ · تابع saveQuickAddOrder (تنظیمات) همچنان بدون تغییر کار می‌کند
check('saveQuickAddOrder همچنان از data-qa-row می‌خواند',
  /async function saveQuickAddOrder\(list\)[\s\S]{0,200}\[data-qa-row\]/.test(modules));

const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);
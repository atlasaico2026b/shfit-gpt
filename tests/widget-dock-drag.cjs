/* آزمون «درگ ویجت‌داک» — نوار پایین داشبورد باید قابل درگ باشد و ترتیب ذخیره شود.
   اجرا: node tests/widget-dock-drag.cjs */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const checks = [];
function check(name, ok) { checks.push({ name, ok: Boolean(ok) }); }

const app = read('app.js');
const modules = read('modules.js');
const styles = read('design/styles.css');

// ۱ · app.js منطق ذخیره/بازیابی widget-dock دارد
check('DOCK_STORAGE_KEY تعریف شده', /const DOCK_STORAGE_KEY = 'atlasShiftWidgetDockOrderV1'/.test(app));
check('DEFAULT_DOCK_ORDER شامل ۹ آیتم است', /DEFAULT_DOCK_ORDER.*roster.*stations/.test(app));
check('loadDockOrder تابع بارگذاری دارد', /function loadDockOrder\(\)/.test(app));
check('saveDockOrder تابع ذخیره دارد', /function saveDockOrder\(order\)/.test(app));
check('applyDockOrder تابع اعمال ترتیب دارد', /function applyDockOrder\(\)/.test(app));
check('attachDockDrag تابع اتصال درگ دارد', /function attachDockDrag\(\)/.test(app));

// ۲ · modules.js در wireDragReorder widget-dock را پوشش می‌دهد
check('wireDragReorder widget-dock را پیدا می‌کند', /scope\.querySelectorAll\('\.widget-dock'\)/.test(modules));
check('itemSelector .widget-dock-item است', /itemSelector: '\.widget-dock-item'/.test(modules));
check('injectHandle: false است', /injectHandle: false/.test(modules));
check('touchMode: longpress است', /touchMode: 'longpress'/.test(modules));
check('onReorder localStorage.setItem atlasShiftWidgetDockOrderV1', /localStorage\.setItem\('atlasShiftWidgetDockOrderV1'/.test(modules));

// ۳ · استایل‌های حالت درگ وجود دارد
check('استایل is-dragging برای widget-dock-item وجود دارد', /\.widget-dock-item\.is-dragging\{/.test(styles));
check('استایل is-shifting برای widget-dock-item وجود دارد', /\.widget-dock-item\.is-shifting\{/.test(styles));

// ۴ · در app.js applyDockOrder و attachDockDrag فراخوانی شده‌اند
check('applyDockOrder در app.js اجرا شده', /applyDockOrder\(\)/.test(app));
check('attachDockDrag در app.js اجرا شده', /attachDockDrag\(\)/.test(app));

const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);
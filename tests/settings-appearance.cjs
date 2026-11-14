/* آزمون تنظیمات «ظاهر و رنگ‌ها»: بخش رنگ‌ها و پالت نباید از صفحهٔ تنظیمات غیب شود.
   سه چیزی که این باگ را می‌ساختند بررسی می‌شوند:
     ۱. پنل تنظیمات با هر بار رندر دوبارهٔ بخش، از DOM حذف می‌شد و برنمی‌گشت؛
     ۲. قاعده‌ای بدون محدودهٔ تم، بخش رنگ‌ها را برای همهٔ پوسته‌ها پنهان می‌کرد؛
     ۳. چیدمان کارت پالت فقط داخل پوستهٔ cloud-glass بود و در بقیه جمع می‌شد.
   اجرا: node tests/settings-appearance.cjs */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const checks = [];
function check(name, ok) {
  checks.push({ name, ok: Boolean(ok) });
}

const modules = read('modules.js');
const themeTwo = read('theme-two.js');
const indexHtml = read('index.html');
const newUi = read('design/new-ui.css');
const settingsView = read('design/settings-view.css');
const sw = read('sw.js');

// ۱ · تب اختصاصی ظاهر و رنگ‌ها در صفحهٔ تنظیمات
check('تب «ظاهر و رنگ‌ها» در تنظیمات هست', /id: 'appearance'/.test(modules));
check('تب ظاهر میزبان پنل را رندر می‌کند', /data-settings-appearance-host/.test(modules));

// ۲ · پنل تنظیمات پس از رندر دوباره نابود نمی‌شود
check('مرجع پنل تنظیمات نگه داشته می‌شود', /settingsPanelRef/.test(themeTwo));
check('پنل بعد از هر رندر دوباره جای‌گذاری می‌شود', /MutationObserver\(schedulePlace\)/.test(themeTwo));
check('پنل داخل میزبان تب ظاهر می‌نشیند', /querySelector\('\[data-settings-appearance-host\]'\)/.test(themeTwo));

// ۳ · هیچ قاعده‌ای بخش رنگ‌ها را برای همهٔ پوسته‌ها پنهان نکند
const cssFiles = ['design/styles.css', 'design/new-ui.css', 'design/settings-view.css', 'design/option-manager.css']
  .concat(fs.readdirSync(path.join(root, 'design/skins')).filter((f) => f.endsWith('.css')).map((f) => 'design/skins/' + f));
const hiddenEverywhere = [];
const hiddenForThemes = [];
cssFiles.forEach((file) => {
  const css = read(file);
  const rules = css.match(/[^{}]*\{[^{}]*\}/g) || [];
  rules.forEach((rule) => {
    if (!/\.cloud-settings/.test(rule)) return;
    if (!/display\s*:\s*none/.test(rule)) return;
    const selector = rule.slice(0, rule.indexOf('{'));
    if (/data-atlas-theme\s*=/.test(selector)) hiddenForThemes.push(file);
    else hiddenEverywhere.push(file + ' → ' + selector.trim().replace(/\s+/g, ' '));
  });
});
check('هیچ قاعده‌ای بخش رنگ‌ها را بی‌قید‌و‌شرط پنهان نمی‌کند' + (hiddenEverywhere.length ? ' (' + hiddenEverywhere.join(' | ') + ')' : ''), hiddenEverywhere.length === 0);
check('پنهان‌شدن رنگ‌ها فقط به تم محدود است', hiddenForThemes.every((f) => f === 'design/skins/theme-two.css'));
check('یادداشت تم‌های بدون لایهٔ ابروبادی هست', /cloud-theme-note/.test(indexHtml) && /cloud-theme-note/.test(settingsView));
check('یادداشت رنگ‌ها فقط در تم دوم دیده می‌شود', /html\[data-atlas-theme="theme-two"\] \.cloud-theme-note \{ display: block/.test(settingsView));

// ۴ · چیدمان کارت پالت مشترک است، نه مخصوص یک پوسته
check('چیدمان کارت پالت در لایهٔ مشترک تعریف شده', /\.theme-option\s*\{[^}]*display:\s*grid/.test(newUi));
check('پیش‌نمایش پالت در لایهٔ مشترک اندازه دارد', /\.theme-preview\s*\{[^}]*height:\s*42px/.test(newUi));
const flatSkin = read('design/skins/flat.css');
check('پوستهٔ تم اول لایهٔ رنگ ابروبادی را نشان می‌دهد', /--cloud-1-rgb/.test(flatSkin));

// ۵ · کش سرویس‌ورکر برای دیدن فایل‌های تازه به‌روز شده
check('نسخهٔ کش سرویس‌ورکر به‌روز است', /atlas-shift-v175-real-roads-map/.test(sw));

const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

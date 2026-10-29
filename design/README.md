# لایهٔ طراحی ATLAS SHIFT

همهٔ طراحی برنامه در این پوشه است. هیچ رنگ، سایه یا شیشه‌ای در کدهای اجرایی
(`app.js` / `modules.js`) و هیچ رنگ ثابتی در فایل‌های دیگر وجود ندارد.

## ساختار

| فایل | کار |
|---|---|
| `tokens.css` | **تنها جایی که مقدار رنگ تعریف می‌شود** — پالت + نقش‌ها + آلفاها + هندسه |
| `styles.css` | چیدمان و کامپوننت‌های پایه (فقط `var(--…)`) |
| `skins/flat.css` | پوستهٔ فعال: نوار کنار، گرید، جزئیات چیدمان |
| `tones.css` | وصل کردن معنا به رنگ: `ok` / `warn` / `danger` / `info` / … |
| `table-fix.css` | اصلاحات جدول ماژول‌ها |
| `settings-tabs.css` | تب‌های تنظیمات |
| `phonebook.css` | دفترچه تلفن |
| `option-manager.css` | پنل مدیریت گزینه‌ها + میزبان تنظیمات داشبورد |
| `modals-export.css` | پنجرهٔ فرم روی زمین، اکشن تماس/پیام ردیف، منوی خروجی، سازندهٔ فیلد سفارشی |
| `print.css` | خروجی چاپ: سیاه روی سفید، مستقل از پوسته (`--print-ink` / `--print-paper`) |
| `theme-switch.js` | تنها فایل JS طراحی: انتخاب پوسته را روی `<html>` می‌گذارد |
| `skins/cloud-glass.css` | پوستهٔ روشن آماده (غیرفعال، در صورت نیاز لینک شود) |
| `skins/theme-two.css` · `skins/theme-two-colorful.css` | پوستهٔ دوم آماده (غیرفعال) |

## ترتیب بارگذاری (`index.html`)

```
1) design/tokens.css
2) design/styles.css
3) design/skins/flat.css
4) design/tones.css
5) design/table-fix.css
6) design/settings-tabs.css
7) design/phonebook.css
8) design/option-manager.css
9) design/modals-export.css
10) design/print.css
   … سپس design/theme-switch.js پیش از app.js
```

## چطور رنگ‌ها را عوض کنم؟

۱. رنگ‌های خالص را در بخش **1 · PALETTE** عوض کن:

```
--c-white  --c-blue    --c-green  --c-yellow  --c-red
--c-orange --c-purple  --c-pink   --c-cyan
```

هر رنگ دو مقدار دارد: خالص (`--c-blue`) و RGB (`--c-blue-rgb`) که برای
شفافیت استفاده می‌شود. هر دو را با هم عوض کن.

۲. اگر می‌خواهی نقش‌ها جابه‌جا شوند (مثلاً «هشدار» نارنجی شود)، فقط بخش
**3 · SEMANTIC ROLES** را تغییر بده.

۳. برای چیدمان، شیشه و سایه به `skins/flat.css` برو.

## قانون رنگ در کد اجرایی

در JS هرگز رنگ ننویس؛ فقط **معنا** بده و رنگ را به CSS بسپار:

```html
<span class="module-tag" data-tone="warn">در انتظار بررسی</span>
<div class="widget-icon" data-tone="special">…</div>
<div class="mini-stat" data-tone="ok">…</div>
```

- رنگ‌های خالص: `white, blue, green, yellow, red, orange, purple, pink, cyan`
- معناها: `ok, warn, danger, info, attention, special, highlight, accent, muted`

در `modules.js` تابع `statusTone()` فقط متن وضعیت را به یک معنا تبدیل می‌کند؛
اینکه آن معنا چه رنگی باشد کار `tones.css` است.

> اگر در فایل‌های **لایهٔ فعال** رنگی بیرون از `tokens.css` دیدی، باگ است.

لایهٔ فعال یعنی: `styles.css` · `skins/flat.css` · `tones.css` · `table-fix.css` ·
`settings-tabs.css` · `phonebook.css` · `option-manager.css` ·
`modals-export.css` · `print.css` · `theme-switch.js`.
هر ده فایل باید صفر
مقدار رنگ ثابت داشته باشند (نه hex، نه `rgb(...)`، نه نام رنگ).

## استثنا: پوسته‌های آماده (`skins/`)

هر پوستهٔ غیرفعال (`cloud-glass.css` · `theme-two.css` · `theme-two-colorful.css`)
**خودش یک پالت کامل است** و اجازه دارد رنگ‌هایش را در بلوک
`html[data-atlas-theme="…"]{…}` بالای همان فایل تعریف و در ادامهٔ همان فایل
مصرف کند. این پوسته‌ها وقتی فعال شوند، جای `skins/flat.css` را می‌گیرند؛ تا آن
روز به `tokens.css` وابسته نیستند و بیرون از خودشان رنگ پخش نمی‌کنند.

## بررسی خودکار

```bash
python3 .tmp/audit-colors.py design/styles.css design/tones.css \
  design/table-fix.css design/settings-tabs.css design/phonebook.css \
  design/option-manager.css design/modals-export.css design/print.css \
  design/skins/flat.css design/theme-switch.js
# انتظار: total 0
```


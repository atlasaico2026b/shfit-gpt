# ATLAS SHIFT (shfit-gpt)

Persian (RTL) offline-first PWA for HR operations: employees, 12-hour day/night shifts,
missions, leave, vehicles, gas detectors, notes/actions, reports, settings.

## Stack
- No framework, no bundler. Plain HTML + CSS + ES modules served statically.
- Preview build (from `shogo.preview.json`): copies `index.html app.js modules.js
  settings-tabs.js menu-manager.js visual-engine.js theme-two.js manifest.json sw.js
  icon.svg` plus `design/` into `dist/`.
- Data lives in IndexedDB with a localStorage fallback; no backend, everything works offline.

## Where things are
- `index.html` — single entry point: markup + all modal/panel shells.
- `design/tokens.css` — the only source of colour tokens. `design/styles.css` = shared styles.
- `app.js` — dashboard, calendar, notifications, settings, internal navigation.
- `modules.js` — operational modules (CRUD), local DB, reports, backup/restore/export.
- `menu-manager.js`, `settings-tabs.js`, `theme-two.js`, `visual-engine.js` — menu, settings tabs, theming.
- `design/record-file.js` + `design/record-file.css` — «مشاهدهٔ پرونده» for any record/contact: a single A4
  sheet of every stored field plus related records, with preview-before-export (print/PDF, Word, Excel, CSV).
  Opens via `document.dispatchEvent(new CustomEvent('atlas-open-file', {detail:{module, id}}))` or
  `AtlasRecordFile.openContact(contact)`. It only prints data that exists; never invent fields.
  «پرونده‌ها / سوابق انتخاب‌شده» (نوار انتخاب گروهی هر فهرست) با `atlas-open-files` (`{module, ids, mode}`)
  باز می‌شود؛ `mode` یکی از `files` (پیش‌فرض) یا `history` است. `openBulk` فهرست مرتب‌شدهٔ عنوان‌ها را در
  کادر باریک سمت راست و برگهٔ A4 مورد انتخابی را در کادر چپ می‌گذارد و نوار افقی پایین، خروجی همهٔ برگه‌ها
  را پشت سر هم می‌دهد (`runBulkExport` → `docxMany` / `csvMany` / `xlsMany` / `printSheets`). برگهٔ پرونده از
  `moduleSheet` و برگهٔ سوابق از `historySheet` می‌آید؛ هر دو یک مدل می‌دهند، پس یک مسیر خروجی دارند.
  در حالت گروهی `moduleSheet` با `{related:false}` صدا زده می‌شود تا برگهٔ هر ردیف فقط اطلاعات همان منو را
  داشته باشد و جدول‌های منوهای دیگر (مرخصی/مأموریت/شیفت/یادداشت) در آن نیاید؛ دکمهٔ تک‌ردیفی دست‌نخورده است.
  آزمون: `node tests/record-file-bulk.cjs` و `tests/record-file-bulk-ui.cjs`.
  پیش‌نمایش هر قالب با `buildPreviewOverlay(model, format)` ساخته می‌شود (بدون iframe، همان برگهٔ A4) و
  نام فایل خروجی با `exportFileName(model)` همیشه ASCII است؛ نام فارسی باعث می‌شد مرورگر فایل را با نام
  «download» ذخیره کند و خروجی Word به دست کاربر نرسد.
- `design/toolbars.css` — نوار ابزار فهرست‌ها (ردیف جست‌وجو + یک ردیف فشردهٔ فیلتر/مرتب‌سازی با قرص‌های
  `.list-chip`)، دکمهٔ «پشتیبان‌گیری این بخش» و رنگ‌بندی اعلان‌ها (گروه‌های `.notice-group` + نوار وضعیت
  `.notice-state-bar`: سبز = انجام شد، زرد = در حال انجام، آبی = برنامه‌ریزی‌شده، قرمز = نیازمند اقدام).
  مرتب‌سازی هر بخش در `LIST_SORTS` (`modules.js`) تعریف می‌شود و انتخاب کاربر در localStorage می‌ماند.
  پشتیبان‌گیری بخش‌به‌بخش: `SECTION_BACKUP` + `exportSectionBackup(view)`؛ فایل فقط همان بخش را دارد
  (`scope`) و بازیابی، به‌جای جایگزینی همه‌چیز، همان بخش را بر اساس شناسه ادغام می‌کند.
- `design/print-sheet.js` + `design/print.css` — «خروجی چاپ/PDF» of every list section (employees, leaves,
  missions, vehicles, gas meters, stations, logs, shifts, reports). One owner for the list sheet: `printRows()`
  in `modules.js` only calls `AtlasPrintSheet.render(host, rows, {title, stamp})`. Sheet = A4 **landscape**,
  title = the subject name (`مرخصی‌ها`, `مأموریت‌ها`, …) with the `· ATLAS SHIFT` suffix stripped, full grid
  borders, larger/bolder column headers, content-proportional column widths (`<colgroup>`), numeric cells
  kept on one line, and a font/padding step that shrinks as the column count grows (`data-density`).
  Tests: `node tests/print-sheet.cjs`.
- `design/export-docs.js` — **تنها مرجع ساخت فایل‌های Word (.docx) و CSV** (اکسل/PNG/چاپ صاحبان
  خودشان را دارند). هر خروجی سندی از این دو تابع می‌آید:
  `AtlasExportDocs.docx(sheet)`، `AtlasExportDocs.csv(rows, opts)`. خروجی PowerPoint حذف شده است.
  قاعده‌ها: برگهٔ **فهرست** همیشه A4 افقی و برگهٔ **پرونده** همیشه عمودی؛ جدول Word راست‌به‌چپ
  (`w:bidiVisual`) و راست‌چین با خط کامل بین خانه‌ها، پهنای ستون متناسب محتوا، سرستون تکرارشونده در
  هر صفحه و ردیف‌های بلند که به صفحهٔ بعد می‌روند (نه قیچی‌شده). CSV با BOM و
  نشانهٔ راست‌به‌چپ در هر خانه تا کلمات فارسی در Excel به‌هم نریزند.
  Tests: `node tests/export-docs.cjs`.
- `design/contact-sync.js` — links phonebook contacts to employees by personnel number, national ID or
  mobile (`isSameEmployee`). A new employee creates/updates its contact; deleting the employee never
  deletes the contact. Auto-created contacts carry `pending: true` and render with a yellow card until
  the user completes them. Runs off `atlas-record-saved`.
- `design/forms-validation.css` — required-field highlight (`.module-field.is-required` + `[data-required-error]`).
- `design/scroll-routing.js` + `design/scroll-routing.css` — **تنها مرجع رفتار اسکرول/چرخ موس/لمس.** قانون: هرچه زیر
  نشانگر اسکرول‌شونده باشد، خودش اسکرول می‌شود و هیچ‌چیز دیگری (پنجرهٔ زیرین، بدنه، صفحه) حرکت نمی‌کند؛ در لبه هم
  سرریز نمی‌کند. هیچ فایل دیگری `wheel`/`touchmove` سراسری ثبت نکند؛ اگر رفتار اسکرول کم/غلط بود فقط همین فایل را
  اصلاح کنید. ناحیهٔ اسکرول تازه را در `scroll-routing.css` هم اضافه کنید تا `overscroll-behavior` بگیرد.

## قرارداد فایل‌ها: یک خاصیت، یک فایل
هر «خاصیت رفتاری» یک صاحب دارد و در یک فایل متمرکز است. تغییر آن خاصیت یعنی ویرایش همان یک فایل، و نتیجه
خودکار در همهٔ بخش‌ها اعمال می‌شود. هرگز رفتار سراسری (listener روی `document`/`window`) را به یک فایل صفحه‌ای
اضافه نکنید.

| خاصیت | صاحب |
| --- | --- |
| اسکرول، چرخ موس، لمس، مهار سرریز | `design/scroll-routing.js` + `.css` |
| تاریخ شمسی (پاپ‌اور، ماه/سال، اعتبارسنجی دامنه) | `modules.js` بخش «تاریخ شمسی» |
| فهرست‌های بازشوی جستجوپذیر | `modules.js` → `buildCombo` / `enhanceSearchSelects` + `design/settings-view.css` |
| فیلد اجباری | `design/forms-validation.css` + `validateRequired` در `modules.js` |
| مشاهدهٔ پرونده و خروجی A4 | `design/record-file.js` + `.css` |
| خروجی چاپ/PDF فهرست‌ها (A4 افقی) | `design/print-sheet.js` + `design/print.css` |
| خروجی Word / CSV (همهٔ برنامه) | `design/export-docs.js` |
| نوار جست‌وجو/فیلتر/مرتب‌سازی و پشتیبان‌گیری بخش | `design/toolbars.css` + `renderListToolbar` / `exportSectionBackup` در `modules.js` |
| ظاهر کارت اعلان (کشوی اعلان) | `design/notices.css` (+ `openNoticeDialog` در `modules.js`) |
| فیلترهای فهرست هر بخش | `LIST_FILTERS` + `recordMatchesFilters` در `modules.js` |
| لایه‌بندی منوی «خروجی و چاپ» بالای پنل‌ها | `design/modals-export.css` |
| همگام‌سازی کارمند ↔ مخاطب | `design/contact-sync.js` |
| تم/رنگ‌ها | `design/theme-switch.js` + `design/skins/*.css` |
| اعتبارسنجی/نرمال‌سازی داده‌ها | `design/…` یا توابع مشترک `modules.js` (بدون تکرار) |

- `demo/atlas-shift-demo-10.json` + `demo/README.md` — test-only sample data as a restorable ATLAS SHIFT
  backup (10 items in every section). **Never** referenced by `index.html`, `sw.js`, `modules.js` or the preview
  build: the app stays clean and the data loads only when someone picks the file in
  تنظیمات → پشتیبان‌گیری و بازیابی. Validate with `node tests/demo-data.cjs`.
- `sw.js` + `manifest.json` — offline cache and installability.
- `ATLAS_SHIFT_REQUIREMENTS.md` — the authoritative requirements/spec. Read it before large features.
- `README.md` — current status in Persian; keep it updated when behaviour changes.

## Rules
- UI text is Persian and RTL. Never introduce LTR-only layouts or English labels in the app.
- Never hardcode colours or font sizes outside `design/tokens.css`.
- Keep the app fully offline: no runtime CDN, no external font/icon fetches, no server calls.
- To change an existing build artefact, edit the source file at the repo root — do not edit `dist/`.
- Low-use panels open as popover/sheet/modal and collapse again; avoid long vertical forms.
- Verify a change by loading the preview and checking the console is clean, not just by inspecting the diff.
- **Git: always merge after push.** «کامیت و پوش» یعنی کامیت → پوش → باز کردن PR و **بلافاصله مرج به `main`**
  (`gh pr merge <n> --merge --delete-branch`). کار تمام‌شده نباید روی شاخهٔ باز بماند؛ `main` تنها نسخهٔ
  معتبر است. بعد از مرج: `git checkout main && git pull --ff-only`، بازسازی `dist/` و آزمون دود.


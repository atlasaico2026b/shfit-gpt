// بررسی «راه‌های اصلی» روی نقشه‌ها و حالت فقط‌نمایشی داشبورد.
// ۱) شهرهای مارک‌شده با شبکهٔ راه (درخت پوشای کمینه) به هم وصل می‌شوند.
// ۲) رنگ خودِ راه سیاه است.
// ۳) داشبورد فقط شهرهای مارک‌شده را نشان می‌دهد و هیچ گره‌ای جابه‌جا نمی‌شود.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = read('modules.js');
const css = read('design/stations.css');
const exportSource = read('design/map-export.js');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// ── الگوریتم راه: از خودِ modules.js استخراج و اجرا می‌شود ──
const edgeMatch = modules.match(/function mapRoadEdges\(cities\) \{[\s\S]*?\n  \}/);
check('تابع mapRoadEdges در modules.js هست', !!edgeMatch);
let mapRoadEdges = null;
if (edgeMatch) {
  try {
    mapRoadEdges = new Function(edgeMatch[0] + '\nreturn mapRoadEdges;')();
  } catch (error) {
    check('تابع mapRoadEdges قابل اجراست', false, error.message);
  }
}
check('تابع mapRoadEdges قابل اجراست', typeof mapRoadEdges === 'function');

if (typeof mapRoadEdges === 'function') {
  const cities = [
    { name: 'a', x: 10, y: 10 },
    { name: 'b', x: 20, y: 12 },
    { name: 'c', x: 40, y: 30 },
    { name: 'd', x: 70, y: 60 },
    { name: 'e', x: 90, y: 80 }
  ];
  const edges = mapRoadEdges(cities);
  check('برای n شهر، n-1 راه ساخته می‌شود', edges.length === cities.length - 1, edges.length);
  // همهٔ شهرها باید در شبکه به هم وصل باشند (یک مؤلفهٔ همبند).
  const parent = cities.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const indexOf = (point) => cities.findIndex((c) => c.x === point.x && c.y === point.y);
  edges.forEach((edge) => {
    const a = find(indexOf(edge.from));
    const b = find(indexOf(edge.to));
    if (a !== b) parent[a] = b;
  });
  const roots = new Set(cities.map((_, i) => find(i)));
  check('همهٔ شهرها در یک شبکهٔ همبند قرار می‌گیرند', roots.size === 1, roots.size);
  check('شهر تکراری/نامعتبر راه نمی‌سازد', mapRoadEdges([{ x: 5, y: 5 }]).length === 0);
  check('مختصات نامعتبر نادیده گرفته می‌شود', mapRoadEdges([{ x: 5, y: 5 }, { x: NaN, y: 1 }]).length === 0);
}

// ── رسم راه‌ها در نقشهٔ پایه ──
check('تابع mapRoadMarkup در modules.js هست', /function mapRoadMarkup\(cities, width, height\)/.test(modules));
check('نقشهٔ پایه راه‌ها را پیش از نقطه‌ها می‌کشد',
  /const roads = mapRoadMarkup\(cities, width, height\)/.test(modules) &&
  /station-map-province[\s\S]{0,120}roads \+ dots/.test(modules));
check('راه‌ها از شهرهای مارک‌شده ساخته می‌شوند',
  /const cities = mapVisibleCities\(\)/.test(modules) && /mapRoadMarkup\(cities, width, height\)/.test(modules));
check('هر راه یک حاشیهٔ روشن و یک خط سیاه دارد',
  /station-map-road-casing/.test(modules) && /class="station-map-road"/.test(modules));

// ── رنگ سیاه ──
check('استایل راه با رنگ سیاه تعریف شده است', /\.station-map-road\{stroke:#000/.test(css));
check('حاشیهٔ راه برای دیده‌شدن روی زمینهٔ تیره هست', /\.station-map-road-casing\{stroke:rgba/.test(css));

// ── داشبورد: فقط شهرهای مارک‌شده ──
check('نقشهٔ پایه فقط شهرهای مارک‌شده را می‌کشد',
  /function stationMapBaseMarkup\(\)[\s\S]{0,400}mapVisibleCities\(\)/.test(modules));
check('ویجت داشبورد از همان نقشهٔ پایه استفاده می‌کند',
  /function stationMapInner\(records\)[\s\S]{0,600}stationMapBaseMarkup\(\)/.test(modules));

// ── داشبورد: فقط نمایش، بدون جابه‌جایی ──
check('داشبورد حالت فقط‌نمایشی دارد', /const readOnly = !!map\.closest\('\[data-widget="stations"\]'\)/.test(modules));
check('در داشبورد گره‌ها کشیده نمی‌شوند', /if \(!node \|\| readOnly\) return;/.test(modules));
check('در داشبورد جایگاه ذخیره نمی‌شود', /if \(readOnly\) \{[\s\S]{0,220}openStationInfo\(node\.dataset\.stationId, false\)[\s\S]{0,40}return;/.test(modules));
check('نشانگر فقط‌نمایشی روی نقشهٔ داشبورد ست می‌شود', /map\.dataset\.readonly = 'true'/.test(modules));
check('استایل فقط‌نمایشی داشبورد هست', /\.station-map\[data-readonly="true"\] \.station-node\{cursor:pointer\}/.test(css));

// ── خروجی دانلودی نقشه هم راه دارد ──
check('خروجی نقشه تابع roadEdges دارد', /function roadEdges\(cities\)/.test(exportSource));
check('رنگ راه در خروجی سیاه است', /road: '#000000'/.test(exportSource));
check('خروجی SVG راه‌ها را پیش از نقطه‌ها می‌کشد', /roads \+ '\\n' \+ dots/.test(exportSource));

// ── اجرای واقعی خروجی SVG ──
global.window = {};
require(path.join(root, 'design/provinces-map.js'));
global.window = { AtlasProvinces: global.window.AtlasProvinces };
global.document = { createElement: () => ({ style: {}, appendChild() {}, remove() {}, click() {}, setAttribute() {} }), body: { appendChild() {} } };
global.Blob = class {};
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
require(path.join(root, 'design/map-export.js'));
const api = global.window.AtlasProvinces;
const province = api.province('khuzestan');
const svg = global.window.AtlasMapExport.svg(province);
check('SVG خروجی خط سیاه راه دارد', /stroke="#000000"/.test(svg));
check('SVG خروجی به تعداد کافی خط راه دارد',
  (svg.match(/stroke="#000000"/g) || []).length >= province.cities.length - 1,
  (svg.match(/stroke="#000000"/g) || []).length + '/' + (province.cities.length - 1));
const json = JSON.parse(global.window.AtlasMapExport.json([province]));
check('JSON خروجی فهرست راه‌ها را دارد',
  Array.isArray(json.provinces[0].roads) && json.provinces[0].roads.length === province.cities.length - 1,
  json.provinces[0].roads && json.provinces[0].roads.length);

const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log((c.ok ? '✓' : '✗') + ' ' + c.name + (c.ok ? '' : '  → ' + c.extra)));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

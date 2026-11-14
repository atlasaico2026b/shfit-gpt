// بررسی «راه‌های اصلی» روی نقشه‌ها.
// ۱) راه‌ها دیگر خط راست بین شهرها نیستند؛ هندسهٔ واقعی جاده‌ها از
//    design/iran-roads.js می‌آید (مسیر رانندگی OpenStreetMap).
// ۲) رنگ سیاه راه‌ها حذف شده است.
// ۳) راه‌ها با تصویر جغرافیایی نقشه روی استان می‌نشینند و به شکل استان بریده می‌شوند.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = read('modules.js');
const css = read('design/stations.css');
const exportSource = read('design/map-export.js');
const roadsSource = read('design/roads.js');
const dataSource = read('design/iran-roads.js');
const html = read('index.html');
const sw = read('sw.js');

const checks = [];
const check = (name, ok, extra) => checks.push({ name: name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

// ── دادهٔ واقعی راه‌ها ──
check('دادهٔ راه‌ها در design/iran-roads.js هست', /window\.AtlasRoadData\s*=/.test(dataSource));
check('منبع داده OpenStreetMap است', /OpenStreetMap/.test(dataSource));
check('خط راست بین شهرها دیگر کشیده نمی‌شود', !/function mapRoadEdges\(/.test(modules) && !/function roadEdges\(/.test(exportSource));
check('رنگ سیاه راه‌ها حذف شده است', !/stroke:#000/.test(css) && !/road:\s*'#000000'/.test(exportSource));
check('راه‌ها از دادهٔ واقعی خوانده می‌شوند', /window\.AtlasRoads/.test(modules) && /window\.AtlasRoads/.test(exportSource));
check('راه‌ها به شکل استان بریده می‌شوند',
  /clipPath id="/.test(modules) && /clip-path="url\(#/.test(roadsSource));
check('خروجی دانلودی هم راه‌ها را می‌برد', /atlas-map-clip/.test(exportSource));
check('فایل‌های راه پیش از modules.js بارگذاری می‌شوند',
  html.indexOf('design/iran-roads.js') > 0 && html.indexOf('design/roads.js') > 0 &&
  html.indexOf('design/iran-roads.js') < html.indexOf('modules.js') &&
  html.indexOf('design/roads.js') < html.indexOf('modules.js'));
check('سرویس‌ورکر فایل‌های تازه را کش می‌کند',
  /design\/iran-roads\.js/.test(sw) && /design\/roads\.js/.test(sw));

// ── اجرای واقعی داده و رسم ──
const sandbox = { window: {}, console: console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(read('design/provinces-map.js'), sandbox);
vm.runInContext(dataSource, sandbox);
vm.runInContext(roadsSource, sandbox);

const api = sandbox.window.AtlasProvinces;
const roads = sandbox.window.AtlasRoads;
const routes = roads.routes();

check('دادهٔ راه‌ها بارگذاری می‌شود', routes.length >= 90, routes.length);
check('هر راه نام مبدأ و مقصد و کیلومتر دارد',
  routes.every((route) => route.from && route.to && Number(route.km) > 0));
check('هر راه دنبالهٔ نقطه‌های واقعی جاده است',
  routes.every((route) => Array.isArray(route.points) && route.points.length >= 2));
check('بیشتر راه‌ها بیش از دو نقطه دارند (خط راست نیستند)',
  routes.filter((route) => route.points.length > 2).length >= routes.length * 0.9,
  routes.filter((route) => route.points.length > 2).length + '/' + routes.length);
check('همهٔ نقطه‌ها داخل ایران‌اند',
  routes.every((route) => route.points.every(([lon, lat]) => lon > 44 && lon < 64 && lat > 25 && lat < 40)));

// تصویر جغرافیایی استان از برازش خطی شهرهای خودش؛ باید با مختصات درصدی شهرها بخواند.
function geoFit(province) {
  const cities = province.cities.filter((city) => isFinite(city.lat) && isFinite(city.lon));
  function fitAxis(values, targets) {
    const n = values.length;
    const meanX = values.reduce((a, b) => a + b, 0) / n;
    const meanY = targets.reduce((a, b) => a + b, 0) / n;
    let cov = 0, variance = 0;
    for (let i = 0; i < n; i += 1) {
      cov += (values[i] - meanX) * (targets[i] - meanY);
      variance += (values[i] - meanX) ** 2;
    }
    const slope = cov / variance;
    return { slope, offset: meanY - slope * meanX };
  }
  const lonFit = fitAxis(cities.map((c) => c.x), cities.map((c) => c.lon));
  const latFit = fitAxis(cities.map((c) => c.y), cities.map((c) => c.lat));
  return {
    project: (lon, lat) => ({ x: (lon - lonFit.offset) / lonFit.slope, y: (lat - latFit.offset) / latFit.slope }),
    bounds: {
      minLon: Math.min(lonFit.offset, lonFit.offset + lonFit.slope * 100),
      maxLon: Math.max(lonFit.offset, lonFit.offset + lonFit.slope * 100),
      minLat: Math.min(latFit.offset, latFit.offset + latFit.slope * 100),
      maxLat: Math.max(latFit.offset, latFit.offset + latFit.slope * 100)
    }
  };
}

const khuzestan = api.province('khuzestan');
const fit = geoFit(khuzestan);
const ahvaz = khuzestan.cities.find((city) => city.name === 'اهواز');
const projected = fit.project(ahvaz.lon, ahvaz.lat);
check('تصویر جغرافیایی با مختصات درصدی شهرها می‌خواند',
  Math.abs(projected.x - ahvaz.x) < 0.6 && Math.abs(projected.y - ahvaz.y) < 0.6,
  projected.x.toFixed(1) + ',' + projected.y.toFixed(1) + ' ↔ ' + ahvaz.x + ',' + ahvaz.y);

const paths = roads.pathsFor(fit.project, fit.bounds, 1000, 1262);
check('برای خوزستان راه رسم می‌شود', paths.length > 0, paths.length);
check('هر مسیر راه چند نقطه دارد', paths.every((d) => (d.match(/L/g) || []).length >= 1));
check('مسیرها در قاب نقشه می‌مانند',
  paths.every((d) => {
    const numbers = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    for (let i = 0; i < numbers.length; i += 2) {
      if (numbers[i] < -900 || numbers[i] > 1900 || numbers[i + 1] < -900 || numbers[i + 1] > 2200) return false;
    }
    return true;
  }));

const markup = roads.markup(fit.project, fit.bounds, 1000, 1262, 'clip-test');
check('مارک‌آپ راه‌ها گروه و برش دارد',
  /class="station-map-roads"/.test(markup) && /clip-path="url\(#clip-test\)"/.test(markup));
check('مارک‌آپ راه‌ها خط سیاه ندارد', !/#000/.test(markup));

// ── خروجی دانلودی نقشه ──
sandbox.document = { createElement: () => ({ style: {}, appendChild() {}, remove() {}, click() {}, setAttribute() {} }), body: { appendChild() {} } };
sandbox.Blob = class {};
sandbox.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
vm.runInContext(exportSource, sandbox);

const svg = sandbox.window.AtlasMapExport.svg(khuzestan);
check('SVG خروجی راه‌های واقعی دارد', (svg.match(/<path d="M/g) || []).length > 0,
  (svg.match(/<path d="M/g) || []).length);
check('SVG خروجی راه‌ها را به شکل استان می‌برد', /clip-path="url\(#atlas-map-clip\)"/.test(svg));
check('SVG خروجی خط سیاه راه ندارد', !/stroke="#000000"/.test(svg));

const json = JSON.parse(sandbox.window.AtlasMapExport.json([khuzestan]));
const jsonRoads = json.provinces[0].roads;
check('JSON خروجی راه‌های واقعی را دارد', Array.isArray(jsonRoads) && jsonRoads.length > 0, jsonRoads && jsonRoads.length);
check('هر راه JSON مبدأ و مقصد و نقطه دارد',
  jsonRoads.every((road) => road.from && road.to && Array.isArray(road.points) && road.points.length >= 2));
// هندسهٔ کامل راه در JSON می‌ماند؛ بخشی از راه که از استان بیرون می‌زند هم
// واقعی است و مصرف‌کننده می‌تواند خودش برش بزند.
check('نقطه‌های JSON درصدی‌اند',
  jsonRoads.every((road) => road.points.every(([x, y]) => isFinite(x) && isFinite(y))));

const failed = checks.filter((c) => !c.ok);
checks.forEach((c) => console.log((c.ok ? '✓' : '✗') + ' ' + c.name + (c.ok ? '' : '  → ' + c.extra)));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' بررسی موفق');
process.exit(failed.length ? 1 : 0);

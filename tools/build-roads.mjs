/* ATLAS SHIFT · ساخت دادهٔ «راه‌های اصلی» بین شهرهای اصلی ایران
   ----------------------------------------------------------------------------
   این ابزار یک بار (در زمان ساخت) اجرا می‌شود و فایل design/iran-roads.js را
   می‌سازد. هندسهٔ راه‌ها از مسیریابی واقعی OpenStreetMap (سرور OSRM) گرفته
   می‌شود؛ هیچ خط راستی بین دو شهر کشیده نمی‌شود.

   شبکه از دو بخش ساخته می‌شود:
     ۱) درون هر استان: درخت پوشای کمینه روی مرکز استان و مراکز شهرستان‌ها
        (فاصلهٔ رانندگی واقعی، نه فاصلهٔ خط راست).
     ۲) بین استان‌ها: درخت پوشای کمینه روی مراکز ۳۱ استان.

   اجرا: node tools/build-roads.mjs
   دادهٔ تولیدشده در زمان اجرای برنامه هیچ درخواست شبکه‌ای ندارد. */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OSRM = process.env.OSRM_URL || 'https://router.project-osrm.org';
const TOLERANCE = 0.0018; // درجه؛ حدود ۲۰۰ متر
const OUT = path.join(ROOT, 'design/iran-roads.js');

function loadProvinces() {
  const source = fs.readFileSync(path.join(ROOT, 'design/provinces-map.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.AtlasProvinces.provinces;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url, attempt = 0) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'AtlasShiftRoadBuilder/1.0' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (error) {
    if (attempt >= 4) throw error;
    await sleep(800 * (attempt + 1));
    return getJson(url, attempt + 1);
  }
}

function coords(city) {
  return city.lon.toFixed(5) + ',' + city.lat.toFixed(5);
}

async function distanceTable(cities) {
  const url = OSRM + '/table/v1/driving/' + cities.map(coords).join(';') + '?annotations=distance';
  const data = await getJson(url);
  if (data.code !== 'Ok' || !data.distances) throw new Error('table failed: ' + data.code);
  return data.distances;
}

// درخت پوشای کمینه با Prim؛ خروجی یال‌های [i, j].
function minimumSpanningTree(distances) {
  const count = distances.length;
  const used = new Array(count).fill(false);
  const best = new Array(count).fill(Infinity);
  const parent = new Array(count).fill(-1);
  best[0] = 0;
  const edges = [];
  for (let step = 0; step < count; step += 1) {
    let pick = -1;
    for (let i = 0; i < count; i += 1) {
      if (!used[i] && (pick < 0 || best[i] < best[pick])) pick = i;
    }
    if (pick < 0 || !Number.isFinite(best[pick])) break;
    used[pick] = true;
    if (parent[pick] >= 0) edges.push([Math.min(parent[pick], pick), Math.max(parent[pick], pick)]);
    for (let j = 0; j < count; j += 1) {
      const d = distances[pick][j];
      if (!used[j] && Number.isFinite(d) && d < best[j]) { best[j] = d; parent[j] = pick; }
    }
  }
  return edges;
}

// ساده‌سازی Douglas–Peucker روی [lon, lat].
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let index = -1;
    let maxDistance = 0;
    const [x1, y1] = points[first];
    const [x2, y2] = points[last];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    for (let i = first + 1; i < last; i += 1) {
      const [x, y] = points[i];
      let distance;
      if (lengthSquared === 0) {
        distance = Math.hypot(x - x1, y - y1);
      } else {
        const t = Math.min(1, Math.max(0, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
        distance = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
      }
      if (distance > maxDistance) { maxDistance = distance; index = i; }
    }
    if (index > 0 && maxDistance > tolerance) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

async function routeGeometry(from, to) {
  const url = OSRM + '/route/v1/driving/' + coords(from) + ';' + coords(to) +
    '?overview=simplified&geometries=geojson&alternatives=false&steps=false';
  const data = await getJson(url);
  if (data.code !== 'Ok' || !data.routes || !data.routes.length) return null;
  const route = data.routes[0];
  return {
    distance: Math.round(route.distance / 1000),
    points: simplify(route.geometry.coordinates.map(([lon, lat]) => [lon, lat]), TOLERANCE)
  };
}

async function main() {
  const provinces = loadProvinces();
  const edgeKeys = new Set();
  const pairs = [];

  function addPair(a, b, scope) {
    const key = [a.name, b.name].sort().join('::');
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    pairs.push({ from: a, to: b, scope });
  }

  for (const province of provinces) {
    const major = (province.cities || []).filter((city) => city.tier <= 2 && Number.isFinite(city.lat) && Number.isFinite(city.lon));
    if (major.length < 2) continue;
    const table = await distanceTable(major);
    minimumSpanningTree(table).forEach(([i, j]) => addPair(major[i], major[j], 'province:' + province.id));
    console.error('table ' + province.id + ' (' + major.length + ')');
    await sleep(200);
  }

  const capitals = provinces
    .map((province) => (province.cities || []).find((city) => city.tier === 1) || null)
    .filter((city) => city && Number.isFinite(city.lat) && Number.isFinite(city.lon));
  const national = await distanceTable(capitals);
  minimumSpanningTree(national).forEach(([i, j]) => addPair(capitals[i], capitals[j], 'national'));

  console.error('edges: ' + pairs.length);

  const routes = [];
  for (const pair of pairs) {
    const geometry = await routeGeometry(pair.from, pair.to);
    if (!geometry || geometry.points.length < 2) {
      console.error('skip ' + pair.from.name + ' → ' + pair.to.name);
      continue;
    }
    routes.push({
      from: pair.from.name,
      to: pair.to.name,
      km: geometry.distance,
      points: geometry.points.map(([lon, lat]) => [Number(lon.toFixed(4)), Number(lat.toFixed(4))])
    });
    console.error('route ' + pair.from.name + ' → ' + pair.to.name + ' (' + geometry.points.length + ' pts)');
    await sleep(120);
  }

  const body = routes.map((route) => '    ' + JSON.stringify(route)).join(',\n');
  const source =
    '/* ATLAS SHIFT · راه‌های اصلی ایران بین شهرهای اصلی\n' +
    '   ----------------------------------------------------------------------------\n' +
    '   هندسهٔ راه‌ها از مسیریابی واقعی OpenStreetMap (OSRM) گرفته شده است: مسیر\n' +
    '   رانندگی بین مرکز هر استان و مراکز شهرستان‌ها و بین مراکز استان‌ها. هیچ خط\n' +
    '   راستی بین دو شهر کشیده نشده؛ هر راه دنبالهٔ نقطه‌های واقعی جاده است.\n\n' +
    '   مختصات‌ها [طول, عرض] جغرافیایی‌اند و در زمان اجرا با همان تصویر خطی نقشه\n' +
    '   به درصد تبدیل می‌شوند. همه‌چیز از پیش محاسبه شده؛ برنامه آفلاین کار می‌کند.\n\n' +
    '   بازسازی: node tools/build-roads.mjs */\n' +
    '(function () {\n' +
    "  'use strict';\n" +
    '  window.AtlasRoadData = {\n' +
    "    source: 'OpenStreetMap via OSRM',\n" +
    '    routes: [\n' + body + '\n    ]\n' +
    '  };\n' +
    '})();\n';
  fs.writeFileSync(OUT, source);
  console.error('wrote ' + OUT + ' · ' + routes.length + ' routes · ' + (source.length / 1024).toFixed(0) + ' KB');
}

main().catch((error) => { console.error(error); process.exit(1); });

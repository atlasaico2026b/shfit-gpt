/* ATLAS SHIFT · ساخت دادهٔ «راه‌های اصلی» بین شهرهای ایران
   ----------------------------------------------------------------------------
   این ابزار یک بار (در زمان ساخت) اجرا می‌شود و فایل design/iran-roads.js را
   می‌سازد. هندسهٔ هر راه از مسیریابی واقعی OpenStreetMap (سرور OSRM) گرفته
   می‌شود؛ هیچ خط راستی بین دو شهر کشیده نمی‌شود.

   شبکه دیگر «درخت» نیست: برای هر استان ماتریس فاصلهٔ رانندگی واقعی بین همهٔ
   شهرهایش از OSRM گرفته می‌شود و گراف گابریل (Gabriel graph) روی همان
   فاصله‌ها ساخته می‌شود. نتیجه همان شبکه‌ای است که جاده‌ها واقعاً می‌سازند:
   هر شهر به شهرهای همسایهٔ واقعی‌اش وصل است، بدون یال‌های تکراری و بدون
   جاده‌های الکی. یال‌هایی که فاصلهٔ رانندگی‌شان از خط راست خیلی بیشتر است
   (یعنی جادهٔ مستقیم بین آن دو نیست) حذف می‌شوند.

   اجرا: node tools/build-roads.mjs
   اجرا برای یک استان: PROVINCES=khuzestan node tools/build-roads.mjs out.js
   دادهٔ تولیدشده در زمان اجرای برنامه هیچ درخواست شبکه‌ای ندارد. */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OSRM = process.env.OSRM_URL || 'https://router.project-osrm.org';
const TOLERANCE = Number(process.env.ROAD_TOLERANCE || 0.0022); // درجه؛ حدود ۲۴۰ متر
const DETOUR_LIMIT = 2.2; // نسبت فاصلهٔ رانندگی به خط راست؛ بیشتر از این یعنی جادهٔ مستقیم نیست
const CHUNK = 45; // سقف مختصات هر درخواست table
const CONCURRENCY = Number(process.env.ROAD_CONCURRENCY || 4);
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'design/iran-roads.js'));

function loadProvinces() {
  const source = fs.readFileSync(path.join(ROOT, 'design/provinces-map.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.AtlasProvinces.provinces;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url, attempt = 0) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'AtlasShiftRoadBuilder/2.0' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (error) {
    if (attempt >= 5) throw error;
    await sleep(1200 * (attempt + 1));
    return getJson(url, attempt + 1);
  }
}

const coord = (city) => city.lon.toFixed(5) + ',' + city.lat.toFixed(5);

function haversine(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

// ماتریس فاصلهٔ رانندگی واقعی بین همهٔ شهرهای یک فهرست. OSRM سقف ۱۰۰ مختصات
// دارد، پس فهرست به بلوک‌هایی شکسته می‌شود و هر جفت بلوک جدا پرسیده می‌شود.
async function distanceMatrix(cities) {
  const n = cities.length;
  const matrix = Array.from({ length: n }, () => new Array(n).fill(Infinity));
  const blocks = [];
  for (let i = 0; i < n; i += CHUNK) blocks.push([i, Math.min(n, i + CHUNK)]);

  for (let a = 0; a < blocks.length; a += 1) {
    for (let b = a; b < blocks.length; b += 1) {
      const [aStart, aEnd] = blocks[a];
      const [bStart, bEnd] = blocks[b];
      const same = a === b;
      const coords = [];
      for (let i = aStart; i < aEnd; i += 1) coords.push(cities[i]);
      if (!same) for (let j = bStart; j < bEnd; j += 1) coords.push(cities[j]);
      const url = OSRM + '/table/v1/driving/' + coords.map(coord).join(';') + '?annotations=distance';
      const data = await getJson(url);
      if (data.code !== 'Ok' || !data.distances) throw new Error('table failed: ' + data.code);
      const aCount = aEnd - aStart;
      for (let i = 0; i < aCount; i += 1) {
        for (let j = 0; j < aCount; j += 1) {
          const value = data.distances[i][j];
          if (same) matrix[aStart + i][aStart + j] = value;
          else matrix[aStart + i][bStart + j] = data.distances[i][aCount + j];
        }
      }
      if (!same) {
        for (let i = 0; i < aCount; i += 1) {
          for (let j = 0; j < bEnd - bStart; j += 1) {
            matrix[bStart + j][aStart + i] = data.distances[aCount + j][i];
          }
        }
      }
      await sleep(120);
    }
  }
  return matrix;
}

// گراف گابریل در فضای «فاصلهٔ رانندگی»: یال i–j می‌ماند اگر هیچ شهر دیگری در
// دایره‌ای که یال قطرش است نیفتد. این کار یال‌های تکراری (A–C وقتی A–B–C
// روی یک جاده است) را حذف می‌کند و شبکهٔ خیابان‌مانند می‌سازد.
function gabrielEdges(cities, matrix, limit) {
  const n = cities.length;
  const edges = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const d = matrix[i][j];
      if (!Number.isFinite(d) || d <= 0) continue;
      if (d > limit(i, j)) continue;
      let blocked = false;
      for (let k = 0; k < n && !blocked; k += 1) {
        if (k === i || k === j) continue;
        const di = matrix[i][k];
        const dj = matrix[j][k];
        if (!Number.isFinite(di) || !Number.isFinite(dj)) continue;
        if (di * di + dj * dj < d * d) blocked = true;
      }
      if (!blocked) edges.push([i, j]);
    }
  }
  return edges;
}

// یال‌های درخت پوشای کمینه همیشه بخشی از گراف گابریل‌اند؛ این تابع فقط برای
// اطمینان است: اگر به هر دلیلی شهری جدا افتاد، با نزدیک‌ترین همسایه‌اش وصل شود.
function connectComponents(cities, matrix, edges) {
  const n = cities.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  edges.forEach(([a, b]) => union(a, b));
  const candidates = edges.slice();
  const extra = [];
  for (let i = 0; i < n; i += 1) {
    if (find(i) === find(0)) continue;
    let best = -1;
    let bestDistance = Infinity;
    for (let j = 0; j < n; j += 1) {
      if (j === i || find(i) === find(j)) continue;
      const d = matrix[i][j];
      if (Number.isFinite(d) && d > 0 && d < bestDistance) { bestDistance = d; best = j; }
    }
    if (best >= 0) { extra.push([Math.min(i, best), Math.max(i, best)]); union(i, best); }
  }
  candidates.push(...extra);
  return candidates;
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
  const url = OSRM + '/route/v1/driving/' + coord(from) + ';' + coord(to) +
    '?overview=simplified&geometries=geojson&alternatives=false&steps=false';
  const data = await getJson(url);
  if (data.code !== 'Ok' || !data.routes || !data.routes.length) return null;
  const route = data.routes[0];
  const points = simplify(route.geometry.coordinates.map(([lon, lat]) => [lon, lat]), TOLERANCE);
  return { distance: Math.round(route.distance / 1000), points };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const allProvinces = loadProvinces();
  const only = (process.env.PROVINCES || '').split(',').map((id) => id.trim()).filter(Boolean);
  const provinces = only.length ? allProvinces.filter((p) => only.indexOf(p.id) >= 0) : allProvinces;

  const pairs = [];
  const seen = new Set();
  function addPair(a, b) {
    if (!a || !b) return;
    const key = [a.name, b.name].sort().join('::');
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push([a, b]);
  }

  // ۱) شبکهٔ درون‌استانی: گراف گابریل روی فاصلهٔ رانندگی واقعی.
  //     دو لایه دارد: لایهٔ «راه‌های اصلی» بین شهرهای اصلی و مراکز شهرستان‌ها،
  //     و لایهٔ کامل بین همهٔ شهرها. لایهٔ اصلی همان راهی است که در نقشه
  //     ضخیم‌تر دیده می‌شود، چون در گراف کامل، راه بین دو شهر بزرگ به قطعه‌های
  //     کوتاه بین شهرهای کوچک شکسته می‌شود.
  for (const province of provinces) {
    const cities = (province.cities || []).filter((city) => Number.isFinite(city.lat) && Number.isFinite(city.lon));
    if (cities.length < 2) continue;
    const matrix = await distanceMatrix(cities);
    const majorIndexes = [];
    cities.forEach((city, index) => { if (Number(city.tier) <= 2) majorIndexes.push(index); });
    if (majorIndexes.length >= 2) {
      const majorCities = majorIndexes.map((index) => cities[index]);
      const majorMatrix = majorIndexes.map((i) => majorIndexes.map((j) => matrix[i][j]));
      const majorEdges = gabrielEdges(majorCities, majorMatrix, (i, j) => DETOUR_LIMIT * haversine(majorCities[i], majorCities[j]));
      const majorLinked = connectComponents(majorCities, majorMatrix, majorEdges);
      majorLinked.forEach(([i, j]) => addPair(majorCities[i], majorCities[j]));
    }
    const edges = gabrielEdges(cities, matrix, (i, j) => DETOUR_LIMIT * haversine(cities[i], cities[j]));
    const linked = connectComponents(cities, matrix, edges);
    linked.forEach(([i, j]) => addPair(cities[i], cities[j]));
    console.error('province ' + province.id + ': ' + cities.length + ' cities, ' + majorIndexes.length + ' main, ' + linked.length + ' links');
  }

  // ۲) شبکهٔ بین‌استانی: همان روش روی مراکز استان‌ها.
  if (!only.length) {
    const capitals = allProvinces
      .map((province) => (province.cities || []).find((city) => city.tier === 1) || null)
      .filter((city) => city && Number.isFinite(city.lat) && Number.isFinite(city.lon));
    const matrix = await distanceMatrix(capitals);
    const edges = gabrielEdges(capitals, matrix, (i, j) => DETOUR_LIMIT * haversine(capitals[i], capitals[j]));
    const linked = connectComponents(capitals, matrix, edges);
    linked.forEach(([i, j]) => addPair(capitals[i], capitals[j]));
    console.error('national: ' + linked.length + ' links between ' + capitals.length + ' capitals');
  }

  console.error('edges: ' + pairs.length);

  const routes = [];
  let done = 0;
  await mapLimit(pairs, CONCURRENCY, async ([from, to]) => {
    const geometry = await routeGeometry(from, to);
    done += 1;
    if (done % 100 === 0) console.error('  ' + done + '/' + pairs.length);
    if (!geometry || geometry.points.length < 2) return null;
    const flat = [];
    geometry.points.forEach(([lon, lat]) => {
      flat.push(Number(lon.toFixed(3)), Number(lat.toFixed(3)));
    });
    routes.push({ from: from.name, to: to.name, km: geometry.distance, points: flat });
    return null;
  });

  routes.sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to, 'fa'));
  const body = routes.map((route) => '    ' + JSON.stringify(route)).join(',\n');
  const source =
    '/* ATLAS SHIFT · راه‌های اصلی ایران بین شهرها\n' +
    '   ----------------------------------------------------------------------------\n' +
    '   هندسهٔ هر راه از مسیریابی واقعی OpenStreetMap (OSRM) گرفته شده است. شبکه\n' +
    '   گراف گابریل روی فاصله‌های رانندگی واقعی است، پس هر شهر به همسایه‌های\n' +
    '   واقعی‌اش وصل می‌شود و جادهٔ تکراری یا خط راست در آن نیست.\n\n' +
    '   points یک آرایهٔ تخت است: [طول, عرض, طول, عرض, ...] با سه رقم اعشار.\n' +
    '   مراکز استان‌ها آخر فهرست‌اند (بخش «بین‌استانی»). برنامه آفلاین کار می‌کند.\n\n' +
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

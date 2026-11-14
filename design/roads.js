/* ATLAS SHIFT · رسم راه‌های اصلی روی نقشه
   ----------------------------------------------------------------------------
   دادهٔ راه‌ها در design/iran-roads.js است: مسیر واقعی رانندگی بین شهرهای اصلی
   ایران (از OpenStreetMap). این فایل آن داده را به مسیر SVG تبدیل می‌کند.

   تصویر جغرافیایی (طول/عرض ← درصد روی قاب نقشه) از بیرون داده می‌شود، چون هر
   نقشه تصویر خودش را دارد: نقشهٔ یک استان از برازش خطی شهرهای همان استان و
   نقشهٔ چنداستانی از بوم مشترک جغرافیایی استفاده می‌کند.

   راه‌ها به شکل استان بریده می‌شوند (clipPath در modules.js و map-export.js)،
   پس هیچ خطی بیرون از مرز استان دیده نمی‌شود. */

(function () {
  'use strict';

  var PAD = 0.25; // درجه؛ حاشیهٔ جست‌وجوی راه‌های نزدیک مرز
  var BOUNDS_CACHE = [];

  function routes() {
    var data = window.AtlasRoadData;
    return data && Array.isArray(data.routes) ? data.routes : [];
  }

  function routeBounds(route, index) {
    if (BOUNDS_CACHE[index]) return BOUNDS_CACHE[index];
    var points = route && Array.isArray(route.points) ? route.points : [];
    var box = null;
    for (var i = 0; i < points.length; i += 1) {
      var lon = Number(points[i][0]);
      var lat = Number(points[i][1]);
      if (!isFinite(lon) || !isFinite(lat)) continue;
      if (!box) box = { minLon: lon, maxLon: lon, minLat: lat, maxLat: lat };
      else {
        if (lon < box.minLon) box.minLon = lon;
        if (lon > box.maxLon) box.maxLon = lon;
        if (lat < box.minLat) box.minLat = lat;
        if (lat > box.maxLat) box.maxLat = lat;
      }
    }
    BOUNDS_CACHE[index] = box;
    return box;
  }

  function overlaps(box, bounds) {
    if (!box || !bounds) return false;
    return box.maxLon >= bounds.minLon - PAD && box.minLon <= bounds.maxLon + PAD &&
      box.maxLat >= bounds.minLat - PAD && box.minLat <= bounds.maxLat + PAD;
  }

  // مسیر SVG هر راه در واحد viewBox نقشه. نقطه‌های تکراری حذف می‌شوند تا
  // مسیر کوتاه‌تر و سبک‌تر بماند.
  function pathFor(route, project, width, height) {
    var points = route && Array.isArray(route.points) ? route.points : [];
    var d = '';
    var lastX = null;
    var lastY = null;
    for (var i = 0; i < points.length; i += 1) {
      var lon = Number(points[i][0]);
      var lat = Number(points[i][1]);
      if (!isFinite(lon) || !isFinite(lat)) continue;
      var percent = project(lon, lat);
      if (!percent || !isFinite(percent.x) || !isFinite(percent.y)) continue;
      var x = Number((percent.x * width / 100).toFixed(1));
      var y = Number((percent.y * height / 100).toFixed(1));
      if (x === lastX && y === lastY) continue;
      d += (d ? 'L' : 'M') + x + ' ' + y;
      lastX = x;
      lastY = y;
    }
    return d.length > 4 ? d : '';
  }

  function pathsFor(project, bounds, width, height) {
    if (typeof project !== 'function' || !bounds) return [];
    var list = routes();
    var out = [];
    for (var i = 0; i < list.length; i += 1) {
      if (!overlaps(routeBounds(list[i], i), bounds)) continue;
      var d = pathFor(list[i], project, width, height);
      if (d) out.push(d);
    }
    return out;
  }

  // گروه SVG راه‌ها: یک حاشیهٔ نرم زیر و خط راه روی آن. بریدن به شکل استان با
  // clipPath انجام می‌شود؛ شناسهٔ آن را فراخوان می‌دهد.
  function markup(project, bounds, width, height, clipId) {
    var paths = pathsFor(project, bounds, width, height);
    if (!paths.length) return '';
    var casing = '';
    var roads = '';
    for (var i = 0; i < paths.length; i += 1) {
      casing += '<path class="station-map-road-casing" d="' + paths[i] + '"></path>';
      roads += '<path class="station-map-road" d="' + paths[i] + '"></path>';
    }
    return '<g class="station-map-roads"' + (clipId ? ' clip-path="url(#' + clipId + ')"' : '') +
      ' aria-hidden="true">' + casing + roads + '</g>';
  }

  window.AtlasRoads = {
    routes: routes,
    pathsFor: pathsFor,
    markup: markup
  };
})();

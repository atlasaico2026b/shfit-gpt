/* ATLAS SHIFT · رسم راه‌های اصلی روی نقشه
   ----------------------------------------------------------------------------
   دادهٔ راه‌ها در design/iran-roads.js است: مسیر واقعی رانندگی بین شهرهای
   ایران (از OpenStreetMap). این فایل آن داده را به مسیر SVG تبدیل می‌کند.

   تصویر جغرافیایی (طول/عرض ← درصد روی قاب نقشه) از بیرون داده می‌شود، چون هر
   نقشه تصویر خودش را دارد: نقشهٔ یک استان از برازش خطی شهرهای همان استان و
   نقشهٔ چنداستانی از بوم مشترک جغرافیایی استفاده می‌کند.

   دو قاعدهٔ نمایش:
     ۱) هر راه فقط وقتی دیده می‌شود که نام هر دو سرش روی نقشه نشان داده شود؛
        ردهٔ نمایش هر راه بیشترین ردهٔ دو سرش است و با بزرگ‌نمایی (data-zoom)
        همان‌طور آشکار می‌شود که نام شهرها آشکار می‌شوند. شهری که کاربر در
        تنظیمات پنهان کرده، راهش هم رسم نمی‌شود.
     ۲) راه شهرهای اصلی ضخیم‌تر است؛ ضخامت از کمترین ردهٔ دو سر راه می‌آید
        (data-rank) و در stations.css تعیین می‌شود.

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

  // نقطه‌ها در داده به شکل تخت ذخیره شده‌اند: [طول, عرض, طول, عرض, ...].
  function pointsOf(route) {
    var flat = route && Array.isArray(route.points) ? route.points : [];
    var out = [];
    for (var i = 0; i + 1 < flat.length; i += 2) {
      out.push([Number(flat[i]), Number(flat[i + 1])]);
    }
    return out;
  }

  function routeBounds(route, index) {
    if (BOUNDS_CACHE[index]) return BOUNDS_CACHE[index];
    var points = pointsOf(route);
    var box = null;
    for (var i = 0; i < points.length; i += 1) {
      var lon = points[i][0];
      var lat = points[i][1];
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
  function pathFor(points, project, width, height) {
    var d = '';
    var lastX = null;
    var lastY = null;
    for (var i = 0; i < points.length; i += 1) {
      var lon = points[i][0];
      var lat = points[i][1];
      if (!isFinite(lon) || !isFinite(lat)) continue;
      var percent = project(lon, lat);
      if (!percent || !isFinite(percent.x) || !isFinite(percent.y)) continue;
      var x = Number((percent.x * width / 100).toFixed(2));
      var y = Number((percent.y * height / 100).toFixed(2));
      if (x === lastX && y === lastY) continue;
      d += (d ? 'L' : 'M') + x + ' ' + y;
      lastX = x;
      lastY = y;
    }
    return d.length > 4 ? d : '';
  }

  function tierNumber(value) {
    var tier = Number(value);
    return tier >= 1 && tier <= 4 ? Math.round(tier) : 0;
  }

  // ردهٔ نمایش یک سر راه. شهری که روی این نقشه نیست (مثلاً آن سوی مرز) ردهٔ سر
  // دیگر را می‌گیرد تا راه ترانزیتی هم‌ردهٔ شهری که دیده می‌شود آشکار شود.
  function endpointTier(options, name, fallback) {
    var tierOf = options && typeof options.tierOf === 'function' ? options.tierOf : null;
    var tier = tierOf ? tierNumber(tierOf(name)) : 0;
    if (tier) return tier;
    return fallback || 0;
  }

  function hiddenEndpoint(options, name) {
    var visible = options && typeof options.visible === 'function' ? options.visible : null;
    return !!(visible && visible(name) === false);
  }

  // راه‌های آمادهٔ رسم: هندسه + ردهٔ آشکارشدن (tier) + ردهٔ ضخامت (rank).
  function entriesFor(project, bounds, width, height, options) {
    if (typeof project !== 'function' || !bounds) return [];
    var opts = options || {};
    var maxTier = tierNumber(opts.zoom) || 4;
    var list = routes();
    var out = [];
    for (var i = 0; i < list.length; i += 1) {
      var route = list[i];
      if (!overlaps(routeBounds(route, i), bounds)) continue;
      var from = String(route.from || '');
      var to = String(route.to || '');
      if (hiddenEndpoint(opts, from) || hiddenEndpoint(opts, to)) continue;
      var fromTier = endpointTier(opts, from, 0);
      var toTier = endpointTier(opts, to, fromTier);
      if (!fromTier) fromTier = toTier || 3;
      if (!toTier) toTier = fromTier;
      var tier = Math.max(fromTier, toTier);
      var rank = Math.min(fromTier, toTier);
      // راهی که دو سرش شهر اصلی/مرکز شهرستان است، همان شبکهٔ اصلی است؛ از نمای
      // دور هم دیده می‌شود (و ضخیم‌تر رسم می‌شود). راهی که یک سرش شهر کوچک است
      // تا وقتی نام آن شهر آشکار نشود رسم نمی‌شود.
      if (rank <= 2 && tier <= 2) tier = 1;
      if (tier > maxTier) continue;
      var d = pathFor(pointsOf(route), project, width, height);
      if (!d) continue;
      out.push({ d: d, tier: tier, rank: rank });
    }
    return out;
  }

  function pathsFor(project, bounds, width, height, options) {
    return entriesFor(project, bounds, width, height, options).map(function (entry) {
      return entry.d;
    });
  }

  // گروه SVG راه‌ها: یک حاشیهٔ نرم زیر و خط راه روی آن، هر راه در گروه خودش تا
  // رده‌اش هم برای ضخامت و هم برای آشکارشدن با بزرگ‌نمایی به کار برود. بریدن به
  // شکل استان با clipPath انجام می‌شود؛ شناسهٔ آن را فراخوان می‌دهد.
  function markup(project, bounds, width, height, clipId, options) {
    var entries = entriesFor(project, bounds, width, height, options);
    if (!entries.length) return '';
    var body = '';
    for (var i = 0; i < entries.length; i += 1) {
      body += '<g data-tier="' + entries[i].tier + '" data-rank="' + entries[i].rank + '">' +
        '<path class="station-map-road-casing" d="' + entries[i].d + '"></path>' +
        '<path class="station-map-road" d="' + entries[i].d + '"></path></g>';
    }
    return '<g class="station-map-roads"' + (clipId ? ' clip-path="url(#' + clipId + ')"' : '') +
      ' aria-hidden="true">' + body + '</g>';
  }

  window.AtlasRoads = {
    routes: routes,
    pointsOf: pointsOf,
    entriesFor: entriesFor,
    pathsFor: pathsFor,
    markup: markup
  };
})();

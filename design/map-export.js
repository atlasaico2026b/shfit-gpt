/* ATLAS SHIFT · خروجی فایل نقشهٔ استان‌ها
   ----------------------------------------------------------------------------
   یک فایل SVG مستقل و یک فایل JSON از نقشه می‌سازد تا کاربر بتواند نقشهٔ استان
   یا استان‌های دلخواهش را دانلود کند و بیرون از برنامه هم از آن استفاده کند.
   فایل SVG هیچ وابستگی بیرونی ندارد (بدون فونت، بدون تصویر، بدون اسکریپت) و
   همهٔ شهرها با نام و موقعیت واقعی درونش هست.

   رنگ‌های این فایل عمداً ثابت‌اند: خروجی یک سند مستقل است و توکن‌های برنامه
   در آن وجود ندارند. */
(function () {
  'use strict';

  var PALETTE = {
    paper: '#0f1120',
    land: '#1b1e33',
    border: '#5b6390',
    dot: '#8f9ad0',
    dotPrimary: '#22d3ee',
    road: '#000000',
    roadCasing: '#8f9ad0',
    label: '#dfe4ff',
    labelPrimary: '#ffffff',
    title: '#ffffff',
    note: '#9aa3cf'
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function provinceList() {
    var api = window.AtlasProvinces;
    if (api && Array.isArray(api.provinces) && api.provinces.length) return api.provinces;
    var legacy = window.AtlasKhuzestan;
    return legacy && Array.isArray(legacy.provinces) ? legacy.provinces : [];
  }

  function findProvince(id) {
    var api = window.AtlasProvinces;
    if (api && typeof api.province === 'function') {
      var found = api.province(id);
      if (found) return found;
    }
    return provinceList().filter(function (item) { return item.id === id; })[0] || null;
  }

  // شبکهٔ راه‌های اصلی: درخت پوشای کمینه روی شهرهای نمایش‌داده‌شده. همان الگوریتم
  // modules.js است تا خروجی دانلودی با نقشهٔ درون برنامه یکی باشد.
  function roadEdges(cities) {
    var points = cities.map(function (city) {
      return { x: Number(city.x), y: Number(city.y) };
    }).filter(function (point) {
      return isFinite(point.x) && isFinite(point.y);
    });
    if (points.length < 2) return [];
    var used = points.map(function () { return false; });
    used[0] = true;
    var edges = [];
    for (var step = 1; step < points.length; step += 1) {
      var best = null;
      for (var i = 0; i < points.length; i += 1) {
        if (!used[i]) continue;
        for (var j = 0; j < points.length; j += 1) {
          if (used[j]) continue;
          var dx = points[i].x - points[j].x;
          var dy = points[i].y - points[j].y;
          var dist = dx * dx + dy * dy;
          if (!best || dist < best.dist) best = { from: points[i], to: points[j], dist: dist };
        }
      }
      if (!best) break;
      used[points.indexOf(best.to)] = true;
      edges.push(best);
    }
    return edges;
  }

  // SVG مستقل: مرز استان + راه‌های اصلی + نقطه و نام همهٔ شهرها + عنوان و راهنما.
  function svg(province, options) {
    if (!province) return '';
    var opts = options || {};
    var box = String(province.viewBox || '0 0 1000 1262').split(/\s+/).map(Number);
    var width = box[2] || 1000;
    var height = box[3] || 1262;
    var pad = 40;
    var cities = (province.cities || []).filter(function (city) {
      return !opts.hidden || opts.hidden.indexOf(city.name) < 0;
    });

    var roads = roadEdges(cities).map(function (edge) {
      var x1 = (edge.from.x * width / 100).toFixed(1);
      var y1 = (edge.from.y * height / 100).toFixed(1);
      var x2 = (edge.to.x * width / 100).toFixed(1);
      var y2 = (edge.to.y * height / 100).toFixed(1);
      var coords = 'x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"';
      return '<line ' + coords + ' stroke="' + PALETTE.roadCasing + '" stroke-width="5" stroke-linecap="round"/>' +
        '<line ' + coords + ' stroke="' + PALETTE.road + '" stroke-width="2.4" stroke-linecap="round"/>';
    }).join('');

    var dots = cities.map(function (city) {
      var x = Number(city.x) * (width / 100);
      var y = Number(city.y) * (height / 100);
      var primary = city.tier === 1;
      var flip = Number(city.x) > 72;
      var drop = Number(city.y) > 92;
      var radius = primary ? 7 : city.tier === 2 ? 5 : city.tier === 3 ? 4 : 3;
      var fontSize = primary ? 22 : city.tier === 2 ? 18 : city.tier === 3 ? 15 : 13;
      return '<g>' +
        '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + radius + '" fill="' +
          (primary ? PALETTE.dotPrimary : PALETTE.dot) + '" stroke="' + PALETTE.paper + '" stroke-width="1.5"/>' +
        '<text x="' + (x + (flip ? -12 : 12)).toFixed(1) + '" y="' + (y + (drop ? -12 : 7)).toFixed(1) +
          '" text-anchor="' + (flip ? 'end' : 'start') + '" font-size="' + fontSize +
          '" fill="' + (primary ? PALETTE.labelPrimary : PALETTE.label) + '" direction="rtl">' +
          esc(city.name) + '</text></g>';
    }).join('');

    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" ' +
        'width="' + width + '" height="' + height + '" role="img" ' +
        'aria-label="نقشهٔ استان ' + esc(province.name) + '">\n' +
      '<title>نقشهٔ استان ' + esc(province.name) + ' · ATLAS SHIFT</title>\n' +
      '<rect width="' + width + '" height="' + height + '" fill="' + PALETTE.paper + '"/>\n' +
      '<g transform="translate(0 ' + pad + ')">\n' +
      '<path d="' + esc(province.path) + '" fill="' + PALETTE.land + '" stroke="' + PALETTE.border +
        '" stroke-width="2.5" stroke-linejoin="round"/>\n' +
      roads + '\n' + dots + '\n</g>\n' +
      '<text x="' + (width - 24) + '" y="' + (height - 18) + '" text-anchor="end" font-size="16" ' +
        'fill="' + PALETTE.note + '" direction="rtl">ATLAS SHIFT · ' + esc(province.name) + '</text>\n' +
      '</svg>\n';
  }

  // JSON قابل استفاده در هر برنامهٔ دیگر: مرز، قاب و فهرست شهرها با مختصات واقعی.
  function json(provinces) {
    var list = (Array.isArray(provinces) ? provinces : [provinces]).filter(Boolean);
    return JSON.stringify({
      source: 'ATLAS SHIFT',
      generatedAt: new Date().toISOString(),
      provinces: list.map(function (province) {
        return {
          id: province.id,
          name: province.name,
          viewBox: province.viewBox,
          aspect: province.aspect,
          center: province.center,
          path: province.path,
          roads: roadEdges(province.cities || []).map(function (edge) {
            return { from: [edge.from.x, edge.from.y], to: [edge.to.x, edge.to.y] };
          }),
          cities: (province.cities || []).map(function (city) {
            return {
              name: city.name,
              lat: city.lat,
              lon: city.lon,
              x: city.x,
              y: city.y,
              tier: city.tier,
              aliases: city.aliases
            };
          })
        };
      })
    }, null, 2);
  }

  function saveFile(name, text, mime) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function downloadSvg(ids) {
    var list = (Array.isArray(ids) ? ids : [ids]).map(findProvince).filter(Boolean);
    list.forEach(function (province) {
      saveFile('atlas-shift-map-' + province.id + '.svg', svg(province), 'image/svg+xml;charset=utf-8');
    });
    return list.length;
  }

  function downloadJson(ids) {
    var list = (Array.isArray(ids) ? ids : [ids]).map(findProvince).filter(Boolean);
    if (!list.length) return 0;
    var name = list.length === 1 ? 'atlas-shift-map-' + list[0].id + '.json' : 'atlas-shift-maps.json';
    saveFile(name, json(list), 'application/json;charset=utf-8');
    return list.length;
  }

  window.AtlasMapExport = {
    provinces: provinceList,
    svg: svg,
    json: json,
    downloadSvg: downloadSvg,
    downloadJson: downloadJson
  };
})();

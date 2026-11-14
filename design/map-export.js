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
    road: '#b9c3ee',
    roadCasing: '#2a2f52',
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

  // راه‌های اصلی: هندسهٔ واقعی جاده‌ها از design/iran-roads.js. تصویر جغرافیایی
  // هر استان از برازش خطی شهرهای خودش حساب می‌شود؛ همان نگاشتی که مختصات درصدی
  // شهرها با آن ساخته شده است.
  function geoFit(province) {
    var cities = (province.cities || []).filter(function (city) {
      return isFinite(Number(city.lat)) && isFinite(Number(city.lon)) &&
        isFinite(Number(city.x)) && isFinite(Number(city.y));
    });
    if (cities.length < 2) return null;
    function fitAxis(values, targets) {
      var n = values.length;
      var sumX = 0, sumY = 0;
      for (var i = 0; i < n; i += 1) { sumX += values[i]; sumY += targets[i]; }
      var meanX = sumX / n, meanY = sumY / n;
      var cov = 0, variance = 0;
      for (var j = 0; j < n; j += 1) {
        var dx = values[j] - meanX;
        cov += dx * (targets[j] - meanY);
        variance += dx * dx;
      }
      if (variance <= 0) return null;
      var slope = cov / variance;
      return { slope: slope, offset: meanY - slope * meanX };
    }
    var lonFit = fitAxis(cities.map(function (c) { return Number(c.x); }), cities.map(function (c) { return Number(c.lon); }));
    var latFit = fitAxis(cities.map(function (c) { return Number(c.y); }), cities.map(function (c) { return Number(c.lat); }));
    if (!lonFit || !latFit || !lonFit.slope || !latFit.slope) return null;
    return {
      project: function (lon, lat) {
        return { x: (lon - lonFit.offset) / lonFit.slope, y: (lat - latFit.offset) / latFit.slope };
      },
      bounds: {
        minLon: Math.min(lonFit.offset, lonFit.offset + lonFit.slope * 100),
        maxLon: Math.max(lonFit.offset, lonFit.offset + lonFit.slope * 100),
        minLat: Math.min(latFit.offset, latFit.offset + latFit.slope * 100),
        maxLat: Math.max(latFit.offset, latFit.offset + latFit.slope * 100)
      }
    };
  }

  function roadPaths(province, width, height) {
    var api = window.AtlasRoads;
    var fit = geoFit(province);
    if (!api || typeof api.pathsFor !== 'function' || !fit) return [];
    return api.pathsFor(fit.project, fit.bounds, width, height);
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

    var paths = roadPaths(province, width, height);
    var roads = paths.map(function (d) {
      return '<path d="' + d + '" fill="none" stroke="' + PALETTE.roadCasing + '" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="' + d + '" fill="none" stroke="' + PALETTE.road + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    }).join('');
    var clip = paths.length
      ? '<defs><clipPath id="atlas-map-clip"><path d="' + esc(province.path) + '"/></clipPath></defs>'
      : '';
    if (roads) roads = '<g clip-path="url(#atlas-map-clip)">' + roads + '</g>';

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
      clip + '\n' + roads + '\n' + dots + '\n</g>\n' +
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
          roads: (function () {
            var fit = geoFit(province);
            var api = window.AtlasRoads;
            if (!fit || !api || typeof api.routes !== 'function') return [];
            return api.routes().filter(function (route) {
              var points = route.points || [];
              return points.some(function (point) {
                var lon = Number(point[0]);
                var lat = Number(point[1]);
                return lon >= fit.bounds.minLon - 0.25 && lon <= fit.bounds.maxLon + 0.25 &&
                  lat >= fit.bounds.minLat - 0.25 && lat <= fit.bounds.maxLat + 0.25;
              });
            }).map(function (route) {
              return {
                from: route.from,
                to: route.to,
                km: route.km,
                points: (route.points || []).map(function (point) {
                  var percent = fit.project(Number(point[0]), Number(point[1]));
                  return [Number(percent.x.toFixed(1)), Number(percent.y.toFixed(1))];
                })
              };
            });
          })(),
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

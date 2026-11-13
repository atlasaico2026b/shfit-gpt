#!/usr/bin/env python3
"""Build design/provinces-map.js from open geographic data.

Sources (downloaded into .tmp/maps on first run):
  irn_adm1.geojson  geoBoundaries gbOpen IRN ADM1 (simplified) — province outlines
  cities.json       OpenStreetMap places (city/town) inside Iran, with name:fa

Output: one offline JS asset with, for every province, the outline path in its own
viewBox plus every city anchored by its real lat/lon. No network access at runtime.

Usage: python3 tools/build-province-maps.py
"""
import json, math, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, '.tmp', 'maps')
OUT = os.path.join(ROOT, 'design', 'provinces-map.js')

BOUNDARY_URL = ('https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/'
                'gbOpen/IRN/ADM1/geoBoundaries-IRN-ADM1_simplified.geojson')
CITIES_QUERY = """[out:json][timeout:600];
area["ISO3166-1"="IR"][admin_level=2]->.a;
(node["place"~"^(city|town)$"](area.a););
out body;
"""

PROVINCES = {
    'Alborz': ('alborz', 'البرز', 'کرج'),
    'Ardabil': ('ardabil', 'اردبیل', 'اردبیل'),
    'Bushehr': ('bushehr', 'بوشهر', 'بوشهر'),
    'Chaharmahal and Bakhtiari': ('chaharmahal-bakhtiari', 'چهارمحال و بختیاری', 'شهرکرد'),
    'East Azerbaijan': ('east-azerbaijan', 'آذربایجان شرقی', 'تبریز'),
    'West Azerbaijan': ('west-azerbaijan', 'آذربایجان غربی', 'ارومیه'),
    'Fars': ('fars', 'فارس', 'شیراز'),
    'Gilan': ('gilan', 'گیلان', 'رشت'),
    'Golestan': ('golestan', 'گلستان', 'گرگان'),
    'Hamadan': ('hamadan', 'همدان', 'همدان'),
    'Hormozgan': ('hormozgan', 'هرمزگان', 'بندرعباس'),
    'Ilam': ('ilam', 'ایلام', 'ایلام'),
    'Isfahan': ('isfahan', 'اصفهان', 'اصفهان'),
    'Kerman': ('kerman', 'کرمان', 'کرمان'),
    'Kermanshah': ('kermanshah', 'کرمانشاه', 'کرمانشاه'),
    'Khuzestan': ('khuzestan', 'خوزستان', 'اهواز'),
    'Kohgiluyeh and Boyer-Ahmad': ('kohgiluyeh-boyer-ahmad', 'کهگیلویه و بویراحمد', 'یاسوج'),
    'Kurdistan': ('kurdistan', 'کردستان', 'سنندج'),
    'Lorestan': ('lorestan', 'لرستان', 'خرم آباد'),
    'Markazi': ('markazi', 'مرکزی', 'اراک'),
    'Mazandaran': ('mazandaran', 'مازندران', 'ساری'),
    'North Khorasan': ('north-khorasan', 'خراسان شمالی', 'بجنورد'),
    'Qazvin': ('qazvin', 'قزوین', 'قزوین'),
    'Qom': ('qom', 'قم', 'قم'),
    'Razavi Khorasan': ('razavi-khorasan', 'خراسان رضوی', 'مشهد'),
    'Semnan': ('semnan', 'سمنان', 'سمنان'),
    'Sistan and Baluchestan': ('sistan-baluchestan', 'سیستان و بلوچستان', 'زاهدان'),
    'South Khorasan': ('south-khorasan', 'خراسان جنوبی', 'بیرجند'),
    'Tehran': ('tehran', 'تهران', 'تهران'),
    'Yazd': ('yazd', 'یزد', 'یزد'),
    'Zanjan': ('zanjan', 'زنجان', 'زنجان'),
}

VIEW_WIDTH = 1000
MAX_POINTS = 760


def fetch(url, path, post=None):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    args = ['curl', '-sL', '--max-time', '600', '-A', 'atlas-shift-map-builder/1.0',
            '-H', 'Accept: application/json']
    if post:
        args += ['--data-urlencode', 'data=' + post]
    args += [url, '-o', path]
    subprocess.run(args, check=True)
    print('downloaded', os.path.basename(path))


def clean(value):
    """Persian spelling used by the app: Arabic yeh/kaf become Persian."""
    return (value.replace('\u064a', '\u06cc').replace('\u0643', '\u06a9')
            .replace('\u200f', '').replace('\u200e', '')
            .strip())


def key_of(value):
    return clean(value).replace('\u200c', '').replace(' ', '')


def rings_of(geometry):
    """Every outer ring of a (Multi)Polygon as a list of (lon, lat)."""
    if geometry['type'] == 'Polygon':
        return [geometry['coordinates'][0]]
    return [poly[0] for poly in geometry['coordinates']]


def ring_area(ring):
    a = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


def dp(points, tol):
    """Douglas–Peucker simplification of a (x, y) polyline."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        x1, y1 = points[start]
        x2, y2 = points[end]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy)
        best, best_i = -1.0, -1
        for i in range(start + 1, end):
            px, py = points[i]
            if norm == 0:
                d = math.hypot(px - x1, py - y1)
            else:
                d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm
            if d > best:
                best, best_i = d, i
        if best > tol and best_i > 0:
            keep[best_i] = True
            stack.append((start, best_i))
            stack.append((best_i, end))
    return [p for p, k in zip(points, keep) if k]


def point_in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def main():
    boundary = os.path.join(DATA, 'irn_adm1.geojson')
    cities_file = os.path.join(DATA, 'cities.json')
    fetch(BOUNDARY_URL, boundary)
    fetch('https://overpass-api.de/api/interpreter', cities_file, post=CITIES_QUERY)

    adm = json.load(open(boundary, encoding='utf-8'))
    cities_raw = json.load(open(cities_file, encoding='utf-8'))['elements']

    # Some provinces arrive as several features (Mazandaran); merge them.
    shapes = {}
    for feature in adm['features']:
        english = feature['properties'].get('shapeName')
        if english in PROVINCES:
            shapes.setdefault(english, []).extend(rings_of(feature['geometry']))

    provinces = []
    for english, (pid, name, capital) in PROVINCES.items():
        rings = shapes.get(english, [])
        if not rings:
            sys.exit('missing geometry: ' + english)

        lons = [p[0] for r in rings for p in r]
        lats = [p[1] for r in rings for p in r]
        min_lon, max_lon = min(lons), max(lons)
        min_lat, max_lat = min(lats), max(lats)
        span_lon = max_lon - min_lon
        span_lat = max_lat - min_lat
        mid_lat = math.radians((min_lat + max_lat) / 2)
        height = max(1, round(VIEW_WIDTH * span_lat / (span_lon * math.cos(mid_lat))))

        def to_view(lon, lat):
            return ((lon - min_lon) / span_lon * VIEW_WIDTH,
                    (max_lat - lat) / span_lat * height)

        def to_percent(lon, lat):
            return (min(100.0, max(0.0, round((lon - min_lon) / span_lon * 100, 1))),
                    min(100.0, max(0.0, round((max_lat - lat) / span_lat * 100, 1))))

        # Simplify in view space, so the tolerance is a visual one (pixels).
        parts = []
        for ring in rings:
            if ring_area(ring) < 1e-5:
                continue
            pts = [to_view(lon, lat) for lon, lat in ring]
            tol = 1.2
            simplified = dp(pts, tol)
            while len(simplified) > MAX_POINTS and tol < 60:
                tol *= 1.4
                simplified = dp(pts, tol)
            if len(simplified) >= 3:
                parts.append((ring_area(ring), simplified))

        parts.sort(key=lambda item: -item[0])
        path = ''.join(
            'M' + 'L'.join('%g %g' % (round(x, 1), round(y, 1)) for x, y in pts) + 'Z'
            for _, pts in parts
        )

        found = []
        for node in cities_raw:
            tags = node.get('tags', {})
            fa = clean(tags.get('name:fa') or tags.get('name') or '')
            lat, lon = node['lat'], node['lon']
            if not fa or math.isnan(lat) or math.isnan(lon):
                continue
            if not (min_lat <= lat <= max_lat and min_lon <= lon <= max_lon):
                continue
            if not any(point_in_ring(lon, lat, ring) for ring in rings):
                continue
            try:
                population = int(float(tags.get('population') or 0))
            except ValueError:
                population = 0
            x, y = to_percent(lon, lat)
            found.append({
                'name': fa,
                'lat': round(lat, 4),
                'lon': round(lon, 4),
                'x': x,
                'y': y,
                'population': population,
                'aliases': [],
            })

        # One anchor per name, the biggest place winning.
        by_name = {}
        for city in sorted(found, key=lambda c: -c['population']):
            by_name.setdefault(key_of(city['name']), city)
        cities = list(by_name.values())

        # Tier 1 = provincial capital, 2 = big town, 3 = small town (zoom only).
        for city in cities:
            if key_of(city['name']) == key_of(capital):
                city['tier'] = 1
            elif city['population'] >= 100000:
                city['tier'] = 2
            else:
                city['tier'] = 3
        if not any(c['tier'] == 1 for c in cities):
            for city in cities:
                if city['population'] >= 500000:
                    city['tier'] = 1
        cities.sort(key=lambda c: (c['tier'], -c['population'], c['name']))

        provinces.append({
            'id': pid,
            'name': name,
            'english': english,
            'capital': capital,
            'viewBox': '0 0 %d %d' % (VIEW_WIDTH, height),
            'aspect': round(VIEW_WIDTH / height, 4),
            'center': {
                'lat': round((min_lat + max_lat) / 2, 4),
                'lon': round((min_lon + max_lon) / 2, 4),
                'zoom': 6,
            },
            'path': path,
            'cities': cities,
        })

    print('provinces: %d, cities: %d, points: %d' % (
        len(provinces),
        sum(len(p['cities']) for p in provinces),
        sum(p['path'].count('L') + 1 for p in provinces)))

    payload = json.dumps(provinces, ensure_ascii=False, separators=(',', ':'))
    with open(OUT, 'w', encoding='utf-8') as handle:
        handle.write(HEADER + payload + TAIL)
    print('wrote %s (%d bytes)' % (OUT, os.path.getsize(OUT)))


HEADER = '''/* ATLAS SHIFT · مرز همهٔ استان‌های ایران و لنگرگاه واقعی شهرها
   ----------------------------------------------------------------------------
   مرزها از دادهٔ باز geoBoundaries (gbOpen/IRN/ADM1) و شهرها از نقشهٔ باز
   OpenStreetMap گرفته و ساده شده‌اند. همه‌چیز از پیش محاسبه شده؛ برنامه در زمان
   اجرا هیچ درخواست شبکه‌ای برای نقشه ندارد (سازگار با کارکرد آفلاین).

   برای هر استان: شکل مرز در viewBox خودش، نسبت تصویر، مرکز جغرافیایی و فهرست
   شهرهای واقعی با مختصات درصدی. مختصات درصدی و مسیر مرز از یک تصویر خطی ساخته
   شده‌اند، پس هر نقطه دقیقاً روی شکل همان استان می‌نشیند.

   بازسازی داده‌ها: python3 tools/build-province-maps.py
   رسم نقشه در modules.js است؛ این فایل تنها صاحب شکل استان‌ها و لنگرگاه شهرهاست. */
(function () {
  'use strict';

  var PROVINCES = '''

TAIL = ''';

  function normalize(value) {
    return String(value == null ? '' : value)
      .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
      .replace(/استان|شهرستان/g, '')
      .replace(/[\\u200c\\s\\-()۰-۹0-9]/g, '')
      .trim();
  }

  // نمایهٔ همهٔ شهرها با نام یکسان: برای پیدا کردن استانِ ایستگاه‌هایی که استان
  // ثبت‌نشده دارند. هر نمایه به‌ترتیب جمعیت مرتب است تا شهر بزرگ‌تر برنده شود.
  var CITY_INDEX = {};
  PROVINCES.forEach(function (province) {
    province.cities.forEach(function (city) {
      city.provinceId = province.id;
      city.provinceName = province.name;
      [city.name].concat(city.aliases || []).forEach(function (key) {
        var norm = normalize(key);
        if (!norm) return;
        var bucket = CITY_INDEX[norm] || (CITY_INDEX[norm] = []);
        if (bucket.indexOf(city) < 0) bucket.push(city);
      });
    });
  });
  Object.keys(CITY_INDEX).forEach(function (key) {
    CITY_INDEX[key].sort(function (a, b) {
      return (Number(b.population) || 0) - (Number(a.population) || 0);
    });
  });

  function province(id) {
    var key = String(id == null ? '' : id).toLowerCase();
    for (var i = 0; i < PROVINCES.length; i += 1) {
      if (PROVINCES[i].id === key) return PROVINCES[i];
    }
    return null;
  }

  function cityIn(provinceId, name) {
    var target = province(provinceId);
    var key = normalize(name);
    if (!target || !key) return null;
    for (var i = 0; i < target.cities.length; i += 1) {
      var city = target.cities[i];
      if (normalize(city.name) === key) return city;
      for (var j = 0; j < (city.aliases || []).length; j += 1) {
        if (normalize(city.aliases[j]) === key) return city;
      }
    }
    return null;
  }

  function city(name) {
    var key = normalize(name);
    return key && CITY_INDEX[key] ? CITY_INDEX[key][0] : null;
  }

  function provinceOfCity(name) {
    var found = city(name);
    return found ? province(found.provinceId) : null;
  }

  window.AtlasProvinces = {
    provinces: PROVINCES,
    province: province,
    city: city,
    cityIn: cityIn,
    provinceOfCity: provinceOfCity,
    normalize: normalize
  };
})();
'''


if __name__ == '__main__':
    main()

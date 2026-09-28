// Извлекает сушу Евразии и Северной Африки из Natural Earth (world-atlas, 1:50m)
// и сохраняет компактный JSON: массив полигонов, полигон = массив колец [lon,lat,lon,lat,...].
// Запуск: node scripts/build-land.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';

const BBOX = { lonMin: -14, lonMax: 127, latMin: 10, latMax: 73 };
const MIN_AREA = 0.02; // кв. градусов: отбрасываем совсем мелкие островки

const topo = JSON.parse(readFileSync('node_modules/world-atlas/land-50m.json', 'utf8'));
const land = feature(topo, topo.objects.land);

const polygons = [];
for (const f of land.features) {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly0 of polys) {
    // Чукотка и о. Врангеля пересекают 180-й меридиан: «разворачиваем» западные долготы.
    const crosses = poly0[0].some(([x]) => x > 170) && poly0[0].some(([x]) => x < -170);
    const poly = crosses ? poly0.map((ring) => ring.map(([x, y]) => [x < -150 ? x + 360 : x, y])) : poly0;
    const outer = poly[0];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of outer) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    if (maxX < BBOX.lonMin || minX > BBOX.lonMax || maxY < BBOX.latMin || minY > BBOX.latMax) continue;
    if ((maxX - minX) * (maxY - minY) < MIN_AREA) continue;
    polygons.push(
      poly.map((ring) => {
        const out = [];
        let px = NaN, py = NaN;
        for (const [x, y] of ring) {
          const rx = Math.round(x * 50) / 50;
          const ry = Math.round(y * 50) / 50;
          if (rx === px && ry === py) continue;
          out.push(rx, ry);
          px = rx; py = ry;
        }
        return out;
      }),
    );
  }
}

writeFileSync('src/data/land.json', JSON.stringify(polygons));
console.log(`polygons: ${polygons.length}, bytes: ${JSON.stringify(polygons).length}`);

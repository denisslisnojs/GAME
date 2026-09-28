import landData from '../data/land.json';
import { ART_H, ART_W, CELL, GRID_H, GRID_W, LAT_MAX, LON_FACTOR, LON_MIN, PX_PER_DEG_LAT, PX_PER_DEG_LON } from '../config';
import { clamp, fbm, hash2, valueNoise } from '../util/rng';
import { LAKES, LONG_LAKES, RANGES, RIVERS, type LonLat } from './geodata';

/** Типы местности клетки навигационной сетки. */
export const T = {
  DEEP: 0,
  SEA: 1,
  GRASS: 2,
  FOREST: 3,
  TAIGA: 4,
  STEPPE: 5,
  DRY: 6,
  DESERT: 7,
  TUNDRA: 8,
  SNOW: 9,
  JUNGLE: 10,
  FARM: 11,
  HILLS: 12,
  MOUNTAIN: 13,
  PEAK: 14,
} as const;
export type Terrain = (typeof T)[keyof typeof T];

export const TERRAIN_NAME: Record<number, string> = {
  [T.DEEP]: 'Открытое море',
  [T.SEA]: 'Прибрежные воды',
  [T.GRASS]: 'Луга',
  [T.FOREST]: 'Лес',
  [T.TAIGA]: 'Тайга',
  [T.STEPPE]: 'Степь',
  [T.DRY]: 'Сухие земли',
  [T.DESERT]: 'Пустыня',
  [T.TUNDRA]: 'Тундра',
  [T.SNOW]: 'Снега',
  [T.JUNGLE]: 'Джунгли',
  [T.FARM]: 'Поля',
  [T.HILLS]: 'Холмы',
  [T.MOUNTAIN]: 'Горы',
  [T.PEAK]: 'Непроходимые вершины',
};

/** Множитель времени пути (1 — луга). Infinity — непроходимо. */
export const TERRAIN_COST: Record<number, number> = {
  [T.DEEP]: Infinity,
  [T.SEA]: 1.3,
  [T.GRASS]: 1.0,
  [T.FOREST]: 1.45,
  [T.TAIGA]: 1.6,
  [T.STEPPE]: 0.85,
  [T.DRY]: 1.05,
  [T.DESERT]: 1.6,
  [T.TUNDRA]: 1.7,
  [T.SNOW]: 2.4,
  [T.JUNGLE]: 1.9,
  [T.FARM]: 0.9,
  [T.HILLS]: 1.6,
  [T.MOUNTAIN]: 2.8,
  [T.PEAK]: Infinity,
};

/** Как далеко от берега (в клетках) корабль может выйти в море. */
const MAX_SAIL_DIST = 9;

export interface MapData {
  /** Готовая пиксельная картинка карты ART_W × ART_H. */
  canvas: HTMLCanvasElement;
  /** Тип местности каждой клетки GRID_W × GRID_H. */
  terrain: Uint8Array;
  /** Цена прохода клетки. */
  cost: Float32Array;
}

// ───────────────────────── вспомогательное ─────────────────────────

function rgb(hex: number): number {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return (0xff << 24) | (b << 16) | (g << 8) | r;
}

function toArt(lon: number, lat: number): [number, number] {
  return [(lon - LON_MIN) * PX_PER_DEG_LON, (LAT_MAX - lat) * PX_PER_DEG_LAT];
}

function artLon(x: number): number {
  return LON_MIN + x / PX_PER_DEG_LON;
}
function artLat(y: number): number {
  return LAT_MAX - y / PX_PER_DEG_LAT;
}

/** Расстояние от точки до ломаной в «градусах карты» (долгота сжата). */
function distToPolyline(lon: number, lat: number, pts: LonLat[]): number {
  let best = Infinity;
  const px = lon * LON_FACTOR;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0] * LON_FACTOR;
    const ay = pts[i][1];
    const bx = pts[i + 1][0] * LON_FACTOR;
    const by = pts[i + 1][1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (lat - ay) * dy) / len2 : 0;
    t = clamp(t, 0, 1);
    const qx = ax + t * dx - px;
    const qy = ay + t * dy - lat;
    const d = qx * qx + qy * qy;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// ───────────────────────── биомы ─────────────────────────

type Blob = [lon: number, lat: number, rx: number, ry: number];

const DESERTS: Blob[] = [
  [8, 21.5, 26, 8.2], // Сахара
  [20, 28.5, 9, 3.6], // Ливия
  [33.2, 26, 2.2, 5], // Восточная пустыня Египта
  [33.9, 29.9, 1.2, 1.1], // Синай
  [46.5, 23.5, 11, 7], // Аравия
  [40.5, 32.3, 4.2, 2.5], // Сирийская пустыня
  [56, 32.3, 4.3, 3.2], // Деште-Кевир и Лут
  [62, 27.8, 4.2, 2.4], // Белуджистан
  [60, 39.8, 6, 2.8], // Каракумы
  [64.5, 42.6, 4, 2.4], // Кызылкум
  [56, 43.7, 3, 1.7], // Устюрт
  [83.3, 39.2, 6.3, 2.2], // Такла-Макан
  [104, 42.5, 9, 3], // Гоби
  [103.5, 39.8, 4, 1.8], // Алашань
  [71.3, 26.8, 3, 2.6], // Тар
];

const STEPPES: Blob[] = [
  [41, 48.3, 13, 4.3], // Причерноморье и Поволжье
  [66, 48.8, 17, 4.6], // Казахская степь
  [104, 47.3, 15, 4.3], // Монголия
  [121, 45, 3, 4], // Маньчжурия
  [20.3, 47, 2.2, 1.2], // Паннония
  [35, 39, 5.5, 1.7], // Анатолийское плато
];

/** 1 в центре пятна, 0 на краю, отрицательно снаружи; шум делает край рваным. */
function blobScore(blobs: Blob[], lon: number, lat: number, noise: number): number {
  let best = -9;
  for (const [cx, cy, rx, ry] of blobs) {
    const dx = (lon - cx) / rx;
    const dy = (lat - cy) / ry;
    const s = 1 - Math.sqrt(dx * dx + dy * dy);
    if (s > best) best = s;
  }
  return best + (noise - 0.5) * 0.7;
}

export function inDesert(lon: number, lat: number): boolean {
  return blobScore(DESERTS, lon, lat, 0.5) > 0;
}

function biomeAt(lon0: number, lat0: number, n1: number, n2: number, forestNoise: number, edge: number, h: number): Terrain {
  // Шум «размывает» границы климатических поясов.
  // Крупный шум изгибает пояса, мелкий (edge) делает их край рваным, а не прямым.
  const lon = lon0 + (n1 - 0.5) * 3 + (edge - 0.5) * 1.8;
  const lat = lat0 + (n2 - 0.5) * 2 + (edge - 0.5) * 1.2;

  if (lat > 70.3) return T.SNOW;
  if (lat > 66.8) return T.TUNDRA;

  // Пустыни и степи: пятна с искривлёнными координатами, рваным краем и дизерингом на границе.
  const desert = blobScore(DESERTS, lon, lat, edge);
  if (desert > 0 || (desert > -0.07 && h < (desert + 0.07) / 0.07 * 0.5)) return T.DESERT;
  const steppe = blobScore(STEPPES, lon, lat, edge);
  if (steppe > 0 || (steppe > -0.06 && h < (steppe + 0.06) / 0.06 * 0.5)) {
    if (lat > 52.5 && lon < 60 && forestNoise > 0.55) return T.FOREST;
    return T.STEPPE;
  }

  if (lon < 31 && lat > 63.5) return T.TAIGA;
  if (lat > 58.3 && lon > 8) return forestNoise > 0.35 ? T.TAIGA : T.GRASS;
  if (lon > 58 && lat > 55.5) return T.TAIGA;
  if (lon > 85 && lat > 51) return forestNoise > 0.3 ? T.TAIGA : T.STEPPE;

  // Индия и тропики
  if (lat < 30 && lon > 66) return forestNoise > 0.3 ? T.JUNGLE : T.GRASS;
  // Китай
  if (lon >= 100 && lat < 41) {
    if (lat < 33) return forestNoise > 0.35 ? T.JUNGLE : T.FARM;
    return forestNoise > 0.62 ? T.FOREST : T.FARM;
  }
  if (lon > 123 && lat > 38) return T.FOREST;

  // Средиземноморье, Ближний Восток, Иран, Афганистан
  if (lat < 43.5 && lat > 12 && lon < 72) {
    if (lon < 30 && forestNoise > 0.62) return T.FOREST;
    return T.DRY;
  }

  // Умеренная Европа и Русь
  if (lon < 60 && lat >= 43.5) {
    const forestThreshold = lon > 28 && lat > 51 ? 0.42 : 0.56;
    return forestNoise > forestThreshold ? T.FOREST : T.GRASS;
  }
  // Южная Сибирь, северный Казахстан
  if (lat > 50) return forestNoise > 0.45 ? T.TAIGA : T.STEPPE;
  return T.DRY;
}

// ───────────────────────── палитра ─────────────────────────

const C = {
  deep: [rgb(0x1a3150), rgb(0x1c3555)],
  mid: [rgb(0x22436a), rgb(0x25486f)],
  shallow: [rgb(0x2d5c88), rgb(0x31628e)],
  coast: [rgb(0x3f7aa6), rgb(0x4580ab)],
  foam: rgb(0x78b0d0),
  wave: rgb(0x5b90ba),
  beach: [rgb(0xd6c68c), rgb(0xcbb97d)],
  grass: [rgb(0x6b9a3f), rgb(0x5f8e37), rgb(0x78a748)],
  farm: [rgb(0x8ba84a), rgb(0x9fb152), rgb(0x7c9a40)],
  forest: [rgb(0x4d7b32), rgb(0x44702c)],
  taiga: [rgb(0x4b6a44), rgb(0x42603d)],
  steppe: [rgb(0xa6a55b), rgb(0xb3b068), rgb(0x979651)],
  dry: [rgb(0x9ca155), rgb(0xabaa62), rgb(0x8c924a)],
  desert: [rgb(0xdcb56d), rgb(0xe4c27e), rgb(0xd2aa62)],
  dune: rgb(0xc59b55),
  duneLight: rgb(0xecd08f),
  tundra: [rgb(0x8d9a82), rgb(0x99a58f), rgb(0x7f8c75)],
  snow: [rgb(0xe9eef2), rgb(0xdde5eb), rgb(0xf3f6f8)],
  jungle: [rgb(0x3d7733), rgb(0x356c2d)],
  rock: [rgb(0x8a7f6d), rgb(0x7d7363), rgb(0x978c79)],
  hillShade: rgb(0x5d6e3a),
  hillLight: rgb(0x8fa25a),
  peakLight: rgb(0xb7ad9a),
  peakMid: rgb(0x8f8472),
  peakDark: rgb(0x5f574b),
  peakOutline: rgb(0x453f36),
  snowCap: rgb(0xf3f5f6),
  snowShade: rgb(0xc9d3dc),
  river: rgb(0x3b78ad),
  riverLight: rgb(0x5d98c6),
  tree: { dark: rgb(0x2b4e1e), mid: rgb(0x3d6a29), light: rgb(0x5a903a), trunk: rgb(0x4a3520) },
  pine: { dark: rgb(0x1f3924), mid: rgb(0x2e4d33), light: rgb(0x416948), trunk: rgb(0x3b2a1b) },
  palm: { dark: rgb(0x2a5e25), mid: rgb(0x3b7f30), light: rgb(0x5aa244), trunk: rgb(0x6b4a2a) },
  shrub: rgb(0x6d7b3b),
  tuft: rgb(0x8a8a47),
  moss: rgb(0x6f7f5e),
};

// ───────────────────────── генерация ─────────────────────────

export type Progress = (label: string) => Promise<void>;

export async function generateMap(progress: Progress): Promise<MapData> {
  const W = ART_W;
  const H = ART_H;
  const N = W * H;

  // 1. Маска суши
  await progress('Очертания земель');
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  for (const poly of landData as number[][][]) {
    ctx.beginPath();
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i += 2) {
        const [x, y] = toArt(ring[i], ring[i + 1]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
    ctx.fill('evenodd');
  }
  // Озёра
  ctx.fillStyle = '#000';
  for (const l of LAKES) {
    const [x, y] = toArt(l.c[0], l.c[1]);
    ctx.beginPath();
    ctx.ellipse(x, y, l.rx * PX_PER_DEG_LON, l.ry * PX_PER_DEG_LAT, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const l of LONG_LAKES) {
    ctx.lineWidth = l.width * 2 * PX_PER_DEG_LAT;
    ctx.beginPath();
    l.pts.forEach(([lo, la], i) => {
      const [x, y] = toArt(lo, la);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  const maskData = ctx.getImageData(0, 0, W, H).data;
  const land = new Uint8Array(N);
  for (let i = 0; i < N; i++) land[i] = maskData[i * 4] > 127 ? 1 : 0;

  // 2. Расстояние до суши для воды и до воды для суши (в арт-пикселях, до 14)
  await progress('Моря и побережья');
  const distWater = bfsDistance(land, W, H, 1, 14); // для воды: расстояние до суши
  const distLand = bfsDistance(land, W, H, 0, 3); // для суши: расстояние до воды

  // 3. Высоты на сетке клеток
  await progress('Горные хребты');
  const elevGrid = new Float32Array((GRID_W + 1) * (GRID_H + 1));
  for (let gy = 0; gy <= GRID_H; gy++) {
    for (let gx = 0; gx <= GRID_W; gx++) {
      const lon = artLon(gx * CELL);
      const lat = artLat(gy * CELL);
      let e = 0;
      for (const r of RANGES) {
        const d = distToPolyline(lon, lat, r.pts);
        if (d < r.width * 1.6) {
          const n = fbm(lon * 0.9, lat * 0.9, 2, 7);
          const w = r.width * (0.75 + n * 0.6);
          const f = 1 - d / w;
          if (f > 0) e = Math.max(e, r.height * Math.pow(f, 0.6));
        }
      }
      elevGrid[gy * (GRID_W + 1) + gx] = e;
    }
  }
  const elevAt = (x: number, y: number): number => {
    const gx = x / CELL;
    const gy = y / CELL;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const i = y0 * (GRID_W + 1) + x0;
    const a = elevGrid[i];
    const b = elevGrid[i + 1];
    const c = elevGrid[i + GRID_W + 1];
    const d = elevGrid[i + GRID_W + 2];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };

  // 4. Биомы и базовая раскраска
  await progress('Леса, степи и пустыни');
  const biome = new Uint8Array(N);
  const elev = new Float32Array(N);
  const img = ctx.createImageData(W, H);
  const px = new Uint32Array(img.data.buffer);

  for (let y = 0; y < H; y++) {
    const lat = artLat(y);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const lon = artLon(x);
      const h = hash2(x, y, 3);

      if (!land[i]) {
        const d = distWater[i];
        const nd = d + (valueNoise(x * 0.08, y * 0.08, 11) - 0.5) * 4;
        let col: number;
        if (d <= 1) col = C.foam;
        else if (nd < 4) col = C.coast[h < 0.5 ? 0 : 1];
        else if (nd < 7.5) col = C.shallow[h < 0.5 ? 0 : 1];
        else if (nd < 12) col = C.mid[h < 0.5 ? 0 : 1];
        else col = C.deep[h < 0.5 ? 0 : 1];
        // редкие блики волн
        if (d > 3 && hash2(x >> 1, y, 5) < 0.006) col = C.wave;
        if (d > 3 && hash2((x - 1) >> 1, y, 5) < 0.006) col = C.wave;
        biome[i] = d > 2 * MAX_SAIL_DIST ? T.DEEP : T.SEA;
        px[i] = col;
        continue;
      }

      const n1 = fbm(lon * 0.35, lat * 0.35, 3, 1);
      const n2 = fbm(lon * 0.35 + 50, lat * 0.35 + 50, 3, 2);
      const fn = fbm(lon * 0.55, lat * 0.55, 3, 9);
      const edge = fbm(lon * 1.3, lat * 1.3, 3, 77);
      let b = biomeAt(lon, lat, n1, n2, fn, edge, h);

      // Горы поверх биома
      const e = elevAt(x, y) + (valueNoise(x * 0.15, y * 0.15, 21) - 0.5) * 0.12;
      elev[i] = e;
      if (e > 0.8) b = T.PEAK;
      else if (e > 0.5) b = T.MOUNTAIN;
      else if (e > 0.32 && b !== T.SNOW && b !== T.DESERT) b = T.HILLS;

      biome[i] = b;
      px[i] = landColor(b, x, y, lon, lat, h, e);

      // Пляж у воды
      if (distLand[i] === 1 && (b === T.DRY || b === T.DESERT || b === T.STEPPE || b === T.GRASS || b === T.FARM) && h < 0.8) {
        px[i] = C.beach[h < 0.4 ? 0 : 1];
      }
    }
  }

  // 5. Реки (+ плодородные берега в засушливых землях)
  await progress('Реки');
  for (const r of RIVERS) drawRiver(r.pts, r.width, W, H, land, biome, px);
  // Дельта Нила
  for (let y = 0; y < H; y++) {
    const lat = artLat(y);
    if (lat < 29.8 || lat > 31.6) continue;
    for (let x = 0; x < W; x++) {
      const lon = artLon(x);
      if (lon < 29.9 || lon > 32.4) continue;
      const i = y * W + x;
      const spread = (lat - 29.8) * 0.75;
      if (land[i] && Math.abs(lon - 31.1) < spread && biome[i] === T.DESERT) {
        biome[i] = T.FARM;
        px[i] = landColor(T.FARM, x, y, lon, lat, hash2(x, y, 3), 0);
      }
    }
  }

  // 6. Деревья, холмы, вершины (сверху вниз, чтобы ближние перекрывали дальние)
  await progress('Деревья и вершины');
  decorate(W, H, biome, elev, px);

  ctx.putImageData(img, 0, 0);

  // 7. Навигационная сетка
  await progress('Дороги и переправы');
  const terrain = new Uint8Array(GRID_W * GRID_H);
  const cost = new Float32Array(GRID_W * GRID_H);
  for (let cy = 0; cy < GRID_H; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      // Клетка — сушa, если суши в ней хотя бы половина; тип — по самому частому биому суши.
      const counts = new Map<number, number>();
      let landCount = 0;
      let minWaterDist = 99;
      for (let yy = 0; yy < CELL; yy++) {
        for (let xx = 0; xx < CELL; xx++) {
          const i = (cy * CELL + yy) * W + cx * CELL + xx;
          if (land[i]) {
            landCount++;
            counts.set(biome[i], (counts.get(biome[i]) ?? 0) + 1);
          } else {
            minWaterDist = Math.min(minWaterDist, distWater[i]);
          }
        }
      }
      let t: number;
      if (landCount >= (CELL * CELL) / 2) {
        let best = T.GRASS as number;
        let bestN = -1;
        for (const [k, v] of counts) {
          // Пики «перевешивают», чтобы хребты не были дырявыми.
          const w = k === T.PEAK ? v * 1.6 : v;
          if (w > bestN) {
            bestN = w;
            best = k;
          }
        }
        t = best;
      } else {
        t = minWaterDist <= MAX_SAIL_DIST * CELL ? T.SEA : T.DEEP;
      }
      terrain[cy * GRID_W + cx] = t;
      cost[cy * GRID_W + cx] = TERRAIN_COST[t];
    }
  }

  return { canvas, terrain, cost };
}

function landColor(b: number, x: number, y: number, lon: number, lat: number, h: number, e: number): number {
  const n = valueNoise(x * 0.18, y * 0.18, 13);
  const pick = (arr: number[]) => (n < 0.33 ? arr[1] : n > 0.7 ? arr[2] ?? arr[0] : arr[0]);
  const dither = (arr: number[]) => (h < 0.12 ? arr[1] : h > 0.9 ? arr[2] ?? arr[0] : pick(arr));
  switch (b) {
    case T.GRASS:
      return h < 0.015 ? C.shrub : dither(C.grass);
    case T.FARM: {
      // Лоскуты полей
      const fx = Math.floor((x + valueNoise(y * 0.05, 1, 4) * 6) / 7);
      const fy = Math.floor((y + valueNoise(x * 0.05, 2, 4) * 6) / 5);
      const f = hash2(fx, fy, 31);
      const base = f < 0.33 ? C.farm[0] : f < 0.66 ? C.farm[1] : C.farm[2];
      return (y % 2 === 0 && f > 0.5 && h < 0.5) ? C.farm[2] : base;
    }
    case T.FOREST:
      return dither(C.forest);
    case T.TAIGA:
      return dither(C.taiga);
    case T.STEPPE:
      return h < 0.02 ? C.tuft : dither(C.steppe);
    case T.DRY:
      return h < 0.025 ? C.shrub : dither(C.dry);
    case T.DESERT: {
      const wave = Math.sin(x * 0.55 + y * 0.9 + valueNoise(x * 0.04, y * 0.04, 5) * 14);
      if (wave > 0.93) return C.dune;
      if (wave > 0.8) return C.duneLight;
      return dither(C.desert);
    }
    case T.TUNDRA:
      return h < 0.03 ? C.moss : dither(C.tundra);
    case T.SNOW:
      return dither(C.snow);
    case T.JUNGLE:
      return dither(C.jungle);
    case T.HILLS:
      return lat > 62 ? dither(C.tundra) : inDesert(lon, lat) ? dither(C.desert) : lat < 40 ? dither(C.dry) : dither(C.grass);
    case T.MOUNTAIN:
    case T.PEAK:
      if (e > 0.72 || lat > 64) return h < 0.5 ? C.snow[1] : C.snow[0];
      return dither(C.rock);
  }
  return C.grass[0];
}

/** Многоисточниковый BFS: расстояние от пикселей, где land != target, до ближайшего с land == target. */
function bfsDistance(land: Uint8Array, W: number, H: number, target: number, cap: number): Uint8Array {
  const N = W * H;
  const dist = new Uint8Array(N);
  let queue = new Int32Array(N);
  let qn = 0;
  for (let i = 0; i < N; i++) {
    if (land[i] === target) dist[i] = 0;
    else dist[i] = 255;
  }
  // Первый слой: соседи целевых пикселей
  for (let i = 0; i < N; i++) {
    if (land[i] === target) continue;
    const x = i % W;
    const y = (i / W) | 0;
    if ((x > 0 && land[i - 1] === target) || (x < W - 1 && land[i + 1] === target) || (y > 0 && land[i - W] === target) || (y < H - 1 && land[i + W] === target)) {
      dist[i] = 1;
      queue[qn++] = i;
    }
  }
  let next = new Int32Array(N);
  for (let d = 2; d <= cap && qn > 0; d++) {
    let nn = 0;
    for (let k = 0; k < qn; k++) {
      const i = queue[k];
      const x = i % W;
      if (x > 0 && dist[i - 1] === 255) { dist[i - 1] = d; next[nn++] = i - 1; }
      if (x < W - 1 && dist[i + 1] === 255) { dist[i + 1] = d; next[nn++] = i + 1; }
      if (i >= W && dist[i - W] === 255) { dist[i - W] = d; next[nn++] = i - W; }
      if (i < N - W && dist[i + W] === 255) { dist[i + W] = d; next[nn++] = i + W; }
    }
    const t = queue;
    queue = next;
    next = t;
    qn = nn;
  }
  return dist;
}

function drawRiver(pts: LonLat[], width: number, W: number, H: number, land: Uint8Array, biome: Uint8Array, px: Uint32Array) {
  // Сглаживание Чайкина + извилистость шумом
  let path = pts.map(([lo, la]) => toArt(lo, la));
  for (let k = 0; k < 3; k++) {
    const out: [number, number][] = [path[0]];
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, ay] = path[i];
      const [bx, by] = path[i + 1];
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out.push(path[path.length - 1]);
    path = out;
  }
  const total = path.length;
  for (let i = 0; i < total - 1; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    const w = i / total > 0.45 ? width : 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      let x = ax + (bx - ax) * t;
      let y = ay + (by - ay) * t;
      x += (valueNoise(x * 0.12, y * 0.12, 41) - 0.5) * 3;
      y += (valueNoise(x * 0.12 + 9, y * 0.12, 42) - 0.5) * 3;
      const ix = Math.round(x);
      const iy = Math.round(y);
      // Плодородные берега в засушливых землях
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const xx = ix + dx;
          const yy = iy + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (!land[j]) continue;
          if (biome[j] === T.DESERT || biome[j] === T.DRY || biome[j] === T.STEPPE) {
            if (dx * dx + dy * dy <= 9) {
              biome[j] = T.FARM;
              const h = hash2(xx, yy, 3);
              px[j] = h < 0.5 ? C.grass[0] : C.grass[1];
            }
          }
        }
      }
      for (let dy = 0; dy < w; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const xx = ix + dx;
          const yy = iy + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (!land[j]) continue;
          px[j] = w > 1 && dx === 0 && dy === 0 ? C.riverLight : C.river;
          if (biome[j] === T.FOREST || biome[j] === T.TAIGA || biome[j] === T.JUNGLE) biome[j] = T.GRASS;
        }
      }
    }
  }
}

function setPx(px: Uint32Array, W: number, H: number, x: number, y: number, c: number) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  px[y * W + x] = c;
}

function decorate(W: number, H: number, biome: Uint8Array, elev: Float32Array, px: Uint32Array) {
  // Вершины: кандидаты на разреженной решётке с дрожанием
  const peaks: { x: number; y: number; h: number; snow: boolean }[] = [];
  const STEP_P = 6;
  for (let gy = 0; gy < H; gy += STEP_P) {
    for (let gx = 0; gx < W; gx += STEP_P) {
      const x = gx + Math.floor(hash2(gx, gy, 51) * STEP_P);
      const y = gy + Math.floor(hash2(gx, gy, 52) * STEP_P);
      if (x >= W || y >= H) continue;
      const i = y * W + x;
      const b = biome[i];
      if (b === T.MOUNTAIN || b === T.PEAK) {
        const e = elev[i];
        const lat = artLat(y);
        peaks.push({ x, y, h: Math.round(4 + clamp(e, 0.5, 1) * 7 + hash2(x, y, 53) * 2), snow: e > 0.66 || lat > 60 });
      } else if (b === T.HILLS && hash2(x, y, 54) < 0.7) {
        // Холм: пологая «шапка»
        const cx = x;
        const cy = y;
        for (let dx = -3; dx <= 3; dx++) {
          const top = cy - (3 - Math.abs(dx) > 1 ? 2 : 1);
          setPx(px, W, H, cx + dx, top, dx < 0 ? C.hillLight : C.hillShade);
        }
        setPx(px, W, H, cx - 1, cy - 3, C.hillLight);
        setPx(px, W, H, cx, cy - 3, C.hillLight);
        setPx(px, W, H, cx + 1, cy - 3, C.hillShade);
      }
    }
  }

  // Деревья
  const STEP_T = 3;
  for (let gy = 0; gy < H; gy += STEP_T) {
    // вершины этой полосы рисуем перед деревьями полосы — порядок по y сохраняется приблизительно
    for (let gx = 0; gx < W; gx += STEP_T) {
      const x = gx + Math.floor(hash2(gx, gy, 61) * STEP_T);
      const y = gy + Math.floor(hash2(gx, gy, 62) * STEP_T);
      if (x >= W || y >= H) continue;
      const i = y * W + x;
      const b = biome[i];
      const r = hash2(x, y, 63);
      if (b === T.FOREST && r < 0.8) drawTree(px, W, H, x, y, C.tree, r);
      else if (b === T.TAIGA && r < 0.75) drawPine(px, W, H, x, y, C.pine);
      else if (b === T.JUNGLE && r < 0.8) drawTree(px, W, H, x, y, C.palm, r);
      else if (b === T.GRASS && r < 0.035) drawTree(px, W, H, x, y, C.tree, r);
      else if (b === T.DRY && r < 0.02) drawTree(px, W, H, x, y, C.tree, r);
    }
  }

  peaks.sort((a, b) => a.y - b.y);
  for (const p of peaks) drawPeak(px, W, H, p.x, p.y, p.h, p.snow);
}

type TreePal = { dark: number; mid: number; light: number; trunk: number };

function drawTree(px: Uint32Array, W: number, H: number, x: number, y: number, c: TreePal, r: number) {
  //  .LL.
  //  LMMD
  //  MMDD
  //  .DT.
  const big = r < 0.3;
  setPx(px, W, H, x, y, c.trunk);
  setPx(px, W, H, x - 1, y - 1, c.mid);
  setPx(px, W, H, x, y - 1, c.dark);
  setPx(px, W, H, x + 1, y - 1, c.dark);
  setPx(px, W, H, x - 1, y - 2, c.light);
  setPx(px, W, H, x, y - 2, c.mid);
  setPx(px, W, H, x + 1, y - 2, c.dark);
  setPx(px, W, H, x, y - 3, c.light);
  if (big) {
    setPx(px, W, H, x - 2, y - 2, c.mid);
    setPx(px, W, H, x + 2, y - 2, c.dark);
    setPx(px, W, H, x - 1, y - 3, c.light);
    setPx(px, W, H, x + 1, y - 3, c.mid);
  }
}

function drawPine(px: Uint32Array, W: number, H: number, x: number, y: number, c: TreePal) {
  setPx(px, W, H, x, y, c.trunk);
  setPx(px, W, H, x - 1, y - 1, c.mid);
  setPx(px, W, H, x, y - 1, c.dark);
  setPx(px, W, H, x + 1, y - 1, c.dark);
  setPx(px, W, H, x - 1, y - 2, c.light);
  setPx(px, W, H, x, y - 2, c.mid);
  setPx(px, W, H, x + 1, y - 2, c.dark);
  setPx(px, W, H, x, y - 3, c.mid);
  setPx(px, W, H, x, y - 4, c.light);
}

function drawPeak(px: Uint32Array, W: number, H: number, x: number, y: number, h: number, snow: boolean) {
  // Треугольник: левый склон освещён, правый в тени, снежная шапка сверху.
  for (let r = 0; r < h; r++) {
    const half = Math.floor((r * 1.1) / 1) ;
    const yy = y - h + 1 + r;
    for (let dx = -half; dx <= half; dx++) {
      const xx = x + dx;
      let c: number;
      const isSnow = snow && r < h * 0.45 + (dx % 2 === 0 ? 1 : 0);
      if (dx === -half || dx === half || r === h - 1) c = C.peakOutline;
      else if (dx < 0) c = isSnow ? C.snowCap : r > h * 0.7 && dx > -half + 1 ? C.peakMid : C.peakLight;
      else if (dx === 0) c = isSnow ? C.snowCap : C.peakMid;
      else c = isSnow ? C.snowShade : C.peakDark;
      setPx(px, W, H, xx, yy, c);
    }
  }
}

import landData from '../data/land.json';
import { ART_H, ART_W, CELL, GRID_H, GRID_W, LAT_MAX, LON_FACTOR, LON_MIN, PX_PER_DEG_LAT, PX_PER_DEG_LON } from '../config';
import { clamp, fbm, hash2, valueNoise } from '../util/rng';
import { LAKES, LONG_LAKES, RANGES, RIVERS, type LonLat } from './geodata';
import { tr } from '../i18n';

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
  [T.DEEP]: tr('Открытое море'),
  [T.SEA]: tr('Прибрежные воды'),
  [T.GRASS]: tr('Луга'),
  [T.FOREST]: tr('Лес'),
  [T.TAIGA]: tr('Тайга'),
  [T.STEPPE]: tr('Степь'),
  [T.DRY]: tr('Сухие земли'),
  [T.DESERT]: tr('Пустыня'),
  [T.TUNDRA]: tr('Тундра'),
  [T.SNOW]: tr('Снега'),
  [T.JUNGLE]: tr('Джунгли'),
  [T.FARM]: tr('Поля'),
  [T.HILLS]: tr('Холмы'),
  [T.MOUNTAIN]: tr('Горы'),
  [T.PEAK]: tr('Непроходимые вершины'),
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
  /** Готовая картинка карты (ART_W × ART_H арт-пикселей, в MAP_RES раз чётче). */
  canvas: HTMLCanvasElement;
  /** Тип местности каждой клетки GRID_W × GRID_H. */
  terrain: Uint8Array;
  /** Цена прохода клетки. */
  cost: Float32Array;
}

// ───────────────────────── вспомогательное ─────────────────────────

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

/** Цвета — 0xRRGGBB. Внутри тройки: [основной, темнее, светлее]. */
const C = {
  deep: 0x19304f,
  mid: 0x234569,
  shallow: 0x2e5e8a,
  coast: 0x4585b0,
  foam: 0xa6d0e6,
  beach: 0xd8c890,
  grass: [0x6b9a3f, 0x5c8a36, 0x7eaa4a],
  farm: [0x8ba84a, 0x9fb152, 0x7c9a40, 0xc9b35a],
  forest: [0x4d7b32, 0x41702b, 0x588638],
  taiga: [0x4b6a44, 0x3f5e3a, 0x55744d],
  steppe: [0xa6a55b, 0x979651, 0xb6b36a],
  dry: [0x9ca155, 0x8c924a, 0xabaa62],
  desert: [0xdcb56d, 0xd0a860, 0xe6c47f],
  dune: 0xc0954f,
  duneLight: 0xf0d696,
  tundra: [0x8d9a82, 0x7f8c75, 0x9ba790],
  snow: [0xe9eef2, 0xd8e0e8, 0xf6f8fa],
  jungle: [0x3d7733, 0x336a2c, 0x468439],
  rock: [0x8a7f6d, 0x786e5f, 0x9a8f7c],
  river: 0x3b78ad,
  riverDark: 0x2a5b88,
  riverLight: 0x74aad2,
};

function mixRGB(a: number, b: number, t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * k);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * k);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * k);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

function css(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

/** Плавный переход по тройке цветов: n=0 — темнее, 0.5 — основной, 1 — светлее. */
function tri(arr: number[], n: number): number {
  return n < 0.5 ? mixRGB(arr[1], arr[0], n * 2) : mixRGB(arr[0], arr[2], (n - 0.5) * 2);
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Чёткость готовой картинки карты: точек на арт-пиксель. */
export const MAP_RES = 2;

/** Плитки карты: сетка кусков не шире и не выше 2048 точек. */
export const MAP_TILES = { nx: 0, ny: 0, tw: 0, th: 0 };

export function mapTiles(src: HTMLCanvasElement): { key: string; canvas: HTMLCanvasElement }[] {
  const nx = Math.ceil(src.width / 2048);
  const ny = Math.ceil(src.height / 2048);
  const tw = Math.ceil(src.width / nx);
  const th = Math.ceil(src.height / ny);
  Object.assign(MAP_TILES, { nx, ny, tw, th });
  const out: { key: string; canvas: HTMLCanvasElement }[] = [];
  for (let ty = 0; ty < ny; ty++) {
    for (let tx = 0; tx < nx; tx++) {
      const c = document.createElement('canvas');
      c.width = Math.min(tw, src.width - tx * tw);
      c.height = Math.min(th, src.height - ty * th);
      c.getContext('2d')!.drawImage(src, tx * tw, ty * th, c.width, c.height, 0, 0, c.width, c.height);
      out.push({ key: `map_${tx}_${ty}`, canvas: c });
    }
  }
  return out;
}

// ───────────────────────── генерация ─────────────────────────

export type Progress = (label: string) => Promise<void>;

type Deco = { kind: 'tree' | 'pine' | 'palm' | 'hill' | 'peak'; x: number; y: number; r: number; h?: number; snow?: boolean };
type RiverLine = { pts: [number, number][]; w: number[] };

export async function generateMap(progress: Progress): Promise<MapData> {
  const W = ART_W;
  const H = ART_H;
  const N = W * H;

  // 1. Маска суши
  await progress(tr('Очертания земель'));
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
  await progress(tr('Моря и побережья'));
  const distWater = bfsDistance(land, W, H, 1, 14); // для воды: расстояние до суши
  const distLand = bfsDistance(land, W, H, 0, 3); // для суши: расстояние до воды

  // 3. Высоты на сетке клеток
  await progress(tr('Горные хребты'));
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

  // 4. Биомы и плавная раскраска (без пиксельного шума: цвет меняется крупными мягкими пятнами)
  await progress(tr('Леса, степи и пустыни'));
  const biome = new Uint8Array(N);
  const elev = new Float32Array(N);
  const col = new Int32Array(N);
  const waves: [number, number][] = [];

  for (let y = 0; y < H; y++) {
    const lat = artLat(y);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const lon = artLon(x);
      const h = hash2(x, y, 3);

      if (!land[i]) {
        const d = distWater[i];
        const nd = d + (valueNoise(x * 0.06, y * 0.06, 11) - 0.5) * 4;
        let c: number;
        if (nd < 3.5) c = mixRGB(C.coast, C.shallow, nd / 3.5);
        else if (nd < 8) c = mixRGB(C.shallow, C.mid, (nd - 3.5) / 4.5);
        else c = mixRGB(C.mid, C.deep, (nd - 8) / 6);
        c = mixRGB(c, 0x000000, (valueNoise(x * 0.02, y * 0.02, 12) - 0.5) * 0.12);
        if (d <= 1) c = mixRGB(c, C.foam, 0.6);
        else if (d === 2) c = mixRGB(c, C.foam, 0.2);
        if (d > 4 && h < 0.0025) waves.push([x, y]);
        biome[i] = d > 2 * MAX_SAIL_DIST ? T.DEEP : T.SEA;
        col[i] = c;
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
      let c = landColor(b, x, y, lon, lat, e);
      // Пляж у воды
      if (distLand[i] <= 2 && (b === T.DRY || b === T.DESERT || b === T.STEPPE || b === T.GRASS || b === T.FARM)) c = mixRGB(c, C.beach, distLand[i] === 1 ? 0.75 : 0.35);
      col[i] = c;
    }
  }

  // Светотень рельефа: свет с северо-запада, склоны гор и холмов объёмные
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      if (!land[i]) continue;
      const e = elev[i];
      if (e < 0.08) continue;
      const g = elev[i - 2 - 2 * W] - elev[i + 2 + 2 * W];
      const k = clamp(g * 6, -0.45, 0.45) * Math.min(1, e * 3);
      col[i] = k > 0 ? mixRGB(col[i], 0xfff2d8, k) : mixRGB(col[i], 0x2a2638, -k * 0.9);
    }
  }

  // 5. Реки (+ плодородные берега в засушливых землях)
  await progress(tr('Реки'));
  const rivers: RiverLine[] = [];
  for (const r of RIVERS) rivers.push(traceRiver(r.pts, r.width, W, H, land, biome, col));
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
        col[i] = landColor(T.FARM, x, y, lon, lat, 0);
      }
    }
  }

  // 6. Деревья, холмы, вершины
  await progress(tr('Деревья и вершины'));
  const decos = decorate(W, H, biome, elev);

  const img = ctx.createImageData(W, H);
  const px = new Uint32Array(img.data.buffer);
  for (let i = 0; i < N; i++) {
    const c = col[i];
    px[i] = (0xff000000 | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255)) >>> 0;
  }
  ctx.putImageData(img, 0, 0);
  const art = paintMap(canvas, rivers, decos, waves);

  // 7. Навигационная сетка
  await progress(tr('Дороги и переправы'));
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

  return { canvas: art, terrain, cost };
}

function landColor(b: number, x: number, y: number, lon: number, lat: number, e: number): number {
  // Крупные мягкие пятна и едва заметное зерно
  const n = fbm(x * 0.03, y * 0.03, 2, 13);
  const grain = (valueNoise(x * 0.3, y * 0.3, 14) - 0.5) * 0.1;
  const soft = (arr: number[]) => mixRGB(tri(arr, n), grain > 0 ? 0xffffff : 0x000000, Math.abs(grain));
  switch (b) {
    case T.GRASS:
      return soft(C.grass);
    case T.FARM: {
      // Лоскуты полей
      const fx = Math.floor((x + valueNoise(y * 0.05, 1, 4) * 6) / 7);
      const fy = Math.floor((y + valueNoise(x * 0.05, 2, 4) * 6) / 5);
      const f = hash2(fx, fy, 31);
      return mixRGB(f < 0.3 ? C.farm[0] : f < 0.55 ? C.farm[1] : f < 0.8 ? C.farm[2] : C.farm[3], 0x000000, grain * 0.6);
    }
    case T.FOREST:
      return soft(C.forest);
    case T.TAIGA:
      return soft(C.taiga);
    case T.STEPPE:
      return soft(C.steppe);
    case T.DRY:
      return soft(C.dry);
    case T.DESERT: {
      const wave = Math.sin(x * 0.55 + y * 0.9 + valueNoise(x * 0.04, y * 0.04, 5) * 14);
      const base = soft(C.desert);
      return wave > 0 ? mixRGB(base, C.duneLight, smoothstep(0.55, 1, wave) * 0.55) : mixRGB(base, C.dune, smoothstep(-0.6, -1, wave) * 0.45);
    }
    case T.TUNDRA:
      return soft(C.tundra);
    case T.SNOW:
      return soft(C.snow);
    case T.JUNGLE:
      return soft(C.jungle);
    case T.HILLS:
      return lat > 62 ? soft(C.tundra) : inDesert(lon, lat) ? soft(C.desert) : lat < 40 ? soft(C.dry) : soft(C.grass);
    case T.MOUNTAIN:
    case T.PEAK: {
      const rock = soft(C.rock);
      const snowK = lat > 64 ? 1 : smoothstep(0.66, 0.78, e);
      return mixRGB(rock, tri(C.snow, n), snowK);
    }
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

/** Путь реки: сглаженная извилистая линия; попутно — плодородные берега в засушливых землях. */
function traceRiver(pts: LonLat[], width: number, W: number, H: number, land: Uint8Array, biome: Uint8Array, col: Int32Array): RiverLine {
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
  const line: RiverLine = { pts: [], w: [] };
  const total = path.length;
  for (let i = 0; i < total - 1; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    // Исток тоньше, к устью река расширяется
    const w = 0.8 + Math.min(1, i / (total * 0.45)) * (width - 0.8);
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      let x = ax + (bx - ax) * t;
      let y = ay + (by - ay) * t;
      x += (valueNoise(x * 0.12, y * 0.12, 41) - 0.5) * 3;
      y += (valueNoise(x * 0.12 + 9, y * 0.12, 42) - 0.5) * 3;
      line.pts.push([x, y]);
      line.w.push(w);
      const ix = Math.round(x);
      const iy = Math.round(y);
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const xx = ix + dx;
          const yy = iy + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (!land[j]) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 <= 9 && (biome[j] === T.DESERT || biome[j] === T.DRY || biome[j] === T.STEPPE)) {
            biome[j] = T.FARM;
            col[j] = mixRGB(col[j], tri(C.grass, hash2(xx >> 2, yy >> 2, 3)), 0.85);
          }
          // Лес не растёт в самом русле
          if (d2 <= 1 && (biome[j] === T.FOREST || biome[j] === T.TAIGA || biome[j] === T.JUNGLE)) biome[j] = T.GRASS;
        }
      }
    }
  }
  return line;
}

function decorate(W: number, H: number, biome: Uint8Array, elev: Float32Array): Deco[] {
  const out: Deco[] = [];
  // Вершины и холмы: кандидаты на разреженной решётке с дрожанием
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
        out.push({ kind: 'peak', x, y, r: hash2(x, y, 55), h: 4 + clamp(e, 0.5, 1) * 7 + hash2(x, y, 53) * 2, snow: e > 0.66 || lat > 60 });
      } else if (b === T.HILLS && hash2(x, y, 54) < 0.7) out.push({ kind: 'hill', x, y, r: hash2(x, y, 56) });
    }
  }
  // Деревья
  const STEP_T = 3;
  for (let gy = 0; gy < H; gy += STEP_T) {
    for (let gx = 0; gx < W; gx += STEP_T) {
      const x = gx + Math.floor(hash2(gx, gy, 61) * STEP_T);
      const y = gy + Math.floor(hash2(gx, gy, 62) * STEP_T);
      if (x >= W || y >= H) continue;
      const b = biome[y * W + x];
      const r = hash2(x, y, 63);
      if (b === T.FOREST && r < 0.8) out.push({ kind: 'tree', x, y, r });
      else if (b === T.TAIGA && r < 0.75) out.push({ kind: 'pine', x, y, r });
      else if (b === T.JUNGLE && r < 0.8) out.push({ kind: 'palm', x, y, r });
      else if (b === T.GRASS && r < 0.035) out.push({ kind: 'tree', x, y, r });
      else if (b === T.DRY && r < 0.02) out.push({ kind: 'tree', x, y, r });
    }
  }
  // Ближние (ниже на карте) перекрывают дальние
  out.sort((a, b) => a.y - b.y);
  return out;
}

// ───────────────────────── рисование ─────────────────────────

/** Готовые значки деревьев (рисуются один раз и штампуются). */
function treeStamp(kind: 'tree' | 'pine' | 'palm', big: boolean, R: number): HTMLCanvasElement {
  const S = 8;
  const c = document.createElement('canvas');
  c.width = S * R;
  c.height = S * R;
  const g = c.getContext('2d')!;
  g.scale(R, R);
  const cx = S / 2;
  const base = S - 1.2;
  // Тень на земле
  g.fillStyle = 'rgba(20,24,10,0.28)';
  g.beginPath();
  g.ellipse(cx + 0.9, base + 0.3, big ? 2.1 : 1.6, 0.55, 0, 0, Math.PI * 2);
  g.fill();
  if (kind === 'pine') {
    g.fillStyle = '#3b2a1b';
    g.fillRect(cx - 0.3, base - 1, 0.6, 1.2);
    const tiers: [number, number, number][] = [[base - 0.6, 2, 2.6], [base - 2, 1.5, 2.4], [base - 3.2, 1, 2.1]];
    for (const [yb, hw, hh] of tiers) {
      g.beginPath();
      g.moveTo(cx - hw, yb);
      g.lineTo(cx, yb - hh);
      g.lineTo(cx + hw, yb);
      g.closePath();
      const gr = g.createLinearGradient(cx - hw, 0, cx + hw, 0);
      gr.addColorStop(0, '#4f7a55');
      gr.addColorStop(0.45, '#2e4d33');
      gr.addColorStop(1, '#1b3020');
      g.fillStyle = gr;
      g.fill();
      g.lineWidth = 0.3;
      g.strokeStyle = '#132016';
      g.stroke();
    }
    return c;
  }
  if (kind === 'palm') {
    g.strokeStyle = '#6b4a2a';
    g.lineWidth = 0.55;
    g.beginPath();
    g.moveTo(cx, base);
    g.quadraticCurveTo(cx + 0.6, base - 1.8, cx + 0.3, base - 3.4);
    g.stroke();
    for (const [dx, dy] of [[-2, 0.5], [2, 0.6], [-1.4, -0.9], [1.5, -0.8], [0.2, -1.4]]) {
      g.strokeStyle = '#1e4a1a';
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(cx + 0.3, base - 3.4);
      g.quadraticCurveTo(cx + 0.3 + dx * 0.5, base - 3.9 + dy * 0.3, cx + 0.3 + dx, base - 3.4 + dy + 0.6);
      g.stroke();
      g.strokeStyle = '#5aa244';
      g.lineWidth = 0.5;
      g.stroke();
    }
    return c;
  }
  const r = big ? 2 : 1.55;
  const cy = base - r - 0.9;
  g.fillStyle = '#4a3520';
  g.fillRect(cx - 0.3, cy + r * 0.5, 0.6, base - cy - r * 0.5);
  g.fillStyle = '#1d3514';
  g.beginPath();
  g.arc(cx, cy, r + 0.3, 0, Math.PI * 2);
  g.fill();
  const gr = g.createRadialGradient(cx - r * 0.4, cy - r * 0.45, 0, cx - r * 0.1, cy - r * 0.1, r * 1.2);
  gr.addColorStop(0, '#7cae4c');
  gr.addColorStop(0.5, '#3d6a29');
  gr.addColorStop(1, '#264a1b');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  if (big) {
    g.fillStyle = 'rgba(40,74,28,0.8)';
    g.beginPath();
    g.arc(cx + r * 0.5, cy + r * 0.3, r * 0.55, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/** Картинка карты в MAP_RES раз чётче арт-пикселей: цвет — плавно растянутый, поверх — реки, волны, холмы, деревья и вершины. */
function paintMap(base: HTMLCanvasElement, rivers: RiverLine[], decos: Deco[], waves: [number, number][]): HTMLCanvasElement {
  const R = MAP_RES;
  const W = base.width;
  const H = base.height;
  const out = document.createElement('canvas');
  out.width = W * R;
  out.height = H * R;
  const g = out.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(base, 0, 0, W * R, H * R);
  g.scale(R, R);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // Блики волн
  g.strokeStyle = 'rgba(170,210,235,0.45)';
  g.lineWidth = 0.45;
  for (const [x, y] of waves) {
    g.beginPath();
    g.moveTo(x - 1.4, y + 0.3);
    g.quadraticCurveTo(x - 0.7, y - 0.5, x, y + 0.2);
    g.quadraticCurveTo(x + 0.7, y - 0.5, x + 1.4, y + 0.3);
    g.stroke();
  }
  // Реки: тёмный берег, вода, светлая середина
  for (const pass of [0, 1, 2]) {
    g.strokeStyle = css(pass === 0 ? C.riverDark : pass === 1 ? C.river : C.riverLight);
    g.globalAlpha = pass === 2 ? 0.55 : 1;
    for (const r of rivers) {
      for (let i = 0; i < r.pts.length - 1; i += 1) {
        const w = r.w[i];
        if (pass === 2 && w < 1.5) continue;
        g.lineWidth = pass === 0 ? w + 0.6 : pass === 1 ? w : w * 0.3;
        g.beginPath();
        g.moveTo(r.pts[i][0] + 0.5, r.pts[i][1] + 0.5);
        g.lineTo(r.pts[i + 1][0] + 0.5, r.pts[i + 1][1] + 0.5);
        g.stroke();
      }
    }
  }
  g.globalAlpha = 1;
  // Значки деревьев
  const stamps = {
    tree: [treeStamp('tree', false, R), treeStamp('tree', true, R)],
    pine: [treeStamp('pine', false, R), treeStamp('pine', true, R)],
    palm: [treeStamp('palm', false, R), treeStamp('palm', true, R)],
  };
  for (const d of decos) {
    if (d.kind === 'tree' || d.kind === 'pine' || d.kind === 'palm') {
      const s = stamps[d.kind][d.r < 0.3 ? 1 : 0];
      g.drawImage(s, d.x + 0.5 - 4, d.y + 1.2 - 8 + 0.5, 8, 8);
    } else if (d.kind === 'hill') {
      const x = d.x + 0.5;
      const y = d.y + 0.5;
      const w = 3.4 + d.r * 1.2;
      g.beginPath();
      g.moveTo(x - w, y);
      g.quadraticCurveTo(x - w * 0.5, y - 3.6, x, y - 3.4);
      g.quadraticCurveTo(x + w * 0.5, y - 3.6, x + w, y);
      g.closePath();
      const gr = g.createLinearGradient(x - w, 0, x + w, 0);
      gr.addColorStop(0, 'rgba(210,220,150,0.55)');
      gr.addColorStop(0.5, 'rgba(120,140,70,0.15)');
      gr.addColorStop(1, 'rgba(40,50,20,0.45)');
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = 'rgba(60,70,30,0.55)';
      g.lineWidth = 0.35;
      g.beginPath();
      g.moveTo(x - w, y);
      g.quadraticCurveTo(x - w * 0.5, y - 3.6, x, y - 3.4);
      g.quadraticCurveTo(x + w * 0.5, y - 3.6, x + w, y);
      g.stroke();
    } else {
      paintPeak(g, d.x + 0.5, d.y + 1, d.h!, d.snow!, d.r);
    }
  }
  return out;
}

/** Вершина: освещённый левый склон, теневой правый, снежная шапка с рваным краем, тонкий контур. */
function paintPeak(g: CanvasRenderingContext2D, x: number, y: number, h: number, snow: boolean, r: number) {
  const hw = h * 0.95;
  const ax = x + (r - 0.5) * h * 0.25;
  const ay = y - h;
  const mid = x + (r - 0.5) * h * 0.2 + h * 0.08;
  // Левый склон
  g.beginPath();
  g.moveTo(x - hw, y);
  g.lineTo(ax, ay);
  g.lineTo(mid, y);
  g.closePath();
  const lg = g.createLinearGradient(x - hw, y, ax, ay);
  lg.addColorStop(0, '#978b77');
  lg.addColorStop(1, '#c2b8a4');
  g.fillStyle = lg;
  g.fill();
  // Правый склон
  g.beginPath();
  g.moveTo(mid, y);
  g.lineTo(ax, ay);
  g.lineTo(x + hw, y);
  g.closePath();
  const rg = g.createLinearGradient(ax, ay, x + hw, y);
  rg.addColorStop(0, '#6f6556');
  rg.addColorStop(1, '#4f473d');
  g.fillStyle = rg;
  g.fill();
  if (snow) {
    const k = 0.44;
    const lx = ax + (x - hw - ax) * k;
    const ly = ay + (y - ay) * k;
    const rx = ax + (x + hw - ax) * k;
    const ry = ly;
    const mx = ax + (mid - ax) * k;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(lx, ly);
    g.lineTo(lx + (mx - lx) * 0.35, ly - h * 0.08);
    g.lineTo(lx + (mx - lx) * 0.7, ly + h * 0.05);
    g.lineTo(mx, ly - h * 0.04);
    g.closePath();
    g.fillStyle = '#f4f6f8';
    g.fill();
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(mx, ly - h * 0.04);
    g.lineTo(mx + (rx - mx) * 0.4, ly + h * 0.06);
    g.lineTo(mx + (rx - mx) * 0.75, ly - h * 0.05);
    g.lineTo(rx, ry);
    g.closePath();
    g.fillStyle = '#c3cfdb';
    g.fill();
  }
  // Контур
  g.beginPath();
  g.moveTo(x - hw, y);
  g.lineTo(ax, ay);
  g.lineTo(x + hw, y);
  g.strokeStyle = 'rgba(55,48,40,0.85)';
  g.lineWidth = 0.35;
  g.stroke();
}

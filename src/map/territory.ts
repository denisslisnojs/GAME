import { ART_H, ART_W, CELL, GRID_H, GRID_W } from '../config';
import { FACTIONS, FACTION_IDS, type FactionId } from '../data/factions';
import { isWaterCell, world, type Settlement } from '../game/world';

const MAX_REACH = 42;

let regions: Int16Array | null = null;
let forts: Settlement[] = [];

/** Область каждой крепости (индекс в forts или -1). Не зависит от владельцев — считается один раз. */
function computeRegions(): Int16Array {
  if (regions) return regions;
  forts = world.settlements.filter((s) => s.type !== 'village');
  const N = GRID_W * GRID_H;
  const region = new Int16Array(N).fill(-1);
  const dist = new Float32Array(N).fill(Infinity);
  // Простая очередь с приоритетом на массиве корзин (цены небольшие)
  const buckets: number[][] = [];
  const push = (i: number, d: number) => {
    const b = Math.floor(d * 4);
    (buckets[b] ??= []).push(i);
  };
  forts.forEach((s, k) => {
    const i = s.cy * GRID_W + s.cx;
    dist[i] = 0;
    region[i] = k;
    push(i, 0);
  });
  const cost = world.map.cost;
  for (let b = 0; b < buckets.length; b++) {
    const list = buckets[b];
    if (!list) continue;
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      const d0 = dist[i];
      if (Math.floor(d0 * 4) !== b) continue;
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      for (const [dx, dy, len] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        const ni = ny * GRID_W + nx;
        let c = cost[ni];
        if (!isFinite(c)) c = 6; // горные пики тоже делятся, но «дорого»
        if (isWaterCell(ni)) c = 5;
        const d = d0 + len * c;
        if (d < dist[ni] && d < MAX_REACH) {
          dist[ni] = d;
          region[ni] = region[i];
          push(ni, d);
        }
      }
    }
  }
  regions = region;
  return region;
}

/** Владелец каждой клетки: индекс в FACTION_IDS или -1. */
export function computeTerritory(ownerOf: (s: Settlement) => FactionId): Int8Array {
  const region = computeRegions();
  const fortOwner = forts.map((s) => FACTION_IDS.indexOf(ownerOf(s)));
  const owner = new Int8Array(region.length);
  for (let i = 0; i < region.length; i++) owner[i] = region[i] < 0 ? -1 : fortOwner[region[i]];
  return owner;
}

const lastOwner = new WeakMap<HTMLCanvasElement, Int8Array>();

/** Картинка ART_W × ART_H: заливка территорий и двухцветные границы. */
export function drawTerritory(owner: Int8Array, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  const cv = canvas ?? document.createElement('canvas');
  // Перерисовываем только прямоугольник вокруг изменившихся клеток
  let x0 = 0;
  let y0 = 0;
  let x1 = GRID_W - 1;
  let y1 = GRID_H - 1;
  const prev = canvas ? lastOwner.get(canvas) : undefined;
  if (prev) {
    x0 = GRID_W;
    y0 = GRID_H;
    x1 = -1;
    y1 = -1;
    for (let i = 0; i < owner.length; i++) {
      if (owner[i] === prev[i]) continue;
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (x1 < 0) return cv;
    x0 = Math.max(0, x0 - 1);
    y0 = Math.max(0, y0 - 1);
    x1 = Math.min(GRID_W - 1, x1 + 1);
    y1 = Math.min(GRID_H - 1, y1 + 1);
  } else {
    cv.width = ART_W;
    cv.height = ART_H;
  }
  lastOwner.set(cv, owner.slice());
  const ctx = cv.getContext('2d')!;
  const RX = x0 * CELL;
  const RY = y0 * CELL;
  const RW = (x1 - x0 + 1) * CELL;
  const RH = (y1 - y0 + 1) * CELL;
  const img = ctx.createImageData(RW, RH);
  const px = new Uint32Array(img.data.buffer);
  const fill = FACTION_IDS.map((id) => rgba(FACTIONS[id].color, 40));
  const border = FACTION_IDS.map((id) => rgba(darken(FACTIONS[id].color), 215));
  const landOwner = (cx: number, cy: number): number => {
    if (cx < 0 || cy < 0 || cx >= GRID_W || cy >= GRID_H) return -2;
    const i = cy * GRID_W + cx;
    return isWaterCell(i) ? -2 : owner[i];
  };
  // Владелец в каждой точке — «голосованием» четырёх ближайших клеток с весами по расстоянию:
  // границы идут плавными диагоналями, а не лесенкой из клеток
  const PW = RW + 2;
  const PH = RH + 2;
  const smooth = new Int8Array(PW * PH);
  const votes = new Float32Array(FACTION_IDS.length + 2);
  for (let yy = 0; yy < PH; yy++) {
    const y = RY + yy - 1;
    const v = (y + 0.5) / CELL - 0.5;
    const cy = Math.floor(v);
    const fy = v - cy;
    for (let xx = 0; xx < PW; xx++) {
      const x = RX + xx - 1;
      const u = (x + 0.5) / CELL - 0.5;
      const cx = Math.floor(u);
      const fx = u - cx;
      votes.fill(0);
      votes[landOwner(cx, cy) + 2] += (1 - fx) * (1 - fy);
      votes[landOwner(cx + 1, cy) + 2] += fx * (1 - fy);
      votes[landOwner(cx, cy + 1) + 2] += (1 - fx) * fy;
      votes[landOwner(cx + 1, cy + 1) + 2] += fx * fy;
      let best = 0;
      for (let k = 1; k < votes.length; k++) if (votes[k] > votes[best]) best = k;
      smooth[yy * PW + xx] = best - 2;
    }
  }
  for (let yy = 1; yy < PH - 1; yy++) {
    for (let xx = 1; xx < PW - 1; xx++) {
      const o = smooth[yy * PW + xx];
      if (o < 0) continue;
      const diff = (n: number) => n !== -2 && n !== o;
      const isBorder = diff(smooth[yy * PW + xx - 1]) || diff(smooth[yy * PW + xx + 1]) || diff(smooth[(yy - 1) * PW + xx]) || diff(smooth[(yy + 1) * PW + xx]);
      px[(yy - 1) * RW + (xx - 1)] = isBorder ? border[o] : fill[o];
    }
  }
  ctx.putImageData(img, RX, RY);
  return cv;
}

function rgba(hex: number, a: number): number {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

function darken(hex: number): number {
  const r = Math.round(((hex >> 16) & 255) * 0.75);
  const g = Math.round(((hex >> 8) & 255) * 0.75);
  const b = Math.round((hex & 255) * 0.75);
  return (r << 16) | (g << 8) | b;
}

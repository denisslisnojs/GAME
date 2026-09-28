import { ART_H, ART_W, CELL, GRID_H, GRID_W } from '../config';
import { FACTIONS, FACTION_IDS, type FactionId } from '../data/factions';
import { isWaterCell, world, type Settlement } from '../game/world';

const MAX_REACH = 42;

/** Владелец каждой клетки: индекс в FACTION_IDS или -1. */
export function computeTerritory(ownerOf: (s: Settlement) => FactionId): Int8Array {
  const N = GRID_W * GRID_H;
  const owner = new Int8Array(N).fill(-1);
  const dist = new Float32Array(N).fill(Infinity);
  // Простая очередь с приоритетом на массиве корзин (цены небольшие)
  const buckets: number[][] = [];
  const push = (i: number, d: number) => {
    const b = Math.floor(d * 4);
    (buckets[b] ??= []).push(i);
  };
  for (const s of world.settlements) {
    if (s.type === 'village') continue;
    const i = s.cy * GRID_W + s.cx;
    dist[i] = 0;
    owner[i] = FACTION_IDS.indexOf(ownerOf(s));
    push(i, 0);
  }
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
          owner[ni] = owner[i];
          push(ni, d);
        }
      }
    }
  }
  return owner;
}

/** Картинка ART_W × ART_H: заливка территорий и двухцветные границы. */
export function drawTerritory(owner: Int8Array, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  const cv = canvas ?? document.createElement('canvas');
  cv.width = ART_W;
  cv.height = ART_H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(ART_W, ART_H);
  const px = new Uint32Array(img.data.buffer);
  const fill = FACTION_IDS.map((id) => rgba(FACTIONS[id].color, 40));
  const border = FACTION_IDS.map((id) => rgba(darken(FACTIONS[id].color), 215));
  const landOwner = (cx: number, cy: number): number => {
    if (cx < 0 || cy < 0 || cx >= GRID_W || cy >= GRID_H) return -2;
    const i = cy * GRID_W + cx;
    return isWaterCell(i) ? -2 : owner[i];
  };
  for (let y = 0; y < ART_H; y++) {
    const cy = (y / CELL) | 0;
    const ey = y % CELL;
    for (let x = 0; x < ART_W; x++) {
      const cx = (x / CELL) | 0;
      const o = landOwner(cx, cy);
      if (o < 0) continue;
      const ex = x % CELL;
      let isBorder = false;
      if (ex === 0) { const n = landOwner(cx - 1, cy); if (n !== -2 && n !== o) isBorder = true; }
      if (ex === CELL - 1) { const n = landOwner(cx + 1, cy); if (n !== -2 && n !== o) isBorder = true; }
      if (ey === 0) { const n = landOwner(cx, cy - 1); if (n !== -2 && n !== o) isBorder = true; }
      if (ey === CELL - 1) { const n = landOwner(cx, cy + 1); if (n !== -2 && n !== o) isBorder = true; }
      px[y * ART_W + x] = isBorder ? border[o] : fill[o];
    }
  }
  ctx.putImageData(img, 0, 0);
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

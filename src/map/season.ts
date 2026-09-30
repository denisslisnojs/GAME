// Зимний покров карты: снег по широте, гуще в горах. Рисуется один раз в арт-пикселях.

import { ART_H, ART_W, CELL, GRID_W, LAT_MAX, PX_PER_DEG_LAT } from '../config';
import { world } from '../game/world';
import { T } from './terrain';

export function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Плавный шум: значения в узлах решётки, билинейно между ними. */
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) => hash01(a * 374761393 + b * 668265263);
  const top = h(xi, yi) * (1 - sx) + h(xi + 1, yi) * sx;
  const bot = h(xi, yi + 1) * (1 - sx) + h(xi + 1, yi + 1) * sx;
  return top * (1 - sy) + bot * sy;
}

export function drawSnowCover(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = ART_W;
  c.height = ART_H;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(ART_W, ART_H);
  const px = new Uint32Array(img.data.buffer);
  const white = 0xf0faf6f2 >>> 0; // ABGR: почти белый, чуть голубой
  const shadow = 0xe0e8dcd0 >>> 0;
  const terr = world.map.terrain;
  for (let y = 0; y < ART_H; y++) {
    const lat = LAT_MAX - y / PX_PER_DEG_LAT;
    const base = Math.max(0, Math.min(1, (lat - 41) / 11));
    const row = ((y / CELL) | 0) * GRID_W;
    for (let x = 0; x < ART_W; x++) {
      const t = terr[row + ((x / CELL) | 0)];
      if (t === T.DEEP || t === T.SEA || t === T.DESERT || t === T.JUNGLE || t === T.SNOW) continue;
      let p = base;
      if (t === T.MOUNTAIN || t === T.PEAK || t === T.HILLS) p = Math.min(1, p + 0.45);
      if (t === T.DRY || t === T.STEPPE) p *= 0.8;
      // Сквозь снег проступают леса
      if (t === T.FOREST || t === T.TAIGA) p *= 0.62;
      p *= 0.85;
      if (p <= 0) continue;
      // Снег лежит пятнами: крупный плавный шум и мелкие мягкие пятна по краям
      const n = vnoise(x / 14, y / 14) * 0.55 + vnoise(x / 5, y / 5) * 0.3 + vnoise(x / 2, y / 2) * 0.15;
      if (n < p * 0.95) px[y * ART_W + x] = n > p * 0.95 - 0.06 ? shadow : white;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Процедурный пиксельный фон поля боя: небо, дальние горы, холмы с лесом, земля.
// Слои рисуются в «арт-пикселях» и растягиваются ×2.

import { Pix, shade } from '../gfx/pixel';
import { hash2, valueNoise } from '../util/rng';

export type BattleTerrain = 'grass' | 'forest' | 'steppe' | 'desert' | 'snow' | 'dry';

interface Palette {
  sky: [string, string, string, string];
  far: string;
  farSnow: boolean;
  mid: string;
  midTree: string;
  ground: [string, string, string];
  dirt: string;
  tuft: string;
}

const PAL: Record<BattleTerrain, Palette> = {
  grass: { sky: ['#6f95bf', '#8fb0d2', '#afc8e0', '#cdddea'], far: '#7d8fa8', farSnow: true, mid: '#5e7d4a', midTree: '#3f5f34', ground: ['#6b8a45', '#5f7d3c', '#7a9a50'], dirt: '#6b5438', tuft: '#8aa85a' },
  forest: { sky: ['#6a8cb2', '#86a6c8', '#a6c0da', '#c4d6e6'], far: '#6f829c', farSnow: false, mid: '#3f6034', midTree: '#2c4a28', ground: ['#5a7a3c', '#4e6d34', '#688a48'], dirt: '#5a4630', tuft: '#7a9a4a' },
  steppe: { sky: ['#7fa8d6', '#9cbde2', '#bcd3ea', '#dce8f2'], far: '#9a9aa2', farSnow: false, mid: '#a39c5e', midTree: '#8a8450', ground: ['#b0a862', '#a39b58', '#bdb570'], dirt: '#8a7448', tuft: '#c8c07a' },
  desert: { sky: ['#d9a868', '#e6bf82', '#f0d4a0', '#f6e6c4'], far: '#c49a6a', farSnow: false, mid: '#d8b070', midTree: '#6a7a3a', ground: ['#dcb56d', '#d2aa62', '#e6c47e'], dirt: '#b48a50', tuft: '#c9a060' },
  snow: { sky: ['#8a9cb0', '#a2b2c4', '#bcc8d6', '#d6dee6'], far: '#8e9aa8', farSnow: true, mid: '#c8d2dc', midTree: '#2e4d33', ground: ['#e6ecf0', '#d6dee6', '#f2f5f7'], dirt: '#8a8a88', tuft: '#b8c4cc' },
  dry: { sky: ['#7aa2cc', '#98b8da', '#b8cfe6', '#d8e4ef'], far: '#9a8f86', farSnow: false, mid: '#8f9650', midTree: '#5e6a34', ground: ['#9ca155', '#8c924a', '#abaa62'], dirt: '#8a6e48', tuft: '#b0ad68' },
};

/** Небо: вертикальные полосы с дизерингом. */
export function drawSky(t: BattleTerrain, W: number, H: number): HTMLCanvasElement {
  const P = new Pix(W, H);
  const s = PAL[t].sky;
  const bands = s.length;
  for (let y = 0; y < H; y++) {
    const k = (y / H) * bands;
    const i = Math.min(bands - 1, Math.floor(k));
    const f = k - i;
    for (let x = 0; x < W; x++) {
      const c = f > 0.75 && i < bands - 1 && (x + y) % 2 === 0 ? s[i + 1] : s[i];
      P.p(x, y, c);
    }
  }
  // облака
  for (let i = 0; i < 9; i++) {
    const cx = Math.floor(hash2(i, 3, 1) * W);
    const cy = 8 + Math.floor(hash2(i, 4, 1) * H * 0.45);
    const w = 18 + Math.floor(hash2(i, 5, 1) * 30);
    for (let k = 0; k < w; k++) {
      const hgt = Math.round(Math.sin((k / w) * Math.PI) * 5);
      P.vline(cx + k, cy - hgt, cy, '#f4f6f8');
      P.p(cx + k, cy + 1, shade(s[2], 0.25));
    }
  }
  return P.canvas;
}

/** Дальние горы (параллакс). */
export function drawFar(t: BattleTerrain, W: number, H: number): HTMLCanvasElement {
  const P = new Pix(W, H);
  const pal = PAL[t];
  for (let x = 0; x < W; x++) {
    const h = 30 + valueNoise(x * 0.02, 1, 3) * 40 + valueNoise(x * 0.07, 2, 3) * 12;
    const top = Math.round(H - h);
    P.vline(x, top, H - 1, pal.far);
    if (pal.farSnow && H - h < H - 55) for (let y = top; y < top + 4; y++) P.p(x, y, '#e8eef4');
    P.p(x, top, shade(pal.far, 0.2));
  }
  return P.canvas;
}

/** Средний план: холмы и лес. */
export function drawMid(t: BattleTerrain, W: number, H: number): HTMLCanvasElement {
  const P = new Pix(W, H);
  const pal = PAL[t];
  const tops: number[] = [];
  for (let x = 0; x < W; x++) {
    const h = 18 + valueNoise(x * 0.03, 7, 5) * 26;
    const top = Math.round(H - h);
    tops.push(top);
    P.vline(x, top, H - 1, pal.mid);
    P.p(x, top, shade(pal.mid, 0.15));
  }
  // деревья по гребню
  const density = t === 'forest' ? 0.55 : t === 'desert' ? 0.04 : t === 'steppe' ? 0.03 : 0.2;
  for (let x = 2; x < W - 2; x += 3) {
    if (hash2(x, 9, 2) > density) continue;
    const top = tops[x];
    const tall = 6 + Math.floor(hash2(x, 10, 2) * 6);
    if (t === 'snow' || t === 'forest' && hash2(x, 11, 2) < 0.5) {
      for (let r = 0; r < tall; r++) {
        const hw = Math.floor(r / 3);
        P.hline(x - hw, x + hw, top - tall + r + 2, r % 3 === 2 ? shade(pal.midTree, -0.2) : pal.midTree);
      }
    } else if (t === 'desert') {
      P.vline(x, top - 6, top, '#6b4a2a');
      P.hline(x - 3, x + 3, top - 7, pal.midTree);
    } else {
      for (let dy = 0; dy < 5; dy++) P.hline(x - 2, x + 2, top - 6 + dy, dy === 0 ? shade(pal.midTree, 0.2) : pal.midTree);
      P.p(x, top - 1, '#4a3520');
    }
  }
  return P.canvas;
}

/** Земля поля боя: текстура, тропа, пучки травы, камни. */
export function drawGround(t: BattleTerrain, W: number, H: number): HTMLCanvasElement {
  const P = new Pix(W, H);
  const pal = PAL[t];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = valueNoise(x * 0.05, y * 0.12, 13);
      const r = hash2(x, y, 17);
      let c = n < 0.35 ? pal.ground[1] : n > 0.7 ? pal.ground[2] : pal.ground[0];
      if (r < 0.06) c = shade(c, -0.12);
      // Вытоптанная земля в средней полосе
      const mud = valueNoise(x * 0.02, y * 0.2, 19);
      if (y > H * 0.3 && y < H * 0.75 && mud > 0.62) c = r < 0.5 ? pal.dirt : shade(pal.dirt, 0.1);
      P.p(x, y, c);
    }
  }
  // Кромка у горизонта
  P.hline(0, W - 1, 0, shade(pal.ground[0], -0.15));
  // Пучки травы и камни
  for (let i = 0; i < W * 0.6; i++) {
    const x = Math.floor(hash2(i, 1, 23) * W);
    const y = 2 + Math.floor(hash2(i, 2, 23) * (H - 4));
    if (hash2(i, 3, 23) < 0.8) {
      P.p(x, y, pal.tuft);
      P.p(x - 1, y + 1, pal.tuft);
      P.p(x + 1, y + 1, shade(pal.tuft, -0.2));
    } else {
      P.rect(x, y, 2, 1, '#8a8a88');
      P.p(x, y + 1, '#5a5a58');
    }
  }
  return P.canvas;
}

/** Кол для способности «Колья». */
export function drawStake(): HTMLCanvasElement {
  const P = new Pix(10, 16);
  for (let i = 0; i < 12; i++) {
    P.p(2 + Math.floor(i * 0.5), 14 - i, '#7a5332');
    P.p(3 + Math.floor(i * 0.5), 14 - i, '#523620');
  }
  for (let i = 0; i < 9; i++) P.p(7 - Math.floor(i * 0.6), 14 - i, '#6a4a2a');
  P.p(8, 2, '#c8b08a');
  P.outline('#1c1612');
  return P.canvas;
}

// Фоны боя и фрагменты карты для каждого стиля.

import { fbm, hash2, valueNoise } from '../../src/util/rng';
import { bayer, mix, ramp } from './color';

class C {
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  constructor(
    public w: number,
    public h: number,
  ) {
    this.cv = document.createElement('canvas');
    this.cv.width = w;
    this.cv.height = h;
    this.ctx = this.cv.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
  }
  p(x: number, y: number, c: string) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(x | 0, y | 0, 1, 1);
  }
  r(x: number, y: number, w: number, h: number, c: string) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
  }
  v(x: number, y0: number, y1: number, c: string) {
    this.r(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, c);
  }
  disc(cx: number, cy: number, r: number, c: string) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.p(cx + x, cy + y, c);
  }
}

/** Вертикальный градиент по ступеням с дизерингом. */
function gradient(g: C, y0: number, y1: number, cols: string[]) {
  const n = cols.length - 1;
  for (let y = y0; y < y1; y++) {
    const t = ((y - y0) / Math.max(1, y1 - y0)) * n;
    const i = Math.min(n - 1, Math.floor(t));
    const f = t - i;
    for (let x = 0; x < g.w; x++) g.p(x, y, f > bayer(x, y) ? cols[i + 1] : cols[i]);
  }
}

function ridge(g: C, base: number, amp: number, freq: number, seed: number, col: (x: number, y: number, top: number) => string | null) {
  for (let x = 0; x < g.w; x++) {
    const top = Math.round(base - fbm(x * freq, seed, 3, seed) * amp);
    for (let y = top; y < g.h; y++) {
      const c = col(x, y, top);
      if (c) g.p(x, y, c);
    }
  }
}

// ───────────────────────── фоны боя ─────────────────────────

export function battleBg(style: string, W: number, H: number, water = true): HTMLCanvasElement {
  const g = new C(W, H);
  const hz = Math.round(H * 0.55);
  if (style === 'hd') {
    gradient(g, 0, hz, ['#5d86bf', '#7ea3d2', '#a6c3e3', '#cfe0ee']);
    // облака
    for (let i = 0; i < 7; i++) {
      const cx = hash2(i, 1, 3) * W;
      const cy = 12 + hash2(i, 2, 3) * H * 0.25;
      for (let j = 0; j < 6; j++) g.disc(cx + j * 7 - 18, cy + Math.sin(j) * 3, 6 + (j % 3) * 2, j % 2 ? '#f6f8fb' : '#e9eef6');
      for (let x = -22; x < 26; x++) g.p(cx + x, cy + 8, '#c9d6e8');
    }
    ridge(g, hz - 10, 55, 0.012, 5, (_x, y, top) => (y - top < 5 && top < hz - 35 ? '#eef3f7' : y - top < 7 ? '#8d9dba' : '#7a8bab'));
    ridge(g, hz - 2, 28, 0.02, 9, (x, y, top) => (y - top < 2 ? '#7f9a6a' : (x + y) % 7 === 0 ? '#5d7a4c' : '#6a8757'));
    // ели на гребне
    for (let x = 4; x < W; x += 5) {
      if (hash2(x, 3, 1) > 0.45) continue;
      const top = hz - 6 - hash2(x, 4, 1) * 14;
      const h = 12 + hash2(x, 5, 1) * 10;
      for (let r = 0; r < h; r++) {
        const hw = Math.floor(r / 3.2);
        for (let dx = -hw; dx <= hw; dx++) g.p(x + dx, top + r, dx < 0 ? '#2f5a36' : dx === hw ? '#1d3a26' : '#264a2e');
      }
      g.v(x, top + h, top + h + 3, '#4a3520');
    }
    for (let y = hz; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const n = fbm(x * 0.03, y * 0.06, 3, 11);
        let c = n < 0.4 ? '#5f7f3c' : n < 0.6 ? '#6c8c45' : '#7a9a4f';
        if (valueNoise(x * 0.015, y * 0.12, 4) > 0.64) c = n > 0.5 ? '#8a6c46' : '#7a5c3a';
        if (hash2(x, y, 9) < 0.03) c = ramp(c, 1);
        g.p(x, y, c);
      }
    }
    for (let i = 0; i < W * 0.8; i++) {
      const x = hash2(i, 1, 21) * W;
      const y = hz + 3 + hash2(i, 2, 21) * (H - hz - 4);
      const f = hash2(i, 3, 21);
      g.p(x, y, f < 0.08 ? '#e8d05a' : f < 0.14 ? '#e8e8f0' : '#9aba62');
      g.p(x - 1, y + 1, '#557536');
      g.p(x + 1, y + 1, '#557536');
    }
  } else if (style === 'manuscript') {
    const parch = (x: number, y: number) => {
      const n = fbm(x * 0.02, y * 0.02, 4, 3);
      return n > 0.62 ? '#dccb9e' : n > 0.4 ? '#e7d9b3' : '#efe3c2';
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g.p(x, y, parch(x, y));
    // солнце с лучами
    const sx = W * 0.78;
    const sy = H * 0.2;
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      for (let t = 18; t < 30; t++) g.p(sx + Math.cos(ang) * t, sy + Math.sin(ang) * t, a % 2 ? '#c8962a' : '#2a1a10');
    }
    g.disc(sx, sy, 16, '#2a1a10');
    g.disc(sx, sy, 14, '#e2b53c');
    g.disc(sx - 3, sy - 3, 5, '#f2d470');
    // стилизованные холмы-«горки»
    const hills = [
      { cx: 0.12, r: 70, top: hz - 38, c: '#7aa04a' },
      { cx: 0.42, r: 90, top: hz - 48, c: '#6a9444' },
      { cx: 0.72, r: 80, top: hz - 32, c: '#86ac52' },
      { cx: 0.95, r: 70, top: hz - 44, c: '#6a9444' },
    ];
    for (const hl of hills) {
      const cx = hl.cx * W;
      for (let x = Math.floor(cx - hl.r); x < cx + hl.r; x++) {
        const t = (x - cx) / hl.r;
        const top = Math.round(hz - (hz - hl.top) * Math.sqrt(Math.max(0, 1 - t * t)));
        for (let y = top; y < hz + 2; y++) {
          const edge = y < top + 2;
          const hatch = t > 0.2 && (x + y) % 4 === 0 && y > top + 4;
          g.p(x, y, edge ? '#2a1a10' : hatch ? '#4a6a2a' : hl.c);
        }
      }
      // деревья-«леденцы»
      for (let i = 0; i < 4; i++) {
        const tx = cx + (hash2(i, hl.top, 3) - 0.5) * hl.r * 1.2;
        const tt = (tx - cx) / hl.r;
        const ty = Math.round(hz - (hz - hl.top) * Math.sqrt(Math.max(0, 1 - tt * tt))) + 4;
        g.r(tx - 1, ty - 8, 3, 10, '#2a1a10');
        g.r(tx, ty - 8, 1, 10, '#8a5a32');
        g.disc(tx, ty - 12, 7, '#2a1a10');
        g.disc(tx, ty - 12, 5, i % 2 ? '#2f7a3a' : '#3d8a44');
        g.p(tx - 2, ty - 14, '#7ab85a');
      }
    }
    for (let y = hz; y < H; y++) for (let x = 0; x < W; x++) g.p(x, y, fbm(x * 0.05, y * 0.1, 2, 7) > 0.55 ? '#a8bc6e' : '#b4c67a');
    for (let x = 0; x < W; x++) g.p(x, hz, '#2a1a10');
    // цветы-завитки
    for (let i = 0; i < 70; i++) {
      const x = hash2(i, 1, 44) * W;
      const y = hz + 6 + hash2(i, 2, 44) * (H - hz - 10);
      g.v(x, y, y + 4, '#2a1a10');
      g.p(x - 1, y, i % 3 ? '#b3261e' : '#2d52a8');
      g.p(x + 1, y, i % 3 ? '#b3261e' : '#2d52a8');
      g.p(x, y - 1, '#d9a520');
    }
    // рамка
    for (let x = 0; x < W; x++) {
      for (const y of [0, 1, 2, H - 3, H - 2, H - 1]) g.p(x, y, y === 1 || y === H - 2 ? '#b3261e' : '#2a1a10');
      if (x % 6 < 3) {
        g.p(x, 4, '#d9a520');
        g.p(x, H - 5, '#d9a520');
      }
    }
    for (let y = 0; y < H; y++) for (const x of [0, 1, 2, W - 3, W - 2, W - 1]) g.p(x, y, x === 1 || x === W - 2 ? '#2d52a8' : '#2a1a10');
  } else if (style === 'dark') {
    gradient(g, 0, hz, ['#1a1c24', '#262a34', '#343844', '#4a4c52']);
    // бледная луна
    g.disc(W * 0.22, H * 0.2, 17, '#b8b4a4');
    g.disc(W * 0.22 + 4, H * 0.2 - 3, 14, '#cfcabb');
    for (let i = 0; i < 20; i++) g.p(W * 0.22 + (hash2(i, 1, 2) - 0.5) * 22, H * 0.2 + (hash2(i, 2, 2) - 0.5) * 22, '#9a9688');
    // рваные облака
    for (let y = 8; y < hz - 20; y++) for (let x = 0; x < W; x++) if (fbm(x * 0.012, y * 0.05, 4, 77) > 0.63) g.p(x, y, fbm(x * 0.03, y * 0.08, 2, 2) > 0.5 ? '#3c3f48' : '#2a2c34');
    ridge(g, hz - 6, 40, 0.014, 21, () => '#15161b');
    // мёртвые деревья
    for (let i = 0; i < 6; i++) {
      const x = hash2(i, 9, 9) * W;
      const base = hz + 2;
      const h = 26 + hash2(i, 8, 9) * 20;
      for (let t = 0; t < h; t++) g.p(x + Math.sin(t * 0.3) * 1.2, base - t, '#0b0a0c');
      for (let b = 0; b < 4; b++) {
        const by = base - h * (0.45 + b * 0.13);
        const dir = b % 2 ? 1 : -1;
        for (let t = 0; t < 9 - b; t++) g.p(x + dir * t, by - t * 0.7, '#0b0a0c');
      }
    }
    for (let y = hz; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const n = fbm(x * 0.03, y * 0.07, 3, 13);
        let c = n < 0.45 ? '#26261e' : n < 0.62 ? '#2e2e24' : '#35352a';
        if (valueNoise(x * 0.02, y * 0.1, 3) > 0.62) c = '#3a2e24';
        g.p(x, y, c);
      }
    }
    // туман
    for (let y = hz - 16; y < hz + 20; y++) {
      const a = 1 - Math.abs(y - hz) / 20;
      for (let x = 0; x < W; x++) if (bayer(x, y) < a * 0.45 * valueNoise(x * 0.02, y * 0.1, 5)) g.p(x, y, '#6a6c70');
    }
    // рваные знамёна у горизонта
    for (const x of [W * 0.45, W * 0.62]) {
      g.v(x, hz - 30, hz + 4, '#0b0a0c');
      for (let y = 0; y < 14; y++) for (let dx = 1; dx < 9 - (y > 10 ? (y - 10) * 2 : 0); dx++) g.p(x + dx, hz - 29 + y, (dx + y) % 5 === 0 ? '#3a0e0c' : '#6e1a16');
    }
  } else {
    // закат: пастельный градиент, силуэты холмов, отражение в воде
    const waterY = water ? Math.round(H * 0.8) : H;
    gradient(g, 0, hz + 6, ['#3a2a5e', '#7a3f73', '#c75f6e', '#ee9564', '#f7c27a']);
    g.disc(W * 0.66, hz - 6, 13, '#ffd896');
    g.disc(W * 0.66, hz - 6, 10, '#fff0c0');
    ridge(g, hz - 4, 26, 0.02, 31, () => '#6e3a64');
    ridge(g, hz + 2, 18, 0.03, 41, () => '#4a2750');
    for (let i = 0; i < 9; i++) {
      const x = hash2(i, 3, 6) * W;
      const top = hz - 10 - hash2(i, 4, 6) * 10;
      for (let r = 0; r < 22; r++) {
        const hw = Math.floor(r / 3.4);
        for (let dx = -hw; dx <= hw; dx++) g.p(x + dx, top + r, '#2e1a3a');
      }
    }
    for (let y = hz + 6; y < waterY; y++) for (let x = 0; x < W; x++) g.p(x, y, y < hz + 8 ? '#3a2046' : '#261630');
    for (let x = 0; x < W; x++) {
      if (hash2(x, 1, 8) < 0.45) g.v(x, waterY - 1 - Math.floor(hash2(x, 2, 8) * 4), waterY - 1, '#1d1026');
    }
    // отражение
    for (let y = waterY; y < H; y++) {
      const sy = waterY - (y - waterY) * 1.4 - 2;
      for (let x = 0; x < W; x++) {
        const ox = Math.round(Math.sin(y * 0.9) * 1.5);
        const src = g.ctx.getImageData(Math.max(0, Math.min(W - 1, x + ox)), Math.max(0, sy | 0), 1, 1).data;
        const c = '#' + [src[0], src[1], src[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
        g.p(x, y, mix(c, '#1a1a3a', 0.35 + (y - waterY) / (H - waterY) * 0.3));
      }
      if (y % 3 === 0) for (let x = 0; x < W; x += 1) if (hash2(x, y, 4) < 0.08) g.p(x, y, '#f7c27a');
    }
  }
  return g.cv;
}

// ───────────────────────── фрагмент карты ─────────────────────────

interface MapData {
  land: (x: number, y: number) => boolean;
  height: (x: number, y: number) => number;
  forest: (x: number, y: number) => boolean;
  river: (x: number, y: number) => boolean;
}

function mapData(W: number, H: number, s: number): MapData {
  const land = (x: number, y: number) => fbm(x * 0.012 * s, y * 0.012 * s, 4, 3) + (x / W) * 0.35 - 0.12 > 0.43;
  const height = (x: number, y: number) => fbm(x * 0.02 * s + 50, y * 0.02 * s, 3, 8);
  const forest = (x: number, y: number) => fbm(x * 0.03 * s, y * 0.03 * s, 2, 19) > 0.56;
  const river = (x: number, y: number) => {
    const rx = W * 0.62 + Math.sin(y * 0.05 * s) * 14 / s + Math.sin(y * 0.013 * s) * 20 / s;
    return Math.abs(x - rx) < 1.3 / Math.min(1, s) && y > H * 0.15;
  };
  return { land, height, forest, river };
}

export function mapFragment(style: string, W: number, H: number): HTMLCanvasElement {
  const g = new C(W, H);
  const s = W < 300 ? 2 : 1;
  const m = mapData(W, H, s);
  const town = { x: Math.round(W * 0.72), y: Math.round(H * 0.45) };
  const castle = { x: Math.round(W * 0.42), y: Math.round(H * 0.3) };
  const party = { x: Math.round(W * 0.55), y: Math.round(H * 0.66) };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const isLand = m.land(x, y);
      const hgt = m.height(x, y);
      let c: string;
      if (style === 'manuscript') {
        if (!isLand) {
          c = '#bcd0c0';
          if ((y % 7 === 0 && Math.sin(x * 0.5) > 0.4) || (y % 7 === 3 && Math.sin(x * 0.5 + 2) > 0.5)) c = '#5a7a8a';
        } else {
          const n = fbm(x * 0.03, y * 0.03, 3, 5);
          c = n > 0.6 ? '#dcc796' : '#e7d6aa';
        }
        const coast = isLand && (!m.land(x - 1, y) || !m.land(x + 1, y) || !m.land(x, y - 1) || !m.land(x, y + 1));
        const coast2 = !isLand && [[-3, 0], [3, 0], [0, -3], [0, 3]].some(([dx, dy]) => m.land(x + dx, y + dy));
        if (coast) c = '#2a1a10';
        else if (coast2 && (x + y) % 2 === 0) c = '#5a6a6a';
        if (isLand && m.river(x, y)) c = '#3a6a9a';
      } else if (style === 'dark') {
        if (!isLand) c = hgt > 0.5 ? '#1a222a' : '#161c24';
        else c = hgt > 0.62 ? '#4a4a44' : hgt > 0.5 ? '#3a3c30' : '#303428';
        if (isLand && m.forest(x, y) && hgt < 0.62) c = (x + y) % 3 ? '#1a1e16' : '#22261c';
        if (isLand && m.river(x, y)) c = '#2a3440';
        const vign = Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2));
        if (vign > 0.75 && bayer(x, y) < (vign - 0.75) * 2) c = '#0a0a0c';
      } else if (style === 'dusk') {
        if (!isLand) c = mix('#2a1e4e', '#4a3070', hgt) ;
        else c = hgt > 0.6 ? '#c77a5e' : hgt > 0.48 ? '#b8664e' : '#a35a4a';
        if (isLand && m.forest(x, y) && hgt < 0.6) c = '#5a2e48';
        if (isLand && m.river(x, y)) c = '#f0a870';
        if (!isLand && hash2(x, y, 3) < 0.01) c = '#f7c27a';
      } else {
        if (!isLand) {
          const d = [2, 4, 7].findIndex((r) => [[-r, 0], [r, 0], [0, -r], [0, r]].some(([dx, dy]) => m.land(x + dx, y + dy)));
          c = d === 0 ? '#9fd0e0' : d === 1 ? '#4a8cc0' : d === 2 ? '#3a78b0' : '#2e66a0';
          if (d === 0 && (x + y) % 3 === 0) c = '#e0f0f4';
        } else {
          c = hgt > 0.62 ? '#8a9a5a' : hgt > 0.5 ? '#6f9a48' : '#7aa850';
          if (fbm(x * 0.05, y * 0.05, 2, 1) > 0.6) c = ramp(c, 1);
        }
        if (isLand && m.river(x, y)) c = '#4a8cc0';
      }
      g.p(x, y, c);
    }
  }
  // Леса и холмы значками
  const step = style === 'dusk' ? 5 : 7;
  for (let y = 6; y < H - 4; y += step) {
    for (let x = 4; x < W - 4; x += step) {
      const jx = x + Math.round((hash2(x, y, 5) - 0.5) * 4);
      const jy = y + Math.round((hash2(x, y, 6) - 0.5) * 4);
      if (!m.land(jx, jy) || m.river(jx, jy)) continue;
      if (Math.hypot(jx - town.x, jy - town.y) < 22 || Math.hypot(jx - castle.x, jy - castle.y) < 18) continue;
      const hgt = m.height(jx, jy);
      if (hgt > 0.62) {
        // холм/гора
        for (let r = 0; r < 6; r++) {
          for (let dx = -r; dx <= r; dx++) {
            let c: string;
            if (style === 'manuscript') c = r === 5 || Math.abs(dx) === r ? '#2a1a10' : dx > 1 && (dx + r) % 2 === 0 ? '#8a6a3a' : '#cdb07a';
            else if (style === 'dark') c = dx < 0 ? '#5a5a54' : '#3a3a36';
            else if (style === 'dusk') c = dx < 0 ? '#e59a6a' : '#7a3e52';
            else c = r < 2 ? '#f0f0f0' : dx < 0 ? '#a0a08a' : '#6e6e5e';
            g.p(jx + dx, jy - 5 + r, c);
          }
        }
      } else if (m.forest(jx, jy)) {
        if (style === 'manuscript') {
          g.v(jx, jy - 1, jy + 2, '#2a1a10');
          g.disc(jx, jy - 3, 3, '#2a1a10');
          g.disc(jx, jy - 3, 2, '#3d8a44');
        } else if (style === 'dark') {
          for (let r = 0; r < 6; r++) for (let dx = -Math.floor(r / 2); dx <= Math.floor(r / 2); dx++) g.p(jx + dx, jy - 5 + r, '#0e120c');
        } else if (style === 'dusk') {
          for (let r = 0; r < 5; r++) for (let dx = -Math.floor(r / 2); dx <= Math.floor(r / 2); dx++) g.p(jx + dx, jy - 4 + r, '#3a1a38');
        } else {
          for (let r = 0; r < 7; r++) for (let dx = -Math.floor(r / 2); dx <= Math.floor(r / 2); dx++) g.p(jx + dx, jy - 6 + r, dx < 0 ? '#3a7a3a' : '#245a2a');
          g.p(jx, jy + 1, '#4a3520');
        }
      }
    }
  }
  // Город, замок и отряд
  drawTown(g, style, town.x, town.y, 1);
  drawTown(g, style, castle.x, castle.y, 0);
  drawParty(g, style, party.x, party.y);
  if (style === 'manuscript') {
    // картуш и роза ветров
    const cx = 34;
    const cy = H - 30;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const len = a % 2 ? 12 : 22;
      for (let t = 0; t < len; t++) g.p(cx + Math.cos(ang) * t, cy + Math.sin(ang) * t, a === 6 ? '#b3261e' : '#2a1a10');
    }
    g.disc(cx, cy, 3, '#d9a520');
    g.r(W - 150, 8, 140, 22, '#2a1a10');
    g.r(W - 148, 10, 136, 18, '#efe3c2');
    g.r(W - 146, 12, 3, 14, '#b3261e');
    g.ctx.font = '13px Kurale, Georgia, serif';
    g.ctx.fillStyle = '#2a1a10';
    g.ctx.fillText('Regnum Bohemiae · 1347', W - 138, 24);
  }
  return g.cv;
}

function drawTown(g: C, style: string, x: number, y: number, big: number) {
  const w = big ? 26 : 16;
  const wall = style === 'manuscript' ? '#ece6d6' : style === 'dark' ? '#4a4844' : style === 'dusk' ? '#2a1830' : '#c8c0b0';
  const roof = style === 'manuscript' ? '#b3261e' : style === 'dark' ? '#2a2422' : style === 'dusk' ? '#1f1024' : '#b04a3a';
  const ink = style === 'manuscript' ? '#2a1a10' : style === 'dark' ? '#050505' : style === 'dusk' ? '#1a0e20' : '#2a2220';
  const x0 = x - w / 2;
  g.r(x0 - 1, y - 9, w + 2, 11, ink);
  g.r(x0, y - 8, w, 9, wall);
  for (let i = 0; i < w; i += 3) g.r(x0 + i, y - 10, 2, 2, wall);
  for (const tx of big ? [x0 + 1, x + 1, x0 + w - 5] : [x0 + 1, x0 + w - 5]) {
    g.r(tx - 1, y - 17, 6, 10, ink);
    g.r(tx, y - 16, 4, 9, wall);
    for (let r = 0; r < 5; r++) g.r(tx + 2 - r / 2, y - 21 + r, r + 1, 1, roof);
    if (style === 'dark' || style === 'dusk') g.p(tx + 2, y - 13, '#ffb44a');
  }
  g.r(x - 2, y - 4, 4, 5, ink);
  if (style === 'dusk' || style === 'dark') for (let i = 0; i < 4; i++) g.p(x0 + 3 + i * 5, y - 5, '#ffc05a');
  g.v(x + 1, y - 28, y - 21, ink);
  g.r(x + 2, y - 28, 5, 3, style === 'dark' ? '#6e1a16' : '#2d52a8');
}

function drawParty(g: C, style: string, x: number, y: number) {
  const ink = style === 'manuscript' ? '#2a1a10' : style === 'dark' ? '#050505' : style === 'dusk' ? '#1a0e20' : '#1c1612';
  const horse = style === 'dusk' ? '#2a1830' : style === 'dark' ? '#2e2622' : '#8a5a32';
  const cloth = style === 'dusk' ? '#3a2448' : style === 'dark' ? '#4a4a52' : '#2d52a8';
  g.r(x - 6, y - 4, 12, 5, ink);
  g.r(x - 5, y - 3, 10, 3, horse);
  g.r(x + 4, y - 7, 4, 4, ink);
  g.r(x + 5, y - 6, 2, 3, horse);
  for (const lx of [x - 5, x - 2, x + 2, x + 4]) g.v(lx, y + 1, y + 3, ink);
  g.r(x - 2, y - 10, 5, 7, ink);
  g.r(x - 1, y - 9, 3, 5, cloth);
  g.v(x + 3, y - 16, y - 4, ink);
  g.r(x + 4, y - 16, 4, 3, style === 'dusk' ? '#f4955a' : '#d9a520');
  if (style === 'dusk') g.p(x - 2, y - 10, '#f4955a');
}

// Детальный фон: средневековый городок (фахверк, каменная башня, деревья, облака), цветной и в сепии.

import { fbm, hash2, mulberry32, valueNoise } from '../../src/util/rng';
import { bayer, lumOf, mix, ramp, rgb } from './color';

const INK = '#1e1a1a';

class G {
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  constructor(
    public w: number,
    public h: number,
  ) {
    this.cv = document.createElement('canvas');
    this.cv.width = w;
    this.cv.height = h;
    this.ctx = this.cv.getContext('2d', { willReadFrequently: true })!;
    this.ctx.imageSmoothingEnabled = false;
  }
  p(x: number, y: number, c: string) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
  }
  r(x: number, y: number, w: number, h: number, c: string) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  line(x0: number, y0: number, x1: number, y1: number, w: number, c: string) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
    for (let i = 0; i <= n; i++) {
      const t = i / Math.max(1, n);
      this.r(x0 + (x1 - x0) * t - w / 2, y0 + (y1 - y0) * t - w / 2, w, w, c);
    }
  }
  disc(cx: number, cy: number, r: number, c: string) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.5) this.p(cx + x, cy + y, c);
  }
  /** Обвести непрозрачное тёмной линией (снаружи). */
  outline(c = INK) {
    const d = this.ctx.getImageData(0, 0, this.w, this.h).data;
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h && d[(y * this.w + x) * 4 + 3] > 0;
    const pts: [number, number][] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) pts.push([x, y]);
    for (const [x, y] of pts) this.p(x, y, c);
  }
  put(o: G, x: number, y: number) {
    this.ctx.drawImage(o.cv, Math.round(x), Math.round(y));
  }
}

function layer(w: number, h: number, draw: (g: G) => void, outline = true): G {
  const g = new G(w, h);
  draw(g);
  if (outline) g.outline();
  return g;
}

// ───────────────────────── элементы ─────────────────────────

function cloud(w: number, h: number, seed: number): G {
  return layer(w, h, (g) => {
    const r = mulberry32(seed);
    const blobs: [number, number, number][] = [];
    for (let i = 0; i < 9; i++) blobs.push([w * 0.12 + r() * w * 0.76, h * 0.35 + r() * h * 0.35, h * 0.22 + r() * h * 0.2]);
    blobs.push([w * 0.5, h * 0.55, h * 0.38]);
    for (const [cx, cy, rr] of blobs) g.disc(cx, cy, rr, '#b8cce0');
    for (const [cx, cy, rr] of blobs) g.disc(cx - 1, cy - 2, rr - 2, '#e4eef6');
    for (const [cx, cy, rr] of blobs) g.disc(cx - 2, cy - 3, rr - 5, '#ffffff');
    // плоское дно
    g.ctx.clearRect(0, h * 0.8, w, h);
    for (let x = 0; x < w; x++) for (let y = Math.floor(h * 0.72); y < h * 0.8; y++) {
      const d = g.ctx.getImageData(x, y, 1, 1).data;
      if (d[3]) g.p(x, y, '#b8cce0');
    }
  }, false);
}

function pine(h: number): G {
  const w = Math.round(h * 0.5);
  return layer(w + 2, h + 2, (g) => {
    for (let y = 0; y < h - 4; y++) {
      const hw = Math.max(1, Math.round((y / (h - 4)) * (w / 2) * (0.75 + 0.25 * Math.sin(y * 0.8))));
      for (let x = -hw; x <= hw; x++) g.p(w / 2 + 1 + x, y + 1, x < -hw / 3 ? '#3e6e5a' : x < hw / 3 ? '#2e5a4a' : '#22483c');
    }
    g.r(w / 2, h - 4, 2, 4, '#4a3020');
  });
}

function tree(size: number, seed: number): G {
  const w = Math.round(size * 1.1);
  const h = Math.round(size * 1.35);
  return layer(w, h, (g) => {
    const r = mulberry32(seed);
    const tx = w / 2;
    // ствол и ветви
    g.line(tx, h - 2, tx - 1, h * 0.45, size * 0.1, '#4e3422');
    g.line(tx + 1, h - 2, tx, h * 0.5, size * 0.04, '#6e4a30');
    g.line(tx, h * 0.6, tx - size * 0.22, h * 0.4, size * 0.05, '#4e3422');
    g.line(tx, h * 0.55, tx + size * 0.25, h * 0.38, size * 0.05, '#4e3422');
    // крона из комков
    const clumps: [number, number, number][] = [];
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * size * 0.3;
      clumps.push([w / 2 + Math.cos(a) * d * 1.2, h * 0.36 + Math.sin(a) * d * 0.9, size * (0.13 + r() * 0.1)]);
    }
    for (const [cx, cy, rr] of clumps) g.disc(cx, cy, rr, '#2c5a2a');
    for (const [cx, cy, rr] of clumps) g.disc(cx - rr * 0.25, cy - rr * 0.3, rr * 0.72, '#3e7a36');
    for (const [cx, cy, rr] of clumps) g.disc(cx - rr * 0.4, cy - rr * 0.45, rr * 0.38, '#5a9a44');
    for (let i = 0; i < size; i++) {
      const x = w * 0.15 + r() * w * 0.7;
      const y = h * 0.1 + r() * h * 0.5;
      const d = g.ctx.getImageData(x | 0, y | 0, 1, 1).data;
      if (d[3]) g.p(x, y, r() < 0.5 ? '#244a22' : '#74b050');
    }
  });
}

/** Каменная кладка: неровные блоки со швами. */
function stones(g: G, x0: number, y0: number, w: number, h: number, base: string, rowH: number, seed: number) {
  const r = mulberry32(seed);
  for (let y = y0; y < y0 + h; y += rowH) {
    let x = x0 - Math.floor(r() * 10);
    while (x < x0 + w) {
      const bw = 8 + Math.floor(r() * 12);
      const c = ramp(base, r() < 0.2 ? 1 : r() < 0.25 ? -1 : 0);
      const bx0 = Math.max(x0, x);
      const bx1 = Math.min(x0 + w, x + bw);
      const bh = Math.min(rowH, y0 + h - y);
      if (bx1 > bx0) {
        g.r(bx0, y, bx1 - bx0, bh, c);
        g.r(bx0, y, bx1 - bx0, 1, ramp(c, 1));
        g.r(bx0, y + bh - 1, bx1 - bx0, 1, ramp(base, -2));
        g.r(bx1 - 1, y, 1, bh, ramp(base, -2));
        for (let i = 0; i < 3; i++) g.p(bx0 + r() * (bx1 - bx0), y + 1 + r() * (bh - 2), ramp(c, -1));
      }
      x += bw;
    }
  }
}

function tower(w: number, h: number): G {
  return layer(w + 4, h + 4, (g) => {
    const x0 = 2;
    const top = 16;
    stones(g, x0, top, w, h - top, '#a49c86', 8, 5);
    // зубцы
    for (let x = x0 - 3; x < x0 + w + 3; x += 12) stones(g, x, 4, 8, 12, '#aca48e', 6, x);
    stones(g, x0 - 3, 12, w + 6, 6, '#9a927c', 6, 9);
    // бойницы и окно
    for (const [wx, wy] of [[w * 0.5, h * 0.35], [w * 0.5, h * 0.6]] as [number, number][]) {
      g.r(x0 + wx - 3, wy - 8, 6, 14, INK);
      g.r(x0 + wx - 2, wy - 7, 4, 12, '#2a2622');
      g.r(x0 + wx - 2, wy - 9, 4, 2, INK);
    }
    // тень справа
    for (let y = top; y < h; y++) for (let x = x0 + w * 0.7; x < x0 + w; x++) if (bayer(x, y) < 0.5) g.p(x, y, 'rgba(40,30,40,0.35)');
  });
}

function house(w: number, wallH: number, roofH: number, seed: number, windows = 2): G {
  const W = w + 20;
  const H = wallH + roofH + 4;
  return layer(W, H, (g) => {
    const r = mulberry32(seed);
    const x0 = 10;
    const wallTop = roofH;
    const plinth = 14;
    // стена
    for (let y = wallTop; y < H - plinth; y++) for (let x = x0; x < x0 + w; x++) {
      const n = hash2(x, y, seed);
      g.p(x, y, n < 0.04 ? '#d0c2a0' : n > 0.97 ? '#f4ead2' : '#e6d8b8');
    }
    stones(g, x0, H - plinth, w, plinth, '#9a907c', 7, seed + 1);
    // брусья фахверка
    const T = '#5a3a22';
    const TL = '#7a5236';
    const mid = wallTop + Math.round((H - plinth - wallTop) * 0.48);
    const beam = (x: number, y: number, bw: number, bh: number) => {
      g.r(x, y, bw, bh, T);
      g.r(x, y, Math.max(1, bw > bh ? bw : 1), 1, TL);
    };
    beam(x0, wallTop, w, 4);
    beam(x0, mid, w, 4);
    beam(x0, H - plinth - 3, w, 3);
    const posts = [x0, x0 + w - 4];
    const n = windows + 1;
    for (let i = 1; i < n; i++) posts.push(x0 + Math.round((w / n) * i) - 2);
    for (const px of posts) beam(px, wallTop, 4, H - plinth - wallTop);
    // раскосы
    for (let i = 0; i < posts.length - 1; i++) {
      const a = [...posts].sort((p, q) => p - q);
      if (r() < 0.6) {
        g.line(a[i] + 4, mid, a[i + 1], wallTop + 4, 3, T);
        g.line(a[i] + 4, H - plinth - 3, a[i + 1], mid + 4, 3, T);
      }
    }
    // окна
    const sorted = [...posts].sort((p, q) => p - q);
    for (let i = 0; i < sorted.length - 1; i++) {
      const cx = (sorted[i] + sorted[i + 1] + 4) / 2;
      for (const wy of [wallTop + 9, mid + 9]) {
        if (wy === mid + 9 && i === 1) continue;
        g.r(cx - 7, wy - 1, 14, 16, INK);
        g.r(cx - 6, wy, 12, 14, '#4a2e1c');
        g.r(cx - 5, wy + 1, 10, 12, '#5a88b8');
        g.r(cx - 5, wy + 1, 4, 5, '#8ab8e0');
        g.r(cx - 1, wy + 1, 2, 12, '#4a2e1c');
        g.r(cx - 5, wy + 6, 10, 2, '#4a2e1c');
        g.r(cx - 8, wy + 15, 16, 2, TL);
      }
    }
    // дверь с аркой
    const dx = x0 + Math.round(w * 0.5) - 8;
    const dy = mid + 6;
    g.r(dx - 1, dy - 1, 18, H - plinth - dy + 1, INK);
    for (let y = dy; y < H - 2; y++) for (let x = dx; x < dx + 16; x++) g.p(x, y, (x - dx) % 4 === 0 ? '#4a2e1a' : '#7a5028');
    g.r(dx + 11, dy + 14, 2, 2, '#c8a050');
    // крыша из черепицы
    for (let y = 0; y < roofH; y++) {
      const t = y / roofH;
      const inset = Math.round((1 - t) * 10);
      for (let x = x0 - 8 + inset; x < x0 + w + 8 - inset; x++) {
        const row = Math.floor(y / 5);
        const off = row % 2 ? 3 : 0;
        let c = '#b0482c';
        if (y % 5 === 4) c = '#7e2e1c';
        else if ((x + off) % 6 === 0) c = '#8e3822';
        else if (y % 5 === 0) c = '#c8603a';
        if (hash2(x, y, seed + 7) < 0.05) c = '#9a3e26';
        g.p(x, y + 2, c);
      }
    }
    // тень под свесом крыши и тёмный край черепицы
    for (let x = x0; x < x0 + w; x++) for (let y = wallTop + 2; y < wallTop + 9; y++) if (bayer(x, y) < 0.55 - (y - wallTop) * 0.07) g.p(x, y, '#8a7a60');
    g.r(x0 - 8, roofH + 1, w + 16, 2, INK);
    // труба
    const cxh = x0 + w * 0.75;
    stones(g, cxh, -2 + 0, 9, 14, '#8a8070', 4, seed + 3);
  });
}

// ───────────────────────── сцена ─────────────────────────

export function townScene(W: number, H: number, ground: number): HTMLCanvasElement {
  const g = new G(W, H);
  // небо
  const sky = ['#4a86c8', '#5e98d4', '#7eaede', '#a6c8e8'];
  for (let y = 0; y < ground; y++) {
    const t = (y / ground) * (sky.length - 1);
    const i = Math.min(sky.length - 2, Math.floor(t));
    for (let x = 0; x < W; x++) g.p(x, y, t - i > bayer(x, y) ? sky[i + 1] : sky[i]);
  }
  for (const [cx, cy, cw, s] of [[60, 30, 150, 3], [330, 14, 120, 7], [560, 40, 170, 11]] as [number, number, number, number][]) g.put(cloud(cw, cw * 0.42, s), cx, cy);
  // дальний ельник
  for (let x = -10; x < W; x += 13) {
    const h = 60 + hash2(x, 1, 2) * 50;
    g.put(pine(h), x, ground - 118 - h * 0.4 + hash2(x, 2, 2) * 20);
  }
  for (let y = ground - 90; y < ground; y++) for (let x = 0; x < W; x++) if (bayer(x, y) < 0.2) g.p(x, y, '#2e5a4a');
  // постройки
  g.put(house(150, 118, 58, 3, 3), -30, ground - 176 - 4);
  g.put(tower(62, 190), 150, ground - 194);
  // мостик от башни
  g.r(214, ground - 150, 40, 6, INK);
  g.r(214, ground - 149, 40, 4, '#7a5236');
  g.put(house(170, 124, 70, 9, 3), 238, ground - 194 - 4);
  g.put(house(120, 108, 52, 13, 2), 450, ground - 160 - 4);
  g.put(tree(130, 4), 560, ground - 176);
  g.put(house(140, 118, 58, 21, 2), 640, ground - 176 - 4);
  g.put(tree(100, 8), 410, ground - 135);
  // трава и дорожка
  for (let y = ground; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = fbm(x * 0.04, y * 0.12, 3, 3);
      let c = n < 0.42 ? '#4e8a34' : n < 0.6 ? '#5a9a3c' : '#68aa44';
      const path = Math.abs(x - (330 + (y - ground) * 1.6)) < 22 + (y - ground) * 0.8 && valueNoise(x * 0.1, y * 0.3, 2) > 0.25;
      if (path) c = n > 0.5 ? '#b89a66' : '#a88a58';
      g.p(x, y, c);
    }
  }
  for (let x = 0; x < W; x++) g.p(x, ground, '#3a6e28');
  for (let i = 0; i < W; i++) {
    const x = hash2(i, 5, 5) * W;
    const y = ground + 2 + hash2(i, 6, 5) * (H - ground - 4);
    g.p(x, y, '#86c05a');
    g.p(x - 1, y + 1, '#3e7a2a');
    g.p(x + 1, y + 1, '#3e7a2a');
  }
  return g.cv;
}

/** Каменная ограда на переднем плане. */
export function stoneWall(W: number, h: number): HTMLCanvasElement {
  const g = new G(W, h);
  stones(g, 0, 2, W, h - 2, '#6e6258', 9, 77);
  g.r(0, 0, W, 2, INK);
  return g.cv;
}

/** Деревянная изгородь (для сепийной сцены, как на референсе). */
export function fence(W: number, h: number): HTMLCanvasElement {
  const g = new G(W, h);
  for (let x = 4; x < W; x += 34) {
    g.r(x - 1, 0, 8, h, INK);
    g.r(x, 1, 6, h - 2, '#8a6a44');
    g.r(x, 1, 2, h - 2, '#a8865a');
  }
  for (const y of [h * 0.25, h * 0.62]) {
    g.r(0, y - 1, W, 7, INK);
    g.r(0, y, W, 5, '#9a7a50');
    g.r(0, y, W, 1, '#b8966a');
  }
  return g.cv;
}

/** Перевести картинку в мягкую сепию с пониженным контрастом (фон, на котором читаются герои). */
export function toSepia(src: HTMLCanvasElement, light = 0.35): HTMLCanvasElement {
  const g = new G(src.width, src.height);
  g.ctx.drawImage(src, 0, 0);
  const img = g.ctx.getImageData(0, 0, g.w, g.h);
  const tones = ['#6e5a3c', '#8a7450', '#a68e62', '#bea878', '#d2be8c', '#e2d2a4'].map(rgb);
  for (let i = 0; i < img.data.length; i += 4) {
    if (!img.data[i + 3]) continue;
    const hx = '#' + [img.data[i], img.data[i + 1], img.data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    let l = lumOf(hx);
    l = light + l * (1 - light);
    const px = (i / 4) % g.w;
    const py = Math.floor(i / 4 / g.w);
    const f = l * tones.length - 0.5;
    const t = Math.max(0, Math.min(tones.length - 1, Math.floor(f) + (f - Math.floor(f) > bayer(px, py) ? 1 : 0)));
    const c = tones[t];
    img.data[i] = c[0];
    img.data[i + 1] = c[1];
    img.data[i + 2] = c[2];
  }
  g.ctx.putImageData(img, 0, 0);
  return g.cv;
}

export { mix };

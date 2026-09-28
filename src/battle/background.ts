// Процедурный пиксельный фон поля боя: небо с облаками, два хребта гор, холмы с полями,
// лесом и далёкими поселениями, земля с травой, цветами и камнями. Слои рисуются
// в «арт-пикселях» и растягиваются ×2. Рисуем в буфер ImageData — так быстро и на телефоне.

import { bayer, mix, ramp } from '../gfx/color';
import { Pix } from '../gfx/pixel';
import { fbm, hash2, mulberry32, valueNoise } from '../util/rng';

export type BattleTerrain = 'grass' | 'forest' | 'steppe' | 'desert' | 'snow' | 'dry';

interface Palette {
  sky: [string, string, string, string];
  sun: string;
  cloud: [string, string, string];
  clouds: number;
  far: string;
  farBack: string;
  farSnow: boolean;
  mid: string;
  midTree: string;
  ground: [string, string, string];
  dirt: string;
  tuft: string;
  flowers: string[];
}

const PAL: Record<BattleTerrain, Palette> = {
  grass: {
    sky: ['#5d86bf', '#7ea3d2', '#a6c3e3', '#cfe0ee'], sun: '#fff4d8', cloud: ['#ffffff', '#e6edf6', '#b4c6dc'], clouds: 14,
    far: '#6e82a0', farBack: '#93a6c0', farSnow: true, mid: '#5e8a46', midTree: '#3a6a34',
    ground: ['#6b8a45', '#5f7d3c', '#7a9a50'], dirt: '#6b5438', tuft: '#8ab05a', flowers: ['#f0f0f4', '#f0d050', '#b870c8', '#e05a4a'],
  },
  forest: {
    sky: ['#56809f', '#7598b8', '#9ab8d0', '#c0d4e2'], sun: '#fff0d0', cloud: ['#f8fafc', '#dfe7ef', '#a8bccd'], clouds: 16,
    far: '#5e7490', farBack: '#8498b0', farSnow: false, mid: '#3f6636', midTree: '#2c4e28',
    ground: ['#5a7a3c', '#4e6d34', '#688a48'], dirt: '#5a4630', tuft: '#7a9a4a', flowers: ['#f0f0e8', '#e8c040', '#d06a3a'],
  },
  steppe: {
    sky: ['#6e9ed4', '#8fb6e0', '#b4cfea', '#dce8f2'], sun: '#fff6de', cloud: ['#ffffff', '#eef2f8', '#c4d0e0'], clouds: 7,
    far: '#8e8e9c', farBack: '#aab0c0', farSnow: false, mid: '#a39c5e', midTree: '#7a7446',
    ground: ['#b0a862', '#a39b58', '#bdb570'], dirt: '#8a7448', tuft: '#d8d09a', flowers: ['#e8e0f0', '#c8a0d8'],
  },
  desert: {
    sky: ['#c9955a', '#e0b27a', '#eccb98', '#f6e2bc'], sun: '#fff4d0', cloud: ['#fff6e6', '#f2e2c8', '#d8c09c'], clouds: 3,
    far: '#c08a5a', farBack: '#d8ae80', farSnow: false, mid: '#d8b070', midTree: '#6a7a3a',
    ground: ['#dcb56d', '#d2aa62', '#e6c47e'], dirt: '#b48a50', tuft: '#a88a50', flowers: [],
  },
  snow: {
    sky: ['#7d8ea4', '#98a8bc', '#b4c2d2', '#d2dce6'], sun: '#f4f6fa', cloud: ['#eef2f6', '#d2dae4', '#a4b0c0'], clouds: 20,
    far: '#7a889c', farBack: '#a0acbc', farSnow: true, mid: '#c8d2dc', midTree: '#2e4d3a',
    ground: ['#e6ecf0', '#d6dee6', '#f2f5f7'], dirt: '#b8c0c8', tuft: '#7a8a6a', flowers: [],
  },
  dry: {
    sky: ['#6e98c4', '#8eb2d6', '#b2cbe4', '#d6e3ee'], sun: '#fff2d4', cloud: ['#ffffff', '#ebeff4', '#c0ccdc'], clouds: 8,
    far: '#8e8074', farBack: '#b0a498', farSnow: false, mid: '#8f9650', midTree: '#4e5e30',
    ground: ['#9ca155', '#8c924a', '#abaa62'], dirt: '#8a6e48', tuft: '#c0b070', flowers: ['#f0e0a0', '#e8e8e8'],
  },
};

// ───────────────────────── быстрый буфер ─────────────────────────

const colCache = new Map<string, number>();
function col(c: string): number {
  let v = colCache.get(c);
  if (v === undefined) {
    const n = parseInt(c.slice(1), 16);
    v = (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
    colCache.set(c, v);
  }
  return v;
}

class Buf {
  readonly cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  readonly d: Uint32Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.cv = document.createElement('canvas');
    this.cv.width = w;
    this.cv.height = h;
    this.ctx = this.cv.getContext('2d')!;
    this.img = this.ctx.createImageData(w, h);
    this.d = new Uint32Array(this.img.data.buffer);
  }
  p(x: number, y: number, c: string) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = col(c);
  }
  has(x: number, y: number): boolean {
    x = Math.floor(x);
    y = Math.floor(y);
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[y * this.w + x] !== 0;
  }
  /** Полупрозрачное наложение цвета на уже нарисованное. */
  tint(x: number, y: number, c: string, a: number) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    const o = this.d[i];
    if (!o) return;
    const n = col(c);
    const mixc = (sh: number) => Math.round(((o >> sh) & 255) * (1 - a) + ((n >> sh) & 255) * a) << sh;
    this.d[i] = (0xff000000 | mixc(16) | mixc(8) | mixc(0)) >>> 0;
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let yy = Math.floor(y); yy < y + h; yy++) for (let xx = Math.floor(x); xx < x + w; xx++) this.p(xx, yy, c);
  }
  v(x: number, y0: number, y1: number, c: string) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.p(x, y, c);
  }
  disc(cx: number, cy: number, r: number, c: string) {
    for (let y = -Math.ceil(r); y <= r; y++) for (let x = -Math.ceil(r); x <= r; x++) if (x * x + y * y <= r * r + r * 0.4) this.p(cx + x, cy + y, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) this.p(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  canvas(): HTMLCanvasElement {
    this.ctx.putImageData(this.img, 0, 0);
    return this.cv;
  }
}

/** Отдельный маленький спрайт с обводкой, который затем «штампуется» в буфер. */
class Stamp {
  readonly px = new Map<number, string>();
  constructor(
    readonly w: number,
    readonly h: number,
  ) {}
  p(x: number, y: number, c: string) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px.set(y * this.w + x, c);
  }
  disc(cx: number, cy: number, r: number, c: string) {
    for (let y = -Math.ceil(r); y <= r; y++) for (let x = -Math.ceil(r); x <= r; x++) if (x * x + y * y <= r * r + r * 0.4) this.p(cx + x, cy + y, c);
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let yy = Math.floor(y); yy < y + h; yy++) for (let xx = Math.floor(x); xx < x + w; xx++) this.p(xx, yy, c);
  }
  outline(c: string) {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        if (this.px.has(i)) continue;
        if ((x > 0 && this.px.has(i - 1)) || (x < this.w - 1 && this.px.has(i + 1)) || (y > 0 && this.px.has(i - this.w)) || (y < this.h - 1 && this.px.has(i + this.w))) add.push(i);
      }
    }
    for (const i of add) this.px.set(i, c);
  }
  put(B: Buf, x0: number, y0: number) {
    for (const [i, c] of this.px) B.p(x0 + (i % this.w), y0 + Math.floor(i / this.w), c);
  }
}

// ───────────────────────── небо ─────────────────────────

function cumulus(B: Buf, cx: number, cy: number, w: number, h: number, pal: [string, string, string], seed: number, skyAt: (y: number) => string) {
  const r = mulberry32(seed);
  const blobs: [number, number, number][] = [];
  const n = 5 + Math.floor(w / 14);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const rr = h * (0.3 + Math.sin(t * Math.PI) * 0.45) * (0.8 + r() * 0.35);
    blobs.push([cx - w / 2 + t * w, cy + h * 0.25 - rr * 0.5 + (r() - 0.5) * 3, rr]);
  }
  const bottom = cy + h * 0.45;
  const inside = (x: number, y: number, grow: number, dx = 0, dy = 0) => y <= bottom && blobs.some(([bx, by, br]) => (x - bx - dx) ** 2 + (y - by - dy) ** 2 <= (br + grow) ** 2);
  for (let y = Math.floor(cy - h * 1.2); y <= bottom; y++) {
    for (let x = Math.floor(cx - w / 2 - h); x <= cx + w / 2 + h; x++) {
      if (!inside(x, y, 0)) continue;
      const edge = !inside(x, y, -1.5);
      if (edge && bayer(x, y) < 0.35) {
        B.p(x, y, mix(skyAt(y), pal[1], 0.5));
        continue;
      }
      let c = pal[1];
      if (inside(x, y, -2, 3, 3) && !inside(x, y, -1, -3, -4)) c = pal[1];
      if (!inside(x, y, -1, -2, -3)) c = pal[0];
      if (y > bottom - h * 0.35 || !inside(x, y, -2, -3, 4)) c = y > bottom - 2 ? pal[2] : bayer(x, y) < (y - (bottom - h * 0.35)) / (h * 0.35) ? pal[2] : c;
      B.p(x, y, c);
    }
  }
}

/** Небо: градиент с дизерингом, свечение солнца, кучевые и перистые облака, птицы. */
export function drawSky(t: BattleTerrain, W: number, H: number): HTMLCanvasElement {
  const B = new Buf(W, H);
  const pal = PAL[t];
  const s = pal.sky;
  const skyAt = (y: number) => {
    const k = Math.min(0.999, Math.max(0, y / H)) * (s.length - 1);
    return s[Math.floor(k)];
  };
  for (let y = 0; y < H; y++) {
    const k = (y / H) * (s.length - 1);
    const i = Math.min(s.length - 2, Math.floor(k));
    const f = k - i;
    for (let x = 0; x < W; x++) B.p(x, y, f > bayer(x, y) ? s[i + 1] : s[i]);
  }
  // Свечение солнца
  const sx = W * 0.62;
  const sy = H * 0.55;
  const glow = t === 'desert' ? 170 : 120;
  for (let y = Math.max(0, sy - glow); y < Math.min(H, sy + glow); y++) {
    for (let x = sx - glow * 2; x < sx + glow * 2; x++) {
      const d = Math.hypot((x - sx) / 2, y - sy) / glow;
      if (d < 1 && bayer(x, y) < (1 - d) * (1 - d) * 0.8) B.tint(x, y, pal.sun, 0.35);
    }
  }
  // Перистые облака
  for (let i = 0; i < W / 60; i++) {
    const x0 = hash2(i, 7, 3) * W;
    const y0 = H * 0.15 + hash2(i, 8, 3) * H * 0.35;
    const len = 30 + hash2(i, 9, 3) * 80;
    for (let k = 0; k < len; k++) if (bayer(x0 + k, y0) < 0.6) B.tint(x0 + k, y0 + Math.sin(k * 0.08) * 2, pal.cloud[0], 0.45);
  }
  // Кучевые облака (в видимой полосе над горами)
  const n = Math.round((pal.clouds * W) / 1200);
  for (let i = 0; i < n; i++) {
    const w = 40 + hash2(i, 1, 5) * 90;
    cumulus(B, hash2(i, 2, 5) * W, H * 0.42 + hash2(i, 3, 5) * H * 0.42, w, w * 0.32, pal.cloud, i * 13 + 1, skyAt);
  }
  // Птицы
  if (t !== 'snow') {
    for (let i = 0; i < W / 250; i++) {
      const bx = hash2(i, 4, 9) * W;
      const by = H * 0.55 + hash2(i, 5, 9) * H * 0.3;
      for (let k = 0; k < 3; k++) {
        const x = bx + k * 7;
        const y = by + (k % 2) * 3;
        B.p(x - 1, y - 1, '#3a3a44');
        B.p(x, y, '#3a3a44');
        B.p(x + 1, y - 1, '#3a3a44');
      }
    }
  }
  return B.canvas();
}

// ───────────────────────── дальние горы ─────────────────────────

function ridged(x: number, seed: number): number {
  const n = fbm(x, seed * 0.37, 4, seed);
  return 1 - Math.abs(n * 2 - 1);
}

/** Дальние горы (параллакс): задний дымчатый хребет и передний со светотенью склонов. */
export function drawFar(t: BattleTerrain, W: number, H: number): HTMLCanvasElement {
  const B = new Buf(W, H);
  const pal = PAL[t];
  const haze = pal.sky[3];
  const range = (base: number, amp: number, freq: number, seed: number, rock: string, snowLine: number, hazeK: number, kind: 'peaks' | 'mesa' | 'dunes' | 'hills') => {
    const hAt = (x: number) => {
      if (kind === 'mesa') {
        const n = fbm(x * freq, seed, 3, seed);
        const step = Math.round(n * 4) / 4;
        const blend = Math.max(0, Math.min(1, (n * 4 - Math.floor(n * 4) - 0.3) * 4));
        return base - amp * (step * 0.7 + blend * 0.1);
      }
      if (kind === 'dunes') return base - amp * (0.5 + 0.5 * Math.sin(x * freq * 6 + fbm(x * freq, seed, 2, seed) * 5));
      if (kind === 'hills') return base - amp * fbm(x * freq, seed, 3, seed);
      return base - amp * (0.35 * fbm(x * freq * 0.5, seed, 2, seed + 3) + 0.65 * ridged(x * freq, seed));
    };
    for (let x = 0; x < W; x++) {
      const top = Math.round(hAt(x));
      // Крупный рельеф: склон, смотрящий влево (к свету), светлее; переход с дизерингом
      const dh = hAt(x - 5) - hAt(x + 5);
      const litK = Math.max(0, Math.min(1, dh / 10 + 0.5));
      for (let y = Math.max(0, top); y < H; y++) {
        const depth = (y - top) / Math.max(1, H - top);
        const d = bayer(x, y);
        let c = litK > 0.62 + d * 0.25 ? ramp(rock, 1) : litK < 0.3 + d * 0.25 ? ramp(rock, -1) : rock;
        // Косые пласты скал на теневой стороне
        // Редкие тёмные расщелины, стекающие по теневым склонам
        if (kind === 'peaks' && depth < 0.45 && litK < 0.4 && hash2(Math.floor((x - (y - top) * 0.8) / 3), 1, seed) < 0.1) c = ramp(rock, -2);
        if (kind === 'mesa' && (y - top) % 6 === 0 && depth > 0.05) c = ramp(rock, -1);
        // Снег на вершинах
        const snowD = (snowLine - top) * 0.55 + fbm(x * 0.08, 1, 2, seed) * 5 - 2;
        if (pal.farSnow && top < snowLine && y - top < snowD) c = litK > 0.45 + d * 0.2 ? '#f2f5f8' : '#b4c2d6';
        if (y <= top) c = ramp(c, litK > 0.5 ? 1 : 0);
        B.p(x, y, mix(c, haze, hazeK * (1 - depth * 0.5)));
      }
    }
  };
  if (t === 'desert') {
    range(H - 6, 42, 0.012, 11, pal.farBack, -99, 0.45, 'mesa');
    range(H, 22, 0.006, 21, pal.far, -99, 0.15, 'dunes');
  } else if (t === 'steppe') {
    range(H - 10, 30, 0.01, 11, pal.farBack, -99, 0.5, 'hills');
    range(H, 14, 0.02, 21, pal.far, -99, 0.25, 'hills');
  } else if (t === 'dry') {
    range(H - 8, 55, 0.012, 11, pal.farBack, -99, 0.45, 'peaks');
    range(H, 34, 0.02, 21, pal.far, -99, 0.15, 'peaks');
  } else {
    range(H - 8, 70, 0.011, 11, pal.farBack, H - 50, 0.3, 'peaks');
    range(H, 42, 0.018, 21, pal.far, H - 30, 0.06, 'peaks');
  }
  // Лес у подножия
  if (t === 'grass' || t === 'forest' || t === 'snow') {
    for (let x = 0; x < W; x++) {
      const h = 3 + fbm(x * 0.05, 5, 2, 9) * 7;
      for (let y = H - h; y < H; y++) if (bayer(x, y) < 0.75) B.p(x, y, mix(pal.midTree, haze, 0.35));
    }
  }
  return B.canvas();
}

// ───────────────────────── холмы и лес ─────────────────────────

function pineStamp(h: number, c: string, snow: boolean): Stamp {
  const w = Math.max(5, Math.round(h * 0.55));
  const S = new Stamp(w + 2, h + 3);
  const cx = Math.floor((w + 2) / 2);
  for (let y = 0; y < h - 2; y++) {
    const tier = (y % 4) / 4;
    const hw = Math.max(0, Math.round(((y + 2) / h) * (w / 2) * (0.7 + tier * 0.3)));
    for (let x = -hw; x <= hw; x++) {
      let cc = x < -hw / 3 ? ramp(c, 1) : x > hw / 3 ? ramp(c, -1) : c;
      if (snow && y % 4 === 0 && x < hw - 1) cc = x < 0 ? '#f4f6f8' : '#c8d4e0';
      S.p(cx + x, y + 1, cc);
    }
  }
  S.rect(cx, h - 1, 1, 2, '#4a3020');
  S.outline(ramp(c, -3));
  return S;
}

function oakStamp(size: number, c: string, seed: number): Stamp {
  const w = Math.round(size * 1.2);
  const h = Math.round(size * 1.3);
  const S = new Stamp(w + 2, h + 2);
  const r = mulberry32(seed);
  const tx = Math.floor(w / 2) + 1;
  for (let y = Math.round(h * 0.55); y < h; y++) S.p(tx, y, '#5a3a22');
  const clumps: [number, number, number][] = [];
  for (let i = 0; i < 6; i++) clumps.push([tx + (r() - 0.5) * size * 0.7, h * 0.38 + (r() - 0.5) * size * 0.4, size * (0.22 + r() * 0.14)]);
  for (const [x, y, rr] of clumps) S.disc(x, y, rr, ramp(c, -1));
  for (const [x, y, rr] of clumps) S.disc(x - rr * 0.25, y - rr * 0.3, rr * 0.7, c);
  for (const [x, y, rr] of clumps) S.disc(x - rr * 0.45, y - rr * 0.5, rr * 0.3, ramp(c, 1));
  S.outline(ramp(c, -3));
  return S;
}

function cypressStamp(h: number, c: string): Stamp {
  const S = new Stamp(7, h + 2);
  for (let y = 0; y < h - 1; y++) {
    const hw = y < 3 ? 1 : y > h - 5 ? 1 : 2;
    for (let x = -hw; x <= hw; x++) S.p(3 + x, y + 1, x < 0 ? ramp(c, 1) : x > 0 ? ramp(c, -1) : c);
  }
  S.p(3, h, '#4a3020');
  S.outline(ramp(c, -3));
  return S;
}

function palmStamp(h: number): Stamp {
  const S = new Stamp(15, h + 2);
  for (let y = 4; y < h; y++) S.p(7 + Math.round(Math.sin(y * 0.2) * 1), y, y % 2 ? '#7a5a32' : '#5a4022');
  for (const [dx, dy] of [[-6, 2], [6, 2], [-5, -1], [5, -1], [0, -3]]) {
    for (let k = 0; k <= 6; k++) S.p(7 + (dx * k) / 6, 4 + (dy * k) / 6 + (k * k) / 12, k < 3 ? '#4a7a32' : '#6a9a42');
  }
  S.outline('#2a3a1a');
  return S;
}

/** Далёкое поселение на холме: стены, башни, крыши, знамя. */
function landmark(B: Buf, t: BattleTerrain, x: number, base: number, seed: number) {
  const r = mulberry32(seed);
  const S = new Stamp(46, 34);
  const kind = t === 'desert' ? 'mud' : t === 'steppe' ? 'yurts' : t === 'snow' ? 'church' : r() < 0.5 ? 'castle' : 'village';
  if (kind === 'castle') {
    S.rect(6, 18, 32, 14, '#b8b0a0');
    for (let i = 6; i < 38; i += 3) S.rect(i, 16, 2, 2, '#b8b0a0');
    for (const tx of [4, 18, 34]) {
      S.rect(tx, 10, 7, 22, '#c8c0b0');
      S.rect(tx + 5, 10, 2, 22, '#948c7c');
      for (let k = 0; k < 5; k++) S.rect(tx + 3 - k / 1.5, 5 + k, 1 + (k * 4) / 3, 1, k % 2 ? '#8a3a2a' : '#a8483a');
    }
    S.rect(20, 1, 1, 6, '#3a2a20');
    S.rect(21, 1, 4, 3, '#3a6cc4');
    S.rect(20, 24, 4, 8, '#3a302a');
  } else if (kind === 'village') {
    for (const [hx, hw] of [[3, 11], [15, 13], [29, 12]] as [number, number][]) {
      S.rect(hx, 22, hw, 10, '#e6dcc4');
      S.rect(hx + hw - 3, 22, 3, 10, '#c4b89c');
      for (let k = 0; k < 6; k++) S.rect(hx - 1 + k, 21 - k, hw + 2 - k * 2, 1, k < 2 ? '#8a3a2a' : '#a8483a');
      S.rect(hx + 3, 26, 2, 6, '#4a3020');
    }
    // мельница
    S.rect(40, 16, 4, 16, '#d8ccb0');
    for (const [dx, dy] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) for (let k = 1; k < 6; k++) S.p(42 + (dx * k) / 5, 16 + (dy * k) / 5, '#6a5040');
  } else if (kind === 'mud') {
    S.rect(4, 20, 36, 12, '#d8b888');
    S.rect(30, 20, 10, 12, '#bc9a6a');
    for (let k = 0; k < 7; k++) S.rect(16 - k * 0.8, 13 + k, 2 + k * 1.6, 1, '#e0c898');
    S.rect(36, 6, 4, 26, '#e0c898');
    S.rect(35, 5, 6, 2, '#bc9a6a');
    for (const wx of [8, 22, 26]) S.rect(wx, 25, 2, 3, '#5a4028');
  } else if (kind === 'yurts') {
    for (const yx of [6, 20, 32]) {
      for (let k = 0; k < 7; k++) S.rect(yx - k, 22 + k, 2 + k * 2, 1, k < 2 ? '#c8c0b0' : '#e8e2d4');
      S.rect(yx - 7, 29, 16, 3, '#e8e2d4');
      S.rect(yx, 28, 2, 4, '#a83a2a');
    }
    S.rect(26, 8, 1, 14, '#5a4028');
    S.rect(27, 8, 4, 3, '#e0aa24');
  } else {
    S.rect(12, 18, 20, 14, '#7a5436');
    for (let k = 0; k < 8; k++) S.rect(12 + k, 17 - k, 20 - k * 2, 1, '#e8eef4');
    S.rect(20, 3, 4, 8, '#7a5436');
    S.disc(22, 3, 2.5, '#3a6a4a');
    S.rect(19, 24, 5, 8, '#3a2a1c');
  }
  S.outline('#2a2622');
  // Лёгкая дымка расстояния
  for (const [i, c] of S.px) S.px.set(i, mix(c, PAL[t].sky[3], 0.18));
  S.put(B, x - 23, base - 32);
}

/** Средний план: холмы с полями и живыми изгородями, лес, далёкие поселения. */
export function drawMid(t: BattleTerrain, W: number, H: number): HTMLCanvasElement {
  const B = new Buf(W, H);
  const pal = PAL[t];
  const tops: number[] = [];
  const topAt = (x: number) => H - (12 + fbm(x * 0.012, 7, 3, 5) * 24);
  const fieldsOn = t === 'grass' || t === 'dry' || t === 'steppe';
  const fieldColors = t === 'steppe' ? ['#b8b070', '#9a9258', '#c4bc80'] : t === 'dry' ? ['#c8b068', '#8a6a44', '#a0a458'] : ['#d8c060', '#8a6a44', '#7aa04a'];
  for (let x = 0; x < W; x++) {
    const top = Math.round(topAt(x));
    tops.push(top);
    const dh = topAt(x - 6) - topAt(x + 6);
    const litK = Math.max(0, Math.min(1, dh / 8 + 0.5));
    for (let y = top; y < H; y++) {
      const depth = y - top;
      const d = bayer(x, y);
      // Светотень только у гребня, ниже — ровный склон
      const k = depth < 10 ? litK : 0.5;
      let c = k > 0.66 + d * 0.2 ? ramp(pal.mid, 1) : k < 0.28 + d * 0.2 ? ramp(pal.mid, -1) : pal.mid;
      const n = hash2(x, y, 3);
      if (n < 0.06) c = ramp(c, -1);
      else if (n > 0.96) c = ramp(c, 1);
      // Поля: косые полосы, повторяющие склон; борозды идут вдоль холма
      if (fieldsOn && depth > 5) {
        const u = x + depth * 2.2 + fbm(x * 0.01, y * 0.05, 2, 2) * 30;
        const seg = Math.floor(u / 38);
        const kind = Math.floor(hash2(seg, 1, 7) * 5);
        const edge = u - seg * 38 < 1.5;
        if (edge) c = d < 0.8 ? ramp(pal.midTree, 0) : c;
        else if (kind < 3 && depth > 5 + hash2(seg, 2, 7) * 4) {
          c = fieldColors[kind];
          if (kind === 1 && (depth + Math.floor(x / 40)) % 2 === 0) c = ramp(c, -1);
          if (kind === 0 && d < 0.18) c = ramp(c, 1);
          if (kind === 2 && d < 0.12) c = ramp(c, -1);
        }
      }
      if (depth < 1) c = ramp(c, 1);
      B.p(x, y, c);
    }
  }
  // Поселения на вершинах
  const marks = Math.max(1, Math.round(W / 700));
  for (let i = 0; i < marks; i++) {
    let bx = Math.round(((i + 0.5) / marks) * W + (hash2(i, 1, 11) - 0.5) * 200);
    // подвинуть к ближайшей вершине
    for (let k = 0; k < 40; k++) if (tops[bx + 1] !== undefined && tops[bx + 1] < tops[bx]) bx++;
    landmark(B, t, bx, (tops[bx] ?? H - 30) + 3, i * 7 + 3);
  }
  // Деревья
  const density = t === 'forest' ? 0.7 : t === 'snow' ? 0.35 : t === 'grass' ? 0.16 : t === 'dry' ? 0.12 : t === 'desert' ? 0.03 : 0.015;
  for (let x = 3; x < W - 3; x += 3) {
    const cluster = fbm(x * 0.02, 9, 2, 13);
    if (hash2(x, 9, 2) > density * (0.5 + cluster)) continue;
    const top = tops[x];
    const y = top + 2 + Math.floor(hash2(x, 12, 2) * (t === 'forest' ? 10 : 4));
    if (t === 'desert') {
      const S = palmStamp(12 + Math.floor(hash2(x, 3, 4) * 6));
      S.put(B, x - 7, y - S.h + 2);
    } else if (t === 'dry' && hash2(x, 13, 2) < 0.6) {
      const S = cypressStamp(11 + Math.floor(hash2(x, 3, 4) * 7), pal.midTree);
      S.put(B, x - 3, y - S.h + 2);
    } else if (t === 'snow' || (t === 'forest' && hash2(x, 11, 2) < 0.45)) {
      const S = pineStamp(10 + Math.floor(hash2(x, 10, 2) * 9), t === 'snow' ? '#2e4d3a' : '#2a5236', t === 'snow');
      S.put(B, x - Math.floor(S.w / 2), y - S.h + 2);
    } else if (t !== 'steppe' || hash2(x, 14, 2) < 0.3) {
      const S = oakStamp(7 + Math.floor(hash2(x, 10, 2) * 6), pal.midTree, x);
      S.put(B, x - Math.floor(S.w / 2), y - S.h + 2);
    }
  }
  return B.canvas();
}

// ───────────────────────── земля ─────────────────────────

/** Земля поля боя: текстура, колеи, пятна вытоптанной земли, трава, цветы, камни. */
export function drawGround(t: BattleTerrain, W: number, H: number): HTMLCanvasElement {
  const B = new Buf(W, H);
  const pal = PAL[t];
  const g = pal.ground;
  for (let y = 0; y < H; y++) {
    const far = Math.max(0, 1 - y / 26); // дымка у горизонта
    for (let x = 0; x < W; x++) {
      const n = fbm(x * 0.022, y * 0.07, 3, 13);
      let c = n < 0.38 ? g[1] : n > 0.66 ? g[2] : g[0];
      const r = hash2(x, y, 17);
      if (r < 0.07) c = ramp(c, -1);
      else if (r > 0.96) c = ramp(c, 1);
      // Вытоптанная земля с рваным краем
      const mud = valueNoise(x * 0.012, y * 0.05, 19);
      if (y > 18 && mud > 0.7 - bayer(x, y) * 0.03) c = r < 0.4 ? pal.dirt : r < 0.5 ? ramp(pal.dirt, 1) : r > 0.93 ? ramp(pal.dirt, -1) : mix(pal.dirt, g[0], 0.15);
      // Колеи дороги
      const ry = H * 0.42 + Math.sin(x * 0.006) * 10 + fbm(x * 0.01, 3, 2, 4) * 8;
      if (t !== 'desert' && t !== 'snow' && (Math.abs(y - ry) < 1.2 || Math.abs(y - ry - 7) < 1.2)) c = ramp(pal.dirt, -1);
      else if (t !== 'desert' && t !== 'snow' && y > ry - 1 && y < ry + 8 && bayer(x, y) < 0.55) c = pal.dirt;
      // Пустыня: рябь песка; снег: голубые тени сугробов
      if (t === 'desert' && Math.sin(x * 0.07 + y * 0.8 + fbm(x * 0.01, y * 0.02, 2, 5) * 8) > 0.95) c = ramp(c, 1);
      if (t === 'desert' && Math.sin(x * 0.07 + y * 0.8 + fbm(x * 0.01, y * 0.02, 2, 5) * 8) < -0.97) c = mix(c, g[1], 0.6);
      if (t === 'snow' && valueNoise(x * 0.03, y * 0.09, 8) > 0.6 && bayer(x, y) < 0.4) c = '#d0dae6';
      if (far > 0 && bayer(x, y) < far * 0.7) c = mix(c, pal.mid, 0.35);
      B.p(x, y, c);
    }
  }
  const r = mulberry32(t.length * 97 + 5);
  const count = Math.round(W * H * 0.0045);
  for (let i = 0; i < count; i++) {
    const x = r() * W;
    const y = 4 + r() * (H - 6);
    const s = 0.6 + (y / H) * 1.3; // перспектива: у зрителя крупнее
    const roll = r();
    if (roll < 0.62) {
      // Пучок травы: несколько травинок с тёмным основанием и светлым кончиком
      if (t === 'desert' && roll > 0.12) continue;
      const blades = 2 + Math.floor(r() * 3);
      const tall = t === 'steppe' ? 4 + s * 4 : 2 + s * 2.2;
      for (let b = 0; b < blades; b++) {
        const bx = x + b - blades / 2;
        const lean = (r() - 0.5) * 2;
        const hh = tall * (0.6 + r() * 0.5);
        for (let k = 0; k < hh; k++) {
          const c = k < hh * 0.4 ? ramp(pal.tuft, -1) : k > hh * 0.75 ? ramp(pal.tuft, 1) : pal.tuft;
          B.p(bx + (lean * k) / hh, y - k, t === 'snow' && k > hh * 0.6 ? '#f2f5f7' : c);
        }
      }
    } else if (roll < 0.78 && pal.flowers.length) {
      const c = pal.flowers[Math.floor(r() * pal.flowers.length)];
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const fx = x + (r() - 0.5) * 5 * s;
        const fy = y + (r() - 0.5) * 3;
        B.p(fx, fy + 1, ramp(pal.tuft, -1));
        B.p(fx, fy, c);
        if (s > 1.2) {
          B.p(fx - 1, fy, c);
          B.p(fx + 1, fy, c);
          B.p(fx, fy - 1, c);
          B.p(fx, fy, '#f0d050');
        }
      }
    } else if (roll < 0.86) {
      // Камень со светом слева-сверху и тенью
      const w = Math.max(2, Math.round((1.5 + r() * 2.5) * s));
      const h = Math.max(1, Math.round(w * 0.6));
      const stone = t === 'desert' ? '#b8946a' : t === 'snow' ? '#8a8e94' : '#8e8a82';
      for (let yy = 0; yy <= h; yy++) {
        for (let xx = 0; xx <= w; xx++) {
          const nx = (xx / w) * 2 - 1;
          const ny = (yy / h) * 2 - 1;
          if (nx * nx + ny * ny > 1.05) continue;
          const c = nx + ny < -0.6 ? ramp(stone, 1) : nx + ny > 0.6 ? ramp(stone, -1) : stone;
          B.p(x + xx, y + yy - h, c);
        }
      }
      for (let xx = 1; xx <= w + 1; xx++) B.tint(x + xx, y + 1, '#000000', 0.25);
    } else if (roll < 0.93) {
      // Особые детали местности
      if (t === 'forest') {
        B.p(x, y, r() < 0.5 ? '#c86a2a' : '#a8502a');
        B.p(x + 1, y + 1, '#8a5a2a');
      } else if (t === 'desert') {
        for (let k = 0; k < 5; k++) B.line(x, y, x + (r() - 0.5) * 6 * s, y - r() * 4 * s, '#8a6a3a');
      } else if (t === 'snow') {
        B.p(x, y, '#b0bccb');
        B.p(x + 3, y + 1, '#b0bccb');
      } else if (t === 'dry') {
        for (let k = 0; k < 4 * s; k++) B.p(x + k, y + Math.round(Math.sin(k * 1.7) * 1), ramp(pal.dirt, -1));
      } else if (t === 'steppe') {
        for (let k = 0; k < 8 * s; k++) B.p(x + k * 0.4, y - k, '#e8e2c0');
      }
    }
  }
  // Кромка у горизонта
  for (let x = 0; x < W; x++) B.p(x, 0, ramp(g[0], -1));
  return B.canvas();
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

// ───────────────────────── стена осады ─────────────────────────

/** Неровная кладка со швами, светлыми верхами и тёмными низами камней. */
function masonry(B: Buf, x0: number, y0: number, w: number, h: number, base: string, rowH: number, seed: number) {
  const r = mulberry32(seed);
  for (let y = y0; y < y0 + h; y += rowH) {
    let x = x0 - Math.floor(r() * 10);
    while (x < x0 + w) {
      const bw = 7 + Math.floor(r() * 10);
      const tone = r();
      const c = tone < 0.18 ? ramp(base, 1) : tone < 0.3 ? ramp(base, -1) : base;
      const bx0 = Math.max(x0, x);
      const bx1 = Math.min(x0 + w, x + bw);
      const bh = Math.min(rowH, y0 + h - y);
      for (let yy = y; yy < y + bh; yy++) {
        for (let xx = bx0; xx < bx1; xx++) {
          let cc = c;
          if (yy === y) cc = ramp(c, 1);
          if (yy === y + bh - 1 || xx === bx1 - 1) cc = ramp(base, -2);
          if (hash2(xx, yy, seed) < 0.05) cc = ramp(c, -1);
          B.p(xx, yy, cc);
        }
      }
      x += bw;
    }
  }
}

/** Крепостная стена для осадного боя (вид сбоку, защитники справа). 340×150 арт-пикселей. */
export function drawWall(culture: string, banner: string, banner2: string): HTMLCanvasElement {
  const W = 340;
  const H = 150;
  const B = new Buf(W, H);
  const wood = culture === 'nordmark';
  const base = culture === 'horde' ? '#b0925e' : culture === 'sultanate' ? '#cdb282' : wood ? '#8a6440' : '#948c7c';
  const top = 24;
  // Стена
  if (wood) {
    for (let x = 30; x < W; x++) {
      const log = Math.floor((x - 30) / 7);
      const u = ((x - 30) % 7) / 6;
      const pointed = top - 4 + Math.abs(((x - 30) % 7) - 3);
      for (let y = pointed; y < H; y++) {
        let c = u < 0.25 ? ramp(base, 1) : u > 0.8 ? ramp(base, -2) : base;
        if (hash2(log, y >> 3, 3) < 0.1) c = ramp(c, -1);
        if ((y + log * 5) % 23 === 0) c = ramp(base, -2);
        B.p(x, y, c);
      }
    }
    for (const y of [48, 110]) for (let x = 30; x < W; x++) B.p(x, y, x % 7 === 0 ? '#3a2a1a' : '#6a5a4a');
  } else if (culture === 'horde') {
    // Саманная стена с трещинами и балками
    for (let y = top; y < H; y++) for (let x = 30; x < W; x++) {
      let c = fbm(x * 0.05, y * 0.05, 2, 3) > 0.55 ? ramp(base, 1) : base;
      if (hash2(x, y, 5) < 0.04) c = ramp(base, -1);
      B.p(x, y, c);
    }
    for (let i = 0; i < 14; i++) {
      let x = 40 + hash2(i, 1, 7) * 290;
      let y = top + 10 + hash2(i, 2, 7) * 100;
      for (let k = 0; k < 14; k++) {
        B.p(x, y, ramp(base, -2));
        x += hash2(i, k, 8) < 0.5 ? 1 : 0;
        y += 1;
      }
    }
    for (let x = 36; x < W; x += 22) B.rect(x, top + 30, 3, 3, '#5a3e24');
  } else {
    masonry(B, 30, top, W - 30, H - top, base, 7, 5);
    if (culture === 'sultanate') {
      for (let x = 30; x < W; x++) for (let y = top + 16; y < top + 21; y++) B.p(x, y, (x + y) % 6 < 3 ? '#b08a50' : '#e2cfa0');
    }
  }
  // Зубцы и боевой ход
  for (let x = 30; x < W; x += 9) {
    if (culture === 'sultanate') {
      for (let k = 0; k < 7; k++) for (let dx = 0; dx < 6 - Math.max(0, k - 3); dx++) B.p(x + dx + Math.max(0, k - 3) / 2, top - 1 - k, k > 4 ? ramp(base, 1) : base);
    } else if (!wood) {
      masonry(B, x, top - 7, 6, 7, ramp(base, culture === 'horde' ? 0 : 1), 4, x);
    }
  }
  for (let x = 30; x < W; x++) {
    B.p(x, top, ramp(base, -2));
    B.p(x, top + 1, ramp(base, -1));
  }
  // Ворота с аркой и решёткой
  const gx = 56;
  for (let y = 90; y < H; y++) {
    const half = y < 106 ? Math.round(Math.sqrt(Math.max(0, 256 - (106 - y) ** 2))) + 4 : 20;
    for (let x = gx + 20 - half - 3; x < gx + 20 + half + 3; x++) {
      const inner = x >= gx + 20 - half && x < gx + 20 + half && y >= 94;
      if (!inner) B.p(x, y, ramp(base, 2));
      else B.p(x, y, (x - gx) % 5 === 0 || (y - 94) % 6 === 0 ? '#4a4038' : (x - gx) % 5 === 1 ? '#2a2420' : '#15100c');
    }
  }
  // Башня у края
  for (let y = 6; y < H; y++) for (let x = 0; x < 34; x++) B.p(x, y, base);
  if (wood) {
    for (let y = 6; y < H; y++) for (let x = 0; x < 34; x++) B.p(x, y, x % 6 === 0 ? ramp(base, -2) : x % 6 === 1 ? ramp(base, 1) : base);
  } else masonry(B, 0, 6, 34, H - 6, ramp(base, 1), 8, 9);
  for (let y = 6; y < H; y++) {
    B.p(0, y, ramp(base, -2));
    B.p(33, y, ramp(base, -2));
    for (let x = 26; x < 33; x++) if (bayer(x, y) < 0.35) B.tint(x, y, '#000000', 0.2);
  }
  for (let x = 0; x < 34; x += 7) B.rect(x, 0, 4, 6, ramp(base, 1));
  for (const y of [30, 60, 90]) {
    B.rect(14, y - 1, 5, 10, ramp(base, -2));
    B.rect(15, y, 3, 8, '#15100c');
  }
  // Знамёна владельца с тенью складок
  for (const bx of [40, 200]) {
    B.rect(bx - 1, top + 4, 12, 1, '#3b2f25');
    for (let y = 0; y < 26; y++) {
      const w = y > 20 ? 10 - (y - 20) * 2 : 10;
      for (let x = 0; x < w; x++) B.p(bx + x + (y > 20 ? (y - 20) : 0), top + 5 + y, x % 4 === 3 ? ramp(banner, -1) : banner);
    }
    B.rect(bx + 3, top + 9, 4, 5, banner2);
  }
  // Внешняя обводка
  const out: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!B.has(x, y) && (B.has(x - 1, y) || B.has(x + 1, y) || B.has(x, y - 1) || B.has(x, y + 1))) out.push(y * W + x);
  for (const i of out) B.p(i % W, Math.floor(i / W), '#1c1612');
  return B.canvas();
}

// ───────────────────────── трибуны ристалища ─────────────────────────

/** Трибуны ристалища вместо холмов: зрители, полосатые навесы, королевская ложа, флажки, ограда. */
export function drawArena(W: number, H: number, colors: string[]): HTMLCanvasElement {
  const B = new Buf(W, H);
  const wood = '#7a5332';
  const woodD = '#4e3420';
  const r = mulberry32(31);
  // Ярусы трибун: доски, зрители с головами, шапками и поднятыми руками
  for (let tier = 0; tier < 4; tier++) {
    const y = 16 + tier * 9;
    for (let x = 0; x < W; x++) {
      B.p(x, y + 7, woodD);
      B.p(x, y + 8, x % 9 === 0 ? woodD : wood);
    }
    for (let x = 1; x < W; x += 3) {
      if (hash2(x, tier, 31) < 0.1) continue;
      const c = colors[Math.floor(hash2(x, tier, 32) * colors.length)];
      const skin = hash2(x, tier, 33) < 0.5 ? '#e8bc94' : '#c89068';
      const hat = hash2(x, tier, 34);
      B.rect(x, y + 3, 2, 4, c);
      B.p(x + 1, y + 4, ramp(c, -1));
      B.p(x, y + 2, skin);
      B.p(x + 1, y + 2, ramp(skin, -1));
      B.p(x, y + 1, hat < 0.3 ? c : hat < 0.55 ? '#4a3520' : hat < 0.7 ? '#e8e0d0' : skin);
      if (hash2(x, tier, 35) < 0.12) {
        B.p(x - 1, y + 1, skin);
        B.p(x - 1, y + 2, c);
      }
    }
  }
  // Королевская ложа в центре каждого пролёта
  for (let x0 = 100; x0 < W; x0 += 420) {
    B.rect(x0, 8, 40, 42, woodD);
    for (let x = x0 + 1; x < x0 + 39; x++) for (let y = 12; y < 49; y++) B.p(x, y, (x - x0) % 8 < 4 ? '#8a2a2a' : '#6a1e1e');
    for (let k = 0; k < 8; k++) B.rect(x0 - 2 + k, 8 - k, 44 - k * 2, 1, '#d9a834');
    B.rect(x0 + 17, 28, 6, 8, '#3a6cc4');
    B.p(x0 + 19, 26, '#e8bc94');
    B.p(x0 + 20, 26, '#e8bc94');
    B.rect(x0 + 18, 24, 4, 2, '#d9a834');
  }
  // Полосатые навесы с фестонами
  for (let x = 6; x < W; x += 46) {
    const c = colors[Math.floor(r() * colors.length)];
    const c2 = '#ece4d0';
    for (let k = 0; k < 30; k++) {
      const cc = Math.floor(k / 3) % 2 ? c2 : c;
      for (let y = 4; y < 10; y++) B.p(x + k, y, y === 4 ? ramp(cc, 1) : cc);
      if (k % 6 < 4) B.p(x + k, 10, cc);
      if (k % 6 < 2) B.p(x + k, 11, cc);
    }
    B.v(x, 0, 50, woodD);
    B.v(x + 30, 0, 50, woodD);
    // флажки на верёвке
    for (let k = 0; k < 5; k++) {
      const fx = x + 3 + k * 6;
      const fc = colors[(k + Math.floor(x / 46)) % colors.length];
      B.p(fx, 1, fc);
      B.p(fx + 1, 1, fc);
      B.p(fx, 2, fc);
    }
    B.rect(x + 12, 0, 6, 3, c);
  }
  // Ограда поля (барьер ристалища)
  for (let x = 0; x < W; x++) {
    B.p(x, H - 11, ramp(wood, 1));
    B.p(x, H - 10, wood);
    B.p(x, H - 9, woodD);
    B.p(x, H - 5, ramp(wood, 1));
    B.p(x, H - 4, wood);
    B.p(x, H - 3, woodD);
  }
  for (let x = 0; x < W; x += 14) {
    B.v(x, H - 13, H - 1, woodD);
    B.v(x + 1, H - 13, H - 1, wood);
  }
  return B.canvas();
}

// ───────────────────────── объекты на поле ─────────────────────────

function stampCanvas(S: Stamp): HTMLCanvasElement {
  const B = new Buf(S.w, S.h);
  S.put(B, 0, 0);
  return B.canvas();
}

/** Дерево рощи на поле боя (в арт-пикселях, рисуется ×2). */
export function drawFieldTree(t: BattleTerrain, variant: number): HTMLCanvasElement {
  const pal = PAL[t];
  const seed = variant * 131 + t.length * 17;
  if (t === 'snow' || (t === 'forest' && variant % 2 === 0)) return stampCanvas(pineStamp(38 + (variant % 3) * 6, t === 'snow' ? '#2e4d3a' : '#2a5236', t === 'snow'));
  if (t === 'dry' && variant % 2 === 1) return stampCanvas(cypressStamp(34 + (variant % 3) * 5, pal.midTree));
  const S = oakStamp(24 + (variant % 3) * 5, t === 'dry' ? '#5e6e34' : pal.midTree === '#2c4e28' ? '#35602e' : '#447a38', seed);
  return stampCanvas(S);
}

/** Куст подлеска. */
export function drawBush(t: BattleTerrain, variant: number): HTMLCanvasElement {
  const c = t === 'snow' ? '#4a6a52' : t === 'dry' ? '#6a7a3a' : '#4a7a38';
  const S = new Stamp(16, 10);
  const r = mulberry32(variant * 7 + 3);
  for (let i = 0; i < 4; i++) S.disc(4 + r() * 8, 5 + r() * 2, 2.5 + r() * 1.5, i % 2 ? ramp(c, 1) : c);
  if (t === 'snow') for (let x = 2; x < 14; x++) if (r() < 0.6) S.p(x, 2 + Math.floor(r() * 2), '#eef2f6');
  S.outline(ramp(c, -3));
  return stampCanvas(S);
}

/** Телега обоза: кузов, колёса, полотняный верх. */
export function drawCart(cloth: string): HTMLCanvasElement {
  const S = new Stamp(40, 26);
  // Полотняный верх дугами
  for (let x = 6; x < 32; x++) {
    const h = 7 + Math.round(Math.sin(((x - 6) / 26) * Math.PI) * 3);
    for (let y = 0; y < h; y++) S.p(x, 12 - y, y < 2 ? ramp('#e8dcc0', -1) : x % 6 === 0 ? ramp('#e8dcc0', -1) : '#e8dcc0');
  }
  for (let x = 8; x < 30; x++) S.p(x, 9, cloth);
  // Кузов
  S.rect(4, 12, 30, 6, '#7a5332');
  for (let x = 4; x < 34; x += 5) S.rect(x, 12, 1, 6, '#5a3a22');
  S.rect(4, 12, 30, 1, '#9a7042');
  // Оглобли
  for (let k = 0; k < 6; k++) S.p(34 + k, 16 + Math.floor(k / 3), '#5a3a22');
  // Колёса
  for (const wx of [10, 27]) {
    for (let a = 0; a < 16; a++) {
      const an = (a / 16) * Math.PI * 2;
      S.p(wx + Math.round(Math.cos(an) * 4), 20 + Math.round(Math.sin(an) * 4), '#4a3020');
    }
    S.p(wx, 20, '#8a8a80');
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) S.p(wx + dx, 20 + dy, '#6a4a2a');
  }
  S.outline('#1c1612');
  return stampCanvas(S);
}

/**
 * Холм поперёк поля: гребень над дальним краем, освещённый склон, тёмная передняя грань.
 * w, h — в арт-пикселях; lift — подъём вершины в арт-пикселях.
 */
export function drawHill(t: BattleTerrain, w: number, h: number, lift: number): HTMLCanvasElement {
  const B = new Buf(w, h);
  const pal = PAL[t];
  const g = pal.ground;
  const top0 = 30; // где у подножия проходит дальний край поля
  for (let x = 0; x < w; x++) {
    const u = x / (w - 1);
    const e = Math.min(1, Math.sin(u * Math.PI) * 1.35);
    const crest = Math.round(top0 - e * (lift + 12) + fbm(x * 0.05, 2, 2, 3) * 3 * e);
    const face = Math.round(h - 16 - e * lift * 0.9);
    const slope = Math.cos(u * Math.PI); // + — левый склон (к свету)
    for (let y = Math.max(0, crest); y < h; y++) {
      const edgeFade = Math.min(1, e * 3);
      if (bayer(x, y) > edgeFade) continue;
      let c: string;
      if (y > face) {
        // Передняя грань — в тени, с полосками земли
        c = y - face < 2 ? ramp(g[1], -1) : hash2(x, y, 5) < 0.2 ? pal.dirt : ramp(g[1], -1);
        if (y > h - 6) c = mix(c, g[0], 0.5);
      } else {
        // Освещённый левый склон светлее, правый — в тени; горизонтали подчёркивают рельеф
        const lit = slope * 0.8 + e * 0.35;
        c = lit > 0.55 ? ramp(g[2], 1) : lit > 0.2 ? g[2] : lit > -0.15 ? g[0] : lit > -0.45 ? g[1] : ramp(g[1], -1);
        const contour = Math.abs(((e * 5) % 1) - 0.5) < 0.04 && e < 0.95;
        if (contour && bayer(x, y) < 0.6) c = ramp(c, -1);
        const n = hash2(x, y, 9);
        if (n < 0.08) c = ramp(c, -1);
        else if (n > 0.95) c = ramp(c, 1);
        if (y - crest < 2) c = ramp(c, 1);
      }
      B.p(x, y, c);
    }
    // Травинки по гребню
    if (e > 0.3 && hash2(x, 3, 7) < 0.35 && t !== 'desert') for (let k = 1; k < 3; k++) B.p(x, crest - k, pal.tuft);
  }
  return B.canvas();
}

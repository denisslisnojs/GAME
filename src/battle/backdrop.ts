// «Живописный» фон поля боя: те же слои и та же геометрия, что у пиксельного фона (background.ts),
// но рисуется средствами Canvas 2D — плавные градиенты, мягкие облака, гладкие склоны,
// деревья и постройки со светотенью и тонким контуром, как у воинов.
// Все размеры — в «арт-пикселях» (1 арт-пиксель = 2 пикселя мира); q — сколько точек текстуры
// приходится на арт-пиксель (чёткость).

import { mix, ramp, rgb } from '../gfx/color';
import { fbm, hash2, mulberry32, valueNoise } from '../util/rng';
import { PAL, type BattleTerrain } from './background';

type G = CanvasRenderingContext2D;
type Pt = [number, number];

const OUT = '#1c1612';

function surface(w: number, h: number, q: number): { c: HTMLCanvasElement; g: G } {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * q));
  c.height = Math.max(1, Math.round(h * q));
  const g = c.getContext('2d')!;
  g.scale(q, q);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  return { c, g };
}

const toneCache = new Map<string, string>();
/** Тон со сдвигом по «лесенке» (дробный шаг — плавно). */
function tone(c: string, step: number): string {
  const k = `${c}${step}`;
  let v = toneCache.get(k);
  if (!v) {
    v = step === 0 ? c : ramp(c, step);
    toneCache.set(k, v);
  }
  return v;
}

const mixCache = new Map<string, string>();
/** Смешение с кешем (t округляется до 1/32). */
function mx(a: string, b: string, t: number): string {
  const q = Math.round(Math.max(0, Math.min(1, t)) * 32);
  const k = `${a}${b}${q}`;
  let v = mixCache.get(k);
  if (!v) {
    v = mix(a, b, q / 32);
    mixCache.set(k, v);
  }
  return v;
}

function rgba(c: string, a: number): string {
  const [r, gg, b] = rgb(c);
  return `rgba(${r},${gg},${b},${a})`;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function polyPath(g: G, pts: Pt[]) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

/** Заливка многоугольника с градиентом слева-направо (свет слева) и тонким контуром. */
function shapeLR(g: G, pts: Pt[], c: string, ow = 0.45, x0?: number, x1?: number) {
  let a = Infinity;
  let b = -Infinity;
  for (const [x] of pts) {
    a = Math.min(a, x);
    b = Math.max(b, x);
  }
  const gr = g.createLinearGradient(x0 ?? a, 0, x1 ?? b, 0);
  gr.addColorStop(0, tone(c, 0.9));
  gr.addColorStop(0.35, c);
  gr.addColorStop(1, tone(c, -1.3));
  polyPath(g, pts);
  g.fillStyle = gr;
  g.fill();
  if (ow > 0) {
    g.lineWidth = ow;
    g.strokeStyle = mx(c, OUT, 0.75);
    g.stroke();
  }
}

/** Прямоугольник-брусок со светотенью. */
function box(g: G, x: number, y: number, w: number, h: number, c: string, ow = 0.45) {
  shapeLR(g, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], c, ow);
}

/** Круг с объёмом: свет слева сверху. */
function ball(g: G, x: number, y: number, r: number, c: string, lo = -1.2, hi = 0.8) {
  const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.45, 0, x - r * 0.1, y - r * 0.1, r * 1.25);
  gr.addColorStop(0, tone(c, hi));
  gr.addColorStop(0.5, c);
  gr.addColorStop(1, tone(c, lo));
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, Math.max(0.2, r), 0, Math.PI * 2);
  g.fill();
}

/** Внешняя обводка готового рисунка: силуэт тёмным цветом под ним. */
function outlined(src: HTMLCanvasElement, r: number, color = OUT): HTMLCanvasElement {
  const sil = document.createElement('canvas');
  sil.width = src.width;
  sil.height = src.height;
  const s = sil.getContext('2d')!;
  s.drawImage(src, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = color;
  s.fillRect(0, 0, sil.width, sil.height);
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const o = out.getContext('2d')!;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    o.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r);
  }
  o.drawImage(src, 0, 0);
  return out;
}

// ───────────────────────── небо ─────────────────────────

function cumulus(g: G, cx: number, cy: number, w: number, h: number, pal: [string, string, string], seed: number, q: number) {
  const r = mulberry32(seed);
  const blobs: [number, number, number][] = [];
  const n = 5 + Math.floor(w / 14);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const rr = h * (0.3 + Math.sin(t * Math.PI) * 0.45) * (0.8 + r() * 0.35);
    blobs.push([cx - w / 2 + t * w, cy + h * 0.25 - rr * 0.5 + (r() - 0.5) * 3, rr]);
  }
  const bottom = cy + h * 0.45;
  // Облако рисуется отдельно (чтобы затенить низ только у него) и мягко размывается
  const pad = h * 1.4;
  const ox = cx - w / 2 - pad;
  const oy = cy - h * 1.3;
  const W = w + pad * 2;
  const H = bottom - oy + 2;
  const { c, g: cg } = surface(W, H, q);
  cg.translate(-ox, -oy);
  cg.save();
  cg.beginPath();
  cg.rect(ox, oy, W, bottom - oy);
  cg.clip();
  const layer = (dx: number, dy: number, k: number, col: string) => {
    cg.fillStyle = col;
    for (const [bx, by, br] of blobs) {
      cg.beginPath();
      cg.arc(bx + dx * br, by + dy * br, br * k, 0, Math.PI * 2);
      cg.fill();
    }
  };
  layer(0, 0, 1, pal[2]);
  layer(-0.12, -0.16, 0.9, pal[1]);
  layer(-0.3, -0.36, 0.62, pal[0]);
  cg.restore();
  // Затенённый плоский низ
  cg.globalCompositeOperation = 'source-atop';
  const sh = cg.createLinearGradient(0, bottom - h * 0.5, 0, bottom);
  sh.addColorStop(0, rgba(pal[2], 0));
  sh.addColorStop(1, rgba(pal[2], 0.85));
  cg.fillStyle = sh;
  cg.fillRect(ox, bottom - h * 0.5, W, h * 0.5 + 2);
  g.save();
  g.filter = `blur(${(0.9 * q).toFixed(2)}px)`;
  g.drawImage(c, ox, oy, W, H);
  g.restore();
}

/** Небо: плавный градиент, свечение солнца, кучевые и перистые облака, птицы. */
export function paintSky(t: BattleTerrain, W: number, H: number, q = 1): HTMLCanvasElement {
  const { c, g } = surface(W, H, q);
  const pal = PAL[t];
  const s = pal.sky;
  const lg = g.createLinearGradient(0, 0, 0, H);
  s.forEach((col, i) => lg.addColorStop(i / (s.length - 1), col));
  g.fillStyle = lg;
  g.fillRect(0, 0, W, H);
  // Свечение солнца
  const glow = t === 'desert' ? 170 : 120;
  g.save();
  g.translate(W * 0.62, H * 0.55);
  g.scale(2, 1);
  const sg = g.createRadialGradient(0, 0, 0, 0, 0, glow);
  sg.addColorStop(0, rgba(pal.sun, 0.55));
  sg.addColorStop(0.45, rgba(pal.sun, 0.2));
  sg.addColorStop(1, rgba(pal.sun, 0));
  g.fillStyle = sg;
  g.fillRect(-glow, -glow, glow * 2, glow * 2);
  g.restore();
  // Перистые облака — длинные прозрачные мазки
  g.save();
  g.filter = `blur(${(1.4 * q).toFixed(2)}px)`;
  for (let i = 0; i < W / 60; i++) {
    const x0 = hash2(i, 7, 3) * W;
    const y0 = H * 0.15 + hash2(i, 8, 3) * H * 0.35;
    const len = 30 + hash2(i, 9, 3) * 80;
    g.fillStyle = rgba(pal.cloud[0], 0.32);
    g.beginPath();
    g.ellipse(x0 + len / 2, y0, len / 2, 1.3, (hash2(i, 10, 3) - 0.5) * 0.08, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  const n = Math.round((pal.clouds * W) / 1200);
  for (let i = 0; i < n; i++) {
    const w = 40 + hash2(i, 1, 5) * 90;
    cumulus(g, hash2(i, 2, 5) * W, H * 0.42 + hash2(i, 3, 5) * H * 0.42, w, w * 0.32, pal.cloud, i * 13 + 1, q);
  }
  if (t !== 'snow') {
    g.strokeStyle = '#3a3a44';
    g.lineWidth = 0.55;
    for (let i = 0; i < W / 250; i++) {
      const bx = hash2(i, 4, 9) * W;
      const by = H * 0.55 + hash2(i, 5, 9) * H * 0.3;
      for (let k = 0; k < 3; k++) {
        const x = bx + k * 7;
        const y = by + (k % 2) * 3;
        g.beginPath();
        g.moveTo(x - 1.4, y - 0.9);
        g.quadraticCurveTo(x - 0.5, y - 0.9, x, y);
        g.quadraticCurveTo(x + 0.5, y - 0.9, x + 1.4, y - 0.9);
        g.stroke();
      }
    }
  }
  return c;
}

// ───────────────────────── дальние горы ─────────────────────────

function ridged(x: number, seed: number): number {
  const n = fbm(x, seed * 0.37, 4, seed);
  return 1 - Math.abs(n * 2 - 1);
}

/** Дальние горы: дымчатый задний хребет и передний со светотенью склонов и снежными шапками. */
export function paintFar(t: BattleTerrain, W: number, H: number, q = 1): HTMLCanvasElement {
  const { c, g } = surface(W, H, q);
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
    const tops: number[] = [];
    for (let x = 0; x <= W + 1; x++) tops.push(hAt(x));
    const pts: Pt[] = [[0, H]];
    for (let x = 0; x <= W + 1; x++) pts.push([x, tops[x]]);
    pts.push([W + 1, H]);
    g.save();
    polyPath(g, pts);
    const lg = g.createLinearGradient(0, base - amp, 0, H);
    lg.addColorStop(0, tone(rock, 0.3));
    lg.addColorStop(1, tone(rock, -0.4));
    g.fillStyle = lg;
    g.fill();
    g.clip();
    // Светотень склонов: смотрящий влево (к свету) светлее. Строится горизонтальными градиентами —
    // плавно, без полос, и гаснет книзу
    const lite = tone(rock, 1.1);
    const dark = tone(rock, -1.2);
    const litAt = (x: number) => Math.max(0, Math.min(1, (hAt(x - 6) - hAt(x + 6)) / 12 + 0.5));
    const lightG = g.createLinearGradient(0, 0, W, 0);
    const darkG = g.createLinearGradient(0, 0, W, 0);
    const snowG = g.createLinearGradient(0, 0, W, 0);
    for (let x = 0; x <= W; x += 3) {
      const k = litAt(x);
      lightG.addColorStop(x / W, rgba(lite, Math.max(0, (k - 0.5) * 1.3)));
      darkG.addColorStop(x / W, rgba(dark, Math.max(0, (0.5 - k) * 1.3)));
      snowG.addColorStop(x / W, mx('#b4c2d6', '#f4f6fa', smooth(0.3, 0.7, k)));
    }
    const sh = surface(W, H, q);
    sh.g.fillStyle = lightG;
    sh.g.fillRect(0, 0, W, H);
    sh.g.fillStyle = darkG;
    sh.g.fillRect(0, 0, W, H);
    sh.g.globalCompositeOperation = 'destination-in';
    const fade = sh.g.createLinearGradient(0, base - amp, 0, H);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(0.4, 'rgba(0,0,0,0.55)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    sh.g.fillStyle = fade;
    sh.g.fillRect(0, 0, W, H);
    g.save();
    g.filter = `blur(${(2 * q).toFixed(2)}px)`;
    g.drawImage(sh.c, 0, 0, W, H);
    g.restore();
    // Расщелины на теневых склонах
    if (kind === 'peaks') {
      g.strokeStyle = rgba(tone(rock, -2), 0.4);
      g.lineWidth = 0.7;
      for (let x = 0; x <= W; x++) {
        if (litAt(x) >= 0.4 || hash2(x, 1, seed) >= 0.035) continue;
        const top = tops[x];
        g.beginPath();
        g.moveTo(x, top + 1);
        g.lineTo(x + (H - top) * 0.3, top + (H - top) * 0.38);
        g.stroke();
      }
    }
    // Снег на вершинах
    if (pal.farSnow) {
      const snowD = (x: number) => Math.max(0, (snowLine - tops[x]) * 0.55 + fbm(x * 0.08, 1, 2, seed) * 5 - 2);
      g.beginPath();
      g.moveTo(0, tops[0]);
      for (let x = 1; x <= W + 1; x++) g.lineTo(x, tops[x]);
      for (let x = W + 1; x >= 0; x--) g.lineTo(x, tops[x] + snowD(x));
      g.closePath();
      g.fillStyle = snowG;
      g.fill();
    }
    if (kind === 'mesa') {
      g.strokeStyle = rgba(tone(rock, -1), 0.4);
      g.lineWidth = 0.6;
      for (let k = 6; k < H; k += 6) {
        g.beginPath();
        for (let x = 0; x <= W; x += 3) (x ? g.lineTo : g.moveTo).call(g, x, tops[x] + k);
        g.stroke();
      }
    }
    // Дымка расстояния
    const hz = g.createLinearGradient(0, base - amp, 0, H);
    hz.addColorStop(0, rgba(haze, hazeK));
    hz.addColorStop(1, rgba(haze, hazeK * 0.5));
    g.fillStyle = hz;
    g.fillRect(0, 0, W + 2, H);
    g.restore();
    // Светлая кромка гребня
    g.strokeStyle = rgba(mx(rock, '#ffffff', 0.35), 0.35);
    g.lineWidth = 0.6;
    g.beginPath();
    for (let x = 0; x <= W; x += 2) (x ? g.lineTo : g.moveTo).call(g, x, tops[x] + 0.3);
    g.stroke();
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
  // Лес у подножия: полоса крон
  if (t === 'grass' || t === 'forest' || t === 'snow') {
    const col = mx(pal.midTree, haze, 0.35);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 2) g.lineTo(x, H - (3 + fbm(x * 0.05, 5, 2, 9) * 7));
    g.lineTo(W, H);
    g.fill();
    for (let x = 0; x <= W; x += 3) {
      const h = 3 + fbm(x * 0.05, 5, 2, 9) * 7;
      ball(g, x + hash2(x, 2, 9) * 2, H - h + 1, 1.6 + hash2(x, 3, 9) * 1.4, col, -0.6, 0.5);
    }
  }
  return c;
}

// ───────────────────────── деревья ─────────────────────────

/** Лиственное дерево: ствол и крона из шапок листвы со светотенью. Основание ствола — (cx, base). */
function oak(g: G, cx: number, base: number, size: number, c: string, seed: number, ow: number) {
  const r = mulberry32(seed);
  const h = size * 1.3;
  const trunkTop = base - h * 0.5;
  // Ствол с развилкой
  const bark = '#5a3a22';
  g.lineWidth = ow * 2 + size * 0.1;
  g.strokeStyle = OUT;
  g.beginPath();
  g.moveTo(cx, base);
  g.lineTo(cx, trunkTop);
  g.stroke();
  shapeLR(g, [[cx - size * 0.07, base], [cx - size * 0.04, trunkTop], [cx + size * 0.04, trunkTop], [cx + size * 0.08, base]], bark, 0);
  g.strokeStyle = bark;
  g.lineWidth = size * 0.04;
  g.beginPath();
  g.moveTo(cx, trunkTop + size * 0.15);
  g.lineTo(cx + size * 0.2, trunkTop - size * 0.08);
  g.moveTo(cx, trunkTop + size * 0.1);
  g.lineTo(cx - size * 0.18, trunkTop - size * 0.1);
  g.stroke();
  const clumps: [number, number, number][] = [];
  const cy = base - h * 0.62;
  for (let i = 0; i < 7; i++) clumps.push([cx + (r() - 0.5) * size * 0.72, cy + (r() - 0.5) * size * 0.42, size * (0.22 + r() * 0.14)]);
  clumps.sort((a, b) => b[1] - a[1]);
  // Контур кроны
  g.fillStyle = tone(c, -3);
  for (const [x, y, rr] of clumps) {
    g.beginPath();
    g.arc(x, y, rr + ow, 0, Math.PI * 2);
    g.fill();
  }
  for (const [x, y, rr] of clumps) ball(g, x, y, rr, tone(c, -0.6), -1.4, 0.2);
  for (const [x, y, rr] of clumps) ball(g, x - rr * 0.22, y - rr * 0.28, rr * 0.72, c, -0.5, 0.7);
  for (const [x, y, rr] of clumps) {
    g.fillStyle = rgba(tone(c, 1.2), 0.75);
    g.beginPath();
    g.arc(x - rr * 0.42, y - rr * 0.48, rr * 0.3, 0, Math.PI * 2);
    g.fill();
  }
  // Мелкая листва
  for (let i = 0; i < size * 1.6; i++) {
    const [x, y, rr] = clumps[Math.floor(r() * clumps.length)];
    const a = r() * Math.PI * 2;
    const d = r() * rr * 0.85;
    g.fillStyle = rgba(r() < 0.5 ? tone(c, -1.4) : tone(c, 1), 0.55);
    g.beginPath();
    g.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, size * 0.035, size * 0.025, a, 0, Math.PI * 2);
    g.fill();
  }
}

/** Ель ярусами; основание ствола — (cx, base). */
function pine(g: G, cx: number, base: number, h: number, c: string, snow: boolean, ow: number) {
  const w = Math.max(5, h * 0.55);
  shapeLR(g, [[cx - h * 0.03, base], [cx - h * 0.02, base - h * 0.2], [cx + h * 0.02, base - h * 0.2], [cx + h * 0.035, base]], '#4a3020', ow);
  const tiers = Math.max(3, Math.round(h / 8));
  for (let i = 0; i < tiers; i++) {
    const k = i / tiers;
    const yb = base - h * 0.1 - k * h * 0.78;
    const hw = (w / 2) * (1 - k * 0.72);
    const top = yb - h * 0.32;
    const pts: Pt[] = [[cx - hw, yb], [cx - hw * 0.35, yb - h * 0.05], [cx, top], [cx + hw * 0.35, yb - h * 0.05], [cx + hw, yb], [cx, yb - h * 0.035]];
    shapeLR(g, pts, c, ow, cx - hw, cx + hw);
    if (snow) {
      g.fillStyle = '#eef2f6';
      g.beginPath();
      g.moveTo(cx - hw * 0.8, yb - 0.2);
      g.quadraticCurveTo(cx - hw * 0.4, yb - h * 0.12, cx, top + h * 0.06);
      g.lineTo(cx + hw * 0.1, top + h * 0.12);
      g.quadraticCurveTo(cx - hw * 0.25, yb - h * 0.05, cx - hw * 0.8, yb - 0.2);
      g.fill();
    }
  }
}

/** Кипарис — тёмное «пламя». */
function cypress(g: G, cx: number, base: number, h: number, c: string, ow: number) {
  const w = Math.max(2.4, h * 0.14);
  g.beginPath();
  g.moveTo(cx, base - h);
  g.bezierCurveTo(cx + w * 1.1, base - h * 0.7, cx + w, base - h * 0.2, cx + w * 0.3, base);
  g.lineTo(cx - w * 0.3, base);
  g.bezierCurveTo(cx - w, base - h * 0.2, cx - w * 1.1, base - h * 0.7, cx, base - h);
  const gr = g.createLinearGradient(cx - w, 0, cx + w, 0);
  gr.addColorStop(0, tone(c, 0.9));
  gr.addColorStop(0.4, c);
  gr.addColorStop(1, tone(c, -1.4));
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = ow;
  g.strokeStyle = tone(c, -3);
  g.stroke();
  g.strokeStyle = rgba(tone(c, -1.5), 0.6);
  g.lineWidth = w * 0.12;
  for (let i = 1; i < 5; i++) {
    const y = base - h * (i / 5.5);
    g.beginPath();
    g.arc(cx, y, w * 0.6, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
  }
}

/** Пальма: изогнутый ствол и перистые листья. */
function palm(g: G, cx: number, base: number, h: number, ow: number) {
  const top: Pt = [cx + h * 0.08, base - h];
  g.lineCap = 'butt';
  for (let i = 0; i < 10; i++) {
    const k0 = i / 10;
    const k1 = (i + 1) / 10;
    const x0 = cx + Math.sin(k0 * 1.6) * h * 0.08;
    const x1 = cx + Math.sin(k1 * 1.6) * h * 0.08;
    g.strokeStyle = OUT;
    g.lineWidth = h * 0.09 + ow * 2;
    g.beginPath();
    g.moveTo(x0, base - k0 * h);
    g.lineTo(x1, base - k1 * h);
    g.stroke();
    g.strokeStyle = i % 2 ? '#8a6a3a' : '#6a4a28';
    g.lineWidth = h * 0.09;
    g.stroke();
  }
  g.lineCap = 'round';
  for (const [dx, dy] of [[-1, 0.35], [1, 0.35], [-0.8, -0.2], [0.8, -0.2], [0.1, -0.5], [-0.3, 0.6], [0.35, 0.6]] as Pt[]) {
    const ex = top[0] + dx * h * 0.45;
    const ey = top[1] + dy * h * 0.3 + h * 0.12;
    const mxp = top[0] + dx * h * 0.25;
    const myp = top[1] + dy * h * 0.1 - h * 0.08;
    g.beginPath();
    g.moveTo(top[0], top[1]);
    g.quadraticCurveTo(mxp, myp - h * 0.06, ex, ey);
    g.quadraticCurveTo(mxp, myp + h * 0.05, top[0], top[1]);
    const gr = g.createLinearGradient(top[0], top[1], ex, ey);
    gr.addColorStop(0, '#3e6a2c');
    gr.addColorStop(1, '#7aa84a');
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = ow;
    g.strokeStyle = '#1e3014';
    g.stroke();
  }
}

// ───────────────────────── средний план ─────────────────────────

/** Далёкое поселение на холме: стены, башни, крыши, знамя. (x — середина, base — низ.) */
function landmark(t: BattleTerrain, seed: number, q: number): HTMLCanvasElement {
  const r = mulberry32(seed);
  const { c, g } = surface(46, 36, q);
  g.translate(0, 2);
  const ow = 0.4;
  const kind = t === 'desert' ? 'mud' : t === 'steppe' ? 'yurts' : t === 'snow' ? 'church' : r() < 0.5 ? 'castle' : 'village';
  const roof = (x: number, y: number, w: number, h: number, col: string) => shapeLR(g, [[x - 1, y], [x + w / 2, y - h], [x + w + 1, y]], col, ow);
  if (kind === 'castle') {
    box(g, 6, 18, 32, 14, '#b8b0a0', ow);
    for (let i = 6; i < 38; i += 3) box(g, i, 16, 2, 2, '#b8b0a0', 0.3);
    for (const tx of [4, 18, 34]) {
      box(g, tx, 10, 7, 22, '#c8c0b0', ow);
      roof(tx, 10, 7, 6, '#a8483a');
    }
    g.strokeStyle = '#3a2a20';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(21.5, 5);
    g.lineTo(21.5, -1);
    g.stroke();
    g.fillStyle = '#3a6cc4';
    g.fillRect(22, -1, 4, 2.6);
    g.fillStyle = '#3a302a';
    g.beginPath();
    g.moveTo(20, 32);
    g.lineTo(20, 26);
    g.arc(22, 26, 2, Math.PI, 0);
    g.lineTo(24, 32);
    g.fill();
  } else if (kind === 'village') {
    for (const [hx, hw] of [[3, 11], [15, 13], [29, 12]] as Pt[]) {
      box(g, hx, 22, hw, 10, '#e6dcc4', ow);
      roof(hx, 22, hw, 6, '#a8483a');
      g.fillStyle = '#4a3020';
      g.fillRect(hx + 3, 26, 2, 6);
    }
    box(g, 40, 16, 4, 16, '#d8ccb0', ow);
    g.strokeStyle = '#6a5040';
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(37, 13);
    g.lineTo(47, 19);
    g.moveTo(47, 13);
    g.lineTo(37, 19);
    g.stroke();
  } else if (kind === 'mud') {
    box(g, 4, 20, 36, 12, '#d8b888', ow);
    ball(g, 17, 20, 5, '#e0c898');
    box(g, 36, 6, 4, 26, '#e0c898', ow);
    box(g, 35, 4.5, 6, 2, '#bc9a6a', ow);
    g.fillStyle = '#5a4028';
    for (const wx of [8, 22, 26]) g.fillRect(wx, 25, 2, 3);
  } else if (kind === 'yurts') {
    for (const yx of [6, 20, 32]) {
      g.beginPath();
      g.moveTo(yx - 7, 32);
      g.lineTo(yx - 7, 28);
      g.quadraticCurveTo(yx + 1, 18, yx + 9, 28);
      g.lineTo(yx + 9, 32);
      g.closePath();
      const gr = g.createLinearGradient(yx - 7, 0, yx + 9, 0);
      gr.addColorStop(0, '#f4f0e6');
      gr.addColorStop(1, '#bcb4a4');
      g.fillStyle = gr;
      g.fill();
      g.lineWidth = ow;
      g.strokeStyle = '#4a4238';
      g.stroke();
      g.fillStyle = '#a83a2a';
      g.fillRect(yx, 28.5, 2, 3.5);
    }
    g.strokeStyle = '#5a4028';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(26.5, 22);
    g.lineTo(26.5, 8);
    g.stroke();
    g.fillStyle = '#e0aa24';
    g.fillRect(27, 8, 4, 3);
  } else {
    box(g, 12, 18, 20, 14, '#7a5436', ow);
    roof(12, 18, 20, 9, '#e8eef4');
    box(g, 20, 5, 4, 8, '#7a5436', ow);
    ball(g, 22, 4, 2.5, '#3a6a4a');
    g.fillStyle = '#3a2a1c';
    g.fillRect(19, 24, 5, 8);
  }
  // Дымка расстояния
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = rgba(PAL[t].sky[3], 0.2);
  g.fillRect(0, -2, 46, 36);
  return c;
}

/** Средний план: холмы с лоскутами полей и изгородями, лес, далёкие поселения. */
export function paintMid(t: BattleTerrain, W: number, H: number, q = 2): HTMLCanvasElement {
  const { c, g } = surface(W, H, q);
  const pal = PAL[t];
  const topAt = (x: number) => H - (12 + fbm(x * 0.012, 7, 3, 5) * 24);
  const tops: number[] = [];
  for (let x = 0; x <= W + 1; x++) tops.push(topAt(x));
  const pts: Pt[] = [[0, H + 1]];
  for (let x = 0; x <= W + 1; x += 1) pts.push([x, tops[x]]);
  pts.push([W + 1, H + 1]);
  g.save();
  polyPath(g, pts);
  const lg = g.createLinearGradient(0, H - 36, 0, H);
  lg.addColorStop(0, tone(pal.mid, 0.4));
  lg.addColorStop(1, tone(pal.mid, -0.3));
  g.fillStyle = lg;
  g.fill();
  g.clip();
  // Лоскуты полей: полосы вдоль склона, разделённые изгородями
  const fieldsOn = t === 'grass' || t === 'dry' || t === 'steppe';
  const fieldColors = t === 'steppe' ? ['#b8b070', '#9a9258', '#c4bc80'] : t === 'dry' ? ['#c8b068', '#8a6a44', '#a0a458'] : ['#d8c060', '#8a6a44', '#7aa04a'];
  if (fieldsOn) {
    const edgeX = (u: number, d: number) => u - d * 2.2 - fbm(u * 0.01, d * 0.05, 2, 2) * 30;
    for (let seg = -4; seg < W / 38 + 2; seg++) {
      const u0 = seg * 38;
      const kind = Math.floor(hash2(seg, 1, 7) * 5);
      const ds = 5 + hash2(seg, 2, 7) * 4;
      const left: Pt[] = [];
      const right: Pt[] = [];
      for (let d = ds; d <= H + 2; d += 2) {
        const xl = edgeX(u0 + 1.5, d);
        const xr = edgeX(u0 + 38, d);
        left.push([xl, topAt(xl) + d]);
        right.push([xr, topAt(xr) + d]);
      }
      if (kind < 3) {
        const col = fieldColors[kind];
        polyPath(g, [...left, ...right.reverse()]);
        right.reverse();
        const fg = g.createLinearGradient(left[0][0], 0, right[0][0] + 20, 0);
        fg.addColorStop(0, tone(col, 0.5));
        fg.addColorStop(1, tone(col, -0.4));
        g.fillStyle = fg;
        g.fill();
        g.save();
        g.clip();
        // Борозды вдоль склона
        g.strokeStyle = rgba(kind === 1 ? tone(col, -1.3) : kind === 0 ? tone(col, 1.2) : tone(col, -1), kind === 1 ? 0.55 : 0.35);
        g.lineWidth = kind === 1 ? 0.8 : 0.5;
        const xa = Math.min(left[left.length - 1][0], left[0][0]) - 2;
        const xb = Math.max(right[0][0], right[right.length - 1][0]) + 2;
        for (let d = ds + 2; d < H; d += kind === 1 ? 2 : 3) {
          g.beginPath();
          for (let x = xa; x <= xb; x += 4) (x === xa ? g.moveTo : g.lineTo).call(g, x, topAt(x) + d);
          g.stroke();
        }
        g.restore();
      }
      // Изгородь по краю лоскута
      g.strokeStyle = rgba(pal.midTree, 0.9);
      g.lineWidth = 1.1;
      g.beginPath();
      left.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
  }
  // Светотень у гребня
  for (let x = 0; x <= W; x++) {
    const dh = topAt(x - 6) - topAt(x + 6);
    const litK = Math.max(0, Math.min(1, dh / 8 + 0.5));
    const col = litK > 0.5 ? rgba(tone(pal.mid, 1), (litK - 0.5) * 1.1) : rgba(tone(pal.mid, -1), (0.5 - litK) * 1.1);
    const gr = g.createLinearGradient(0, tops[x], 0, tops[x] + 10);
    gr.addColorStop(0, col);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x, tops[x], 1.05, 10);
  }
  g.restore();
  g.strokeStyle = rgba(tone(pal.mid, 1.3), 0.8);
  g.lineWidth = 0.7;
  g.beginPath();
  for (let x = 0; x <= W; x += 2) (x ? g.lineTo : g.moveTo).call(g, x, tops[x] + 0.3);
  g.stroke();
  // Поселения на вершинах
  const marks = Math.max(1, Math.round(W / 700));
  for (let i = 0; i < marks; i++) {
    let bx = Math.round(((i + 0.5) / marks) * W + (hash2(i, 1, 11) - 0.5) * 200);
    for (let k = 0; k < 40; k++) if (tops[bx + 1] !== undefined && tops[bx + 1] < tops[bx]) bx++;
    g.drawImage(landmark(t, i * 7 + 3, q), bx - 23, (tops[bx] ?? H - 30) + 3 - 34, 46, 36);
  }
  // Деревья
  const density = t === 'forest' ? 0.7 : t === 'snow' ? 0.35 : t === 'grass' ? 0.16 : t === 'dry' ? 0.12 : t === 'desert' ? 0.03 : 0.015;
  const ow = 0.35;
  for (let x = 3; x < W - 3; x += 3) {
    const cluster = fbm(x * 0.02, 9, 2, 13);
    if (hash2(x, 9, 2) > density * (0.5 + cluster)) continue;
    const y = tops[x] + 2 + Math.floor(hash2(x, 12, 2) * (t === 'forest' ? 10 : 4)) + 1;
    if (t === 'desert') palm(g, x, y, 12 + Math.floor(hash2(x, 3, 4) * 6), ow);
    else if (t === 'dry' && hash2(x, 13, 2) < 0.6) cypress(g, x, y, 11 + Math.floor(hash2(x, 3, 4) * 7), pal.midTree, ow);
    else if (t === 'snow' || (t === 'forest' && hash2(x, 11, 2) < 0.45)) pine(g, x, y, 10 + Math.floor(hash2(x, 10, 2) * 9), t === 'snow' ? '#2e4d3a' : '#2a5236', t === 'snow', ow);
    else if (t !== 'steppe' || hash2(x, 14, 2) < 0.3) oak(g, x, y, 7 + Math.floor(hash2(x, 10, 2) * 6), pal.midTree, x, ow);
  }
  return c;
}

// ───────────────────────── земля ─────────────────────────

/** Земля поля боя: плавные пятна травы, вытоптанная земля, колеи, пучки травы, цветы, камни. */
export function paintGround(t: BattleTerrain, W: number, H: number, q = 2): HTMLCanvasElement {
  const { c, g } = surface(W, H, q);
  const pal = PAL[t];
  const gr = pal.ground;
  const road = t !== 'desert' && t !== 'snow';
  const roadY = (x: number) => H * 0.42 + Math.sin(x * 0.006) * 10 + fbm(x * 0.01, 3, 2, 4) * 8;
  const mudAt = (x: number, y: number) => (y > 14 ? smooth(0.69, 0.715, valueNoise(x * 0.012, y * 0.05, 19)) * Math.min(1, (y - 14) / 6) : 0);
  // Цветовое поле — считаем в половинном разрешении и растягиваем со сглаживанием
  const S = 2;
  const sw = Math.ceil(W / S) + 1;
  const shh = Math.ceil(H / S) + 1;
  const small = document.createElement('canvas');
  small.width = sw;
  small.height = shh;
  const sc = small.getContext('2d')!;
  const img = sc.createImageData(sw, shh);
  const d = img.data;
  const [g0, g1, g2, dirt, mid, snowSh] = [gr[0], gr[1], gr[2], pal.dirt, pal.mid, '#d0dae6'].map(rgb);
  const lerp3 = (a: number[], b: number[], k: number) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  for (let yy = 0; yy < shh; yy++) {
    const y = yy * S;
    for (let xx = 0; xx < sw; xx++) {
      const x = xx * S;
      const n = fbm(x * 0.022, y * 0.07, 3, 13);
      let col = n < 0.52 ? lerp3(g1, g0, smooth(0.3, 0.52, n)) : lerp3(g0, g2, smooth(0.56, 0.72, n));
      const m = mudAt(x, y);
      if (m > 0) col = lerp3(col, lerp3(dirt, g0, 0.12 + fbm(x * 0.08, y * 0.2, 2, 3) * 0.2), m);
      if (t === 'snow') col = lerp3(col, snowSh, smooth(0.5, 0.75, fbm(x * 0.02, y * 0.06, 3, 8)) * 0.7);
      if (y < 26) col = lerp3(col, mid, (1 - y / 26) * 0.4);
      const i = (yy * sw + xx) * 4;
      d[i] = col[0];
      d[i + 1] = col[1];
      d[i + 2] = col[2];
      d[i + 3] = 255;
    }
  }
  sc.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(small, 0, 0, sw * S, shh * S);
  const r = mulberry32(t.length * 97 + 5);
  // Мелкая фактура: короткие штрихи травы (или песка, снега) по всей земле
  const fineA = t === 'desert' || t === 'snow' ? 0.18 : 0.26;
  for (let i = 0; i < W * H * 0.03; i++) {
    const x = r() * W;
    const y = 2 + r() * (H - 2);
    if (mudAt(x, y) > 0.5) continue;
    const s = 0.5 + (y / H) * 1.1;
    g.strokeStyle = rgba(r() < 0.55 ? tone(gr[1], -1) : tone(gr[2], 1), fineA);
    g.lineWidth = 0.35 * s;
    g.beginPath();
    g.moveTo(x, y);
    if (t === 'desert' || t === 'snow') g.lineTo(x + 1.4 * s, y);
    else g.lineTo(x + (r() - 0.5) * 0.8, y - 1.3 * s);
    g.stroke();
  }
  // Мелкие комья и камешки на вытоптанной земле
  for (let i = 0; i < W * H * 0.004; i++) {
    const x = r() * W;
    const y = r() * H;
    if (mudAt(x, y) < 0.6) continue;
    g.fillStyle = rgba(r() < 0.6 ? tone(pal.dirt, -1.2) : tone(pal.dirt, 1), 0.55);
    g.beginPath();
    g.ellipse(x, y, 0.4 + r() * 0.6, 0.3 + r() * 0.3, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Дорога: утоптанная полоса и две колеи
  if (road) {
    const path = (dy: number) => {
      g.beginPath();
      for (let x = 0; x <= W; x += 4) (x ? g.lineTo : g.moveTo).call(g, x, roadY(x) + dy);
    };
    path(3.5);
    g.strokeStyle = rgba(pal.dirt, 0.5);
    g.lineWidth = 8;
    g.stroke();
    g.strokeStyle = rgba(pal.dirt, 0.45);
    g.lineWidth = 5;
    g.stroke();
    for (const dy of [0, 7]) {
      path(dy);
      g.strokeStyle = rgba(tone(pal.dirt, -1.2), 0.85);
      g.lineWidth = 1.4;
      g.stroke();
      path(dy + 1);
      g.strokeStyle = rgba(tone(pal.dirt, 1), 0.3);
      g.lineWidth = 0.6;
      g.stroke();
    }
  }
  // Пустыня: рябь песка
  if (t === 'desert') {
    for (let i = 0; i < W * H * 0.0012; i++) {
      const x0 = r() * W;
      const y0 = r() * H;
      const len = 14 + r() * 40;
      const ph = r() * 6;
      g.beginPath();
      for (let k = 0; k <= len; k += 2) (k ? g.lineTo : g.moveTo).call(g, x0 + k, y0 + Math.sin(k * 0.08 + ph) * 1.4);
      g.strokeStyle = rgba(tone(gr[0], 1), 0.45);
      g.lineWidth = 0.6;
      g.stroke();
      g.translate(0, 0.8);
      g.strokeStyle = rgba(gr[1], 0.5);
      g.stroke();
      g.translate(0, -0.8);
    }
  }
  const count = Math.round(W * H * 0.0045);
  for (let i = 0; i < count; i++) {
    const x = r() * W;
    const y = 4 + r() * (H - 6);
    const s = 0.6 + (y / H) * 1.3; // перспектива: у зрителя крупнее
    const roll = r();
    if (roll < 0.62) {
      if (t === 'desert' && roll > 0.12) continue;
      const blades = 3 + Math.floor(r() * 3);
      const tall = t === 'steppe' ? 4 + s * 4 : 2 + s * 2.2;
      for (let b = 0; b < blades; b++) {
        const bx = x + (b - blades / 2) * 0.7 * s;
        const lean = (r() - 0.5) * 2.6 + (b - blades / 2) * 0.5;
        const hh = tall * (0.6 + r() * 0.5);
        const tipC = t === 'snow' ? '#f2f5f7' : tone(pal.tuft, 1);
        g.beginPath();
        g.moveTo(bx - 0.35 * s, y);
        g.quadraticCurveTo(bx + lean * 0.3, y - hh * 0.6, bx + lean, y - hh);
        g.quadraticCurveTo(bx + lean * 0.3 + 0.2, y - hh * 0.5, bx + 0.35 * s, y);
        const bg = g.createLinearGradient(0, y, 0, y - hh);
        bg.addColorStop(0, tone(pal.tuft, -1.3));
        bg.addColorStop(0.6, pal.tuft);
        bg.addColorStop(1, tipC);
        g.fillStyle = bg;
        g.fill();
      }
    } else if (roll < 0.78 && pal.flowers.length) {
      const col = pal.flowers[Math.floor(r() * pal.flowers.length)];
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const fx = x + (r() - 0.5) * 5 * s;
        const fy = y + (r() - 0.5) * 3;
        const pr = 0.45 * s;
        g.strokeStyle = tone(pal.tuft, -1);
        g.lineWidth = 0.35;
        g.beginPath();
        g.moveTo(fx, fy + 1.4 * s);
        g.lineTo(fx, fy);
        g.stroke();
        g.fillStyle = col;
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          g.beginPath();
          g.arc(fx + Math.cos(a) * pr * 0.7, fy + Math.sin(a) * pr * 0.55, pr * 0.55, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#f0d050';
        g.beginPath();
        g.arc(fx, fy, pr * 0.35, 0, Math.PI * 2);
        g.fill();
      }
    } else if (roll < 0.86) {
      const w = (1.5 + r() * 2.5) * s;
      const h = w * 0.6;
      const stone = t === 'desert' ? '#b8946a' : t === 'snow' ? '#8a8e94' : '#8e8a82';
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.beginPath();
      g.ellipse(x + w * 0.6, y + 0.4, w * 0.65, h * 0.35, 0, 0, Math.PI * 2);
      g.fill();
      const sg = g.createRadialGradient(x + w * 0.3, y - h * 0.8, 0, x + w * 0.5, y - h * 0.4, w * 0.7);
      sg.addColorStop(0, tone(stone, 1.2));
      sg.addColorStop(0.5, stone);
      sg.addColorStop(1, tone(stone, -1.5));
      g.fillStyle = sg;
      g.beginPath();
      g.ellipse(x + w * 0.5, y - h * 0.45, w * 0.5, h * 0.55, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = rgba(tone(stone, -2.5), 0.6);
      g.lineWidth = 0.3;
      g.stroke();
    } else if (roll < 0.93) {
      if (t === 'forest') {
        g.fillStyle = r() < 0.5 ? '#c86a2a' : '#a8502a';
        g.beginPath();
        g.ellipse(x, y, 0.9 * s, 0.45 * s, r() * 3, 0, Math.PI * 2);
        g.fill();
      } else if (t === 'desert') {
        g.strokeStyle = '#8a6a3a';
        g.lineWidth = 0.4;
        for (let k = 0; k < 6; k++) {
          g.beginPath();
          g.moveTo(x, y);
          g.quadraticCurveTo(x + (r() - 0.5) * 3 * s, y - 2 * s, x + (r() - 0.5) * 6 * s, y - r() * 4 * s);
          g.stroke();
        }
      } else if (t === 'snow') {
        g.fillStyle = 'rgba(150,165,185,0.7)';
        for (const [dx, dy] of [[0, 0], [3, 1], [6, 0], [9, 1]]) {
          g.beginPath();
          g.ellipse(x + dx, y + dy, 0.6, 0.35, 0, 0, Math.PI * 2);
          g.fill();
        }
      } else if (t === 'dry') {
        g.strokeStyle = rgba(tone(pal.dirt, -1), 0.8);
        g.lineWidth = 0.4;
        g.beginPath();
        for (let k = 0; k < 4 * s; k++) (k ? g.lineTo : g.moveTo).call(g, x + k, y + Math.sin(k * 1.7) * 0.8);
        g.stroke();
      } else if (t === 'steppe') {
        g.strokeStyle = 'rgba(236,230,200,0.85)';
        g.lineWidth = 0.4;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + 1, y - 5 * s, x + 3.5 * s, y - 8 * s);
        g.stroke();
      }
    }
  }
  // Кромка у горизонта
  g.fillStyle = rgba(tone(gr[0], -1), 0.7);
  g.fillRect(0, 0, W, 0.7);
  return c;
}

// ───────────────────────── объекты на поле ─────────────────────────

/** Кол для способности «Колья» (10×16 арт-пикселей). */
export function paintStake(q = 4): HTMLCanvasElement {
  const { c, g } = surface(10, 16, q);
  const pole = (a: Pt, b: Pt, w: number, col: string) => {
    g.strokeStyle = OUT;
    g.lineWidth = w + 0.9;
    g.beginPath();
    g.moveTo(...a);
    g.lineTo(...b);
    g.stroke();
    g.strokeStyle = col;
    g.lineWidth = w;
    g.stroke();
    g.strokeStyle = rgba(tone(col, 1.2), 0.7);
    g.lineWidth = w * 0.3;
    g.beginPath();
    g.moveTo(a[0] - w * 0.2, a[1]);
    g.lineTo(b[0] - w * 0.2, b[1]);
    g.stroke();
  };
  pole([7, 14.5], [3.5, 5.5], 1.6, '#6a4a2a');
  pole([3, 14.5], [7.6, 2.5], 2, '#7a5332');
  g.fillStyle = '#d8c09a';
  g.beginPath();
  g.moveTo(7.6, 2.2);
  g.lineTo(6.6, 4.6);
  g.lineTo(8, 4.2);
  g.fill();
  return c;
}

/** Дерево рощи на поле боя. Возвращает холст (размер в арт-пикселях × q), основание — внизу посередине. */
export function paintFieldTree(t: BattleTerrain, variant: number, q = 3): HTMLCanvasElement {
  const pal = PAL[t];
  const seed = variant * 131 + t.length * 17;
  const ow = 0.6;
  if (t === 'snow' || (t === 'forest' && variant % 2 === 0)) {
    const h = 38 + (variant % 3) * 6;
    const w = h * 0.6 + 4;
    const { c, g } = surface(w, h + 4, q);
    pine(g, w / 2, h + 3, h, t === 'snow' ? '#2e4d3a' : '#2a5236', t === 'snow', ow);
    return c;
  }
  if (t === 'dry' && variant % 2 === 1) {
    const h = 34 + (variant % 3) * 5;
    const { c, g } = surface(12, h + 3, q);
    cypress(g, 6, h + 2, h, pal.midTree, ow);
    return c;
  }
  const size = 24 + (variant % 3) * 5;
  const w = size * 1.3;
  const h = size * 1.45;
  const { c, g } = surface(w, h, q);
  oak(g, w / 2, h - 1, size, t === 'dry' ? '#5e6e34' : pal.midTree === '#2c4e28' ? '#35602e' : '#447a38', seed, ow);
  return c;
}

/** Куст подлеска (16×10). */
export function paintBush(t: BattleTerrain, variant: number, q = 3): HTMLCanvasElement {
  const col = t === 'snow' ? '#4a6a52' : t === 'dry' ? '#6a7a3a' : '#4a7a38';
  const { c, g } = surface(16, 10, q);
  const r = mulberry32(variant * 7 + 3);
  const blobs: [number, number, number][] = [];
  for (let i = 0; i < 5; i++) blobs.push([4 + r() * 8, 5.5 + r() * 2, 2.3 + r() * 1.5]);
  g.fillStyle = tone(col, -3);
  for (const [x, y, rr] of blobs) {
    g.beginPath();
    g.arc(x, y, rr + 0.5, 0, Math.PI * 2);
    g.fill();
  }
  for (const [x, y, rr] of blobs) ball(g, x, y, rr, col, -1.4, 0.9);
  if (t === 'snow') {
    g.fillStyle = '#eef2f6';
    for (const [x, y, rr] of blobs) {
      g.beginPath();
      g.ellipse(x - rr * 0.2, y - rr * 0.7, rr * 0.7, rr * 0.3, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

/** Телега обоза (40×26): кузов, колёса, полотняный верх. */
export function paintCart(cloth: string, q = 3): HTMLCanvasElement {
  const { c, g } = surface(40, 26, q);
  const ow = 0.5;
  // Оглобли
  g.strokeStyle = OUT;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(32, 16);
  g.lineTo(39.5, 17.8);
  g.stroke();
  g.strokeStyle = '#5a3a22';
  g.lineWidth = 0.8;
  g.stroke();
  // Полотняный верх дугой
  g.beginPath();
  g.moveTo(6, 12.5);
  g.bezierCurveTo(7, 1.5, 31, 1.5, 32, 12.5);
  g.closePath();
  const cg = g.createLinearGradient(0, 3, 0, 12.5);
  cg.addColorStop(0, '#f4ecd8');
  cg.addColorStop(1, '#c8bca0');
  g.fillStyle = cg;
  g.fill();
  g.lineWidth = ow;
  g.strokeStyle = '#5a5040';
  g.stroke();
  g.strokeStyle = 'rgba(120,100,70,0.45)';
  g.lineWidth = 0.4;
  for (const x of [12, 19, 26]) {
    g.beginPath();
    g.moveTo(x, 12.3);
    g.quadraticCurveTo(x + (x - 19) * 0.1, 7, x + (x - 19) * 0.06, 4.2);
    g.stroke();
  }
  g.fillStyle = cloth;
  g.fillRect(8.5, 8.6, 21, 1.4);
  // Кузов
  box(g, 4, 12, 30, 6, '#7a5332', ow);
  g.strokeStyle = 'rgba(40,24,12,0.6)';
  g.lineWidth = 0.4;
  for (let x = 9; x < 34; x += 5) {
    g.beginPath();
    g.moveTo(x, 12.3);
    g.lineTo(x, 17.7);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,230,190,0.35)';
  g.fillRect(4.3, 12.3, 29.4, 0.7);
  // Колёса
  for (const wx of [10, 27]) {
    g.lineWidth = 2.3;
    g.strokeStyle = OUT;
    g.beginPath();
    g.arc(wx, 20.5, 4, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 1.4;
    g.strokeStyle = '#6a4424';
    g.stroke();
    g.lineWidth = 0.5;
    g.strokeStyle = '#8a6440';
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI + 0.3;
      g.beginPath();
      g.moveTo(wx + Math.cos(a) * 3.6, 20.5 + Math.sin(a) * 3.6);
      g.lineTo(wx - Math.cos(a) * 3.6, 20.5 - Math.sin(a) * 3.6);
      g.stroke();
    }
    ball(g, wx, 20.5, 0.9, '#8a8a80');
  }
  return c;
}

/** Холм поперёк поля: гребень над дальним краем, освещённый склон, тень на передней кромке. */
export function paintHill(t: BattleTerrain, w: number, h: number, lift: number, q = 2): HTMLCanvasElement {
  const { c, g } = surface(w, h, q);
  const pal = PAL[t];
  const gr = pal.ground;
  const top0 = 30;
  const crestAt = (x: number) => {
    const u = x / (w - 1);
    const e = Math.pow(Math.sin(Math.max(0, Math.min(1, u)) * Math.PI), 1.5);
    return top0 - e * (lift + 12) + fbm(x * 0.05, 2, 2, 3) * 3 * e;
  };
  // Гребень над дальним краем поля
  const pts: Pt[] = [[0, top0 + 2.5]];
  for (let x = 0; x <= w; x += 1) pts.push([x, crestAt(x)]);
  pts.push([w, top0 + 2.5]);
  polyPath(g, pts);
  const lg = g.createLinearGradient(0, 0, w, 0);
  lg.addColorStop(0, tone(gr[2], 1));
  lg.addColorStop(0.45, tone(gr[0], 0.4));
  lg.addColorStop(1, gr[1]);
  g.fillStyle = lg;
  g.fill();
  g.save();
  g.clip();
  const tg = g.createLinearGradient(0, top0 - lift - 12, 0, top0 + 2);
  tg.addColorStop(0, 'rgba(255,255,230,0.18)');
  tg.addColorStop(1, 'rgba(0,0,0,0.08)');
  g.fillStyle = tg;
  g.fillRect(0, 0, w, top0 + 3);
  g.restore();
  // Низ гребня растворяется в земле — без шва у дальнего края поля
  g.save();
  g.globalCompositeOperation = 'destination-out';
  const fo = g.createLinearGradient(0, top0 - 8, 0, top0 + 2.5);
  fo.addColorStop(0, 'rgba(0,0,0,0)');
  fo.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = fo;
  g.fillRect(0, top0 - 8, w, 10.6);
  g.restore();
  g.strokeStyle = rgba(tone(gr[1], -2), 0.8);
  g.lineWidth = 0.6;
  g.beginPath();
  for (let x = 0; x <= w; x += 1) {
    const y = crestAt(x);
    if (y > top0 - 3) {
      g.moveTo(x, y);
      continue;
    }
    g.lineTo(x, y);
  }
  g.stroke();
  // Трава на гребне
  if (t !== 'desert') {
    g.strokeStyle = pal.tuft;
    g.lineWidth = 0.45;
    for (let x = 2; x < w - 2; x += 1.5) {
      const u = x / (w - 1);
      const e = Math.pow(Math.sin(u * Math.PI), 1.5);
      if (e < 0.3 || hash2(Math.round(x * 2), 3, 7) > 0.4) continue;
      const y = crestAt(x);
      g.beginPath();
      g.moveTo(x, y + 0.3);
      g.lineTo(x + (hash2(Math.round(x * 2), 4, 7) - 0.5) * 1.2, y - 1.8);
      g.stroke();
    }
  }
  // На самом поле — только светотень поверх земли: свет слева, тень справа, тень у передней кромки
  for (let x = 0; x < w; x++) {
    const u = x / (w - 1);
    const e = Math.pow(Math.sin(u * Math.PI), 1.5);
    const slope = Math.cos(u * Math.PI);
    const face = h - 18 - e * lift * 0.9;
    const light = slope * e;
    const lc = light > 0.02 ? tone(gr[2], 1.2) : tone(gr[1], -1.3);
    const la = light > 0.02 ? Math.min(0.4, light * 0.45) : Math.min(0.35, -light * 0.4);
    const lg2 = g.createLinearGradient(0, top0 + 2, 0, face);
    lg2.addColorStop(0, rgba(lc, la));
    lg2.addColorStop(0.7, rgba(lc, la * 0.8));
    lg2.addColorStop(1, rgba(lc, 0));
    g.fillStyle = lg2;
    g.fillRect(x, top0 + 2, 1.05, face - top0 - 2);
    if (e > 0.02) {
      const fg = g.createLinearGradient(0, face, 0, h);
      fg.addColorStop(0, rgba(tone(gr[1], -1.5), 0));
      fg.addColorStop(0.3, rgba(tone(gr[1], -1.5), e * 0.55));
      fg.addColorStop(1, rgba(tone(gr[1], -1.5), e * 0.12));
      g.fillStyle = fg;
      g.fillRect(x, face, 1.05, h - face);
    }
  }
  return c;
}

// ───────────────────────── стена осады ─────────────────────────

/** Скруглённый прямоугольник (свой — ctx.roundRect есть не во всех WebView на Android). */
function roundRect(g: G, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Кладка: камни со скруглёнными краями, светлым верхом и тёмным низом, швы. */
function masonry(g: G, x0: number, y0: number, w: number, h: number, base: string, rowH: number, seed: number) {
  const r = mulberry32(seed);
  g.save();
  g.beginPath();
  g.rect(x0, y0, w, h);
  g.clip();
  g.fillStyle = tone(base, -2.2);
  g.fillRect(x0, y0, w, h);
  for (let y = y0; y < y0 + h; y += rowH) {
    let x = x0 - Math.floor(r() * 10);
    while (x < x0 + w) {
      const bw = 7 + Math.floor(r() * 10);
      const tn = r();
      const col = tn < 0.18 ? tone(base, 0.7) : tn < 0.3 ? tone(base, -0.6) : base;
      const sg = g.createLinearGradient(0, y, 0, y + rowH);
      sg.addColorStop(0, tone(col, 0.9));
      sg.addColorStop(0.3, col);
      sg.addColorStop(1, tone(col, -1));
      g.fillStyle = sg;
      roundRect(g, x + 0.35, y + 0.35, bw - 0.7, rowH - 0.7, 1.2);
      g.fill();
      if (r() < 0.25) {
        g.fillStyle = rgba(tone(col, -1.3), 0.5);
        g.beginPath();
        g.arc(x + r() * bw, y + rowH * (0.3 + r() * 0.4), 0.4 + r() * 0.5, 0, Math.PI * 2);
        g.fill();
      }
      x += bw;
    }
  }
  g.restore();
}

/** Крепостная стена для осадного боя (вид сбоку, защитники справа). 340×150 арт-пикселей. */
export function paintWall(culture: string, banner: string, banner2: string, q = 2): HTMLCanvasElement {
  const W = 340;
  const H = 150;
  const { c, g } = surface(W, H, q);
  const wood = culture === 'nordmark';
  const base = culture === 'horde' ? '#b0925e' : culture === 'sultanate' ? '#cdb282' : wood ? '#8a6440' : '#948c7c';
  const top = 24;
  if (wood) {
    // Частокол из брёвен с заострёнными верхами
    for (let x = 30; x < W; x += 7) {
      const lg = g.createLinearGradient(x, 0, x + 7, 0);
      lg.addColorStop(0, tone(base, 1.1));
      lg.addColorStop(0.35, base);
      lg.addColorStop(1, tone(base, -1.6));
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(x, H);
      g.lineTo(x, top - 1);
      g.lineTo(x + 3.5, top - 5);
      g.lineTo(x + 7, top - 1);
      g.lineTo(x + 7, H);
      g.fill();
      g.strokeStyle = rgba(OUT, 0.7);
      g.lineWidth = 0.5;
      g.stroke();
      g.strokeStyle = rgba(tone(base, -2), 0.45);
      g.lineWidth = 0.4;
      for (let k = 0; k < 4; k++) {
        const yy = top + 10 + hash2(x, k, 3) * (H - top - 20);
        g.beginPath();
        g.arc(x + 3.5, yy, 1.2, 0, Math.PI * 2);
        g.stroke();
      }
    }
    for (const y of [48, 110]) box(g, 30, y - 1, W - 30, 2.4, '#5a4a38', 0.4);
  } else if (culture === 'horde') {
    const lg = g.createLinearGradient(0, top, 0, H);
    lg.addColorStop(0, tone(base, 0.4));
    lg.addColorStop(1, tone(base, -0.5));
    g.fillStyle = lg;
    g.fillRect(30, top, W - 30, H - top);
    g.save();
    g.filter = `blur(${2 * q}px)`;
    for (let i = 0; i < 40; i++) {
      g.fillStyle = rgba(hash2(i, 1, 4) < 0.5 ? tone(base, 0.9) : tone(base, -0.8), 0.4);
      g.beginPath();
      g.ellipse(30 + hash2(i, 2, 4) * (W - 30), top + hash2(i, 3, 4) * (H - top), 6 + hash2(i, 5, 4) * 12, 3 + hash2(i, 6, 4) * 6, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    g.strokeStyle = rgba(tone(base, -2), 0.8);
    g.lineWidth = 0.5;
    for (let i = 0; i < 14; i++) {
      let x = 40 + hash2(i, 1, 7) * 290;
      let y = top + 10 + hash2(i, 2, 7) * 100;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (hash2(i, k, 8) - 0.3) * 3;
        y += 2.6;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    for (let x = 36; x < W; x += 22) box(g, x, top + 30, 3, 3, '#5a3e24', 0.4);
  } else {
    masonry(g, 30, top, W - 30, H - top, base, 7, 5);
    if (culture === 'sultanate') {
      for (let x = 30; x < W; x += 6) {
        g.fillStyle = '#e2cfa0';
        g.fillRect(x, top + 16, 3, 5);
        g.fillStyle = '#b08a50';
        g.fillRect(x + 3, top + 16, 3, 5);
      }
    }
  }
  // Зубцы
  for (let x = 30; x < W; x += 9) {
    if (culture === 'sultanate') {
      shapeLR(g, [[x, top], [x, top - 3.5], [x + 3, top - 7], [x + 6, top - 3.5], [x + 6, top]], tone(base, 0.4), 0.45);
    } else if (!wood) {
      if (culture === 'horde') box(g, x, top - 6, 6, 6, base, 0.45);
      else masonry(g, x, top - 7, 6, 7, tone(base, 0.6), 4, x);
    }
  }
  // Боевой ход
  box(g, 30, top - 0.5, W - 30, 2.2, tone(base, -1.4), 0.4);
  // Ворота с аркой и решёткой
  const gx = 76;
  g.beginPath();
  g.moveTo(gx - 23, H);
  g.lineTo(gx - 23, 106);
  g.arc(gx, 106, 23, Math.PI, 0);
  g.lineTo(gx + 23, H);
  g.closePath();
  shapeLRPath(g, tone(base, 1.4), gx - 23, gx + 23);
  g.beginPath();
  g.moveTo(gx - 19, H);
  g.lineTo(gx - 19, 108);
  g.arc(gx, 108, 19, Math.PI, 0);
  g.lineTo(gx + 19, H);
  g.closePath();
  g.fillStyle = '#15100c';
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = '#4a4038';
  g.lineWidth = 1.1;
  for (let x = gx - 19; x < gx + 20; x += 5) {
    g.beginPath();
    g.moveTo(x, 88);
    g.lineTo(x, H);
    g.stroke();
  }
  for (let y = 94; y < H; y += 6) {
    g.beginPath();
    g.moveTo(gx - 20, y);
    g.lineTo(gx + 20, y);
    g.stroke();
  }
  g.restore();
  // Башня у края
  if (wood) {
    for (let x = 0; x < 34; x += 6) box(g, x, 6, 6, H - 6, base, 0.4);
  } else masonry(g, 0, 6, 34, H - 6, tone(base, 0.6), 8, 9);
  const tsh = g.createLinearGradient(20, 0, 34, 0);
  tsh.addColorStop(0, 'rgba(0,0,0,0)');
  tsh.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = tsh;
  g.fillRect(20, 6, 14, H - 6);
  for (let x = 0; x < 34; x += 7) box(g, x, 0, 4, 6, tone(base, 0.8), 0.45);
  for (const y of [30, 60, 90]) {
    box(g, 14, y - 1, 5, 10, tone(base, -1.6), 0.4);
    g.fillStyle = '#15100c';
    g.beginPath();
    g.moveTo(15, y + 8);
    g.lineTo(15, y + 1.5);
    g.arc(16.5, y + 1.5, 1.5, Math.PI, 0);
    g.lineTo(18, y + 8);
    g.fill();
  }
  // Знамёна владельца со складками
  for (const bx of [40, 200]) {
    box(g, bx - 1, top + 3.5, 12, 1.2, '#3b2f25', 0.3);
    g.beginPath();
    g.moveTo(bx, top + 5);
    g.lineTo(bx + 10, top + 5);
    g.lineTo(bx + 10, top + 28);
    g.lineTo(bx + 5, top + 31);
    g.lineTo(bx, top + 28);
    g.closePath();
    const bg = g.createLinearGradient(bx, 0, bx + 10, 0);
    bg.addColorStop(0, tone(banner, 0.6));
    bg.addColorStop(0.3, banner);
    bg.addColorStop(0.55, tone(banner, -0.9));
    bg.addColorStop(0.8, banner);
    bg.addColorStop(1, tone(banner, -1.2));
    g.fillStyle = bg;
    g.fill();
    g.lineWidth = 0.45;
    g.strokeStyle = mx(banner, OUT, 0.7);
    g.stroke();
    box(g, bx + 3, top + 10, 4, 5, banner2, 0.3);
  }
  return outlined(c, 0.7 * q);
}

/** Заливка текущего пути градиентом слева-направо с контуром. */
function shapeLRPath(g: G, col: string, x0: number, x1: number) {
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  gr.addColorStop(0, tone(col, 0.8));
  gr.addColorStop(0.4, col);
  gr.addColorStop(1, tone(col, -1.2));
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 0.45;
  g.strokeStyle = mx(col, OUT, 0.75);
  g.stroke();
}

// ───────────────────────── трибуны ристалища ─────────────────────────

/** Трибуны ристалища: ярусы со зрителями, полосатые навесы, королевская ложа, флажки, ограда. */
export function paintArena(W: number, H: number, colors: string[], q = 2): HTMLCanvasElement {
  const { c, g } = surface(W, H, q);
  const wood = '#7a5332';
  const woodD = '#4e3420';
  const r = mulberry32(31);
  for (let tier = 0; tier < 4; tier++) {
    const y = 16 + tier * 9;
    box(g, 0, y + 6.5, W, 2.2, wood, 0.35);
    for (let x = 1; x < W; x += 3) {
      if (hash2(x, tier, 31) < 0.1) continue;
      const col = colors[Math.floor(hash2(x, tier, 32) * colors.length)];
      const skin = hash2(x, tier, 33) < 0.5 ? '#e8bc94' : '#c89068';
      const hat = hash2(x, tier, 34);
      const bx = x + 1;
      // Тело, голова, шапка
      g.beginPath();
      g.moveTo(bx - 1.2, y + 6.8);
      g.quadraticCurveTo(bx - 1.3, y + 3.2, bx, y + 3.1);
      g.quadraticCurveTo(bx + 1.3, y + 3.2, bx + 1.2, y + 6.8);
      g.closePath();
      shapeLRPath(g, col, bx - 1.3, bx + 1.3);
      ball(g, bx, y + 2.2, 1, skin, -1, 0.6);
      if (hat < 0.55) {
        g.fillStyle = hat < 0.3 ? col : '#4a3520';
        g.beginPath();
        g.arc(bx, y + 1.9, 1.05, Math.PI, 0);
        g.fill();
      } else if (hat < 0.7) {
        g.fillStyle = '#e8e0d0';
        g.beginPath();
        g.arc(bx, y + 1.9, 1.05, Math.PI, 0);
        g.fill();
      }
      if (hash2(x, tier, 35) < 0.12) {
        g.strokeStyle = skin;
        g.lineWidth = 0.55;
        g.beginPath();
        g.moveTo(bx - 1, y + 4);
        g.lineTo(bx - 1.6, y + 1);
        g.stroke();
      }
    }
  }
  // Королевская ложа
  for (let x0 = 100; x0 < W; x0 += 420) {
    box(g, x0, 8, 40, 42, woodD, 0.5);
    for (let x = x0 + 1; x < x0 + 39; x += 8) {
      box(g, x, 12, 4, 37, '#8a2a2a', 0);
      box(g, x + 4, 12, 4, 37, '#6a1e1e', 0);
    }
    shapeLR(g, [[x0 - 3, 9], [x0 + 20, 0.5], [x0 + 43, 9]], '#d9a834', 0.5);
    box(g, x0 + 17, 28, 6, 8, '#3a6cc4', 0.4);
    ball(g, x0 + 20, 26, 1.3, '#e8bc94');
    box(g, x0 + 18.5, 23.6, 3, 1.4, '#d9a834', 0.3);
  }
  // Навесы
  for (let x = 6; x < W; x += 46) {
    const col = colors[Math.floor(r() * colors.length)];
    g.strokeStyle = woodD;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 50);
    g.moveTo(x + 30, 0);
    g.lineTo(x + 30, 50);
    g.stroke();
    for (let k = 0; k < 30; k += 3) {
      const cc = Math.floor(k / 3) % 2 ? '#ece4d0' : col;
      g.beginPath();
      g.moveTo(x + k, 4);
      g.lineTo(x + k + 3, 4);
      g.lineTo(x + k + 3, 10);
      g.quadraticCurveTo(x + k + 1.5, 12.2, x + k, 10);
      g.closePath();
      const sg = g.createLinearGradient(0, 4, 0, 11);
      sg.addColorStop(0, tone(cc, 0.8));
      sg.addColorStop(1, tone(cc, -0.8));
      g.fillStyle = sg;
      g.fill();
    }
    g.strokeStyle = rgba(OUT, 0.6);
    g.lineWidth = 0.4;
    g.strokeRect(x, 4, 30, 6);
    for (let k = 0; k < 5; k++) {
      const fx = x + 3 + k * 6;
      g.fillStyle = colors[(k + Math.floor(x / 46)) % colors.length];
      g.beginPath();
      g.moveTo(fx, 0.8);
      g.lineTo(fx + 2.2, 0.8);
      g.lineTo(fx + 1.1, 3);
      g.fill();
    }
    box(g, x + 12, 0, 6, 3, col, 0.35);
  }
  // Ограда поля
  for (const y of [H - 11, H - 5]) box(g, 0, y, W, 2.4, wood, 0.4);
  for (let x = 0; x < W; x += 14) box(g, x, H - 13, 2, 12, woodD, 0.4);
  return c;
}

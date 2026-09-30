// Общие «кисти» для гладкой рисовки кодом: холст в заданной чёткости, тона, градиенты со светом
// слева сверху, объёмные фигуры и внешняя обводка. Используются фоном боя, картой и значками.

import { mix, ramp, rgb } from './color';

export type G = CanvasRenderingContext2D;
export type Pt = [number, number];

export const OUT = '#1c1612';

export function surface(w: number, h: number, q: number): { c: HTMLCanvasElement; g: G } {
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
export function tone(c: string, step: number): string {
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
export function mx(a: string, b: string, t: number): string {
  const q = Math.round(Math.max(0, Math.min(1, t)) * 32);
  const k = `${a}${b}${q}`;
  let v = mixCache.get(k);
  if (!v) {
    v = mix(a, b, q / 32);
    mixCache.set(k, v);
  }
  return v;
}

export function rgba(c: string, a: number): string {
  const [r, gg, b] = rgb(c);
  return `rgba(${r},${gg},${b},${a})`;
}

export function smooth(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function polyPath(g: G, pts: Pt[]) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

/** Заливка многоугольника с градиентом слева-направо (свет слева) и тонким контуром. */
export function shapeLR(g: G, pts: Pt[], c: string, ow = 0.45, x0?: number, x1?: number) {
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
export function box(g: G, x: number, y: number, w: number, h: number, c: string, ow = 0.45) {
  shapeLR(g, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], c, ow);
}

/** Круг с объёмом: свет слева сверху. */
export function ball(g: G, x: number, y: number, r: number, c: string, lo = -1.2, hi = 0.8) {
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
export function outlined(src: HTMLCanvasElement, r: number, color = OUT): HTMLCanvasElement {
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


/**
 * Гладкий значок из «пиксельного» рисунка по строкам: каждый цвет — отдельная маска, которая
 * растягивается со сглаживанием, чуть размывается и снова делается чёткой. Выходят плавные
 * скруглённые формы вместо ступенек; каждая заливается со светотенью. '.' — пусто.
 */
export function smoothGlyph(rows: string[], pal: Record<string, string | null>, S: number, shade = true): HTMLCanvasElement {
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const out = document.createElement('canvas');
  out.width = w * S;
  out.height = h * S;
  const o = out.getContext('2d')!;
  const keys: string[] = [];
  for (const r of rows) for (const ch of r) if (ch !== '.' && ch !== ' ' && pal[ch] && !keys.includes(ch)) keys.push(ch);
  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;
  const m = mask.getContext('2d')!;
  const big = document.createElement('canvas');
  big.width = w * S;
  big.height = h * S;
  const b = big.getContext('2d', { willReadFrequently: true })!;
  for (const k of keys) {
    m.clearRect(0, 0, w, h);
    m.fillStyle = '#fff';
    rows.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) if (r[x] === k) m.fillRect(x, y, 1, 1);
    });
    b.clearRect(0, 0, big.width, big.height);
    b.imageSmoothingEnabled = true;
    b.imageSmoothingQuality = 'high';
    b.filter = `blur(${(S * 0.28).toFixed(2)}px)`;
    b.drawImage(mask, 0, 0, big.width, big.height);
    b.filter = 'none';
    const img = b.getImageData(0, 0, big.width, big.height);
    const d = img.data;
    // Порог с мягким краем в полторы точки; чуть ниже середины, чтобы соседние цвета не расходились щелью
    for (let i = 3; i < d.length; i += 4) d[i] = Math.max(0, Math.min(255, (d[i] - 100) * 5));
    b.putImageData(img, 0, 0);
    const c = pal[k]!;
    b.globalCompositeOperation = 'source-in';
    if (shade) {
      const g = b.createLinearGradient(0, 0, big.width, big.height);
      g.addColorStop(0, tone(c, 0.8));
      g.addColorStop(0.45, c);
      g.addColorStop(1, tone(c, -0.9));
      b.fillStyle = g;
    } else b.fillStyle = c;
    b.fillRect(0, 0, big.width, big.height);
    b.globalCompositeOperation = 'source-over';
    o.drawImage(big, 0, 0);
  }
  return out;
}

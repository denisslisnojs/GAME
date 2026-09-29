// Растеризатор детальных фигур: набор форм (многоугольники, эллипсы, конусы-капсулы)
// в «дизайн-единицах» → пиксели со светотенью (свет слева сверху), фактурой материала,
// внутренними линиями между частями и тонкой тёмной обводкой.

import { mix, ramp } from './color';

export type Mat = 'cloth' | 'metal' | 'skin' | 'wood' | 'leather' | 'hair' | 'horse' | 'gold' | 'string' | 'dark' | 'fur';
/** Фактура поверх светотени. */
export type Pat = 'mail' | 'scale' | 'lamellar' | 'rivets' | 'quilt' | 'plank' | 'none';

export interface Shape {
  poly?: [number, number][];
  ell?: [number, number, number, number];
  /** Конус-капсула: отрезок с толщиной w0 → w1. */
  cap?: [number, number, number, number, number, number];
  color: string;
  mat: Mat;
  pat?: Pat;
}

export type Pt = [number, number];

export const cap = (color: string, mat: Mat, a: Pt, b: Pt, w0: number, w1 = w0, pat?: Pat): Shape => ({ cap: [a[0], a[1], b[0], b[1], w0, w1], color, mat, pat });
export const poly = (color: string, mat: Mat, pts: Pt[], pat?: Pat): Shape => ({ poly: pts, color, mat, pat });
export const ell = (color: string, mat: Mat, cx: number, cy: number, rx: number, ry: number, pat?: Pat): Shape => ({ ell: [cx, cy, rx, ry], color, mat, pat });

const OUT = '#1a1410';
const LX = -0.55;
const LY = -0.65;
const LZ = 0.52;
const LN = Math.hypot(LX, LY, LZ);

function inPoly(x: number, y: number, pts: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

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

const shadeCache = new Map<string, string>();
function tone(c: string, step: number): string {
  const k = c + step;
  let v = shadeCache.get(k);
  if (!v) {
    v = ramp(c, step);
    shadeCache.set(k, v);
  }
  return v;
}

function skinTone(c: string, l: number): string {
  if (l > 0.78) return mix(c, '#fff2e2', 0.2);
  if (l > 0.42) return c;
  if (l > 0.22) return mix(c, '#7a4630', 0.26);
  return mix(c, '#5a3024', 0.42);
}

/** Цвет пикселя: светотень по материалу и фактура. */
function shadePx(c: string, mat: Mat, pat: Pat | undefined, l: number, x: number, y: number): string {
  if (mat === 'dark' || mat === 'string') return c;
  if (mat === 'skin') return skinTone(c, l);
  let step: number;
  if (mat === 'metal' || mat === 'gold') step = l > 0.93 ? 2 : l > 0.76 ? 1 : l > 0.46 ? 0 : l > 0.24 ? -1 : -2;
  else step = l > 0.8 ? 1 : l > 0.42 ? 0 : l > 0.22 ? -1 : -2;
  switch (pat) {
    case 'mail':
      if ((x + y) % 2 === 0) step -= 1;
      break;
    case 'scale':
      if (y % 3 === 0) step -= 1;
      else if ((x + (Math.floor(y / 3) % 2) * 2) % 4 === 0) step -= 1;
      break;
    case 'lamellar':
      if (y % 4 === 0 || x % 2 === 0) step -= 1;
      break;
    case 'rivets':
      if (y % 4 === 1 && x % 3 === 0) return '#e2c060';
      break;
    case 'quilt':
      if (y % 4 === 3) step -= 1;
      break;
    case 'plank':
      if (x % 4 === 0) step -= 1;
      break;
  }
  if (mat === 'fur' && (x * 7 + y * 3) % 5 === 0) step -= 1;
  if (mat === 'cloth' && step === 0 && (x * 7 + y * 13) % 31 === 0) step = -1;
  return tone(c, Math.max(-3, Math.min(2, step)));
}

/**
 * Нарисовать фигуру в буфер w×h. k — пикселей на дизайн-единицу,
 * (ox, oy) — где в буфере окажется точка (0, 0) дизайна.
 */
export function rasterize(shapes: Shape[], w: number, h: number, k: number, ox: number, oy: number, ss = 1): Uint32Array {
  const part = new Int16Array(w * h).fill(-1);
  const light = new Float32Array(w * h);
  shapes.forEach((s, i) => {
    let bx0: number, by0: number, bx1: number, by1: number;
    if (s.poly) {
      bx0 = Infinity;
      by0 = Infinity;
      bx1 = -Infinity;
      by1 = -Infinity;
      for (const [x, y] of s.poly) {
        bx0 = Math.min(bx0, x);
        bx1 = Math.max(bx1, x);
        by0 = Math.min(by0, y);
        by1 = Math.max(by1, y);
      }
    } else if (s.ell) {
      const [cx, cy, rx, ry] = s.ell;
      bx0 = cx - rx;
      bx1 = cx + rx;
      by0 = cy - ry;
      by1 = cy + ry;
    } else {
      const [x0, y0, x1, y1, w0, w1] = s.cap!;
      const ww = Math.max(w0, w1);
      bx0 = Math.min(x0, x1) - ww;
      bx1 = Math.max(x0, x1) + ww;
      by0 = Math.min(y0, y1) - ww;
      by1 = Math.max(y0, y1) + ww;
    }
    const px0 = Math.max(0, Math.floor(bx0 * k + ox) - 1);
    const px1 = Math.min(w - 1, Math.ceil(bx1 * k + ox) + 1);
    const py0 = Math.max(0, Math.floor(by0 * k + oy) - 1);
    const py1 = Math.min(h - 1, Math.ceil(by1 * k + oy) + 1);
    for (let py = py0; py <= py1; py++) {
      for (let px = px0; px <= px1; px++) {
        const x = (px + 0.5 - ox) / k;
        const y = (py + 0.5 - oy) / k;
        let nx = 0;
        let ny = 0;
        let inside = false;
        if (s.poly) {
          inside = inPoly(x, y, s.poly);
          nx = ((x - bx0) / Math.max(0.5, bx1 - bx0) - 0.5) * 1.6;
          ny = ((y - by0) / Math.max(0.5, by1 - by0) - 0.5) * 0.7;
        } else if (s.ell) {
          const [cx, cy, rx, ry] = s.ell;
          nx = (x - cx) / rx;
          ny = (y - cy) / ry;
          inside = nx * nx + ny * ny <= 1;
        } else {
          const [x0, y0, x1, y1, w0, w1] = s.cap!;
          const dx = x1 - x0;
          const dy = y1 - y0;
          const len2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
          const d = Math.hypot(x - (x0 + dx * t), y - (y0 + dy * t));
          const ww = w0 + (w1 - w0) * t;
          inside = d <= Math.max(ww / 2, 0.5 / k);
          const len = Math.sqrt(len2);
          const side = ((x - x0) * -dy + (y - y0) * dx) / len;
          const nrm = side / Math.max(0.3, ww / 2);
          nx = (-dy / len) * nrm;
          ny = (dx / len) * nrm;
        }
        if (!inside) continue;
        const nn = Math.min(1, nx * nx + ny * ny);
        const lam = Math.max(0, nx * LX + ny * LY + Math.sqrt(1 - nn) * LZ) / LN;
        const idx = py * w + px;
        part[idx] = i;
        light[idx] = lam;
      }
    }
  });
  const out = new Uint32Array(w * h);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : part[y * w + x]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = part[y * w + x];
      if (p < 0) continue;
      const s = shapes[p];
      // Фактура — в «крупных» пикселях: при сверхвыборке кольчуга не мельчит
      let c = shadePx(s.color, s.mat, s.pat, light[y * w + x], Math.floor(x / ss), Math.floor(y / ss));
      // Линия там, где эта часть лежит поверх другой (не для тонких древков и тетивы)
      if (s.mat !== 'string' && s.mat !== 'wood') {
        const r = at(x + 1, y);
        const d = at(x, y + 1);
        const l = at(x - 1, y);
        const u = at(x, y - 1);
        if ((r >= 0 && r < p) || (d >= 0 && d < p) || (l >= 0 && l < p) || (u >= 0 && u < p)) c = mix(s.color, OUT, 0.6);
      }
      out[y * w + x] = col(c);
    }
  }
  // Внешняя обводка: 1 пиксель кадра (при сверхвыборке — ss пикселей)
  const oc = col(OUT);
  const filled = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (part[i] >= 0) filled[i] = 1;
  for (let pass = 0; pass < ss; pass++) {
    const edge: number[] = [];
    const f = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && filled[y * w + x] === 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (filled[y * w + x]) continue;
        if (f(x - 1, y) || f(x + 1, y) || f(x, y - 1) || f(x, y + 1) || (pass > 0 && (f(x - 1, y - 1) || f(x + 1, y + 1) || f(x + 1, y - 1) || f(x - 1, y + 1)))) edge.push(y * w + x);
      }
    }
    for (const i of edge) {
      out[i] = oc;
      filled[i] = 1;
    }
  }
  return out;
}

/** Отзеркалить фигуру по горизонтали относительно x = cx. */
export function flipShapes(shapes: Shape[], cx: number): Shape[] {
  const f = (x: number) => 2 * cx - x;
  return shapes.map((s) => ({
    ...s,
    poly: s.poly?.map(([x, y]) => [f(x), y] as Pt),
    ell: s.ell ? [f(s.ell[0]), s.ell[1], s.ell[2], s.ell[3]] : undefined,
    cap: s.cap ? [f(s.cap[0]), s.cap[1], f(s.cap[2]), s.cap[3], s.cap[4], s.cap[5]] : undefined,
  }));
}

/** Повернуть фигуру на ang градусов вокруг (cx, cy). */
export function rotateShapes(shapes: Shape[], cx: number, cy: number, ang: number): Shape[] {
  const r = (ang * Math.PI) / 180;
  const co = Math.cos(r);
  const si = Math.sin(r);
  const rot = (x: number, y: number): Pt => [cx + (x - cx) * co - (y - cy) * si, cy + (x - cx) * si + (y - cy) * co];
  return shapes.map((s) => {
    if (s.poly) return { ...s, poly: s.poly.map(([x, y]) => rot(x, y)) };
    if (s.cap) {
      const a = rot(s.cap[0], s.cap[1]);
      const b = rot(s.cap[2], s.cap[3]);
      return { ...s, cap: [a[0], a[1], b[0], b[1], s.cap[4], s.cap[5]] };
    }
    const [ex, ey, rx, ry] = s.ell!;
    const c = rot(ex, ey);
    // Эллипс после поворота на ~90° меняет оси
    const swap = Math.abs(Math.sin(r)) > 0.7;
    return { ...s, ell: [c[0], c[1], swap ? ry : rx, swap ? rx : ry] };
  });
}

/** Увеличить фигуру относительно (cx, cy): по x в s раз, по y в sy раз (точки, радиусы, толщины). */
export function scaleShapes(shapes: Shape[], cx: number, cy: number, s: number, sy = s): Shape[] {
  const f = (x: number, y: number): Pt => [cx + (x - cx) * s, cy + (y - cy) * sy];
  const sw = (s + sy) / 2;
  return shapes.map((sh) => {
    if (sh.poly) return { ...sh, poly: sh.poly.map(([x, y]) => f(x, y)) };
    if (sh.cap) {
      const a = f(sh.cap[0], sh.cap[1]);
      const b = f(sh.cap[2], sh.cap[3]);
      return { ...sh, cap: [a[0], a[1], b[0], b[1], sh.cap[4] * sw, sh.cap[5] * sw] };
    }
    const [ex, ey, rx, ry] = sh.ell!;
    const c = f(ex, ey);
    return { ...sh, ell: [c[0], c[1], rx * s, ry * sy] };
  });
}

// Растеризация фигур и стили светотени/обводки.

import { bayer, desat, hueOf, lumOf, mix, nearest, ramp, satOf } from './color';
import type { Figure, Mat } from './figures';

export interface StyleDef {
  id: string;
  name: string;
  /** Пикселей арта на дизайн-единицу. */
  k: number;
  remap(c: string, mat: Mat): string;
  shade(c: string, mat: Mat, l: number, x: number, y: number, rim: boolean): string;
  /** Внешняя обводка: толщина в пикселях и цвет (от соседнего цвета). */
  outline: { w: number; color: (neighbor: string) => string } | null;
  /** Линии между частями фигуры. */
  inner: ((front: string) => string) | null;
}

const LX = -0.55;
const LY = -0.65;
const LZ = 0.52;

function inPoly(x: number, y: number, pts: [number, number][]): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Нарисовать фигуру в стиле. */
export function drawFigure(fig: Figure, st: StyleDef): HTMLCanvasElement {
  const k = st.k;
  const pad = 3;
  const W = Math.ceil(fig.w * k) + pad * 2;
  const H = Math.ceil((fig.h + 2) * k) + pad * 2;
  const part = new Int16Array(W * H).fill(-1);
  const light = new Float32Array(W * H);
  const colors: string[] = [];
  const mats: Mat[] = [];
  fig.shapes.forEach((s, i) => {
    colors.push(st.remap(s.color, s.mat));
    mats.push(s.mat);
    let bx0: number, by0: number, bx1: number, by1: number;
    if (s.poly) {
      bx0 = Math.min(...s.poly.map((p) => p[0]));
      bx1 = Math.max(...s.poly.map((p) => p[0]));
      by0 = Math.min(...s.poly.map((p) => p[1]));
      by1 = Math.max(...s.poly.map((p) => p[1]));
    } else if (s.ell) {
      const [cx, cy, rx, ry] = s.ell;
      bx0 = cx - rx;
      bx1 = cx + rx;
      by0 = cy - ry;
      by1 = cy + ry;
    } else if (s.cap) {
      const [x0, y0, x1, y1, w0, w1] = s.cap;
      const w = Math.max(w0, w1);
      bx0 = Math.min(x0, x1) - w;
      bx1 = Math.max(x0, x1) + w;
      by0 = Math.min(y0, y1) - w;
      by1 = Math.max(y0, y1) + w;
    } else {
      const [x0, y0, x1, y1, w] = s.line!;
      bx0 = Math.min(x0, x1) - w;
      bx1 = Math.max(x0, x1) + w;
      by0 = Math.min(y0, y1) - w;
      by1 = Math.max(y0, y1) + w;
    }
    const px0 = Math.max(0, Math.floor(bx0 * k) + pad - 1);
    const px1 = Math.min(W - 1, Math.ceil(bx1 * k) + pad + 1);
    const py0 = Math.max(0, Math.floor((by0 + 1) * k) + pad - 1);
    const py1 = Math.min(H - 1, Math.ceil((by1 + 1) * k) + pad + 1);
    for (let py = py0; py <= py1; py++) {
      for (let px = px0; px <= px1; px++) {
        const x = (px - pad + 0.5) / k;
        const y = (py - pad + 0.5) / k - 1;
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
          const [x0, y0, x1, y1, w0, w1] = s.cap ?? [...s.line!, s.line![4]];
          const dx = x1 - x0;
          const dy = y1 - y0;
          const len2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
          const qx = x0 + dx * t;
          const qy = y0 + dy * t;
          const d = Math.hypot(x - qx, y - qy);
          const w = w0 + (w1 - w0) * t;
          inside = d <= Math.max(w / 2, 0.5 / k);
          const len = Math.sqrt(len2);
          const side = ((x - x0) * -dy + (y - y0) * dx) / len;
          const nrm = side / Math.max(0.3, w / 2);
          nx = (-dy / len) * nrm;
          ny = (dx / len) * nrm;
        }
        if (!inside) continue;
        const nn = Math.min(1, nx * nx + ny * ny);
        const nz = Math.sqrt(1 - nn);
        const lam = Math.max(0, nx * LX + ny * LY + nz * LZ) / Math.hypot(LX, LY, LZ);
        const idx = py * W + px;
        part[idx] = i;
        light[idx] = lam;
      }
    }
  });

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const set = (idx: number, hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    img.data[idx * 4] = (n >> 16) & 255;
    img.data[idx * 4 + 1] = (n >> 8) & 255;
    img.data[idx * 4 + 2] = n & 255;
    img.data[idx * 4 + 3] = 255;
  };
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : part[y * W + x]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = part[y * W + x];
      if (p < 0) continue;
      // Край, обращённый к свету (для контрового света)
      const rim = at(x - 1, y) < 0 || at(x, y - 1) < 0 || at(x - 1, y - 1) < 0;
      let c = st.shade(colors[p], mats[p], light[y * W + x], x, y, rim);
      if (st.inner) {
        const r = at(x + 1, y);
        const d = at(x, y + 1);
        const l = at(x - 1, y);
        const u = at(x, y - 1);
        // линия рисуется на передней (позже нарисованной) части
        if ((r >= 0 && r < p) || (d >= 0 && d < p) || (l >= 0 && l < p) || (u >= 0 && u < p)) {
          if (!(mats[p] === 'string' || mats[p] === 'wood')) c = st.inner(colors[p]);
        }
      }
      set(y * W + x, c);
    }
  }
  if (st.outline) {
    const w = st.outline.w;
    const base = new Int16Array(part);
    for (let pass = 0; pass < w; pass++) {
      const add: [number, number][] = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (base[y * W + x] >= 0 || img.data[(y * W + x) * 4 + 3] > 0) continue;
          let nb = -1;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const q = yy * W + xx;
            if (img.data[q * 4 + 3] > 0) nb = base[q] >= 0 ? base[q] : nb === -1 ? -2 : nb;
          }
          if (nb !== -1) add.push([x, y, nb] as unknown as [number, number]);
        }
      }
      for (const a of add as unknown as [number, number, number][]) {
        const [x, y, nb] = a;
        set(y * W + x, st.outline.color(nb >= 0 ? colors[nb] : '#000000'));
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// ───────────────────────── стили ─────────────────────────

const INK = '#2a1a10';
const HERALDIC = ['#2d52a8', '#b3261e', '#d9a520', '#2f7a3a', '#2a2420', '#ece6d6', '#6a3a7a', '#eec39a', '#8a5a32', '#b4b4ac', '#5a5a64', '#c89a60', '#6b4424'];

function skinTone(c: string, l: number): string {
  if (l > 0.78) return mix(c, '#fff2e2', 0.22);
  if (l > 0.42) return c;
  if (l > 0.22) return mix(c, '#7a4630', 0.28);
  return mix(c, '#5a3024', 0.45);
}

export const STYLES: Record<string, StyleDef> = {
  ref: {
    id: 'ref',
    name: 'Как на референсе',
    k: 2.4,
    remap: (c) => c,
    shade: (c, mat, l, x, y) => {
      if (mat === 'skin') return skinTone(c, l);
      if (mat === 'dark' || mat === 'string') return c;
      let step = l > 0.8 ? 1 : l > 0.42 ? 0 : l > 0.22 ? -1 : -2;
      if (mat === 'metal') step = l > 0.9 ? 2 : l > 0.66 ? 1 : l > 0.4 ? 0 : l > 0.2 ? -1 : -2;
      if (mat === 'cloth' && step === 0 && ((x * 7 + y * 13) % 29 === 0)) step = -1;
      return ramp(c, step);
    },
    outline: { w: 1, color: () => '#1e1612' },
    inner: (c) => mix(c, '#1e1612', 0.62),
  },
  hd: {
    id: 'hd',
    name: 'Детальный пиксель',
    k: 2,
    remap: (c) => c,
    shade: (c, mat, l, x, y) => {
      if (mat === 'skin') return skinTone(c, l + (bayer(x, y) - 0.5) * 0.1);
      const t = l + (bayer(x, y) - 0.5) * 0.12;
      let step = t > 0.8 ? 1 : t > 0.55 ? 0 : t > 0.3 ? -1 : -2;
      if ((mat === 'metal' || mat === 'gold') && t > 0.9) step = 2;
      if (mat === 'metal' && t < 0.35) step = -3;
      return ramp(c, step);
    },
    outline: { w: 1, color: (n) => ramp(n, -3) },
    inner: (c) => ramp(c, -2),
  },
  manuscript: {
    id: 'manuscript',
    name: 'Рукопись',
    k: 2,
    remap: (c, mat) => (mat === 'skin' ? '#f0cda6' : mat === 'metal' ? '#c8c8c0' : mat === 'dark' ? INK : nearest(c, HERALDIC)),
    shade: (c, mat, l, x, y) => {
      if (mat === 'dark' || mat === 'string') return c;
      if (l < 0.33 && (x + y) % 3 === 0) return mix(c, INK, 0.6);
      if (mat === 'metal' && l > 0.85) return '#ffffff';
      return c;
    },
    outline: { w: 2, color: () => INK },
    inner: () => INK,
  },
  dark: {
    id: 'dark',
    name: 'Мрачная гравюра',
    k: 2,
    remap: (c, mat) => {
      if (mat === 'gold') return desat(c, 0.3, -0.05);
      const red = satOf(c) > 0.35 && (hueOf(c) < 20 || hueOf(c) > 340);
      return red ? desat(c, 0.1, -0.08) : desat(c, 0.62, -0.06);
    },
    shade: (c, mat, l, x, y) => {
      if (mat === 'metal' && l > 0.88) return '#e8e8e0';
      if (l > 0.72) return ramp(c, 1);
      if (l > 0.46) return (x + y) % 4 === 0 ? mix(c, '#0b0908', 0.55) : mix(c, '#0b0908', 0.3);
      return (x - y) % 3 === 0 ? '#0b0908' : mix(c, '#0b0908', 0.72);
    },
    outline: { w: 2, color: () => '#070606' },
    inner: () => '#070606',
  },
  dusk: {
    id: 'dusk',
    name: 'Силуэты на закате',
    k: 1,
    remap: (c, mat) => (mat === 'gold' ? mix(c, '#2a1830', 0.35) : mix(c, '#1d1428', 0.72)),
    shade: (c, mat, l, _x, _y, rim) => {
      if (rim) return mat === 'metal' || mat === 'gold' ? '#ffd9a0' : '#f4955a';
      return l > 0.75 ? mix(c, '#5a3050', 0.18) : c;
    },
    outline: null,
    inner: null,
  },
};

export function lum(c: string) {
  return lumOf(c);
}

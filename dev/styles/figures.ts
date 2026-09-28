// Фигуры воинов для макетов стилей: набор форм в «дизайн-единицах», лицом вправо.

export type Mat = 'cloth' | 'metal' | 'skin' | 'wood' | 'leather' | 'hair' | 'horse' | 'gold' | 'string' | 'dark';

export interface Shape {
  poly?: [number, number][];
  ell?: [number, number, number, number];
  line?: [number, number, number, number, number];
  /** Конус-капсула: отрезок с толщиной w0 → w1 (конечности). */
  cap?: [number, number, number, number, number, number];
  color: string;
  mat: Mat;
}

export interface Figure {
  w: number;
  h: number;
  shapes: Shape[];
}

export interface Colors {
  main: string;
  second: string;
  pants: string;
  skin: string;
  metal: string;
  horse: string;
}

export const BLUE: Colors = { main: '#3a62b8', second: '#e2b43c', pants: '#4a4a5a', skin: '#e8bf98', metal: '#a4abb4', horse: '#8a5a32' };
export const RED: Colors = { main: '#b83434', second: '#efe8d8', pants: '#5a4a38', skin: '#f0c8a8', metal: '#9aa0a8', horse: '#3a2e28' };

const P = (color: string, mat: Mat, ...pts: [number, number][]): Shape => ({ poly: pts, color, mat });
const E = (color: string, mat: Mat, cx: number, cy: number, rx: number, ry: number): Shape => ({ ell: [cx, cy, rx, ry], color, mat });
const L = (color: string, mat: Mat, x0: number, y0: number, x1: number, y1: number, w: number): Shape => ({ line: [x0, y0, x1, y1, w], color, mat });

const LEATHER = '#6b4a2e';
const BOOT = '#3a2a1e';
const WOOD = '#8a5e36';

function legs(c: Colors, stride = 0): Shape[] {
  return [
    P(c.pants, 'cloth', [15, 33], [19, 33], [18 - stride, 46], [14 - stride, 46]),
    P(BOOT, 'leather', [13 - stride, 44], [19 - stride, 44], [20 - stride, 48], [12 - stride, 48]),
    P(c.pants, 'cloth', [19, 33], [23, 33], [24 + stride, 46], [20 + stride, 46]),
    P(BOOT, 'leather', [19 + stride, 44], [25 + stride, 44], [27 + stride, 48], [19 + stride, 48]),
  ];
}

/** Пеший латник с копьём и щитом. */
export function spearman(c: Colors): Figure {
  return {
    w: 42,
    h: 50,
    shapes: [
      L(WOOD, 'wood', 30, 47, 37, 3, 1.3),
      ...legs(c, 1),
      L(c.metal, 'metal', 22, 21, 29, 29, 3.2),
      P(c.metal, 'metal', [13, 19], [25, 19], [26, 35], [12, 35]),
      P(c.main, 'cloth', [14, 20], [24, 20], [25.5, 37], [12.5, 37]),
      P(c.second, 'cloth', [18, 20], [20.5, 20], [20.5, 37], [18, 37]),
      P(LEATHER, 'leather', [12.8, 29.5], [25.2, 29.5], [25.3, 31.3], [12.7, 31.3]),
      E(c.skin, 'skin', 19.5, 14.5, 3.8, 4.3),
      E('#5a3a22', 'hair', 16.8, 14.2, 1.2, 2.4),
      P(c.metal, 'metal', [15, 12.5], [24, 12.5], [22.6, 7.2], [16.4, 7.2]),
      E(c.metal, 'metal', 19.5, 12.6, 7, 1.6),
      E(c.skin, 'skin', 29.5, 29.5, 1.6, 1.6),
      P('#c8ccd2', 'metal', [36.2, 6], [37.8, 6], [38.2, 1], [37, -1.2], [35.9, 1]),
      P(c.main, 'cloth', [6.5, 20], [16.5, 20], [16.5, 29], [11.5, 35.5], [6.5, 29]),
      P(c.second, 'gold', [10.5, 20.5], [12.5, 20.5], [12.5, 33.5], [10.5, 31]),
      P(c.second, 'gold', [7, 24.5], [16, 24.5], [16, 26.3], [7, 26.3]),
    ],
  };
}

/** Лучник в стёганке и капюшоне. */
export function archer(c: Colors): Figure {
  const bow: Shape[] = [];
  const pts: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const y = 6 + t * 34;
    const x = 29 + Math.sin(t * Math.PI) * 5;
    pts.push([x, y]);
  }
  for (let i = 0; i < pts.length - 1; i++) bow.push(L(WOOD, 'wood', pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 1.4));
  return {
    w: 42,
    h: 50,
    shapes: [
      P(LEATHER, 'leather', [10, 16], [14, 15], [16.5, 29], [12.5, 30]),
      L('#d8d0b8', 'wood', 11, 16, 9, 11, 0.8),
      L('#d8d0b8', 'wood', 12.5, 15.5, 11.5, 10, 0.8),
      ...legs(c, 2),
      P('#b09a6a', 'cloth', [13, 19], [24.5, 19], [26, 37], [12, 37]),
      P(c.main, 'cloth', [13, 30], [25.5, 30], [26, 37], [12, 37]),
      P(LEATHER, 'leather', [12.6, 28.5], [25, 28.5], [25.1, 30.2], [12.5, 30.2]),
      L('#b09a6a', 'cloth', 22, 21, 28.5, 23, 3),
      L('#b09a6a', 'cloth', 21, 22, 23.5, 25, 3),
      E(c.skin, 'skin', 29, 23, 1.5, 1.5),
      E(c.skin, 'skin', 23.5, 25, 1.4, 1.4),
      E(c.skin, 'skin', 19.8, 14.5, 3.6, 4.2),
      P('#4a5a32', 'cloth', [14.5, 17.5], [16, 9], [20, 7.5], [23.6, 10.5], [22, 12], [17.6, 12.5], [17.5, 19]),
      ...bow,
      L('#e8e0c8', 'string', 29, 6, 23.5, 25, 0.5),
      L('#e8e0c8', 'string', 23.5, 25, 29, 40, 0.5),
      L('#d8d0b8', 'wood', 23.5, 25, 33, 24, 0.7),
    ],
  };
}

/** Конный рыцарь с копьём и в попоне. */
export function knight(c: Colors): Figure {
  const H = c.horse;
  return {
    w: 70,
    h: 58,
    shapes: [
      L(H, 'horse', 20, 38, 17, 56, 2.6),
      L(H, 'horse', 40, 38, 43, 56, 2.6),
      L('#2a1f18', 'hair', 12, 30, 7, 42, 2),
      E(H, 'horse', 29, 34, 15, 7.5),
      P(H, 'horse', [38, 30], [45, 20], [50, 23], [45, 35]),
      P(H, 'horse', [45, 16.5], [55, 23], [53.5, 26.5], [44, 23]),
      L(H, 'horse', 24, 38, 25, 56, 2.6),
      L(H, 'horse', 36, 38, 34, 56, 2.6),
      P(c.main, 'cloth', [14, 29], [44, 29], [47, 45], [12, 45]),
      P(c.second, 'gold', [12.5, 43], [47, 43], [47.3, 45.5], [12.2, 45.5]),
      E(c.second, 'gold', 30, 37, 3, 3),
      P(c.main, 'cloth', [43, 18], [49, 21.5], [46, 31], [41, 28]),
      P('#6b4a2e', 'leather', [23, 26], [35, 26], [35, 29], [23, 29]),
      P(c.metal, 'metal', [26, 26], [31, 26], [32, 38], [28, 38]),
      P(c.metal, 'metal', [25, 13], [34, 13], [35, 27], [24, 27]),
      P(c.main, 'cloth', [25.5, 15], [33.5, 15], [34.5, 29], [24.5, 29]),
      P(c.second, 'gold', [28.3, 15], [30.7, 15], [30.7, 29], [28.3, 29]),
      P(c.metal, 'metal', [26, 4], [33, 4], [33.5, 13], [25.5, 13]),
      P('#1c1612', 'dark', [29, 8], [33.6, 8], [33.6, 9], [29, 9]),
      P(c.second, 'gold', [27, 1], [31, 1], [32, 4], [26.5, 4]),
      L(WOOD, 'wood', 18, 27, 68, 12, 1.5),
      P(c.main, 'cloth', [58, 14.5], [66, 12], [64, 16], [58, 18]),
      E(c.metal, 'metal', 34, 22, 2, 2),
      P(c.main, 'cloth', [19, 17], [27, 17], [27, 26], [23, 30], [19, 26]),
      P(c.second, 'gold', [22, 17.5], [24, 17.5], [24, 28.5], [22, 27]),
    ],
  };
}

export function flipFigure(f: Figure): Figure {
  const fx = (x: number) => f.w - x;
  return {
    w: f.w,
    h: f.h,
    shapes: f.shapes.map((s) => ({
      ...s,
      poly: s.poly?.map(([x, y]) => [fx(x), y] as [number, number]),
      ell: s.ell ? [fx(s.ell[0]), s.ell[1], s.ell[2], s.ell[3]] : undefined,
      line: s.line ? [fx(s.line[0]), s.line[1], fx(s.line[2]), s.line[3], s.line[4]] : undefined,
      cap: s.cap ? [fx(s.cap[0]), s.cap[1], fx(s.cap[2]), s.cap[3], s.cap[4], s.cap[5]] : undefined,
    })),
  };
}

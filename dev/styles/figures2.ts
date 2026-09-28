// Детальные фигуры в реалистичных пропорциях (голова ≈ 1/7 роста), боевая стойка, лицом вправо.
// Дизайн-единицы: рост 64, земля на y = 64.

import type { Figure, Mat, Shape } from './figures';

type Pt = [number, number];
const cap = (color: string, mat: Mat, a: Pt, b: Pt, w0: number, w1 = w0): Shape => ({ cap: [a[0], a[1], b[0], b[1], w0, w1], color, mat });
const poly = (color: string, mat: Mat, ...pts: Pt[]): Shape => ({ poly: pts, color, mat });
const ell = (color: string, mat: Mat, cx: number, cy: number, rx: number, ry: number): Shape => ({ ell: [cx, cy, rx, ry], color, mat });

export interface Kit {
  skin: string;
  hair: string;
  main: string;
  second: string;
  steel: string;
}

export const KIT_BLUE: Kit = { skin: '#e3b58e', hair: '#5a3a22', main: '#34589e', second: '#d9a834', steel: '#8e9aa8' };
export const KIT_RED: Kit = { skin: '#efc3a0', hair: '#b07a3a', main: '#a8302c', second: '#ece4d0', steel: '#9a9ea4' };

const DARK = '#1e1612';

// Суставы боевой стойки
const BH: Pt = [22, 37];
const BK: Pt = [17.5, 48];
const BA: Pt = [14.5, 59.5];
const FH: Pt = [28, 37];
const FK: Pt = [33, 48];
const FA: Pt = [32.5, 59.5];

function head(k: Kit, beard: boolean, hairTop: boolean): Shape[] {
  const out: Shape[] = [
    cap(k.skin, 'skin', [25, 19], [25.8, 14.5], 3.6, 3.2),
    ell(k.skin, 'skin', 26.2, 11, 4.1, 5),
    poly(k.skin, 'skin', [29.6, 9.8], [31.8, 13], [29.9, 13.8]),
    ell(k.skin, 'skin', 24.1, 11.6, 1.1, 1.5),
  ];
  if (hairTop) out.push(poly(k.hair, 'hair', [22.2, 10.5], [22.8, 7], [25.5, 5.6], [29, 6.2], [30.2, 8.3], [26, 8.2], [24.6, 10.8]));
  else out.push(poly(k.hair, 'hair', [22.1, 11], [22.4, 8.8], [23.6, 9.5], [23.6, 12.5]));
  if (beard) out.push(poly(k.hair, 'hair', [23.4, 12.4], [25.2, 13.8], [29.9, 14], [29.8, 16.2], [27.5, 17.6], [24.6, 16.8]));
  out.push(
    cap(DARK, 'dark', [28.3, 10.3], [29.1, 10.25], 0.9),
    cap(k.hair, 'hair', [27.6, 9.1], [29.6, 8.9], 0.7),
    cap('#6a3a2a', 'dark', [28.4, 14.9], [29.6, 14.9], 0.5),
  );
  return out;
}

function boots(color: string, mat: Mat): Shape[] {
  return [
    poly(color, mat, [12.4, 57.6], [17, 57.6], [17.6, 60.4], [20.8, 62.2], [20.8, 64], [12.2, 64]),
    poly(color, mat, [30.4, 57.6], [35, 57.6], [35.6, 60.4], [39.4, 62.2], [39.4, 64], [30.2, 64]),
  ];
}

/** Крестьянин с ножом (как первый герой на референсе). */
export function peasant(k: Kit): Figure {
  const shirt = '#8c8a82';
  const pants = '#a09a8a';
  return {
    w: 48,
    h: 66,
    shapes: [
      // дальняя рука со сжатым кулаком
      cap(shirt, 'cloth', [29, 21], [33, 26], 4.4, 4),
      cap(k.skin, 'skin', [33, 26], [37, 23.5], 3.4, 3),
      ell(k.skin, 'skin', 37.8, 23.2, 2.1, 2),
      // ноги
      cap(pants, 'cloth', BH, BK, 6.2, 5.2),
      cap(pants, 'cloth', BK, [15.5, 55], 5.2, 5.4),
      cap(k.skin, 'skin', [15.5, 55], BA, 3.2, 3),
      cap(pants, 'cloth', FH, FK, 6.2, 5.2),
      cap(pants, 'cloth', FK, [32.8, 55], 5.2, 5.4),
      cap(k.skin, 'skin', [32.8, 55], FA, 3.2, 3),
      poly(k.skin, 'skin', [13.2, 59.5], [16.4, 59.5], [19.8, 62.6], [19.8, 64], [13, 64]),
      poly(k.skin, 'skin', [31.2, 59.5], [34.4, 59.5], [38.2, 62.6], [38.2, 64], [31, 64]),
      poly('#6e6a60', 'cloth', [12.4, 55.5], [18.5, 55.5], [18, 56.8], [12.6, 56.8]),
      poly('#6e6a60', 'cloth', [30, 55.5], [35.8, 55.5], [35.6, 56.8], [30.1, 56.8]),
      // рубаха
      poly(shirt, 'cloth', [19, 18.5], [30.2, 18.8], [31.4, 29], [30.8, 40.5], [18.6, 40.5], [18.2, 29]),
      poly('#6e6c64', 'cloth', [18.6, 37], [30.9, 37], [31, 38.4], [18.5, 38.4]),
      cap('#6e6c64', 'dark', [22, 22], [21, 35], 0.45),
      cap('#6e6c64', 'dark', [27.5, 23], [28.5, 34], 0.45),
      // ближняя рука с ножом
      cap(shirt, 'cloth', [22, 20.5], [23.4, 26.5], 4.6, 4.2),
      cap(k.skin, 'skin', [23.4, 26.5], [28.8, 31], 3.4, 3),
      cap('#c8ccd0', 'metal', [30, 30.4], [37.5, 25.6], 1.9, 0.5),
      cap('#4a3220', 'wood', [27.5, 32], [30.2, 30.3], 1.6),
      ell(k.skin, 'skin', 29, 31.1, 2.1, 2),
      ...head(k, true, false),
    ],
  };
}

/** Латник в стёганке, кожаной куртке и шапеле, с каплевидным щитом и мечом. */
export function soldier(k: Kit): Figure {
  const gamb = '#8a6c4a';
  const leather = '#5e4028';
  const pants = '#6c6a62';
  return {
    w: 48,
    h: 66,
    shapes: [
      // меч и дальняя рука
      cap(k.steel, 'metal', [37.5, 24.5], [45.5, 6.5], 1.9, 1.1),
      cap('#5a5a60', 'metal', [34.8, 23.8], [40, 26.8], 1.1),
      cap(gamb, 'cloth', [29, 21], [33.5, 27.5], 4.6, 4.2),
      cap(gamb, 'cloth', [33.5, 27.5], [36.8, 25.6], 4, 3.4),
      ell('#4a3220', 'leather', 37.3, 25.4, 2, 2),
      // ноги
      cap(pants, 'cloth', BH, BK, 6.4, 5.4),
      cap(pants, 'cloth', BK, BA, 5.2, 4.3),
      cap(pants, 'cloth', FH, FK, 6.4, 5.4),
      cap(pants, 'cloth', FK, FA, 5.2, 4.3),
      cap('#4a3a2a', 'leather', [16.2, 51.5], [15, 57], 4.6),
      cap('#4a3a2a', 'leather', [33, 51.5], [32.8, 57], 4.6),
      ...boots('#3a281a', 'leather'),
      // стёганка, юбка, куртка
      poly(gamb, 'cloth', [18.4, 36], [30.8, 36], [32.6, 44.5], [16.8, 44.5]),
      cap('#6e5438', 'dark', [21, 37], [20.2, 44], 0.45),
      cap('#6e5438', 'dark', [25, 37], [25, 44.3], 0.45),
      cap('#6e5438', 'dark', [29, 37], [29.8, 44], 0.45),
      poly(gamb, 'cloth', [19, 18.5], [30.2, 18.8], [31.5, 29], [30.6, 37.5], [18.8, 37.5], [18.2, 29]),
      poly(leather, 'leather', [19.6, 20.5], [29.6, 20.8], [30.6, 30], [29.8, 37.2], [19.6, 37.2], [18.9, 30]),
      cap('#3e2a18', 'dark', [24.7, 21], [24.7, 36.5], 0.5),
      ell('#c8a050', 'gold', 25.8, 24, 0.6, 0.6),
      ell('#c8a050', 'gold', 25.8, 28, 0.6, 0.6),
      ell('#c8a050', 'gold', 25.8, 32, 0.6, 0.6),
      poly('#2e2018', 'leather', [18.6, 35.2], [30.8, 35.2], [30.9, 37.2], [18.5, 37.2]),
      ell('#c8a050', 'gold', 26.8, 36.2, 1.1, 1),
      ...head(k, true, false),
      // шапель
      poly(k.steel, 'metal', [21.4, 8.6], [30.8, 8.6], [29.6, 4.6], [26.2, 3.4], [22.6, 4.6]),
      ell(k.steel, 'metal', 26.1, 8.8, 7.2, 1.3),
      cap('#5a6068', 'dark', [26.2, 3.6], [26.2, 8], 0.5),
      // ближняя рука и щит
      cap(gamb, 'cloth', [22, 20.5], [24, 28.5], 4.8, 4.3),
      cap(gamb, 'cloth', [24, 28.5], [29, 31], 4.2, 3.6),
      poly('#5a3e24', 'wood', [26.2, 18.6], [35.8, 20.2], [36.4, 30.5], [31.4, 46], [25.6, 31.2]),
      poly(k.main, 'cloth', [27, 19.8], [35, 21.2], [35.5, 30.3], [31.3, 44], [26.5, 31]),
      poly(k.second, 'gold', [30.2, 20.5], [32, 20.8], [32, 42], [31.1, 44], [30.2, 42]),
      poly(k.second, 'gold', [26.7, 26.2], [35.3, 27.4], [35.3, 29.2], [26.6, 28]),
    ],
  };
}

/** Рыцарь в полных латах с круглым щитом. */
export function plateKnight(k: Kit): Figure {
  const S = k.steel;
  const S2 = '#6e7884';
  const mail = '#747a82';
  return {
    w: 48,
    h: 66,
    shapes: [
      // меч и дальняя рука
      cap('#b8c0c8', 'metal', [37.5, 25], [46.5, 7.5], 2, 1.1),
      cap(S2, 'metal', [34.6, 24.2], [40.4, 27.6], 1.2),
      cap(S, 'metal', [29, 21], [33.5, 27.5], 4.8, 4.2),
      ell(S, 'metal', 33.4, 27.4, 2.4, 2.2),
      cap(S, 'metal', [33.5, 27.5], [36.8, 25.6], 4.2, 3.6),
      ell(S2, 'metal', 37.4, 25.6, 2.2, 2.1),
      // ноги
      cap(mail, 'metal', BH, [20.5, 41], 6.2),
      cap(S, 'metal', [21, 40], BK, 6, 5.2),
      ell('#a8b2bc', 'metal', BK[0], BK[1], 2.9, 2.7),
      cap(S, 'metal', BK, BA, 5, 4.2),
      cap(mail, 'metal', FH, [29.5, 41], 6.2),
      cap(S, 'metal', [29.5, 40], FK, 6, 5.2),
      ell('#a8b2bc', 'metal', FK[0], FK[1], 2.9, 2.7),
      cap(S, 'metal', FK, FA, 5, 4.2),
      ...boots(S2, 'metal'),
      // латы корпуса и набедренные пластины
      poly(mail, 'metal', [18.4, 34], [30.8, 34], [32, 41], [17.2, 41]),
      poly(S, 'metal', [18.4, 34.5], [31, 34.5], [31.6, 37.2], [18, 37.2]),
      poly(S, 'metal', [18, 37], [31.6, 37], [32.3, 39.8], [17.4, 39.8]),
      poly(S, 'metal', [17.6, 39.6], [32.2, 39.6], [32.6, 42.2], [17.2, 42.2]),
      poly(S, 'metal', [19, 18.5], [30, 19], [32, 27.5], [30.4, 35], [19.4, 35], [18, 27.5]),
      cap('#c0c8d0', 'metal', [27.4, 21], [29.6, 30], 0.9),
      cap(k.main, 'cloth', [18.6, 33.5], [31, 33.5], 1.6),
      // шлем-бацинет с забралом
      cap(S2, 'metal', [23, 17], [29, 18], 4.2),
      poly(S, 'metal', [21, 13], [21.6, 6.5], [24.5, 3.6], [28.5, 3.6], [31.2, 7], [32.6, 11], [31.4, 16.5], [27.5, 18.2], [22.4, 17.2]),
      poly('#a0aab4', 'metal', [26.6, 7.2], [31.8, 9], [35.2, 12.2], [31.6, 15.8], [26.8, 16.6]),
      cap(DARK, 'dark', [27.4, 10.4], [32.4, 11.2], 0.75),
      cap('#6e7884', 'dark', [27, 12.2], [35, 12.2], 0.35),
      ell(DARK, 'dark', 30.2, 14, 0.35, 0.35),
      ell(DARK, 'dark', 31.4, 13.6, 0.35, 0.35),
      ell(k.second, 'gold', 24.4, 3.4, 1.4, 1),
      // ближняя рука: наплечник, налокотник, щит
      cap(S, 'metal', [22, 20.5], [24, 28.5], 4.8, 4.3),
      ell('#a8b2bc', 'metal', 22.4, 21, 4.4, 3.6),
      ell('#a8b2bc', 'metal', 24.1, 28.6, 2.5, 2.3),
      cap(S, 'metal', [24, 28.5], [29, 31], 4.2, 3.6),
      ell(S2, 'metal', 31.2, 30.2, 8, 9.2),
      ell('#6a4426', 'wood', 31.2, 30.2, 7.2, 8.4),
      ell(k.main, 'cloth', 31.2, 30.2, 5.4, 6.4),
      cap(k.second, 'gold', [31.2, 24], [31.2, 36.4], 1.4),
      cap(k.second, 'gold', [25.8, 30.2], [36.6, 30.2], 1.4),
      ell('#c0c8d0', 'metal', 31.6, 29.8, 1.8, 2),
    ],
  };
}

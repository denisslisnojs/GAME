// Детальные фигуры: набор форм (многоугольники, эллипсы, конусы-капсулы) в «дизайн-единицах»
// с материалом и фактурой; рисуются в paint.ts.

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

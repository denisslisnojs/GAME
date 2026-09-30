// «Живописный» рендер фигур: те же формы, что и у растеризатора (figure.ts), но рисуются
// средствами Canvas 2D — гладкие края, плавная светотень градиентами, блики на металле,
// фактура узором в размер детали, мягкая тень от деталей переднего плана и тонкий контур.

import { mix, ramp } from './color';
import type { Mat, Pat, Shape } from './figure';

const OUT = '#1a1410';
/** Направление света: слева сверху (как у растеризатора). */
const LX = -0.55;
const LY = -0.65;

type Ctx = CanvasRenderingContext2D;

const toneCache = new Map<string, string>();
function tone(c: string, step: number): string {
  const k = `${c}${step}`;
  let v = toneCache.get(k);
  if (!v) {
    v = step === 0 ? c : ramp(c, step);
    toneCache.set(k, v);
  }
  return v;
}

/** Контур детали в пикселях. */
function pathOf(s: Shape, k: number, ox: number, oy: number): Path2D {
  const p = new Path2D();
  const X = (x: number) => x * k + ox;
  const Y = (y: number) => y * k + oy;
  if (s.poly) {
    s.poly.forEach(([x, y], i) => (i ? p.lineTo(X(x), Y(y)) : p.moveTo(X(x), Y(y))));
    p.closePath();
  } else if (s.ell) {
    const [cx, cy, rx, ry] = s.ell;
    p.ellipse(X(cx), Y(cy), Math.max(0.5, rx * k), Math.max(0.5, ry * k), 0, 0, Math.PI * 2);
  } else {
    const [x0, y0, x1, y1, w0, w1] = s.cap!;
    const ax = X(x0);
    const ay = Y(y0);
    const bx = X(x1);
    const by = Y(y1);
    const r0 = Math.max(0.55, (w0 * k) / 2);
    const r1 = Math.max(0.55, (w1 * k) / 2);
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 0.01) {
      p.arc(ax, ay, Math.max(r0, r1), 0, Math.PI * 2);
      return p;
    }
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    const nx = -uy;
    const ny = ux;
    const an = Math.atan2(ny, nx);
    p.moveTo(ax + nx * r0, ay + ny * r0);
    p.lineTo(bx + nx * r1, by + ny * r1);
    p.arc(bx, by, r1, an, an - Math.PI, true);
    p.lineTo(ax - nx * r0, ay - ny * r0);
    p.arc(ax, ay, r0, an - Math.PI, an - Math.PI * 2, true);
    p.closePath();
  }
  return p;
}

/** Ступени светотени по материалу: [позиция 0..1 от света к тени, сдвиг тона]. */
function stopsOf(c: string, mat: Mat): [number, string][] {
  switch (mat) {
    case 'metal':
      return [
        [0, tone(c, 0.6)],
        [0.16, mix(c, '#ffffff', 0.72)],
        [0.3, tone(c, 1)],
        [0.56, tone(c, -0.5)],
        [0.84, tone(c, -2.1)],
        [1, tone(c, -1.2)],
      ];
    case 'gold':
      return [
        [0, tone(c, 0.8)],
        [0.18, mix(c, '#fff6d0', 0.7)],
        [0.45, c],
        [0.85, tone(c, -1.8)],
        [1, tone(c, -1)],
      ];
    case 'skin':
      return [
        [0, mix(c, '#fff0dc', 0.22)],
        [0.45, c],
        [0.85, mix(c, '#6a3828', 0.34)],
        [1, mix(c, '#7a4630', 0.26)],
      ];
    case 'horse':
      return [
        [0, tone(c, 0.9)],
        [0.22, tone(c, 1.3)],
        [0.5, c],
        [0.88, tone(c, -1.6)],
        [1, tone(c, -1.1)],
      ];
    default:
      return [
        [0, tone(c, 0.6)],
        [0.24, tone(c, 1)],
        [0.52, c],
        [0.88, tone(c, -1.5)],
        [1, tone(c, -1.1)],
      ];
  }
}

/** Заливка детали: градиент поперёк «объёма» от освещённой стороны к теневой. */
function fillOf(ctx: Ctx, s: Shape, k: number, ox: number, oy: number): CanvasGradient | string {
  const c = s.color;
  if (s.mat === 'dark' || s.mat === 'string') return c;
  const stops = stopsOf(c, s.mat);
  let g: CanvasGradient;
  if (s.ell) {
    const [cx, cy, rx, ry] = s.ell;
    const px = cx * k + ox;
    const py = cy * k + oy;
    const R = Math.max(rx, ry) * k;
    // Радиальный градиент со светом, смещённым к левому верхнему краю
    g = ctx.createRadialGradient(px - rx * k * 0.42, py - ry * k * 0.5, 0, px - rx * k * 0.1, py - ry * k * 0.12, R * 1.32);
  } else if (s.cap) {
    const [x0, y0, x1, y1, w0, w1] = s.cap;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    if (nx * LX + ny * LY < 0) {
      nx = -nx;
      ny = -ny;
    }
    const hw = (Math.max(w0, w1) / 2) * k + 0.5;
    const mx = ((x0 + x1) / 2) * k + ox;
    const my = ((y0 + y1) / 2) * k + oy;
    g = ctx.createLinearGradient(mx + nx * hw, my + ny * hw, mx - nx * hw, my - ny * hw);
  } else {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y] of s.poly!) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    const h = y1 - y0;
    // Как у растеризатора: свет меняется в основном слева направо, чуть — сверху вниз
    g = ctx.createLinearGradient(x0 * k + ox, (y0 + h * 0.3) * k + oy, x1 * k + ox, (y1 - h * 0.3) * k + oy);
  }
  for (const [t, col] of stops) g.addColorStop(t, col);
  return g;
}

/** Плитки фактуры: рисуются в размер дизайн-единиц, поэтому не мельчат при любой чёткости. */
const patCache = new Map<string, CanvasPattern | null>();
function patternOf(ctx: Ctx, pat: Pat | 'fur' | 'wood', k: number, c: string): CanvasPattern | null {
  const key = `${pat}|${k.toFixed(3)}|${c}`;
  if (patCache.has(key)) return patCache.get(key)!;
  const [tw, th] = { mail: [1.5, 1.3], scale: [2.4, 2.1], lamellar: [1.7, 2.8], rivets: [3.2, 4], quilt: [3.2, 3.2], plank: [4, 6], fur: [3, 3], wood: [5, 2.2], none: [1, 1] }[pat];
  const W = Math.max(2, Math.round(tw * k));
  const H = Math.max(2, Math.round(th * k));
  const t = document.createElement('canvas');
  t.width = W;
  t.height = H;
  const g = t.getContext('2d')!;
  const dark = mix(c, OUT, 0.7);
  const lite = mix(c, '#ffffff', 0.55);
  const lw = Math.max(0.6, k * 0.16);
  g.lineWidth = lw;
  switch (pat) {
    case 'mail': {
      // Колечки в шахматном порядке: тёмный низ, светлый верх
      const r = W * 0.3;
      for (const [x, y] of [[W * 0.25, H * 0.25], [W * 0.75, H * 0.75], [W * 1.25, H * 0.25], [-W * 0.25, H * 0.75], [W * 0.25, H * 1.25], [W * 0.75, -H * 0.25]]) {
        g.strokeStyle = dark;
        g.globalAlpha = 0.55;
        g.beginPath();
        g.arc(x, y, r, 0.1 * Math.PI, 0.9 * Math.PI);
        g.stroke();
        g.strokeStyle = lite;
        g.globalAlpha = 0.45;
        g.beginPath();
        g.arc(x, y, r, 1.1 * Math.PI, 1.9 * Math.PI);
        g.stroke();
      }
      break;
    }
    case 'scale': {
      // Чешуйки внахлёст: светлая макушка, тёмный край
      for (const [x, y] of [[W * 0.5, 0], [0, H * 0.5], [W, H * 0.5], [W * 0.5, H]]) {
        g.globalAlpha = 0.35;
        g.fillStyle = lite;
        g.beginPath();
        g.arc(x, y - H * 0.12, W * 0.28, Math.PI, 0);
        g.fill();
        g.globalAlpha = 0.6;
        g.strokeStyle = dark;
        g.beginPath();
        g.arc(x, y, W * 0.5, 0.05 * Math.PI, 0.95 * Math.PI);
        g.stroke();
      }
      break;
    }
    case 'lamellar':
      g.globalAlpha = 0.55;
      g.strokeStyle = dark;
      g.strokeRect(lw / 2, lw / 2, W - lw, H - lw);
      g.globalAlpha = 0.35;
      g.fillStyle = lite;
      g.fillRect(lw, lw, Math.max(1, W * 0.22), H - lw * 2);
      break;
    case 'rivets':
      g.fillStyle = '#e8c868';
      g.beginPath();
      g.arc(W * 0.5, H * 0.35, Math.max(0.7, k * 0.32), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff4c0';
      g.beginPath();
      g.arc(W * 0.45, H * 0.3, Math.max(0.35, k * 0.12), 0, Math.PI * 2);
      g.fill();
      break;
    case 'quilt':
      // Стёганые ряды: строчка и лёгкая выпуклость между ними
      g.globalAlpha = 0.28;
      g.fillStyle = lite;
      g.fillRect(0, H * 0.15, W, H * 0.3);
      g.globalAlpha = 0.5;
      g.strokeStyle = dark;
      g.setLineDash([W * 0.3, W * 0.2]);
      g.beginPath();
      g.moveTo(0, H - lw);
      g.lineTo(W, H - lw);
      g.stroke();
      break;
    case 'plank':
      g.globalAlpha = 0.45;
      g.strokeStyle = dark;
      g.beginPath();
      g.moveTo(lw / 2, 0);
      g.lineTo(lw / 2, H);
      g.stroke();
      g.strokeStyle = lite;
      g.globalAlpha = 0.2;
      g.beginPath();
      g.moveTo(lw * 1.5, 0);
      g.lineTo(lw * 1.5, H);
      g.stroke();
      break;
    case 'fur':
      g.strokeStyle = dark;
      g.globalAlpha = 0.4;
      for (const [x, y] of [[0.2, 0.3], [0.65, 0.15], [0.45, 0.7], [0.9, 0.6]]) {
        g.beginPath();
        g.moveTo(x * W, y * H);
        g.lineTo(x * W + W * 0.12, y * H + H * 0.3);
        g.stroke();
      }
      g.strokeStyle = lite;
      g.globalAlpha = 0.3;
      g.beginPath();
      g.moveTo(0.3 * W, 0.05 * H);
      g.lineTo(0.38 * W, 0.3 * H);
      g.stroke();
      break;
    case 'wood':
      g.strokeStyle = dark;
      g.globalAlpha = 0.22;
      g.beginPath();
      g.moveTo(0, H * 0.4);
      g.bezierCurveTo(W * 0.3, H * 0.2, W * 0.6, H * 0.7, W, H * 0.45);
      g.stroke();
      break;
    default:
      return null;
  }
  const res = ctx.createPattern(t, 'repeat');
  patCache.set(key, res);
  return res;
}

/**
 * Нарисовать фигуру в контекст. k — пикселей на дизайн-единицу, (ox, oy) — где окажется (0, 0) дизайна,
 * px — ширина линий в пикселях (чёткость кадра).
 */
export function paintShapes(ctx: Ctx, shapes: Shape[], k: number, ox: number, oy: number, px = 1) {
  const paths = shapes.map((s) => pathOf(s, k, ox, oy));
  // Мягкая тень от детали на то, что уже нарисовано под ней (свет слева сверху — тень вправо вниз)
  const sdx = 0.55 * k;
  const sdy = 0.7 * k;
  shapes.forEach((s, i) => {
    const p = paths[i];
    const thin = s.cap ? Math.max(s.cap[4], s.cap[5]) * k < 2.6 * px : false;
    if (i > 0 && s.mat !== 'string' && !thin) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.translate(sdx, sdy);
      ctx.fillStyle = 'rgba(28, 18, 40, 0.26)';
      ctx.fill(p);
      ctx.restore();
    }
    ctx.fillStyle = fillOf(ctx, s, k, ox, oy);
    ctx.fill(p);
    const texture = s.pat && s.pat !== 'none' ? s.pat : s.mat === 'fur' ? 'fur' : s.mat === 'wood' && !thin ? 'wood' : null;
    if (texture) {
      const pt = patternOf(ctx, texture, k, s.color);
      if (pt) {
        ctx.fillStyle = pt;
        ctx.fill(p);
      }
    }
    // Блик по верхнему левому краю: деталь выглядит выпуклой
    if (s.mat !== 'string' && s.mat !== 'dark' && !thin) {
      ctx.save();
      ctx.clip(p);
      ctx.translate(1.1 * px, 1.3 * px);
      ctx.lineWidth = 1.5 * px;
      ctx.strokeStyle = s.mat === 'metal' || s.mat === 'gold' ? 'rgba(255, 255, 255, 0.5)' : s.mat === 'skin' ? 'rgba(255, 240, 220, 0.3)' : 'rgba(255, 250, 235, 0.22)';
      ctx.stroke(p);
      ctx.restore();
    }
    // Тонкий контур детали — темнее её собственного цвета
    if (s.mat !== 'string' && s.mat !== 'dark' && !thin) {
      ctx.lineWidth = 0.85 * px;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = mix(s.color, OUT, 0.72);
      ctx.globalAlpha = 0.85;
      ctx.stroke(p);
      ctx.globalAlpha = 1;
    }
  });
}

/** Внешняя обводка всей фигуры: силуэт тёмным цветом, сдвинутый во все стороны, под рисунком. */
export function outline(dst: Ctx, src: HTMLCanvasElement, x: number, y: number, r: number) {
  const sil = document.createElement('canvas');
  sil.width = src.width;
  sil.height = src.height;
  const g = sil.getContext('2d')!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = OUT;
  g.fillRect(0, 0, sil.width, sil.height);
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    dst.drawImage(sil, x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  dst.drawImage(src, x, y);
}

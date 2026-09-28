import { GRID_H, GRID_W } from '../config';

/** Минимальная цена клетки: нужна для допустимой эвристики A*. */
const MIN_COST = 0.85;
const SQRT2 = Math.SQRT2;

class MinHeap {
  private idx: Int32Array;
  private pri: Float32Array;
  size = 0;
  constructor(cap: number) {
    this.idx = new Int32Array(cap);
    this.pri = new Float32Array(cap);
  }
  push(i: number, p: number) {
    if (this.size >= this.idx.length) this.grow();
    let k = this.size++;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (this.pri[parent] <= p) break;
      this.idx[k] = this.idx[parent];
      this.pri[k] = this.pri[parent];
      k = parent;
    }
    this.idx[k] = i;
    this.pri[k] = p;
  }
  pop(): number {
    const top = this.idx[0];
    const lastI = this.idx[--this.size];
    const lastP = this.pri[this.size];
    let k = 0;
    for (;;) {
      let c = 2 * k + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.pri[c + 1] < this.pri[c]) c++;
      if (this.pri[c] >= lastP) break;
      this.idx[k] = this.idx[c];
      this.pri[k] = this.pri[c];
      k = c;
    }
    this.idx[k] = lastI;
    this.pri[k] = lastP;
    return top;
  }
  private grow() {
    const n = this.idx.length * 2;
    const i2 = new Int32Array(n);
    i2.set(this.idx);
    const p2 = new Float32Array(n);
    p2.set(this.pri);
    this.idx = i2;
    this.pri = p2;
  }
}

const N = GRID_W * GRID_H;
const gScore = new Float32Array(N);
const came = new Int32Array(N);
const stamp = new Uint32Array(N);
const closed = new Uint32Array(N);
let curStamp = 0;

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

/**
 * A* по сетке клеток. Возвращает список индексов клеток от старта до цели (включительно)
 * или null, если пути нет.
 */
export function findPath(cost: Float32Array, sx: number, sy: number, tx: number, ty: number, maxExpand = 200000): number[] | null {
  if (!isFinite(cost[ty * GRID_W + tx])) return null;
  curStamp++;
  const start = sy * GRID_W + sx;
  const goal = ty * GRID_W + tx;
  const heap = new MinHeap(4096);
  gScore[start] = 0;
  stamp[start] = curStamp;
  came[start] = -1;
  heap.push(start, 0);
  let expanded = 0;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (closed[cur] === curStamp) continue;
    closed[cur] = curStamp;
    if (++expanded > maxExpand) return null;
    const cx = cur % GRID_W;
    const cy = (cur / GRID_W) | 0;
    const g0 = gScore[cur];
    const c0 = cost[cur];
    for (const [dx, dy, len] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      const ni = ny * GRID_W + nx;
      const c1 = cost[ni];
      if (!isFinite(c1)) continue;
      // Диагональ нельзя «срезать» через непроходимый угол
      if (dx !== 0 && dy !== 0) {
        if (!isFinite(cost[cy * GRID_W + nx]) || !isFinite(cost[ny * GRID_W + cx])) continue;
      }
      const g = g0 + len * (c0 + c1) * 0.5;
      if (stamp[ni] !== curStamp || g < gScore[ni]) {
        stamp[ni] = curStamp;
        gScore[ni] = g;
        came[ni] = cur;
        const hx = Math.abs(nx - tx);
        const hy = Math.abs(ny - ty);
        const h = (Math.max(hx, hy) + (SQRT2 - 1) * Math.min(hx, hy)) * MIN_COST;
        heap.push(ni, g + h);
      }
    }
  }
  if (stamp[goal] !== curStamp) return null;
  const path: number[] = [];
  for (let c = goal; c !== -1; c = came[c]) path.push(c);
  path.reverse();
  return path;
}

/** Все клетки прямой между двумя клетками проходимы и одного «типа» (суша/вода)? */
function lineClear(cost: Float32Array, water: (i: number) => boolean, a: number, b: number): boolean {
  let x0 = a % GRID_W;
  let y0 = (a / GRID_W) | 0;
  const x1 = b % GRID_W;
  const y1 = (b / GRID_W) | 0;
  const w0 = water(a);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const c0 = cost[a];
  for (;;) {
    const i = y0 * GRID_W + x0;
    const c = cost[i];
    if (!isFinite(c) || water(i) !== w0 || Math.abs(c - c0) > 0.6) return false;
    if (x0 === x1 && y0 === y1) return true;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Спрямляет путь: убирает промежуточные точки там, где можно идти по прямой. */
export function smoothPath(cost: Float32Array, water: (i: number) => boolean, path: number[]): number[] {
  if (path.length < 3) return path;
  const out = [path[0]];
  let anchor = 0;
  while (anchor < path.length - 1) {
    let best = anchor + 1;
    for (let j = Math.min(path.length - 1, anchor + 14); j > anchor + 1; j--) {
      if (lineClear(cost, water, path[anchor], path[j])) {
        best = j;
        break;
      }
    }
    out.push(path[best]);
    anchor = best;
  }
  return out;
}

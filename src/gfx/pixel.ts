/** Маленький холст для рисования пиксель-арта по точкам. */
export class Pix {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.ctx.imageSmoothingEnabled = false;
  }

  p(x: number, y: number, c: string | null): this {
    if (!c || x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    this.ctx.fillStyle = c;
    this.ctx.fillRect(x | 0, y | 0, 1, 1);
    return this;
  }

  /** Стереть пиксель (сделать прозрачным). */
  clear(x: number, y: number): this {
    this.ctx.clearRect(x | 0, y | 0, 1, 1);
    return this;
  }

  rect(x: number, y: number, w: number, h: number, c: string): this {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
    return this;
  }

  hline(x0: number, x1: number, y: number, c: string): this {
    return this.rect(Math.min(x0, x1), y, Math.abs(x1 - x0) + 1, 1, c);
  }

  vline(x: number, y0: number, y1: number, c: string): this {
    return this.rect(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, c);
  }

  /** Контур по непрозрачным пикселям (обводка снаружи). */
  outline(c: string): this {
    const data = this.ctx.getImageData(0, 0, this.w, this.h).data;
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h && data[(y * this.w + x) * 4 + 3] > 0;
    const pts: [number, number][] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (solid(x, y)) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) pts.push([x, y]);
      }
    }
    for (const [x, y] of pts) this.p(x, y, c);
    return this;
  }

  /** Рисует картинку по строкам: каждый символ — ключ палитры, '.' — пусто. */
  pattern(x0: number, y0: number, rows: string[], pal: Record<string, string | null>, flip = false): this {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const c = pal[ch];
        if (c) this.p(flip ? x0 + row.length - 1 - x : x0 + x, y0 + y, c);
      }
    }
    return this;
  }

  dataURL(): string {
    return this.canvas.toDataURL();
  }
}

export function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

/** Осветлить (k>0) или затемнить (k<0) цвет. */
export function shade(c: string, k: number): string {
  const n = parseInt(c.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (k >= 0) {
    r += (255 - r) * k;
    g += (255 - g) * k;
    b += (255 - b) * k;
  } else {
    r *= 1 + k;
    g *= 1 + k;
    b *= 1 + k;
  }
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

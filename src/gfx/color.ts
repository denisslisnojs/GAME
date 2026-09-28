// Цветовые утилиты: смешение, «лесенка тонов» со сдвигом оттенка, дизеринг.

export type RGB = [number, number, number];

export function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexOf(c: RGB): string {
  return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return hexOf([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

function toHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

function fromHsl(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Сдвиг по «лесенке тонов»: тени холоднее и насыщеннее, света теплее. step от −3 до +2. */
export function ramp(hex: string, step: number): string {
  if (step === 0) return hex;
  let [h, s, l] = toHsl(rgb(hex));
  const toward = (target: number, amt: number) => {
    let d = ((target - h + 540) % 360) - 180;
    return h + d * amt;
  };
  if (step < 0) {
    h = toward(245, 0.06 * -step);
    s = Math.min(1, s * (1 + 0.04 * -step));
    l = l * (1 - 0.2 * -step);
  } else {
    h = toward(50, 0.08 * step);
    s = s * (1 - 0.06 * step);
    l = l + (1 - l) * 0.22 * step;
  }
  return hexOf(fromHsl(h, s, l));
}

export function desat(hex: string, amt: number, dl = 0): string {
  const [h, s, l] = toHsl(rgb(hex));
  return hexOf(fromHsl(h, s * (1 - amt), Math.max(0, Math.min(1, l + dl))));
}

export function satOf(hex: string): number {
  return toHsl(rgb(hex))[1];
}

export function hueOf(hex: string): number {
  return toHsl(rgb(hex))[0];
}

export function lumOf(hex: string): number {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Ближайший цвет из палитры. */
export function nearest(hex: string, pal: string[]): string {
  const c = rgb(hex);
  let best = pal[0];
  let bd = Infinity;
  for (const p of pal) {
    const q = rgb(p);
    const d = (c[0] - q[0]) ** 2 * 0.3 + (c[1] - q[1]) ** 2 * 0.59 + (c[2] - q[2]) ** 2 * 0.11;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export function bayer(x: number, y: number): number {
  return BAYER4[(y & 3) * 4 + (x & 3)];
}

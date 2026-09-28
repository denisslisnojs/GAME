// Личный герб героя: поле, деление, фигура. Рисуется пиксель-артом на щите.

import { Pix, shade } from './pixel';

export type Division = 'plain' | 'pale' | 'fess' | 'quarterly' | 'chevron' | 'bend';
export type Charge = 'none' | 'lion' | 'eagle' | 'cross' | 'tower' | 'star' | 'boar' | 'crescent' | 'fleur' | 'axe' | 'horse';

export interface Arms {
  division: Division;
  field: string;
  field2: string;
  charge: Charge;
  chargeColor: string;
}

/** Геральдические цвета (финифти и металлы). */
export const TINCTURES: { name: string; c: string }[] = [
  { name: 'Золото', c: '#e8c04a' },
  { name: 'Серебро', c: '#eeeae0' },
  { name: 'Червлень', c: '#c23030' },
  { name: 'Лазурь', c: '#2f5fb3' },
  { name: 'Зелень', c: '#3a8a3a' },
  { name: 'Чернь', c: '#2a2522' },
  { name: 'Пурпур', c: '#7a3a8a' },
  { name: 'Киноварь', c: '#d8702a' },
];

export const DIVISIONS: { id: Division; name: string }[] = [
  { id: 'plain', name: 'Цельное' },
  { id: 'pale', name: 'Рассечённое' },
  { id: 'fess', name: 'Пересечённое' },
  { id: 'quarterly', name: 'Четверочастное' },
  { id: 'chevron', name: 'Стропило' },
  { id: 'bend', name: 'Перевязь' },
];

export const CHARGES: { id: Charge; name: string }[] = [
  { id: 'none', name: 'Без фигуры' },
  { id: 'lion', name: 'Лев' },
  { id: 'eagle', name: 'Орёл' },
  { id: 'cross', name: 'Крест' },
  { id: 'tower', name: 'Башня' },
  { id: 'star', name: 'Звезда' },
  { id: 'boar', name: 'Вепрь' },
  { id: 'crescent', name: 'Полумесяц' },
  { id: 'fleur', name: 'Лилия' },
  { id: 'axe', name: 'Секира' },
  { id: 'horse', name: 'Конь' },
];

const FIG: Record<Exclude<Charge, 'none'>, string[]> = {
  lion: ['....xx.....', '...xxxx..x.', '..xxxx..x..', '.xxxxxxxx..', 'x.xxxxxx...', '..x.x.xx...', '.xx.x..x...'],
  eagle: ['..x.....x..', '.xxx.x.xxx.', 'xxxxxxxxxxx', 'x.xxxxxxx.x', '...xxxxx...', '...xx.xx...', '..x.....x..'],
  cross: ['....xxx....', '....xxx....', 'xxxxxxxxxxx', 'xxxxxxxxxxx', '....xxx....', '....xxx....', '....xxx....'],
  tower: ['..x.x.x.x..', '..xxxxxxx..', '...xxxxx...', '...xx.xx...', '...xxxxx...', '...xx.xx...', '..xxxxxxx..'],
  star: ['.....x.....', '....xxx....', 'xxxxxxxxxxx', '.xxxxxxxxx.', '..xxxxxxx..', '.xxx...xxx.', '.x.......x.'],
  boar: ['...........', '.x.xxxxx...', 'xxxxxxxxxx.', 'xxxxxxxxxxx', '.xxxxxxxxx.', '..x.x..x.x.', '..x.x..x.x.'],
  crescent: ['...xxxx....', '..xx.......', '.xx.....x..', '.xx....xxx.', '.xx.....x..', '..xx.......', '...xxxx....'],
  fleur: ['.....x.....', '....xxx....', '.x..xxx..x.', 'xxx.xxx.xxx', '.xxxxxxxxx.', '....xxx....', '...xx.xx...'],
  axe: ['.....X.....', '..xxxX.....', '.xxxxX.....', 'xxxxxX.....', '.xxxxX.....', '..xxxX.....', '.....X.....'],
  horse: ['.......xx..', '......xxxx.', 'x.xxxxxxx..', '.xxxxxxx...', '.xxxxxxx...', '.x.x..x.x..', '.x.x..x.x..'],
};

export const DEFAULT_ARMS = (field: string, charge: string): Arms => ({ division: 'plain', field, field2: '#eeeae0', charge: 'lion', chargeColor: charge });

/** Щит с гербом 16×18. */
export function drawArms(a: Arms): HTMLCanvasElement {
  const P = new Pix(16, 18);
  for (let y = 0; y < 18; y++) {
    const hw = y < 11 ? 7 : Math.max(0, 7 - Math.round((y - 10) * 1.1));
    for (let dx = -hw; dx < hw; dx++) {
      const x = 8 + dx;
      let second = false;
      switch (a.division) {
        case 'pale':
          second = x >= 8;
          break;
        case 'fess':
          second = y >= 9;
          break;
        case 'quarterly':
          second = x >= 8 !== y >= 9;
          break;
        case 'chevron': {
          const d = Math.abs(x - 7.5);
          second = y > 5 + d && y < 10 + d;
          break;
        }
        case 'bend':
          second = Math.abs(x - y * 0.9 + 1) < 2.2;
          break;
      }
      const c = second ? a.field2 : a.field;
      P.p(x, y, dx < -hw + 1 ? shade(c, 0.2) : c);
    }
  }
  if (a.charge !== 'none') P.pattern(2, 4, FIG[a.charge], { x: a.chargeColor, X: shade(a.chargeColor, -0.25) });
  P.outline('#1a1410');
  return P.canvas;
}

const cache = new Map<string, string>();
export function armsURL(a: Arms): string {
  const k = JSON.stringify(a);
  let v = cache.get(k);
  if (!v) {
    v = drawArms(a).toDataURL();
    cache.set(k, v);
  }
  return v;
}

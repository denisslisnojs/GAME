// Личный герб героя: поле, деление, фигура на щите.

import { smoothGlyph, surface, tone } from './brush';
import { shieldFinish, shieldPath } from './mapart';
import { tr } from '../i18n';

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
  { name: tr('Золото'), c: '#e8c04a' },
  { name: tr('Серебро'), c: '#eeeae0' },
  { name: tr('Червлень'), c: '#c23030' },
  { name: tr('Лазурь'), c: '#2f5fb3' },
  { name: tr('Зелень'), c: '#3a8a3a' },
  { name: tr('Чернь'), c: '#2a2522' },
  { name: tr('Пурпур'), c: '#7a3a8a' },
  { name: tr('Киноварь'), c: '#d8702a' },
];

export const DIVISIONS: { id: Division; name: string }[] = [
  { id: 'plain', name: tr('Цельное') },
  { id: 'pale', name: tr('Рассечённое') },
  { id: 'fess', name: tr('Пересечённое') },
  { id: 'quarterly', name: tr('Четверочастное') },
  { id: 'chevron', name: tr('Стропило') },
  { id: 'bend', name: tr('Перевязь') },
];

export const CHARGES: { id: Charge; name: string }[] = [
  { id: 'none', name: tr('Без фигуры') },
  { id: 'lion', name: tr('Лев') },
  { id: 'eagle', name: tr('Орёл') },
  { id: 'cross', name: tr('Крест') },
  { id: 'tower', name: tr('Башня') },
  { id: 'star', name: tr('Звезда') },
  { id: 'boar', name: tr('Вепрь') },
  { id: 'crescent', name: tr('Полумесяц') },
  { id: 'fleur', name: tr('Лилия') },
  { id: 'axe', name: tr('Секира') },
  { id: 'horse', name: tr('Конь') },
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

/** Щит с гербом 16×18 (рисуется в 4 раза чётче): поле, деление, фигура, глянец. */
export function drawArms(a: Arms): HTMLCanvasElement {
  const Q = 4;
  const { c, g } = surface(16, 18, Q);
  shieldPath(g);
  g.fillStyle = a.field;
  g.fill();
  g.save();
  shieldPath(g);
  g.clip();
  g.fillStyle = a.field2;
  g.beginPath();
  switch (a.division) {
    case 'pale':
      g.rect(8, 0, 8, 18);
      break;
    case 'fess':
      g.rect(0, 9, 16, 9);
      break;
    case 'quarterly':
      g.rect(8, 0, 8, 9);
      g.rect(0, 9, 8, 9);
      break;
    case 'chevron':
      g.moveTo(0, 12);
      g.lineTo(8, 5);
      g.lineTo(16, 12);
      g.lineTo(16, 16.5);
      g.lineTo(8, 9.5);
      g.lineTo(0, 16.5);
      break;
    case 'bend':
      g.moveTo(0, 0.6);
      g.lineTo(3.2, 0.6);
      g.lineTo(16, 15);
      g.lineTo(16, 18);
      g.lineTo(13, 18);
      g.lineTo(0, 3.6);
      break;
  }
  if (a.division !== 'plain') g.fill();
  g.restore();
  if (a.charge !== 'none') g.drawImage(smoothGlyph(FIG[a.charge], { x: a.chargeColor, X: tone(a.chargeColor, -0.8) }, Q * 2), 2.5, 4, 11, 7);
  shieldFinish(g);
  return c;
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

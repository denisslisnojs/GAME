// Боевые спрайты воинов (вид сбоку, лицом вправо). Детальные фигуры на «скелете»:
// суставы задаются позой, руки ставятся обратной кинематикой, тело собирается из форм
// и растеризуется со светотенью (см. figure.ts).
// Кадры: 0 — стойка, 1..4 — шаг, 5..7 — атака, 8 — павший.

import type { BodyKind } from '../data/items';
import type { Helmet, Weapon } from '../data/troops';
import { lumOf, mix } from './color';
import { cap, ell, poly, rasterize, rotateShapes, type Mat, type Pat, type Pt, type Shape } from './figure';

/** Размер кадра в пикселях (рисуется в 1:1, без растяжения). */
export const FRAME_W = 112;
export const FRAME_H = 104;
/** Где в кадре стоят ступни. */
export const FEET_Y = 100;
export const FRAMES = { idle: 0, walk: [1, 2, 3, 4], attack: [5, 6, 7], dead: 8 } as const;
/** Пикселей на дизайн-единицу (рост пешего воина — 64 единицы). */
const K = 1.08;
const OX = 50;

export type Culture = 'aurelia' | 'nordmark' | 'horde' | 'sultanate' | 'outlaw';

export interface UnitLook {
  culture: Culture;
  tier: number;
  helmet: Helmet;
  cloth: string;
  cloth2: string;
  armor: string;
  weapon: Weapon;
  shield: boolean;
  mounted: boolean;
  /** Попона на коне и тяжёлые латы. */
  heavy: boolean;
  hero?: boolean;
  seed: number;
  /** Явный тип доспеха (для героя); без него — по уровню воина. */
  body?: BodyKind;
  tabard?: boolean;
  /** Цвет металла шлема, перчаток, поножей (если есть). */
  helmetMetal?: string;
  gauntlets?: string;
  greaves?: string;
  horseColor?: string;
  /** Верблюд вместо коня. */
  camel?: boolean;
}

const SKIN: Record<Culture, string> = { aurelia: '#e6bc96', nordmark: '#f0c8a8', horde: '#d8a878', sultanate: '#c89068', outlaw: '#dcb08a' };
const HAIR: Record<Culture, string> = { aurelia: '#5a3a22', nordmark: '#c89a52', horde: '#1e1814', sultanate: '#221a14', outlaw: '#4a3220' };
const PANTS: Record<Culture, string> = { aurelia: '#4e4e5c', nordmark: '#5e4e3c', horde: '#6a4a2c', sultanate: '#e2d8c0', outlaw: '#5e4e3c' };
const HORSES = ['#7a4a2a', '#8f5a30', '#2e2622', '#9a958c', '#5e3a22', '#c8c0b0'];
const WOOD = '#8a5e36';
const LEATHER = '#6b4a2e';
const BOOTS = '#3a2a1e';
const DARK = '#1a1410';
const STEEL = '#c4ccd4';

// ───────────────────────── геометрия ─────────────────────────

const rad = (d: number) => (d * Math.PI) / 180;
/** Вектор под углом от вертикали вниз (+ — вперёд). */
const down = (a: number, len: number): Pt => [Math.sin(rad(a)) * len, Math.cos(rad(a)) * len];
/** Направление по экранному углу (0 — вправо, −90 — вверх). */
const dir = (a: number): Pt => [Math.cos(rad(a)), Math.sin(rad(a))];
const add = (p: Pt, q: Pt, k = 1): Pt => [p[0] + q[0] * k, p[1] + q[1] * k];

/** Двухзвенная обратная кинематика: плечо S, цель T → локоть и кисть. */
function ik(S: Pt, T: Pt, a: number, b: number): [Pt, Pt] {
  let dx = T[0] - S[0];
  let dy = T[1] - S[1];
  let d = Math.hypot(dx, dy);
  const maxd = a + b - 0.05;
  if (d > maxd) {
    T = [S[0] + (dx / d) * maxd, S[1] + (dy / d) * maxd];
    d = maxd;
    dx = T[0] - S[0];
    dy = T[1] - S[1];
  }
  d = Math.max(0.5, d);
  const ang = Math.atan2(dy, dx);
  const off = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const e1: Pt = [S[0] + Math.cos(ang + off) * a, S[1] + Math.sin(ang + off) * a];
  const e2: Pt = [S[0] + Math.cos(ang - off) * a, S[1] + Math.sin(ang - off) * a];
  // Руки над головой — локоть вперёд, иначе — вниз
  const E = T[1] < S[1] - 4 ? (e1[0] > e2[0] ? e1 : e2) : e1[1] > e2[1] ? e1 : e2;
  return [E, T];
}

function transform(shapes: Shape[], ang: number, dx: number, dy: number): Shape[] {
  const rot = ang ? rotateShapes(shapes, 0, 0, ang) : shapes;
  return rot.map((s) => ({
    ...s,
    poly: s.poly?.map(([x, y]) => [x + dx, y + dy] as Pt),
    ell: s.ell ? [s.ell[0] + dx, s.ell[1] + dy, s.ell[2], s.ell[3]] : undefined,
    cap: s.cap ? [s.cap[0] + dx, s.cap[1] + dy, s.cap[2] + dx, s.cap[3] + dy, s.cap[4], s.cap[5]] : undefined,
  }));
}

// ───────────────────────── внешний вид ─────────────────────────

interface Kit {
  L: UnitLook;
  skin: string;
  hair: string;
  beard: string | null;
  kind: BodyKind;
  metal: string;
  helmMetal: string;
  pants: string;
  pantsMat: Mat;
  boots: string;
  bootsMat: Mat;
  sleeve: string;
  sleeveMat: Mat;
  sleevePat: Pat;
  forearm: string;
  forearmMat: Mat;
  hand: string;
  handMat: Mat;
  eastern: boolean;
  tabard: boolean;
}

/** Светлый металл чуть притемняем: с бликами он иначе выглядит белым. */
function toneMetal(c: string): string {
  const n = parseInt(c.slice(1), 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.58 ? mix(c, '#4a5460', Math.min(0.45, (l - 0.58) * 1.6)) : c;
}

function kitOf(L: UnitLook): Kit {
  const eastern = L.culture === 'horde' || L.culture === 'sultanate';
  const kind: BodyKind = L.body ?? (L.tier <= 1 ? 'cloth' : L.tier >= 4 || L.heavy ? (eastern ? 'lamellar' : 'plate') : 'mail');
  const metalKind = kind === 'mail' || kind === 'scale' || kind === 'lamellar' || kind === 'plate';
  const plate = kind === 'plate';
  const beardy = L.culture === 'nordmark' || L.culture === 'outlaw' || (L.tier >= 3 && L.culture !== 'aurelia') || L.seed % 3 === 0;
  const pants = L.greaves ?? (!L.body && L.tier >= 4 && L.culture !== 'sultanate' && !eastern ? L.armor : PANTS[L.culture]);
  const legMetal = !!L.greaves ? L.greaves.startsWith('#5a3a') === false : !L.body && L.tier >= 4 && !eastern;
  const sleeve = plate || kind === 'mail' || kind === 'scale' || kind === 'lamellar' ? L.armor : kind === 'brigandine' ? mix(L.cloth, '#1a1410', 0.2) : kind === 'leather' ? L.armor : L.body ? L.armor : L.tier <= 1 ? L.armor : L.cloth;
  if (kind === 'bare') {
    // Голый торс, звериная шкура на плечах (цвет шкуры — L.armor)
    const skin = SKIN[L.culture];
    return {
      L,
      skin,
      hair: HAIR[L.culture],
      beard: L.culture === 'nordmark' ? '#b07a3a' : HAIR[L.culture],
      kind,
      metal: toneMetal('#a8b0b8'),
      helmMetal: toneMetal('#a8b0b8'),
      pants: PANTS[L.culture],
      pantsMat: 'cloth',
      boots: '#4a3a2a',
      bootsMat: 'leather',
      sleeve: skin,
      sleeveMat: 'skin',
      sleevePat: 'none',
      forearm: skin,
      forearmMat: 'skin',
      hand: '#5a3e24',
      handMat: 'leather',
      eastern,
      tabard: false,
    };
  }
  return {
    L,
    skin: SKIN[L.culture],
    hair: HAIR[L.culture],
    beard: beardy ? (L.culture === 'nordmark' ? '#b07a3a' : HAIR[L.culture]) : null,
    kind,
    metal: toneMetal(L.armor),
    helmMetal: toneMetal(L.helmetMetal ?? (metalKind ? L.armor : '#a8b0b8')),
    pants,
    pantsMat: legMetal ? 'metal' : 'cloth',
    boots: L.greaves ? mix(L.greaves, '#000000', 0.1) : legMetal ? mix(L.armor, '#000000', 0.12) : BOOTS,
    bootsMat: legMetal || L.greaves ? 'metal' : 'leather',
    sleeve,
    sleeveMat: plate || kind === 'mail' || kind === 'scale' || kind === 'lamellar' ? 'metal' : kind === 'leather' ? 'leather' : 'cloth',
    sleevePat: kind === 'mail' ? 'mail' : kind === 'scale' ? 'scale' : kind === 'lamellar' ? 'lamellar' : 'none',
    forearm: L.tier <= 1 && !L.body ? SKIN[L.culture] : plate ? L.armor : sleeve,
    forearmMat: L.tier <= 1 && !L.body ? 'skin' : plate ? 'metal' : kind === 'leather' ? 'leather' : kind === 'mail' || kind === 'scale' || kind === 'lamellar' ? 'metal' : 'cloth',
    hand: L.gauntlets ?? (plate ? L.armor : L.tier >= 2 ? '#5a3e24' : SKIN[L.culture]),
    handMat: L.gauntlets || plate ? 'metal' : L.tier >= 2 ? 'leather' : 'skin',
    eastern,
    tabard: (L.tabard ?? L.tier >= 2) && L.tier >= 2,
  };
}

// ───────────────────────── голова и шлемы ─────────────────────────

/** Голова в локальных координатах торса: центр (hx, hy). */
function head(k: Kit, hx: number, hy: number): Shape[] {
  const L = k.L;
  const out: Shape[] = [];
  const face = (): Shape[] => {
    const f: Shape[] = [
      ell(k.skin, 'skin', hx, hy, 4, 4.8),
      poly(k.skin, 'skin', [[hx + 3.4, hy - 1.2], [hx + 5.5, hy + 1.8], [hx + 3.6, hy + 2.5]]),
      ell(mix(k.skin, '#000000', 0.08), 'skin', hx - 2.1, hy + 0.5, 1, 1.4),
    ];
    if (k.beard) f.push(poly(k.beard, 'hair', [[hx - 2.8, hy + 1.2], [hx - 1, hy + 2.6], [hx + 3.8, hy + 2.8], [hx + 3.6, hy + 5], [hx + 1.4, hy + 6.4], [hx - 1.6, hy + 5.4]]));
    f.push(
      cap(DARK, 'dark', [hx + 2.2, hy - 0.8], [hx + 2.9, hy - 0.85], 0.95),
      cap(mix(k.hair, '#000000', 0.2), 'hair', [hx + 1.6, hy - 2], [hx + 3.5, hy - 2.2], 0.75),
      cap('#6a3a2a', 'dark', [hx + 2.3, hy + 3.6], [hx + 3.4, hy + 3.6], 0.5),
    );
    return f;
  };
  const m = k.helmMetal;
  switch (L.helmet) {
    case 'none':
      out.push(...face(), poly(k.hair, 'hair', [[hx - 4.2, hy + 1.5], [hx - 3.8, hy - 3.2], [hx - 1, hy - 5.2], [hx + 2.8, hy - 4.8], [hx + 4.2, hy - 2.6], [hx + 1, hy - 3], [hx - 1.6, hy - 1.2], [hx - 2.4, hy + 1.8]]));
      break;
    case 'hood': {
      out.push(poly(L.cloth, 'cloth', [[hx - 5, hy + 7], [hx - 5.6, hy - 1], [hx - 3.4, hy - 5.8], [hx + 0.8, hy - 6.6], [hx + 4.4, hy - 4], [hx + 4.8, hy + 0.2], [hx + 3, hy + 1], [hx + 1.6, hy + 7]]));
      out.push(...face().map((s) => s), poly(L.cloth, 'cloth', [[hx - 5.2, hy - 1.5], [hx - 3.2, hy - 5.8], [hx + 0.6, hy - 6.6], [hx + 4.4, hy - 4], [hx + 3.6, hy - 2.6], [hx + 0.4, hy - 3.8], [hx - 1.8, hy - 2.4], [hx - 3, hy + 3], [hx - 5, hy + 3]]));
      break;
    }
    case 'cap':
    case 'fur': {
      out.push(...face());
      const fur = L.helmet === 'fur';
      const c = fur ? '#6a4a30' : L.cloth;
      out.push(poly(c, fur ? 'fur' : 'cloth', [[hx - 4.4, hy - 1.5], [hx - 3.6, hy - 5.4], [hx, hy - 7], [hx + 3.8, hy - 5.2], [hx + 4.6, hy - 1.5]]));
      out.push(poly(fur ? '#8a6a48' : mix(c, '#000000', 0.2), fur ? 'fur' : 'cloth', [[hx - 4.8, hy - 0.5], [hx + 4.8, hy - 0.5], [hx + 4.8, hy - 2.4], [hx - 4.8, hy - 2.4]]));
      break;
    }
    case 'kettle':
      out.push(...face());
      out.push(poly(m, 'metal', [[hx - 4.6, hy - 1.8], [hx + 4.6, hy - 1.8], [hx + 3.4, hy - 6], [hx, hy - 7.2], [hx - 3.4, hy - 6]]));
      out.push(ell(m, 'metal', hx, hy - 1.7, 7.4, 1.4));
      break;
    case 'nasal':
      out.push(poly(mix(m, '#000000', 0.1), 'metal', [[hx - 4.8, hy - 1], [hx - 5.2, hy + 7], [hx - 1, hy + 7]], 'mail'));
      out.push(...face());
      out.push(poly(m, 'metal', [[hx - 4.6, hy - 1.2], [hx + 4.6, hy - 1.2], [hx + 2.4, hy - 6], [hx - 0.2, hy - 8.6], [hx - 3, hy - 6]]));
      out.push(cap(m, 'metal', [hx + 4, hy - 1.4], [hx + 4.4, hy + 2.2], 1.1));
      break;
    case 'bascinet':
      out.push(poly(mix(m, '#000000', 0.08), 'metal', [[hx - 5, hy - 1], [hx - 6, hy + 8], [hx + 2, hy + 8.5], [hx + 4, hy + 4.8], [hx + 1.4, hy + 5.2], [hx - 2.6, hy + 2]], 'mail'));
      out.push(...face());
      out.push(poly(m, 'metal', [[hx - 4.8, hy + 1.2], [hx - 4.8, hy - 3], [hx - 2.4, hy - 7.6], [hx - 0.6, hy - 9.4], [hx + 3, hy - 5.4], [hx + 4.4, hy - 1.6], [hx + 1.2, hy - 1.8], [hx - 1.6, hy + 1.2]]));
      break;
    case 'great':
      out.push(poly(m, 'metal', [[hx - 4.8, hy - 6.2], [hx + 5, hy - 6.2], [hx + 5.4, hy + 6], [hx - 4.8, hy + 5.4]]));
      out.push(cap(DARK, 'dark', [hx + 1, hy - 1.2], [hx + 5.3, hy - 1.2], 0.9));
      out.push(cap(L.hero ? '#e2b43c' : mix(m, '#000000', 0.3), L.hero ? 'gold' : 'metal', [hx + 3.4, hy - 6], [hx + 3.4, hy + 5.8], 0.8));
      out.push(ell(DARK, 'dark', hx + 4.2, hy + 2.8, 0.35, 0.35), ell(DARK, 'dark', hx + 4.2, hy + 4, 0.35, 0.35));
      if (L.hero) out.push(cap(L.cloth2, 'cloth', [hx - 1, hy - 6.2], [hx - 4, hy - 10], 2.4, 1.2));
      break;
    case 'turban':
      out.push(...face());
      out.push(ell('#ece6d6', 'cloth', hx - 0.4, hy - 3.2, 5.2, 3.4, 'quilt'));
      out.push(cap(L.cloth2, 'cloth', [hx - 5.2, hy - 2], [hx + 4.8, hy - 3], 1));
      out.push(cap(m, 'metal', [hx - 0.4, hy - 6.4], [hx - 0.2, hy - 8.8], 1.2, 0.5));
      break;
    case 'spired':
      out.push(poly(L.tier >= 3 ? m : '#6b4a2e', L.tier >= 3 ? 'metal' : 'leather', [[hx - 5.2, hy - 2], [hx - 6, hy + 6], [hx - 1.5, hy + 6.4], [hx - 2, hy]], 'lamellar'));
      out.push(...face());
      out.push(poly(m, 'metal', [[hx - 4.8, hy - 1.4], [hx + 4.6, hy - 1.4], [hx + 3.6, hy - 5.2], [hx, hy - 7], [hx - 3.6, hy - 5.2]]));
      out.push(cap(m, 'metal', [hx - 0.1, hy - 6.6], [hx - 0.1, hy - 11], 1.4, 0.5));
      out.push(cap(L.cloth2 === '#2a2320' ? '#a83a2a' : L.cloth2, 'hair', [hx - 0.2, hy - 10.4], [hx - 3.4, hy - 8.4], 1.4, 0.6));
      out.push(cap(mix(m, '#000000', 0.25), 'metal', [hx - 4.8, hy - 1.6], [hx + 4.6, hy - 1.6], 0.8));
      break;
    case 'sallet':
      out.push(...face());
      out.push(poly(m, 'metal', [[hx - 8, hy + 2.2], [hx - 5.2, hy - 3.6], [hx - 1.4, hy - 6.4], [hx + 3, hy - 5.6], [hx + 4.8, hy - 1.8], [hx + 4.8, hy - 0.2], [hx - 3, hy - 0.8], [hx - 5, hy + 1.4]]));
      out.push(cap(DARK, 'dark', [hx + 1.4, hy - 1.2], [hx + 4.8, hy - 1], 0.7));
      out.push(poly(m, 'metal', [[hx - 1, hy + 1.6], [hx + 4.6, hy + 1.2], [hx + 4.4, hy + 5.4], [hx + 0.8, hy + 7], [hx - 2.4, hy + 6]]));
      break;
    case 'armet':
      out.push(ell(m, 'metal', hx - 0.2, hy - 0.4, 5, 5.8));
      out.push(poly(mix(m, '#ffffff', 0.12), 'metal', [[hx + 0.6, hy - 3], [hx + 4.6, hy - 1.8], [hx + 6.6, hy + 1], [hx + 4.4, hy + 4.4], [hx + 0.8, hy + 5]]));
      out.push(cap(DARK, 'dark', [hx + 1.4, hy - 0.6], [hx + 5.2, hy - 0.2], 0.7));
      out.push(ell(m, 'metal', hx - 3.8, hy + 4.4, 1.4, 1.4));
      if (L.hero) out.push(cap(L.cloth2, 'cloth', [hx - 1.5, hy - 5.8], [hx - 5, hy - 9.4], 2.2, 1));
      break;
  }
  return out;
}

// ───────────────────────── оружие ─────────────────────────

/** Оружие от кисти H под экранным углом a. */
function weapon(k: Kit, H: Pt, a: number, extra: { pull?: number; arrow?: boolean; loaded?: boolean } = {}): Shape[] {
  const L = k.L;
  const d = dir(a);
  const n: Pt = [-d[1], d[0]]; // перпендикуляр
  const at = (t: number, s = 0): Pt => [H[0] + d[0] * t + n[0] * s, H[1] + d[1] * t + n[1] * s];
  const out: Shape[] = [];
  switch (L.weapon) {
    case 'sword':
    case 'sabre': {
      out.push(cap(LEATHER, 'leather', at(-2.6), at(1), 1.5));
      out.push(ell('#c8a040', 'gold', ...at(-3.2), 1.2, 1.2));
      out.push(cap('#c8a040', 'gold', at(1.3, -2.8), at(1.3, 2.8), 1.1));
      if (L.weapon === 'sword') out.push(cap(STEEL, 'metal', at(2), at(17), 1.9, 0.9));
      else {
        const pts = [0, 1, 2, 3].map((i) => at(2 + i * 4.8, (i * i) * 0.45));
        for (let i = 0; i < 3; i++) out.push(cap(STEEL, 'metal', pts[i], pts[i + 1], 2 - i * 0.3, 1.7 - i * 0.35));
      }
      break;
    }
    case 'axe':
      out.push(cap(WOOD, 'wood', at(-4), at(16), 1.5));
      out.push(poly('#9aa2aa', 'metal', [at(11.5, 0), at(11, -4.5), at(13, -6.6), at(17, -5.6), at(15.6, 0.2)]));
      break;
    case 'mace':
      out.push(cap(WOOD, 'wood', at(-3), at(11), 1.5));
      out.push(ell('#9aa2aa', 'metal', ...at(12.5), 2.6, 2.6));
      for (const s of [-1, 1]) out.push(cap('#b8c0c8', 'metal', at(11, s * 2.2), at(14, s * 2.2), 1));
      break;
    case 'spear':
    case 'pitchfork':
      out.push(cap(WOOD, 'wood', at(-14), at(26), 1.3));
      if (L.weapon === 'spear') out.push(poly(STEEL, 'metal', [at(25.5, 0), at(27.5, -1.5), at(32, 0), at(27.5, 1.5)]));
      else {
        out.push(cap('#8f969e', 'metal', at(25, -2.5), at(25, 2.5), 0.9));
        for (const s of [-2.2, 0, 2.2]) out.push(cap('#9aa0a8', 'metal', at(25, s), at(30, s), 0.8));
      }
      break;
    case 'halberd':
      out.push(cap(WOOD, 'wood', at(-14), at(28), 1.4));
      out.push(cap(STEEL, 'metal', at(27.5), at(32), 1.2, 0.4));
      out.push(poly(STEEL, 'metal', [at(20.5, 0.4), at(19.5, -5), at(22, -6.5), at(25, -5), at(25.5, 0.4)]));
      out.push(poly('#9aa2aa', 'metal', [at(22, 0.4), at(23, 3.6), at(24.5, 0.4)]));
      break;
    case 'glaive':
      out.push(cap(WOOD, 'wood', at(-14), at(22), 1.4));
      out.push(poly(STEEL, 'metal', [at(21, -1), at(24, -2.6), at(31, -1.6), at(34, 0.4), at(21, 1)]));
      break;
    case 'lance':
      out.push(cap(L.cloth, 'cloth', at(-9), at(33), 2.4, 1.3));
      out.push(cap(L.cloth2, 'cloth', at(6), at(12), 2.2, 2), cap(L.cloth2, 'cloth', at(20), at(26), 1.8, 1.6));
      out.push(cap('#9aa2aa', 'metal', at(1.2), at(4.5), 5, 1.6));
      out.push(cap(STEEL, 'metal', at(33), at(37), 1.3, 0.3));
      break;
    case 'bow': {
      // Лук вертикально в кисти H, тетива натянута к кисти другой руки
      const composite = L.culture === 'horde' || L.culture === 'sultanate';
      const half = composite ? 10 : 12;
      const pull = extra.pull ?? 0;
      const pts: Pt[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = (i / 8) * 2 - 1;
        let bend = (1 - t * t) * 3.2;
        if (composite && Math.abs(t) > 0.72) bend -= (Math.abs(t) - 0.72) * 8;
        pts.push([H[0] + bend, H[1] + t * half]);
      }
      for (let i = 0; i < 8; i++) out.push(cap(composite ? '#5a3a22' : WOOD, 'wood', pts[i], pts[i + 1], 1.5, 1.5));
      const sx = H[0] - pull;
      out.push(cap('#e8e0c8', 'string', pts[0], [sx, H[1]], 0.45), cap('#e8e0c8', 'string', [sx, H[1]], pts[8], 0.45));
      if (extra.arrow) {
        out.push(cap('#b89a6a', 'wood', [sx, H[1]], [H[0] + 8, H[1]], 0.7));
        out.push(poly(STEEL, 'metal', [[H[0] + 8, H[1] - 0.9], [H[0] + 10.5, H[1]], [H[0] + 8, H[1] + 0.9]]));
        out.push(poly('#e8e2d0', 'cloth', [[sx, H[1] - 1.4], [sx + 2.5, H[1]], [sx, H[1] + 1.4]]));
      }
      break;
    }
    case 'daneaxe':
      out.push(cap(WOOD, 'wood', at(-14), at(27), 1.4));
      out.push(poly('#aab2ba', 'metal', [at(20, 0.4), at(19, -3.5), at(20.5, -8.4), at(26.5, -9.2), at(27.5, -3.5), at(25.5, 0.4)]));
      out.push(cap(mix('#aab2ba', '#ffffff', 0.35), 'metal', at(20.8, -8.2), at(26.3, -9), 0.6));
      break;
    case 'handgonne':
      // Древко-ложе и железный ствол с запальным отверстием; фитиль тлеет у кисти
      out.push(cap(WOOD, 'wood', at(-13), at(4), 1.9, 1.6));
      out.push(cap('#50555c', 'metal', at(2), at(16), 2.8, 2.3));
      out.push(cap('#6a7078', 'metal', at(15.2), at(16.4), 3.2, 3.2));
      out.push(cap('#6a7078', 'metal', at(5.5), at(6.5), 3.1, 3.1));
      out.push(cap('#8a6a45', 'string', at(-1, 2), at(1, 5), 0.5), ell('#ff7a2a', 'gold', ...at(1.2, 5.4), 0.7, 0.7));
      break;
    case 'firepot': {
      // Глиняный горшок с горящей тряпкой в горлышке
      const c = at(3.5);
      out.push(ell('#a0603a', 'leather', c[0], c[1], 3.4, 3.1), ell('#c07a4a', 'leather', c[0] - 0.8, c[1] - 0.9, 1.4, 1.1));
      out.push(cap('#7a4a2a', 'leather', at(6.2), at(7.4), 1.8, 1.6));
      out.push(cap('#e8c04a', 'gold', at(7.6), at(9.6, -1), 1.3, 0.4), cap('#ff6a1a', 'gold', at(7.4, 0.4), at(10.6, 0.6), 0.9, 0.3));
      break;
    }
    case 'crossbow':
      out.push(cap(WOOD, 'wood', at(-6), at(7), 2.2, 1.8));
      out.push(cap('#5a5f66', 'metal', at(6.5, -6), at(7.5, 0), 1.1), cap('#5a5f66', 'metal', at(7.5, 0), at(6.5, 6), 1.1));
      out.push(cap('#e8e0c8', 'string', at(6.5, -6), at(extra.loaded ? 1 : 5.5, 0), 0.4), cap('#e8e0c8', 'string', at(extra.loaded ? 1 : 5.5, 0), at(6.5, 6), 0.4));
      if (extra.loaded) out.push(cap('#b89a6a', 'wood', at(1, -0.8), at(9, -0.8), 0.8));
      break;
  }
  return out;
}

// ───────────────────────── щиты ─────────────────────────

function shield(k: Kit, C: Pt): Shape[] {
  const L = k.L;
  const [x, y] = C;
  const c = L.cloth;
  const e = L.cloth2;
  switch (L.culture) {
    case 'aurelia':
      return [
        poly('#5a3e24', 'wood', [[x - 4.6, y - 7.2], [x + 4.8, y - 6.6], [x + 5, y + 1.8], [x + 0.2, y + 9.4], [x - 4.4, y + 2]]),
        poly(c, 'cloth', [[x - 4, y - 6.5], [x + 4.2, y - 6], [x + 4.4, y + 1.6], [x + 0.2, y + 8.2], [x - 3.8, y + 1.8]]),
        poly(e, 'gold', [[x - 0.6, y - 6.3], [x + 1, y - 6.2], [x + 1, y + 7], [x + 0.2, y + 8], [x - 0.6, y + 7]]),
        poly(e, 'gold', [[x - 3.9, y - 2], [x + 4.3, y - 1.6], [x + 4.3, y], [x - 3.9, y - 0.4]]),
      ];
    case 'nordmark':
      return [
        ell('#6a4426', 'wood', x, y, 7.8, 8.6, 'plank'),
        poly(c, 'cloth', [[x, y], [x, y - 8], [x + 5.6, y - 5.6], [x + 7.6, y]]),
        poly(c, 'cloth', [[x, y], [x, y + 8], [x - 5.6, y + 5.6], [x - 7.6, y]]),
        ell('#b0b6be', 'metal', x + 0.4, y - 0.2, 2, 2.2),
      ];
    case 'horde':
      return [ell('#7a5230', 'leather', x, y, 5.2, 5.8), ell(e === '#2a2320' ? '#a83a2a' : e, 'cloth', x, y, 3.4, 3.8), ell('#b0b6be', 'metal', x + 0.3, y - 0.2, 1.4, 1.5)];
    case 'sultanate':
      return [ell('#c8a050', 'gold', x, y, 6.6, 7.4), ell(c, 'cloth', x, y, 5.6, 6.3), ell(e, 'cloth', x, y, 3.6, 4.1), ell('#c8a050', 'gold', x + 0.3, y - 0.2, 1.6, 1.8)];
    default:
      return [poly('#7a5a3a', 'wood', [[x - 4.4, y - 7], [x + 4.4, y - 7], [x + 4.4, y + 7], [x - 4.4, y + 7]], 'plank'), cap('#4a3220', 'leather', [x - 4.4, y - 3], [x + 4.4, y - 3], 1.2), cap('#4a3220', 'leather', [x - 4.4, y + 3], [x + 4.4, y + 3], 1.2)];
  }
}

// ───────────────────────── торс ─────────────────────────

/** Торс в локальных координатах: таз (0, 0), плечи на y ≈ −18. */
function torso(k: Kit): Shape[] {
  const L = k.L;
  const out: Shape[] = [];
  const body: Pt[] = [[-5, -19.5], [5.6, -19], [7, -10], [6.2, -1], [-5.2, -1], [-6.2, -10]];
  const skirt: Pt[] = [[-5.8, -3], [6.4, -3], [7.6, 7], [-6.8, 7]];
  const pat: Pat = k.kind === 'mail' ? 'mail' : k.kind === 'scale' ? 'scale' : k.kind === 'lamellar' ? 'lamellar' : k.kind === 'brigandine' ? 'rivets' : k.kind === 'cloth' && L.body ? 'quilt' : 'none';
  switch (k.kind) {
    case 'bare': {
      // Мускулистый голый торс, шкура зверя через плечо и меховая юбка
      out.push(poly(k.skin, 'skin', [...body.slice(0, 3), [6.6, 2], [-5.6, 2], body[5]]));
      out.push(cap(mix(k.skin, '#000000', 0.16), 'skin', [0.2, -15.5], [4.8, -13.6], 0.7), cap(mix(k.skin, '#000000', 0.12), 'skin', [1.5, -9.5], [5.4, -9], 0.6));
      out.push(poly(L.armor, 'fur', [[-6.4, -20.4], [2.6, -21], [4.2, -17.4], [-1, -13], [-6.8, -8]]));
      out.push(poly(mix(L.armor, '#ffffff', 0.12), 'fur', [[-5.6, 1], [6.8, 1], [7.8, 8], [2, 9.6], [-6.6, 8.4]]));
      break;
    }
    case 'cloth':
      out.push(poly(L.armor, 'cloth', [...body.slice(0, 3), [7.2, 5.5], [-6.4, 5.5], body[5]], L.body ? 'quilt' : 'none'));
      break;
    case 'leather':
      out.push(poly(mix(L.cloth, '#000000', 0.1), 'cloth', skirt));
      out.push(poly(L.armor, 'leather', [...body.slice(0, 3), [6.8, 2], [-5.8, 2], body[5]], 'quilt'));
      break;
    case 'brigandine':
      out.push(poly('#8a9098', 'metal', skirt, 'mail'));
      out.push(poly(mix(L.cloth, '#000000', 0.18), 'cloth', body, 'rivets'));
      break;
    case 'plate':
      out.push(poly(k.metal, 'metal', skirt, 'mail'));
      out.push(poly(k.metal, 'metal', body));
      for (let i = 0; i < 3; i++) out.push(poly(k.metal, 'metal', [[-5.4 - i * 0.3, -2 + i * 2.6], [6.4 + i * 0.3, -2 + i * 2.6], [6.8 + i * 0.3, 0.8 + i * 2.6], [-5.8 - i * 0.3, 0.8 + i * 2.6]]));
      out.push(cap(mix(k.metal, '#ffffff', 0.5), 'metal', [4.6, -17], [5.8, -6], 0.9));
      break;
    default:
      // кольчуга, чешуя, ламеллярь — рубаха до середины бедра
      out.push(poly(k.metal, 'metal', [...body.slice(0, 3), [7.6, 7], [-6.8, 7], body[5]], pat));
  }
  // Табард (запад) или полы кафтана (восток)
  if (k.tabard) {
    if (k.eastern) {
      out.push(poly(L.cloth, 'cloth', [[-5.8, -2], [6.6, -2], [8.2, 9], [0.6, 9.5], [-7.2, 9]]));
      out.push(cap(L.cloth2 === '#2a2320' ? '#c8a050' : L.cloth2, 'cloth', [0.4, -1.5], [0.8, 9.2], 0.9));
    } else if (!(k.kind === 'plate' && L.tier >= 4 && !L.hero && L.weapon === 'halberd')) {
      out.push(poly(L.cloth, 'cloth', [[-4.2, -18.6], [5, -18.2], [6, -8], [6.8, 8], [-5.6, 8], [-5.2, -8]]));
      out.push(poly(L.cloth2, 'gold', [[-0.6, -18.4], [1.6, -18.3], [1.9, 7.8], [-0.6, 7.8]]));
      out.push(poly(L.cloth2, 'gold', [[-4.8, -13], [5.6, -12.6], [5.8, -10.8], [-4.9, -11.2]]));
      if (L.hero) out.push(cap('#e2b43c', 'gold', [-5.6, 7.8], [6.8, 7.8], 1.1));
    }
  } else if (k.kind === 'cloth' && !L.body) {
    out.push(cap('#7a6a4a', 'leather', [-6, -3], [6.6, -3], 1)); // пояс-верёвка
  }
  // Ремень с пряжкой
  out.push(poly(k.eastern && k.tabard ? L.cloth2 === '#2a2320' ? '#6a4a2a' : L.cloth2 : '#3a2618', 'leather', [[-5.6, -4.2], [6.6, -4.2], [6.7, -2.3], [-5.7, -2.3]]));
  out.push(ell('#c8a050', 'gold', 4.6, -3.2, 1, 0.9));
  // Наплечник у лат и бригантины
  if (k.kind === 'plate' || k.kind === 'brigandine') out.push(ell(mix(k.metal, '#ffffff', 0.08), 'metal', 0.6, -17.6, 4.6, 3.4));
  if (L.hero && !k.tabard) out.push(cap('#e2b43c', 'gold', [-5.6, -4], [6.6, -4], 0.8));
  return out;
}

function arm(k: Kit, S: Pt, T: Pt, far: boolean): { shapes: Shape[]; hand: Pt } {
  const [E, Hd] = ik(S, T, 10.2, 9.4);
  const dim = (c: string) => (far ? mix(c, '#000000', 0.12) : c);
  const shapes: Shape[] = [
    cap(dim(k.sleeve), k.sleeveMat, S, E, 4.4, 3.8, k.sleevePat),
    cap(dim(k.forearm), k.forearmMat, E, Hd, 3.7, 3.1, k.forearmMat === 'metal' ? k.sleevePat : 'none'),
  ];
  if (k.kind === 'plate') shapes.push(ell(dim(mix(k.metal, '#ffffff', 0.1)), 'metal', E[0], E[1], 2.4, 2.2));
  shapes.push(ell(dim(k.hand), k.handMat, Hd[0], Hd[1], 1.9, 1.8));
  return { shapes, hand: Hd };
}

// ───────────────────────── позы ─────────────────────────

type Cls = 'one' | 'pole' | 'chop' | 'spearShield' | 'bow' | 'crossbow' | 'lance';

interface ArmPose {
  /** Кисть с оружием (дальняя рука) в локальных координатах торса. */
  hw: Pt;
  /** Кисть ближней руки; null — вторая рука на оружии (для двуручного). */
  hs: Pt | null;
  wa: number;
  lean: number;
  front: boolean;
  pull?: number;
  arrow?: boolean;
  loaded?: boolean;
}

function clsOf(L: UnitLook): Cls {
  switch (L.weapon) {
    case 'bow':
      return 'bow';
    case 'crossbow':
    case 'handgonne':
      return 'crossbow';
    case 'lance':
      return 'lance';
    case 'halberd':
    case 'glaive':
    case 'daneaxe':
      return 'chop';
    case 'spear':
    case 'pitchfork':
      return L.shield ? 'spearShield' : 'pole';
    default:
      return 'one';
  }
}

/** frame: 0 стойка, 1..4 шаг, 5 замах/прицел, 6 удар/выстрел, 7 возврат. */
function armPose(cls: Cls, frame: number, mounted: boolean): ArmPose {
  const walk = frame >= 1 && frame <= 4;
  const f = walk ? 0 : frame;
  const sway = walk ? [0.6, 0, -0.6, 0][frame - 1] : 0;
  const shieldHand: Pt = mounted ? [9, -9] : [7.5, -11];
  switch (cls) {
    case 'one':
      return (
        [
          { hw: [8, -9 + sway] as Pt, hs: shieldHand, wa: -62, lean: 3, front: false },
          null,
          null,
          null,
          null,
          { hw: [-3, -29] as Pt, hs: shieldHand, wa: -150, lean: -4, front: false },
          { hw: [14, -16] as Pt, hs: shieldHand, wa: 12, lean: 10, front: true },
          { hw: [11, -7] as Pt, hs: shieldHand, wa: 62, lean: 12, front: true },
        ] as (ArmPose | null)[]
      )[f]!;
    case 'pole':
      return ([
        { hw: [-2, -7 + sway] as Pt, hs: null, wa: -64, lean: 2, front: false },
        null, null, null, null,
        { hw: [-7, -12] as Pt, hs: null, wa: -8, lean: -3, front: false },
        { hw: [8, -13] as Pt, hs: null, wa: -3, lean: 10, front: true },
        { hw: [4, -12] as Pt, hs: null, wa: -5, lean: 6, front: true },
      ] as (ArmPose | null)[])[f]!;
    case 'chop':
      return ([
        { hw: [-1, -8 + sway] as Pt, hs: null, wa: -76, lean: 2, front: false },
        null, null, null, null,
        { hw: [-4, -24] as Pt, hs: null, wa: -118, lean: -4, front: false },
        { hw: [10, -14] as Pt, hs: null, wa: 24, lean: 11, front: true },
        { hw: [8, -9] as Pt, hs: null, wa: 46, lean: 12, front: true },
      ] as (ArmPose | null)[])[f]!;
    case 'spearShield':
      return ([
        { hw: [3, -19 + sway] as Pt, hs: shieldHand, wa: -82, lean: 2, front: false },
        null, null, null, null,
        { hw: [-5, -25] as Pt, hs: shieldHand, wa: -8, lean: -3, front: false },
        { hw: [12, -23] as Pt, hs: shieldHand, wa: 4, lean: 10, front: true },
        { hw: [9, -21] as Pt, hs: shieldHand, wa: 8, lean: 7, front: true },
      ] as (ArmPose | null)[])[f]!;
    case 'lance':
      return ([
        { hw: [6, -12 + sway] as Pt, hs: shieldHand, wa: -80, lean: 2, front: false },
        null, null, null, null,
        { hw: [6, -13] as Pt, hs: shieldHand, wa: -34, lean: 4, front: false },
        { hw: [8, -12] as Pt, hs: shieldHand, wa: -3, lean: 10, front: true },
        { hw: [8, -12] as Pt, hs: shieldHand, wa: -3, lean: 8, front: true },
      ] as (ArmPose | null)[])[f]!;
    case 'bow':
      // hs — кисть с луком (ближняя), hw — кисть на тетиве (дальняя)
      return ([
        { hw: [3, -11 + sway] as Pt, hs: [8, -10 + sway] as Pt, wa: 0, lean: 2, front: false, pull: 2, arrow: true },
        null, null, null, null,
        { hw: [3.5, -19.5] as Pt, hs: [13.5, -19.5] as Pt, wa: 0, lean: 0, front: false, pull: 9, arrow: true },
        { hw: [-3, -18] as Pt, hs: [13.5, -19.5] as Pt, wa: 0, lean: -2, front: false, pull: 0, arrow: false },
        { hw: [2, -15] as Pt, hs: [11, -16] as Pt, wa: 0, lean: 0, front: false, pull: 1, arrow: false },
      ] as (ArmPose | null)[])[f]!;
    case 'crossbow':
      return ([
        { hw: [4, -11 + sway] as Pt, hs: null, wa: -32, lean: 2, front: false, loaded: true },
        null, null, null, null,
        { hw: [5, -18.5] as Pt, hs: null, wa: 0, lean: 1, front: true, loaded: true },
        { hw: [4, -19.5] as Pt, hs: null, wa: -9, lean: -3, front: true, loaded: false },
        { hw: [6, -9] as Pt, hs: null, wa: 70, lean: 8, front: false, loaded: false },
      ] as (ArmPose | null)[])[f]!;
  }
}

/** Верх тела (торс, голова, руки, оружие, щит) в локальных координатах торса. */
function upperBody(k: Kit, cls: Cls, frame: number, mounted: boolean): { shapes: Shape[]; lean: number; reinHand: Pt | null } {
  const L = k.L;
  const p = armPose(cls, frame, mounted);
  const SF: Pt = [-0.2, -17.6]; // дальнее плечо
  const SN: Pt = [0.8, -17.2]; // ближнее плечо
  const out: Shape[] = [];
  const pavise = L.culture === 'aurelia' && L.weapon === 'crossbow' && L.shield;
  if (pavise) out.push(poly('#5a3e24', 'wood', [[-10, -21], [-3, -21], [-3, 2], [-10, 2]], 'plank'), poly(L.cloth, 'cloth', [[-9.4, -20.4], [-3.6, -20.4], [-3.6, 1.4], [-9.4, 1.4]]), cap(L.cloth2, 'gold', [-6.5, -20], [-6.5, 1], 1.4));
  const far = arm(k, SF, p.hw, true);
  let wShapes: Shape[] = [];
  let nearT: Pt | null = p.hs;
  if (cls === 'bow') {
    const bowHand = p.hs!;
    wShapes = weapon(k, bowHand, 0, { pull: bowHand[0] - p.hw[0], arrow: p.arrow });
  } else {
    wShapes = weapon(k, far.hand, p.wa, { loaded: p.loaded });
    if (!p.hs) nearT = add(far.hand, dir(p.wa), cls === 'crossbow' ? 5 : 8);
  }
  if (!p.front) out.push(...far.shapes, ...wShapes);
  else out.push(...far.shapes);
  out.push(...torso(k));
  out.push(...head(k, 1.6, -24.6));
  if (p.front) out.push(...wShapes);
  const near = arm(k, SN, nearT ?? [3, -3], false);
  out.push(...near.shapes);
  if (L.shield && !pavise && cls !== 'bow' && cls !== 'crossbow' && (cls === 'one' || cls === 'spearShield' || cls === 'lance')) out.push(...shield(k, [near.hand[0] + 1.2, near.hand[1] - 0.5]));
  return { shapes: out, lean: p.lean, reinHand: mounted && !L.shield && cls !== 'bow' ? near.hand : null };
}

// ───────────────────────── пеший ─────────────────────────

const THIGH = 15;
const SHIN = 14.2;

function legShapes(k: Kit, hip: Pt, th: number, sh: number, far: boolean): Shape[] {
  const knee = add(hip, down(th, THIGH));
  const ankle = add(knee, down(sh, SHIN));
  const dim = (c: string) => (far ? mix(c, '#000000', 0.14) : c);
  const out: Shape[] = [cap(dim(k.pants), k.pantsMat, hip, knee, 6, 5), cap(dim(k.pants), k.pantsMat, knee, ankle, 5, 4.2)];
  if (k.pantsMat === 'metal') out.push(ell(dim(mix(k.pants, '#ffffff', 0.12)), 'metal', knee[0], knee[1], 2.6, 2.5));
  else if (k.L.tier >= 2) out.push(cap(dim(k.boots), k.bootsMat, add(ankle, [0, -5]), ankle, 4.6, 4.4));
  const [ax, ay] = ankle;
  out.push(poly(dim(k.boots), k.bootsMat, [[ax - 2.4, ay - 1.8], [ax + 2.2, ay - 1.8], [ax + 2.6, ay + 0.4], [ax + 5.6, ay + 1.6], [ax + 5.6, ay + 3], [ax - 2.6, ay + 3]]));
  return out;
}

function footSoldier(k: Kit, frame: number): Shape[] {
  const cls = clsOf(k.L);
  // Углы ног: [бедро дальней, голень дальней, бедро ближней, голень ближней]
  const legsByFrame: [number, number, number, number][] = [
    [-9, -5, 12, 3],
    [-18, -30, 18, 8],
    [-5, -6, 5, -7],
    [18, 8, -18, -30],
    [5, -7, -5, -6],
    [-10, -4, 14, 4],
    [-16, -8, 22, 6],
    [-14, -6, 18, 5],
  ];
  const [tb, sb, tf, sf] = legsByFrame[frame];
  const legLen = (t: number, s: number) => Math.cos(rad(t)) * THIGH + Math.cos(rad(s)) * SHIN;
  const hipY = -Math.max(legLen(tb, sb), legLen(tf, sf)) - 3;
  const hip: Pt = [0, hipY];
  const ub = upperBody(k, cls, frame, false);
  return [
    ...legShapes(k, [hip[0] - 1, hip[1]], tb, sb, true),
    ...legShapes(k, [hip[0] + 1, hip[1]], tf, sf, false),
    ...transform(ub.shapes, ub.lean, hip[0], hip[1]),
  ];
}

// ───────────────────────── конь ─────────────────────────

function horseShapes(k: Kit, frame: number, rider: Shape[], reinHand: Pt | null, riderLeg: Shape[]): Shape[] {
  const L = k.L;
  const base = L.horseColor ?? (L.culture === 'horde' ? ['#8a6a45', '#6a4a2a', '#9a958c'][L.seed % 3] : HORSES[L.seed % HORSES.length]);
  const mane = mix(base, '#000000', 0.55);
  const farC = mix(base, '#000000', 0.18);
  // Шаг: углы [бедро, голень] для ног: ближняя передняя, дальняя передняя, ближняя задняя, дальняя задняя
  const gaits: [number, number][][] = [
    [[4, 0], [-4, 0], [-3, 0], [4, 0]],
    [[24, -6], [-14, -2], [-18, -2], [16, 30]],
    [[8, 20], [2, 0], [-2, 0], [2, 10]],
    [[-14, -2], [24, -6], [16, 30], [-18, -2]],
    [[2, 0], [8, 20], [2, 10], [-2, 0]],
  ];
  const g = gaits[frame >= 1 && frame <= 4 ? frame : 0];
  const bob = frame === 2 || frame === 4 ? -0.8 : 0;
  const y0 = -26.5 + bob;
  const leg = (x: number, [a, b]: [number, number], c: string, front: boolean): Shape[] => {
    const top: Pt = [x, y0 + 4];
    const knee = add(top, down(a, 9.5));
    const hoof = add(knee, down(front ? b : b - 8, 10.5));
    return [cap(c, 'horse', top, knee, 5.4, 3.6), cap(c, 'horse', knee, hoof, 3, 2.5), ell('#2a2018', 'dark', hoof[0] + 0.7, hoof[1] + 1, 2, 1.3)];
  };
  const out: Shape[] = [];
  out.push(...leg(11, g[1], farC, true), ...leg(-12, g[3], farC, false));
  out.push(cap(mane, 'hair', [-18, y0 - 5], [-24, y0 + 10], 3.8, 1.6), cap(mane, 'hair', [-18, y0 - 5], [-22, y0 + 12], 2.6, 1.2));
  out.push(ell(base, 'horse', 0, y0, 17, 9.5));
  out.push(ell(base, 'horse', 11.5, y0 + 0.5, 8, 9), ell(base, 'horse', -11, y0 - 0.5, 9, 9.6));
  out.push(...leg(12, g[0], base, true), ...leg(-11, g[2], base, false));
  // Шея и голова
  out.push(cap(base, 'horse', [13, y0 - 4], [21, y0 - 17], 10.5, 6.8));
  out.push(cap(base, 'horse', [21.5, y0 - 19], [30.5, y0 - 10], 7.2, 4.4));
  out.push(cap(base, 'horse', [20.4, y0 - 20.5], [20.8, y0 - 24.5], 1.8, 0.9));
  out.push(ell(mix(base, '#000000', 0.28), 'horse', 30.4, y0 - 10.4, 2.6, 2.3));
  out.push(ell(DARK, 'dark', 31.4, y0 - 10.8, 0.45, 0.45));
  out.push(ell(DARK, 'dark', 24, y0 - 17, 0.7, 0.7));
  out.push(cap(mane, 'hair', [12.5, y0 - 8], [20.4, y0 - 21.5], 3.2, 2.4));
  out.push(cap('#3a2618', 'leather', [23, y0 - 19.5], [26.5, y0 - 12], 0.7), cap('#3a2618', 'leather', [26.5, y0 - 12], [31, y0 - 12.5], 0.7));
  if (L.heavy) {
    // Попона по контуру коня, со складками и зубчатым краем; налобник
    const hem: Pt[] = [];
    for (let i = 0; i <= 9; i++) {
      const x = 20 - i * 4.6;
      hem.push([x, y0 + (i % 2 ? 12 : 10.2) - Math.max(0, x - 12) * 0.4]);
    }
    out.push(poly(L.cloth, 'cloth', [[-21.5, y0 - 5], [-15, y0 - 9.6], [-2, y0 - 10.2], [9, y0 - 9.6], [16, y0 - 11], [21.5, y0 - 4], [22, y0 + 4], ...hem, [-22.5, y0 + 9]], 'plank'));
    out.push(cap(L.cloth2, 'gold', [-22.5, y0 + 9.4], [15, y0 + 9.4], 1.2));
    out.push(ell(L.cloth2, 'gold', -9, y0 + 0.5, 3.2, 3.4), ell(L.cloth2, 'gold', 10, y0 + 0.5, 3.2, 3.4));
    out.push(poly(L.cloth, 'cloth', [[13, y0 - 6], [18.5, y0 - 13], [21.5, y0 - 18], [24, y0 - 15.5], [20.5, y0 - 7]], 'plank'));
    out.push(poly('#9aa2aa', 'metal', [[20.5, y0 - 21], [24, y0 - 20.4], [30.4, y0 - 12.4], [28.4, y0 - 10.4], [21.4, y0 - 16.8]]));
  } else {
    out.push(poly(L.cloth2 === '#2a2320' ? '#8a3a2a' : L.cloth, 'cloth', [[-7, y0 - 10], [7.5, y0 - 9.8], [8.6, y0 + 1.5], [-8, y0 + 1.5]], 'quilt'));
    out.push(cap(L.cloth2 === '#2a2320' ? '#c8a050' : L.cloth2, 'gold', [-8, y0 + 1.2], [8.6, y0 + 1.2], 0.9));
  }
  // Седло
  out.push(poly('#4e3220', 'leather', [[-7, y0 - 12.5], [-5, y0 - 9.6], [5.4, y0 - 9.6], [7.4, y0 - 13], [5.4, y0 - 11.4], [-4.8, y0 - 11.4]]));
  // Всадник
  out.push(...transform(rider, 0, 0, 0));
  out.push(...riderLeg);
  if (reinHand) out.push(cap('#3a2618', 'string', reinHand, [26, y0 - 13], 0.5));
  return out;
}

// ───────────────────────── верблюд ─────────────────────────

/** Высота седла на горбу (дизайн-единицы от земли). */
const CAMEL_SEAT = -54;

function camelShapes(k: Kit, frame: number, rider: Shape[], reinHand: Pt | null, riderLeg: Shape[]): Shape[] {
  const L = k.L;
  const base = ['#c8a46a', '#b8945a', '#d2b27a'][L.seed % 3];
  const farC = mix(base, '#000000', 0.18);
  const gaits: [number, number][][] = [
    [[4, 0], [-4, 0], [-3, 0], [4, 0]],
    [[22, -6], [-12, -2], [-16, -2], [14, 26]],
    [[8, 18], [2, 0], [-2, 0], [2, 10]],
    [[-12, -2], [22, -6], [14, 26], [-16, -2]],
    [[2, 0], [8, 18], [2, 10], [-2, 0]],
  ];
  const g = gaits[frame >= 1 && frame <= 4 ? frame : 0];
  const bob = frame === 2 || frame === 4 ? -0.9 : 0;
  const y0 = -35 + bob;
  const leg = (x: number, [a, b]: [number, number], c: string, front: boolean): Shape[] => {
    const top: Pt = [x, y0 + 5];
    const knee = add(top, down(a, 14));
    const foot = add(knee, down(front ? b : b - 8, 15));
    return [cap(c, 'horse', top, knee, 4.6, 2.6), ell(mix(c, '#000000', 0.12), 'horse', knee[0], knee[1], 1.8, 1.8), cap(c, 'horse', knee, foot, 2.2, 1.9), ell(mix(c, '#000000', 0.35), 'dark', foot[0] + 0.8, foot[1] + 0.8, 2.8, 1.2)];
  };
  const out: Shape[] = [];
  out.push(...leg(10, g[1], farC, true), ...leg(-11, g[3], farC, false));
  // Хвост
  out.push(cap(mix(base, '#000000', 0.3), 'hair', [-15, y0 - 2], [-18, y0 + 9], 1.6, 0.8));
  // Туловище и горб
  out.push(ell(base, 'horse', 0, y0, 15.5, 8.4));
  out.push(ell(base, 'horse', -1.5, y0 - 7, 8.5, 7.2));
  out.push(ell(mix(base, '#ffffff', 0.08), 'horse', -3, y0 - 10, 4, 3));
  out.push(...leg(11, g[0], base, true), ...leg(-10, g[2], base, false));
  // Длинная изогнутая шея и маленькая голова
  out.push(cap(base, 'horse', [11, y0 - 2], [20, y0 + 1], 7.5, 5.2));
  out.push(cap(base, 'horse', [20, y0 + 1], [25, y0 - 13], 5.2, 3.8));
  out.push(cap(base, 'horse', [24.5, y0 - 14], [31.5, y0 - 12.5], 4.6, 3));
  out.push(ell(mix(base, '#000000', 0.22), 'horse', 31.8, y0 - 12.2, 1.8, 1.7));
  out.push(ell(DARK, 'dark', 26.6, y0 - 15, 0.6, 0.6));
  out.push(cap(mix(base, '#000000', 0.3), 'horse', [24.2, y0 - 16.4], [23.4, y0 - 18.6], 1.2, 0.6));
  // Узда и попона с кистями на горбу
  out.push(cap('#3a2618', 'leather', [26, y0 - 15.5], [30, y0 - 11], 0.6), cap('#3a2618', 'leather', [30, y0 - 11], [31.5, y0 - 13.8], 0.6));
  const blanket = L.cloth2 === '#2a2320' ? '#8a3a2a' : L.cloth;
  out.push(poly(blanket, 'cloth', [[-10, y0 - 12], [7, y0 - 12], [9, y0 - 1], [-11.5, y0 - 1]], 'quilt'));
  out.push(cap(L.cloth2 === '#2a2320' ? '#c8a050' : L.cloth2, 'gold', [-11.5, y0 - 1.2], [9, y0 - 1.2], 1));
  for (const x of [-9, -3, 3, 8]) out.push(cap('#c8a050', 'gold', [x, y0 - 1], [x, y0 + 2], 0.8, 0.5));
  // Седло на горбу
  out.push(poly('#4e3220', 'leather', [[-8, CAMEL_SEAT + 2.5 + bob], [-6, CAMEL_SEAT + 5 + bob], [4.4, CAMEL_SEAT + 5 + bob], [6.6, CAMEL_SEAT + 2 + bob], [4.4, CAMEL_SEAT + 3.6 + bob], [-5.8, CAMEL_SEAT + 3.6 + bob]]));
  out.push(...rider, ...riderLeg);
  if (reinHand) out.push(cap('#3a2618', 'string', reinHand, [29, y0 - 12.5], 0.5));
  return out;
}

function mounted(k: Kit, frame: number): Shape[] {
  const cls = clsOf(k.L);
  const bob = frame === 2 || frame === 4 ? -0.8 : 0;
  const hip: Pt = k.L.camel ? [-2, CAMEL_SEAT + 1.5 + bob] : [-1, -38.8 + bob];
  const ub = upperBody(k, cls, frame, true);
  const rider = transform(ub.shapes, ub.lean, hip[0], hip[1]);
  // Ближняя нога всадника вдоль бока коня, стопа в стремени
  const knee = add(hip, down(62, 12.5));
  const ankle = add(knee, down(-6, 11.5));
  const legC = k.pants;
  const riderLeg: Shape[] = [
    cap(legC, k.pantsMat, hip, knee, 6, 5),
    cap(legC, k.pantsMat, knee, ankle, 5, 4.2),
    poly(k.boots, k.bootsMat, [[ankle[0] - 2.2, ankle[1] - 1.6], [ankle[0] + 2.2, ankle[1] - 1.6], [ankle[0] + 5, ankle[1] + 1.2], [ankle[0] + 5, ankle[1] + 2.6], [ankle[0] - 2.4, ankle[1] + 2.6]]),
    cap('#8f969e', 'metal', [ankle[0] - 1.5, ankle[1] + 3], [ankle[0] + 4, ankle[1] + 3], 0.9),
  ];
  // Рука всадника перекрывается ногой: рисуем её после
  return k.L.camel ? camelShapes(k, frame, rider, ub.reinHand, riderLeg) : horseShapes(k, frame, rider, ub.reinHand, riderLeg);
}

// ───────────────────────── кадры ─────────────────────────

function frameShapes(L: UnitLook, frame: number): Shape[] {
  const k = kitOf(L);
  if (frame === 8) {
    // Павший: пеший облик в стойке, опрокинутый на спину
    const standing = footSoldier(kitOf({ ...L, mounted: false }), 0);
    const lying = rotateShapes(standing, 0, 0, -86);
    return transform(lying, 0, 26, -6);
  }
  return L.mounted ? mounted(k, frame) : footSoldier(k, frame);
}

/** Лист кадров: 9 кадров в ряд. */
export function drawUnitSheet(L: UnitLook): HTMLCanvasElement {
  const sheet = document.createElement('canvas');
  sheet.width = FRAME_W * 9;
  sheet.height = FRAME_H;
  const ctx = sheet.getContext('2d')!;
  const img = ctx.createImageData(FRAME_W * 9, FRAME_H);
  const dst = new Uint32Array(img.data.buffer);
  for (let f = 0; f < 9; f++) {
    const px = rasterize(frameShapes(L, f), FRAME_W, FRAME_H, K, OX, FEET_Y);
    for (let y = 0; y < FRAME_H; y++) dst.set(px.subarray(y * FRAME_W, (y + 1) * FRAME_W), y * FRAME_W * 9 + f * FRAME_W);
  }
  ctx.putImageData(img, 0, 0);
  return sheet;
}

/** Границы набора форм в дизайн-единицах. */
function bounds(shapes: Shape[]): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (x: number, y: number, r = 0) => {
    x0 = Math.min(x0, x - r);
    x1 = Math.max(x1, x + r);
    y0 = Math.min(y0, y - r);
    y1 = Math.max(y1, y + r);
  };
  for (const s of shapes) {
    if (s.poly) for (const [x, y] of s.poly) add(x, y);
    else if (s.ell) {
      add(s.ell[0] - s.ell[2], s.ell[1] - s.ell[3]);
      add(s.ell[0] + s.ell[2], s.ell[1] + s.ell[3]);
    } else if (s.cap) {
      const r = Math.max(s.cap[4], s.cap[5]) / 2;
      add(s.cap[0], s.cap[1], r);
      add(s.cap[2], s.cap[3], r);
    }
  }
  return [x0, y0, x1, y1];
}

/** Отдельная иконка оружия или коня (без фигуры), вписанная в квадрат size×size. */
export function drawGearIcon(L: UnitLook, what: 'weapon' | 'horse' | 'hands', size: number): HTMLCanvasElement {
  const k = kitOf(L);
  const cls = clsOf(L);
  let shapes: Shape[];
  if (what === 'horse') shapes = horseShapes(k, 0, [], null, []);
  else if (what === 'weapon') shapes = weapon(k, [0, 0], cls === 'bow' || cls === 'crossbow' ? 0 : -45);
  else {
    // Пара перчаток: раструб, тыльная сторона, пальцы и большой палец
    const g = L.gauntlets ?? '#7a5535';
    const mat: Mat = lumOf(g) > 0.4 ? 'metal' : 'leather';
    const glove = (dx: number, dy: number, c: string): Shape[] => {
      const o = (x: number, y: number): Pt => [x + dx, y + dy];
      return [
        poly(c, mat, [o(-8, 9), o(-2.5, 3.5), o(1, 7), o(-3.5, 13)], mat === 'metal' ? 'plank' : undefined),
        poly(c, mat, [o(-3, 3.5), o(1.5, -1.5), o(5, 2), o(0.8, 6.8)]),
        cap(c, mat, o(2.6, 0.6), o(7.4, -4.4), 4.6, 3.6, mat === 'metal' ? 'lamellar' : undefined),
        cap(c, mat, o(-1.4, 1.6), o(-1.2, -3), 2.3, 1.9),
      ];
    };
    shapes = [...glove(5, -2, mix(g, '#000000', 0.2)), ...glove(0, 0, g)];
  }
  const [x0, y0, x1, y1] = bounds(shapes);
  const kk = Math.min((size - 3) / (x1 - x0), (size - 3) / (y1 - y0));
  const px = rasterize(shapes, size, size, kk, size / 2 - ((x0 + x1) / 2) * kk, size / 2 - ((y0 + y1) / 2) * kk);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  new Uint32Array(img.data.buffer).set(px);
  ctx.putImageData(img, 0, 0);
  return c;
}

// Боевые спрайты воинов (вид сбоку, лицом вправо), рисуются кодом по «облику» воина.
// Кадры: 0 — стойка, 1..4 — шаг, 5..7 — атака, 8 — павший.

import type { BodyKind } from '../data/items';
import type { Helmet, Weapon } from '../data/troops';
import { Pix, shade } from './pixel';

export const FRAME_W = 56;
export const FRAME_H = 52;
export const FRAMES = { idle: 0, walk: [1, 2, 3, 4], attack: [5, 6, 7], dead: 8 } as const;

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
}

const SKIN: Record<Culture, string> = { aurelia: '#e8bf98', nordmark: '#f0c8a8', horde: '#d8a878', sultanate: '#c89068', outlaw: '#dcb08a' };
const HAIR: Record<Culture, string> = { aurelia: '#5a3a22', nordmark: '#c89a52', horde: '#1e1814', sultanate: '#221a14', outlaw: '#4a3220' };
const PANTS: Record<Culture, string> = { aurelia: '#4a4a58', nordmark: '#5a4a38', horde: '#6a4a2c', sultanate: '#e2d8c0', outlaw: '#5a4a38' };
const HORSES = ['#7a4a2a', '#8f5a30', '#2e2622', '#9a958c', '#5e3a22', '#c8c0b0'];
const OUT = '#1c1612';
const WOOD = '#7a5332';
const WOOD_D = '#523620';
const LEATHER = '#6b4a2e';
const BOOTS = '#3a2a1e';

type Pose = { kind: 'idle' | 'walk' | 'attack'; frame: number };

// ───────────────────────── рисование линий ─────────────────────────

function line(P: Pix, x0: number, y0: number, x1: number, y1: number, c: string) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    P.p(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), c);
  }
}

/** Точка на луче от кисти под углом (0 — вправо, −90 — вверх). */
function ray(hx: number, hy: number, ang: number, t: number): [number, number] {
  const r = (ang * Math.PI) / 180;
  return [Math.round(hx + Math.cos(r) * t), Math.round(hy + Math.sin(r) * t)];
}

function seg(P: Pix, hx: number, hy: number, ang: number, t0: number, t1: number, c: string, perp = 0) {
  const r = (ang * Math.PI) / 180;
  const px = -Math.sin(r) * perp;
  const py = Math.cos(r) * perp;
  for (let t = t0; t <= t1; t += 0.5) {
    P.p(Math.round(hx + Math.cos(r) * t + px), Math.round(hy + Math.sin(r) * t + py), c);
  }
}

// ───────────────────────── оружие ─────────────────────────

function isPolearm(w: Weapon) {
  return w === 'spear' || w === 'pitchfork' || w === 'halberd' || w === 'glaive' || w === 'lance';
}

function drawWeapon(P: Pix, w: Weapon, hx: number, hy: number, ang: number, L: UnitLook) {
  const steel = '#dfe4ea';
  const steelD = '#8f969e';
  switch (w) {
    case 'sword':
    case 'sabre': {
      seg(P, hx, hy, ang, -3, 0, LEATHER);
      P.p(...ray(hx, hy, ang, -3), '#c8a040');
      seg(P, hx, hy, ang, 1, 1, '#c8a040', -2);
      seg(P, hx, hy, ang, 1, 1, '#c8a040', 2);
      seg(P, hx, hy, ang, 1, 1, '#c8a040');
      const curve = w === 'sabre';
      const r = (ang * Math.PI) / 180;
      for (let t = 2; t <= 13; t += 0.5) {
        const bend = curve ? ((t - 2) * (t - 2)) / 40 : 0;
        const x = hx + Math.cos(r) * t - Math.sin(r) * bend;
        const y = hy + Math.sin(r) * t + Math.cos(r) * bend;
        P.p(Math.round(x), Math.round(y), t > 12 ? steelD : steel);
      }
      break;
    }
    case 'axe': {
      seg(P, hx, hy, ang, -3, 13, WOOD);
      for (let t = 10; t <= 13; t++) for (let k = 1; k <= 3; k++) P.p(...ray2(hx, hy, ang, t, -k), k === 3 ? steel : steelD);
      break;
    }
    case 'mace': {
      seg(P, hx, hy, ang, -2, 10, WOOD);
      for (let t = 10; t <= 12; t++) for (let k = -1; k <= 1; k++) P.p(...ray2(hx, hy, ang, t, k), k === -1 ? steel : steelD);
      break;
    }
    case 'spear':
    case 'pitchfork': {
      seg(P, hx, hy, ang, -9, 18, WOOD);
      if (w === 'spear') {
        seg(P, hx, hy, ang, 19, 23, steel);
        P.p(...ray2(hx, hy, ang, 19, 1), steelD);
        P.p(...ray2(hx, hy, ang, 19, -1), steelD);
      } else {
        seg(P, hx, hy, ang, 18, 18, steelD, -2);
        seg(P, hx, hy, ang, 18, 18, steelD, 2);
        for (const k of [-2, 0, 2]) seg(P, hx, hy, ang, 19, 22, '#9aa0a8', k);
      }
      break;
    }
    case 'halberd': {
      seg(P, hx, hy, ang, -9, 20, WOOD);
      seg(P, hx, hy, ang, 21, 24, steel);
      for (let t = 15; t <= 18; t++) for (let k = 1; k <= 3; k++) P.p(...ray2(hx, hy, ang, t, -k), k === 3 ? steel : steelD);
      P.p(...ray2(hx, hy, ang, 16, 2), steelD);
      break;
    }
    case 'glaive': {
      seg(P, hx, hy, ang, -9, 16, WOOD);
      for (let t = 17; t <= 24; t++) {
        P.p(...ray2(hx, hy, ang, t, 0), steel);
        if (t < 23) P.p(...ray2(hx, hy, ang, t, -1), steelD);
      }
      break;
    }
    case 'lance': {
      const r = (ang * Math.PI) / 180;
      for (let t = -6; t <= 24; t += 0.5) {
        const stripe = Math.floor((t + 6) / 3) % 2 === 0;
        P.p(Math.round(hx + Math.cos(r) * t), Math.round(hy + Math.sin(r) * t), stripe ? L.cloth : L.cloth2);
      }
      seg(P, hx, hy, ang, 25, 28, steel);
      seg(P, hx, hy, ang, 1, 2, steelD, -2);
      seg(P, hx, hy, ang, 1, 2, steelD, 2);
      break;
    }
    case 'bow':
    case 'crossbow':
      break;
  }
}

function ray2(hx: number, hy: number, ang: number, t: number, perp: number): [number, number] {
  const r = (ang * Math.PI) / 180;
  return [Math.round(hx + Math.cos(r) * t - Math.sin(r) * perp), Math.round(hy + Math.sin(r) * t + Math.cos(r) * perp)];
}

/** Лук: pull — насколько натянута тетива (0..4), arrow — стрела на тетиве. */
function drawBow(P: Pix, hx: number, hy: number, pull: number, arrow: boolean, composite: boolean) {
  const half = 8;
  for (let t = -half; t <= half; t++) {
    const k = t / half;
    let bend = Math.round((1 - k * k) * 3);
    if (composite && Math.abs(k) > 0.75) bend -= 1; // рекурсивные концы
    P.p(hx + bend, hy + t, Math.abs(t) > 6 ? WOOD_D : WOOD);
  }
  const sx = hx - pull;
  line(P, hx, hy - half, sx, hy, '#e6ddc8');
  line(P, sx, hy, hx, hy + half, '#e6ddc8');
  if (arrow) {
    line(P, sx, hy, hx + 7, hy, '#b89a6a');
    P.p(hx + 8, hy, '#dfe4ea');
    P.p(sx, hy - 1, '#e8e2d0');
    P.p(sx + 1, hy - 1, '#e8e2d0');
  }
}

function drawCrossbow(P: Pix, hx: number, hy: number, ang: number, loaded: boolean) {
  seg(P, hx, hy, ang, -5, 6, WOOD);
  seg(P, hx, hy, ang, -5, 0, WOOD_D, 1);
  for (let k = -4; k <= 4; k++) P.p(...ray2(hx, hy, ang, 6 - Math.abs(k) * 0.4, k), '#5a5f66');
  if (loaded) seg(P, hx, hy, ang, 0, 8, '#b89a6a', -1);
}

// ───────────────────────── щиты ─────────────────────────

function drawShield(P: Pix, L: UnitLook, x: number, y: number) {
  const c = L.cloth;
  const cD = shade(c, -0.35);
  const cL = shade(c, 0.2);
  const e = L.cloth2;
  if (L.culture === 'aurelia' && L.weapon === 'crossbow') {
    // Павеза
    for (let r = 0; r < 15; r++) for (let dx = 0; dx < 7; dx++) {
      if (r === 0 && (dx === 0 || dx === 6)) continue;
      P.p(x + dx, y - 3 + r, dx === 0 ? cL : dx === 6 ? cD : c);
    }
    P.rect(x + 3, y, 1, 9, e);
    P.rect(x + 1, y + 3, 5, 1, e);
    return;
  }
  if (L.culture === 'aurelia' || L.culture === 'outlaw') {
    // Геральдический «треугольный» щит
    const widths = [6, 6, 6, 6, 6, 6, 5, 4, 2];
    widths.forEach((w, r) => {
      const x0 = x + Math.floor((6 - w) / 2);
      for (let dx = 0; dx < w; dx++) P.p(x0 + dx, y + r, dx === 0 ? cL : dx === w - 1 ? cD : c);
    });
    if (L.culture === 'aurelia') {
      P.p(x + 2, y + 2, e);
      P.p(x + 3, y + 2, e);
      P.p(x + 2, y + 3, e);
      P.p(x + 3, y + 3, e);
      P.p(x + 1, y + 2, e);
      P.p(x + 4, y + 2, e);
      P.p(x + 2, y + 5, e);
      P.p(x + 3, y + 5, e);
    } else {
      P.rect(x + 1, y + 3, 4, 1, cD);
    }
    return;
  }
  // Круглые щиты
  const R = 4;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const d = dx * dx + dy * dy;
      if (d > R * R + 1) continue;
      let col = c;
      if (L.culture === 'nordmark') col = Math.floor((dx + 10) / 2) % 2 ? c : e;
      if (L.culture === 'horde') col = d > 9 ? '#5a3a22' : LEATHER;
      if (L.culture === 'sultanate') col = d > 10 ? e : c;
      if (d > R * R - 3) col = shade(col, -0.35);
      else if (dx < 0 && dy < 0) col = shade(col, 0.15);
      P.p(x + 3 + dx, y + 4 + dy, col);
    }
  }
  P.p(x + 3, y + 4, '#c8a040');
  P.p(x + 2, y + 3, '#e8d080');
}

// ───────────────────────── тело ─────────────────────────

function drawLegs(P: Pix, L: UnitLook, fx: number, b: number, front: number, back: number) {
  const pants = L.greaves ?? (L.body ? PANTS[L.culture] : L.tier >= 4 && L.culture !== 'sultanate' ? L.armor : PANTS[L.culture]);
  const pantsD = shade(pants, -0.3);
  const boots = L.greaves ? shade(L.greaves, -0.1) : !L.body && L.tier >= 4 && L.culture === 'aurelia' ? shade(L.armor, -0.1) : BOOTS;
  // дальняя нога
  const bx = fx - 2 + back;
  P.rect(bx - 1, 40 - b, 3, 7 + b, pantsD);
  P.rect(bx - 1, 47, 4, 3, shade(boots, -0.3));
  // ближняя нога
  const nx = fx + 1 + front;
  P.rect(nx - 1, 40 - b, 3, 7 + b, pants);
  P.p(nx - 1, 41 - b, shade(pants, 0.15));
  P.rect(nx - 1, 47, 4, 3, boots);
  P.p(nx + 2, 49, boots);
}

/** Торс, голова и шлем. ty — верх торса. */
function drawUpper(P: Pix, L: UnitLook, fx: number, ty: number) {
  const skin = SKIN[L.culture];
  const hair = HAIR[L.culture];
  const metal = L.armor;
  const metalL = shade(metal, 0.35);
  const metalD = shade(metal, -0.35);
  const cloth = L.cloth;
  const clothD = shade(cloth, -0.3);
  const clothL = shade(cloth, 0.2);
  const eastern = L.culture === 'horde' || L.culture === 'sultanate';
  // Тип доспеха: явный (герой) или по уровню воина
  const kind: BodyKind = L.body ?? (L.tier <= 1 ? 'cloth' : L.tier >= 4 || L.heavy ? (eastern ? 'lamellar' : 'plate') : 'mail');
  const plate = kind === 'plate';

  // Торс
  const soft = kind === 'cloth' || kind === 'leather';
  const bodyBase = kind === 'brigandine' ? shade(cloth, -0.15) : soft ? L.armor : metal;
  P.rect(fx - 4, ty, 8, 12, bodyBase);
  for (let y = ty; y < ty + 12; y++) {
    for (let x = fx - 4; x < fx + 4; x++) {
      const r = y - ty;
      if (kind === 'mail' && (x + y) % 2 === 0) P.p(x, y, metalD);
      if (kind === 'lamellar' && r % 2 === 0 && x % 2 === 0) P.p(x, y, metalD);
      if (kind === 'scale' && ((r % 2 === 0 && x % 2 === 0) || (r % 2 === 1 && x % 2 === 1))) P.p(x, y, r % 2 ? metalL : metalD);
      if (kind === 'cloth' && L.body && r % 3 === 2) P.p(x, y, shade(bodyBase, -0.18)); // стёжка
      if (kind === 'leather' && r % 4 === 3 && x % 2 === 0) P.p(x, y, shade(bodyBase, -0.3));
      if (kind === 'brigandine' && r % 3 === 1 && (x - fx) % 3 === 0) P.p(x, y, '#e8c04a'); // заклёпки
    }
  }
  P.vline(fx - 4, ty, ty + 11, soft ? shade(bodyBase, 0.2) : metalL);
  P.vline(fx + 3, ty, ty + 11, soft ? shade(bodyBase, -0.3) : metalD);
  if (plate) {
    // кираса с рёбрами и бликом
    P.rect(fx - 3, ty + 1, 6, 7, metalL);
    P.hline(fx - 3, fx + 2, ty + 8, metalD);
    P.vline(fx, ty + 1, ty + 7, metal);
    P.p(fx - 2, ty + 2, '#ffffff');
    P.p(fx - 2, ty + 3, '#ffffff');
    // набедренные пластины
    P.rect(fx - 4, ty + 10, 8, 3, metal);
    P.hline(fx - 4, fx + 3, ty + 12, metalD);
  }

  // Табард / кафтан
  const wantsTabard = L.tabard ?? L.tier >= 2;
  if (wantsTabard && L.tier >= 2) {
    if (eastern) {
      P.rect(fx - 4, ty + 6, 8, 9, cloth); // полы кафтана
      P.vline(fx + 3, ty + 6, ty + 14, clothD);
      P.vline(fx - 4, ty + 6, ty + 14, clothL);
      P.vline(fx, ty + 6, ty + 14, clothD);
    } else if (!(plate && L.tier >= 4 && !L.hero && L.weapon === 'halberd')) {
      P.rect(fx - 3, ty + 1, 6, 13, cloth);
      P.vline(fx - 3, ty + 1, ty + 13, clothL);
      P.vline(fx + 2, ty + 1, ty + 13, clothD);
      P.p(fx - 1, ty + 4, L.cloth2);
      P.p(fx, ty + 4, L.cloth2);
      P.p(fx - 1, ty + 5, L.cloth2);
      P.p(fx, ty + 5, L.cloth2);
      P.p(fx - 2, ty + 4, L.cloth2);
      P.p(fx + 1, ty + 4, L.cloth2);
      if (L.hero) {
        P.hline(fx - 3, fx + 2, ty + 13, '#e8c04a');
        P.vline(fx - 3, ty + 1, ty + 13, '#e8c04a');
      }
    }
  } else if (!L.body) {
    // рубаха крестьянина с поясом-верёвкой
    P.rect(fx - 4, ty + 9, 8, 4, L.armor);
  }
  P.hline(fx - 4, fx + 3, ty + 10, LEATHER);
  P.p(fx + 1, ty + 10, '#c8a040');
  // Наплечник
  if (kind === 'plate' || kind === 'brigandine' || (!L.body && L.tier >= 3)) {
    P.rect(fx - 1, ty, 4, 3, metalL);
    P.hline(fx - 1, fx + 2, ty + 2, metalD);
  }

  // Шея и голова
  P.rect(fx - 1, ty - 2, 3, 2, shade(skin, -0.2));
  const hx0 = fx - 3;
  const hy0 = ty - 10;
  P.rect(hx0, hy0, 7, 8, skin);
  P.vline(hx0, hy0 + 1, hy0 + 6, hair);
  P.vline(hx0 + 1, hy0, hy0 + 2, hair);
  P.hline(hx0 + 1, hx0 + 5, hy0, hair);
  P.p(hx0 + 7, hy0 + 4, skin); // нос
  P.p(hx0 + 5, hy0 + 3, '#2a1f18'); // глаз
  P.p(hx0 + 4, hy0 + 2, shade(hair, -0.2)); // бровь
  P.p(hx0 + 5, hy0 + 6, shade(skin, -0.3));
  P.vline(hx0 + 6, hy0 + 1, hy0 + 7, shade(skin, -0.12));
  const beard = L.culture === 'nordmark' || L.culture === 'outlaw' || (L.tier >= 3 && L.culture !== 'aurelia') || (L.seed % 3 === 0);
  if (beard) {
    const bc = L.culture === 'nordmark' ? '#b07a3a' : hair;
    P.rect(hx0 + 2, hy0 + 6, 5, 2, bc);
    P.p(hx0 + 3, hy0 + 8, bc);
    P.p(hx0 + 4, hy0 + 8, bc);
    P.p(hx0 + 5, hy0 + 5, bc);
  }

  drawHelmet(P, L, hx0, hy0);
}

function drawHelmet(P: Pix, L: UnitLook, x: number, y: number) {
  const m = L.helmetMetal ?? L.armor;
  const mL = shade(m, 0.35);
  const mD = shade(m, -0.35);
  const mail = '#8a8f96';
  switch (L.helmet) {
    case 'none':
      break;
    case 'hood': {
      const c = L.tier <= 1 ? '#6a5a40' : shade(L.cloth, -0.25);
      P.rect(x - 1, y - 2, 7, 3, c);
      P.rect(x - 1, y, 2, 8, c);
      P.rect(x - 1, y + 7, 6, 2, c);
      P.p(x + 5, y - 1, c);
      P.p(x - 2, y + 2, shade(c, -0.2));
      break;
    }
    case 'cap':
      P.rect(x, y - 2, 6, 3, '#7a5a3a');
      P.hline(x - 1, x + 6, y, '#5a4028');
      break;
    case 'fur':
      P.rect(x - 1, y - 3, 8, 4, '#6a4a2a');
      P.hline(x - 1, x + 6, y, '#a0805a');
      P.hline(x - 1, x + 6, y + 1, '#a0805a');
      P.p(x + 2, y - 4, '#6a4a2a');
      if (L.tier >= 3) P.p(x + 3, y - 5, L.cloth);
      break;
    case 'kettle':
      P.rect(x + 1, y - 3, 5, 3, m);
      P.hline(x + 2, x + 4, y - 4, m);
      P.hline(x - 2, x + 8, y, mD);
      P.hline(x - 1, x + 7, y - 1, m);
      P.p(x + 2, y - 3, mL);
      break;
    case 'nasal':
      P.rect(x, y - 3, 7, 4, m);
      P.hline(x + 2, x + 4, y - 4, m);
      P.p(x + 3, y - 5, m);
      P.vline(x + 6, y + 1, y + 4, mD);
      P.p(x + 1, y - 2, mL);
      P.hline(x, x + 6, y + 1, mD);
      break;
    case 'bascinet':
      P.rect(x - 1, y - 3, 8, 5, m);
      P.hline(x + 1, x + 4, y - 4, m);
      P.p(x + 2, y - 5, m);
      P.rect(x - 1, y + 2, 3, 7, mail); // бармица
      P.rect(x, y + 7, 6, 2, mail);
      P.p(x + 1, y - 2, mL);
      P.p(x, y - 1, mL);
      break;
    case 'great':
      P.rect(x - 1, y - 2, 9, 11, m);
      P.hline(x - 1, x + 7, y - 2, mD);
      P.hline(x + 2, x + 7, y + 3, OUT); // смотровая щель
      P.p(x + 6, y + 6, OUT);
      P.p(x + 5, y + 7, OUT);
      P.vline(x - 1, y - 1, y + 8, mL);
      P.vline(x + 7, y - 1, y + 8, mD);
      P.vline(x + 4, y - 1, y + 2, mL);
      if (L.hero || L.tier >= 4) {
        // намёт/плюмаж цвета державы
        P.rect(x + 1, y - 5, 3, 3, L.cloth2);
        P.p(x, y - 6, L.cloth2);
        P.p(x - 1, y - 5, L.cloth2);
      }
      break;
    case 'sallet':
      // Салад: купол с длинным назатыльником и прорезью, бувигер закрывает подбородок
      P.rect(x - 1, y - 3, 8, 5, m);
      P.hline(x + 1, x + 5, y - 4, m);
      P.rect(x - 4, y + 1, 4, 2, m);
      P.p(x - 5, y + 2, mD);
      P.hline(x + 2, x + 7, y + 1, OUT);
      P.rect(x + 2, y + 4, 6, 4, m);
      P.hline(x + 2, x + 7, y + 4, mL);
      P.p(x, y - 2, mL);
      P.p(x + 1, y - 3, mL);
      break;
    case 'armet':
      // Армет: гладкий закрытый шлем с забралом
      P.rect(x - 1, y - 3, 9, 11, m);
      P.clear(x - 1, y - 3);
      P.clear(x + 7, y - 3);
      P.hline(x + 1, x + 6, y - 4, m);
      P.hline(x + 2, x + 7, y + 2, OUT);
      P.hline(x + 4, x + 7, y + 4, mD);
      P.vline(x + 3, y - 3, y + 1, mL);
      P.vline(x - 1, y - 1, y + 7, mL);
      P.vline(x + 7, y, y + 7, mD);
      P.rect(x + 1, y - 7, 3, 3, L.cloth2);
      P.p(x, y - 8, L.cloth2);
      break;
    case 'turban':
      P.rect(x - 1, y - 3, 8, 4, '#efe6d0');
      P.hline(x - 1, x + 6, y - 1, '#cfc6b0');
      P.hline(x, x + 5, y - 3, '#fffaf0');
      P.p(x + 3, y - 4, '#efe6d0');
      if (L.tier >= 2) P.p(x + 5, y - 2, L.cloth);
      break;
    case 'spired':
      P.rect(x, y - 3, 7, 4, m);
      P.rect(x + 2, y - 5, 3, 2, m);
      P.vline(x + 3, y - 8, y - 6, mD);
      P.p(x + 1, y - 2, mL);
      P.p(x + 2, y - 4, mL);
      if (L.culture === 'horde') {
        P.rect(x - 1, y + 1, 2, 7, '#6a4a2a'); // меховые науши
      } else {
        P.rect(x - 1, y + 1, 2, 7, mail);
      }
      if (L.tier >= 4) P.p(x + 3, y - 9, L.cloth2);
      break;
  }
  if (L.hero && L.helmet !== 'great') {
    P.p(x + 2, y - 5, '#e8c04a');
    P.p(x + 1, y - 6, '#e8c04a');
    P.p(x, y - 7, '#e8c04a');
  }
}

// ───────────────────────── руки и позы ─────────────────────────

interface ArmPose {
  hx: number;
  hy: number;
  ang: number;
  bowPull?: number;
  arrow?: boolean;
  loaded?: boolean;
}

function armPose(L: UnitLook, fx: number, ty: number, pose: Pose): ArmPose {
  const w = L.weapon;
  const f = pose.kind === 'attack' ? pose.frame : -1;
  if (w === 'bow') {
    if (f === 0) return { hx: fx + 7, hy: ty + 2, ang: 0, bowPull: 5, arrow: true };
    if (f === 1) return { hx: fx + 7, hy: ty + 2, ang: 0, bowPull: 0, arrow: false };
    return { hx: fx + 5, hy: ty + 4, ang: 0, bowPull: 0, arrow: false };
  }
  if (w === 'crossbow') {
    if (f === 0) return { hx: fx + 3, hy: ty + 2, ang: 0, loaded: true };
    if (f === 1) return { hx: fx + 2, hy: ty + 2, ang: -8, loaded: false };
    if (f === 2) return { hx: fx + 2, hy: ty + 6, ang: 55, loaded: false };
    return { hx: fx + 3, hy: ty + 5, ang: 0, loaded: true };
  }
  if (w === 'lance') {
    if (f === 0) return { hx: fx + 1, hy: ty + 4, ang: -12 };
    if (f === 1) return { hx: fx + 5, hy: ty + 5, ang: 2 };
    if (f === 2) return { hx: fx + 3, hy: ty + 4, ang: -6 };
    return { hx: fx + 3, hy: ty + 5, ang: pose.kind === 'walk' ? -10 : -72 };
  }
  if (isPolearm(w)) {
    if (f === 0) return { hx: fx - 1, hy: ty + 4, ang: -6 };
    if (f === 1) return { hx: fx + 6, hy: ty + 4, ang: 0 };
    if (f === 2) return { hx: fx + 3, hy: ty + 4, ang: -22 };
    return { hx: fx + 3, hy: ty + 6, ang: pose.kind === 'walk' ? -35 : -78 };
  }
  // одноручное
  if (f === 0) return { hx: fx, hy: ty - 3, ang: -130 };
  if (f === 1) return { hx: fx + 6, hy: ty + 5, ang: 20 };
  if (f === 2) return { hx: fx + 5, hy: ty + 3, ang: -25 };
  return { hx: fx + 4, hy: ty + 8, ang: -58 };
}

function drawArm(P: Pix, L: UnitLook, sx: number, sy: number, hx: number, hy: number) {
  const sleeve = L.body
    ? L.body === 'cloth' || L.body === 'leather'
      ? shade(L.armor, -0.1)
      : L.body === 'brigandine'
        ? shade(L.gauntlets ?? L.armor, -0.1)
        : shade(L.armor, L.body === 'plate' ? 0.1 : -0.1)
    : L.tier <= 1
      ? L.armor
      : L.tier >= 4 || L.heavy
        ? shade(L.armor, 0.1)
        : shade(L.armor, -0.1);
  line(P, sx, sy, hx, hy, sleeve);
  line(P, sx, sy + 1, hx, hy + 1, shade(sleeve, -0.25));
  P.p(hx, hy, L.gauntlets ?? (L.body ? SKIN[L.culture] : L.tier >= 3 ? shade(L.armor, -0.2) : SKIN[L.culture]));
}

function drawArmsAndWeapon(P: Pix, L: UnitLook, fx: number, ty: number, pose: Pose) {
  const a = armPose(L, fx, ty, pose);
  const shoulder: [number, number] = [fx + 1, ty + 2];
  if (L.weapon === 'bow') {
    drawArm(P, L, shoulder[0], shoulder[1], a.hx, a.hy);
    drawBow(P, a.hx, a.hy, a.bowPull ?? 0, a.arrow ?? false, L.culture === 'horde' || L.culture === 'sultanate');
    // вторая рука у тетивы
    drawArm(P, L, shoulder[0] - 1, shoulder[1] + 1, a.hx - (a.bowPull ?? 0), a.hy);
    return;
  }
  if (L.weapon === 'crossbow') {
    drawCrossbow(P, a.hx, a.hy, a.ang, a.loaded ?? false);
    drawArm(P, L, shoulder[0], shoulder[1], a.hx, a.hy);
    drawArm(P, L, shoulder[0] - 1, shoulder[1] + 1, a.hx - 3, a.hy + 1);
    return;
  }
  drawWeapon(P, L.weapon, a.hx, a.hy, a.ang, L);
  drawArm(P, L, shoulder[0], shoulder[1], a.hx, a.hy);
  if (isPolearm(L.weapon) && L.weapon !== 'lance' && !L.shield) {
    // двуручный хват
    const [bx, by] = ray(a.hx, a.hy, a.ang, -5);
    drawArm(P, L, fx - 1, ty + 3, bx, by);
  }
}

// ───────────────────────── конь ─────────────────────────

function drawHorse(P: Pix, L: UnitLook, gait: number, far: boolean) {
  const base = L.horseColor ?? (L.culture === 'horde' ? ['#8a6a45', '#6a4a2a', '#9a958c'][L.seed % 3] : HORSES[L.seed % HORSES.length]);
  const dark = shade(base, -0.3);
  const light = shade(base, 0.18);
  const mane = shade(base, -0.55);
  // смещения копыт по кадрам: [ближняя передняя, дальняя передняя, ближняя задняя, дальняя задняя]
  const G = [
    [0, 0, 0, 0],
    [5, -2, 3, -3],
    [2, 1, -1, 1],
    [-3, 4, -3, 3],
    [1, -1, 2, -1],
  ][gait];
  const leg = (x: number, off: number, c: string) => {
    // бедро/плечо шире, ниже — тонкая нога и копыто
    P.rect(x - 1, 38, 4, 3, c);
    line(P, x, 41, x + off, 48, c);
    line(P, x + 1, 41, x + 1 + off, 48, c);
    P.p(x + off, 49, OUT);
    P.p(x + 1 + off, 49, OUT);
    P.p(x + 2 + off, 49, OUT);
  };
  if (far) {
    leg(33, G[1], dark);
    leg(16, G[3], dark);
    return;
  }
  // хвост
  line(P, 12, 31, 8, 37, mane);
  line(P, 11, 32, 7, 39, mane);
  line(P, 8, 37, 7, 43, mane);
  P.p(6, 43, mane);
  // корпус: округлая «бочка»
  const rows: [number, number][] = [[17, 31], [14, 33], [13, 35], [12, 36], [12, 37], [12, 37], [12, 37], [13, 37], [13, 36], [14, 35], [16, 33], [19, 31]];
  rows.forEach(([a, b], i) => {
    const y = 29 + i;
    for (let x = a; x <= b; x++) P.p(x, y, i < 2 ? light : i > 9 ? dark : x < a + 2 ? light : x > b - 2 ? dark : base);
  });
  // шея: широкая, наклонена вперёд
  for (let y = 18; y <= 32; y++) {
    const x0 = 31 + Math.round((32 - y) * 0.5);
    const w = y < 22 ? 5 : 6;
    for (let x = x0; x < x0 + w; x++) P.p(x, y, x === x0 + w - 1 ? dark : base);
    P.p(x0, y, mane);
    if (y % 2 === 0) P.p(x0 - 1, y, mane);
  }
  // голова: лоб, скула, морда вниз-вперёд
  P.rect(37, 16, 5, 5, base);
  P.rect(39, 20, 5, 3, base);
  P.rect(41, 23, 5, 3, base);
  P.hline(37, 41, 16, light);
  P.p(46, 24, base);
  P.hline(41, 45, 25, dark);
  P.p(45, 24, OUT); // ноздря
  P.p(40, 18, OUT); // глаз
  P.p(37, 14, base);
  P.p(38, 13, base);
  P.p(38, 14, dark); // уши
  P.p(36, 16, mane);
  // ноги
  leg(30, G[0], base);
  leg(14, G[2], base);
  // сбруя: седло, узда, повод
  P.rect(20, 28, 9, 2, LEATHER);
  P.p(28, 27, LEATHER);
  line(P, 39, 21, 44, 23, '#3a2a1e');
  line(P, 28, 30, 41, 22, '#3a2a1e');
  if (L.heavy) {
    // попона по форме корпуса с фигурным краем
    const c = L.cloth;
    const cD = shade(c, -0.3);
    const cL = shade(c, 0.15);
    rows.forEach(([a, b], i) => {
      const y = 29 + i;
      if (y < 30) return;
      for (let x = a; x <= b; x++) P.p(x, y, x < a + 2 ? cL : x > b - 1 ? cD : c);
    });
    for (let y = 41; y <= 44; y++) {
      for (let x = 13; x <= 36; x++) {
        const scallop = (x - 13) % 4;
        if (y === 44 && scallop !== 1 && scallop !== 2) continue;
        P.p(x, y, y >= 43 ? cD : c);
      }
    }
    // узор: цвет державы
    for (let x = 15; x <= 34; x += 5) {
      P.p(x, 33, L.cloth2);
      P.p(x + 1, 33, L.cloth2);
      P.p(x, 34, L.cloth2);
      P.p(x + 1, 34, L.cloth2);
      P.p(x + 2, 38, L.cloth2);
    }
    P.hline(13, 36, 42, L.cloth2);
    // кринет на шее и шанфрон на голове
    for (let y = 22; y <= 30; y++) {
      const x0 = 31 + Math.round((32 - y) * 0.5);
      P.hline(x0 + 1, x0 + 4, y, y % 3 === 0 ? cD : c);
    }
    P.rect(37, 15, 5, 4, shade(L.armor, 0.25));
    P.rect(39, 19, 4, 3, shade(L.armor, 0.1));
    P.p(40, 18, OUT);
    P.p(39, 12, L.cloth2);
    P.p(38, 11, L.cloth2);
  }
}

// ───────────────────────── кадр целиком ─────────────────────────

function drawFrame(L: UnitLook, pose: Pose): HTMLCanvasElement {
  const P = new Pix(FRAME_W, FRAME_H);
  if (L.mounted) {
    const gait = pose.kind === 'walk' ? pose.frame + 1 : 0;
    drawHorse(P, L, gait, true);
    drawHorse(P, L, gait, false);
    const fx = 23;
    const ty = 16 + (gait === 2 || gait === 4 ? 1 : 0);
    // нога всадника вдоль бока
    P.rect(fx - 1, ty + 12, 3, 6, PANTS[L.culture]);
    P.rect(fx - 1, ty + 18, 4, 3, BOOTS);
    drawUpper(P, L, fx, ty);
    if (L.shield) drawShield(P, L, fx - 7, ty + 2);
    drawArmsAndWeapon(P, L, fx, ty, pose);
  } else {
    const fx = 22;
    let front = 0;
    let back = 0;
    let b = 0;
    if (pose.kind === 'walk') {
      [front, back] = ([[3, -3], [0, 0], [-3, 3], [0, 0]] as const)[pose.frame];
      b = pose.frame % 2;
    }
    if (pose.kind === 'attack' && pose.frame === 1 && !['bow', 'crossbow'].includes(L.weapon)) {
      front = 3;
      back = -2;
    }
    drawLegs(P, L, fx, b, front, back);
    const ty = 28 - b;
    drawUpper(P, L, fx, ty);
    const shieldFront = L.shield && L.weapon !== 'crossbow';
    if (L.shield && !shieldFront) drawShield(P, L, fx - 9, ty + 2); // павеза за спиной
    drawArmsAndWeapon(P, L, fx, ty, pose);
    if (shieldFront) drawShield(P, L, fx + 2, ty + 3);
  }
  P.outline(OUT);
  return P.canvas;
}

/** Лист кадров: 9 кадров в ряд. */
export function drawUnitSheet(L: UnitLook): HTMLCanvasElement {
  const sheet = document.createElement('canvas');
  sheet.width = FRAME_W * 9;
  sheet.height = FRAME_H;
  const ctx = sheet.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const poses: Pose[] = [
    { kind: 'idle', frame: 0 },
    { kind: 'walk', frame: 0 },
    { kind: 'walk', frame: 1 },
    { kind: 'walk', frame: 2 },
    { kind: 'walk', frame: 3 },
    { kind: 'attack', frame: 0 },
    { kind: 'attack', frame: 1 },
    { kind: 'attack', frame: 2 },
  ];
  poses.forEach((p, i) => ctx.drawImage(drawFrame(L, p), i * FRAME_W, 0));
  // Павший: кадр стойки, повёрнутый на бок
  const idle = drawFrame({ ...L, mounted: false }, { kind: 'idle', frame: 0 });
  ctx.save();
  ctx.beginPath();
  ctx.rect(8 * FRAME_W, 0, FRAME_W, FRAME_H);
  ctx.clip();
  ctx.translate(8 * FRAME_W + FRAME_W / 2, FRAME_H);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(idle, -34, -24);
  ctx.restore();
  return sheet;
}

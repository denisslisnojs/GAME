import type { FactionId } from '../data/factions';
import { heroLook } from '../game/hero';
import { lookKey, troopLook } from '../battle/looks';
import type { GameState } from '../game/state';
import { TROOPS } from '../data/troops';
import { COMPANION_BY_ID } from '../data/companions';
import { armsURL } from './heraldry';
import { companionTroop } from '../game/companions';
import type { Settlement } from '../game/world';
import { hash2 } from '../util/rng';
import { ball, shapeLR, surface, tone } from './brush';
import { hex } from './color';
import { drawGearIcon, drawUnitSheet, FRAME_H, FRAME_W, type UnitLook } from './units';
import type { Item } from '../data/items';
import { FACTIONS } from '../data/factions';
import { drawCastle, drawEmblem, drawTown, drawVillage, SPRITE_Q } from './mapart';

const cache = new Map<string, string>();

function memo(key: string, make: () => HTMLCanvasElement): string {
  let v = cache.get(key);
  if (!v) {
    v = make().toDataURL();
    cache.set(key, v);
  }
  return v;
}

/** Во сколько раз крупнее рисуются портреты и фигуры (показываются со сглаживанием). */
const PSS = 2;

/** Погрудный портрет из кадра стойки новой фигуры: голова и плечи, 40×40 (в двойном разрешении). */
function bust(look: UnitLook): HTMLCanvasElement {
  const sheet = drawUnitSheet(look, PSS);
  const W = FRAME_W * PSS;
  const H = FRAME_H * PSS;
  const S = 40 * PSS;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  // Верхняя точка фигуры над плечами (без древка копья и знамени): ищем голову по ширине силуэта
  const data = sheet.getContext('2d')!.getImageData(0, 0, W, H).data;
  const cx = (look.mounted ? 50 : 52) * PSS;
  let top = 0;
  for (let y = 0; y < H; y++) {
    let run = 0;
    for (let x = cx - 8 * PSS; x < cx + 8 * PSS; x++) if (data[(y * W + x) * 4 + 3] > 128) run++;
    if (run >= 5 * PSS) {
      top = y;
      break;
    }
  }
  ctx.drawImage(sheet, cx - S / 2, Math.max(0, top - 3 * PSS), S, S, 0, 0, S, S);
  return c;
}

export function portraitURL(troopId: string): string {
  return memo(`p_${troopId}`, () => bust(troopLook(TROOPS[troopId])));
}

/** Воин во весь рост (кадр стойки), обрезанный по силуэту. */
export function figureURL(troopId: string): string {
  return memo(`f_${troopId}`, () => {
    const sheet = drawUnitSheet(troopLook(TROOPS[troopId]), PSS);
    const W = FRAME_W * PSS;
    const H = FRAME_H * PSS;
    const data = sheet.getContext('2d')!.getImageData(0, 0, W, H).data;
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (data[(y * W + x) * 4 + 3] < 40) continue;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
    const c = document.createElement('canvas');
    c.width = x1 - x0 + 1;
    c.height = y1 - y0 + 1;
    c.getContext('2d')!.drawImage(sheet, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
    return c;
  });
}

/** Портрет спутника. */
export function companionPortraitURL(id: string): string {
  return memo(`cp_${id}`, () => bust(troopLook(companionTroop(COMPANION_BY_ID[id]))));
}

/** Портрет героя в текущем снаряжении. */
export function heroPortraitURL(state: GameState): string {
  const look = heroLook(state);
  return memo(`hp_${lookKey(look)}`, () => bust(look));
}

/** Знак героя: личный герб или знамя державы. */
export function heroEmblemURL(state: GameState): string {
  return state.hero.arms ? armsURL(state.hero.arms) : emblemURL(state.hero.faction);
}

export function emblemURL(f: FactionId): string {
  return memo(`e_${f}`, () => drawEmblem(f));
}

const GROUND: Record<FactionId, [string, string, string]> = {
  aurelia: ['#6b9a3f', '#5f8e37', '#4d7b32'],
  nordmark: ['#5f8a4a', '#4b6a44', '#2e4d33'],
  horde: ['#a6a55b', '#979651', '#7c7a45'],
  sultanate: ['#dcb56d', '#d2aa62', '#b99a5a'],
};

const SKY: Record<FactionId, [string, string, string]> = {
  aurelia: ['#8fb4d8', '#a9c7e3', '#c9dcec'],
  nordmark: ['#7f9bb8', '#9cb2c8', '#bfcdd8'],
  horde: ['#7fb0e0', '#9cc4ea', '#c3daf0'],
  sultanate: ['#e8b870', '#f0cc8a', '#f6e0b0'],
};

/** Картинка-«витрина» поселения для окна поселения (128×56, в 3 раза чётче). */
export function vistaURL(s: Settlement, owner: FactionId): string {
  return memo(`v_${s.id}_${owner}`, () => {
    const W = 128;
    const H = 56;
    const { c, g } = surface(W, H, 3);
    const sky = SKY[s.culture];
    const ground = GROUND[s.culture];
    const sg = g.createLinearGradient(0, 0, 0, 34);
    sg.addColorStop(0, sky[0]);
    sg.addColorStop(0.5, sky[1]);
    sg.addColorStop(1, sky[2]);
    g.fillStyle = sg;
    g.fillRect(0, 0, W, 34);
    // Облака
    g.save();
    g.filter = 'blur(1.5px)';
    for (let i = 0; i < 4; i++) {
      const cx = hash2(i, 1, s.cx) * W;
      const cy = 5 + hash2(i, 2, s.cy) * 12;
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (const [dx, dy, r] of [[0, 0, 3], [3.5, -1.2, 3.4], [7, 0, 2.8]] as [number, number, number][]) {
        g.beginPath();
        g.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
    // Дальние холмы
    g.beginPath();
    g.moveTo(0, 35);
    for (let x = 0; x <= W; x += 2) g.lineTo(x, 34 - (6 + Math.sin(x * 0.09 + s.cx) * 3 + Math.sin(x * 0.23 + s.cy) * 2));
    g.lineTo(W, 35);
    g.closePath();
    const hg = g.createLinearGradient(0, 24, 0, 35);
    hg.addColorStop(0, tone(ground[2], 0.9));
    hg.addColorStop(1, tone(ground[2], 0.3));
    g.fillStyle = hg;
    g.fill();
    // Земля
    const gg = g.createLinearGradient(0, 34, 0, H);
    gg.addColorStop(0, tone(ground[0], 0.4));
    gg.addColorStop(1, ground[1]);
    g.fillStyle = gg;
    g.fillRect(0, 34, W, H - 34);
    // Дорога к воротам
    g.beginPath();
    g.moveTo(61, 44);
    g.lineTo(67, 44);
    g.lineTo(74, H);
    g.lineTo(54, H);
    g.closePath();
    g.fillStyle = s.culture === 'sultanate' ? '#c9a060' : '#a08a60';
    g.fill();
    // Само поселение
    const spr = s.type === 'town' ? drawTown(s.culture, owner) : s.type === 'castle' ? drawCastle(s.culture, owner) : drawVillage(s.culture, owner);
    const sw = spr.width / SPRITE_Q;
    const sh = spr.height / SPRITE_Q;
    if (s.type === 'village') {
      for (let i = 0; i < 3; i++) {
        const fx = 14 + i * 34;
        g.fillStyle = i % 2 ? '#c9b35a' : '#a8983f';
        g.beginPath();
        g.ellipse(fx + 11, 50, 12, 3.4, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.drawImage(spr, 64 - sw, 47 - sh * 2, sw * 2, sh * 2);
    } else g.drawImage(spr, 64 - sw / 2, 45 - sh, sw, sh);
    // Деревья по бокам
    for (let i = 0; i < 6; i++) {
      const x = i < 3 ? 8 + i * 12 + hash2(i, 5, s.cx) * 6 : 84 + (i - 3) * 13 + hash2(i, 6, s.cy) * 6;
      const y = 42 + hash2(i, 7, s.cx) * 8;
      if (s.culture === 'sultanate') {
        g.strokeStyle = '#6b4a2a';
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + 0.6, y - 4, x, y - 8);
        g.stroke();
        for (const dx of [-4, -2.5, 2.5, 4]) {
          g.strokeStyle = '#3b7f30';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x, y - 8);
          g.quadraticCurveTo(x + dx * 0.5, y - 9.5, x + dx, y - 7 + Math.abs(dx) * 0.2);
          g.stroke();
        }
      } else if (s.culture === 'horde') {
        ball(g, x, y - 1, 1.8, '#7c7a45');
      } else {
        g.fillStyle = '#4a3520';
        g.fillRect(x - 0.4, y - 3, 0.8, 3);
        if (s.culture === 'nordmark') {
          for (let k = 0; k < 3; k++) shapeLR(g, [[x - 3 + k * 0.7, y - 2 - k * 2.2], [x, y - 6 - k * 2.2], [x + 3 - k * 0.7, y - 2 - k * 2.2]], '#2e4d33', 0.3);
        } else ball(g, x, y - 6, 3.2, '#3d6a29');
      }
    }
    return c;
  });
}

function frame0(L: UnitLook): Uint8ClampedArray {
  return drawUnitSheet(L).getContext('2d')!.getImageData(0, 0, FRAME_W, FRAME_H).data;
}

/** Рамка пикселей, которыми фигура в предмете отличается от фигуры без него. */
function diffBox(a: Uint8ClampedArray, b: Uint8ClampedArray): [number, number, number, number] | null {
  let x0 = FRAME_W;
  let y0 = FRAME_H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      const i = (y * FRAME_W + x) * 4;
      if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3]) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

/** Иконка предмета: вырезка из спрайта манекена — ровно та часть, что меняет предмет. */
export function itemIconURL(it: Item, faction: FactionId): string {
  return memo(`it_${it.id}_${faction}`, () => {
    const f = FACTIONS[faction];
    const L: UnitLook = {
      culture: faction,
      tier: 2,
      helmet: 'none',
      cloth: hex(f.color),
      cloth2: hex(f.color2),
      armor: '#c8b890',
      weapon: 'mace',
      shield: false,
      mounted: false,
      heavy: false,
      seed: 3,
      body: 'cloth',
      tabard: false,
    };
    const base: UnitLook = { ...L };
    let minSize = 16;
    switch (it.slot) {
      case 'head':
        L.helmet = it.helmet ?? 'hood';
        L.helmetMetal = it.metal;
        minSize = 20;
        break;
      case 'body':
        L.body = it.body ?? 'cloth';
        L.armor = it.metal ?? (it.body === 'leather' ? '#8a6a45' : '#c8b890');
        L.tabard = it.tabard;
        L.tier = it.body === 'plate' ? 4 : 3;
        base.cloth = '#000000';
        base.cloth2 = '#000000';
        minSize = 30;
        break;
      case 'hands':
        L.gauntlets = it.metal ?? '#7a5535';
        L.weapon = base.weapon = 'sword';
        minSize = 14;
        break;
      case 'legs':
        L.greaves = it.metal ?? '#5a3a22';
        minSize = 30;
        break;
      case 'weapon':
        L.weapon = it.weapon ?? 'mace';
        break;
      case 'shield':
        L.shield = true;
        L.shieldShape = it.shieldShape;
        break;
      case 'horse':
        L.mounted = true;
        L.horseColor = it.horseColor;
        L.heavy = !!it.barding;
        L.armor = '#9aa0a8';
        break;
    }
    if (it.slot === 'weapon' || it.slot === 'horse' || it.slot === 'hands') return drawGearIcon(L, it.slot, 80);
    const sheet = drawUnitSheet(L, 2);
    const box = diffBox(frame0(L), frame0(base)) ?? [30, 20, 80, 100];
    // Квадрат вокруг отличий с полями
    const cx = (box[0] + box[2] + 1) / 2;
    const cy = (box[1] + box[3] + 1) / 2;
    const side = Math.max(minSize, box[2] - box[0] + 5, box[3] - box[1] + 5);
    const size = 80;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sheet, Math.round((cx - side / 2) * 2), Math.round((cy - side / 2) * 2), side * 2, side * 2, 0, 0, size, size);
    return c;
  });
}

/** Крупный спрайт героя (кадр стойки) для окна героя. */
export function heroFigureURL(look: UnitLook): string {
  const sheet = drawUnitSheet(look, PSS);
  const c = document.createElement('canvas');
  c.width = FRAME_W * PSS;
  c.height = FRAME_H * PSS;
  c.getContext('2d')!.drawImage(sheet, 0, 0, c.width, c.height, 0, 0, c.width, c.height);
  return c.toDataURL();
}

import { FACTIONS, FACTION_IDS, type FactionId } from '../data/factions';
import type { SettlementType } from '../data/settlements';
import type { TroopDef } from '../data/troops';
import { hash2 } from '../util/rng';
import { Pix, hex, shade } from './pixel';

// Пиксель-арт рисуется кодом. Любой спрайт можно заменить PNG-файлом с тем же ключом текстуры.

const OUT = '#231c17';

interface Theme {
  stone: string;
  roof: string;
  roof2: string;
  wall: string;
  landmark: 'spire' | 'stave' | 'palace' | 'mosque';
  fort: 'stone' | 'wood' | 'earth' | 'sand';
  house: 'gable' | 'long' | 'yurt' | 'flat';
}

const THEMES: Record<FactionId, Theme> = {
  aurelia: { stone: '#a59c8b', roof: '#b04a32', roof2: '#4d5a70', wall: '#e3d6b8', landmark: 'spire', fort: 'stone', house: 'gable' },
  nordmark: { stone: '#8a6a45', roof: '#5a4030', roof2: '#3d3a36', wall: '#9a7650', landmark: 'stave', fort: 'wood', house: 'long' },
  horde: { stone: '#b99a6a', roof: '#ece4d2', roof2: '#3a6fb0', wall: '#ece4d2', landmark: 'palace', fort: 'earth', house: 'yurt' },
  sultanate: { stone: '#d2b886', roof: '#efe6d0', roof2: '#2e8b57', wall: '#efe6d0', landmark: 'mosque', fort: 'sand', house: 'flat' },
};

// ───────────────────────── примитивы ─────────────────────────

function wallBlock(P: Pix, x: number, y: number, w: number, h: number, base: string, seed: number, crenel: boolean) {
  const light = shade(base, 0.22);
  const dark = shade(base, -0.28);
  P.rect(x, y, w, h, base);
  P.hline(x, x + w - 1, y, light);
  P.vline(x, y, y + h - 1, light);
  P.vline(x + w - 1, y, y + h - 1, dark);
  P.hline(x, x + w - 1, y + h - 1, dark);
  for (let yy = y + 1; yy < y + h - 1; yy++) {
    for (let xx = x + 1; xx < x + w - 1; xx++) {
      if (hash2(xx, yy, seed) < 0.12) P.p(xx, yy, dark);
    }
  }
  if (crenel) for (let xx = x; xx < x + w; xx += 2) P.p(xx, y - 1, xx === x ? light : base);
}

function palisade(P: Pix, x: number, y: number, w: number, h: number, base: string) {
  const light = shade(base, 0.2);
  const dark = shade(base, -0.3);
  for (let xx = x; xx < x + w; xx++) {
    const top = y + (xx % 2 === 0 ? 0 : 1);
    P.vline(xx, top, y + h - 1, xx % 2 === 0 ? light : base);
    P.p(xx, y + h - 1, dark);
  }
  P.hline(x, x + w - 1, y + Math.floor(h / 2), dark);
}

function cone(P: Pix, cx: number, baseY: number, halfW: number, c: string) {
  const light = shade(c, 0.2);
  const dark = shade(c, -0.25);
  const h = halfW + 1;
  for (let r = 0; r < h; r++) {
    const y = baseY - h + 1 + r;
    const hw = Math.round((r / (h - 1)) * halfW);
    for (let dx = -hw; dx <= hw; dx++) P.p(cx + dx, y, dx < 0 ? light : dx === 0 ? c : dark);
  }
}

function dome(P: Pix, cx: number, baseY: number, r: number, c: string) {
  const light = shade(c, 0.25);
  const dark = shade(c, -0.25);
  for (let dy = 0; dy <= r; dy++) {
    const hw = Math.round(Math.sqrt(r * r - (r - dy) * (r - dy)));
    for (let dx = -hw; dx <= hw; dx++) P.p(cx + dx, baseY - r + dy, dx < 0 ? light : dx === 0 ? c : dark);
  }
  P.p(cx, baseY - r - 1, '#e8c04a');
}

function tower(P: Pix, x: number, topY: number, w: number, bottomY: number, t: Theme, seed: number, roof: boolean) {
  const h = bottomY - topY + 1;
  if (t.fort === 'wood') {
    palisade(P, x, topY, w, h, t.stone);
    P.rect(x, topY, w, 1, shade(t.stone, -0.2));
  } else {
    wallBlock(P, x, topY, w, h, t.stone, seed, !roof);
  }
  P.p(x + Math.floor(w / 2), topY + 2, OUT);
  if (roof) {
    const cx = x + Math.floor(w / 2);
    if (t.fort === 'sand' || t.fort === 'earth') dome(P, cx, topY - 1, Math.floor(w / 2), t.fort === 'sand' ? shade(t.stone, 0.1) : t.roof2);
    else cone(P, cx, topY - 1, Math.floor(w / 2) + (t.fort === 'wood' ? 0 : 0), t.fort === 'wood' ? t.roof : t.roof2);
  }
}

function house(P: Pix, x: number, baseY: number, w: number, t: Theme, seed: number, big = false) {
  const wallC = t.wall;
  switch (t.house) {
    case 'gable': {
      const h = big ? 3 : 2;
      P.rect(x, baseY - h + 1, w, h, wallC);
      P.vline(x + w - 1, baseY - h + 1, baseY, shade(wallC, -0.2));
      P.p(x + 1, baseY, OUT);
      if (w > 3 && hash2(x, baseY, seed) < 0.6) P.p(x + w - 2, baseY - 1, '#f2c35a');
      const roofH = Math.ceil(w / 2);
      for (let r = 0; r < roofH; r++) {
        const y = baseY - h - roofH + 1 + r;
        const hw = Math.min(Math.floor(w / 2), r + (w % 2 === 0 ? 0 : 0));
        const cx = x + Math.floor((w - 1) / 2);
        for (let dx = -hw; dx <= hw + (w % 2 === 0 ? 1 : 0); dx++) P.p(cx + dx, y, dx <= 0 ? t.roof : shade(t.roof, -0.25));
      }
      break;
    }
    case 'long': {
      P.rect(x, baseY - 1, w, 2, wallC);
      P.p(x + Math.floor(w / 2), baseY, OUT);
      P.hline(x - 1, x + w, baseY - 2, shade(t.roof, 0.15));
      P.hline(x, x + w - 1, baseY - 3, t.roof);
      P.hline(x + 1, x + w - 2, baseY - 4, shade(t.roof, -0.2));
      P.p(x - 1, baseY - 3, '#6b8a3a');
      P.p(x + w, baseY - 3, '#6b8a3a');
      break;
    }
    case 'yurt': {
      P.rect(x, baseY - 1, w, 2, wallC);
      P.vline(x + w - 1, baseY - 1, baseY, shade(wallC, -0.2));
      P.hline(x, x + w - 1, baseY - 2, shade(wallC, -0.1));
      P.hline(x + 1, x + w - 2, baseY - 3, shade(wallC, -0.05));
      P.p(x + Math.floor(w / 2), baseY - 4, '#8a5a30');
      P.p(x + Math.floor(w / 2), baseY, '#8a5a30');
      P.hline(x, x + w - 1, baseY - 1, '#b0503a');
      break;
    }
    case 'flat': {
      const h = big ? 4 : 3;
      P.rect(x, baseY - h + 1, w, h, wallC);
      P.hline(x, x + w - 1, baseY - h + 1, shade(wallC, 0.3));
      P.vline(x + w - 1, baseY - h + 1, baseY, shade(wallC, -0.2));
      P.p(x + 1, baseY, OUT);
      if (w > 3) P.p(x + w - 2, baseY - 1, OUT);
      break;
    }
  }
}

function landmark(P: Pix, cx: number, baseY: number, t: Theme, seed: number) {
  switch (t.landmark) {
    case 'spire': {
      wallBlock(P, cx - 2, baseY - 7, 5, 8, t.wall, seed, false);
      P.p(cx, baseY - 5, OUT);
      P.p(cx, baseY - 4, OUT);
      for (let r = 0; r < 7; r++) {
        const hw = Math.floor(r / 2.5);
        for (let dx = -hw; dx <= hw; dx++) P.p(cx + dx, baseY - 14 + r, dx < 0 ? shade(t.roof2, 0.2) : t.roof2);
      }
      P.p(cx, baseY - 15, '#e8c04a');
      P.hline(cx - 1, cx + 1, baseY - 16, '#e8c04a');
      P.p(cx, baseY - 17, '#e8c04a');
      break;
    }
    case 'stave': {
      P.rect(cx - 2, baseY - 5, 5, 6, '#6a4a2a');
      P.vline(cx + 2, baseY - 5, baseY, '#4a3220');
      for (let tier = 0; tier < 3; tier++) {
        const y = baseY - 6 - tier * 3;
        const hw = 3 - tier;
        P.hline(cx - hw, cx + hw, y, '#3a2a20');
        P.hline(cx - hw + 1, cx + hw - 1, y - 1, '#2a1f18');
        if (tier < 2) P.rect(cx - hw + 1, y - 2, 2 * hw - 1, 1, '#6a4a2a');
      }
      P.p(cx, baseY - 14, '#2a1f18');
      P.p(cx - 3, baseY - 7, '#b04a32');
      P.p(cx + 3, baseY - 7, '#b04a32');
      break;
    }
    case 'palace': {
      wallBlock(P, cx - 3, baseY - 5, 7, 6, '#e6dcc4', seed, false);
      P.p(cx, baseY, OUT);
      P.p(cx, baseY - 1, OUT);
      dome(P, cx, baseY - 6, 3, t.roof2);
      break;
    }
    case 'mosque': {
      wallBlock(P, cx - 3, baseY - 4, 7, 5, t.wall, seed, false);
      P.p(cx, baseY, OUT);
      P.p(cx, baseY - 1, OUT);
      dome(P, cx, baseY - 5, 3, t.roof2);
      // минарет
      P.rect(cx + 5, baseY - 12, 2, 13, shade(t.wall, -0.05));
      P.vline(cx + 6, baseY - 12, baseY, shade(t.wall, -0.2));
      P.hline(cx + 4, cx + 7, baseY - 9, shade(t.wall, -0.3));
      P.p(cx + 5, baseY - 13, t.roof2);
      P.p(cx + 6, baseY - 13, shade(t.roof2, -0.2));
      P.p(cx + 5, baseY - 14, '#e8c04a');
      break;
    }
  }
}

function banner(P: Pix, poleX: number, topY: number, poleLen: number, main: string, sec: string) {
  P.vline(poleX, topY, topY + poleLen, '#3b2f25');
  P.rect(poleX + 1, topY, 4, 3, main);
  P.p(poleX + 2, topY + 1, sec);
  P.p(poleX + 3, topY + 1, sec);
  P.p(poleX + 4, topY + 3, main);
  P.p(poleX + 1, topY + 3, main);
}

// ───────────────────────── поселения ─────────────────────────

export function drawTown(culture: FactionId, owner: FactionId): HTMLCanvasElement {
  const t = THEMES[culture];
  const f = FACTIONS[owner];
  const P = new Pix(30, 26);
  const base = 24;
  // Дальний план: ориентир и дома за стеной
  landmark(P, 14, base - 9, t, 5);
  house(P, 5, base - 9, 4, t, 1, true);
  house(P, 20, base - 9, 4, t, 2, true);
  house(P, 9, base - 8, 3, t, 3);
  // Стена
  if (t.fort === 'wood') palisade(P, 3, base - 8, 23, 9, t.stone);
  else wallBlock(P, 3, base - 7, 23, 8, t.stone, 7, true);
  // Ворота
  P.rect(12, base - 3, 5, 4, OUT);
  P.hline(13, 15, base - 4, OUT);
  P.p(12, base - 3, shade(t.stone, -0.3));
  // Башни
  tower(P, 0, base - 11, 5, base, t, 11, true);
  tower(P, 24, base - 11, 5, base, t, 12, true);
  banner(P, 26, 0, 9, hex(f.color), hex(f.color2));
  P.outline(OUT);
  return P.canvas;
}

export function drawCastle(culture: FactionId, owner: FactionId): HTMLCanvasElement {
  const t = THEMES[culture];
  const f = FACTIONS[owner];
  const P = new Pix(24, 22);
  const base = 20;
  // Донжон
  if (t.fort === 'wood') {
    palisade(P, 8, base - 12, 7, 13, t.stone);
    cone(P, 11, base - 13, 4, t.roof);
  } else {
    wallBlock(P, 8, base - 13, 7, 14, t.fort === 'stone' ? shade(t.stone, 0.05) : t.stone, 21, t.fort === 'stone');
    P.p(11, base - 10, OUT);
    P.p(11, base - 9, OUT);
    if (t.fort !== 'stone') dome(P, 11, base - 14, 3, t.roof2);
  }
  // Стены и башни
  if (t.fort === 'wood') palisade(P, 2, base - 6, 19, 7, t.stone);
  else wallBlock(P, 2, base - 5, 19, 6, t.stone, 22, true);
  P.rect(10, base - 2, 3, 3, OUT);
  tower(P, 0, base - 9, 4, base, t, 23, t.fort !== 'stone');
  tower(P, 19, base - 9, 4, base, t, 24, t.fort !== 'stone');
  banner(P, 12, 0, 7, hex(f.color), hex(f.color2));
  P.outline(OUT);
  return P.canvas;
}

export function drawVillage(culture: FactionId, owner: FactionId): HTMLCanvasElement {
  const t = THEMES[culture];
  const f = FACTIONS[owner];
  const P = new Pix(22, 14);
  const base = 12;
  // Поле
  for (let x = 1; x < 9; x++) P.p(x, base + 1, x % 2 ? '#c9b35a' : '#a8983f');
  const vt = { ...t, wall: culture === 'aurelia' ? '#d9c9a0' : t.wall, roof: culture === 'aurelia' ? '#c9a34a' : t.roof };
  house(P, 2, base - 1, 5, vt, 31);
  house(P, 11, base, 5, vt, 32);
  house(P, 7, base - 3, 4, vt, 33);
  if (culture === 'sultanate') {
    // пальма
    P.vline(17, base - 5, base, '#6b4a2a');
    P.hline(15, 19, base - 6, '#3b7f30');
    P.p(14, base - 5, '#3b7f30');
    P.p(20, base - 5, '#3b7f30');
    P.p(17, base - 7, '#5aa244');
  } else if (culture === 'horde') {
    // загон для коней
    P.hline(16, 20, base - 1, '#8a6a45');
    P.hline(16, 20, base + 1, '#8a6a45');
    P.p(18, base, '#6a4a2a');
  } else {
    P.vline(18, base - 4, base, '#4a3520');
    P.rect(17, base - 7, 3, 3, '#3d6a29');
    P.p(17, base - 7, '#5a903a');
  }
  // маленький флажок владельца
  P.vline(20, 0, 5, '#3b2f25');
  P.rect(17, 0, 3, 2, hex(f.color));
  P.p(18, 0, hex(f.color2));
  P.outline(OUT);
  return P.canvas;
}

export function settlementTextureKey(type: SettlementType, culture: FactionId, owner: FactionId): string {
  return `${type}_${culture}_${owner}`;
}

export function allSettlementTextures(): { key: string; canvas: HTMLCanvasElement }[] {
  const out: { key: string; canvas: HTMLCanvasElement }[] = [];
  for (const c of FACTION_IDS) {
    for (const o of FACTION_IDS) {
      out.push({ key: settlementTextureKey('town', c, o), canvas: drawTown(c, o) });
      out.push({ key: settlementTextureKey('castle', c, o), canvas: drawCastle(c, o) });
      out.push({ key: settlementTextureKey('village', c, o), canvas: drawVillage(c, o) });
    }
  }
  return out;
}

// ───────────────────────── отряды на карте ─────────────────────────

const RIDER_BODY = [
  '................p.........',
  '................pBBBBBB...',
  '................pBbbbbB...',
  '................pBBbBBB...',
  '................pBBBBB....',
  '..........kkk...p.........',
  '.........kkkkK..p.........',
  '.........Ksses..p.........',
  '..........ssss.sp.........',
  '.........cgcCCssp....mm...',
  '........ccgcCC..p...mmhh..',
  '........cccccC..p..mhhhhh.',
  '..mm....LcccCL..p.mhhhhehh',
  '.mmhhhhhLhhhhLhhhhhhhh..Hn',
  '.mhlllllLllllLlllhhhh.....',
  '.m.hhhhhhhhhhhhhhhhH......',
  '.m.hhhhhhhhhhhhhhhhH......',
  '...HhhhhhhhhhhhhhhHH......',
  '....HHHhhhhhhhhHHH........',
];
const RIDER_LEGS = [
  ['....hH.hH......hH.hH......', '....hH.hH......hH.hH......', '....hH.hH......hH.hH......', '....nn.nn......nn.nn......'],
  ['...hH...hH....hH...hH.....', '..hH.....hH..hH.....hH....', '.hH.......hH.hH......hH...', '.nn.......nn.nn......nn...'],
];

/** Всадник со знаменем на карте, 2 кадра шага. banner=false — без знамени (разбойники). */
export function drawRider(main: string, sec: string, frame: 0 | 1, player: boolean, banner = true, horse = '#8a5a32'): HTMLCanvasElement {
  const P = new Pix(26, 25);
  const pal: Record<string, string | null> = {
    h: horse, H: shade(horse, -0.32), l: shade(horse, 0.2), m: '#2a1f18', e: OUT, n: OUT,
    s: '#e0b48a', c: main, C: shade(main, -0.3), g: sec, k: '#b0b6be', K: '#6a7078', L: '#4a3220',
    p: banner ? (player ? '#e8c04a' : '#4a3520') : null, B: banner ? main : null, b: banner ? sec : null,
  };
  P.pattern(0, 0, RIDER_BODY, pal);
  P.pattern(0, 19, RIDER_LEGS[frame], pal);
  P.outline(OUT);
  // тень под конём
  P.rect(3, 23, 20, 1, 'rgba(0,0,0,0.28)');
  P.rect(5, 24, 16, 1, 'rgba(0,0,0,0.18)');
  return P.canvas;
}

/** Пешая шайка разбойников: три фигуры в капюшонах. */
export function drawBandits(frame: 0 | 1, hood = '#5a2a22'): HTMLCanvasElement {
  const P = new Pix(26, 20);
  const fig = (x: number, y: number, cloth: string, weapon: 'club' | 'bow' | 'axe', f: number) => {
    const pal: Record<string, string> = {
      h: hood, H: shade(hood, -0.3), s: '#dcb08a', c: cloth, C: shade(cloth, -0.3), w: '#7a5332', W: '#5a5f66', L: '#3a2a1e',
    };
    P.pattern(x, y, [
      '..hhh...',
      '.hhhhh..',
      '.Hssh...',
      '..ss....',
      '.cccc...',
      'ccCccs..',
      'c.cCc...',
      '..cCc...',
      f ? '..c.c...' : '.c..c...',
      f ? '..c.c...' : '.c...c..',
      f ? '.LL.LL..' : 'LL...LL.',
    ], pal);
    if (weapon === 'club') {
      P.vline(x + 6, y + 2, y + 6, '#7a5332');
      P.rect(x + 6, y + 1, 2, 2, '#5a3a22');
    } else if (weapon === 'axe') {
      P.vline(x + 6, y + 2, y + 7, '#7a5332');
      P.rect(x + 7, y + 2, 1, 3, '#9aa0a8');
    } else {
      for (let t = 0; t < 9; t++) P.p(x + 6 + (t > 1 && t < 7 ? 1 : 0), y + t, '#7a5332');
    }
  };
  fig(1, 6, '#6a5a40', 'club', frame);
  fig(16, 5, '#5a4a3a', 'bow', frame ^ 1);
  fig(8, 8, '#7a6048', 'axe', frame);
  P.outline(OUT);
  P.rect(2, 19, 22, 1, 'rgba(0,0,0,0.25)');
  return P.canvas;
}

/** Корабль (ког) для морских переходов. */
export function drawBoat(main: string, sec: string, frame: 0 | 1): HTMLCanvasElement {
  const P = new Pix(18, 16);
  const pal: Record<string, string> = { w: '#7a5535', W: '#5a3a22', s: main, S: shade(main, -0.25), x: sec, p: '#3b2f25', f: '#cfe6f2' };
  P.pattern(0, 0, [
    '........p.........',
    '......sssss.......',
    '......sxxxs.......',
    '......sxsxS.......',
    '......sxxxS.......',
    '......ssssS.......',
    '........p.........',
    '........p.........',
    '..w.....p......w..',
    '..wwwwwwwwwwwwww..',
    '...wWwWwWwWwWww...',
    '....WWWWWWWWWW....',
  ], pal);
  P.pattern(0, 12, frame === 0 ? ['..f..........f....'] : ['...f.........f....'], pal);
  P.outline(OUT);
  return P.canvas;
}

// ───────────────────────── портреты воинов ─────────────────────────

const SKIN: Record<FactionId | 'outlaw', string> = { aurelia: '#e8bf98', nordmark: '#f0c8a8', horde: '#d8a878', sultanate: '#c89068', outlaw: '#dcb08a' };

/** Портрет-бюст воина 24×24 для интерфейса. */
export function drawPortrait(t: TroopDef): HTMLCanvasElement {
  const P = new Pix(24, 24);
  const L = t.look;
  const skin = SKIN[t.faction];
  const cloth = L.cloth;
  const metal = L.armor;
  const metalL = shade(metal, 0.3);
  const metalD = shade(metal, -0.3);

  // Конь для конницы (голова слева сзади)
  if (t.line === 'cavalry') {
    P.pattern(0, 8, [
      '..hh........',
      '.hhhh.......',
      'hhhhhh......',
      'hhhhhhh.....',
      '.hhhhhhh....',
      '..mhhhhhh...',
      '....hhhhhh..',
      '.....hhhhhh.',
      '......hhhhhh',
      '.......hhhhh',
      '........hhhh',
      '.........hhh',
    ], { h: '#7a4f2e', m: '#2a1f18' });
    P.p(3, 10, '#2a1f18');
  }

  // Плечи и торс
  const torsoTier = t.tier >= 3 ? metal : cloth;
  P.rect(6, 17, 12, 7, torsoTier);
  P.rect(5, 18, 14, 6, torsoTier);
  P.rect(9, 17, 6, 7, cloth); // сюрко/табард
  P.vline(12, 17, 23, shade(cloth, -0.25));
  if (t.tier >= 2) {
    P.hline(5, 8, 18, metalL);
    P.hline(15, 18, 18, metalL);
  }
  if (t.tier >= 4) {
    P.rect(5, 18, 3, 3, metalL);
    P.rect(16, 18, 3, 3, metalL);
  }
  // Шея и голова
  P.rect(10, 15, 4, 2, shade(skin, -0.15));
  P.rect(8, 7, 8, 8, skin);
  P.vline(15, 7, 14, shade(skin, -0.15));
  P.p(10, 10, '#2a1f18');
  P.p(13, 10, '#2a1f18');
  P.hline(10, 13, 13, shade(skin, -0.3));
  if (t.faction === 'nordmark' || t.tier >= 3) P.rect(9, 12, 6, 3, t.faction === 'nordmark' ? '#b07a3a' : '#4a3020'); // борода
  if (t.faction === 'nordmark' || t.tier >= 3) P.hline(10, 13, 13, shade(skin, -0.3));

  // Шлем
  switch (L.helmet) {
    case 'hood':
      P.rect(7, 5, 10, 4, '#6a5a40');
      P.vline(7, 5, 15, '#6a5a40');
      P.vline(16, 5, 15, '#5a4a30');
      P.rect(7, 15, 10, 2, '#6a5a40');
      break;
    case 'cap':
      P.rect(8, 5, 8, 3, '#7a5a3a');
      P.hline(7, 16, 7, '#5a4028');
      break;
    case 'fur':
      P.rect(7, 4, 10, 4, '#6a4a2a');
      P.hline(7, 16, 7, '#9a7a50');
      P.hline(7, 16, 8, '#9a7a50');
      P.p(12, 3, '#6a4a2a');
      break;
    case 'kettle':
      P.rect(9, 3, 6, 4, metal);
      P.hline(6, 17, 7, metalD);
      P.hline(7, 16, 6, metal);
      P.p(10, 4, metalL);
      break;
    case 'nasal':
      P.rect(8, 4, 8, 4, metal);
      P.rect(9, 3, 6, 1, metal);
      P.vline(12, 8, 11, metalD);
      P.p(9, 4, metalL);
      P.hline(8, 15, 7, metalD);
      break;
    case 'bascinet':
      P.rect(8, 3, 8, 5, metal);
      P.p(12, 2, metal);
      P.vline(7, 6, 14, metal);
      P.vline(16, 6, 14, metalD);
      P.rect(7, 15, 10, 2, '#9a9a9a'); // бармица
      P.p(9, 4, metalL);
      break;
    case 'great':
      P.rect(7, 4, 10, 11, metal);
      P.hline(8, 15, 9, OUT);
      P.p(10, 11, OUT);
      P.p(13, 11, OUT);
      P.vline(8, 5, 14, metalL);
      P.vline(16, 5, 14, metalD);
      P.hline(6, 17, 4, cloth);
      break;
    case 'sallet':
      P.rect(7, 3, 10, 6, metal);
      P.rect(4, 8, 4, 3, metal);
      P.hline(9, 16, 8, OUT);
      P.rect(10, 11, 7, 4, metal);
      P.hline(10, 16, 11, metalL);
      P.p(9, 4, metalL);
      break;
    case 'armet':
      P.rect(7, 3, 10, 12, metal);
      P.hline(9, 16, 8, OUT);
      P.hline(12, 16, 10, metalD);
      P.vline(8, 4, 14, metalL);
      P.vline(16, 4, 14, metalD);
      P.rect(10, 1, 3, 2, FACTIONS[t.faction === 'outlaw' ? 'aurelia' : t.faction].css2);
      break;
    case 'turban':
      P.rect(7, 4, 10, 4, '#efe6d0');
      P.hline(7, 16, 6, '#cfc6b0');
      P.p(12, 3, '#efe6d0');
      break;
    case 'spired':
      P.rect(8, 4, 8, 4, metal);
      P.rect(10, 2, 4, 2, metal);
      P.vline(12, 0, 1, metalD);
      P.p(9, 5, metalL);
      if (t.faction === 'horde') P.rect(7, 8, 1, 6, '#6a4a2a');
      if (t.faction === 'horde') P.rect(16, 8, 1, 6, '#6a4a2a');
      break;
    case 'none':
      P.rect(8, 6, 8, 2, '#4a3020');
      break;
  }

  // Оружие справа
  const wood = '#6a4a2a';
  switch (L.weapon) {
    case 'pitchfork':
      P.vline(20, 4, 23, wood);
      P.vline(19, 1, 4, '#8a8a8a');
      P.vline(21, 1, 4, '#8a8a8a');
      P.p(20, 4, '#8a8a8a');
      break;
    case 'spear':
    case 'lance':
      P.vline(20, 3, 23, wood);
      P.vline(20, 0, 2, metalL);
      P.p(19, 2, metalL);
      P.p(21, 2, metalL);
      break;
    case 'glaive':
    case 'halberd':
      P.vline(20, 2, 23, wood);
      P.rect(21, 2, 2, 4, metalL);
      P.p(20, 0, metalL);
      P.p(20, 1, metalL);
      break;
    case 'sword':
    case 'sabre':
      P.vline(20, 5, 16, '#d8dde2');
      P.hline(18, 22, 17, '#8a6a30');
      P.vline(20, 18, 20, wood);
      if (L.weapon === 'sabre') P.p(21, 6, '#d8dde2');
      break;
    case 'axe':
    case 'mace':
      P.vline(20, 6, 22, wood);
      P.rect(21, 6, 2, 4, metalL);
      P.p(21, 10, metal);
      break;
    case 'bow':
      for (let y = 2; y <= 21; y++) {
        const dx = Math.round(Math.sin(((y - 2) / 19) * Math.PI) * 2);
        P.p(19 + dx, y, wood);
      }
      P.vline(19, 2, 21, '#e6ddc8');
      break;
    case 'crossbow':
      P.hline(17, 23, 12, wood);
      P.vline(20, 8, 16, '#6a6a6a');
      P.p(19, 9, '#6a6a6a');
      P.p(21, 9, '#6a6a6a');
      break;
  }
  if (L.shield) {
    P.rect(1, 14, 6, 8, cloth);
    P.rect(2, 22, 4, 1, cloth);
    P.vline(1, 14, 21, shade(cloth, 0.2));
    P.vline(6, 14, 21, shade(cloth, -0.3));
    P.rect(3, 16, 2, 3, t.faction === 'outlaw' ? '#3a2a1e' : FACTIONS[t.faction].css2);
  }
  P.outline(OUT);
  return P.canvas;
}

// ───────────────────────── гербы ─────────────────────────

/** Геральдический щит державы 16×18. */
export function drawEmblem(id: FactionId): HTMLCanvasElement {
  const f = FACTIONS[id];
  const P = new Pix(16, 18);
  const main = hex(f.color);
  const sec = hex(f.color2);
  // щит
  for (let y = 0; y < 18; y++) {
    const hw = y < 11 ? 7 : Math.max(0, 7 - Math.round((y - 10) * 1.1));
    for (let dx = -hw; dx < hw; dx++) P.p(8 + dx, y, dx < -hw + 1 ? shade(main, 0.2) : main);
  }
  const pal = { x: sec, X: shade(sec, -0.25) };
  const E: Record<string, string[]> = {
    eagle: [
      '..x.....x..',
      '.xxx.x.xxx.',
      'xxxxxxxxxxx',
      'x.xxxxxxx.x',
      '...xxxxx...',
      '...xx.xx...',
      '..x.....x..',
    ],
    axe: [
      '.....X.....',
      '..xxxX.....',
      '.xxxxX.....',
      'xxxxxX.....',
      '.xxxxX.....',
      '..xxxX.....',
      '.....X.....',
    ],
    horse: [
      '.......xx..',
      '......xxxx.',
      'x.xxxxxxx..',
      '.xxxxxxx...',
      '.xxxxxxx...',
      '.x.x..x.x..',
      '.x.x..x.x..',
    ],
    crescent: [
      '...xxxx....',
      '..xx.......',
      '.xx.....x..',
      '.xx....xxx.',
      '.xx.....x..',
      '..xx.......',
      '...xxxx....',
    ],
  };
  P.pattern(2, 4, E[f.emblem], pal);
  P.outline(OUT);
  return P.canvas;
}

/** Лорд на карте: всадник с высоким штандартом и оруженосцем. */
export function drawLord(main: string, sec: string, frame: 0 | 1): HTMLCanvasElement {
  const P = new Pix(34, 34);
  const rider = drawRider(main, sec, frame, false);
  // Оруженосец позади (меньше и темнее)
  const squire = drawRider(shade(main, -0.25), sec, (frame ^ 1) as 0 | 1, false, false, '#6a4a2a');
  P.ctx.globalAlpha = 0.95;
  P.ctx.drawImage(squire, 0, 8, 20, 19);
  P.ctx.globalAlpha = 1;
  P.ctx.drawImage(rider, 7, 9);
  // Штандарт: древко, раздвоенное полотнище, золотое навершие
  const px = 10;
  P.vline(px, 1, 22, '#3b2f25');
  P.p(px, 0, '#e8c04a');
  P.p(px - 1, 1, '#e8c04a');
  P.p(px + 1, 1, '#e8c04a');
  for (let y = 2; y < 10; y++) {
    const len = y < 8 ? 12 : 12 - (y - 7) * 3;
    for (let x = 1; x <= len; x++) {
      const tail = x > 9 && y > 4 && y < 7;
      if (tail) continue;
      P.p(px + x, y, y === 5 || y === 6 ? sec : main);
    }
  }
  P.p(px + 4, 4, sec);
  P.p(px + 5, 3, sec);
  P.p(px + 6, 4, sec);
  P.outline(OUT);
  return P.canvas;
}

/** Осадный лагерь: шатры и костёр, 2 кадра огня. */
export function drawCamp(frame: 0 | 1): HTMLCanvasElement {
  const P = new Pix(40, 22);
  const tent = (x: number, y: number, w: number, c: string) => {
    for (let r = 0; r < w; r++) P.hline(x + w - r, x + w + r, y + r, r === 0 ? shade(c, 0.2) : (r + x) % 3 === 0 ? shade(c, -0.15) : c);
    P.vline(x + w, y + Math.floor(w / 2), y + w - 1, '#2a1f18');
    P.vline(x + w, y - 3, y, '#3b2f25');
    P.p(x + w + 1, y - 3, '#c24040');
    P.p(x + w + 2, y - 3, '#c24040');
    P.p(x + w + 1, y - 2, '#c24040');
  };
  tent(1, 6, 7, '#d8c8a0');
  tent(20, 4, 8, '#c8b48a');
  // костёр
  const fx = 18;
  const fy = 18;
  P.rect(fx - 3, fy + 1, 7, 1, '#4a3520');
  const flame = frame ? ['..y..', '.yoy.', 'yorOy', '.rOr.'] : ['.y...', '.oyy.', 'yrooy', '.rOr.'];
  P.pattern(fx - 2, fy - 3, flame, { y: '#ffe07a', o: '#f0a030', r: '#d04a20', O: '#ffcf5a' });
  // таран/лестница
  for (let i = 0; i < 9; i++) P.p(30 + i, 17 - Math.floor(i / 2), '#7a5332');
  for (let i = 0; i < 9; i += 2) P.p(30 + i, 16 - Math.floor(i / 2), '#5a3a22');
  P.outline(OUT);
  return P.canvas;
}

/** Разорённая деревня: дым и тлеющие угли. */
export function drawSmoke(frame: 0 | 1): HTMLCanvasElement {
  const P = new Pix(22, 26);
  const puffs = frame ? [[8, 3, 4], [12, 8, 5], [9, 14, 4], [13, 19, 3]] : [[10, 2, 4], [9, 8, 5], [12, 14, 4], [10, 19, 3]];
  for (const [cx, cy, r] of puffs) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue;
      P.p(cx + x, cy + y, x + y < -1 ? '#9a948c' : (x + y) % 3 === 0 ? '#5e5a55' : '#77726b');
    }
  }
  P.p(9, 23, '#ff8a3a');
  P.p(12, 24, '#ffd05a');
  P.p(14, 23, '#d04a20');
  return P.canvas;
}

/** Мор над городом: тёмное облако миазмов и череп, 2 кадра. */
export function drawPlague(frame: 0 | 1): HTMLCanvasElement {
  const P = new Pix(24, 22);
  const puffs = frame ? [[6, 8, 5], [12, 6, 6], [18, 9, 5], [11, 12, 5]] : [[7, 9, 5], [12, 7, 6], [17, 8, 5], [12, 12, 5]];
  for (const [cx, cy, r] of puffs) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue;
      P.p(cx + x, cy + y, (x + y + frame) % 4 === 0 ? '#3a4a2e' : x + y < -2 ? '#56663e' : '#2e3a26');
    }
  }
  P.pattern(8, 5, [
    '.wwwww.',
    'wwwwwww',
    'wkwwwkw',
    'wkwwwkw',
    'wwwkwww',
    '.wwwww.',
    '.w.w.w.',
  ], { w: '#e8e2cc', k: '#1a1410' });
  P.outline('#141810');
  return P.canvas;
}

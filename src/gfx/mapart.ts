// Спрайты карты мира в «живописном» стиле: поселения четырёх держав, отряды, корабли, лагеря.
// Размеры — в «точках спрайта» (как у прежних пиксельных спрайтов, чтобы не менять расстановку);
// рисуются в SPRITE_Q раз чётче и показываются с масштабом ART_SCALE / SPRITE_Q.

import { FACTIONS, FACTION_IDS, type FactionId } from '../data/factions';
import type { SettlementType } from '../data/settlements';
import { hash2 } from '../util/rng';
import { ball, box, mx, OUT, outlined, rgba, shapeLR, smoothGlyph, surface, tone, type G, type Pt } from './brush';
import { hex, hexOf, rgb } from './color';

/** Во сколько раз чётче рисуются спрайты карты. */
export const SPRITE_Q = 4;
const Q = SPRITE_Q;
/** Толщина внешней обводки в точках спрайта. */
const OW = 0.42;

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

const LW = 0.28; // тонкие линии внутри рисунка

function finish(c: HTMLCanvasElement): HTMLCanvasElement {
  return outlined(c, OW * Q, OUT);
}

// ───────────────────────── части построек ─────────────────────────

/** Каменная стена: блок со светотенью, ряды кладки, зубцы. */
function stoneWall(g: G, x: number, y: number, w: number, h: number, base: string, seed: number, crenel: boolean) {
  const gr = g.createLinearGradient(x, y, x + w, y + h);
  gr.addColorStop(0, tone(base, 0.8));
  gr.addColorStop(0.4, base);
  gr.addColorStop(1, tone(base, -1));
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
  g.strokeStyle = rgba(tone(base, -1.8), 0.55);
  g.lineWidth = 0.18;
  for (let yy = y + 1.2, row = 0; yy < y + h - 0.2; yy += 1.2, row++) {
    g.beginPath();
    g.moveTo(x, yy);
    g.lineTo(x + w, yy);
    g.stroke();
    for (let xx = x + (row % 2 ? 0.9 : 1.8); xx < x + w; xx += 1.8 + hash2(Math.round(xx * 3), row, seed) * 0.6) {
      g.beginPath();
      g.moveTo(xx, yy - 1.2);
      g.lineTo(xx, yy);
      g.stroke();
    }
  }
  if (crenel) for (let xx = x; xx < x + w - 0.5; xx += 2) box(g, xx, y - 1, 1.1, 1.05, tone(base, 0.3), LW);
  g.lineWidth = LW;
  g.strokeStyle = mx(base, OUT, 0.7);
  g.strokeRect(x, y, w, h);
}

/** Частокол из брёвен с заострёнными верхами. */
function palisade(g: G, x: number, y: number, w: number, h: number, base: string) {
  for (let xx = x; xx < x + w - 0.01; xx += 1) {
    const top = y + (Math.round(xx) % 2 ? 0.5 : 0);
    const gr = g.createLinearGradient(xx, 0, xx + 1, 0);
    gr.addColorStop(0, tone(base, 0.9));
    gr.addColorStop(0.5, base);
    gr.addColorStop(1, tone(base, -1.4));
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(xx, y + h);
    g.lineTo(xx, top + 0.6);
    g.lineTo(xx + 0.5, top);
    g.lineTo(xx + 1, top + 0.6);
    g.lineTo(xx + 1, y + h);
    g.fill();
    g.strokeStyle = rgba(OUT, 0.5);
    g.lineWidth = 0.15;
    g.stroke();
  }
  g.fillStyle = tone(base, -1.3);
  g.fillRect(x, y + h * 0.5, w, 0.35);
}

function cone(g: G, cx: number, baseY: number, halfW: number, c: string) {
  shapeLR(g, [[cx - halfW - 0.3, baseY], [cx, baseY - halfW * 1.25 - 0.8], [cx + halfW + 0.3, baseY]], c, LW);
}

function dome(g: G, cx: number, baseY: number, r: number, c: string) {
  g.beginPath();
  g.moveTo(cx - r, baseY);
  g.bezierCurveTo(cx - r, baseY - r * 1.2, cx - r * 0.2, baseY - r * 1.5, cx, baseY - r * 1.6);
  g.bezierCurveTo(cx + r * 0.2, baseY - r * 1.5, cx + r, baseY - r * 1.2, cx + r, baseY);
  g.closePath();
  const gr = g.createRadialGradient(cx - r * 0.4, baseY - r * 1.1, 0, cx, baseY - r * 0.6, r * 1.5);
  gr.addColorStop(0, tone(c, 1));
  gr.addColorStop(0.5, c);
  gr.addColorStop(1, tone(c, -1.2));
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = LW;
  g.strokeStyle = mx(c, OUT, 0.7);
  g.stroke();
  ball(g, cx, baseY - r * 1.6 - 0.4, 0.4, '#e8c04a');
}

function door(g: G, x: number, y: number, w: number, h: number) {
  g.fillStyle = '#2a1f18';
  g.beginPath();
  g.moveTo(x, y + h);
  g.lineTo(x, y + w / 2);
  g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
  g.lineTo(x + w, y + h);
  g.closePath();
  g.fill();
}

function windowLit(g: G, x: number, y: number) {
  g.fillStyle = '#f2c35a';
  g.fillRect(x, y, 0.6, 0.7);
}

function tower(g: G, x: number, topY: number, w: number, bottomY: number, t: Theme, seed: number, roof: boolean) {
  const h = bottomY - topY + 1;
  if (t.fort === 'wood') palisade(g, x, topY, w, h, t.stone);
  else stoneWall(g, x, topY, w, h, t.stone, seed, !roof);
  g.fillStyle = '#1e1712';
  g.fillRect(x + w / 2 - 0.3, topY + 1.8, 0.6, 1.2);
  if (roof) {
    const cx = x + w / 2;
    if (t.fort === 'sand' || t.fort === 'earth') dome(g, cx, topY, w / 2, t.fort === 'sand' ? tone(t.stone, 0.4) : t.roof2);
    else cone(g, cx, topY, w / 2, t.fort === 'wood' ? t.roof : t.roof2);
  }
}

function house(g: G, x: number, baseY: number, w: number, t: Theme, seed: number, big = false) {
  const wallC = t.wall;
  const bottom = baseY + 1;
  switch (t.house) {
    case 'gable': {
      const h = big ? 3 : 2;
      box(g, x, bottom - h, w, h, wallC, LW);
      if (w > 3 && hash2(x, baseY, seed) < 0.6) windowLit(g, x + w - 1.6, bottom - h + 0.7);
      door(g, x + 0.6, bottom - 1.4, 0.8, 1.4);
      shapeLR(g, [[x - 0.4, bottom - h], [x + w / 2, bottom - h - w / 2 - 0.4], [x + w + 0.4, bottom - h]], t.roof, LW);
      break;
    }
    case 'long': {
      box(g, x, bottom - 2, w, 2, wallC, LW);
      door(g, x + w / 2 - 0.4, bottom - 1.3, 0.8, 1.3);
      g.beginPath();
      g.moveTo(x - 1, bottom - 2);
      g.quadraticCurveTo(x + w / 2, bottom - 4.4, x + w + 1, bottom - 2);
      g.closePath();
      const gr = g.createLinearGradient(0, bottom - 4, 0, bottom - 2);
      gr.addColorStop(0, tone(t.roof, 0.7));
      gr.addColorStop(1, tone(t.roof, -0.6));
      g.fillStyle = gr;
      g.fill();
      g.lineWidth = LW;
      g.strokeStyle = mx(t.roof, OUT, 0.7);
      g.stroke();
      // Дёрн на крыше
      g.fillStyle = '#6b8a3a';
      g.beginPath();
      g.ellipse(x + w / 2, bottom - 3.4, w * 0.35, 0.35, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'yurt': {
      g.beginPath();
      g.moveTo(x, bottom);
      g.lineTo(x, bottom - 1.6);
      g.quadraticCurveTo(x + w / 2, bottom - 4.4, x + w, bottom - 1.6);
      g.lineTo(x + w, bottom);
      g.closePath();
      const gr = g.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, tone(wallC, 0.4));
      gr.addColorStop(0.5, wallC);
      gr.addColorStop(1, tone(wallC, -1.1));
      g.fillStyle = gr;
      g.fill();
      g.lineWidth = LW;
      g.strokeStyle = mx(wallC, OUT, 0.75);
      g.stroke();
      g.fillStyle = '#b0503a';
      g.fillRect(x, bottom - 1.5, w, 0.45);
      g.fillStyle = '#8a5a30';
      g.fillRect(x + w / 2 - 0.4, bottom - 1.1, 0.8, 1.1);
      break;
    }
    case 'flat': {
      const h = big ? 4 : 3;
      box(g, x, bottom - h, w, h, wallC, LW);
      g.fillStyle = tone(wallC, 0.9);
      g.fillRect(x - 0.2, bottom - h - 0.3, w + 0.4, 0.45);
      door(g, x + 0.6, bottom - 1.5, 0.9, 1.5);
      if (w > 3) {
        g.fillStyle = '#2a1f18';
        g.fillRect(x + w - 1.4, bottom - h + 0.9, 0.6, 0.8);
      }
      break;
    }
  }
}

function landmark(g: G, cx: number, baseY: number, t: Theme, seed: number) {
  switch (t.landmark) {
    case 'spire': {
      stoneWall(g, cx - 2.5, baseY - 7, 5, 8, t.wall, seed, false);
      g.fillStyle = '#2a1f18';
      g.beginPath();
      g.arc(cx, baseY - 4.4, 0.6, Math.PI, 0);
      g.fillRect(cx - 0.6, baseY - 4.4, 1.2, 1.3);
      g.fill();
      shapeLR(g, [[cx - 2.6, baseY - 7], [cx, baseY - 15], [cx + 2.6, baseY - 7]], t.roof2, LW);
      g.strokeStyle = '#e8c04a';
      g.lineWidth = 0.35;
      g.beginPath();
      g.moveTo(cx, baseY - 15);
      g.lineTo(cx, baseY - 17.2);
      g.moveTo(cx - 0.8, baseY - 16.4);
      g.lineTo(cx + 0.8, baseY - 16.4);
      g.stroke();
      break;
    }
    case 'stave': {
      box(g, cx - 2.5, baseY - 5, 5, 6, '#6a4a2a', LW);
      for (let tier = 0; tier < 3; tier++) {
        const y = baseY - 5 - tier * 3;
        const hw = 3.4 - tier;
        shapeLR(g, [[cx - hw - 0.4, y + 0.3], [cx - hw * 0.5, y - 1.6], [cx + hw * 0.5, y - 1.6], [cx + hw + 0.4, y + 0.3]], '#3a2a20', LW);
        if (tier < 2) box(g, cx - hw + 1, y - 2.6, 2 * hw - 2, 1, '#6a4a2a', LW);
      }
      g.strokeStyle = '#2a1f18';
      g.lineWidth = 0.4;
      g.beginPath();
      g.moveTo(cx, baseY - 11.5);
      g.lineTo(cx, baseY - 14.5);
      g.stroke();
      // Драконьи головы на коньках
      g.fillStyle = '#b04a32';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(cx + s * 3.6, baseY - 5.4, 0.5, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'palace': {
      stoneWall(g, cx - 3.5, baseY - 5, 7, 6, '#e6dcc4', seed, false);
      door(g, cx - 0.6, baseY - 1.6, 1.2, 2.6);
      dome(g, cx, baseY - 5, 3, t.roof2);
      break;
    }
    case 'mosque': {
      stoneWall(g, cx - 3.5, baseY - 4, 7, 5, t.wall, seed, false);
      door(g, cx - 0.6, baseY - 1.6, 1.2, 2.6);
      dome(g, cx, baseY - 4, 3, t.roof2);
      // Минарет
      box(g, cx + 4.6, baseY - 12, 1.9, 13, tone(t.wall, -0.2), LW);
      box(g, cx + 4.2, baseY - 9.4, 2.7, 0.6, tone(t.wall, -0.8), LW);
      shapeLR(g, [[cx + 4.5, baseY - 12], [cx + 5.55, baseY - 14], [cx + 6.6, baseY - 12]], t.roof2, LW);
      ball(g, cx + 5.55, baseY - 14.5, 0.35, '#e8c04a');
      break;
    }
  }
}

function banner(g: G, poleX: number, topY: number, poleLen: number, main: string, sec: string, w = 5, h = 3.2) {
  g.strokeStyle = '#3b2f25';
  g.lineWidth = 0.45;
  g.beginPath();
  g.moveTo(poleX, topY - 0.3);
  g.lineTo(poleX, topY + poleLen);
  g.stroke();
  ball(g, poleX, topY - 0.5, 0.4, '#e8c04a');
  g.beginPath();
  g.moveTo(poleX + 0.2, topY);
  g.bezierCurveTo(poleX + w * 0.4, topY - 0.5, poleX + w * 0.7, topY + 0.5, poleX + w, topY);
  g.lineTo(poleX + w - 0.6, topY + h / 2);
  g.lineTo(poleX + w, topY + h);
  g.bezierCurveTo(poleX + w * 0.7, topY + h + 0.5, poleX + w * 0.4, topY + h - 0.5, poleX + 0.2, topY + h);
  g.closePath();
  const gr = g.createLinearGradient(poleX, 0, poleX + w, 0);
  gr.addColorStop(0, tone(main, 0.6));
  gr.addColorStop(0.5, main);
  gr.addColorStop(1, tone(main, -0.8));
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = LW;
  g.strokeStyle = mx(main, OUT, 0.7);
  g.stroke();
  g.fillStyle = sec;
  g.fillRect(poleX + 1.2, topY + h * 0.35, w * 0.5, h * 0.3);
}

// ───────────────────────── поселения ─────────────────────────

export function drawTown(culture: FactionId, owner: FactionId): HTMLCanvasElement {
  const t = THEMES[culture];
  const f = FACTIONS[owner];
  const { c, g } = surface(30, 26, Q);
  const base = 24;
  landmark(g, 14.5, base - 9, t, 5);
  house(g, 5, base - 9, 4, t, 1, true);
  house(g, 20, base - 9, 4, t, 2, true);
  house(g, 9, base - 8, 3, t, 3);
  if (t.fort === 'wood') palisade(g, 3, base - 8, 23, 9, t.stone);
  else stoneWall(g, 3, base - 7, 23, 8, t.stone, 7, true);
  door(g, 12, base - 3.4, 5, 4.4);
  g.strokeStyle = 'rgba(90,80,70,0.8)';
  g.lineWidth = 0.25;
  for (let x = 13; x < 17; x += 1) {
    g.beginPath();
    g.moveTo(x, base - 1.4);
    g.lineTo(x, base + 1);
    g.stroke();
  }
  tower(g, 0, base - 11, 5, base, t, 11, true);
  tower(g, 24, base - 11, 5, base, t, 12, true);
  banner(g, 26.5, 1, 9, hex(f.color), hex(f.color2), 3.3, 2.6);
  return finish(c);
}

export function drawCastle(culture: FactionId, owner: FactionId): HTMLCanvasElement {
  const t = THEMES[culture];
  const f = FACTIONS[owner];
  const { c, g } = surface(24, 22, Q);
  const base = 20;
  if (t.fort === 'wood') {
    palisade(g, 8, base - 12, 7, 13, t.stone);
    cone(g, 11.5, base - 12, 4, t.roof);
  } else {
    stoneWall(g, 8, base - 13, 7, 14, t.fort === 'stone' ? tone(t.stone, 0.3) : t.stone, 21, t.fort === 'stone');
    g.fillStyle = '#1e1712';
    g.fillRect(11.2, base - 10, 0.6, 1.6);
    if (t.fort !== 'stone') dome(g, 11.5, base - 13, 3, t.roof2);
  }
  if (t.fort === 'wood') palisade(g, 2, base - 6, 19, 7, t.stone);
  else stoneWall(g, 2, base - 5, 19, 6, t.stone, 22, true);
  door(g, 10, base - 2.4, 3, 3.4);
  tower(g, 0, base - 9, 4, base, t, 23, t.fort !== 'stone');
  tower(g, 19, base - 9, 4, base, t, 24, t.fort !== 'stone');
  banner(g, 12.5, 1, 7, hex(f.color), hex(f.color2), 3.2, 2.4);
  return finish(c);
}

export function drawVillage(culture: FactionId, owner: FactionId): HTMLCanvasElement {
  const t = THEMES[culture];
  const f = FACTIONS[owner];
  const { c, g } = surface(22, 14, Q);
  const base = 12;
  // Поле с бороздами
  g.fillStyle = '#b8a44e';
  g.beginPath();
  g.ellipse(5, base + 1.2, 4.4, 0.9, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#d8c46a';
  g.lineWidth = 0.2;
  for (let x = 1.5; x < 9; x += 1) {
    g.beginPath();
    g.moveTo(x, base + 0.6);
    g.lineTo(x + 0.4, base + 1.8);
    g.stroke();
  }
  const vt = { ...t, wall: culture === 'aurelia' ? '#d9c9a0' : t.wall, roof: culture === 'aurelia' ? '#c9a34a' : t.roof };
  house(g, 7, base - 3, 4, vt, 33);
  house(g, 2, base - 1, 5, vt, 31);
  house(g, 11, base, 5, vt, 32);
  if (culture === 'sultanate') {
    g.strokeStyle = '#6b4a2a';
    g.lineWidth = 0.55;
    g.beginPath();
    g.moveTo(17.5, base + 0.8);
    g.quadraticCurveTo(18, base - 3, 17.6, base - 5.6);
    g.stroke();
    for (const [dx, dy] of [[-2.6, 1], [2.6, 1], [-1.8, -0.6], [1.9, -0.5]] as Pt[]) {
      g.strokeStyle = '#2e6a28';
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(17.6, base - 5.6);
      g.quadraticCurveTo(17.6 + dx * 0.5, base - 6.6, 17.6 + dx, base - 5.6 + dy);
      g.stroke();
      g.strokeStyle = '#5aa244';
      g.lineWidth = 0.45;
      g.stroke();
    }
  } else if (culture === 'horde') {
    g.strokeStyle = '#8a6a45';
    g.lineWidth = 0.4;
    for (const y of [base - 0.6, base + 0.8]) {
      g.beginPath();
      g.moveTo(15.5, y);
      g.lineTo(20.5, y);
      g.stroke();
    }
    for (const x of [16, 18, 20]) {
      g.beginPath();
      g.moveTo(x, base - 1.2);
      g.lineTo(x, base + 1.2);
      g.stroke();
    }
  } else {
    g.fillStyle = '#4a3520';
    g.fillRect(17.7, base - 3.5, 0.6, 4.4);
    ball(g, 18, base - 5.4, 2.1, culture === 'nordmark' ? '#2e4d33' : '#4d7a30');
  }
  banner(g, 20.3, 0.6, 5.5, hex(f.color), hex(f.color2), 2.6, 1.9);
  return finish(c);
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

// ───────────────────────── отряды ─────────────────────────

/** Конь сбоку (мордой вправо). frame — шаг. */
function horse(g: G, x: number, y: number, col: string, frame: 0 | 1, s = 1) {
  const dark = tone(col, -1.3);
  const leg = (hx: number, a: number, far: boolean) => {
    const top: Pt = [x + hx * s, y + 2 * s];
    const knee: Pt = [top[0] + Math.sin(a) * 2.4 * s, top[1] + 2.4 * s];
    const hoof: Pt = [knee[0] + Math.sin(a * 0.6) * 1.2 * s, knee[1] + 2.3 * s];
    g.strokeStyle = OUT;
    g.lineWidth = 1.4 * s;
    g.beginPath();
    g.moveTo(...top);
    g.lineTo(...knee);
    g.lineTo(...hoof);
    g.stroke();
    g.strokeStyle = far ? dark : col;
    g.lineWidth = 0.95 * s;
    g.stroke();
    g.fillStyle = '#2a2018';
    g.fillRect(hoof[0] - 0.5 * s, hoof[1] - 0.2 * s, 1.1 * s, 0.6 * s);
  };
  const sw = frame ? 0.45 : -0.1;
  leg(6.5, -sw, true);
  leg(-5.5, sw, true);
  // Хвост
  g.strokeStyle = '#2a1f18';
  g.lineWidth = 1.1 * s;
  g.beginPath();
  g.moveTo(x - 8 * s, y - 1 * s);
  g.quadraticCurveTo(x - 10.5 * s, y + 1 * s, x - 9.6 * s, y + 4.5 * s);
  g.stroke();
  // Туловище
  g.beginPath();
  g.ellipse(x, y, 8.4 * s, 3.4 * s, 0, 0, Math.PI * 2);
  const gr = g.createLinearGradient(x, y - 3.4 * s, x, y + 3.4 * s);
  gr.addColorStop(0, tone(col, 0.9));
  gr.addColorStop(0.45, col);
  gr.addColorStop(1, tone(col, -1.1));
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = LW;
  g.strokeStyle = mx(col, OUT, 0.7);
  g.stroke();
  // Шея и голова
  const neck: Pt[] = [[x + 5 * s, y - 2.6 * s], [x + 8.6 * s, y - 7.2 * s], [x + 10.6 * s, y - 6.4 * s], [x + 8.8 * s, y - 0.6 * s]];
  shapeLR(g, neck, col, LW);
  g.beginPath();
  g.moveTo(x + 8.3 * s, y - 7.6 * s);
  g.quadraticCurveTo(x + 12.4 * s, y - 6.6 * s, x + 13.2 * s, y - 4 * s);
  g.lineTo(x + 11.8 * s, y - 3.4 * s);
  g.quadraticCurveTo(x + 10.4 * s, y - 4.6 * s, x + 9.4 * s, y - 5 * s);
  g.closePath();
  const hg = g.createLinearGradient(x + 8 * s, y - 8 * s, x + 12 * s, y - 3 * s);
  hg.addColorStop(0, tone(col, 0.8));
  hg.addColorStop(1, tone(col, -0.6));
  g.fillStyle = hg;
  g.fill();
  g.stroke();
  g.fillStyle = '#1a1410';
  g.beginPath();
  g.arc(x + 10.5 * s, y - 6.2 * s, 0.3 * s, 0, Math.PI * 2);
  g.fill();
  // Грива
  g.strokeStyle = '#2a1f18';
  g.lineWidth = 0.7 * s;
  g.beginPath();
  g.moveTo(x + 8.4 * s, y - 7.8 * s);
  g.quadraticCurveTo(x + 6.6 * s, y - 5.4 * s, x + 5.2 * s, y - 2.8 * s);
  g.stroke();
  leg(7, sw, false);
  leg(-6, -sw, false);
}

/** Всадник со знаменем на карте, 2 кадра шага. banner=false — без знамени (разбойники). */
export function drawRider(main: string, sec: string, frame: 0 | 1, player: boolean, withBanner = true, horseCol = '#8a5a32'): HTMLCanvasElement {
  const { c, g } = surface(26, 25, Q);
  // Тень
  g.fillStyle = 'rgba(0,0,0,0.26)';
  g.beginPath();
  g.ellipse(13, 23.4, 10, 1.1, 0, 0, Math.PI * 2);
  g.fill();
  if (withBanner) banner(g, 16.2, 1.3, 16, main, sec, 5.6, 3.6);
  if (withBanner && player) {
    g.strokeStyle = '#e8c04a';
    g.lineWidth = 0.5;
    g.beginPath();
    g.moveTo(16.2, 5.2);
    g.lineTo(16.2, 17);
    g.stroke();
  }
  horse(g, 11, 15, horseCol, frame);
  // Попона
  shapeLR(g, [[7.2, 12.6], [14.6, 12.6], [14.2, 16.4], [7.6, 16.4]], main, LW);
  g.fillStyle = sec;
  g.fillRect(7.6, 15.4, 6.6, 0.7);
  // Всадник: нога, туловище, рука, голова, шлем
  g.strokeStyle = OUT;
  g.lineWidth = 1.7;
  g.beginPath();
  g.moveTo(11.2, 12.4);
  g.lineTo(12.6, 15.6);
  g.stroke();
  g.strokeStyle = tone(main, -1);
  g.lineWidth = 1.2;
  g.stroke();
  box(g, 12, 15.3, 1.6, 0.9, '#3a2a1e', LW);
  shapeLR(g, [[9.3, 12.8], [9.6, 8.6], [11.2, 7.6], [12.9, 8.6], [13.1, 12.8]], main, LW);
  g.fillStyle = sec;
  g.fillRect(10.8, 8.4, 0.8, 4.3);
  g.strokeStyle = OUT;
  g.lineWidth = 1.3;
  g.beginPath();
  g.moveTo(12.4, 9);
  g.lineTo(14.4, 10.8);
  g.lineTo(16, 9.4);
  g.stroke();
  g.strokeStyle = tone(main, -0.5);
  g.lineWidth = 0.85;
  g.stroke();
  ball(g, 11.5, 6.4, 1.55, '#e0b48a');
  g.beginPath();
  g.arc(11.4, 6.1, 1.75, Math.PI * 1.02, Math.PI * 1.98);
  g.closePath();
  const hg = g.createLinearGradient(9.6, 4.4, 13.2, 6);
  hg.addColorStop(0, '#dde2e8');
  hg.addColorStop(1, '#6a7078');
  g.fillStyle = hg;
  g.fill();
  g.lineWidth = LW;
  g.strokeStyle = '#3a3e44';
  g.stroke();
  return finish(c);
}

/** Пешая шайка разбойников: три фигуры в капюшонах. */
export function drawBandits(frame: 0 | 1, hood = '#5a2a22'): HTMLCanvasElement {
  const { c, g } = surface(26, 20, Q);
  g.fillStyle = 'rgba(0,0,0,0.24)';
  g.beginPath();
  g.ellipse(13, 19.2, 11, 0.9, 0, 0, Math.PI * 2);
  g.fill();
  const fig = (x: number, y: number, cloth: string, weapon: 'club' | 'bow' | 'axe', f: number) => {
    // Ноги
    const st = f ? 0.8 : -0.4;
    for (const [dx, k] of [[-0.7, st], [0.9, -st]] as Pt[]) {
      g.strokeStyle = OUT;
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x + dx, y + 7);
      g.lineTo(x + dx + k, y + 10.4);
      g.stroke();
      g.strokeStyle = tone(cloth, -0.8);
      g.lineWidth = 0.8;
      g.stroke();
      box(g, x + dx + k - 0.6, y + 10.1, 1.4, 0.8, '#3a2a1e', LW);
    }
    // Оружие за спиной или в руке
    g.lineWidth = 0.55;
    if (weapon === 'bow') {
      g.strokeStyle = '#7a5332';
      g.beginPath();
      g.arc(x + 2.6, y + 4.4, 3.8, -1.2, 1.2);
      g.stroke();
      g.strokeStyle = 'rgba(230,220,200,0.8)';
      g.lineWidth = 0.18;
      g.beginPath();
      g.moveTo(x + 2.6 + Math.cos(-1.2) * 3.8, y + 4.4 + Math.sin(-1.2) * 3.8);
      g.lineTo(x + 2.6 + Math.cos(1.2) * 3.8, y + 4.4 + Math.sin(1.2) * 3.8);
      g.stroke();
    } else {
      g.strokeStyle = '#7a5332';
      g.beginPath();
      g.moveTo(x + 2.8, y + 7);
      g.lineTo(x + 3.4, y + 1.6);
      g.stroke();
      if (weapon === 'club') ball(g, x + 3.5, y + 1.6, 0.95, '#5a3a22');
      else shapeLR(g, [[x + 3.3, y + 1.4], [x + 5, y + 0.8], [x + 5, y + 3.4], [x + 3.3, y + 2.8]], '#9aa0a8', LW);
    }
    // Туловище
    shapeLR(g, [[x - 1.6, y + 7.4], [x - 1.2, y + 3.4], [x + 0.4, y + 2.8], [x + 2, y + 3.4], [x + 2.2, y + 7.4]], cloth, LW);
    g.fillStyle = '#4a3220';
    g.fillRect(x - 1.4, y + 5.6, 3.5, 0.45);
    // Лицо и капюшон
    ball(g, x + 0.8, y + 2, 1.15, '#dcb08a');
    g.beginPath();
    g.moveTo(x - 1.4, y + 3.4);
    g.quadraticCurveTo(x - 1.6, y - 0.6, x + 0.6, y - 0.6);
    g.quadraticCurveTo(x + 2.2, y - 0.4, x + 2.1, y + 1.4);
    g.quadraticCurveTo(x + 0.8, y + 0.6, x + 0.2, y + 1.6);
    g.quadraticCurveTo(x - 0.1, y + 2.8, x + 0.4, y + 3.4);
    g.closePath();
    const hg = g.createLinearGradient(x - 1.6, y - 0.6, x + 2, y + 3);
    hg.addColorStop(0, tone(hood, 0.7));
    hg.addColorStop(1, tone(hood, -0.9));
    g.fillStyle = hg;
    g.fill();
    g.lineWidth = LW;
    g.strokeStyle = mx(hood, OUT, 0.7);
    g.stroke();
  };
  fig(3.5, 6, '#6a5a40', 'club', frame);
  fig(19, 5, '#5a4a3a', 'bow', frame ^ 1);
  fig(11, 8, '#7a6048', 'axe', frame);
  return finish(c);
}

/** Корабль (ког) для морских переходов. */
export function drawBoat(main: string, sec: string, frame: 0 | 1): HTMLCanvasElement {
  const { c, g } = surface(18, 16, Q);
  // Волны
  g.strokeStyle = 'rgba(210,235,248,0.85)';
  g.lineWidth = 0.45;
  const o = frame ? 0.8 : 0;
  for (const [x, y] of [[1.4 + o, 13.4], [12.6 + o, 13.6]] as Pt[]) {
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 1, y - 0.8, x + 2, y);
    g.quadraticCurveTo(x + 3, y - 0.8, x + 4, y);
    g.stroke();
  }
  // Мачта и парус
  g.strokeStyle = '#3b2f25';
  g.lineWidth = 0.5;
  g.beginPath();
  g.moveTo(8.5, 0.3);
  g.lineTo(8.5, 10);
  g.stroke();
  g.beginPath();
  g.moveTo(5.8, 1.4);
  g.quadraticCurveTo(8.5, 0.8, 11.4, 1.4);
  g.quadraticCurveTo(12.4, 4, 11.4, 6.8);
  g.quadraticCurveTo(8.5, 6.2, 5.8, 6.8);
  g.quadraticCurveTo(6.6, 4, 5.8, 1.4);
  g.closePath();
  const sg = g.createLinearGradient(5.8, 0, 12, 0);
  sg.addColorStop(0, tone(main, 0.7));
  sg.addColorStop(0.5, main);
  sg.addColorStop(1, tone(main, -0.9));
  g.fillStyle = sg;
  g.fill();
  g.lineWidth = LW;
  g.strokeStyle = mx(main, OUT, 0.7);
  g.stroke();
  g.fillStyle = sec;
  g.fillRect(8.1, 1.6, 0.8, 5);
  g.fillRect(6.4, 3.7, 4.6, 0.8);
  // Корпус
  g.beginPath();
  g.moveTo(1.6, 8.4);
  g.lineTo(16.4, 8.4);
  g.quadraticCurveTo(15.4, 11.8, 13, 12.2);
  g.lineTo(5, 12.2);
  g.quadraticCurveTo(2.6, 11.8, 1.6, 8.4);
  g.closePath();
  const hg = g.createLinearGradient(0, 8.4, 0, 12.2);
  hg.addColorStop(0, '#9a7045');
  hg.addColorStop(0.5, '#7a5535');
  hg.addColorStop(1, '#4a3220');
  g.fillStyle = hg;
  g.fill();
  g.lineWidth = LW;
  g.strokeStyle = OUT;
  g.stroke();
  g.strokeStyle = 'rgba(40,24,12,0.6)';
  g.lineWidth = 0.2;
  for (const y of [9.6, 10.8]) {
    g.beginPath();
    g.moveTo(2.4, y);
    g.lineTo(15.6, y);
    g.stroke();
  }
  return finish(c);
}

/** Лорд на карте: всадник с высоким раздвоенным штандартом и оруженосцем. */
export function drawLord(main: string, sec: string, frame: 0 | 1): HTMLCanvasElement {
  const { c, g } = surface(34, 34, Q);
  const squire = drawRider(tone(main, -0.9), sec, (frame ^ 1) as 0 | 1, false, false, '#6a4a2a');
  g.globalAlpha = 0.95;
  g.drawImage(squire, 0, 8, 20, 19);
  g.globalAlpha = 1;
  g.drawImage(drawRider(main, sec, frame, false, false), 7, 9, 26, 25);
  // Штандарт: древко, раздвоенное полотнище, золотое навершие
  const px = 19.2;
  g.strokeStyle = '#3b2f25';
  g.lineWidth = 0.55;
  g.beginPath();
  g.moveTo(px, 0.8);
  g.lineTo(px, 25);
  g.stroke();
  ball(g, px, 0.8, 0.6, '#e8c04a');
  g.beginPath();
  g.moveTo(px + 0.2, 2);
  g.bezierCurveTo(px + 4, 1.2, px + 8, 2.8, px + 12.5, 2);
  g.lineTo(px + 9.6, 5.4);
  g.lineTo(px + 12.5, 9);
  g.bezierCurveTo(px + 8, 9.8, px + 4, 8.4, px + 0.2, 9.4);
  g.closePath();
  const bg = g.createLinearGradient(px, 0, px + 12, 0);
  bg.addColorStop(0, tone(main, 0.6));
  bg.addColorStop(0.5, main);
  bg.addColorStop(1, tone(main, -0.8));
  g.fillStyle = bg;
  g.fill();
  g.lineWidth = LW;
  g.strokeStyle = mx(main, OUT, 0.7);
  g.stroke();
  g.fillStyle = sec;
  g.fillRect(px + 0.4, 4.9, 9, 1.2);
  ball(g, px + 4.5, 5.5, 1.3, sec);
  return finish(c);
}

/** Осадный лагерь: шатры, костёр, лестница. 2 кадра огня. */
export function drawCamp(frame: 0 | 1): HTMLCanvasElement {
  const { c, g } = surface(40, 22, Q);
  const tent = (x: number, y: number, w: number, col: string) => {
    shapeLR(g, [[x, y + w], [x + w, y], [x + 2 * w, y + w]], col, LW);
    g.fillStyle = '#2a1f18';
    g.beginPath();
    g.moveTo(x + w - 1, y + w);
    g.lineTo(x + w, y + w * 0.45);
    g.lineTo(x + w + 1, y + w);
    g.fill();
    g.strokeStyle = '#3b2f25';
    g.lineWidth = 0.4;
    g.beginPath();
    g.moveTo(x + w, y);
    g.lineTo(x + w, y - 3);
    g.stroke();
    g.fillStyle = '#c24040';
    g.beginPath();
    g.moveTo(x + w, y - 3);
    g.lineTo(x + w + 2.2, y - 2.4);
    g.lineTo(x + w, y - 1.8);
    g.fill();
  };
  tent(1, 6, 7, '#d8c8a0');
  tent(20, 4, 8, '#c8b48a');
  // Костёр
  const fx = 18;
  const fy = 18.5;
  g.strokeStyle = '#4a3520';
  g.lineWidth = 0.7;
  g.beginPath();
  g.moveTo(fx - 3, fy + 1);
  g.lineTo(fx + 3, fy + 0.2);
  g.moveTo(fx - 3, fy + 0.2);
  g.lineTo(fx + 3, fy + 1);
  g.stroke();
  const fl = (h: number, dx: number, col: string) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(fx - 1.6 + dx, fy + 0.4);
    g.quadraticCurveTo(fx - 1.8 + dx, fy - h * 0.5, fx + dx + (frame ? 0.4 : -0.4), fy - h);
    g.quadraticCurveTo(fx + 1.8 + dx, fy - h * 0.5, fx + 1.6 + dx, fy + 0.4);
    g.fill();
  };
  fl(3.8, 0, '#d04a20');
  fl(2.8, 0.2, '#f0a030');
  fl(1.6, 0.1, '#ffe07a');
  // Лестница
  g.strokeStyle = '#7a5332';
  g.lineWidth = 0.5;
  g.beginPath();
  g.moveTo(30, 17.5);
  g.lineTo(38.5, 13);
  g.moveTo(30.4, 18.5);
  g.lineTo(38.9, 14);
  g.stroke();
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    g.beginPath();
    g.moveTo(30.8 + t * 7.4, 17.3 - t * 4);
    g.lineTo(31.2 + t * 7.4, 18.3 - t * 4);
    g.stroke();
  }
  return finish(c);
}

/** Разорённая деревня: дым и тлеющие угли. */
export function drawSmoke(frame: 0 | 1): HTMLCanvasElement {
  const { c, g } = surface(22, 26, Q);
  const puffs = frame ? [[8, 3, 4], [12, 8, 5], [9, 14, 4], [13, 19, 3]] : [[10, 2, 4], [9, 8, 5], [12, 14, 4], [10, 19, 3]];
  for (const [cx, cy, r] of puffs) ball(g, cx, cy, r, '#77726b', -1, 1);
  for (const [x, y, col] of [[9, 23, '#ff8a3a'], [12, 24, '#ffd05a'], [14, 23, '#d04a20']] as [number, number, string][]) {
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, 0.7, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/** Мор над городом: тёмное облако миазмов и череп. */
export function drawPlague(frame: 0 | 1): HTMLCanvasElement {
  const { c, g } = surface(24, 22, Q);
  const puffs = frame ? [[6, 8, 5], [12, 6, 6], [18, 9, 5], [11, 12, 5]] : [[7, 9, 5], [12, 7, 6], [17, 8, 5], [12, 12, 5]];
  for (const [cx, cy, r] of puffs) ball(g, cx, cy, r, '#3a4a2e', -1, 0.8);
  // Череп
  ball(g, 11.5, 8.3, 3.2, '#e8e2cc', -0.8, 0.5);
  box(g, 9.6, 10.4, 3.8, 1.8, '#e8e2cc', LW);
  g.fillStyle = '#1a1410';
  for (const x of [10.2, 12.8]) {
    g.beginPath();
    g.ellipse(x, 8.4, 0.8, 0.95, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.moveTo(11.5, 9.4);
  g.lineTo(11, 10.5);
  g.lineTo(12, 10.5);
  g.fill();
  g.fillRect(10.4, 11.4, 0.3, 0.8);
  g.fillRect(11.4, 11.4, 0.3, 0.8);
  g.fillRect(12.4, 11.4, 0.3, 0.8);
  return outlined(c, OW * Q, '#141810');
}

/** Торговый караван: крытая повозка, лошадь и флажок державы (мордой вправо). */
export function drawCaravan(main: string, sec: string, frame: 0 | 1): HTMLCanvasElement {
  const { c, g } = surface(32, 22, Q);
  g.fillStyle = 'rgba(0,0,0,0.24)';
  g.beginPath();
  g.ellipse(16, 20.6, 14, 0.9, 0, 0, Math.PI * 2);
  g.fill();
  // Флажок
  g.strokeStyle = '#4a3220';
  g.lineWidth = 0.45;
  g.beginPath();
  g.moveTo(3.6, 0.4);
  g.lineTo(3.6, 7);
  g.stroke();
  g.fillStyle = main;
  g.beginPath();
  g.moveTo(3.4, 0.5);
  g.lineTo(0.4, 1.2);
  g.lineTo(3.4, 2.6);
  g.fill();
  g.fillStyle = sec;
  g.fillRect(2.4, 1.2, 1, 0.8);
  // Тент
  g.beginPath();
  g.moveTo(2.5, 12.8);
  g.bezierCurveTo(3, 3.6, 19.5, 3.6, 20, 12.8);
  g.closePath();
  const cg = g.createLinearGradient(0, 5, 0, 12.8);
  cg.addColorStop(0, '#f4ecd8');
  cg.addColorStop(1, '#c0b294');
  g.fillStyle = cg;
  g.fill();
  g.lineWidth = LW;
  g.strokeStyle = '#5a5040';
  g.stroke();
  g.strokeStyle = 'rgba(120,100,70,0.45)';
  g.lineWidth = 0.25;
  for (const x of [7, 11.2, 15.4]) {
    g.beginPath();
    g.moveTo(x, 12.6);
    g.quadraticCurveTo(x + (x - 11.2) * 0.1, 8, x + (x - 11.2) * 0.05, 6.4);
    g.stroke();
  }
  // Груз
  box(g, 0, 9, 2.4, 4, '#a07a48', LW);
  // Кузов
  box(g, 2.2, 12.6, 18.2, 2.2, '#7a5332', LW);
  // Колёса
  for (const wx of [5.5, 16.5]) {
    g.lineWidth = 1.5;
    g.strokeStyle = OUT;
    g.beginPath();
    g.arc(wx, 17.3, 2.4, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 0.9;
    g.strokeStyle = '#6a4424';
    g.stroke();
    g.lineWidth = 0.3;
    g.strokeStyle = '#8a6440';
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI + (frame ? 0.5 : 0);
      g.beginPath();
      g.moveTo(wx + Math.cos(a) * 2.2, 17.3 + Math.sin(a) * 2.2);
      g.lineTo(wx - Math.cos(a) * 2.2, 17.3 - Math.sin(a) * 2.2);
      g.stroke();
    }
  }
  // Оглобля и лошадь
  g.strokeStyle = '#4a3220';
  g.lineWidth = 0.5;
  g.beginPath();
  g.moveTo(20, 14);
  g.lineTo(23.5, 13.4);
  g.stroke();
  horse(g, 26, 12.2, '#8a5a32', frame, 0.52);
  return finish(c);
}

/** Корона над уделом игрока. */
export function drawCrown(): HTMLCanvasElement {
  const { c, g } = surface(13, 9, Q);
  g.beginPath();
  g.moveTo(0.4, 7.4);
  g.lineTo(0.3, 1);
  g.lineTo(3.2, 3.8);
  g.lineTo(6.5, 0.4);
  g.lineTo(9.8, 3.8);
  g.lineTo(12.7, 1);
  g.lineTo(12.6, 7.4);
  g.closePath();
  const gr = g.createLinearGradient(0, 0, 13, 9);
  gr.addColorStop(0, '#fff0a0');
  gr.addColorStop(0.4, '#ffd24a');
  gr.addColorStop(1, '#a8761a');
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = LW;
  g.strokeStyle = '#5a3a0a';
  g.stroke();
  box(g, 0.4, 5.6, 12.2, 1.8, '#c8962a', LW);
  ball(g, 6.5, 4, 0.8, '#c24040');
  for (const x of [3, 6.5, 10]) ball(g, x, 6.5, 0.5, '#3a6cc4');
  for (const [x, y] of [[0.3, 1], [6.5, 0.4], [12.7, 1]] as Pt[]) ball(g, x, y, 0.5, '#ffe68a');
  return outlined(c, OW * Q, '#1c1612');
}

// ───────────────────────── знамя державы ─────────────────────────

const EMBLEM_FIG: Record<string, string[]> = {
  eagle: ['..x.....x..', '.xxx.x.xxx.', 'xxxxxxxxxxx', 'x.xxxxxxx.x', '...xxxxx...', '...xx.xx...', '..x.....x..'],
  axe: ['.....X.....', '..xxxX.....', '.xxxxX.....', 'xxxxxX.....', '.xxxxX.....', '..xxxX.....', '.....X.....'],
  horse: ['.......xx..', '......xxxx.', 'x.xxxxxxx..', '.xxxxxxx...', '.xxxxxxx...', '.x.x..x.x..', '.x.x..x.x..'],
  crescent: ['...xxxx....', '..xx.......', '.xx.....x..', '.xx....xxx.', '.xx.....x..', '..xx.......', '...xxxx....'],
};

/** Путь геральдического щита 16×18. */
export function shieldPath(g: G) {
  g.beginPath();
  g.moveTo(1, 0.6);
  g.lineTo(15, 0.6);
  g.lineTo(15, 9.5);
  g.bezierCurveTo(15, 14, 11, 16.4, 8, 17.6);
  g.bezierCurveTo(5, 16.4, 1, 14, 1, 9.5);
  g.closePath();
}

/** Глянец и контур поверх щита. */
export function shieldFinish(g: G) {
  shieldPath(g);
  const gl = g.createLinearGradient(1, 0, 15, 18);
  gl.addColorStop(0, 'rgba(255,255,255,0.32)');
  gl.addColorStop(0.45, 'rgba(255,255,255,0)');
  gl.addColorStop(1, 'rgba(0,0,0,0.28)');
  g.fillStyle = gl;
  g.fill();
  g.lineWidth = 0.55;
  g.strokeStyle = '#1a1410';
  g.stroke();
}

/** Геральдический щит державы 16×18. */
export function drawEmblem(id: FactionId): HTMLCanvasElement {
  const f = FACTIONS[id];
  const { c, g } = surface(16, 18, Q);
  shieldPath(g);
  g.fillStyle = hex(f.color);
  g.fill();
  const sec = hex(f.color2);
  const fig = smoothGlyph(EMBLEM_FIG[f.emblem], { x: sec, X: tone(sec, -0.8) }, Q * 2);
  g.drawImage(fig, 2.5, 4, 11, 7);
  shieldFinish(g);
  return c;
}

/** Затемнить или осветлить цвет (для совместимости со старым кодом). */
export function shade(c: string, k: number): string {
  const [r, gg, b] = rgb(c);
  const f = (v: number) => (k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return hexOf([f(r), f(gg), f(b)]);
}

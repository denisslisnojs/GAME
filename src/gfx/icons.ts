import type { FactionId } from '../data/factions';
import { TROOPS } from '../data/troops';
import type { Settlement } from '../game/world';
import { hash2 } from '../util/rng';
import { Pix, shade } from './pixel';
import { drawCastle, drawEmblem, drawPortrait, drawTown, drawVillage } from './sprites';

const cache = new Map<string, string>();

function memo(key: string, make: () => HTMLCanvasElement): string {
  let v = cache.get(key);
  if (!v) {
    v = make().toDataURL();
    cache.set(key, v);
  }
  return v;
}

export function portraitURL(troopId: string): string {
  return memo(`p_${troopId}`, () => drawPortrait(TROOPS[troopId]));
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

/** Картинка-«витрина» поселения для окна поселения (пиксель-арт 128×56). */
export function vistaURL(s: Settlement, owner: FactionId): string {
  return memo(`v_${s.id}_${owner}`, () => {
    const W = 128;
    const H = 56;
    const P = new Pix(W, H);
    const sky = SKY[s.culture];
    const ground = GROUND[s.culture];
    // Небо полосами
    P.rect(0, 0, W, 12, sky[0]);
    P.rect(0, 12, W, 10, sky[1]);
    P.rect(0, 22, W, 12, sky[2]);
    // Облака
    for (let i = 0; i < 4; i++) {
      const cx = Math.floor(hash2(i, 1, s.cx) * W);
      const cy = 4 + Math.floor(hash2(i, 2, s.cy) * 12);
      P.rect(cx, cy, 12, 2, '#ffffff');
      P.rect(cx + 3, cy - 1, 6, 1, '#ffffff');
      P.rect(cx + 2, cy + 2, 9, 1, shade(sky[2], 0.3));
    }
    // Дальние холмы
    for (let x = 0; x < W; x++) {
      const hh = 6 + Math.round(Math.sin(x * 0.09 + s.cx) * 3 + Math.sin(x * 0.23 + s.cy) * 2);
      P.vline(x, 34 - hh, 34, shade(ground[2], 0.15));
    }
    P.rect(0, 34, W, H - 34, ground[0]);
    for (let y = 34; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const r = hash2(x, y, 99);
        if (r < 0.12) P.p(x, y, ground[1]);
        else if (r > 0.97) P.p(x, y, ground[2]);
      }
    }
    // Дорога к воротам
    for (let y = 44; y < H; y++) {
      const w = 3 + Math.floor((y - 44) / 2);
      P.hline(64 - w, 64 + w, y, s.culture === 'sultanate' ? '#c9a060' : '#a08a60');
    }
    // Само поселение
    const spr = s.type === 'town' ? drawTown(s.culture, owner) : s.type === 'castle' ? drawCastle(s.culture, owner) : drawVillage(s.culture, owner);
    const ctx = P.canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    if (s.type === 'village') {
      // Деревня мелкая: показываем крупнее, с полями вокруг
      for (let i = 0; i < 3; i++) {
        const fx = 14 + i * 34;
        for (let y = 46; y < 54; y++) P.hline(fx, fx + 22, y, y % 2 ? '#c9b35a' : '#a8983f');
      }
      ctx.drawImage(spr, Math.floor(64 - spr.width), 47 - spr.height * 2, spr.width * 2, spr.height * 2);
    } else {
      ctx.drawImage(spr, Math.floor(64 - spr.width / 2), 45 - spr.height);
    }
    // Деревья по бокам
    for (let i = 0; i < 6; i++) {
      const x = i < 3 ? 8 + i * 12 + Math.floor(hash2(i, 5, s.cx) * 6) : 84 + (i - 3) * 13 + Math.floor(hash2(i, 6, s.cy) * 6);
      const y = 42 + Math.floor(hash2(i, 7, s.cx) * 8);
      const trunk = '#4a3520';
      if (s.culture === 'sultanate') {
        P.vline(x, y - 7, y, '#6b4a2a');
        P.hline(x - 3, x + 3, y - 8, '#3b7f30');
        P.p(x - 4, y - 7, '#3b7f30');
        P.p(x + 4, y - 7, '#3b7f30');
        P.p(x, y - 9, '#5aa244');
      } else if (s.culture === 'horde') {
        P.rect(x - 1, y - 1, 3, 2, '#7c7a45');
      } else {
        P.vline(x, y - 2, y, trunk);
        const c = s.culture === 'nordmark' ? '#2e4d33' : '#3d6a29';
        for (let r = 0; r < 6; r++) P.hline(x - Math.floor(r / 2), x + Math.floor(r / 2), y - 8 + r, r % 2 ? shade(c, -0.2) : c);
      }
    }
    return P.canvas;
  });
}

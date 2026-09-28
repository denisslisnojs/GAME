// Чёрная смерть: летом 1347 года мор приходит из Азака (Таны) и ползёт по торговым городам.
// Заражённый город теряет гарнизон и рекрутов, отряд рядом с ним — людей.

import { TILE } from '../config';
import { TROOPS } from '../data/troops';
import { mulberry32 } from '../util/rng';
import { dismiss } from './logic';
import type { GameState } from './state';
import { news, placeName } from './war';
import { world, type Settlement } from './world';

export interface PlagueState {
  /** id крепости → день, когда мор утихнет. */
  infected: Record<string, number>;
  /** Где мор уже прошёл (второй раз не приходит). */
  done: string[];
  started: boolean;
}

/** День начала — начало июня 1347 года. */
export const PLAGUE_START = 95;
const ORIGIN = 'azak';

/** В поселении (или в крепости, к которой приписана деревня) мор. */
export function isPlagued(state: GameState, s: Settlement): boolean {
  const id = s.type === 'village' ? s.parent ?? s.id : s.id;
  return (state.plague?.infected[id] ?? 0) > state.time;
}

export function plagueDaily(state: GameState): string[] {
  const out: string[] = [];
  if (state.time < PLAGUE_START) return out;
  const pl = (state.plague ??= { infected: {}, done: [], started: false });
  const r = mulberry32(Math.floor(state.time) * 4099 + 17);
  if (!pl.started) {
    pl.started = true;
    pl.infected[ORIGIN] = state.time + 40;
    pl.infected.constantinople = state.time + 45;
    news(state, 'Генуэзские галеры из Таны привезли мор в Константинополь.', 'war');
    news(state, 'В Азаке, у устья Дона, люди падают замертво: чёрные бубоны, жар и кровавый кашель. Генуэзские галеры бегут из порта…', 'war');
  }
  const forts = world.settlements.filter((s) => s.type !== 'village');
  // Распространение по торговым путям: города заражаются охотнее замков
  for (const [id, until] of Object.entries(pl.infected)) {
    if (until <= state.time) continue;
    const src = world.byId.get(id)!;
    for (const s of forts) {
      if (s.id === id || pl.infected[s.id] || pl.done.includes(s.id)) continue;
      // Только соседи в ~12° пути: мор идёт от города к городу цепочкой, как в 1347–1351 годах
      const d = Math.hypot(s.cx - src.cx, s.cy - src.cy);
      const k = (s.type === 'town' ? 1 : 0.4) * (src.type === 'town' ? 1 : 0.7);
      // Сухим путём — к соседям; на кораблях купцов — изредка между дальними городами
      const land = d < 60 ? 0.03 * k * (1 - d / 60) : 0;
      const sea = s.type === 'town' && src.type === 'town' && d < 160 ? 0.001 : 0;
      if (r() < land + sea) {
        pl.infected[s.id] = state.time + 30 + r() * 15;
        news(state, `Чёрная смерть пришла в ${placeName(s)}.`, 'war');
      }
    }
  }
  // Последствия и затухание
  for (const [id, until] of Object.entries(pl.infected)) {
    const s = world.byId.get(id)!;
    if (until <= state.time) {
      delete pl.infected[id];
      pl.done.push(id);
      if (s.type === 'town') news(state, `Мор в ${s.name} утих. Живые хоронят мёртвых.`, 'info');
      continue;
    }
    const g = state.war?.garrisons[id];
    if (g) for (const t of g) t.count = Math.max(0, t.count - (r() < t.count * 0.03 ? 1 : 0));
    for (const sid of [id, ...s.villages]) {
      const rec = state.settlements[sid].recruits;
      for (const k of Object.keys(rec)) rec[k] = Math.floor(rec[k] * 0.7);
    }
  }
  // Отряд героя рядом с заражённым городом
  let near: Settlement | null = null;
  for (const id of Object.keys(pl.infected)) {
    const s = world.byId.get(id)!;
    if (Math.hypot(s.x - state.party.x, s.y - state.party.y) / TILE < 4) near = s;
  }
  if (near) {
    let died = 0;
    for (const t of [...state.party.troops]) {
      let n = 0;
      for (let i = 0; i < t.count; i++) if (r() < 0.035 / Math.sqrt(TROOPS[t.id].tier)) n++;
      if (n) dismiss(state, t.id, n);
      died += n;
    }
    if (died) out.push(`Отряд стоит у заражённого города (${near.name}): от мора умерло ${died}. Уходите!`);
  }
  return out;
}

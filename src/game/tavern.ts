// Таверна: наёмные отряды, слухи и игра в кости.

import { COMPANION_BY_ID } from '../data/companions';
import { TROOPS } from '../data/troops';
import { addTroops } from './logic';
import type { GameState } from './state';
import { world, type Settlement } from './world';

/** Какие наёмники водятся в тавернах разных держав. */
const MERC_POOL: Record<string, string[]> = {
  aurelia: ['merc_genoese', 'merc_swiss', 'merc_almogavar', 'merc_knight'],
  nordmark: ['merc_varangian', 'merc_swiss', 'merc_knight'],
  horde: ['merc_turcopole', 'merc_genoese', 'merc_varangian'],
  sultanate: ['merc_turcopole', 'merc_almogavar', 'merc_varangian', 'merc_genoese'],
};

export interface MercOffer {
  id: string;
  count: number;
  /** Когда предложение обновится. */
  until: number;
}

export function mercsAt(state: GameState, s: Settlement): MercOffer {
  state.mercs ??= {};
  let m = state.mercs[s.id];
  if (!m || m.until <= state.time) {
    const pool = MERC_POOL[s.culture] ?? MERC_POOL.aurelia;
    const id = pool[Math.floor(Math.random() * pool.length)];
    const tier = TROOPS[id].tier;
    m = { id, count: tier >= 4 ? 2 + Math.floor(Math.random() * 3) : 4 + Math.floor(Math.random() * 5), until: Math.floor(state.time) + 7 };
    state.mercs[s.id] = m;
  }
  return m;
}

export function hireMercs(state: GameState, s: Settlement, n: number): number {
  const m = mercsAt(state, s);
  const price = TROOPS[m.id].hireCost;
  const k = Math.min(n, m.count, Math.floor(state.gold / price));
  if (k <= 0) return 0;
  m.count -= k;
  state.gold -= k * price;
  addTroops(state, m.id, k);
  return k;
}

/** Слухи о спутниках в других городах. */
export function companionRumors(state: GameState, s: Settlement): string[] {
  const out: string[] = [];
  for (const cs of state.companions ?? []) {
    if (cs.where === 'party' || cs.where === s.id) continue;
    const town = world.byId.get(cs.where);
    const def = COMPANION_BY_ID[cs.id];
    if (!town || !def) continue;
    out.push(`Говорят, в таверне города ${town.name} сидит ${def.name} (${def.title}) и ищет службы.`);
  }
  return out;
}

// ───────────────────────── кости ─────────────────────────

export const DICE_ROUNDS_PER_DAY = 6;

export function diceLeft(state: GameState): number {
  const d = state.dice;
  if (!d || d.day !== Math.floor(state.time)) return DICE_ROUNDS_PER_DAY;
  return Math.max(0, DICE_ROUNDS_PER_DAY - d.n);
}

/** Бросок трёх костей против кабацкого игрока: у кого больше сумма, тот и забирает ставку. */
export function rollDice(state: GameState, bet: number): { me: number[]; them: number[]; win: -1 | 0 | 1 } | null {
  if (diceLeft(state) <= 0 || state.gold < bet) return null;
  const day = Math.floor(state.time);
  state.dice = state.dice?.day === day ? { day, n: state.dice.n + 1 } : { day, n: 1 };
  const roll = () => [0, 0, 0].map(() => 1 + Math.floor(Math.random() * 6));
  const me = roll();
  const them = roll();
  const a = me.reduce((x, y) => x + y, 0);
  const b = them.reduce((x, y) => x + y, 0);
  const win = a > b ? 1 : a < b ? -1 : 0;
  state.gold += win * bet;
  return { me, them, win };
}

import type { FactionId } from '../data/factions';
import { GOODS, SELL_RATIO, type GoodId } from '../data/goods';
import { TROOPS } from '../data/troops';
import { recruitSlots, type GameState } from './state';
import { world, type Settlement } from './world';

export type Relation = 'own' | 'peace' | 'war';

export function atWar(state: GameState, a: FactionId, b: FactionId): boolean {
  return state.wars.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

export function ownerOf(state: GameState, s: Settlement): FactionId {
  return state.settlements[s.id].owner;
}

export function relationTo(state: GameState, s: Settlement): Relation {
  const owner = ownerOf(state, s);
  if (owner === state.hero.faction) return 'own';
  return atWar(state, owner, state.hero.faction) ? 'war' : 'peace';
}

export function partySize(state: GameState): number {
  return state.party.troops.reduce((n, t) => n + t.count, 0);
}

/** Цена найма: в чужих (мирных) землях дороже. */
export function hirePrice(state: GameState, s: Settlement, troopId: string): number {
  const base = TROOPS[troopId].hireCost;
  return relationTo(state, s) === 'own' ? base : Math.round(base * 1.5);
}

export function addTroops(state: GameState, id: string, count: number) {
  const stack = state.party.troops.find((t) => t.id === id);
  if (stack) stack.count += count;
  else state.party.troops.push({ id, count, xp: 0 });
}

export function hire(state: GameState, s: Settlement, troopId: string, count: number): number {
  const st = state.settlements[s.id];
  const avail = Math.floor(st.recruits[troopId] ?? 0);
  const price = hirePrice(state, s, troopId);
  const n = Math.min(count, avail, Math.floor(state.gold / price));
  if (n <= 0) return 0;
  st.recruits[troopId] = (st.recruits[troopId] ?? 0) - n;
  state.gold -= n * price;
  addTroops(state, troopId, n);
  return n;
}

export function dismiss(state: GameState, troopId: string, count: number) {
  const stack = state.party.troops.find((t) => t.id === troopId);
  if (!stack) return;
  stack.count -= Math.min(count, stack.count);
  if (stack.count <= 0) state.party.troops = state.party.troops.filter((t) => t !== stack);
}

export function buyPrice(g: GoodId): number {
  return GOODS[g].price;
}

export function sellPrice(g: GoodId): number {
  return Math.floor(GOODS[g].price * SELL_RATIO);
}

export function buy(state: GameState, g: GoodId, n: number): number {
  const k = Math.min(n, Math.floor(state.gold / buyPrice(g)));
  if (k <= 0) return 0;
  state.gold -= k * buyPrice(g);
  state.cargo[g] = (state.cargo[g] ?? 0) + k;
  return k;
}

export function sell(state: GameState, g: GoodId, n: number): number {
  const k = Math.min(n, state.cargo[g] ?? 0);
  if (k <= 0) return 0;
  state.gold += k * sellPrice(g);
  state.cargo[g] = (state.cargo[g] ?? 0) - k;
  if (!state.cargo[g]) delete state.cargo[g];
  return k;
}

export function cargoCount(state: GameState): number {
  return Object.values(state.cargo).reduce((a, b) => a + (b ?? 0), 0);
}

/** Выполняется при наступлении каждого нового дня. */
export function dailyTick(state: GameState) {
  for (const s of world.settlements) {
    const st = state.settlements[s.id];
    for (const slot of recruitSlots(s)) {
      const cur = st.recruits[slot.id] ?? 0;
      st.recruits[slot.id] = Math.min(slot.max, cur + slot.perDay * (0.6 + Math.random() * 0.8));
    }
  }
}

/** Может ли игрок войти в поселение. */
export function canEnter(state: GameState, s: Settlement): boolean {
  return relationTo(state, s) !== 'war';
}

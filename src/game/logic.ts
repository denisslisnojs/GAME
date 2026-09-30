import type { FactionId } from '../data/factions';
import { GOODS, SELL_RATIO, type GoodId } from '../data/goods';
import { TROOPS, type TroopDef } from '../data/troops';
import { heroStats } from './hero';
import { commandersBonus, partySkill } from './companions';
import { recruitSlots, type GameState } from './state';
import { world, type Settlement } from './world';
import { tr } from '../i18n';

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

/** Из чего складывается предел отряда: основа, уровень героя, Лидерство и спутники-командиры. */
export function partyLimitParts(state: GameState) {
  const lead = state.hero.attrs?.lead ?? 3;
  // Уровни героя выше 25-го места уже не добавляют
  return { base: 12, level: Math.min(state.hero.level, 25) * 2, lead: lead * 3, command: commandersBonus(state) };
}

/** Сколько воинов может вести герой (сам герой и спутники не в счёт). */
export function partyLimit(state: GameState): number {
  const p = partyLimitParts(state);
  return p.base + p.level + p.lead + p.command;
}

/** Сколько ещё воинов поместится в отряд. */
export function partyRoom(state: GameState): number {
  return Math.max(0, partyLimit(state) - partySize(state));
}

// ───────────────────────── жалованье ─────────────────────────

const WAGE_BY_TIER = [0, 1, 2, 5, 10];

/** Недельное жалованье воина: новобранцы почти даром, ветераны и конница дорого. */
export function troopWage(t: TroopDef): number {
  const base = WAGE_BY_TIER[Math.max(1, Math.min(4, t.tier))];
  return t.line === 'cavalry' ? Math.round(base * 1.5) : base;
}

/** Жалованье всего отряда за неделю; Лидерство даёт ту же скидку, что и на найм. */
export function partyWages(state: GameState): number {
  const raw = state.party.troops.reduce((n, s) => n + (TROOPS[s.id] ? troopWage(TROOPS[s.id]) * s.count : 0), 0);
  return Math.round(raw * (1 - heroStats(state.hero).hireDiscount));
}

/** Воскресенье: платим воинам. Если денег не хватает, часть неоплаченных воинов уходит. */
export function troopsWeekly(state: GameState): string[] {
  const day = state.lastDay;
  const total = partyWages(state);
  const out: string[] = [];
  if (day % 7 === 6 && total > state.gold) out.push(tr`Завтра жалованье воинам: ${total} ¤, а в казне ${state.gold} ¤. Не заплатите — часть отряда разбежится.`);
  if (day % 7 !== 0 || total <= 0) return out;
  if (state.gold >= total) {
    state.gold -= total;
    out.push(tr`Воинам выплачено жалованье: ${total} ¤.`);
    return out;
  }
  const unpaid = 1 - state.gold / total;
  state.gold = 0;
  let gone = 0;
  for (const s of state.party.troops) {
    const k = Math.min(s.count, Math.round(s.count * unpaid * 0.3));
    s.count -= k;
    gone += k;
  }
  state.party.troops = state.party.troops.filter((s) => s.count > 0);
  out.push(gone ? tr`Жалованье не выплачено сполна, и часть воинов ушла. Ушло: ${gone}.` : tr`Жалованье не выплачено сполна — воины ропщут.`);
  return out;
}

/** Цена найма: в чужих (мирных) землях дороже. */
export function hirePrice(state: GameState, s: Settlement, troopId: string): number {
  const base = TROOPS[troopId].hireCost * (1 - heroStats(state.hero).hireDiscount);
  return Math.max(1, Math.round(relationTo(state, s) === 'own' ? base : base * 1.5));
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
  const n = Math.min(count, avail, Math.floor(state.gold / price), partyRoom(state));
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

/** Цена покупки с учётом умения «Торговля». */
export function buyPrice(g: GoodId, state?: GameState): number {
  const k = state ? 1 - partySkill(state, 'trade') * 0.03 : 1;
  return Math.max(1, Math.round(GOODS[g].price * k));
}

export function sellPrice(g: GoodId, state?: GameState): number {
  const k = state ? 1 + partySkill(state, 'trade') * 0.03 : 1;
  return Math.floor(GOODS[g].price * SELL_RATIO * k);
}

export function buy(state: GameState, g: GoodId, n: number): number {
  const k = Math.min(n, Math.floor(state.gold / buyPrice(g, state)));
  if (k <= 0) return 0;
  state.gold -= k * buyPrice(g, state);
  state.cargo[g] = (state.cargo[g] ?? 0) + k;
  return k;
}

export function sell(state: GameState, g: GoodId, n: number): number {
  const k = Math.min(n, state.cargo[g] ?? 0);
  if (k <= 0) return 0;
  state.gold += k * sellPrice(g, state);
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
    if ((state.war?.looted[s.id] ?? 0) > state.time) continue; // разорённая деревня не даёт рекрутов
    if ((state.plague?.infected[s.type === 'village' ? s.parent ?? s.id : s.id] ?? 0) > state.time) continue; // мор
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

// ───────────────────────── повышение воинов ─────────────────────────

/** Сколько воинов стека набрали опыт для повышения. */
export function readyToUpgrade(stack: { id: string; count: number; xp: number }): number {
  const t = TROOPS[stack.id];
  if (!t.upgradesTo.length || !t.xpToUpgrade) return 0;
  return Math.min(stack.count, Math.floor(stack.xp / t.xpToUpgrade));
}

/** Всего воинов в отряде, готовых к повышению. */
export function totalReady(state: GameState): number {
  return state.party.troops.reduce((s, t) => s + readyToUpgrade(t), 0);
}

/** Повысить до n воинов стека fromId в toId. Возвращает, сколько повышено. */
export function upgrade(state: GameState, fromId: string, toId: string, n: number): number {
  const stack = state.party.troops.find((t) => t.id === fromId);
  const t = TROOPS[fromId];
  if (!stack || !t.upgradesTo.includes(toId)) return 0;
  const k = Math.min(n, readyToUpgrade(stack), Math.floor(state.gold / Math.max(1, t.upgradeCost)));
  if (k <= 0) return 0;
  stack.count -= k;
  stack.xp -= k * t.xpToUpgrade;
  state.gold -= k * t.upgradeCost;
  (state.flags ??= {}).upgraded = true;
  // Повышенные встают в строй прямо над своим прежним отрядом (порядок = очерёдность выхода в бой)
  const at = state.party.troops.indexOf(stack);
  if (!state.party.troops.some((x) => x.id === toId)) state.party.troops.splice(at, 0, { id: toId, count: 0, xp: 0 });
  if (stack.count <= 0) state.party.troops = state.party.troops.filter((x) => x !== stack);
  else stack.xp = Math.min(stack.xp, stack.count * t.xpToUpgrade * 2);
  addTroops(state, toId, k);
  return k;
}

/** Порядок отряда: сдвинуть стек выше (−1) или ниже (+1). Верхние выходят в бой первыми. */
export function moveStack(state: GameState, id: string, dir: -1 | 1) {
  const list = state.party.troops;
  const i = list.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
}

/** Упорядочить отряд: по уровню (сильнейшие первыми) или по роду войск (пехота, стрелки, конница). */
export function sortParty(state: GameState, by: 'tier' | 'line') {
  const line = (id: string) => {
    const t = TROOPS[id];
    return t.line === 'cavalry' ? 2 : t.role === 'ranged' ? 1 : 0;
  };
  state.party.troops.sort((a, b) =>
    by === 'tier'
      ? TROOPS[b.id].tier - TROOPS[a.id].tier || line(a.id) - line(b.id)
      : line(a.id) - line(b.id) || TROOPS[b.id].tier - TROOPS[a.id].tier,
  );
}

import type { Battle } from '../battle/sim';
import { FACTIONS } from '../data/factions';
import type { GoodId } from '../data/goods';
import { ITEM_LIST } from '../data/items';
import { TROOPS } from '../data/troops';
import { dismiss } from './logic';
import { KIND_INFO, removeParty, type MapParty } from './parties';
import type { GameState } from './state';
import { spawnPointNear, world } from './world';

export interface AppliedResult {
  won: boolean;
  heroWounded: boolean;
  ourLosses: { id: string; killed: number; wounded: number }[];
  enemyKilled: number;
  enemyTotal: number;
  gold: number;
  goods: Partial<Record<GoodId, number>>;
  heroXp: number;
  levelUp: number;
  troopXp: number;
  lostGold: number;
  respawnAt?: string;
  /** Трофейное снаряжение (id предметов). */
  items: string[];
}

export function heroXpToLevel(level: number) {
  return 120 * level;
}

export function applyBattle(state: GameState, battle: Battle, party: MapParty): AppliedResult {
  const won = battle.winner === battle.playerSide;
  const ours = battle.summary(battle.playerSide);
  const theirs = battle.summary(battle.playerSide === 0 ? 1 : 0);

  // Наши потери: часть павших — лишь ранены и остаются в отряде
  const ourLosses: AppliedResult['ourLosses'] = [];
  let troopXp = 0;
  for (const [id, s] of ours.stacks) {
    let killed = 0;
    for (let i = 0; i < s.dead; i++) if (Math.random() < 0.62) killed++;
    const wounded = s.dead - killed;
    if (s.dead) ourLosses.push({ id, killed, wounded });
    if (killed) dismiss(state, id, killed);
    const stack = state.party.troops.find((t) => t.id === id);
    const gain = Math.round(s.xp + (won ? 8 * s.survived : 0));
    if (stack) stack.xp += gain;
    troopXp += gain;
  }

  // Потери врага
  let enemyKilled = 0;
  let enemyTotal = 0;
  let enemyTierSum = 0;
  for (const [id, s] of theirs.stacks) {
    enemyKilled += s.dead;
    enemyTotal += s.dead + s.survived;
    enemyTierSum += s.dead * TROOPS[id].tier;
    const t = party.troops.find((x) => x.id === id);
    if (t) t.count -= s.dead;
  }
  party.troops = party.troops.filter((t) => t.count > 0);

  const res: AppliedResult = {
    won,
    heroWounded: ours.heroDead,
    ourLosses,
    enemyKilled,
    enemyTotal,
    gold: 0,
    goods: {},
    heroXp: 0,
    levelUp: 0,
    troopXp,
    lostGold: 0,
    items: [],
  };
  state.stats ??= { won: 0, lost: 0, killed: 0 };
  state.stats.killed += enemyKilled;

  if (won) {
    state.stats.won++;
    res.gold = party.gold + Math.round(enemyTierSum * (5 + Math.random() * 7));
    res.goods = { ...party.loot };
    if (party.kind === 'patrol' || party.kind === 'deserters') {
      const g: GoodId = Math.random() < 0.5 ? 'iron' : 'leather';
      res.goods[g] = (res.goods[g] ?? 0) + 1 + Math.floor(enemyKilled / 4);
    }
    state.gold += res.gold;
    // Трофейное снаряжение
    const chance: Record<string, number> = { bandits: 0.14, raiders: 0.2, desert: 0.22, pirates: 0.16, deserters: 0.35, patrol: 0.45 };
    const capTier: Record<string, number> = { bandits: 2, raiders: 3, desert: 3, pirates: 2, deserters: 3, patrol: 4 };
    const tries = 1 + Math.floor(enemyKilled / 12);
    for (let i = 0; i < tries; i++) {
      if (Math.random() > (chance[party.kind] ?? 0.1)) continue;
      const culture = party.faction === 'outlaw' ? null : party.faction;
      const pool = ITEM_LIST.filter((it) => it.tier <= (capTier[party.kind] ?? 2) && it.tier >= 1 && (it.cultures === 'all' || !culture || it.cultures.includes(culture)));
      const it = pool[Math.floor(Math.random() * pool.length)];
      if (it) {
        res.items.push(it.id);
        (state.hero.bag ??= []).push(it.id);
      }
    }
    for (const [g, n] of Object.entries(res.goods) as [GoodId, number][]) state.cargo[g] = (state.cargo[g] ?? 0) + n;
    removeParty(state, party.id);
  } else {
    state.stats.lost++;
    res.lostGold = Math.floor(state.gold * 0.25);
    state.gold -= res.lostGold;
    party.calmUntil = state.time + 1.5;
    // Отступаем к ближайшему своему городу или замку
    const own = world.settlements.filter((s) => s.type !== 'village' && state.settlements[s.id].owner === state.hero.faction);
    const pool = own.length ? own : world.settlements.filter((s) => s.type !== 'village');
    let best = pool[0];
    let bestD = Infinity;
    for (const s of pool) {
      const d = Math.hypot(s.x - state.party.x, s.y - state.party.y);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    const p = spawnPointNear(best);
    state.party.x = p.x;
    state.party.y = p.y;
    res.respawnAt = best.name;
    state.time += 1; // день на отступление и перевязку ран
  }

  // Опыт героя
  res.heroXp = Math.round(enemyTierSum * 9 + (won ? 20 : 5));
  state.hero.xp += res.heroXp;
  while (state.hero.xp >= heroXpToLevel(state.hero.level)) {
    state.hero.xp -= heroXpToLevel(state.hero.level);
    state.hero.level++;
    state.hero.points = (state.hero.points ?? 0) + 2;
    res.levelUp++;
  }
  return res;
}

/** Отступление при встрече. Быстрый враг отрезает арьергард. */
export function retreat(state: GameState, party: MapParty): { lost: { id: string; n: number }[] } {
  const lost: { id: string; n: number }[] = [];
  const fast = KIND_INFO[party.kind].speed > 18;
  if (fast) {
    const total = state.party.troops.reduce((s, t) => s + t.count, 0);
    let toLose = Math.max(total > 3 ? 1 : 0, Math.round(total * (0.08 + Math.random() * 0.1)));
    const byTier = [...state.party.troops].sort((a, b) => TROOPS[a.id].tier - TROOPS[b.id].tier);
    for (const t of byTier) {
      if (toLose <= 0) break;
      const n = Math.min(t.count, toLose);
      dismiss(state, t.id, n);
      lost.push({ id: t.id, n });
      toLose -= n;
    }
  }
  party.calmUntil = state.time + 0.5;
  return { lost };
}

export function enemyDisplayColor(p: MapParty): string {
  return p.faction === 'outlaw' ? '#c8704a' : FACTIONS[p.faction].css;
}

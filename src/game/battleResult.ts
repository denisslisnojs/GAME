import type { Battle } from '../battle/sim';
import { FACTIONS, type FactionId } from '../data/factions';
import type { GoodId } from '../data/goods';
import { ITEM_LIST } from '../data/items';
import { TROOPS } from '../data/troops';
import { dismiss } from './logic';
import { KIND_INFO, removeParty, type MapParty } from './parties';
import type { GameState } from './state';
import { capture, defeatLord, distributeLosses, news, placeName, type Troops } from './war';
import { addRelation, onPartyDefeated, onVillageRaided } from './quests';
import { spawnPointNear, world, type Settlement } from './world';
import { companionDeed, companionsAfterBattle, partySkill } from './companions';
import { COMPANION_BY_ID, type Deed } from '../data/companions';
import { maybeCaptureLord, onDefeat, takePrisoners } from './prisoners';
import { diff } from './difficulty';

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
  /** Особый итог (взят город, разбит лорд и т. п.). */
  headline?: string;
  /** Спутники: ранения, уровни, реплики. */
  party?: string[];
  /** Взято пленных. */
  prisoners?: number;
  /** Сколько дней герой провёл в плену после поражения. */
  captiveDays?: number;
}

export function heroXpToLevel(level: number) {
  return 120 * level;
}

interface EnemyInfo {
  /** Списки войск врага, из которых вычитаются потери. */
  lists: Troops[];
  gold: number;
  loot: Partial<Record<GoodId, number>>;
  itemChance: number;
  itemCap: number;
  culture: FactionId | null;
  bonusGoods?: boolean;
}

/** Общая часть: наши потери и опыт, потери врага, трофеи или отступление. */
function applyOutcome(state: GameState, battle: Battle, enemy: EnemyInfo, allies: MapParty[] = [], garrisonId?: string): AppliedResult {
  const won = battle.winner === battle.playerSide;
  const ours = battle.summary(battle.playerSide);
  const theirs = battle.summary(battle.playerSide === 0 ? 1 : 0);

  const ourLosses: AppliedResult['ourLosses'] = [];
  let troopXp = 0;
  // Лечение: павшие чаще выживают ранеными
  const killChance = Math.max(0.25, 0.62 - partySkill(state, 'surgery') * 0.07);
  for (const [id, s] of ours.stacks) {
    if (/^A\d+\|/.test(id)) {
      // Потери союзных лордов
      const [a, tid] = id.split('|');
      const t = allies[+a.slice(1)]?.troops.find((x) => x.id === tid);
      if (t) t.count = Math.max(0, t.count - s.dead);
      continue;
    }
    if (id.startsWith('G|') && garrisonId) {
      // Потери гарнизона, защищавшего стены вместе с героем
      const g = (state.war!.garrisons[garrisonId] ??= []);
      const t = g.find((x) => x.id === id.slice(2));
      if (t) t.count = Math.max(0, t.count - s.dead);
      state.war!.garrisons[garrisonId] = g.filter((x) => x.count > 0);
      continue;
    }
    let killed = 0;
    for (let i = 0; i < s.dead; i++) if (Math.random() < killChance) killed++;
    const wounded = s.dead - killed;
    if (s.dead) ourLosses.push({ id, killed, wounded });
    if (killed) dismiss(state, id, killed);
    const stack = state.party.troops.find((t) => t.id === id);
    const gain = Math.round(s.xp + (won ? 8 * s.survived : 0));
    if (stack) stack.xp += gain;
    troopXp += gain;
  }

  let enemyKilled = 0;
  let enemyTotal = 0;
  let enemyTierSum = 0;
  const dead = new Map<string, number>();
  for (const [key, s] of theirs.stacks) {
    const id = key.includes('|') ? key.split('|')[1] : key;
    enemyKilled += s.dead;
    enemyTotal += s.dead + s.survived;
    enemyTierSum += s.dead * (TROOPS[id]?.tier ?? 1);
    if (s.dead) dead.set(id, (dead.get(id) ?? 0) + s.dead);
  }
  distributeLosses(dead, enemy.lists);

  for (const l of allies) l.troops = l.troops.filter((t) => t.count > 0);
  const res: AppliedResult = { won, heroWounded: ours.heroDead, ourLosses, enemyKilled, enemyTotal, gold: 0, goods: {}, heroXp: 0, levelUp: 0, troopXp, lostGold: 0, items: [] };
  state.stats ??= { won: 0, lost: 0, killed: 0 };
  state.stats.killed += enemyKilled;

  if (won) {
    state.stats.won++;
    res.gold = Math.round((enemy.gold + enemyTierSum * (5 + Math.random() * 7)) * diff(state.difficulty).gold);
    res.goods = { ...enemy.loot };
    if (enemy.bonusGoods) {
      const g: GoodId = Math.random() < 0.5 ? 'iron' : 'leather';
      res.goods[g] = (res.goods[g] ?? 0) + 1 + Math.floor(enemyKilled / 4);
    }
    state.gold += res.gold;
    const tries = 1 + Math.floor(enemyKilled / 12);
    for (let i = 0; i < tries; i++) {
      if (Math.random() > enemy.itemChance) continue;
      const pool = ITEM_LIST.filter((it) => it.tier <= enemy.itemCap && (it.cultures === 'all' || !enemy.culture || it.cultures.includes(enemy.culture)));
      const it = pool[Math.floor(Math.random() * pool.length)];
      if (it) {
        res.items.push(it.id);
        (state.hero.bag ??= []).push(it.id);
      }
    }
    for (const [g, n] of Object.entries(res.goods) as [GoodId, number][]) state.cargo[g] = (state.cargo[g] ?? 0) + n;
    res.prisoners = takePrisoners(state, dead);
  } else {
    state.stats.lost++;
    res.captiveDays = onDefeat(state);
    res.lostGold = Math.floor(state.gold * (res.captiveDays ? 0.45 : 0.25));
    state.gold -= res.lostGold;
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

  // В больших сражениях опыт растёт медленнее, чтобы герой не прыгал через уровни
  const tierXp = enemyTierSum <= 20 ? enemyTierSum * 9 : 180 + (enemyTierSum - 20) * 3;
  res.heroXp = Math.round(tierXp + (won ? 20 : 5));
  res.levelUp = gainHeroXp(state, res.heroXp);
  res.party = [
    ...ours.companionsDown.map((id) => `${companionName(id)} ранен и несколько дней не сможет сражаться.`),
    ...companionsAfterBattle(state, res.heroXp, ours.companionsDown),
    ...companionDeed(state, won ? 'victory' : 'defeat'),
  ];
  return res;
}

function companionName(id: string) {
  return COMPANION_BY_ID[id]?.name ?? id;
}

/** Реплики спутников о поступке — в итог боя. */
function deed(res: AppliedResult, state: GameState, d: Deed) {
  (res.party ??= []).push(...companionDeed(state, d));
}

/** Начислить опыт герою; возвращает число новых уровней (2 очка характеристик за уровень). */
export function gainHeroXp(state: GameState, xp: number): number {
  let ups = 0;
  state.hero.xp += xp;
  while (state.hero.xp >= heroXpToLevel(state.hero.level)) {
    state.hero.xp -= heroXpToLevel(state.hero.level);
    state.hero.level++;
    state.hero.points = (state.hero.points ?? 0) + 2;
    state.hero.skillPoints = (state.hero.skillPoints ?? 0) + 1;
    ups++;
  }
  return ups;
}

const ITEM_CHANCE: Record<string, number> = { caravan: 0.3, bandits: 0.14, raiders: 0.2, desert: 0.22, pirates: 0.16, deserters: 0.35, patrol: 0.45, lord: 0.8 };
const ITEM_CAP: Record<string, number> = { caravan: 3, bandits: 2, raiders: 3, desert: 3, pirates: 2, deserters: 3, patrol: 4, lord: 5 };

/** Бой с отрядом на карте (разбойники, разъезд, лорд). others — вражеские лорды, вступившие в бой. */
export function applyBattle(state: GameState, battle: Battle, party: MapParty, allies: MapParty[] = [], others: MapParty[] = []): AppliedResult {
  const res = applyOutcome(state, battle, {
    lists: [party.troops, ...others.map((o) => o.troops)],
    gold: party.gold,
    loot: party.loot,
    itemChance: ITEM_CHANCE[party.kind] ?? 0.1,
    itemCap: ITEM_CAP[party.kind] ?? 2,
    culture: party.faction === 'outlaw' ? null : party.faction,
    bonusGoods: party.kind === 'patrol' || party.kind === 'deserters' || party.kind === 'lord' || party.kind === 'caravan',
  }, allies);
  afterAllies(state, allies, res.won, party.faction);
  if (res.won) {
    for (const o of others) {
      onPartyDefeated(state, o);
      defeatLord(state, o, 'player');
    }
    onPartyDefeated(state, party);
    if (party.kind === 'caravan') {
      deed(res, state, 'caravan');
      news(state, `${state.hero.name} разграбил караван державы «${FACTIONS[party.faction as FactionId].short}».`, 'player');
      res.headline = 'Караван разграблен! Товары погружены в ваш обоз.';
    }
    if (party.kind === 'lord') {
      deed(res, state, 'lord');
      defeatLord(state, party, 'player');
      res.headline = maybeCaptureLord(state, party) ? `${party.name} разбит и взят в плен! Выкуп можно получить в любой таверне.` : `${party.name} разбит и бежал!`;
    } else removeParty(state, party.id);
  } else {
    party.calmUntil = state.time + 1.5;
    if (party.kind === 'lord') news(state, `${party.name} разбил отряд ${state.hero.name}.`, 'player');
  }
  return res;
}

/** Штурм крепости игроком. */
export function applySiege(state: GameState, battle: Battle, s: Settlement, garrison: Troops, lords: MapParty[], allies: MapParty[] = []): AppliedResult {
  const owner = state.settlements[s.id].owner;
  const res = applyOutcome(state, battle, {
    lists: [garrison, ...lords.map((l) => l.troops)],
    gold: s.type === 'town' ? 700 : 400,
    loot: {},
    itemChance: 0.7,
    itemCap: s.type === 'town' ? 5 : 4,
    culture: owner,
    bonusGoods: true,
  }, allies);
  afterAllies(state, allies, res.won, owner);
  if (res.won) {
    for (const l of lords)
      if (l.lord?.status === 'active') {
        defeatLord(state, l, 'player');
        maybeCaptureLord(state, l);
      }
    deed(res, state, 'siege');
    capture(state, s, state.hero.faction, true);
    (state.capturedByHero ??= []).push(s.id);
    state.stats!.captured = (state.stats!.captured ?? 0) + 1;
    res.headline = `${s.name} взят! Крепость отходит государю — ${FACTIONS[state.hero.faction].rulerTitle.toLowerCase()} ${FACTIONS[state.hero.faction].ruler}.`;
  } else {
    news(state, `Гарнизон отбил штурм: ${placeName(s)} устоял. ${state.hero.name} отступает.`, 'player');
  }
  return res;
}

/** Оборона своей (или союзной) крепости от осаждающих лордов. */
export function applyDefense(state: GameState, battle: Battle, s: Settlement, attackers: MapParty[]): AppliedResult {
  const sg = state.war!.sieges[s.id];
  const attacker = sg?.attacker ?? (attackers[0]?.faction as FactionId);
  const res = applyOutcome(state, battle, { lists: attackers.map((l) => l.troops), gold: 250, loot: {}, itemChance: 0.6, itemCap: 4, culture: attacker, bonusGoods: true }, [], s.id);
  if (res.won) {
    delete state.war!.sieges[s.id];
    state.stats!.defended = (state.stats!.defended ?? 0) + 1;
    for (const l of attackers)
      if (l.lord?.status === 'active') {
        defeatLord(state, l, 'player');
        maybeCaptureLord(state, l);
      }
    const ruler = (state.lords ?? []).find((l) => l.faction === state.hero.faction && l.lord!.rank === 3);
    if (ruler) addRelation(state, `lord:${ruler.lord!.name}`, 6);
    news(state, `${state.hero.name} отстоял ${placeName(s)}: осада снята!`, 'player');
    res.headline = `Осада снята! ${s.name} устоял, враг бежит.`;
    deed(res, state, 'lord');
  } else {
    capture(state, s, attacker, false);
    res.headline = `${s.name} пал. Крепость в руках врага.`;
  }
  return res;
}

/** Союзники: при победе благодарны герою, при поражении разбиты вместе с ним. */
function afterAllies(state: GameState, allies: MapParty[], won: boolean, enemy: FactionId | 'outlaw') {
  for (const l of allies) {
    if (won) addRelation(state, `lord:${l.lord!.name}`, 3);
    else if (l.lord?.status === 'active' && enemy !== 'outlaw') defeatLord(state, l, enemy);
  }
}

/** Разорение деревни. */
export function applyRaid(state: GameState, battle: Battle, s: Settlement, militia: Troops): AppliedResult {
  const goods: Partial<Record<GoodId, number>> = {};
  for (const g of s.goods) goods[g] = 2 + Math.floor(Math.random() * 4);
  const res = applyOutcome(state, battle, { lists: [militia], gold: 60 + Math.floor(Math.random() * 140), loot: goods, itemChance: 0.08, itemCap: 1, culture: s.culture });
  if (res.won) {
    state.war!.looted[s.id] = state.time + 14;
    state.stats!.raids = (state.stats!.raids ?? 0) + 1;
    state.settlements[s.id].recruits = {};
    onVillageRaided(state, s);
    deed(res, state, 'raid');
    news(state, `${state.hero.name} разорил ${placeName(s)}.`, 'player');
    res.headline = `${s.name} разорена. Крестьяне разбежались.`;
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

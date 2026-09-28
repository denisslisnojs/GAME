// Знать и поручения: кто принимает героя в поселении, какие дела поручает,
// отношения с лордами и старостами, пожалование удела.

import { fiefIncomeOf } from './fief';
import { FACTIONS, type FactionId } from '../data/factions';
import { GOODS, type GoodId } from '../data/goods';
import { TROOPS } from '../data/troops';
import { mulberry32 } from '../util/rng';
import { gainHeroXp } from './battleResult';
import { atWar, dismiss } from './logic';
import { KIND_INFO, spawn, type MapParty } from './parties';
import type { GameState } from './state';
import { activeLords, isLooted, news } from './war';
import { world, type Settlement } from './world';

export type QuestKind = 'bandits' | 'deliver' | 'raid' | 'troops' | 'hunt';

export interface Quest {
  id: number;
  kind: QuestKind;
  giverKey: string;
  giverName: string;
  /** Где выдано и куда вернуться. */
  from: string;
  title: string;
  text: string;
  target?: string;
  good?: GoodId;
  count?: number;
  tier?: number;
  partyId?: number;
  lordId?: number;
  reward: number;
  relation: number;
  deadline: number;
  done: boolean;
}

export interface Host {
  key: string;
  name: string;
  /** 0 — староста, 1 — кастелян или рыцарь, 2 — вельможа, 3 — правитель. */
  rank: number;
  faction: FactionId;
  lord?: MapParty;
  /** Лорд сейчас в поселении (или это староста/кастелян — они всегда на месте). */
  present: boolean;
}

const ELDER_NAMES = ['Микула', 'Ганс', 'Бьорн', 'Ахмад', 'Тимур', 'Петро', 'Ульф', 'Хасан', 'Йозеф', 'Карим', 'Всеслав', 'Эрик', 'Бату', 'Юсуф', 'Лука', 'Свен'];
const CASTELLANS = ['Отто', 'Гуннар', 'Сартак', 'Масуд', 'Вильгельм', 'Торвальд', 'Кутлуг', 'Идрис', 'Райнер', 'Асгейр', 'Ильхан', 'Фарук'];
const BANDIT_CHIEFS = ['Рябого', 'Кривого Яна', 'Чёрного Лиса', 'Безухого', 'Косого Юргена', 'Волчьей Пасти', 'Сиплого', 'Хромого Азиза', 'Рыжей Марты', 'Одноглазого'];

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function relation(state: GameState, key: string): number {
  return state.relations?.[key] ?? 0;
}

export function addRelation(state: GameState, key: string, d: number) {
  const r = (state.relations ??= {});
  r[key] = Math.max(-100, Math.min(100, (r[key] ?? 0) + d));
}

export function relationWord(v: number): string {
  if (v >= 60) return 'верный друг';
  if (v >= 30) return 'дружелюбен';
  if (v >= 10) return 'благосклонен';
  if (v > -10) return 'нейтрален';
  if (v > -30) return 'холоден';
  return 'враждебен';
}

/** Кто принимает героя в поселении. */
export function hostOf(state: GameState, s: Settlement): Host {
  const owner = state.settlements[s.id].owner;
  if (s.type === 'village') {
    const n = ELDER_NAMES[hashStr(s.id) % ELDER_NAMES.length];
    return { key: `elder:${s.id}`, name: `Староста ${n}`, rank: 0, faction: owner, present: true };
  }
  const lords = (state.lords ?? []).filter((l) => l.faction === owner);
  const ruler = FACTIONS[owner].capital === s.id ? lords.find((l) => l.lord!.rank === 3) : undefined;
  const lord = ruler ?? lords.find((l) => l.lord!.home === s.id && l.lord!.rank < 3);
  if (lord) {
    const present = lord.lord!.status === 'active' ? Math.hypot(lord.x - s.x, lord.y - s.y) < 16 * 8 : false;
    return { key: `lord:${lord.lord!.name}`, name: lord.name, rank: lord.lord!.rank, faction: owner, lord, present };
  }
  const n = CASTELLANS[hashStr(s.id) % CASTELLANS.length];
  return { key: `cast:${s.id}`, name: `Кастелян ${n}`, rank: 1, faction: owner, present: true };
}

export function questsOf(state: GameState, key: string): Quest[] {
  return (state.quests ?? []).filter((q) => q.giverKey === key);
}

function nearest<T extends { x: number; y: number }>(list: T[], x: number, y: number): T | null {
  let best: T | null = null;
  let bd = Infinity;
  for (const it of list) {
    const d = Math.hypot(it.x - x, it.y - y);
    if (d < bd) {
      bd = d;
      best = it;
    }
  }
  return best;
}

/** Поручение, которое хозяин готов дать (одно и то же в течение трёх дней). */
export function offerQuest(state: GameState, s: Settlement, host: Host): Quest | null {
  if (host.faction !== state.hero.faction && s.type !== 'village') return null;
  if (questsOf(state, host.key).length) return null;
  const block = Math.floor(state.time / 3);
  if ((state.questDeclined?.[host.key] ?? -1) === block) return null;
  const r = mulberry32(hashStr(host.key) + block * 7919);
  const kinds: QuestKind[] = [];
  if (s.type === 'village') kinds.push('bandits', 'deliver');
  else if (s.type === 'castle') kinds.push('troops', 'bandits');
  else kinds.push('deliver', 'bandits', 'troops');
  const enemies = (Object.keys(FACTIONS) as FactionId[]).filter((f) => f !== host.faction && atWar(state, f, host.faction));
  if (host.rank >= 1 && s.type !== 'village' && enemies.length) kinds.push('raid', 'raid');
  if (host.rank >= 2 && enemies.length) kinds.push('hunt');
  const kind = kinds[Math.floor(r() * kinds.length)];
  const base = { id: 0, giverKey: host.key, giverName: host.name, from: s.id, done: false, deadline: state.time + 20 };
  const bonus = 1 + Math.max(0, relation(state, host.key)) / 200;
  switch (kind) {
    case 'bandits': {
      const chief = BANDIT_CHIEFS[Math.floor(r() * BANDIT_CHIEFS.length)];
      return {
        ...base,
        kind,
        title: `Шайка ${chief}`,
        text: `Шайка ${chief} грабит дороги в здешних краях. Найдите и разбейте её — она рыщет неподалёку.`,
        reward: Math.round((s.type === 'village' ? 120 : 220) * bonus),
        relation: s.type === 'village' ? 10 : 6,
        target: s.id,
      };
    }
    case 'deliver': {
      const pool = (Object.keys(GOODS) as GoodId[]).filter((g) => !s.goods.includes(g) && GOODS[g].price <= (s.type === 'village' ? 60 : 160));
      const good = pool[Math.floor(r() * pool.length)];
      const count = Math.max(3, Math.round((s.type === 'village' ? 240 : 700) / GOODS[good].price));
      return {
        ...base,
        kind,
        title: `${GOODS[good].name} для ${s.name}`,
        text: `Нужно ${count} ед. товара «${GOODS[good].name}». Купите на рынке и привезите сюда. Заплатим вдвое против цены.`,
        good,
        count,
        reward: Math.round(GOODS[good].price * count * 2 * bonus),
        relation: 5,
      };
    }
    case 'troops': {
      const tier = r() < 0.6 ? 2 : 3;
      const count = tier === 2 ? 5 + Math.floor(r() * 4) : 3 + Math.floor(r() * 3);
      return {
        ...base,
        kind,
        title: 'Пополнить гарнизон',
        text: `Здешнему гарнизону не хватает людей. Приведите ${count} воинов не ниже ${tier}-го уровня — они останутся служить здесь.`,
        tier,
        count,
        reward: Math.round(count * (tier === 2 ? 70 : 150) * bonus),
        relation: 8,
      };
    }
    case 'raid': {
      const villages = world.settlements.filter((v) => v.type === 'village' && enemies.includes(state.settlements[v.id].owner) && !isLooted(state, v.id));
      const v = nearest(villages, s.x, s.y);
      if (!v) return null;
      return {
        ...base,
        kind,
        title: `Разорить ${v.name}`,
        text: `Враг кормит своих солдат с полей деревни ${v.name} (${FACTIONS[state.settlements[v.id].owner].short}). Разорите её — пусть голодают.`,
        target: v.id,
        reward: Math.round(260 * bonus),
        relation: 8,
      };
    }
    case 'hunt': {
      const foes = (state.lords ?? []).filter((l) => l.lord!.status === 'active' && enemies.includes(l.faction as FactionId));
      const foe = nearest(foes, s.x, s.y);
      if (!foe) return null;
      return {
        ...base,
        kind,
        title: `Голова врага: ${foe.lord!.name}`,
        text: `${foe.name} (${FACTIONS[foe.faction as FactionId].short}) разоряет наши земли. Разбейте его войско в поле.`,
        lordId: foe.id,
        reward: Math.round(600 * bonus),
        relation: 15,
        deadline: state.time + 30,
      };
    }
  }
}

export function declineQuest(state: GameState, host: Host) {
  (state.questDeclined ??= {})[host.key] = Math.floor(state.time / 3);
}

export function acceptQuest(state: GameState, q: Quest) {
  q.id = state.nextQuestId = (state.nextQuestId ?? 0) + 1;
  (state.quests ??= []).push(q);
  if (q.kind === 'bandits') {
    const s = world.byId.get(q.from)!;
    const r = mulberry32(q.id * 31 + 7);
    for (let i = 0; i < 5; i++) {
      const p = spawn(state, 'bandits', 'outlaw', { cx: s.cx, cy: s.cy }, r);
      if (!p) continue;
      p.name = q.title;
      p.questId = q.id;
      p.troops.push({ id: 'outlaw_leader', count: 1 }, { id: 'outlaw_archer', count: 2 });
      p.gold += 80;
      (state.parties ??= []).push(p);
      q.partyId = p.id;
      break;
    }
    if (!q.partyId) q.done = true; // негде поставить шайку — считаем, что её спугнули
  }
}

/** Можно ли сдать поручение прямо сейчас. */
export function canTurnIn(state: GameState, q: Quest): boolean {
  if (q.kind === 'deliver') return (state.cargo[q.good!] ?? 0) >= q.count!;
  if (q.kind === 'troops') return eligibleTroops(state, q.tier!) >= q.count!;
  return q.done;
}

function eligibleTroops(state: GameState, tier: number): number {
  return state.party.troops.filter((t) => TROOPS[t.id].tier >= tier).reduce((n, t) => n + t.count, 0);
}

export function questProgress(state: GameState, q: Quest): string {
  switch (q.kind) {
    case 'deliver':
      return `${Math.min(q.count!, state.cargo[q.good!] ?? 0)} из ${q.count}`;
    case 'troops':
      return `${Math.min(q.count!, eligibleTroops(state, q.tier!))} из ${q.count}`;
    case 'bandits':
      return q.done ? 'шайка разбита — вернитесь за наградой' : 'шайка ещё на воле';
    case 'raid':
      return q.done ? 'деревня разорена — вернитесь за наградой' : `цель: ${world.byId.get(q.target!)?.name}`;
    case 'hunt':
      return q.done ? 'враг разбит — вернитесь за наградой' : 'враг ещё в поле';
  }
}

export function turnIn(state: GameState, q: Quest): { gold: number; relation: number; xp: number; levelUp: number } {
  if (q.kind === 'deliver') state.cargo[q.good!] = (state.cargo[q.good!] ?? 0) - q.count!;
  if (q.kind === 'troops') {
    let need = q.count!;
    const given: { id: string; count: number }[] = [];
    const list = [...state.party.troops].filter((t) => TROOPS[t.id].tier >= q.tier!).sort((a, b) => TROOPS[a.id].tier - TROOPS[b.id].tier);
    for (const t of list) {
      if (need <= 0) break;
      const n = Math.min(need, t.count);
      given.push({ id: t.id, count: n });
      need -= n;
    }
    for (const g of given) dismiss(state, g.id, g.count);
    const gar = state.war?.garrisons[q.from];
    if (gar) for (const g of given) {
      const x = gar.find((y) => y.id === g.id);
      if (x) x.count += g.count;
      else gar.push({ ...g });
    }
  }
  state.gold += q.reward;
  addRelation(state, q.giverKey, q.relation);
  // Служба лордам радует и государя
  const ruler = (state.lords ?? []).find((l) => l.faction === state.hero.faction && l.lord!.rank === 3);
  if (ruler && q.giverKey.startsWith('lord:') && q.giverKey !== `lord:${ruler.lord!.name}`) addRelation(state, `lord:${ruler.lord!.name}`, 2);
  const xp = 40 + Math.round(q.reward / 6);
  const levelUp = gainHeroXp(state, xp);
  state.quests = (state.quests ?? []).filter((x) => x !== q);
  // Новое поручение — не раньше следующей трёхдневки
  (state.questDeclined ??= {})[q.giverKey] = Math.floor(state.time / 3);
  state.stats && (state.stats.quests = (state.stats.quests ?? 0) + 1);
  return { gold: q.reward, relation: q.relation, xp, levelUp };
}

export function abandonQuest(state: GameState, q: Quest) {
  addRelation(state, q.giverKey, -5);
  state.quests = (state.quests ?? []).filter((x) => x !== q);
  if (q.partyId) {
    const p = state.parties?.find((x) => x.id === q.partyId);
    if (p) {
      p.questId = undefined;
      p.name = KIND_INFO.bandits.name;
    }
  }
}

// ───────────────────────── события для поручений ─────────────────────────

export function onPartyDefeated(state: GameState, p: MapParty) {
  for (const q of state.quests ?? []) if (q.kind === 'bandits' && q.partyId === p.id) q.done = true;
  for (const q of state.quests ?? []) if (q.kind === 'hunt' && q.lordId === p.id) q.done = true;
}

export function onVillageRaided(state: GameState, s: Settlement) {
  for (const q of state.quests ?? []) if (q.kind === 'raid' && q.target === s.id) q.done = true;
}

/** Раз в день: просроченные поручения, доходы с удела. Возвращает сообщения для игрока. */
export function questsDaily(state: GameState): string[] {
  const out: string[] = [];
  for (const q of [...(state.quests ?? [])]) {
    if (q.done || state.time < q.deadline) continue;
    abandonQuest(state, q);
    out.push(`Срок поручения «${q.title}» вышел. ${q.giverName} недоволен.`);
  }
  // Удел: потеря при захвате и доход раз в неделю
  for (const id of [...(state.fiefs ?? [])]) {
    if (state.settlements[id].owner !== state.hero.faction) {
      state.fiefs = state.fiefs!.filter((x) => x !== id);
      const s = world.byId.get(id)!;
      out.push(`Ваш удел ${s.name} захвачен врагом!`);
      news(state, `${state.hero.name} потерял свой удел — ${s.name}.`, 'player');
    }
  }
  if (state.fiefs?.length && Math.floor(state.time) % 7 === 0) {
    const inc = fiefIncome(state);
    if (inc > 0) {
      state.gold += inc;
      out.push(`Доход с удела за неделю: +${inc} ¤`);
    }
  }
  return out;
}

// ───────────────────────── удел ─────────────────────────

export function fiefIncome(state: GameState): number {
  let sum = 0;
  for (const id of state.fiefs ?? []) sum += fiefIncomeOf(state, id, (v) => isLooted(state, v));
  return sum;
}

/** Что государь может пожаловать (или почему нет). */
export function fiefCandidate(state: GameState): { s?: Settlement; reason?: string } {
  const ruler = (state.lords ?? []).find((l) => l.faction === state.hero.faction && l.lord!.rank === 3);
  if (!ruler) return { reason: 'Государя нет при дворе.' };
  const rel = relation(state, `lord:${ruler.lord!.name}`);
  const have = state.fiefs?.length ?? 0;
  const needRel = 20 + have * 25;
  const needLvl = 4 + have * 3;
  if (state.hero.level < needLvl) return { reason: `Вы ещё мало известны при дворе (нужен уровень ${needLvl}).` };
  if (rel < needRel) return { reason: `Государь пока не доверяет вам настолько (нужно отношение ${needRel}, сейчас ${rel}).` };
  const f = state.hero.faction;
  const pool = world.settlements.filter((s) => s.type !== 'village' && state.settlements[s.id].owner === f && FACTIONS[f].capital !== s.id && !state.fiefs?.includes(s.id));
  const mine = pool.filter((s) => state.capturedByHero?.includes(s.id));
  const pick = mine[0] ?? pool.find((s) => s.type === 'castle') ?? pool[0];
  if (!pick) return { reason: 'Свободных владений нет.' };
  return { s: pick };
}

export function grantFief(state: GameState, s: Settlement) {
  (state.fiefs ??= []).push(s.id);
  news(state, `${FACTIONS[state.hero.faction].rulerTitle} жалует ${state.hero.name} удел: ${s.name}.`, 'player');
}

export function activeEnemyLordsNear(state: GameState, s: Settlement): MapParty[] {
  return activeLords(state).filter((l) => atWar(state, l.faction as FactionId, state.hero.faction) && Math.hypot(l.x - s.x, l.y - s.y) < 400);
}

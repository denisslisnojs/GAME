// Спутники в игре: где сидят, кто в отряде, их верность, жалованье, ссоры и опыт.

import { COMPANION_BY_ID, COMPANIONS, DISLIKE_LINE, LIKE_LINE, type CompanionDef, type Deed } from '../data/companions';
import { SKILL_MAX, type SkillId } from '../data/skills';
import { TROOPS, type TroopDef } from '../data/troops';
import type { GameState } from './state';
import { world } from './world';

export interface CompanionState {
  id: string;
  /** id города, где сидит в таверне, или 'party'. */
  where: string;
  loyalty: number;
  level: number;
  xp: number;
  woundedUntil?: number;
  /** День, когда перебрался в этот город. */
  movedAt: number;
}

export function companionXpToLevel(level: number) {
  return 150 * level;
}

function randomTown(prefer?: string, not?: string): string {
  const towns = world.settlements.filter((s) => s.type === 'town' && s.id !== not);
  const pool = prefer ? towns.filter((s) => s.culture === prefer) : [];
  const list = pool.length && Math.random() < 0.7 ? pool : towns;
  return list[Math.floor(Math.random() * list.length)].id;
}

/** Разместить спутников по тавернам (один раз за игру; старые сохранения получают их при загрузке). */
export function initCompanions(state: GameState) {
  state.companions ??= [];
  for (const c of COMPANIONS) {
    if (state.companions.some((x) => x.id === c.id)) continue;
    state.companions.push({ id: c.id, where: randomTown(c.culture), loyalty: 60, level: 3, xp: 0, movedAt: state.time });
  }
}

export function inParty(state: GameState): { def: CompanionDef; cs: CompanionState }[] {
  return (state.companions ?? []).filter((c) => c.where === 'party').map((cs) => ({ def: COMPANION_BY_ID[cs.id], cs }));
}

export function companionsAt(state: GameState, townId: string): { def: CompanionDef; cs: CompanionState }[] {
  return (state.companions ?? []).filter((c) => c.where === townId).map((cs) => ({ def: COMPANION_BY_ID[cs.id], cs }));
}

export function isWounded(state: GameState, cs: CompanionState): boolean {
  return (cs.woundedUntil ?? 0) > state.time;
}

export function hireCompanion(state: GameState, id: string): boolean {
  const cs = state.companions?.find((c) => c.id === id);
  const def = COMPANION_BY_ID[id];
  if (!cs || !def || cs.where === 'party' || state.gold < def.price) return false;
  state.gold -= def.price;
  cs.where = 'party';
  cs.loyalty = 60;
  return true;
}

export function dismissCompanion(state: GameState, id: string) {
  const cs = state.companions?.find((c) => c.id === id);
  if (!cs || cs.where !== 'party') return;
  cs.where = randomTown(COMPANION_BY_ID[id].culture);
  cs.movedAt = state.time;
  cs.loyalty = 50;
}

// ───────────────────────── умения ─────────────────────────

export function heroSkill(state: GameState, id: SkillId): number {
  return state.hero.skills?.[id] ?? 0;
}

/** Умение отряда: лучшее среди героя и спутников в отряде (раненые тоже советуют). */
export function partySkill(state: GameState, id: SkillId): number {
  let best = heroSkill(state, id);
  for (const { def } of inParty(state)) best = Math.max(best, def.skills[id] ?? 0);
  return Math.min(SKILL_MAX, best);
}

/** Кто в отряде лучше всех владеет умением (для подсказки). */
export function skillOwner(state: GameState, id: SkillId): string {
  let best = heroSkill(state, id);
  let who = state.hero.name;
  for (const { def } of inParty(state)) {
    if ((def.skills[id] ?? 0) > best) {
      best = def.skills[id] ?? 0;
      who = def.name;
    }
  }
  return best ? who : '—';
}

// ───────────────────────── бой ─────────────────────────

/** Спутник как боевая единица: образец из древа его державы, растущий с уровнем. */
export function companionTroop(def: CompanionDef, cs?: CompanionState): TroopDef {
  const base = TROOPS[`${def.culture}_${def.slot}`];
  const lv = (cs?.level ?? 3) - 3;
  const wk = 1 + (def.skills.weapon ?? 0) * 0.04;
  return {
    ...base,
    id: `comp_${def.id}`,
    name: def.name,
    hp: Math.round(base.hp * (1.25 + lv * 0.08) + (def.skills.athletics ?? 0) * 5),
    damage: Math.round(base.damage * (1.1 + lv * 0.05) * wk),
    crit: Math.min(0.4, base.crit + 0.03),
    dodge: Math.min(0.4, base.dodge + 0.03),
    look: { ...base.look, ...def.look },
  };
}

/** Спутники, способные сражаться. */
export function fightingCompanions(state: GameState) {
  return inParty(state).filter(({ cs }) => !isWounded(state, cs));
}

/** После боя: опыт и ранения. Возвращает сообщения о новых уровнях. */
export function companionsAfterBattle(state: GameState, xp: number, down: string[]): string[] {
  const out: string[] = [];
  for (const { def, cs } of inParty(state)) {
    if (down.includes(def.id)) cs.woundedUntil = state.time + 4;
    cs.xp += Math.round(xp * (down.includes(def.id) ? 0.4 : 0.7));
    while (cs.xp >= companionXpToLevel(cs.level)) {
      cs.xp -= companionXpToLevel(cs.level);
      cs.level++;
      out.push(`${def.name} достиг ${cs.level}-го уровня`);
    }
  }
  return out;
}

// ───────────────────────── нрав ─────────────────────────

export function mood(loyalty: number): { text: string; color: string } {
  if (loyalty >= 70) return { text: 'доволен', color: '#7ad06a' };
  if (loyalty >= 40) return { text: 'спокоен', color: '#cfc7b2' };
  if (loyalty >= 20) return { text: 'ворчит', color: '#e8c04a' };
  return { text: 'готов уйти', color: '#e07a6a' };
}

/** Поступок героя: спутники радуются или ворчат. Возвращает реплики для летописи. */
export function companionDeed(state: GameState, deed: Deed): string[] {
  const out: string[] = [];
  for (const { def, cs } of inParty(state)) {
    if (def.dislikes.includes(deed)) {
      cs.loyalty -= deed === 'defeat' || deed === 'retreat' ? 7 : 12;
      out.push(`${def.name} недоволен: «${capital(DISLIKE_LINE[deed])}».`);
    } else if (def.likes.includes(deed)) {
      cs.loyalty = Math.min(100, cs.loyalty + (deed === 'victory' ? 2 : 5));
      if (deed !== 'victory' || Math.random() < 0.25) out.push(`${def.name}: «${capital(LIKE_LINE[deed])}!»`);
    } else if (deed === 'victory') cs.loyalty = Math.min(100, cs.loyalty + 1);
  }
  out.push(...checkLeaving(state));
  return out;
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function checkLeaving(state: GameState): string[] {
  const out: string[] = [];
  for (const { def, cs } of inParty(state)) {
    if (cs.loyalty > 0) continue;
    cs.where = randomTown(def.culture);
    cs.movedAt = state.time;
    cs.loyalty = 40;
    out.push(`${def.name} покинул отряд: «С меня хватит. Ищи себе других людей».`);
  }
  return out;
}

const QUARREL = [
  (a: string, b: string) => `${a} и ${b} повздорили у костра — едва не дошло до ножей.`,
  (a: string, b: string) => `${a} ворчит: «Или уйдёт ${b}, или уйду я».`,
  (a: string, b: string) => `${a} и ${b} третий день не разговаривают. Отряд притих.`,
  (a: string, b: string) => `${b} швырнул миску в сторону, где сидел ${a}. Пришлось разнимать.`,
];

/** Раз в день: жалованье по воскресеньям, ссоры соперников, переезды свободных спутников. */
export function companionsDaily(state: GameState): string[] {
  const out: string[] = [];
  const day = state.lastDay;
  // Свободные спутники раз в пару-тройку недель перебираются в другой город
  for (const cs of state.companions ?? []) {
    if (cs.where === 'party') continue;
    if (state.time - cs.movedAt > 18 + (cs.id.length % 7) * 2) {
      cs.where = randomTown(COMPANION_BY_ID[cs.id].culture, cs.where);
      cs.movedAt = state.time;
    }
  }
  const party = inParty(state);
  if (!party.length) return out;
  // Жалованье раз в неделю
  if (day % 7 === 0) {
    const total = party.reduce((s, { def }) => s + def.wage, 0);
    if (state.gold >= total) {
      state.gold -= total;
      out.push(`Спутникам выплачено жалованье: ${total} ¤.`);
    } else {
      for (const { cs } of party) cs.loyalty -= 15;
      out.push(`Нечем платить спутникам (${total} ¤) — они ропщут.`);
    }
  }
  // Соперники в одном отряде ссорятся
  for (const { def, cs } of party) {
    if (!def.rival) continue;
    const r = party.find((p) => p.def.id === def.rival);
    if (!r || def.id > r.def.id) continue;
    if (Math.random() < 0.07) {
      cs.loyalty -= 5;
      r.cs.loyalty -= 5;
      out.push(QUARREL[Math.floor(Math.random() * QUARREL.length)](def.name, r.def.name));
    }
  }
  // Раны заживают
  for (const { def, cs } of party) {
    if (cs.woundedUntil && cs.woundedUntil <= state.time) {
      cs.woundedUntil = undefined;
      out.push(`${def.name} оправился от ран.`);
    }
  }
  out.push(...checkLeaving(state));
  return out;
}

/** Ежедневное обучение воинов (умение «Обучение»). */
export function trainingDaily(state: GameState, rank: number) {
  if (rank <= 0) return;
  for (const t of state.party.troops) {
    const def = TROOPS[t.id];
    if (!def?.upgradesTo.length) continue;
    t.xp += rank * 0.4 * t.count;
  }
}

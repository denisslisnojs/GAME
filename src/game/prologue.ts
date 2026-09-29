// Пролог: стартовое поручение, которое заодно учит игре (по мотивам начала Mount & Blade).
// Разбойники Чёрного Лиса разорили деревню и увели дочь старосты. Герой собирает отряд,
// находит проводника в таверне, снаряжается, громит шайку, повышает воинов, возвращает
// девушку домой и является ко двору.

import { FACTIONS } from '../data/factions';
import { COMPANION_BY_ID } from '../data/companions';
import { TROOPS } from '../data/troops';
import { mulberry32 } from '../util/rng';
import { gainHeroXp } from './battleResult';
import { addTroops, partySize } from './logic';
import { spawn, type MapParty } from './parties';
import { addRelation, hostOf } from './quests';
import type { GameState } from './state';
import { world, type Settlement } from './world';
import { lc, tr } from '../i18n';

export type PStep = 'intro' | 'village' | 'hire' | 'tavern' | 'gear' | 'hero' | 'gang' | 'upgrade' | 'return' | 'ruler';
export const P_STEPS: PStep[] = ['intro', 'village', 'hire', 'tavern', 'gear', 'hero', 'gang', 'upgrade', 'return', 'ruler'];

export interface PrologueState {
  step: number;
  /** Разорённая деревня. */
  village: string;
  /** Город с таверной и лавками (столица державы). */
  town: string;
  /** Спутник-проводник. */
  comp: string;
  gangId?: number;
  beaten?: boolean;
  off?: boolean;
  /** Показан ли уже рассказ о победе над шайкой. */
  victoryTold?: boolean;
}

/** Сколько бойцов нужно собрать перед походом на шайку. */
export const HIRE_TARGET = 14;
/** Проводник по державе героя. */
const GUIDE: Record<string, string> = { aurelia: 'vaclav', nordmark: 'olga', horde: 'aigerim', sultanate: 'isaac' };

export const GANG_NAME = tr('Шайка Чёрного Лиса');

export function initPrologue(state: GameState) {
  const f = state.hero.faction;
  const cap = world.byId.get(FACTIONS[f].capital)!;
  const px = state.party.x;
  const py = state.party.y;
  const villages = world.settlements.filter((s) => s.type === 'village' && state.settlements[s.id].owner === f);
  // Ближняя своя деревня, но не вплотную к лагерю — чтобы было куда идти
  const dist = (s: Settlement) => Math.hypot(s.x - px, s.y - py);
  const far = villages.filter((s) => dist(s) > 60).sort((a, b) => dist(a) - dist(b));
  const village = (far[0] ?? villages.sort((a, b) => dist(a) - dist(b))[0] ?? cap).id;
  const comp = GUIDE[f];
  const cs = state.companions?.find((c) => c.id === comp);
  if (cs && cs.where !== 'party') {
    cs.where = cap.id;
    cs.movedAt = state.time + 90; // ждёт в таверне, пока не позовут
  }
  state.prologue = { step: 0, village, town: cap.id, comp };
}

export function prologueStep(state: GameState): PStep | null {
  const p = state.prologue;
  if (!p || p.off || p.step >= P_STEPS.length) return null;
  return P_STEPS[p.step];
}

export function prologueActive(state: GameState): boolean {
  return !!prologueStep(state);
}

export function skipPrologue(state: GameState) {
  if (state.prologue) state.prologue.off = true;
  const cs = state.companions?.find((c) => c.id === state.prologue?.comp);
  if (cs && cs.where !== 'party') cs.movedAt = state.time;
  // Шайка Лиса снимается с лагеря и становится обычной
  const g = prologueGang(state);
  if (g) g.camp = false;
}

function advance(state: GameState) {
  const p = state.prologue!;
  p.step++;
  onEnter(state);
}

/** Что сделать при входе в шаг. */
function onEnter(state: GameState) {
  const step = prologueStep(state);
  const p = state.prologue!;
  if (step === 'gang' && !p.gangId && !p.beaten) spawnGang(state);
  if (step === 'upgrade') {
    // После боя кто-то точно должен быть готов к повышению
    const stack = state.party.troops.find((t) => TROOPS[t.id].upgradesTo.length && TROOPS[t.id].xpToUpgrade);
    if (stack && !state.party.troops.some((t) => TROOPS[t.id].xpToUpgrade && t.xp >= TROOPS[t.id].xpToUpgrade)) stack.xp = Math.max(stack.xp, TROOPS[stack.id].xpToUpgrade * Math.min(stack.count, 3));
  }
}

/** Шайка Лиса встаёт лагерем у деревни и никуда не бежит. */
function spawnGang(state: GameState) {
  const p = state.prologue!;
  const v = world.byId.get(p.village)!;
  const r = mulberry32(Math.floor(state.time * 1000) + 17);
  // Из нескольких мест для лагеря — ближнее к деревне
  let best: MapParty | null = null;
  for (let i = 0; i < 10; i++) {
    const g = spawn(state, 'bandits', 'outlaw', { cx: v.cx, cy: v.cy }, r);
    if (g && (!best || Math.hypot(g.x - v.x, g.y - v.y) < Math.hypot(best.x - v.x, best.y - v.y))) best = g;
  }
  if (!best) {
    // Не нашлось места: шайку считают разогнанной
    p.beaten = true;
    return;
  }
  best.name = GANG_NAME;
  best.troops = [
    { id: 'outlaw_bandit', count: 8 },
    { id: 'outlaw_archer', count: 3 },
    { id: 'outlaw_leader', count: 1 },
  ];
  best.gold = 150;
  best.camp = true;
  best.questId = -1;
  (state.parties ??= []).push(best);
  p.gangId = best.id;
}

export function prologueGang(state: GameState): MapParty | null {
  const id = state.prologue?.gangId;
  return id ? (state.parties ?? []).find((x) => x.id === id) ?? null : null;
}

/** Шайка разбита (вызывается после боя). */
export function onPrologueGangDefeated(state: GameState, party: MapParty) {
  const p = state.prologue;
  if (p && p.gangId === party.id) p.beaten = true;
}

/** Выполнены ли условия текущего шага (для шагов без диалога). */
function stepDone(state: GameState, step: PStep): boolean {
  const p = state.prologue!;
  switch (step) {
    case 'hire':
      return partySize(state) >= HIRE_TARGET;
    case 'tavern':
      return state.companions?.find((c) => c.id === p.comp)?.where === 'party';
    case 'gear':
      return !!state.flags?.gear;
    case 'hero':
      return (state.hero.points ?? 0) === 0 && (state.hero.skillPoints ?? 0) === 0;
    case 'gang':
      return !!p.beaten && !!p.victoryTold;
    case 'upgrade':
      return !!state.flags?.upgraded;
    default:
      return false;
  }
}

export type PrologueEvent = { kind: 'done'; step: PStep } | { kind: 'victory' };

/** Проверить шаги, выполненные сами собой. Рассказ о победе — отдельным событием. */
export function prologueTick(state: GameState): PrologueEvent[] {
  const out: PrologueEvent[] = [];
  for (let guard = 0; guard < 12; guard++) {
    const step = prologueStep(state);
    if (!step || step === 'intro') break;
    if (step === 'gang' && state.prologue!.beaten && !state.prologue!.victoryTold) {
      out.push({ kind: 'victory' });
      break;
    }
    if (!stepDone(state, step)) break;
    out.push({ kind: 'done', step });
    advance(state);
  }
  return out;
}

// ───────────────────────── развилки сюжета ─────────────────────────

export function acceptPrologue(state: GameState) {
  if (prologueStep(state) === 'intro') advance(state);
}

/** Прибыли в деревню впервые: староста рассказывает о беде и даёт денег на снаряжение. */
export function prologueVillage(state: GameState) {
  state.gold += 150;
  advance(state);
}

/** Проводник присоединяется даром. */
export function prologueGuideJoins(state: GameState) {
  const p = state.prologue!;
  const cs = state.companions?.find((c) => c.id === p.comp);
  if (cs) {
    cs.where = 'party';
    cs.loyalty = 75;
    cs.movedAt = state.time;
  }
  // Сразу к следующему шагу: иначе таверна после диалога снова покажет ту же сцену
  if (prologueStep(state) === 'tavern') advance(state);
}

export function prologueVictoryTold(state: GameState) {
  state.prologue!.victoryTold = true;
}

/** Дочь старосты дома: награда, благодарность деревни, добровольцы. */
export function prologueReturn(state: GameState): { gold: number; volunteers: number } {
  const p = state.prologue!;
  const v = world.byId.get(p.village)!;
  const gold = 200;
  state.gold += gold;
  addRelation(state, hostOf(state, v).key, 25);
  const volunteers = 3;
  addTroops(state, `${state.hero.faction}_i2`, volunteers);
  gainHeroXp(state, 60);
  advance(state);
  return { gold, volunteers };
}

/** Доклад государю: пролог окончен. */
export function prologueRuler(state: GameState): { gold: number } {
  const p = state.prologue!;
  const town = world.byId.get(p.town)!;
  const host = hostOf(state, town);
  addRelation(state, host.key, 10);
  const gold = 300;
  state.gold += gold;
  gainHeroXp(state, 80);
  advance(state);
  return { gold };
}

// ───────────────────────── подсказки на карте ─────────────────────────

/** Куда вести игрока на текущем шаге (для маркера на карте). */
export function prologueTarget(state: GameState): { x: number; y: number; id: string | number } | null {
  const step = prologueStep(state);
  const p = state.prologue;
  if (!step || !p) return null;
  const at = (id: string) => {
    const s = world.byId.get(id);
    return s ? { x: s.x, y: s.y, id } : null;
  };
  switch (step) {
    case 'village':
    case 'hire':
    case 'return':
      return at(p.village);
    case 'tavern':
    case 'gear':
    case 'ruler':
      return at(p.town);
    case 'gang': {
      const g = prologueGang(state);
      return g ? { x: g.x, y: g.y, id: g.id } : null;
    }
    default:
      return null;
  }
}

/** Текст текущей цели для карточки на карте. */
export function prologueObjective(state: GameState): { text: string; n: number; total: number } | null {
  const step = prologueStep(state);
  const p = state.prologue;
  if (!step || !p || step === 'intro') return null;
  const village = world.byId.get(p.village)?.name ?? '';
  const town = world.byId.get(p.town)?.name ?? '';
  const guide = COMPANION_BY_ID[p.comp]?.name ?? '';
  const f = FACTIONS[state.hero.faction];
  const texts: Record<Exclude<PStep, 'intro'>, string> = {
    village: tr`Доберитесь до деревни ${village}: коснитесь её на карте. Время идёт, только пока отряд в пути.`,
    hire: tr`Наймите крестьян в деревне ${village}, чтобы в отряде было не меньше ${HIRE_TARGET} бойцов (сейчас ${partySize(state)}).`,
    tavern: tr`Город ${town}, таверна: там ждёт ${guide} — знает, где логово шайки. Позовите в отряд.`,
    gear: tr`Город ${town}: купите оружие или доспех у оружейника или бронника — деньги дал староста.`,
    hero: tr('Коснитесь портрета героя слева вверху и вложите все очки характеристик и умений.'),
    gang: tr`Разбейте шайку Чёрного Лиса у деревни ${village}. Перед боем расставьте войска, в бою отдавайте приказы группам.`,
    upgrade: tr('Воины набрались опыта. Откройте «Отряд» и повысьте кого-нибудь (кнопка со стрелкой).'),
    return: tr`Верните дочь старосты домой, в деревню ${village}.`,
    ruler: tr`Явитесь ко двору (город ${town}): ${lc(f.rulerTitle)} ${f.ruler} желает вас видеть.`,
  };
  return { text: texts[step], n: p.step, total: P_STEPS.length - 1 };
}

import { SAVE_KEY, START_YEAR } from '../config';
import { FACTION_IDS, INITIAL_WARS, FACTIONS, type FactionId } from '../data/factions';
import type { GoodId } from '../data/goods';
import { cavRecruitOf, peasantOf } from '../data/troops';
import type { MapParty } from './parties';
import { spawnPointNear, world, type Settlement } from './world';

export interface TroopStack {
  id: string;
  count: number;
  /** Накопленный опыт отряда (общий на стек, как в M&B). */
  xp: number;
}

export interface Hero {
  name: string;
  faction: FactionId;
  level: number;
  xp: number;
}

export interface SettlementState {
  owner: FactionId;
  /** Сколько рекрутов каждого типа можно нанять прямо сейчас. */
  recruits: Record<string, number>;
}

export interface GameState {
  version: 1;
  hero: Hero;
  gold: number;
  /** Дробное число дней с начала игры. */
  time: number;
  /** Последний обработанный целый день. */
  lastDay: number;
  party: { x: number; y: number; troops: TroopStack[] };
  cargo: Partial<Record<GoodId, number>>;
  settlements: Record<string, SettlementState>;
  wars: [FactionId, FactionId][];
  /** Где отряд стоит лагерем/в поселении (для «Продолжить»). */
  visiting?: string;
  /** Отряды на карте (разбойники, разъезды). */
  parties?: MapParty[];
  nextPartyId?: number;
  /** Статистика побед и поражений. */
  stats?: { won: number; lost: number; killed: number };
}

export function recruitSlots(s: Settlement): { id: string; max: number; perDay: number }[] {
  switch (s.type) {
    case 'village':
      return [{ id: peasantOf(s.culture), max: 10, perDay: 1.2 }];
    case 'town':
      return [
        { id: peasantOf(s.culture), max: 8, perDay: 1 },
        { id: cavRecruitOf(s.culture), max: 3, perDay: 0.35 },
      ];
    case 'castle':
      return [{ id: cavRecruitOf(s.culture), max: 5, perDay: 0.5 }];
  }
}

export function newGame(name: string, faction: FactionId): GameState {
  const settlements: Record<string, SettlementState> = {};
  for (const s of world.settlements) {
    const recruits: Record<string, number> = {};
    for (const slot of recruitSlots(s)) recruits[slot.id] = Math.ceil(slot.max * 0.6);
    settlements[s.id] = { owner: s.culture, recruits };
  }
  const capital = world.byId.get(FACTIONS[faction].capital)!;
  const spawn = spawnPointNear(capital);
  return {
    version: 1,
    hero: { name, faction, level: 1, xp: 0 },
    gold: 500,
    time: 0.33, // 8 утра
    lastDay: 0,
    party: {
      x: spawn.x,
      y: spawn.y,
      troops: [
        { id: peasantOf(faction), count: 6, xp: 0 },
        { id: `${faction}_i2`, count: 3, xp: 0 },
      ],
    },
    cargo: { grain: 3 },
    settlements,
    wars: INITIAL_WARS.map(([a, b]) => [a, b]),
  };
}

export function saveGame(state: GameState) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Не удалось сохранить игру', e);
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (s.version !== 1 || !FACTION_IDS.includes(s.hero?.faction)) return null;
    // Поселения, добавленные в новых версиях, получают состояние по умолчанию
    for (const st of world.settlements) {
      if (!s.settlements[st.id]) s.settlements[st.id] = { owner: st.culture, recruits: {} };
    }
    return s;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

// ───────────────────────── календарь ─────────────────────────

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** Игра начинается 1 марта 1347 года. */
const START_DAY_OF_YEAR = 31 + 28;

export function dateString(time: number): string {
  let d = Math.floor(time) + START_DAY_OF_YEAR;
  let year = START_YEAR;
  while (d >= 365) {
    d -= 365;
    year++;
  }
  let m = 0;
  while (d >= MONTH_DAYS[m]) {
    d -= MONTH_DAYS[m];
    m++;
  }
  return `${d + 1} ${MONTHS[m]} ${year}`;
}

export function timeOfDay(time: number): string {
  const h = Math.floor((time % 1) * 24);
  if (h < 5) return 'ночь';
  if (h < 11) return 'утро';
  if (h < 17) return 'день';
  if (h < 21) return 'вечер';
  return 'ночь';
}

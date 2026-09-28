// Турниры в городах: поединки на выбывание (8 бойцов) и командная схватка.
// Оружие затуплено: проигравший выбывает, но не гибнет.

import type { ArmyDef } from '../battle/sim';
import { FACTION_IDS, type FactionId } from '../data/factions';
import { ITEM_LIST } from '../data/items';
import { gainHeroXp } from './battleResult';
import { heroStats, heroTroop } from './hero';
import type { GameState } from './state';
import type { Settlement } from './world';
import { tr } from '../i18n';

export type TourneyKind = 'duel' | 'melee';

export interface Fighter {
  name: string;
  troop: string;
  culture: FactionId;
}

export interface Tourney {
  town: string;
  kind: TourneyKind;
  /** Для поединков: 8 бойцов, индекс 0 — герой. */
  bracket: Fighter[];
  /** 0 — четвертьфинал, 1 — полуфинал, 2 — финал. */
  round: number;
  bet: number;
  /** Кто ещё в сетке (индексы в bracket). */
  alive: number[];
  /** Итоги прошлых раундов для показа. */
  log: string[];
}

export const TOURNEY_FEE = 25;
/** Как часто город проводит турнир (дней). */
export const TOURNEY_COOLDOWN = 6;

const NAMES: Record<FactionId, { first: string[]; last: string[] }> = {
  aurelia: {
    first: [tr('Конрад'), tr('Генрих'), tr('Оттон'), tr('Бертольд'), tr('Гуго'), tr('Джованни'), tr('Марко'), tr('Ульрих'), tr('Дитрих'), tr('Альбрехт'), tr('Лоренцо'), tr('Гвидо')],
    last: [tr('фон Трир'), tr('из Вероны'), tr('фон Цоллерн'), tr('Малатеста'), tr('фон Лихтенштейн'), tr('Орсини'), tr('фон Кибург'), tr('да Кремона'), tr('Железная Рука'), tr('фон Эгер')],
  },
  nordmark: {
    first: [tr('Хакон'), tr('Торстейн'), tr('Эйрик'), tr('Олаф'), tr('Свен'), tr('Харальд'), tr('Ингвар'), tr('Ульф'), tr('Бьярни'), tr('Гудмунд'), tr('Святослав'), tr('Ратибор')],
    last: [tr('Рыжий'), tr('Секира'), tr('из Бергена'), tr('Медведь'), tr('Кривоносый'), tr('Сын Кетиля'), tr('из Упсалы'), tr('Волчья Шкура'), tr('Новгородец'), tr('Тихий')],
  },
  horde: {
    first: [tr('Тохта'), tr('Баатур'), tr('Есугей'), tr('Кичиг'), tr('Сартак'), tr('Алгуй'), tr('Ногай'), tr('Тимур'), tr('Буджек'), tr('Мунке'), tr('Кара-Хулагу'), tr('Тулун')],
    last: [tr('Меткий'), tr('сын Бури'), tr('из Сарая'), tr('Кречет'), tr('Беркут'), tr('Однодум'), tr('Хромой'), tr('Серый Волк'), tr('из Хорезма'), tr('Длиннорукий')],
  },
  sultanate: {
    first: [tr('Юсуф'), tr('Салах'), tr('Кутуз'), tr('Байбарс'), tr('Имад'), tr('Насир'), tr('Акбуга'), tr('Тенгиз'), tr('Муса'), tr('Асад'), tr('Джамал'), tr('Кара-Сункур')],
    last: [tr('аль-Хамави'), tr('ибн Карим'), tr('из Халеба'), tr('аль-Масри'), tr('Лев Пустыни'), tr('аль-Мансури'), tr('ас-Сайфи'), tr('из Дамаска'), tr('аль-Джазари'), tr('Сокол')],
  },
};

function pick<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}

export function fighterName(c: FactionId): string {
  return `${pick(NAMES[c].first)} ${pick(NAMES[c].last)}`;
}

export function tourneyReady(state: GameState, s: Settlement): number {
  const last = state.tourneys?.[s.id] ?? -99;
  return Math.max(0, Math.ceil(last + TOURNEY_COOLDOWN - state.time));
}

/** Сильнее бойцы в финале: уровень 2 в первом круге, 3 во втором, 4 в финале. */
function fighter(s: Settlement, tier: number): Fighter {
  const culture = Math.random() < 0.55 ? s.culture : pick(FACTION_IDS);
  const mounted = Math.random() < (culture === 'horde' ? 0.7 : 0.5);
  const slot = tier === 2 ? (mounted ? 'c2' : 'i2') : `${mounted ? 'c' : 'i'}${tier}m`;
  return { name: fighterName(culture), troop: `${culture}_${slot}`, culture };
}

export function startTourney(state: GameState, s: Settlement, kind: TourneyKind, bet: number): Tourney {
  state.gold -= TOURNEY_FEE + bet;
  (state.tourneys ??= {})[s.id] = state.time;
  const bracket: Fighter[] = [{ name: state.hero.name, troop: 'hero', culture: state.hero.faction }];
  for (let i = 1; i < 8; i++) bracket.push(fighter(s, 2 + Math.floor(Math.random() * 2)));
  return { town: s.id, kind, bracket, round: 0, bet, alive: bracket.map((_, i) => i), log: [] };
}

/** Соперник героя в текущем круге поединков (сила растёт к финалу). */
export function duelOpponent(t: Tourney, s: Settlement): Fighter {
  const idx = t.alive[1];
  const f = t.bracket[idx];
  // Соперник «дорастает» до уровня круга
  const tier = 2 + t.round;
  const cur = +f.troop.replace(/\D/g, '') || 2;
  if (cur < tier) {
    const mounted = f.troop.includes('_c');
    f.troop = `${f.culture}_${mounted ? 'c' : 'i'}${tier}m`;
  }
  void s;
  return f;
}

export function heroArmy(state: GameState): ArmyDef {
  return {
    name: state.hero.name,
    culture: state.hero.faction,
    troops: [],
    hero: { name: state.hero.name, level: state.hero.level, def: heroTroop(state) },
    formation: 'classic',
    morale: 100 + heroStats(state.hero).morale,
  };
}

export function duelArmies(state: GameState, opp: Fighter): [ArmyDef, ArmyDef] {
  return [heroArmy(state), { name: opp.name, culture: opp.culture, troops: [{ id: opp.troop, count: 1 }], formation: 'classic', morale: 100 }];
}

/** Схватка: герой с четырьмя случайными бойцами против пятерых. */
export function meleeArmies(state: GameState, s: Settlement): [ArmyDef, ArmyDef] {
  const team = (n: number) => {
    const out: { id: string; count: number }[] = [];
    for (let i = 0; i < n; i++) {
      const f = fighter(s, 2 + Math.floor(Math.random() * 2));
      const x = out.find((o) => o.id === f.troop);
      if (x) x.count++;
      else out.push({ id: f.troop, count: 1 });
    }
    return out;
  };
  const mine = heroArmy(state);
  mine.troops = team(4);
  mine.name = tr`Синие · ${state.hero.name}`;
  return [mine, { name: tr('Красные'), culture: s.culture, troops: team(5), formation: 'classic', morale: 100 }];
}

/** Остальные пары круга: исход по силе бойца. */
export function resolveOthers(t: Tourney, heroWon: boolean) {
  const next: number[] = [];
  const tierOf = (i: number) => +t.bracket[i].troop.replace(/\D/g, '') || 2;
  for (let k = 0; k < t.alive.length; k += 2) {
    const a = t.alive[k];
    const b = t.alive[k + 1];
    if (a === 0) {
      next.push(heroWon ? a : b);
      t.log.push(heroWon ? tr`${t.bracket[0].name} побеждает ${t.bracket[b].name}` : tr`${t.bracket[b].name} побеждает ${t.bracket[0].name}`);
      continue;
    }
    const pa = tierOf(a) / (tierOf(a) + tierOf(b));
    const w = Math.random() < pa ? a : b;
    next.push(w);
    t.log.push(tr`${t.bracket[w].name} побеждает ${t.bracket[w === a ? b : a].name}`);
  }
  t.alive = next;
  t.round++;
}

export interface TourneyPrize {
  gold: number;
  xp: number;
  item?: string;
  betWin: number;
  title: string;
  levelUp: number;
}

/** Награда: за каждый выигранный круг и главный приз победителю. */
export function tourneyPrize(state: GameState, t: Tourney, won: boolean, roundsWon: number): TourneyPrize {
  const s = t.town;
  let gold = 0;
  let xp = 0;
  let item: string | undefined;
  let betWin = 0;
  let title: string;
  if (t.kind === 'duel') {
    gold = roundsWon * 40;
    xp = roundsWon * 45;
    if (won) {
      gold += 260;
      xp += 120;
      betWin = t.bet * 4;
      title = tr('Вы — победитель турнира!');
    } else title = roundsWon === 2 ? tr('Вы дошли до финала') : roundsWon === 1 ? tr('Вы дошли до полуфинала') : tr('Вы выбыли в первом круге');
  } else {
    if (won) {
      gold = 180;
      xp = 110;
      betWin = t.bet * 2;
      title = tr('Ваша команда выиграла схватку!');
    } else {
      xp = 30;
      title = tr('Ваша команда проиграла схватку');
    }
  }
  if (won) {
    // Приз: хорошая вещь из запасов города
    const pool = ITEM_LIST.filter((it) => it.tier >= 3 && it.tier <= 4 && (it.cultures === 'all' || it.cultures.includes(state.settlements[s].owner)));
    item = pick(pool)?.id;
    if (item) (state.hero.bag ??= []).push(item);
  }
  state.gold += gold + betWin;
  if (won && state.stats) state.stats.tourneys = (state.stats.tourneys ?? 0) + 1;
  const levelUp = gainHeroXp(state, xp);
  return { gold, xp, item, betWin, title, levelUp };
}

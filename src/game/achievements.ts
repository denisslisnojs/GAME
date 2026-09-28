// Достижения: общие для всех партий, хранятся отдельно от сохранений.

import { TROOPS } from '../data/troops';
import { inParty } from './companions';
import { partySize } from './logic';
import type { GameState } from './state';
import { tr } from '../i18n';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  check: (s: GameState) => boolean;
}

const st = (s: GameState) => s.stats ?? { won: 0, lost: 0, killed: 0 };

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_blood', name: tr('Первая кровь'), desc: tr('Выиграть первый бой.'), check: (s) => st(s).won >= 1 },
  { id: 'hundred', name: tr('Сотня'), desc: tr('Сразить сотню врагов.'), check: (s) => st(s).killed >= 100 },
  { id: 'thousand', name: tr('Жнец'), desc: tr('Сразить тысячу врагов.'), check: (s) => st(s).killed >= 1000 },
  { id: 'castle', name: tr('Штурм'), desc: tr('Взять вражескую крепость.'), check: (s) => (st(s).captured ?? 0) >= 1 },
  { id: 'champion', name: tr('Чемпион'), desc: tr('Победить на турнире.'), check: (s) => (st(s).tourneys ?? 0) >= 1 },
  { id: 'duel', name: tr('Поединщик'), desc: tr('Одолеть лорда в поединке перед строем.'), check: (s) => (st(s).duels ?? 0) >= 1 },
  { id: 'captor', name: tr('Тюремщик'), desc: tr('Взять в плен лорда.'), check: (s) => (st(s).lordsCaptured ?? 0) >= 1 },
  { id: 'defender', name: tr('Несокрушимый'), desc: tr('Отстоять крепость в осаде.'), check: (s) => (st(s).defended ?? 0) >= 1 },
  { id: 'fellowship', name: tr('Братство'), desc: tr('Собрать в отряде трёх спутников.'), check: (s) => inParty(s).length >= 3 },
  { id: 'wedding', name: tr('Узы'), desc: tr('Сыграть свадьбу.'), check: (s) => !!s.spouse },
  { id: 'crown', name: tr('Корона'), desc: tr('Взойти на трон своей державы.'), check: (s) => !!s.crown },
  { id: 'lands', name: tr('Владетель'), desc: tr('Владеть тремя уделами.'), check: (s) => (s.fiefs?.length ?? 0) >= 3 },
  { id: 'veteran', name: tr('Ветеран'), desc: tr('Достичь 10-го уровня.'), check: (s) => s.hero.level >= 10 },
  { id: 'rich', name: tr('Казна'), desc: tr('Скопить 10 000 монет.'), check: (s) => s.gold >= 10000 },
  { id: 'host', name: tr('Воинство'), desc: tr('Водить за собой сотню воинов.'), check: (s) => partySize(s) >= 100 },
  { id: 'elite', name: tr('Гвардия'), desc: tr('Иметь в отряде десять воинов высшего ранга.'), check: (s) => s.party.troops.filter((t) => TROOPS[t.id]?.tier === 4).reduce((n, t) => n + t.count, 0) >= 10 },
  { id: 'quests', name: tr('Слово чести'), desc: tr('Выполнить пять поручений.'), check: (s) => (st(s).quests ?? 0) >= 5 },
  { id: 'year', name: tr('Год чумы'), desc: tr('Прожить целый год в 1347-м мире.'), check: (s) => s.time >= 365 },
];

const KEY = 'w1347_achievements';

export function unlocked(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

/** Проверить достижения; вернуть только что открытые. */
export function checkAchievements(s: GameState): Achievement[] {
  const got = unlocked();
  const fresh = ACHIEVEMENTS.filter((a) => !got[a.id] && a.check(s));
  if (!fresh.length) return [];
  for (const a of fresh) got[a.id] = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(got));
  } catch {
    /* нет хранилища */
  }
  return fresh;
}

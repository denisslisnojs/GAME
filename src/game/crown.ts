// Путь к трону: сватовство к дочерям лордов, свадьба и притязание на корону своей державы.

import { FACTIONS, FACTION_IDS, type FactionId } from '../data/factions';
import { atWar } from './logic';
import type { MapParty } from './parties';
import { relation } from './quests';
import type { GameState } from './state';
import { news } from './war';
import { lc, tr } from '../i18n';

const LADIES: Record<FactionId, string[]> = {
  aurelia: [tr('Изабелла'), tr('Маргарита'), tr('Беатриса'), tr('Катарина'), tr('Элеонора'), tr('Агнесса'), tr('Кунигунда'), tr('Бланка')],
  nordmark: [tr('Ингрид'), tr('Сигрид'), tr('Астрид'), tr('Хельга'), tr('Рагнхильд'), tr('Сольвейг'), tr('Гудрун'), tr('Ефимия')],
  horde: [tr('Тайдула'), tr('Баялунь'), tr('Кельмиш'), tr('Айсулу'), tr('Кутлу-Бегим'), tr('Джанике'), tr('Тогай'), tr('Алтынай')],
  sultanate: [tr('Шаджар'), tr('Зейнаб'), tr('Фатима'), tr('Айша'), tr('Хадиджа'), tr('Мариам'), tr('Лейла'), tr('Сальма')],
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Дочь лорда (есть не у всех). */
export function ladyOf(l: MapParty): string | null {
  if (!l.lord || l.faction === 'outlaw') return null;
  const hsh = hash(l.lord.name);
  if (hsh % 3 === 0) return null;
  const list = LADIES[l.faction as FactionId];
  return list[hsh % list.length];
}

export const VISITS_NEEDED = 3;
export const GIFT_COST = 80;
export const WEDDING_COST = 400;

export function courtship(state: GameState, l: MapParty) {
  const c = state.courtship;
  return c && c.lordName === l.lord!.name ? c : null;
}

/** Навестить даму с подарком. Возвращает реплику. */
export function visitLady(state: GameState, l: MapParty): string {
  const lady = ladyOf(l)!;
  const key = `lord:${l.lord!.name}`;
  if (relation(state, key) < 10) return tr`«Моя дочь не принимает незнакомцев», — холодно говорит ${l.name}.`;
  let c = courtship(state, l);
  if (c && state.time - c.last < 3) return tr`${lady} благодарит за внимание, но просит не приезжать так часто: «Люди начнут говорить».`;
  if (state.gold < GIFT_COST) return tr`С пустыми руками к даме не ходят (нужен подарок на ${GIFT_COST} ¤).`;
  state.gold -= GIFT_COST;
  if (!c) c = state.courtship = { lordName: l.lord!.name, lady, visits: 0, last: 0, faction: l.faction as FactionId };
  c.visits++;
  c.last = state.time;
  const lines = [
    tr`${lady} принимает ваш подарок и долго расспрашивает о походах.`,
    tr`Вы гуляете с ${lady === tr('Бланка') ? tr('Бланкой') : tr('дамой')} по саду. Она смеётся над вашими историями.`,
    tr`${lady} читает вам стихи и краснеет, когда вы хвалите её голос.`,
  ];
  return tr`${lines[Math.min(lines.length - 1, c.visits - 1)]} (${Math.min(c.visits, VISITS_NEEDED)} из ${VISITS_NEEDED})`;
}

export function canPropose(state: GameState, l: MapParty): { ok: boolean; reason?: string } {
  const c = courtship(state, l);
  if (state.spouse) return { ok: false, reason: tr('Вы уже женаты.') };
  if (!c || c.visits < VISITS_NEEDED) return { ok: false, reason: tr`Сначала поухаживайте за дамой (${c?.visits ?? 0} из ${VISITS_NEEDED} визитов).` };
  if (relation(state, `lord:${l.lord!.name}`) < 25) return { ok: false, reason: tr('Отец невесты должен уважать вас больше (нужно отношение 25).') };
  if (state.hero.level < 5) return { ok: false, reason: tr('Вы ещё слишком мало известны (нужен 5-й уровень).') };
  if (state.gold < WEDDING_COST) return { ok: false, reason: tr`На свадебный пир нужно ${WEDDING_COST} ¤.` };
  return { ok: true };
}

/** Свадьба: пир, приданое, родство с лордом; если его держава воюет с нами — мир. */
export function wed(state: GameState, l: MapParty): string {
  const c = courtship(state, l)!;
  state.gold -= WEDDING_COST;
  const dowry = 300 + l.lord!.rank * 300;
  state.gold += dowry;
  state.spouse = { name: c.lady, lordName: l.lord!.name, faction: c.faction, since: state.time };
  state.courtship = undefined;
  const rel = (state.relations ??= {});
  rel[`lord:${l.lord!.name}`] = Math.min(100, (rel[`lord:${l.lord!.name}`] ?? 0) + 25);
  let peace = '';
  const f = c.faction;
  if (f !== state.hero.faction && atWar(state, f, state.hero.faction)) {
    state.wars = state.wars.filter(([a, b]) => !((a === f && b === state.hero.faction) || (b === f && a === state.hero.faction)));
    peace = tr` В честь свадьбы ${FACTIONS[f].short} и ${FACTIONS[state.hero.faction].short} заключили мир.`;
    news(state, tr`${FACTIONS[f].short} и ${FACTIONS[state.hero.faction].short} заключили мир по случаю свадьбы.`, 'peace');
  }
  news(state, tr`${state.hero.name} обвенчался с ${c.lady}, дочерью ${l.name}.`, 'player');
  return tr`Три дня гремит свадебный пир. ${c.lady} теперь ваша жена; приданое — ${dowry} ¤.${peace} Жена возьмёт на себя хозяйство уделов: доход с них вырастет.`;
}

// ───────────────────────── корона ─────────────────────────

export function isKing(state: GameState): boolean {
  return !!state.crown;
}

/** Можно ли потребовать корону своей державы. */
export function crownCheck(state: GameState): { ok: boolean; reason?: string; support: number; total: number } {
  const f = state.hero.faction;
  const lords = (state.lords ?? []).filter((l) => l.faction === f && l.lord!.rank < 3);
  const support = lords.filter((l) => relation(state, `lord:${l.lord!.name}`) >= 20).length;
  const total = lords.length;
  if (state.crown) return { ok: false, reason: tr('Вы уже носите корону.'), support, total };
  if (state.hero.level < 12) return { ok: false, reason: tr('Нужен 12-й уровень: о вас должны петь песни.'), support, total };
  if ((state.fiefs?.length ?? 0) < 2) return { ok: false, reason: tr('Нужно хотя бы два владения.'), support, total };
  if (support * 2 < total) return { ok: false, reason: tr`Вас должна поддержать половина лордов (отношение 20+): сейчас ${support} из ${total}.`, support, total };
  return { ok: true, support, total };
}

/** Старый государь отрекается, герой коронуется. */
export function claimCrown(state: GameState) {
  const f = state.hero.faction;
  const old = FACTIONS[f].ruler;
  state.crown = { since: state.time, oldRuler: old };
  state.lords = (state.lords ?? []).filter((l) => !(l.faction === f && l.lord!.rank === 3));
  applyCrown(state);
  news(state, tr`${old} отрёкся от престола. ${state.hero.name} коронован: теперь он ${lc(FACTIONS[f].rulerTitle)} державы «${FACTIONS[f].short}»!`, 'capture');
}

const ORIGINAL_RULERS = Object.fromEntries(FACTION_IDS.map((f) => [f, FACTIONS[f].ruler])) as Record<FactionId, string>;

/** Вписать героя государем (при каждом запуске партии: новой или загруженной). */
export function applyCrown(state: GameState) {
  for (const f of FACTION_IDS) FACTIONS[f].ruler = ORIGINAL_RULERS[f];
  if (state.crown) FACTIONS[state.hero.faction].ruler = state.hero.name;
}

/** Государь объявляет войну. */
export function declareWar(state: GameState, o: FactionId) {
  const f = state.hero.faction;
  if (o === f || atWar(state, f, o)) return;
  state.wars.push([f, o]);
  state.war!.warSince[[f, o].sort().join('|')] = state.time;
  state.war!.lastDiplo = state.time; // держава не передумает тут же
  news(state, tr`${FACTIONS[f].rulerTitle} ${state.hero.name} объявляет войну: ${FACTIONS[f].short} против ${FACTIONS[o].short}!`, 'war');
}

/** Предложить мир: чем дольше война и чем мы сильнее, тем охотнее соглашаются. */
export function offerPeace(state: GameState, o: FactionId, power: (f: FactionId) => number): boolean {
  const f = state.hero.faction;
  if (!atWar(state, f, o)) return false;
  const since = state.war!.warSince[[f, o].sort().join('|')] ?? 0;
  const ratio = power(f) / Math.max(1, power(o));
  const chance = Math.min(0.9, 0.15 + (state.time - since) / 60 + (ratio - 1) * 0.3);
  if (Math.random() > chance) return false;
  state.wars = state.wars.filter(([a, b]) => !((a === f && b === o) || (a === o && b === f)));
  for (const [sid, sg] of Object.entries(state.war!.sieges)) if ((sg.attacker === f && state.settlements[sid].owner === o) || (sg.attacker === o && state.settlements[sid].owner === f)) delete state.war!.sieges[sid];
  news(state, tr`${FACTIONS[f].short} и ${FACTIONS[o].short} заключили мир.`, 'peace');
  return true;
}

export const OTHER_REALMS = (state: GameState) => FACTION_IDS.filter((f) => f !== state.hero.faction && !state.war?.eliminated.includes(f));

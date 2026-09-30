// Пленные: оглушённые враги после победы, пленённые лорды, выкуп и вербовка.

import { FACTIONS, type FactionId } from '../data/factions';
import { TROOPS } from '../data/troops';
import { heroStats } from './hero';
import { addTroops, partyRoom, partySize } from './logic';
import type { MapParty } from './parties';
import type { GameState, TroopStack } from './state';
import { news } from './war';
import { tr } from '../i18n';

export interface CaptiveLord {
  /** id отряда лорда (MapParty.id). */
  id: number;
  name: string;
  faction: FactionId;
  rank: 1 | 2 | 3;
  since: number;
  /** Имя лорда без титула — ключ отношений. */
  lordName: string;
}

/** Сколько пленных отряд может стеречь. */
export function prisonerCap(state: GameState): number {
  return Math.max(8, partySize(state) + (state.hero.attrs?.lead ?? 3) * 2);
}

export function prisonerCount(state: GameState): number {
  return (state.prisoners ?? []).reduce((n, p) => n + p.count, 0);
}

function addPrisoner(state: GameState, id: string, n: number) {
  const list = (state.prisoners ??= []);
  const st = list.find((p) => p.id === id);
  if (st) st.count += n;
  else list.push({ id, count: n, xp: 0 });
}

/** После победы часть павших врагов — лишь оглушены и сдаются. Возвращает число пленных. */
export function takePrisoners(state: GameState, dead: Map<string, number>): number {
  let free = prisonerCap(state) - prisonerCount(state);
  let got = 0;
  for (const [id, n] of dead) {
    if (!TROOPS[id]) continue;
    let k = 0;
    for (let i = 0; i < n; i++) if (Math.random() < 0.3) k++;
    k = Math.min(k, free);
    if (k <= 0) continue;
    addPrisoner(state, id, k);
    free -= k;
    got += k;
  }
  return got;
}

/** Разбитый лорд попадает в плен с некоторой вероятностью. */
export function maybeCaptureLord(state: GameState, l: MapParty): boolean {
  if (!l.lord || l.faction === 'outlaw') return false;
  if (Math.random() > 0.4) return false;
  (state.captives ??= []).push({ id: l.id, name: l.name, faction: l.faction as FactionId, rank: l.lord.rank, since: state.time, lordName: l.lord.name });
  l.lord.recoverAt = 1e9; // сидит у нас, пока не выкупят или не отпустим
  if (state.stats) state.stats.lordsCaptured = (state.stats.lordsCaptured ?? 0) + 1;
  news(state, tr`${state.hero.name} взял в плен: ${l.name}.`, 'player');
  return true;
}

export function lordRansom(c: CaptiveLord): number {
  return 250 * c.rank + 150;
}

/** Цена пленного у торговца выкупом. */
export function ransomPrice(id: string): number {
  const t = TROOPS[id];
  if (!t) return 0;
  return Math.round(8 * Math.pow(t.tier, 1.6));
}

function releaseLordParty(state: GameState, c: CaptiveLord, days: number) {
  const l = (state.lords ?? []).find((x) => x.id === c.id);
  if (l?.lord) l.lord.recoverAt = state.time + days;
  state.captives = (state.captives ?? []).filter((x) => x !== c);
}

/** Получить выкуп за лорда от его державы. */
export function ransomLord(state: GameState, c: CaptiveLord): number {
  const g = lordRansom(c);
  state.gold += g;
  releaseLordParty(state, c, 6);
  news(state, tr`Держава «${FACTIONS[c.faction].short}» выкупила ${c.name} за ${g} ¤.`, 'player');
  return g;
}

/** Отпустить лорда без выкупа — он запомнит. */
export function releaseLord(state: GameState, c: CaptiveLord) {
  releaseLordParty(state, c, 4);
  const rel = (state.relations ??= {});
  const key = `lord:${c.lordName}`;
  rel[key] = Math.min(100, (rel[key] ?? 0) + 15);
  news(state, tr`${state.hero.name} великодушно отпустил ${c.name} без выкупа.`, 'player');
}

/** Продать пленных торговцу выкупом. */
export function sellPrisoners(state: GameState, id: string, n: number): number {
  const st = state.prisoners?.find((p) => p.id === id);
  if (!st) return 0;
  const k = Math.min(n, st.count);
  st.count -= k;
  state.prisoners = (state.prisoners ?? []).filter((p) => p.count > 0);
  const g = k * ransomPrice(id);
  state.gold += g;
  return g;
}

/** Уговорить пленного служить: шанс растёт с лидерством. Возвращает, согласился ли. */
export function recruitPrisoner(state: GameState, id: string): boolean {
  const st = state.prisoners?.find((p) => p.id === id);
  if (!st || st.count <= 0 || partyRoom(state) <= 0) return false;
  st.count--;
  state.prisoners = (state.prisoners ?? []).filter((p) => p.count > 0);
  const lead = heroStats(state.hero).morale / 3;
  const ok = Math.random() < 0.35 + lead * 0.04 - (TROOPS[id]?.tier ?? 1) * 0.04;
  if (ok) addTroops(state, id, 1);
  return ok;
}

/** Раз в день: пленные сбегают, если их стерегут слишком мало. */
export function prisonersDaily(state: GameState): string[] {
  const list: TroopStack[] = state.prisoners ?? [];
  if (!list.length) return [];
  const over = prisonerCount(state) - prisonerCap(state);
  if (over <= 0 && Math.random() > 0.05) return [];
  let fled = 0;
  for (const p of list) {
    const k = Math.min(p.count, Math.max(over > 0 ? Math.ceil((p.count * over) / Math.max(1, prisonerCount(state))) : 0, Math.random() < 0.3 ? 1 : 0));
    p.count -= k;
    fled += k;
  }
  state.prisoners = list.filter((p) => p.count > 0);
  return fled ? [tr`Ночью сбежали пленные: ${fled}.`] : [];
}

/** Поражение: пленные разбегаются, а героя могут пленить. Возвращает дни плена (0 — ушёл). */
export function onDefeat(state: GameState): number {
  state.prisoners = [];
  if (Math.random() > 0.35) return 0;
  const days = 2 + Math.floor(Math.random() * 4);
  state.time += days;
  news(state, tr`${state.hero.name} попал в плен и лишь через ${days} дн. сумел бежать.`, 'player');
  return days;
}

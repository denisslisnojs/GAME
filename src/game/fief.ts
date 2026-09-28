// Управление уделом: постройки, налоги, рост и выучка гарнизона.

import { TROOPS } from '../data/troops';
import type { GameState } from './state';
import { world } from './world';
import { tr } from '../i18n';

export type BuildingId = 'walls' | 'market' | 'barracks' | 'yard';
export type Tax = 'low' | 'normal' | 'high';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  desc: string;
  cost: number;
  days: number;
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'walls', name: tr('Каменные стены'), desc: tr('Гарнизон держит осаду на треть крепче; враги тратят больше времени на штурм.'), cost: 1500, days: 14 },
  { id: 'market', name: tr('Торговые ряды'), desc: tr('Доход с удела на 40% выше.'), cost: 900, days: 10 },
  { id: 'barracks', name: tr('Казармы'), desc: tr('Каждый день в гарнизон приходит новобранец (до 60 воинов).'), cost: 1100, days: 12 },
  { id: 'yard', name: tr('Ристалище для оруженосцев'), desc: tr('Раз в неделю лучшие из гарнизона повышаются в звании.'), cost: 1000, days: 12 },
];

export const TAX_INFO: Record<Tax, { name: string; k: number; hint: string }> = {
  low: { name: tr('Низкие'), k: 0.7, hint: tr('меньше денег, но крестьяне довольны') },
  normal: { name: tr('Обычные'), k: 1, hint: '' },
  high: { name: tr('Высокие'), k: 1.4, hint: tr('больше денег, старосты ропщут') },
};

export interface FiefState {
  built: BuildingId[];
  building?: { id: BuildingId; done: number };
  tax: Tax;
}

export function fiefState(state: GameState, id: string): FiefState {
  const all = (state.fiefState ??= {});
  return (all[id] ??= { built: [], tax: 'normal' });
}

export function hasBuilding(state: GameState, id: string, b: BuildingId): boolean {
  return !!state.fiefState?.[id]?.built.includes(b);
}

export function startBuilding(state: GameState, id: string, b: BuildingId): boolean {
  const f = fiefState(state, id);
  const def = BUILDINGS.find((x) => x.id === b)!;
  if (f.building || f.built.includes(b) || state.gold < def.cost) return false;
  state.gold -= def.cost;
  f.building = { id: b, done: state.time + def.days };
  return true;
}

/** Доход одного владения в неделю. */
export function fiefIncomeOf(state: GameState, id: string, isLooted: (v: string) => boolean): number {
  const s = world.byId.get(id)!;
  let sum = s.type === 'town' ? 220 : 120;
  sum += s.villages.filter((v) => state.settlements[v].owner === state.hero.faction && !isLooted(v)).length * 30;
  const f = fiefState(state, id);
  if (f.built.includes('market')) sum *= 1.4;
  sum *= TAX_INFO[f.tax].k;
  return Math.round(sum);
}

/** Раз в день: стройки, казармы, выучка, настроение деревень от налогов. */
export function fiefDaily(state: GameState): string[] {
  const out: string[] = [];
  const weekly = Math.floor(state.time) % 7 === 0;
  for (const id of state.fiefs ?? []) {
    const s = world.byId.get(id);
    if (!s) continue;
    const f = fiefState(state, id);
    if (f.building && state.time >= f.building.done) {
      f.built.push(f.building.id);
      out.push(tr`${s.name}: достроено — ${BUILDINGS.find((b) => b.id === f.building!.id)!.name}.`);
      f.building = undefined;
    }
    const gar = (state.war!.garrisons[id] ??= []);
    const count = gar.reduce((n, t) => n + t.count, 0);
    if (f.built.includes('barracks') && count < 60 && !state.war!.sieges[id]) {
      const rid = `${state.hero.faction}_${Math.random() < 0.3 ? 'c1' : 'i2'}`;
      const st = gar.find((t) => t.id === rid);
      if (st) st.count++;
      else gar.push({ id: rid, count: 1 });
    }
    if (weekly && f.built.includes('yard')) {
      // Двое лучших из тех, кто ещё может расти, повышаются
      for (let k = 0; k < 2; k++) {
        const cand = gar.filter((t) => TROOPS[t.id]?.upgradesTo.length).sort((a, b) => TROOPS[b.id].tier - TROOPS[a.id].tier)[0];
        if (!cand) break;
        cand.count--;
        const to = TROOPS[cand.id].upgradesTo[Math.floor(Math.random() * TROOPS[cand.id].upgradesTo.length)];
        const st = gar.find((t) => t.id === to);
        if (st) st.count++;
        else gar.push({ id: to, count: 1 });
      }
      for (let i = gar.length - 1; i >= 0; i--) if (gar[i].count <= 0) gar.splice(i, 1);
    }
    if (weekly && f.tax !== 'normal') {
      const rel = (state.relations ??= {});
      for (const v of s.villages) rel[`elder:${v}`] = Math.max(-100, Math.min(100, (rel[`elder:${v}`] ?? 0) + (f.tax === 'low' ? 2 : -3)));
    }
  }
  return out;
}

// Война держав: лорды с армиями, походы, осады, захват городов, дипломатия, хроника.
// Логика без Phaser. Бои между ИИ считаются той же симуляцией (автобой).

import { strength } from '../battle/setup';
import { GRID_W, TILE } from '../config';
import { FACTIONS, FACTION_IDS, type FactionId } from '../data/factions';
import { LORDS } from '../data/lords';
import { worldToCell } from '../map/geo';
import { mulberry32 } from '../util/rng';
import { atWar } from './logic';
import { advance, getLandCost, partyRuntime, pathTo, powerRatio, type MapParty } from './parties';
import type { GameState } from './state';
import { spawnPointNear, world, type Settlement } from './world';

export type Troops = { id: string; count: number }[];

export interface NewsItem {
  t: number;
  text: string;
  kind: 'war' | 'peace' | 'capture' | 'battle' | 'lord' | 'info' | 'player';
}

export interface WarState {
  garrisons: Record<string, Troops>;
  sieges: Record<string, { attacker: FactionId; since: number }>;
  campaigns: Partial<Record<FactionId, { target: string; since: number }>>;
  news: NewsItem[];
  looted: Record<string, number>;
  lastDiplo: number;
  warSince: Record<string, number>;
  eliminated: FactionId[];
  outcome?: 'victory' | 'defeat';
  /** Итоговое окно уже показано. */
  outcomeSeen?: boolean;
}

// ───────────────────────── составы армий ─────────────────────────

function mix(faction: FactionId, size: number, weights: [string, number][], r: () => number): Troops {
  const total = weights.reduce((s, [, w]) => s + w, 0);
  const out = new Map<string, number>();
  for (let i = 0; i < size; i++) {
    let x = r() * total;
    for (const [slot, w] of weights) {
      x -= w;
      if (x <= 0) {
        const id = `${faction}_${slot}`;
        out.set(id, (out.get(id) ?? 0) + 1);
        break;
      }
    }
  }
  return [...out].map(([id, count]) => ({ id, count }));
}

export function lordArmy(faction: FactionId, rank: number, time: number, r: () => number): Troops {
  const size = Math.round(18 + rank * 9 + Math.min(34, time / 3));
  const horde = faction === 'horde';
  return mix(faction, size, [
    ['i2', horde ? 10 : 22],
    ['i3m', horde ? 10 : 18],
    ['i3r', 16],
    ['i4m', 5 + rank],
    ['i4r', 4 + rank],
    ['c2', horde ? 16 : 9],
    ['c3m', horde ? 10 : 7],
    ['c3r', horde ? 18 : 3],
    ['c4m', 1 + rank],
    ['c4r', horde ? 4 : 1],
  ], r);
}

export function garrisonTroops(s: Settlement, faction: FactionId, time: number, r: () => number, k = 1): Troops {
  const capital = FACTIONS[faction].capital === s.id;
  const base = s.type === 'town' ? (capital ? 46 : 34) : 24;
  const size = Math.round((base + Math.min(20, time / 5)) * k);
  return mix(faction, size, [['i2', 26], ['i3m', 26], ['i3r', 30], ['i4m', 6], ['i4r', 12]], r);
}

export function troopCount(t: Troops): number {
  return t.reduce((s, x) => s + x.count, 0);
}

function addTo(t: Troops, id: string, n: number) {
  const x = t.find((y) => y.id === id);
  if (x) x.count += n;
  else t.push({ id, count: n });
}

// ───────────────────────── инициализация ─────────────────────────

export function initWar(state: GameState) {
  if (state.war && state.lords) return;
  const r = mulberry32(1347);
  state.war = {
    garrisons: {},
    sieges: {},
    campaigns: {},
    news: [],
    looted: {},
    lastDiplo: Math.floor(state.time),
    warSince: {},
    eliminated: [],
  };
  for (const [a, b] of state.wars) state.war.warSince[pairKey(a, b)] = 0;
  for (const s of world.settlements) {
    if (s.type === 'village') continue;
    state.war.garrisons[s.id] = garrisonTroops(s, state.settlements[s.id].owner, state.time, r);
  }
  state.lords = [];
  let id = 100000;
  for (const f of FACTION_IDS) {
    const own = world.settlements.filter((s) => s.type !== 'village' && state.settlements[s.id].owner === f);
    LORDS[f].forEach((def, i) => {
      const home = def.rank === 3 ? world.byId.get(FACTIONS[f].capital)! : own[i % own.length];
      const p = spawnPointNear(home);
      state.lords!.push({
        id: id++,
        kind: 'lord',
        name: `${def.title} ${def.name}`,
        faction: f,
        x: p.x,
        y: p.y,
        hx: home.cx,
        hy: home.cy,
        troops: lordArmy(f, def.rank, state.time, r),
        gold: 150 + def.rank * 150,
        loot: {},
        calmUntil: 0,
        lord: { name: def.name, title: def.title, rank: def.rank, status: 'active', recoverAt: 0, task: 'idle', home: home.id },
      });
    });
  }
  news(state, 'Весна 1347 года. Над Евразией сгущаются тучи войны.', 'info');
  for (const [a, b] of state.wars) news(state, `${FACTIONS[a].short} и ${FACTIONS[b].short} воюют.`, 'war');
}

/** «город Москва» / «замок Мальборк» — без склонения самих названий. */
export function placeName(s: Settlement): string {
  return `${s.type === 'town' ? 'город' : s.type === 'castle' ? 'замок' : 'деревню'} ${s.name}`;
}

function realm(f: FactionId): string {
  return `«${FACTIONS[f].short}»`;
}

function pairKey(a: FactionId, b: FactionId) {
  return [a, b].sort().join('|');
}

export function news(state: GameState, text: string, kind: NewsItem['kind']) {
  const w = state.war!;
  w.news.unshift({ t: state.time, text, kind });
  if (w.news.length > 120) w.news.length = 120;
  newsListeners.forEach((fn) => fn(text, kind));
}

const newsListeners: ((text: string, kind: NewsItem['kind']) => void)[] = [];
export function onNews(fn: (text: string, kind: NewsItem['kind']) => void) {
  newsListeners.length = 0;
  newsListeners.push(fn);
}

// ───────────────────────── владения ─────────────────────────

export function ownerOfId(state: GameState, id: string): FactionId {
  return state.settlements[id].owner;
}

function fortsOf(state: GameState, f: FactionId): Settlement[] {
  return world.settlements.filter((s) => s.type !== 'village' && state.settlements[s.id].owner === f);
}

export function activeLords(state: GameState, f?: FactionId): MapParty[] {
  return (state.lords ?? []).filter((l) => l.lord!.status === 'active' && (!f || l.faction === f));
}

/** Переход крепости к новому владельцу вместе с приписанными деревнями. */
export function capture(state: GameState, s: Settlement, to: FactionId, byPlayer: boolean) {
  const from = state.settlements[s.id].owner;
  state.settlements[s.id].owner = to;
  for (const v of s.villages) state.settlements[v].owner = to;
  const r = mulberry32(Math.floor(state.time * 100) + s.cx);
  state.war!.garrisons[s.id] = garrisonTroops(s, to, state.time, r, byPlayer ? 0.45 : 0.55);
  delete state.war!.sieges[s.id];
  for (const f of FACTION_IDS) if (state.war!.campaigns[f]?.target === s.id) delete state.war!.campaigns[f];
  news(
    state,
    byPlayer
      ? `${state.hero.name} взял ${placeName(s)}! Крепость переходит под руку государя: ${FACTIONS[to].rulerTitle.toLowerCase()} ${FACTIONS[to].ruler}.`
      : `${FACTIONS[to].short} захватывает ${placeName(s)}. Прежний владелец — ${realm(from)}.`,
    byPlayer ? 'player' : 'capture',
  );
  checkElimination(state, from);
  checkOutcome(state);
  ownershipChanged = true;
}

let ownershipChanged = false;
/** Сцена карты опрашивает этот флаг, чтобы перерисовать границы. */
export function takeOwnershipChanged(): boolean {
  const v = ownershipChanged;
  ownershipChanged = false;
  return v;
}

function checkElimination(state: GameState, f: FactionId) {
  const w = state.war!;
  if (w.eliminated.includes(f)) return;
  if (fortsOf(state, f).length > 0) return;
  w.eliminated.push(f);
  state.lords = (state.lords ?? []).filter((l) => l.faction !== f);
  state.wars = state.wars.filter(([a, b]) => a !== f && b !== f);
  news(state, `${FACTIONS[f].name} пала. ${FACTIONS[f].rulerTitle} ${FACTIONS[f].ruler} бежал в изгнание.`, 'war');
}

function checkOutcome(state: GameState) {
  const w = state.war!;
  const mine = state.hero.faction;
  const forts = world.settlements.filter((s) => s.type !== 'village');
  if (forts.every((s) => state.settlements[s.id].owner === mine)) w.outcome = 'victory';
  else if (w.eliminated.includes(mine)) w.outcome = 'defeat';
}

// ───────────────────────── бои ИИ ─────────────────────────

interface Side {
  lords: MapParty[];
  garrison?: { id: string; troops: Troops };
  faction: FactionId;
}

function sideTroops(side: Side): Troops[] {
  return [...side.lords.map((l) => l.troops), ...(side.garrison ? [side.garrison.troops] : [])];
}

/** Потери: доля frac от каждого стека (с вероятностным округлением). */
function bleed(lists: Troops[], frac: number) {
  for (const list of lists) {
    for (const t of list) {
      const x = t.count * frac;
      t.count = Math.max(0, t.count - Math.floor(x) - (Math.random() < x % 1 ? 1 : 0));
    }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].count <= 0) list.splice(i, 1);
  }
}

/**
 * Бой двух сторон ИИ вдали от игрока: быстрый расчёт по силам (полная симуляция
 * здесь слишком дорога для телефона). Возвращает true, если победил атакующий.
 */
function fight(state: GameState, att: Side, def: Side, siege: boolean): boolean {
  const sA = sideTroops(att).reduce((n, l) => n + strength(l), 0) * (0.85 + Math.random() * 0.3);
  const sD = sideTroops(def).reduce((n, l) => n + strength(l), 0) * (siege ? 1.45 : 1) * (0.85 + Math.random() * 0.3);
  const pA = Math.pow(sA, 1.7) / (Math.pow(sA, 1.7) + Math.pow(sD, 1.7) || 1);
  const attWon = Math.random() < pA;
  const [win, lose, sw, sl] = attWon ? [att, def, sA, sD] : [def, att, sD, sA];
  bleed(sideTroops(win), Math.min(0.6, 0.08 + 0.35 * (sl / Math.max(1, sw))));
  bleed(sideTroops(lose), 0.55 + Math.random() * 0.3);
  for (const l of lose.lords) defeatLord(state, l, win.faction);
  return attWon;
}

export function defeatLord(state: GameState, l: MapParty, by: FactionId | 'player') {
  const info = l.lord!;
  info.status = 'defeated';
  info.recoverAt = state.time + 10 + Math.random() * 6;
  info.task = 'idle';
  info.target = undefined;
  l.troops = [];
  partyRuntime(l).path = [];
  news(state, by === 'player' ? `${state.hero.name} разбил ${l.name}. Тот бежал с горсткой людей.` : `${l.name} разбит войском державы ${realm(by)} и бежал.`, by === 'player' ? 'player' : 'battle');
}

// ───────────────────────── ежедневная логика ─────────────────────────

export function warDaily(state: GameState) {
  const w = state.war;
  if (!w || w.outcome) return;
  const r = mulberry32(Math.floor(state.time) * 977 + 13);
  diplomacy(state, r);

  // Возвращение разбитых лордов
  for (const l of state.lords ?? []) {
    const info = l.lord!;
    if (info.status === 'defeated' && state.time >= info.recoverAt) {
      const forts = fortsOf(state, l.faction as FactionId);
      if (!forts.length) continue;
      const home = forts.find((s) => s.id === info.home) ?? forts[Math.floor(r() * forts.length)];
      const p = spawnPointNear(home);
      l.x = p.x;
      l.y = p.y;
      l.hx = home.cx;
      l.hy = home.cy;
      l.troops = lordArmy(l.faction as FactionId, info.rank, state.time, r).map((t) => ({ ...t, count: Math.ceil(t.count * 0.7) }));
      info.status = 'active';
      info.task = 'idle';
      info.home = home.id;
      news(state, `${l.name} собрал новое войско. Ставка: ${home.name}.`, 'lord');
    } else if (info.status === 'active') {
      // Пополнение дружины
      const target = lordArmy(l.faction as FactionId, info.rank, state.time, r);
      if (troopCount(l.troops) < troopCount(target)) {
        const pick = target[Math.floor(r() * target.length)];
        addTo(l.troops, pick.id, 2);
      }
    }
  }

  // Гарнизоны пополняются, если не в осаде
  for (const s of world.settlements) {
    if (s.type === 'village' || w.sieges[s.id]) continue;
    const g = (w.garrisons[s.id] ??= []);
    const full = garrisonTroops(s, state.settlements[s.id].owner, state.time, r);
    if (troopCount(g) < troopCount(full)) addTo(g, full[Math.floor(r() * full.length)].id, 1);
  }

  // Походы
  for (const f of FACTION_IDS) {
    if (w.eliminated.includes(f)) continue;
    const enemies = FACTION_IDS.filter((e) => e !== f && atWar(state, f, e));
    let c = w.campaigns[f];
    if (c && (!enemies.includes(state.settlements[c.target].owner) || state.time - c.since > 25)) {
      delete w.campaigns[f];
      c = undefined;
    }
    if (!c && enemies.length) {
      const target = pickTarget(state, f, enemies);
      if (target) {
        w.campaigns[f] = { target: target.id, since: state.time };
        const lords = activeLords(state, f);
        const go = lords.filter((l) => l.lord!.task !== 'relieve' && l.lord!.rank < 3).slice(0, Math.max(2, Math.ceil(lords.length * 0.75)));
        if (lords.find((l) => l.lord!.rank === 3) && r() < 0.5) go.push(lords.find((l) => l.lord!.rank === 3)!);
        for (const l of go) {
          l.lord!.task = 'campaign';
          l.lord!.target = target.id;
          partyRuntime(l).repathAt = 0;
        }
        if (go.length) news(state, `${FACTIONS[f].short} выступает в поход на ${placeName(target)}.`, state.settlements[target.id].owner === state.hero.faction ? 'war' : 'lord');
      }
    }
    // Вернувшиеся после разгрома лорды присоединяются к идущему походу
    const cur = w.campaigns[f];
    if (cur) {
      for (const l of activeLords(state, f)) {
        if (l.lord!.task !== 'idle' || l.lord!.rank === 3 || r() > 0.3) continue;
        l.lord!.task = 'campaign';
        l.lord!.target = cur.target;
        partyRuntime(l).repathAt = 0;
      }
    }
  }

  // Осады: штурм через полтора дня
  for (const [sid, sg] of Object.entries(w.sieges)) {
    const s = world.byId.get(sid)!;
    const owner = state.settlements[sid].owner;
    if (!atWar(state, sg.attacker, owner)) {
      delete w.sieges[sid];
      continue;
    }
    const attackers = activeLords(state, sg.attacker).filter((l) => distCells(l, s) < 6);
    if (!attackers.length) {
      delete w.sieges[sid];
      news(state, `Осаждавшие ушли: ${placeName(s)} свободен.`, 'battle');
      continue;
    }
    if (state.time - sg.since < 1.5) continue;
    const defenders = activeLords(state, owner).filter((l) => distCells(l, s) < 6);
    const garrison = { id: sid, troops: w.garrisons[sid] ?? [] };
    const won = fight(state, { lords: attackers, faction: sg.attacker }, { lords: defenders, garrison, faction: owner }, true);
    w.garrisons[sid] = garrison.troops;
    if (won) {
      capture(state, s, sg.attacker, false);
      for (const l of attackers) if (l.lord!.status === 'active') l.lord!.task = 'idle';
    } else {
      delete w.sieges[sid];
      news(state, `Гарнизон отбил штурм: ${placeName(s)} устоял! Войско державы ${realm(sg.attacker)} бежит.`, 'battle');
    }
  }

  // Помощь осаждённым
  for (const [sid] of Object.entries(w.sieges)) {
    const s = world.byId.get(sid)!;
    const owner = state.settlements[sid].owner;
    for (const l of activeLords(state, owner)) {
      if (l.lord!.task === 'relieve' || distCells(l, s) > 55) continue;
      l.lord!.task = 'relieve';
      l.lord!.target = sid;
      partyRuntime(l).repathAt = 0;
    }
  }
  for (const l of state.lords ?? []) {
    const info = l.lord!;
    if (info.task === 'relieve' && (!info.target || !w.sieges[info.target])) info.task = 'idle';
  }
}

function pickTarget(state: GameState, f: FactionId, enemies: FactionId[]): Settlement | null {
  const own = fortsOf(state, f);
  if (!own.length) return null;
  let best: Settlement | null = null;
  let bestScore = Infinity;
  for (const s of world.settlements) {
    if (s.type === 'village' || !enemies.includes(state.settlements[s.id].owner)) continue;
    let d = Infinity;
    for (const o of own) d = Math.min(d, Math.hypot(o.cx - s.cx, o.cy - s.cy));
    const g = troopCount(state.war!.garrisons[s.id] ?? []);
    const score = d + g * 0.6 + (s.type === 'town' ? -6 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

function diplomacy(state: GameState, r: () => number) {
  const w = state.war!;
  if (state.time - w.lastDiplo < 6) return;
  w.lastDiplo = state.time;
  const alive = FACTION_IDS.filter((f) => !w.eliminated.includes(f));
  // Мир после долгой войны
  for (const [a, b] of [...state.wars]) {
    const since = w.warSince[pairKey(a, b)] ?? 0;
    const playerWar = a === state.hero.faction || b === state.hero.faction;
    if (state.time - since > 40 && r() < (playerWar ? 0.12 : 0.22)) {
      state.wars = state.wars.filter(([x, y]) => !(x === a && y === b));
      for (const [sid, sg] of Object.entries(w.sieges)) if ((sg.attacker === a && state.settlements[sid].owner === b) || (sg.attacker === b && state.settlements[sid].owner === a)) delete w.sieges[sid];
      news(state, `${FACTIONS[a].short} и ${FACTIONS[b].short} заключили мир.`, 'peace');
    }
  }
  // Новые войны: держава без войны ищет повод
  for (const f of alive) {
    const hasWar = state.wars.some(([a, b]) => a === f || b === f);
    if (hasWar && r() > 0.12) continue;
    const others = alive.filter((o) => o !== f && !atWar(state, f, o));
    if (!others.length || r() > 0.55) continue;
    const o = others[Math.floor(r() * others.length)];
    state.wars.push([f, o]);
    w.warSince[pairKey(f, o)] = state.time;
    news(state, `${FACTIONS[f].rulerTitle} ${FACTIONS[f].ruler} объявляет войну: ${FACTIONS[f].short} против ${FACTIONS[o].short}!`, 'war');
  }
}

function distCells(p: { x: number; y: number }, s: Settlement): number {
  return Math.hypot(p.x - s.x, p.y - s.y) / TILE;
}

// ───────────────────────── движение (каждый кадр) ─────────────────────────

/** Последняя цель похода каждого лорда (чтобы не искать путь заново каждый раз). */
const goalOf = new Map<number, string>();

/**
 * Движение лордов и их столкновения. Возвращает лорда, настигшего игрока, или null.
 */
export function warUpdate(state: GameState, dtDays: number, targetId: number | null): MapParty | null {
  const w = state.war;
  if (!w || w.outcome) return null;
  const lords = activeLords(state);
  let met: MapParty | null = null;
  const pc = worldToCell(state.party.x, state.party.y);
  for (const l of lords) {
    const info = l.lord!;
    const r = partyRuntime(l);
    const f = l.faction as FactionId;
    const playerEnemy = atWar(state, f, state.hero.faction);
    const dPlayer = Math.hypot(l.x - state.party.x, l.y - state.party.y) / TILE;
    const chase = playerEnemy && state.time >= l.calmUntil && dPlayer < 9 && powerRatio(state, l) > 1.1 && info.task !== 'relieve';
    r.repathAt -= dtDays;
    if (chase) {
      if (goalOf.get(l.id) !== 'chase') {
        goalOf.set(l.id, 'chase');
        r.repathAt = 0;
      }
      if (r.repathAt <= 0) {
        r.path = dPlayer < 2.5 ? [{ x: state.party.x, y: state.party.y }] : pathTo(l, pc.cx, pc.cy);
        r.repathAt = 0.15;
      }
    } else if (info.target && (info.task === 'campaign' || info.task === 'relieve')) {
      const s = world.byId.get(info.target)!;
      const d = distCells(l, s);
      if (d > 3) {
        // Цель неподвижна: путь ищем заново, только когда сменилась цель или путь кончился
        const key = `${info.task}:${s.id}`;
        if (goalOf.get(l.id) !== key || (!r.path.length && r.repathAt <= 0)) {
          goalOf.set(l.id, key);
          const goal = spawnPointNear(s);
          const g = worldToCell(goal.x, goal.y);
          r.path = pathTo(l, g.cx, g.cy);
          r.repathAt = r.path.length ? 0.8 : 3; // недостижимую цель не ищем каждый миг
        }
      } else {
        r.path = [];
        if (info.task === 'campaign' && !w.sieges[s.id] && atWar(state, f, state.settlements[s.id].owner)) {
          w.sieges[s.id] = { attacker: f, since: state.time };
          news(state, `${l.name} осаждает ${placeName(s)}.`, state.settlements[s.id].owner === state.hero.faction ? 'war' : 'battle');
        }
      }
    } else if (!r.path.length && r.repathAt <= 0) {
      goalOf.delete(l.id);
      // Бродим у дома
      const rr = mulberry32(l.id * 31 + Math.floor(state.time * 3));
      const tx = l.hx + Math.round((rr() - 0.5) * 14);
      const ty = l.hy + Math.round((rr() - 0.5) * 10);
      if (isFinite(getLandCost()[ty * GRID_W + tx])) r.path = pathTo(l, tx, ty);
      r.repathAt = 1 + rr() * 2;
    }
    advance(l, dtDays, chase ? 17 : info.task === 'idle' ? 10 : 16);
    const dNow = Math.hypot(l.x - state.party.x, l.y - state.party.y) / TILE;
    if (!met && playerEnemy && state.time >= l.calmUntil && dNow < 1.3 && (chase || l.id === targetId)) met = l;
  }

  // Встречи лордов враждующих держав: полевые бои
  for (let i = 0; i < lords.length; i++) {
    const a = lords[i];
    if (a.lord!.status !== 'active' || state.time < (a.lord!.truceUntil ?? 0)) continue;
    for (let j = i + 1; j < lords.length; j++) {
      const b = lords[j];
      if (b.lord!.status !== 'active' || a.faction === b.faction || state.time < (b.lord!.truceUntil ?? 0)) continue;
      if (!atWar(state, a.faction as FactionId, b.faction as FactionId)) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) / TILE > 1.6) continue;
      // Союзники поблизости вступают в бой
      const sideA = lords.filter((l) => l.faction === a.faction && l.lord!.status === 'active' && Math.hypot(l.x - a.x, l.y - a.y) / TILE < 4);
      const sideB = lords.filter((l) => l.faction === b.faction && l.lord!.status === 'active' && Math.hypot(l.x - b.x, l.y - b.y) / TILE < 4);
      const aWon = fight(state, { lords: sideA, faction: a.faction as FactionId }, { lords: sideB, faction: b.faction as FactionId }, false);
      const winner = aWon ? sideA : sideB;
      for (const l of winner) l.lord!.truceUntil = state.time + 0.5;
      news(state, `Битва: ${(aWon ? sideA : sideB)[0].name} разбивает ${(aWon ? sideB : sideA)[0].name}.`, 'battle');
    }
  }
  return met;
}

/** Состав обороняющихся для осады игроком: гарнизон и лорды рядом. */
export function siegeDefenders(state: GameState, s: Settlement): { garrison: Troops; lords: MapParty[] } {
  const owner = state.settlements[s.id].owner;
  return { garrison: state.war?.garrisons[s.id] ?? [], lords: activeLords(state, owner).filter((l) => distCells(l, s) < 5) };
}

export function mergeTroops(lists: Troops[]): Troops {
  const out: Troops = [];
  for (const l of lists) for (const t of l) addTo(out, t.id, t.count);
  return out;
}

/** Вычесть потери из гарнизона и лордов по сводке боя (стек по id воина, пропорционально). */
export function distributeLosses(dead: Map<string, number>, lists: Troops[]) {
  for (const [id, n0] of dead) {
    let n = n0;
    for (const l of lists) {
      const t = l.find((x) => x.id === id);
      if (!t || n <= 0) continue;
      const k = Math.min(t.count, n);
      t.count -= k;
      n -= k;
    }
  }
  for (const l of lists) for (let i = l.length - 1; i >= 0; i--) if (l[i].count <= 0) l.splice(i, 1);
}

export function isLooted(state: GameState, id: string): boolean {
  return (state.war?.looted[id] ?? 0) > state.time;
}

export function villageMilitia(s: Settlement, time: number): Troops {
  const n = 7 + Math.floor(Math.min(10, time / 10));
  return [
    { id: `${s.culture}_i1`, count: n },
    { id: `${s.culture}_i2`, count: Math.ceil(n / 3) },
  ];
}


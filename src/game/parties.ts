// Отряды на глобальной карте: разбойники, налётчики, дезертиры, вражеские разъезды.
// Чистая логика без Phaser; сцена карты только рисует.

import { strength } from '../battle/setup';
import { GRID_H, GRID_W, PARTY_SPEED, TILE } from '../config';
import { FACTIONS, FACTION_IDS, type FactionId } from '../data/factions';
import { GOODS, type GoodId } from '../data/goods';
import { cellCenterWorld, worldToCell } from '../map/geo';
import { findPath } from '../map/pathfinding';
import { T } from '../map/terrain';
import { mulberry32 } from '../util/rng';
import { atWar, partySize } from './logic';
import type { GameState } from './state';
import { isWaterCell, world } from './world';

export type PartyKind = 'bandits' | 'raiders' | 'desert' | 'pirates' | 'deserters' | 'patrol' | 'lord';

export interface MapParty {
  id: number;
  kind: PartyKind;
  name: string;
  faction: FactionId | 'outlaw';
  x: number;
  y: number;
  hx: number;
  hy: number;
  troops: { id: string; count: number }[];
  gold: number;
  loot: Partial<Record<GoodId, number>>;
  /** До какого игрового времени отряд не нападает (после боя или бегства игрока). */
  calmUntil: number;
  /** Для лордов: сведения о лорде. */
  lord?: LordInfo;
  /** Отряд, за которым охотится поручение. */
  questId?: number;
}

export interface LordInfo {
  name: string;
  title: string;
  rank: 1 | 2 | 3;
  status: 'active' | 'defeated';
  recoverAt: number;
  task: 'idle' | 'campaign' | 'relieve';
  target?: string;
  home: string;
  /** Не вступать в бой с другими лордами до этого времени. */
  truceUntil?: number;
}

interface Runtime {
  path: { x: number; y: number }[];
  mode: 'wander' | 'chase' | 'flee';
  repathAt: number;
  facing: number;
  moving: boolean;
}

export const KIND_INFO: Record<PartyKind, { name: string; speed: number; about: string }> = {
  bandits: { name: 'Разбойники', speed: 15, about: 'Шайка лесных грабителей. Промышляют на дорогах, нападают на слабых.' },
  raiders: { name: 'Степные налётчики', speed: 21, about: 'Конные грабители степи. Быстры, стреляют на скаку и не любят честного боя.' },
  desert: { name: 'Пустынные разбойники', speed: 20, about: 'Всадники пустыни, живущие грабежом караванов.' },
  pirates: { name: 'Морские разбойники', speed: 14, about: 'Грабители с моря: высаживаются на берег и уходят с добычей.' },
  deserters: { name: 'Дезертиры', speed: 16, about: 'Сбежавшие из войска солдаты. Хорошо вооружены и отчаянны.' },
  patrol: { name: 'Разъезд', speed: 17, about: 'Вражеский отряд, охраняющий свои земли.' },
  lord: { name: 'Лорд', speed: 16, about: 'Вельможа державы со своей дружиной. Разбитый, он бежит и вернётся с новой армией.' },
};

const runtime = new Map<number, Runtime>();
let landCost: Float32Array | null = null;

export function getLandCost(): Float32Array {
  if (landCost) return landCost;
  const c = new Float32Array(world.map.cost);
  for (let i = 0; i < c.length; i++) if (isWaterCell(i)) c[i] = Infinity;
  landCost = c;
  return c;
}

function rt(p: MapParty): Runtime {
  let r = runtime.get(p.id);
  if (!r) {
    r = { path: [], mode: 'wander', repathAt: 0, facing: 1, moving: false };
    runtime.set(p.id, r);
  }
  return r;
}

export function partyRuntime(p: MapParty) {
  return rt(p);
}

export function partyCount(p: MapParty): number {
  return p.troops.reduce((s, t) => s + t.count, 0);
}

// ───────────────────────── появление ─────────────────────────

const OUTLAW_TARGET = 34;
const PATROLS_PER_ENEMY = 3;

function randInt(r: () => number, a: number, b: number) {
  return a + Math.floor(r() * (b - a + 1));
}

function scale(state: GameState): number {
  return Math.min(3, 1 + state.time / 50);
}

function makeTroops(kind: PartyKind, faction: FactionId | 'outlaw', state: GameState, r: () => number): { id: string; count: number }[] {
  const k = scale(state);
  const n = (a: number, b: number) => Math.max(0, Math.round(randInt(r, a, b) * k));
  const list: [string, number][] = [];
  switch (kind) {
    case 'bandits':
      list.push(['outlaw_bandit', n(4, 9)], ['outlaw_archer', n(0, 3)], ['outlaw_leader', r() < 0.4 + k * 0.2 ? 1 : 0]);
      break;
    case 'raiders':
      list.push(['outlaw_raider', n(3, 7)], ['outlaw_bandit', n(0, 4)]);
      break;
    case 'desert':
      list.push(['outlaw_desert', n(3, 6)], ['outlaw_bandit', n(1, 4)]);
      break;
    case 'pirates':
      list.push(['outlaw_pirate', n(4, 8)], ['outlaw_archer', n(1, 3)]);
      break;
    case 'deserters': {
      const f = faction === 'outlaw' ? FACTION_IDS[Math.floor(r() * 4)] : faction;
      list.push([`${f}_i2`, n(2, 5)], [`${f}_i3m`, n(1, 3)], [`${f}_i3r`, n(1, 3)]);
      break;
    }
    case 'patrol': {
      const f = faction as FactionId;
      list.push([`${f}_i2`, n(3, 6)], [`${f}_i3m`, n(2, 4)], [`${f}_i3r`, n(2, 4)], [`${f}_c2`, n(1, 3)], [`${f}_c3m`, n(0, 2)], [`${f}_c3r`, f === 'horde' ? n(2, 4) : 0]);
      break;
    }
  }
  return list.filter(([, c]) => c > 0).map(([id, count]) => ({ id, count }));
}

function randomLoot(r: () => number, kind: PartyKind): Partial<Record<GoodId, number>> {
  const pool: GoodId[] =
    kind === 'raiders' ? ['leather', 'wool', 'salt', 'silk'] : kind === 'desert' ? ['dates', 'spices', 'incense', 'cotton'] : kind === 'pirates' ? ['fish', 'amber', 'wine', 'cloth'] : ['grain', 'wool', 'ale', 'iron', 'leather', 'honey', 'wine'];
  const out: Partial<Record<GoodId, number>> = {};
  const n = randInt(r, 1, 3);
  for (let i = 0; i < n; i++) {
    const g = pool[Math.floor(r() * pool.length)];
    out[g] = (out[g] ?? 0) + randInt(r, 1, GOODS[g].price > 150 ? 2 : 5);
  }
  return out;
}

function goodSpawnCell(cx: number, cy: number, r: () => number, minPlayerDist: number, state: GameState): { cx: number; cy: number } | null {
  const pc = worldToCell(state.party.x, state.party.y);
  const cost = getLandCost();
  for (let i = 0; i < 30; i++) {
    const a = r() * Math.PI * 2;
    const d = 4 + r() * 8;
    const x = Math.round(cx + Math.cos(a) * d);
    const y = Math.round(cy + Math.sin(a) * d);
    if (x < 1 || y < 1 || x >= GRID_W - 1 || y >= GRID_H - 1) continue;
    if (!isFinite(cost[y * GRID_W + x])) continue;
    if (Math.hypot(x - pc.cx, y - pc.cy) < minPlayerDist) continue;
    return { cx: x, cy: y };
  }
  return null;
}

function nearCoast(cx: number, cy: number): boolean {
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const x = cx + dx;
    const y = cy + dy;
    if (x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && isWaterCell(y * GRID_W + x)) return true;
  }
  return false;
}

export function spawn(state: GameState, kind: PartyKind | null, faction: FactionId | 'outlaw', near: { cx: number; cy: number }, r: () => number): MapParty | null {
  const c = goodSpawnCell(near.cx, near.cy, r, 12, state);
  if (!c) return null;
  const t = world.map.terrain[c.cy * GRID_W + c.cx];
  let k: PartyKind = kind ?? 'bandits';
  if (!kind) {
    if (t === T.STEPPE) k = r() < 0.75 ? 'raiders' : 'bandits';
    else if (t === T.DESERT || t === T.DRY && r() < 0.3) k = 'desert';
    else if (nearCoast(c.cx, c.cy) && r() < 0.35) k = 'pirates';
    else k = r() < 0.2 ? 'deserters' : 'bandits';
  }
  const pos = cellCenterWorld(c.cx, c.cy);
  const id = (state.nextPartyId = (state.nextPartyId ?? 1) + 1);
  let fac: FactionId | 'outlaw' = faction;
  if (k === 'deserters') fac = FACTION_IDS[Math.floor(r() * 4)];
  const name = k === 'patrol' ? `Разъезд: ${FACTIONS[fac as FactionId].short}` : k === 'deserters' ? `Дезертиры (${FACTIONS[fac as FactionId].short})` : KIND_INFO[k].name;
  const p: MapParty = {
    id,
    kind: k,
    name,
    faction: k === 'deserters' ? 'outlaw' : fac,
    x: pos.x,
    y: pos.y,
    hx: c.cx,
    hy: c.cy,
    troops: makeTroops(k, fac, state, r),
    gold: randInt(r, 20, 90),
    loot: k === 'patrol' ? {} : randomLoot(r, k),
    calmUntil: 0,
  };
  if (!p.troops.length) return null;
  return p;
}

/** Раз в игровой день: дополняем число отрядов до целевого. */
export function dailySpawn(state: GameState) {
  state.parties ??= [];
  const r = mulberry32((Math.floor(state.time) * 7919) ^ 0x5a5a);
  const outlaws = state.parties.filter((p) => p.kind !== 'patrol').length;
  const need = Math.min(6, OUTLAW_TARGET - outlaws);
  for (let i = 0; i < need; i++) {
    const s = world.settlements[Math.floor(r() * world.settlements.length)];
    const p = spawn(state, null, 'outlaw', { cx: s.cx, cy: s.cy }, r);
    if (p) state.parties.push(p);
  }
  // Разъезды держав, воюющих с игроком
  for (const f of FACTION_IDS) {
    if (f === state.hero.faction || !atWar(state, f, state.hero.faction)) continue;
    const have = state.parties.filter((p) => p.kind === 'patrol' && p.faction === f).length;
    for (let i = have; i < PATROLS_PER_ENEMY; i++) {
      const own = world.settlements.filter((s) => s.type !== 'village' && state.settlements[s.id].owner === f);
      if (!own.length) break;
      const s = own[Math.floor(r() * own.length)];
      const p = spawn(state, 'patrol', f, { cx: s.cx, cy: s.cy }, r);
      if (p) state.parties.push(p);
    }
  }
}

// ───────────────────────── движение и ИИ ─────────────────────────

export function pathTo(p: MapParty, tx: number, ty: number): { x: number; y: number }[] {
  const s = worldToCell(p.x, p.y);
  const raw = findPath(getLandCost(), s.cx, s.cy, tx, ty, 25000);
  if (!raw) return [];
  const pts: { x: number; y: number }[] = [];
  for (let i = 1; i < raw.length; i += 2) pts.push(cellCenterWorld(raw[i] % GRID_W, (raw[i] / GRID_W) | 0));
  const last = raw[raw.length - 1];
  pts.push(cellCenterWorld(last % GRID_W, (last / GRID_W) | 0));
  return pts;
}

/** Сравнение сил: >1 — отряд сильнее игрока. */
export function powerRatio(state: GameState, p: MapParty): number {
  const mine = strength(p.troops);
  const player = strength(state.party.troops, true) + 1;
  return mine / player;
}

/**
 * Шаг ИИ всех отрядов. Возвращает отряд, догнавший игрока (встреча), или null.
 * targetId — отряд, за которым сейчас идёт сам игрок.
 */
export function updateParties(state: GameState, dtDays: number, targetId: number | null): MapParty | null {
  const parties = state.parties ?? [];
  const px = state.party.x;
  const py = state.party.y;
  const pc = worldToCell(px, py);
  let met: MapParty | null = null;
  const playerAlive = partySize(state) >= 0;
  for (const p of parties) {
    const r = rt(p);
    const dCells = Math.hypot(p.x - px, p.y - py) / TILE;
    const calm = state.time < p.calmUntil;
    const sight = p.kind === 'patrol' ? 11 : 9;
    const ratio = powerRatio(state, p);
    const hostile = p.kind !== 'patrol' || atWar(state, p.faction as FactionId, state.hero.faction);
    let mode: Runtime['mode'] = 'wander';
    if (hostile && !calm && playerAlive && dCells < sight) {
      mode = ratio > (p.kind === 'patrol' ? 0.7 : 0.85) ? 'chase' : dCells < 7 ? 'flee' : 'wander';
    }
    if (mode !== r.mode) {
      r.mode = mode;
      r.repathAt = 0;
    }
    r.repathAt -= dtDays;
    if (r.repathAt <= 0 || (!r.path.length && mode !== 'chase')) {
      if (mode === 'chase') {
        r.path = dCells < 2.5 ? [{ x: px, y: py }] : pathTo(p, pc.cx, pc.cy);
        r.repathAt = 0.12;
      } else if (mode === 'flee') {
        const pcx = worldToCell(p.x, p.y);
        const ax = pcx.cx - pc.cx;
        const ay = pcx.cy - pc.cy;
        const len = Math.hypot(ax, ay) || 1;
        const tx = Math.max(1, Math.min(GRID_W - 2, Math.round(pcx.cx + (ax / len) * 12)));
        const ty = Math.max(1, Math.min(GRID_H - 2, Math.round(pcx.cy + (ay / len) * 12)));
        r.path = pathTo(p, tx, ty);
        r.repathAt = 0.3;
      } else if (!r.path.length) {
        const rr = mulberry32(p.id * 131 + Math.floor(state.time * 10));
        const tx = Math.max(1, Math.min(GRID_W - 2, p.hx + Math.round((rr() - 0.5) * 20)));
        const ty = Math.max(1, Math.min(GRID_H - 2, p.hy + Math.round((rr() - 0.5) * 16)));
        r.path = isFinite(getLandCost()[ty * GRID_W + tx]) ? pathTo(p, tx, ty) : [];
        r.repathAt = 0.5 + rr() * 1.5;
      }
    }
    // Движение
    const c = worldToCell(p.x, p.y);
    const cellCost = Math.min(3, getLandCost()[c.cy * GRID_W + c.cx] || 1);
    let remaining = ((KIND_INFO[p.kind].speed / 18) * PARTY_SPEED * TILE * dtDays) / (isFinite(cellCost) ? cellCost : 1);
    if (mode === 'wander') remaining *= 0.6;
    r.moving = remaining > 0 && r.path.length > 0;
    while (remaining > 0 && r.path.length) {
      const wp = r.path[0];
      const dx = wp.x - p.x;
      const dy = wp.y - p.y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.5) r.facing = dx < 0 ? -1 : 1;
      if (d <= remaining) {
        p.x = wp.x;
        p.y = wp.y;
        remaining -= d;
        r.path.shift();
      } else {
        p.x += (dx / d) * remaining;
        p.y += (dy / d) * remaining;
        remaining = 0;
      }
    }
    const dNow = Math.hypot(p.x - px, p.y - py) / TILE;
    if (!met && !calm && hostile && dNow < 1.3 && (mode === 'chase' || p.id === targetId)) met = p;
  }
  return met;
}

/** Движение отряда по его пути (для ИИ лордов). */
export function advance(p: MapParty, dtDays: number, speedCells: number) {
  const r = rt(p);
  const c = worldToCell(p.x, p.y);
  const cellCost = Math.min(3, getLandCost()[c.cy * GRID_W + c.cx] || 1);
  let remaining = (speedCells * TILE * dtDays) / (isFinite(cellCost) ? cellCost : 1);
  r.moving = remaining > 0 && r.path.length > 0;
  while (remaining > 0 && r.path.length) {
    const wp = r.path[0];
    const dx = wp.x - p.x;
    const dy = wp.y - p.y;
    const d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.5) r.facing = dx < 0 ? -1 : 1;
    if (d <= remaining) {
      p.x = wp.x;
      p.y = wp.y;
      remaining -= d;
      r.path.shift();
    } else {
      p.x += (dx / d) * remaining;
      p.y += (dy / d) * remaining;
      remaining = 0;
    }
  }
}

export function removeParty(state: GameState, id: number) {
  state.parties = (state.parties ?? []).filter((p) => p.id !== id);
  runtime.delete(id);
}

export function resetPartyRuntime() {
  runtime.clear();
  landCost = null;
}

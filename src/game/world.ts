import { GRID_H, GRID_W, LON_FACTOR } from '../config';
import type { FactionId } from '../data/factions';
import { TOWN_BASE_GOODS, VILLAGE_PRODUCE, type GoodId } from '../data/goods';
import { BASE_SETTLEMENTS, VILLAGE_NAMES, type SettlementDef } from '../data/settlements';
import { cellCenterWorld, geoToCell } from '../map/geo';
import { T, type MapData } from '../map/terrain';
import { mulberry32 } from '../util/rng';

export interface Settlement extends SettlementDef {
  cx: number;
  cy: number;
  /** Мировые координаты центра клетки. */
  x: number;
  y: number;
  /** Что продаёт рынок. */
  goods: GoodId[];
  villages: string[];
}

export const world = {
  map: null as unknown as MapData,
  settlements: [] as Settlement[],
  byId: new Map<string, Settlement>(),
  /** Номер «острова» суши для каждой клетки (0 — вода/непроходимо). */
  landComponent: new Int32Array(GRID_W * GRID_H),
};

export function isWaterTerrain(t: number): boolean {
  return t === T.SEA || t === T.DEEP;
}

export function isWaterCell(i: number): boolean {
  return isWaterTerrain(world.map.terrain[i]);
}

function goodLand(i: number): boolean {
  const t = world.map.terrain[i];
  return !isWaterTerrain(t) && t !== T.PEAK && t !== T.MOUNTAIN && isFinite(world.map.cost[i]);
}

/** Ближайшая «хорошая» клетка суши (поиск в ширину). */
function snapToLand(cx: number, cy: number): { cx: number; cy: number } {
  const start = cy * GRID_W + cx;
  if (goodLand(start)) return { cx, cy };
  const seen = new Set<number>([start]);
  let frontier = [start];
  for (let d = 0; d < 40 && frontier.length; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        const ni = ny * GRID_W + nx;
        if (seen.has(ni)) continue;
        if (goodLand(ni)) return { cx: nx, cy: ny };
        seen.add(ni);
        next.push(ni);
      }
    }
    frontier = next;
  }
  return { cx, cy };
}

function labelLandComponents() {
  const comp = world.landComponent;
  comp.fill(0);
  let label = 0;
  const stack: number[] = [];
  for (let i = 0; i < comp.length; i++) {
    if (comp[i] || !goodLandOrRough(i)) continue;
    label++;
    comp[i] = label;
    stack.push(i);
    while (stack.length) {
      const c = stack.pop()!;
      const x = c % GRID_W;
      const y = (c / GRID_W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        const ni = ny * GRID_W + nx;
        if (comp[ni] || !goodLandOrRough(ni)) continue;
        comp[ni] = label;
        stack.push(ni);
      }
    }
  }
}

function goodLandOrRough(i: number): boolean {
  const t = world.map.terrain[i];
  return !isWaterTerrain(t) && isFinite(world.map.cost[i]);
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function pickSome<T>(rng: () => number, arr: T[], n: number): T[] {
  const a = [...arr];
  const out: T[] = [];
  while (out.length < n && a.length) out.push(a.splice(Math.floor(rng() * a.length), 1)[0]);
  return out;
}

/** Размещает города, замки и деревни на готовой карте. Детерминированно. */
export function buildWorld(map: MapData) {
  world.map = map;
  labelLandComponents();
  const list: Settlement[] = [];
  const nameIdx: Record<FactionId, number> = { aurelia: 0, nordmark: 0, horde: 0, sultanate: 0 };

  for (const def of BASE_SETTLEMENTS) {
    const g = geoToCell(def.lon, def.lat);
    const s = snapToLand(g.cx, g.cy);
    const p = cellCenterWorld(s.cx, s.cy);
    const goods = def.type === 'town' ? [...new Set([...TOWN_BASE_GOODS[def.culture], ...(def.goods ?? [])])] : [];
    list.push({ ...def, cx: s.cx, cy: s.cy, x: p.x, y: p.y, goods, villages: [] });
  }

  const parents = [...list];
  for (const parent of parents) {
    const count = parent.type === 'town' ? 2 : 1;
    const rng = mulberry32(hashStr(parent.id));
    for (let k = 0; k < count; k++) {
      const names = VILLAGE_NAMES[parent.culture];
      const name = names[nameIdx[parent.culture]++ % names.length];
      const pos = placeVillage(parent, list, rng);
      if (!pos) continue;
      const p = cellCenterWorld(pos.cx, pos.cy);
      const id = `${parent.id}_v${k + 1}`;
      const produce = pickSome(rng, VILLAGE_PRODUCE[parent.culture], 2 + Math.floor(rng() * 2));
      list.push({
        id,
        name,
        type: 'village',
        culture: parent.culture,
        lon: 0,
        lat: 0,
        parent: parent.id,
        cx: pos.cx,
        cy: pos.cy,
        x: p.x,
        y: p.y,
        goods: produce,
        villages: [],
        about: `Деревня, приписанная к ${parent.type === 'town' ? 'городу' : 'замку'} ${parent.name}.`,
      });
      parent.villages.push(id);
    }
  }

  world.settlements = list;
  world.byId = new Map(list.map((s) => [s.id, s]));
}

/** Клетка суши рядом с поселением (для появления отряда), в мировых координатах. */
export function spawnPointNear(s: Settlement): { x: number; y: number } {
  const comp = world.landComponent[s.cy * GRID_W + s.cx];
  for (let r = 3; r <= 8; r++) {
    for (let k = 0; k < 16; k++) {
      const ang = Math.PI * 0.35 + (k / 16) * Math.PI * 2;
      const cx = Math.round(s.cx + Math.cos(ang) * r);
      const cy = Math.round(s.cy + Math.sin(ang) * r);
      if (cx < 0 || cy < 0 || cx >= GRID_W || cy >= GRID_H) continue;
      const i = cy * GRID_W + cx;
      if (goodLand(i) && world.landComponent[i] === comp) return cellCenterWorld(cx, cy);
    }
  }
  return { x: s.x, y: s.y };
}

function placeVillage(parent: Settlement, existing: Settlement[], rng: () => number): { cx: number; cy: number } | null {
  const comp = world.landComponent[parent.cy * GRID_W + parent.cx];
  for (let attempt = 0; attempt < 80; attempt++) {
    const ang = rng() * Math.PI * 2;
    const dist = 1.35 + rng() * (attempt > 40 ? 1.6 : 1.0);
    const lon = parent.lon + (Math.cos(ang) * dist) / LON_FACTOR;
    const lat = parent.lat + Math.sin(ang) * dist;
    const g = geoToCell(lon, lat);
    if (g.cx < 1 || g.cy < 1 || g.cx >= GRID_W - 1 || g.cy >= GRID_H - 1) continue;
    const i = g.cy * GRID_W + g.cx;
    if (!goodLand(i) || world.landComponent[i] !== comp) continue;
    // Не ставить вплотную к другим поселениям (в клетках)
    const tooClose = existing.some((s) => Math.hypot(s.cx - g.cx, s.cy - g.cy) < (s.type === 'village' ? 5 : 6.5));
    if (tooClose) continue;
    return g;
  }
  return null;
}

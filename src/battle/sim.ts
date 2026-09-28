// Симуляция боя с видом сбоку. Не знает про Phaser: сцена только рисует состояние,
// а автобой гоняет ту же симуляцию без картинки.

import { TROOPS, type DamageType, type TroopDef } from '../data/troops';

export type Side = 0 | 1;
export type Group = 'hero' | 'inf' | 'ranged' | 'cav';
export type Order = 'attack' | 'hold' | 'retreat';
export type Formation = 'classic' | 'archers_front' | 'cav_charge';
export type Ability = 'volley' | 'stakes' | 'cry' | 'smoke';

export const FIELD_W = 2400;
/** Полоса поля, по которой свободно ходят бойцы (y — глубина). */
export const FIELD_Y0 = 424;
export const FIELD_Y1 = 566;
export const MID_Y = (FIELD_Y0 + FIELD_Y1) / 2;
/** Расстояние по глубине «весит» больше: полоса поля сжата перспективой. */
const Y_SCALE = 1.7;
export const METER = 6; // пикселей поля на «метр» дальности стрельбы
const MAX_ON_FIELD = 36;
/** Осада: стена защитников (сторона 1) начинается здесь. */
export const WALL_X = FIELD_W - 560;
const SPEED_K = 44;

export interface ArmyDef {
  name: string;
  culture: string;
  /** key — ключ стека для подсчёта потерь (по умолчанию id воина). */
  troops: { id: string; count: number; key?: string }[];
  hero?: { name: string; level: number; def: TroopDef };
  formation: Formation;
  morale: number;
}

export interface BUnit {
  uid: number;
  side: Side;
  troop: TroopDef;
  group: Group;
  isHero: boolean;
  stackKey: string;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  state: 'idle' | 'walk' | 'attack' | 'dead' | 'fled';
  anim: number;
  swing: number; // >0 — идёт замах, секунд до удара
  cd: number;
  target: BUnit | null;
  retarget: number;
  facing: 1 | -1;
  charge: boolean;
  chargeDist: number;
  flash: number;
  xp: number;
  routed: boolean;
  deadT: number;
  ammo: number;
  /** Стрелок на стене (осада). */
  onWall: boolean;
  /** Герой под управлением игрока держит блок. */
  blocking?: boolean;
}

/** Ручное управление героем игрока: направление движения (−1..1), удар, блок. */
export interface HeroControl {
  on: boolean;
  mx: number;
  my: number;
  /** Удар зажат: бить, как только готов. */
  attack: boolean;
  /** Одиночное нажатие удара ждёт готовности оружия. */
  tap: boolean;
  block: boolean;
}

export interface Projectile {
  x: number;
  y: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  arc: number;
  from: BUnit;
  target: BUnit;
  willHit: boolean;
  mult: number;
  kind: 'arrow' | 'bolt';
  done: boolean;
}

export interface Stake {
  x: number;
  y: number;
  side: Side;
  hp: number;
}

export type EventKind = 'breach' | 'hit' | 'crit' | 'block' | 'dodge' | 'death' | 'shoot' | 'charge' | 'rout' | 'cry' | 'stakes' | 'smoke' | 'volley' | 'heroDown';
export interface BattleEvent {
  kind: EventKind;
  x: number;
  y: number;
  side: Side;
  amount?: number;
}

const REACH = { short: 24, pole: 32, cav: 34 };

function isPole(t: TroopDef) {
  const w = t.look.weapon;
  return w === 'spear' || w === 'pitchfork' || w === 'halberd' || w === 'glaive';
}

export function groupOf(t: TroopDef): Group {
  if (t.line === 'cavalry') return 'cav';
  return t.role === 'ranged' ? 'ranged' : 'inf';
}

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

/** Расстояние на поле с учётом перспективы. */
function ed(dx: number, dy: number) {
  return Math.hypot(dx, dy * Y_SCALE);
}

export class Battle {
  units: BUnit[] = [];
  reserves: [BUnit[], BUnit[]] = [[], []];
  projectiles: Projectile[] = [];
  stakes: Stake[] = [];
  events: BattleEvent[] = [];
  morale: [number, number];
  maxMorale: [number, number];
  initialCount: [number, number];
  orders: [Record<Group, Order>, Record<Group, Order>];
  abilities: Record<Ability, { charges: number; cd: number }>;
  buff: [number, number] = [0, 0]; // секунд боевого клича
  smoke: { x: number; t: number } | null = null;
  time = 0;
  winner: Side | null = null;
  routed: [boolean, boolean] = [false, false];
  heroDown = false;
  heroCtl: HeroControl = { on: false, mx: 0, my: 0, attack: false, tap: false, block: false };
  private uid = 1;
  private aiCavDelay = 3;
  /** Осадный бой: сторона 1 обороняет стену. */
  readonly siege: boolean;
  /** Пехота у ворот перебита — можно лезть на стены. */
  breached = false;
  private attackers = new Map<number, number>();

  constructor(
    readonly armies: [ArmyDef, ArmyDef],
    readonly playerSide: Side = 0,
    opts: { siege?: boolean } = {},
  ) {
    this.siege = !!opts.siege;
    this.morale = [armies[0].morale, armies[1].morale];
    this.maxMorale = [armies[0].morale, armies[1].morale];
    this.orders = [
      { hero: 'attack', inf: 'attack', ranged: 'hold', cav: 'attack' },
      { hero: 'attack', inf: 'attack', ranged: 'hold', cav: 'hold' },
    ];
    this.abilities = {
      volley: { charges: 2, cd: 0 },
      stakes: { charges: 1, cd: 0 },
      cry: { charges: 1, cd: 0 },
      smoke: { charges: 1, cd: 0 },
    };
    const counts: [number, number] = [0, 0];
    for (const side of [0, 1] as Side[]) {
      const army = armies[side];
      const all: BUnit[] = [];
      if (army.hero) all.push(this.make(side, army.hero.def, 'hero', true));
      for (const t of army.troops) {
        const def = TROOPS[t.id];
        for (let i = 0; i < t.count; i++) all.push(this.make(side, def, t.key ?? t.id, false));
      }
      counts[side] = all.length;
      if (this.siege && side === 1) this.deployDefenders(all);
      else this.deploy(side, all, army.formation);
    }
    this.initialCount = counts;
    if (this.siege) {
      this.orders[1] = { hero: 'hold', inf: 'hold', ranged: 'hold', cav: 'hold' };
      this.aiCavDelay = 0;
    }
  }

  /** Осада: стрелки на стене, пехота и конница перед воротами, остальные — в резерве за стеной. */
  private deployDefenders(all: BUnit[]) {
    const ranged = all.filter((u) => u.troop.role === 'ranged');
    const melee = all.filter((u) => u.troop.role !== 'ranged');
    const wallN = Math.min(ranged.length, 14);
    const gateN = Math.min(melee.length, MAX_ON_FIELD - wallN);
    ranged.slice(0, wallN).forEach((u, i) => {
      u.onWall = true;
      u.ammo = 40;
      u.x = WALL_X + 26 + (i % 7) * 30 + rand(-4, 4);
      u.y = FIELD_Y0 + 6 + Math.floor(i / 7) * 14;
      u.facing = -1;
    });
    const H = FIELD_Y1 - FIELD_Y0 - 16;
    melee.slice(0, gateN).forEach((u, i) => {
      const rows = 5;
      u.x = WALL_X - 30 - Math.floor(i / rows) * 28 + rand(-5, 5);
      u.y = FIELD_Y0 + 8 + (((i % rows) + 0.5) * H) / rows + rand(-4, 4);
      u.facing = -1;
    });
    const onField = new Set([...ranged.slice(0, wallN), ...melee.slice(0, gateN)]);
    for (const u of all) {
      if (onField.has(u)) this.units.push(u);
      else this.reserves[1].push(u);
    }
  }

  private make(side: Side, troop: TroopDef, stackKey: string, isHero: boolean): BUnit {
    return {
      uid: this.uid++,
      side,
      troop,
      group: isHero ? 'hero' : groupOf(troop),
      isHero,
      stackKey,
      hp: troop.hp,
      maxHp: troop.hp,
      x: 0,
      y: MID_Y,
      state: 'idle',
      anim: Math.random(),
      swing: 0,
      cd: rand(0, 1),
      target: null,
      retarget: 0,
      facing: side === 0 ? 1 : -1,
      charge: troop.line === 'cavalry',
      chargeDist: 0,
      flash: 0,
      xp: 0,
      routed: false,
      deadT: 0,
      ammo: troop.role === 'ranged' ? (troop.line === 'cavalry' ? 10 : 18) : 0,
      onWall: false,
    };
  }

  /** Расстановка: ряды по группам согласно построению, лишние — в резерв. */
  private deploy(side: Side, all: BUnit[], formation: Formation) {
    const byGroup: Record<Group, BUnit[]> = { hero: [], inf: [], ranged: [], cav: [] };
    for (const u of all) byGroup[u.group].push(u);
    // Доли мест на поле по группам, чтобы все рода войск были представлены
    const onField: BUnit[] = [];
    const quota = (g: Group) => Math.min(byGroup[g].length, Math.ceil((byGroup[g].length / all.length) * MAX_ON_FIELD));
    for (const g of ['hero', 'inf', 'ranged', 'cav'] as Group[]) onField.push(...byGroup[g].slice(0, quota(g)));
    const fieldSet = new Set(onField.slice(0, MAX_ON_FIELD));
    const order: Record<Formation, Group[]> = {
      classic: ['inf', 'hero', 'ranged', 'cav'],
      archers_front: ['ranged', 'inf', 'hero', 'cav'],
      cav_charge: ['cav', 'hero', 'inf', 'ranged'],
    };
    // Каждая группа — прямоугольный блок: ряды по глубине поля, колонны от края
    let depth = 0;
    const H = FIELD_Y1 - FIELD_Y0 - 16;
    for (const g of order[formation]) {
      const list = byGroup[g].filter((u) => fieldSet.has(u));
      const rows = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(list.length * 1.6))));
      const spacing = g === 'cav' || g === 'hero' ? 40 : 28;
      list.forEach((u, i) => {
        const row = i % rows;
        const col = Math.floor(i / rows);
        u.y = FIELD_Y0 + 8 + ((row + 0.5) * H) / rows + rand(-5, 5);
        const fromEdge = 560 - depth - col * spacing + rand(-6, 6);
        u.x = side === 0 ? fromEdge : FIELD_W - fromEdge;
      });
      if (list.length) depth += Math.ceil(list.length / rows) * spacing + 36;
    }
    for (const u of all) {
      if (fieldSet.has(u)) this.units.push(u);
      else this.reserves[side].push(u);
    }
  }

  // ───────────────────────── команды игрока ─────────────────────────

  setOrder(side: Side, g: Group, o: Order) {
    this.orders[side][g] = o;
  }

  canUse(a: Ability): boolean {
    const s = this.abilities[a];
    if (s.charges <= 0 || s.cd > 0 || this.winner !== null || this.routed[this.playerSide]) return false;
    const mine = this.active(this.playerSide);
    if (a === 'volley') return mine.some((u) => u.troop.role === 'ranged');
    if (a === 'stakes') return mine.some((u) => u.group === 'inf' || u.group === 'ranged');
    return true;
  }

  use(a: Ability) {
    if (!this.canUse(a)) return;
    const side = this.playerSide;
    const st = this.abilities[a];
    st.charges--;
    st.cd = 12;
    const mine = this.active(side);
    const dir = side === 0 ? 1 : -1;
    const front = mine.reduce((m, u) => (dir > 0 ? Math.max(m, u.x) : Math.min(m, u.x)), side === 0 ? 0 : FIELD_W);
    switch (a) {
      case 'volley':
        for (const u of mine) if (u.troop.role === 'ranged') { u.cd = 0; u.swing = 0; (u as BUnit & { volley?: boolean }).volley = true; }
        this.events.push({ kind: 'volley', x: front, y: MID_Y, side });
        break;
      case 'stakes':
        for (let k = 0; k < 7; k++) this.stakes.push({ x: front + dir * (50 + (k % 2) * 16), y: FIELD_Y0 + 10 + k * ((FIELD_Y1 - FIELD_Y0 - 20) / 6), side, hp: 3 });
        this.events.push({ kind: 'stakes', x: front + dir * 50, y: MID_Y, side });
        break;
      case 'cry':
        this.morale[side] = Math.min(this.maxMorale[side], this.morale[side] + 20);
        this.morale[1 - side] = Math.max(0, this.morale[1 - side] - 6);
        this.buff[side] = 10;
        this.events.push({ kind: 'cry', x: front, y: FIELD_Y0, side });
        break;
      case 'smoke':
        this.smoke = { x: front + dir * 160, t: 14 };
        this.events.push({ kind: 'smoke', x: front + dir * 160, y: MID_Y, side });
        break;
    }
  }

  // ───────────────────────── шаг симуляции ─────────────────────────

  active(side: Side): BUnit[] {
    return this.units.filter((u) => u.side === side && u.state !== 'dead' && u.state !== 'fled');
  }

  step(dt: number) {
    if (this.winner !== null) {
      // После победы ещё немного двигаем бегущих ради красоты
      for (const u of this.units) if (u.routed && u.state !== 'dead' && u.state !== 'fled') this.moveUnit(u, dt);
      this.updateProjectiles(dt);
      return;
    }
    this.time += dt;
    for (const a of Object.values(this.abilities)) a.cd = Math.max(0, a.cd - dt);
    this.buff = [Math.max(0, this.buff[0] - dt), Math.max(0, this.buff[1] - dt)];
    if (this.smoke) {
      this.smoke.t -= dt;
      if (this.smoke.t <= 0) this.smoke = null;
    }
    this.ai(dt);
    this.attackers.clear();
    for (const u of this.units) {
      if (u.target && u.state !== 'dead' && u.state !== 'fled') this.attackers.set(u.target.uid, (this.attackers.get(u.target.uid) ?? 0) + 1);
    }

    for (const u of this.units) {
      if (u.state === 'dead') {
        u.deadT += dt;
        continue;
      }
      if (u.state === 'fled') continue;
      u.flash = Math.max(0, u.flash - dt);
      u.cd -= dt;
      u.anim += dt;
      if (u.isHero && u.side === this.playerSide && this.heroCtl.on && !this.routed[u.side]) this.manual(u, dt);
      else {
        u.blocking = false;
        this.think(u, dt);
      }
    }
    this.updateProjectiles(dt);
    this.reinforce();
    this.checkEnd();
  }

  private ai(dt: number) {
    const side: Side = this.playerSide === 0 ? 1 : 0;
    if (this.aiCavDelay > 0) {
      this.aiCavDelay -= dt;
      if (this.aiCavDelay <= 0) this.orders[side].cav = 'attack';
    }
    // Сильно уступающая сторона постепенно теряет боевой дух
    for (const sd of [0, 1] as Side[]) {
      const my = this.active(sd).length + this.reserves[sd].length;
      const their = this.active((1 - sd) as Side).length + this.reserves[1 - sd].length;
      if (my > 0 && their > my * 2) this.morale[sd] = Math.max(0, this.morale[sd] - 1.5 * dt);
    }
    if (this.siege) {
      // Ворота пали, когда перед стеной не осталось защитников
      if (!this.breached && !this.units.some((u) => u.side === 1 && !u.onWall && u.state !== 'dead' && u.state !== 'fled') && !this.reserves[1].some((u) => u.troop.role !== 'ranged')) {
        this.breached = true;
        this.events.push({ kind: 'breach', x: WALL_X, y: MID_Y, side: 1 });
      }
      if (side === 1) return;
    }
    // Стрелки ИИ идут вперёд, если противник держится далеко
    const mine = this.active(side);
    const enemy = this.active(this.playerSide);
    if (mine.length && enemy.length) {
      const gap = Math.abs(avgX(mine) - avgX(enemy));
      this.orders[side].ranged = gap > 600 ? 'attack' : 'hold';
    }
  }

  private findTarget(u: BUnit): BUnit | null {
    let best: BUnit | null = null;
    let bestD = Infinity;
    for (const e of this.units) {
      if (e.side === u.side || e.state === 'dead' || e.state === 'fled') continue;
      if (e.onWall && !this.breached && u.troop.role !== 'ranged') continue;
      let d = ed(e.x - u.x, e.y - u.y);
      if (u.group === 'cav' && e.troop.role === 'ranged') d *= 0.8; // конница охотится на стрелков
      // Не наваливаться всем на одного: занятые цели менее привлекательны
      if (u.troop.role !== 'ranged') d += (this.attackers.get(e.uid) ?? 0) * (e === u.target ? 0 : 22);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private reach(u: BUnit): number {
    if (u.troop.line === 'cavalry') return REACH.cav;
    return isPole(u.troop) ? REACH.pole : REACH.short;
  }

  private think(u: BUnit, dt: number) {
    const order = this.routed[u.side] ? 'retreat' : this.orders[u.side][u.group];
    if (order === 'retreat') {
      u.swing = 0;
      this.moveUnit(u, dt);
      return;
    }
    u.retarget -= dt;
    if (!u.target || u.target.state === 'dead' || u.target.state === 'fled' || u.retarget <= 0) {
      u.target = this.findTarget(u);
      u.retarget = 0.6 + Math.random() * 0.4;
    }
    const t = u.target;
    if (!t) {
      u.state = 'idle';
      return;
    }
    const dx = t.x - u.x;
    const dyRaw = t.y - u.y;
    const dist = ed(dx, dyRaw);
    if (Math.abs(dx) > 2) u.facing = dx >= 0 ? 1 : -1;

    // Замах идёт — ждём удара
    if (u.swing > 0) {
      u.swing -= dt;
      u.state = 'attack';
      this.separate(u, dt, 0.5);
      if (u.swing <= 0) this.strike(u, t);
      return;
    }

    // На стену бьют с лестниц: по стрелку на стене достаточно подойти к её подножию
    const reach = t.onWall || u.onWall ? this.reach(u) + 60 : this.reach(u);
    const inMelee = t.onWall || u.onWall ? Math.abs(dx) <= reach : dist <= reach;
    const ranged = u.troop.role === 'ranged' && u.ammo > 0;
    const rangePx = u.troop.range * METER * (u.onWall ? 1.35 : 1);

    if (inMelee) {
      u.state = 'attack';
      this.separate(u, dt, 0.9);
      if (u.cd <= 0) this.startSwing(u, ranged ? 0.25 : 0.3);
      else if (u.anim > 0.5) u.state = 'idle';
      return;
    }

    if (ranged && dist <= rangePx) {
      // Конные стрелки держат дистанцию
      if (u.troop.line === 'cavalry' && dist < 150 && t.troop.role !== 'ranged') {
        this.steer(u, -dx, -dyRaw * 0.3, dt, 0.9);
        return;
      }
      this.separate(u, dt, 0.5);
      u.state = u.cd <= 0.3 ? 'attack' : 'idle';
      if (u.cd <= 0) this.shoot(u, t);
      return;
    }

    if (u.onWall) {
      u.state = 'idle';
      return;
    }
    if (order === 'hold') {
      this.separate(u, dt, 0.6);
      u.state = 'idle';
      return;
    }

    // Герой ведёт бой сразу за передней линией своей пехоты
    if (u.isHero) {
      const inf = this.units.filter((a) => a.side === u.side && a.group === 'inf' && a.state !== 'dead' && a.state !== 'fled');
      if (inf.length) {
        const dir = u.side === 0 ? 1 : -1;
        const front = inf.reduce((m, a) => (dir > 0 ? Math.max(m, a.x) : Math.min(m, a.x)), dir > 0 ? -1e9 : 1e9);
        if ((u.x - front) * dir > -24 && dist > 70) {
          this.separate(u, dt, 0.6);
          u.state = 'idle';
          return;
        }
      }
    }
    // Наступление: подходим к цели сбоку, с которого стоим, чтобы встать лицом к лицу
    const side = dx >= 0 ? -1 : 1;
    const gx = t.x + side * reach * 0.8 - u.x;
    const gy = dyRaw;
    this.steer(u, gx, gy, dt, 1);
  }

  /** Ближайший враг в пределах досягаемости (для ручного удара) — в первую очередь спереди. */
  private nearestFoe(u: BUnit, maxD: number): BUnit | null {
    let best: BUnit | null = null;
    let bestD = maxD;
    for (const e of this.units) {
      if (e.side === u.side || e.state === 'dead' || e.state === 'fled') continue;
      if (e.onWall && !this.breached && u.troop.role !== 'ranged') continue;
      let d = ed(e.x - u.x, e.y - u.y);
      if ((e.x - u.x) * u.facing < 0) d += 18; // за спиной — чуть дальше
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** Герой под рукой игрока: ходит по стику, бьёт и блокирует по кнопкам. */
  private manual(u: BUnit, dt: number) {
    const c = this.heroCtl;
    const ranged = u.troop.role === 'ranged' && u.ammo > 0;
    u.target = null;
    // Замах идёт — удар по тому, кто окажется рядом в момент удара
    if (u.swing > 0) {
      u.blocking = false;
      u.swing -= dt;
      u.state = 'attack';
      if (u.swing <= 0) {
        const t = this.nearestFoe(u, this.reach(u) + 12);
        if (t) this.strike(u, t);
        else {
          u.cd = u.troop.attackTime * 0.8;
          u.anim = 0;
        }
      }
      return;
    }
    u.blocking = c.block;
    if ((c.attack || c.tap) && !c.block && u.cd <= 0) {
      c.tap = false;
      if (ranged) {
        const t = this.nearestFoe(u, u.troop.range * METER);
        if (t) {
          if (Math.abs(t.x - u.x) > 2) u.facing = t.x > u.x ? 1 : -1;
          this.shoot(u, t);
          return;
        }
      } else {
        const t = this.nearestFoe(u, this.reach(u) + 30);
        if (t && Math.abs(t.x - u.x) > 2) u.facing = t.x > u.x ? 1 : -1;
        this.startSwing(u, 0.22);
        return;
      }
    }
    const mag = Math.hypot(c.mx, c.my);
    if (mag > 0.15) {
      const facing = u.facing;
      this.steer(u, c.mx * 100, (c.my * 100) / Y_SCALE, dt, (c.block ? 0.45 : 1) * Math.min(1, mag));
      if (c.block) u.facing = facing; // под щитом не разворачиваемся
      return;
    }
    if (u.troop.line === 'cavalry') u.chargeDist = Math.max(0, u.chargeDist - dt * 200);
    this.separate(u, dt, 0.3);
    u.state = u.state === 'attack' && u.anim < 0.4 ? 'attack' : 'idle';
  }

  /** Отталкивание от соседей, чтобы бойцы не слипались в кучу. Возвращает вектор. */
  private separation(u: BUnit): [number, number] {
    let sx = 0;
    let sy = 0;
    const cavU = u.troop.line === 'cavalry';
    for (const a of this.units) {
      if (a === u || a.state === 'dead' || a.state === 'fled' || a.onWall) continue;
      const R = cavU || a.troop.line === 'cavalry' ? 40 : 25;
      const dx = u.x - a.x;
      const dy = u.y - a.y;
      if (Math.abs(dx) > R || Math.abs(dy) * Y_SCALE > R) continue;
      const d = ed(dx, dy) || 0.01;
      if (d >= R) continue;
      const k = ((R - d) / R) * (a.side === u.side ? 1 : 0.7);
      // Одинаковые координаты — разводим случайно
      const nx = d < 0.5 ? Math.random() - 0.5 : dx / d;
      const ny = d < 0.5 ? Math.random() - 0.5 : (dy * Y_SCALE) / d;
      sx += nx * k;
      sy += ny * k;
    }
    return [sx, sy];
  }

  private separate(u: BUnit, dt: number, k: number) {
    if (u.onWall) return;
    const [sx, sy] = this.separation(u);
    if (sx === 0 && sy === 0) return;
    const sp = u.troop.speed * SPEED_K * k;
    u.x += sx * sp * dt;
    u.y += (sy * sp * dt) / Y_SCALE;
    if (this.siege && u.side === 1 && u.x > WALL_X - 22) u.x = WALL_X - 22;
    if (this.siege && u.side === 0 && !this.breached && u.x > WALL_X - 16) u.x = WALL_X - 16;
    this.clampY(u);
  }

  private clampY(u: BUnit) {
    if (u.y < FIELD_Y0) u.y = FIELD_Y0;
    if (u.y > FIELD_Y1) u.y = FIELD_Y1;
  }

  /** Движение к точке (gx, gy — вектор цели) с обходом соседей и кольев. */
  private steer(u: BUnit, gx: number, gy: number, dt: number, k: number) {
    let speed = u.troop.speed * SPEED_K * k;
    const len = ed(gx, gy) || 1;
    let vx = gx / len;
    let vy = (gy * Y_SCALE) / len;
    const [sx, sy] = this.separation(u);
    vx += sx * 1.8;
    vy += sy * 1.8;
    // Колья останавливают вражескую конницу
    if (u.troop.line === 'cavalry') {
      for (const s of this.stakes) {
        if (s.side === u.side || s.hp <= 0) continue;
        const ddx = s.x - u.x;
        if (Math.abs(ddx) < 18 && Math.abs(s.y - u.y) < 16 && Math.sign(ddx) === Math.sign(vx)) {
          vx = 0;
          if (u.cd <= 0) {
            u.cd = 1;
            s.hp--;
            this.damage(null, u, 22, 'hit');
          }
        }
      }
      this.stakes = this.stakes.filter((s) => s.hp > 0);
    }
    const vl = Math.hypot(vx, vy);
    if (vl < 0.05) {
      u.state = 'idle';
      return;
    }
    vx /= vl;
    vy /= vl;
    if (vl < 0.5) speed *= vl * 2;
    const stepX = vx * speed * dt;
    const stepY = (vy * speed * dt) / Y_SCALE;
    u.x += stepX;
    u.y += stepY;
    if (this.siege && u.side === 0 && !this.breached && u.x > WALL_X - 16) u.x = WALL_X - 16;
    if (this.siege && u.side === 1 && !u.onWall && u.x > WALL_X - 22) u.x = WALL_X - 22;
    this.clampY(u);
    if (Math.abs(vx) > 0.15) u.facing = vx > 0 ? 1 : -1;
    u.state = 'walk';
    if (u.troop.line === 'cavalry') {
      u.chargeDist += Math.hypot(stepX, stepY);
      if (u.chargeDist > 140) u.charge = true;
    }
  }

  private moveUnit(u: BUnit, dt: number) {
    const dir = u.side === 0 ? -1 : 1;
    this.steer(u, dir * 100, 0, dt, u.routed ? 1.15 : 1);
    if (u.x < -40 || u.x > FIELD_W + 40) u.state = 'fled';
  }

  private startSwing(u: BUnit, windup: number) {
    u.swing = windup;
    u.anim = 0;
    u.state = 'attack';
  }

  private strike(u: BUnit, t: BUnit) {
    u.cd = u.troop.attackTime * rand(0.9, 1.1);
    u.anim = 0;
    if (t.state === 'dead' || t.state === 'fled') return;
    if (ed(t.x - u.x, t.y - u.y) > this.reach(u) + 12) return;
    let mult = u.troop.role === 'ranged' ? 0.55 : 1;
    if (u.charge && u.troop.line === 'cavalry') {
      mult *= u.troop.look.weapon === 'lance' ? 1.9 : 1.5;
      u.charge = false;
      u.chargeDist = 0;
      this.events.push({ kind: 'charge', x: t.x, y: t.y, side: u.side });
    }
    if (isPole(u.troop) && t.troop.line === 'cavalry') mult *= 1.4;
    this.resolveHit(u, t, mult, false);
  }

  private shoot(u: BUnit, t: BUnit) {
    u.ammo--;
    const v = u as BUnit & { volley?: boolean };
    const mult = v.volley ? 1.3 : 1;
    v.volley = false;
    u.cd = u.troop.attackTime * rand(0.9, 1.15);
    u.anim = 0;
    u.state = 'attack';
    const dist = Math.hypot(t.x - u.x, t.y - u.y);
    let hitChance = 0.88 - (dist / (u.troop.range * METER)) * 0.35;
    if (this.smoke && u.side !== this.playerSide && Math.abs(t.x - this.smoke.x) < 260) hitChance *= 0.35;
    if (this.smoke && u.side === this.playerSide && Math.abs(u.x - this.smoke.x) < 200) hitChance *= 0.6;
    if (t.onWall) hitChance *= 0.55;
    if (u.onWall) hitChance = Math.min(0.95, hitChance + 0.12);
    const willHit = Math.random() < hitChance;
    const dur = 0.25 + dist / 520;
    const lead = t.state === 'walk' ? t.facing * t.troop.speed * SPEED_K * dur : 0;
    const x1 = t.x + lead + (willHit ? 0 : rand(-40, 40));
    this.projectiles.push({
      x: u.x,
      y: u.y - 30,
      x0: u.x + u.facing * 8,
      y0: u.y - (u.troop.line === 'cavalry' ? 38 : 28),
      x1,
      y1: t.y - (willHit ? 22 : rand(-4, 2)),
      t: 0,
      dur,
      arc: Math.min(120, dist * 0.22),
      from: u,
      target: t,
      willHit,
      mult,
      kind: u.troop.look.weapon === 'crossbow' ? 'bolt' : 'arrow',
      done: false,
    });
    this.events.push({ kind: 'shoot', x: u.x, y: u.y, side: u.side });
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      if (p.done) continue;
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.x = p.x0 + (p.x1 - p.x0) * k;
      p.y = p.y0 + (p.y1 - p.y0) * k - Math.sin(k * Math.PI) * p.arc;
      if (k >= 1) {
        p.done = true;
        if (p.willHit && p.target.state !== 'dead' && p.target.state !== 'fled' && ed(p.target.x - p.x1, p.target.y - (p.y1 + 22)) < 34) {
          this.resolveHit(p.from, p.target, p.mult, true);
        }
      }
    }
    if (this.projectiles.length > 200) this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  private resolveHit(a: BUnit, d: BUnit, mult: number, ranged: boolean) {
    const t = d.troop;
    // Уклонение
    let dodge = t.dodge;
    if (ranged) dodge *= 0.7;
    if (Math.random() < dodge) {
      this.events.push({ kind: 'dodge', x: d.x, y: d.y, side: d.side });
      return;
    }
    // Блок щитом (если смотрит на атакующего)
    const facingAttacker = (a.x - d.x) * d.facing >= 0;
    // Герой в блоке: щит держит почти всё спереди, без щита — парирует оружием
    const held = d.blocking && facingAttacker ? (t.block > 0 ? 0.92 : ranged ? 0.2 : 0.7) : 0;
    if (held && Math.random() < held) {
      this.events.push({ kind: 'block', x: d.x, y: d.y, side: d.side });
      return;
    }
    if (t.block > 0 && facingAttacker && d.swing <= 0 && Math.random() < t.block * (ranged ? 0.8 : 1)) {
      this.events.push({ kind: 'block', x: d.x, y: d.y, side: d.side });
      return;
    }
    let crit = false;
    if (Math.random() < a.troop.crit) {
      crit = true;
      mult *= rand(1.5, 2);
    }
    if (this.buff[a.side] > 0) mult *= 1.2;
    const type: DamageType = a.troop.damageType;
    let dmg = a.troop.damage * rand(0.85, 1.15) * mult * (1 - t.armor[type]);
    if (this.siege && d.side === 1) dmg *= d.onWall ? 0.7 : 0.75; // укрепления
    this.damage(a, d, Math.max(1, Math.round(dmg)), crit ? 'crit' : 'hit');
  }

  private damage(a: BUnit | null, d: BUnit, dmg: number, kind: 'hit' | 'crit') {
    d.hp -= dmg;
    d.flash = 0.18;
    this.events.push({ kind, x: d.x, y: d.y, side: d.side, amount: dmg });
    if (a) a.xp += dmg * 0.4;
    if (d.hp <= 0) {
      d.hp = 0;
      d.state = 'dead';
      d.deadT = 0;
      d.swing = 0;
      if (a) a.xp += d.troop.tier * 14 + 6;
      const side = d.side;
      let loss = 125 / Math.max(8, this.initialCount[side]);
      if (d.isHero) {
        loss += 15;
        this.heroDown = this.heroDown || side === this.playerSide;
        this.events.push({ kind: 'heroDown', x: d.x, y: d.y, side });
      }
      this.morale[side] = Math.max(0, this.morale[side] - loss);
      this.morale[1 - side] = Math.min(this.maxMorale[1 - side], this.morale[1 - side] + 0.5);
      this.events.push({ kind: 'death', x: d.x, y: d.y, side });
    }
  }

  private reinforce() {
    for (const side of [0, 1] as Side[]) {
      if (this.routed[side] || !this.reserves[side].length) continue;
      const onField = this.active(side).length;
      let free = MAX_ON_FIELD - onField;
      while (free-- > 0 && this.reserves[side].length) {
        const u = this.reserves[side].shift()!;
        u.x = side === 0 ? -20 - Math.random() * 30 : this.siege ? WALL_X - 26 : FIELD_W + 20 + Math.random() * 30;
        u.y = rand(FIELD_Y0 + 6, FIELD_Y1 - 6);
        this.units.push(u);
      }
    }
  }

  private checkEnd() {
    for (const side of [0, 1] as Side[]) {
      if (!this.routed[side] && this.morale[side] <= 0) {
        this.routed[side] = true;
        for (const u of this.units) if (u.side === side && u.state !== 'dead') u.routed = true;
        this.events.push({ kind: 'rout', x: 0, y: 0, side });
      }
    }
    if (this.time > 300 && !this.routed[0] && !this.routed[1]) {
      const loser: Side = this.morale[0] < this.morale[1] ? 0 : 1;
      this.morale[loser] = 0;
    }
    for (const side of [0, 1] as Side[]) {
      const alive = this.active(side).length + (this.routed[side] ? 0 : this.reserves[side].length);
      const standing = this.routed[side] ? 0 : alive;
      if (standing === 0) {
        this.winner = (1 - side) as Side;
        // Бегущие продолжают уходить с поля
        for (const u of this.units) if (u.side === side && u.state !== 'dead') u.routed = true;
        this.routed[side] = true;
        return;
      }
    }
  }

  /** Прокрутить бой до конца без картинки (автобой). */
  runToEnd(maxTime = 420) {
    const dt = 0.1;
    this.heroCtl.on = false;
    const ps = this.playerSide;
    this.orders[ps] = { hero: 'attack', inf: 'attack', ranged: 'attack', cav: 'attack' };
    let guard = 0;
    while (this.winner === null && this.time < maxTime && guard++ < maxTime * 12) {
      this.step(dt);
      this.events.length = 0;
    }
    if (this.winner === null) this.winner = this.morale[0] >= this.morale[1] ? 0 : 1;
  }

  /** Итог по стекам: сколько погибло, ранено, какой опыт. */
  summary(side: Side) {
    const bySt = new Map<string, { dead: number; survived: number; xp: number; troop: TroopDef }>();
    const all = [...this.units.filter((u) => u.side === side), ...this.reserves[side]];
    let heroDead = false;
    for (const u of all) {
      if (u.isHero) {
        heroDead = u.state === 'dead';
        continue;
      }
      const s = bySt.get(u.stackKey) ?? { dead: 0, survived: 0, xp: 0, troop: u.troop };
      if (u.state === 'dead') s.dead++;
      else s.survived++;
      s.xp += u.xp;
      bySt.set(u.stackKey, s);
    }
    return { stacks: bySt, heroDead };
  }
}

function avgX(list: BUnit[]) {
  return list.reduce((s, u) => s + u.x, 0) / list.length;
}

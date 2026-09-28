// Симуляция боя с видом сбоку. Не знает про Phaser: сцена только рисует состояние,
// а автобой гоняет ту же симуляцию без картинки.

import { TROOPS, type DamageType, type TroopDef } from '../data/troops';

export type Side = 0 | 1;
export type Group = 'hero' | 'inf' | 'ranged' | 'cav';
export type Order = 'attack' | 'hold' | 'retreat';
export type Formation = 'classic' | 'archers_front' | 'cav_charge';
export type Ability = 'volley' | 'stakes' | 'cry' | 'smoke';

export const FIELD_W = 2400;
export const LANE_Y = [436, 494, 552];
export const METER = 6; // пикселей поля на «метр» дальности стрельбы
const MAX_ON_FIELD = 36;
const SPEED_K = 44;

export interface ArmyDef {
  name: string;
  culture: string;
  troops: { id: string; count: number }[];
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
  laneY: number;
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
  side: Side;
  hp: number;
  laneY: number;
}

export type EventKind = 'hit' | 'crit' | 'block' | 'dodge' | 'death' | 'shoot' | 'charge' | 'rout' | 'cry' | 'stakes' | 'smoke' | 'volley' | 'heroDown';
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
  private uid = 1;
  private aiCavDelay = 3;

  constructor(
    readonly armies: [ArmyDef, ArmyDef],
    readonly playerSide: Side = 0,
  ) {
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
        for (let i = 0; i < t.count; i++) all.push(this.make(side, def, t.id, false));
      }
      counts[side] = all.length;
      this.deploy(side, all, army.formation);
    }
    this.initialCount = counts;
  }

  private make(side: Side, troop: TroopDef, stackKey: string, isHero: boolean): BUnit {
    const laneY = LANE_Y[Math.floor(Math.random() * 3)];
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
      y: laneY,
      laneY,
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
    let depth = 0;
    for (const g of order[formation]) {
      const list = byGroup[g].filter((u) => fieldSet.has(u));
      list.forEach((u, i) => {
        const lane = i % 3;
        const col = Math.floor(i / 3);
        u.laneY = LANE_Y[lane] + rand(-10, 10);
        u.y = u.laneY;
        const fromEdge = 560 - depth - col * 30 + rand(-6, 6);
        u.x = side === 0 ? fromEdge : FIELD_W - fromEdge;
      });
      if (list.length) depth += Math.ceil(list.length / 3) * 30 + 40;
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
        this.events.push({ kind: 'volley', x: front, y: LANE_Y[1], side });
        break;
      case 'stakes':
        for (const ly of LANE_Y) for (let k = 0; k < 2; k++) this.stakes.push({ x: front + dir * (46 + k * 14), side, hp: 3, laneY: ly + rand(-3, 3) });
        this.events.push({ kind: 'stakes', x: front + dir * 50, y: LANE_Y[1], side });
        break;
      case 'cry':
        this.morale[side] = Math.min(this.maxMorale[side], this.morale[side] + 20);
        this.morale[1 - side] = Math.max(0, this.morale[1 - side] - 6);
        this.buff[side] = 10;
        this.events.push({ kind: 'cry', x: front, y: LANE_Y[0], side });
        break;
      case 'smoke':
        this.smoke = { x: front + dir * 160, t: 14 };
        this.events.push({ kind: 'smoke', x: front + dir * 160, y: LANE_Y[1], side });
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

    for (const u of this.units) {
      if (u.state === 'dead') {
        u.deadT += dt;
        continue;
      }
      if (u.state === 'fled') continue;
      u.flash = Math.max(0, u.flash - dt);
      u.cd -= dt;
      u.anim += dt;
      this.think(u, dt);
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
      let d = Math.abs(e.x - u.x) + Math.abs(e.y - u.y) * 2.5;
      if (u.group === 'cav' && e.troop.role === 'ranged') d *= 0.8; // конница охотится на стрелков
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
    const dist = Math.abs(dx);
    const dy = Math.abs(t.y - u.y);
    u.facing = dx >= 0 ? 1 : -1;

    // Замах идёт — ждём удара
    if (u.swing > 0) {
      u.swing -= dt;
      u.state = 'attack';
      if (u.swing <= 0) this.strike(u, t);
      return;
    }

    const reach = this.reach(u);
    const inMelee = dist <= reach && dy < 30;
    const ranged = u.troop.role === 'ranged' && u.ammo > 0;
    const rangePx = u.troop.range * METER;

    if (inMelee) {
      u.state = 'attack';
      if (u.cd <= 0) this.startSwing(u, ranged ? 0.25 : 0.3);
      else if (u.anim > 0.5) u.state = 'idle';
      return;
    }

    if (ranged && dist <= rangePx) {
      // Конные стрелки держат дистанцию
      if (u.troop.line === 'cavalry' && dist < 140 && t.troop.role !== 'ranged') {
        this.moveBy(u, -u.facing, dt, 0.9);
        return;
      }
      u.state = u.cd <= 0.3 ? 'attack' : 'idle';
      if (u.cd <= 0) this.shoot(u, t);
      return;
    }

    if (order === 'hold') {
      // Держим позицию, но сдвигаемся к линии цели
      this.approachLane(u, t, dt);
      u.state = 'idle';
      return;
    }

    // Герой ведёт бой сразу за передней линией своей пехоты
    if (u.isHero) {
      const inf = this.units.filter((a) => a.side === u.side && a.group === 'inf' && a.state !== 'dead' && a.state !== 'fled');
      if (inf.length) {
        const dir = u.side === 0 ? 1 : -1;
        const front = inf.reduce((m, a) => (dir > 0 ? Math.max(m, a.x) : Math.min(m, a.x)), dir > 0 ? -1e9 : 1e9);
        if ((u.x - front) * dir > -20 && dist > 60) {
          this.approachLane(u, t, dt);
          u.state = 'idle';
          return;
        }
      }
    }
    // Наступление
    this.approachLane(u, t, dt);
    this.moveBy(u, u.facing, dt, 1);
  }

  /** Боец держится своего ряда; в соседний переходит, только если в своём врагов рядом нет. */
  private approachLane(u: BUnit, t: BUnit, dt: number) {
    const nearestLane = LANE_Y.reduce((best, y) => (Math.abs(y - t.y) < Math.abs(best - t.y) ? y : best), LANE_Y[0]);
    if (Math.abs(nearestLane - u.laneY) > 4) {
      const busy = this.units.some(
        (e) => e.side !== u.side && e.state !== 'dead' && e.state !== 'fled' && Math.abs(e.y - u.laneY) < 24 && Math.abs(e.x - u.x) < 260,
      );
      if (!busy) u.laneY = nearestLane + rand(-10, 10);
    }
    const want = u.laneY + clampN(t.y - u.laneY, -12, 12);
    const dy = want - u.y;
    u.y += Math.sign(dy) * Math.min(Math.abs(dy), 30 * dt);
  }

  private moveBy(u: BUnit, dir: number, dt: number, k: number) {
    let speed = u.troop.speed * SPEED_K * k;
    // Не проходить сквозь своих, сцепившихся в бою впереди
    for (const a of this.units) {
      if (a === u || a.side !== u.side || a.state === 'dead' || a.state === 'fled') continue;
      const ahead = (a.x - u.x) * dir;
      if (ahead > 0 && ahead < 22 && Math.abs(a.y - u.y) < 9 && (a.state === 'attack' || a.state === 'idle')) {
        speed = 0;
        break;
      }
    }
    // Колья останавливают вражескую конницу
    if (u.troop.line === 'cavalry') {
      for (const s of this.stakes) {
        if (s.side === u.side || s.hp <= 0) continue;
        const d = (s.x - u.x) * dir;
        if (d > 0 && d < 16 && Math.abs(s.laneY - u.y) < 16) {
          speed = 0;
          if (u.cd <= 0) {
            u.cd = 1;
            s.hp--;
            this.damage(null, u, 22, 'hit');
          }
        }
      }
      this.stakes = this.stakes.filter((s) => s.hp > 0);
    }
    const step = dir * speed * dt;
    u.x += step;
    u.facing = dir > 0 ? 1 : -1;
    u.state = speed > 0 ? 'walk' : 'idle';
    if (u.troop.line === 'cavalry') {
      u.chargeDist += Math.abs(step);
      if (u.chargeDist > 140) u.charge = true;
    }
    if (u.y < LANE_Y[0] - 16) u.y = LANE_Y[0] - 16;
    if (u.y > LANE_Y[2] + 16) u.y = LANE_Y[2] + 16;
  }

  private moveUnit(u: BUnit, dt: number) {
    const dir = u.side === 0 ? -1 : 1;
    this.moveBy(u, dir, dt, u.routed ? 1.15 : 1);
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
    if (Math.abs(t.x - u.x) > this.reach(u) + 12 || Math.abs(t.y - u.y) > 30) return;
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
        if (p.willHit && p.target.state !== 'dead' && p.target.state !== 'fled' && Math.abs(p.target.x - p.x1) < 30) {
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
    const dmg = a.troop.damage * rand(0.85, 1.15) * mult * (1 - t.armor[type]);
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
        u.x = side === 0 ? -20 - Math.random() * 30 : FIELD_W + 20 + Math.random() * 30;
        u.laneY = LANE_Y[Math.floor(Math.random() * 3)] + rand(-10, 10);
        u.y = u.laneY;
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
    const ps = this.playerSide;
    this.orders[ps] = { hero: 'attack', inf: 'attack', ranged: 'hold', cav: 'attack' };
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

function clampN(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

function avgX(list: BUnit[]) {
  return list.reduce((s, u) => s + u.x, 0) / list.length;
}

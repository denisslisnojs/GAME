// Симуляция боя с видом сбоку. Не знает про Phaser: сцена только рисует состояние,
// а автобой гоняет ту же симуляцию без картинки.

import { hasTrait, TROOPS, type DamageType, type TroopDef } from '../data/troops';

export type Side = 0 | 1;
export type Group = 'hero' | 'inf' | 'ranged' | 'cav';
/** Приказ группе. flank — обход по краю поля в тыл врагу, follow — держаться за героем. */
export type Order = 'attack' | 'hold' | 'retreat' | 'flank' | 'follow';
/** Начальная расстановка армии (порядок групп от переднего края). */
export type Formation = 'classic' | 'archers_front' | 'cav_charge';
/** Строй группы. */
export type Form = 'line' | 'shieldwall' | 'loose' | 'wedge' | 'hedgehog';
export type Ability = 'volley' | 'stakes' | 'cry' | 'smoke';
export type Weather = 'rain' | 'snow' | 'fog';

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
/** Дальность броска дротика и аркана, пикселей. */
const JAVELIN_PX = 150;
const LASSO_PX = 140;
/** Радиус действия знамени. */
const BANNER_R = 170;

export interface ArmyDef {
  name: string;
  culture: string;
  /** key — ключ стека для подсчёта потерь (по умолчанию id воина). */
  troops: { id: string; count: number; key?: string }[];
  hero?: { name: string; level: number; def: TroopDef };
  /** Спутники героя: бьются рядом с ним, не гибнут, а получают ранения. */
  companions?: { id: string; def: TroopDef }[];
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
  /** Спутник героя (id). */
  compId?: string;
  /** Оглушён (конь шарахнулся, сдёрнут арканом): секунд без действий. */
  stun: number;
  /** Дротиков в запасе. */
  javelins: number;
  lassoCd: number;
  /** Горит: секунд до конца огня. */
  burn: number;
  burnTick: number;
  /** Конь боится верблюдов. */
  fear: number;
  /** Ряды расстроены погоней. */
  disorder: number;
  /** Сколько секунд гонится за отступающим лучником. */
  chase: number;
  /** В щите застрял дротик: блок хуже. */
  shieldHit: number;
  /** Несёт знамя. */
  banner: boolean;
  /** Павеза поставлена. */
  planted: boolean;
  /** Каким был до того, как его сдёрнули с коня. */
  origTroop?: TroopDef;
  /** Меняется, когда облик надо перерисовать. */
  lookVer: number;
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

export type ProjectileKind = 'arrow' | 'bolt' | 'javelin' | 'ball' | 'pot' | 'lasso';

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
  kind: ProjectileKind;
  done: boolean;
}

export interface Stake {
  x: number;
  y: number;
  side: Side;
  hp: number;
}

/** Холм поперёк поля: стрелки бьют дальше, сверху бить легче. */
export interface Hill {
  x0: number;
  x1: number;
}
/** Роща: конница вязнет, стрелы путаются в ветвях. */
export interface Grove {
  x: number;
  y: number;
  rx: number;
  ry: number;
  seed: number;
}
/** Телега обоза: не пройти насквозь, за ней укрываются от стрел. */
export interface Cart {
  x: number;
  y: number;
  side: Side;
}
export interface Field {
  hills: Hill[];
  groves: Grove[];
  carts: Cart[];
}

export type EventKind =
  | 'breach' | 'hit' | 'crit' | 'block' | 'dodge' | 'death' | 'shoot' | 'charge' | 'rout' | 'cry' | 'stakes' | 'smoke' | 'volley' | 'heroDown'
  | 'brace' | 'rear' | 'gun' | 'misfire' | 'fire' | 'burn' | 'lasso' | 'panic' | 'bannerDown' | 'banner' | 'javelin' | 'feint' | 'rage';
export interface BattleEvent {
  kind: EventKind;
  x: number;
  y: number;
  side: Side;
  amount?: number;
}

const REACH = { short: 24, pole: 32, cav: 34 };
const CART_HW = 34;
const CART_HH = 11;

function isPole(t: TroopDef) {
  const w = t.look.weapon;
  return w === 'spear' || w === 'pitchfork' || w === 'halberd' || w === 'glaive' || w === 'daneaxe';
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

/** Условия поля боя. */
export interface BattleOpts {
  siege?: boolean;
  /** Местность: лес мешает коннице и стрелкам, снег замедляет, холмы добавляют дальности. */
  terrain?: 'grass' | 'forest' | 'steppe' | 'desert' | 'snow' | 'dry';
  /** Ночь: стрелки почти слепы. */
  night?: boolean;
  /** Посреди поля брод: в реке все идут медленно. */
  ford?: boolean;
  /** Засада: враг начинает ближе, наш дух ниже. */
  ambush?: boolean;
  /** Сложность: множитель урона по воинам игрока. */
  playerDamageK?: number;
  /** Погода: дождь мочит тетивы и порох, туман скрывает цели. */
  weather?: Weather;
  /** Обоз одной из сторон: телеги перед её строем. */
  wagons?: Side;
  /** Без холмов и рощ (ристалище, поединок). */
  noField?: boolean;
}

/** Полоса брода посреди поля. */
export const FORD_X = FIELD_W / 2;
export const FORD_HALF = 110;

/** Воин без коня: сдёрнут арканом. Кэш, чтобы не плодить копии. */
const footCache = new Map<string, TroopDef>();
function footVersion(t: TroopDef): TroopDef {
  let f = footCache.get(t.id);
  if (!f) {
    f = { ...t, id: `${t.id}~foot`, line: 'infantry', speed: Math.min(1, +(t.speed * 0.5).toFixed(2)), look: { ...t.look, camel: false } };
    footCache.set(t.id, f);
  }
  return f;
}

/** Холмы, рощи и телеги по местности. */
function makeField(o: BattleOpts): Field {
  const f: Field = { hills: [], groves: [], carts: [] };
  if (o.noField || o.siege || !o.terrain) return f;
  const t = o.terrain;
  const hillP = { grass: 0.45, forest: 0.2, steppe: 0.35, desert: 0.5, snow: 0.3, dry: 0.85 }[t];
  const groveN = { grass: Math.random() < 0.5 ? 1 : 0, forest: 2 + (Math.random() < 0.5 ? 1 : 0), steppe: 0, desert: 0, snow: Math.random() < 0.4 ? 1 : 0, dry: Math.random() < 0.3 ? 1 : 0 }[t];
  if (Math.random() < hillP) {
    const c = rand(700, 1700);
    const w = rand(180, 280);
    f.hills.push({ x0: c - w, x1: c + w });
  }
  if (t === 'dry' && Math.random() < 0.4) {
    const c = f.hills.length && f.hills[0].x0 + f.hills[0].x1 > FIELD_W ? rand(560, 800) : rand(1600, 1850);
    f.hills.push({ x0: c - 150, x1: c + 150 });
  }
  for (let i = 0; i < groveN; i++) {
    const x = rand(620, 1780);
    if (f.groves.some((g) => Math.abs(g.x - x) < 300)) continue;
    f.groves.push({ x, y: rand(FIELD_Y0 + 30, FIELD_Y1 - 30), rx: rand(100, 160), ry: rand(26, 40), seed: Math.floor(Math.random() * 1e6) });
  }
  return f;
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
  /** Строй групп. */
  forms: [Record<Group, Form>, Record<Group, Form>];
  /** Стрелять ли группе (приказ «не стрелять» — false). */
  fire: [Record<Group, boolean>, Record<Group, boolean>];
  abilities: Record<Ability, { charges: number; cd: number }>;
  buff: [number, number] = [0, 0]; // секунд боевого клича
  smoke: { x: number; t: number } | null = null;
  time = 0;
  winner: Side | null = null;
  routed: [boolean, boolean] = [false, false];
  heroDown = false;
  heroCtl: HeroControl = { on: false, mx: 0, my: 0, attack: false, tap: false, block: false };
  /** Холмы, рощи, телеги. */
  readonly field: Field;
  /** Знаменосцы сторон; когда знамя пало — таймер, через сколько его подхватят. */
  bearer: [BUnit | null, BUnit | null] = [null, null];
  private bannerDrop: [number, number] = [0, 0];
  private flankSt: [Partial<Record<Group, { edge: number; x: number; t: number }>>, Partial<Record<Group, { edge: number; x: number; t: number }>>] = [{}, {}];
  private uid = 1;
  private aiT = 0;
  private aiStage: Record<string, boolean> = {};
  private panicShown: [boolean, boolean] = [false, false];
  /** Осадный бой: сторона 1 обороняет стену. */
  readonly siege: boolean;
  /** Пехота у ворот перебита — можно лезть на стены. */
  breached = false;
  private attackers = new Map<number, number>();
  private camels: BUnit[] = [];

  readonly opts: BattleOpts;

  constructor(
    readonly armies: [ArmyDef, ArmyDef],
    readonly playerSide: Side = 0,
    opts: BattleOpts = {},
  ) {
    this.opts = opts;
    this.siege = !!opts.siege;
    this.field = makeField(opts);
    this.morale = [armies[0].morale, armies[1].morale];
    this.maxMorale = [armies[0].morale, armies[1].morale];
    this.orders = [
      { hero: 'attack', inf: 'attack', ranged: 'hold', cav: 'attack' },
      { hero: 'attack', inf: 'attack', ranged: 'hold', cav: 'hold' },
    ];
    this.forms = [
      { hero: 'line', inf: 'line', ranged: 'line', cav: 'line' },
      { hero: 'line', inf: 'line', ranged: 'line', cav: 'line' },
    ];
    this.fire = [
      { hero: true, inf: true, ranged: true, cav: true },
      { hero: true, inf: true, ranged: true, cav: true },
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
      for (const c of army.companions ?? []) {
        const u = this.make(side, c.def, `comp:${c.id}`, false);
        u.group = 'hero';
        u.compId = c.id;
        all.push(u);
      }
      for (const t of army.troops) {
        const def = TROOPS[t.id];
        if (!def) continue;
        for (let i = 0; i < t.count; i++) all.push(this.make(side, def, t.key ?? t.id, false));
      }
      counts[side] = all.length;
      if (this.siege && side === 1) this.deployDefenders(all);
      else this.deploy(side, all, army.formation);
    }
    this.initialCount = counts;
    if (opts.ambush && !this.siege) {
      // Враг выскакивает из засады: ближе к нашему строю, а наши не успели построиться
      const es = (1 - playerSide) as Side;
      for (const u of this.units) if (u.side === es) u.x += (es === 1 ? -1 : 1) * 380;
      this.morale[playerSide] = Math.max(20, this.morale[playerSide] - 15);
    }
    if (this.siege) {
      this.orders[1] = { hero: 'hold', inf: 'hold', ranged: 'hold', cav: 'hold' };
    }
    if (opts.wagons !== undefined && !this.siege) this.placeCarts(opts.wagons);
    for (const side of [0, 1] as Side[]) this.pickBearer(side, true);
    this.camels = [...this.units, ...this.reserves[0], ...this.reserves[1]].filter((u) => hasTrait(u.troop, 'camel'));
  }

  /** Осада: стрелки на стене, пехота и конница перед воротами, остальные — в резерве за стеной. */
  private deployDefenders(all: BUnit[]) {
    const ranged = all.filter((u) => u.troop.role === 'ranged');
    const melee = all.filter((u) => u.troop.role !== 'ranged');
    const wallN = Math.min(ranged.length, 14);
    const gateN = Math.min(melee.length, MAX_ON_FIELD - wallN);
    ranged.slice(0, wallN).forEach((u, i) => {
      u.onWall = true;
      u.ammo = Math.max(u.ammo, hasTrait(u.troop, 'firepot') || hasTrait(u.troop, 'gun') ? 14 : 40);
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
    const ranged = troop.role === 'ranged';
    const ammo = !ranged ? 0 : hasTrait(troop, 'firepot') ? (troop.tier >= 4 ? 6 : 5) : hasTrait(troop, 'gun') ? 12 : troop.line === 'cavalry' ? 10 : 18;
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
      ammo,
      onWall: false,
      stun: 0,
      javelins: !isHero && hasTrait(troop, 'javelin') ? 2 : 0,
      lassoCd: rand(0, 0.6),
      burn: 0,
      burnTick: 0,
      fear: 0,
      disorder: 0,
      chase: 0,
      shieldHit: 0,
      banner: false,
      planted: false,
      lookVer: 0,
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
    for (const g of order[formation]) {
      const list = byGroup[g].filter((u) => fieldSet.has(u));
      const { rows, spacing } = this.blockShape(g, list.length);
      const H = FIELD_Y1 - FIELD_Y0 - 16;
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

  private blockShape(g: Group, n: number) {
    const rows = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(n * 1.6))));
    const spacing = g === 'cav' || g === 'hero' ? 40 : 28;
    return { rows, spacing };
  }

  /** Телеги обоза перед строем стороны. */
  private placeCarts(side: Side) {
    const mine = this.units.filter((u) => u.side === side);
    if (!mine.length) return;
    const dir = side === 0 ? 1 : -1;
    const front = mine.reduce((m, u) => (dir > 0 ? Math.max(m, u.x) : Math.min(m, u.x)), dir > 0 ? -1e9 : 1e9);
    const n = 4;
    for (let i = 0; i < n; i++) {
      const y = FIELD_Y0 + 14 + (i * (FIELD_Y1 - FIELD_Y0 - 28)) / (n - 1);
      const bow = Math.abs(i - (n - 1) / 2);
      this.field.carts.push({ x: front + dir * (70 - bow * 16), y, side });
    }
  }

  /** Знаменосец: опытный пехотинец в гуще своих. */
  private pickBearer(side: Side, initial: boolean) {
    const pool = this.units.filter((u) => u.side === side && !u.isHero && !u.compId && u.state !== 'dead' && u.state !== 'fled' && !u.onWall && u.troop.line === 'infantry' && u.troop.role === 'melee' && !hasTrait(u.troop, 'berserk'));
    const total = this.units.filter((u) => u.side === side).length + this.reserves[side].length;
    if (!pool.length || (initial && total < 10)) return;
    pool.sort((a, b) => b.troop.tier - a.troop.tier || (b.hp - a.hp));
    let best = pool[0];
    if (!initial) {
      const old = this.bearer[side];
      const fx = old ? old.x : avgX(pool);
      best = pool.reduce((m, u) => (Math.abs(u.x - fx) < Math.abs(m.x - fx) ? u : m), pool[0]);
    }
    best.banner = true;
    best.lookVer++;
    this.bearer[side] = best;
    if (!initial) this.events.push({ kind: 'banner', x: best.x, y: best.y, side });
  }

  // ───────────────────────── расстановка перед боем ─────────────────────────

  /** Где сторона может расставлять войска перед боем. */
  deployZone(side: Side): [number, number] {
    return side === 0 ? [40, 980] : [FIELD_W - 980, FIELD_W - 40];
  }

  /** Центр группы на поле (для подписи при расстановке). */
  groupCenter(side: Side, g: Group): { x: number; y: number; n: number } | null {
    const list = this.units.filter((u) => u.side === side && u.group === g && u.state !== 'dead' && u.state !== 'fled' && !u.onWall);
    if (!list.length) return null;
    return { x: avgX(list), y: list.reduce((s, u) => s + u.y, 0) / list.length, n: list.length };
  }

  /** Переставить группу блоком с центром в (x, y). */
  placeGroup(side: Side, g: Group, x: number, y: number) {
    const list = this.units.filter((u) => u.side === side && u.group === g && u.state !== 'dead' && u.state !== 'fled' && !u.onWall);
    if (!list.length) return;
    const { rows, spacing } = this.blockShape(g, list.length);
    const cols = Math.ceil(list.length / rows);
    const rowH = Math.min(26, (FIELD_Y1 - FIELD_Y0 - 16) / rows);
    const blockH = rowH * (rows - 1);
    const cy = Math.max(FIELD_Y0 + 8 + blockH / 2, Math.min(FIELD_Y1 - 8 - blockH / 2, y));
    const [z0, z1] = this.deployZone(side);
    const dir = side === 0 ? 1 : -1;
    const w = (cols - 1) * spacing;
    const cx = Math.max(z0 + w / 2, Math.min(z1 - w / 2, x));
    list.forEach((u, i) => {
      const row = i % rows;
      const col = Math.floor(i / rows);
      u.y = cy - blockH / 2 + row * rowH + rand(-3, 3);
      u.x = cx + dir * (w / 2 - col * spacing) + rand(-4, 4);
      u.facing = dir as 1 | -1;
      u.state = 'idle';
      u.target = null;
    });
  }

  /** Какие строи доступны группе стороны. */
  formsFor(side: Side, g: Group): Form[] {
    if (g === 'hero') return ['line'];
    const list = [...this.units, ...this.reserves[side]].filter((u) => u.side === side && u.group === g);
    if (!list.length) return ['line'];
    if (g === 'ranged') return ['line', 'loose'];
    if (g === 'cav') return ['line', 'wedge'];
    const out: Form[] = ['line'];
    const share = (f: (u: BUnit) => boolean) => list.filter(f).length / list.length;
    if (share((u) => u.troop.look.shield) >= 0.4) out.push('shieldwall');
    out.push('loose');
    if (share((u) => isPole(u.troop)) >= 0.4) out.push('hedgehog');
    return out;
  }

  setForm(side: Side, g: Group, f: Form) {
    this.forms[side][g] = f;
  }

  // ───────────────────────── команды игрока ─────────────────────────

  setOrder(side: Side, g: Group, o: Order) {
    if (o === 'follow' && !this.units.some((u) => u.isHero && u.side === side && u.state !== 'dead' && u.state !== 'fled')) o = 'attack';
    if (o === 'flank') {
      const mine = this.units.filter((u) => u.side === side && u.group === g && u.state !== 'dead' && u.state !== 'fled');
      const enemy = this.active((1 - side) as Side);
      if (!mine.length || !enemy.length) o = 'attack';
      else {
        const dir = side === 0 ? 1 : -1;
        const my = mine.reduce((s, u) => s + u.y, 0) / mine.length;
        const edge = my < MID_Y ? FIELD_Y0 + 6 : FIELD_Y1 - 6;
        const ex = avgX(enemy);
        const x = Math.max(80, Math.min(FIELD_W - 80, ex + dir * 150));
        this.flankSt[side][g] = { edge, x, t: 0 };
      }
    }
    if (o !== 'flank') delete this.flankSt[side][g];
    this.orders[side][g] = o;
  }

  setFire(side: Side, g: Group, on: boolean) {
    this.fire[side][g] = on;
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

  // ───────────────────────── местность ─────────────────────────

  /** Высота холма в точке x: 0 — низина, 1 — вершина. */
  hillAt(x: number): number {
    for (const h of this.field.hills) {
      if (x <= h.x0 || x >= h.x1) continue;
      const t = (x - h.x0) / (h.x1 - h.x0);
      return Math.pow(Math.sin(t * Math.PI), 1.5);
    }
    return 0;
  }

  inGrove(u: { x: number; y: number }): boolean {
    for (const g of this.field.groves) {
      const dx = (u.x - g.x) / g.rx;
      const dy = (u.y - g.y) / g.ry;
      if (dx * dx + dy * dy < 1) return true;
    }
    return false;
  }

  /** Телега между стрелком и целью прикрывает цель. */
  private coveredByCart(from: BUnit, t: BUnit): boolean {
    for (const c of this.field.carts) {
      if (Math.abs(t.y - c.y) > 24 || Math.abs(t.x - c.x) > 80) continue;
      if ((c.x - from.x) * (t.x - c.x) > 0) return true;
    }
    return false;
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
    this.camelAura(dt);
    this.updateFlanks(dt);
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
      u.lassoCd -= dt;
      if (u.disorder > 0) u.disorder -= dt;
      if (u.shieldHit > 0) u.shieldHit -= dt;
      if (u.fear > 0) u.fear -= dt;
      if (u.burn > 0) {
        u.burn -= dt;
        u.burnTick -= dt;
        if (u.burnTick <= 0) {
          u.burnTick = 0.5;
          this.damage(null, u, 2, 'burn');
          if ((u.state as BUnit['state']) === 'dead') continue;
        }
      }
      if (u.isHero && u.side === this.playerSide && this.heroCtl.on && !this.routed[u.side]) this.manual(u, dt);
      else {
        u.blocking = false;
        this.think(u, dt);
      }
    }
    for (const side of [0, 1] as Side[]) {
      if (this.bannerDrop[side] > 0) {
        this.bannerDrop[side] -= dt;
        if (this.bannerDrop[side] <= 0 && !this.routed[side]) this.pickBearer(side, false);
      }
    }
    this.updateProjectiles(dt);
    this.reinforce();
    this.checkEnd();
  }

  /** Верблюды пугают вражеских коней поблизости. */
  private camelAura(dt: number) {
    for (const c of this.camels) {
      if (c.state === 'dead' || c.state === 'fled' || c.troop.line !== 'cavalry') continue;
      if (!this.units.includes(c)) continue;
      for (const e of this.units) {
        if (e.side === c.side || e.troop.line !== 'cavalry' || e.state === 'dead' || e.state === 'fled' || hasTrait(e.troop, 'camel')) continue;
        if (Math.abs(e.x - c.x) > 130 || ed(e.x - c.x, e.y - c.y) > 130) continue;
        e.fear = 0.6;
        // Конь встаёт на дыбы
        if (e.stun <= 0 && Math.random() < dt * 0.12) e.stun = 0.6;
        if (!this.panicShown[e.side]) {
          this.panicShown[e.side] = true;
          this.events.push({ kind: 'panic', x: e.x, y: e.y, side: e.side });
        }
      }
    }
  }

  /** Обход с фланга: когда группа зашла в тыл (или время вышло) — в атаку. */
  private updateFlanks(dt: number) {
    for (const side of [0, 1] as Side[]) {
      const dir = side === 0 ? 1 : -1;
      for (const g of Object.keys(this.flankSt[side]) as Group[]) {
        const st = this.flankSt[side][g]!;
        st.t += dt;
        const list = this.units.filter((u) => u.side === side && u.group === g && u.state !== 'dead' && u.state !== 'fled');
        const passed = list.filter((u) => (u.x - st.x) * dir > -30).length;
        if (!list.length || st.t > 16 || passed >= list.length * 0.6) {
          delete this.flankSt[side][g];
          if (this.orders[side][g] === 'flank') this.orders[side][g] = 'attack';
        }
      }
    }
  }

  // ───────────────────────── ИИ противника ─────────────────────────

  /** Автобой: обеими сторонами командует ИИ (игроку — толковый воевода его державы). */
  private autoBoth = false;

  private ai(dt: number) {
    // Сильно уступающая сторона постепенно теряет боевой дух
    for (const sd of [0, 1] as Side[]) {
      const my = this.active(sd).length + this.reserves[sd].length;
      const their = this.active((1 - sd) as Side).length + this.reserves[1 - sd].length;
      if (my > 0 && their > my * 2) this.morale[sd] = Math.max(0, this.morale[sd] - 1.5 * dt);
    }
    if (this.siege && !this.breached) {
      // Ворота пали, когда перед стеной не осталось защитников
      if (!this.units.some((u) => u.side === 1 && !u.onWall && u.state !== 'dead' && u.state !== 'fled') && !this.reserves[1].some((u) => u.troop.role !== 'ranged')) {
        this.breached = true;
        this.events.push({ kind: 'breach', x: WALL_X, y: MID_Y, side: 1 });
      }
    }
    this.aiT += dt;
    const aiSide: Side = this.playerSide === 0 ? 1 : 0;
    for (const side of (this.autoBoth ? [0, 1] : [aiSide]) as Side[]) this.aiFor(side);
  }

  private aiFor(side: Side) {
    const mine = this.active(side);
    const enemy = this.active((1 - side) as Side);
    if (!mine.length || !enemy.length) return;
    const gap = Math.abs(avgX(mine) - avgX(enemy));
    if (this.siege) {
      // Защитники стоят на стенах, осаждающие просто идут на штурм
      if (side === 0) this.orders[side].ranged = gap > 600 ? 'attack' : 'hold';
      return;
    }
    const once = (key: string, cond: boolean, fn: () => void) => {
      const k = `${side}:${key}`;
      if (!this.aiStage[k] && cond) {
        this.aiStage[k] = true;
        fn();
      }
    };
    const culture = this.armies[side].culture;
    const has = (g: Group) => mine.some((u) => u.group === g);
    const infC = this.groupCenter(side, 'inf');
    let nearest = 9999;
    if (infC) for (const e of enemy) nearest = Math.min(nearest, Math.abs(e.x - infC.x));
    const hurt = this.morale[side] < this.maxMorale[side] * 0.8;
    const enemyCav = enemy.filter((u) => u.group === 'cav').length / enemy.length;
    const t = this.aiT;
    // Начальный замысел — по обычаю державы
    once('start', true, () => {
      const o = this.orders[side];
      const f = this.forms[side];
      o.hero = 'attack';
      switch (culture) {
        case 'aurelia':
          o.cav = 'hold';
          f.cav = 'wedge';
          o.inf = 'attack';
          break;
        case 'nordmark':
          if (this.formsFor(side, 'inf').includes('shieldwall')) f.inf = 'shieldwall';
          o.inf = 'hold';
          o.cav = 'hold';
          break;
        case 'horde':
          o.inf = 'hold';
          o.cav = 'hold';
          break;
        case 'sultanate':
          o.inf = 'hold';
          o.cav = 'hold';
          if (enemyCav > 0.4 && this.formsFor(side, 'inf').includes('hedgehog')) f.inf = 'hedgehog';
          break;
        default:
          f.inf = 'loose';
          o.inf = 'attack';
          o.cav = 'attack';
      }
    });
    switch (culture) {
      case 'aurelia':
        // Рыцари таранят почти сразу, клином
        once('knights', t > 1.5, () => this.setOrder(side, 'cav', 'attack'));
        break;
      case 'nordmark':
        // Стена щитов ждёт врага; под стрелами или когда враг близко — вперёд
        once('advance', nearest < 330 || hurt || t > 28, () => this.setOrder(side, 'inf', 'attack'));
        once('cav', t > 10, () => this.setOrder(side, 'cav', 'attack'));
        break;
      case 'horde':
        // Конные лучники кружат сразу, тяжёлая конница заходит с фланга
        once('flank', t > 9 && has('cav'), () => this.setOrder(side, 'cav', 'flank'));
        once('inf', nearest < 300 || t > 30, () => this.setOrder(side, 'inf', 'attack'));
        break;
      case 'sultanate':
        once('flank', t > 6 && has('cav'), () => this.setOrder(side, 'cav', 'flank'));
        once('inf', (nearest < 280 || t > 24) && this.forms[side].inf !== 'hedgehog', () => this.setOrder(side, 'inf', 'attack'));
        once('hedge', this.forms[side].inf === 'hedgehog' && (t > 30 || enemyCav < 0.15), () => {
          this.forms[side].inf = 'line';
          this.setOrder(side, 'inf', 'attack');
        });
        break;
      default:
        once('cav', t > 2, () => this.setOrder(side, 'cav', 'attack'));
    }
    // Стрелки идут вперёд, если противник держится далеко
    this.orders[side].ranged = gap > 600 ? 'attack' : 'hold';
  }

  private findTarget(u: BUnit): BUnit | null {
    let best: BUnit | null = null;
    let bestD = Infinity;
    const lasso = hasTrait(u.troop, 'lasso');
    const gun = hasTrait(u.troop, 'gun');
    const pot = hasTrait(u.troop, 'firepot');
    for (const e of this.units) {
      if (e.side === u.side || e.state === 'dead' || e.state === 'fled') continue;
      if (e.onWall && !this.breached && u.troop.role !== 'ranged') continue;
      let d = ed(e.x - u.x, e.y - u.y);
      if (u.group === 'cav' && e.troop.role === 'ranged') d *= 0.8; // конница охотится на стрелков
      if (lasso && e.troop.line === 'cavalry' && !hasTrait(e.troop, 'camel')) d *= 0.6;
      if (gun && (e.troop.line === 'cavalry' || e.troop.tier >= 4)) d *= 0.85;
      if (pot) d -= (this.attackers.get(e.uid) ?? 0) * 12; // огонь — туда, где свалка
      if (e.banner) d *= 0.85;
      // Не наваливаться всем на одного: занятые цели менее привлекательны
      if (u.troop.role !== 'ranged') d += (this.attackers.get(e.uid) ?? 0) * (e === u.target ? 0 : 22);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private reach(u: BUnit, t?: BUnit | null): number {
    if (u.troop.line === 'cavalry') return REACH.cav;
    let r = isPole(u.troop) ? REACH.pole : REACH.short;
    // Упёртые копья встречают коня раньше, чем он достанет всадника
    if (t && t.troop.line === 'cavalry' && this.braced(u)) r += 14;
    return r;
  }

  /** Копейщик стоит и держит упор. */
  private braced(u: BUnit): boolean {
    if (!hasTrait(u.troop, 'brace')) return false;
    const f = this.forms[u.side][u.group];
    return f === 'hedgehog' || u.state !== 'walk';
  }

  /** Дальность стрельбы в пикселях с учётом стены, холма, ночи, тумана. */
  rangeOf(u: BUnit): number {
    let r = u.troop.range * METER;
    if (u.onWall) r *= 1.35;
    if (this.opts.terrain === 'dry') r *= 1.1;
    if (this.opts.night) r *= 0.75;
    r *= 1 + this.hillAt(u.x) * 0.22;
    const w = this.opts.weather;
    if (w === 'fog') r *= 0.6;
    if (w === 'rain' && u.troop.look.weapon === 'bow') r *= 0.9;
    return r;
  }

  private think(u: BUnit, dt: number) {
    if (u.stun > 0) {
      u.stun -= dt;
      u.swing = 0;
      u.state = 'idle';
      u.planted = false;
      this.separate(u, dt, 0.3);
      return;
    }
    const berserk = hasTrait(u.troop, 'berserk');
    let order: Order = this.routed[u.side] && !berserk ? 'retreat' : this.orders[u.side][u.group];
    // Берсерки не отступают и не стоят на месте
    if (berserk) order = 'attack';
    // Конные стрелки противника сами кружат у строя, не дожидаясь общего приказа
    if ((u.side !== this.playerSide || this.autoBoth) && u.ammo > 0 && hasTrait(u.troop, 'skirmish') && (order === 'hold' || order === 'flank') && !this.siege) order = 'attack';
    if (order === 'retreat') {
      u.swing = 0;
      u.planted = false;
      this.moveUnit(u, dt);
      return;
    }
    const form = this.forms[u.side][u.group];
    // Арканщики не ходят в обход: им нужна цель рядом
    if (order === 'flank' && !hasTrait(u.troop, 'lasso') && this.flankMove(u, dt)) return;
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
    const reach = t.onWall || u.onWall ? this.reach(u) + 60 : this.reach(u, t);
    const inMelee = t.onWall || u.onWall ? Math.abs(dx) <= reach : dist <= reach;
    const ranged = u.troop.role === 'ranged' && u.ammo > 0 && this.fire[u.side][u.group];
    const rangePx = this.rangeOf(u);

    if (inMelee) {
      u.state = 'attack';
      u.planted = false;
      this.separate(u, dt, 0.9);
      if (u.cd <= 0) {
        const brace = t.troop.line === 'cavalry' && t.charge && this.braced(u);
        this.startSwing(u, brace ? 0.1 : ranged ? 0.25 : 0.3);
      } else if (u.anim > 0.5) u.state = 'idle';
      return;
    }

    // Конные стрелки держат дистанцию; легкая конница Орды отходит, отстреливаясь
    if (ranged && hasTrait(u.troop, 'skirmish')) {
      const threat = this.threatTo(u, 170);
      if (threat) {
        const away = u.x - threat.x || (u.side === 0 ? -1 : 1);
        this.steer(u, Math.sign(away) * 100, (u.y < MID_Y ? 1 : -1) * 30, dt, hasTrait(u.troop, 'feint') ? 1.1 : 0.95);
        if (hasTrait(u.troop, 'feint')) {
          if (threat.target === u) {
            threat.chase += dt;
            if (threat.chase > 3 && threat.disorder <= 0) {
              threat.disorder = 5;
              threat.chase = 0;
              this.events.push({ kind: 'feint', x: threat.x, y: threat.y, side: threat.side });
            }
          }
          // Парфянский выстрел: на скаку назад
          if (u.cd <= 0 && ed(threat.x - u.x, threat.y - u.y) <= rangePx) {
            u.facing = threat.x > u.x ? 1 : -1;
            this.shoot(u, threat);
          }
        }
        return;
      }
    }

    if (ranged && dist <= rangePx) {
      this.separate(u, dt, 0.5);
      u.state = u.cd <= 0.3 ? 'attack' : 'idle';
      if (hasTrait(u.troop, 'pavise')) u.planted = true;
      if (u.cd <= 0) this.shoot(u, t);
      return;
    }
    u.planted = false;

    // Дротики — перед самой сшибкой
    if (u.javelins > 0 && !t.onWall && !u.onWall && dist < JAVELIN_PX && dist > reach + 18 && u.cd <= 0) {
      this.throwJavelin(u, t);
      return;
    }
    // Аркан — по всаднику поблизости; пока аркан не готов, от тарана уходим
    if (hasTrait(u.troop, 'lasso') && t.troop.line === 'cavalry' && !hasTrait(t.troop, 'camel')) {
      if (u.lassoCd <= 0 && dist < LASSO_PX && dist > 24) {
        this.throwLasso(u, t);
        return;
      }
      if (u.lassoCd > 0 && dist < 170 && t.stun <= 0 && order !== 'hold') {
        const away = u.x - t.x || (u.side === 0 ? -1 : 1);
        this.steer(u, Math.sign(away) * 100, (u.y < MID_Y ? 1 : -1) * 40, dt, 1.05);
        return;
      }
    }

    if (u.onWall) {
      u.state = 'idle';
      return;
    }
    if (order === 'hold' || form === 'hedgehog') {
      this.separate(u, dt, 0.6);
      u.state = 'idle';
      return;
    }
    if (order === 'follow') {
      const hero = this.units.find((h) => h.isHero && h.side === u.side && h.state !== 'dead' && h.state !== 'fled');
      if (!hero) this.orders[u.side][u.group] = 'attack';
      else if (dist > 150) {
        const dir = u.side === 0 ? 1 : -1;
        const gx = hero.x - dir * (u.group === 'ranged' ? 110 : 60) - u.x;
        const gy = hero.y - u.y;
        if (ed(gx, gy) > 50) this.steer(u, gx, gy, dt, 1);
        else {
          this.separate(u, dt, 0.6);
          u.state = 'idle';
        }
        return;
      }
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

  /** Ближайший враг-рубака, подступивший к стрелку. */
  private threatTo(u: BUnit, r: number): BUnit | null {
    let best: BUnit | null = null;
    let bd = r;
    for (const e of this.units) {
      if (e.side === u.side || e.state === 'dead' || e.state === 'fled' || e.onWall) continue;
      if (e.troop.role === 'ranged' && e.ammo > 0) continue;
      if (Math.abs(e.x - u.x) > r) continue;
      const d = ed(e.x - u.x, e.y - u.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** Манёвр обхода: по краю поля в тыл врагу. true — ещё идём, не отвлекаемся. */
  private flankMove(u: BUnit, dt: number): boolean {
    const st = this.flankSt[u.side][u.group];
    if (!st) return false;
    const dir = u.side === 0 ? 1 : -1;
    if ((u.x - st.x) * dir > -30) return false;
    // Если враг вплотную — рубимся
    for (const e of this.units) {
      if (e.side === u.side || e.state === 'dead' || e.state === 'fled') continue;
      if (Math.abs(e.x - u.x) < 44 && ed(e.x - u.x, e.y - u.y) < 44) return false;
    }
    const aheadX = Math.abs(u.y - st.edge) > 20 ? u.x + dir * 80 : st.x;
    this.steer(u, aheadX - u.x, st.edge - u.y, dt, 1);
    return true;
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
    if (u.stun > 0) {
      u.stun -= dt;
      u.state = 'idle';
      return;
    }
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
        const t = this.nearestFoe(u, this.rangeOf(u));
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

  /** Радиус «личного пространства» по строю. */
  private spaceOf(u: BUnit): number {
    const f = this.forms[u.side][u.group];
    if (u.troop.line === 'cavalry') return 40;
    if (f === 'shieldwall' || f === 'hedgehog') return 19;
    if (f === 'loose') return 38;
    return 25;
  }

  /** Отталкивание от соседей, чтобы бойцы не слипались в кучу. Возвращает вектор. */
  private separation(u: BUnit): [number, number] {
    let sx = 0;
    let sy = 0;
    const own = this.spaceOf(u);
    for (const a of this.units) {
      if (a === u || a.state === 'dead' || a.state === 'fled' || a.onWall) continue;
      const R = a.troop.line === 'cavalry' || u.troop.line === 'cavalry' ? 40 : a.side === u.side ? own : 25;
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
    // Телеги — препятствие
    for (const c of this.field.carts) {
      const dx = u.x - c.x;
      const dy = u.y - c.y;
      if (Math.abs(dx) < CART_HW + 8 && Math.abs(dy) < CART_HH + 8) {
        sy += (dy >= 0 ? 1 : -1) * 1.2;
        sx += (dx >= 0 ? 1 : -1) * 0.4;
      }
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
    let speed = u.troop.speed * SPEED_K * k * this.speedMul(u);
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
    // Телега впереди — обходим сверху или снизу
    for (const c of this.field.carts) {
      const nx = u.x + vx * 20;
      if (Math.abs(nx - c.x) < CART_HW + 6 && Math.abs(u.y - c.y) < CART_HH + 8) {
        vx *= 0.25;
        vy = u.y >= c.y ? 1 : -1;
      }
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
      if (this.inGrove(u)) u.chargeDist = 0;
      else {
        u.chargeDist += Math.hypot(stepX, stepY);
        let need = this.opts.terrain === 'forest' ? 230 : 140;
        if (this.forms[u.side][u.group] === 'wedge') need -= 50;
        if (this.opts.weather === 'rain') need += 40;
        if (u.chargeDist > need) u.charge = true;
      }
    }
  }

  /** Множитель скорости: местность, строй, страх, погода. */
  private speedMul(u: BUnit): number {
    let k = 1;
    const t = this.opts.terrain;
    const cav = u.troop.line === 'cavalry';
    if (t === 'forest' && cav) k *= 0.75;
    if (t === 'snow') k *= 0.85;
    if (this.opts.ford && !this.siege && Math.abs(u.x - FORD_X) < FORD_HALF) k *= 0.55;
    if (this.field.groves.length && this.inGrove(u)) k *= cav ? 0.6 : 0.85;
    const f = this.forms[u.side][u.group];
    if (f === 'shieldwall') k *= 0.55;
    if (u.fear > 0) k *= 0.8;
    if (u.disorder > 0) k *= 0.9;
    const w = this.opts.weather;
    if (w === 'rain' && cav) k *= 0.9;
    if (w === 'snow') k *= 0.92;
    if (hasTrait(u.troop, 'berserk') && u.hp < u.maxHp * 0.6) k *= 1.1;
    return k;
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
    if (ed(t.x - u.x, t.y - u.y) > this.reach(u, t) + 12) return;
    let mult = u.troop.role === 'ranged' ? 0.55 : 1;
    if (u.charge && u.troop.line === 'cavalry') {
      mult *= u.troop.look.weapon === 'lance' ? 1.9 : 1.5;
      if (this.forms[u.side][u.group] === 'wedge') mult *= 1.25;
      // Таран о стену копий теряет половину силы
      if (this.braced(t)) mult *= 0.55;
      u.charge = false;
      u.chargeDist = 0;
      this.events.push({ kind: 'charge', x: t.x, y: t.y, side: u.side });
    }
    if (isPole(u.troop) && t.troop.line === 'cavalry') {
      mult *= 1.4;
      if (this.forms[u.side][u.group] === 'hedgehog') mult *= 1.35;
      // Упор: всадник на скаку насаживается на копьё
      if (t.charge && this.braced(u)) {
        mult *= 2;
        t.charge = false;
        t.chargeDist = 0;
        t.stun = Math.max(t.stun, 0.6);
        this.events.push({ kind: 'brace', x: t.x, y: t.y, side: u.side });
      }
    }
    this.resolveHit(u, t, mult, false);
  }

  private throwJavelin(u: BUnit, t: BUnit) {
    u.javelins--;
    u.cd = 0.9;
    u.anim = 0;
    u.state = 'attack';
    const dist = Math.hypot(t.x - u.x, t.y - u.y);
    let hit = 0.8 - dist / 600;
    if (this.inGrove(t)) hit *= 0.6;
    const willHit = Math.random() < hit;
    const dur = 0.35 + dist / 480;
    this.projectiles.push({
      x: u.x, y: u.y - 36, x0: u.x + u.facing * 6, y0: u.y - 40, x1: t.x + (willHit ? 0 : rand(-30, 30)), y1: t.y - (willHit ? 26 : rand(-4, 2)),
      t: 0, dur, arc: Math.min(70, dist * 0.2), from: u, target: t, willHit, mult: 1, kind: 'javelin', done: false,
    });
    this.events.push({ kind: 'javelin', x: u.x, y: u.y, side: u.side });
  }

  private throwLasso(u: BUnit, t: BUnit) {
    u.lassoCd = u.troop.tier >= 4 ? 6 : 8;
    u.cd = Math.max(u.cd, 0.8);
    u.anim = 0;
    u.state = 'attack';
    const dist = Math.hypot(t.x - u.x, t.y - u.y);
    const dur = 0.3 + dist / 520;
    this.projectiles.push({
      x: u.x, y: u.y - 50, x0: u.x + u.facing * 4, y0: u.y - 58, x1: t.x, y1: t.y - 52,
      t: 0, dur, arc: 18, from: u, target: t, willHit: true, mult: 1, kind: 'lasso', done: false,
    });
  }

  /** Меткость выстрела по цели: дым, стены, лес, ночь, погода, укрытия, строй. */
  private hitMods(u: BUnit, t: BUnit): number {
    let k = 1;
    if (this.smoke && u.side !== this.playerSide && Math.abs(t.x - this.smoke.x) < 260) k *= 0.35;
    if (this.smoke && u.side === this.playerSide && Math.abs(u.x - this.smoke.x) < 200) k *= 0.6;
    if (t.onWall) k *= 0.55;
    if (this.opts.terrain === 'forest') k *= 0.8;
    if (this.opts.night) k *= 0.65;
    const w = this.opts.weather;
    const weapon = u.troop.look.weapon;
    if (w === 'rain') k *= weapon === 'crossbow' ? 0.75 : weapon === 'bow' ? 0.8 : 1;
    if (w === 'snow' && weapon === 'bow') k *= 0.9;
    if (w === 'fog') k *= 0.85;
    if (this.inGrove(t)) k *= 0.55;
    if (this.coveredByCart(u, t)) k *= 0.5;
    if (this.forms[t.side][t.group] === 'loose') k *= 0.65;
    return k;
  }

  private shoot(u: BUnit, t: BUnit) {
    const gun = hasTrait(u.troop, 'gun');
    const pot = hasTrait(u.troop, 'firepot');
    u.anim = 0;
    u.state = 'attack';
    // В дождь порох сыреет
    if (gun && this.opts.weather === 'rain' && Math.random() < 0.45) {
      u.cd = u.troop.attackTime * 0.6;
      this.events.push({ kind: 'misfire', x: u.x + u.facing * 20, y: u.y - 30, side: u.side });
      return;
    }
    u.ammo--;
    const v = u as BUnit & { volley?: boolean };
    const mult = v.volley ? 1.3 : 1;
    v.volley = false;
    u.cd = u.troop.attackTime * rand(0.9, 1.15);
    const dist = Math.hypot(t.x - u.x, t.y - u.y);
    const range = Math.max(1, this.rangeOf(u));
    let hitChance = gun ? 0.76 - (dist / range) * 0.3 : pot ? 0.8 - (dist / range) * 0.3 : 0.88 - (dist / range) * 0.35;
    hitChance *= this.hitMods(u, t);
    if (u.onWall) hitChance = Math.min(0.95, hitChance + 0.12);
    hitChance += this.hillAt(u.x) * 0.06;
    const willHit = Math.random() < hitChance;
    const kind: ProjectileKind = gun ? 'ball' : pot ? 'pot' : u.troop.look.weapon === 'crossbow' ? 'bolt' : 'arrow';
    const dur = gun ? 0.05 + dist / 2600 : pot ? 0.45 + dist / 420 : 0.25 + dist / 520;
    const lead = t.state === 'walk' ? t.facing * t.troop.speed * SPEED_K * dur : 0;
    const x1 = t.x + lead + (willHit ? 0 : rand(pot ? -60 : -40, pot ? 60 : 40));
    const muzzleY = u.y - (u.troop.line === 'cavalry' ? 38 : gun ? 34 : 28);
    this.projectiles.push({
      x: u.x,
      y: muzzleY,
      x0: u.x + u.facing * (gun ? 18 : 8),
      y0: muzzleY,
      x1,
      y1: pot ? t.y : t.y - (willHit ? 22 : rand(-4, 2)),
      t: 0,
      dur,
      arc: gun ? 0 : pot ? Math.min(150, 40 + dist * 0.35) : Math.min(120, dist * 0.22),
      from: u,
      target: t,
      willHit,
      mult,
      kind,
      done: false,
    });
    if (gun) {
      this.events.push({ kind: 'gun', x: u.x + u.facing * 30, y: muzzleY, side: u.side });
      // Грохот бьёт по духу, кони шарахаются
      this.morale[t.side] = Math.max(0, this.morale[t.side] - 0.45);
    } else this.events.push({ kind: 'shoot', x: u.x, y: u.y, side: u.side });
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
        if (p.kind === 'pot') this.potBurst(p);
        else if (p.kind === 'lasso') this.lassoLand(p);
        else if (p.willHit && p.target.state !== 'dead' && p.target.state !== 'fled' && ed(p.target.x - p.x1, p.target.y - (p.y1 + 22)) < 34) {
          this.resolveHit(p.from, p.target, p.mult, true, p.kind);
        }
      }
    }
    if (this.projectiles.length > 200) this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  /** Горшок разбился: огонь по всем врагам вокруг. */
  private potBurst(p: Projectile) {
    const a = p.from;
    const rain = this.opts.weather === 'rain';
    this.events.push({ kind: 'fire', x: p.x1, y: p.y1, side: a.side });
    let hitAny = false;
    for (const d of this.units) {
      if (d.side === a.side || d.state === 'dead' || d.state === 'fled') continue;
      if (Math.abs(d.x - p.x1) > 44 || ed(d.x - p.x1, d.y - p.y1) > 42) continue;
      hitAny = true;
      const armor = (d.troop.armor.cut + d.troop.armor.pierce + d.troop.armor.blunt) / 3;
      let dmg = a.troop.damage * rand(0.8, 1.2) * p.mult * (1 - armor * 0.3) * (rain ? 0.6 : 1);
      if (this.siege && d.side === 1 && d.onWall) dmg *= 0.7;
      d.burn = Math.max(d.burn, rain ? 1 : 2.5);
      d.burnTick = 0.5;
      if (d.troop.line === 'cavalry' && !hasTrait(d.troop, 'berserk')) d.stun = Math.max(d.stun, 0.9);
      this.damage(a, d, Math.max(1, Math.round(dmg)), 'hit');
    }
    if (hitAny) this.morale[(1 - a.side) as Side] = Math.max(0, this.morale[1 - a.side] - 1.2);
  }

  /** Аркан долетел: всадник может оказаться на земле. */
  private lassoLand(p: Projectile) {
    const t = p.target;
    const u = p.from;
    if (t.state === 'dead' || t.state === 'fled' || t.troop.line !== 'cavalry') return;
    if (ed(t.x - p.x1, t.y - (p.y1 + 52)) > 60) return;
    let chance = u.troop.tier >= 4 ? 0.75 : 0.6;
    if (t.isHero) chance *= 0.5;
    if (t.troop.tier >= 4) chance *= 0.8;
    if (Math.random() >= chance) return;
    t.origTroop ??= t.troop;
    t.troop = footVersion(t.troop);
    t.charge = false;
    t.chargeDist = 0;
    t.stun = 1.8;
    t.swing = 0;
    t.lookVer++;
    this.events.push({ kind: 'lasso', x: t.x, y: t.y, side: u.side });
    // Падение с коня в доспехе — больно
    this.damage(u, t, 14, 'hit');
  }

  private resolveHit(a: BUnit, d: BUnit, mult: number, ranged: boolean, kind?: ProjectileKind) {
    const t = d.troop;
    const ball = kind === 'ball';
    const twohand = !ranged && hasTrait(a.troop, 'twohand');
    const behind = !ranged && (a.x - d.x) * d.facing < -8;
    const flank = !ranged && !behind && Math.abs(d.y - a.y) * Y_SCALE > Math.abs(d.x - a.x) * 1.1;
    // Уклонение
    const helpless = d.stun > 0 && !d.isHero;
    let dodge = helpless ? 0 : t.dodge;
    if (ranged) dodge *= ball ? 0.35 : 0.7;
    if (d.disorder > 0) dodge *= 0.6;
    if (!ranged && d.troop.line === 'infantry' && this.inGrove(d)) dodge += 0.06;
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
    let block = t.block;
    const form = this.forms[d.side][d.group];
    if (block > 0) {
      if (form === 'shieldwall') block = Math.min(0.75, block + 0.15) * (ranged ? 1.5 : 1);
      if (d.shieldHit > 0) block *= 0.4;
      if (twohand) block *= 0.5;
      if (ball) block *= 0.4;
      if (flank) block *= 0.6;
      if (d.disorder > 0) block *= 0.5;
      if (this.nearBanner(d)) block += 0.05;
    }
    if (d.planted && ranged) block = Math.max(block, ball ? 0.3 : 0.6);
    if (hasTrait(a.troop, 'berserk')) block *= 0.6;
    if (helpless) block = 0;
    if (block > 0 && facingAttacker && d.swing <= 0 && Math.random() < Math.min(0.9, block * (ranged ? 0.8 : 1))) {
      // Дротик застревает в щите: щит тяжелеет
      if (kind === 'javelin' && t.block > 0) d.shieldHit = 8;
      this.events.push({ kind: 'block', x: d.x, y: d.y, side: d.side });
      return;
    }
    let crit = false;
    if (Math.random() < a.troop.crit) {
      crit = true;
      mult *= rand(1.5, 2);
    }
    if (this.buff[a.side] > 0) mult *= 1.2;
    if (this.nearBanner(a)) mult *= 1.1;
    if (a.fear > 0) mult *= 0.85;
    if (a.disorder > 0) mult *= 0.85;
    if (hasTrait(a.troop, 'berserk')) mult *= 1 + 0.8 * (1 - a.hp / a.maxHp);
    if (!ranged) {
      const dh = this.hillAt(a.x) - this.hillAt(d.x);
      if (dh > 0.3) mult *= 1.12;
      else if (dh < -0.3) mult *= 0.9;
      if (form === 'loose') mult *= 1.1;
      if (form === 'hedgehog' && a.troop.line === 'cavalry') {
        mult *= 0.7;
        // Конь напарывается на копья
        if (Math.random() < 0.5) this.damage(d, a, 5, 'hit');
      }
      if (behind) {
        mult *= 1.35;
        this.morale[d.side] = Math.max(0, this.morale[d.side] - 0.3);
        if (Math.random() < 0.3) this.events.push({ kind: 'rear', x: d.x, y: d.y, side: d.side });
      } else if (flank) mult *= 1.15;
    }
    if (kind === 'javelin') mult *= 1.6;
    if (helpless && !ranged) mult *= 1.3;
    const type: DamageType = a.troop.damageType;
    const armorK = ball ? 0.5 : twohand ? 0.65 : kind === 'javelin' ? 0.8 : 1;
    const base = kind === 'javelin' ? Math.max(a.troop.damage, 14) : a.troop.damage;
    let dmg = base * rand(0.85, 1.15) * mult * (1 - t.armor[type] * armorK);
    if (this.siege && d.side === 1) dmg *= d.onWall ? 0.7 : 0.75; // укрепления
    // Пуля: конь шарахается
    if (ball && d.troop.line === 'cavalry') d.stun = Math.max(d.stun, 1);
    this.damage(a, d, Math.max(1, Math.round(dmg)), crit ? 'crit' : 'hit');
  }

  /** Рядом развевается своё знамя. */
  private nearBanner(u: BUnit): boolean {
    const b = this.bearer[u.side];
    if (!b || b === u) return !!b;
    return Math.abs(b.x - u.x) < BANNER_R && ed(b.x - u.x, b.y - u.y) < BANNER_R;
  }

  private damage(a: BUnit | null, d: BUnit, dmg: number, kind: 'hit' | 'crit' | 'burn') {
    if (d.side === this.playerSide && this.opts.playerDamageK) dmg = Math.max(1, Math.round(dmg * this.opts.playerDamageK));
    d.hp -= dmg;
    d.flash = kind === 'burn' ? Math.max(d.flash, 0.06) : 0.18;
    this.events.push({ kind, x: d.x, y: d.y, side: d.side, amount: dmg });
    if (a) a.xp += dmg * 0.4;
    if (d.hp <= 0) {
      d.hp = 0;
      d.state = 'dead';
      d.deadT = 0;
      d.swing = 0;
      d.burn = 0;
      if (a) a.xp += d.troop.tier * 14 + 6;
      const side = d.side;
      let loss = 125 / Math.max(8, this.initialCount[side]);
      if (hasTrait(d.troop, 'berserk')) loss *= 0.5;
      if (d.isHero) {
        loss += 15;
        this.heroDown = this.heroDown || side === this.playerSide;
        this.events.push({ kind: 'heroDown', x: d.x, y: d.y, side });
      }
      if (d.banner) {
        d.banner = false;
        this.bearer[side] = null;
        loss += 10;
        this.bannerDrop[side] = 4;
        this.events.push({ kind: 'bannerDown', x: d.x, y: d.y, side });
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
        for (const u of this.units) if (u.side === side && u.state !== 'dead' && !hasTrait(u.troop, 'berserk')) u.routed = true;
        this.events.push({ kind: 'rout', x: 0, y: 0, side });
      }
    }
    if (this.time > 300 && !this.routed[0] && !this.routed[1]) {
      const loser: Side = this.morale[0] < this.morale[1] ? 0 : 1;
      this.morale[loser] = 0;
    }
    for (const side of [0, 1] as Side[]) {
      const alive = this.active(side).length + (this.routed[side] ? 0 : this.reserves[side].length);
      // Бегущая армия уже не стоит, но берсерки дерутся до последнего
      const standing = this.routed[side] ? (this.time > 330 ? 0 : this.active(side).filter((u) => !u.routed).length) : alive;
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
    for (const g of ['hero', 'inf', 'ranged', 'cav'] as Group[]) {
      this.orders[ps][g] = 'attack';
      this.fire[ps][g] = true;
      delete this.flankSt[ps][g];
    }
    this.autoBoth = true;
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
    const companionsDown: string[] = [];
    for (const u of all) {
      if (u.isHero) {
        heroDead = u.state === 'dead';
        continue;
      }
      if (u.compId) {
        if (u.state === 'dead') companionsDown.push(u.compId);
        continue;
      }
      const s = bySt.get(u.stackKey) ?? { dead: 0, survived: 0, xp: 0, troop: u.origTroop ?? u.troop };
      if (u.state === 'dead') s.dead++;
      else s.survived++;
      s.xp += u.xp;
      bySt.set(u.stackKey, s);
    }
    return { stacks: bySt, heroDead, companionsDown };
  }
}

function avgX(list: BUnit[]) {
  return list.reduce((s, u) => s + u.x, 0) / list.length;
}

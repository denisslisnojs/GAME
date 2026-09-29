import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { music } from '../audio/music';
import { drawArena, drawBush, drawCart, drawFar, drawFieldTree, drawGround, drawHill, drawMid, drawSky, drawStake, drawWall, type BattleTerrain } from '../battle/background';
import { lookKey, troopLook } from '../battle/looks';
import { FIELD_W, FIELD_Y0, FIELD_Y1, FORD_HALF, FORD_X, MID_Y, WALL_X, type Battle, type BattleEvent, type BUnit, type Group, type Side } from '../battle/sim';
import { FACTIONS, type FactionId } from '../data/factions';
import { mulberry32 } from '../util/rng';
import { drawUnitSheet, FEET_Y, FRAME_H, FRAME_W, type UnitLook } from '../gfx/units';
import { BattleHud } from '../ui/battleHud';
import { resetHints } from '../ui/hints';
import { tr } from '../i18n';

export interface BattleSceneData {
  battle: Battle;
  terrain: BattleTerrain;
  heroFaction: FactionId;
  /** Облик героя из его снаряжения. */
  heroLook?: UnitLook;
  heroPortrait?: string;
  heroEmblem?: string;
  enemyName: string;
  enemyColor: string;
  /** Осада: облик стены (культура крепости и цвета владельца). */
  wall?: { culture: string; color: string; color2: string };
  /** Турнир: трибуны вместо холмов, без способностей. */
  arena?: { colors: string[] };
  /** Погода (устар.: теперь берётся из условий боя). */
  weather?: 'rain' | 'snow' | 'fog';
  onFinish: (b: Battle) => void;
}

const WORLD_H = 640;
const GROUND_Y = 400;
const SCALE = 2;
/** Высота боевого хода стены (мировая y ног стрелков на стене). */
const WALL_TOP = 348;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
  size: number;
  gravity: number;
}

/** Подъём воинов на вершине холма, пикселей. */
const HILL_LIFT = 26;
const GROUP_LABEL: Record<Group, string> = { hero: tr('Герой'), inf: tr('Пехота'), ranged: tr('Стрелки'), cav: tr('Конница') };

function cssNum(c: string): number {
  return Phaser.Display.Color.HexStringToColor(c).color;
}

const LAYER_PAD = 900;
const LAYER_W = (FIELD_W + LAYER_PAD * 2) / 2;

/** Слои фона местности: ключ текстуры и как её нарисовать. */
function terrainLayers(t: BattleTerrain): { key: string; make: () => HTMLCanvasElement }[] {
  return [
    { key: `bg_sky_${t}`, make: () => drawSky(t, LAYER_W, 260) },
    { key: `bg_far_${t}`, make: () => drawFar(t, LAYER_W, 90) },
    { key: `bg_mid_${t}`, make: () => drawMid(t, LAYER_W, 60) },
    { key: `bg_ground_${t}`, make: () => drawGround(t, LAYER_W, (WORLD_H - GROUND_Y + 200) / 2) },
  ];
}

/** Заранее нарисовать фоны местности в свободное время (по слою за раз), чтобы бой открывался без паузы. */
export function prewarmBattleTerrain(textures: Phaser.Textures.TextureManager, terrains: BattleTerrain[]) {
  const jobs = terrains.flatMap(terrainLayers).filter((j) => !textures.exists(j.key));
  const idle = (fn: () => void) => ((window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 50)))(fn);
  const next = () => {
    const j = jobs.shift();
    if (!j) return;
    if (!textures.exists(j.key)) textures.addCanvas(j.key, j.make());
    idle(next);
  };
  idle(next);
}

export class BattleScene extends Phaser.Scene {
  private cfg!: BattleSceneData;
  private battle!: Battle;
  private sprites = new Map<number, Phaser.GameObjects.Sprite>();
  private shadows!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private weatherG: Phaser.GameObjects.Graphics | null = null;
  private drops: { x: number; y: number; v: number; s: number }[] = [];
  private stakeImgs: Phaser.GameObjects.Image[] = [];
  private heroLabel: Phaser.GameObjects.Text | null = null;
  private compLabels = new Map<number, Phaser.GameObjects.Text>();
  private floats: { t: Phaser.GameObjects.Text; life: number }[] = [];
  private particles: Particle[] = [];
  private smokePuffs: Particle[] = [];
  private dust: Particle[] = [];
  private nightG: Phaser.GameObjects.Graphics | null = null;
  private hud!: BattleHud;
  private speed = 1;
  private paused = false;
  private dragUntil = 0;
  /** Множитель масштаба камеры: >1 ближе, <1 дальше. Подбирается по размеру боя. */
  private zoomMul = 1;
  private pinch: { d: number; z: number } | null = null;
  private endTimer = -1;
  private finished = false;
  private dragging: { x: number } | null = null;
  private ladders: Phaser.GameObjects.Graphics | null = null;
  /** Расстановка войск перед боем. */
  private deploying = false;
  private deployG: Phaser.GameObjects.Graphics | null = null;
  private groupTexts = new Map<Group, Phaser.GameObjects.Text>();
  private fieldLabels: Phaser.GameObjects.Text[] = [];
  private tapStart: { x: number; y: number; t: number } | null = null;
  private bannerG: [Phaser.GameObjects.Graphics | null, Phaser.GameObjects.Graphics | null] = [null, null];
  private lookVers = new Map<number, number>();
  private fogPuffs: Particle[] = [];
  private flames: Particle[] = [];
  private lastFloat: Record<string, number> = {};

  constructor() {
    super('battle');
  }

  init(data: BattleSceneData) {
    this.cfg = data;
    this.battle = data.battle;
    this.sprites = new Map();
    this.floats = [];
    this.particles = [];
    this.smokePuffs = [];
    this.dust = [];
    this.nightG = null;
    this.stakeImgs = [];
    this.heroLabel = null;
    this.compLabels = new Map();
    this.speed = 1;
    this.paused = false;
    this.endTimer = -1;
    this.finished = false;
    this.pinch = null;
    this.deploying = false;
    this.deployG = null;
    this.groupTexts = new Map();
    this.fieldLabels = [];
    this.tapStart = null;
    this.bannerG = [null, null];
    this.lookVers = new Map();
    this.fogPuffs = [];
    this.flames = [];
    this.lastFloat = {};
    // Большие сражения (50+ воинов) — камера заранее дальше; приблизить можно вручную
    const total = data.battle.armies.reduce((n, a) => n + a.troops.reduce((m, t) => m + t.count, 0) + (a.hero ? 1 : 0), 0);
    this.zoomMul = total < 50 ? 1 : total < 90 ? 0.8 : 0.68;
  }

  /** Сменить масштаб, сохранив центр кадра. */
  private setZoom(mul: number) {
    const cam = this.cameras.main;
    const cx = cam.scrollX + cam.width / 2;
    this.zoomMul = Phaser.Math.Clamp(mul, 0.5, 1.8);
    this.fitCamera();
    cam.scrollX = cx - cam.width / 2;
    this.clampScrollX();
  }

  create() {
    const cam = this.cameras.main;
    cam.roundPixels = true;
    this.fitCamera();
    this.scale.on('resize', this.fitCamera, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.fitCamera, this);
      this.hud?.destroy();
      sfx.crowdStop();
    });
    if (this.cfg.arena) sfx.crowdStart();
    resetHints(); // советы не должны висеть поверх боя

    // Фон
    const t = this.cfg.terrain;
    // Слои шире поля: при отдалении камеры края не должны оголяться
    const PAD = 900;
    const W = (FIELD_W + PAD * 2) / SCALE;
    const L = terrainLayers(t);
    this.addLayer(L[0].key, L[0].make, -PAD, -120, 0.1);
    this.addLayer(L[1].key, L[1].make, -PAD, GROUND_Y - 180 + 10, 0.3);
    const arena = this.cfg.arena;
    if (arena) this.addLayer(`bg_arena_${arena.colors.join('')}`, () => drawArena(W, 60, arena.colors), -PAD, GROUND_Y - 120 + 8, 0.6);
    else this.addLayer(L[2].key, L[2].make, -PAD, GROUND_Y - 120 + 8, 0.6);
    this.addLayer(L[3].key, L[3].make, -PAD, GROUND_Y, 1);
    if (!this.textures.exists('stake')) this.textures.addCanvas('stake', drawStake());

    if (this.battle.siege && this.cfg.wall) {
      const key = `wall_${this.cfg.wall.culture}_${this.cfg.wall.color}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, drawWall(this.cfg.wall.culture, this.cfg.wall.color, this.cfg.wall.color2));
      this.add.image(WALL_X - 20, WALL_TOP - 48, key).setOrigin(0, 0).setScale(SCALE).setDepth(380);
      this.ladders = this.add.graphics().setDepth(390);
    }
    if (this.battle.opts.ford && !this.battle.siege) this.drawFord();
    this.drawFieldObjects();
    this.nightG = this.battle.opts.night && !this.cfg.arena ? this.add.graphics().setDepth(5450).setScrollFactor(0) : null;
    this.shadows = this.add.graphics().setDepth(1);
    this.fx = this.add.graphics().setDepth(5000);
    this.overlay = this.add.graphics().setDepth(6000);
    this.weatherG = null;
    this.drops = [];
    const weather = this.weather();
    if (weather) {
      this.weatherG = this.add.graphics().setDepth(5500).setScrollFactor(0);
      const n = weather === 'rain' ? 160 : weather === 'snow' ? 170 : 0;
      for (let i = 0; i < n; i++) this.drops.push({ x: Math.random(), y: Math.random(), v: 0.8 + Math.random() * 0.5, s: Math.random() });
      if (weather === 'fog') for (let i = 0; i < 18; i++) this.fogPuffs.push({ x: Math.random() * FIELD_W, y: FIELD_Y0 - 60 + Math.random() * 170, vx: 6 + Math.random() * 8, vy: 0, life: 1, max: 1, color: 0xe4e8ec, size: 110 + Math.random() * 120, gravity: 0 });
    }
    for (const side of [0, 1] as Side[]) this.bannerG[side] = this.add.graphics();

    for (const u of this.battle.units) this.ensureSprite(u);
    for (const side of [0, 1] as const) for (const u of this.battle.reserves[side]) this.ensureTexture(u);

    this.setupInput();
    const b = this.battle;
    this.hud = new BattleHud(b, {
      enemyName: this.cfg.enemyName,
      enemyColor: this.cfg.enemyColor,
      heroFaction: this.cfg.heroFaction,
      heroPortrait: this.cfg.heroPortrait,
      heroEmblem: this.cfg.heroEmblem,
      arena: !!this.cfg.arena,
      setSpeed: (s) => (this.speed = s),
      togglePause: () => (this.paused = !this.paused),
      isPaused: () => this.paused,
      getSpeed: () => this.speed,
      zoom: (k: number) => this.setZoom(this.zoomMul * k),
      autoFinish: () => {
        if (this.deploying) this.beginBattle(true);
        this.battle.runToEnd();
        this.endTimer = 0.1;
      },
      startBattle: () => this.beginBattle(false),
    });
    music.play('battle');
    const ps = this.battle.playerSide;
    const o = this.battle.opts;
    // Расстановка: в засаде, на стенах и на ристалище строиться некогда
    this.deploying = !this.cfg.arena && !this.battle.siege && !o.ambush && this.battle.units.some((u) => u.side === ps && !u.isHero);
    if (this.deploying) {
      this.deployG = this.add.graphics().setDepth(2);
      this.hud.setDeploy(true);
      const [z0, z1] = this.battle.deployZone(ps);
      cam.scrollX = (z0 + z1) / 2 + (ps === 0 ? 120 : -120) - cam.width / 2;
    } else {
      this.announce();
      const front = this.battle.units.filter((u) => u.side === 0).reduce((m, u) => Math.max(m, u.x), 0);
      cam.scrollX = front + 300 - cam.width / 2;
    }
    this.fitCamera();
  }

  private weather() {
    return this.cfg.arena ? undefined : this.battle.opts.weather ?? this.cfg.weather;
  }

  /** Условия поля — коротко в начале боя. */
  private announce() {
    const o = this.battle.opts;
    const f = this.battle.field;
    const tips: string[] = [];
    if (o.ambush) tips.push(tr('Засада!'));
    if (o.night && !this.cfg.arena) tips.push(tr('Ночь: стрелки бьют вслепую'));
    const w = this.weather();
    if (w === 'rain') tips.push(tr('Дождь: тетивы и порох намокли, конница вязнет'));
    else if (w === 'fog') tips.push(tr('Туман: стрелки видят недалеко'));
    else if (w === 'snow' && o.terrain !== 'snow') tips.push(tr('Метель: войска идут медленнее'));
    if (o.ford && !this.battle.siege) tips.push(tr('Брод: в реке все вязнут'));
    if (o.terrain === 'forest') tips.push(tr('Лес: конница вязнет, стрелы путаются в ветвях'));
    else if (o.terrain === 'snow') tips.push(tr('Снег: войска идут медленнее'));
    if (f.hills.length) tips.push(tr('Холм: сверху стрелки бьют дальше, а рубиться легче'));
    if (f.groves.length && o.terrain !== 'forest') tips.push(tr('Роща: конница вязнет, стрелы путаются в ветвях'));
    if (f.carts.length) tips.push(tr('Обоз: телеги прикрывают от стрел'));
    if (tips.length) this.time.delayedCall(500, () => this.hud.banner(tips.slice(0, 3).join(' · ')));
    if (o.ambush) sfx.play('horn');
  }

  /** Конец расстановки — в бой. */
  private beginBattle(silent: boolean) {
    if (!this.deploying) return;
    this.deploying = false;
    this.deployG?.destroy();
    this.deployG = null;
    for (const t of this.groupTexts.values()) t.destroy();
    this.groupTexts.clear();
    for (const t of this.fieldLabels) t.destroy();
    this.fieldLabels = [];
    this.hud.setDeploy(false);
    if (!silent) {
      sfx.play('drum');
      this.announce();
    }
  }

  /** Касание поля при расстановке: выбранная группа встаёт в это место. */
  private deployTap(px: number, py: number) {
    const cam = this.cameras.main;
    const wp = cam.getWorldPoint(px, py);
    const x = wp.x;
    const y = Phaser.Math.Clamp(wp.y + 20, FIELD_Y0, FIELD_Y1);
    const b = this.battle;
    const ps = b.playerSide;
    const sel = this.hud.selectedGroup();
    if (sel === 'all') {
      const groups = (['inf', 'ranged', 'cav', 'hero'] as Group[]).map((g) => [g, b.groupCenter(ps, g)] as const).filter(([, c]) => !!c);
      if (!groups.length) return;
      const n = groups.reduce((s, [, c]) => s + c!.n, 0);
      const cx = groups.reduce((s, [, c]) => s + c!.x * c!.n, 0) / n;
      const cy = groups.reduce((s, [, c]) => s + c!.y * c!.n, 0) / n;
      for (const [g, c] of groups) b.placeGroup(ps, g, c!.x + x - cx, c!.y + y - cy);
    } else b.placeGroup(ps, sel, x, y);
    sfx.play('whoosh');
  }

  /** Холмы, рощи, телеги. */
  private drawFieldObjects() {
    const f = this.battle.field;
    const t = this.cfg.terrain;
    for (const h of f.hills) {
      const w = Math.ceil((h.x1 - h.x0) / SCALE);
      const key = `hill_${t}_${w}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, drawHill(t, w, 110, Math.round(HILL_LIFT / SCALE) + 4));
      this.add.image(h.x0, FIELD_Y0 - 60, key).setOrigin(0, 0).setScale(SCALE).setDepth(0.4);
    }
    for (let v = 0; v < 4; v++) {
      if (!this.textures.exists(`ftree_${t}_${v}`)) this.textures.addCanvas(`ftree_${t}_${v}`, drawFieldTree(t, v));
      if (!this.textures.exists(`bush_${t}_${v}`)) this.textures.addCanvas(`bush_${t}_${v}`, drawBush(t, v));
    }
    for (const g of f.groves) {
      const r = mulberry32(g.seed);
      const shade = this.add.graphics().setDepth(0.6);
      shade.fillStyle(0x1a2a14, 0.22);
      shade.fillEllipse(g.x, g.y, g.rx * 2.1, g.ry * 2.3);
      const n = Math.round(g.rx / 18);
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 0.9;
        const x = g.x + Math.cos(a) * g.rx * d;
        const y = g.y + Math.sin(a) * g.ry * d;
        const key = r() < 0.72 ? `ftree_${t}_${Math.floor(r() * 4)}` : `bush_${t}_${Math.floor(r() * 4)}`;
        this.add.image(Math.round(x), Math.round(y), key).setOrigin(0.5, 1).setScale(SCALE).setDepth(y + 0.5).setAlpha(0.94);
      }
    }
    for (const c of f.carts) {
      const color = c.side === this.battle.playerSide ? FACTIONS[this.cfg.heroFaction].css : this.cfg.enemyColor;
      const key = `cart_${color}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, drawCart(color));
      this.add.image(c.x, c.y + 8, key).setOrigin(0.5, 1).setScale(SCALE).setFlipX(c.side === 1).setDepth(c.y + 0.4);
    }
  }

  /** Подъём по холму в точке x. */
  private lift(x: number): number {
    return this.battle.field.hills.length ? this.battle.hillAt(x) * HILL_LIFT : 0;
  }

  /** Брод: река поперёк поля, мелкая вода с камнями. */
  private drawFord() {
    const g = this.add.graphics().setDepth(0.5);
    const top = FIELD_Y0 - 30;
    const bot = 640;
    const w0 = FORD_HALF * 0.8;
    const w1 = FORD_HALF * 1.25;
    const skew = 40;
    const x = FORD_X;
    // Берега
    g.fillStyle(0x5a4a30, 1);
    g.fillPoints([{ x: x - w0 - 10 - skew, y: top }, { x: x + w0 + 10 - skew, y: top }, { x: x + w1 + 14, y: bot }, { x: x - w1 - 14, y: bot }], true);
    // Вода
    g.fillStyle(0x3b6a8f, 0.95);
    g.fillPoints([{ x: x - w0 - skew, y: top }, { x: x + w0 - skew, y: top }, { x: x + w1, y: bot }, { x: x - w1, y: bot }], true);
    // Блики и рябь
    for (let i = 0; i < 70; i++) {
      const t = Math.random();
      const y = top + t * (bot - top);
      const half = w0 + (w1 - w0) * t;
      const cx = x - skew * (1 - t) + (Math.random() - 0.5) * half * 1.7;
      g.fillStyle(Math.random() < 0.5 ? 0x7fb0d0 : 0x5d8fb3, 0.9);
      g.fillRect(Math.round(cx), Math.round(y), 6 + Math.random() * 10, 2);
    }
    // Камни брода
    for (let i = 0; i < 26; i++) {
      const t = Math.random();
      const y = top + t * (bot - top);
      const half = w0 + (w1 - w0) * t;
      const cx = x - skew * (1 - t) + (Math.random() - 0.5) * half * 1.6;
      g.fillStyle(0x8a8a80, 1);
      g.fillEllipse(cx, y, 8 + Math.random() * 6, 4);
      g.fillStyle(0xb0b0a8, 1);
      g.fillEllipse(cx - 1, y - 1, 4, 2);
    }
  }

  private addLayer(key: string, make: () => HTMLCanvasElement, x: number, y: number, sf: number) {
    if (!this.textures.exists(key)) this.textures.addCanvas(key, make());
    this.add.image(x, y, key).setOrigin(0, 0).setScale(SCALE).setScrollFactor(sf, 1).setDepth(-100 + sf);
  }

  /** Видимая полоса мира (от гор до переднего ряда) вписывается между верхней и нижней панелями. */
  private fitCamera() {
    const cam = this.cameras.main;
    const h = this.scale.height;
    const top = h < 500 ? 46 : 58;
    const bottom = h < 500 ? 104 : 116;
    const WY0 = 250;
    const WY1 = 578;
    const z = Math.max(0.2, ((h - top - bottom) / (WY1 - WY0)) * this.zoomMul);
    cam.setZoom(z);
    const screenC = (top + h - bottom) / 2;
    // При приближении смещаем центр к рядам воинов, чтобы не смотреть в небо
    const worldC = (WY0 + WY1) / 2 + Math.max(0, this.zoomMul - 1) * 110;
    cam.scrollY = worldC - h / 2 - (screenC - h / 2) / z;
  }

  private clampScrollX() {
    const cam = this.cameras.main;
    const halfView = cam.width / cam.zoom / 2;
    const minC = Math.min(halfView - 200, FIELD_W / 2);
    const maxC = Math.max(FIELD_W - halfView + 200, FIELD_W / 2);
    const c = Phaser.Math.Clamp(cam.scrollX + cam.width / 2, minC, maxC);
    cam.scrollX = c - cam.width / 2;
  }

  // ───────────────────────── спрайты ─────────────────────────

  private lookFor(u: BUnit): UnitLook {
    if (u.isHero && u.side === this.battle.playerSide && this.cfg.heroLook) return u.troop.line === 'cavalry' ? this.cfg.heroLook : { ...this.cfg.heroLook, mounted: false, heavy: false };
    return troopLook(u.troop);
  }

  private ensureTexture(u: BUnit): string {
    const look = this.lookFor(u);
    const key = lookKey(look);
    if (!this.textures.exists(key)) {
      const tex = this.textures.addCanvas(key, drawUnitSheet(look))!;
      for (let i = 0; i < 9; i++) tex.add(i, 0, i * FRAME_W, 0, FRAME_W, FRAME_H);
    }
    return key;
  }

  private ensureSprite(u: BUnit): Phaser.GameObjects.Sprite {
    let s = this.sprites.get(u.uid);
    if (!s) {
      const key = this.ensureTexture(u);
      s = this.add.sprite(u.x, u.y, key, 0).setOrigin(0.5, FEET_Y / FRAME_H); // кадры детальные, рисуются 1:1
      this.sprites.set(u.uid, s);
      if (u.isHero && u.side === this.battle.playerSide) {
        this.heroLabel = this.add
          .text(u.x, u.y - 110, '★', { fontFamily: 'Kurale, Georgia, serif', fontSize: '22px', color: '#e8c04a', stroke: '#1a1410', strokeThickness: 4 })
          .setOrigin(0.5, 1)
          .setDepth(5500);
      }
      if (u.compId && u.side === this.battle.playerSide) {
        this.compLabels.set(
          u.uid,
          this.add
            .text(u.x, u.y - 100, u.troop.name.split(' ')[0], { fontFamily: 'Kurale, Georgia, serif', fontSize: '13px', color: '#d8b8f0', stroke: '#1a1410', strokeThickness: 3 })
            .setOrigin(0.5, 1)
            .setDepth(5400),
        );
      }
    }
    return s;
  }

  private frameFor(u: BUnit): number {
    if (u.state === 'dead') return 8;
    if (u.state === 'walk') {
      const fps = u.troop.line === 'cavalry' ? 10 : 7;
      return 1 + (Math.floor(u.anim * fps) % 4);
    }
    if (u.state === 'attack') {
      if (u.troop.role === 'ranged' && u.ammo > 0) {
        if (u.anim < 0.12) return 6;
        if (u.anim < 0.25) return 7;
        return 5;
      }
      if (u.swing > 0) return 5;
      if (u.anim < 0.18) return 6;
      if (u.anim < 0.34) return 7;
      return 0;
    }
    return 0;
  }

  // ───────────────────────── ввод ─────────────────────────

  private setupInput() {
    this.input.addPointer(1);
    const two = () => {
      const a = this.input.pointer1;
      const b = this.input.pointer2;
      return a?.isDown && b?.isDown ? Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) : 0;
    };
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = { x: p.x };
      this.tapStart = { x: p.x, y: p.y, t: this.time.now };
      music.unlock();
      const d = two();
      if (d) this.pinch = { d, z: this.zoomMul };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.pinch) {
        const d = two();
        if (d) this.setZoom(this.pinch.z * (d / this.pinch.d));
        else this.pinch = null;
        return;
      }
      if (!this.dragging || !p.isDown) return;
      const cam = this.cameras.main;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      this.dragUntil = this.time.now + 4000;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.dragging = null;
      const st = this.tapStart;
      this.tapStart = null;
      if (this.deploying && st && !this.pinch && Math.hypot(p.x - st.x, p.y - st.y) < 12 && this.time.now - st.t < 600) this.deployTap(p.x, p.y);
      if (!two()) this.pinch = null;
    });
    // Колесо — масштаб, горизонтальная прокрутка или Shift+колесо — сдвиг поля
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, dx: number, dy: number) => {
      const ev = p.event as WheelEvent;
      if (Math.abs(dx) > Math.abs(dy) || ev?.shiftKey) {
        this.cameras.main.scrollX += (dx || dy) * 0.8;
        this.dragUntil = this.time.now + 4000;
      } else this.setZoom(this.zoomMul * (dy > 0 ? 0.9 : 1.1));
    });
    this.input.keyboard?.on('keydown-SPACE', () => (this.paused = !this.paused));
    // Клавиатура для героя: WASD/стрелки — ход, J — удар, K — блок, C — взять/отдать управление
    const kb = this.input.keyboard;
    if (kb) {
      const keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,J,K') as Record<string, Phaser.Input.Keyboard.Key>;
      this.keys = keys;
      kb.on('keydown-C', () => this.hud?.setControl(!this.battle.heroCtl.on));
      kb.on('keydown-J', () => {
        if (this.battle.heroCtl.on) this.battle.heroCtl.tap = true;
      });
    }
  }

  private keys: Record<string, Phaser.Input.Keyboard.Key> | null = null;
  private keyDriven = false;

  /** Клавиши двигают героя, пока управление у игрока (сенсорный стик не трогаем). */
  private readKeys() {
    const c = this.battle.heroCtl;
    const k = this.keys;
    if (!c.on || !k) return;
    const x = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const y = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    const any = x || y || k.J.isDown || k.K.isDown;
    if (any) {
      const l = Math.hypot(x, y) || 1;
      c.mx = x / l;
      c.my = y / l;
      c.attack = k.J.isDown;
      c.block = k.K.isDown;
      this.keyDriven = true;
    } else if (this.keyDriven) {
      c.mx = c.my = 0;
      c.attack = c.block = false;
      this.keyDriven = false;
    }
  }

  // ───────────────────────── кадр ─────────────────────────

  /** Кнопка «Назад» в бою: закрыть тактику, иначе пауза и обратно. */
  togglePause() {
    if (this.hud?.closeTactics()) return;
    if (!this.finished) this.paused = !this.paused;
  }

  update(_t: number, deltaMs: number) {
    const dtReal = Math.min(0.05, deltaMs / 1000);
    this.readKeys();
    const dt = this.paused || this.deploying ? 0 : dtReal * this.speed;
    if (dt > 0) {
      // Мелкие шаги для устойчивости симуляции
      const steps = Math.ceil(dt / 0.034);
      for (let i = 0; i < steps; i++) this.battle.step(dt / steps);
    }
    this.handleEvents();
    if (this.deploying) this.drawDeploy();
    this.render(dtReal, dt);
    this.followCamera(dtReal);
    this.hud.update();

    if (this.battle.winner !== null && !this.finished) {
      if (this.endTimer < 0) {
        this.endTimer = 2.8;
        if (this.cfg.arena) setTimeout(() => sfx.play('cheer'), 950);
      }
      this.endTimer -= dtReal;
      if (this.endTimer <= 0) {
        this.finished = true;
        this.cfg.onFinish(this.battle);
      }
    }
  }

  private followCamera(dt: number) {
    const cam = this.cameras.main;
    this.clampScrollX();
    if (this.time.now < this.dragUntil || this.deploying) return;
    // Управляемый герой — в центре кадра, чуть впереди по взгляду
    if (this.battle.heroCtl.on) {
      const hero = this.battle.units.find((u) => u.isHero && u.side === this.battle.playerSide && u.state !== 'dead' && u.state !== 'fled');
      if (hero) {
        const target = hero.x + hero.facing * 120 - cam.width / 2;
        cam.scrollX += (target - cam.scrollX) * Math.min(1, dt * 3);
        return;
      }
    }
    const alive = this.battle.units.filter((u) => u.state !== 'dead' && u.state !== 'fled');
    if (!alive.length) return;
    // Центр — между передними линиями сторон
    const s0 = alive.filter((u) => u.side === 0);
    const s1 = alive.filter((u) => u.side === 1);
    let fx: number;
    if (s0.length && s1.length) {
      const f0 = Math.max(...s0.map((u) => u.x));
      const f1 = Math.min(...s1.map((u) => u.x));
      fx = (f0 + f1) / 2;
    } else fx = alive.reduce((s, u) => s + u.x, 0) / alive.length;
    const targetScroll = fx - cam.width / 2;
    cam.scrollX += (targetScroll - cam.scrollX) * Math.min(1, dt * 1.8);
  }

  /** Дождь или снег в экранных координатах. */
  private drawWeather(dt: number) {
    if (this.nightG) {
      const cam = this.cameras.main;
      const z = cam.zoom;
      const W = cam.width;
      const H = cam.height;
      this.nightG.clear();
      this.nightG.fillStyle(0x08102e, 0.52);
      this.nightG.fillRect((0 - W / 2) / z + W / 2, (0 - H / 2) / z + H / 2, W / z, H / z);
    }
    const g = this.weatherG;
    if (!g) return;
    g.clear();
    const cam = this.cameras.main;
    const W = cam.width;
    const H = cam.height;
    // Слой не прокручивается, но масштаб камеры к нему применяется: пересчитываем экранные координаты
    const z = cam.zoom;
    const sx = (X: number) => (X - W / 2) / z + W / 2;
    const sy = (Y: number) => (Y - H / 2) / z + H / 2;
    const weather = this.weather();
    if (weather === 'fog') {
      g.fillStyle(0xd8dde4, 0.26);
      g.fillRect(sx(0), sy(0), W / z, H / z);
      return;
    }
    const rain = weather === 'rain';
    if (rain) {
      g.fillStyle(0x1a2438, 0.16);
      g.fillRect(sx(0), sy(0), W / z, H / z);
      g.lineStyle(1.5 / z, 0xb8cce8, 0.55);
    } else g.fillStyle(0xffffff, 0.9);
    for (const d of this.drops) {
      d.y += dt * (rain ? 1.6 : 0.12) * d.v;
      d.x += dt * (rain ? -0.25 : Math.sin((d.y + d.s) * 9) * 0.04);
      if (d.y > 1) {
        d.y -= 1;
        d.x = Math.random();
      }
      if (d.x < 0) d.x += 1;
      if (d.x > 1) d.x -= 1;
      const x = sx(d.x * W);
      const y = sy(d.y * H);
      if (rain) g.lineBetween(x, y, x - 4 / z, y + 14 / z);
      else {
        const r = (d.s > 0.6 ? 4 : 2.5) / z;
        g.fillRect(x, y, r, r);
      }
    }
  }

  private render(dtReal: number, dt: number) {
    this.drawWeather(dtReal);
    const b = this.battle;
    const g = this.shadows;
    g.clear();
    const bars = this.overlay;
    bars.clear();

    for (const u of b.units) {
      const s = this.ensureSprite(u);
      if (this.lookVers.get(u.uid) !== u.lookVer) {
        if (this.lookVers.has(u.uid)) s.setTexture(this.ensureTexture(u));
        this.lookVers.set(u.uid, u.lookVer);
      }
      if (u.state === 'fled') {
        s.setVisible(false);
        continue;
      }
      s.setVisible(true);
      const onTop = u.onWall || (b.siege && u.side === 0 && u.x > WALL_X - 8);
      const ry = onTop ? WALL_TOP + (u.y - FIELD_Y0) * 0.12 : u.y - this.lift(u.x);
      s.setPosition(Math.round(u.x), Math.round(ry));
      s.setFlipX(u.facing < 0);
      s.setFrame(this.frameFor(u));
      if (u.state === 'dead') {
        s.setDepth(u.y - 80);
        s.clearTint();
        s.setAlpha(Math.max(0.55, 1 - u.deadT / 60));
        continue;
      }
      s.setDepth(onTop ? 2000 + u.y : u.y);
      if (u.flash > 0) s.setTint(u.flash > 0.1 ? 0xff5a4a : 0xff9a8a);
      else s.clearTint();
      // тень
      const cav = u.troop.line === 'cavalry';
      // Пыль (или снежная крошка) из-под копыт
      if (cav && u.state === 'walk' && dt > 0 && Math.random() < dt * 7 && this.dust.length < 90) {
        const t = this.cfg.terrain;
        const col = t === 'snow' ? 0xf2f4f8 : t === 'desert' || t === 'steppe' || t === 'dry' ? 0xc8b07a : 0xa89a80;
        this.dust.push({ x: u.x - u.facing * 24 + (Math.random() - 0.5) * 16, y: u.y - 4, vx: -u.facing * (10 + Math.random() * 20), vy: -8 - Math.random() * 10, life: 0.9, max: 0.9, color: col, size: 6 + Math.random() * 8, gravity: 0 });
      }
      if (!onTop) {
        g.fillStyle(0x000000, 0.22);
        g.fillEllipse(u.x, ry + 1, cav ? 66 : 30, 8);
      }
      // Горит: язычки пламени
      if (u.burn > 0 && dt > 0 && Math.random() < dt * 14 && this.flames.length < 140) {
        this.flames.push({ x: u.x + (Math.random() - 0.5) * 18, y: ry - 10 - Math.random() * 40, vx: (Math.random() - 0.5) * 10, vy: -30 - Math.random() * 30, life: 0.5, max: 0.5, color: Math.random() < 0.5 ? 0xffa030 : 0xffe060, size: 3 + Math.random() * 3, gravity: 0 });
      }
      // Оглушён: звёздочки над головой
      if (u.stun > 0) {
        const hy = ry - (cav ? 104 : 80);
        for (let k = 0; k < 3; k++) {
          const a = this.time.now / 180 + (k * Math.PI * 2) / 3;
          bars.fillStyle(0xffe060, 1);
          bars.fillRect(u.x + Math.cos(a) * 10 - 1.5, hy + Math.sin(a) * 3 - 1.5, 3, 3);
        }
      }
      // полоска здоровья у раненых
      if (u.hp < u.maxHp) {
        const w = cav ? 30 : 22;
        const top = ry - (cav ? 108 : 86);
        bars.fillStyle(0x140f0c, 0.8);
        bars.fillRect(u.x - w / 2 - 1, top - 1, w + 2, 5);
        bars.fillStyle(u.side === b.playerSide ? 0x5aa04a : 0xc24040, 1);
        bars.fillRect(u.x - w / 2, top, Math.max(1, (w * u.hp) / u.maxHp), 3);
      }
      const cl = this.compLabels.get(u.uid);
      if (cl) cl.setPosition(u.x, ry - (cav ? 108 : 88));
      if (u.isHero && this.heroLabel && u.side === b.playerSide) {
        this.heroLabel.setPosition(u.x, ry - (cav ? 112 : 92));
        // Блок: золотая дуга щита перед героем
        if (u.blocking) {
          const a0 = u.facing > 0 ? -0.9 : Math.PI - 0.9;
          bars.lineStyle(4, 0x1a1410, 0.8);
          bars.beginPath();
          bars.arc(u.x, ry - (cav ? 56 : 40), cav ? 34 : 26, a0, a0 + 1.8);
          bars.strokePath();
          bars.lineStyle(2, 0xe8c04a, 1);
          bars.beginPath();
          bars.arc(u.x, ry - (cav ? 56 : 40), cav ? 34 : 26, a0, a0 + 1.8);
          bars.strokePath();
        }
      }
    }
    this.drawBanners();
    for (const [uid, cl] of this.compLabels) {
      const u = b.units.find((x) => x.uid === uid);
      cl.setVisible(!!u && u.state !== 'dead' && u.state !== 'fled');
    }
    if (this.heroLabel) {
      const hero = b.units.find((u) => u.isHero && u.side === b.playerSide);
      this.heroLabel.setVisible(!!hero && hero.state !== 'dead' && hero.state !== 'fled');
    }

    // Лестницы после прорыва ворот
    if (this.ladders) {
      const l = this.ladders;
      l.clear();
      if (b.breached) {
        for (const y of [440, 500, 560]) {
          l.lineStyle(4, 0x5a3a22, 1);
          l.lineBetween(WALL_X - 46, y, WALL_X - 4, WALL_TOP - 10);
          l.lineBetween(WALL_X - 34, y, WALL_X + 8, WALL_TOP - 10);
          l.lineStyle(3, 0x7a5332, 1);
          for (let k = 1; k < 8; k++) {
            const t = k / 8;
            l.lineBetween(WALL_X - 46 + 42 * t, y + (WALL_TOP - 10 - y) * t, WALL_X - 34 + 42 * t, y + (WALL_TOP - 10 - y) * t);
          }
        }
      }
    }

    // Колья
    while (this.stakeImgs.length < b.stakes.length) this.stakeImgs.push(this.add.image(0, 0, 'stake').setOrigin(0.5, 1).setScale(SCALE));
    this.stakeImgs.forEach((img, i) => {
      const st = b.stakes[i];
      img.setVisible(!!st);
      if (st) img.setPosition(st.x, st.y + 4 - this.lift(st.x)).setDepth(st.y + 2).setFlipX(st.side === 1);
    });

    // Стрелы и болты
    const f = this.fx;
    f.clear();
    for (const p of b.projectiles) {
      if (p.done) continue;
      const k = Math.min(1, p.t / p.dur);
      const py = p.y - this.lift(p.x);
      const dx = p.x1 - p.x0;
      const dyv = p.y1 - p.y0 - Math.cos(k * Math.PI) * Math.PI * p.arc;
      const len = Math.hypot(dx, dyv) || 1;
      if (p.kind === 'ball') {
        f.lineStyle(2, 0xd8d0c0, 0.5);
        f.lineBetween(p.x - (dx / len) * 14, py - (dyv / len) * 14, p.x, py);
        f.fillStyle(0x1a1410, 1);
        f.fillCircle(p.x, py, 2.2);
        continue;
      }
      if (p.kind === 'pot') {
        f.fillStyle(0x7a4a2a, 1);
        f.fillCircle(p.x, py, 4.5);
        f.fillStyle(0xa0603a, 1);
        f.fillCircle(p.x - 1, py - 1, 2.5);
        if (dt > 0 && Math.random() < 0.8) this.flames.push({ x: p.x, y: py - 4, vx: 0, vy: -10, life: 0.3, max: 0.3, color: Math.random() < 0.5 ? 0xff8a20 : 0xffd040, size: 4, gravity: 0 });
        continue;
      }
      if (p.kind === 'lasso') {
        const fx = p.from.x + p.from.facing * 6;
        const fy = p.from.y - 58 - this.lift(p.from.x);
        f.lineStyle(1.5, 0x8a6a45, 1);
        f.beginPath();
        f.moveTo(fx, fy);
        const mx = (fx + p.x) / 2;
        f.lineTo(mx, Math.min(fy, py) - 14);
        f.lineTo(p.x, py);
        f.strokePath();
        f.strokeCircle(p.x + 4, py, 6);
        continue;
      }
      const L = p.kind === 'bolt' ? 12 : p.kind === 'javelin' ? 28 : 18;
      const tx = p.x - (dx / len) * L;
      const ty = py - (dyv / len) * L;
      f.lineStyle(p.kind === 'bolt' || p.kind === 'javelin' ? 3 : 2, 0x2a1f18, 0.9);
      f.lineBetween(tx, ty, p.x, py);
      f.lineStyle(1, p.kind === 'javelin' ? 0x9a7042 : 0xe8dcc0, 1);
      f.lineBetween(tx + (dx / len) * 2, ty + (dyv / len) * 2, p.x, py);
      if (p.kind === 'javelin') {
        f.fillStyle(0xc4ccd4, 1);
        f.fillTriangle(p.x + (dx / len) * 4, py + (dyv / len) * 4, p.x - (dyv / len) * 2, py + (dx / len) * 2, p.x + (dyv / len) * 2, py - (dx / len) * 2);
      }
    }

    // Частицы
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) continue;
      f.fillStyle(p.color, Math.min(1, p.life / p.max + 0.2));
      f.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    // Дым
    if (b.smoke) {
      if (this.smokePuffs.length < 26 && Math.random() < 0.5) {
        this.smokePuffs.push({ x: b.smoke.x + (Math.random() - 0.5) * 360, y: MID_Y - Math.random() * 90, vx: (Math.random() - 0.5) * 10, vy: -6, life: 5, max: 5, color: 0xd8d8d0, size: 30 + Math.random() * 40, gravity: 0 });
      }
    }
    for (const p of this.smokePuffs) {
      p.life -= dtReal;
      p.x += p.vx * dtReal;
      p.y += p.vy * dtReal;
      f.fillStyle(p.color, Math.max(0, Math.min(0.45, p.life / p.max)));
      f.fillCircle(p.x, p.y, p.size * (1.2 - p.life / p.max / 2));
    }
    this.smokePuffs = this.smokePuffs.filter((p) => p.life > 0);
    for (const p of this.dust) {
      p.life -= dtReal;
      p.x += p.vx * dtReal;
      p.y += p.vy * dtReal;
      f.fillStyle(p.color, Math.max(0, Math.min(0.35, p.life / p.max * 0.4)));
      f.fillCircle(p.x, p.y, p.size * (1.3 - p.life / p.max / 2));
    }
    this.dust = this.dust.filter((p) => p.life > 0);
    for (const p of this.flames) {
      p.life -= dtReal;
      p.x += p.vx * dtReal;
      p.y += p.vy * dtReal;
      f.fillStyle(p.color, Math.max(0, Math.min(1, p.life / p.max)));
      f.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    this.flames = this.flames.filter((p) => p.life > 0);
    for (const p of this.fogPuffs) {
      p.x += p.vx * dtReal;
      if (p.x > FIELD_W + 300) p.x = -300;
      f.fillStyle(p.color, 0.13);
      f.fillEllipse(p.x, p.y, p.size * 2.4, p.size * 0.7);
    }

    // Всплывающие надписи
    for (const fl of this.floats) {
      fl.life -= dtReal;
      fl.t.y -= 30 * dtReal;
      fl.t.setAlpha(Math.min(1, fl.life * 2));
      if (fl.life <= 0) fl.t.destroy();
    }
    this.floats = this.floats.filter((fl) => fl.life > 0);
  }

  /** Зона расстановки и подписи групп. */
  private drawDeploy() {
    const g = this.deployG;
    if (!g) return;
    const b = this.battle;
    // Подписи холмов и рощ: где выгодно встать
    if (!this.fieldLabels.length) {
      const style = { fontFamily: 'Kurale, Georgia, serif', fontSize: '16px', color: '#fff2c8', stroke: '#140f0c', strokeThickness: 4 };
      for (const h of b.field.hills) this.fieldLabels.push(this.add.text((h.x0 + h.x1) / 2, FIELD_Y0 - HILL_LIFT - 78, tr('▲ Холм'), style).setOrigin(0.5, 1).setDepth(6400));
      for (const gr of b.field.groves) this.fieldLabels.push(this.add.text(gr.x, gr.y - gr.ry - 70, tr('Роща'), style).setOrigin(0.5, 1).setDepth(6400));
    }
    const ps = b.playerSide;
    const [z0, z1] = b.deployZone(ps);
    g.clear();
    g.fillStyle(0xe8c04a, 0.07);
    g.fillRect(z0, FIELD_Y0 - 10, z1 - z0, FIELD_Y1 - FIELD_Y0 + 22);
    g.lineStyle(2, 0xe8c04a, 0.75);
    for (let x = z0; x < z1; x += 28) {
      g.lineBetween(x, FIELD_Y0 - 10, Math.min(z1, x + 16), FIELD_Y0 - 10);
      g.lineBetween(x, FIELD_Y1 + 12, Math.min(z1, x + 16), FIELD_Y1 + 12);
    }
    for (const x of [z0, z1]) for (let y = FIELD_Y0 - 10; y < FIELD_Y1 + 12; y += 20) g.lineBetween(x, y, x, Math.min(FIELD_Y1 + 12, y + 12));
    const sel = this.hud.selectedGroup();
    for (const grp of ['inf', 'ranged', 'cav', 'hero'] as Group[]) {
      const c = b.groupCenter(ps, grp);
      let t = this.groupTexts.get(grp);
      if (!c) {
        t?.setVisible(false);
        continue;
      }
      if (!t) {
        t = this.add.text(0, 0, '', { fontFamily: 'Kurale, Georgia, serif', fontSize: '18px', color: '#f4ecd8', stroke: '#140f0c', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(6500);
        this.groupTexts.set(grp, t);
      }
      const on = sel === 'all' || sel === grp;
      t.setText(`${GROUP_LABEL[grp]} · ${c.n}`).setColor(on ? '#ffd24a' : '#f4ecd8').setVisible(true);
      t.setPosition(c.x, c.y - 110 - this.lift(c.x));
      if (on) {
        g.lineStyle(2, 0xffd24a, 0.9);
        g.strokeEllipse(c.x, c.y - this.lift(c.x), 60 + Math.sqrt(c.n) * 26, 34 + Math.sqrt(c.n) * 6);
      }
    }
  }

  /** Знамёна сторон над знаменосцами. */
  private drawBanners() {
    const b = this.battle;
    for (const side of [0, 1] as Side[]) {
      const g = this.bannerG[side];
      if (!g) continue;
      g.clear();
      const u = b.bearer[side];
      if (!u || u.state === 'dead' || u.state === 'fled') continue;
      const mine = side === b.playerSide;
      const f = FACTIONS[this.cfg.heroFaction];
      const c1 = mine ? f.color : cssNum(this.cfg.enemyColor);
      const c2 = mine ? f.color2 : 0xe8dcc0;
      const ry = u.y - this.lift(u.x);
      const px = u.x - u.facing * 9;
      const top = ry - 124;
      g.setDepth(u.y + 0.6);
      g.lineStyle(3, 0x3a2618, 1);
      g.lineBetween(px, ry - 18, px, top);
      g.fillStyle(0xc8a050, 1);
      g.fillCircle(px, top - 1, 2.5);
      // Полотнище колышется
      const dir = -u.facing;
      const t = this.time.now / 260;
      const pts: Phaser.Types.Math.Vector2Like[] = [];
      const W = 34;
      const H = 22;
      for (let i = 0; i <= 6; i++) pts.push({ x: px + dir * (W * i) / 6, y: top + 2 + Math.sin(t + i * 0.8) * 2.2 * (i / 6) });
      for (let i = 6; i >= 0; i--) pts.push({ x: px + dir * (W * i) / 6, y: top + 2 + H + Math.sin(t + i * 0.8) * 2.2 * (i / 6) - (i === 6 ? 4 : 0) });
      g.fillStyle(0x140f0c, 1);
      g.fillPoints(pts.map((p) => ({ x: p.x + 1, y: p.y + 1 })), true);
      g.fillStyle(c1, 1);
      g.fillPoints(pts, true);
      g.fillStyle(c2, 1);
      g.fillRect(Math.min(px, px + dir * W) + (dir > 0 ? 0 : W - 6) + dir * 2, top + 4 + Math.sin(t) * 1.5, 6, H - 4);
    }
  }

  /** Всплывающая надпись не чаще раза в gap мс для одного вида. */
  private floatOnce(kind: string, gap: number, x: number, y: number, text: string, color: string) {
    const now = this.time.now;
    if (now - (this.lastFloat[kind] ?? 0) < gap) return;
    this.lastFloat[kind] = now;
    this.floatText(x, y, text, color);
  }

  /** Облако порохового дыма. */
  private gunSmoke(x: number, y: number) {
    for (let i = 0; i < 5; i++) {
      this.smokePuffs.push({ x: x + (Math.random() - 0.3) * 20, y: y - Math.random() * 10, vx: 6 + Math.random() * 10, vy: -6 - Math.random() * 6, life: 2.6, max: 2.6, color: 0xe8e8e0, size: 8 + Math.random() * 10, gravity: 0 });
    }
    for (let i = 0; i < 6; i++) this.particles.push({ x, y, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 40, life: 0.12, max: 0.12, color: Math.random() < 0.5 ? 0xfff0a0 : 0xffa030, size: 4, gravity: 0 });
  }

  // ───────────────────────── события боя ─────────────────────────

  private floatText(x: number, y: number, text: string, color: string) {
    if (this.floats.length > 18) return;
    const t = this.add
      .text(x, y, text, { fontFamily: 'Kurale, Georgia, serif', fontSize: '20px', color, stroke: '#140f0c', strokeThickness: 4 })
      .setOrigin(0.5, 1)
      .setDepth(7000);
    this.floats.push({ t, life: 0.9 });
  }

  private burst(x: number, y: number, color: number, n: number, speed = 80) {
    for (let i = 0; i < n; i++) {
      this.particles.push({ x, y, vx: (Math.random() - 0.5) * speed * 2, vy: -Math.random() * speed, life: 0.5 + Math.random() * 0.3, max: 0.8, color, size: 3, gravity: 300 });
    }
  }

  private handleEvents() {
    const ev: BattleEvent[] = this.battle.events.splice(0);
    for (const e of ev) {
      switch (e.kind) {
        case 'hit':
          this.burst(e.x, e.y - 40, 0xa02020, 4);
          sfx.play('hit');
          break;
        case 'crit':
          this.burst(e.x, e.y - 40, 0xc02020, 9, 120);
          this.floatText(e.x, e.y - 90, tr('Крит!'), '#ffd24a');
          sfx.play('crit');
          break;
        case 'block':
          this.burst(e.x + 10, e.y - 45, 0xfff0b0, 5, 110);
          this.burst(e.x + 8, e.y - 40, 0x8a6a45, 3, 90); // щепки от щита
          if (Math.random() < 0.5) this.floatText(e.x, e.y - 90, tr('Блок'), '#9ad0ff');
          sfx.play('block');
          break;
        case 'dodge':
          if (Math.random() < 0.6) this.floatText(e.x, e.y - 90, tr('Уклон'), '#e8e8e8');
          sfx.play('whoosh');
          break;
        case 'death':
          this.burst(e.x, e.y - 20, 0x7a1a1a, 6, 60);
          sfx.play('death');
          if (this.cfg.arena) sfx.play('cheer');
          break;
        case 'shoot':
          sfx.play('bow');
          break;
        case 'charge':
          this.floatText(e.x, e.y - 100, tr('Таран!'), '#ffb060');
          sfx.play('charge');
          break;
        case 'heroDown':
          this.floatText(e.x, e.y - 110, e.side === this.battle.playerSide ? tr('Герой ранен!') : tr('Вожак пал!'), '#ff8a6a');
          break;
        case 'rout':
          this.hud.banner(e.side === this.battle.playerSide ? tr('Ваши воины бегут!') : tr('Враг бежит!'));
          sfx.play('horn');
          break;
        case 'cry':
          this.hud.banner(tr('Боевой клич!'));
          sfx.play('horn');
          break;
        case 'volley':
          this.hud.banner(tr('Залп!'));
          break;
        case 'stakes':
          sfx.play('stakes');
          break;
        case 'smoke':
          break;
        case 'breach':
          this.hud.banner(tr('Ворота пали! На стены!'));
          sfx.play('horn');
          break;
        case 'gun':
          this.gunSmoke(e.x, e.y - this.lift(e.x));
          sfx.play('gun');
          if (Math.random() < 0.35) this.cameras.main.shake(70, 0.0015);
          break;
        case 'misfire':
          this.smokePuffs.push({ x: e.x, y: e.y, vx: 4, vy: -4, life: 1, max: 1, color: 0xc8c8c0, size: 6, gravity: 0 });
          this.floatOnce('misfire', 1500, e.x, e.y - 60, tr('Осечка'), '#c8c8c0');
          sfx.play('misfire');
          break;
        case 'fire': {
          const y = e.y - this.lift(e.x);
          this.burst(e.x, y - 10, 0xff8a20, 14, 140);
          this.burst(e.x, y - 10, 0xffe060, 8, 90);
          for (let i = 0; i < 16; i++) this.flames.push({ x: e.x + (Math.random() - 0.5) * 70, y: y - Math.random() * 14, vx: (Math.random() - 0.5) * 8, vy: -20 - Math.random() * 30, life: 0.6 + Math.random() * 0.8, max: 1.4, color: Math.random() < 0.5 ? 0xff7a1a : 0xffd040, size: 4 + Math.random() * 4, gravity: 0 });
          this.smokePuffs.push({ x: e.x, y: y - 30, vx: 3, vy: -10, life: 2.4, max: 2.4, color: 0x4a4038, size: 16, gravity: 0 });
          sfx.play('fire');
          break;
        }
        case 'lasso':
          this.floatText(e.x, e.y - 100, tr('Аркан!'), '#ffcf7a');
          sfx.play('whoosh');
          break;
        case 'brace':
          this.floatOnce('brace', 700, e.x, e.y - 100, tr('Упор!'), '#9ad0ff');
          sfx.play('block');
          break;
        case 'rear':
          this.floatOnce('rear', 1100, e.x, e.y - 96, tr('С тыла!'), '#ffb060');
          break;
        case 'panic':
          this.hud.banner(e.side === this.battle.playerSide ? tr('Наши кони боятся верблюдов!') : tr('Вражеские кони боятся верблюдов!'));
          break;
        case 'bannerDown':
          this.hud.banner(e.side === this.battle.playerSide ? tr('Наше знамя пало!') : tr('Вражеское знамя пало!'));
          sfx.play('horn');
          break;
        case 'banner':
          this.floatText(e.x, e.y - 130, tr('Знамя снова поднято!'), '#ffd24a');
          break;
        case 'javelin':
          sfx.play('whoosh');
          break;
        case 'feint':
          this.floatOnce('feint', 2500, e.x, e.y - 96, tr('Ряды расстроены!'), '#ff9a7a');
          break;
      }
    }
  }
}

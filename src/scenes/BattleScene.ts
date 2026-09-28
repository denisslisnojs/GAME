import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { music } from '../audio/music';
import { drawArena, drawFar, drawGround, drawMid, drawSky, drawStake, drawWall, type BattleTerrain } from '../battle/background';
import { lookKey, troopLook } from '../battle/looks';
import { FIELD_W, FIELD_Y0, MID_Y, WALL_X, type Battle, type BattleEvent, type BUnit } from '../battle/sim';
import type { FactionId } from '../data/factions';
import { drawUnitSheet, FRAME_H, FRAME_W, type UnitLook } from '../gfx/units';
import { BattleHud } from '../ui/battleHud';

export interface BattleSceneData {
  battle: Battle;
  terrain: BattleTerrain;
  heroFaction: FactionId;
  /** Облик героя из его снаряжения. */
  heroLook?: UnitLook;
  heroPortrait?: string;
  enemyName: string;
  enemyColor: string;
  /** Осада: облик стены (культура крепости и цвета владельца). */
  wall?: { culture: string; color: string; color2: string };
  /** Турнир: трибуны вместо холмов, без способностей. */
  arena?: { colors: string[] };
  /** Погода: дождь или снег поверх поля. */
  weather?: 'rain' | 'snow';
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
  private floats: { t: Phaser.GameObjects.Text; life: number }[] = [];
  private particles: Particle[] = [];
  private smokePuffs: Particle[] = [];
  private hud!: BattleHud;
  private speed = 1;
  private paused = false;
  private dragUntil = 0;
  private endTimer = -1;
  private finished = false;
  private dragging: { x: number } | null = null;
  private ladders: Phaser.GameObjects.Graphics | null = null;

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
    this.stakeImgs = [];
    this.heroLabel = null;
    this.speed = 1;
    this.paused = false;
    this.endTimer = -1;
    this.finished = false;
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

    // Фон
    const t = this.cfg.terrain;
    // Слои шире поля: при отдалении камеры края не должны оголяться
    const PAD = 900;
    const W = (FIELD_W + PAD * 2) / SCALE;
    this.addLayer(`bg_sky_${t}`, () => drawSky(t, W, 260), -PAD, -120, 0.1);
    this.addLayer(`bg_far_${t}`, () => drawFar(t, W, 90), -PAD, GROUND_Y - 180 + 10, 0.3);
    const arena = this.cfg.arena;
    if (arena) this.addLayer(`bg_arena_${arena.colors.join('')}`, () => drawArena(W, 60, arena.colors), -PAD, GROUND_Y - 120 + 8, 0.6);
    else this.addLayer(`bg_mid_${t}`, () => drawMid(t, W, 60), -PAD, GROUND_Y - 120 + 8, 0.6);
    this.addLayer(`bg_ground_${t}`, () => drawGround(t, W, (WORLD_H - GROUND_Y + 200) / SCALE), -PAD, GROUND_Y, 1);
    if (!this.textures.exists('stake')) this.textures.addCanvas('stake', drawStake());

    if (this.battle.siege && this.cfg.wall) {
      const key = `wall_${this.cfg.wall.culture}_${this.cfg.wall.color}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, drawWall(this.cfg.wall.culture, this.cfg.wall.color, this.cfg.wall.color2));
      this.add.image(WALL_X - 20, WALL_TOP - 48, key).setOrigin(0, 0).setScale(SCALE).setDepth(380);
      this.ladders = this.add.graphics().setDepth(390);
    }
    this.shadows = this.add.graphics().setDepth(1);
    this.fx = this.add.graphics().setDepth(5000);
    this.overlay = this.add.graphics().setDepth(6000);
    this.weatherG = null;
    this.drops = [];
    if (this.cfg.weather) {
      this.weatherG = this.add.graphics().setDepth(5500).setScrollFactor(0);
      const n = this.cfg.weather === 'rain' ? 160 : 170;
      for (let i = 0; i < n; i++) this.drops.push({ x: Math.random(), y: Math.random(), v: 0.8 + Math.random() * 0.5, s: Math.random() });
    }

    for (const u of this.battle.units) this.ensureSprite(u);
    for (const side of [0, 1] as const) for (const u of this.battle.reserves[side]) this.ensureTexture(u);

    this.setupInput();
    const b = this.battle;
    this.hud = new BattleHud(b, {
      enemyName: this.cfg.enemyName,
      enemyColor: this.cfg.enemyColor,
      heroFaction: this.cfg.heroFaction,
      heroPortrait: this.cfg.heroPortrait,
      arena: !!this.cfg.arena,
      setSpeed: (s) => (this.speed = s),
      togglePause: () => (this.paused = !this.paused),
      isPaused: () => this.paused,
      getSpeed: () => this.speed,
      autoFinish: () => {
        this.battle.runToEnd();
        this.endTimer = 0.1;
      },
    });
    music.play('battle');
    const front = this.battle.units.filter((u) => u.side === 0).reduce((m, u) => Math.max(m, u.x), 0);
    cam.scrollX = front + 300 - cam.width / 2;
    this.fitCamera();
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
    const z = Math.max(0.35, (h - top - bottom) / (WY1 - WY0));
    cam.setZoom(z);
    const screenC = (top + h - bottom) / 2;
    const worldC = (WY0 + WY1) / 2;
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
    return u.isHero && u.side === this.battle.playerSide && this.cfg.heroLook ? this.cfg.heroLook : troopLook(u.troop);
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
      s = this.add.sprite(u.x, u.y, key, 0).setOrigin(0.5, (FRAME_H - 2) / FRAME_H).setScale(SCALE);
      this.sprites.set(u.uid, s);
      if (u.isHero && u.side === this.battle.playerSide) {
        this.heroLabel = this.add
          .text(u.x, u.y - 110, '★', { fontFamily: 'Kurale, Georgia, serif', fontSize: '22px', color: '#e8c04a', stroke: '#1a1410', strokeThickness: 4 })
          .setOrigin(0.5, 1)
          .setDepth(5500);
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
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = { x: p.x };
      music.unlock();
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging || !p.isDown) return;
      const cam = this.cameras.main;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      this.dragUntil = this.time.now + 4000;
    });
    this.input.on('pointerup', () => (this.dragging = null));
    this.input.on('wheel', (_p: unknown, _o: unknown, dx: number, dy: number) => {
      this.cameras.main.scrollX += (dx || dy) * 0.8;
      this.dragUntil = this.time.now + 4000;
    });
    this.input.keyboard?.on('keydown-SPACE', () => (this.paused = !this.paused));
  }

  // ───────────────────────── кадр ─────────────────────────

  update(_t: number, deltaMs: number) {
    const dtReal = Math.min(0.05, deltaMs / 1000);
    const dt = this.paused ? 0 : dtReal * this.speed;
    if (dt > 0) {
      // Мелкие шаги для устойчивости симуляции
      const steps = Math.ceil(dt / 0.034);
      for (let i = 0; i < steps; i++) this.battle.step(dt / steps);
    }
    this.handleEvents();
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
    if (this.time.now < this.dragUntil) return;
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
    const rain = this.cfg.weather === 'rain';
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
      if (u.state === 'fled') {
        s.setVisible(false);
        continue;
      }
      s.setVisible(true);
      const onTop = u.onWall || (b.siege && u.side === 0 && u.x > WALL_X - 8);
      const ry = onTop ? WALL_TOP + (u.y - FIELD_Y0) * 0.12 : u.y;
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
      if (!onTop) {
        g.fillStyle(0x000000, 0.22);
        g.fillEllipse(u.x, u.y + 1, cav ? 66 : 30, 8);
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
      if (u.isHero && this.heroLabel && u.side === b.playerSide) {
        this.heroLabel.setPosition(u.x, u.y - (cav ? 112 : 92));
      }
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
      if (st) img.setPosition(st.x, st.y + 4).setDepth(st.y + 2).setFlipX(st.side === 1);
    });

    // Стрелы и болты
    const f = this.fx;
    f.clear();
    for (const p of b.projectiles) {
      if (p.done) continue;
      const k = Math.min(1, p.t / p.dur);
      const dx = p.x1 - p.x0;
      const dyv = p.y1 - p.y0 - Math.cos(k * Math.PI) * Math.PI * p.arc;
      const len = Math.hypot(dx, dyv) || 1;
      const L = p.kind === 'bolt' ? 12 : 18;
      const tx = p.x - (dx / len) * L;
      const ty = p.y - (dyv / len) * L;
      f.lineStyle(p.kind === 'bolt' ? 3 : 2, 0x2a1f18, 0.9);
      f.lineBetween(tx, ty, p.x, p.y);
      f.lineStyle(1, 0xe8dcc0, 1);
      f.lineBetween(tx + (dx / len) * 2, ty + (dyv / len) * 2, p.x, p.y);
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

    // Всплывающие надписи
    for (const fl of this.floats) {
      fl.life -= dtReal;
      fl.t.y -= 30 * dtReal;
      fl.t.setAlpha(Math.min(1, fl.life * 2));
      if (fl.life <= 0) fl.t.destroy();
    }
    this.floats = this.floats.filter((fl) => fl.life > 0);
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
          this.floatText(e.x, e.y - 90, 'Крит!', '#ffd24a');
          sfx.play('crit');
          break;
        case 'block':
          this.burst(e.x + 10, e.y - 45, 0xfff0b0, 5, 110);
          if (Math.random() < 0.5) this.floatText(e.x, e.y - 90, 'Блок', '#9ad0ff');
          sfx.play('block');
          break;
        case 'dodge':
          if (Math.random() < 0.6) this.floatText(e.x, e.y - 90, 'Уклон', '#e8e8e8');
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
          this.floatText(e.x, e.y - 100, 'Таран!', '#ffb060');
          sfx.play('charge');
          break;
        case 'heroDown':
          this.floatText(e.x, e.y - 110, e.side === this.battle.playerSide ? 'Герой ранен!' : 'Вожак пал!', '#ff8a6a');
          break;
        case 'rout':
          this.hud.banner(e.side === this.battle.playerSide ? 'Ваши воины бегут!' : 'Враг бежит!');
          sfx.play('horn');
          break;
        case 'cry':
          this.hud.banner('Боевой клич!');
          sfx.play('horn');
          break;
        case 'volley':
          this.hud.banner('Залп!');
          break;
        case 'stakes':
          sfx.play('stakes');
          break;
        case 'smoke':
          break;
        case 'breach':
          this.hud.banner('Ворота пали! На стены!');
          sfx.play('horn');
          break;
      }
    }
  }
}

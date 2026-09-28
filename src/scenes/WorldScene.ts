import Phaser from 'phaser';
import { music } from '../audio/music';
import { ART_SCALE, GRID_H, GRID_W, PARTY_SPEED, SECONDS_PER_DAY, TILE, WORLD_H, WORLD_W } from '../config';
import { FACTIONS, type FactionId } from '../data/factions';
import { settlementTextureKey } from '../gfx/sprites';
import { canEnter, dailyTick, ownerOf, relationTo } from '../game/logic';
import { hasSave, loadGame, newGame, saveGame, type GameState } from '../game/state';
import { isWaterCell, world, type Settlement } from '../game/world';
import { cellCenterWorld, geoToWorld, worldToCell } from '../map/geo';
import { findPath, smoothPath } from '../map/pathfinding';
import { computeTerritory, drawTerritory } from '../map/territory';
import { TERRAIN_COST, TERRAIN_NAME } from '../map/terrain';
import { btn, h, openModal, panel, toast, uiRoot } from '../ui/dom';
import { Hud } from '../ui/hud';
import { openParty, openRealms, openSettlement, type GameCtx } from '../ui/panels';
import { showCreation, showMainMenu, showSettings } from '../ui/screens';

type Pt = { x: number; y: number };

const MIN_ZOOM_ABS = 0.12;
const MAX_ZOOM = 2.5;
const TYPE_NAME = { town: 'Город', castle: 'Замок', village: 'Деревня' } as const;

export class WorldScene extends Phaser.Scene implements GameCtx {
  state!: GameState;
  private mode: 'menu' | 'play' = 'menu';
  private paused = false;
  private speed = 1;
  private modals = 0;
  private hud: Hud | null = null;
  private closeMenuUi: (() => void) | null = null;

  private party!: Phaser.GameObjects.Sprite;
  private partyFrame = 0;
  private partyAnimT = 0;
  private path: Pt[] = [];
  private targetSettlement: Settlement | null = null;
  private pathGfx!: Phaser.GameObjects.Graphics;
  private marker!: Phaser.GameObjects.Graphics;

  private settleSprites = new Map<string, Phaser.GameObjects.Image>();
  private labels: { t: Phaser.GameObjects.Text; s: Settlement }[] = [];
  private territoryCanvas!: HTMLCanvasElement;
  private tooltip: HTMLElement | null = null;

  // ввод
  private downAt: { x: number; y: number; t: number } | null = null;
  private dragging = false;
  private pinch: { dist: number; zoom: number } | null = null;
  private hudTimer = 0;
  private menuTween: Phaser.Tweens.Tween | null = null;

  constructor() {
    super('world');
  }

  create() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setBackgroundColor('#1a3150');
    cam.roundPixels = false;

    this.add.image(0, 0, 'map').setOrigin(0).setScale(ART_SCALE).setDepth(-10);

    this.territoryCanvas = drawTerritory(computeTerritory((s) => s.culture));
    this.textures.addCanvas('territory', this.territoryCanvas);
    this.add.image(0, 0, 'territory').setOrigin(0).setScale(ART_SCALE).setDepth(-9);

    this.pathGfx = this.add.graphics().setDepth(-5);
    this.marker = this.add.graphics().setDepth(9000);

    for (const s of world.settlements) {
      const img = this.add
        .image(s.x, s.y + TILE * 0.4, settlementTextureKey(s.type, s.culture, s.culture))
        .setOrigin(0.5, 1)
        .setScale(ART_SCALE * (s.type === 'village' ? 0.8 : 1))
        .setDepth(s.y);
      this.settleSprites.set(s.id, img);
      const t = this.add
        .text(s.x, s.y + TILE * 0.5, s.name, {
          fontFamily: '"Kurale", Georgia, serif',
          fontSize: s.type === 'town' ? '17px' : s.type === 'castle' ? '15px' : '13px',
          color: s.type === 'town' ? '#fff4d6' : s.type === 'castle' ? '#e8dcc0' : '#d8d0bc',
          stroke: '#1a1410',
          strokeThickness: 4,
        })
        .setOrigin(0.5, 0)
        .setResolution(Math.min(3, window.devicePixelRatio || 1))
        .setDepth(10000);
      this.labels.push({ t, s });
    }

    this.party = this.add.sprite(0, 0, 'rider_aurelia_player_0').setOrigin(0.5, 0.9).setScale(ART_SCALE).setVisible(false);

    this.setupInput();
    this.scale.on('resize', () => this.clampZoom());
    this.enterMenu();
  }

  // ───────────────────────── меню ─────────────────────────

  private enterMenu() {
    this.mode = 'menu';
    this.hud?.destroy();
    this.hud = null;
    this.party.setVisible(false);
    this.pathGfx.clear();
    this.marker.clear();
    this.path = [];
    this.recolorSettlements((s) => s.culture);
    const cam = this.cameras.main;
    cam.setZoom(Math.max(this.minZoom(), 0.55));
    const route = [geoToWorld(2, 49), geoToWorld(14, 46), geoToWorld(30, 40), geoToWorld(40, 45), geoToWorld(20, 55), geoToWorld(2, 49)];
    const c = { i: 0 };
    cam.centerOn(route[0].x, route[0].y);
    this.menuTween?.stop();
    this.menuTween = this.tweens.add({
      targets: c,
      i: route.length - 1,
      duration: 160000,
      repeat: -1,
      onUpdate: () => {
        const k = Math.floor(c.i);
        const f = c.i - k;
        const a = route[k];
        const b = route[Math.min(route.length - 1, k + 1)];
        cam.centerOn(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
      },
    });
    this.updateLabels();
    music.play('calm');
    this.showMenuUi();
  }

  private showMenuUi() {
    this.closeMenuUi?.();
    this.closeMenuUi = showMainMenu({
      hasSave: hasSave(),
      onContinue: () => {
        const s = loadGame();
        if (!s) {
          toast('Сохранение повреждено');
          return;
        }
        this.closeMenuUi?.();
        this.startGame(s);
      },
      onNew: () => {
        this.closeMenuUi?.();
        this.closeMenuUi = showCreation(
          (name, faction) => {
            this.closeMenuUi?.();
            const s = newGame(name, faction);
            saveGame(s);
            this.startGame(s);
            toast(`${FACTIONS[faction].rulerTitle} ${FACTIONS[faction].ruler} принял вашу присягу`, 4000);
          },
          () => this.showMenuUi(),
        );
      },
    });
  }

  // ───────────────────────── игра ─────────────────────────

  private startGame(state: GameState) {
    this.menuTween?.stop();
    this.menuTween = null;
    this.state = state;
    this.mode = 'play';
    this.paused = false;
    this.speed = 1;
    this.modals = 0;
    this.path = [];
    this.targetSettlement = null;
    this.refreshOwnership();
    this.party.setVisible(true).setPosition(state.party.x, state.party.y);
    this.updatePartyTexture(0);
    const cam = this.cameras.main;
    cam.setZoom(Math.max(this.minZoom(), 0.9));
    cam.centerOn(state.party.x, state.party.y);
    this.hud = new Hud(state, {
      togglePause: () => this.togglePause(),
      setSpeed: (s) => {
        this.speed = s;
        this.paused = false;
        this.updateHud();
      },
      centerParty: () => this.cameras.main.pan(this.party.x, this.party.y, 400, 'Sine.easeInOut'),
      openParty: () => this.modal(() => openParty(this)),
      openRealms: () => this.modal(() => openRealms(this)),
      openMenu: () => this.openGameMenu(),
    });
    this.updateLabels();
    this.updateHud();
  }

  /** GameCtx: сохранить и обновить интерфейс. */
  commit() {
    this.state.party.x = this.party.x;
    this.state.party.y = this.party.y;
    saveGame(this.state);
    this.updateHud();
  }

  /** Открыть окно, ставящее игру на паузу, пока открыто хоть одно окно. */
  private modal(open: (close: () => void) => unknown) {
    this.modals++;
    this.tooltip?.remove();
    this.tooltip = null;
    const before = uiRoot().querySelectorAll('.modal-back').length;
    open(() => {});
    // Следим, когда окна закроются
    const check = () => {
      const now = uiRoot().querySelectorAll('.modal-back').length;
      if (now <= before) {
        this.modals = Math.max(0, this.modals - 1);
        this.updateHud();
      } else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
    this.updateHud();
  }

  private openGameMenu() {
    this.modal(() => {
      let close = () => {};
      const content = panel(
        'modal narrow',
        h('div', { class: 'head' }, h('h2', { class: 'title' }, 'Меню'), btn('✕', () => close(), 'small close')),
        h(
          'div',
          { class: 'body options' },
          btn('Продолжить', () => close(), 'primary'),
          btn('Сохранить', () => {
            this.commit();
            toast('Игра сохранена');
            close();
          }),
          btn('Настройки', () => showSettings()),
          btn('Выйти в главное меню', () => {
            this.commit();
            close();
            this.enterMenu();
          }, 'danger'),
        ),
      );
      close = openModal(content);
    });
  }

  private togglePause() {
    if (this.mode !== 'play') return;
    this.paused = !this.paused;
    this.updateHud();
  }

  private refreshOwnership() {
    const owners = (s: Settlement) => this.state.settlements[s.id].owner;
    drawTerritory(computeTerritory(owners), this.territoryCanvas);
    (this.textures.get('territory') as Phaser.Textures.CanvasTexture).refresh();
    this.recolorSettlements(owners);
  }

  private recolorSettlements(owner: (s: Settlement) => FactionId) {
    for (const s of world.settlements) this.settleSprites.get(s.id)?.setTexture(settlementTextureKey(s.type, s.culture, owner(s)));
    if (this.mode === 'menu') {
      drawTerritory(computeTerritory(owner), this.territoryCanvas);
      (this.textures.get('territory') as Phaser.Textures.CanvasTexture | undefined)?.refresh?.();
    }
  }

  // ───────────────────────── ввод ─────────────────────────

  private setupInput() {
    this.input.addPointer(2);
    const cam = this.cameras.main;

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      music.unlock();
      if (this.mode !== 'play') return;
      const active = this.activePointers();
      if (active.length >= 2) {
        this.pinch = { dist: this.pointerDist(active), zoom: cam.zoom };
        this.dragging = true;
        return;
      }
      this.downAt = { x: p.x, y: p.y, t: p.downTime };
      this.dragging = false;
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.mode !== 'play') return;
      const active = this.activePointers();
      if (this.pinch && active.length >= 2) {
        const d = this.pointerDist(active);
        const mid = { x: (active[0].x + active[1].x) / 2, y: (active[0].y + active[1].y) / 2 };
        this.zoomAt(this.pinch.zoom * (d / this.pinch.dist), mid.x, mid.y);
        return;
      }
      if (p.isDown && this.downAt) {
        if (!this.dragging && Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) > 10) this.dragging = true;
        if (this.dragging) {
          cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
          cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
        }
      } else if (!p.isDown && p.wasTouch === false) {
        this.hover(p);
      }
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.mode !== 'play') return;
      if (this.pinch) {
        if (this.activePointers().length < 2) this.pinch = null;
        this.downAt = null;
        return;
      }
      if (this.downAt && !this.dragging && this.modals === 0) {
        const wp = cam.getWorldPoint(p.x, p.y);
        this.onTap(wp.x, wp.y);
      }
      this.downAt = null;
      this.dragging = false;
    });

    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.mode !== 'play' || this.modals > 0) return;
      this.zoomAt(cam.zoom * (dy > 0 ? 0.87 : 1.15), p.x, p.y);
    });

    this.input.keyboard?.on('keydown-SPACE', () => this.togglePause());
    this.input.keyboard?.on('keydown-ONE', () => { this.speed = 1; this.updateHud(); });
    this.input.keyboard?.on('keydown-TWO', () => { this.speed = 2; this.updateHud(); });
    this.input.keyboard?.on('keydown-THREE', () => { this.speed = 4; this.updateHud(); });
  }

  private activePointers(): Phaser.Input.Pointer[] {
    return [this.input.pointer1, this.input.pointer2, this.input.pointer3].filter((p) => p && p.isDown);
  }

  private pointerDist(ps: Phaser.Input.Pointer[]): number {
    return Math.max(1, Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y));
  }

  private minZoom(): number {
    return Math.max(MIN_ZOOM_ABS, this.scale.width / WORLD_W, this.scale.height / WORLD_H);
  }

  private clampZoom() {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom, this.minZoom(), MAX_ZOOM));
    this.updateLabels();
  }

  private zoomAt(z: number, sx: number, sy: number) {
    const cam = this.cameras.main;
    const nz = Phaser.Math.Clamp(z, this.minZoom(), MAX_ZOOM);
    const before = cam.getWorldPoint(sx, sy);
    cam.setZoom(nz);
    cam.preRender();
    const after = cam.getWorldPoint(sx, sy);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
    this.updateLabels();
  }

  /** Поселение под точкой: попадание в спрайт с запасом под палец. */
  private settlementAt(x: number, y: number): Settlement | null {
    const cam = this.cameras.main;
    const pad = 12 / cam.zoom;
    let best: Settlement | null = null;
    let bestD = Infinity;
    for (const s of world.settlements) {
      if (s.type === 'village' && cam.zoom < 0.3) continue;
      const img = this.settleSprites.get(s.id);
      if (!img) continue;
      const b = img.getBounds();
      if (x < b.x - pad || x > b.right + pad || y < b.y - pad || y > b.bottom + pad) continue;
      const d = Math.hypot(b.centerX - x, b.centerY - y);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  private hover(p: Phaser.Input.Pointer) {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const s = this.modals === 0 ? this.settlementAt(wp.x, wp.y) : null;
    if (!s) {
      this.tooltip?.remove();
      this.tooltip = null;
      return;
    }
    if (!this.tooltip) {
      this.tooltip = h('div', { class: 'tooltip' });
      document.body.append(this.tooltip);
    }
    const owner = ownerOf(this.state, s);
    const rel = relationTo(this.state, s);
    this.tooltip.replaceChildren(
      h('b', {}, s.name),
      ` · ${TYPE_NAME[s.type]} · `,
      h('span', { style: `color:${FACTIONS[owner].css}` }, FACTIONS[owner].short),
      rel === 'war' ? h('span', { style: 'color:#e07a6a' }, ' · война') : '',
    );
    this.tooltip.style.left = `${p.x + 14}px`;
    this.tooltip.style.top = `${p.y + 14}px`;
  }

  private onTap(x: number, y: number) {
    const s = this.settlementAt(x, y);
    if (s) {
      this.goTo(s.cx, s.cy, s);
      return;
    }
    const { cx, cy } = worldToCell(x, y);
    if (cx < 0 || cy < 0 || cx >= GRID_W || cy >= GRID_H) return;
    const i = cy * GRID_W + cx;
    if (!isFinite(world.map.cost[i])) {
      toast(isWaterCell(i) ? 'Слишком далеко от берега — корабли туда не ходят' : 'Туда не пройти: непроходимые горы');
      return;
    }
    this.goTo(cx, cy, null);
  }

  private goTo(cx: number, cy: number, target: Settlement | null) {
    const start = worldToCell(this.party.x, this.party.y);
    if (start.cx === cx && start.cy === cy && target) {
      this.arrive(target);
      return;
    }
    const raw = findPath(world.map.cost, start.cx, start.cy, cx, cy);
    if (!raw) {
      toast('Туда не найти дороги');
      return;
    }
    const cells = smoothPath(world.map.cost, isWaterCell, raw);
    this.path = cells.slice(1).map((i) => cellCenterWorld(i % GRID_W, (i / GRID_W) | 0));
    this.targetSettlement = target;
    if (this.paused) this.paused = false;
    this.drawPath();
    this.updateHud();
  }

  private drawPath() {
    const g = this.pathGfx;
    g.clear();
    this.marker.clear();
    if (!this.path.length) return;
    const pts = [{ x: this.party.x, y: this.party.y }, ...this.path];
    g.fillStyle(0xfff0c0, 0.85);
    let carry = 0;
    const stepLen = TILE * 0.9;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      let d = carry;
      while (d < len) {
        const t = d / len;
        g.fillRect(Math.round(a.x + (b.x - a.x) * t) - 4, Math.round(a.y + (b.y - a.y) * t) - 4, 8, 8);
        d += stepLen;
      }
      carry = d - len;
    }
    const end = pts[pts.length - 1];
    if (!this.targetSettlement) {
      const m = this.marker;
      m.lineStyle(6, 0x1a1410, 1);
      m.strokeRect(end.x - 12, end.y - 12, 24, 24);
      m.lineStyle(3, 0xe8c04a, 1);
      m.strokeRect(end.x - 12, end.y - 12, 24, 24);
    }
  }

  private arrive(s: Settlement) {
    this.path = [];
    this.targetSettlement = null;
    this.pathGfx.clear();
    this.marker.clear();
    this.state.visiting = s.id;
    this.commit();
    if (!canEnter(this.state, s)) toast(`${s.name}: владения врага`);
    this.modal(() =>
      openSettlement(this, s, () => {
        this.state.visiting = undefined;
        this.commit();
      }),
    );
  }

  // ───────────────────────── кадр ─────────────────────────

  update(_t: number, deltaMs: number) {
    if (this.mode !== 'play') return;
    const running = !this.paused && this.modals === 0;
    const moving = running && this.path.length > 0;

    if (running) {
      const dtDays = (deltaMs / 1000 / SECONDS_PER_DAY) * this.speed;
      this.state.time += dtDays;
      while (Math.floor(this.state.time) > this.state.lastDay) {
        this.state.lastDay++;
        dailyTick(this.state);
        this.commit();
      }
      if (moving) this.moveParty(dtDays);
    }

    // Анимация шага
    if (moving) {
      this.partyAnimT += deltaMs * this.speed;
      if (this.partyAnimT > 180) {
        this.partyAnimT = 0;
        this.partyFrame ^= 1;
        this.updatePartyTexture(this.partyFrame);
      }
    }
    this.party.setDepth(this.party.y + 1);

    this.hudTimer += deltaMs;
    if (this.hudTimer > 120) {
      this.hudTimer = 0;
      this.updateHud();
    }
  }

  private moveParty(dtDays: number) {
    const { cx, cy } = worldToCell(this.party.x, this.party.y);
    const cellCost = Math.min(3, TERRAIN_COST[world.map.terrain[cy * GRID_W + cx]] ?? 1);
    let remaining = (PARTY_SPEED * TILE * dtDays) / (isFinite(cellCost) ? cellCost : 1);
    let consumed = false;
    while (remaining > 0 && this.path.length) {
      const wp = this.path[0];
      const dx = wp.x - this.party.x;
      const dy = wp.y - this.party.y;
      const dist = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.5) this.party.setFlipX(dx < 0);
      if (dist <= remaining) {
        this.party.setPosition(wp.x, wp.y);
        remaining -= dist;
        this.path.shift();
        consumed = true;
      } else {
        this.party.setPosition(this.party.x + (dx / dist) * remaining, this.party.y + (dy / dist) * remaining);
        remaining = 0;
      }
    }
    if (consumed) this.drawPath();
    if (!this.path.length) {
      const s = this.targetSettlement;
      this.pathGfx.clear();
      this.marker.clear();
      this.targetSettlement = null;
      this.commit();
      if (s) this.arrive(s);
    }
  }

  private updatePartyTexture(frame: number) {
    const { cx, cy } = worldToCell(this.party.x, this.party.y);
    const water = cx >= 0 && cy >= 0 && cx < GRID_W && cy < GRID_H && isWaterCell(cy * GRID_W + cx);
    this.party.setTexture(`${water ? 'boat' : 'rider'}_${this.state.hero.faction}_player_${frame}`);
  }

  /** Подписи держат постоянный экранный размер; перекрывающиеся менее важные прячутся. */
  private updateLabels() {
    const z = this.cameras.main.zoom;
    const k = Phaser.Math.Clamp(1 / z, 0.6, 6);
    const rank = { town: 0, castle: 1, village: 2 } as const;
    const order = [...this.labels].sort((a, b) => rank[a.s.type] - rank[b.s.type]);
    const placed: [number, number, number, number][] = [];
    for (const { t, s } of order) {
      const allowed = s.type === 'town' || (s.type === 'castle' ? z > 0.28 : z > 0.6);
      if (!allowed) {
        t.setVisible(false);
        continue;
      }
      t.setScale(k);
      const w = t.width * k;
      const hh = t.height * k;
      const x0 = t.x - w / 2 - 4 * k;
      const x1 = t.x + w / 2 + 4 * k;
      const y0 = t.y;
      const y1 = t.y + hh;
      const overlap = placed.some(([a0, b0, a1, b1]) => !(x1 < a0 || x0 > a1 || y1 < b0 || y0 > b1));
      t.setVisible(!overlap);
      if (!overlap) placed.push([x0, y0, x1, y1]);
    }
  }

  private updateHud() {
    if (!this.hud || !this.state) return;
    const { cx, cy } = worldToCell(this.party.x, this.party.y);
    const t = world.map.terrain[cy * GRID_W + cx];
    const cost = TERRAIN_COST[t];
    const speedWord = cost < 0.95 ? 'быстро' : cost < 1.1 ? 'обычно' : cost < 2 ? 'медленно' : 'очень медленно';
    this.hud.update(this.state, this.paused || this.modals > 0, this.speed, `${TERRAIN_NAME[t] ?? ''} · ${speedWord}`);
  }
}

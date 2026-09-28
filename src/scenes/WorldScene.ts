import Phaser from 'phaser';
import { music } from '../audio/music';
import { ART_SCALE, GRID_H, GRID_W, PARTY_SPEED, SECONDS_PER_DAY, TILE, WORLD_H, WORLD_W } from '../config';
import { FACTIONS, type FactionId } from '../data/factions';
import { settlementTextureKey } from '../gfx/sprites';
import { atWar, canEnter, dailyTick, ownerOf, partySize, relationTo, totalReady } from '../game/logic';
import { hint, openHelp, resetHints } from '../ui/hints';
import { enemyArmy, playerArmy } from '../battle/setup';
import { Battle, type Formation } from '../battle/sim';
import type { BattleTerrain } from '../battle/background';
import { prewarmBattleTerrain } from './BattleScene';
import { applyBattle, applyRaid, applySiege, enemyDisplayColor, retreat, type AppliedResult } from '../game/battleResult';
import { questsDaily } from '../game/quests';
import { companionDeed, companionsDaily, partySkill, trainingDaily } from '../game/companions';
import { isPlagued, plagueDaily } from '../game/plague';
import { activeLords, alliesNear, capture, news, lordsNear, placeName, withAllies, initWar, isLooted, mergeTroops, onNews, siegeDefenders, takeOwnershipChanged, troopCount, villageMilitia, warDaily, warUpdate } from '../game/war';
import { dailySpawn, partyCount, partyRuntime, powerRatio, resetPartyRuntime, updateParties, type MapParty } from '../game/parties';
import { hasSave, loadGame, newGame, saveGame, type GameState } from '../game/state';
import { heroLook } from '../game/hero';
import { heroPortraitURL } from '../gfx/icons';
import { isWaterCell, world, type Settlement } from '../game/world';
import { cellCenterWorld, geoToWorld, worldToCell } from '../map/geo';
import { findPath, smoothPath } from '../map/pathfinding';
import { computeTerritory, drawTerritory } from '../map/territory';
import { T, TERRAIN_COST, TERRAIN_NAME } from '../map/terrain';
import { openBattleResult, openChronicle, openEncounter, openOutcome, openSiegeDialog } from '../ui/encounter';
import { openHero } from '../ui/heroUi';
import { btn, h, openModal, panel, toast, uiRoot } from '../ui/dom';
import { Hud } from '../ui/hud';
import { openParty, openRealms, openSettlement, type BattleView, type GameCtx } from '../ui/panels';
import { showCreation, showMainMenu, showSettings } from '../ui/screens';

type Pt = { x: number; y: number };

const MIN_ZOOM_ABS = 0.12;
const MAX_ZOOM = 2.5;
const TYPE_NAME = { town: 'Город', castle: 'Замок', village: 'Деревня' } as const;
/** Масштаб фигурок отрядов на карте относительно пиксель-арта поселений: мельче, чтобы не загромождать карту. */
const PARTY_K = 0.6;
const LORD_K = 0.56;
const PLAYER_K = 0.68;

export class WorldScene extends Phaser.Scene implements GameCtx {
  state!: GameState;
  private mode: 'menu' | 'play' = 'menu';
  /** «Ждать»: время идёт, хотя отряд стоит (как лагерь в Mount & Blade). */
  private waiting = false;
  private speed = 1;
  private modals = 0;
  private hud: Hud | null = null;
  private closeMenuUi: (() => void) | null = null;

  private party!: Phaser.GameObjects.Sprite;
  /** Золотое кольцо под отрядом игрока, чтобы его было видно в толпе. */
  private ring!: Phaser.GameObjects.Ellipse;
  private ringT = 0;
  private partyFrame = 0;
  private partyAnimT = 0;
  private path: Pt[] = [];
  private targetSettlement: Settlement | null = null;
  private pathGfx!: Phaser.GameObjects.Graphics;
  private marker!: Phaser.GameObjects.Graphics;

  private settleSprites = new Map<string, Phaser.GameObjects.Image>();
  private partySprites = new Map<number, { s: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text; frameT: number; frame: number; color: string }>();
  /** Метки на карте: осадные лагеря и дым над разорёнными деревнями. */
  private warMarks = new Map<string, Phaser.GameObjects.Sprite>();
  private warMarkT = 0;
  private labelT = 0;
  private warMarkFrame = 0;
  private targetParty: MapParty | null = null;
  private targetRepath = 0;
  private inBattle = false;
  private labels: { t: Phaser.GameObjects.Text; s: Settlement }[] = [];
  /** Прямоугольники видимых подписей поселений (для раздвижки подписей отрядов). */
  private labelBoxes: [number, number, number, number][] = [];
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

    this.party = this.add.sprite(0, 0, 'rider_aurelia_player_0').setOrigin(0.5, 0.9).setScale(ART_SCALE * PLAYER_K).setVisible(false);
    this.ring = this.add.ellipse(0, 0, 62, 24).setStrokeStyle(4, 0xffd24a, 0.9).setVisible(false);

    this.setupInput();
    this.scale.on('resize', () => this.clampZoom());
    this.enterMenu();
  }

  // ───────────────────────── меню ─────────────────────────

  private enterMenu() {
    this.mode = 'menu';
    resetHints();
    this.hud?.destroy();
    this.hud = null;
    this.party.setVisible(false);
    this.ring?.setVisible(false);
    for (const v of this.partySprites.values()) {
      v.s.destroy();
      v.label.destroy();
    }
    this.partySprites.clear();
    for (const m of this.warMarks.values()) m.destroy();
    this.warMarks.clear();
    this.targetParty = null;
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
    initWar(state);
    onNews((text, kind) => {
      const color = { war: '#e07a6a', peace: '#7ad06a', capture: '#e8c04a', party: '#c8a0e8' }[kind as string];
      if (this.mode === 'play' && color) this.hud?.news(text, color);
    });
    this.mode = 'play';
    this.waiting = false;
    this.speed = 1;
    this.modals = 0;
    this.path = [];
    this.targetSettlement = null;
    this.refreshOwnership();
    resetPartyRuntime();
    this.targetParty = null;
    state.parties ??= [];
    if (!state.parties.length) for (let i = 0; i < 6; i++) dailySpawn(state);
    this.party.setVisible(true).setPosition(state.party.x, state.party.y);
    this.updatePartyTexture(0);
    const cam = this.cameras.main;
    cam.setZoom(Math.max(this.minZoom(), 0.75));
    cam.centerOn(state.party.x, state.party.y);
    this.hud = new Hud(state, {
      toggleWait: () => this.toggleWait(),
      cycleSpeed: () => {
        this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1;
        this.updateHud();
      },
      centerParty: () => this.cameras.main.pan(this.party.x, this.party.y, 400, 'Sine.easeInOut'),
      openParty: () => this.modal(() => openParty(this)),
      openRealms: () => this.modal(() => openRealms(this)),
      openMenu: () => this.openGameMenu(),
      openHero: () => this.modal(() => openHero(this)),
      openChronicle: () => this.modal(() => openChronicle(this.state)),
    });
    this.updateLabels();
    this.updateHud();
    resetHints();
    hint(state, 'start');
    // Фон боя для местности вокруг отряда рисуется заранее, в свободное время
    prewarmBattleTerrain(this.textures, [this.battleTerrain()]);
  }

  /** GameCtx: сохранить и обновить интерфейс. */
  commit() {
    this.state.party.x = this.party.x;
    this.state.party.y = this.party.y;
    saveGame(this.state);
    this.updateHud();
  }

  /** Открыть окно, ставящее игру на паузу, пока открыто хоть одно окно. */
  modal(open: (close: () => void) => unknown) {
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
          btn('Как играть', () => openHelp()),
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

  /** Время идёт, только пока отряд в пути или герой ждёт; иначе мир замирает. */
  private timeFlows(): boolean {
    return this.modals === 0 && (this.path.length > 0 || this.waiting || !!this.targetParty);
  }

  private toggleWait() {
    if (this.mode !== 'play') return;
    this.waiting = !this.waiting;
    if (this.waiting) this.stopMoving();
    this.updateHud();
  }

  private stopMoving() {
    this.path = [];
    this.targetSettlement = null;
    this.targetParty = null;
    this.pathGfx.clear();
    this.marker.clear();
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

    this.input.keyboard?.on('keydown-SPACE', () => this.toggleWait());
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
    const mp = this.modals === 0 ? this.partyAt(wp.x, wp.y) : null;
    if (mp) {
      if (!this.tooltip) {
        this.tooltip = h('div', { class: 'tooltip' });
        document.body.append(this.tooltip);
      }
      const r = powerRatio(this.state, mp);
      const verdict = r < 0.5 ? 'слабее вас' : r < 0.9 ? 'чуть слабее' : r < 1.2 ? 'равны по силе' : 'сильнее вас';
      this.tooltip.replaceChildren(
        h('b', { style: `color:${enemyDisplayColor(mp)}` }, mp.name),
        ` · ${partyCount(mp)} ⚔ · ${this.isHostile(mp) ? verdict : mp.faction === this.state.hero.faction ? 'союзник' : 'мир'}`,
        mp.kind === 'lord' ? h('div', { class: 'muted', style: 'font-size:12px' }, this.lordTask(mp)) : '',
      );
      this.tooltip.style.left = `${p.x + 14}px`;
      this.tooltip.style.top = `${p.y + 14}px`;
      return;
    }
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
      isPlagued(this.state, s) ? h('span', { style: 'color:#9ab87a' }, ' · мор!') : '',
    );
    this.tooltip.style.left = `${p.x + 14}px`;
    this.tooltip.style.top = `${p.y + 14}px`;
  }

  private onTap(x: number, y: number) {
    let mp = this.partyAt(x, y);
    // Союзный или мирный отряд, стоящий на поселении, не мешает войти в поселение
    if (mp && !this.isHostile(mp) && this.settlementAt(x, y)) mp = null;
    if (mp) {
      if (!this.isHostile(mp)) {
        toast(mp.kind === 'lord' ? `${mp.name} · ${partyCount(mp)} воинов · ${this.lordTask(mp)}` : `${mp.name}: мирный отряд`, 3000);
        return;
      }
      const c = worldToCell(mp.x, mp.y);
      this.goTo(c.cx, c.cy, null);
      this.targetParty = mp;
      this.targetRepath = 0;
      toast(`Преследуем: ${mp.name}`);
      return;
    }
    this.targetParty = null;
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

  private goTo(cx: number, cy: number, target: Settlement | null, quiet = false) {
    const start = worldToCell(this.party.x, this.party.y);
    if (start.cx === cx && start.cy === cy && target) {
      this.arrive(target);
      return;
    }
    const raw = findPath(world.map.cost, start.cx, start.cy, cx, cy);
    if (!raw) {
      if (!quiet) toast('Туда не найти дороги');
      return;
    }
    const cells = smoothPath(world.map.cost, isWaterCell, raw);
    this.path = cells.slice(1).map((i) => cellCenterWorld(i % GRID_W, (i / GRID_W) | 0));
    this.targetSettlement = target;
    this.waiting = false;
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
    hint(this.state, 'settle');
    if (!canEnter(this.state, s)) {
      toast(`${s.name}: владения врага`);
      hint(this.state, 'enemy');
    }
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
    const running = this.timeFlows();
    const moving = running && this.path.length > 0;

    if (running) {
      const dtDays = (deltaMs / 1000 / SECONDS_PER_DAY) * this.speed;
      this.state.time += dtDays;
      while (Math.floor(this.state.time) > this.state.lastDay) {
        this.state.lastDay++;
        dailyTick(this.state);
        dailySpawn(this.state);
        warDaily(this.state);
        for (const msg of questsDaily(this.state)) this.hud?.news(msg, '#ffd24a');
        for (const msg of plagueDaily(this.state)) this.hud?.news(msg, '#9ab87a');
        for (const msg of companionsDaily(this.state)) news(this.state, msg, 'party');
        trainingDaily(this.state, partySkill(this.state, 'training'));
        this.commit();
      }
      if (moving) this.moveParty(dtDays);
      // Преследование выбранного отряда
      if (this.targetParty) {
        const tp = this.targetParty;
        const alive = tp.kind === 'lord' ? tp.lord!.status === 'active' : (this.state.parties ?? []).includes(tp);
        if (!alive) this.targetParty = null;
        else {
          this.targetRepath -= dtDays;
          if (this.targetRepath <= 0) {
            this.targetRepath = 0.1;
            const c = worldToCell(tp.x, tp.y);
            this.goTo(c.cx, c.cy, null, true);
          }
        }
      }
      const met = updateParties(this.state, dtDays, this.targetParty?.id ?? null);
      const metLord = warUpdate(this.state, dtDays, this.targetParty?.id ?? null);
      if (takeOwnershipChanged()) this.refreshOwnership();
      if ((met || metLord) && !this.inBattle) this.encounter((met ?? metLord)!);
      else this.checkOutcome();
    }
    this.syncParties(deltaMs);
    this.syncWarMarks(deltaMs);

    // Анимация шага
    if (moving) {
      this.partyAnimT += deltaMs * this.speed;
      if (this.partyAnimT > 180) {
        this.partyAnimT = 0;
        this.partyFrame ^= 1;
        this.updatePartyTexture(this.partyFrame);
      }
    }
    // Отряд игрока поверх соседних лордов и шаек, кольцо под ним пульсирует
    this.party.setDepth(this.party.y + 60);
    this.ringT += deltaMs / 1000;
    this.ring.setVisible(true).setPosition(this.party.x, this.party.y - 2).setDepth(this.party.y + 59).setScale(1 + Math.sin(this.ringT * 3) * 0.08).setAlpha(0.65 + Math.sin(this.ringT * 3) * 0.25);

    this.hudTimer += deltaMs;
    if (this.hudTimer > 120) {
      this.hudTimer = 0;
      this.updateHud();
      const st = this.state;
      if (totalReady(st) > 0) hint(st, 'upgrade');
      if ((st.hero.points ?? 0) > 0 && st.hero.level > 1) hint(st, 'points');
      if (st.time > 1.5) hint(st, 'war');
      if (st.quests?.length) hint(st, 'quest');
      if (st.plague?.started) hint(st, 'plague');
    }
  }

  private moveParty(dtDays: number) {
    const { cx, cy } = worldToCell(this.party.x, this.party.y);
    const cellCost = Math.min(3, TERRAIN_COST[world.map.terrain[cy * GRID_W + cx]] ?? 1);
    let remaining = (PARTY_SPEED * TILE * dtDays * (1 + partySkill(this.state, 'pathfinding') * 0.04)) / (isFinite(cellCost) ? cellCost : 1);
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

  // ───────────────────────── отряды на карте ─────────────────────────

  private partyTexture(p: MapParty, frame: number): string {
    switch (p.kind) {
      case 'raiders':
        return `raider_${frame}`;
      case 'desert':
        return `desertr_${frame}`;
      case 'pirates':
        return `band_p_${frame}`;
      case 'deserters':
        return `band_d_${frame}`;
      case 'patrol':
        return `rider_${p.faction}_${frame}`;
      case 'lord':
        return `lord_${p.faction}_${frame}`;
      case 'caravan':
        return `caravan_${p.faction}_${frame}`;
      default:
        return `band_${frame}`;
    }
  }

  private syncParties(deltaMs: number) {
    const list = [...(this.state.parties ?? []), ...activeLords(this.state)];
    const alive = new Set(list.map((p) => p.id));
    for (const [id, v] of this.partySprites) {
      if (!alive.has(id)) {
        v.s.destroy();
        v.label.destroy();
        this.partySprites.delete(id);
      }
    }
    const z = this.cameras.main.zoom;
    const k = Phaser.Math.Clamp(1 / z, 0.6, 6);
    for (const p of list) {
      let v = this.partySprites.get(p.id);
      if (!v) {
        const s = this.add.sprite(p.x, p.y, this.partyTexture(p, 0)).setOrigin(0.5, 0.9).setScale(ART_SCALE * PARTY_K);
        const label = this.add
          .text(p.x, p.y + 6, '', { fontFamily: '"Kurale", Georgia, serif', fontSize: p.kind === 'lord' ? '12.5px' : '11.5px', color: '#e8e0c8', stroke: '#1a1410', strokeThickness: 3 })
          .setOrigin(0.5, 0)
          .setResolution(Math.min(3, window.devicePixelRatio || 1))
          .setDepth(9990);
        v = { s, label, frameT: 0, frame: 0, color: '' };
        this.partySprites.set(p.id, v);
      }
      const quarry = p.questId || (this.state.quests ?? []).some((q) => q.kind === 'hunt' && !q.done && q.lordId === p.id);
      const color = quarry ? '#ffd24a' : this.isHostile(p) ? '#ffb8a0' : p.faction === this.state.hero.faction ? '#c8f0a8' : '#e8e0c8';
      if (color !== v.color) {
        v.color = color;
        v.label.setColor(color);
      }
      const r = partyRuntime(p);
      if (r.moving && this.timeFlows()) {
        v.frameT += deltaMs * this.speed;
        if (v.frameT > 200) {
          v.frameT = 0;
          v.frame ^= 1;
        }
      }
      v.s.setTexture(this.partyTexture(p, v.frame)).setPosition(p.x, p.y).setFlipX(r.facing < 0).setDepth(p.y);
      v.s.setScale(ART_SCALE * (p.kind === 'lord' ? LORD_K : PARTY_K));
      v.label.setText(`${p.name} · ${partyCount(p)}`).setPosition(p.x, p.y + 4).setScale(k);
    }
    // Подписи отрядов не налезают на подписи городов и друг на друга: сначала лорды, потом ближние к игроку.
    // Раскладка раз в 150 мс — дешевле для телефона.
    this.labelT += deltaMs;
    if (this.labelT < 150) return;
    this.labelT = 0;
    const placed = [...this.labelBoxes];
    const order = [...list].sort((a, b) => (a.kind === 'lord' ? 0 : 1) - (b.kind === 'lord' ? 0 : 1) || Math.hypot(a.x - this.party.x, a.y - this.party.y) - Math.hypot(b.x - this.party.x, b.y - this.party.y));
    for (const p of order) {
      const t = this.partySprites.get(p.id)!.label;
      if (z <= 0.35) {
        t.setVisible(false);
        continue;
      }
      const w = t.width * k;
      const box: [number, number, number, number] = [t.x - w / 2, t.y, t.x + w / 2, t.y + t.height * k];
      const overlap = placed.some(([a0, b0, a1, b1]) => !(box[2] < a0 || box[0] > a1 || box[3] < b0 || box[1] > b1));
      t.setVisible(!overlap);
      if (!overlap) placed.push(box);
    }
  }

  private partyAt(x: number, y: number): MapParty | null {
    const cam = this.cameras.main;
    const r = Math.max(40, 22 / cam.zoom);
    let best: MapParty | null = null;
    let bestD = Infinity;
    for (const p of [...(this.state?.parties ?? []), ...(this.state ? activeLords(this.state) : [])]) {
      const d = Math.hypot(p.x - x, p.y - 24 - y);
      if (d < r && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  /** Погода боя: в снегах часто метель, в пустыне сухо, в остальных местах иногда дождь. */
  private battleWeather(t: BattleTerrain | null): 'rain' | 'snow' | undefined {
    if (!t || t === 'desert') return undefined;
    const month = Math.floor(((this.state.time / 30.4) + 2) % 12); // 0 — январь
    const winter = month === 11 || month <= 1;
    if (t === 'snow') return Math.random() < 0.6 ? 'snow' : undefined;
    if (winter && t !== 'steppe' && t !== 'dry') return Math.random() < 0.35 ? 'snow' : undefined;
    return Math.random() < 0.18 ? 'rain' : undefined;
  }

  private battleTerrain(): BattleTerrain {
    const { cx, cy } = worldToCell(this.party.x, this.party.y);
    const t = world.map.terrain[cy * GRID_W + cx];
    if (t === T.STEPPE) return 'steppe';
    if (t === T.DESERT) return 'desert';
    if (t === T.SNOW || t === T.TUNDRA) return 'snow';
    if (t === T.FOREST || t === T.TAIGA || t === T.JUNGLE) return 'forest';
    if (t === T.DRY || t === T.HILLS || t === T.MOUNTAIN) return 'dry';
    return 'grass';
  }

  private encounter(p: MapParty) {
    this.waiting = false;
    this.path = [];
    this.targetSettlement = null;
    this.pathGfx.clear();
    this.marker.clear();
    const attacked = this.targetParty?.id !== p.id;
    this.targetParty = null;
    hint(this.state, 'battle');
    prewarmBattleTerrain(this.textures, [this.battleTerrain()]); // пока игрок читает окно встречи
    if (this.state.party.troops.reduce((s, t) => s + t.count, 0) === 0 && attacked) {
      // Героя без отряда разбойники просто грабят
      const lost = Math.floor(this.state.gold * 0.3);
      this.state.gold -= lost;
      p.calmUntil = this.state.time + 1;
      toast(`${p.name} ограбили вас: −${lost} ¤. Наймите воинов!`, 4000);
      this.commit();
      return;
    }
    // Кто рядом вступит в бой: союзные лорды за нас, лорды той же державы — за врага
    const allies = p.kind === 'bandits' || p.faction === 'outlaw' || p.kind === 'lord' || p.kind === 'patrol' ? alliesNear(this.state, this.party.x, this.party.y, 3) : [];
    const others = p.kind === 'lord' ? lordsNear(this.state, p.faction as FactionId, p.x, p.y, 3, p) : [];
    this.modal(() =>
      openEncounter(this.state, p, attacked, {
        fight: (f) => this.startBattle(p, f, false, allies, others),
        auto: (f) => this.startBattle(p, f, true, allies, others),
        retreat: () => {
          const { lost } = retreat(this.state, p);
          for (const msg of companionDeed(this.state, 'retreat')) news(this.state, msg, 'party');
          if (lost.length) toast(`Отступили, но потеряли ${lost.reduce((s, l) => s + l.n, 0)} воинов арьергарда`, 3500);
          else toast('Вы ушли от погони');
          this.commit();
        },
      }, { allies, others }),
    );
  }

  private startBattle(p: MapParty, formation: Formation, auto: boolean, allies: MapParty[] = [], others: MapParty[] = []) {
    const name = others.length ? `${p.name} и союзники` : p.name;
    const enemy = enemyArmy(name, p.faction, others.length ? mergeTroops([p.troops, ...others.map((o) => o.troops)]) : p.troops);
    const battle = new Battle([withAllies(playerArmy(this.state, formation), allies), enemy]);
    this.runBattle(battle, auto, { enemyName: name, enemyColor: enemyDisplayColor(p) }, (b) => {
      const res = applyBattle(this.state, b, p, allies, others);
      this.afterBattle(res, name);
    });
  }

  /** GameCtx: снова открыть поселение (после турнира). */
  visit(s: Settlement) {
    this.arrive(s);
  }

  /** GameCtx: запуск боя — автобой сразу, иначе сцена сражения поверх усыплённой карты. */
  runBattle(battle: Battle, auto: boolean, view: BattleView, done: (b: Battle) => void) {
    if (auto) {
      battle.runToEnd();
      done(battle);
      return;
    }
    this.inBattle = true;
    this.hud?.setVisible(false);
    this.tooltip?.remove();
    this.tooltip = null;
    this.scene.launch('battle', {
      battle,
      terrain: this.battleTerrain(),
      heroFaction: this.state.hero.faction,
      heroLook: heroLook(this.state),
      heroPortrait: heroPortraitURL(this.state),
      enemyName: view.enemyName,
      enemyColor: view.enemyColor,
      wall: view.wall,
      arena: view.arena,
      weather: this.battleWeather(view.arena ? null : this.battleTerrain()),
      onFinish: (b: Battle) => {
        this.scene.stop('battle');
        this.scene.wake();
        this.inBattle = false;
        this.hud?.setVisible(true);
        music.play('calm');
        done(b);
      },
    });
    this.scene.sleep();
  }

  private afterBattle(res: AppliedResult, enemyName: string) {
    if (!res.won) {
      this.party.setPosition(this.state.party.x, this.state.party.y);
      this.cameras.main.centerOn(this.state.party.x, this.state.party.y);
    }
    if (takeOwnershipChanged()) this.refreshOwnership();
    this.commit();
    this.modal(() =>
      openBattleResult(this.state, res, enemyName, () => {
        this.commit();
        this.checkOutcome();
      }),
    );
  }

  // ───────────────────────── осады и набеги ─────────────────────────

  /** GameCtx: начать осаду вражеской крепости, у стен которой стоит отряд. */
  startSiege(s: Settlement) {
    prewarmBattleTerrain(this.textures, [this.battleTerrain()]);
    const { garrison, lords } = siegeDefenders(this.state, s);
    if (troopCount(garrison) + lords.reduce((n, l) => n + troopCount(l.troops), 0) === 0) {
      capture(this.state, s, this.state.hero.faction, true);
      (this.state.capturedByHero ??= []).push(s.id);
      this.state.stats!.captured = (this.state.stats!.captured ?? 0) + 1;
      if (takeOwnershipChanged()) this.refreshOwnership();
      toast(`${s.name} сдаётся без боя!`, 4000);
      this.commit();
      this.checkOutcome();
      return;
    }
    const allies = alliesNear(this.state, s.x, s.y, 6);
    this.modal(() =>
      openSiegeDialog(this.state, s, garrison, lords, {
        assault: () => this.assault(s, false),
        auto: () => this.assault(s, true),
      }, allies),
    );
  }

  private assault(s: Settlement, auto: boolean) {
    if (partySize(this.state) === 0) {
      toast('В одиночку на стены не лезут. Наймите войско!', 3500);
      return;
    }
    const owner = this.state.settlements[s.id].owner;
    const f = FACTIONS[owner];
    const { garrison, lords } = siegeDefenders(this.state, s);
    const def = enemyArmy(`Гарнизон: ${s.name}`, owner, mergeTroops([garrison, ...lords.map((l) => l.troops)]));
    def.morale = 115;
    const allies = alliesNear(this.state, s.x, s.y, 6);
    const battle = new Battle([withAllies(playerArmy(this.state, 'classic'), allies), def], 0, { siege: true });
    this.runBattle(battle, auto, { enemyName: s.name, enemyColor: f.css, wall: { culture: s.culture, color: f.css, color2: f.css2 } }, (b) => {
      const res = applySiege(this.state, b, s, garrison, lords, allies);
      this.afterBattle(res, `Гарнизон ${s.name}`);
    });
  }

  /** GameCtx: разорить вражескую деревню (бой с ополчением). */
  startRaid(s: Settlement) {
    prewarmBattleTerrain(this.textures, [this.battleTerrain()]);
    if (isLooted(this.state, s.id)) {
      toast('Здесь уже нечего брать', 2500);
      return;
    }
    const militia = villageMilitia(s, this.state.time);
    const pseudo: MapParty = {
      id: -1,
      kind: 'patrol',
      name: `Ополчение: ${s.name}`,
      faction: s.culture,
      x: s.x,
      y: s.y,
      hx: s.cx,
      hy: s.cy,
      troops: militia,
      gold: 0,
      loot: {},
      calmUntil: 0,
    };
    this.modal(() =>
      openEncounter(this.state, pseudo, false, {
        fight: (f) => this.raid(s, militia, f, false),
        auto: (f) => this.raid(s, militia, f, true),
        retreat: () => toast('Вы оставили деревню в покое'),
      }),
    );
  }

  private raid(s: Settlement, militia: { id: string; count: number }[], formation: Formation, auto: boolean) {
    const owner = this.state.settlements[s.id].owner;
    const battle = new Battle([playerArmy(this.state, formation), enemyArmy(`Ополчение: ${s.name}`, owner, militia)]);
    this.runBattle(battle, auto, { enemyName: `Ополчение: ${s.name}`, enemyColor: FACTIONS[owner].css }, (b) => {
      const res = applyRaid(this.state, b, s, militia);
      this.afterBattle(res, `Ополчение ${s.name}`);
    });
  }

  private outcomeShown = false;
  private checkOutcome() {
    const w = this.state.war;
    if (!w?.outcome || this.outcomeShown || w.outcomeSeen || this.modals > 0 || this.inBattle) return;
    this.outcomeShown = true;
    w.outcomeSeen = true;
    this.commit();
    this.modal(() =>
      openOutcome(
        this.state,
        w.outcome!,
        () => this.commit(),
        () => {
          this.commit();
          this.enterMenu();
        },
      ),
    );
  }

  private isHostile(p: MapParty): boolean {
    if (p.kind !== 'patrol' && p.kind !== 'lord' && p.kind !== 'caravan') return true;
    return atWar(this.state, p.faction as FactionId, this.state.hero.faction);
  }

  private lordTask(p: MapParty): string {
    const info = p.lord!;
    const ts = info.target ? world.byId.get(info.target) : undefined;
    if (info.task === 'campaign' && ts) return this.state.war?.sieges[ts.id] ? `осаждает ${placeName(ts)}` : `в походе на ${placeName(ts)}`;
    if (info.task === 'relieve' && ts) return `спешит на выручку: ${ts.name}`;
    if (info.task === 'follow') return `идёт с вашим отрядом ещё ${Math.max(1, Math.ceil((info.followUntil ?? 0) - this.state.time))} дн.`;
    return `стережёт свои земли (${world.byId.get(info.home)?.name ?? 'дом'})`;
  }

  /** Лагеря осаждающих у стен и дым над разорёнными деревнями. */
  private syncWarMarks(deltaMs: number) {
    const w = this.state.war;
    if (!w) return;
    this.warMarkT += deltaMs;
    if (this.warMarkT > 260) {
      this.warMarkT = 0;
      this.warMarkFrame ^= 1;
    }
    const want = new Map<string, string>();
    for (const id of Object.keys(w.sieges)) want.set(`siege:${id}`, `camp_${this.warMarkFrame}`);
    for (const [id, until] of Object.entries(w.looted)) if (until > this.state.time) want.set(`loot:${id}`, `smoke_${this.warMarkFrame}`);
    for (const id of this.state.fiefs ?? []) want.set(`fief:${id}`, 'crown');
    for (const [id, until] of Object.entries(this.state.plague?.infected ?? {})) if (until > this.state.time) want.set(`plague:${id}`, `plague_${this.warMarkFrame}`);
    for (const [k, m] of this.warMarks) {
      if (!want.has(k)) {
        m.destroy();
        this.warMarks.delete(k);
      }
    }
    for (const [k, tex] of want) {
      let m = this.warMarks.get(k);
      if (!m) {
        const s = world.byId.get(k.split(':')[1])!;
        m = k.startsWith('siege')
          ? this.add.sprite(s.x - TILE * 3.2, s.y + TILE * 1.6, tex).setOrigin(0.5, 1).setScale(ART_SCALE * 0.7).setDepth(s.y + TILE)
          : k.startsWith('fief')
            ? this.add.sprite(s.x, s.y - TILE * 4.2, tex).setOrigin(0.5, 1).setScale(ART_SCALE * 0.8).setDepth(s.y + 4)
          : k.startsWith('plague')
            ? this.add.sprite(s.x + TILE * 2.2, s.y - TILE * 2.2, tex).setOrigin(0.5, 1).setScale(ART_SCALE * 0.8).setDepth(s.y + 3).setAlpha(0.9)
            : this.add.sprite(s.x, s.y - TILE * 0.2, tex).setOrigin(0.5, 1).setScale(ART_SCALE * 0.9).setDepth(s.y + 2).setAlpha(0.85);
        this.warMarks.set(k, m);
      }
      m.setTexture(tex);
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
    this.labelBoxes = placed;
  }

  private updateHud() {
    if (!this.hud || !this.state) return;
    const { cx, cy } = worldToCell(this.party.x, this.party.y);
    const t = world.map.terrain[cy * GRID_W + cx];
    const cost = TERRAIN_COST[t];
    const speedWord = cost < 0.95 ? 'быстро' : cost < 1.1 ? 'обычно' : cost < 2 ? 'медленно' : 'очень медленно';
    this.hud.update(this.state, this.path.length > 0 ? 'march' : this.waiting ? 'wait' : 'still', this.speed, `${TERRAIN_NAME[t] ?? ''} · ${speedWord}`);
  }
}

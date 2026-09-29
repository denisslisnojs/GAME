import Phaser from 'phaser';
import { drawSnowCover, hash01 } from '../map/season';
import { music } from '../audio/music';
import { ART_SCALE, DPR, GRID_H, GRID_W, LABEL_FONT, PARTY_SPEED, SECONDS_PER_DAY, TILE, WORLD_H, WORLD_W } from '../config';
import { FACTIONS, type FactionId } from '../data/factions';
import { drawRider, settlementTextureKey } from '../gfx/sprites';
import { atWar, canEnter, dailyTick, ownerOf, partySize, relationTo, totalReady } from '../game/logic';
import { hint, openHelp, resetHints } from '../ui/hints';
import { enemyArmy, playerArmy } from '../battle/setup';
import { Battle, type BattleOpts, type Formation, type Weather } from '../battle/sim';
import { nearRiver } from '../map/rivers';
import type { DuelMods } from '../ui/encounter';
import { TROOPS } from '../data/troops';
import { troopLook } from '../battle/looks';
import { FIELD_W } from '../battle/sim';
import type { BattleTerrain } from '../battle/background';
import { prewarmBattleTerrain, prewarmUnitLooks } from './BattleScene';
import { applyBattle, applyDefense, gainHeroXp, applyRaid, applySiege, enemyDisplayColor, retreat, type AppliedResult } from '../game/battleResult';
import { questsDaily } from '../game/quests';
import { companionDeed, companionsDaily, partySkill, trainingDaily } from '../game/companions';
import { pickEvent, type RoadEvent } from '../game/events';
import { prisonersDaily } from '../game/prisoners';
import { fiefDaily } from '../game/fief';
import { diff } from '../game/difficulty';
import { tutorialTick } from '../game/tutorial';
import { checkAchievements } from '../game/achievements';
import { sfx } from '../audio/sfx';
import { applyCrown } from '../game/crown';
import { openRoadEvent } from '../ui/events';
import { isPlagued, plagueDaily } from '../game/plague';
import { activeLords, alliesNear, capture, news, lordsNear, outlawsNear, placeName, withAllies, initWar, isLooted, mergeTroops, onNews, siegeAttackers, siegeDefenders, takeOwnershipChanged, troopCount, villageMilitia, warDaily, warUpdate } from '../game/war';
import { dailySpawn, partyCount, partyRuntime, powerRatio, resetPartyRuntime, updateParties, type MapParty } from '../game/parties';
import { hasSave, listSlots, loadGame, newGame, saveGame, type GameState } from '../game/state';
import { heroLook } from '../game/hero';
import { heroEmblemURL, heroPortraitURL } from '../gfx/icons';
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
import { showAchievements, showCreation, showMainMenu, showSettings, showSlots } from '../ui/screens';
import { initPrologue, prologueStep, prologueTarget, prologueTick, skipPrologue } from '../game/prologue';
import { openPrologueIntro, openPrologueVictory, prologueOnArrive } from '../ui/prologue';
import { tr } from '../i18n';

type Pt = { x: number; y: number };

const MIN_ZOOM_ABS = 0.12 * DPR;
const MAX_ZOOM = 2.5 * DPR;
const TYPE_NAME = { town: tr('Город'), castle: tr('Замок'), village: tr('Деревня') } as const;
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
  /** Золотая стрелка над целью пролога. */
  private questMark!: Phaser.GameObjects.Graphics;

  private settleSprites = new Map<string, Phaser.GameObjects.Image>();
  private partySprites = new Map<number, { s: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text; badge: Phaser.GameObjects.Text; frameT: number; frame: number; color: string; badgeColor: string }>();
  /** Метки на карте: осадные лагеря и дым над разорёнными деревнями. */
  private warMarks = new Map<string, Phaser.GameObjects.Sprite>();
  private warMarkT = 0;
  private labelT = 0;
  private warMarkFrame = 0;
  private targetParty: MapParty | null = null;
  private targetRepath = 0;
  private inBattle = false;
  private autosaveMs = 0;
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
  private snowImg: Phaser.GameObjects.Image | null = null;
  private ambient!: Phaser.GameObjects.Graphics;
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
    // Зимний снег поверх карты (рисуется при первой надобности)
    this.snowImg = null;
    this.ambient = this.add.graphics().setDepth(9500);

    this.pathGfx = this.add.graphics().setDepth(-5);
    this.marker = this.add.graphics().setDepth(9000);
    this.questMark = this.add.graphics().setDepth(9500);

    for (const s of world.settlements) {
      const img = this.add
        .image(s.x, s.y + TILE * 0.4, settlementTextureKey(s.type, s.culture, s.culture))
        .setOrigin(0.5, 1)
        .setScale(ART_SCALE * (s.type === 'village' ? 0.8 : 1))
        .setDepth(s.y);
      this.settleSprites.set(s.id, img);
      const t = this.add
        .text(s.x, s.y + TILE * 0.5, s.name, {
          fontFamily: LABEL_FONT,
          fontStyle: s.type === 'village' ? '500' : '700',
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
    cam.setZoom(Math.max(this.minZoom(), 0.55 * DPR));
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
          toast(tr('Сохранение повреждено'));
          return;
        }
        this.closeMenuUi?.();
        this.startGame(s);
      },
      onLoad: () =>
        showSlots('load', (slot) => {
          const s = loadGame(slot);
          if (!s) {
            toast(tr('Сохранение повреждено'));
            return;
          }
          this.closeMenuUi?.();
          this.startGame(s);
        }),
      onNew: () => {
        this.closeMenuUi?.();
        this.closeMenuUi = showCreation(
          (name, faction, difficulty, tutorial) => {
            const begin = (slot: number) => {
              this.closeMenuUi?.();
              const s = newGame(name, faction);
              s.slot = slot;
              s.difficulty = difficulty;
              // Обучение теперь — стартовое поручение (пролог)
              s.tutorial = { step: 0, off: true };
              if (tutorial) initPrologue(s);
              saveGame(s);
              this.startGame(s);
              toast(tr`${FACTIONS[faction].rulerTitle} ${FACTIONS[faction].ruler} принял вашу присягу`, 4000);
            };
            // Первый свободный слот, иначе — спросить, что перезаписать
            const free = listSlots().findIndex((x) => !x);
            if (free >= 0) begin(free + 1);
            else showSlots('new', begin);
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
    applyCrown(state);
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
    cam.setZoom(Math.max(this.minZoom(), 0.75 * DPR));
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
      skipTutorial: () => {
        this.state.tutorial = { step: this.state.tutorial?.step ?? 0, off: true };
        skipPrologue(this.state);
        this.commit();
      },
      showTarget: () => {
        const t = prologueTarget(this.state);
        if (t) this.cameras.main.pan(t.x, t.y, 500, 'Sine.easeInOut');
      },
    });
    this.updateLabels();
    this.updateHud();
    resetHints();
    hint(state, 'start');
    // Пролог: гонец с вестью о беде
    if (prologueStep(state) === 'intro') this.time.delayedCall(500, () => this.modal(() => openPrologueIntro(this)));
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

  /** Игра уходит в фон (свернули, выключили экран): сохранить, пока система её не закрыла. */
  saveOnHide() {
    if (this.mode === 'play' && this.state) this.commit();
  }

  /** Системная кнопка «Назад» вне окон. false — нечего делать, можно выходить из игры. */
  backPressed(): boolean {
    if (this.mode === 'play') {
      if (!this.inBattle) this.openGameMenu();
      return true;
    }
    const back = document.querySelector<HTMLElement>('.creation .btn.ghost');
    if (back) {
      back.click();
      return true;
    }
    return false;
  }

  private openGameMenu() {
    this.modal(() => {
      let close = () => {};
      const content = panel(
        'modal narrow',
        h('div', { class: 'head' }, h('h2', { class: 'title' }, tr('Меню')), btn('✕', () => close(), 'small close')),
        h(
          'div',
          { class: 'body options' },
          btn(tr('Продолжить'), () => close(), 'primary'),
          btn(tr('Сохранить'), () => {
            this.commit();
            toast(tr('Игра сохранена'));
            close();
          }),
          btn(tr('Как играть'), () => openHelp()),
          btn(tr('Достижения'), () => showAchievements()),
          btn(tr('Настройки'), () => showSettings(undefined, () => this.commit())),
          btn(tr('Выйти в главное меню'), () => {
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
        if (!this.dragging && Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) > 10 * DPR) this.dragging = true;
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
    const pad = (12 * DPR) / cam.zoom;
    let best: Settlement | null = null;
    let bestD = Infinity;
    for (const s of world.settlements) {
      if (s.type === 'village' && cam.zoom < 0.3 * DPR) continue;
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
      const verdict = r < 0.5 ? tr('слабее вас') : r < 0.9 ? tr('чуть слабее') : r < 1.2 ? tr('равны по силе') : tr('сильнее вас');
      this.tooltip.replaceChildren(
        h('b', { style: `color:${enemyDisplayColor(mp)}` }, mp.name),
        ` · ${partyCount(mp)} ⚔ · ${this.isHostile(mp) ? verdict : mp.faction === this.state.hero.faction ? tr('союзник') : tr('мир')}`,
        mp.kind === 'lord' ? h('div', { class: 'muted', style: 'font-size:12px' }, this.lordTask(mp)) : '',
      );
      this.tooltip.style.left = `${p.x / DPR + 14}px`;
      this.tooltip.style.top = `${p.y / DPR + 14}px`;
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
      rel === 'war' ? h('span', { style: 'color:#e07a6a' }, tr(' · война')) : '',
      isPlagued(this.state, s) ? h('span', { style: 'color:#9ab87a' }, tr(' · мор!')) : '',
    );
    this.tooltip.style.left = `${p.x / DPR + 14}px`;
    this.tooltip.style.top = `${p.y / DPR + 14}px`;
  }

  private onTap(x: number, y: number) {
    let mp = this.partyAt(x, y);
    // Союзный или мирный отряд, стоящий на поселении, не мешает войти в поселение
    if (mp && !this.isHostile(mp) && this.settlementAt(x, y)) mp = null;
    if (mp) {
      if (!this.isHostile(mp)) {
        toast(mp.kind === 'lord' ? tr`${mp.name} · ${partyCount(mp)} воинов · ${this.lordTask(mp)}` : tr`${mp.name}: мирный отряд`, 3000);
        return;
      }
      const c = worldToCell(mp.x, mp.y);
      this.goTo(c.cx, c.cy, null);
      this.targetParty = mp;
      this.targetRepath = 0;
      toast(tr`Преследуем: ${mp.name}`);
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
      toast(isWaterCell(i) ? tr('Слишком далеко от берега — корабли туда не ходят') : tr('Туда не пройти: непроходимые горы'));
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
      if (!quiet) toast(tr('Туда не найти дороги'));
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
      toast(tr`${s.name}: владения врага`);
      hint(this.state, 'enemy');
    }
    const open = () =>
      this.modal(() =>
        openSettlement(this, s, () => {
          this.state.visiting = undefined;
          this.commit();
        }),
      );
    // Пролог: сюжетная сцена перед входом
    if (!prologueOnArrive(this, s, open)) open();
  }

  // ───────────────────────── кадр ─────────────────────────

  update(_t: number, deltaMs: number) {
    if (this.mode !== 'play') return;
    const running = this.timeFlows();
    const moving = running && this.path.length > 0;
    // В пути мир живёт: изредка сохраняемся, чтобы не потерять дорогу, если телефон закроет игру
    if (running) {
      this.autosaveMs += deltaMs;
      if (this.autosaveMs > 20000) {
        this.autosaveMs = 0;
        this.commit();
      }
    }

    if (running) {
      const dtDays = (deltaMs / 1000 / SECONDS_PER_DAY) * this.speed;
      this.state.time += dtDays;
      let roadEvent: RoadEvent | null = null;
      while (Math.floor(this.state.time) > this.state.lastDay) {
        this.state.lastDay++;
        // В пути иногда случается дорожное событие (не чаще раза в пару дней)
        if (moving && !roadEvent && this.state.time - (this.state.lastEvent ?? -99) >= 2.5 && Math.random() < 0.3) roadEvent = pickEvent(this.state);
        dailyTick(this.state);
        dailySpawn(this.state);
        warDaily(this.state);
        for (const msg of questsDaily(this.state)) this.hud?.news(msg, '#ffd24a');
        for (const msg of plagueDaily(this.state)) this.hud?.news(msg, '#9ab87a');
        for (const msg of companionsDaily(this.state)) news(this.state, msg, 'party');
        for (const msg of prisonersDaily(this.state)) news(this.state, msg, 'party');
        for (const msg of fiefDaily(this.state)) this.hud?.news(msg, '#e8c04a');
        trainingDaily(this.state, partySkill(this.state, 'training'));
        this.commit();
      }
      if (roadEvent && !this.inBattle) {
        const ev = roadEvent;
        this.modal(() => openRoadEvent(this, ev));
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
    this.drawAmbient();

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
    this.drawQuestMark();

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
      if (this.modals === 0 && !this.inBattle) {
        for (const ev of prologueTick(st)) {
          if (ev.kind === 'victory') this.modal(() => openPrologueVictory(this));
          else {
            toast(tr('✔ Пролог: цель выполнена'), 2200);
            this.hud?.flashObjective();
            sfx.play('horn');
          }
          this.commit();
        }
      }
      for (const r of tutorialTick(st)) {
        toast(tr`Обучение: шаг выполнен! +${r.done.reward} ¤`, 3000);
        if (r.finished) toast(tr('Обучение пройдено. Дальше — сами. Удачи!'), 4000);
        this.commit();
      }
      for (const a of checkAchievements(st)) {
        toast(tr`★ Достижение: ${a.name}`, 4000);
        sfx.play('cheer');
      }
      // Лад музыки — по культуре ближайшего поселения
      let near = world.settlements[0];
      let nd = Infinity;
      for (const t of world.settlements) {
        if (t.type === 'village') continue;
        const d = Math.abs(t.x - this.party.x) + Math.abs(t.y - this.party.y);
        if (d < nd) {
          nd = d;
          near = t;
        }
      }
      music.setCulture(near.culture);
      this.updateSeason();
    }
  }

  /** Золотая стрелка над целью пролога; если цель за краем экрана — указатель у края. */
  private drawQuestMark() {
    const g = this.questMark;
    g.clear();
    const t = prologueTarget(this.state);
    if (!t) return;
    const cam = this.cameras.main;
    const k = Phaser.Math.Clamp(DPR / cam.zoom, 0.7, 4);
    const v = cam.worldView;
    const m = 34 * k;
    const inside = t.x > v.x + m && t.x < v.right - m && t.y - 90 * k > v.y && t.y < v.bottom - m;
    if (inside) {
      const bob = Math.sin(this.ringT * 4) * 5 * k;
      const place = typeof t.id === 'string' ? world.byId.get(t.id) : undefined;
      const lift = !place ? 44 : place.type === 'village' ? 50 : 84;
      const x = t.x;
      const y = t.y - lift * k + bob;
      g.lineStyle(3 * k, 0xffd24a, 0.8 + Math.sin(this.ringT * 4) * 0.2);
      g.strokeEllipse(t.x, t.y, 64 * k, 26 * k);
      g.fillStyle(0x1a1410, 1);
      g.fillTriangle(x - 14 * k, y - 3 * k, x + 14 * k, y - 3 * k, x, y + 17 * k);
      g.fillRect(x - 7 * k, y - 21 * k, 14 * k, 20 * k);
      g.fillStyle(0xffd24a, 1);
      g.fillTriangle(x - 10 * k, y - 1 * k, x + 10 * k, y - 1 * k, x, y + 12 * k);
      g.fillRect(x - 4 * k, y - 18 * k, 8 * k, 18 * k);
      return;
    }
    // Указатель у края экрана в сторону цели
    const cx = v.centerX;
    const cy = v.centerY;
    const dx = t.x - cx;
    const dy = t.y - cy;
    const sx = (v.width / 2 - m) / Math.max(1, Math.abs(dx));
    const sy = (v.height / 2 - m * 1.6) / Math.max(1, Math.abs(dy));
    const sc = Math.min(sx, sy);
    const px = cx + dx * sc;
    const py = cy + dy * sc;
    const a = Math.atan2(dy, dx);
    const pulse = 1 + Math.sin(this.ringT * 5) * 0.12;
    const tip = (r: number, ang: number) => ({ x: px + Math.cos(a + ang) * r * k * pulse, y: py + Math.sin(a + ang) * r * k * pulse });
    const p1 = tip(22, 0);
    const p2 = tip(16, 2.4);
    const p3 = tip(16, -2.4);
    g.fillStyle(0x1a1410, 0.9);
    g.fillCircle(px, py, 15 * k);
    g.fillStyle(0xffd24a, 1);
    g.fillTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
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
        v.badge.destroy();
        this.partySprites.delete(id);
      }
    }
    const z = this.cameras.main.zoom / DPR;
    const k = Phaser.Math.Clamp(1 / z, 0.6, 6);
    for (const p of list) {
      let v = this.partySprites.get(p.id);
      if (!v) {
        const s = this.add.sprite(p.x, p.y, this.partyTexture(p, 0)).setOrigin(0.5, 0.9).setScale(ART_SCALE * PARTY_K);
        const res = Math.min(3, window.devicePixelRatio || 1);
        const label = this.add
          .text(p.x, p.y + 6, '', { fontFamily: LABEL_FONT, fontStyle: '500', fontSize: p.kind === 'lord' ? '12.5px' : '11.5px', color: '#e8e0c8', stroke: '#1a1410', strokeThickness: 3 })
          .setOrigin(0, 0)
          .setResolution(res)
          .setDepth(9990);
        // Численность — на цветной плашке: зелёная — слабее вас, жёлтая — вровень, красная — сильнее
        const badge = this.add
          .text(p.x, p.y + 6, '', { fontFamily: LABEL_FONT, fontStyle: '700', fontSize: p.kind === 'lord' ? '12px' : '11px', color: '#ffffff', backgroundColor: '#555555', padding: { x: 3, y: 1 } })
          .setOrigin(0, 0)
          .setResolution(res)
          .setDepth(9991);
        v = { s, label, badge, frameT: 0, frame: 0, color: '', badgeColor: '' };
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
      v.label.setText(p.name).setScale(k);
      v.badge.setText(String(partyCount(p))).setScale(k);
      // Плашка слева от имени, вместе по центру отряда
      const bw = v.badge.width * k;
      const gap = 3 * k;
      const x0 = p.x - (bw + gap + v.label.width * k) / 2;
      const ty = p.y + 4;
      v.badge.setPosition(x0, ty + ((v.label.height - v.badge.height) * k) / 2);
      v.label.setPosition(x0 + bw + gap, ty);
    }
    // Подписи отрядов не налезают на подписи городов и друг на друга: сначала лорды, потом ближние к игроку.
    // Раскладка раз в 150 мс — дешевле для телефона.
    this.labelT += deltaMs;
    if (this.labelT < 150) return;
    this.labelT = 0;
    const placed = [...this.labelBoxes];
    const order = [...list].sort((a, b) => (a.kind === 'lord' ? 0 : 1) - (b.kind === 'lord' ? 0 : 1) || Math.hypot(a.x - this.party.x, a.y - this.party.y) - Math.hypot(b.x - this.party.x, b.y - this.party.y));
    for (const p of order) {
      const v = this.partySprites.get(p.id)!;
      const t = v.label;
      // Цвет плашки — по опасности отряда для героя
      const bc = this.threatColor(p);
      if (bc !== v.badgeColor) {
        v.badgeColor = bc;
        v.badge.setBackgroundColor(bc);
      }
      if (z <= 0.35) {
        t.setVisible(false);
        v.badge.setVisible(false);
        continue;
      }
      const box: [number, number, number, number] = [v.badge.x, t.y, t.x + t.width * k, t.y + t.height * k];
      const overlap = placed.some(([a0, b0, a1, b1]) => !(box[2] < a0 || box[0] > a1 || box[3] < b0 || box[1] > b1));
      t.setVisible(!overlap);
      v.badge.setVisible(!overlap);
      if (!overlap) placed.push(box);
    }
  }

  /** Плашка численности: свои — синие, мирные — серые, враги — от зелёного (слабее) до красного (сильнее). */
  private threatColor(p: MapParty): string {
    if (p.faction === this.state.hero.faction) return '#35608f';
    if (!this.isHostile(p)) return '#5b5850';
    const r = powerRatio(this.state, p);
    return r < 0.5 ? '#3d7a34' : r < 0.9 ? '#6b7a24' : r < 1.2 ? '#9a7418' : '#a3231d';
  }

  private partyAt(x: number, y: number): MapParty | null {
    const cam = this.cameras.main;
    const r = Math.max(40, (22 * DPR) / cam.zoom);
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

  /** Погода боя: в снегах часто метель, в пустыне сухо, по утрам у рек туман, иногда дождь. */
  private battleWeather(t: BattleTerrain | null): Weather | undefined {
    if (!t || t === 'desert') return undefined;
    const month = Math.floor(((this.state.time / 30.4) + 2) % 12); // 0 — январь
    const winter = month === 11 || month <= 1;
    const hr = (this.state.time % 1) * 24;
    if (t === 'snow') return Math.random() < 0.6 ? 'snow' : undefined;
    if (winter && t !== 'steppe' && t !== 'dry') return Math.random() < 0.35 ? 'snow' : undefined;
    const morning = hr >= 4 && hr < 10;
    if (Math.random() < (morning ? 0.3 : 0.06) * (nearRiver(this.party.x, this.party.y) ? 1.5 : 1)) return 'fog';
    return Math.random() < 0.18 ? 'rain' : undefined;
  }

  /** Условия поля боя: местность, ночь, брод через реку. */
  private battleOpts(extra: BattleOpts = {}): BattleOpts {
    const hr = (this.state.time % 1) * 24;
    const terrain = this.battleTerrain();
    return { terrain, night: hr >= 21 || hr < 5, ford: nearRiver(this.party.x, this.party.y), playerDamageK: diff(this.state.difficulty).taken, weather: this.battleWeather(terrain), ...extra };
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

  /** Воины будущего боя рисуются заранее: свой отряд, герой и враги (с подошедшими соседями). */
  private prewarmUnits(enemies: { troops: { id: string }[] }[]) {
    const hero = heroLook(this.state);
    const ids = new Set<string>([...this.state.party.troops.map((t) => t.id), ...enemies.flatMap((e) => e.troops.map((t) => t.id))]);
    const looks = [hero, { ...hero, mounted: false, heavy: false }, ...[...ids].filter((id) => TROOPS[id]).map((id) => troopLook(TROOPS[id]))];
    prewarmUnitLooks(this.textures, looks);
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
    this.prewarmUnits([p]);
    if (this.state.party.troops.reduce((s, t) => s + t.count, 0) === 0 && attacked) {
      // Героя без отряда разбойники просто грабят
      const lost = Math.floor(this.state.gold * 0.3);
      this.state.gold -= lost;
      p.calmUntil = this.state.time + 1;
      toast(tr`${p.name} ограбили вас: −${lost} ¤. Наймите воинов!`, 4000);
      this.commit();
      return;
    }
    // Разбойники в лесу, напавшие сами, часто устраивают засаду
    const ambush = attacked && p.faction === 'outlaw' && this.battleTerrain() === 'forest' && Math.random() < 0.6;
    // Кто рядом вступит в бой: союзные лорды за нас, лорды той же державы — за врага
    const allies = p.kind === 'bandits' || p.faction === 'outlaw' || p.kind === 'lord' || p.kind === 'patrol' ? alliesNear(this.state, this.party.x, this.party.y, 3) : [];
    // Лорды той же державы — за врага; шайки, стоящие вплотную, объединяются против героя
    const others = p.kind === 'lord' ? lordsNear(this.state, p.faction as FactionId, p.x, p.y, 3, p) : outlawsNear(this.state, p, 2.5);
    this.openEncounterDialog(p, attacked, allies, others, ambush);
  }

  private openEncounterDialog(p: MapParty, attacked: boolean, allies: MapParty[], others: MapParty[], ambush: boolean, duel?: DuelMods) {
    this.modal(() =>
      openEncounter(this.state, p, attacked, {
        fight: (f, mods) => this.startBattle(p, f, false, allies, others, ambush, mods),
        auto: (f, mods) => this.startBattle(p, f, true, allies, others, ambush, mods),
        duel: p.kind === 'lord' && !ambush ? () => this.duel(p, attacked, allies, others) : undefined,
        retreat: () => {
          const { lost } = retreat(this.state, p);
          for (const msg of companionDeed(this.state, 'retreat')) news(this.state, msg, 'party');
          if (lost.length) toast(tr`Отступили, но потеряли ${lost.reduce((s, l) => s + l.n, 0)} воинов арьергарда`, 3500);
          else toast(tr('Вы ушли от погони'));
          this.commit();
        },
      }, { allies, others, duel, ambush }),
    );
  }

  /** Поединок с лордом перед боем: только герой против вожака. */
  private duel(p: MapParty, attacked: boolean, allies: MapParty[], others: MapParty[]) {
    const f = p.faction as FactionId;
    const rank = p.lord?.rank ?? 1;
    const base = TROOPS[`${f}_${rank >= 2 ? 'c4m' : 'c3m'}`];
    const champion = { ...base, id: 'lordduel', name: p.name, hp: Math.round(base.hp * (1.4 + rank * 0.25)), damage: Math.round(base.damage * (1.1 + rank * 0.1)) };
    const me = playerArmy(this.state, 'classic');
    const battle = new Battle([
      { name: this.state.hero.name, culture: this.state.hero.faction, troops: [], hero: me.hero, formation: 'classic', morale: 100 },
      { name: p.name, culture: f, troops: [], hero: { name: p.name, level: 10, def: champion }, formation: 'classic', morale: 100 },
    ], 0, { terrain: this.battleTerrain(), noField: true });
    // Бойцы сходятся в середине поля
    for (const u of battle.units) u.x = u.side === 0 ? FIELD_W / 2 - 160 : FIELD_W / 2 + 160;
    this.runBattle(battle, false, { enemyName: p.name, enemyColor: enemyDisplayColor(p) }, (b) => {
      const hero = b.units.find((u) => u.isHero && u.side === 0);
      const won = b.winner === 0;
      const mods: DuelMods = won
        ? { ours: 10, theirs: -30, heroHp: Math.max(0.3, (hero?.hp ?? 1) / (hero?.maxHp ?? 1)), won }
        : { ours: -20, theirs: 10, heroHp: 0.35, won };
      news(this.state, won ? tr`${this.state.hero.name} одолел ${p.name} в поединке перед строем.` : tr`${p.name} одолел ${this.state.hero.name} в поединке.`, 'player');
      if (won) {
        gainHeroXp(this.state, 40);
        this.state.stats!.duels = (this.state.stats!.duels ?? 0) + 1;
      }
      this.openEncounterDialog(p, attacked, allies, others, false, mods);
    });
  }

  private startBattle(p: MapParty, formation: Formation, auto: boolean, allies: MapParty[] = [], others: MapParty[] = [], ambush = false, mods?: DuelMods) {
    const name = !others.length ? p.name : p.faction === 'outlaw' ? tr`${p.name} и другие шайки` : tr`${p.name} и союзники`;
    const enemy = enemyArmy(name, p.faction, others.length ? mergeTroops([p.troops, ...others.map((o) => o.troops)]) : p.troops);
    const mine = withAllies(playerArmy(this.state, formation), allies);
    if (mods) {
      mine.morale += mods.ours;
      enemy.morale = Math.max(20, enemy.morale + mods.theirs);
      if (mine.hero && mods.heroHp < 1) mine.hero = { ...mine.hero, def: { ...mine.hero.def, hp: Math.max(20, Math.round(mine.hero.def.hp * mods.heroHp)) } };
    }
    enemy.morale += diff(this.state.difficulty).enemyMorale;
    const battle = new Battle([mine, enemy], 0, this.battleOpts({ ambush, wagons: p.kind === 'caravan' ? 1 : undefined }));
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
      heroEmblem: heroEmblemURL(this.state),
      enemyName: view.enemyName,
      enemyColor: view.enemyColor,
      wall: view.wall,
      arena: view.arena,
      weather: view.arena ? undefined : battle.opts.weather,
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
    this.prewarmUnits([{ troops: garrison }, ...lords]);
    if (troopCount(garrison) + lords.reduce((n, l) => n + troopCount(l.troops), 0) === 0) {
      capture(this.state, s, this.state.hero.faction, true);
      (this.state.capturedByHero ??= []).push(s.id);
      this.state.stats!.captured = (this.state.stats!.captured ?? 0) + 1;
      if (takeOwnershipChanged()) this.refreshOwnership();
      toast(tr`${s.name} сдаётся без боя!`, 4000);
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
      toast(tr('В одиночку на стены не лезут. Наймите войско!'), 3500);
      return;
    }
    const owner = this.state.settlements[s.id].owner;
    const f = FACTIONS[owner];
    const { garrison, lords } = siegeDefenders(this.state, s);
    const def = enemyArmy(tr`Гарнизон: ${s.name}`, owner, mergeTroops([garrison, ...lords.map((l) => l.troops)]));
    def.morale = 115;
    const allies = alliesNear(this.state, s.x, s.y, 6);
    def.morale += diff(this.state.difficulty).enemyMorale;
    const battle = new Battle([withAllies(playerArmy(this.state, 'classic'), allies), def], 0, { siege: true, playerDamageK: diff(this.state.difficulty).taken, weather: this.battleWeather(this.battleTerrain()) });
    this.runBattle(battle, auto, { enemyName: s.name, enemyColor: f.css, wall: { culture: s.culture, color: f.css, color2: f.css2 } }, (b) => {
      const res = applySiege(this.state, b, s, garrison, lords, allies);
      this.afterBattle(res, tr`Гарнизон ${s.name}`);
    });
  }

  /** GameCtx: выйти на стены своей осаждённой крепости. */
  defendSiege(s: Settlement) {
    prewarmBattleTerrain(this.textures, [this.battleTerrain()]);
    const attackers = siegeAttackers(this.state, s);
    this.prewarmUnits(attackers);
    const sg = this.state.war?.sieges[s.id];
    if (!sg || !attackers.length) {
      toast(tr('Осаждающие уже ушли'), 2500);
      return;
    }
    const enemy = FACTIONS[sg.attacker];
    const n = attackers.reduce((k, l) => k + troopCount(l.troops), 0);
    const gar = troopCount(this.state.war!.garrisons[s.id] ?? []);
    this.modal(() => {
      let close = () => {};
      const content = panel(
        'modal narrow',
        h('div', { class: 'head' }, h('h2', { class: 'title' }, tr`Оборона: ${s.name}`), btn('✕', () => close(), 'small close')),
        h(
          'div',
          { class: 'body col' },
          h('div', { class: 'parch', style: 'font-size:13.5px;line-height:1.4' }, tr`Под стенами стоит войско державы «${enemy.short}»: ${attackers.map((l) => l.name).join(', ')} — около ${n} воинов. Гарнизон (${gar}) встанет на стены вместе с вашим отрядом. Лучники бьют со стены, пехота держит ворота.`),
          h(
            'div',
            { class: 'options' },
            btn(tr('На стены!'), () => { close(); this.defend(s, false); }, 'primary'),
            btn(tr('Автобой'), () => { close(); this.defend(s, true); }),
            btn(tr('Не сейчас'), () => close(), 'ghost'),
          ),
        ),
      );
      close = openModal(content);
    });
  }

  private defend(s: Settlement, auto: boolean) {
    const sg = this.state.war?.sieges[s.id];
    const attackers = siegeAttackers(this.state, s);
    if (!sg || !attackers.length) return;
    const f = FACTIONS[sg.attacker];
    const owner = FACTIONS[this.state.settlements[s.id].owner];
    const name = tr`Осаждающие: ${f.short}`;
    const att = enemyArmy(name, sg.attacker, mergeTroops(attackers.map((l) => l.troops)));
    att.morale = 105;
    const me = playerArmy(this.state, 'classic');
    me.troops = [...me.troops, ...(this.state.war!.garrisons[s.id] ?? []).map((t) => ({ id: t.id, count: t.count, key: `G|${t.id}` }))];
    me.morale += 10; // за стенами дух крепче
    att.morale += diff(this.state.difficulty).enemyMorale;
    const battle = new Battle([att, me], 1, { siege: true, playerDamageK: diff(this.state.difficulty).taken, weather: this.battleWeather(this.battleTerrain()) });
    this.runBattle(battle, auto, { enemyName: name, enemyColor: f.css, wall: { culture: s.culture, color: owner.css, color2: owner.css2 } }, (b) => {
      const res = applyDefense(this.state, b, s, attackers);
      this.afterBattle(res, name);
    });
  }

  /** GameCtx: разорить вражескую деревню (бой с ополчением). */
  startRaid(s: Settlement) {
    prewarmBattleTerrain(this.textures, [this.battleTerrain()]);
    if (isLooted(this.state, s.id)) {
      toast(tr('Здесь уже нечего брать'), 2500);
      return;
    }
    const militia = villageMilitia(s, this.state.time);
    const pseudo: MapParty = {
      id: -1,
      kind: 'patrol',
      name: tr`Ополчение: ${s.name}`,
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
        retreat: () => toast(tr('Вы оставили деревню в покое')),
      }),
    );
  }

  private raid(s: Settlement, militia: { id: string; count: number }[], formation: Formation, auto: boolean) {
    const owner = this.state.settlements[s.id].owner;
    const battle = new Battle([playerArmy(this.state, formation), enemyArmy(tr`Ополчение: ${s.name}`, owner, militia)], 0, this.battleOpts());
    this.runBattle(battle, auto, { enemyName: tr`Ополчение: ${s.name}`, enemyColor: FACTIONS[owner].css }, (b) => {
      const res = applyRaid(this.state, b, s, militia);
      this.afterBattle(res, tr`Ополчение ${s.name}`);
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
    if (info.task === 'campaign' && ts) return this.state.war?.sieges[ts.id] ? tr`осаждает ${placeName(ts)}` : tr`в походе на ${placeName(ts)}`;
    if (info.task === 'relieve' && ts) return tr`спешит на выручку: ${ts.name}`;
    if (info.task === 'follow') return tr`идёт с вашим отрядом ещё ${Math.max(1, Math.ceil((info.followUntil ?? 0) - this.state.time))} дн.`;
    return tr`стережёт свои земли (${world.byId.get(info.home)?.name ?? tr('дом')})`;
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

  // ───────────────────────── времена года и жизнь карты ─────────────────────────

  /** Насколько сейчас зима (0…1). */
  private winter(): number {
    const month = Math.floor(this.state.time / 30.4 + 2) % 12; // 0 — январь
    return ({ 11: 0.8, 0: 1, 1: 1, 2: 0.45, 10: 0.3 } as Record<number, number>)[month] ?? 0;
  }

  private updateSeason() {
    const w = this.mode === 'play' ? this.winter() : 0;
    if (w > 0 && !this.snowImg) {
      if (!this.textures.exists('snowcover')) this.textures.addCanvas('snowcover', drawSnowCover());
      this.snowImg = this.add.image(0, 0, 'snowcover').setOrigin(0).setScale(ART_SCALE).setDepth(-9.5);
    }
    if (this.snowImg) this.snowImg.setAlpha(w).setVisible(w > 0);
  }

  /** Дым из труб, огни в окнах ночью, птицы днём — только в видимой части карты. */
  private drawAmbient() {
    const g = this.ambient;
    g.clear();
    if (this.mode !== 'play') return;
    const cam = this.cameras.main;
    const v = cam.worldView;
    const now = this.time.now / 1000;
    const hr = (this.state.time % 1) * 24;
    const night = hr >= 20 || hr < 6;
    const winter = this.winter();
    const z = cam.zoom / DPR;
    for (const s of world.settlements) {
      if (s.type === 'village' && z < 0.45) continue;
      if (s.x < v.x - 200 || s.x > v.right + 200 || s.y < v.y - 100 || s.y > v.bottom + 300) continue;
      const img = this.settleSprites.get(s.id);
      if (!img) continue;
      const hh = hash01(s.cx * 31 + s.cy);
      const top = img.y - img.displayHeight * 0.72;
      // Дым: больше зимой и вечером
      const puffs = s.type === 'village' ? 1 : winter > 0.3 || night ? 3 : 2;
      for (let i = 0; i < puffs; i++) {
        const ph = (now * 0.22 + hh + i / puffs) % 1;
        const x = img.x + (hh - 0.5) * img.displayWidth * 0.5 + (i - 1) * 10 + Math.sin(ph * 4 + hh * 9) * 6 + ph * 22;
        const y = top - ph * 60;
        g.fillStyle(0x8a8580, (1 - ph) * 0.35);
        g.fillCircle(x + 2, y + 2, 5 + ph * 11);
        g.fillStyle(0xe8e4dc, (1 - ph) * 0.5);
        g.fillCircle(x, y, 5 + ph * 11);
      }
      // Огни ночью
      if (night) {
        const n = s.type === 'town' ? 6 : s.type === 'castle' ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const a = hash01(s.cx * 7 + i * 13 + s.cy);
          const b = hash01(s.cy * 11 + i * 5 + s.cx);
          const x = img.x + (a - 0.5) * img.displayWidth * 0.62;
          const y = img.y - img.displayHeight * (0.12 + b * 0.38);
          const fl = 0.75 + Math.sin(now * (3 + a * 4) + i) * 0.25;
          g.fillStyle(0xffc860, 0.18 * fl);
          g.fillCircle(x, y, 10);
          g.fillStyle(0xffd88a, fl);
          g.fillRect(Math.round(x) - 2, Math.round(y) - 3, 4, 5);
        }
      }
    }
    // Птицы: пара стай днём, не зимой
    if (!night && winter < 0.5) {
      g.lineStyle(Math.max(1.5, 2 / z), 0x2a2522, 0.8);
      for (let f = 0; f < 2; f++) {
        const t = ((now + f * 23) % 45) / 45;
        const bx = v.x - 150 + t * (v.width + 300);
        const by = v.y + v.height * (0.14 + f * 0.2) + Math.sin(t * 7 + f) * 30;
        for (let i = 0; i < 5; i++) {
          const ox = -Math.abs(i - 2) * 22 / Math.max(0.5, z) * 0.6;
          const oy = (i - 2) * 16 / Math.max(0.5, z) * 0.6;
          const flap = Math.sin(now * 9 + i) * 3;
          const sz = 7 / Math.max(0.5, z);
          const x = bx + ox;
          const y = by + oy;
          g.lineBetween(x - sz, y - flap, x, y);
          g.lineBetween(x, y, x + sz, y - flap);
        }
      }
    }
  }

  private updatePartyTexture(frame: number) {
    const { cx, cy } = worldToCell(this.party.x, this.party.y);
    const water = cx >= 0 && cy >= 0 && cx < GRID_W && cy < GRID_H && isWaterCell(cy * GRID_W + cx);
    const a = this.state.hero.arms;
    if (!water && a) {
      // Всадник героя в цветах личного герба
      const key = `rider_arms_${a.field}_${a.chargeColor}_${frame}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, drawRider(a.field, a.chargeColor, frame as 0 | 1, true));
      this.party.setTexture(key);
      return;
    }
    this.party.setTexture(`${water ? 'boat' : 'rider'}_${this.state.hero.faction}_player_${frame}`);
  }

  /** GameCtx: обновить облик отряда (после смены герба). */
  refreshHero() {
    this.updatePartyTexture(this.partyFrame);
    this.updateHud();
  }

  /** Подписи держат постоянный экранный размер; перекрывающиеся менее важные прячутся. */
  private updateLabels() {
    const z = this.cameras.main.zoom / DPR;
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
    const speedWord = cost < 0.95 ? tr('быстро') : cost < 1.1 ? tr('обычно') : cost < 2 ? tr('медленно') : tr('очень медленно');
    this.hud.update(this.state, this.path.length > 0 ? 'march' : this.waiting ? 'wait' : 'still', this.speed, `${TERRAIN_NAME[t] ?? ''} · ${speedWord}`);
  }
}

import type { Ability, Battle, Group, Order } from '../battle/sim';
import { FACTIONS, type FactionId } from '../data/factions';
import { emblemURL, portraitURL } from '../gfx/icons';
import { Pix } from '../gfx/pixel';
import { h, sfxClick, uiRoot } from './dom';

export interface BattleHudOpts {
  enemyName: string;
  enemyColor: string;
  heroFaction: FactionId;
  heroPortrait?: string;
  setSpeed(s: number): void;
  togglePause(): void;
  isPaused(): boolean;
  getSpeed(): number;
  autoFinish(): void;
  /** Приблизить (k>1) или отдалить (k<1) камеру. */
  zoom(k: number): void;
  arena?: boolean;
}

// ───────────── пиксельные иконки ─────────────

const iconCache = new Map<string, string>();
function icon(name: string, rows: string[], pal: Record<string, string>): string {
  let v = iconCache.get(name);
  if (!v) {
    const P = new Pix(16, 16);
    P.pattern(0, 0, rows, pal);
    P.outline('#140f0c');
    v = P.dataURL();
    iconCache.set(name, v);
  }
  return v;
}

const W = { w: '#e8e4da', s: '#b8bec6', d: '#6a7078', g: '#e8c04a', b: '#7a5332', r: '#c24040', c: '#d8d8d0', C: '#a8a8a0' };
const ICONS: Record<string, () => string> = {
  attack: () => icon('attack', [
    '................', '.............ww.', '............wws.', '...........wws..', '..........wws...', '.........wws....',
    '........wws.....', '.......wws......', '..g...wws.......', '..gg.wws........', '...ggws.........', '....gg..........',
    '...b.gg.........', '..b...g.........', '.b..............', '................',
  ], W),
  hold: () => icon('hold', [
    '................', '...ssssssssss...', '..sddddddddddds.', '..sdrrrrrrrrrds.', '..sdrrrgggrrrds.', '..sdrrrgggrrrds.',
    '..sdrrrgggrrrds.', '..sdrrrrrrrrrds.', '...sdrrrrrrrds..', '...sdrrrrrrrds..', '....sdrrrrrds...', '.....sdrrrds....',
    '......sdrds.....', '.......sds......', '........s.......', '................',
  ], W),
  retreat: () => icon('retreat', [
    '................', '................', '.....w..........', '....ww..........', '...wwwwwwwwww...', '..wwwwwwwwwwww..',
    '...wwwwwwwwwww..', '....ww.....www..', '.....w......ww..', '............ww..', '...........ww...', '..........ww....',
    '................', '................', '................', '................',
  ], W),
  volley: () => icon('volley', [
    '................', '..w.....w.....w.', '..ww....ww....ww', '...w.....w.....w', '...b.....b.....b', '....b.....b.....',
    '....b.....b.....', '.....b.....b....', '.....b.....b....', '......b.....b...', '......b.....b...', '.....cc....cc...',
    '.....c.....c....', '................', '................', '................',
  ], W),
  stakes: () => icon('stakes', [
    '................', '..c..........c..', '..bb........bb..', '...bb......bb...', '....bb....bb....', '.....bb..bb.....',
    '......bbbb......', '.......bb.......', '......bbbb......', '.....bb..bb.....', '....bb....bb....', '...bb......bb...',
    '..bb........bb..', '................', '................', '................',
  ], W),
  cry: () => icon('cry', [
    '................', '................', '..........gg....', '.........g.gg...', '........g...g...', '..ggggggg....g..',
    '.gggggggg....g..', 'gggggggggggggg..', '.gggggggg.......', '..ggggggg.......', '........b.......', '.......bb.......',
    '................', '...w..w..w......', '................', '................',
  ], W),
  smoke: () => icon('smoke', [
    '................', '.....cccc.......', '...cccccccc.....', '..cccCCcccccc...', '.ccccCCCcccccc..', '.ccccccccccCCcc.',
    'cccCCccccccCCCcc', 'ccCCCCcccccccccc', '.cccccccCCccccc.', '..cccccCCCcccc..', '....ccccccccc...', '......cccc......',
    '................', '................', '................', '................',
  ], W),
};

const ABILITIES: { id: Ability; name: string; hint: string }[] = [
  { id: 'volley', name: 'Залп', hint: 'Все стрелки стреляют разом, урон +30%' },
  { id: 'stakes', name: 'Колья', hint: 'Колья перед строем ранят и останавливают конницу' },
  { id: 'cry', name: 'Клич', hint: 'Боевой дух +20, урон +20% на 10 с, враг дрогнет' },
  { id: 'smoke', name: 'Дым', hint: 'Завеса: вражеские стрелки почти не попадают' },
];

const GROUPS: { id: Group | 'all'; name: string }[] = [
  { id: 'all', name: 'Все' },
  { id: 'hero', name: 'Герой' },
  { id: 'inf', name: 'Пехота' },
  { id: 'ranged', name: 'Стрелки' },
  { id: 'cav', name: 'Конница' },
];

const ORDER_NAME: Record<Order, string> = { attack: 'В атаку', hold: 'Стоять', retreat: 'Отступить' };

export class BattleHud {
  private root: HTMLElement;
  private moraleL = h('div', { class: 'fill l' });
  private moraleR = h('div', { class: 'fill r' });
  private countL = h('span', { class: 'cnt' });
  private countR = h('span', { class: 'cnt' });
  private cards = new Map<string, { el: HTMLElement; count: HTMLElement; bar: HTMLElement; badge: HTMLImageElement }>();
  private abil = new Map<Ability, { el: HTMLButtonElement; ch: HTMLElement; cd: HTMLElement }>();
  private orderBtns = new Map<Order, HTMLButtonElement>();
  private speedBtns: HTMLButtonElement[] = [];
  private pauseBtn: HTMLButtonElement;
  private bannerEl = h('div', { class: 'b-banner' });
  private selected: Group | 'all' = 'all';
  private totals: Record<string, number> = {};
  private bannerT = 0;
  private ctlBtn: HTMLButtonElement | null = null;
  private pad: HTMLElement | null = null;
  private knob = h('div', { class: 'joy-knob' });

  constructor(
    private b: Battle,
    private o: BattleHudOpts,
  ) {
    const ps = b.playerSide;
    const f = FACTIONS[o.heroFaction];
    const mine = [...b.units, ...b.reserves[ps]].filter((u) => u.side === ps);
    for (const g of GROUPS) this.totals[g.id] = g.id === 'all' ? mine.length : mine.filter((u) => u.group === g.id).length;

    const top = h(
      'div',
      { class: 'b-top' },
      h('div', { class: 'b-side' }, h('img', { src: emblemURL(o.heroFaction), class: 'px' }), h('div', { class: 'col', style: 'gap:0' }, h('b', {}, b.armies[ps].name), this.countL)),
      h(
        'div',
        { class: 'b-morale' },
        h('div', { class: 'track' }, this.moraleL, this.moraleR, h('div', { class: 'mid' })),
        h('div', { class: 'labels' }, h('span', {}, 'Боевой дух'), h('span', {}, 'Боевой дух')),
      ),
      h('div', { class: 'b-side r' }, h('div', { class: 'col', style: 'gap:0;align-items:flex-end' }, h('b', { style: `color:${o.enemyColor}` }, o.enemyName), this.countR)),
    );
    this.moraleL.style.background = f.css;
    this.moraleR.style.background = o.enemyColor;

    // Карточки групп
    const cardsBox = h('div', { class: 'b-cards' });
    for (const g of GROUPS) {
      if (g.id !== 'all' && !this.totals[g.id]) continue;
      const rep = g.id === 'all' || g.id === 'hero' ? null : mostCommon(mine.filter((u) => u.group === g.id).map((u) => u.troop.id));
      const count = h('div', { class: 'n' });
      const bar = h('div', { class: 'hp' }, h('div'));
      const badge = h('img', { class: 'badge px', src: ICONS.attack() }) as HTMLImageElement;
      const el = h(
        'div',
        { class: 'b-card', onclick: () => this.select(g.id) },
        h('img', { class: 'px face', src: rep ? portraitURL(rep) : g.id === 'hero' ? o.heroPortrait ?? portraitURL(`${o.heroFaction}_c3m`) : emblemURL(o.heroFaction) }),
        badge,
        h('div', { class: 'lbl' }, g.id === 'hero' && this.totals.hero > 1 ? 'Свита' : g.name),
        count,
        bar,
      );
      this.cards.set(g.id, { el, count, bar: bar.firstChild as HTMLElement, badge });
      cardsBox.append(el);
    }

    const ordersBox = h('div', { class: 'b-group' });
    for (const ord of ['attack', 'hold', 'retreat'] as Order[]) {
      const btn = h('button', { class: 'btn b-icon', title: ORDER_NAME[ord] }, h('img', { class: 'px', src: ICONS[ord]() }), h('span', {}, ORDER_NAME[ord])) as HTMLButtonElement;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        sfxClick();
        this.giveOrder(ord);
      });
      this.orderBtns.set(ord, btn);
      ordersBox.append(btn);
    }

    const abilBox = h('div', { class: 'b-group' });
    for (const a of ABILITIES) {
      const ch = h('span', { class: 'charges' });
      const cd = h('div', { class: 'cd' });
      const btn = h('button', { class: 'btn b-icon', title: a.hint }, h('img', { class: 'px', src: ICONS[a.id]() }), h('span', {}, a.name), ch, cd) as HTMLButtonElement;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.b.canUse(a.id)) return;
        sfxClick();
        this.b.use(a.id);
      });
      this.abil.set(a.id, { el: btn, ch, cd });
      abilBox.append(btn);
    }

    this.pauseBtn = h('button', { class: 'btn b-small' }, '❚❚') as HTMLButtonElement;
    this.pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sfxClick();
      o.togglePause();
    });
    const ctrl = h('div', { class: 'b-group col-ctrl' }, this.pauseBtn);
    for (const s of [1, 2, 3]) {
      const sb = h('button', { class: 'btn b-small' }, `×${s}`) as HTMLButtonElement;
      sb.addEventListener('click', (e) => {
        e.stopPropagation();
        sfxClick();
        o.setSpeed(s);
      });
      this.speedBtns.push(sb);
      ctrl.append(sb);
    }
    for (const [label, k, hint] of [['−', 0.85, 'Отдалить камеру'], ['+', 1.18, 'Приблизить камеру']] as [string, number, string][]) {
      const zb = h('button', { class: 'btn b-small', title: hint }, label) as HTMLButtonElement;
      zb.addEventListener('click', (e) => {
        e.stopPropagation();
        sfxClick();
        o.zoom(k);
      });
      ctrl.append(zb);
    }
    const auto = h('button', { class: 'btn b-small', title: 'Досчитать бой мгновенно' }, 'Автобой') as HTMLButtonElement;
    auto.addEventListener('click', (e) => {
      e.stopPropagation();
      sfxClick();
      o.autoFinish();
    });
    ctrl.append(auto);

    if (o.arena) abilBox.style.display = 'none';
    const bottom = h('div', { class: 'b-bottom' }, cardsBox, ordersBox, abilBox, ctrl);
    const extra: HTMLElement[] = [];
    if (b.units.some((u) => u.isHero && u.side === ps)) {
      this.ctlBtn = h('button', { class: 'btn b-ctl', title: 'Управлять героем самому: движение, удар, блок (WASD, J, K)' }, '⚔ Управлять героем') as HTMLButtonElement;
      this.ctlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sfxClick();
        this.setControl(!this.b.heroCtl.on);
      });
      this.pad = this.buildPad();
      extra.push(this.ctlBtn, this.pad);
    }
    this.root = h('div', { class: 'passthrough battle-ui' }, top, bottom, ...extra, this.bannerEl);
    uiRoot().append(this.root);
    this.select('all');
    // Режим управления героем запоминается между боями
    let remembered = false;
    try {
      remembered = localStorage.getItem('w1347_heroCtl') === '1';
    } catch {
      /* хранилище недоступно */
    }
    if (this.ctlBtn && remembered) this.setControl(true);
    this.update();
  }

  /** Включить или выключить ручное управление героем. */
  setControl(on: boolean) {
    const c = this.b.heroCtl;
    c.on = on;
    c.mx = c.my = 0;
    c.attack = c.tap = c.block = false;
    try {
      localStorage.setItem('w1347_heroCtl', on ? '1' : '0');
    } catch {
      /* хранилище недоступно */
    }
    this.banner(on ? 'Герой под вашим началом!' : 'Герой снова в строю');
    this.update();
  }

  /** Стик слева и кнопки «Удар» / «Блок» справа. */
  private buildPad(): HTMLElement {
    const c = this.b.heroCtl;
    const joy = h('div', { class: 'joy' }, this.knob);
    let id = -1;
    const move = (e: PointerEvent) => {
      const r = joy.getBoundingClientRect();
      const R = r.width / 2;
      let dx = (e.clientX - r.left - R) / R;
      let dy = (e.clientY - r.top - R) / R;
      const l = Math.hypot(dx, dy);
      if (l > 1) {
        dx /= l;
        dy /= l;
      }
      c.mx = dx;
      c.my = dy;
      this.knob.style.transform = `translate(${dx * R * 0.6}px, ${dy * R * 0.6}px)`;
    };
    const release = () => {
      id = -1;
      c.mx = c.my = 0;
      this.knob.style.transform = '';
    };
    joy.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      id = e.pointerId;
      joy.setPointerCapture(e.pointerId);
      move(e);
    });
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) move(e);
    });
    joy.addEventListener('pointerup', release);
    joy.addEventListener('pointercancel', release);
    const hold = (iconSrc: string, cls: string, title: string, down: () => void, up: () => void) => {
      const el = h('button', { class: `btn pad-btn ${cls}`, title }, h('img', { class: 'px', src: iconSrc, alt: title, draggable: 'false' })) as HTMLButtonElement;
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        el.classList.add('down');
        down();
      });
      const off = () => {
        el.classList.remove('down');
        up();
      };
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      return el;
    };
    const atk = hold(ICONS.attack(), 'atk', 'Удар (J)', () => {
      c.attack = true;
      c.tap = true;
    }, () => (c.attack = false));
    const blk = hold(ICONS.hold(), 'blk', 'Блок (K)', () => (c.block = true), () => (c.block = false));
    return h('div', { class: 'pad' }, joy, h('div', { class: 'pad-btns' }, blk, atk));
  }

  private select(g: Group | 'all') {
    this.selected = g;
    for (const [k, c] of this.cards) c.el.classList.toggle('sel', k === g);
    this.update();
  }

  private giveOrder(o: Order) {
    const ps = this.b.playerSide;
    const groups: Group[] = this.selected === 'all' ? ['hero', 'inf', 'ranged', 'cav'] : [this.selected];
    for (const g of groups) this.b.setOrder(ps, g, o);
    this.banner(`${this.selected === 'all' ? 'Все' : GROUPS.find((x) => x.id === this.selected)!.name}: ${ORDER_NAME[o].toLowerCase()}!`);
    this.update();
  }

  banner(text: string) {
    this.bannerEl.textContent = text;
    this.bannerEl.style.opacity = '1';
    this.bannerT = performance.now() + 1800;
  }

  update() {
    const b = this.b;
    const ps = b.playerSide;
    const es = (1 - ps) as 0 | 1;
    this.moraleL.style.width = `${(b.morale[ps] / b.maxMorale[ps]) * 50}%`;
    this.moraleR.style.width = `${(b.morale[es] / b.maxMorale[es]) * 50}%`;
    const alive = (side: 0 | 1) => b.active(side).length + (b.routed[side] ? 0 : b.reserves[side].length);
    this.countL.textContent = `${alive(ps)} ⚔`;
    this.countR.textContent = `${alive(es)} ⚔`;
    const mine = [...b.units.filter((u) => u.side === ps), ...b.reserves[ps]];
    for (const [g, c] of this.cards) {
      const list = g === 'all' ? mine : mine.filter((u) => u.group === g);
      const live = list.filter((u) => u.state !== 'dead' && u.state !== 'fled').length;
      c.count.textContent = `${live}/${this.totals[g]}`;
      c.bar.style.width = `${this.totals[g] ? (live / this.totals[g]) * 100 : 0}%`;
      c.el.classList.toggle('dead', live === 0);
      const ord = g === 'all' ? null : b.orders[ps][g as Group];
      c.badge.style.display = ord ? '' : 'none';
      if (ord) c.badge.src = ICONS[ord]();
    }
    const cur = this.selected === 'all' ? null : b.orders[ps][this.selected];
    for (const [o, btn] of this.orderBtns) btn.classList.toggle('active', o === cur);
    for (const [a, v] of this.abil) {
      const st = b.abilities[a];
      v.el.disabled = !b.canUse(a);
      v.ch.textContent = `${st.charges}`;
      v.cd.style.height = st.cd > 0 ? `${(st.cd / 12) * 100}%` : '0';
    }
    if (this.ctlBtn && this.pad) {
      const hero = b.units.find((u) => u.isHero && u.side === ps);
      const alive = !!hero && hero.state !== 'dead' && hero.state !== 'fled' && b.winner === null && !b.routed[ps];
      if (!alive && b.heroCtl.on) b.heroCtl.on = false;
      this.ctlBtn.style.display = alive ? '' : 'none';
      this.ctlBtn.classList.toggle('active', b.heroCtl.on);
      this.ctlBtn.textContent = b.heroCtl.on ? '✋ Отдать приказам' : '⚔ Управлять героем';
      this.pad.style.display = b.heroCtl.on ? '' : 'none';
    }
    this.pauseBtn.textContent = this.o.isPaused() ? '▶' : '❚❚';
    this.pauseBtn.classList.toggle('active', this.o.isPaused());
    this.speedBtns.forEach((s, i) => s.classList.toggle('active', this.o.getSpeed() === i + 1));
    if (this.bannerT && performance.now() > this.bannerT) {
      this.bannerEl.style.opacity = '0';
      this.bannerT = 0;
    }
  }

  destroy() {
    this.root.remove();
  }
}

function mostCommon(ids: string[]): string {
  const m = new Map<string, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  let best = ids[0];
  let n = 0;
  for (const [k, v] of m) if (v > n) { n = v; best = k; }
  return best;
}

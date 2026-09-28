import { FACTIONS } from '../data/factions';
import { heroPortraitURL } from '../gfx/icons';
import { partySize, totalReady } from '../game/logic';
import { dateString, timeOfDay, type GameState } from '../game/state';
import { btn, h, uiRoot } from './dom';

export interface HudActions {
  togglePause(): void;
  setSpeed(s: number): void;
  centerParty(): void;
  openParty(): void;
  openRealms(): void;
  openMenu(): void;
  openHero(): void;
  openChronicle(): void;
}

export class Hud {
  private root: HTMLElement;
  private date = h('span', { class: 'big' });
  private tod = h('span', { class: 'muted' });
  private gold = h('span', { class: 'gold big' });
  private men = h('span', { class: 'big' });
  private terrain = h('span', {});
  private pauseBtn: HTMLButtonElement;
  private partyBtn: HTMLButtonElement;
  private partyBadge = h('span', { class: 'badge-dot' });
  private heroBadge = h('span', { class: 'badge-dot' });
  private heroLine = h('span', {});
  private heroImg = h('img', { class: 'px emblem', style: 'width:32px;height:32px' }) as HTMLImageElement;
  private speedBtns: HTMLButtonElement[] = [];
  private pauseBanner = h('div', { class: 'pause-banner' }, 'ПАУЗА');
  private feed = h('div', { class: 'news-feed' });
  private night = h('div', { class: 'passthrough', style: 'position:fixed;inset:0;pointer-events:none;background:#10183a;opacity:0;transition:opacity 1s' });

  constructor(state: GameState, a: HudActions) {
    const f = FACTIONS[state.hero.faction];
    this.pauseBtn = btn('❚❚', () => a.togglePause(), '', false, 'Пауза (пробел)');
    this.partyBtn = btn('Отряд', () => a.openParty());
    this.partyBtn.append(this.partyBadge);
    for (const s of [1, 2, 4]) {
      this.speedBtns.push(btn(`×${s}`, () => a.setSpeed(s), 'small'));
    }
    this.root = h(
      'div',
      { class: 'passthrough', style: 'position:fixed;inset:0' },
      this.night,
      h(
        'div',
        { class: 'hud-top' },
        h('div', { class: 'hud-box', onclick: () => a.openHero(), style: 'cursor:pointer', title: 'Герой и снаряжение' }, this.heroImg, h('div', { class: 'col', style: 'gap:0' }, h('span', { class: 'big' }, state.hero.name, this.heroBadge), h('span', { class: 'muted', style: `font-size:12px;color:${f.css}` }, this.heroLine))),
        h('div', { class: 'hud-box' }, this.date, this.tod),
        h('div', { class: 'hud-box' }, this.gold, h('span', { class: 'muted' }, '·'), this.men),
      ),
      h('div', { class: 'hud-left' }, h('div', { class: 'hud-box', style: 'font-size:13px' }, this.terrain)),
      h(
        'div',
        { class: 'hud-bottom' },
        h('div', { class: 'hud-group' }, this.pauseBtn, ...this.speedBtns),
        h(
          'div',
          { class: 'hud-group' },
          btn('◎', () => a.centerParty(), 'icon', false, 'К отряду'),
          this.partyBtn,
          btn('Хроника', () => a.openChronicle()),
          btn('Державы', () => a.openRealms()),
          btn('☰', () => a.openMenu(), 'icon', false, 'Меню'),
        ),
      ),
      this.pauseBanner,
      this.feed,
    );
    uiRoot().append(this.root);
  }

  update(state: GameState, paused: boolean, speed: number, terrain: string) {
    this.date.textContent = dateString(state.time);
    this.tod.textContent = timeOfDay(state.time);
    this.gold.textContent = `${state.gold} ¤`;
    const n = partySize(state);
    this.men.textContent = `${n} ⚔`;
    this.terrain.textContent = terrain;
    const pts = state.hero.points ?? 0;
    this.heroBadge.textContent = pts ? `+${pts}` : '';
    this.heroBadge.style.display = pts ? '' : 'none';
    this.heroLine.textContent = `${FACTIONS[state.hero.faction].short} · ур. ${state.hero.level}`;
    const portrait = heroPortraitURL(state);
    if (this.heroImg.src !== portrait) this.heroImg.src = portrait;
    const ready = totalReady(state);
    this.partyBadge.textContent = ready ? `↑${ready}` : '';
    this.partyBadge.style.display = ready ? '' : 'none';
    this.pauseBtn.textContent = paused ? '▶' : '❚❚';
    this.pauseBtn.classList.toggle('active', paused);
    this.speedBtns.forEach((b, i) => b.classList.toggle('active', [1, 2, 4][i] === speed));
    this.pauseBanner.style.display = paused ? '' : 'none';
    // Ночь: плавно темнеет с 20 до 5 часов
    const hr = (state.time % 1) * 24;
    let dark = 0;
    if (hr >= 19 || hr < 6) {
      const x = hr >= 19 ? hr - 19 : hr + 5; // 0..11
      dark = Math.sin((x / 11) * Math.PI) * 0.32;
    }
    this.night.style.opacity = dark.toFixed(3);
  }

  /** Лента вестей под плашкой героя: последние 3, гаснут сами. */
  news(text: string, color: string) {
    const item = h('div', { class: 'news-item', style: `border-left-color:${color}` }, text);
    this.feed.prepend(item);
    while (this.feed.children.length > 3) this.feed.lastElementChild?.remove();
    setTimeout(() => item.classList.add('fade'), 7000);
    setTimeout(() => item.remove(), 8000);
  }

  setVisible(v: boolean) {
    this.root.style.display = v ? '' : 'none';
  }

  destroy() {
    this.root.remove();
  }
}

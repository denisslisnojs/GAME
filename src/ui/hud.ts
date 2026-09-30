import { FACTIONS } from '../data/factions';
import { heroXpToLevel } from '../game/battleResult';
import { heroPortraitURL } from '../gfx/icons';
import { partyLimit, partySize, totalReady } from '../game/logic';
import { dateString, timeOfDay, type GameState } from '../game/state';
import { btn, h, uiRoot } from './dom';
import { TUTORIAL, tutorialStep } from '../game/tutorial';
import { prologueObjective, prologueTarget } from '../game/prologue';
import { tr } from '../i18n';

export interface HudActions {
  toggleWait(): void;
  cycleSpeed(): void;
  centerParty(): void;
  openParty(): void;
  openRealms(): void;
  openMenu(): void;
  openHero(): void;
  openChronicle(): void;
  skipTutorial(): void;
  /** Показать на карте цель пролога. */
  showTarget(): void;
}

/** Состояние времени: отряд в пути, герой ждёт, или мир стоит. */
export type Flow = 'march' | 'wait' | 'still';

export class Hud {
  private root: HTMLElement;
  private date = h('span', { class: 'hud-date' });
  private dayTime = h('span', { class: 'hud-daytime' });
  private gold = h('b', { class: 'num gold' });
  private men = h('b', { class: 'num' });
  private captives = h('b', { class: 'num' });
  private captivesChip: HTMLElement;
  private terrain = h('span', { class: 'muted' });
  private waitBtn: HTMLButtonElement;
  private speedBtn: HTMLButtonElement;
  private partyBtn: HTMLButtonElement;
  private heroBtn: HTMLButtonElement;
  private partyBadge = h('span', { class: 'badge-dot' });
  private heroBadge = h('span', { class: 'badge-dot' });
  private heroBtnBadge = h('span', { class: 'badge-dot' });
  private heroLine = h('span', { class: 'hud-hero-sub' });
  private xpFill = h('div');
  private heroImg = h('img', { class: 'px hud-portrait' }) as HTMLImageElement;
  private feed = h('div', { class: 'news-feed' });
  private tutText = h('span', {});
  private tut: HTMLElement;
  private tutGo: HTMLButtonElement;
  private night = h('div', { class: 'passthrough', style: 'position:fixed;inset:0;pointer-events:none;background:#10183a;opacity:0;transition:opacity 1s' });

  constructor(state: GameState, a: HudActions) {
    this.waitBtn = btn(tr('⌛ Ждать'), () => a.toggleWait(), '', false, tr('Ждать на месте: время идёт (пробел)'));
    this.speedBtn = btn('×1', () => a.cycleSpeed(), 'small', false, tr('Скорость времени'));
    this.partyBtn = btn(tr('Отряд'), () => a.openParty());
    this.heroBtn = btn(tr('Герой'), () => a.openHero(), '', false, tr('Герой и снаряжение'));
    this.tutGo = btn('◎', () => a.showTarget(), 'small', false, tr('Показать на карте'));
    this.tut = h('div', { class: 'tut-card' }, this.tutText, this.tutGo, btn('✕', () => a.skipTutorial(), 'small ghost', false, tr('Пропустить обучение')));
    this.partyBtn.append(this.partyBadge);
    this.heroBtn.append(this.heroBtnBadge);
    // Показатель: крупное число и подпись под ним
    const chip = (value: HTMLElement, caption: string, title: string, onclick?: () => void) =>
      h('div', { class: `hud-chip${onclick ? ' tap' : ''}`, title, onclick }, value, h('span', { class: 'cap' }, caption));
    this.captivesChip = chip(this.captives, tr('пленных'), tr('Пленные в обозе: продать или завербовать'), () => a.openParty());
    this.root = h(
      'div',
      { class: 'passthrough', style: 'position:fixed;inset:0' },
      this.night,
      h(
        'div',
        { class: 'hud-top' },
        h(
          'div',
          { class: 'hud-cluster' },
          h(
            'div',
            { class: 'hud-box hud-hero', onclick: () => a.openHero(), title: tr('Герой и снаряжение') },
            this.heroImg,
            h('div', { class: 'col', style: 'gap:1px;min-width:0' }, h('span', { class: 'hud-hero-name' }, state.hero.name, this.heroBadge), this.heroLine, h('div', { class: 'hud-xp', title: tr('Опыт до следующего уровня') }, this.xpFill)),
          ),
          h(
            'div',
            { class: 'hud-box hud-stats' },
            chip(this.gold, tr('золото'), tr('Казна героя')),
            chip(this.men, tr('воинов'), tr('Отряд: открыть'), () => a.openParty()),
            this.captivesChip,
          ),
        ),
        h('div', { class: 'hud-box hud-when' }, this.date, this.dayTime),
      ),
      h('div', { class: 'hud-left' }, h('div', { class: 'hud-terrain' }, this.terrain), h('div', { class: 'hud-group' }, this.waitBtn, this.speedBtn)),
      this.tut,
      h(
        'div',
        { class: 'hud-bottom' },
        h(
          'div',
          { class: 'hud-group' },
          btn('◎', () => a.centerParty(), 'icon', false, tr('К отряду')),
          this.partyBtn,
          this.heroBtn,
          btn(tr('Хроника'), () => a.openChronicle()),
          btn(tr('Державы'), () => a.openRealms()),
          btn('☰', () => a.openMenu(), 'icon', false, tr('Меню')),
        ),
      ),
      this.feed,
    );
    uiRoot().append(this.root);
  }

  update(state: GameState, flow: Flow, speed: number, terrain: string) {
    this.date.textContent = dateString(state.time);
    const hour = (state.time % 1) * 24;
    this.dayTime.textContent = `${hour >= 6 && hour < 20 ? '☀' : '☾'} ${timeOfDay(state.time)}`;
    this.gold.textContent = `${state.gold} ¤`;
    this.men.textContent = `${partySize(state)}/${partyLimit(state)}`;
    const caps = (state.prisoners ?? []).reduce((n, t) => n + t.count, 0);
    this.captives.textContent = String(caps);
    this.captivesChip.style.display = caps ? '' : 'none';
    this.xpFill.style.width = `${Math.max(0, Math.min(100, (state.hero.xp / heroXpToLevel(state.hero.level)) * 100)).toFixed(1)}%`;
    this.terrain.textContent = flow === 'still' ? tr`${terrain} · время стоит` : terrain;
    const pts = state.hero.points ?? 0;
    const allPts = pts + (state.hero.skillPoints ?? 0);
    this.heroBadge.textContent = pts ? `+${pts}` : '';
    this.heroBadge.style.display = pts ? '' : 'none';
    this.heroBtnBadge.textContent = allPts ? `+${allPts}` : '';
    this.heroBtnBadge.style.display = allPts ? '' : 'none';
    this.heroLine.textContent = tr`${FACTIONS[state.hero.faction].short} · ур. ${state.hero.level}`;
    this.heroLine.style.color = FACTIONS[state.hero.faction].css;
    const portrait = heroPortraitURL(state);
    if (this.heroImg.src !== portrait) {
      this.heroImg.src = portrait;
      this.heroImg.className = 'px hud-portrait';
    }
    const ready = totalReady(state);
    this.partyBadge.textContent = ready ? `↑${ready}` : '';
    this.partyBadge.style.display = ready ? '' : 'none';
    this.waitBtn.textContent = flow === 'wait' ? tr('■ Стоп') : tr('⌛ Ждать');
    const obj = prologueObjective(state);
    const step = obj ? null : tutorialStep(state);
    this.tut.style.display = obj || step ? '' : 'none';
    this.tut.classList.toggle('prologue', !!obj);
    this.tutGo.style.display = obj && prologueTarget(state) ? '' : 'none';
    if (obj) {
      const txt = tr`Пролог ${obj.n}/${obj.total}: ${obj.text}`;
      if (this.tutText.textContent !== txt) this.tutText.textContent = txt;
    } else if (step) {
      const txt = tr`Обучение ${(state.tutorial?.step ?? 0) + 1}/${TUTORIAL.length}: ${step.text} (+${step.reward} ¤)`;
      if (this.tutText.textContent !== txt) this.tutText.textContent = txt;
    }
    this.waitBtn.classList.toggle('active', flow === 'wait');
    this.speedBtn.textContent = `×${speed}`;
    // Ночь: плавно темнеет с 20 до 5 часов
    const hr = (state.time % 1) * 24;
    let dark = 0;
    if (hr >= 19 || hr < 6) {
      const x = hr >= 19 ? hr - 19 : hr + 5; // 0..11
      dark = Math.sin((x / 11) * Math.PI) * 0.32;
    }
    this.night.style.opacity = dark.toFixed(3);
  }

  /** Новая цель пролога: карточка вспыхивает. */
  flashObjective() {
    this.tut.classList.remove('flash');
    void this.tut.offsetWidth;
    this.tut.classList.add('flash');
  }

  /** Лента вестей под плашкой героя: последние 2, гаснут сами. */
  news(text: string, color: string) {
    const item = h('div', { class: 'news-item', style: `border-left-color:${color}` }, text);
    this.feed.prepend(item);
    while (this.feed.children.length > 2) this.feed.lastElementChild?.remove();
    setTimeout(() => item.classList.add('fade'), 5000);
    setTimeout(() => item.remove(), 6000);
  }

  setVisible(v: boolean) {
    this.root.style.display = v ? '' : 'none';
  }

  destroy() {
    this.root.remove();
  }
}

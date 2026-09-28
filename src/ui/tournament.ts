import { Battle } from '../battle/sim';
import { FACTIONS } from '../data/factions';
import { ITEMS } from '../data/items';
import { TROOPS } from '../data/troops';
import { heroPortraitURL, itemIconURL, portraitURL } from '../gfx/icons';
import {
  duelArmies,
  duelOpponent,
  meleeArmies,
  resolveOthers,
  startTourney,
  TOURNEY_FEE,
  tourneyPrize,
  tourneyReady,
  type Tourney,
  type TourneyKind,
} from '../game/tournament';
import type { Settlement } from '../game/world';
import { btn, h, img, openModal, panel, plural, sfxCoins, toast } from './dom';
import type { GameCtx } from './panels';
import { tr } from '../i18n';

const ROUND_NAME = [tr('Четвертьфинал'), tr('Полуфинал'), tr('Финал')];

function arenaColors(s: Settlement): string[] {
  const f = FACTIONS[s.culture];
  return [f.css, f.css2, '#8a3a2a', '#3a5a8a', '#e8dcc0', '#5a7a3a', '#c8a040'];
}

export function openArena(ctx: GameCtx, s: Settlement, closeSettlement: () => void) {
  const { state } = ctx;
  let close = () => {};
  const wait = tourneyReady(state, s);
  let bet = 0;
  const betBtns: HTMLButtonElement[] = [];
  const betBox = h('div', { class: 'row', style: 'gap:4px;flex-wrap:wrap' }, h('span', { class: 'muted', style: 'font-size:13px' }, tr('Ставка на себя:')));
  for (const v of [0, 25, 50, 100, 200]) {
    const b = btn(v ? `${v} ¤` : tr('без ставки'), () => {
      bet = v;
      betBtns.forEach((x, i) => x.classList.toggle('active', [0, 25, 50, 100, 200][i] === v));
    }, 'small', state.gold < TOURNEY_FEE + v);
    b.classList.toggle('active', v === 0);
    betBtns.push(b);
    betBox.append(b);
  }

  const enroll = (kind: TourneyKind) => {
    if (state.gold < TOURNEY_FEE + bet) {
      toast(tr('Не хватает золота на взнос'));
      return;
    }
    const t = startTourney(state, s, kind, bet);
    ctx.commit();
    close();
    closeSettlement();
    sfxCoins();
    nextRound(ctx, s, t, 0);
  };

  const card = (kind: TourneyKind, title: string, text: string, prize: string) =>
    h(
      'div',
      { class: 'item col', style: 'align-items:stretch;gap:6px' },
      h('div', { class: 'name', style: 'font-size:17px' }, title),
      h('div', { class: 'muted', style: 'font-size:13px' }, text),
      h('div', { class: 'gold', style: 'font-size:13px' }, prize),
      btn(tr`Записаться · ${TOURNEY_FEE} ¤`, () => enroll(kind), 'primary', wait > 0),
    );

  const content = panel(
    'modal wide',
    h('div', { class: 'head' }, h('div', {}, h('h2', { class: 'title' }, tr`Ристалище: ${s.name}`), h('div', { class: 'muted', style: 'font-size:13px' }, wait ? tr`Следующий турнир через ${wait} ${plural(wait, tr('день'), tr('дня'), tr('дней'))}` : tr('Герольды созывают бойцов!'))), btn('✕', () => close(), 'small close')),
    h(
      'div',
      { class: 'body col' },
      h('div', { class: 'parch', style: 'font-size:13.5px' }, tr('Оружие затуплено, и насмерть здесь не бьются, но синяки и слава настоящие. Проигравший выбывает. Победителю — кошель золота и приз от устроителей.')),
      h(
        'div',
        { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px' },
        card('duel', tr('Поединки'), tr('Восемь бойцов, три круга один на один: четвертьфинал, полуфинал и финал. Соперники всё сильнее.'), tr('За круг: 40 ¤ · победа: 300 ¤ + приз · ставка ×4')),
        card('melee', tr('Схватка'), tr('Две команды по пять бойцов. Вы бьётесь в синей команде с четырьмя случайными союзниками.'), tr('Победа: 180 ¤ + приз · ставка ×2')),
      ),
      betBox,
    ),
  );
  close = openModal(content);
}

/** Окно перед кругом: сетка и соперник. */
function nextRound(ctx: GameCtx, s: Settlement, t: Tourney, roundsWon: number) {
  const { state } = ctx;
  if (t.kind === 'melee') {
    ctx.modal?.(() => {
      let close = () => {};
      const content = panel(
        'modal narrow',
        h('div', { class: 'head' }, h('h2', { class: 'title' }, tr('Схватка')), null),
        h('div', { class: 'body col' }, h('p', {}, tr('Трубят рога, команды выстраиваются друг против друга. Синие — ваши.')), h('div', { class: 'muted', style: 'font-size:13px' }, tr('Приказы группам работают как в обычном бою.'))),
        h('div', { class: 'row', style: 'justify-content:flex-end;gap:6px' }, btn(tr('Автобой'), () => { close(); fight(ctx, s, t, roundsWon, true); }), btn(tr('На ристалище!'), () => { close(); fight(ctx, s, t, roundsWon, false); }, 'primary')),
      );
      close = openModal(content, { closeOnBack: false });
    });
    return;
  }
  const opp = duelOpponent(t, s);
  const pairs = h('div', { class: 'col', style: 'gap:3px' });
  for (let k = 0; k < t.alive.length; k += 2) {
    const a = t.bracket[t.alive[k]];
    const b = t.bracket[t.alive[k + 1]];
    const mine = t.alive[k] === 0;
    pairs.append(h('div', { class: 'row', style: `gap:8px;font-size:13px;${mine ? 'color:#ffd24a' : ''}` }, h('span', {}, a.name), h('span', { class: 'muted' }, tr('против')), h('span', {}, b.name)));
  }
  ctx.modal?.(() => {
    let close = () => {};
    const content = panel(
      'modal',
      h('div', { class: 'head' }, h('div', {}, h('h2', { class: 'title' }, ROUND_NAME[t.round]), h('div', { class: 'muted', style: 'font-size:13px' }, tr`Поединки · ${s.name}`)), null),
      h(
        'div',
        { class: 'body col' },
        h(
          'div',
          { class: 'versus' },
          h('div', { class: 'col', style: 'align-items:center' }, img(heroPortraitURL(state), 'px', 'width:64px;height:64px'), h('b', { class: 'gold' }, state.hero.name), h('span', { class: 'muted', style: 'font-size:12px' }, tr`уровень ${state.hero.level}`)),
          h('div', { class: 'vs' }, 'VS'),
          h('div', { class: 'col', style: 'align-items:center' }, img(portraitURL(opp.troop), 'px', 'width:64px;height:64px'), h('b', { style: `color:${FACTIONS[opp.culture].css}` }, opp.name), h('span', { class: 'muted', style: 'font-size:12px' }, `${TROOPS[opp.troop].name} · ${FACTIONS[opp.culture].short}`)),
        ),
        t.log.length ? h('div', { class: 'muted', style: 'font-size:12px' }, tr`Прошлый круг: ${t.log.slice(-4).join('; ')}`) : null,
        h('div', { class: 'col-title' }, tr('Пары круга')),
        pairs,
      ),
      h('div', { class: 'row', style: 'justify-content:flex-end;gap:6px' }, btn(tr('Автобой'), () => { close(); fight(ctx, s, t, roundsWon, true); }), btn(tr('На ристалище!'), () => { close(); fight(ctx, s, t, roundsWon, false); }, 'primary')),
    );
    close = openModal(content, { closeOnBack: false });
  });
}

function fight(ctx: GameCtx, s: Settlement, t: Tourney, roundsWon: number, auto: boolean) {
  const { state } = ctx;
  const melee = t.kind === 'melee';
  const armies = melee ? meleeArmies(state, s) : duelArmies(state, duelOpponent(t, s));
  const battle = new Battle(armies, 0);
  const enemy = armies[1];
  const color = melee ? '#c24040' : FACTIONS[t.bracket[t.alive[1]].culture].css;
  ctx.runBattle?.(battle, auto, { enemyName: enemy.name, enemyColor: color, arena: { colors: arenaColors(s) } }, (b) => {
    const won = b.winner === 0;
    if (melee) {
      finish(ctx, s, t, won, won ? 1 : 0);
      return;
    }
    resolveOthers(t, won);
    if (!won) finish(ctx, s, t, false, roundsWon);
    else if (t.alive.length === 1) finish(ctx, s, t, true, roundsWon + 1);
    else nextRound(ctx, s, t, roundsWon + 1);
  });
}

function finish(ctx: GameCtx, s: Settlement, t: Tourney, won: boolean, roundsWon: number) {
  const { state } = ctx;
  const prize = tourneyPrize(state, t, won, t.kind === 'duel' ? roundsWon : 0);
  ctx.commit();
  if (prize.gold || prize.betWin) sfxCoins();
  const winner = t.kind === 'duel' ? t.bracket[t.alive[0]] : null;
  ctx.modal?.(() => {
    let close = () => {};
    const it = prize.item ? ITEMS[prize.item] : null;
    const content = panel(
      'modal',
      h('div', { class: `result-title ${won ? 'win' : 'lose'}` }, won ? tr('Слава!') : tr('Турнир окончен')),
      h('div', { class: 'gold', style: 'text-align:center;font-size:17px' }, prize.title),
      h(
        'div',
        { class: 'body col', style: 'gap:6px' },
        !won && winner && t.alive.length === 1 ? h('div', { class: 'muted' }, tr`Победитель турнира: ${winner.name}`) : null,
        prize.gold ? h('div', {}, tr`Награда: `, h('b', { class: 'gold' }, `+${prize.gold} ¤`)) : null,
        prize.betWin ? h('div', {}, tr`Выигрыш по ставке: `, h('b', { class: 'gold' }, `+${prize.betWin} ¤`)) : t.bet ? h('div', { style: 'color:#e07a6a' }, tr`Ставка проиграна: −${t.bet} ¤`) : null,
        it ? h('div', { class: 'row', style: 'gap:8px' }, img(itemIconURL(it, state.hero.faction)), h('span', {}, tr('Приз: '), h('b', { class: 'gold' }, it.name), h('span', { class: 'muted' }, tr(' · в сумке')))) : null,
        h('div', {}, tr`Опыт героя: +${prize.xp}`, prize.levelUp ? h('b', { class: 'gold' }, tr` · новый уровень ${state.hero.level}!`) : ''),
        t.log.length ? h('div', { class: 'muted', style: 'font-size:12px' }, t.log.join(' · ')) : null,
      ),
      h('div', { class: 'row', style: 'justify-content:flex-end' }, btn(tr('Продолжить'), () => close(), 'primary')),
    );
    close = openModal(content, { closeOnBack: false, onClose: () => ctx.visit?.(s) });
  });
}

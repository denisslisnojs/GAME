// Таверна в городе: спутники, которых можно позвать в отряд.

import { SKILL_BY_ID, type SkillId } from '../data/skills';
import { FACTIONS } from '../data/factions';
import { companionsAt, hireCompanion, inParty } from '../game/companions';
import type { Settlement } from '../game/world';
import { companionPortraitURL } from '../gfx/icons';
import { btn, h, img, openModal, panel, sfxCoins, stars, toast } from './dom';
import { troopStats, type GameCtx } from './panels';
import { TROOPS } from '../data/troops';
import { portraitURL } from '../gfx/icons';
import { companionRumors, diceLeft, hireMercs, mercsAt, rollDice } from '../game/tavern';
import { rumor } from './nobles';
import { lordRansom, ransomLord, ransomPrice, sellPrisoners } from '../game/prisoners';

const DIE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function skillLine(skills: Partial<Record<SkillId, number>>): string {
  return (Object.entries(skills) as [SkillId, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${SKILL_BY_ID[id].name} ${n}`)
    .join(' · ');
}

export function openTavern(ctx: GameCtx, s: Settlement) {
  const { state } = ctx;
  (state.flags ??= {}).tavern = true;
  let close = () => {};
  const body = h('div', { class: 'list' });
  const side = h('div', { class: 'list' });
  const sub = h('div', {});
  const talk = h('div', { class: 'parch', style: 'font-size:13.5px;line-height:1.4;min-height:54px' }, 'Хозяин кивает на свободную лавку. Пахнет элем, дымом и жареной бараниной.');
  const diceBox = h('div', { class: 'dice-box' });
  let lastRoll: ReturnType<typeof rollDice> = null;
  let lastBet = 0;

  const render = () => {
    sub.replaceChildren(h('span', { class: 'gold' }, `${state.gold} ¤`), ` · спутников в отряде: ${inParty(state).length}`);
    body.replaceChildren();
    const here = companionsAt(state, s.id);
    body.append(h('div', { class: 'col-title' }, 'За столами'));
    if (!here.length) {
      body.append(h('div', { class: 'parch', style: 'font-size:13.5px' }, 'Сегодня здесь только местные пьяницы да хозяин, протирающий кружки. Спутники кочуют из города в город — загляните в другую таверну.'));
    }
    for (const { def } of here) {
      const can = state.gold >= def.price;
      body.append(
        h(
          'div',
          { class: 'item' },
          img(companionPortraitURL(def.id), 'px portrait'),
          h(
            'div',
            { class: 'grow col', style: 'gap:2px' },
            h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, h('span', { class: 'name gold' }, def.name), h('span', { class: 'muted', style: 'font-size:12px' }, `${def.title} · ${FACTIONS[def.culture].short}`)),
            h('div', { class: 'sub' }, def.bio),
            h('div', { style: 'font-size:12.5px;font-style:italic;color:#e8dcc0' }, `«${def.greet}»`),
            h('div', { class: 'stats' }, h('span', { class: 'gold' }, skillLine(def.skills)), h('span', {}, `жалованье ${def.wage} ¤/нед.`)),
          ),
          h(
            'div',
            { class: 'col', style: 'align-items:flex-end;gap:4px' },
            h('span', { class: 'gold' }, `${def.price} ¤`),
            btn('Позвать в отряд', () => {
              if (hireCompanion(state, def.id)) {
                sfxCoins();
                toast(`${def.name} присоединился к отряду`);
                ctx.commit();
              } else toast('Не хватает денег');
              render();
            }, 'small primary', !can),
          ),
        ),
      );
    }
    body.append(h('div', { class: 'muted', style: 'font-size:12px;padding:4px' }, 'Спутники бьются рядом с героем, не гибнут, а получают раны, и дают отряду свои умения. У каждого свой нрав: следите, что им по душе, и платите жалованье по воскресеньям.'));

    // Наёмники
    const m = mercsAt(state, s);
    const t = TROOPS[m.id];
    body.append(h('div', { class: 'col-title', style: 'margin-top:6px' }, 'Наёмный отряд'));
    const doHire = (n: number) => {
      const got = hireMercs(state, s, n);
      if (got) {
        sfxCoins();
        toast(`Нанято: ${t.name} ×${got}`);
        ctx.commit();
      } else toast('Не хватает денег');
      render();
    };
    body.append(
      m.count > 0
        ? h(
            'div',
            { class: 'item' },
            img(portraitURL(m.id), 'px portrait'),
            h('div', { class: 'grow col', style: 'gap:2px' }, h('div', { class: 'row', style: 'gap:8px' }, h('span', { class: 'name' }, t.name), h('span', { class: 'stars' }, stars(t.tier)), t.line === 'cavalry' ? h('span', { class: 'muted', style: 'font-size:12px' }, 'конница') : null), h('div', { class: 'sub' }, t.description), troopStats(t)),
            h(
              'div',
              { class: 'col', style: 'align-items:flex-end;gap:4px' },
              h('div', {}, h('span', { class: 'count' }, m.count), h('span', { class: 'muted', style: 'font-size:12px' }, ' готовы')),
              h('div', { class: 'gold', style: 'font-size:13px' }, `${t.hireCost} ¤ за бойца`),
              h('div', { class: 'row', style: 'gap:4px' }, btn('+1', () => doHire(1), 'small', state.gold < t.hireCost), btn('Всех', () => doHire(m.count), 'small primary', state.gold < t.hireCost)),
            ),
          )
        : h('div', { class: 'muted', style: 'padding:4px' }, `Наёмники разобраны. Новые придут через ${Math.max(1, Math.ceil(m.until - state.time))} дн.`),
    );
    body.append(h('div', { class: 'muted', style: 'font-size:12px;padding:4px' }, 'Наёмники сразу опытны, но не повышаются и стоят дорого.'));

    // Торговец выкупом
    const pris = state.prisoners ?? [];
    const lords = state.captives ?? [];
    if (pris.length || lords.length) {
      body.append(h('div', { class: 'col-title', style: 'margin-top:6px' }, 'Торговец выкупом'));
      for (const c of lords) {
        body.append(
          h('div', { class: 'item' }, h('div', { class: 'grow col', style: 'gap:2px' }, h('span', { class: 'name gold' }, c.name), h('div', { class: 'sub' }, 'Родня пленника заплатит, чтобы вернуть его домой.')), btn(`Выкуп ${lordRansom(c)} ¤`, () => { const g = ransomLord(state, c); sfxCoins(); toast(`Получено ${g} ¤ выкупа`); ctx.commit(); render(); }, 'small primary')),
        );
      }
      for (const p of pris) {
        const pt = TROOPS[p.id];
        body.append(
          h(
            'div',
            { class: 'item' },
            img(portraitURL(p.id), 'px portrait'),
            h('div', { class: 'grow col', style: 'gap:2px' }, h('span', { class: 'name' }, `${pt.name} ×${p.count}`), h('div', { class: 'sub' }, `${ransomPrice(p.id)} ¤ за голову`)),
            btn(`Продать всех · ${ransomPrice(p.id) * p.count} ¤`, () => { const g = sellPrisoners(state, p.id, p.count); sfxCoins(); toast(`Пленные проданы: +${g} ¤`); ctx.commit(); render(); }, 'small'),
          ),
        );
      }
    }

    // Разговоры и кости
    side.replaceChildren(
      h('div', { class: 'col-title' }, 'Разговоры'),
      talk,
      btn('Послушать, о чём болтают', () => {
        const pool = [...companionRumors(state, s)];
        const r = rumor(ctx, s);
        if (r) pool.push(...r.split(/(?<=\.)\s+/).filter((x) => x.length > 8));
        talk.textContent = pool.length ? `«${pool[Math.floor(Math.random() * pool.length)]}»` : '«Тихо нынче. Даже сборщики податей не заходят».';
      }, 'small'),
      h('div', { class: 'col-title', style: 'margin-top:8px' }, 'Кости'),
      diceBox,
    );
    const left = diceLeft(state);
    diceBox.replaceChildren(
      h('div', { class: 'muted', style: 'font-size:12.5px' }, 'Три кости против кабацкого игрока: у кого больше очков, тот и забирает ставку.'),
      lastRoll
        ? h(
            'div',
            { class: 'dice-row' },
            h('div', { class: 'col', style: 'align-items:center;gap:0' }, h('span', { class: 'dice' }, lastRoll.me.map((d) => DIE[d - 1]).join('')), h('span', { class: 'muted small' }, `вы: ${lastRoll.me.reduce((a, b) => a + b, 0)}`)),
            h('b', { class: lastRoll.win > 0 ? 'gold' : '', style: lastRoll.win < 0 ? 'color:#e07a6a' : '' }, lastRoll.win > 0 ? `+${lastBet} ¤` : lastRoll.win < 0 ? `−${lastBet} ¤` : 'ничья'),
            h('div', { class: 'col', style: 'align-items:center;gap:0' }, h('span', { class: 'dice' }, lastRoll.them.map((d) => DIE[d - 1]).join('')), h('span', { class: 'muted small' }, `он: ${lastRoll.them.reduce((a, b) => a + b, 0)}`)),
          )
        : '',
      h(
        'div',
        { class: 'row', style: 'gap:4px;flex-wrap:wrap' },
        ...[10, 50, 200].map((bet) =>
          btn(`Ставка ${bet} ¤`, () => {
            const r = rollDice(state, bet);
            if (!r) return;
            lastRoll = r;
            lastBet = bet;
            if (r.win > 0) sfxCoins();
            ctx.commit();
            render();
          }, 'small', left <= 0 || state.gold < bet),
        ),
      ),
      h('div', { class: 'muted', style: 'font-size:12px' }, left > 0 ? `Игрок согласен ещё на ${left} кона сегодня.` : 'Игрок устал и ушёл спать. Приходите завтра.'),
    );
  };

  const content = panel(
    'modal wide',
    h('div', { class: 'head' }, h('div', {}, h('h2', { class: 'title' }, `Таверна — ${s.name}`), h('div', { class: 'muted', style: 'font-size:13px' }, sub)), btn('✕', () => close(), 'small close')),
    h('div', { class: 'body tavern-layout' }, body, side),
  );
  render();
  close = openModal(content);
}

// Таверна в городе: спутники, которых можно позвать в отряд.

import { SKILL_BY_ID, type SkillId } from '../data/skills';
import { FACTIONS } from '../data/factions';
import { companionsAt, hireCompanion, inParty } from '../game/companions';
import type { Settlement } from '../game/world';
import { companionPortraitURL } from '../gfx/icons';
import { btn, h, img, openModal, panel, sfxCoins, toast } from './dom';
import type { GameCtx } from './panels';

export function skillLine(skills: Partial<Record<SkillId, number>>): string {
  return (Object.entries(skills) as [SkillId, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${SKILL_BY_ID[id].name} ${n}`)
    .join(' · ');
}

export function openTavern(ctx: GameCtx, s: Settlement) {
  const { state } = ctx;
  let close = () => {};
  const body = h('div', { class: 'body list' });
  const sub = h('div', {});

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
  };

  const content = panel(
    'modal',
    h('div', { class: 'head' }, h('div', {}, h('h2', { class: 'title' }, `Таверна — ${s.name}`), h('div', { class: 'muted', style: 'font-size:13px' }, sub)), btn('✕', () => close(), 'small close')),
    body,
  );
  render();
  close = openModal(content);
}

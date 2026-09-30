// Редактор личного герба: поле, деление, второй цвет, фигура и её цвет.

import { FACTIONS } from '../data/factions';
import { armsURL, CHARGES, DEFAULT_ARMS, DIVISIONS, TINCTURES, type Arms } from '../gfx/heraldry';
import { hex } from '../gfx/color';
import { btn, h, img, openModal, panel, toast } from './dom';
import type { GameCtx } from './panels';
import { tr } from '../i18n';

export function openArmsEditor(ctx: GameCtx, onDone?: () => void) {
  const { state } = ctx;
  const f = FACTIONS[state.hero.faction];
  const a: Arms = { ...(state.hero.arms ?? DEFAULT_ARMS(hex(f.color), hex(f.color2))) };
  let close = () => {};
  const preview = h('div', { class: 'arms-preview' });
  const controls = h('div', { class: 'col', style: 'gap:6px' });

  const swatches = (label: string, key: 'field' | 'field2' | 'chargeColor') =>
    h(
      'div',
      { class: 'row', style: 'gap:4px;flex-wrap:wrap;align-items:center' },
      h('span', { class: 'muted small', style: 'min-width:92px' }, label),
      ...TINCTURES.map((t) => {
        const b = h('button', { class: `swatch${a[key] === t.c ? ' on' : ''}`, title: t.name, style: `background:${t.c}` }) as HTMLButtonElement;
        b.addEventListener('click', () => {
          a[key] = t.c;
          render();
        });
        return b;
      }),
    );

  const choice = <T extends string>(label: string, list: { id: T; name: string }[], get: () => T, set: (v: T) => void) =>
    h(
      'div',
      { class: 'row', style: 'gap:4px;flex-wrap:wrap;align-items:center' },
      h('span', { class: 'muted small', style: 'min-width:92px' }, label),
      ...list.map((x) => btn(x.name, () => { set(x.id); render(); }, `small${get() === x.id ? ' primary' : ''}`)),
    );

  const render = () => {
    preview.replaceChildren(img(armsURL(a), 'px', 'width:128px;height:144px'), h('div', { class: 'muted small', style: 'text-align:center;margin-top:4px' }, tr('Герб на щите героя, на знамени отряда и в бою')));
    controls.replaceChildren(
      swatches(tr('Поле'), 'field'),
      choice(tr('Деление'), DIVISIONS, () => a.division, (v) => (a.division = v)),
      a.division !== 'plain' ? swatches(tr('Второй цвет'), 'field2') : '',
      choice(tr('Фигура'), CHARGES, () => a.charge, (v) => (a.charge = v)),
      a.charge !== 'none' ? swatches(tr('Цвет фигуры'), 'chargeColor') : '',
    );
  };

  const content = panel(
    'modal wide',
    h('div', { class: 'head' }, h('div', {}, h('h2', { class: 'title' }, tr('Личный герб')), h('div', { class: 'muted', style: 'font-size:13px' }, tr('Правило геральдики: не кладите цвет на цвет — металл (золото, серебро) на финифть смотрится лучше.'))), btn('✕', () => close(), 'small close')),
    h('div', { class: 'body arms-layout' }, preview, controls),
    h(
      'div',
      { class: 'row', style: 'justify-content:flex-end;gap:6px' },
      state.hero.arms ? btn(tr('Вернуть знамя державы'), () => { state.hero.arms = undefined; ctx.commit(); ctx.refreshHero?.(); close(); onDone?.(); toast(tr('Снова под знаменем державы')); }, 'ghost') : null,
      btn(tr('Утвердить герб'), () => { state.hero.arms = { ...a }; ctx.commit(); ctx.refreshHero?.(); close(); onDone?.(); toast(tr('Герб утверждён')); }, 'primary'),
    ),
  );
  render();
  close = openModal(content);
}

// Окно дорожного события: рассказ, выбор, последствия.

import type { RoadEvent } from '../game/events';
import { markEvent } from '../game/events';
import { btn, h, openModal, panel } from './dom';
import type { GameCtx } from './panels';
import { tr } from '../i18n';

export function openRoadEvent(ctx: GameCtx, ev: RoadEvent) {
  const { state } = ctx;
  let close = () => {};
  markEvent(state, ev);
  const story = h('div', { class: 'parch event-text' }, ev.text(state));
  const options = h('div', { class: 'options' });
  for (const o of ev.options) {
    const can = !o.can || o.can(state);
    const frag = document.createDocumentFragment();
    frag.append(h('span', {}, o.label), h('span', { class: 'hint' }, o.hint ?? ''));
    options.append(
      btn(frag, () => {
        const outcome = o.run(state);
        ctx.commit();
        story.replaceChildren(...outcome.split('\n\n').map((p, i) => h('p', { style: i ? 'color:#5a3a6a;margin-top:6px' : '' }, p)));
        options.replaceChildren(btn(tr('Продолжить путь'), () => close(), 'primary'));
      }, '', !can),
    );
  }
  const content = panel(
    'modal narrow event-modal',
    h('div', { class: 'head' }, h('h2', { class: 'title' }, ev.title)),
    h('div', { class: 'body col' }, story, options),
  );
  close = openModal(content, { closeOnBack: false });
}

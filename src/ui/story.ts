// Сюжетное окно: портрет собеседника, рассказ и варианты ответа.

import { btn, h, img, openModal, panel } from './dom';

export interface StoryOption {
  label: string;
  hint?: string;
  primary?: boolean;
  run?: () => void;
}

export interface Story {
  title: string;
  portrait?: string;
  /** Абзацы; строки, начинающиеся с «—», — реплики. */
  text: string[];
  /** Мелким шрифтом внизу: награды, подсказки. */
  note?: string;
  options: StoryOption[];
  onClose?: () => void;
}

export function openStory(s: Story): () => void {
  let close = () => {};
  const story = h(
    'div',
    { class: 'parch event-text story-text' },
    ...s.text.map((p) => h('p', { class: p.startsWith('—') ? 'say' : '' }, p)),
    s.note ? h('p', { class: 'note' }, s.note) : null,
  );
  const options = h('div', { class: 'options' });
  for (const o of s.options) {
    const frag = document.createDocumentFragment();
    frag.append(h('span', {}, o.label), h('span', { class: 'hint' }, o.hint ?? ''));
    options.append(
      btn(frag, () => {
        o.run?.();
        close();
      }, o.primary ? 'primary' : ''),
    );
  }
  const content = panel(
    'modal narrow event-modal story-modal',
    h('div', { class: 'head' }, h('h2', { class: 'title' }, s.title)),
    h('div', { class: 'body col' }, h('div', { class: 'row story-row' }, s.portrait ? img(s.portrait, 'px story-face') : null, story), options),
  );
  close = openModal(content, { closeOnBack: false, onClose: s.onClose });
  return close;
}

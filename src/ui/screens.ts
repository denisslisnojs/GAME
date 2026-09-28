import { music } from '../audio/music';
import { SETTINGS_KEY } from '../config';
import { FACTIONS, FACTION_IDS, type FactionId } from '../data/factions';
import { emblemURL, portraitURL } from '../gfx/icons';
import { btn, getSfxVolume, h, img, openModal, panel, setSfxVolume, uiRoot } from './dom';
import { DIFFICULTY, type Difficulty } from '../game/difficulty';
import { ACHIEVEMENTS, unlocked } from '../game/achievements';
import { dateString, listSlots, deleteSlot } from '../game/state';

// ───────────────────────── достижения ─────────────────────────

export function showAchievements() {
  let close = () => {};
  const got = unlocked();
  const n = ACHIEVEMENTS.filter((a) => got[a.id]).length;
  const list = h('div', { class: 'body list' });
  for (const a of ACHIEVEMENTS) {
    const on = !!got[a.id];
    list.append(
      h('div', { class: `item ach${on ? ' on' : ''}` }, h('span', { class: 'ach-icon' }, on ? '★' : '☆'), h('div', { class: 'grow col', style: 'gap:1px' }, h('span', { class: 'name' }, a.name), h('span', { class: 'sub' }, a.desc)), on ? h('span', { class: 'muted small' }, new Date(got[a.id]).toLocaleDateString()) : null),
    );
  }
  const content = panel('modal', h('div', { class: 'head' }, h('div', {}, h('h2', { class: 'title' }, 'Достижения'), h('div', { class: 'muted', style: 'font-size:13px' }, `Открыто ${n} из ${ACHIEVEMENTS.length}. Достижения общие для всех партий.`)), btn('✕', () => close(), 'small close')), list);
  close = openModal(content);
}

// ───────────────────────── слоты ─────────────────────────

/** Выбор слота: загрузить (mode 'load') или куда записать новую игру (mode 'new'). */
export function showSlots(mode: 'load' | 'new', onPick: (slot: number) => void) {
  let close = () => {};
  const body = h('div', { class: 'body list' });
  const render = () => {
    body.replaceChildren();
    listSlots().forEach((info, i) => {
      const slot = i + 1;
      const f = info ? FACTIONS[info.faction] : null;
      body.append(
        h(
          'div',
          { class: 'item' },
          info ? img(emblemURL(info.faction), 'px', 'width:32px;height:36px') : h('div', { class: 'slot-empty', style: 'width:32px;height:36px' }),
          h(
            'div',
            { class: 'grow col', style: 'gap:1px' },
            h('span', { class: 'name' }, info ? `${slot}. ${info.name}` : `${slot}. Пусто`),
            info ? h('span', { class: 'sub' }, `${f!.short} · уровень ${info.level} · ${dateString(info.time)} · ${DIFFICULTY[info.difficulty].name}`) : null,
          ),
          info && mode === 'load' ? btn('Удалить', () => { if (confirm(`Удалить сохранение «${info.name}»?`)) { deleteSlot(slot); render(); } }, 'small ghost') : null,
          mode === 'load'
            ? btn('Загрузить', () => { close(); onPick(slot); }, 'small primary', !info)
            : btn(info ? 'Записать поверх' : 'Выбрать', () => { if (!info || confirm(`Сохранение «${info.name}» будет стёрто. Продолжить?`)) { close(); onPick(slot); } }, `small${info ? ' danger' : ' primary'}`),
        ),
      );
    });
  };
  render();
  const content = panel('modal narrow', h('div', { class: 'head' }, h('h2', { class: 'title' }, mode === 'load' ? 'Загрузить игру' : 'Слот для новой игры'), btn('✕', () => close(), 'small close')), body);
  close = openModal(content);
}

// ───────────────────────── загрузка ─────────────────────────

export function showLoading() {
  const bar = h('div');
  const label = h('div', { class: 'muted' }, 'Подготовка…');
  const el = h(
    'div',
    { class: 'loading' },
    h('h1', { class: 'title' }, 'WARFARE 1347'),
    h('div', { class: 'bar' }, bar),
    label,
  );
  uiRoot().append(el);
  return {
    set(p: number, text: string) {
      bar.style.width = `${Math.round(p * 100)}%`;
      label.textContent = text;
    },
    close() {
      el.remove();
    },
  };
}

// ───────────────────────── главное меню ─────────────────────────

export function showMainMenu(o: { hasSave: boolean; onNew: () => void; onContinue: () => void; onLoad: () => void }): () => void {
  const el = h(
    'div',
    { class: 'menu' },
    h(
      'div',
      { class: 'logo' },
      h('h1', { class: 'title' }, 'WARFARE'),
      h('div', { class: 'year' }, '1347'),
      h('p', {}, 'Евразия в огне. Четыре державы — одна корона.'),
    ),
    panel(
      'buttons',
      o.hasSave ? btn('Продолжить', o.onContinue, 'primary') : null,
      btn('Новая игра', o.onNew, o.hasSave ? '' : 'primary'),
      o.hasSave ? btn('Загрузить', o.onLoad) : null,
      btn('Достижения', () => showAchievements()),
      btn('Настройки', () => showSettings()),
      btn('Об игре', showAbout, 'ghost'),
    ),
  );
  uiRoot().append(el);
  return () => el.remove();
}

function showAbout() {
  let close = () => {};
  const content = panel(
    'modal narrow',
    h('div', { class: 'head' }, h('h2', { class: 'title' }, 'Об игре'), btn('✕', () => close(), 'small close')),
    h(
      'div',
      { class: 'body parch' },
      h('p', {}, '1347 год. С востока идёт чума, а четыре державы делят Евразию.'),
      h('p', {}, 'Станьте вассалом одной из них, соберите армию, найдите спутников, женитесь, получите удел — или возьмите корону сами.'),
      h('p', {}, 'Сражения, осады, турниры, пленники, торговля, поручения лордов и Чёрная смерть — мир живёт без вас, но вы можете его изменить.'),
      h('p', { class: 'muted', style: 'color:#5a4a30' }, 'Карта: Natural Earth. Шрифты: Kurale, Ruslan Display (OFL).'),
    ),
  );
  close = openModal(content);
}

// ───────────────────────── настройки ─────────────────────────

interface Settings {
  music: number;
  sfx: number;
}

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Settings | null;
    if (s) {
      music.setVolume(s.music);
      setSfxVolume(s.sfx);
    }
  } catch {
    /* по умолчанию */
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ music: music.getVolume(), sfx: getSfxVolume() }));
  } catch {
    /* нет хранилища */
  }
}

export function showSettings(extra?: HTMLElement) {
  let close = () => {};
  const slider = (value: number, onInput: (v: number) => void) => {
    const s = h('input', { type: 'range', min: 0, max: 100, value: Math.round(value * 100), class: 'slider' });
    s.addEventListener('input', () => onInput(+s.value / 100));
    return s;
  };
  const content = panel(
    'modal narrow',
    h('div', { class: 'head' }, h('h2', { class: 'title' }, 'Настройки'), btn('✕', () => close(), 'small close')),
    h(
      'div',
      { class: 'body col' },
      h('div', {}, 'Музыка'),
      slider(music.getVolume(), (v) => music.setVolume(v)),
      h('div', {}, 'Звуки'),
      slider(getSfxVolume(), (v) => setSfxVolume(v)),
      extra ?? null,
    ),
  );
  close = openModal(content, { onClose: saveSettings });
}

// ───────────────────────── создание персонажа ─────────────────────────

export function showCreation(onDone: (name: string, faction: FactionId, difficulty: Difficulty, tutorial: boolean) => void, onBack: () => void): () => void {
  let selected: FactionId = 'aurelia';
  let difficulty: Difficulty = 'normal';
  let tutorial = true;
  const diffBox = h('div', { class: 'row', style: 'gap:4px;flex-wrap:wrap;align-items:center' });
  const renderDiff = () => {
    diffBox.replaceChildren(
      h('span', { class: 'muted' }, 'Сложность:'),
      ...(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => btn(DIFFICULTY[d].name, () => { difficulty = d; renderDiff(); }, `small${d === difficulty ? ' primary' : ''}`)),
      h('span', { class: 'muted small' }, DIFFICULTY[difficulty].hint),
      h('span', { class: 'grow' }),
      btn(tutorial ? '✔ Обучение' : '✕ Без обучения', () => { tutorial = !tutorial; renderDiff(); }, `small${tutorial ? ' primary' : ''}`),
    );
  };
  renderDiff();
  const nameInput = h('input', { class: 'text grow', value: 'Ульрих', maxlength: 20, placeholder: 'Имя героя' }) as HTMLInputElement;
  const preview = img(portraitURL('aurelia_c2'), 'px', 'width:72px;height:72px;border:2px solid #0e0f10;background:rgba(255,255,255,.05)');
  const cards = new Map<FactionId, HTMLElement>();

  const select = (id: FactionId) => {
    selected = id;
    for (const [k, c] of cards) c.classList.toggle('selected', k === id);
    preview.src = portraitURL(`${id}_c2`);
  };

  const grid = h('div', { class: 'factions' });
  for (const id of FACTION_IDS) {
    const f = FACTIONS[id];
    const card = h(
      'div',
      { class: 'faction-card', onclick: () => select(id) },
      h('div', { class: 'head' }, img(emblemURL(id)), h('div', {}, h('h3', { style: `color:${f.css}` }, f.name), h('div', { class: 'ruler' }, `${f.rulerTitle} ${f.ruler}`))),
      h('div', { class: 'desc' }, f.description),
      h('div', { class: 'bonus' }, f.bonus),
    );
    cards.set(id, card);
    grid.append(card);
  }

  const start = () => {
    const name = nameInput.value.trim() || 'Безымянный';
    onDone(name, selected, difficulty, tutorial);
  };

  const el = h(
    'div',
    { class: 'creation' },
    panel(
      '',
      h('h2', { class: 'title', style: 'font-size:24px' }, 'Создание героя'),
      h('div', { class: 'row' }, preview, h('div', { class: 'col grow' }, h('div', { class: 'muted' }, 'Имя'), nameInput)),
      h('div', { class: 'muted' }, 'Выберите державу. Вы начнёте игру её вассалом, со скромным отрядом у столицы.'),
      grid,
      diffBox,
      h('div', { class: 'row', style: 'justify-content:flex-end' }, btn('Назад', onBack, 'ghost'), btn('Присягнуть', start, 'primary')),
    ),
  );
  uiRoot().append(el);
  select(selected);
  return () => el.remove();
}

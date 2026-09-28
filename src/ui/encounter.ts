import { strength } from '../battle/setup';
import type { Formation } from '../battle/sim';
import { GOODS, type GoodId } from '../data/goods';
import { TROOPS } from '../data/troops';
import { emblemURL, heroPortraitURL, itemIconURL, portraitURL } from '../gfx/icons';
import { ITEMS } from '../data/items';
import { heroXpToLevel, type AppliedResult } from '../game/battleResult';
import { KIND_INFO, type MapParty } from '../game/parties';
import type { GameState } from '../game/state';
import { btn, h, img, openModal, panel, plural } from './dom';

const FORMATIONS: { id: Formation; name: string; hint: string }[] = [
  { id: 'classic', name: 'Классика', hint: 'Пехота впереди, стрелки за ней, конница сзади' },
  { id: 'archers_front', name: 'Стрелки вперёд', hint: 'Стрелки открывают бой, пехота прикрывает' },
  { id: 'cav_charge', name: 'Конный удар', hint: 'Конница первой врезается во врага' },
];

let lastFormation: Formation = 'classic';

function armyList(troops: { id: string; count: number }[], heroName?: string, heroFaction?: string, heroPortrait?: string) {
  const box = h('div', { class: 'army-list' });
  if (heroName && heroFaction) box.append(h('div', { class: 'row' }, img(heroPortrait ?? portraitURL(`${heroFaction}_c3m`)), h('span', { class: 'gold' }, heroName), h('span', { class: 'muted' }, 'герой')));
  const sorted = [...troops].sort((a, b) => TROOPS[b.id].tier - TROOPS[a.id].tier);
  for (const t of sorted.slice(0, 7)) box.append(h('div', { class: 'row' }, img(portraitURL(t.id)), h('span', {}, TROOPS[t.id].name), h('span', { class: 'muted' }, `×${t.count}`)));
  if (sorted.length > 7) box.append(h('div', { class: 'muted' }, `и ещё ${sorted.length - 7} ${plural(sorted.length - 7, 'отряд', 'отряда', 'отрядов')}`));
  return box;
}

export function openEncounter(
  state: GameState,
  party: MapParty,
  attackedByThem: boolean,
  on: { fight: (f: Formation) => void; auto: (f: Formation) => void; retreat: () => void },
) {
  let close = () => {};
  const mine = strength(state.party.troops, true);
  const theirs = strength(party.troops);
  const pct = Math.round((mine / (mine + theirs)) * 100);
  const count = (list: { count: number }[]) => list.reduce((s, t) => s + t.count, 0);
  const verdict = pct > 70 ? 'Лёгкая добыча' : pct > 55 ? 'Перевес на нашей стороне' : pct > 45 ? 'Силы равны' : pct > 30 ? 'Враг сильнее' : 'Смертельно опасно';

  let formation = lastFormation;
  const fButtons = new Map<Formation, HTMLButtonElement>();
  const fBox = h('div', { class: 'formations' });
  for (const f of FORMATIONS) {
    const b = btn(f.name, () => {
      formation = f.id;
      lastFormation = f.id;
      for (const [k, v] of fButtons) v.classList.toggle('active', k === f.id);
    });
    b.title = f.hint;
    b.classList.add('small');
    b.classList.toggle('active', f.id === formation);
    fButtons.set(f.id, b);
    fBox.append(b);
  }
  const fast = KIND_INFO[party.kind].speed > 18;
  const content = panel(
    'modal wide',
    h(
      'div',
      { class: 'head' },
      party.faction !== 'outlaw' ? img(emblemURL(party.faction), 'px', 'width:32px;height:36px') : null,
      h('div', {}, h('h2', { class: 'title' }, party.name), h('div', { class: 'muted', style: 'font-size:13px' }, attackedByThem ? 'Враг нападает на ваш отряд!' : 'Вы настигли врага.')),
    ),
    h(
      'div',
      { class: 'body col' },
      h('div', { class: 'muted', style: 'font-size:13px' }, KIND_INFO[party.kind].about),
      h(
        'div',
        { class: 'versus' },
        h('div', { class: 'col' }, h('div', { class: 'col-title' }, `Ваш отряд · ${count(state.party.troops) + 1}`), armyList(state.party.troops, state.hero.name, state.hero.faction, heroPortraitURL(state))),
        h('div', { class: 'vs' }, 'VS'),
        h('div', { class: 'col' }, h('div', { class: 'col-title' }, `${party.name} · ${count(party.troops)}`), armyList(party.troops)),
      ),
      h(
        'div',
        { class: 'col', style: 'gap:3px' },
        h('div', { class: 'row', style: 'justify-content:space-between;font-size:13px' }, h('span', {}, 'Соотношение сил'), h('b', {}, verdict)),
        h('div', { class: 'power' }, h('div', { style: `width:${pct}%;background:#5aa04a` }), h('div', { style: `width:${100 - pct}%;background:#c24040` })),
      ),
    ),
    h(
      'div',
      { class: 'row', style: 'justify-content:flex-end;flex-wrap:wrap;gap:6px' },
      h('span', { class: 'col-title', style: 'margin:0' }, 'Построение:'),
      fBox,
      h('div', { class: 'grow' }),
      btn('Отступить', () => { close(); on.retreat(); }, 'ghost', false, fast ? 'Враг быстрее: арьергард понесёт потери' : 'Уйти без боя'),
      btn('Автобой', () => { close(); on.auto(formation); }),
      btn('В бой!', () => { close(); on.fight(formation); }, 'primary'),
    ),
  );
  close = openModal(content, { closeOnBack: false });
}

export function openBattleResult(state: GameState, r: AppliedResult, enemyName: string, onClose: () => void) {
  let close = () => {};
  const losses = h('div', { class: 'army-list' });
  if (!r.ourLosses.length) losses.append(h('div', { class: 'muted' }, 'Без потерь'));
  for (const l of r.ourLosses) {
    losses.append(
      h('div', { class: 'row' }, img(portraitURL(l.id)), h('span', {}, TROOPS[l.id].name), l.killed ? h('span', { style: 'color:#e07a6a' }, `пали: ${l.killed}`) : null, l.wounded ? h('span', { class: 'muted' }, `ранены: ${l.wounded}`) : null),
    );
  }
  const loot = h('div', { class: 'army-list' });
  if (r.won) {
    loot.append(h('div', { class: 'row' }, h('span', { class: 'gold' }, `+${r.gold} ¤`), h('span', { class: 'muted' }, 'золото')));
    for (const id of r.items) {
      const it = ITEMS[id];
      loot.append(h('div', { class: 'row' }, img(itemIconURL(it, state.hero.faction)), h('span', { class: 'gold' }, it.name), h('span', { class: 'muted' }, 'в сумке')));
    }
    for (const [g, n] of Object.entries(r.goods) as [GoodId, number][]) {
      loot.append(h('div', { class: 'row' }, h('div', { class: 'good-icon', style: `background:${GOODS[g].color}` }), h('span', {}, GOODS[g].name), h('span', { class: 'muted' }, `×${n}`)));
    }
  } else {
    loot.append(h('div', { style: 'color:#e07a6a' }, `Потеряно золота: ${r.lostGold} ¤`));
    loot.append(h('div', { class: 'muted' }, `Отряд отступил к: ${r.respawnAt}`));
  }
  const xp = h(
    'div',
    { class: 'army-list' },
    h('div', {}, `Опыт героя: +${r.heroXp}`, r.levelUp ? h('b', { class: 'gold' }, ` · новый уровень ${state.hero.level}! +${r.levelUp * 2} очка характеристик`) : ''),
    h('div', { class: 'muted' }, `До следующего уровня: ${heroXpToLevel(state.hero.level) - state.hero.xp}`),
    h('div', {}, `Опыт отряда: +${r.troopXp}`),
    r.heroWounded ? h('div', { style: 'color:#e07a6a' }, 'Герой ранен в бою, но выжил.') : null,
  );
  const content = panel(
    'modal wide',
    h('div', { class: `result-title ${r.won ? 'win' : 'lose'}` }, r.won ? 'Победа!' : 'Поражение'),
    h('div', { class: 'muted', style: 'text-align:center' }, r.won ? `${enemyName}: перебито ${r.enemyKilled} из ${r.enemyTotal}` : `${enemyName} взяли верх.`),
    h(
      'div',
      { class: 'body', style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px' },
      h('div', { class: 'col' }, h('div', { class: 'col-title' }, 'Наши потери'), losses),
      h('div', { class: 'col' }, h('div', { class: 'col-title' }, r.won ? 'Трофеи' : 'Итог'), loot),
      h('div', { class: 'col' }, h('div', { class: 'col-title' }, 'Опыт'), xp),
    ),
    h('div', { class: 'row', style: 'justify-content:flex-end' }, btn('Продолжить', () => close(), 'primary')),
  );
  close = openModal(content, { closeOnBack: false, onClose });
}

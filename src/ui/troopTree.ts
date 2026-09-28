// Древо воинов: как растут бойцы каждой державы — от крестьянина до гвардии.

import { FACTIONS, type FactionId } from '../data/factions';
import { DAMAGE_NAME, TROOPS, type TroopDef } from '../data/troops';
import type { GameState } from '../game/state';
import { emblemURL, figureURL } from '../gfx/icons';
import { btn, h, img, openModal, panel, stars } from './dom';

const LINES = [
  { id: 'i', name: 'Пехота' },
  { id: 'c', name: 'Конница' },
] as const;

const WEAPON_NAME: Record<string, string> = {
  pitchfork: 'вилы',
  spear: 'копьё',
  sword: 'меч',
  axe: 'топор',
  mace: 'булава',
  halberd: 'алебарда',
  glaive: 'глефа',
  bow: 'лук',
  crossbow: 'арбалет',
  lance: 'пика',
  sabre: 'сабля',
};

function armorPct(t: TroopDef) {
  return Math.round(((t.armor.cut + t.armor.pierce + t.armor.blunt) / 3) * 100);
}

export function openTroopTree(state: GameState, start?: FactionId) {
  let close = () => {};
  let faction: FactionId = start ?? state.hero.faction;
  let line: 'i' | 'c' = 'i';
  let picked = '';

  const tabs = h('div', { class: 'row tree-tabs' });
  const grid = h('div', { class: 'tree' });
  const info = h('div', { class: 'tree-info' });

  const owned = (id: string) => state.party.troops.filter((s) => s.id === id).reduce((n, s) => n + s.count, 0);

  const node = (id: string, area: string) => {
    const t = TROOPS[id];
    const n = owned(id);
    const cost = t.tier === 1 ? `наём ${t.hireCost} ¤` : '';
    const el = h(
      'div',
      { class: `tree-node${picked === id ? ' picked' : ''}`, style: `grid-area:${area}`, onclick: () => pick(id) },
      h('div', { class: 'tree-fig' }, img(figureURL(id), 'px')),
      h(
        'div',
        { class: 'col', style: 'gap:1px;min-width:0' },
        h('span', { class: 'name' }, t.name),
        h('span', { class: 'stars' }, stars(t.tier)),
        h('span', { class: 'muted small' }, `${t.role === 'ranged' ? '🏹 ' : ''}${WEAPON_NAME[t.look.weapon] ?? t.look.weapon}${t.look.shield ? ', щит' : ''}`),
        h('span', { class: 'small' }, `♥${t.hp} ⚔${t.damage} ⛨${armorPct(t)}%`),
        cost ? h('span', { class: 'gold small' }, cost) : null,
        n ? h('span', { class: 'own small' }, `в отряде: ${n}`) : null,
      ),
    );
    return el;
  };

  /** Стрелка между уровнями; fork — развилка на две ветки. */
  const arrow = (area: string, fork: boolean, cost: number, xp: number) =>
    h(
      'div',
      { class: 'tree-arrow', style: `grid-area:${area}` },
      fork
        ? h('div', { class: 'fork' }, h('i', { class: 'up' }), h('i', { class: 'down' }))
        : h('div', { class: 'line' }),
      h('span', { class: 'small gold' }, `${cost} ¤`),
      h('span', { class: 'small muted' }, `опыт ${xp}`),
    );

  const pick = (id: string) => {
    picked = id;
    render();
  };

  const render = () => {
    tabs.replaceChildren(
      ...(Object.keys(FACTIONS) as FactionId[]).map((f) => {
        const b = btn(h('span', { class: 'row', style: 'gap:4px' }, img(emblemURL(f), 'px', 'width:16px;height:18px'), FACTIONS[f].short), () => {
          faction = f;
          picked = '';
          render();
        }, `small${f === faction ? ' active' : ''}`);
        return b;
      }),
      h('span', { class: 'grow' }),
      ...LINES.map((l) => btn(l.name, () => {
        line = l.id;
        picked = '';
        render();
      }, `small${l.id === line ? ' active' : ''}`)),
    );
    const id = (slot: string) => `${faction}_${line}${slot}`;
    const t1 = TROOPS[id('1')];
    const t2 = TROOPS[id('2')];
    const t3 = TROOPS[id('3m')];
    grid.replaceChildren(
      node(id('1'), 'n1'),
      arrow('a1', false, t1.upgradeCost, t1.xpToUpgrade),
      node(id('2'), 'n2'),
      arrow('a2', true, t2.upgradeCost, t2.xpToUpgrade),
      node(id('3m'), 'm3'),
      node(id('3r'), 'r3'),
      arrow('am', false, t3.upgradeCost, t3.xpToUpgrade),
      arrow('ar', false, TROOPS[id('3r')].upgradeCost, TROOPS[id('3r')].xpToUpgrade),
      node(id('4m'), 'm4'),
      node(id('4r'), 'r4'),
    );
    const sel = TROOPS[picked || id('1')];
    info.replaceChildren(
      h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, h('b', { class: 'gold' }, sel.name), h('span', { class: 'stars' }, stars(sel.tier)), h('span', { class: 'muted small' }, sel.role === 'ranged' ? 'стрелок' : 'ближний бой')),
      h('div', { class: 'small', style: 'line-height:1.35' }, sel.description),
      h(
        'div',
        { class: 'stats' },
        h('span', {}, `Здоровье ${sel.hp}`),
        h('span', {}, `Урон ${sel.damage} (${DAMAGE_NAME[sel.damageType]})`),
        h('span', {}, `Броня: руб. ${Math.round(sel.armor.cut * 100)}% · кол. ${Math.round(sel.armor.pierce * 100)}% · дроб. ${Math.round(sel.armor.blunt * 100)}%`),
        sel.range ? h('span', {}, `Дальность ${sel.range} м`) : null,
        h('span', {}, `Скорость ${sel.speed}`),
        h('span', {}, `Крит ${Math.round(sel.crit * 100)}%`),
        h('span', {}, `Уклон ${Math.round(sel.dodge * 100)}%`),
        sel.block ? h('span', {}, `Блок ${Math.round(sel.block * 100)}%`) : null,
      ),
      h(
        'div',
        { class: 'muted small' },
        sel.tier === 1
          ? `Нанимается ${line === 'i' ? 'в деревнях' : 'в замках'} за ${sel.hireCost} ¤. `
          : '',
        sel.upgradesTo.length
          ? `Повышение: ${sel.upgradesTo.map((u) => TROOPS[u].name).join(' или ')} — ${sel.upgradeCost} ¤ после ${sel.xpToUpgrade} опыта.`
          : 'Высший уровень.',
      ),
    );
  };

  const content = panel(
    'modal wide tree-modal',
    h(
      'div',
      { class: 'head' },
      h('div', {}, h('h2', { class: 'title' }, 'Древо воинов'), h('div', { class: 'muted', style: 'font-size:13px' }, 'Воины набирают опыт в боях и повышаются в окне «Отряд». Коснитесь воина — подробности.')),
      btn('✕', () => close(), 'small close'),
    ),
    h('div', { class: 'body' }, tabs, grid, info),
  );
  render();
  close = openModal(content);
}

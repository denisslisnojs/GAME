import { strength } from '../battle/setup';
import type { Formation } from '../battle/sim';
import { GOODS, type GoodId } from '../data/goods';
import { TROOPS } from '../data/troops';
import { emblemURL, heroPortraitURL, itemIconURL, portraitURL } from '../gfx/icons';
import { ITEMS } from '../data/items';
import { heroXpToLevel, type AppliedResult } from '../game/battleResult';
import { KIND_INFO, type MapParty } from '../game/parties';
import { dateString, type GameState } from '../game/state';
import { world, type Settlement } from '../game/world';
import { canTurnIn, fiefIncome, questProgress } from '../game/quests';
import { mergeTroops } from '../game/war';
import { FACTIONS } from '../data/factions';
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
  extra: { allies: MapParty[]; others: MapParty[] } = { allies: [], others: [] },
) {
  let close = () => {};
  const allyTroops = extra.allies.flatMap((l) => l.troops);
  const otherTroops = extra.others.flatMap((l) => l.troops);
  const mine = strength(state.party.troops, true) + strength(allyTroops);
  const theirs = strength(party.troops) + strength(otherTroops);
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
      extra.allies.length ? h('div', { style: 'color:#7ad06a;font-size:13px' }, `На вашей стороне: ${extra.allies.map((l) => `${l.name} (${count(l.troops)})`).join(', ')}`) : null,
      extra.others.length ? h('div', { style: 'color:#e07a6a;font-size:13px' }, `К врагу подходят: ${extra.others.map((l) => `${l.name} (${count(l.troops)})`).join(', ')}`) : null,
      h(
        'div',
        { class: 'versus' },
        h('div', { class: 'col' }, h('div', { class: 'col-title' }, `Ваш отряд · ${count(state.party.troops) + 1 + count(allyTroops)}`), armyList(state.party.troops, state.hero.name, state.hero.faction, heroPortraitURL(state))),
        h('div', { class: 'vs' }, 'VS'),
        h('div', { class: 'col' }, h('div', { class: 'col-title' }, `${party.name} · ${count(party.troops) + count(otherTroops)}`), armyList(mergeTroops([party.troops, otherTroops]))),
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
    h('div', { class: 'muted', style: 'text-align:center' }, r.won ? `${enemyName}: перебито ${r.enemyKilled} из ${r.enemyTotal}` : `Враг взял верх (${enemyName}).`),
    r.headline ? h('div', { class: 'gold', style: 'text-align:center;font-size:17px;margin:4px 0' }, r.headline) : null,
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

// ───────────────────────── осада ─────────────────────────

export function openSiegeDialog(
  state: GameState,
  s: Settlement,
  garrison: { id: string; count: number }[],
  lords: MapParty[],
  on: { assault: () => void; auto: () => void },
  allies: MapParty[] = [],
) {
  let close = () => {};
  const owner = state.settlements[s.id].owner;
  const defenders = [garrison, ...lords.map((l) => l.troops)];
  const merged: { id: string; count: number }[] = [];
  for (const l of defenders) for (const t of l) {
    const x = merged.find((m) => m.id === t.id);
    if (x) x.count += t.count;
    else merged.push({ id: t.id, count: t.count });
  }
  const allyTroops = allies.flatMap((l) => l.troops);
  const mine = strength(state.party.troops, true) + strength(allyTroops);
  const theirs = strength(merged) * 1.35; // стены удваивают стойкость
  const pct = Math.round((mine / (mine + theirs)) * 100);
  const count = (list: { count: number }[]) => list.reduce((a, t) => a + t.count, 0);
  const verdict = pct > 65 ? 'Крепость падёт' : pct > 52 ? 'Шансы на нашей стороне' : pct > 42 ? 'Тяжёлый штурм' : 'Стены неприступны для такого войска';
  const content = panel(
    'modal wide',
    h('div', { class: 'head' }, img(emblemURL(owner), 'px', 'width:32px;height:36px'), h('div', {}, h('h2', { class: 'title' }, `Осада: ${s.name}`), h('div', { class: 'muted', style: 'font-size:13px' }, `${s.type === 'town' ? 'Город' : 'Замок'} · ${FACTIONS[owner].name}`)), btn('✕', () => close(), 'small close')),
    h(
      'div',
      { class: 'body col' },
      h('div', { class: 'muted', style: 'font-size:13px' }, 'Лучники на стенах бьют дальше и укрыты зубцами. Пока пехота держит ворота, на стены не взобраться. Взятая крепость отойдёт вашему государю.'),
      lords.length ? h('div', { style: 'color:#e07a6a;font-size:13px' }, `В крепости укрылись: ${lords.map((l) => l.name).join(', ')}`) : null,
      allies.length ? h('div', { style: 'color:#7ad06a;font-size:13px' }, `С вами на штурм идут: ${allies.map((l) => `${l.name} (${count(l.troops)})`).join(', ')}`) : null,
      h(
        'div',
        { class: 'versus' },
        h('div', { class: 'col' }, h('div', { class: 'col-title' }, `Ваш отряд · ${count(state.party.troops) + 1 + count(allyTroops)}`), armyList(state.party.troops, state.hero.name, state.hero.faction, heroPortraitURL(state))),
        h('div', { class: 'vs' }, 'VS'),
        h('div', { class: 'col' }, h('div', { class: 'col-title' }, `Защитники · ${count(merged)}`), armyList(merged)),
      ),
      h(
        'div',
        { class: 'col', style: 'gap:3px' },
        h('div', { class: 'row', style: 'justify-content:space-between;font-size:13px' }, h('span', {}, 'Соотношение сил (с учётом стен)'), h('b', {}, verdict)),
        h('div', { class: 'power' }, h('div', { style: `width:${pct}%;background:#5aa04a` }), h('div', { style: `width:${100 - pct}%;background:#c24040` })),
      ),
    ),
    h(
      'div',
      { class: 'row', style: 'justify-content:flex-end;gap:6px' },
      btn('Отойти', () => close(), 'ghost'),
      btn('Автобой', () => { close(); on.auto(); }),
      btn('На штурм!', () => { close(); on.assault(); }, 'primary'),
    ),
  );
  close = openModal(content, { closeOnBack: false });
}

// ───────────────────────── хроника ─────────────────────────

const NEWS_COLOR: Record<string, string> = { war: '#e07a6a', peace: '#7ad06a', capture: '#e8c04a', battle: '#d8b08a', lord: '#a8b8d0', info: '#c8c0a8', player: '#ffd24a' };

export function openChronicle(state: GameState) {
  let close = () => {};
  const list = h('div', { class: 'list' });
  const quests = state.quests ?? [];
  if (quests.length || state.fiefs?.length) {
    const qb = h('div', { class: 'col', style: 'gap:4px;margin-bottom:8px' }, h('div', { class: 'col-title' }, 'Поручения'));
    if (!quests.length) qb.append(h('div', { class: 'muted' }, 'Нет поручений.'));
    for (const q of quests) {
      qb.append(
        h(
          'div',
          { class: 'item', style: 'padding:5px 8px;flex-direction:column;align-items:flex-start;gap:2px' },
          h('div', {}, h('b', { class: canTurnIn(state, q) ? 'gold' : '' }, q.title), h('span', { class: 'muted' }, ` · ${q.giverName}, ${world.byId.get(q.from)?.name}`)),
          h('div', { class: 'muted', style: 'font-size:12.5px' }, `${questProgress(state, q)} · осталось ${Math.max(0, Math.ceil(q.deadline - state.time))} дн. · награда ${q.reward} ¤`),
        ),
      );
    }
    if (state.fiefs?.length) qb.append(h('div', { class: 'col-title', style: 'margin-top:6px' }, 'Удел'), h('div', {}, `${state.fiefs.map((id) => world.byId.get(id)?.name).join(', ')} · доход ${fiefIncome(state)} ¤ в неделю`));
    list.append(qb, h('div', { class: 'col-title' }, 'Летопись'));
  }
  const items = state.war?.news ?? [];
  if (!items.length) list.append(h('div', { class: 'muted' }, 'Пока всё спокойно.'));
  for (const n of items) {
    list.append(h('div', { class: 'item', style: 'padding:5px 8px' }, h('span', { class: 'muted', style: 'min-width:120px;font-size:12px' }, dateString(n.t)), h('span', { style: `color:${NEWS_COLOR[n.kind] ?? 'inherit'}` }, n.text)));
  }
  const content = panel('modal', h('div', { class: 'head' }, h('h2', { class: 'title' }, 'Хроника'), btn('✕', () => close(), 'small close')), h('div', { class: 'body' }, list));
  close = openModal(content);
}

// ───────────────────────── конец игры ─────────────────────────

export function openOutcome(state: GameState, kind: 'victory' | 'defeat', onContinue: () => void, onMenu: () => void) {
  let close = () => {};
  const f = FACTIONS[state.hero.faction];
  const st = state.stats ?? { won: 0, lost: 0, killed: 0 };
  const content = panel(
    'modal',
    h('div', { class: `result-title ${kind === 'victory' ? 'win' : 'lose'}` }, kind === 'victory' ? 'Евразия объединена!' : 'Держава пала'),
    h(
      'div',
      { class: 'body col', style: 'text-align:center' },
      h(
        'p',
        {},
        kind === 'victory'
          ? `Все города и замки от Лиссабона до Ханбалыка подвластны ${f.rulerTitle.toLowerCase()}у ${f.ruler}. Имя ${state.hero.name} навеки в летописях.`
          : `${f.name} больше не существует. ${state.hero.name} скитается без сюзерена.`,
      ),
      h('p', { class: 'muted' }, `${dateString(state.time)} · побед: ${st.won} · поражений: ${st.lost} · сражено врагов: ${st.killed} · взято крепостей: ${st.captured ?? 0} · уровень героя: ${state.hero.level}`),
    ),
    h('div', { class: 'row', style: 'justify-content:center;gap:8px' }, btn('Продолжить странствия', () => { close(); onContinue(); }), btn('В главное меню', () => { close(); onMenu(); }, 'primary')),
  );
  close = openModal(content, { closeOnBack: false });
}

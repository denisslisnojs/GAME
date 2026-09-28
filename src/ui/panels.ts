import { FACTIONS } from '../data/factions';
import { GOODS, type GoodId } from '../data/goods';
import { DAMAGE_NAME, TROOPS, type TroopDef } from '../data/troops';
import { emblemURL, portraitURL, vistaURL } from '../gfx/icons';
import {
  buy,
  buyPrice,
  cargoCount,
  dismiss,
  hire,
  hirePrice,
  ownerOf,
  partySize,
  relationTo,
  sell,
  sellPrice,
} from '../game/logic';
import type { GameState } from '../game/state';
import { world, type Settlement } from '../game/world';
import { btn, h, img, openModal, panel, plural, sfxCoins, stars, toast } from './dom';

export interface GameCtx {
  state: GameState;
  /** Сохранить и обновить HUD. */
  commit(): void;
}

const TYPE_NAME = { town: 'Город', castle: 'Замок', village: 'Деревня' } as const;

function header(title: string, sub: string | HTMLElement | null, close: () => void, icon?: string) {
  return h(
    'div',
    { class: 'head' },
    icon ? img(icon, 'px', 'width:32px;height:36px') : null,
    h('div', {}, h('h2', { class: 'title' }, title), sub ? h('div', { class: 'muted', style: 'font-size:13px' }, sub) : null),
    btn('✕', close, 'small close'),
  );
}

function goldLine(state: GameState) {
  return h('span', { class: 'gold' }, `${state.gold} ¤`);
}

export function troopStats(t: TroopDef): HTMLElement {
  const armorAvg = Math.round(((t.armor.cut + t.armor.pierce + t.armor.blunt) / 3) * 100);
  return h(
    'div',
    { class: 'stats' },
    h('span', {}, `Здоровье ${t.hp}`),
    h('span', {}, `Урон ${t.damage} (${DAMAGE_NAME[t.damageType]})`),
    h('span', {}, `Броня ${armorAvg}%`),
    t.range ? h('span', {}, `Дальность ${t.range} м`) : null,
    h('span', {}, `Крит ${Math.round(t.crit * 100)}%`),
    h('span', {}, `Уклон ${Math.round(t.dodge * 100)}%`),
    t.block ? h('span', {}, `Блок ${Math.round(t.block * 100)}%`) : null,
  );
}

// ───────────────────────── поселение ─────────────────────────

export function openSettlement(ctx: GameCtx, s: Settlement, onLeave: () => void) {
  const { state } = ctx;
  let close = () => {};
  const owner = ownerOf(state, s);
  const f = FACTIONS[owner];
  const rel = relationTo(state, s);
  const relText = rel === 'own' ? 'Ваша держава' : rel === 'war' ? 'Война!' : 'Мир';
  const relColor = rel === 'own' ? 'var(--green)' : rel === 'war' ? 'var(--red)' : 'var(--muted)';

  const info = h(
    'div',
    { class: 'col' },
    img(vistaURL(s, owner), 'scene-art'),
    h('div', { class: 'parch', style: 'font-size:13.5px;line-height:1.35' }, s.about ?? ''),
    h(
      'div',
      { class: 'stats', style: 'font-size:13px' },
      h('span', {}, `Владелец: `, h('b', { style: `color:${f.css}` }, f.short)),
      h('span', { style: `color:${relColor}` }, relText),
      s.parent ? h('span', {}, `Приписана к: ${world.byId.get(s.parent)?.name}`) : null,
      s.villages.length ? h('span', {}, `Деревни: ${s.villages.map((v) => world.byId.get(v)?.name).join(', ')}`) : null,
    ),
  );

  const optF = (label: string, hint: string, fn: () => void, cls = '', disabled = false) => {
    const frag = document.createDocumentFragment();
    frag.append(h('span', {}, label), h('span', { class: 'hint' }, hint));
    return btn(frag, fn, cls, disabled);
  };

  const leave = () => {
    close();
  };

  const options = h('div', { class: 'options' });
  if (rel === 'war') {
    options.append(
      h(
        'div',
        { class: 'parch', style: 'font-size:13.5px' },
        s.type === 'village'
          ? 'Завидев ваше знамя, крестьяне попрятались. Староста кричит из-за плетня, чтобы вы убирались.'
          : 'Ворота заперты, на стенах лучники. Здесь вас встретят только стрелами.',
      ),
      optF(s.type === 'village' ? 'Разорить деревню' : 'Начать осаду', 'этап 4', () => {}, '', true),
      optF('Уйти', '', leave, 'primary'),
    );
  } else {
    const recruitLabel = s.type === 'village' ? 'Нанять крестьян' : s.type === 'castle' ? 'Нанять всадников' : 'Нанять войска';
    options.append(optF(recruitLabel, '', () => openRecruit(ctx, s)));
    if (s.type !== 'castle') options.append(optF(s.type === 'town' ? 'Рынок' : 'Торговать с крестьянами', '', () => openMarket(ctx, s)));
    if (s.type === 'town') {
      options.append(
        optF('Оружейник', 'этап 3', () => {}, '', true),
        optF('Бронник', 'этап 3', () => {}, '', true),
        optF('Арена и турниры', 'этап 5', () => {}, '', true),
        optF(owner === state.hero.faction && FACTIONS[owner].capital === s.id ? 'Тронный зал' : 'Замок лорда', 'этап 5', () => {}, '', true),
      );
    } else if (s.type === 'castle') {
      options.append(optF('Поговорить с кастеляном', 'этап 5', () => {}, '', true));
    } else {
      options.append(optF('Поговорить со старостой', 'этап 5', () => {}, '', true));
    }
    options.append(optF('Покинуть', '', leave, 'primary'));
  }

  const content = panel(
    'modal wide',
    header(s.name, `${TYPE_NAME[s.type]} · ${f.name}`, leave, emblemURL(owner)),
    h('div', { class: 'body settle-layout' }, info, options),
  );
  close = openModal(content, { onClose: onLeave });
}

// ───────────────────────── найм ─────────────────────────

export function openRecruit(ctx: GameCtx, s: Settlement) {
  const { state } = ctx;
  let close = () => {};
  const body = h('div', { class: 'body list' });
  const sub = h('div', {});

  const render = () => {
    body.replaceChildren();
    sub.replaceChildren(goldLine(state), ` · В отряде: ${partySize(state)}`);
    const st = state.settlements[s.id];
    const ids = Object.keys(st.recruits);
    if (!ids.length) body.append(h('div', { class: 'muted' }, 'Здесь некого нанять.'));
    for (const id of ids) {
      const t = TROOPS[id];
      const avail = Math.floor(st.recruits[id]);
      const price = hirePrice(state, s, id);
      const doHire = (n: number) => {
        const got = hire(state, s, id, n);
        if (got > 0) {
          sfxCoins();
          toast(`Нанято: ${t.name} ×${got}`);
          ctx.commit();
        } else if (state.gold < price) toast('Не хватает денег');
        render();
      };
      body.append(
        h(
          'div',
          { class: 'item' },
          img(portraitURL(id), 'px portrait'),
          h(
            'div',
            { class: 'grow col', style: 'gap:2px' },
            h('div', { class: 'row', style: 'gap:8px' }, h('span', { class: 'name' }, t.name), h('span', { class: 'stars' }, stars(t.tier)), t.line === 'cavalry' ? h('span', { class: 'muted', style: 'font-size:12px' }, 'конница') : null),
            h('div', { class: 'sub' }, t.description),
            troopStats(t),
          ),
          h('div', { class: 'col', style: 'align-items:flex-end;gap:4px' },
            h('div', {}, h('span', { class: 'count' }, avail), h('span', { class: 'muted', style: 'font-size:12px' }, ' готовы')),
            h('div', { class: 'gold', style: 'font-size:13px' }, `${price} ¤ за воина`),
            h('div', { class: 'row', style: 'gap:4px' },
              btn('+1', () => doHire(1), 'small', avail < 1 || state.gold < price),
              btn('Всех', () => doHire(avail), 'small primary', avail < 1 || state.gold < price),
            ),
          ),
        ),
      );
    }
    body.append(h('div', { class: 'muted', style: 'font-size:12px;padding:4px' }, 'Новые рекруты приходят каждый день. В чужих землях найм в полтора раза дороже.'));
  };

  const content = panel('modal', header(`Найм — ${s.name}`, sub, () => close()), body);
  render();
  close = openModal(content);
}

// ───────────────────────── рынок ─────────────────────────

export function openMarket(ctx: GameCtx, s: Settlement) {
  const { state } = ctx;
  let close = () => {};
  const left = h('div', { class: 'list' });
  const right = h('div', { class: 'list' });
  const sub = h('div', {});

  const goodRow = (g: GoodId, right: HTMLElement) =>
    h('div', { class: 'item' }, h('div', { class: 'good-icon', style: `background:${GOODS[g].color}` }), h('div', { class: 'grow' }, h('div', { class: 'name' }, GOODS[g].name)), right);

  const render = () => {
    sub.replaceChildren(goldLine(state), ` · Груз: ${cargoCount(state)}`);
    left.replaceChildren(h('div', { class: 'col-title' }, 'Товары рынка'));
    for (const g of s.goods) {
      const p = buyPrice(g);
      left.append(
        goodRow(
          g,
          h('div', { class: 'row', style: 'gap:4px' },
            h('span', { class: 'gold', style: 'min-width:48px;text-align:right' }, `${p} ¤`),
            btn('+1', () => { if (buy(state, g, 1)) { sfxCoins(); ctx.commit(); } else toast('Не хватает денег'); render(); }, 'small', state.gold < p),
            btn('+10', () => { if (buy(state, g, 10)) { sfxCoins(); ctx.commit(); } render(); }, 'small', state.gold < p),
          ),
        ),
      );
    }
    right.replaceChildren(h('div', { class: 'col-title' }, 'Ваши товары'));
    const cargo = Object.entries(state.cargo) as [GoodId, number][];
    if (!cargo.length) right.append(h('div', { class: 'muted', style: 'padding:6px' }, 'Пусто. Товары и трофеи добываются в боях и на турнирах.'));
    for (const [g, n] of cargo) {
      const p = sellPrice(g);
      right.append(
        goodRow(
          g,
          h('div', { class: 'row', style: 'gap:4px' },
            h('span', { style: 'min-width:30px;text-align:right' }, `×${n}`),
            h('span', { class: 'gold', style: 'min-width:48px;text-align:right' }, `${p} ¤`),
            btn('−1', () => { if (sell(state, g, 1)) { sfxCoins(); ctx.commit(); } render(); }, 'small'),
            btn('Все', () => { if (sell(state, g, n)) { sfxCoins(); ctx.commit(); } render(); }, 'small primary'),
          ),
        ),
      );
    }
  };

  const content = panel(
    'modal wide',
    header(`${s.type === 'town' ? 'Рынок' : 'Торговля'} — ${s.name}`, sub, () => close()),
    h('div', { class: 'body two-col' }, left, right),
    h('div', { class: 'muted', style: 'font-size:12px' }, 'Цены везде одинаковые: покупка по полной цене, продажа за 80%.'),
  );
  render();
  close = openModal(content);
}

// ───────────────────────── отряд ─────────────────────────

export function openParty(ctx: GameCtx) {
  const { state } = ctx;
  let close = () => {};
  const body = h('div', { class: 'body list' });
  const sub = h('div', {});

  const render = () => {
    const size = partySize(state);
    sub.replaceChildren(`${size} ${plural(size, 'воин', 'воина', 'воинов')} · `, goldLine(state));
    body.replaceChildren();
    const f = FACTIONS[state.hero.faction];
    body.append(
      h(
        'div',
        { class: 'item', style: 'border-color:#6a5a3a' },
        img(portraitURL(`${state.hero.faction}_c2`), 'px portrait'),
        h('div', { class: 'grow col', style: 'gap:2px' },
          h('div', { class: 'row', style: 'gap:8px' }, h('span', { class: 'name gold' }, state.hero.name), h('span', { class: 'muted', style: 'font-size:12px' }, `вассал: ${f.rulerTitle.toLowerCase()} ${f.ruler}`)),
          h('div', { class: 'sub' }, `Уровень ${state.hero.level} · Опыт ${state.hero.xp}. Снаряжение и характеристики героя появятся на этапе 3.`),
        ),
      ),
    );
    const troops = [...state.party.troops].sort((a, b) => TROOPS[b.id].tier - TROOPS[a.id].tier || (TROOPS[a.id].line === 'cavalry' ? -1 : 1));
    for (const stack of troops) {
      const t = TROOPS[stack.id];
      const xpPct = t.xpToUpgrade ? Math.min(100, Math.round((stack.xp / t.xpToUpgrade) * 100)) : 100;
      body.append(
        h(
          'div',
          { class: 'item' },
          img(portraitURL(stack.id), 'px portrait'),
          h('div', { class: 'grow col', style: 'gap:2px' },
            h('div', { class: 'row', style: 'gap:8px' },
              h('span', { class: 'name' }, t.name),
              h('span', { class: 'stars' }, stars(t.tier)),
              t.faction !== state.hero.faction && t.faction !== 'outlaw' ? h('span', { style: `font-size:12px;color:${FACTIONS[t.faction].css}` }, FACTIONS[t.faction].short) : null,
            ),
            troopStats(t),
            t.upgradesTo.length
              ? h('div', { class: 'row', style: 'gap:6px;font-size:12px' },
                  h('div', { style: 'width:90px;height:6px;background:#0e0f10;border:1px solid #45494e' }, h('div', { style: `height:100%;width:${xpPct}%;background:var(--gold)` })),
                  h('span', { class: 'muted' }, `→ ${t.upgradesTo.map((u) => TROOPS[u].name).join(' / ')}`),
                )
              : h('div', { class: 'muted', style: 'font-size:12px' }, 'Высший уровень'),
          ),
          h('div', { class: 'col', style: 'align-items:flex-end;gap:4px' },
            h('span', { class: 'count' }, `×${stack.count}`),
            btn('Распустить 1', () => { dismiss(state, stack.id, 1); ctx.commit(); render(); }, 'small ghost'),
          ),
        ),
      );
    }
    if (!troops.length) body.append(h('div', { class: 'muted', style: 'padding:8px' }, 'Отряд пуст. Наймите воинов в деревнях и городах.'));
  };

  const content = panel('modal', header('Отряд', sub, () => close(), emblemURL(state.hero.faction)), body);
  render();
  close = openModal(content);
}

// ───────────────────────── обзор держав ─────────────────────────

export function openRealms(ctx: GameCtx) {
  const { state } = ctx;
  let close = () => {};
  const body = h('div', { class: 'body list' });
  for (const id of Object.keys(FACTIONS) as (keyof typeof FACTIONS)[]) {
    const f = FACTIONS[id];
    const owned = world.settlements.filter((s) => state.settlements[s.id].owner === id);
    const towns = owned.filter((s) => s.type === 'town').length;
    const castles = owned.filter((s) => s.type === 'castle').length;
    const villages = owned.filter((s) => s.type === 'village').length;
    const wars = state.wars.filter(([a, b]) => a === id || b === id).map(([a, b]) => FACTIONS[a === id ? b : a].short);
    body.append(
      h(
        'div',
        { class: 'item', style: id === state.hero.faction ? 'border-color:#6a5a3a' : '' },
        img(emblemURL(id), 'px', 'width:32px;height:36px'),
        h('div', { class: 'grow col', style: 'gap:2px' },
          h('div', { class: 'row', style: 'gap:8px' }, h('span', { class: 'name', style: `color:${f.css}` }, f.name), id === state.hero.faction ? h('span', { class: 'gold', style: 'font-size:12px' }, 'ваша держава') : null),
          h('div', { class: 'sub' }, `${f.rulerTitle} ${f.ruler} · Городов: ${towns}, замков: ${castles}, деревень: ${villages}`),
          h('div', { class: 'sub', style: wars.length ? 'color:#e07a6a' : '' }, wars.length ? `Воюет с: ${wars.join(', ')}` : 'Ни с кем не воюет'),
        ),
      ),
    );
  }
  body.append(h('div', { class: 'muted', style: 'font-size:12px;padding:4px' }, 'Цель игры: ваша держава должна владеть всеми городами и замками.'));
  const content = panel('modal', header('Державы', null, () => close()), body);
  close = openModal(content);
}

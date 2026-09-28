import { FACTIONS, type FactionId } from '../data/factions';
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
  readyToUpgrade,
  relationTo,
  sell,
  sellPrice,
  upgrade,
} from '../game/logic';
import type { GameState } from '../game/state';
import type { Battle } from '../battle/sim';
import { openArena } from './tournament';
import { activeLords, isLooted, siegeDefenders, troopCount } from '../game/war';
import { tourneyReady } from '../game/tournament';
import { isPlagued } from '../game/plague';
import { canTurnIn, hostOf, offerQuest, questsOf } from '../game/quests';
import { openFief, openHost } from './nobles';
import { world, type Settlement } from '../game/world';
import { btn, h, img, openModal, panel, plural, sfxCoins, stars, toast } from './dom';
import { openHero, openShop } from './heroUi';
import { openTroopTree } from './troopTree';
import { openTavern, skillLine } from './tavern';
import { companionsAt, dismissCompanion, inParty, isWounded, mood } from '../game/companions';
import { companionPortraitURL } from '../gfx/icons';
import { lordRansom, prisonerCap, prisonerCount, ransomPrice, recruitPrisoner, releaseLord } from '../game/prisoners';
import { heroPortraitURL } from '../gfx/icons';

export interface GameCtx {
  state: GameState;
  /** Сохранить и обновить HUD. */
  commit(): void;
  /** Осада вражеской крепости. */
  startSiege?(s: Settlement): void;
  /** Разорение вражеской деревни. */
  startRaid?(s: Settlement): void;
  /** Оборона своей осаждённой крепости. */
  defendSiege?(s: Settlement): void;
  /** Открыть окно с паузой игры, пока оно открыто. */
  modal?(open: () => void): void;
  /** Запустить бой (сцена или автобой) и вернуть результат. */
  runBattle?(battle: Battle, auto: boolean, view: BattleView, done: (b: Battle) => void): void;
  /** Снова войти в поселение. */
  visit?(s: Settlement): void;
}

export interface BattleView {
  enemyName: string;
  enemyColor: string;
  wall?: { culture: string; color: string; color2: string };
  arena?: { colors: string[] };
}

const TYPE_NAME = { town: 'Город', castle: 'Замок', village: 'Деревня' } as const;

/** Подсказка на кнопке хозяина: можно сдать поручение или есть новое. */
function hostHint(state: GameState, s: Settlement): string {
  const host = hostOf(state, s);
  const qs = questsOf(state, host.key);
  if (qs.some((q) => canTurnIn(state, q))) return '✔ поручение выполнено';
  if (qs.length) return 'поручение в работе';
  if (offerQuest(state, s, host)) return 'есть поручение';
  return host.name;
}

function siegeSize(state: GameState, s: Settlement): number {
  const { garrison, lords } = siegeDefenders(state, s);
  return troopCount(garrison) + lords.reduce((n, l) => n + troopCount(l.troops), 0);
}

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
      s.type !== 'village' ? h('span', {}, `Гарнизон: ${troopCount(state.war?.garrisons[s.id] ?? [])}`) : null,
      state.war?.sieges[s.id] ? h('span', { style: 'color:var(--red)' }, `В осаде: ${FACTIONS[state.war.sieges[s.id].attacker].short}`) : null,
      isLooted(state, s.id) ? h('span', { style: 'color:var(--red)' }, 'Разорена') : null,
      isPlagued(state, s) ? h('span', { style: 'color:#9ab87a' }, 'Мор! Рекрутов нет, отряд рядом болеет') : null,
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
      s.type === 'village'
        ? isLooted(state, s.id)
          ? optF('Разорить деревню', 'уже разорена', () => {}, '', true)
          : optF('Разорить деревню', 'бой с ополчением, добыча', () => { close(); ctx.startRaid?.(s); })
        : optF('Начать осаду', `гарнизон ≈ ${siegeSize(state, s)}`, () => { close(); ctx.startSiege?.(s); }, 'danger'),
      optF('Уйти', '', leave, 'primary'),
    );
  } else {
    const sg = state.war?.sieges[s.id];
    if (sg && s.type !== 'village') options.append(optF('Защищать стены', `осаждает ${FACTIONS[sg.attacker].short}`, () => { close(); ctx.defendSiege?.(s); }, 'danger'));
    if (state.fiefs?.includes(s.id)) options.append(optF('Управлять уделом', 'постройки, налоги, гарнизон', () => openFief(ctx, s), 'primary'));
    const recruitLabel = s.type === 'village' ? 'Нанять крестьян' : s.type === 'castle' ? 'Нанять всадников' : 'Нанять войска';
    options.append(optF(recruitLabel, '', () => openRecruit(ctx, s)));
    if (s.type !== 'castle') options.append(optF(s.type === 'town' ? 'Рынок' : 'Торговать с крестьянами', '', () => openMarket(ctx, s)));
    if (s.type === 'town') {
      options.append(
        optF('Оружейник', 'оружие и щиты', () => openShop(ctx, s, 'weapons')),
        optF('Бронник', 'шлемы и доспехи', () => openShop(ctx, s, 'armor')),
        optF('Конюшня', 'кони', () => openShop(ctx, s, 'horses')),
        optF('Таверна', companionsAt(state, s.id).length ? `за столом: ${companionsAt(state, s.id).map((c) => c.def.name.split(' ')[0]).join(', ')}` : 'спутники, слухи', () => openTavern(ctx, s)),
        optF('Ристалище', tourneyReady(state, s) ? `турнир через ${tourneyReady(state, s)} дн.` : 'турнир сегодня!', () => openArena(ctx, s, () => close())),
        optF(FACTIONS[owner].capital === s.id ? 'Тронный зал' : 'Замок лорда', hostHint(state, s), () => openHost(ctx, s)),
      );
    } else if (s.type === 'castle') {
      options.append(optF('Конюшня', 'кони', () => openShop(ctx, s, 'horses')), optF(hostOf(state, s).lord ? 'Зал лорда' : 'Поговорить с кастеляном', hostHint(state, s), () => openHost(ctx, s)));
    } else {
      options.append(optF('Поговорить со старостой', hostHint(state, s), () => openHost(ctx, s)));
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
      const p = buyPrice(g, state);
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
      const p = sellPrice(g, state);
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
    h('div', { class: 'muted', style: 'font-size:12px' }, 'Цены везде одинаковые, продажа — за 80% цены. Умение «Торговля» (ваше или спутника) улучшает обе цены.'),
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
        img(heroPortraitURL(state), 'px portrait'),
        h('div', { class: 'grow col', style: 'gap:2px' },
          h('div', { class: 'row', style: 'gap:8px' }, h('span', { class: 'name gold' }, state.hero.name), h('span', { class: 'muted', style: 'font-size:12px' }, `вассал: ${f.rulerTitle.toLowerCase()} ${f.ruler}`)),
          h('div', { class: 'sub' }, `Уровень ${state.hero.level} · Опыт ${state.hero.xp}${state.hero.points ? ` · свободных очков: ${state.hero.points}` : ''}`),
        ),
        btn('Снаряжение', () => openHero(ctx), 'small primary'),
      ),
    );
    for (const { def, cs } of inParty(state)) {
      const m = mood(cs.loyalty);
      const wounded = isWounded(state, cs);
      body.append(
        h(
          'div',
          { class: 'item', style: 'border-color:#4a3a5a' },
          img(companionPortraitURL(def.id), 'px portrait'),
          h('div', { class: 'grow col', style: 'gap:2px' },
            h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
              h('span', { class: 'name', style: 'color:#c8a0e8' }, def.name),
              h('span', { class: 'muted', style: 'font-size:12px' }, `${def.title} · ур. ${cs.level}`),
              wounded ? h('span', { style: 'font-size:12px;color:#e07a6a' }, `ранен ещё ${Math.ceil((cs.woundedUntil ?? 0) - state.time)} дн.`) : null,
            ),
            h('div', { class: 'stats' }, h('span', { class: 'gold' }, skillLine(def.skills)), h('span', {}, `жалованье ${def.wage} ¤/нед.`)),
            h('div', { class: 'row', style: 'gap:6px;font-size:12px;flex-wrap:wrap' },
              h('div', { style: 'flex:none;width:90px;height:6px;background:#0e0f10;border:1px solid #45494e' }, h('div', { style: `height:100%;width:${Math.max(0, Math.min(100, cs.loyalty))}%;background:${m.color}` })),
              h('span', { style: `color:${m.color};white-space:nowrap` }, `Настроение: ${m.text}`),
              h('span', { class: 'muted' }, `· любит: ${def.likes.map(deedName).join(', ') || '—'} · не терпит: ${def.dislikes.map(deedName).join(', ') || '—'}`),
            ),
          ),
          btn('Отпустить', () => { dismissCompanion(state, def.id); toast(`${def.name} ушёл искать другую службу`); ctx.commit(); render(); }, 'small ghost'),
        ),
      );
    }
    const troops = [...state.party.troops].sort((a, b) => TROOPS[b.id].tier - TROOPS[a.id].tier || (TROOPS[a.id].line === 'cavalry' ? -1 : 1));
    for (const stack of troops) {
      const t = TROOPS[stack.id];
      const ready = readyToUpgrade(stack);
      const xpPct = t.xpToUpgrade ? (ready >= stack.count ? 100 : Math.round(((stack.xp % t.xpToUpgrade) / t.xpToUpgrade) * 100)) : 100;
      const doUpgrade = (to: string, n: number) => {
        const k = upgrade(state, stack.id, to, n);
        if (k > 0) {
          sfxCoins();
          toast(`${t.name} → ${TROOPS[to].name} ×${k}`);
          ctx.commit();
        } else if (state.gold < t.upgradeCost) toast('Не хватает денег на повышение');
        render();
      };
      const upgradeRow = ready
        ? h(
            'div',
            { class: 'row', style: 'gap:4px;flex-wrap:wrap;margin-top:2px' },
            ...t.upgradesTo.flatMap((to) => [
              btn(`↑ ${TROOPS[to].name} · ${t.upgradeCost} ¤`, () => doUpgrade(to, 1), 'small primary', state.gold < t.upgradeCost),
              ready > 1 ? btn(`×${ready}`, () => doUpgrade(to, ready), 'small', state.gold < t.upgradeCost) : null,
            ]),
          )
        : null;
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
                  h('span', { class: ready ? 'gold' : 'muted' }, ready ? `Готовы к повышению: ${ready}` : `→ ${t.upgradesTo.map((u) => TROOPS[u].name).join(' / ')}`),
                )
              : h('div', { class: 'muted', style: 'font-size:12px' }, 'Высший уровень'),
            upgradeRow,
          ),
          h('div', { class: 'col', style: 'align-items:flex-end;gap:4px' },
            h('span', { class: 'count' }, `×${stack.count}`),
            btn('Распустить 1', () => { dismiss(state, stack.id, 1); ctx.commit(); render(); }, 'small ghost'),
          ),
        ),
      );
    }
    if (!troops.length) body.append(h('div', { class: 'muted', style: 'padding:8px' }, 'Отряд пуст. Наймите воинов в деревнях и городах.'));

    // Пленные
    const pris = state.prisoners ?? [];
    const lords = state.captives ?? [];
    if (pris.length || lords.length) body.append(h('div', { class: 'col-title', style: 'margin-top:6px' }, `Пленные · ${prisonerCount(state)} из ${prisonerCap(state)} под стражей`));
    for (const c of lords) {
      body.append(
        h(
          'div',
          { class: 'item', style: 'border-color:#6a5a3a' },
          img(emblemURL(c.faction), 'px', 'width:32px;height:36px'),
          h('div', { class: 'grow col', style: 'gap:2px' }, h('span', { class: 'name gold' }, c.name), h('div', { class: 'sub' }, `В плену ${Math.floor(state.time - c.since)} дн. Выкуп — ${lordRansom(c)} ¤ у торговца в любой таверне.`)),
          btn('Отпустить', () => { releaseLord(state, c); toast(`${c.name} отпущен и запомнит вашу щедрость`); ctx.commit(); render(); }, 'small ghost'),
        ),
      );
    }
    for (const p of pris) {
      const t = TROOPS[p.id];
      body.append(
        h(
          'div',
          { class: 'item' },
          img(portraitURL(p.id), 'px portrait'),
          h('div', { class: 'grow col', style: 'gap:2px' }, h('div', { class: 'row', style: 'gap:8px' }, h('span', { class: 'name' }, t.name), h('span', { class: 'stars' }, stars(t.tier))), h('div', { class: 'sub' }, `Выкуп ${ransomPrice(p.id)} ¤ за голову. Можно уговорить служить.`)),
          h('div', { class: 'col', style: 'align-items:flex-end;gap:4px' },
            h('span', { class: 'count' }, `×${p.count}`),
            btn('Уговорить служить', () => { toast(recruitPrisoner(state, p.id) ? `${t.name} согласился служить вам` : `${t.name} плюнул под ноги и отказался`); ctx.commit(); render(); }, 'small'),
          ),
        ),
      );
    }
  };

  const head = header('Отряд', sub, () => close(), emblemURL(state.hero.faction));
  const closeBtn = head.lastElementChild as HTMLElement;
  closeBtn.style.marginLeft = '6px';
  head.insertBefore(btn('Древо воинов', () => openTroopTree(state), 'small', false, 'Как растут воины'), closeBtn).setAttribute('style', 'margin-left:auto');
  const content = panel('modal', head, body);
  render();
  close = openModal(content);
}

const DEED_NAME: Record<string, string> = {
  raid: 'грабёж деревень',
  caravan: 'грабёж караванов',
  retreat: 'отступление',
  defeat: 'поражения',
  victory: 'победы',
  siege: 'штурмы',
  tourney: 'турниры',
  lord: 'победы над лордами',
  cruelty: 'жестокость',
};
function deedName(d: string) {
  return DEED_NAME[d] ?? d;
}

// ───────────────────────── обзор держав ─────────────────────────

function lordLine(state: GameState, id: FactionId) {
  const all = (state.lords ?? []).filter((l) => l.faction === id);
  const active = activeLords(state, id);
  const men = active.reduce((n, l) => n + troopCount(l.troops), 0);
  const sieges = Object.entries(state.war?.sieges ?? {}).filter(([, sg]) => sg.attacker === id).map(([sid]) => world.byId.get(sid)?.name);
  const besieged = Object.keys(state.war?.sieges ?? {}).filter((sid) => state.settlements[sid].owner === id).map((sid) => world.byId.get(sid)?.name);
  return h(
    'div',
    { class: 'sub' },
    `Лорды: ${active.length} из ${all.length} в строю · войско ≈ ${men} ⚔`,
    sieges.length ? h('span', { style: 'color:#e8c04a' }, ` · осаждает ${sieges.join(', ')}`) : null,
    besieged.length ? h('span', { style: 'color:#e07a6a' }, ` · в осаде ${besieged.join(', ')}`) : null,
    h('span', { class: 'muted' }, ' · нажмите — список'),
  );
}

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
    const lordList = h('div', { class: 'col', style: 'display:none;gap:1px;margin-top:4px;font-size:12.5px' });
    for (const l of (state.lords ?? []).filter((x) => x.faction === id)) {
      const info = l.lord!;
      const where = info.target ? world.byId.get(info.target)?.name : '';
      const task = info.status === 'defeated'
        ? `разбит, вернётся через ${Math.max(1, Math.ceil(info.recoverAt - state.time))} дн.`
        : info.task === 'campaign' ? (state.war?.sieges[info.target!] ? `осаждает ${where}` : `идёт на ${where}`) : info.task === 'relieve' ? `спешит к ${where}` : info.task === 'follow' ? 'идёт с вашим отрядом' : 'в своих землях';
      lordList.append(h('div', { class: 'row', style: 'gap:6px' }, h('span', { style: info.status === 'defeated' ? 'color:#8a8070;text-decoration:line-through' : '' }, l.name), h('span', { class: 'muted' }, `· ${info.status === 'active' ? troopCount(l.troops) + ' ⚔ · ' : ''}${task}`)));
    }
    if (state.war?.eliminated.includes(id)) lordList.append(h('div', { style: 'color:#e07a6a' }, 'Держава пала.'));
    body.append(
      h(
        'div',
        { class: 'item', style: id === state.hero.faction ? 'border-color:#6a5a3a' : '' },
        img(emblemURL(id), 'px', 'width:32px;height:36px'),
        h('div', { class: 'grow col', style: 'gap:2px' },
          h('div', { class: 'row', style: 'gap:8px' }, h('span', { class: 'name', style: `color:${f.css}` }, f.name), id === state.hero.faction ? h('span', { class: 'gold', style: 'font-size:12px' }, 'ваша держава') : null),
          h('div', { class: 'sub' }, `${f.rulerTitle} ${f.ruler} · Городов: ${towns}, замков: ${castles}, деревень: ${villages}`),
          h('div', { class: 'sub', style: wars.length ? 'color:#e07a6a' : '' }, wars.length ? `Воюет с: ${wars.join(', ')}` : 'Ни с кем не воюет'),
          lordLine(state, id),
          lordList,
        ),
      ),
    );
    const item = body.lastElementChild as HTMLElement;
    item.style.cursor = 'pointer';
    item.onclick = () => (lordList.style.display = lordList.style.display === 'none' ? '' : 'none');
  }
  body.append(h('div', { class: 'muted', style: 'font-size:12px;padding:4px' }, 'Цель игры: ваша держава должна владеть всеми городами и замками.'));
  const content = panel('modal', header('Державы', null, () => close()), body);
  close = openModal(content);
}

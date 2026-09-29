import { ITEMS, SLOT_NAME, SLOTS, type Item } from '../data/items';
import { DAMAGE_NAME } from '../data/troops';
import { heroEmblemURL, heroFigureURL, itemIconURL } from '../gfx/icons';
import { openArmsEditor } from './heraldry';
import { addPoint, addSkill, equipFromBag, equipped, heroLook, heroStats, unequip } from '../game/hero';
import { SKILL_MAX, SKILLS } from '../data/skills';
import { partySkill, skillOwner } from '../game/companions';
import { heroXpToLevel } from '../game/battleResult';
import { buyItem, itemSellPrice, sellBagItem, SHOP_NAME, SHOP_SLOTS, shopStock, type ShopKind } from '../game/shop';
import type { HeroAttrs } from '../game/state';
import type { Settlement } from '../game/world';
import { btn, h, img, openModal, panel, sfxCoins, stars, toast } from './dom';
import type { GameCtx } from './panels';
import { tr } from '../i18n';

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Короткое описание свойств предмета. */
export function itemStats(it: Item): string {
  switch (it.slot) {
    case 'weapon':
      return tr`Урон ${it.damage} (${DAMAGE_NAME[it.damageType ?? 'cut']}) · удар ${it.attackTime} с · крит ${pct(it.crit ?? 0)}${it.twoHanded ? tr(' · двуручное') : ''}`;
    case 'shield':
      return tr`Блок ${pct(it.block ?? 0)} · вес ${it.weight}`;
    case 'horse':
      return tr`Скорость ${it.speed} · здоровье +${it.hpBonus ?? 0}${it.barding ? tr(' · броня коня') : ''}`;
    default:
      return tr`Защита: рубящ. ${pct(it.armor!.cut)}, колющ. ${pct(it.armor!.pierce)}, дробящ. ${pct(it.armor!.blunt)} · вес ${it.weight ?? 0}`;
  }
}

/** Сравнение с надетым: число и знак. */
function compare(it: Item, cur: Item | null): { text: string; better: boolean } | null {
  const v = (x: Item | null): number => {
    if (!x) return 0;
    switch (x.slot) {
      case 'weapon':
        return (x.damage ?? 0) / (x.attackTime ?? 1.2);
      case 'shield':
        return x.block ?? 0;
      case 'horse':
        return (x.speed ?? 0) + (x.hpBonus ?? 0) / 100;
      default:
        return x.armor ? (x.armor.cut + x.armor.pierce + x.armor.blunt) / 3 : 0;
    }
  };
  if (cur?.id === it.id) return { text: tr('надето'), better: false };
  const d = v(it) - v(cur);
  if (Math.abs(d) < 0.001) return null;
  const txt = it.slot === 'weapon' ? tr`${d > 0 ? '+' : ''}${d.toFixed(1)} урона/с` : it.slot === 'horse' ? `${d > 0 ? tr('лучше') : tr('хуже')}` : tr`${d > 0 ? '+' : ''}${Math.round(d * 100)}% защиты`;
  return { text: txt, better: d > 0 };
}

function itemRow(ctx: GameCtx, it: Item, right: HTMLElement, note?: HTMLElement | null) {
  return h(
    'div',
    { class: 'item' },
    img(itemIconURL(it, ctx.state.hero.faction), 'px portrait', 'width:44px;height:44px'),
    h(
      'div',
      { class: 'grow col', style: 'gap:1px' },
      h('div', { class: 'row', style: 'gap:8px' }, h('span', { class: 'name' }, it.name), h('span', { class: 'stars' }, stars(Math.min(4, Math.ceil(it.tier / 1.5)))), note ?? null),
      h('div', { class: 'stats' }, itemStats(it)),
      h('div', { class: 'sub' }, it.description),
    ),
    right,
  );
}

// ───────────────────────── лавка ─────────────────────────

export function openShop(ctx: GameCtx, s: Settlement, kind: ShopKind) {
  const { state } = ctx;
  let close = () => {};
  const left = h('div', { class: 'list' });
  const right = h('div', { class: 'list' });
  const sub = h('div', {});
  const stock = shopStock(state, s, kind);

  const render = () => {
    sub.replaceChildren(h('span', { class: 'gold' }, `${state.gold} ¤`), tr(' · обновление ассортимента каждую неделю'));
    left.replaceChildren(h('div', { class: 'col-title' }, tr('Товар')));
    for (const it of stock) {
      const cur = equipped(state.hero, it.slot);
      const cmp = compare(it, cur);
      const note = cmp ? h('span', { style: `font-size:12px;color:${cmp.text === tr('надето') ? 'var(--muted)' : cmp.better ? '#7ad06a' : '#e07a6a'}` }, cmp.text) : null;
      const can = state.gold >= it.price;
      left.append(
        itemRow(
          ctx,
          it,
          h(
            'div',
            { class: 'col', style: 'align-items:flex-end;gap:4px' },
            h('span', { class: 'gold' }, `${it.price} ¤`),
            h(
              'div',
              { class: 'row', style: 'gap:4px' },
              btn(tr('В сумку'), () => { if (buyItem(state, it, false)) { sfxCoins(); toast(tr`Куплено: ${it.name}`); ctx.commit(); } render(); }, 'small', !can),
              btn(tr('Надеть'), () => { if (buyItem(state, it, true)) { sfxCoins(); toast(tr`Надето: ${it.name}`); ctx.commit(); } render(); }, 'small primary', !can),
            ),
          ),
          note,
        ),
      );
    }
    right.replaceChildren(h('div', { class: 'col-title' }, tr('Ваша сумка')));
    const bag = (state.hero.bag ?? []).map((id, i) => ({ it: ITEMS[id], i })).filter((x) => x.it && SHOP_SLOTS[kind].includes(x.it.slot));
    if (!bag.length) right.append(h('div', { class: 'muted', style: 'padding:6px' }, tr('Нечего продать. Снятые и трофейные вещи попадают в сумку.')));
    for (const { it, i } of bag) {
      right.append(
        itemRow(
          ctx,
          it,
          h(
            'div',
            { class: 'col', style: 'align-items:flex-end;gap:4px' },
            h('span', { class: 'gold' }, `${itemSellPrice(it)} ¤`),
            btn(tr('Продать'), () => { const p = sellBagItem(state, i); if (p) { sfxCoins(); toast(tr`Продано за ${p} ¤`); ctx.commit(); } render(); }, 'small'),
          ),
        ),
      );
    }
  };
  const content = panel(
    'modal wide',
    h('div', { class: 'head' }, h('div', {}, h('h2', { class: 'title' }, `${SHOP_NAME[kind]} — ${s.name}`), h('div', { class: 'muted', style: 'font-size:13px' }, sub)), btn('✕', () => close(), 'small close')),
    h('div', { class: 'body two-col shop' }, left, right),
  );
  render();
  close = openModal(content);
}

// ───────────────────────── окно героя ─────────────────────────

const ATTR_INFO: { k: keyof HeroAttrs; name: string; hint: string }[] = [
  { k: 'str', name: tr('Сила'), hint: tr('+5% урона за очко') },
  { k: 'agi', name: tr('Ловкость'), hint: tr('уклонение, крит, скорость удара') },
  { k: 'vit', name: tr('Живучесть'), hint: tr('+12 здоровья за очко') },
  { k: 'lead', name: tr('Лидерство'), hint: tr('+3 боевого духа армии, скидка на найм') },
];

export function openHero(ctx: GameCtx) {
  const { state } = ctx;
  const hero = state.hero;
  let close = () => {};
  const leftCol = h('div', { class: 'col' });
  const slotsCol = h('div', { class: 'col' });

  const render = () => {
    const st = heroStats(hero);
    const need = heroXpToLevel(hero.level);
    leftCol.replaceChildren(
      h(
        'div',
        { class: 'hero-figure' },
        img(heroFigureURL(heroLook(state)), 'px', 'width:224px;height:256px'),
      ),
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', { class: 'gold' }, tr`Уровень ${hero.level}`), h('span', { class: 'muted' }, tr`${hero.xp} / ${need} опыта`)),
      h('div', { class: 'power' }, h('div', { style: `width:${Math.min(100, (hero.xp / need) * 100)}%;background:var(--gold)` })),
      h('div', { class: 'col-title', style: 'margin-top:6px' }, hero.points ? tr`Характеристики · свободных очков: ${hero.points}` : tr('Характеристики')),
      ...ATTR_INFO.map((a) =>
        h(
          'div',
          { class: 'row attr' },
          h('span', { class: 'grow' }, h('b', {}, a.name), h('br'), h('span', { class: 'muted', style: 'font-size:11px' }, a.hint)),
          h('span', { class: 'big' }, `${(hero.attrs ?? { str: 3, agi: 3, vit: 3, lead: 3 })[a.k]}`),
          btn('+', () => { addPoint(hero, a.k); ctx.commit(); render(); }, 'small primary', !hero.points),
        ),
      ),
      h('div', { class: 'col-title', style: 'margin-top:8px' }, hero.skillPoints ? tr`Умения · свободных очков: ${hero.skillPoints}` : tr('Умения')),
      ...SKILLS.map((sk) => {
        const mine = hero.skills?.[sk.id] ?? 0;
        const team = sk.party ? partySkill(state, sk.id) : mine;
        return h(
          'div',
          { class: 'row attr' },
          h('span', { class: 'grow' }, h('b', {}, sk.name), sk.party ? h('span', { class: 'muted', style: 'font-size:11px' }, tr(' · отряда')) : null, h('br'), h('span', { class: 'muted', style: 'font-size:11px' }, sk.hint + (sk.party && team > mine ? tr` · в отряде ${team} (${skillOwner(state, sk.id)})` : ''))),
          h('span', { class: 'pips' }, ...Array.from({ length: SKILL_MAX }, (_, i) => h('i', { class: i < mine ? 'on' : i < team ? 'team' : '' }))),
          btn('+', () => { addSkill(hero, sk.id); ctx.commit(); render(); }, 'small primary', !hero.skillPoints || mine >= SKILL_MAX),
        );
      }),
      h(
        'div',
        { class: 'stats', style: 'margin-top:6px' },
        h('span', {}, tr`Здоровье ${st.hp}`),
        h('span', {}, tr`Урон ${st.damage} (${DAMAGE_NAME[st.damageType]})`),
        h('span', {}, tr`Удар ${st.attackTime} с`),
        h('span', {}, tr`Броня ${pct(st.armor.cut)}/${pct(st.armor.pierce)}/${pct(st.armor.blunt)}`),
        h('span', {}, tr`Крит ${pct(st.crit)}`),
        h('span', {}, tr`Уклон ${pct(st.dodge)}`),
        st.block ? h('span', {}, tr`Блок ${pct(st.block)}`) : null,
        h('span', {}, tr`${st.mounted ? tr('Верхом') : tr('Пешком')}, скорость ${st.speed.toFixed(2)}`),
        h('span', {}, tr`Вес ${st.weight.toFixed(1)}`),
        h('span', {}, tr`Боевой дух армии +${st.morale}`),
        h('span', {}, tr`Скидка на найм ${pct(st.hireDiscount)}`),
      ),
    );
    slotsCol.replaceChildren(h('div', { class: 'col-title' }, tr('Снаряжение')));
    for (const slot of SLOTS) {
      const it = equipped(hero, slot);
      const disabled = slot === 'shield' && equipped(hero, 'weapon')?.twoHanded;
      slotsCol.append(
        h(
          'div',
          { class: 'item slot-row' },
          it ? img(itemIconURL(it, hero.faction), 'px portrait', 'width:40px;height:40px') : h('div', { class: 'slot-empty' }),
          h('div', { class: 'grow col', style: 'gap:0' }, h('span', { class: 'muted', style: 'font-size:11px' }, SLOT_NAME[slot] + (disabled ? tr(' · не используется с двуручным') : '')), h('span', { class: 'name' }, it?.name ?? '—'), it ? h('span', { class: 'stats' }, itemStats(it)) : null),
          it ? btn(tr('Снять'), () => { unequip(hero, slot); ctx.commit(); render(); }, 'small ghost') : null,
        ),
      );
    }
    const bag = hero.bag ?? [];
    slotsCol.append(h('div', { class: 'col-title', style: 'margin-top:8px' }, tr`Сумка · ${bag.length}`));
    if (!bag.length) slotsCol.append(h('div', { class: 'muted', style: 'font-size:13px' }, tr('Пусто. Покупайте снаряжение у оружейников, бронников и на конюшнях, добывайте в бою.')));
    bag.forEach((id, i) => {
      const it = ITEMS[id];
      if (!it) return;
      slotsCol.append(
        h(
          'div',
          { class: 'item slot-row' },
          img(itemIconURL(it, hero.faction), 'px portrait', 'width:40px;height:40px'),
          h('div', { class: 'grow col', style: 'gap:0' }, h('span', { class: 'muted', style: 'font-size:11px' }, SLOT_NAME[it.slot]), h('span', { class: 'name' }, it.name), h('span', { class: 'stats' }, itemStats(it))),
          btn(tr('Надеть'), () => { equipFromBag(hero, i); ctx.commit(); render(); }, 'small primary'),
        ),
      );
    });
  };

  const content = panel(
    'modal wide',
    h('div', { class: 'head' }, h('div', {}, h('h2', { class: 'title' }, hero.name), h('div', { class: 'muted', style: 'font-size:13px' }, tr('Герой, снаряжение и характеристики'))), btn(h('span', { class: 'row', style: 'gap:6px' }, img(heroEmblemURL(state), 'px', 'width:16px;height:18px'), tr('Герб')), () => openArmsEditor(ctx, () => { close(); openHero(ctx); }), 'small', false, tr('Личный герб')), btn('✕', () => close(), 'small close')),
    h('div', { class: 'body hero-layout' }, leftCol, slotsCol),
  );
  render();
  close = openModal(content);
}

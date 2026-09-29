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

/** Отличия по характеристикам от надетого: «+6% рубящ.», «−0.2 с удар»… Зелёное — лучше, красное — хуже. */
export function statDiffs(it: Item, cur: Item | null): { text: string; better: boolean }[] {
  if (cur?.id === it.id) return [];
  const out: { text: string; better: boolean }[] = [];
  const add = (label: string, d: number, fmt: (v: number) => string, higherBetter = true) => {
    if (Math.abs(d) < 1e-6) return;
    out.push({ text: `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))} ${label}`, better: higherBetter ? d > 0 : d < 0 });
  };
  const p = (v: number) => `${Math.round(v * 100)}%`;
  switch (it.slot) {
    case 'weapon':
      add(tr('урона'), (it.damage ?? 0) - (cur?.damage ?? 0), (v) => String(Math.round(v)));
      add(tr('с на удар'), (it.attackTime ?? 1.2) - (cur?.attackTime ?? 1.2), (v) => v.toFixed(2), false);
      add(tr('крита'), (it.crit ?? 0) - (cur?.crit ?? 0), p);
      break;
    case 'shield':
      add(tr('блока'), (it.block ?? 0) - (cur?.block ?? 0), p);
      add(tr('веса'), (it.weight ?? 0) - (cur?.weight ?? 0), (v) => v.toFixed(1), false);
      break;
    case 'horse':
      add(tr('скорости'), (it.speed ?? 0) - (cur?.speed ?? 0), (v) => v.toFixed(2));
      add(tr('здоровья'), (it.hpBonus ?? 0) - (cur?.hpBonus ?? 0), (v) => String(Math.round(v)));
      break;
    default: {
      const a = it.armor ?? { cut: 0, pierce: 0, blunt: 0 };
      const b = cur?.armor ?? { cut: 0, pierce: 0, blunt: 0 };
      add(tr('рубящ.'), a.cut - b.cut, p);
      add(tr('колющ.'), a.pierce - b.pierce, p);
      add(tr('дробящ.'), a.blunt - b.blunt, p);
      add(tr('веса'), (it.weight ?? 0) - (cur?.weight ?? 0), (v) => v.toFixed(1), false);
    }
  }
  return out;
}

function diffChips(it: Item, cur: Item | null): HTMLElement | null {
  const d = statDiffs(it, cur);
  if (!d.length) return null;
  return h('div', { class: 'diffs' }, ...d.map((x) => h('span', { class: x.better ? 'up' : 'down' }, x.text)));
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
          h('span', {}, note, diffChips(it, cur)),
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
  let content: HTMLElement = slotsCol;

  /** Начать перетаскивание вещи. from: 'bag' (индекс в сумке) или 'equip' (слот). */
  const dragSource = (el: HTMLElement, it: Item, kind: 'bag' | 'equip', where: () => { index?: number; from?: string }) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const x0 = e.clientX;
      const y0 = e.clientY;
      let ghost: HTMLElement | null = null;
      let over: HTMLElement | null = null;
      const targets = () => [...content.querySelectorAll<HTMLElement>('[data-drop]')];
      const accepts = (t: HTMLElement) => (kind === 'bag' ? t.dataset.drop === it.slot || t.dataset.drop === 'hero' : t.dataset.drop === 'bag');
      const move = (ev: PointerEvent) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
          ghost = h('img', { class: 'px drag-ghost', src: (el as HTMLImageElement).src }) as HTMLElement;
          document.body.append(ghost);
          for (const t of targets()) t.classList.toggle('drop-ok', accepts(t));
        }
        ghost.style.left = `${ev.clientX - 22}px`;
        ghost.style.top = `${ev.clientY - 22}px`;
        const hit = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-drop]') ?? null;
        if (hit !== over) {
          over?.classList.remove('drop-over');
          over = hit && accepts(hit) ? hit : null;
          over?.classList.add('drop-over');
        }
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        ghost?.remove();
        for (const t of targets()) t.classList.remove('drop-ok', 'drop-over');
        if (!ghost || !over) return;
        const w = where();
        if (kind === 'bag' && w.index !== undefined) {
          equipFromBag(hero, w.index);
          toast(tr`Надето: ${it.name}`, 1500);
        } else if (kind === 'equip' && w.from) unequip(hero, w.from as Item['slot']);
        ctx.commit();
        render();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
  };

  const render = () => {
    const st = heroStats(hero);
    const need = heroXpToLevel(hero.level);
    leftCol.replaceChildren(
      h(
        'div',
        { class: 'hero-figure', 'data-drop': 'hero' },
        img(heroFigureURL(heroLook(state)), 'px', 'width:224px;height:256px'),
      ),
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', { class: 'gold' }, tr`Уровень ${hero.level}`), h('span', { class: 'muted' }, tr`${hero.xp} / ${need} опыта`)),
      h('div', { class: 'power' }, h('div', { style: `width:${Math.min(100, (hero.xp / need) * 100)}%;background:var(--gold)` })),
    );
    // Характеристики, умения и сводка — справа, под сумкой
    const extra: (HTMLElement | null)[] = [
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
    ];
    leftCol.append(h('div', { class: 'col-title', style: 'margin-top:6px' }, tr('Снаряжение'), h('span', { class: 'muted hint-inline' }, tr(' · тяните вещь из сумки на слот или на героя'))));
    for (const slot of SLOTS) {
      const it = equipped(hero, slot);
      const disabled = slot === 'shield' && equipped(hero, 'weapon')?.twoHanded;
      const icon = it ? img(itemIconURL(it, hero.faction), 'px portrait drag-handle', 'width:40px;height:40px') : h('div', { class: 'slot-empty' });
      const row = h(
        'div',
        { class: 'item slot-row', 'data-drop': slot },
        icon,
        h('div', { class: 'grow col', style: 'gap:0' }, h('span', { class: 'muted', style: 'font-size:11px' }, SLOT_NAME[slot] + (disabled ? tr(' · не используется с двуручным') : '')), h('span', { class: 'name' }, it?.name ?? '—'), it ? h('span', { class: 'stats' }, itemStats(it)) : null),
        it ? btn(tr('Снять'), () => { unequip(hero, slot); ctx.commit(); render(); }, 'small ghost') : null,
      );
      // Надетое можно утащить обратно в сумку
      if (it) dragSource(icon, it, 'equip', () => ({ from: slot }));
      leftCol.append(row);
    }
    const bag = hero.bag ?? [];
    const bagBox = h('div', { class: 'col bag-box', 'data-drop': 'bag' });
    slotsCol.replaceChildren(h('div', { class: 'col-title' }, tr`Сумка · ${bag.length}`), bagBox);
    if (!bag.length) bagBox.append(h('div', { class: 'muted', style: 'font-size:13px;padding:6px' }, tr('Пусто. Покупайте снаряжение у оружейников, бронников и на конюшнях, добывайте в бою.')));
    // Вещи по слотам, в слоте — сначала лучшие
    const score = (it: Item) => statDiffs(it, equipped(hero, it.slot)).reduce((n, d) => n + (d.better ? 1 : -1), 0);
    const order = bag
      .map((id, i) => ({ it: ITEMS[id], i }))
      .filter((x) => x.it)
      .sort((a, b) => SLOTS.indexOf(a.it.slot) - SLOTS.indexOf(b.it.slot) || score(b.it) - score(a.it) || b.it.tier - a.it.tier);
    for (const { it, i } of order) {
      const cur = equipped(hero, it.slot);
      const icon = img(itemIconURL(it, hero.faction), 'px portrait drag-handle', 'width:40px;height:40px');
      dragSource(icon, it, 'bag', () => ({ index: i }));
      bagBox.append(
        h(
          'div',
          { class: 'item slot-row' },
          icon,
          h(
            'div',
            { class: 'grow col', style: 'gap:0' },
            h('span', { class: 'muted', style: 'font-size:11px' }, SLOT_NAME[it.slot] + (cur ? tr` · сейчас: ${cur.name}` : tr(' · слот пуст'))),
            h('span', { class: 'name' }, it.name),
            h('span', { class: 'stats' }, itemStats(it)),
            diffChips(it, cur),
          ),
          btn(tr('Надеть'), () => { equipFromBag(hero, i); ctx.commit(); render(); }, 'small primary'),
        ),
      );
    }
    // Есть свободные очки — характеристики наверху, иначе под сумкой
    const ex = extra.filter((x): x is HTMLElement => !!x);
    if (hero.points || hero.skillPoints) slotsCol.prepend(...ex);
    else slotsCol.append(...ex);
  };

  content = panel(
    'modal wide',
    h('div', { class: 'head' }, h('div', {}, h('h2', { class: 'title' }, hero.name), h('div', { class: 'muted', style: 'font-size:13px' }, tr('Герой, снаряжение и характеристики'))), btn(h('span', { class: 'row', style: 'gap:6px' }, img(heroEmblemURL(state), 'px', 'width:16px;height:18px'), tr('Герб')), () => openArmsEditor(ctx, () => { close(); openHero(ctx); }), 'small', false, tr('Личный герб')), btn('✕', () => close(), 'small close')),
    h('div', { class: 'body hero-layout' }, leftCol, slotsCol),
  );
  render();
  close = openModal(content);
}

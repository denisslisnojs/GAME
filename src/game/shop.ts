import { FACTIONS } from '../data/factions';
import { ITEM_LIST, ITEM_SELL_RATIO, ITEMS, type Item, type Slot } from '../data/items';
import { mulberry32 } from '../util/rng';
import type { GameState } from './state';
import type { Settlement } from './world';

export type ShopKind = 'weapons' | 'armor' | 'horses';

export const SHOP_SLOTS: Record<ShopKind, Slot[]> = {
  weapons: ['weapon', 'shield'],
  armor: ['head', 'body', 'hands', 'legs'],
  horses: ['horse'],
};

export const SHOP_NAME: Record<ShopKind, string> = { weapons: 'Оружейник', armor: 'Бронник', horses: 'Конюшня' };

/** Города-мастерские: предельный уровень товара по видам лавок. */
const SPECIAL: Record<string, Partial<Record<ShopKind, number>>> = {
  milan: { armor: 6, weapons: 6 },
  nuremberg: { armor: 6, weapons: 5 },
  venice: { armor: 5, weapons: 5, horses: 4 },
  cologne: { armor: 5, weapons: 5 },
  paris: { armor: 5, horses: 5 },
  vienna: { horses: 6 },
  damascus: { weapons: 6, armor: 5 },
  cairo: { weapons: 5, horses: 6, armor: 5 },
  baghdad: { armor: 5 },
  sarai: { horses: 5, armor: 5 },
  karakorum: { horses: 5 },
  samarkand: { weapons: 5 },
  khanbaliq: { armor: 5, weapons: 5 },
  constantinople: { armor: 5, weapons: 5 },
  stockholm: { weapons: 5 },
  london: { weapons: 5 },
};

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function maxTier(s: Settlement, kind: ShopKind): number {
  const spec = SPECIAL[s.id]?.[kind];
  if (spec) return spec;
  const capital = Object.values(FACTIONS).some((f) => f.capital === s.id);
  return s.type === 'castle' ? 3 : capital ? 5 : 4;
}

/** Ассортимент меняется раз в неделю. */
export function shopStock(state: GameState, s: Settlement, kind: ShopKind): Item[] {
  const week = Math.floor(state.time / 7);
  const r = mulberry32(hashStr(s.id + kind) ^ (week * 2654435761));
  const cap = maxTier(s, kind);
  const slots = SHOP_SLOTS[kind];
  const pool = ITEM_LIST.filter((it) => slots.includes(it.slot) && it.tier <= cap && (it.cultures === 'all' || it.cultures.includes(s.culture)));
  const count = kind === 'horses' ? 4 : kind === 'weapons' ? 8 : 10;
  const chosen = new Set<Item>();
  // Лучший товар мастерской показываем всегда
  const top = pool.filter((it) => it.tier === cap);
  if (top.length) chosen.add(top[Math.floor(r() * top.length)]);
  while (chosen.size < Math.min(count, pool.length)) chosen.add(pool[Math.floor(r() * pool.length)]);
  return [...chosen].sort((a, b) => (a.slot === b.slot ? a.price - b.price : slots.indexOf(a.slot) - slots.indexOf(b.slot)));
}

export function buyItem(state: GameState, it: Item, equipNow: boolean): boolean {
  if (state.gold < it.price) return false;
  state.gold -= it.price;
  (state.flags ??= {}).gear = true;
  const h = state.hero;
  h.bag ??= [];
  h.equip ??= {};
  if (equipNow) {
    const old = h.equip[it.slot];
    if (old) h.bag.push(old);
    h.equip[it.slot] = it.id;
  } else h.bag.push(it.id);
  return true;
}

export function itemSellPrice(it: Item): number {
  return Math.floor(it.price * ITEM_SELL_RATIO);
}

export function sellBagItem(state: GameState, bagIndex: number): number {
  const h = state.hero;
  const id = h.bag?.[bagIndex];
  if (!id) return 0;
  const it = ITEMS[id];
  h.bag!.splice(bagIndex, 1);
  const p = itemSellPrice(it);
  state.gold += p;
  return p;
}

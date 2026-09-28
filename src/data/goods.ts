import type { FactionId } from './factions';

export type GoodId =
  | 'grain' | 'salt' | 'fish' | 'wine' | 'ale' | 'wool' | 'cloth' | 'linen' | 'furs' | 'leather'
  | 'iron' | 'tools' | 'honey' | 'wax' | 'oil' | 'amber' | 'silk' | 'spices' | 'incense' | 'dates'
  | 'cotton' | 'sugar' | 'paper' | 'dyes' | 'glass' | 'porcelain' | 'tea';

export interface Good {
  id: GoodId;
  name: string;
  /** Фиксированная цена покупки. Продажа — SELL_RATIO от неё. */
  price: number;
  /** Цвет значка. */
  color: string;
}

export const SELL_RATIO = 0.8;

export const GOODS: Record<GoodId, Good> = {
  grain: { id: 'grain', name: 'Зерно', price: 20, color: '#d9b75a' },
  salt: { id: 'salt', name: 'Соль', price: 45, color: '#e8e8e0' },
  fish: { id: 'fish', name: 'Сушёная рыба', price: 28, color: '#8fa3b0' },
  wine: { id: 'wine', name: 'Вино', price: 70, color: '#8a2d3b' },
  ale: { id: 'ale', name: 'Эль', price: 30, color: '#c08a3e' },
  wool: { id: 'wool', name: 'Шерсть', price: 50, color: '#e6ddc8' },
  cloth: { id: 'cloth', name: 'Сукно', price: 110, color: '#5a6fa8' },
  linen: { id: 'linen', name: 'Лён', price: 60, color: '#d8d2b0' },
  furs: { id: 'furs', name: 'Меха', price: 150, color: '#7a5535' },
  leather: { id: 'leather', name: 'Кожа', price: 70, color: '#9a6a3a' },
  iron: { id: 'iron', name: 'Железо', price: 80, color: '#7d8590' },
  tools: { id: 'tools', name: 'Инструменты', price: 120, color: '#a0a8b0' },
  honey: { id: 'honey', name: 'Мёд', price: 55, color: '#e0a526' },
  wax: { id: 'wax', name: 'Воск', price: 90, color: '#efd98a' },
  oil: { id: 'oil', name: 'Оливковое масло', price: 60, color: '#9aa83a' },
  amber: { id: 'amber', name: 'Янтарь', price: 200, color: '#e39a2a' },
  silk: { id: 'silk', name: 'Шёлк', price: 260, color: '#c84f8a' },
  spices: { id: 'spices', name: 'Пряности', price: 320, color: '#b5532a' },
  incense: { id: 'incense', name: 'Благовония', price: 240, color: '#b9a37a' },
  dates: { id: 'dates', name: 'Финики', price: 35, color: '#7a4a25' },
  cotton: { id: 'cotton', name: 'Хлопок', price: 80, color: '#f2f0ea' },
  sugar: { id: 'sugar', name: 'Сахар', price: 110, color: '#f5efe0' },
  paper: { id: 'paper', name: 'Бумага', price: 130, color: '#ebe3cc' },
  dyes: { id: 'dyes', name: 'Красители', price: 140, color: '#6a3fa0' },
  glass: { id: 'glass', name: 'Стекло', price: 160, color: '#7fc8d8' },
  porcelain: { id: 'porcelain', name: 'Фарфор', price: 300, color: '#dfe8f0' },
  tea: { id: 'tea', name: 'Чай', price: 180, color: '#5a7a3a' },
};

/** Что производят деревни каждой культуры (из этого набора деревня берёт 2–3 товара). */
export const VILLAGE_PRODUCE: Record<FactionId, GoodId[]> = {
  aurelia: ['grain', 'wine', 'wool', 'oil', 'honey', 'ale', 'linen'],
  nordmark: ['fish', 'furs', 'ale', 'wool', 'iron', 'amber', 'wax'],
  horde: ['leather', 'wool', 'salt', 'furs', 'honey', 'wax', 'grain'],
  sultanate: ['dates', 'oil', 'cotton', 'grain', 'sugar', 'salt'],
};

/** Базовый ассортимент городского рынка культуры. */
export const TOWN_BASE_GOODS: Record<FactionId, GoodId[]> = {
  aurelia: ['grain', 'wine', 'ale', 'wool', 'salt'],
  nordmark: ['fish', 'ale', 'wool', 'salt', 'grain'],
  horde: ['leather', 'salt', 'wool', 'grain'],
  sultanate: ['dates', 'grain', 'oil', 'salt'],
};

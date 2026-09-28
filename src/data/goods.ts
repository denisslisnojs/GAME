import type { FactionId } from './factions';
import { tr } from '../i18n';

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
  grain: { id: 'grain', name: tr('Зерно'), price: 20, color: '#d9b75a' },
  salt: { id: 'salt', name: tr('Соль'), price: 45, color: '#e8e8e0' },
  fish: { id: 'fish', name: tr('Сушёная рыба'), price: 28, color: '#8fa3b0' },
  wine: { id: 'wine', name: tr('Вино'), price: 70, color: '#8a2d3b' },
  ale: { id: 'ale', name: tr('Эль'), price: 30, color: '#c08a3e' },
  wool: { id: 'wool', name: tr('Шерсть'), price: 50, color: '#e6ddc8' },
  cloth: { id: 'cloth', name: tr('Сукно'), price: 110, color: '#5a6fa8' },
  linen: { id: 'linen', name: tr('Лён'), price: 60, color: '#d8d2b0' },
  furs: { id: 'furs', name: tr('Меха'), price: 150, color: '#7a5535' },
  leather: { id: 'leather', name: tr('Кожа'), price: 70, color: '#9a6a3a' },
  iron: { id: 'iron', name: tr('Железо'), price: 80, color: '#7d8590' },
  tools: { id: 'tools', name: tr('Инструменты'), price: 120, color: '#a0a8b0' },
  honey: { id: 'honey', name: tr('Мёд'), price: 55, color: '#e0a526' },
  wax: { id: 'wax', name: tr('Воск'), price: 90, color: '#efd98a' },
  oil: { id: 'oil', name: tr('Оливковое масло'), price: 60, color: '#9aa83a' },
  amber: { id: 'amber', name: tr('Янтарь'), price: 200, color: '#e39a2a' },
  silk: { id: 'silk', name: tr('Шёлк'), price: 260, color: '#c84f8a' },
  spices: { id: 'spices', name: tr('Пряности'), price: 320, color: '#b5532a' },
  incense: { id: 'incense', name: tr('Благовония'), price: 240, color: '#b9a37a' },
  dates: { id: 'dates', name: tr('Финики'), price: 35, color: '#7a4a25' },
  cotton: { id: 'cotton', name: tr('Хлопок'), price: 80, color: '#f2f0ea' },
  sugar: { id: 'sugar', name: tr('Сахар'), price: 110, color: '#f5efe0' },
  paper: { id: 'paper', name: tr('Бумага'), price: 130, color: '#ebe3cc' },
  dyes: { id: 'dyes', name: tr('Красители'), price: 140, color: '#6a3fa0' },
  glass: { id: 'glass', name: tr('Стекло'), price: 160, color: '#7fc8d8' },
  porcelain: { id: 'porcelain', name: tr('Фарфор'), price: 300, color: '#dfe8f0' },
  tea: { id: 'tea', name: tr('Чай'), price: 180, color: '#5a7a3a' },
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

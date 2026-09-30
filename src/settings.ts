// Настройки игрока: хранятся на устройстве и читаются один раз при запуске.

import { SETTINGS_KEY } from './config';

export type Quality = 'high' | 'low';

export interface Settings {
  music: number;
  sfx: number;
  /** Чёткость картинки: high — в пикселях экрана (до ×2), low — вдвое меньше точек (быстрее на слабых телефонах). */
  quality: Quality;
  /** Частицы, пыль, осадки в бою. */
  effects: boolean;
  /** Кровь и брызги в бою. */
  blood: boolean;
  /** Масштаб интерфейса (окна, кнопки, текст). */
  ui: number;
}

const DEFAULTS: Settings = { music: 0.55, sfx: 0.7, quality: 'high', effects: true, blood: true, ui: 1 };

export const UI_SCALES = [0.9, 1, 1.15, 1.3];

function read(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<Settings> | null;
    return { ...DEFAULTS, ...(s ?? {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = read();

export function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* нет хранилища */
  }
}

/** Масштаб интерфейса: окна и панели крупнее или мельче. */
export function applyUiScale() {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--ui-scale', String(settings.ui));
}

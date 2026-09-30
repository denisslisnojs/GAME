import { EN } from './en';
import { PT } from './pt';
import { TR } from './tr';

export type Lang = 'en' | 'ru' | 'pt' | 'tr';

/** Языки игры (название — на самом языке). */
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'ru', name: 'Русский' },
  { id: 'pt', name: 'Português' },
  { id: 'tr', name: 'Türkçe' },
];

const DICT: Record<Exclude<Lang, 'ru'>, Record<string, string>> = { en: EN, pt: PT, tr: TR };

const KEY = 'w1347_lang';

/** Язык при первом запуске — по языку устройства. */
function detect(): Lang {
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase();
  if (/^(ru|uk|be|kk)/.test(nav)) return 'ru';
  if (nav.startsWith('pt')) return 'pt';
  if (nav.startsWith('tr')) return 'tr';
  return 'en';
}

/** Язык выбирается один раз при загрузке модуля: смена языка перезагружает страницу. */
export const LANG: Lang = (() => {
  try {
    const v = localStorage.getItem(KEY);
    return LANGS.some((l) => l.id === v) ? (v as Lang) : detect();
  } catch {
    return 'en';
  }
})();

if (typeof document !== 'undefined') document.documentElement.lang = LANG;

function lookup(key: string): string {
  if (LANG === 'ru') return key;
  // Если перевода на выбранный язык нет — английский, в крайнем случае русский
  return DICT[LANG][key] ?? EN[key] ?? key;
}

/**
 * Перевод строки. Исходный текст (русский) служит ключом.
 * Обычный вызов: tr('Отряд'). Шаблон: tr`Уровень ${n}` — ключ «Уровень {0}».
 */
export function tr(s: string): string;
export function tr(strings: TemplateStringsArray, ...vals: unknown[]): string;
export function tr(s: string | TemplateStringsArray, ...vals: unknown[]): string {
  if (typeof s === 'string') return lookup(s);
  let key = s[0];
  for (let i = 1; i < s.length; i++) key += `{${i - 1}}` + s[i];
  const out = lookup(key);
  return vals.length ? out.replace(/\{(\d+)\}/g, (m, i: string) => (+i < vals.length ? String(vals[+i]) : m)) : out;
}

export function setLang(l: Lang): void {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
  location.reload();
}

/** Строчная буква там, где этого требует русская грамматика («вассал: император Карл»); в английском титул пишется с заглавной. */
export function lc(s: string): string {
  return LANG === 'ru' ? s.toLowerCase() : s;
}

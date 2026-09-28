import { EN } from './en';

export type Lang = 'en' | 'ru';

const KEY = 'w1347_lang';

/** Язык выбирается один раз при загрузке модуля: смена языка перезагружает страницу. */
export const LANG: Lang = (() => {
  try {
    return localStorage.getItem(KEY) === 'ru' ? 'ru' : 'en';
  } catch {
    return 'en';
  }
})();

if (typeof document !== 'undefined') document.documentElement.lang = LANG;

function lookup(key: string): string {
  return LANG === 'ru' ? key : (EN[key] ?? key);
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

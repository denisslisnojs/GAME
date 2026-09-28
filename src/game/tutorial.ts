// Обучение: первые шаги новичка с маленькой наградой за каждый.

import { partySize } from './logic';
import type { GameState } from './state';
import { tr } from '../i18n';

export interface TutorialStep {
  id: string;
  text: string;
  reward: number;
  done: (s: GameState) => boolean;
}

export const TUTORIAL: TutorialStep[] = [
  { id: 'hire', text: tr('Наймите воинов в деревне или городе, чтобы в отряде было 12 бойцов.'), reward: 60, done: (s) => partySize(s) >= 12 },
  { id: 'fight', text: tr('Разбейте шайку разбойников: коснитесь её на карте.'), reward: 120, done: (s) => (s.stats?.won ?? 0) >= 1 },
  { id: 'upgrade', text: tr('Повысьте опытного воина в окне «Отряд».'), reward: 60, done: (s) => !!s.flags?.upgraded },
  { id: 'gear', text: tr('Купите оружие или доспех в городской лавке.'), reward: 60, done: (s) => !!s.flags?.gear },
  { id: 'skill', text: tr('Вложите очко умения в окне героя (портрет слева вверху).'), reward: 40, done: (s) => Object.values(s.hero.skills ?? {}).some((v) => (v ?? 0) > 0) },
  { id: 'tavern', text: tr('Загляните в таверну: там спутники и наёмники.'), reward: 40, done: (s) => !!s.flags?.tavern },
  { id: 'quest', text: tr('Возьмите поручение у лорда или старосты.'), reward: 100, done: (s) => (s.quests?.length ?? 0) > 0 || (s.stats?.quests ?? 0) > 0 },
];

export function tutorialStep(s: GameState): TutorialStep | null {
  const t = s.tutorial;
  if (!t || t.off || t.step >= TUTORIAL.length) return null;
  return TUTORIAL[t.step];
}

/** Проверить текущий шаг; вернуть награду за выполненные шаги (и перейти дальше). */
export function tutorialTick(s: GameState): { done: TutorialStep; finished: boolean }[] {
  const out: { done: TutorialStep; finished: boolean }[] = [];
  let step = tutorialStep(s);
  while (step && step.done(s)) {
    s.gold += step.reward;
    s.tutorial!.step++;
    out.push({ done: step, finished: s.tutorial!.step >= TUTORIAL.length });
    step = tutorialStep(s);
  }
  return out;
}

export function flag(s: GameState, id: string) {
  (s.flags ??= {})[id] = true;
}

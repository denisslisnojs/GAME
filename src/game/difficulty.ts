import { tr } from '../i18n';
// Сложность: насколько больно бьют враги, щедра ли добыча и крепок ли дух противника.

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTY: Record<Difficulty, { name: string; hint: string; taken: number; gold: number; enemyMorale: number }> = {
  easy: { name: tr('Оруженосец'), hint: tr('враги бьют слабее, добычи больше'), taken: 0.75, gold: 1.25, enemyMorale: -10 },
  normal: { name: tr('Рыцарь'), hint: tr('как задумано'), taken: 1, gold: 1, enemyMorale: 0 },
  hard: { name: tr('Полководец'), hint: tr('враги бьют сильнее и стоят до конца'), taken: 1.25, gold: 0.85, enemyMorale: 10 },
};

export function diff(d?: Difficulty) {
  return DIFFICULTY[d ?? 'normal'];
}

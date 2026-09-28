import { tr } from '../i18n';
// Умения героя. Умения отряда (лечение, следопытство, торговля, обучение, тактика)
// берутся лучшими из героя и спутников — как в Mount & Blade.

export type SkillId = 'weapon' | 'shield' | 'riding' | 'athletics' | 'tactics' | 'surgery' | 'pathfinding' | 'trade' | 'training';

export const SKILL_MAX = 5;

export interface SkillDef {
  id: SkillId;
  name: string;
  hint: string;
  /** Умение отряда: работает лучшее значение среди героя и спутников. */
  party: boolean;
}

export const SKILLS: SkillDef[] = [
  { id: 'weapon', name: tr('Владение оружием'), hint: tr('+4% урона героя за ступень'), party: false },
  { id: 'shield', name: tr('Щит'), hint: tr('+5% блока щитом за ступень'), party: false },
  { id: 'riding', name: tr('Верховая езда'), hint: tr('+5% скорости героя верхом за ступень'), party: false },
  { id: 'athletics', name: tr('Атлетика'), hint: tr('+5% скорости пешком, +5 здоровья за ступень'), party: false },
  { id: 'tactics', name: tr('Тактика'), hint: tr('+4 боевого духа армии за ступень'), party: true },
  { id: 'surgery', name: tr('Лечение'), hint: tr('павшие воины чаще выживают ранеными'), party: true },
  { id: 'pathfinding', name: tr('Следопытство'), hint: tr('+4% скорости отряда на карте за ступень'), party: true },
  { id: 'trade', name: tr('Торговля'), hint: tr('покупка на 3% дешевле и продажа на 3% дороже за ступень'), party: true },
  { id: 'training', name: tr('Обучение'), hint: tr('воины каждый день набираются опыта'), party: true },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, SkillDef>;

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
  { id: 'weapon', name: 'Владение оружием', hint: '+4% урона героя за ступень', party: false },
  { id: 'shield', name: 'Щит', hint: '+5% блока щитом за ступень', party: false },
  { id: 'riding', name: 'Верховая езда', hint: '+5% скорости героя верхом за ступень', party: false },
  { id: 'athletics', name: 'Атлетика', hint: '+5% скорости пешком, +5 здоровья за ступень', party: false },
  { id: 'tactics', name: 'Тактика', hint: '+4 боевого духа армии за ступень', party: true },
  { id: 'surgery', name: 'Лечение', hint: 'павшие воины чаще выживают ранеными', party: true },
  { id: 'pathfinding', name: 'Следопытство', hint: '+4% скорости отряда на карте за ступень', party: true },
  { id: 'trade', name: 'Торговля', hint: 'покупка на 3% дешевле и продажа на 3% дороже за ступень', party: true },
  { id: 'training', name: 'Обучение', hint: 'воины каждый день набираются опыта', party: true },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, SkillDef>;

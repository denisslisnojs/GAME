import { FACTIONS, type FactionId } from '../data/factions';
import { TROOPS, type TroopDef } from '../data/troops';
import type { GameState } from '../game/state';
import type { ArmyDef, Formation } from './sim';

/** Боевые характеристики героя (до этапа 3 зависят только от уровня). */
export function heroTroop(state: GameState): TroopDef {
  const f = state.hero.faction;
  const base = TROOPS[`${f}_c3m`];
  const lvl = state.hero.level;
  return {
    ...base,
    id: 'hero',
    name: state.hero.name,
    tier: 4,
    hp: 150 + lvl * 12,
    damage: 22 + lvl * 2,
    damageType: 'cut',
    armor: { cut: 0.4, pierce: 0.33, blunt: 0.22 },
    attackTime: 1.2,
    crit: 0.14,
    dodge: 0.1,
    block: 0.28,
    speed: 2.0,
    look: { ...base.look, weapon: f === 'horde' || f === 'sultanate' ? 'sabre' : 'sword', shield: true },
  };
}

export function playerArmy(state: GameState, formation: Formation): ArmyDef {
  return {
    name: state.hero.name,
    culture: state.hero.faction,
    troops: state.party.troops.filter((t) => t.count > 0).map((t) => ({ id: t.id, count: t.count })),
    hero: { name: state.hero.name, level: state.hero.level, def: heroTroop(state) },
    formation,
    morale: 100,
  };
}

export function enemyArmy(name: string, culture: FactionId | 'outlaw', troops: { id: string; count: number }[]): ArmyDef {
  return {
    name,
    culture,
    troops,
    formation: 'classic',
    morale: culture === 'outlaw' ? 70 : 100,
  };
}

/** Грубая «сила» отряда для сравнения и решений ИИ. */
export function strength(troops: { id: string; count: number }[], withHero = false): number {
  let s = withHero ? 12 : 0;
  for (const t of troops) {
    const d = TROOPS[t.id];
    if (!d) continue;
    s += t.count * Math.pow(d.tier, 1.4) * (d.line === 'cavalry' ? 1.6 : 1);
  }
  return s;
}

export function factionColor(culture: FactionId | 'outlaw'): string {
  return culture === 'outlaw' ? '#7a3a2a' : FACTIONS[culture].css;
}

import { FACTIONS, type FactionId } from '../data/factions';
import { TROOPS } from '../data/troops';
import type { GameState } from '../game/state';
import { heroStats, heroTroop } from '../game/hero';
import type { ArmyDef, Formation } from './sim';

export function playerArmy(state: GameState, formation: Formation): ArmyDef {
  return {
    name: state.hero.name,
    culture: state.hero.faction,
    troops: state.party.troops.filter((t) => t.count > 0).map((t) => ({ id: t.id, count: t.count })),
    hero: { name: state.hero.name, level: state.hero.level, def: heroTroop(state) },
    formation,
    morale: 100 + heroStats(state.hero).morale,
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

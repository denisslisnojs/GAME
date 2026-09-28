import { FACTIONS } from '../data/factions';
import { TROOPS, type TroopDef } from '../data/troops';
import { hex } from '../gfx/pixel';
import type { UnitLook } from '../gfx/units';

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function troopLook(t: TroopDef): UnitLook {
  const f = t.faction === 'outlaw' ? null : FACTIONS[t.faction];
  return {
    culture: t.faction,
    tier: t.tier,
    helmet: t.look.helmet,
    cloth: t.look.cloth,
    cloth2: f ? hex(f.color2) : '#3a2a1e',
    armor: t.look.armor,
    weapon: t.look.weapon,
    shield: t.look.shield,
    mounted: t.line === 'cavalry',
    heavy: t.line === 'cavalry' && t.role === 'melee' && t.tier >= 3 && t.faction !== 'horde' && !t.look.camel,
    seed: hashStr(t.id),
    body: t.look.body,
    tabard: t.look.tabard,
    camel: t.line === 'cavalry' && !!t.look.camel,
  };
}

export function lookKey(l: UnitLook): string {
  return ['u', l.culture, l.tier, l.helmet, l.cloth, l.cloth2, l.armor, l.weapon, l.shield ? 1 : 0, l.mounted ? 1 : 0, l.heavy ? 1 : 0, l.hero ? 1 : 0, l.seed % 6, l.body ?? '', l.tabard ?? '', l.helmetMetal ?? '', l.gauntlets ?? '', l.greaves ?? '', l.horseColor ?? '', l.camel ? 'camel' : ''].join('_');
}

export { troopLook as lookOf };
export const allTroopIds = () => Object.keys(TROOPS);

import { FACTIONS } from '../data/factions';
import { ITEMS, SLOT_WEIGHT, type Item, type Slot } from '../data/items';
import { TROOPS, type DamageType, type TroopDef } from '../data/troops';
import { hex } from '../gfx/pixel';
import { SKILL_MAX, type SkillId } from '../data/skills';
import type { UnitLook } from '../gfx/units';
import type { GameState, Hero, HeroAttrs } from './state';

export interface HeroStats {
  hp: number;
  damage: number;
  damageType: DamageType;
  attackTime: number;
  crit: number;
  dodge: number;
  block: number;
  armor: Record<DamageType, number>;
  speed: number;
  mounted: boolean;
  weight: number;
  morale: number;
  hireDiscount: number;
}

const ATTRS_DEFAULT: HeroAttrs = { str: 3, agi: 3, vit: 3, lead: 3 };

export function attrs(h: Hero): HeroAttrs {
  return h.attrs ?? ATTRS_DEFAULT;
}

export function equipped(h: Hero, slot: Slot): Item | null {
  const id = h.equip?.[slot];
  return id ? ITEMS[id] ?? null : null;
}

export function heroStats(h: Hero): HeroStats {
  const a = attrs(h);
  const weapon = equipped(h, 'weapon');
  const shield = weapon?.twoHanded ? null : equipped(h, 'shield');
  const horse = equipped(h, 'horse');
  let weight = 0;
  const armor: Record<DamageType, number> = { cut: 0, pierce: 0, blunt: 0 };
  for (const slot of ['head', 'body', 'hands', 'legs'] as Slot[]) {
    const it = equipped(h, slot);
    const w = SLOT_WEIGHT[slot] ?? 0;
    if (it?.armor) for (const k of ['cut', 'pierce', 'blunt'] as DamageType[]) armor[k] += it.armor[k] * w;
    weight += it?.weight ?? 0;
  }
  weight += shield?.weight ?? 0;
  for (const k of ['cut', 'pierce', 'blunt'] as DamageType[]) armor[k] = Math.min(0.8, armor[k]);
  const baseDmg = weapon?.damage ?? 8;
  const sk = (id: keyof NonNullable<Hero['skills']>) => h.skills?.[id] ?? 0;
  return {
    hp: Math.round(70 + a.vit * 12 + h.level * 6 + (horse?.hpBonus ?? 0) + sk('athletics') * 5),
    damage: Math.round(baseDmg * (1 + a.str * 0.05) * (1 + sk('weapon') * 0.04)),
    damageType: weapon?.damageType ?? 'blunt',
    attackTime: +((weapon?.attackTime ?? 1.2) * Math.max(0.7, 1 - a.agi * 0.012)).toFixed(2),
    crit: +Math.min(0.45, (weapon?.crit ?? 0.05) + a.agi * 0.008).toFixed(3),
    dodge: +Math.max(0.02, Math.min(0.35, 0.06 + a.agi * 0.012 - weight * 0.004)).toFixed(3),
    block: shield ? Math.min(0.75, (shield.block ?? 0) + sk('shield') * 0.05) : 0,
    armor,
    speed: horse ? (horse.speed ?? 1.8) * (1 - weight * 0.004) * (1 + sk('riding') * 0.05) : 1.0 * (1 - weight * 0.006) * (1 + sk('athletics') * 0.05),
    mounted: !!horse,
    weight,
    morale: a.lead * 3,
    hireDiscount: Math.min(0.3, a.lead * 0.015),
  };
}

/** Герой как боевая единица. */
export function heroTroop(state: GameState): TroopDef {
  const h = state.hero;
  const st = heroStats(h);
  const weapon = equipped(h, 'weapon');
  const base = TROOPS[`${h.faction}_${st.mounted ? 'c3m' : 'i3m'}`];
  const look = heroLook(state);
  return {
    ...base,
    id: 'hero',
    name: h.name,
    tier: 4,
    line: st.mounted ? 'cavalry' : 'infantry',
    role: 'melee',
    hp: st.hp,
    damage: st.damage,
    damageType: st.damageType,
    armor: st.armor,
    attackTime: st.attackTime,
    crit: st.crit,
    dodge: st.dodge,
    block: st.block,
    speed: +st.speed.toFixed(2),
    range: 0,
    look: { helmet: look.helmet, cloth: look.cloth, armor: look.armor, weapon: weapon?.weapon ?? 'mace', shield: look.shield },
  };
}

/** Облик героя для боевого спрайта: собирается из надетого снаряжения. */
export function heroLook(state: GameState): UnitLook {
  const h = state.hero;
  const f = FACTIONS[h.faction];
  const head = equipped(h, 'head');
  const body = equipped(h, 'body');
  const hands = equipped(h, 'hands');
  const legs = equipped(h, 'legs');
  const weapon = equipped(h, 'weapon');
  const shield = weapon?.twoHanded ? null : equipped(h, 'shield');
  const horse = equipped(h, 'horse');
  const bodyKind = body?.body ?? 'cloth';
  const tier = !body ? 1 : bodyKind === 'plate' ? 4 : bodyKind === 'cloth' || bodyKind === 'leather' ? 2 : 3;
  return {
    culture: h.faction,
    tier,
    helmet: head?.helmet ?? 'none',
    cloth: hex(f.color),
    cloth2: hex(f.color2),
    armor: body?.metal ?? (bodyKind === 'leather' ? '#8a6a45' : bodyKind === 'cloth' ? '#c8b890' : '#9aa0a8'),
    helmetMetal: head?.metal,
    weapon: weapon?.weapon ?? 'mace',
    shield: !!shield,
    mounted: !!horse,
    heavy: !!horse?.barding,
    hero: true,
    seed: 7,
    body: bodyKind,
    tabard: body?.tabard ?? (bodyKind === 'mail' || bodyKind === 'scale'),
    gauntlets: hands?.metal,
    greaves: legs?.metal,
    horseColor: horse?.horseColor,
  };
}

/** Надеть предмет из сумки (старый уходит в сумку). */
export function equipFromBag(h: Hero, bagIndex: number) {
  h.bag ??= [];
  h.equip ??= {};
  const id = h.bag[bagIndex];
  const it = ITEMS[id];
  if (!it) return;
  h.bag.splice(bagIndex, 1);
  const old = h.equip[it.slot];
  if (old) h.bag.push(old);
  h.equip[it.slot] = id;
}

export function unequip(h: Hero, slot: Slot) {
  h.bag ??= [];
  h.equip ??= {};
  const old = h.equip[slot];
  if (!old) return;
  delete h.equip[slot];
  h.bag.push(old);
}

export function addSkill(h: Hero, id: SkillId) {
  if (!h.skillPoints || h.skillPoints <= 0) return;
  h.skills ??= {};
  if ((h.skills[id] ?? 0) >= SKILL_MAX) return;
  h.skills[id] = (h.skills[id] ?? 0) + 1;
  h.skillPoints--;
}

export function addPoint(h: Hero, k: keyof HeroAttrs) {
  if (!h.points || h.points <= 0) return;
  h.attrs ??= { ...ATTRS_DEFAULT };
  h.attrs[k]++;
  h.points--;
}

/** Суммарная «сила» героя для сравнения с врагом. */
export function heroPower(h: Hero): number {
  const st = heroStats(h);
  return (st.hp / 100) * (st.damage / 15) * (1 + st.armor.cut) * (st.mounted ? 1.4 : 1) * 6;
}

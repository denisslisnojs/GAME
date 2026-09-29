import type { FactionId } from './factions';
import type { BodyKind } from './items';
import { tr } from '../i18n';

export type DamageType = 'cut' | 'pierce' | 'blunt';
export type TroopLine = 'infantry' | 'cavalry';
export type TroopRole = 'melee' | 'ranged';
export type Weapon = 'pitchfork' | 'spear' | 'sword' | 'axe' | 'mace' | 'halberd' | 'bow' | 'crossbow' | 'lance' | 'sabre' | 'glaive' | 'handgonne' | 'firepot' | 'daneaxe' | 'falchion' | 'flail' | 'hammer' | 'flanged' | 'morningstar' | 'pollaxe' | 'bardiche';
export type Helmet = 'none' | 'hood' | 'cap' | 'kettle' | 'nasal' | 'bascinet' | 'great' | 'turban' | 'spired' | 'fur' | 'sallet' | 'armet' | 'coif' | 'kolpak' | 'barbute' | 'hounskull' | 'crested';
/** Форма щита. */
export type ShieldShape = 'board' | 'round' | 'heater' | 'kite' | 'buckler' | 'kalkan' | 'adarga' | 'hide';

export interface TroopLook {
  helmet: Helmet;
  /** Цвет одежды/сюрко. */
  cloth: string;
  /** Цвет доспеха (металл/кожа). */
  armor: string;
  weapon: Weapon;
  shield: boolean;
  /** Явный тип доспеха (берсерк — без доспеха); без него — по уровню. */
  body?: BodyKind;
  tabard?: boolean;
  /** Верхом на верблюде. */
  camel?: boolean;
}

/**
 * Особенности воина в бою. Часть выводится из оружия и строя (упор копий, стена щитов,
 * двуручник, застрельщик, павеза), часть задаётся явно.
 */
export type Trait = 'brace' | 'shieldwall' | 'javelin' | 'twohand' | 'skirmish' | 'pavise' | 'gun' | 'berserk' | 'feint' | 'firepot' | 'camel' | 'lasso';

export interface TroopDef {
  id: string;
  name: string;
  faction: FactionId | 'outlaw';
  tier: 1 | 2 | 3 | 4;
  line: TroopLine;
  role: TroopRole;
  hp: number;
  /** Снижение урона по типу, 0..1. */
  armor: Record<DamageType, number>;
  damage: number;
  damageType: DamageType;
  /** Секунд между атаками. */
  attackTime: number;
  /** Дальность атаки в метрах поля боя (0 — ближний бой). */
  range: number;
  /** Скорость движения, метров в секунду. */
  speed: number;
  crit: number;
  dodge: number;
  block: number;
  /** Цена найма (только для 1-го уровня). */
  hireCost: number;
  /** Цена повышения до следующего уровня и нужный опыт. */
  upgradeCost: number;
  xpToUpgrade: number;
  upgradesTo: string[];
  look: TroopLook;
  description: string;
  /** Явные особенности (к ним добавляются выведенные из оружия, см. traitsOf). */
  traits?: Trait[];
}

type Slot = 'i1' | 'i2' | 'i3m' | 'i3r' | 'i4m' | 'i4r' | 'c1' | 'c2' | 'c3m' | 'c3r' | 'c4m' | 'c4r';

interface Template {
  tier: 1 | 2 | 3 | 4;
  line: TroopLine;
  role: TroopRole;
  hp: number;
  armor: [number, number, number];
  damage: number;
  attackTime: number;
  range: number;
  speed: number;
  crit: number;
  dodge: number;
  block: number;
  hireCost: number;
  upgradeCost: number;
  xpToUpgrade: number;
  next: Slot[];
}

const TEMPLATES: Record<Slot, Template> = {
  i1: { tier: 1, line: 'infantry', role: 'melee', hp: 40, armor: [0.04, 0.04, 0.04], damage: 8, attackTime: 1.5, range: 0, speed: 1.0, crit: 0.05, dodge: 0.1, block: 0, hireCost: 10, upgradeCost: 25, xpToUpgrade: 60, next: ['i2'] },
  i2: { tier: 2, line: 'infantry', role: 'melee', hp: 55, armor: [0.12, 0.1, 0.08], damage: 11, attackTime: 1.4, range: 0, speed: 1.0, crit: 0.06, dodge: 0.1, block: 0.1, hireCost: 0, upgradeCost: 60, xpToUpgrade: 150, next: ['i3m', 'i3r'] },
  i3m: { tier: 3, line: 'infantry', role: 'melee', hp: 75, armor: [0.28, 0.22, 0.15], damage: 16, attackTime: 1.3, range: 0, speed: 0.95, crit: 0.08, dodge: 0.08, block: 0.22, hireCost: 0, upgradeCost: 140, xpToUpgrade: 320, next: ['i4m'] },
  i3r: { tier: 3, line: 'infantry', role: 'ranged', hp: 60, armor: [0.15, 0.12, 0.1], damage: 14, attackTime: 2.2, range: 70, speed: 1.0, crit: 0.1, dodge: 0.12, block: 0, hireCost: 0, upgradeCost: 140, xpToUpgrade: 320, next: ['i4r'] },
  i4m: { tier: 4, line: 'infantry', role: 'melee', hp: 100, armor: [0.45, 0.35, 0.25], damage: 22, attackTime: 1.25, range: 0, speed: 0.9, crit: 0.1, dodge: 0.06, block: 0.3, hireCost: 0, upgradeCost: 0, xpToUpgrade: 0, next: [] },
  i4r: { tier: 4, line: 'infantry', role: 'ranged', hp: 75, armor: [0.25, 0.2, 0.15], damage: 20, attackTime: 2.0, range: 85, speed: 1.0, crit: 0.15, dodge: 0.12, block: 0, hireCost: 0, upgradeCost: 0, xpToUpgrade: 0, next: [] },
  c1: { tier: 1, line: 'cavalry', role: 'melee', hp: 70, armor: [0.12, 0.1, 0.08], damage: 12, attackTime: 1.5, range: 0, speed: 2.0, crit: 0.06, dodge: 0.08, block: 0.05, hireCost: 60, upgradeCost: 80, xpToUpgrade: 100, next: ['c2'] },
  c2: { tier: 2, line: 'cavalry', role: 'melee', hp: 90, armor: [0.22, 0.18, 0.12], damage: 16, attackTime: 1.4, range: 0, speed: 2.1, crit: 0.08, dodge: 0.08, block: 0.12, hireCost: 0, upgradeCost: 180, xpToUpgrade: 220, next: ['c3m', 'c3r'] },
  c3m: { tier: 3, line: 'cavalry', role: 'melee', hp: 120, armor: [0.4, 0.32, 0.22], damage: 24, attackTime: 1.35, range: 0, speed: 2.1, crit: 0.1, dodge: 0.06, block: 0.2, hireCost: 0, upgradeCost: 350, xpToUpgrade: 450, next: ['c4m'] },
  c3r: { tier: 3, line: 'cavalry', role: 'ranged', hp: 95, armor: [0.2, 0.16, 0.12], damage: 16, attackTime: 2.0, range: 60, speed: 2.3, crit: 0.12, dodge: 0.12, block: 0, hireCost: 0, upgradeCost: 350, xpToUpgrade: 450, next: ['c4r'] },
  c4m: { tier: 4, line: 'cavalry', role: 'melee', hp: 150, armor: [0.55, 0.45, 0.3], damage: 30, attackTime: 1.3, range: 0, speed: 2.0, crit: 0.12, dodge: 0.05, block: 0.25, hireCost: 0, upgradeCost: 0, xpToUpgrade: 0, next: [] },
  c4r: { tier: 4, line: 'cavalry', role: 'ranged', hp: 115, armor: [0.3, 0.25, 0.18], damage: 21, attackTime: 1.8, range: 70, speed: 2.3, crit: 0.16, dodge: 0.12, block: 0, hireCost: 0, upgradeCost: 0, xpToUpgrade: 0, next: [] },
};

interface Spec {
  name: string;
  weapon: Weapon;
  helmet: Helmet;
  shield: boolean;
  armor: string;
  description: string;
  traits?: Trait[];
  /** Поправки к шаблону. */
  mod?: Partial<{ hp: number; damage: number; armor: number; speed: number; block: number; dodge: number; attackTime: number; range: number; crit: number }>;
}

const PEASANT_DESC = tr('Вчерашний пахарь с вилами. Дёшев, слаб, но из него можно вырастить настоящего воина.');

const SPECS: Record<FactionId, { cloth: string } & Record<Slot, Spec>> = {
  aurelia: {
    cloth: '#3a6cc4',
    i1: { name: tr('Крестьянин'), weapon: 'pitchfork', helmet: 'hood', shield: false, armor: '#8a6d4a', description: PEASANT_DESC },
    i2: { name: tr('Ландвер'), weapon: 'spear', helmet: 'kettle', shield: true, armor: '#9a9a9a', description: tr('Городское ополчение: копьё, щит и железная шляпа.') },
    i3m: { name: tr('Имперский пехотинец'), weapon: 'sword', helmet: 'bascinet', shield: true, armor: '#a8adb4', description: tr('Кольчуга, бацинет и добрый меч. Держит строй под натиском.'), mod: { armor: 1.1 } },
    i3r: { name: tr('Генуэзский арбалетчик'), weapon: 'crossbow', helmet: 'kettle', shield: false, armor: '#9a9a9a', description: tr('Арбалет бьёт медленно, но пробивает кольчугу.'), mod: { damage: 1.25, attackTime: 1.3, range: 1.1 } },
    i4m: { name: tr('Доппельзольднер'), weapon: 'halberd', helmet: 'bascinet', shield: false, armor: '#c0c5cc', description: tr('Ветеран в полулатах с алебардой. Получает двойное жалованье — и заслуживает его.'), mod: { armor: 1.15, damage: 1.15, block: 0 } },
    i4r: { name: tr('Павезьер'), weapon: 'crossbow', helmet: 'bascinet', shield: true, armor: '#b0b5bc', description: tr('Арбалетчик с огромным щитом-павезой. Стреляет из-за укрытия.'), mod: { damage: 1.25, attackTime: 1.3, armor: 1.2 } },
    c1: { name: tr('Конный слуга'), weapon: 'spear', helmet: 'cap', shield: false, armor: '#8a6d4a', description: tr('Слуга при рыцарском коне. Умеет держаться в седле.') },
    c2: { name: tr('Сквайр'), weapon: 'sword', helmet: 'nasal', shield: true, armor: '#9a9a9a', description: tr('Оруженосец, мечтающий о рыцарских шпорах.') },
    c3m: { name: tr('Конный латник'), weapon: 'lance', helmet: 'bascinet', shield: true, armor: '#b0b5bc', description: tr('Тяжёлый всадник в латах. Таранный удар копьём сметает пехоту.'), mod: { damage: 1.1 } },
    c3r: { name: tr('Конный арбалетчик'), weapon: 'crossbow', helmet: 'kettle', shield: false, armor: '#9a9a9a', description: tr('Арбалетчик верхом: медленно, но метко.'), mod: { damage: 1.2, attackTime: 1.25 } },
    c4m: { name: tr('Имперский рыцарь'), weapon: 'lance', helmet: 'great', shield: true, armor: '#d0d5dc', description: tr('Цвет имперского рыцарства в полных латах. Сильнейшая конница Европы.'), mod: { armor: 1.1, damage: 1.1 } },
    c4r: { name: tr('Кондотьер'), weapon: 'crossbow', helmet: 'bascinet', shield: false, armor: '#c0c5cc', description: tr('Наёмный капитан итальянских войн. Стреляет, рубит и торгуется.'), mod: { damage: 1.2, attackTime: 1.25, armor: 1.1 } },
  },
  nordmark: {
    cloth: '#c24040',
    i1: { name: tr('Крестьянин'), weapon: 'pitchfork', helmet: 'hood', shield: false, armor: '#7a6448', description: PEASANT_DESC },
    i2: { name: tr('Бонд'), weapon: 'axe', helmet: 'cap', shield: true, armor: '#8a7050', description: tr('Свободный земледелец с топором и круглым щитом.'), traits: ['javelin'], mod: { hp: 1.1, block: 1.3 } },
    i3m: { name: tr('Хирдман'), weapon: 'axe', helmet: 'nasal', shield: true, armor: '#9aa0a8', description: tr('Дружинник ярла. Щит к щиту — стену не пробить.'), traits: ['javelin'], mod: { hp: 1.1, block: 1.3 } },
    i3r: { name: tr('Лесной лучник'), weapon: 'bow', helmet: 'hood', shield: false, armor: '#6a5a40', description: tr('Охотник из северных лесов. Бьёт белку в глаз.'), mod: { range: 1.15 } },
    i4m: { name: tr('Хускарл'), weapon: 'axe', helmet: 'nasal', shield: true, armor: '#b0b5bc', description: tr('Личная гвардия конунга с датским топором. Не отступает никогда.'), mod: { hp: 1.15, damage: 1.15, block: 1.2 } },
    i4r: { name: tr('Охотник Нордмарка'), weapon: 'bow', helmet: 'fur', shield: false, armor: '#7a6a50', description: tr('Лучший лучник Севера с тисовым длинным луком.'), mod: { range: 1.2, crit: 1.3 } },
    c1: { name: tr('Конный слуга'), weapon: 'spear', helmet: 'cap', shield: false, armor: '#7a6448', description: tr('Бонд, раздобывший лошадь.') },
    c2: { name: tr('Дружинник'), weapon: 'sword', helmet: 'nasal', shield: true, armor: '#9aa0a8', description: tr('Конный воин из дружины ярла.') },
    c3m: { name: tr('Конный хирдман'), weapon: 'axe', helmet: 'nasal', shield: true, armor: '#a8adb4', description: tr('Хирдман, привыкший сражаться и в седле.'), mod: { hp: 1.1, damage: 0.95 } },
    c3r: { name: tr('Конный лучник'), weapon: 'bow', helmet: 'hood', shield: false, armor: '#7a6a50', description: tr('Лёгкий стрелок на выносливой северной лошадке.'), mod: { damage: 0.95 } },
    c4m: { name: tr('Ярлов гвардеец'), weapon: 'sword', helmet: 'great', shield: true, armor: '#c0c5cc', description: tr('Отборный всадник из свиты ярла.'), mod: { hp: 1.1, damage: 0.95 } },
    c4r: { name: tr('Всадник-следопыт'), weapon: 'bow', helmet: 'fur', shield: false, armor: '#8a7a5a', description: tr('Разведчик, знающий каждую тропу Севера.'), mod: { range: 1.1 } },
  },
  horde: {
    cloth: '#e0aa24',
    i1: { name: tr('Крестьянин'), weapon: 'pitchfork', helmet: 'fur', shield: false, armor: '#8a6d4a', description: PEASANT_DESC },
    i2: { name: tr('Цэрэг'), weapon: 'spear', helmet: 'fur', shield: true, armor: '#8a6a45', description: tr('Новобранец тумена в стёганом халате.') },
    i3m: { name: tr('Пеший нукер'), weapon: 'sabre', helmet: 'spired', shield: true, armor: '#8f7a5a', description: tr('Воин в ламеллярном доспехе с кривой саблей.'), mod: { armor: 0.9 } },
    i3r: { name: tr('Степной лучник'), weapon: 'bow', helmet: 'fur', shield: false, armor: '#8a6a45', description: tr('Составной лук степи бьёт дальше любого другого.'), mod: { range: 1.1 } },
    i4m: { name: tr('Турхаут'), weapon: 'glaive', helmet: 'spired', shield: false, armor: '#a08a60', description: tr('Дневная стража хана с тяжёлой глефой.'), mod: { damage: 1.15, block: 0 } },
    i4r: { name: tr('Мэргэн'), weapon: 'bow', helmet: 'spired', shield: false, armor: '#9a8055', description: tr('Мастер-стрелок: три стрелы в воздухе одновременно.'), mod: { range: 1.15, attackTime: 0.85 } },
    c1: { name: tr('Табунщик'), weapon: 'spear', helmet: 'fur', shield: false, armor: '#8a6a45', description: tr('Степняк, выросший в седле.'), mod: { speed: 1.15 } },
    c2: { name: tr('Аратский всадник'), weapon: 'sabre', helmet: 'fur', shield: true, armor: '#8f7a5a', description: tr('Лёгкий всадник тумена.'), mod: { speed: 1.15 } },
    c3m: { name: tr('Тяжёлый нукер'), weapon: 'lance', helmet: 'spired', shield: true, armor: '#a08a60', description: tr('Всадник в ламеллярной броне на бронированном коне.'), mod: { speed: 1.1 } },
    c3r: { name: tr('Конный лучник'), weapon: 'bow', helmet: 'fur', shield: false, armor: '#8f7a5a', description: tr('Главное оружие Орды: стреляет на скаку и уходит от погони.'), traits: ['feint'], mod: { speed: 1.15, damage: 1.15, dodge: 1.2 } },
    c4m: { name: tr('Кешиктен'), weapon: 'lance', helmet: 'spired', shield: true, armor: '#b89a60', description: tr('Гвардеец личной стражи хана. Лучший из лучших.'), mod: { speed: 1.1, damage: 1.05 } },
    c4r: { name: tr('Хубилганский стрелок'), weapon: 'bow', helmet: 'spired', shield: false, armor: '#a88a55', description: tr('Легендарный конный лучник: не промахивается даже на полном скаку.'), traits: ['feint'], mod: { speed: 1.15, damage: 1.2, dodge: 1.2, crit: 1.2 } },
  },
  sultanate: {
    cloth: '#35a066',
    i1: { name: tr('Крестьянин'), weapon: 'pitchfork', helmet: 'turban', shield: false, armor: '#b09a70', description: PEASANT_DESC },
    i2: { name: tr('Ахдас'), weapon: 'spear', helmet: 'turban', shield: true, armor: '#a08a60', description: tr('Городское ополчение с копьём и лёгким щитом.'), traits: ['javelin'], mod: { dodge: 1.3 } },
    i3m: { name: tr('Копейщик'), weapon: 'spear', helmet: 'spired', shield: true, armor: '#a8a8a0', description: tr('Опытный копейщик. Длинное копьё — гроза конницы.'), mod: { dodge: 1.3 } },
    i3r: { name: tr('Лучник-рами'), weapon: 'bow', helmet: 'turban', shield: false, armor: '#a08a60', description: tr('Выученный стрелок из составного лука.'), mod: { dodge: 1.3 } },
    i4m: { name: tr('Гулям-страж'), weapon: 'sabre', helmet: 'spired', shield: true, armor: '#c0c0b8', description: tr('Гвардеец эмира в кольчуге и с дамасским клинком.'), mod: { damage: 1.1, dodge: 1.3 } },
    i4r: { name: tr('Мастер-рами'), weapon: 'bow', helmet: 'spired', shield: false, armor: '#b0a890', description: tr('Мастер стрельбы, обученный по трактатам о фурусийе.'), mod: { crit: 1.3, dodge: 1.3 } },
    c1: { name: tr('Бедуин-наездник'), weapon: 'spear', helmet: 'turban', shield: false, armor: '#b09a70', description: tr('Сын пустыни на быстром скакуне.'), mod: { speed: 1.1 } },
    c2: { name: tr('Фарис'), weapon: 'sabre', helmet: 'turban', shield: true, armor: '#a8a8a0', description: tr('Конный воин, знающий правила фурусийи.') },
    c3m: { name: tr('Мамлюк'), weapon: 'lance', helmet: 'spired', shield: true, armor: '#c0c0b8', description: tr('Воин-невольник, выращенный для войны. Страшен в ближнем бою.'), mod: { damage: 1.1 } },
    c3r: { name: tr('Туркопол'), weapon: 'bow', helmet: 'spired', shield: false, armor: '#a8a8a0', description: tr('Конный лучник на службе султана.') },
    c4m: { name: tr('Мамлюк Халки'), weapon: 'lance', helmet: 'spired', shield: true, armor: '#d0d0c8', description: tr('Элита мамлюков — личная гвардия султана.'), mod: { damage: 1.1, armor: 1.05 } },
    c4r: { name: tr('Эмирский стрелок'), weapon: 'bow', helmet: 'spired', shield: false, armor: '#b8b0a0', description: tr('Конный лучник эмира в кольчуге.'), mod: { crit: 1.2, armor: 1.1 } },
  },
};

function buildTroops(): Record<string, TroopDef> {
  const out: Record<string, TroopDef> = {};
  for (const faction of Object.keys(SPECS) as FactionId[]) {
    const specs = SPECS[faction];
    for (const slot of Object.keys(TEMPLATES) as Slot[]) {
      const t = TEMPLATES[slot];
      const s = specs[slot];
      const m = s.mod ?? {};
      const k = (v: number, f?: number) => v * (f ?? 1);
      const armorK = m.armor ?? 1;
      out[`${faction}_${slot}`] = {
        id: `${faction}_${slot}`,
        name: s.name,
        faction,
        tier: t.tier,
        line: t.line,
        role: t.role,
        hp: Math.round(k(t.hp, m.hp)),
        armor: {
          cut: Math.min(0.75, t.armor[0] * armorK),
          pierce: Math.min(0.75, t.armor[1] * armorK),
          blunt: Math.min(0.75, t.armor[2] * armorK),
        },
        damage: Math.round(k(t.damage, m.damage)),
        damageType: damageTypeOf(s.weapon),
        attackTime: +k(t.attackTime, m.attackTime).toFixed(2),
        range: Math.round(k(t.range, m.range)),
        speed: +k(t.speed, m.speed).toFixed(2),
        crit: +Math.min(0.4, k(t.crit, m.crit)).toFixed(3),
        dodge: +Math.min(0.4, k(t.dodge, m.dodge)).toFixed(3),
        block: s.shield ? +Math.min(0.5, k(t.block || 0.1, m.block)).toFixed(3) : 0,
        hireCost: t.hireCost,
        upgradeCost: t.upgradeCost,
        xpToUpgrade: t.xpToUpgrade,
        upgradesTo: t.next.map((n) => `${faction}_${n}`),
        look: { helmet: s.helmet, cloth: specs.cloth, armor: s.armor, weapon: s.weapon, shield: s.shield },
        description: s.description,
        traits: s.traits,
      };
    }
  }
  return out;
}

// ───────────────────────── особые войска держав ─────────────────────────
// Третья ветка развития: от ополченца (i2) или всадника (c2) — к особому роду войск.

interface SpecialSpec {
  faction: FactionId;
  slot: 'i3s' | 'i4s' | 'c3s' | 'c4s';
  name: string;
  tier: 3 | 4;
  line: TroopLine;
  role: TroopRole;
  hp: number;
  armor: [number, number, number];
  damage: number;
  damageType?: DamageType;
  attackTime: number;
  range: number;
  speed: number;
  crit: number;
  dodge: number;
  block: number;
  look: Omit<TroopLook, 'cloth'>;
  description: string;
  traits: Trait[];
}

const SPECIALS: SpecialSpec[] = [
  {
    faction: 'aurelia', slot: 'i3s', name: tr('Ручничник'), tier: 3, line: 'infantry', role: 'ranged',
    hp: 62, armor: [0.16, 0.13, 0.1], damage: 32, attackTime: 5.6, range: 42, speed: 0.95, crit: 0.05, dodge: 0.08, block: 0,
    look: { helmet: 'kettle', armor: '#9a9a9a', weapon: 'handgonne', shield: false },
    description: tr('Новинка из Италии: железная трубка на древке. Перезаряжается долго, зато пуля пробивает латы, а грохот пугает коней.'),
    traits: ['gun'],
  },
  {
    faction: 'aurelia', slot: 'i4s', name: tr('Кулевринер'), tier: 4, line: 'infantry', role: 'ranged',
    hp: 78, armor: [0.26, 0.21, 0.16], damage: 40, attackTime: 5.0, range: 52, speed: 0.95, crit: 0.06, dodge: 0.08, block: 0,
    look: { helmet: 'sallet', armor: '#b0b5bc', weapon: 'handgonne', shield: false },
    description: tr('Мастер огненного боя с длинной кулевриной. Один выстрел — и рыцарь лежит в пыли.'),
    traits: ['gun'],
  },
  {
    faction: 'nordmark', slot: 'i3s', name: tr('Берсерк'), tier: 3, line: 'infantry', role: 'melee',
    hp: 98, armor: [0.05, 0.04, 0.04], damage: 19, attackTime: 1.05, range: 0, speed: 1.2, crit: 0.12, dodge: 0.14, block: 0,
    look: { helmet: 'fur', armor: '#6a4a30', weapon: 'axe', shield: false, body: 'bare', tabard: false },
    description: tr('Воин в медвежьей шкуре. Не носит доспеха и не знает страха: раны лишь распаляют его ярость.'),
    traits: ['berserk'],
  },
  {
    faction: 'nordmark', slot: 'i4s', name: tr('Ульфхеднар'), tier: 4, line: 'infantry', role: 'melee',
    hp: 118, armor: [0.1, 0.08, 0.06], damage: 25, attackTime: 1.2, range: 0, speed: 1.2, crit: 0.16, dodge: 0.14, block: 0,
    look: { helmet: 'fur', armor: '#4a3a2c', weapon: 'daneaxe', shield: false, body: 'bare', tabard: false },
    description: tr('Волкоголовый воин из древних саг с датской секирой. Там, где он прошёл, строй рассыпается.'),
    traits: ['berserk'],
  },
  {
    faction: 'horde', slot: 'c3s', name: tr('Арканщик'), tier: 3, line: 'cavalry', role: 'melee',
    hp: 110, armor: [0.2, 0.16, 0.12], damage: 18, attackTime: 1.4, range: 0, speed: 2.35, crit: 0.08, dodge: 0.15, block: 0,
    look: { helmet: 'fur', armor: '#8f7a5a', weapon: 'sabre', shield: false },
    description: tr('Степняк с волосяным арканом: на полном скаку сдёргивает всадника с седла.'),
    traits: ['lasso'],
  },
  {
    faction: 'horde', slot: 'c4s', name: tr('Багатур-арканщик'), tier: 4, line: 'cavalry', role: 'melee',
    hp: 128, armor: [0.3, 0.25, 0.18], damage: 24, attackTime: 1.3, range: 0, speed: 2.35, crit: 0.12, dodge: 0.12, block: 0,
    look: { helmet: 'spired', armor: '#a08a60', weapon: 'sabre', shield: false },
    description: tr('Прославленный багатур: его аркан не знает промаха, а сабля добивает упавших.'),
    traits: ['lasso'],
  },
  {
    faction: 'sultanate', slot: 'i3s', name: tr('Наффатун'), tier: 3, line: 'infantry', role: 'ranged',
    hp: 64, armor: [0.12, 0.1, 0.08], damage: 12, damageType: 'blunt', attackTime: 4.6, range: 28, speed: 1.0, crit: 0.05, dodge: 0.15, block: 0,
    look: { helmet: 'turban', armor: '#a08a60', weapon: 'firepot', shield: false },
    description: tr('Метатель горшков с горящей нефтью. Огонь не гасят ни щит, ни кольчуга.'),
    traits: ['firepot'],
  },
  {
    faction: 'sultanate', slot: 'i4s', name: tr('Мастер-наффатун'), tier: 4, line: 'infantry', role: 'ranged',
    hp: 80, armor: [0.2, 0.16, 0.12], damage: 16, damageType: 'blunt', attackTime: 4.0, range: 32, speed: 1.0, crit: 0.06, dodge: 0.15, block: 0,
    look: { helmet: 'spired', armor: '#b0a890', weapon: 'firepot', shield: false },
    description: tr('Хранитель тайны «греческого огня». Его горшки летят дальше и горят жарче.'),
    traits: ['firepot'],
  },
  {
    faction: 'sultanate', slot: 'c3s', name: tr('Верблюжий всадник'), tier: 3, line: 'cavalry', role: 'melee',
    hp: 115, armor: [0.16, 0.13, 0.1], damage: 18, attackTime: 1.45, range: 0, speed: 1.9, crit: 0.07, dodge: 0.08, block: 0.12,
    look: { helmet: 'turban', armor: '#a8a8a0', weapon: 'spear', shield: true, camel: true },
    description: tr('Бедуин на боевом верблюде. Кони врага шарахаются от незнакомого запаха.'),
    traits: ['camel'],
  },
  {
    faction: 'sultanate', slot: 'c4s', name: tr('Хаджан'), tier: 4, line: 'cavalry', role: 'ranged',
    hp: 125, armor: [0.24, 0.2, 0.14], damage: 20, attackTime: 1.9, range: 65, speed: 2.0, crit: 0.14, dodge: 0.1, block: 0,
    look: { helmet: 'spired', armor: '#b8b0a0', weapon: 'bow', shield: false, camel: true },
    description: tr('Стрелок на быстром верблюде: бьёт издалека, а кони не смеют к нему подступиться.'),
    traits: ['camel'],
  },
];

function buildSpecials(base: Record<string, TroopDef>): Record<string, TroopDef> {
  const out: Record<string, TroopDef> = {};
  for (const sp of SPECIALS) {
    const id = `${sp.faction}_${sp.slot}`;
    const t3 = sp.tier === 3;
    const nextId = `${sp.faction}_${sp.slot.replace('3', '4')}`;
    out[id] = {
      id,
      name: sp.name,
      faction: sp.faction,
      tier: sp.tier,
      line: sp.line,
      role: sp.role,
      hp: sp.hp,
      armor: { cut: sp.armor[0], pierce: sp.armor[1], blunt: sp.armor[2] },
      damage: sp.damage,
      damageType: sp.damageType ?? damageTypeOf(sp.look.weapon),
      attackTime: sp.attackTime,
      range: sp.range,
      speed: sp.speed,
      crit: sp.crit,
      dodge: sp.dodge,
      block: sp.block,
      hireCost: 0,
      upgradeCost: t3 ? (sp.line === 'cavalry' ? 360 : 160) : 0,
      xpToUpgrade: t3 ? (sp.line === 'cavalry' ? 460 : 340) : 0,
      upgradesTo: t3 ? [nextId] : [],
      look: { ...sp.look, cloth: SPECS[sp.faction].cloth },
      description: sp.description,
      traits: sp.traits,
    };
    // Развилка у ополченца или всадника второго уровня получает третью ветку
    if (t3) {
      const from = base[`${sp.faction}_${sp.line === 'cavalry' ? 'c2' : 'i2'}`];
      if (from && !from.upgradesTo.includes(id)) from.upgradesTo = [...from.upgradesTo, id];
    }
  }
  return out;
}

function damageTypeOf(w: Weapon): DamageType {
  switch (w) {
    case 'mace':
      return 'blunt';
    case 'spear':
    case 'pitchfork':
    case 'lance':
    case 'bow':
    case 'crossbow':
    case 'handgonne':
      return 'pierce';
    case 'firepot':
      return 'blunt';
    default:
      return 'cut';
  }
}

function outlaw(id: string, name: string, o: Partial<TroopDef> & { look: TroopLook }): TroopDef {
  return {
    id,
    name,
    faction: 'outlaw',
    tier: 1,
    line: 'infantry',
    role: 'melee',
    hp: 40,
    armor: { cut: 0.05, pierce: 0.04, blunt: 0.03 },
    damage: 8,
    damageType: damageTypeOf(o.look.weapon),
    attackTime: 1.5,
    range: 0,
    speed: 1.0,
    crit: 0.07,
    dodge: 0.12,
    block: o.look.shield ? 0.12 : 0,
    hireCost: 0,
    upgradeCost: 0,
    xpToUpgrade: 0,
    upgradesTo: [],
    description: '',
    ...o,
  };
}

const OUTLAWS: TroopDef[] = [
  outlaw('outlaw_bandit', tr('Разбойник'), {
    look: { helmet: 'hood', cloth: '#6a3a2a', armor: '#6a5a40', weapon: 'mace', shield: false },
    description: tr('Лесной грабитель с дубиной. Опасен только толпой.'),
  }),
  outlaw('outlaw_archer', tr('Разбойник-лучник'), {
    tier: 2,
    role: 'ranged',
    hp: 50,
    damage: 11,
    range: 65,
    attackTime: 2.3,
    look: { helmet: 'hood', cloth: '#4a5a32', armor: '#5a4a38', weapon: 'bow', shield: false },
    description: tr('Бьёт из засады и сразу уходит в чащу.'),
  }),
  outlaw('outlaw_leader', tr('Главарь шайки'), {
    tier: 3,
    hp: 90,
    damage: 17,
    armor: { cut: 0.25, pierce: 0.2, blunt: 0.12 },
    look: { helmet: 'nasal', cloth: '#5a2a22', armor: '#8a8f96', weapon: 'axe', shield: true },
    description: tr('Бывший наёмник, ставший атаманом.'),
  }),
  outlaw('outlaw_pirate', tr('Морской разбойник'), {
    tier: 2,
    hp: 60,
    damage: 13,
    armor: { cut: 0.1, pierce: 0.08, blunt: 0.06 },
    look: { helmet: 'cap', cloth: '#2a3a5a', armor: '#6a5a40', weapon: 'axe', shield: true },
    description: tr('Грабит берега с быстрых ладей.'),
    traits: ['javelin'],
  }),
  outlaw('outlaw_raider', tr('Степной налётчик'), {
    tier: 2,
    line: 'cavalry',
    role: 'ranged',
    hp: 75,
    damage: 12,
    range: 55,
    attackTime: 2.0,
    speed: 2.3,
    dodge: 0.15,
    look: { helmet: 'fur', cloth: '#7a5a32', armor: '#6a4a2c', weapon: 'bow', shield: false },
    description: tr('Налетает, осыпает стрелами и исчезает в степи.'),
    traits: ['feint'],
  }),
  outlaw('outlaw_desert', tr('Пустынный разбойник'), {
    tier: 2,
    line: 'cavalry',
    hp: 80,
    damage: 15,
    speed: 2.2,
    armor: { cut: 0.1, pierce: 0.08, blunt: 0.06 },
    look: { helmet: 'turban', cloth: '#3a3028', armor: '#8a7a5a', weapon: 'sabre', shield: true },
    description: tr('Всадник пустыни, грабящий караваны.'),
  }),
];

/** Наёмные отряды из таверн: опытные бойцы без повышения, дорогие, но готовые сразу. */
const MERCS: TroopDef[] = [
  outlaw('merc_genoese', tr('Генуэзский арбалетчик'), {
    tier: 3,
    role: 'ranged',
    hp: 70,
    damage: 20,
    range: 75,
    attackTime: 2.8,
    armor: { cut: 0.22, pierce: 0.2, blunt: 0.12 },
    block: 0.2,
    hireCost: 160,
    look: { helmet: 'kettle', cloth: '#c83030', armor: '#9aa0a8', weapon: 'crossbow', shield: true },
    description: tr('Лучшие стрелки Европы: большой арбалет и павеза за спиной. Служат за звонкую монету.'),
  }),
  outlaw('merc_swiss', tr('Швейцарский алебардщик'), {
    tier: 3,
    hp: 85,
    damage: 21,
    attackTime: 1.7,
    armor: { cut: 0.25, pierce: 0.2, blunt: 0.14 },
    hireCost: 150,
    look: { helmet: 'kettle', cloth: '#b83a3a', armor: '#a0a6ae', weapon: 'halberd', shield: false },
    description: tr('Горцы из лесных кантонов. После Моргартена рыцари их побаиваются.'),
  }),
  outlaw('merc_almogavar', tr('Альмогавар'), {
    tier: 3,
    hp: 75,
    damage: 18,
    speed: 1.2,
    dodge: 0.2,
    armor: { cut: 0.12, pierce: 0.1, blunt: 0.06 },
    hireCost: 130,
    look: { helmet: 'cap', cloth: '#8a5a2a', armor: '#6a5a40', weapon: 'spear', shield: false },
    description: tr('Каталонские ветераны Великой компании: легки, быстры и безжалостны.'),
    traits: ['javelin'],
  }),
  outlaw('merc_knight', tr('Странствующий рыцарь'), {
    tier: 4,
    line: 'cavalry',
    hp: 150,
    damage: 30,
    speed: 2.1,
    armor: { cut: 0.42, pierce: 0.36, blunt: 0.22 },
    block: 0.25,
    hireCost: 320,
    look: { helmet: 'great', cloth: '#3a3a4a', armor: '#b8bec6', weapon: 'lance', shield: true },
    description: tr('Рыцарь без земли, продающий копьё. Страшен в таранном ударе.'),
  }),
  outlaw('merc_turcopole', tr('Туркопол-наёмник'), {
    tier: 3,
    line: 'cavalry',
    role: 'ranged',
    hp: 95,
    damage: 17,
    range: 60,
    attackTime: 2.0,
    speed: 2.4,
    dodge: 0.18,
    armor: { cut: 0.16, pierce: 0.12, blunt: 0.08 },
    hireCost: 220,
    look: { helmet: 'spired', cloth: '#5a4a3a', armor: '#8a7a5a', weapon: 'bow', shield: false },
    description: tr('Конный лучник, служивший и крестоносцам, и султанам.'),
  }),
  outlaw('merc_varangian', tr('Варяг'), {
    tier: 4,
    hp: 120,
    damage: 27,
    attackTime: 1.8,
    armor: { cut: 0.4, pierce: 0.32, blunt: 0.2 },
    block: 0.3,
    hireCost: 260,
    look: { helmet: 'nasal', cloth: '#6a2a2a', armor: '#9aa0a8', weapon: 'axe', shield: true },
    description: tr('Северянин из бывшей стражи василевса. Секира и щит — вот и вся его вера.'),
  }),
];

export const MERC_IDS = MERCS.map((t) => t.id);

const BASE_TROOPS = buildTroops();
export const TROOPS: Record<string, TroopDef> = { ...BASE_TROOPS, ...buildSpecials(BASE_TROOPS), ...Object.fromEntries([...OUTLAWS, ...MERCS].map((t) => [t.id, t])) };

// ───────────────────────── особенности ─────────────────────────

const traitCache = new WeakMap<TroopDef, Set<Trait>>();

function isPoleWeapon(w: Weapon) {
  return w === 'spear' || w === 'pitchfork' || w === 'halberd' || w === 'glaive';
}

/** Все особенности воина: явные и выведенные из оружия, щита и рода войск. */
export function traitsOf(t: TroopDef): Set<Trait> {
  let s = traitCache.get(t);
  if (s) return s;
  s = new Set(t.traits ?? []);
  const w = t.look.weapon;
  const foot = t.line === 'infantry';
  if (foot && t.role === 'melee' && isPoleWeapon(w) && t.tier >= 2) s.add('brace');
  if (foot && t.role === 'melee' && t.look.shield) s.add('shieldwall');
  if (w === 'halberd' || w === 'glaive' || w === 'daneaxe') s.add('twohand');
  if (!foot && t.role === 'ranged') s.add('skirmish');
  if (foot && t.role === 'ranged' && t.look.shield && w === 'crossbow') s.add('pavise');
  if (t.look.camel) s.add('camel');
  traitCache.set(t, s);
  return s;
}

export function hasTrait(t: TroopDef, x: Trait): boolean {
  return traitsOf(t).has(x);
}

export const TRAIT_INFO: Record<Trait, { name: string; hint: string }> = {
  brace: { name: tr('Упор копий'), hint: tr('Встречает конницу копьями: таранный удар о них разбивается') },
  shieldwall: { name: tr('Стена щитов'), hint: tr('В плотном строю почти неуязвим для стрел и держит натиск') },
  javelin: { name: tr('Дротики'), hint: tr('Перед сшибкой мечет дротики, застревающие в щитах') },
  twohand: { name: tr('Двуручник'), hint: tr('Бьёт сквозь щиты и доспехи, но сам без щита') },
  skirmish: { name: tr('Застрельщик'), hint: tr('Держит дистанцию и стреляет на скаку') },
  pavise: { name: tr('Павеза'), hint: tr('Стреляет из-за большого щита: стрелы его почти не берут') },
  gun: { name: tr('Порох'), hint: tr('Долго перезаряжается, но пуля пробивает латы, а грохот пугает коней. В дождь — осечки') },
  berserk: { name: tr('Берсерк'), hint: tr('Без доспеха; чем тяжелее ранен, тем яростнее бьёт, и никогда не бежит') },
  feint: { name: tr('Ложное отступление'), hint: tr('Уходит от погони, отстреливаясь, и расстраивает ряды преследователей') },
  firepot: { name: tr('Греческий огонь'), hint: tr('Мечет горшки с горящей нефтью: огонь жжёт сквозь доспех и пугает коней') },
  camel: { name: tr('Верблюд'), hint: tr('Кони врага боятся верблюдов и теряют натиск') },
  lasso: { name: tr('Аркан'), hint: tr('Сдёргивает вражеских всадников с коней') },
};

export function peasantOf(faction: FactionId): string {
  return `${faction}_i1`;
}
export function cavRecruitOf(faction: FactionId): string {
  return `${faction}_c1`;
}

export const DAMAGE_NAME: Record<DamageType, string> = { cut: tr('рубящий'), pierce: tr('колющий'), blunt: tr('дробящий') };

import type { FactionId } from './factions';

export type DamageType = 'cut' | 'pierce' | 'blunt';
export type TroopLine = 'infantry' | 'cavalry';
export type TroopRole = 'melee' | 'ranged';
export type Weapon = 'pitchfork' | 'spear' | 'sword' | 'axe' | 'mace' | 'halberd' | 'bow' | 'crossbow' | 'lance' | 'sabre' | 'glaive';
export type Helmet = 'none' | 'hood' | 'cap' | 'kettle' | 'nasal' | 'bascinet' | 'great' | 'turban' | 'spired' | 'fur' | 'sallet' | 'armet';

export interface TroopLook {
  helmet: Helmet;
  /** Цвет одежды/сюрко. */
  cloth: string;
  /** Цвет доспеха (металл/кожа). */
  armor: string;
  weapon: Weapon;
  shield: boolean;
}

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
  /** Поправки к шаблону. */
  mod?: Partial<{ hp: number; damage: number; armor: number; speed: number; block: number; dodge: number; attackTime: number; range: number; crit: number }>;
}

const PEASANT_DESC = 'Вчерашний пахарь с вилами. Дёшев, слаб, но из него можно вырастить настоящего воина.';

const SPECS: Record<FactionId, { cloth: string } & Record<Slot, Spec>> = {
  aurelia: {
    cloth: '#3a6cc4',
    i1: { name: 'Крестьянин', weapon: 'pitchfork', helmet: 'hood', shield: false, armor: '#8a6d4a', description: PEASANT_DESC },
    i2: { name: 'Ландвер', weapon: 'spear', helmet: 'kettle', shield: true, armor: '#9a9a9a', description: 'Городское ополчение: копьё, щит и железная шляпа.' },
    i3m: { name: 'Имперский пехотинец', weapon: 'sword', helmet: 'bascinet', shield: true, armor: '#a8adb4', description: 'Кольчуга, бацинет и добрый меч. Держит строй под натиском.', mod: { armor: 1.1 } },
    i3r: { name: 'Генуэзский арбалетчик', weapon: 'crossbow', helmet: 'kettle', shield: false, armor: '#9a9a9a', description: 'Арбалет бьёт медленно, но пробивает кольчугу.', mod: { damage: 1.25, attackTime: 1.3, range: 1.1 } },
    i4m: { name: 'Доппельзольднер', weapon: 'halberd', helmet: 'bascinet', shield: false, armor: '#c0c5cc', description: 'Ветеран в полулатах с алебардой. Получает двойное жалованье — и заслуживает его.', mod: { armor: 1.15, damage: 1.15, block: 0 } },
    i4r: { name: 'Павезьер', weapon: 'crossbow', helmet: 'bascinet', shield: true, armor: '#b0b5bc', description: 'Арбалетчик с огромным щитом-павезой. Стреляет из-за укрытия.', mod: { damage: 1.25, attackTime: 1.3, armor: 1.2 } },
    c1: { name: 'Конный слуга', weapon: 'spear', helmet: 'cap', shield: false, armor: '#8a6d4a', description: 'Слуга при рыцарском коне. Умеет держаться в седле.' },
    c2: { name: 'Сквайр', weapon: 'sword', helmet: 'nasal', shield: true, armor: '#9a9a9a', description: 'Оруженосец, мечтающий о рыцарских шпорах.' },
    c3m: { name: 'Конный латник', weapon: 'lance', helmet: 'bascinet', shield: true, armor: '#b0b5bc', description: 'Тяжёлый всадник в латах. Таранный удар копьём сметает пехоту.', mod: { damage: 1.1 } },
    c3r: { name: 'Конный арбалетчик', weapon: 'crossbow', helmet: 'kettle', shield: false, armor: '#9a9a9a', description: 'Арбалетчик верхом: медленно, но метко.', mod: { damage: 1.2, attackTime: 1.25 } },
    c4m: { name: 'Имперский рыцарь', weapon: 'lance', helmet: 'great', shield: true, armor: '#d0d5dc', description: 'Цвет имперского рыцарства в полных латах. Сильнейшая конница Европы.', mod: { armor: 1.1, damage: 1.1 } },
    c4r: { name: 'Кондотьер', weapon: 'crossbow', helmet: 'bascinet', shield: false, armor: '#c0c5cc', description: 'Наёмный капитан итальянских войн. Стреляет, рубит и торгуется.', mod: { damage: 1.2, attackTime: 1.25, armor: 1.1 } },
  },
  nordmark: {
    cloth: '#c24040',
    i1: { name: 'Крестьянин', weapon: 'pitchfork', helmet: 'hood', shield: false, armor: '#7a6448', description: PEASANT_DESC },
    i2: { name: 'Бонд', weapon: 'axe', helmet: 'cap', shield: true, armor: '#8a7050', description: 'Свободный земледелец с топором и круглым щитом.', mod: { hp: 1.1, block: 1.3 } },
    i3m: { name: 'Хирдман', weapon: 'axe', helmet: 'nasal', shield: true, armor: '#9aa0a8', description: 'Дружинник ярла. Щит к щиту — стену не пробить.', mod: { hp: 1.1, block: 1.3 } },
    i3r: { name: 'Лесной лучник', weapon: 'bow', helmet: 'hood', shield: false, armor: '#6a5a40', description: 'Охотник из северных лесов. Бьёт белку в глаз.', mod: { range: 1.15 } },
    i4m: { name: 'Хускарл', weapon: 'axe', helmet: 'nasal', shield: true, armor: '#b0b5bc', description: 'Личная гвардия конунга с датским топором. Не отступает никогда.', mod: { hp: 1.15, damage: 1.15, block: 1.2 } },
    i4r: { name: 'Охотник Нордмарка', weapon: 'bow', helmet: 'fur', shield: false, armor: '#7a6a50', description: 'Лучший лучник Севера с тисовым длинным луком.', mod: { range: 1.2, crit: 1.3 } },
    c1: { name: 'Конный слуга', weapon: 'spear', helmet: 'cap', shield: false, armor: '#7a6448', description: 'Бонд, раздобывший лошадь.' },
    c2: { name: 'Дружинник', weapon: 'sword', helmet: 'nasal', shield: true, armor: '#9aa0a8', description: 'Конный воин из дружины ярла.' },
    c3m: { name: 'Конный хирдман', weapon: 'axe', helmet: 'nasal', shield: true, armor: '#a8adb4', description: 'Хирдман, привыкший сражаться и в седле.', mod: { hp: 1.1, damage: 0.95 } },
    c3r: { name: 'Конный лучник', weapon: 'bow', helmet: 'hood', shield: false, armor: '#7a6a50', description: 'Лёгкий стрелок на выносливой северной лошадке.', mod: { damage: 0.95 } },
    c4m: { name: 'Ярлов гвардеец', weapon: 'sword', helmet: 'great', shield: true, armor: '#c0c5cc', description: 'Отборный всадник из свиты ярла.', mod: { hp: 1.1, damage: 0.95 } },
    c4r: { name: 'Всадник-следопыт', weapon: 'bow', helmet: 'fur', shield: false, armor: '#8a7a5a', description: 'Разведчик, знающий каждую тропу Севера.', mod: { range: 1.1 } },
  },
  horde: {
    cloth: '#e0aa24',
    i1: { name: 'Крестьянин', weapon: 'pitchfork', helmet: 'fur', shield: false, armor: '#8a6d4a', description: PEASANT_DESC },
    i2: { name: 'Цэрэг', weapon: 'spear', helmet: 'fur', shield: true, armor: '#8a6a45', description: 'Новобранец тумена в стёганом халате.' },
    i3m: { name: 'Пеший нукер', weapon: 'sabre', helmet: 'spired', shield: true, armor: '#8f7a5a', description: 'Воин в ламеллярном доспехе с кривой саблей.', mod: { armor: 0.9 } },
    i3r: { name: 'Степной лучник', weapon: 'bow', helmet: 'fur', shield: false, armor: '#8a6a45', description: 'Составной лук степи бьёт дальше любого другого.', mod: { range: 1.1 } },
    i4m: { name: 'Турхаут', weapon: 'glaive', helmet: 'spired', shield: false, armor: '#a08a60', description: 'Дневная стража хана с тяжёлой глефой.', mod: { damage: 1.15, block: 0 } },
    i4r: { name: 'Мэргэн', weapon: 'bow', helmet: 'spired', shield: false, armor: '#9a8055', description: 'Мастер-стрелок: три стрелы в воздухе одновременно.', mod: { range: 1.15, attackTime: 0.85 } },
    c1: { name: 'Табунщик', weapon: 'spear', helmet: 'fur', shield: false, armor: '#8a6a45', description: 'Степняк, выросший в седле.', mod: { speed: 1.15 } },
    c2: { name: 'Аратский всадник', weapon: 'sabre', helmet: 'fur', shield: true, armor: '#8f7a5a', description: 'Лёгкий всадник тумена.', mod: { speed: 1.15 } },
    c3m: { name: 'Тяжёлый нукер', weapon: 'lance', helmet: 'spired', shield: true, armor: '#a08a60', description: 'Всадник в ламеллярной броне на бронированном коне.', mod: { speed: 1.1 } },
    c3r: { name: 'Конный лучник', weapon: 'bow', helmet: 'fur', shield: false, armor: '#8f7a5a', description: 'Главное оружие Орды: стреляет на скаку и уходит от погони.', mod: { speed: 1.15, damage: 1.15, dodge: 1.2 } },
    c4m: { name: 'Кешиктен', weapon: 'lance', helmet: 'spired', shield: true, armor: '#b89a60', description: 'Гвардеец личной стражи хана. Лучший из лучших.', mod: { speed: 1.1, damage: 1.05 } },
    c4r: { name: 'Хубилганский стрелок', weapon: 'bow', helmet: 'spired', shield: false, armor: '#a88a55', description: 'Легендарный конный лучник: не промахивается даже на полном скаку.', mod: { speed: 1.15, damage: 1.2, dodge: 1.2, crit: 1.2 } },
  },
  sultanate: {
    cloth: '#35a066',
    i1: { name: 'Крестьянин', weapon: 'pitchfork', helmet: 'turban', shield: false, armor: '#b09a70', description: PEASANT_DESC },
    i2: { name: 'Ахдас', weapon: 'spear', helmet: 'turban', shield: true, armor: '#a08a60', description: 'Городское ополчение с копьём и лёгким щитом.', mod: { dodge: 1.3 } },
    i3m: { name: 'Копейщик', weapon: 'spear', helmet: 'spired', shield: true, armor: '#a8a8a0', description: 'Опытный копейщик. Длинное копьё — гроза конницы.', mod: { dodge: 1.3 } },
    i3r: { name: 'Лучник-рами', weapon: 'bow', helmet: 'turban', shield: false, armor: '#a08a60', description: 'Выученный стрелок из составного лука.', mod: { dodge: 1.3 } },
    i4m: { name: 'Гулям-страж', weapon: 'sabre', helmet: 'spired', shield: true, armor: '#c0c0b8', description: 'Гвардеец эмира в кольчуге и с дамасским клинком.', mod: { damage: 1.1, dodge: 1.3 } },
    i4r: { name: 'Мастер-рами', weapon: 'bow', helmet: 'spired', shield: false, armor: '#b0a890', description: 'Мастер стрельбы, обученный по трактатам о фурусийе.', mod: { crit: 1.3, dodge: 1.3 } },
    c1: { name: 'Бедуин-наездник', weapon: 'spear', helmet: 'turban', shield: false, armor: '#b09a70', description: 'Сын пустыни на быстром скакуне.', mod: { speed: 1.1 } },
    c2: { name: 'Фарис', weapon: 'sabre', helmet: 'turban', shield: true, armor: '#a8a8a0', description: 'Конный воин, знающий правила фурусийи.' },
    c3m: { name: 'Мамлюк', weapon: 'lance', helmet: 'spired', shield: true, armor: '#c0c0b8', description: 'Воин-невольник, выращенный для войны. Страшен в ближнем бою.', mod: { damage: 1.1 } },
    c3r: { name: 'Туркопол', weapon: 'bow', helmet: 'spired', shield: false, armor: '#a8a8a0', description: 'Конный лучник на службе султана.' },
    c4m: { name: 'Мамлюк Халки', weapon: 'lance', helmet: 'spired', shield: true, armor: '#d0d0c8', description: 'Элита мамлюков — личная гвардия султана.', mod: { damage: 1.1, armor: 1.05 } },
    c4r: { name: 'Эмирский стрелок', weapon: 'bow', helmet: 'spired', shield: false, armor: '#b8b0a0', description: 'Конный лучник эмира в кольчуге.', mod: { crit: 1.2, armor: 1.1 } },
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
      };
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
      return 'pierce';
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
  outlaw('outlaw_bandit', 'Разбойник', {
    look: { helmet: 'hood', cloth: '#6a3a2a', armor: '#6a5a40', weapon: 'mace', shield: false },
    description: 'Лесной грабитель с дубиной. Опасен только толпой.',
  }),
  outlaw('outlaw_archer', 'Разбойник-лучник', {
    tier: 2,
    role: 'ranged',
    hp: 50,
    damage: 11,
    range: 65,
    attackTime: 2.3,
    look: { helmet: 'hood', cloth: '#4a5a32', armor: '#5a4a38', weapon: 'bow', shield: false },
    description: 'Бьёт из засады и сразу уходит в чащу.',
  }),
  outlaw('outlaw_leader', 'Главарь шайки', {
    tier: 3,
    hp: 90,
    damage: 17,
    armor: { cut: 0.25, pierce: 0.2, blunt: 0.12 },
    look: { helmet: 'nasal', cloth: '#5a2a22', armor: '#8a8f96', weapon: 'axe', shield: true },
    description: 'Бывший наёмник, ставший атаманом.',
  }),
  outlaw('outlaw_pirate', 'Морской разбойник', {
    tier: 2,
    hp: 60,
    damage: 13,
    armor: { cut: 0.1, pierce: 0.08, blunt: 0.06 },
    look: { helmet: 'cap', cloth: '#2a3a5a', armor: '#6a5a40', weapon: 'axe', shield: true },
    description: 'Грабит берега с быстрых ладей.',
  }),
  outlaw('outlaw_raider', 'Степной налётчик', {
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
    description: 'Налетает, осыпает стрелами и исчезает в степи.',
  }),
  outlaw('outlaw_desert', 'Пустынный разбойник', {
    tier: 2,
    line: 'cavalry',
    hp: 80,
    damage: 15,
    speed: 2.2,
    armor: { cut: 0.1, pierce: 0.08, blunt: 0.06 },
    look: { helmet: 'turban', cloth: '#3a3028', armor: '#8a7a5a', weapon: 'sabre', shield: true },
    description: 'Всадник пустыни, грабящий караваны.',
  }),
];

export const TROOPS: Record<string, TroopDef> = { ...buildTroops(), ...Object.fromEntries(OUTLAWS.map((t) => [t.id, t])) };

export function peasantOf(faction: FactionId): string {
  return `${faction}_i1`;
}
export function cavRecruitOf(faction: FactionId): string {
  return `${faction}_c1`;
}

export const DAMAGE_NAME: Record<DamageType, string> = { cut: 'рубящий', pierce: 'колющий', blunt: 'дробящий' };

// Снаряжение героя: от стёганки до максимилиановских лат.
import type { FactionId } from './factions';
import type { DamageType, Helmet, Weapon } from './troops';
import { tr } from '../i18n';

export type Slot = 'head' | 'body' | 'hands' | 'legs' | 'weapon' | 'shield' | 'horse';
export type BodyKind = 'cloth' | 'leather' | 'mail' | 'scale' | 'lamellar' | 'brigandine' | 'plate';

export interface Item {
  id: string;
  name: string;
  slot: Slot;
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  price: number;
  /** Где продаётся: культуры или все. */
  cultures: FactionId[] | 'all';
  description: string;
  // Броня: снижение урона по типам (для своей части тела)
  armor?: Record<DamageType, number>;
  /** Вес: снижает уклонение и немного скорость. */
  weight?: number;
  // Внешний вид
  helmet?: Helmet;
  body?: BodyKind;
  metal?: string;
  tabard?: boolean;
  // Оружие
  weapon?: Weapon;
  damage?: number;
  damageType?: DamageType;
  attackTime?: number;
  crit?: number;
  twoHanded?: boolean;
  // Щит
  block?: number;
  // Конь
  speed?: number;
  hpBonus?: number;
  barding?: boolean;
  horseColor?: string;
}

const A = (cut: number, pierce: number, blunt: number) => ({ cut, pierce, blunt });
const IRON = '#9aa0a8';
const STEEL = '#b8bec6';
const BRIGHT = '#d4d9df';

const LIST: Item[] = [
  // ─────────── Шлемы ───────────
  { id: 'hood', name: tr('Суконный капюшон'), slot: 'head', tier: 1, price: 20, cultures: 'all', armor: A(0.08, 0.06, 0.06), weight: 0, helmet: 'hood', description: tr('Защищает от ветра, но не от меча.') },
  { id: 'fur_hat', name: tr('Меховая шапка'), slot: 'head', tier: 1, price: 35, cultures: ['horde', 'nordmark'], armor: A(0.12, 0.08, 0.1), weight: 0, helmet: 'fur', description: tr('Тёплая шапка степняка, смягчает удар.') },
  { id: 'turban', name: tr('Тюрбан'), slot: 'head', tier: 1, price: 40, cultures: ['sultanate'], armor: A(0.12, 0.08, 0.12), weight: 0, helmet: 'turban', description: tr('Многослойная ткань держит скользящий удар.') },
  { id: 'arming_cap', name: tr('Стёганый чепец'), slot: 'head', tier: 1, price: 45, cultures: 'all', armor: A(0.15, 0.12, 0.14), weight: 0.5, helmet: 'cap', description: tr('Подшлемник, который бедняк носит вместо шлема.') },
  { id: 'kettle', name: tr('Шапель'), slot: 'head', tier: 2, price: 180, cultures: ['aurelia', 'nordmark'], armor: A(0.35, 0.28, 0.2), weight: 1.5, helmet: 'kettle', metal: IRON, description: tr('Железная шляпа с полями: стрела сверху не страшна.') },
  { id: 'nasal', name: tr('Шлем с наносником'), slot: 'head', tier: 2, price: 220, cultures: ['nordmark', 'aurelia'], armor: A(0.38, 0.3, 0.22), weight: 1.5, helmet: 'nasal', metal: IRON, description: tr('Конический шлем старого образца.') },
  { id: 'shishak', name: tr('Шишак'), slot: 'head', tier: 3, price: 380, cultures: ['horde', 'sultanate'], armor: A(0.45, 0.36, 0.25), weight: 1.8, helmet: 'spired', metal: STEEL, description: tr('Высокий шлем со шпилем и бармицей.') },
  { id: 'bascinet', name: tr('Бацинет с бармицей'), slot: 'head', tier: 3, price: 450, cultures: ['aurelia', 'nordmark'], armor: A(0.5, 0.4, 0.28), weight: 2, helmet: 'bascinet', metal: STEEL, description: tr('Любимый шлем рыцарей XIV века.') },
  { id: 'great_helm', name: tr('Топфхельм'), slot: 'head', tier: 4, price: 800, cultures: ['aurelia', 'nordmark'], armor: A(0.62, 0.52, 0.34), weight: 3, helmet: 'great', metal: STEEL, description: tr('Горшковый шлем: глухой, тяжёлый и надёжный.') },
  { id: 'khula_khud', name: tr('Мисюрка султана'), slot: 'head', tier: 4, price: 900, cultures: ['sultanate'], armor: A(0.58, 0.48, 0.32), weight: 2, helmet: 'spired', metal: BRIGHT, description: tr('Лёгкий шлем с золотой насечкой и кольчужной завесой.') },
  { id: 'sallet', name: tr('Салад'), slot: 'head', tier: 5, price: 1500, cultures: ['aurelia'], armor: A(0.7, 0.6, 0.38), weight: 2.5, helmet: 'sallet', metal: BRIGHT, description: tr('Готический шлем с длинным назатыльником.') },
  { id: 'armet', name: tr('Армет'), slot: 'head', tier: 6, price: 2600, cultures: ['aurelia'], armor: A(0.78, 0.68, 0.42), weight: 2.8, helmet: 'armet', metal: BRIGHT, description: tr('Миланский закрытый шлем, облегающий голову.') },

  // ─────────── Корпус ───────────
  { id: 'tunic', name: tr('Рубаха'), slot: 'body', tier: 1, price: 10, cultures: 'all', armor: A(0.04, 0.03, 0.03), weight: 0, body: 'cloth', description: tr('Простая льняная рубаха.') },
  { id: 'gambeson', name: tr('Стёганка'), slot: 'body', tier: 1, price: 80, cultures: 'all', armor: A(0.24, 0.2, 0.22), weight: 3, body: 'cloth', description: tr('Многослойный стёганый доспех. Дёшев и удивительно хорош.') },
  { id: 'tegilyai', name: tr('Тегиляй'), slot: 'body', tier: 1, price: 90, cultures: ['horde'], armor: A(0.26, 0.2, 0.24), weight: 3, body: 'cloth', description: tr('Толстый кафтан на вате, набитый пенькой.') },
  { id: 'leather', name: tr('Кожаный доспех'), slot: 'body', tier: 2, price: 160, cultures: 'all', armor: A(0.3, 0.24, 0.2), weight: 4, body: 'leather', description: tr('Варёная кожа на плотной основе.') },
  { id: 'mail_shirt', name: tr('Кольчужная рубаха'), slot: 'body', tier: 2, price: 420, cultures: 'all', armor: A(0.44, 0.34, 0.2), weight: 8, body: 'mail', metal: IRON, tabard: true, description: tr('Короткая кольчуга поверх стёганки.') },
  { id: 'hauberk', name: tr('Хауберк'), slot: 'body', tier: 3, price: 700, cultures: ['aurelia', 'nordmark'], armor: A(0.5, 0.4, 0.24), weight: 10, body: 'mail', metal: STEEL, tabard: true, description: tr('Длинная кольчуга до колен с рукавами.') },
  { id: 'scale', name: tr('Чешуйчатый доспех'), slot: 'body', tier: 3, price: 780, cultures: ['horde', 'nordmark', 'sultanate'], armor: A(0.5, 0.42, 0.28), weight: 11, body: 'scale', metal: '#a89a78', description: tr('Бронзовые и железные чешуйки на кожаной основе.') },
  { id: 'lamellar', name: tr('Ламеллярный доспех'), slot: 'body', tier: 3, price: 950, cultures: ['horde', 'sultanate'], armor: A(0.54, 0.44, 0.3), weight: 11, body: 'lamellar', metal: '#b09a68', description: tr('Стальные пластинки на ремешках, доспех степных нойонов.') },
  { id: 'brigandine', name: tr('Бригантина'), slot: 'body', tier: 4, price: 1400, cultures: ['aurelia', 'nordmark'], armor: A(0.6, 0.5, 0.34), weight: 11, body: 'brigandine', metal: STEEL, description: tr('Пластины под бархатом на заклёпках.') },
  { id: 'jawshan', name: tr('Джавшан'), slot: 'body', tier: 4, price: 1500, cultures: ['sultanate', 'horde'], armor: A(0.6, 0.52, 0.34), weight: 11, body: 'lamellar', metal: BRIGHT, description: tr('Кольчато-пластинчатый доспех мамлюков.') },
  { id: 'coat_of_plates', name: tr('Латы XIV века'), slot: 'body', tier: 5, price: 2600, cultures: ['aurelia'], armor: A(0.7, 0.6, 0.4), weight: 14, body: 'plate', metal: STEEL, tabard: true, description: tr('Кираса под гербовой котой, кольчуга на руках.') },
  { id: 'gothic', name: tr('Готические латы'), slot: 'body', tier: 6, price: 4200, cultures: ['aurelia'], armor: A(0.8, 0.68, 0.46), weight: 16, body: 'plate', metal: BRIGHT, tabard: false, description: tr('Рифлёная сталь немецких мастеров, изящная и крепкая.') },
  { id: 'milanese', name: tr('Миланские латы'), slot: 'body', tier: 6, price: 4600, cultures: ['aurelia'], armor: A(0.82, 0.7, 0.48), weight: 17, body: 'plate', metal: '#e0e4e8', tabard: false, description: tr('Гладкая полированная броня лучших оружейников Милана.') },
  { id: 'maximilian', name: tr('Максимилиановские латы'), slot: 'body', tier: 6, price: 6500, cultures: ['aurelia'], armor: A(0.86, 0.74, 0.5), weight: 18, body: 'plate', metal: '#eef1f4', tabard: false, description: tr('Доспех следующего века: гофрированная сталь с головы до ног.') },

  // ─────────── Руки ───────────
  { id: 'leather_gloves', name: tr('Кожаные перчатки'), slot: 'hands', tier: 1, price: 40, cultures: 'all', armor: A(0.2, 0.15, 0.12), weight: 0.3, description: tr('Берегут пальцы от мозолей и порезов.') },
  { id: 'mail_mittens', name: tr('Кольчужные рукавицы'), slot: 'hands', tier: 2, price: 180, cultures: 'all', armor: A(0.4, 0.3, 0.18), weight: 0.8, metal: IRON, description: tr('Продолжение рукавов кольчуги.') },
  { id: 'plate_gauntlets', name: tr('Латные перчатки'), slot: 'hands', tier: 4, price: 600, cultures: ['aurelia', 'nordmark'], armor: A(0.6, 0.5, 0.3), weight: 1.2, metal: STEEL, description: tr('Стальные пластины на каждом пальце.') },
  { id: 'gothic_gauntlets', name: tr('Готические рукавицы'), slot: 'hands', tier: 6, price: 1400, cultures: ['aurelia'], armor: A(0.75, 0.62, 0.38), weight: 1.2, metal: BRIGHT, description: tr('Острые рифлёные рукавицы.') },

  // ─────────── Ноги ───────────
  { id: 'boots', name: tr('Кожаные сапоги'), slot: 'legs', tier: 1, price: 40, cultures: 'all', armor: A(0.12, 0.1, 0.08), weight: 0.5, description: tr('Добрые сапоги для долгих переходов.') },
  { id: 'mail_chausses', name: tr('Кольчужные чулки'), slot: 'legs', tier: 2, price: 260, cultures: 'all', armor: A(0.38, 0.3, 0.18), weight: 3, metal: IRON, description: tr('Кольчуга для ног — дар для всадника.') },
  { id: 'greaves', name: tr('Латные поножи'), slot: 'legs', tier: 4, price: 800, cultures: ['aurelia', 'nordmark'], armor: A(0.6, 0.5, 0.32), weight: 4, metal: STEEL, description: tr('Наколенники, наголенники и набедренники.') },
  { id: 'gothic_greaves', name: tr('Готические поножи'), slot: 'legs', tier: 6, price: 1800, cultures: ['aurelia'], armor: A(0.76, 0.64, 0.4), weight: 4.5, metal: BRIGHT, description: tr('Сталь, повторяющая форму ноги.') },

  // ─────────── Оружие ───────────
  { id: 'knife', name: tr('Боевой нож'), slot: 'weapon', tier: 1, price: 25, cultures: 'all', weapon: 'sword', damage: 11, damageType: 'cut', attackTime: 0.9, crit: 0.1, description: tr('Лучше, чем ничего.') },
  { id: 'hatchet', name: tr('Топор'), slot: 'weapon', tier: 1, price: 70, cultures: 'all', weapon: 'axe', damage: 16, damageType: 'cut', attackTime: 1.3, crit: 0.08, description: tr('Плотницкий топор, насаженный покрепче.') },
  { id: 'spear', name: tr('Копьё'), slot: 'weapon', tier: 1, price: 90, cultures: 'all', weapon: 'spear', damage: 17, damageType: 'pierce', attackTime: 1.25, crit: 0.08, description: tr('Длинное древко: бьёт первым и хорошо против конницы.') },
  { id: 'mace', name: tr('Булава'), slot: 'weapon', tier: 2, price: 160, cultures: 'all', weapon: 'mace', damage: 16, damageType: 'blunt', attackTime: 1.2, crit: 0.1, description: tr('Дробит там, где меч соскальзывает с лат.') },
  { id: 'arming_sword', name: tr('Меч'), slot: 'weapon', tier: 2, price: 260, cultures: ['aurelia', 'nordmark'], weapon: 'sword', damage: 19, damageType: 'cut', attackTime: 1.1, crit: 0.1, description: tr('Одноручный рыцарский меч.') },
  { id: 'sabre', name: tr('Сабля'), slot: 'weapon', tier: 2, price: 280, cultures: ['horde', 'sultanate'], weapon: 'sabre', damage: 18, damageType: 'cut', attackTime: 0.95, crit: 0.13, description: tr('Изогнутый клинок всадника.') },
  { id: 'dane_axe', name: tr('Датский топор'), slot: 'weapon', tier: 3, price: 420, cultures: ['nordmark'], weapon: 'axe', damage: 27, damageType: 'cut', attackTime: 1.5, crit: 0.12, twoHanded: true, description: tr('Двуручный топор хускарлов.') },
  { id: 'war_hammer', name: tr('Боевой молот'), slot: 'weapon', tier: 3, price: 480, cultures: ['aurelia', 'nordmark'], weapon: 'mace', damage: 22, damageType: 'blunt', attackTime: 1.3, crit: 0.1, description: tr('Клюв и молот против латника.') },
  { id: 'halberd', name: tr('Алебарда'), slot: 'weapon', tier: 3, price: 700, cultures: ['aurelia'], weapon: 'halberd', damage: 30, damageType: 'cut', attackTime: 1.55, crit: 0.1, twoHanded: true, description: tr('Топор, копьё и крюк на одном древке.') },
  { id: 'glaive', name: tr('Глефа'), slot: 'weapon', tier: 3, price: 680, cultures: ['horde', 'sultanate'], weapon: 'glaive', damage: 29, damageType: 'cut', attackTime: 1.5, crit: 0.1, twoHanded: true, description: tr('Широкий клинок на длинном древке.') },
  { id: 'lance', name: tr('Кавалерийская пика'), slot: 'weapon', tier: 3, price: 650, cultures: 'all', weapon: 'lance', damage: 24, damageType: 'pierce', attackTime: 1.35, crit: 0.1, description: tr('Таранный удар с коня страшнее любого другого.') },
  { id: 'bastard_sword', name: tr('Полуторный меч'), slot: 'weapon', tier: 4, price: 1100, cultures: ['aurelia', 'nordmark'], weapon: 'sword', damage: 26, damageType: 'cut', attackTime: 1.2, crit: 0.12, description: tr('Длинный меч для одной или двух рук.') },
  { id: 'damascus_sabre', name: tr('Дамасская сабля'), slot: 'weapon', tier: 5, price: 1600, cultures: ['sultanate'], weapon: 'sabre', damage: 25, damageType: 'cut', attackTime: 0.9, crit: 0.18, description: tr('Узорчатая сталь, режущая шёлковый платок на лету.') },
  { id: 'knight_sword', name: tr('Рыцарский меч'), slot: 'weapon', tier: 5, price: 1800, cultures: ['aurelia'], weapon: 'sword', damage: 28, damageType: 'cut', attackTime: 1.1, crit: 0.14, description: tr('Клинок из лучшей пассауской стали.') },
  { id: 'zweihander', name: tr('Цвайхендер'), slot: 'weapon', tier: 6, price: 2600, cultures: ['aurelia'], weapon: 'sword', damage: 38, damageType: 'cut', attackTime: 1.6, crit: 0.15, twoHanded: true, description: tr('Огромный двуручный меч ландскнехтов.') },

  // ─────────── Щиты ───────────
  { id: 'board_shield', name: tr('Дощатый щит'), slot: 'shield', tier: 1, price: 50, cultures: 'all', block: 0.16, weight: 2, description: tr('Несколько досок, обтянутых кожей.') },
  { id: 'round_shield', name: tr('Круглый щит'), slot: 'shield', tier: 2, price: 120, cultures: ['nordmark', 'horde', 'sultanate'], block: 0.22, weight: 2.5, description: tr('Щит с железным умбоном.') },
  { id: 'heater', name: tr('Треугольный щит'), slot: 'shield', tier: 2, price: 150, cultures: ['aurelia'], block: 0.24, weight: 2.5, description: tr('Гербовый щит рыцаря.') },
  { id: 'kalkan', name: tr('Калкан'), slot: 'shield', tier: 3, price: 380, cultures: ['sultanate', 'horde'], block: 0.28, weight: 2, description: tr('Плетёный щит из прутьев и шёлка, лёгкий и прочный.') },
  { id: 'knight_shield', name: tr('Рыцарский щит'), slot: 'shield', tier: 4, price: 600, cultures: ['aurelia', 'nordmark'], block: 0.32, weight: 3.5, description: tr('Окованный щит с гербом.') },

  // ─────────── Кони ───────────
  { id: 'sumpter', name: tr('Вьючная лошадь'), slot: 'horse', tier: 1, price: 150, cultures: 'all', speed: 1.6, hpBonus: 0, horseColor: '#8a6a4a', description: tr('Тащит поклажу и неохотно — всадника.') },
  { id: 'rouncey', name: tr('Верховая лошадь'), slot: 'horse', tier: 2, price: 400, cultures: 'all', speed: 1.9, hpBonus: 10, horseColor: '#7a4a2a', description: tr('Надёжная лошадь для дальних переходов.') },
  { id: 'steppe_horse', name: tr('Степной скакун'), slot: 'horse', tier: 3, price: 600, cultures: ['horde'], speed: 2.25, hpBonus: 10, horseColor: '#9a958c', description: tr('Неприхотлив и неутомим.') },
  { id: 'arabian', name: tr('Арабский скакун'), slot: 'horse', tier: 4, price: 1100, cultures: ['sultanate'], speed: 2.35, hpBonus: 15, horseColor: '#d8d2c4', description: tr('Горячий и быстрый как ветер пустыни.') },
  { id: 'courser', name: tr('Курсье'), slot: 'horse', tier: 4, price: 1200, cultures: ['aurelia', 'nordmark'], speed: 2.15, hpBonus: 25, horseColor: '#5e3a22', description: tr('Боевой конь для лёгкой конницы.') },
  { id: 'destrier', name: tr('Дестриэ'), slot: 'horse', tier: 5, price: 2200, cultures: ['aurelia'], speed: 1.95, hpBonus: 45, horseColor: '#2e2622', description: tr('Огромный рыцарский конь, обученный бою.') },
  { id: 'barded_destrier', name: tr('Конь в броне и попоне'), slot: 'horse', tier: 6, price: 3600, cultures: ['aurelia', 'sultanate'], speed: 1.85, hpBonus: 80, barding: true, horseColor: '#2e2622', description: tr('Дестриэ в стальном шанфроне и гербовой попоне.') },
];

export const ITEMS: Record<string, Item> = Object.fromEntries(LIST.map((i) => [i.id, i]));
export const ITEM_LIST = LIST;

export const SLOT_NAME: Record<Slot, string> = {
  head: tr('Шлем'),
  body: tr('Доспех'),
  hands: tr('Руки'),
  legs: tr('Ноги'),
  weapon: tr('Оружие'),
  shield: tr('Щит'),
  horse: tr('Конь'),
};

export const SLOTS: Slot[] = ['head', 'body', 'hands', 'legs', 'weapon', 'shield', 'horse'];

/** Доля защиты, которую даёт часть тела. */
export const SLOT_WEIGHT: Partial<Record<Slot, number>> = { head: 0.2, body: 0.55, hands: 0.1, legs: 0.15 };

export const ITEM_SELL_RATIO = 0.5;

/** Стартовое снаряжение по державам. */
export const START_KIT: Record<FactionId, Partial<Record<Slot, string>>> = {
  aurelia: { head: 'kettle', body: 'gambeson', hands: 'leather_gloves', legs: 'boots', weapon: 'arming_sword', shield: 'heater', horse: 'rouncey' },
  nordmark: { head: 'nasal', body: 'gambeson', hands: 'leather_gloves', legs: 'boots', weapon: 'hatchet', shield: 'round_shield', horse: 'rouncey' },
  horde: { head: 'fur_hat', body: 'tegilyai', hands: 'leather_gloves', legs: 'boots', weapon: 'sabre', shield: 'round_shield', horse: 'steppe_horse' },
  sultanate: { head: 'turban', body: 'gambeson', hands: 'leather_gloves', legs: 'boots', weapon: 'sabre', shield: 'round_shield', horse: 'rouncey' },
};

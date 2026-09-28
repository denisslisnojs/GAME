// Снаряжение героя: от стёганки до максимилиановских лат.
import type { FactionId } from './factions';
import type { DamageType, Helmet, Weapon } from './troops';

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
  { id: 'hood', name: 'Суконный капюшон', slot: 'head', tier: 1, price: 20, cultures: 'all', armor: A(0.08, 0.06, 0.06), weight: 0, helmet: 'hood', description: 'Защищает от ветра, но не от меча.' },
  { id: 'fur_hat', name: 'Меховая шапка', slot: 'head', tier: 1, price: 35, cultures: ['horde', 'nordmark'], armor: A(0.12, 0.08, 0.1), weight: 0, helmet: 'fur', description: 'Тёплая шапка степняка, смягчает удар.' },
  { id: 'turban', name: 'Тюрбан', slot: 'head', tier: 1, price: 40, cultures: ['sultanate'], armor: A(0.12, 0.08, 0.12), weight: 0, helmet: 'turban', description: 'Многослойная ткань держит скользящий удар.' },
  { id: 'arming_cap', name: 'Стёганый чепец', slot: 'head', tier: 1, price: 45, cultures: 'all', armor: A(0.15, 0.12, 0.14), weight: 0.5, helmet: 'cap', description: 'Подшлемник, который бедняк носит вместо шлема.' },
  { id: 'kettle', name: 'Шапель', slot: 'head', tier: 2, price: 180, cultures: ['aurelia', 'nordmark'], armor: A(0.35, 0.28, 0.2), weight: 1.5, helmet: 'kettle', metal: IRON, description: 'Железная шляпа с полями: стрела сверху не страшна.' },
  { id: 'nasal', name: 'Шлем с наносником', slot: 'head', tier: 2, price: 220, cultures: ['nordmark', 'aurelia'], armor: A(0.38, 0.3, 0.22), weight: 1.5, helmet: 'nasal', metal: IRON, description: 'Конический шлем старого образца.' },
  { id: 'shishak', name: 'Шишак', slot: 'head', tier: 3, price: 380, cultures: ['horde', 'sultanate'], armor: A(0.45, 0.36, 0.25), weight: 1.8, helmet: 'spired', metal: STEEL, description: 'Высокий шлем со шпилем и бармицей.' },
  { id: 'bascinet', name: 'Бацинет с бармицей', slot: 'head', tier: 3, price: 450, cultures: ['aurelia', 'nordmark'], armor: A(0.5, 0.4, 0.28), weight: 2, helmet: 'bascinet', metal: STEEL, description: 'Любимый шлем рыцарей XIV века.' },
  { id: 'great_helm', name: 'Топфхельм', slot: 'head', tier: 4, price: 800, cultures: ['aurelia', 'nordmark'], armor: A(0.62, 0.52, 0.34), weight: 3, helmet: 'great', metal: STEEL, description: 'Горшковый шлем: глухой, тяжёлый и надёжный.' },
  { id: 'khula_khud', name: 'Мисюрка султана', slot: 'head', tier: 4, price: 900, cultures: ['sultanate'], armor: A(0.58, 0.48, 0.32), weight: 2, helmet: 'spired', metal: BRIGHT, description: 'Лёгкий шлем с золотой насечкой и кольчужной завесой.' },
  { id: 'sallet', name: 'Салад', slot: 'head', tier: 5, price: 1500, cultures: ['aurelia'], armor: A(0.7, 0.6, 0.38), weight: 2.5, helmet: 'sallet', metal: BRIGHT, description: 'Готический шлем с длинным назатыльником.' },
  { id: 'armet', name: 'Армет', slot: 'head', tier: 6, price: 2600, cultures: ['aurelia'], armor: A(0.78, 0.68, 0.42), weight: 2.8, helmet: 'armet', metal: BRIGHT, description: 'Миланский закрытый шлем, облегающий голову.' },

  // ─────────── Корпус ───────────
  { id: 'tunic', name: 'Рубаха', slot: 'body', tier: 1, price: 10, cultures: 'all', armor: A(0.04, 0.03, 0.03), weight: 0, body: 'cloth', description: 'Простая льняная рубаха.' },
  { id: 'gambeson', name: 'Стёганка', slot: 'body', tier: 1, price: 80, cultures: 'all', armor: A(0.24, 0.2, 0.22), weight: 3, body: 'cloth', description: 'Многослойный стёганый доспех. Дёшев и удивительно хорош.' },
  { id: 'tegilyai', name: 'Тегиляй', slot: 'body', tier: 1, price: 90, cultures: ['horde'], armor: A(0.26, 0.2, 0.24), weight: 3, body: 'cloth', description: 'Толстый кафтан на вате, набитый пенькой.' },
  { id: 'leather', name: 'Кожаный доспех', slot: 'body', tier: 2, price: 160, cultures: 'all', armor: A(0.3, 0.24, 0.2), weight: 4, body: 'leather', description: 'Варёная кожа на плотной основе.' },
  { id: 'mail_shirt', name: 'Кольчужная рубаха', slot: 'body', tier: 2, price: 420, cultures: 'all', armor: A(0.44, 0.34, 0.2), weight: 8, body: 'mail', metal: IRON, tabard: true, description: 'Короткая кольчуга поверх стёганки.' },
  { id: 'hauberk', name: 'Хауберк', slot: 'body', tier: 3, price: 700, cultures: ['aurelia', 'nordmark'], armor: A(0.5, 0.4, 0.24), weight: 10, body: 'mail', metal: STEEL, tabard: true, description: 'Длинная кольчуга до колен с рукавами.' },
  { id: 'scale', name: 'Чешуйчатый доспех', slot: 'body', tier: 3, price: 780, cultures: ['horde', 'nordmark', 'sultanate'], armor: A(0.5, 0.42, 0.28), weight: 11, body: 'scale', metal: '#a89a78', description: 'Бронзовые и железные чешуйки на кожаной основе.' },
  { id: 'lamellar', name: 'Ламеллярный доспех', slot: 'body', tier: 3, price: 950, cultures: ['horde', 'sultanate'], armor: A(0.54, 0.44, 0.3), weight: 11, body: 'lamellar', metal: '#b09a68', description: 'Стальные пластинки на ремешках, доспех степных нойонов.' },
  { id: 'brigandine', name: 'Бригантина', slot: 'body', tier: 4, price: 1400, cultures: ['aurelia', 'nordmark'], armor: A(0.6, 0.5, 0.34), weight: 11, body: 'brigandine', metal: STEEL, description: 'Пластины под бархатом на заклёпках.' },
  { id: 'jawshan', name: 'Джавшан', slot: 'body', tier: 4, price: 1500, cultures: ['sultanate', 'horde'], armor: A(0.6, 0.52, 0.34), weight: 11, body: 'lamellar', metal: BRIGHT, description: 'Кольчато-пластинчатый доспех мамлюков.' },
  { id: 'coat_of_plates', name: 'Латы XIV века', slot: 'body', tier: 5, price: 2600, cultures: ['aurelia'], armor: A(0.7, 0.6, 0.4), weight: 14, body: 'plate', metal: STEEL, tabard: true, description: 'Кираса под гербовой котой, кольчуга на руках.' },
  { id: 'gothic', name: 'Готические латы', slot: 'body', tier: 6, price: 4200, cultures: ['aurelia'], armor: A(0.8, 0.68, 0.46), weight: 16, body: 'plate', metal: BRIGHT, tabard: false, description: 'Рифлёная сталь немецких мастеров, изящная и крепкая.' },
  { id: 'milanese', name: 'Миланские латы', slot: 'body', tier: 6, price: 4600, cultures: ['aurelia'], armor: A(0.82, 0.7, 0.48), weight: 17, body: 'plate', metal: '#e0e4e8', tabard: false, description: 'Гладкая полированная броня лучших оружейников Милана.' },
  { id: 'maximilian', name: 'Максимилиановские латы', slot: 'body', tier: 6, price: 6500, cultures: ['aurelia'], armor: A(0.86, 0.74, 0.5), weight: 18, body: 'plate', metal: '#eef1f4', tabard: false, description: 'Доспех следующего века: гофрированная сталь с головы до ног.' },

  // ─────────── Руки ───────────
  { id: 'leather_gloves', name: 'Кожаные перчатки', slot: 'hands', tier: 1, price: 40, cultures: 'all', armor: A(0.2, 0.15, 0.12), weight: 0.3, description: 'Берегут пальцы от мозолей и порезов.' },
  { id: 'mail_mittens', name: 'Кольчужные рукавицы', slot: 'hands', tier: 2, price: 180, cultures: 'all', armor: A(0.4, 0.3, 0.18), weight: 0.8, metal: IRON, description: 'Продолжение рукавов кольчуги.' },
  { id: 'plate_gauntlets', name: 'Латные перчатки', slot: 'hands', tier: 4, price: 600, cultures: ['aurelia', 'nordmark'], armor: A(0.6, 0.5, 0.3), weight: 1.2, metal: STEEL, description: 'Стальные пластины на каждом пальце.' },
  { id: 'gothic_gauntlets', name: 'Готические рукавицы', slot: 'hands', tier: 6, price: 1400, cultures: ['aurelia'], armor: A(0.75, 0.62, 0.38), weight: 1.2, metal: BRIGHT, description: 'Острые рифлёные рукавицы.' },

  // ─────────── Ноги ───────────
  { id: 'boots', name: 'Кожаные сапоги', slot: 'legs', tier: 1, price: 40, cultures: 'all', armor: A(0.12, 0.1, 0.08), weight: 0.5, description: 'Добрые сапоги для долгих переходов.' },
  { id: 'mail_chausses', name: 'Кольчужные чулки', slot: 'legs', tier: 2, price: 260, cultures: 'all', armor: A(0.38, 0.3, 0.18), weight: 3, metal: IRON, description: 'Кольчуга для ног — дар для всадника.' },
  { id: 'greaves', name: 'Латные поножи', slot: 'legs', tier: 4, price: 800, cultures: ['aurelia', 'nordmark'], armor: A(0.6, 0.5, 0.32), weight: 4, metal: STEEL, description: 'Наколенники, наголенники и набедренники.' },
  { id: 'gothic_greaves', name: 'Готические поножи', slot: 'legs', tier: 6, price: 1800, cultures: ['aurelia'], armor: A(0.76, 0.64, 0.4), weight: 4.5, metal: BRIGHT, description: 'Сталь, повторяющая форму ноги.' },

  // ─────────── Оружие ───────────
  { id: 'knife', name: 'Боевой нож', slot: 'weapon', tier: 1, price: 25, cultures: 'all', weapon: 'sword', damage: 11, damageType: 'cut', attackTime: 0.9, crit: 0.1, description: 'Лучше, чем ничего.' },
  { id: 'hatchet', name: 'Топор', slot: 'weapon', tier: 1, price: 70, cultures: 'all', weapon: 'axe', damage: 16, damageType: 'cut', attackTime: 1.3, crit: 0.08, description: 'Плотницкий топор, насаженный покрепче.' },
  { id: 'spear', name: 'Копьё', slot: 'weapon', tier: 1, price: 90, cultures: 'all', weapon: 'spear', damage: 17, damageType: 'pierce', attackTime: 1.25, crit: 0.08, description: 'Длинное древко: бьёт первым и хорошо против конницы.' },
  { id: 'mace', name: 'Булава', slot: 'weapon', tier: 2, price: 160, cultures: 'all', weapon: 'mace', damage: 16, damageType: 'blunt', attackTime: 1.2, crit: 0.1, description: 'Дробит там, где меч соскальзывает с лат.' },
  { id: 'arming_sword', name: 'Меч', slot: 'weapon', tier: 2, price: 260, cultures: ['aurelia', 'nordmark'], weapon: 'sword', damage: 19, damageType: 'cut', attackTime: 1.1, crit: 0.1, description: 'Одноручный рыцарский меч.' },
  { id: 'sabre', name: 'Сабля', slot: 'weapon', tier: 2, price: 280, cultures: ['horde', 'sultanate'], weapon: 'sabre', damage: 18, damageType: 'cut', attackTime: 0.95, crit: 0.13, description: 'Изогнутый клинок всадника.' },
  { id: 'dane_axe', name: 'Датский топор', slot: 'weapon', tier: 3, price: 420, cultures: ['nordmark'], weapon: 'axe', damage: 27, damageType: 'cut', attackTime: 1.5, crit: 0.12, twoHanded: true, description: 'Двуручный топор хускарлов.' },
  { id: 'war_hammer', name: 'Боевой молот', slot: 'weapon', tier: 3, price: 480, cultures: ['aurelia', 'nordmark'], weapon: 'mace', damage: 22, damageType: 'blunt', attackTime: 1.3, crit: 0.1, description: 'Клюв и молот против латника.' },
  { id: 'halberd', name: 'Алебарда', slot: 'weapon', tier: 3, price: 700, cultures: ['aurelia'], weapon: 'halberd', damage: 30, damageType: 'cut', attackTime: 1.55, crit: 0.1, twoHanded: true, description: 'Топор, копьё и крюк на одном древке.' },
  { id: 'glaive', name: 'Глефа', slot: 'weapon', tier: 3, price: 680, cultures: ['horde', 'sultanate'], weapon: 'glaive', damage: 29, damageType: 'cut', attackTime: 1.5, crit: 0.1, twoHanded: true, description: 'Широкий клинок на длинном древке.' },
  { id: 'lance', name: 'Кавалерийская пика', slot: 'weapon', tier: 3, price: 650, cultures: 'all', weapon: 'lance', damage: 24, damageType: 'pierce', attackTime: 1.35, crit: 0.1, description: 'Таранный удар с коня страшнее любого другого.' },
  { id: 'bastard_sword', name: 'Полуторный меч', slot: 'weapon', tier: 4, price: 1100, cultures: ['aurelia', 'nordmark'], weapon: 'sword', damage: 26, damageType: 'cut', attackTime: 1.2, crit: 0.12, description: 'Длинный меч для одной или двух рук.' },
  { id: 'damascus_sabre', name: 'Дамасская сабля', slot: 'weapon', tier: 5, price: 1600, cultures: ['sultanate'], weapon: 'sabre', damage: 25, damageType: 'cut', attackTime: 0.9, crit: 0.18, description: 'Узорчатая сталь, режущая шёлковый платок на лету.' },
  { id: 'knight_sword', name: 'Рыцарский меч', slot: 'weapon', tier: 5, price: 1800, cultures: ['aurelia'], weapon: 'sword', damage: 28, damageType: 'cut', attackTime: 1.1, crit: 0.14, description: 'Клинок из лучшей пассауской стали.' },
  { id: 'zweihander', name: 'Цвайхендер', slot: 'weapon', tier: 6, price: 2600, cultures: ['aurelia'], weapon: 'sword', damage: 38, damageType: 'cut', attackTime: 1.6, crit: 0.15, twoHanded: true, description: 'Огромный двуручный меч ландскнехтов.' },

  // ─────────── Щиты ───────────
  { id: 'board_shield', name: 'Дощатый щит', slot: 'shield', tier: 1, price: 50, cultures: 'all', block: 0.16, weight: 2, description: 'Несколько досок, обтянутых кожей.' },
  { id: 'round_shield', name: 'Круглый щит', slot: 'shield', tier: 2, price: 120, cultures: ['nordmark', 'horde', 'sultanate'], block: 0.22, weight: 2.5, description: 'Щит с железным умбоном.' },
  { id: 'heater', name: 'Треугольный щит', slot: 'shield', tier: 2, price: 150, cultures: ['aurelia'], block: 0.24, weight: 2.5, description: 'Гербовый щит рыцаря.' },
  { id: 'kalkan', name: 'Калкан', slot: 'shield', tier: 3, price: 380, cultures: ['sultanate', 'horde'], block: 0.28, weight: 2, description: 'Плетёный щит из прутьев и шёлка, лёгкий и прочный.' },
  { id: 'knight_shield', name: 'Рыцарский щит', slot: 'shield', tier: 4, price: 600, cultures: ['aurelia', 'nordmark'], block: 0.32, weight: 3.5, description: 'Окованный щит с гербом.' },

  // ─────────── Кони ───────────
  { id: 'sumpter', name: 'Вьючная лошадь', slot: 'horse', tier: 1, price: 150, cultures: 'all', speed: 1.6, hpBonus: 0, horseColor: '#8a6a4a', description: 'Тащит поклажу и неохотно — всадника.' },
  { id: 'rouncey', name: 'Верховая лошадь', slot: 'horse', tier: 2, price: 400, cultures: 'all', speed: 1.9, hpBonus: 10, horseColor: '#7a4a2a', description: 'Надёжная лошадь для дальних переходов.' },
  { id: 'steppe_horse', name: 'Степной скакун', slot: 'horse', tier: 3, price: 600, cultures: ['horde'], speed: 2.25, hpBonus: 10, horseColor: '#9a958c', description: 'Неприхотлив и неутомим.' },
  { id: 'arabian', name: 'Арабский скакун', slot: 'horse', tier: 4, price: 1100, cultures: ['sultanate'], speed: 2.35, hpBonus: 15, horseColor: '#d8d2c4', description: 'Горячий и быстрый как ветер пустыни.' },
  { id: 'courser', name: 'Курсье', slot: 'horse', tier: 4, price: 1200, cultures: ['aurelia', 'nordmark'], speed: 2.15, hpBonus: 25, horseColor: '#5e3a22', description: 'Боевой конь для лёгкой конницы.' },
  { id: 'destrier', name: 'Дестриэ', slot: 'horse', tier: 5, price: 2200, cultures: ['aurelia'], speed: 1.95, hpBonus: 45, horseColor: '#2e2622', description: 'Огромный рыцарский конь, обученный бою.' },
  { id: 'barded_destrier', name: 'Конь в броне и попоне', slot: 'horse', tier: 6, price: 3600, cultures: ['aurelia', 'sultanate'], speed: 1.85, hpBonus: 80, barding: true, horseColor: '#2e2622', description: 'Дестриэ в стальном шанфроне и гербовой попоне.' },
];

export const ITEMS: Record<string, Item> = Object.fromEntries(LIST.map((i) => [i.id, i]));
export const ITEM_LIST = LIST;

export const SLOT_NAME: Record<Slot, string> = {
  head: 'Шлем',
  body: 'Доспех',
  hands: 'Руки',
  legs: 'Ноги',
  weapon: 'Оружие',
  shield: 'Щит',
  horse: 'Конь',
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

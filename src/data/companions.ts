// Спутники: именные герои из таверн. У каждого своё прошлое, умения, нрав и соперник в отряде.

import type { FactionId } from './factions';
import type { SkillId } from './skills';
import type { TroopLook } from './troops';
import { tr } from '../i18n';

/** Поступки героя, о которых у спутников есть мнение. */
export type Deed = 'raid' | 'caravan' | 'retreat' | 'defeat' | 'victory' | 'siege' | 'tourney' | 'lord' | 'cruelty';

export interface CompanionDef {
  id: string;
  name: string;
  /** Короткое прозвание: чем полезен. */
  title: string;
  culture: FactionId;
  /** Воинский образец: ячейка древа воинов его родной державы. */
  slot: 'i2' | 'i3m' | 'i3r' | 'i4m' | 'i4r' | 'c2' | 'c3m' | 'c3r' | 'c4m';
  bio: string;
  /** Что говорит при найме. */
  greet: string;
  skills: Partial<Record<SkillId, number>>;
  likes: Deed[];
  dislikes: Deed[];
  rival?: string;
  price: number;
  /** Жалованье в неделю. */
  wage: number;
  /** Особый облик поверх образца. */
  look?: Partial<TroopLook>;
}

export const COMPANIONS: CompanionDef[] = [
  {
    id: 'bertrand',
    name: tr('Бертран де Монфор'),
    title: tr('обедневший рыцарь'),
    culture: 'aurelia',
    slot: 'c3m',
    bio: tr('Младший сын разорённого рода. Его отец пал при Креси, а наследство ушло за долги. Бертран верит в рыцарскую честь больше, чем в золото.'),
    greet: tr('Мне нужен сеньор, достойный моего меча. Надеюсь, это вы.'),
    skills: { tactics: 3, weapon: 2, riding: 2 },
    likes: ['victory', 'lord', 'tourney'],
    dislikes: ['raid', 'caravan', 'retreat', 'cruelty'],
    rival: 'halvar',
    price: 700,
    wage: 40,
  },
  {
    id: 'agnes',
    name: tr('Сестра Агнесса'),
    title: tr('лекарка'),
    culture: 'aurelia',
    slot: 'i2',
    bio: tr('Бенедиктинка из разорённого аббатства. Знает травы, перевязки и молитвы. Говорит, что чума — не кара, а болезнь, и за это её выгнали из обители.'),
    greet: tr('Ваши люди истекают кровью, а вы тратите время на разговоры? Ведите меня к раненым.'),
    skills: { surgery: 5 },
    likes: ['victory'],
    dislikes: ['raid', 'caravan', 'siege', 'cruelty'],
    rival: 'halvar',
    price: 350,
    wage: 20,
    look: { helmet: 'hood', cloth: '#2e2a28', weapon: 'mace' },
  },
  {
    id: 'halvar',
    name: tr('Рыжий Хальвар'),
    title: tr('наёмник-норманн'),
    culture: 'nordmark',
    slot: 'i4m',
    bio: tr('Бывший варяг императорской стражи в Константинополе. Выгнан за пьяную драку с сыном протостратора. Любит добычу, хмель и хорошую сечу.'),
    greet: tr('Плати вовремя, наливай щедро — и мой топор твой.'),
    skills: { weapon: 4, athletics: 3 },
    likes: ['raid', 'caravan', 'siege', 'victory', 'cruelty'],
    dislikes: ['retreat'],
    rival: 'bertrand',
    price: 500,
    wage: 35,
  },
  {
    id: 'vaclav',
    name: tr('Вацлав Кривой'),
    title: tr('следопыт'),
    culture: 'aurelia',
    slot: 'i3r',
    bio: tr('Браконьер из богемских лесов. Потерял глаз в стычке с лесничими, но видит дорогу лучше иных зрячих. Знает каждую тропу от Праги до Вены.'),
    greet: tr('Нужна короткая дорога? Я знаю три. Одна даже без волков.'),
    skills: { pathfinding: 4, weapon: 1 },
    likes: ['caravan', 'victory'],
    dislikes: ['defeat'],
    rival: 'isaac',
    price: 300,
    wage: 18,
  },
  {
    id: 'aigerim',
    name: tr('Айгерим'),
    title: tr('степная лучница'),
    culture: 'horde',
    slot: 'c3r',
    bio: tr('Дочь кипчакского бека, бежавшая от сватовства к старику-нойону. Стреляет с седла на полном скаку и знает степь как свою ладонь.'),
    greet: tr('Я не прячусь за спинами мужчин. Я стреляю поверх их голов.'),
    skills: { pathfinding: 3, riding: 3, weapon: 2 },
    likes: ['victory', 'raid'],
    dislikes: ['defeat', 'retreat'],
    rival: 'isaac',
    price: 550,
    wage: 30,
  },
  {
    id: 'isaac',
    name: tr('Исаак бен Иегуда'),
    title: tr('купец из Кафы'),
    culture: 'sultanate',
    slot: 'i2',
    bio: tr('Торговал шёлком и перцем в Кафе, пока город не осадила Орда и не пришёл мор. Потерял всё, кроме связей и умения считать. Ненавидит тех, кто грабит купцов.'),
    greet: tr('С хорошим счётом войско сыто, а с плохим — разбегается. Позвольте мне вести ваши дела.'),
    skills: { trade: 5, surgery: 1 },
    likes: ['victory'],
    dislikes: ['caravan', 'raid'],
    rival: 'aigerim',
    price: 400,
    wage: 25,
    look: { cloth: '#6a3a6a', weapon: 'sabre', shield: false },
  },
  {
    id: 'ibnrazzak',
    name: tr('Ибн Раззак'),
    title: tr('каирский врач'),
    culture: 'sultanate',
    slot: 'i2',
    bio: tr('Учился по книгам Ибн Сины в госпитале Каира. Отправился на север изучать новую болезнь. Спокоен, учтив и неумолим, когда речь о здоровье людей.'),
    greet: tr('Меч отнимает жизнь за миг, а я возвращаю её неделями. Дайте мне место в обозе.'),
    skills: { surgery: 4, trade: 1, tactics: 1 },
    likes: ['victory'],
    dislikes: ['raid', 'siege', 'cruelty'],
    rival: 'giovanni',
    price: 450,
    wage: 25,
    look: { cloth: '#e8e0d0', weapon: 'sabre', shield: false },
  },
  {
    id: 'karabuga',
    name: tr('Кара-Буга'),
    title: tr('старый нукер-наставник'),
    culture: 'horde',
    slot: 'c3m',
    bio: tr('Сорок лет в седле: ходил с ханом Узбеком на Литву, видел Сарай в расцвете. Теперь учит молодых держать строй и не бояться конского ржания.'),
    greet: tr('Дай мне десяток пахарей — через месяц верну десяток воинов.'),
    skills: { training: 4, riding: 2, tactics: 1 },
    likes: ['victory', 'siege'],
    dislikes: ['retreat', 'defeat'],
    price: 500,
    wage: 28,
  },
  {
    id: 'giovanni',
    name: tr('Джованни Скварчафико'),
    title: tr('генуэзский арбалетчик'),
    culture: 'aurelia',
    slot: 'i4r',
    bio: tr('Командовал генуэзскими стрелками при Креси. Там французские рыцари растоптали своих же арбалетчиков, и с тех пор он служит только тому, кто платит вперёд.'),
    greet: tr('Сначала деньги, потом болты. Такой у нас, генуэзцев, порядок.'),
    skills: { tactics: 2, weapon: 2, trade: 1 },
    likes: ['siege', 'victory', 'caravan'],
    dislikes: ['defeat'],
    rival: 'ibnrazzak',
    price: 600,
    wage: 38,
  },
  {
    id: 'olga',
    name: tr('Ольга Псковитянка'),
    title: tr('вдова-воевода'),
    culture: 'nordmark',
    slot: 'i3m',
    bio: tr('Муж погиб в стычке с ливонцами, и Ольга сама повела его дружину домой. Строга, хозяйственна, умеет научить новобранца держать копьё.'),
    greet: tr('Ты, видно, воевать умеешь. А воинов растить — умеешь? Я научу.'),
    skills: { training: 3, trade: 2, athletics: 1 },
    likes: ['victory', 'lord'],
    dislikes: ['raid', 'defeat', 'cruelty'],
    price: 450,
    wage: 24,
    look: { helmet: 'hood', cloth: '#8a2a2a' },
  },
];

export const COMPANION_BY_ID = Object.fromEntries(COMPANIONS.map((c) => [c.id, c])) as Record<string, CompanionDef>;

/** Что спутник говорит о поступке, который ему не по душе. */
export const DISLIKE_LINE: Record<Deed, string> = {
  raid: tr('грабить крестьян — не воинское дело'),
  caravan: tr('разбойничать на торговых дорогах позорно'),
  retreat: tr('бежать от врага — трусость'),
  defeat: tr('так глупо проиграть бой'),
  victory: '',
  siege: tr('штурмы губят людей понапрасну'),
  tourney: '',
  lord: '',
  cruelty: tr('обижать беззащитных подло'),
};

/** Что спутник говорит о поступке, который ему нравится. */
export const LIKE_LINE: Record<Deed, string> = {
  raid: tr('добыча — лучшая награда'),
  caravan: tr('обоз ломится от добра'),
  retreat: '',
  defeat: '',
  victory: tr('славная победа'),
  siege: tr('стены пали'),
  tourney: tr('люблю турниры'),
  lord: tr('сам лорд бежал от нас'),
  cruelty: tr('слабаки не нужны'),
};

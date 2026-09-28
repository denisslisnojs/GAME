import { tr } from '../i18n';
export type FactionId = 'aurelia' | 'nordmark' | 'horde' | 'sultanate';

export interface Faction {
  id: FactionId;
  name: string;
  short: string;
  adjective: string;
  ruler: string;
  rulerTitle: string;
  /** Основной и второй цвет знамени. */
  color: number;
  color2: number;
  /** CSS-цвета для интерфейса. */
  css: string;
  css2: string;
  /** Символ на знамени (рисуется пиксель-артом). */
  emblem: 'eagle' | 'axe' | 'horse' | 'crescent';
  description: string;
  bonus: string;
  capital: string;
}

export const FACTIONS: Record<FactionId, Faction> = {
  aurelia: {
    id: 'aurelia',
    name: tr('Аурелийская империя'),
    short: tr('Аурелия'),
    adjective: tr('аурелийский'),
    ruler: tr('Карл IV Аурен'),
    rulerTitle: tr('Император'),
    color: 0x2f5fb3,
    color2: 0xe8c04a,
    css: '#3a6cc4',
    css2: '#e8c04a',
    emblem: 'eagle',
    description:
      tr('Наследница Рима, раскинувшаяся от Рейна до Тибра. Богатые вольные города, гильдии оружейников Милана и Нюрнберга, ') +
      tr('закованные в латы рыцари и генуэзские арбалетчики. Император правит из Праги, но князья и города своевольны.'),
    bonus: tr('Тяжёлая пехота, арбалетчики и рыцари. Лучшие латы в лавках.'),
    capital: 'prague',
  },
  nordmark: {
    id: 'nordmark',
    name: tr('Нордмарк'),
    short: tr('Нордмарк'),
    adjective: tr('нордмаркский'),
    ruler: tr('Магнус Эрикссон'),
    rulerTitle: tr('Конунг'),
    color: 0xa83232,
    color2: 0xf0ece0,
    css: '#c24040',
    css2: '#f0ece0',
    emblem: 'axe',
    description:
      tr('Союз северных земель: фьорды Норвегии, леса Швеции, острова Британии и торговые города Балтики. ') +
      tr('Суровые бонды и хускарлы с топорами и щитами держат стену, а лучники бьют из лесной чащи.'),
    bonus: tr('Стойкая пехота со щитами, меткие лучники, крепкий боевой дух.'),
    capital: 'stockholm',
  },
  horde: {
    id: 'horde',
    name: tr('Орда Синего Неба'),
    short: tr('Орда'),
    adjective: tr('ордынский'),
    ruler: tr('Джанибек'),
    rulerTitle: tr('Хан'),
    color: 0xd9a21b,
    color2: 0x2a2320,
    css: '#e0aa24',
    css2: '#2a2320',
    emblem: 'horse',
    description:
      tr('Наследники Чингисхана держат Великую степь от Днепра до Ханбалыка. Тумены конных лучников ') +
      tr('появляются внезапно и исчезают, осыпав врага стрелами. Шёлковый путь приносит хану несметные богатства.'),
    bonus: tr('Лучшая конница и конные лучники. Быстрые перемещения по степи.'),
    capital: 'sarai',
  },
  sultanate: {
    id: 'sultanate',
    name: tr('Султанат Аль-Захра'),
    short: tr('Султанат'),
    adjective: tr('султанский'),
    ruler: tr('Ан-Насир Хасан'),
    rulerTitle: tr('Султан'),
    color: 0x2e8b57,
    color2: 0xf2efe6,
    css: '#35a066',
    css2: '#f2efe6',
    emblem: 'crescent',
    description:
      tr('Цветущий султанат от Гранады до Исфахана. Каир — величайший город мира, Дамаск славится клинками, ') +
      tr('Багдад — мудрецами. Мамлюки — непобедимая гвардия, выкованная из рабов в лучших воинов эпохи.'),
    bonus: tr('Копейщики, лучники и мамлюкская конница. Лучшие клинки.'),
    capital: 'cairo',
  },
};

export const FACTION_IDS: FactionId[] = ['aurelia', 'nordmark', 'horde', 'sultanate'];

/** Войны в начале игры. Остальные пары — мир. */
export const INITIAL_WARS: [FactionId, FactionId][] = [
  ['aurelia', 'sultanate'],
  ['nordmark', 'horde'],
];

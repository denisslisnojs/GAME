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
    name: 'Аурелийская империя',
    short: 'Аурелия',
    adjective: 'аурелийский',
    ruler: 'Карл IV Аурен',
    rulerTitle: 'Император',
    color: 0x2f5fb3,
    color2: 0xe8c04a,
    css: '#3a6cc4',
    css2: '#e8c04a',
    emblem: 'eagle',
    description:
      'Наследница Рима, раскинувшаяся от Рейна до Тибра. Богатые вольные города, гильдии оружейников Милана и Нюрнберга, ' +
      'закованные в латы рыцари и генуэзские арбалетчики. Император правит из Праги, но князья и города своевольны.',
    bonus: 'Тяжёлая пехота, арбалетчики и рыцари. Лучшие латы в лавках.',
    capital: 'prague',
  },
  nordmark: {
    id: 'nordmark',
    name: 'Нордмарк',
    short: 'Нордмарк',
    adjective: 'нордмаркский',
    ruler: 'Магнус Эрикссон',
    rulerTitle: 'Конунг',
    color: 0xa83232,
    color2: 0xf0ece0,
    css: '#c24040',
    css2: '#f0ece0',
    emblem: 'axe',
    description:
      'Союз северных земель: фьорды Норвегии, леса Швеции, острова Британии и торговые города Балтики. ' +
      'Суровые бонды и хускарлы с топорами и щитами держат стену, а лучники бьют из лесной чащи.',
    bonus: 'Стойкая пехота со щитами, меткие лучники, крепкий боевой дух.',
    capital: 'stockholm',
  },
  horde: {
    id: 'horde',
    name: 'Орда Синего Неба',
    short: 'Орда',
    adjective: 'ордынский',
    ruler: 'Джанибек',
    rulerTitle: 'Хан',
    color: 0xd9a21b,
    color2: 0x2a2320,
    css: '#e0aa24',
    css2: '#2a2320',
    emblem: 'horse',
    description:
      'Наследники Чингисхана держат Великую степь от Днепра до Ханбалыка. Тумены конных лучников ' +
      'появляются внезапно и исчезают, осыпав врага стрелами. Шёлковый путь приносит хану несметные богатства.',
    bonus: 'Лучшая конница и конные лучники. Быстрые перемещения по степи.',
    capital: 'sarai',
  },
  sultanate: {
    id: 'sultanate',
    name: 'Султанат Аль-Захра',
    short: 'Султанат',
    adjective: 'султанский',
    ruler: 'Ан-Насир Хасан',
    rulerTitle: 'Султан',
    color: 0x2e8b57,
    color2: 0xf2efe6,
    css: '#35a066',
    css2: '#f2efe6',
    emblem: 'crescent',
    description:
      'Цветущий султанат от Гранады до Исфахана. Каир — величайший город мира, Дамаск славится клинками, ' +
      'Багдад — мудрецами. Мамлюки — непобедимая гвардия, выкованная из рабов в лучших воинов эпохи.',
    bonus: 'Копейщики, лучники и мамлюкская конница. Лучшие клинки.',
    capital: 'cairo',
  },
};

export const FACTION_IDS: FactionId[] = ['aurelia', 'nordmark', 'horde', 'sultanate'];

/** Войны в начале игры. Остальные пары — мир. */
export const INITIAL_WARS: [FactionId, FactionId][] = [
  ['aurelia', 'sultanate'],
  ['nordmark', 'horde'],
];

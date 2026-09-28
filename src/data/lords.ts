import type { FactionId } from './factions';

export interface LordDef {
  name: string;
  title: string;
  /** 3 — правитель, 2 — крупный вельможа, 1 — рыцарь. */
  rank: 1 | 2 | 3;
}

export const LORDS: Record<FactionId, LordDef[]> = {
  aurelia: [
    { name: 'Карл IV Аурен', title: 'Император', rank: 3 },
    { name: 'Альбрехт Австрийский', title: 'Герцог', rank: 2 },
    { name: 'Людвиг Бранденбургский', title: 'Маркграф', rank: 2 },
    { name: 'Лукино Висконти', title: 'Синьор', rank: 2 },
    { name: 'Фридрих фон Эшенбах', title: 'Граф', rank: 1 },
    { name: 'Рудольф Габсбург', title: 'Граф', rank: 1 },
    { name: 'Кангранде Скалигер', title: 'Кондотьер', rank: 1 },
    { name: 'Вольфрам фон Штайн', title: 'Барон', rank: 1 },
  ],
  nordmark: [
    { name: 'Магнус Эрикссон', title: 'Конунг', rank: 3 },
    { name: 'Сигурд Хаконссон', title: 'Ярл', rank: 2 },
    { name: 'Эрлинг Видкунссон', title: 'Ярл', rank: 2 },
    { name: 'Эдмунд Йоркский', title: 'Ярл', rank: 2 },
    { name: 'Кнут Порсе', title: 'Херсир', rank: 1 },
    { name: 'Бьёрн Железнобокий', title: 'Херсир', rank: 1 },
    { name: 'Онфим Новгородский', title: 'Посадник', rank: 1 },
    { name: 'Гуннар Скальд', title: 'Херсир', rank: 1 },
  ],
  horde: [
    { name: 'Джанибек', title: 'Хан', rank: 3 },
    { name: 'Мамай', title: 'Беклярибек', rank: 2 },
    { name: 'Тогай', title: 'Нойон', rank: 2 },
    { name: 'Кутлуг-Тимур', title: 'Нойон', rank: 2 },
    { name: 'Урус', title: 'Мурза', rank: 1 },
    { name: 'Хызр', title: 'Мурза', rank: 1 },
    { name: 'Бердибек', title: 'Царевич', rank: 1 },
    { name: 'Тенгиз-Буга', title: 'Мурза', rank: 1 },
  ],
  sultanate: [
    { name: 'Ан-Насир Хасан', title: 'Султан', rank: 3 },
    { name: 'Шайхун аль-Умари', title: 'Эмир', rank: 2 },
    { name: 'Тазз ан-Насири', title: 'Эмир', rank: 2 },
    { name: 'Юсуф ибн Тахир', title: 'Атабек', rank: 2 },
    { name: 'Сангар аль-Джавли', title: 'Наиб', rank: 1 },
    { name: 'Байбуга Рус', title: 'Эмир', rank: 1 },
    { name: 'Салих ибн Калаун', title: 'Эмир', rank: 1 },
    { name: 'Манджак аль-Юсуфи', title: 'Наиб', rank: 1 },
  ],
};

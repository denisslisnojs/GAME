import type { FactionId } from './factions';
import { tr } from '../i18n';

export interface LordDef {
  name: string;
  title: string;
  /** 3 — правитель, 2 — крупный вельможа, 1 — рыцарь. */
  rank: 1 | 2 | 3;
}

export const LORDS: Record<FactionId, LordDef[]> = {
  aurelia: [
    { name: tr('Карл IV Аурен'), title: tr('Император'), rank: 3 },
    { name: tr('Альбрехт Австрийский'), title: tr('Герцог'), rank: 2 },
    { name: tr('Людвиг Бранденбургский'), title: tr('Маркграф'), rank: 2 },
    { name: tr('Лукино Висконти'), title: tr('Синьор'), rank: 2 },
    { name: tr('Фридрих фон Эшенбах'), title: tr('Граф'), rank: 1 },
    { name: tr('Рудольф Габсбург'), title: tr('Граф'), rank: 1 },
    { name: tr('Кангранде Скалигер'), title: tr('Кондотьер'), rank: 1 },
    { name: tr('Вольфрам фон Штайн'), title: tr('Барон'), rank: 1 },
  ],
  nordmark: [
    { name: tr('Магнус Эрикссон'), title: tr('Конунг'), rank: 3 },
    { name: tr('Сигурд Хаконссон'), title: tr('Ярл'), rank: 2 },
    { name: tr('Эрлинг Видкунссон'), title: tr('Ярл'), rank: 2 },
    { name: tr('Эдмунд Йоркский'), title: tr('Ярл'), rank: 2 },
    { name: tr('Кнут Порсе'), title: tr('Херсир'), rank: 1 },
    { name: tr('Бьёрн Железнобокий'), title: tr('Херсир'), rank: 1 },
    { name: tr('Онфим Новгородский'), title: tr('Посадник'), rank: 1 },
    { name: tr('Гуннар Скальд'), title: tr('Херсир'), rank: 1 },
  ],
  horde: [
    { name: tr('Джанибек'), title: tr('Хан'), rank: 3 },
    { name: tr('Мамай'), title: tr('Беклярибек'), rank: 2 },
    { name: tr('Тогай'), title: tr('Нойон'), rank: 2 },
    { name: tr('Кутлуг-Тимур'), title: tr('Нойон'), rank: 2 },
    { name: tr('Урус'), title: tr('Мурза'), rank: 1 },
    { name: tr('Хызр'), title: tr('Мурза'), rank: 1 },
    { name: tr('Бердибек'), title: tr('Царевич'), rank: 1 },
    { name: tr('Тенгиз-Буга'), title: tr('Мурза'), rank: 1 },
  ],
  sultanate: [
    { name: tr('Ан-Насир Хасан'), title: tr('Султан'), rank: 3 },
    { name: tr('Шайхун аль-Умари'), title: tr('Эмир'), rank: 2 },
    { name: tr('Тазз ан-Насири'), title: tr('Эмир'), rank: 2 },
    { name: tr('Юсуф ибн Тахир'), title: tr('Атабек'), rank: 2 },
    { name: tr('Сангар аль-Джавли'), title: tr('Наиб'), rank: 1 },
    { name: tr('Байбуга Рус'), title: tr('Эмир'), rank: 1 },
    { name: tr('Салих ибн Калаун'), title: tr('Эмир'), rank: 1 },
    { name: tr('Манджак аль-Юсуфи'), title: tr('Наиб'), rank: 1 },
  ],
};

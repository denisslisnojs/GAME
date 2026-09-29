// Сцены пролога: гонец в лагере, староста, проводник в таверне, победа, возвращение, доклад государю.

import { COMPANION_BY_ID } from '../data/companions';
import { FACTIONS } from '../data/factions';
import { TROOPS } from '../data/troops';
import { companionPortraitURL, portraitURL } from '../gfx/icons';
import {
  acceptPrologue,
  prologueGuideJoins,
  prologueReturn,
  prologueRuler,
  prologueStep,
  prologueVictoryTold,
  prologueVillage,
  skipPrologue,
} from '../game/prologue';
import { canEnter } from '../game/logic';
import { hostOf } from '../game/quests';
import { world, type Settlement } from '../game/world';
import { toast } from './dom';
import type { GameCtx } from './panels';
import { openStory } from './story';
import { lc, tr } from '../i18n';

const GUIDE_LINE: Record<string, (village: string) => string> = {
  vaclav: (v) => tr`— Лиса? Знаю. Прошлой весной его люди вырезали мою артель углежогов. Логово у него в овраге за мельницей, у деревни ${v}. Я проведу — и денег не возьму: с Лисом у меня свои счёты.`,
  olga: (v) => tr`— Чёрный Лис… Его псы сожгли мой хутор, пока муж был в походе. Я знаю, где они прячутся — у деревни ${v}, на старой вырубке. Возьми меня с собой, и платы не надо: мне нужна его голова.`,
  aigerim: (v) => tr`— Этот шакал угнал табун моего рода. Я выследила его стоянку у деревни ${v}, за курганом. Пойду с тобой даром: мне нужны только мои кони и его шкура.`,
  isaac: (v) => tr`— Чёрный Лис разграбил мой караван у Кафы — шёлк, перец, всё. Мои люди видели его стан у деревни ${v}. Я пойду с вами без платы: вернуть бы хоть часть товара…`,
};

function names(ctx: GameCtx) {
  const p = ctx.state.prologue!;
  const village = world.byId.get(p.village)!;
  const town = world.byId.get(p.town)!;
  const guide = COMPANION_BY_ID[p.comp];
  const f = FACTIONS[ctx.state.hero.faction];
  return { p, village, town, guide, f };
}

/** Гонец в лагере: с этого начинается игра. */
export function openPrologueIntro(ctx: GameCtx) {
  const { village, f } = names(ctx);
  openStory({
    title: tr`Дым над деревней ${village.name}`,
    portrait: portraitURL(`${ctx.state.hero.faction}_i1`),
    text: [
      tr`Едва ${lc(f.rulerTitle)} ${f.ruler} принял вашу присягу, в лагерь влетел мальчишка на неосёдланной кобыле.`,
      tr`— Господин! Разбойники налетели на деревню ${village.name}! Угнали скот, увели дочку старосты… Староста молит о помощи. Ведёт их Чёрный Лис — беглый наёмник, злой как чёрт.`,
    ],
    note: tr('Пролог — короткое поручение, которое заодно научит вас игре. Цель всегда видна внизу слева, а место на карте отмечено золотой стрелкой.'),
    options: [
      { label: tr('По коням!'), hint: tr('пролог-обучение'), primary: true, run: () => { acceptPrologue(ctx.state); ctx.commit(); } },
      { label: tr('Пусть разбираются сами'), hint: tr('без обучения'), run: () => { skipPrologue(ctx.state); ctx.commit(); toast(tr('Пролог пропущен. Мир открыт — удачи!'), 3000); } },
    ],
  });
}

/** Прибытие в поселение: сюжетная сцена, если она здесь ждёт. true — сцена показана, then() откроет поселение после неё. */
export function prologueOnArrive(ctx: GameCtx, s: Settlement, then: () => void): boolean {
  const step = prologueStep(ctx.state);
  if (!step || !canEnter(ctx.state, s)) return false;
  const { p, village, town, guide, f } = names(ctx);
  const elderName = hostOf(ctx.state, village).name;
  const elderFace = portraitURL(`${village.culture}_i1`);
  const show = (open: () => void) => {
    if (ctx.modal) ctx.modal(open);
    else open();
    return true;
  };
  if (step === 'village' && s.id === p.village) {
    return show(() =>
      openStory({
        title: elderName,
        portrait: elderFace,
        text: [
          tr('Вас встречает староста — седой, чёрный от копоти пожара.'),
          tr`— Храни вас Бог, милорд! Их было полтора десятка, при главаре — Чёрный Лис. Ушли в лес, а где их логово — никто не знает. Разве что ${guide.title} ${guide.name}: сидит в таверне города ${town.name}, знает здешние тропы.`,
          tr('— Только людей у вас маловато… Наши парни пойдут с вами — берите, кого прокормите. А вот что собрали всем миром: на доброе оружие.'),
        ],
        note: tr('Получено: +150 ¤. Наймите крестьян здесь же: «Нанять крестьян».'),
        options: [{ label: tr('Соберу людей'), primary: true, run: () => { prologueVillage(ctx.state); ctx.commit(); } }],
        onClose: then,
      }),
    );
  }
  if (step === 'return' && s.id === p.village) {
    const militia = TROOPS[`${ctx.state.hero.faction}_i2`].name;
    return show(() => {
      const r = prologueReturn(ctx.state);
      ctx.commit();
      openStory({
        title: elderName,
        portrait: elderFace,
        text: [
          tr('Вся деревня высыпала навстречу. Дочь старосты бросается отцу на шею, бабы плачут, мужики крестятся.'),
          tr('— Век не забудем, милорд! Вот всё, что осталось в общинном сундуке. И трое наших парней просятся под ваше знамя.'),
        ],
        note: tr`Получено: +${r.gold} ¤, ${militia} ×${r.volunteers}, отношение со старостой +25.`,
        options: [{ label: tr('Служите честно'), primary: true }],
        onClose: then,
      });
    });
  }
  if (step === 'ruler' && s.id === p.town) {
    return show(() => {
      const r = prologueRuler(ctx.state);
      ctx.commit();
      openStory({
        title: `${f.rulerTitle} ${f.ruler}`,
        portrait: portraitURL(`${ctx.state.hero.faction}_c4m`),
        text: [
          tr`${f.rulerTitle} ${f.ruler} принимает вас в тронном зале.`,
          tr('— Так это вы проучили Чёрного Лиса? Мне нужны такие люди. Служите верно — будут и земли, и слава. Поручения ищите у меня, у моих лордов и у деревенских старост; на ристалищах бьются за призы, в тавернах ждут наёмники и спутники.'),
          tr('— А теперь ступайте. С востока идёт чёрный мор, а враги точат мечи. Наша держава должна владеть всей Евразией — и вы мне в этом поможете.'),
        ],
        note: tr`Пролог окончен: +${r.gold} ¤, отношение с государем +10.`,
        options: [{ label: tr('Служу державе!'), primary: true, run: () => toast(tr('Пролог пройден! Дальше — сами. Удачи!'), 4000) }],
        onClose: then,
      });
    });
  }
  return false;
}

/** В таверне ждёт проводник. true — сцена показана, then() откроет таверну после неё. */
export function prologueOnTavern(ctx: GameCtx, s: Settlement, then: () => void): boolean {
  if (prologueStep(ctx.state) !== 'tavern') return false;
  const { p, village, guide } = names(ctx);
  if (s.id !== p.town) return false;
  if (ctx.state.companions?.find((c) => c.id === p.comp)?.where === 'party') return false;
  const line = GUIDE_LINE[p.comp]?.(village.name) ?? '';
  const show = (open: () => void) => {
    if (ctx.modal) ctx.modal(open);
    else open();
  };
  show(() =>
    openStory({
      title: guide.name,
      portrait: companionPortraitURL(p.comp),
      text: [tr`${guide.name} сидит у очага и точит нож. Услышав о Чёрном Лисе, поднимает глаза.`, line],
      note: tr('Спутники бьются рядом с героем, не гибнут, а только получают раны, и дают отряду свои умения.'),
      options: [{ label: tr('Добро пожаловать в отряд'), primary: true, run: () => { prologueGuideJoins(ctx.state); ctx.commit(); toast(tr`${guide.name} присоединился к отряду`); } }],
      onClose: then,
    }),
  );
  return true;
}

/** Шайка разбита: рассказ о победе. */
export function openPrologueVictory(ctx: GameCtx) {
  const { village, guide } = names(ctx);
  openStory({
    title: tr('Лис повержен'),
    portrait: companionPortraitURL(ctx.state.prologue!.comp),
    text: [
      tr('Разбойники бегут кто куда, Чёрный Лис лежит в пыли. Из-за перевёрнутой телеги выбирается дочь старосты — живая и невредимая.'),
      tr`${guide.name}: — Хорошая работа. Твои люди понюхали крови — теперь их можно и подучить. А девушку пора вернуть домой, в деревню ${village.name}.`,
    ],
    note: tr('Воины набирают опыт в боях. Готовых к повышению видно в окне «Отряд» — по значку со стрелкой.'),
    options: [{ label: tr('Так и сделаем'), primary: true, run: () => { prologueVictoryTold(ctx.state); ctx.commit(); } }],
  });
}

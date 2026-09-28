// Дорожные события: короткие сцены с выбором, которые случаются в пути.

import { FACTION_IDS, FACTIONS } from '../data/factions';
import { ITEM_LIST } from '../data/items';
import { TROOPS } from '../data/troops';
import { cellCenterWorld, worldToCell } from '../map/geo';
import { companionDeed, inParty, isWounded, partySkill } from './companions';
import { gainHeroXp } from './battleResult';
import { addTroops, partySize } from './logic';
import { spawn } from './parties';
import { addRelation } from './quests';
import type { GameState } from './state';
import { news } from './war';
import { world, type Settlement } from './world';

export interface EventOption {
  label: string;
  hint?: string;
  /** Можно ли выбрать (например, хватает ли денег). */
  can?: (s: GameState) => boolean;
  run: (s: GameState) => string;
}

export interface RoadEvent {
  id: string;
  title: string;
  text: (s: GameState) => string;
  when?: (s: GameState) => boolean;
  options: EventOption[];
}

const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

function nearestVillage(state: GameState): Settlement {
  let best = world.settlements[0];
  let bd = Infinity;
  for (const s of world.settlements) {
    if (s.type !== 'village') continue;
    const d = Math.hypot(s.x - state.party.x, s.y - state.party.y);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

/** Реплики спутников — в летопись и в итог события. */
function deedLine(state: GameState, d: Parameters<typeof companionDeed>[1]): string {
  const lines = companionDeed(state, d);
  for (const l of lines) news(state, l, 'party');
  return lines.length ? `\n\n${lines.join(' ')}` : '';
}

function randomItem(maxTier: number): string | null {
  const pool = ITEM_LIST.filter((it) => it.tier <= maxTier);
  const it = pool[Math.floor(Math.random() * pool.length)];
  if (!it) return null;
  return it.id;
}

function giveItem(state: GameState, maxTier: number): string {
  const id = randomItem(maxTier);
  if (!id) return '';
  (state.hero.bag ??= []).push(id);
  return ITEM_LIST.find((x) => x.id === id)!.name;
}

function loseTroops(state: GameState, n: number): number {
  let left = n;
  const byTier = [...state.party.troops].sort((a, b) => TROOPS[a.id].tier - TROOPS[b.id].tier);
  for (const t of byTier) {
    if (left <= 0) break;
    const k = Math.min(t.count, left);
    t.count -= k;
    left -= k;
  }
  state.party.troops = state.party.troops.filter((t) => t.count > 0);
  return n - left;
}

/** Засада: рядом с отрядом появляется шайка, которая сразу нападает. */
function ambush(state: GameState, kind: 'bandits' | 'deserters') {
  const c = worldToCell(state.party.x, state.party.y);
  const p = spawn(state, kind, 'outlaw', c, Math.random);
  if (!p) return;
  const pos = cellCenterWorld(c.cx, c.cy);
  p.x = pos.x + 30;
  p.y = pos.y;
  p.calmUntil = 0;
  (state.parties ??= []).push(p);
}

export const EVENTS: RoadEvent[] = [
  {
    id: 'fire',
    title: 'Горит деревня',
    text: (s) => `Над деревней ${nearestVillage(s).name} поднимается чёрный дым: загорелся амбар, огонь перекидывается на избы. Крестьяне мечутся с вёдрами.`,
    options: [
      {
        label: 'Помочь тушить',
        hint: 'полдня пути, благодарность старосты',
        run: (s) => {
          const v = nearestVillage(s);
          s.time += 0.5;
          addRelation(s, `elder:${v.id}`, 8);
          const xp = gainHeroXp(s, 25);
          return `Ваши люди до вечера таскали воду и растаскивали горящие брёвна. Деревню отстояли. Староста ${v.name} кланяется в пояс: «Век не забудем». ${xp ? 'Герой стал опытнее.' : ''}`;
        },
      },
      { label: 'Проехать мимо', run: () => 'Отряд идёт дальше. Дым ещё долго виден за спиной.' },
    ],
  },
  {
    id: 'pilgrims',
    title: 'Паломники',
    text: () => 'На обочине сидят паломники — два десятка мужчин и женщин с посохами и раковинами на шапках. Старший просит проводить их до ближайшего города: на дорогах неспокойно.',
    options: [
      {
        label: 'Проводить',
        hint: 'день пути, плата и молитвы за вас',
        run: (s) => {
          s.time += 1;
          const g = rnd(50, 110);
          s.gold += g;
          s.blessUntil = Math.max(s.blessUntil ?? 0, s.time + 10);
          return `Паломники поют псалмы всю дорогу. У ворот города старший протягивает кошель: «Всё, что собрали». +${g} ¤. Боевой дух армии выше на 10 дней — за вас молятся.`;
        },
      },
      { label: 'Отказать', run: () => 'Паломники молча крестятся и отворачиваются.' },
    ],
  },
  {
    id: 'deserters',
    title: 'Дезертиры',
    text: (s) => `Из кустов выходят пятеро в рваных стёганках, руки подняты. «Мы из войска державы «${FACTIONS[FACTION_IDS[Math.floor(s.time) % 4]].short}». Лорд нас бросил без жалованья. Возьми к себе — будем служить честно».`,
    options: [
      {
        label: 'Взять в отряд',
        hint: 'бесплатно, но вдруг сбегут и от вас',
        run: (s) => {
          const f = FACTION_IDS[Math.floor(s.time) % 4];
          const n = rnd(3, 5);
          addTroops(s, `${f}_i2`, n);
          return `${n} бывалых ополченцев встают в строй. Кто бросил одного господина, может бросить и другого — но пока они благодарны.`;
        },
      },
      {
        label: 'Прогнать',
        run: () => 'Дезертиры уходят в лес, бормоча проклятия.',
      },
      {
        label: 'Отобрать оружие',
        hint: 'трофей, но кому-то это не понравится',
        run: (s) => {
          const it = giveItem(s, 2);
          return `Дезертиры отдают оружие и уходят ни с чем. В сумку: ${it}.` + deedLine(s, 'cruelty');
        },
      },
    ],
  },
  {
    id: 'relic',
    title: 'Монах с реликвией',
    text: () => 'Босой монах несёт ларец из почерневшего дерева. «Здесь перст святого Георгия, — шепчет он. — Воины, что прикоснутся к нему, не знают страха. Отдам за пожертвование на обитель».',
    options: [
      {
        label: 'Пожертвовать 150 ¤',
        hint: 'боевой дух армии выше на месяц',
        can: (s) => s.gold >= 150,
        run: (s) => {
          s.gold -= 150;
          s.blessUntil = Math.max(s.blessUntil ?? 0, s.time + 30);
          return 'Воины по очереди касаются ларца. Кто-то плачет, кто-то смеётся — но в строю будто прибавилось сил. Боевой дух армии выше на 30 дней.';
        },
      },
      { label: 'Не верить', run: () => 'Монах пожимает плечами: «Бог вам судья» — и уходит своей дорогой.' },
    ],
  },
  {
    id: 'spices',
    title: 'Сомнительная сделка',
    text: () => 'Купец с бегающими глазами предлагает мешок перца «прямо из Александрии» за треть цены. Мешок завязан, развязать не даёт: «Сырость испортит!»',
    options: [
      {
        label: 'Купить за 250 ¤',
        hint: 'рискнуть',
        can: (s) => s.gold >= 250,
        run: (s) => {
          s.gold -= 250;
          const trade = partySkill(s, 'trade');
          if (Math.random() < 0.45 + trade * 0.1) {
            s.cargo.spices = (s.cargo.spices ?? 0) + 3;
            return 'В мешке настоящий перец, пахнущий Индией. Три меры пряностей в обоз!';
          }
          return 'В мешке — толчёные жёлуди с горстью перца сверху. Купца и след простыл.';
        },
      },
      {
        label: 'Развязать мешок силой',
        hint: 'нужна «Торговля» 2 или спутник-купец',
        can: (s) => partySkill(s, 'trade') >= 2,
        run: (s) => {
          s.gold += 40;
          return 'Под перцем жёлуди. Купец бледнеет и откупается сорока монетами, лишь бы вы молчали. +40 ¤.';
        },
      },
      { label: 'Отказаться', run: () => 'Купец обиженно уезжает искать глупца попроще.' },
    ],
  },
  {
    id: 'knight',
    title: 'Раненый рыцарь',
    text: () => 'У дороги лежит рыцарь в помятой кольчуге, рядом пал конь. Он дышит тяжело, из-под шлема течёт кровь. Оруженосца не видно.',
    options: [
      {
        label: 'Перевязать раны',
        hint: 'лучше, если есть лекарь',
        run: (s) => {
          const surg = partySkill(s, 'surgery');
          if (Math.random() < 0.35 + surg * 0.13) {
            const it = giveItem(s, 4);
            gainHeroXp(s, 30);
            return `Рыцарь приходит в себя. «Я не забуду этого», — говорит он и оставляет вам в благодарность ${it}.`;
          }
          return 'Вы сделали что могли, но к вечеру рыцарь умер. Его похоронили у дороги под грубым крестом.';
        },
      },
      {
        label: 'Обобрать',
        hint: 'трофей, позорно',
        run: (s) => {
          const it = giveItem(s, 4);
          return `Вы сняли с умирающего всё ценное: ${it}. Воины прячут глаза.` + deedLine(s, 'cruelty');
        },
      },
      { label: 'Проехать мимо', run: () => 'Отряд отводит взгляд и проезжает мимо.' },
    ],
  },
  {
    id: 'serf',
    title: 'Беглый крепостной',
    text: () => 'Запыхавшийся парень хватает стремя героя: «Спаси, господин! Бежал от барина, за мной псари с собаками». Вдали слышен лай.',
    options: [
      {
        label: 'Спрятать и взять в отряд',
        run: (s) => {
          addTroops(s, `${s.hero.faction}_i1`, 1);
          return 'Парня прячут в обозе под мешками. Псари проносятся мимо. Теперь у вас на одного крестьянина больше — и он будет драться за вас насмерть.';
        },
      },
      {
        label: 'Выдать псарям',
        hint: '+30 ¤ награды',
        run: (s) => {
          s.gold += 30;
          return 'Псари благодарят и платят тридцать монет. Парня уводят на верёвке. +30 ¤.' + deedLine(s, 'cruelty');
        },
      },
    ],
  },
  {
    id: 'jugglers',
    title: 'Бродячие жонглёры',
    text: () => 'У костра на перекрёстке — жонглёры, волынщик и девушка с бубном. Предлагают устроить представление для ваших людей.',
    options: [
      {
        label: 'Заплатить 25 ¤',
        can: (s) => s.gold >= 25,
        run: (s) => {
          s.gold -= 25;
          for (const { cs } of inParty(s)) cs.loyalty = Math.min(100, cs.loyalty + 6);
          return 'Вечер песен, плясок и огненных шаров. Даже самые угрюмые смеются. Спутники довольны.';
        },
      },
      { label: 'Прогнать', run: () => 'Жонглёры собирают пожитки и уходят, ворча.' },
    ],
  },
  {
    id: 'miller',
    title: 'Ночлег у мельника',
    text: () => 'Мельник у реки предлагает переночевать в сухом амбаре, накормить людей горячей кашей и промыть раны.',
    when: (s) => inParty(s).some(({ cs }) => isWounded(s, cs)) || s.party.troops.length > 0,
    options: [
      {
        label: 'Остаться на ночь (20 ¤)',
        hint: 'полдня, раны спутников заживут',
        can: (s) => s.gold >= 20,
        run: (s) => {
          s.gold -= 20;
          s.time += 0.5;
          let healed = 0;
          for (const { cs } of inParty(s))
            if (isWounded(s, cs)) {
              cs.woundedUntil = undefined;
              healed++;
            }
          return healed ? `Отряд отдохнул. Раненые спутники снова в строю (${healed}).` : 'Отряд выспался в тепле. Утром люди идут бодрее.';
        },
      },
      { label: 'Идти дальше', run: () => 'Мельник пожимает плечами и возвращается к жерновам.' },
    ],
  },
  {
    id: 'wolves',
    title: 'Волки',
    text: () => 'Ночью лагерь окружила волчья стая. Лошади бьются на привязи, часовые жмутся к кострам.',
    options: [
      {
        label: 'Отогнать огнём',
        run: (s) => {
          if (partySkill(s, 'pathfinding') >= 2 || Math.random() < 0.5) return 'Факелы и крики сделали своё дело: стая ушла в темноту. Потерь нет.';
          const g = s.cargo.grain ?? 0;
          if (g > 0) s.cargo.grain = g - 1;
          else delete s.cargo.grain;
          return 'Волки ушли, но успели разорвать мешки в обозе. Пропала мера зерна.';
        },
      },
      {
        label: 'Устроить охоту',
        hint: 'шкуры, но кто-то может пострадать',
        run: (s) => {
          if (Math.random() < 0.7) {
            s.cargo.furs = (s.cargo.furs ?? 0) + 1;
            return 'К утру у костра лежат три волчьи шкуры. +1 мера мехов.';
          }
          const n = loseTroops(s, 1);
          return `Охота удалась, но один воин (${n}) не вернулся — его нашли в овраге. +1 мера мехов.`;
        },
      },
    ],
  },
  {
    id: 'plague_cart',
    title: 'Чумной обоз',
    when: (s) => !!s.plague?.started,
    text: () => 'Посреди дороги брошенная телега. Возница мёртв, на теле чёрные бубоны. В телеге сундук, окованный железом.',
    options: [
      {
        label: 'Сжечь обоз',
        run: () => 'Телегу обкладывают хворостом и поджигают. Ветер уносит дым в сторону. Никто не заболел.',
      },
      {
        label: 'Забрать сундук',
        hint: 'золото, но мор…',
        run: (s) => {
          const g = rnd(140, 260);
          s.gold += g;
          if (Math.random() < 0.4) {
            const n = loseTroops(s, rnd(2, 4));
            return `В сундуке ${g} ¤. Через три дня у ${n} воинов жар и опухоли под мышками. Их пришлось оставить в ближайшей деревне.` + deedLine(s, 'caravan');
          }
          return `В сундуке ${g} ¤. Воины крестятся, но никто не заболел. Пока.` + deedLine(s, 'caravan');
        },
      },
    ],
  },
  {
    id: 'wreck',
    title: 'Разбитый караван',
    text: () => 'Обломки телег, мёртвые мулы, вспоротые тюки. Разбойники ушли недавно — следы свежие.',
    options: [
      {
        label: 'Собрать уцелевшее',
        run: (s) => {
          const goods = ['cloth', 'wine', 'salt', 'wool', 'iron'] as const;
          const g = goods[rnd(0, goods.length - 1)];
          s.cargo[g] = (s.cargo[g] ?? 0) + rnd(1, 3);
          return 'Среди обломков нашлось кое-что целое. Товары погружены в обоз.';
        },
      },
      {
        label: 'Пойти по следам',
        hint: 'шайка где-то рядом',
        run: (s) => {
          ambush(s, 'bandits');
          return 'Следы ведут в овраг… и оттуда с рёвом выскакивают разбойники! К бою!';
        },
      },
    ],
  },
  {
    id: 'veteran',
    title: 'Старый солдат',
    text: () => 'Одноногий ветеран сидит у колодца. «Служил ещё при старом короле. Дайте на хлеб — научу ваших сопляков держать строй».',
    when: (s) => partySize(s) >= 5,
    options: [
      {
        label: 'Заплатить 80 ¤',
        hint: 'опыт всему отряду',
        can: (s) => s.gold >= 80,
        run: (s) => {
          s.gold -= 80;
          for (const t of s.party.troops) if (TROOPS[t.id]?.upgradesTo.length) t.xp += 12 * t.count;
          return 'Целый день ветеран гоняет воинов: «Щиты выше! Шаг! Ещё шаг!» Отряд набрался опыта.';
        },
      },
      { label: 'Дать медяк и уйти', run: () => 'Ветеран благодарит и желает вам не терять ног.' },
    ],
  },
  {
    id: 'toll',
    title: 'Мытарь у моста',
    text: () => 'На мосту — застава: мытарь местного барона требует пошлину за проход отряда: 60 монет.',
    options: [
      {
        label: 'Заплатить 60 ¤',
        can: (s) => s.gold >= 60,
        run: (s) => {
          s.gold -= 60;
          return 'Мытарь пересчитывает монеты, кусает одну и поднимает шлагбаум.';
        },
      },
      {
        label: 'Пройти силой',
        hint: 'стража из дезертиров',
        run: (s) => {
          ambush(s, 'deserters');
          return 'Мытарь свистит, и из сторожки высыпает стража — наёмники без роду и племени. К бою!';
        },
      },
      {
        label: 'Искать брод',
        hint: 'полдня пути',
        run: (s) => {
          s.time += 0.5;
          return 'Брод нашёлся ниже по течению. Вымокли, но сберегли деньги.';
        },
      },
    ],
  },
];

/** Выбрать событие на сегодня (или ничего). */
export function pickEvent(state: GameState): RoadEvent | null {
  const pool = EVENTS.filter((e) => !e.when || e.when(state));
  if (!pool.length) return null;
  const seen = state.eventsSeen ?? {};
  // Недавние события реже
  const weights = pool.map((e) => (seen[e.id] && state.time - seen[e.id] < 20 ? 0.15 : 1));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export function markEvent(state: GameState, e: RoadEvent) {
  state.lastEvent = state.time;
  (state.eventsSeen ??= {})[e.id] = state.time;
}

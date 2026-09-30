// Дорожные события: короткие сцены с выбором, которые случаются в пути.

import { FACTION_IDS, FACTIONS } from '../data/factions';
import { ITEM_LIST } from '../data/items';
import { TROOPS } from '../data/troops';
import { cellCenterWorld, worldToCell } from '../map/geo';
import { companionDeed, inParty, isWounded, partySkill } from './companions';
import { gainHeroXp } from './battleResult';
import { addTroops, partyRoom, partySize } from './logic';
import { spawn } from './parties';
import { addRelation } from './quests';
import type { GameState } from './state';
import { news } from './war';
import { world, type Settlement } from './world';
import { tr } from '../i18n';

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
    title: tr('Горит деревня'),
    text: (s) => tr`Над деревней ${nearestVillage(s).name} поднимается чёрный дым: загорелся амбар, огонь перекидывается на избы. Крестьяне мечутся с вёдрами.`,
    options: [
      {
        label: tr('Помочь тушить'),
        hint: tr('полдня пути, благодарность старосты'),
        run: (s) => {
          const v = nearestVillage(s);
          s.time += 0.5;
          addRelation(s, `elder:${v.id}`, 8);
          const xp = gainHeroXp(s, 25);
          return tr`Ваши люди до вечера таскали воду и растаскивали горящие брёвна. Деревню отстояли. Староста ${v.name} кланяется в пояс: «Век не забудем». ${xp ? tr('Герой стал опытнее.') : ''}`;
        },
      },
      { label: tr('Проехать мимо'), run: () => tr('Отряд идёт дальше. Дым ещё долго виден за спиной.') },
    ],
  },
  {
    id: 'pilgrims',
    title: tr('Паломники'),
    text: () => tr('На обочине сидят паломники — два десятка мужчин и женщин с посохами и раковинами на шапках. Старший просит проводить их до ближайшего города: на дорогах неспокойно.'),
    options: [
      {
        label: tr('Проводить'),
        hint: tr('день пути, плата и молитвы за вас'),
        run: (s) => {
          s.time += 1;
          const g = rnd(50, 110);
          s.gold += g;
          s.blessUntil = Math.max(s.blessUntil ?? 0, s.time + 10);
          return tr`Паломники поют псалмы всю дорогу. У ворот города старший протягивает кошель: «Всё, что собрали». +${g} ¤. Боевой дух армии выше на 10 дней — за вас молятся.`;
        },
      },
      { label: tr('Отказать'), run: () => tr('Паломники молча крестятся и отворачиваются.') },
    ],
  },
  {
    id: 'deserters',
    title: tr('Дезертиры'),
    text: (s) => tr`Из кустов выходят пятеро в рваных стёганках, руки подняты. «Мы из войска державы «${FACTIONS[FACTION_IDS[Math.floor(s.time) % 4]].short}». Лорд нас бросил без жалованья. Возьми к себе — будем служить честно».`,
    options: [
      {
        label: tr('Взять в отряд'),
        hint: tr('бесплатно, но вдруг сбегут и от вас'),
        run: (s) => {
          const f = FACTION_IDS[Math.floor(s.time) % 4];
          const n = Math.min(rnd(3, 5), partyRoom(s));
          if (n <= 0) return tr('Места в отряде нет: вам и так не прокормить и не удержать в узде больше людей. Дезертиры пожимают плечами и уходят в лес.');
          addTroops(s, `${f}_i2`, n);
          return tr`${n} бывалых ополченцев встают в строй. Кто бросил одного господина, может бросить и другого — но пока они благодарны.`;
        },
      },
      {
        label: tr('Прогнать'),
        run: () => tr('Дезертиры уходят в лес, бормоча проклятия.'),
      },
      {
        label: tr('Отобрать оружие'),
        hint: tr('трофей, но кому-то это не понравится'),
        run: (s) => {
          const it = giveItem(s, 2);
          return tr`Дезертиры отдают оружие и уходят ни с чем. В сумку: ${it}.` + deedLine(s, 'cruelty');
        },
      },
    ],
  },
  {
    id: 'relic',
    title: tr('Монах с реликвией'),
    text: () => tr('Босой монах несёт ларец из почерневшего дерева. «Здесь перст святого Георгия, — шепчет он. — Воины, что прикоснутся к нему, не знают страха. Отдам за пожертвование на обитель».'),
    options: [
      {
        label: tr('Пожертвовать 150 ¤'),
        hint: tr('боевой дух армии выше на месяц'),
        can: (s) => s.gold >= 150,
        run: (s) => {
          s.gold -= 150;
          s.blessUntil = Math.max(s.blessUntil ?? 0, s.time + 30);
          return tr('Воины по очереди касаются ларца. Кто-то плачет, кто-то смеётся — но в строю будто прибавилось сил. Боевой дух армии выше на 30 дней.');
        },
      },
      { label: tr('Не верить'), run: () => tr('Монах пожимает плечами: «Бог вам судья» — и уходит своей дорогой.') },
    ],
  },
  {
    id: 'spices',
    title: tr('Сомнительная сделка'),
    text: () => tr('Купец с бегающими глазами предлагает мешок перца «прямо из Александрии» за треть цены. Мешок завязан, развязать не даёт: «Сырость испортит!»'),
    options: [
      {
        label: tr('Купить за 250 ¤'),
        hint: tr('рискнуть'),
        can: (s) => s.gold >= 250,
        run: (s) => {
          s.gold -= 250;
          const trade = partySkill(s, 'trade');
          if (Math.random() < 0.45 + trade * 0.1) {
            s.cargo.spices = (s.cargo.spices ?? 0) + 3;
            return tr('В мешке настоящий перец, пахнущий Индией. Три меры пряностей в обоз!');
          }
          return tr('В мешке — толчёные жёлуди с горстью перца сверху. Купца и след простыл.');
        },
      },
      {
        label: tr('Развязать мешок силой'),
        hint: tr('нужна «Торговля» 2 или спутник-купец'),
        can: (s) => partySkill(s, 'trade') >= 2,
        run: (s) => {
          s.gold += 40;
          return tr('Под перцем жёлуди. Купец бледнеет и откупается сорока монетами, лишь бы вы молчали. +40 ¤.');
        },
      },
      { label: tr('Отказаться'), run: () => tr('Купец обиженно уезжает искать глупца попроще.') },
    ],
  },
  {
    id: 'knight',
    title: tr('Раненый рыцарь'),
    text: () => tr('У дороги лежит рыцарь в помятой кольчуге, рядом пал конь. Он дышит тяжело, из-под шлема течёт кровь. Оруженосца не видно.'),
    options: [
      {
        label: tr('Перевязать раны'),
        hint: tr('лучше, если есть лекарь'),
        run: (s) => {
          const surg = partySkill(s, 'surgery');
          if (Math.random() < 0.35 + surg * 0.13) {
            const it = giveItem(s, 4);
            gainHeroXp(s, 30);
            return tr`Рыцарь приходит в себя. «Я не забуду этого», — говорит он и оставляет вам в благодарность ${it}.`;
          }
          return tr('Вы сделали что могли, но к вечеру рыцарь умер. Его похоронили у дороги под грубым крестом.');
        },
      },
      {
        label: tr('Обобрать'),
        hint: tr('трофей, позорно'),
        run: (s) => {
          const it = giveItem(s, 4);
          return tr`Вы сняли с умирающего всё ценное: ${it}. Воины прячут глаза.` + deedLine(s, 'cruelty');
        },
      },
      { label: tr('Проехать мимо'), run: () => tr('Отряд отводит взгляд и проезжает мимо.') },
    ],
  },
  {
    id: 'serf',
    title: tr('Беглый крепостной'),
    text: () => tr('Запыхавшийся парень хватает стремя героя: «Спаси, господин! Бежал от барина, за мной псари с собаками». Вдали слышен лай.'),
    options: [
      {
        label: tr('Спрятать и взять в отряд'),
        run: (s) => {
          addTroops(s, `${s.hero.faction}_i1`, 1);
          return tr('Парня прячут в обозе под мешками. Псари проносятся мимо. Теперь у вас на одного крестьянина больше — и он будет драться за вас насмерть.');
        },
      },
      {
        label: tr('Выдать псарям'),
        hint: tr('+30 ¤ награды'),
        run: (s) => {
          s.gold += 30;
          return tr('Псари благодарят и платят тридцать монет. Парня уводят на верёвке. +30 ¤.') + deedLine(s, 'cruelty');
        },
      },
    ],
  },
  {
    id: 'jugglers',
    title: tr('Бродячие жонглёры'),
    text: () => tr('У костра на перекрёстке — жонглёры, волынщик и девушка с бубном. Предлагают устроить представление для ваших людей.'),
    options: [
      {
        label: tr('Заплатить 25 ¤'),
        can: (s) => s.gold >= 25,
        run: (s) => {
          s.gold -= 25;
          for (const { cs } of inParty(s)) cs.loyalty = Math.min(100, cs.loyalty + 6);
          return tr('Вечер песен, плясок и огненных шаров. Даже самые угрюмые смеются. Спутники довольны.');
        },
      },
      { label: tr('Прогнать'), run: () => tr('Жонглёры собирают пожитки и уходят, ворча.') },
    ],
  },
  {
    id: 'miller',
    title: tr('Ночлег у мельника'),
    text: () => tr('Мельник у реки предлагает переночевать в сухом амбаре, накормить людей горячей кашей и промыть раны.'),
    when: (s) => inParty(s).some(({ cs }) => isWounded(s, cs)) || s.party.troops.length > 0,
    options: [
      {
        label: tr('Остаться на ночь (20 ¤)'),
        hint: tr('полдня, раны спутников заживут'),
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
          return healed ? tr`Отряд отдохнул. Раненые спутники снова в строю (${healed}).` : tr('Отряд выспался в тепле. Утром люди идут бодрее.');
        },
      },
      { label: tr('Идти дальше'), run: () => tr('Мельник пожимает плечами и возвращается к жерновам.') },
    ],
  },
  {
    id: 'wolves',
    title: tr('Волки'),
    text: () => tr('Ночью лагерь окружила волчья стая. Лошади бьются на привязи, часовые жмутся к кострам.'),
    options: [
      {
        label: tr('Отогнать огнём'),
        run: (s) => {
          if (partySkill(s, 'pathfinding') >= 2 || Math.random() < 0.5) return tr('Факелы и крики сделали своё дело: стая ушла в темноту. Потерь нет.');
          const g = s.cargo.grain ?? 0;
          if (g > 0) s.cargo.grain = g - 1;
          else delete s.cargo.grain;
          return tr('Волки ушли, но успели разорвать мешки в обозе. Пропала мера зерна.');
        },
      },
      {
        label: tr('Устроить охоту'),
        hint: tr('шкуры, но кто-то может пострадать'),
        run: (s) => {
          if (Math.random() < 0.7) {
            s.cargo.furs = (s.cargo.furs ?? 0) + 1;
            return tr('К утру у костра лежат три волчьи шкуры. +1 мера мехов.');
          }
          const n = loseTroops(s, 1);
          return tr`Охота удалась, но один воин (${n}) не вернулся — его нашли в овраге. +1 мера мехов.`;
        },
      },
    ],
  },
  {
    id: 'plague_cart',
    title: tr('Чумной обоз'),
    when: (s) => !!s.plague?.started,
    text: () => tr('Посреди дороги брошенная телега. Возница мёртв, на теле чёрные бубоны. В телеге сундук, окованный железом.'),
    options: [
      {
        label: tr('Сжечь обоз'),
        run: () => tr('Телегу обкладывают хворостом и поджигают. Ветер уносит дым в сторону. Никто не заболел.'),
      },
      {
        label: tr('Забрать сундук'),
        hint: tr('золото, но мор…'),
        run: (s) => {
          const g = rnd(140, 260);
          s.gold += g;
          if (Math.random() < 0.4) {
            const n = loseTroops(s, rnd(2, 4));
            return tr`В сундуке ${g} ¤. Через три дня у ${n} воинов жар и опухоли под мышками. Их пришлось оставить в ближайшей деревне.` + deedLine(s, 'caravan');
          }
          return tr`В сундуке ${g} ¤. Воины крестятся, но никто не заболел. Пока.` + deedLine(s, 'caravan');
        },
      },
    ],
  },
  {
    id: 'wreck',
    title: tr('Разбитый караван'),
    text: () => tr('Обломки телег, мёртвые мулы, вспоротые тюки. Разбойники ушли недавно — следы свежие.'),
    options: [
      {
        label: tr('Собрать уцелевшее'),
        run: (s) => {
          const goods = ['cloth', 'wine', 'salt', 'wool', 'iron'] as const;
          const g = goods[rnd(0, goods.length - 1)];
          s.cargo[g] = (s.cargo[g] ?? 0) + rnd(1, 3);
          return tr('Среди обломков нашлось кое-что целое. Товары погружены в обоз.');
        },
      },
      {
        label: tr('Пойти по следам'),
        hint: tr('шайка где-то рядом'),
        run: (s) => {
          ambush(s, 'bandits');
          return tr('Следы ведут в овраг… и оттуда с рёвом выскакивают разбойники! К бою!');
        },
      },
    ],
  },
  {
    id: 'veteran',
    title: tr('Старый солдат'),
    text: () => tr('Одноногий ветеран сидит у колодца. «Служил ещё при старом короле. Дайте на хлеб — научу ваших сопляков держать строй».'),
    when: (s) => partySize(s) >= 5,
    options: [
      {
        label: tr('Заплатить 80 ¤'),
        hint: tr('опыт всему отряду'),
        can: (s) => s.gold >= 80,
        run: (s) => {
          s.gold -= 80;
          for (const t of s.party.troops) if (TROOPS[t.id]?.upgradesTo.length) t.xp += 12 * t.count;
          return tr('Целый день ветеран гоняет воинов: «Щиты выше! Шаг! Ещё шаг!» Отряд набрался опыта.');
        },
      },
      { label: tr('Дать медяк и уйти'), run: () => tr('Ветеран благодарит и желает вам не терять ног.') },
    ],
  },
  {
    id: 'toll',
    title: tr('Мытарь у моста'),
    text: () => tr('На мосту — застава: мытарь местного барона требует пошлину за проход отряда: 60 монет.'),
    options: [
      {
        label: tr('Заплатить 60 ¤'),
        can: (s) => s.gold >= 60,
        run: (s) => {
          s.gold -= 60;
          return tr('Мытарь пересчитывает монеты, кусает одну и поднимает шлагбаум.');
        },
      },
      {
        label: tr('Пройти силой'),
        hint: tr('стража из дезертиров'),
        run: (s) => {
          ambush(s, 'deserters');
          return tr('Мытарь свистит, и из сторожки высыпает стража — наёмники без роду и племени. К бою!');
        },
      },
      {
        label: tr('Искать брод'),
        hint: tr('полдня пути'),
        run: (s) => {
          s.time += 0.5;
          return tr('Брод нашёлся ниже по течению. Вымокли, но сберегли деньги.');
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

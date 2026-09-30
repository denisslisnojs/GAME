import { FACTIONS } from '../data/factions';
import { canPropose, claimCrown, courtship, crownCheck, GIFT_COST, ladyOf, VISITS_NEEDED, visitLady, WEDDING_COST, wed } from '../game/crown';
import { atWar, partyRoom } from '../game/logic';
import { BUILDINGS, TAX_INFO, fiefIncomeOf, fiefState, startBuilding, type Tax } from '../game/fief';
import { ELDER_TALK, lordBio, REALM_LORE, WORLD_LORE } from '../data/lore';
import { portraitURL } from '../gfx/icons';
import { TROOPS } from '../data/troops';
import {
  abandonQuest,
  acceptQuest,
  addRelation,
  canTurnIn,
  declineQuest,
  fiefCandidate,
  fiefIncome,
  grantFief,
  hostOf,
  offerQuest,
  questProgress,
  questsOf,
  relation,
  relationWord,
  turnIn,
  type Host,
} from '../game/quests';
import { tourneyReady } from '../game/tournament';
import { world, type Settlement } from '../game/world';
import { btn, h, img, openModal, panel, sfxCoins, toast } from './dom';
import { isLooted } from '../game/war';
import type { GameCtx } from './panels';
import { lc, tr } from '../i18n';

const TASK_WORD = { idle: tr('объезжает свои земли'), campaign: tr('в походе'), relieve: tr('спешит на помощь осаждённым'), follow: tr('идёт в походе с вами') } as const;

function portraitOf(h0: Host, s: Settlement): string {
  if (h0.rank === 0) return portraitURL(`${s.culture}_i1`);
  if (!h0.lord) return portraitURL(`${h0.faction}_i4m`);
  return portraitURL(`${h0.faction}_c4m`);
}

function direction(dx: number, dy: number): string {
  const a = (Math.atan2(-dy, dx) * 180) / Math.PI;
  const dirs = [tr('к востоку'), tr('к северо-востоку'), tr('к северу'), tr('к северо-западу'), tr('к западу'), tr('к юго-западу'), tr('к югу'), tr('к юго-востоку')];
  return dirs[Math.round(((a + 360) % 360) / 45) % 8];
}

export function rumor(ctx: GameCtx, s: Settlement): string {
  const { state } = ctx;
  const bands = (state.parties ?? []).filter((p) => p.kind !== 'patrol');
  let near = bands[0];
  let bd = Infinity;
  for (const p of bands) {
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    if (d < bd) {
      bd = d;
      near = p;
    }
  }
  const lines: string[] = [];
  if (near && bd < 16 * 30) lines.push(tr`Пастухи видели отряд «${near.name}» ${direction(near.x - s.x, near.y - s.y)} отсюда.`);
  const towns = world.settlements.filter((t) => t.type === 'town' && tourneyReady(state, t) === 0);
  const tn = towns.sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
  if (tn) lines.push(tr`Говорят, в городе ${tn.name} скоро турнир — герольды зовут всех, кто держит копьё.`);
  const n = state.war?.news.find((x) => x.kind === 'capture' || x.kind === 'war');
  if (n) lines.push(tr`Купцы принесли весть: ${lc(n.text.charAt(0))}${n.text.slice(1)}`);
  return lines.join(' ');
}

export function openHost(ctx: GameCtx, s: Settlement) {
  const { state } = ctx;
  let close = () => {};
  const host = hostOf(state, s);
  const f = FACTIONS[host.faction];
  const speech = h('div', { class: 'parch', style: 'font-size:14px;line-height:1.4;min-height:70px' });
  const options = h('div', { class: 'options' });
  const relBox = h('div', { class: 'col', style: 'gap:2px;font-size:13px' });

  const say = (...parts: (string | HTMLElement)[]) => speech.replaceChildren(...parts);

  const renderRel = () => {
    const v = relation(state, host.key);
    relBox.replaceChildren(
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { class: 'muted' }, tr('Отношение')), h('b', { style: `color:${v > 9 ? '#7ad06a' : v < -9 ? '#e07a6a' : 'inherit'}` }, `${v > 0 ? '+' : ''}${v} · ${relationWord(v)}`)),
      h('div', { class: 'power', style: 'height:6px' }, h('div', { style: `width:${(v + 100) / 2}%;background:${v >= 0 ? '#5aa04a' : '#c24040'}` }), h('div', { style: `width:${100 - (v + 100) / 2}%;background:#2a2622` })),
    );
  };

  const opt = (label: string, hint: string, fn: () => void, cls = '', disabled = false) => {
    const frag = document.createDocumentFragment();
    frag.append(h('span', {}, label), h('span', { class: 'hint' }, hint));
    return btn(frag, fn, cls, disabled);
  };

  const render = () => {
    renderRel();
    options.replaceChildren();
    // Текущие поручения этого хозяина
    for (const q of questsOf(state, host.key)) {
      const ready = canTurnIn(state, q);
      options.append(
        opt(ready ? tr`Сдать: ${q.title}` : tr`Поручение: ${q.title}`, questProgress(state, q), () => {
          if (canTurnIn(state, q)) {
            const r = turnIn(state, q);
            sfxCoins();
            ctx.commit();
            say(tr`«Вы сдержали слово. Вот ваша награда.» `, h('b', { class: 'gold' }, `+${r.gold} ¤`), tr` · отношение +${r.relation} · опыт +${r.xp}`, r.levelUp ? h('b', { class: 'gold' }, tr` · новый уровень!`) : '');
            render();
          } else {
            say(`«${q.text}» `, h('span', { class: 'muted' }, tr`Осталось дней: ${Math.max(0, Math.ceil(q.deadline - state.time))}.`), ' ', btn(tr('Отказаться от поручения'), () => {
              abandonQuest(state, q);
              ctx.commit();
              say(tr('«Жаль. Я думал, на вас можно положиться.»'));
              render();
            }, 'small danger'));
          }
        }, ready ? 'primary' : ''),
      );
    }
    const offer = offerQuest(state, s, host);
    if (offer)
      options.append(
        opt(tr('Есть ли для меня дело?'), '', () => {
          say(
            `«${offer.text}» `,
            h('div', { class: 'gold', style: 'margin-top:4px' }, tr`Награда: ${offer.reward} ¤ · отношение +${offer.relation}`),
            h(
              'div',
              { class: 'row', style: 'gap:6px;margin-top:6px' },
              btn(tr('Взяться'), () => {
                acceptQuest(state, offer);
                ctx.commit();
                say(tr('«Отлично. Возвращайтесь, когда дело будет сделано.»'));
                toast(tr`Новое поручение: ${offer.title}`);
                render();
              }, 'primary small'),
              btn(tr('Отказаться'), () => {
                declineQuest(state, host);
                say(tr('«Что ж, найду другого.»'));
                render();
              }, 'small'),
            ),
          );
        }),
      );
    else if (host.faction !== state.hero.faction && s.type !== 'village') options.append(opt(tr('Есть ли для меня дело?'), tr('только своей державе'), () => {}, '', true));
    const lordInfo = host.lord?.lord;
    if (host.lord && lordInfo && host.faction === state.hero.faction && lordInfo.rank < 3 && host.present && lordInfo.status === 'active') {
      const rel = relation(state, host.key);
      const following = lordInfo.task === 'follow';
      options.append(
        opt(following ? tr('Вы уже идёте со мной') : tr('Присоединитесь ко мне в походе'), following ? tr`ещё ${Math.ceil((lordInfo.followUntil ?? 0) - state.time)} дн.` : rel >= 10 ? tr('на 7 дней') : tr`нужно отношение 10 (сейчас ${rel})`, () => {
          if (rel < 10) {
            say(tr('«Я не знаю вас настолько, чтобы водить за вами своих людей. Послужите державе — тогда поговорим.»'));
            return;
          }
          lordInfo.task = 'follow';
          lordInfo.followUntil = state.time + 7;
          lordInfo.target = undefined;
          addRelation(state, host.key, -2);
          ctx.commit();
          say(tr('«Что ж, веди. Мои люди пойдут за твоим знаменем неделю — а там посмотрим.»'));
          render();
        }, '', following),
      );
    }
    // Сватовство к дочери лорда
    const lady = host.lord && host.present ? ladyOf(host.lord) : null;
    if (lady && host.lord && !state.spouse && !atWar(state, host.faction, state.hero.faction)) {
      const c = courtship(state, host.lord);
      options.append(
        opt(tr`Навестить ${lady}`, tr`дочь лорда · подарок ${GIFT_COST} ¤${c ? tr` · визитов ${Math.min(c.visits, VISITS_NEEDED)}/${VISITS_NEEDED}` : ''}`, () => {
          say(visitLady(state, host.lord!));
          ctx.commit();
          render();
        }),
      );
      if (c && c.visits >= VISITS_NEEDED)
        options.append(
          opt(tr`Просить руки ${lady}`, tr`свадебный пир ${WEDDING_COST} ¤`, () => {
            const chk = canPropose(state, host.lord!);
            if (!chk.ok) {
              say(`«${chk.reason}»`);
              return;
            }
            say(wed(state, host.lord!));
            sfxCoins();
            ctx.commit();
            render();
          }, 'primary'),
        );
    }
    if (host.lord)
      options.append(
        opt(tr('Расскажите о себе'), '', () => {
          const home = world.byId.get(host.lord!.lord!.home)?.name ?? s.name;
          say(lordBio(host.lord!.lord!.title, host.lord!.lord!.name, home, host.rank, host.lord!.id));
        }),
      );
    if (host.rank === 3) {
      options.append(
        opt(tr('Расскажите о державе'), '', () => say(...REALM_LORE[host.faction].map((p) => h('p', { style: 'margin:0 0 6px' }, p)))),
        opt(tr('Что творится в мире?'), '', () => {
          const items = (state.war?.news ?? []).slice(0, 3).map((n) => h('li', {}, n.text));
          say(h('p', { style: 'margin:0 0 6px' }, WORLD_LORE), items.length ? h('ul', { style: 'margin:0;padding-left:18px' }, ...items) : '');
        }),
      );
      if (host.faction === state.hero.faction && !state.crown) {
        const cc = crownCheck(state);
        options.append(
          opt(tr('Потребовать корону'), tr`поддержка лордов: ${cc.support} из ${cc.total}`, () => {
            const chk = crownCheck(state);
            if (!chk.ok) {
              say(tr`Вы заводите речь о короне. ${host.name} смеётся: «${chk.reason}»`);
              return;
            }
            claimCrown(state);
            ctx.commit();
            say(tr`Лорды державы один за другим преклоняют колено перед вами. ${host.name} медленно снимает корону и протягивает её вам: «Держава твоя. Не урони её.» Теперь вы сами объявляете войны и заключаете мир (окно «Державы») и можете брать крепости в свой домен.`);
            toast(tr('Вы коронованы!'), 4000);
            render();
          }, cc.ok ? 'primary' : ''),
        );
      }
      if (host.faction === state.hero.faction && !state.crown)
        options.append(
          opt(tr('Просить удел'), state.fiefs?.length ? tr`ваши владения: ${state.fiefs.map((id) => world.byId.get(id)?.name).join(', ')}` : tr('владение и доход'), () => {
            const c = fiefCandidate(state);
            if (!c.s) {
              say(`«${c.reason}»`);
              return;
            }
            grantFief(state, c.s);
            ctx.commit();
            say(tr`«За верную службу жалую вам ${c.s.type === 'town' ? tr('город') : tr('замок')} ${c.s.name} с деревнями. Доход — ${fiefIncome(state)} ¤ в неделю со всех ваших владений. Берегите его от врагов!»`);
            render();
          }),
        );
    }
    if (s.type === 'village') {
      options.append(
        opt(tr('Как живёте?'), '', () => say(`«${ELDER_TALK[Math.floor(Math.random() * ELDER_TALK.length)]}»`)),
        opt(tr('Какие слухи?'), '', () => say(`«${rumor(ctx, s) || tr('Тихо у нас. Даже волки не воют.')}»`)),
      );
    }
    options.append(opt(tr('Уйти'), '', () => close(), 'primary'));
  };

  // Приветствие
  const rel = relation(state, host.key);
  const greet =
    s.type === 'village'
      ? tr`${host.name} снимает шапку: «Добро пожаловать, господин. Чем богаты…»`
      : host.lord && !host.present
        ? tr`${host.name} сейчас нет в ${s.name} — ${host.lord.lord!.status === 'defeated' ? tr('он собирает новое войско после поражения') : TASK_WORD[host.lord.lord!.task]}. Вас принимает управляющий.`
        : host.faction === state.hero.faction
          ? rel >= 30
            ? tr`«А, ${state.hero.name}! Рад видеть верного соратника.»`
            : tr`«${state.hero.name}? Слышал о вас. Чем служите державе?»`
          : tr`«Вы служите ${FACTIONS[state.hero.faction].short}. Пока между нами мир — говорите.»`;
  say(greet);
  render();

  const title = s.type === 'village' ? host.name : host.name;
  const sub = s.type === 'village' ? tr`Деревня ${s.name}` : `${host.rank === 3 ? tr('Правитель') : host.lord ? tr('Лорд') : tr('Управитель')} · ${f.name}`;
  const content = panel(
    'modal wide',
    h('div', { class: 'head' }, h('div', {}, h('h2', { class: 'title' }, title), h('div', { class: 'muted', style: 'font-size:13px' }, sub)), btn('✕', () => close(), 'small close')),
    h(
      'div',
      { class: 'body settle-layout' },
      h('div', { class: 'col', style: 'gap:8px' }, h('div', { class: 'row', style: 'gap:10px' }, img(portraitOf(host, s), 'px', 'width:72px;height:72px'), relBox), speech),
      options,
    ),
  );
  close = openModal(content);
}

// ───────────────────────── удел ─────────────────────────

/** Управление уделом: доход и обмен воинами с гарнизоном. */
export function openFief(ctx: GameCtx, s: Settlement) {
  const { state } = ctx;
  let close = () => {};
  const body = h('div', { class: 'body col' });
  const render = () => {
    const gar = (state.war!.garrisons[s.id] ??= []);
    const mine = h('div', { class: 'army-list' });
    const theirs = h('div', { class: 'army-list' });
    const move = (from: { id: string; count: number }[], to: { id: string; count: number; xp?: number }[], id: string, n: number) => {
      const a = from.find((t) => t.id === id);
      if (!a) return;
      const k = Math.min(n, a.count, to === state.party.troops ? partyRoom(state) : Infinity);
      if (k <= 0) return void toast(tr('Отряд полон. Предел растёт с уровнем героя, Лидерством и спутниками-командирами.'));
      a.count -= k;
      const b = to.find((t) => t.id === id);
      if (b) b.count += k;
      else to.push(to === state.party.troops ? { id, count: k, xp: 0 } : { id, count: k });
      for (const list of [from, to]) for (let i = list.length - 1; i >= 0; i--) if (list[i].count <= 0) list.splice(i, 1);
      ctx.commit();
      render();
    };
    for (const t of [...state.party.troops].sort((a, b) => TROOPS[b.id].tier - TROOPS[a.id].tier))
      mine.append(h('div', { class: 'row' }, img(portraitURL(t.id), 'px', 'width:32px;height:32px'), h('span', { class: 'grow' }, `${TROOPS[t.id].name} ×${t.count}`), btn('→1', () => move(state.party.troops, gar, t.id, 1), 'small'), btn(tr('→все'), () => move(state.party.troops, gar, t.id, t.count), 'small')));
    for (const t of [...gar].sort((a, b) => TROOPS[b.id].tier - TROOPS[a.id].tier))
      theirs.append(h('div', { class: 'row' }, btn('1←', () => move(gar, state.party.troops, t.id, 1), 'small'), btn(tr('все←'), () => move(gar, state.party.troops, t.id, t.count), 'small'), img(portraitURL(t.id), 'px', 'width:32px;height:32px'), h('span', { class: 'grow' }, `${TROOPS[t.id].name} ×${t.count}`)));
    if (!state.party.troops.length) mine.append(h('div', { class: 'muted' }, tr('Отряд пуст')));
    if (!gar.length) theirs.append(h('div', { class: 'muted' }, tr('Гарнизона нет — крепость беззащитна!')));
    const count = (l: { count: number }[]) => l.reduce((n, t) => n + t.count, 0);
    const fs = fiefState(state, s.id);
    const builds = h('div', { class: 'list' });
    for (const b of BUILDINGS) {
      const done = fs.built.includes(b.id);
      const now = fs.building?.id === b.id;
      builds.append(
        h(
          'div',
          { class: 'item' },
          h('div', { class: 'grow col', style: 'gap:1px' }, h('span', { class: 'name', style: done ? 'color:#7ad06a' : '' }, `${done ? '✔ ' : ''}${b.name}`), h('div', { class: 'sub' }, b.desc)),
          done
            ? h('span', { class: 'muted small' }, tr('построено'))
            : now
              ? h('span', { class: 'gold small' }, tr`строится, ещё ${Math.max(1, Math.ceil(fs.building!.done - state.time))} дн.`)
              : btn(tr`${b.cost} ¤ · ${b.days} дн.`, () => { if (startBuilding(state, s.id, b.id)) { sfxCoins(); toast(tr`Начато строительство: ${b.name}`); ctx.commit(); } else toast(fs.building ? tr('Сначала закончите начатую стройку') : tr('Не хватает денег')); render(); }, 'small', !!fs.building || state.gold < b.cost),
        ),
      );
    }
    const taxRow = h(
      'div',
      { class: 'row', style: 'gap:4px;flex-wrap:wrap;align-items:center' },
      h('span', { class: 'muted' }, tr('Налоги:')),
      ...(Object.keys(TAX_INFO) as Tax[]).map((t) => btn(TAX_INFO[t].name, () => { fs.tax = t; ctx.commit(); render(); }, `small${fs.tax === t ? ' primary' : ''}`)),
      h('span', { class: 'muted small' }, TAX_INFO[fs.tax].hint),
    );
    body.replaceChildren(
      h('div', { class: 'parch', style: 'font-size:13.5px' }, tr`${s.name} приносит ${fiefIncomeOf(state, s.id, (v) => isLooted(state, v))} ¤ в неделю, все ваши владения — ${fiefIncome(state)} ¤. Сильный гарнизон отобьёт штурм, а если враг осадит крепость — спешите на выручку и защищайте стены сами.`),
      taxRow,
      h('div', { class: 'col-title' }, tr('Постройки')),
      builds,
      h(
        'div',
        { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px' },
        h('div', { class: 'col' }, h('div', { class: 'col-title' }, tr`Ваш отряд · ${count(state.party.troops)}`), mine),
        h('div', { class: 'col' }, h('div', { class: 'col-title' }, tr`Гарнизон · ${count(gar)}`), theirs),
      ),
    );
  };
  render();
  const content = panel('modal wide', h('div', { class: 'head' }, h('div', {}, h('h2', { class: 'title' }, tr`Удел: ${s.name}`), h('div', { class: 'muted', style: 'font-size:13px' }, s.type === 'town' ? tr('Город') : tr('Замок'))), btn('✕', () => close(), 'small close')), body);
  close = openModal(content);
}

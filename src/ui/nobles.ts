import { FACTIONS } from '../data/factions';
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
import type { GameCtx } from './panels';

const TASK_WORD = { idle: 'объезжает свои земли', campaign: 'в походе', relieve: 'спешит на помощь осаждённым', follow: 'идёт в походе с вами' } as const;

function portraitOf(h0: Host, s: Settlement): string {
  if (h0.rank === 0) return portraitURL(`${s.culture}_i1`);
  if (!h0.lord) return portraitURL(`${h0.faction}_i4m`);
  return portraitURL(`${h0.faction}_c4m`);
}

function direction(dx: number, dy: number): string {
  const a = (Math.atan2(-dy, dx) * 180) / Math.PI;
  const dirs = ['к востоку', 'к северо-востоку', 'к северу', 'к северо-западу', 'к западу', 'к юго-западу', 'к югу', 'к юго-востоку'];
  return dirs[Math.round(((a + 360) % 360) / 45) % 8];
}

function rumor(ctx: GameCtx, s: Settlement): string {
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
  if (near && bd < 16 * 30) lines.push(`Пастухи видели отряд «${near.name}» ${direction(near.x - s.x, near.y - s.y)} отсюда.`);
  const towns = world.settlements.filter((t) => t.type === 'town' && tourneyReady(state, t) === 0);
  const tn = towns.sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
  if (tn) lines.push(`Говорят, в ${tn.name} скоро турнир — герольды зовут всех, кто держит копьё.`);
  const n = state.war?.news.find((x) => x.kind === 'capture' || x.kind === 'war');
  if (n) lines.push(`Купцы принесли весть: ${n.text.charAt(0).toLowerCase()}${n.text.slice(1)}`);
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
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { class: 'muted' }, 'Отношение'), h('b', { style: `color:${v > 9 ? '#7ad06a' : v < -9 ? '#e07a6a' : 'inherit'}` }, `${v > 0 ? '+' : ''}${v} · ${relationWord(v)}`)),
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
        opt(ready ? `Сдать: ${q.title}` : `Поручение: ${q.title}`, questProgress(state, q), () => {
          if (canTurnIn(state, q)) {
            const r = turnIn(state, q);
            sfxCoins();
            ctx.commit();
            say(`«Вы сдержали слово. Вот ваша награда.» `, h('b', { class: 'gold' }, `+${r.gold} ¤`), ` · отношение +${r.relation} · опыт +${r.xp}`, r.levelUp ? h('b', { class: 'gold' }, ` · новый уровень!`) : '');
            render();
          } else {
            say(`«${q.text}» `, h('span', { class: 'muted' }, `Осталось дней: ${Math.max(0, Math.ceil(q.deadline - state.time))}.`), ' ', btn('Отказаться от поручения', () => {
              abandonQuest(state, q);
              ctx.commit();
              say('«Жаль. Я думал, на вас можно положиться.»');
              render();
            }, 'small danger'));
          }
        }, ready ? 'primary' : ''),
      );
    }
    const offer = offerQuest(state, s, host);
    if (offer)
      options.append(
        opt('Есть ли для меня дело?', '', () => {
          say(
            `«${offer.text}» `,
            h('div', { class: 'gold', style: 'margin-top:4px' }, `Награда: ${offer.reward} ¤ · отношение +${offer.relation}`),
            h(
              'div',
              { class: 'row', style: 'gap:6px;margin-top:6px' },
              btn('Взяться', () => {
                acceptQuest(state, offer);
                ctx.commit();
                say('«Отлично. Возвращайтесь, когда дело будет сделано.»');
                toast(`Новое поручение: ${offer.title}`);
                render();
              }, 'primary small'),
              btn('Отказаться', () => {
                declineQuest(state, host);
                say('«Что ж, найду другого.»');
                render();
              }, 'small'),
            ),
          );
        }),
      );
    else if (host.faction !== state.hero.faction && s.type !== 'village') options.append(opt('Есть ли для меня дело?', 'только своей державе', () => {}, '', true));
    const lordInfo = host.lord?.lord;
    if (host.lord && lordInfo && host.faction === state.hero.faction && lordInfo.rank < 3 && host.present && lordInfo.status === 'active') {
      const rel = relation(state, host.key);
      const following = lordInfo.task === 'follow';
      options.append(
        opt(following ? 'Вы уже идёте со мной' : 'Присоединитесь ко мне в походе', following ? `ещё ${Math.ceil((lordInfo.followUntil ?? 0) - state.time)} дн.` : rel >= 10 ? 'на 7 дней' : `нужно отношение 10 (сейчас ${rel})`, () => {
          if (rel < 10) {
            say('«Я не знаю вас настолько, чтобы водить за вами своих людей. Послужите державе — тогда поговорим.»');
            return;
          }
          lordInfo.task = 'follow';
          lordInfo.followUntil = state.time + 7;
          lordInfo.target = undefined;
          addRelation(state, host.key, -2);
          ctx.commit();
          say('«Что ж, веди. Мои люди пойдут за твоим знаменем неделю — а там посмотрим.»');
          render();
        }, '', following),
      );
    }
    if (host.lord)
      options.append(
        opt('Расскажите о себе', '', () => {
          const home = world.byId.get(host.lord!.lord!.home)?.name ?? s.name;
          say(lordBio(host.lord!.lord!.title, host.lord!.lord!.name, home, host.rank, host.lord!.id));
        }),
      );
    if (host.rank === 3) {
      options.append(
        opt('Расскажите о державе', '', () => say(...REALM_LORE[host.faction].map((p) => h('p', { style: 'margin:0 0 6px' }, p)))),
        opt('Что творится в мире?', '', () => {
          const items = (state.war?.news ?? []).slice(0, 3).map((n) => h('li', {}, n.text));
          say(h('p', { style: 'margin:0 0 6px' }, WORLD_LORE), items.length ? h('ul', { style: 'margin:0;padding-left:18px' }, ...items) : '');
        }),
      );
      if (host.faction === state.hero.faction)
        options.append(
          opt('Просить удел', state.fiefs?.length ? `ваши владения: ${state.fiefs.map((id) => world.byId.get(id)?.name).join(', ')}` : 'владение и доход', () => {
            const c = fiefCandidate(state);
            if (!c.s) {
              say(`«${c.reason}»`);
              return;
            }
            grantFief(state, c.s);
            ctx.commit();
            say(`«За верную службу жалую вам ${c.s.type === 'town' ? 'город' : 'замок'} ${c.s.name} с деревнями. Доход — ${fiefIncome(state)} ¤ в неделю со всех ваших владений. Берегите его от врагов!»`);
            render();
          }),
        );
    }
    if (s.type === 'village') {
      options.append(
        opt('Как живёте?', '', () => say(`«${ELDER_TALK[Math.floor(Math.random() * ELDER_TALK.length)]}»`)),
        opt('Какие слухи?', '', () => say(`«${rumor(ctx, s) || 'Тихо у нас. Даже волки не воют.'}»`)),
      );
    }
    options.append(opt('Уйти', '', () => close(), 'primary'));
  };

  // Приветствие
  const rel = relation(state, host.key);
  const greet =
    s.type === 'village'
      ? `${host.name} снимает шапку: «Добро пожаловать, господин. Чем богаты…»`
      : host.lord && !host.present
        ? `${host.name} сейчас нет в ${s.name} — ${host.lord.lord!.status === 'defeated' ? 'он собирает новое войско после поражения' : TASK_WORD[host.lord.lord!.task]}. Вас принимает управляющий.`
        : host.faction === state.hero.faction
          ? rel >= 30
            ? `«А, ${state.hero.name}! Рад видеть верного соратника.»`
            : `«${state.hero.name}? Слышал о вас. Чем служите державе?»`
          : `«Вы служите ${FACTIONS[state.hero.faction].short}. Пока между нами мир — говорите.»`;
  say(greet);
  render();

  const title = s.type === 'village' ? host.name : host.name;
  const sub = s.type === 'village' ? `Деревня ${s.name}` : `${host.rank === 3 ? 'Правитель' : host.lord ? 'Лорд' : 'Управитель'} · ${f.name}`;
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
      const k = Math.min(n, a.count);
      a.count -= k;
      const b = to.find((t) => t.id === id);
      if (b) b.count += k;
      else to.push(to === state.party.troops ? { id, count: k, xp: 0 } : { id, count: k });
      for (const list of [from, to]) for (let i = list.length - 1; i >= 0; i--) if (list[i].count <= 0) list.splice(i, 1);
      ctx.commit();
      render();
    };
    for (const t of [...state.party.troops].sort((a, b) => TROOPS[b.id].tier - TROOPS[a.id].tier))
      mine.append(h('div', { class: 'row' }, img(portraitURL(t.id)), h('span', { class: 'grow' }, `${TROOPS[t.id].name} ×${t.count}`), btn('→1', () => move(state.party.troops, gar, t.id, 1), 'small'), btn('→все', () => move(state.party.troops, gar, t.id, t.count), 'small')));
    for (const t of [...gar].sort((a, b) => TROOPS[b.id].tier - TROOPS[a.id].tier))
      theirs.append(h('div', { class: 'row' }, btn('1←', () => move(gar, state.party.troops, t.id, 1), 'small'), btn('все←', () => move(gar, state.party.troops, t.id, t.count), 'small'), img(portraitURL(t.id)), h('span', { class: 'grow' }, `${TROOPS[t.id].name} ×${t.count}`)));
    if (!state.party.troops.length) mine.append(h('div', { class: 'muted' }, 'Отряд пуст'));
    if (!gar.length) theirs.append(h('div', { class: 'muted' }, 'Гарнизона нет — крепость беззащитна!'));
    const count = (l: { count: number }[]) => l.reduce((n, t) => n + t.count, 0);
    body.replaceChildren(
      h('div', { class: 'parch', style: 'font-size:13.5px' }, `Ваш удел приносит ${fiefIncome(state)} ¤ в неделю (со всех владений). Сильный гарнизон отобьёт вражеский штурм; потерянный удел не вернётся сам.`),
      h(
        'div',
        { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px' },
        h('div', { class: 'col' }, h('div', { class: 'col-title' }, `Ваш отряд · ${count(state.party.troops)}`), mine),
        h('div', { class: 'col' }, h('div', { class: 'col-title' }, `Гарнизон · ${count(gar)}`), theirs),
      ),
    );
  };
  render();
  const content = panel('modal wide', h('div', { class: 'head' }, h('div', {}, h('h2', { class: 'title' }, `Удел: ${s.name}`), h('div', { class: 'muted', style: 'font-size:13px' }, s.type === 'town' ? 'Город' : 'Замок')), btn('✕', () => close(), 'small close')), body);
  close = openModal(content);
}

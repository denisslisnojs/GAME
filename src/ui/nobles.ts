import { FACTIONS } from '../data/factions';
import { ELDER_TALK, lordBio, REALM_LORE, WORLD_LORE } from '../data/lore';
import { portraitURL } from '../gfx/icons';
import {
  abandonQuest,
  acceptQuest,
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

const TASK_WORD = { idle: 'объезжает свои земли', campaign: 'в походе', relieve: 'спешит на помощь осаждённым' } as const;

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

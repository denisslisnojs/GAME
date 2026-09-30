// Скриншоты для Google Play с подписями: кадр из игры в рамке и крупная фраза сверху.
// Берёт store/screenshots/raw/<lang>/*.jpg (см. dev/store-shots.cjs); шрифты игры встраиваются из node_modules.
// Запуск: node dev/store-captions.cjs [ru|en|pt|tr ...]  → store/screenshots/captioned/<lang>/NN-name.jpg
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..', 'store', 'screenshots');
const LANGS = process.argv.slice(2).length ? process.argv.slice(2) : ['ru', 'en', 'pt', 'tr'];

// Порядок в магазине: первые три кадра видны без прокрутки — самые сильные вперёд.
const SHOTS = [
  ['01-battle', {
    ru: ['Веди войско в бой', 'Строи, приказы, таранный удар конницы — победа в твоих руках'],
    en: ['Lead your army into battle', 'Formations, orders, cavalry charges — victory is in your hands'],
    pt: ['Lidere seu exército na batalha', 'Formações, ordens, cargas de cavalaria — a vitória é sua'],
    tr: ['Ordunu savaşa sür', 'Düzenler, emirler, süvari hücumları — zafer senin elinde'],
  }],
  ['02-map', {
    ru: ['Покори Евразию 1347 года', '4 державы, 135 городов, замков и деревень, живой мир лордов'],
    en: ['Conquer Eurasia in 1347', '4 kingdoms, 135 towns, castles and villages, a living world of lords'],
    pt: ['Conquiste a Eurásia de 1347', '4 reinos, 135 cidades, castelos e aldeias, um mundo vivo de senhores'],
    tr: ['1347 Avrasya’sını fethet', '4 devlet, 135 şehir, kale ve köy, lordlarla dolu canlı bir dünya'],
  }],
  ['03-siege', {
    ru: ['Штурмуй крепости', 'Лестницы, ворота и лучники на стенах'],
    en: ['Storm castles and cities', 'Ladders, gates and archers on the walls'],
    pt: ['Tome castelos e cidades', 'Escadas, portões e arqueiros nas muralhas'],
    tr: ['Kaleleri ve şehirleri kuşat', 'Merdivenler, kapılar ve surlarda okçular'],
  }],
  ['08-party', {
    ru: ['Собери свою дружину', 'Спутники командуют войсками, а крестьяне растут в ветеранов'],
    en: ['Build your warband', 'Companions command your troops, peasants grow into veterans'],
    pt: ['Monte seu bando de guerra', 'Companheiros comandam as tropas, camponeses viram veteranos'],
    tr: ['Birliğini kur', 'Yoldaşların askerlerine komuta eder, köylüler kıdemliye dönüşür'],
  }],
  ['04-hero', {
    ru: ['Снаряди своего рыцаря', '99 доспехов, клинков и коней — облик героя меняется вместе с ними'],
    en: ['Equip your knight', '99 armours, blades and horses — your hero’s look changes with them'],
    pt: ['Equipe seu cavaleiro', '99 armaduras, lâminas e cavalos — o visual do herói muda com eles'],
    tr: ['Şövalyeni donat', '99 zırh, kılıç ve at — kahramanının görünüşü onlarla değişir'],
  }],
  ['05-desert', {
    ru: ['От северных лесов до пустынь', 'Каждая держава воюет по-своему: клин рыцарей, стена щитов, конные лучники'],
    en: ['From northern forests to desert sands', 'Every kingdom fights its own way: knightly wedges, shield walls, horse archers'],
    pt: ['Das florestas do norte aos desertos', 'Cada reino luta do seu jeito: cunha de cavaleiros, parede de escudos, arqueiros montados'],
    tr: ['Kuzey ormanlarından çöllere', 'Her devlet kendi usulüyle savaşır: şövalye kaması, kalkan duvarı, atlı okçular'],
  }],
  ['06-tournament', {
    ru: ['Турниры и слава', 'Поединки и схватки команд, ставки и призовое снаряжение'],
    en: ['Tournaments and glory', 'Duels and team mêlées, bets and prize gear'],
    pt: ['Torneios e glória', 'Duelos e refregas em equipe, apostas e prêmios'],
    tr: ['Turnuvalar ve şan', 'Teke tek dövüşler, takım savaşları, bahisler ve ödüller'],
  }],
  ['07-town', {
    ru: ['Торгуй, нанимай, служи лордам', 'Рынки, таверны, лавки оружейников и поручения знати'],
    en: ['Trade, recruit, serve the lords', 'Markets, taverns, weaponsmiths and quests from the nobility'],
    pt: ['Negocie, recrute, sirva aos senhores', 'Mercados, tavernas, armeiros e missões da nobreza'],
    tr: ['Ticaret yap, asker topla, lordlara hizmet et', 'Pazarlar, meyhaneler, silahçılar ve soyluların görevleri'],
  }],
  ['09-tree', {
    ru: ['70 видов воинов', 'Рыцари, берсерки, конные лучники, наффатуны с греческим огнём'],
    en: ['70 kinds of warriors', 'Knights, berserkers, horse archers, naffatun with Greek fire'],
    pt: ['70 tipos de guerreiros', 'Cavaleiros, berserkers, arqueiros montados, naffatun com fogo grego'],
    tr: ['70 çeşit savaşçı', 'Şövalyeler, berserkler, atlı okçular, Rum ateşli neftçiler'],
  }],
];

// Шрифты игры встраиваем прямо в страницу (data: URI): так не нужен сервер и не мешает CORS
const FS = path.join(__dirname, '..', 'node_modules', '@fontsource');
const FONTS = '<style>' + ['kurale/latin-400', 'kurale/latin-ext-400', 'kurale/cyrillic-400', 'ruslan-display/latin-400', 'ruslan-display/latin-ext-400', 'ruslan-display/cyrillic-400']
  .map((f) => {
    const dir = path.join(FS, f.split('/')[0]);
    return fs.readFileSync(path.join(FS, f + '.css'), 'utf8')
      .replace(/url\(\.\/files\/([^)]+?\.woff2)\)/g, (_, file) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(dir, 'files', file)).toString('base64')})`)
      .replace(/,\s*url\(\.\/files\/[^)]+?\.woff\) format\('woff'\)/g, '');
  }).join('\n') + '</style>';

const page = (img, title, sub) => `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
  html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; }
  body {
    background: radial-gradient(ellipse at 50% 30%, #3a2c20 0%, #1d1611 55%, #0d0a08 100%);
    font-family: 'Kurale', serif; color: #efe3c6; position: relative;
  }
  .grain { position: absolute; inset: 0; opacity: .18; background-image: repeating-linear-gradient(45deg, rgba(255,255,255,.03) 0 2px, transparent 2px 5px); }
  .cap { position: absolute; top: 34px; left: 0; right: 0; text-align: center; }
  h1 { margin: 0; display: inline-block; white-space: nowrap; font-family: 'Ruslan Display', serif; font-weight: 400; font-size: 76px; line-height: 1.05; letter-spacing: 1px;
       color: #f4cf63; text-shadow: 0 4px 0 #3b2208, 0 8px 18px rgba(0,0,0,.7); }
  p { margin: 14px 0 0; font-size: 34px; color: #e9dcc0; text-shadow: 0 2px 6px rgba(0,0,0,.8); }
  .shot { position: absolute; left: 50%; top: 222px; transform: translateX(-50%); width: 1440px; height: 810px;
          border: 6px solid #c9a24a; border-radius: 10px; box-shadow: 0 0 0 3px #2a1a0a, 0 22px 50px rgba(0,0,0,.75); overflow: hidden; }
  .shot img { width: 100%; height: 100%; display: block; }
</style></head><body><div class="grain"></div>
<div class="cap"><h1>${title}</h1><p>${sub}</p></div>
<div class="shot"><img src="${img}"></div></body></html>`;

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
  for (const L of LANGS) {
    const out = path.join(ROOT, 'captioned', L);
    fs.mkdirSync(out, { recursive: true });
    let n = 0;
    for (const [name, caps] of SHOTS) {
      const src = path.join(ROOT, 'raw', L, name + '.jpg');
      if (!fs.existsSync(src)) { console.log('нет', src); continue; }
      const data = 'data:image/jpeg;base64,' + fs.readFileSync(src).toString('base64');
      const [title, sub] = caps[L];
      await p.setContent(page(data, title, sub), { waitUntil: 'load' });
      await p.evaluate(async () => {
        await document.fonts.ready;
        // Длинный заголовок уменьшаем, чтобы он не упирался в края
        const h1 = document.querySelector('h1');
        for (let size = 76; h1.scrollWidth > 1700 && size > 44; size -= 2) h1.style.fontSize = size + 'px';
      });
      n++;
      await p.screenshot({ path: path.join(out, `${String(n).padStart(2, '0')}-${name.slice(3)}.jpg`), type: 'jpeg', quality: 90 });
    }
    console.log(L, n);
  }
  await b.close();
})();

// Обложка Google Play (feature graphic) 1024×500 на каждом языке: кадр боя, герб, название и слоган.
// Берёт store/feature-bg.jpg (node dev/store-shots.cjs en feature) и store/emblem.png (node dev/store-brand.cjs).
// Запуск: node dev/store-feature.cjs  → store/feature-graphic-<lang>.jpg
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const TAG = {
  ru: 'Веди армии. Бери замки. Займи трон.',
  en: 'Lead armies. Storm castles. Claim the crown.',
  pt: 'Lidere exércitos. Tome castelos. Conquiste a coroa.',
  tr: 'Ordular yönet. Kaleler al. Tacı kazan.',
};
const FS = path.join(ROOT, 'node_modules', '@fontsource');
const font = (f) => {
  const dir = path.join(FS, f.split('/')[0]);
  return fs.readFileSync(path.join(FS, f + '.css'), 'utf8')
    .replace(/url\(\.\/files\/([^)]+?\.woff2)\)/g, (_, file) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(dir, 'files', file)).toString('base64')})`)
    .replace(/,\s*url\(\.\/files\/[^)]+?\.woff\) format\('woff'\)/g, '');
};
const FONTS = ['kurale/latin-400', 'kurale/latin-ext-400', 'kurale/cyrillic-400', 'ruslan-display/latin-400'].map(font).join('\n');
const data = (f, type) => `data:${type};base64,` + fs.readFileSync(path.join(ROOT, 'store', f)).toString('base64');

const page = (tag) => `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
  html, body { margin: 0; width: 1024px; height: 500px; overflow: hidden; background: #14110f; }
  .bg { position: absolute; inset: 0; background: url(${data('feature-bg.jpg', 'image/jpeg')}) 110px -70px / 1400px auto no-repeat; }
  .shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(20,13,8,.97) 0%, rgba(20,13,8,.88) 34%, rgba(20,13,8,.3) 52%, rgba(20,13,8,0) 64%),
           linear-gradient(0deg, rgba(20,13,8,.55) 0%, rgba(20,13,8,0) 30%); }
  .emb { position: absolute; left: 20px; top: 14px; width: 250px; filter: drop-shadow(0 8px 14px rgba(0,0,0,.6)); }
  .t { position: absolute; left: 44px; top: 268px; }
  h1 { margin: 0; font: 400 64px 'Ruslan Display', serif; color: #f4cf63; letter-spacing: 1px; line-height: 1;
       text-shadow: 0 4px 0 #3b2208, 0 8px 16px rgba(0,0,0,.8); white-space: nowrap; }
  p { margin: 18px 0 0; font: 400 24px 'Kurale', serif; color: #f0e4c8; text-shadow: 0 2px 6px rgba(0,0,0,.9); white-space: nowrap; }
</style></head><body><div class="bg"></div><div class="shade"></div>
<img class="emb" src="${data('emblem.png', 'image/png')}">
<div class="t"><h1>WARFARE 1347</h1><p>${tag}</p></div></body></html>`;

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1024, height: 500 } })).newPage();
  for (const [L, tag] of Object.entries(TAG)) {
    await p.setContent(page(tag), { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(ROOT, 'store', `feature-graphic-${L}.jpg`), type: 'jpeg', quality: 92 });
    console.log(L);
  }
  await b.close();
})();

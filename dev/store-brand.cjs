// Выгружает иконку и заставку из dev/brand.html:
//   resources/android/mipmap-*/ic_launcher*.png, resources/android/drawable*/splash.png — их копирует scripts/android-setup.mjs;
//   store/icon-512.png — иконка для Google Play.
// Нужен запущенный dev-сервер (npx vite --port 5173). Запуск: node dev/store-brand.cjs
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const RES = path.join(ROOT, 'resources', 'android');
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
// Размеры заставки Capacitor (альбомная и книжная ориентация)
const SPLASH = {
  drawable: [480, 320],
  'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280],
  'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920],
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.goto('http://localhost:5173/dev/brand.html');
  await p.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  const save = async (file, expr, ...args) => {
    const url = await p.evaluate(([expr, args]) => window.__brand[expr](...args).toDataURL('image/png'), [expr, args]);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  };
  for (const [d, k] of Object.entries(DENSITIES)) {
    const dir = path.join(RES, `mipmap-${d}`);
    await save(path.join(dir, 'ic_launcher.png'), 'icon', 48 * k, false);
    await save(path.join(dir, 'ic_launcher_round.png'), 'icon', 48 * k, true);
    await save(path.join(dir, 'ic_launcher_foreground.png'), 'foreground', 108 * k);
  }
  for (const [dir, [w, h]] of Object.entries(SPLASH)) await save(path.join(RES, dir, 'splash.png'), 'splash', w, h);
  await save(path.join(ROOT, 'store', 'icon-512.png'), 'icon', 512, false);
  console.log('готово');
  await b.close();
})();

// Настраивает Android-проект Capacitor после `npx cap add android`:
// альбомная ориентация, полноэкранный режим, пиксельная иконка.
// Запуск: node scripts/android-setup.mjs  (идемпотентно)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const ROOT = 'android/app/src/main';
if (!existsSync(ROOT)) {
  console.error('Нет android/. Сначала выполните: npx cap add android');
  process.exit(1);
}

// ── Ориентация ──
const manifestPath = join(ROOT, 'AndroidManifest.xml');
let manifest = readFileSync(manifestPath, 'utf8');
if (!manifest.includes('screenOrientation')) {
  manifest = manifest.replace(/<activity\b/, '<activity\n            android:screenOrientation="sensorLandscape"');
  writeFileSync(manifestPath, manifest);
  console.log('Ориентация: sensorLandscape');
}

// ── Полноэкранный режим ──
const appId = JSON.parse(readFileSync('capacitor.config.json', 'utf8')).appId;
const javaDir = join(ROOT, 'java', ...appId.split('.'));
mkdirSync(javaDir, { recursive: true });
writeFileSync(
  join(javaDir, 'MainActivity.java'),
  `package ${appId};

import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN);
        }
    }
}
`,
);
console.log('MainActivity: полноэкранный режим');

// ── Иконка: пиксель-арт 24×24 (щит со скрещёнными мечами) ──
const ICON = [
  '........................',
  '..g..................g..',
  '.gWg................gWg.',
  '..gWg..............gWg..',
  '...gWg............gWg...',
  '....gWg..oooooo..gWg....',
  '....ogWgoBBBBBBogWgo....',
  '....oBgWgBBBBBBgWgBo....',
  '....oBBgWgBBBBgWgBBo....',
  '....oBBBgWgBBgWgBBBo....',
  '....oBByBgWggWgByBBo....',
  '....oByyyBgWWgyyyBBo....',
  '....oBBBBBgWWgBBBBBo....',
  '....oBBBBgWggWgBBBBo....',
  '....oBBBgWgBBgWgBBBo....',
  '.....oBgWgBBBBgWgBo.....',
  '.....ohhhBBBBBBhhho.....',
  '....hhhhoBBBBBBohhhh....',
  '...hhh..ooBBBBoo..hhh...',
  '..hh......oooo......hh..',
  '..pp................pp..',
  '........................',
  '........................',
  '........................',
];
const PAL = {
  o: [0x23, 0x1c, 0x17, 255],
  B: [0x2f, 0x5f, 0xb3, 255],
  y: [0xe8, 0xc0, 0x4a, 255],
  g: [0x6a, 0x70, 0x78, 255],
  W: [0xe6, 0xea, 0xee, 255],
  h: [0x8a, 0x5a, 0x2a, 255],
  p: [0xe8, 0xc0, 0x4a, 255],
};
const BG = [0x2a, 0x23, 0x20, 255];

function crc32(buf) {
  let c;
  const table = crc32.t ??= Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** PNG size×size: иконка вписана с полями (inset — доля поля с каждой стороны). */
function iconPng(size, { inset, round, transparent }) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const inner = size * (1 - inset * 2);
  const off = size * inset;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let px = transparent ? [0, 0, 0, 0] : BG;
      if (round) {
        const dx = x + 0.5 - size / 2;
        const dy = y + 0.5 - size / 2;
        if (dx * dx + dy * dy > (size / 2) * (size / 2)) px = [0, 0, 0, 0];
      }
      const ix = Math.floor(((x - off) / inner) * 24);
      const iy = Math.floor(((y - off) / inner) * 24);
      if (px[3] && ix >= 0 && iy >= 0 && ix < 24 && iy < 24) {
        const ch = ICON[iy][ix];
        if (PAL[ch]) px = PAL[ch];
      } else if (!px[3] && transparent && ix >= 0 && iy >= 0 && ix < 24 && iy < 24) {
        const ch = ICON[iy][ix];
        if (PAL[ch]) px = PAL[ch];
      }
      raw.set(px, y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENSITIES)) {
  const dir = join(ROOT, 'res', `mipmap-${d}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'ic_launcher.png'), iconPng(48 * k, { inset: 0.04, round: false }));
  writeFileSync(join(dir, 'ic_launcher_round.png'), iconPng(48 * k, { inset: 0.1, round: true }));
  writeFileSync(join(dir, 'ic_launcher_foreground.png'), iconPng(108 * k, { inset: 0.2, round: false, transparent: true }));
}
const bgXml = join(ROOT, 'res', 'values', 'ic_launcher_background.xml');
if (existsSync(bgXml)) {
  writeFileSync(bgXml, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#2A2320</color>\n</resources>\n');
}
console.log('Иконки обновлены');

// ── Версия и постоянная подпись ──
// Номер версии растёт с каждой сборкой CI, а подпись одним и тем же ключом
// позволяет ставить новую версию поверх старой без удаления (сохранения остаются).
const gradlePath = 'android/app/build.gradle';
let gradle = readFileSync(gradlePath, 'utf8');
const pkgVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const build = Number(process.env.GITHUB_RUN_NUMBER ?? 1);
const [maj, min] = pkgVersion.split('.').map(Number);
gradle = gradle
  .replace(/versionCode \d+/, `versionCode ${maj * 100000 + min * 1000 + build}`)
  .replace(/versionName "[^"]*"/, `versionName "${pkgVersion.split('.').slice(0, 2).join('.')}.${build}"`);
if (!gradle.includes('warfare-debug.keystore')) {
  gradle = gradle.replace(
    /\n    buildTypes \{/,
    `
    signingConfigs {
        debug {
            storeFile file('../../scripts/warfare-debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }`,
  );
}
writeFileSync(gradlePath, gradle);
console.log(`Версия ${pkgVersion.split('.').slice(0, 2).join('.')}.${build}, подпись: scripts/warfare-debug.keystore`);

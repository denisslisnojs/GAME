// Настраивает Android-проект Capacitor после `npx cap add android`:
// альбомная ориентация, полноэкранный режим, иконка и заставка.
// Запуск: node scripts/android-setup.mjs  (идемпотентно)
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

// ── Иконка и заставка ──
// Готовые картинки лежат в resources/android (рисует dev/brand.html, выгружает dev/store-brand.cjs).
const RES_SRC = 'resources/android';
let copied = 0;
for (const dir of readdirSync(RES_SRC)) {
  for (const file of readdirSync(join(RES_SRC, dir))) {
    mkdirSync(join(ROOT, 'res', dir), { recursive: true });
    copyFileSync(join(RES_SRC, dir, file), join(ROOT, 'res', dir, file));
    copied++;
  }
}
const bgXml = join(ROOT, 'res', 'values', 'ic_launcher_background.xml');
writeFileSync(bgXml, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#2A190E</color>\n</resources>\n');
// Android 12+: системная заставка на тёмном фоне, а не на белом
const stylesPath = join(ROOT, 'res', 'values', 'styles.xml');
if (existsSync(stylesPath)) {
  let styles = readFileSync(stylesPath, 'utf8');
  if (!styles.includes('windowSplashScreenBackground')) {
    styles = styles.replace(
      /(<style name="AppTheme.NoActionBarLaunch"[^>]*>)/,
      '$1\n        <item name="windowSplashScreenBackground">#14110F</item>',
    );
    writeFileSync(stylesPath, styles);
  }
}
console.log(`Иконки и заставка: ${copied} файлов`);

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

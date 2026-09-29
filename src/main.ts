import Phaser from 'phaser';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import './styles.css';
import { music } from './audio/music';
import { sfx } from './audio/sfx';
import { world } from './game/world';
import { DPR } from './config';
import { BattleScene } from './scenes/BattleScene';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';
import { closeTopModal } from './ui/dom';
import { loadSettings } from './ui/screens';
import { tr } from './i18n';

// Ошибка при запуске видна на экране (в APK нет консоли под рукой)
let bootError: HTMLElement | null = null;
const showBootError = (msg: string) => {
  if (document.querySelector('.menu, .hud-top')) return; // игра уже идёт — не мешаем
  bootError ??= document.body.appendChild(document.createElement('pre'));
  bootError.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:9999;margin:0;padding:8px;background:#2a1010;color:#ffd0c0;font:12px monospace;white-space:pre-wrap;max-height:40vh;overflow:auto';
  bootError.textContent += msg + '\n';
};
window.addEventListener('error', (e) => showBootError(`${e.message} @ ${e.filename?.split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => showBootError(String((e.reason as Error)?.stack ?? e.reason)));

loadSettings();

// Подсказка повернуть телефон
const hint = document.createElement('div');
hint.className = 'rotate-hint';
hint.innerHTML = tr('<div style="font-size:42px">⟳</div><div>Поверните телефон горизонтально</div>');
document.body.append(hint);

// Звук разрешается только после первого касания
const unlock = () => music.unlock();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#14110f',
  pixelArt: true,
  antialias: false,
  // Холст в пикселях устройства, а на странице — в CSS-размер окна: чёткая картинка без «квадратиков»
  scale: {
    mode: Phaser.Scale.NONE,
    width: Math.round(window.innerWidth * DPR),
    height: Math.round(window.innerHeight * DPR),
    zoom: 1 / DPR,
  },
  input: { activePointers: 3 },
  fps: { target: 60 },
  scene: [BootScene, WorldScene, BattleScene],
});

const fitCanvas = () => game.scale.resize(Math.round(window.innerWidth * DPR), Math.round(window.innerHeight * DPR));
window.addEventListener('resize', fitCanvas);
window.addEventListener('orientationchange', () => setTimeout(fitCanvas, 200));

const worldScene = () => game.scene.getScene('world') as WorldScene | null;

// Свернули игру или выключили экран: сохранить и замолчать; вернулись — звук обратно
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    worldScene()?.saveOnHide();
    music.suspend();
    sfx.suspend();
  } else {
    music.resume();
    sfx.resume();
  }
});

/** «Назад» (кнопка Android или Esc): закрыть окно → пауза в бою → меню игры. false — выходить. */
function back(): boolean {
  if (closeTopModal()) return true;
  if (game.scene.isActive('battle')) {
    (game.scene.getScene('battle') as BattleScene).togglePause();
    return true;
  }
  return worldScene()?.backPressed() ?? false;
}

if (Capacitor.isNativePlatform()) {
  App.addListener('backButton', () => {
    if (!back()) {
      worldScene()?.saveOnHide();
      void App.exitApp();
    }
  }).catch(() => {
    /* плагина нет — «Назад» работает по умолчанию */
  });
} else {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) back();
  });
}

// Для автотестов: в режиме разработки или при сборке с VITE_QA=1
if (import.meta.env.DEV || import.meta.env.VITE_QA) Object.assign(window, { __game: game, __world: world });

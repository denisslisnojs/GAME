import Phaser from 'phaser';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import './styles.css';
import { music } from './audio/music';
import { sfx } from './audio/sfx';
import { world } from './game/world';
import { BattleScene } from './scenes/BattleScene';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';
import { closeTopModal } from './ui/dom';
import { loadSettings } from './ui/screens';
import { tr } from './i18n';

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
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  input: { activePointers: 3 },
  fps: { target: 60 },
  scene: [BootScene, WorldScene, BattleScene],
});

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
  void App.addListener('backButton', () => {
    if (!back()) {
      worldScene()?.saveOnHide();
      void App.exitApp();
    }
  });
} else {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) back();
  });
}

// Для автотестов: в режиме разработки или при сборке с VITE_QA=1
if (import.meta.env.DEV || import.meta.env.VITE_QA) Object.assign(window, { __game: game, __world: world });

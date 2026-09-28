import Phaser from 'phaser';
import './styles.css';
import { music } from './audio/music';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';
import { loadSettings } from './ui/screens';

loadSettings();

// Подсказка повернуть телефон
const hint = document.createElement('div');
hint.className = 'rotate-hint';
hint.innerHTML = '<div style="font-size:42px">⟳</div><div>Поверните телефон горизонтально</div>';
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
  scene: [BootScene, WorldScene],
});

// Для автотестов в режиме разработки
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;

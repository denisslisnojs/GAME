import Phaser from 'phaser';
import { FACTIONS, FACTION_IDS } from '../data/factions';
import { hex } from '../gfx/pixel';
import { allSettlementTextures, drawBandits, drawBoat, drawCamp, drawLord, drawRider, drawSmoke } from '../gfx/sprites';
import { buildWorld } from '../game/world';
import { loadCachedMap, saveMapLater } from '../map/cache';
import { generateMap } from '../map/terrain';
import { showLoading } from '../ui/screens';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  async create() {
    const loading = showLoading();
    const steps = ['Шрифты', 'Очертания земель', 'Моря и побережья', 'Горные хребты', 'Леса, степи и пустыни', 'Реки', 'Деревья и вершины', 'Дороги и переправы', 'Города и деревни'];
    let step = 0;
    const progress = async (label: string) => {
      loading.set(step++ / steps.length, label + '…');
      // Дать браузеру отрисовать полосу загрузки
      await new Promise((r) => setTimeout(r, 16));
    };

    await progress('Шрифты');
    try {
      await Promise.all([document.fonts.load('16px "Kurale"', 'Кириллица'), document.fonts.load('16px "Ruslan Display"', 'Кириллица')]);
    } catch {
      /* шрифты не критичны */
    }

    let map = await loadCachedMap();
    if (map) {
      step = steps.length - 2;
      await progress('Карта из кэша');
    } else {
      map = await generateMap(progress);
      saveMapLater(map);
    }
    this.textures.addCanvas('map', map.canvas);

    await progress('Города и деревни');
    buildWorld(map);
    for (const { key, canvas } of allSettlementTextures()) this.textures.addCanvas(key, canvas);
    for (const id of FACTION_IDS) {
      const f = FACTIONS[id];
      for (const player of [false, true]) {
        const suffix = player ? '_player' : '';
        this.textures.addCanvas(`rider_${id}${suffix}_0`, drawRider(hex(f.color), hex(f.color2), 0, player));
        this.textures.addCanvas(`rider_${id}${suffix}_1`, drawRider(hex(f.color), hex(f.color2), 1, player));
        this.textures.addCanvas(`boat_${id}${suffix}_0`, drawBoat(hex(f.color), hex(f.color2), 0));
        this.textures.addCanvas(`boat_${id}${suffix}_1`, drawBoat(hex(f.color), hex(f.color2), 1));
      }
      this.textures.addCanvas(`lord_${id}_0`, drawLord(hex(f.color), hex(f.color2), 0));
      this.textures.addCanvas(`lord_${id}_1`, drawLord(hex(f.color), hex(f.color2), 1));
    }

    for (const f of [0, 1] as const) {
      this.textures.addCanvas(`band_${f}`, drawBandits(f));
      this.textures.addCanvas(`band_p_${f}`, drawBandits(f, '#2a3a5a'));
      this.textures.addCanvas(`band_d_${f}`, drawBandits(f, '#5a5a52'));
      this.textures.addCanvas(`raider_${f}`, drawRider('#7a5a32', '#3a2a1e', f, false, false, '#8a6a45'));
      this.textures.addCanvas(`camp_${f}`, drawCamp(f));
      this.textures.addCanvas(`smoke_${f}`, drawSmoke(f));
      this.textures.addCanvas(`desertr_${f}`, drawRider('#3a3028', '#e8dcc0', f, false, false, '#c8c0b0'));
    }

    loading.set(1, 'Готово');
    loading.close();
    this.scene.start('world');
  }
}

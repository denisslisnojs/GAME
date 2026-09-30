import Phaser from 'phaser';
import { FACTIONS, FACTION_IDS } from '../data/factions';
import { hex } from '../gfx/color';
import { allSettlementTextures, drawBandits, drawBoat, drawCamp, drawCaravan, drawCrown, drawLord, drawPlague, drawRider, drawSmoke } from '../gfx/mapart';
import { buildWorld } from '../game/world';
import { loadCachedMap, saveMapLater } from '../map/cache';
import { generateMap, mapTiles } from '../map/terrain';
import { showLoading } from '../ui/screens';
import { tr } from '../i18n';

/** Текстура со сглаживанием при масштабе (игра по умолчанию рисует «по пикселям»). */
function addSmooth(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement) {
  scene.textures.addCanvas(key, canvas)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  async create() {
    const loading = showLoading();
    const steps = [tr('Шрифты'), tr('Очертания земель'), tr('Моря и побережья'), tr('Горные хребты'), tr('Леса, степи и пустыни'), tr('Реки'), tr('Деревья и вершины'), tr('Дороги и переправы'), tr('Города и деревни')];
    let step = 0;
    const progress = async (label: string) => {
      loading.set(step++ / steps.length, label + '…');
      // Дать браузеру отрисовать полосу загрузки
      await new Promise((r) => setTimeout(r, 16));
    };

    await progress(tr('Шрифты'));
    try {
      // Не ждём шрифты дольше 3 с: на некоторых WebView загрузка шрифта может не завершиться никогда
      // Образец с буквами расширенной латиницы (турецкий, португальский), чтобы подгрузился и этот набор
      const sample = tr('Кириллица') + ' ĞŞİığşçãõ 0123';
      await Promise.race([
        Promise.all([
          document.fonts.load('16px "Kurale"', sample),
          document.fonts.load('16px "Ruslan Display"', sample),
          document.fonts.load('500 16px "Fira Sans Condensed"', sample),
          document.fonts.load('700 16px "Fira Sans Condensed"', sample),
        ]),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
    } catch {
      /* шрифты не критичны */
    }

    let map = await loadCachedMap();
    if (map) {
      step = steps.length - 2;
      await progress(tr('Карта из кэша'));
    } else {
      map = await generateMap(progress);
      saveMapLater(map);
    }
    // Карта режется на плитки не шире 2048 точек (предел текстур на многих телефонах), сглаживание при масштабе
    for (const t of mapTiles(map.canvas)) addSmooth(this, t.key, t.canvas);

    await progress(tr('Города и деревни'));
    buildWorld(map);
    for (const { key, canvas } of allSettlementTextures()) addSmooth(this, key, canvas);
    for (const id of FACTION_IDS) {
      const f = FACTIONS[id];
      for (const player of [false, true]) {
        const suffix = player ? '_player' : '';
        addSmooth(this, `rider_${id}${suffix}_0`, drawRider(hex(f.color), hex(f.color2), 0, player));
        addSmooth(this, `rider_${id}${suffix}_1`, drawRider(hex(f.color), hex(f.color2), 1, player));
        addSmooth(this, `boat_${id}${suffix}_0`, drawBoat(hex(f.color), hex(f.color2), 0));
        addSmooth(this, `boat_${id}${suffix}_1`, drawBoat(hex(f.color), hex(f.color2), 1));
      }
      addSmooth(this, `caravan_${id}_0`, drawCaravan(hex(f.color), hex(f.color2), 0));
      addSmooth(this, `caravan_${id}_1`, drawCaravan(hex(f.color), hex(f.color2), 1));
      addSmooth(this, `lord_${id}_0`, drawLord(hex(f.color), hex(f.color2), 0));
      addSmooth(this, `lord_${id}_1`, drawLord(hex(f.color), hex(f.color2), 1));
    }

    for (const f of [0, 1] as const) {
      addSmooth(this, `band_${f}`, drawBandits(f));
      addSmooth(this, `band_p_${f}`, drawBandits(f, '#2a3a5a'));
      addSmooth(this, `band_d_${f}`, drawBandits(f, '#5a5a52'));
      addSmooth(this, `raider_${f}`, drawRider('#7a5a32', '#3a2a1e', f, false, false, '#8a6a45'));
      addSmooth(this, `camp_${f}`, drawCamp(f));
      addSmooth(this, `smoke_${f}`, drawSmoke(f));
      addSmooth(this, `plague_${f}`, drawPlague(f));
      addSmooth(this, `desertr_${f}`, drawRider('#3a3028', '#e8dcc0', f, false, false, '#c8c0b0'));
    }

    addSmooth(this, 'crown', drawCrown());
    loading.set(1, tr('Готово'));
    loading.close();
    this.scene.start('world');
  }
}

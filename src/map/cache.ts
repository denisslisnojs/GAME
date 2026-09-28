// Кэш сгенерированной карты в IndexedDB: первый запуск генерирует карту (несколько секунд на телефоне),
// последующие берут готовую картинку и сетку из памяти устройства.

import { ART_H, ART_W, GRID_H, GRID_W } from '../config';
import type { MapData } from './terrain';

/** Менять при любой правке генератора карты или данных суши. */
export const MAP_VERSION = 'map-v3';
const DB = 'w1347';
const STORE = 'cache';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface Stored {
  version: string;
  w: number;
  h: number;
  image: Blob;
  terrain: Uint8Array;
  cost: Float32Array;
}

export async function loadCachedMap(): Promise<MapData | null> {
  try {
    const db = await openDb();
    const rec = await new Promise<Stored | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get('map');
      req.onsuccess = () => resolve(req.result as Stored | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!rec || rec.version !== MAP_VERSION || rec.w !== ART_W || rec.h !== ART_H) return null;
    if (rec.terrain.length !== GRID_W * GRID_H || rec.cost.length !== GRID_W * GRID_H) return null;
    const bmp = await createImageBitmap(rec.image);
    const canvas = document.createElement('canvas');
    canvas.width = ART_W;
    canvas.height = ART_H;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0);
    bmp.close?.();
    return { canvas, terrain: rec.terrain, cost: rec.cost };
  } catch {
    return null;
  }
}

/** Сохранение в фоне: не задерживает запуск игры. */
export function saveMapLater(map: MapData) {
  setTimeout(() => {
    map.canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        const db = await openDb();
        const rec: Stored = { version: MAP_VERSION, w: ART_W, h: ART_H, image: blob, terrain: map.terrain, cost: map.cost };
        db.transaction(STORE, 'readwrite').objectStore(STORE).put(rec, 'map');
        db.close();
      } catch {
        /* кэш не обязателен */
      }
    }, 'image/png');
  }, 3000);
}

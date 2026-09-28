// Геометрия карты. «Арт-пиксель» — один пиксель пиксель-арта карты,
// на экране он растягивается в ART_SCALE раз без сглаживания.
export const LON_MIN = -12;
export const LON_MAX = 124;
export const LAT_MIN = 12;
export const LAT_MAX = 71;

/** Арт-пикселей на градус широты. */
export const PX_PER_DEG_LAT = 20;
/** Сжатие по долготе (косинус ~45° широты), чтобы Европа не выглядела растянутой. */
export const LON_FACTOR = 0.7071;
export const PX_PER_DEG_LON = PX_PER_DEG_LAT * LON_FACTOR;

/** Размер клетки навигационной сетки в арт-пикселях. */
export const CELL = 4;
export const GRID_W = Math.ceil(((LON_MAX - LON_MIN) * PX_PER_DEG_LON) / CELL);
export const GRID_H = Math.ceil(((LAT_MAX - LAT_MIN) * PX_PER_DEG_LAT) / CELL);
export const ART_W = GRID_W * CELL;
export const ART_H = GRID_H * CELL;

/** Во сколько раз растягивается пиксель-арт в мировых координатах. */
export const ART_SCALE = 4;
export const TILE = CELL * ART_SCALE;
export const WORLD_W = ART_W * ART_SCALE;
export const WORLD_H = ART_H * ART_SCALE;

/** Реальных секунд в игровых сутках при скорости ×1. */
export const SECONDS_PER_DAY = 10;
/** Базовая скорость отряда, клеток в сутки. */
export const PARTY_SPEED = 18;

export const START_YEAR = 1347;
export const SAVE_KEY = 'w1347_save_v1';
export const SETTINGS_KEY = 'w1347_settings_v1';

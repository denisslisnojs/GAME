import { ART_SCALE, CELL, LAT_MAX, LON_MIN, PX_PER_DEG_LAT, PX_PER_DEG_LON, TILE } from '../config';

/** Долгота/широта → арт-пиксели. */
export function geoToArt(lon: number, lat: number): { x: number; y: number } {
  return { x: (lon - LON_MIN) * PX_PER_DEG_LON, y: (LAT_MAX - lat) * PX_PER_DEG_LAT };
}

export function artToGeo(x: number, y: number): { lon: number; lat: number } {
  return { lon: LON_MIN + x / PX_PER_DEG_LON, lat: LAT_MAX - y / PX_PER_DEG_LAT };
}

export function geoToWorld(lon: number, lat: number): { x: number; y: number } {
  const a = geoToArt(lon, lat);
  return { x: a.x * ART_SCALE, y: a.y * ART_SCALE };
}

export function geoToCell(lon: number, lat: number): { cx: number; cy: number } {
  const a = geoToArt(lon, lat);
  return { cx: Math.floor(a.x / CELL), cy: Math.floor(a.y / CELL) };
}

export function worldToCell(x: number, y: number): { cx: number; cy: number } {
  return { cx: Math.floor(x / TILE), cy: Math.floor(y / TILE) };
}

export function cellCenterWorld(cx: number, cy: number): { x: number; y: number } {
  return { x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 };
}

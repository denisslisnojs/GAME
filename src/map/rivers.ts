// Реки в мировых координатах: для брода в бою.

import { TILE } from '../config';
import { geoToWorld } from './geo';
import { RIVERS } from './geodata';

let segs: [number, number, number, number][] | null = null;

function segments() {
  if (segs) return segs;
  segs = [];
  for (const r of RIVERS) {
    const pts = r.pts.map(([lon, lat]) => geoToWorld(lon, lat));
    for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y]);
  }
  return segs;
}

/** Стоит ли точка у реки (в пределах пары клеток). */
export function nearRiver(x: number, y: number, cells = 1.6): boolean {
  const R = cells * TILE;
  for (const [x0, y0, x1, y1] of segments()) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2));
    if (Math.hypot(x - (x0 + dx * t), y - (y0 + dy * t)) < R) return true;
  }
  return false;
}

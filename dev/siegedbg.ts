import { Battle, type ArmyDef, WALL_X } from '../src/battle/sim';
const army = (troops: [string, number][], morale = 100): ArmyDef => ({ name: 'x', culture: 'x', troops: troops.map(([id, count]) => ({ id, count })), formation: 'classic', morale });
const bt = new Battle([army([['aurelia_i3m', 12], ['aurelia_i3r', 10], ['aurelia_c3m', 8]]), army([['horde_i3m', 12], ['horde_i3r', 12], ['horde_i2', 6]], 120)], 0, { siege: true });
bt.orders[0] = { hero: 'attack', inf: 'attack', ranged: 'hold', cav: 'attack' };
for (let i = 0; i < 3000 && bt.winner === null; i++) {
  bt.step(0.1); bt.events.length = 0;
  if (i % 200 === 0) {
    const a = bt.active(0), d = bt.active(1);
    console.log(bt.time.toFixed(0), 'breach', bt.breached, 'att', a.length, 'def wall', d.filter(u => u.onWall).length, 'def ground', d.filter(u => !u.onWall).length, 'morale', bt.morale.map(m => m.toFixed(0)).join('/'),
      'att x', Math.round(Math.min(...a.map(u => u.x))), Math.round(Math.max(...a.map(u => u.x))), 'wallX', WALL_X, 'ammo', a.filter(u=>u.troop.role==='ranged').map(u=>u.ammo).join(','), 'states', [...new Set(a.map(u=>u.state))].join(','));
  }
}
console.log('winner', bt.winner, 'time', bt.time.toFixed(0));

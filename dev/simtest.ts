import { Battle, type ArmyDef } from '../src/battle/sim';
const army = (troops: [string, number][], morale = 100): ArmyDef => ({ name: 'x', culture: 'x', troops: troops.map(([id, count]) => ({ id, count })), formation: 'classic', morale });
function run(name: string, a: ArmyDef, b: ArmyDef, n = 20) {
  let w0 = 0, t = 0, dead0 = 0, dead1 = 0;
  for (let i = 0; i < n; i++) {
    const bt = new Battle([a, b]);
    bt.runToEnd();
    if (bt.winner === 0) w0++;
    t += bt.time;
    dead0 += bt.units.filter(u => u.side === 0 && u.state === 'dead').length;
    dead1 += bt.units.filter(u => u.side === 1 && u.state === 'dead').length;
  }
  console.log(name.padEnd(42), 'win0', (w0 / n * 100).toFixed(0) + '%', 'time', (t / n).toFixed(0) + 's', 'dead', (dead0 / n).toFixed(1), '/', (dead1 / n).toFixed(1));
}
run('10 peasants+3 landwehr vs 8 bandits', army([['aurelia_i1', 10], ['aurelia_i2', 3]]), army([['outlaw_bandit', 8]], 75));
run('10 peasants vs 10 bandits', army([['aurelia_i1', 10]]), army([['outlaw_bandit', 10]], 75));
run('10 imperial inf vs 10 hirdman', army([['aurelia_i3m', 10]]), army([['nordmark_i3m', 10]]));
run('10 knights vs 20 spearmen(sult i3m)', army([['aurelia_c4m', 10]]), army([['sultanate_i3m', 20]]));
run('15 horse archers vs 15 infantry t3', army([['horde_c3r', 15]]), army([['aurelia_i3m', 15]]));
run('30 mixed vs 30 mixed', army([['aurelia_i3m', 12], ['aurelia_i3r', 10], ['aurelia_c3m', 8]]), army([['horde_i3m', 10], ['horde_i3r', 10], ['horde_c3r', 10]]));
run('60 peasants vs 20 t3', army([['aurelia_i1', 60]]), army([['nordmark_i3m', 20]]));

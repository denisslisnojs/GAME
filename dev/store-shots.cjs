// Скриншоты для Google Play: 1920×1080, по языкам. Нужен запущенный dev-сервер (npx vite --port 5173).
// Запуск: node dev/store-shots.cjs ru|en|pt|tr   → store/screenshots/raw/<lang>/NN-name.jpg
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const L = process.argv[2] || 'en';
const only = process.argv[3];
const OUT = path.join(__dirname, '..', 'store', 'screenshots', 'raw', L);
fs.mkdirSync(OUT, { recursive: true });

const KIT = { head: 'armet', body: 'gothic', hands: 'gothic_gauntlets', legs: 'gothic_greaves', weapon: 'bastard_sword', shield: 'heater', horse: 'barded_destrier' };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 })).newPage();
  let errs = 0;
  p.on('pageerror', (e) => { errs++; console.log('PAGEERR', e.message); });
  const boot = async () => {
    await p.goto('http://localhost:5173/');
    await p.evaluate((l) => { localStorage.clear(); localStorage.setItem('w1347_lang', l); }, L);
    await p.reload();
    await p.waitForSelector('.menu', { timeout: 120000 });
    await p.addStyleTag({ content: '.hint-card, .toasts { display: none !important; }' });
  };
  const party = (f) => [
    { id: `${f}_c4m`, count: 6, xp: 0 }, { id: `${f}_i4m`, count: 10, xp: 0 }, { id: `${f}_i3m`, count: 12, xp: 0 },
    { id: `${f}_i4r`, count: 8, xp: 0 }, { id: `${f}_i3r`, count: 8, xp: 0 }, { id: `${f}_c3m`, count: 6, xp: 0 },
  ];
  const newGame = async (faction = 0) => {
    await p.click('.menu .btn >> nth=0');
    await p.waitForTimeout(300);
    await p.click(`.faction-card >> nth=${faction}`).catch(() => {});
    await p.click('.btn.primary >> nth=-1');
    await p.waitForSelector('.story-modal', { timeout: 20000 }).then(() => p.click('.story-modal .btn >> nth=1')).catch(() => {});
    await p.waitForTimeout(700);
    await p.evaluate(([kit, troops]) => {
      document.querySelectorAll('.modal-back').forEach((e) => e.remove());
      const w = window.__game.scene.getScene('world');
      w.modals = 0;
      const S = w.state;
      S.hero.level = 14; S.hero.attrs = { str: 9, agi: 7, vit: 8, lead: 8 }; S.hero.points = 0; S.hero.skillPoints = 0;
      S.hero.equip = { ...kit };
      S.gold = 4870;
      S.party.troops = troops;
      S.hints = ['welcome', 'settle', 'battle', 'upgrade', 'points', 'quest', 'map', 'party', 'hero', 'companions', 'fief', 'lords', 'plague', 'tournament'];
    }, [KIT, party('aurelia')]);
  };
  const shot = async (name) => {
    await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 90 });
    console.log(L, name);
  };
  const battle = async (name, o) => {
    await p.evaluate(async (o) => {
      document.querySelectorAll('.modal-back').forEach((e) => e.remove());
      const sc = window.__game.scene.getScene('world');
      sc.modals = 0;
      sc.battleTerrain = () => o.terrain;
      const S = sc.state;
      S.party.troops = o.mine;
      if (o.companions) for (const c of S.companions.slice(0, 2)) c.where = 'party';
      const { Battle } = await import('/src/battle/sim.ts');
      const { playerArmy, enemyArmy } = await import('/src/battle/setup.ts');
      const { FACTIONS } = await import('/src/data/factions.ts');
      if (o.enemyCulture) o.enemyName = FACTIONS[o.enemyCulture].short;
      let bt;
      if (o.arena) {
        const { meleeArmies } = await import('/src/game/tournament.ts');
        const { world } = await import('/src/game/world.ts');
        const town = world.settlements.find((s) => s.type === 'town');
        const arms = meleeArmies(S, town);
        o.enemyName = arms[1].name;
        bt = new Battle(arms, 0);
      } else {
        const e = enemyArmy(o.enemyName, o.enemyCulture, o.enemy);
        if (o.siege) e.morale = 115;
        bt = new Battle([playerArmy(S, 'classic'), e], 0, o.siege ? { siege: true } : { terrain: o.terrain, weather: o.weather });
      }
      const view = { enemyName: o.enemyName, enemyColor: o.enemyColor, terrain: o.terrain };
      if (o.siege) view.wall = { culture: o.enemyCulture, color: o.enemyColor, color2: '#e8dcc0' };
      if (o.arena) view.arena = { colors: ['#3a6ab0', '#e8c04a', '#8a3a2a', '#3a5a8a', '#e8dcc0', '#5a7a3a', '#c8a040'] };
      sc.runBattle(bt, false, view, () => {});
    }, o).catch((e) => console.log('BATTLE ERR', name, e.message));
    if (!o.arena) {
      await p.waitForSelector('.b-deploy', { state: 'visible', timeout: 15000 }).catch(() => {});
      await p.waitForTimeout(600);
      await p.click('.b-deploy .btn.primary').catch(() => {});
    } else await p.waitForTimeout(400);
    await p.evaluate(() => {
      const bt = window.__game.scene.getScene('battle').battle;
      for (const g of ['hero', 'inf', 'ranged', 'cav']) bt.setOrder(bt.playerSide, g, 'attack');
    });
    // Прокручиваем бой вперёд на o.sim секунд, чтобы армии успели сойтись
    await p.evaluate((sim) => {
      const bt = window.__game.scene.getScene('battle').battle;
      for (let t = 0; t < sim; t += 0.05) { bt.step(0.05); bt.events.length = 0; }
    }, o.sim ?? 0);
    await p.waitForTimeout(o.wait ?? 600);
    for (let i = 0; i < (o.zoom ?? 1); i++) await p.click('.btn.b-small:has-text("+")').catch(() => {});
    await p.waitForTimeout(o.after ?? 1200);
    await p.evaluate(() => { window.__game.scene.getScene('battle').paused = true; });
    await shot(name);
    await p.evaluate(() => {
      const bs = window.__game.scene.getScene('battle');
      window.__game.scene.stop('battle');
      document.querySelectorAll('.battle-ui').forEach((e) => e.remove());
      const w = window.__game.scene.getScene('world');
      w.inBattle = false; w.hud?.setVisible(true);
    });
    await p.waitForTimeout(500);
  };
  const want = (n) => !only || only.split(',').includes(n);

  await boot();
  await newGame(0);
  const f = 'aurelia';

  if (want('map')) {
    await p.evaluate(() => {
      document.querySelectorAll('.modal-back').forEach((e) => e.remove());
      const w = window.__game.scene.getScene('world');
    });
    await p.waitForTimeout(6000);
    await shot('02-map');
  }

  if (want('battle')) await battle('01-battle', { terrain: 'grass', mine: party(f), companions: true, enemyName: 'Nordmark', enemyCulture: 'nordmark', enemyColor: '#c24040',
    enemy: [{ id: 'nordmark_i4m', count: 10 }, { id: 'nordmark_i3m', count: 12 }, { id: 'nordmark_i3r', count: 10 }, { id: 'nordmark_i3s', count: 6 }, { id: 'nordmark_c3m', count: 6 }], sim: 17, zoom: 1 });

  if (want('siege')) await battle('03-siege', { terrain: 'grass', siege: true, mine: party(f), enemyName: 'Sultanate', enemyCulture: 'sultanate', enemyColor: '#3a9a5a',
    enemy: [{ id: 'sultanate_i3m', count: 14 }, { id: 'sultanate_i3r', count: 14 }, { id: 'sultanate_i4r', count: 6 }, { id: 'sultanate_i3s', count: 5 }], sim: 9, zoom: 1 });

  if (want('hero')) {
    await p.evaluate(async () => {
      const w = window.__game.scene.getScene('world');
      w.state.hero.bag = ['sallet', 'milanese', 'zweihander', 'arabian', 'kalkan', 'brigandine'];
      const { openHero } = await import('/src/ui/heroUi.ts');
      openHero(w);
    });
    await p.waitForTimeout(700);
    await shot('04-hero');
    await p.evaluate(() => document.querySelectorAll('.modal-back').forEach((e) => e.remove()));
  }

  if (want('desert')) await battle('05-desert', { terrain: 'desert', mine: [{ id: 'aurelia_c4m', count: 8 }, { id: 'aurelia_c3m', count: 8 }, { id: 'aurelia_i4r', count: 10 }, { id: 'aurelia_i3m', count: 12 }], enemyName: 'Horde', enemyCulture: 'horde', enemyColor: '#d8a030',
    enemy: [{ id: 'horde_c3r', count: 12 }, { id: 'horde_c3m', count: 8 }, { id: 'horde_c3s', count: 5 }, { id: 'horde_i3m', count: 10 }], sim: 12, zoom: 1 });

  if (want('arena')) await battle('06-tournament', { arena: true, terrain: 'grass', mine: party(f), enemyName: 'Red', enemyColor: '#c24040', sim: 9, zoom: 1, after: 500 });

  if (want('town')) {
    await p.evaluate(async () => {
      const w = window.__game.scene.getScene('world');
      const { world } = await import('/src/game/world.ts');
      const { openSettlement } = await import('/src/ui/panels.ts');
      const s = world.settlements.find((s) => s.type === 'town' && s.culture === 'sultanate') ?? world.settlements[0];
      w.state.settlements[s.id].owner = w.state.hero.faction;
      openSettlement(w, s, () => {});
    });
    await p.waitForTimeout(800);
    await shot('07-town');
    await p.evaluate(() => document.querySelectorAll('.modal-back').forEach((e) => e.remove()));
  }

  if (want('party')) {
    await p.evaluate(async () => {
      const w = window.__game.scene.getScene('world');
      const S = w.state;
      const C = await import('/src/game/companions.ts');
      for (const c of S.companions.slice(0, 3)) { c.where = 'party'; c.level = 7; }
      C.setCommand(S, S.companions[0].id, 'cav');
      C.setCommand(S, S.companions[1].id, 'inf');
      const f = S.hero.faction;
      S.party.troops = [{ id: `${f}_c4m`, count: 6, xp: 0 }, { id: `${f}_i4m`, count: 10, xp: 0 }, { id: `${f}_i3m`, count: 12, xp: 900 }, { id: `${f}_i3r`, count: 8, xp: 0 }];
      const { openParty } = await import('/src/ui/panels.ts');
      openParty(w);
    });
    await p.waitForTimeout(700);
    await shot('08-party');
    await p.evaluate(() => document.querySelectorAll('.modal-back').forEach((e) => e.remove()));
  }

  if (want('tree')) {
    await p.evaluate(async () => {
      const w = window.__game.scene.getScene('world');
      const { openTroopTree } = await import('/src/ui/troopTree.ts');
      openTroopTree(w.state, 'nordmark');
    });
    await p.waitForTimeout(800);
    await shot('09-tree');
    await p.evaluate(() => document.querySelectorAll('.modal-back').forEach((e) => e.remove()));
  }

  console.log(L, 'errors', errs);
  await b.close();
})();

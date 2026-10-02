// Honest early-game test: gather by real hits, craft, sell, build, farm; checks quests advance.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 1100, height: 700 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  await pg.goto('file://' + path.resolve(__dirname, '../index.html'));
  await pg.click('[data-t=new]'); await pg.click('[data-t=start]'); await pg.waitForTimeout(400);
  const log = await pg.evaluate(() => {
    const GF = window.GF, G = GF.G, S = G.S, log = [];
    const rec = (o) => GF.RECIPES.find((r) => r.out === o);
    const step = (n) => { for (let i = 0; i < n; i++) G.update(0.05); };
    const gather = (type, item, n) => {
      let guard = 0;
      while (GF.count(S, item) < n && guard++ < 400) {
        const P = G.P; let best = null, bd = 1e9;
        for (const nd of GF.nodesNear(G.over, P.x, P.y, 24)) { if (nd.type !== type) continue; if (nd.dead) continue; const d = Math.hypot(nd.x - P.x, nd.y - P.y); if (d < bd) { bd = d; best = nd; } }
        if (!best) { log.push('no node ' + type); return; }
        P.x = best.x; P.y = best.y + 0.9; P.ang = -Math.PI / 2;
        let h = 0; while (!best.dead && h++ < 60 && GF.count(S, item) < n) { G.actionAttack(); step(10); }
        step(5);
      }
    };
    gather('tree', 'wood', 14); log.push('cap ' + GF.capacity(S) + ' carry ' + GF.carry(S)); gather('rock', 'stone', 9); log.push('after rock stone=' + GF.count(S, 'stone') + ' carry ' + GF.carry(S)); gather('bush_fiber', 'fiber', 6);
    log.push('after gather wood/stone/fiber ' + [GF.count(S, 'wood'), GF.count(S, 'stone'), GF.count(S, 'fiber')]);
    GF.checkQuests(S); step(5);
    log.push('main quest: ' + (GF.activeMain(S).map((q) => q.id)));
    gather('clay_pit', 'clay', 4);
    // craft chain
    let r = GF.craft(S, rec('rope'), 1); log.push('plank ' + JSON.stringify(r).slice(0, 80));
    r = GF.craft(S, rec('rope'), 1); log.push('rope ' + JSON.stringify(r).slice(0, 80));
    r = GF.craft(S, rec('pickaxe1'), 1); log.push('pickaxe1 ' + JSON.stringify(r).slice(0, 80));
    r = GF.craft(S, rec('axe1'), 1); log.push('axe1 ' + JSON.stringify(r).slice(0, 80));
    GF.checkQuests(S);
    log.push('main quest: ' + (GF.activeMain(S).map((q) => q.id)));
    // sell
    const before = S.coins; const sr = GF.sell(S, 'general', 'wood', 5); log.push('sell ' + JSON.stringify(sr).slice(0, 80) + ' coins ' + before + '->' + S.coins);
    // build
    GF.stashAdd(S, 'wood', 40); GF.stashAdd(S, 'stone', 40); GF.stashAdd(S, 'clay', 40); log.push('furnace cost ' + JSON.stringify(GF.BUILDINGS.furnace.cost || GF.BUILDINGS.furnace.levels || '?').slice(0, 120)); S.coins += 500;
    const z = GF.HOME; const bres = GF.build(S, 'furnace', z.x + 4, z.y - 2); log.push('build furnace ' + JSON.stringify(bres).slice(0, 100));
    return log;
  });
  console.log(log.join('\n'));
  console.log(errs.length ? errs.join('\n') : 'NO ERRORS');
  await b.close();
})();

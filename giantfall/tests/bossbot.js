// In-browser boss-fight bot: each boss is fought with its intended gear tier by a simple dodge-and-hit AI.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 1000, height: 640 } });
  const errs = [];
  pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
  await pg.goto('file://' + path.resolve(__dirname, '../index.html'));
  await pg.click('[data-t=new]'); await pg.click('[data-t=start]');
  await pg.waitForTimeout(500);
  const plan = JSON.parse(process.env.PLAN || '[["mossy_cellar","iron_sword","leather_armor",2],["guardian_pit","steel_sword","steel_armor",3],["hollow_throne","steel_sword","steel_armor",3],["frozen_depths","crystal_sword","crystal_armor",4],["magma_heart","obsidian_sword","obsidian_armor",5],["warden_vault","ancient_blade","ancient_armor",6],["giants_keep","giant_slayer","giant_plate",8]]');
  await pg.evaluate((c) => { window.__CAP = c; }, +process.env.CAP || 240);
  const res = await pg.evaluate(async (plan) => {
    const GF = window.GF, G = GF.G, out = [];
    for (const [did, wpn, arm, lvl] of plan) {
      const S = G.S;
      S.level = lvl * 6; S.hp = undefined;
      for (const id of [wpn, arm]) { GF.add(S, id, 1); }
      GF.equip(S, wpn); GF.equip(S, arm);
      GF.add(S, 'bread', 20);
      GF.Dungeon.enter(did, {});
      G.panel = null;
      const P = G.P, map = G.map, boss = map.boss;
      let t = 0, deaths = 0, dodges = 0, nan = false, phases = new Set();
      P.x = boss.x; P.y = boss.y + 6; // skip the dungeon crawl: drop in at the arena
      boss.active = true;
      while (t < window.__CAP && !boss.dead && boss.hp > 0) {
        const dt = 0.05; t += dt;
        const bx = boss.x - P.x, by = boss.y - P.y, d = Math.hypot(bx, by);
        P.ang = Math.atan2(by, bx);
        const K = G.keys; K.w = K.a = K.s = K.d = false;
        const wk = GF.weapon(S); const rng = (wk && wk.kind === 'bow') ? 6 : 1.9 + boss.r;
        let danger = false;
        for (const tl of map.tele) { if (tl.kind === 'circle' ? Math.hypot(tl.x - P.x, tl.y - P.y) < tl.r + 0.8 : true) { danger = true; } }
        for (const pr of map.proj) { if (!pr.friendly && Math.hypot(pr.x - P.x, pr.y - P.y) < 2.2) danger = true; }
        if (danger && P.roll <= 0 && P.stam > 25) { G.dodge(); dodges++; }
        if (d > rng) { K[bx > 0.5 ? 'd' : bx < -0.5 ? 'a' : 'x'] = true; K[by > 0.5 ? 's' : by < -0.5 ? 'w' : 'x'] = true; }
        G.actionAttack();
        if (S.hp < GF.maxHp(S) * 0.4 && !G._eat) { G.useItem && G.useItem('bread'); }
        if (G.dead) { deaths++; (window.__why = window.__why || []).push(G.deathInfo && G.deathInfo.by + '@' + Math.round(t) + ' bossHp ' + Math.round(boss.hp / boss.max * 100) + '%'); G.respawn(); GF.Dungeon.enter(did, {}); const m2 = G.map; Object.assign(G.P, { x: m2.boss.x, y: m2.boss.y + 6 }); G.map.boss.active = true; return_check: ; }
        G.update(dt);
        if (G.map.boss) phases.add(G.map.boss.phase);
        if (Number.isNaN(P.x) || Number.isNaN(boss.hp)) { nan = true; break; }
        if (G.map.kind === 'over') break;
        if (deaths > 6) break;
        if (G.map.boss && G.map.boss !== boss) { /* re-entered after death */ }
      }
      out.push({ did, won: !!S.bosses[map.boss ? map.boss.boss : ''] || boss.dead, t: Math.round(t), deaths, dodges, nan, phases: [...phases].join(','), hp: Math.round(boss.hp), hpmax: boss.max, mapKind: G.map.kind });
      if (G.map.kind !== 'over') GF.Dungeon.leave(true);
      G.panel = null; G.dead = false; G.P.dead = false; S.hp = GF.maxHp(S);
    }
    return out;
  }, plan);
  console.log(await pg.evaluate(() => (window.__why || []).join(' | ')));
  for (const r of res) console.log(JSON.stringify(r));
  console.log(errs.length ? errs.join('\n') : 'NO ERRORS');
  await b.close();
})();

const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 1100, height: 700 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  await pg.goto('file://' + path.resolve(__dirname, '../index.html'));
  await pg.click('[data-t=new]'); await pg.click('[data-t=start]'); await pg.waitForTimeout(400);
  const r = await pg.evaluate(async () => {
    const GF = window.GF, G = GF.G, S = G.S, out = {};
    for (const id of ['giant_slayer', 'giant_plate']) { GF.add(S, id, 1); GF.equip(S, id); }
    S.level = 50; S.hp = GF.maxHp(S);
    GF.Dungeon.enter('giants_keep', {}); const boss = G.map.boss;
    G.P.x = boss.x; G.P.y = boss.y + 3; boss.active = true;
    for (let i = 0; i < 40; i++) G.update(0.05);
    boss.hp = 50; G.P.ang = -Math.PI / 2; boss.x = G.P.x; boss.y = G.P.y - 2;
    for (let i = 0; i < 200 && !boss.dead && boss.hp > 0; i++) { G.P.invuln = 5; G.actionAttack(); G.update(0.05); boss.x = G.P.x; boss.y = G.P.y - 2; }
    for (let i = 0; i < 100; i++) G.update(0.05);
    out.giant = !!S.bosses.giant; out.modal = !document.getElementById('modal').classList.contains('hidden');
    out.title = document.querySelector('#modal-box h2') && document.querySelector('#modal-box h2').textContent;
    return out;
  });
  await pg.waitForTimeout(4000); r.modalLater = await pg.evaluate(() => !document.getElementById('modal').classList.contains('hidden'));
  console.log(JSON.stringify(r));
  await pg.screenshot({ path: process.env.OUT + '/victory.png' });
  console.log(errs.length ? errs.join('\n') : 'NO ERRORS');
  await b.close();
})();

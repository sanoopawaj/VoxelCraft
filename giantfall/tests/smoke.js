// Headless browser smoke test: boots the game, plays a few seconds, reports errors.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--allow-file-access-from-files'] });
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await pg.goto('file://' + path.resolve(__dirname, '../index.html'));
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: process.env.OUT + '/title.png' });
  await pg.click('[data-t=new]'); await pg.click('[data-t=start]');
  await pg.waitForTimeout(1500);
  await pg.keyboard.down('d'); await pg.waitForTimeout(800); await pg.keyboard.up('d');
  await pg.keyboard.press(' ');
  await pg.screenshot({ path: process.env.OUT + '/game.png' });
  for (const k of ['i', 'c', 't', 'b', 'j', 'm', 'k', 'Escape']) {
    await pg.keyboard.press(k); await pg.waitForTimeout(250);
    await pg.screenshot({ path: process.env.OUT + '/p_' + k + '.png' });
    if (k !== 'Escape') await pg.keyboard.press('Escape');
  }
  console.log(errs.length ? errs.join('\n') : 'NO ERRORS');
  await b.close();
})();

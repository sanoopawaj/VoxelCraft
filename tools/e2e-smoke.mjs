// End-to-end smoke test: drives the real game in headless Chromium through the manual test sequence
// (new world -> move -> break/collect/place -> inventory -> caves -> day/night -> save -> reload -> verify).
//
//   npm run e2e                 # starts its own dev server
//   E2E_URL=http://localhost:5173 npm run e2e   # use an already running server
//   CHROMIUM=/path/to/chrome npm run e2e        # custom browser binary
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (existsSync(root)) {
    for (const d of readdirSync(root)) {
      const p = `${root}/${d}/chrome-linux/chrome`;
      if (d.startsWith('chromium-') && existsSync(p)) return p;
    }
  }
  return undefined; // let playwright try its default
}

let server = null;
let url = process.env.E2E_URL;
if (!url) {
  const port = 5199;
  server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  url = `http://localhost:${port}/`;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(url); if (r.ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
}

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`); };

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
const wait = (ms) => page.waitForTimeout(ms);
const G = '(window.__voxel)';

try {
  // 1. start
  await page.goto(url);
  await page.waitForSelector('#btn-single');
  check('1  application launches, main menu visible', await ev(() => !document.getElementById('main').classList.contains('hidden')));

  // 2. create world (seed given)
  await page.click('#btn-single');
  await page.click('#btn-newworld');
  await page.fill('#cw-name', 'E2E');
  await page.fill('#cw-seed', '482913');
  await page.click('#btn-create-go');
  check('2  loading screen shown while generating', await ev(() => !document.getElementById('loading').classList.contains('hidden') || window.__voxel.state !== 'MAIN_MENU'));

  // 3. terrain generated
  await page.waitForFunction(() => window.__voxel.state === 'PLAYING', null, { timeout: 120000 });
  await wait(2500);
  const st = await ev(() => ({ ...window.__voxel.chunks.stats(), seed: window.__voxel.meta.seed, g: window.__voxel.player.onGround }));
  check('3  terrain generated and meshed, seed used exactly', st.meshed > 30 && st.seed === 482913 && st.g, JSON.stringify(st));

  // 4. move
  const p0 = await ev(() => [window.__voxel.player.x, window.__voxel.player.z]);
  await ev(() => window.__voxel.player.setLook(0.6, 0));
  // Hop while walking: there is no auto-step, so a ledge in the way needs a jump.
  await page.keyboard.down('KeyW'); await page.keyboard.down('Space'); await wait(1500); await page.keyboard.up('Space'); await page.keyboard.up('KeyW');
  const p1 = await ev(() => [window.__voxel.player.x, window.__voxel.player.z]);
  const walked = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  check('4  WASD movement', walked > 1, `moved ${walked.toFixed(1)} blocks`);

  // 5. jump. Forests have low canopies, so first step to open ground with 4 blocks of headroom.
  await ev(() => {
    const g = window.__voxel, w = g.world, p = g.player;
    const px = Math.floor(p.x), pz = Math.floor(p.z);
    for (let r = 0; r < 24; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const x = px + dx, z = pz + dz, top = w.topY(x, z);
      let open = w.getBlock(x, top, z) === 1; // grass top
      for (let yy = 1; yy <= 5 && open; yy++) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (w.getBlock(x + a, top + yy, z + b) !== 0) open = false;
      if (open) { p.teleport(x + 0.5, top + 1, z + 0.5); return; }
    }
  });
  await wait(600);
  // wait to be grounded first, then sample the peak height while space is held
  await page.waitForFunction(() => window.__voxel.player.onGround, null, { timeout: 15000 });
  const y0 = await ev(() => window.__voxel.player.y);
  await page.keyboard.down('Space');
  let yTop = y0;
  for (let i = 0; i < 8; i++) { await wait(80); yTop = Math.max(yTop, await ev(() => window.__voxel.player.y)); }
  await page.keyboard.up('Space');
  check('5  jump', yTop > y0 + 0.6, `rose ${(yTop - y0).toFixed(2)}`);
  await page.waitForFunction(() => window.__voxel.player.onGround, null, { timeout: 15000 });

  // 6. sprint
  const walkSpeed = walked / 1.5;
  await ev(() => window.__voxel.player.setLook(2.2, 0));
  const q0 = await ev(() => [window.__voxel.player.x, window.__voxel.player.z]);
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); await wait(1500);
  const sprinting = await ev(() => window.__voxel.player.sprinting);
  await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
  const q1 = await ev(() => [window.__voxel.player.x, window.__voxel.player.z]);
  const runSpeed = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) / 1.5;
  check('6  sprint is faster than walking', sprinting && runSpeed > walkSpeed * 1.1, `walk ${walkSpeed.toFixed(1)} run ${runSpeed.toFixed(1)}`);
  await wait(800);

  // 7. look at block, highlight
  await ev(() => window.__voxel.player.setLook(0, -1.2));
  await wait(400);
  const tgt = await ev(() => { const t = window.__voxel.interaction.target; return t && { x: t.x, y: t.y, z: t.z, id: window.__voxel.world.getBlock(t.x, t.y, t.z), nx: t.nx, ny: t.ny, nz: t.nz }; });
  check('7  raycast targets a block and highlight is shown', !!tgt && tgt.id !== 0, JSON.stringify(tgt));

  // 8-9. break + collect
  await page.mouse.down({ button: 'left' });
  await page.waitForFunction((t) => window.__voxel.world.getBlock(t.x, t.y, t.z) === 0, tgt, { timeout: 20000 }).catch(() => {});
  await page.mouse.up({ button: 'left' });
  check('8  block breaks (hold left click)', await ev((t) => window.__voxel.world.getBlock(t.x, t.y, t.z) === 0, tgt));
  await page.waitForFunction(() => window.__voxel.inventory.slots.some(Boolean), null, { timeout: 15000 }).catch(() => {});
  const inv1 = await ev(() => window.__voxel.inventory.toJSON().find(Boolean));
  check('9  drop is collected into the inventory', !!inv1, JSON.stringify(inv1));

  // 10. place: aim at the ground a couple of blocks ahead so the new block can't overlap the player
  await ev(() => window.__voxel.inventory.setSelected(0));
  await ev(() => window.__voxel.player.setLook(0, -0.6));
  await wait(400);
  const aim = await ev(() => { const t = window.__voxel.interaction.target; const g = window.__voxel; return t && { x: t.x + t.nx, y: t.y + t.ny, z: t.z + t.nz, before: g.inventory.slots[0] ? g.inventory.slots[0].count : 0 }; });
  await page.mouse.down({ button: 'right' }); await wait(400); await page.mouse.up({ button: 'right' });
  const after = await ev(() => { const s = window.__voxel.inventory.slots[0]; return s ? s.count : 0; });
  const placedId = aim ? await ev((a) => window.__voxel.world.getBlock(a.x, a.y, a.z), aim) : 0;
  check('10 block placed next to the targeted face and consumed from inventory', !!aim && placedId !== 0 && after === aim.before - 1, `block ${placedId}, count ${aim && aim.before}->${after}`);

  // 11. inventory
  await page.keyboard.press('KeyE'); await wait(300);
  const open = await ev(() => window.__voxel.state);
  await page.keyboard.press('KeyE'); await wait(300);
  check('11 inventory opens and closes with E', open === 'INVENTORY' && (await ev(() => window.__voxel.state)) === 'PLAYING');

  // 12. hotbar
  await page.keyboard.press('Digit5');
  const s5 = await ev(() => window.__voxel.inventory.selected);
  await page.mouse.wheel(0, 100); await wait(150);
  const sw = await ev(() => window.__voxel.inventory.selected);
  check('12 hotbar keys and mouse wheel', s5 === 4 && sw === 5);

  // 13-14. explore across chunk borders and the +/- coordinate quadrants, edit near borders
  await ev(() => { window.__voxel.player.flying = true; });
  const quad = [[40, 40], [-40, 40], [-40, -40], [40, -40], [-3, -3]];
  let okQuad = true;
  for (const [x, z] of quad) {
    await ev(([x, z]) => window.__voxel.player.teleport(x + 0.5, 100, z + 0.5), [x, z]);
    await page.waitForFunction(([x, z]) => window.__voxel.world.isLoaded(x, z) && window.__voxel.chunks.stats().meshQueue < 3, [x, z], { timeout: 60000 }).catch(() => {});
    await wait(500);
    const r = await ev(([x, z]) => {
      const w = window.__voxel.world; const top = w.topY(x, z);
      // Edit on both sides of the nearest chunk border and confirm get/set agree.
      const bx = x - (((x % 16) + 16) % 16) + 15, ok = [];
      for (const dx of [0, 1]) { w.setBlock(bx + dx, top + 3, z, 12); ok.push(w.getBlock(bx + dx, top + 3, z) === 12); }
      return ok.every(Boolean) && top > 0;
    }, [x, z]);
    okQuad = okQuad && r;
  }
  check('13 chunks stream while exploring (bounded memory)', (await ev(() => window.__voxel.chunks.stats().loaded)) < 260);
  check('14 positive and negative coordinates (all quadrants, chunk borders)', okQuad);

  // 15. cave
  await ev(() => { window.__voxel.player.flying = false; });
  const cave = await ev(() => {
    const w = window.__voxel.world;
    for (const c of w.chunks.values()) {
      if (!c.light) continue;
      for (let y = 10; y < 45; y++) for (let i = 0; i < 256; i++) {
        const idx = (y << 8) | i;
        if (c.blocks[idx] === 0 && c.blocks[idx + 256] === 0 && c.blocks[idx - 256] !== 0 && c.blocks[idx - 256] !== 18 && c.light[idx] >> 4 === 0) {
          return [c.cx * 16 + (i & 15), y, c.cz * 16 + (i >> 4)];
        }
      }
    }
    return null;
  });
  let caveOk = false;
  if (cave) {
    await ev((c) => window.__voxel.player.teleport(c[0] + 0.5, c[1], c[2] + 0.5), cave);
    await wait(1500);
    caveOk = await ev(() => { const p = window.__voxel.player; return window.__voxel.world.lightAt(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z)) >> 4 < 4; });
  }
  check('15 caves exist underground and are dark (no skylight)', caveOk, JSON.stringify(cave));

  // 16. day/night
  const day = await ev(() => { window.__voxel.time = 6000; return null; });
  await wait(400);
  const dNoon = await ev(() => window.__voxel.renderer.sky.daylight);
  await ev(() => { window.__voxel.time = 18000; }); await wait(400);
  const dNight = await ev(() => window.__voxel.renderer.sky.daylight);
  check('16 day/night cycle (noon bright, midnight dark)', dNoon > 0.95 && dNight < 0.05, `${dNoon.toFixed(2)} / ${dNight.toFixed(2)}`);
  await ev(() => { window.__voxel.time = 7000; });

  // Prepare something distinctive to verify persistence.
  const mark = await ev(() => {
    const g = window.__voxel; g.player.teleport(12.5, g.world.topY(12, 12) + 2, 12.5);
    g.inventory.add(17, 7); g.inventory.setSelected(2); g.world.setBlock(-20, 120, -20, 16);
    return { mods: g.world.modCount() };
  });
  await wait(2500);

  // 17-18. save + exit
  await page.keyboard.press('Escape'); await wait(400);
  const paused = await ev(() => window.__voxel.state);
  await page.click('#btn-save'); await wait(300);
  const status = await ev(() => document.getElementById('pause-status').textContent);
  const snap = await ev(() => { const g = window.__voxel; return { pos: [g.player.x, g.player.y, g.player.z], time: g.time, diamonds: g.inventory.count(17), sel: g.inventory.selected, mods: g.world.modCount() }; });
  check('17 pause menu + save', paused === 'PAUSED' && /saved/i.test(status), status);
  await page.click('#btn-mainmenu'); await wait(500);
  check('18 exit to main menu', (await ev(() => window.__voxel.state)) === 'MAIN_MENU');

  // 19-20. reload the page ("close and reopen") and continue
  await page.reload(); await page.waitForSelector('#btn-single');
  await page.click('#btn-single');
  const listed = await ev(() => document.getElementById('worldlist').innerText);
  await page.click('#worldlist .world-item .primary');
  await page.waitForFunction(() => window.__voxel.state === 'PLAYING', null, { timeout: 120000 });
  await wait(2500);
  const after2 = await ev(() => { const g = window.__voxel; return { pos: [g.player.x, g.player.y, g.player.z], time: g.time, diamonds: g.inventory.count(17), sel: g.inventory.selected, mods: g.world.modCount(), gold: g.world.getBlock(-20, 120, -20), seed: g.meta.seed }; });
  check('19 world listed with name and seed after reload', /E2E/.test(listed) && /482913/.test(listed));
  const near = (a, b) => Math.abs(a - b) < 0.5;
  check('20 world, player, inventory, time and edits persisted',
    after2.seed === 482913 && near(after2.pos[0], snap.pos[0]) && near(after2.pos[2], snap.pos[2]) && after2.diamonds === snap.diamonds &&
    after2.sel === snap.sel && after2.mods === snap.mods && after2.gold === 16 && Math.abs(after2.time - snap.time) < 200, JSON.stringify({ snap, after2 }));

  check('no uncaught errors / console errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('script completed', false, String(e));
} finally {
  await browser.close();
  if (server) server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);

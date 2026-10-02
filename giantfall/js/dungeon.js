// World-side dungeons, boss fights, the Abyss, treasure chests and random-event world objects.
(function (root) {
  'use strict';
  const GF = root.GF;
  const U = GF.util;
  const G = () => GF.G;
  const C = () => GF.Combat;
  const notify = (m, t) => GF.hooks.notify(m, t || 'info');
  const diff = (S) => GF.DIFFICULTY[S.diff] || GF.DIFFICULTY.standard;
  const BOSS_ORDER = ['guardian', 'forestking', 'wyrm', 'titan', 'warden'];

  function rollLoot(S, table, mult, extraRolls) {
    const t = GF.LOOT[table] || GF.LOOT.early;
    const out = [];
    const rolls = 3 + Math.floor(Math.random() * 3) + (extraRolls || 0);
    for (let i = 0; i < rolls; i++) {
      const [item, mn, mx] = t[Math.floor(Math.random() * t.length)];
      if (mx <= 0) continue;
      let n = Math.round((mn + Math.random() * (mx - mn)) * mult);
      if (Math.random() < GF.fx(S, 'luck')) n *= 2;
      out.push([item, Math.max(1, n)]);
    }
    return out;
  }

  function makeMap(did, gen, o) {
    const S = G().S;
    const map = Object.assign({}, gen, { kind: 'dungeon', did, enemies: [], proj: [], tele: [], drops: [], nodes: [], nodeGrid: new Map(), spawnState: {}, boss: null, floor: o.floor || 0, region: o.region, theme: o.theme || o.region, lootTable: o.loot, lootMult: o.lootMult || 1, rift: !!o.rift, abyss: !!o.abyss });
    map.chests = gen.chests.map((c) => ({ x: c.x, y: c.y, open: false }));
    const regionList = GF.REGION_ENEMIES[o.region] || GF.REGION_ENEMIES.greenlands;
    let types = Object.keys(regionList);
    const bag = [];
    for (const t of types) for (let i = 0; i < regionList[t]; i++) bag.push(t);
    if (o.abyss) { bag.length = 0; for (const rg in GF.REGION_ENEMIES) if (GF.REGIONS[rg].tier <= o.maxTier) for (const t in GF.REGION_ENEMIES[rg]) for (let i = 0; i < GF.REGION_ENEMIES[rg][t]; i++) bag.push(t); }
    for (const e of gen.enemies) {
      const type = bag[Math.floor(Math.random() * bag.length)];
      const en = C().spawnEnemy(map, type, e.x, e.y, { elite: e.elite, scale: o.scale || 1 }, S);
      en.dungeon = true;
    }
    return map;
  }

  function enter(did, opt) {
    opt = opt || {};
    const g = G(), S = g.S, P = g.P;
    const d = GF.DUNGEONS[did];
    const portal = g.over.portals.find((p) => p.dungeon === did);
    g.overPos = { x: portal ? portal.x : P.x, y: portal ? portal.y + 1.2 : P.y };
    S.stats.dungeons[did] = (S.stats.dungeons[did] || 0) + 1;
    const seed = (S.seed + U.strSeed(did) + (S.stats.dungeons[did] * 977)) >>> 0;
    const asc = !!opt.ascended;
    const gen = GF.genDungeon(did, seed, { sealed: !!d.seal });
    const map = makeMap(did, gen, { region: d.region, loot: d.loot, scale: asc ? 1.8 : 1 });
    map.ascended = asc;
    if (d.boss && gen.arena) {
      map.arena = gen.arena;
      const b = C().createBoss(map, d.boss, gen.arena.cx, gen.arena.cy, S, { arena: { cx: gen.arena.cx, cy: gen.arena.cy, r: gen.arena.r - 0.5 }, ascended: asc });
      b.dungeonId = did;
    }
    switchTo(map);
    g.banner = { t: 0, title: d.name + (asc ? ' (Ascended)' : ''), sub: d.boss && d.seal ? d.req : 'Explore, fight, loot. The exit is where you started.' };
  }
  function switchTo(map) {
    const g = G(), P = g.P;
    g.map = map;
    P.x = map.start.x; P.y = map.start.y; P.roll = 0; P.gather = null;
    g.cam.x = P.x; g.cam.y = P.y;
    g.parts = []; g.texts = [];
    GF.hooks.sound('portal');
  }
  function leave(silent) {
    const g = G(), P = g.P, S = g.S;
    if (g.map.kind === 'over') return;
    g.map = g.over;
    if (silent) { P.x = GF.HOME.x + 0.5; P.y = GF.HOME.y + 4.5; }
    else { P.x = g.overPos ? g.overPos.x : GF.HOME.x; P.y = g.overPos ? g.overPos.y : GF.HOME.y + 4; }
    if (GF.solidTile(g.over, P.x, P.y)) { P.x = GF.HOME.x + 0.5; P.y = GF.HOME.y + 4.5; }
    g.cam.x = P.x; g.cam.y = P.y;
    g.over.proj.length = 0; g.over.tele.length = 0;
    GF.hooks.sound('portal');
    GF.checkQuests(S);
    if (!silent) g.save(true);
  }

  // ---------------------------------------------------------------- Abyss (endless post-game dungeon)
  function enterAbyss(floor) {
    const g = G(), S = g.S;
    floor = floor || 1;
    const bossFloor = floor % 5 === 0;
    const seed = (S.seed + floor * 7717 + (S.stats.dungeons.abyss || 0) * 31) >>> 0;
    S.stats.dungeons.abyss = (S.stats.dungeons.abyss || 0) + (floor === 1 ? 1 : 0);
    const gen = GF.genDungeon('abyss', seed, { size: [60, 50], rooms: 9 + Math.min(4, Math.floor(floor / 4)), boss: bossFloor, noBoss: !bossFloor, sealed: false, floor, packBonus: Math.floor(floor / 6) });
    const maxTier = Math.min(7, 3 + Math.floor(floor / 3));
    const map = makeMap('abyss', gen, { region: 'giant', loot: 'giant', scale: 1 + 0.14 * (floor - 1), abyss: true, maxTier, floor, lootMult: 1 + floor * 0.1 });
    if (!g.overPos) g.overPos = { x: GF.HOME.x + 0.5, y: GF.HOME.y + 4.5 };
    if (bossFloor && gen.arena) {
      map.arena = gen.arena;
      const id = BOSS_ORDER[(floor / 5 - 1) % BOSS_ORDER.length];
      const b = C().createBoss(map, id, gen.arena.cx, gen.arena.cy, S, { arena: { cx: gen.arena.cx, cy: gen.arena.cy, r: gen.arena.r - 0.5 }, ascended: true, hpMult: 1 + 0.12 * (floor / 5) });
      b.abyssFloor = floor;
    } else {
      const last = gen.rooms[gen.rooms.length - 1];
      map.stairs = { x: last.cx + 0.5, y: last.cy + 0.5 };
    }
    S.stats.abyss = Math.max(S.stats.abyss, floor);
    const meta = GF.loadMeta();
    meta.bestAbyss = Math.max(meta.bestAbyss || 0, floor);
    switchTo(map);
    g.banner = { t: 0, title: `The Abyss: Floor ${floor}`, sub: bossFloor ? 'An Ascended guardian awaits.' : 'Find the stairs. Every floor is harder.' };
    GF.checkQuests(S); GF.checkAchievements(S);
  }

  // ---------------------------------------------------------------- rift + treasure
  function enterRift() {
    const g = G(), S = g.S, P = g.P;
    const region = P.region || 'greenlands';
    const seed = (S.seed + Math.floor(S.time)) >>> 0;
    g.overPos = { x: P.x, y: P.y + 1 };
    const gen = GF.genDungeon('rift', seed, { size: [44, 38], rooms: 7, noBoss: true, packBonus: 1 });
    const tier = GF.REGIONS[region].tier;
    const map = makeMap('rift', gen, { region, loot: GF.LOOT[region === 'frozen' ? 'frozen' : region] ? (region === 'greenlands' ? 'early' : region === 'stone' ? 'stone' : region) : 'early', scale: 1.1, rift: true, lootMult: 2.2 });
    map.chests.forEach((c) => { c.rich = true; });
    switchTo(map);
    g.banner = { t: 0, title: 'Dungeon Rift', sub: 'Chests here are overflowing. No boss, no seal.' };
  }
  function digTreasure() {
    const g = G(), S = g.S;
    const tr = S.events.treasure;
    if (!tr) return;
    const region = GF.regionAt(g.over, tr.x, tr.y) || 'greenlands';
    const tier = GF.REGIONS[region].tier;
    const coins = Math.round((300 + 250 * tier * tier) * diff(S).income);
    S.coins += coins; S.stats.earned += coins;
    g.addGround(g.map, 'coins', Math.round(coins * 0.3), tr.x, tr.y);
    const table = { greenlands: 'early', stone: 'stone', forest: 'forest', frozen: 'frozen', ember: 'ember', ruins: 'ruins', giant: 'giant' }[region];
    for (const [it, n] of rollLoot(S, table, 2, 2)) g.addGround(g.map, it, n, tr.x + (Math.random() - 0.5) * 2, tr.y + (Math.random() - 0.5) * 2);
    GF.addXp(S, 100 * tier * tier + 100);
    notify(`Treasure unearthed! +${coins} Crowns and loot.`, 'event');
    g.spawnParticles('levelup', tr.x, tr.y, {}); GF.hooks.sound('rare');
    S.events.treasure = null;
    GF.endEvent(S);
  }

  // ---------------------------------------------------------------- chests
  function openChest(c) {
    const g = G(), S = g.S, map = g.map;
    c.open = true;
    const tier = map.abyss ? 7 : GF.REGIONS[map.region].tier;
    const mult = (c.rich ? 2 : 1) * map.lootMult;
    const table = map.abyss ? 'giant' : (map.did === 'rift' ? map.lootTable : GF.DUNGEONS[map.did].loot);
    for (const [it, n] of rollLoot(S, table, mult, c.rich ? 2 : 0)) g.addGround(map, it, n, c.x + (Math.random() - 0.5) * 1.5, c.y + (Math.random() - 0.5) * 1.5);
    const coins = Math.round((30 + 35 * tier * tier) * mult * diff(S).income);
    g.addGround(map, 'coins', coins, c.x, c.y);
    if (map.abyss) {
      if (Math.random() < 0.55) g.addGround(map, 'abyss_shard', 1 + Math.floor(map.floor / 6), c.x, c.y);
      if (Math.random() < 0.18) g.addGround(map, 'giant_shard', 1, c.x, c.y);
      if (Math.random() < 0.10) g.addGround(map, 'star_ore', 1, c.x, c.y);
    }
    if (Math.random() < 0.35) g.addGround(map, Math.random() < 0.5 ? 'heal_potion' : 'bread', 1, c.x, c.y);
    GF.addXp(S, 20 * tier * tier + 30);
    g.spawnParticles('craft', c.x, c.y, {}); GF.hooks.sound('rare');
  }

  // ---------------------------------------------------------------- boss callbacks
  const bossEnv = {
    log: (m) => notify(m, 'event'),
    onBossStart(b) {
      const d = GF.BOSSES[b.boss];
      const g = G();
      g.banner = { t: 0, title: b.name.toUpperCase(), sub: d.title + ' — ' + d.intro, boss: true };
      GF.hooks.sound('bossroar'); GF.hooks.shake(0.7);
      GF.UI && GF.UI.bossIntro && GF.UI.bossIntro(b, d);
    },
    onPhase(b, p) { notify(`${b.name} enters phase ${p + 1}!`, 'event'); GF.hooks.sound('bossroar'); },
    onBossDead(b) { bossVictory(b); },
  };
  function bossVictory(b) {
    const g = G(), S = g.S, map = g.map;
    const id = b.boss, d = GF.BOSSES[id];
    const first = !S.bosses[id];
    const asc = b.asc;
    const abyss = !!b.abyssFloor;
    const rep = abyss ? 0.8 : first ? 1 : 0.35;
    const coins = Math.round(d.coins * rep * (asc ? 1.5 : 1) * diff(S).income * (1 + GF.fx(S, 'income')));
    g.addGround(map, 'coins', coins, b.x, b.y);
    GF.addXp(S, d.xp * rep * (asc ? 1.6 : 1));
    for (const [it, n] of d.drops) {
      const q = first || asc ? n : Math.max(1, Math.ceil(n / 2));
      g.addGround(map, it, q * (asc && it !== 'giant_shard' ? 2 : 1), b.x + (Math.random() - 0.5) * 3, b.y + (Math.random() - 0.5) * 3);
    }
    if (asc) {
      g.addGround(map, 'abyss_shard', 3 + Math.floor(Math.random() * 4) + (b.abyssFloor ? Math.floor(b.abyssFloor / 5) * 2 : 0), b.x, b.y);
      if (Math.random() < 0.25) g.addGround(map, 'giant_shard', 1 + Math.floor(Math.random() * 3), b.x, b.y);
      if (Math.random() < 0.1) g.addGround(map, 'star_core', 1, b.x, b.y);
    }
    if (first) {
      S.bosses[id] = true; S.bossFirst[id] = S.time;
      for (const [it, n] of (d.first || [])) { g.addGround(map, it, n, b.x, b.y + 1); }
      const reg = Object.keys(GF.REGION_UNLOCK_BY_BOSS).find((k) => GF.REGION_UNLOCK_BY_BOSS[k] === id);
      if (reg) { S.unlocked[reg] = true; GF.applyGates(g.over, S); notify(`${GF.REGIONS[reg].name} is now open!`, 'unlock'); }
      S.sp += 2;
      S.rp += Math.round(d.xp / 100);
      notify(`${d.name} DEFEATED! +2 skill points. New recipes unlocked.`, 'level');
      g.refreshNpcs();
    }
    if (!b.hitTaken) { S.stats.bossNoHit[id] = true; notify('Flawless victory: no damage taken!', 'ach'); }
    if (asc && !abyss) S.ascended[id] = true;
    // the seal is spent on victory (retrying after a defeat is free)
    const seal = GF.DUNGEONS[b.dungeonId] && GF.DUNGEONS[b.dungeonId].seal;
    if (seal && !abyss) GF.take(S, seal, 1);
    map.exitPortal = { x: b.arena.cx, y: b.arena.cy + 1.5 };
    map.proj = []; map.tele = [];
    for (const e of map.enemies) if (!e.isBoss && !e.dead) e.dead = true;
    g.banner = { t: 0, title: 'VICTORY', sub: d.name + ' has fallen.', boss: true };
    GF.hooks.sound('victory'); GF.hooks.shake(0.6);
    g.spawnParticles('levelup', b.x, b.y, {});
    if (map.abyss && b.abyssFloor) map.stairs = { x: b.arena.cx, y: b.arena.cy - 2 };
    if (id === 'giant' && first) {
      S.flags.won = true; S.flags.wonAt = S.playTime;
      const meta = GF.loadMeta();
      meta.wins = (meta.wins || 0) + 1;
      if (!meta.bestTime || S.playTime < meta.bestTime) meta.bestTime = S.playTime;
      GF.saveMeta();
      g.ending = { t: 0 };
      setTimeout(() => GF.UI && GF.UI.showVictory(), 3500);
    }
    GF.checkQuests(S); GF.checkAchievements(S);
    b.dead = true;
    g.save(true);
  }

  // ---------------------------------------------------------------- per-frame (dungeon)
  function tick(dt) {
    const g = G(), S = g.S, P = g.P, map = g.map;
    if (map.boss && !map.boss.dead) {
      // pylons must keep their own AI as normal enemies; the boss script drives the rest
      C().updateBoss(map, map.boss, P, S, dt, bossEnv);
    }
  }
  // ---------------------------------------------------------------- per-frame (overworld): events + tower defense
  function overTick(dt) {
    const g = G(), S = g.S, P = g.P, map = g.over;
    const a = S.events.active;
    if (a && !a.spawned) { a.spawned = true; spawnEventWorld(a); }
    if (a && a.id === 'invasion') invasionTick(dt, a);
    if (g.tick % 20 === 0 && !a) { /* nothing */ }
  }
  function freeSpotNear(cx, cy, minR, maxR, tries) {
    const g = G(), map = g.over;
    for (let i = 0; i < (tries || 60); i++) {
      const ang = Math.random() * 6.28, r = minR + Math.random() * (maxR - minR);
      const x = Math.floor(cx + Math.cos(ang) * r) + 0.5, y = Math.floor(cy + Math.sin(ang) * r) + 0.5;
      const rg = GF.regionAt(map, x, y);
      if (!rg || !g.S.unlocked[rg] || rg === 'giant' && !g.S.discovered.giant) continue;
      if (!C().blockedAt(map, x, y, 0.8)) return { x, y, region: rg };
    }
    return null;
  }
  function spawnEventWorld(a) {
    const g = G(), S = g.S, P = g.P, map = g.over;
    const tier = GF.REGIONS[P.region || 'greenlands'].tier;
    if (a.id === 'treasure') {
      const regs = Object.keys(S.unlocked).filter((r) => GF.REGIONS[r] && r !== 'giant');
      const rg = regs[Math.floor(Math.random() * regs.length)];
      const [x0, y0, x1, y1] = GF.REGIONS[rg].rect;
      let spot = null;
      for (let i = 0; i < 80 && !spot; i++) { const x = x0 + 6 + Math.random() * (x1 - x0 - 12), y = y0 + 6 + Math.random() * (y1 - y0 - 12); if (!C().blockedAt(map, x, y, 1)) spot = { x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5 }; }
      S.events.treasure = spot;
      if (spot) notify(`Treasure marked in ${GF.REGIONS[rg].name}! Check your map (M).`, 'event');
    } else if (a.id === 'meteors') {
      const rgSpots = [];
      for (let i = 0; i < 5; i++) { const s = freeSpotNear(P.x, P.y, 6, 22); if (s) rgSpots.push(s); }
      a.nodes = rgSpots.map((s) => addTempNode('meteor', s.x, s.y, false).id);
    } else if (a.id === 'rare_find') {
      const rg = P.region || 'greenlands';
      const types = { greenlands: ['coal_vein', 'clay_pit'], stone: ['gold_vein', 'quartz_vein', 'silver_vein'], forest: ['gold_vein', 'silver_vein'], frozen: ['crystal_vein', 'gold_vein'], ember: ['obsidian_vein', 'ember_vein'], ruins: ['ancient_vein'], giant: ['star_node', 'giant_rock'] }[rg];
      a.nodes = [];
      for (let i = 0; i < 4; i++) { const s = freeSpotNear(P.x, P.y, 5, 20); if (s) a.nodes.push(addTempNode(types[i % types.length], s.x, s.y, true).id); }
    } else if (a.id === 'invasion') {
      const n = 5 + GF.settleLevel(S) * 3;
      a.total = n; a.killed0 = totalKills(S); a.breach = 0; a.raiders = [];
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * 6.28, r = 22 + Math.random() * 4;
        const x = GF.HOME.x + Math.cos(ang) * r, y = GF.HOME.y + Math.sin(ang) * r;
        if (C().blockedAt(map, x, y, 0.5)) { i--; if (Math.random() < 0.05) break; continue; }
        const e = C().spawnEnemy(map, 'raider', x, y, { scale: 1 + (GF.settleLevel(S) - 1) * 0.45 }, S);
        e.home = { x: GF.HOME.x, y: GF.HOME.y + 3 }; e.state = 'chase'; e.raider = true; e.sc = 1 + (GF.settleLevel(S) - 1) * 0.45;
        a.raiders.push(e);
      }
    } else if (a.id === 'wanderer') {
      const s = freeSpotNear(P.x, P.y, 14, 34) || freeSpotNear(GF.HOME.x, GF.HOME.y, 10, 20);
      S.events.wanderer = s;
      if (s) notify(`The Traveling Merchant is in ${GF.REGIONS[s.region].name}. Check your map (M)!`, 'event');
      g.refreshNpcs();
    } else if (a.id === 'rift') {
      const s = freeSpotNear(P.x, P.y, 4, 14) || freeSpotNear(GF.HOME.x, GF.HOME.y, 6, 12);
      g.rift = s;
      if (s) notify('A dungeon rift has opened nearby (purple swirl)!', 'event');
    } else if (a.id === 'caravan') g.refreshNpcs();
  }
  function totalKills(S) { return Object.values(S.stats.killed).reduce((x, y) => x + y, 0); }
  function addTempNode(type, x, y, rich) {
    const map = G().over;
    const nd = GF.NODES[type];
    const node = { id: map.nodes.length, type, x, y, hp: nd.hp, max: nd.hp, rich, dead: false, temp: true, shake: 0 };
    map.nodes.push(node);
    const k = Math.floor(x / 4) + ',' + Math.floor(y / 4);
    if (!map.nodeGrid.has(k)) map.nodeGrid.set(k, []);
    map.nodeGrid.get(k).push(node);
    return node;
  }
  function invasionTick(dt, a) {
    const g = G(), S = g.S, P = g.P, map = g.over;
    // towers shoot raiders
    g.invT = (g.invT || 0) - dt;
    if (g.invT <= 0) {
      g.invT = 1.1;
      for (const b of S.buildings) {
        if (b.type !== 'tower') continue;
        const cx = b.x + 1, cy = b.y + 1;
        let best = null, bd = 10;
        for (const e of map.enemies) { if (e.dead || !e.raider) continue; const d = Math.hypot(e.x - cx, e.y - cy); if (d < bd) { bd = d; best = e; } }
        if (best) {
          const dmg = GF.BIZ.tower.dmg[b.level - 1] * (1 + (GF.settleLevel(S) - 1) * 0.6);
          C().damageTarget(map, best, dmg, cx, cy, S, { noCrit: true });
          g.spawnParticles('puff', best.x, best.y, { col: '#ffd070' });
        }
      }
    }
    // breach check
    for (const e of map.enemies) {
      if (e.dead || !e.raider) continue;
      if (Math.hypot(e.x - GF.HOME.x, e.y - (GF.HOME.y + 2)) < 5) { e.dead = true; a.breach++; g.spawnParticles('boom', e.x, e.y, { r: 1.5 }); const stolen = Math.floor(S.coins * 0.015); S.coins -= stolen; notify(`A raider reached the settlement and stole ${stolen} Crowns!`, 'warn'); }
    }
    // success: all raiders handled
    const left = map.enemies.filter((e) => e.raider && !e.dead).length;
    if (left === 0 && !a.done) {
      a.done = true;
      const killed = a.total - a.breach;
      const reward = Math.round((300 + 220 * GF.settleLevel(S) * GF.settleLevel(S)) * (killed / a.total) * diff(S).income);
      S.coins += reward; S.stats.earned += reward; GF.addXp(S, 150 * GF.settleLevel(S));
      notify(a.breach === 0 ? `Invasion repelled! +${reward} Crowns.` : `Invasion over (${a.breach} breached). +${reward} Crowns.`, 'event');
      a.until = Math.min(a.until, S.time + 3);
    }
  }
  function endEvent(a) {
    const g = G(), S = g.S, map = g.over;
    if (a.id === 'invasion') for (const e of map.enemies) if (e.raider && !e.dead) { e.dead = true; }
    if (a.nodes) for (const id of a.nodes) { const n = map.nodes[id]; if (n) { n.dead = true; n.perm = true; } }
    if (a.id === 'treasure') S.events.treasure = null;
    if (a.id === 'wanderer') { S.events.wanderer = null; g.refreshNpcs(); }
    if (a.id === 'rift') g.rift = null;
    if (a.id === 'caravan') g.refreshNpcs();
  }

  // ---------------------------------------------------------------- interaction dispatcher
  function interact(t) {
    const g = G(), S = g.S;
    if (t.t === 'chest') { openChest(t.chest); }
    else if (t.t === 'exit') { leave(false); }
    else if (t.t === 'stairs') { enterAbyss(g.map.floor + 1); }
    else if (t.t === 'door') {
      const map = g.map, d = GF.DUNGEONS[map.did];
      const seal = d && d.seal;
      if (!seal || GF.total(S, seal) > 0) {
        const a = map.arena;
        for (let yy = a.door.y - 1; yy <= a.door.y + 2; yy++) for (let xx = a.door.x - 1; xx <= a.door.x + 2; xx++) if (map.tiles[yy * map.W + xx] === GF.T.DSEAL) map.tiles[yy * map.W + xx] = GF.T.DARENA;
        GF.hooks.sound('unlock'); g.spawnParticles('levelup', a.door.x + 1, a.door.y + 1, {}); g.cam.shake = 0.3;
        notify('The seal dissolves. The arena is open...', 'event');
      } else notify(`You need the ${GF.ITEMS[seal].name} (craft it in Crafting > Boss Prep).`, 'warn');
    } else if (t.t === 'treasure') digTreasure();
    else if (t.t === 'rift') enterRift();
  }

  GF.Dungeon = { enter, leave, enterAbyss, interact, tick, overTick, endEvent, bossVictory, rollLoot, enterRift, openChest, BOSS_ORDER };
})(typeof window !== 'undefined' ? window : globalThis);

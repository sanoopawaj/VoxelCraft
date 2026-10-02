// Runtime: main loop, player, interaction, gathering, ground drops and world handling.
(function (root) {
  'use strict';
  const GF = root.GF;
  const U = GF.util;
  const C = () => GF.Combat;
  const diff = (S) => GF.DIFFICULTY[S.diff] || GF.DIFFICULTY.standard;

  const G = GF.G = {
    S: null, over: null, map: null, P: null, cam: { x: 95, y: 75, shake: 0 }, parts: [], texts: [], keys: {}, mouse: { x: 0, y: 0, down: false, wx: 0, wy: 0 },
    paused: false, panel: null, prompt: null, target: null, selSeed: 'wheat', banner: null, lastSave: 0, running: false, over_t: 0, buildMode: null, timers: { biz: 0, q: 0, ach: 0, day: 0, save: 0 },
    msgBagT: 0, npcs: [], dead: false, ending: null, tick: 0,
  };
  const notify = (m, t) => GF.hooks.notify(m, t || 'info');
  const sound = (n) => GF.hooks.sound(n);

  // ---------------------------------------------------------------- hooks used by logic/combat
  Object.assign(GF.hooks, {
    world(name, x, y, o) { spawnParticles(name, x, y, o || {}); },
    floatText(x, y, text, col, big) { if (typeof x === 'string') return; G.texts.push({ x, y, text, col: col || '#fff', t: 0, big: !!big }); },
    shake(a) { G.cam.shake = Math.max(G.cam.shake, a); },
    sound(n) { sound(n); },
    drop(map, item, n, x, y) { addGround(map, item, n, x, y); },
    dropCoins(map, n, x, y) { addGround(map, 'coins', n, x, y); },
    endEvent(a) { endEventWorld(a); },
  });

  // ---------------------------------------------------------------- particles
  function spawnParticles(name, x, y, o) {
    const P = G.parts;
    if (P.length > 600) return;
    const add = (n, spd, life, col, size, up) => { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = spd * (0.3 + Math.random()); P.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (up || 0), life, t: 0, col: col || '#fff', size: size || 3 }); } };
    switch (name) {
      case 'hit': add(5, 3, 0.35, o.col || '#fff', 3); break;
      case 'kill': add(14, 4, 0.6, o.col || '#fff', 4); add(6, 2, 0.8, '#ffe9a0', 3); break;
      case 'chop': add(6, 3, 0.5, o.col || '#a07040', 3, 1); break;
      case 'mine': add(7, 3.5, 0.5, o.col || '#aaa', 3, 1); break;
      case 'break': add(18, 4.5, 0.8, o.col || '#fff', 4, 1.5); break;
      case 'rich': add(12, 2.5, 1.0, '#ffe27a', 3, 1); break;
      case 'coin': add(6, 2.5, 0.6, '#ffd24a', 3, 2); break;
      case 'puff': add(4, 1.5, 0.3, o.col || '#fff', 3); break;
      case 'craft': add(16, 3, 0.8, '#ffe9a0', 3, 1); break;
      case 'build': add(24, 4, 0.9, '#d8c0a0', 4, 1); break;
      case 'levelup': add(40, 6, 1.2, '#ffe27a', 4, 3); break;
      case 'boom': P.push({ x, y, ring: true, r: o.r || 2, life: 0.35, t: 0, col: o.col || '#ff9a3a' }); add(10, 4, 0.5, o.col || '#ff9a3a', 4); break;
      case 'ring': P.push({ x, y, ring: true, r: o.r || 2, life: 0.5, t: 0, col: o.col || '#fff' }); break;
      case 'swipe': break;
      case 'breath': add(24, 6, 0.6, o.col || '#fff', 5); break;
      default: add(4, 2, 0.3, o.col || '#fff', 2);
    }
  }

  // ---------------------------------------------------------------- ground drops (items + coins)
  function addGround(map, item, n, x, y) {
    if (n <= 0) return;
    const a = Math.random() * 6.28, s = 1.5 + Math.random() * 2;
    map.drops.push({ x, y, item, n: Math.floor(n), vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 180 });
    if (map.drops.length > 400) map.drops.shift();
  }
  function updateDrops(dt) {
    const S = G.S, P = G.P, map = G.map;
    const magnet = 2.6 + GF.fx(S, 'magnet');
    for (let i = map.drops.length - 1; i >= 0; i--) {
      const d = map.drops[i];
      d.t += dt;
      if (d.t > d.life) { map.drops.splice(i, 1); continue; }
      const dx = P.x - d.x, dy = P.y - d.y, dist = Math.hypot(dx, dy);
      if (d.t > 0.35 && dist < magnet && !P.dead) {
        const k = (1 - dist / magnet) * 12 + 2.5;
        d.x += dx / dist * k * dt; d.y += dy / dist * k * dt;
      } else {
        const vx = d.vx * dt, vy = d.vy * dt;
        if (!GF.solidTile(map, d.x + vx, d.y)) d.x += vx;
        if (!GF.solidTile(map, d.x, d.y + vy)) d.y += vy;
        d.vx *= 0.9; d.vy *= 0.9;
      }
      if (dist < 0.7 && d.t > 0.25 && !P.dead) {
        if (d.item === 'coins') {
          S.coins += d.n; S.stats.earned += d.n;
          sound('coin'); spawnParticles('coin', d.x, d.y, {});
          G.texts.push({ x: P.x, y: P.y - 1, text: '+' + d.n, col: '#ffd24a', t: 0 });
          map.drops.splice(i, 1);
        } else {
          const left = GF.add(S, d.item, d.n);
          const got = d.n - left;
          if (got > 0) {
            sound('pickup');
            G.texts.push({ x: P.x, y: P.y - 1, text: `+${got} ${GF.ITEMS[d.item].name}`, col: GF.ITEMS[d.item].col, t: 0 });
            autoQuick(d.item);
            if (GF.ITEMS[d.item].slot && !(S.equip[GF.ITEMS[d.item].slot])) GF.autoEquip(S, d.item);
          }
          if (left <= 0) map.drops.splice(i, 1);
          else { d.n = left; if (G.msgBagT <= 0) { notify('Your bag is full! Sell items, craft, or go home to stash.', 'warn'); G.msgBagT = 4; } }
        }
      }
    }
  }
  /** Consumables and seeds appear on the quick bar automatically the first time you get them. */
  function autoQuick(item) {
    const S = G.S, it = GF.ITEMS[item];
    if (!['food', 'potion', 'seed', 'misc'].includes(it.type) || S.quick.includes(item)) return;
    const i = S.quick.indexOf(null);
    if (i >= 0) S.quick[i] = item;
  }

  // ---------------------------------------------------------------- starting / loading
  function setupWorld(S) {
    GF.S = S; G.S = S;
    GF.meta = GF.meta || GF.loadMeta();
    const over = GF.genOverworld(S.seed);
    GF.applyGates(over, S);
    over.enemies = []; over.proj = []; over.tele = []; over.drops = []; over.spawnState = {};
    over.kind = 'over';
    over.spawns.forEach((sp, i) => { const e = C().spawnEnemy(over, sp.type, sp.x, sp.y, { spawnId: i }, S); e.region = sp.region; });
    for (const n of over.nodes) if (S.nodeRespawn[n.id] && S.nodeRespawn[n.id] > S.time) n.dead = true;
    for (const n of over.nodes) { n.shake = 0; }
    G.over = over; G.map = over;
    G.P = { x: S.pos.x, y: S.pos.y, vx: 0, vy: 0, ang: 0, atkT: 0, swing: null, roll: 0, rollDir: [0, 1], invuln: 0, stam: 100, whirlCd: 0, hurt: 0, dead: false, kbx: 0, kby: 0, kbt: 0, slow: 0, walk: 0, spin: 0, gather: null, interactT: 0 };
    if (GF.solidTile(over, G.P.x, G.P.y)) { G.P.x = GF.HOME.x + 0.5; G.P.y = GF.HOME.y + 4.5; }
    G.cam.x = G.P.x; G.cam.y = G.P.y;
    G.parts = []; G.texts = []; G.dead = false; G.ending = null; G.banner = null;
    refreshNpcs();
    GF.refreshDaily(S); GF.refreshOffers(S, true); GF.genBoard(S); GF.genOrders(S);
    S.hp = Math.min(S.hp, GF.maxHp(S)); if (S.hp <= 0) S.hp = GF.maxHp(S);
    G.timers = { biz: 0, q: 0, ach: 0, day: 0, save: 0 };
    GF.checkQuests(S);
  }
  function refreshNpcs() {
    const S = G.S;
    G.npcs = GF.NPCS.filter((n) => GF.condMet(S, n.unlock)).map((n) => Object.assign({}, n));
    if (S.events.caravanUntil > S.time) G.npcs.push({ id: 'caravan', name: 'Caravan Merchant', x: 95.5, y: 64.5, col: '#e8b84a', shop: 'caravan', temp: true });
    if (S.events.wanderer && S.events.active && S.events.active.id === 'wanderer') G.npcs.push({ id: 'wanderer', name: 'Traveling Merchant', x: S.events.wanderer.x, y: S.events.wanderer.y, col: '#e8b84a', shop: 'caravan', temp: true });
    if (S.bosses.giant) G.npcs.push({ id: 'abyss', name: 'The Abyss Gate', x: 99.5, y: 64.5, col: '#a050ff', abyss: true });
  }

  function newGame(opts) {
    GF.meta = GF.loadMeta();
    const S = GF.newState(opts);
    S.slot = opts.slot || 1;
    setupWorld(S);
    notify(`Welcome to Hearthstead, ${S.name}. Something stirs beyond the hills...`, 'info');
    return S;
  }
  function loadSlot(slot) {
    const S = GF.loadGame(slot);
    if (!S) return null;
    S.slot = slot;
    GF.meta = GF.loadMeta();
    const away = Math.max(0, (Date.now() - (S.savedAt || Date.now())) / 1000);
    GF.S = S;
    setupWorld(S);
    const rep = GF.simulateAway(S, away);
    if (rep) { S.away = rep; }
    return S;
  }
  function save(silent) {
    const S = G.S;
    if (!S) return false;
    try {
      if (G.map.kind === 'over') { S.pos.x = G.P.x; S.pos.y = G.P.y; }
      S.nodeRespawn = pruneRespawn(S);
      GF.saveGame(S, S.slot || 1);
      if (!silent) notify('Game saved.', 'info');
      return true;
    } catch (e) {
      console.error(e);
      notify('Save failed (browser storage full or blocked).', 'warn');
      return false;
    }
  }
  function pruneRespawn(S) { const o = {}; for (const k in S.nodeRespawn) if (S.nodeRespawn[k] > S.time) o[k] = S.nodeRespawn[k]; return o; }

  // ---------------------------------------------------------------- player movement + collision
  function blockedByBuilding(x, y, r) {
    if (G.map.kind !== 'over') return false;
    for (const b of G.S.buildings) {
      const d = GF.BUILDINGS[b.type];
      if (d.kind === 'decor' && d.w === 1 && d.h === 1) continue;
      if (x + r > b.x + 0.1 && x - r < b.x + d.w - 0.1 && y + r > b.y + 0.1 && y - r < b.y + d.h - 0.1) return true;
    }
    for (const n of G.npcs) if (Math.hypot(n.x - x, n.y - y) < 0.55 + r) return true;
    return false;
  }
  function tryMove(e, dx, dy, r) {
    if (dx && !C().blockedAt(G.map, e.x + dx, e.y, r) && !blockedByBuilding(e.x + dx, e.y, r)) e.x += dx;
    if (dy && !C().blockedAt(G.map, e.x, e.y + dy, r) && !blockedByBuilding(e.x, e.y + dy, r)) e.y += dy;
  }
  function moveSpeed() { return 5.2 * (1 + GF.fx(G.S, 'speed')); }

  function updatePlayer(dt) {
    const S = G.S, P = G.P, K = G.keys;
    P.atkT -= dt; P.invuln -= dt; P.hurt -= dt; P.whirlCd -= dt; P.slow -= dt; P.interactT -= dt;
    if (P.swing) { P.swing.t += dt; if (P.swing.t > P.swing.dur) P.swing = null; }
    if (P.spin > 0) P.spin -= dt;
    // aim at the mouse
    P.ang = Math.atan2(G.mouse.wy - P.y, G.mouse.wx - P.x);
    let ix = (K.d || K.arrowright ? 1 : 0) - (K.a || K.arrowleft ? 1 : 0), iy = (K.s || K.arrowdown ? 1 : 0) - (K.w || K.arrowup ? 1 : 0);
    const moving = ix !== 0 || iy !== 0;
    if (moving) { const l = Math.hypot(ix, iy); ix /= l; iy /= l; }
    if (P.roll > 0) {
      P.roll -= dt;
      tryMove(P, P.rollDir[0] * 11.5 * dt, P.rollDir[1] * 11.5 * dt, 0.3);
    } else {
      const sp = moveSpeed() * (P.slow > 0 ? 0.5 : 1) * (P.gather ? 0.6 : 1);
      tryMove(P, ix * sp * dt, iy * sp * dt, 0.3);
      if (moving) P.walk += dt * 9;
    }
    if (P.kbt > 0) { P.kbt -= dt; tryMove(P, P.kbx * dt, P.kby * dt, 0.3); }
    P.stam = Math.min(100, P.stam + 38 * dt);
    // lava hurts
    if (G.map.kind === 'over' && GF.tileAt(G.map, P.x, P.y) === GF.T.LAVA) { if (P.invuln <= 0) { C().hurtPlayer(G.map, P, S, GF.maxHp(S) * 0.06, P.x, P.y + 0.5, 'lava'); } }
    // natural regen out of combat is slow; food/potions do the work
    S.hp = Math.min(GF.maxHp(S), S.hp + GF.maxHp(S) * 0.004 * dt * (G.map.kind === 'over' && GF.nearHome(S, P.x, P.y) ? 6 : 1));
    // region discovery
    if (G.map.kind === 'over') {
      const rg = GF.regionAt(G.map, P.x, P.y);
      if (rg && rg !== P.region) { P.region = rg; if (!S.discovered[rg]) { S.discovered[rg] = true; notify(`Discovered: ${GF.REGIONS[rg].name}!`, 'unlock'); G.banner = { t: 0, title: GF.REGIONS[rg].name, sub: GF.REGIONS[rg].blurb }; GF.hooks.fx('unlock'); } else G.banner = { t: 0, title: GF.REGIONS[rg].name, sub: '' }; }
      // fog of war cells
      const cx = Math.floor(P.x / 6), cy = Math.floor(P.y / 6);
      S.fog = S.fog || {};
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) S.fog[(cx + i) + ',' + (cy + j)] = 1;
    }
  }

  function dodge() {
    const S = G.S, P = G.P, K = G.keys;
    if (P.roll > 0 || P.stam < 25 || P.dead || G.panel) return;
    let ix = (K.d ? 1 : 0) - (K.a ? 1 : 0), iy = (K.s ? 1 : 0) - (K.w ? 1 : 0);
    if (!ix && !iy) { ix = Math.cos(P.ang); iy = Math.sin(P.ang); }
    const l = Math.hypot(ix, iy);
    P.rollDir = [ix / l, iy / l]; P.roll = 0.28; P.stam -= 25; P.invuln = Math.max(P.invuln, 0.34);
    sound('dodge');
  }

  // ---------------------------------------------------------------- gathering + attacking
  function nodeInReach(P, n) {
    if (n.dead) return false;
    const nd = GF.NODES[n.type];
    const dx = n.x - P.x, dy = n.y - P.y, d = Math.hypot(dx, dy);
    if (d > 1.7 + nd.r) return false;
    return d < 0.9 || Math.abs(C().angDiff(Math.atan2(dy, dx), P.ang)) < 1.15;
  }
  function hitNode(n) {
    const S = G.S, P = G.P, nd = GF.NODES[n.type];
    const kind = nd.tool;
    const tier = GF.toolTier(S, kind);
    if (tier < nd.tier) {
      if (G.msgNodeT === undefined || G.msgNodeT <= 0) { notify(`${nd.name} needs a ${kind === 'axe' ? 'tier ' + nd.tier + ' axe' : 'tier ' + nd.tier + ' pickaxe'} (yours: tier ${tier}).`, 'warn'); G.msgNodeT = 2.5; }
      sound('bump'); n.shake = 0.2;
      return;
    }
    const power = GF.toolPower(S, kind) * (n.rich ? 1 : 1);
    n.hp -= power;
    n.shake = 0.18;
    sound(kind === 'axe' ? 'chop' : 'mine');
    spawnParticles(kind === 'axe' ? 'chop' : 'mine', n.x, n.y, { col: nd.col });
    if (n.hp <= 0) harvestNode(n);
  }
  function harvestNode(n) {
    const S = G.S, P = G.P, nd = GF.NODES[n.type], map = G.map;
    n.dead = true;
    const luck = GF.fx(S, 'luck');
    const mult = (n.rich ? 3 : 1) * GF.eventNodeBonus(S) * (1 + GF.fx(S, 'income') * 0);
    for (const [item, mn, mx, ch] of nd.drops) {
      if (ch !== undefined && Math.random() > ch) continue;
      let q = mn + Math.floor(Math.random() * (mx - mn + 1));
      q = Math.round(q * mult);
      if (Math.random() < luck) q *= 2;
      if (q <= 0) continue;
      const left = GF.add(S, item, q);
      if (left > 0) addGround(map, item, left, n.x, n.y);
      G.texts.push({ x: n.x, y: n.y - 0.8, text: `+${q - left} ${GF.ITEMS[item].name}`, col: GF.ITEMS[item].col, t: 0 });
      autoQuick(item);
    }
    GF.addXp(S, nd.xp * (n.rich ? 2 : 1));
    S.stats.nodes++;
    if (!nd.temp) S.nodeRespawn[n.id] = S.time + nd.resp * (0.8 + Math.random() * 0.4);
    spawnParticles('break', n.x, n.y, { col: nd.col });
    if (n.rich) spawnParticles('rich', n.x, n.y, {});
    sound(nd.tier >= 3 ? 'rare' : 'pickup');
    if (nd.tier >= 4) G.cam.shake = Math.max(G.cam.shake, 0.12);
  }
  function actionAttack() {
    const S = G.S, P = G.P, map = G.map;
    if (P.atkT > 0 || P.dead || G.panel) return;
    // is an enemy in front? otherwise try resources
    const w = GF.weapon(S);
    const k = w ? GF.KIND[w.kind] : { range: 1.3, arc: 1.6, cd: 0.45 };
    let enemyNear = false;
    for (const e of map.enemies) {
      if (e.dead) continue;
      const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy);
      if (k.proj ? d < 12 && Math.abs(C().angDiff(Math.atan2(dy, dx), P.ang)) < 0.6 : d < k.range + e.r + 0.4) { enemyNear = true; break; }
    }
    if (!enemyNear && map.kind === 'over') {
      let best = null, bd = 99;
      for (const n of GF.nodesNear(map, P.x, P.y, 3)) {
        if (!nodeInReach(P, n)) continue;
        const d = Math.hypot(n.x - P.x, n.y - P.y);
        if (d < bd) { bd = d; best = n; }
      }
      if (best) {
        const kind = GF.NODES[best.type].tool;
        P.atkT = 0.42 / (1 + GF.fx(S, 'gather') * 0.3);
        P.swing = { t: 0, dur: 0.22, ang: P.ang, kind: kind === 'hand' ? 'fist' : kind, tier: GF.toolTier(S, kind) };
        hitNode(best);
        return;
      }
    }
    P.atkT = C().playerAttack(map, P, S);
  }
  function actionWhirl() {
    const S = G.S, P = G.P;
    if (P.dead || G.panel || P.whirlCd > 0 || P.stam < 30) return;
    if (!(S.skills.whirlwind > 0)) { if (!G.whirlMsg) { notify('Learn Whirlwind in the Skills panel (K) at level 10.', 'info'); G.whirlMsg = true; } return; }
    if (C().whirlwind(G.map, P, S)) { P.whirlCd = Math.max(4, 14 - 1.8 * S.skills.whirlwind); P.stam -= 30; }
  }

  // ---------------------------------------------------------------- consumables / quick bar
  function useItem(id) {
    const S = G.S, it = GF.ITEMS[id];
    if (!it || GF.count(S, id) < 1) return false;
    if (it.heal) {
      if (S.hp >= GF.maxHp(S)) { notify('You are already at full health.', 'info'); return false; }
      GF.remove(S, id, 1);
      S.hp = Math.min(GF.maxHp(S), S.hp + it.heal);
      G.texts.push({ x: G.P.x, y: G.P.y - 1, text: '+' + it.heal, col: '#7aff8a', t: 0 });
      sound('eat'); return true;
    }
    if (it.buff) {
      GF.remove(S, id, 1);
      const dur = it.buff === 'supreme' ? 300 : 180;
      S.buffs[it.buff] = S.time + dur;
      notify(`${it.name} active for ${dur / 60} min.`, 'info'); sound('eat'); return true;
    }
    if (id === 'recall_scroll') {
      if (G.map.kind !== 'over') { notify('Scrolls cannot recall you from inside a dungeon. Use the exit portal.', 'warn'); return false; }
      GF.remove(S, id, 1);
      G.P.x = GF.HOME.x + 0.5; G.P.y = GF.HOME.y + 4.5; G.cam.x = G.P.x; G.cam.y = G.P.y;
      spawnParticles('levelup', G.P.x, G.P.y, {}); sound('unlock'); notify('You return home.', 'info'); return true;
    }
    if (it.type === 'seed') { G.selSeed = it.crop; notify(`Selected ${GF.ITEMS[it.crop].name} for planting. Stand on a field plot and press E.`, 'info'); return true; }
    return false;
  }
  function quickUse(i) { const id = G.S.quick[i]; if (id) useItem(id); }

  // ---------------------------------------------------------------- interaction targeting
  function findTarget() {
    const S = G.S, P = G.P, map = G.map;
    let best = null, bd = 99;
    const consider = (o, d, t) => { if (d < bd) { bd = d; best = Object.assign({ d }, o, { t }); } };
    if (map.kind === 'over') {
      for (const n of G.npcs) consider({ npc: n, label: n.name, key: 'E' }, Math.hypot(n.x - P.x, n.y - P.y) - 0.2, 'npc');
      for (const b of S.buildings) {
        const d = GF.BUILDINGS[b.type];
        const cx = U.clamp(P.x, b.x, b.x + d.w), cy = U.clamp(P.y, b.y, b.y + d.h);
        const dd = Math.hypot(P.x - cx, P.y - cy);
        if (dd < 1.25 && d.kind !== 'decor') consider({ b, label: `${d.name} (Lv ${b.level})`, key: 'E' }, dd + 0.4, b.plots ? 'field' : 'building');
      }
      for (const tb of G.over.tablets) if (!S.tablets[tb.id]) consider({ tablet: tb, label: 'Ancient Tablet', key: 'E' }, Math.hypot(tb.x - P.x, tb.y - P.y), 'tablet');
      for (const pt of G.over.portals) consider({ portal: pt, label: GF.DUNGEONS[pt.dungeon].name + (S.discovered[pt.region] ? '' : ''), key: 'E' }, Math.hypot(pt.x - P.x, pt.y - P.y) - 0.5, 'portal');
      for (const st of G.over.stones) consider({ stone: st, label: (S.flags['stone_' + st.region] ? 'Portal Stone (attuned)' : 'Portal Stone: attune'), key: 'E' }, Math.hypot(st.x - P.x, st.y - P.y), 'stone');
      const tr = S.events.treasure;
      if (tr && S.events.active && S.events.active.id === 'treasure') consider({ treasure: tr, label: 'Dig up treasure', key: 'E' }, Math.hypot(tr.x - P.x, tr.y - P.y), 'treasure');
      if (G.rift && S.events.active && S.events.active.id === 'rift') consider({ rift: G.rift, label: 'Dungeon Rift', key: 'E' }, Math.hypot(G.rift.x - P.x, G.rift.y - P.y) - 0.5, 'rift');
    } else {
      for (const c of map.chests) if (!c.open) consider({ chest: c, label: 'Open chest', key: 'E' }, Math.hypot(c.x - P.x, c.y - P.y), 'chest');
      consider({ exit: true, label: 'Exit dungeon', key: 'E' }, Math.hypot(map.start.x - P.x, map.start.y - P.y), 'exit');
      if (map.exitPortal) consider({ exit: true, label: 'Leave the arena', key: 'E' }, Math.hypot(map.exitPortal.x - P.x, map.exitPortal.y - P.y), 'exit');
      if (map.stairs) consider({ stairs: true, label: 'Descend to floor ' + (map.floor + 1), key: 'E' }, Math.hypot(map.stairs.x - P.x, map.stairs.y - P.y), 'stairs');
      const a = map.arena;
      if (a && a.door) {
        const sealed = map.tiles[a.door.y * map.W + a.door.x] === GF.T.DSEAL;
        if (sealed) consider({ door: a.door, label: 'Sealed arena door', key: 'E' }, Math.hypot(a.door.x + 1 - P.x, a.door.y + 1 - P.y) - 0.5, 'door');
      }
    }
    G.target = bd < 2.0 ? best : null;
    return G.target;
  }
  function interact() {
    const S = G.S, P = G.P, t = G.target;
    if (!t || P.dead) return;
    if (t.t === 'npc') {
      if (t.npc.shop) GF.UI.openShop(t.npc.shop, t.npc);
      else if (t.npc.board) GF.UI.openBoard();
      else if (t.npc.abyss) GF.UI.openAbyss();
    } else if (t.t === 'building') GF.UI.openBuilding(t.b);
    else if (t.t === 'field') { fieldAction(t.b); }
    else if (t.t === 'tablet') { readTablet(t.tablet); }
    else if (t.t === 'portal') GF.UI.openPortal(t.portal);
    else if (t.t === 'stone') { S.flags['stone_' + t.stone.region] = true; notify(`Portal Stone attuned: ${GF.REGIONS[t.stone.region].name}.`, 'unlock'); spawnParticles('levelup', t.stone.x, t.stone.y, {}); sound('unlock'); }
    else if (GF.Dungeon) GF.Dungeon.interact(t);
  }
  function readTablet(tb) {
    const S = G.S;
    S.tablets[tb.id] = true;
    const t = GF.TABLETS.find((x) => x.id === tb.id);
    notify(`Tablet found: "${t.title}" (${Object.keys(S.tablets).length}/12). Read it in the Journal (J).`, 'unlock');
    GF.addXp(S, 150 + 60 * GF.REGIONS[t.region].tier);
    S.rp += 10;
    sound('unlock'); spawnParticles('levelup', tb.x, tb.y, {});
    GF.UI.showLore(t);
  }

  function nearestPlot(b) {
    const P = G.P;
    let best = -1, bd = 99;
    for (let i = 0; i < 9; i++) {
      const px = b.x + (i % 3) + 0.5, py = b.y + Math.floor(i / 3) + 0.5;
      const d = Math.hypot(px - P.x, py - P.y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function fieldAction(b, idx) {
    const S = G.S;
    if (P_busy()) return;
    idx = idx === undefined ? nearestPlot(b) : idx;
    const p = b.plots[idx];
    G.P.interactT = 0.22;
    if (p.crop && p.prog >= 1) { const r = GF.harvest(S, b.uid, idx); if (r.ok) { sound('pickup'); const px = b.x + (idx % 3) + 0.5, py = b.y + Math.floor(idx / 3) + 0.5; spawnParticles('craft', px, py, {}); G.texts.push({ x: px, y: py - 0.5, text: `+${r.n} ${GF.ITEMS[r.crop].name}`, col: GF.ITEMS[r.crop].col, t: 0 }); } else notify(r.msg, 'warn'); return; }
    if (!p.crop) { const r = GF.plant(S, b.uid, idx, G.selSeed); if (r.ok) sound('place'); else notify(r.msg, 'warn'); return; }
    if (!(p.water > 0)) { GF.water(S, b.uid, idx); sound('water'); return; }
    if (GF.count(S, 'bonemeal') > 0 && GF.fertilize(S, b.uid, idx)) { sound('place'); return; }
    notify('This crop is growing. Come back when it is ripe!', 'info');
  }
  function P_busy() { return G.P.interactT > 0; }

  // ---------------------------------------------------------------- update loop
  function update(dt) {
    const S = G.S, P = G.P, map = G.map;
    G.tick++;
    G.msgBagT -= dt; if (G.msgNodeT !== undefined) G.msgNodeT -= dt;
    S.time += dt; S.playTime += dt;
    // death
    if (P.dead) { if (!G.dead) onDeath(); }
    else {
      updatePlayer(dt);
      if (G.mouse.down && !G.panel) actionAttack();
      if (G.keys[' '] && !G.panel) actionAttack();
      findTarget();
      if (G.keys.e && G.target && G.target.t === 'field' && !G.panel) { if (P.interactT <= 0) fieldAction(G.target.b); }
    }
    // world sim
    C().updateEnemies(map, P, S, dt);
    C().updateProjectiles(map, P, S, dt);
    C().updateTelegraphs(map, P, S, dt);
    if (map.kind === 'over') {
      respawnEnemies();
      for (const n of map.nodes) { if (n.shake > 0) n.shake -= dt; if (n.dead && !n.perm && !GF.NODES[n.type].temp && S.nodeRespawn[n.id] !== undefined && S.nodeRespawn[n.id] <= S.time) { n.dead = false; n.hp = n.max; } }
      if (GF.Dungeon) GF.Dungeon.overTick(dt);
    } else if (GF.Dungeon) GF.Dungeon.tick(dt);
    updateDrops(dt);
    // economy / tycoon at 4 Hz
    G.timers.biz += dt;
    if (G.timers.biz >= 0.25) {
      const step = G.timers.biz; G.timers.biz = 0;
      GF.tickBusinesses(S, step);
      GF.marketTick(S, step);
      GF.eventTick(S, step);
      GF.refreshOffers(S);
      if (G.tick % 6 === 0) refreshNpcsIfNeeded();
    }
    G.timers.day += dt;
    if (G.timers.day > 2) { G.timers.day = 0; GF.refreshDaily(S); GF.genBoard(S); GF.genOrders(S); }
    G.timers.q += dt;
    if (G.timers.q > 0.5) { G.timers.q = 0; GF.checkQuests(S); }
    G.timers.ach += dt;
    if (G.timers.ach > 3) { G.timers.ach = 0; GF.checkAchievements(S); }
    // buffs/particles/texts
    for (const p of G.parts) { p.t += dt; if (!p.ring) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93; } }
    G.parts = G.parts.filter((p) => p.t < p.life);
    for (const t of G.texts) t.t += dt;
    G.texts = G.texts.filter((t) => t.t < 1.1);
    G.cam.shake = Math.max(0, G.cam.shake - dt * 1.6);
    // camera
    G.cam.x += (P.x - G.cam.x) * Math.min(1, dt * 9); G.cam.y += (P.y - G.cam.y) * Math.min(1, dt * 9);
    if (G.banner) { G.banner.t += dt; if (G.banner.t > 3) G.banner = null; }
    // autosave
    G.timers.save += dt;
    if (G.timers.save > 45) { G.timers.save = 0; if (map.kind === 'over' && !map.boss) save(true); }
    if (G.ending) { G.ending.t += dt; }
  }
  let npcSig = '';
  function refreshNpcsIfNeeded() {
    const S = G.S;
    const sig = GF.NPCS.filter((n) => GF.condMet(S, n.unlock)).length + '|' + (S.events.caravanUntil > S.time) + '|' + (S.events.active && S.events.active.id) + '|' + !!S.bosses.giant;
    if (sig !== npcSig) { npcSig = sig; refreshNpcs(); }
  }
  function respawnEnemies() {
    const S = G.S, P = G.P, map = G.over;
    if (G.tick % 30 !== 0) return;
    for (const k in map.spawnState) {
      const st = map.spawnState[k];
      const sp = map.spawns[k];
      if (S.time >= st.respawn && Math.hypot(sp.x - P.x, sp.y - P.y) > 24) {
        const e = C().spawnEnemy(map, sp.type, sp.x, sp.y, { spawnId: Number(k) }, S);
        e.region = sp.region;
        delete map.spawnState[k];
      }
    }
  }
  function onDeath() {
    const S = G.S, P = G.P;
    G.dead = true;
    S.stats.deaths++;
    const d = diff(S);
    let lostCoins = 0;
    if (d.death > 0) {
      lostCoins = Math.floor(S.coins * d.death);
      S.coins -= lostCoins;
      if (S.diff === 'hardcore') for (const k in S.inv) { const l = Math.floor(S.inv[k] * 0.15); if (l > 0) GF.remove(S, k, l); }
    }
    G.deathInfo = { by: P.deathBy || 'something', lost: lostCoins };
    sound('death');
    GF.UI.showDeath(G.deathInfo);
  }
  function respawn() {
    const S = G.S, P = G.P;
    if (G.map.kind !== 'over' && GF.Dungeon) GF.Dungeon.leave(true);
    P.dead = false; G.dead = false;
    S.hp = GF.maxHp(S);
    P.x = GF.HOME.x + 0.5; P.y = GF.HOME.y + 4.5; P.invuln = 2; P.roll = 0;
    G.cam.x = P.x; G.cam.y = P.y;
    G.map.proj.length = 0; G.map.tele.length = 0;
    GF.UI.hideDeath();
  }
  function endEventWorld(a) { if (GF.Dungeon && GF.Dungeon.endEvent) GF.Dungeon.endEvent(a); }

  // ---------------------------------------------------------------- build mode helpers (used by UI + render)
  function screenToWorld(sx, sy, w, h) {
    const sc = G.scale || 40;
    G.mouse.wx = G.cam.x + (sx - w / 2) / sc;
    G.mouse.wy = G.cam.y + (sy - h / 2) / sc;
  }
  function tryPlace() {
    const bm = G.buildMode;
    if (!bm) return;
    const d = GF.BUILDINGS[bm.type];
    const x = Math.round(G.mouse.wx - d.w / 2), y = Math.round(G.mouse.wy - d.h / 2);
    // don't trap the player inside the footprint
    const P = G.P;
    if (P.x > x - 0.3 && P.x < x + d.w + 0.3 && P.y > y - 0.3 && P.y < y + d.h + 0.3) { notify('Step out of the way first!', 'warn'); return; }
    const r = GF.build(G.S, bm.type, x, y);
    if (r.ok) { sound('build'); spawnParticles('build', x + d.w / 2, y + d.h / 2, {}); G.cam.shake = 0.1; notify(r.msg, 'info'); GF.checkQuests(G.S); if (!(G.keys.shift)) G.buildMode = null; }
    else { notify(r.msg, 'warn'); sound('bump'); }
  }

  Object.assign(G, { update, newGame, loadSlot, save, setupWorld, actionAttack, actionWhirl, dodge, interact, useItem, quickUse, addGround, spawnParticles, respawn, screenToWorld, tryPlace, findTarget, nearestPlot, fieldAction, refreshNpcs, tryMove, readTablet });
})(typeof window !== 'undefined' ? window : globalThis);

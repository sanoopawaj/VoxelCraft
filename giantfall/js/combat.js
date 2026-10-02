// Combat: enemies, projectiles, telegraphed attacks and the boss framework. DOM-free.
(function (root) {
  'use strict';
  const GF = root.GF;
  const U = GF.util;
  const H = () => GF.hooks;
  const diff = (S) => GF.DIFFICULTY[S.diff] || GF.DIFFICULTY.standard;
  const angTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

  // ---------------------------------------------------------------- collision
  function blockedAt(map, x, y, r) {
    for (const [dx, dy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) if (GF.solidTile(map, x + dx, y + dy)) return true;
    if (map.kind === 'over') {
      for (const n of GF.nodesNear(map, x, y, 2)) {
        if (n.dead) continue;
        const nr = GF.NODES[n.type].r;
        if (Math.hypot(n.x - x, n.y - y) < nr + r * 0.8) return true;
      }
    }
    return false;
  }
  function moveBody(map, e, dx, dy, r) {
    r = r === undefined ? e.r : r;
    if (dx && !blockedAt(map, e.x + dx, e.y, r)) e.x += dx;
    if (dy && !blockedAt(map, e.x, e.y + dy, r)) e.y += dy;
  }

  // ---------------------------------------------------------------- enemies
  function spawnEnemy(map, type, x, y, opt, S) {
    const d = GF.ENEMIES[type];
    const el = !!(opt && opt.elite);
    const sc = (opt && opt.scale) || 1;
    const df = diff(S);
    const hp = Math.round(d.hp * df.enemyHp * sc * (el ? 2.2 : 1));
    const e = {
      kind: 'enemy', type, def: d, x, y, vx: 0, vy: 0, hp, max: hp, r: d.r * (el ? 1.25 : 1), elite: el, state: 'idle', t: 0, cd: 1 + Math.random() * 2,
      home: { x, y }, dmg: d.dmg * df.enemyDmg * sc * (el ? 1.35 : 1), flash: 0, dir: Math.random() * 6.28, spawnId: opt && opt.spawnId, wander: 0, face: 0, kb: { x: 0, y: 0, t: 0 },
      sc, dash: null,
    };
    if (opt && opt.hostileAll) e.def = Object.assign({}, d, { aggro: 40 });
    map.enemies.push(e);
    return e;
  }

  function hurtPlayer(map, P, S, raw, srcX, srcY, name) {
    if (P.invuln > 0 || P.roll > 0 || P.dead) return false;
    const df = diff(S);
    let d = raw * 80 / (80 + GF.defense(S));
    d = Math.max(1, Math.round(d));
    S.hp -= d;
    P.invuln = 0.55;
    P.hurt = 0.25;
    const a = angTo(srcX, srcY, P.x, P.y);
    P.kbx = Math.cos(a) * 5; P.kby = Math.sin(a) * 5; P.kbt = 0.12;
    if (map.boss) map.boss.hitTaken = true;
    H().floatText && H().floatText(P.x, P.y - 0.8, '-' + d, '#ff5a5a');
    H().sound && H().sound('hurt');
    H().shake && H().shake(0.12 + Math.min(0.4, d / 400));
    if (S.hp <= 0) { S.hp = 0; P.dead = true; P.deathBy = name || 'something'; }
    return true;
  }

  function enemyDrops(map, e, S) {
    const d = e.def;
    const luck = GF.fx(S, 'luck');
    const mult = e.elite ? 2 : 1;
    const ev = GF.eventNodeBonus ? 1 : 1;
    for (const [item, ch, mn, mx] of d.drops) {
      if (Math.random() < Math.min(0.98, ch * (e.elite ? 1.6 : 1) * (1 + luck))) {
        let n = mn + Math.floor(Math.random() * (mx - mn + 1));
        if (Math.random() < luck) n *= 2;
        H().drop && H().drop(map, item, n * mult, e.x, e.y);
      }
    }
    const c = d.coins[0] + Math.floor(Math.random() * (d.coins[1] - d.coins[0] + 1));
    const coins = Math.round(c * mult * diff(S).income * (1 + GF.fx(S, 'income')) * (1 + (e.sc - 1) * 0.5));
    if (coins > 0) H().dropCoins && H().dropCoins(map, coins, e.x, e.y);
  }
  function killEnemy(map, e, S) {
    e.dead = true;
    S.stats.killed[e.type] = (S.stats.killed[e.type] || 0) + 1;
    GF.addXp(S, e.def.xp * (e.elite ? 2.5 : 1) * (1 + (e.sc - 1) * 0.4));
    enemyDrops(map, e, S);
    const leech = GF.fx(S, 'leech');
    if (leech > 0) S.hp = Math.min(GF.maxHp(S), S.hp + GF.maxHp(S) * leech);
    H().world && H().world('kill', e.x, e.y, { col: e.def.col, r: e.r });
    H().sound && H().sound('kill');
    if (e.spawnId !== undefined && map.spawnState) map.spawnState[e.spawnId] = { respawn: S.time + 90 + Math.random() * 60 };
  }
  /** Returns true when the target died. */
  function damageTarget(map, e, dmg, fromX, fromY, S, opt) {
    if (e.dead || e.invuln > 0) return false;
    if (e.isBoss && e.shielded) { H().floatText && H().floatText(e.x, e.y - e.r, 'SHIELDED', '#9ad'); return false; }
    let crit = false;
    if (!(opt && opt.noCrit)) {
      const cc = 0.05 + GF.fx(S, 'crit');
      if (Math.random() < cc) { dmg *= 2.2; crit = true; }
    }
    if (e.isGiant) dmg *= giantMult(S);
    if (e.armor && !(opt && opt.bane)) dmg *= e.armor;
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg;
    e.flash = 0.12;
    if (!e.isBoss) {
      const a = angTo(fromX, fromY, e.x, e.y);
      const kb = (opt && opt.kb) || 4;
      e.kb.x = Math.cos(a) * kb; e.kb.y = Math.sin(a) * kb; e.kb.t = 0.12;
      if (e.state === 'idle' || e.state === 'leash') { e.state = 'chase'; }
    }
    H().floatText && H().floatText(e.x + (Math.random() - 0.5) * 0.5, e.y - e.r - 0.2, String(dmg), crit ? '#ffd24a' : '#ffffff', crit);
    H().sound && H().sound(crit ? 'crit' : 'hit');
    H().world && H().world('hit', e.x, e.y, { col: e.isBoss ? e.col : e.def.col });
    if (e.hp <= 0) {
      if (e.isBoss) { /* bosses die through updateBoss */ e.hp = 0; return true; }
      killEnemy(map, e, S);
      return true;
    }
    return false;
  }

  function enemyShoot(map, e, ang, speed, dmg, col, r) {
    map.proj.push({ x: e.x, y: e.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: r || 0.2, dmg, life: 3.2, col: col || '#f55', friendly: false, from: e.def ? e.def.name : 'a boss' });
  }

  function updateEnemy(map, e, P, S, dt) {
    e.flash = Math.max(0, e.flash - dt);
    e.t += dt; e.cd -= dt;
    const d = e.def;
    const dx = P.x - e.x, dy = P.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (e.kb.t > 0) { e.kb.t -= dt; moveBody(map, e, e.kb.x * dt, e.kb.y * dt); return; }
    const toHome = Math.hypot(e.home.x - e.x, e.home.y - e.y);
    const aggro = (map.kind === 'dungeon' ? d.aggro * 1.2 : d.aggro) * (GF.isNight(S) && map.kind === 'over' ? 1.25 : 1);
    if (!P.dead && dist < aggro && toHome < (map.kind === 'dungeon' ? 60 : 26) && e.state !== 'windup' && e.state !== 'dash' && e.state !== 'recover') e.state = 'chase';
    else if ((P.dead || dist > aggro * 1.6 || toHome > 30) && (e.state === 'chase')) e.state = 'leash';
    const spd = d.spd * (e.elite ? 1.1 : 1);
    switch (e.state) {
      case 'idle': {
        e.wander -= dt;
        if (e.wander <= 0) { e.wander = 1.5 + Math.random() * 3; e.dir = Math.random() * 6.28; e.moving = Math.random() < 0.55; }
        if (e.moving && toHome < 8) moveBody(map, e, Math.cos(e.dir) * spd * 0.35 * dt, Math.sin(e.dir) * spd * 0.35 * dt);
        else if (toHome > 8) e.dir = angTo(e.x, e.y, e.home.x, e.home.y);
        break;
      }
      case 'leash': {
        const a = angTo(e.x, e.y, e.home.x, e.home.y);
        moveBody(map, e, Math.cos(a) * spd * dt, Math.sin(a) * spd * dt);
        if (toHome < 1.5) { e.state = 'idle'; e.hp = Math.min(e.max, e.hp + e.max * 0.5); }
        break;
      }
      case 'chase': {
        const a = Math.atan2(dy, dx);
        e.face = a;
        if (d.ai === 'ranged') {
          const want = (d.range || 7) * 0.75;
          const dir = dist > want + 1 ? 1 : dist < want - 2 ? -1 : 0;
          const perp = Math.sin(e.t * 0.9) * 0.5;
          moveBody(map, e, (Math.cos(a) * dir + Math.cos(a + 1.57) * perp) * spd * dt, (Math.sin(a) * dir + Math.sin(a + 1.57) * perp) * spd * dt);
          if (e.cd <= 0 && dist < (d.range || 7) + 1) { e.state = 'windup'; e.t = 0; e.wind = 0.45; e.kind2 = 'shoot'; }
        } else if (d.ai === 'charger') {
          moveBody(map, e, Math.cos(a) * spd * 0.8 * dt, Math.sin(a) * spd * 0.8 * dt);
          if (dist < 6 && dist > 2 && e.cd <= 0) { e.state = 'windup'; e.t = 0; e.wind = 0.55; e.kind2 = 'dash'; e.dashAng = a; }
          else if (dist < e.r + 0.9 && e.cd <= 0) { e.state = 'windup'; e.t = 0; e.wind = 0.4; e.kind2 = 'bite'; }
        } else {
          if (dist > e.r + 0.7) moveBody(map, e, Math.cos(a) * spd * dt, Math.sin(a) * spd * dt);
          if (dist < e.r + 1.0 && e.cd <= 0) { e.state = 'windup'; e.t = 0; e.wind = 0.45; e.kind2 = 'bite'; }
        }
        break;
      }
      case 'windup': {
        e.face = Math.atan2(dy, dx);
        if (e.t >= e.wind) {
          if (e.kind2 === 'shoot') {
            enemyShoot(map, e, e.face, 6.5 + e.def.dmg * 0.01, e.dmg, e.def.col);
            if (e.elite) { enemyShoot(map, e, e.face + 0.25, 6.5, e.dmg * 0.7, e.def.col); enemyShoot(map, e, e.face - 0.25, 6.5, e.dmg * 0.7, e.def.col); }
            e.state = 'recover'; e.t = 0; e.wind = 0.5; e.cd = 1.7 + Math.random() * 0.8;
          } else if (e.kind2 === 'dash') { e.state = 'dash'; e.t = 0; e.hitDash = false; }
          else {
            if (dist < e.r + 1.5) hurtPlayer(map, P, S, e.dmg, e.x, e.y, d.name);
            H().world && H().world('swipe', e.x, e.y, { ang: e.face });
            e.state = 'recover'; e.t = 0; e.wind = 0.5; e.cd = 1.1 + Math.random() * 0.6;
          }
        }
        break;
      }
      case 'dash': {
        const sp = spd * 3.6;
        moveBody(map, e, Math.cos(e.dashAng) * sp * dt, Math.sin(e.dashAng) * sp * dt);
        if (!e.hitDash && dist < e.r + 0.6) { e.hitDash = true; hurtPlayer(map, P, S, e.dmg * 1.1, e.x, e.y, d.name); }
        if (e.t > 0.5) { e.state = 'recover'; e.t = 0; e.wind = 0.8; e.cd = 2.0; }
        break;
      }
      case 'recover': if (e.t >= (e.wind || 0.5)) e.state = 'chase'; break;
      default: e.state = 'idle';
    }
  }

  function updateEnemies(map, P, S, dt) {
    const es = map.enemies;
    for (let i = es.length - 1; i >= 0; i--) {
      const e = es[i];
      if (e.dead) { es.splice(i, 1); continue; }
      if (e.isBoss) continue;
      if (Math.abs(e.x - P.x) > 45 || Math.abs(e.y - P.y) > 35) continue; // far enemies sleep
      updateEnemy(map, e, P, S, dt);
    }
    // gentle separation so packs spread out
    const act = es.filter((e) => !e.dead && !e.isBoss && Math.abs(e.x - P.x) < 22 && Math.abs(e.y - P.y) < 16);
    for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
      const a = act[i], b = act[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (d > 0.001 && d < m) { const push = (m - d) * 0.5; moveBody(map, a, -dx / d * push * 0.5, -dy / d * push * 0.5); moveBody(map, b, dx / d * push * 0.5, dy / d * push * 0.5); }
    }
  }

  // ---------------------------------------------------------------- projectiles + telegraphs
  function updateProjectiles(map, P, S, dt) {
    const ps = map.proj;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      let kill = p.life <= 0 || GF.solidTile(map, p.x, p.y);
      if (!kill) {
        if (p.friendly) {
          for (const e of map.enemies) {
            if (e.dead || p.hit && p.hit.has(e)) continue;
            if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r) {
              damageTarget(map, e, p.dmg, p.x - p.vx, p.y - p.vy, S, { bane: p.bane });
              kill = true; break;
            }
          }
        } else if (!P.dead && Math.hypot(P.x - p.x, P.y - p.y) < 0.4 + p.r) {
          if (hurtPlayer(map, P, S, p.dmg, p.x - p.vx * 0.1, p.y - p.vy * 0.1, p.from)) kill = true;
          else if (P.roll > 0) { /* dodged */ }
        }
      }
      if (kill) { H().world && H().world('puff', p.x, p.y, { col: p.col }); ps.splice(i, 1); }
    }
  }
  function updateTelegraphs(map, P, S, dt) {
    const ts = map.tele;
    for (let i = ts.length - 1; i >= 0; i--) {
      const t = ts[i];
      t.t += dt;
      if (t.kind === 'circle') {
        if (t.t >= t.dur) {
          if (Math.hypot(P.x - t.x, P.y - t.y) < t.r + 0.3 && !P.dead) hurtPlayer(map, P, S, t.dmg, t.x, t.y, t.from);
          H().world && H().world('boom', t.x, t.y, { r: t.r, col: t.col });
          H().shake && H().shake(0.15);
          if (t.then) t.then(t);
          ts.splice(i, 1);
        }
      } else if (t.kind === 'cone') {
        if (t.t >= t.dur) {
          const a = angTo(t.x, t.y, P.x, P.y);
          if (Math.hypot(P.x - t.x, P.y - t.y) < t.len && Math.abs(angDiff(a, t.ang)) < t.spread / 2 && !P.dead) hurtPlayer(map, P, S, t.dmg, t.x, t.y, t.from);
          H().world && H().world('breath', t.x, t.y, { ang: t.ang, len: t.len, col: t.col });
          ts.splice(i, 1);
        }
      } else if (t.kind === 'beam') {
        if (t.follow) { t.x = t.follow.x; t.y = t.follow.y; }
        if (t.t > t.warn) {
          t.ang += t.rot * dt;
          t.tick -= dt;
          if (t.tick <= 0) {
            t.tick = 0.15;
            // distance from player to the beam segment
            const ex = t.x + Math.cos(t.ang) * t.len, ey = t.y + Math.sin(t.ang) * t.len;
            const vx = ex - t.x, vy = ey - t.y, wx = P.x - t.x, wy = P.y - t.y;
            const k = U.clamp((wx * vx + wy * vy) / (vx * vx + vy * vy), 0, 1);
            if (Math.hypot(wx - vx * k, wy - vy * k) < t.w && !P.dead) hurtPlayer(map, P, S, t.dmg, t.x, t.y, t.from);
          }
        } else t.ang += 0;
        if (t.t > t.warn + t.dur) ts.splice(i, 1);
      } else if (t.kind === 'pool') {
        t.tick = (t.tick || 0) - dt;
        if (t.tick <= 0) {
          t.tick = 0.3;
          if (Math.hypot(P.x - t.x, P.y - t.y) < t.r && !P.dead) {
            if (t.slow) P.slow = 1.2; else hurtPlayer(map, P, S, t.dmg, t.x, t.y, t.from);
          }
        }
        if (t.t > t.dur) ts.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- player attacks
  function critChance(S) { return 0.05 + GF.fx(S, 'crit'); }
  function giantMult(S) {
    let m = 1 + GF.fx(S, 'giant');
    for (const b of S.buildings) if (b.type === 'observatory') m += 0.06 * b.level;
    return m;
  }
  function allTargets(map) {
    const out = [];
    for (const e of map.enemies) if (!e.dead && !e.untargetable) out.push(e);
    return out;
  }
  function meleeHit(map, P, S, range, arc, dmg, kb, bane) {
    let any = false;
    for (const e of allTargets(map)) {
      const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy);
      if (d > range + e.r) continue;
      if (arc < 6.2 && Math.abs(angDiff(Math.atan2(dy, dx), P.ang)) > arc / 2 + Math.atan2(e.r, Math.max(d, 0.3))) continue;
      damageTarget(map, e, dmg, P.x, P.y, S, { kb, bane });
      any = true;
    }
    return any;
  }
  /** Weapon attack in P.ang. Returns the cooldown to wait. */
  function playerAttack(map, P, S) {
    const w = GF.weapon(S);
    const k = w ? GF.KIND[w.kind] : { cd: 0.45, arc: 1.6, range: 1.3, mult: 1 };
    const dmg = GF.playerDamage(S);
    const bane = !!(w && w.giantBane);
    P.swing = { t: 0, dur: 0.22, ang: P.ang, kind: w ? w.kind : 'fist', tier: w ? w.tier : 0 };
    H().sound && H().sound('swing');
    if (k.proj) {
      map.proj.push({ x: P.x, y: P.y, vx: Math.cos(P.ang) * 15, vy: Math.sin(P.ang) * 15, r: 0.22, dmg, life: k.range / 15, col: '#ffe9a0', friendly: true, bane });
      return k.cd;
    }
    if (w && w.kind === 'hammer') {
      const hx = P.x + Math.cos(P.ang) * 1.4, hy = P.y + Math.sin(P.ang) * 1.4;
      for (const e of allTargets(map)) {
        if (Math.hypot(e.x - hx, e.y - hy) < 2.1 + e.r) damageTarget(map, e, dmg, P.x, P.y, S, { kb: k.kb, bane });
      }
      H().world && H().world('boom', hx, hy, { r: 1.8, col: '#ffd070', small: true });
      H().shake && H().shake(0.1);
      return k.cd;
    }
    meleeHit(map, P, S, k.range, k.arc, dmg, 4, bane);
    return k.cd;
  }
  function whirlwind(map, P, S) {
    const rank = S.skills.whirlwind || 0;
    if (!rank) return false;
    const dmg = GF.playerDamage(S) * (1.6 + 0.35 * rank);
    const w = GF.weapon(S);
    meleeHit(map, P, S, 3.4, 7, dmg, 7, !!(w && w.giantBane));
    P.spin = 0.4; P.invuln = Math.max(P.invuln, 0.3);
    H().world && H().world('ring', P.x, P.y, { r: 3.4, col: '#ffe9a0' });
    H().sound && H().sound('whirl');
    return true;
  }

  // ---------------------------------------------------------------- bosses
  function createBoss(map, id, x, y, S, opt) {
    const d = GF.BOSSES[id];
    const df = diff(S);
    const asc = !!(opt && opt.ascended);
    const hp = Math.round(d.hp * df.enemyHp * (asc ? 2.2 : 1) * ((opt && opt.hpMult) || 1));
    const b = {
      kind: 'enemy', isBoss: true, isGiant: id === 'giant', boss: id, def: { name: d.name, col: d.col, drops: [], coins: [0, 0], xp: 0, aggro: 99 }, name: d.name, col: d.col,
      x, y, vx: 0, vy: 0, r: d.r, hp, max: hp, flash: 0, phase: 0, t: 0, cd: 2.5, dmg: d.dmg * df.enemyDmg * (asc ? 1.5 : 1), asc,
      armor: d.armor || null, kb: { x: 0, y: 0, t: 0 }, shielded: false, active: false, state: 'idle', intro: 0, home: { x, y }, hitTaken: false, face: Math.PI / 2, pattern: 0,
      arena: opt && opt.arena, pylons: [], charging: null, enrage: 1, shake: 0, castIdx: 0,
    };
    map.enemies.push(b);
    map.boss = b;
    return b;
  }

  // attack library ------------------------------------------------------
  const L = {
    circle(c, x, y, r, delay, dmg, col, then) { c.map.tele.push({ kind: 'circle', x, y, r, t: 0, dur: delay, dmg, col: col || '#ff3a3a', from: c.b.name, then }); },
    slam(c, r, delay, mult) { L.circle(c, c.P.x, c.P.y, r, delay, c.b.dmg * (mult || 1), c.b.col); },
    stomp(c, r, mult, ringN) {
      L.circle(c, c.b.x, c.b.y, r, 0.9, c.b.dmg * (mult || 1), '#ff9a3a', ringN ? () => L.ring(c, c.b.x, c.b.y, ringN, 5.5, c.b.dmg * 0.45, c.b.col, 0) : null);
    },
    shot(c, x, y, ang, speed, dmg, col, r) { c.map.proj.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: r || 0.3, dmg, life: 5, col: col || c.b.col, friendly: false, from: c.b.name }); },
    fan(c, n, spread, speed, mult, col, r) {
      const a0 = angTo(c.b.x, c.b.y, c.P.x, c.P.y);
      for (let i = 0; i < n; i++) L.shot(c, c.b.x, c.b.y, a0 + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread), speed, c.b.dmg * (mult || 0.5), col, r);
    },
    ring(c, x, y, n, speed, dmg, col, off) { for (let i = 0; i < n; i++) L.shot(c, x, y, (i / n) * Math.PI * 2 + (off || 0), speed, dmg, col || c.b.col, 0.28); },
    rain(c, n, r, delay, mult, aroundBoss) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, d = Math.random() * 7;
        const cx = aroundBoss ? c.b.arena.cx + Math.cos(a) * d * 1.3 : c.P.x + Math.cos(a) * d * 0.7, cy = aroundBoss ? c.b.arena.cy + Math.sin(a) * d * 1.3 : c.P.y + Math.sin(a) * d * 0.7;
        c.map.tele.push({ kind: 'circle', x: cx, y: cy, r, t: -i * 0.12, dur: delay, dmg: c.b.dmg * (mult || 0.8), col: '#ff6a3a', from: c.b.name });
      }
    },
    beam(c, ang, len, w, warn, dur, rot, mult, follow) { c.map.tele.push({ kind: 'beam', x: c.b.x, y: c.b.y, ang, len, w, t: 0, warn, dur, rot, dmg: c.b.dmg * (mult || 0.5), tick: 0, col: c.b.col, from: c.b.name, follow }); },
    cone(c, len, spread, delay, mult) { const a = angTo(c.b.x, c.b.y, c.P.x, c.P.y); c.map.tele.push({ kind: 'cone', x: c.b.x, y: c.b.y, ang: a, len, spread, t: 0, dur: delay, dmg: c.b.dmg * (mult || 1), col: c.b.col, from: c.b.name }); },
    pool(c, x, y, r, dur, mult, slow) { c.map.tele.push({ kind: 'pool', x, y, r, t: 0, dur, dmg: c.b.dmg * (mult || 0.25), slow, col: slow ? '#8ad0f0' : '#ff5a1a', from: c.b.name, tick: 0 }); },
    summon(c, type, n, scale) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, d = 3 + Math.random() * 3;
        const sx = U.clamp(c.b.x + Math.cos(a) * d, c.b.arena.cx - c.b.arena.r + 1, c.b.arena.cx + c.b.arena.r - 1), sy = U.clamp(c.b.y + Math.sin(a) * d, c.b.arena.cy - c.b.arena.r + 1, c.b.arena.cy + c.b.arena.r - 1);
        if (GF.solidTile(c.map, sx, sy)) continue;
        const e = spawnEnemy(c.map, type, sx, sy, { scale: scale || 0.5, hostileAll: true }, c.S);
        e.state = 'chase'; e.summoned = true;
      }
      H().world && H().world('ring', c.b.x, c.b.y, { r: 2.5, col: '#aaa' });
    },
    charge(c, windup, speed, mult) {
      const a = angTo(c.b.x, c.b.y, c.P.x, c.P.y);
      c.map.tele.push({ kind: 'beam', x: c.b.x, y: c.b.y, ang: a, len: 10, w: c.b.r * 0.9, t: 0, warn: windup, dur: 0.01, rot: 0, dmg: 0, tick: 99, col: '#ff5a5a', from: c.b.name, ghost: true });
      c.b.charging = { t: -windup, ang: a, speed, dmg: c.b.dmg * (mult || 1), hit: false };
    },
  };

  function inArena(b, x, y, pad) { const a = b.arena; return Math.hypot(x - a.cx, y - a.cy) < a.r - (pad || 0); }
  function bossPhase(b) {
    const th = GF.BOSSES[b.boss].phases;
    const f = b.hp / b.max;
    let p = 0;
    for (let i = 0; i < th.length; i++) if (f <= th[i] + (i === 0 ? 0 : 0) && i > 0 && f <= th[i]) p = i;
    return p;
  }
  // attack scripts per boss: per phase list of [fn, cooldownAfter]
  const SCRIPTS = {
    slimeking: [
      [(c) => L.slam(c, 2.2, 1.0, 1), (c) => L.fan(c, 5, 1.2, 5.5, 0.4, '#5adf7a'), (c) => L.slam(c, 2.6, 1.0, 1.2)],
      [(c) => { if (!c.b.split) { c.b.split = true; L.summon(c, 'slime', 4, 1.2); } L.ring(c, c.b.x, c.b.y, 10, 5, c.b.dmg * 0.4, '#5adf7a'); }, (c) => L.slam(c, 2.6, 0.8, 1.2), (c) => L.fan(c, 7, 1.6, 6.5, 0.4, '#5adf7a')],
    ],
    guardian: [
      [(c) => L.stomp(c, 3.4, 1.0, 10), (c) => L.fan(c, 5, 1.0, 6, 0.45, '#9aa4b8', 0.35), (c) => L.slam(c, 2.4, 1.0, 1)],
      [(c) => L.rain(c, 7, 2.0, 1.3, 0.8), (c) => L.charge(c, 0.9, 11, 1.2), (c) => L.stomp(c, 3.8, 1.1, 14), (c) => L.fan(c, 7, 1.5, 6.5, 0.45, '#9aa4b8', 0.35)],
    ],
    forestking: [
      [(c) => L.charge(c, 0.8, 12, 1.0), (c) => L.fan(c, 7, 1.6, 6.5, 0.45, '#4a9a48', 0.28), (c) => { L.summon(c, 'wolf', 2, 0.5); }, (c) => L.slam(c, 2.4, 1.0, 1)],
      [(c) => { for (let i = -2; i <= 2; i++) L.circle(c, c.P.x + i * 2.2, c.P.y + (i % 2 ? 1.5 : -1.5), 1.7, 1.1, c.b.dmg * 0.8, '#58c868'); }, (c) => L.charge(c, 0.7, 13, 1.1), (c) => L.ring(c, c.b.x, c.b.y, 12, 5.5, c.b.dmg * 0.4, '#58c868'), (c) => L.rain(c, 8, 1.8, 1.2, 0.7)],
      [(c) => L.charge(c, 0.55, 15, 1.2), (c) => { L.fan(c, 9, 2.2, 7.5, 0.4, '#58c868', 0.28); }, (c) => { for (let i = 0; i < 4; i++) L.pool(c, c.b.arena.cx + Math.cos(i * 1.57 + 0.5) * 6, c.b.arena.cy + Math.sin(i * 1.57 + 0.5) * 6, 2.2, 8, 0.3); L.rain(c, 8, 1.8, 1.0, 0.8); }, (c) => L.summon(c, 'wolf', 3, 0.6)],
    ],
    wyrm: [
      [(c) => L.ring(c, c.b.x, c.b.y, 14, 5.2, c.b.dmg * 0.4, '#9ae0ff'), (c) => L.cone(c, 9, 0.9, 1.0, 1.0), (c) => L.fan(c, 5, 1.1, 7, 0.4, '#9ae0ff', 0.3), (c) => L.slam(c, 2.4, 0.9, 1)],
      [(c) => { L.pool(c, c.P.x, c.P.y, 3.2, 9, 0.2, true); L.pool(c, c.b.arena.cx + (Math.random() - 0.5) * 12, c.b.arena.cy + (Math.random() - 0.5) * 12, 3.2, 9, 0.2, true); }, (c) => L.summon(c, 'frost_wisp', 2, 0.4), (c) => L.cone(c, 10, 1.0, 0.9, 1.1), (c) => L.rain(c, 7, 1.9, 1.2, 0.8)],
      [(c) => L.beam(c, angTo(c.b.x, c.b.y, c.P.x, c.P.y), 14, 0.5, 1.0, 3.2, 0.9, 0.55, null), (c) => L.ring(c, c.b.x, c.b.y, 18, 5.5, c.b.dmg * 0.4, '#9ae0ff', Math.random()), (c) => L.cone(c, 11, 1.2, 0.8, 1.1), (c) => L.fan(c, 9, 2.0, 7.5, 0.4, '#9ae0ff', 0.3)],
    ],
    titan: [
      [(c) => L.fan(c, 5, 1.0, 7, 0.45, '#ff6a3a', 0.35), (c) => L.stomp(c, 4.0, 1.0, 12), (c) => L.slam(c, 2.8, 0.9, 1)],
      [(c) => { for (let i = 0; i < 3; i++) L.pool(c, c.P.x + (Math.random() - 0.5) * 8, c.P.y + (Math.random() - 0.5) * 8, 2.4, 9, 0.3); }, (c) => L.rain(c, 9, 2.0, 1.2, 0.8), (c) => L.fan(c, 7, 1.5, 7.5, 0.45, '#ff6a3a', 0.35)],
      [(c) => L.ring(c, c.b.x, c.b.y, 16, 5.8, c.b.dmg * 0.4, '#ff6a3a'), (c) => L.charge(c, 0.7, 13, 1.2), (c) => L.rain(c, 11, 2.0, 1.0, 0.8), (c) => L.stomp(c, 4.4, 1.2, 16)],
      [(c) => { L.ring(c, c.b.x, c.b.y, 18, 6, c.b.dmg * 0.4, '#ffb04a', Math.random()); L.fan(c, 9, 2.0, 8, 0.4, '#ff6a3a', 0.35); }, (c) => L.rain(c, 13, 2.0, 0.9, 0.9), (c) => L.stomp(c, 4.6, 1.2, 20)],
    ],
    warden: [
      [(c) => { L.beam(c, Math.random() * 6.28, 13, 0.55, 1.2, 2.8, 0.8, 0.5); L.beam(c, Math.random() * 6.28, 13, 0.55, 1.2, 2.8, -0.8, 0.5); }, (c) => L.summon(c, 'construct', 2, 0.35), (c) => L.fan(c, 5, 1.0, 7.5, 0.45, '#d8c070', 0.3), (c) => L.slam(c, 2.4, 0.9, 1)],
      [(c) => { if (c.b.pylons.filter((p) => !p.dead).length === 0 && !c.b.pylonDone) { for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; const p = spawnEnemy(c.map, 'sentry', c.b.arena.cx + Math.cos(a) * 7, c.b.arena.cy + Math.sin(a) * 7, { scale: 0.45, hostileAll: true }, c.S); p.isPylon = true; p.r = 0.8; p.def = Object.assign({}, p.def, { name: 'Warden Pylon', col: '#8fe8ff', drops: [], aggro: 60, spd: 0 }); p.hp = p.max = Math.round(c.b.max * 0.012); p.home = { x: p.x, y: p.y }; c.b.pylons.push(p); } c.b.shielded = true; c.b.pylonDone = true; c.log && c.log('Destroy the pylons to break the shield!'); } L.ring(c, c.b.x, c.b.y, 12, 5.5, c.b.dmg * 0.4, '#d8c070'); }, (c) => L.rain(c, 8, 2, 1.2, 0.8), (c) => L.beam(c, Math.random() * 6.28, 13, 0.55, 1.2, 2.5, 0.7, 0.5)],
      [(c) => { for (let i = 0; i < 4; i++) L.beam(c, i * 1.57 + Math.random(), 13, 0.5, 1.2, 3.0, i % 2 ? 0.75 : -0.75, 0.5); }, (c) => L.fan(c, 9, 2.0, 8, 0.4, '#d8c070', 0.3), (c) => L.rain(c, 12, 2.0, 1.0, 0.9), (c) => L.stomp(c, 4.2, 1.2, 16)],
    ],
    giant: [
      [(c) => { L.stomp(c, 5.0, 1.0, 14); }, (c) => L.fan(c, 3, 0.9, 5.5, 0.6, '#c07a50', 0.7), (c) => L.slam(c, 2.8, 1.0, 1.0), (c) => L.stomp(c, 5.4, 1.1, 18)],
      [(c) => { for (let i = 0; i < 3; i++) L.circle(c, c.P.x + (Math.random() - 0.5) * 3, c.P.y + (Math.random() - 0.5) * 3, 4.4, 1.2 + i * 0.5, c.b.dmg * 1.0, '#ff7a3a'); }, (c) => L.summon(c, 'rockling', 3, 0.25), (c) => L.fan(c, 5, 1.4, 6, 0.55, '#c07a50', 0.7), (c) => L.rain(c, 8, 2.2, 1.3, 0.8)],
      [(c) => { L.beam(c, Math.random() * 6.28, 15, 0.7, 1.2, 3.5, 0.65, 0.6); L.beam(c, Math.random() * 6.28, 15, 0.7, 1.2, 3.5, -0.65, 0.6); }, (c) => L.rain(c, 12, 2.2, 1.1, 0.9, true), (c) => L.stomp(c, 5.6, 1.2, 20), (c) => L.fan(c, 7, 1.8, 6.5, 0.5, '#ffb04a', 0.5)],
      [(c) => { for (let i = 0; i < 3; i++) L.beam(c, i * 2.09 + Math.random(), 15, 0.7, 1.0, 4, i % 2 ? 0.8 : -0.8, 0.6); }, (c) => L.rain(c, 14, 2.2, 0.9, 0.9), (c) => L.stomp(c, 5.8, 1.3, 24), (c) => { L.ring(c, c.b.x, c.b.y, 16, 6, c.b.dmg * 0.4, '#ffb04a', Math.random()); L.slam(c, 3.0, 0.8, 1.1); }],
      [(c) => { L.ring(c, c.b.x, c.b.y, 20, 6.4, c.b.dmg * 0.4, '#ff5a3a', Math.random()); L.rain(c, 14, 2.4, 0.8, 1.0); }, (c) => { for (let i = 0; i < 4; i++) L.beam(c, i * 1.57 + Math.random(), 15, 0.75, 0.9, 4, i % 2 ? 0.9 : -0.9, 0.7); }, (c) => L.stomp(c, 6.0, 1.4, 26), (c) => L.fan(c, 9, 2.4, 7.5, 0.5, '#ff5a3a', 0.5)],
    ],
  };
  const CD = { slimeking: [1.6, 1.3], guardian: [1.8, 1.4], forestking: [1.6, 1.3, 1.0], wyrm: [1.7, 1.4, 1.1], titan: [1.7, 1.5, 1.3, 1.0], warden: [1.8, 1.6, 1.2], giant: [2.0, 1.7, 1.5, 1.3, 1.0] };
  const MOVE = { slimeking: [0.7, 1.0], guardian: [0.9, 1.3], forestking: [1.4, 1.8, 2.2], wyrm: [0.7, 0.9, 1.0], titan: [0.8, 1.0, 1.2, 1.5], warden: [0.8, 0.0, 1.0], giant: [0.6, 0.7, 0.8, 1.0, 1.2] };

  function updateBoss(map, b, P, S, dt, env) {
    const c = { map, b, P, S, log: env && env.log };
    b.flash = Math.max(0, b.flash - dt);
    if (b.hp <= 0) { if (!b.dead) { b.dead = true; env && env.onBossDead && env.onBossDead(b); } return; }
    if (!b.active) {
      if (!P.dead && Math.hypot(P.x - b.arena.cx, P.y - b.arena.cy) < b.arena.r - 1) {
        b.active = true; b.intro = 3.0;
        env && env.onBossStart && env.onBossStart(b);
      }
      return;
    }
    if (b.intro > 0) { b.intro -= dt; b.invuln = b.intro; return; }
    b.invuln = Math.max(0, (b.invuln || 0) - dt);
    b.t += dt;
    const phase = bossPhase(b);
    if (phase !== b.phase) {
      b.phase = phase; b.invuln = 1.5; b.cd = 1.8;
      H().shake && H().shake(0.5);
      H().world && H().world('ring', b.x, b.y, { r: 6, col: b.col });
      env && env.onPhase && env.onPhase(b, phase);
      map.proj = map.proj.filter((p) => p.friendly);
      if (b.boss !== 'warden') { /* telegraphs keep running */ }
    }
    // pylon shield
    if (b.boss === 'warden') {
      b.pylons = b.pylons.filter((p) => !p.dead);
      if (b.shielded && b.pylons.length === 0) { b.shielded = false; env && env.log && env.log('The shield shatters!'); H().world && H().world('ring', b.x, b.y, { r: 5, col: '#8fe8ff' }); }
    }
    // movement
    const mv = (MOVE[b.boss] || [1])[Math.min(phase, (MOVE[b.boss] || [1]).length - 1)];
    const dx = P.x - b.x, dy = P.y - b.y, dist = Math.hypot(dx, dy);
    b.face = Math.atan2(dy, dx);
    if (b.charging) {
      const ch = b.charging;
      ch.t += dt;
      if (ch.t > 0 && ch.t < 0.7) {
        const nx = b.x + Math.cos(ch.ang) * ch.speed * dt, ny = b.y + Math.sin(ch.ang) * ch.speed * dt;
        if (inArena(b, nx, ny, b.r * 0.5)) { b.x = nx; b.y = ny; }
        if (!ch.hit && dist < b.r + 0.5) { ch.hit = true; hurtPlayer(map, P, S, ch.dmg, b.x, b.y, b.name); }
      } else if (ch.t >= 0.7) b.charging = null;
    } else if (b.boss !== 'warden' || phase !== 1) {
      const want = b.boss === 'wyrm' || b.boss === 'giant' ? b.r + 4.5 : b.r + 1.2;
      const spd = 2.0 * mv;
      if (dist > want) { const nx = b.x + dx / dist * spd * dt, ny = b.y + dy / dist * spd * dt; if (inArena(b, nx, ny, b.r * 0.6)) { b.x = nx; b.y = ny; } }
      else if (dist < want - 2.5 && (b.boss === 'wyrm' || b.boss === 'giant')) { const nx = b.x - dx / dist * spd * 0.6 * dt, ny = b.y - dy / dist * spd * 0.6 * dt; if (inArena(b, nx, ny, b.r * 0.6)) { b.x = nx; b.y = ny; } }
    }
    // contact damage
    if (dist < b.r + 0.35 && !b.charging) hurtPlayer(map, P, S, b.dmg * 0.4, b.x, b.y, b.name);
    // attacks
    b.cd -= dt;
    if (b.cd <= 0 && !b.charging) {
      const list = SCRIPTS[b.boss][Math.min(phase, SCRIPTS[b.boss].length - 1)];
      const atk = list[b.castIdx % list.length];
      b.castIdx++;
      atk(c);
      const cds = CD[b.boss];
      b.cd = cds[Math.min(phase, cds.length - 1)] * (b.asc ? 0.85 : 1);
    }
  }

  Object.assign(GF, {
    Combat: { blockedAt, moveBody, spawnEnemy, hurtPlayer, killEnemy, damageTarget, updateEnemies, updateProjectiles, updateTelegraphs, playerAttack, whirlwind, createBoss, updateBoss, meleeHit, giantMult, angTo, angDiff, inArena, L },
  });
})(typeof window !== 'undefined' ? window : globalThis);

// Settlement building, businesses, power, population, automation, farming and research.
(function (root) {
  'use strict';
  const GF = root.GF;
  const U = GF.util;
  const notify = (m, t) => GF.hooks.notify(m, t || 'info');
  const diff = (S) => GF.DIFFICULTY[S.diff] || GF.DIFFICULTY.standard;
  const PRODUCERS = ['lumber', 'mine', 'bakery', 'smithy', 'factory', 'lab', 'powerplant', 'star_forge'];

  const CROPDATA = {
    wheat: { grow: 60, yield: [2, 4], xp: 3, field: 1 }, carrot: { grow: 90, yield: [2, 3], xp: 4, field: 1 },
    pumpkin: { grow: 170, yield: [1, 2], xp: 8, field: 1 }, berry: { grow: 110, yield: [3, 5], xp: 6, field: 1, regrow: true },
    moonbloom: { grow: 280, yield: [1, 2], xp: 25, field: 3 }, emberpepper: { grow: 340, yield: [1, 2], xp: 30, field: 4 },
  };

  // ---------------------------------------------------------------- placement
  function countLimit(S, type) {
    const sl = GF.settleLevel(S), d = GF.BUILDINGS[type];
    if (type === 'house') return Math.min(10, 2 + 2 * (sl - 1));
    if (type === 'field') return Math.min(6, 2 + (sl - 1));
    return d.maxCount;
  }
  function reserved(S) {
    const set = new Set();
    for (const n of GF.NPCS) set.add(Math.floor(n.x) + ',' + Math.floor(n.y));
    // campfire + a plaza path in front of the town hall
    for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) set.add((95 + dx) + ',' + (78 + dy));
    return set;
  }
  function zone(S) { return GF.BUILD_ZONES[Math.min(S.land, GF.BUILD_ZONES.length - 1)]; }
  function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function rectOf(b) { const d = GF.BUILDINGS[b.type]; return { x: b.x, y: b.y, w: d.w, h: d.h }; }
  function placeCheck(S, type, x, y) {
    const d = GF.BUILDINGS[type];
    if (!d || type === 'townhall') return 'Cannot build that.';
    if (GF.settleLevel(S) < d.settle) return `Needs Town Hall level ${d.settle}.`;
    if (GF.buildingsOf(S, type).length >= countLimit(S, type)) return `You already have the maximum number (${countLimit(S, type)}).`;
    const z = zone(S);
    if (x < z[0] || y < z[1] || x + d.w > z[2] || y + d.h > z[3]) return 'Outside your settlement land. Expand it from the Build menu.';
    const r = { x, y, w: d.w, h: d.h };
    for (const b of S.buildings) if (overlaps(r, rectOf(b))) return 'Something is already built there.';
    const res = reserved(S);
    for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) if (res.has((x + i) + ',' + (y + j))) return 'Blocked by the plaza.';
    return '';
  }
  function buildCost(type) { return GF.BUILDINGS[type].cost; }
  function build(S, type, x, y) {
    const why = placeCheck(S, type, x, y);
    if (why) return { ok: false, msg: why };
    const cost = buildCost(type);
    if (!GF.canAfford(S, cost)) return { ok: false, msg: 'Not enough resources.' };
    GF.pay(S, cost);
    const b = { uid: S.nextUid++, type, x, y, level: 1, stock: {}, acc: {}, machines: {}, mode: 'stock', born: S.time };
    const d = GF.BUILDINGS[type];
    if (d.kind === 'field') b.plots = Array.from({ length: 9 }, () => ({ crop: null, prog: 0, water: 0 }));
    S.buildings.push(b);
    S.stats.built[type] = (S.stats.built[type] || 0) + 1;
    GF.addXp(S, 20 + d.prosp * 5);
    return { ok: true, msg: `${d.name} built!`, b };
  }
  function upgradeInfo(S, b) {
    const d = GF.BUILDINGS[b.type];
    if (b.level >= d.maxLevel) return null;
    const u = d.up[b.level - 1];
    let block = '';
    if (u.req && !S.bosses[u.req]) block = `Defeat ${GF.BOSSES[u.req].name} first.`;
    return { cost: u, block };
  }
  function upgrade(S, uid) {
    const b = S.buildings.find((x) => x.uid === uid);
    if (!b) return { ok: false, msg: 'Missing building.' };
    const info = upgradeInfo(S, b);
    if (!info) return { ok: false, msg: 'Already at max level.' };
    if (info.block) return { ok: false, msg: info.block };
    if (b.type !== 'townhall' && GF.BUILDINGS[b.type].settle > GF.settleLevel(S)) return { ok: false, msg: 'Settlement level too low.' };
    if (!GF.canAfford(S, info.cost)) return { ok: false, msg: 'Not enough resources.' };
    GF.pay(S, info.cost);
    b.level++;
    GF.addXp(S, 30 + GF.BUILDINGS[b.type].prosp * 8 * b.level);
    if (b.type === 'townhall') { S.hp = GF.maxHp(S); notify(`Settlement Level ${b.level}! New buildings unlocked.`, 'level'); }
    return { ok: true, msg: `${GF.BUILDINGS[b.type].name} upgraded to level ${b.level}!` };
  }
  function demolish(S, uid) {
    const i = S.buildings.findIndex((x) => x.uid === uid);
    if (i < 0) return { ok: false, msg: 'Missing building.' };
    const b = S.buildings[i];
    if (b.type === 'townhall') return { ok: false, msg: 'You cannot demolish the Town Hall.' };
    const d = GF.BUILDINGS[b.type];
    S.coins += Math.floor((d.cost.coins || 0) * 0.5);
    for (const k in (d.cost.items || {})) GF.give(S, k, Math.floor(d.cost.items[k] * 0.5), { noStat: true });
    for (const k in b.stock) GF.give(S, k, b.stock[k], { noStat: true });
    for (const m in b.machines) { const id = Object.values(GF.ITEMS).find((x) => x.machine === m); if (id) GF.give(S, id.id, b.machines[m], { noStat: true }); }
    S.buildings.splice(i, 1);
    return { ok: true, msg: `${d.name} demolished (50% refunded).` };
  }
  function buyLand(S) {
    const next = S.land + 1;
    if (next >= GF.BUILD_ZONES.length) return { ok: false, msg: 'All land purchased.' };
    const c = GF.LAND_COST[next];
    if (S.coins < c) return { ok: false, msg: 'Not enough Crowns.' };
    S.coins -= c; S.stats.spent += c; S.land = next;
    return { ok: true, msg: 'Settlement land expanded!' };
  }

  // ---------------------------------------------------------------- derived settlement numbers
  function prosperity(S) {
    let p = 0;
    for (const b of S.buildings) p += GF.BUILDINGS[b.type].prosp * b.level;
    return p;
  }
  function population(S) {
    let pop = 2, need = 0;
    for (const b of S.buildings) {
      if (b.type === 'house') pop += GF.BIZ.house.residents[b.level - 1];
      if (PRODUCERS.includes(b.type)) need += b.level;
    }
    return { pop, need, eff: need > 0 ? U.clamp(pop / need, 0.4, 1) : 1 };
  }
  function powerInfo(S) {
    let supply = 0, demand = 0;
    for (const b of S.buildings) {
      const biz = GF.BIZ[b.type];
      if (b.type === 'powerplant' && S.flags.fuel !== false) supply += biz.supply[b.level - 1] * (1 + GF.fx(S, 'power'));
      if (biz && biz.power) demand += biz.power * b.level;
      if (b.machines) demand += (b.machines.auto_miner || 0) * 2 + (b.machines.wood_processor || 0) * 2 + (b.machines.harvester || 0) * 3;
      if (b.type === 'hub') demand += 3 * b.level;
    }
    return { supply, demand, eff: demand > 0 ? U.clamp(supply / demand, 0.25, 1) : 1 };
  }
  function bizMult(S, b) {
    let m = 1 + GF.fx(S, 'biz');
    m *= diff(S).income > 1 ? 1 : 1;
    const mach = b.machines || {};
    m *= 1 + 0.3 * ((mach.auto_miner || 0) + (mach.wood_processor || 0));
    m *= S.pop.eff;
    const biz = GF.BIZ[b.type];
    if ((biz && biz.power) || mach.auto_miner || mach.wood_processor) m *= S.power.eff;
    if (b.type === 'lab' || b.type === 'smithy' || b.type === 'factory') { /* processors may be sped by sorters, handled below */ }
    return m;
  }
  function hubLevel(S) { return GF.buildingsOf(S, 'hub').reduce((m, b) => Math.max(m, b.level), 0); }
  function sorterBonus(S) { let n = 0; for (const b of GF.buildingsOf(S, 'hub')) n += (b.machines && b.machines.sorter) || 0; return 1 + 0.25 * n; }
  function stockCap(b) { const biz = GF.BIZ[b.type]; return (biz.cap || 0) * (1 + 0.25 * (b.level - 1)); }
  function stockTotal(b) { let n = 0; for (const k in b.stock) n += b.stock[k]; return n; }
  function lineRate(S, b, line) {
    if (line.req && !S.unlocked[line.req]) return 0;
    return (line.rate[b.level - 1] || 0);
  }
  /** Items/min and coins/min estimate for the UI. */
  function bizReport(S, b) {
    const biz = GF.BIZ[b.type];
    const out = [];
    const m = bizMult(S, b);
    if (biz.lines) for (const l of biz.lines) { const r = lineRate(S, b, l); if (r > 0) out.push({ item: l.item, perMin: r * m }); }
    if (biz.cycles) {
      const cyc = biz.cycles[b.level - 1] * m * (b.type === 'bakery' ? 1 : sorterBonus(S));
      const rec = biz.recipe ? [biz.recipe] : biz.recipes.filter((r) => r.lvl <= b.level);
      for (const r of rec) for (const k in r.out) out.push({ item: k, perMin: r.out[k] * cyc / rec.length, inputs: r.in });
    }
    const wage = biz.wage * b.level;
    let value = 0;
    for (const o of out) value += o.perMin * GF.ITEMS[o.item].value * 0.7;
    return { out, wage, value, mult: m };
  }

  // ---------------------------------------------------------------- production tick
  function putOutput(S, b, item, n, toStashAlways) {
    const hub = hubLevel(S) > 0 && b.type !== 'powerplant';
    const conv = (b.machines && b.machines.conveyor) || toStashAlways;
    if (b.mode === 'sell' && GF.tradingPost(S) > 0) {
      const mult = 0.7 * (b.type === 'bakery' && item === 'bread' ? 1.25 / 0.7 * 0.7 : 1);
      const val = Math.floor(GF.ITEMS[item].value * n * mult * (1 + GF.fx(S, 'sell') + GF.BIZ.trading_post.sellBonus[GF.tradingPost(S) - 1]) * (S.market.mod[item] || 1) * diff(S).income * (1 + GF.fx(S, 'income')));
      S.coins += val; S.stats.earned += val; S.stats.sold += val;
      return;
    }
    if (conv || hub) { const left = GF.stashAdd(S, item, n); if (left > 0) b.stock[item] = (b.stock[item] || 0) + left; return; }
    if (stockTotal(b) + n <= stockCap(b) + 0.001) b.stock[item] = (b.stock[item] || 0) + n;
  }
  function tickBusinesses(S, dt, awayMult) {
    awayMult = awayMult || 1;
    S.pop = population(S);
    S.power = powerInfo(S);
    // power plant fuel
    for (const b of S.buildings) {
      if (b.type !== 'powerplant') continue;
      const need = GF.BIZ.powerplant.coalPerMin * b.level * dt / 60;
      b.fuel = (b.fuel || 0) + need;
      while (b.fuel >= 1) {
        if (GF.take(S, 'coal', 1)) { b.fuel -= 1; S.flags.fuel = true; } else { S.flags.fuel = false; b.fuel = 0; break; }
      }
    }
    const sorter = sorterBonus(S);
    for (const b of S.buildings) {
      const d = GF.BUILDINGS[b.type], biz = GF.BIZ[b.type];
      if (b.type === 'house') { S.coins += GF.BIZ.house.residents[b.level - 1] * 0.2 * dt / 60 * diff(S).income; continue; }
      if (!biz || !PRODUCERS.includes(b.type)) continue;
      if (b.type === 'powerplant') continue;
      // wages: workers only work when paid
      const wage = biz.wage * b.level * dt / 60;
      if (S.coins < wage) { b.unpaid = true; continue; }
      b.unpaid = false;
      S.coins -= wage; S.stats.spent += wage;
      const mult = bizMult(S, b) * awayMult;
      if (b.type === 'lab') { S.rp += biz.rp[b.level - 1] * mult * (1 + GF.fx(S, 'rp')) * dt / 60; continue; }
      b.acc = b.acc || {};
      if (biz.lines) {
        for (const line of biz.lines) {
          const r = lineRate(S, b, line);
          if (r <= 0) continue;
          b.acc[line.item] = (b.acc[line.item] || 0) + r * mult * dt / 60;
          if (b.acc[line.item] >= 1) { const n = Math.floor(b.acc[line.item]); b.acc[line.item] -= n; putOutput(S, b, line.item, n); }
        }
      }
      if (biz.cycles) {
        const rec = biz.recipe ? [biz.recipe] : biz.recipes.filter((r) => r.lvl <= b.level);
        const cyc = biz.cycles[b.level - 1] * mult * (b.type === 'bakery' ? 1 : sorter);
        b.acc.cyc = (b.acc.cyc || 0) + cyc * dt / 60;
        let guard = 0;
        while (b.acc.cyc >= 1 && guard++ < 50) {
          // pick the first recipe whose inputs exist (round-robin so everything gets made)
          let done = false;
          for (let i = 0; i < rec.length && !done; i++) {
            const r = rec[(b.rr = ((b.rr || 0) + 1) % rec.length)];
            if (Object.keys(r.in).every((k) => GF.stashCount(S, k) >= r.in[k])) {
              for (const k in r.in) GF.stashRemove(S, k, r.in[k]);
              for (const k in r.out) { b.acc['o_' + k] = (b.acc['o_' + k] || 0) + r.out[k]; putOutput(S, b, k, r.out[k]); }
              done = true;
            }
          }
          b.acc.cyc -= 1;
          if (!done) { b.acc.cyc = Math.min(b.acc.cyc, 1); b.starved = true; break; } else b.starved = false;
        }
      }
    }
    // automation hub: periodic conveyor sweep of every business into the stash
    const hl = hubLevel(S);
    if (hl > 0) {
      S.hubTimer += dt;
      if (S.hubTimer >= GF.BIZ.hub.interval[hl - 1]) { S.hubTimer = 0; sweepStock(S); }
    }
    for (const b of S.buildings) if (b.machines && b.machines.conveyor && stockTotal(b) > 0) sweepOne(S, b);
    fieldTick(S, dt, awayMult);
  }
  function sweepOne(S, b) {
    for (const k in b.stock) { const left = GF.stashAdd(S, k, b.stock[k]); if (left <= 0) delete b.stock[k]; else b.stock[k] = left; }
  }
  function sweepStock(S) { for (const b of S.buildings) if (b.stock) sweepOne(S, b); }
  /** Player collects a business's stockpile (needs to be near home; the UI enforces this). */
  function collect(S, uid) {
    const b = S.buildings.find((x) => x.uid === uid);
    if (!b) return 0;
    let n = 0;
    for (const k in b.stock) {
      const left = GF.add(S, k, b.stock[k]);
      n += b.stock[k] - left;
      if (left <= 0) delete b.stock[k]; else b.stock[k] = left;
    }
    return n;
  }
  function setMode(S, uid, mode) { const b = S.buildings.find((x) => x.uid === uid); if (b) b.mode = mode; }

  // ---------------------------------------------------------------- machines
  const MACHINE_RULES = {
    sprinkler: { on: ['field'], max: 3 }, harvester: { on: ['field'], max: 2 },
    auto_miner: { on: ['mine'], max: 99 }, wood_processor: { on: ['lumber'], max: 99 },
    conveyor: { on: ['lumber', 'mine', 'bakery', 'smithy', 'factory', 'field', 'trading_post', 'star_forge'], max: 1 }, sorter: { on: ['hub'], max: 99 },
  };
  function installMachine(S, uid, itemId) {
    const b = S.buildings.find((x) => x.uid === uid);
    const it = GF.ITEMS[itemId];
    if (!b || !it || !it.machine) return { ok: false, msg: 'Invalid machine.' };
    const rule = MACHINE_RULES[it.machine];
    if (!rule.on.includes(b.type)) return { ok: false, msg: `${it.name} cannot be installed on a ${GF.BUILDINGS[b.type].name}.` };
    b.machines = b.machines || {};
    const have = b.machines[it.machine] || 0;
    const slots = Math.min(rule.max, b.level);
    if (have >= slots) return { ok: false, msg: `No free slot (this building supports ${slots}). Upgrade it for more.` };
    if (!GF.take(S, itemId, 1)) return { ok: false, msg: `You need a ${it.name}.` };
    b.machines[it.machine] = have + 1;
    S.stats.installed = (S.stats.installed || {}); S.stats.installed[it.machine] = (S.stats.installed[it.machine] || 0) + 1;
    GF.addXp(S, 40);
    return { ok: true, msg: `${it.name} installed!` };
  }

  // ---------------------------------------------------------------- farming
  function fieldOf(S, uid) { return S.buildings.find((b) => b.uid === uid && b.plots); }
  function plant(S, uid, idx, crop) {
    const b = fieldOf(S, uid); if (!b) return { ok: false, msg: 'No field.' };
    const p = b.plots[idx]; const cd = CROPDATA[crop];
    if (!p || !cd) return { ok: false, msg: 'Invalid.' };
    if (p.crop) return { ok: false, msg: 'Already planted.' };
    if (b.level < cd.field) return { ok: false, msg: `${GF.ITEMS[crop].name} needs a Field at level ${cd.field}.` };
    if (!GF.take(S, 'seed_' + crop, 1)) return { ok: false, msg: `No ${GF.ITEMS['seed_' + crop].name}.` };
    p.crop = crop; p.prog = 0; p.water = b.level >= 3 ? 1e9 : 0;
    S.stats.planted++;
    return { ok: true, msg: `Planted ${GF.ITEMS[crop].name}.` };
  }
  function water(S, uid, idx) {
    const b = fieldOf(S, uid); if (!b) return false;
    const p = b.plots[idx]; if (!p || !p.crop) return false;
    p.water = S.techs.agri2 ? 180 : 90;
    return true;
  }
  function fertilize(S, uid, idx) {
    const b = fieldOf(S, uid); const p = b && b.plots[idx];
    if (!p || !p.crop || p.prog >= 1) return false;
    if (!GF.take(S, 'bonemeal', 1)) return false;
    p.prog = Math.min(1, p.prog + 0.5);
    return true;
  }
  function plotRate(S, b) {
    let r = 1 + GF.fx(S, 'grow');
    if (b.level >= 4) r *= 1.3;
    return r;
  }
  function harvest(S, uid, idx) {
    const b = fieldOf(S, uid); if (!b) return { ok: false, msg: 'No field.' };
    const p = b.plots[idx];
    if (!p || !p.crop) return { ok: false, msg: 'Nothing planted.' };
    if (p.prog < 1) return { ok: false, msg: 'Not ripe yet.' };
    const cd = CROPDATA[p.crop];
    const bonus = 1 + GF.fx(S, 'yield') + 0.12 * (b.level - 1) + (b.level >= 5 ? 0.2 : 0);
    let n = Math.round((cd.yield[0] + Math.random() * (cd.yield[1] - cd.yield[0])) * bonus);
    n = Math.max(1, n);
    const crop = p.crop;
    const left = GF.give(S, crop, n);
    S.stats.harvested[crop] = (S.stats.harvested[crop] || 0) + n - left;
    GF.addXp(S, cd.xp * n);
    if (cd.regrow) { p.prog = 0.4; } else { p.crop = null; p.prog = 0; p.water = 0; }
    // seed drop chance
    if (Math.random() < 0.25 + GF.fx(S, 'luck')) GF.give(S, 'seed_' + crop, 1, { noStat: true });
    return { ok: true, msg: `Harvested ${n} ${GF.ITEMS[crop].name}.`, crop, n, left };
  }
  function fieldTick(S, dt, awayMult) {
    const hv = S.power.eff;
    for (const b of S.buildings) {
      if (!b.plots) continue;
      const sprink = (b.machines && b.machines.sprinkler) || 0;
      const rate = plotRate(S, b);
      for (let i = 0; i < b.plots.length; i++) {
        const p = b.plots[i];
        if (!p.crop || p.prog >= 1) continue;
        const wet = p.water > 0 || i < sprink * 3;
        if (p.water > 0 && p.water < 1e8) p.water = Math.max(0, p.water - dt);
        const speed = rate * (wet ? 2 : 0.5) * (awayMult || 1);
        p.prog = Math.min(1, p.prog + dt * speed / CROPDATA[p.crop].grow);
      }
      // harvester drones: harvest + replant (needs power and seeds in stash)
      const drones = (b.machines && b.machines.harvester) || 0;
      if (drones > 0) {
        b.droneT = (b.droneT || 0) + dt * hv;
        const period = 8 / drones;
        while (b.droneT >= period) {
          b.droneT -= period;
          const idx = b.plots.findIndex((p) => p.crop && p.prog >= 1);
          if (idx < 0) break;
          const crop = b.plots[idx].crop;
          const res = harvest(S, b.uid, idx);
          if (res.ok && b.plots[idx] && !b.plots[idx].crop && GF.stashCount(S, 'seed_' + crop) + GF.count(S, 'seed_' + crop) > 0) plant(S, b.uid, idx, crop);
        }
      }
    }
  }

  // ---------------------------------------------------------------- research
  function techState(S, id) {
    const t = GF.TECHS[id];
    if (S.techs[id]) return { done: true };
    if (GF.buildingsOf(S, 'lab').length === 0) return { lock: 'Build a Research Lab.' };
    if (t.req && !S.techs[t.req]) return { lock: `Requires ${GF.TECHS[t.req].name}.` };
    if (t.boss && !S.bosses[t.boss]) return { lock: `Defeat ${GF.BOSSES[t.boss].name}.` };
    return {};
  }
  function research(S, id) {
    const t = GF.TECHS[id], st = techState(S, id);
    if (st.done) return { ok: false, msg: 'Already researched.' };
    if (st.lock) return { ok: false, msg: st.lock };
    if (S.rp < t.rp) return { ok: false, msg: `Need ${t.rp} research points.` };
    if (S.coins < t.coins) return { ok: false, msg: 'Not enough Crowns.' };
    S.rp -= t.rp; S.coins -= t.coins; S.stats.spent += t.coins; S.techs[id] = true;
    GF.addXp(S, t.rp * 8);
    return { ok: true, msg: `Researched ${t.name}!` };
  }

  // ---------------------------------------------------------------- offline progress
  function simulateAway(S, seconds) {
    seconds = Math.min(seconds, 6 * 3600);
    if (seconds < 20) return null;
    const before = { coins: S.coins, rp: S.rp, stash: Object.assign({}, S.stash), stocks: S.buildings.reduce((a, b) => a + stockTotal(b || {}), 0) };
    const steps = Math.min(600, Math.ceil(seconds / 20));
    const dt = seconds / steps;
    for (let i = 0; i < steps; i++) { S.time += dt; tickBusinesses(S, dt, 0.5); GF.marketTick(S, dt); }
    const gained = {};
    for (const k in S.stash) { const d = S.stash[k] - (before.stash[k] || 0); if (d > 0) gained[k] = d; }
    return { seconds, coins: Math.floor(S.coins - before.coins), rp: Math.floor(S.rp - before.rp), gained };
  }

  Object.assign(GF, {
    CROPDATA, PRODUCERS, countLimit, placeCheck, build, upgradeInfo, upgrade, demolish, buyLand, prosperity, population, powerInfo, bizMult, bizReport, hubLevel,
    stockTotal, stockCap, tickBusinesses, collect, setMode, installMachine, MACHINE_RULES, plant, water, fertilize, harvest, techState, research, simulateAway, sweepStock, zone, rectOf, reserved,
  });
})(typeof window !== 'undefined' ? window : globalThis);

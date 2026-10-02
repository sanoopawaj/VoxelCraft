// Quests (main chain + endless board), achievements, final preparation checklist and lore.
(function (root) {
  'use strict';
  const GF = root.GF;
  const U = GF.util;
  const notify = (m, t) => GF.hooks.notify(m, t || 'info');

  const sum = (o, keys) => keys.reduce((a, k) => a + (o[k] || 0), 0);
  /** {cur,max} progress for a condition; `base` = stat snapshot for board quests. */
  function prog(S, c, base) {
    const st = S.stats, b = base || {};
    const bg = (grp, k) => (b[grp] ? b[grp][k] || 0 : 0);
    switch (c.t) {
      case 'got': return { cur: (st.got[c.item] || 0) - bg('got', c.item), max: c.n };
      case 'craft': return { cur: (st.crafted[c.item] || 0) - bg('crafted', c.item), max: c.n };
      case 'kill': {
        const keys = c.enemies || (c.enemy ? [c.enemy] : Object.keys(st.killed));
        return { cur: sum(st.killed, keys) - keys.reduce((a, k) => a + bg('killed', k), 0), max: c.n };
      }
      case 'sold': return { cur: st.sold - (b.sold || 0), max: c.n };
      case 'earn': return { cur: st.earned - (b.earned || 0), max: c.n };
      case 'build': return { cur: st.built[c.type] || 0, max: c.n };
      case 'upgrade': return { cur: S.buildings.some((x) => x.type === c.type && x.level >= c.level) ? 1 : 0, max: 1 };
      case 'harvest': { const keys = c.crop ? [c.crop] : Object.keys(st.harvested); return { cur: sum(st.harvested, keys) - keys.reduce((a, k) => a + bg('harvested', k), 0), max: c.n }; }
      case 'plant': return { cur: st.planted, max: c.n };
      case 'level': return { cur: S.level, max: c.n };
      case 'region': return { cur: S.discovered[c.id] ? 1 : 0, max: 1 };
      case 'boss': return { cur: S.bosses[c.id] ? 1 : 0, max: 1 };
      case 'settle': return { cur: GF.settleLevel(S), max: c.n };
      case 'prosperity': return { cur: GF.prosperity(S), max: c.n };
      case 'research': return { cur: Object.keys(S.techs).length, max: c.n };
      case 'tablets': return { cur: Object.keys(S.tablets).length, max: c.n };
      case 'power': return { cur: Math.floor(S.power.supply), max: c.n };
      case 'orders': return { cur: st.orders, max: c.n };
      case 'trades': return { cur: st.trades, max: c.n };
      case 'install': return { cur: (st.installed && st.installed[c.machine]) || 0, max: c.n };
      case 'abyss': return { cur: st.abyss, max: c.n };
      case 'ascended': return { cur: Object.keys(S.ascended).length, max: c.n };
      case 'have': return { cur: GF.total(S, c.item), max: c.n };
      case 'pay': return { cur: Math.min(c.n, S.questPaid[c.qid] || 0), max: c.n };
      case 'all': {
        let cur = 0;
        const parts = c.all.map((x) => prog(S, Object.assign({ qid: c.qid }, x), base));
        for (const p of parts) if (p.cur >= p.max) cur++;
        return { cur, max: parts.length, parts };
      }
      default: return { cur: 0, max: 1 };
    }
  }
  function tagCond(c, qid) {
    const o = Object.assign({}, c, { qid });
    if (o.all) o.all = o.all.map((x) => tagCond(x, qid));
    return o;
  }
  const questById = (id) => GF.QUESTS.find((q) => q.id === id);
  function isAvailable(S, q) {
    if (S.questDone[q.id]) return false;
    return q.after.every((a) => S.questDone[a]);
  }
  function progress(S, q) {
    const c = tagCond(q.cond, q.id);
    const p = prog(S, c, q.base);
    return Object.assign(p, { done: p.cur >= p.max });
  }
  function activeMain(S) { return GF.QUESTS.filter((q) => isAvailable(S, q) && (!q.post || S.bosses.giant)); }
  function payBlocker(S, q) {
    const pays = [];
    const walk = (c) => { if (c.t === 'pay') pays.push(c); if (c.all) c.all.forEach(walk); };
    walk(q.cond);
    return pays;
  }
  function payQuest(S, qid) {
    const q = questById(qid);
    if (!q || !isAvailable(S, q)) return { ok: false, msg: 'Not available.' };
    const pay = payBlocker(S, q)[0];
    if (!pay) return { ok: false };
    if ((S.questPaid[qid] || 0) >= pay.n) return { ok: false, msg: 'Already paid.' };
    if (S.coins < pay.n) return { ok: false, msg: `You need ${pay.n} Crowns.` };
    S.coins -= pay.n; S.stats.spent += pay.n; S.questPaid[qid] = pay.n;
    return { ok: true, msg: 'Paid!' };
  }

  function complete(S, q, noReward) {
    S.questDone[q.id] = true;
    const r = q.reward || {};
    if (!noReward) {
      const d = GF.DIFFICULTY[S.diff] || GF.DIFFICULTY.standard;
      if (r.coins) { const c = Math.round(r.coins * d.income); S.coins += c; S.stats.earned += c; }
      if (r.xp) GF.addXp(S, r.xp);
      if (r.rp) S.rp += r.rp;
      for (const k in (r.items || {})) if (r.items[k] > 0) GF.give(S, k, r.items[k], { noStat: true });
    }
    if (r.unlock) { S.unlocked[r.unlock] = true; notify(`${GF.REGIONS[r.unlock].name} is now open!`, 'unlock'); GF.hooks.fx('unlock'); }
    notify(`Quest complete: ${q.title}${r.coins ? `  +${U.fmt(r.coins)} Crowns` : ''}${r.xp ? `  +${U.fmt(r.xp)} XP` : ''}`, 'quest');
    GF.hooks.fx('quest');
    S.tracked = S.tracked.filter((x) => x !== q.id);
  }
  function checkQuests(S) {
    for (const q of GF.QUESTS) {
      if (!isAvailable(S, q) || (q.post && !S.bosses.giant)) continue;
      if (progress(S, q).done) complete(S, q);
    }
    for (let i = S.board.length - 1; i >= 0; i--) {
      const q = S.board[i];
      if (!q.accepted || q.kind === 'deliver') continue;
      const p = prog(S, q.cond, q.base);
      if (p.cur >= p.max) {
        const d = GF.DIFFICULTY[S.diff] || GF.DIFFICULTY.standard;
        const c = Math.round(q.reward.coins * d.income);
        S.coins += c; S.stats.earned += c; GF.addXp(S, q.reward.xp);
        notify(`Board quest done: ${q.title}  +${c} Crowns`, 'quest');
        S.board.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- endless quest board
  function snapshot(S) {
    const st = S.stats;
    return { got: Object.assign({}, st.got), crafted: Object.assign({}, st.crafted), killed: Object.assign({}, st.killed), harvested: Object.assign({}, st.harvested), earned: st.earned, sold: st.sold };
  }
  function maxBoardTier(S) { return Math.min(7, 1 + Object.keys(S.bosses).filter((b) => b !== 'slimeking').length + (S.unlocked.stone ? 0 : -0)); }
  function genBoard(S) {
    const day = GF.dayNumber(S);
    if (S.boardDay === day && S.board.length >= 4) return;
    S.boardDay = day;
    S.board = S.board.filter((q) => q.accepted || q.expire >= day);
    const r = U.rng((S.seed ^ (day * 31337)) >>> 0);
    const tier = maxBoardTier(S);
    let guard = 0;
    while (S.board.length < 4 && guard++ < 40) {
      const tpl = GF.BOARD_TEMPLATES[Math.floor(r() * GF.BOARD_TEMPLATES.length)];
      let q = null;
      const pickT = (arr) => { const ok = arr.filter((e) => e[2] <= tier); return ok.length ? ok[Math.floor(r() * ok.length)] : null; };
      if (tpl.kind === 'gather') { const e = pickT(tpl.items); if (e) { const n = Math.max(3, Math.round(e[1] * (0.5 + r() * 0.7))); q = { kind: 'gather', title: `Gather ${n} ${GF.ITEMS[e[0]].name}`, cond: { t: 'got', item: e[0], n }, val: GF.ITEMS[e[0]].value * n * 2.2 }; } }
      else if (tpl.kind === 'craft') { const e = pickT(tpl.items); if (e) { const n = Math.max(2, Math.round(e[1] * (0.5 + r() * 0.7))); q = { kind: 'craft', title: `Craft ${n} ${GF.ITEMS[e[0]].name}`, cond: { t: 'craft', item: e[0], n }, val: GF.ITEMS[e[0]].value * n * 2.0 }; } }
      else if (tpl.kind === 'kill') { const e = pickT(tpl.enemies); if (e) { const n = Math.max(3, Math.round(e[1] * (0.6 + r() * 0.6))); q = { kind: 'kill', title: `Hunt ${n} ${GF.ENEMIES[e[0]].name}s`, cond: { t: 'kill', enemy: e[0], n }, val: GF.ENEMIES[e[0]].xp * n * 1.4 + 60 * e[2] }; } }
      else if (tpl.kind === 'deliver') { const e = pickT(tpl.items); if (e) { const n = Math.max(3, Math.round(e[1] * (0.5 + r() * 0.6))); q = { kind: 'deliver', title: `Deliver ${n} ${GF.ITEMS[e[0]].name}`, cond: { t: 'have', item: e[0], n }, val: GF.ITEMS[e[0]].value * n * 2.0 }; } }
      else if (tpl.kind === 'earn') { const ok = tpl.amounts.filter((a) => a[1] <= tier); const a = ok[Math.floor(r() * ok.length)]; q = { kind: 'earn', title: `Earn ${U.fmt(a[0])} Crowns`, cond: { t: 'earn', n: a[0] }, val: a[0] * 0.5 }; }
      if (!q) continue;
      if (S.board.some((x) => x.title === q.title)) continue;
      S.board.push({ id: S.nextUid++, kind: q.kind, title: q.title, desc: q.kind === 'deliver' ? 'Hand the goods to the Foreman.' : 'Posted on the quest board.', cond: q.cond, reward: { coins: Math.round(q.val), xp: Math.round(q.val * 0.9) + 10 }, expire: day + 2 + Math.floor(r() * 3), accepted: false });
    }
  }
  function acceptBoard(S, id) {
    const q = S.board.find((x) => x.id === id);
    if (!q || q.accepted) return { ok: false };
    if (S.board.filter((x) => x.accepted).length >= 5) return { ok: false, msg: 'You can only hold 5 board quests.' };
    q.accepted = true; q.base = snapshot(S);
    return { ok: true, msg: 'Quest accepted.' };
  }
  function abandonBoard(S, id) { const i = S.board.findIndex((x) => x.id === id); if (i >= 0) S.board.splice(i, 1); }
  function deliverBoard(S, id) {
    const q = S.board.find((x) => x.id === id);
    if (!q || q.kind !== 'deliver') return { ok: false };
    if (GF.total(S, q.cond.item) < q.cond.n) return { ok: false, msg: `Need ${q.cond.n} ${GF.ITEMS[q.cond.item].name}.` };
    GF.take(S, q.cond.item, q.cond.n);
    const d = GF.DIFFICULTY[S.diff] || GF.DIFFICULTY.standard;
    const c = Math.round(q.reward.coins * d.income);
    S.coins += c; S.stats.earned += c; GF.addXp(S, q.reward.xp);
    S.board.splice(S.board.indexOf(q), 1);
    return { ok: true, msg: `Delivered! +${c} Crowns` };
  }

  // ---------------------------------------------------------------- achievements
  const ACH = [];
  function A(id, name, desc, test, reward) { ACH.push({ id, name, desc, test, reward: reward || { coins: 100, xp: 100 } }); }
  const killsAll = (S) => Object.values(S.stats.killed).reduce((a, b) => a + b, 0);
  const craftsAll = (S) => Object.values(S.stats.crafted).reduce((a, b) => a + b, 0);
  A('a_kill100', 'Monster Hunter', 'Defeat 100 creatures.', (S) => killsAll(S) >= 100, { coins: 300, xp: 300 });
  A('a_kill1000', 'Slaughterhouse', 'Defeat 1,000 creatures.', (S) => killsAll(S) >= 1000, { coins: 5000, xp: 3000 });
  A('a_kill5000', 'Exterminator', 'Defeat 5,000 creatures.', (S) => killsAll(S) >= 5000, { coins: 40000, xp: 20000 });
  A('a_nodes100', 'Gatherer', 'Harvest 100 resource nodes.', (S) => S.stats.nodes >= 100, { coins: 200, xp: 200 });
  A('a_nodes1500', 'Strip Miner', 'Harvest 1,500 resource nodes.', (S) => S.stats.nodes >= 1500, { coins: 4000, xp: 3000 });
  A('a_earn1k', 'Pocket Change', 'Earn 1,000 Crowns.', (S) => S.stats.earned >= 1000);
  A('a_earn25k', 'Comfortable', 'Earn 25,000 Crowns.', (S) => S.stats.earned >= 25000, { coins: 1500, xp: 1500 });
  A('a_earn500k', 'Tycoon', 'Earn 500,000 Crowns.', (S) => S.stats.earned >= 500000, { coins: 25000, xp: 20000 });
  A('a_earn10m', 'Empire', 'Earn 10,000,000 Crowns.', (S) => S.stats.earned >= 10000000, { coins: 500000, xp: 100000 });
  A('a_lvl10', 'Builder', 'Reach level 10.', (S) => S.level >= 10);
  A('a_lvl25', 'Adventurer', 'Reach level 25.', (S) => S.level >= 25, { coins: 3000, xp: 3000 });
  A('a_lvl40', 'Legend', 'Reach level 40.', (S) => S.level >= 40, { coins: 30000, xp: 30000 });
  A('a_craft50', 'Crafter', 'Craft 50 items.', (S) => craftsAll(S) >= 50);
  A('a_craft500', 'Master Artisan', 'Craft 500 items.', (S) => craftsAll(S) >= 500, { coins: 5000, xp: 4000 });
  A('a_harvest100', 'Farmhand', 'Harvest 100 crops.', (S) => Object.values(S.stats.harvested).reduce((a, b) => a + b, 0) >= 100, { coins: 400, xp: 400 });
  A('a_build10', 'Town Planner', 'Own 10 buildings.', (S) => S.buildings.length >= 10, { coins: 1000, xp: 1000 });
  A('a_build25', 'City Planner', 'Own 25 buildings.', (S) => S.buildings.length >= 25, { coins: 20000, xp: 10000 });
  A('a_orders10', 'Reliable Supplier', 'Deliver 10 customer orders.', (S) => S.stats.orders >= 10, { coins: 1000, xp: 800 });
  A('a_trade50', 'Market Mogul', 'Sell 50 items on the Player Marketplace.', (S) => S.stats.trades >= 50, { coins: 2000, xp: 1500 });
  A('a_tablets', 'Archaeologist', 'Read all 12 ancient tablets.', (S) => Object.keys(S.tablets).length >= 12, { coins: 10000, xp: 10000 });
  A('a_maxbiz', 'Fully Upgraded', 'Upgrade any building to its maximum level.', (S) => S.buildings.some((b) => b.type !== 'townhall' && GF.BUILDINGS[b.type].maxLevel > 1 && b.level >= GF.BUILDINGS[b.type].maxLevel), { coins: 5000, xp: 5000 });
  A('a_town8', 'Metropolis', 'Upgrade the Town Hall to level 8.', (S) => GF.settleLevel(S) >= 8, { coins: 200000, xp: 100000 });
  A('a_abyss10', 'Into the Abyss', 'Reach Abyss floor 10.', (S) => S.stats.abyss >= 10, { coins: 50000, xp: 30000 });
  A('a_abyss25', 'Abyss Walker', 'Reach Abyss floor 25.', (S) => S.stats.abyss >= 25, { coins: 300000, xp: 100000 });
  A('a_nohit', 'Untouchable', 'Defeat any boss without taking damage.', (S) => Object.keys(S.stats.bossNoHit).length > 0, { coins: 10000, xp: 10000 });
  for (const id in GF.BOSSES) A('a_boss_' + id, `Slayer of ${GF.BOSSES[id].name.replace('The ', '').replace('THE ', '')}`, `Defeat ${GF.BOSSES[id].name}.`, (S) => !!S.bosses[id], { coins: Math.round(GF.BOSSES[id].coins * 0.1), xp: Math.round(GF.BOSSES[id].xp * 0.1) });
  A('a_giant', 'GIANT SLAYER', 'Defeat the Giant and save the world.', (S) => !!S.bosses.giant, { coins: 250000, xp: 150000 });
  function checkAchievements(S) {
    const meta = GF.loadMeta();
    for (const a of ACH) {
      if (S.ach[a.id]) continue;
      let ok = false;
      try { ok = a.test(S); } catch (e) { ok = false; }
      if (!ok) continue;
      S.ach[a.id] = true;
      meta.achievements[a.id] = true;
      S.coins += a.reward.coins || 0; S.stats.earned += a.reward.coins || 0; GF.addXp(S, a.reward.xp || 0);
      notify(`Achievement: ${a.name}  (+${U.fmt(a.reward.coins || 0)} Crowns)`, 'ach');
      GF.hooks.fx('quest');
    }
    GF.saveMeta();
  }

  // ---------------------------------------------------------------- final preparation checklist
  function finalPrep(S) {
    const items = [];
    const add = (label, cur, max, hint) => items.push({ label, cur: Math.min(cur, max), max, done: cur >= max, hint });
    add('Reach the Giant\'s Realm', S.discovered.giant ? 1 : 0, 1, 'Defeat the Ancient Warden and cross the Giant\'s Gate.');
    add('Wield a Giant-Slayer weapon (tier 8+)', GF.bestOwned(S, 'giantBane', 1) ? 1 : 0, 1, 'Forge it at the Ancient Forge (boss materials + star cores).');
    add('Wear Starforged armor or better (tier 7+)', GF.ITEMS[S.equip.armor] && GF.ITEMS[S.equip.armor].tier >= 7 ? 1 : 0, 1, 'Craft and equip Starforged Plate or Giant-Slayer Plate.');
    add('Town Hall level 6', GF.settleLevel(S), 6, 'Upgrade the Town Hall.');
    add('Expedition fund paid (50,000 Crowns)', S.questPaid.q_fund || 0, 50000, 'Pay the Foreman in the quest log.');
    add('Read all 12 ancient tablets', Object.keys(S.tablets).length, 12, 'Search every region for tablets.');
    add("Carry the Giant's Key", GF.total(S, 'giant_key'), 1, 'Craft it at the Ancient Forge.');
    add('Defeat all five guardians', ['guardian', 'forestking', 'wyrm', 'titan', 'warden'].filter((b) => S.bosses[b]).length, 5, 'Each boss drops a material the Key needs.');
    return items;
  }
  function giantReady(S) { return finalPrep(S).every((x) => x.done); }

  Object.assign(GF, {
    ACHIEVEMENTS: ACH, questProgress: progress, questAvailable: isAvailable, activeMain, payQuest, payBlocker, completeQuest: complete, checkQuests, genBoard, acceptBoard, abandonBoard,
    deliverBoard, checkAchievements, finalPrep, giantReady, questById, snapshotStats: snapshot,
  });
})(typeof window !== 'undefined' ? window : globalThis);

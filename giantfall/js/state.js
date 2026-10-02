// Game state, inventory, effects, levelling and saving. No DOM here so it can be unit-tested in Node.
(function (root) {
  'use strict';
  const GF = root.GF;
  const U = GF.util;
  const SAVE_VERSION = 1;

  // UI/game layers replace these hooks; the defaults make logic usable headless (tests).
  GF.hooks = { notify() {}, fx() {}, sound() {}, floatText() {} };
  const notify = (m, t) => GF.hooks.notify(m, t || 'info');

  GF.S = null;

  function newState(o) {
    const start = GF.STARTS[o.start] || GF.STARTS.wanderer;
    const meta = o.meta || GF.loadMeta();
    const seed = U.strSeed(o.seed === undefined || o.seed === '' ? String(Math.floor(Math.random() * 2e9)) : o.seed);
    const S = {
      v: SAVE_VERSION, name: o.name || 'Hero', seed, seedText: String(o.seed || seed), start: o.start || 'wanderer', diff: o.diff || 'standard',
      created: Date.now(), savedAt: Date.now(), time: GF.DAY_SEC * 0.15, playTime: 0, ngPlus: meta.prestiges || 0,
      coins: start.coins + (meta.perks.coins || 0) * 500, xp: 0, level: 1, sp: 0, skills: {},
      inv: {}, stash: {}, equip: {}, quick: [null, null, null, null, null, null, null, null], bagLevel: 0,
      cosm: { owned: {}, hat: null, cape: null },
      hp: 100, buffs: {}, mana: 0,
      unlocked: { greenlands: true }, discovered: { greenlands: true }, bosses: {}, bossFirst: {}, ascended: {},
      questDone: {}, questPaid: {}, board: [], boardDay: -1, tracked: [],
      stats: { got: {}, crafted: {}, killed: {}, built: {}, harvested: {}, sold: 0, earned: 0, spent: 0, planted: 0, orders: 0, trades: 0, deaths: 0, dungeons: {}, abyss: 0, nodes: 0, bossNoHit: {} },
      tablets: {}, buildings: [], land: 0, nextUid: 1,
      techs: {}, rp: 0, researching: null,
      market: { mod: {}, satur: {}, stock: {}, rand: {}, listings: [], offers: [], orders: [], day: -1, orderDay: -1, offerTime: 0 },
      events: { active: null, next: GF.DAY_SEC * 0.9, history: [], boom: 0, caravanUntil: 0 },
      nodeRespawn: {}, ach: {}, flags: {}, pos: { x: GF.HOME.x + 0.5, y: GF.HOME.y + 3.5 }, fxVer: 0, carryCache: -1,
      power: { supply: 0, demand: 0, eff: 1 }, pop: { pop: 2, need: 0, eff: 1 }, away: null, hubTimer: 0, invasion: null, coalTimer: 0,
      sessionStart: Date.now(),
    };
    for (const k in start.items) S.inv[k] = (S.inv[k] || 0) + start.items[k];
    if (meta.perks.tools) { S.inv.pickaxe2 = 1; S.inv.axe2 = 1; }
    S.hp = maxHp(S);
    // town hall is always present
    S.buildings.push({ uid: S.nextUid++, type: 'townhall', x: 94, y: 73, level: 1 });
    return S;
  }

  // ---------------------------------------------------------------- inventory
  function carry(S) {
    let n = 0;
    for (const k in S.inv) n += S.inv[k];
    return n;
  }
  function capacity(S) {
    let c = GF.BAG_CAP[S.bagLevel] || GF.BAG_CAP[0];
    const tr = S.equip.trans && GF.ITEMS[S.equip.trans];
    if (tr) c += tr.cap;
    c += fx(S, 'bag');
    return Math.floor(c);
  }
  function count(S, id) { return S.inv[id] || 0; }
  function stashCount(S, id) { return S.stash[id] || 0; }
  function total(S, id) { return (S.inv[id] || 0) + (S.stash[id] || 0); }
  function stashUsed(S) { let n = 0; for (const k in S.stash) n += S.stash[k]; return n; }
  function stashCap(S) {
    let c = GF.BASE_STASH;
    for (const b of S.buildings) if (b.type === 'warehouse') c += GF.BIZ.warehouse.cap[b.level - 1];
    return Math.floor(c * (1 + fx(S, 'stash')));
  }
  /** Add to the bag; returns how many did NOT fit. */
  function add(S, id, n, opt) {
    n = Math.floor(n);
    if (!GF.ITEMS[id] || n <= 0) return 0;
    const room = Math.max(0, capacity(S) - carry(S));
    const put = Math.min(room, n);
    if (put > 0) {
      S.inv[id] = (S.inv[id] || 0) + put;
      if (!opt || !opt.noStat) S.stats.got[id] = (S.stats.got[id] || 0) + put;
    }
    return n - put;
  }
  function remove(S, id, n) {
    const have = S.inv[id] || 0;
    const r = Math.min(have, Math.floor(n));
    if (r <= 0) return 0;
    S.inv[id] = have - r;
    if (S.inv[id] <= 0) delete S.inv[id];
    return r;
  }
  function stashAdd(S, id, n, opt) {
    n = Math.floor(n);
    if (!GF.ITEMS[id] || n <= 0) return 0;
    const room = Math.max(0, stashCap(S) - stashUsed(S));
    const put = Math.min(room, n);
    if (put > 0) {
      S.stash[id] = (S.stash[id] || 0) + put;
      if (!opt || !opt.noStat) S.stats.got[id] = (S.stats.got[id] || 0) + put;
    }
    return n - put;
  }
  function stashRemove(S, id, n) {
    const have = S.stash[id] || 0;
    const r = Math.min(have, Math.floor(n));
    if (r <= 0) return 0;
    S.stash[id] = have - r;
    if (S.stash[id] <= 0) delete S.stash[id];
    return r;
  }
  /** Take from bag first, then stash. Returns true if the full amount was removed. */
  function take(S, id, n) {
    if (total(S, id) < n) return false;
    const a = remove(S, id, n);
    if (a < n) stashRemove(S, id, n - a);
    return true;
  }
  function canAfford(S, cost) {
    if ((cost.coins || 0) > S.coins) return false;
    for (const k in (cost.items || {})) if ((cost.items[k] || 0) > 0 && total(S, k) < cost.items[k]) return false;
    return true;
  }
  function pay(S, cost) {
    if (!canAfford(S, cost)) return false;
    S.coins -= cost.coins || 0;
    S.stats.spent += cost.coins || 0;
    for (const k in (cost.items || {})) if (cost.items[k] > 0) take(S, k, cost.items[k]);
    return true;
  }
  /** Overflow-safe giving: bag, then stash. Returns count lost. */
  function give(S, id, n, opt) {
    let left = add(S, id, n, opt);
    if (left > 0) left = stashAdd(S, id, left, opt);
    return left;
  }

  // ---------------------------------------------------------------- effects (skills, gear, techs, buffs)
  function fx(S, name) {
    let v = 0;
    const st = GF.STARTS[S.start];
    if (st && st.fx[name]) v += st.fx[name];
    for (const k in S.skills) { const sk = GF.SKILLS[k]; if (sk && sk.fx[name]) v += sk.fx[name] * S.skills[k]; }
    const ch = S.equip.charm && GF.ITEMS[S.equip.charm];
    if (ch && ch.fx && ch.fx[name]) v += ch.fx[name];
    const tr = S.equip.trans && GF.ITEMS[S.equip.trans];
    if (tr && name === 'speed' && tr.spd) v += tr.spd;
    for (const k in S.techs) { const t = GF.TECHS[k]; if (t && t.fx && t.fx[name]) v += t.fx[name]; }
    const meta = GF.meta;
    if (meta && meta.perks) {
      const P = meta.perks;
      if (name === 'income' && P.income) v += 0.05 * P.income;
      if (name === 'xp' && P.xp) v += 0.05 * P.xp;
      if (name === 'gather' && P.gather) v += 0.08 * P.gather;
      if (name === 'dmg' && P.dmg) v += 0.04 * P.dmg;
    }
    const now = S.time;
    const b = S.buffs;
    if (name === 'dmg' && ((b.str || 0) > now || (b.supreme || 0) > now)) v += 0.25;
    if (name === 'def' && (b.def || 0) > now) v += 0.35;
    if (name === 'def' && (b.supreme || 0) > now) v += 0.30;
    if (name === 'speed' && (b.speed || 0) > now) v += 0.25;
    if (name === 'biz' && S.events.boom > now) v += 1.0;
    return v;
  }
  function maxHp(S) {
    const ar = S.equip.armor && GF.ITEMS[S.equip.armor];
    return Math.max(40, Math.floor(100 + 15 * (S.level - 1) + (ar ? ar.hp : 0) + fx(S, 'hp')));
  }
  function defense(S) {
    const ar = S.equip.armor && GF.ITEMS[S.equip.armor];
    return (ar ? ar.def : 0) * (1 + fx(S, 'def'));
  }
  function weapon(S) { return S.equip.weapon ? GF.ITEMS[S.equip.weapon] : null; }
  function playerDamage(S) {
    const w = weapon(S);
    const base = w ? w.dmg : 4;
    return base * (1 + 0.04 * (S.level - 1)) * (1 + fx(S, 'dmg'));
  }
  function toolPower(S, kind) { // kind pick|axe|hand
    const id = kind === 'pick' ? S.equip.pick : kind === 'axe' ? S.equip.axe : null;
    const it = id && GF.ITEMS[id];
    const base = it ? it.power : GF.POWER[0];
    return base * (1 + fx(S, 'gather'));
  }
  function toolTier(S, kind) {
    const id = kind === 'pick' ? S.equip.pick : kind === 'axe' ? S.equip.axe : null;
    const it = id && GF.ITEMS[id];
    return it ? it.tier : 0;
  }
  function rankName(level) {
    let r = GF.TIERS[0][1];
    for (const [l, n] of GF.TIERS) if (level >= l) r = n;
    return S_isSlayer() ? 'Giant Slayer' : r;
  }
  function S_isSlayer() { return !!(GF.S && GF.S.bosses && GF.S.bosses.giant); }
  function rankIndex(level) { let r = 0; GF.TIERS.forEach(([l], i) => { if (level >= l) r = i; }); return r; }

  // ---------------------------------------------------------------- xp / levels
  function addXp(S, n, noMult) {
    if (n <= 0) return;
    const d = GF.DIFFICULTY[S.diff] || GF.DIFFICULTY.standard;
    if (!noMult) n *= d.xp * (1 + fx(S, 'xp'));
    n = Math.max(1, Math.round(n));
    S.xp += n;
    while (S.level < GF.MAX_LEVEL && S.xp >= GF.xpNext(S.level)) {
      S.xp -= GF.xpNext(S.level);
      S.level++;
      S.sp++;
      S.hp = maxHp(S);
      notify(`LEVEL UP! You are now level ${S.level} (${rankName(S.level)}). +1 skill point.`, 'level');
      GF.hooks.fx('levelup');
    }
    if (S.level >= GF.MAX_LEVEL) S.xp = Math.min(S.xp, GF.xpNext(GF.MAX_LEVEL - 1));
  }
  function spendSkill(S, id) {
    const sk = GF.SKILLS[id];
    if (!sk || S.sp < 1) return false;
    const r = S.skills[id] || 0;
    if (r >= sk.max) return false;
    if (sk.minLevel && S.level < sk.minLevel) return false;
    S.sp--; S.skills[id] = r + 1;
    return true;
  }

  // ---------------------------------------------------------------- equipment
  function equip(S, id) {
    const it = GF.ITEMS[id];
    if (!it || !it.slot || !(S.inv[id] > 0)) return false;
    const prev = S.equip[it.slot];
    remove(S, id, 1);
    if (prev) { S.inv[prev] = (S.inv[prev] || 0) + 1; }
    S.equip[it.slot] = id;
    S.hp = Math.min(S.hp, maxHp(S));
    return true;
  }
  function unequip(S, slot) {
    const id = S.equip[slot];
    if (!id) return false;
    if (capacity(S) - carry(S) < 1) return false;
    delete S.equip[slot];
    S.inv[id] = (S.inv[id] || 0) + 1;
    S.hp = Math.min(S.hp, maxHp(S));
    return true;
  }
  /** Auto-equip upgrades so the player never forgets (only if slot is empty or the new item is better). */
  function autoEquip(S, id) {
    const it = GF.ITEMS[id];
    if (!it || !it.slot) return;
    const cur = S.equip[it.slot] && GF.ITEMS[S.equip[it.slot]];
    const better = !cur || (it.tier || 0) > (cur.tier || 0) || (it.cap || 0) > (cur.cap || 0);
    if (it.slot === 'charm' && cur) return;
    if (better) equip(S, id);
  }
  function ownedItem(S, id) { return total(S, id) + (Object.values(S.equip).includes(id) ? 1 : 0); }
  function bestOwned(S, key, min) { // does the player own/equip an item with item[key] >= min
    for (const id in GF.ITEMS) {
      const it = GF.ITEMS[id];
      if (it[key] >= min && ownedItem(S, id) > 0) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- time
  function dayFrac(S) { return (S.time % GF.DAY_SEC) / GF.DAY_SEC; }
  function dayNumber(S) { return Math.floor(S.time / GF.DAY_SEC) + 1; }
  function isNight(S) { const f = dayFrac(S); return f > 0.72 || f < 0.04; }

  // ---------------------------------------------------------------- settlement helpers
  function buildingsOf(S, type) { return S.buildings.filter((b) => b.type === type); }
  function settleLevel(S) { const t = S.buildings.find((b) => b.type === 'townhall'); return t ? t.level : 1; }
  function hasStation(S, station) {
    if (station === 'camp') return true;
    return S.buildings.some((b) => GF.BUILDINGS[b.type].station === station);
  }
  function stationLevel(S, station) {
    let L = 0;
    for (const b of S.buildings) if (GF.BUILDINGS[b.type].station === station) L = Math.max(L, b.level);
    return L;
  }
  function nearHome(S, x, y) { return U.dist(x, y, GF.HOME.x, GF.HOME.y) < 22; }

  // ---------------------------------------------------------------- unlock conditions ("boss:guardian", "tech:alchemy", ...)
  function condMet(S, cond) {
    if (!cond || cond === 'start') return true;
    const [k, v] = cond.split(':');
    if (k === 'boss') return !!S.bosses[v];
    if (k === 'tech') return !!S.techs[v];
    if (k === 'quest') return !!S.questDone[v];
    if (k === 'region') return !!S.discovered[v];
    if (k === 'level') return S.level >= Number(v);
    return false;
  }
  function condText(cond) {
    if (!cond || cond === 'start') return '';
    const [k, v] = cond.split(':');
    if (k === 'boss') return `Defeat ${GF.BOSSES[v] ? GF.BOSSES[v].name : v}`;
    if (k === 'tech') return `Research ${GF.TECHS[v] ? GF.TECHS[v].name : v}`;
    if (k === 'quest') { const q = GF.QUESTS.find((x) => x.id === v); return `Complete quest: ${q ? q.title : v}`; }
    if (k === 'region') return `Discover ${GF.REGIONS[v] ? GF.REGIONS[v].name : v}`;
    if (k === 'level') return `Reach level ${v}`;
    return cond;
  }

  // ---------------------------------------------------------------- persistence
  const KEY = (slot) => 'giantfall:slot' + slot;
  GF.meta = null;
  function defaultMeta() { return { legacy: 0, spent: 0, perks: {}, prestiges: 0, achievements: {}, bestAbyss: 0, wins: 0, bestTime: 0 }; }
  function loadMeta() {
    if (GF.meta) return GF.meta;
    let m = null;
    try { m = JSON.parse(root.localStorage.getItem('giantfall:meta') || 'null'); } catch (e) { m = null; }
    GF.meta = Object.assign(defaultMeta(), m || {});
    GF.meta.perks = GF.meta.perks || {};
    return GF.meta;
  }
  function saveMeta() { try { root.localStorage.setItem('giantfall:meta', JSON.stringify(GF.meta)); } catch (e) { /* ignore */ } }

  function validate(S) {
    if (!S || typeof S !== 'object' || S.v !== SAVE_VERSION) return false;
    if (!S.inv || !S.stash || !S.buildings || !S.stats || typeof S.coins !== 'number' || !isFinite(S.coins)) return false;
    return true;
  }
  /** Crash-safe: write a temp copy, verify it parses, then replace the real save. */
  function saveGame(S, slot) {
    S.savedAt = Date.now();
    S.playTime = S.playTime || 0;
    const json = JSON.stringify(S, (k, v) => (k === 'fxCache' ? undefined : v));
    const ls = root.localStorage;
    ls.setItem(KEY(slot) + ':tmp', json);
    if (!validate(JSON.parse(ls.getItem(KEY(slot) + ':tmp')))) throw new Error('save verification failed');
    ls.setItem(KEY(slot), json);
    ls.removeItem(KEY(slot) + ':tmp');
    return json.length;
  }
  function loadGame(slot) {
    const ls = root.localStorage;
    for (const k of [KEY(slot), KEY(slot) + ':tmp']) {
      const raw = ls.getItem(k);
      if (!raw) continue;
      try { const S = JSON.parse(raw); if (validate(S)) return S; } catch (e) { /* try next */ }
    }
    return null;
  }
  function slotInfo(slot) {
    try {
      const raw = root.localStorage.getItem(KEY(slot));
      if (!raw) return null;
      const S = JSON.parse(raw);
      if (!validate(S)) return { damaged: true };
      return { name: S.name, level: S.level, coins: S.coins, savedAt: S.savedAt, bosses: Object.keys(S.bosses).length, won: !!S.bosses.giant, diff: S.diff, play: S.playTime };
    } catch (e) { return { damaged: true }; }
  }
  function deleteSlot(slot) { const ls = root.localStorage; ls.removeItem(KEY(slot)); ls.removeItem(KEY(slot) + ':tmp'); }

  Object.assign(GF, {
    newState, carry, capacity, count, stashCount, total, stashUsed, stashCap, add, remove, stashAdd, stashRemove, take, canAfford, pay, give,
    fx, maxHp, defense, weapon, playerDamage, toolPower, toolTier, rankName, rankIndex, addXp, spendSkill,
    equip, unequip, autoEquip, ownedItem, bestOwned, dayFrac, dayNumber, isNight, buildingsOf, settleLevel, hasStation, stationLevel, nearHome,
    condMet, condText, loadMeta, saveMeta, saveGame, loadGame, slotInfo, deleteSlot, validate, defaultMeta, SAVE_VERSION,
  });
})(typeof window !== 'undefined' ? window : globalThis);

// Logic tests (no browser): data integrity, obtainability, economy, save round trip, dungeons, quest chain.
const { loadGame } = require('./load');
const GF = loadGame(['world']);
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };

// ---- obtainable items: raw sources
const src = new Set();
for (const n of Object.values(GF.NODES)) for (const d of n.drops) src.add(d[0]);
for (const e of Object.values(GF.ENEMIES)) for (const d of (e.drops || [])) src.add(d[0]);
for (const l of Object.values(GF.LOOT)) for (const d of l) src.add(d[0]);
for (const b of Object.values(GF.BOSSES)) { for (const d of b.drops) src.add(d[0]); for (const d of (b.first || [])) src.add(d[0]); }
for (const s of Object.values(GF.SHOPS)) for (const e of s.sells) src.add(e.item);
for (const r of GF.RECIPES) src.add(r.out);
for (const c of GF.CROPS) src.add(c);
for (const b of Object.values(GF.BIZ)) for (const l of (b.lines || [])) src.add(l.item);
for (const b of Object.values(GF.BIZ)) for (const p of (b.proc || b.recipes || [])) { if (p.out) src.add(p.out); }
for (const q of GF.QUESTS) for (const k of Object.keys(q.reward && q.reward.items || {})) src.add(k);
const missing = [];
for (const r of GF.RECIPES) for (const k of Object.keys(r.ing)) if (!src.has(k)) missing.push(r.out + ' needs ' + k);
ok(!missing.length, 'unobtainable ingredients: ' + missing.join('; '));

// ---- economy: buying is never cheaper than selling back
const S = GF.newState({ name: 't', seed: 'x', start: 'wanderer', diff: 'standard' });
for (const [sid, shop] of Object.entries(GF.SHOPS)) for (const e of shop.sells) {
  const it = GF.ITEMS[e.item]; if (!it) { ok(false, 'shop item missing ' + e.item); continue; }
  const buy = GF.buyPrice(S, sid, e);
  ok(buy > it.value * 0.9, `${sid}:${e.item} buy ${buy} vs value ${it.value}`);
}
// recipe crafting never creates value from nothing too absurdly (output sells > ingredients costs is fine, but not 20x)
let greedy = [];
for (const r of GF.RECIPES) { const inV = Object.entries(r.ing).reduce((a, [k, n]) => a + (GF.ITEMS[k].value * n), 0); const outV = GF.ITEMS[r.out].value * r.qty; if (outV > inV * 6 && outV > 50) greedy.push(`${r.out} ${Math.round(outV)}/${Math.round(inV)}`); }
console.log('high-margin recipes:', greedy.join(', ') || 'none');

// ---- save / load round trip
GF.S = S; S.coins = 12345; GF.add(S, 'iron_sword', 1);
GF.saveGame(S, 2);
const L = GF.loadGame(2);
ok(L && L.coins === 12345 && GF.count(L, 'iron_sword') === 1, 'save round trip');
ok(GF.slotInfo(2).name === 't', 'slotInfo');
GF.deleteSlot(2); ok(!GF.slotInfo(2), 'delete slot');

// ---- world + dungeons
const over = GF.genOverworld(GF.util.strSeed('abc'));
ok(over.portals.length >= 7, 'portals ' + over.portals.length);
for (const did of Object.keys(GF.DUNGEONS)) {
  for (const seed of [1, 7, 99]) {
    const g = GF.genDungeon(did, seed, { sealed: !!GF.DUNGEONS[did].seal });
    ok(!!g.arena && !!g.start, did + ' arena/start');
  }
}

// ---- quest chain: main quests are in order, rewards reference real things
const main = GF.QUESTS.filter((q) => q.main);
ok(main.length >= 25, 'main quests ' + main.length);
for (const q of GF.QUESTS) for (const k of Object.keys((q.reward && q.reward.items) || {})) ok(!!GF.ITEMS[k], `quest ${q.id} reward ${k}`);

// ---- balance: income per hour with a basic settlement
const T = GF.newState({ name: 't', seed: 'y', start: 'wanderer', diff: 'standard' });
console.log(`recipes ${GF.RECIPES.length}, items ${Object.keys(GF.ITEMS).length}, quests ${GF.QUESTS.length}, buildings ${Object.keys(GF.BUILDINGS).length}`);
console.log(fails ? `${fails} FAILURES` : 'ALL LOGIC TESTS PASSED');
process.exit(fails ? 1 : 0);

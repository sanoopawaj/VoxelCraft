// Crafting: station + unlock checks, ingredient use from bag and stash.
(function (root) {
  'use strict';
  const GF = root.GF;
  const U = GF.util;

  const CATS = [['all', 'All'], ['tools', 'Tools'], ['weapons', 'Weapons'], ['armor', 'Armor'], ['materials', 'Materials'], ['tech', 'Components'], ['machines', 'Machines'],
    ['farming', 'Farming'], ['food', 'Food'], ['potions', 'Potions'], ['gear', 'Charms'], ['transport', 'Transport'], ['prep', 'Boss Prep'], ['misc', 'Misc']];
  const STATION_NAMES = { camp: 'Campfire (anywhere)', furnace: 'Furnace', smithy: 'Smithy', workshop: 'Workshop', factory: 'Factory', lab: 'Research Lab', kitchen: 'Bakery (kitchen)', ancient_forge: 'Ancient Forge', star_forge: 'Star Forge' };

  const unlocked = (S, r) => GF.condMet(S, r.unlock);
  function stationOk(S, r) { return GF.hasStation(S, r.station); }
  function saveChance(S, r) {
    const L = GF.stationLevel(S, r.station);
    return Math.min(0.6, GF.fx(S, 'craftSave') + (r.station === 'camp' ? 0 : 0.04 * Math.max(0, L - 1)));
  }
  function maxCraft(S, r) {
    let n = 999;
    for (const k in r.ing) n = Math.min(n, Math.floor(GF.total(S, k) / r.ing[k]));
    return n;
  }
  /** Why can't this be crafted? returns '' when it can. pos is the player position (stations only work near home). */
  function blocker(S, r, n, pos) {
    n = n || 1;
    if (!unlocked(S, r)) return 'Locked: ' + GF.condText(r.unlock);
    if (!stationOk(S, r)) return `Build a ${STATION_NAMES[r.station]} first.`;
    if (r.station !== 'camp' && pos && !GF.nearHome(S, pos.x, pos.y)) return 'Return to your settlement to use this station.';
    if (maxCraft(S, r) < n) return 'Missing ingredients.';
    const it = GF.ITEMS[r.out];
    if (!it.slot && GF.capacity(S) - GF.carry(S) < r.qty * n && GF.stashCap(S) - GF.stashUsed(S) < r.qty * n) return 'No room for the result.';
    return '';
  }
  function craft(S, r, n, pos) {
    n = Math.max(1, Math.floor(n || 1));
    const why = blocker(S, r, n, pos);
    if (why) return { ok: false, msg: why };
    const chance = saveChance(S, r);
    let freed = 0, made = 0;
    for (let i = 0; i < n; i++) {
      if (maxCraft(S, r) < 1) break;
      if (Math.random() < chance) freed++;
      else for (const k in r.ing) GF.take(S, k, r.ing[k]);
      made += r.qty;
    }
    const left = GF.give(S, r.out, made, { noStat: true });
    S.stats.crafted[r.out] = (S.stats.crafted[r.out] || 0) + made;
    const it = GF.ITEMS[r.out];
    GF.addXp(S, Math.max(2, it.value * made * 0.08));
    if (it.slot) GF.autoEquip(S, r.out);
    return { ok: true, msg: `Crafted ${made} ${it.name}${freed ? ` (${freed} free!)` : ''}.`, lost: left };
  }
  /** Recipes that use an item (for "what is this good for?" tooltips). */
  function usesOf(id) { return GF.RECIPES.filter((r) => r.ing[id]).map((r) => GF.ITEMS[r.out].name); }

  Object.assign(GF, { CRAFT_CATS: CATS, STATION_NAMES, recipeUnlocked: unlocked, stationOk, saveChance, maxCraft, craftBlocker: blocker, craft, usesOf });
})(typeof window !== 'undefined' ? window : globalThis);

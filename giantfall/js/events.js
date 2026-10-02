// Random world events. This file schedules them and holds their rules; game.js spawns the world-side objects.
(function (root) {
  'use strict';
  const GF = root.GF;
  const U = GF.util;
  const notify = (m, t) => GF.hooks.notify(m, t || 'info');

  const DEFS = {
    resource_rush: { name: 'Resource Rush!', desc: 'Resource nodes everywhere yield DOUBLE for a few minutes.', dur: 210, weight: 14, min: 0 },
    caravan: { name: 'Merchant Caravan!', desc: 'A caravan has arrived in Hearthstead with rare goods and great sell prices.', dur: 240, weight: 10, min: 1 },
    treasure: { name: 'Treasure Hunt!', desc: 'A buried treasure has been marked on your map. Find and dig it up!', dur: 420, weight: 10, min: 0 },
    invasion: { name: 'Monster Invasion!', desc: 'Raiders are attacking Hearthstead! Defend your settlement.', dur: 100, weight: 9, min: 2 },
    meteors: { name: 'Meteor Shower!', desc: 'Meteorites have crashed nearby, rich with star ore. Hurry before they cool!', dur: 330, weight: 8, min: 2 },
    rare_find: { name: 'Rare Resource Discovery!', desc: 'Scouts report glittering rich veins nearby. They yield triple!', dur: 300, weight: 10, min: 1 },
    wanderer: { name: 'Traveling Merchant!', desc: 'A rare traveling merchant is wandering the region. Check your map!', dur: 360, weight: 9, min: 1 },
    boom: { name: 'Business Boom!', desc: 'The economy is booming: all your businesses produce DOUBLE.', dur: 150, weight: 11, min: 1 },
    rift: { name: 'Dungeon Rift!', desc: 'A rift to a treasure dungeon has opened. Loot awaits within!', dur: 330, weight: 8, min: 1 },
  };

  function pickEvent(S, r) {
    const bosses = Object.keys(S.bosses).length;
    const settle = GF.settleLevel(S);
    const list = Object.keys(DEFS).filter((k) => bosses >= DEFS[k].min && (k !== 'invasion' || settle >= 2) && (k !== 'boom' || S.buildings.length >= 3));
    let total = 0;
    for (const k of list) total += DEFS[k].weight;
    let x = r() * total;
    for (const k of list) { x -= DEFS[k].weight; if (x <= 0) return k; }
    return list[0];
  }
  function start(S, id) {
    const d = DEFS[id];
    S.events.active = { id, until: S.time + d.dur, spawned: false, started: S.time };
    if (id === 'caravan') S.events.caravanUntil = S.time + d.dur;
    if (id === 'boom') S.events.boom = S.time + d.dur;
    notify(`${d.name} ${d.desc}`, 'event');
    GF.hooks.fx('event');
    S.events.history.push(id);
    if (S.events.history.length > 20) S.events.history.shift();
  }
  function end(S) {
    const a = S.events.active;
    if (!a) return;
    notify(`${DEFS[a.id].name} has ended.`, 'info');
    S.events.active = null;
    S.events.next = S.time + 180 + Math.random() * 200;
    GF.hooks.endEvent && GF.hooks.endEvent(a);
  }
  function tick(S, dt) {
    const e = S.events;
    if (e.active) { if (S.time >= e.active.until) end(S); return; }
    if (S.time >= e.next && GF.S === S) {
      const r = U.rng((S.seed + Math.floor(S.time)) >>> 0);
      start(S, pickEvent(S, r));
    }
  }
  const nodeBonus = (S) => (S.events.active && S.events.active.id === 'resource_rush' ? 2 : 1);

  GF.EVENT_DEFS = DEFS;
  Object.assign(GF, { startEvent: start, endEvent: end, eventTick: tick, eventNodeBonus: nodeBonus, pickEvent });
})(typeof window !== 'undefined' ? window : globalThis);

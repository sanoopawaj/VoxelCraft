// Loads the game logic files into a Node context (no DOM) for tests and balance simulations.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
function loadGame(extra) {
  const store = {};
  const ctx = { console, Math, Date, JSON, Object, Array, Set, Map, Number, String, Boolean, isFinite, parseInt, parseFloat, performance: { now: () => Date.now() },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } };
  ctx.globalThis = ctx; ctx.window = undefined;
  vm.createContext(ctx);
  const files = ['util', 'data_items', 'data_world', 'data_game', 'state', 'economy', 'crafting', 'tycoon', 'quests', 'events'].concat(extra || []);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  return ctx.GF;
}
module.exports = { loadGame };

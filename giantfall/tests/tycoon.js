// Tycoon logic test: a minimal settlement should earn goods and money, and progress should be sane.
const { loadGame } = require('./load');
const GF = loadGame(['world']);
const S = GF.newState({ name: 't', seed: 's', start: 'wanderer', diff: 'standard' }); GF.S = S;
S.coins = 5000; for (const k of ['wood', 'stone', 'clay', 'plank', 'stone_brick', 'fiber', 'rope', 'cloth', 'coal', 'iron_ingot', 'iron_ore']) GF.stashAdd(S, k, 40);
const spot = (t) => { const z = GF.HOME; for (let y = z.y - 14; y < z.y + 16; y++) for (let x = z.x - 16; x < z.x + 16; x++) if (!GF.placeCheck(S, t, x, y)) return [x, y]; return null; };
const out = [];
for (const t of ['house', 'lumber', 'mine', 'furnace', 'bakery', 'warehouse']) {
  const sp = spot(t); if (!sp) { out.push(t + ': no spot / ' + GF.placeCheck(S, t, GF.HOME.x, GF.HOME.y)); continue; }
  const r = GF.build(S, t, sp[0], sp[1]); out.push(t + ': ' + r.msg);
}
console.log(out.join('\n'));
const c0 = S.coins, w0 = GF.stashCount(S, 'wood'), s0 = GF.stashCount(S, 'stone');
for (let i = 0; i < 120; i++) { GF.tickBusinesses(S, 5); S.time += 5; }  // 10 minutes
console.log('10 min: coins', c0, '->', Math.floor(S.coins), ' wood', w0, '->', GF.stashCount(S, 'wood'), ' stone', s0, '->', GF.stashCount(S, 'stone'));
console.log('population', GF.population(S), 'prosperity', GF.prosperity(S));
console.log('lumber stock', JSON.stringify(S.buildings.find((b) => b.type === 'lumber').stock)); const cr = GF.collect(S, S.buildings.find((b) => b.type === 'lumber').uid); console.log('collect', JSON.stringify(cr).slice(0, 120), 'wood now', GF.stashCount(S, 'wood'));
const bl = S.buildings.filter((b) => GF.BIZ[b.type]).map((b) => b.type + ':' + JSON.stringify(GF.bizReport(S, b)).slice(0, 120));
console.log(bl.join('\n'));

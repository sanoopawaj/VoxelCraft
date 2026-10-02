// Static game-system data: buildings, businesses, shops, quests, tech, skills, starts, achievements.
(function (root) {
  'use strict';
  const GF = root.GF;

  const DAY_SEC = 480; // one in-game day in real seconds

  // ---------------------------------------------------------------- buildings
  // kind: station | business | house | storage | defense | decor | utility | townhall
  // up: costs for level 2..max. Station buildings improve crafting (material-save chance) per level.
  const BUILDINGS = {};
  function B(id, name, w, h, kind, o) { BUILDINGS[id] = Object.assign({ id, name, w, h, kind, maxLevel: 1, settle: 1, maxCount: 1, up: [], prosp: 1, station: null, desc: '' }, o); }
  function ladder(n, c0, g, itemsFn, reqFn) {
    const out = [];
    for (let L = 2; L <= n; L++) out.push({ coins: Math.round(c0 * Math.pow(g, L - 2)), items: itemsFn ? itemsFn(L) : {}, req: reqFn ? reqFn(L) : null });
    return out;
  }
  B('townhall', 'Town Hall', 3, 3, 'townhall', {
    maxLevel: 8, cost: { coins: 0, items: {} }, prosp: 20, desc: 'The heart of Hearthstead. Upgrading raises your Settlement Level and unlocks new buildings.',
    up: [
      { coins: 600, items: { plank: 30, stone_brick: 30 }, req: null },
      { coins: 2500, items: { plank: 60, brick: 40, iron_bar: 12 }, req: 'guardian' },
      { coins: 9000, items: { darkplank: 40, steel_bar: 20, glass: 10 }, req: 'forestking' },
      { coins: 28000, items: { frostplank: 40, steel_bar: 30, crystal: 12, gear: 10 }, req: 'wyrm' },
      { coins: 75000, items: { obsidian: 30, adv_component: 8, ember_core: 10 }, req: 'titan' },
      { coins: 180000, items: { ancient_metal: 30, ancient_core: 3, adv_component: 12 }, req: 'warden' },
      { coins: 500000, items: { star_ore: 20, star_core: 4, giant_shard: 10 }, req: 'giant' },
    ],
  });
  B('furnace', 'Furnace', 2, 2, 'station', { station: 'furnace', cost: { coins: 60, items: { stone: 30, clay: 10 } }, maxLevel: 3, up: ladder(3, 300, 3, (L) => ({ brick: 10 * L }), null), prosp: 3, desc: 'Smelts ore into bars. Needed for iron tools and early armor. Upgrades save materials.' });
  B('lumber', 'Lumber Mill', 3, 3, 'business', { cost: { coins: 120, items: { wood: 30, stone: 20 } }, maxLevel: 5, up: ladder(5, 250, 2.6, (L) => ({ plank: 15 * L, iron_bar: L > 2 ? 4 * L : 0 }), null), prosp: 6, desc: 'Workers fell and saw timber for you. Collect the stockpile or automate delivery.' });
  B('field', 'Farm Field', 3, 3, 'field', { cost: { coins: 80, items: { wood: 15, fiber: 10 } }, maxLevel: 5, maxCount: 2, up: ladder(5, 200, 2.7, (L) => ({ plank: 8 * L, clay: L > 2 ? 10 : 0, glass: L >= 4 ? 8 * (L - 3) : 0 }), null), prosp: 5, desc: 'Nine plots to plant, water and harvest. Upgrades improve soil, irrigation and add a greenhouse.' });
  B('house', 'House', 2, 2, 'house', { cost: { coins: 150, items: { plank: 10, stone_brick: 8 } }, maxLevel: 3, maxCount: 2, up: ladder(3, 300, 2.5, (L) => ({ plank: 12 * L, brick: 8 * L }), null), prosp: 4, desc: 'Homes for workers. Residents staff your businesses and pay a little tax.' });
  B('mine', 'Mine', 3, 3, 'business', { settle: 2, cost: { coins: 400, items: { plank: 20, stone_brick: 20, iron_bar: 4 } }, maxLevel: 5, up: ladder(5, 700, 2.7, (L) => ({ plank: 12 * L, iron_bar: 6 * L, steel_bar: L > 3 ? 4 * (L - 3) : 0 }), null), prosp: 8, desc: 'Miners dig stone, coal and ore from the earth. Higher levels reach deeper seams.' });
  B('bakery', 'Bakery', 3, 2, 'business', { settle: 2, station: 'kitchen', cost: { coins: 350, items: { plank: 20, brick: 20, flour: 4 } }, maxLevel: 4, up: ladder(4, 600, 2.5, (L) => ({ brick: 12 * L, plank: 10 * L }), null), prosp: 6, desc: 'Turns wheat from your stash into bread for customers or for you. Also your kitchen for cooking recipes.' });
  B('workshop', 'Workshop', 3, 3, 'station', { settle: 2, station: 'workshop', cost: { coins: 500, items: { plank: 25, stone_brick: 25, iron_bar: 8, rope: 6 } }, maxLevel: 3, up: ladder(3, 1500, 3, (L) => ({ plank: 20 * L, gear: 2 * L }), null), prosp: 8, desc: 'Craft machines, charms, transport and boss seals. Upgrades save materials.' });
  B('trading_post', 'Trading Post', 3, 2, 'business', { settle: 2, cost: { coins: 450, items: { plank: 20, stone_brick: 15, cloth: 8 } }, maxLevel: 5, up: ladder(5, 900, 2.6, (L) => ({ plank: 10 * L, cloth: 6 * L, gold_bar: L > 2 ? L - 2 : 0 }), null), prosp: 8, desc: 'Customer orders, your Player Marketplace stall, better sell prices and trade income.' });
  B('warehouse', 'Warehouse', 3, 3, 'storage', { settle: 2, cost: { coins: 300, items: { plank: 25, stone_brick: 20 } }, maxLevel: 5, up: ladder(5, 600, 2.4, (L) => ({ plank: 20 * L, iron_bar: 4 * L }), null), prosp: 5, desc: 'Expands your stash and the capacity businesses can fill before they stop.' });
  B('tower', 'Watch Tower', 2, 2, 'defense', { settle: 2, maxCount: 4, cost: { coins: 250, items: { stone_brick: 25, plank: 8 } }, maxLevel: 4, up: ladder(4, 500, 2.6, (L) => ({ stone_brick: 20 * L, iron_bar: 3 * L }), null), prosp: 4, desc: 'Shoots raiders during Monster Invasions and protects your businesses.' });
  B('smithy', 'Smithy', 3, 2, 'station', { settle: 3, station: 'smithy', cost: { coins: 1800, items: { stone_brick: 30, iron_bar: 12, brick: 20 } }, maxLevel: 3, up: ladder(3, 4000, 3, (L) => ({ steel_bar: 6 * L, brick: 20 }), null), prosp: 10, desc: 'Forge steel, crystal and obsidian gear. Also smelts bars automatically from your stash.' });
  B('lab', 'Research Lab', 3, 3, 'business', { settle: 3, station: 'lab', cost: { coins: 2500, items: { glass: 12, plank: 30, iron_bar: 10, gear: 2 } }, maxLevel: 5, up: ladder(5, 3500, 2.5, (L) => ({ glass: 10 * L, steel_bar: 4 * L, circuit: L > 2 ? L - 2 : 0 }), null), prosp: 12, desc: 'Generates research points for the tech tree and lets you brew potions.' });
  B('factory', 'Factory', 4, 3, 'business', { settle: 4, station: 'factory', cost: { coins: 9000, items: { steel_bar: 20, gear: 8, brick: 40, glass: 10 } }, maxLevel: 5, up: ladder(5, 12000, 2.5, (L) => ({ steel_bar: 10 * L, gear: 6 * L, circuit: L }), null), prosp: 16, desc: 'Produces gears and wiring from your bars. Also your factory for advanced components.' });
  B('powerplant', 'Power Plant', 3, 3, 'business', { settle: 4, cost: { coins: 8000, items: { steel_bar: 12, gear: 6, brick: 30, glass: 6 } }, maxLevel: 5, up: ladder(5, 10000, 2.4, (L) => ({ steel_bar: 8 * L, gear: 4 * L, power_cell: L > 2 ? L - 2 : 0 }), null), prosp: 14, desc: 'Burns coal from your stash to power factories, labs, drones and miners.' });
  B('hub', 'Automation Hub', 3, 3, 'utility', { settle: 5, cost: { coins: 25000, items: { steel_bar: 20, gear: 12, circuit: 6, crystal: 6 } }, maxLevel: 4, up: ladder(4, 30000, 2.6, (L) => ({ steel_bar: 12 * L, circuit: 4 * L, crystal: 4 * L }), null), prosp: 20, desc: 'Conveyors link your businesses to the stash. Higher levels pull outputs more often.' });
  B('portal_hub', 'Portal Hub', 2, 2, 'utility', { settle: 5, cost: { coins: 20000, items: { crystal: 12, frost_core: 4, gear: 6 } }, prosp: 15, desc: 'Fast travel to the portal stones in regions you have conquered.' });
  B('ancient_forge', 'Ancient Forge', 3, 3, 'station', { settle: 6, station: 'ancient_forge', cost: { coins: 70000, items: { ancient_metal: 20, obsidian: 20, adv_component: 6, ember_core: 6 } }, maxLevel: 3, up: ladder(3, 100000, 2.5, (L) => ({ ancient_metal: 12 * L, adv_component: 4 * L }), null), prosp: 25, desc: 'Forge ancient and starforged equipment, cores and the Giant\'s Key.' });
  B('observatory', 'Observatory', 2, 2, 'utility', { settle: 6, maxLevel: 3, cost: { coins: 60000, items: { glass: 20, crystal: 12, ancient_metal: 8 } }, up: ladder(3, 90000, 2.2, (L) => ({ glass: 20, wraith_essence: 6 * L, relic: 6 * L }), null), prosp: 18, desc: 'Studies the Giant. Each level grants +6% damage against it.' });
  B('star_forge', 'Star Forge', 3, 3, 'business', { settle: 8, station: 'star_forge', cost: { coins: 400000, items: { star_ore: 30, giant_shard: 20, star_core: 3 } }, maxLevel: 3, up: ladder(3, 600000, 2.2, (L) => ({ star_ore: 30 * L, giant_shard: 15 * L, abyss_shard: 5 * L }), null), prosp: 40, desc: 'Endgame forge for Abyssal legendary gear. Slowly condenses giant shards.' });
  // decorations: prosperity + a small perk each
  B('lamp', 'Street Lamp', 1, 1, 'decor', { cost: { coins: 25, items: { stone: 4, coal: 2 } }, maxCount: 20, prosp: 1, desc: 'Lights the settlement at night.' });
  B('garden', 'Garden', 2, 2, 'decor', { cost: { coins: 120, items: { fiber: 10, herb: 0, stone: 6 } }, maxCount: 8, prosp: 3, desc: 'Flowers make workers happy (+prosperity).' });
  B('fountain', 'Fountain', 2, 2, 'decor', { settle: 2, cost: { coins: 600, items: { stone_brick: 20, glass: 2 } }, maxCount: 3, prosp: 8, desc: 'A pretty fountain: lots of prosperity.' });
  B('statue', 'Hero Statue', 2, 2, 'decor', { settle: 5, cost: { coins: 6000, items: { stone_brick: 40, gold_bar: 4, crystal: 4 } }, maxCount: 4, prosp: 25, desc: 'Celebrates your achievements.' });
  B('obelisk', 'Star Obelisk', 1, 2, 'decor', { settle: 7, cost: { coins: 40000, items: { star_ore: 4, ancient_metal: 6 } }, maxCount: 4, prosp: 60, desc: 'A monument of fallen-star metal.' });

  // Business production. rate = items per minute at level (array index L-1). req: region unlocked flag needed for that line.
  // inputs: consumed from the stash per cycle (processors). power: demand per level.
  const BIZ = {
    lumber: { wage: 2, cap: 80, lines: [
      { item: 'wood', rate: [5, 10, 12, 16, 20] }, { item: 'plank', rate: [0, 0, 4, 8, 12] }, { item: 'darkwood', rate: [0, 0, 0, 0, 4], req: 'forest' } ] },
    mine: { wage: 4, cap: 80, lines: [
      { item: 'stone', rate: [5, 8, 10, 12, 14] }, { item: 'coal', rate: [2, 4, 5, 6, 7] }, { item: 'iron_ore', rate: [0, 2, 3, 4, 5], req: 'stone' },
      { item: 'copper_ore', rate: [0, 0, 3, 4, 5], req: 'stone' }, { item: 'silver_ore', rate: [0, 0, 0, 1.5, 2.5], req: 'forest' },
      { item: 'quartz', rate: [0, 0, 0, 2, 3], req: 'stone' }, { item: 'gold_ore', rate: [0, 0, 0, 0, 1.5], req: 'frozen' }, { item: 'crystal', rate: [0, 0, 0, 0, 0.6], req: 'frozen' } ] },
    bakery: { wage: 3, cap: 60, cycles: [2, 4, 6, 8], recipe: { in: { wheat: 2 }, out: { bread: 1 } }, sellMult: 1.25 },
    smithy: { wage: 6, cap: 60, cycles: [2, 3, 4], power: 3, recipes: [
      { in: { iron_ore: 2, coal: 1 }, out: { iron_bar: 1 }, lvl: 1 }, { in: { copper_ore: 2, coal: 1 }, out: { copper_bar: 1 }, lvl: 1 },
      { in: { iron_bar: 2, coal: 2 }, out: { steel_bar: 1 }, lvl: 2 }, { in: { silver_ore: 2, coal: 1 }, out: { silver_bar: 1 }, lvl: 3 }, { in: { gold_ore: 2, coal: 1 }, out: { gold_bar: 1 }, lvl: 3 } ] },
    factory: { wage: 14, cap: 60, cycles: [2, 3, 4, 5, 6], power: 6, recipes: [
      { in: { iron_bar: 1, copper_bar: 1 }, out: { gear: 2 }, lvl: 1 }, { in: { copper_bar: 1 }, out: { wire: 3 }, lvl: 1 },
      { in: { wire: 2, quartz: 1, silver_bar: 1 }, out: { circuit: 1 }, lvl: 3 }, { in: { steel_bar: 2, circuit: 2, crystal: 1 }, out: { adv_component: 1 }, lvl: 5 } ] },
    lab: { wage: 20, cap: 0, rp: [4, 8, 12, 16, 20], power: 4 },
    powerplant: { wage: 10, cap: 0, supply: [12, 24, 36, 48, 60], coalPerMin: 2 },
    trading_post: { wage: 0, cap: 0, income: [5, 10, 18, 30, 50], listings: [3, 5, 8, 10, 14], sellBonus: [0.03, 0.06, 0.10, 0.15, 0.22], fee: [0.08, 0.07, 0.06, 0.05, 0.03] },
    star_forge: { wage: 60, cap: 40, lines: [{ item: 'giant_shard', rate: [0.15, 0.3, 0.5] }], power: 10 },
    hub: { interval: [60, 30, 15, 5] },
    house: { residents: [3, 4, 5] },
    warehouse: { cap: [600, 1200, 2000, 3200, 5000] },
    tower: { dmg: [30, 60, 110, 190] },
  };
  const BASE_STASH = 300;

  // ---------------------------------------------------------------- shops
  // sells: price = item.value * mult. stock = per-day quantity (-1 = unlimited). req = unlock condition.
  const SHOPS = {
    general: { name: 'General Merchant', buy: { all: 0.7 }, special: 'backpack',
      sells: [
        { item: 'wood', mult: 1.6, stock: -1 }, { item: 'stone', mult: 1.6, stock: -1 }, { item: 'fiber', mult: 1.6, stock: -1 }, { item: 'clay', mult: 1.5, stock: 40 },
        { item: 'coal', mult: 1.5, stock: 60 }, { item: 'plank', mult: 1.5, stock: 40 }, { item: 'rope', mult: 1.5, stock: 20 }, { item: 'cloth', mult: 1.5, stock: 20 },
        { item: 'stone_brick', mult: 1.5, stock: 40 }, { item: 'bread', mult: 1.5, stock: 20 }, { item: 'recall_scroll', mult: 1.6, stock: 10 },
        { item: 'handcart', mult: 1.4, stock: 1 } ] },
    blacksmith: { name: 'Blacksmith', buy: { all: 0.5, types: { mat: 0.78, weapon: 0.8, armor: 0.8, tool: 0.8, res: 0.62 } },
      sells: [
        { item: 'iron_bar', mult: 1.5, stock: 20 }, { item: 'copper_bar', mult: 1.5, stock: 20 }, { item: 'steel_bar', mult: 1.45, stock: 12, req: 'boss:guardian' },
        { item: 'iron_sword', mult: 1.5, stock: 1 }, { item: 'iron_armor', mult: 1.5, stock: 1 }, { item: 'pickaxe2', mult: 1.5, stock: 1 }, { item: 'axe2', mult: 1.5, stock: 1 },
        { item: 'steel_sword', mult: 1.5, stock: 1, req: 'boss:guardian' }, { item: 'steel_armor', mult: 1.5, stock: 1, req: 'boss:guardian' }, { item: 'steel_hammer', mult: 1.5, stock: 1, req: 'boss:guardian' },
        { item: 'crystal_sword', mult: 1.6, stock: 1, req: 'boss:forestking' }, { item: 'crystal_armor', mult: 1.6, stock: 1, req: 'boss:forestking' } ] },
    farmer: { name: 'Farmer', buy: { all: 0.5, types: { crop: 0.85, food: 0.8, seed: 0.5 } },
      sells: [
        { item: 'seed_wheat', mult: 1.3, stock: -1 }, { item: 'seed_carrot', mult: 1.3, stock: -1 }, { item: 'seed_pumpkin', mult: 1.3, stock: 30 },
        { item: 'seed_berry', mult: 1.3, stock: 30 }, { item: 'seed_moonbloom', mult: 1.6, stock: 6, req: 'boss:forestking' }, { item: 'seed_emberpepper', mult: 1.6, stock: 6, req: 'boss:wyrm' },
        { item: 'bonemeal', mult: 1.4, stock: 20 }, { item: 'wheat', mult: 1.5, stock: 20 }, { item: 'flour', mult: 1.5, stock: 20 } ] },
    engineer: { name: 'Engineer', buy: { all: 0.5, types: { part: 0.8, machine: 0.7, mat: 0.65 } },
      sells: [
        { item: 'gear', mult: 1.5, stock: 8, req: 'tech:engineering1' }, { item: 'wire', mult: 1.5, stock: 12, req: 'tech:engineering1' }, { item: 'circuit', mult: 1.5, stock: 4, req: 'tech:electrics' },
        { item: 'sprinkler', mult: 1.7, stock: 2, req: 'tech:agri1' }, { item: 'conveyor_kit', mult: 1.7, stock: 1, req: 'tech:engineering2' }, { item: 'auto_miner', mult: 1.8, stock: 1, req: 'tech:engineering2' },
        { item: 'power_cell', mult: 1.5, stock: 3, req: 'tech:electrics' }, { item: 'glass', mult: 1.4, stock: 20 } ] },
    adventurer: { name: 'Adventurer', buy: { all: 0.45, types: { drop: 0.82, boss: 0.7, res: 0.62 }, items: { relic: 0.9 } },
      sells: [
        { item: 'heal_potion', mult: 1.5, stock: 8, req: 'tech:alchemy' }, { item: 'bread', mult: 1.5, stock: 10 }, { item: 'stew', mult: 1.5, stock: 5 }, { item: 'recall_scroll', mult: 1.5, stock: 10 },
        { item: 'wooden_sword', mult: 1.5, stock: 1 }, { item: 'short_bow', mult: 1.5, stock: 1 }, { item: 'leather_armor', mult: 1.5, stock: 1 },
        { item: 'mule_pack', mult: 1.5, stock: 1 } ],
      random: [{ n: 2, mult: 1.9, pool: ['iron_spear', 'steel_bow', 'crystal_spear', 'obsidian_hammer', 'ember_bow', 'ancient_spear', 'swift_boots', 'magnet_ring'] }] },
    mystic: { name: 'Mystic Merchant', buy: { all: 0.5, types: { boss: 0.9, charm: 0.9 }, items: { crystal: 0.85, ember_crystal: 0.85, ancient_metal: 0.85, star_ore: 0.9, giant_shard: 0.9, wraith_essence: 0.9, frost_core: 0.85, ember_core: 0.85, relic: 0.95 } },
      sells: [
        { item: 'crystal', mult: 1.8, stock: 4, req: 'boss:forestking' }, { item: 'moonbloom', mult: 1.8, stock: 4 }, { item: 'greater_heal', mult: 1.6, stock: 3, req: 'tech:alchemy' },
        { item: 'elixir_str', mult: 1.6, stock: 3, req: 'tech:alchemy' }, { item: 'elixir_def', mult: 1.6, stock: 3, req: 'tech:alchemy' }, { item: 'ember_crystal', mult: 1.8, stock: 3, req: 'boss:wyrm' } ],
      random: [{ n: 2, mult: 2.2, pool: ['clover_charm', 'vitality_amulet', 'miner_charm', 'merchant_seal', 'frost_core', 'ember_core', 'wraith_essence', 'adv_component'] }] },
    caravan: { name: 'Caravan Merchant', buy: { all: 0.85 }, temporary: true,
      sells: [{ item: 'crystal', mult: 1.2, stock: 6 }, { item: 'obsidian', mult: 1.2, stock: 4, req: 'boss:wyrm' }, { item: 'gold_bar', mult: 1.2, stock: 6 }, { item: 'adv_component', mult: 1.3, stock: 2 }, { item: 'seed_moonbloom', mult: 1.1, stock: 6 }] },
  };
  const BAG_CAP = [80, 120, 170, 230, 300, 400, 560];
  const BAG_COST = [0, 150, 500, 1800, 6000, 20000, 75000];
  const COSMETICS = [
    { id: 'straw_hat', name: 'Straw Hat', slot: 'hat', cost: 60, col: '#e8d080' }, { id: 'hard_hat', name: 'Hard Hat', slot: 'hat', cost: 250, col: '#f0b030' },
    { id: 'top_hat', name: 'Top Hat', slot: 'hat', cost: 900, col: '#2a2a35' }, { id: 'wizard_hat', name: 'Wizard Hat', slot: 'hat', cost: 3000, col: '#5a4ab0' },
    { id: 'crown', name: 'Golden Crown', slot: 'hat', cost: 25000, col: '#ffd24a' },
    { id: 'red_cape', name: 'Red Cape', slot: 'cape', cost: 300, col: '#c03040' }, { id: 'blue_cape', name: 'Blue Cape', slot: 'cape', cost: 300, col: '#3050c0' },
    { id: 'gold_cape', name: 'Gold Cape', slot: 'cape', cost: 8000, col: '#e8b830' }, { id: 'giant_cape', name: "Giant-Slayer's Cloak", slot: 'cape', cost: 100000, col: '#ff7a3a', req: 'boss:giant' },
  ];

  // ---------------------------------------------------------------- progression
  const TIERS = [
    [1, 'Beginner'], [5, 'Worker'], [10, 'Builder'], [15, 'Industrialist'], [20, 'Adventurer'], [28, 'Master'], [36, 'Legend'], [45, 'Giant Slayer'],
  ];
  const MAX_LEVEL = 60;
  const xpNext = (L) => Math.floor(50 * Math.pow(L, 1.65));

  const SKILLS = {
    gathering: { name: 'Gatherer', max: 10, desc: '+6% gathering power per rank', fx: { gather: 0.06 } },
    luck: { name: 'Lucky Hands', max: 10, desc: '+2.5% double drops per rank', fx: { luck: 0.025 } },
    haggler: { name: 'Haggler', max: 10, desc: '+2% sale prices per rank', fx: { sell: 0.02 } },
    brawler: { name: 'Brawler', max: 10, desc: '+3% damage per rank', fx: { dmg: 0.03 } },
    tough: { name: 'Tough', max: 10, desc: '+25 health per rank', fx: { hp: 25 } },
    fleet: { name: 'Fleet Foot', max: 8, desc: '+2.5% move speed per rank', fx: { speed: 0.025 } },
    thumb: { name: 'Green Thumb', max: 10, desc: '+5% crop growth, +3% yield per rank', fx: { grow: 0.05, yield: 0.03 } },
    artisan: { name: 'Artisan', max: 10, desc: '+3% chance crafting is free per rank', fx: { craftSave: 0.03 } },
    taskmaster: { name: 'Taskmaster', max: 10, desc: '+4% business output per rank', fx: { biz: 0.04 } },
    scholar: { name: 'Scholar', max: 10, desc: '+4% experience per rank', fx: { xp: 0.04 } },
    crit: { name: 'Keen Eye', max: 10, desc: '+2% crit chance per rank (crits deal 2.2x)', fx: { crit: 0.02 } },
    secondwind: { name: 'Second Wind', max: 5, desc: 'Heal 1.5% max health per kill, per rank', fx: { leech: 0.015 } },
    whirlwind: { name: 'Whirlwind', max: 5, desc: 'Unlocks the Whirlwind ability (R). Each rank: shorter cooldown, more damage.', minLevel: 10, fx: {} },
  };
  const STARTS = {
    wanderer: { name: 'Wanderer', desc: 'Balanced start. +50 Crowns.', coins: 50, items: {}, fx: {} },
    prospector: { name: 'Prospector', desc: 'Starts with a Basic Pickaxe. +20% gathering power.', coins: 0, items: { pickaxe1: 1, stone: 10 }, fx: { gather: 0.2 } },
    farmer: { name: 'Farmer', desc: 'Starts with seeds. Crops grow 20% faster.', coins: 0, items: { seed_wheat: 12, seed_carrot: 6 }, fx: { grow: 0.2 } },
    merchant: { name: 'Merchant', desc: '+150 Crowns and +10% sale prices. Slightly frail.', coins: 150, items: {}, fx: { sell: 0.10, hp: -20 } },
    warrior: { name: 'Warrior', desc: 'Starts with a Wooden Sword. +12% damage, +30 health.', coins: 0, items: { wooden_sword: 1, bread: 3 }, fx: { dmg: 0.12, hp: 30 } },
    engineer: { name: 'Engineer', desc: 'Starts with rope and planks. +12% business output.', coins: 20, items: { rope: 6, plank: 6 }, fx: { biz: 0.12 } },
  };
  const DIFFICULTY = {
    relaxed: { name: 'Relaxed', desc: '+50% XP and income, enemies deal 25% less damage, no death penalty.', xp: 1.5, income: 1.5, enemyDmg: 0.75, enemyHp: 0.85, death: 0 },
    standard: { name: 'Standard', desc: 'The intended experience.', xp: 1, income: 1, enemyDmg: 1, enemyHp: 1, death: 0.1 },
    hardcore: { name: 'Hardcore', desc: 'Enemies hit 30% harder and have +25% health. Death costs 25% of your Crowns and 15% of carried resources.', xp: 1.15, income: 1, enemyDmg: 1.3, enemyHp: 1.25, death: 0.25 },
  };
  const LEGACY_PERKS = {
    income: { name: 'Merchant Legacy', max: 10, desc: '+5% income per rank', cost: 1 }, xp: { name: 'Scholar Legacy', max: 10, desc: '+5% XP per rank', cost: 1 },
    gather: { name: 'Pioneer Legacy', max: 10, desc: '+8% gathering power per rank', cost: 1 }, dmg: { name: 'Warrior Legacy', max: 10, desc: '+4% damage per rank', cost: 1 },
    coins: { name: 'Inheritance', max: 5, desc: 'Start each new game with +500 Crowns per rank', cost: 2 }, tools: { name: 'Heirloom Tools', max: 1, desc: 'Start with Iron Pickaxe and Axe', cost: 5 },
  };

  // ---------------------------------------------------------------- tech tree
  const TECHS = {
    agri1: { name: 'Crop Rotation', rp: 20, coins: 200, desc: '+10% crop yield. Unlocks Sprinkler.', fx: { yield: 0.10 }, req: null },
    engineering1: { name: 'Basic Engineering', rp: 25, coins: 300, desc: 'Gears, wire, wood processors, wagons and the Miner\'s Charm.', req: null },
    trade1: { name: 'Trade Routes', rp: 30, coins: 400, desc: '+5% sale prices. Merchant\'s Seal recipe.', fx: { sell: 0.05 }, req: null },
    alchemy: { name: 'Alchemy', rp: 45, coins: 600, desc: 'Healing potions, elixirs and the Vitality Amulet.', req: null },
    logistics: { name: 'Logistics', rp: 50, coins: 800, desc: '+25 carry capacity and +50% stash capacity.', fx: { bag: 25, stash: 0.5 }, req: null },
    agri2: { name: 'Irrigation', rp: 70, coins: 1000, desc: 'Watering lasts twice as long. Sprinklers cover more plots.', req: 'agri1' },
    engineering2: { name: 'Automation Engineering', rp: 90, coins: 1500, desc: 'Harvester drones, auto-miners and conveyor kits.', req: 'engineering1' },
    electrics: { name: 'Electrics', rp: 120, coins: 2500, desc: 'Circuits, power cells and the steam wagon.', req: 'engineering1' },
    combat1: { name: 'War Drills', rp: 100, coins: 2000, desc: '+6% damage.', fx: { dmg: 0.06 }, req: null },
    trade2: { name: 'Global Trade', rp: 160, coins: 4000, desc: '+8% sale prices and an extra order slot.', fx: { sell: 0.08, orders: 1 }, req: 'trade1' },
    advparts: { name: 'Advanced Parts', rp: 200, coins: 6000, desc: 'Advanced components.', req: 'electrics' },
    engineering3: { name: 'Item Sorting', rp: 230, coins: 7000, desc: 'The Item Sorter.', req: 'engineering2' },
    power2: { name: 'Efficient Turbines', rp: 180, coins: 5000, desc: '+25% power plant output.', fx: { power: 0.25 }, req: 'electrics' },
    agri3: { name: 'Hydroponics', rp: 260, coins: 8000, desc: '+25% crop yield.', fx: { yield: 0.25 }, req: 'agri2' },
    combat2: { name: 'Battle Doctrine', rp: 350, coins: 12000, desc: '+8% damage, +6% crit chance.', fx: { dmg: 0.08, crit: 0.06 }, req: 'combat1' },
    lab2: { name: 'Quantum Notes', rp: 420, coins: 15000, desc: '+30% research points.', fx: { rp: 0.3 }, req: 'advparts' },
    ancient_tech: { name: 'Ancient Engineering', rp: 600, coins: 30000, desc: '+15% business output.', fx: { biz: 0.15 }, req: 'advparts', boss: 'titan' },
    giant_studies: { name: 'Giant Studies', rp: 900, coins: 50000, desc: '+12% damage against the Giant.', fx: { giant: 0.12 }, req: 'combat2', boss: 'warden' },
  };

  // ---------------------------------------------------------------- main quests
  const Q = [];
  /** cond: see quests.js. reward: {coins, xp, items, rp, text}. after: prerequisite quest ids. */
  function Qm(id, title, desc, cond, reward, after, extra) { Q.push(Object.assign({ id, title, desc, cond, reward: reward || {}, after: after || [], main: true }, extra || {})); }
  Qm('q_intro', 'Rough Start', 'You have almost nothing. Punch some trees (Space / click) and collect 10 Wood.', { t: 'got', item: 'wood', n: 10 }, { coins: 20, xp: 30 });
  Qm('q_stone', 'Stone Age', 'Collect 8 Stone from loose rocks and 6 Fiber from bushes.', { t: 'all', all: [{ t: 'got', item: 'stone', n: 8 }, { t: 'got', item: 'fiber', n: 6 }] }, { coins: 30, xp: 40 }, ['q_intro']);
  Qm('q_tools', 'Tools of the Trade', 'Open Crafting (C) and make a Basic Pickaxe and a Basic Axe. Equip them in your Inventory (I).', { t: 'all', all: [{ t: 'craft', item: 'pickaxe1', n: 1 }, { t: 'craft', item: 'axe1', n: 1 }] }, { coins: 40, xp: 60 }, ['q_stone']);
  Qm('q_slimes', 'Pest Control', 'Slimes are nibbling the settlement. Craft a Wooden Sword and defeat 8 Slimes.', { t: 'kill', enemy: 'slime', n: 8 }, { coins: 60, xp: 90, items: { seed_wheat: 6, seed_carrot: 4 } }, ['q_tools']);
  Qm('q_sell', 'First Sales', 'Visit the General Merchant (Mara) and sell resources until you have earned 100 Crowns from sales.', { t: 'sold', n: 100 }, { coins: 50, xp: 70 }, ['q_tools']);
  Qm('q_furnace', 'Fire It Up', 'Open the Build menu (B) and construct a Furnace in your settlement.', { t: 'build', type: 'furnace', n: 1 }, { coins: 50, xp: 100 }, ['q_tools']);
  Qm('q_lumber', 'Your First Business', 'Build a Lumber Mill. Workers will chop wood for you even while you explore.', { t: 'build', type: 'lumber', n: 1 }, { coins: 100, xp: 120 }, ['q_sell']);
  Qm('q_field', 'Plant a Field', 'Build a Farm Field. Plant seeds on its plots, water them and harvest later.', { t: 'build', type: 'field', n: 1 }, { coins: 60, xp: 100, items: { seed_wheat: 8, seed_berry: 4 } }, ['q_sell']);
  Qm('q_harvest', 'First Harvest', 'Harvest 10 Wheat. Crops can be sold, baked into bread or used in recipes.', { t: 'harvest', crop: 'wheat', n: 10 }, { coins: 80, xp: 140 }, ['q_field']);
  Qm('q_settle2', 'Town Charter', 'Upgrade the Town Hall to Level 2. It unlocks mines, workshops and more.', { t: 'settle', n: 2 }, { coins: 200, xp: 250 }, ['q_lumber']);
  Qm('q_workshop', 'A Real Workshop', 'Build a Workshop. It crafts machines, charms and transport, and unlocks the Engineer.', { t: 'build', type: 'workshop', n: 1 }, { coins: 300, xp: 400, items: { gear: 0 } }, ['q_settle2']);
  Qm('q_cellar', 'Into the Cellar', 'A Slime King lurks in the Mossy Cellar (a dungeon east of town). Defeat him. No seal needed.', { t: 'boss', id: 'slimeking' }, { coins: 300, xp: 500 }, ['q_slimes'], { hint: 'Find the glowing cellar portal in the Greenlands; check your Map (M).' });
  Qm('q_level5', 'Rising Worker', 'Reach level 5.', { t: 'level', n: 5 }, { coins: 100, xp: 0, text: 'Spend skill points in Skills (K).' }, ['q_slimes']);
  Qm('q_stone_road', 'Pave the Stone Road', 'The Foreman will repair the road to Stone Valley for 300 Crowns. You also need a Furnace and level 3.', { t: 'all', all: [{ t: 'level', n: 3 }, { t: 'build', type: 'furnace', n: 1 }, { t: 'pay', n: 300, label: 'Pay the Foreman' }] }, { xp: 300, unlock: 'stone' }, ['q_furnace', 'q_slimes']);
  Qm('q_valley', 'Into the Valley', 'Cross the Stone Gate and discover Stone Valley.', { t: 'region', id: 'stone' }, { coins: 100, xp: 200 }, ['q_stone_road']);
  Qm('q_iron', 'Collect 50 Iron', 'Mine 50 Iron Ore with your Basic Pickaxe.', { t: 'got', item: 'iron_ore', n: 50 }, { coins: 200, xp: 400 }, ['q_valley']);
  Qm('q_ironpick', 'Iron Age', 'Smelt Iron Bars in your Furnace and craft an Iron Pickaxe and Iron Sword.', { t: 'all', all: [{ t: 'craft', item: 'pickaxe2', n: 1 }, { t: 'craft', item: 'iron_sword', n: 1 }] }, { coins: 300, xp: 600 }, ['q_iron']);
  Qm('q_mine', 'Open a Mine', 'Build a Mine. Miners produce stone, coal and ore for you.', { t: 'build', type: 'mine', n: 1 }, { coins: 300, xp: 400 }, ['q_valley', 'q_settle2']);
  Qm('q_goblins', 'Goblin Trouble', 'Defeat 15 Goblins in Stone Valley.', { t: 'kill', enemies: ['goblin', 'goblin_archer'], n: 15 }, { coins: 300, xp: 500, items: { heal_potion: 0, bread: 6 } }, ['q_valley']);
  Qm('q_income', 'Make Some Money', 'Earn 2,000 Crowns in total.', { t: 'earn', n: 2000 }, { coins: 300, xp: 500 }, ['q_mine']);
  Qm('q_seal', 'Prepare for the Guardian', 'Craft a Guardian Seal (Furnace). It opens the arena at the bottom of the Guardian\'s Pit.', { t: 'craft', item: 'seal_guardian', n: 1 }, { coins: 200, xp: 400 }, ['q_ironpick', 'q_goblins']);
  Qm('q_guardian', 'Defeat the Stone Guardian', 'Descend into the Guardian\'s Pit and defeat the Stone Guardian. It protects the road to the Dark Forest.', { t: 'boss', id: 'guardian' }, { coins: 0, xp: 0, text: 'Unlocks the Dark Forest, steel gear and Town Hall Level 3.' }, ['q_seal']);
  Qm('q_darkforest', 'Into the Dark', 'Enter the Dark Forest.', { t: 'region', id: 'forest' }, { coins: 300, xp: 800 }, ['q_guardian']);
  Qm('q_bakery', 'Bake Bread', 'Build a Bakery and bake bread.', { t: 'build', type: 'bakery', n: 1 }, { coins: 300, xp: 400 }, ['q_harvest', 'q_settle2']);
  Qm('q_darkwood', 'Dark Timber', 'Chop 40 Darkwood.', { t: 'got', item: 'darkwood', n: 40 }, { coins: 400, xp: 900 }, ['q_darkforest']);
  Qm('q_settle3', 'A Growing Town', 'Upgrade the Town Hall to Level 3.', { t: 'settle', n: 3 }, { coins: 500, xp: 800 }, ['q_guardian']);
  Qm('q_smithy', 'Master Smith', 'Build a Smithy and forge steel gear.', { t: 'build', type: 'smithy', n: 1 }, { coins: 500, xp: 1000 }, ['q_settle3']);
  Qm('q_lab', 'Science!', 'Build a Research Lab, then research any technology.', { t: 'all', all: [{ t: 'build', type: 'lab', n: 1 }, { t: 'research', n: 1 }] }, { coins: 800, xp: 1200, rp: 40 }, ['q_settle3']);
  Qm('q_tablets1', 'Echoes of the Past', 'Find and read 4 ancient tablets scattered across the lands.', { t: 'tablets', n: 4 }, { coins: 400, xp: 1000, text: 'Something enormous is out there...' }, ['q_darkforest']);
  Qm('q_steel', 'Forged in Steel', 'Craft Steel Armor and a Steel Sword.', { t: 'all', all: [{ t: 'craft', item: 'steel_armor', n: 1 }, { t: 'craft', item: 'steel_sword', n: 1 }] }, { coins: 600, xp: 1500 }, ['q_smithy']);
  Qm('q_seal2', 'Prepare for the King', 'Craft a Forest Seal.', { t: 'craft', item: 'seal_forest', n: 1 }, { coins: 400, xp: 1200 }, ['q_darkwood']);
  Qm('q_forestking', 'Defeat the Forest King', 'Face the Forest King in the Hollow Throne. His fall opens the way to the Frozen Peaks.', { t: 'boss', id: 'forestking' }, { text: 'Unlocks the Frozen Peaks and Town Hall Level 4.' }, ['q_seal2']);
  Qm('q_frozen', 'The Cold Open', 'Discover the Frozen Peaks.', { t: 'region', id: 'frozen' }, { coins: 800, xp: 2500 }, ['q_forestking']);
  Qm('q_crystal', 'Crystal Clear', 'Mine 20 Crystal with a Steel Pickaxe or better (a Crystal Pickaxe is even better).', { t: 'got', item: 'crystal', n: 20 }, { coins: 1000, xp: 2500 }, ['q_frozen']);
  Qm('q_settle4', 'Industrial Revolution', 'Upgrade the Town Hall to Level 4.', { t: 'settle', n: 4 }, { coins: 1500, xp: 3000 }, ['q_forestking']);
  Qm('q_power', 'Power Up', 'Build a Power Plant and keep it running with coal in your stash. Reach 12 power.', { t: 'all', all: [{ t: 'build', type: 'powerplant', n: 1 }, { t: 'power', n: 12 }] }, { coins: 1500, xp: 3000 }, ['q_settle4']);
  Qm('q_factory', 'Production Line', 'Build a Factory and craft a Power Cell.', { t: 'all', all: [{ t: 'build', type: 'factory', n: 1 }, { t: 'craft', item: 'power_cell', n: 1 }] }, { coins: 2000, xp: 3500 }, ['q_power']);
  Qm('q_earn10k', 'Rolling in It', 'Earn 15,000 Crowns in total.', { t: 'earn', n: 15000 }, { coins: 2000, xp: 3500 }, ['q_factory']);
  Qm('q_seal3', 'Prepare for the Wyrm', 'Craft a Wyrm Seal.', { t: 'craft', item: 'seal_wyrm', n: 1 }, { coins: 1000, xp: 3500 }, ['q_crystal', 'q_settle4']);
  Qm('q_wyrm', 'Defeat the Frost Wyrm', 'Descend into the Frozen Depths. The Wyrm guards the road to the Emberlands.', { t: 'boss', id: 'wyrm' }, { text: 'Unlocks the Emberlands, obsidian gear and Town Hall Level 5.' }, ['q_seal3']);
  Qm('q_ember', 'Into the Fire', 'Discover the Emberlands.', { t: 'region', id: 'ember' }, { coins: 2500, xp: 6000 }, ['q_wyrm']);
  Qm('q_obsidian', 'Black Glass', 'Mine 30 Obsidian.', { t: 'got', item: 'obsidian', n: 30 }, { coins: 3000, xp: 7000 }, ['q_ember']);
  Qm('q_settle5', 'City Planning', 'Upgrade the Town Hall to Level 5.', { t: 'settle', n: 5 }, { coins: 4000, xp: 8000 }, ['q_wyrm']);
  Qm('q_hub', 'Automate Everything', 'Build the Automation Hub and install a Conveyor Kit on a business.', { t: 'all', all: [{ t: 'build', type: 'hub', n: 1 }, { t: 'install', machine: 'conveyor', n: 1 }] }, { coins: 5000, xp: 9000 }, ['q_settle5']);
  Qm('q_seal4', 'Prepare for the Titan', 'Craft a Titan Seal.', { t: 'craft', item: 'seal_titan', n: 1 }, { coins: 3000, xp: 8000 }, ['q_obsidian']);
  Qm('q_titan', 'Defeat the Ember Titan', 'Descend into the Magma Heart and put out the Titan\'s fire.', { t: 'boss', id: 'titan' }, { text: 'Unlocks the Ancient Ruins and Town Hall Level 6.' }, ['q_seal4']);
  Qm('q_ruins', 'The Buried City', 'Discover the Ancient Ruins.', { t: 'region', id: 'ruins' }, { coins: 6000, xp: 15000 }, ['q_titan']);
  Qm('q_ancient', 'Ancient Metal', 'Mine 25 Ancient Metal with an Obsidian Pickaxe or better.', { t: 'got', item: 'ancient_metal', n: 25 }, { coins: 8000, xp: 20000 }, ['q_ruins']);
  Qm('q_tablets2', 'The Great Mistake', 'Find and read 9 ancient tablets.', { t: 'tablets', n: 9 }, { coins: 6000, xp: 15000, text: 'The tablets speak of Wardens, a Seal, and a Giant.' }, ['q_ruins']);
  Qm('q_settle6', 'Capital City', 'Upgrade the Town Hall to Level 6.', { t: 'settle', n: 6 }, { coins: 10000, xp: 20000 }, ['q_titan']);
  Qm('q_forge', 'The Ancient Forge', 'Build the Ancient Forge and craft an Advanced Component.', { t: 'all', all: [{ t: 'build', type: 'ancient_forge', n: 1 }, { t: 'craft', item: 'adv_component', n: 1 }] }, { coins: 12000, xp: 22000 }, ['q_settle6', 'q_ancient']);
  Qm('q_seal5', 'Prepare for the Warden', 'Craft a Warden Seal.', { t: 'craft', item: 'seal_warden', n: 1 }, { coins: 8000, xp: 25000 }, ['q_forge']);
  Qm('q_warden', 'Defeat the Ancient Warden', 'Descend into the Warden\'s Vault and break the last guardian of the road to the Giant.', { t: 'boss', id: 'warden' }, { text: "Opens Giant's Realm and the Giant-Slayer recipes." }, ['q_seal5']);
  Qm('q_giantrealm', "Giant's Realm", "Step into the Giant's Realm.", { t: 'region', id: 'giant' }, { coins: 15000, xp: 40000 }, ['q_warden']);
  Qm('q_tablets3', 'The Whole Story', 'Find and read all 12 tablets.', { t: 'tablets', n: 12 }, { coins: 20000, xp: 40000, text: 'You understand now what must be done.' }, ['q_giantrealm']);
  Qm('q_shards', 'Giant Shards', 'Collect 20 Giant Shards from Giant Rocks and the creatures of the Realm.', { t: 'got', item: 'giant_shard', n: 20 }, { coins: 20000, xp: 50000 }, ['q_giantrealm']);
  Qm('q_slayer', 'Forge the Giant-Slayer', 'Craft the Giant-Slayer Blade and Giant-Slayer Plate (needs all five boss materials and Star Cores).', { t: 'all', all: [{ t: 'craft', item: 'giant_slayer', n: 1 }, { t: 'craft', item: 'giant_plate', n: 1 }] }, { coins: 30000, xp: 80000 }, ['q_shards']);
  Qm('q_fund', 'Fund the Expedition', 'Pay 50,000 Crowns to supply the final expedition.', { t: 'pay', n: 50000, label: 'Fund the expedition' }, { xp: 50000 }, ['q_giantrealm']);
  Qm('q_key', "The Giant's Key", "Craft the Giant's Key at the Ancient Forge.", { t: 'craft', item: 'giant_key', n: 1 }, { coins: 0, xp: 60000 }, ['q_slayer', 'q_fund']);
  Qm('q_giant', 'DEFEAT THE GIANT', "Enter the Giant's Keep and end the threat. Check the Final Preparations list (J).", { t: 'boss', id: 'giant' }, { text: 'Victory.' }, ['q_key']);
  // post-game objectives
  const POST = [
    ['q_post_abyss', 'Descend the Abyss', 'Reach floor 10 of the Abyss (endless dungeon, enter at the Portal Hub or the Giant\'s Keep entrance).', { t: 'abyss', n: 10 }, { coins: 50000, xp: 100000, items: { abyss_shard: 5 } }],
    ['q_post_star', 'Build the Star Forge', 'Upgrade the Town Hall to 8 and build the Star Forge.', { t: 'build', type: 'star_forge', n: 1 }, { coins: 100000, xp: 150000 }],
    ['q_post_legend', 'Legendary Arms', 'Craft Abyssal Plate and an Abyssal Blade.', { t: 'all', all: [{ t: 'craft', item: 'legend_plate', n: 1 }, { t: 'craft', item: 'legend_blade', n: 1 }] }, { coins: 200000, xp: 250000 }],
    ['q_post_millionaire', 'Crown Millionaire', 'Earn 2,000,000 Crowns in total.', { t: 'earn', n: 2000000 }, { coins: 100000, xp: 200000 }],
    ['q_post_ascended', 'Ascended Challenge', 'Defeat 3 Ascended bosses (rematch bosses from the Boss Arena list).', { t: 'ascended', n: 3 }, { coins: 300000, xp: 300000, items: { giant_shard: 10 } }],
  ];
  for (const [id, title, desc, cond, reward] of POST) Qm(id, title, desc, cond, reward, ['q_giant'], { post: true });

  // Random quest templates for the endless board. scale by region tier.
  const BOARD_TEMPLATES = [
    { kind: 'gather', items: [['wood', 40, 1], ['stone', 40, 1], ['fiber', 40, 1], ['clay', 20, 1], ['coal', 25, 1], ['iron_ore', 30, 2], ['copper_ore', 30, 2], ['quartz', 12, 2], ['silver_ore', 14, 3], ['gold_ore', 10, 3], ['darkwood', 25, 3], ['herb', 20, 3], ['frostwood', 20, 4], ['crystal', 8, 4], ['obsidian', 6, 5], ['ember_crystal', 6, 5], ['ancient_metal', 6, 6], ['star_ore', 4, 7]] },
    { kind: 'craft', items: [['plank', 20, 1], ['stone_brick', 20, 1], ['rope', 10, 1], ['cloth', 8, 1], ['brick', 14, 1], ['iron_bar', 10, 2], ['copper_bar', 10, 2], ['glass', 6, 2], ['bread', 12, 1], ['steel_bar', 8, 3], ['darkplank', 8, 3], ['heal_potion', 5, 3], ['gear', 6, 3], ['circuit', 4, 4], ['silver_bar', 5, 3], ['gold_bar', 4, 4]] },
    { kind: 'kill', enemies: [['slime', 14, 1], ['boar', 8, 1], ['rock_beetle', 12, 2], ['goblin', 12, 2], ['wolf', 10, 3], ['spider', 10, 3], ['bandit', 8, 3], ['ice_wolf', 8, 4], ['yeti', 5, 4], ['frost_wisp', 8, 4], ['fire_imp', 8, 5], ['magma_golem', 4, 5], ['ash_hound', 8, 5], ['construct', 6, 6], ['wraith', 6, 6], ['sentry', 5, 6], ['rockling', 6, 7], ['shard_golem', 3, 7]] },
    { kind: 'deliver', items: [['bread', 10, 1], ['wheat', 20, 1], ['carrot', 12, 1], ['pumpkin', 8, 2], ['berry', 12, 2], ['iron_bar', 8, 2], ['plank', 25, 1], ['glass', 6, 2], ['steel_bar', 6, 3], ['jam', 8, 2]] },
    { kind: 'earn', amounts: [[300, 1], [1000, 2], [4000, 3], [12000, 4], [40000, 5], [120000, 6]] },
  ];

  GF.DAY_SEC = DAY_SEC; GF.BUILDINGS = BUILDINGS; GF.BIZ = BIZ; GF.BASE_STASH = BASE_STASH; GF.SHOPS = SHOPS;
  GF.BAG_CAP = BAG_CAP; GF.BAG_COST = BAG_COST; GF.COSMETICS = COSMETICS; GF.TIERS = TIERS; GF.MAX_LEVEL = MAX_LEVEL; GF.xpNext = xpNext;
  GF.SKILLS = SKILLS; GF.STARTS = STARTS; GF.DIFFICULTY = DIFFICULTY; GF.LEGACY_PERKS = LEGACY_PERKS; GF.TECHS = TECHS; GF.QUESTS = Q; GF.BOARD_TEMPLATES = BOARD_TEMPLATES;
})(typeof window !== 'undefined' ? window : globalThis);

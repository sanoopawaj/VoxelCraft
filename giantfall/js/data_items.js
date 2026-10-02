// Static item + recipe data. Equipment is generated from tier tables so progression stays consistent.
(function (root) {
  'use strict';
  const GF = root.GF;
  const ITEMS = {};
  function item(id, name, type, value, col, extra) {
    ITEMS[id] = Object.assign({ id, name, type, value, col: col || '#999' }, extra || {});
  }

  // ---------------------------------------------------------------- raw resources
  item('wood', 'Wood', 'res', 3, '#a0703c', { desc: 'Basic building material.' });
  item('stone', 'Stone', 'res', 3, '#8a8f98', { desc: 'Basic building material.' });
  item('fiber', 'Fiber', 'res', 2, '#7fbf5a', { desc: 'Plant fiber for rope and cloth.' });
  item('clay', 'Clay', 'res', 4, '#c4825a', { desc: 'Fired into bricks.' });
  item('coal', 'Coal', 'res', 6, '#3a3d44', { desc: 'Fuel for furnaces and the power plant.' });
  item('iron_ore', 'Iron Ore', 'res', 8, '#b98b73', { desc: 'Smelts into iron bars.' });
  item('copper_ore', 'Copper Ore', 'res', 8, '#d9803f', { desc: 'Smelts into copper bars.' });
  item('silver_ore', 'Silver Ore', 'res', 18, '#c9d3dc', { desc: 'Smelts into silver bars.' });
  item('gold_ore', 'Gold Ore', 'res', 30, '#f2c744', { desc: 'Smelts into gold bars.' });
  item('quartz', 'Quartz', 'res', 20, '#e8e4f4', { desc: 'Used for glass and circuits.' });
  item('crystal', 'Crystal', 'res', 60, '#6fe0ff', { desc: 'Humming crystal for advanced tools and power cells.' });
  item('obsidian', 'Obsidian', 'res', 85, '#3b2a5c', { desc: 'Volcanic glass. Forged into brutal gear.' });
  item('ancient_metal', 'Ancient Metal', 'res', 160, '#b8a06a', { desc: 'Metal from a forgotten age.' });
  item('star_ore', 'Star Ore', 'res', 320, '#ffe27a', { desc: 'Fallen-star metal, found beyond the Ruins and in meteor falls.' });
  item('giant_shard', 'Giant Shard', 'res', 1000, '#ff8a5c', { desc: 'A splinter of the Giant itself. Humming with power.' });
  item('darkwood', 'Darkwood', 'res', 7, '#4a3a2c', { desc: 'Dense wood from the Dark Forest.' });
  item('frostwood', 'Frostwood', 'res', 14, '#9fc5d8', { desc: 'Cold-hardened wood from the Frozen Peaks.' });
  item('herb', 'Herb', 'res', 5, '#4fae6a', { desc: 'Medicinal herb. Potions need it.' });
  item('mushroom', 'Mushroom', 'res', 6, '#c9748a', { desc: 'Forest mushroom used in elixirs.' });
  item('sulfur', 'Sulfur', 'res', 22, '#e8d84a', { desc: 'Volatile yellow stone from Ember vents.' });
  item('ember_crystal', 'Ember Crystal', 'res', 70, '#ff6a3a', { desc: 'Glowing volcanic crystal. Powers advanced machines.' });
  item('relic', 'Ancient Relic', 'res', 120, '#d8c07a', { desc: 'Valuable artifact. Collectors pay well.' });

  // ---------------------------------------------------------------- processed materials
  item('plank', 'Plank', 'mat', 5, '#c89a5a', { desc: 'Sawn wood.' });
  item('darkplank', 'Dark Plank', 'mat', 18, '#6a5442', { desc: 'Sturdy planks.' });
  item('frostplank', 'Frost Plank', 'mat', 36, '#b8d8e8', { desc: 'Cold-proof planks.' });
  item('rope', 'Rope', 'mat', 5, '#c8b27a', { desc: 'Twisted fiber.' });
  item('cloth', 'Cloth', 'mat', 8, '#e8e0cc', { desc: 'Woven fiber.' });
  item('stone_brick', 'Stone Brick', 'mat', 6, '#a0a6b0', { desc: 'Cut stone for buildings.' });
  item('brick', 'Brick', 'mat', 9, '#c4604a', { desc: 'Fired clay brick.' });
  item('glass', 'Glass', 'mat', 24, '#bfe8f0', { desc: 'For potions, greenhouses and optics.' });
  item('iron_bar', 'Iron Bar', 'mat', 24, '#b8bcc4', { desc: 'The backbone of early tools.' });
  item('copper_bar', 'Copper Bar', 'mat', 24, '#e08a50', { desc: 'Conductive metal.' });
  item('silver_bar', 'Silver Bar', 'mat', 52, '#dfe6ee', { desc: 'Fine conductive metal.' });
  item('gold_bar', 'Gold Bar', 'mat', 85, '#ffd24a', { desc: 'Precious and useful.' });
  item('steel_bar', 'Steel Bar', 'mat', 70, '#8fa0b8', { desc: 'Hard alloy for serious gear.' });
  item('flour', 'Flour', 'mat', 6, '#f4ecd8', { desc: 'Ground wheat.' });
  // components
  item('gear', 'Gear', 'part', 70, '#9aa4b0', { desc: 'Machine component.' });
  item('wire', 'Wire', 'part', 30, '#e8a060', { desc: 'Copper wiring.' });
  item('circuit', 'Circuit', 'part', 130, '#5ad0a0', { desc: 'Control circuit.' });
  item('power_cell', 'Power Cell', 'part', 220, '#7ae0ff', { desc: 'Stores crystal energy.' });
  item('adv_component', 'Advanced Component', 'part', 420, '#b090ff', { desc: 'High-tech assembly.' });
  item('ancient_core', 'Ancient Core', 'part', 900, '#e8c860', { desc: 'Core of an ancient engine.' });
  item('star_core', 'Star Core', 'part', 2200, '#fff0a0', { desc: 'A core wrought from fallen stars.' });

  // ---------------------------------------------------------------- farming
  const CROPS = [
    ['wheat', 'Wheat', 4, '#e8c860'], ['carrot', 'Carrot', 6, '#f08a30'], ['pumpkin', 'Pumpkin', 14, '#e87820'],
    ['berry', 'Berries', 8, '#c0405a'], ['moonbloom', 'Moonbloom', 45, '#b8a0ff'], ['emberpepper', 'Emberpepper', 60, '#ff4a2a'],
  ];
  for (const [id, name, val, col] of CROPS) {
    item(id, name, 'crop', val, col, { desc: 'A farmed crop.' });
    item('seed_' + id, name + ' Seeds', 'seed', Math.round(val * 0.7) + 1, col, { crop: id, desc: 'Plant on a farm plot.' });
  }
  item('bonemeal', 'Bonemeal', 'mat', 10, '#efe8d8', { desc: 'Fertilizer: doubles the growth of one plot stage.' });

  // ---------------------------------------------------------------- monster drops + boss materials
  item('slime_gel', 'Slime Gel', 'drop', 3, '#7adf8a', { desc: 'Sticky goo.' });
  item('hide', 'Hide', 'drop', 8, '#a07050', { desc: 'Animal hide for armor.' });
  item('bone', 'Bone', 'drop', 6, '#eee6d0', { desc: 'Ground into bonemeal.' });
  item('fang', 'Fang', 'drop', 14, '#f4f0e0', { desc: 'Sharp trophy.' });
  item('silk', 'Spider Silk', 'drop', 12, '#e0e8f0', { desc: 'Strong silk.' });
  item('frost_core', 'Frost Core', 'drop', 70, '#8fd8ff', { desc: 'Chilled energy core.' });
  item('ember_core', 'Ember Core', 'drop', 90, '#ff7a3a', { desc: 'Smoldering energy core.' });
  item('construct_cog', 'Construct Cog', 'drop', 120, '#c8b070', { desc: 'Precision cog from an ancient construct.' });
  item('wraith_essence', 'Wraith Essence', 'drop', 110, '#a0e0d0', { desc: 'Spectral essence.' });
  item('stone_core', 'Guardian Core', 'boss', 400, '#a8b0c0', { desc: 'The heart of the Stone Guardian.' });
  item('forest_heart', 'Forest Heart', 'boss', 900, '#58c868', { desc: 'The living heart of the Forest King.' });
  item('wyrm_scale', 'Wyrm Scale', 'boss', 2000, '#9ae0ff', { desc: 'Impervious scale of the Frost Wyrm.' });
  item('ember_heart', 'Ember Heart', 'boss', 4500, '#ff5a2a', { desc: 'Still-burning heart of the Ember Titan.' });
  item('warden_sigil', 'Warden Sigil', 'boss', 9000, '#f0d878', { desc: 'The Ancient Warden\'s seal of office.' });
  item('abyss_shard', 'Abyss Shard', 'boss', 800, '#c060ff', { desc: 'Endgame crystal torn from the Abyss.' });

  // ---------------------------------------------------------------- food, potions
  item('bread', 'Bread', 'food', 16, '#d8a860', { heal: 45, desc: 'Restores 45 HP.' });
  item('stew', 'Hearty Stew', 'food', 38, '#c07840', { heal: 110, desc: 'Restores 110 HP.' });
  item('pie', 'Pumpkin Pie', 'food', 90, '#e89040', { heal: 260, desc: 'Restores 260 HP.' });
  item('jam', 'Berry Jam', 'food', 30, '#a02048', { heal: 70, desc: 'Restores 70 HP. Merchants love it.' });
  item('heal_potion', 'Healing Potion', 'potion', 40, '#ff6a7a', { heal: 160, desc: 'Restores 160 HP.' });
  item('greater_heal', 'Greater Healing Potion', 'potion', 140, '#ff3a5a', { heal: 480, desc: 'Restores 480 HP.' });
  item('elixir_str', 'Strength Elixir', 'potion', 120, '#ff9a3a', { buff: 'str', desc: '+25% damage for 3 minutes.' });
  item('elixir_def', 'Ironskin Elixir', 'potion', 120, '#8a9ab0', { buff: 'def', desc: '+35% defense for 3 minutes.' });
  item('elixir_speed', 'Swiftness Elixir', 'potion', 90, '#6ae0ff', { buff: 'speed', desc: '+25% speed for 3 minutes.' });
  item('supreme_elixir', 'Supreme Elixir', 'potion', 600, '#ffd860', { buff: 'supreme', desc: '+25% damage and +30% defense for 5 minutes.' });
  item('recall_scroll', 'Recall Scroll', 'misc', 25, '#e8e0f8', { desc: 'Teleports you home to Hearthstead.' });

  // ---------------------------------------------------------------- boss prep + machines
  item('seal_guardian', 'Guardian Seal', 'seal', 300, '#a8b0c0', { boss: 'guardian', desc: 'Opens the Guardian\'s arena.' });
  item('seal_forest', 'Forest Seal', 'seal', 700, '#58c868', { boss: 'forestking', desc: 'Opens the Forest King\'s arena.' });
  item('seal_wyrm', 'Wyrm Seal', 'seal', 1500, '#9ae0ff', { boss: 'wyrm', desc: 'Opens the Frost Wyrm\'s lair.' });
  item('seal_titan', 'Titan Seal', 'seal', 3200, '#ff5a2a', { boss: 'titan', desc: 'Opens the Ember Titan\'s forge.' });
  item('seal_warden', 'Warden Seal', 'seal', 7000, '#f0d878', { boss: 'warden', desc: 'Opens the Ancient Warden\'s vault.' });
  item('giant_key', "Giant's Key", 'seal', 20000, '#ff8a5c', { boss: 'giant', desc: 'Breaks the seal on the Giant\'s Keep.' });
  item('sprinkler', 'Sprinkler', 'machine', 150, '#6ab8ff', { machine: 'sprinkler', desc: 'Install on a Farm: waters crops automatically.' });
  item('harvester', 'Harvester Drone', 'machine', 600, '#9ad06a', { machine: 'harvester', desc: 'Install on a Farm: harvests and replants (needs power).' });
  item('auto_miner', 'Auto-Miner', 'machine', 500, '#c8a060', { machine: 'auto_miner', desc: 'Install on a Mine: +30% output (needs power).' });
  item('wood_processor', 'Wood Processor', 'machine', 400, '#b88a50', { machine: 'wood_processor', desc: 'Install on a Lumber Mill: +30% output (needs power).' });
  item('conveyor_kit', 'Conveyor Kit', 'machine', 350, '#80a0b8', { machine: 'conveyor', desc: 'Install on any business: its output flows to the stash automatically.' });
  item('sorter', 'Item Sorter', 'machine', 800, '#a080d0', { machine: 'sorter', desc: 'Install on the Automation Hub: +25% speed for all processing buildings.' });

  // ---------------------------------------------------------------- transport + charms
  const TRANS = [
    ['handcart', 'Handcart', 220, 25, 0, '#a07a4a'], ['mule_pack', 'Pack Mule', 700, 60, 0.06, '#8a6a4a'],
    ['wagon', 'Wagon', 2400, 120, 0.10, '#b08a5a'], ['steam_wagon', 'Steam Wagon', 9000, 220, 0.16, '#7a8aa0'],
    ['sky_skiff', 'Sky Skiff', 40000, 400, 0.30, '#c0a0ff'],
  ];
  for (const [id, name, val, cap, spd, col] of TRANS) item(id, name, 'trans', val, col, { cap, spd, slot: 'trans', desc: `+${cap} carry capacity${spd ? `, +${Math.round(spd * 100)}% move speed` : ''}.` });
  item('clover_charm', 'Lucky Clover', 'charm', 240, '#58d868', { slot: 'charm', fx: { luck: 0.12 }, desc: '+12% chance of double drops.' });
  item('magnet_ring', 'Magnet Ring', 'charm', 300, '#c0c8e0', { slot: 'charm', fx: { magnet: 2.5 }, desc: 'Drops fly to you from farther away.' });
  item('swift_boots', 'Swift Boots', 'charm', 380, '#d0a070', { slot: 'charm', fx: { speed: 0.12 }, desc: '+12% movement speed.' });
  item('miner_charm', "Miner's Charm", 'charm', 620, '#d8c8a0', { slot: 'charm', fx: { gather: 0.25 }, desc: '+25% gathering power.' });
  item('merchant_seal', "Merchant's Seal", 'charm', 900, '#ffd860', { slot: 'charm', fx: { sell: 0.10 }, desc: '+10% on all sale prices.' });
  item('vitality_amulet', 'Vitality Amulet', 'charm', 1200, '#ff7a8a', { slot: 'charm', fx: { hp: 150 }, desc: '+150 max health.' });
  item('guardian_band', "Guardian's Band", 'charm', 800, '#a8b0c0', { slot: 'charm', fx: { def: 0.08, hp: 80 }, desc: '+8% defense, +80 health. Dropped by the Stone Guardian.' });
  item('forest_crown', "King's Antlers", 'charm', 1800, '#58c868', { slot: 'charm', fx: { dmg: 0.10, speed: 0.08 }, desc: '+10% damage, +8% speed.' });
  item('wyrm_pendant', 'Wyrm Pendant', 'charm', 3600, '#9ae0ff', { slot: 'charm', fx: { crit: 0.12, hp: 200 }, desc: '+12% crit chance, +200 health.' });
  item('titan_core_charm', 'Titan Heart Charm', 'charm', 8000, '#ff5a2a', { slot: 'charm', fx: { dmg: 0.18, def: 0.10 }, desc: '+18% damage, +10% defense.' });
  item('warden_crest', 'Warden Crest', 'charm', 16000, '#f0d878', { slot: 'charm', fx: { dmg: 0.15, gather: 0.3, sell: 0.10 }, desc: '+15% damage, +30% gathering, +10% sales.' });
  item('giant_heart', "Giant's Heart", 'charm', 60000, '#ff8a5c', { slot: 'charm', fx: { dmg: 0.30, def: 0.15, hp: 500 }, desc: 'Legendary: +30% damage, +15% defense, +500 health.' });

  // ---------------------------------------------------------------- generated equipment
  const POWER = [4, 12, 26, 52, 100, 190, 360, 680]; // tool damage to nodes by tool tier (0 = bare hands)
  const SWORD_DMG = [0, 9, 15, 26, 44, 74, 124, 205, 330, 520];
  const ARMOR_DEF = [0, 6, 14, 26, 42, 64, 92, 130, 180, 250];
  const KIND = {
    sword: { mult: 1.0, cd: 0.40, arc: 1.8, range: 1.7 },
    spear: { mult: 0.85, cd: 0.50, arc: 0.7, range: 2.7 },
    hammer: { mult: 1.9, cd: 0.95, arc: 2.2, range: 1.9, kb: 6 },
    bow: { mult: 0.8, cd: 0.55, arc: 0, range: 11, proj: true },
  };
  const TIER_COLOR = ['#999', '#c89a5a', '#b8bcc4', '#8fa0b8', '#6fe0ff', '#7a4aa8', '#d8c07a', '#ffe27a', '#ff8a5c', '#c060ff'];
  const PICKS = ['Basic Pickaxe', 'Iron Pickaxe', 'Steel Pickaxe', 'Crystal Pickaxe', 'Obsidian Pickaxe', 'Ancient Pickaxe', 'Star Pickaxe'];
  const AXES = ['Basic Axe', 'Iron Axe', 'Steel Axe', 'Crystal Axe'];
  PICKS.forEach((n, i) => item('pickaxe' + (i + 1), n, 'tool', 40 * Math.pow(2.6, i), TIER_COLOR[i + 1], { slot: 'pick', tier: i + 1, power: POWER[i + 1], desc: `Mines tier ${i + 1} nodes. Power ${POWER[i + 1]}.` }));
  AXES.forEach((n, i) => item('axe' + (i + 1), n, 'tool', 35 * Math.pow(2.6, i), TIER_COLOR[i + 1], { slot: 'axe', tier: i + 1, power: POWER[i + 1], desc: `Chops tier ${i + 1} trees. Power ${POWER[i + 1]}.` }));
  // weapons: [id, name, kind, tier]
  const WEAPONS = [
    ['wooden_sword', 'Wooden Sword', 'sword', 1], ['short_bow', 'Short Bow', 'bow', 1],
    ['iron_sword', 'Iron Sword', 'sword', 2], ['iron_spear', 'Iron Spear', 'spear', 2],
    ['steel_sword', 'Steel Sword', 'sword', 3], ['steel_hammer', 'Steel Warhammer', 'hammer', 3], ['steel_bow', 'Steel Longbow', 'bow', 3],
    ['crystal_sword', 'Crystal Blade', 'sword', 4], ['crystal_spear', 'Crystal Lance', 'spear', 4],
    ['obsidian_sword', 'Obsidian Cleaver', 'sword', 5], ['obsidian_hammer', 'Obsidian Maul', 'hammer', 5], ['ember_bow', 'Ember Bow', 'bow', 5],
    ['ancient_blade', 'Ancient Blade', 'sword', 6], ['ancient_spear', 'Ancient Spear', 'spear', 6],
    ['star_blade', 'Starforged Blade', 'sword', 7], ['star_hammer', 'Starforged Hammer', 'hammer', 7], ['star_bow', 'Starforged Bow', 'bow', 7],
    ['giant_slayer', 'Giant-Slayer Blade', 'sword', 8], ['slayer_spear', 'Giant-Slayer Lance', 'spear', 8],
    ['slayer_hammer', 'Giant-Slayer Maul', 'hammer', 8], ['slayer_bow', 'Giant-Slayer Bow', 'bow', 8],
    ['legend_blade', 'Abyssal Blade', 'sword', 9], ['legend_spear', 'Abyssal Lance', 'spear', 9],
    ['legend_hammer', 'Abyssal Maul', 'hammer', 9], ['legend_bow', 'Abyssal Bow', 'bow', 9],
  ];
  for (const [id, name, kind, tier] of WEAPONS) {
    const dmg = Math.round(SWORD_DMG[tier] * KIND[kind].mult);
    item(id, name, 'weapon', 30 * Math.pow(2.4, tier - 1) * (kind === 'sword' ? 1 : 1.1), TIER_COLOR[tier], { slot: 'weapon', kind, tier, dmg, giantBane: tier >= 8, desc: `${kind[0].toUpperCase() + kind.slice(1)} · damage ${dmg}${tier >= 8 ? ' · full damage vs the Giant' : ''}.` });
  }
  const ARMORS = [['leather_armor', 'Leather Armor'], ['iron_armor', 'Iron Armor'], ['steel_armor', 'Steel Armor'], ['crystal_armor', 'Crystal Armor'],
    ['obsidian_armor', 'Obsidian Armor'], ['ancient_armor', 'Ancient Plate'], ['star_armor', 'Starforged Plate'], ['giant_plate', 'Giant-Slayer Plate'], ['legend_plate', 'Abyssal Plate']];
  ARMORS.forEach(([id, name], i) => item(id, name, 'armor', 28 * Math.pow(2.4, i), TIER_COLOR[i + 1], { slot: 'armor', tier: i + 1, def: ARMOR_DEF[i + 1], hp: (i + 1) * 25, desc: `Defense ${ARMOR_DEF[i + 1]}, +${(i + 1) * 25} health.` }));

  // ---------------------------------------------------------------- recipes
  const RECIPES = [];
  /** ing: {item:n}; station: where; unlock: 'start' | 'quest:id' | 'boss:id' | 'tech:id' | 'level:n' | 'region:id' */
  function R(out, qty, ing, station, unlock, cat, extra) {
    RECIPES.push(Object.assign({ id: out + (extra && extra.suffix ? extra.suffix : ''), out, qty, ing, station, unlock: unlock || 'start', cat }, extra || {}));
  }
  // materials (smelting etc.)
  R('plank', 2, { wood: 3 }, 'camp', 'start', 'materials');
  R('rope', 1, { fiber: 3 }, 'camp', 'start', 'materials');
  R('cloth', 1, { fiber: 4 }, 'camp', 'start', 'materials');
  R('stone_brick', 2, { stone: 3 }, 'camp', 'start', 'materials');
  R('brick', 2, { clay: 2, coal: 1 }, 'furnace', 'start', 'materials');
  R('glass', 1, { quartz: 2, coal: 1 }, 'furnace', 'start', 'materials');
  R('iron_bar', 1, { iron_ore: 2, coal: 1 }, 'furnace', 'start', 'materials');
  R('copper_bar', 1, { copper_ore: 2, coal: 1 }, 'furnace', 'start', 'materials');
  R('silver_bar', 1, { silver_ore: 2, coal: 1 }, 'furnace', 'start', 'materials');
  R('gold_bar', 1, { gold_ore: 2, coal: 1 }, 'furnace', 'start', 'materials');
  R('steel_bar', 1, { iron_bar: 2, coal: 2 }, 'smithy', 'boss:guardian', 'materials');
  R('darkplank', 2, { darkwood: 3 }, 'workshop', 'start', 'materials');
  R('frostplank', 2, { frostwood: 3 }, 'workshop', 'start', 'materials');
  R('flour', 2, { wheat: 3 }, 'kitchen', 'start', 'materials');
  R('bonemeal', 3, { bone: 2, fiber: 1 }, 'camp', 'start', 'farming');
  // components
  R('gear', 2, { iron_bar: 1, copper_bar: 1 }, 'workshop', 'tech:engineering1', 'tech');
  R('wire', 3, { copper_bar: 1 }, 'workshop', 'tech:engineering1', 'tech');
  R('circuit', 1, { wire: 2, quartz: 1, silver_bar: 1 }, 'factory', 'tech:electrics', 'tech');
  R('power_cell', 1, { circuit: 1, coal: 4, crystal: 1 }, 'factory', 'tech:electrics', 'tech');
  R('adv_component', 1, { steel_bar: 2, circuit: 2, crystal: 1 }, 'factory', 'tech:advparts', 'tech');
  R('ancient_core', 1, { ancient_metal: 3, adv_component: 2, construct_cog: 2 }, 'ancient_forge', 'boss:titan', 'tech');
  R('star_core', 1, { star_ore: 3, ancient_core: 1, giant_shard: 1 }, 'ancient_forge', 'boss:warden', 'tech');
  // tools
  R('pickaxe1', 1, { wood: 5, stone: 4 }, 'camp', 'start', 'tools');
  R('axe1', 1, { wood: 4, stone: 3 }, 'camp', 'start', 'tools');
  R('pickaxe2', 1, { iron_bar: 4, plank: 2, rope: 1 }, 'furnace', 'start', 'tools');
  R('axe2', 1, { iron_bar: 3, plank: 2, rope: 1 }, 'furnace', 'start', 'tools');
  R('pickaxe3', 1, { steel_bar: 4, darkplank: 2, cloth: 2 }, 'smithy', 'boss:guardian', 'tools');
  R('axe3', 1, { steel_bar: 3, darkplank: 2, cloth: 1 }, 'smithy', 'boss:guardian', 'tools');
  R('pickaxe4', 1, { crystal: 4, steel_bar: 3, frostplank: 2 }, 'smithy', 'boss:forestking', 'tools');
  R('axe4', 1, { crystal: 3, steel_bar: 3, frostplank: 2 }, 'smithy', 'boss:forestking', 'tools');
  R('pickaxe5', 1, { obsidian: 4, crystal: 2, steel_bar: 3, ember_core: 1 }, 'smithy', 'boss:wyrm', 'tools');
  R('pickaxe6', 1, { ancient_metal: 4, obsidian: 3, adv_component: 1, construct_cog: 2 }, 'ancient_forge', 'boss:titan', 'tools');
  R('pickaxe7', 1, { star_ore: 4, ancient_core: 1, ancient_metal: 4 }, 'ancient_forge', 'boss:warden', 'tools');
  // weapons
  R('wooden_sword', 1, { wood: 4, fiber: 2 }, 'camp', 'start', 'weapons');
  R('short_bow', 1, { wood: 5, rope: 3 }, 'camp', 'start', 'weapons');
  R('iron_sword', 1, { iron_bar: 3, plank: 1, rope: 1 }, 'furnace', 'start', 'weapons');
  R('iron_spear', 1, { iron_bar: 3, plank: 2, rope: 1 }, 'furnace', 'start', 'weapons');
  R('steel_sword', 1, { steel_bar: 3, darkplank: 1, cloth: 1 }, 'smithy', 'boss:guardian', 'weapons');
  R('steel_hammer', 1, { steel_bar: 5, darkplank: 2, hide: 2 }, 'smithy', 'boss:guardian', 'weapons');
  R('steel_bow', 1, { steel_bar: 2, darkplank: 3, silk: 4 }, 'smithy', 'boss:guardian', 'weapons');
  R('crystal_sword', 1, { crystal: 3, steel_bar: 2, frostplank: 1, fang: 2 }, 'smithy', 'boss:forestking', 'weapons');
  R('crystal_spear', 1, { crystal: 3, steel_bar: 3, frostplank: 2, fang: 2 }, 'smithy', 'boss:forestking', 'weapons');
  R('obsidian_sword', 1, { obsidian: 3, steel_bar: 2, ember_core: 1, hide: 3 }, 'smithy', 'boss:wyrm', 'weapons');
  R('obsidian_hammer', 1, { obsidian: 5, steel_bar: 3, ember_core: 2, hide: 3 }, 'smithy', 'boss:wyrm', 'weapons');
  R('ember_bow', 1, { obsidian: 2, ember_core: 2, silk: 6, frostplank: 3 }, 'smithy', 'boss:wyrm', 'weapons');
  R('ancient_blade', 1, { ancient_metal: 3, obsidian: 2, adv_component: 1, construct_cog: 1 }, 'ancient_forge', 'boss:titan', 'weapons');
  R('ancient_spear', 1, { ancient_metal: 3, obsidian: 2, adv_component: 1, wraith_essence: 2 }, 'ancient_forge', 'boss:titan', 'weapons');
  R('star_blade', 1, { star_ore: 3, ancient_core: 1, ancient_metal: 2 }, 'ancient_forge', 'boss:warden', 'weapons');
  R('star_hammer', 1, { star_ore: 4, ancient_core: 1, ancient_metal: 3, ember_heart: 0 }, 'ancient_forge', 'boss:warden', 'weapons');
  R('star_bow', 1, { star_ore: 3, ancient_core: 1, silk: 8, wraith_essence: 2 }, 'ancient_forge', 'boss:warden', 'weapons');
  // Giant-Slayer: rare boss materials + advanced components
  const SLAYER = { giant_shard: 10, star_core: 1, star_ore: 4, stone_core: 1, forest_heart: 1, wyrm_scale: 1, ember_heart: 1, warden_sigil: 1 };
  R('giant_slayer', 1, SLAYER, 'ancient_forge', 'boss:warden', 'weapons');
  R('slayer_spear', 1, Object.assign({}, SLAYER, { giant_shard: 12 }), 'ancient_forge', 'boss:warden', 'weapons');
  R('slayer_hammer', 1, Object.assign({}, SLAYER, { giant_shard: 14 }), 'ancient_forge', 'boss:warden', 'weapons');
  R('slayer_bow', 1, Object.assign({}, SLAYER, { giant_shard: 10, silk: 10 }), 'ancient_forge', 'boss:warden', 'weapons');
  // armor
  R('leather_armor', 1, { hide: 8, cloth: 2 }, 'camp', 'start', 'armor');
  R('iron_armor', 1, { iron_bar: 8, cloth: 3, rope: 2 }, 'furnace', 'start', 'armor');
  R('steel_armor', 1, { steel_bar: 8, cloth: 3, hide: 4 }, 'smithy', 'boss:guardian', 'armor');
  R('crystal_armor', 1, { crystal: 6, steel_bar: 4, silk: 4 }, 'smithy', 'boss:forestking', 'armor');
  R('obsidian_armor', 1, { obsidian: 6, crystal: 3, ember_core: 2, hide: 4 }, 'smithy', 'boss:wyrm', 'armor');
  R('ancient_armor', 1, { ancient_metal: 6, obsidian: 3, adv_component: 2, construct_cog: 2 }, 'ancient_forge', 'boss:titan', 'armor');
  R('star_armor', 1, { star_ore: 6, ancient_core: 2, ancient_metal: 4 }, 'ancient_forge', 'boss:warden', 'armor');
  R('giant_plate', 1, { giant_shard: 12, star_core: 2, star_ore: 6, stone_core: 1, forest_heart: 1, wyrm_scale: 1, ember_heart: 1, warden_sigil: 1 }, 'ancient_forge', 'boss:warden', 'armor');
  // charms
  R('clover_charm', 1, { herb: 4, gold_bar: 1, fiber: 4 }, 'workshop', 'quest:q_workshop', 'gear');
  R('magnet_ring', 1, { iron_bar: 3, quartz: 2, copper_bar: 1 }, 'workshop', 'quest:q_workshop', 'gear');
  R('swift_boots', 1, { hide: 5, cloth: 3, rope: 2 }, 'workshop', 'quest:q_workshop', 'gear');
  R('miner_charm', 1, { silver_bar: 2, quartz: 3, gear: 1 }, 'workshop', 'tech:engineering1', 'gear');
  R('merchant_seal', 1, { gold_bar: 3, glass: 2, silver_bar: 2 }, 'workshop', 'tech:trade1', 'gear');
  R('vitality_amulet', 1, { crystal: 2, herb: 6, gold_bar: 2 }, 'lab', 'tech:alchemy', 'gear');
  // transport
  R('handcart', 1, { plank: 8, rope: 3, wood: 10 }, 'camp', 'start', 'transport');
  R('mule_pack', 1, { hide: 6, cloth: 6, rope: 4, bread: 6 }, 'workshop', 'quest:q_workshop', 'transport');
  R('wagon', 1, { plank: 16, gear: 4, iron_bar: 8, hide: 4 }, 'workshop', 'tech:engineering1', 'transport');
  R('steam_wagon', 1, { steel_bar: 10, gear: 10, power_cell: 3, glass: 4 }, 'factory', 'tech:electrics', 'transport');
  R('sky_skiff', 1, { adv_component: 6, star_core: 1, glass: 12, frostplank: 10 }, 'ancient_forge', 'boss:warden', 'transport');
  // machines + storage-ish tech
  R('sprinkler', 1, { iron_bar: 2, copper_bar: 1, clay: 2 }, 'workshop', 'tech:agri1', 'machines');
  R('harvester', 1, { gear: 4, circuit: 2, steel_bar: 2 }, 'factory', 'tech:engineering2', 'machines');
  R('auto_miner', 1, { gear: 4, iron_bar: 4, power_cell: 1 }, 'factory', 'tech:engineering2', 'machines');
  R('wood_processor', 1, { gear: 3, iron_bar: 3, wire: 4 }, 'workshop', 'tech:engineering1', 'machines');
  R('conveyor_kit', 1, { gear: 2, iron_bar: 4, silk: 2, rope: 4 }, 'workshop', 'tech:engineering2', 'machines');
  R('sorter', 1, { circuit: 3, gear: 4, silver_bar: 2 }, 'factory', 'tech:engineering3', 'machines');
  // food + potions
  R('bread', 2, { flour: 1 }, 'kitchen', 'start', 'food');
  R('stew', 1, { carrot: 2, pumpkin: 1 }, 'kitchen', 'start', 'food');
  R('pie', 1, { pumpkin: 1, flour: 2, berry: 3 }, 'kitchen', 'quest:q_bakery', 'food');
  R('jam', 2, { berry: 4 }, 'kitchen', 'start', 'food');
  R('heal_potion', 1, { berry: 2, herb: 2, glass: 1 }, 'lab', 'tech:alchemy', 'potions');
  R('greater_heal', 1, { moonbloom: 1, herb: 3, glass: 1 }, 'lab', 'tech:alchemy', 'potions');
  R('elixir_str', 1, { emberpepper: 1, herb: 2, glass: 1 }, 'lab', 'tech:alchemy', 'potions');
  R('elixir_def', 1, { mushroom: 3, herb: 2, glass: 1 }, 'lab', 'tech:alchemy', 'potions');
  R('elixir_speed', 1, { carrot: 3, herb: 1, glass: 1 }, 'lab', 'tech:alchemy', 'potions');
  R('supreme_elixir', 1, { moonbloom: 2, emberpepper: 2, wraith_essence: 1, glass: 1 }, 'lab', 'boss:titan', 'potions');
  R('recall_scroll', 2, { cloth: 1, quartz: 1, fiber: 2 }, 'workshop', 'quest:q_workshop', 'misc');
  // boss preparation: challenge seals
  R('seal_guardian', 1, { stone_brick: 20, iron_bar: 6, coal: 10 }, 'furnace', 'quest:q_stone_road', 'prep');
  R('seal_forest', 1, { darkplank: 8, silver_bar: 4, herb: 10, fang: 6 }, 'workshop', 'boss:guardian', 'prep');
  R('seal_wyrm', 1, { frostplank: 8, crystal: 4, frost_core: 4, gold_bar: 3 }, 'workshop', 'boss:forestking', 'prep');
  R('seal_titan', 1, { obsidian: 6, ember_core: 5, sulfur: 8, steel_bar: 6 }, 'smithy', 'boss:wyrm', 'prep');
  R('seal_warden', 1, { ancient_metal: 6, construct_cog: 6, adv_component: 3, wraith_essence: 4 }, 'ancient_forge', 'boss:titan', 'prep');
  R('giant_key', 1, { stone_core: 1, forest_heart: 1, wyrm_scale: 1, ember_heart: 1, warden_sigil: 1, star_core: 1 }, 'ancient_forge', 'boss:warden', 'prep');
  // endgame legendary gear (needs the Star Forge, built after the Giant falls)
  const LEG = { giant_shard: 25, star_core: 3, abyss_shard: 12, star_ore: 10 };
  R('legend_blade', 1, LEG, 'star_forge', 'boss:giant', 'weapons');
  R('legend_spear', 1, LEG, 'star_forge', 'boss:giant', 'weapons');
  R('legend_hammer', 1, Object.assign({}, LEG, { giant_shard: 30 }), 'star_forge', 'boss:giant', 'weapons');
  R('legend_bow', 1, LEG, 'star_forge', 'boss:giant', 'weapons');
  R('legend_plate', 1, Object.assign({}, LEG, { giant_shard: 30, star_core: 4 }), 'star_forge', 'boss:giant', 'armor');
  R('giant_heart', 1, { giant_shard: 40, star_core: 5, abyss_shard: 20, ember_heart: 1 }, 'star_forge', 'boss:giant', 'gear');
  // the star hammer used a placeholder zero-count; drop it
  for (const r of RECIPES) for (const k of Object.keys(r.ing)) if (r.ing[k] <= 0) delete r.ing[k];

  GF.ITEMS = ITEMS;
  GF.RECIPES = RECIPES;
  GF.CROPS = CROPS.map((c) => c[0]);
  GF.POWER = POWER;
  GF.KIND = KIND;
  GF.ARMOR_DEF = ARMOR_DEF;
})(typeof window !== 'undefined' ? window : globalThis);

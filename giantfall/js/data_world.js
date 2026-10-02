// Static world data: regions, resource nodes, enemies, bosses, dungeons, NPCs, lore.
(function (root) {
  'use strict';
  const GF = root.GF;

  const MAP_W = 190, MAP_H = 150;

  // Regions are rectangles [x0,y0,x1,y1) in tile coordinates. They touch, with walls (and locked gates) between.
  const REGIONS = {
    greenlands: { name: 'Greenlands', rect: [70, 55, 120, 95], tier: 1, floor: 'grass', blurb: 'Gentle meadows around your settlement. Safe, green, and full of basic resources.' },
    stone: { name: 'Stone Valley', rect: [120, 55, 175, 95], tier: 2, floor: 'rock', blurb: 'Rugged canyon rich in iron, copper and coal. Goblins hold the deep ore.' },
    forest: { name: 'Dark Forest', rect: [70, 15, 120, 55], tier: 3, floor: 'forest', blurb: 'A gloomy wood of darkwood, silver and strange herbs. Wolves hunt here.' },
    frozen: { name: 'Frozen Peaks', rect: [120, 10, 175, 55], tier: 4, floor: 'snow', blurb: 'Icy summits glittering with crystal and gold. The cold bites back.' },
    ember: { name: 'Emberlands', rect: [120, 95, 175, 140], tier: 5, floor: 'ash', blurb: 'Volcanic wasteland of obsidian, sulfur and burning crystal.' },
    ruins: { name: 'Ancient Ruins', rect: [70, 95, 120, 140], tier: 6, floor: 'ruin', blurb: 'A buried civilization, guarded by its own machines.' },
    giant: { name: "Giant's Realm", rect: [10, 30, 70, 125], tier: 7, floor: 'giant', blurb: 'The shattered land where the Giant sleeps. Star metal and giant shards litter the ground.' },
  };
  // Gates between regions. [x, y, w, h] covers the wall tiles; opens when the unlock condition is met.
  const GATES = {
    stone: { rect: [119, 73, 2, 5], from: 'greenlands', label: 'Stone Gate', how: 'Pay the Foreman to pave the Stone Road.' },
    forest: { rect: [93, 54, 5, 2], from: 'greenlands', label: 'Forest Gate', how: 'Defeat the Stone Guardian.' },
    frozen: { rect: [119, 33, 2, 5], from: 'forest', label: 'Frost Gate', how: 'Defeat the Forest King.' },
    ember: { rect: [143, 94, 5, 2], from: 'stone', label: 'Ember Gate', how: 'Defeat the Frost Wyrm.' },
    ruins: { rect: [119, 115, 2, 5], from: 'ember', label: 'Ruins Gate', how: 'Defeat the Ember Titan.' },
    giant: { rect: [69, 105, 2, 5], from: 'ruins', label: "Giant's Gate", how: 'Defeat the Ancient Warden.' },
  };
  // What flag opens each gate (state.unlocked[region] = true). 'stone' is opened by the road quest, others by bosses.
  const REGION_UNLOCK_BY_BOSS = { forest: 'guardian', frozen: 'forestking', ember: 'wyrm', ruins: 'titan', giant: 'warden' };

  const HOME = { x: 95, y: 75 }; // settlement centre
  const BUILD_ZONES = [ // progressively larger buildable rectangles (land expansions)
    [88, 70, 103, 81], [85, 68, 106, 83], [82, 65, 109, 86], [79, 62, 112, 89], [76, 59, 115, 92],
  ];
  const LAND_COST = [0, 400, 1800, 7000, 24000];

  // ---------------------------------------------------------------- resource nodes
  // tool: hand|pick|axe. tier: minimum tool tier. hp: hits-to-break scale (damage = tool power).
  const NODES = {
    bush_fiber: { name: 'Fiber Bush', tool: 'hand', tier: 0, hp: 6, drops: [['fiber', 1, 3]], xp: 1, resp: 60, r: 0.35, col: '#5fae48' },
    tree: { name: 'Tree', tool: 'axe', tier: 0, hp: 26, drops: [['wood', 2, 4]], xp: 2, resp: 120, r: 0.45, col: '#3f8a3a' },
    rock: { name: 'Loose Rock', tool: 'hand', tier: 0, hp: 16, drops: [['stone', 1, 3]], xp: 1, resp: 90, r: 0.4, col: '#8a8f98' },
    clay_pit: { name: 'Clay Pit', tool: 'hand', tier: 0, hp: 12, drops: [['clay', 1, 3]], xp: 2, resp: 90, r: 0.4, col: '#b8704a' },
    coal_vein: { name: 'Coal Seam', tool: 'pick', tier: 1, hp: 40, drops: [['coal', 1, 3]], xp: 4, resp: 110, r: 0.45, col: '#30333a' },
    iron_vein: { name: 'Iron Vein', tool: 'pick', tier: 1, hp: 60, drops: [['iron_ore', 1, 3]], xp: 8, resp: 130, r: 0.45, col: '#b98b73' },
    copper_vein: { name: 'Copper Vein', tool: 'pick', tier: 1, hp: 60, drops: [['copper_ore', 1, 3]], xp: 8, resp: 130, r: 0.45, col: '#d9803f' },
    silver_vein: { name: 'Silver Vein', tool: 'pick', tier: 2, hp: 100, drops: [['silver_ore', 1, 2]], xp: 16, resp: 160, r: 0.45, col: '#c9d3dc' },
    gold_vein: { name: 'Gold Vein', tool: 'pick', tier: 2, hp: 120, drops: [['gold_ore', 1, 2]], xp: 22, resp: 180, r: 0.45, col: '#f2c744' },
    quartz_vein: { name: 'Quartz Cluster', tool: 'pick', tier: 2, hp: 100, drops: [['quartz', 1, 2]], xp: 14, resp: 160, r: 0.45, col: '#e8e4f4' },
    darktree: { name: 'Darkwood Tree', tool: 'axe', tier: 2, hp: 80, drops: [['darkwood', 2, 4]], xp: 10, resp: 150, r: 0.5, col: '#2a3a28' },
    herb_patch: { name: 'Herb Patch', tool: 'hand', tier: 0, hp: 6, drops: [['herb', 1, 3]], xp: 3, resp: 80, r: 0.35, col: '#4fae6a' },
    mushroom_patch: { name: 'Mushrooms', tool: 'hand', tier: 0, hp: 6, drops: [['mushroom', 1, 3]], xp: 3, resp: 80, r: 0.35, col: '#c9748a' },
    frosttree: { name: 'Frostpine', tool: 'axe', tier: 3, hp: 130, drops: [['frostwood', 2, 4]], xp: 18, resp: 170, r: 0.5, col: '#7fa8b8' },
    crystal_vein: { name: 'Crystal Vein', tool: 'pick', tier: 3, hp: 170, drops: [['crystal', 1, 2]], xp: 30, resp: 200, r: 0.5, col: '#6fe0ff' },
    sulfur_vent: { name: 'Sulfur Vent', tool: 'pick', tier: 3, hp: 150, drops: [['sulfur', 1, 3]], xp: 25, resp: 170, r: 0.45, col: '#e8d84a' },
    obsidian_vein: { name: 'Obsidian Spire', tool: 'pick', tier: 4, hp: 260, drops: [['obsidian', 1, 2]], xp: 45, resp: 220, r: 0.5, col: '#3b2a5c' },
    ember_vein: { name: 'Ember Crystal', tool: 'pick', tier: 4, hp: 250, drops: [['ember_crystal', 1, 2]], xp: 45, resp: 220, r: 0.5, col: '#ff6a3a' },
    ancient_vein: { name: 'Ancient Metal Vein', tool: 'pick', tier: 5, hp: 420, drops: [['ancient_metal', 1, 2]], xp: 80, resp: 260, r: 0.5, col: '#b8a06a' },
    relic_urn: { name: 'Ancient Urn', tool: 'hand', tier: 0, hp: 8, drops: [['relic', 1, 1, 0.45], ['ancient_metal', 1, 1, 0.1]], xp: 20, resp: 240, r: 0.35, col: '#c8a860' },
    meteor: { name: 'Meteorite', tool: 'pick', tier: 3, hp: 320, drops: [['star_ore', 1, 2], ['iron_ore', 2, 4]], xp: 90, resp: 99999, r: 0.5, col: '#ffcf6a', temp: true },
    star_node: { name: 'Star Ore', tool: 'pick', tier: 6, hp: 750, drops: [['star_ore', 1, 2]], xp: 160, resp: 300, r: 0.5, col: '#ffe27a' },
    giant_rock: { name: 'Giant Rock', tool: 'pick', tier: 6, hp: 950, drops: [['giant_shard', 1, 1, 0.7], ['stone', 2, 4]], xp: 220, resp: 360, r: 0.6, col: '#ff8a5c' },
  };
  // per-region node counts (positions are randomised from the world seed)
  const WILD = {
    greenlands: { tree: 100, bush_fiber: 60, rock: 45, clay_pit: 14, coal_vein: 10 },
    stone: { rock: 30, coal_vein: 30, iron_vein: 50, copper_vein: 45, quartz_vein: 16, silver_vein: 8, gold_vein: 6, tree: 22 },
    forest: { darktree: 90, tree: 20, herb_patch: 40, mushroom_patch: 35, silver_vein: 25, gold_vein: 10, bush_fiber: 30, coal_vein: 10 },
    frozen: { frosttree: 60, crystal_vein: 30, silver_vein: 18, gold_vein: 20, quartz_vein: 20, coal_vein: 15, herb_patch: 10 },
    ember: { obsidian_vein: 36, ember_vein: 24, sulfur_vent: 30, crystal_vein: 20, coal_vein: 25, gold_vein: 12 },
    ruins: { ancient_vein: 30, relic_urn: 30, obsidian_vein: 12, quartz_vein: 16, crystal_vein: 10 },
    giant: { star_node: 18, giant_rock: 26, ancient_vein: 20, obsidian_vein: 12 },
  };

  // ---------------------------------------------------------------- enemies
  // ai: melee | ranged | charger. dmg is raw damage before the player's armor.
  const ENEMIES = {
    slime: { name: 'Slime', hp: 24, dmg: 6, spd: 1.5, r: 0.4, ai: 'melee', aggro: 6, xp: 5, coins: [1, 3], col: '#5adf7a', drops: [['slime_gel', 0.6, 1, 2], ['fiber', 0.3, 1, 1]] },
    boar: { name: 'Wild Boar', hp: 45, dmg: 10, spd: 2.6, r: 0.45, ai: 'charger', aggro: 7, xp: 9, coins: [2, 5], col: '#8a5a3a', drops: [['hide', 0.7, 1, 2], ['bone', 0.4, 1, 1]] },
    rock_beetle: { name: 'Rock Beetle', hp: 70, dmg: 13, spd: 1.6, r: 0.45, ai: 'melee', aggro: 6, xp: 14, coins: [3, 7], col: '#6a6a78', drops: [['stone', 0.7, 1, 3], ['bone', 0.3, 1, 1]] },
    goblin: { name: 'Goblin', hp: 90, dmg: 16, spd: 2.2, r: 0.4, ai: 'melee', aggro: 8, xp: 20, coins: [5, 12], col: '#7ab04a', drops: [['hide', 0.5, 1, 2], ['iron_ore', 0.3, 1, 2]] },
    goblin_archer: { name: 'Goblin Archer', hp: 60, dmg: 15, spd: 1.8, r: 0.4, ai: 'ranged', aggro: 10, range: 7, xp: 22, coins: [5, 12], col: '#98c05a', drops: [['rope', 0.4, 1, 1], ['hide', 0.4, 1, 1]] },
    wolf: { name: 'Dire Wolf', hp: 140, dmg: 24, spd: 3.3, r: 0.45, ai: 'charger', aggro: 10, xp: 42, coins: [8, 18], col: '#5a5a66', drops: [['hide', 0.8, 1, 3], ['fang', 0.5, 1, 2], ['bone', 0.5, 1, 2]] },
    spider: { name: 'Web Spider', hp: 110, dmg: 22, spd: 2.4, r: 0.4, ai: 'ranged', aggro: 10, range: 7, xp: 44, coins: [8, 18], col: '#3a2a4a', drops: [['silk', 0.7, 1, 3], ['fang', 0.3, 1, 1]] },
    bandit: { name: 'Bandit', hp: 190, dmg: 30, spd: 2.5, r: 0.42, ai: 'melee', aggro: 9, xp: 55, coins: [20, 50], col: '#8a4a4a', drops: [['hide', 0.5, 1, 2], ['gold_ore', 0.15, 1, 1]] },
    ice_wolf: { name: 'Ice Wolf', hp: 300, dmg: 40, spd: 3.5, r: 0.45, ai: 'charger', aggro: 11, xp: 100, coins: [15, 35], col: '#a8d0e8', drops: [['hide', 0.6, 1, 2], ['fang', 0.5, 1, 2], ['frost_core', 0.12, 1, 1]] },
    yeti: { name: 'Yeti', hp: 620, dmg: 58, spd: 1.8, r: 0.7, ai: 'melee', aggro: 8, xp: 190, coins: [30, 70], col: '#e8f0f8', drops: [['hide', 0.9, 2, 4], ['frost_core', 0.3, 1, 1], ['bone', 0.6, 1, 3]] },
    frost_wisp: { name: 'Frost Wisp', hp: 230, dmg: 38, spd: 2.2, r: 0.35, ai: 'ranged', aggro: 12, range: 8, xp: 110, coins: [15, 30], col: '#8fe8ff', drops: [['frost_core', 0.25, 1, 1], ['quartz', 0.4, 1, 2]] },
    fire_imp: { name: 'Fire Imp', hp: 470, dmg: 62, spd: 2.6, r: 0.38, ai: 'ranged', aggro: 12, range: 8, xp: 230, coins: [30, 60], col: '#ff6a3a', drops: [['ember_core', 0.2, 1, 1], ['sulfur', 0.5, 1, 2]] },
    magma_golem: { name: 'Magma Golem', hp: 1300, dmg: 92, spd: 1.4, r: 0.8, ai: 'melee', aggro: 8, xp: 520, coins: [60, 140], col: '#d04a1a', drops: [['ember_core', 0.45, 1, 2], ['obsidian', 0.5, 1, 2]] },
    ash_hound: { name: 'Ash Hound', hp: 560, dmg: 70, spd: 3.6, r: 0.45, ai: 'charger', aggro: 12, xp: 260, coins: [35, 70], col: '#7a5a4a', drops: [['hide', 0.6, 1, 3], ['ember_core', 0.15, 1, 1]] },
    construct: { name: 'Ancient Construct', hp: 1700, dmg: 115, spd: 1.7, r: 0.7, ai: 'melee', aggro: 9, xp: 700, coins: [90, 200], col: '#a89860', drops: [['construct_cog', 0.45, 1, 2], ['ancient_metal', 0.25, 1, 1]] },
    wraith: { name: 'Wraith', hp: 1200, dmg: 120, spd: 2.6, r: 0.42, ai: 'ranged', aggro: 13, range: 9, xp: 780, coins: [90, 200], col: '#8ad8c8', drops: [['wraith_essence', 0.5, 1, 2], ['relic', 0.15, 1, 1]] },
    sentry: { name: 'Laser Sentry', hp: 1500, dmg: 130, spd: 1.2, r: 0.55, ai: 'ranged', aggro: 12, range: 10, xp: 820, coins: [90, 200], col: '#d8c870', drops: [['construct_cog', 0.5, 1, 2], ['adv_component', 0.05, 1, 1]] },
    rockling: { name: 'Rockling', hp: 2800, dmg: 150, spd: 2.2, r: 0.7, ai: 'melee', aggro: 10, xp: 1400, coins: [150, 320], col: '#8a6a5a', drops: [['giant_shard', 0.07, 1, 1], ['ancient_metal', 0.3, 1, 2], ['star_ore', 0.1, 1, 1]] },
    shard_golem: { name: 'Shard Golem', hp: 4200, dmg: 190, spd: 1.5, r: 0.9, ai: 'ranged', aggro: 12, range: 9, xp: 2000, coins: [200, 400], col: '#ff8a5c', drops: [['giant_shard', 0.15, 1, 1], ['star_ore', 0.2, 1, 2]] },
    raider: { name: 'Raider', hp: 150, dmg: 22, spd: 2.3, r: 0.4, ai: 'melee', aggro: 30, xp: 30, coins: [10, 25], col: '#aa4040', drops: [['hide', 0.4, 1, 1]] },
  };
  const REGION_ENEMIES = {
    greenlands: { slime: 36, boar: 10 },
    stone: { rock_beetle: 24, goblin: 26, goblin_archer: 14 },
    forest: { wolf: 26, spider: 22, bandit: 16 },
    frozen: { ice_wolf: 24, yeti: 12, frost_wisp: 18 },
    ember: { fire_imp: 22, magma_golem: 12, ash_hound: 18 },
    ruins: { construct: 20, wraith: 18, sentry: 12 },
    giant: { rockling: 24, shard_golem: 12 },
  };

  // ---------------------------------------------------------------- dungeons + bosses
  const DUNGEONS = {
    mossy_cellar: { name: 'Mossy Cellar', region: 'greenlands', size: [46, 40], rooms: 7, boss: 'slimeking', seal: null, mult: 1, loot: 'early', req: 'Practice dungeon: no seal needed.' },
    guardian_pit: { name: "Guardian's Pit", region: 'stone', size: [56, 48], rooms: 9, boss: 'guardian', seal: 'seal_guardian', mult: 1, loot: 'stone', req: 'Guardian Seal opens the arena.' },
    hollow_throne: { name: 'Hollow Throne', region: 'forest', size: [60, 52], rooms: 10, boss: 'forestking', seal: 'seal_forest', mult: 1, loot: 'forest', req: 'Forest Seal opens the arena.' },
    frozen_depths: { name: 'Frozen Depths', region: 'frozen', size: [64, 54], rooms: 11, boss: 'wyrm', seal: 'seal_wyrm', mult: 1, loot: 'frozen', req: 'Wyrm Seal opens the lair.' },
    magma_heart: { name: 'Magma Heart', region: 'ember', size: [66, 56], rooms: 12, boss: 'titan', seal: 'seal_titan', mult: 1, loot: 'ember', req: 'Titan Seal opens the forge.' },
    warden_vault: { name: "Warden's Vault", region: 'ruins', size: [70, 58], rooms: 13, boss: 'warden', seal: 'seal_warden', mult: 1, loot: 'ruins', req: 'Warden Seal opens the vault.' },
    giants_keep: { name: "Giant's Keep", region: 'giant', size: [76, 62], rooms: 14, boss: 'giant', seal: 'giant_key', mult: 1, loot: 'giant', req: "The Giant's Key opens the final gate." },
  };
  const LOOT = {
    early: [['wood', 6, 14], ['stone', 6, 14], ['fiber', 5, 10], ['clay', 3, 8], ['coal', 3, 8], ['seed_wheat', 2, 5], ['bread', 1, 3]],
    stone: [['iron_ore', 6, 14], ['copper_ore', 5, 12], ['coal', 6, 14], ['quartz', 2, 5], ['silver_ore', 1, 4], ['gold_ore', 1, 3]],
    forest: [['silver_ore', 3, 8], ['gold_ore', 2, 5], ['darkwood', 6, 14], ['herb', 4, 10], ['mushroom', 3, 8], ['fang', 2, 5], ['silk', 2, 6]],
    frozen: [['crystal', 2, 5], ['gold_ore', 3, 8], ['frostwood', 5, 12], ['frost_core', 1, 3], ['quartz', 3, 8], ['silver_bar', 1, 3]],
    ember: [['obsidian', 2, 6], ['ember_crystal', 2, 5], ['ember_core', 1, 3], ['sulfur', 4, 10], ['crystal', 2, 5], ['gold_bar', 1, 3]],
    ruins: [['ancient_metal', 2, 5], ['relic', 2, 6], ['construct_cog', 1, 4], ['wraith_essence', 1, 3], ['adv_component', 0, 1], ['obsidian', 2, 5]],
    giant: [['giant_shard', 1, 2], ['star_ore', 1, 3], ['ancient_metal', 3, 7], ['relic', 3, 8], ['adv_component', 1, 2]],
  };

  const BOSSES = {
    slimeking: {
      name: 'The Slime King', title: 'Ruler of the Cellar', hp: 650, dmg: 20, r: 1.3, col: '#4adf6a', dungeon: 'mossy_cellar', xp: 450, coins: 400,
      drops: [['slime_gel', 12], ['seed_pumpkin', 4], ['iron_ore', 6]], first: [['gold_bar', 1]], tier: 1,
      intro: 'Something large wobbles in the dark...', lore: 'A king of slime, grown fat on forgotten supplies.',
      phases: [1, 0.5],
    },
    guardian: {
      name: 'The Stone Guardian', title: 'Keeper of the Deep Ore', hp: 2600, dmg: 38, r: 1.6, col: '#9aa4b8', dungeon: 'guardian_pit', xp: 2400, coins: 1800,
      drops: [['stone_core', 1], ['iron_bar', 6], ['coal', 20]], first: [['guardian_band', 1]], tier: 2,
      intro: 'An ancient golem rises from the rock.', lore: 'Built to protect the deep seams from those who would dig too greedily.',
      phases: [1, 0.55],
    },
    forestking: {
      name: 'The Forest King', title: 'Lord of the Dark Wood', hp: 8000, dmg: 62, r: 1.5, col: '#4a8a48', dungeon: 'hollow_throne', xp: 7500, coins: 5000,
      drops: [['forest_heart', 1], ['darkplank', 10], ['silver_bar', 4]], first: [['forest_crown', 1]], tier: 3,
      intro: 'Antlers crowned in thorns. The forest itself turns to watch.', lore: 'He did not rule the forest; the forest grew around his rage.',
      phases: [1, 0.6, 0.25],
    },
    wyrm: {
      name: 'The Frost Wyrm', title: 'Serpent of the Silent Peak', hp: 17000, dmg: 90, r: 1.7, col: '#8ad0f0', dungeon: 'frozen_depths', xp: 16000, coins: 11000,
      drops: [['wyrm_scale', 1], ['crystal', 8], ['frost_core', 4]], first: [['wyrm_pendant', 1]], tier: 4,
      intro: 'The air turns brittle. Something vast uncoils.', lore: 'It fled the Giant\'s warmth ages ago and now guards the road south.',
      phases: [1, 0.6, 0.3],
    },
    titan: {
      name: 'The Ember Titan', title: 'Heart of the Burning Forge', hp: 40000, dmg: 130, r: 2.0, col: '#e85a2a', dungeon: 'magma_heart', xp: 36000, coins: 26000,
      drops: [['ember_heart', 1], ['obsidian', 10], ['ember_core', 6], ['ember_crystal', 8]], first: [['titan_core_charm', 1]], tier: 5,
      intro: 'The lava rises. A shape of molten rock stands.', lore: 'Forged by the ancients as a furnace-guardian. Its fire never went out.',
      phases: [1, 0.65, 0.35, 0.15],
    },
    warden: {
      name: 'The Ancient Warden', title: 'Last Keeper of the Seal', hp: 85000, dmg: 135, r: 1.8, col: '#d8c070', dungeon: 'warden_vault', xp: 75000, coins: 50000,
      drops: [['warden_sigil', 1], ['ancient_metal', 12], ['construct_cog', 6], ['adv_component', 2]], first: [['warden_crest', 1]], tier: 6,
      intro: 'Pylons hum. The Warden activates, still loyal after ten thousand years.', lore: 'It guarded the way to the Giant\'s Realm. Its sigil is the key to the road.',
      phases: [1, 0.66, 0.33],
    },
    giant: {
      name: 'THE GIANT', title: 'The Sleeper Awakened', hp: 320000, dmg: 290, r: 3.4, col: '#c07a50', dungeon: 'giants_keep', xp: 300000, coins: 200000,
      drops: [['giant_shard', 20], ['star_ore', 12], ['star_core', 2]], first: [['giant_heart', 1]], tier: 8,
      intro: 'The mountain opens its eyes.', lore: 'The last of the giants. It slept for ten thousand years. You woke it, or it woke you.',
      phases: [1, 0.75, 0.5, 0.25, 0.1],
    },
  };
  BOSSES.giant.armor = 0.35; // takes only 35% damage from non-Giant-Slayer weapons

  // ---------------------------------------------------------------- NPCs
  const NPCS = [
    { id: 'general', name: 'Mara the General Merchant', x: 91, y: 68, col: '#d8a860', shop: 'general', unlock: 'start' },
    { id: 'blacksmith', name: 'Bruno the Blacksmith', x: 99, y: 68, col: '#7a6a6a', shop: 'blacksmith', unlock: 'start' },
    { id: 'farmer', name: 'Edda the Farmer', x: 87, y: 78, col: '#8ac060', shop: 'farmer', unlock: 'start' },
    { id: 'foreman', name: 'Garrick the Foreman', x: 95, y: 71, col: '#c07a4a', board: true, unlock: 'start' },
    { id: 'engineer', name: 'Pip the Engineer', x: 104, y: 77, col: '#6a9ac0', shop: 'engineer', unlock: 'quest:q_workshop' },
    { id: 'adventurer', name: 'Sable the Adventurer', x: 101, y: 72, col: '#b05a7a', shop: 'adventurer', unlock: 'boss:slimeking' },
    { id: 'mystic', name: 'Nyx the Mystic Merchant', x: 108, y: 70, col: '#9a6ad0', shop: 'mystic', unlock: 'boss:guardian' },
  ];

  // ---------------------------------------------------------------- lore (tablets, rumors)
  const TABLETS = [
    { id: 't1', region: 'greenlands', title: 'Footprint Stone', text: 'A boulder pressed with a footprint longer than a house. The soil around it is old, but the print is sharp. Something this big walked here once.' },
    { id: 't2', region: 'stone', title: 'Cracked Road', text: 'The old road ends in a rift. Trade records on this tablet say the giants once carried stone for the valley folk, until one stopped working and slept.' },
    { id: 't3', region: 'forest', title: 'Hermit\'s Verse', text: '"When the King of Thorns falls, the cold will open. When the cold falls, the fire will wake. When the fire falls, the Wardens remember."' },
    { id: 't4', region: 'forest', title: 'Root Carving', text: 'Roots curl around carved symbols: a sleeping figure, a ring of stars, and nine keys of stone.' },
    { id: 't5', region: 'frozen', title: 'Frostbitten Log', text: 'Day 12. The mountain trembles every night now. The wyrm does not sleep. It is afraid of what is waking.' },
    { id: 't6', region: 'ember', title: 'Forge Ledger', text: 'The Titan was built to cool the Giant\'s fever. When the Titan\'s fire burns low, the Giant stirs.' },
    { id: 't7', region: 'ember', title: 'Scorched Plaque', text: 'The star-metal fell here first. The ancients forged it into weapons to end the Giant if it ever woke.' },
    { id: 't8', region: 'ruins', title: 'Warden\'s Oath', text: 'We are the Wardens. We hold the Seal. We hold it until the hammer-bearer comes.' },
    { id: 't9', region: 'ruins', title: 'The Great Mistake', text: 'We carved the Giant its kingdom to keep it kind. We were wrong. It does not want a kingdom. It wants the sky.' },
    { id: 't10', region: 'ruins', title: 'Blueprint of a Blade', text: 'Giant shards cut giants. Fuse them with star cores and the sigils of five guardians. Nothing else will bite.' },
    { id: 't11', region: 'ruins', title: 'The Last Entry', text: 'The seal is cracking. Whoever finds this: finish what we could not.' },
    { id: 't12', region: 'giant', title: 'Shattered Colossus', text: 'The broken arm of a statue, taller than a tower. Its face is turned toward the Keep. The statue is not stone. It was a giant, once, and it did not rise.' },
  ];
  const RUMORS = [
    'Mara: "The ground shook again last night. Old Garrick says it is just the valley settling. I do not think he believes that."',
    'Bruno: "Iron is just the beginning. The deep seams in the valley are guarded by something old and heavy."',
    'Edda: "My grandmother said the hills used to walk. She was a funny woman, my grandmother."',
    'Sable: "I saw a footprint in the Greenlands. A footprint, I tell you. As wide as a barn."',
    'Nyx: "The wood speaks of a King, and the peaks of a Wyrm. But all of them speak of the Giant. They are afraid, you know."',
    'Pip: "Every machine I build hums in time with the trembling. Something is waking up under us, and it is not small."',
    'Garrick: "A Giant. That is what the old records call it. Do you know what you need to kill a Giant? Everything. Everything you have."',
    'Hermit: "Break the Seal and he wakes. Do not break it unprepared."',
  ];

  GF.MAP_W = MAP_W; GF.MAP_H = MAP_H;
  GF.REGIONS = REGIONS; GF.GATES = GATES; GF.REGION_UNLOCK_BY_BOSS = REGION_UNLOCK_BY_BOSS;
  GF.HOME = HOME; GF.BUILD_ZONES = BUILD_ZONES; GF.LAND_COST = LAND_COST;
  GF.NODES = NODES; GF.WILD = WILD; GF.ENEMIES = ENEMIES; GF.REGION_ENEMIES = REGION_ENEMIES;
  GF.DUNGEONS = DUNGEONS; GF.LOOT = LOOT; GF.BOSSES = BOSSES; GF.NPCS = NPCS; GF.TABLETS = TABLETS; GF.RUMORS = RUMORS;
})(typeof window !== 'undefined' ? window : globalThis);

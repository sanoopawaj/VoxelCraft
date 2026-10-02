// Data-driven block definitions. Add a row to BLOCK_DEFS to add a block.

export const enum B {
  AIR = 0, GRASS, DIRT, STONE, SAND, GRAVEL, SNOW, SNOWY_GRASS,
  WOOD, PLANKS, LEAVES, GLASS, BRICKS, COBBLE,
  COAL_ORE, IRON_ORE, GOLD_ORE, DIAMOND_ORE,
  WATER, BEDROCK, TORCH, CACTUS,
}

export type ToolType = 'pickaxe' | null;
export type BlockShape = 'cube' | 'liquid' | 'torch';
export type StepSound = 'grass' | 'stone' | 'sand' | 'wood' | 'snow' | 'gravel' | 'glass' | 'water';

export interface BlockDef {
  id: number;
  name: string;
  /** Atlas tile names. */
  tex: { top: string; bottom: string; side: string };
  solid: boolean; // blocks player movement
  opaque: boolean; // hides faces behind it & blocks light fully
  /** Light absorbed when passing through (15 = fully opaque). */
  lightAbsorb: number;
  shape: BlockShape;
  hardness: number; // seconds-ish base; -1 = unbreakable
  tool: ToolType; // tool that speeds it up
  minTier: number; // tool tier needed for drops (0 = anything)
  /** Item id dropped (defaults to the block's own item). null = nothing. */
  drop: number | null | undefined;
  dropCount: number;
  light: number; // emitted light level
  sound: StepSound;
  /** Cull faces between two adjacent blocks of the same kind (water, glass, leaves). */
  cullSame: boolean;
  /** Needs alpha-test (leaves/glass) in the opaque pass. */
  cutout: boolean;
  /** Biome tint applies to this block's top face / all faces. */
  tint: 'none' | 'grass' | 'leaves';
  ore: boolean;
  /** Can the player place blocks in this cell (replaces it). */
  replaceable: boolean;
}

type Partial2 = Omit<Partial<BlockDef>, 'tex'> & { id: number; name: string; tex: string | [string, string, string] };

function def(p: Partial2): BlockDef {
  const t = p.tex;
  const tex = typeof t === 'string' ? { top: t, bottom: t, side: t } : { top: t[0], bottom: t[1], side: t[2] };
  return {
    solid: true, opaque: true, lightAbsorb: 15, shape: 'cube', hardness: 1, tool: null, minTier: 0,
    drop: undefined, dropCount: 1, light: 0, sound: 'stone', cullSame: false, cutout: false,
    tint: 'none', ore: false, replaceable: false,
    ...p, tex,
  } as BlockDef;
}

export const BLOCK_DEFS: BlockDef[] = [
  def({ id: 0, name: 'Air', tex: 'stone', solid: false, opaque: false, lightAbsorb: 0, hardness: -1, drop: null, replaceable: true }),
  def({ id: 1, name: 'Grass', tex: ['grass_top', 'dirt', 'grass_side'], hardness: 0.6, sound: 'grass', tint: 'grass', drop: 2 }),
  def({ id: 2, name: 'Dirt', tex: 'dirt', hardness: 0.5, sound: 'grass' }),
  def({ id: 3, name: 'Stone', tex: 'stone', hardness: 1.5, tool: 'pickaxe' }),
  def({ id: 4, name: 'Sand', tex: 'sand', hardness: 0.5, sound: 'sand' }),
  def({ id: 5, name: 'Gravel', tex: 'gravel', hardness: 0.6, sound: 'gravel' }),
  def({ id: 6, name: 'Snow', tex: 'snow', hardness: 0.3, sound: 'snow' }),
  def({ id: 7, name: 'Snowy Grass', tex: ['snow', 'dirt', 'snow_side'], hardness: 0.6, sound: 'snow', drop: 2 }),
  def({ id: 8, name: 'Wood', tex: ['log_top', 'log_top', 'log_side'], hardness: 2, sound: 'wood' }),
  def({ id: 9, name: 'Planks', tex: 'planks', hardness: 2, sound: 'wood' }),
  def({ id: 10, name: 'Leaves', tex: 'leaves', opaque: false, lightAbsorb: 1, hardness: 0.2, sound: 'grass', cullSame: true, cutout: true, tint: 'leaves' }),
  def({ id: 11, name: 'Glass', tex: 'glass', opaque: false, lightAbsorb: 0, hardness: 0.3, sound: 'glass', cullSame: true, cutout: true }),
  def({ id: 12, name: 'Bricks', tex: 'bricks', hardness: 2, tool: 'pickaxe' }),
  def({ id: 13, name: 'Cobblestone', tex: 'cobble', hardness: 2, tool: 'pickaxe' }),
  def({ id: 14, name: 'Coal Ore', tex: 'coal_ore', hardness: 3, tool: 'pickaxe', minTier: 1, ore: true, drop: 261 }),
  def({ id: 15, name: 'Iron Ore', tex: 'iron_ore', hardness: 3, tool: 'pickaxe', minTier: 2, ore: true, drop: 262 }),
  def({ id: 16, name: 'Gold Ore', tex: 'gold_ore', hardness: 3, tool: 'pickaxe', minTier: 3, ore: true, drop: 263 }),
  def({ id: 17, name: 'Diamond Ore', tex: 'diamond_ore', hardness: 3.5, tool: 'pickaxe', minTier: 3, ore: true, drop: 264 }),
  def({ id: 18, name: 'Water', tex: 'water', solid: false, opaque: false, lightAbsorb: 1, shape: 'liquid', hardness: -1, drop: null, sound: 'water', cullSame: true, replaceable: true }),
  def({ id: 19, name: 'Bedrock', tex: 'bedrock', hardness: -1, drop: null }),
  def({ id: 20, name: 'Torch', tex: 'torch', solid: false, opaque: false, lightAbsorb: 0, shape: 'torch', hardness: 0.05, light: 14, sound: 'wood', cutout: true }),
  def({ id: 21, name: 'Cactus', tex: ['cactus_top', 'cactus_top', 'cactus_side'], hardness: 0.4, sound: 'grass' }),
];

export const BLOCK_COUNT = BLOCK_DEFS.length;

// Flat typed lookup tables for hot loops (mesher, lighting, physics).
export const IS_SOLID = new Uint8Array(256);
export const IS_OPAQUE = new Uint8Array(256);
export const LIGHT_ABSORB = new Uint8Array(256).fill(15);
export const EMIT_LIGHT = new Uint8Array(256);
export const IS_LIQUID = new Uint8Array(256);

for (const b of BLOCK_DEFS) {
  IS_SOLID[b.id] = b.solid ? 1 : 0;
  IS_OPAQUE[b.id] = b.opaque ? 1 : 0;
  LIGHT_ABSORB[b.id] = b.lightAbsorb;
  EMIT_LIGHT[b.id] = b.light;
  IS_LIQUID[b.id] = b.shape === 'liquid' ? 1 : 0;
}

/** Look up a block, falling back to Air for unknown IDs (e.g. from a corrupt save). */
export function getBlockDef(id: number): BlockDef {
  return BLOCK_DEFS[id] ?? BLOCK_DEFS[0];
}

export function isValidBlockId(id: number): boolean {
  return Number.isInteger(id) && id >= 0 && id < BLOCK_COUNT;
}

/** Unique tile names used by blocks (mesher asks the atlas for UVs). */
export function allBlockTextureNames(): string[] {
  const s = new Set<string>();
  for (const b of BLOCK_DEFS) {
    s.add(b.tex.top); s.add(b.tex.bottom); s.add(b.tex.side);
  }
  return [...s];
}

import { BLOCK_COUNT, BLOCK_DEFS, getBlockDef } from '../world/BlockRegistry';
import { MAX_STACK_SIZE } from '../utilities/Constants';

// Item ids 1..BLOCK_COUNT-1 are the block items (same number as the block).
// Non-block items live at 256+ so the two spaces never collide.

export const enum I {
  WOODEN_PICKAXE = 256, STONE_PICKAXE, IRON_PICKAXE, DIAMOND_PICKAXE,
  STICK, COAL, IRON_INGOT, GOLD_INGOT, DIAMOND, MEAT,
}

export interface ToolInfo { type: 'pickaxe'; tier: number; speed: number; damage: number }

export interface ItemDef {
  id: number;
  name: string;
  maxStack: number;
  /** Block placed when used; undefined for pure items. */
  blockId?: number;
  tool?: ToolInfo;
  /** HP restored when eaten. */
  food?: number;
}

export const ITEM_DEFS = new Map<number, ItemDef>();

for (const b of BLOCK_DEFS) {
  if (b.id === 0 || b.id === 18 || b.id === 19) continue; // air/water/bedrock are not items
  ITEM_DEFS.set(b.id, { id: b.id, name: b.name, maxStack: MAX_STACK_SIZE, blockId: b.id });
}

function addItem(d: ItemDef) { ITEM_DEFS.set(d.id, d); }
addItem({ id: I.WOODEN_PICKAXE, name: 'Wooden Pickaxe', maxStack: 1, tool: { type: 'pickaxe', tier: 1, speed: 2.2, damage: 8 } });
addItem({ id: I.STONE_PICKAXE, name: 'Stone Pickaxe', maxStack: 1, tool: { type: 'pickaxe', tier: 2, speed: 3.8, damage: 10 } });
addItem({ id: I.IRON_PICKAXE, name: 'Iron Pickaxe', maxStack: 1, tool: { type: 'pickaxe', tier: 3, speed: 5.5, damage: 12 } });
addItem({ id: I.DIAMOND_PICKAXE, name: 'Diamond Pickaxe', maxStack: 1, tool: { type: 'pickaxe', tier: 4, speed: 8, damage: 15 } });
addItem({ id: I.STICK, name: 'Stick', maxStack: MAX_STACK_SIZE });
addItem({ id: I.COAL, name: 'Coal', maxStack: MAX_STACK_SIZE });
addItem({ id: I.IRON_INGOT, name: 'Iron Ingot', maxStack: MAX_STACK_SIZE });
addItem({ id: I.GOLD_INGOT, name: 'Gold Ingot', maxStack: MAX_STACK_SIZE });
addItem({ id: I.DIAMOND, name: 'Diamond', maxStack: MAX_STACK_SIZE });
addItem({ id: I.MEAT, name: 'Meat', maxStack: MAX_STACK_SIZE, food: 25 });

export function getItemDef(id: number): ItemDef | undefined {
  return ITEM_DEFS.get(id);
}

export function isValidItemId(id: number): boolean {
  return Number.isInteger(id) && ITEM_DEFS.has(id);
}

export function itemForBlock(blockId: number): number | null {
  return ITEM_DEFS.has(blockId) ? blockId : null;
}

/** What breaking `blockId` with `heldItem` should yield: [itemId, count] or null. */
export function blockDrop(blockId: number, heldItem: number): [number, number] | null {
  const b = getBlockDef(blockId);
  if (b.drop === null) return null;
  if (b.tool) {
    const t = getItemDef(heldItem)?.tool;
    const tier = t && t.type === b.tool ? t.tier : 0;
    if (tier < b.minTier) return null; // wrong/weak tool: block is destroyed with no drop
  }
  const item = b.drop === undefined ? b.id : b.drop;
  return ITEM_DEFS.has(item) ? [item, b.dropCount] : null;
}

/** Seconds to break a block with the held item. Infinity = unbreakable. */
export function breakTime(blockId: number, heldItem: number): number {
  const b = getBlockDef(blockId);
  if (b.hardness < 0) return Infinity;
  const base = b.hardness * 1.5;
  if (!b.tool) return Math.max(0.05, base);
  const t = getItemDef(heldItem)?.tool;
  if (t && t.type === b.tool) {
    const penalty = t.tier < b.minTier ? 3 : 1;
    return Math.max(0.05, (base / t.speed) * penalty);
  }
  return base * 3;
}

export { BLOCK_COUNT };

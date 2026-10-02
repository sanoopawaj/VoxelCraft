import { B } from '../world/BlockRegistry';
import { I } from './ItemRegistry';

// Shapeless "hand crafting" recipes: simple, data-driven, no grid needed.

export interface Recipe {
  name: string;
  inputs: Array<[item: number, count: number]>;
  output: [item: number, count: number];
}

export const RECIPES: Recipe[] = [
  { name: 'Planks', inputs: [[B.WOOD, 1]], output: [B.PLANKS, 4] },
  { name: 'Sticks', inputs: [[B.PLANKS, 2]], output: [I.STICK, 4] },
  { name: 'Torches', inputs: [[I.COAL, 1], [I.STICK, 1]], output: [B.TORCH, 4] },
  { name: 'Wooden Pickaxe', inputs: [[B.PLANKS, 3], [I.STICK, 2]], output: [I.WOODEN_PICKAXE, 1] },
  { name: 'Stone Pickaxe', inputs: [[B.STONE, 3], [I.STICK, 2]], output: [I.STONE_PICKAXE, 1] },
  { name: 'Iron Pickaxe', inputs: [[I.IRON_INGOT, 3], [I.STICK, 2]], output: [I.IRON_PICKAXE, 1] },
  { name: 'Diamond Pickaxe', inputs: [[I.DIAMOND, 3], [I.STICK, 2]], output: [I.DIAMOND_PICKAXE, 1] },
  { name: 'Cobblestone', inputs: [[B.STONE, 1]], output: [B.COBBLE, 1] },
  { name: 'Bricks', inputs: [[B.COBBLE, 4]], output: [B.BRICKS, 2] },
  { name: 'Glass', inputs: [[B.SAND, 2]], output: [B.GLASS, 2] },
];

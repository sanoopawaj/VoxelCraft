import { CHUNK_SIZE, WORLD_HEIGHT } from '../utilities/Constants';
import { chunkKey, worldToChunk, worldToLocal } from '../utilities/MathUtil';
import { B, IS_SOLID, getBlockDef, isValidBlockId } from './BlockRegistry';
import { Chunk, blockIndex } from './Chunk';
import type { GenConfig, GeneratedChunk } from './WorldGenerator';

export interface EditEvent { x: number; y: number; z: number; oldId: number; newId: number }

/**
 * Owns loaded chunks and the sparse set of player modifications.
 * Terrain = generator(seed) + mods, so saves only need the mods.
 */
export class World {
  readonly chunks = new Map<number, Chunk>();
  /** chunkKey -> (blockIndex -> blockId) for blocks the player changed. */
  readonly mods = new Map<number, Map<number, number>>();
  /** Edits since last drained; ChunkManager turns these into remesh work. */
  readonly pendingEdits: EditEvent[] = [];

  constructor(readonly cfg: GenConfig) {}

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  isLoaded(wx: number, wz: number): boolean {
    return this.chunks.has(chunkKey(worldToChunk(wx), worldToChunk(wz)));
  }

  /** Block at world coords. Unloaded space reads as air. */
  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0) return B.BEDROCK;
    if (wy >= WORLD_HEIGHT) return B.AIR;
    const c = this.chunks.get(chunkKey(worldToChunk(wx), worldToChunk(wz)));
    if (!c) return B.AIR;
    return c.blocks[blockIndex(worldToLocal(wx), wy, worldToLocal(wz))];
  }

  /** Collision query: unloaded chunks count as solid so nothing falls through unloaded terrain. */
  isSolidForCollision(wx: number, wy: number, wz: number): boolean {
    if (wy < 0) return true;
    if (wy >= WORLD_HEIGHT) return false;
    const c = this.chunks.get(chunkKey(worldToChunk(wx), worldToChunk(wz)));
    if (!c) return true;
    return IS_SOLID[c.blocks[blockIndex(worldToLocal(wx), wy, worldToLocal(wz))]] === 1;
  }

  /** Set a block. `record` stores it as a player modification so it persists. */
  setBlock(wx: number, wy: number, wz: number, id: number, record = true): boolean {
    if (wy < 0 || wy >= WORLD_HEIGHT || !isValidBlockId(id)) return false;
    const cx = worldToChunk(wx);
    const cz = worldToChunk(wz);
    const c = this.getChunk(cx, cz);
    if (!c) return false;
    const lx = worldToLocal(wx);
    const lz = worldToLocal(wz);
    const old = c.blocks[blockIndex(lx, wy, lz)];
    if (!c.setBlock(lx, wy, lz, id)) return false;
    if (record) {
      const key = chunkKey(cx, cz);
      let m = this.mods.get(key);
      if (!m) this.mods.set(key, (m = new Map()));
      m.set(blockIndex(lx, wy, lz), id);
    }
    this.pendingEdits.push({ x: wx, y: wy, z: wz, oldId: old, newId: id });
    return true;
  }

  /** Install a freshly generated chunk and layer saved player edits over it. */
  addChunk(cx: number, cz: number, gen: GeneratedChunk): Chunk {
    const chunk = new Chunk(cx, cz, gen.blocks, gen.biomes);
    const m = this.mods.get(chunkKey(cx, cz));
    if (m) {
      for (const [idx, id] of m) if (isValidBlockId(id)) chunk.blocks[idx] = id;
      chunk.recomputeHeightmap();
      chunk.recountEmitters();
    }
    this.chunks.set(chunkKey(cx, cz), chunk);
    return chunk;
  }

  removeChunk(cx: number, cz: number) {
    this.chunks.delete(chunkKey(cx, cz));
  }

  /** Highest non-air block at a column, or -1 when the chunk isn't loaded. */
  topY(wx: number, wz: number): number {
    const c = this.getChunk(worldToChunk(wx), worldToChunk(wz));
    if (!c) return -1;
    return c.heightmap[worldToLocal(wx) | (worldToLocal(wz) << 4)];
  }

  biomeAt(wx: number, wz: number): number {
    const c = this.getChunk(worldToChunk(wx), worldToChunk(wz));
    return c ? c.biomes[worldToLocal(wx) | (worldToLocal(wz) << 4)] : 0;
  }

  /** Packed light at a cell (sky<<4|block); open sky above the world, 0 if unknown. */
  lightAt(wx: number, wy: number, wz: number): number {
    if (wy >= WORLD_HEIGHT) return 0xf0;
    if (wy < 0) return 0;
    const c = this.getChunk(worldToChunk(wx), worldToChunk(wz));
    if (!c || !c.light) return 0xf0;
    return c.light[blockIndex(worldToLocal(wx), wy, worldToLocal(wz))];
  }

  modCount(): number {
    let n = 0;
    for (const m of this.mods.values()) n += m.size;
    return n;
  }

  describeBlock(wx: number, wy: number, wz: number): string {
    return getBlockDef(this.getBlock(wx, wy, wz)).name;
  }
}

export { CHUNK_SIZE };

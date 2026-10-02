import { CHUNK_AREA, CHUNK_SIZE, CHUNK_VOLUME, WORLD_HEIGHT } from '../utilities/Constants';
import { B, EMIT_LIGHT } from './BlockRegistry';

/** Index layout: x fastest, then z, then y (vertical layers are contiguous). */
export function blockIndex(x: number, y: number, z: number): number {
  return x | (z << 4) | (y << 8);
}

export class Chunk {
  readonly blocks: Uint8Array;
  readonly biomes: Uint8Array = new Uint8Array(CHUNK_AREA);
  /** Highest non-air y per column (0 when empty). Used to bound lighting work. */
  readonly heightmap: Uint8Array = new Uint8Array(CHUNK_AREA);
  /** Packed light: sky<<4 | block. Filled by the mesher's lighting pass. */
  light: Uint8Array | null = null;
  /** Number of light-emitting blocks (torches); lets lighting skip scanning chunks that have none. */
  emitterCount = 0;

  /** Bumped on every edit so cached derived data (meshes) can be invalidated. */
  version = 0;
  /** Mesh bookkeeping owned by ChunkManager. */
  meshVersion = -1;
  dirty = true;
  dirtyPriority = 1;

  constructor(readonly cx: number, readonly cz: number, blocks?: Uint8Array, biomes?: Uint8Array) {
    this.blocks = blocks ?? new Uint8Array(CHUNK_VOLUME);
    if (biomes) this.biomes.set(biomes);
    this.recomputeHeightmap();
    this.recountEmitters();
  }

  recountEmitters() {
    let n = 0;
    for (let i = 0; i < this.blocks.length; i++) if (EMIT_LIGHT[this.blocks[i]]) n++;
    this.emitterCount = n;
  }

  /** Local coordinates; out-of-range y reads as air above and bedrock below. */
  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return B.BEDROCK;
    if (y >= WORLD_HEIGHT) return B.AIR;
    return this.blocks[x | (z << 4) | (y << 8)];
  }

  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (y < 0 || y >= WORLD_HEIGHT || x < 0 || z < 0 || x >= CHUNK_SIZE || z >= CHUNK_SIZE) return false;
    const i = x | (z << 4) | (y << 8);
    if (this.blocks[i] === id) return false;
    const old = this.blocks[i];
    if (EMIT_LIGHT[old]) this.emitterCount--;
    if (EMIT_LIGHT[id]) this.emitterCount++;
    this.blocks[i] = id;
    const col = x | (z << 4);
    if (id !== B.AIR) {
      if (y > this.heightmap[col]) this.heightmap[col] = y;
    } else if (y === this.heightmap[col]) {
      let h = y - 1;
      while (h > 0 && this.blocks[col | (h << 8)] === B.AIR) h--;
      this.heightmap[col] = Math.max(0, h);
    }
    this.version++;
    return true;
  }

  recomputeHeightmap() {
    for (let col = 0; col < CHUNK_AREA; col++) {
      let h = WORLD_HEIGHT - 1;
      while (h > 0 && this.blocks[col | (h << 8)] === B.AIR) h--;
      this.heightmap[col] = h;
    }
  }

  maxHeight(): number {
    let m = 0;
    for (let i = 0; i < CHUNK_AREA; i++) if (this.heightmap[i] > m) m = this.heightmap[i];
    return m;
  }
}

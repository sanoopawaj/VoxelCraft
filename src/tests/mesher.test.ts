import { describe, expect, it } from 'vitest';
import { World } from '../world/World';
import { B } from '../world/BlockRegistry';
import { buildChunkMesh, installAtlas } from '../rendering/ChunkMesher';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../utilities/Constants';

installAtlas(() => [0, 0, 1, 1]);

function emptyWorld() {
  const w = new World({ seed: 1, type: 'test' });
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++)
    w.addChunk(cx, cz, { blocks: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT), biomes: new Uint8Array(256) });
  return w;
}

describe('mesher', () => {
  it('a single block renders 6 faces; a 3x3x3 cube renders only its 54 outer faces', () => {
    const w = emptyWorld();
    w.setBlock(5, 10, 5, B.STONE);
    expect(buildChunkMesh(w, w.getChunk(0, 0)!).faces).toBe(6);
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) w.setBlock(8 + x, 20 + y, 8 + z, B.STONE);
    expect(buildChunkMesh(w, w.getChunk(0, 0)!).faces).toBe(6 + 54);
  });
  it('culls faces across chunk borders and exposes them when the neighbour is dug out', () => {
    const w = emptyWorld();
    w.setBlock(15, 10, 5, B.STONE);
    w.setBlock(16, 10, 5, B.STONE);
    expect(buildChunkMesh(w, w.getChunk(0, 0)!).faces).toBe(5);
    expect(buildChunkMesh(w, w.getChunk(1, 0)!).faces).toBe(5);
    w.setBlock(16, 10, 5, B.AIR);
    expect(buildChunkMesh(w, w.getChunk(0, 0)!).faces).toBe(6);
  });
  it('works at negative coordinates', () => {
    const w = emptyWorld();
    w.setBlock(-1, 10, -1, B.STONE);
    w.setBlock(-2, 10, -1, B.STONE);
    expect(buildChunkMesh(w, w.getChunk(-1, -1)!).faces).toBe(10);
  });
  it('glass next to glass culls shared faces; water goes to the water mesh', () => {
    const w = emptyWorld();
    w.setBlock(3, 10, 3, B.GLASS); w.setBlock(4, 10, 3, B.GLASS);
    w.setBlock(8, 10, 8, B.WATER);
    const m = buildChunkMesh(w, w.getChunk(0, 0)!);
    expect(m.faces).toBe(10 + 6);
    expect(m.water!.vertexCount).toBe(24);
  });
  it('skylight reaches open air and caves are darker; torches emit light', () => {
    const w = emptyWorld();
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < 30; y++) w.setBlock(x, y, z, B.STONE);
    for (let x = 4; x < 9; x++) for (let z = 4; z < 9; z++) for (let y = 10; y < 14; y++) w.setBlock(x, y, z, B.AIR); // sealed cave
    const c = w.getChunk(0, 0)!;
    buildChunkMesh(w, c);
    expect(c.light![(40 << 8)] >> 4).toBe(15);
    expect(c.light![(12 << 8) | (6 << 4) | 6] >> 4).toBe(0);
    w.setBlock(6, 10, 6, B.TORCH);
    buildChunkMesh(w, c);
    const near = c.light![(11 << 8) | (6 << 4) | 6] & 15;
    const far = c.light![(11 << 8) | (6 << 4) | 4] & 15;
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    // Light crosses chunk borders: torch near x=15 lights the next chunk.
    w.setBlock(15, 30, 5, B.TORCH);
    const c1 = w.getChunk(1, 0)!;
    buildChunkMesh(w, c1);
    expect(c1.light![(30 << 8) | (5 << 4) | 0] & 15).toBeGreaterThan(10);
  });
});

import { describe, expect, it } from 'vitest';
import { ChunkManager } from '../world/ChunkManager';
import { World } from '../world/World';
import { B } from '../world/BlockRegistry';
import { installAtlas } from '../rendering/ChunkMesher';
import { worldToChunk } from '../utilities/MathUtil';

installAtlas(() => [0, 0, 1, 1]);

// Minimal renderer stand-in: records which chunks got (re)meshed.
function fakeRenderer() {
  const meshed = new Map<string, number>();
  return {
    meshed,
    setChunkMesh: (cx: number, cz: number) => { const k = `${cx},${cz}`; meshed.set(k, (meshed.get(k) ?? 0) + 1); },
    removeChunk: (cx: number, cz: number) => { meshed.delete(`${cx},${cz}`); },
    hasMesh: (cx: number, cz: number) => meshed.has(`${cx},${cz}`),
    get meshedChunkCount() { return meshed.size; },
    clearOreMarkers() {}, setOreMarkers() {},
  } as any;
}

function settle(cm: ChunkManager, px: number, pz: number) {
  for (let i = 0; i < 400; i++) cm.update(px, pz, 50);
}

describe('ChunkManager', () => {
  it('streams chunks around the player, then unloads far ones', () => {
    const world = new World({ seed: 3, type: 'normal' });
    const r = fakeRenderer();
    const cm = new ChunkManager(world, r);
    cm.setRenderDistance(2);
    settle(cm, 0, 0);
    expect(world.getChunk(0, 0)).toBeDefined();
    expect(r.hasMesh(0, 0)).toBe(true);
    const before = world.chunks.size;
    expect(before).toBeGreaterThan(9);
    settle(cm, 16 * 40, -16 * 40);
    expect(world.getChunk(0, 0)).toBeUndefined();
    expect(r.hasMesh(0, 0)).toBe(false);
    expect(world.chunks.size).toBeLessThan(before + 10);
    expect(world.getChunk(40, -40)).toBeDefined();
    cm.dispose();
  });

  it('editing a block on a chunk edge remeshes the neighbouring chunk (all four edges)', () => {
    const world = new World({ seed: 3, type: 'test' });
    const r = fakeRenderer();
    const cm = new ChunkManager(world, r);
    cm.setRenderDistance(3);
    settle(cm, 8, 8);
    const edits: Array<[number, number, [number, number]]> = [
      [15, 5, [1, 0]], [16, 5, [-1, 0]], [5, 15, [0, 1]], [5, 16, [0, -1]], [-1, 5, [1, 0]], [5, -1, [0, 1]], [0, 5, [-1, 0]], [5, 0, [0, -1]],
    ];
    for (const [x, z, [dx, dz]] of edits) {
      const cx = worldToChunk(x), cz = worldToChunk(z);
      const neighbourKey = `${cx + dx},${cz + dz}`;
      const ownKey = `${cx},${cz}`;
      const nb0 = r.meshed.get(neighbourKey) ?? 0, own0 = r.meshed.get(ownKey) ?? 0;
      expect(world.setBlock(x, 70, z, B.STONE)).toBe(true);
      settle(cm, 8, 8);
      expect(r.meshed.get(ownKey)).toBeGreaterThan(own0);
      expect(r.meshed.get(neighbourKey), `neighbour of edit ${x},${z}`).toBeGreaterThan(nb0);
    }
    cm.dispose();
  });

  it('an edit deep inside a chunk does not remesh distant neighbours', () => {
    const world = new World({ seed: 3, type: 'test' });
    const r = fakeRenderer();
    const cm = new ChunkManager(world, r);
    cm.setRenderDistance(3);
    settle(cm, 8, 8);
    const far = r.meshed.get('1,0') ?? 0;
    world.setBlock(8, 70, 8, B.STONE); // centre of chunk (0,0); sky-lit air so light reach is large, but x=8 is 8 from borders
    settle(cm, 8, 8);
    expect((r.meshed.get('0,0') ?? 0)).toBeGreaterThan(1);
    // Neighbours within light reach (15) may legitimately update; chunks two away never do.
    expect(r.meshed.get('2,0') ?? 0).toBe(1);
    expect(far).toBeGreaterThan(0);
    cm.dispose();
  });
});

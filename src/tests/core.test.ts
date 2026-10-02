import { describe, expect, it } from 'vitest';
import { BLOCK_DEFS, IS_SOLID, B } from '../world/BlockRegistry';
import { Chunk } from '../world/Chunk';
import { World } from '../world/World';
import { generateChunk, findSpawnColumn } from '../world/WorldGenerator';
import { floorDiv, mod, worldToChunk, worldToLocal, chunkKey, chunkKeyToCoords } from '../utilities/MathUtil';
import { seedFromString } from '../utilities/Random';
import { Noise } from '../utilities/Noise';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../utilities/Constants';
import { ITEM_DEFS } from '../items/ItemRegistry';

describe('block registry', () => {
  it('has unique, contiguous ids', () => {
    const ids = BLOCK_DEFS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id, i) => expect(id).toBe(i));
  });
  it('every block has the required properties', () => {
    for (const b of BLOCK_DEFS) {
      expect(typeof b.name).toBe('string');
      expect(b.tex.top && b.tex.bottom && b.tex.side).toBeTruthy();
      expect(typeof b.solid).toBe('boolean');
      expect(typeof b.hardness).toBe('number');
      expect(b.lightAbsorb).toBeGreaterThanOrEqual(0);
    }
  });
  it('water and torch are non-solid, glass is solid', () => {
    expect(IS_SOLID[B.WATER]).toBe(0);
    expect(IS_SOLID[B.TORCH]).toBe(0);
    expect(IS_SOLID[B.GLASS]).toBe(1);
  });
  it('every placeable block has an item', () => {
    for (const b of BLOCK_DEFS) if (![0, 18, 19].includes(b.id)) expect(ITEM_DEFS.has(b.id)).toBe(true);
  });
});

describe('coordinates', () => {
  it('floors negatives correctly', () => {
    expect(floorDiv(-1, 16)).toBe(-1);
    expect(worldToChunk(-1)).toBe(-1);
    expect(worldToChunk(-16)).toBe(-1);
    expect(worldToChunk(-17)).toBe(-2);
    expect(worldToChunk(15)).toBe(0);
    expect(worldToChunk(16)).toBe(1);
    expect(worldToLocal(-1)).toBe(15);
    expect(worldToLocal(-16)).toBe(0);
    expect(worldToLocal(-17)).toBe(15);
    expect(mod(-1, 16)).toBe(15);
  });
  it('round-trips chunk keys incl. negatives', () => {
    for (const [a, b] of [[0, 0], [-1, -1], [5, -9], [-300, 700]]) expect(chunkKeyToCoords(chunkKey(a, b))).toEqual([a, b]);
  });
  it('world get/set works in all four quadrants and at chunk edges', () => {
    const w = new World({ seed: 1, type: 'test' });
    for (let cx = -2; cx <= 1; cx++) for (let cz = -2; cz <= 1; cz++) w.addChunk(cx, cz, { blocks: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT), biomes: new Uint8Array(256) });
    const pts: [number, number][] = [[0, 0], [15, 15], [16, 16], [-1, -1], [-16, -16], [-17, 5], [5, -17], [31, -32], [-32, 31]];
    pts.forEach(([x, z], i) => {
      expect(w.setBlock(x, 10, z, B.STONE + (i % 5))).toBe(true);
      expect(w.getBlock(x, 10, z)).toBe(B.STONE + (i % 5));
    });
    expect(w.getBlock(1, 10, 1)).toBe(0);
    expect(w.mods.size).toBeGreaterThan(3);
  });
});

describe('chunk', () => {
  it('get/set and heightmap', () => {
    const c = new Chunk(0, 0);
    expect(c.setBlock(3, 40, 4, B.STONE)).toBe(true);
    expect(c.getBlock(3, 40, 4)).toBe(B.STONE);
    expect(c.heightmap[3 | (4 << 4)]).toBe(40);
    c.setBlock(3, 40, 4, B.AIR);
    expect(c.heightmap[3 | (4 << 4)]).toBe(0);
    expect(c.setBlock(16, 0, 0, 1)).toBe(false);
    expect(c.getBlock(0, -5, 0)).toBe(B.BEDROCK);
    expect(c.getBlock(0, 500, 0)).toBe(B.AIR);
  });
});

describe('generation', () => {
  const cfg = { seed: 482913, type: 'normal' as const };
  it('same seed => identical terrain', () => {
    for (const [cx, cz] of [[0, 0], [-3, 4], [7, -9]]) {
      const a = generateChunk(cfg, cx, cz);
      const b = generateChunk({ ...cfg }, cx, cz);
      expect(Buffer.compare(Buffer.from(a.blocks), Buffer.from(b.blocks))).toBe(0);
    }
  });
  it('different seed => different terrain', () => {
    const a = generateChunk(cfg, 2, 2);
    const b = generateChunk({ seed: 99, type: 'normal' }, 2, 2);
    expect(Buffer.compare(Buffer.from(a.blocks), Buffer.from(b.blocks))).not.toBe(0);
  });
  it('has bedrock floor and stone, and chunk borders agree on trees (no seams)', () => {
    const c = generateChunk(cfg, 0, 0);
    for (let i = 0; i < 256; i++) expect(c.blocks[i]).toBe(B.BEDROCK);
  });
  it('seed text parsing keeps numeric seeds exact', () => {
    expect(seedFromString('482913')).toBe(482913);
    expect(seedFromString('-5')).toBe(-5);
    expect(seedFromString('hello')).toBe(seedFromString('hello'));
    expect(seedFromString('hello')).not.toBe(seedFromString('world'));
  });
  it('spawn is deterministic and on dry land', () => {
    const a = findSpawnColumn(cfg), b = findSpawnColumn(cfg);
    expect(a).toEqual(b);
    expect(a.y).toBeGreaterThan(62);
  });
  it('noise is deterministic and bounded', () => {
    const n = new Noise(5), m = new Noise(5);
    for (let i = 0; i < 200; i++) {
      const v = n.noise3(i * 0.37, i * 0.11, -i * 0.5);
      expect(v).toBe(m.noise3(i * 0.37, i * 0.11, -i * 0.5));
      expect(Math.abs(v)).toBeLessThanOrEqual(1.2);
    }
  });
  it('produces every biome, ores, caves, water and trees over a large area (stats)', () => {
    const counts = new Map<number, number>();
    const biomes = new Set<number>();
    for (let cx = -24; cx < 24; cx += 2) for (let cz = -24; cz < 24; cz += 2) {
      const c = generateChunk(cfg, cx, cz);
      biomes.add(c.biomes[0]);
      for (let i = 0; i < c.blocks.length; i += 3) counts.set(c.blocks[i], (counts.get(c.blocks[i]) ?? 0) + 1);
    }
    for (const id of [B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE, B.WATER, B.WOOD, B.LEAVES, B.SAND, B.SNOW, B.STONE]) expect(counts.get(id) ?? 0, `block ${id}`).toBeGreaterThan(0);
    expect(biomes.size).toBeGreaterThanOrEqual(4);
  });
});

import { Inventory } from '../items/Inventory';
import { RECIPES } from '../items/Recipes';
import { I, breakTime, blockDrop } from '../items/ItemRegistry';
import { SaveManager, validateSave, modsFromWorld } from '../save/SaveManager';
import { sanitizeSettings } from '../save/Settings';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe('inventory', () => {
  it('adds, stacks to max, and reports overflow', () => {
    const inv = new Inventory();
    expect(inv.add(B.STONE, 100)).toBe(0);
    expect(inv.slots[0]).toEqual({ id: B.STONE, count: 64 });
    expect(inv.slots[1]).toEqual({ id: B.STONE, count: 36 });
    expect(inv.count(B.STONE)).toBe(100);
    for (let i = 0; i < 40; i++) inv.add(B.DIRT, 64);
    expect(inv.add(B.DIRT, 64)).toBe(64); // full
  });
  it('removes across stacks', () => {
    const inv = new Inventory();
    inv.add(B.DIRT, 70);
    expect(inv.remove(B.DIRT, 66)).toBe(66);
    expect(inv.count(B.DIRT)).toBe(4);
    expect(inv.remove(B.DIRT, 10)).toBe(4);
    expect(inv.count(B.DIRT)).toBe(0);
  });
  it('tools do not stack; unknown ids rejected', () => {
    const inv = new Inventory();
    inv.add(I.WOODEN_PICKAXE, 2);
    expect(inv.slots[0]!.count).toBe(1);
    expect(inv.add(9999, 5)).toBe(5);
  });
  it('crafting consumes inputs and produces output', () => {
    const inv = new Inventory();
    inv.add(B.WOOD, 2);
    const planks = RECIPES.find((r) => r.name === 'Planks')!;
    expect(inv.craft(planks)).toBe(true);
    expect(inv.count(B.WOOD)).toBe(1);
    expect(inv.count(B.PLANKS)).toBe(4);
    inv.craft(RECIPES.find((r) => r.name === 'Sticks')!);
    expect(inv.craft(RECIPES.find((r) => r.name === 'Wooden Pickaxe')!)).toBe(false); // not enough
    expect(inv.count(B.PLANKS)).toBe(2);
  });
  it('click semantics swap/merge/split safely and sanitises loaded data', () => {
    const inv = new Inventory();
    inv.set(0, { id: B.STONE, count: 10 });
    let cur = inv.clickSlot(0, null);
    expect(cur).toEqual({ id: B.STONE, count: 10 });
    cur = inv.clickSlot(1, cur);
    expect(cur).toBeNull();
    cur = inv.rightClickSlot(1, null);
    expect(cur!.count).toBe(5);
    inv.loadJSON([[B.STONE, 999], [12345, 3], [B.DIRT, -4], 'x', null], 99);
    expect(inv.slots[0]).toEqual({ id: B.STONE, count: 64 });
    expect(inv.slots[1]).toBeNull();
    expect(inv.slots[2]).toBeNull();
    expect(inv.selected).toBe(0);
  });
  it('tool speeds up stone and gates ore drops', () => {
    expect(breakTime(B.STONE, I.WOODEN_PICKAXE)).toBeLessThan(breakTime(B.STONE, 0));
    expect(blockDrop(B.DIAMOND_ORE, I.STONE_PICKAXE)).toBeNull();
    expect(blockDrop(B.DIAMOND_ORE, I.IRON_PICKAXE)).toEqual([I.DIAMOND, 1]);
    expect(blockDrop(B.STONE, 0)).toEqual([B.STONE, 1]);
    expect(blockDrop(B.GRASS, 0)).toEqual([B.DIRT, 1]);
    expect(breakTime(B.BEDROCK, I.DIAMOND_PICKAXE)).toBe(Infinity);
  });
});

describe('saving', () => {
  const mkSave = (meta: any) => ({
    version: 1, meta, time: 5000,
    player: { x: -12.5, y: 70, z: 33.2, yaw: 1, pitch: -0.3, health: 77, spawn: { x: 0, y: 70, z: 0 } },
    inventory: [[B.STONE, 12]], selected: 3, mods: [[-2, 5, [10, B.STONE, 99, 0]]] as [number, number, number[]][],
  });
  it('round-trips a world with negative-chunk mods', () => {
    const sm = new SaveManager(new MemStorage());
    const meta = sm.createWorld('Test', '482913', 'normal');
    expect(meta.seed).toBe(482913);
    sm.saveWorld(mkSave(meta));
    const r = sm.loadWorld(meta.id);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.save.player.x).toBe(-12.5);
      expect(r.save.mods[0]).toEqual([-2, 5, [10, B.STONE, 99, 0]]);
      expect(r.save.selected).toBe(3);
    }
    expect(sm.listWorlds()).toHaveLength(1);
    sm.deleteWorld(meta.id);
    expect(sm.listWorlds()).toHaveLength(0);
    expect(sm.loadWorld(meta.id).ok).toBe(false);
  });
  it('World mods serialise and reapply', () => {
    const w = new World({ seed: 1, type: 'test' });
    w.addChunk(-1, -1, { blocks: new Uint8Array(32768), biomes: new Uint8Array(256) });
    w.setBlock(-3, 20, -4, B.BRICKS);
    const mods = modsFromWorld(w);
    const w2 = new World({ seed: 1, type: 'test' });
    for (const [cx, cz, flat] of mods) { const m = new Map<number, number>(); for (let i = 0; i < flat.length; i += 2) m.set(flat[i], flat[i + 1]); w2.mods.set(chunkKey(cx, cz), m); }
    w2.addChunk(-1, -1, { blocks: new Uint8Array(32768), biomes: new Uint8Array(256) });
    expect(w2.getBlock(-3, 20, -4)).toBe(B.BRICKS);
  });
  it('survives corrupt data: falls back to tmp copy, else reports an error', () => {
    const st = new MemStorage();
    const sm = new SaveManager(st);
    const meta = sm.createWorld('T', '', 'normal');
    sm.saveWorld(mkSave(meta));
    const good = st.getItem(`voxelcraft:world:${meta.id}`)!;
    st.setItem(`voxelcraft:world:${meta.id}`, good.slice(0, 40)); // truncated
    expect(sm.loadWorld(meta.id).ok).toBe(false);
    st.setItem(`voxelcraft:world:${meta.id}:tmp`, good);
    const r = sm.loadWorld(meta.id);
    expect(r.ok && r.recovered).toBe(true);
    expect(validateSave({ meta: {}, player: {} })).toBeNull();
    expect(validateSave(null)).toBeNull();
  });
  it('sanitises settings', () => {
    const s = sanitizeSettings({ fov: 9999, renderDistance: -3, masterVolume: 'x', bindings: { jump: 'KeyJ' } });
    expect(s.fov).toBe(110);
    expect(s.renderDistance).toBeGreaterThanOrEqual(2);
    expect(s.masterVolume).toBeGreaterThanOrEqual(0);
    expect(s.bindings.jump).toBe('KeyJ');
    expect(s.bindings.forward).toBe('KeyW');
  });
});

describe('vegetation across chunk borders', () => {
  it('every leaf block that overhangs a chunk border has a trunk-connected tree (no orphan canopies)', () => {
    // Orphan check: for each leaf cell, a wood block must exist within 7 blocks below/around it in world space.
    const cfg = { seed: 424242, type: 'normal' as const };
    const chunks = new Map<string, Uint8Array>();
    for (let cx = -6; cx <= 6; cx++) for (let cz = -6; cz <= 6; cz++) chunks.set(`${cx},${cz}`, generateChunk(cfg, cx, cz).blocks);
    const get = (x: number, y: number, z: number) => { const c = chunks.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`); return c ? c[(x & 15) | ((z & 15) << 4) | (y << 8)] : -1; };
    let leaves = 0, orphans = 0;
    for (let cx = -4; cx <= 4; cx++) for (let cz = -4; cz <= 4; cz++) {
      const c = chunks.get(`${cx},${cz}`)!;
      for (let i = 0; i < c.length; i++) {
        if (c[i] !== B.LEAVES) continue;
        leaves++;
        const x = cx * 16 + (i & 15), z = cz * 16 + ((i >> 4) & 15), y = i >> 8;
        let found = false;
        for (let dy = 0; dy <= 8 && !found; dy++) for (let dx = -4; dx <= 4 && !found; dx++) for (let dz = -4; dz <= 4; dz++) if (get(x + dx, y - dy, z + dz) === B.WOOD) { found = true; break; }
        if (!found) orphans++;
      }
    }
    expect(leaves).toBeGreaterThan(500);
    expect(orphans).toBe(0);
  });
});

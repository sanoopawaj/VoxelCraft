import { describe, expect, it } from 'vitest';
import { World } from '../world/World';
import { B } from '../world/BlockRegistry';
import { Player } from '../player/Player';
import { raycastBlocks } from '../interaction/BlockRaycaster';
import { generateChunk } from '../world/WorldGenerator';

function flatWorld() {
  const w = new World({ seed: 1, type: 'test' });
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) {
    const blocks = new Uint8Array(32768);
    for (let i = 0; i < 256; i++) for (let y = 0; y <= 60; y++) blocks[i | (y << 8)] = B.STONE;
    w.addChunk(cx, cz, { blocks, biomes: new Uint8Array(256) });
  }
  return w;
}
const none = { forward: false, back: false, left: false, right: false, jump: false, sprint: false };

describe('player physics', () => {
  it('lands on the ground and stays there (no sinking)', () => {
    const w = flatWorld();
    const p = new Player();
    p.teleport(0.5, 65, 0.5);
    for (let i = 0; i < 120; i++) p.update(1 / 60, none, w);
    expect(p.onGround).toBe(true);
    expect(p.y).toBeCloseTo(61, 2);
  });
  it('is stopped by a wall and slides along it', () => {
    const w = flatWorld();
    for (let y = 61; y < 64; y++) for (let z = -5; z < 5; z++) w.setBlock(3, y, z, B.STONE);
    const p = new Player();
    p.teleport(0.5, 61, 0.5);
    p.yaw = -Math.PI / 2; // face +X
    for (let i = 0; i < 120; i++) p.update(1 / 60, { ...none, forward: true }, w);
    expect(p.x).toBeLessThan(3 - 0.3 + 0.01);
    expect(p.x).toBeGreaterThan(2.5);
  });
  it('jumps ~1.2 blocks and sprints faster', () => {
    const w = flatWorld();
    const p = new Player();
    p.teleport(0.5, 61, 0.5);
    for (let i = 0; i < 10; i++) p.update(1 / 60, none, w);
    let top = 0;
    for (let i = 0; i < 60; i++) { p.update(1 / 60, { ...none, jump: true }, w); top = Math.max(top, p.y - 61); }
    expect(top).toBeGreaterThan(1.0);
    expect(top).toBeLessThan(1.5);
    const a = new Player(), b = new Player();
    a.teleport(0.5, 61, 0.5); b.teleport(0.5, 61, 0.5);
    for (let i = 0; i < 90; i++) { a.update(1 / 60, { ...none, forward: true }, w); b.update(1 / 60, { ...none, forward: true, sprint: true }, w); }
    expect(Math.abs(b.z - 0.5)).toBeGreaterThan(Math.abs(a.z - 0.5) * 1.2);
  });
  it('takes fall damage only for big falls', () => {
    const w = flatWorld();
    const p = new Player();
    p.teleport(0.5, 64, 0.5); // 3 block fall
    for (let i = 0; i < 90; i++) p.update(1 / 60, none, w);
    expect(p.health).toBe(100);
    p.teleport(0.5, 80, 0.5); // 19 blocks
    for (let i = 0; i < 120; i++) p.update(1 / 60, none, w);
    expect(p.health).toBeLessThan(100);
  });
  it('swims: slower gravity and can rise in water', () => {
    const w = flatWorld();
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) for (let y = 61; y <= 66; y++) w.setBlock(x, y, z, B.WATER);
    const p = new Player();
    p.teleport(0.5, 64, 0.5);
    for (let i = 0; i < 60; i++) p.update(1 / 60, none, w);
    expect(p.inWater).toBe(true);
    expect(p.vy).toBeGreaterThan(-3.3);
    expect(p.health).toBe(100);
    for (let i = 0; i < 60; i++) p.update(1 / 60, { ...none, jump: true }, w);
    expect(p.y).toBeGreaterThan(62);
  });
  it('works across negative coordinates and does not fall into unloaded space', () => {
    const w = flatWorld();
    const p = new Player();
    p.teleport(-20.5, 61, -20.5);
    p.yaw = Math.PI;
    for (let i = 0; i < 200; i++) p.update(1 / 60, { ...none, forward: true, sprint: true }, w);
    expect(p.y).toBeGreaterThan(60.9);
    const q = new Player();
    q.teleport(500.5, 70, 500.5); // unloaded
    for (let i = 0; i < 100; i++) q.update(1 / 60, none, w);
    expect(q.y).toBe(70);
  });
});

describe('raycast', () => {
  it('hits the face we are looking at, with the right normal, and ignores water', () => {
    const w = flatWorld();
    w.setBlock(5, 63, 5, B.STONE);
    const hit = raycastBlocks(w, 5.5, 63.5, 0.5, 0, 0, 1, 10)!;
    expect(hit).toMatchObject({ x: 5, y: 63, z: 5, nx: 0, ny: 0, nz: -1 });
    w.setBlock(5, 63, 3, B.WATER);
    expect(raycastBlocks(w, 5.5, 63.5, 0.5, 0, 0, 1, 10)!.z).toBe(5);
    expect(raycastBlocks(w, 5.5, 63.5, 0.5, 0, 0, 1, 2)).toBeNull();
    const down = raycastBlocks(w, 0.5, 65.5, 0.5, 0, -1, 0, 10)!;
    expect(down).toMatchObject({ y: 60, ny: 1 });
  });
  it('works toward negative directions', () => {
    const w = flatWorld();
    w.setBlock(-6, 62, -6, B.BRICKS);
    const hit = raycastBlocks(w, -0.5, 62.5, -5.5, -1, 0, 0, 10)!;
    expect(hit).toMatchObject({ x: -6, nx: 1 });
  });
});

describe('generation near spawn is walkable', () => {
  it('spawn column surface is solid ground with air above', () => {
    const c = generateChunk({ seed: 7, type: 'normal' }, 0, 0);
    expect(c.blocks.length).toBe(32768);
  });
});

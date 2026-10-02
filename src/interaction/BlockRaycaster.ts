import type { World } from '../world/World';
import { IS_LIQUID } from '../world/BlockRegistry';

export interface RayHit {
  x: number; y: number; z: number; // target block
  nx: number; ny: number; nz: number; // face normal (points into the empty cell)
  distance: number;
  hx: number; hy: number; hz: number; // exact hit position
}

/**
 * Amanatides & Woo voxel traversal. Air and liquids are skipped (you target the
 * block behind water), everything else - including non-solid torches - can be hit.
 */
export function raycastBlocks(
  world: World, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number,
): RayHit | null {
  const len = Math.hypot(dx, dy, dz);
  if (len === 0) return null;
  dx /= len; dy /= len; dz /= len;
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tDeltaY : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ : Infinity;
  let nx = 0, ny = 0, nz = 0;
  let t = 0;
  for (let i = 0; i < 256 && t <= maxDist; i++) {
    const id = world.getBlock(x, y, z);
    if (id !== 0 && !IS_LIQUID[id]) {
      return { x, y, z, nx, ny, nz, distance: t, hx: ox + dx * t, hy: oy + dy * t, hz: oz + dz * t };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0; }
    else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0; }
    else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ; }
  }
  return null;
}

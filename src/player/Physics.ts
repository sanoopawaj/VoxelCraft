import type { World } from '../world/World';
import { IS_LIQUID } from '../world/BlockRegistry';

// Shared AABB-vs-voxel movement for the player, mobs and item drops.

export interface Body {
  x: number; y: number; z: number; // feet centre
  vx: number; vy: number; vz: number;
  halfW: number; height: number;
  onGround: boolean;
  hitX: boolean; hitZ: boolean;
}

const EPS = 1e-4;
const MAX_STEP = 0.4; // never move more than this per sub-step so we can't skip through a block

function collidesAt(world: World, x: number, y: number, z: number, hw: number, h: number): boolean {
  const x0 = Math.floor(x - hw + EPS), x1 = Math.floor(x + hw - EPS);
  const y0 = Math.floor(y + EPS), y1 = Math.floor(y + h - EPS);
  const z0 = Math.floor(z - hw + EPS), z1 = Math.floor(z + hw - EPS);
  for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) {
    if (world.isSolidForCollision(bx, by, bz)) return true;
  }
  return false;
}

export function bodyOverlapsSolid(world: World, b: Body): boolean {
  return collidesAt(world, b.x, b.y, b.z, b.halfW, b.height);
}

/** Move a body by its velocity, sliding along walls. Updates onGround/hitX/hitZ and zeroes blocked velocity. */
export function moveBody(world: World, b: Body, dt: number) {
  b.hitX = b.hitZ = false;
  const dist = Math.max(Math.abs(b.vx), Math.abs(b.vy), Math.abs(b.vz)) * dt;
  const steps = Math.max(1, Math.ceil(dist / MAX_STEP));
  const sdt = dt / steps;
  let landed = false;
  for (let s = 0; s < steps; s++) {
    // X
    if (b.vx !== 0) {
      const nx = b.x + b.vx * sdt;
      if (collidesAt(world, nx, b.y, b.z, b.halfW, b.height)) {
        b.x = b.vx > 0 ? Math.floor(nx + b.halfW) - b.halfW - EPS : Math.floor(nx - b.halfW) + 1 + b.halfW + EPS;
        // Snap guard: if rounding left us still colliding, stay put.
        if (collidesAt(world, b.x, b.y, b.z, b.halfW, b.height)) b.x -= Math.sign(b.vx) * 0.01;
        b.vx = 0; b.hitX = true;
      } else b.x = nx;
    }
    // Z
    if (b.vz !== 0) {
      const nz = b.z + b.vz * sdt;
      if (collidesAt(world, b.x, b.y, nz, b.halfW, b.height)) {
        b.z = b.vz > 0 ? Math.floor(nz + b.halfW) - b.halfW - EPS : Math.floor(nz - b.halfW) + 1 + b.halfW + EPS;
        if (collidesAt(world, b.x, b.y, b.z, b.halfW, b.height)) b.z -= Math.sign(b.vz) * 0.01;
        b.vz = 0; b.hitZ = true;
      } else b.z = nz;
    }
    // Y
    if (b.vy !== 0) {
      const ny = b.y + b.vy * sdt;
      if (collidesAt(world, b.x, ny, b.z, b.halfW, b.height)) {
        if (b.vy < 0) { b.y = Math.floor(ny) + 1; landed = true; }
        else b.y = Math.floor(ny + b.height) - b.height - EPS;
        b.vy = 0;
      } else b.y = ny;
    }
  }
  // Ground probe: is there support just below the feet?
  b.onGround = landed || (b.vy <= 0 && collidesAt(world, b.x, b.y - 0.02, b.z, b.halfW, 0.02));
}

export function isLiquidAt(world: World, x: number, y: number, z: number): boolean {
  return IS_LIQUID[world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))] === 1;
}

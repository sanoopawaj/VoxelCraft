import * as THREE from 'three';
import {
  MAX_HOSTILE_MOBS, MAX_PASSIVE_MOBS, MOB_DESPAWN_DISTANCE, MOB_FAR_UPDATE_DISTANCE,
} from '../utilities/Constants';
import { I } from '../items/ItemRegistry';
import { B, getBlockDef, IS_SOLID } from '../world/BlockRegistry';
import type { World } from '../world/World';
import { Mob, type MobKind } from './Mob';
import type { ItemDrops } from './ItemDrops';

export interface MobHit { mob: Mob; distance: number }

/** Spawns, updates (with distance-based LOD), and removes mobs. */
export class EntityManager {
  mobs: Mob[] = [];
  private spawnTimer = 1;
  enabled = true;
  onMobAttackPlayer: ((dmg: number) => void) | null = null;
  onMobDied: ((m: Mob) => void) | null = null;
  onMobHurt: ((m: Mob) => void) | null = null;

  constructor(private scene: THREE.Scene, private world: World, private drops: ItemDrops) {}

  clear() {
    for (const m of this.mobs) { this.scene.remove(m.group); m.dispose(); }
    this.mobs = [];
  }

  spawn(kind: MobKind, x: number, y: number, z: number): Mob {
    const m = new Mob(kind, x, y, z);
    this.scene.add(m.group);
    this.mobs.push(m);
    return m;
  }

  private count(hostile: boolean) { return this.mobs.filter((m) => m.spec.hostile === hostile).length; }

  update(dt: number, px: number, py: number, pz: number, daylight: number, skyBrightness: number, playerDead: boolean) {
    // --- spawning ---
    this.spawnTimer -= dt;
    if (this.enabled && this.spawnTimer <= 0) {
      this.spawnTimer = 1.5;
      this.trySpawn(px, py, pz, daylight);
    }

    // --- update with distance LOD: far mobs tick at ~5 Hz with accumulated dt ---
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      const dist = Math.hypot(m.x - px, m.z - pz);
      if (dist > MOB_DESPAWN_DISTANCE || m.y < -10) { this.removeMob(i); continue; }
      m.accumDt += dt;
      const far = dist > MOB_FAR_UPDATE_DISTANCE;
      if (far && m.accumDt < 0.2) continue;
      const step = Math.min(m.accumDt, 0.25);
      m.accumDt = 0;
      // Hostiles burn in sunlight (also keeps the daytime surface calm).
      if (m.spec.hostile && daylight > 0.75) {
        const l = this.world.lightAt(Math.floor(m.x), Math.floor(m.y + 1), Math.floor(m.z)) >> 4;
        if (l >= 14 && Math.random() < step * 0.7) { m.damage(2, m.x, m.z); m.vx = m.vz = 0; m.vy = 0; }
      }
      m.update(step, this.world, px, py, pz, !playerDead, (dmg) => this.onMobAttackPlayer?.(dmg));
      const l = this.world.lightAt(Math.floor(m.x), Math.floor(m.y + 1), Math.floor(m.z));
      const b = Math.max(((l >> 4) / 15) * skyBrightness, (l & 15) / 15, 0.08);
      m.animate(step, Math.pow(0.8, 15 - b * 15) * 0.4 + b * 0.6);
      if (m.health <= 0) { this.kill(i); }
    }
  }

  private kill(i: number) {
    const m = this.mobs[i];
    this.onMobDied?.(m);
    if (m.spec.kind === 'puff') this.drops.spawn(I.MEAT, 1 + Math.floor(Math.random() * 2), m.x, m.y + 0.5, m.z);
    else {
      const r = Math.random();
      if (r < 0.5) this.drops.spawn(I.STICK, 1 + Math.floor(Math.random() * 2), m.x, m.y + 0.8, m.z);
      if (r > 0.6) this.drops.spawn(I.COAL, 1, m.x, m.y + 0.8, m.z);
    }
    this.removeMob(i);
  }

  private removeMob(i: number) {
    const m = this.mobs[i];
    this.scene.remove(m.group);
    m.dispose();
    this.mobs.splice(i, 1);
  }

  private trySpawn(px: number, py: number, pz: number, daylight: number) {
    const wantHostile = this.count(true) < MAX_HOSTILE_MOBS;
    const wantPassive = this.count(false) < MAX_PASSIVE_MOBS;
    if (!wantHostile && !wantPassive) return;
    const ang = Math.random() * Math.PI * 2;
    const r = 16 + Math.random() * 14;
    const x = Math.floor(px + Math.cos(ang) * r), z = Math.floor(pz + Math.sin(ang) * r);
    if (!this.world.isLoaded(x, z)) return;
    // Hostiles may spawn underground (dark caves) or on the surface at night; passive only on lit grass.
    const useCave = Math.random() < 0.5 && py < this.world.topY(Math.floor(px), Math.floor(pz)) - 6;
    let y: number;
    if (useCave) {
      y = Math.max(4, Math.floor(py + (Math.random() - 0.5) * 16));
      // Find a floor near that height.
      let found = -1;
      for (let dy = 0; dy < 10; dy++) {
        const yy = y - dy;
        if (yy > 2 && IS_SOLID[this.world.getBlock(x, yy - 1, z)] && !IS_SOLID[this.world.getBlock(x, yy, z)] && !IS_SOLID[this.world.getBlock(x, yy + 1, z)]) { found = yy; break; }
      }
      if (found < 0) return;
      y = found;
    } else y = this.world.topY(x, z) + 1;
    if (y < 2) return;
    const ground = this.world.getBlock(x, y - 1, z);
    if (!IS_SOLID[ground] || this.world.getBlock(x, y, z) !== B.AIR || this.world.getBlock(x, y + 1, z) !== B.AIR) return;
    const light = this.world.lightAt(x, y, z);
    const effective = Math.max(((light >> 4) * (0.15 + 0.85 * daylight)), light & 15);
    const grassy = ground === B.GRASS || ground === B.SNOWY_GRASS;
    if (wantHostile && effective <= 7 && Math.random() < 0.7) { this.spawn('shade', x + 0.5, y, z + 0.5); return; }
    if (wantPassive && grassy && effective >= 9 && daylight > 0.3 && !useCave) this.spawn('puff', x + 0.5, y, z + 0.5);
    void getBlockDef;
  }

  /** Ray vs mob AABBs (slab test). */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): MobHit | null {
    let best: MobHit | null = null;
    for (const m of this.mobs) {
      const min = [m.x - m.halfW, m.y, m.z - m.halfW], max = [m.x + m.halfW, m.y + m.height, m.z + m.halfW];
      const o = [ox, oy, oz], d = [dx, dy, dz];
      let t0 = 0, t1 = maxDist;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-9) { if (o[a] < min[a] || o[a] > max[a]) { t1 = -1; break; } continue; }
        let ta = (min[a] - o[a]) / d[a], tb = (max[a] - o[a]) / d[a];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) break;
      }
      if (t1 >= t0 && t1 >= 0 && (!best || t0 < best.distance)) best = { mob: m, distance: t0 };
    }
    return best;
  }
}

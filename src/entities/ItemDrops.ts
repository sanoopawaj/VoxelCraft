import * as THREE from 'three';
import { DROP_LIFETIME_SECONDS, MAX_ITEM_DROPS, PICKUP_RADIUS } from '../utilities/Constants';
import { getItemDef } from '../items/ItemRegistry';
import { getBlockDef } from '../world/BlockRegistry';
import type { World } from '../world/World';
import type { Inventory } from '../items/Inventory';
import { buildAtlas, getItemIcon } from '../rendering/TextureAtlas';
import { type Body, moveBody } from '../player/Physics';

interface Drop extends Body {
  id: number; count: number; age: number; delay: number; obj: THREE.Object3D; phase: number; matBucket: number;
}

/** Atlas-textured cube geometry for a block (shared by dropped items and the held item). */
export function makeBlockBoxGeometry(blockId: number, size: number): THREE.BufferGeometry {
  const a = buildAtlas();
  const def = getBlockDef(blockId);
  const g = new THREE.BoxGeometry(size, size, size);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // BoxGeometry face order: +X,-X,+Y,-Y,+Z,-Z, 4 vertices each.
  const names = [def.tex.side, def.tex.side, def.tex.top, def.tex.bottom, def.tex.side, def.tex.side];
  for (let f = 0; f < 6; f++) {
    const [u0, v0, u1, v1] = a.uv(names[f]);
    uv.setXY(f * 4 + 0, u0, v1); uv.setXY(f * 4 + 1, u1, v1); uv.setXY(f * 4 + 2, u0, v0); uv.setXY(f * 4 + 3, u1, v0);
  }
  return g;
}

const BUCKETS = 4;
const BUCKET_LEVELS = [0.25, 0.5, 0.78, 1];

/** Physical dropped items: fall, bob, merge, and fly into the player's inventory. */
export class ItemDrops {
  drops: Drop[] = [];
  private blockGeos = new Map<number, THREE.BufferGeometry>();
  private mats = new Map<string, THREE.Material>();
  private spriteTex = new Map<number, THREE.Texture>();
  private mergeTimer = 0;
  onPickup: ((id: number, count: number) => void) | null = null;

  constructor(private scene: THREE.Scene, private world: World) {}

  private blockGeometry(blockId: number): THREE.BufferGeometry {
    let g = this.blockGeos.get(blockId);
    if (g) return g;
    g = makeBlockBoxGeometry(blockId, 0.28);
    this.blockGeos.set(blockId, g);
    return g;
  }

  private material(id: number, bucket: number, sprite: boolean): THREE.Material {
    const key = `${id}:${bucket}:${sprite}`;
    let m = this.mats.get(key);
    if (m) return m;
    const lvl = BUCKET_LEVELS[bucket];
    if (sprite) {
      let tex = this.spriteTex.get(id);
      if (!tex) {
        tex = new THREE.TextureLoader().load(getItemIcon(id));
        tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
        this.spriteTex.set(id, tex);
      }
      m = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(lvl, lvl, lvl), transparent: true, alphaTest: 0.3 });
    } else {
      m = new THREE.MeshBasicMaterial({ map: buildAtlas().texture, color: new THREE.Color(lvl, lvl, lvl), transparent: false, alphaTest: 0.4 });
    }
    this.mats.set(key, m);
    return m;
  }

  private makeObject(id: number): THREE.Object3D {
    const def = getItemDef(id);
    if (def?.blockId !== undefined && getBlockDef(def.blockId).shape !== 'torch') {
      return new THREE.Mesh(this.blockGeometry(def.blockId), this.material(def.blockId, 3, false));
    }
    const s = new THREE.Sprite(this.material(id, 3, true) as THREE.SpriteMaterial);
    s.scale.set(0.5, 0.5, 0.5);
    return s;
  }

  spawn(id: number, count: number, x: number, y: number, z: number, velocity?: [number, number, number], pickupDelay = 0.4) {
    if (!getItemDef(id) || count <= 0) return;
    if (this.drops.length >= MAX_ITEM_DROPS) this.remove(0);
    const obj = this.makeObject(id);
    this.scene.add(obj);
    const v = velocity ?? [(Math.random() - 0.5) * 2, 2.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2];
    this.drops.push({
      x, y, z, vx: v[0], vy: v[1], vz: v[2], halfW: 0.14, height: 0.28, onGround: false, hitX: false, hitZ: false,
      id, count, age: 0, delay: pickupDelay, obj, phase: Math.random() * 6.28, matBucket: 3,
    });
  }

  private remove(i: number) {
    const d = this.drops[i];
    this.scene.remove(d.obj);
    this.drops.splice(i, 1);
  }

  clear() {
    for (let i = this.drops.length - 1; i >= 0; i--) this.remove(i);
  }

  update(dt: number, px: number, py: number, pz: number, inv: Inventory, canPickup: boolean) {
    this.mergeTimer += dt;
    const doMerge = this.mergeTimer > 0.5;
    if (doMerge) this.mergeTimer = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      d.delay -= dt;
      if (d.age > DROP_LIFETIME_SECONDS || d.y < -10) { this.remove(i); continue; }
      const dx = px - d.x, dy = py + 0.9 - d.y, dz = pz - d.z;
      const dist = Math.hypot(dx, dy, dz);
      if (canPickup && d.delay <= 0 && dist < PICKUP_RADIUS * 2.2) {
        // Magnet: drift toward the player, then collect.
        const step = Math.min(dist, 7 * dt) / Math.max(dist, 0.001);
        d.x += dx * step; d.y += dy * step; d.z += dz * step;
        d.vy = 0;
        if (dist < PICKUP_RADIUS * 0.75) {
          const left = inv.add(d.id, d.count);
          const got = d.count - left;
          if (got > 0) this.onPickup?.(d.id, got);
          if (left <= 0) { this.remove(i); continue; }
          d.count = left;
          d.delay = 1; // inventory full: stop nagging for a second
        }
      } else {
        d.vy -= 20 * dt;
        d.vx *= d.onGround ? 0.8 : 0.99; d.vz *= d.onGround ? 0.8 : 0.99;
        if (!this.world.isLoaded(d.x, d.z)) continue;
        moveBody(this.world, d, dt);
      }
      if (doMerge && d.count < (getItemDef(d.id)?.maxStack ?? 1)) {
        for (let j = i - 1; j >= 0; j--) {
          const o = this.drops[j];
          if (o.id === d.id && Math.abs(o.x - d.x) < 1 && Math.abs(o.z - d.z) < 1 && Math.abs(o.y - d.y) < 1 && o.count + d.count <= (getItemDef(d.id)?.maxStack ?? 1)) {
            o.count += d.count; o.age = Math.min(o.age, d.age);
            this.remove(i);
            break;
          }
        }
        if (i >= this.drops.length || this.drops[i] !== d) continue;
      }
      // Visuals: bob and spin; shade by local light so drops don't glow at night.
      const bob = Math.sin(d.age * 3 + d.phase) * 0.06 + 0.18;
      d.obj.position.set(d.x, d.y + bob, d.z);
      if (d.obj instanceof THREE.Mesh) d.obj.rotation.y = d.age * 1.5 + d.phase;
    }
  }

  /** Re-shade drops from world light (called ~4x/sec by Game). */
  shade(skyBrightness: number) {
    for (const d of this.drops) {
      const l = this.world.lightAt(Math.floor(d.x), Math.floor(d.y + 0.3), Math.floor(d.z));
      const lvl = Math.max(((l >> 4) / 15) * skyBrightness, (l & 15) / 15);
      const b = Math.min(BUCKETS - 1, Math.max(0, Math.round(lvl * (BUCKETS - 1))));
      if (b !== d.matBucket) {
        d.matBucket = b;
        const def = getItemDef(d.id);
        const isBlockMesh = d.obj instanceof THREE.Mesh;
        const key = isBlockMesh ? def!.blockId! : d.id;
        (d.obj as THREE.Mesh | THREE.Sprite).material = this.material(key, b, !isBlockMesh);
      }
    }
  }
}

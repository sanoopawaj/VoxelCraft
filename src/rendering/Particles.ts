import * as THREE from 'three';
import type { World } from '../world/World';
import { getBlockDef } from '../world/BlockRegistry';
import { tileAverageColor } from './TextureAtlas';

const MAX = 400;

/** Pooled block-fragment / splash particles drawn as a single InstancedMesh. */
export class Particles {
  private mesh: THREE.InstancedMesh;
  private px = new Float32Array(MAX); private py = new Float32Array(MAX); private pz = new Float32Array(MAX);
  private vx = new Float32Array(MAX); private vy = new Float32Array(MAX); private vz = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  private next = 0;
  private active = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(scene: THREE.Scene, private world: World) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX; i++) { this.m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this.m); this.mesh.setColorAt(i, this.c.setRGB(1, 1, 1)); }
    scene.add(this.mesh);
  }

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, r: number, g: number, b: number) {
    const i = this.next++ % MAX;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    if (this.life[i] <= 0) this.active++; // recycling a live slot must not double count
    this.life[i] = life; this.size[i] = size;
    const k = 0.75 + Math.random() * 0.25;
    this.mesh.setColorAt(i, this.c.setRGB(r * k, g * k, b * k));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  blockBreak(x: number, y: number, z: number, blockId: number, count = 14) {
    const def = getBlockDef(blockId);
    const [r, g, b] = tileAverageColor(def.tex.side);
    for (let i = 0; i < count; i++) {
      this.emit(x + 0.2 + Math.random() * 0.6, y + 0.2 + Math.random() * 0.6, z + 0.2 + Math.random() * 0.6,
        (Math.random() - 0.5) * 3.5, Math.random() * 3.5 + 0.5, (Math.random() - 0.5) * 3.5, 0.6 + Math.random() * 0.5, 0.07 + Math.random() * 0.07, r, g, b);
    }
  }

  blockPlace(x: number, y: number, z: number, blockId: number) { this.blockBreak(x, y, z, blockId, 5); }

  splash(x: number, y: number, z: number) {
    for (let i = 0; i < 16; i++) {
      this.emit(x, y, z, (Math.random() - 0.5) * 3, Math.random() * 4 + 1, (Math.random() - 0.5) * 3, 0.7, 0.07, 0.5, 0.7, 1);
    }
  }

  hit(x: number, y: number, z: number, r = 0.9, g = 0.15, b = 0.15) {
    for (let i = 0; i < 8; i++) this.emit(x, y, z, (Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3, 0.5, 0.08, r, g, b);
  }

  update(dt: number, brightness: number) {
    (this.mesh.material as THREE.MeshBasicMaterial).color.setScalar(0.35 + 0.65 * brightness);
    if (this.active <= 0) return;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.active--; this.m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this.m); continue; }
      this.vy[i] -= 14 * dt;
      const nx = this.px[i] + this.vx[i] * dt, ny = this.py[i] + this.vy[i] * dt, nz = this.pz[i] + this.vz[i] * dt;
      if (this.world.isSolidForCollision(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
        this.vx[i] *= 0.4; this.vz[i] *= 0.4; this.vy[i] = 0;
      } else { this.px[i] = nx; this.py[i] = ny; this.pz[i] = nz; }
      const sz = this.size[i] * Math.min(1, this.life[i] * 3);
      this.p.set(this.px[i], this.py[i], this.pz[i]);
      this.s.set(sz, sz, sz);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

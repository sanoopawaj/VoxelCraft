import * as THREE from 'three';
import { makeBlockBoxGeometry } from '../entities/ItemDrops';
import { getItemDef } from '../items/ItemRegistry';
import { getBlockDef } from '../world/BlockRegistry';
import { buildAtlas, getItemIcon } from './TextureAtlas';

/**
 * First-person held item, drawn in its own pass after clearing depth so it never clips into walls.
 * Blocks show as small cubes, tools/items as flat sprites; both bob while walking and swing on use.
 */
export class HeldItem {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  private holder = new THREE.Group();
  private mesh: THREE.Object3D | null = null;
  private currentId = -1;
  private mat: THREE.MeshBasicMaterial | null = null;
  private geos = new Map<number, THREE.BufferGeometry>();
  private texCache = new Map<number, THREE.Texture>();
  private swing = 0;
  private placeKick = 0;
  visible = false;

  constructor() {
    this.scene.add(this.holder);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Trigger the arm swing (breaking / attacking) or a short push (placing). */
  punch() { this.swing = 1; }
  kick() { this.placeKick = 1; }

  private build(itemId: number) {
    if (this.mesh) { this.holder.remove(this.mesh); this.mesh = null; }
    this.currentId = itemId;
    if (itemId < 0) return;
    const def = getItemDef(itemId);
    if (!def) return;
    if (def.blockId !== undefined && getBlockDef(def.blockId).shape !== 'torch') {
      let g = this.geos.get(def.blockId);
      if (!g) { g = makeBlockBoxGeometry(def.blockId, 0.25); this.geos.set(def.blockId, g); }
      this.mat = new THREE.MeshBasicMaterial({ map: buildAtlas().texture, alphaTest: 0.4 });
      const m = new THREE.Mesh(g, this.mat);
      m.rotation.set(0.35, -0.7, 0.05);
      this.mesh = m;
    } else {
      let tex = this.texCache.get(itemId);
      if (!tex) {
        tex = new THREE.TextureLoader().load(getItemIcon(itemId));
        tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
        this.texCache.set(itemId, tex);
      }
      this.mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), this.mat);
      m.rotation.set(0.1, -0.5, 0.25);
      this.mesh = m;
    }
    this.holder.add(this.mesh);
  }

  update(dt: number, itemId: number, brightness: number, bobPhase: number, moving: boolean, fov: number) {
    if (itemId !== this.currentId) this.build(itemId);
    this.visible = !!this.mesh;
    if (!this.mesh || !this.mat) return;
    if (Math.abs(this.camera.fov - 60) > 0.1) { this.camera.fov = 60; this.camera.updateProjectionMatrix(); }
    void fov;
    this.mat.color.setScalar(Math.max(0.25, brightness));
    this.swing = Math.max(0, this.swing - dt * 3.2);
    this.placeKick = Math.max(0, this.placeKick - dt * 5);
    const s = Math.sin((1 - this.swing) * Math.PI) * (this.swing > 0 ? 1 : 0);
    const bx = moving ? Math.sin(bobPhase) * 0.012 : 0;
    const by = moving ? Math.abs(Math.cos(bobPhase)) * -0.014 : 0;
    this.holder.position.set(0.5 + bx - s * 0.12 - this.placeKick * 0.04, -0.4 + by - s * 0.1, -0.78 + this.placeKick * 0.06 - s * 0.05);
    this.holder.rotation.set(-s * 0.9, s * 0.25, s * 0.25);
  }
}

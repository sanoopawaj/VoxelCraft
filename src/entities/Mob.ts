import * as THREE from 'three';
import { type Body, moveBody, isLiquidAt } from '../player/Physics';
import type { World } from '../world/World';

export type MobKind = 'puff' | 'shade';
export type MobState = 'IDLE' | 'WANDER' | 'NOTICE' | 'CHASE' | 'ATTACK' | 'FLEE';

export interface MobSpec {
  kind: MobKind;
  name: string;
  hostile: boolean;
  health: number;
  halfW: number;
  height: number;
  walkSpeed: number;
  runSpeed: number;
  damage: number;
  sight: number;
}

export const MOB_SPECS: Record<MobKind, MobSpec> = {
  puff: { kind: 'puff', name: 'Puff', hostile: false, health: 20, halfW: 0.35, height: 0.8, walkSpeed: 1.3, runSpeed: 3.6, damage: 0, sight: 0 },
  shade: { kind: 'shade', name: 'Shade', hostile: true, health: 30, halfW: 0.3, height: 1.8, walkSpeed: 1.2, runSpeed: 3.1, damage: 10, sight: 18 },
};

let nextId = 1;

/** A walking creature with a tiny state machine; no pathfinding, just steer + hop obstacles. */
export class Mob implements Body {
  readonly id = nextId++;
  readonly spec: MobSpec;
  x: number; y: number; z: number;
  vx = 0; vy = 0; vz = 0;
  halfW: number; height: number;
  onGround = false; hitX = false; hitZ = false;
  yaw = Math.random() * Math.PI * 2;
  health: number;
  state: MobState = 'IDLE';
  stateTimer = 1 + Math.random() * 3;
  headingYaw = 0;
  attackCooldown = 0;
  hurtFlash = 0;
  fleeTimer = 0;
  age = 0;
  walkPhase = 0;
  readonly group = new THREE.Group();
  private legs: THREE.Mesh[] = [];
  private mats: THREE.MeshBasicMaterial[] = [];
  private baseColors: THREE.Color[] = [];
  private lastAnimPos = new THREE.Vector2();
  accumDt = 0;

  constructor(kind: MobKind, x: number, y: number, z: number) {
    this.spec = MOB_SPECS[kind];
    this.x = x; this.y = y; this.z = z;
    this.halfW = this.spec.halfW; this.height = this.spec.height;
    this.health = this.spec.health;
    this.buildModel();
    this.lastAnimPos.set(x, z);
  }

  private mat(color: number): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({ color });
    this.mats.push(m);
    this.baseColors.push(m.color.clone());
    return m;
  }

  private box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.group): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  private buildModel() {
    if (this.spec.kind === 'puff') {
      const wool = this.mat(0xf2e9e4), face = this.mat(0xe8b4b8), dark = this.mat(0x3a2f30), leg = this.mat(0xd9c7c0);
      this.box(0.7, 0.55, 1.0, wool, 0, 0.55, 0);
      this.box(0.5, 0.45, 0.45, face, 0, 0.75, -0.65);
      this.box(0.1, 0.1, 0.05, dark, -0.12, 0.8, -0.89);
      this.box(0.1, 0.1, 0.05, dark, 0.12, 0.8, -0.89);
      for (const [lx, lz] of [[-0.2, -0.35], [0.2, -0.35], [-0.2, 0.35], [0.2, 0.35]]) {
        const l = this.box(0.18, 0.3, 0.18, leg, lx, 0.15, lz);
        l.geometry.translate(0, -0.0, 0);
        this.legs.push(l);
      }
    } else {
      const skin = this.mat(0x4b6a52), cloth = this.mat(0x2c2a4a), eye = this.mat(0xff5a3a), dark = this.mat(0x1d3324);
      this.box(0.5, 0.7, 0.28, cloth, 0, 1.15, 0);
      const head = this.box(0.45, 0.45, 0.45, skin, 0, 1.72, 0);
      this.box(0.1, 0.08, 0.04, eye, -0.1, 1.74, -0.23, head.parent!);
      this.box(0.1, 0.08, 0.04, eye, 0.1, 1.74, -0.23, head.parent!);
      // Arms are held out forward.
      this.box(0.16, 0.16, 0.6, skin, -0.34, 1.35, -0.28);
      this.box(0.16, 0.16, 0.6, skin, 0.34, 1.35, -0.28);
      this.legs.push(this.box(0.2, 0.8, 0.22, dark, -0.13, 0.4, 0), this.box(0.2, 0.8, 0.22, dark, 0.13, 0.4, 0));
    }
  }

  /** Update visuals: facing, leg swing, light tint, damage flash. */
  animate(dt: number, brightness: number) {
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;
    const moved = Math.hypot(this.x - this.lastAnimPos.x, this.y * 0 + this.z - this.lastAnimPos.y);
    this.lastAnimPos.set(this.x, this.z);
    this.walkPhase += moved * 5;
    const swing = Math.sin(this.walkPhase) * Math.min(1, moved / Math.max(dt, 0.001) / 2) * 0.7;
    this.legs.forEach((l, i) => {
      l.rotation.x = i % 2 === 0 ? swing : -swing;
    });
    const flash = Math.max(0, this.hurtFlash);
    this.mats.forEach((m, i) => {
      m.color.copy(this.baseColors[i]).multiplyScalar(brightness);
      if (flash > 0) m.color.lerp(new THREE.Color(1, 0.15, 0.15), Math.min(1, flash * 3));
    });
    this.hurtFlash -= dt;
  }

  damage(amount: number, fromX: number, fromZ: number) {
    this.health -= amount;
    this.hurtFlash = 0.3;
    const dx = this.x - fromX, dz = this.z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    this.vx = (dx / l) * 5; this.vz = (dz / l) * 5; this.vy = 4.5;
    if (!this.spec.hostile) { this.state = 'FLEE'; this.fleeTimer = 5; this.headingYaw = Math.atan2(-dx, -dz) + Math.PI; }
  }

  dispose() {
    this.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    this.mats.forEach((m) => m.dispose());
  }

  /** AI + physics step. `px,pz` is the player; `playerVisible` allows chasing. */
  update(dt: number, world: World, px: number, py: number, pz: number, chaseAllowed: boolean, onAttack: (dmg: number) => void) {
    this.age += dt;
    this.attackCooldown -= dt;
    this.stateTimer -= dt;
    const dxp = px - this.x, dzp = pz - this.z;
    const distP = Math.hypot(dxp, dzp);
    const spec = this.spec;

    if (spec.hostile) {
      if (chaseAllowed && distP < spec.sight && Math.abs(py - this.y) < 6) {
        if (this.state !== 'CHASE' && this.state !== 'ATTACK') { this.state = 'NOTICE'; this.stateTimer = 0.4; }
        if (this.state === 'NOTICE' && this.stateTimer <= 0) this.state = 'CHASE';
        if (this.state === 'CHASE' || this.state === 'ATTACK') {
          this.headingYaw = Math.atan2(-dxp, -dzp);
          this.state = distP < 1.3 && Math.abs(py - this.y) < 1.5 ? 'ATTACK' : 'CHASE';
        }
      } else if (this.state === 'CHASE' || this.state === 'ATTACK' || this.state === 'NOTICE') {
        this.state = 'IDLE'; this.stateTimer = 1;
      }
    }
    if (this.state === 'FLEE') {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) { this.state = 'IDLE'; this.stateTimer = 2; }
    } else if (this.state === 'IDLE' && this.stateTimer <= 0) {
      this.state = 'WANDER'; this.stateTimer = 2 + Math.random() * 3;
      this.headingYaw = Math.random() * Math.PI * 2;
    } else if (this.state === 'WANDER' && this.stateTimer <= 0) {
      this.state = 'IDLE'; this.stateTimer = 1.5 + Math.random() * 4;
    }

    let speed = 0;
    if (this.state === 'WANDER') speed = spec.walkSpeed;
    else if (this.state === 'CHASE') speed = spec.runSpeed;
    else if (this.state === 'FLEE') speed = spec.runSpeed;
    if (this.state === 'ATTACK') {
      this.headingYaw = Math.atan2(-dxp, -dzp);
      if (this.attackCooldown <= 0) { this.attackCooldown = 1.0; onAttack(spec.damage); }
    }

    // Steer: ease yaw toward heading, accelerate along facing.
    let dy = this.headingYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, 8 * dt);
    const inWater = isLiquidAt(world, this.x, this.y + 0.3, this.z);
    const tx = -Math.sin(this.yaw) * speed, tz = -Math.cos(this.yaw) * speed;
    const k = Math.min(1, (this.onGround ? 10 : 3) * dt);
    this.vx += (tx - this.vx) * k;
    this.vz += (tz - this.vz) * k;
    this.vy -= (inWater ? 6 : 24) * dt;
    if (inWater) { this.vy = Math.max(this.vy, -2); if (this.vy < 1.5) this.vy += 14 * dt; }
    if ((this.hitX || this.hitZ) && this.onGround && speed > 0) this.vy = 8; // hop one-block obstacles
    if (!world.isLoaded(this.x, this.z)) { this.vx = this.vz = 0; return; }
    moveBody(world, this, dt);
  }
}

import {
  FALL_DAMAGE_PER_BLOCK, FALL_SAFE_DISTANCE, GRAVITY, HEALTH_REGEN_DELAY, HEALTH_REGEN_RATE, JUMP_FORCE,
  PLAYER_EYE, PLAYER_HEIGHT, PLAYER_MAX_HEALTH, PLAYER_SPEED, PLAYER_WIDTH, SPRINT_SPEED, SWIM_UP_SPEED,
  TERMINAL_VELOCITY, WATER_GRAVITY, WATER_MAX_SINK, WATER_SPEED_MULT,
} from '../utilities/Constants';
import { clamp } from '../utilities/MathUtil';
import type { World } from '../world/World';
import { Body, bodyOverlapsSolid, isLiquidAt, moveBody } from './Physics';

export interface MoveInput { forward: boolean; back: boolean; left: boolean; right: boolean; jump: boolean; sprint: boolean }

export interface PlayerEvents {
  onLand?: (fall: number, damage: number) => void;
  onJump?: () => void;
  onSplash?: () => void;
  onDamage?: (amount: number, source: string) => void;
}

export class Player implements Body {
  x = 0; y = 80; z = 0;
  vx = 0; vy = 0; vz = 0;
  readonly halfW = PLAYER_WIDTH / 2;
  readonly height = PLAYER_HEIGHT;
  onGround = false;
  hitX = false; hitZ = false;
  // Previous position for render interpolation.
  px = 0; py = 80; pz = 0;

  yaw = 0; // radians; 0 faces -Z
  pitch = 0;
  health = PLAYER_MAX_HEALTH;
  dead = false;
  inWater = false;
  headInWater = false;
  sprinting = false;
  /** Debug free-flight (the /fly command): no gravity, no fall damage. */
  flying = false;
  fallDistance = 0;
  sinceDamage = 99;
  /** Distance walked since the last footstep sound. */
  stepAccum = 0;
  spawn = { x: 0, y: 80, z: 0 };
  events: PlayerEvents = {};
  private regenAcc = 0;

  get eyeY() { return this.y + PLAYER_EYE; }

  teleport(x: number, y: number, z: number) {
    this.x = this.px = x; this.y = this.py = y; this.z = this.pz = z;
    this.vx = this.vy = this.vz = 0;
    this.fallDistance = 0;
  }

  /** Forward unit vector from yaw/pitch (camera look direction). */
  lookDir(out: [number, number, number]) {
    const cp = Math.cos(this.pitch);
    out[0] = -Math.sin(this.yaw) * cp;
    out[1] = Math.sin(this.pitch);
    out[2] = -Math.cos(this.yaw) * cp;
  }

  damage(amount: number, source = 'unknown') {
    if (this.dead || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.sinceDamage = 0;
    this.events.onDamage?.(amount, source);
    if (this.health <= 0) this.dead = true;
  }

  heal(amount: number) { this.health = Math.min(PLAYER_MAX_HEALTH, this.health + amount); }

  respawn() {
    this.health = PLAYER_MAX_HEALTH;
    this.dead = false;
    this.teleport(this.spawn.x, this.spawn.y, this.spawn.z);
  }

  /** One fixed-step simulation tick. */
  update(dt: number, input: MoveInput, world: World) {
    this.px = this.x; this.py = this.y; this.pz = this.z;
    if (this.dead) return;
    // Hold still until the terrain under us exists (prevents falling through the void on load/teleport).
    if (!world.isLoaded(this.x, this.z)) { this.vx = this.vy = this.vz = 0; return; }

    // Unstick: if we ended up inside blocks (teleport, lag), climb out.
    if (bodyOverlapsSolid(world, this)) {
      for (let i = 0; i < 128 && bodyOverlapsSolid(world, this); i++) this.y += 0.5;
      this.vy = 0;
    }

    const feetWater = isLiquidAt(world, this.x, this.y + 0.3, this.z);
    const wasInWater = this.inWater;
    this.inWater = feetWater || isLiquidAt(world, this.x, this.y + 1.0, this.z);
    this.headInWater = isLiquidAt(world, this.x, this.eyeY, this.z);
    if (this.inWater && !wasInWater && this.vy < -4) this.events.onSplash?.();

    // --- horizontal wish direction ---
    let ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let iz = (input.back ? 1 : 0) - (input.forward ? 1 : 0);
    const moving = ix !== 0 || iz !== 0;
    if (moving) { const l = Math.hypot(ix, iz); ix /= l; iz /= l; }
    // Sprint only makes sense when moving forward, not swimming.
    this.sprinting = input.sprint && input.forward && !this.inWater && !input.back;
    if (this.sprinting && this.hitX && this.hitZ) this.sprinting = false;
    let speed = this.sprinting ? SPRINT_SPEED : PLAYER_SPEED;
    if (this.inWater) speed *= WATER_SPEED_MULT;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    // yaw 0 faces -Z; right vector is (cos, 0, -sin)... rotate input by yaw.
    const wx = (ix * cy + iz * sy) * speed;
    const wz = (-ix * sy + iz * cy) * speed;
    const accel = this.onGround ? 14 : this.inWater ? 5 : 4;
    const k = Math.min(1, accel * dt);
    this.vx += (wx - this.vx) * k;
    this.vz += (wz - this.vz) * k;
    if (!moving && this.onGround && Math.hypot(this.vx, this.vz) < 0.05) { this.vx = 0; this.vz = 0; }

    // --- vertical ---
    if (this.flying) {
      const fs = input.sprint ? 30 : 14;
      this.vx += ((ix * cy + iz * sy) * fs - this.vx) * Math.min(1, 8 * dt);
      this.vz += ((-ix * sy + iz * cy) * fs - this.vz) * Math.min(1, 8 * dt);
      this.vy = input.jump ? 12 : 0;
      this.fallDistance = 0;
      moveBody(world, this, dt);
      return;
    }
    if (this.inWater) {
      this.vy -= WATER_GRAVITY * dt;
      this.vy *= 1 - Math.min(1, 2.2 * dt); // water drag
      if (this.vy < -WATER_MAX_SINK) this.vy = -WATER_MAX_SINK;
      if (input.jump) {
        this.vy = this.headInWater || !this.hitX && !this.hitZ ? Math.max(this.vy, SWIM_UP_SPEED) : 7.2;
        if (!this.headInWater && (this.hitX || this.hitZ)) this.vy = 7.2; // hop out onto the shore
      }
    } else {
      this.vy -= GRAVITY * dt;
      if (this.vy < -TERMINAL_VELOCITY) this.vy = -TERMINAL_VELOCITY;
      if (input.jump && this.onGround) {
        // Holding space keeps hopping, like most voxel games.
        this.vy = JUMP_FORCE;
        this.onGround = false;
        this.events.onJump?.();
      }
    }

    const prevY = this.y;
    const wasGround = this.onGround;
    moveBody(world, this, dt);

    // --- fall damage bookkeeping ---
    if (this.inWater) this.fallDistance = 0;
    else if (!this.onGround && this.y < prevY) this.fallDistance += prevY - this.y;
    else if (!this.onGround && this.y > prevY && !wasGround) this.fallDistance = Math.max(0, this.fallDistance - (this.y - prevY));
    if (this.onGround && !wasGround) {
      const fall = this.fallDistance;
      let dmg = 0;
      if (fall > FALL_SAFE_DISTANCE && !this.inWater) {
        dmg = Math.ceil((fall - FALL_SAFE_DISTANCE) * FALL_DAMAGE_PER_BLOCK);
        this.damage(dmg, 'fall');
      }
      this.events.onLand?.(fall, dmg);
    }
    if (this.onGround) this.fallDistance = 0;

    // Footstep distance accumulator (audio reads this).
    if (this.onGround && moving) this.stepAccum += Math.hypot(this.x - this.px, this.z - this.pz);

    // --- slow regeneration ---
    this.sinceDamage += dt;
    if (this.health < PLAYER_MAX_HEALTH && this.sinceDamage > HEALTH_REGEN_DELAY) {
      this.regenAcc += dt * HEALTH_REGEN_RATE;
      if (this.regenAcc >= 1) { const n = Math.floor(this.regenAcc); this.regenAcc -= n; this.heal(n); }
    }

    // Void safety net.
    if (this.y < -20) this.damage(1000, 'void');
  }

  setLook(yaw: number, pitch: number) {
    this.yaw = yaw;
    this.pitch = clamp(pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  }
}

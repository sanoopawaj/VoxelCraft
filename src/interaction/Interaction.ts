import { ATTACK_DISTANCE, INTERACTION_DISTANCE, WORLD_HEIGHT } from '../utilities/Constants';
import type { AudioManager } from '../audio/AudioManager';
import type { EntityManager } from '../entities/EntityManager';
import type { ItemDrops } from '../entities/ItemDrops';
import type { InputManager } from '../input/InputManager';
import type { Inventory } from '../items/Inventory';
import { blockDrop, breakTime, getItemDef } from '../items/ItemRegistry';
import type { Particles } from '../rendering/Particles';
import type { Player } from '../player/Player';
import { B, IS_SOLID, getBlockDef } from '../world/BlockRegistry';
import type { World } from '../world/World';
import { raycastBlocks, type RayHit } from './BlockRaycaster';

export interface InteractionDeps {
  world: World; player: Player; inventory: Inventory; drops: ItemDrops; particles: Particles;
  audio: AudioManager; entities: EntityManager; input: InputManager;
}

const PLACE_REPEAT = 0.22;
const ATTACK_COOLDOWN = 0.45;

/** Raycast targeting, block breaking (with progress), placement, eating and melee. */
export class Interaction {
  target: RayHit | null = null;
  /** 0..1 progress of the block currently being broken. */
  breakProgress = 0;
  private breakKey = '';
  private placeTimer = 0;
  private attackTimer = 0;
  interactionDistance = INTERACTION_DISTANCE;
  private dir: [number, number, number] = [0, 0, 0];

  constructor(private d: InteractionDeps) {}

  reset() { this.target = null; this.breakProgress = 0; this.breakKey = ''; }

  update(dt: number) {
    const { world, player, inventory: inv, input } = this.d;
    player.lookDir(this.dir);
    const ox = player.x, oy = player.eyeY, oz = player.z;
    const hit = raycastBlocks(world, ox, oy, oz, this.dir[0], this.dir[1], this.dir[2], this.interactionDistance);
    this.target = hit;
    this.attackTimer -= dt;
    this.placeTimer -= dt;
    if (player.dead) { this.breakProgress = 0; return; }

    const mobHit = this.d.entities.raycast(ox, oy, oz, this.dir[0], this.dir[1], this.dir[2], ATTACK_DISTANCE);
    const mobCloser = mobHit && (!hit || mobHit.distance <= hit.distance);

    // --- left button: attack a mob, or hold to break the targeted block ---
    if (input.mouseClicked(0) && mobCloser && this.attackTimer <= 0) {
      const tool = getItemDef(inv.selectedStack()?.id ?? 0)?.tool;
      const dmg = tool ? tool.damage : 4;
      mobHit!.mob.damage(dmg, player.x, player.z);
      this.d.particles.hit(mobHit!.mob.x, mobHit!.mob.y + mobHit!.mob.height * 0.6, mobHit!.mob.z);
      this.d.audio.play('attack');
      this.d.audio.play('mobhurt', 'stone', 0.7);
      this.attackTimer = ATTACK_COOLDOWN;
    }
    if (input.mouseHeld(0) && hit && !mobCloser) {
      const key = `${hit.x},${hit.y},${hit.z}`;
      if (key !== this.breakKey) { this.breakKey = key; this.breakProgress = 0; }
      const id = world.getBlock(hit.x, hit.y, hit.z);
      const t = breakTime(id, inv.selectedStack()?.id ?? 0);
      if (Number.isFinite(t)) {
        this.breakProgress += dt / t;
        if (this.breakProgress >= 1) { this.breakBlock(hit.x, hit.y, hit.z); this.breakProgress = 0; this.breakKey = ''; }
      }
    } else { this.breakProgress = 0; this.breakKey = ''; }

    // --- right button: place a block / eat food ---
    if (input.mouseHeld(2) && this.placeTimer <= 0) {
      if (this.useItem(hit)) this.placeTimer = PLACE_REPEAT;
    }
  }

  breakBlock(x: number, y: number, z: number) {
    const { world, inventory: inv, drops, particles, audio } = this.d;
    const id = world.getBlock(x, y, z);
    const def = getBlockDef(id);
    if (id === B.AIR || def.hardness < 0) return;
    const drop = blockDrop(id, inv.selectedStack()?.id ?? 0);
    world.setBlock(x, y, z, B.AIR);
    particles.blockBreak(x, y, z, id);
    audio.play('break', def.sound);
    if (drop) drops.spawn(drop[0], drop[1], x + 0.5, y + 0.45, z + 0.5);
    // A torch needs something solid under it; knock it off if its support vanished.
    const above = world.getBlock(x, y + 1, z);
    if (above === B.TORCH) this.breakBlock(x, y + 1, z);
  }

  /** Returns true if the action consumed the click. */
  private useItem(hit: RayHit | null): boolean {
    const { world, player, inventory: inv, particles, audio } = this.d;
    const stack = inv.selectedStack();
    if (!stack) return false;
    const def = getItemDef(stack.id);
    if (!def) return false;
    if (def.food) {
      if (player.health >= 100) return false;
      inv.removeFromSlot(inv.selected, 1);
      player.heal(def.food);
      audio.play('eat');
      return true;
    }
    if (def.blockId === undefined || !hit) return false;
    const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
    const cur = world.getBlock(px, py, pz);
    if (!getBlockDef(cur).replaceable) return false;
    if (py < 0 || py >= WORLD_HEIGHT) return false;
    const bdef = getBlockDef(def.blockId);
    if (bdef.solid && this.intersectsPlayer(px, py, pz)) return false;
    if (bdef.shape === 'torch' && !IS_SOLID[world.getBlock(px, py - 1, pz)]) return false;
    // Never place into mobs either (they would get stuck inside).
    if (bdef.solid && this.d.entities.mobs.some((m) => Math.abs(m.x - (px + 0.5)) < m.halfW + 0.5 && Math.abs(m.z - (pz + 0.5)) < m.halfW + 0.5 && m.y < py + 1 && m.y + m.height > py)) return false;
    if (!world.setBlock(px, py, pz, def.blockId)) return false;
    inv.removeFromSlot(inv.selected, 1);
    particles.blockPlace(px, py, pz, def.blockId);
    audio.play('place', bdef.sound);
    return true;
  }

  private intersectsPlayer(bx: number, by: number, bz: number): boolean {
    const p = this.d.player;
    return p.x + p.halfW > bx && p.x - p.halfW < bx + 1 && p.z + p.halfW > bz && p.z - p.halfW < bz + 1 && p.y + p.height > by && p.y < by + 1;
  }
}

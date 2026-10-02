import {
  AUTOSAVE_SECONDS, FIXED_DT, LOADING_MESH_BUDGET_MS, MAX_SIM_STEPS, MESH_BUDGET_MS,
  PLAYER_MAX_HEALTH, SPAWN_PRELOAD_RADIUS, START_TIME_TICKS, TICKS_PER_DAY,
} from '../utilities/Constants';
import { chunkKey, worldToChunk, worldToLocal } from '../utilities/MathUtil';
import { AudioManager } from '../audio/AudioManager';
import { EntityManager } from '../entities/EntityManager';
import { ItemDrops } from '../entities/ItemDrops';
import { InputManager, type Action } from '../input/InputManager';
import { Interaction } from '../interaction/Interaction';
import { Inventory } from '../items/Inventory';
import { ITEM_DEFS } from '../items/ItemRegistry';
import { RECIPES } from '../items/Recipes';
import { Player } from '../player/Player';
import { formatClock } from '../rendering/DayNight';
import { Particles } from '../rendering/Particles';
import { Renderer } from '../rendering/Renderer';
import { SaveManager, modsFromWorld, type WorldMeta, type WorldSave } from '../save/SaveManager';
import { SettingsStore, type Settings } from '../save/Settings';
import { UI, type ScreenName } from '../ui/UI';
import { B, IS_LIQUID, getBlockDef } from '../world/BlockRegistry';
import { biomeName } from '../world/Biomes';
import { ChunkManager } from '../world/ChunkManager';
import { World } from '../world/World';
import { findSpawnColumn, type GenConfig } from '../world/WorldGenerator';
import { runCommand } from './Commands';

export type GameState = 'MAIN_MENU' | 'LOADING_WORLD' | 'PLAYING' | 'PAUSED' | 'INVENTORY' | 'SETTINGS' | 'DEAD';

const SAFE_SURFACE = new Set<number>([B.GRASS, B.SNOWY_GRASS, B.SAND, B.DIRT, B.STONE, B.SNOW, B.GRAVEL, B.COBBLE, B.PLANKS, B.BRICKS]);

export class Game {
  readonly settings = new SettingsStore();
  readonly canvas = document.getElementById('game') as HTMLCanvasElement;
  readonly renderer = new Renderer(this.canvas);
  readonly input = new InputManager(this.canvas);
  readonly audio = new AudioManager();
  readonly saves = new SaveManager();
  readonly player = new Player();
  readonly inventory = new Inventory();
  readonly ui: UI;

  state: GameState = 'MAIN_MENU';
  private stateBeforeSettings: GameState = 'MAIN_MENU';
  world: World | null = null;
  chunks: ChunkManager | null = null;
  drops: ItemDrops | null = null;
  entities: EntityManager | null = null;
  particles: Particles | null = null;
  interaction: Interaction | null = null;
  meta: WorldMeta | null = null;
  time = START_TIME_TICKS;

  debugOn = false;
  private lastFrame = performance.now();
  private acc = 0;
  private fps = 0;
  private fpsFrames = 0;
  private fpsTimer = 0;
  private frameMs = 0;
  private autosaveTimer = 0;
  private playTimeSession = 0;
  private bobPhase = 0;
  private fovCurrent = 75;
  private loadStart = 0;
  private loadFinalized = false;
  private shadeTimer = 0;
  private stats = { calls: 0, tris: 0 };
  private spawnSearch: { x: number; z: number } | null = null;
  private deathReason = '';
  private lookDir: [number, number, number] = [0, 0, 1];

  constructor() {
    this.ui = new UI(this.settings, this.input, {
      listWorlds: () => this.saves.listWorlds().map((m) => ({ ...m, damaged: this.saves.hasSave(m.id) && !this.saves.loadWorld(m.id).ok })),
      playWorld: (m) => this.startWorld(m),
      createWorld: (name, seed, type) => this.startWorld(this.saves.createWorld(name, seed, type)),
      deleteWorld: (m) => this.saves.deleteWorld(m.id),
      resume: () => this.resume(),
      save: () => this.saveNow(true),
      mainMenu: () => this.exitToMenu(),
      respawn: () => this.respawn(),
      toggleFullscreen: () => this.toggleFullscreen(),
      copySeed: () => { if (this.meta) { this.ui.copyText(String(this.meta.seed)); this.ui.setPauseStatus('Seed copied'); } },
      onUiClick: () => { this.audio.resume(); this.audio.play('click'); },
      craft: (i) => this.craft(i),
      dropStack: (s) => this.dropStack(s.id, s.count),
      onScreenChange: (name) => this.onScreenChange(name),
    });
    this.wireInput();
    this.settings.onChange((s) => this.applySettings(s));
    this.applySettings(this.settings.value);
    this.input.bindings = { ...this.settings.value.bindings };
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('beforeunload', () => { if (this.world && this.state !== 'MAIN_MENU' && this.state !== 'LOADING_WORLD') this.saveNow(false); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.isInWorld()) this.saveNow(false); });
    this.setState('MAIN_MENU');
    requestAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------------ settings
  private applySettings(s: Settings) {
    this.renderer.setFov(s.fov);
    this.fovCurrent = s.fov;
    this.renderer.setRenderDistance(s.renderDistance);
    this.chunks?.setRenderDistance(s.renderDistance);
    this.renderer.setQuality(s.quality);
    this.audio.setVolumes(s.masterVolume, s.musicVolume, s.sfxVolume);
    this.input.bindings = { ...s.bindings };
  }

  // ------------------------------------------------------------------ state machine
  private isInWorld() { return !!this.world && ['PLAYING', 'PAUSED', 'INVENTORY', 'DEAD'].includes(this.state) || (this.state === 'SETTINGS' && !!this.world); }

  setState(s: GameState, showUi = true) {
    this.state = s;
    this.input.gameplayEnabled = s === 'PLAYING';
    if (!showUi) return;
    const screen: Record<GameState, ScreenName | null> = {
      MAIN_MENU: 'main', LOADING_WORLD: 'loading', PLAYING: null, PAUSED: 'pause', INVENTORY: 'inventory', SETTINGS: 'settings', DEAD: 'death',
    };
    this.ui.show(screen[s]);
    this.ui.showHud(s === 'PLAYING' || s === 'INVENTORY' || s === 'PAUSED' || s === 'DEAD');
    if (s !== 'PLAYING' && this.input.locked) this.input.releaseLock();
  }

  /** The UI navigates between menu screens itself; keep our state in step. */
  private onScreenChange(name: ScreenName | null) {
    if (name === 'settings' || name === 'controls') {
      if (this.state !== 'SETTINGS') this.stateBeforeSettings = this.state;
      this.state = 'SETTINGS';
      this.input.gameplayEnabled = false;
    } else if (name === 'pause') {
      this.state = 'PAUSED';
    } else if (name === 'main' || name === 'worlds' || name === 'create') {
      this.state = 'MAIN_MENU';
      this.ui.showHud(false);
    }
  }

  private wireInput() {
    const inp = this.input;
    inp.onPointerLockChange = (locked) => {
      if (!locked && this.state === 'PLAYING') this.pause();
    };
    inp.onClickWhileUnlocked = () => { if (this.state === 'PLAYING') inp.requestLock(); };
    inp.onEscape = () => {
      switch (this.state) {
        case 'PLAYING': this.pause(); break;
        case 'INVENTORY': this.closeInventory(); break;
        case 'PAUSED': this.resume(); break;
        case 'SETTINGS': {
          const back = this.stateBeforeSettings === 'PAUSED' ? 'pause' : 'main';
          this.ui.show(back);
          break;
        }
        case 'MAIN_MENU': if (this.ui.screen === 'worlds') this.ui.show('main'); else if (this.ui.screen === 'create') this.ui.show('worlds'); break;
        default: break;
      }
    };
    inp.onHotbarKey = (i) => { if (this.state === 'PLAYING') this.inventory.setSelected(i); };
    inp.onWheel = (d) => { if (this.state === 'PLAYING') this.inventory.setSelected(this.inventory.selected + d); };
    inp.onAction = (a: Action) => {
      if (a === 'fullscreen' && this.state !== 'MAIN_MENU') { this.toggleFullscreen(); return; }
      if (a === 'debug') { if (this.isInWorld()) this.debugOn = !this.debugOn; return; }
      if (a === 'coords') { this.settings.update({ showCoords: !this.settings.value.showCoords }); return; }
      if (a === 'inventory') {
        if (this.state === 'PLAYING') this.openInventory();
        else if (this.state === 'INVENTORY') this.closeInventory();
        return;
      }
      if (this.state !== 'PLAYING') return;
      if (a === 'drop') {
        const s = this.inventory.selectedStack();
        if (s) { this.inventory.removeFromSlot(this.inventory.selected, 1); this.dropStack(s.id, 1, true); }
      }
      if (a === 'command' && this.debugOn && this.world) this.openCommandLine();
    };
    // Browsers only allow audio after a gesture.
    window.addEventListener('pointerdown', () => this.audio.resume(), { once: false });
    window.addEventListener('keydown', () => this.audio.resume());
  }

  pause() {
    if (this.state !== 'PLAYING') return;
    this.setState('PAUSED');
    this.ui.setPauseInfo(this.meta ? `${this.meta.name} · Seed ${this.meta.seed}` : '');
    this.ui.setPauseStatus('');
  }

  resume() {
    if (this.state !== 'PAUSED' && this.state !== 'SETTINGS') return;
    this.setState('PLAYING');
    this.input.requestLock();
  }

  private openInventory() {
    this.ui.bindInventory(this.inventory);
    this.setState('INVENTORY');
  }

  private closeInventory() {
    const held = this.ui.releaseCursor();
    if (held) { const left = this.inventory.add(held.id, held.count); if (left) this.dropStack(held.id, left); }
    this.setState('PLAYING');
    this.input.requestLock();
  }

  private openCommandLine() {
    this.input.gameplayEnabled = false;
    this.ui.openCommandLine(
      (cmd) => { for (const l of runCommand(this, cmd)) this.ui.message(l, 8); },
      () => { if (this.state === 'PLAYING') this.input.gameplayEnabled = true; this.canvas.focus(); },
    );
  }

  toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => { /* denied */ });
  }

  // ------------------------------------------------------------------ world lifecycle
  startWorld(meta: WorldMeta) {
    this.disposeWorld();
    const load = this.saves.hasSave(meta.id) ? this.saves.loadWorld(meta.id) : null;
    if (load && !load.ok) { this.ui.show('worlds'); this.ui.message('That save is damaged and cannot be loaded.'); return; }
    const save = load && load.ok ? load.save : null;
    this.meta = save ? { ...save.meta, id: meta.id } : meta;
    const cfg: GenConfig = { seed: this.meta.seed, type: this.meta.type };
    const world = (this.world = new World(cfg));
    if (save) {
      for (const [cx, cz, flat] of save.mods) {
        const m = new Map<number, number>();
        for (let i = 0; i < flat.length; i += 2) m.set(flat[i], flat[i + 1]);
        world.mods.set(chunkKey(cx, cz), m);
      }
    }
    this.renderer.clearWorld();
    this.chunks = new ChunkManager(world, this.renderer);
    this.chunks.setRenderDistance(this.settings.value.renderDistance);
    this.drops = new ItemDrops(this.renderer.scene, world);
    this.drops.onPickup = () => this.audio.play('pickup');
    this.entities = new EntityManager(this.renderer.scene, world, this.drops);
    this.entities.onMobAttackPlayer = (dmg) => { if (!this.player.dead) this.player.damage(dmg, 'a Shade'); };
    this.entities.onMobDied = (m) => this.audio.play('death', 'stone', 0.3);
    this.particles = new Particles(this.renderer.scene, world);
    this.interaction = new Interaction({ world, player: this.player, inventory: this.inventory, drops: this.drops, particles: this.particles, audio: this.audio, entities: this.entities, input: this.input });
    this.wirePlayerEvents();

    this.player.dead = false;
    if (save) {
      this.time = save.time;
      this.player.health = save.player.health;
      this.player.setLook(save.player.yaw, save.player.pitch);
      this.player.spawn = { ...save.player.spawn };
      this.player.teleport(save.player.x, save.player.y, save.player.z);
      this.inventory.loadJSON(save.inventory, save.selected);
      this.spawnSearch = null;
    } else {
      this.time = START_TIME_TICKS;
      this.player.health = PLAYER_MAX_HEALTH;
      this.player.setLook(0, 0);
      this.inventory.clear();
      const sp = findSpawnColumn(cfg);
      this.spawnSearch = { x: sp.x, z: sp.z };
      this.player.teleport(sp.x + 0.5, sp.y + 1, sp.z + 0.5);
      if (cfg.type === 'test') this.giveTestKit();
    }
    this.ui.bindInventory(this.inventory);
    this.interaction.reset();
    this.loadFinalized = false;
    this.loadStart = performance.now();
    this.autosaveTimer = 0;
    this.playTimeSession = 0;
    this.setState('LOADING_WORLD');
    this.ui.setLoading(this.meta.seed, 'Generating terrain...', 0);
  }

  private giveTestKit() {
    for (const [id, d] of ITEM_DEFS) if (d.blockId !== undefined || d.tool || id >= 260) this.inventory.add(id, d.maxStack);
  }

  private wirePlayerEvents() {
    const p = this.player;
    p.events = {
      onJump: () => this.audio.play('jump', this.groundSound()),
      onLand: (fall, dmg) => { if (fall > 1.2) this.audio.play('land', this.groundSound(), Math.min(1.4, fall / 4)); if (dmg > 0) this.ui.message(`Ouch! Fall damage: ${dmg}`, 3); },
      onSplash: () => { this.audio.play('splash'); this.particles?.splash(p.x, p.y + 1, p.z); },
      onDamage: (amount, source) => { this.audio.play('hurt'); this.ui.damageFlash(); this.deathReason = source === 'fall' ? 'You hit the ground too hard' : source === 'void' ? 'You fell out of the world' : source === 'command' ? 'You were removed' : `Slain by ${source}`; },
    };
  }

  private groundSound() {
    const w = this.world!;
    const id = w.getBlock(Math.floor(this.player.x), Math.floor(this.player.y - 0.1), Math.floor(this.player.z));
    return getBlockDef(id === B.AIR ? w.getBlock(Math.floor(this.player.x), Math.floor(this.player.y - 1.1), Math.floor(this.player.z)) : id).sound;
  }

  /** Find a spot with solid ground, headroom and no water near (x, z); falls back to the column top. */
  private findSafeSpawn(x: number, z: number): { x: number; y: number; z: number } {
    const w = this.world!;
    for (let r = 0; r <= 10; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = x + dx, cz = z + dz;
        if (!w.isLoaded(cx, cz)) continue;
        for (let y = w.topY(cx, cz); y > 1; y--) {
          const id = w.getBlock(cx, y, cz);
          if (id === B.AIR) continue;
          if (SAFE_SURFACE.has(id) && w.getBlock(cx, y + 1, cz) === B.AIR && w.getBlock(cx, y + 2, cz) === B.AIR && !IS_LIQUID[w.getBlock(cx, y + 1, cz)]) {
            return { x: cx + 0.5, y: y + 1, z: cz + 0.5 };
          }
          break; // top block is leaves/water/etc: try another column
        }
      }
    }
    return { x: x + 0.5, y: Math.max(w.topY(x, z) + 1, 2), z: z + 0.5 };
  }

  private updateLoading() {
    const world = this.world!, chunks = this.chunks!, p = this.player;
    chunks.update(p.x, p.z, LOADING_MESH_BUDGET_MS);
    const pcx = worldToChunk(p.x), pcz = worldToChunk(p.z);
    const { done, total } = chunks.loadProgress(pcx, pcz, SPAWN_PRELOAD_RADIUS);
    const frac = done / Math.max(1, total);
    const text = frac < 0.35 ? 'Generating terrain...' : frac < 0.85 ? 'Loading chunks...' : 'Preparing world...';
    this.ui.setLoading(this.meta!.seed, text, frac);
    const timedOut = performance.now() - this.loadStart > 60000;
    if (done >= total || timedOut) {
      if (timedOut) console.warn('[Game] world load timed out, starting anyway');
      if (this.spawnSearch) {
        const s = this.findSafeSpawn(this.spawnSearch.x, this.spawnSearch.z);
        this.player.spawn = { ...s };
        this.player.teleport(s.x, s.y, s.z);
        this.spawnSearch = null;
      } else if (this.meta!.type === 'normal' && world.isLoaded(p.x, p.z)) {
        // Resumed save: if the world changed under us (shouldn't), keep the player out of solid blocks - Player.update unsticks.
      }
      this.renderer.updateCulling();
      this.setState('PLAYING');
      this.input.requestLock();
      this.ui.message('Click the game to capture the mouse. Press E for inventory, F3 for debug.', 7);
      this.lastFrame = performance.now();
    }
  }

  private disposeWorld() {
    this.chunks?.dispose();
    this.drops?.clear();
    this.entities?.clear();
    this.chunks = null; this.drops = null; this.entities = null; this.particles = null; this.interaction = null;
    this.world = null;
  }

  exitToMenu() {
    if (this.world) this.saveNow(false);
    this.disposeWorld();
    this.renderer.clearWorld();
    this.meta = null;
    this.debugOn = false;
    this.ui.setDebug(null);
    this.audio.setUnderwater(false);
    this.renderer.setUnderwater(false);
    this.ui.setUnderwater(false);
    this.setState('MAIN_MENU');
  }

  respawn() {
    const p = this.player;
    p.respawn();
    if (this.world) {
      const s = this.world.isLoaded(p.spawn.x, p.spawn.z) ? this.findSafeSpawn(Math.floor(p.spawn.x), Math.floor(p.spawn.z)) : p.spawn;
      p.spawn = { ...s };
      p.teleport(s.x, s.y, s.z);
    }
    this.setState('PLAYING');
    this.input.requestLock();
  }

  private die() {
    const p = this.player;
    this.audio.play('death');
    if (!this.settings.value.keepInventory) {
      for (let i = 0; i < this.inventory.slots.length; i++) {
        const s = this.inventory.slots[i];
        if (s) { this.drops?.spawn(s.id, s.count, p.x, p.y + 1, p.z, undefined, 2); this.inventory.slots[i] = null; }
      }
      this.inventory.version++;
    }
    this.ui.setDeathReason(this.deathReason + (this.settings.value.keepInventory ? '' : ' - your items were dropped'));
    this.setState('DEAD');
  }

  // ------------------------------------------------------------------ saving
  saveNow(announce: boolean) {
    if (!this.world || !this.meta) return;
    const p = this.player;
    this.meta.playTime += this.playTimeSession;
    this.playTimeSession = 0;
    this.meta.lastPlayed = Date.now();
    const save: WorldSave = {
      version: 1, meta: this.meta, time: this.time,
      player: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, health: p.dead ? PLAYER_MAX_HEALTH : Math.max(1, p.health), spawn: p.spawn },
      inventory: this.inventory.toJSON(), selected: this.inventory.selected, mods: modsFromWorld(this.world),
    };
    try {
      this.saves.saveWorld(save);
      if (announce) { this.ui.setPauseStatus('World saved'); this.ui.message('World saved', 2); }
      this.autosaveTimer = 0;
    } catch (e) {
      console.error('[Game] save failed', e);
      const msg = 'Save failed (browser storage full or blocked?)';
      this.ui.setPauseStatus(msg);
      this.ui.message(msg, 8);
    }
  }

  // ------------------------------------------------------------------ items
  dropStack(id: number, count: number, throwForward = false) {
    if (!this.drops) return;
    const p = this.player;
    const dir: [number, number, number] = [0, 0, 0];
    p.lookDir(dir);
    const v: [number, number, number] | undefined = throwForward ? [dir[0] * 5 + p.vx, dir[1] * 5 + 2, dir[2] * 5 + p.vz] : [dir[0] * 3, 2, dir[2] * 3];
    this.drops.spawn(id, count, p.x + dir[0] * 0.5, p.eyeY - 0.3, p.z + dir[2] * 0.5, v, 1.5);
  }

  private craft(i: number) {
    const r = RECIPES[i];
    if (r && this.inventory.canCraft(r)) { this.inventory.craft(r); this.audio.play('pickup'); }
  }

  // ------------------------------------------------------------------ main loop
  private frame = (now: number) => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const t0 = performance.now();
    try {
      this.tick(dt);
    } catch (e) {
      console.error('[Game] frame error', e);
    }
    this.frameMs = this.frameMs * 0.9 + (performance.now() - t0) * 0.1;
    this.fpsFrames++; this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) { this.fps = this.fpsFrames / this.fpsTimer; this.fpsFrames = 0; this.fpsTimer = 0; }
    this.input.endFrame();
  };

  private tick(dt: number) {
    if (this.state === 'LOADING_WORLD') { this.updateLoading(); return; }
    if (!this.world || this.state === 'MAIN_MENU' || (this.state === 'SETTINGS' && !this.world)) {
      this.renderMenuBackdrop(dt);
      return;
    }
    const simulating = this.state === 'PLAYING' || this.state === 'INVENTORY' || this.state === 'DEAD';
    const p = this.player;
    const world = this.world, s = this.settings.value;

    if (this.state === 'PLAYING') {
      // Mouse look.
      const sens = 0.0022 * s.mouseSensitivity;
      p.setLook(p.yaw - this.input.mouseDX * sens, p.pitch - this.input.mouseDY * sens * (s.invertY ? -1 : 1));
    }

    if (simulating) {
      // Fixed-step physics for stable, frame-rate independent movement.
      this.acc = Math.min(this.acc + dt, FIXED_DT * MAX_SIM_STEPS);
      const mi = this.moveInput();
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < MAX_SIM_STEPS) {
        p.update(FIXED_DT, mi, world);
        this.acc -= FIXED_DT; steps++;
      }
      if (this.state === 'PLAYING') this.interaction!.update(dt);
      else this.interaction!.reset();

      this.time = (this.time + dt * (TICKS_PER_DAY / s.dayLengthSeconds)) % TICKS_PER_DAY;
      this.playTimeSession += dt;
      this.autosaveTimer += dt;
      if (this.autosaveTimer > AUTOSAVE_SECONDS && this.state !== 'DEAD') this.saveNow(false);

      this.renderer.applyTime(this.time);
      const sky = this.renderer.sky;
      this.entities!.update(dt, p.x, p.y, p.z, sky.daylight, sky.skyBrightness, p.dead);
      this.drops!.update(dt, p.x, p.y, p.z, this.inventory, !p.dead);
      this.shadeTimer += dt;
      if (this.shadeTimer > 0.25) { this.shadeTimer = 0; this.drops!.shade(sky.skyBrightness); }
      this.particles!.update(dt, Math.max(sky.skyBrightness, 0.3));
      this.footsteps();
      if (p.dead && this.state === 'PLAYING') this.die();
    }

    // World streaming runs whenever a world exists (also while paused so it never stalls).
    this.chunks!.update(p.x, p.z, MESH_BUDGET_MS);

    this.updateCamera();
    this.renderer.update(dt);
    this.renderer.updateCulling();
    this.updateAudio(dt);
    this.updateHud(dt);
    this.updateHeldItem(dt);
    this.renderer.render();
    this.stats.calls = this.renderer.renderer.info.render.calls;
    this.stats.tris = this.renderer.renderer.info.render.triangles;
  }

  private renderMenuBackdrop(_dt: number) {
    // Menus use a CSS backdrop; keep the canvas cleared to avoid ghost frames.
    this.renderer.renderer.clear();
  }

  private moveInput() {
    const i = this.input;
    return { forward: i.isDown('forward'), back: i.isDown('back'), left: i.isDown('left'), right: i.isDown('right'), jump: i.isDown('jump'), sprint: i.isDown('sprint') };
  }

  private footsteps() {
    const p = this.player;
    if (p.stepAccum > (p.sprinting ? 2.4 : 2.0)) {
      p.stepAccum = 0;
      this.audio.play('step', this.groundSound());
    }
  }

  private updateCamera() {
    const p = this.player, cam = this.renderer.camera, s = this.settings.value;
    const a = this.state === 'PLAYING' ? this.acc / FIXED_DT : 1;
    const x = p.px + (p.x - p.px) * a, y = p.py + (p.y - p.py) * a, z = p.pz + (p.z - p.pz) * a;
    const speed = Math.hypot(p.vx, p.vz);
    let bobY = 0, roll = 0;
    if (s.viewBobbing && p.onGround && speed > 0.5 && this.state === 'PLAYING') {
      this.bobPhase += speed * 0.0125 * 6;
      bobY = Math.abs(Math.sin(this.bobPhase)) * 0.045 - 0.02;
      roll = Math.sin(this.bobPhase) * 0.0035 * (speed / 5);
    }
    cam.position.set(x, y + 1.62 + bobY, z);
    cam.rotation.set(p.pitch, p.yaw, roll, 'YXZ');
    const targetFov = s.fov + (p.sprinting ? 8 : 0);
    this.fovCurrent += (targetFov - this.fovCurrent) * 0.15;
    if (Math.abs(cam.fov - this.fovCurrent) > 0.01) { cam.fov = this.fovCurrent; cam.updateProjectionMatrix(); }

    // Underwater if the camera sits inside a water block's visible volume (top face is 2/16 lower).
    const bx = Math.floor(x), by = Math.floor(cam.position.y), bz = Math.floor(z);
    const inWater = IS_LIQUID[this.world!.getBlock(bx, by, bz)] === 1 &&
      (IS_LIQUID[this.world!.getBlock(bx, by + 1, bz)] === 1 || cam.position.y - by < 14 / 16);
    this.renderer.setUnderwater(inWater);
    this.ui.setUnderwater(inWater);
    this.audio.setUnderwater(inWater);

    // Highlight + cracks follow the interaction target.
    const it = this.interaction!;
    if (this.state === 'PLAYING' && it.target && !p.dead) {
      this.renderer.setHighlight([it.target.x, it.target.y, it.target.z]);
      this.renderer.setCrack([it.target.x, it.target.y, it.target.z], it.breakProgress);
    } else { this.renderer.setHighlight(null); this.renderer.setCrack(null, 0); }
  }

  private updateHeldItem(dt: number) {
    const p = this.player, it = this.interaction!;
    const stack = this.inventory.selectedStack();
    const l = this.world!.lightAt(Math.floor(p.x), Math.floor(p.y + 1.4), Math.floor(p.z));
    const lvl = Math.max(((l >> 4) / 15) * this.renderer.sky.skyBrightness, (l & 15) / 15);
    const shown = this.state === 'PLAYING' || this.state === 'INVENTORY';
    this.renderer.showHeld = shown && !p.dead;
    const breaking = this.input.mouseHeld(0) && it.breakProgress > 0;
    if (breaking && this.swingCooldown <= 0) { this.renderer.held.punch(); this.swingCooldown = 0.38; }
    if (this.input.mouseClicked(0) && !breaking) this.renderer.held.punch();
    if (this.input.mouseClicked(2) || (this.input.mouseHeld(2) && this.swingCooldown <= 0 && stack)) { this.renderer.held.kick(); if (this.swingCooldown <= 0) this.swingCooldown = 0.25; }
    this.swingCooldown -= dt;
    this.renderer.held.update(dt, stack ? stack.id : -1, 0.12 + 0.88 * Math.pow(lvl, 0.8), this.bobPhase, p.onGround && Math.hypot(p.vx, p.vz) > 0.5, this.settings.value.fov);
  }

  private swingCooldown = 0;

  private updateAudio(dt: number) {
    const p = this.player;
    const sky = this.world!.lightAt(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z)) >> 4;
    this.audio.updateAmbient(dt, this.renderer.sky.daylight, sky < 6, p.y, this.state === 'PLAYING' || this.state === 'INVENTORY');
  }

  private updateHud(dt: number) {
    const p = this.player;
    this.ui.updateHud(this.inventory, p.health, dt);
    this.ui.setLockHint(this.state === 'PLAYING' && !this.input.locked);
    this.ui.refreshInventoryIfChanged();
    const w = this.world!, s = this.settings.value;
    if (s.showCoords) {
      const bn = biomeName(w.biomeAt(Math.floor(p.x), Math.floor(p.z)));
      this.ui.setCoords(`X: ${Math.floor(p.x)}\nY: ${Math.floor(p.y)}\nZ: ${Math.floor(p.z)}\n${formatClock(this.time)} · ${bn}`);
    } else this.ui.setCoords('');
    if (this.debugOn) {
      const cs = this.chunks!.stats();
      const t = this.interaction!.target;
      const looking = t ? `${getBlockDef(w.getBlock(t.x, t.y, t.z)).name} (${t.x}, ${t.y}, ${t.z}) face ${t.nx + t.ny * 2 + t.nz * 3 < 0 ? '-' : '+'}${t.nx ? 'X' : t.ny ? 'Y' : 'Z'}` : 'none';
      const l = w.lightAt(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z));
      const mem = (performance as any).memory ? `${Math.round((performance as any).memory.usedJSHeapSize / 1048576)} MB` : 'n/a';
      const pcx = worldToChunk(p.x), pcz = worldToChunk(p.z);
      p.lookDir(this.lookDir);
      this.ui.setDebug([
        `<b>Voxel World</b>  ${this.fps.toFixed(0)} FPS  (${this.frameMs.toFixed(1)} ms/frame)`,
        `XYZ: ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}`,
        `Chunk: ${pcx}, ${pcz}  (local ${worldToLocal(p.x)}, ${Math.floor(p.y)}, ${worldToLocal(p.z)})`,
        `Facing: yaw ${(((-p.yaw * 180) / Math.PI) % 360).toFixed(0)}°  pitch ${((p.pitch * 180) / Math.PI).toFixed(0)}°`,
        `Seed: ${this.meta?.seed}  (${this.meta?.type})`,
        `Biome: ${biomeName(w.biomeAt(Math.floor(p.x), Math.floor(p.z)))}`,
        `Chunks: ${cs.loaded} loaded · ${cs.meshed} meshed · <b>${this.renderer.renderedChunks} rendered</b> · gen queue ${cs.generating} · mesh queue ${cs.meshQueue}`,
        `Last mesh: ${cs.lastMeshMs.toFixed(1)} ms · draw calls ${this.stats.calls} · tris ${(this.stats.tris / 1000).toFixed(0)}k`,
        `Looking at: ${looking}`,
        `Light here: sky ${l >> 4} block ${l & 15}`,
        `Time: ${Math.round(this.time)} / ${TICKS_PER_DAY} (${formatClock(this.time)})  daylight ${this.renderer.sky.daylight.toFixed(2)}`,
        `Mods: ${w.modCount()} blocks · mobs ${this.entities!.mobs.length} · drops ${this.drops!.drops.length}`,
        `State: ${this.state} · on ground ${p.onGround} · water ${p.inWater} · heap ${mem}`,
        `<b>/</b> opens the command line (/help)`,
      ].join('\n'));
    } else this.ui.setDebug(null);
  }
}


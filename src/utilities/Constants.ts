// Central place for every tunable number in the game.

export const CHUNK_SIZE = 16;
export const CHUNK_SHIFT = 4;
export const WORLD_HEIGHT = 128;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOLUME = CHUNK_AREA * WORLD_HEIGHT;
export const SEA_LEVEL = 62;

// --- Player ---
export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE = 1.62;
export const PLAYER_SPEED = 4.6;
export const SPRINT_SPEED = 7.2;
export const JUMP_FORCE = 8.6;
export const GRAVITY = 28;
export const TERMINAL_VELOCITY = 55;
export const WATER_GRAVITY = 7;
export const WATER_SPEED_MULT = 0.55;
export const SWIM_UP_SPEED = 3.6;
export const WATER_MAX_SINK = 3.2;
export const PLAYER_MAX_HEALTH = 100;
export const FALL_SAFE_DISTANCE = 3.6;
export const FALL_DAMAGE_PER_BLOCK = 10;
export const HEALTH_REGEN_DELAY = 8; // seconds without damage before regen starts
export const HEALTH_REGEN_RATE = 1; // HP per second once regenerating (slow on purpose)
export const INTERACTION_DISTANCE = 5.5;
export const ATTACK_DISTANCE = 3.6;
export const PICKUP_RADIUS = 1.6;

// --- Simulation ---
export const FIXED_DT = 1 / 60;
export const MAX_SIM_STEPS = 5;

// --- World / streaming ---
export const DEFAULT_RENDER_DISTANCE = 6;
export const MIN_RENDER_DISTANCE = 2;
export const MAX_RENDER_DISTANCE = 12;
export const UNLOAD_MARGIN = 2; // chunks beyond render distance kept before unloading
export const MAX_INFLIGHT_GENERATION = 6;
export const MESH_BUDGET_MS = 7; // main-thread budget per frame for meshing/lighting
export const LOADING_MESH_BUDGET_MS = 30;
export const SPAWN_PRELOAD_RADIUS = 3;

// --- Time ---
export const TICKS_PER_DAY = 24000;
export const DEFAULT_DAY_LENGTH_SECONDS = 600; // 10 real minutes
export const START_TIME_TICKS = 1500;

// --- Items ---
export const MAX_STACK_SIZE = 64;
export const INVENTORY_SIZE = 36; // 0..8 are the hotbar
export const HOTBAR_SIZE = 9;
export const DROP_LIFETIME_SECONDS = 300;
export const MAX_ITEM_DROPS = 160;

// --- Entities ---
export const MAX_PASSIVE_MOBS = 8;
export const MAX_HOSTILE_MOBS = 6;
export const MOB_DESPAWN_DISTANCE = 72;
export const MOB_FAR_UPDATE_DISTANCE = 40;

// --- Saving ---
export const SAVE_VERSION = 1;
export const AUTOSAVE_SECONDS = 60;
export const STORAGE_PREFIX = 'voxelcraft:';

// --- Light ---
export const MAX_LIGHT = 15;
export const TORCH_LIGHT = 14;

import { SAVE_VERSION, STORAGE_PREFIX, PLAYER_MAX_HEALTH, TICKS_PER_DAY, START_TIME_TICKS } from '../utilities/Constants';
import { clamp } from '../utilities/MathUtil';
import { randomSeed, seedFromString } from '../utilities/Random';
import { isValidBlockId } from '../world/BlockRegistry';
import type { WorldType } from '../world/WorldGenerator';
import type { World } from '../world/World';
import { chunkKeyToCoords } from '../utilities/MathUtil';
import { safeLocalStorage } from './Settings';

export interface WorldMeta {
  id: string;
  name: string;
  seed: number;
  type: WorldType;
  created: number;
  lastPlayed: number;
  playTime: number; // seconds
}

export interface WorldSave {
  version: number;
  meta: WorldMeta;
  time: number;
  player: { x: number; y: number; z: number; yaw: number; pitch: number; health: number; spawn: { x: number; y: number; z: number } };
  inventory: unknown;
  selected: number;
  /** [cx, cz, [blockIndex, blockId, ...]] */
  mods: Array<[number, number, number[]]>;
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type LoadResult = { ok: true; save: WorldSave; recovered: boolean } | { ok: false; error: string };

const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);

function sanitizeMeta(m: any, fallbackId?: string): WorldMeta | null {
  if (!m || typeof m !== 'object') return null;
  const id = typeof m.id === 'string' && /^[\w-]+$/.test(m.id) ? m.id : fallbackId;
  if (!id) return null;
  return {
    id, name: typeof m.name === 'string' ? m.name.slice(0, 40) : 'Unnamed World',
    seed: num(m.seed, 0) | 0, type: m.type === 'test' ? 'test' : 'normal',
    created: num(m.created, Date.now()), lastPlayed: num(m.lastPlayed, 0), playTime: Math.max(0, num(m.playTime, 0)),
  };
}

/** Validate + sanitise a parsed save. Returns null when it's unusable. */
export function validateSave(raw: any): WorldSave | null {
  if (!raw || typeof raw !== 'object') return null;
  const meta = sanitizeMeta(raw.meta);
  const p = raw.player;
  if (!meta || !p || typeof p !== 'object') return null;
  if (![p.x, p.y, p.z].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  const spawn = p.spawn && typeof p.spawn === 'object' ? p.spawn : p;
  const mods: WorldSave['mods'] = [];
  if (Array.isArray(raw.mods)) {
    for (const e of raw.mods) {
      if (!Array.isArray(e) || e.length !== 3 || !Number.isInteger(e[0]) || !Number.isInteger(e[1]) || !Array.isArray(e[2])) continue;
      const flat: number[] = [];
      for (let i = 0; i + 1 < e[2].length; i += 2) {
        const idx = e[2][i], id = e[2][i + 1];
        if (Number.isInteger(idx) && idx >= 0 && idx < 16 * 16 * 128 && isValidBlockId(id)) flat.push(idx, id);
      }
      mods.push([e[0], e[1], flat]);
    }
  }
  return {
    version: SAVE_VERSION, meta,
    time: clamp(num(raw.time, START_TIME_TICKS), 0, TICKS_PER_DAY * 1e6),
    player: {
      x: p.x, y: clamp(p.y, -64, 400), z: p.z, yaw: num(p.yaw, 0), pitch: clamp(num(p.pitch, 0), -1.56, 1.56),
      health: clamp(num(p.health, PLAYER_MAX_HEALTH), 1, PLAYER_MAX_HEALTH),
      spawn: { x: num(spawn.x, p.x), y: num(spawn.y, p.y), z: num(spawn.z, p.z) },
    },
    inventory: raw.inventory ?? [], selected: Math.floor(num(raw.selected, 0)), mods,
  };
}

export function modsFromWorld(world: World): WorldSave['mods'] {
  const out: WorldSave['mods'] = [];
  for (const [key, m] of world.mods) {
    const [cx, cz] = chunkKeyToCoords(key);
    const flat: number[] = [];
    for (const [idx, id] of m) flat.push(idx, id);
    out.push([cx, cz, flat]);
  }
  return out;
}

export class SaveManager {
  constructor(private storage: StorageLike | null = safeLocalStorage()) {}

  private k(id: string, suffix = '') { return `${STORAGE_PREFIX}world:${id}${suffix}`; }

  listWorlds(): WorldMeta[] {
    if (!this.storage) return [];
    try {
      const arr = JSON.parse(this.storage.getItem(STORAGE_PREFIX + 'index') ?? '[]');
      if (!Array.isArray(arr)) return [];
      return arr.map((m) => sanitizeMeta(m)).filter((m): m is WorldMeta => !!m).sort((a, b) => b.lastPlayed - a.lastPlayed);
    } catch (e) {
      console.error('[SaveManager] world index is corrupt', e);
      return [];
    }
  }

  private writeIndex(metas: WorldMeta[]) {
    this.storage?.setItem(STORAGE_PREFIX + 'index', JSON.stringify(metas));
  }

  createWorld(name: string, seedText: string, type: WorldType): WorldMeta {
    const trimmed = seedText.trim();
    const seed = trimmed === '' ? randomSeed() : seedFromString(trimmed);
    const now = Date.now();
    const meta: WorldMeta = {
      id: `w${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
      name: name.trim().slice(0, 40) || 'New World', seed, type, created: now, lastPlayed: now, playTime: 0,
    };
    this.writeIndex([meta, ...this.listWorlds()]);
    return meta;
  }

  /** Crash-safe write: verified temp copy first, then replace the real save, then drop the temp. */
  saveWorld(save: WorldSave) {
    if (!this.storage) throw new Error('Storage unavailable');
    const id = save.meta.id;
    const json = JSON.stringify(save);
    this.storage.setItem(this.k(id, ':tmp'), json);
    if (!validateSave(JSON.parse(this.storage.getItem(this.k(id, ':tmp')) ?? 'null'))) {
      this.storage.removeItem(this.k(id, ':tmp'));
      throw new Error('Save verification failed');
    }
    this.storage.setItem(this.k(id), json);
    this.storage.removeItem(this.k(id, ':tmp'));
    const metas = this.listWorlds().filter((m) => m.id !== id);
    this.writeIndex([save.meta, ...metas]);
  }

  loadWorld(id: string): LoadResult {
    if (!this.storage) return { ok: false, error: 'Storage unavailable' };
    for (const [suffix, recovered] of [['', false], [':tmp', true]] as const) {
      const raw = this.storage.getItem(this.k(id, suffix));
      if (!raw) continue;
      try {
        const save = validateSave(JSON.parse(raw));
        if (save) return { ok: true, save: { ...save, meta: { ...save.meta, id } }, recovered };
        console.error(`[SaveManager] save "${id}${suffix}" failed validation`);
      } catch (e) {
        console.error(`[SaveManager] save "${id}${suffix}" is not valid JSON`, e);
      }
    }
    return { ok: false, error: 'Save data is missing or damaged.' };
  }

  hasSave(id: string): boolean { return !!this.storage?.getItem(this.k(id)); }

  deleteWorld(id: string) {
    if (!this.storage) return;
    for (const s of ['', ':tmp']) this.storage.removeItem(this.k(id, s));
    this.writeIndex(this.listWorlds().filter((m) => m.id !== id));
  }

  touchMeta(meta: WorldMeta) {
    this.writeIndex([meta, ...this.listWorlds().filter((m) => m.id !== meta.id)]);
  }
}

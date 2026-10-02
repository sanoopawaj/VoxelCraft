import {
  CHUNK_SIZE, MAX_INFLIGHT_GENERATION, UNLOAD_MARGIN,
} from '../utilities/Constants';
import { chunkKey, worldToChunk, worldToLocal } from '../utilities/MathUtil';
import { buildChunkMesh } from '../rendering/ChunkMesher';
import type { Renderer } from '../rendering/Renderer';
import { BLOCK_DEFS, B } from './BlockRegistry';
import type { Chunk } from './Chunk';
import type { World } from './World';
import { generateChunk } from './WorldGenerator';

interface GenResult { key: number; cx: number; cz: number; blocks?: Uint8Array; biomes?: Uint8Array; error?: string }

const ORE_COLORS: Record<number, [number, number, number]> = {
  [B.COAL_ORE]: [0.2, 0.2, 0.2], [B.IRON_ORE]: [0.9, 0.6, 0.45], [B.GOLD_ORE]: [1, 0.85, 0.1], [B.DIAMOND_ORE]: [0.2, 1, 1],
};

/**
 * Streams chunks around the player: prioritised generation (in Web Workers),
 * budgeted lighting+meshing, edit-driven remeshing, and unloading of far chunks.
 */
export class ChunkManager {
  renderDistance = 6;
  private workers: Worker[] = [];
  private nextWorker = 0;
  private inflight = new Set<number>();
  private results: GenResult[] = [];
  private wanted: Array<{ cx: number; cz: number; key: number; d: number }> = [];
  private meshQueue: Chunk[] = [];
  private queueStale = true;
  private lastPcx = NaN;
  private lastPcz = NaN;
  private syncFallback = false;
  oreDebug = false;

  // Stats for the debug overlay.
  lastMeshMs = 0;
  meshesBuilt = 0;

  constructor(private world: World, private renderer: Renderer) {
    this.initWorkers();
  }

  private initWorkers() {
    try {
      const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1));
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent<GenResult>) => { this.results.push(e.data); };
        w.onerror = (e) => {
          console.error('[ChunkManager] generation worker crashed, falling back to main thread', e.message);
          this.syncFallback = true;
          this.inflight.clear();
        };
        this.workers.push(w);
      }
    } catch (err) {
      console.warn('[ChunkManager] Web Workers unavailable, generating on the main thread', err);
      this.syncFallback = true;
    }
  }

  dispose() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }

  setRenderDistance(r: number) {
    this.renderDistance = r;
    this.queueStale = true;
    this.lastPcx = NaN;
  }

  /** Call every frame. `budgetMs` bounds lighting+meshing work on the main thread. */
  update(px: number, pz: number, budgetMs: number) {
    const pcx = worldToChunk(px), pcz = worldToChunk(pz);
    if (pcx !== this.lastPcx || pcz !== this.lastPcz) {
      this.lastPcx = pcx; this.lastPcz = pcz;
      this.refreshWanted(pcx, pcz);
      this.unloadFar(pcx, pcz);
      this.queueStale = true;
    }
    this.pumpGeneration(pcx, pcz, budgetMs);
    this.drainEdits();
    this.pumpMeshing(pcx, pcz, budgetMs);
  }

  private refreshWanted(pcx: number, pcz: number) {
    const r = this.renderDistance + 1;
    this.wanted.length = 0;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dz * dz;
      if (d > r * r + 1) continue;
      const cx = pcx + dx, cz = pcz + dz;
      const key = chunkKey(cx, cz);
      if (this.world.chunks.has(key) || this.inflight.has(key)) continue;
      this.wanted.push({ cx, cz, key, d });
    }
    this.wanted.sort((a, b) => a.d - b.d);
  }

  private unloadFar(pcx: number, pcz: number) {
    const lim = this.renderDistance + 1 + UNLOAD_MARGIN;
    for (const c of [...this.world.chunks.values()]) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > lim * lim) {
        this.world.removeChunk(c.cx, c.cz);
        this.renderer.removeChunk(c.cx, c.cz);
      }
    }
  }

  private pumpGeneration(pcx: number, pcz: number, budgetMs: number) {
    // Apply finished chunks first so they free in-flight slots.
    let applied = 0;
    while (this.results.length && applied < 6) {
      const r = this.results.shift()!;
      this.inflight.delete(r.key);
      if (r.error || !r.blocks || !r.biomes) { console.error('[ChunkManager] chunk generation failed', r.cx, r.cz, r.error); continue; }
      const dx = r.cx - pcx, dz = r.cz - pcz;
      const lim = this.renderDistance + 1 + UNLOAD_MARGIN;
      if (dx * dx + dz * dz > lim * lim) continue; // player already moved on
      if (this.world.chunks.has(r.key)) continue;
      this.world.addChunk(r.cx, r.cz, { blocks: r.blocks, biomes: r.biomes });
      this.queueStale = true;
      applied++;
    }

    if (this.syncFallback) {
      // Main-thread generation, bounded by the same time budget.
      const t0 = performance.now();
      while (this.wanted.length && performance.now() - t0 < budgetMs * 0.5) {
        const w = this.wanted.shift()!;
        if (this.world.chunks.has(w.key)) continue;
        try {
          this.world.addChunk(w.cx, w.cz, generateChunk(this.world.cfg, w.cx, w.cz));
        } catch (err) { console.error('[ChunkManager] chunk generation failed', w.cx, w.cz, err); }
        this.queueStale = true;
      }
      return;
    }

    while (this.wanted.length && this.inflight.size < MAX_INFLIGHT_GENERATION) {
      const w = this.wanted.shift()!;
      if (this.world.chunks.has(w.key) || this.inflight.has(w.key)) continue;
      this.inflight.add(w.key);
      const wk = this.workers[this.nextWorker++ % this.workers.length];
      wk.postMessage({ key: w.key, cx: w.cx, cz: w.cz, cfg: this.world.cfg });
    }
  }

  /** Turn block edits into dirty chunks; neighbours only if the edit can change their faces or light. */
  private drainEdits() {
    const edits = this.world.pendingEdits;
    if (!edits.length) return;
    for (const e of edits) {
      const cx = worldToChunk(e.x), cz = worldToChunk(e.z);
      const lx = worldToLocal(e.x), lz = worldToLocal(e.z);
      this.markDirty(cx, cz, 0);
      // How far can this edit's light influence reach? Bounded by the brightest light around the cell.
      let reach = 0;
      const emitter = BLOCK_DEFS[e.oldId]?.light || BLOCK_DEFS[e.newId]?.light;
      if (emitter) reach = 15;
      else {
        const probe = (x: number, y: number, z: number) => {
          const l = this.world.lightAt(x, y, z);
          return Math.max(l >> 4, l & 15);
        };
        reach = Math.max(probe(e.x, e.y, e.z), probe(e.x + 1, e.y, e.z), probe(e.x - 1, e.y, e.z), probe(e.x, e.y + 1, e.z), probe(e.x, e.y - 1, e.z), probe(e.x, e.y, e.z + 1), probe(e.x, e.y, e.z - 1));
      }
      const near = Math.max(1, reach);
      const west = lx < near, east = CHUNK_SIZE - 1 - lx < near;
      const north = lz < near, south = CHUNK_SIZE - 1 - lz < near;
      // Faces/AO need immediate (priority 0) updates only when the edit touches the border cell itself.
      const pr = (d: number) => (d === 0 ? 0 : 1);
      if (west) this.markDirty(cx - 1, cz, pr(lx));
      if (east) this.markDirty(cx + 1, cz, pr(CHUNK_SIZE - 1 - lx));
      if (north) this.markDirty(cx, cz - 1, pr(lz));
      if (south) this.markDirty(cx, cz + 1, pr(CHUNK_SIZE - 1 - lz));
      if (west && north) this.markDirty(cx - 1, cz - 1, 1);
      if (west && south) this.markDirty(cx - 1, cz + 1, 1);
      if (east && north) this.markDirty(cx + 1, cz - 1, 1);
      if (east && south) this.markDirty(cx + 1, cz + 1, 1);
    }
    edits.length = 0;
  }

  markDirty(cx: number, cz: number, priority: number) {
    const c = this.world.getChunk(cx, cz);
    if (!c) return;
    if (!c.dirty || priority < c.dirtyPriority) c.dirtyPriority = priority;
    c.dirty = true;
    this.queueStale = true;
  }

  private ready(c: Chunk): boolean {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!this.world.chunks.has(chunkKey(c.cx + dx, c.cz + dz))) return false;
    }
    return true;
  }

  private pumpMeshing(pcx: number, pcz: number, budgetMs: number) {
    if (this.queueStale) {
      this.meshQueue.length = 0;
      const r = this.renderDistance;
      for (const c of this.world.chunks.values()) {
        const dx = c.cx - pcx, dz = c.cz - pcz;
        if (dx * dx + dz * dz > r * r + 1) continue;
        if (!c.dirty && this.renderer.hasMesh(c.cx, c.cz)) continue;
        if (!c.dirty && c.meshVersion >= 0) continue; // meshed (possibly empty)
        if (!this.ready(c)) continue;
        this.meshQueue.push(c);
      }
      this.meshQueue.sort((a, b) => {
        if (a.dirtyPriority !== b.dirtyPriority && (a.meshVersion >= 0 || b.meshVersion >= 0)) return a.dirtyPriority - b.dirtyPriority;
        const da = (a.cx - pcx) ** 2 + (a.cz - pcz) ** 2, db = (b.cx - pcx) ** 2 + (b.cz - pcz) ** 2;
        return da - db;
      });
      this.queueStale = false;
    }
    const t0 = performance.now();
    let built = 0;
    while (this.meshQueue.length) {
      const c = this.meshQueue.shift()!;
      if (this.world.chunks.get(chunkKey(c.cx, c.cz)) !== c || !this.ready(c)) continue;
      const ts = performance.now();
      this.meshChunk(c);
      this.lastMeshMs = performance.now() - ts;
      built++;
      if (performance.now() - t0 >= budgetMs) break;
    }
    this.meshesBuilt += built;
    // Chunks that arrived mid-frame may now be meshable; recheck next frame.
    if (!this.meshQueue.length && this.wanted.length + this.inflight.size > 0) this.queueStale = true;
  }

  meshChunk(c: Chunk) {
    const data = buildChunkMesh(this.world, c);
    this.renderer.setChunkMesh(c.cx, c.cz, data);
    c.dirty = false;
    c.dirtyPriority = 1;
    c.meshVersion = c.version;
    if (this.oreDebug) this.updateOreMarkers(c);
  }

  setOreDebug(on: boolean) {
    this.oreDebug = on;
    if (!on) { this.renderer.clearOreMarkers(); return; }
    for (const c of this.world.chunks.values()) this.updateOreMarkers(c);
  }

  private updateOreMarkers(c: Chunk) {
    const pts: number[] = [], cols: number[] = [];
    const b = c.blocks;
    for (let i = 0; i < b.length; i++) {
      const col = ORE_COLORS[b[i]];
      if (!col) continue;
      pts.push(c.cx * CHUNK_SIZE + (i & 15) + 0.5, (i >> 8) + 0.5, c.cz * CHUNK_SIZE + ((i >> 4) & 15) + 0.5);
      cols.push(col[0], col[1], col[2]);
    }
    this.renderer.setOreMarkers(c.cx, c.cz, new Float32Array(pts), new Float32Array(cols));
  }

  /** Fraction of the chunks within `radius` that are meshed; drives the loading bar. */
  loadProgress(pcx: number, pcz: number, radius: number): { done: number; total: number } {
    let done = 0, total = 0;
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dz * dz > radius * radius + 1) continue;
      total++;
      const c = this.world.getChunk(pcx + dx, pcz + dz);
      if (c && c.meshVersion >= 0 && !c.dirty) done++;
    }
    return { done, total };
  }

  stats() {
    return {
      loaded: this.world.chunks.size,
      meshed: this.renderer.meshedChunkCount,
      generating: this.inflight.size + this.wanted.length,
      meshQueue: this.meshQueue.length,
      lastMeshMs: this.lastMeshMs,
    };
  }
}

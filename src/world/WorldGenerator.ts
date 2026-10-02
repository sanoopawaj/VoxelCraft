import { CHUNK_AREA, CHUNK_SIZE, CHUNK_VOLUME, SEA_LEVEL, WORLD_HEIGHT } from '../utilities/Constants';
import { Noise } from '../utilities/Noise';
import { hash01, hash4, mulberry32 } from '../utilities/Random';
import { smoothstep, clamp } from '../utilities/MathUtil';
import { B } from './BlockRegistry';
import { Biome, BIOMES } from './Biomes';

// Pure, deterministic terrain generation. Depends only on (config, cx, cz) so it can
// run inside a Web Worker and give identical results anywhere.

export type WorldType = 'normal' | 'test';

export interface GenConfig {
  seed: number;
  type: WorldType;
}

/** Ore tables are data so distributions are easy to tune. */
export interface OreDef { block: number; attempts: number; size: number; minY: number; maxY: number }
export const ORES: OreDef[] = [
  { block: B.COAL_ORE, attempts: 22, size: 9, minY: 4, maxY: 96 },
  { block: B.IRON_ORE, attempts: 14, size: 6, minY: 4, maxY: 64 },
  { block: B.GOLD_ORE, attempts: 5, size: 5, minY: 3, maxY: 34 },
  { block: B.DIAMOND_ORE, attempts: 4, size: 4, minY: 2, maxY: 18 },
];

export interface ColumnInfo {
  height: number; // surface y (top solid block)
  biome: number;
  mountain: number; // 0..1
  temp: number;
  moist: number;
}

export interface GeneratedChunk { blocks: Uint8Array; biomes: Uint8Array }

/** Noise fields for one seed; cached per generator instance. */
export class TerrainSampler {
  readonly cont: Noise;
  readonly hills: Noise;
  readonly ridge: Noise;
  readonly mask: Noise;
  readonly temp: Noise;
  readonly moist: Noise;
  readonly cave1: Noise;
  readonly cave2: Noise;
  readonly chamber: Noise;
  readonly misc: Noise;

  constructor(readonly seed: number) {
    // Each field gets its own derived seed so features are uncorrelated.
    const s = (n: number) => hash4(seed, n, 7919) | 0;
    this.cont = new Noise(s(1));
    this.hills = new Noise(s(2));
    this.ridge = new Noise(s(3));
    this.mask = new Noise(s(4));
    this.temp = new Noise(s(5));
    this.moist = new Noise(s(6));
    this.cave1 = new Noise(s(7));
    this.cave2 = new Noise(s(8));
    this.chamber = new Noise(s(9));
    this.misc = new Noise(s(10));
  }

  column(x: number, z: number): ColumnInfo {
    // Continental shape: low = ocean, high = inland.
    const cont = this.cont.fbm2(x * 0.0016, z * 0.0016, 3);
    let h = 67 + cont * 34;

    // Rolling hills; amplitude varies so some regions are flat plains.
    const flat = 0.35 + 0.65 * (this.misc.noise2(x * 0.004, z * 0.004) * 0.5 + 0.5);
    h += (this.hills.fbm2(x * 0.011, z * 0.011, 3) * 7 + this.hills.noise2(x * 0.05, z * 0.05) * 1.2) * flat;

    // Mountains only rise on land, shaped by ridged noise for peaks and valleys.
    const mask = smoothstep(0.0, 0.34, this.mask.fbm2(x * 0.0026 + 500, z * 0.0026 - 300, 2)) * smoothstep(-0.12, 0.15, cont);
    const ridged = 1 - Math.abs(this.ridge.fbm2(x * 0.0075, z * 0.0075, 3));
    h += mask * (8 + Math.pow(ridged, 1.7) * 52);

    // Soft ceiling so peaks never clip the world height.
    if (h > 98) h = 98 + (h - 98) * 0.45;
    h = clamp(h, 6, WORLD_HEIGHT - 6);
    const height = Math.floor(h);

    const temp = this.temp.fbm2(x * 0.0017, z * 0.0017, 2) * 1.6 - (h - 80) * 0.004;
    const moist = this.moist.fbm2(x * 0.002 + 90, z * 0.002 + 90, 2) * 1.6;

    let biome: number;
    if (height < SEA_LEVEL - 1) biome = Biome.OCEAN;
    else if (mask > 0.45 && height > 76) biome = temp < -0.25 || height > 100 ? Biome.SNOWY_MOUNTAINS : Biome.MOUNTAINS;
    else if (height <= SEA_LEVEL + 1 && mask < 0.3) biome = Biome.BEACH;
    else if (temp > 0.35 && moist < 0.15) biome = Biome.DESERT;
    else if (temp < -0.35) biome = Biome.SNOWY_PLAINS;
    else if (moist > 0.1) biome = Biome.FOREST;
    else biome = Biome.PLAINS;
    return { height, biome, mountain: mask, temp, moist };
  }
}

const samplerCache = new Map<number, TerrainSampler>();
export function getSampler(seed: number): TerrainSampler {
  let s = samplerCache.get(seed);
  if (!s) {
    if (samplerCache.size > 4) samplerCache.clear();
    s = new TerrainSampler(seed);
    samplerCache.set(seed, s);
  }
  return s;
}

/** Surface block (and depth of filler) for a biome/height. */
function surfaceFor(info: ColumnInfo, x: number, z: number, seed: number): { top: number; filler: number; depth: number } {
  const h = info.height;
  switch (info.biome) {
    case Biome.DESERT: return { top: B.SAND, filler: B.SAND, depth: 4 };
    case Biome.BEACH: return { top: B.SAND, filler: B.SAND, depth: 3 };
    case Biome.OCEAN: {
      const g = hash01(seed, x >> 3, z >> 3, 11) < 0.35 || h < SEA_LEVEL - 14;
      return { top: g ? B.GRAVEL : B.SAND, filler: B.SAND, depth: 3 };
    }
    case Biome.SNOWY_PLAINS: return { top: B.SNOWY_GRASS, filler: B.DIRT, depth: 4 };
    case Biome.MOUNTAINS:
      if (h > 90) return { top: B.STONE, filler: B.STONE, depth: 1 };
      if (info.mountain > 0.8 || h > 82) return { top: hash01(seed, x, z, 3) < 0.12 ? B.GRAVEL : B.STONE, filler: B.STONE, depth: 1 };
      return { top: B.GRASS, filler: B.DIRT, depth: 3 };
    case Biome.SNOWY_MOUNTAINS:
      if (h > 86) return { top: B.SNOW, filler: B.STONE, depth: 2 };
      return { top: B.SNOWY_GRASS, filler: B.DIRT, depth: 2 };
    default: return { top: B.GRASS, filler: B.DIRT, depth: 4 };
  }
}

export function generateChunk(cfg: GenConfig, cx: number, cz: number): GeneratedChunk {
  if (cfg.type === 'test') return generateTestChunk(cx, cz);
  const sampler = getSampler(cfg.seed);
  const blocks = new Uint8Array(CHUNK_VOLUME);
  const biomes = new Uint8Array(CHUNK_AREA);
  const wx0 = cx * CHUNK_SIZE;
  const wz0 = cz * CHUNK_SIZE;

  // --- 1. Terrain columns, caves ---
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const x = wx0 + lx;
      const z = wz0 + lz;
      const info = sampler.column(x, z);
      const col = lx | (lz << 4);
      biomes[col] = info.biome;
      const surf = surfaceFor(info, x, z, cfg.seed);
      const h = info.height;

      // Caves may break through the surface only where an "entrance" noise is high.
      const entrance = sampler.misc.noise2(x * 0.02 + 40, z * 0.02 - 40) > 0.55;
      const underOcean = h < SEA_LEVEL;
      const carveTop = underOcean ? h - 8 : entrance ? h : h - 5;

      for (let y = 0; y <= h; y++) {
        let id: number;
        if (y === 0) id = B.BEDROCK;
        else if (y <= 2 && hash01(cfg.seed, x, z, y) < 0.5) id = B.BEDROCK;
        else if (y === h) id = surf.top;
        else if (y > h - surf.depth) id = surf.filler;
        else id = B.STONE;

        if (id === B.STONE && y >= 3 && y <= carveTop && isCave(sampler, x, y, z)) id = B.AIR;
        blocks[col | (y << 8)] = id;
      }
      // Standing water up to sea level.
      for (let y = h + 1; y <= SEA_LEVEL; y++) blocks[col | (y << 8)] = B.WATER;
    }
  }

  // --- 2. Ores (per-chunk RNG, clipped to the chunk so chunks stay independent) ---
  for (let o = 0; o < ORES.length; o++) {
    const ore = ORES[o];
    const rng = mulberry32(hash4(cfg.seed, cx, cz, 100 + o));
    for (let a = 0; a < ore.attempts; a++) {
      let x = Math.floor(rng() * CHUNK_SIZE);
      let y = ore.minY + Math.floor(rng() * (ore.maxY - ore.minY + 1));
      let z = Math.floor(rng() * CHUNK_SIZE);
      const n = 1 + Math.floor(rng() * ore.size);
      for (let k = 0; k < n; k++) {
        if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && y > 2 && y < WORLD_HEIGHT) {
          const i = x | (z << 4) | (y << 8);
          if (blocks[i] === B.STONE) blocks[i] = ore.block;
        }
        const r = Math.floor(rng() * 6);
        if (r === 0) x++; else if (r === 1) x--; else if (r === 2) y++; else if (r === 3) y--; else if (r === 4) z++; else z--;
      }
    }
  }

  // --- 3. Vegetation ---
  placeVegetation(cfg.seed, sampler, blocks, cx, cz);
  return { blocks, biomes };
}

function isCave(s: TerrainSampler, x: number, y: number, z: number): boolean {
  // Tunnels: where two independent 3D noise fields are both near zero.
  const a = s.cave1.noise3(x * 0.022, y * 0.03, z * 0.022);
  if (Math.abs(a) < 0.085) {
    const b = s.cave2.noise3(x * 0.022 + 100, y * 0.03, z * 0.022 + 100);
    if (Math.abs(b) < 0.1) return true;
  }
  // Chambers: sparse low-frequency blobs.
  if (y < 56) return s.chamber.noise3(x * 0.03, y * 0.045, z * 0.03) > 0.62;
  return false;
}

const TREE_RADIUS = 3;
const TREE_SPACING = 4; // a tree must be the strongest hash in this neighbourhood

function placeVegetation(seed: number, sampler: TerrainSampler, blocks: Uint8Array, cx: number, cz: number) {
  const wx0 = cx * CHUNK_SIZE;
  const wz0 = cz * CHUNK_SIZE;
  const ext = TREE_RADIUS + 1;
  // Trees rooted outside this chunk can still overhang into it, so scan a margin.
  for (let z = wz0 - ext; z < wz0 + CHUNK_SIZE + ext; z++) {
    for (let x = wx0 - ext; x < wx0 + CHUNK_SIZE + ext; x++) {
      const score = hash01(seed, x, z, 55);
      if (score < 0.94) continue; // cheap reject before any noise work (max threshold is 0.95)
      const info = sampler.column(x, z);
      if (info.height <= SEA_LEVEL) continue;
      const isDesert = info.biome === Biome.DESERT;
      const density = isDesert ? BIOMES[Biome.DESERT].treeDensity * 4 : BIOMES[info.biome].treeDensity;
      const threshold = 1 - density;
      if (density <= 0 || score <= threshold) continue;
      // Spacing: skip if a stronger candidate lies within TREE_SPACING (depends only on hashes -> chunk independent).
      let blocked = false;
      for (let dz = -TREE_SPACING; dz <= TREE_SPACING && !blocked; dz++) {
        for (let dx = -TREE_SPACING; dx <= TREE_SPACING; dx++) {
          if (!dx && !dz) continue;
          const o = hash01(seed, x + dx, z + dz, 55);
          if (o > score && o > threshold) { blocked = true; break; }
        }
      }
      if (blocked) continue;
      const rng = mulberry32(hash4(seed, x, z, 77));
      if (isDesert) growCactus(blocks, x, info.height, z, wx0, wz0, rng);
      else growTree(blocks, x, info.height, z, wx0, wz0, rng, info.biome);
    }
  }
}

function put(blocks: Uint8Array, wx0: number, wz0: number, x: number, y: number, z: number, id: number, onlyAir: boolean) {
  const lx = x - wx0;
  const lz = z - wz0;
  if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
  const i = lx | (lz << 4) | (y << 8);
  if (onlyAir && blocks[i] !== B.AIR) return;
  blocks[i] = id;
}

function surfaceOk(blocks: Uint8Array, wx0: number, wz0: number, x: number, y: number, z: number): number {
  // Returns the block under the tree if the root column lies inside this chunk, else -1 (skip check).
  const lx = x - wx0;
  const lz = z - wz0;
  if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return -1;
  return blocks[lx | (lz << 4) | (y << 8)];
}

function growTree(blocks: Uint8Array, x: number, base: number, z: number, wx0: number, wz0: number, rng: () => number, biome: number) {
  const under = surfaceOk(blocks, wx0, wz0, x, base, z);
  if (under !== -1 && under !== B.GRASS && under !== B.SNOWY_GRASS && under !== B.DIRT) return;
  const spruce = biome === Biome.SNOWY_PLAINS || biome === Biome.SNOWY_MOUNTAINS || (biome === Biome.MOUNTAINS && rng() < 0.6);
  if (spruce) {
    const trunk = 6 + Math.floor(rng() * 4);
    for (let i = 1; i <= trunk; i++) put(blocks, wx0, wz0, x, base + i, z, B.WOOD, false);
    // Cone: widen by one ring every two layers going down from the tip.
    for (let k = 0; base + trunk + 1 - k >= base + 3; k++) {
      const y = base + trunk + 1 - k;
      const r = Math.min(3, Math.ceil(k / 2));
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (r > 1 && Math.abs(dx) === r && Math.abs(dz) === r) continue;
        put(blocks, wx0, wz0, x + dx, y, z + dz, B.LEAVES, true);
      }
    }
    return;
  }
  const trunk = 4 + Math.floor(rng() * 3);
  const big = rng() < 0.25;
  for (let i = 1; i <= trunk; i++) put(blocks, wx0, wz0, x, base + i, z, B.WOOD, false);
  const top = base + trunk;
  const r = big ? 3 : 2;
  for (let dy = -2; dy <= 1; dy++) {
    const rad = dy >= 1 ? 1 : r;
    for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
      const corner = Math.abs(dx) === rad && Math.abs(dz) === rad;
      if (corner && rad > 1 && (dy >= 0 || rng() < 0.45)) continue;
      if (dx === 0 && dz === 0 && dy < 1) continue; // keep trunk
      put(blocks, wx0, wz0, x + dx, top + dy, z + dz, B.LEAVES, true);
    }
  }
  put(blocks, wx0, wz0, x, top + 1, z, B.LEAVES, true);
}

function growCactus(blocks: Uint8Array, x: number, base: number, z: number, wx0: number, wz0: number, rng: () => number) {
  const under = surfaceOk(blocks, wx0, wz0, x, base, z);
  if (under !== -1 && under !== B.SAND) return;
  const hgt = 1 + Math.floor(rng() * 3);
  for (let i = 1; i <= hgt; i++) put(blocks, wx0, wz0, x, base + i, z, B.CACTUS, true);
}

// ---------------------------------------------------------------------------
// Flat test world: all block types on display, pool, torches, fall tower, tunnel.
// ---------------------------------------------------------------------------
export const TEST_GROUND = 60;

function generateTestChunk(cx: number, cz: number): GeneratedChunk {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  const biomes = new Uint8Array(CHUNK_AREA).fill(Biome.PLAINS);
  const wx0 = cx * CHUNK_SIZE;
  const wz0 = cz * CHUNK_SIZE;
  for (let col = 0; col < CHUNK_AREA; col++) {
    for (let y = 0; y <= TEST_GROUND; y++) {
      blocks[col | (y << 8)] = y === 0 ? B.BEDROCK : y === TEST_GROUND ? B.GRASS : y > TEST_GROUND - 4 ? B.DIRT : B.STONE;
    }
  }
  const set = (x: number, y: number, z: number, id: number) => put(blocks, wx0, wz0, x, y, z, id, false);
  // Block gallery: one of every placeable block in a row at z = 6, on stone pedestals.
  const gallery = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 20, 21];
  gallery.forEach((id, i) => {
    const x = -9 + i;
    set(x, TEST_GROUND + 1, 6, B.STONE);
    set(x, TEST_GROUND + 2, 6, id);
  });
  // Water pool at (8..14, -8..-3).
  for (let x = 8; x <= 14; x++) for (let z = -8; z <= -3; z++) {
    for (let y = TEST_GROUND - 2; y <= TEST_GROUND; y++) set(x, y, z, y === TEST_GROUND - 3 ? B.SAND : B.WATER);
  }
  // Fall-damage tower and stairs.
  for (let y = 1; y <= 14; y++) set(-12, TEST_GROUND + y, -6, B.STONE);
  for (let i = 0; i < 8; i++) for (let y = 1; y <= i + 1; y++) set(-6 + i, TEST_GROUND + y, -10, B.PLANKS);
  // Torch row at night-testing distance.
  for (let x = -4; x <= 4; x += 2) set(x, TEST_GROUND + 1, 14, B.TORCH);
  // Chunk-boundary stripe along x=15/16 and z=15/16 made of bricks.
  for (let t = -20; t <= 20; t++) { set(15, TEST_GROUND + 1, t, B.BRICKS); set(16, TEST_GROUND + 1, t, B.COBBLE); set(t, TEST_GROUND + 1, -1, B.BRICKS); set(t, TEST_GROUND + 1, 0, B.COBBLE); }
  // Underground tunnel for darkness tests.
  for (let x = -10; x <= 10; x++) for (let y = TEST_GROUND - 12; y <= TEST_GROUND - 10; y++) for (let z = 20; z <= 22; z++) set(x, y, z, B.AIR);
  // Ore cluster.
  [B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE].forEach((id, i) => { for (let k = 0; k < 3; k++) set(-8 + i * 2, TEST_GROUND - 11 + k, 19, id); });
  return { blocks, biomes };
}

/** Deterministic starting column for a seed: nearest dry, non-mountain land to the origin. */
export function findSpawnColumn(cfg: GenConfig): { x: number; z: number; y: number } {
  if (cfg.type === 'test') return { x: 0, z: 2, y: TEST_GROUND + 1 };
  const s = getSampler(cfg.seed);
  let best: { x: number; z: number; y: number; score: number } | null = null;
  for (let r = 0; r <= 160; r += 4) {
    const steps = Math.max(1, r * 2);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.round(Math.cos(a) * r);
      const z = Math.round(Math.sin(a) * r);
      const c = s.column(x, z);
      const ok = c.height > SEA_LEVEL + 1 && (c.biome === Biome.PLAINS || c.biome === Biome.FOREST || c.biome === Biome.SNOWY_PLAINS || c.biome === Biome.DESERT);
      if (ok) {
        // Prefer flat land: compare to neighbours.
        const flat = Math.abs(s.column(x + 6, z).height - c.height) + Math.abs(s.column(x, z + 6).height - c.height);
        if (flat <= 3) return { x, z, y: c.height + 1 };
        if (!best || flat < best.score) best = { x, z, y: c.height + 1, score: flat };
      }
    }
    if (best && r > 24) break;
  }
  return best ? { x: best.x, z: best.z, y: best.y } : { x: 0, z: 0, y: 90 };
}

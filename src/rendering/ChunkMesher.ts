import { CHUNK_SIZE, WORLD_HEIGHT } from '../utilities/Constants';
import {
  BLOCK_DEFS, B, EMIT_LIGHT, IS_OPAQUE, LIGHT_ABSORB,
} from '../world/BlockRegistry';
import { BIOMES } from '../world/Biomes';
import type { Chunk } from '../world/Chunk';
import type { World } from '../world/World';

// Lighting + meshing for one chunk, working on a padded 3x3-chunk region copy so every
// lookup is a plain typed-array read (no map lookups, no allocation in the hot loops).

const R = CHUNK_SIZE * 3; // region width in blocks
const RA = R * R;
const MAXH = WORLD_HEIGHT;

const rb = new Uint8Array(RA * MAXH); // region blocks
const sky = new Uint8Array(RA * MAXH);
const blk = new Uint8Array(RA * MAXH);
const colTop = new Uint8Array(RA);
const QMASK = (1 << 20) - 1;
const queue = new Int32Array(QMASK + 1);
let qHead = 0;
let qTail = 0;

export interface MeshBuffers {
  pos: Float32Array; // xyz, chunk-local
  uv: Float32Array;
  color: Uint8Array; // rgb tint, a = face shade * ao
  light: Uint8Array; // sky, block (0..255 = 0..15)
  index: Uint32Array;
  vertexCount: number;
}
export interface ChunkMeshData { opaque: MeshBuffers | null; water: MeshBuffers | null; faces: number; maxY: number }

// ---------------------------------------------------------------------------
// Atlas lookup (set once by the renderer; tests install a dummy).
// ---------------------------------------------------------------------------
// uvTable[(blockId*6 + face)*4 ..] = u0,v0,u1,v1.  face order: +X,-X,+Y,-Y,+Z,-Z
let uvTable = new Float32Array(256 * 6 * 4);
let torchUV = { side: [0, 0, 1, 1], top: [0, 0, 1, 1] };

export function installAtlas(lookup: (name: string) => [number, number, number, number], torchRegions?: { side: number[]; top: number[] }) {
  uvTable = new Float32Array(256 * 6 * 4);
  for (const b of BLOCK_DEFS) {
    const names = [b.tex.side, b.tex.side, b.tex.top, b.tex.bottom, b.tex.side, b.tex.side];
    for (let f = 0; f < 6; f++) uvTable.set(lookup(names[f]), (b.id * 6 + f) * 4);
  }
  if (torchRegions) torchUV = torchRegions;
}

const CULL_SAME = new Uint8Array(256);
const TINT = new Uint8Array(256); // 0 none, 1 grass(top only), 2 leaves
const SHAPE = new Uint8Array(256); // 0 cube, 1 liquid, 2 torch
for (const b of BLOCK_DEFS) {
  CULL_SAME[b.id] = b.cullSame ? 1 : 0;
  TINT[b.id] = b.tint === 'grass' ? 1 : b.tint === 'leaves' ? 2 : 0;
  SHAPE[b.id] = b.shape === 'liquid' ? 1 : b.shape === 'torch' ? 2 : 0;
}
const GRASS_TINT = new Uint8Array(BIOMES.length * 3);
const LEAF_TINT = new Uint8Array(BIOMES.length * 3);
BIOMES.forEach((b, i) => {
  for (let k = 0; k < 3; k++) {
    GRASS_TINT[i * 3 + k] = Math.round(b.grassTint[k] * 255);
    LEAF_TINT[i * 3 + k] = Math.round(b.leafTint[k] * 255);
  }
});

// ---------------------------------------------------------------------------
// Growable vertex builder
// ---------------------------------------------------------------------------
class Builder {
  pos = new Float32Array(3 * 4096);
  uv = new Float32Array(2 * 4096);
  col = new Uint8Array(4 * 4096);
  lit = new Uint8Array(2 * 4096);
  idx = new Uint32Array(6 * 2048);
  vc = 0;
  ic = 0;

  reset() { this.vc = 0; this.ic = 0; }

  private grow() {
    const n = this.pos.length / 3 * 2;
    const np = new Float32Array(n * 3); np.set(this.pos); this.pos = np;
    const nu = new Float32Array(n * 2); nu.set(this.uv); this.uv = nu;
    const nc = new Uint8Array(n * 4); nc.set(this.col); this.col = nc;
    const nl = new Uint8Array(n * 2); nl.set(this.lit); this.lit = nl;
    const ni = new Uint32Array(n * 3); ni.set(this.idx); this.idx = ni;
  }

  vert(x: number, y: number, z: number, u: number, v: number, r: number, g: number, b: number, a: number, s: number, l: number) {
    if (this.vc >= this.pos.length / 3 - 1) this.grow();
    const i = this.vc++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.uv[i * 2] = u; this.uv[i * 2 + 1] = v;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.lit[i * 2] = s; this.lit[i * 2 + 1] = l;
  }

  quad(a: number, b: number, c: number, d: number, flip: boolean) {
    if (this.ic + 6 > this.idx.length) this.grow();
    const I = this.idx;
    let n = this.ic;
    if (!flip) { I[n++] = a; I[n++] = b; I[n++] = c; I[n++] = a; I[n++] = c; I[n++] = d; }
    else { I[n++] = b; I[n++] = c; I[n++] = d; I[n++] = b; I[n++] = d; I[n++] = a; }
    this.ic = n;
  }

  finish(): MeshBuffers | null {
    if (this.vc === 0) return null;
    return {
      pos: this.pos.slice(0, this.vc * 3), uv: this.uv.slice(0, this.vc * 2),
      color: this.col.slice(0, this.vc * 4), light: this.lit.slice(0, this.vc * 2),
      index: this.idx.slice(0, this.ic), vertexCount: this.vc,
    };
  }
}
const opaqueB = new Builder();
const waterB = new Builder();

// ---------------------------------------------------------------------------
// Region copy + lighting
// ---------------------------------------------------------------------------
function fillRegion(world: World, cx: number, cz: number): number {
  let maxTop = 0;
  const chunks: (Chunk | undefined)[] = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const c = world.getChunk(cx + dx, cz + dz);
    chunks.push(c);
    if (c) { const m = c.maxHeight(); if (m > maxTop) maxTop = m; }
  }
  const H = Math.min(MAXH, maxTop + 2);
  let ci = 0;
  for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++, ci++) {
    const c = chunks[ci];
    const rx0 = dx * 16;
    const rz0 = dz * 16;
    for (let lz = 0; lz < 16; lz++) {
      const rowBase = (rz0 + lz) * R + rx0;
      for (let lx = 0; lx < 16; lx++) {
        colTop[rowBase + lx] = c ? c.heightmap[lx | (lz << 4)] : 0;
      }
      if (c) {
        const blocks = c.blocks;
        for (let y = 0; y < H; y++) {
          const src = (y << 8) | (lz << 4);
          const dst = rowBase + y * RA;
          for (let lx = 0; lx < 16; lx++) rb[dst + lx] = blocks[src + lx];
        }
      } else {
        for (let y = 0; y < H; y++) { const dst = rowBase + y * RA; for (let lx = 0; lx < 16; lx++) rb[dst + lx] = 0; }
      }
    }
  }
  return H;
}

function bfs(lv: Uint8Array, H: number) {
  while (qHead !== qTail) {
    const i = queue[qHead++ & QMASK];
    const L = lv[i];
    if (L <= 1) continue;
    const y = (i / RA) | 0;
    const r = i - y * RA;
    const z = (r / R) | 0;
    const x = r - z * R;
    let n: number, a: number, nl: number;
    if (x > 0) { n = i - 1; a = LIGHT_ABSORB[rb[n]]; if (a < 15) { nl = L - 1 - a; if (nl > lv[n]) { lv[n] = nl; queue[qTail++ & QMASK] = n; } } }
    if (x < R - 1) { n = i + 1; a = LIGHT_ABSORB[rb[n]]; if (a < 15) { nl = L - 1 - a; if (nl > lv[n]) { lv[n] = nl; queue[qTail++ & QMASK] = n; } } }
    if (z > 0) { n = i - R; a = LIGHT_ABSORB[rb[n]]; if (a < 15) { nl = L - 1 - a; if (nl > lv[n]) { lv[n] = nl; queue[qTail++ & QMASK] = n; } } }
    if (z < R - 1) { n = i + R; a = LIGHT_ABSORB[rb[n]]; if (a < 15) { nl = L - 1 - a; if (nl > lv[n]) { lv[n] = nl; queue[qTail++ & QMASK] = n; } } }
    if (y > 0) { n = i - RA; a = LIGHT_ABSORB[rb[n]]; if (a < 15) { nl = L - 1 - a; if (nl > lv[n]) { lv[n] = nl; queue[qTail++ & QMASK] = n; } } }
    if (y < H - 1) { n = i + RA; a = LIGHT_ABSORB[rb[n]]; if (a < 15) { nl = L - 1 - a; if (nl > lv[n]) { lv[n] = nl; queue[qTail++ & QMASK] = n; } } }
  }
  qHead = qTail = 0;
}

function computeLight(world: World, cx: number, cz: number, H: number) {
  // Skylight: straight down each column, then flood sideways into overhangs and caves.
  for (let z = 0; z < R; z++) {
    for (let x = 0; x < R; x++) {
      const col = z * R + x;
      let level = 15;
      for (let y = H - 1; y >= 0; y--) {
        const a = LIGHT_ABSORB[rb[col + y * RA]];
        if (a >= 15) level = 0;
        else if (a > 0) level = level > a ? level - a : 0;
        sky[col + y * RA] = level;
        blk[col + y * RA] = 0;
      }
    }
  }
  // Seeds: lit cells next to a darker passable cell. Above every neighbouring column's top nothing can differ.
  for (let z = 0; z < R; z++) {
    for (let x = 0; x < R; x++) {
      const col = z * R + x;
      let top = colTop[col];
      if (x > 0 && colTop[col - 1] > top) top = colTop[col - 1];
      if (x < R - 1 && colTop[col + 1] > top) top = colTop[col + 1];
      if (z > 0 && colTop[col - R] > top) top = colTop[col - R];
      if (z < R - 1 && colTop[col + R] > top) top = colTop[col + R];
      const yMax = Math.min(H - 1, top + 1);
      for (let y = 0; y <= yMax; y++) {
        const i = col + y * RA;
        const L = sky[i];
        if (L < 2) continue;
        let seed = false;
        if (x > 0 && sky[i - 1] < L - 1 && LIGHT_ABSORB[rb[i - 1]] < 15) seed = true;
        else if (x < R - 1 && sky[i + 1] < L - 1 && LIGHT_ABSORB[rb[i + 1]] < 15) seed = true;
        else if (z > 0 && sky[i - R] < L - 1 && LIGHT_ABSORB[rb[i - R]] < 15) seed = true;
        else if (z < R - 1 && sky[i + R] < L - 1 && LIGHT_ABSORB[rb[i + R]] < 15) seed = true;
        else if (y > 0 && sky[i - RA] < L - 1 && LIGHT_ABSORB[rb[i - RA]] < 15) seed = true;
        if (seed) queue[qTail++ & QMASK] = i;
      }
    }
  }
  bfs(sky, H);

  // Block light from emitters (only scan chunks known to contain any).
  let any = false;
  for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) {
    const c = world.getChunk(cx + dx - 1, cz + dz - 1);
    if (!c || c.emitterCount === 0) continue;
    const blocks = c.blocks;
    for (let y = 0; y < H; y++) {
      for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
        const e = EMIT_LIGHT[blocks[(y << 8) | (lz << 4) | lx]];
        if (e) {
          const i = (dx * 16 + lx) + (dz * 16 + lz) * R + y * RA;
          if (e > blk[i]) { blk[i] = e; queue[qTail++ & QMASK] = i; any = true; }
        }
      }
    }
  }
  if (any) bfs(blk, H);
}

// ---------------------------------------------------------------------------
// Face tables: +X,-X,+Y,-Y,+Z,-Z ; vertex = origin + a*u + b*v (u x v = normal => CCW from outside)
// ---------------------------------------------------------------------------
const FN = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const FU = [[0, 1, 0], [0, 0, 1], [0, 0, 1], [1, 0, 0], [1, 0, 0], [0, 1, 0]];
const FV = [[0, 0, 1], [0, 1, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0], [1, 0, 0]];
const FO = [[1, 0, 0], [0, 0, 0], [0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 0, 0]];
// texture (s,t) from vertex (a,b): [sFromA?]; t must follow world-up on side faces.
const FS_FROM_A = [false, true, false, true, true, false];
const SHADE = [0.8, 0.8, 1.0, 0.5, 0.66, 0.66];
const AO_LEVEL = [0.5, 0.68, 0.84, 1.0];

const CORNER_A = [0, 1, 1, 0];
const CORNER_B = [0, 0, 1, 1];
const aoOut = [0, 0, 0, 0];
const skyOut = [0, 0, 0, 0];
const blkOut = [0, 0, 0, 0];

/** Light + AO for the 4 vertices of one face, from the cell in front of it. */
function vertexLights(rx: number, y: number, rz: number, f: number, H: number) {
  const n = FN[f], u = FU[f], v = FV[f];
  const cx = rx + n[0], cy = y + n[1], cz = rz + n[2];
  const cLight = cellLight(cx, cy, cz, H);
  const cs = cLight >> 4, cb = cLight & 15;
  for (let k = 0; k < 4; k++) {
    const du = CORNER_A[k] ? 1 : -1;
    const dv = CORNER_B[k] ? 1 : -1;
    const s1x = cx + u[0] * du, s1y = cy + u[1] * du, s1z = cz + u[2] * du;
    const s2x = cx + v[0] * dv, s2y = cy + v[1] * dv, s2z = cz + v[2] * dv;
    const o1 = isOpaqueAt(s1x, s1y, s1z, H);
    const o2 = isOpaqueAt(s2x, s2y, s2z, H);
    const kx = s1x + v[0] * dv, ky = s1y + v[1] * dv, kz = s1z + v[2] * dv;
    const oc = isOpaqueAt(kx, ky, kz, H);
    aoOut[k] = o1 && o2 ? 0 : 3 - ((o1 ? 1 : 0) + (o2 ? 1 : 0) + (oc ? 1 : 0));
    let ss = cs, bb = cb;
    const l1 = o1 ? cLight : cellLight(s1x, s1y, s1z, H);
    const l2 = o2 ? cLight : cellLight(s2x, s2y, s2z, H);
    const lc = o1 && o2 ? cLight : oc ? cLight : cellLight(kx, ky, kz, H);
    ss += (l1 >> 4) + (l2 >> 4) + (lc >> 4);
    bb += (l1 & 15) + (l2 & 15) + (lc & 15);
    skyOut[k] = ss / 4;
    blkOut[k] = bb / 4;
  }
}

function cellLight(x: number, y: number, z: number, H: number): number {
  if (y >= H) return 0xf0;
  if (y < 0) return 0;
  const i = x + z * R + y * RA;
  return (sky[i] << 4) | blk[i];
}
function isOpaqueAt(x: number, y: number, z: number, H: number): boolean {
  if (y >= H) return false;
  if (y < 0) return true;
  return IS_OPAQUE[rb[x + z * R + y * RA]] === 1;
}

// ---------------------------------------------------------------------------
// Meshing
// ---------------------------------------------------------------------------
export function buildChunkMesh(world: World, chunk: Chunk): ChunkMeshData {
  const cx = chunk.cx, cz = chunk.cz;
  const H = fillRegion(world, cx, cz);
  computeLight(world, cx, cz, H);

  // Persist center light for gameplay queries (mob spawning, debug, entity shading).
  if (!chunk.light) chunk.light = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
  const out = chunk.light;
  out.fill(0xf0, H << 8);
  for (let y = 0; y < H; y++) {
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const i = (lx + 16) + (lz + 16) * R + y * RA;
      out[(y << 8) | (lz << 4) | lx] = (sky[i] << 4) | blk[i];
    }
  }

  opaqueB.reset();
  waterB.reset();
  let faces = 0;
  const maxY = Math.min(H - 1, chunk.maxHeight());
  for (let y = 0; y <= maxY; y++) {
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const rx = lx + 16, rz = lz + 16;
        const id = rb[rx + rz * R + y * RA];
        if (id === B.AIR) continue;
        const shape = SHAPE[id];
        if (shape === 2) { faces += emitTorch(lx, y, lz, rx, rz, H); continue; }
        for (let f = 0; f < 6; f++) {
          const n = FN[f];
          const nx = rx + n[0], ny = y + n[1], nz = rz + n[2];
          let nb: number;
          if (ny < 0) continue;
          else if (ny >= H) nb = B.AIR;
          else nb = rb[nx + nz * R + ny * RA];
          if (IS_OPAQUE[nb] || (CULL_SAME[id] && nb === id)) continue;
          if (shape === 1) { if (nb === B.WATER) continue; emitWater(lx, y, lz, rx, rz, f, H); }
          else emitFace(lx, y, lz, rx, rz, id, f, H, chunk.biomes[lx | (lz << 4)]);
          faces++;
        }
      }
    }
  }
  return { opaque: opaqueB.finish(), water: waterB.finish(), faces, maxY };
}

function emitFace(lx: number, y: number, lz: number, rx: number, rz: number, id: number, f: number, H: number, biome: number) {
  vertexLights(rx, y, rz, f, H);
  const o = FO[f], u = FU[f], v = FV[f];
  const uvBase = (id * 6 + f) * 4;
  const u0 = uvTable[uvBase], v0 = uvTable[uvBase + 1], u1 = uvTable[uvBase + 2], v1 = uvTable[uvBase + 3];
  // Biome tint: grass tints only its top face; leaves tint every face.
  let tr = 255, tg = 255, tb = 255;
  const tk = TINT[id];
  if ((tk === 1 && f === 2) || tk === 2) {
    const t = tk === 1 ? GRASS_TINT : LEAF_TINT;
    tr = t[biome * 3]; tg = t[biome * 3 + 1]; tb = t[biome * 3 + 2];
  }
  const b = opaqueB;
  const base = b.vc;
  const shade = SHADE[f];
  for (let k = 0; k < 4; k++) {
    const a = CORNER_A[k], bb = CORNER_B[k];
    const s = FS_FROM_A[f] ? a : bb;
    const t = FS_FROM_A[f] ? bb : a;
    b.vert(
      lx + o[0] + u[0] * a + v[0] * bb, y + o[1] + u[1] * a + v[1] * bb, lz + o[2] + u[2] * a + v[2] * bb,
      u0 + (u1 - u0) * s, v0 + (v1 - v0) * t,
      tr, tg, tb, Math.round(shade * AO_LEVEL[aoOut[k]] * 255),
      Math.round(skyOut[k] * 17), Math.round(blkOut[k] * 17),
    );
  }
  b.quad(base, base + 1, base + 2, base + 3, aoOut[0] + aoOut[2] < aoOut[1] + aoOut[3]);
}

const WATER_TOP = 14 / 16;
function emitWater(lx: number, y: number, lz: number, rx: number, rz: number, f: number, H: number) {
  const aboveWater = y + 1 < H && rb[rx + rz * R + (y + 1) * RA] === B.WATER;
  const o = FO[f], u = FU[f], v = FV[f];
  const uvBase = (B.WATER * 6 + f) * 4;
  const u0 = uvTable[uvBase], v0 = uvTable[uvBase + 1], u1 = uvTable[uvBase + 2], v1 = uvTable[uvBase + 3];
  const n = FN[f];
  const cl = cellLight(rx + n[0], y + n[1], rz + n[2], H);
  const own = cellLight(rx, y, rz, H);
  const s = Math.max(cl >> 4, own >> 4) * 17, l = Math.max(cl & 15, own & 15) * 17;
  const b = waterB;
  const base = b.vc;
  const shade = SHADE[f];
  for (let k = 0; k < 4; k++) {
    const a = CORNER_A[k], bb = CORNER_B[k];
    let py = o[1] + u[1] * a + v[1] * bb;
    if (!aboveWater && py === 1) py = WATER_TOP;
    const sS = FS_FROM_A[f] ? a : bb;
    const tT = FS_FROM_A[f] ? bb : a;
    b.vert(lx + o[0] + u[0] * a + v[0] * bb, y + py, lz + o[2] + u[2] * a + v[2] * bb,
      u0 + (u1 - u0) * sS, v0 + (v1 - v0) * tT, 255, 255, 255, Math.round(shade * 255), s, l);
  }
  b.quad(base, base + 1, base + 2, base + 3, false);
}

const TW = 2 / 16, TH = 10 / 16;
function emitTorch(lx: number, y: number, lz: number, _rx: number, _rz: number, _H: number): number {
  const x0 = lx + 0.5 - TW / 2, x1 = lx + 0.5 + TW / 2, z0 = lz + 0.5 - TW / 2, z1 = lz + 0.5 + TW / 2, y1 = y + TH;
  const b = opaqueB;
  const sd = torchUV.side, tp = torchUV.top;
  const quads: Array<[number[], number[], number[], number[], number[], number]> = [
    [[x1, y, z0], [x1, y, z1], [x1, y1, z1], [x1, y1, z0], sd, 0.8],
    [[x0, y, z1], [x0, y, z0], [x0, y1, z0], [x0, y1, z1], sd, 0.8],
    [[x1, y, z1], [x0, y, z1], [x0, y1, z1], [x1, y1, z1], sd, 0.66],
    [[x0, y, z0], [x1, y, z0], [x1, y1, z0], [x0, y1, z0], sd, 0.66],
    [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], tp, 1.0],
  ];
  for (const [p0, p1, p2, p3, uvr, shade] of quads) {
    const base = b.vc;
    const a = Math.round(shade * 255);
    b.vert(p0[0], p0[1], p0[2], uvr[0], uvr[1], 255, 255, 255, a, 0, 255);
    b.vert(p1[0], p1[1], p1[2], uvr[2], uvr[1], 255, 255, 255, a, 0, 255);
    b.vert(p2[0], p2[1], p2[2], uvr[2], uvr[3], 255, 255, 255, a, 0, 255);
    b.vert(p3[0], p3[1], p3[2], uvr[0], uvr[3], 255, 255, 255, a, 0, 255);
    b.quad(base, base + 1, base + 2, base + 3, false);
  }
  return 5;
}

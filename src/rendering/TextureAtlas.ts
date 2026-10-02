import * as THREE from 'three';
import { mulberry32 } from '../utilities/Random';
import { allBlockTextureNames, getBlockDef } from '../world/BlockRegistry';
import { BIOMES } from '../world/Biomes';
import { I, getItemDef } from '../items/ItemRegistry';

// Every texture is generated in code, so the game ships with zero external art.

const TILE = 16;
const GRID = 8; // 8x8 tiles = 128x128 atlas

type RGB = [number, number, number];
type Painter = (p: Pixels) => void;

class Pixels {
  data: ImageData;
  rng: () => number;
  constructor(seed: number) {
    this.data = new ImageData(TILE, TILE);
    this.rng = mulberry32(seed);
  }
  set(x: number, y: number, c: RGB, a = 255) {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const i = (y * TILE + x) * 4;
    this.data.data[i] = c[0]; this.data.data[i + 1] = c[1]; this.data.data[i + 2] = c[2]; this.data.data[i + 3] = a;
  }
  fill(c: RGB, jitter = 0) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) this.set(x, y, this.jit(c, jitter));
  }
  jit(c: RGB, j: number): RGB {
    const d = (this.rng() - 0.5) * 2 * j;
    return [clamp8(c[0] + d), clamp8(c[1] + d), clamp8(c[2] + d)];
  }
  rect(x0: number, y0: number, w: number, h: number, c: RGB, jitter = 0) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, this.jit(c, jitter));
  }
  get(x: number, y: number): RGB { const i = (y * TILE + x) * 4; return [this.data.data[i], this.data.data[i + 1], this.data.data[i + 2]]; }
}
const clamp8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

function speckle(p: Pixels, count: number, c: RGB, size = 1) {
  for (let i = 0; i < count; i++) p.rect(Math.floor(p.rng() * TILE), Math.floor(p.rng() * TILE), size, size, c, 8);
}

function oreTile(p: Pixels, color: RGB) {
  stone(p);
  for (let b = 0; b < 5; b++) {
    const bx = 1 + Math.floor(p.rng() * 12), by = 1 + Math.floor(p.rng() * 12);
    p.rect(bx, by, 2, 2, color, 14);
    if (p.rng() < 0.6) p.set(bx + 2, by + 1, color);
  }
}

function stone(p: Pixels) {
  p.fill([125, 125, 128], 14);
  speckle(p, 14, [96, 96, 100]);
  speckle(p, 8, [150, 150, 152]);
}

const PAINTERS: Record<string, Painter> = {
  stone,
  dirt: (p) => { p.fill([121, 85, 58], 12); speckle(p, 16, [95, 66, 44]); speckle(p, 8, [146, 104, 72]); },
  grass_top: (p) => { p.fill([170, 200, 150], 12); speckle(p, 20, [140, 175, 120]); speckle(p, 10, [195, 222, 170]); },
  grass_side: (p) => {
    PAINTERS.dirt(p);
    for (let x = 0; x < TILE; x++) {
      const d = 3 + Math.floor(p.rng() * 3);
      for (let y = 0; y < d; y++) p.set(x, y, p.jit([100, 160, 62], 14));
    }
  },
  sand: (p) => { p.fill([219, 205, 148], 9); speckle(p, 18, [199, 183, 128]); speckle(p, 8, [236, 224, 170]); },
  gravel: (p) => { p.fill([128, 122, 120], 16); for (let i = 0; i < 16; i++) p.rect(Math.floor(p.rng() * 15), Math.floor(p.rng() * 15), 2, 2, [92 + p.rng() * 70, 88 + p.rng() * 60, 86 + p.rng() * 60].map(Math.round) as RGB); },
  snow: (p) => { p.fill([243, 247, 252], 6); speckle(p, 10, [222, 232, 246]); },
  snow_side: (p) => {
    PAINTERS.dirt(p);
    for (let x = 0; x < TILE; x++) {
      const d = 4 + Math.floor(p.rng() * 3);
      for (let y = 0; y < d; y++) p.set(x, y, p.jit([243, 247, 252], 5));
    }
  },
  log_side: (p) => {
    for (let x = 0; x < TILE; x++) {
      const stripe = x % 4 === 0 ? -22 : x % 4 === 2 ? 10 : 0;
      for (let y = 0; y < TILE; y++) p.set(x, y, p.jit([104 + stripe, 78 + stripe, 48 + stripe], 6));
    }
    speckle(p, 8, [70, 50, 30]);
  },
  log_top: (p) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const ring = Math.floor(d) % 2 === 0;
      p.set(x, y, p.jit(d > 6.5 ? [86, 62, 38] : ring ? [176, 140, 88] : [150, 114, 68], 5));
    }
  },
  planks: (p) => {
    p.fill([178, 140, 86], 8);
    for (let y = 0; y < TILE; y++) if (y % 4 === 3) for (let x = 0; x < TILE; x++) p.set(x, y, p.jit([128, 96, 56], 5));
    for (let b = 0; b < 4; b++) { const x = (b * 7 + 3) % TILE; p.set(x, b * 4 + 1, [140, 106, 64]); p.set(x, b * 4 + 2, [140, 106, 64]); }
  },
  leaves: (p) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const r = p.rng();
      if (r < 0.2) p.set(x, y, [0, 0, 0], 0);
      else p.set(x, y, p.jit([190, 210, 175], 28));
    }
  },
  glass: (p) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      if (edge) p.set(x, y, [200, 230, 240], 255);
      else if ((x + y === 6 || x + y === 7 || x + y === 11) && x > 2 && y > 2) p.set(x, y, [235, 248, 255], 200);
      else p.set(x, y, [190, 225, 240], 38);
    }
  },
  water: (p) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const w = Math.sin(x * 0.9) * Math.cos(y * 0.7) * 12;
      p.set(x, y, p.jit([52 + w, 108 + w, 200 + w * 0.5], 5), 190);
    }
  },
  bricks: (p) => {
    p.fill([158, 78, 62], 10);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const row = Math.floor(y / 4);
      const off = row % 2 ? 4 : 0;
      if (y % 4 === 3 || (x + off) % 8 === 0) p.set(x, y, p.jit([196, 190, 180], 6));
    }
  },
  cobble: (p) => {
    p.fill([100, 100, 104], 8);
    // Voronoi-ish rounded stones.
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 9; i++) pts.push([p.rng() * 16, p.rng() * 16]);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      let d1 = 99, d2 = 99, k = 0;
      pts.forEach(([px, py], i) => {
        const dx = Math.min(Math.abs(x - px), 16 - Math.abs(x - px)), dy = Math.min(Math.abs(y - py), 16 - Math.abs(y - py));
        const d = Math.hypot(dx, dy);
        if (d < d1) { d2 = d1; d1 = d; k = i; } else if (d < d2) d2 = d;
      });
      if (d2 - d1 < 1.1) p.set(x, y, [70, 70, 74]);
      else { const v = 122 + (k % 3) * 14; p.set(x, y, p.jit([v, v, v + 3], 8)); }
    }
  },
  bedrock: (p) => { p.fill([58, 58, 62], 16); speckle(p, 22, [30, 30, 34]); speckle(p, 10, [88, 88, 92]); },
  coal_ore: (p) => oreTile(p, [34, 34, 38]),
  iron_ore: (p) => oreTile(p, [214, 168, 134]),
  gold_ore: (p) => oreTile(p, [250, 216, 60]),
  diamond_ore: (p) => oreTile(p, [88, 226, 232]),
  cactus_side: (p) => {
    for (let x = 0; x < TILE; x++) for (let y = 0; y < TILE; y++) {
      const edge = x === 0 || x === 15;
      p.set(x, y, p.jit(edge ? [30, 90, 40] : x % 4 === 2 ? [60, 150, 66] : [48, 128, 56], 5));
    }
    for (let i = 0; i < 10; i++) p.set(2 + Math.floor(p.rng() * 12), Math.floor(p.rng() * 16), [230, 230, 190]);
  },
  cactus_top: (p) => { p.fill([52, 138, 60], 6); p.rect(2, 2, 12, 12, [66, 160, 72], 5); p.rect(5, 5, 6, 6, [40, 112, 50], 5); },
  torch: (p) => {
    // Transparent background; stick in the lower 10 rows, flame on top.
    p.rect(7, 8, 2, 8, [176, 128, 72], 8);
    p.rect(7, 6, 2, 2, [255, 236, 130]);
    p.set(7, 6, [255, 150, 40]); p.set(8, 7, [255, 170, 50]);
  },
};

export interface AtlasInfo {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  uv: (name: string) => [number, number, number, number];
  torch: { side: number[]; top: number[] };
  crackTextures: THREE.CanvasTexture[];
}

let atlas: AtlasInfo | null = null;
const avgCache = new Map<string, [number, number, number]>();

/** Average opaque colour of a tile (0..1), used for break particles. */
export function tileAverageColor(name: string): [number, number, number] {
  const hit = avgCache.get(name);
  if (hit) return hit;
  const a = buildAtlas();
  const [u0, , , v1] = a.uv(name);
  const sx = Math.round(u0 * TILE * GRID), sy = Math.round((1 - v1) * TILE * GRID);
  const d = a.canvas.getContext('2d')!.getImageData(sx, sy, TILE - 1, TILE - 1).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 100) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  const out: [number, number, number] = n ? [r / n / 255, g / n / 255, b / n / 255] : [0.5, 0.5, 0.5];
  avgCache.set(name, out);
  return out;
}

export function buildAtlas(): AtlasInfo {
  if (atlas) return atlas;
  const names = allBlockTextureNames();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE * GRID;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const index = new Map<string, number>();
  names.forEach((name, i) => {
    index.set(name, i);
    const p = new Pixels(1000 + i * 31);
    (PAINTERS[name] ?? PAINTERS.stone)(p);
    ctx.putImageData(p.data, (i % GRID) * TILE, Math.floor(i / GRID) * TILE);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  const half = 0.02 / GRID; // small inset to stop neighbouring tiles bleeding in
  const uv = (name: string): [number, number, number, number] => {
    const i = index.get(name) ?? 0;
    const col = i % GRID, row = Math.floor(i / GRID);
    return [col / GRID + half, 1 - (row + 1) / GRID + half, (col + 1) / GRID - half, 1 - row / GRID - half];
  };
  // Torch regions: stick+flame columns 7..8, rows 6..15 (canvas rows from the top).
  const ti = index.get('torch')!;
  const tc = ti % GRID, tr = Math.floor(ti / GRID);
  const px = (c: number) => (tc * TILE + c) / (TILE * GRID);
  const py = (r: number) => 1 - (tr * TILE + r) / (TILE * GRID);
  const torch = {
    side: [px(7), py(16), px(9), py(6)],
    top: [px(7), py(7), px(9), py(6)],
  };
  atlas = { texture, canvas, uv, torch, crackTextures: buildCracks() };
  return atlas;
}

function buildCracks(): THREE.CanvasTexture[] {
  const out: THREE.CanvasTexture[] = [];
  const rng = mulberry32(4242);
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const ctx = c.getContext('2d')!;
  const filled = new Set<number>();
  for (let stage = 0; stage < 10; stage++) {
    // Each stage adds more dark pixels, mimicking spreading cracks.
    for (let k = 0; k < 14 + stage * 3; k++) filled.add(Math.floor(rng() * 256));
    const img = new ImageData(TILE, TILE);
    filled.forEach((i) => { img.data[i * 4 + 3] = 150; });
    ctx.putImageData(img, 0, 0);
    const copy = document.createElement('canvas');
    copy.width = copy.height = TILE;
    copy.getContext('2d')!.drawImage(c, 0, 0);
    const t = new THREE.CanvasTexture(copy);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Item icons (UI, dropped item sprites)
// ---------------------------------------------------------------------------
const iconCache = new Map<number, string>();

const TIER_COLORS: Record<number, RGB> = { 1: [176, 140, 86], 2: [140, 140, 146], 3: [225, 225, 232], 4: [90, 230, 230] };

function paintItem(id: number): Pixels {
  const p = new Pixels(id * 77);
  const line = (x0: number, y0: number, x1: number, y1: number, c: RGB, thick = 1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
      for (let t = 0; t < thick; t++) p.set(x + t, y, p.jit(c, 6));
    }
  };
  const tool = getItemDef(id)?.tool;
  if (tool) {
    line(2, 14, 10, 6, [120, 84, 46], 2);
    const hc = TIER_COLORS[tool.tier];
    const dark: RGB = [hc[0] * 0.7, hc[1] * 0.7, hc[2] * 0.7].map(Math.round) as RGB;
    const pts: Array<[number, number]> = [[4, 5], [5, 4], [6, 3], [7, 2], [8, 2], [9, 2], [10, 3], [11, 4], [12, 5], [13, 6], [13, 7], [12, 8], [6, 4], [7, 3], [8, 3], [9, 3], [10, 4], [11, 5], [12, 6], [12, 7]];
    pts.forEach(([x, y], i) => p.set(x, y, i < 12 ? p.jit(hc, 8) : dark));
    return p;
  }
  switch (id) {
    case I.STICK: line(3, 13, 12, 4, [128, 92, 52], 2); break;
    case I.COAL: p.rect(4, 5, 8, 7, [38, 38, 42], 6); p.rect(5, 4, 6, 9, [44, 44, 48], 6); p.rect(6, 6, 2, 2, [90, 90, 100]); break;
    case I.IRON_INGOT: case I.GOLD_INGOT: {
      const c: RGB = id === I.IRON_INGOT ? [214, 214, 222] : [250, 210, 60];
      p.rect(3, 7, 10, 5, c, 6); p.rect(5, 5, 8, 3, [Math.min(255, c[0] + 20), Math.min(255, c[1] + 20), Math.min(255, c[2] + 20)], 4);
      p.rect(3, 11, 10, 1, [c[0] * 0.7, c[1] * 0.7, c[2] * 0.7].map(Math.round) as RGB); break;
    }
    case I.DIAMOND:
      p.rect(5, 4, 6, 2, [140, 245, 245]); p.rect(3, 6, 10, 3, [90, 225, 232], 6); p.rect(4, 9, 8, 2, [60, 190, 205]); p.rect(6, 11, 4, 2, [44, 160, 180]); p.rect(6, 5, 2, 2, [230, 255, 255]); break;
    case I.MEAT:
      p.rect(4, 4, 8, 7, [196, 96, 92], 8); p.rect(5, 5, 5, 4, [226, 128, 120], 6); p.rect(10, 10, 4, 2, [235, 225, 205]); p.rect(12, 9, 2, 2, [235, 225, 205]); break;
    default: p.rect(4, 4, 8, 8, [200, 0, 200]);
  }
  return p;
}

/** Data-URL icon for an item id: iso cube for blocks, painted sprite for items. */
export function getItemIcon(id: number): string {
  const cached = iconCache.get(id);
  if (cached) return cached;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const def = getItemDef(id);
  if (def?.blockId !== undefined) {
    c.width = c.height = 32;
    ctx.imageSmoothingEnabled = false;
    const a = buildAtlas();
    const b = getBlockDef(def.blockId);
    const tile = (name: string) => {
      const [u0, , , v1] = a.uv(name);
      return [Math.round(u0 * TILE * GRID - 0.02 * TILE), Math.round((1 - v1) * TILE * GRID - 0.02 * TILE)];
    };
    const draw = (name: string, m: number[], shade: number, tint?: RGB) => {
      const [sx, sy] = tile(name);
      ctx.save();
      ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx.drawImage(a.canvas, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
      if (tint) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},0.6)`; ctx.fillRect(0, 0, TILE, TILE); }
      if (shade > 0) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = `rgba(0,0,0,${shade})`; ctx.fillRect(0, 0, TILE, TILE); }
      ctx.restore();
    };
    if (b.shape === 'torch') {
      // Torches read better as a flat sprite.
      const [sx, sy] = tile('torch');
      ctx.drawImage(a.canvas, sx, sy, TILE, TILE, 4, 4, 24, 24);
    } else {
      const tint: RGB | undefined = b.tint === 'grass' ? BIOMES[0].grassTint.map((v) => Math.round(v * 255)) as RGB : b.tint === 'leaves' ? BIOMES[1].leafTint.map((v) => Math.round(v * 255)) as RGB : undefined;
      draw(b.tex.top, [1, 0.5, -1, 0.5, 16, 0], 0, b.tint === 'leaves' ? tint : b.tint === 'grass' ? tint : undefined);
      draw(b.tex.side, [1, 0.5, 0, 1, 0, 8], 0.22, b.tint === 'leaves' ? tint : undefined);
      draw(b.tex.side, [1, -0.5, 0, 1, 16, 16], 0.42, b.tint === 'leaves' ? tint : undefined);
    }
  } else {
    c.width = c.height = TILE;
    ctx.putImageData(paintItem(id).data, 0, 0);
  }
  const url = c.toDataURL();
  iconCache.set(id, url);
  return url;
}

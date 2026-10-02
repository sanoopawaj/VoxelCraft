// World generation: the seeded overworld (regions, gates, resources, spawns) and procedural dungeons.
(function (root) {
  'use strict';
  const GF = root.GF;
  const U = GF.util;

  // tile ids
  const T = { VOID: 0, GRASS: 1, DIRT: 2, ROCK: 3, FOREST: 4, SNOW: 5, ASH: 6, RUIN: 7, GIANT: 8, WATER: 9, CLIFF: 10, PATH: 11, LAVA: 12, ICE: 13, GATE: 14,
    DFLOOR: 20, DWALL: 21, DARENA: 22, DSEAL: 23, DSTAIRS: 24, DLAVA: 25 };
  const SOLID = new Uint8Array(64);
  [T.VOID, T.WATER, T.CLIFF, T.GATE, T.DWALL, T.DSEAL].forEach((t) => { SOLID[t] = 1; });
  const FLOOR_TILE = { grass: T.GRASS, rock: T.ROCK, forest: T.FOREST, snow: T.SNOW, ash: T.ASH, ruin: T.RUIN, giant: T.GIANT };

  function cellKey(x, y) { return (Math.floor(x / 4)) + ',' + (Math.floor(y / 4)); }

  /** Build the overworld deterministically from the seed. */
  function genOverworld(seed) {
    const W = GF.MAP_W, H = GF.MAP_H;
    const tiles = new Uint8Array(W * H);
    const reg = new Int8Array(W * H).fill(-1);
    const names = Object.keys(GF.REGIONS);
    const r = U.rng(seed);
    // 1. floors
    names.forEach((n, ri) => {
      const [x0, y0, x1, y1] = GF.REGIONS[n].rect;
      const base = FLOOR_TILE[GF.REGIONS[n].floor];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        reg[y * W + x] = ri;
        tiles[y * W + x] = base;
        const v = U.fbm(seed + ri * 13, x * 0.12, y * 0.12, 3);
        if (n === 'greenlands' && v > 0.62) tiles[y * W + x] = T.DIRT;
        if (n === 'stone' && v > 0.6) tiles[y * W + x] = T.DIRT;
        if (n === 'forest' && v > 0.62) tiles[y * W + x] = T.DIRT;
        if (n === 'frozen' && v > 0.6) tiles[y * W + x] = T.ICE;
        if (n === 'ember' && v > 0.6) tiles[y * W + x] = T.DIRT;
      }
    });
    // 2. walls where regions meet (or meet the void)
    const wall = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const id = reg[y * W + x];
      if (id < 0) { tiles[y * W + x] = T.VOID; continue; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        const nid = nx < 0 || ny < 0 || nx >= W || ny >= H ? -1 : reg[ny * W + nx];
        if (nid !== id) { wall[y * W + x] = 1; break; }
      }
    }
    for (let i = 0; i < W * H; i++) if (wall[i]) tiles[i] = T.CLIFF;
    // 3. gates
    const gates = {};
    for (const g in GF.GATES) {
      const [gx, gy, gw, gh] = GF.GATES[g].rect;
      gates[g] = { cells: [] };
      for (let y = gy; y < gy + gh; y++) for (let x = gx; x < gx + gw; x++) { tiles[y * W + x] = T.GATE; gates[g].cells.push([x, y]); }
    }
    // 4. water / lava / mesas (kept away from settlement + gates)
    const safe = (x, y) => U.dist(x, y, GF.HOME.x, GF.HOME.y) < 17 || Object.values(GF.GATES).some((g) => U.dist(x, y, g.rect[0] + g.rect[2] / 2, g.rect[1] + g.rect[3] / 2) < 8);
    names.forEach((n, ri) => {
      const [x0, y0, x1, y1] = GF.REGIONS[n].rect;
      for (let y = y0 + 2; y < y1 - 2; y++) for (let x = x0 + 2; x < x1 - 2; x++) {
        if (safe(x, y) || tiles[y * W + x] === T.CLIFF || tiles[y * W + x] === T.GATE) continue;
        const v = U.fbm(seed + 999 + ri * 7, x * 0.07, y * 0.07, 3);
        if (v > 0.66) tiles[y * W + x] = n === 'ember' ? T.LAVA : n === 'giant' ? T.CLIFF : T.WATER;
        else if (n !== 'greenlands' && v < 0.2 && U.hash2(seed + 5, x, y) < 0.5 && n !== 'ruins') tiles[y * W + x] = T.CLIFF; // crags
      }
    });
    // clear a 3-tile approach on both sides of every gate
    for (const g in GF.GATES) {
      const [gx, gy, gw, gh] = GF.GATES[g].rect;
      for (let y = gy - 3; y < gy + gh + 3; y++) for (let x = gx - 3; x < gx + gw + 3; x++) {
        const t = tiles[y * W + x];
        if (t === T.WATER || t === T.LAVA || (t === T.CLIFF && reg[y * W + x] >= 0 && !wall[y * W + x])) tiles[y * W + x] = FLOOR_TILE[GF.REGIONS[names[reg[y * W + x]]].floor];
      }
    }
    // 5. settlement ground: grass + paths
    for (let y = GF.HOME.y - 14; y <= GF.HOME.y + 14; y++) for (let x = GF.HOME.x - 14; x <= GF.HOME.x + 14; x++) {
      if (reg[y * W + x] !== 0) continue;
      const d = U.dist(x, y, GF.HOME.x, GF.HOME.y);
      if (d < 14) tiles[y * W + x] = T.GRASS;
    }
    for (let x = 86; x <= 105; x++) { tiles[67 * W + x] = T.PATH; tiles[68 * W + x] = T.PATH; }
    for (let y = 66; y <= 79; y++) { tiles[y * W + 95] = T.PATH; tiles[y * W + 96] = T.PATH; }
    for (let y = 78; y <= 79; y++) for (let x = 94; x <= 97; x++) tiles[y * W + x] = T.PATH;

    const solidAt = (x, y) => x < 0 || y < 0 || x >= W || y >= H || SOLID[tiles[Math.floor(y) * W + Math.floor(x)]];
    const free = (x, y, pad) => {
      for (let dy = -pad; dy <= pad; dy++) for (let dx = -pad; dx <= pad; dx++) {
        const t = tiles[Math.floor(y + dy) * W + Math.floor(x + dx)];
        if (SOLID[t] || t === T.LAVA) return false;
      }
      return true;
    };
    // 6. resource nodes (clustered; positions depend on the seed => different worlds each playthrough)
    const nodes = [];
    const grid = new Map();
    const addNode = (type, x, y, extra) => {
      const nd = GF.NODES[type];
      const node = Object.assign({ id: nodes.length, type, x, y, hp: nd.hp, max: nd.hp, rich: false, dead: false }, extra || {});
      nodes.push(node);
      const k = cellKey(x, y);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(node);
      return node;
    };
    const occupied = [];
    const spotOk = (x, y, minD) => {
      for (const o of occupied) if (Math.abs(o[0] - x) < minD && Math.abs(o[1] - y) < minD && U.dist(o[0], o[1], x, y) < minD) return false;
      return true;
    };
    const nr = U.rng(seed ^ 0xabcdef);
    const homeBuffer = (x, y) => x > 82 && x < 108 && y > 62 && y < 90; // keep the settlement area clear
    names.forEach((n) => {
      const [x0, y0, x1, y1] = GF.REGIONS[n].rect;
      const wild = GF.WILD[n];
      for (const type in wild) {
        const count = wild[type];
        const groves = Math.max(1, Math.ceil(count / (type === 'tree' || type === 'darktree' || type === 'frosttree' ? 14 : 6)));
        const centers = [];
        for (let i = 0; i < groves; i++) centers.push([x0 + 4 + nr() * (x1 - x0 - 8), y0 + 4 + nr() * (y1 - y0 - 8)]);
        let placed = 0, tries = 0;
        while (placed < count && tries++ < count * 60) {
          const c = centers[Math.floor(nr() * centers.length)];
          const x = c[0] + (nr() + nr() + nr() - 1.5) * 7, y = c[1] + (nr() + nr() + nr() - 1.5) * 7;
          if (x < x0 + 3 || x > x1 - 3 || y < y0 + 3 || y > y1 - 3) continue;
          if (n === 'greenlands' && homeBuffer(x, y)) continue;
          const xi = Math.floor(x) + 0.5, yi = Math.floor(y) + 0.5;
          if (!free(xi, yi, 0) || !spotOk(xi, yi, 1.4)) continue;
          if (safe(xi, yi) && !(n === 'greenlands')) { /* near gates: stay clear */ if (Object.values(GF.GATES).some((g) => U.dist(xi, yi, g.rect[0] + g.rect[2] / 2, g.rect[1] + g.rect[3] / 2) < 6)) continue; }
          const node = addNode(type, xi, yi, { rich: nr() < 0.05, region: n });
          occupied.push([xi, yi]);
          placed++;
        }
      }
    });
    // 7. enemy spawn points
    const spawns = [];
    names.forEach((n) => {
      const [x0, y0, x1, y1] = GF.REGIONS[n].rect;
      const list = GF.REGION_ENEMIES[n];
      for (const type in list) {
        let placed = 0, tries = 0;
        while (placed < list[type] && tries++ < 4000) {
          const x = x0 + 4 + nr() * (x1 - x0 - 8), y = y0 + 4 + nr() * (y1 - y0 - 8);
          if (!free(x, y, 1)) continue;
          if (n === 'greenlands' && U.dist(x, y, GF.HOME.x, GF.HOME.y) < 22) continue;
          if (Object.values(GF.GATES).some((g) => U.dist(x, y, g.rect[0] + g.rect[2] / 2, g.rect[1] + g.rect[3] / 2) < 9)) continue;
          spawns.push({ type, x, y, region: n });
          placed++;
        }
      }
    });
    // 8. dungeon portals (deep in each region, far from its entrance)
    const portals = [];
    const entranceOf = (n) => {
      const g = Object.values(GF.GATES).find((q) => GF.REGIONS[n] && q.label && GF.GATES[n] && GF.GATES[n].rect === q.rect);
      return GF.GATES[n] ? [GF.GATES[n].rect[0], GF.GATES[n].rect[1]] : [GF.HOME.x, GF.HOME.y];
    };
    for (const did in GF.DUNGEONS) {
      const d = GF.DUNGEONS[did];
      const [x0, y0, x1, y1] = GF.REGIONS[d.region].rect;
      const ent = entranceOf(d.region);
      let best = null;
      for (let i = 0; i < 80; i++) {
        const x = x0 + 8 + nr() * (x1 - x0 - 16), y = y0 + 8 + nr() * (y1 - y0 - 16);
        if (!free(x, y, 2) || !spotOk(x, y, 3)) continue;
        if (d.region === 'greenlands' && (homeBuffer(x, y) || U.dist(x, y, GF.HOME.x, GF.HOME.y) < 24)) continue;
        const dd = U.dist(x, y, ent[0], ent[1]) + nr() * 8;
        if (!best || dd > best.d) best = { x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5, d: dd };
      }
      if (!best) best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
      portals.push({ dungeon: did, x: best.x, y: best.y, region: d.region });
      occupied.push([best.x, best.y]);
      // clear nodes in the way
      for (const nd of nodes) if (U.dist(nd.x, nd.y, best.x, best.y) < 2.5) { nd.dead = true; nd.perm = true; }
    }
    // 9. lore tablets + portal stones
    const tablets = [];
    for (const t of GF.TABLETS) {
      const [x0, y0, x1, y1] = GF.REGIONS[t.region].rect;
      for (let i = 0; i < 1500; i++) {
        const x = x0 + 5 + nr() * (x1 - x0 - 10), y = y0 + 5 + nr() * (y1 - y0 - 10);
        if (!free(x, y, 1) || !spotOk(x, y, 1.5)) continue;
        if (t.region === 'greenlands' && (homeBuffer(x, y) || U.dist(x, y, GF.HOME.x, GF.HOME.y) < 18)) continue;
        tablets.push({ id: t.id, x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5, region: t.region });
        occupied.push([x, y]);
        break;
      }
    }
    const stones = [];
    for (const g in GF.GATES) {
      const [gx, gy, gw, gh] = GF.GATES[g].rect;
      // the portal stone sits just inside the new region
      const vertical = gw === 2; // a wall running north-south: travel is west->east
      const dx = vertical ? 4 : 0, dy = vertical ? 0 : (GF.REGIONS[g].rect[1] < gy ? -4 : 4);
      const sx = gx + gw / 2 + (vertical ? dx : -1.5), sy = gy + gh / 2 + (vertical ? 0 : dy);
      // try positions toward the region interior
      const rect = GF.REGIONS[g].rect;
      const ix = U.clamp(sx, rect[0] + 3, rect[2] - 3), iy = U.clamp(sy, rect[1] + 3, rect[3] - 3);
      stones.push({ region: g, x: Math.floor(ix) + 0.5, y: Math.floor(iy) + 0.5 });
    }
    return { W, H, tiles, reg, nodes, nodeGrid: grid, spawns, portals, tablets, stones, gates, names, solidAt, kind: 'over' };
  }

  function regionAt(world, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= world.W || yi >= world.H) return null;
    const id = world.reg[yi * world.W + xi];
    return id < 0 ? null : world.names[id];
  }
  function gateOpen(S, g) { return !!S.unlocked[g]; }
  /** Opened gates become paths; closed ones are solid. Called after load / unlock. */
  function applyGates(world, S) {
    for (const g in world.gates) {
      const open = gateOpen(S, g);
      for (const [x, y] of world.gates[g].cells) world.tiles[y * world.W + x] = open ? T.PATH : T.GATE;
    }
    world.version = (world.version || 0) + 1;
  }
  function nodesNear(world, x, y, r) {
    const out = [];
    const cx = Math.floor(x / 4), cy = Math.floor(y / 4), rr = Math.ceil(r / 4);
    for (let j = -rr; j <= rr; j++) for (let i = -rr; i <= rr; i++) {
      const l = world.nodeGrid.get((cx + i) + ',' + (cy + j));
      if (l) for (const n of l) out.push(n);
    }
    return out;
  }
  function tileAt(map, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= map.W || yi >= map.H) return T.VOID;
    return map.tiles[yi * map.W + xi];
  }
  const solidTile = (map, x, y) => SOLID[tileAt(map, x, y)] === 1;

  // ---------------------------------------------------------------- dungeons
  /** Procedural dungeon: connected rooms, an arena at the far end (sealed if the dungeon needs a seal). */
  function genDungeon(did, seed, opt) {
    opt = opt || {};
    const base = GF.DUNGEONS[did] || {};
    const w = opt.size ? opt.size[0] : base.size[0], h = opt.size ? opt.size[1] : base.size[1];
    const roomsN = opt.rooms || base.rooms;
    const tiles = new Uint8Array(w * h).fill(T.DWALL);
    const r = U.rng(seed);
    const rooms = [];
    const carve = (x0, y0, ww, hh, t) => { for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + ww; x++) if (x > 0 && y > 0 && x < w - 1 && y < h - 1) tiles[y * w + x] = t; };
    let tries = 0;
    const arenaSize = opt.noBoss || !(opt.boss || base.boss) ? 0 : (did === 'giants_keep' ? 25 : 17);
    while (rooms.length < roomsN && tries++ < 600) {
      const rw = 6 + Math.floor(r() * 7), rh = 6 + Math.floor(r() * 6);
      const x = 2 + Math.floor(r() * (w - rw - arenaSize * 0 - 4)), y = 2 + Math.floor(r() * (h - rh - 4));
      if (rooms.some((o) => x < o.x + o.w + 2 && x + rw + 2 > o.x && y < o.y + o.h + 2 && y + rh + 2 > o.y)) continue;
      rooms.push({ x, y, w: rw, h: rh, cx: Math.floor(x + rw / 2), cy: Math.floor(y + rh / 2) });
    }
    if (rooms.length < 2) rooms.push({ x: 4, y: 4, w: 8, h: 8, cx: 8, cy: 8 }, { x: w - 14, y: h - 14, w: 8, h: 8, cx: w - 10, cy: h - 10 });
    rooms.sort((a, b) => a.x + a.y - (b.x + b.y)); // roughly start (top-left) -> end (bottom-right)
    for (const rm of rooms) carve(rm.x, rm.y, rm.w, rm.h, T.DFLOOR);
    const corridor = (a, b) => {
      let x = a.cx, y = a.cy;
      while (x !== b.cx) { carve(x, y, 1, 2, T.DFLOOR); x += x < b.cx ? 1 : -1; }
      while (y !== b.cy) { carve(x, y, 2, 1, T.DFLOOR); y += y < b.cy ? 1 : -1; }
    };
    for (let i = 1; i < rooms.length; i++) corridor(rooms[i - 1], rooms[i]);
    for (let i = 0; i < Math.floor(rooms.length / 3); i++) corridor(rooms[Math.floor(r() * rooms.length)], rooms[Math.floor(r() * rooms.length)]);
    const start = rooms[0];
    let arena = null;
    if (arenaSize) {
      const last = rooms[rooms.length - 1];
      const ax = U.clamp(last.cx - Math.floor(arenaSize / 2), 2, w - arenaSize - 2), ay = U.clamp(last.cy - Math.floor(arenaSize / 2) + 4, 2, h - arenaSize - 2);
      // arena footprint: clear + round it
      carve(ax, ay, arenaSize, arenaSize, T.DWALL);
      const c = arenaSize / 2;
      for (let y = 0; y < arenaSize; y++) for (let x = 0; x < arenaSize; x++) if (U.dist(x + 0.5, y + 0.5, c, c) < c - 0.3) tiles[(ay + y) * w + ax + x] = T.DARENA;
      arena = { x: ax, y: ay, size: arenaSize, cx: ax + c, cy: ay + c, r: c - 1 };
      // connect arena to the second-last room through a sealed door
      const prev = rooms[rooms.length - 2] || start;
      let x = prev.cx, y = prev.cy;
      const target = { cx: Math.floor(arena.cx), cy: Math.floor(arena.cy) };
      while (x !== target.cx) { carve(x, y, 1, 2, T.DFLOOR); x += x < target.cx ? 1 : -1; }
      while (y !== target.cy) { carve(x, y, 2, 1, T.DFLOOR); y += y < target.cy ? 1 : -1; if (tiles[y * w + x] === T.DARENA) break; }
      // door: find the first arena tile along the corridor edge and seal it
      arena.door = null;
      for (let yy = arena.y; yy < arena.y + arena.size && !arena.door; yy++) for (let xx = arena.x; xx < arena.x + arena.size && !arena.door; xx++) {
        if (tiles[yy * w + xx] !== T.DARENA) continue;
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tiles[(yy + dy) * w + xx + dx] === T.DFLOOR);
        if (nb) arena.door = { x: xx, y: yy };
      }
      if (arena.door && (opt.sealed !== false) && (opt.seal || base.seal)) {
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const xx = arena.door.x + dx, yy = arena.door.y + dy; if (tiles[yy * w + xx] === T.DARENA) tiles[yy * w + xx] = T.DSEAL; }
      }
    }
    // content
    const enemies = [], chests = [];
    const exitPos = { x: start.cx + 0.5, y: start.cy + 0.5 };
    const lootRooms = rooms.slice(1, arena ? rooms.length - 1 : rooms.length);
    lootRooms.forEach((rm, i) => {
      const pack = 2 + Math.floor(r() * 3) + (opt.packBonus || 0);
      for (let k = 0; k < pack; k++) enemies.push({ x: rm.x + 1.5 + r() * (rm.w - 3), y: rm.y + 1.5 + r() * (rm.h - 3), elite: r() < 0.12 + 0.01 * (opt.floor || 0) });
      if (r() < 0.55 || i === lootRooms.length - 1) chests.push({ x: rm.x + 1.5 + r() * (rm.w - 3), y: rm.y + 1.5 + r() * (rm.h - 3), open: false });
    });
    // second chest in the room before the arena
    return { kind: 'dungeon', did, W: w, H: h, tiles, rooms, start: exitPos, arena, enemies, chests, solidAt: null };
  }

  Object.assign(GF, { T, SOLID_TILES: SOLID, genOverworld, regionAt, applyGates, nodesNear, tileAt, solidTile, genDungeon, FLOOR_TILE });
})(typeof window !== 'undefined' ? window : globalThis);

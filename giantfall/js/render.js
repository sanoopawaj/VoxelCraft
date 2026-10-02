// Canvas renderer: tile chunk cache, procedural sprites, effects and lighting.
(function (root) {
  'use strict';
  const GF = root.GF;
  const U = GF.util;
  const T = GF.T;
  const R = GF.Render = {};
  let cv, ctx, W = 800, H = 600, nightCv, nightCtx;
  const CH = 16; // tiles per chunk edge
  const TS_CACHE = 32; // pixels per tile in chunk cache
  const chunkCache = new Map();
  let cacheMap = null, cacheVer = -1;

  const TILE_COL = {
    [T.GRASS]: ['#4f9a46', '#58a64e', '#4a9040'], [T.DIRT]: ['#8a6a46', '#957250', '#7e6040'], [T.ROCK]: ['#7a7f8a', '#868b96', '#70757f'], [T.FOREST]: ['#2f5a3a', '#376844', '#2a5034'],
    [T.SNOW]: ['#e4eef6', '#f0f6fb', '#d8e6f0'], [T.ASH]: ['#4a3a36', '#554440', '#403230'], [T.RUIN]: ['#8a7a60', '#968568', '#7e6e56'], [T.GIANT]: ['#7a5a4a', '#86644f', '#6e5042'],
    [T.WATER]: ['#2a5fa8', '#3068b4', '#2656a0'], [T.CLIFF]: ['#4a4a55', '#55555f', '#40404a'], [T.PATH]: ['#b89a70', '#c4a67a', '#ac8e66'], [T.LAVA]: ['#e0501a', '#f06a24', '#d04410'],
    [T.ICE]: ['#bfe0f0', '#cfe8f4', '#b0d4e8'], [T.GATE]: ['#6a3838', '#7a4640', '#5e3030'], [T.VOID]: ['#0e2238', '#10263e', '#0c1e32'],
  };
  const THEME = { greenlands: ['#4a5a3a', '#3a4630'], stone: ['#55535c', '#403e48'], forest: ['#2a3a2c', '#1e2a20'], frozen: ['#6a8aa0', '#4a6478'], ember: ['#5a3028', '#40201c'], ruins: ['#7a6a48', '#5a4c34'], giant: ['#6a4838', '#4a3028'] };

  R.init = function (canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    nightCv = document.createElement('canvas'); nightCtx = nightCv.getContext('2d');
    R.resize();
    window.addEventListener('resize', R.resize);
  };
  R.resize = function () {
    W = cv.width = window.innerWidth; H = cv.height = window.innerHeight;
    nightCv.width = W; nightCv.height = H;
    GF.G.scale = Math.max(30, Math.min(52, Math.round(Math.min(W, H) / 17)));
    GF.G.vw = W; GF.G.vh = H;
  };
  R.size = () => [W, H];

  // ------------------------------------------------------------ helpers
  const fillEllipse = (x, y, rx, ry, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 6.2832); ctx.fill(); };
  const fillCircle = (x, y, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); };
  const rr = (x, y, w, h, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.fill(); };
  const poly = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); ctx.fill(); };
  const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * f)), g = Math.max(0, Math.min(255, ((n >> 8) & 255) * f)), b = Math.max(0, Math.min(255, (n & 255) * f)); return `rgb(${r | 0},${g | 0},${b | 0})`; };
  const hash = (x, y, s) => U.hash2(s || 1, x, y);

  // ------------------------------------------------------------ tile chunks
  function chunkOf(map, cx, cy) {
    const key = cx + ',' + cy;
    let c = chunkCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = CH * TS_CACHE;
    const g = c.getContext('2d');
    const dung = map.kind === 'dungeon';
    for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
      const tx = cx * CH + i, ty = cy * CH + j;
      if (tx >= map.W || ty >= map.H) continue;
      const t = map.tiles[ty * map.W + tx];
      const px = i * TS_CACHE, py = j * TS_CACHE;
      let col;
      if (dung) {
        const th = THEME[map.theme] || THEME.stone;
        col = t === T.DWALL ? '#15151d' : t === T.DARENA ? shade(th[0], 0.8) : t === T.DSEAL ? '#7a3030' : t === T.DLAVA ? '#e0501a' : th[(tx + ty) & 1 ? 0 : 1];
        if (t === T.DWALL) { g.fillStyle = col; g.fillRect(px, py, TS_CACHE, TS_CACHE); const below = map.tiles[(ty + 1) * map.W + tx]; if (below !== T.DWALL && ty + 1 < map.H) { g.fillStyle = '#2a2a38'; g.fillRect(px, py + TS_CACHE - 10, TS_CACHE, 10); g.fillStyle = '#383848'; g.fillRect(px, py + TS_CACHE - 10, TS_CACHE, 3); } continue; }
        g.fillStyle = col; g.fillRect(px, py, TS_CACHE, TS_CACHE);
        // flagstone grid + speckle
        g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1; g.strokeRect(px + 0.5, py + 0.5, TS_CACHE - 1, TS_CACHE - 1);
        for (let k = 0; k < 3; k++) { g.fillStyle = `rgba(255,255,255,${0.04 + hash(tx, ty, k) * 0.05})`; g.fillRect(px + hash(tx, ty, k + 5) * 26, py + hash(tx, ty, k + 9) * 26, 4, 3); }
        if (t === T.DSEAL) { g.fillStyle = '#c05050'; g.fillRect(px + 6, py + 6, 20, 20); g.fillStyle = '#ffd0a0'; g.beginPath(); g.arc(px + 16, py + 16, 6, 0, 6.28); g.fill(); }
        if (t === T.DARENA) { g.strokeStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.arc(px + 16, py + 16, 11, 0, 6.28); g.stroke(); }
        continue;
      }
      const cols = TILE_COL[t] || TILE_COL[T.VOID];
      const v = hash(tx, ty, 3);
      col = cols[v < 0.4 ? 0 : v < 0.75 ? 1 : 2];
      g.fillStyle = col; g.fillRect(px, py, TS_CACHE, TS_CACHE);
      // texture details
      if (t === T.GRASS) {
        for (let k = 0; k < 4; k++) { g.fillStyle = hash(tx, ty, k + 10) < 0.5 ? '#3f8a38' : '#6ab45c'; g.fillRect(px + hash(tx, ty, k + 20) * 28, py + hash(tx, ty, k + 30) * 26, 2, 5); }
        if (hash(tx, ty, 77) < 0.06) { g.fillStyle = ['#ffe27a', '#ff9ab0', '#fff', '#b0a0ff'][Math.floor(hash(tx, ty, 78) * 4)]; g.fillRect(px + 8 + hash(tx, ty, 79) * 14, py + 8 + hash(tx, ty, 80) * 14, 4, 4); }
      } else if (t === T.FOREST) {
        for (let k = 0; k < 3; k++) { g.fillStyle = hash(tx, ty, k + 10) < 0.5 ? '#244a30' : '#3e7a4a'; g.fillRect(px + hash(tx, ty, k + 20) * 28, py + hash(tx, ty, k + 30) * 26, 3, 4); }
        if (hash(tx, ty, 77) < 0.05) { g.fillStyle = '#7a3a3a'; g.fillRect(px + 10, py + 12, 5, 4); }
      } else if (t === T.ROCK || t === T.GIANT || t === T.RUIN) {
        for (let k = 0; k < 3; k++) { g.fillStyle = `rgba(0,0,0,${0.07 + hash(tx, ty, k) * 0.07})`; g.fillRect(px + hash(tx, ty, k + 20) * 24, py + hash(tx, ty, k + 30) * 24, 6 + hash(tx, ty, k + 3) * 6, 2); }
        if (t === T.RUIN && hash(tx, ty, 91) < 0.2) { g.strokeStyle = 'rgba(40,30,10,0.3)'; g.strokeRect(px + 2.5, py + 2.5, TS_CACHE - 5, TS_CACHE - 5); }
        if (t === T.GIANT && hash(tx, ty, 92) < 0.08) { g.strokeStyle = 'rgba(255,120,60,0.35)'; g.beginPath(); g.moveTo(px + 2, py + 10); g.lineTo(px + 20, py + 18); g.lineTo(px + 30, py + 14); g.stroke(); }
      } else if (t === T.SNOW || t === T.ICE) {
        for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(160,190,220,0.35)'; g.fillRect(px + hash(tx, ty, k + 20) * 28, py + hash(tx, ty, k + 30) * 28, 3, 2); }
        if (hash(tx, ty, 33) < 0.07) { g.fillStyle = '#fff'; g.fillRect(px + hash(tx, ty, 34) * 28, py + hash(tx, ty, 35) * 28, 2, 2); }
      } else if (t === T.ASH) {
        for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px + hash(tx, ty, k + 20) * 26, py + hash(tx, ty, k + 30) * 26, 5, 3); }
        if (hash(tx, ty, 44) < 0.05) { g.fillStyle = 'rgba(255,100,40,0.4)'; g.fillRect(px + 6, py + 12, 8, 2); }
      } else if (t === T.DIRT) {
        for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(px + hash(tx, ty, k + 20) * 28, py + hash(tx, ty, k + 30) * 28, 3, 3); }
      } else if (t === T.PATH) {
        g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(px, py + 30, TS_CACHE, 2);
        for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(px + hash(tx, ty, k + 20) * 26, py + hash(tx, ty, k + 30) * 26, 4, 3); }
      } else if (t === T.WATER || t === T.VOID) {
        g.fillStyle = 'rgba(255,255,255,0.10)';
        for (let k = 0; k < 2; k++) g.fillRect(px + hash(tx, ty, k + 20) * 20, py + hash(tx, ty, k + 30) * 28, 10, 2);
        // shore: lighten edge toward land
        if (t === T.WATER) for (const [dx, dy, rx, ry, rw, rh] of [[0, -1, 0, 0, 32, 3], [0, 1, 0, 29, 32, 3], [-1, 0, 0, 0, 3, 32], [1, 0, 29, 0, 3, 32]]) { const nt = map.tiles[(ty + dy) * map.W + tx + dx]; if (nt !== T.WATER && nt !== T.VOID) { g.fillStyle = 'rgba(200,230,255,0.4)'; g.fillRect(px + rx, py + ry, rw, rh); } }
      } else if (t === T.LAVA) {
        g.fillStyle = 'rgba(255,220,100,0.5)';
        for (let k = 0; k < 3; k++) g.fillRect(px + hash(tx, ty, k + 20) * 24, py + hash(tx, ty, k + 30) * 26, 6, 3);
      } else if (t === T.CLIFF) {
        const below = map.tiles[(ty + 1) * map.W + tx];
        if (below !== T.CLIFF) { g.fillStyle = '#2e2e38'; g.fillRect(px, py + 18, TS_CACHE, 14); g.fillStyle = '#6a6a76'; g.fillRect(px, py, TS_CACHE, 18); g.fillStyle = '#7c7c88'; g.fillRect(px + 3, py + 3, 12, 5); }
        else { g.fillStyle = '#5a5a66'; g.fillRect(px + 2, py + 4, 10, 8); g.fillStyle = '#3e3e48'; g.fillRect(px + 16, py + 14, 12, 10); }
      } else if (t === T.GATE) {
        g.fillStyle = '#4a2424'; g.fillRect(px, py, TS_CACHE, TS_CACHE);
        g.fillStyle = '#8a5a3a'; for (let k = 0; k < 4; k++) g.fillRect(px + 2 + k * 8, py + 2, 5, 28);
        g.fillStyle = '#c0a060'; g.fillRect(px, py + 14, TS_CACHE, 3);
      }
    }
    chunkCache.set(key, c);
    return c;
  }
  R.invalidate = function () { chunkCache.clear(); };

  // ------------------------------------------------------------ sprites: nodes
  function drawNode(n, sx, sy, sc, time) {
    const nd = GF.NODES[n.type];
    const sh = n.shake > 0 ? (Math.sin(n.shake * 90) * 3) : 0;
    const x = sx + sh, y = sy;
    const s = sc;
    if (n.dead) {
      if (nd.tool === 'axe') { fillEllipse(x, y + s * 0.1, s * 0.22, s * 0.12, '#6a4a2a'); fillEllipse(x, y + s * 0.05, s * 0.18, s * 0.09, '#a07a4a'); }
      else if (!nd.temp) { fillEllipse(x, y + s * 0.1, s * 0.25, s * 0.1, 'rgba(0,0,0,0.2)'); fillCircle(x - s * 0.1, y + s * 0.05, s * 0.07, '#6a6a72'); fillCircle(x + s * 0.12, y + s * 0.08, s * 0.05, '#5a5a62'); }
      return;
    }
    fillEllipse(x, y + s * 0.3, s * (nd.r + 0.1), s * 0.18, 'rgba(0,0,0,0.25)');
    const col = nd.col;
    switch (n.type) {
      case 'tree': {
        rr(x - s * 0.1, y - s * 0.2, s * 0.2, s * 0.55, 3, '#6a4a2a');
        fillCircle(x, y - s * 0.55, s * 0.5, '#2f7a34'); fillCircle(x - s * 0.28, y - s * 0.35, s * 0.34, '#3a8a3a'); fillCircle(x + s * 0.3, y - s * 0.38, s * 0.32, '#348234'); fillCircle(x - s * 0.08, y - s * 0.7, s * 0.3, '#4ca048');
        break;
      }
      case 'darktree': {
        rr(x - s * 0.1, y - s * 0.1, s * 0.2, s * 0.45, 3, '#3a2a1c');
        for (let i = 0; i < 3; i++) poly([x - s * (0.55 - i * 0.12), y - s * (0.0 + i * 0.3), x + s * (0.55 - i * 0.12), y - s * (0.0 + i * 0.3), x, y - s * (0.55 + i * 0.3)], ['#1e3a28', '#244a30', '#2c5a38'][i]);
        break;
      }
      case 'frosttree': {
        rr(x - s * 0.1, y - s * 0.1, s * 0.2, s * 0.45, 3, '#5a4a3a');
        for (let i = 0; i < 3; i++) { poly([x - s * (0.55 - i * 0.12), y - s * (0.0 + i * 0.3), x + s * (0.55 - i * 0.12), y - s * (0.0 + i * 0.3), x, y - s * (0.55 + i * 0.3)], ['#4a7a6a', '#5a8a78', '#6a9a88'][i]); poly([x - s * (0.3 - i * 0.07), y - s * (0.2 + i * 0.3), x + s * (0.3 - i * 0.07), y - s * (0.2 + i * 0.3), x, y - s * (0.55 + i * 0.3)], '#eef6fa'); }
        break;
      }
      case 'bush_fiber': fillCircle(x - s * 0.15, y, s * 0.2, '#4a9a40'); fillCircle(x + s * 0.12, y - s * 0.05, s * 0.22, '#58aa48'); fillCircle(x, y - s * 0.15, s * 0.18, '#6ac058'); ctx.strokeStyle = '#a8d878'; ctx.lineWidth = 1.5; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x - s * 0.2 + i * s * 0.12, y); ctx.lineTo(x - s * 0.25 + i * s * 0.16, y - s * 0.3); ctx.stroke(); } break;
      case 'herb_patch': for (let i = 0; i < 5; i++) { const a = i * 1.26; fillEllipse(x + Math.cos(a) * s * 0.18, y + Math.sin(a) * s * 0.1 - s * 0.05, s * 0.12, s * 0.2, i % 2 ? '#3a9a5a' : '#58c070'); } fillCircle(x, y - s * 0.05, s * 0.06, '#ffe27a'); break;
      case 'mushroom_patch': for (const [dx, dy, r] of [[-0.2, 0.05, 0.16], [0.15, 0, 0.2], [0, -0.12, 0.14]]) { rr(x + dx * s - s * 0.04, y + dy * s, s * 0.08, s * 0.18, 2, '#e8dcc8'); fillEllipse(x + dx * s, y + dy * s, s * r, s * r * 0.7, '#c4546a'); fillCircle(x + dx * s - 2, y + dy * s - 2, s * 0.03, '#fff'); } break;
      case 'clay_pit': fillEllipse(x, y + s * 0.05, s * 0.4, s * 0.22, '#8a5a3a'); fillEllipse(x, y, s * 0.34, s * 0.17, '#b8704a'); fillEllipse(x - s * 0.08, y - s * 0.03, s * 0.14, s * 0.06, '#d08a60'); break;
      case 'relic_urn': fillEllipse(x, y - s * 0.05, s * 0.22, s * 0.3, '#b89850'); rr(x - s * 0.12, y - s * 0.4, s * 0.24, s * 0.12, 3, '#c8a860'); ctx.strokeStyle = '#6a4a20'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y - s * 0.05, s * 0.15, 0.3, 2.8); ctx.stroke(); break;
      case 'rock': poly([x - s * 0.35, y + s * 0.25, x - s * 0.25, y - s * 0.15, x + s * 0.05, y - s * 0.3, x + s * 0.32, y - s * 0.1, x + s * 0.38, y + s * 0.25], '#7a7e88'); poly([x - s * 0.25, y - s * 0.15, x + s * 0.05, y - s * 0.3, x + s * 0.1, y, x - s * 0.15, y + s * 0.05], '#9a9ea8'); break;
      case 'crystal_vein': case 'ember_vein': {
        poly([x - s * 0.42, y + s * 0.28, x - s * 0.3, y - s * 0.05, x + s * 0.3, y - s * 0.05, x + s * 0.42, y + s * 0.28], '#5a5a66');
        const glow = 0.5 + 0.3 * Math.sin(time * 3 + n.x);
        ctx.globalAlpha = glow * 0.5; fillCircle(x, y - s * 0.2, s * 0.6, col); ctx.globalAlpha = 1;
        for (const [dx, h, w] of [[-0.18, 0.55, 0.12], [0.02, 0.8, 0.15], [0.2, 0.5, 0.11]]) poly([x + dx * s - w * s, y, x + dx * s, y - h * s, x + dx * s + w * s, y], col);
        poly([x + 0.02 * s - 0.15 * s, y, x + 0.02 * s, y - 0.8 * s, x + 0.02 * s, y], 'rgba(255,255,255,0.5)');
        break;
      }
      case 'obsidian_vein': for (const [dx, h, w] of [[-0.2, 0.6, 0.12], [0.0, 0.95, 0.16], [0.22, 0.55, 0.11]]) { poly([x + dx * s - w * s, y + s * 0.2, x + dx * s, y - h * s + s * 0.2, x + dx * s + w * s, y + s * 0.2], '#2a1c44'); poly([x + dx * s, y - h * s + s * 0.2, x + dx * s + w * s, y + s * 0.2, x + dx * s + w * s * 0.2, y + s * 0.2], '#4a3a74'); } break;
      case 'sulfur_vent': fillEllipse(x, y + s * 0.1, s * 0.4, s * 0.2, '#6a5a2a'); fillEllipse(x, y, s * 0.3, s * 0.14, '#e8d84a'); for (let i = 0; i < 3; i++) { const t = (time * 0.8 + i * 0.33) % 1; ctx.globalAlpha = 0.5 * (1 - t); fillCircle(x + Math.sin(t * 6 + i) * s * 0.1, y - t * s * 0.7, s * (0.1 + t * 0.12), '#f4ec90'); ctx.globalAlpha = 1; } break;
      case 'star_node': {
        const g = 0.6 + 0.4 * Math.sin(time * 4 + n.x);
        ctx.globalAlpha = g * 0.5; fillCircle(x, y - s * 0.25, s * 0.7, '#ffe27a'); ctx.globalAlpha = 1;
        poly([x - s * 0.4, y + s * 0.28, x - s * 0.3, y - s * 0.1, x + s * 0.3, y - s * 0.1, x + s * 0.4, y + s * 0.28], '#4a4458');
        ctx.fillStyle = '#ffe27a'; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * 0.12 : s * 0.38; ctx.lineTo(x + Math.cos(a) * r, y - s * 0.3 + Math.sin(a) * r); } ctx.closePath(); ctx.fill();
        break;
      }
      case 'giant_rock': {
        const g = 0.5 + 0.3 * Math.sin(time * 2 + n.y);
        poly([x - s * 0.55, y + s * 0.3, x - s * 0.45, y - s * 0.2, x - s * 0.1, y - s * 0.55, x + s * 0.35, y - s * 0.4, x + s * 0.58, y + s * 0.3], '#6a4a40');
        poly([x - s * 0.45, y - s * 0.2, x - s * 0.1, y - s * 0.55, x + s * 0.0, y - s * 0.1, x - s * 0.3, y + s * 0.1], '#8a6a5a');
        ctx.strokeStyle = `rgba(255,140,80,${g})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - s * 0.2, y + s * 0.1); ctx.lineTo(x, y - s * 0.15); ctx.lineTo(x + s * 0.2, y - s * 0.02); ctx.lineTo(x + s * 0.3, y - s * 0.25); ctx.stroke();
        break;
      }
      case 'meteor': { const g = 0.6 + 0.4 * Math.sin(time * 5); ctx.globalAlpha = g * 0.5; fillCircle(x, y - s * 0.1, s * 0.6, '#ff8a3a'); ctx.globalAlpha = 1; poly([x - s * 0.35, y + s * 0.25, x - s * 0.3, y - s * 0.2, x + s * 0.1, y - s * 0.35, x + s * 0.38, y - s * 0.05, x + s * 0.3, y + s * 0.25], '#3a2a2a'); fillCircle(x - s * 0.05, y - s * 0.05, s * 0.1, '#ffcf6a'); fillCircle(x + s * 0.12, y + s * 0.05, s * 0.07, '#ff9a4a'); break; }
      default: { // generic ore: grey boulder with coloured chips
        poly([x - s * 0.4, y + s * 0.28, x - s * 0.3, y - s * 0.1, x - s * 0.05, y - s * 0.32, x + s * 0.3, y - s * 0.15, x + s * 0.42, y + s * 0.28], n.type === 'coal_vein' ? '#3a3d44' : '#70747e');
        poly([x - s * 0.3, y - s * 0.1, x - s * 0.05, y - s * 0.32, x + s * 0.05, y, x - s * 0.18, y + s * 0.08], n.type === 'coal_vein' ? '#4a4d54' : '#8a8e98');
        for (const [dx, dy, r] of [[-0.12, -0.02, 0.1], [0.14, 0.05, 0.12], [0.02, -0.2, 0.09], [-0.22, 0.12, 0.07]]) { poly([x + dx * s, y + dy * s - r * s, x + dx * s + r * s, y + dy * s, x + dx * s, y + dy * s + r * s, x + dx * s - r * s, y + dy * s], col); }
      }
    }
    if (n.rich) {
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(time * 5); ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y - s * 0.15, s * 0.62, 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1;
      const a = time * 3 + n.x; fillCircle(x + Math.cos(a) * s * 0.5, y - s * 0.15 + Math.sin(a) * s * 0.5, 2.5, '#fff6a0');
    }
    if (n.hp < n.max) { const w = s * 0.8; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - w / 2, y - s * 0.85, w, 4); ctx.fillStyle = '#7aff8a'; ctx.fillRect(x - w / 2, y - s * 0.85, w * Math.max(0, n.hp / n.max), 4); }
  }

  // ------------------------------------------------------------ sprites: buildings
  function drawField(b, x, y, s, S, time) {
    // soil + fence + plots
    rr(x - 2, y - 2, s * 3 + 4, s * 3 + 4, 6, '#5a3a22');
    rr(x, y, s * 3, s * 3, 4, '#7a5030');
    const idx = GF.G.target && GF.G.target.b === b ? GF.G.nearestPlot(b) : -1;
    for (let i = 0; i < 9; i++) {
      const px = x + (i % 3) * s, py = y + Math.floor(i / 3) * s;
      const p = b.plots[i];
      rr(px + 3, py + 3, s - 6, s - 6, 3, p.crop && (p.water > 0) ? '#4a2c18' : '#6a4426');
      if (i === idx) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(px + 2, py + 2, s - 4, s - 4); }
      if (p.crop) {
        const stage = p.prog >= 1 ? 3 : Math.floor(p.prog * 3);
        const cd = GF.ITEMS[p.crop];
        const cx = px + s / 2, cy = py + s * 0.75;
        for (let k = 0; k < 3; k++) {
          const ox = (k - 1) * s * 0.2;
          const h = s * (0.14 + stage * 0.14);
          ctx.strokeStyle = '#3a9a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + ox, cy); ctx.lineTo(cx + ox, cy - h); ctx.stroke();
          if (stage >= 1) fillEllipse(cx + ox + 3, cy - h * 0.6, s * 0.07, s * 0.04, '#58c058');
          if (stage >= 3) fillCircle(cx + ox, cy - h, s * 0.1, cd.col);
        }
        if (p.prog >= 1) { ctx.globalAlpha = 0.5 + 0.4 * Math.sin(time * 6); fillCircle(cx, py + s * 0.25, 3, '#fff6a0'); ctx.globalAlpha = 1; }
      }
    }
    // fence
    ctx.strokeStyle = '#c8a070'; ctx.lineWidth = 2.5; ctx.strokeRect(x - 3, y - 3, s * 3 + 6, s * 3 + 6);
    if (b.level >= 4) { ctx.globalAlpha = 0.28; rr(x - 3, y - 3, s * 3 + 6, s * 3 + 6, 6, '#bfe8f0'); ctx.globalAlpha = 1; ctx.strokeStyle = '#e8f6fa'; ctx.lineWidth = 2; ctx.strokeRect(x - 3, y - 3, s * 3 + 6, s * 3 + 6); }
    const sp = (b.machines && b.machines.sprinkler) || 0;
    for (let i = 0; i < sp; i++) { const px = x + (i * 1.2 + 0.4) * s, py = y + s * 3 + 4; fillCircle(px, py, 4, '#6ab8ff'); ctx.globalAlpha = 0.3; fillCircle(px, py - 8, 6, '#9ad0ff'); ctx.globalAlpha = 1; }
    if (b.machines && b.machines.harvester) { const px = x + s * 3 + 6, py = y + s * 1.5 + Math.sin(time * 3) * 4; fillCircle(px, py, 6, '#9ad06a'); rr(px - 5, py - 2, 10, 4, 2, '#4a6a2a'); }
  }
  const BCOL = {
    townhall: ['#c8a870', '#8a3a30'], furnace: ['#8a8a92', '#4a4a52'], lumber: ['#a07848', '#6a4a2a'], house: ['#d8c098', '#a04a3a'], mine: ['#6a6a74', '#4a3a2a'], bakery: ['#e0c090', '#c0583a'],
    workshop: ['#b09870', '#5a6a8a'], trading_post: ['#c8a870', '#3a7a8a'], warehouse: ['#8a7a60', '#5a4a3a'], tower: ['#9a9aa4', '#6a3a3a'], smithy: ['#6a6a74', '#3a3a44'], lab: ['#a0b8c8', '#5a4a8a'],
    factory: ['#7a7a84', '#4a4a54'], powerplant: ['#6a7a8a', '#3a4a5a'], hub: ['#7a8a9a', '#4a5a6a'], portal_hub: ['#8a8a98', '#5a4a8a'], ancient_forge: ['#b89a50', '#7a5a20'], observatory: ['#b8b8c8', '#4a4a8a'], star_forge: ['#4a3a6a', '#c0a0ff'],
  };
  function drawBuilding(b, sx, sy, sc, S, time) {
    const d = GF.BUILDINGS[b.type];
    const x = sx, y = sy, w = d.w * sc, h = d.h * sc, L = b.level;
    if (b.type === 'field') { drawField(b, x, y, sc, S, time); return; }
    if (d.kind === 'decor') { drawDecor(b, x, y, w, h, sc, time); return; }
    const [wall, roof] = BCOL[b.type] || ['#a09070', '#6a4a3a'];
    const lift = Math.min(L - 1, 4) * sc * 0.09; // upgrades make buildings visibly taller
    // shadow
    fillEllipse(x + w / 2, y + h - 2, w * 0.55, sc * 0.3, 'rgba(0,0,0,0.28)');
    const bh = h * 0.78 + lift;
    // body
    rr(x + 2, y + h - bh, w - 4, bh, 4, wall);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x + 2, y + h - bh * 0.35, w - 4, bh * 0.35);
    // roof
    const roofH = Math.min(h * 0.55, sc * (0.9 + L * 0.1));
    switch (b.type) {
      case 'tower': poly([x + 4, y + h - bh, x + w - 4, y + h - bh, x + w / 2, y + h - bh - roofH * 1.2], roof); for (let i = 0; i < 3; i++) rr(x + 4 + i * (w - 8) / 3, y + h - bh - 4, (w - 8) / 4, 5, 1, wall); break;
      case 'powerplant': rr(x + w * 0.2, y + h - bh - sc * 0.5, w * 0.6, sc * 0.5, 4, roof); { const g = 0.5 + 0.4 * Math.sin(time * 4); ctx.globalAlpha = g; fillCircle(x + w / 2, y + h - bh * 0.55, sc * 0.42, '#7ae0ff'); ctx.globalAlpha = 1; fillCircle(x + w / 2, y + h - bh * 0.55, sc * 0.22, '#fff'); } break;
      case 'lab': ctx.globalAlpha = 0.85; fillCircle(x + w / 2, y + h - bh, w * 0.35, '#bfe0f0'); ctx.globalAlpha = 1; ctx.strokeStyle = '#6a8aa0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + w / 2, y + h - bh, w * 0.35, Math.PI, 0); ctx.stroke(); fillCircle(x + w / 2 - 6, y + h - bh - 6, 4, '#ff6aa0'); break;
      case 'observatory': fillCircle(x + w / 2, y + h - bh, w * 0.4, '#d8d8e8'); ctx.save(); ctx.translate(x + w / 2, y + h - bh - 6); ctx.rotate(-0.8 + Math.sin(time * 0.4) * 0.2); rr(0, -3, w * 0.5, 6, 2, '#4a4a5a'); ctx.restore(); break;
      case 'portal_hub': case 'hub': { ctx.strokeStyle = roof; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, w * 0.32, 0, 6.28); ctx.stroke(); const g = time * (b.type === 'hub' ? 2 : 1); for (let i = 0; i < 6; i++) { const a = g + i * 1.047; fillCircle(x + w / 2 + Math.cos(a) * w * 0.22, y + h / 2 + Math.sin(a) * w * 0.22, 3, b.type === 'hub' ? '#ffd070' : '#c0a0ff'); } break; }
      case 'star_forge': poly([x, y + h - bh, x + w, y + h - bh, x + w / 2, y + h - bh - roofH * 1.3], '#2a2048'); for (let i = 0; i < 5; i++) { const a = time + i * 1.256; fillCircle(x + w / 2 + Math.cos(a) * w * 0.3, y + h * 0.4 + Math.sin(a * 1.3) * h * 0.2, 3, '#ffe27a'); } break;
      default: poly([x - 3, y + h - bh + 4, x + w + 3, y + h - bh + 4, x + w - 8, y + h - bh - roofH, x + 8, y + h - bh - roofH], roof); ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x + 8, y + h - bh - roofH, w - 16, 3);
    }
    // door + windows
    rr(x + w / 2 - sc * 0.22, y + h - sc * 0.7, sc * 0.44, sc * 0.7, 3, '#4a3020');
    const night = GF.isNight(S);
    const nW = Math.max(1, Math.min(4, Math.floor(w / sc) - 1));
    for (let i = 0; i < nW; i++) { const wx = x + sc * 0.25 + i * ((w - sc * 0.6) / nW); if (Math.abs(wx + sc * 0.15 - (x + w / 2)) < sc * 0.3) continue; rr(wx, y + h - bh * 0.7, sc * 0.3, sc * 0.3, 2, night ? '#ffd870' : '#8ab8d8'); }
    // type-specific props
    if (b.type === 'furnace' || b.type === 'smithy' || b.type === 'ancient_forge') { const g = 0.6 + 0.4 * Math.sin(time * 9 + b.uid); ctx.globalAlpha = g; fillCircle(x + w * 0.25, y + h - sc * 0.35, sc * 0.2, b.type === 'ancient_forge' ? '#ffd050' : '#ff7a2a'); ctx.globalAlpha = 1; rr(x + w * 0.65, y + h - sc * 0.4, sc * 0.5, sc * 0.2, 2, '#2a2a30'); }
    if (b.type === 'lumber') { for (let i = 0; i < 3; i++) rr(x + w - sc * 0.9, y + h - sc * 0.2 - i * 6, sc * 0.7, 5, 2, '#a07040'); ctx.save(); ctx.translate(x + sc * 0.5, y + h - sc * 0.25); ctx.rotate(time * 6); ctx.strokeStyle = '#c8c8d0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 8, 0, 6.28); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke(); ctx.restore(); }
    if (b.type === 'mine') { rr(x + w / 2 - sc * 0.5, y + h - sc * 0.9, sc, sc * 0.9, 6, '#15151a'); rr(x + w / 2 - sc * 0.6, y + h - sc * 0.95, sc * 0.1, sc * 0.95, 1, '#8a6a3a'); rr(x + w / 2 + sc * 0.5, y + h - sc * 0.95, sc * 0.1, sc * 0.95, 1, '#8a6a3a'); }
    if (b.type === 'trading_post') { for (let i = 0; i < 6; i++) rr(x + 2 + i * (w - 4) / 6, y + h - bh - 6, (w - 4) / 6, 10, 1, i % 2 ? '#fff' : '#3a7a8a'); }
    if (b.type === 'bakery' || b.type === 'furnace' || b.type === 'smithy' || b.type === 'factory' || b.type === 'house' || b.type === 'ancient_forge') {
      rr(x + w * 0.72, y + h - bh - roofH * 0.9, sc * 0.22, sc * 0.5, 2, '#5a4a4a');
      const active = !b.unpaid;
      if (active) for (let i = 0; i < 3; i++) { const t = (time * 0.5 + i * 0.33 + b.uid * 0.1) % 1; ctx.globalAlpha = 0.45 * (1 - t); fillCircle(x + w * 0.72 + sc * 0.11 + Math.sin(t * 5) * 4, y + h - bh - roofH * 0.9 - t * sc * 1.2, sc * (0.1 + t * 0.2), '#d8d8e0'); ctx.globalAlpha = 1; }
    }
    if (b.type === 'factory') { rr(x + w * 0.15, y + h - bh - roofH * 1.1, sc * 0.25, sc * 0.7, 2, '#4a4a54'); ctx.save(); ctx.translate(x + w * 0.5, y + h - bh * 0.5); ctx.rotate(time * 2); ctx.strokeStyle = '#d0d0d8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 6.28); for (let i = 0; i < 4; i++) { ctx.moveTo(0, 0); ctx.lineTo(Math.cos(i * 1.57) * 10, Math.sin(i * 1.57) * 10); } ctx.stroke(); ctx.restore(); }
    if (b.type === 'townhall') { rr(x + w / 2 - 2, y + h - bh - roofH - sc * 0.9, 4, sc * 0.9, 1, '#6a4a2a'); poly([x + w / 2 + 2, y + h - bh - roofH - sc * 0.9, x + w / 2 + sc * 0.7, y + h - bh - roofH - sc * 0.7, x + w / 2 + 2, y + h - bh - roofH - sc * 0.5], '#d03a3a'); for (let i = 0; i < L; i++) fillCircle(x + 10 + i * 9, y + h - 8, 3, '#ffd24a'); }
    // level pips for upgradable buildings
    if (d.maxLevel > 1 && b.type !== 'townhall') for (let i = 0; i < L; i++) fillCircle(x + 7 + i * 8, y + h - bh - 5, 3, i + 1 >= d.maxLevel ? '#ffd24a' : '#fff');
    // state icons
    const stock = b.stock ? GF.stockTotal(b) : 0;
    if (stock > 0) { rr(x + w - 24, y + h - bh - 14, 24, 14, 5, 'rgba(0,0,0,0.65)'); ctx.fillStyle = '#ffe27a'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(Math.floor(stock), x + w - 12, y + h - bh - 3); }
    if (b.unpaid) { ctx.fillStyle = '#ff5a5a'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', x + w / 2, y + h - bh - roofH - 4); }
  }
  function drawDecor(b, x, y, w, h, sc, time) {
    switch (b.type) {
      case 'lamp': rr(x + w / 2 - 2, y + h * 0.1, 4, h * 0.85, 1, '#3a3a44'); { const night = GF.isNight(GF.S); fillCircle(x + w / 2, y + h * 0.1, 5, night ? '#ffe9a0' : '#a09870'); } break;
      case 'garden': fillEllipse(x + w / 2, y + h * 0.6, w * 0.45, h * 0.35, '#4a8a3a'); for (let i = 0; i < 8; i++) fillCircle(x + 6 + (i * 13) % (w - 10), y + h * 0.35 + ((i * 7) % 17), 4, ['#ff7a9a', '#ffe27a', '#fff', '#b08aff'][i % 4]); break;
      case 'fountain': fillEllipse(x + w / 2, y + h * 0.7, w * 0.42, h * 0.28, '#8a8a98'); fillEllipse(x + w / 2, y + h * 0.68, w * 0.34, h * 0.2, '#4a90d0'); rr(x + w / 2 - 3, y + h * 0.3, 6, h * 0.35, 2, '#a0a0b0'); for (let i = 0; i < 5; i++) { const t = (time * 1.2 + i * 0.2) % 1; ctx.globalAlpha = 1 - t; fillCircle(x + w / 2 + (i - 2) * 5 * t, y + h * 0.35 + t * h * 0.3, 2.5, '#bfe0ff'); ctx.globalAlpha = 1; } break;
      case 'statue': fillEllipse(x + w / 2, y + h * 0.88, w * 0.3, 6, 'rgba(0,0,0,0.3)'); rr(x + w * 0.3, y + h * 0.65, w * 0.4, h * 0.3, 3, '#8a8a98'); rr(x + w * 0.38, y + h * 0.25, w * 0.24, h * 0.45, 4, '#c8b060'); fillCircle(x + w / 2, y + h * 0.2, w * 0.12, '#d8c070'); rr(x + w * 0.62, y + h * 0.2, 4, h * 0.45, 1, '#e8e8f0'); break;
      case 'obelisk': poly([x + w * 0.25, y + h, x + w * 0.35, y + h * 0.1, x + w * 0.65, y + h * 0.1, x + w * 0.75, y + h], '#2a2a44'); poly([x + w * 0.35, y + h * 0.1, x + w * 0.5, y, x + w * 0.65, y + h * 0.1], '#ffe27a'); ctx.globalAlpha = 0.4 + 0.3 * Math.sin(time * 3); fillCircle(x + w / 2, y + h * 0.3, w * 0.5, '#ffe27a'); ctx.globalAlpha = 1; break;
      default: break;
    }
  }

  // ------------------------------------------------------------ sprites: characters
  function drawHumanoid(x, y, s, o) {
    // o: body, skin, hat, cape, walk, face, tool
    const bob = Math.sin(o.walk || 0) * s * 0.04;
    fillEllipse(x, y + s * 0.3, s * 0.3, s * 0.12, 'rgba(0,0,0,0.3)');
    if (o.cape) { poly([x - s * 0.22 * o.dirx, y - s * 0.3 + bob, x + s * 0.0, y - s * 0.3 + bob, x - s * 0.25 * o.dirx + Math.sin((o.walk || 0)) * 3, y + s * 0.25], o.cape); }
    const leg = Math.sin(o.walk || 0) * s * 0.1;
    rr(x - s * 0.15, y + s * 0.05, s * 0.12, s * 0.28 + leg, 2, o.legs || '#3a3040');
    rr(x + s * 0.03, y + s * 0.05, s * 0.12, s * 0.28 - leg, 2, o.legs || '#3a3040');
    rr(x - s * 0.22, y - s * 0.32 + bob, s * 0.44, s * 0.42, 5, o.body);
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(x - s * 0.22, y - s * 0.04 + bob, s * 0.44, s * 0.06);
    fillCircle(x, y - s * 0.45 + bob, s * 0.2, o.skin || '#f0c8a0');
    if (o.hat) {
      if (o.hat === 'straw_hat') { fillEllipse(x, y - s * 0.55 + bob, s * 0.34, s * 0.1, '#e8d080'); rr(x - s * 0.14, y - s * 0.72 + bob, s * 0.28, s * 0.16, 4, '#e8d080'); }
      else if (o.hat === 'hard_hat') { rr(x - s * 0.2, y - s * 0.66 + bob, s * 0.4, s * 0.18, 5, '#f0b030'); rr(x - s * 0.26, y - s * 0.52 + bob, s * 0.52, s * 0.05, 2, '#f0b030'); }
      else if (o.hat === 'top_hat') { rr(x - s * 0.25, y - s * 0.55 + bob, s * 0.5, s * 0.05, 2, '#2a2a35'); rr(x - s * 0.16, y - s * 0.85 + bob, s * 0.32, s * 0.32, 2, '#2a2a35'); rr(x - s * 0.16, y - s * 0.6 + bob, s * 0.32, s * 0.05, 1, '#c03040'); }
      else if (o.hat === 'wizard_hat') { poly([x - s * 0.28, y - s * 0.52 + bob, x + s * 0.28, y - s * 0.52 + bob, x + s * 0.05, y - s * 1.0 + bob], '#5a4ab0'); fillCircle(x + s * 0.05, y - s * 0.98 + bob, 3, '#ffe27a'); }
      else if (o.hat === 'crown') { poly([x - s * 0.2, y - s * 0.55 + bob, x - s * 0.2, y - s * 0.75 + bob, x - s * 0.1, y - s * 0.62 + bob, x, y - s * 0.8 + bob, x + s * 0.1, y - s * 0.62 + bob, x + s * 0.2, y - s * 0.75 + bob, x + s * 0.2, y - s * 0.55 + bob], '#ffd24a'); }
      else if (o.hatCol) { rr(x - s * 0.2, y - s * 0.62 + bob, s * 0.4, s * 0.16, 5, o.hatCol); }
    }
    fillCircle(x + s * 0.07 * o.dirx, y - s * 0.46 + bob, s * 0.025, '#222'); fillCircle(x - s * 0.04 * o.dirx + s * 0.07 * o.dirx, y - s * 0.46 + bob, s * 0.025, '#222');
  }
  const ARM_TIER_COL = ['#7a5a3a', '#7a5a3a', '#8a6a4a', '#a0a4ac', '#b8c0cc', '#7ae0ff', '#4a2a7a', '#c8a850', '#ffe27a', '#ff8a5c', '#c060ff'];
  function drawPlayer(P, S, sx, sy, sc, time) {
    const ar = S.equip.armor && GF.ITEMS[S.equip.armor];
    const body = ar ? ARM_TIER_COL[Math.min(10, ar.tier + 1)] : '#6a8a5a';
    const capeItem = GF.COSMETICS.find((c) => c.id === S.cosm.cape);
    const hatItem = S.cosm.hat;
    const flash = P.hurt > 0 && Math.floor(time * 20) % 2 === 0;
    const inv = P.invuln > 0 && P.roll <= 0 && P.hurt <= 0;
    ctx.save();
    if (P.roll > 0) { ctx.translate(sx, sy); ctx.rotate(P.roll * 25 * (P.rollDir[0] >= 0 ? 1 : -1)); ctx.translate(-sx, -sy); ctx.globalAlpha = 0.7; }
    const dirx = Math.cos(P.ang) >= 0 ? 1 : -1;
    // weapon behind/under swing
    drawHumanoid(sx, sy, sc, { body: flash ? '#fff' : body, walk: P.walk, dirx, cape: capeItem ? capeItem.col : null, hat: hatItem, legs: '#3a3446' });
    // weapon / tool
    const w = GF.weapon(S);
    const sw = P.swing;
    const baseAng = sw ? sw.ang + (-1.0 + 2.0 * Math.min(1, sw.t / sw.dur)) * (sw.kind === 'spear' || sw.kind === 'bow' ? 0 : 1) : P.ang - 0.3;
    const wx = sx + Math.cos(P.ang) * sc * 0.28, wy = sy - sc * 0.12 + Math.sin(P.ang) * sc * 0.28;
    ctx.save(); ctx.translate(wx, wy); ctx.rotate(sw && sw.kind !== 'spear' && sw.kind !== 'bow' ? baseAng : P.ang);
    const kind = sw && (sw.kind === 'pickaxe' || sw.kind === 'axe' || sw.kind === 'fist') ? sw.kind : (w ? w.kind : 'fist');
    const tc = w ? ARM_TIER_COL[Math.min(10, w.tier + 1)] : '#c8a070';
    if (kind === 'sword') { rr(0, -2, sc * 0.2, 4, 1, '#6a4a2a'); rr(sc * 0.2, -3, sc * 0.08, 6, 1, '#c0a060'); rr(sc * 0.28, -2.5, sc * 0.55, 5, 2, tc); if (w && w.tier >= 5) { ctx.globalAlpha = 0.4; rr(sc * 0.28, -4, sc * 0.55, 8, 3, tc); ctx.globalAlpha = 1; } }
    else if (kind === 'spear') { const ext = sw ? Math.sin(Math.min(1, sw.t / sw.dur) * Math.PI) * sc * 0.5 : 0; rr(-sc * 0.1 + ext, -1.5, sc * 0.95, 3, 1, '#7a5a3a'); poly([sc * 0.85 + ext, -4, sc * 1.1 + ext, 0, sc * 0.85 + ext, 4], tc); }
    else if (kind === 'hammer') { rr(0, -1.5, sc * 0.6, 3, 1, '#7a5a3a'); rr(sc * 0.5, -sc * 0.14, sc * 0.3, sc * 0.28, 3, tc); }
    else if (kind === 'bow') { ctx.strokeStyle = tc; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sc * 0.25, 0, sc * 0.4, -1.2, 1.2); ctx.stroke(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sc * 0.25 + Math.cos(-1.2) * sc * 0.4, Math.sin(-1.2) * sc * 0.4); ctx.lineTo(sc * 0.25 + Math.cos(1.2) * sc * 0.4, Math.sin(1.2) * sc * 0.4); ctx.stroke(); }
    else if (kind === 'pickaxe') { rr(0, -1.5, sc * 0.55, 3, 1, '#7a5a3a'); poly([sc * 0.45, -sc * 0.18, sc * 0.62, 0, sc * 0.45, sc * 0.18, sc * 0.52, 0], ARM_TIER_COL[Math.min(10, GF.toolTier(S, 'pick') + 1)]); }
    else if (kind === 'axe') { rr(0, -1.5, sc * 0.55, 3, 1, '#7a5a3a'); poly([sc * 0.4, -sc * 0.2, sc * 0.62, -sc * 0.12, sc * 0.62, sc * 0.12, sc * 0.4, sc * 0.2], ARM_TIER_COL[Math.min(10, GF.toolTier(S, 'axe') + 1)]); }
    else fillCircle(sc * 0.3, 0, 4, '#f0c8a0');
    ctx.restore();
    // slash arc
    if (sw && (sw.kind === 'sword' || sw.kind === 'hammer' || sw.kind === 'fist' || sw.kind === 'pickaxe' || sw.kind === 'axe')) {
      const k = sw.t / sw.dur;
      ctx.globalAlpha = (1 - k) * 0.6; ctx.strokeStyle = sw.tier >= 5 ? '#ffd8a0' : '#fff'; ctx.lineWidth = 5 - k * 3;
      ctx.beginPath(); ctx.arc(sx, sy - sc * 0.1, sc * (sw.kind === 'hammer' ? 1.3 : 1.1), sw.ang - 0.9, sw.ang - 0.9 + 1.8 * Math.min(1, k * 1.4)); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (P.spin > 0) { ctx.strokeStyle = 'rgba(255,233,160,0.8)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(sx, sy, sc * (1.0 + (0.4 - P.spin) * 4), 0, 6.28); ctx.stroke(); }
    ctx.restore();
    if (inv) { ctx.globalAlpha = 0.25; fillCircle(sx, sy - sc * 0.1, sc * 0.45, '#fff'); ctx.globalAlpha = 1; }
  }
  function drawNpc(n, sx, sy, sc, time, S) {
    drawHumanoid(sx, sy, sc, { body: n.col, walk: 0, dirx: 1, hatCol: n.id === 'mystic' ? '#5a3a8a' : n.id === 'blacksmith' ? '#3a3a3a' : n.id === 'foreman' ? '#d8a030' : n.id === 'abyss' ? null : '#6a4a2a', hat: n.id === 'mystic' ? 'wizard_hat' : null, skin: n.id === 'abyss' ? '#8a60c0' : '#f0c8a0' });
    if (n.abyss) { ctx.globalAlpha = 0.5 + 0.3 * Math.sin(time * 3); ctx.strokeStyle = '#c070ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, sc * 0.7, 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1; }
    if (n.board) { rr(sx + sc * 0.28, sy - sc * 0.4, sc * 0.35, sc * 0.45, 2, '#b08a50'); ctx.fillStyle = '#fff'; ctx.fillRect(sx + sc * 0.32, sy - sc * 0.32, sc * 0.1, sc * 0.1); ctx.fillRect(sx + sc * 0.46, sy - sc * 0.22, sc * 0.1, sc * 0.1); }
  }
  const SHAPES = { slime: 'blob', wisp: 'ghost', frost_wisp: 'ghost', wraith: 'ghost', boar: 'quad', wolf: 'quad', ice_wolf: 'quad', ash_hound: 'quad', rock_beetle: 'bug', spider: 'spider', goblin: 'hum', goblin_archer: 'hum', bandit: 'hum', raider: 'hum', fire_imp: 'imp', yeti: 'big', magma_golem: 'golem', construct: 'golem', rockling: 'golem', shard_golem: 'golem', sentry: 'turret' };
  function drawEnemy(e, sx, sy, sc, time, S) {
    const s = sc * e.r * 2.2;
    const col = e.flash > 0 ? '#ffffff' : e.def.col;
    const shape = e.isPylon ? 'pylon' : SHAPES[e.type] || 'blob';
    const wob = Math.sin(time * 6 + e.x * 3) * s * 0.04;
    fillEllipse(sx, sy + s * 0.35, s * 0.4, s * 0.14, 'rgba(0,0,0,0.3)');
    const face = Math.cos(e.face || 0) >= 0 ? 1 : -1;
    if (e.state === 'windup') { ctx.globalAlpha = 0.5 + 0.4 * Math.sin(time * 30); ctx.strokeStyle = '#ff4040'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy - s * 0.1, s * 0.6, 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1; }
    switch (shape) {
      case 'blob': { const sq = 1 + Math.sin(time * 5 + e.x) * 0.1; ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(sx, sy, s * 0.42 * sq, s * 0.34 / sq, 0, Math.PI, 0); ctx.lineTo(sx + s * 0.42 * sq, sy + s * 0.2); ctx.lineTo(sx - s * 0.42 * sq, sy + s * 0.2); ctx.fill(); ctx.globalAlpha = 0.35; fillCircle(sx - s * 0.12, sy - s * 0.18, s * 0.09, '#fff'); ctx.globalAlpha = 1; fillCircle(sx - s * 0.12, sy - s * 0.02, s * 0.05, '#222'); fillCircle(sx + s * 0.12, sy - s * 0.02, s * 0.05, '#222'); break; }
      case 'quad': { rr(sx - s * 0.4, sy - s * 0.2 + wob, s * 0.8, s * 0.38, 6, col); const lg = Math.sin(time * 14 + e.x) * s * 0.06; for (const dx of [-0.3, -0.12, 0.12, 0.3]) rr(sx + dx * s, sy + s * 0.12, s * 0.1, s * 0.22 + (dx > 0 ? lg : -lg), 2, shade(e.def.col, 0.7)); fillCircle(sx + face * s * 0.42, sy - s * 0.15 + wob, s * 0.2, col); poly([sx + face * s * 0.4, sy - s * 0.32 + wob, sx + face * s * 0.5, sy - s * 0.5 + wob, sx + face * s * 0.3, sy - s * 0.34 + wob], shade(e.def.col, 0.8)); fillCircle(sx + face * s * 0.5, sy - s * 0.18 + wob, s * 0.04, '#ffd0d0'); if (e.type === 'boar') poly([sx + face * s * 0.58, sy - s * 0.08, sx + face * s * 0.72, sy - s * 0.14, sx + face * s * 0.58, sy - s * 0.18], '#f0e8d0'); break; }
      case 'bug': { fillEllipse(sx, sy, s * 0.42, s * 0.3, col); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy - s * 0.3); ctx.lineTo(sx, sy + s * 0.3); ctx.stroke(); fillCircle(sx + face * s * 0.38, sy, s * 0.14, shade(e.def.col, 0.8)); for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(sx + i * s * 0.2, sy + s * 0.2); ctx.lineTo(sx + i * s * 0.28, sy + s * 0.36 + Math.sin(time * 10 + i) * 2); ctx.stroke(); } break; }
      case 'spider': { for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + sd * s * (0.35 + i * 0.05), sy - s * 0.2 + i * s * 0.14); ctx.lineTo(sx + sd * s * 0.5, sy + s * 0.25 + Math.sin(time * 9 + i) * 2); ctx.stroke(); } fillCircle(sx, sy, s * 0.26, col); fillCircle(sx + face * s * 0.22, sy - s * 0.04, s * 0.15, shade(e.def.col, 1.2)); fillCircle(sx + face * s * 0.26, sy - s * 0.08, s * 0.03, '#f44'); fillCircle(sx + face * s * 0.2, sy - s * 0.1, s * 0.03, '#f44'); break; }
      case 'hum': drawHumanoid(sx, sy, s * 1.2, { body: col, skin: e.type === 'goblin' || e.type === 'goblin_archer' ? '#8ac05a' : '#d8a888', walk: time * 8 + e.x, dirx: face, hatCol: e.type === 'bandit' ? '#3a2a2a' : null, legs: '#3a3030' }); if (e.type === 'goblin_archer') { ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx + face * s * 0.35, sy - s * 0.1, s * 0.3, -1.2, 1.2); ctx.stroke(); } else { rr(sx + face * s * 0.25, sy - s * 0.1, s * 0.4, 3, 1, '#c0c0c8'); } break;
      case 'imp': { ctx.globalAlpha = 0.35; fillCircle(sx, sy - s * 0.1, s * 0.55, '#ff6a3a'); ctx.globalAlpha = 1; fillCircle(sx, sy - s * 0.1, s * 0.3, col); poly([sx - s * 0.22, sy - s * 0.3, sx - s * 0.3, sy - s * 0.55, sx - s * 0.08, sy - s * 0.35], '#8a2a1a'); poly([sx + s * 0.22, sy - s * 0.3, sx + s * 0.3, sy - s * 0.55, sx + s * 0.08, sy - s * 0.35], '#8a2a1a'); fillCircle(sx - s * 0.1, sy - s * 0.14, s * 0.05, '#ffe27a'); fillCircle(sx + s * 0.1, sy - s * 0.14, s * 0.05, '#ffe27a'); poly([sx - s * 0.3, sy, sx - s * 0.6, sy - s * 0.1 + Math.sin(time * 12) * 4, sx - s * 0.25, sy + s * 0.12], '#a03a1a'); poly([sx + s * 0.3, sy, sx + s * 0.6, sy - s * 0.1 + Math.sin(time * 12) * 4, sx + s * 0.25, sy + s * 0.12], '#a03a1a'); break; }
      case 'ghost': { ctx.globalAlpha = 0.8; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, sy - s * 0.1 + wob * 2, s * 0.3, Math.PI, 0); for (let i = 0; i < 4; i++) ctx.lineTo(sx + s * 0.3 - i * s * 0.2, sy + s * 0.25 + (i % 2 ? 4 : -2)); ctx.fill(); ctx.globalAlpha = 1; fillCircle(sx - s * 0.1, sy - s * 0.12 + wob * 2, s * 0.05, '#102030'); fillCircle(sx + s * 0.1, sy - s * 0.12 + wob * 2, s * 0.05, '#102030'); break; }
      case 'big': { rr(sx - s * 0.4, sy - s * 0.3, s * 0.8, s * 0.6, 10, col); fillCircle(sx, sy - s * 0.38, s * 0.24, shade(e.def.col, 0.92)); rr(sx - s * 0.55, sy - s * 0.2, s * 0.2, s * 0.5, 6, col); rr(sx + s * 0.35, sy - s * 0.2, s * 0.2, s * 0.5, 6, col); fillCircle(sx - s * 0.1, sy - s * 0.4, s * 0.04, '#222'); fillCircle(sx + s * 0.1, sy - s * 0.4, s * 0.04, '#222'); break; }
      case 'golem': { rr(sx - s * 0.36, sy - s * 0.25, s * 0.72, s * 0.55, 4, col); rr(sx - s * 0.22, sy - s * 0.52, s * 0.44, s * 0.3, 4, shade(e.def.col, 0.9)); rr(sx - s * 0.52, sy - s * 0.2, s * 0.18, s * 0.45, 3, shade(e.def.col, 0.8)); rr(sx + s * 0.34, sy - s * 0.2, s * 0.18, s * 0.45, 3, shade(e.def.col, 0.8)); ctx.fillStyle = e.type === 'magma_golem' || e.type === 'shard_golem' ? '#ffd050' : '#9ae0ff'; ctx.fillRect(sx - s * 0.14, sy - s * 0.42, s * 0.1, s * 0.06); ctx.fillRect(sx + s * 0.04, sy - s * 0.42, s * 0.1, s * 0.06); if (e.type === 'magma_golem' || e.type === 'shard_golem') { ctx.strokeStyle = '#ffd050'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx - s * 0.2, sy - s * 0.1); ctx.lineTo(sx, sy + s * 0.05); ctx.lineTo(sx + s * 0.2, sy - s * 0.1); ctx.stroke(); } break; }
      case 'turret': { rr(sx - s * 0.3, sy - s * 0.1, s * 0.6, s * 0.4, 5, col); fillCircle(sx, sy - s * 0.15, s * 0.28, shade(e.def.col, 1.1)); fillCircle(sx, sy - s * 0.15, s * 0.12, '#ff4040'); ctx.strokeStyle = '#444'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sx, sy - s * 0.15); ctx.lineTo(sx + Math.cos(e.face || 0) * s * 0.5, sy - s * 0.15 + Math.sin(e.face || 0) * s * 0.5); ctx.stroke(); break; }
      case 'pylon': { ctx.globalAlpha = 0.5 + 0.3 * Math.sin(time * 4); fillCircle(sx, sy - s * 0.2, s * 0.6, '#8fe8ff'); ctx.globalAlpha = 1; poly([sx - s * 0.25, sy + s * 0.3, sx - s * 0.15, sy - s * 0.4, sx + s * 0.15, sy - s * 0.4, sx + s * 0.25, sy + s * 0.3], '#4a5a6a'); fillCircle(sx, sy - s * 0.45, s * 0.18, '#8fe8ff'); break; }
      default: fillCircle(sx, sy, s * 0.35, col);
    }
    if (e.elite) { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy - s * 0.05, s * 0.55, 0, 6.28); ctx.stroke(); poly([sx - 5, sy - s * 0.62, sx - 3, sy - s * 0.75, sx, sy - s * 0.64, sx + 3, sy - s * 0.75, sx + 5, sy - s * 0.62], '#ffd24a'); }
    if (e.hp < e.max && !e.isBoss) { const w = Math.max(24, s * 0.8); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx - w / 2, sy - s * 0.78, w, 5); ctx.fillStyle = e.elite ? '#ffd24a' : '#ff5a5a'; ctx.fillRect(sx - w / 2, sy - s * 0.78, w * Math.max(0, e.hp / e.max), 5); }
  }

  // ------------------------------------------------------------ bosses
  function drawBoss(b, sx, sy, sc, time) {
    const s = sc * b.r * 2;
    const f = b.flash > 0 ? '#ffffff' : null;
    const pulse = Math.sin(time * 3);
    fillEllipse(sx, sy + s * 0.42, s * 0.55, s * 0.18, 'rgba(0,0,0,0.35)');
    if (b.invuln > 0 && b.active) { ctx.globalAlpha = 0.4 + 0.3 * Math.sin(time * 25); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(sx, sy - s * 0.1, s * 0.62, 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1; }
    switch (b.boss) {
      case 'slimeking': { const sq = 1 + pulse * 0.08; ctx.fillStyle = f || '#4adf6a'; ctx.beginPath(); ctx.ellipse(sx, sy + s * 0.2, s * 0.5 * sq, s * 0.4 / sq, 0, Math.PI, 0); ctx.lineTo(sx + s * 0.5 * sq, sy + s * 0.35); ctx.lineTo(sx - s * 0.5 * sq, sy + s * 0.35); ctx.fill(); ctx.globalAlpha = 0.4; fillCircle(sx - s * 0.15, sy - s * 0.1, s * 0.12, '#fff'); ctx.globalAlpha = 1; fillCircle(sx - s * 0.16, sy + s * 0.12, s * 0.07, '#111'); fillCircle(sx + s * 0.16, sy + s * 0.12, s * 0.07, '#111'); poly([sx - s * 0.25, sy - s * 0.15, sx - s * 0.25, sy - s * 0.4, sx - s * 0.1, sy - s * 0.25, sx, sy - s * 0.45, sx + s * 0.1, sy - s * 0.25, sx + s * 0.25, sy - s * 0.4, sx + s * 0.25, sy - s * 0.15], '#ffd24a'); break; }
      case 'guardian': { const c = f || '#9aa4b8'; rr(sx - s * 0.32, sy - s * 0.1, s * 0.64, s * 0.5, 6, c); rr(sx - s * 0.22, sy - s * 0.5, s * 0.44, s * 0.4, 6, shade('#9aa4b8', 0.9)); rr(sx - s * 0.58, sy - s * 0.15, s * 0.22, s * 0.55, 6, shade('#9aa4b8', 0.8)); rr(sx + s * 0.36, sy - s * 0.15, s * 0.22, s * 0.55, 6, shade('#9aa4b8', 0.8)); ctx.fillStyle = '#9ae0ff'; ctx.fillRect(sx - s * 0.16, sy - s * 0.34, s * 0.12, s * 0.07); ctx.fillRect(sx + s * 0.04, sy - s * 0.34, s * 0.12, s * 0.07); ctx.strokeStyle = '#6a7488'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx - s * 0.2, sy); ctx.lineTo(sx, sy + s * 0.2); ctx.lineTo(sx + s * 0.22, sy + s * 0.02); ctx.stroke(); break; }
      case 'forestking': { const c = f || '#4a8a48'; rr(sx - s * 0.3, sy - s * 0.1, s * 0.6, s * 0.45, 8, c); fillCircle(sx, sy - s * 0.3, s * 0.22, shade('#4a8a48', 1.1)); ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 5; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx + sd * s * 0.12, sy - s * 0.45); ctx.lineTo(sx + sd * s * 0.3, sy - s * 0.7); ctx.lineTo(sx + sd * s * 0.45, sy - s * 0.65); ctx.moveTo(sx + sd * s * 0.3, sy - s * 0.7); ctx.lineTo(sx + sd * s * 0.3, sy - s * 0.9); ctx.stroke(); } fillCircle(sx - s * 0.08, sy - s * 0.32, s * 0.04, '#ffe27a'); fillCircle(sx + s * 0.08, sy - s * 0.32, s * 0.04, '#ffe27a'); for (let i = 0; i < 6; i++) { const a = i * 1.05 + time * 0.5; poly([sx + Math.cos(a) * s * 0.4, sy + s * 0.1 + Math.sin(a) * s * 0.3, sx + Math.cos(a) * s * 0.55, sy + s * 0.1 + Math.sin(a) * s * 0.4, sx + Math.cos(a + 0.2) * s * 0.4, sy + s * 0.1 + Math.sin(a + 0.2) * s * 0.3], '#2a5a28'); } break; }
      case 'wyrm': { const c = f || '#8ad0f0'; for (let i = 6; i >= 1; i--) { const t = i / 6; const ox = Math.sin(time * 2 + i * 0.7) * s * 0.18 * t, oy = i * s * 0.12; fillCircle(sx - ox, sy + oy - s * 0.1, s * (0.34 - t * 0.14), shade('#8ad0f0', 0.8 + 0.2 * t)); } fillCircle(sx, sy - s * 0.1, s * 0.36, c); poly([sx - s * 0.3, sy - s * 0.3, sx - s * 0.5, sy - s * 0.6, sx - s * 0.1, sy - s * 0.4], '#d8f4ff'); poly([sx + s * 0.3, sy - s * 0.3, sx + s * 0.5, sy - s * 0.6, sx + s * 0.1, sy - s * 0.4], '#d8f4ff'); fillCircle(sx - s * 0.12, sy - s * 0.14, s * 0.05, '#102040'); fillCircle(sx + s * 0.12, sy - s * 0.14, s * 0.05, '#102040'); ctx.globalAlpha = 0.5; poly([sx - s * 0.35, sy - s * 0.1, sx - s * 0.9, sy - s * 0.5 + Math.sin(time * 4) * 8, sx - s * 0.4, sy + s * 0.1], '#bfe8ff'); poly([sx + s * 0.35, sy - s * 0.1, sx + s * 0.9, sy - s * 0.5 + Math.sin(time * 4) * 8, sx + s * 0.4, sy + s * 0.1], '#bfe8ff'); ctx.globalAlpha = 1; break; }
      case 'titan': { const c = f || '#e85a2a'; const g = 0.6 + 0.4 * pulse; ctx.globalAlpha = 0.35 * g; fillCircle(sx, sy - s * 0.1, s * 0.8, '#ff7a2a'); ctx.globalAlpha = 1; rr(sx - s * 0.34, sy - s * 0.1, s * 0.68, s * 0.5, 6, '#4a2a22'); rr(sx - s * 0.24, sy - s * 0.52, s * 0.48, s * 0.42, 6, '#5a3226'); rr(sx - s * 0.62, sy - s * 0.15, s * 0.26, s * 0.6, 6, '#4a2a22'); rr(sx + s * 0.36, sy - s * 0.15, s * 0.26, s * 0.6, 6, '#4a2a22'); ctx.strokeStyle = c; ctx.lineWidth = 4; for (const [a, bb, cc, d] of [[-0.2, 0, 0, 0.3], [0.15, -0.05, 0.25, 0.2], [-0.5, 0.1, -0.5, 0.4], [0.5, 0.1, 0.5, 0.4]]) { ctx.beginPath(); ctx.moveTo(sx + a * s, sy + bb * s); ctx.lineTo(sx + cc * s, sy + d * s); ctx.stroke(); } fillCircle(sx - s * 0.1, sy - s * 0.34, s * 0.06, '#ffe27a'); fillCircle(sx + s * 0.1, sy - s * 0.34, s * 0.06, '#ffe27a'); fillCircle(sx, sy + s * 0.1, s * 0.12 * (0.8 + 0.3 * g), '#ffb04a'); break; }
      case 'warden': { const c = f || '#d8c070'; for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.5; ctx.strokeStyle = '#8fe8ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(sx, sy - s * 0.1, s * (0.55 + i * 0.1), s * (0.18 + i * 0.04), time * (i % 2 ? 1 : -1) * 0.8 + i, 0, 6.28); ctx.stroke(); } ctx.globalAlpha = 1; poly([sx - s * 0.3, sy + s * 0.35, sx - s * 0.36, sy - s * 0.1, sx - s * 0.2, sy - s * 0.35, sx + s * 0.2, sy - s * 0.35, sx + s * 0.36, sy - s * 0.1, sx + s * 0.3, sy + s * 0.35], c); fillCircle(sx, sy - s * 0.5, s * 0.2, shade('#d8c070', 1.1)); poly([sx - s * 0.2, sy - s * 0.55, sx, sy - s * 0.85, sx + s * 0.2, sy - s * 0.55], '#b89a50'); ctx.fillStyle = '#8fe8ff'; ctx.fillRect(sx - s * 0.12, sy - s * 0.52, s * 0.24, s * 0.05); rr(sx - s * 0.62, sy - s * 0.1, s * 0.2, s * 0.35, 5, shade('#d8c070', 0.8)); rr(sx + s * 0.42, sy - s * 0.1, s * 0.2, s * 0.35, 5, shade('#d8c070', 0.8)); if (b.shielded) { ctx.globalAlpha = 0.35 + 0.2 * pulse; fillCircle(sx, sy - s * 0.1, s * 0.75, '#8fe8ff'); ctx.globalAlpha = 1; } break; }
      case 'giant': {
        const c = f || '#c07a50';
        const sway = Math.sin(time * 1.2) * s * 0.02;
        // legs
        rr(sx - s * 0.32, sy + s * 0.1, s * 0.24, s * 0.4, 8, shade('#c07a50', 0.7)); rr(sx + s * 0.08, sy + s * 0.1, s * 0.24, s * 0.4, 8, shade('#c07a50', 0.7));
        // torso
        rr(sx - s * 0.42, sy - s * 0.4 + sway, s * 0.84, s * 0.6, 14, c);
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(sx - s * 0.42, sy - s * 0.05, s * 0.84, s * 0.25);
        // arms (raise on slam telegraph)
        const raise = b.cd < 0.8 ? 0.35 : 0;
        rr(sx - s * 0.7, sy - s * (0.35 + raise) + sway, s * 0.26, s * 0.65, 12, shade('#c07a50', 0.9)); rr(sx + s * 0.44, sy - s * (0.35 + raise) + sway, s * 0.26, s * 0.65, 12, shade('#c07a50', 0.9));
        fillCircle(sx - s * 0.57, sy + s * (0.32 - raise), s * 0.16, shade('#c07a50', 0.8)); fillCircle(sx + s * 0.57, sy + s * (0.32 - raise), s * 0.16, shade('#c07a50', 0.8));
        // head
        fillCircle(sx, sy - s * 0.55 + sway, s * 0.28, shade('#c07a50', 1.05));
        poly([sx - s * 0.25, sy - s * 0.7, sx - s * 0.35, sy - s * 1.0, sx - s * 0.1, sy - s * 0.75], '#8a5a3a'); poly([sx + s * 0.25, sy - s * 0.7, sx + s * 0.35, sy - s * 1.0, sx + s * 0.1, sy - s * 0.75], '#8a5a3a');
        const eye = 0.6 + 0.4 * Math.sin(time * 3); ctx.globalAlpha = eye; fillCircle(sx - s * 0.1, sy - s * 0.58 + sway, s * 0.06, '#ffd050'); fillCircle(sx + s * 0.1, sy - s * 0.58 + sway, s * 0.06, '#ffd050'); ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ff8a3a'; ctx.lineWidth = 4; ctx.globalAlpha = 0.5 + 0.4 * pulse; ctx.beginPath(); ctx.moveTo(sx - s * 0.25, sy - s * 0.25); ctx.lineTo(sx - s * 0.05, sy - s * 0.05); ctx.lineTo(sx + s * 0.15, sy - s * 0.2); ctx.lineTo(sx + s * 0.28, sy + s * 0.05); ctx.stroke(); ctx.globalAlpha = 1;
        break;
      }
      default: fillCircle(sx, sy, s * 0.4, b.col);
    }
    if (b.asc) { ctx.strokeStyle = '#c060ff'; ctx.lineWidth = 3; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(sx, sy - s * 0.1, s * 0.7, 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1; }
  }

  // ------------------------------------------------------------ main draw
  R.draw = function (time) {
    const G = GF.G, S = G.S, map = G.map, P = G.P;
    if (!S || !map) return;
    const sc = G.scale;
    const shk = G.cam.shake;
    const camx = G.cam.x + (shk ? (Math.random() - 0.5) * shk * 0.5 : 0), camy = G.cam.y + (shk ? (Math.random() - 0.5) * shk * 0.5 : 0);
    const ox = W / 2 - camx * sc, oy = H / 2 - camy * sc;
    const tx = (x) => ox + x * sc, ty = (y) => oy + y * sc;
    const mapId = map.kind === 'dungeon' ? map : GF.G.over;
    if (cacheMap !== map || (map.kind === 'over' && cacheVer !== map.version)) { chunkCache.clear(); cacheMap = map; cacheVer = map.version; }
    ctx.fillStyle = map.kind === 'dungeon' ? '#0a0a10' : '#0e2238';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    // tiles
    const x0 = Math.floor((camx - W / 2 / sc) / CH), x1 = Math.floor((camx + W / 2 / sc) / CH);
    const y0 = Math.floor((camy - H / 2 / sc) / CH), y1 = Math.floor((camy + H / 2 / sc) / CH);
    for (let cy = Math.max(0, y0); cy <= Math.min(Math.floor(map.H / CH), y1); cy++) for (let cx = Math.max(0, x0); cx <= Math.min(Math.floor(map.W / CH), x1); cx++) {
      ctx.drawImage(chunkOf(map, cx, cy), Math.round(tx(cx * CH)), Math.round(ty(cy * CH)), CH * sc + 1, CH * sc + 1);
    }
    // animated water / lava shimmer overlay near player
    // build-mode grid + ghost
    if (G.buildMode && map.kind === 'over') {
      const z = GF.zone(S);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
      for (let x = z[0]; x <= z[2]; x++) { ctx.beginPath(); ctx.moveTo(tx(x), ty(z[1])); ctx.lineTo(tx(x), ty(z[3])); ctx.stroke(); }
      for (let y = z[1]; y <= z[3]; y++) { ctx.beginPath(); ctx.moveTo(tx(z[0]), ty(y)); ctx.lineTo(tx(z[2]), ty(y)); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,215,90,0.8)'; ctx.lineWidth = 3; ctx.strokeRect(tx(z[0]), ty(z[1]), (z[2] - z[0]) * sc, (z[3] - z[1]) * sc);
    }
    // telegraphs (ground layer)
    for (const t of map.tele) {
      if (t.t < 0) continue;
      if (t.kind === 'circle') { const k = Math.min(1, t.t / t.dur); ctx.globalAlpha = 0.18 + 0.25 * k; fillCircle(tx(t.x), ty(t.y), t.r * sc, t.col); ctx.globalAlpha = 0.7; ctx.strokeStyle = t.col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tx(t.x), ty(t.y), t.r * sc, 0, 6.28); ctx.stroke(); ctx.globalAlpha = 0.5; fillCircle(tx(t.x), ty(t.y), t.r * sc * k, t.col); ctx.globalAlpha = 1; }
      else if (t.kind === 'cone') { const k = Math.min(1, t.t / t.dur); ctx.globalAlpha = 0.2 + 0.3 * k; ctx.fillStyle = t.col; ctx.beginPath(); ctx.moveTo(tx(t.x), ty(t.y)); ctx.arc(tx(t.x), ty(t.y), t.len * sc, t.ang - t.spread / 2, t.ang + t.spread / 2); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
      else if (t.kind === 'beam') { const warn = t.t <= t.warn; ctx.globalAlpha = warn ? 0.3 + 0.2 * Math.sin(time * 30) : 0.9; ctx.strokeStyle = warn ? '#ff6060' : t.col; ctx.lineWidth = warn ? 3 : t.w * sc * 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tx(t.x), ty(t.y)); ctx.lineTo(tx(t.x + Math.cos(t.ang) * t.len), ty(t.y + Math.sin(t.ang) * t.len)); ctx.stroke(); if (!warn) { ctx.strokeStyle = '#fff'; ctx.lineWidth = t.w * sc * 0.6; ctx.stroke(); } ctx.lineCap = 'butt'; ctx.globalAlpha = 1; }
      else if (t.kind === 'pool') { ctx.globalAlpha = 0.4 + 0.1 * Math.sin(time * 4); fillCircle(tx(t.x), ty(t.y), t.r * sc, t.col); ctx.globalAlpha = 0.8; ctx.strokeStyle = t.slow ? '#e0f4ff' : '#ffb04a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tx(t.x), ty(t.y), t.r * sc, 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    // portals / stones / tablets / chests (ground objects)
    const objs = [];
    if (map.kind === 'over') {
      const vis = (x, y, pad) => x > camx - W / 2 / sc - pad && x < camx + W / 2 / sc + pad && y > camy - H / 2 / sc - pad && y < camy + H / 2 / sc + pad;
      for (const n of GF.nodesNear(map, camx, camy, Math.max(W, H) / sc / 2 + 2)) if (vis(n.x, n.y, 2)) objs.push({ y: n.y, k: 'node', o: n });
      for (const b of S.buildings) { const d = GF.BUILDINGS[b.type]; if (vis(b.x + d.w / 2, b.y + d.h / 2, d.w + 1)) objs.push({ y: b.y + d.h - (d.kind === 'field' ? 3 : 0), k: 'bld', o: b }); }
      for (const n of G.npcs) if (vis(n.x, n.y, 2)) objs.push({ y: n.y, k: 'npc', o: n });
      for (const p of map.portals) if (vis(p.x, p.y, 3)) objs.push({ y: p.y - 5, k: 'portal', o: p });
      for (const st of map.stones) if (vis(st.x, st.y, 3)) objs.push({ y: st.y, k: 'stone', o: st });
      for (const tb of map.tablets) if (!S.tablets[tb.id] && vis(tb.x, tb.y, 2)) objs.push({ y: tb.y, k: 'tablet', o: tb });
      const tr = S.events.treasure;
      if (tr && S.events.active && S.events.active.id === 'treasure' && vis(tr.x, tr.y, 2)) objs.push({ y: tr.y, k: 'treasure', o: tr });
      if (G.rift && S.events.active && S.events.active.id === 'rift' && vis(G.rift.x, G.rift.y, 2)) objs.push({ y: G.rift.y, k: 'rift', o: G.rift });
    } else {
      for (const c of map.chests) objs.push({ y: c.y, k: 'chest', o: c });
      objs.push({ y: map.start.y - 5, k: 'exit', o: map.start });
      if (map.exitPortal) objs.push({ y: map.exitPortal.y - 5, k: 'exit', o: map.exitPortal });
      if (map.stairs) objs.push({ y: map.stairs.y - 5, k: 'stairs', o: map.stairs });
    }
    for (const e of map.enemies) if (!e.dead && Math.abs(e.x - camx) < W / 2 / sc + 4 && Math.abs(e.y - camy) < H / 2 / sc + 4) objs.push({ y: e.y, k: 'enemy', o: e });
    objs.push({ y: P.y, k: 'player', o: P });
    objs.sort((a, b) => a.y - b.y);
    for (const ob of objs) {
      const o = ob.o;
      switch (ob.k) {
        case 'node': drawNode(o, tx(o.x), ty(o.y), sc, time); break;
        case 'bld': drawBuilding(o, tx(o.x), ty(o.y), sc, S, time); break;
        case 'npc': drawNpc(o, tx(o.x), ty(o.y), sc, time, S); break;
        case 'enemy': o.isBoss ? drawBoss(o, tx(o.x), ty(o.y), sc, time) : drawEnemy(o, tx(o.x), ty(o.y), sc, time, S); break;
        case 'player': drawPlayer(o, S, tx(o.x), ty(o.y), sc, time); break;
        case 'portal': {
          const d = GF.DUNGEONS[o.dungeon]; const boss = d.boss && d.seal;
          const x = tx(o.x), y = ty(o.y);
          fillEllipse(x, y + sc * 0.4, sc * 0.8, sc * 0.25, 'rgba(0,0,0,0.35)');
          rr(x - sc * 0.8, y - sc * 1.2, sc * 0.3, sc * 1.6, 4, '#4a4a58'); rr(x + sc * 0.5, y - sc * 1.2, sc * 0.3, sc * 1.6, 4, '#4a4a58'); rr(x - sc * 0.9, y - sc * 1.35, sc * 1.8, sc * 0.3, 5, '#5a5a68');
          const g = ctx.createRadialGradient(x, y - sc * 0.4, 2, x, y - sc * 0.4, sc * 0.8); g.addColorStop(0, boss ? '#ff90a0' : '#a0f0ff'); g.addColorStop(1, boss ? '#8a1a3a' : '#2a5aa0'); ctx.globalAlpha = 0.85; ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - sc * 0.4, sc * 0.5, sc * 0.9, 0, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1;
          for (let i = 0; i < 4; i++) { const a = time * 2 + i * 1.57; fillCircle(x + Math.cos(a) * sc * 0.35, y - sc * 0.4 + Math.sin(a) * sc * 0.7, 2.5, '#fff'); }
          ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(d.name, x, y - sc * 1.5);
          break;
        }
        case 'stone': { const x = tx(o.x), y = ty(o.y); const att = S.flags['stone_' + o.region]; fillEllipse(x, y + sc * 0.3, sc * 0.4, sc * 0.14, 'rgba(0,0,0,0.3)'); poly([x - sc * 0.3, y + sc * 0.3, x - sc * 0.2, y - sc * 0.6, x + sc * 0.2, y - sc * 0.6, x + sc * 0.3, y + sc * 0.3], '#6a6a7a'); ctx.globalAlpha = att ? 0.9 : 0.35; fillCircle(x, y - sc * 0.25, sc * 0.14 + Math.sin(time * 3) * 2, att ? '#c0a0ff' : '#808090'); ctx.globalAlpha = 1; break; }
        case 'tablet': { const x = tx(o.x), y = ty(o.y); fillEllipse(x, y + sc * 0.28, sc * 0.3, sc * 0.1, 'rgba(0,0,0,0.3)'); rr(x - sc * 0.22, y - sc * 0.4, sc * 0.44, sc * 0.65, 5, '#9a9aa4'); ctx.fillStyle = '#6a6a76'; for (let i = 0; i < 4; i++) ctx.fillRect(x - sc * 0.14, y - sc * 0.3 + i * sc * 0.12, sc * (0.18 + (i % 2) * 0.1), 3); ctx.globalAlpha = 0.5 + 0.4 * Math.sin(time * 3); fillCircle(x, y - sc * 0.5, 4, '#9ae0ff'); ctx.globalAlpha = 1; break; }
        case 'treasure': { const x = tx(o.x), y = ty(o.y); fillEllipse(x, y + sc * 0.2, sc * 0.4, sc * 0.14, 'rgba(0,0,0,0.3)'); rr(x - sc * 0.3, y - sc * 0.2, sc * 0.6, sc * 0.4, 4, '#a07030'); rr(x - sc * 0.3, y - sc * 0.2, sc * 0.6, sc * 0.14, 4, '#c89040'); fillCircle(x, y, 3, '#ffe27a'); ctx.globalAlpha = 0.5 + 0.4 * Math.sin(time * 5); ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, sc * 0.55, 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1; break; }
        case 'rift': { const x = tx(o.x), y = ty(o.y); for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.5; ctx.strokeStyle = ['#c070ff', '#ff70c0', '#70c0ff'][i]; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(x, y - sc * 0.4, sc * (0.3 + i * 0.12), sc * (0.8 + i * 0.1), time * (i + 1) * 0.6, 0, 6.28); ctx.stroke(); } ctx.globalAlpha = 1; fillCircle(x, y - sc * 0.4, sc * 0.2, '#fff'); break; }
        case 'chest': { const x = tx(o.x), y = ty(o.y); fillEllipse(x, y + sc * 0.2, sc * 0.4, sc * 0.14, 'rgba(0,0,0,0.3)'); rr(x - sc * 0.32, y - sc * 0.15, sc * 0.64, sc * 0.4, 4, o.open ? '#5a4020' : '#a07030'); if (!o.open) { rr(x - sc * 0.32, y - sc * 0.15, sc * 0.64, sc * 0.16, 4, '#c89040'); fillCircle(x, y, 3, '#ffe27a'); if (o.rich) { ctx.globalAlpha = 0.5 + 0.4 * Math.sin(time * 5); ctx.strokeStyle = '#c070ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, sc * 0.5, 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1; } } else { rr(x - sc * 0.32, y - sc * 0.35, sc * 0.64, sc * 0.16, 4, '#8a6020'); } break; }
        case 'exit': case 'stairs': { const x = tx(o.x), y = ty(o.y); const col = ob.k === 'stairs' ? '#ff90ff' : '#90d0ff'; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(time * 3); ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(x, y, sc * 0.6, sc * 0.35, 0, 0, 6.28); ctx.stroke(); ctx.globalAlpha = 0.25; fillEllipse(x, y, sc * 0.55, sc * 0.3, col); ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(ob.k === 'stairs' ? 'DOWN' : 'EXIT', x, y + sc * 0.65); break; }
        default: break;
      }
    }
    // build ghost
    if (G.buildMode && map.kind === 'over') {
      const d = GF.BUILDINGS[G.buildMode.type];
      const gx = Math.round(G.mouse.wx - d.w / 2), gy = Math.round(G.mouse.wy - d.h / 2);
      const why = GF.placeCheck(S, G.buildMode.type, gx, gy);
      ctx.globalAlpha = 0.6; ctx.fillStyle = why ? '#ff3030' : '#30ff60'; ctx.fillRect(tx(gx), ty(gy), d.w * sc, d.h * sc); ctx.globalAlpha = 1;
      ctx.strokeStyle = why ? '#ff6060' : '#80ffa0'; ctx.lineWidth = 3; ctx.strokeRect(tx(gx), ty(gy), d.w * sc, d.h * sc);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(why || d.name, tx(gx) + d.w * sc / 2, ty(gy) - 6);
    }
    // ground drops
    for (const d of map.drops) {
      const x = tx(d.x), y = ty(d.y) + Math.sin(time * 5 + d.x) * 2;
      fillEllipse(x, ty(d.y) + 6, 7, 3, 'rgba(0,0,0,0.3)');
      if (d.item === 'coins') { fillCircle(x, y, 6, '#ffd24a'); fillCircle(x, y, 3.5, '#e8a820'); }
      else { const it = GF.ITEMS[d.item]; rr(x - 6, y - 6, 12, 12, 3, it.col); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 5.5, y - 5.5, 11, 11); if (d.n > 1) { ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(d.n, x + 5, y + 10); } }
      if (d.item !== 'coins' && GF.ITEMS[d.item].value >= 100) { ctx.globalAlpha = 0.5 + 0.4 * Math.sin(time * 6 + d.y); ctx.strokeStyle = '#fff6a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 10, 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    // projectiles
    for (const p of map.proj) { ctx.globalAlpha = 0.9; fillCircle(tx(p.x), ty(p.y), p.r * sc, p.col); ctx.globalAlpha = 0.35; fillCircle(tx(p.x), ty(p.y), p.r * sc * 1.8, p.col); ctx.globalAlpha = 1; if (p.friendly) { ctx.strokeStyle = p.col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx(p.x), ty(p.y)); ctx.lineTo(tx(p.x - p.vx * 0.04), ty(p.y - p.vy * 0.04)); ctx.stroke(); } }
    // particles
    for (const p of G.parts) {
      const k = 1 - p.t / p.life;
      if (p.ring) { ctx.globalAlpha = k; ctx.strokeStyle = p.col; ctx.lineWidth = 4 * k + 1; ctx.beginPath(); ctx.arc(tx(p.x), ty(p.y), p.r * sc * (1 - k * 0.6), 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1; }
      else { ctx.globalAlpha = Math.max(0, k); ctx.fillStyle = p.col; ctx.fillRect(tx(p.x) - p.size / 2, ty(p.y) - p.size / 2, p.size, p.size); ctx.globalAlpha = 1; }
    }
    // night lighting (overworld only)
    if (map.kind === 'over') {
      const f = GF.dayFrac(S);
      let dark = 0;
      if (f > 0.65 && f <= 0.76) dark = (f - 0.65) / 0.11;
      else if (f > 0.76 || f < 0.03) dark = 1;
      else if (f < 0.1) dark = 1 - (f - 0.03) / 0.07;
      if (dark > 0.02) {
        const a = dark * 0.62;
        nightCtx.globalCompositeOperation = 'source-over';
        nightCtx.clearRect(0, 0, W, H);
        nightCtx.fillStyle = `rgba(8,12,38,${a})`; nightCtx.fillRect(0, 0, W, H);
        nightCtx.globalCompositeOperation = 'destination-out';
        const hole = (x, y, r, k) => { const g = nightCtx.createRadialGradient(x, y, r * 0.1, x, y, r); g.addColorStop(0, `rgba(0,0,0,${k})`); g.addColorStop(1, 'rgba(0,0,0,0)'); nightCtx.fillStyle = g; nightCtx.beginPath(); nightCtx.arc(x, y, r, 0, 6.28); nightCtx.fill(); };
        hole(tx(P.x), ty(P.y), sc * 6, 0.9);
        for (const b of S.buildings) { const d = GF.BUILDINGS[b.type]; const lit = b.type === 'lamp' ? 4.5 : ['furnace', 'smithy', 'ancient_forge', 'powerplant', 'townhall', 'lab', 'bakery', 'tower'].includes(b.type) ? 3.5 : 0; if (lit) hole(tx(b.x + d.w / 2), ty(b.y + d.h / 2), sc * lit, 0.85); }
        nightCtx.globalCompositeOperation = 'source-over';
        ctx.drawImage(nightCv, 0, 0);
      }
    }
    // damage vignette
    if (P.hurt > 0) { const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8); g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,0,0,${Math.min(0.5, P.hurt * 2)})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    const low = S.hp / GF.maxHp(S);
    if (low < 0.3 && !P.dead) { const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.85); g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, `rgba(120,0,0,${0.35 * (1 - low / 0.3) * (0.7 + 0.3 * Math.sin(time * 6))})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    // floating texts
    ctx.textAlign = 'center';
    for (const t of G.texts) { const k = t.t / 1.1; ctx.globalAlpha = 1 - k * k; ctx.font = `bold ${t.big ? 20 : 14}px sans-serif`; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; const px = tx(t.x), py = ty(t.y) - k * 40; ctx.strokeText(t.text, px, py); ctx.fillStyle = t.col; ctx.fillText(t.text, px, py); }
    ctx.globalAlpha = 1;
    // interaction prompt
    if (G.target && !G.panel && !P.dead) {
      const tg = G.target;
      let px = tg.npc ? tg.npc.x : tg.b ? tg.b.x + GF.BUILDINGS[tg.b.type].w / 2 : tg.portal ? tg.portal.x : tg.stone ? tg.stone.x : tg.tablet ? tg.tablet.x : tg.chest ? tg.chest.x : tg.treasure ? tg.treasure.x : tg.rift ? tg.rift.x : tg.door ? tg.door.x + 1 : P.x;
      let py = tg.npc ? tg.npc.y - 1.1 : tg.b ? tg.b.y - 0.3 : tg.portal ? tg.portal.y - 2.1 : tg.stone ? tg.stone.y - 0.9 : tg.tablet ? tg.tablet.y - 1 : tg.chest ? tg.chest.y - 0.7 : tg.treasure ? tg.treasure.y - 0.8 : tg.rift ? tg.rift.y - 1.7 : tg.door ? tg.door.y - 0.5 : P.y - 1.2;
      const label = `[E] ${tg.label}`;
      ctx.font = 'bold 13px sans-serif'; const w = ctx.measureText(label).width + 16;
      rr(tx(px) - w / 2, ty(py) - 16, w, 22, 6, 'rgba(10,14,24,0.85)'); ctx.fillStyle = '#ffe9a0'; ctx.textAlign = 'center'; ctx.fillText(label, tx(px), ty(py));
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

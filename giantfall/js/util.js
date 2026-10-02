// Shared helpers. Everything hangs off one global (GF) so the game runs from a plain
// double-clicked index.html (no bundler, no modules) and the logic can be unit-tested in Node.
(function (root) {
  'use strict';
  const GF = root.GF = root.GF || {};

  /** Small fast seeded PRNG (returns floats in [0,1)). */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(seed, x, y) {
    let h = (seed ^ 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (x | 0), 0x85ebca6b); h ^= h >>> 13;
    h = Math.imul(h ^ (y | 0), 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function strSeed(s) {
    s = String(s).trim();
    if (/^-?\d+$/.test(s)) return (Number(s) | 0) >>> 0;
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  /** Smooth value noise in [0,1]. */
  function vnoise(seed, x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash2(seed, x0, y0), b = hash2(seed, x0 + 1, y0), c = hash2(seed, x0, y0 + 1), d = hash2(seed, x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  function fbm(seed, x, y, oct) {
    let s = 0, amp = 1, norm = 0, f = 1;
    for (let i = 0; i < (oct || 3); i++) { s += amp * vnoise(seed + i * 101, x * f, y * f); norm += amp; amp *= 0.5; f *= 2; }
    return s / norm;
  }

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  /** 1234567 -> "1.23M", 12345 -> "12.3K" for compact HUD numbers. */
  function fmt(n) {
    n = Math.floor(n);
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (a >= 1e4) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
  }

  GF.util = { rng, hash2, strSeed, vnoise, fbm, clamp, lerp, dist, pick, fmt, fmtTime };
})(typeof window !== 'undefined' ? window : globalThis);

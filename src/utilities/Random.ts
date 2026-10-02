// Deterministic randomness. Terrain code must never touch Math.random.

/** Small fast seeded PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash of (seed, a, b, c) -> uint32. Used for per-column / per-chunk decisions. */
export function hash4(seed: number, a: number, b: number, c = 0): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (a | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (b | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h ^ (c | 0), 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x165667b1);
  h ^= h >>> 13;
  return h >>> 0;
}

export function hash01(seed: number, a: number, b: number, c = 0): number {
  return hash4(seed, a, b, c) / 4294967296;
}

/**
 * Turn user seed text into an int32. Numeric text is used exactly as the number
 * (so seed "482913" always means 482913); other text is hashed with FNV-1a.
 */
export function seedFromString(text: string): number {
  const t = text.trim();
  if (/^-?\d+$/.test(t)) {
    const n = Number(t);
    if (Number.isSafeInteger(n)) return n | 0;
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

/** Fresh random seed for "blank seed" world creation (the only place Math.random is allowed). */
export function randomSeed(): number {
  return (Math.floor(Math.random() * 2147483647) * (Math.random() < 0.5 ? -1 : 1)) | 0;
}

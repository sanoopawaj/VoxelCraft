import { CHUNK_SHIFT, CHUNK_SIZE } from './Constants';

/** Floor division that rounds toward -infinity (JS `/` + trunc is wrong for negatives). */
export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Always-positive modulo. */
export function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

/** World block coordinate -> chunk coordinate. Arithmetic shift floors correctly for negatives. */
export function worldToChunk(w: number): number {
  return Math.floor(w) >> CHUNK_SHIFT;
}

/** World block coordinate -> local coordinate inside its chunk (0..15). */
export function worldToLocal(w: number): number {
  return Math.floor(w) & (CHUNK_SIZE - 1);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Numeric chunk key; unique for |cx|,|cz| < 2^20 which is ~16M blocks from origin. */
export function chunkKey(cx: number, cz: number): number {
  return (cx + 1048576) * 2097152 + (cz + 1048576);
}

export function chunkKeyToCoords(key: number): [number, number] {
  const cz = (key % 2097152) - 1048576;
  const cx = Math.floor(key / 2097152) - 1048576;
  return [cx, cz];
}

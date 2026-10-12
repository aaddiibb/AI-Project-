// Seeded PRNG (mulberry32). The ONLY source of randomness an agent may use (no Math.random), so that a whole match replays
// bit-identically from its seeds.
export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export class Rng {
  constructor(seed = 1) { this.seed = seed >>> 0; this.s = this.seed || 1; }
  /** mulberry32 step (same sequence as mulberry32(seed)); `s` is the whole state, so an Rng can be saved and restored */
  next() { let a = (this.s + 0x6d2b79f5) | 0; this.s = a; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  int(n) { return Math.floor(this.next() * n); }
  pick(arr) { return arr[this.int(arr.length)]; }
  /** pick from [[item, weight], ...] */
  weighted(pairs) { let s = 0; for (const p of pairs) s += p[1]; let r = this.next() * s; for (const p of pairs) { if ((r -= p[1]) < 0) return p[0]; } return pairs[pairs.length - 1][0]; }
}
/** derive independent sub-seeds from one seed (splitmix-style) */
export function subSeed(seed, k) { let z = (seed * 0x9e3779b1 + k * 0x85ebca6b) >>> 0; z = Math.imul(z ^ (z >>> 16), 0x7feb352d) >>> 0; z = Math.imul(z ^ (z >>> 15), 0x846ca68b) >>> 0; return (z ^ (z >>> 16)) >>> 0; }

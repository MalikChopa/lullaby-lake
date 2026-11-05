// Seeded random numbers (mulberry32). Pure: no Math.random, no clock.

/** @param {number} seed integer */
export function mulberry32(seed) {
  let a = seed | 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mixes a seed and a label into a new integer seed (FNV-1a over the label, then a mix with the seed). */
export function hashSeed(seed, label) {
  let h = 0x811c9dc5 ^ (seed | 0);
  const s = String(label);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h | 0;
}

/** Independent stream derived from (seed, label): same pair = same sequence. */
export function fork(seed, label) {
  return mulberry32(hashSeed(seed, label));
}

/** Uniform float in [lo, hi) from a [lo, hi] pair. */
export function between(rng, range) {
  return range[0] + rng() * (range[1] - range[0]);
}

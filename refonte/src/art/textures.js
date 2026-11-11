// Small pixel textures painted by code (RGBA bytes), drawn with nearest filtering in the world at 16 px per metre (data/params.js TEXEL).
// They are mostly light grey patterns: the mesh's vertex colour gives the hue, the texture gives the pixel detail. Pure and deterministic.

import { mulberry32 } from '../../../src/core/rng.js';

function make(w, h, fn) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = fn(x, y);
      const i = (y * w + x) * 4;
      const [r, g, b] = Array.isArray(v) ? v : [v, v, v];
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  return { w, h, data: d };
}

/** Horizontal planks, 32x32 (4 planks of 8 px), seams and a few knots. For walls and the pier deck. */
export function planks(seed = 1) {
  const r = mulberry32(seed);
  const shade = Array.from({ length: 4 }, () => 222 + Math.floor(r() * 34));
  const joints = Array.from({ length: 4 }, () => Math.floor(r() * 32));
  const knots = Array.from({ length: 3 }, () => [Math.floor(r() * 32), Math.floor(r() * 32)]);
  return make(32, 32, (x, y) => {
    const p = y >> 3;
    if (y % 8 === 7) return 168;
    if (x === joints[p] && p % 2 === 0) return 196;
    if (knots.some(([kx, ky]) => Math.abs(kx - x) + Math.abs(ky - y) <= 1 && ky % 8 !== 7)) return 185;
    const grain = (x * 7 + p * 13) % 11 === 0 ? -14 : 0;
    return shade[p] + grain + (y % 8 === 0 ? 12 : 0);
  });
}

/** Roof shingles, 32x32: staggered rows of 8x6 tiles with a dark lower edge. */
export function shingles(seed = 2) {
  const r = mulberry32(seed);
  const tone = Array.from({ length: 64 }, () => 222 + Math.floor(r() * 30));
  return make(32, 32, (x, y) => {
    const row = Math.floor(y / 6) % 6;
    const off = row % 2 ? 4 : 0;
    const col = Math.floor((x + off) / 8) % 4;
    if (y % 6 === 5) return 172;
    if ((x + off) % 8 === 0) return 196;
    return tone[row * 4 + col] + (y % 6 === 0 ? 14 : 0);
  });
}

/** Stones (chimney, rocks), 16x16. */
export function stones(seed = 3) {
  const r = mulberry32(seed);
  const tone = Array.from({ length: 16 }, () => 190 + Math.floor(r() * 60));
  return make(16, 16, (x, y) => {
    const row = y >> 2;
    const off = row % 2 ? 2 : 0;
    const col = ((x + off) >> 2) & 3;
    if (y % 4 === 3 || (x + off) % 4 === 3) return 130;
    return tone[row * 4 + col];
  });
}

/** Ground detail, 32x32: soft value noise with a few bright and dark specks (multiplies the vertex colour of grass, dirt and sand). */
export function groundDetail(seed = 4) {
  const r = mulberry32(seed);
  const n = Array.from({ length: 32 * 32 }, () => r());
  return make(32, 32, (x, y) => {
    const v = n[y * 32 + x];
    const s = (n[((y + 1) % 32) * 32 + x] + n[y * 32 + ((x + 1) % 32)] + v) / 3;
    let g = 214 + Math.floor(s * 30);
    if (v > 0.97) g = 255;
    if (v < 0.03) g = 176;
    return g;
  });
}

/** Bark, 8x16: vertical streaks. */
export function bark(seed = 5) {
  const r = mulberry32(seed);
  const cols = Array.from({ length: 8 }, () => 180 + Math.floor(r() * 60));
  return make(8, 16, (x, y) => (y % 5 === (x * 3) % 5 ? 150 : cols[x]));
}

/** Cobbles, 32x32: rounded stones of 6-9 px with dark joints (plaza, street), multiplied by the ground colour. */
export function cobbles(seed = 6) {
  const r = mulberry32(seed);
  const pts = Array.from({ length: 18 }, () => [r() * 32, r() * 32, 200 + Math.floor(r() * 55)]);
  return make(32, 32, (x, y) => {
    let d1 = 99;
    let d2 = 99;
    let t = 230;
    for (const [px, py, tone] of pts)
      for (const ox of [-32, 0, 32])
        for (const oy of [-32, 0, 32]) {
          const d = Math.hypot(x + 0.5 - px - ox, y + 0.5 - py - oy);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            t = tone;
          } else if (d < d2) d2 = d;
        }
    if (d2 - d1 < 1.1) return 128;
    return Math.min(255, t + (d1 < 2 ? 14 : 0));
  });
}

/** Plaster, 16x16: soft light speckle (village walls). */
export function plaster(seed = 7) {
  const r = mulberry32(seed);
  return make(16, 16, () => 226 + Math.floor(r() * 22));
}

/** Leaves, 16x16: clustered light and dark texels (pines, bushes, trees), multiplied by the vertex colour. */
export function leaves(seed = 8) {
  const r = mulberry32(seed);
  return make(16, 16, (x, y) => {
    const v = r();
    return v > 0.86 ? 255 : v < 0.18 ? 168 : (x + y * 3) % 7 === 0 ? 190 : 222;
  });
}

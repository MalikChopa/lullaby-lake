// The lake, recomputed every frame (ported from maquette/v2/scene.js, optimised without changing the look):
// vertical gradient, wavy mirror of the sky and banks (mirror line just under the banks), dark water under the banks,
// quantised shimmer, sun/moon glitter. Writes only where the background is transparent (below the horizon).
// Pure: everything comes in as arguments. Hot loop = integer writes into a Uint32Array, per-row and per-column tables.

import { mixc, gradStops } from './raster.js';
import { W, H, HOR } from './sceneBake.js';

const MIRROR = HOR + 10;

/**
 * @param {Int16Array} bankBot lowest painted row of the land per column (the water darkens under it)
 * The look (water colours, rain) is set with setLook() whenever the blended mood changes; render() is called every frame.
 */
export function createWater(bankBot) {
  const rows = H - HOR;
  const mirrorAlpha = new Float64Array(rows);
  const baseR = new Float64Array(rows);
  const baseG = new Float64Array(rows);
  const baseB = new Float64Array(rows);
  const amp = new Float64Array(rows);
  const srow = new Int16Array(rows);
  for (let d = 0; d < rows; d++) srow[d] = MIRROR - 1 - Math.floor((HOR + d - MIRROR) * 0.82);
  // per-column tables for sin(a + x*k) = sin a cos(xk) + cos a sin(xk): one sin/cos per row instead of two sin per pixel
  const C1 = new Float64Array(W);
  const S1 = new Float64Array(W);
  const C2 = new Float64Array(W);
  const S2 = new Float64Array(W);
  for (let x = 0; x < W; x++) {
    C1[x] = Math.cos(x * 0.055);
    S1[x] = Math.sin(x * 0.055);
    C2[x] = Math.cos(x * 0.031);
    S2[x] = Math.sin(x * 0.031);
  }

  return {
    /** stops = 7 [r,g,b] (horizon to bottom), rainK = 0..1 (the rain roughens the surface and dims the mirror) */
    setLook(stops, rainK) {
      for (let d = 0; d < rows; d++) {
        const t = d / rows;
        const [a, b, k] = gradStops(stops, Math.pow(t, 0.8));
        const base = mixc(a, b, k);
        baseR[d] = base[0];
        baseG[d] = base[1];
        baseB[d] = base[2];
        mirrorAlpha[d] = (0.5 - 0.3 * t) * (1 - 0.3 * rainK);
        amp[d] = (0.5 + t * 2.4) * (1 + 0.4 * rainK);
      }
    },
    /**
     * Paints the water of one frame into `out` where `src` (the backdrop: sky + hills) is transparent. `still` freezes the motion.
     * body = { x, sun (bool), k (0..1 strength) } : the glitter column under the sun or the moon, or null.
     */
    render(out, src, time, still, body) {
      const tm = still ? 0 : time;
      const glintFrame = Math.floor(tm * 1.6);
      const hasBody = !!body && body.k > 0.01;
      const sun = hasBody && body.sun;
      const BODY_X = hasBody ? Math.round(body.x) : 0;
      const bk8 = hasBody ? body.k : 0;
      const glintShift = (1 - bk8) * 0.5;
      for (let d = 0; d < rows; d++) {
        const y = HOR + d;
        const t = d / rows;
        const row = y * W;
        const ox = still ? 0 : Math.round(Math.sin((d >> 1) * 0.9 + tm * 1.05) * amp[d]);
        const al = mirrorAlpha[d];
        const sr = srow[d];
        const srcRow = sr >= 0 && sr < H ? sr * W : -1;
        const a1 = d * 1.35 - tm * 0.7;
        const a2 = d * 0.6 + tm * 0.4;
        const sa1 = Math.sin(a1);
        const ca1 = Math.cos(a1);
        const sa2 = Math.sin(a2);
        const ca2 = Math.cos(a2);
        const bR = baseR[d];
        const bG = baseG[d];
        const bB = baseB[d];
        const gw = 5 + t * 22;
        const evenRow = (y & 1) === 0;
        for (let x = 0; x < W; x++) {
          const i = row + x;
          if (src[i] >>> 24 !== 0) continue; // the hills, trees and cabin stay on top of the water
          let r = bR;
          let g = bG;
          let b = bB;
          if (srcRow >= 0) {
            let sx = x + ox;
            sx = sx < 0 ? 0 : sx >= W ? W - 1 : sx;
            const s = src[srcRow + sx];
            r += ((s & 255) * 0.84 - r) * al;
            g += (((s >>> 8) & 255) * 0.84 - g) * al;
            b += (((s >>> 16) & 255) * 0.88 - b) * al;
          }
          const bk = bankBot[x];
          if (bk > 0 && y > bk && y < bk + 16) {
            const a3 = 0.62 * (1 - (y - bk) / 16);
            r += (26 - r) * a3;
            g += (30 - g) * a3;
            b += (74 - b) * a3;
          }
          const s2 = sa1 * C1[x] + ca1 * S1[x] + sa2 * C2[x] - ca2 * S2[x];
          if (s2 > 1.9) {
            r += 22;
            g += 17;
            b += 14;
          }
          if (hasBody) {
            const dxm = x > BODY_X ? x - BODY_X : BODY_X - x;
            if (dxm < gw) {
              const f = (1 - dxm / gw) * bk8;
              r += f * (sun ? 22 : 16);
              g += f * 14;
              b += f * 6;
              if (evenRow) {
                const h = ((x * 374761393 + y * 668265263 + (glintFrame + ((y >> 1) & 3)) * 1442695041) >>> 0) / 4294967296;
                if (h > 0.74 - (1 - dxm / gw) * 0.12 + glintShift) {
                  r = 255;
                  g = 240;
                  b = 196;
                }
              }
            }
          }
          r = r > 255 ? 255 : r;
          g = g > 255 ? 255 : g;
          b = b > 255 ? 255 : b;
          out[i] = 0xff000000 | (((b + 0.5) | 0) << 16) | (((g + 0.5) | 0) << 8) | ((r + 0.5) | 0);
        }
      }
    },
  };
}

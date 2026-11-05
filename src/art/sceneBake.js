// Static scene painted by code into RGBA rasters (480x270), ported from the approved mock-up (maquette/v2/scene.js).
// Two layers, baked once per preset:
//   background : sky, stars, sun/moon, clouds, 4 ridges, pines on far/near banks, shores, cabin. Water is NOT in it (transparent below the horizon).
//   foreground : pier with submerged posts, lantern, angler, cat, lily pads, reeds. Drawn after the water.
// Deterministic: the same (preset, seed) always gives the same pixels. Pure.

import { mulberry32 } from '../core/rng.js';
import { dith } from './dither.js';
import { drawCat, CAT_AT } from './catPaint.js';
import { createRaster, hx, hexs, mixc, lerp, clamp, gradStops } from './raster.js';

export const W = 480;
export const H = 270;
export const HOR = 150; // horizon row
export const PIER_Y = 203; // top of the pier deck
export const PIER_END = 240; // right end of the pier
export const WATER_ROWS = H - HOR;

const MIRROR = HOR + 10; // mirror line of the reflections (just under the banks)

/** Lowest painted row of the background below the mirror line, per column (-1 = none): the water darkens under it. */
function computeBankBottom(buf) {
  const bank = new Int16Array(W).fill(-1);
  for (let x = 0; x < W; x++) {
    for (let y = H - 1; y >= MIRROR; y--) {
      if (buf[y * W + x] >>> 24 > 0) {
        bank[x] = y;
        break;
      }
    }
  }
  return bank;
}

export const STAR_COUNT = 170; // the star field of the live scene (a mood shows the first n of them)
const STAR_RESERVE = 70 * 3; // random values the legacy dusk bake spends on its 70 stars: the live bake skips as many, so the trees stay where they were

/** Colour of each sky row (two rows share a colour), as [r, g, b] floats: Float64Array(HOR * 3). */
export function bakeSkyRows(P) {
  const SKY = hexs(P.sky);
  const out = new Float64Array(HOR * 3);
  for (let y = 0; y < HOR; y++) {
    const [a, b, t] = gradStops(SKY, (y & ~1) / HOR);
    const c = mixc(a, b, t);
    out[y * 3] = c[0];
    out[y * 3 + 1] = c[1];
    out[y * 3 + 2] = c[2];
  }
  return out;
}

/** The star field (the same stars for every mood, a mood lights the first n): { x, y, k (colour pick), color: [r,g,b] } per star. */
export function makeStars(seed = 19, n = STAR_COUNT) {
  const rnd = mulberry32(seed);
  const stars = [];
  for (let i = 0; i < n; i++) {
    const x = (rnd() * W) | 0;
    const y = (rnd() * 105) | 0;
    const k = rnd();
    stars.push({ x, y, arms: k < 0.08, color: k < 0.15 ? [255, 255, 255] : k < 0.5 ? [255, 240, 200] : [201, 196, 255] });
  }
  return stars;
}

/**
 * @param {object} P mood preset  @param {number} seed
 * @param {boolean} live true = the layer of the live scene: land only (no sky, stars, sun/moon, clouds, no window glow or lit window);
 *   those are drawn every frame by the live scene. false = the complete picture of J1b (reference for the mock-up comparison).
 * @returns {{buf:Uint32Array, bankBot:Int16Array}}
 */
export function bakeBackground(P, seed = 19, live = false) {
  const R = createRaster(W, H);
  R.setGrade(P.grade);
  const { px, rc, pxr, rcr } = R;
  const rnd = mulberry32(seed);
  const SKY = hexs(P.sky);
  const skyAt = (y) => {
    const [a, b, t] = gradStops(SKY, y / HOR);
    return mixc(a, b, t);
  };

  if (live) {
    for (let i = 0; i < STAR_RESERVE; i++) rnd();
  } else {
  // sky bands: two rows share a colour (no dither)
  for (let y = 0; y < HOR; y++) {
    const [a, b, t] = gradStops(SKY, (y & ~1) / HOR);
    rcr(0, y, W, 1, mixc(a, b, t));
  }
  // stars
  for (let i = 0; i < P.stars; i++) {
    const x = (rnd() * W) | 0;
    const y = (rnd() * 105) | 0;
    const k = rnd();
    pxr(x, y, k < 0.15 ? '#ffffff' : k < 0.5 ? '#fff0c8' : '#c9c4ff');
    if (k < 0.08 && P.stars > 100) {
      pxr(x - 1, y, '#8f8ad0');
      pxr(x + 1, y, '#8f8ad0');
      pxr(x, y - 1, '#8f8ad0');
      pxr(x, y + 1, '#8f8ad0');
    }
  }
  // sun or moon, halo in clean steps (no dither)
  if (P.body) {
    const mx = 332;
    const my = 54;
    const Rr = P.body === 'sun' ? 14 : 16;
    const warm = P.body === 'sun' ? hx('#fff2c0') : hx('#ffe2b4');
    for (let dy = -44; dy <= 44; dy++) {
      for (let dx = -44; dx <= 44; dx++) {
        const d = Math.hypot(dx, dy);
        const x = mx + dx;
        const y = my + dy;
        if (y < 0 || y >= HOR || x < 0 || x >= W) continue;
        if (d <= Rr) {
          if (P.body === 'sun') {
            pxr(x, y, d < Rr - 3 ? '#fffbe0' : '#fff0b0');
          } else {
            const lit = Math.hypot(dx + 5, dy - 4) > Rr * 0.92;
            let c = lit ? '#e8cf98' : '#fff3cc';
            if (Math.hypot(dx - 5, dy + 4) < 3.4) c = '#e9d09a';
            if (Math.hypot(dx + 4, dy + 7) < 2.8) c = '#e5c88c';
            if (Math.hypot(dx - 7, dy - 6) < 2.2) c = '#ead3a2';
            if (d > Rr - 1.3 && !lit) c = '#fffbe6';
            pxr(x, y, c);
          }
        } else if (d < Rr + 28) {
          const band = Math.floor((1 - (d - Rr) / 28) * 4);
          if (band >= 1) pxr(x, y, mixc(skyAt(y), warm, band * 0.085));
        }
      }
    }
  }
  // clouds: bumpy, 5 tones
  const CP = P.clouds.map(hx);
  for (const [cx, cy, w, hh] of P.cl) {
    for (let x = -w / 2; x <= w / 2; x++) {
      const u = (x + w / 2) / w;
      const prof = Math.pow(Math.sin(Math.PI * u), 0.7) * (0.62 + 0.38 * Math.sin(u * 9 + cx)) * hh;
      if (prof < 1) continue;
      const lump = Math.abs(Math.sin(u * Math.PI * 3.2 + cx * 0.07)) * hh * 0.38 * Math.sin(Math.PI * u);
      const top = cy - prof * 0.62 - lump;
      const bot = cy + prof * 0.38;
      for (let y = Math.floor(top); y <= bot; y++) {
        const v = (y - top) / (bot - top);
        let c;
        if (v < 0.14) c = CP[0];
        else if (v < 0.34) c = dith(cx + x, y, (v - 0.14) / 0.2) ? CP[1] : CP[0];
        else if (v < 0.6) c = CP[2];
        else if (v < 0.8) c = dith(cx + x, y, (v - 0.6) / 0.2) ? CP[3] : CP[2];
        else c = CP[4];
        pxr((cx + x) | 0, y, c);
      }
    }
  }
  }
  // four ridges
  function ridge(base, amp, f, off, lit, shade, fog, fogK, snow) {
    const l = hx(lit);
    const s = hx(shade);
    const fg = hx(fog);
    const ys = [];
    for (let x = -3; x < W + 12; x++) {
      const n = Math.sin(x * f + off) * 0.55 + Math.sin(x * f * 2.3 + off * 1.7) * 0.3 + Math.sin(x * f * 5.1 + off * 0.6) * 0.15;
      ys[x + 3] = Math.round(base - amp * (0.5 + 0.5 * n));
    }
    for (let x = 0; x < W; x++) {
      const y = ys[x + 3];
      const sl = (ys[Math.min(W + 10, x + 9)] - ys[Math.max(0, x - 3)]) / 12;
      const lf = clamp(0.5 + sl * 0.9, 0, 1);
      const avg = mixc(l, s, 0.5);
      const bc0 = mixc(s, l, lf);
      for (let yy = y; yy <= HOR + 3; yy++) {
        const d = (yy - y) / Math.max(1, HOR - y);
        const bc = mixc(bc0, avg, Math.min(1, (yy - y) / 22));
        let c = mixc(bc, fg, Math.min(1, d * fogK));
        if (rnd() < 0.03) c = mixc(c, s, 0.2);
        if (yy === y) c = mixc(c, [255, 236, 214], 0.4);
        else if (yy === y + 1 && sl >= 0) c = mixc(c, [255, 220, 200], 0.16);
        if (snow && yy <= y + 2) c = mixc(c, [255, 236, 244], yy === y ? 0.7 : yy === y + 1 ? 0.45 : 0.22);
        px(x, yy, c);
      }
    }
  }
  const M = P.mt;
  ridge(HOR - 4, 102, 0.0072, 1.1, ...M[0], 1.1, true);
  ridge(HOR - 2, 74, 0.0102, 3.3, ...M[1], 0.95, true);
  ridge(HOR, 48, 0.0158, 5.2, ...M[2], 0.8, false);
  ridge(HOR + 1, 28, 0.026, 0.5, ...M[3], 0.55, false);
  const PN1 = P.pn;

  // a tapered pine: tiers of widening rows, light on the right, dark on the left, a trunk
  function pine(x, by, h, cl, cd, ch) {
    const L = hx(cl);
    const D = hx(cd);
    const Hh = hx(ch);
    const TR = mixc(D, [34, 22, 38], 0.5);
    const nt = Math.max(3, Math.round(h / 5.5));
    const tierH = h / nt;
    const trunkH = Math.max(2, Math.round(h * 0.08));
    const topY = by - h;
    const trw = h > 60 ? 4 : 2;
    rc(x - (trw >> 1), by - trunkH, trw, trunkH, TR);
    rc(x - (trw >> 1), by - trunkH, 1, trunkH, mixc(TR, [255, 200, 160], 0.18));
    for (let k = 0; k < nt; k++) {
      const y0 = topY + k * tierH * 0.8;
      const rows = Math.max(3, Math.round(tierH * 1.55));
      const wmax = Math.max(1.6, ((k + 1) / nt) * h * 0.33 + 1);
      for (let r = 0; r < rows; r++) {
        const f = r / (rows - 1);
        let half = wmax * (0.22 + 0.78 * f);
        if (r >= rows - 2) half += (k * 7 + r * 3) % 3 === 0 ? 0.9 : -0.2;
        const hw = Math.max(0, Math.round(half));
        const y = Math.round(y0 + r);
        if (y > by) continue;
        for (let dx = -hw; dx <= hw; dx++) {
          const side = hw ? dx / hw : 0;
          let c = side < -0.2 ? D : side > 0.35 ? L : mixc(D, L, (side + 0.2) / 0.55);
          if (k > 0 && r < rows * 0.3) c = mixc(c, [14, 12, 38], 0.32);
          if (dx >= hw - 1 && side > 0.5 && r > 1) c = Hh;
          const nz = ((x + dx) * 13 + y * 7 + k * 5) % 11;
          if (nz === 0) c = mixc(c, [255, 255, 255], 0.07);
          else if (nz === 5) c = mixc(c, [8, 6, 28], 0.16);
          px(x + dx, y, c);
        }
      }
    }
  }
  // far banks: the trees are planted in them (no floating trunks)
  for (let x = 0; x < W; x++) {
    const t1 = HOR + 1 + Math.round(Math.sin(x * 0.05) * 0.8);
    for (let y = t1; y < HOR + 6; y++) px(x, y, y === t1 ? '#4a4f88' : '#2c3562');
  }
  for (let x = -6; x < W; x += 5 + ((rnd() * 5) | 0)) pine(x, HOR + 5, 12 + ((rnd() * 14) | 0), ...PN1[0]);
  for (let x = 0; x < W; x++) {
    const t2 = HOR + 5 + Math.round(Math.sin(x * 0.07 + 1) * 1);
    for (let y = t2; y < HOR + 10; y++) px(x, y, y === t2 ? '#3a4378' : '#222a52');
  }
  for (let x = -4; x < W; x += 6 + ((rnd() * 6) | 0)) pine(x, HOR + 9, 16 + ((rnd() * 20) | 0), ...PN1[1]);

  function shore(x0, x1, topf, botf, c, rim) {
    for (let x = x0; x <= x1; x++) {
      const t = Math.round(topf(x));
      const bot = Math.round(botf(x));
      for (let y = t; y < bot; y++) {
        px(x, y, y === t ? rim : y < t + 3 && dith(x, y, 0.25) ? mixc(hx(c), hx(rim), 0.3) : y > bot - 2 ? mixc(hx(c), [70, 76, 130], 0.35) : c);
      }
    }
  }
  const topR = (x) => HOR + 3 + Math.sin((x - 296) * 0.05) * 1.5;
  const botR = (x) => {
    const u = (x - 296) / (W - 296);
    return HOR + 8 + Math.sin(Math.min(1, u * 1.3) * Math.PI * 0.5) * 13 + Math.sin(x * 0.2) * 1.2;
  };
  const topL = (x) => HOR + 7 + Math.max(0, 150 - x) * 0.1 + Math.sin(x * 0.12) * 1.2;
  const botL = (x) => {
    const u = 1 - x / 175;
    return HOR + 10 + Math.pow(Math.max(0, u), 0.7) * 30 + Math.sin(x * 0.17) * 1.2;
  };
  shore(296, W - 1, topR, botR, '#20264f', '#3b4573');
  shore(0, 175, topL, botL, '#1c2147', '#323b68');
  for (const [x, h] of [[352, 34], [372, 26], [460, 64], [479, 92], [330, 22], [346, 18]]) pine(x, Math.round(lerp(topR(x), botR(x), 0.6)), h, ...PN1[2]);
  for (const [x, h] of [[8, 112], [40, 92], [70, 120], [100, 78], [126, 96], [24, 64]]) pine(x, Math.round(lerp(topL(x), botL(x), 0.55)), h, ...PN1[3]);
  // grass tufts and pebbles: the shore is real ground
  const grass = (x0, x1, topf) => {
    for (let x = x0; x <= x1; x++) {
      if (rnd() < 0.38) {
        const t = Math.round(topf(x));
        const hh = 1 + ((rnd() * 3) | 0);
        for (let k = 1; k <= hh; k++) px(x, t - k, k === hh ? '#3a6080' : '#27456a');
      }
    }
  };
  grass(296, W - 1, topR);
  grass(0, 175, topL);
  for (const [rx, ry, rr] of [[322, HOR + 12, 4], [452, HOR + 14, 5], [156, HOR + 14, 4], [22, HOR + 30, 6], [88, HOR + 22, 4]]) {
    for (let dy = -rr; dy <= rr * 0.6; dy++) {
      for (let dx = -rr; dx <= rr; dx++) {
        if ((dx * dx) / (rr * rr) + (dy * dy) / (rr * rr * 0.45) <= 1) px(rx + dx, ry + Math.round(dy * 0.7), dy < -rr * 0.2 && dx < rr * 0.3 ? '#6c76a8' : dx > rr * 0.4 ? '#2c3262' : '#454f82');
      }
    }
  }
  // cabin: logs, roof, chimney, window with a soft glow clipped to the wall, door, woodpile, jetty
  {
    const bx = 392;
    const by = HOR - 18;
    for (let y = 0; y < 26; y++) {
      for (let x = 0; x < 48; x++) {
        const row = Math.floor(y / 3) % 2;
        const c = row ? '#8f5a45' : '#a96d4e';
        px(bx + x, by + y, y % 3 === 2 ? '#6e4234' : c);
        if (y % 3 === 0 && (x % 12 === 3 || x % 12 === 9) && row === 0) px(bx + x, by + y, '#bf8460');
      }
    }
    rc(bx, by, 2, 26, '#6e4234');
    rc(bx + 46, by, 2, 26, '#5e3a30');
    for (let r = 0; r < 22; r++) {
      const half = Math.round(26 * (r / 22)) + 2;
      for (let dx = -half; dx <= half; dx++) {
        const x = bx + 24 + dx;
        const y = by - 20 + r;
        let c = r % 3 === 0 ? '#9a3d52' : (Math.floor((dx + 60) / 4) + Math.floor(r / 3)) % 2 ? '#cf5f5c' : '#bd4f58';
        if (dx > half - 3) c = mixc(hx(c), hx('#f0907a'), 0.35);
        px(x, y, c);
      }
    }
    for (let dx = -27; dx <= 27; dx++) px(bx + 24 + dx, by + 2, '#7a2f45');
    rc(bx + 31, by - 26, 8, 16, '#7a6070');
    for (let i = 0; i < 14; i++) px(bx + 31 + ((i * 5) % 8), by - 26 + ((i * 3) % 16), '#5e4658');
    rc(bx + 30, by - 28, 10, 3, '#8f7584');
    rc(bx + 7, by + 9, 14, 11, '#4a3040');
    if (!live && P.cabinLight > 0.3) {
      for (let k = 3; k >= 1; k--) {
        const r = 5 + k * 2;
        const alpha = 0.07 * k * Math.min(1, P.cabinLight);
        for (let dy = -r; dy <= r; dy++) {
          if (by + 14 + dy > by + 23 || by + 14 + dy < by + 3) continue;
          const hw = Math.floor(Math.sqrt(r * r - dy * dy));
          const xa = Math.max(bx + 2, bx + 14 - hw);
          const xb = Math.min(bx + 45, bx + 14 + hw);
          R.rcA(xa, by + 14 + dy, xb - xa + 1, 1, [255, 216, 132], alpha);
        }
      }
      rcr(bx + 8, by + 10, 12, 9, '#ffd884');
      rcr(bx + 8, by + 10, 6, 2, '#ffefb0');
    } else {
      rcr(bx + 8, by + 10, 12, 9, '#8fb0c8');
      rcr(bx + 8, by + 10, 6, 2, '#c8dcea');
    }
    rc(bx + 13, by + 10, 2, 9, '#4a3040');
    rc(bx + 8, by + 14, 12, 1, '#4a3040');
    rc(bx + 6, by + 20, 16, 2, '#6e4234');
    rc(bx + 30, by + 7, 10, 19, '#5e3a4a');
    rc(bx + 31, by + 8, 8, 18, '#704454');
    rc(bx + 36, by + 17, 2, 2, '#ffd884');
    for (let i = 0; i < 8; i++) px(bx + 31 + i, by + 8 + Math.round(Math.sin((i / 7) * Math.PI) * -2), '#5e3a4a');
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 4 - i; j++) {
        rc(bx - 14 + j * 5 + i * 2, by + 24 - i * 4, 5, 4, '#8f5a45');
        px(bx - 12 + j * 5 + i * 2, by + 25 - i * 4, '#d9a070');
      }
    }
    for (let x = 0; x < 30; x++) {
      const t = Math.sin((x / 29) * Math.PI);
      const y = HOR + 10 + Math.round(t * -1);
      rc(344 + x, y, 1, Math.max(2, Math.round(t * 4)), x % 2 ? '#8a5640' : '#7a4a38');
      px(344 + x, y, '#d9a070');
    }
  }
  return { buf: R.buf, bankBot: computeBankBottom(R.buf) };
}

/** @returns {{buf:Uint32Array}} the foreground layer (partly translucent: submerged posts) */
export function bakeForeground(P, seed = 77, live = false) {
  const R = createRaster(W, H);
  R.setGrade(P.grade);
  const { px, rc, rcr, rcA } = R;
  const rnd = mulberry32(seed);
  const wc = hx(P.water[4]);
  const SUB = [wc[0] * 0.78, wc[1] * 0.78, wc[2] * 0.84];
  const PY = PIER_Y;
  const PE = PIER_END;
  // deck, planks, front beam
  rc(0, PY, PE, 5, '#c88b5e');
  rc(0, PY, PE, 1, '#e8b684');
  for (let x = 8; x < PE; x += 15) {
    rc(x, PY + 1, 1, 4, '#a56a47');
    px(x + 3, PY + 2, '#a56a47');
    px(x + 9, PY + 3, '#d9a070');
  }
  rc(0, PY + 5, PE, 5, '#9a6046');
  rc(0, PY + 5, PE, 1, '#6e4234');
  rc(0, PY + 9, PE, 1, '#5e3a30');
  for (let x = 0; x < PE; x += 6) px(x + (((x / 6) | 0) % 3), PY + 7, '#b57c58');
  rc(PE - 2, PY, 4, 10, '#a56a47');
  // posts going into the water: dark translucent part below the surface, glints on the waterline
  for (const x of [10, 62, 114, 166, 218]) {
    rc(x, PY + 10, 7, 21, '#8a5640');
    rc(x, PY + 10, 2, 21, '#b0744e');
    rc(x + 5, PY + 10, 2, 21, '#5e3a30');
    for (let y = PY + 14; y < PY + 30; y += 7) px(x + 3, y, '#6e4234');
    rcA(x, PY + 31, 7, H - PY - 31, SUB, 0.84);
    rcA(x, PY + 31, 2, H - PY - 31, [255, 255, 255], 0.14);
    rcA(x + 5, PY + 31, 2, H - PY - 31, [10, 8, 40], 0.3);
    rc(x - 1, PY + 10, 9, 2, '#6e4234');
    rcA(x - 4, PY + 31, 15, 1, [230, 214, 246], 0.35);
    rcA(x - 2, PY + 32, 11, 1, [230, 214, 246], 0.2);
  }
  // rope between the posts
  for (let i = 0; i < 4; i++) {
    const xa = [10, 62, 114, 166][i] + 6;
    const xb = [62, 114, 166, 218][i] + 1;
    for (let x = xa; x <= xb; x++) {
      const t = (x - xa) / (xb - xa);
      px(x, PY + 14 + Math.round(Math.sin(t * Math.PI) * 5), '#e0c490');
    }
  }
  // bollard and lantern post
  rc(232, PY - 22, 5, 22, '#8a5640');
  rc(232, PY - 22, 1, 22, '#b0744e');
  rc(231, PY - 23, 7, 2, '#6e4234');
  rc(186, PY - 34, 3, 34, '#6e4234');
  rc(180, PY - 52, 15, 3, '#c8564e');
  rc(182, PY - 55, 11, 3, '#e0705a');
  rc(186, PY - 58, 3, 3, '#4a3040');
  rc(181, PY - 49, 13, 15, '#4a3040');
  rcr(183, PY - 47, 9, 11, !live && P.lamp > 0.5 ? '#ffe29a' : '#d8c898');
  rc(186, PY - 47, 3, 11, '#4a3040');
  rcr(183, PY - 47, 9, 3, !live && P.lamp > 0.5 ? '#fff6d0' : '#efe2b8');
  rc(180, PY - 34, 15, 3, '#c8564e');
  // angler: body, scarf, head, hat resting on the head (the brim touches the forehead), seat
  {
    const ax = 221;
    rc(ax + 3, 185, 14, 18, '#c4605a');
    rc(ax + 3, 185, 3, 18, '#98484f');
    rc(ax + 14, 185, 3, 18, '#d87d6a');
    rc(ax + 3, 196, 14, 2, '#7a3a44');
    rc(ax + 6, 182, 9, 4, '#e8dcc0');
    rc(ax + 4, 184, 4, 4, '#d6c8a4');
    px(ax + 2, 186, '#d6c8a4');
    px(ax + 1, 188, '#d6c8a4');
    rc(ax + 8, 171, 9, 11, '#f0c6a0');
    rc(ax + 8, 171, 2, 11, '#d8a888');
    rc(ax + 16, 175, 1, 2, '#d8a888');
    rc(ax + 8, 171, 4, 6, '#5a3a3a');
    px(ax + 14, 176, '#2a1c30');
    px(ax + 15, 176, '#2a1c30');
    px(ax + 15, 179, '#c98a78');
    rc(ax + 4, 169, 19, 2, '#e9c26e');
    rc(ax + 5, 171, 17, 1, '#b88a48');
    rc(ax + 9, 161, 9, 8, '#f2d488');
    rc(ax + 9, 165, 9, 2, '#c8564e');
    px(ax + 13, 162, '#fff0b0');
    px(ax + 14, 162, '#fff0b0');
    px(ax + 10, 162, '#fbe4a0');
    for (let i = 0; i < 14; i++) rc(ax + 12 + i, 190 - Math.round(i * 0.45), 3, 3, '#c4605a');
    rc(ax + 25, 185, 3, 3, '#f0c6a0');
    rc(ax + 26, 184, 2, 2, '#6a4a3a');
    rc(ax + 6, 200, 16, 5, '#364570');
    rc(ax + 6, 200, 16, 1, '#4c5c90');
    rc(ax + 16, 204, 6, 16, '#364570');
    rc(ax + 16, 204, 2, 16, '#2a3560');
    rc(ax + 16, 218, 7, 4, '#2a2030');
    px(ax + 17, 218, '#5a4a5a');
  }
  // the live scene draws the cat itself, every frame (art/compose.js, art/catPaint.js): its poses change
  if (!live) drawCat(R, CAT_AT[0], CAT_AT[1]);
  // lily pads and a flower
  for (const [x, y, w] of [[346, 240, 16], [372, 248, 13], [330, 254, 11], [394, 238, 10]]) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -w; dx <= w; dx++) {
        if ((dx * dx) / (w * w) + (dy * dy) / 9 <= 1 && !(dx > w * 0.2 && dx < w * 0.5 && dy === 0)) px(x + dx, y + dy, dy < 0 ? '#58a080' : '#3f7a6a');
      }
    }
    px(x + w - 3, y - 1, '#7ac0a0');
  }
  px(344, 236, '#f4a8b8');
  rc(343, 237, 3, 2, '#f4a8b8');
  px(344, 235, '#ffd0d8');
  // reeds in the lower right corner, some with a cattail
  function reed(x, h, l, c, cat) {
    for (let i = 0; i < h; i++) {
      const t = i / h;
      px(x + Math.round(l * t * t), H - i, c);
      if (i % 3) px(x + Math.round(l * t * t) + 1, H - i, c);
    }
    if (cat) {
      const ex = x + l;
      const ey = H - h;
      rc(ex - 1, ey - 12, 4, 12, '#6a4a52');
      rc(ex - 1, ey - 12, 1, 12, '#8a6068');
      rc(ex + 1, ey - 16, 1, 5, '#3a7064');
    }
  }
  for (let i = 0; i < 12; i++) reed(398 + i * 7 + ((rnd() * 5) | 0), 40 + ((rnd() * 34) | 0), -14 + ((rnd() * 26) | 0), i % 2 ? '#2e5a58' : '#3a7064', i % 3 === 0);
  for (let i = 0; i < 7; i++) reed(432 + i * 7, 20 + ((rnd() * 20) | 0), -8 + ((rnd() * 16) | 0), '#245050', false);
  return { buf: R.buf };
}

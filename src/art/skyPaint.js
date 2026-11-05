// What moves in the sky, drawn every frame into the backdrop (before the hills, so the hills hide it): stars, sun, moon, clouds.
// Sprites are built once from the approved mock-up's shapes (maquette/v2/scene.js); only their place, opacity and colour change.
// Pure: arrays in, pixels out. All positions are whole pixels (no antialiasing).

import { W, HOR } from './sceneBake.js';
import { dith } from './dither.js';
import { hx } from './palette.js';

const px32 = (r, g, b) => (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;

/** Blends rgb (0..255) at opacity a over an opaque pixel of buf. */
function over(buf, i, r, g, b, a) {
  const d = buf[i];
  const k = 1 - a;
  const rr = (r * a + (d & 255) * k + 0.5) | 0;
  const gg = (g * a + ((d >>> 8) & 255) * k + 0.5) | 0;
  const bb = (b * a + ((d >>> 16) & 255) * k + 0.5) | 0;
  buf[i] = (0xff000000 | (bb << 16) | (gg << 8) | rr) >>> 0;
}

// ------------------------------------------------------------------ stars

/** n = how many stars are lit (fractional: the last one is partly lit). Stars never show on a bright sky (alpha follows the sky's darkness). */
export function paintStars(buf, stars, n) {
  if (n <= 0) return;
  const full = n >= 100;
  for (let i = 0; i < stars.length && i < n; i++) {
    const s = stars[i];
    const a0 = Math.min(1, n - i);
    const j = s.y * W + s.x;
    const d = buf[j];
    const lum = 0.3 * (d & 255) + 0.59 * ((d >>> 8) & 255) + 0.11 * ((d >>> 16) & 255);
    const dark = lum >= 150 ? 0 : lum <= 90 ? 1 : (150 - lum) / 60;
    const a = a0 * dark;
    if (a <= 0.02) continue;
    over(buf, j, s.color[0], s.color[1], s.color[2], a);
    if (s.arms && full) {
      const arm = a * 0.9;
      over(buf, j - 1, 143, 138, 208, arm);
      over(buf, j + 1, 143, 138, 208, arm);
      if (s.y > 0) over(buf, j - W, 143, 138, 208, arm);
      over(buf, j + W, 143, 138, 208, arm);
    }
  }
}

// ------------------------------------------------------------------ sun and moon

/** Disc + stepped halo of the mock-up, as offsets: { n, dx, dy, band (-1 = disc), tone (colour index of the disc) }. */
function bodySprite(kind) {
  const Rr = kind === 'sun' ? 14 : 16;
  const dx = [];
  const dy = [];
  const band = [];
  const tone = [];
  for (let y = -44; y <= 44; y++) {
    for (let x = -44; x <= 44; x++) {
      const d = Math.hypot(x, y);
      if (d <= Rr) {
        let t;
        if (kind === 'sun') {
          t = d < Rr - 3 ? 0 : 1;
        } else {
          const lit = Math.hypot(x + 5, y - 4) > Rr * 0.92;
          t = lit ? 1 : 0;
          if (Math.hypot(x - 5, y + 4) < 3.4) t = 2;
          if (Math.hypot(x + 4, y + 7) < 2.8) t = 3;
          if (Math.hypot(x - 7, y - 6) < 2.2) t = 4;
          if (d > Rr - 1.3 && !lit) t = 5;
        }
        dx.push(x);
        dy.push(y);
        band.push(-1);
        tone.push(t);
      } else if (d < Rr + 28) {
        const b = Math.floor((1 - (d - Rr) / 28) * 4);
        if (b >= 1) {
          dx.push(x);
          dy.push(y);
          band.push(b);
          tone.push(0);
        }
      }
    }
  }
  return { n: dx.length, dx: Int8Array.from(dx), dy: Int8Array.from(dy), band: Int8Array.from(band), tone: Uint8Array.from(tone) };
}
const SPRITES = {};
const SUN_TONES = [hx('#fffbe0'), hx('#fff0b0')];
const MOON_TONES = [hx('#fff3cc'), hx('#e8cf98'), hx('#e9d09a'), hx('#e5c88c'), hx('#ead3a2'), hx('#fffbe6')];
const ORANGE = [255, 168, 104];

/**
 * @param {Uint32Array} buf backdrop  @param {'sun'|'moon'} kind  @param {{x:number,y:number,a:number,elev:number}} body
 * A low sun turns orange (its disc, its halo); the moon stays pale.
 */
export function paintBody(buf, kind, body) {
  if (!body || body.a <= 0.01) return;
  const sp = SPRITES[kind] || (SPRITES[kind] = bodySprite(kind));
  const cx = Math.round(body.x);
  const cy = Math.round(body.y);
  const warm = kind === 'sun' ? hx('#fff2c0') : hx('#ffe2b4');
  const low = kind === 'sun' ? Math.min(1, Math.max(0, 1 - body.elev / 0.4)) : 0;
  const tones = (kind === 'sun' ? SUN_TONES : MOON_TONES).map((t) => (low > 0 ? t.map((v, c) => v + (ORANGE[c] - v) * low * 0.75) : t));
  const halo = low > 0 ? warm.map((v, c) => v + (ORANGE[c] - v) * low * 0.7) : warm;
  const a = body.a;
  for (let k = 0; k < sp.n; k++) {
    const x = cx + sp.dx[k];
    const y = cy + sp.dy[k];
    if (y < 0 || y >= HOR || x < 0 || x >= W) continue;
    const i = y * W + x;
    if (sp.band[k] < 0) {
      const t = tones[sp.tone[k]];
      if (a >= 0.995) buf[i] = px32(t[0] | 0, t[1] | 0, t[2] | 0);
      else over(buf, i, t[0], t[1], t[2], a);
    } else {
      over(buf, i, halo[0], halo[1], halo[2], sp.band[k] * 0.085 * a);
    }
  }
}

// ------------------------------------------------------------------ clouds

/** A bumpy cloud as tone indices 0..4 (255 = none), built from the mock-up's formula. */
export function makeCloudSprite(c) {
  const { x: cx, y: cy, w, h: hh } = c;
  const half = Math.ceil(w / 2) + 1;
  const wpx = half * 2 + 1;
  const rows = [];
  let minY = 1e9;
  let maxY = -1e9;
  const cols = [];
  for (let x = -w / 2; x <= w / 2; x++) {
    const u = (x + w / 2) / w;
    const prof = Math.pow(Math.sin(Math.PI * u), 0.7) * (0.62 + 0.38 * Math.sin(u * 9 + cx)) * hh;
    if (prof < 1) continue;
    const lump = Math.abs(Math.sin(u * Math.PI * 3.2 + cx * 0.07)) * hh * 0.38 * Math.sin(Math.PI * u);
    const top = cy - prof * 0.62 - lump;
    const bot = cy + prof * 0.38;
    const y0 = Math.floor(top);
    cols.push({ x: Math.trunc(x) + half, top, bot, y0, xw: cx + x });
    minY = Math.min(minY, y0);
    maxY = Math.max(maxY, Math.floor(bot));
  }
  const hpx = maxY - minY + 1;
  const data = new Uint8Array(wpx * hpx).fill(255);
  for (const col of cols) {
    for (let y = col.y0; y <= col.bot; y++) {
      const v = (y - col.top) / (col.bot - col.top);
      let t;
      if (v < 0.14) t = 0;
      else if (v < 0.34) t = dith(col.xw, y, (v - 0.14) / 0.2) ? 1 : 0;
      else if (v < 0.6) t = 2;
      else if (v < 0.8) t = dith(col.xw, y, (v - 0.6) / 0.2) ? 3 : 2;
      else t = 4;
      data[(y - minY) * wpx + col.x] = t;
    }
  }
  return { wpx, hpx, half, dy: minY - cy, data, w, cy };
}

/** Builds the sprites of the cloud pool (data/sky.js) once. */
export function makeClouds(pool) {
  return pool.map((c) => ({ ...c, sprite: makeCloudSprite(c) }));
}

/**
 * Draws the clouds that the coverage lets in (each fades in over 0.12 of coverage) at their drifting place.
 * @param {Uint32Array} buf backdrop  @param {Array} clouds makeClouds()  @param {number} cover 0..1
 * @param {number[][]} tones five [r,g,b] colours  @param {number} time seconds (0 = frozen)
 */
export function paintClouds(buf, clouds, cover, tones, time) {
  const packed = tones.map((t) => px32(t[0] | 0, t[1] | 0, t[2] | 0));
  for (const c of clouds) {
    const a = Math.min(1, (cover - c.thr) / 0.12);
    if (a <= 0.02) continue;
    const sp = c.sprite;
    const span = W + c.w + 40;
    const cxp = Math.round((((c.x + c.w / 2 + 20 + c.v * time) % span) + span) % span - c.w / 2 - 20);
    const dxOff = cxp - sp.half;
    const solid = a >= 0.98;
    for (let yy = 0; yy < sp.hpx; yy++) {
      const y = c.y + sp.dy + yy;
      if (y < 0 || y >= HOR) continue;
      for (let xx = 0; xx < sp.wpx; xx++) {
        const t = sp.data[yy * sp.wpx + xx];
        if (t === 255) continue;
        const x = dxOff + xx;
        if (x < 0 || x >= W) continue;
        const i = y * W + x;
        if (solid) buf[i] = packed[t];
        else {
          const p = tones[t];
          over(buf, i, p[0], p[1], p[2], a);
        }
      }
    }
  }
}

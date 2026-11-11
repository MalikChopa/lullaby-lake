// Look measurements and look planning, pure (no DOM, no three.js; tested with node --test):
//   - luminance of a frame (mean and percentiles of the Rec. 709 luma of the sRGB pixels, 0..255) inside a region (the HUD bands left out);
//   - the luminance FLOOR every one of the 16 states must keep (readable ground, sprites and silhouettes), see LOOK_FLOOR in data/params.js;
//   - small colour thumbnails and their distance (the 16 states must stay pairwise distinct);
//   - where the cheap light shafts stand and how strong they are (dawn, dusk, mist; the high tier only, never low or mid).

import { LOOK_FLOOR, SHAFTS } from '../data/params.js';

/** Luma (0..255) of an sRGB pixel, Rec. 709 weights on the encoded values (what the eye reads as "light" on screen). */
export const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * @param {Uint8Array|Uint8ClampedArray} rgba   @param {number} w   @param {number} h
 * @param {{x0?:number,y0?:number,x1?:number,y1?:number}} [region] pixels, x1/y1 exclusive (default: the whole frame)
 * @param {number} [step] sample every `step` pixels in x and y (default 2)
 * @returns {{ n:number, mean:number, p5:number, p50:number, p95:number }}
 */
export function lumaStats(rgba, w, h, region = {}, step = 2) {
  const x0 = Math.max(0, region.x0 ?? 0);
  const y0 = Math.max(0, region.y0 ?? 0);
  const x1 = Math.min(w, region.x1 ?? w);
  const y1 = Math.min(h, region.y1 ?? h);
  const hist = new Uint32Array(256);
  let n = 0;
  let sum = 0;
  for (let y = y0; y < y1; y += step)
    for (let x = x0; x < x1; x += step) {
      const i = (y * w + x) * 4;
      const l = luma(rgba[i], rgba[i + 1], rgba[i + 2]);
      hist[Math.min(255, Math.round(l))]++;
      sum += l;
      n++;
    }
  const pct = (q) => {
    if (!n) return 0;
    const want = q * (n - 1);
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc > want) return v;
    }
    return 255;
  };
  return { n, mean: n ? sum / n : 0, p5: pct(0.05), p50: pct(0.5), p95: pct(0.95) };
}

/** The floor a state must keep: { mean, p5 } from LOOK_FLOOR (phase-specific, the rain / mist / clouds rows lower nothing below the base). */
export function lumaFloor(phase, weather, floor = LOOK_FLOOR) {
  const base = floor[phase] || floor.day;
  const wx = (floor.weather && floor.weather[weather]) || { mean: 0, p5: 0 };
  return { mean: base.mean + wx.mean, p5: base.p5 + wx.p5 };
}

/** Pass / fail of a measured frame against its floor. */
export function meetsFloor(stats, phase, weather, floor = LOOK_FLOOR) {
  const f = lumaFloor(phase, weather, floor);
  return { ok: stats.mean >= f.mean && stats.p5 >= f.p5, floor: f };
}

/** Mean colour of each cell of a gw x gh grid over the region: Float32Array(gw * gh * 3), 0..255. */
export function thumb(rgba, w, h, region = {}, gw = 16, gh = 9) {
  const x0 = region.x0 ?? 0;
  const y0 = region.y0 ?? 0;
  const x1 = region.x1 ?? w;
  const y1 = region.y1 ?? h;
  const out = new Float32Array(gw * gh * 3);
  const cnt = new Uint32Array(gw * gh);
  for (let y = y0; y < y1; y += 2)
    for (let x = x0; x < x1; x += 2) {
      const cx = Math.min(gw - 1, Math.floor(((x - x0) / (x1 - x0)) * gw));
      const cy = Math.min(gh - 1, Math.floor(((y - y0) / (y1 - y0)) * gh));
      const k = cy * gw + cx;
      const i = (y * w + x) * 4;
      out[k * 3] += rgba[i];
      out[k * 3 + 1] += rgba[i + 1];
      out[k * 3 + 2] += rgba[i + 2];
      cnt[k]++;
    }
  for (let k = 0; k < gw * gh; k++) for (let c = 0; c < 3; c++) out[k * 3 + c] /= Math.max(1, cnt[k]);
  return out;
}

/** Mean absolute difference of two thumbnails (0..255). */
export function thumbDistance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

/** Smallest pairwise distance of a list of thumbnails, with the pair. */
export function minPairDistance(list) {
  let best = { d: Infinity, i: -1, j: -1 };
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const d = thumbDistance(list[i], list[j]);
      if (d < best.d) best = { d, i, j };
    }
  return best;
}

// ------------------------------------------------------------------ light shafts
/**
 * Strength (0..1) of the light shafts for a light of the moment (logic/daylight.js lightAt) and a tier. Shafts need a LOW sun (dawn,
 * dusk) or mist that scatters it; rain and heavy cloud kill them; at night only a faint moon shaft in mist. low and mid: always 0.
 */
export function shaftAmount(L, tierName, S = SHAFTS) {
  if (!S.tiers.includes(tierName)) return 0;
  if (!L || !L.phaseWeights) return 0;
  const w = L.phaseWeights;
  const lowSun = (w.dawn || 0) + (w.dusk || 0);
  const moon = L.body === 'moon' ? S.moon : 0;
  const base = S.lowSun * lowSun + S.mist * (L.mist || 0) * ((w.day || 0) + lowSun) + moon * (L.mist || 0);
  const kill = (1 - (L.rain || 0)) * (1 - 0.7 * (L.cloudy || 0));
  const sunUp = L.body ? 1 : 0;
  return Math.max(0, Math.min(1, base * kill * sunUp));
}

/**
 * Where the shafts stand: `count` slanted planes spread across the view, around a centre (cx, cz), leaning along the light direction
 * (they fall FROM the sun). Deterministic (same input = same plan). Returns [{ x, z, w, h, tilt, yaw, a }] (metres, radians, alpha 0..1).
 */
export function shaftPlan(cx, cz, sunDir, count = SHAFTS.count, spread = SHAFTS.spread) {
  const hx = sunDir[0];
  const hz = sunDir[2];
  const hl = Math.hypot(hx, hz) || 1;
  // horizontal direction toward the sun and its perpendicular
  const tx = hx / hl;
  const tz = hz / hl;
  const yaw = Math.atan2(tx, tz);
  const elev = Math.atan2(sunDir[1], hl);
  const out = [];
  for (let i = 0; i < count; i++) {
    const r1 = fract(Math.sin(i * 12.9898 + 4.1) * 43758.5453);
    const r2 = fract(Math.sin(i * 78.233 + 1.7) * 24634.6345);
    const side = (i / Math.max(1, count - 1) - 0.5) * 2 * spread + (r1 - 0.5) * 3;
    const along = (r2 - 0.5) * spread * 0.8;
    out.push({
      x: cx - tz * side + tx * along,
      z: cz + tx * side + tz * along,
      w: 0.45 + r1 * 0.9,
      h: 8 + r2 * 5,
      tilt: Math.PI / 2 - elev, // 0 = vertical; leans away from the sun as it sets
      yaw,
      a: 0.55 + 0.45 * r2,
    });
  }
  return out;
}

function fract(v) {
  return v - Math.floor(v);
}

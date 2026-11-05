// Assembles one picture per frame (J3: the live scene). Pure and deterministic: the same (seed, look, params) gives the same pixels.
//
// How the smooth day/night and weather work (and why):
//   - Each mood of data/palettes.js (dusk, day, night, rain, fog) is baked once into "land" (hills, trees, shores, cabin), "foreground"
//     (pier, angler, cat, reeds) and the colours of the sky rows, the water and the clouds. The pixels painted are the SAME in every
//     mood (tests check it), only their colours differ.
//   - A look (core/sky.js) gives five coefficients. The colours shown are the weighted sum of the moods' colours; the sum is
//     recomputed only when the coefficients, rounded to 1/96, change (a few times per second at the fastest part of a fade, never
//     when nothing moves). A frame then only copies the cached colours: cost per frame is the same as before J3.
//   - Stars, sun, moon, clouds are drawn every frame behind the hills, at the place the clock gives; the water reflects them.
//   - The cat is NOT in the baked foreground: it is drawn every frame (its pose changes), from small per-mood rasters of the pose that are
//     blended with the same weights and the same rounding as the foreground, so the sitting cat is the cat of the mock-up, pixel for pixel.
//     The silent creatures (core/critters.js) are painted in three places: the shooting star in the sky, the jumping fish on the water,
//     the others over the foreground.
//   - Whole-pixel blocks are never resampled, so the pixels stay sharp: the blend works on colour values, not on the picture.

import { mulberry32 } from '../core/rng.js';
import { lookKey, pinnedLook } from '../core/sky.js';
import presets, { PRESET_NAMES, DEFAULT_PRESET } from '../data/palettes.js';
import skyData from '../data/sky.js';
import { createRaster } from './raster.js';
import { hexs, hx } from './palette.js';
import { W, H, HOR, bakeBackground, bakeForeground, bakeSkyRows, makeStars, STAR_COUNT } from './sceneBake.js';
import { createWater } from './waterPaint.js';
import { makeParticles, paintShadows, paintOverlay } from './overlayPaint.js';
import { paintStars, paintBody, makeClouds, paintClouds } from './skyPaint.js';
import { drawCat, CAT_POSE, CAT_AT, CAT_BOX } from './catPaint.js';
import { paintSkyEvents, paintBehind, paintFront } from './critterPaint.js';
import critterData from '../data/critters.js';

export const DECOR_SEED = 19; // the lake keeps the same drawing every time (J4 may derive it from the saved seed)
const STEPS = 96; // coefficient resolution: 1 step = about 2.6 levels on a 0..255 channel at the widest difference between two moods

/** Indices and colours of the painted pixels of a layer (sparse list). */
function sparse(buf) {
  let n = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] >>> 24 !== 0) n++;
  const idx = new Int32Array(n);
  let k = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] >>> 24 !== 0) idx[k++] = i;
  return idx;
}
const gather = (buf, idx) => {
  const out = new Uint32Array(idx.length);
  for (let k = 0; k < idx.length; k++) out[k] = buf[idx[k]];
  return out;
};
const sameInts = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/**
 * @param {{seed?:number, look?:object, budgetPx?:number}} o  look = the look drawn when render() gets none (a pinned mood, see core/sky.js pinnedLook);
 *   budgetPx = most pixels of land + foreground that one prepare() call blends (default: all at once)
 */
export function createLiveScene({ seed = DECOR_SEED, look: defaultLook = null, budgetPx = Infinity } = {}) {
  const layers = new Map();
  let landIdx = null;
  let fgIdx = null;
  let fgAlpha = null;
  let bankBot = null;
  const bakeMs = {};

  const stars = makeStars(seed, STAR_COUNT);
  const clouds = makeClouds(skyData.clouds);
  const particles = makeParticles(mulberry32(seed + 5));
  const frame = new Uint32Array(W * H);
  const backdrop = new Uint32Array(W * H);
  const R = createRaster(W, H, frame);
  const Rb = createRaster(W, H, backdrop); // the sky buffer (shooting star)
  let catAct = null; // the moods and weights of the colours shown now (set by prepare)
  const catRasters = new Map(); // pose key + mood -> the pose drawn in that mood's colours, in the box CAT_BOX
  const skyBuf = new Uint32Array(HOR * W);
  let landCol = null;
  let fgCol = null;
  const cloudTones = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let water = null;
  let blendKey = '';
  let waterKey = '';
  const stat = { blends: 0, slices: 0, lastBlendMs: 0 };

  /** Bakes one mood (about 20 to 45 ms). The painted pixels must be exactly those of the moods already baked. */
  function ensure(name) {
    if (layers.has(name)) return layers.get(name);
    const P = presets[name];
    const bg = bakeBackground(P, seed, true);
    const fg = bakeForeground(P, seed + 58, true);
    const li = sparse(bg.buf);
    const fi = sparse(fg.buf);
    if (!landIdx) {
      landIdx = li;
      fgIdx = fi;
      bankBot = bg.bankBot;
      fgAlpha = new Uint8Array(fi.length);
      for (let k = 0; k < fi.length; k++) fgAlpha[k] = fg.buf[fi[k]] >>> 24;
      landCol = new Uint32Array(li.length);
      fgCol = new Uint32Array(fi.length);
      water = createWater(bankBot);
    } else if (!sameInts(li, landIdx) || !sameInts(fi, fgIdx)) {
      throw new Error('mood "' + name + '" paints other pixels than the first one: blending would show ghosts');
    }
    const layer = { name, skyRows: bakeSkyRows(P), land: gather(bg.buf, li), fg: gather(fg.buf, fi), water: hexs(P.water), clouds: P.clouds.map(hx) };
    layers.set(name, layer);
    return layer;
  }

  // The blend of the land and the foreground (49 000 pixels) is spread over several frames when `budgetPx` is finite: a step of
  // one coefficient unit (1/96) changes a colour by 2 or 3 levels at most, so a few frames of old and new colours side by side
  // cannot be seen, while one frame never pays for more than budgetPx pixels. A big jump (first picture, debug snap, pinned mood)
  // is done at once.
  let job = null; // { act, cursor, left (pixels still to do), key, coef }
  let doneCoef = null;

  /**
   * Makes the cached colours match the look. Returns true when it did some work this call. Bakes a mood that is needed but not
   * baked yet (the caller bakes them in idle time, so this is rare).
   */
  function prepare(look) {
    const k = lookKey(look, STEPS);
    const rq = Math.round(look.rain * 32);
    const wk = k + '|' + rq;
    let worked = false;
    if (k !== blendKey && !(job && job.key === k)) {
      const act = [];
      for (let i = 0; i < PRESET_NAMES.length; i++) {
        const w = Math.round(look.coef[i] * STEPS) / STEPS;
        if (w > 0) act.push({ layer: ensure(PRESET_NAMES[i]), w });
      }
      if (!act.length) act.push({ layer: ensure(DEFAULT_PRESET), w: 1 });
      catAct = act;
      blendSky(act);
      blendColours(act);
      let jump = doneCoef === null;
      if (!jump) for (let i = 0; i < 5; i++) if (Math.abs(look.coef[i] - doneCoef[i]) > 0.2) jump = true;
      const total = landIdx.length + fgIdx.length;
      // a new look while a job is running: the job goes on from where it was with the new colours (the pixels already done are at most
      // one step old), and must cover every pixel once more
      job = { act, cursor: job && !jump ? job.cursor : 0, left: total, key: k, coef: look.coef.slice() };
      if (jump) job.left = Infinity;
      stat.blends++;
      worked = true;
    }
    if (job) {
      const total = landIdx.length + fgIdx.length;
      const n = job.left === Infinity ? total : Math.min(total, budgetPx, job.left);
      const end = job.cursor + n;
      if (end <= total) blendPixels(job.act, job.cursor, end);
      else {
        blendPixels(job.act, job.cursor, total);
        blendPixels(job.act, 0, end - total);
      }
      job.cursor = end % total;
      job.left = job.left === Infinity ? 0 : job.left - n;
      stat.slices++;
      worked = true;
      if (job.left <= 0) {
        blendKey = job.key;
        doneCoef = job.coef;
        job = null;
      }
    }
    if (wk !== waterKey) {
      waterKey = wk;
      water.setLook(waterStops, look.rain);
      worked = true;
    }
    return worked;
  }

  const waterStops = [0, 1, 2, 3, 4, 5, 6].map(() => [0, 0, 0]);
  function blendColours(act) {
    for (let s = 0; s < 7; s++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const a of act) {
        const c = a.layer.water[s];
        r += c[0] * a.w;
        g += c[1] * a.w;
        b += c[2] * a.w;
      }
      waterStops[s][0] = r;
      waterStops[s][1] = g;
      waterStops[s][2] = b;
    }
    for (let s = 0; s < 5; s++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const a of act) {
        const c = a.layer.clouds[s];
        r += c[0] * a.w;
        g += c[1] * a.w;
        b += c[2] * a.w;
      }
      cloudTones[s][0] = r;
      cloudTones[s][1] = g;
      cloudTones[s][2] = b;
    }
    waterKey = ''; // the water tables follow the new colours
  }
  function blendSky(act) {
    for (let y = 0; y < HOR; y++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const a of act) {
        r += a.layer.skyRows[y * 3] * a.w;
        g += a.layer.skyRows[y * 3 + 1] * a.w;
        b += a.layer.skyRows[y * 3 + 2] * a.w;
      }
      const p = (0xff000000 | (Math.min(255, (b + 0.5) | 0) << 16) | (Math.min(255, (g + 0.5) | 0) << 8) | Math.min(255, (r + 0.5) | 0)) >>> 0;
      skyBuf.fill(p, y * W, y * W + W);
    }
  }
  /** Weighted sum of the moods' colours for the pixels [from, to) of the sequence land then foreground. */
  function blendPixels(act, from, to) {
    const n = act.length;
    const ws = Float64Array.from(act, (a) => a.w);
    const nLand = landIdx.length;
    if (from < nLand) {
      const L = act.map((a) => a.layer.land);
      const out = landCol;
      const end = Math.min(to, nLand);
      for (let k = from; k < end; k++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let j = 0; j < n; j++) {
          const p = L[j][k];
          const w = ws[j];
          r += (p & 255) * w;
          g += ((p >>> 8) & 255) * w;
          b += ((p >>> 16) & 255) * w;
        }
        out[k] = (0xff000000 | (r > 254.5 ? 255 : (r + 0.5) | 0) | ((g > 254.5 ? 255 : (g + 0.5) | 0) << 8) | ((b > 254.5 ? 255 : (b + 0.5) | 0) << 16)) >>> 0;
      }
    }
    if (to > nLand) {
      const F = act.map((a) => a.layer.fg);
      const out = fgCol;
      const k0 = Math.max(from, nLand) - nLand;
      const k1 = to - nLand;
      for (let k = k0; k < k1; k++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let j = 0; j < n; j++) {
          const p = F[j][k];
          const w = ws[j];
          r += (p & 255) * w;
          g += ((p >>> 8) & 255) * w;
          b += ((p >>> 16) & 255) * w;
        }
        out[k] = ((fgAlpha[k] << 24) | (r > 254.5 ? 255 : (r + 0.5) | 0) | ((g > 254.5 ? 255 : (g + 0.5) | 0) << 8) | ((b > 254.5 ? 255 : (b + 0.5) | 0) << 16)) >>> 0;
      }
    }
  }

  /** The cat in the colours of the look: the pose is drawn once per mood (cached), the moods are mixed like the foreground's. */
  function paintCat(pose) {
    const act = catAct;
    const [bx, by, bw, bh] = CAT_BOX;
    const ras = act.map((a) => {
      const key = pose.key + '|' + a.layer.name;
      let r = catRasters.get(key);
      if (!r) {
        const rr = createRaster(bw, bh);
        rr.setGrade(presets[a.layer.name].grade);
        drawCat(rr, CAT_AT[0] - bx, CAT_AT[1] - by, { ...pose, bodyDy: 0 });
        r = rr.buf;
        catRasters.set(key, r);
      }
      return r;
    });
    const ws = act.map((a) => a.w);
    const n = act.length;
    const dy = pose.bodyDy || 0;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const i = y * bw + x;
        if (ras[0][i] >>> 24 === 0) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let j = 0; j < n; j++) {
          const q = ras[j][i];
          r += (q & 255) * ws[j];
          g += ((q >>> 8) & 255) * ws[j];
          b += ((q >>> 16) & 255) * ws[j];
        }
        frame[(by + y + dy) * W + bx + x] = (0xff000000 | (r > 254.5 ? 255 : (r + 0.5) | 0) | ((g > 254.5 ? 255 : (g + 0.5) | 0) << 8) | ((b > 254.5 ? 255 : (b + 0.5) | 0) << 16)) >>> 0;
      }
    }
  }
  const SIT = { ...CAT_POSE, key: 'sit|0|0|open|0|0|0' };
  const critterCtx = { pads: critterData.pads, frogSpec: critterData.kinds.frog };
  const NONE = [];

  const ov = { live: true, cabin: 0, lamp: 0, smoke: 0, birds: 0, flies: 0, fog: 0, fogColor: null, light: 1, rain: 0 };

  const scene = {
    frame,
    backdrop,
    stat,
    bakeMs,
    /** Mood names baked so far. */
    baked: () => [...layers.keys()],
    /** Bakes a mood now (idle-time baking by the caller); returns the milliseconds it took via `clock` if given. */
    bake(name, clock) {
      if (layers.has(name) || !presets[name]) return 0;
      const t0 = clock ? clock() : 0;
      ensure(name);
      const ms = clock ? clock() - t0 : 0;
      bakeMs[name] = +ms.toFixed(1);
      return ms;
    },
    prepare,
    /** Number of painted land / foreground pixels (tests). */
    sizes: () => ({ land: landIdx ? landIdx.length : 0, fg: fgIdx ? fgIdx.length : 0 }),
    /**
     * @param {{time:number, reduced:boolean, cast:object, splash:?object, look?:object, cat?:object, critters?:{events:object[]}}} p
     * cat = pose from core/critters.js createCat (default: sitting); critters.events = core/critters.js active()
     * time in seconds (animation only); reduced = freeze shimmer, drifting clouds, birds, smoke, fireflies, ripples, veils
     */
    render(p) {
      const look = p.look || defaultLook;
      prepare(look);
      backdrop.set(skyBuf, 0);
      paintStars(backdrop, stars, look.stars * STAR_COUNT);
      const events = p.critters ? p.critters.events : NONE;
      if (events.length) paintSkyEvents(Rb, events);
      if (look.sun) paintBody(backdrop, 'sun', look.sun);
      if (look.moon) paintBody(backdrop, 'moon', look.moon);
      paintClouds(backdrop, clouds, look.cover, cloudTones, p.reduced ? 0 : p.time);
      for (let k = 0, n = landIdx.length; k < n; k++) backdrop[landIdx[k]] = landCol[k];
      frame.set(backdrop);
      // the glitter column under the sun or the moon: as strong as the body is visible, and fades out as it sinks behind the hills
      const low = (b) => (b.elev >= 0.25 ? 1 : b.elev <= 0 ? 0 : (b.elev / 0.25) ** 2 * (3 - 2 * (b.elev / 0.25)));
      const sunA = look.sun ? look.sun.a * low(look.sun) : 0;
      const moonA = look.moon ? look.moon.a * low(look.moon) : 0;
      const body = sunA >= moonA ? (look.sun ? { x: look.sun.x, sun: true, k: sunA } : null) : { x: look.moon.x, sun: false, k: moonA };
      water.render(frame, backdrop, p.time, p.reduced, body);
      if (events.length) paintBehind(R, events, look.light);
      paintShadows(R, p.time, p.reduced);
      // foreground over everything below: opaque pixels are copied, translucent ones blended
      for (let k = 0, n = fgIdx.length; k < n; k++) {
        const c = fgCol[k];
        const i = fgIdx[k];
        const a = c >>> 24;
        if (a === 255) frame[i] = c;
        else R.blend(i, c & 255, (c >>> 8) & 255, (c >>> 16) & 255, a / 255);
      }
      paintCat(p.cat || SIT);
      if (events.length) paintFront(R, events, look.light, critterCtx);
      ov.cabin = look.cabin;
      ov.lamp = look.lamp;
      ov.smoke = look.smoke;
      ov.birds = look.birds;
      ov.flies = look.flies;
      ov.fog = look.veil;
      ov.fogColor = look.fogColor;
      ov.light = look.light;
      ov.rain = look.rain;
      paintOverlay(R, ov, particles, { time: p.time, still: p.reduced, cast: p.cast, splash: p.splash });
      return frame;
    },
  };
  return scene;
}

/**
 * One pinned mood (J1b API, used by the tests and tools): the live scene fixed on a mood, with that mood's own flags.
 * @param {{preset:object, seed?:number}} o
 */
export function createScene({ preset, seed = DECOR_SEED }) {
  const name = PRESET_NAMES.find((n) => presets[n] === preset) || DEFAULT_PRESET;
  const look = pinnedLook(name, presets, skyData);
  const scene = createLiveScene({ seed, look });
  scene.preset = preset;
  scene.look = look;
  return scene;
}

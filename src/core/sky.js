// Sky and light as numbers (J3). Pure: no DOM, no clock, no random. The art layer turns these numbers into pixels.
//
//   dayFrac (0..1) + weather mix  ->  "look" = how much of each baked mood (dusk, day, night, rain, fog) to blend, where the sun
//   and the moon are, how many stars, clouds, rain, mist veils, window and lantern light.
//
// The look is a pure function of the game state, so the picture always agrees with the clock and the weather (fish availability
// depends on them). Phases cross-fade over sky.blendHalf x 2 of the day; a weather change fades over sky.weatherFadeS.

export const LAYERS = Object.freeze(['dusk', 'day', 'night', 'rain', 'fog']); // order of look.coef (same as PRESET_NAMES)
const LAYER_INDEX = Object.freeze({ dusk: 0, day: 1, night: 2, rain: 3, fog: 4 });

export const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Weight of each phase at a day fraction: pure inside a phase, smooth cross-fade around each boundary. Sums to 1. */
export function todWeights(frac, config, sky) {
  const P = config.phases;
  const n = P.length;
  const out = {};
  for (const p of P) out[p.id] = 0;
  let i = P.findIndex((p) => frac >= p.from && frac < p.to);
  if (i < 0) i = n - 1;
  const p = P[i];
  const next = P[(i + 1) % n];
  const prev = P[(i + n - 1) % n];
  const d0 = frac - p.from; // time since this phase began (fade in from the previous one)
  const d1 = p.to - frac; // time before the next one begins (fade out toward it)
  const h0 = sky.blendHalf[p.id];
  const h1 = sky.blendHalf[next.id];
  if (d0 < h0) {
    const k = smooth(0.5 + d0 / (2 * h0));
    out[p.id] = k;
    out[prev.id] += 1 - k;
  } else if (d1 < h1) {
    const k = smooth(0.5 + d1 / (2 * h1));
    out[p.id] = k;
    out[next.id] += 1 - k;
  } else {
    out[p.id] = 1;
  }
  return out;
}

/** Sun or moon at a day fraction: { x, y, a (opacity 0..1), elev (0..1, 1 = top of the arc), u (0..1 along the arc) } or null when below the horizon. */
export function bodyAt(frac, spec) {
  const span = spec.set - spec.rise;
  const u = ((((frac - spec.rise) % 1) + 1) % 1) / span;
  if (u >= 1) return null;
  const a = smooth(u / spec.fade) * smooth((1 - u) / spec.fade);
  const elev = Math.sin(Math.PI * u);
  return { x: spec.x0 + (spec.x1 - spec.x0) * u, y: spec.baseY - (spec.baseY - spec.apexY) * elev, a, elev, u };
}

// ------------------------------------------------------------------ weather mix (share of each weather in the picture)

/** All of the picture in one weather (used at the start, by ?weather= and by the debug hooks). */
export function snapMix(list, id) {
  const m = {};
  for (const w of list) m[w.id] = w.id === id ? 1 : 0;
  if (!(id in m)) m[list[0].id] = 1;
  return m;
}

/** One step toward `id`: every share moves by at most dt / fadeS, then the shares are renormalised (they always sum to 1). */
export function easeMix(mix, id, dt, fadeS) {
  if (mix[id] === 1) return mix;
  const step = dt / fadeS;
  const out = {};
  let sum = 0;
  for (const k of Object.keys(mix)) {
    const target = k === id ? 1 : 0;
    out[k] = mix[k] + clamp(target - mix[k], -step, step);
    sum += out[k];
  }
  if (sum > 0) for (const k of Object.keys(out)) out[k] /= sum;
  return out;
}

// ------------------------------------------------------------------ the look

/**
 * @param {number} frac day fraction  @param {object} mix weather shares  @param {object[]} weatherList data/weather.js
 * @param {object} config data/config.js  @param {object} sky data/sky.js
 * @returns {object} look: coef[5] (LAYERS order, sum <= 1), light, stars (0..1 of starsMax), sun, moon, cover, rain, veil, lamp, cabin,
 *   flies, birds, smoke, dim, tod (phase weights), dominant (name of the strongest mood)
 */
export function lookParams(frac, mix, weatherList, config, sky) {
  const t = todWeights(frac, config, sky);
  const sumBy = (table) => {
    let s = 0;
    for (const k of Object.keys(t)) s += t[k] * (table[k] || 0);
    return s;
  };
  const light = sumBy(sky.light);
  let rainW = 0;
  let fogW = 0;
  let cover = 0;
  let drops = 0;
  let veilW = 0;
  let dim = 0;
  let wind = 0;
  for (const w of weatherList) {
    const m = mix[w.id] || 0;
    rainW += m * w.look.wash.rain;
    fogW += m * w.look.wash.fog;
    cover += m * w.fx.clouds;
    drops += m * w.fx.rain;
    veilW += m * w.look.veil;
    dim += m * w.look.dim;
    wind += m * w.audio.wind;
  }
  const base = 1 - clamp(rainW + fogW, 0, 1);
  const kRain = Math.min(1, light / sky.layerLight.rain);
  const kFog = Math.min(1, light / sky.layerLight.fog);
  const coef = [0, 0, 0, 0, 0];
  for (const ph of Object.keys(t)) coef[LAYER_INDEX[sky.layerOfPhase[ph]]] += base * t[ph];
  coef[LAYER_INDEX.rain] += kRain * rainW;
  coef[LAYER_INDEX.fog] += kFog * fogW;
  let top = 0;
  for (let i = 1; i < 5; i++) if (coef[i] > coef[top]) top = i;

  const sun = bodyAt(frac, sky.sun);
  const moon = bodyAt(frac, sky.moon);
  const hide = 1 - clamp(dim, 0, 1);
  const maxFog = Math.max(1e-9, ...weatherList.map((w) => w.look.wash.fog));
  const mistShare = clamp(fogW / maxFog, 0, 1);
  return {
    coef,
    dominant: LAYERS[top],
    light,
    tod: t,
    stars: sumBy(sky.stars) * (1 - 0.95 * clamp(dim, 0, 1)),
    sun: sun && { ...sun, a: sun.a * hide },
    moon: moon && { ...moon, a: moon.a * smooth((sky.moonDark.from - light) / sky.moonDark.width) * (1 - clamp(dim, 0, 1)) * (1 - (sun ? sun.a : 0)) ** 2 },
    cover: clamp(cover, 0, 1),
    rain: clamp(drops, 0, 1),
    veil: clamp(sumBy(sky.veil) * (1 - mistShare) + veilW, 0, 0.7),
    lamp: sumBy(sky.lamp),
    cabin: sumBy(sky.cabin),
    flies: sumBy(sky.flies) * (1 - 0.9 * clamp(drops, 0, 1)),
    birds: sumBy(sky.birds) * (1 - clamp(drops, 0, 1)) * (1 - 0.5 * clamp(dim, 0, 1)),
    smoke: sky.smoke * (1 - 0.3 * mistShare),
    wind: clamp(wind, 0, 1),
    fogColor: null,
  };
}

/** The look of a pinned mood (?preset=<name>): one baked mood alone, with that mood's own flags, as in J1b. */
export function pinnedLook(name, presets, sky) {
  const P = presets[name] || presets.dusk;
  const key = presets[name] ? name : 'dusk';
  const coef = [0, 0, 0, 0, 0];
  coef[LAYER_INDEX[key]] = 1;
  const body = P.body ? { x: 332, y: 54, a: 1, elev: 1, u: 0.5 } : null;
  const light = { dusk: sky.light.dusk, day: sky.light.day, night: sky.light.night, rain: sky.layerLight.rain, fog: sky.layerLight.fog }[key];
  return {
    coef,
    dominant: key,
    light,
    tod: null,
    stars: P.stars / sky.starsMax,
    sun: P.body === 'sun' ? body : null,
    moon: P.body === 'moon' ? body : null,
    cover: sky.presetCover[key],
    rain: P.rain ? 1 : 0,
    veil: P.fog,
    lamp: P.lamp,
    cabin: P.cabinLight,
    flies: P.flies,
    birds: P.birds ? 1 : 0,
    smoke: P.smoke,
    wind: key === 'rain' ? 0.3 : key === 'fog' ? 0.2 : 0.1,
    fogColor: P.fogColor,
  };
}

/** Coefficients rounded to 1/steps: two looks with the same key give the same blended colours (the art layer recomputes only on a new key). */
export function lookKey(look, steps = 96) {
  let k = '';
  for (let i = 0; i < 5; i++) k += Math.round(look.coef[i] * steps) + ',';
  return k;
}

/** Name of the mood shown by a state that is not in the middle of a transition: the hard-cut rule of J2 (kept for the badge and the debug hooks). */
export function nominalMood(phase, weather, sky) {
  if (weather === 'rain') return 'rain';
  if (weather === 'mist') return 'fog';
  return sky.layerOfPhase[phase] || 'dusk';
}

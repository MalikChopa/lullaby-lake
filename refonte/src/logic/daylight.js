// Light of the slice as numbers, from the existing clock and weather. Pure: no DOM, no three.js.
//   dayFrac (0..1, src/core/clock.js) + weather mix (src/core/sky.js easeMix) -> sun / moon direction and colour, hemisphere fill, fog,
//   bloom, lamp and window strength, water colours, colour grade.
// The phase weights come from src/core/sky.js todWeights (the same smooth cross-fades as the 2D game), so the picture always agrees with
// the phase the fishing core uses.

import { todWeights, smooth } from '../../../src/core/sky.js';
import { PHASE_LIGHT, RAIN_LIGHT, MIST_LIGHT, CLOUD_LIGHT, SUN_PATH } from '../data/params.js';
import weatherList from '../../../src/data/weather.js';

const DEG = Math.PI / 180;
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Position along an arc: { u (0..1), a (fade 0..1), elevDeg, azDeg } or null when below the horizon. */
export function arcAt(frac, spec) {
  const span = spec.set - spec.rise;
  const u = ((((frac - spec.rise) % 1) + 1) % 1) / span;
  if (u >= 1) return null;
  const a = smooth(u / spec.fade) * smooth((1 - u) / spec.fade);
  const elevDeg = Math.max(spec.minElevDeg, spec.maxElevDeg * Math.sin(Math.PI * u));
  return { u, a, elevDeg, azDeg: lerp(spec.az0, spec.az1, u) };
}

/** Unit vector pointing TO the light (sun or moon) for an elevation and an azimuth (0 = north / over the lake, + = east). */
export function dirFrom(elevDeg, azDeg) {
  const e = elevDeg * DEG;
  const a = azDeg * DEG;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}

/**
 * The main light: the sun while it is up, else the moon. The switch happens only where both are faded out, so intensity x direction
 * never jumps. Returns { dir, fade (0..1), body: 'sun' | 'moon' | null }.
 */
export function mainLight(frac, path = SUN_PATH) {
  const s = arcAt(frac, path.sun);
  if (s && s.a > 0) return { dir: dirFrom(s.elevDeg, s.azDeg), fade: s.a, body: 'sun' };
  const m = arcAt(frac, path.moon);
  if (m && m.a > 0) return { dir: dirFrom(m.elevDeg, m.azDeg), fade: m.a, body: 'moon' };
  return { dir: [0, 1, 0], fade: 0, body: null };
}

/** Shares of the weather effects for a weather mix, from src/data/weather.js (fx.clouds, fx.mist, look.dim). */
export function weatherFx(mix) {
  const out = { clouds: 0, mist: 0, dim: 0 };
  for (const w of weatherList) {
    const k = (mix && mix[w.id]) || 0;
    out.clouds += k * w.fx.clouds;
    out.mist += k * w.fx.mist;
    out.dim += k * w.look.dim;
  }
  return out;
}

/**
 * @param {number} frac day fraction
 * @param {object} mix share of each weather id (sums to 1), e.g. { clear: 1 }
 * @param {object} config src/data/config.js     @param {object} sky src/data/sky.js (blendHalf)
 * @returns the light of the moment (sun / moon, fill, fog, lamps, water, grade) and of the sky dome (top / horizon, stars, clouds)
 */
export function lightAt(frac, mix, config, sky) {
  const w = todWeights(frac, config, sky);
  const acc = (key) => {
    let out = null;
    for (const [ph, k] of Object.entries(w)) {
      if (!k) continue;
      const v = PHASE_LIGHT[ph][key];
      const val = typeof v === 'string' ? hex(v) : v;
      if (out === null) out = Array.isArray(val) ? val.map((x) => x * k) : val * k;
      else if (Array.isArray(val)) out = out.map((x, i) => x + val[i] * k);
      else out += val * k;
    }
    return out;
  };
  const rain = (mix && mix.rain) || 0;
  const mist = (mix && mix.mist) || 0;
  const cloudy = (mix && mix.cloudy) || 0;
  const fx = weatherFx(mix);
  const L = mainLight(frac);
  // the sun colour of the phase blend; the moon gives the night colour whatever the blend says
  let sunColor = acc('sun');
  let sunI = acc('sunI');
  if (L.body === 'moon') {
    sunColor = hex(PHASE_LIGHT.night.sun);
    sunI = PHASE_LIGHT.night.sunI;
  }
  sunI *= L.fade * lerp(1, RAIN_LIGHT.sunMul, rain) * lerp(1, MIST_LIGHT.sunMul, mist) * lerp(1, CLOUD_LIGHT.sunMul, cloudy);
  const rainFog = acc('rainFog');
  const mistFog = acc('mistFog');
  const rainSky = acc('rainSky');
  let fog = lerp3(acc('fog'), rainFog, rain * RAIN_LIGHT.fogMix);
  fog = lerp3(fog, mistFog, mist * MIST_LIGHT.fogMix);
  fog = lerp3(fog, fog.map((v, i) => v * CLOUD_LIGHT.cool[i]), cloudy);
  const skyTop = lerp3(lerp3(acc('skyTop'), rainSky.map((v) => v * 0.8), fx.clouds * 0.55), mistFog, mist * 0.5);
  const skyHor = lerp3(lerp3(acc('skyHor'), rainSky, fx.clouds * 0.5), mistFog, mist * 0.7);
  const out = {
    phaseWeights: w,
    body: L.body,
    sunDir: L.dir,
    sunColor,
    sunI,
    sky: lerp3(lerp3(acc('sky'), rainSky, rain * RAIN_LIGHT.skyMix), mistFog, mist * 0.45),
    ground: lerp3(acc('ground'), hex(RAIN_LIGHT.ground), rain * 0.4),
    hemiI: acc('hemiI') * lerp(1, RAIN_LIGHT.hemiMul, rain) * lerp(1, MIST_LIGHT.hemiMul, mist) * lerp(1, CLOUD_LIGHT.hemiMul, cloudy),
    fog,
    fogD: acc('fogD') + rain * RAIN_LIGHT.fogD + mist * MIST_LIGHT.fogD + cloudy * CLOUD_LIGHT.fogD,
    bloom: acc('bloom') * (1 + 0.3 * mist),
    lamp: acc('lamp') * lerp(1, RAIN_LIGHT.lampMul, rain) * (1 + 0.15 * mist),
    window: acc('window'),
    exposure: acc('exposure') * lerp(1, RAIN_LIGHT.expMul ?? 1, rain), // J9-B: the wet, darker scene is exposed a little more (readable rain)
    waterSky: lerp3(lerp3(acc('waterSky'), rainSky, rain * 0.6), mistFog, mist * 0.5),
    waterDeep: acc('waterDeep'),
    grade: acc('grade'),
    sat: acc('sat') * lerp(1, RAIN_LIGHT.sat, rain) * lerp(1, MIST_LIGHT.sat, mist) * lerp(1, CLOUD_LIGHT.sat, cloudy),
    wet: rain * RAIN_LIGHT.wet,
    rain,
    mist,
    cloudy,
    // sky dome and weather shading
    skyTop,
    skyHor,
    stars: acc('stars') * (1 - fx.dim),
    clouds: fx.clouds,
    cloudColor: lerp3(acc('cloud'), rainSky, rain),
    cloudShadow: fx.clouds * 0.45 * (1 - 0.6 * rain) * Math.min(1, sunI / 1.5),
    shadowSoft: 1 + 1.5 * cloudy + 2 * mist + rain,
    discs: 1 - fx.dim, // how visible the sun and moon discs are
  };
  return out;
}

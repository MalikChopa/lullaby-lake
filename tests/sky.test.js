import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/data/config.js';
import weatherList from '../src/data/weather.js';
import sky from '../src/data/sky.js';
import presets, { PRESET_NAMES } from '../src/data/palettes.js';
import { todWeights, bodyAt, snapMix, easeMix, lookParams, pinnedLook, lookKey, nominalMood, LAYERS } from '../src/core/sky.js';
import { lookFor } from '../src/core/look.js';
import { announceKey, createToasts } from '../src/core/toast.js';
import { createGame } from '../src/core/game.js';
import { createLiveScene, createScene } from '../src/art/compose.js';
import species from '../src/data/species.js';

const look = (f, w = 'clear') => lookParams(f, snapMix(weatherList, w), weatherList, config, sky);
const MID = { dawn: 0.0625, day: 0.3125, dusk: 0.5625, night: 0.8125 };
const sum = (a) => a.reduce((x, y) => x + y, 0);

test('sky: phase weights sum to 1, are pure inside a phase and half-half on a boundary', () => {
  for (let f = 0; f < 1; f += 1 / 960) {
    const t = todWeights(f, config, sky);
    assert.ok(Math.abs(Object.values(t).reduce((a, b) => a + b, 0) - 1) < 1e-9, 'sum at ' + f);
    assert.ok(Object.values(t).every((v) => v >= 0 && v <= 1));
  }
  for (const [ph, f] of Object.entries(MID)) assert.equal(todWeights(f, config, sky)[ph], 1, ph + ' is pure at its middle');
  for (const [f, a, b] of [[0.125, 'dawn', 'day'], [0.5, 'day', 'dusk'], [0.625, 'dusk', 'night']]) {
    const t = todWeights(f, config, sky);
    assert.ok(Math.abs(t[a] - 0.5) < 1e-9 && Math.abs(t[b] - 0.5) < 1e-9, `half-half at ${f}`);
  }
  const wrap = todWeights(0, config, sky); // midnight -> dawn boundary wraps around the day
  assert.ok(Math.abs(wrap.dawn - 0.5) < 1e-9 && Math.abs(wrap.night - 0.5) < 1e-9);
});

test('sky: the look moves continuously over the whole day (no jump in any coefficient, light, stars, lamp, cabin)', () => {
  let prev = look(0);
  let worst = 0;
  const N = 4800; // one step = 0.1 s of a 480 s day
  for (let i = 1; i <= N; i++) {
    const cur = look((i / N) % 1);
    for (let k = 0; k < 5; k++) worst = Math.max(worst, Math.abs(cur.coef[k] - prev.coef[k]));
    for (const key of ['light', 'stars', 'lamp', 'cabin', 'flies', 'birds', 'veil']) worst = Math.max(worst, Math.abs(cur[key] - prev[key]) / (key === 'flies' ? 14 : 1));
    prev = cur;
  }
  assert.ok(worst < 0.01, 'largest step in 0.1 s: ' + worst);
});

test('sky: pure phases give the approved moods (dusk, day, night, fog at dawn) and the weather moods at the clear phase', () => {
  assert.deepEqual(look(MID.dusk).coef, [1, 0, 0, 0, 0]);
  assert.deepEqual(look(MID.day).coef, [0, 1, 0, 0, 0]);
  assert.deepEqual(look(MID.night).coef, [0, 0, 1, 0, 0]);
  assert.deepEqual(look(MID.dawn).coef, [0, 0, 0, 0, 1]);
  assert.deepEqual(look(MID.day, 'rain').coef, [0, 0, 0, 1, 0], 'rain by day = the approved rain mood');
  assert.ok(Math.abs(look(MID.dawn, 'mist').coef[4] - 1) < 1e-9, 'mist at dawn = the approved fog mood');
  assert.equal(LAYERS.join(), PRESET_NAMES.join(), 'coefficient order = order of the baked moods');
});

test('sky: coefficients never sum above 1; rain and mist by night stay dark (scaled by the light)', () => {
  for (const w of ['clear', 'cloudy', 'rain', 'mist']) {
    for (let f = 0; f < 1; f += 0.01) assert.ok(sum(look(f, w).coef) <= 1 + 1e-9, `${w} ${f}`);
  }
  const rainNight = look(MID.night, 'rain');
  assert.ok(Math.abs(rainNight.coef[3] - sky.light.night) < 1e-9);
  assert.ok(look(MID.night, 'mist').coef[4] < 0.5 * look(MID.day, 'mist').coef[4] + 0.1);
  assert.ok(look(MID.day, 'cloudy').coef[1] > 0.6 && look(MID.day, 'cloudy').coef[3] > 0.2 && look(MID.day, 'cloudy').coef[3] < 0.4);
});

test('sky: sun and moon follow an arc tied to the clock, are never both up, never stuck', () => {
  // sun: hidden outside its window, x grows with the clock, highest at the middle of the window
  assert.equal(bodyAt(0.02, sky.sun), null);
  assert.equal(bodyAt(0.6, sky.sun), null);
  let px = -1;
  let top = null;
  for (let f = sky.sun.rise + 0.001; f < sky.sun.set; f += 0.002) {
    const b = bodyAt(f, sky.sun);
    assert.ok(b.x > px, 'sun x increases');
    px = b.x;
    if (!top || b.y < top.y) top = { y: b.y, f };
  }
  assert.ok(Math.abs(top.f - (sky.sun.rise + sky.sun.set) / 2) < 0.01 && top.y < sky.sun.apexY + 1);
  // the sun is NOT stuck: its position differs a minute apart anywhere in its window
  assert.notEqual(bodyAt(0.2, sky.sun).x, bodyAt(0.2 + 60 / 480, sky.sun).x);
  // moon: wraps past midnight
  const m1 = bodyAt(0.9, sky.moon);
  const m2 = bodyAt(0.02, sky.moon);
  assert.ok(m1 && m2 && m2.x > m1.x, 'the moon keeps going after midnight');
  // never both visible at the same time, over a whole day, in every weather
  for (const w of ['clear', 'cloudy', 'mist']) {
    for (let f = 0; f < 1; f += 0.001) {
      const l = look(f, w);
      const s = l.sun ? l.sun.a : 0;
      const m = l.moon ? l.moon.a : 0;
      assert.ok(Math.min(s, m) < 0.25, `sun ${s.toFixed(2)} and moon ${m.toFixed(2)} at ${f.toFixed(3)} (${w})`);
    }
  }
  // by day only the sun, by night only the moon; rain hides both
  assert.ok(look(MID.day).sun.a > 0.99 && !(look(MID.day).moon && look(MID.day).moon.a > 0.01));
  assert.ok(look(MID.night).moon.a > 0.99 && !(look(MID.night).sun && look(MID.night).sun.a > 0.01));
  assert.ok(look(MID.day, 'rain').sun.a === 0 && look(MID.night, 'rain').moon.a === 0);
});

test('sky: stars fade with the phase, lights follow the phase, rain and mist are numbers of the weather', () => {
  assert.equal(look(MID.day).stars, 0);
  assert.ok(look(MID.night).stars === 1 && look(MID.dusk).stars > 0.3 && look(MID.dusk).stars < 0.5);
  assert.ok(look(MID.night, 'rain').stars < 0.1, 'rain hides the stars');
  assert.equal(look(MID.day).cabin, 0);
  assert.ok(look(MID.night).cabin > 1 && look(MID.dusk).cabin === 1);
  assert.ok(look(MID.day).lamp < 0.3 && look(MID.dusk).lamp === 1);
  assert.equal(look(MID.day).rain, 0);
  assert.equal(look(MID.day, 'rain').rain, 1);
  assert.ok(look(MID.day, 'mist').veil > 0.5 && look(MID.day).veil === 0 && look(MID.day, 'rain').flies === 0);
  assert.ok(look(MID.day, 'clear').cover < look(MID.day, 'cloudy').cover && look(MID.day, 'cloudy').cover < look(MID.day, 'rain').cover);
  assert.ok(look(MID.night).birds === 0 && look(MID.day).birds === 1 && look(MID.day, 'rain').birds === 0);
});

test('sky: a pure function of its inputs (same in, same out), and the pinned mood has its own flags', () => {
  assert.deepEqual(look(0.37, 'cloudy'), look(0.37, 'cloudy'));
  for (const name of PRESET_NAMES) {
    const p = pinnedLook(name, presets, sky);
    assert.equal(p.dominant, name);
    assert.equal(sum(p.coef), 1);
    assert.equal(p.rain, presets[name].rain ? 1 : 0);
    assert.equal(p.veil, presets[name].fog);
    assert.equal(!!(p.sun || p.moon), !!presets[name].body);
  }
  assert.equal(pinnedLook('nope', presets, sky).dominant, 'dusk');
});

test('sky: weather mix moves at most dt / 10 s per step, always sums to 1, reaches the target after 10 s, never jumps', () => {
  let m = snapMix(weatherList, 'clear');
  assert.deepEqual(m, { clear: 1, cloudy: 0, rain: 0, mist: 0 });
  assert.equal(easeMix(m, 'clear', 1 / 60, 10), m, 'nothing to do: same object');
  let prevRain = 0;
  for (let i = 0; i < 600; i++) {
    m = easeMix(m, 'rain', 1 / 60, 10);
    assert.ok(Math.abs(sum(Object.values(m)) - 1) < 1e-9);
    assert.ok(m.rain - prevRain <= 1 / 600 + 1e-9, 'a step is at most 1/600');
    prevRain = m.rain;
  }
  assert.ok(m.rain > 0.999, 'after 10 s of game time: ' + m.rain);
  // a change of mind half way: the old target fades again, the new one grows, still no jump
  m = snapMix(weatherList, 'clear');
  for (let i = 0; i < 300; i++) m = easeMix(m, 'rain', 1 / 60, 10);
  const half = m.rain;
  for (let i = 0; i < 60; i++) m = easeMix(m, 'mist', 1 / 60, 10);
  assert.ok(m.rain < half && m.mist > 0 && Math.abs(sum(Object.values(m)) - 1) < 1e-9);
  assert.deepEqual(snapMix(weatherList, 'nope'), { clear: 1, cloudy: 0, rain: 0, mist: 0 });
});

test('game: the weather mix follows weatherChanged over 10 s, is frozen with the weather, snaps on setWorld, stops while paused', () => {
  const data = { config, species, weather: weatherList, sky };
  const g = createGame({ data, seed: 5, start: { phase: 'day', weather: 'clear', freezeClock: true } });
  assert.equal(g.getState().world.mix.clear, 1);
  g.setWorld({ weather: 'rain', freezeWeather: true });
  assert.equal(g.getState().world.mix.rain, 1, 'setWorld snaps (debug)');
  const g2 = createGame({ data, seed: 5, start: { phase: 'day', weather: 'clear', freezeClock: true } });
  // force a change by hand: unfrozen weather, run until the weather changes
  let changed = null;
  for (let i = 0; i < 60 * 400 && !changed; i++) {
    const ev = g2.step(1 / 60, null);
    const e = ev.find((x) => x.type === 'weatherChanged');
    if (e) changed = e.weather;
  }
  assert.ok(changed, 'the weather changed within 400 s');
  const m0 = g2.getState().world.mix;
  assert.ok(m0[changed] > 0 && m0[changed] < 0.05, 'right after the change the new weather is barely there: ' + m0[changed]);
  for (let i = 0; i < 300; i++) g2.step(1 / 60, null);
  const m1 = g2.getState().world.mix;
  assert.ok(m1[changed] > 0.3 && m1[changed] < 0.8 || g2.getState().world.weather !== changed, 'half way after 5 s');
  g2.setPaused(true);
  const frozen = JSON.stringify(g2.getState().world.mix);
  for (let i = 0; i < 300; i++) g2.step(1 / 60, null);
  assert.equal(JSON.stringify(g2.getState().world.mix), frozen);
  // dayFrac positions the clock exactly (debug)
  g2.setWorld({ dayFrac: 0.8, freezeClock: true });
  assert.ok(Math.abs(g2.getState().world.dayFrac - 0.8) < 1e-9 && g2.getState().world.phase === 'night');
});

test('sky: the nominal mood is the hard-cut rule of J2 (badge and debug), lookKey rounds the coefficients', () => {
  for (const ph of ['dawn', 'day', 'dusk', 'night']) for (const w of ['clear', 'cloudy', 'rain', 'mist']) assert.equal(nominalMood(ph, w, sky), lookFor(ph, w));
  assert.equal(lookKey({ coef: [0.5, 0.5, 0, 0, 0] }, 96), lookKey({ coef: [0.5004, 0.4996, 0, 0, 0] }, 96));
  assert.notEqual(lookKey({ coef: [0.5, 0.5, 0, 0, 0] }, 96), lookKey({ coef: [0.52, 0.48, 0, 0, 0] }, 96));
});

test('toasts: a phase or weather change gives a 3 s line, never more than 2 waiting, no repeat, one after the other', () => {
  assert.equal(announceKey({ type: 'phaseChanged', phase: 'dusk' }), 'announce.phase.dusk');
  assert.equal(announceKey({ type: 'weatherChanged', weather: 'rain' }), 'announce.weather.rain');
  assert.equal(announceKey({ type: 'cast' }), null);
  const t = createToasts({ durationS: 3 });
  assert.equal(t.current, null);
  assert.ok(t.push('announce.phase.dusk') && t.current === 'announce.phase.dusk');
  assert.equal(t.push('announce.phase.dusk'), false, 'same line is not repeated');
  t.push('announce.weather.rain');
  t.push('announce.weather.mist');
  t.push('announce.phase.night');
  assert.equal(t.waiting.length, 2, 'at most two waiting (oldest dropped)');
  assert.equal(t.tick(2.9), false);
  assert.equal(t.current, 'announce.phase.dusk');
  assert.equal(t.tick(0.2), true);
  assert.equal(t.current, 'announce.weather.mist');
  for (let i = 0; i < 20; i++) t.tick(0.5);
  assert.equal(t.current, null);
});

// ------------------------------------------------------------------ the picture
const cast = { tip: [312, 156], end: [345, 218], sag: -3, rings: 1 };
const meanLum = (fr) => {
  let s = 0;
  for (let i = 0; i < fr.length; i += 7) s += 0.3 * (fr[i] & 255) + 0.59 * ((fr[i] >>> 8) & 255) + 0.11 * ((fr[i] >>> 16) & 255);
  return s / Math.ceil(fr.length / 7);
};

test('live scene: the five moods paint the very same pixels (blending never shows a ghost), each frame is opaque', () => {
  const sc = createLiveScene({});
  for (const n of PRESET_NAMES) sc.bake(n); // throws if a mood paints other pixels than the first one
  assert.deepEqual(sc.baked().sort(), [...PRESET_NAMES].sort());
  const { land, fg } = sc.sizes();
  assert.ok(land > 30000 && fg > 5000, JSON.stringify({ land, fg }));
  const fr = sc.render({ time: 1, reduced: true, cast, splash: null, look: look(MID.dusk) });
  assert.ok(fr.every((v) => v >>> 24 === 255));
});

test('live scene: a pure coefficient gives the colours of that mood alone; half and half is in between', () => {
  const sc = createLiveScene({});
  const r = (l) => Uint32Array.from(sc.render({ time: 1, reduced: true, cast, splash: null, look: l }));
  const day = r(look(MID.day));
  const night = r(look(MID.night));
  const mix = r({ ...look(MID.day), coef: [0, 0.5, 0.5, 0, 0], stars: 0, sun: null, moon: null, lamp: 0, cabin: 0 });
  const dayOnly = r({ ...look(MID.day), sun: null, moon: null });
  const nightOnly = r({ ...look(MID.night), stars: 0, sun: null, moon: null, lamp: 0, cabin: 0 });
  // a hill pixel (land) is exactly half way between the two moods: x=240, y=190 is the near shore water; use a pine of the left bank
  const iLand = 150 * 480 + 40;
  const ch = (p, s) => (p >>> s) & 255;
  for (const s of [0, 8, 16]) {
    const a = ch(dayOnly[iLand], s);
    const b = ch(nightOnly[iLand], s);
    assert.ok(Math.abs(ch(mix[iLand], s) - (a + b) / 2) <= 2, `channel ${s}: ${ch(mix[iLand], s)} vs ${(a + b) / 2}`);
  }
  assert.ok(meanLum(night) < meanLum(mix) && meanLum(mix) < meanLum(day));
});

test('live scene: crossing dusk to night and day to dusk changes the picture slowly (mean luminance steps stay small, one second apart)', () => {
  const sc = createLiveScene({});
  let prev = null;
  let worst = 0;
  const lums = [];
  for (let s = 0; s <= 480; s += 1) {
    const fr = sc.render({ time: 2, reduced: true, cast, splash: null, look: look(s / 480) });
    const L = meanLum(fr);
    lums.push(L);
    if (prev !== null) worst = Math.max(worst, Math.abs(L - prev));
    prev = L;
  }
  assert.ok(worst < 4, 'largest change of the mean luminance in one game second: ' + worst.toFixed(2) + ' / 255');
  assert.ok(Math.max(...lums) - Math.min(...lums) > 40, 'but the day really changes the picture');
});

test('live scene: the blended colours are recomputed only when the rounded coefficients change (no per-frame blend)', () => {
  const sc = createLiveScene({});
  const l = look(0.3125);
  sc.render({ time: 0, reduced: true, cast, splash: null, look: l });
  const n0 = sc.stat.blends;
  for (let i = 0; i < 20; i++) sc.render({ time: i * 0.016, reduced: false, cast, splash: null, look: l });
  assert.equal(sc.stat.blends, n0);
  sc.render({ time: 0, reduced: true, cast, splash: null, look: look(0.5) });
  assert.equal(sc.stat.blends, n0 + 1);
});

test('live scene: stars, clouds and rain really are drawn; reduced motion = a still picture; clouds drift otherwise', () => {
  const sc = createLiveScene({});
  const night = look(MID.night);
  const dark = { ...night, stars: 0, cover: 0 };
  const a = Uint32Array.from(sc.render({ time: 1, reduced: true, cast, splash: null, look: dark }));
  const b = Uint32Array.from(sc.render({ time: 1, reduced: true, cast, splash: null, look: { ...night, cover: 0 } }));
  const diffStars = a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);
  assert.ok(diffStars > 60 && diffStars < 2000, 'stars: ' + diffStars + ' pixels');
  const cl1 = Uint32Array.from(sc.render({ time: 1, reduced: false, cast, splash: null, look: { ...night, cover: 0.8, stars: 0 } }));
  const cl2 = Uint32Array.from(sc.render({ time: 31, reduced: false, cast, splash: null, look: { ...night, cover: 0.8, stars: 0 } }));
  let rowsDiff = 0;
  for (let i = 0; i < 100 * 480; i++) if (cl1[i] !== cl2[i]) rowsDiff++;
  assert.ok(rowsDiff > 500, 'clouds drift in 30 s: ' + rowsDiff);
  const s1 = Uint32Array.from(sc.render({ time: 1, reduced: true, cast, splash: null, look: { ...night, cover: 0.8, rain: 1 } }));
  const s2 = Uint32Array.from(sc.render({ time: 99, reduced: true, cast, splash: null, look: { ...night, cover: 0.8, rain: 1 } }));
  assert.deepEqual(s1, s2, 'reduced motion: still (no drift, no moving rain)');
  const dry = Uint32Array.from(sc.render({ time: 3, reduced: false, cast, splash: null, look: { ...night, rain: 0 } }));
  const wet = Uint32Array.from(sc.render({ time: 3, reduced: false, cast, splash: null, look: { ...night, rain: 1 } }));
  assert.ok(wet.reduce((n, v, i) => n + (v !== dry[i] ? 1 : 0), 0) > 1500, 'rain streaks and ripples paint pixels');
});

test('live scene: the pinned-mood API of J1b still works (createScene on a preset object)', () => {
  const sc = createScene({ preset: presets.night });
  const fr = sc.render({ time: 1, reduced: true, cast, splash: null });
  assert.ok(fr.every((v) => v >>> 24 === 255) && sc.look.dominant === 'night');
});

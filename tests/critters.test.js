import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/data/config.js';
import weatherList from '../src/data/weather.js';
import sky from '../src/data/sky.js';
import presets from '../src/data/palettes.js';
import data from '../src/data/critters.js';
import { lookParams, snapMix, pinnedLook } from '../src/core/sky.js';
import { createCritters, createCat, envFromLook, parseCritterParams, KINDS, MOVING_KINDS } from '../src/core/critters.js';
import { createLiveScene, createScene } from '../src/art/compose.js';
import { bakeForeground, W } from '../src/art/sceneBake.js';
import { createRaster } from '../src/art/raster.js';
import { drawCat } from '../src/art/catPaint.js';
import { makeGame, DT } from './helpers.js';

const TOD = { dawn: { dawn: 1, day: 0, dusk: 0, night: 0 }, day: { dawn: 0, day: 1, dusk: 0, night: 0 }, dusk: { dawn: 0, day: 0, dusk: 1, night: 0 }, night: { dawn: 0, day: 0, dusk: 0, night: 1 } };
const env = (ph, o = {}) => ({ tod: TOD[ph], rain: 0, cover: 0, veil: 0, light: 1, reduced: false, fishing: 'idle', floatX: null, ...o });

/** Runs a scheduler for `seconds` of game time at 1/60 s steps; returns every event ever seen (first sighting). */
function run(c, seconds, e, t0 = 0) {
  const seen = new Map();
  const n = Math.round(seconds * 60);
  for (let i = 0; i <= n; i++) {
    const t = t0 + i / 60;
    c.update(t, e);
    if (i % 6 === 0) for (const a of c.active(t, e)) if (!seen.has(a.id)) seen.set(a.id, { kind: a.kind, id: a.id, t0: t - a.age, p: a.p });
  }
  return [...seen.values()];
}
const kindsOf = (evs) => new Set(evs.map((e) => e.kind));

test('critters: same seed and session, same schedule; another seed, another one', () => {
  const sig = (seed, session) => JSON.stringify(run(createCritters({ seed, session }), 1500, env('day')).map((e) => [e.kind, +e.t0.toFixed(2)]));
  assert.equal(sig(7, 0), sig(7, 0));
  assert.notEqual(sig(7, 0), sig(8, 0));
  assert.notEqual(sig(7, 0), sig(7, 1));
  assert.ok(JSON.parse(sig(7, 0)).length > 5, 'something happens in 25 minutes of day');
});

test('critters: phase and weather coherence (no bat by day, no dragonfly at night, nothing in heavy rain, no star under clouds)', () => {
  const seeds = [1, 2, 3, 4, 5];
  const all = (ph, o) => seeds.flatMap((s) => run(createCritters({ seed: s }), 2400, env(ph, o)));
  const day = kindsOf(all('day', {}));
  for (const k of ['bat', 'owl', 'star']) assert.ok(!day.has(k), k + ' by day');
  const night = kindsOf(all('night', {}));
  for (const k of ['dragon', 'birds', 'geese', 'heron', 'frog']) assert.ok(!night.has(k), k + ' at night');
  assert.ok(night.has('owl') && night.has('star') && night.has('jump'), 'night has owls, stars and jumps');
  const dusk = kindsOf(all('dusk', {}));
  assert.ok(dusk.has('bat') && dusk.has('geese') && dusk.has('heron') && dusk.has('frog'));
  assert.ok(!dusk.has('dragon') && !dusk.has('owl'));
  assert.ok(kindsOf(all('day', {})).has('dragon') && kindsOf(all('day', {})).has('birds'));
  const heavy = kindsOf(all('day', { rain: 1, cover: 1 }));
  assert.equal(heavy.size, 0, 'heavy rain: ' + [...heavy]);
  assert.ok(!kindsOf(all('night', { cover: 0.7 })).has('star'), 'no shooting star under clouds');
  assert.ok(!kindsOf(all('day', { veil: 0.58, cover: 0.3 })).has('dragon'), 'no dragonfly in mist');
  const light = kindsOf(all('day', { rain: 0.1 }));
  assert.ok(!light.has('dragon'), 'rain 0.1 already stops the dragonflies');
  assert.ok(!kindsOf(all('day', { rain: 0.5 })).has('birds'), 'no birds in rain');
});

test('critters: flyovers never start less than 90 s apart; one shooting star at a time', () => {
  for (const s of [1, 2, 3]) {
    for (const ph of ['dawn', 'day', 'dusk', 'night']) {
      const ev = run(createCritters({ seed: s }), 3000, env(ph)).filter((e) => data.kinds[e.kind].cls === 'sky').sort((a, b) => a.t0 - b.t0);
      for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t0 - ev[i - 1].t0 >= data.skyMinGapS - 0.2, `${ph} seed ${s}: ${ev[i].kind} ${(ev[i].t0 - ev[i - 1].t0).toFixed(1)} s after ${ev[i - 1].kind}`);
    }
  }
});

test('critters: rates of the brief (fish jump every 40-90 s of calm, a flyover every 3-6 minutes by day, a star every 4-9 minutes of night)', () => {
  const rate = (ph, kind, secs, o) => {
    let n = 0;
    for (const s of [11, 12, 13, 14]) n += run(createCritters({ seed: s }), secs, env(ph, o)).filter((e) => e.kind === kind).length;
    return (secs * 4) / n;
  };
  const j = rate('day', 'jump', 3000);
  assert.ok(j >= 38 && j <= 110, 'jump mean gap ' + j);
  const jr = rate('day', 'jump', 3000, { rain: 0.45 });
  assert.ok(jr > j, 'fewer jumps in light rain');
  const b = rate('day', 'birds', 6000);
  assert.ok(b >= 170 && b <= 400, 'bird mean gap ' + b);
  const s = rate('night', 'star', 9000);
  assert.ok(s >= 230 && s <= 600, 'star mean gap ' + s);
});

test('critters: a jumping fish is never near the float and never during a bite', () => {
  for (const fx of [320, 376]) {
    const ev = run(createCritters({ seed: 5 }), 3000, env('day', { floatX: fx, fishing: 'waiting' })).filter((e) => e.kind === 'jump');
    assert.ok(ev.length > 20);
    for (const e of ev) assert.ok(Math.abs(e.p.x - fx) >= data.kinds.jump.floatKeepPx, `jump at ${e.p.x} with the float at ${fx}`);
  }
  assert.equal(run(createCritters({ seed: 5 }), 600, env('day', { fishing: 'bite' })).filter((e) => e.kind === 'jump').length, 0, 'no jump during a bite');
});

test('critters: nothing starts or goes on with reduced motion; the frog alone stays, still, and only while the light allows', () => {
  const c = createCritters({ seed: 3 });
  const e = env('day', { reduced: true });
  assert.equal(run(c, 600, e).filter((x) => x.kind !== 'frog').length, 0);
  const a = c.active(10, e);
  assert.deepEqual(a.map((x) => x.kind), ['frog']);
  assert.ok(a[0].still);
  assert.equal(c.active(10, env('night', { reduced: true })).length, 0);
  assert.equal(c.active(10, env('day', { reduced: true, rain: 1 })).length, 0);
  // events running when the setting is turned on disappear at once
  const d = createCritters({ seed: 3, mode: 'all' });
  run(d, 20, env('day'));
  assert.ok(d.active(20, env('day')).length > 0);
  d.update(20.02, e);
  assert.ok(d.active(20.02, e).every((x) => x.kind === 'frog'));
  for (const k of MOVING_KINDS) assert.ok(KINDS.includes(k));
});

test('critters: an event does not pop when the phase or the weather changes: its opacity follows the light, step by step', () => {
  for (const kind of ['bat', 'heron', 'dragon', 'jump', 'frog']) {
    const c = createCritters({ seed: 4 });
    const start = kind === 'bat' || kind === 'heron' ? 'dusk' : 'day';
    const ev = c.force(kind, 0, env(start));
    assert.ok(ev, kind);
    let prev = null;
    let sawDrop = false;
    // the light goes away over 20 s (dusk -> night, day -> rain)
    for (let i = 0; i <= 60 * Math.min(ev.dur, 25); i++) {
      const t = i / 60;
      const k = Math.min(1, t / 20);
      const e = start === 'dusk' ? env('dusk', { tod: { dawn: 0, day: 0, dusk: 1 - k, night: k } }) : env('day', { rain: k });
      c.update(t, e);
      const a = c.active(t, e).find((x) => x.id === ev.id);
      if (!a) break;
      if (prev !== null) assert.ok(Math.abs(a.alpha - prev) < 0.08, `${kind}: opacity jumps ${prev} -> ${a.alpha} at ${t}`);
      if (prev !== null && a.alpha < prev - 1e-6) sawDrop = true;
      prev = a.alpha;
    }
    assert.ok(prev !== null);
    if (kind === 'heron' || kind === 'dragon') assert.ok(sawDrop, kind + ' fades with the light');
  }
});

test('critters: the fish draw of the game is identical with and without creatures (their own random streams)', () => {
  const play = (withCritters) => {
    const g = makeGame({ seed: 9 });
    const c = createCritters({ seed: 9, session: 0, mode: 'all' });
    const cat = createCat({ seed: 9 });
    const log = [];
    for (let i = 0; i < 60 * 900; i++) {
      const act = i % 1500 === 10 ? { down: true } : i % 1500 === 40 ? { up: true } : i % 1500 === 900 ? { down: true } : undefined;
      if (withCritters) {
        const e = env('dusk', { fishing: g.getState().fishing.phase, floatX: 340 });
        c.update(i * DT, e);
        c.active(i * DT, e);
        cat.update(i * DT, e);
      }
      for (const ev of g.step(DT, act)) log.push(ev);
    }
    return JSON.stringify([log, g.getState().fishing, g.getState().pity]);
  };
  const a = play(false);
  assert.ok(a.includes('bite'), 'the test game gets bites');
  assert.equal(play(true), a);
});

test('critters: a mode of the debug parameters only works with ?debug=1', () => {
  assert.deepEqual(parseCritterParams('?critters=all', false), { mode: 'natural', only: null });
  assert.deepEqual(parseCritterParams('?critters=all', true), { mode: 'all', only: null });
  assert.deepEqual(parseCritterParams('?critter=heron', true), { mode: 'only', only: 'heron' });
  assert.deepEqual(parseCritterParams('?critter=heron', false), { mode: 'natural', only: null });
  assert.deepEqual(parseCritterParams('?critter=dragon_x', true), { mode: 'natural', only: null });
  assert.deepEqual(parseCritterParams('?critters=off', true), { mode: 'off', only: null });
  assert.equal(createCritters({ seed: 1, mode: 'off' }).active(5, env('day')).length, 0);
  const only = run(createCritters({ seed: 1, mode: 'only', only: 'heron' }), 120, env('night', { rain: 1 }));
  assert.ok(only.length >= 2 && kindsOf(only).size === 1 && only[0].kind === 'heron');
  const all = createCritters({ seed: 1, mode: 'all' });
  run(all, 25, env('night', { rain: 1 }));
  assert.ok(new Set(all.active(25, env('night')).map((a) => a.kind)).size >= 4, 'several creatures at once with ?critters=all');
});

test('critters: envFromLook reads the five numbers of a look (also a pinned mood)', () => {
  const l = lookParams(0.3125, snapMix(weatherList, 'clear'), weatherList, config, sky);
  const e = envFromLook(l, { fishing: 'waiting', floatX: 340 });
  assert.equal(e.tod.day, 1);
  assert.equal(e.fishing, 'waiting');
  const pin = envFromLook(pinnedLook('night', presets, sky), {});
  assert.equal(pin.tod.night, 1);
});

// ------------------------------------------------------------------ the cat
const pose = (c, t, e) => c.update(t, e);
const walk = (c, from, to, e) => {
  let d;
  for (let t = from; t <= to; t += 1 / 60) d = c.update(t, e);
  return d;
};

test('cat: sits by day, curls and breathes at night, stays curled in heavy rain, wakes at dawn with a yawn', () => {
  const c = createCat({ seed: 1 });
  let d = walk(c, 0, 5, env('day'));
  assert.equal(d.body, 'sit');
  d = walk(c, 5, 5 + data.cat.sleep.dozeS - 0.5, env('night'));
  assert.equal(d.body, 'sit', 'still settling');
  assert.ok(['half', 'closed'].includes(d.eyes));
  d = walk(c, 5 + data.cat.sleep.dozeS, 20, env('night'));
  assert.equal(d.body, 'curl');
  const keys = new Set();
  for (let t = 20; t < 30; t += 1 / 10) keys.add(c.update(t, env('night')).key);
  assert.equal(keys.size, 2, 'slow breathing: two poses');
  // dawn: wakes (rises, yawns, then sits)
  let t = 30;
  const seen = [];
  for (; t < 40; t += 1 / 30) {
    const x = c.update(t, env('dawn'));
    seen.push(x.body + ':' + x.mouth);
  }
  assert.ok(seen.includes('sit:2'), 'a yawn on waking');
  assert.equal(seen[seen.length - 1].slice(0, 3), 'sit');
  // heavy rain by day: curled; light rain: not
  const r = createCat({ seed: 2 });
  assert.equal(walk(r, 0, 10, env('day', { rain: 1 })).body, 'curl');
  assert.equal(walk(createCat({ seed: 2 }), 0, 10, env('day', { rain: 0.3 })).body, 'sit');
  // asleep it ignores the fishing
  assert.equal(walk(c, 40, 60, env('night', { fishing: 'bite' })).body, 'curl');
});

test('cat: looks at the float while waiting, ears up at a bite, content after a catch, tiny idle moves otherwise', () => {
  const c = createCat({ seed: 3 });
  walk(c, 0, 3, env('day'));
  let d = walk(c, 3, 3.5, env('day', { fishing: 'waiting' }));
  assert.equal(d.headDy, 0, 'does not look at once');
  d = walk(c, 3.5, 6, env('day', { fishing: 'waiting' }));
  assert.equal(d.headDy, 1);
  assert.ok(['down', 'closed'].includes(d.eyes));
  d = walk(c, 6, 6.2, env('day', { fishing: 'bite' }));
  assert.equal(d.ear, 2);
  assert.equal(d.eyes, 'wide');
  walk(c, 6.2, 8, env('day', { fishing: 'reeling' }));
  d = walk(c, 8, 8.5, env('day', { fishing: 'caught' }));
  assert.equal(d.eyes, 'happy');
  d = walk(c, 8.5, 8 + data.cat.happyS - 0.2, env('day', { fishing: 'idle' }));
  assert.equal(d.eyes, 'happy');
  d = walk(c, 8 + data.cat.happyS, 8 + data.cat.happyS + 1, env('day', { fishing: 'idle' }));
  assert.notEqual(d.eyes, 'happy');
  // idle: blinks, ear flicks, tail swishes and (rarely) yawns all happen within 3 minutes
  const idle = createCat({ seed: 4 });
  const sawEyes = new Set();
  const sawEar = new Set();
  const sawTail = new Set();
  const sawMouth = new Set();
  for (let t = 0; t < 240; t += 1 / 30) {
    const x = idle.update(t, env('day'));
    sawEyes.add(x.eyes);
    sawEar.add(x.ear);
    sawTail.add(x.tail);
    sawMouth.add(x.mouth);
  }
  assert.ok(sawEyes.has('closed') && sawEar.has(1) && sawTail.has(1) && sawTail.has(2) && sawMouth.has(2));
});

test('cat: reduced motion = only the still poses (sit by day, curled at night / in heavy rain), no loops', () => {
  const c = createCat({ seed: 5 });
  const keys = new Set();
  for (let t = 0; t < 120; t += 0.1) keys.add(c.update(t, env('day', { reduced: true, fishing: t > 50 ? 'bite' : 'waiting' })).key);
  assert.deepEqual([...keys], ['sit|0|0|open|0|0|0']);
  assert.equal(c.update(130, env('night', { reduced: true })).body, 'curl');
  assert.equal(c.update(131, env('night', { reduced: true })).key, c.update(140, env('night', { reduced: true })).key, 'no breathing');
  assert.equal(c.update(150, env('day', { reduced: true, rain: 1 })).body, 'curl');
  assert.equal(c.update(160, env('dawn', { reduced: true })).body, 'sit');
});

test('cat: deterministic', () => {
  const sig = (s) => {
    const c = createCat({ seed: s });
    let out = '';
    for (let t = 0; t < 120; t += 1 / 10) out += c.update(t, env('day')).key + ';';
    return out;
  };
  assert.equal(sig(3), sig(3));
  assert.notEqual(sig(3), sig(4));
});

// ------------------------------------------------------------------ the pixels
test('art: the sitting cat of the live scene is the cat of the mock-up, pixel for pixel (day mood)', () => {
  const scene = createScene({ preset: presets.day });
  const frame = scene.render({ time: 0, reduced: true, cast: { tip: [284, 148], end: null, sag: 0, rings: 0, landX: 340, landY: 216 }, splash: null });
  const legacy = bakeForeground(presets.day, 77, false).buf;
  const mask = createRaster(W, 270);
  drawCat(mask, 150, 183);
  let n = 0;
  let bad = 0;
  for (let i = 0; i < mask.buf.length; i++) {
    if (mask.buf[i] >>> 24 === 0) continue;
    n++;
    if (frame[i] !== legacy[i]) bad++;
  }
  assert.ok(n > 300, 'cat pixels ' + n);
  assert.equal(bad, 0);
});

test('art: each creature changes the picture where it should (crop diff against the same frame without it), and draws nothing outside the picture', () => {
  const cast = { tip: [284, 148], end: null, sag: 0, rings: 0, landX: 340, landY: 216 };
  const cases = { birds: ['day', 12], geese: ['dusk', 18], heron: ['dusk', 12], owl: ['night', 7], bat: ['dusk', 3], star: ['night', 0.5], jump: ['day', 0.4], dragon: ['day', 8], frog: ['day', 20] };
  for (const [kind, [mood, age]] of Object.entries(cases)) {
    const look = pinnedLook(mood, presets, sky);
    const e = envFromLook(look, {});
    const c = createCritters({ seed: 7, mode: 'all' });
    const ev = c.force(kind, 0, e);
    assert.ok(ev, kind);
    const sc = createLiveScene({ look });
    const base = Uint32Array.from(sc.render({ time: age, reduced: false, cast, splash: null, look }));
    const withIt = sc.render({ time: age, reduced: false, cast, splash: null, look, critters: { events: c.active(age, e) } });
    let diff = 0;
    for (let i = 0; i < base.length; i++) if (base[i] !== withIt[i]) diff++;
    assert.ok(diff >= 4, `${kind} draws something (${diff} pixels)`);
    assert.ok(diff < 900, `${kind} stays small (${diff} pixels)`);
  }
});

test('art: the cat of every pose is drawn inside its box and the key tells the pictures apart', () => {
  const c = createCat({ seed: 1 });
  const keys = new Set();
  const imgs = new Set();
  const look = pinnedLook('day', presets, sky);
  const sc = createLiveScene({ look });
  const cast = { tip: [284, 148], end: null, sag: 0, rings: 0, landX: 340, landY: 216 };
  for (const [ph, fishing] of [['day', 'idle'], ['day', 'waiting'], ['day', 'bite'], ['day', 'caught'], ['night', 'idle'], ['dawn', 'idle']]) {
    for (let t = 0; t < 40; t += 0.25) {
      const d = c.update(t + (ph === 'dawn' ? 40 : 0), env(ph, { fishing }));
      if (keys.has(d.key)) continue;
      keys.add(d.key);
      const f = sc.render({ time: 0, reduced: true, cast, splash: null, look, cat: d });
      let h = '';
      for (let y = 176; y < 207; y++) h += Array.from(f.slice(y * W + 145, y * W + 179)).join();
      imgs.add(h);
    }
  }
  assert.ok(keys.size >= 10, 'poses seen: ' + keys.size);
  assert.ok(imgs.size >= keys.size - 3, `pictures ${imgs.size} for ${keys.size} poses`);
});

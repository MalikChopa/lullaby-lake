import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDebug } from '../src/platform/debug.js';
import { createPerf, percentile } from '../src/platform/perf.js';
import { createAudioHooks } from '../src/audio/hooks.js';
import { computeAnglerParams, landingPoint } from '../src/render/angler.js';
import { IDLE_TIP, FWD_TIP } from '../src/art/anglerPaint.js';
import config from '../src/data/config.js';
import { createFishingState } from '../src/core/fishing.js';

test('debug: nothing is active without ?debug=1', () => {
  const d = parseDebug('?seed=7&speed=20&state=bite');
  assert.equal(d.debug, false);
  assert.equal(d.seed, null);
  assert.equal(d.speed, 1);
});

test('debug: seed, speed (1..60), state and rm are read', () => {
  const d = parseDebug('?debug=1&seed=7&speed=20&rm=1&state=bite');
  assert.deepEqual([d.debug, d.seed, d.speed, d.rm, d.state], [true, 7, 20, true, 'bite']);
  assert.equal(parseDebug('?debug=1&speed=999').speed, 60);
  assert.equal(parseDebug('?debug=1&seed=abc').seed, null);
  assert.equal(parseDebug('?perf=1').perf, true);
});

test('perf: percentiles and frame rate', () => {
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
  const p = createPerf();
  for (let i = 0; i < 700; i++) p.frame(i % 100 === 0 ? 60 : 1, 16.667);
  const s = p.stats();
  assert.equal(s.frames, 600);
  assert.equal(s.total, 700);
  assert.ok(s.workP50 === 1 && s.workMax === 60 && s.longTasks > 0);
  assert.ok(Math.abs(s.fps - 60) < 0.1);
});

test('audio hooks: count and log, nothing audible', () => {
  const a = createAudioHooks();
  a.play('bite');
  a.play('catch');
  assert.equal(a.count, 2);
  assert.deepEqual(a.log, ['bite', 'catch']);
});

test('angler: landing moves right with the distance; the pose follows the phase; reduced motion freezes the bob', () => {
  const near = landingPoint(40, config.cast);
  const far = landingPoint(150, config.cast);
  assert.ok(far.x > near.x && far.height > near.height && far.y === near.y);
  assert.equal(landingPoint(-999, config.cast).x, near.x); // clamped
  const f = { ...createFishingState(), phase: 'waiting', distPx: 95 };
  const w = computeAnglerParams(f, 0.1, false, config);
  assert.ok(w.end && w.rings === 1 && w.landX === landingPoint(95, config.cast).x);
  const bite = computeAnglerParams({ ...f, phase: 'bite' }, 0.1, true, config);
  const bite2 = computeAnglerParams({ ...f, phase: 'bite' }, 0.2, true, config);
  assert.equal(bite.end[1], bite2.end[1]); // reduced: fixed dip
  assert.equal(bite.rings, 2);
  const idle = computeAnglerParams({ ...f, phase: 'idle', casts: 0 }, 0, false, config);
  assert.deepEqual(idle.tip, IDLE_TIP);
  assert.equal(idle.rings, 0);
  assert.equal(computeAnglerParams({ ...f, phase: 'caught' }, 0, false, config).end, null);
});

test('angler: the cast follows the mock-up timings (lean 0.8 s, swing 0.5 s, release 0.3 s, flight 1.05 s)', () => {
  const c = config.cast;
  const at = (phase, t, extra = {}) => computeAnglerParams({ ...createFishingState(), phase, t, power: 0.5, distPx: 95, casts: 1, ...extra }, 0, true, config);
  // charging: the rod leans back over leanS and stays there
  assert.deepEqual(at('charging', 0).tip, IDLE_TIP.map((v, i) => v - 0 * i));
  const lean = at('charging', c.leanS);
  assert.ok(lean.tip[0] < IDLE_TIP[0] - 20 && Math.abs(at('charging', c.leanS + 5).tip[0] - lean.tip[0]) < 1e-9);
  // casting: line follows the tip until the release, then flies to the landing point
  const L = landingPoint(95, config.cast);
  const before = at('casting', c.releaseAtS - 0.01);
  assert.ok(Math.abs(before.end[0] - before.tip[0]) < 1e-9);
  const mid = at('casting', c.releaseAtS + c.flightS / 2);
  assert.ok(mid.end[0] > FWD_TIP[0] && mid.end[0] < L.x && mid.end[1] < L.y - 5, 'in the air, above the water');
  const landed = at('casting', c.landS);
  assert.ok(Math.abs(landed.end[0] - L.x) < 1e-6 && Math.abs(landed.end[1] - L.y) < 1e-6, 'lands exactly on the landing point when the logical phase ends');
  assert.deepEqual(at('casting', c.swingS + 0.2).tip, FWD_TIP);
  // the rod comes back to rest after a cast, but not at the very start
  assert.deepEqual(at('idle', 0).tip, FWD_TIP);
  assert.deepEqual(at('idle', 5).tip, IDLE_TIP);
  assert.deepEqual(at('idle', 0, { casts: 0 }).tip, IDLE_TIP);
});

test('debug: ?preset= is read with or without ?debug=1', () => {
  assert.equal(parseDebug('?preset=night').preset, 'night');
  assert.equal(parseDebug('?debug=1&preset=fog').preset, 'fog');
  assert.equal(parseDebug('').preset, null);
});

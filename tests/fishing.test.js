import test from 'node:test';
import assert from 'node:assert/strict';
import { DT, data, makeGame, runUntil, stepN, castToBite, makeRaw } from './helpers.js';
import { chargePower } from '../src/core/fishing.js';

const ctx = (holdS = 8) => ({ config: data.config, species: data.species, phase: 'dusk', weather: 'clear', holdS });

test('a short press is a medium cast (power 0.5)', () => {
  const g = makeGame();
  stepN(g, 1, { down: true });
  const ev = stepN(g, 1, { up: true });
  const cast = ev.find((e) => e.type === 'cast');
  assert.equal(cast.power, 0.5);
  assert.equal(cast.distPx, 95); // 40 + 0.5 * (150 - 40)
  assert.equal(g.getState().fishing.phase, 'casting');
});

test('a 600 ms hold casts with the power of the sine at 0.6 s and the line lands within 1.5 s', () => {
  const g = makeGame();
  stepN(g, 1, { down: true });
  stepN(g, 35); // 36 steps = 0.6 s in total
  const ev = stepN(g, 1, { up: true });
  const expected = chargePower(36 * DT, data.config.cast); // the release is read before the step adds time: t = 0.6 s
  assert.ok(Math.abs(ev.find((e) => e.type === 'cast').power - expected) < 0.03);
  const r = runUntil(g, (e, s) => s.fishing.phase === 'waiting');
  assert.ok(r.steps * DT <= 1.5, 'waiting reached in ' + r.steps * DT + ' s');
});

test('the charge breathes between 0 and 1 (peak at pi / powerRate s), never fails, never overshoots', () => {
  const rate = data.config.cast.powerRate;
  const peakSteps = Math.round((Math.PI / rate) * 60); // about 1.43 s
  let g = makeGame();
  assert.equal(g.getState().fishing.power, 0);
  stepN(g, 1, { down: true });
  stepN(g, peakSteps - 1);
  assert.ok(g.getState().fishing.power > 0.998, 'power at the peak: ' + g.getState().fishing.power);
  const ev = stepN(g, 1, { up: true });
  assert.equal(ev.find((e) => e.type === 'cast').distPx > 148, true);
  g = makeGame();
  stepN(g, 1, { down: true });
  stepN(g, 59 * 3); // 3 s: the power has come back down
  const p3 = g.getState().fishing.power;
  assert.ok(p3 >= 0 && p3 <= 1 && p3 < 0.2, 'power at 3 s: ' + p3);
  for (let i = 0; i < 600; i++) {
    stepN(g, 1);
    const p = g.getState().fishing.power;
    assert.ok(p >= 0 && p <= 1);
  }
});

test('the logical casting phase lasts landS = releaseAtS + flightS = 1.35 s, the time the picture needs for swing, flight and splash', () => {
  const c = data.config.cast;
  assert.ok(Math.abs(c.releaseAtS + c.flightS - c.landS) < 1e-9);
  assert.ok(c.swingS > c.releaseAtS && c.leanS > 0);
  const g = makeGame();
  stepN(g, 1, { down: true });
  stepN(g, 1, { up: true });
  const r = runUntil(g, (e) => e.some((x) => x.type === 'landed'));
  const total = (r.steps + 1) * DT; // + the release step
  assert.ok(total >= c.landS - 1e-6 && total <= c.landS + DT + 1e-6, 'landed after ' + total + ' s');
  assert.equal(g.getState().fishing.phase, 'waiting');
});

test('first cast of the session: the bite comes within 4 s of the landing', () => {
  const g = makeGame({ seed: 3 });
  stepN(g, 1, { down: true });
  stepN(g, 1, { up: true });
  runUntil(g, (e, s) => s.fishing.phase === 'waiting');
  const r = runUntil(g, (e) => e.some((x) => x.type === 'bite'));
  assert.ok(r.steps * DT <= 4 + DT && r.steps * DT >= 2 - DT, 'bite after ' + r.steps * DT);
});

test('later casts wait 4 to 12 s', () => {
  const g = makeGame({ seed: 5 });
  castToBite(g);
  stepN(g, 1, { down: true }); // reel
  runUntil(g, (e) => e.some((x) => x.type === 'caught'));
  stepN(g, 1, { down: true }); // release
  stepN(g, 1, { down: true });
  stepN(g, 1, { up: true });
  runUntil(g, (e, s) => s.fishing.phase === 'waiting');
  const w = g.getState().fishing.waitS;
  assert.ok(w >= 4 && w <= 12, 'waitS=' + w);
});

test('hold delay: a press at 7.9 s reels in', () => {
  const g = makeGame({ seed: 11 });
  castToBite(g);
  stepN(g, 474); // 7.9 s after the bite
  assert.equal(g.getState().fishing.phase, 'bite');
  const ev = stepN(g, 1, { down: true });
  assert.equal(ev.some((e) => e.type === 'escaped'), false);
  assert.equal(g.getState().fishing.phase, 'reeling');
});

test('hold delay: without a press the fish leaves at 8.0 s (+-1 step), never before', () => {
  const g = makeGame({ seed: 11 });
  castToBite(g);
  let n = 0;
  let escapedAt = null;
  while (n < 600 && escapedAt === null) {
    n++;
    if (g.step(DT).some((e) => e.type === 'escaped')) escapedAt = n;
  }
  assert.ok(escapedAt >= 479, 'left too early at step ' + escapedAt);
  assert.ok(escapedAt <= 481, 'left too late at step ' + escapedAt);
  assert.equal(escapedAt, 480);
});

test('the fish that left is the same one and comes back without a new draw', () => {
  const m = makeRaw(21);
  let s = m.state;
  const c = ctx(8);
  const run = (n, actions) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = m.step(s, DT, i === 0 ? actions : undefined, c, m.rng);
      s = r.state;
      out.push(...r.events);
    }
    return out;
  };
  run(1, { down: true });
  run(1, { up: true });
  let ev = [];
  while (!ev.some((e) => e.type === 'bite')) ev = run(1);
  const fish = s.fish;
  while (!ev.some((e) => e.type === 'escaped')) ev = run(1);
  assert.equal(s.phase, 'waiting');
  assert.equal(s.returning, fish.id);
  assert.deepEqual(s.fish, fish);
  assert.ok(s.waitS >= 4 && s.waitS <= 8, 'return wait ' + s.waitS);
  const before = { ...m.counts };
  let steps = 0;
  while (!ev.some((e) => e.type === 'bite')) {
    ev = run(1);
    steps++;
  }
  assert.deepEqual(m.counts, before, 'the rng is not touched between leaving and coming back');
  assert.equal(ev.find((e) => e.type === 'bite').returning, true);
  assert.deepEqual(s.fish, fish);
  assert.ok(Math.abs(steps * DT - s.waitS) < 2 * DT);
  // and it can be caught
  run(1, { down: true });
  while (!ev.some((e) => e.type === 'caught')) ev = run(1);
  assert.deepEqual(ev.find((e) => e.type === 'caught').sizeCm, fish.sizeCm);
});

test('the fish can leave and come back several times', () => {
  const g = makeGame({ seed: 4 });
  castToBite(g);
  let escapes = 0;
  let returns = 0;
  for (let i = 0; i < 60 * 80 && escapes < 3; i++) {
    for (const e of g.step(DT)) {
      if (e.type === 'escaped') escapes++;
      if (e.type === 'bite' && e.returning) returns++;
    }
  }
  assert.equal(escapes, 3);
  assert.ok(returns >= 2);
});

test('pulling the line while the fish is away: back to idle, nothing counted', () => {
  const g = makeGame({ seed: 8 });
  castToBite(g);
  runUntil(g, (e) => e.some((x) => x.type === 'escaped'));
  assert.equal(g.getState().fishing.phase, 'waiting');
  stepN(g, 1, { down: true });
  assert.equal(g.getState().fishing.phase, 'retracting');
  const ev = runUntil(g, (e, s) => s.fishing.phase === 'idle').events;
  const st = g.getState();
  assert.equal(st.fishing.returning, null);
  assert.equal(st.fishing.fish, null);
  assert.equal(Object.keys(st.book).length, 0);
  assert.equal(ev.some((e) => e.type === 'caught'), false);
});

test('no limit (holdS = null): 5 minutes without a press, the fish is still there', () => {
  const g = makeGame({ seed: 2, forever: true });
  castToBite(g);
  const ev = stepN(g, 60 * 300);
  assert.equal(ev.some((e) => e.type === 'escaped'), false);
  assert.equal(g.getState().fishing.phase, 'bite');
  assert.equal(g.getState().holdS, null);
});

test('the setting can change between two bites', () => {
  const g = makeGame({ seed: 6 });
  g.setFishWaitsForever(true);
  assert.equal(g.getState().holdS, null);
  g.setFishWaitsForever(false);
  assert.equal(g.getState().holdS, 8);
});

test('book or settings open: the 8 s delay is frozen', () => {
  const g = makeGame({ seed: 9 });
  castToBite(g);
  stepN(g, 240); // 4 s
  g.setPaused(true);
  const t0 = g.getState().fishing.t;
  const ev = stepN(g, 60 * 60); // a minute "open"
  assert.equal(ev.length, 0);
  assert.equal(g.getState().fishing.t, t0);
  g.setPaused(false);
  const r = runUntil(g, (e) => e.some((x) => x.type === 'escaped'));
  assert.ok(Math.abs(r.steps - 240) <= 1, 'the remaining time is 4 s, got ' + r.steps * DT);
});

test('reeling takes 1.2 s then the card: caught, new, then released with a press', () => {
  const g = makeGame({ seed: 12 });
  castToBite(g);
  stepN(g, 1, { down: true });
  const r = runUntil(g, (e) => e.some((x) => x.type === 'caught'));
  assert.ok(Math.abs(r.steps * DT - 1.2) <= 2 * DT);
  const caught = r.events.find((e) => e.type === 'caught');
  assert.ok(data.species.some((x) => x.id === caught.speciesId && x.phases.includes('dusk')), 'a dusk species: ' + caught.speciesId);
  assert.equal(caught.isNew, true);
  assert.equal(caught.isRecord, false);
  assert.equal(g.getState().fishing.phase, 'caught');
  stepN(g, 60 * 30); // the card never closes by itself
  assert.equal(g.getState().fishing.phase, 'caught');
  stepN(g, 1, { down: true });
  assert.equal(g.getState().fishing.phase, 'idle');
});

test('same seed and session: same events; another session: another sequence', () => {
  const seq = (sessions) => {
    const g = makeGame({ seed: 77, sessions });
    const out = [];
    castToBite(g);
    for (let i = 0; i < 60 * 40; i++) out.push(...g.step(DT).map((e) => e.type + ':' + i));
    return JSON.stringify([g.getState().fishing.fish, out]);
  };
  assert.equal(seq(0), seq(0));
  assert.notEqual(seq(0), seq(1));
});

test('presses are ignored where they have no meaning (casting, reeling)', () => {
  const g = makeGame({ seed: 13 });
  stepN(g, 1, { down: true });
  stepN(g, 1, { up: true });
  stepN(g, 1, { down: true });
  assert.equal(g.getState().fishing.phase, 'casting');
});

test('J5 regression: a fish that left, came back and was caught does not stay "away": the NEXT bite is a new draw (it used to throw and freeze the loop)', () => {
  const g = makeGame({ seed: 4 });
  castToBite(g);
  runUntil(g, (e) => e.some((x) => x.type === 'escaped'));
  runUntil(g, (e) => e.some((x) => x.type === 'bite' && x.returning));
  stepN(g, 1, { down: true });
  runUntil(g, (e) => e.some((x) => x.type === 'caught'));
  assert.equal(g.getState().fishing.returning, null, 'reeling a returned fish clears `returning`');
  stepN(g, 1, { down: true }); // release
  stepN(g, 1, { down: true }); // cast
  stepN(g, 1, { up: true });
  let bite = null;
  assert.doesNotThrow(() => {
    runUntil(g, (e) => (bite = e.find((x) => x.type === 'bite')) !== undefined, 60 * 60);
  });
  assert.equal(bite.returning, false);
  assert.equal(g.getState().fishing.returning, null);
});

test('J5 regression: `returning` set while the fish is gone (no fish kept) falls back on a normal draw instead of throwing', () => {
  const m = makeRaw(3);
  const c = ctx(8);
  let s = { ...m.state, phase: 'waiting', t: 0, waitS: 0.01, returning: 'ghost', fish: null, firstCastDone: true };
  let ev = [];
  assert.doesNotThrow(() => {
    for (let i = 0; i < 60 * 30 && !ev.some((e) => e.type === 'bite'); i++) {
      const r = m.step(s, DT, undefined, c, m.rng);
      s = r.state;
      ev = r.events;
    }
  });
  assert.ok(ev.some((e) => e.type === 'bite' && e.returning === false));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, fork, hashSeed, between } from '../src/core/rng.js';
import { rollSize, updateRecord } from '../src/core/sizeRoll.js';
import { recordCatch, emptyBook, distinctCount, totalCatches, isComplete, resetPity } from '../src/core/collection.js';
import { createClock, advanceClock, dayFrac, dayNumber, phaseAt, currentPhase, clockAtPhase } from '../src/core/clock.js';
import species from '../src/data/species.js';
import config from '../src/data/config.js';

test('rng: same seed gives the same sequence, values in [0,1)', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test('rng: fork gives independent, reproducible streams', () => {
  assert.equal(fork(5, 'fish')(), fork(5, 'fish')());
  assert.notEqual(fork(5, 'fish')(), fork(5, 'size')());
  assert.notEqual(fork(5, 'fish#0')(), fork(5, 'fish#1')());
  assert.notEqual(hashSeed(5, 'a'), hashSeed(6, 'a'));
});

test('rng: between stays inside the range', () => {
  const r = mulberry32(1);
  for (let i = 0; i < 500; i++) {
    const v = between(r, [4, 12]);
    assert.ok(v >= 4 && v < 12);
  }
});

test('sizeRoll: inside [min,max], rounded, mode is the most frequent zone', () => {
  const s = { min: 20, mode: 30, max: 45 };
  const r = mulberry32(3);
  let near = 0;
  let far = 0;
  for (let i = 0; i < 20000; i++) {
    const v = rollSize(s, r());
    assert.ok(Number.isInteger(v) && v >= 20 && v <= 45);
    if (v >= 27 && v <= 33) near++;
    if (v >= 38 && v <= 44) far++;
  }
  assert.ok(near > far * 2);
  assert.equal(rollSize(s, 0), 20);
  assert.equal(rollSize({ min: 5, mode: 5, max: 5 }, 0.4), 5);
});

test('sizeRoll: every real species stays inside its own sizes, and the mean is (min+mode+max)/3 within 1 cm + 1 %', () => {
  const r = mulberry32(11);
  for (const sp of species) {
    let sum = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const v = rollSize(sp.sizeCm, r());
      assert.ok(v >= sp.sizeCm.min && v <= sp.sizeCm.max, sp.id + ' ' + v);
      sum += v;
    }
    const expected = (sp.sizeCm.min + sp.sizeCm.mode + sp.sizeCm.max) / 3;
    assert.ok(Math.abs(sum / N - expected) < 1.0 + sp.sizeCm.max * 0.01, `${sp.id}: mean ${(sum / N).toFixed(2)} vs ${expected.toFixed(2)}`);
  }
});

test('sizeRoll: personal record, never announced for the first catch', () => {
  assert.deepEqual(updateRecord(undefined, 20), { recordCm: 20, isRecord: false });
  assert.deepEqual(updateRecord(null, 20), { recordCm: 20, isRecord: false });
  assert.deepEqual(updateRecord(20, 25), { recordCm: 25, isRecord: true });
  assert.deepEqual(updateRecord(25, 25), { recordCm: 25, isRecord: false });
  assert.deepEqual(updateRecord(25, 22), { recordCm: 25, isRecord: false });
});

test('collection: new, record, counts, first day', () => {
  let r = recordCatch(emptyBook(), 'a', 20, 3);
  assert.equal(r.isNew, true);
  assert.equal(r.isRecord, false);
  assert.equal(r.book.a.firstDay, 3);
  r = recordCatch(r.book, 'a', 25, 4);
  assert.equal(r.isNew, false);
  assert.equal(r.isRecord, true);
  assert.equal(r.book.a.firstDay, 3);
  r = recordCatch(r.book, 'a', 22);
  assert.equal(r.isRecord, false);
  assert.equal(r.book.a.recordCm, 25);
  assert.equal(r.book.a.count, 3);
  const b2 = recordCatch(r.book, 'b', 3).book;
  assert.equal(distinctCount(b2), 2);
  assert.equal(totalCatches(b2), 4);
  assert.ok(!('firstDay' in b2.b), 'no firstDay key when the day is unknown');
});

test('collection: count only counts known species; completeness; the book is not mutated', () => {
  const sp = [{ id: 'a' }, { id: 'b' }];
  const b0 = emptyBook();
  const b1 = recordCatch(b0, 'a', 10).book;
  assert.deepEqual(b0, {});
  assert.equal(distinctCount({ ...b1, ghost: { count: 1, recordCm: 1 } }, sp), 1);
  assert.equal(isComplete(b1, sp), false);
  assert.equal(isComplete(recordCatch(b1, 'b', 5).book, sp), true);
  assert.equal(isComplete({}, []), false);
  assert.deepEqual(resetPity({ a: 3, b: 1 }, 'a'), { b: 1 });
  assert.deepEqual(resetPity({ b: 1 }, 'a'), { b: 1 });
});

test('clock: a 480 s day cut into dawn 60, day 180, dusk 60, night 180', () => {
  assert.equal(config.dayLengthS, 480);
  const len = Object.fromEntries(config.phases.map((p) => [p.id, (p.to - p.from) * config.dayLengthS]));
  assert.deepEqual(len, { dawn: 60, day: 180, dusk: 60, night: 180 });
  assert.equal(phaseAt(0, config), 'dawn');
  assert.equal(phaseAt(0.1249, config), 'dawn');
  assert.equal(phaseAt(0.125, config), 'day');
  assert.equal(phaseAt(0.4999, config), 'day');
  assert.equal(phaseAt(0.5, config), 'dusk');
  assert.equal(phaseAt(0.625, config), 'night');
  assert.equal(phaseAt(0.9999, config), 'night');
});

test('clock: the session starts at dusk, runs through the day and wraps; the day number grows', () => {
  let c = createClock(config);
  assert.equal(currentPhase(c, config), 'dusk');
  assert.equal(dayNumber(c, config), 1);
  const seen = [];
  const seconds = {};
  for (let s = 0; s < 480 * 2; s++) {
    c = advanceClock(c, 1);
    const p = currentPhase(c, config);
    seen.push(p);
    seconds[p] = (seconds[p] || 0) + 1;
  }
  assert.deepEqual(seconds, { dusk: 120, night: 360, dawn: 120, day: 360 });
  assert.equal(seen[58], 'dusk');
  assert.equal(seen[59], 'night'); // after 60 s of dusk the clock reads night
  assert.ok(dayFrac(c, config) >= 0 && dayFrac(c, config) < 1);
  assert.equal(dayNumber(c, config), 3);
});

test('clock: 1/60 s steps give the same phase boundary as the data (dusk = 60 s +- 1 step)', () => {
  let c = createClock(config);
  let steps = 0;
  while (currentPhase(c, config) === 'dusk') {
    c = advanceClock(c, 1 / 60);
    steps++;
  }
  assert.ok(Math.abs(steps - 60 * 60) <= 1, 'dusk lasted ' + steps + ' steps');
});

test('clock: clockAtPhase puts the clock inside the asked phase', () => {
  for (const p of config.phases) assert.equal(currentPhase(clockAtPhase(config, p.id), config), p.id);
});

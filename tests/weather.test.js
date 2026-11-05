import test from 'node:test';
import assert from 'node:assert/strict';
import weatherList from '../src/data/weather.js';
import config from '../src/data/config.js';
import { fork } from '../src/core/rng.js';
import { createClock, advanceClock, currentPhase } from '../src/core/clock.js';
import { createWeather, weatherNamed, advanceWeather } from '../src/core/weather.js';
import { validateWeather } from '../src/core/validate.js';
import { pairShares } from './sim.js';

const byId = (id) => weatherList.find((w) => w.id === id);

test('weather data: valid, four weathers with fr + en names', () => {
  assert.deepEqual(validateWeather(weatherList), []);
  assert.deepEqual(weatherList.map((w) => w.id), ['clear', 'cloudy', 'rain', 'mist']);
});

test('weather data: faulty cases are detected', () => {
  const ok = weatherList[0];
  assert.ok(validateWeather([ok, ok]).some((e) => e.includes('en double')));
  assert.ok(validateWeather([{ ...ok, name: { fr: 'x' } }]).length > 0);
  assert.ok(validateWeather([{ ...ok, durationS: [200, 100] }]).length > 0);
  assert.ok(validateWeather([{ ...ok, next: { nowhere: 3 } }]).length > 0);
  assert.ok(validateWeather([{ ...ok, phaseBias: { dawn: 1 } }]).length > 0);
});

function run(seed, seconds, step = 1) {
  const rng = fork(seed, 'weather#0');
  let clock = createClock(config);
  let w = createWeather(weatherList, rng);
  const log = [];
  let lastId = w.id;
  let lastAt = 0;
  for (let t = 0; t < seconds; t += step) {
    const ph = currentPhase(clock, config);
    const r = advanceWeather(w, step, weatherList, ph, rng);
    w = r.state;
    clock = advanceClock(clock, step);
    if (r.changed) {
      log.push({ at: t, from: lastId, to: r.changed, lengthS: t - lastAt, phase: ph });
      lastId = r.changed;
      lastAt = t;
    }
  }
  return { log, w };
}

test('weather: deterministic for a seed, different for another', () => {
  const a = JSON.stringify(run(5, 4000).log);
  assert.equal(a, JSON.stringify(run(5, 4000).log));
  assert.notEqual(a, JSON.stringify(run(6, 4000).log));
});

test('weather: a change always goes to ANOTHER weather, and each period lasts within its durationS (+- 1 step)', () => {
  const { log } = run(9, 200000);
  assert.ok(log.length > 500);
  for (const e of log.slice(1)) {
    assert.notEqual(e.from, e.to);
    const [lo, hi] = byId(e.from).durationS;
    assert.ok(e.lengthS >= lo - 1.01 && e.lengthS <= hi + 1.01, `${e.from} lasted ${e.lengthS}`);
  }
});

test('weather: never goes where next is 0', () => {
  const { log } = run(10, 300000);
  for (const e of log) assert.ok(byId(e.from).next[e.to] > 0, `${e.from} -> ${e.to}`);
});

test('weather: shares of time over 3000 days near the 40 / 25 / 15 / 20 target (clear / cloudy / rain / mist), within 4.5 points', () => {
  const sh = pairShares(3000, 42);
  const tw = {};
  for (const [k, v] of Object.entries(sh)) tw[k.split('|')[1]] = (tw[k.split('|')[1]] || 0) + v;
  const target = { clear: 0.4, cloudy: 0.25, rain: 0.15, mist: 0.2 };
  for (const id of Object.keys(target)) assert.ok(Math.abs(tw[id] - target[id]) < 0.045, `${id}: ${(tw[id] * 100).toFixed(1)} %`);
});

test('weather: mist arrives mostly at dawn (phaseBias), rarely by day', () => {
  const { log } = run(3, 400000);
  const n = (ph) => log.filter((e) => e.to === 'mist' && e.phase === ph).length;
  const dayShare = n('day') / log.filter((e) => e.phase === 'day').length;
  const dawnShare = n('dawn') / log.filter((e) => e.phase === 'dawn').length;
  assert.ok(dawnShare > dayShare * 3, `dawn ${dawnShare.toFixed(2)} vs day ${dayShare.toFixed(2)}`);
});

test('weather: 1/60 s steps respect the durations too', () => {
  const fine = run(4, 3000, 1 / 60).log;
  assert.ok(fine.length > 10);
  for (const e of fine.slice(1)) {
    const w = byId(e.from);
    assert.ok(e.lengthS >= w.durationS[0] - 0.05 && e.lengthS <= w.durationS[1] + 0.05);
  }
});

test('weather: weatherNamed starts at the asked weather with a drawn duration; unknown id -> first weather', () => {
  const rng = fork(1, 'x');
  const w = weatherNamed(weatherList, 'mist', rng);
  assert.equal(w.id, 'mist');
  assert.ok(w.leftS >= 90 && w.leftS < 210);
  assert.equal(weatherNamed(weatherList, 'nope', rng).id, 'clear');
});

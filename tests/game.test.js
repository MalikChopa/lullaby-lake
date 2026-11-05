import test from 'node:test';
import assert from 'node:assert/strict';
import { DT, data, makeGame, runUntil, stepN } from './helpers.js';
import { createGame } from '../src/core/game.js';
import { distinctCount } from '../src/core/collection.js';
import { lookFor, phaseIcon } from '../src/core/look.js';
import { parseDebug, PHASE_ALIASES, WEATHER_ALIASES } from '../src/platform/debug.js';

/** Plays one full catch (tap, wait for the bite, press, release). Returns the `caught` event. */
function oneCatch(g) {
  stepN(g, 1, { down: true });
  stepN(g, 1, { up: true });
  runUntil(g, (ev) => ev.some((e) => e.type === 'bite'));
  stepN(g, 1, { down: true });
  const r = runUntil(g, (ev) => ev.some((e) => e.type === 'caught'));
  const caught = r.events.find((e) => e.type === 'caught');
  stepN(g, 1, { down: true });
  return caught;
}

test('session: 60 catches (seed 7) with the real clock and weather - the book counts exactly the distinct species caught', () => {
  const g = makeGame({ seed: 7, start: {} });
  const seen = new Set();
  const phases = new Set();
  const weathers = new Set();
  let total = 0;
  const events = [];
  for (let i = 0; i < 60; i++) {
    stepN(g, 1, { down: true });
    stepN(g, 1, { up: true });
    const r1 = runUntil(g, (ev) => ev.some((e) => e.type === 'bite'));
    stepN(g, 1, { down: true });
    const r2 = runUntil(g, (ev) => ev.some((e) => e.type === 'caught'));
    events.push(...r1.events, ...r2.events);
    const c = r2.events.find((e) => e.type === 'caught');
    seen.add(c.speciesId);
    phases.add(g.getState().world.phase);
    weathers.add(g.getState().world.weather);
    stepN(g, 1, { down: true });
    total++;
  }
  const st = g.getState();
  assert.equal(total, 60);
  assert.equal(distinctCount(st.book), seen.size);
  assert.equal(Object.values(st.book).reduce((a, e) => a + e.count, 0), 60);
  assert.ok(seen.size >= 5 && seen.size <= data.species.length, 'distinct species ' + seen.size);
  assert.ok(events.some((e) => e.type === 'phaseChanged'), 'the clock changed phase during the session');
  assert.ok(events.some((e) => e.type === 'weatherChanged'), 'the weather changed during the session');
  for (const id of seen) assert.ok(st.book[id].recordCm >= data.species.find((s) => s.id === id).sizeCm.min);
});

test('session: every catch is a species eligible in the phase and weather of the bite (core wiring)', () => {
  const g = makeGame({ seed: 4, start: {} });
  for (let i = 0; i < 40; i++) {
    stepN(g, 1, { down: true });
    stepN(g, 1, { up: true });
    runUntil(g, (ev) => ev.some((e) => e.type === 'bite'));
    const w = g.getState().world;
    const id = g.getState().fishing.fish.id;
    const sp = data.species.find((s) => s.id === id);
    assert.ok(sp.phases.includes(w.phase), `${id} cannot bite at ${w.phase}`);
    assert.ok((sp.weather[w.weather] ?? 1) > 0, `${id} cannot bite in ${w.weather}`);
    stepN(g, 1, { down: true });
    runUntil(g, (ev) => ev.some((e) => e.type === 'caught'));
    stepN(g, 1, { down: true });
  }
});

test('clock and weather: paused (journal, settings, photo) = frozen, the 8 s delay included; start phase and weather can be set and frozen', () => {
  const g = createGame({ data, seed: 3, start: { phase: 'dawn', weather: 'mist', freezeClock: false, freezeWeather: false } });
  assert.equal(g.getState().world.phase, 'dawn');
  assert.equal(g.getState().world.weather, 'mist');
  stepN(g, 60);
  const a = g.getState().world.dayFrac;
  g.setPaused(true);
  stepN(g, 600);
  assert.equal(g.getState().world.dayFrac, a);
  g.setPaused(false);
  stepN(g, 60);
  assert.ok(g.getState().world.dayFrac > a);
  const f = createGame({ data, seed: 3, start: { phase: 'night', weather: 'rain', freezeClock: true, freezeWeather: true } });
  stepN(f, 60 * 3000);
  assert.equal(f.getState().world.phase, 'night');
  assert.equal(f.getState().world.weather, 'rain');
});

test('game: phaseChanged and weatherChanged events carry the new value; phases follow dusk -> night -> dawn -> day', () => {
  const g = createGame({ data, seed: 8, start: {} });
  const order = [];
  for (let i = 0; i < 60 * 480 * 2; i++) {
    for (const e of g.step(DT)) if (e.type === 'phaseChanged') order.push(e.phase);
  }
  assert.deepEqual(order.slice(0, 6), ['night', 'dawn', 'day', 'dusk', 'night', 'dawn']);
});

test('game: the same (seed, session) gives the same world, a different session another one', () => {
  const run = (sessions) => {
    const g = createGame({ data, seed: 99, sessions, start: {} });
    const log = [];
    for (let i = 0; i < 60 * 3000; i++) for (const e of g.step(DT)) if (e.type === 'weatherChanged') log.push(e.weather + '@' + i);
    return log.join(',');
  };
  assert.equal(run(0), run(0));
  assert.notEqual(run(0), run(1));
});

test('look: hard cut presets - dawn fog, day day, dusk dusk, night night, rain rain, mist fog, cloudy keeps the phase', () => {
  assert.equal(lookFor('dawn', 'clear'), 'fog');
  assert.equal(lookFor('day', 'clear'), 'day');
  assert.equal(lookFor('dusk', 'clear'), 'dusk');
  assert.equal(lookFor('night', 'clear'), 'night');
  assert.equal(lookFor('day', 'rain'), 'rain');
  assert.equal(lookFor('night', 'rain'), 'rain');
  assert.equal(lookFor('day', 'mist'), 'fog');
  assert.equal(lookFor('dusk', 'cloudy'), 'dusk');
  assert.equal(lookFor('night', 'cloudy'), 'night');
  assert.equal(lookFor('x', 'y'), 'dusk');
  assert.equal(phaseIcon('dawn'), 'sun');
  assert.equal(phaseIcon('day'), 'sun');
  assert.equal(phaseIcon('dusk'), 'moon');
  assert.equal(phaseIcon('night'), 'moon');
});

test('debug params: ?phase= and ?weather= (French and English names) work without ?debug=1; ?clock=run is the default', () => {
  const d = parseDebug('?phase=nuit&weather=pluie');
  assert.equal(d.phase, 'night');
  assert.equal(d.weather, 'rain');
  assert.equal(d.debug, false);
  assert.equal(d.clock, 'default');
  assert.equal(parseDebug('?phase=aube&weather=brume&clock=run').clock, 'run');
  assert.equal(parseDebug('?phase=crepuscule').phase, 'dusk');
  assert.equal(parseDebug('?phase=jour&weather=nuages').weather, 'cloudy');
  assert.equal(parseDebug('?weather=soleil').weather, 'clear');
  assert.equal(parseDebug('?phase=dusk').phase, 'dusk');
  assert.equal(parseDebug('?phase=banana').phase, null);
  assert.equal(parseDebug('?weather=hail').weather, null);
  assert.equal(parseDebug('').phase, null);
  assert.deepEqual(Object.values(PHASE_ALIASES).filter((v, i, a) => a.indexOf(v) === i).sort(), ['dawn', 'day', 'dusk', 'night']);
  assert.deepEqual(Object.values(WEATHER_ALIASES).filter((v, i, a) => a.indexOf(v) === i).sort(), ['clear', 'cloudy', 'mist', 'rain']);
});

test('the same fish returns after 8 s: no new draw, caught as the same species with the same size (game level)', () => {
  const g = makeGame({ seed: 31 });
  stepN(g, 1, { down: true });
  stepN(g, 1, { up: true });
  runUntil(g, (ev) => ev.some((e) => e.type === 'bite'));
  const fish = { ...g.getState().fishing.fish };
  runUntil(g, (ev) => ev.some((e) => e.type === 'bite' && e.returning));
  assert.deepEqual(g.getState().fishing.fish, fish);
  stepN(g, 1, { down: true });
  const r = runUntil(g, (ev) => ev.some((e) => e.type === 'caught'));
  const c = r.events.find((e) => e.type === 'caught');
  assert.equal(c.speciesId, fish.id);
  assert.equal(c.sizeCm, fish.sizeCm);
  void oneCatch;
});

import test from 'node:test';
import assert from 'node:assert/strict';
import species from '../src/data/species.js';
import sprites from '../src/data/fishSprites.js';
import weatherList from '../src/data/weather.js';
import config from '../src/data/config.js';
import { mulberry32 } from '../src/core/rng.js';
import { isEligible, weightOf, drawFish, pityChance } from '../src/core/fishDraw.js';
import { validateSpecies } from '../src/core/validate.js';
import { createGame } from '../src/core/game.js';
import { PHASES_ALL, WEATHER_ALL, shares, noPity } from './fixtures-draw.js';
import { simulateMany, range, pairShares } from './sim.js';
import { DT, data, makeGame, runUntil, stepN } from './helpers.js';

const LONG = config.paceSets.long;

test('fishDraw: eligibility follows phase and weather (0 = never, absent = 1)', () => {
  const sp = { phases: ['dusk'], weather: { rain: 0, mist: 2 }, rarity: 1 };
  assert.equal(isEligible(sp, { phase: 'dusk', weather: 'clear' }), true);
  assert.equal(isEligible(sp, { phase: 'dusk', weather: 'rain' }), false);
  assert.equal(isEligible(sp, { phase: 'day', weather: 'clear' }), false);
});

test('fishDraw: no candidate = null and no rng consumed; candidates = exactly one rng value (guarantee included)', () => {
  let n = 0;
  const rng = () => {
    n++;
    return 0.5;
  };
  assert.equal(drawFish([{ id: 'a', rarity: 1, phases: ['day'] }], { phase: 'night', weather: 'clear' }, LONG, rng), null);
  assert.equal(n, 0);
  assert.ok(drawFish(species, { phase: 'dusk', weather: 'clear' }, LONG, rng));
  assert.equal(n, 1);
  drawFish(species, { phase: 'dusk', weather: 'clear' }, LONG, rng, { pity: { berceuse: 75 } });
  assert.equal(n, 2);
});

test('fishDraw: every (phase, weather) has at least one eligible species', () => {
  for (const phase of PHASES_ALL) for (const weather of WEATHER_ALL) assert.ok(species.some((s) => isEligible(s, { phase, weather })), phase + ' ' + weather);
});

test('fishDraw: weight = rarity weight x weather multiplier', () => {
  const rw = LONG.rarityWeights;
  const tanche = species.find((s) => s.id === 'tanche-mousse');
  assert.equal(weightOf(tanche, { phase: 'night', weather: 'rain' }, rw), 100 * 1.5);
  assert.equal(weightOf(tanche, { phase: 'night', weather: 'cloudy' }, rw), 100); // absent key = 1
  const silure = species.find((s) => s.id === 'silure-sage');
  assert.equal(weightOf(silure, { phase: 'night', weather: 'rain' }, rw), 8 * 4);
});

test('fishDraw: luck protection = min(cap, 1 + step x missed) for a missing species, 1 once caught; inputs are not modified', () => {
  const sp = species[0];
  const set = config.paceSets.short; // step 0.15, cap 10
  assert.equal(pityChance(sp, {}, {}, set), 1);
  assert.ok(Math.abs(pityChance(sp, { [sp.id]: 10 }, {}, set) - 2.5) < 1e-9);
  assert.equal(pityChance(sp, { [sp.id]: 1000 }, {}, set), 10);
  assert.equal(pityChance(sp, { [sp.id]: 10 }, { [sp.id]: { count: 1 } }, set), 1);
  assert.equal(pityChance(sp, { [sp.id]: 10 }, {}, LONG), 1); // long: no progressive protection
  const pity = Object.freeze({ a: 1 });
  const book = Object.freeze({});
  drawFish(species, { phase: 'dusk', weather: 'clear' }, set, mulberry32(1), { pity, book });
});

test('fishDraw: missed counters grow by one for each missing eligible species that was not drawn, and only for them', () => {
  const ctx = { phase: 'dusk', weather: 'clear' };
  const eligible = species.filter((s) => isEligible(s, ctx)).map((s) => s.id);
  const book = { 'carpe-lune': { count: 1, recordCm: 20 } };
  const r = drawFish(species, ctx, LONG, mulberry32(5), { book, pity: {} });
  for (const id of eligible) {
    if (id === r.species.id || id === 'carpe-lune') assert.equal(r.pity[id], undefined, id);
    else assert.equal(r.pity[id], 1, id);
  }
  for (const s of species) if (!eligible.includes(s.id)) assert.equal(r.pity[s.id], undefined);
});

test('fishDraw: guarantee - a missing eligible species with missed >= guarantee bites at the next eligible bite (first in file order)', () => {
  const ctx = { phase: 'dusk', weather: 'mist' };
  for (let seed = 1; seed <= 40; seed++) {
    const r = drawFish(species, ctx, LONG, mulberry32(seed), { book: {}, pity: { berceuse: 75 } });
    assert.equal(r.species.id, 'berceuse');
    assert.equal(r.guaranteed, true);
  }
  // below the threshold: not forced
  assert.ok(Array.from({ length: 40 }, (_, i) => drawFish(species, ctx, LONG, mulberry32(i + 1), { pity: { berceuse: 74 } }).species.id).some((id) => id !== 'berceuse'));
  // two guaranteed: the first in file order wins
  const two = drawFish(species, { phase: 'dusk', weather: 'mist' }, LONG, mulberry32(3), { pity: { berceuse: 80, 'brochet-ombre': 80, 'carpe-lune': 80 } });
  assert.equal(two.species.id, 'carpe-lune');
  // already caught = no guarantee
  const owned = drawFish(species, ctx, LONG, mulberry32(3), { book: { berceuse: { count: 1, recordCm: 1 } }, pity: { berceuse: 99 } });
  assert.equal(owned.guaranteed, false);
  // not eligible now = no guarantee
  const away = drawFish(species, { phase: 'day', weather: 'clear' }, LONG, mulberry32(3), { pity: { berceuse: 99 } });
  assert.notEqual(away.species.id, 'berceuse');
});

test('fishDraw: same inputs and same rng = same draw', () => {
  const a = drawFish(species, { phase: 'night', weather: 'rain' }, LONG, mulberry32(9), { pity: { 'silure-sage': 3 } });
  const b = drawFish(species, { phase: 'night', weather: 'rain' }, LONG, mulberry32(9), { pity: { 'silure-sage': 3 } });
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------- the 24 species can be caught

const SHARES = pairShares(1000, 42); // time share of each phase|weather pair, 1 000 simulated days

test('catchable (structural): each species has a phase and a weather of weight > 0 that the weather machine spends at least 2 % of the time in', () => {
  for (const s of species) {
    let best = 0;
    for (const phase of s.phases) for (const weather of WEATHER_ALL) if (isEligible(s, { phase, weather })) best = Math.max(best, SHARES[phase + '|' + weather] || 0);
    assert.ok(best >= 0.02, `${s.id}: best pair ${(best * 100).toFixed(2)} % of the time`);
  }
});

test('catchable (share): each species gets >= 0.5 % of all bites and >= 1 % of the bites inside its own phases (formula, no protection)', () => {
  const sh = shares(species, SHARES, LONG.rarityWeights);
  for (const s of species) {
    assert.ok(sh.total[s.id] >= 0.005, `${s.id}: ${(sh.total[s.id] * 100).toFixed(2)} % of all bites`);
    assert.ok(sh.inOwnPhases[s.id] >= 0.01, `${s.id}: ${(sh.inOwnPhases[s.id] * 100).toFixed(2)} % in its phases`);
  }
  // the weakest species of the annex (24 species since J6, legendary weight 12): La Berceuse about 0.57 % of all bites and 2.3 % in
  // its moments, La Comete 0.69 % / 1.8 %, the sturgeon 0.55 %, the noon sunfish 0.57 % (it was 0.7 % / 2.7 % with 12 species)
  assert.ok(sh.total.berceuse > 0.005 && sh.total.berceuse < 0.0065, 'berceuse total ' + sh.total.berceuse);
  assert.ok(sh.inOwnPhases.berceuse > 0.021 && sh.inOwnPhases.berceuse < 0.025, 'berceuse in its moments ' + sh.inOwnPhases.berceuse);
  assert.ok(sh.total.comete > 0.006 && sh.total.comete < 0.0078, 'comete total ' + sh.total.comete);
  assert.ok(Math.min(...Object.values(sh.total)) >= 0.005, 'no species under 0.5 % of the bites');
  // a species with weight 0.2 everywhere would fail the same test
  const weak = [...species, { id: 'weak', rarity: 1, phases: ['dawn', 'day', 'dusk', 'night'], weather: { clear: 0.002, cloudy: 0.002, rain: 0.002, mist: 0.002 } }];
  const shw = shares(weak, SHARES, LONG.rarityWeights);
  assert.ok(shw.total.weak < 0.005);
});

test('catchable (statistics): for each of the 16 (phase, weather) pairs, 200 000 draws match the formula within 4 sigma (protection off)', () => {
  const rng = mulberry32(2024);
  const N = 200000;
  const set = noPity(LONG.rarityWeights);
  for (const phase of PHASES_ALL) {
    for (const weather of WEATHER_ALL) {
      const ctx = { phase, weather };
      const cands = species.filter((s) => isEligible(s, ctx));
      const w = cands.map((s) => weightOf(s, ctx, LONG.rarityWeights));
      const total = w.reduce((a, b) => a + b, 0);
      const counts = new Map(cands.map((s) => [s.id, 0]));
      for (let i = 0; i < N; i++) {
        const id = drawFish(species, ctx, set, rng, { book: {}, pity: {} }).species.id;
        counts.set(id, counts.get(id) + 1);
      }
      cands.forEach((s, i) => {
        const p = w[i] / total;
        const sigma = Math.sqrt((p * (1 - p)) / N);
        const obs = counts.get(s.id) / N;
        assert.ok(Math.abs(obs - p) < 4 * sigma + 1e-9, `${phase}/${weather} ${s.id}: observed ${obs.toFixed(4)} vs ${p.toFixed(4)}`);
      });
    }
  }
});

test('catchable (annex controls, 24 species): clear night -> Starry Stickleback near 30 % (was 32 %); rainy night -> Wise Catfish near 8 % (9 %); misty dawn -> Mist Trout near 25 % (44 %)', () => {
  const frac = (phase, weather, id) => {
    const ctx = { phase, weather };
    const c = species.filter((s) => isEligible(s, ctx));
    const total = c.reduce((a, s) => a + weightOf(s, ctx, LONG.rarityWeights), 0);
    return weightOf(species.find((s) => s.id === id), ctx, LONG.rarityWeights) / total;
  };
  assert.ok(Math.abs(frac('night', 'clear', 'epinoche-etoilee') - 0.30) < 0.04);
  assert.ok(Math.abs(frac('night', 'rain', 'silure-sage') - 0.084) < 0.02);
  assert.ok(Math.abs(frac('dawn', 'mist', 'truite-brume') - 0.25) < 0.04);
});

// ---------------------------------------------------------------- collection pace (discriminating)

const SEEDS = range(1, 500);
const REF = simulateMany(SEEDS, { perMin: 2, miss: 0 });

// J6 (24 species): target ~150 min (+-15 %: 127.5..172.5), measured 140.7 min median / 160.9 p90 / 213 p99 / 324.6 max (the first 12 species: 90.6 / 144.8).
test('pace: 500 virtual players at 2 catches/min, active set `long` - median inside 127.5..172.5 min (150 +-15 %), p90 <= 177 (and < 240), everybody finishes within 6 h', (t) => {
  t.diagnostic(`median ${REF.median.toFixed(1)} min, p90 ${REF.p90.toFixed(1)} min, p99 ${REF.p99.toFixed(1)}, max ${REF.max.toFixed(1)}, catches median ${REF.catchesMedian} / p90 ${REF.catchesP90}`);
  assert.equal(config.pace, 'long');
  assert.ok(REF.median >= 150 * 0.85 && REF.median <= 150 * 1.15, 'median ' + REF.median);
  assert.ok(REF.p90 <= 160.9 * 1.1 && REF.p90 < 240, 'p90 ' + REF.p90);
  assert.equal(REF.unfinished, 0);
  assert.ok(REF.max < 360);
});

test('pace: the test is discriminating - the other sets give medians outside the `long` window, and the windows of the three sets do not overlap', (t) => {
  const short = simulateMany(SEEDS, { pace: 'short' });
  const medium = simulateMany(SEEDS, { pace: 'medium' });
  t.diagnostic(`short median ${short.median.toFixed(1)}, medium median ${medium.median.toFixed(1)}`);
  assert.ok(short.median < 127.5 && medium.median < 127.5, 'short / medium would fail the long window');
  assert.ok(short.median >= 57.1 * 0.85 && short.median <= 57.1 * 1.15);
  assert.ok(medium.median >= 96.6 * 0.85 && medium.median <= 96.6 * 1.15);
  assert.ok(short.median * 1.15 < medium.median * 0.85 && medium.median * 1.15 < 127.5, 'the three windows do not overlap');
});

test('pace: second pass with departures (a distracted player lets the fish leave at 15 % of the bites) - median <= reference x 1.15, everybody finishes, same number of catches', (t) => {
  const away = simulateMany(SEEDS, { perMin: 2, miss: 0.15 });
  const mean = (r) => r.runs.reduce((a, x) => a + x.catches, 0) / r.runs.length;
  t.diagnostic(`median ${away.median.toFixed(1)} (reference ${REF.median.toFixed(1)}), p90 ${away.p90.toFixed(1)}, mean catches ${mean(away).toFixed(1)} vs ${mean(REF).toFixed(1)}`);
  assert.ok(away.median <= REF.median * 1.15, 'median ' + away.median);
  assert.equal(away.unfinished, 0);
  assert.ok(away.max < 360);
  assert.ok(Math.abs(mean(away) - mean(REF)) / mean(REF) <= 0.05, 'catches ' + mean(away) + ' vs ' + mean(REF));
});

test('pace: a fish that leaves comes back as the SAME fish without a new draw (game level): missed counters and rng untouched', () => {
  const g = makeGame({ seed: 21 });
  stepN(g, 1, { down: true });
  stepN(g, 1, { up: true });
  const b = runUntil(g, (ev) => ev.some((e) => e.type === 'bite'));
  const bite = b.events.find((e) => e.type === 'bite');
  const pityAtBite = JSON.stringify(g.getState().pity);
  const fishAtBite = JSON.stringify(g.getState().fishing.fish);
  const r = runUntil(g, (ev) => ev.some((e) => e.type === 'bite' && e.returning));
  assert.ok(r.events.some((e) => e.type === 'escaped'));
  assert.equal(r.events.find((e) => e.type === 'bite' && e.returning).speciesId, bite.speciesId);
  assert.equal(JSON.stringify(g.getState().pity), pityAtBite);
  assert.equal(JSON.stringify(g.getState().fishing.fish), fishAtBite);
});

test('pace: catching a species resets its missed counter and records it in the book (game level, 40 catches, seed 5)', () => {
  const g = makeGame({ seed: 5, start: { phase: 'dusk', weather: 'mist', freezeClock: true, freezeWeather: true } });
  let caught = 0;
  while (caught < 40) {
    stepN(g, 1, { down: true });
    stepN(g, 1, { up: true });
    runUntil(g, (ev) => ev.some((e) => e.type === 'bite'));
    stepN(g, 1, { down: true });
    const r = runUntil(g, (ev) => ev.some((e) => e.type === 'caught'));
    const c = r.events.find((e) => e.type === 'caught');
    assert.equal(g.getState().pity[c.speciesId], undefined);
    stepN(g, 1, { down: true });
    caught++;
  }
  const st = g.getState();
  assert.ok(Object.keys(st.book).length >= 3);
  assert.equal(Object.values(st.book).reduce((a, e) => a + e.count, 0), 40);
});

// ---------------------------------------------------------------- extension without touching core/

test('extension: a 25th species added in the test passes validation, is drawn, caught and shown in the book - core/ untouched', () => {
  const extra = {
    id: 'poisson-test', name: { fr: 'Poisson test', en: 'Test fish' }, rarity: 2, phases: ['dusk'], seasons: [], weather: { clear: 50 },
    sizeCm: { min: 5, mode: 6, max: 7 }, desc: { fr: 'Un poisson ajouté par un test.', en: 'A fish added by a test.' },
    hint: { fr: 'Au crépuscule.', en: 'At dusk.' }, sprite: 'poisson-test',
  };
  const list = [...species, extra];
  const spr = { ...sprites, 'poisson-test': sprites['carpe-lune'] };
  assert.deepEqual(validateSpecies(list, spr, { weatherIds: weatherList.map((w) => w.id), rarityWeights: LONG.rarityWeights }), []);
  const g = createGame({ data: { config, species: list, weather: weatherList }, seed: 3, start: { phase: 'dusk', weather: 'clear', freezeClock: true, freezeWeather: true } });
  let seen = false;
  for (let k = 0; k < 40 && !seen; k++) {
    g.step(DT, { down: true });
    g.step(DT, { up: true });
    const b = runUntil(g, (ev) => ev.some((e) => e.type === 'bite'));
    g.step(DT, { down: true });
    const r = runUntil(g, (ev) => ev.some((e) => e.type === 'caught'));
    const c = r.events.find((e) => e.type === 'caught');
    if (c.speciesId === 'poisson-test') {
      seen = true;
      assert.equal(c.isNew, true);
      assert.ok(g.getState().book['poisson-test']);
    }
    g.step(DT, { down: true });
    void b;
  }
  assert.ok(seen, 'the extra species was drawn');
  // a species that can never bite is refused
  const never = { ...extra, id: 'jamais', sprite: 'poisson-test', weather: { clear: 0, cloudy: 0, rain: 0, mist: 0 } };
  assert.ok(validateSpecies([never], spr, { weatherIds: weatherList.map((w) => w.id) }).some((e) => e.includes('atteignable')));
  void data;
});

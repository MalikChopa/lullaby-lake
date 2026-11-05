// Virtual players for the pace and share tests (not a test file). Uses only the pure core: clock, weather, fishDraw, collection.
import config from '../src/data/config.js';
import species from '../src/data/species.js';
import weatherList from '../src/data/weather.js';
import { fork, between } from '../src/core/rng.js';
import { createClock, advanceClock, currentPhase, clockAtPhase } from '../src/core/clock.js';
import { createWeather, advanceWeather } from '../src/core/weather.js';
import { drawFish } from '../src/core/fishDraw.js';
import { emptyBook, recordCatch, resetPity, distinctCount } from '../src/core/collection.js';

export const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

/**
 * One virtual player until the book is complete.
 * Model (ARCHITECTURE section 6): the game waits [2;4] s then [4;12] s; then the player spends U[0.4;1.6] x mean seconds outside
 * the wait (cast, reel, read the card); mean = 60 / catchesPerMin - 8. With probability `miss` the fish leaves after holdS and
 * comes back after U[returnWaitS] s (same fish, no new draw).
 * @returns {{minutes:number, catches:number, finished:boolean, order:string[]}}
 */
export function simulatePlayer(seed, { perMin = 2, miss = 0, pace = config.pace, data = { species, weatherList, config }, maxS = 6 * 3600, startPhase } = {}) {
  const cfg = data.config;
  const paceSet = cfg.paceSets[pace];
  const rngPlayer = fork(seed, 'player');
  const rngFish = fork(seed, 'fish#0');
  const rngWeather = fork(seed, 'weather#0');
  const rngMiss = fork(seed, 'miss');
  let clock = startPhase ? clockAtPhase(cfg, startPhase) : createClock(cfg);
  let weather = createWeather(data.weatherList, rngWeather);
  let book = emptyBook();
  let pity = {};
  let t = 0;
  let catches = 0;
  let first = true;
  const offMean = 60 / perMin - 8;
  const order = [];
  const advance = (dt) => {
    let left = dt;
    while (left > 0) {
      const d = Math.min(1, left);
      clock = advanceClock(clock, d);
      weather = advanceWeather(weather, d, data.weatherList, currentPhase(clock, cfg), rngWeather).state;
      left -= d;
    }
    t += dt;
  };
  while (t < maxS) {
    advance(between(rngPlayer, first ? cfg.bite.firstWaitS : cfg.bite.waitS));
    first = false;
    const drawn = drawFish(data.species, { phase: currentPhase(clock, cfg), weather: weather.id }, paceSet, rngFish, { book, pity });
    if (!drawn) continue;
    pity = drawn.pity;
    if (miss > 0 && rngMiss() < miss) advance(cfg.bite.holdS + between(rngPlayer, cfg.bite.returnWaitS));
    advance(offMean * (0.4 + 1.2 * rngPlayer()));
    book = recordCatch(book, drawn.species.id, 1).book;
    pity = resetPity(pity, drawn.species.id);
    catches++;
    order.push(drawn.species.id);
    if (distinctCount(book, data.species) === data.species.length) return { minutes: t / 60, catches, finished: true, order };
  }
  return { minutes: t / 60, catches, finished: false, order };
}

export function simulateMany(seeds, opts) {
  const runs = seeds.map((s) => simulatePlayer(s, opts));
  const mins = runs.map((r) => r.minutes).sort((a, b) => a - b);
  const catches = runs.map((r) => r.catches).sort((a, b) => a - b);
  return {
    runs,
    median: quantile(mins, 0.5),
    p90: quantile(mins, 0.9),
    p99: quantile(mins, 0.99),
    max: mins[mins.length - 1],
    unfinished: runs.filter((r) => !r.finished).length,
    catchesMedian: quantile(catches, 0.5),
    catchesP90: quantile(catches, 0.9),
  };
}

export const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** Time share of each (phase, weather) pair, simulated with 1 s steps over `days` days. */
export function pairShares(days, seed = 42) {
  const rng = fork(seed, 'weather#0');
  let clock = createClock(config);
  let w = createWeather(weatherList, rng);
  const counts = {};
  const total = days * config.dayLengthS;
  for (let i = 0; i < total; i++) {
    const ph = currentPhase(clock, config);
    const k = ph + '|' + w.id;
    counts[k] = (counts[k] || 0) + 1;
    clock = advanceClock(clock, 1);
    w = advanceWeather(w, 1, weatherList, ph, rng).state;
  }
  const shares = {};
  for (const k of Object.keys(counts)) shares[k] = counts[k] / total;
  return shares;
}

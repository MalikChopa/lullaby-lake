// Helpers shared by tests (not a test file: the glob only runs *.test.js).
import config from '../src/data/config.js';
import species from '../src/data/species.js';
import weather from '../src/data/weather.js';
import { createGame } from '../src/core/game.js';
import { createFishingState, step } from '../src/core/fishing.js';
import { mulberry32 } from '../src/core/rng.js';

export const DT = 1 / 60;
export const data = { config, species, weather };

export function makeGame(opts = {}) {
  // default: dusk and clear sky, both frozen, so the fishing tests do not depend on the weather
  const start = opts.start ?? { phase: 'dusk', weather: 'clear', freezeClock: true, freezeWeather: true };
  return createGame({ data, seed: opts.seed ?? 1, sessions: opts.sessions ?? 0, settings: { fishWaitsForever: !!opts.forever }, start });
}

/** Steps the game until `pred(events, state)` is true; returns { steps, events (all), state }. */
export function runUntil(game, pred, maxSteps = 60 * 600, firstActions) {
  const all = [];
  for (let i = 1; i <= maxSteps; i++) {
    const ev = game.step(DT, i === 1 ? firstActions : undefined);
    all.push(...ev);
    if (pred(ev, game.getState())) return { steps: i, events: all, state: game.getState() };
  }
  throw new Error('condition not reached in ' + maxSteps + ' steps');
}

export function stepN(game, n, actions) {
  const all = [];
  for (let i = 0; i < n; i++) all.push(...game.step(DT, i === 0 ? actions : undefined));
  return all;
}

/** Casts with a tap and runs until the first bite. */
export function castToBite(game) {
  stepN(game, 1, { down: true });
  stepN(game, 1, { up: true });
  return runUntil(game, (ev) => ev.some((e) => e.type === 'bite'));
}

/** Raw fishing machine with counted rng functions. */
export function makeRaw(seed = 7) {
  const counts = { fish: 0, size: 0 };
  const f = mulberry32(seed);
  const s = mulberry32(seed + 1);
  const rng = {
    fish: () => {
      counts.fish++;
      return f();
    },
    size: () => {
      counts.size++;
      return s();
    },
  };
  return { counts, rng, state: createFishingState(), step };
}

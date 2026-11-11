// The bed of the cabin (brief 29), pure: where a night's sleep (or an afternoon's) lands in the clock, and the weather on waking.
// The rules of the game's own day are reused: the weather is advanced with src/core/weather.js (the same `next` and `phaseBias` tables as a normal day change, the same durations),
// the phase of each moment comes from the same phaseAt() as the running clock. Nothing else changes: no wear, no bait, no money, no story progress.
//
// How it meets the story: dialogues and fish read the phase of the moment (time-of-day conditions), and those conditions come back every day. Sleeping only moves the clock forward:
//   - it can never mark a couplet (markCouplet is only reached through a caught dream fish of the current couplet) nor skip one (couplets are found strictly in order, whatever the hour);
//   - every condition stays reachable the next day, so nothing can become impossible: after waking, a phase that was just slept over simply comes again (a day is 8 minutes);
//   - the dream fish of the current couplet still need their place and their hour: sleeping is a way to reach the hour, never a way around the place, the rod or the bait.
import { advanceWeather } from '../../../src/core/weather.js';
import { phaseAt } from '../../../src/core/clock.js';

export const WAKE = Object.freeze({ dawn: 'dawn', dusk: 'dusk' });
const AFTER_START = 0.01; // a little after the phase begins: the light has settled (about a quarter of an hour of the game)

/** The fraction of the day of a target phase. */
export function wakeFrac(config, target) {
  const p = config.phases.find((x) => x.id === target);
  if (!p) throw new Error('unknown sleep target ' + target);
  return p.from + AFTER_START;
}

/** Fractions of a day to sleep from `frac` to the next `target` (always ahead: asleep at exactly the target = the whole day). */
export function sleepSpan(frac, config, target) {
  const w = wakeFrac(config, target);
  let d = w - frac;
  if (d <= 1e-6) d += 1;
  return d;
}

/**
 * The clock and the weather after sleeping. `clock` { day, dayFrac } and `weather` { id, leftS } as game.exportWorld() gives them, `config` / `weatherList` the game's data.
 * @returns { clock: { day, dayFrac }, weather: { id, leftS }, phase, slept (seconds of game time) }
 */
export function sleepPlan({ clock, weather, config, weatherList, target, rng }) {
  const span = sleepSpan(clock.dayFrac, config, target);
  const seconds = span * config.dayLengthS;
  const n = Math.max(1, Math.ceil(seconds)); // step by step, by the same rule as the running game (a change at each moment uses the phase of that moment)
  const dt = seconds / n;
  let st = { id: weather.id, leftS: weather.leftS };
  for (let i = 0; i < n; i++) {
    const f = (clock.dayFrac + (i / n) * span) % 1;
    st = advanceWeather(st, dt, weatherList, phaseAt(f, config), rng).state;
  }
  const raw = clock.dayFrac + span;
  const dayFrac = raw % 1;
  return { clock: { day: clock.day + Math.floor(raw), dayFrac }, weather: st, phase: phaseAt(dayFrac, config), slept: seconds };
}

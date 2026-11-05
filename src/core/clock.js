// Day clock. A day lasts config.dayLengthS (480 s): dawn 60, day 180, dusk 60, night 180 (fractions in config.phases).
// State = { timeS, startFrac, dayBase? } : game seconds since the start of the session, where the day was at that moment, and the
// number of days lived before (from the save). Everything else is derived. Pure.

/** @param {object} config data/config.js */
export function createClock(config) {
  return { timeS: 0, startFrac: config.startDayFrac };
}

/** Advances by dt game seconds (returns a new state). */
export function advanceClock(state, dt) {
  return { ...state, timeS: state.timeS + dt };
}

/** Position in the day, 0 <= f < 1. */
export function dayFrac(state, config) {
  const f = (state.startFrac + state.timeS / config.dayLengthS) % 1;
  return f < 0 ? f + 1 : f;
}

/** Day number: 1 for the first day of a game, then counting on across sessions (`dayBase` comes from the save). */
export function dayNumber(state, config) {
  return (state.dayBase || 0) + 1 + Math.floor(state.startFrac + state.timeS / config.dayLengthS);
}

/** The clock of a saved game: day number `day` (>= 1), at the day fraction `frac` (0 <= f < 1). */
export function clockFromSave(day, frac) {
  return { timeS: 0, startFrac: ((frac % 1) + 1) % 1, dayBase: Math.max(0, day - 1) };
}

/** Phase id for a day fraction. */
export function phaseAt(frac, config) {
  for (const p of config.phases) if (frac >= p.from && frac < p.to) return p.id;
  return config.phases[config.phases.length - 1].id;
}

export function currentPhase(state, config) {
  return phaseAt(dayFrac(state, config), config);
}

/** A state frozen-friendly helper for tests and debug: the clock positioned in the middle of a phase. */
export function clockAtPhase(config, phaseId) {
  const p = config.phases.find((x) => x.id === phaseId);
  if (!p) return createClock(config);
  return { timeS: 0, startFrac: (p.from + p.to) / 2 };
}

/** The clock positioned at a day fraction (0 <= f < 1): debug and tests (smooth-transition checks). */
export function clockAtFrac(f) {
  return { timeS: 0, startFrac: ((f % 1) + 1) % 1 };
}

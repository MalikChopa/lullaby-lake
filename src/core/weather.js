// Weather state machine. When a period ends, the next weather is drawn with weight next[w] x phaseBias[w][phase of that
// moment]; its length is uniform in durationS. The rng is injected (stream fork(seed, 'weather#session')). Pure.
//
// State = { id, leftS }   (leftS = seconds before the next change)

import { between } from './rng.js';

function pick(list, weightOf, rng) {
  const ws = list.map(weightOf);
  const total = ws.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return list[0];
  let u = rng() * total;
  for (let i = 0; i < list.length; i++) {
    u -= ws[i];
    if (u < 0) return list[i];
  }
  return list[list.length - 1];
}

const byId = (list, id) => list.find((w) => w.id === id);

/** Weather at the very start of a game (weights `start` of the data), with its remaining time. */
export function createWeather(list, rng) {
  const w = pick(list, (x) => x.start ?? 1, rng);
  return { id: w.id, leftS: between(rng, w.durationS) };
}

/** A given weather from the start (tests, ?weather=): remaining time drawn like any other period. */
export function weatherNamed(list, id, rng) {
  const w = byId(list, id) || list[0];
  return { id: w.id, leftS: between(rng, w.durationS) };
}

/**
 * Advances by dt game seconds. `phase` = phase at the moment of any change inside this step (call with small dt: 1/60 s in the
 * game, 1 s in simulations). Returns { state, changed } ; `changed` = the new weather id when it changed in this step.
 */
export function advanceWeather(state, dt, list, phase, rng) {
  let { id, leftS } = state;
  leftS -= dt;
  let changed = null;
  let guard = 0;
  while (leftS <= 0 && guard++ < 8) {
    const cur = byId(list, id);
    const cands = list.filter((w) => (cur.next[w.id] ?? 0) > 0);
    const next = pick(cands, (w) => cur.next[w.id] * (w.phaseBias[phase] ?? 1), rng);
    id = next.id;
    leftS += between(rng, next.durationS);
    changed = id;
  }
  return { state: { id, leftS }, changed };
}

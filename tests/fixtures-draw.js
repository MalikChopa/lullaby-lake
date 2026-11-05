// Helpers of the draw tests (not a test file: the glob only runs *.test.js).
import { isEligible, weightOf } from '../src/core/fishDraw.js';

export const PHASES_ALL = ['dawn', 'day', 'dusk', 'night'];
export const WEATHER_ALL = ['clear', 'cloudy', 'rain', 'mist'];

/** A pace set with no luck protection at all (weights only). */
export const noPity = (rarityWeights) => ({ rarityWeights, pity: { step: 0, cap: 1, guarantee: Infinity } });

/**
 * Share of the bites of each species by formula, weighted by the time spent in each (phase|weather) pair.
 * total = over all bites ; inOwnPhases = over the time spent in the species' own phases (any weather).
 */
export function shares(speciesList, pairShares, rarityWeights) {
  const total = {};
  const inOwn = {};
  const timeIn = {};
  for (const [k, pi] of Object.entries(pairShares)) {
    const [phase, weather] = k.split('|');
    const ctx = { phase, weather };
    const cands = speciesList.filter((s) => isEligible(s, ctx));
    const W = cands.reduce((a, s) => a + weightOf(s, ctx, rarityWeights), 0);
    for (const s of speciesList) {
      if (s.phases.includes(phase)) timeIn[s.id] = (timeIn[s.id] || 0) + pi;
    }
    for (const s of cands) {
      const p = weightOf(s, ctx, rarityWeights) / W;
      total[s.id] = (total[s.id] || 0) + pi * p;
      inOwn[s.id] = (inOwn[s.id] || 0) + pi * p;
    }
  }
  const inOwnPhases = {};
  for (const s of speciesList) {
    total[s.id] = total[s.id] || 0;
    inOwnPhases[s.id] = (inOwn[s.id] || 0) / (timeIn[s.id] || 1);
  }
  return { total, inOwnPhases };
}

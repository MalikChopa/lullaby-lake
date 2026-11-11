// Gear in the draw (J10), pure. The 2D game's draw (src/core/fishDraw.js drawFish) is used UNCHANGED: this module only prepares the species list it is given.
//   weight(s) = rarityWeight x weatherMult(s) x pity(s)             <- the original, untouched
//   1) requirements: a species that the gear / place cannot catch is LEFT OUT of the list (so it is not "eligible": its pity counter does not move);
//   2) bait / lantern multipliers: folded into each species' weather table (weather[w] = old weather[w] x multiplier), which drawFish already multiplies.
// With the rod tier 1 and the free bait the multipliers are exactly 1: the weights of the species that stay are the old weights (tests/refonte-eco-draw).
// The result of effectiveSpecies() is cached by the caller per (rod, bait, lantern, place): the game core asks for the list every step.

import { drawFish } from '../../../src/core/fishDraw.js';
import { NEEDS, RODS, BAITS, FLOATS, LANTERN, ZONES, LATER_ITEMS } from '../data/economy.js';
import { baitOf, floatOf, rodOf } from './model.js';

export const WEATHER_IDS = Object.freeze(['clear', 'cloudy', 'rain', 'mist']);
const NIGHT_ONLY = (sp) => sp.phases.every((p) => p === 'dusk' || p === 'night');

/**
 * Why a species cannot bite here with this gear: null (it can) | 'later' | 'story' | 'zone' | 'rod' | 'bait' | 'lantern'.
 * J12-A: a dream fish (needs.requires) waits for its story flag (g.story = the story flags), may bite only at some fishing spots (needs.spots, g.spot), and may ask for the lit lantern.
 */
export function blockedBy(sp, g, needs = NEEDS, flags = LATER_ITEMS) {
  const n = needs[sp.id];
  if (!n) return null; // an unknown species (a later addition) is not restricted
  if (n.later && !(flags[n.later] && flags[n.later].available)) return 'later';
  if (n.requires && !(g.story && g.story[n.requires])) return 'story';
  if (n.spots && g.spot !== undefined && g.spot !== null && !n.spots.includes(g.spot)) return 'zone';
  if (n.spots && (g.spot === undefined || g.spot === null) && g.place) return 'zone';
  if (g.place) {
    const min = n.where[g.place];
    if (min === undefined) return 'zone';
    if (g.rod < min) return 'rod';
  } else if (g.rod < Math.min(...Object.values(n.where))) return 'rod';
  if (n.baitAny && !n.baitAny.includes(g.bait)) return 'bait';
  if (n.lantern && !g.lantern) return 'lantern';
  return null;
}

/** Multiplier of one species for the equipped bait and lantern (1 when nothing applies). */
export function weightMul(sp, g, needs = NEEDS) {
  const n = needs[sp.id];
  let m = 1;
  const bait = baitOf(g.bait);
  if (bait && n && bait.fam[n.family] !== undefined) m *= bait.fam[n.family];
  if (g.lantern && NIGHT_ONLY(sp)) m *= LANTERN.nightMul;
  if (n && n.mul) m *= n.mul; // J12-B: a species that is at home where it can bite (the great sturgeon in open water): its weight is raised (data: NEEDS[id].mul)
  return m;
}

/**
 * The species list the draw sees for a gear + place: { rod (tier), bait (id), lantern (bool), place (zone tag | null) }.
 * place null = no fishing spot known (debug, tests): every zone counts.
 */
export function effectiveSpecies(species, g, needs = NEEDS, flags = LATER_ITEMS) {
  const out = [];
  for (const sp of species) {
    if (blockedBy(sp, g, needs, flags)) continue;
    const m = weightMul(sp, g, needs);
    if (m === 1) {
      out.push(sp);
      continue;
    }
    const weather = {};
    for (const w of WEATHER_IDS) weather[w] = (sp.weather && sp.weather[w] !== undefined ? sp.weather[w] : 1) * m;
    out.push({ ...sp, weather });
  }
  return out;
}

/** drawFish on the effective list (same arguments and result as the original). */
export function drawWithGear(species, ctx, paceSet, rng, progress, g, needs, flags) {
  return drawFish(effectiveSpecies(species, g, needs, flags), ctx, paceSet, rng, progress);
}

/** The gear of an economy state, in the shape the draw functions use. */
export const gearOf = (eco, place = null, story = null, spot = null) => ({ rod: eco.equipped.rod, bait: eco.equipped.bait, lantern: !!(eco.equipped.lantern && eco.gear.lantern), place, story, spot });

/** Timing and comfort effects of the gear: multipliers of the waits, extra hold seconds, rod reach, reel time. */
export function gearMods(eco) {
  const rod = rodOf(eco.equipped.rod) || RODS[0];
  const bait = baitOf(eco.equipped.bait) || BAITS[0];
  const fl = eco.equipped.float ? floatOf(eco.equipped.float) : null;
  return { reach: rod.reach, reel: rod.reel, waitMul: bait.waitMul, holdBonusS: fl ? fl.holdS : 0, cue: fl ? fl.cue : 1 };
}

/**
 * The config the game core reads, with the gear applied: waits x waitMul, hold + holdBonusS, reel x reel. `base` is src/data/config.js (untouched).
 * Returns an object with the same fields; bite / reel are rebuilt only when the mods change (the core reads them every step).
 */
export function createGearConfig(base, getEco) {
  const cfg = { ...base };
  let key = '';
  let bite = base.bite;
  let reel = base.reel;
  const refresh = () => {
    const m = gearMods(getEco());
    const k = `${m.waitMul}|${m.holdBonusS}|${m.reel}`;
    if (k === key) return;
    key = k;
    const scale = (r) => [r[0] * m.waitMul, r[1] * m.waitMul];
    bite = { ...base.bite, firstWaitS: scale(base.bite.firstWaitS), waitS: scale(base.bite.waitS), returnWaitS: scale(base.bite.returnWaitS), holdS: base.bite.holdS + m.holdBonusS };
    reel = { ...base.reel, durationS: base.reel.durationS * m.reel };
  };
  Object.defineProperties(cfg, {
    bite: { enumerable: true, get: () => (refresh(), bite) },
    reel: { enumerable: true, get: () => (refresh(), reel) },
  });
  return cfg;
}

/**
 * The species list for the game core: a getter (call feed.arm() once the game exists) that returns the effective list of the CURRENT gear and place, rebuilt only when they change.
 * `place` is read through getPlace(). Before any place is known the list is the full list with the gear's restrictions.
 */
export function createSpeciesFeed(species, getEco, getPlace, needs = NEEDS, flags = LATER_ITEMS, getStory = () => null, getSpot = () => null) {
  let key = null;
  let list = species;
  let armed = false;
  const feed = () => {
    if (!armed) return species; // the game core builds its id -> species map from the first read: it must see all of them
    const g = gearOf(getEco(), getPlace(), getStory(), getSpot());
    const k = `${g.rod}|${g.bait}|${g.lantern}|${g.place}|${g.spot}|${g.story ? Object.keys(g.story).filter((f) => g.story[f]).join(',') : ''}`;
    if (k !== key) {
      key = k;
      list = effectiveSpecies(species, g, needs, flags);
    }
    return list;
  };
  feed.arm = () => {
    armed = true;
  };
  return feed;
}

/**
 * What the gear can still gain at a place: 'rod' (a stronger rod would let other fish bite here), 'bait' (a special bait would), or null.
 * Counts the species of this place that are blocked ONLY by the rod / the bait (not by the item that is not yet in the game).
 */
export function betterHere(species, g, needs = NEEDS, flags = LATER_ITEMS) {
  let rod = 0;
  let bait = 0;
  for (const sp of species) {
    const why = blockedBy(sp, g, needs, flags);
    if (why === 'rod') rod++;
    else if (why === 'bait') bait++;
  }
  return rod > 0 ? 'rod' : bait > 0 ? 'bait' : null;
}

/** Species that can bite somewhere with the given rod tier, a baits list and every place (a coverage helper for tests and the simulation). */
export function reachable(species, rodTier, baitIds, needs = NEEDS, flags = LATER_ITEMS) {
  const out = new Set();
  for (const sp of species) {
    for (const place of ZONES) {
      for (const bait of baitIds) {
        // J12-B: the deep zone also covers the boat's open water (spot 'open'), where the species that need the boat bite
        for (const spot of place === 'deep' ? [null, 'open'] : [null]) {
          if (!blockedBy(sp, { rod: rodTier, bait, place, spot }, needs, flags)) out.add(sp.id);
        }
      }
    }
  }
  return out;
}

export { RODS, BAITS, FLOATS };

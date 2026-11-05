// Species draw at the moment of the bite (ARCHITECTURE.md section 6). Pure, deterministic, the rng is injected.
//
// weight(s) = rarityWeights[rarity] x weather multiplier x chance(s)
//   chance(s) = 1 when the species is already in the book, else min(cap, 1 + step x missed(s))
// missed(s) = number of bites where the missing species was eligible without being drawn (the "pity" counter, never lost).
// Guarantee: a missing and eligible species with missed(s) >= pity.guarantee bites directly (first one in file order).

/** @typedef {{phase:string, weather:string}} DrawCtx */

const mult = (species, weather) => {
  const w = species.weather ? species.weather[weather] : undefined;
  return w === undefined ? 1 : w;
};

/** A species can bite when the phase matches and its weather multiplier is above 0 (absent key = 1). */
export function isEligible(species, ctx) {
  return species.phases.includes(ctx.phase) && mult(species, ctx.weather) > 0;
}

/** Weight without the luck protection (rarity x weather). */
export function weightOf(species, ctx, rarityWeights) {
  return (rarityWeights[species.rarity] || 0) * mult(species, ctx.weather);
}

/** Chance multiplier of the luck protection for one species. */
export function pityChance(species, pity, book, paceSet) {
  if (book && book[species.id]) return 1;
  const missed = (pity && pity[species.id]) || 0;
  return Math.min(paceSet.pity.cap, 1 + paceSet.pity.step * missed);
}

/**
 * Draws a species.
 * @param {object[]} speciesList  in file order
 * @param {DrawCtx} ctx
 * @param {{rarityWeights:object, pity:{step:number,cap:number,guarantee:number}}} paceSet  config.paceSets[config.pace]
 * @param {() => number} rng
 * @param {{book?:object, pity?:object}} [progress]  book = species already caught; pity = missed counters (not modified)
 * @returns {{species:object, pity:object, guaranteed:boolean}|null}  null when no species is eligible (no rng consumed);
 *   `pity` is the NEW counters object: +1 for every missing eligible species that was not drawn. The counter of the drawn
 *   species is untouched here (it is reset when the fish is really caught, see collection.resetPity).
 */
export function drawFish(speciesList, ctx, paceSet, rng, progress = {}) {
  const book = progress.book || {};
  const pity = progress.pity || {};
  const cands = speciesList.filter((s) => isEligible(s, ctx));
  if (cands.length === 0) return null;
  const u0 = rng(); // exactly one value per draw, guarantee or not (stable streams)
  let chosen = null;
  let guaranteed = false;
  for (const s of cands) {
    if (!book[s.id] && (pity[s.id] || 0) >= paceSet.pity.guarantee) {
      chosen = s;
      guaranteed = true;
      break;
    }
  }
  if (!chosen) {
    const weights = cands.map((s) => weightOf(s, ctx, paceSet.rarityWeights) * pityChance(s, pity, book, paceSet));
    const total = weights.reduce((a, b) => a + b, 0);
    let u = u0 * total;
    chosen = cands[cands.length - 1];
    for (let i = 0; i < cands.length; i++) {
      u -= weights[i];
      if (u < 0) {
        chosen = cands[i];
        break;
      }
    }
  }
  const next = { ...pity };
  for (const s of cands) if (s !== chosen && !book[s.id]) next[s.id] = (next[s.id] || 0) + 1;
  return { species: chosen, pity: next, guaranteed };
}

/** Plain draw without protection nor book: kept for statistics (weights = rarity x weather only). */
export function drawPlain(speciesList, ctx, rarityWeights, rng) {
  const r = drawFish(speciesList, ctx, { rarityWeights, pity: { step: 0, cap: 1, guarantee: Infinity } }, rng, { book: {}, pity: {} });
  return r ? r.species : null;
}

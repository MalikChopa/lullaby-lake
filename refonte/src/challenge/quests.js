// Orders and milestones (J11), pure. No deadline, no failure: an order waits until it is handed in; a milestone is given once.
//   order      { id, asker (villager id), kind: 'fish' | 'family', ... , reward: { pearls, bait? } }
//     'fish'    { speciesId, minCm }        a fish of that species at least minCm long
//     'family'  { family, n }               n fish of that family (any size)
// Orders are made from the save's seed and a counter, so a game always gets the same ones in the same order (tests are stable).

import { fork, between } from '../../../src/core/rng.js';
import { ORDERS, MILESTONES } from '../data/challenge.js';
import { NEEDS, BAITS, LATER_ITEMS } from '../data/economy.js';
import { fishPrice } from '../economy/model.js';

/** The lowest rod tier a species needs anywhere (data/economy.js NEEDS). */
export const minRod = (id) => (NEEDS[id] ? Math.min(...Object.values(NEEDS[id].where)) : 1);
/** Can this species be an order today? Not a "later" one (the boat), no special bait required, and a rod you have or one tier above (a goal). */
export function askable(sp, bestRod, needs = NEEDS, flags = LATER_ITEMS) {
  const n = needs[sp.id];
  if (sp.dream || (n && n.story)) return false; // J12-A: a dream fish is never an order (it carries a couplet)
  if (!n) return true;
  if (n.later && !(flags[n.later] && flags[n.later].available)) return false;
  if (n.baitAny) return false;
  return Math.min(...Object.values(n.where)) <= bestRod;
}
const familyOf = (id) => (NEEDS[id] ? NEEDS[id].family : null);

function pickWeighted(list, weight, r) {
  const total = list.reduce((a, x) => a + weight(x), 0);
  let x = r * total;
  for (const it of list) {
    x -= weight(it);
    if (x < 0) return it;
  }
  return list[list.length - 1];
}

/**
 * Order number `n` of a game (deterministic in seed, n, the best rod). `species` = the species table. Returns null only if nothing can be asked (never with the data).
 * The order is always valid: the asked species is catchable with `bestRod` (or the family has such species).
 */
export function genOrder(seed, n, bestRod, species, avoid = []) {
  const rng = fork(seed, 'order#' + n);
  const ok = species.filter((s) => askable(s, bestRod));
  if (ok.length === 0) return null;
  const asker = ORDERS.askers[Math.floor(rng() * ORDERS.askers.length)];
  const asFamily = rng() < ORDERS.familyShare;
  const roll = rng();
  const bait = rng() < ORDERS.baitChance;
  const mul = between(rng, ORDERS.rewardMul);
  const baitChoices = BAITS.filter((b) => b.pack !== null && b.price <= 110);
  const baitPick = baitChoices[Math.floor(rng() * baitChoices.length)];
  let order;
  if (asFamily) {
    const fams = ORDERS.families.filter((f) => ok.filter((s) => familyOf(s.id) === f).length >= 2 && !avoid.includes('f:' + f));
    const fam = fams.length ? fams[Math.floor(roll * fams.length)] : null;
    if (fam) {
      const members = ok.filter((s) => familyOf(s.id) === fam);
      const nn = Math.round(between(rng, ORDERS.familyCount));
      const each = members.reduce((a, s) => a + fishPrice(s, s.sizeCm.mode), 0) / members.length;
      order = { id: 'o' + n, asker, kind: 'family', family: fam, n: nn, reward: { pearls: Math.max(1, Math.round(nn * each * mul)) } };
    }
  }
  if (!order) {
    const pool = ok.filter((s) => !avoid.includes('s:' + s.id));
    const sp = pickWeighted(pool.length ? pool : ok, (s) => ORDERS.rarityWeight[s.rarity] || 1, roll);
    const { min, max } = sp.sizeCm;
    const frac = between(rng, ORDERS.sizeFrac);
    const minCm = Math.max(min, Math.min(max, Math.round(min + (max - min) * frac)));
    order = { id: 'o' + n, asker, kind: 'fish', speciesId: sp.id, minCm, reward: { pearls: Math.max(1, Math.round(fishPrice(sp, minCm) * mul)) } };
  }
  if (bait && baitPick) order.reward.bait = { id: baitPick.id, n: baitPick.pack };
  return order;
}

/** Keeps `ORDERS.slots` orders active (fills the missing ones). Returns a new quests object. */
export function fillOrders(quests, seed, bestRod, species) {
  if (quests.active.length >= ORDERS.slots) return quests;
  const q = { ...quests, active: [...quests.active] };
  let guard = 0;
  while (q.active.length < ORDERS.slots && guard++ < 20) {
    const avoid = q.active.map((o) => (o.kind === 'family' ? 'f:' + o.family : 's:' + o.speciesId));
    const o = genOrder(seed, q.counter, bestRod, species, avoid);
    q.counter += 1;
    if (o) q.active.push(o);
    else break;
  }
  return q;
}

/** Indices of the bucket fish that would serve the order (the cheapest ones that qualify), or null when it cannot be served now. */
export function match(order, bucket) {
  if (order.kind === 'fish') {
    let best = -1;
    bucket.forEach((f, i) => {
      if (f.id === order.speciesId && f.cm >= order.minCm && (best < 0 || f.p < bucket[best].p || (f.p === bucket[best].p && f.cm < bucket[best].cm))) best = i;
    });
    return best < 0 ? null : [best];
  }
  const idx = bucket.map((f, i) => i).filter((i) => familyOf(bucket[i].id) === order.family);
  if (idx.length < order.n) return null;
  idx.sort((a, b) => bucket[a].p - bucket[b].p || a - b);
  return idx.slice(0, order.n);
}

/** What the player has toward an order: { have, need } (for the text "1 / 3"). */
export function progressOf(order, bucket) {
  if (order.kind === 'fish') return { have: bucket.some((f) => f.id === order.speciesId && f.cm >= order.minCm) ? 1 : 0, need: 1 };
  return { have: Math.min(order.n, bucket.filter((f) => familyOf(f.id) === order.family).length), need: order.n };
}

/** Valid shape of an order (used by the save). */
export function validOrder(o) {
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || typeof o.asker !== 'string') return false;
  if (!o.reward || !Number.isInteger(o.reward.pearls) || o.reward.pearls < 0) return false;
  if (o.reward.bait && (typeof o.reward.bait.id !== 'string' || !Number.isInteger(o.reward.bait.n) || o.reward.bait.n < 1)) return false;
  if (o.kind === 'fish') return typeof o.speciesId === 'string' && Number.isInteger(o.minCm) && o.minCm > 0;
  if (o.kind === 'family') return typeof o.family === 'string' && Number.isInteger(o.n) && o.n >= 1;
  return false;
}

// ------------------------------------------------------------------------------------------------ milestones

/**
 * Milestones that are reached and not yet given. snap = { book (carnet), species (table), bestRod, earned (pearls earned in all), perfect (count), flags: {night, rain} }.
 * Idempotent: the ones in `done` are never returned again.
 */
export function reached(done, snap, list = MILESTONES) {
  const rarityOf = new Map(snap.species.map((s) => [s.id, s.rarity]));
  const have = Object.keys(snap.book);
  const out = [];
  for (const m of list) {
    if (done.includes(m.id)) continue;
    let ok = false;
    if (m.test === 'rarity') ok = have.some((id) => rarityOf.get(id) === m.n);
    else if (m.test === 'rod') ok = snap.bestRod >= m.n;
    else if (m.test === 'species') ok = have.length >= m.n;
    else if (m.test === 'flag') ok = !!(snap.flags && snap.flags[m.flag]);
    else if (m.test === 'earned') ok = snap.earned >= m.n;
    else if (m.test === 'perfect') ok = snap.perfect >= m.n;
    if (ok) out.push(m);
  }
  return out;
}

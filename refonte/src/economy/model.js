// The player's economy (J10), pure: no DOM, no clock, no random. A state is a plain JSON-able object, every operation returns a NEW state:
//   { money, bucket: [{ id, cm, p }], gear: { rods: [1], floats: [], lantern: false, baits: { id: count } },
//     equipped: { rod, float, bait, lantern }, stats: { caught, sold, earned, spent } }
// Rules (owner, 2026-11-07): nothing is ever lost, money never goes negative, a purchase is all or nothing, selling is optional, the free bait
// ('ver') always exists. The numbers come from data/economy.js.

import { RARITY_BASE, SIZE_FACTOR, RODS, BAITS, FLOATS, LANTERN, MAX_STACK } from '../data/economy.js';

export const FREE_BAIT = BAITS[0].id;
export const STATE_VERSION = 1;

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isInt = (x, min = 0) => Number.isInteger(x) && x >= min;
const byId = (list, id) => list.find((x) => x.id === id) || null;
export const rodOf = (tier) => RODS.find((r) => r.tier === tier) || null;
export const baitOf = (id) => byId(BAITS, id);
export const floatOf = (id) => byId(FLOATS, id);

/** A new game's economy: no money, rod tier 1, the free bait, an empty bucket. */
export function newEconomy() {
  return {
    money: 0,
    bucket: [],
    gear: { rods: [1], floats: [], lantern: false, baits: {} },
    equipped: { rod: 1, float: null, bait: FREE_BAIT, lantern: false },
    stats: { caught: 0, sold: 0, earned: 0, spent: 0 },
  };
}

/**
 * Price of a fish in pearls: RARITY_BASE[rarity] x (size factor) rounded, at least 1. Monotonic in rarity (the bases rise) and in size.
 * @param {{rarity:number, sizeCm:{min:number,max:number}}} sp  @param {number} cm
 */
export function fishPrice(sp, cm) {
  const base = RARITY_BASE[sp.rarity] || RARITY_BASE[1];
  const { min, max } = sp.sizeCm;
  const t = max > min ? Math.max(0, Math.min(1, (cm - min) / (max - min))) : 0.5;
  let f = SIZE_FACTOR.min + (SIZE_FACTOR.max - SIZE_FACTOR.min) * t;
  if (t >= SIZE_FACTOR.trophyShare) f *= SIZE_FACTOR.trophyMul;
  return Math.max(1, Math.round(base * f));
}

/** The catch goes to the bucket (unlimited). `sp` = species data. */
export function addCatch(eco, sp, cm) {
  return { ...eco, bucket: [...eco.bucket, { id: sp.id, cm, p: fishPrice(sp, cm) }], stats: { ...eco.stats, caught: eco.stats.caught + 1 } };
}

/** Indices of the "doubles": for each species the best fish (largest, then dearest, then first) stays, the others are doubles. */
export function doubleIndices(bucket) {
  const best = new Map();
  bucket.forEach((f, i) => {
    const b = best.get(f.id);
    if (b === undefined || f.cm > bucket[b].cm || (f.cm === bucket[b].cm && f.p > bucket[b].p)) best.set(f.id, i);
  });
  const keep = new Set(best.values());
  return bucket.map((_, i) => i).filter((i) => !keep.has(i));
}

/** Sells the fish at `indices` (any order, duplicates and out-of-range ignored). Returns { eco, sold, earned }. */
export function sellIndices(eco, indices) {
  const set = new Set(indices.filter((i) => isInt(i) && i < eco.bucket.length));
  if (set.size === 0) return { eco, sold: 0, earned: 0 };
  let earned = 0;
  const bucket = [];
  eco.bucket.forEach((f, i) => {
    if (set.has(i)) earned += f.p;
    else bucket.push(f);
  });
  return { eco: { ...eco, money: eco.money + earned, bucket, stats: { ...eco.stats, sold: eco.stats.sold + set.size, earned: eco.stats.earned + earned } }, sold: set.size, earned };
}
export const sellOne = (eco, i) => sellIndices(eco, [i]);
export const sellAll = (eco) => sellIndices(eco, eco.bucket.map((_, i) => i));
export const sellDoubles = (eco) => sellIndices(eco, doubleIndices(eco.bucket));

/** Total value of the bucket, and of its doubles. */
export const bucketValue = (eco) => eco.bucket.reduce((a, f) => a + f.p, 0);
export const doublesValue = (eco) => doubleIndices(eco.bucket).reduce((a, i) => a + eco.bucket[i].p, 0);

/** Highest rod tier owned. */
export const bestRod = (eco) => Math.max(...eco.gear.rods);

/**
 * What an item costs and whether it can be bought now. kind: 'rod' (id = tier) | 'bait' | 'float' | 'lantern'.
 * state: 'owned' (rod, float, lantern bought) | 'locked' (a rod whose previous tier is not owned yet) | 'full' (bait stack at its maximum)
 *        | 'poor' (not enough pearls) | 'ok'. `missing` = pearls missing when 'poor'.
 */
export function offer(eco, kind, id) {
  let item = null;
  let owned = false;
  let locked = false;
  let full = false;
  if (kind === 'rod') {
    item = rodOf(id);
    owned = eco.gear.rods.includes(id);
    locked = !owned && !eco.gear.rods.includes(id - 1);
  } else if (kind === 'bait') {
    item = baitOf(id);
    full = !!item && item.pack !== null && (eco.gear.baits[id] || 0) + item.pack > MAX_STACK;
    if (item && item.pack === null) owned = true; // the free bait: always there
  } else if (kind === 'float') {
    item = floatOf(id);
    owned = eco.gear.floats.includes(id);
  } else if (kind === 'lantern') {
    item = id === LANTERN.id ? LANTERN : null;
    owned = eco.gear.lantern;
  }
  if (!item) return { state: 'unknown', price: 0, missing: 0 };
  const price = item.price || 0;
  const missing = Math.max(0, price - eco.money);
  const state = owned ? 'owned' : locked ? 'locked' : full ? 'full' : missing > 0 ? 'poor' : 'ok';
  return { state, price, missing, pack: item.pack || null };
}

/** Buys an item (all or nothing; a bought rod / float / lantern is equipped at once). Returns { ok, eco, reason? } ; reason = the offer state that refused. */
export function buy(eco, kind, id) {
  const o = offer(eco, kind, id);
  if (o.state !== 'ok') return { ok: false, eco, reason: o.state };
  const next = { ...eco, money: eco.money - o.price, gear: { ...eco.gear, baits: { ...eco.gear.baits } }, equipped: { ...eco.equipped }, stats: { ...eco.stats, spent: eco.stats.spent + o.price } };
  if (kind === 'rod') {
    next.gear.rods = [...eco.gear.rods, id].sort((a, b) => a - b);
    next.equipped.rod = id;
  } else if (kind === 'bait') {
    next.gear.baits[id] = (eco.gear.baits[id] || 0) + o.pack;
    next.equipped.bait = id;
  } else if (kind === 'float') {
    next.gear.floats = [...eco.gear.floats, id];
    next.equipped.float = id;
  } else {
    next.gear.lantern = true;
    next.equipped.lantern = true;
  }
  return { ok: true, eco: next, price: o.price };
}

/** Equips something owned. kind: 'rod' (id tier) | 'bait' | 'float' (id or null = none) | 'lantern' (id true / false). Returns { ok, eco }. */
export function equip(eco, kind, id) {
  const eq = { ...eco.equipped };
  if (kind === 'rod') {
    if (!eco.gear.rods.includes(id)) return { ok: false, eco };
    eq.rod = id;
  } else if (kind === 'bait') {
    if (id !== FREE_BAIT && !(eco.gear.baits[id] > 0)) return { ok: false, eco };
    eq.bait = id;
  } else if (kind === 'float') {
    if (id !== null && !eco.gear.floats.includes(id)) return { ok: false, eco };
    eq.float = id;
  } else if (kind === 'lantern') {
    if (id && !eco.gear.lantern) return { ok: false, eco };
    eq.lantern = !!id;
  } else return { ok: false, eco };
  return { ok: true, eco: { ...eco, equipped: eq } };
}

/** One bait is used (a catch). The free bait is never used up; when a stack reaches 0 the free bait is back on the hook. */
export function useBait(eco) {
  const id = eco.equipped.bait;
  if (id === FREE_BAIT) return eco;
  const left = (eco.gear.baits[id] || 0) - 1;
  const baits = { ...eco.gear.baits };
  if (left > 0) baits[id] = left;
  else delete baits[id];
  return { ...eco, gear: { ...eco.gear, baits }, equipped: { ...eco.equipped, bait: left > 0 ? id : FREE_BAIT } };
}

// ------------------------------------------------------------------------------------------------ J11: spending, rewards, handing fish in
/** Takes `n` pearls (all or nothing, never below 0). Returns { ok, eco }. */
export function spend(eco, n) {
  if (!isInt(n) || n > eco.money) return { ok: false, eco };
  return { ok: true, eco: { ...eco, money: eco.money - n, stats: { ...eco.stats, spent: eco.stats.spent + n } } };
}

/** Gives `n` pearls (a reward; it is not counted as "earned by selling"). */
export function credit(eco, n) {
  return isInt(n) && n > 0 ? { ...eco, money: eco.money + n } : eco;
}

/** Gives a pack of bait (the stack stays under MAX_STACK). Returns the new state. */
export function grantBait(eco, id, n) {
  const b = baitOf(id);
  if (!b || b.pack === null || !isInt(n, 1)) return eco;
  const have = eco.gear.baits[id] || 0;
  return { ...eco, gear: { ...eco.gear, baits: { ...eco.gear.baits, [id]: Math.min(MAX_STACK, have + n) } } };
}

/** Gives a float (equips it when none is). If it is already owned: { eco, dup: true } and nothing changes. */
export function grantFloat(eco, id) {
  if (!floatOf(id)) return { eco, dup: false };
  if (eco.gear.floats.includes(id)) return { eco, dup: true };
  return { eco: { ...eco, gear: { ...eco.gear, floats: [...eco.gear.floats, id] }, equipped: { ...eco.equipped, float: eco.equipped.float || id } }, dup: false };
}

/** Takes the fish at `indices` out of the bucket WITHOUT selling them (handed in for an order). The carnet is not touched. */
export function removeIndices(eco, indices) {
  const set = new Set(indices.filter((i) => isInt(i) && i < eco.bucket.length));
  if (set.size === 0) return eco;
  return { ...eco, bucket: eco.bucket.filter((_, i) => !set.has(i)) };
}

// ------------------------------------------------------------------------------------------------ save: validate / normalise / migrate

/** Lists what is wrong with an economy object (empty = valid). */
export function validateEconomy(e) {
  const err = [];
  if (!isObj(e)) return ['economy'];
  if (!isInt(e.money)) err.push('economy.money');
  if (!Array.isArray(e.bucket)) err.push('economy.bucket');
  else if (e.bucket.some((f) => !isObj(f) || typeof f.id !== 'string' || !isInt(f.cm) || !isInt(f.p, 1))) err.push('economy.bucket[]');
  const g = e.gear;
  if (!isObj(g)) err.push('economy.gear');
  else {
    if (!Array.isArray(g.rods) || g.rods.length === 0 || g.rods.some((t) => !rodOf(t)) || !g.rods.includes(1)) err.push('economy.gear.rods');
    if (!Array.isArray(g.floats) || g.floats.some((x) => typeof x !== 'string')) err.push('economy.gear.floats');
    if (typeof g.lantern !== 'boolean') err.push('economy.gear.lantern');
    if (!isObj(g.baits) || Object.values(g.baits).some((n) => !isInt(n, 1))) err.push('economy.gear.baits');
  }
  const q = e.equipped;
  if (!isObj(q)) err.push('economy.equipped');
  else if (isObj(g)) {
    if (!Array.isArray(g.rods) || !g.rods.includes(q.rod)) err.push('economy.equipped.rod');
    if (q.float !== null && !(Array.isArray(g.floats) && g.floats.includes(q.float))) err.push('economy.equipped.float');
    if (typeof q.bait !== 'string' || (q.bait !== FREE_BAIT && !(isObj(g.baits) && g.baits[q.bait] > 0))) err.push('economy.equipped.bait');
    if (typeof q.lantern !== 'boolean' || (q.lantern && g.lantern !== true)) err.push('economy.equipped.lantern');
  }
  const s = e.stats;
  if (!isObj(s) || !['caught', 'sold', 'earned', 'spent'].every((k) => isInt(s[k]))) err.push('economy.stats');
  return err;
}

/** A deep copy that is safe to keep and change (no shared arrays). */
export function cloneEconomy(e) {
  return {
    money: e.money,
    bucket: e.bucket.map((f) => ({ ...f })),
    gear: { rods: [...e.gear.rods], floats: [...e.gear.floats], lantern: e.gear.lantern, baits: { ...e.gear.baits } },
    equipped: { ...e.equipped },
    stats: { ...e.stats },
  };
}

/** Migration v1 -> v2 of the HD-2D save: money 0, tier-1 gear, an empty bucket; everything else (carnet, settings, world, hints) is kept as it is. */
export function migrateV1toV2(save) {
  return { ...save, v: 2, economy: newEconomy() };
}

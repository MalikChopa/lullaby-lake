// The live economy of a run (J10): one place that holds the current state, applies the model's operations and tells the listeners.
// Pure (no DOM, no clock): the shell gives it the species table and listens to the changes (HUD, save, sounds).

import { newEconomy, addCatch, sellOne, sellAll, sellDoubles, sellIndices, buy, equip, useBait, offer, bucketValue, cloneEconomy, validateEconomy, spend, credit, grantBait, grantFloat, removeIndices } from './model.js';

/**
 * @param {object} [initial] a valid economy state (else a new game's)
 * @param {Array} species the species table (price needs rarity and the size range)
 */
export function createStore(initial, species) {
  const byId = new Map(species.map((s) => [s.id, s]));
  let eco = initial && validateEconomy(initial).length === 0 ? cloneEconomy(initial) : newEconomy();
  let rev = 0;
  const listeners = [];
  const emit = (event) => {
    rev++;
    for (const f of listeners) {
      try {
        f(event, eco);
      } catch {
        /* a failing listener must not break the economy */
      }
    }
  };
  const S = {
    get: () => eco,
    /** Changes whenever the state changes (cheap "did it change?" test for caches). */
    rev: () => rev,
    on(fn) {
      listeners.push(fn);
    },
    /** Replaces the whole state (a loaded save); an invalid one is refused. */
    load(next) {
      if (validateEconomy(next).length) return false;
      eco = cloneEconomy(next);
      emit({ type: 'load' });
      return true;
    },
    /** A fish was caught: it goes to the bucket (the carnet is the game core's business) and one bait is used. */
    caught(speciesId, cm) {
      const sp = byId.get(speciesId);
      if (!sp) return null;
      const before = eco.equipped.bait;
      eco = useBait(addCatch(eco, sp, cm));
      const f = eco.bucket[eco.bucket.length - 1];
      emit({ type: 'catch', fish: f, baitOut: before !== eco.equipped.bait ? before : null });
      return f;
    },
    /** how: 'all' | 'doubles' | { index } | { indices }. Returns { sold, earned }. */
    sell(how) {
      let r;
      if (how === 'all') r = sellAll(eco);
      else if (how === 'doubles') r = sellDoubles(eco);
      else if (how && Array.isArray(how.indices)) r = sellIndices(eco, how.indices);
      else r = sellOne(eco, how && how.index);
      if (r.sold > 0) {
        eco = r.eco;
        emit({ type: 'sell', sold: r.sold, earned: r.earned });
      }
      return { sold: r.sold, earned: r.earned };
    },
    /** All or nothing. Returns { ok, reason?, price? }. */
    buy(kind, id) {
      const r = buy(eco, kind, id);
      if (r.ok) {
        eco = r.eco;
        emit({ type: 'buy', kind, id, price: r.price });
      }
      return { ok: r.ok, reason: r.reason, price: r.price };
    },
    equip(kind, id) {
      const r = equip(eco, kind, id);
      if (r.ok) {
        eco = r.eco;
        emit({ type: 'equip', kind, id });
      }
      return r.ok;
    },
    /** J11: pay (all or nothing). */
    spend(n, why = 'repair') {
      const r = spend(eco, n);
      if (r.ok && n > 0) {
        eco = r.eco;
        emit({ type: 'spend', n, why });
      }
      return r.ok;
    },
    /** J11: a reward { pearls, bait: {id, n}, float: id }; a float already owned is paid in pearls (`floatPearls`). Returns what was really given. */
    reward(rw, floatPearls = 0) {
      let e = eco;
      const given = { pearls: 0, bait: null, float: null };
      if (rw.pearls) {
        e = credit(e, rw.pearls);
        given.pearls += rw.pearls;
      }
      if (rw.bait) {
        const before = e.gear.baits[rw.bait.id] || 0;
        e = grantBait(e, rw.bait.id, rw.bait.n);
        const got = (e.gear.baits[rw.bait.id] || 0) - before;
        if (got > 0) given.bait = { id: rw.bait.id, n: got };
      }
      if (rw.float) {
        const g = grantFloat(e, rw.float);
        e = g.eco;
        if (g.dup) {
          e = credit(e, floatPearls);
          given.pearls += floatPearls;
        } else given.float = rw.float;
      }
      eco = e;
      emit({ type: 'reward', given });
      return given;
    },
    /** J11: fish handed in for an order leave the bucket (not sold). */
    handIn(indices) {
      const next = removeIndices(eco, indices);
      if (next !== eco) {
        eco = next;
        emit({ type: 'handIn', n: indices.length });
      }
    },
    offer: (kind, id) => offer(eco, kind, id),
    value: () => bucketValue(eco),
    speciesOf: (id) => byId.get(id) || null,
  };
  return S;
}

// The challenge state of a run (J11): wear, orders and milestones, stats, the auto-fight setting. A plain JSON-able object (part of the HD-2D save v3):
//   { wear: { line, rod }, quests: { active: [order], done: [milestone id], progress: { night, rain, orders }, counter },
//     stats: { fights, perfect, escaped, rewarded, repairs, emergencyAt }, settings: { autoFight } }
// createChallengeStore() keeps the live state, applies the operations (repair, emergency, hand-in, fight results) and tells the listeners.
// Pure (no DOM, no clock, no random beyond the seed): the shell gives it the economy store, the species table and a way to read the carnet.

import { MILESTONES, WEAR } from '../data/challenge.js';
import { floatOf } from '../economy/model.js';
import { newWear, clampCond, afterFight, repairCost, repaired, emergencyAvailable, afterEmergency, emergencyIn } from './wear.js';
import { fillOrders, match, validOrder, reached } from './quests.js';

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isInt = (x, min = 0) => Number.isInteger(x) && x >= min;
const num = (x) => typeof x === 'number' && Number.isFinite(x);

export function newChallenge() {
  return {
    wear: newWear(),
    quests: { active: [], done: [], progress: { night: false, rain: false, orders: 0 }, counter: 0 },
    stats: { fights: 0, perfect: 0, escaped: 0, rewarded: 0, repairs: 0, emergencyAt: -1 },
    settings: { autoFight: false },
  };
}

export function cloneChallenge(c) {
  return {
    wear: { ...c.wear },
    quests: { active: c.quests.active.map((o) => JSON.parse(JSON.stringify(o))), done: [...c.quests.done], progress: { ...c.quests.progress }, counter: c.quests.counter },
    stats: { ...c.stats },
    settings: { ...c.settings },
  };
}

/** Lists what is wrong with a challenge object (empty = valid). */
export function validateChallenge(c) {
  const e = [];
  if (!isObj(c)) return ['challenge'];
  if (!isObj(c.wear) || !num(c.wear.line) || !num(c.wear.rod) || c.wear.line < WEAR.floor - 1e-9 || c.wear.line > 100 || c.wear.rod < WEAR.floor - 1e-9 || c.wear.rod > 100) e.push('challenge.wear');
  const q = c.quests;
  if (!isObj(q)) e.push('challenge.quests');
  else {
    if (!Array.isArray(q.active) || q.active.length > 8 || !q.active.every(validOrder)) e.push('challenge.quests.active');
    if (!Array.isArray(q.done) || q.done.some((x) => typeof x !== 'string')) e.push('challenge.quests.done');
    if (!isObj(q.progress) || typeof q.progress.night !== 'boolean' || typeof q.progress.rain !== 'boolean' || !isInt(q.progress.orders)) e.push('challenge.quests.progress');
    if (!isInt(q.counter)) e.push('challenge.quests.counter');
  }
  const s = c.stats;
  if (!isObj(s) || !['fights', 'perfect', 'escaped', 'rewarded', 'repairs'].every((k) => isInt(s[k])) || !(isInt(s.emergencyAt) || s.emergencyAt === -1)) e.push('challenge.stats');
  if (!isObj(c.settings) || typeof c.settings.autoFight !== 'boolean') e.push('challenge.settings');
  return e;
}

/** Migration v2 -> v3 of the HD-2D save: full condition, no orders yet (made when the game starts), nothing done, auto fight off. Everything else is kept. */
export function migrateV2toV3(save) {
  return { ...save, v: 3, challenge: newChallenge() };
}

/**
 * @param {object} initial a valid challenge (else a new game's)
 * @param {{seed:number, species:Array, eco:object, getBook:()=>object}} deps  eco = the economy store (economy/store.js)
 */
export function createChallengeStore(initial, { seed, species, eco, getBook = () => ({}) }) {
  let ch = initial && validateChallenge(initial).length === 0 ? cloneChallenge(initial) : newChallenge();
  let rev = 0;
  const listeners = [];
  const emit = (event) => {
    rev++;
    for (const f of listeners) {
      try {
        f(event, ch);
      } catch {
        /* a failing listener must not break the challenge */
      }
    }
  };
  const bestRod = () => Math.max(...eco.get().gear.rods);
  const byId = new Map(species.map((s) => [s.id, s]));
  const earned = () => eco.get().stats.earned + ch.stats.rewarded;

  function milestones() {
    const given = [];
    for (let guard = 0; guard < 4; guard++) {
      const snap = { book: getBook(), species, bestRod: bestRod(), earned: earned(), perfect: ch.stats.perfect, flags: ch.quests.progress };
      const list = reached(ch.quests.done, snap);
      if (list.length === 0) break;
      for (const m of list) {
        const fp = m.reward.float && floatOf(m.reward.float) ? Math.round(floatOf(m.reward.float).price / 4) : 0;
        ch = { ...ch, quests: { ...ch.quests, done: [...ch.quests.done, m.id] } };
        const g = eco.reward(m.reward, fp);
        ch = { ...ch, stats: { ...ch.stats, rewarded: ch.stats.rewarded + g.pearls } };
        given.push({ m, given: g });
        emit({ type: 'milestone', id: m.id, given: g });
      }
    }
    return given;
  }

  const S = {
    get: () => ch,
    rev: () => rev,
    on: (fn) => void listeners.push(fn),
    load(next) {
      if (validateChallenge(next).length) return false;
      ch = cloneChallenge(next);
      S.ensureOrders();
      emit({ type: 'load' });
      return true;
    },
    /** Keeps 3 orders active (the game start, and after each hand-in). */
    ensureOrders() {
      const q = fillOrders(ch.quests, seed, bestRod(), species);
      if (q !== ch.quests) {
        ch = { ...ch, quests: q };
        emit({ type: 'orders' });
      }
    },
    /** Gear for the fight maths. */
    gear() {
      const e = eco.get();
      return { rod: e.equipped.rod, float: e.equipped.float, lineCond: ch.wear.line, rodCond: ch.wear.rod };
    },
    autoFight: () => ch.settings.autoFight,
    setAuto(v) {
      if (ch.settings.autoFight === !!v) return;
      ch = { ...ch, settings: { ...ch.settings, autoFight: !!v } };
      emit({ type: 'settings' });
    },
    /**
     * A fight ended. result = { status: 'won' | 'lost' | 'left', perfect, speciesId, cm }. Only a won fight wears the gear; a miss or a give-up costs nothing.
     * Returns { wearBefore, wearAfter }.
     */
    fightEnded(result) {
      const sp = byId.get(result.speciesId);
      const before = { ...ch.wear };
      const stats = { ...ch.stats, fights: ch.stats.fights + 1 };
      let wear = ch.wear;
      if (result.status === 'won') {
        const t = sp && sp.sizeCm.max > sp.sizeCm.min ? (result.cm - sp.sizeCm.min) / (sp.sizeCm.max - sp.sizeCm.min) : 0.5;
        wear = afterFight(ch.wear, sp ? sp.rarity : 1, t, eco.get().equipped.rod);
        if (result.perfect) stats.perfect += 1;
      } else stats.escaped += 1;
      ch = { ...ch, wear, stats };
      emit({ type: 'fight', status: result.status, before, after: wear });
      if (result.status === 'won') milestones();
      return { wearBefore: before, wearAfter: wear };
    },
    /** A fish was caught (called after the economy took it): flags for night / rain, milestones. Returns the milestones given. */
    caught({ phase, weather }) {
      const p = { ...ch.quests.progress };
      if (phase === 'night') p.night = true;
      if (weather === 'rain') p.rain = true;
      ch = { ...ch, quests: { ...ch.quests, progress: p } };
      return milestones();
    },
    /** Looks for milestones after something else changed (a rod bought, pearls earned). */
    check: milestones,
    costs: () => repairCost(ch.wear, eco.get().equipped.rod),
    /** Paid repair of 'line' | 'rod' | 'all'. Returns { ok, reason?, price }. */
    repair(which) {
      const c = S.costs();
      const price = which === 'all' ? c.all : c[which];
      if (!(price > 0)) return { ok: false, reason: 'fine', price: 0 };
      if (!eco.spend(price, 'repair')) return { ok: false, reason: 'poor', price, missing: price - eco.get().money };
      ch = { ...ch, wear: repaired(ch.wear, which), stats: { ...ch.stats, repairs: ch.stats.repairs + 1 } };
      emit({ type: 'repair', which, price });
      return { ok: true, price };
    },
    emergencyOk: () => emergencyAvailable(ch.wear, ch.stats.fights, ch.stats.emergencyAt),
    emergencyIn: () => emergencyIn(ch.stats.fights, ch.stats.emergencyAt),
    /** The free "ficelle de secours": gear back to at least the working threshold. Always free. */
    emergency() {
      if (!S.emergencyOk()) return { ok: false, reason: ch.wear.line >= 60 && ch.wear.rod >= 60 ? 'fine' : 'wait' };
      ch = { ...ch, wear: afterEmergency(ch.wear), stats: { ...ch.stats, emergencyAt: ch.stats.fights } };
      emit({ type: 'emergency' });
      return { ok: true };
    },
    /** A new rod is a rested one. */
    rodBought() {
      if (ch.wear.rod < 100) {
        ch = { ...ch, wear: { ...ch.wear, rod: 100 } };
        emit({ type: 'wear' });
      }
    },
    /** What the order would use from the bucket, or null. */
    canHandIn(orderId) {
      const o = ch.quests.active.find((x) => x.id === orderId);
      return o ? match(o, eco.get().bucket) : null;
    },
    /** Hands an order in with fish from the bucket (they leave it, the carnet is untouched), gives the reward, makes a new order. Returns { ok, reason?, given? }. */
    handIn(orderId) {
      const o = ch.quests.active.find((x) => x.id === orderId);
      if (!o) return { ok: false, reason: 'unknown' };
      const idx = match(o, eco.get().bucket);
      if (!idx) return { ok: false, reason: 'missing' };
      eco.handIn(idx);
      const given = eco.reward(o.reward, 0);
      ch = {
        ...ch,
        quests: { ...ch.quests, active: ch.quests.active.filter((x) => x.id !== orderId), progress: { ...ch.quests.progress, orders: ch.quests.progress.orders + 1 } },
        stats: { ...ch.stats, rewarded: ch.stats.rewarded + given.pearls },
      };
      emit({ type: 'order', order: o, given });
      S.ensureOrders();
      milestones();
      return { ok: true, given, order: o };
    },
    clampWear: clampCond,
  };
  eco.on((ev) => {
    if (ev.type === 'buy' && ev.kind === 'rod') {
      S.rodBought();
      milestones();
    } else if (ev.type === 'sell') milestones();
  });
  S.ensureOrders();
  return S;
}

export { MILESTONES };

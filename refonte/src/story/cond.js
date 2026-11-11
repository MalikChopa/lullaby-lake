// Conditions of the story and the dialogues (J12-A): small JSON objects evaluated by a fixed table of operators. NO eval, no new Function, no string
// parsing of code: an unknown operator is FALSE (it fails closed), a missing field is false. Pure and deterministic: the answer only depends on the
// condition and on `env`, a plain snapshot built by the shell:
//   env = { flags: {name: true}, step, phase, weather, money, rod, lantern, baits: {id: n}, seen: Set | string[], couplets: number[] }
// Forms:   true | undefined (always)   { flag: 'name' }   { not: c }   { all: [c...] }   { any: [c...] }
//          { step: { gte, lte, eq } }   { time: ['night', 'dusk'] }   { weather: ['rain'] }   { seen: 'id' }   { couplet: n }   { money: { gte } }
//          { fish: { gte } } (bucket count)   { rod: { gte } }   { item: 'lantern' | 'bait:<id>' }

const num = (x) => typeof x === 'number' && Number.isFinite(x);
const cmp = (v, r) => {
  if (!num(v) || r === null || typeof r !== 'object') return false;
  if (r.eq !== undefined && v !== r.eq) return false;
  if (r.gte !== undefined && !(v >= r.gte)) return false;
  if (r.lte !== undefined && !(v <= r.lte)) return false;
  if (r.gt !== undefined && !(v > r.gt)) return false;
  if (r.lt !== undefined && !(v < r.lt)) return false;
  return true;
};
const has = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const inList = (list, x) => Array.isArray(list) && list.includes(x);

/** The table of operators: (argument, env, evaluate) -> boolean. Frozen: nothing can add an operator at run time. */
export const OPERATORS = Object.freeze({
  flag: (a, e) => typeof a === 'string' && has(e.flags, a) && !!e.flags[a],
  not: (a, e, ev) => !ev(a, e),
  all: (a, e, ev) => Array.isArray(a) && a.every((c) => ev(c, e)),
  any: (a, e, ev) => Array.isArray(a) && a.some((c) => ev(c, e)),
  step: (a, e) => cmp(e.step, a),
  time: (a, e) => inList(a, e.phase),
  weather: (a, e) => inList(a, e.weather),
  seen: (a, e) => typeof a === 'string' && (e.seen instanceof Set ? e.seen.has(a) : inList(e.seen, a)),
  couplet: (a, e) => inList(e.couplets, a),
  money: (a, e) => cmp(e.money, a),
  fish: (a, e) => cmp(e.fish, a), // J12-B: the number of fish in the bucket
  rod: (a, e) => cmp(e.rod, a),
  item: (a, e) => (a === 'lantern' ? !!e.lantern : typeof a === 'string' && a.startsWith('bait:') ? has(e.baits, a.slice(5)) && e.baits[a.slice(5)] > 0 : false),
});

function walk(c, env, depth) {
  if (depth > 12) throw new RangeError('condition too deep'); // an exception, not "false": a `not` around it must not turn it into true
  if (c === undefined || c === true) return true;
  if (c === false || c === null || typeof c !== 'object' || Array.isArray(c)) return false;
  const keys = Object.keys(c);
  if (keys.length === 0) return false;
  for (const k of keys) {
    if (!has(OPERATORS, k)) return false; // unknown operator: fails closed
    if (!OPERATORS[k](c[k], env || {}, (x, e) => walk(x, e, depth + 1))) return false;
  }
  return true;
}

/** Evaluates a condition (see the header). Anything wrong (unknown operator, malformed data, absurdly deep nesting) is FALSE. */
export function evalCond(c, env) {
  try {
    return walk(c, env, 0);
  } catch {
    return false;
  }
}

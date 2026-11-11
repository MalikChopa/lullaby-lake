// Data of the "little challenge" (J11): the fight, the wear of the gear, the repairs, the orders and the milestones. EVERY number lives here and is
// Names and numbers validated by the owner on 2026-11-10 (the balance is checked by simulation, tools/sim-economy.mjs). Nothing in the code depends on a value.
// Rules (owner, 2026-11-08): nothing is ever lost, no failure state, no timer that presses, money never negative, an automatic mode for every
// challenge, difficulty never carried by colour or sound alone.

/**
 * The fight. The bar is 0..1 high (0 = bottom). The fish's "zone" is a band that moves along the bar; the player's marker rises while the action is
 * held and falls when it is released. Progress fills while the marker is in the band and drains slowly outside (never below 0, never a loss by itself):
 * the fight only ends when progress reaches 1 (caught) or when the fish's patience runs out (it swims off and comes back later) or the player lets go.
 *   bandW     band height (share of the bar)     speed   how fast the band travels (bar heights per second)    wobble  small extra sway (share of the bar)
 *   fillS     seconds spent IN the band to win   retarget  seconds between two new places the band drifts to
 */
export const FIGHT = Object.freeze({
  byRarity: Object.freeze({
    1: Object.freeze({ bandW: 0.5, speed: 0.1, wobble: 0.015, fillS: 4.5, retarget: Object.freeze([1.8, 3.2]) }),
    2: Object.freeze({ bandW: 0.4, speed: 0.15, wobble: 0.035, fillS: 6, retarget: Object.freeze([1.5, 2.8]) }),
    3: Object.freeze({ bandW: 0.34, speed: 0.2, wobble: 0.05, fillS: 6.5, retarget: Object.freeze([1.2, 2.3]) }),
    4: Object.freeze({ bandW: 0.28, speed: 0.24, wobble: 0.07, fillS: 7.5, retarget: Object.freeze([1.0, 2.0]) }),
  }),
  sizeHard: 0.14, // a fish at the top of its size range is up to 14 % harder (narrower, faster)
  physics: Object.freeze({ up: 2.2, down: 1.6, drag: 2.5, assist: 1.0 }), // acceleration up while held / down while released, drag, extra drag inside the band (a gentle magnet)
  drain: 0.3, // progress drains at 0.3 x the fill speed while the marker is outside the band
  graceS: 1.0, // at the start the progress cannot drain
  patience: Object.freeze({ mul: 4, extraS: 12 }), // patienceS = fillS x mul + extraS (generous: the fish tires slowly; never shown as a count-down)
  perfect: Object.freeze({ maxOutsideShare: 0.12 }), // a "perfect" fight spent at most 12 % of its time outside the band (manual only)
  auto: Object.freeze({ fillMul: 0.7, followRate: 6 }), // the automatic mode: the marker follows the band, the fight resolves in fillS x fillMul seconds
  reducedSpeedMul: 0.6, // reduced motion: slower bands, less sway
  ease: Object.freeze({
    rodPerTier: 0.02, // + per rod tier above 1 (x the rod's condition factor)
    line: 0.06, // a fresh line (x the line's condition factor)
    float: Object.freeze({ bouchon: 0.02, plume: 0.04, etoile: 0.07 }), // comfort of the float
    max: 0.25,
  }), // ease widens the band by (1 + ease) and slows it by (1 - ease)
});

/**
 * Wear: the line and the rod have a condition (percent, FLOOR..100). Each won fight lowers it a little: more for rare / big fish, less with a better rod.
 * Above `goodAbove` the gear works at full strength; below, its factor falls linearly to `weakMin` at the floor (slightly weaker: a smaller band bonus and a
 * shorter cast), NEVER broken. Misses and give-ups wear nothing.
 */
export const WEAR = Object.freeze({
  floor: 10,
  goodAbove: 60,
  weakMin: 0.6,
  reachLoss: 0.12, // the cast reaches up to 12 % less with a worn rod
  perFight: Object.freeze({ line: Object.freeze({ 1: 0.9, 2: 1.5, 3: 2.4, 4: 3.6 }), rod: Object.freeze({ 1: 0.45, 2: 0.75, 3: 1.2, 4: 1.8 }) }), // percent points at the rarity
  sizeMul: Object.freeze([0.75, 1.3]), // x (small .. big fish of its range)
  rodSave: 0.12, // each rod tier above 1 saves 12 % of the wear
});

/** Repairs at the Atelier: price per percent point, by rod tier (grows gently); the free "ficelle de secours" (emergency) from the cabin and the Atelier. */
export const REPAIR = Object.freeze({
  perPoint: Object.freeze({ line: Object.freeze([0.5, 0.65, 0.8, 1.0, 1.25]), rod: Object.freeze([0.8, 1.1, 1.5, 2.0, 2.6]) }),
  emergency: Object.freeze({ restoreTo: 60, everyFights: 10 }), // free: brings both to at least 60 %, available again after 10 more fights (the first time at once)
  doorKeeper: 'repairer', // the Atelier's villager (data/map.js)
});

/** Where the new things can be used (world positions are computed in app.js from the buildings; the notice board is a prop placed here). */
export const POINTS = Object.freeze({
  board: Object.freeze({ x: 27.8, z: 21.0, rot: 0.3, useDistance: 2.2 }), // the notice board (a sign post) on the plaza
  cabinR: 1.1, // the cabin door: only near it (the walk starts a step away)
  workshopR: 2.4,
});

/** Orders: 3 at a time, never expiring, made from the save's seed. The askers are the placeholder villagers of data/map.js (their role names are used). */
export const ORDERS = Object.freeze({
  slots: 3,
  askers: Object.freeze(['child', 'sailor', 'forager', 'walker', 'repairer', 'shopkeeper']),
  familyShare: 0.35, // share of "N fish of a family" orders (the rest: "a fish of at least N cm")
  sizeFrac: Object.freeze([0.35, 0.7]), // the asked size sits at this share of the species' size range
  familyCount: Object.freeze([2, 4]),
  rarityWeight: Object.freeze({ 1: 10, 2: 6, 3: 3, 4: 1 }),
  rewardMul: Object.freeze([1.3, 1.7]), // pearls = (value of what is asked) x this
  baitChance: 0.35, // share of the orders that also give a pack of bait
  families: Object.freeze(['silver', 'carp', 'perch', 'giant', 'glow']),
});

/**
 * Milestones (small, each given once). test: 'rarity' (a fish of rarity n caught) | 'rod' (best rod >= n) | 'species' (n different species in the carnet)
 * | 'flag' (a progress flag: night / rain, set when a fish is caught then) | 'earned' (pearls earned in all >= n) | 'perfect' (a perfect fight).
 * reward: { pearls?, bait?: {id, n}, float?: id }  (a float already owned is paid in pearls instead)
 */
export const MILESTONES = Object.freeze([
  { id: 'rarity2', test: 'rarity', n: 2, reward: { pearls: 40 } },
  { id: 'rarity3', test: 'rarity', n: 3, reward: { pearls: 90, bait: { id: 'larve', n: 4 } } },
  { id: 'rarity4', test: 'rarity', n: 4, reward: { pearls: 250 } },
  { id: 'rod2', test: 'rod', n: 2, reward: { pearls: 60, float: 'bouchon' } },
  { id: 'species10', test: 'species', n: 10, reward: { pearls: 120 } },
  { id: 'species20', test: 'species', n: 20, reward: { pearls: 300, bait: { id: 'perle-miel', n: 3 } } },
  { id: 'night', test: 'flag', flag: 'night', reward: { pearls: 50, bait: { id: 'mouche', n: 4 } } },
  { id: 'rain', test: 'flag', flag: 'rain', reward: { pearls: 50, bait: { id: 'pain', n: 4 } } },
  { id: 'earned1000', test: 'earned', n: 1000, reward: { pearls: 100 } },
  { id: 'perfect', test: 'perfect', n: 1, reward: { pearls: 80 } },
].map((m) => Object.freeze(m)));

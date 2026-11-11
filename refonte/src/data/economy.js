// Economy data of the HD-2D game (J10). EVERY name and number of the economy lives here (names in data/strings.js): the owner reviews them, nothing in
// the code depends on a value. Names and numbers validated by the owner on 2026-11-10 (2026-11-07 rules: nothing is ever lost, money never negative, selling is optional,
// the starting gear always has something to catch, gear matters, no timer that presses).
// J11 (wear, repair, orders) and J12 (dialogues) will extend these tables: every list item has a stable `id` and can get new fields.

/** Currency (names: strings 'eco.currency*'). */
export const CURRENCY = Object.freeze({ id: 'pearl' });

/** Base price of a fish by rarity (the 4 tiers of the species data). */
export const RARITY_BASE = Object.freeze({ 1: 32, 2: 92, 3: 270, 4: 800 });

/**
 * Size factor of the price: lerp(min, max) over the position of the size in the species range (min..max cm), times `trophyMul` when the fish is in
 * the top `trophyShare` of the range ("a record-sized fish is worth more"). Deterministic: no random part.
 */
export const SIZE_FACTOR = Object.freeze({ min: 0.7, max: 1.3, trophyShare: 0.85, trophyMul: 1.25 });

/** A purchase of at least this price asks for a confirmation (the shop). */
export const BIG_PRICE = 600;
/** A bait stack never holds more than this many. */
export const MAX_STACK = 99;

/**
 * Rods, 5 tiers. reach = multiplier of the cast distance; reel = multiplier of the reel-in time (a stronger rod brings the fish in a bit faster).
 * The species a rod "unlocks" are the ones whose `needs.where` asks for that tier (see NEEDS). Tier 1 is free and owned from the start.
 */
export const RODS = Object.freeze([
  { tier: 1, price: 0, reach: 1.0, reel: 1.0 },
  { tier: 2, price: 450, reach: 1.12, reel: 0.95 },
  { tier: 3, price: 900, reach: 1.25, reel: 0.9 },
  { tier: 4, price: 1800, reach: 1.4, reel: 0.85 },
  { tier: 5, price: 3200, reach: 1.55, reel: 0.8 },
].map(Object.freeze));

/**
 * Baits, 6. price/pack = pearls for a pack of `pack` baits (null = free and unlimited: it always exists, so running out never blocks play).
 * fam = bite weight multiplier by species family (absent = 1); waitMul = multiplier of the waiting time before a bite (raises the bite rate).
 * The free bait has no multiplier at all: with it the draw is exactly the 2D game's draw (tests prove it).
 */
export const BAITS = Object.freeze([
  { id: 'ver', price: 0, pack: null, waitMul: 1, fam: {} },
  { id: 'mouche', price: 60, pack: 8, waitMul: 0.9, fam: { silver: 2.2, perch: 1.5 } },
  { id: 'pain', price: 54, pack: 8, waitMul: 0.9, fam: { carp: 2.2, silver: 1.3 } },
  { id: 'larve', price: 108, pack: 8, waitMul: 0.85, fam: { perch: 2.4, giant: 1.8, carp: 1.2 } },
  { id: 'perle-miel', price: 225, pack: 5, waitMul: 0.8, fam: { glow: 3, giant: 2.4, perch: 1.6 } },
  { id: 'eclat-lune', price: 450, pack: 5, waitMul: 0.7, fam: { glow: 4, giant: 3 } },
].map((b) => Object.freeze({ ...b, fam: Object.freeze(b.fam) })));

/** Floats, 3 (comfort). holdS = extra seconds the fish waits after a bite (a longer reel window); cue = how soft the bite signal is (1 full .. 0.5 soft). */
export const FLOATS = Object.freeze([
  { id: 'bouchon', price: 100, holdS: 2, cue: 0.85 },
  { id: 'plume', price: 300, holdS: 4, cue: 0.7 },
  { id: 'etoile', price: 700, holdS: 7, cue: 0.5 },
].map(Object.freeze));

/** The lantern: night fishing. nightMul multiplies the weight of the species that only bite at dusk / night; light = extra light at night (0..1). */
export const LANTERN = Object.freeze({ id: 'lanterne', price: 450, nightMul: 1.35, light: 1 });

/** Items kept for later milestones (not sold yet): the species that need them are marked `later` in NEEDS and never bite in J10. */
export const LATER_ITEMS = Object.freeze({ boat: Object.freeze({ available: false }) });

/** Water-zone tags of the fishing spots (data/map.js SPOTS[].water), with their word keys 'eco.zone.<tag>'. */
export const ZONES = Object.freeze(['shallow', 'reeds', 'deep', 'pier']);

/**
 * Requirements per species (kept beside src/data/species.js, which is not edited).
 *   family  silver | carp | perch | giant | glow   (the baits attract families)
 *   where   { zoneTag: minimum rod tier } = the places the species can bite and the rod needed there ("catchable with tier-1 gear somewhere")
 *   baitAny optional: one of these baits must be on the hook (the rarest fish only)
 *   later   optional: the item ('boat') that is needed; the species cannot bite until that item exists
 */
export const NEEDS = Object.freeze({
  'gardon-reveur': { family: 'silver', where: { shallow: 1, pier: 1, reeds: 1, deep: 2 } },
  'carpe-lune': { family: 'carp', where: { shallow: 1, pier: 1, reeds: 1, deep: 2 } },
  'perche-ambree': { family: 'perch', where: { pier: 1, shallow: 1, deep: 2 } },
  'tanche-mousse': { family: 'carp', where: { reeds: 1, shallow: 1, deep: 2 } },
  'truite-brume': { family: 'perch', where: { pier: 1, shallow: 1, deep: 3 } },
  'anguille-argent': { family: 'giant', where: { reeds: 1, shallow: 2, deep: 3 } },
  'ablette-aurore': { family: 'silver', where: { shallow: 1, pier: 1, reeds: 1 } },
  'epinoche-etoilee': { family: 'silver', where: { reeds: 1, shallow: 1, deep: 2 } },
  'brochet-ombre': { family: 'perch', where: { reeds: 2, pier: 3, shallow: 3, deep: 4 } },
  'silure-sage': { family: 'giant', where: { reeds: 3, shallow: 4, deep: 4 } },
  veilleuse: { family: 'glow', where: { reeds: 2, pier: 2, shallow: 3, deep: 3 } },
  berceuse: { family: 'glow', where: { pier: 5, shallow: 5, reeds: 5, deep: 5 }, baitAny: ['perle-miel', 'eclat-lune'] },
  'vairon-miel': { family: 'silver', where: { shallow: 1, pier: 1, deep: 2 } },
  'goujon-pluie': { family: 'silver', where: { shallow: 1, reeds: 1, deep: 2 } },
  'breme-nuage': { family: 'carp', where: { shallow: 1, pier: 1, deep: 2 } },
  'chevesne-roseau': { family: 'carp', where: { reeds: 1, shallow: 1, deep: 2 } },
  'rotengle-braise': { family: 'carp', where: { pier: 1, reeds: 1, shallow: 1 } },
  'sandre-fantome': { family: 'perch', where: { pier: 1, reeds: 2, shallow: 2, deep: 3 } },
  'ide-orage': { family: 'carp', where: { shallow: 1, reeds: 2, deep: 3 } },
  'barbeau-fleuri': { family: 'carp', where: { shallow: 1, pier: 2, deep: 3 } },
  'koi-paisible': { family: 'carp', where: { shallow: 1, reeds: 2, deep: 3 } },
  'esturgeon-ancien': { family: 'giant', where: { deep: 3 }, spots: ['depths', 'heart', 'bay', 'open', 'islet'], mul: 8, later: 'boat' },
  'soleil-midi': { family: 'silver', where: { shallow: 3, pier: 3, reeds: 3, deep: 4 } },
  comete: { family: 'glow', where: { shallow: 4, pier: 4, reeds: 4, deep: 5 }, baitAny: ['eclat-lune'] },
});

/** First-time hint and the shop's greeting use these keys (names: strings). The shopkeeper is a placeholder villager (id 'shopkeeper' in data/map.js). */
export const SHOP = Object.freeze({ keeperId: 'shopkeeper', doorBuilding: 'shop', useDistance: 2.4 });

/** What the gear looks like in the world (3D): rod length (m) and colour by tier; the float's tint and size. Pure data, no drawing code. */
export const LOOK = Object.freeze({
  rodLen: Object.freeze([2.0, 2.1, 2.2, 2.35, 2.5]),
  rodColors: Object.freeze([0x6a4a3a, 0x8a6a3a, 0xb8c0c8, 0x9fb8ff, 0xffd987]),
  floats: Object.freeze({ none: Object.freeze({ color: 0xffffff, scale: 1 }), bouchon: Object.freeze({ color: 0xff9a8a, scale: 1.12 }), plume: Object.freeze({ color: 0xe6eeff, scale: 1.25 }), etoile: Object.freeze({ color: 0xffe08a, scale: 1.4 }) }),
});

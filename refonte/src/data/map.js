// The lake world of J8 as DATA (no logic): about 100 x 100 metres. x = east, z = south (toward the camera), y = up, 1 unit = 1 metre.
// The J7 zone "Cabane et ponton" (data/params.js LAYOUT) is kept as it was, at the origin, on the south shore of the lake.
// Zones (fiche § 6): cabin and pier (start), village (plaza, well, Boutique, Atelier, houses, stall), reed shallows (boardwalk), pine
// forest and trail (clearing), boat landing (moored boat, nets), the islet of the spirit (visible, NOT reachable in J8).
// The scattered vegetation (forest pines, ferns, mushrooms, bushes, reeds...) is generated from the `scatter` rules below by
// logic/mapgen.js (seeded, deterministic). Everything that walks, collides, fishes or is drawn reads this file.

import { LAYOUT, DECK_Y } from './params.js';

/** Walkable world bounds (the natural boundaries below are met long before these). */
export const BOUNDS = Object.freeze({ x0: -50, x1: 50, z0: -60, z1: 40 });
/** Extent of the drawn terrain (the cliffs and the far bank go beyond the walkable land). */
export const TERRAIN = Object.freeze({ x0: -72, x1: 72, z0: -80, z1: 58, cell: 0.5 });

/**
 * The lake: an ellipse (centre, half axes, gentle wobble) intersected with the J7 near shore (logic/terrain.js shoreZ), so the J7 zone
 * keeps its exact shore line. `shallows` = the reed bay where the bed stays shallow. The islet sits inside the lake.
 */
export const LAKE = Object.freeze({
  cx: 0,
  cz: -24,
  ax: 32,
  az: 26,
  wobble: [[0.03, 3, 1.0], [0.02, 5, 0.3]], // [amplitude (share of the radius), angular frequency, phase]
  shallows: Object.freeze({ x: -21, z: -11, r: 8.5, minDepth: -0.32 }),
  islet: Object.freeze({ x: 6, z: -27, r: 3.6, top: 0.9 }),
});

/**
 * Natural boundary of the walkable land (clockwise polygon). Outside it the ground rises into cliffs and ridges with dense pines on top;
 * the lake is the boundary in the north. The closing edge crosses the lake (water there anyway).
 */
export const BOUNDARY = Object.freeze([
  [-30, -20.5], [-40, -21.5], [-46.5, -16], [-47.5, 0], [-47, 20], [-45, 35.5], [-20, 37], [0, 36], [20, 37], [40, 35.5], [46.5, 25], [47, 5], [46, -12], [38, -21.5], [28.5, -20],
]);

/** Decks above the water or the ground (axis-aligned rectangles, y = deck height): the J7 pier, the reed boardwalk, the landing jetty. */
export const DECKS = Object.freeze([
  ...LAYOUT.pier.walk.map((r) => ({ ...r, y: DECK_Y, kind: 'pier' })),
  { x0: -26, x1: -17, z0: -7.0, z1: -5.6, y: 0.35, kind: 'boardwalk' },
  { x0: -25.6, x1: -22.4, z0: -5.8, z1: -4.7, y: 0.35, kind: 'boardwalk' }, // a wide step down to the shore path
  { x0: -18.4, x1: -17.0, z0: -12.8, z1: -5.8, y: 0.35, kind: 'boardwalk' },
  { x0: -19.5, x1: -15.5, z0: -15.0, z1: -12.6, y: 0.35, kind: 'boardwalk' },
  { x0: 23.5, x1: 33.2, z0: -14.6, z1: -13.2, y: DECK_Y, kind: 'jetty' },
  { x0: 22.4, x1: 24.2, z0: -16.0, z1: -11.8, y: DECK_Y, kind: 'jetty' },
  { x0: 5.3, x1: 6.7, z0: -24.0, z1: -22.2, y: DECK_Y, kind: 'jetty' }, // J12-B: the small jetty of the islet (the boat's third dock)
].map((d) => Object.freeze(d)));

/** Paths (polylines). w = half width in metres; kind: dirt | cobble. The J7 dirt path is the first one. */
export const PATHS = Object.freeze([
  { id: 'cabin-pier', kind: 'dirt', w: LAYOUT.pathWidth, pts: LAYOUT.path },
  { id: 'village-road', kind: 'dirt', w: 0.8, pts: [[1.0, 3.8], [5.5, 3.0], [10.4, 4.4], [14.5, 6.8], [19.0, 9.6]] },
  { id: 'village-street', kind: 'cobble', w: 0.9, pts: [[19.0, 9.6], [20.5, 14.6]] },
  { id: 'landing-road', kind: 'dirt', w: 0.8, pts: [[28.6, 16.8], [33.5, 17.0], [38.5, 17.0], [39.5, 12.0], [39.0, 6.0], [36.0, -3.0], [33.6, -10.0], [33.0, -13.9]] },
  { id: 'beach', kind: 'dirt', w: 0.6, pts: [[35.0, -5.0], [29.0, -5.6], [24.6, -6.0]] },
  { id: 'shore', kind: 'dirt', w: 0.65, pts: [[1.0, 3.8], [-2.0, 3.4], [-5.5, 2.4], [-9.0, 2.2], [-12.5, 2.0], [-15.6, 0.6], [-18.0, 0.0], [-21.5, -1.2], [-26.0, -4.0]] },
  { id: 'trail', kind: 'dirt', w: 0.7, pts: [[-5.0, 9.4], [-8.0, 11.2], [-12.0, 12.2], [-16.0, 13.5], [-21.0, 17.0], [-26.0, 21.0], [-30.0, 24.0]] },
  { id: 'trail-loop', kind: 'dirt', w: 0.7, pts: [[-30.0, 24.0], [-35.0, 18.0], [-37.0, 10.0], [-35.0, 3.0], [-30.0, -1.0], [-26.0, -4.0]] },
  { id: 'point', kind: 'dirt', w: 0.55, pts: [[-30.0, -1.0], [-32.4, -7.0], [-31.6, -12.0]] },
].map((p) => Object.freeze(p)));

/** Ground areas: cobbled plaza, forest clearing, flower beds (r = radius). Props may stand in an area (not on a path line). */
export const AREAS = Object.freeze([
  { id: 'plaza', kind: 'cobble', x: 24, z: 18.5, r: 5.0 },
  { id: 'clearing', kind: 'clearing', x: -30, z: 24, r: 5.0 },
  ...LAYOUT.flowerPatches.map(([x, z, r], i) => ({ id: 'flowers-cabin-' + i, kind: 'flowers', x, z, r })),
  { id: 'flowers-v1', kind: 'flowers', x: 16.6, z: 15.4, r: 1.6 },
  { id: 'flowers-v2', kind: 'flowers', x: 31.6, z: 25.0, r: 1.8 },
  { id: 'flowers-v3', kind: 'flowers', x: 10.5, z: 17.5, r: 1.5 },
  { id: 'flowers-v4', kind: 'flowers', x: 38.5, z: 27.5, r: 2.0 },
  { id: 'flowers-c1', kind: 'flowers', x: -28.4, z: 26.2, r: 2.2 },
  { id: 'flowers-c2', kind: 'flowers', x: -34.4, z: 23.6, r: 1.4 },
  { id: 'flowers-w', kind: 'flowers', x: -24.5, z: 5.5, r: 2.0 },
  { id: 'flowers-islet', kind: 'flowers', x: 4.4, z: -25.4, r: 1.0 }, // J12-B: the islet
].map((a) => Object.freeze(a)));

/**
 * Buildings (oriented boxes; rot turns the front face from +z, radians). The cabin is the J7 one (axis-aligned). Exterior only in J8:
 * the Boutique and the Atelier have a sign and a door marker but cannot be entered yet.
 */
const C = LAYOUT.cabin;
export const BUILDINGS = Object.freeze([
  { id: 'cabin', type: 'cabin', x: C.x, z: C.z, w: C.w, d: C.d, rot: 0 },
  { id: 'shop', type: 'shop', x: 24, z: 10.5, w: 6, d: 4.5, rot: 0, wallH: 2.7, roofH: 1.9, sign: 'fish' },
  { id: 'workshop', type: 'workshop', x: 33.5, z: 12.5, w: 5, d: 4, rot: 0, wallH: 2.5, roofH: 1.6, sign: 'tool' },
  { id: 'houseA', type: 'house', x: 15, z: 11.5, w: 4.5, d: 4, rot: 0, wallH: 2.4, roofH: 1.7, variant: 0 },
  { id: 'houseB', type: 'house', x: 36, z: 22, w: 4.5, d: 4, rot: -Math.PI / 2, wallH: 2.5, roofH: 1.6, variant: 1 },
  { id: 'houseC', type: 'house', x: 13.5, z: 21.5, w: 4, d: 4, rot: Math.PI / 2, wallH: 2.3, roofH: 1.7, variant: 2 },
  { id: 'houseD', type: 'house', x: 30.5, z: 30, w: 4.4, d: 3.8, rot: Math.PI, wallH: 2.4, roofH: 1.5, variant: 3 },
].map((b) => Object.freeze(b)));

/**
 * Hand-placed props: [type, x, z, rot, scale, variant]. Types and their collision (logic/collide.js PROP_SHAPES): lamp, well, stall,
 * bench, barrel, crate, sign, net, stump, log, rock, bush, tree (round leafy), pine (variants 0-2), boat (on water), spiritTree (islet).
 */
export const PROPS = Object.freeze([
  // J7 zone (cabin and pier): its pines and rocks come from LAYOUT, the lamp too
  ['lamp', LAYOUT.lamp.x, LAYOUT.lamp.z, 0, 1, 0],
  // village
  ['well', 24, 18.5, 0, 1, 0],
  ['stall', 20.0, 19.8, 0, 1, 0],
  ['lamp', 27.96, 14.54, 0, 1, 0],
  ['lamp', 27.96, 22.46, 0, 1, 0],
  ['lamp', 20.04, 22.46, 0, 1, 0],
  ['lamp', 18.4, 18.5, 0, 1, 0],
  ['bench', 24, 23.3, Math.PI, 1, 0],
  ['bench', 29.6, 18.6, -Math.PI / 2, 1, 0],
  ['barrel', 21.8, 13.35, 0, 1, 0],
  ['barrel', 22.45, 13.55, 0, 0.9, 1],
  ['crate', 27.3, 13.4, 0.2, 1, 0],
  ['crate', 27.95, 13.55, -0.1, 0.8, 1],
  ['barrel', 36.6, 15.0, 0, 1, 0],
  ['crate', 31.2, 15.1, 0.4, 0.9, 0],
  ['sign', 11.5, 6.6, -0.5, 1, 0],
  ['sign', -7.4, 12.6, 0.6, 1, 1],
  ['sign', -27.2, -1.6, 0.9, 1, 2],
  ['crate', -9.2, 8.5, 0.15, 1, 0], // J12-A: Grandma's writing desk (the letters), beside the cabin
  ['bench', -7.9, 9.3, 0, 1, 0], // J12-A: the window seat
  ['sign', 27.8, 21.0, 0.3, 1, 0], // J11: the village notice board (the orders), data/challenge.js POINTS.board
  ['tree', 18.5, 26.5, 0, 1.1, 0],
  ['tree', 9.5, 13.5, 0, 1.0, 1],
  ['tree', 41.5, 13.5, 0, 1.15, 0],
  ['tree', 26.5, 33.0, 0, 1.0, 1],
  ['tree', 9.0, 25.0, 0, 1.05, 0],
  ['tree', 42.5, 27.0, 0, 0.95, 1],
  ['bush', 18.4, 7.4, 0, 0.9, 0],
  ['bush', 12.1, 9.6, 0, 1.0, 1],
  ['bush', 22.0, 7.9, 0, 0.8, 0],
  ['bush', 26.9, 7.8, 0, 0.85, 1],
  ['bush', 36.3, 10.2, 0, 0.9, 0],
  ['bush', 33.7, 25.3, 0, 1.0, 1],
  ['bush', 16.2, 24.6, 0, 0.9, 0],
  // landing
  ['boat', 26.4, -16.7, 0, 1, 0],
  ['net', 36.4, -12.2, 0.5, 1, 0],
  ['lamp', 23.0, -12.15, 0, 1, 0],
  ['barrel', 30.2, -12.2, 0, 0.9, 0],
  ['crate', 34.8, -13.0, 0.3, 1, 0],
  // reed shallows
  ['lamp', -15.9, -12.95, 0, 1, 0],
  // forest clearing
  ['log', -32.6, 27.4, 0.4, 1, 0],
  ['stump', -32.4, 25.6, 0, 1, 0],
  ['stump', -31.0, 20.9, 0, 0.8, 1],
  // islet of the spirit (lore beacon, out of reach)
  ['spiritTree', LAKE.islet.x, LAKE.islet.z, 0, 1, 0],
  // J12-B: the cosy place of the islet (a bench under the glow, a stone); reachable only from the islet jetty, by boat
  ['bench', 4.3, -28.4, 0.5, 1, 0],
  ['rock', 7.6, -29.4, 0, 0.5, 0],
].map((p) => Object.freeze(p)));

/** Fences (polylines of posts and two rails); they collide along their segments. */
export const FENCES = Object.freeze([
  Object.freeze(LAYOUT.fence),
  Object.freeze([[10.4, 24.6], [10.4, 27.4], [15.6, 27.4]]),
  Object.freeze([[33.2, 27.0], [36.5, 27.0], [36.5, 29.6]]),
  Object.freeze([[40.6, 19.6], [40.6, 24.6]]),
  Object.freeze([[-34.5, -15.0], [-36.0, -9.5]]),
]);

/**
 * Cosmetic decor (round 2 of the art pass): [kind, x, z, rot, scale]. DRAWN ONLY: no collision, no nav grid. Kinds and footprints: logic/decor.js
 * (decorCircles); every item must stay clear of the paths, spots, door fronts, solid props and villager routes (tests/refonte-art-r2.test.js).
 * The decor round the village houses (flower beds, pots, hedges) is generated from BUILDINGS by logic/decor.js houseDecor().
 */
export const DECOR = Object.freeze([
  // the cabin yard: firewood and an axe, a washing line, a rain barrel and an oar against the walls
  ['woodpile', -9.15, 5.6, Math.PI / 2, 1],
  ['chopblock', -10.3, 4.9, 0, 1],
  ['washline', -11.3, 5.6, -Math.PI / 2, 2.6],
  ['rainbarrel', -2.95, 5.5, 0, 1],
  ['oar', -3.25, 6.5, -Math.PI / 2, 1],
  // the camp, a few steps south-east of the start: a fire with log seats, a canvas lean-to, a bedroll, a bucket, a drying rack, crates
  ['campfire', 1.4, 12.2, 0.3, 1],
  ['tent', 4.5, 12.3, 3.5, 1],
  ['bedroll', 3.1, 14.0, 1.2, 1],
  ['bucket', 2.5, 11.6, 0, 1],
  ['rack', -3.35, 13.75, 0.2, 1],
  ['crates', 5.6, 11.6, 0.4, 1],
  // the boat landing: a cart with baskets and a drying rack for the catch
  ['cart', 30.4, -9.4, 0.3, 1],
  ['rack', 37.85, -10.1, 0.4, 1],
  ['crates', 28.9, -9.85, 0.2, 1],
  // the islet of the spirit: flowers round the tree
  ['flowers', 6.7, -25.35, 0, 0.8],
  ['flowers', 4.55, -26.4, 0, 0.7],
  ['flowers', 6.6, -28.4, 0, 0.7],
].map((d) => Object.freeze(d)));

/**
 * Fishing spots. Standing inside (circle r, or the rect `area`) shows the cast hint; the float lands in the water in front (`face`).
 * water = the water-zone tag for later gear / depth rules: shallow | reeds | deep | pier.
 */
export const SPOTS = Object.freeze([
  { id: 'pier', x: 3.0, z: -10.6, r: 1.6, area: LAYOUT.fishSpot, face: [0, -1], water: 'pier', name: { fr: 'Bout du ponton', en: 'End of the pier' } },
  { id: 'cove', x: -4.5, z: -0.95, r: 1.1, face: [0, -1], water: 'shallow', name: { fr: 'Anse aux galets', en: 'Pebble cove' } },
  { id: 'east', x: 12.6, z: 0.3, r: 1.1, face: [0, -1], water: 'shallow', name: { fr: 'Rive est', en: 'East bank' } },
  { id: 'point', x: -31.2, z: -13.0, r: 1.1, face: [1, 0], water: 'deep', name: { fr: 'Pointe aux pins', en: 'Pine Point' } },
  { id: 'beach', x: 23.4, z: -6.0, r: 1.1, face: [-1, 0], water: 'shallow', name: { fr: 'Plage du village', en: 'Village beach' } },
  { id: 'boardwalk', x: -17.5, z: -14.2, r: 1.2, face: [0, -1], water: 'reeds', name: { fr: 'Bout du caillebotis', en: 'End of the boardwalk' } },
  { id: 'jetty', x: 23.2, z: -14.0, r: 1.0, face: [-1, 0], water: 'deep', name: { fr: 'Embarcadère', en: 'Boat landing' } },
  { id: 'islet', x: 8.6, z: -27.0, r: 1.0, face: [1, 0], water: 'deep', name: { fr: 'Rive de l’îlot', en: 'Islet shore' } }, // J12-B: on the islet, reached by boat
].map((s) => Object.freeze(s)));

/** Zones: name shown when entering; `at` = a point that must be reachable from the start (except the islet). */
export const ZONES = Object.freeze([
  { id: 'cabin', x: -1, z: 4, r: 11, at: LAYOUT.playerStart, reachable: true, name: { fr: 'La cabane et le ponton', en: 'The cabin and the pier' } },
  { id: 'village', x: 26, z: 18, r: 13, at: [22.0, 15.6], reachable: true, name: { fr: 'Le village', en: 'The village' } },
  { id: 'reeds', x: -21, z: -9, r: 8, at: [-17.5, -14.0], reachable: true, name: { fr: 'La roselière', en: 'The reed shallows' } },
  { id: 'forest', x: -30, z: 18, r: 14, at: [-30, 24], reachable: true, name: { fr: 'La forêt de pins', en: 'The pine forest' } },
  { id: 'landing', x: 30, z: -10, r: 8, at: [27.0, -13.9], reachable: true, name: { fr: 'L’embarcadère', en: 'The boat landing' } },
  { id: 'islet', x: LAKE.islet.x, z: LAKE.islet.z, r: 5, at: [LAKE.islet.x + 1.5, LAKE.islet.z + 1.5], reachable: false, name: { fr: 'L’îlot de l’esprit', en: 'The islet of the spirit' } },
].map((z) => Object.freeze(z)));

/**
 * Villagers (J12-A: Mme Ondine, Capitaine Roseau and Pomme can be talked to, see data/story.js; the others are still placeholders; a name tag when near). Each walks slowly back and forth along `route` (points on the paths),
 * pausing at the ends. look = painter parameters (art/folk.js). Names are roles until the lore milestone names them.
 */
export const VILLAGERS = Object.freeze([
  { id: 'shopkeeper', loop: true, speed: 0.9, route: [[24, 14.2], [21.6, 16.2], [21.8, 20.8], [26.4, 21.0], [27.0, 15.6], [24, 14.2]], look: { hat: 'bonnet', top: '#7a8ad0', skirt: true, hair: '#8a4a3a' }, name: { fr: 'Mme Ondine, boutiquière', en: 'Mme Ondine, shopkeeper' } },
  { id: 'sailor', speed: 0.5, route: [[33.0, -13.9], [33.6, -10.0], [35.2, -5.0]], look: { hat: 'cap', top: '#3a5a8a', beard: true, hair: '#d8d8e0' }, name: { fr: 'Capitaine Roseau', en: 'Captain Roseau' } },
  { id: 'child', speed: 1.1, route: [[20.5, 14.6], [19.0, 9.6], [14.5, 6.8], [10.4, 4.4], [5.5, 3.0]], look: { hat: 'none', top: '#e8b84a', small: true, hair: '#3a2420' }, name: { fr: 'Pomme', en: 'Pomme' } },
  { id: 'repairer', speed: 0.8, route: [[28.6, 16.8], [33.5, 17.0], [38.5, 17.0], [39.5, 12.0]], look: { hat: 'beret', top: '#8a5a3a', apron: true, hair: '#2a2a2a' }, name: { fr: 'Le réparateur', en: 'The repairer' } },
  { id: 'forager', speed: 0.8, route: [[-8.0, 11.2], [-12.0, 12.2], [-16.0, 13.5], [-21.0, 17.0], [-26.0, 21.0]], look: { hat: 'scarf', top: '#6a8a4a', skirt: true, hair: '#c87a4a' }, name: { fr: 'La cueilleuse', en: 'The forager' } },
  { id: 'walker', speed: 0.85, route: [[-2.0, 3.4], [-5.5, 2.4], [-9.0, 2.2], [-12.5, 2.0], [-15.6, 0.6], [-18.0, 0.0]], look: { hat: 'wide', top: '#a04a5a', hair: '#5a3a2a' }, name: { fr: 'Le promeneur', en: 'The walker' } },
].map((v) => Object.freeze(v)));

/**
 * Scatter rules for the generated vegetation (logic/mapgen.js): [type, count, region, min spacing, scale range, extra].
 * Regions: rect {x0,x1,z0,z1}; `outside: true` = only outside the walkable boundary (ridges, far bank: decoration, no collision needed);
 * `water: true` = in the water (reeds, lily pads); `land` (default) = on dry land at least `shore` metres from the water.
 */
export const SCATTER = Object.freeze([
  { type: 'pine', n: 150, rect: { x0: -47, x1: -13, z0: 4, z1: 36 }, gap: 2.3, s: [0.9, 1.5], avoid: 'clearing' },
  { type: 'pine', n: 26, rect: { x0: -47, x1: -30, z0: -20, z1: 4 }, gap: 2.6, s: [0.9, 1.4] },
  { type: 'pine', n: 22, rect: { x0: 36, x1: 46, z0: -20, z1: 34 }, gap: 2.8, s: [0.9, 1.4] },
  { type: 'pine', n: 18, rect: { x0: -10, x1: 12, z0: 21, z1: 36 }, gap: 2.8, s: [0.9, 1.5] },
  { type: 'pine', n: 230, rect: { x0: -72, x1: 72, z0: -80, z1: 58 }, gap: 2.6, s: [1.0, 1.7], outside: true },
  { type: 'bush', n: 70, rect: { x0: -47, x1: 46, z0: -20, z1: 36 }, gap: 2.0, s: [0.7, 1.15] },
  { type: 'fern', n: 260, rect: { x0: -47, x1: -12, z0: -20, z1: 36 }, gap: 0.9, s: [0.7, 1.3], noCollide: true },
  { type: 'mushroom', n: 70, rect: { x0: -46, x1: -13, z0: 4, z1: 35 }, gap: 0.7, s: [0.7, 1.3], noCollide: true },
  { type: 'rock', n: 34, rect: { x0: -47, x1: 46, z0: -20, z1: 36 }, gap: 3.0, s: [0.35, 0.8] },
  { type: 'rock', n: 60, rect: { x0: -72, x1: 72, z0: -80, z1: 58 }, gap: 3.0, s: [0.8, 2.0], outside: true },
  { type: 'reeds', n: 46, rect: { x0: -29, x1: -12, z0: -18, z1: -3 }, gap: 1.4, s: [0.8, 1.3], water: true, noCollide: true },
  { type: 'reeds', n: 24, rect: { x0: -32, x1: 32, z0: -50, z1: 2 }, gap: 2.5, s: [0.7, 1.1], water: true, edge: 1.6, noCollide: true },
  { type: 'lily', n: 28, rect: { x0: -27, x1: -12, z0: -18, z1: -4 }, gap: 1.2, s: [0.35, 0.6], water: true, noCollide: true },
  { type: 'lily', n: 16, rect: { x0: -30, x1: 30, z0: -48, z1: 0 }, gap: 2.0, s: [0.35, 0.55], water: true, edge: 3.5, noCollide: true },
  { type: 'stump', n: 8, rect: { x0: -46, x1: -14, z0: 5, z1: 35 }, gap: 1.6, s: [0.7, 1.1] },
].map((s) => Object.freeze(s)));

/** Seed of the generated vegetation. */
export const MAP_SEED = 8;

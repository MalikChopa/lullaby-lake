// Cosmetic decor of the world (round 2 of the art pass): camp life, firewood, a washing line, flower beds, hedges, pots... They are DRAWN ONLY:
// no collision, no nav grid, no gameplay. Because the player can walk through them, every item is kept clear of the paths, the fishing spots,
// the door fronts, the decks, the solid props, the fences, the villagers' routes and the story points: `decorClear` is the one rule (the world
// places only what passes it; tests/refonte-art-r2.test.js asserts that the hand-placed list of data/map.js passes it too).
// Pure and deterministic: no DOM, no three.js.

import { DECOR, PATHS, SPOTS, BUILDINGS, FENCES, VILLAGERS, BOUNDS } from '../data/map.js';
import { CABIN_POINTS } from '../data/story.js';
import { POINTS } from '../data/challenge.js';
import { heightAt, landDist, distToPolyline, deckAt } from './terrain.js';
import { allProps, propRadius, distToBox, buildingBoxes, fenceBoxes } from './mapgen.js';

const hash2 = (x, z) => {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** Door fronts: the point where the angler stands to use each door, per building (the cabin door, the shop and the workshop, every house). */
export function doorFronts() {
  return BUILDINGS.map((b) => {
    const fz = b.d / 2;
    const lx = b.type === 'cabin' ? 1.1 : b.type === 'shop' ? 0 : b.type === 'workshop' ? -0.6 : b.w * 0.22;
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const lz = fz + 1.0;
    return { id: b.id, x: b.x + lx * c + lz * s, z: b.z - lx * s + lz * c, r: b.type === 'cabin' ? 1.3 : b.type === 'house' ? 0.8 : 1.2 };
  });
}

/**
 * The circles a decor item covers on the ground ({ x, z, r }), by kind. d = [kind, x, z, rot, scale].
 * kinds: campfire (fire + log seats), tent, rack (fish drying frame), bedroll, bucket, chopblock (stump + axe), woodpile, washline (two posts, a line,
 * scale = its length), oar, rainbarrel, crates, flowers (a bed, scale = radius), hedge (scale = length, along rot), cart, pot, steps, banner.
 */
export function decorCircles(d) {
  const [k, x, z, rot = 0, s = 1] = d;
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  switch (k) {
    case 'campfire':
      return [{ x, z, r: 1.55 * s }];
    case 'tent':
      return [{ x, z, r: 1.3 * s }];
    case 'rack':
      return [{ x, z, r: 1.0 * s }];
    case 'bedroll':
      return [{ x, z, r: 0.5 * s }];
    case 'bucket':
    case 'pot':
      return [{ x, z, r: 0.22 * s }];
    case 'chopblock':
      return [{ x, z, r: 0.45 * s }];
    case 'woodpile':
      return [{ x, z, r: 0.6 * s }];
    case 'oar':
      return [{ x, z, r: 0.22 }];
    case 'rainbarrel':
      return [{ x, z, r: 0.38 * s }];
    case 'crates':
      return [{ x, z, r: 0.75 * s }];
    case 'cart':
      return [{ x, z, r: 1.0 * s }];
    case 'flowers':
      return [{ x, z, r: s }];
    case 'banner':
      return [{ x, z, r: 0.2 }];
    case 'steps':
      return [{ x, z, r: 0.4 * s }];
    case 'washline': {
      // the line runs along (cos rot, -sin rot) for `s` metres from the first post: two posts and a few circles along the rope
      const out = [];
      const n = Math.max(2, Math.round(s / 0.6));
      for (let i = 0; i <= n; i++) out.push({ x: x + (c * s * i) / n, z: z - (sn * s * i) / n, r: i === 0 || i === n ? 0.2 : 0.12 });
      return out;
    }
    case 'hedge': {
      const out = [];
      const n = Math.max(1, Math.round(s / 0.8));
      for (let i = 0; i < n; i++) out.push({ x: x + (c * s * (i + 0.5 - n / 2)) / n, z: z - (sn * s * (i + 0.5 - n / 2)) / n, r: 0.32 });
      return out;
    }
    default:
      return [{ x, z, r: 0.5 * s }];
  }
}

/** The patch of bare earth under a decor item (the camp does not sink into the tall grass): { r metres, a strength 0..1 } or null. */
export function decorGround(d) {
  const s = d[4] || 1;
  switch (d[0]) {
    case 'campfire':
      return { r: 2.6 * s, a: 0.9 };
    case 'tent':
      return { r: 2.1 * s, a: 0.85 };
    case 'rack':
      return { r: 1.7 * s, a: 0.85 };
    case 'cart':
      return { r: 1.7 * s, a: 0.75 };
    case 'crates':
      return { r: 1.0 * s, a: 0.65 };
    case 'woodpile':
      return { r: 1.0 * s, a: 0.7 };
    case 'chopblock':
      return { r: 0.9 * s, a: 0.7 };
    default:
      return null;
  }
}

/** Kinds that stand against a wall (their circle may touch the building they lean on; they still may not sit inside it). */
export const TOUCH_KINDS = Object.freeze(new Set(['woodpile', 'oar', 'rainbarrel', 'hedge', 'pot', 'flowers', 'bucket']));

const doors = doorFronts();
let solids = null;
let boxes = null;
let fences = null;
const routes = VILLAGERS.map((v) => v.route);

/**
 * Is the circle (x, z, r) free for a purely cosmetic item? `touch` = may touch the walls (a hedge, a woodpile). Returns '' when free, else the reason.
 */
export function circleClear(x, z, r, touch = false) {
  if (!solids) {
    solids = allProps().filter((p) => propRadius(p) > 0);
    boxes = buildingBoxes();
    fences = fenceBoxes();
  }
  if (x < BOUNDS.x0 + 1 || x > BOUNDS.x1 - 1 || z < BOUNDS.z0 + 1 || z > BOUNDS.z1 - 1) return 'bounds';
  const h = heightAt(x, z);
  if (h < 0.12 || landDist(x, z) < r + 0.3) return 'water';
  if (deckAt(x, z, -(r + 0.3))) return 'deck';
  for (const p of PATHS) if (distToPolyline(x, z, p.pts) < p.w + r + 0.2) return 'path ' + p.id;
  for (const sp of SPOTS) {
    if (Math.hypot(x - sp.x, z - sp.z) < sp.r + r + 0.6) return 'spot ' + sp.id;
    if (sp.area && x > sp.area.x0 - r - 0.6 && x < sp.area.x1 + r + 0.6 && z > sp.area.z0 - r - 0.6 && z < sp.area.z1 + r + 0.6) return 'spot ' + sp.id;
  }
  for (const b of boxes) {
    const d = distToBox(x, z, b);
    if (touch ? d < 0.04 : d < r) return 'building ' + b.id;
  }
  for (const dr of doors) if (Math.hypot(x - dr.x, z - dr.z) < dr.r + r * 0.6) return 'door ' + dr.id;
  for (const p of solids) if (Math.hypot(x - p.x, z - p.z) < propRadius(p) + r + 0.1) return 'prop ' + p.type;
  for (const f of fences) if (distToBox(x, z, f) < r + 0.25) return 'fence';
  for (const rt of routes) if (distToPolyline(x, z, rt) < r + 0.7) return 'route';
  for (const cp of CABIN_POINTS) if (Math.hypot(x - cp.x, z - cp.z) < cp.r + r) return 'story point ' + cp.id;
  if (Math.hypot(x - POINTS.board.x, z - POINTS.board.z) < POINTS.board.useDistance + r) return 'board';
  void FENCES;
  return '';
}

/** Is the whole decor item free? Returns '' or the reason. */
export function decorClear(d) {
  const touch = TOUCH_KINDS.has(d[0]);
  for (const c of decorCircles(d)) {
    const why = circleClear(c.x, c.z, c.r, touch);
    if (why) return why;
  }
  return '';
}

/**
 * The decor drawn round the village houses, made from the data of data/map.js BUILDINGS: a flower bed at the front corner, two pots by the door, a low hedge
 * along each side wall. Items that would meet a path, a prop, another building... are dropped (decorClear). Deterministic.
 */
export function houseDecor() {
  const out = [];
  for (const b of BUILDINGS) {
    if (b.type === 'cabin') continue;
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const at = (lx, lz) => [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
    const fz = b.d / 2;
    const doorX = b.type === 'shop' ? 0 : b.type === 'workshop' ? -0.6 : b.w * 0.22;
    const items = [];
    // a flower bed in each front corner that is not the door side, pots on both sides of the door
    for (const sx of [-1, 1]) {
      const lx = sx * (b.w / 2 - 0.45);
      if (Math.abs(lx - doorX) < 1.55) continue;
      const [x, z] = at(lx, fz + 0.5);
      items.push(['flowers', x, z, 0, 0.42 + 0.1 * hash2(x, z)]);
    }
    for (const dx of [-1.25, 1.25]) {
      const [x, z] = at(doorX + dx, fz + 0.32);
      items.push(['pot', x, z, 0, 1]);
    }
    // a low hedge along each side wall (the apron's edge), not on the door front
    for (const sx of [-1, 1]) {
      const [x, z] = at(sx * (b.w / 2 + 0.38), -0.2);
      items.push(['hedge', x, z, b.rot + Math.PI / 2, Math.max(1.6, b.d - 1.2)]);
    }
    for (const it of items) if (!decorClear(it)) out.push(it);
  }
  return out;
}

let cache = null;
/** Every decor item of the world: the hand-placed list (data/map.js DECOR) and the generated house decor. */
export function allDecor() {
  if (!cache) cache = Object.freeze([...DECOR, ...houseDecor()]);
  return cache;
}

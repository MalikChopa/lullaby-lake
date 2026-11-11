// Walking collisions on the ground plane (x, z). Pure: no DOM, no three.js.
// The walker is a circle of radius r. Blockers: circles (trees, rocks, lamps, barrels...), oriented boxes (buildings, fences, stalls,
// benches, crates...), the water (except on a deck), the natural boundary (cliffs) and the world bounds. Shapes live in a spatial hash
// (4 m cells) so a test costs a handful of checks whatever the size of the world.
// A blocked move slides: along x, along z, or along the tangent of the circle it met; long moves are cut in sub-steps of at most 0.15 m
// (no tunnelling, whatever the frame time or the game speed).

import { LAYOUT, PLAYER_RADIUS } from '../data/params.js';
import { BOUNDS } from '../data/map.js';
import { landDist, onPier, boundaryDist, onIslet } from './terrain.js';
import { allProps, PROP_SHAPES, buildingBoxes, fenceBoxes } from './mapgen.js';

/** Minimum distance kept from the water line (metres). */
export const SHORE_MARGIN = 0.35;
const CELL = 4;

/** Point inside a circle grown by r. */
export function hitCircle(x, z, c, r) {
  const dx = x - c.x;
  const dz = z - c.z;
  const R = c.r + r;
  return dx * dx + dz * dz < R * R;
}

/** Point inside an axis-aligned rectangle grown by r. */
export function hitRect(x, z, b, r) {
  return x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r;
}

/** Point inside an oriented box { x, z, hw, hd, rot } grown by r (rounded corners). */
export function hitBox(x, z, b, r) {
  const c = b.c ?? Math.cos(b.rot);
  const s = b.s ?? Math.sin(b.rot);
  const dx = x - b.x;
  const dz = z - b.z;
  const lx = Math.abs(dx * c - dz * s) - b.hw;
  const lz = Math.abs(dx * s + dz * c) - b.hd;
  if (lx > r || lz > r) return false;
  if (lx > 0 && lz > 0) return lx * lx + lz * lz < r * r;
  return true;
}

function hashShapes(shapes) {
  const cells = new Map();
  for (const sh of shapes) {
    const R = sh.r !== undefined ? sh.r : Math.hypot(sh.hw, sh.hd);
    sh.R = R;
    for (let i = Math.floor((sh.x - R - 1) / CELL); i <= Math.floor((sh.x + R + 1) / CELL); i++)
      for (let j = Math.floor((sh.z - R - 1) / CELL); j <= Math.floor((sh.z + R + 1) / CELL); j++) {
        const k = i * 4096 + j;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(sh);
      }
  }
  return cells;
}

/**
 * Builds the collision world from the map data (or, for J7-style tests, from a layout-like object with pines / rocks / lamp / cabin /
 * fence: then only those). Returns { circles, boxes, rects (axis-aligned view of the boxes with rot 0), bounds, cells }.
 */
export function buildWorld(L = null) {
  const circles = [];
  const boxes = [];
  if (L && L !== LAYOUT) {
    for (const [x, z, s] of L.pines) circles.push({ x, z, r: 0.45 * s, kind: 'pine' });
    for (const [x, z, s] of L.rocks) circles.push({ x, z, r: 0.75 * s, kind: 'rock' });
    circles.push({ x: L.lamp.x, z: L.lamp.z, r: 0.18, kind: 'lamp' });
    const c = L.cabin;
    boxes.push({ kind: 'cabin', x: c.x, z: c.z, hw: c.w / 2, hd: c.d / 2, rot: 0 });
  } else {
    for (const p of allProps()) {
      const sh = PROP_SHAPES[p.type];
      if (!sh) continue;
      if (sh.c !== undefined) circles.push({ x: p.x, z: p.z, r: sh.c * p.s, kind: p.type });
      else boxes.push({ kind: p.type, x: p.x, z: p.z, hw: (sh.w * p.s) / 2, hd: (sh.d * p.s) / 2, rot: p.rot });
    }
    for (const b of buildingBoxes()) boxes.push(b);
    for (const f of fenceBoxes()) boxes.push(f);
  }
  for (const b of boxes) {
    b.c = Math.cos(b.rot);
    b.s = Math.sin(b.rot);
  }
  const rects = boxes.filter((b) => b.rot === 0).map((b) => ({ x0: b.x - b.hw, x1: b.x + b.hw, z0: b.z - b.hd, z1: b.z + b.hd, kind: b.kind }));
  return { circles, boxes, rects, bounds: BOUNDS, cells: hashShapes([...circles, ...boxes]) };
}

/** The decks (union of their rectangles) hold the whole circle: its centre and its 4 extreme points are on a deck. */
export function pierHolds(x, z, r) {
  return onPier(x, z) && onPier(x - r, z) && onPier(x + r, z) && onPier(x, z - r) && onPier(x, z + r);
}

/**
 * At a deck: the circle touches a deck and its centre and 4 extreme points are each on a deck or on dry land (seamless joints between
 * a deck and the shore; still nobody walks off the side of a deck into the water).
 */
export function deckSupports(x, z, r) {
  const pts = [[x, z], [x - r, z], [x + r, z], [x, z - r], [x, z + r]];
  let deck = false;
  for (const [px, pz] of pts) {
    const on = onPier(px, pz);
    if (on) deck = true;
    else if (landDist(px, pz) <= 0.05) return false;
  }
  return deck;
}

/** The shape blocking (x, z) for a circle of radius r, or a string reason ('bounds' | 'water' | 'cliff'), or null when free. */
export function blockerAt(x, z, world, r = PLAYER_RADIUS) {
  const B = world.bounds;
  if (x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1) return 'bounds';
  if (!deckSupports(x, z, r)) {
    // the water blocks unless the circle stands on a deck, every edge point on the deck or on land (nobody walks off its sides)
    if (landDist(x, z) < SHORE_MARGIN) return 'water';
    if (boundaryDist(x, z) > -r && !onIslet(x, z, 1)) return 'cliff';
  }
  const cell = world.cells.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL));
  if (!cell) return null;
  for (const sh of cell) {
    if (sh.hw !== undefined ? hitBox(x, z, sh, r) : hitCircle(x, z, sh, r)) return sh;
  }
  return null;
}

/** Why (x, z) cannot be stood on by a circle of radius r: null when free, else 'bounds' | 'water' | 'cliff' | the blocker kind. */
export function blockedBy(x, z, world, r = PLAYER_RADIUS) {
  const b = blockerAt(x, z, world, r);
  return b === null ? null : typeof b === 'string' ? b : b.kind;
}

/**
 * Moves (x, z) by (dx, dz) with sliding. Long moves are cut in sub-steps of at most 0.15 m so nothing is tunnelled.
 * @returns {{x:number, z:number, blocked:string|null}} blocked = the last obstacle met (null when the move was free)
 */
export function move(x, z, dx, dz, world, r = PLAYER_RADIUS) {
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(len / 0.15));
  const sx = dx / n;
  const sz = dz / n;
  let blocked = null;
  for (let i = 0; i < n; i++) {
    const full = blockerAt(x + sx, z + sz, world, r);
    if (!full) {
      x += sx;
      z += sz;
      continue;
    }
    blocked = typeof full === 'string' ? full : full.kind;
    if (sx && !blockerAt(x + sx, z, world, r)) x += sx;
    else if (sz && !blockerAt(x, z + sz, world, r)) z += sz;
    else if (typeof full !== 'string' && full.hw === undefined) {
      // a circle met head-on: slide along its tangent (no sticking on round things)
      let nx = x - full.x;
      let nz = z - full.z;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl;
      nz /= nl;
      const t = sx * -nz + sz * nx;
      const tx = -nz * t;
      const tz = nx * t;
      if ((tx || tz) && !blockerAt(x + tx, z + tz, world, r)) {
        x += tx;
        z += tz;
      }
    }
  }
  return { x, z, blocked };
}

/** Nearest free point around (x, z) (rings of 0.1 m up to `maxR`), or null. Used after a teleport and by the villagers. */
export function unstick(x, z, world, r = PLAYER_RADIUS, maxR = 4) {
  if (!blockerAt(x, z, world, r)) return { x, z };
  for (let d = 0.1; d <= maxR; d += 0.1) {
    const n = Math.max(8, Math.round(d * 12));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      if (!blockerAt(px, pz, world, r)) return { x: px, z: pz };
    }
  }
  return null;
}

/** Standing in the J7 fishing spot at the end of the pier. */
export function inFishSpot(x, z, L = LAYOUT) {
  const f = L.fishSpot;
  return x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1;
}

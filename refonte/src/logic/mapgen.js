// The full prop list of the world, from data/map.js: the J7 props (LAYOUT), the hand-placed props, and the scattered vegetation
// (seeded rejection sampling: on land / in the water as asked, off the paths, the decks, the spots, the buildings and the areas, spaced).
// Pure and deterministic (same data + seed = same list); cached. No DOM, no three.js.

import { LAYOUT } from '../data/params.js';
import { PROPS, SCATTER, BUILDINGS, PATHS, AREAS, SPOTS, DECKS, FENCES, MAP_SEED } from '../data/map.js';
import { mulberry32 } from '../../../src/core/rng.js';
import { landDist, boundaryDist, distToPolyline, deckAt, onIslet } from './terrain.js';

/**
 * Collision footprint of each prop type: { c: radius factor } (circle, radius = c x scale) or { w, d } (oriented box, sizes x scale),
 * or null (walk-through: ferns, mushrooms, reeds, lily pads, the boat on the water).
 */
export const PROP_SHAPES = Object.freeze({
  pine: { c: 0.45 },
  tree: { c: 0.5 },
  bush: { c: 0.55 },
  rock: { c: 0.75 },
  stump: { c: 0.4 },
  log: { w: 1.8, d: 0.5 },
  lamp: { c: 0.18 },
  well: { c: 1.0 },
  stall: { w: 2.4, d: 1.3 },
  bench: { w: 1.5, d: 0.55 },
  barrel: { c: 0.36 },
  crate: { w: 0.7, d: 0.7 },
  sign: { c: 0.16 },
  net: { w: 2.2, d: 0.4 },
  spiritTree: { c: 0.6 },
  boat: null,
  fern: null,
  mushroom: null,
  reeds: null,
  lily: null,
});

/** Radius of the footprint (circle radius, or half diagonal of the box). */
export function propRadius(p) {
  const sh = PROP_SHAPES[p.type];
  if (!sh) return 0;
  return sh.c !== undefined ? sh.c * p.s : 0.5 * Math.hypot(sh.w, sh.d) * p.s;
}

/** Instance budget per prop type (tests keep the world inside it: draw cost and memory stay bounded). */
export const PROP_BUDGET = Object.freeze({ pine: 520, tree: 20, bush: 110, rock: 120, stump: 16, log: 6, lamp: 12, well: 2, stall: 3, bench: 6, barrel: 12, crate: 12, sign: 6, net: 3, spiritTree: 1, boat: 2, fern: 300, mushroom: 90, reeds: 90, lily: 60, total: 1400 });

const make = (type, x, z, rot, s, v, extra) => Object.freeze({ type, x, z, rot, s, v, ...extra });

/** Footprints of the buildings as boxes (half sizes, rotation). */
export function buildingBoxes() {
  return BUILDINGS.map((b) => ({ id: b.id, kind: b.id === 'cabin' ? 'cabin' : b.type, x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2, rot: b.rot }));
}

/** Fence segments as thin boxes. */
export function fenceBoxes() {
  const out = [];
  for (const f of FENCES)
    for (let i = 0; i < f.length - 1; i++) {
      const [ax, az] = f[i];
      const [bx, bz] = f[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      out.push({ kind: 'fence', x: (ax + bx) / 2, z: (az + bz) / 2, hw: len / 2, hd: 0.08, rot: Math.atan2(-(bz - az), bx - ax) });
    }
  return out;
}

/** Distance from a point to an oriented box (0 inside). */
export function distToBox(x, z, b) {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  const dx = x - b.x;
  const dz = z - b.z;
  const lx = Math.abs(dx * c - dz * s) - b.hw;
  const lz = Math.abs(dx * s + dz * c) - b.hd;
  return Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
}

let cache = null;

/** Every prop of the world (frozen objects { type, x, z, rot, s, v, src }). src = 'j7' | 'placed' | 'scatter'. */
export function allProps() {
  if (cache) return cache;
  const list = [];
  // J7 zone, as it was
  LAYOUT.pines.forEach(([x, z, s], i) => list.push(make('pine', x, z, i * 1.3, s, i % 3, { src: 'j7' })));
  for (const [x, z, s] of LAYOUT.rocks) list.push(make('rock', x, z, 0, s, 0, { src: 'j7' }));
  for (const [x, z, k] of LAYOUT.reeds) list.push(make('reeds', x, z, 0, 1, k, { src: 'j7' }));
  for (const [x, z, r] of LAYOUT.lilies) list.push(make('lily', x, z, 0, r, 0, { src: 'j7' }));
  for (const [type, x, z, rot, s, v] of PROPS) list.push(make(type, x, z, rot, s, v, { src: 'placed' }));

  // scattered vegetation
  const boxes = [...buildingBoxes(), ...fenceBoxes()];
  const grid = new Map(); // spacing hash of the colliding props (2 m cells)
  const key = (x, z) => Math.floor(x / 2) + ',' + Math.floor(z / 2);
  const addHash = (p) => {
    const k = key(p.x, p.z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  };
  for (const p of list) addHash(p);
  const tooClose = (x, z, gap, small) => {
    const gx = Math.floor(x / 2);
    const gz = Math.floor(z / 2);
    const R = Math.ceil(gap / 2);
    for (let i = -R; i <= R; i++)
      for (let j = -R; j <= R; j++) {
        const cell = grid.get(gx + i + ',' + (gz + j));
        if (!cell) continue;
        for (const q of cell) {
          const small2 = q.type === 'fern' || q.type === 'mushroom' || q.type === 'reeds' || q.type === 'lily';
          if (small !== small2) {
            // a fern may grow near a pine, never inside its trunk
            if (Math.hypot(q.x - x, q.z - z) < Math.max(propRadius(q), 0.35) + 0.25) return true;
            continue;
          }
          if (Math.hypot(q.x - x, q.z - z) < gap) return true;
        }
      }
    return false;
  };
  SCATTER.forEach((rule, ri) => {
    const rng = mulberry32(MAP_SEED * 1000 + ri);
    const R = rule.rect;
    const small = rule.type === 'fern' || rule.type === 'mushroom' || rule.type === 'reeds' || rule.type === 'lily';
    let n = 0;
    for (let tries = 0; n < rule.n && tries < rule.n * 40; tries++) {
      const x = R.x0 + rng() * (R.x1 - R.x0);
      const z = R.z0 + rng() * (R.z1 - R.z0);
      const s = rule.s[0] + rng() * (rule.s[1] - rule.s[0]);
      const rot = rng() * Math.PI * 2;
      const v = Math.floor(rng() * 3);
      const ld = landDist(x, z);
      if (rule.water) {
        if (ld > -0.4 || ld < -(rule.edge || 4.5)) continue;
        if (onIslet(x, z, 1.5)) continue;
      } else {
        if (ld < 1.4) continue;
        const b = boundaryDist(x, z);
        if (rule.outside ? b < 1.2 || onIslet(x, z, 3) : b > -1.0) continue;
      }
      if (deckAt(x, z, -1.0)) continue;
      const pr = PROP_SHAPES[rule.type] ? (PROP_SHAPES[rule.type].c || 0.5) * s : 0.3;
      let bad = false;
      for (const p of PATHS) if (distToPolyline(x, z, p.pts) < p.w + pr + 0.35) bad = true;
      if (bad) continue;
      for (const sp of SPOTS) if (Math.hypot(x - sp.x, z - sp.z) < sp.r + pr + (rule.water ? 3.0 : 1.2)) bad = true;
      if (bad) continue;
      for (const b of boxes) if (distToBox(x, z, b) < pr + 1.0) bad = true;
      if (bad) continue;
      for (const a of AREAS) {
        const keep = a.kind === 'cobble' || a.kind === 'clearing' ? (rule.type === 'fern' || rule.type === 'mushroom' ? -1.5 : 0.8) : a.kind === 'flowers' && !small ? 0.4 : -99;
        if (Math.hypot(x - a.x, z - a.z) < a.r + keep) bad = true;
      }
      if (bad) continue;
      if (tooClose(x, z, rule.gap, small)) continue;
      const p = make(rule.type, x, z, rot, s, v, { src: 'scatter' });
      list.push(p);
      addHash(p);
      n++;
    }
  });
  // decks are kept clear, the spots too (checked in the tests)
  void DECKS;
  cache = Object.freeze(list);
  return cache;
}

// Fishing spots: which spot the angler stands on, and where a cast lands (always in the water in front of the spot). Pure.

import { SPOTS } from '../data/map.js';
import { landDist } from './terrain.js';

/** The spot under (x, z), or null. A spot is a circle (r) or, for the pier end, the J7 rectangle (area). */
export function spotAt(x, z, spots = SPOTS) {
  for (const s of spots) {
    if (s.area) {
      const a = s.area;
      if (x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1) return s;
    } else if (Math.hypot(x - s.x, z - s.z) <= s.r) return s;
  }
  return null;
}

/**
 * Where the float lands for a cast of power u (0..1) from (x, z) at a spot: along the spot's facing, 2.6 to 8 m out (the J7 range),
 * pushed farther until the water is at least 0.5 m deep under it (never on land, never under a deck edge).
 * @param {number} [reach] rod reach multiplier of the 2.6-8 m range (1 = the starting rod)
 * @returns {[number, number]} x, z
 */
export function castLanding(x, z, spot, u, reach = 1) {
  const [fx, fz] = spot.face;
  // the rod hand is a little to the right of the facing (as in J7: +0.35 on x when facing north)
  const ox = x + -fz * 0.35;
  const oz = z + fx * 0.35;
  let d = 0.6 + (2.6 + Math.max(0, Math.min(1, u)) * 5.4) * reach; // J10: a better rod (reach > 1) throws farther
  let px = ox + fx * d;
  let pz = oz + fz * d;
  for (let i = 0; i < 40 && landDist(px, pz) > -0.9; i++) {
    d += 0.25;
    px = ox + fx * d;
    pz = oz + fz * d;
  }
  return [px, pz];
}

/** Where the reeled-in float comes back to: just in front of the angler, on the water side. */
export function reelPoint(x, z, spot) {
  const [fx, fz] = spot.face;
  return [x + -fz * 0.35 + fx * 1.0, z + fx * 0.35 + fz * 1.0];
}

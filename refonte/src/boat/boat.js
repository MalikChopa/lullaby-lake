// The boat (J12-B), pure: no DOM, no three.js, no clock, no random. Two parts.
//  1) the SAVED state  { owned: boolean, at: 'landing' | 'pier' | 'islet' }  (where the moored boat lies) + validation, migration v4 -> v5, a small store;
//  2) the ROWING state (runtime only)  { x, z, hx, hz, v }  and rowStep(): slow, smooth, bounded by the shores and the decks with a soft edge (the boat slows and
//     turns along the edge, never stops dead, cannot leave the water), docks, spots, and the get-on / get-off rules.
// The boat cannot sink, capsize, run out of anything or get lost: from any place in the water, an input away from the edge always moves it away (tested).

import { DOCKS, DOCK_IDS, DOCK_REACH, ROW, BOAT_SPOTS } from '../data/boat.js';
import { DECKS, BOUNDS } from '../data/map.js';
import { landDist } from '../logic/terrain.js';

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// ---------------------------------------------------------------------------------------------------- saved state
export const newBoat = () => ({ owned: false, at: 'landing' });
export const cloneBoat = (b) => ({ owned: !!b.owned, at: b.at });
export function validateBoat(b) {
  const e = [];
  if (!isObj(b)) return ['boat'];
  if (typeof b.owned !== 'boolean') e.push('boat.owned');
  if (!DOCK_IDS.includes(b.at)) e.push('boat.at');
  return e;
}
/** Migration v4 -> v5 of the HD-2D save: the boat is not owned yet (it lies at the landing). Everything else is kept. */
export const migrateV4toV5 = (save) => ({ ...save, v: 5, boat: newBoat() });

/** A small store for the saved state (listeners are told about every change). */
export function createBoatStore(initial) {
  let st = initial && validateBoat(initial).length === 0 ? cloneBoat(initial) : newBoat();
  let rev = 0;
  const ls = [];
  const emit = (type) => {
    rev++;
    for (const f of ls.slice()) {
      try {
        f({ type }, st);
      } catch {
        /* a failing listener must not break the boat */
      }
    }
  };
  return {
    get: () => st,
    rev: () => rev,
    on: (fn) => ls.push(fn),
    load(next) {
      if (validateBoat(next).length) return false;
      st = cloneBoat(next);
      emit('load');
      return true;
    },
    /** The boat becomes the player's (once). */
    own() {
      if (st.owned) return false;
      st = { ...st, owned: true };
      emit('owned');
      return true;
    },
    /** The moored boat lies at this dock now. */
    moor(at) {
      if (!DOCK_IDS.includes(at) || st.at === at) return false;
      st = { ...st, at };
      emit('moor');
      return true;
    },
  };
}

// ---------------------------------------------------------------------------------------------------- the water the boat may cross
const rectDist = (x, z, r) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

/** Free water around (x, z): metres to the nearest shore (minus the shore pad) or deck (minus the deck pad); >= 0 = the boat may be here. */
export function edgeOf(x, z) {
  let e = -landDist(x, z) - ROW.shorePad;
  for (const d of DECKS) e = Math.min(e, rectDist(x, z, d) - ROW.deckPad);
  const B = BOUNDS;
  e = Math.min(e, x - B.x0 - 1, B.x1 - x - 1, z - B.z0 - 1, B.z1 - z - 1);
  return e;
}
export const inBoatWater = (x, z) => edgeOf(x, z) >= 0;

function gradient(x, z) {
  const h = 0.4;
  return [(edgeOf(x + h, z) - edgeOf(x - h, z)) / (2 * h), (edgeOf(x, z + h) - edgeOf(x, z - h)) / (2 * h)];
}
const smooth = (a) => (a <= 0 ? 0 : a >= 1 ? 1 : a * a * (3 - 2 * a));

// ---------------------------------------------------------------------------------------------------- docks
/** A moored pose at a dock: { x, z, hx, hz, v: 0 }. */
export function moored(at) {
  const d = DOCKS[at] || DOCKS.landing;
  return { x: d.boat[0], z: d.boat[1], hx: d.heading[0], hz: d.heading[1], v: 0 };
}
/** The model rotation (radians about y) of a heading: the bow is +x in the model, and a rotation r maps it to (cos r, -sin r). */
export const rotOf = (hx, hz) => Math.atan2(-hz, hx);

/** The docks the angler may use now (the islet waits for its flag). flags = story flags object. */
export const usableDocks = (flags) => DOCK_IDS.filter((id) => !DOCKS[id].needs || !!(flags && flags[DOCKS[id].needs]));

/** The dock whose "climb in" place the angler stands at (the boat must lie there), or null. */
export function boardingDock(boat, px, pz, flags) {
  if (!boat.owned) return null;
  const d = DOCKS[boat.at];
  if (!d || !usableDocks(flags).includes(boat.at)) return null;
  return Math.hypot(px - d.stand[0], pz - d.stand[1]) <= d.r ? d.id : null;
}
/** The dock a rowing boat may get off at (within DOCK_REACH of its mooring point), nearest first; null when none. */
export function landingDock(row, flags) {
  let best = null;
  let bd = DOCK_REACH;
  for (const id of usableDocks(flags)) {
    const d = DOCKS[id];
    const dist = Math.hypot(row.x - d.boat[0], row.z - d.boat[1]);
    if (dist <= bd) {
      bd = dist;
      best = id;
    }
  }
  return best;
}
/** The dock nearest to a point (for saving a position while rowing: the boat is moored there, nothing lost). */
export function nearestDock(x, z, flags) {
  let best = 'landing';
  let bd = Infinity;
  for (const id of usableDocks(flags)) {
    const d = DOCKS[id];
    const dist = Math.hypot(x - d.boat[0], z - d.boat[1]);
    if (dist < bd) {
      bd = dist;
      best = id;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------- rowing
/** The named deep spot under a point (the first circle that contains it; the last covers everything). */
export function boatSpotAt(x, z) {
  return BOAT_SPOTS.find((s) => Math.hypot(x - s.x, z - s.z) <= s.r) || BOAT_SPOTS[BOAT_SPOTS.length - 1];
}

/**
 * One step of rowing. input = { ix, iz } in WORLD axes (already turned by the camera), length 0..1. Returns the new { x, z, hx, hz, v }.
 * The boat turns toward the wanted direction at turnRate, speeds up toward maxSpeed x |input| x (how well it points), and slows down smoothly otherwise.
 * Near the edge it slows (never below minSpeedK of its speed) and is pushed gently back inside along the gradient; a move that would leave the water is cut
 * to the part that stays inside, then slides; the boat can always row away from an edge.
 */
export function rowStep(s, input, dt, opt = {}) {
  const maxSpeed = (opt.maxSpeed ?? ROW.maxSpeed);
  let { x, z, hx, hz, v } = s;
  const il = Math.hypot(input.ix, input.iz);
  if (il > 0.1) {
    const wx = input.ix / il;
    const wz = input.iz / il;
    // turn toward (wx, wz) at a limited rate
    const cur = Math.atan2(hz, hx);
    const want = Math.atan2(wz, wx);
    let diff = want - cur;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const turn = Math.max(-ROW.turnRate * dt, Math.min(ROW.turnRate * dt, diff));
    const a = cur + turn;
    hx = Math.cos(a);
    hz = Math.sin(a);
    const point = Math.max(0, Math.cos(diff)); // pointing away from where it wants to go: it slows, then turns
    const target = maxSpeed * Math.min(1, il) * (0.25 + 0.75 * point);
    v += Math.max(-ROW.accel * 1.6 * dt, Math.min(ROW.accel * dt, target - v));
  } else {
    v = Math.max(0, v - ROW.drag * dt * (0.4 + v / maxSpeed));
  }
  const e0 = edgeOf(x, z);
  const k = ROW.minSpeedK + (1 - ROW.minSpeedK) * smooth(e0 / ROW.softEdge);
  let dx = hx * v * k * dt;
  let dz = hz * v * k * dt;
  if (e0 < ROW.softEdge) {
    // a gentle push back inside, stronger the closer to the edge (also when there is no input: it drifts away from the shore)
    const g = gradient(x, z);
    const gl = Math.hypot(g[0], g[1]) || 1;
    const p = ROW.push * (1 - Math.max(0, e0) / ROW.softEdge) * dt;
    dx += (g[0] / gl) * p;
    dz += (g[1] / gl) * p;
  }
  let nx = x + dx;
  let nz = z + dz;
  if (edgeOf(nx, nz) < 0 && edgeOf(nx, nz) < e0) {
    // would go farther out: slide along x, then z, else stay (the speed fades, the boat turns with the input and leaves)
    if (edgeOf(x + dx, z) >= 0 || edgeOf(x + dx, z) >= e0) {
      nx = x + dx;
      nz = z;
    } else if (edgeOf(x, z + dz) >= 0 || edgeOf(x, z + dz) >= e0) {
      nx = x;
      nz = z + dz;
    } else {
      nx = x;
      nz = z;
    }
    v *= Math.max(0, 1 - 4 * dt);
  }
  return { x: nx, z: nz, hx, hz, v };
}

/** The wanted direction (an input vector) toward a tapped water point; null when arrived. */
export function steerTo(s, tx, tz, arrive = 0.7) {
  const d = Math.hypot(tx - s.x, tz - s.z);
  if (d < arrive) return null;
  const k = Math.min(1, 0.35 + d / 6);
  return { ix: ((tx - s.x) / d) * k, iz: ((tz - s.z) / d) * k };
}

/** A point of the water near (x, z) that the boat may be at (rings), or null. For taps on the land or out of reach. */
export function nearestBoatWater(x, z, maxR = 6) {
  if (inBoatWater(x, z)) return [x, z];
  for (let d = 0.5; d <= maxR; d += 0.5) {
    const n = Math.max(8, Math.round(d * 6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      if (inBoatWater(px, pz)) return [px, pz];
    }
  }
  return null;
}

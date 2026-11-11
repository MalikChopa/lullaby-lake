// Villagers' wander: each one walks slowly along its route (points on the paths), back and forth (or round a loop), pausing at the
// ends and now and then at a bend. Deterministic: same seed + same inputs = same walk. They avoid the angler: they slow down and step
// aside (never more than MAX_SIDE metres off their route, so they stay on the path), or wait when he stands right in front.
// Pure: no DOM, no three.js.

import { mulberry32 } from '../../../src/core/rng.js';

/** Largest sideways step off the route (metres): smaller than the half width of every path a route uses. */
export const MAX_SIDE = 0.5;
const NEAR = 1.6; // the angler closer than this (and ahead) -> step aside
const STOP = 0.75; // closer than this, right in front -> wait

/** Cumulative lengths of a polyline. */
function lengths(pts) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return L;
}

/** Point and unit direction at arc length s of the polyline. */
export function along(pts, L, s) {
  s = Math.max(0, Math.min(L[L.length - 1], s));
  let i = 1;
  while (i < L.length - 1 && L[i] < s) i++;
  const seg = L[i] - L[i - 1] || 1;
  const t = (s - L[i - 1]) / seg;
  const dx = (pts[i][0] - pts[i - 1][0]) / seg;
  const dz = (pts[i][1] - pts[i - 1][1]) / seg;
  return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, z: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t, dx, dz, node: t > 0.999 ? i : t < 0.001 ? i - 1 : -1 };
}

/**
 * @param {{route: number[][], speed: number, loop?: boolean}} v villager data (data/map.js VILLAGERS)
 * @param {number} seed
 */
export function createWanderer(v, seed) {
  const rng = mulberry32(seed);
  const pts = v.route;
  const L = lengths(pts);
  const total = L[L.length - 1];
  const st = {
    s: rng() * total, // start somewhere along the route
    dir: 1,
    wait: rng() * 2,
    side: 0,
    lastNode: -1,
    x: 0,
    z: 0,
    fx: 0,
    fz: 1,
    moving: false,
  };
  const place = () => {
    const a = along(pts, L, st.s);
    // the sideways axis is the right-hand side of the route direction
    st.x = a.x - a.dz * st.side;
    st.z = a.z + a.dx * st.side;
    return a;
  };
  place();
  return {
    state: st,
    total,
    /**
     * One step. `player` = { x, z } or null. Returns the state (x, z, facing fx/fz, moving).
     */
    step(dt, player) {
      let a = along(pts, L, st.s);
      const fx = a.dx * st.dir;
      const fz = a.dz * st.dir;
      let speed = v.speed;
      let sideGoal = 0;
      if (player) {
        const px = player.x - st.x;
        const pz = player.z - st.z;
        const d = Math.hypot(px, pz);
        const ahead = px * fx + pz * fz; // > 0: the angler is in front
        if (d < NEAR && ahead > -0.2) {
          const lat = px * -a.dz + pz * a.dx; // angler's offset to the right of the route
          sideGoal = lat > 0 ? -MAX_SIDE : MAX_SIDE;
          speed *= 0.45;
          if (d < STOP && ahead > 0) speed = 0;
        }
      }
      st.side += Math.max(-dt * 1.2, Math.min(dt * 1.2, sideGoal - st.side));
      st.side = Math.max(-MAX_SIDE, Math.min(MAX_SIDE, st.side));
      if (st.wait > 0) {
        st.wait -= dt;
        st.moving = false;
      } else if (speed > 0) {
        st.s += st.dir * speed * dt;
        st.moving = true;
        if (v.loop) {
          if (st.s >= total) st.s -= total;
          if (st.s < 0) st.s += total;
        } else if (st.s >= total || st.s <= 0) {
          st.s = Math.max(0, Math.min(total, st.s));
          st.dir = -st.dir;
          st.wait = 2 + rng() * 3;
        }
        a = along(pts, L, st.s);
        if (a.node > 0 && a.node < pts.length - 1 && a.node !== st.lastNode) {
          st.lastNode = a.node;
          if (rng() < 0.3) st.wait = 1 + rng() * 2;
        }
      } else st.moving = false;
      st.fx = a.dx * st.dir;
      st.fz = a.dz * st.dir;
      place();
      return st;
    },
  };
}

// Terrain of the lake world as pure functions: the shore (J7 near shore line + the lake ellipse + the islet), the ground height (lake bed,
// shallows, gentle hills, cliffs outside the walkable boundary), the decks, the paths. Pure: no DOM, no three.js, no random.
// The J7 names are kept (shoreZ, shoreDist, heightAt, isWater, pathAmount, onPier) and still describe the J7 zone exactly.

import { WATER_Y } from '../data/params.js';
import { LAKE, BOUNDARY, DECKS, PATHS, AREAS } from '../data/map.js';

export const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** z of the J7 near shore at x: the water is north of it (z smaller). A gentle wavy line. */
export function shoreZ(x) {
  return -0.9 + 1.1 * Math.sin(x * 0.21 + 0.6) + 0.45 * Math.sin(x * 0.53 + 1.3);
}

/** Polynomial smooth maximum (k = blend width in metres). */
function smax(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + (h * h * k) / 4;
}

/** Signed distance to the lake ellipse (with its wobble), > 0 outside (land side). Approximated by f / |grad f|. */
export function ellipseDist(x, z, L = LAKE) {
  const u = (x - L.cx) / L.ax;
  const v = (z - L.cz) / L.az;
  const rho = Math.hypot(u, v);
  const th = Math.atan2(v, u);
  let wob = 1;
  for (const [a, k, ph] of L.wobble) wob += a * Math.sin(k * th + ph);
  if (rho < 1e-6) return -Math.min(L.ax, L.az) * wob;
  const g = Math.hypot(u / L.ax, v / L.az) / rho;
  return (rho - wob) / g;
}

/**
 * Signed distance to the water (metres): > 0 on land, < 0 in the water. Lake = north of the J7 near shore AND inside the ellipse
 * (smooth corner), plus the islet as land.
 */
export function landDist(x, z) {
  const d = smax(z - shoreZ(x), ellipseDist(x, z), 1.0);
  const I = LAKE.islet;
  return Math.max(d, I.r - Math.hypot(x - I.x, z - I.z));
}

/** J7 name: signed distance from the shore, > 0 on land. (In the J7 zone it equals z - shoreZ(x).) */
export function shoreDist(x, z) {
  return landDist(x, z);
}

/** Point in polygon (even-odd). */
export function inPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from a point to the segment a-b. */
export function distToSegment(x, z, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)) : 0;
  return Math.hypot(x - (ax + t * vx), z - (az + t * vz));
}

/** Signed distance to the walkable boundary polygon: < 0 inside, > 0 outside. */
export function boundaryDist(x, z, poly = BOUNDARY) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distToSegment(x, z, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
  return inPolygon(x, z, poly) ? -d : d;
}

/** On the islet (or its beach). */
export function onIslet(x, z, margin = 0) {
  const I = LAKE.islet;
  return Math.hypot(x - I.x, z - I.z) < I.r + margin;
}

const smallBumps = (x, z) => 0.07 * Math.sin(x * 0.7 + 0.3) * Math.sin(z * 0.55 + 1.1) + 0.04 * Math.sin(x * 1.9 + z * 1.3);
const hills = (x, z) => 0.55 * Math.sin(x * 0.11 + 1.0) * Math.sin(z * 0.09 + 0.4) + 0.3 * Math.sin(x * 0.23 - z * 0.17 + 2.0);
const PLAZA = AREAS.find((a) => a.id === 'plaza');
let plazaH = null;

function landHeight(x, z, d) {
  const dd = Math.min(d, 22);
  let h = 0.12 + 0.05 * dd + smallBumps(x, z) * Math.min(1, d / 3) + 0.004 * dd * dd * (d > 8 ? 1 : d / 8);
  // rolling hills away from the J7 zone (the J7 slice keeps its exact ground)
  h += hills(x, z) * smooth01((Math.hypot(x, z - 5) - 18) / 12) * smooth01(d / 6);
  return h;
}

/** Ground height at (x, z): beach and lake bed, shallows in the reed bay, hills, flat plaza, cliffs and ridges outside the boundary. */
export function heightAt(x, z) {
  const d = landDist(x, z);
  if (d >= 0) {
    let h = landHeight(x, z, d);
    const I = LAKE.islet;
    const di = I.r - Math.hypot(x - I.x, z - I.z);
    if (di > 0) h += I.top * smooth01(di / 2.5);
    if (PLAZA) {
      const k = smooth01((PLAZA.r + 1.5 - Math.hypot(x - PLAZA.x, z - PLAZA.z)) / 2);
      if (k > 0) {
        if (plazaH === null) plazaH = landHeight(PLAZA.x, PLAZA.z, landDist(PLAZA.x, PLAZA.z));
        h += (plazaH - h) * k;
      }
    }
    if (!onIslet(x, z, 2)) {
      const b = boundaryDist(x, z);
      if (b > -0.5) {
        const bb = b + 0.5;
        h += 3.6 * smooth01(bb / 2.8) + 3.0 * smooth01((bb - 3.5) / 9) + (0.5 * Math.sin(x * 0.9 + z * 0.4) + 0.35 * Math.sin(z * 1.3 - x * 0.2)) * smooth01(bb / 2);
      }
    }
    return h;
  }
  let h = Math.max(-1.1, 0.12 + d * 0.55);
  const S = LAKE.shallows;
  const k = smooth01((S.r - Math.hypot(x - S.x, z - S.z)) / 3);
  if (k > 0 && h < S.minDepth) h += (S.minDepth - h) * k;
  return h;
}

/** True where the ground is under the water level. */
export function isWater(x, z) {
  return heightAt(x, z) < WATER_Y;
}

/** Distance from (x, z) to a polyline [[x, z], ...]. */
export function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, distToSegment(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return best;
}

/** 0..1 share of path ground (1 on the path, soft wavy edge) of one path. */
export function pathShare(x, z, p) {
  const d = distToPolyline(x, z, p.pts);
  const w = p.w * (1 + 0.18 * Math.sin(x * 2.3 + z * 1.7));
  return Math.max(0, Math.min(1, (w + 0.25 - d) / 0.5));
}

/** 0..1 share of dirt (J7 name; all dirt paths of the world). */
export function pathAmount(x, z) {
  let a = 0;
  for (const p of PATHS) if (p.kind === 'dirt') a = Math.max(a, pathShare(x, z, p));
  return a;
}

/** 0..1 share of cobbles (cobbled street and plaza). */
export function cobbleAmount(x, z) {
  let a = 0;
  for (const p of PATHS) if (p.kind === 'cobble') a = Math.max(a, pathShare(x, z, p));
  for (const ar of AREAS) if (ar.kind === 'cobble') a = Math.max(a, Math.min(1, (ar.r - Math.hypot(x - ar.x, z - ar.z)) / 0.35 + 0.5));
  return Math.max(0, Math.min(1, a));
}

/** The deck under (x, z) (shrink > 0 = only well inside), or null. */
export function deckAt(x, z, shrink = 0) {
  for (const r of DECKS) if (x >= r.x0 + shrink && x <= r.x1 - shrink && z >= r.z0 + shrink && z <= r.z1 - shrink) return r;
  return null;
}

/** Inside one of the deck rectangles (J7 name: the pier; now every deck: pier, boardwalk, jetty). */
export function onPier(x, z, shrink = 0) {
  return deckAt(x, z, shrink) !== null;
}

/** Height of the feet at (x, z): the deck if standing on one, else the ground. */
export function feetHeight(x, z) {
  const d = deckAt(x, z, -0.05);
  return d ? d.y : heightAt(x, z);
}


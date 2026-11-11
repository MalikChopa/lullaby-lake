// Navigation grid for tap-to-walk, built FROM the collision data (a cell is walkable when a walker of radius r can stand at its centre),
// A* path search (8 neighbours, no corner cutting), then string pulling (line of sight on the grid) for a smooth path, and a flood fill
// for the reachability checks (every zone reachable from the start, the islet not). Pure: no DOM, no three.js.

import { PLAYER_RADIUS } from '../data/params.js';
import { blockerAt } from './collide.js';

/**
 * @param {object} world logic/collide.js buildWorld()
 * @param {{cell?: number, r?: number}} [o] cell size (m) and walker radius
 */
export function buildNav(world, o = {}) {
  const cell = o.cell || 0.5;
  const r = o.r ?? PLAYER_RADIUS + NAV_CLEARANCE; // a little more than the walker: the legs between cell centres keep clear of corners
  const B = world.bounds;
  const nx = Math.round((B.x1 - B.x0) / cell);
  const nz = Math.round((B.z1 - B.z0) / cell);
  const walk = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) navRow(walk, world, B, cell, nx, j, r);
  return navFrom(B, cell, nx, nz, walk);
}

function navRow(walk, world, B, cell, nx, j, r) {
  for (let i = 0; i < nx; i++) walk[j * nx + i] = blockerAt(B.x0 + (i + 0.5) * cell, B.z0 + (j + 0.5) * cell, world, r) ? 0 : 1;
}

/** The same grid built a few rows at a time: `await pause()` between two slices (a loading screen never freezes). */
export async function buildNavAsync(world, pause, o = {}) {
  const cell = o.cell || 0.5;
  const r = o.r ?? PLAYER_RADIUS + NAV_CLEARANCE;
  const B = world.bounds;
  const nx = Math.round((B.x1 - B.x0) / cell);
  const nz = Math.round((B.z1 - B.z0) / cell);
  const walk = new Uint8Array(nx * nz);
  const t0 = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let t = t0();
  for (let j = 0; j < nz; j++) {
    navRow(walk, world, B, cell, nx, j, r);
    if (t0() - t > (o.sliceMs ?? 8)) {
      await pause();
      t = t0();
    }
  }
  return navFrom(B, cell, nx, nz, walk);
}

function navFrom(B, cell, nx, nz, walk) {
  return {
    cell,
    nx,
    nz,
    x0: B.x0,
    z0: B.z0,
    walk,
    /** Cell index of a world point (-1 outside). */
    idx(x, z) {
      const i = Math.floor((x - B.x0) / cell);
      const j = Math.floor((z - B.z0) / cell);
      return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i;
    },
    centre(k) {
      return [B.x0 + ((k % nx) + 0.5) * cell, B.z0 + (Math.floor(k / nx) + 0.5) * cell];
    },
    free(k) {
      return k >= 0 && walk[k] === 1;
    },
  };
}

/** Extra clearance of the navigation grid over the walker's own radius (metres). */
export const NAV_CLEARANCE = 0.1;

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

/** Neighbours of cell k that can be stepped to (diagonals only when both sides are free: no corner cutting). */
function* neighbours(nav, k) {
  const i = k % nav.nx;
  const j = Math.floor(k / nav.nx);
  for (const [di, dj, c] of DIRS) {
    const a = i + di;
    const b = j + dj;
    if (a < 0 || b < 0 || a >= nav.nx || b >= nav.nz) continue;
    const n = b * nav.nx + a;
    if (!nav.walk[n]) continue;
    if (di && dj && (!nav.walk[j * nav.nx + a] || !nav.walk[b * nav.nx + i])) continue;
    yield [n, c];
  }
}

/** Labels of the connected walkable regions (flood fill). Returns an Int32Array (0 = blocked, 1.. = region). */
export function regions(nav) {
  const lab = new Int32Array(nav.nx * nav.nz);
  let next = 0;
  const stack = [];
  for (let k = 0; k < lab.length; k++) {
    if (!nav.walk[k] || lab[k]) continue;
    next++;
    lab[k] = next;
    stack.push(k);
    while (stack.length) {
      const c = stack.pop();
      for (const [n] of neighbours(nav, c)) {
        if (!lab[n]) {
          lab[n] = next;
          stack.push(n);
        }
      }
    }
  }
  return lab;
}

/** Nearest walkable cell to (x, z) within `maxR` metres (spiral by rings), or -1. */
export function nearestFree(nav, x, z, maxR = 3) {
  const k0 = nav.idx(x, z);
  if (nav.free(k0)) return k0;
  const i0 = Math.floor((x - nav.x0) / nav.cell);
  const j0 = Math.floor((z - nav.z0) / nav.cell);
  const R = Math.ceil(maxR / nav.cell);
  let best = -1;
  let bestD = Infinity;
  for (let ring = 1; ring <= R; ring++) {
    for (let a = -ring; a <= ring; a++)
      for (const [i, j] of [[i0 + a, j0 - ring], [i0 + a, j0 + ring], [i0 - ring, j0 + a], [i0 + ring, j0 + a]]) {
        if (i < 0 || j < 0 || i >= nav.nx || j >= nav.nz) continue;
        const k = j * nav.nx + i;
        if (!nav.walk[k]) continue;
        const [cx, cz] = nav.centre(k);
        const d = Math.hypot(cx - x, cz - z);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
    if (best >= 0) return best;
  }
  return -1;
}

/** Straight line between two points over walkable cells only (sampled every quarter cell). */
export function lineFree(nav, ax, az, bx, bz) {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(len / (nav.cell * 0.25)));
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    if (!nav.free(nav.idx(ax + (bx - ax) * t, az + (bz - az) * t))) return false;
  }
  return true;
}

/** Binary heap of [priority, value]. */
function heap() {
  const a = [];
  return {
    get size() {
      return a.length;
    },
    push(p, v) {
      a.push([p, v]);
      let i = a.length - 1;
      while (i > 0) {
        const pa = (i - 1) >> 1;
        if (a[pa][0] <= a[i][0]) break;
        [a[pa], a[i]] = [a[i], a[pa]];
        i = pa;
      }
    },
    pop() {
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < a.length && a[l][0] < a[m][0]) m = l;
          if (r < a.length && a[r][0] < a[m][0]) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]];
          i = m;
        }
      }
      return top[1];
    },
  };
}

/**
 * Path from (fx, fz) to (tx, tz). The goal snaps to the nearest walkable cell within `snap` metres (a tap on a wall or the water walks
 * next to it). Returns { found, pts: [[x, z], ...] (after the start, ending at the goal), cells (expanded), goal: [x, z], raw (the
 * cell centres before string pulling) }.
 */
export function findPath(nav, fx, fz, tx, tz, o = {}) {
  const snap = o.snap ?? 3;
  let s = nav.idx(fx, fz);
  if (!nav.free(s)) s = nearestFree(nav, fx, fz, 1.5);
  const g = nearestFree(nav, tx, tz, snap);
  if (s < 0 || g < 0) return { found: false, pts: [], cells: 0, goal: null };
  const exact = nav.free(nav.idx(tx, tz));
  const goal = exact ? [tx, tz] : nav.centre(g);
  if (s === g) return { found: true, pts: [goal], cells: 0, goal };
  const N = nav.nx * nav.nz;
  const cost = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const [gx, gz] = nav.centre(g);
  const h = (k) => {
    const [x, z] = nav.centre(k);
    const dx = Math.abs(x - gx) / nav.cell;
    const dz = Math.abs(z - gz) / nav.cell;
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz); // octile
  };
  const open = heap();
  cost[s] = 0;
  open.push(h(s), s);
  let expanded = 0;
  const limit = o.limit || N;
  const closed = new Uint8Array(N);
  while (open.size) {
    const c = open.pop();
    if (closed[c]) continue; // a stale heap entry (the node was reached again more cheaply)
    closed[c] = 1;
    if (c === g) break;
    if (++expanded > limit) break;
    for (const [n, w] of neighbours(nav, c)) {
      const nc = cost[c] + w;
      if (nc < cost[n]) {
        cost[n] = nc;
        from[n] = c;
        open.push(nc + h(n), n);
      }
    }
  }
  if (from[g] < 0) return { found: false, pts: [], cells: expanded, goal };
  const cells = [];
  for (let k = g; k !== s; k = from[k]) cells.push(k);
  cells.reverse();
  const raw = cells.map((k) => nav.centre(k));
  raw[raw.length - 1] = goal;
  const rawPts = raw.slice();
  // string pulling: from each kept point, jump to the farthest point still in line of sight
  const pts = [];
  let ax = fx;
  let az = fz;
  let i = 0;
  while (i < raw.length) {
    let j = raw.length - 1;
    while (j > i && !lineFree(nav, ax, az, raw[j][0], raw[j][1])) j--;
    pts.push(raw[j]);
    [ax, az] = raw[j];
    i = j + 1;
  }
  return { found: true, pts, cells: expanded, goal, raw: rawPts };
}

/** Length of a path from (x, z) through pts. */
export function pathLength(x, z, pts) {
  let L = 0;
  for (const [px, pz] of pts) {
    L += Math.hypot(px - x, pz - z);
    x = px;
    z = pz;
  }
  return L;
}

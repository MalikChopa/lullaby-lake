// Pure logic of the interior rooms (no DOM, no three.js; tested under Node): the small walking grid, a path finder, which pieces show for the state of the
// story, the pick of what the angler stands near. Rooms come from data/interiors.js; the angler stands at the positions of the interactables.

export const CELL = 0.25;
export const WALL_MARGIN = 0.3;
const PAD = 0.18; // the angler's radius against furniture

/** Does a story condition hold? when: undefined | { couplet: n } (n or more couplets found) | { finale: true } | { always: true }. st = { couplet, finale }. */
export function holds(when, st = {}) {
  if (!when || when.always) return true;
  if (when.couplet !== undefined && (st.couplet || 0) < when.couplet) return false;
  if (when.finale && !st.finale) return false;
  return true;
}
export const activeProps = (room, st) => room.props.filter((q) => holds(q.when, st));
export const activeLights = (room, st) => room.lights.filter((l) => holds(l.when, st));

/** The half sizes of a prop's footprint after its turn (a quarter turn swaps width and depth). */
export function footprintHalf(prop) {
  const [w, d] = prop.fp;
  const quarter = Math.abs(Math.sin(prop.rot || 0)) > 0.7;
  return quarter ? [d / 2, w / 2] : [w / 2, d / 2];
}

/** The walking grid of a room: blocked cells = outside the walls margin, inside a furniture footprint (grown by the angler's radius). */
export function buildInteriorNav(room) {
  const nx = Math.round(room.w / CELL);
  const nz = Math.round(room.d / CELL);
  const blocked = new Uint8Array(nx * nz);
  const solids = room.props.filter((q) => q.fp);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = (i + 0.5) * CELL;
      const z = (j + 0.5) * CELL;
      let b = x < WALL_MARGIN || z < WALL_MARGIN || x > room.w - WALL_MARGIN || z > room.d - WALL_MARGIN;
      if (!b)
        for (const q of solids) {
          const [hx, hz] = footprintHalf(q);
          if (Math.abs(x - q.x) < hx + PAD && Math.abs(z - q.z) < hz + PAD) {
            b = true;
            break;
          }
        }
      blocked[j * nx + i] = b ? 1 : 0;
    }
  return { nx, nz, blocked, w: room.w, d: room.d, idx: (x, z) => Math.max(0, Math.min(nz - 1, Math.floor(z / CELL))) * nx + Math.max(0, Math.min(nx - 1, Math.floor(x / CELL))) };
}
export const isFree = (nav, x, z) => x >= 0 && z >= 0 && x < nav.w && z < nav.d && !nav.blocked[nav.idx(x, z)];

/** The nearest free cell centre to (x, z) within `r` metres, or null. */
export function snap(nav, x, z, r = 1.0) {
  if (isFree(nav, x, z)) return [x, z];
  let best = null;
  let bd = Infinity;
  for (let j = 0; j < nav.nz; j++)
    for (let i = 0; i < nav.nx; i++) {
      if (nav.blocked[j * nav.nx + i]) continue;
      const cx = (i + 0.5) * CELL;
      const cz = (j + 0.5) * CELL;
      const d = Math.hypot(cx - x, cz - z);
      if (d < bd && d <= r) [best, bd] = [[cx, cz], d];
    }
  return best;
}

/** 8-connected A* on the grid. Returns the list of [x, z] points (cell centres, ends replaced by the exact points) or null when unreachable. */
export function findPath(nav, from, to) {
  const a = snap(nav, from[0], from[1]);
  const b = snap(nav, to[0], to[1]);
  if (!a || !b) return null;
  const { nx, nz, blocked } = nav;
  const cell = (p) => [Math.floor(p[0] / CELL), Math.floor(p[1] / CELL)];
  const [ai, aj] = cell(a);
  const [bi, bj] = cell(b);
  const key = (i, j) => j * nx + i;
  const g = new Map([[key(ai, aj), 0]]);
  const from_ = new Map();
  const open = [[Math.hypot(ai - bi, aj - bj), ai, aj]];
  const done = new Set();
  while (open.length) {
    let k = 0;
    for (let n = 1; n < open.length; n++) if (open[n][0] < open[k][0]) k = n;
    const [, i, j] = open.splice(k, 1)[0];
    if (i === bi && j === bj) {
      const pts = [];
      let c = key(i, j);
      while (c !== undefined) {
        pts.push([((c % nx) + 0.5) * CELL, (Math.floor(c / nx) + 0.5) * CELL]);
        c = from_.get(c);
      }
      pts.reverse();
      pts[0] = [a[0], a[1]];
      pts[pts.length - 1] = [b[0], b[1]];
      return pts;
    }
    if (done.has(key(i, j))) continue;
    done.add(key(i, j));
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz || blocked[key(ni, nj)]) continue;
        if (di && dj && (blocked[key(i + di, j)] || blocked[key(i, j + dj)])) continue; // no corner cutting
        const cost = g.get(key(i, j)) + (di && dj ? 1.414 : 1);
        if (cost < (g.get(key(ni, nj)) ?? Infinity)) {
          g.set(key(ni, nj), cost);
          from_.set(key(ni, nj), key(i, j));
          open.push([cost + Math.hypot(ni - bi, nj - bj), ni, nj]);
        }
      }
  }
  return null;
}

/** The interactable the angler stands at (nearest within its radius + `slack`), or null. */
export function pickInteractable(room, x, z, slack = 0.35) {
  let best = null;
  let bd = Infinity;
  for (const it of room.interactables) {
    const d = Math.hypot(x - it.x, z - it.z);
    if (d < it.r + slack && d < bd) [best, bd] = [it, d];
  }
  return best;
}

/** The exit: the point in front of the door, and whether (x, z) is close enough to leave. */
export function exitPoint(room) {
  return [room.door.x, 0.6];
}
export const atExit = (room, x, z, slack = 0.55) => Math.hypot(x - room.door.x, z - 0.6) < slack + room.door.w / 2;

/** Every problem of a room's data (for the tests and the preview page); [] when sound. */
export function roomProblems(room) {
  const out = [];
  const nav = buildInteriorNav(room);
  const at = (what, p) => (isFree(nav, p[0], p[1]) ? null : `${what} at (${p[0]}, ${p[1]}) is not on a walkable cell`);
  for (const q of room.props) {
    if (!(q.x >= 0 && q.x <= room.w && q.z >= 0 && q.z <= room.d)) out.push(`prop ${q.m || q.kind} outside the room`);
  }
  const spawn = at('spawn', room.spawn);
  if (spawn) out.push(spawn);
  const route = (what, p) => {
    const bad = at(what, p);
    if (bad) return out.push(bad);
    if (!findPath(nav, room.spawn, p)) out.push(`${what} is not reachable from the spawn`);
  };
  route('exit', exitPoint(room));
  for (const it of room.interactables) route('interactable ' + it.id, [it.x, it.z]);
  return out;
}

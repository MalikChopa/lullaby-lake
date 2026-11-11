// Room coherence (brief 31): where each piece of a room really is once its model is placed, what it stands on, and every placement problem
// (a piece through a wall, a door or a window, two pieces in each other, something floating or sunk, a lamp light with no lamp). Pure: no three.js,
// no DOM; the models come from world/models.js (getModel / stamp work under Node once the .glb files are registered with setModel).
//
//   const pieces = placeRoom(room, story, getModel, stamp)   -> [{ i, prop, id, box: { minX, maxX, minZ, maxZ, minY, topY }, up: [[ax, az, ay, bx, bz, by, cx, cz, cy], ...] }]
//   layoutProblems(room, pieces)                              -> [] when sound, else readable sentences
//
// Conventions of data/interiors.js props used here:
//   wall: 'n' | 'w'   the piece hangs on (or leans against) that wall: it may float above the floor, it must touch the wall
//   on:   index       (optional) the index of the piece it rests on; otherwise any up-facing surface under its centre is accepted
//   flat: true        a rug or a doormat: lies on the floor, things may stand on it
//   tuck: [indexes]   pieces it may overlap on purpose (a chair pushed under its table, a cushion on a bench)

import { activeProps, activeLights } from './logic.js';
import { CODE_PIECES } from './pieces.js';

export { CODE_PIECES };

const EPS = 0.035;

/** A builder that only records what the room needs to judge a placement: the bounds and the up-facing triangles. */
function captureBuilder() {
  const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, minY: Infinity, topY: -Infinity };
  const up = [];
  const grow = (p) => {
    if (p[0] < box.minX) box.minX = p[0];
    if (p[0] > box.maxX) box.maxX = p[0];
    if (p[2] < box.minZ) box.minZ = p[2];
    if (p[2] > box.maxZ) box.maxZ = p[2];
    if (p[1] < box.minY) box.minY = p[1];
    if (p[1] > box.topY) box.topY = p[1];
  };
  const api = {
    swayOf: null,
    tri(a, b, c) {
      grow(a);
      grow(b);
      grow(c);
      // normal y of the triangle (a, b, c counter-clockwise from the front): keep the faces that look up (a surface to put things on)
      const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
      const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const len = Math.hypot(nx, ny, nz);
      if (len > 1e-9 && ny / len > 0.9) up.push([a[0], a[2], a[1], b[0], b[2], b[1], c[0], c[2], c[1]]);
    },
    quad(a, b, c, d) {
      api.tri(a, b, c);
      api.tri(a, c, d);
    },
    box(x, y, z, w, h, d, _col, ry = 0) {
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      const v = (dx, dy, dz) => [x + dx * c + dz * s, y + dy, z - dx * s + dz * c];
      const hw = w / 2;
      const hd = d / 2;
      const p = [v(-hw, 0, -hd), v(hw, 0, -hd), v(hw, 0, hd), v(-hw, 0, hd), v(-hw, h, -hd), v(hw, h, -hd), v(hw, h, hd), v(-hw, h, hd)];
      for (const q of p) grow(q);
      api.quad(p[4], p[7], p[6], p[5]);
    },
    cyl(x, y0, z, r, h, n) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        grow([x + Math.cos(a) * r, y0, z + Math.sin(a) * r]);
        grow([x + Math.cos(a) * r, y0 + h, z + Math.sin(a) * r]);
      }
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        api.tri([x + Math.cos(a1) * r, y0 + h, z + Math.sin(a1) * r], [x + Math.cos(a0) * r, y0 + h, z + Math.sin(a0) * r], [x, y0 + h, z]);
      }
    },
    cone(x, y0, z, r, h, n, _col, rot = 0) {
      grow([x, y0 + h, z]);
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * Math.PI * 2;
        grow([x + Math.cos(a) * r, y0, z + Math.sin(a) * r]);
      }
    },
  };
  return { api, box, up };
}

/** The stamp options of a prop (the same as interior/room.js draws it). */
export const stampOptions = (q) => ({ x: q.x, y: q.y || 0, z: q.z, rot: q.rot || 0, h: q.h, w: q.w, sx: q.sx, sy: q.sy, sz: q.sz, lean: q.lean || 0, swap: q.swap, roll: q.roll || 0, anchor: q.roll ? 'center' : 'base' });

/** Places every active prop of a room the way room.js draws it and records its bounds and its up-facing surfaces. A model not loaded is skipped (missing: true). */
export function placeRoom(room, story, getModel, stamp) {
  const lin = () => [1, 1, 1];
  const out = [];
  const act = new Set(activeProps(room, story || { couplet: 99, finale: true }));
  room.props.forEach((q, i) => {
    if (!act.has(q)) return;
    const cap = captureBuilder();
    if (q.kind) {
      const paint = CODE_PIECES[q.kind];
      if (!paint) return out.push({ i, prop: q, id: q.kind, missing: true });
      paint(cap.api, q, lin);
    } else {
      const m = getModel(q.m);
      if (!m) return out.push({ i, prop: q, id: q.m, missing: true });
      stamp(cap.api, m, stampOptions(q));
    }
    out.push({ i, prop: q, id: q.m || q.kind, box: cap.box, up: cap.up });
  });
  return out;
}

/** Height of the up-facing surfaces of a piece at (x, z) (all of them: a bookcase has several boards). */
export function surfacesAt(piece, x, z) {
  const hs = [];
  for (const t of piece.up) {
    const [ax, az, ay, bx, bz, by, cx, cz, cy] = t;
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
    const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
    hs.push(l1 * ay + l2 * by + l3 * cy);
  }
  return hs;
}

const overlap1 = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
/** Overlap of two boxes on each axis (metres; negative = apart). */
export function boxOverlap(a, b) {
  return [overlap1(a.minX, a.maxX, b.minX, b.maxX), overlap1(a.minY, a.topY, b.minY, b.topY), overlap1(a.minZ, a.maxZ, b.minZ, b.maxZ)];
}

const label = (p) => `${p.id}#${p.i}`;

/** What a piece rests on: 'floor', 'wall', the index of the piece under it, or null (floating / sunk). Checks the centre and four inner points of its base. */
export function supportOf(room, piece, pieces) {
  const q = piece.prop;
  const b = piece.box;
  if (b.minY < -EPS) return null; // sunk into the floor
  if (q.wall) return touchesWall(room, piece, q.wall) ? 'wall' : null;
  if (b.minY <= EPS) return 'floor';
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const pts = [[cx, cz], [cx + (b.maxX - cx) * 0.4, cz], [cx - (cx - b.minX) * 0.4, cz], [cx, cz + (b.maxZ - cz) * 0.4], [cx, cz - (cz - b.minZ) * 0.4]];
  const cands = q.on !== undefined ? pieces.filter((o) => o.i === q.on) : pieces.filter((o) => o !== piece && o.box && !o.missing);
  for (const o of cands) {
    if (o === piece || !o.box) continue;
    let hits = 0;
    for (const [x, z] of pts) if (surfacesAt(o, x, z).some((h) => Math.abs(h - b.minY) <= EPS)) hits++;
    if (hits >= 1 && surfacesAt(o, cx, cz).some((h) => Math.abs(h - b.minY) <= EPS + 0.02)) return o.i;
  }
  return null;
}

/** Does `piece` rest on a surface of `other` (its base at the height of an up-facing face of `other` under one of five points of its base)? */
export function restsOn(piece, other) {
  const b = piece.box;
  if (!other.up || other === piece) return false;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const pts = [[cx, cz], [cx + (b.maxX - cx) * 0.4, cz], [cx - (cx - b.minX) * 0.4, cz], [cx, cz + (b.maxZ - cz) * 0.4], [cx, cz - (cz - b.minZ) * 0.4]];
  return pts.some(([x, z]) => surfacesAt(other, x, z).some((h) => Math.abs(h - b.minY) <= EPS));
}

/** Does a piece touch (or stand within 6 cm of) a wall: 'n' the back wall z = 0, 'w' the west wall x = 0. */
export function touchesWall(room, piece, wall) {
  const b = piece.box;
  return wall === 'n' ? b.minZ < 0.06 && b.minZ > -0.03 : b.minX < 0.06 && b.minX > -0.03;
}

/** The openings of a room: the door and the windows, as boxes in the room frame (a margin of 10 cm around; the door also keeps the floor in front of it clear). */
export function openings(room) {
  const out = [];
  const d = room.door;
  out.push({ what: 'door', box: { minX: d.x - d.w / 2 - 0.1, maxX: d.x + d.w / 2 + 0.1, minZ: -0.3, maxZ: 0.75, minY: 0.02, topY: d.h + 0.05 } });
  for (const w of room.windows) {
    if (w.wall === 'n') out.push({ what: 'window n@' + w.at, box: { minX: w.at - w.w / 2 - 0.08, maxX: w.at + w.w / 2 + 0.08, minZ: -0.3, maxZ: 0.25, minY: w.y, topY: w.y + w.h } });
    else out.push({ what: 'window w@' + w.at, box: { minX: -0.3, maxX: 0.25, minZ: w.at - w.w / 2 - 0.08, maxZ: w.at + w.w / 2 + 0.08, minY: w.y, topY: w.y + w.h } });
  }
  return out;
}

/** Is a light at a lamp? A lamp light must sit in (or just over) a lamp, lantern or candle piece; a hearth light in a stove, a forge or a fire. */
export const LIGHT_SOURCES = Object.freeze({
  lamp: ['i_lampT', 'i_lampF', 'i_lantern', 'i_lampW', 'lantern'],
  candle: ['candle'],
  hearth: ['stove', 'forge'],
});
export function lightProblems(room, pieces, story) {
  const out = [];
  for (const l of activeLights(room, story || { couplet: 99, finale: true })) {
    const ids = LIGHT_SOURCES[l.kind] || [];
    const hit = pieces.find((p) => p.box && ids.includes(p.id) && l.x >= p.box.minX - 0.12 && l.x <= p.box.maxX + 0.12 && l.z >= p.box.minZ - 0.12 && l.z <= p.box.maxZ + 0.12 && l.y >= p.box.minY - 0.05 && l.y <= p.box.topY + 0.25);
    if (!hit) out.push(`light ${l.kind} at (${l.x}, ${l.y}, ${l.z}) has no ${ids.join('/')} there`);
  }
  return out;
}

/**
 * Every placement problem of a placed room ([] when sound):
 *  - a piece outside the floor or through a wall (the back and west walls are 20 cm thick, behind z = 0 and x = 0);
 *  - a piece in the door, in the floor in front of the door, or across a window (above the sill, against that wall);
 *  - two pieces in each other (boxes overlapping more than 3 cm on every axis), except a piece resting on the other, a rug, or an intended `tuck`;
 *  - a piece that floats or is sunk (its base is not on the floor, on an up-facing surface of another piece, or hung on a wall it touches).
 */
export function layoutProblems(room, pieces, opts = {}) {
  const out = [];
  const tol = opts.tol ?? 0.03;
  const live = pieces.filter((p) => p.box && !p.missing);
  const sup = new Map(live.map((p) => [p, supportOf(room, p, live)]));
  for (const p of live) {
    const b = p.box;
    if (b.minX < -0.03 || b.minZ < -0.03) out.push(`${label(p)} goes through a wall (min x ${b.minX.toFixed(2)}, min z ${b.minZ.toFixed(2)})`);
    if (b.maxX > room.w + 0.02 || b.maxZ > room.d + 0.02) out.push(`${label(p)} sticks out of the floor (max x ${b.maxX.toFixed(2)}, max z ${b.maxZ.toFixed(2)})`);
    if (b.topY > room.wallH) out.push(`${label(p)} is taller than the walls (${b.topY.toFixed(2)} m)`);
    if (sup.get(p) === null) out.push(`${label(p)} ${b.minY < 0 ? 'is sunk into the floor' : 'floats'} (base at ${b.minY.toFixed(2)} m, nothing under it)`);
    if (!p.prop.flat)
      for (const o of openings(room)) {
        const [ox, oy, oz] = boxOverlap(b, o.box);
        if (ox > tol && oy > tol && oz > tol) out.push(`${label(p)} is in the ${o.what}`);
      }
  }
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const c = live[j];
      if (a.prop.flat || c.prop.flat) continue;
      if (sup.get(a) === c.i || sup.get(c) === a.i || restsOn(a, c) || restsOn(c, a)) continue; // an item on two neighbouring surfaces (two counter cabinets)
      if ((a.prop.tuck || []).includes(c.i) || (c.prop.tuck || []).includes(a.i)) continue;
      const [ox, oy, oz] = boxOverlap(a.box, c.box);
      if (ox > tol && oy > tol && oz > tol) out.push(`${label(a)} and ${label(c)} are in each other (${ox.toFixed(2)} x ${oy.toFixed(2)} x ${oz.toFixed(2)} m)`);
    }
  out.push(...lightProblems(room, live, opts.story));
  return out;
}

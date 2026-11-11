// Prop painters: low-poly / voxel shapes with flat colours, made by code into merged builders (world/geo.js). Each painter draws one
// prop of data/map.js into the builders of its chunk: B = { flat, wood, deck, roof, stone, foliage, plaster, dflat, dfoliage } and the
// global glow builders G = { win, lamp, spirit }. ctx = { h(x, z) ground height, rng, occ(name, c, r) -> occluder id, out (lights,
// chimneys, piles) }. The J7 cabin, pier, lamp, fence, rocks, reeds and lily pads are drawn exactly as in J7.

import { lin } from './geo.js';
import { DECK_Y, WATER_Y } from '../data/params.js';
import { SIGN, signUV } from '../art/signs.js';
import * as MP from './modelProps.js';

const PINE_COLS = [
  [lin('#2f6a5a'), lin('#3a7a5e'), lin('#4f8a6a'), lin('#24584e')],
  [lin('#25564e'), lin('#2c6656'), lin('#36745e'), lin('#1c463e')],
  [lin('#46804a'), lin('#55904e'), lin('#68a056'), lin('#386a3e')],
];
const LEAF_COLS = [[lin('#5f9a46'), lin('#76ae50'), lin('#4c843e')], [lin('#8aa848'), lin('#a0bc56'), lin('#6c8c3c')]];
// J9-B: bushes vary with the place (a "season" patchwork): fresh green, yellow-green, autumn russet, dark green in flower
const BUSH_COLS = [
  [lin('#5f9a46'), lin('#76ae50'), lin('#4c843e'), null],
  [lin('#8aa848'), lin('#a0bc56'), lin('#6c8c3c'), null],
  [lin('#b8743e'), lin('#d0904a'), lin('#94582e'), null],
  [lin('#3f7a46'), lin('#4f8a4e'), lin('#336a3c'), [lin('#f6a0b8'), lin('#fff0c0')]],
  [lin('#4c8a52'), lin('#62a05a'), lin('#3c7444'), [lin('#a8b8ff'), lin('#fff6e0')]],
];
const hash2 = (x, z) => {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const TRUNK = lin('#6a4a3a');

/** A prism (n sides) between two points (posts, logs, oars, ribs). */
function prism(b, ax, ay, az, bx, by, bz, r, n, col) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const L = Math.hypot(dx, dy, dz) || 1;
  const d = [dx / L, dy / L, dz / L];
  const up = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]];
  const ul = Math.hypot(...u);
  u = u.map((v) => v / ul);
  const v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  const ring = (cx, cy, cz) =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const c = Math.cos(a) * r;
      const s = Math.sin(a) * r;
      return [cx + u[0] * c + v[0] * s, cy + u[1] * c + v[1] * s, cz + u[2] * c + v[2] * s];
    });
  const A = ring(ax, ay, az);
  const Bq = ring(bx, by, bz);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    b.quad(A[j], A[i], Bq[i], Bq[j], col);
  }
  for (let i = 1; i < n - 1; i++) {
    b.tri(Bq[0], Bq[i], Bq[i + 1], col);
    b.tri(A[0], A[i + 1], A[i], col);
  }
}

/** Low-poly ball (6 segments x 4 rings), squashed by sy. */
function blob(b, x, y, z, r, col, sy = 1, colTop = null, rot = 0) {
  const seg = 6;
  const rings = 4;
  const P = [];
  for (let j = 0; j <= rings; j++) {
    const ph = (j / rings) * Math.PI;
    const row = [];
    for (let i = 0; i < seg; i++) {
      const th = rot + (i / seg) * Math.PI * 2 + (j % 2 ? Math.PI / seg : 0);
      row.push([x + Math.sin(ph) * Math.cos(th) * r, y + Math.cos(ph) * r * sy, z + Math.sin(ph) * Math.sin(th) * r]);
    }
    P.push(row);
  }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < seg; i++) {
      const i2 = (i + 1) % seg;
      const c = j === 0 && colTop ? colTop : col;
      if (j === 0) b.tri(P[0][i], P[1][i2], P[1][i], c);
      else if (j === rings - 1) b.tri(P[j][i], P[j][i2], P[j + 1][i], c);
      else b.quad(P[j][i], P[j][i2], P[j + 1][i2], P[j + 1][i], c);
    }
}

const swayAbove = (y0, h) => (p) => Math.max(0, Math.min(1, (p[1] - y0) / h));

/**
 * J9-B: a pixel-art sign board (art/signs.js atlas) into the global sign builder G.sign, with a plain wooden back in B.wood.
 * (x, y, z) = bottom centre, rot = heading of the front (+z local), w x h metres, tilt = top leaning back (radians, toward the camera).
 */
export function signBoard(B, G, x, y, z, rot, w, h, id, tilt = 0) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  // local (lx, ly up the board, lz out of the board) -> world; the board plane leans back by tilt around its bottom edge
  const at = (lx, ly, lz) => {
    const yy = ly * ct + lz * st;
    const zz = -ly * st + lz * ct;
    return [x + lx * c + zz * s, y + yy, z - lx * s + zz * c];
  };
  const [u0, v0, u1, v1] = signUV(SIGN.ids[id] ?? id);
  const hw = w / 2;
  // front picture (slightly in front of the back board)
  G.sign.quadUV(at(-hw, 0, 0.035), at(hw, 0, 0.035), at(hw, h, 0.035), at(-hw, h, 0.035), [1, 1, 1], [u0, v1], [u1, v1], [u1, v0], [u0, v0]);
  // back and edges: a thin wooden box following the same lean
  const back = lin('#7a5640');
  const P = [at(-hw, 0, 0), at(hw, 0, 0), at(hw, h, 0), at(-hw, h, 0), at(-hw, 0, -0.06), at(hw, 0, -0.06), at(hw, h, -0.06), at(-hw, h, -0.06)];
  B.wood.quad(P[5], P[4], P[7], P[6], back);
  B.wood.quad(P[3], P[2], P[6], P[7], back);
  B.wood.quad(P[1], P[5], P[6], P[2], back);
  B.wood.quad(P[4], P[0], P[3], P[7], back);
  B.wood.quad(P[0], P[4], P[5], P[1], back);
}

// ------------------------------------------------------------------ vegetation
export function pine(B, p, ctx, lod = false) {
  if (MP.pine(B, p, ctx, lod)) return;
  const b = B.foliage;
  const s = p.s;
  const y = ctx.h(p.x, p.z) - 0.1;
  const cols = PINE_COLS[p.v % 3];
  const id = lod ? 0 : ctx.occ('pine', [p.x, y + 2.2 * s, p.z], 1.5 * s);
  b.occ = id;
  B.wood.occ = id;
  const n = lod ? 5 : 7;
  b.swayOf = swayAbove(y + 1.2 * s, 4 * s);
  if (p.v % 3 === 0) {
    prism(B.wood, p.x, y, p.z, p.x, y + 1.0 * s, p.z, 0.18 * s, 6, TRUNK);
    for (let t = 0; t < 3; t++) b.cone(p.x, y + (0.8 + t * 0.95) * s, p.z, (1.35 - t * 0.33) * s, (1.6 - t * 0.18) * s, n, cols[t], p.rot + t, cols[3]);
  } else if (p.v % 3 === 1) {
    prism(B.wood, p.x, y, p.z, p.x, y + 1.3 * s, p.z, 0.16 * s, 6, TRUNK);
    for (let t = 0; t < 4; t++) b.cone(p.x, y + (1.0 + t * 0.85) * s, p.z, (1.05 - t * 0.2) * s, (1.4 - t * 0.12) * s, n, cols[t % 3], p.rot + t * 0.7, cols[3]);
  } else {
    prism(B.wood, p.x, y, p.z, p.x, y + 0.8 * s, p.z, 0.2 * s, 6, TRUNK);
    b.cone(p.x, y + 0.6 * s, p.z, 1.6 * s, 1.5 * s, n, cols[0], p.rot, cols[3]);
    b.cone(p.x, y + 1.4 * s, p.z, 1.25 * s, 1.5 * s, n, cols[1], p.rot + 0.5, cols[3]);
    b.cone(p.x, y + 2.3 * s, p.z, 0.8 * s, 1.3 * s, n, cols[2], p.rot + 1, cols[3]);
  }
  b.swayOf = null;
  b.occ = 0;
  B.wood.occ = 0;
}

export function tree(B, p, ctx) {
  if (MP.tree(B, p, ctx)) return;
  const s = p.s;
  const y = ctx.h(p.x, p.z) - 0.1;
  const id = ctx.occ('tree', [p.x, y + 2.4 * s, p.z], 1.8 * s);
  const c = LEAF_COLS[p.v % 2];
  B.wood.occ = id;
  B.foliage.occ = id;
  prism(B.wood, p.x, y, p.z, p.x, y + 1.9 * s, p.z, 0.2 * s, 6, TRUNK);
  prism(B.wood, p.x, y + 1.2 * s, p.z, p.x + 0.6 * s, y + 2.0 * s, p.z + 0.2 * s, 0.09 * s, 5, TRUNK);
  B.foliage.swayOf = swayAbove(y + 1.5 * s, 2.5 * s);
  blob(B.foliage, p.x, y + 2.6 * s, p.z, 1.35 * s, c[0], 0.85, c[1], p.rot);
  blob(B.foliage, p.x + 0.8 * s, y + 2.2 * s, p.z + 0.3 * s, 0.9 * s, c[2], 0.8, c[1], p.rot + 1);
  blob(B.foliage, p.x - 0.7 * s, y + 2.3 * s, p.z - 0.2 * s, 0.85 * s, c[1], 0.8, null, p.rot + 2);
  B.foliage.swayOf = null;
  B.wood.occ = 0;
  B.foliage.occ = 0;
}

export function bush(B, p, ctx) {
  if (MP.bush(B, p, ctx)) return;
  const s = p.s;
  const y = ctx.h(p.x, p.z) - 0.05;
  const c = BUSH_COLS[(p.v + Math.floor(hash2(Math.floor(p.x / 7), Math.floor(p.z / 7)) * 5)) % BUSH_COLS.length];
  B.foliage.swayOf = swayAbove(y, 1.2 * s);
  blob(B.foliage, p.x, y + 0.45 * s, p.z, 0.65 * s, c[0], 0.75, c[1], p.rot);
  blob(B.foliage, p.x + 0.42 * s, y + 0.32 * s, p.z + 0.2 * s, 0.45 * s, c[2], 0.75, null, p.rot + 1);
  blob(B.foliage, p.x - 0.35 * s, y + 0.3 * s, p.z + 0.15 * s, 0.42 * s, c[1], 0.75, null, p.rot + 2);
  const fl = c[3] || (p.v % 2 === 0 ? [lin('#f6a0b8'), lin('#fff0c0')] : null);
  if (fl) for (let i = 0; i < 6; i++) B.dflat.box(p.x + Math.cos(i * 1.9 + p.rot) * 0.45 * s, y + 0.5 * s + (i % 3) * 0.12, p.z + Math.sin(i * 1.9 + p.rot) * 0.45 * s + 0.15, 0.09, 0.09, 0.09, fl[i % 2]);
  B.foliage.swayOf = null;
}

export function fern(B, p, ctx) {
  if (MP.fern(B, p, ctx)) return;
  const s = p.s;
  const y = ctx.h(p.x, p.z) - 0.02;
  const col = lin(p.v % 2 ? '#4f8e44' : '#5f9e4a');
  const tip = lin('#7cb058');
  B.dfoliage.swayOf = swayAbove(y, 0.6 * s);
  for (let i = 0; i < 6; i++) {
    const a = p.rot + (i / 6) * Math.PI * 2;
    const L = (0.55 + 0.15 * ((i * 7) % 3)) * s;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const w = 0.09 * s;
    const base = [p.x, y + 0.05, p.z];
    const mid = [p.x + cx * L * 0.5, y + 0.32 * s, p.z + cz * L * 0.5];
    const end = [p.x + cx * L, y + 0.18 * s, p.z + cz * L];
    const side = [-cz * w, 0, cx * w];
    B.dfoliage.tri(base, [mid[0] + side[0], mid[1], mid[2] + side[2]], [mid[0] - side[0], mid[1], mid[2] - side[2]], col);
    B.dfoliage.tri([mid[0] + side[0], mid[1], mid[2] + side[2]], end, [mid[0] - side[0], mid[1], mid[2] - side[2]], tip);
  }
  B.dfoliage.swayOf = null;
}

export function mushroom(B, p, ctx) {
  if (MP.mushroom(B, p, ctx)) return;
  const s = p.s * 0.8;
  const y = ctx.h(p.x, p.z) - 0.02;
  const red = p.v % 3 !== 2;
  for (let i = 0; i < (p.v % 3) + 1; i++) {
    const x = p.x + i * 0.16 * s;
    const z = p.z + (i % 2) * 0.12 * s;
    const k = 1 - i * 0.25;
    B.dflat.cyl(x, y, z, 0.035 * s * k, 0.14 * s * k, 5, lin('#f2e6d0'));
    B.dflat.cone(x, y + 0.13 * s * k, z, 0.11 * s * k, 0.09 * s * k, 6, lin(red ? '#d8483e' : '#a8744a'), p.rot);
    if (red) B.dflat.box(x + 0.04 * s * k, y + 0.19 * s * k, z, 0.025, 0.02, 0.025, lin('#fff6e0'));
  }
}

export function rock(B, p, ctx) {
  if (MP.rock(B, p, ctx)) return;
  B.stone.rock(p.x, ctx.h(p.x, p.z), p.z, p.s, lin(p.v % 2 ? '#a09aa4' : '#9a96a0'), ctx.rng);
}

export function stump(B, p, ctx) {
  if (MP.stump(B, p, ctx)) return;
  const y = ctx.h(p.x, p.z) - 0.1;
  B.wood.cyl(p.x, y, p.z, 0.32 * p.s, 0.45 * p.s, 7, lin('#7a5640'));
  B.flat.cyl(p.x, y + 0.45 * p.s, p.z, 0.27 * p.s, 0.02, 7, lin('#d8b888'));
}

export function log(B, p, ctx) {
  if (MP.log(B, p, ctx)) return;
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  const L = 0.9 * p.s;
  const y = ctx.h(p.x, p.z) + 0.2;
  prism(B.wood, p.x - c * L, y, p.z + s * L, p.x + c * L, y, p.z - s * L, 0.24 * p.s, 7, lin('#7a5640'));
}

export function reeds(B, p, ctx) {
  const k = p.src === 'j7' ? p.v : 6 + Math.round(p.s * 4);
  B.dflat.swayOf = (q) => Math.max(0, Math.min(1, (q[1] - WATER_Y) / 1.4));
  for (let i = 0; i < k; i++) {
    const rx = p.x + (ctx.rng() - 0.5) * 1.2;
    const rz = p.z + (ctx.rng() - 0.5) * 0.8;
    const h = (0.8 + ctx.rng() * 0.7) * (p.src === 'j7' ? 1 : p.s);
    const y0 = Math.min(WATER_Y, ctx.h(rx, rz));
    B.dflat.box(rx, y0, rz, 0.05, h - y0, 0.05, lin(i % 3 ? '#5e8a44' : '#7a9a4c'), ctx.rng() * 3);
    if (i % 3 === 0) B.dflat.box(rx, h - 0.25, rz, 0.09, 0.22, 0.09, lin('#6a4030'), ctx.rng() * 3);
  }
  B.dflat.swayOf = null;
}

export function lily(B, p) {
  if (MP.lily(B, p)) return;
  B.dflat.cyl(p.x, WATER_Y + 0.005, p.z, p.s, 0.03, 7, lin('#4f8a4c'));
  if (p.s > 0.45) B.dflat.cone(p.x + 0.1, WATER_Y + 0.03, p.z + 0.05, 0.12, 0.12, 5, lin('#f6b8c8'));
}

// ------------------------------------------------------------------ village props
export function lamp(B, p, ctx, G) {
  if (MP.lamp(B, p, ctx, G)) return;
  const deck = ctx.deckY(p.x, p.z);
  const y = deck !== null ? deck : ctx.h(p.x, p.z) - 0.05;
  const H = 2.6;
  const f = B.flat;
  f.box(p.x, y, p.z, 0.3, 0.14, 0.3, lin('#3a3440'));
  f.box(p.x, y, p.z, 0.11, H, 0.11, lin('#3a3440'));
  f.box(p.x, y + H, p.z, 0.42, 0.08, 0.42, lin('#2a2430'));
  f.box(p.x, y + H + 0.42, p.z, 0.46, 0.1, 0.46, lin('#2a2430'), 0, lin('#4a4450'));
  f.cone(p.x, y + H + 0.52, p.z, 0.26, 0.16, 4, lin('#2a2430'), Math.PI / 4);
  G.lamp.box(p.x, y + H + 0.08, p.z, 0.3, 0.34, 0.3, [1, 1, 1]);
  ctx.out.lights.push({ kind: 'lamp', x: p.x, y: y + H + 0.25, z: p.z });
}

export function well(B, p, ctx) {
  if (MP.well(B, p, ctx)) return;
  const y = ctx.h(p.x, p.z) - 0.1;
  B.stone.cyl(p.x, y, p.z, 0.95, 0.85, 10, lin('#a89e96'), true);
  B.stone.cyl(p.x, y, p.z, 0.75, 0.86, 10, lin('#8a8078'), true);
  B.flat.cyl(p.x, y + 0.55, p.z, 0.75, 0.02, 10, lin('#3a5a8a'));
  B.stone.cyl(p.x, y + 0.84, p.z, 0.97, 0.08, 10, lin('#c0b6ac'));
  for (const sx of [-1, 1]) B.wood.box(p.x + sx * 0.8, y + 0.8, p.z, 0.14, 1.5, 0.14, lin('#7a5640'));
  B.wood.box(p.x, y + 2.15, p.z, 1.8, 0.1, 0.1, lin('#6a4a34'));
  const ry = y + 2.25;
  const R = B.roof;
  R.quad([p.x - 1.2, ry, p.z + 0.85], [p.x + 1.2, ry, p.z + 0.85], [p.x + 1.2, ry + 0.6, p.z], [p.x - 1.2, ry + 0.6, p.z], lin('#9a5a6a'));
  R.quad([p.x + 1.2, ry, p.z - 0.85], [p.x - 1.2, ry, p.z - 0.85], [p.x - 1.2, ry + 0.6, p.z], [p.x + 1.2, ry + 0.6, p.z], lin('#8a4a5a'));
  B.wood.box(p.x + 0.25, y + 1.4, p.z, 0.3, 0.3, 0.3, lin('#8a6448'));
}

/**
 * J9-B market stall, facing its rot (front = +z local): back and front posts, a counter with a cloth skirt, a shelf, goods (a crate of
 * fish, a basket of fruit, jars, bread), crates and a barrel of apples at its feet, a SHORT high striped awning with a scalloped
 * valance (the goods stay visible from the game camera), a fish-and-apple sign on top, a small lantern.
 */
export function stall(B, p, ctx, G) {
  const y = ctx.h(p.x, p.z) - 0.05;
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  const at = (lx, lz) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
  const bx = (b, lx, ly, lz, w, h, d, col, top) => {
    const [x, z] = at(lx, lz);
    b.box(x, y + ly, z, w, h, d, col, p.rot, top);
  };
  const POST = lin('#6a4a34');
  for (const lx of [-1.15, 1.15]) {
    bx(B.wood, lx, 0, -0.55, 0.12, 2.62, 0.12, POST);
    bx(B.wood, lx, 0, 0.6, 0.12, 2.18, 0.12, POST);
  }
  // counter: body, top plank, cloth skirt with stripes on the front
  bx(B.wood, 0, 0, 0.22, 2.2, 0.86, 0.6, lin('#8a6448'));
  bx(B.wood, 0, 0.86, 0.22, 2.42, 0.08, 0.74, lin('#c49a68'), lin('#d8b07a'));
  for (let i = 0; i < 8; i++) bx(B.flat, -0.96 + i * 0.275, 0.3, 0.535, 0.275, 0.46, 0.02, lin(i % 2 ? '#f2e6c8' : '#c8484a'));
  bx(B.flat, 0, 0.74, 0.54, 2.22, 0.06, 0.03, lin('#5a3a2a'));
  // shelf at the back with jars
  bx(B.wood, 0, 0, -0.42, 2.1, 1.35, 0.26, lin('#7a5640'), lin('#a07a50'));
  const jars = ['#e8a040', '#9ac060', '#c8584e', '#f2d488', '#7aa8c8', '#e8a040'];
  jars.forEach((jc, i) => {
    const [x, z] = at(-0.85 + i * 0.34, -0.4);
    B.dflat.cyl(x, y + 1.35, z, 0.07, 0.17, 6, lin(jc));
    B.dflat.cyl(x, y + 1.52, z, 0.075, 0.03, 6, lin('#5a3a2a'));
  });
  // goods on the counter: a crate of fish, a basket of fruit, a loaf, a scale
  bx(B.wood, -0.62, 0.94, 0.22, 0.7, 0.16, 0.5, lin('#7aa8c8'), lin('#5a8aa8'));
  for (let i = 0; i < 3; i++) {
    const [x, z] = at(-0.82 + i * 0.2, 0.22 + (i % 2 ? 0.08 : -0.08));
    B.dflat.box(x, y + 1.1, z, 0.08, 0.05, 0.36, lin(i === 1 ? '#e8803a' : '#c8d8e8'), p.rot + 0.15 * (i - 1));
  }
  bx(B.wood, 0.25, 0.94, 0.22, 0.5, 0.13, 0.4, lin('#a8743e'), lin('#6a4a30'));
  const fruit = ['#d8483e', '#e8a040', '#9ac060', '#d8483e', '#f2c84a', '#e8803a'];
  fruit.forEach((fc, i) => {
    const [x, z] = at(0.08 + (i % 3) * 0.16, 0.12 + Math.floor(i / 3) * 0.18);
    B.dflat.box(x, y + 1.06 + (i % 2) * 0.02, z, 0.12, 0.1, 0.12, lin(fc), p.rot + i);
  });
  bx(B.flat, 0.8, 0.94, 0.25, 0.42, 0.12, 0.24, lin('#e0b070'), lin('#f2d090'));
  // at its feet: two crates and a barrel of apples
  bx(B.wood, -0.92, 0, 0.92, 0.46, 0.42, 0.42, lin('#b08a5a'), lin('#c49a68'));
  bx(B.wood, -0.92, 0.42, 0.92, 0.38, 0.32, 0.36, lin('#a07a50'), lin('#7aa8c8'));
  {
    const [x, z] = at(0.95, 0.95);
    B.wood.cyl(x, y, z, 0.24, 0.62, 8, lin('#9a6a44'));
    B.flat.cyl(x, y + 0.12, z, 0.25, 0.05, 8, lin('#4a4048'), true);
    B.flat.cyl(x, y + 0.5, z, 0.25, 0.05, 8, lin('#4a4048'), true);
    for (let i = 0; i < 5; i++) B.dflat.box(x + Math.cos(i * 1.3) * 0.11, y + 0.62, z + Math.sin(i * 1.3) * 0.11, 0.1, 0.09, 0.1, lin(i % 2 ? '#d8483e' : '#ff7a6a'));
  }
  // short high awning, 8 stripes, with a scalloped valance at the front edge
  const N = 8;
  const L0 = -1.32;
  const L1 = 1.32;
  const yb = y + 2.66;
  const yf = y + 2.2;
  for (let i = 0; i < N; i++) {
    const l0 = L0 + ((L1 - L0) * i) / N;
    const l1 = L0 + ((L1 - L0) * (i + 1)) / N;
    const col = lin(i % 2 ? '#f2e6c8' : '#c8484a');
    const A = at(l0, -0.72);
    const Bq = at(l1, -0.72);
    const Cq = at(l1, 0.78);
    const D = at(l0, 0.78);
    B.flat.quad([A[0], yb, A[1]], [D[0], yf, D[1]], [Cq[0], yf, Cq[1]], [Bq[0], yb, Bq[1]], col);
    B.flat.quad([Bq[0], yb - 0.03, Bq[1]], [Cq[0], yf - 0.03, Cq[1]], [D[0], yf - 0.03, D[1]], [A[0], yb - 0.03, A[1]], lin(i % 2 ? '#d8c8a8' : '#a83a3c'));
    // valance: a scallop under the front edge of each stripe
    const m = at((l0 + l1) / 2, 0.79);
    const e0 = at(l0, 0.79);
    const e1 = at(l1, 0.79);
    B.dflat.tri([e0[0], yf, e0[1]], [m[0], yf - 0.24, m[1]], [e1[0], yf, e1[1]], col);
    B.dflat.tri([e1[0], yf, e1[1]], [m[0], yf - 0.24, m[1]], [e0[0], yf, e0[1]], col);
  }
  // the sign on top (fish and apple), on two short posts, leaning back toward the camera
  for (const lx of [-0.6, 0.6]) bx(B.wood, lx, 2.55, -0.62, 0.08, 0.45, 0.08, POST);
  const [sx, sz] = at(0, -0.6);
  signBoard(B, G, sx, y + 2.72, sz, p.rot, 1.6, 0.8, 'stall', 0.42);
  // a small lantern hanging from the front right post
  const [lx2, lz2] = at(1.15, 0.72);
  B.flat.box(lx2, y + 1.92, lz2, 0.03, 0.2, 0.03, lin('#2a2430'));
  G.lamp.box(lx2, y + 1.7, lz2, 0.14, 0.2, 0.14, [1, 1, 1], p.rot);
  ctx.out.lights.push({ kind: 'lantern', x: lx2, y: y + 1.8, z: lz2 });
}

export function bench(B, p, ctx) {
  if (MP.bench(B, p, ctx)) return;
  const y = ctx.h(p.x, p.z) - 0.03;
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  const at = (lx, lz) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
  for (const lx of [-0.6, 0.6]) {
    const [x, z] = at(lx, 0);
    B.flat.box(x, y, z, 0.08, 0.42, 0.4, lin('#3a3440'), p.rot);
  }
  B.wood.box(p.x, y + 0.42, p.z, 1.5, 0.08, 0.45, lin('#b07a4a'), p.rot);
  const [bx, bz] = at(0, -0.2);
  B.wood.box(bx, y + 0.62, bz, 1.5, 0.22, 0.06, lin('#a06a40'), p.rot);
}

export function barrel(B, p, ctx) {
  if (MP.barrel(B, p, ctx)) return;
  const y = ctx.h(p.x, p.z) - 0.03;
  const r = 0.33 * p.s;
  B.wood.cyl(p.x, y, p.z, r, 0.8 * p.s, 8, lin('#9a6a44'));
  B.flat.cyl(p.x, y + 0.15 * p.s, p.z, r + 0.01, 0.06, 8, lin('#4a4048'), true);
  B.flat.cyl(p.x, y + 0.6 * p.s, p.z, r + 0.01, 0.06, 8, lin('#4a4048'), true);
}

export function crate(B, p, ctx) {
  if (MP.crate(B, p, ctx)) return;
  const y = ctx.h(p.x, p.z) - 0.03;
  const w = 0.7 * p.s;
  B.wood.box(p.x, y, p.z, w, w, w, lin('#b08a5a'), p.rot, lin('#c49a68'));
  B.flat.box(p.x, y + w, p.z, w * 0.75, 0.02, w * 0.12, lin('#7a5a3a'), p.rot);
}

export function sign(B, p, ctx) {
  if (MP.sign(B, p, ctx)) return;
  const y = ctx.h(p.x, p.z) - 0.05;
  B.wood.box(p.x, y, p.z, 0.12, 1.6, 0.12, lin('#7a5640'));
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  B.wood.box(p.x + c * 0.35, y + 1.3, p.z - s * 0.35, 0.8, 0.22, 0.06, lin('#c49a68'), p.rot);
  B.wood.box(p.x - s * 0.06 - c * 0.3, y + 0.98, p.z - c * 0.06 + s * 0.3, 0.7, 0.2, 0.06, lin('#b08a5a'), p.rot + Math.PI);
  B.flat.box(p.x + c * 0.5, y + 1.36, p.z - s * 0.35 + 0.035, 0.32, 0.05, 0.02, lin('#4a3030'), p.rot);
}

export function net(B, p, ctx) {
  const y = ctx.h(p.x, p.z) - 0.05;
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  for (const l of [-1.05, 1.05]) B.wood.box(p.x + c * l, y, p.z - s * l, 0.12, 1.9, 0.12, lin('#7a5640'));
  B.wood.box(p.x, y + 1.85, p.z, 2.3, 0.08, 0.08, lin('#6a4a34'), p.rot);
  for (let i = 0; i < 8; i++) {
    const l = -0.95 + i * 0.27;
    B.dflat.box(p.x + c * l, y + 0.6, p.z - s * l, 0.03, 1.25, 0.03, lin('#5a6a6a'), p.rot);
  }
  for (let j = 0; j < 5; j++) B.dflat.box(p.x, y + 0.65 + j * 0.27, p.z, 1.95, 0.03, 0.03, lin('#5a6a6a'), p.rot);
  B.dflat.box(p.x + c * 0.4, y + 0.45, p.z - s * 0.4, 0.3, 0.2, 0.3, lin('#e8a040'), p.rot); // a float hung on the net
}

export function boat(B, p) {
  const y = WATER_Y - 0.12;
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  const at = (lx, ly, lz) => [p.x + lx * c + lz * s, y + ly, p.z - lx * s + lz * c];
  const hull = lin('#8a5a3a');
  const in_ = lin('#b08058');
  const rim = lin('#e8dcc0');
  const L = 1.6;
  const W = 0.62;
  // sides (bow at +x), bottom, transom, seats
  const sideL = [at(-L, 0, -W), at(L * 0.75, 0, -W * 0.7), at(L, 0.5, 0), at(L * 0.75, 0.55, -W * 0.9), at(-L, 0.5, -W)];
  const sideR = [at(-L, 0, W), at(L * 0.75, 0, W * 0.7), at(L, 0.5, 0), at(L * 0.75, 0.55, W * 0.9), at(-L, 0.5, W)];
  B.wood.quad(sideL[0], sideL[1], sideL[3], sideL[4], hull);
  B.wood.tri(sideL[1], sideL[2], sideL[3], hull);
  B.wood.quad(sideR[1], sideR[0], sideR[4], sideR[3], hull);
  B.wood.tri(sideR[2], sideR[1], sideR[3], hull);
  B.wood.quad(at(-L, 0.02, -W), at(-L, 0.02, W), at(L * 0.75, 0.02, W * 0.7), at(L * 0.75, 0.02, -W * 0.7), in_);
  B.wood.tri(at(L * 0.75, 0.02, -W * 0.7), at(L * 0.75, 0.02, W * 0.7), at(L, 0.45, 0), in_);
  B.wood.quad(at(-L, 0, W), at(-L, 0, -W), at(-L, 0.5, -W), at(-L, 0.5, W), hull);
  B.wood.quad(sideL[4], sideL[3], sideR[3], sideR[4], in_);
  for (const lx of [-0.9, 0.2]) {
    const [x, yy, z] = at(lx, 0.3, 0);
    B.wood.box(x, yy, z, 0.3, 0.06, W * 1.8, in_, p.rot);
  }
  prism(B.flat, ...at(-L, 0.52, -W), ...at(L, 0.52, 0), 0.03, 4, rim);
  prism(B.flat, ...at(-L, 0.52, W), ...at(L, 0.52, 0), 0.03, 4, rim);
  prism(B.wood, ...at(-0.6, 0.45, -0.4), ...at(0.9, 0.35, -1.3), 0.03, 4, lin('#c49a68')); // oar
  // mooring rope to the jetty
  prism(B.flat, ...at(L * 0.9, 0.4, 0), ...at(L + 0.6, 0.55, 1.5), 0.02, 3, lin('#d8c8a0'));
  // the boat shadow on the water is drawn by the water shader (rectangle of the hull)
  return { x0: p.x - L * Math.abs(c) - W * Math.abs(s), x1: p.x + L * Math.abs(c) + W * Math.abs(s), z0: p.z - L * Math.abs(s) - W * Math.abs(c), z1: p.z + L * Math.abs(s) + W * Math.abs(c), y: 0.45 };
}

export function spiritTree(B, p, ctx, G) {
  if (MP.spiritTree(B, p, ctx, G)) return;
  const y = ctx.h(p.x, p.z) - 0.1;
  const bark = lin('#d8d0e8');
  let px = p.x;
  let pz = p.z;
  let py = y;
  for (let i = 0; i < 5; i++) {
    const nx = p.x + Math.sin(i * 1.7) * 0.25;
    const nz = p.z + Math.cos(i * 1.3) * 0.2;
    prism(B.wood, px, py, pz, nx, py + 0.8, nz, 0.3 - i * 0.04, 6, bark);
    px = nx;
    pz = nz;
    py += 0.8;
  }
  for (const [dx, dz] of [[1.1, 0.3], [-1.0, 0.4], [0.2, -1.0]]) prism(B.wood, px, py - 0.6, pz, px + dx, py + 0.4, pz + dz, 0.09, 5, bark);
  const leaves = [[0, 0.6, 0, 1.5], [1.2, 0.3, 0.4, 1.0], [-1.1, 0.4, 0.5, 1.0], [0.3, 0.2, -1.1, 0.95], [0, 1.6, 0.1, 0.9]];
  for (const [dx, dy, dz, r] of leaves) blob(G.spirit, px + dx, py + dy, pz + dz, r, [1, 1, 1], 0.8);
  ctx.out.lights.push({ kind: 'spirit', x: px, y: py + 0.5, z: pz });
  ctx.occ('spiritTree', [px, py, pz], 2.5);
}

// ------------------------------------------------------------------ decks and fences
export function deck(B, r, ctx) {
  const long = r.x1 - r.x0 > r.z1 - r.z0 ? 'x' : 'z';
  const DECK = lin('#b98a5e');
  const PILE = lin('#6e4e3a');
  B.deck.box((r.x0 + r.x1) / 2, r.y - 0.12, (r.z0 + r.z1) / 2, r.x1 - r.x0, 0.12, r.z1 - r.z0, DECK, 0, lin('#c99a6a'), true);
  if (long === 'z') {
    B.wood.box(r.x0 + 0.12, r.y - 0.3, (r.z0 + r.z1) / 2, 0.14, 0.18, r.z1 - r.z0, PILE);
    B.wood.box(r.x1 - 0.12, r.y - 0.3, (r.z0 + r.z1) / 2, 0.14, 0.18, r.z1 - r.z0, PILE);
  } else {
    B.wood.box((r.x0 + r.x1) / 2, r.y - 0.3, r.z0 + 0.12, r.x1 - r.x0, 0.18, 0.14, PILE);
    B.wood.box((r.x0 + r.x1) / 2, r.y - 0.3, r.z1 - 0.12, r.x1 - r.x0, 0.18, 0.14, PILE);
  }
  if (r.kind === 'pier') return; // the J7 piles are drawn from LAYOUT
  const len = long === 'x' ? r.x1 - r.x0 : r.z1 - r.z0;
  const n = Math.max(1, Math.round(len / 2.6));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    for (const side of [0, 1]) {
      const x = long === 'x' ? r.x0 + 0.15 + (r.x1 - r.x0 - 0.3) * t : side ? r.x1 - 0.12 : r.x0 + 0.12;
      const z = long === 'z' ? r.z0 + 0.15 + (r.z1 - r.z0 - 0.3) * t : side ? r.z1 - 0.12 : r.z0 + 0.12;
      if (ctx.land(x, z) > 0.2) continue;
      B.wood.box(x, -1.1, z, 0.18, r.y + 1.2, 0.18, PILE, 0, lin('#8a6448'));
      ctx.out.piles.push([x, z]);
    }
  }
}

export function pierPiles(B, piles) {
  for (const [x, z] of piles) B.wood.box(x, -1.1, z, 0.2, DECK_Y + 1.25, 0.2, lin('#6e4e3a'), 0, lin('#8a6448'));
  for (const [x, z] of [[1.25, -9.1], [4.75, -9.1], [1.25, -11.55], [4.75, -11.55]]) B.wood.box(x, DECK_Y, z, 0.16, 0.5, 0.16, lin('#7a5640'), 0, lin('#9a7458'));
}

export function fence(B, pts, ctx) {
  if (MP.fence(B, pts, ctx)) return;
  const FW = lin('#c9a27a');
  for (let k = 0; k < pts.length - 1; k++) {
    const [fx0, fz0] = pts[k];
    const [fx1, fz1] = pts[k + 1];
    const fl = Math.hypot(fx1 - fx0, fz1 - fz0);
    const n = Math.max(1, Math.round(fl / 0.75));
    const fang = Math.atan2(-(fz1 - fz0), fx1 - fx0);
    for (let i = k === 0 ? 0 : 1; i <= n; i++) {
      const x = fx0 + ((fx1 - fx0) * i) / n;
      const z = fz0 + ((fz1 - fz0) * i) / n;
      B.wood.box(x, ctx.h(x, z) - 0.1, z, 0.14, 1.0, 0.14, FW, fang, lin('#e0bc90'));
    }
    const fmx = (fx0 + fx1) / 2;
    const fmz = (fz0 + fz1) / 2;
    const fy = ctx.h(fmx, fmz);
    B.wood.box(fmx, fy + 0.45, fmz, fl, 0.1, 0.06, FW, fang);
    B.wood.box(fmx, fy + 0.72, fmz, fl, 0.1, 0.06, FW, fang);
  }
}

// ------------------------------------------------------------------ buildings
/** Gable roof over a box (local frame of the building), with overhang, ridge beam. Returns the ridge height. */
function gableRoof(R, at, top, w, d, roofH, colA, colB, colEdge) {
  const ov = 0.35;
  const half = d / 2 + ov;
  const slope = Math.atan2(roofH, d / 2);
  const len = half / Math.cos(slope);
  const ridge = top + roofH + 0.04;
  for (const sz of [-1, 1]) {
    const x0 = -w / 2 - ov;
    const x1 = w / 2 + ov;
    const eaveY = ridge - Math.sin(slope) * len;
    const eaveZ = sz * Math.cos(slope) * len;
    const th = 0.14;
    const p = [at(x0, ridge, 0), at(x1, ridge, 0), at(x1, eaveY, eaveZ), at(x0, eaveY, eaveZ)];
    const q = p.map((v) => [v[0], v[1] - th, v[2]]);
    if (sz > 0) {
      R.quad(p[0], p[3], p[2], p[1], colA);
      R.quad(q[3], q[0], q[1], q[2], colEdge);
      R.quad(p[3], q[3], q[2], p[2], colEdge);
    } else {
      R.quad(p[0], p[1], p[2], p[3], colB);
      R.quad(q[1], q[0], q[3], q[2], colEdge);
      R.quad(p[2], q[2], q[3], p[3], colEdge);
    }
    R.quad(p[0], q[0], q[3], p[3], colEdge);
    R.quad(p[2], q[2], q[1], p[1], colEdge);
  }
  return ridge;
}

const HOUSE_STYLES = [
  { wall: '#efe2c8', frame: '#7a4a34', roof: '#5f86a2', roofB: '#4f7692', edge: '#3a4f68', door: '#7a4a34' },
  { wall: '#e8c8a8', frame: '#6a3a2a', roof: '#b0605a', roofB: '#a0504a', edge: '#7a3a3a', door: '#4a6a4a' },
  { wall: '#f2ead8', frame: '#5a4a3a', roof: '#6a8a5a', roofB: '#5a7a4a', edge: '#3a5a3a', door: '#8a5a3a' },
  { wall: '#dcd0e8', frame: '#5a4060', roof: '#9a5a6a', roofB: '#8a4a5a', edge: '#6a3a4a', door: '#5a5a8a' },
];

/**
 * Cabin (J7, axis-aligned), village houses, the Boutique and the Atelier. Walls and roof get separate occluder ids (the roof fades first).
 */
export function building(B, bd, ctx, G) {
  const c = Math.cos(bd.rot);
  const s = Math.sin(bd.rot);
  const gy = ctx.h(bd.x + s * (bd.d / 2), bd.z + c * (bd.d / 2)) - 0.05;
  const at = (lx, ly, lz) => [bd.x + lx * c + lz * s, ly, bd.z - lx * s + lz * c];
  const box = (b, lx, ly, lz, w, h, d, col, top) => {
    const [x, , z] = at(lx, 0, lz);
    b.box(x, ly, z, w, h, d, col, bd.rot, top);
  };
  const cabin = bd.type === 'cabin';
  const st = cabin ? null : bd.type === 'shop' ? HOUSE_STYLES[1] : bd.type === 'workshop' ? null : HOUSE_STYLES[(bd.variant || 0) % 4];
  const wallH = bd.wallH || 2.4;
  const roofH = bd.roofH || 1.7;
  const W = bd.w;
  const D = bd.d;
  const wallsId = ctx.occ(cabin ? 'cabinWalls' : bd.id + 'Walls', [bd.x, gy + 1.4, bd.z], Math.max(W, D) * 0.6);
  const roofId = ctx.occ(cabin ? 'cabinRoof' : bd.id + 'Roof', [bd.x, gy + wallH + 0.6, bd.z], Math.max(W, D) * 0.62 + 0.4);
  const fam = cabin || bd.type === 'workshop' ? B.wood : B.plaster;
  for (const b of [B.wood, B.plaster, B.stone, B.flat]) b.occ = wallsId;
  B.roof.occ = roofId;
  const WALL = lin(cabin ? '#c98e5a' : bd.type === 'workshop' ? '#a87a52' : st.wall);
  box(B.stone, 0, gy - 0.3, 0, W + 0.3, 0.42, D + 0.3, lin('#9a8e86'));
  // art pass: the shell (walls with their trims, gable roof, chimney) from the Kenney Fantasy Town pieces when they are loaded
  const shell = MP.buildingModels(bd);
  if (shell) MP.houseShell(B, bd, at, gy, wallH, roofH, st);
  else box(fam, 0, gy + 0.12, 0, W, wallH, D, WALL, WALL);
  // corner posts / timber frame
  const FR = lin(cabin ? '#8a5a3a' : bd.type === 'workshop' ? '#6a4a34' : st.frame);
  if (!shell) for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(B.wood, (dx * W) / 2, gy + 0.12, (dz * D) / 2, 0.24, wallH, 0.24, FR);
  if (!cabin && bd.type !== 'workshop' && !shell) {
    box(B.wood, 0, gy + 0.12 + wallH - 0.12, D / 2 + 0.02, W, 0.14, 0.06, FR);
    box(B.wood, 0, gy + 1.0, D / 2 + 0.02, W, 0.1, 0.06, FR);
  }
  const top = gy + 0.12 + wallH;
  // gables (triangles on the side faces)
  for (const sx of [-1, 1]) {
    const a = at((sx * W) / 2, top, -D / 2);
    const b2 = at((sx * W) / 2, top, D / 2);
    const cc = at((sx * W) / 2, top + roofH, 0);
    if (sx > 0) fam.tri(a, cc, b2, WALL);
    else fam.tri(b2, cc, a, WALL);
  }
  const RO = lin(cabin ? '#9a5a6a' : bd.type === 'workshop' ? '#6a6a7a' : st.roof);
  const ROB = lin(cabin ? '#9a5a6a' : bd.type === 'workshop' ? '#5a5a6a' : st.roofB);
  const EDGE = lin(cabin ? '#8a3a3a' : bd.type === 'workshop' ? '#3a3a4a' : st.edge);
  if (!shell) {
    gableRoof(B.roof, at, top, W, D, roofH, RO, ROB, EDGE);
    const ridgeBeam = at(0, 0, 0);
    B.roof.box(ridgeBeam[0], top + roofH - 0.02, ridgeBeam[2], W + 0.74, 0.14, 0.24, EDGE, bd.rot);
  }
  // chimney with smoke
  const [chx, , chz] = at(W * 0.27, 0, -D * 0.17);
  if (!shell) B.stone.box(chx, top + 0.3, chz, 0.6, roofH + 0.6, 0.6, lin('#a89a90'), bd.rot, lin('#6a5a58'));
  ctx.out.chimneys.push([chx, top + roofH + 0.95, chz]);
  // front: door, windows, step
  const fz = D / 2;
  const doorX = cabin ? 1.1 : bd.type === 'shop' ? 0 : bd.type === 'workshop' ? -0.6 : W * 0.22;
  const doorW = bd.type === 'workshop' ? 1.6 : 0.95;
  const DOOR = lin(cabin ? '#9a6440' : bd.type === 'workshop' ? '#6a4a34' : st.door);
  // round 2: a real framed door (Fantasy Town panel); the cabin also gets a porch (plank floor, posts, a short roof, a lantern)
  const frontM = shell && MP.frontModels();
  if (frontM) MP.frontDoor(B, bd, at, gy, doorX, fz, bd.type === 'workshop' ? 2.3 : 1.95, cabin ? '#9a6440' : bd.type === 'workshop' ? '#6a4a34' : st.door);
  else {
    box(B.flat, doorX, gy + 0.12, fz + 0.02, doorW, 1.85, 0.08, DOOR);
    box(B.flat, doorX, gy + 0.12 + 1.85, fz + 0.03, doorW + 0.2, 0.12, 0.1, lin('#5a3a2a'));
  }
  box(B.flat, doorX + doorW * 0.4, gy + 0.95, fz + 0.08, 0.08, 0.08, 0.06, lin('#f2d488'));
  if (cabin && frontM && MP.cabinPorch(B, G, bd, at, gy, doorX, fz, ctx)) box(B.stone, doorX, gy - 0.05, fz + 1.5, 1.5, 0.18, 0.45, lin('#a0968c'));
  else box(B.stone, doorX, gy - 0.05, fz + 0.35, doorW + 0.35, 0.2, 0.55, lin('#a0968c'));
  const win = (wx, wy, ww, wh, face = 1) => {
    const z0 = face * (fz + 0.03);
    // round 2: a shuttered window panel (Fantasy Town) with a real opening; the glass pane sits behind it
    let pane = { w: ww, h: wh, cy: wy + wh / 2 };
    if (frontM) pane = MP.frontWindow(B, bd, at, wx, wy + wh / 2, ww, fz, cabin ? '#b07848' : bd.type === 'workshop' ? '#7a5a40' : st.frame, face);
    else {
      const F2 = lin('#f2e6c8');
      box(B.flat, wx, wy - 0.08, z0, ww + 0.2, 0.08, 0.1, F2);
      box(B.flat, wx, wy + wh, z0, ww + 0.2, 0.08, 0.1, F2);
      box(B.flat, wx - ww / 2 - 0.06, wy, z0, 0.08, wh, 0.1, F2);
      box(B.flat, wx + ww / 2 + 0.06, wy, z0, 0.08, wh, 0.1, F2);
      box(B.flat, wx, wy, z0 + face * 0.02, 0.06, wh, 0.06, lin('#5a3a2a'));
      box(B.flat, wx, wy + wh / 2 - 0.03, z0 + face * 0.02, ww, 0.06, 0.06, lin('#5a3a2a'));
    }
    if (face > 0) box(B.flat, wx, wy - 0.3, z0 + 0.13, ww + 0.2, 0.22, 0.24, lin('#7a4a34'), lin('#4a6a3a'));
    // glowing glass (a thin box in the glow builder)
    const [gx, , gz] = at(wx, 0, face * (fz + 0.012));
    G.win.box(gx, pane.cy - pane.h / 2, gz, pane.w, pane.h, 0.02, [1, 1, 1], bd.rot);
    const [lx, , lz] = at(wx, 0, face * (fz + 0.6));
    ctx.out.lights.push({ kind: 'window', x: lx, y: wy + 0.4, z: lz });
  };
  if (cabin) win(-1.0, gy + 1.0, 1.0, 0.85);
  else if (bd.type === 'shop') {
    win(-1.9, gy + 0.95, 1.1, 0.9);
    win(1.9, gy + 0.95, 1.1, 0.9);
    // awning over the door, sign board with a fish, door marker (mat + lantern)
    for (let i = 0; i < 5; i++) {
      const l0 = -1.1 + i * 0.44;
      const A = at(l0, gy + 2.45, fz + 0.05);
      const Bq = at(l0 + 0.44, gy + 2.45, fz + 0.05);
      const C = at(l0 + 0.44, gy + 2.15, fz + 0.85);
      const Dd = at(l0, gy + 2.15, fz + 0.85);
      B.flat.quad(A, Dd, C, Bq, lin(i % 2 ? '#f2e6c8' : '#4a8ab0'));
    }
    // J9-B: a pixel-art sign (coin + pearl + fish) on brackets above the awning, leaning toward the camera; a hanging blade sign
    // perpendicular to the wall (read when the view is turned); door marker: a red mat, a lit frame, the lantern
    for (const lx of [-0.8, 0.8]) box(B.flat, lx, gy + wallH - 0.15, fz + 0.12, 0.08, 0.1, 0.24, lin('#3a3440'));
    {
      const [sx, , sz] = at(0, 0, fz + (shell ? 0.5 : 0.2));
      signBoard(B, G, sx, gy + wallH - (shell ? 0.1 : 0.12), sz, bd.rot, 2.2, 1.1, 'shop', 0.5);
      const [hx2, , hz2] = at(-1.75, 0, fz + 0.62);
      box(B.flat, -1.75, gy + 2.6, fz + 0.36, 0.06, 0.06, 0.6, lin('#3a3440'));
      signBoard(B, G, hx2, gy + 1.95, hz2, bd.rot + Math.PI / 2, 0.9, 0.45, 'shop', 0);
    }
    box(B.flat, 0, gy - 0.04, fz + 1.1, 1.3, 0.03, 0.7, lin('#b8584e'), lin('#c8685e'));
    box(B.flat, 0, gy - 0.035, fz + 1.1, 1.0, 0.03, 0.45, lin('#e8c070'));
    const [lx2, , lz2] = at(0.75, 0, fz + 0.18);
    G.lamp.box(lx2, gy + 2.0, lz2, 0.16, 0.22, 0.16, [1, 1, 1], bd.rot);
    ctx.out.lights.push({ kind: 'lantern', x: lx2, y: gy + 2.1, z: lz2 });
  } else if (bd.type === 'workshop') {
    win(1.3, gy + 1.0, 0.9, 0.8);
    // J9-B: a pixel-art sign (gear + hammer) over the big door, leaning toward the camera; a blade sign; door marker: mat + lantern;
    // the anvil on its block, a grindstone, tools on the wall
    for (const lx of [-1.3, 0.1]) box(B.flat, lx, gy + wallH - 0.12, fz + 0.12, 0.08, 0.1, 0.24, lin('#3a3440'));
    {
      const [sx, , sz] = at(-0.6, 0, fz + (shell ? 0.5 : 0.2));
      signBoard(B, G, sx, gy + wallH - (shell ? 0.08 : 0.1), sz, bd.rot, 2.0, 1.0, 'workshop', 0.5);
      const [hx2, , hz2] = at(0.75, 0, fz + 0.62);
      box(B.flat, 0.75, gy + 2.35, fz + 0.36, 0.06, 0.06, 0.6, lin('#3a3440'));
      signBoard(B, G, hx2, gy + 1.72, hz2, bd.rot + Math.PI / 2, 0.8, 0.4, 'workshop', 0);
    }
    box(B.flat, -0.6, gy - 0.04, fz + 1.05, 1.7, 0.03, 0.6, lin('#5a6a8a'), lin('#6a7a9a'));
    box(B.wood, 1.7, gy - 0.05, fz + 1.0, 0.42, 0.42, 0.42, lin('#6a4a34'));
    box(B.stone, 1.7, gy + 0.37, fz + 1.0, 0.56, 0.18, 0.26, lin('#4a4a52'), lin('#6a6a74'));
    box(B.stone, 1.98, gy + 0.43, fz + 1.0, 0.16, 0.08, 0.14, lin('#4a4a52'));
    {
      const [gx2, , gz2] = at(-2.0, 0, fz + 0.75);
      B.stone.cyl(gx2, gy + 0.25, gz2, 0.32, 0.12, 10, lin('#a8a0a8'));
      B.wood.box(gx2, gy - 0.05, gz2, 0.1, 0.32, 0.5, lin('#6a4a34'), bd.rot);
    }
    for (const [tx, tw2, th, tc] of [[-2.25, 0.06, 0.55, '#7a5640'], [-2.0, 0.24, 0.08, '#6a6a7a'], [-1.75, 0.06, 0.5, '#7a5640']]) box(B.flat, tx, gy + 1.0, fz + 0.04, tw2, th, 0.04, lin(tc));
    const [lx2, , lz2] = at(0.55, 0, fz + 0.18);
    G.lamp.box(lx2, gy + 2.0, lz2, 0.16, 0.22, 0.16, [1, 1, 1], bd.rot);
    ctx.out.lights.push({ kind: 'lantern', x: lx2, y: gy + 2.1, z: lz2 });
  } else {
    win(-W * 0.22, gy + 1.0, 0.9, 0.8);
  }
  // the side and back walls (blank in the first art passes: seen as soon as the camera is turned): shuttered windows with their glowing glass
  const sideWin = (sx, lz, wy, ww, wh) => {
    const frame = cabin ? '#b07848' : bd.type === 'workshop' ? '#7a5a40' : st.frame;
    let pane = { w: ww, h: wh, cy: wy + wh / 2 };
    if (frontM) pane = MP.sideWindow(B, bd, at, sx, lz, wy + wh / 2, ww, W, frame);
    else {
      const F2 = lin('#f2e6c8');
      box(B.flat, sx * (W / 2 + 0.03), wy - 0.08, lz, 0.1, 0.08, ww + 0.2, F2);
      box(B.flat, sx * (W / 2 + 0.03), wy + wh, lz, 0.1, 0.08, ww + 0.2, F2);
      box(B.flat, sx * (W / 2 + 0.03), wy, lz - ww / 2 - 0.06, 0.1, wh, 0.08, F2);
      box(B.flat, sx * (W / 2 + 0.03), wy, lz + ww / 2 + 0.06, 0.1, wh, 0.08, F2);
    }
    const [gx, , gz] = at(sx * (W / 2 + 0.012), 0, lz);
    G.win.box(gx, pane.cy - pane.h / 2, gz, 0.02, pane.h, pane.w, [1, 1, 1], bd.rot);
  };
  const sideZ = bd.type === 'shop' || bd.type === 'workshop' ? 0.25 : 0;
  for (const sx of [-1, 1]) sideWin(sx, sideZ, gy + (cabin ? 1.0 : 1.0), cabin ? 0.95 : 0.9, cabin ? 0.85 : 0.8);
  if (cabin) {
    win(-1.1, gy + 1.0, 1.0, 0.85, -1);
    win(1.2, gy + 1.0, 1.0, 0.85, -1);
  } else if (bd.type === 'shop') {
    win(-1.7, gy + 1.0, 1.0, 0.85, -1);
    win(1.7, gy + 1.0, 1.0, 0.85, -1);
  } else win(0, gy + 1.0, 0.9, 0.8, -1);
  for (const b of [B.wood, B.plaster, B.stone, B.flat, B.roof]) b.occ = 0;
}

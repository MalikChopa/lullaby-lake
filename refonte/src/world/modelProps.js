// Art pass: the props drawn from the Kenney models (world/models.js) instead of by code. Every function here has the SAME signature and the same
// footprint as the painter of world/painters.js it replaces, and returns true when it drew the prop; when a model is missing (file not loaded) it
// returns false and the code-made painter runs (the game never breaks). Models are merged into the same builders as the rest of the chunk (no extra
// draw call). Foliage uses the `mleaf` family (wind sway, like the code-made foliage); everything else the rigid `flat` family.
//
// Scale: 1 world unit = 1 metre; the pine, round tree, bush, rock, stump, log, barrel, crate... keep the height of the code-made ones (the
// sprite pixel size is unchanged), so footprints in data/map.js and the collision shapes (logic/collide.js) still match.

import { getModel, stamp } from './models.js';
import { WATER_Y } from '../data/params.js';
import { lin } from './geo.js';

const hash2 = (x, z) => {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const have = (...ids) => ids.every((id) => !!getModel(id));
const swayAbove = (y0, h) => [y0, h];

const PINES = ['pine_a', 'pine_b', 'pine_c', 'pine_d', 'pine_e', 'pine_f'];
const PINE_HEIGHT = { pine_a: 4.2, pine_b: 4.8, pine_c: 4.3, pine_d: 3.9, pine_e: 4.0, pine_f: 4.0 };
const PINE_GIRTH = { pine_a: 1.15, pine_b: 1.2, pine_c: 1.05, pine_d: 0.85, pine_e: 0.95, pine_f: 0.9 };
const TREES = ['tree_a', 'tree_b', 'tree_c', 'tree_d'];
const BUSHES = ['bush_a', 'bush_b', 'bush_c', 'bush_d'];
const BUSH_HEX = ['#5f9a46', '#8aa848', '#b8743e', '#3f7a46', '#4c8a52'];
const TREE_HEX = ['#5f9a46', '#76ae50'];

// round 2: the forest is a mix (pines, round and slim leafy trees, young pines), not one family. [id, height, girth]
const LEAFY = [['tree_c', 4.6, 1.3], ['tree_g', 4.2, 1.5], ['tree_e', 4.4, 1.3], ['tree_d', 3.4, 1.5]];
const LEAFY_HEX = ['#5f9a46', '#76ae50', '#4c8a52', '#8aa848', '#5f9a46', '#b8743e'];
const YOUNG = [['pine_s', 2.8, 1.3], ['pine_g', 2.5, 1.3], ['pine_k', 3.4, 1.2]];

/** The pines. lod = the far, cheap ones (the two lowest-poly variants). */
export function pine(B, p, ctx, lod = false) {
  if (!lod && have('tree_c', 'pine_s')) {
    const r = hash2(p.x * 0.77 + 3.1, p.z * 1.31 + 9.7);
    if (r < 0.3) {
      const leafy = r < 0.2;
      const [id, h, g] = leafy ? LEAFY[Math.floor(hash2(p.x * 2.3, p.z * 0.9) * LEAFY.length)] : YOUNG[Math.floor(hash2(p.x * 1.1, p.z * 3.7) * YOUNG.length)];
      const m = getModel(id);
      if (m) {
        const s = p.s;
        const y = ctx.h(p.x, p.z) - 0.1;
        const occ = ctx.occ('pine', [p.x, y + 2 * s, p.z], 1.4 * s);
        B.mleaf.occ = occ;
        const hex = LEAFY_HEX[Math.floor(hash2(p.x * 5.1, p.z * 2.9) * LEAFY_HEX.length)];
        stamp(B.mleaf, m, { x: p.x, y, z: p.z, rot: p.rot, h: h * s, sx: g, sz: g, vary: 0.14, sway: swayAbove(y + 1.0 * s, 3 * s), swap: leafy ? { leaf: hex } : undefined });
        B.mleaf.occ = 0;
        return true;
      }
    }
  }
  const ids = lod ? ['pine_a', 'pine_b'] : PINES;
  const id = ids[Math.floor(hash2(p.x * 1.3, p.z * 0.7) * ids.length)];
  const m = getModel(id);
  if (!m) return false;
  const s = p.s;
  const y = ctx.h(p.x, p.z) - 0.1;
  const occ = lod ? 0 : ctx.occ('pine', [p.x, y + 2.2 * s, p.z], 1.5 * s);
  const b = B.mleaf;
  b.occ = occ;
  stamp(b, m, { x: p.x, y, z: p.z, rot: p.rot, h: PINE_HEIGHT[id] * s, sx: PINE_GIRTH[id], sz: PINE_GIRTH[id], vary: 0.18, sway: swayAbove(y + 1.2 * s, 4 * s), tint: p.v % 3 === 2 ? [1.15, 1.12, 0.78] : null });
  b.occ = 0;
  return true;
}

export function tree(B, p, ctx) {
  if (!have('tree_a')) return false;
  const s = p.s;
  const y = ctx.h(p.x, p.z) - 0.1;
  const id = TREES[(p.v + Math.floor(hash2(p.x, p.z) * 2)) % 2];
  const m = getModel(id);
  const occ = ctx.occ('tree', [p.x, y + 2.4 * s, p.z], 1.8 * s);
  B.mleaf.occ = occ;
  stamp(B.mleaf, m, { x: p.x, y, z: p.z, rot: p.rot, h: 4.5 * s, sx: 1.2, sz: 1.2, vary: 0.12, sway: swayAbove(y + 1.5 * s, 2.5 * s), swap: { leaf: TREE_HEX[p.v % 2] } });
  B.mleaf.occ = 0;
  return true;
}

export function bush(B, p, ctx) {
  if (!have('bush_a')) return false;
  const s = p.s;
  const y = ctx.h(p.x, p.z) - 0.05;
  const k = (p.v + Math.floor(hash2(Math.floor(p.x / 7), Math.floor(p.z / 7)) * 5)) % BUSH_HEX.length;
  const id = BUSHES[Math.floor(hash2(p.x * 3.1, p.z * 1.7) * BUSHES.length)];
  stamp(B.mleaf, getModel(id), { x: p.x, y, z: p.z, rot: p.rot, w: 1.55 * s, vary: 0.15, sway: swayAbove(y, 1.0 * s), swap: { leaf: BUSH_HEX[k] } });
  // flowers on some bushes (the same small boxes as the code-made bush)
  const fl = k === 3 ? [lin('#f6a0b8'), lin('#fff0c0')] : k === 4 ? [lin('#a8b8ff'), lin('#fff6e0')] : p.v % 2 === 0 ? [lin('#f6a0b8'), lin('#fff0c0')] : null;
  if (fl) for (let i = 0; i < 6; i++) B.dflat.box(p.x + Math.cos(i * 1.9 + p.rot) * 0.5 * s, y + 0.45 * s + (i % 3) * 0.1, p.z + Math.sin(i * 1.9 + p.rot) * 0.5 * s + 0.1, 0.09, 0.09, 0.09, fl[i % 2]);
  return true;
}

export function rock(B, p, ctx) {
  if (!have('stone_l1')) return false;
  const s = p.s;
  const r = hash2(p.x * 2.1, p.z * 5.3);
  const id = s < 0.45 ? ['stone_s1', 'stone_s2', 'stone_s3'][Math.floor(r * 3)] : s < 1.0 ? ['stone_l1', 'stone_l2', 'stone_l3', 'stone_t1', 'stone_t2', 'stone_t3'][Math.floor(r * 6)] : ['stone_l1', 'stone_l2', 'stone_l3', 'stone_t1'][Math.floor(r * 4)];
  stamp(B.flat, getModel(id), { x: p.x, y: ctx.h(p.x, p.z) - 0.12, z: p.z, rot: r * 6.28, w: 1.5 * s + 0.2, sy: 1.1, vary: 0.2, tint: p.v % 2 ? [1.04, 1.0, 1.04] : null });
  return true;
}

export function stump(B, p, ctx) {
  if (!have('stump_a')) return false;
  const id = p.v % 2 ? 'stump_b' : 'stump_a';
  stamp(B.flat, getModel(id), { x: p.x, y: ctx.h(p.x, p.z) - 0.1, z: p.z, rot: p.rot, w: 0.85 * p.s, vary: 0.1 });
  return true;
}

export function log(B, p, ctx) {
  if (!have('log_a')) return false;
  // the model lies along its local z; the code-made log along (cos rot, -sin rot)
  stamp(B.flat, getModel(p.v % 2 ? 'log_b' : 'log_a'), { x: p.x, y: ctx.h(p.x, p.z) + 0.02, z: p.z, rot: p.rot + Math.PI / 2, w: 1.9 * p.s, sy: 1.0, vary: 0.1 });
  return true;
}

export function mushroom(B, p, ctx) {
  if (!have('mush_r')) return false;
  const id = p.v % 3 === 2 ? 'mush_t' : p.v % 3 === 1 ? 'mush_r' : 'mush_s';
  stamp(B.dflat, getModel(id), { x: p.x, y: ctx.h(p.x, p.z) - 0.02, z: p.z, rot: p.rot, h: 0.34 * p.s, vary: 0.1 });
  return true;
}

/** Ferns (round 2): a tuft of leaves (Nature Kit grass_leafsLarge / plant_flatTall) in the detail family. */
export function fern(B, p, ctx) {
  if (!have('fern_a', 'fern_b')) return false;
  const y = ctx.h(p.x, p.z) - 0.02;
  const big = p.v % 3 !== 2;
  stamp(B.dfoliage, getModel(big ? 'fern_a' : 'fern_b'), { x: p.x, y, z: p.z, rot: p.rot * 2, w: (big ? 0.95 : 0.55) * p.s, vary: 0.2, sway: swayAbove(y, 0.4), swap: { leaf: p.v % 2 ? '#4f8e44' : '#5f9e4a' } });
  return true;
}

export function lily(B, p) {
  if (!have('lily_l')) return false;
  stamp(B.dflat, getModel(p.s > 0.45 ? 'lily_l' : 'lily_s'), { x: p.x, y: WATER_Y + 0.005, z: p.z, rot: p.x * 7, w: 1.9 * p.s });
  return true;
}

export function lamp(B, p, ctx, G) {
  if (!have('lantern')) return false;
  const deck = ctx.deckY(p.x, p.z);
  const y = deck !== null ? deck : ctx.h(p.x, p.z) - 0.05;
  const H = 2.6;
  stamp(B.flat, getModel('lantern'), { x: p.x, y, z: p.z, h: H + 0.62, sx: 1.2, sz: 1.2, swap: { stone: '#3a3440', wood: '#5a4a52' } });
  G.lamp.box(p.x, y + H + 0.08, p.z, 0.3, 0.34, 0.3, [1, 1, 1]);
  ctx.out.lights.push({ kind: 'lamp', x: p.x, y: y + H + 0.25, z: p.z });
  return true;
}

export function bench(B, p, ctx) {
  if (!have('bench')) return false;
  const y = ctx.h(p.x, p.z) - 0.03;
  const m = getModel('bench');
  // the model's back is at -z, its seat faces +z like the code-made bench (front = +z local)
  stamp(B.flat, m, { x: p.x, y, z: p.z, rot: p.rot, sx: 1.55 / m.w, sy: 0.95 / m.h, sz: 0.62 / m.d, swap: { wood: '#b07a4a', red: '#a05a4a' } });
  return true;
}

export function barrel(B, p, ctx) {
  if (!have('barrel')) return false;
  stamp(B.flat, getModel('barrel'), { x: p.x, y: ctx.h(p.x, p.z) - 0.03, z: p.z, rot: p.rot, h: 0.82 * p.s, vary: 0.08, swap: { wood: '#9a6a44' } });
  return true;
}

export function crate(B, p, ctx) {
  if (!have('box')) return false;
  stamp(B.flat, getModel('box'), { x: p.x, y: ctx.h(p.x, p.z) - 0.03, z: p.z, rot: p.rot, w: 0.72 * p.s, vary: 0.08 });
  return true;
}

export function sign(B, p, ctx) {
  if (!have('signpost')) return false;
  stamp(B.flat, getModel('signpost'), { x: p.x, y: ctx.h(p.x, p.z) - 0.05, z: p.z, rot: p.rot - Math.PI / 2, h: 1.75 });
  return true;
}

// ------------------------------------------------------------------ buildings (Fantasy Town Kit pieces scaled to the footprints of data/map.js)
/** True when the models of the modular houses are loaded (else the code-made walls, roof, door and windows are drawn). */
export const buildingModels = (bd) => have('wall_block', 'wall_wood', 'roof', 'chimney');
/** True when the door and the shuttered window panels are loaded (the code-made door and window frames are drawn otherwise). */
export const frontModels = () => have('door', 'window');
/** The cabin (the start place, a timber log cabin): warm honey walls, a rust-red roof. */
const CABIN_STYLE = { wall: '#c98e5a', frame: '#8a5a3a', roof: '#b0584a', edge: '#7a3a34' };

/**
 * The shell of a house: a plaster (or timber) block of the footprint, the gable roof, the chimney. `at(lx, ly, lz)` = the building's local frame
 * to world (painters.js building()); B.plaster / B.wood / B.roof / B.stone keep the pixel textures of the code-made walls and roofs (the
 * builder projects the uv from the triangle), the model gives the shapes and the light/dark trims.
 */
export function houseShell(B, bd, at, gy, wallH, roofH, st) {
  const cabin = bd.type === 'cabin';
  if (cabin) st = CABIN_STYLE;
  const workshop = bd.type === 'workshop' || cabin; // timber walls: the textured wood family
  const W = bd.w;
  const D = bd.d;
  const wall = getModel(workshop ? 'wall_wood' : 'wall_block');
  const [x, , z] = at(0, 0, 0);
  const wallHex = cabin ? st.wall : workshop ? '#a87a52' : st.wall;
  const frameHex = cabin ? st.frame : workshop ? '#6a4a34' : st.frame;
  stamp(workshop ? B.wood : B.plaster, wall, { x, y: gy + 0.12, z, rot: bd.rot, sx: W / wall.w, sy: wallH / wall.h, sz: D / wall.d, swap: workshop ? { wood: wallHex } : { stone: wallHex, wood: frameHex } });
  const roof = getModel('roof');
  const top = gy + 0.12 + wallH;
  const roofHex = cabin ? st.roof : workshop ? '#6a6a7a' : st.roof;
  const edgeHex = cabin ? st.edge : workshop ? '#3a3a4a' : st.edge;
  stamp(B.roof, roof, { x, y: top - 0.26, z, rot: bd.rot, sx: (W + 0.8) / roof.w, sy: (roofH + 0.3) / roof.h, sz: (D + 0.8) / roof.d, swap: { leaf: roofHex, wood: edgeHex, stone: edgeHex } });
  const chim = getModel('chimney');
  const [chx, , chz] = at(W * 0.27, 0, -D * 0.17);
  stamp(B.stone, chim, { x: chx, y: top - 0.1, z: chz, rot: bd.rot, sx: 2.6, sy: roofH + 0.95, sz: 1.8, swap: { stone: '#a89a90' } });
}

/**
 * The front door of a building: the Fantasy Town door panel (a framed arched door, 1 x 1 m before scaling, thin along its local x) set against
 * the front wall, h metres tall. doorX = local x of the door on the front face, fz = half depth of the building, hex = door colour.
 */
export function frontDoor(B, bd, at, gy, doorX, fz, h, hex) {
  const m = getModel('door');
  const [x, , z] = at(doorX, 0, fz + 0.05 * h);
  stamp(B.wood, m, { x, y: gy + 0.12, z, rot: bd.rot - Math.PI / 2, s: h, swap: { wood: hex } });
}

/**
 * A shuttered window panel on the front wall (the frame, sill and shutters; the opening is a real hole, the glowing glass pane is drawn behind it by the caller).
 * ww = nominal width. cy = world y of the centre of the opening. Returns the opening { w, h, cy } for the glass pane.
 */
export function frontWindow(B, bd, at, wx, cy, ww, fz, hex, face = 1) {
  const m = getModel('window');
  const s = ww * 1.12;
  const [x, , z] = at(wx, 0, face * (fz + 0.05 * s));
  stamp(B.wood, m, { x, y: cy - 0.5 * s, z, rot: bd.rot - Math.PI / 2 + (face < 0 ? Math.PI : 0), s, swap: { wood: hex } });
  return { w: 0.5 * s, h: 0.6 * s, cy };
}

/**
 * A shuttered window panel on a SIDE wall (sx = +1 east / -1 west in the building's frame, lz = along the wall, W = the width of the building): the
 * blank side and back walls of the houses were the biggest "unfinished" look when the camera is turned. Returns the opening { w, h, cy } for the glass.
 */
export function sideWindow(B, bd, at, sx, lz, cy, ww, W, hex) {
  const m = getModel('window');
  const s = ww * 1.12;
  const [x, , z] = at(sx * (W / 2 + 0.05 * s), 0, lz);
  stamp(B.wood, m, { x, y: cy - 0.5 * s, z, rot: bd.rot + (sx < 0 ? Math.PI : 0), s, swap: { wood: hex } });
  return { w: 0.5 * s, h: 0.6 * s, cy };
}

/**
 * The porch of the cabin: a plank floor in front of the door, two posts and a short shed roof that fades with the cabin's roof (same occluder),
 * a lantern bracket by the door. at(lx, ly, lz) = the building frame (painters.js), doorX / fz as for frontDoor.
 */
export function cabinPorch(B, G, bd, at, gy, doorX, fz, ctx) {
  if (!have('planks', 'post')) return false;
  const pw = 2.5;
  const pd = 1.0;
  const [px, , pz] = at(doorX, 0, fz + pd / 2);
  stamp(B.wood, getModel('planks'), { x: px, y: gy + 0.04, z: pz, rot: bd.rot - Math.PI / 2, sx: pd, sz: pw, swap: { wood: '#b98a5e' } });
  const posts = [];
  for (const dx of [-pw / 2 + 0.1, pw / 2 - 0.1]) {
    const [x, , z] = at(doorX + dx, 0, fz + pd - 0.1);
    stamp(B.wood, getModel('post'), { x, y: gy + 0.08, z, rot: bd.rot, sx: 1.1, sz: 1.1, sy: 2.4, swap: { wood: '#6a4a34' } });
    posts.push([x, z]);
  }
  // the shed roof: one slope from the wall (high) to the posts (low), a fascia board at its front edge
  const R = B.roof;
  const col = lin('#a5503f');
  const yb = gy + 2.7;
  const yf = gy + 2.5;
  const ov = 0.12;
  const P = (lx, y, lz) => at(lx, y, lz);
  const x0 = doorX - pw / 2 - ov;
  const x1 = doorX + pw / 2 + ov;
  const zf = fz + pd + ov;
  R.quad(P(x0, yb, fz), P(x0, yf, zf), P(x1, yf, zf), P(x1, yb, fz), col);
  R.quad(P(x0, yf - 0.16, zf), P(x1, yf - 0.16, zf), P(x1, yf, zf), P(x0, yf, zf), [0.28, 0.07, 0.05]);
  R.quad(P(x0, yf, zf), P(x0, yb, fz), P(x0, yb - 0.16, fz), P(x0, yf - 0.16, zf), [0.28, 0.07, 0.05]);
  R.quad(P(x1, yb, fz), P(x1, yf, zf), P(x1, yf - 0.16, zf), P(x1, yb - 0.16, fz), [0.28, 0.07, 0.05]);
  // a lantern on the post (the warm glow of the door; its light is a 'lantern' source)
  const [lx, , lz] = at(doorX + pw / 2 - 0.1, 0, fz + pd + 0.12);
  B.flat.box(lx, gy + 2.18, lz, 0.03, 0.22, 0.03, lin('#2a2430'));
  G.lamp.box(lx, gy + 1.92, lz, 0.15, 0.22, 0.15, [1, 1, 1], bd.rot);
  ctx.out.lights.push({ kind: 'lantern', x: lx, y: gy + 2.0, z: lz });
  return posts;
}

/**
 * The well of the plaza (footprint unchanged: radius 1): a stone ring, a water disc, two posts, a pointed tiled hood and a bucket.
 * The code-made well had a flat dark red roof that read as a brick block from the game camera.
 */
export function well(B, p, ctx) {
  if (!have('post', 'bucket')) return false;
  const y = ctx.h(p.x, p.z) - 0.1;
  B.stone.cyl(p.x, y, p.z, 0.95, 0.72, 10, lin('#b4aaa0'), true);
  B.stone.cyl(p.x, y, p.z, 0.72, 0.73, 10, lin('#8a8078'), true);
  B.flat.cyl(p.x, y + 0.5, p.z, 0.72, 0.02, 10, lin('#3f6ea0'));
  B.stone.cyl(p.x, y + 0.71, p.z, 0.97, 0.09, 10, lin('#cfc5ba'));
  for (const sx of [-1, 1]) stamp(B.wood, getModel('post'), { x: p.x + sx * 0.82, y: y + 0.7, z: p.z, sx: 1.5, sz: 1.5, sy: 1.85, swap: { wood: '#7a5640' } });
  B.wood.box(p.x, y + 2.1, p.z, 1.8, 0.09, 0.09, lin('#6a4a34'));
  // a pointed six-sided hood (it reads as a roof from the game camera; a gable showed only its flat south slope)
  B.roof.cone(p.x, y + 2.14, p.z, 1.3, 0.95, 6, lin('#c4744a'), 0.3, lin('#a85d3a'));
  B.roof.cyl(p.x, y + 2.1, p.z, 1.3, 0.08, 6, lin('#7a4a34'), true);
  // the rope and the bucket hanging from the beam, a second bucket on the rim
  B.flat.box(p.x + 0.1, y + 1.45, p.z, 0.025, 0.65, 0.025, lin('#d8c8a0'));
  stamp(B.flat, getModel('bucket'), { x: p.x + 0.1, y: y + 1.12, z: p.z, h: 0.36, swap: { wood: '#9a6a44' } });
  stamp(B.flat, getModel('bucket'), { x: p.x - 0.35, y: y + 0.78, z: p.z + 0.66, rot: 0.6, h: 0.32 });
  return true;
}

// ------------------------------------------------------------------ the spirit tree of the islet
/**
 * A real small tree (a Nature Kit tree with its bark and leaves recoloured pale lavender and pale cyan, lit like any tree) with SMALL glowing
 * blobs among its leaves (G.spirit, the only emissive part: a soft glow instead of the old white cloud). Keeps the "spiritTree" occluder and the
 * 'spirit' light of the code-made tree.
 */
export function spiritTree(B, p, ctx, G) {
  if (!have('tree_c')) return false;
  const y = ctx.h(p.x, p.z) - 0.1;
  const H = 4.1; // the game camera shows the whole tree only up to about this height (a taller one left the frame at the top)
  const k = H / 5.3;
  // a graceful round-crowned tree (Nature Kit tree_default: a long pale trunk, one clean crown), lilac-white leaves, pearl bark
  stamp(B.mleaf, getModel('tree_c'), { x: p.x, y, z: p.z, rot: 0.6, h: H, sx: 1.0, sz: 1.0, sway: swayAbove(y + 2.2 * k, 3 * k), swap: { leaf: "#f0d2ea", wood: '#ece0d2', stone: '#ece0d2' } });
  // soft hanging moss under the crown (pale, not emissive) and little glowing blobs among the leaves (G.spirit, the only emissive part)
  if (have('moss')) {
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4 + 0.3;
      const rr = 0.7 + 0.35 * ((i * 7) % 3);
      stamp(B.mleaf, getModel('moss'), { x: p.x + Math.cos(a) * rr, y: y + (2.7 + 0.35 * (i % 3)) * k, z: p.z + Math.sin(a) * rr, rot: a, h: 0.8, sx: 1.6, sway: swayAbove(y, 3.5), swap: { leaf: '#cdeede' } });
    }
  }
  // blossom clumps round the crown (round bushes tinted lilac and pale pink): the crown reads as a soft blossoming canopy, not as one hexagonal block
  if (have('bush_a', 'bush_c')) {
    const tints = ['#ecc6e6', '#f8dcee', '#dcb8e6', '#f2d0ea'];
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4 + 0.6;
      const rr = 0.85 + 0.35 * (i % 3);
      const cy = (3.0 + 0.5 * (i % 4) + (i > 5 ? 0.6 : 0)) * k;
      stamp(B.mleaf, getModel(i % 2 ? 'bush_c' : 'bush_a'), { x: p.x + Math.cos(a) * rr, y: y + cy, z: p.z + Math.sin(a) * rr, rot: a, w: (1.5 + 0.25 * (i % 3)) * (0.8 + 0.2 * k), sway: swayAbove(y + cy, 1.2), swap: { leaf: tints[i % 4] } });
    }
  }
  const blobs = [[0.9, 3.7, 0.5], [-0.9, 4.1, 0.4], [0.2, 5.0, -0.2], [-0.4, 3.4, 0.9], [1.0, 4.6, -0.3], [-1.0, 4.9, -0.2], [0.5, 4.2, 0.95], [-0.6, 3.9, -0.8], [0.1, 4.3, 0.9], [0.4, 3.5, -0.9]];
  for (const [dx0, dy0, dz0] of blobs) {
    const dx = dx0 * 1.2;
    const dz = dz0 * 1.2;
    const dy = dy0 * k;
    const r = 0.16 + (Math.abs(dx * 7 + dz * 3) % 1) * 0.07;
    G.spirit.cone(p.x + dx, y + dy - r, p.z + dz, r, r, 4, [1, 1, 1], 0.7);
    G.spirit.cone(p.x + dx, y + dy - r, p.z + dz, r, -r, 4, [1, 1, 1], 0.7);
  }
  ctx.out.lights.push({ kind: 'spirit', x: p.x, y: y + 4.0 * k, z: p.z });
  ctx.occ('spiritTree', [p.x, y + 3 * k, p.z], 2.4);
  return true;
}

// ------------------------------------------------------------------ fences (Fantasy Town Kit picket panels along the polylines of data/map.js FENCES)
export function fence(B, pts, ctx) {
  if (!have('fence')) return false;
  const m = getModel('fence');
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, z0] = pts[k];
    const [x1, z1] = pts[k + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2.2));
    const rot = Math.atan2(x1 - x0, z1 - z0); // the panel lies along its local z
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      stamp(B.flat, m, { x, y: ctx.h(x, z) - 0.08, z, rot, sx: 2.7, sy: 2.7, sz: len / n / m.d, vary: 0.06, swap: { wood: '#c9a27a' } });
    }
  }
  return true;
}

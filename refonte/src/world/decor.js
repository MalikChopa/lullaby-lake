// The cosmetic decor (logic/decor.js lists it, data/map.js DECOR holds the hand-placed items): camp life, firewood, a washing line, a rain barrel,
// an oar against the wall, flower beds, pots, hedges, a cart. Everything is made of Kenney models (world/models.js) merged into the chunk builders of
// the world (no extra draw call). An item whose models are not loaded is simply not drawn (it is only decoration: the game never depends on it).
// Item = [kind, x, z, rot, scale]; ground height from ctx.h. Small things go to the "detail" families (dflat: hidden beyond the tier's detail distance).

import { getModel, stamp } from './models.js';
import { lin } from './geo.js';

const hash2 = (x, z) => {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const have = (...ids) => ids.every((id) => !!getModel(id));
const FLOWERS = ['fl_p1', 'fl_r1', 'fl_y1', 'fl_p2', 'fl_r2', 'fl_y2'];

/** The world position of the local offset (lx, lz) of an item turned by rot (local +x -> (cos rot, -sin rot), local +z -> (sin rot, cos rot)). */
const loc = (x, z, rot, lx, lz) => [x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot)];

/** A thin rope between two points as short yaw-turned boxes with a little sag. */
function rope(b, x0, y0, z0, x1, y1, z1, sag, col) {
  const n = 6;
  const L = Math.hypot(x1 - x0, z1 - z0);
  const rot = Math.atan2(-(z1 - z0), x1 - x0);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const y = y0 + (y1 - y0) * t - sag * 4 * t * (1 - t);
    b.box(x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t, L / n + 0.02, 0.035, 0.035, col, rot);
  }
}

function campfire(B, G, ctx, [, x, z, rot, s]) {
  if (!have('campfire')) return false;
  const y = ctx.h(x, z);
  stamp(B.flat, getModel('campfire'), { x, y: y - 0.02, z, rot, w: 0.95 * s });
  // the flame: a small glowing cone (G.lamp, warm), a point light at night
  B.flat.cone(x, y + 0.1, z, 0.19 * s, 0.42 * s, 5, lin('#f0731c'), rot, lin('#ffb030'));
  G.lamp.cone(x, y + 0.12, z, 0.1 * s, 0.6 * s, 4, [1, 1, 1], rot + 0.7);
  ctx.out.lights.push({ kind: 'lantern', x, y: y + 0.85, z });
  // three log seats around it, turned along the circle (the model lies along its local z)
  if (have('log_a', 'log_b')) {
    for (let i = 0; i < 3; i++) {
      const a = rot + 0.4 + i * 2.15;
      const px = x + Math.cos(a) * 1.25 * s;
      const pz = z - Math.sin(a) * 1.25 * s;
      stamp(B.flat, getModel(i === 1 ? 'log_b' : 'log_a'), { x: px, y: ctx.h(px, pz) + 0.02, z: pz, rot: a, w: 1.05 * s, vary: 0.1 });
    }
  }
  return true;
}

/** A square-section bar between two 3D points (a sloped pole): 4 long faces and 2 end caps, wound outward. */
function strut(b, [x0, y0, z0], [x1, y1, z1], t, col) {
  const d = [x1 - x0, y1 - y0, z1 - z0];
  const len = Math.hypot(...d) || 1;
  const u = d.map((v) => v / len);
  // any vector not parallel to the bar, to build the two side axes
  const ref = Math.abs(u[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const cr = (a, c) => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];
  const nrm = (v) => {
    const l = Math.hypot(...v) || 1;
    return v.map((q) => q / l);
  };
  const s1 = nrm(cr(u, ref));
  const s2 = cr(u, s1);
  const h = t / 2;
  const corner = (o, k1, k2) => [o[0] + s1[0] * h * k1 + s2[0] * h * k2, o[1] + s1[1] * h * k1 + s2[1] * h * k2, o[2] + s1[2] * h * k1 + s2[2] * h * k2];
  const A = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const p0 = A.map(([k1, k2]) => corner([x0, y0, z0], k1, k2));
  const p1 = A.map(([k1, k2]) => corner([x1, y1, z1], k1, k2));
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    b.quad(p0[i], p0[j], p1[j], p1[i], col);
  }
  b.quad(p0[3], p0[2], p0[1], p0[0], col);
  b.quad(p1[0], p1[1], p1[2], p1[3], col);
}

/**
 * A real A-frame tent (it replaces the Survival Kit lean-to, which read as a flat canvas sheet): two canvas slopes in three patched panels with a darker
 * hem, a dark open doorway with two tied-back flaps, a ridge pole that pokes out of both ends, four guy ropes to pegs. Local z = the ridge, door at +z.
 */
function tent(B, G, ctx, [, x, z, rot, s]) {
  const W = 1.0 * s;
  const L = 1.15 * s;
  const H = 1.4 * s;
  const gy = ctx.h(x, z) - 0.02;
  const P = (lx, ly, lz) => {
    const [wx, wz] = loc(x, z, rot, lx * s, lz * s);
    return [wx, gy + ly * s, wz];
  };
  const w = W / s;
  const l = L / s;
  const h = H / s;
  const canvas = ['#d9c08a', '#cdb07a', '#dcc592'].map((c) => lin(c));
  const hem = lin('#a98a5c');
  const dark = lin('#2b2420');
  const rows = 3;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < rows; i++) {
      const z0 = -l + (2 * l * i) / rows;
      const z1 = -l + (2 * l * (i + 1)) / rows;
      const col = canvas[(i + (sx > 0 ? 1 : 0)) % 3];
      const lo = 0.22; // the hem band (share of the slope height)
      const mx = sx * w * (1 - lo);
      const my = h * lo;
      const q = (a, b2, c, d, cc) => (sx > 0 ? B.flat.quad(b2, a, d, c, cc) : B.flat.quad(a, b2, c, d, cc));
      // upper panel then hem band (right slope winding; the left one is mirrored)
      q(P(mx, my, z0), P(mx, my, z1), P(0, h, z1), P(0, h, z0), col);
      q(P(sx * w, 0, z0), P(sx * w, 0, z1), P(mx, my, z1), P(mx, my, z0), hem);
    }
  }
  // back wall, the front doorway (dark) and two flaps tied back
  B.flat.tri(P(w, 0, -l), P(-w, 0, -l), P(0, h, -l), canvas[0]);
  B.flat.tri(P(-w, 0, l), P(w, 0, l), P(0, h, l), dark);
  B.flat.tri(P(-w, 0, l + 0.02), P(-0.18, 0, l + 0.03), P(0, h, l + 0.03), canvas[1]);
  B.flat.tri(P(0.18, 0, l + 0.03), P(w, 0, l + 0.02), P(0, h, l + 0.03), canvas[2]);
  // the ridge pole (a bar that pokes out at both ends) and two pegs per side with a rope each
  const wood = lin('#7a5a42');
  strut(B.flat, P(0, h + 0.03, -l - 0.18), P(0, h + 0.03, l + 0.18), 0.07, wood);
  const rope = lin('#d8c8a0');
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const a = P(sx * w * 0.5, h * 0.5, sz * l * 0.9);
      const peg = P(sx * (w + 0.55), 0, sz * (l + 0.35));
      const pegTop = [peg[0], ctx.h(peg[0], peg[2]) + 0.14, peg[2]];
      strut(B.flat, [peg[0], ctx.h(peg[0], peg[2]) - 0.02, peg[2]], pegTop, 0.05, wood);
      strut(B.flat, a, pegTop, 0.02, rope);
    }
  }
  return true;
}

/**
 * A fish-drying frame (the Survival Kit "tent" frame read as a tent skeleton): two A-frame ends with a high beam and a lower rail, built from poles, with
 * fish (Survival Kit models) hanging head down from short cords on both. Local x = the beam.
 */
function rack(B, G, ctx, [, x, z, rot, s]) {
  const gy = ctx.h(x, z) - 0.03;
  const P = (lx, ly, lz) => {
    const [wx, wz] = loc(x, z, rot, lx * s, lz * s);
    return [wx, gy + ly * s, wz];
  };
  const wood = lin('#7d5c42');
  const dark = lin('#6a4a34');
  const xe = 0.85;
  const top = 1.6;
  for (const sx of [-1, 1]) {
    strut(B.flat, P(sx * xe, 0, 0.34), P(sx * xe, top, 0.03), 0.09 * s, wood);
    strut(B.flat, P(sx * xe, 0, -0.34), P(sx * xe, top, -0.03), 0.09 * s, wood);
    strut(B.flat, P(sx * xe, 0.68, 0.17), P(sx * xe, 0.68, -0.17), 0.06 * s, dark);
  }
  strut(B.flat, P(-1.1, top - 0.03, 0), P(1.1, top - 0.03, 0), 0.1 * s, dark);
  strut(B.flat, P(-xe - 0.1, 0.72, 0), P(xe + 0.1, 0.72, 0), 0.07 * s, dark);
  if (have('fish_l', 'fish_s')) {
    const cord = lin('#d8c8a0');
    const hang = (lx, ly, id, w, tint) => {
      const [fx, , fz] = P(lx, 0, 0.0);
      strut(B.dflat, [fx, gy + ly * s, fz], [fx, gy + (ly - 0.14) * s, fz], 0.02, cord);
      stamp(B.dflat, getModel(id), { x: fx, y: gy + (ly - 0.14 - w / 2) * s, z: fz, rot, anchor: 'center', roll: -Math.PI / 2, w: w * s, tint });
    };
    for (let i = 0; i < 5; i++) hang(-0.72 + i * 0.36, top - 0.08, i % 2 ? 'fish_s' : 'fish_l', i % 2 ? 0.4 : 0.52, i % 2 ? [1, 0.95, 0.9] : [1.02, 0.98, 0.92]);
    for (let i = 0; i < 4; i++) hang(-0.54 + i * 0.36, 0.72 - 0.04, i % 2 ? 'fish_l' : 'fish_s', i % 2 ? 0.4 : 0.34, [0.98, 0.94, 0.88]);
  }
  return true;
}

function bedroll(B, G, ctx, [, x, z, rot, s]) {
  if (!have('bedroll')) return false;
  stamp(B.flat, getModel('bedroll'), { x, y: ctx.h(x, z) - 0.02, z, rot, w: 1.2 * s });
  return true;
}

function bucket(B, G, ctx, [, x, z, rot, s]) {
  if (!have('bucket')) return false;
  stamp(B.dflat, getModel('bucket'), { x, y: ctx.h(x, z) - 0.02, z, rot, h: 0.42 * s });
  return true;
}

function chopblock(B, G, ctx, [, x, z, rot, s]) {
  if (!have('stump_t')) return false;
  const y = ctx.h(x, z) - 0.05;
  stamp(B.flat, getModel('stump_t'), { x, y, z, rot, h: 0.55 * s, vary: 0.08 });
  if (have('axe')) stamp(B.dflat, getModel('axe'), { x: x + 0.05, y: y + 0.55 * s - 0.04, z, rot: rot + 1.2, h: 0.7, lean: 0.45 });
  return true;
}

function woodpile(B, G, ctx, [, x, z, rot, s]) {
  if (!have('log_s', 'log_sl')) return false;
  const y = ctx.h(x, z) - 0.03;
  stamp(B.flat, getModel('log_sl'), { x, y, z, rot, w: 1.5 * s, vary: 0.1 });
  const [ax, az] = loc(x, z, rot, 0.05, 0.18);
  stamp(B.flat, getModel('log_s'), { x: ax, y: y + 0.55 * s, z: az, rot: rot + 0.1, w: 1.2 * s, vary: 0.1 });
  return true;
}

function washline(B, G, ctx, [, x, z, rot, s]) {
  if (!have('post')) return false;
  const [x1, z1] = [x + Math.cos(rot) * s, z - Math.sin(rot) * s];
  for (const [px, pz] of [[x, z], [x1, z1]]) stamp(B.flat, getModel('post'), { x: px, y: ctx.h(px, pz) - 0.05, z: pz, rot, sx: 1.1, sz: 1.1, sy: 2.0, swap: { wood: '#7a5a42' } });
  const y0 = ctx.h(x, z) + 1.85;
  rope(B.flat, x, y0, z, x1, ctx.h(x1, z1) + 1.85, z1, 0.14, lin('#d8c8a0'));
  if (have('banner')) {
    const cols = ['#ecdcb0', '#8fb4d4', '#e0a0a0', '#f2e6c8'];
    const n = Math.max(2, Math.round(s / 0.75));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.7) / (n + 0.4);
      const px = x + (x1 - x) * t;
      const pz = z + (z1 - z) * t;
      const sag = 0.14 * 4 * t * (1 - t);
      stamp(B.dflat, getModel('banner'), { x: px, y: y0 + (ctx.h(x1, z1) - ctx.h(x, z)) * t - sag - 0.62, z: pz, rot: rot + Math.PI / 2, sx: 1, sy: 0.75, sz: 1, w: 0.62, swap: { red: cols[i % cols.length], wood: '#7a5a42' }, vary: 0.05 });
    }
  }
  return true;
}

function oar(B, G, ctx, [, x, z, rot]) {
  if (!have('paddle')) return false;
  // rot = the heading of the lean (toward the wall)
  stamp(B.flat, getModel('paddle'), { x, y: ctx.h(x, z) - 0.03, z, rot, h: 1.85, lean: 0.2, sx: 0.8, sz: 0.8, swap: { wood: '#b8946a' } });
  return true;
}

function rainbarrel(B, G, ctx, [, x, z, rot, s]) {
  if (!have('barrel')) return false;
  const y = ctx.h(x, z) - 0.03;
  stamp(B.flat, getModel('barrel'), { x, y, z, rot, h: 0.9 * s, swap: { wood: '#8a6444' } });
  B.flat.cyl(x, y + 0.86 * s, z, 0.27 * s, 0.02, 8, lin('#5a8cb4'));
  return true;
}

function crates(B, G, ctx, [, x, z, rot, s]) {
  if (!have('box')) return false;
  const y = ctx.h(x, z) - 0.03;
  stamp(B.flat, getModel('box'), { x, y, z, rot, w: 0.7 * s, vary: 0.08 });
  const [bx, bz] = loc(x, z, rot, 0.72 * s, 0.12);
  stamp(B.flat, getModel('box'), { x: bx, y: ctx.h(bx, bz) - 0.03, z: bz, rot: rot + 0.5, w: 0.62 * s, vary: 0.08 });
  stamp(B.flat, getModel('box'), { x, y: y + 0.7 * s - 0.03, z, rot: rot + 0.9, w: 0.5 * s, vary: 0.08 });
  if (have('bucket')) {
    const [kx, kz] = loc(x, z, rot, -0.35 * s, 0.7 * s);
    stamp(B.dflat, getModel('bucket'), { x: kx, y: ctx.h(kx, kz) - 0.02, z: kz, rot, h: 0.42 });
    if (have('fish_l')) stamp(B.dflat, getModel('fish_l'), { x: kx, y: ctx.h(kx, kz) + 0.3, z: kz, rot: rot + 0.6, w: 0.5, lean: 0.9 });
  }
  return true;
}

function cart(B, G, ctx, [, x, z, rot, s]) {
  if (!have('cart')) return false;
  const y = ctx.h(x, z) - 0.03;
  stamp(B.flat, getModel('cart'), { x, y, z, rot, w: 2.1 * s });
  if (have('box', 'fish_l')) {
    // a crate and two fish on the bed of the cart
    const [cx, cz] = loc(x, z, rot, 0.0, -0.35 * s);
    stamp(B.flat, getModel('box'), { x: cx, y: y + 0.42 * s, z: cz, rot: rot + 0.3, w: 0.55 * s });
    for (let i = 0; i < 2; i++) {
      const [fx, fz] = loc(x, z, rot, -0.2 + i * 0.35, 0.3 * s);
      stamp(B.dflat, getModel('fish_l'), { x: fx, y: y + 0.5 * s, z: fz, rot: rot + 0.4 + i, w: 0.5 });
    }
  }
  return true;
}

function flowers(B, G, ctx, [, x, z, rot, s]) {
  if (!have('fl_p1')) return false;
  const n = Math.max(3, Math.round(s * s * 16));
  for (let i = 0; i < n; i++) {
    const a = i * 2.399 + rot;
    const r = s * Math.sqrt((i + 0.5) / n) * 0.95;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    const k = Math.floor(hash2(px * 3.3, pz * 1.9) * FLOWERS.length);
    stamp(B.dflat, getModel(FLOWERS[k]), { x: px, y: ctx.h(px, pz) - 0.02, z: pz, rot: a * 3, h: 0.3 + 0.16 * hash2(pz, px), sway: [ctx.h(px, pz), 0.3] });
  }
  return true;
}

function hedge(B, G, ctx, [, x, z, rot, s]) {
  if (!have('hedge_l')) return false;
  const n = Math.max(1, Math.round(s / 1.0));
  for (let i = 0; i < n; i++) {
    const t = i + 0.5 - n / 2;
    const px = x + (Math.cos(rot) * s * t) / n;
    const pz = z - (Math.sin(rot) * s * t) / n;
    // the model lies along its local z: its heading is rot + 90 degrees from the item's direction (cos rot, -sin rot)
    stamp(B.flat, getModel('hedge_l'), { x: px, y: ctx.h(px, pz) - 0.05, z: pz, rot: rot + Math.PI / 2, sx: 0.8, sy: 0.75, sz: s / n + 0.02, vary: 0.12, swap: { leaf: i % 2 ? '#4c8a52' : '#5f9a46' } });
  }
  return true;
}

function pot(B, G, ctx, [, x, z, rot, s]) {
  if (!have('pot')) return false;
  const y = ctx.h(x, z) - 0.02;
  stamp(B.dflat, getModel('pot'), { x, y, z, rot, h: 0.3 * s });
  if (have('fl_r1')) stamp(B.dflat, getModel(hash2(x, z) > 0.5 ? 'fl_r1' : 'fl_y1'), { x, y: y + 0.28 * s, z, rot, h: 0.3, sway: [y + 0.28, 0.3] });
  return true;
}

const KINDS = { campfire, tent, rack, bedroll, bucket, chopblock, woodpile, washline, oar, rainbarrel, crates, cart, flowers, hedge, pot };

/** Draws one decor item into the builders of its chunk; false when its models are missing (nothing drawn). */
export function drawDecor(B, G, ctx, item) {
  const f = KINDS[item[0]];
  return f ? f(B, G, ctx, item) : false;
}

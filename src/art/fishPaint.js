// Fish sprite (40x24) painted from data parameters into RGBA bytes: shaded body (dither between tones), pattern, tail,
// fins, eye, 1-pixel outline. Shared by the catch card and the journal. Ported from maquette/v2/scene.js (the shading, the
// default tail and fins are the mock-up's), then widened in J2 so the 12 species look different, and again in J6 for the 12 added
// species (every new option is off by default, so the first 12 sprites stay byte-identical: tests/fish24.test.js). Pure.
//
// Spec (data/fishSprites.js), everything but colors / rx / ry / pat is optional:
//   colors [back, belly, fin]   rx / ry half length / half height of the body    cx / cy centre of the body (auto / 12)
//   pat    'none' | 'stripe' | 'spot' | 'scale' | 'bars' (4 bands) | 'marble' | 'dots' (dotColor)
//   tail   length of the tail (7)    tailStyle 'fan' | 'veil'    dorsal 'fin' | 'spikes' | 'spines' | 'veil' | 'none'
//   ventral 'fin' | 'veil' | 'none'   eye 'normal' | 'half' | 'tiny'   eyeColor (white of the eye)   eyeDx (4)
//   tufts, barbel, whiskers, antenna, snout, steam, sheen, notes : booleans for the species features
//   ribbon true = the eel (a thin S-shaped ribbon instead of an oval body)    glow true = lit in the water at night (J3)
// Added in J6 (all optional):
//   pat 'patches' (koi: blobs of patchColor, `patches` = [[ox, oy, rx, ry], ...] in body pixels, default four blobs)
//   tailStyle 'streak' (comet: a long thin dithered trail)    scutes (row of bony plates)    rays (ring of sun rays round the body)
//   fade (the rear half dissolves into the water, ordered dither)    bolt (a yellow lightning flash on the flank, boltColor)

import { createRaster, hx, mixc } from './raster.js';
import { createSpriteMap } from './painter.js';
import { dith } from './dither.js';

export const FISH_W = 40;
export const FISH_H = 24;
const SILHOUETTE = '#120e28';
const OUTLINE = '#1a1238';
const WHITE = [255, 255, 255];
const INK = [26, 18, 48];

const KOI_PATCHES = [[-7, -2, 4, 3], [0, -3, 5, 3], [7, 0, 3, 2], [-3, 3, 3, 2]];

const clampInt = (v, a, b) => Math.max(a, Math.min(b, v));
const lighten = (c, t) => mixc(c, WHITE, t);

/** Builds the sprite map (pixel -> colour) of a spec and the position of the eye. */
function buildFish(spec) {
  const sp = createSpriteMap();
  const set = sp.set;
  const C = spec.colors.map(hx);
  const cy = spec.cy ?? 12;
  if (spec.ribbon) return buildRibbon(spec, sp, C, cy);

  const { rx, ry, pat } = spec;
  const tail = spec.tail ?? 7;
  const cx = spec.cx ?? clampInt(Math.round(20 + (tail - 1) / 2), rx + tail, 38 - rx);
  const dark = mixc(C[0], INK, 0.45);
  const dotColor = spec.dotColor ? hx(spec.dotColor) : WHITE;
  const patchColor = spec.patchColor ? hx(spec.patchColor) : C[2];

  // body: an ellipse shaded in three bands (dark back, flat middle, light belly) with ordered dithering between them
  for (let y = -ry - 1; y <= ry + 1; y++) {
    for (let i = -rx; i <= rx; i++) {
      const e = (i * i) / (rx * rx) + (y * y) / ((ry + 0.6) * (ry + 0.6));
      if (e > 1) continue;
      const v = y / ry;
      let c = v < -0.6 ? dark : v < -0.2 ? (dith(i, y, (v + 0.6) / 0.4) ? C[0] : dark) : v < 0.25 ? C[0] : v < 0.55 ? (dith(i, y, (v - 0.25) / 0.3) ? C[1] : C[0]) : C[1];
      if (pat === 'stripe' && (i + rx) % 5 === 0 && v < 0.3 && i > -rx + 3 && i < rx - 4) c = mixc(c, [20, 16, 40], 0.35);
      if (pat === 'spot' && (i * 7 + y * 13) % 11 === 0 && v < 0.4) c = mixc(c, WHITE, 0.5);
      if (pat === 'scale' && (i + y) % 3 === 0 && (i - y) % 3 === 0 && v < 0.45) c = mixc(c, WHITE, 0.22);
      if (pat === 'bars' && v < 0.5) {
        for (let k = 0; k < 4; k++) {
          const ic = Math.round(-rx * 0.45 + k * rx * 0.3);
          if (i === ic || i === ic + 1) c = mixc(c, INK, 0.5);
        }
      }
      if (pat === 'marble' && (i * 3 + y * 7 + 90) % 9 < 2 && v < 0.4 && i > -rx + 2) c = lighten(c, 0.24);
      if (pat === 'dots' && (i * 7 + y * 13 + 110) % 11 === 0 && v < 0.45) c = mixc(c, dotColor, 0.85);
      if (pat === 'patches' && v < 0.5) {
        for (const [ox, oy, prx, pry] of spec.patches ?? KOI_PATCHES) {
          if (((i - ox) * (i - ox)) / (prx * prx) + ((y - oy) * (y - oy)) / (pry * pry) <= 1) c = v < -0.25 ? mixc(patchColor, INK, 0.18) : patchColor;
        }
      }
      if (y === -ry && i > -rx + 3) c = lighten(c, 0.2);
      set(cx + i, cy + y, c);
    }
  }
  if (spec.snout) {
    // flat duck-bill snout of the pike: two rows ahead of the head
    for (let k = 1; k <= 3; k++) {
      set(cx + rx + k, cy - 1, C[0]);
      set(cx + rx + k, cy, mixc(C[0], C[1], 0.5));
      if (k < 3) set(cx + rx + k, cy + 1, C[1]);
    }
  }
  // top and bottom edge of the body per column, read once (before any fin is drawn) so fins and features sit on the body
  const tops = new Map();
  const bottoms = new Map();
  for (let i = -rx - 4; i <= rx + 4; i++) {
    let t = cy;
    let b = cy;
    for (let y = cy - ry - 3; y <= cy; y++) if (sp.has(cx + i, y)) { t = y; break; }
    for (let y = cy + ry + 3; y >= cy; y--) if (sp.has(cx + i, y)) { b = y; break; }
    tops.set(i, t);
    bottoms.set(i, b);
  }
  const topOf = (i) => tops.get(i) ?? cy;
  const bottomOf = (i) => bottoms.get(i) ?? cy;

  // tail
  if (spec.tailStyle === 'streak') {
    // comet: a long, thin trail that thins out and fades (dither) towards the end, with a few bright sparks
    for (let i = 1; i <= tail; i++) {
      const h = Math.max(0, Math.round(4 * (1 - i / (tail + 1))));
      for (let y = -h; y <= h; y++) {
        if (i > 4 && dith(cx - rx - i, cy + y, 1 - i / (tail + 1)) === false && Math.abs(y) === h) continue;
        set(cx - rx - i + 1, cy + y, (i * 3 + y) % 5 === 0 ? lighten(C[2], 0.65) : Math.abs(y) === h ? C[2] : lighten(C[2], 0.25));
      }
    }
  } else if (spec.tailStyle === 'veil') {
    for (let i = 1; i <= tail; i++) {
      const h = Math.round(i * 0.75) + 2 + (i % 3 === 0 ? 1 : 0);
      for (let y = -h; y <= h; y++) set(cx - rx - i + 1, cy + y, (i + y) % 3 === 0 ? lighten(C[2], 0.45) : Math.abs(y) === h ? lighten(C[2], 0.2) : C[2]);
    }
  } else {
    for (let i = 1; i <= tail; i++) {
      const h = Math.round(i * 0.9) + 1;
      for (let y = -h; y <= h; y++) set(cx - rx - i + 1, cy + y, (i + y) % 3 === 0 ? lighten(C[2], 0.3) : C[2]);
    }
  }

  // dorsal fin
  const dorsal = spec.dorsal ?? 'fin';
  if (dorsal === 'fin') {
    for (let i = -2; i <= 5; i++) {
      const h = Math.round(3 - Math.abs(i - 1) * 0.5) + 1;
      for (let k = 1; k <= h; k++) set(cx + i - 2, cy - ry - k, k === h ? lighten(C[2], 0.3) : C[2]);
    }
  } else if (dorsal === 'spikes') {
    // perch: a spiny fin, a membrane two pixels high with a pointed ray every other column
    for (let j = 0; j < 10; j++) {
      const i = -5 + j;
      const h = j % 2 === 0 ? 4 : 2;
      const t = topOf(i);
      for (let k = 1; k <= h; k++) set(cx + i, t - k, k === h && h > 2 ? lighten(C[2], 0.35) : C[2]);
    }
  } else if (dorsal === 'spines') {
    // stickleback: three golden spines, each on a small triangular base
    for (const i of [-3, 0, 3]) {
      const t = topOf(i);
      const tl = topOf(i - 1);
      const tr = topOf(i + 1);
      for (let k = 1; k <= 4; k++) set(cx + i, t - k, k === 4 ? lighten(C[2], 0.5) : C[2]);
      set(cx + i - 1, tl - 1, mixc(C[2], INK, 0.2));
      set(cx + i + 1, tr - 1, mixc(C[2], INK, 0.2));
    }
  } else if (dorsal === 'veil') {
    // flowing fin, tall at the back and low at the front, half transparent (dither)
    for (let i = -8; i <= 5; i++) {
      const h = Math.max(1, 4 - Math.floor((i + 8) * 0.25));
      const t = topOf(i);
      for (let k = 1; k <= h; k++) set(cx + i, t - k, k === h ? lighten(C[2], 0.5) : dith(cx + i, k, 0.6) ? lighten(C[2], 0.35) : C[2]);
    }
  }
  // ventral fin, side fin
  const ventral = spec.ventral ?? 'fin';
  if (ventral === 'fin') {
    for (let k = 1; k <= 3; k++) for (let i = 0; i < 3; i++) set(cx - 3 + i - k, cy + ry + k, C[2]);
  } else if (ventral === 'veil') {
    for (let i = -8; i <= 2; i++) {
      const h = Math.max(1, 3 - Math.floor((i + 8) * 0.28));
      const b = bottomOf(i);
      for (let k = 1; k <= h; k++) set(cx + i, b + k, k === h ? lighten(C[2], 0.5) : dith(cx + i, k, 0.6) ? lighten(C[2], 0.35) : C[2]);
    }
  }
  if (spec.sideFin !== false) {
    for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) set(cx + rx - 9 + i + k, cy + 1 + k, lighten(C[2], 0.2));
  }

  // species features
  if (spec.steam) {
    // the trout melts into the mist: half of the edge pixels on the tail side and the back are dropped (ordered dither)
    const edge = [];
    for (let y = 0; y < FISH_H; y++) {
      for (let x = 0; x < FISH_W; x++) {
        if (!sp.has(x, y)) continue;
        if (!sp.has(x - 1, y) || !sp.has(x, y - 1) || !sp.has(x, y + 1) || !sp.has(x + 1, y)) edge.push([x, y]);
      }
    }
    for (const [x, y] of edge) if (x < cx + 3 && dith(x, y, 0.5)) sp.del(x, y);
    for (let y = 0; y < FISH_H; y++) for (let x = 0; x < FISH_W; x++) if (sp.has(x, y) && x < cx - 4 && (x + y) % 4 === 0) sp.set(x, y, lighten(sp.get(x, y), 0.35));
  }
  if (spec.sheen) {
    for (let i = -4; i <= 5; i++) if (sp.has(cx + i, cy - 1)) set(cx + i, cy - 1, lighten(sp.get(cx + i, cy - 1), 0.55));
  }
  if (spec.tufts) {
    const moss = mixc(C[0], [120, 200, 90], 0.55);
    const mossDark = mixc(C[0], [30, 70, 40], 0.4);
    for (const i of [-8, -4, 0, 4]) {
      const t = topOf(i);
      set(cx + i, t - 1, moss);
      set(cx + i, t - 2, lighten(moss, 0.25));
      set(cx + i - 1, t - 1, mossDark);
      set(cx + i + 1, t - 1, mossDark);
    }
  }
  if (spec.barbel) {
    const b = mixc(C[2], INK, 0.25);
    set(cx + rx, cy + 2, b);
    set(cx + rx + 1, cy + 3, b);
  }
  if (spec.whiskers) {
    const w = mixc(C[0], INK, 0.2);
    const droop = [[1, 1], [2, 2], [2, 3], [3, 4], [3, 5], [2, 6]];
    for (const [dx, dy] of droop) set(cx + rx - 1 + dx, cy + dy, w);
    const droop2 = [[1, 2], [1, 3], [1, 4], [0, 5], [0, 6], [1, 7]];
    for (const [dx, dy] of droop2) set(cx + rx - 3 + dx, cy + dy + 1, w);
  }
  if (spec.antenna) {
    // a thin stalk rising from the head, ending in a small yellow bulb
    const stalk = mixc(C[2], INK, 0.2);
    const bx0 = cx + 3;
    const by0 = topOf(3);
    for (const [dx, dy] of [[0, -1], [1, -2], [2, -3], [3, -4], [4, -4], [5, -5]]) set(bx0 + dx, by0 + dy, stalk);
    const glow = [255, 226, 122];
    set(bx0 + 5, by0 - 7, glow);
    set(bx0 + 6, by0 - 7, glow);
    set(bx0 + 5, by0 - 6, lighten(glow, 0.55));
    set(bx0 + 6, by0 - 6, glow);
  }
  if (spec.notes) {
    // hand-drawn musical notes on the flank: stem, head, flag
    const gold = mixc(C[2], [190, 150, 60], 0.6);
    const note = [[1, 0], [1, 1], [1, 2], [2, 0], [3, 1], [0, 3], [1, 3], [0, 2]];
    for (const [ox, oy] of [[-8, -4], [1, -2], [-3, 2]]) {
      for (const [dx, dy] of note) if (sp.has(cx + ox + dx, cy + oy + dy)) set(cx + ox + dx, cy + oy + dy, gold);
    }
  }

  if (spec.scutes) {
    // sturgeon: a row of pale bony plates along the back and another along the flank
    const plate = lighten(C[0], 0.62);
    for (let i = -rx + 3; i <= rx - 4; i += 3) {
      const t = topOf(i);
      set(cx + i, t - 1, plate);
      set(cx + i + 1, t - 1, lighten(C[0], 0.3));
      set(cx + i, t, plate);
      if (sp.has(cx + i, cy + 1)) set(cx + i, cy + 1, plate);
      if (sp.has(cx + i, cy + ry - 2)) set(cx + i, cy + ry - 2, mixc(plate, C[1], 0.5));
    }
  }
  if (spec.rays) {
    // sunfish: short sun rays all round the disc (not on the tail side)
    for (let k = 0; k < 20; k++) {
      const a = (k * 2 * Math.PI) / 20 + 0.1;
      if (Math.cos(a) < -0.75) continue;
      const rxx = rx + 1.4;
      const ryy = ry + 1.6;
      set(cx + Math.round(Math.cos(a) * rxx), cy + Math.round(Math.sin(a) * ryy), k % 2 === 0 ? lighten(C[2], 0.4) : C[2]);
      if (k % 2 === 0) set(cx + Math.round(Math.cos(a) * (rxx + 1.6)), cy + Math.round(Math.sin(a) * (ryy + 1.6)), lighten(C[2], 0.2));
    }
  }
  if (spec.bolt) {
    // storm ide: a yellow lightning flash on the flank (two zig-zags)
    const flash = spec.boltColor ? hx(spec.boltColor) : [255, 226, 106];
    const shape = [[1, -4], [0, -3], [-1, -2], [0, -2], [1, -2], [0, -1], [-1, 0], [0, 0], [-2, 1], [-1, 1]];
    for (const [ox, oy] of [[-4, 1], [4, 2]]) {
      for (const [dx, dy] of shape) if (sp.has(cx + ox + dx, cy + oy + dy)) set(cx + ox + dx, cy + oy + dy, flash);
    }
  }
  if (spec.fade) {
    // ghost: the rear of the body dissolves into the water (ordered dither, denser towards the tail)
    const span = rx + tail;
    const del = [];
    for (let y = 0; y < FISH_H; y++) for (let x = 0; x < cx + 1; x++) if (sp.has(x, y) && dith(x, y, Math.min(0.7, ((cx + 1 - x) / span) * 1.1))) del.push([x, y]);
    for (const [x, y] of del) sp.del(x, y);
  }

  const eyeDx = spec.eyeDx ?? 4;
  return { sp, eye: { x: cx + rx - eyeDx, y: cy - Math.round(ry * 0.3) }, C };
}

/** The eel: a thin S-shaped ribbon, 1 to 3 pixels thick, with a continuous fin along the back. */
function buildRibbon(spec, sp, C, cy) {
  const set = sp.set;
  let prev = null;
  let headY = cy;
  for (let x = 3; x <= 37; x++) {
    const t = (x - 3) / 34;
    const yc = Math.round(cy + 3.4 * Math.sin(2 * Math.PI * 1.25 * t + 0.5));
    const w = x < 8 ? 1 : x < 33 ? 2 : 3;
    const from = prev === null ? yc : Math.min(prev, yc);
    const to = prev === null ? yc : Math.max(prev, yc);
    for (let y = from; y <= to + w - 1; y++) {
      const rel = (y - yc) / w;
      set(x, y, rel < 0.5 ? mixc(C[0], INK, 0.3) : C[1]);
    }
    if (x >= 7 && x <= 32) set(x, Math.min(from, yc) - 1, x % 3 === 0 ? lighten(C[2], 0.35) : C[2]);
    if (x === 36) headY = yc;
    prev = yc;
  }
  return { sp, eye: { x: 35, y: headY }, C };
}

function paintEye(set, eye, spec) {
  const white = spec.eyeColor ? hx(spec.eyeColor) : WHITE;
  const { x, y } = eye;
  const style = spec.eye ?? (spec.ribbon ? 'tiny' : 'normal');
  if (style === 'half') {
    // half-closed eye: a lid and one dark line
    const lid = lighten(hx(spec.colors[0]), 0.45);
    set(x, y, lid);
    set(x + 1, y, lid);
    set(x, y + 1, INK);
    set(x + 1, y + 1, INK);
  } else if (style === 'tiny') {
    set(x, y, white);
    set(x + 1, y, INK);
  } else {
    set(x, y, white);
    set(x + 1, y, white);
    set(x, y + 1, white);
    set(x + 1, y + 1, INK);
  }
}

/** Bounding box of the painted pixels (without the outline), to check that nothing is cut by the 40x24 canvas. */
export function fishBounds(spec) {
  return buildFish(spec).sp.bounds();
}

/** @param {object} spec an entry of data/fishSprites.js  @param {{silhouette?:boolean}} [opt]  @returns {Uint8ClampedArray} RGBA */
export function paintFish(spec, opt = {}) {
  const R = createRaster(FISH_W, FISH_H);
  const { sp, eye } = buildFish(spec);
  if (opt.silhouette) {
    sp.flush((x, y) => R.pxr(x, y, SILHOUETTE));
    return new Uint8ClampedArray(R.buf.buffer);
  }
  paintEye(sp.set, eye, spec);
  sp.flush((x, y, c) => R.pxr(x, y, c), OUTLINE);
  return new Uint8ClampedArray(R.buf.buffer);
}

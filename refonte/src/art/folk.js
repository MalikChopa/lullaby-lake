// Villagers and the walking cat, painted by code into RGBA bytes (no image file). Same family as the angler (art/sheets.js): 24x32
// cells, 1-pixel dark outline, 4 directions, small walk cycle. Each villager has its own hat, clothes, hair, silhouette (skirt, apron,
// beard, child size). Pure and deterministic.
//   folkSheet(look): 6 columns x 4 rows of 24x32 cells. rows: down, up, left, right (mirror). columns: 0 stand, 1 step A, 2 pass, 3 step B,
//   4 breath, 5 pass B (J9-B). J9-B also adds shading: a collar, buttons or a belt, shoe highlights, hat shading.
//   catWalkSheet(): 4 cells of 16x16, side view walking left (right = mirror in the shader: the sprite plane is flipped)

import { createSpriteMap } from '../../../src/art/painter.js';
import { hx, pack } from '../../../src/art/palette.js';
import { COLORS } from './sheets.js';

export const FOLK = Object.freeze({ cellW: 24, cellH: 32, cols: 6, rows: 4 });
/** J9-B: 4 distinct walk frames (column 5 = passing on the other leg). */
export const FOLK_WALK = Object.freeze([1, 2, 3, 5]);
export const CAT_WALK = Object.freeze({ cellW: 16, cellH: 16, cols: 4 });

function rect(set, x, y, w, h, c) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c);
}

/** Lighter / darker variant of a '#rrggbb' colour (k > 1 lighter). */
export function shade(hex, k) {
  const v = hx(hex);
  const f = (c) => Math.max(0, Math.min(255, Math.round(k >= 1 ? c + (255 - c) * (k - 1) : c * k)));
  return '#' + [f(v[0]), f(v[1]), f(v[2])].map((n) => n.toString(16).padStart(2, '0')).join('');
}

function pose(look, dir, p) {
  const sp = createSpriteMap();
  const set = sp.set;
  const small = !!look.small;
  const top = look.top;
  const topD = shade(top, 0.75);
  const topL = shade(top, 1.25);
  const pants = look.skirt ? shade(top, 0.6) : '#4a4a5a';
  const hair = look.hair || '#5a3a3a';
  const skin = look.skin || COLORS.skin;
  const skinD = COLORS.skinShade;
  const by = (p.bodyDy || 0) + (small ? 5 : 0);
  const hy = (p.headDy || 0) + (small ? 6 : 0);
  const legH = small ? 3 : 4;
  const back = dir === 'up';
  if (dir === 'down' || dir === 'up') {
    if (look.skirt) {
      rect(set, 7, 23 + by, 10, 3, pants);
      rect(set, 8, 26 + by, 3, legH - 1 - (p.legL || 0), skinD);
      rect(set, 13, 26 + by, 3, legH - 1 - (p.legR || 0), skinD);
    } else {
      rect(set, 8, 25 + by, 3, legH - (p.legL || 0), pants);
      rect(set, 13, 25 + by, 3, legH - (p.legR || 0), pants);
      rect(set, 11, 25 + by, 2, 2, pants);
    }
    rect(set, 8, 29 + by - (small ? 1 : 0) - (p.legL || 0), 3, 2, '#3a2a30');
    rect(set, 13, 29 + by - (small ? 1 : 0) - (p.legR || 0), 3, 2, '#3a2a30');
    rect(set, 7, 18 + by, 10, 7 - (small ? 1 : 0), top);
    rect(set, 7, 18 + by, 1, 7, topD);
    rect(set, 16, 18 + by, 1, 7, topL);
    if (look.apron && !back) rect(set, 9, 20 + by, 6, 6, '#e8dcc0');
    const al = p.armL || 0;
    const ar = p.armR || 0;
    rect(set, 5, 18 + by, 2, 5 + al, topD);
    rect(set, 17, 18 + by, 2, 5 + ar, top);
    rect(set, 5, 23 + by + al, 2, 1, skin);
    rect(set, 17, 23 + by + ar, 2, 1, skin);
    // J9-B detail: collar, buttons (or the apron's straps), belt, shoe highlights, a fold on the sleeve
    if (!back) {
      rect(set, 10, 18 + by, 4, 1, shade(top, 1.45));
      if (look.apron) {
        set(9, 18 + by, '#e8dcc0');
        set(14, 18 + by, '#e8dcc0');
      } else if (!look.skirt) {
        set(12, 20 + by, topD);
        set(12, 22 + by, topD);
      }
    } else rect(set, 8, 18 + by, 8, 1, topD);
    if (!look.skirt) rect(set, 7, 24 + by - (small ? 1 : 0), 10, 1, shade(top, 0.5));
    set(9, 29 + by - (small ? 1 : 0) - (p.legL || 0), '#5a4a50');
    set(14, 29 + by - (small ? 1 : 0) - (p.legR || 0), '#5a4a50');
    set(18, 19 + by, topL);
    rect(set, 8, 11 + hy, 8, 6, back ? hair : skin);
    if (back) rect(set, 8, 15 + hy, 8, 2, shade(hair, 0.8));
    else {
      rect(set, 8, 11 + hy, 8, 1, hair);
      set(8, 12 + hy, hair);
      set(15, 12 + hy, hair);
      set(10, 13 + hy, p.blink ? skinD : COLORS.eye);
      set(13, 13 + hy, p.blink ? skinD : COLORS.eye);
      set(9, 14 + hy, COLORS.blush);
      set(14, 14 + hy, COLORS.blush);
      if (look.beard) rect(set, 9, 15 + hy, 6, 3, hair);
      else rect(set, 11, 15 + hy, 2, 1, skinD);
    }
  } else {
    const stride = p.stride || 0;
    if (look.skirt) {
      rect(set, 9, 23 + by, 6, 3, pants);
      rect(set, 10 - stride, 26 + by, 2, legH - 1, skinD);
      rect(set, 12 + stride, 26 + by, 2, legH - 1, shade(skinD, 0.85));
    } else {
      rect(set, 12 + stride, 25 + by, 2, legH, shade(pants, 0.8));
      rect(set, 10 - stride, 25 + by, 2, legH, pants);
    }
    rect(set, 12 + stride, 29 + by - (small ? 1 : 0), 3, 2, '#3a2a30');
    rect(set, 9 - stride, 29 + by - (small ? 1 : 0), 3, 2, '#3a2a30');
    rect(set, 9, 18 + by, 6, 7 - (small ? 1 : 0), top);
    rect(set, 14, 18 + by, 1, 7, topD);
    if (look.apron) rect(set, 8, 20 + by, 2, 5, '#e8dcc0');
    const ax = 11 - (p.armSwing || 0);
    rect(set, ax, 18 + by, 2, 5, topD);
    rect(set, ax, 23 + by, 2, 1, skin);
    rect(set, 8, 11 + hy, 7, 6, skin);
    rect(set, 12, 11 + hy, 3, 5, hair);
    rect(set, 8, 11 + hy, 7, 1, hair);
    set(7, 14 + hy, skin);
    set(9, 13 + hy, p.blink ? skinD : COLORS.eye);
    if (look.beard) rect(set, 8, 15 + hy, 4, 3, hair);
  }
  // hats (front / back / side share the shapes, shifted for the side view)
  const sx = dir === 'left' ? 1 : 0;
  const hat = look.hat;
  if (hat === 'cap') {
    rect(set, 8 + sx, 8 + hy, 8 - sx, 3, '#2a3a5a');
    rect(set, 9 + sx, 8 + hy, 3, 1, '#3a4e74');
    if (dir === 'down') rect(set, 7, 11 + hy, 10, 1, '#1a2a4a');
    if (dir === 'left') rect(set, 5, 10 + hy, 4, 1, '#1a2a4a');
  } else if (hat === 'bonnet') {
    rect(set, 7 + sx, 8 + hy, 10 - sx, 4, '#f2e6f0');
    rect(set, 7 + sx, 12 + hy, 1, 3, '#f2e6f0');
    if (dir !== 'left') rect(set, 16, 12 + hy, 1, 3, '#f2e6f0');
    rect(set, 8 + sx, 8 + hy, 8 - sx, 1, '#d8b8d0');
  } else if (hat === 'beret') {
    rect(set, 7 + sx, 9 + hy, 10 - sx, 2, '#3a3040');
    rect(set, 8 + sx, 9 + hy, 4, 1, '#54465c');
    rect(set, 9, 8 + hy, 6, 1, '#3a3040');
    set(12, 7 + hy, '#3a3040');
  } else if (hat === 'scarf') {
    rect(set, 7 + sx, 9 + hy, 10 - sx, 3, '#e8b84a');
    if (dir === 'down') rect(set, 7, 12 + hy, 1, 4, '#e8b84a');
    if (dir !== 'down') rect(set, 13, 12 + hy, 3, 3, '#c89838');
  } else if (hat === 'wide') {
    rect(set, 8, 6 + hy, 8, 4, '#5a4a6a');
    rect(set, 9, 6 + hy, 2, 2, '#6e5e80');
    rect(set, 3, 9 + hy, 18, 1, '#6a5a7a');
    rect(set, 8, 8 + hy, 8, 1, '#c8564e');
  } else {
    // hair only: a fringe and a bun
    rect(set, 8, 10 + hy, 8, 2, hair);
    rect(set, 10, 8 + hy, 4, 2, hair);
  }
  return sp;
}

const POSES = {
  down: [{}, { legL: 1, armL: 1, armR: -1 }, { headDy: 1, legR: 1 }, { legR: 1, armR: 1, armL: -1 }, { headDy: 1, blink: true }, { headDy: 1, legL: 1 }],
  up: [{}, { legL: 1, armL: 1, armR: -1 }, { headDy: 1, legR: 1 }, { legR: 1, armR: 1, armL: -1 }, { headDy: 1 }, { headDy: 1, legL: 1 }],
  left: [{}, { stride: 1, armSwing: 1 }, { headDy: 1 }, { stride: -1, armSwing: -1 }, { headDy: 1, blink: true }, { headDy: 1, stride: -1, armSwing: -1 }],
};

function blit(buf, W, sp, ox, oy, mirrorW) {
  sp.flush((x, y, c) => {
    const xx = mirrorW ? mirrorW - 1 - x : x;
    if (xx < 0 || xx >= (mirrorW || 1e9) || oy + y < 0) return;
    const a = hx(c);
    buf[(oy + y) * W + ox + xx] = pack(a[0], a[1], a[2]);
  }, COLORS.outline);
}

/** @returns {{ w, h, data }} RGBA of a villager's 144x128 sheet */
export function folkSheet(look) {
  const W = FOLK.cellW * FOLK.cols;
  const H = FOLK.cellH * FOLK.rows;
  const buf = new Uint32Array(W * H);
  ['down', 'up', 'left', 'right'].forEach((dir, row) => {
    const src = dir === 'right' ? 'left' : dir;
    POSES[src].forEach((ps, col) => blit(buf, W, pose(look, src, ps), col * FOLK.cellW, row * FOLK.cellH, dir === 'right' ? FOLK.cellW : 0));
  });
  return { w: W, h: H, data: new Uint8ClampedArray(buf.buffer) };
}

/** @returns {{ w, h, data }} RGBA of the 64x16 walking cat (side view, facing left) */
export function catWalkSheet() {
  const W = CAT_WALK.cellW * CAT_WALK.cols;
  const H = CAT_WALK.cellH;
  const buf = new Uint32Array(W * H);
  const C = COLORS;
  for (let f = 0; f < 4; f++) {
    const sp = createSpriteMap();
    const set = sp.set;
    const bob = f % 2;
    // tail up behind (right side), body, head on the left
    for (const [x, y] of [[13, 6 + bob], [13, 5 + bob], [14, 4 + bob], [14, 3 + bob]]) set(x, y, C.catDark);
    rect(set, 5, 7 + bob, 8, 4, C.cat);
    rect(set, 6, 10 + bob, 6, 1, C.catLight);
    for (let i = 7; i < 12; i += 2) set(i, 7 + bob, C.catDark);
    rect(set, 1, 4 + bob, 5, 4, C.cat);
    set(1, 3 + bob, C.cat);
    set(4, 3 + bob, C.cat);
    set(2, 3 + bob, C.catPink);
    set(2, 5 + bob, C.catInk);
    set(1, 6 + bob, C.catPink);
    const legs = [[[5, 11], [7, 12], [10, 11], [12, 12]], [[6, 11], [6, 12], [11, 11], [11, 12]], [[7, 11], [5, 12], [12, 11], [10, 12]], [[6, 11], [6, 12], [11, 11], [11, 12]]][f];
    for (const [x, y] of legs) {
      set(x, y + bob, C.catDark);
      set(x, y + 1 + bob, C.catDark);
    }
    blit(buf, W, sp, f * CAT_WALK.cellW, 1, 0);
  }
  return { w: W, h: H, data: new Uint8ClampedArray(buf.buffer) };
}

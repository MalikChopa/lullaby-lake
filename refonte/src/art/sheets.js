// Sprite sheets of the slice, painted by code into RGBA bytes (no image file). Pure and deterministic: same call = same bytes.
// Palette family of the 2D game (src/art/sceneBake.js angler: straw hat, warm red shirt, blue trousers; src/art/catPaint.js tabby cat).
// Each sprite is built in a sprite map (src/art/painter.js) and gets a 1-pixel dark outline, like the fish and the cat of the 2D game.
//
//   anglerSheet(): 9 columns x 4 rows of 24x32 cells (J9-B; see ANGLER_COLS).  rows: down (facing the camera), up (back), left, right (mirror of left)
//                  columns: 0 stand, 1 step A, 2 passing A, 3 step B, 4 idle breath, 5 rod held, 6 passing B, 7 cast, 8 reel
//   catSheet():    6 cells of 16x16 (3/4 front view): 0 rest, 1 tail up, 2 blink, 3 grooming, 4 loaf, 5 tail tip (CAT_POSES)
//   propSheet():   float (8x10) and the "!" bite bubble (12x14) side by side in a 20x14 sheet

import { createSpriteMap } from '../../../src/art/painter.js';
import { hx, pack } from '../../../src/art/palette.js';

export const ANGLER = Object.freeze({ cellW: 24, cellH: 32, cols: 9, rows: 4, dirs: Object.freeze(['down', 'up', 'left', 'right']) });
/**
 * Columns of the angler sheet (J9-B: 9 columns). stand, the 4 walk frames (stepA, pass, stepB, passB), breath (idle breathing),
 * rod (holding the rod: waiting, bite), cast (rod raised over the shoulder), reel (leaning back, hands at the reel).
 */
export const ANGLER_COLS = Object.freeze({ stand: 0, stepA: 1, pass: 2, stepB: 3, breath: 4, rod: 5, passB: 6, cast: 7, reel: 8 });
/** Walk cycle: columns shown in turn while walking (4 distinct frames: contact, passing, contact, passing on the other leg). */
export const WALK_CYCLE = Object.freeze([1, 2, 3, 6]);
export const CAT = Object.freeze({ cellW: 16, cellH: 16, cols: 6 });
/** Cat cells (J9-B: 6). 0 rest, 1 tail up, 2 blink, 3 grooming a paw (new, shown by the J8 idle picker), 4 loaf (new), 5 tail tip. */
export const CAT_POSES = Object.freeze({ rest: 0, tailUp: 1, blink: 2, groom: 3, loaf: 4, tailTip: 5 });
export const PROPS = Object.freeze({ w: 20, h: 14, float: { x: 0, y: 0, w: 8, h: 10 }, bubble: { x: 8, y: 0, w: 12, h: 14 } });
/** Hand of the angler in the cell (pixels from the top-left) for the rod frame, facing up: where the rod starts. */
export const ROD_HAND = Object.freeze([16, 18]);

export const COLORS = Object.freeze({
  outline: '#2a1c30',
  hat: '#f2d488', hatLight: '#fff0b0', hatShade: '#c8a050', brim: '#e9c26e', brimUnder: '#b88a48', band: '#c8564e',
  skin: '#f0c6a0', skinShade: '#d8a888', hair: '#5a3a3a', hairDark: '#45292c', eye: '#2a1c30', blush: '#e89a88',
  shirt: '#c4605a', shirtShade: '#98484f', shirtLight: '#d87d6a', scarf: '#e8dcc0', scarfShade: '#d6c8a4', belt: '#7a3a44',
  pants: '#364570', pantsLight: '#4c5c90', pantsDark: '#2a3558', boot: '#4a3040', bootLight: '#6a4a5a',
  vest: '#4a6a5a', vestShade: '#3a5448', vestLight: '#5e806c', creel: '#b08a5a', creelDark: '#7a5a3a', fly: '#6ab0e0',
  cat: '#e8955a', catDark: '#c9743e', catLight: '#f6c08a', catPink: '#f08aa0', catInk: '#3a2030',
  floatRed: '#e0504a', floatLight: '#ff9a8a', floatWhite: '#fdf2dc', floatStick: '#3a2a20', bubble: '#fdf2dc', bubbleInk: '#c8384a',
});
const C = COLORS;

function rect(set, x, y, w, h, c) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c);
}

/**
 * Paints one angler pose into a sprite map (J9-B: more shading and detail: straw hat with a fishing fly in the band and a shadow under
 * the brim, a fishing vest with pockets over the shirt, belt buckle, creased trousers, boot highlights, a wicker creel on the back).
 * dir: down | up | left. p: { headDy, bodyDy, legL, legR, armL, armR, rod, cast, reel, blink, stride, armSwing, chest }
 */
function anglerPose(dir, p) {
  const sp = createSpriteMap();
  const set = sp.set;
  const hy = p.headDy || 0;
  const by = p.bodyDy || 0;
  if (dir === 'down' || dir === 'up') {
    const back = dir === 'up';
    const leg = (x0, up) => {
      rect(set, x0, 25 + by, 3, 4 - up, C.pants);
      rect(set, x0 + (x0 < 12 ? 0 : 2), 25 + by, 1, 4 - up, x0 < 12 ? C.pantsDark : C.pantsLight);
      set(x0 + 1, 27 + by - up, C.pantsLight);
      rect(set, x0, 29 + by - up, 3, 2, C.boot);
      set(x0 + 1, 29 + by - up, C.bootLight);
    };
    leg(8, p.legL || 0);
    leg(13, p.legR || 0);
    rect(set, 11, 25 + by, 2, 2, C.pantsDark);
    const chest = p.chest || 0;
    rect(set, 7 - chest, 18 + by, 10 + 2 * chest, 7, C.shirt);
    if (back) {
      rect(set, 7, 18 + by, 10, 2, C.vest);
      rect(set, 7, 18 + by, 1, 7, C.vestShade);
      rect(set, 16, 18 + by, 1, 7, C.vestLight);
      rect(set, 8, 20 + by, 8, 5, C.creel);
      for (let x = 8; x < 16; x += 2) rect(set, x, 20 + by, 1, 5, C.creelDark);
      rect(set, 8, 20 + by, 8, 1, C.creelDark);
      for (let i = 0; i < 6; i++) set(9 + i, 18 + by + Math.floor(i / 3), C.creelDark);
    } else {
      rect(set, 7, 18 + by, 3, 6, C.vest);
      rect(set, 14, 18 + by, 3, 6, C.vest);
      rect(set, 7, 18 + by, 1, 6, C.vestShade);
      rect(set, 16, 18 + by, 1, 6, C.vestLight);
      rect(set, 8, 21 + by, 2, 2, C.vestShade);
      rect(set, 14, 21 + by, 2, 2, C.vestShade);
      set(14, 21 + by, C.vestLight);
      set(12, 19 + by, C.shirtShade);
      set(12, 21 + by, C.shirtShade);
      set(11, 18 + by, C.shirtLight);
    }
    rect(set, 7, 24 + by, 10, 1, C.belt);
    if (!back) set(12, 24 + by, C.hat);
    if (p.cast) {
      rect(set, 15, 14 + by, 2, 5, C.shirt);
      rect(set, 17, 13 + by, 2, 4, C.shirtShade);
      rect(set, 5, 18 + by, 2, 3, C.shirtShade);
      rect(set, 16, 12 + by, 3, 1, C.skin);
      rect(set, 5, 21 + by, 2, 1, C.skin);
    } else if (p.reel) {
      rect(set, 5, 18 + by, 2, 3, C.shirtShade);
      rect(set, 17, 18 + by, 2, 3, C.shirt);
      rect(set, 7, 21 + by, 3, 1, C.skin);
      rect(set, 14, 21 + by, 3, 1, C.skin);
      if (!back) set(11, 22 + by, C.floatStick);
    } else if (p.rod) {
      rect(set, 5, 18 + by, 2, 3, C.shirtShade);
      rect(set, 17, 18 + by, 2, 3, C.shirt);
      rect(set, 5, 21 + by, 2, 1, C.skin);
      rect(set, 17, 21 + by, 2, 1, C.skin);
    } else {
      const al = p.armL || 0;
      const ar = p.armR || 0;
      rect(set, 5, 18 + by, 2, 5 + al, C.shirtShade);
      rect(set, 17, 18 + by, 2, 5 + ar, C.shirt);
      set(18, 18 + by, C.shirtLight);
      rect(set, 5, 23 + by + al, 2, 1, C.skin);
      rect(set, 17, 23 + by + ar, 2, 1, C.skin);
    }
    rect(set, 8, 17 + hy, 8, 1, C.scarf);
    if (back) rect(set, 11, 18 + by, 2, 1, C.scarfShade);
    else {
      set(9, 18 + by, C.scarfShade);
      set(15, 17 + hy, C.scarfShade);
    }
    rect(set, 8, 11 + hy, 8, 6, back ? C.hair : C.skin);
    if (back) {
      rect(set, 8, 15 + hy, 8, 1, C.hairDark);
      rect(set, 10, 16 + hy, 4, 1, C.skin);
      set(8, 13 + hy, C.hairDark);
      set(15, 13 + hy, C.hairDark);
    } else {
      rect(set, 8, 11 + hy, 8, 1, C.skinShade);
      set(8, 12 + hy, C.hair);
      set(15, 12 + hy, C.hair);
      set(8, 13 + hy, C.hairDark);
      set(15, 13 + hy, C.hairDark);
      rect(set, 8, 14 + hy, 1, 3, C.skinShade);
      set(10, 13 + hy, p.blink ? C.skinShade : C.eye);
      set(13, 13 + hy, p.blink ? C.skinShade : C.eye);
      set(9, 14 + hy, C.blush);
      set(14, 14 + hy, C.blush);
      set(12, 14 + hy, C.skinShade);
      rect(set, 11, 15 + hy, 2, 1, p.reel ? C.blush : C.skinShade);
    }
    rect(set, 8, 5 + hy, 8, 4, C.hat);
    rect(set, 9, 4 + hy, 6, 1, C.hat);
    rect(set, 15, 5 + hy, 1, 3, C.hatShade);
    if (!back) {
      rect(set, 9, 5 + hy, 2, 1, C.hatLight);
      set(9, 6 + hy, C.hatLight);
    }
    rect(set, 8, 8 + hy, 8, 1, C.band);
    set(back ? 9 : 14, 8 + hy, C.fly);
    rect(set, 3, 9 + hy, 18, 1, C.brim);
    rect(set, 4, 10 + hy, 16, 1, back ? C.brim : C.brimUnder);
    set(3, 9 + hy, C.hatShade);
    set(20, 9 + hy, C.hatShade);
    if (!back) for (let x = 5; x < 19; x += 3) set(x, 9 + hy, C.hatLight);
    return sp;
  }
  // side view, facing left
  const stride = p.stride || 0;
  const legF = 10 - stride;
  const legB = 12 + stride;
  rect(set, legB, 25 + by, 2, 4, C.pantsDark);
  rect(set, legB, 29 + by, 3, 2, C.boot);
  rect(set, legF, 25 + by, 2, 4, C.pants);
  set(legF, 26 + by, C.pantsLight);
  rect(set, legF - 1, 29 + by, 3, 2, C.boot);
  set(legF - 1, 29 + by, C.bootLight);
  rect(set, 10, 25 + by, 4, 1, C.pants);
  rect(set, 14, 20 + by, 3, 5, C.creel);
  set(15, 21 + by, C.creelDark);
  set(15, 23 + by, C.creelDark);
  rect(set, 9, 18 + by, 6, 7, C.shirt);
  rect(set, 11, 18 + by, 4, 6, C.vest);
  rect(set, 14, 18 + by, 1, 6, C.vestShade);
  set(12, 21 + by, C.vestShade);
  rect(set, 9, 24 + by, 6, 1, C.belt);
  if (p.cast) {
    rect(set, 10, 13 + by, 2, 6, C.shirtShade);
    rect(set, 9, 12 + by, 2, 1, C.skin);
  } else if (p.reel || p.rod) {
    rect(set, 8, 19 + by, 3, 2, C.shirtShade);
    rect(set, 6, 20 + by, 2, 1, C.skin);
  } else {
    const ax = 11 - (p.armSwing || 0);
    rect(set, ax, 18 + by, 2, 5, C.shirtShade);
    rect(set, ax, 23 + by, 2, 1, C.skin);
  }
  rect(set, 9, 17 + hy, 6, 1, C.scarf);
  rect(set, 13, 17 + hy, 2, 2, C.scarfShade);
  rect(set, 8, 11 + hy, 7, 6, C.skin);
  rect(set, 13, 11 + hy, 2, 5, C.hair);
  set(14, 15 + hy, C.hairDark);
  rect(set, 8, 11 + hy, 7, 1, C.skinShade);
  set(7, 14 + hy, C.skin);
  set(9, 13 + hy, p.blink ? C.skinShade : C.eye);
  set(10, 14 + hy, C.blush);
  set(8, 16 + hy, C.skinShade);
  rect(set, 9, 5 + hy, 6, 4, C.hat);
  rect(set, 10, 4 + hy, 4, 1, C.hat);
  rect(set, 10, 5 + hy, 2, 1, C.hatLight);
  rect(set, 14, 5 + hy, 1, 3, C.hatShade);
  rect(set, 9, 8 + hy, 6, 1, C.band);
  set(13, 8 + hy, C.fly);
  rect(set, 4, 9 + hy, 15, 1, C.brim);
  rect(set, 5, 10 + hy, 13, 1, C.brimUnder);
  set(4, 9 + hy, C.hatShade);
  return sp;
}

const POSES = {
  down: [{}, { legL: 1, armL: 1, armR: -1 }, { headDy: 1, legR: 1 }, { legR: 1, armR: 1, armL: -1 }, { headDy: 1, blink: true, chest: 1 }, { rod: true }, { headDy: 1, legL: 1 }, { cast: true }, { reel: true, headDy: -1 }],
  up: [{}, { legL: 1, armL: 1, armR: -1 }, { headDy: 1, legR: 1 }, { legR: 1, armR: 1, armL: -1 }, { headDy: 1, chest: 1 }, { rod: true }, { headDy: 1, legL: 1 }, { cast: true }, { reel: true, headDy: -1 }],
  left: [{}, { stride: 2, armSwing: 2 }, { headDy: 1, stride: 1 }, { stride: -2, armSwing: -2 }, { headDy: 1, blink: true }, { rod: true }, { headDy: 1, stride: -1, armSwing: -1 }, { cast: true }, { reel: true, headDy: -1 }],
};

function blit(buf, W, sp, ox, oy, mirrorW) {
  const draw = (x, y, c) => {
    const xx = mirrorW ? mirrorW - 1 - x : x;
    const a = hx(c);
    buf[(oy + y) * W + ox + xx] = pack(a[0], a[1], a[2]);
  };
  sp.flush(draw, C.outline);
}

/** @returns {{ w:number, h:number, data: Uint8ClampedArray }} RGBA of the 216x128 angler sheet (9 x 4 cells) */
export function anglerSheet() {
  const W = ANGLER.cellW * ANGLER.cols;
  const H = ANGLER.cellH * ANGLER.rows;
  const buf = new Uint32Array(W * H);
  ANGLER.dirs.forEach((dir, row) => {
    const src = dir === 'right' ? 'left' : dir;
    POSES[src].forEach((pose, col) => {
      const sp = anglerPose(src, pose);
      blit(buf, W, sp, col * ANGLER.cellW, row * ANGLER.cellH, dir === 'right' ? ANGLER.cellW : 0);
    });
  });
  return { w: W, h: H, data: new Uint8ClampedArray(buf.buffer) };
}

function catPose(frame) {
  const sp = createSpriteMap();
  const set = sp.set;
  const ell = (cx, cy, rx, ry, c) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(x, y, c);
  };
  if (frame === 4) {
    // loaf: lying down, paws tucked, eyes half closed, tail wrapped along the front
    ell(8, 11.5, 5.5, 2.8, C.cat);
    ell(8, 12.6, 3.5, 1.4, C.catLight);
    for (let x = 3; x <= 12; x++) set(x, 14, x < 5 ? C.catDark : C.cat);
    set(13, 13, C.catDark);
    ell(5, 7.8, 3.4, 2.7, C.cat);
    set(2, 5, C.cat); set(2, 4, C.cat); set(3, 5, C.catPink);
    set(7, 5, C.cat); set(7, 4, C.cat); set(6, 5, C.catPink);
    set(3, 8, C.catDark); set(4, 8, C.catDark); set(6, 8, C.catDark); set(7, 8, C.catDark);
    set(5, 9, C.catPink);
    set(9, 9, C.catDark); set(11, 9, C.catDark); set(10, 10, C.catDark);
    return sp;
  }
  const tail = frame === 1 ? [[11, 13], [12, 13], [13, 12], [13, 11], [14, 10], [14, 9]] : frame === 5 ? [[11, 13], [12, 13], [13, 13], [14, 12], [14, 11], [13, 10]] : [[11, 13], [12, 13], [13, 13], [14, 12], [14, 11], [14, 10]];
  for (const [x, y] of tail) {
    set(x, y, C.catDark);
    set(x - 1, y, C.cat);
  }
  ell(7.5, 10.5, 4, 3.6, C.cat); // body
  ell(7.5, 11.2, 1.6, 2.4, C.catLight); // chest
  rect(set, 5, 14, 2, 1, C.catLight); // paws
  rect(set, 9, 14, 2, 1, C.catLight);
  const hx0 = frame === 3 ? -0.5 : 0; // grooming: the head bends toward the raised paw
  ell(7.5 + hx0, 5 + (frame === 3 ? 0.6 : 0), 3.6, 3, C.cat); // head
  set(4, 2, C.cat); set(4, 1, C.cat); set(5, 2, C.catPink);
  set(11, 2, C.cat); set(11, 1, C.cat); set(10, 2, C.catPink);
  set(7, 2, C.catDark); set(8, 2, C.catDark); set(7, 3, C.catDark);
  set(4, 9, C.catDark); set(11, 9, C.catDark); set(4, 11, C.catDark); set(11, 11, C.catDark);
  if (frame === 3) {
    // grooming: eyes shut, a paw raised to the mouth, a pink tongue
    set(5, 5, C.catDark); set(6, 5, C.catDark); set(9, 5, C.catDark); set(10, 5, C.catDark);
    rect(set, 8, 7, 2, 3, C.catLight);
    set(8, 6, C.catPink);
    set(9, 6, C.catPink);
  } else if (frame === 2) {
    set(5, 5, C.catDark); set(6, 5, C.catDark); set(9, 5, C.catDark); set(10, 5, C.catDark);
  } else {
    set(5, 5, C.catInk); set(10, 5, C.catInk); set(5, 4, '#fff6e0'); set(10, 4, '#fff6e0');
  }
  if (frame !== 3) {
    set(7, 6, C.catPink); set(8, 6, C.catPink);
    set(6, 7, C.catLight); set(9, 7, C.catLight);
  }
  return sp;
}

/** @returns {{ w, h, data }} RGBA of the 96x16 cat sheet (6 cells) */
export function catSheet() {
  const W = CAT.cellW * CAT.cols;
  const H = CAT.cellH;
  const buf = new Uint32Array(W * H);
  for (let f = 0; f < CAT.cols; f++) blit(buf, W, catPose(f), f * CAT.cellW, 0, 0);
  return { w: W, h: H, data: new Uint8ClampedArray(buf.buffer) };
}

/** @returns {{ w, h, data }} RGBA of the float and the "!" bubble */
export function propSheet() {
  const W = PROPS.w;
  const H = PROPS.h;
  const buf = new Uint32Array(W * H);
  const f = createSpriteMap();
  rect(f.set, 2, 1, 4, 3, C.floatRed);
  rect(f.set, 3, 0, 2, 1, C.floatRed);
  rect(f.set, 2, 4, 4, 1, C.floatWhite);
  rect(f.set, 3, 5, 2, 1, C.floatRed);
  rect(f.set, 3, 6, 2, 2, C.floatStick);
  f.set(3, 1, C.floatLight);
  blit(buf, W, f, PROPS.float.x, PROPS.float.y + 1, 0);
  const b = createSpriteMap();
  rect(b.set, 1, 1, 9, 8, C.bubble);
  rect(b.set, 2, 0, 7, 1, C.bubble);
  rect(b.set, 2, 9, 7, 1, C.bubble);
  rect(b.set, 4, 10, 2, 1, C.bubble);
  b.set(4, 11, C.bubble);
  rect(b.set, 5, 2, 1, 4, C.bubbleInk);
  rect(b.set, 4, 2, 3, 3, C.bubbleInk);
  b.set(4, 4, C.bubble);
  b.set(6, 4, C.bubble);
  rect(b.set, 5, 7, 1, 1, C.bubbleInk);
  blit(buf, W, b, PROPS.bubble.x, PROPS.bubble.y + 1, 0);
  return { w: W, h: H, data: new Uint8ClampedArray(buf.buffer) };
}

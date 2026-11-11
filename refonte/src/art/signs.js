// Sign boards of the village, painted by code into RGBA bytes (no image file): pixel-art wooden boards with an ICON (no lettering: the
// game is FR + EN). One atlas, one material, one draw call for every sign of the world. Pure and deterministic (same call = same bytes).
//   cells (SIGN.cellW x SIGN.cellH = 32 x 16 px = 2 m x 1 m at 16 px per metre), atlas 2 x 2:
//     0 shop      a gold coin with a pearl on it + a small fish  (the Boutique: you sell fish and buy gear)
//     1 workshop  a gear crossed by a hammer                       (the Atelier: repairs)
//     2 stall     a fish and an apple                             (the market stall)
//     3 landing   a hook over a wave                              (boat landing / fishing spots)

import { hx } from '../../../src/art/palette.js';

export const SIGN = Object.freeze({ cellW: 32, cellH: 16, cols: 2, rows: 2, ids: Object.freeze({ shop: 0, workshop: 1, stall: 2, landing: 3 }) });

const C = {
  ink: '#2a1c30',
  frame: '#5a3a2a',
  board: '#c49a68',
  boardLight: '#d8b07a',
  boardDark: '#a8804e',
  nail: '#7a6a5a',
  gold: '#f2c84a',
  goldLight: '#fff0a0',
  goldDark: '#c8902a',
  pearl: '#f4ecf8',
  pearlShade: '#c8b8e0',
  fish: '#e8803a',
  fishLight: '#ffb070',
  fishDark: '#b85a28',
  steel: '#9aa0b0',
  steelLight: '#d0d6e0',
  steelDark: '#5a6070',
  handle: '#8a5a3a',
  handleDark: '#5a3a2a',
  apple: '#d8483e',
  appleLight: '#ff8a7a',
  leaf: '#6aa04a',
  water: '#4a8ab0',
  waterLight: '#9ad0e8',
};

/** Icon pixels of one cell, as a map "x,y" -> colour, in cell coordinates (the board is drawn round it). */
function icon(id) {
  const px = new Map();
  const set = (x, y, c) => px.set(x + ',' + y, c);
  const disc = (cx, cy, r, c) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(x, y, c);
  };
  const fish = (x0, y0, flip = false) => {
    // 10 x 6 fish facing left (flip: right)
    const rows = ['  ####    ', ' ######  #', '#.####### ', '########  ', ' ######  #', '  ####    '];
    rows.forEach((row, j) =>
      [...row].forEach((ch, i) => {
        if (ch === ' ') return;
        const x = flip ? x0 + 9 - i : x0 + i;
        const c = ch === '.' ? C.ink : j <= 1 ? C.fishLight : j >= 4 ? C.fishDark : C.fish;
        set(x, y0 + j, c);
      })
    );
  };
  if (id === 0) {
    disc(10, 8, 4.6, C.goldDark);
    disc(9.6, 7.6, 3.9, C.gold);
    set(8, 6, C.goldLight);
    set(9, 5, C.goldLight);
    disc(10, 8, 1.6, C.pearl);
    set(11, 9, C.pearlShade);
    set(9, 7, '#ffffff');
    fish(17, 5, true);
  } else if (id === 1) {
    // gear: ring with 8 teeth
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const tx = Math.round(12 + Math.cos(ang) * 5.2);
      const ty = Math.round(8 + Math.sin(ang) * 5.2);
      set(tx, ty, C.steelDark);
      set(tx + (Math.cos(ang) > 0.3 ? -1 : Math.cos(ang) < -0.3 ? 1 : 0), ty + (Math.sin(ang) > 0.3 ? -1 : Math.sin(ang) < -0.3 ? 1 : 0), C.steel);
    }
    disc(12, 8, 4.2, C.steel);
    disc(11.5, 7.5, 2.6, C.steelLight);
    disc(12, 8, 1.3, C.board);
    // hammer, from bottom-right to top-left over the gear
    for (let i = 0; i < 9; i++) {
      set(24 - i, 13 - i, C.handle);
      set(25 - i, 13 - i, C.handleDark);
    }
    for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) set(13 + i - j, 1 + j + i, i < 2 ? C.steelLight : C.steelDark);
  } else if (id === 2) {
    fish(4, 5, false);
    disc(22, 9, 3.8, C.apple);
    disc(21, 8, 1.6, C.appleLight);
    set(22, 4, C.handleDark);
    set(22, 5, C.handleDark);
    set(23, 4, C.leaf);
    set(24, 3, C.leaf);
    set(24, 4, C.leaf);
  } else {
    // hook over a wave
    for (let y = 2; y <= 9; y++) set(16, y, C.steelDark);
    set(16, 2, C.steel);
    for (const [x, y] of [[15, 10], [14, 11], [13, 11], [12, 10], [12, 9], [11, 8], [17, 1], [15, 1]]) set(x, y, C.steelDark);
    set(12, 8, C.steelLight);
    for (let x = 4; x < 28; x++) {
      const y = 13 + Math.round(Math.sin(x * 0.8) * 1);
      set(x, y, C.water);
      if (x % 4 === 0) set(x, y - 1, C.waterLight);
    }
  }
  return px;
}

/** @returns {{ w:number, h:number, data: Uint8ClampedArray }} RGBA of the 64 x 32 sign atlas (row 0 at the top). */
export function signAtlas() {
  const W = SIGN.cellW * SIGN.cols;
  const H = SIGN.cellH * SIGN.rows;
  const data = new Uint8ClampedArray(W * H * 4);
  const put = (x, y, c) => {
    const v = hx(c);
    const i = (y * W + x) * 4;
    data[i] = v[0];
    data[i + 1] = v[1];
    data[i + 2] = v[2];
    data[i + 3] = 255;
  };
  for (let id = 0; id < 4; id++) {
    const ox = (id % SIGN.cols) * SIGN.cellW;
    const oy = Math.floor(id / SIGN.cols) * SIGN.cellH;
    const cw = SIGN.cellW;
    const ch = SIGN.cellH;
    // board: dark frame, planks with a lighter top edge and dark seams, corner nails
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        let c = C.board;
        if (x === 0 || y === 0 || x === cw - 1 || y === ch - 1) c = C.frame;
        else if (y === 1) c = C.boardLight;
        else if (y === ch - 2) c = C.boardDark;
        else if (y === 6 || y === 11) c = (x * 7 + y) % 9 === 0 ? C.boardDark : C.boardDark;
        else if ((x * 13 + y * 7) % 23 === 0) c = C.boardDark;
        put(ox + x, oy + y, c);
      }
    for (const [x, y] of [[2, 2], [cw - 3, 2], [2, ch - 3], [cw - 3, ch - 3]]) put(ox + x, oy + y, C.nail);
    // icon with a 1-pixel dark outline (only where the outline falls on the board)
    const px = icon(id);
    for (const key of px.keys()) {
      const [x, y] = key.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k2 = x + dx + ',' + (y + dy);
        const xx = x + dx;
        const yy = y + dy;
        if (!px.has(k2) && xx > 0 && yy > 0 && xx < cw - 1 && yy < ch - 1) put(ox + xx, oy + yy, C.ink);
      }
    }
    for (const [key, c] of px) {
      const [x, y] = key.split(',').map(Number);
      if (x > 0 && y > 0 && x < cw - 1 && y < ch - 1) put(ox + x, oy + y, c);
    }
  }
  return { w: W, h: H, data };
}

/** uv rectangle [u0, v0, u1, v1] of a sign cell in the atlas texture (v up, the texture is NOT flipped: row 0 of the bytes = v 0). */
export function signUV(id) {
  const u0 = ((id % SIGN.cols) * SIGN.cellW) / (SIGN.cellW * SIGN.cols);
  const u1 = u0 + 1 / SIGN.cols;
  const r = Math.floor(id / SIGN.cols);
  // flipY = false: byte row 0 is at v = 0, so the TOP of the picture (row oy) is at the smaller v
  const v0 = (r * SIGN.cellH) / (SIGN.cellH * SIGN.rows);
  const v1 = v0 + 1 / SIGN.rows;
  return [u0, v0, u1, v1];
}

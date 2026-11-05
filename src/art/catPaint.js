// The tabby cat on the pier, as small poses. Pure. The default pose (sitting in profile, eyes open, tail on the ground) is the cat of the
// approved mock-up, pixel for pixel. The other poses change only a few pixels of it (tail tip, ear, eyes, mouth, head height) or, for
// sleeping, curl it up. Poses come from core/critters.js (createCat). Sprite built in a map, outlined, then drawn at (ox, oy).

import { createSpriteMap } from './painter.js';

export const CAT_POSE = Object.freeze({ body: 'sit', tail: 0, ear: 0, eyes: 'open', mouth: 0, headDy: 0, bodyDy: 0, breath: 0 });
/** Where the cat sits on the picture, and the box (x0, y0, w, h) that holds every pose with its outline (also the lines it may touch). */
export const CAT_AT = Object.freeze([150, 183]);
export const CAT_BOX = Object.freeze([145, 176, 34, 31]);

const O = '#e8955a';
const Dk = '#c9743e';
const Lt = '#f6c08a';
const PK = '#f08aa0';
const INK = '#3a2030';

// tail on the ground, curled behind the cat; the last points move in the swish (0 = at rest, 1 and 2 = the tip lifted)
const TAIL_BASE = [[2, 16], [1, 17], [1, 18], [2, 19], [4, 20], [7, 20], [10, 20], [13, 20]];
const TAIL_END = [
  [[16, 20], [18, 19], [19, 18]],
  [[16, 20], [18, 18], [19, 16]],
  [[16, 19], [18, 17], [19, 14]],
];

function shapes(set) {
  const ell = (cx, cy, rx, ry, c) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) set(x, y, c);
      }
    }
  };
  const tri = (a, b, c, col) => {
    const y0 = Math.min(a[1], b[1], c[1]);
    const y1 = Math.max(a[1], b[1], c[1]);
    for (let y = y0; y <= y1; y++) {
      const xs = [];
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        if ((p[1] <= y && q[1] > y) || (q[1] <= y && p[1] > y)) xs.push(p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
      }
      if (xs.length >= 2) {
        const xa = Math.round(Math.min(...xs));
        const xb = Math.round(Math.max(...xs));
        for (let x = xa; x <= xb; x++) set(x, y, col);
      }
    }
  };
  return { ell, tri };
}

/** @param {object} R raster (art/raster.js)  @param {number} ox,oy position of the sprite origin  @param {object} [pose] see CAT_POSE */
export function drawCat(R, ox, oy, pose = CAT_POSE) {
  const d = { ...CAT_POSE, ...pose };
  oy += d.bodyDy;
  const { px } = R;
  const sprite = createSpriteMap();
  const set = sprite.set;
  const dk = sprite.over;
  const { ell, tri } = shapes(set);
  const hy = d.headDy;
  if (d.body === 'curl') {
    curled(R, ox, oy, d, sprite, ell, tri);
    return;
  }
  // tail
  const tail = TAIL_BASE.concat(TAIL_END[d.tail] || TAIL_END[0]);
  tail.forEach(([x, y], i, a) => {
    for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) set(x + b, y + c, i >= a.length - 2 ? Dk : i % 3 === 2 ? Dk : O);
  });
  // body: rounded back, haunch, light chest, front leg
  ell(9, 13.5, 7, 6, O);
  ell(6.5, 15.3, 5.2, 4.4, O);
  ell(13, 13, 2.8, 4.8, Lt);
  for (let y = 15; y <= 19; y++) for (let x = 13; x <= 15; x++) set(x, y, Lt);
  for (let x = 12; x <= 16; x++) set(x, 19, Lt);
  for (let x = 4; x <= 9; x++) set(x, 19, Lt);
  // head in profile toward the lake, light muzzle, two ears
  ell(16.5, 6.5 + hy, 5.3, 4.7, O);
  ell(18.2, 8.3 + hy, 3.1, 1.9, Lt);
  ell(20.7, 8 + hy, 1.9, 1.5, Lt);
  const up = d.ear === 2 ? -1 : 0;
  const flick = d.ear === 1 ? 1 : 0;
  tri([12, 4 + hy], [13, up + hy], [16, 3 + hy], O);
  tri([17, 3 + hy], [19 + flick, up + flick + hy], [21, 4 + hy - flick], O);
  set(14, 3 + hy, PK);
  set(19, 2 + hy + flick, PK);
  set(19, 3 + hy, PK);
  if (d.mouth === 2) {
    // yawn: the lower jaw drops, a dark mouth with a pink tongue
    for (const [x, y] of [[19, 10], [20, 10], [21, 10], [22, 10], [20, 11], [21, 11], [22, 11]]) set(x, y + hy, Lt);
    for (const [x, y] of [[20, 9], [21, 9], [22, 9], [20, 10], [21, 10], [22, 10]]) set(x, y + hy, '#7a2a40');
    set(21, 10 + hy, PK);
  }
  // tabby stripes
  for (const [x, y] of [[16, 3], [16, 4], [18, 3], [14, 7], [15, 8]]) dk(x, y + hy, Dk);
  for (const [x, y] of [[3, 13], [4, 13], [3, 16], [4, 16], [8, 9], [9, 9], [10, 9], [7, 18], [8, 18]]) dk(x, y, Dk);
  sprite.flush((x, y, c) => px(ox + x, oy + y, c), INK);
  // face: big green eye, pink nose, small mouth
  const ey = 5 + hy;
  switch (d.eyes) {
    case 'closed':
      px(ox + 19, oy + ey + 1, INK);
      px(ox + 20, oy + ey + 1, INK);
      break;
    case 'half':
      px(ox + 19, oy + ey, INK);
      px(ox + 20, oy + ey, INK);
      px(ox + 19, oy + ey + 1, '#b8d860');
      px(ox + 20, oy + ey + 1, '#1a1020');
      break;
    case 'happy':
      px(ox + 19, oy + ey + 1, INK);
      px(ox + 20, oy + ey, INK);
      px(ox + 21, oy + ey + 1, INK);
      break;
    case 'wide':
      px(ox + 19, oy + ey - 1, '#b8d860');
      px(ox + 20, oy + ey - 1, '#1a1020');
      px(ox + 19, oy + ey, '#b8d860');
      px(ox + 20, oy + ey, '#1a1020');
      px(ox + 19, oy + ey + 1, '#b8d860');
      px(ox + 20, oy + ey + 1, '#1a1020');
      px(ox + 19, oy + ey, '#ffffff');
      break;
    case 'down':
      px(ox + 19, oy + ey, '#b8d860');
      px(ox + 20, oy + ey, '#b8d860');
      px(ox + 19, oy + ey + 1, '#1a1020');
      px(ox + 20, oy + ey + 1, '#1a1020');
      px(ox + 19, oy + ey, '#ffffff');
      break;
    default:
      px(ox + 19, oy + ey, '#b8d860');
      px(ox + 20, oy + ey, '#1a1020');
      px(ox + 19, oy + ey + 1, '#b8d860');
      px(ox + 20, oy + ey + 1, '#1a1020');
      px(ox + 19, oy + ey, '#ffffff');
  }
  px(ox + 22, oy + 7 + hy, PK);
  if (d.mouth !== 2) px(ox + 21, oy + 9 + hy, '#5a2a38');
}

/** Curled up asleep: a low round body, the tail wrapped round the front, the head on the paws, eyes shut. `breath` raises the back by a pixel. */
function curled(R, ox, oy, d, sprite, ell, tri) {
  const { px } = R;
  const set = sprite.set;
  const dk = sprite.over;
  // tail along the ground in front, tip dark
  const tail = [[3, 20], [6, 20], [9, 20], [12, 20], [15, 20], [18, 20], [20, 19]];
  tail.forEach(([x, y], i, a) => {
    for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) set(x + b, y + c - 1, i >= a.length - 1 ? Dk : i % 3 === 2 ? Dk : O);
  });
  const rise = d.breath ? 0.8 : 0;
  ell(9, 15 - rise / 2, 9, 5 + rise / 2, O);
  ell(5.5, 15.5 - rise / 2, 5.4, 4.6 + rise / 2, O);
  for (let x = 4; x <= 18; x++) set(x, 19, x > 11 ? Lt : O);
  // head resting on the front paws
  ell(16.5, 14.2, 4.6, 3.8, O);
  ell(19.5, 16.2, 3, 1.8, Lt);
  tri([13, 12], [14, 8], [17, 11], O);
  tri([17, 11], [20, 8], [21, 13], O);
  set(14, 10, PK);
  set(20, 10, PK);
  set(20, 11, PK);
  for (const [x, y] of [[14, 12], [15, 11], [17, 11], [5, 11], [6, 10], [10, 10], [11, 10], [3, 14], [4, 14], [8, 17], [9, 17]]) dk(x, y, Dk);
  sprite.flush((x, y, c) => px(ox + x, oy + y, c), INK);
  // closed eye, nose
  px(ox + 18, oy + 14, INK);
  px(ox + 19, oy + 14, INK);
  px(ox + 21, oy + 15, PK);
}

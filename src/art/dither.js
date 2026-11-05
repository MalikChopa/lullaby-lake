// 4x4 Bayer ordered dithering (same matrix as the approved mock-up). Pure.

const B = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** True when the pixel (x, y) should take the "next" colour for a blend ratio t in [0,1]. */
export function dith(x, y, t) {
  return (B[y & 3][x & 3] + 0.5) / 16 < t;
}

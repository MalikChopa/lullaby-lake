// CPU side of the picture: one 480x270 canvas whose pixels are the frame computed by art/compose.js.
// PixiJS (or the 2D fallback) only displays it. The frame buffer is a Uint32Array view on the canvas ImageData: no copy.

import { W, H } from '../art/sceneBake.js';

export function createFrameLayer() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(W, H);
  const pixels = new Uint32Array(image.data.buffer);
  return {
    canvas,
    pixels,
    /** Copies a finished frame (Uint32Array of W*H pixels) onto the canvas. */
    put(frame) {
      pixels.set(frame);
      ctx.putImageData(image, 0, 0);
    },
  };
}

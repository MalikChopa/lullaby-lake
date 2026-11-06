// The window is not always 16:9. The picture keeps its 16:9 shape (pixel art composed for it, nothing is cropped or stretched), and the rest of
// the window is filled with a soft extension of it: the top rows of the picture are stretched up (the sky goes on), the bottom rows down (the water
// goes on); in a wide window the left and right columns are stretched sideways. A small canvas (window / 8), enlarged and blurred by CSS.
// It sits behind the picture, receives no clicks, and is redrawn a few times per second only (it is blurred: nothing moves fast there).
import { W, H } from '../art/sceneBake.js';

const K = 8; // backdrop pixels = window pixels / K

export function createBackdrop({ canvas, source, win = window }) {
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  let geo = null;
  function layout() {
    if (!ctx) return;
    const vw = Math.max(1, win.innerWidth);
    const vh = Math.max(1, win.innerHeight);
    const sw = Math.min(vw, (vh * 16) / 9);
    const sh = (sw * 9) / 16;
    const cw = Math.max(2, Math.ceil(vw / K));
    const ch = Math.max(2, Math.ceil(vh / K));
    const tall = vh - sh > 2; // bars above and below
    const wide = vw - sw > 2; // bars left and right
    canvas.width = cw;
    canvas.height = ch;
    canvas.hidden = !(tall || wide);
    geo = { cw, ch, tall, wide, x0: (vw - sw) / 2 / K, y0: (vh - sh) / 2 / K, w: sw / K, h: sh / K };
    update();
  }
  function update() {
    if (!ctx || !geo || canvas.hidden) return;
    const { cw, ch, x0, y0, w, h } = geo;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(source, 0, 0, W, H, x0, y0, w, h); // under the picture: the blur has the right colours to mix with at the seam
    if (geo.tall) {
      ctx.drawImage(source, 0, 0, W, 4, 0, 0, cw, y0 + 0.5);
      ctx.drawImage(source, 0, H - 6, W, 6, 0, y0 + h - 0.5, cw, ch - (y0 + h) + 0.5); // the last rows, squeezed together: the piles of the pier smear into the colour of the water
    }
    if (geo.wide) {
      ctx.drawImage(source, 0, 0, 6, H, 0, 0, x0 + 0.5, ch);
      ctx.drawImage(source, W - 6, 0, 6, H, x0 + w - 0.5, 0, cw - (x0 + w) + 0.5, ch);
    }
  }
  layout();
  if (win.addEventListener) win.addEventListener('resize', layout);
  let n = 0;
  return {
    layout,
    /** Called after each picture: redraws every 6th time (about 10 times per second). */
    tick() {
      if (++n % 6 === 0) update();
    },
    update,
  };
}
